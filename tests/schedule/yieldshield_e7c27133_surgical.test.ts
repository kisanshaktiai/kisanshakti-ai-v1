// Regression tests for the 14 defects confirmed on live schedule e7c27133-62e5-4000-a916-9869350535eb
// (rice PKV HMT, direct-seeded, 3.51 acres, Kolhapur; generated 2026-11-13 by ai-smart-schedule).
// The generator is REPLAYED on production-derived fixture rows (tests/schedule/fixtures/e7c27133_dsr.ts)
// through the same post-harness steps index.ts runs, minus the LLM planner and the language pass.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateBaseline, type BaselineTask } from "../../supabase/functions/ai-smart-schedule/generator/baseline-generator";
import { getStages, type StageRow } from "../../supabase/functions/ai-smart-schedule/db/agronomy-repo";
import { applyRuleStageOffsets, biologicalStageOrder, sequenceTasks } from "../../supabase/functions/ai-smart-schedule/generator/stage-sequence";
import { consolidateByStage } from "../../supabase/functions/ai-smart-schedule/generator/stage-work-plan";
import { alignAfterHarvest, calendarStageAt, detailedStepsOf, labelStageClock, markTimingConfidence, runQualityGates, transplantDateDecision, withholdConflictingSeedRate } from "../../supabase/functions/ai-smart-schedule/generator/timeline-integrity";
import { isBiologicalHarvestStage, isConditionalNutrientRule, isTransplantClockWording, stagesUseTransplantClock } from "../../supabase/functions/ai-smart-schedule/generator/agronomy-scientific-contract";
import { prepareCurrentFieldTasks } from "../../supabase/functions/ai-smart-schedule/generator/current-field-plan";
import { fixture } from "./fixtures/e7c27133_dsr";
import { fakeSupabase } from "./fixtures/fake-supabase";

type Fx = { tables: Record<string, unknown[]>; rpc: Record<string, unknown> };
const clone = (): Fx => JSON.parse(JSON.stringify(fixture));
const INPUTS = {
  cropCode: "rice", cropId: "b8e73e32-d97d-4324-ba60-d3ebb79ff8b7", cropLabel: "Rice", cropLabelLocal: null,
  varietyId: "861012bf-b223-4944-b2c5-a66f7cbc9f49", varietyName: "Rice PKV HMT (HMT Sona Masoori)", varietyNameLocal: null,
  cultivationMethod: "direct_seeded", stageClockMethod: "direct_seeded", cropCycle: "universal",
  landAreaAcres: 3.51, landAreaHa: 1.42044786, state: "Maharashtra", district: "Kolhapur", regionCode: "IN-MH",
  soilFertilityClass: null, soilTestId: null, farmingPolicy: "fertilizer_pesticide",
  sowingDate: "2026-06-10", transplantDate: null as string | null, gaps: [] as string[], provenance: {}, language: "en",
};
const DSR_STAGES = (fixture.tables.crop_stage_master as unknown as StageRow[]).filter((s) => s.cultivation_method === "direct_seeded");
const TP_STAGES = (fixture.tables.crop_stage_master as unknown as StageRow[]).filter((s) => s.cultivation_method === "transplanted");

/** The deterministic part of the index.ts pipeline after the harness (no LLM, no narration). */
async function replay(fx: Fx = clone(), inputs = INPUTS, release = "provisional") {
  const db = fakeSupabase(fx) as never;
  const baseline = await generateBaseline(db, { ...inputs, gaps: [...inputs.gaps] } as never);
  const stageRows = await getStages(db, "rice", "universal", inputs.stageClockMethod, inputs.varietyId);
  const order = biologicalStageOrder(stageRows, null);
  applyRuleStageOffsets(baseline.tasks, new Map(), order);
  labelStageClock(baseline.tasks, order, null);
  const post = alignAfterHarvest(baseline.tasks, order);
  const firstHarvest = Math.min(...order.filter((p) => isBiologicalHarvestStage(p.stage.growth_stage) && p.from != null).map((p) => p.from as number));
  const harvestSide = new Set(order.filter((p) => p.from != null && (p.from as number) >= firstHarvest).map((p) => p.stage.id));
  markTimingConfidence(baseline.tasks, order, true, harvestSide);
  const plan = consolidateByStage(baseline.tasks);
  const tasks = sequenceTasks(plan.tasks, order);
  const seedConflicts = withholdConflictingSeedRate(tasks, inputs.landAreaAcres);
  const gates = runQualityGates(tasks, order, { N: baseline.totals.n_kg, P: baseline.totals.p_kg, K: baseline.totals.k_kg }, { releaseStatus: release, yieldClaim: null });
  return { baseline, tasks, order, gates, post, seedConflicts };
}
const text = (t: BaselineTask) => [t.task_description ?? "", ...(t.instructions ?? [])].join(" \n ");
const codes = (fs: Array<{ code: string }>) => fs.map((f) => f.code);

describe("defect 1 — direct-seeded schedule carried a transplant date and transplant-clock weeding text", () => {
  it("a transplant date inherited from the land record is ignored for a method with no transplanting clock", () => {
    expect(stagesUseTransplantClock(DSR_STAGES)).toBe(false);
    expect(transplantDateDecision(DSR_STAGES, "2026-07-06", false)).toEqual({ keep: false, reject: false, gap: "transplant_date_from_land_record_ignored_method_has_no_transplanting" });
  });
  it("an explicit transplant date on a direct-seeded request is rejected", () => {
    expect(transplantDateDecision(DSR_STAGES, "2026-07-06", true).reject).toBe(true);
  });
  it("a transplanted method keeps its transplant date (no regression)", () => {
    expect(stagesUseTransplantClock(TP_STAGES)).toBe(true);
    expect(transplantDateDecision(TP_STAGES, "2026-07-06", true)).toEqual({ keep: true, reject: false, gap: null });
    expect(transplantDateDecision(TP_STAGES, null, false)).toEqual({ keep: false, reject: false, gap: null });
  });
  it("no card of the replayed DSR plan is worded on the transplanting clock; the transplant weeding rule is refused", async () => {
    const { tasks, baseline } = await replay();
    for (const t of tasks) expect(isTransplantClockWording(text(t)), t.task_name).toBe(false);
    expect(tasks.flatMap((t) => t.rule_ids ?? [])).not.toContain("RICE_WEED_CRITICAL_PERIOD_MH_DRAFT_001");
    expect(baseline.gaps).toContain("rule_wording_on_transplant_clock_not_applicable:RICE_WEED_CRITICAL_PERIOD_MH_DRAFT_001");
  });
});

describe("defect 2 — seed quantity 51.25 kg conflicted with the card's own drilling-rate line", () => {
  it("the conflicting computed quantity is withheld for review, never averaged or replaced", async () => {
    const { tasks, seedConflicts } = await replay();
    const sow = tasks.find((t) => t.task_type === "sowing")!;
    expect(seedConflicts).toHaveLength(1);
    expect(sow.quantity).toBeNull();
    expect(text(sow)).not.toContain("51.25");
    expect(text(sow)).toContain("75 to 100 kg of seed per hectare");
    const r = sow.resources as Record<string, unknown>;
    expect((r.withheld_quantity as { value: number }).value).toBe(51.25);
    expect(r.review_required).toContain("SEED_RATE_SOURCES_CONFLICT");
  });
  it("a seed quantity inside the stated range is kept (normal case)", () => {
    const t = { task_name: "sow", task_type: "sowing", task_description: "Use 120 kg of seed for 3.51 acre.", instructions: ["Use 75 to 100 kg of seed per hectare when drilling."], quantity: { value: 120, unit: "kg" }, days_from_sowing: 0 } as unknown as BaselineTask;
    expect(withholdConflictingSeedRate([t], 3.51)).toEqual([]);
    expect(t.quantity).toEqual({ value: 120, unit: "kg" });
  });
  it("no stated range and no area: the quantity is kept (missing-data case)", () => {
    const t = { task_name: "sow", task_type: "sowing", task_description: "Use 51.25 kg.", instructions: [], quantity: { value: 51.25, unit: "kg" }, days_from_sowing: 0 } as unknown as BaselineTask;
    expect(withholdConflictingSeedRate([t], 3.51)).toEqual([]);
    expect(withholdConflictingSeedRate([t], null)).toEqual([]);
    expect(t.quantity).not.toBeNull();
  });
});

describe("defect 3 and 12 — no basal NPK or top-dressing, yet quality_gates.passed was true", () => {
  it("without an approved fertilizer programme the plan is provisional: passed=false, safe to save, not executable", async () => {
    const { gates, baseline } = await replay();
    expect(baseline.gaps).toContain("fertilizer_recommendation_master_no_row");
    expect(codes(gates.incomplete)).toContain("COVERAGE_NUTRIENT_PROGRAMME_MISSING");
    expect(gates.passed).toBe(false);
    expect(gates.readiness).toEqual({ safe_to_save: true, executable: false, mode: "provisional_planning" });
  });
  it("with an approved direct-seeded programme the basal split is a dosed card and the coverage finding clears", async () => {
    const fx = clone();
    fx.tables.fertilizer_recommendation_master.push({ id: "dsr-approved-test", crop_code: "rice", region_code: "IN-MH", soil_fertility_class: "medium", n_kg_ha: 75, p2o5_kg_ha: 37.5, k2o_kg_ha: 37.5, split_schedule: '[{"stage":"germination","percent":100,"nutrient":"N"},{"stage":"germination","percent":100,"nutrient":"P2O5"},{"stage":"germination","percent":100,"nutrient":"K2O"}]', cultivation_context: "direct_seeded", source: "test", authority: "test", confidence: 0.7, review_status: "approved" });
    const { tasks, gates, baseline } = await replay(fx);
    expect(baseline.totals.n_kg).toBeCloseTo(75 * 1.42044786, 1);
    const feed = tasks.filter((t) => t.task_type === "nutrition" && (t.quantity || ((t.resources as Record<string, unknown>)?.inputs as unknown[] | undefined)?.length));
    expect(feed.length).toBeGreaterThan(0);
    expect(codes(gates.incomplete)).not.toContain("COVERAGE_NUTRIENT_PROGRAMME_MISSING");
    expect(codes(gates.blocking)).not.toContain("NUTRIENT_DOSES_EXCEED_SEASON_PROGRAMME");
  });
});

describe("defect 4 — irrigation was a fixed interval with no per-irrigation quantity", () => {
  it("every irrigation card is a field-water check with no invented per-irrigation depth", async () => {
    const { tasks, gates } = await replay();
    const water = tasks.filter((t) => t.task_type === "irrigation" && (t.resources as Record<string, unknown>)?.requirement_semantics === "BASELINE");
    expect(water.length).toBeGreaterThan(5);
    for (const t of water) {
      expect((t.resources as Record<string, unknown>).irrigation_decision).toMatchObject({ mode: "field_water_check", per_event_depth_mm: null });
      expect(text(t)).toMatch(/Check the field water about every \d+ days? from DAS \d+ to \d+ and irrigate when the field needs water\./);
      expect(text(t)).not.toMatch(/^Irrigate about every/m);
      expect(t.water_volume?.per_event_liters ?? null).toBeNull();
    }
    expect(codes(gates.incomplete)).toContain("IRRIGATION_EVENT_DEPTH_UNVERIFIED");
  });
});

describe("defect 5 — only one weeding operation; the critical weed period is not covered", () => {
  it("the plan reports the missing weed operation instead of serving the transplanted-rice weeding rule", async () => {
    const { tasks, gates } = await replay();
    expect(tasks.some((t) => t.task_type === "weed_management")).toBe(false);
    expect(codes(gates.incomplete)).toContain("COVERAGE_WEED_OPERATION_MISSING");
  });
});

describe("defect 6 — conditional micronutrient treatments appeared as spraying instructions", () => {
  const CONDITIONAL = ["RICE_NUTR_CU_DEFICIT_TNAU_DRAFT_002", "RICE_NUTR_MN_DEFICIT_TNAU_DRAFT_002", "RICE_NUTR_MICRO_MIX_FOLIAR_TNAU_DRAFT_002", "RICE_NUTR_LCC_001", "RICE_NUTR_ORGANIC_001"];
  it("no executable card carries a diagnosis-dependent nutrient rule", async () => {
    const { tasks, baseline } = await replay();
    const onCards = tasks.filter((t) => t.task_type !== "monitoring").flatMap((t) => t.rule_ids ?? []);
    for (const id of CONDITIONAL) expect(onCards, id).not.toContain(id);
    for (const id of ["RICE_NUTR_CU_DEFICIT_TNAU_DRAFT_002", "RICE_NUTR_MN_DEFICIT_TNAU_DRAFT_002", "RICE_NUTR_MICRO_MIX_FOLIAR_TNAU_DRAFT_002", "RICE_NUTR_LCC_001"]) expect(baseline.gaps).toContain(`conditional_nutrient_requires_observation:${id}`);
  });
  it("the predicate: deficiency wording, soil-context wording and a diagnostic condition are conditional; a curated operation is not", () => {
    const diag = (c: string) => c === "n_deficiency_rice";
    expect(isConditionalNutrientRule({ rule_id: "X_CU_DEFICIT", category: "nutrition", action_text: "spray" }, diag)).toBe(true);
    expect(isConditionalNutrientRule({ rule_id: "X", category: "nutrition", action_text: "confirm with a soil or leaf test, then spray" }, diag)).toBe(true);
    expect(isConditionalNutrientRule({ rule_id: "X", category: "nutrition", action_text: "Where micronutrient hunger is common, spray" }, diag)).toBe(true);
    expect(isConditionalNutrientRule({ rule_id: "X", category: "nutrition", action_text: "Use a leaf colour chart", condition_code: "n_deficiency_rice" }, diag)).toBe(true);
    expect(isConditionalNutrientRule({ rule_id: "X", category: "nutrition", action_text: "Apply basal dose", condition_code: "management_planning" }, diag)).toBe(false);
    expect(isConditionalNutrientRule({ rule_id: "X_CU_DEFICIT", category: "nutrition", schedule_role: "operation" }, diag)).toBe(false);
    expect(isConditionalNutrientRule({ rule_id: "X_DEFICIT", category: "pest" }, diag)).toBe(false);
  });
});

describe("defect 7 — the PI foliar rule says MAP where the TNAU dry-seeded page says DAP", () => {
  it("the staging data migration limits the MAP rule to its cited method and records the DAP source for review", () => {
    const sql = readFileSync("supabase/migrations/20261113151000_rice_dsr_staging_agronomy_data.sql", "utf8");
    expect(sql).toMatch(/rule_id = 'RICE_NUTR_FOLIAR_PI_BOOSTER_TNAU_DRAFT_002'/);
    expect(sql).toMatch(/cultivation_method_applicable = array\['transplanted'\]/);
    expect(sql).toContain("1% urea + 2% DAP + 1% KCl at PI and\n--    10 days later");
    expect(sql).not.toMatch(/\bdelete\b/i);
  });
});

describe("defect 8 — irrigation dated outside its stage", () => {
  it("each irrigation card's window is its stage window on the variety calendar; no stage-timing warning remains", async () => {
    const { tasks, order, gates } = await replay();
    for (const t of tasks.filter((x) => x.task_type === "irrigation" && x.recurrence)) {
      const p = order.find((o) => o.stage.id === t.stage_uuid)!;
      expect([t.recurrence!.window_start, t.recurrence!.window_end], t.task_name).toEqual([p.from, p.to]);
      expect(t.days_from_sowing).toBe(p.from);
    }
    expect(gates.warnings.filter((w) => w.code === "TASK_DATED_OUTSIDE_ITS_STAGE")).toEqual([]);
  });
});

describe("defect 9 — post-harvest dated DAS 136 while its text and window said DAS 160 to 190", () => {
  it("post-harvest cards follow the harvest card; date, window and text agree", async () => {
    const { tasks, gates, post } = await replay();
    const harvest = tasks.find((t) => t.task_type === "harvest")!;
    const after = tasks.filter((t) => t.task_type === "post_harvest");
    expect(after.length).toBeGreaterThan(0);
    expect(post.from).toBe(harvest.days_from_sowing + 1);
    for (const t of after) {
      const w = (t.resources as Record<string, unknown>).window as { from_das: number; to_das: number };
      expect(t.days_from_sowing).toBe(w.from_das);
      expect(w.from_das).toBe(harvest.days_from_sowing + 1);
      expect(text(t)).not.toMatch(/\bDAS 160\b/);
    }
    expect(gates.warnings.filter((w) => w.code === "TASK_TEXT_WINDOW_MISMATCH")).toEqual([]);
  });
});

describe("defect 10 — detailed_steps were empty", () => {
  it("every replayed card has ordered steps to persist, and a merged card keeps its main action in them", async () => {
    const { tasks } = await replay();
    for (const t of tasks) expect(detailedStepsOf(t).length, t.task_name).toBeGreaterThan(0);
    const grain = tasks.find((t) => t.task_type === "irrigation" && t.stage_key === "RICE_GRAIN_FILLING" && t.recurrence)!;
    expect(detailedStepsOf(grain)[0]).toMatch(/^Check the field water about every 5 days from DAS 110 to 129/);
    const sow = tasks.find((t) => t.task_type === "sowing")!;
    expect(detailedStepsOf(sow).join(" ")).toContain("75 to 100 kg of seed per hectare");
  });
  it("the persistence migration inserts detailed_steps and is the live routine plus only the intended columns", () => {
    const sql = readFileSync("supabase/migrations/20261113150000_persist_schedule_detailed_steps_and_no_default_yield_claim.sql", "utf8");
    expect(sql).toMatch(/source_refs, language, is_pinned, detailed_steps\n/);
    expect(sql).toMatch(/detailed_steps jsonb\n  \);/);
    expect(sql).toContain("b87c3ed730842741d960de8445a08f74");
  });
});

describe("defect 11 — historical tasks pending; current biological stage unresolved", () => {
  it("today's stage comes from this plan's own calendar when the land has no observed stage for this crop", async () => {
    const { tasks, order } = await replay();
    const todayDas = 156; // 2026-11-13 minus sowing 2026-06-10
    const stage = calendarStageAt(order, todayDas)!;
    expect(stage).not.toBeNull();
    const prepared = prepareCurrentFieldTasks(tasks, { stageUuid: stage.stage.id, stageCode: stage.stage.stage_code, currentDas: todayDas, source: "plan_calendar_from_sowing_date", confidence: null }, "2026-11-13", "2026-06-10");
    expect(prepared.gaps).not.toContain("current_biological_stage_unresolved");
    expect(prepared.summary.expired).toBeGreaterThan(0);
    const historical = prepared.tasks.filter((p) => (p.resources.timeline as { state?: string } | undefined)?.state === "HISTORICAL_UNCONFIRMED");
    expect(historical.length).toBe(prepared.summary.expired);
  });
  it("before sowing there is no current stage (missing-data case)", async () => {
    const { order } = await replay();
    expect(calendarStageAt(order, -5)).toBeNull();
  });
});

describe("defect 13 — provisional scientific release but the plan was presented as complete", () => {
  it("a provisional release keeps the plan out of the approved mode", async () => {
    const { gates } = await replay();
    expect(codes(gates.incomplete)).toContain("SCIENTIFIC_RELEASE_NOT_APPROVED");
    expect(gates.readiness.executable).toBe(false);
  });
});

describe("defect 14 — yield_multiplier_target 3.0 without field-yield evidence", () => {
  it("a yield claim without evidence blocks the save; no claim passes", () => {
    const g = runQualityGates([], [], {}, { yieldClaim: 3.0 });
    expect(codes(g.blocking)).toContain("UNSUPPORTED_YIELD_CLAIM");
    expect(runQualityGates([], [], {}, { yieldClaim: null }).blocking).toEqual([]);
  });
  it("the generator sends null and the persistence routine stores the payload value, not the 3.0 default", () => {
    const index = readFileSync("supabase/functions/ai-smart-schedule/index.ts", "utf8");
    expect(index).toContain("yield_multiplier_target: null");
    const sql = readFileSync("supabase/migrations/20261113150000_persist_schedule_detailed_steps_and_no_default_yield_claim.sql", "utf8");
    expect(sql).toContain("nullif(p_schedule->>'yield_multiplier_target', '')::numeric");
  });
});

describe("crop-agnostic: another crop with a sowing clock and complete programme", () => {
  it("coverage findings depend only on canonical task types and the programme, not on crop names", () => {
    const st = (id: string, g: string, a: number, b: number, pi: number): StageRow => ({ id, crop_code: "other", growth_stage: g, stage_code: id.toUpperCase(), das_min: a, das_max: b, das_reference: "sowing", clock_reference: "sowing", phenology_index: pi } as unknown as StageRow);
    const stages = [st("emer", "emergence", 0, 10, 1), st("veg", "vegetative", 11, 50, 2), st("harv", "harvest", 90, 100, 9), st("post", "post_harvest", 120, 140, 10)];
    const order = biologicalStageOrder(stages, null);
    const card = (type: string, stage: string, day: number, o: Partial<BaselineTask> = {}) => ({ task_name: `${type}@${day}`, task_type: type, task_description: "Do the work.", instructions: ["Do the work."], days_from_sowing: day, stage_uuid: stage, stage_key: stage.toUpperCase(), quantity: null, rule_ids: [], resources: {}, ...o }) as unknown as BaselineTask;
    const tasks = [card("sowing", "emer", 0, { quantity: { value: 20, unit: "kg" } }), card("nutrition", "emer", 0, { nutrient: "N", quantity: { value: 30, unit: "kg" } }), card("irrigation", "veg", 11, { resources: { irrigation_decision: { per_event_depth_mm: 50 } } }), card("weed_management", "veg", 20), card("monitoring", "veg", 11), card("harvest", "harv", 90), card("post_harvest", "post", 120)];
    const moved = alignAfterHarvest(tasks, order);
    expect(moved.from).toBe(91);
    const g = runQualityGates(tasks, order, { N: 30 }, { releaseStatus: "approved" });
    expect(g.incomplete).toEqual([]);
    expect(g.passed).toBe(true);
    expect(g.readiness.mode).toBe("approved");
  });
});
