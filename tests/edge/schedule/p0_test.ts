// CHANGE LOG
// 2026-08-24 17:47 UTC — P0 regression locks: cultivation-method requirement, transplant clock,
//   one-task-per-rule, protection-only scouting, and run-to-run determinism.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  AMBIGUOUS_CULTIVATION_METHOD,
  getCultivationMethodOptions,
} from "../../../supabase/functions/ai-smart-schedule/db/resolve-inputs.ts";
import { getStages, getObservationRules, SCOUTING_RULE_CATEGORIES } from "../../../supabase/functions/ai-smart-schedule/db/agronomy-repo.ts";
import { generateBaseline, computeTransplantOffset, toDas } from "../../../supabase/functions/ai-smart-schedule/generator/baseline-generator.ts";
import type { ResolvedInputs } from "../../../supabase/functions/ai-smart-schedule/db/resolve-inputs.ts";

// ── Mocked Supabase ─────────────────────────────────────────────────────────
type Row = Record<string, unknown>;

const RICE_STAGES: Row[] = [
  { id: "s-nur", crop_code: "rice", growth_stage: "nursery", stage_code: "RICE_TP_NURSERY", das_min: 0, das_max: 24, das_reference: "sowing", clock_reference: "sowing", gdd_min: null, gdd_max: null, base_temperature_c: 10, cultivation_method: "transplanted", crop_cycle: "universal", is_moisture_critical: true, kc_coefficient: 1, boundary_grace_days: 0, is_active: true },
  { id: "s-tp-till", crop_code: "rice", growth_stage: "tillering", stage_code: "RICE_TP_TILLERING", das_min: 10, das_max: 40, das_reference: "transplanting", clock_reference: "transplanting", gdd_min: null, gdd_max: null, base_temperature_c: 10, cultivation_method: "transplanted", crop_cycle: "universal", is_moisture_critical: true, kc_coefficient: 1, boundary_grace_days: 0, is_active: true },
  { id: "s-dsr-till", crop_code: "rice", growth_stage: "tillering", stage_code: "RICE_TILLERING", das_min: 35, das_max: 65, das_reference: "sowing", clock_reference: "sowing", gdd_min: null, gdd_max: null, base_temperature_c: 10, cultivation_method: "direct_seeded", crop_cycle: "universal", is_moisture_critical: true, kc_coefficient: 1, boundary_grace_days: 0, is_active: true },
];

const DECISION_RULES: Row[] = [
  // matches BOTH tillering rows via the "tillering" token → must emit ONE task
  { rule_id: "RICE_NUTR_N_TOP1_001", category: "nutrition", action_type: "nutrition", action_text: "Top-dress nitrogen", stage_applicable: ["tillering"], priority: 80, phi_days: null, chemical_class: null, scientific_source: null, biological_group: null, crop_code: "rice", is_active: true, requires_field_action: true, trigger_class: "CONTEXT_SCHEDULE" },
  { rule_id: "RICE_PEST_OBS_001", category: "pest", stage_applicable: ["tillering"], priority: 70, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
  { rule_id: "RICE_ECON_OBS_001", category: "economics", stage_applicable: ["tillering"], priority: 90, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
  { rule_id: "RICE_SAFETY_OBS_001", category: "safety", stage_applicable: ["tillering"], priority: 95, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
];

const TABLES: Record<string, Row[]> = {
  crop_stage_master: RICE_STAGES,
  decision_rules: DECISION_RULES,
  task_type_map: [{ raw_value: "nutrition", canonical: "nutrition" }],
  fertilizer_recommendation_master: [],
  crop_baseline_guidelines_v2: [],
  chemical_regulatory_status: [],
  labor_rates: [],
  input_prices: [],
  variety_cultivation_agronomy: [],
};

function makeSupabase() {
  const build = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.order = chain;
    api.limit = chain;
    api.eq = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return api;
    };
    api.ilike = (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "").toLowerCase() === String(val).toLowerCase());
      return api;
    };
    api.in = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return api;
    };
    api.not = chain;
    api.or = chain; // permissive: the mock keeps every row for `.or(...)`
    const run = () => ({ data: (TABLES[table] || []).filter((r) => filters.every((f) => f(r))), error: null });
    api.maybeSingle = () => Promise.resolve({ data: run().data[0] ?? null, error: null });
    api.single = api.maybeSingle;
    (api as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res);
    return api;
  };
  return {
    from: (table: string) => build(table),
    rpc: () => Promise.resolve({ data: null, error: null }),
    // deno-lint-ignore no-explicit-any
  } as any;
}

const baseInputs = (over: Partial<ResolvedInputs> = {}): ResolvedInputs => ({
  cropCode: "rice",
  cropId: "c1",
  cropLabel: "Rice",
  cropLabelLocal: "Rice",
  varietyId: null,
  varietyName: null,
  varietyNameLocal: null,
  cultivationMethod: "transplanted",
  cropCycle: "universal",
  landAreaAcres: 1,
  landAreaHa: 0.404686,
  state: "Maharashtra",
  district: "Pune",
  regionCode: null,
  soilFertilityClass: null,
  soilTestId: null,
  sowingDate: "2026-06-01",
  transplantDate: null,
  gaps: [],
  provenance: {},
  ...over,
});

// ── 1. Cultivation method is required ───────────────────────────────────────
Deno.test("rice with no cultivation method is AMBIGUOUS and exposes DB options", async () => {
  const supabase = makeSupabase();
  const options = await getCultivationMethodOptions(supabase, "rice");
  assertEquals(options, ["direct_seeded", "transplanted"]);
  assert(options.length > 1, "ambiguity requires >1 distinct method");
  assertEquals(AMBIGUOUS_CULTIVATION_METHOD, "__AMBIGUOUS__");
});

Deno.test("getStages hard-scopes by cultivation method (no unscoped fallback)", async () => {
  const supabase = makeSupabase();
  const stages = await getStages(supabase, "rice", "universal", "transplanted");
  const codes = stages.map((s) => s.stage_code);
  assert(codes.includes("RICE_TP_TILLERING"));
  assert(!codes.includes("RICE_TILLERING"), "DSR phenology leaked into a transplanted schedule");
});

// ── 2. Transplant clock ─────────────────────────────────────────────────────
Deno.test("transplant-clock stages are shifted onto the sowing axis", async () => {
  const supabase = makeSupabase();
  const stages = await getStages(supabase, "rice", "universal", "transplanted");
  const offset = computeTransplantOffset(stages, "2026-06-01", null);
  assertEquals(offset, 24, "nursery das_max is the offset when no transplant date is given");
  const tp = stages.find((s) => s.stage_code === "RICE_TP_TILLERING")!;
  assertEquals(toDas(tp, tp.das_min, offset), 34);
});

Deno.test("rice transplanted, no transplantDate → task at DAS 34, no DSR tillering", async () => {
  const supabase = makeSupabase();
  const { tasks } = await generateBaseline(supabase, baseInputs());
  const topdress = tasks.filter((t) => t.rule_ids.includes("RICE_NUTR_N_TOP1_001"));
  assertEquals(topdress.length, 1, "N_TOP1 must be emitted exactly once");
  assertEquals(topdress[0].days_from_sowing, 34);
  assertEquals(topdress[0].stage_key, "RICE_TP_TILLERING");
  assert(!tasks.some((t) => t.stage_key === "RICE_TILLERING"), "DSR stage produced a task");
});

// ── 4. Scouting from protection rules only ──────────────────────────────────
Deno.test("scouting rule_ids never come from economics/safety/management", async () => {
  const supabase = makeSupabase();
  const obs = await getObservationRules(supabase, "rice");
  assertEquals(obs.map((r) => r.rule_id), ["RICE_PEST_OBS_001"]);
  assert(!SCOUTING_RULE_CATEGORIES.includes("economics"));

  const { tasks } = await generateBaseline(supabase, baseInputs());
  const scoutRuleIds = tasks.filter((t) => t.task_type === "monitoring").flatMap((t) => t.rule_ids);
  assert(!scoutRuleIds.includes("RICE_ECON_OBS_001"));
  assert(!scoutRuleIds.includes("RICE_SAFETY_OBS_001"));
  for (const t of tasks) assert(t.rule_ids.length <= 12, "rule_ids must be capped at 12");
});

// ── 5. Determinism ──────────────────────────────────────────────────────────
Deno.test("two identical runs are deep-equal", async () => {
  const a = await generateBaseline(makeSupabase(), baseInputs());
  const b = await generateBaseline(makeSupabase(), baseInputs());
  assertEquals(a.tasks.length, b.tasks.length);
  assertEquals(JSON.stringify(a.tasks), JSON.stringify(b.tasks));
});
