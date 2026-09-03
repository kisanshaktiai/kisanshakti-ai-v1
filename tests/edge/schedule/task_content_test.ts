// CHANGE LOG
// 2026-08-24 18:20 UTC — locks task body content: scouting brief, irrigation notes,
//   rule ETL/dose instructions, and the gap-not-guess behaviour for empty content.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { generateBaseline } from "../../../supabase/functions/ai-smart-schedule/generator/baseline-generator.ts";
import type { ResolvedInputs } from "../../../supabase/functions/ai-smart-schedule/db/resolve-inputs.ts";

type Row = Record<string, unknown>;

const STAGES: Row[] = [
  { id: "s-till", crop_code: "rice", growth_stage: "tillering", stage_code: "RICE_TILLERING", das_min: 20, das_max: 40, das_reference: "sowing", clock_reference: "sowing", gdd_min: null, gdd_max: null, base_temperature_c: 10, cultivation_method: "direct_seeded", crop_cycle: "universal", is_moisture_critical: true, kc_coefficient: 1, boundary_grace_days: 0, is_active: true },
];

const RULES: Row[] = [
  { rule_id: "R_ACTION_1", category: "pest", action_type: "pest", action_text: "Spray for stem borer", stage_applicable: ["tillering"], priority: 80, phi_days: 14, chemical_class: null, scientific_source: "ICAR", biological_group: null, etl_threshold: "5% dead hearts", dosage_per_acre: "400 ml", contraindications: ["Do not spray before rain"], crop_code: "rice", is_active: true, requires_field_action: true, trigger_class: "CONTEXT_SCHEDULE" },
  { rule_id: "OBS_PEST_1", category: "pest", condition_code: "STEM_BORER", etl_threshold: "5% dead hearts", action_text: "Scout", stage_applicable: ["tillering"], priority: 90, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
  { rule_id: "OBS_PEST_2", category: "disease", condition_code: "LEAF_BLAST", etl_threshold: "2 lesions/leaf", action_text: "Scout", stage_applicable: ["tillering"], priority: 85, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
  { rule_id: "OBS_PEST_3", category: "weed", condition_code: "ECHINOCHLOA", etl_threshold: null, action_text: "Scout", stage_applicable: ["tillering"], priority: 60, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
  { rule_id: "OBS_ECON_1", category: "economics", condition_code: "PRICE_DROP", etl_threshold: null, action_text: "x", stage_applicable: ["tillering"], priority: 99, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
  { rule_id: "OBS_SAFETY_1", category: "safety", condition_code: "PPE", etl_threshold: null, action_text: "x", stage_applicable: ["tillering"], priority: 99, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
];

const IRRIGATION: Row[] = [
  { id: "g1", crop_code: "rice", growth_stage: "tillering", das_start: 20, das_end: 26, irrigation_interval_days: 7, water_requirement_mm: 50, variety_id: null, stage_master_id: "s-till", source_reference: "ICAR", notes: "Maintain 5 cm standing water", critical_moisture_percent: 100, is_active: true },
];

const TABLES: Record<string, Row[]> = {
  crop_stage_master: STAGES,
  decision_rules: RULES,
  task_type_map: [{ raw_value: "pest", canonical: "pest_management" }],
  fertilizer_recommendation_master: [],
  crop_baseline_guidelines_v2: IRRIGATION,
  chemical_regulatory_status: [],
  labor_rates: [],
  input_prices: [],
  variety_cultivation_agronomy: [],
};

function makeSupabase(tables: Record<string, Row[]> = TABLES) {
  const build = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.order = chain;
    api.limit = chain;
    api.eq = (col: string, val: unknown) => { filters.push((r) => r[col] === val); return api; };
    api.ilike = (col: string, val: string) => {
      filters.push((r) => String(r[col] ?? "").toLowerCase() === String(val).toLowerCase());
      return api;
    };
    api.in = (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return api; };
    api.not = chain;
    api.or = chain;
    const run = () => ({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null });
    api.maybeSingle = () => Promise.resolve({ data: run().data[0] ?? null, error: null });
    api.single = api.maybeSingle;
    (api as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res);
    return api;
  };
  // deno-lint-ignore no-explicit-any
  return { from: (t: string) => build(t), rpc: () => Promise.resolve({ data: null, error: null }) } as any;
}

const inputs = (): ResolvedInputs => ({
  cropCode: "rice",
  cropId: "c1",
  cropLabel: "Rice",
  cropLabelLocal: "Rice",
  varietyId: null,
  varietyName: null,
  varietyNameLocal: null,
  cultivationMethod: "direct_seeded",
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
});

Deno.test("scouting task carries a DB-derived brief", async () => {
  const { tasks } = await generateBaseline(makeSupabase(), inputs());
  const scout = tasks.find((t) => t.task_type === "monitoring")!;
  assert(scout, "no scouting task emitted");
  assert(scout.task_description.startsWith("Inspect for:"), scout.task_description);
  assert(scout.task_description.includes("STEM BORER"));
  assert(scout.task_description.includes("LEAF BLAST"));
  assert(scout.rule_ids.length <= 12);
  // 2026-09-03: ETL is AUDIT detail — it lives in technical_details, not in the
  // farmer instruction list.
  assert((scout.technical_details ?? []).some((i) => i.includes("5% dead hearts")));
  assertEquals((scout.resources as Record<string, unknown>).scouting_targets, scout.rule_ids.length);
});

Deno.test("scouting excludes economics/safety/management rules", async () => {
  const { tasks } = await generateBaseline(makeSupabase(), inputs());
  const ids = tasks.filter((t) => t.task_type === "monitoring").flatMap((t) => t.rule_ids);
  assert(!ids.includes("OBS_ECON_1"));
  assert(!ids.includes("OBS_SAFETY_1"));
});

Deno.test("irrigation task keeps provenance out of farmer text", async () => {
  const { tasks } = await generateBaseline(makeSupabase(), inputs());
  const irr = tasks.find((t) => t.task_type === "irrigation")!;
  // The farmer line is the cadence sentence; the card is never blank.
  assert(irr.task_description.startsWith("Irrigate about every"), irr.task_description);
  assert(!irr.instructions.some((i) => i.startsWith("Source:")));
  assert((irr.technical_details ?? []).includes("Critical soil moisture: 100%"));
  assert((irr.technical_details ?? []).some((i) => i.startsWith("Source:")));
});

Deno.test("rule task surfaces ETL, dose, PHI and precautions as technical detail", async () => {
  const { tasks } = await generateBaseline(makeSupabase(), inputs());
  const rt = tasks.find((t) => t.rule_ids.includes("R_ACTION_1"))!;
  const tech = rt.technical_details ?? [];
  assert(tech.includes("ETL: 5% dead hearts"));
  assert(tech.includes("Dose/acre: 400 ml"));
  assert(tech.includes("PHI: 14 days"));
  assertEquals(rt.precautions, ["Do not spray before rain"]);
});

Deno.test("content-free scouting still emits a task and pushes a gap", async () => {
  const bare = {
    ...TABLES,
    crop_baseline_guidelines_v2: [],
    decision_rules: [
      { rule_id: "OBS_BARE", category: "pest", condition_code: null, etl_threshold: null, action_text: null, stage_applicable: ["tillering"], priority: 50, crop_code: "rice", is_active: true, trigger_class: "OBSERVATION" },
    ],
  };
  const { tasks, gaps } = await generateBaseline(makeSupabase(bare), inputs());
  const scout = tasks.find((t) => t.task_type === "monitoring");
  assert(scout, "task must still be emitted");
  // No DB brief ⇒ the weekly walk sentence is the farmer text (never an empty card).
  assert(scout!.task_description.startsWith("Walk the field"), scout!.task_description);
  assert(gaps.includes("scouting_brief_empty"));
});

