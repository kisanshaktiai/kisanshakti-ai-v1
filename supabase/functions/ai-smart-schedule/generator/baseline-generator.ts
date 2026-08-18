// CHANGE LOG
// 2026-08-18 18:20 UTC — Phase A: every task now carries stage_uuid (crop_stage_master.id) alongside
//   stage_key; unresolvable stage labels stay null and add the "task_stage_unmappable" gap.
// 2026-08-18 15:45 UTC — hardened the fertilizer split loop: malformed splits skipped with a named gap,
//   dasFromSplit guarded, and splits with a non-computable dose are recorded instead of emitting null-dose tasks.
// 2026-08-17 14:02 UTC — Phase 2: created day-0 baseline generator. Builds the whole schedule
//   from database rows only. Any missing source is reported as a coverage gap — never invented.
// 2026-08-18 15:25 UTC — 546 fix: guarded the irrigation expansion loop (interval must be >=1,
//   valid DAS range, max 200 events per guideline row) — a 0-interval DB row looped forever
//   and exhausted the edge worker memory.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import type { ResolvedInputs } from "../db/resolve-inputs.ts";
import {
  getStages,
  getSeedRate,
  getFertilizerPlan,
  getIrrigationGuidelines,
  getFieldActionRules,
  getBannedChemicals,
  getLaborRate,
  getInputPrice,
  type Provenance,
  type StageRow,
} from "../db/agronomy-repo.ts";

export const GENERATOR_VERSION = "baseline-db-ssot@1.0.0";

export interface BaselineTask {
  task_name: string;
  task_type: string;
  task_description: string;
  days_from_sowing: number;
  anchor_type: "DAS" | "DAT" | "STAGE" | "GDD";
  anchor_stage: string | null;
  gdd_target: number | null;
  stage_key: string | null;
  stage_uuid: string | null;
  stage_name: string | null;
  stage_order: number;
  priority: string;
  weather_dependent: boolean;
  quantity: { value: number; unit: string } | null;
  estimated_cost: number | null;
  rule_ids: string[];
  confidence: number | null;
  source_refs: Provenance[];
  instructions: string[];
}

export interface BaselineResult {
  tasks: BaselineTask[];
  gaps: string[];
  coverage: Record<string, boolean>;
  totals: {
    seed_kg: number | null;
    n_kg: number | null;
    p_kg: number | null;
    k_kg: number | null;
    water_mm: number | null;
    duration_days: number | null;
    estimated_cost: number | null;
  };
  provenance: Provenance[];
  generator_version: string;
}

const priorityFromRule = (p: number | null): string =>
  p == null ? "medium" : p >= 90 ? "critical" : p >= 70 ? "high" : p >= 40 ? "medium" : "low";

function stageOrderOf(stages: StageRow[], stageCode: string | null): number {
  if (!stageCode) return 0;
  const idx = stages.findIndex(
    (s) => (s.stage_code || s.growth_stage || "").toLowerCase() === stageCode.toLowerCase(),
  );
  return idx >= 0 ? idx + 1 : 0;
}

function stageForDas(stages: StageRow[], das: number): StageRow | null {
  return (
    stages.find((s) => s.das_min != null && s.das_max != null && das >= s.das_min && das <= s.das_max) || null
  );
}

/** Read a DAS anchor out of a DB split-schedule entry without assuming any agronomy. */
function dasFromSplit(split: Record<string, unknown>, stages: StageRow[]): { das: number | null; stage: StageRow | null } {
  if (!split || typeof split !== "object") return { das: null, stage: null };
  const dasKeys = ["das", "day", "days", "days_after_sowing", "dap", "das_start"];
  for (const k of dasKeys) {
    const v = split[k];
    if (v != null && !isNaN(Number(v))) {
      const das = Number(v);
      return { das, stage: stageForDas(stages, das) };
    }
  }
  const stageKeys = ["stage", "stage_code", "growth_stage", "timing"];
  for (const k of stageKeys) {
    const v = split[k];
    if (typeof v === "string") {
      const stage = stages.find(
        (s) =>
          (s.stage_code || "").toLowerCase() === v.toLowerCase() ||
          (s.growth_stage || "").toLowerCase() === v.toLowerCase(),
      );
      if (stage) return { das: stage.das_min ?? null, stage };
    }
  }
  return { das: null, stage: null };
}

export async function generateBaseline(
  supabase: SupabaseClient,
  inputs: ResolvedInputs,
): Promise<BaselineResult> {
  const gaps: string[] = [...inputs.gaps];
  const coverage: Record<string, boolean> = {};
  const provenance: Provenance[] = [];
  const tasks: BaselineTask[] = [];

  if (!inputs.cropCode) {
    return {
      tasks: [],
      gaps: [...gaps, "cannot_generate_without_crop_code"],
      coverage: { stages: false, seed: false, fertilizer: false, irrigation: false, field_actions: false },
      totals: { seed_kg: null, n_kg: null, p_kg: null, k_kg: null, water_mm: null, duration_days: null, estimated_cost: null },
      provenance,
      generator_version: GENERATOR_VERSION,
    };
  }

  const areaAcres = inputs.landAreaAcres;
  const areaHa = inputs.landAreaHa;

  // ── Stages (phenology spine) ───────────────────────────────────────────────
  const stages = await getStages(supabase, inputs.cropCode, inputs.cropCycle, inputs.cultivationMethod);
  coverage.stages = stages.length > 0;
  if (!stages.length) gaps.push("crop_stage_master_no_rows");


  const durationDays = stages.reduce((max, s) => Math.max(max, s.das_max ?? 0), 0) || null;

  // ── Seed / planting task ───────────────────────────────────────────────────
  const seed = await getSeedRate(supabase, inputs.varietyId, inputs.cultivationMethod);
  coverage.seed = !!seed;
  let seedKg: number | null = null;
  if (!seed) {
    gaps.push("seed_rate_unavailable");
  } else if (areaAcres == null) {
    gaps.push("seed_quantity_not_computed_missing_area");
  } else {
    seedKg = Number((seed.kgPerAcre * areaAcres).toFixed(2));
    provenance.push(seed.provenance);
    const sowStage = stages.find((s) => (s.das_min ?? 0) <= 0) || stages[0] || null;
    tasks.push({
      task_name: "Sowing / planting",
      task_type: "planting",
      task_description: seed.rationale || "",
      days_from_sowing: 0,
      anchor_type: "DAS",
      anchor_stage: sowStage?.stage_code || sowStage?.growth_stage || null,
      gdd_target: sowStage?.gdd_min ?? null,
      stage_key: sowStage?.stage_code || null,
      stage_uuid: sowStage?.id || null,
      stage_name: sowStage?.growth_stage || null,
      stage_order: 1,
      priority: "critical",
      weather_dependent: true,
      quantity: { value: seedKg, unit: "kg" },
      estimated_cost: null,
      rule_ids: [],
      confidence: 0.9,
      source_refs: [seed.provenance],
      instructions: [],
    });
  }

  // ── Fertilizer split tasks ─────────────────────────────────────────────────
  const fert = await getFertilizerPlan(supabase, inputs.cropCode, inputs.regionCode, inputs.soilFertilityClass);
  coverage.fertilizer = !!fert && fert.splits.length > 0;
  let nKg: number | null = null, pKg: number | null = null, kKg: number | null = null;
  if (!fert) {
    gaps.push("fertilizer_recommendation_master_no_row");
  } else {
    provenance.push(fert.provenance);
    if (areaHa == null) {
      gaps.push("fertilizer_quantity_not_computed_missing_area");
    } else {
      nKg = fert.n_kg_ha != null ? Number((fert.n_kg_ha * areaHa).toFixed(2)) : null;
      pKg = fert.p2o5_kg_ha != null ? Number((fert.p2o5_kg_ha * areaHa).toFixed(2)) : null;
      kKg = fert.k2o_kg_ha != null ? Number((fert.k2o_kg_ha * areaHa).toFixed(2)) : null;
    }
    if (fert.gaps?.length) gaps.push(...fert.gaps);
    if (!fert.splits.length) gaps.push("fertilizer_split_schedule_missing");

    for (const split of fert.splits) {
      if (!split || typeof split !== "object" || Array.isArray(split)) {
        gaps.push("fertilizer_split_malformed");
        continue;
      }
      let das: number | null = null;
      let stage: StageRow | null = null;
      try {
        ({ das, stage } = dasFromSplit(split, stages));
      } catch {
        gaps.push("fertilizer_split_malformed");
        continue;
      }
      if (das == null) {
        gaps.push("fertilizer_split_without_timing_skipped");
        continue;
      }
      const fractionRaw = split.fraction ?? split.share ?? split.percent ?? split.pct;
      const fraction =
        fractionRaw != null && !isNaN(Number(fractionRaw))
          ? Number(fractionRaw) > 1
            ? Number(fractionRaw) / 100
            : Number(fractionRaw)
          : null;
      const nutrient = String(split.nutrient ?? split.name ?? "NPK");
      const qtyBase = nutrient.toUpperCase().startsWith("N") ? nKg : nutrient.toUpperCase().startsWith("P") ? pKg : nutrient.toUpperCase().startsWith("K") ? kKg : null;
      const qty = fraction != null && qtyBase != null ? Number((qtyBase * fraction).toFixed(2)) : null;
      if (qty == null) {
        // Never emit a task with an unknown dose — record the gap and move on.
        gaps.push("fertilizer_split_dose_not_computable");
        continue;
      }

      tasks.push({
        task_name: `Fertilizer application (${nutrient})`,
        task_type: "fertilizer",
        task_description: String(split.note ?? split.description ?? ""),
        days_from_sowing: das,
        anchor_type: stage ? "STAGE" : "DAS",
        anchor_stage: stage?.stage_code || stage?.growth_stage || null,
        gdd_target: stage?.gdd_min ?? null,
        stage_key: stage?.stage_code || null,
        stage_uuid: stage?.id || null,
        stage_name: stage?.growth_stage || null,
        stage_order: stageOrderOf(stages, stage?.stage_code || null),
        priority: "high",
        weather_dependent: true,
        quantity: { value: qty, unit: "kg" },
        estimated_cost: null,
        rule_ids: [],
        confidence: fert.provenance.confidence ?? null,
        source_refs: [fert.provenance],
        instructions: [],
      });
    }
  }

  // ── Irrigation tasks (stage-wise, DB intervals only) ───────────────────────
  const irrigation = await getIrrigationGuidelines(supabase, inputs.cropCode, inputs.varietyId);
  coverage.irrigation = irrigation.length > 0;
  if (!irrigation.length) gaps.push("crop_baseline_guidelines_v2_no_irrigation_rows");
  let waterMm = 0;
  for (const g of irrigation) {
    if (g.waterMm != null) waterMm += g.waterMm;
    if (g.intervalDays == null || g.dasStart == null || g.dasEnd == null) continue;
    // Guard: a 0/negative/NaN interval in the DB row would loop forever and blow the
    // worker memory limit (546 WORKER_RESOURCE_LIMIT). Skip the row and report a gap.
    const step = Number(g.intervalDays);
    if (!Number.isFinite(step) || step < 1) {
      gaps.push("irrigation_interval_invalid_row_skipped");
      continue;
    }
    if (!Number.isFinite(g.dasStart) || !Number.isFinite(g.dasEnd) || g.dasEnd < g.dasStart) {
      gaps.push("irrigation_das_range_invalid_row_skipped");
      continue;
    }
    provenance.push(g.provenance);
    const stage = stages.find(
      (s) => (s.growth_stage || "").toLowerCase() === String(g.growthStage ?? "").toLowerCase(),
    ) || stageForDas(stages, g.dasStart);
    const MAX_EVENTS = 200;
    let events = 0;
    for (let das = g.dasStart; das <= g.dasEnd && events < MAX_EVENTS; das += step, events++) {

      tasks.push({
        task_name: "Irrigation",
        task_type: "irrigation",
        task_description: "",
        days_from_sowing: das,
        anchor_type: stage ? "STAGE" : "DAS",
        anchor_stage: stage?.stage_code || g.growthStage || null,
        gdd_target: stage?.gdd_min ?? null,
        stage_key: stage?.stage_code || null,
        stage_uuid: stage?.id || null,
        stage_name: stage?.growth_stage || g.growthStage || null,
        stage_order: stageOrderOf(stages, stage?.stage_code || null),
        priority: stage?.is_moisture_critical ? "critical" : "high",
        weather_dependent: true,
        quantity: g.waterMm != null ? { value: g.waterMm, unit: "mm" } : null,
        estimated_cost: null,
        rule_ids: [],
        confidence: null,
        source_refs: [g.provenance],
        instructions: [],
      });
    }
  }

  // ── Field-action rules (scouting, protection, operations) ──────────────────
  const rules = await getFieldActionRules(supabase, inputs.cropCode);
  const banned = await getBannedChemicals(supabase);
  coverage.field_actions = rules.length > 0;
  if (!rules.length) gaps.push("decision_rules_no_field_actions");

  for (const rule of rules) {
    const chem = String(rule.chemical_class ?? "").toLowerCase();
    if (chem && banned.has(chem)) {
      gaps.push(`rule_skipped_banned_chemical:${rule.rule_id}`);
      continue;
    }
    const stageList: string[] = Array.isArray(rule.stage_applicable)
      ? (rule.stage_applicable as string[])
      : rule.stage_applicable
        ? [String(rule.stage_applicable)]
        : [];
    const matched = stages.filter((s) =>
      stageList.some(
        (sa) =>
          sa &&
          ((s.stage_code || "").toLowerCase() === sa.toLowerCase() ||
            (s.growth_stage || "").toLowerCase() === sa.toLowerCase()),
      ),
    );
    if (!matched.length) continue;

    for (const stage of matched) {
      const das = stage.das_min ?? null;
      if (das == null) continue;
      tasks.push({
        task_name: rule.action_text || rule.category || rule.rule_id,
        task_type: rule.category || rule.action_type || "advisory",
        task_description: rule.action_text || "",
        days_from_sowing: das,
        anchor_type: "STAGE",
        anchor_stage: stage.stage_code || stage.growth_stage,
        gdd_target: stage.gdd_min ?? null,
        stage_key: stage.stage_code,
        stage_uuid: stage.id || null,
        stage_name: stage.growth_stage,
        stage_order: stageOrderOf(stages, stage.stage_code),
        priority: priorityFromRule(rule.priority),
        weather_dependent: true,
        quantity: null,
        estimated_cost: null,
        rule_ids: [rule.rule_id],
        confidence: null,
        source_refs: [{ table: "decision_rules", row_id: rule.rule_id, source: rule.scientific_source ?? null }],
        instructions: rule.phi_days != null ? [`PHI: ${rule.phi_days} days`] : [],
      });
    }
  }

  // ── Costing (only from priced DB rows) ─────────────────────────────────────
  const labor = await getLaborRate(supabase, inputs.state, null);
  coverage.labor_rate = !!labor;
  if (!labor) gaps.push("labor_rates_no_row");
  let estimatedCost: number | null = null;
  for (const t of tasks) {
    if (t.quantity && t.task_type === "fertilizer") {
      const price = await getInputPrice(supabase, t.task_name.includes("N") ? "UREA" : "NPK", inputs.state);
      if (price) {
        t.estimated_cost = Number((price.price * t.quantity.value).toFixed(2));
        t.source_refs.push(price.provenance);
        estimatedCost = (estimatedCost ?? 0) + t.estimated_cost;
      }
    }
  }
  if (estimatedCost == null) gaps.push("input_prices_no_rows_cost_not_estimated");

  tasks.sort((a, b) => a.days_from_sowing - b.days_from_sowing || a.stage_order - b.stage_order);

  // A task labelled with a stage that could not be resolved to a crop_stage_master
  // row is reported as a gap — the stage link is left null, never invented.
  if (tasks.some((t) => t.stage_key && !t.stage_uuid)) gaps.push("task_stage_unmappable");

  return {
    tasks,
    gaps: [...new Set(gaps)],
    coverage,
    totals: {
      seed_kg: seedKg,
      n_kg: nKg,
      p_kg: pKg,
      k_kg: kKg,
      water_mm: waterMm > 0 ? waterMm : null,
      duration_days: durationDays,
      estimated_cost: estimatedCost,
    },
    provenance,
    generator_version: GENERATOR_VERSION,
  };
}
