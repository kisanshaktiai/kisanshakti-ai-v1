// CHANGE LOG
// 2026-08-28 — P0 forensic fixes (schedule 5673e87a audit, all verified live):
//   (1) APPLICABILITY GATE: getFieldActionRules / getObservationRules now filter by
//       decision_rules.region_code (NULL = universal, else must equal the land's region) and
//       cultivation_method_applicable (text[]; NULL or overlap with {'any', farmer method,
//       stage-clock method}). Verified live: 51 candidate rice CONTEXT_SCHEDULE rules → 5
//       for IN-MH + direct-seeded — this is what put Assam/Kerala/TN/Jammu/Punjab/MP tasks
//       into a Kolhapur schedule. A NULL land region passes ONLY region-NULL rules (fail-closed).
//   (2) IRRIGATION GRAPH SCOPING: getIrrigationGuidelines now accepts the selected stage
//       graph's ids and keeps only rows whose stage_master_id is IN that graph (all 12 live
//       rice rows carry the FK). Nursery/transplanting guideline rows can no longer expand
//       into a direct-seeded schedule; rows without the FK are excluded when a graph is given
//       (fail-closed) rather than string-matched in.
//   (3) getVarietyDuration: variety × method maturity from variety_cultivation_agronomy
//       (duration_days_min/max), walking the declared hierarchy like getSeedRate.
// 2026-08-28 — P0 counter-audit fix: getSeedRate no longer accepts fn_calculate_seed_rate
//   output built on the RPC's internal defaults. Verified in the live function body: missing
//   TGW defaults to 20 g with tgw_source='default_20g_UNVERIFIED', and missing
//   variety_cultivation_agronomy.target_plants_per_m2 silently defaults to 120/m² with NO
//   flag in the output. The gate therefore (a) verifies target_plants_per_m2 exists in VCA
//   BEFORE calling the RPC — trying the farmer's method, then the declared-hierarchy
//   stage-clock method, since VCA keys only canonical methods — and (b) rejects any RPC
//   result whose tgw_source is the UNVERIFIED default. band_estimate TGW (curated
//   grain_type_tgw_band table) is accepted as DB evidence and carried in provenance.
//   No authoritative parameters ⇒ null ⇒ explicit seed_rate gap. Never a defaulted number.
// 2026-08-24 17:47 UTC — P0: getStages is now HARD-scoped by cultivation_method (no
//   fallback to the unscoped set — that merged transplanted + DSR rice phenologies),
//   selects clock_reference, and applies a deterministic final sort (das_min, stage_code).
//   getObservationRules restricted to protection categories so scouting tasks never carry
//   economics/safety/management rule_ids.
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
  clock_reference: string | null;
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
      "id, crop_code, growth_stage, stage_code, das_min, das_max, das_reference, clock_reference, gdd_min, gdd_max, base_temperature_c, cultivation_method, crop_cycle, is_moisture_critical, kc_coefficient, boundary_grace_days",
    )
    .eq("crop_code", cropCode)
    .eq("is_active", true)
    .order("das_min", { ascending: true, nullsFirst: true });
  // 'universal' stage rows apply to ANY cycle — excluding them zeroed out every crop
  // whose stage graph is tagged universal (rice, wheat, cotton, …).
  if (cropCycle) {
    q = q.or(`crop_cycle.eq.${cropCycle},crop_cycle.eq.universal,crop_cycle.is.null`);
  }
  const { data } = await q;
  let rows = (data || []) as StageRow[];

  // Dedupe by stage identity, preferring the cycle-specific row over the universal one.
  if (cropCycle) {
    const wanted = cropCycle.toLowerCase();
    const byKey = new Map<string, StageRow>();
    for (const r of rows) {
      const key = (r.stage_code || r.growth_stage || r.id).toLowerCase();
      const prev = byKey.get(key);
      if (!prev) { byKey.set(key, r); continue; }
      const rSpecific = String(r.crop_cycle ?? "").toLowerCase() === wanted;
      const prevSpecific = String(prev.crop_cycle ?? "").toLowerCase() === wanted;
      if (rSpecific && !prevSpecific) byKey.set(key, r);
    }
    rows = [...byKey.values()];
  }

  // HARD scope. A two-method crop (rice: transplanted + direct_seeded) must never mix
  // phenologies — the old `if (scoped.length) rows = scoped` fallback silently merged them.
  // Method-agnostic rows (null / 'any') stay in; everything else must match exactly.
  if (cultivationMethod) {
    const wanted = cultivationMethod.toLowerCase();
    rows = rows.filter((r) => {
      const m = String(r.cultivation_method ?? "").trim().toLowerCase();
      return !m || m === "any" || m === wanted;
    });
  }

  return rows.sort(
    (a, b) =>
      (a.das_min ?? 0) - (b.das_min ?? 0) ||
      String(a.stage_code ?? "").localeCompare(String(b.stage_code ?? "")),
  );
}


export interface SeedRateResult {
  kgPerAcre: number;
  rationale: string | null;
  provenance: Provenance;
}

const RPC_TGW_UNVERIFIED = "default_20g_UNVERIFIED"; // self-reported by fn_calculate_seed_rate

export async function getSeedRate(
  supabase: SupabaseClient,
  varietyId: string | null,
  cultivationMethod: string | null,
  stageClockMethod: string | null = null,
): Promise<SeedRateResult | null> {
  if (!varietyId || !cultivationMethod) return null;

  // VCA keys only canonical methods, so a child method (rice direct_seeded_dry) must
  // fall back along the DECLARED hierarchy — the stage-clock method — never a guess.
  const candidateMethods = [...new Set([cultivationMethod, stageClockMethod].filter(Boolean))] as string[];

  let vca: Record<string, unknown> | null = null;
  let vcaMethod: string | null = null;
  for (const method of candidateMethods) {
    const { data } = await supabase
      .from("variety_cultivation_agronomy")
      .select(
        "id, target_plants_per_m2, seed_rate_kg_per_acre_min, seed_rate_kg_per_acre_max, seed_rate_rationale, source, evidence_tier",
      )
      .eq("variety_id", varietyId)
      .eq("cultivation_method", method)
      .eq("is_active", true)
      .maybeSingle();
    if (data) {
      vca = data as Record<string, unknown>;
      vcaMethod = method;
      break;
    }
  }

  // The RPC is only authoritative when ITS inputs are: target_plants_per_m2 must exist in
  // VCA (the RPC silently defaults it to 120/m² with no output flag), and the returned
  // tgw_source must not be the RPC's own unverified 20 g default.
  if (vca && vca.target_plants_per_m2 != null && vcaMethod) {
    const { data: rpc } = await supabase.rpc("fn_calculate_seed_rate", {
      p_variety_id: varietyId,
      p_cultivation_method: vcaMethod,
    });
    const r = Array.isArray(rpc) ? rpc[0] : rpc;
    if (
      r?.seed_rate_kg_per_acre != null &&
      typeof r.tgw_source === "string" &&
      r.tgw_source !== RPC_TGW_UNVERIFIED
    ) {
      return {
        kgPerAcre: Number(r.seed_rate_kg_per_acre),
        rationale: r.rationale ?? null,
        provenance: {
          table: "fn_calculate_seed_rate",
          source: `tgw:${r.tgw_source}; method:${vcaMethod}`,
        },
      };
    }
  }

  // Fallback (still DB): the curated per-acre range from the same VCA row.
  const min = vca?.seed_rate_kg_per_acre_min != null ? Number(vca.seed_rate_kg_per_acre_min) : null;
  const max = vca?.seed_rate_kg_per_acre_max != null ? Number(vca.seed_rate_kg_per_acre_max) : null;
  if (min == null && max == null) return null;
  return {
    kgPerAcre: min != null && max != null ? (min + max) / 2 : (min ?? max) as number,
    rationale: (vca?.seed_rate_rationale as string) ?? null,
    provenance: {
      table: "variety_cultivation_agronomy",
      row_id: (vca?.id as string) ?? null,
      source: `${(vca?.source as string) ?? ""}; method:${vcaMethod ?? ""}`,
    },
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
  notes: string | null;
  criticalMoisturePercent: number | null;
  provenance: Provenance;
}

export async function getIrrigationGuidelines(
  supabase: SupabaseClient,
  cropCode: string,
  varietyId: string | null,
  stageGraphIds: string[] | null = null,
): Promise<IrrigationGuideline[]> {
  const { data } = await supabase
    .from("crop_baseline_guidelines_v2")
    .select("id, crop_code, growth_stage, das_start, das_end, irrigation_interval_days, water_requirement_mm, variety_id, stage_master_id, source_reference, notes, critical_moisture_percent")
    .ilike("crop_code", cropCode)
    .eq("is_active", true)
    .order("das_start", { ascending: true, nullsFirst: true });

  let rows = data || [];
  if (varietyId) {
    const scoped = rows.filter((r: Record<string, unknown>) => !r.variety_id || r.variety_id === varietyId);
    if (scoped.length) rows = scoped;
  }

  // Graph scoping: only guideline rows whose stage_master_id belongs to the SELECTED
  // stage graph apply — a nursery/transplanting row (transplanted-graph FK) can never
  // expand into a direct-seeded schedule. Rows without the FK are excluded when a graph
  // is supplied: unverifiable applicability fails closed, it is never string-matched in.
  if (stageGraphIds && stageGraphIds.length) {
    const ids = new Set(stageGraphIds);
    rows = rows.filter((r: Record<string, unknown>) => r.stage_master_id != null && ids.has(String(r.stage_master_id)));
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
      notes: (r.notes as string) ?? null,
      criticalMoisturePercent: r.critical_moisture_percent != null ? Number(r.critical_moisture_percent) : null,
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
  etl_threshold: string | null;
  dosage_per_acre: string | null;
  contraindications: unknown;
}

/**
 * Field-action rules for the crop. Selection is DB-driven: only rules explicitly flagged
 * `requires_field_action` AND classified as true scheduled operations
 * (`trigger_class = 'CONTEXT_SCHEDULE'`) become calendar tasks. OBSERVATION rules are
 * conditional alert-layer knowledge and must never be materialised as dated tasks.
 */
/** OR-group for region applicability: universal (NULL) rules always pass; region-scoped
 *  rules pass only for their own region. With no resolved land region, ONLY universal
 *  rules pass — an unknown location must never receive another state's package. */
const regionFilter = (regionCode: string | null): string =>
  regionCode ? `region_code.is.null,region_code.eq.${regionCode}` : `region_code.is.null`;

/** OR-group for cultivation-method applicability (text[] column): NULL or overlap with
 *  {'any', farmer's method, declared stage-clock method}. */
const methodFilter = (methods: string[]): string => {
  const ov = [...new Set(["any", ...methods.filter(Boolean)])].join(",");
  return `cultivation_method_applicable.is.null,cultivation_method_applicable.ov.{${ov}}`;
};

export async function getFieldActionRules(
  supabase: SupabaseClient,
  cropCode: string,
  regionCode: string | null,
  methods: string[],
): Promise<FieldActionRule[]> {
  const FIELD_ACTION_RULE_LIMIT = 1000;
  const { data } = await supabase
    .from("decision_rules")
    .select("rule_id, category, action_type, action_text, stage_applicable, priority, phi_days, chemical_class, scientific_source, biological_group, etl_threshold, dosage_per_acre, contraindications, crop_code")
    .eq("is_active", true)
    .eq("requires_field_action", true)
    .eq("trigger_class", "CONTEXT_SCHEDULE")
    .or(`crop_code.ilike.${cropCode},crop_code.ilike.ALL`)
    .or(regionFilter(regionCode))
    .or(methodFilter(methods))
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
  category: string | null;
  condition_code: string | null;
  etl_threshold: string | null;
  action_text: string | null;
}

/** Categories that a field-scouting task can legitimately be derived from. */
export const SCOUTING_RULE_CATEGORIES = [
  "pest",
  "disease",
  "weed",
  "stress",
  "ipm",
  "proactive_pest",
  "proactive_monitoring",
];

/**
 * Conditional (OBSERVATION) rules for the crop. These are NOT scheduled operations —
 * they are used only to decide which stages warrant recurring scouting, so only
 * protection categories qualify (economics/safety/management are never scoutable).
 */
export async function getObservationRules(
  supabase: SupabaseClient,
  cropCode: string,
  regionCode: string | null,
  methods: string[],
): Promise<ObservationRuleRef[]> {
  const { data } = await supabase
    .from("decision_rules")
    .select("rule_id, stage_applicable, priority, category, condition_code, etl_threshold, action_text")
    .eq("is_active", true)
    .eq("trigger_class", "OBSERVATION")
    .in("category", SCOUTING_RULE_CATEGORIES)
    .or(`crop_code.ilike.${cropCode},crop_code.ilike.ALL`)
    .or(regionFilter(regionCode))
    .or(methodFilter(methods))
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

export interface VarietyDuration {
  minDays: number | null;
  maxDays: number | null;
  provenance: Provenance;
}

/** Variety × method maturity window from variety_cultivation_agronomy (duration_days_min/max).
 *  Tries the farmer's method, then the declared stage-clock method (VCA keys canonical
 *  methods only — same hierarchy rule as getSeedRate). Null when no row states a duration. */
export async function getVarietyDuration(
  supabase: SupabaseClient,
  varietyId: string | null,
  methods: string[],
): Promise<VarietyDuration | null> {
  if (!varietyId) return null;
  for (const method of [...new Set(methods.filter(Boolean))]) {
    const { data } = await supabase
      .from("variety_cultivation_agronomy")
      .select("id, duration_days_min, duration_days_max, duration_reference, source")
      .eq("variety_id", varietyId)
      .eq("cultivation_method", method)
      .eq("is_active", true)
      .maybeSingle();
    if (data && (data.duration_days_min != null || data.duration_days_max != null)) {
      return {
        minDays: data.duration_days_min != null ? Number(data.duration_days_min) : null,
        maxDays: data.duration_days_max != null ? Number(data.duration_days_max) : null,
        provenance: {
          table: "variety_cultivation_agronomy",
          row_id: data.id as string,
          source: `duration:${data.duration_reference ?? data.source ?? ""}; method:${method}`,
        },
      };
    }
  }
  return null;
}
