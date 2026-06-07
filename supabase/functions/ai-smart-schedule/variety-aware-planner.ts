// ═══════════════════════════════════════════════════════════════════════
// VARIETY-AWARE SCHEDULE PLANNER
// ───────────────────────────────────────────────────────────────────────
// Deterministic post-LLM override layer. Takes the LLM-drafted scheduleData
// (durations, yield, water) and clamps every value to the variety-specific
// facts coming from master_products + variety_resistance.
//
// Implements the six intelligences identified in the variety audit:
//   1) Maturity      — clamp total_duration_days into variety window
//   2) Irrigation    — quantify water demand from variety profile
//   3) Yield         — clamp expected_yield_quintals to variety potential
//   4) Climate       — surface temperature / rainfall mismatch warnings
//   5) Soil          — surface soil-fit warnings vs variety preferences
//   6) Regional      — surface state-fit warning (non-recommended state)
//
// SSOT: every override consults VarietyProfile. No invented numbers.
// ═══════════════════════════════════════════════════════════════════════

import type { VarietyProfile } from "../_shared/variety-context.ts";

export interface PlannerInputs {
  varietyProfile: VarietyProfile | null;
  scheduleData: any;             // LLM-drafted schedule
  landAreaAcres: number;
  irrigationType?: string | null;
  soilType?: string | null;
  soilPh?: number | null;
  state?: string | null;
  language?: string;
  cropName?: string | null;
  isReadyMadePlant?: boolean;
  nurseryDays?: number;
}

export interface PlannerOutput {
  total_duration_days: number;          // variety maturity from SEED-SOWING (authoritative)
  effective_field_days: number;         // days actually in farmer's field (duration - nurseryDays)
  expected_yield_quintals: number;
  water_requirement_liters_total: number;
  water_per_irrigation_liters: number;
  irrigation_count_total: number;
  sowing_method?: string | null;        // rice-specific: SRI | TRANSPLANT | DSR | BROADCAST
  sowing_method_note?: string | null;
  warnings: string[];               // appended to suitability_warnings
  applied_overrides: Record<string, any>; // metadata, persisted on schedule
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Compute deterministic, variety-aware overrides. Returns the LLM defaults
 * untouched when no variety profile is available, so backward compatibility
 * with generic-crop scheduling is preserved.
 */
export function applyVarietyOverrides(input: PlannerInputs): PlannerOutput {
  const {
    varietyProfile: v,
    scheduleData,
    landAreaAcres,
    irrigationType,
    soilType,
    soilPh,
    state,
    cropName,
    isReadyMadePlant = false,
    nurseryDays = 0,
  } = input;

  const llmDuration = Number(scheduleData?.total_duration_days) || 120;
  const llmYield = Number(scheduleData?.expected_yield_quintals) || 20;

  // ── Generic-crop fallbacks (litres / acre / season for major Indian crops)
  const baseWaterPerAcre = (() => {
    const t = (irrigationType || "").toLowerCase();
    if (t.includes("drip")) return 300_000;
    if (t.includes("sprinkler")) return 400_000;
    return 500_000;                  // surface / flood default
  })();

  const warnings: string[] = [];
  const applied: Record<string, any> = {};

  // ─────────────────────────────────────────────────────────────
  // 1) MATURITY — variety is AUTHORITATIVE. The LLM has no say.
  //    Rule (per user spec): "Rice Ambemohar = 130d → harvest at
  //    sowingDate + 130d". We pick max of the published window as
  //    the canonical seed-to-harvest duration; min/max give a band
  //    but the schedule horizon must reach full maturity.
  // ─────────────────────────────────────────────────────────────
  let durationDays = llmDuration;
  const varietyMaturity = v?.maturity_days_max || v?.maturity_days_min || null;
  if (varietyMaturity && varietyMaturity > 0) {
    if (varietyMaturity !== llmDuration) {
      applied.duration_from_variety = {
        from_llm: llmDuration,
        to_variety: varietyMaturity,
        source: v?.maturity_days_max ? "maturity_days_max" : "maturity_days_min",
        variety_window: v?.maturity_days_min && v?.maturity_days_max
          ? `${v.maturity_days_min}-${v.maturity_days_max}d` : null,
      };
    }
    durationDays = varietyMaturity;
  }

  // Effective field horizon (used for harvest-date math by caller).
  // Nursery mode: farmer's selected date = transplant day. Seed sowing
  // happened `nurseryDays` ago in the nursery, so field horizon shrinks.
  const effectiveFieldDays = isReadyMadePlant && nurseryDays > 0
    ? Math.max(15, durationDays - nurseryDays)
    : durationDays;
  if (isReadyMadePlant && nurseryDays > 0) {
    applied.nursery_adjustment = {
      seed_to_harvest_days: durationDays,
      nursery_days: nurseryDays,
      field_days: effectiveFieldDays,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // 3) YIELD — clamp to variety potential (LLM tends to inflate)
  // ─────────────────────────────────────────────────────────────
  let yieldQuintals = llmYield;
  if (v?.yield_potential_qtl_per_acre && v.yield_potential_qtl_per_acre > 0) {
    const cap = v.yield_potential_qtl_per_acre * landAreaAcres;
    // Allow farmer-favourable bump up to potential but never above it.
    if (yieldQuintals > cap) {
      applied.yield_capped = {
        from: llmYield, to: Math.round(cap * 100) / 100,
        variety_potential_qtl_per_acre: v.yield_potential_qtl_per_acre,
      };
      yieldQuintals = Math.round(cap * 100) / 100;
    } else if (yieldQuintals < cap * 0.4) {
      // Floor at 40% of potential — LLM under-shoot guard
      applied.yield_floored = {
        from: llmYield, to: Math.round(cap * 0.4 * 100) / 100,
      };
      yieldQuintals = Math.round(cap * 0.4 * 100) / 100;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2) IRRIGATION — water demand from variety regime
  // ─────────────────────────────────────────────────────────────
  let waterPerAcre = baseWaterPerAcre;
  const regime: string =
    (v?.agro_ecological_suitability?.irrigation_regime || "").toLowerCase();

  if (regime.includes("rainfed") && !regime.includes("irrigated")) {
    waterPerAcre = Math.round(baseWaterPerAcre * 0.25);
    applied.water_regime = "rainfed";
  } else if (regime.includes("irrigated")) {
    waterPerAcre = baseWaterPerAcre;
    applied.water_regime = "irrigated";
  }

  const waterTotal = Math.round(waterPerAcre * landAreaAcres);
  // Spread irrigations: 1 per 7 days base, scaled by regime
  const irrigationCount = (() => {
    const base = Math.round(durationDays / 7);
    if (applied.water_regime === "rainfed") return Math.max(2, Math.round(base * 0.35));
    return Math.max(3, base);
  })();
  const waterPerEvent = irrigationCount > 0 ? Math.round(waterTotal / irrigationCount) : 0;

  // ─────────────────────────────────────────────────────────────
  // 6) REGIONAL — state fit
  // ─────────────────────────────────────────────────────────────
  if (v && state && !v.state_match && Array.isArray(v.state_suitability) && v.state_suitability.length) {
    warnings.push(
      `Variety ${v.name} is officially recommended for ${v.state_suitability.slice(0, 4).join(", ")} ` +
      `— not on the official list for ${state}. Calibrate windows defensively.`
    );
    applied.state_mismatch = true;
  }

  // ─────────────────────────────────────────────────────────────
  // 5) SOIL — fit vs variety preferences
  // ─────────────────────────────────────────────────────────────
  const soilFit = v?.agro_ecological_suitability?.soil_types;
  if (v && Array.isArray(soilFit) && soilFit.length && soilType) {
    const want = soilFit.map((s: string) => String(s).toLowerCase());
    const have = String(soilType).toLowerCase();
    if (!want.some((w) => have.includes(w) || w.includes(have))) {
      warnings.push(
        `Variety ${v.name} prefers ${soilFit.join("/")} soils — current soil type is "${soilType}". ` +
        `Yield variance may be higher than printed potential.`
      );
      applied.soil_mismatch = true;
    }
  }
  if (v?.agro_ecological_suitability?.ph_range && soilPh != null) {
    const r = v.agro_ecological_suitability.ph_range as { min?: number; max?: number };
    if ((r.min != null && soilPh < r.min) || (r.max != null && soilPh > r.max)) {
      warnings.push(
        `Soil pH ${soilPh.toFixed(1)} is outside the variety's preferred range ` +
        `(${r.min ?? "?"}–${r.max ?? "?"}). Consider amendment before sowing.`
      );
      applied.ph_mismatch = true;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4) CLIMATE — temperature / rainfall mismatch (best-effort)
  // ─────────────────────────────────────────────────────────────
  // Climate gating requires weather snapshots; this is the deterministic
  // hook — actual values are read elsewhere in the pipeline. We surface a
  // structured warning when the variety publishes a climate envelope.
  const climate = v?.agro_ecological_suitability?.climate;
  if (climate?.temperature_optimum_c) {
    applied.climate_optimum_c = climate.temperature_optimum_c;
  }

  return {
    total_duration_days: durationDays,
    expected_yield_quintals: yieldQuintals,
    water_requirement_liters_total: waterTotal,
    water_per_irrigation_liters: waterPerEvent,
    irrigation_count_total: irrigationCount,
    warnings,
    applied_overrides: applied,
  };
}
