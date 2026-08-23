// CHANGE LOG
// 2026-08-18 15:45 UTC — getFertilizerPlan: JSON.parse text-stored split_schedule (was always []);
//   unparseable payloads report a "fertilizer_split_schedule_unparseable" gap instead of failing silently.
// 2026-08-17 13:58 UTC — Phase 2: created DB-only agronomy repository. Every agronomic number
//   returned here comes from a database row and carries provenance. No constants, no fallbacks.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface Provenance {
  table: string;
  row_id?: string | null;
  source?: string | null;
  authority?: string | null;
  confidence?: number | null;
}

export interface StageRow {
  id: string;
  crop_code: string;
  growth_stage: string;
  stage_code: string | null;
  das_min: number | null;
  das_max: number | null;
  das_reference: string | null;
  gdd_min: number | null;
  gdd_max: number | null;
  base_temperature_c: number | null;
  cultivation_method: string | null;
  crop_cycle: string | null;
  is_moisture_critical: boolean | null;
  kc_coefficient: number | null;
  boundary_grace_days: number | null;
}

export async function getStages(
  supabase: SupabaseClient,
  cropCode: string,
  cropCycle: string | null,
  cultivationMethod: string | null,
): Promise<StageRow[]> {
  let q = supabase
    .from("crop_stage_master")
    .select(
      "id, crop_code, growth_stage, stage_code, das_min, das_max, das_reference, gdd_min, gdd_max, base_temperature_c, cultivation_method, crop_cycle, is_moisture_critical, kc_coefficient, boundary_grace_days",
    )
    .eq("crop_code", cropCode)
    .eq("is_active", true)
    .order("das_min", { ascending: true, nullsFirst: true });
  if (cropCycle) q = q.or(`crop_cycle.eq.${cropCycle},crop_cycle.is.null`);
  const { data } = await q;
  let rows = (data || []) as StageRow[];
  if (cultivationMethod) {
    const scoped = rows.filter(
      (r) => !r.cultivation_method || r.cultivation_method.toLowerCase() === cultivationMethod.toLowerCase(),
    );
    if (scoped.length) rows = scoped;
  }
  return rows;
}

export interface SeedRateResult {
  kgPerAcre: number;
  rationale: string | null;
  provenance: Provenance;
}

export async function getSeedRate(
  supabase: SupabaseClient,
  varietyId: string | null,
  cultivationMethod: string | null,
): Promise<SeedRateResult | null> {
  if (!varietyId || !cultivationMethod) return null;

  // Preferred: the DB's own seed-rate function (TGW / plant-population based)
  const { data: rpc } = await supabase.rpc("fn_calculate_seed_rate", {
    p_variety_id: varietyId,
    p_cultivation_method: cultivationMethod,
  });
  const r = Array.isArray(rpc) ? rpc[0] : rpc;
  if (r?.seed_rate_kg_per_acre != null) {
    return {
      kgPerAcre: Number(r.seed_rate_kg_per_acre),
      rationale: r.rationale ?? null,
      provenance: { table: "fn_calculate_seed_rate", source: r.tgw_source ?? null },
    };
  }

  // Fallback (still DB): curated agronomy table
  const { data: vca } = await supabase
    .from("variety_cultivation_agronomy")
    .select("id, seed_rate_kg_per_acre_min, seed_rate_kg_per_acre_max, seed_rate_rationale, source, evidence_tier")
    .eq("variety_id", varietyId)
    .eq("cultivation_method", cultivationMethod)
    .eq("is_active", true)
    .maybeSingle();
  const min = vca?.seed_rate_kg_per_acre_min != null ? Number(vca.seed_rate_kg_per_acre_min) : null;
  const max = vca?.seed_rate_kg_per_acre_max != null ? Number(vca.seed_rate_kg_per_acre_max) : null;
  if (min == null && max == null) return null;
  return {
    kgPerAcre: min != null && max != null ? (min + max) / 2 : (min ?? max) as number,
    rationale: vca?.seed_rate_rationale ?? null,
    provenance: { table: "variety_cultivation_agronomy", row_id: vca?.id, source: vca?.source ?? null },
  };
}

export interface FertilizerPlan {
  n_kg_ha: number | null;
  p2o5_kg_ha: number | null;
  k2o_kg_ha: number | null;
  splits: Array<Record<string, unknown>>;
  gaps: string[];
  provenance: Provenance;
}

export async function getFertilizerPlan(
  supabase: SupabaseClient,
  cropCode: string,
  regionCode: string | null,
  fertilityClass: string | null,
): Promise<FertilizerPlan | null> {
  const { data } = await supabase
    .from("fertilizer_recommendation_master")
    .select("id, crop_code, region_code, soil_fertility_class, n_kg_ha, p2o5_kg_ha, k2o_kg_ha, split_schedule, source, authority, confidence")
    .ilike("crop_code", cropCode);

  const rows = data || [];
  if (!rows.length) return null;

  const score = (r: Record<string, unknown>) =>
    (regionCode && String(r.region_code ?? "").toLowerCase() === regionCode.toLowerCase() ? 2 : 0) +
    (fertilityClass && String(r.soil_fertility_class ?? "").toLowerCase() === fertilityClass.toLowerCase() ? 2 : 0) +
    (r.region_code == null ? 1 : 0);

  const best = [...rows].sort((a, b) => score(b) - score(a))[0];
  const gaps: string[] = [];

  // split_schedule is stored as text (a JSON string) in the DB, so parse it before
  // normalizing. A parse failure is reported as a visible gap, never silently dropped.
  let splitParsed: unknown = best.split_schedule;
  if (typeof splitParsed === "string") {
    const trimmed = splitParsed.trim();
    if (!trimmed) {
      splitParsed = null;
    } else {
      try {
        splitParsed = JSON.parse(trimmed);
      } catch {
        splitParsed = null;
        gaps.push("fertilizer_split_schedule_unparseable");
      }
    }
  }
  const splits = Array.isArray(splitParsed)
    ? splitParsed
    : splitParsed && typeof splitParsed === "object"
      ? Object.values(splitParsed)
      : [];

  return {
    n_kg_ha: best.n_kg_ha != null ? Number(best.n_kg_ha) : null,
    p2o5_kg_ha: best.p2o5_kg_ha != null ? Number(best.p2o5_kg_ha) : null,
    k2o_kg_ha: best.k2o_kg_ha != null ? Number(best.k2o_kg_ha) : null,
    splits: splits as Array<Record<string, unknown>>,
    gaps,
    provenance: {
      table: "fertilizer_recommendation_master",
      row_id: best.id,
      source: best.source ?? null,
      authority: best.authority ?? null,
      confidence: best.confidence != null ? Number(best.confidence) : null,
    },
  };
}

export interface IrrigationGuideline {
  stageId: string | null;
  growthStage: string | null;
  dasStart: number | null;
  dasEnd: number | null;
  intervalDays: number | null;
  waterMm: number | null;
  provenance: Provenance;
}

export async function getIrrigationGuidelines(
  supabase: SupabaseClient,
  cropCode: string,
  varietyId: string | null,
): Promise<IrrigationGuideline[]> {
  const { data } = await supabase
    .from("crop_baseline_guidelines_v2")
    .select("id, crop_code, growth_stage, das_start, das_end, irrigation_interval_days, water_requirement_mm, variety_id, stage_master_id, source_reference")
    .ilike("crop_code", cropCode)
    .eq("is_active", true)
    .order("das_start", { ascending: true, nullsFirst: true });

  let rows = data || [];
  if (varietyId) {
    const scoped = rows.filter((r: Record<string, unknown>) => !r.variety_id || r.variety_id === varietyId);
    if (scoped.length) rows = scoped;
  }

  return rows
    .filter((r: Record<string, unknown>) => r.irrigation_interval_days != null || r.water_requirement_mm != null)
    .map((r: Record<string, unknown>) => ({
      stageId: (r.stage_master_id as string) ?? null,
      growthStage: (r.growth_stage as string) ?? null,
      dasStart: r.das_start != null ? Number(r.das_start) : null,
      dasEnd: r.das_end != null ? Number(r.das_end) : null,
      intervalDays: r.irrigation_interval_days != null ? Number(r.irrigation_interval_days) : null,
      waterMm: r.water_requirement_mm != null ? Number(r.water_requirement_mm) : null,
      provenance: { table: "crop_baseline_guidelines_v2", row_id: r.id as string, source: (r.source_reference as string) ?? null },
    }));
}

export interface FieldActionRule {
  rule_id: string;
  category: string | null;
  action_type: string | null;
  action_text: string | null;
  stage_applicable: unknown;
  priority: number | null;
  phi_days: number | null;
  chemical_class: string | null;
  scientific_source: string | null;
  biological_group: string | null;
}

/**
 * Field-action rules for the crop. Selection is DB-driven: only rules explicitly flagged
 * `requires_field_action` AND classified as true scheduled operations
 * (`trigger_class = 'CONTEXT_SCHEDULE'`) become calendar tasks. OBSERVATION rules are
 * conditional alert-layer knowledge and must never be materialised as dated tasks.
 */
export async function getFieldActionRules(
  supabase: SupabaseClient,
  cropCode: string,
): Promise<FieldActionRule[]> {
  const FIELD_ACTION_RULE_LIMIT = 1000;
  const { data } = await supabase
    .from("decision_rules")
    .select("rule_id, category, action_type, action_text, stage_applicable, priority, phi_days, chemical_class, scientific_source, biological_group, crop_code")
    .eq("is_active", true)
    .eq("requires_field_action", true)
    .eq("trigger_class", "CONTEXT_SCHEDULE")
    .or(`crop_code.ilike.${cropCode},crop_code.ilike.ALL`)
    .limit(FIELD_ACTION_RULE_LIMIT);
  const rows = (data || []) as FieldActionRule[];
  if (rows.length === FIELD_ACTION_RULE_LIMIT) {
    console.warn({ event: "rule_limit_hit", crop: cropCode, count: rows.length });
  }
  return rows;
}

export interface ObservationRuleRef {
  rule_id: string;
  stage_applicable: unknown;
  priority: number | null;
}

/**
 * Conditional (OBSERVATION) rules for the crop. These are NOT scheduled operations —
 * they are used only to decide which stages warrant recurring scouting.
 */
export async function getObservationRules(
  supabase: SupabaseClient,
  cropCode: string,
): Promise<ObservationRuleRef[]> {
  const { data } = await supabase
    .from("decision_rules")
    .select("rule_id, stage_applicable, priority")
    .eq("is_active", true)
    .eq("trigger_class", "OBSERVATION")
    .or(`crop_code.ilike.${cropCode},crop_code.ilike.ALL`)
    .limit(2000);
  return (data || []) as ObservationRuleRef[];
}


export async function getBannedChemicals(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from("chemical_regulatory_status")
    .select("chemical_name, status")
    .limit(2000);
  return new Set(
    (data || [])
      .filter((r: Record<string, unknown>) => String(r.status ?? "").toUpperCase() !== "APPROVED")
      .map((r: Record<string, unknown>) => String(r.chemical_name ?? "").toLowerCase()),
  );
}

export async function getLaborRate(
  supabase: SupabaseClient,
  state: string | null,
  operationType: string | null,
): Promise<{ dailyWage: number; provenance: Provenance } | null> {
  if (!state) return null;
  const { data } = await supabase
    .from("labor_rates")
    .select("id, state, operation_type, daily_wage, source, effective_date")
    .eq("is_active", true)
    .ilike("state", state)
    .order("effective_date", { ascending: false })
    .limit(50);
  const rows = data || [];
  if (!rows.length) return null;
  const hit =
    (operationType && rows.find((r: Record<string, unknown>) => String(r.operation_type ?? "").toLowerCase() === operationType.toLowerCase())) ||
    rows.find((r: Record<string, unknown>) => !r.operation_type) ||
    rows[0];
  return {
    dailyWage: Number(hit.daily_wage),
    provenance: { table: "labor_rates", row_id: hit.id, source: hit.source },
  };
}

export async function getInputPrice(
  supabase: SupabaseClient,
  productCode: string,
  state: string | null,
): Promise<{ price: number; unit: string; provenance: Provenance } | null> {
  let q = supabase
    .from("input_prices")
    .select("id, product_code, price, unit, state, source, effective_date")
    .eq("is_active", true)
    .ilike("product_code", productCode)
    .order("effective_date", { ascending: false })
    .limit(20);
  const { data } = await q;
  const rows = data || [];
  if (!rows.length) return null;
  const hit =
    (state && rows.find((r: Record<string, unknown>) => String(r.state ?? "").toLowerCase() === state.toLowerCase())) ||
    rows.find((r: Record<string, unknown>) => !r.state) ||
    rows[0];
  return {
    price: Number(hit.price),
    unit: String(hit.unit),
    provenance: { table: "input_prices", row_id: hit.id, source: hit.source },
  };
}
