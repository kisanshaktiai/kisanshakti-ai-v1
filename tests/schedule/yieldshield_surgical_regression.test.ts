// Behavioural regression tests for the 2026-11-12 surgical fixes. Every test executes the real
// production module with real inputs and asserts on its output — no source-string assertions.
import { describe, expect, it } from "vitest";
import { selectFertilizerRow, normalizeFertilityClass, contextVerdict } from "../../supabase/functions/ai-smart-schedule/generator/fertilizer-selection";
import { resolveRuleTiming, relativeExpressions } from "../../supabase/functions/ai-smart-schedule/generator/rule-timing";
import { buildWatchBrief, watchLine, enforceMonitoringStructure, monitoringViolations, treatmentAuthorization } from "../../supabase/functions/ai-smart-schedule/generator/monitoring-safety";
import { resolveReleaseStatus, stageGraphSha256, type CropReleaseApproval, type ReleaseScope, type ReleaseStage } from "../../supabase/functions/ai-smart-schedule/generator/scientific-release-gate";
import { biologicalHarvestStages, resolvedMaturityDas } from "../../supabase/functions/ai-smart-schedule/generator/agronomy-scientific-contract";
import { assembleCompactPlan, orderCandidates, planFromModelOutput, providerBudgetMs, runPlanner } from "../../supabase/functions/ai-smart-schedule/harness/plan-assembly";
import { validatePlanIntent } from "../../supabase/functions/ai-smart-schedule/harness/validator";
import type { CandidateNode, ScheduleCandidateGraph } from "../../supabase/functions/ai-smart-schedule/harness/types";
import { thermalStageEvidence, pickNutrientDecision, evidenceFreshness } from "../../supabase/functions/schedule-reconciler/decision-contract";

// ── Fertilizer fallback (values below mirror the SHAPE of live rows; numbers are test fixtures) ──
const vocab = { methodVocabulary: ["transplanted", "direct_seeded", "direct_seeded_dry", "sett_planted", "any"], cycleVocabulary: ["plant", "ratoon", "universal"] };
const row = (id: string, o: Record<string, unknown> = {}) => ({ id, region_code: "IN-MH", soil_fertility_class: "medium", cultivation_context: null as string | null, ...o });
describe("fertilizer recommendation selection", () => {
  const base = { regionCode: "IN-MH", methodCodes: ["direct_seeded"], cropCycle: "universal", ...vocab };
  it("normalizes soil-test class spellings to the recommendation vocabulary", () => {
    expect(normalizeFertilityClass("Moderate")).toBe("medium");
    expect(normalizeFertilityClass(" LOW ")).toBe("low");
    expect(normalizeFertilityClass("very high")).toBe("high");
    expect(normalizeFertilityClass("loamy")).toBeNull();
  });
  it("uses the approved state recommendation when there is no soil test, and says so", () => {
    const r = selectFertilizerRow([row("a", { cultivation_context: "kharif" })], { ...base, soilFertilityClass: null });
    expect(r?.row.id).toBe("a");
    expect(r?.basis).toBe("state_recommended_dose");
    expect(r?.gaps).toContain("fertilizer_state_recommendation_no_soil_test");
  });
  it("matches a 'moderate' soil test to the 'medium' row (the live mismatch that removed every fertilizer plan)", () => {
    const r = selectFertilizerRow([row("a")], { ...base, soilFertilityClass: "moderate" });
    expect(r?.basis).toBe("soil_test_class_matched");
    expect(r?.gaps).toEqual([]);
  });
  it("adjusts by soil test only by choosing the row authored for that class", () => {
    const rows = [row("med"), row("low", { soil_fertility_class: "low" })];
    expect(selectFertilizerRow(rows, { ...base, soilFertilityClass: "low" })?.row.id).toBe("low");
    const noRowForHigh = selectFertilizerRow(rows, { ...base, soilFertilityClass: "high" });
    expect(noRowForHigh?.row.id).toBe("med");
    expect(noRowForHigh?.gaps).toContain("fertilizer_not_adjusted_for_soil_class:high");
  });
  it("never presents a low/high-fertility dose as the general recommendation", () => {
    expect(selectFertilizerRow([row("low", { soil_fertility_class: "low" })], { ...base, soilFertilityClass: null })).toBeNull();
  });
  it("never uses another region's row, and needs a resolved region for a region-scoped row", () => {
    expect(selectFertilizerRow([row("a")], { ...base, regionCode: "IN-KA", soilFertilityClass: null })).toBeNull();
    expect(selectFertilizerRow([row("a")], { ...base, regionCode: null, soilFertilityClass: null })).toBeNull();
  });
  it("blocks a row whose context names a different cultivation method or crop cycle", () => {
    const ctx = { ...base, soilFertilityClass: null };
    expect(contextVerdict(row("a", { cultivation_context: "transplanted irrigated" }), ctx)).toBe("conflict");
    expect(selectFertilizerRow([row("a", { cultivation_context: "transplanted irrigated" })], ctx)).toBeNull();
    expect(contextVerdict(row("a", { cultivation_context: "transplanted irrigated" }), { ...ctx, methodCodes: ["transplanted"] })).toBe("match");
    const cane = row("c", { cultivation_context: "suru plant crop" });
    expect(contextVerdict(cane, { ...ctx, methodCodes: ["sett_planted"], cropCycle: "plant" })).toBe("match");
    expect(contextVerdict(cane, { ...ctx, methodCodes: ["sett_planted"], cropCycle: "ratoon" })).toBe("conflict");
  });
  it("keeps a context it cannot classify but reports it for structuring", () => {
    const r = selectFertilizerRow([row("a", { cultivation_context: "kharif" })], { ...base, soilFertilityClass: "moderate" });
    expect(r?.gaps).toEqual(["fertilizer_context_unstructured:kharif"]);
  });
  it("does not treat 'direct seeded dry' as a conflict for a dry direct-seeded farmer", () => {
    expect(contextVerdict(row("a", { cultivation_context: "direct-seeded dry" }), { ...base, methodCodes: ["direct_seeded_dry", "direct_seeded"], soilFertilityClass: null })).toBe("match");
  });
});

// ── Crop clocks: rule timing + maturity ──
describe("event-relative rule timing is anchored to the schedule clock, not dropped", () => {
  const tillering = [{ dasMin: 35, dasMax: 60 }];
  it("uses typed crop age first and clamps it inside the stage the rule names", () => {
    const t = resolveRuleTiming({ ruleId: "R", ageMin: 40, ageMax: 50, actionText: "AT 25-30 DAYS AFTER TRANSPLANTING", transplantOffset: 25, stages: tillering });
    expect(t).toMatchObject({ das: 40, dasEnd: 50, basis: "typed_crop_age", gap: null });
  });
  it("converts one transplant-relative expression with the resolved nursery offset (DAT → DAS)", () => {
    const t = resolveRuleTiming({ ruleId: "R", ageMin: null, ageMax: null, actionText: "At 25-30 days after transplanting top-dress.", transplantOffset: 25, stages: tillering });
    expect(t).toMatchObject({ das: 50, dasEnd: 55, anchorType: "DAT", basis: "text_relative_converted", gap: null });
  });
  it("reads the DAT / DAS abbreviations and weeks", () => {
    expect(relativeExpressions("apply at 35-45 DAT")).toEqual([{ lo: 35, hi: 45, clock: "transplant" }]);
    expect(relativeExpressions("2 weeks after sowing")).toEqual([{ lo: 14, hi: 14, clock: "sowing" }]);
  });
  it("does not guess the transplant day when the nursery offset is unresolved", () => {
    const t = resolveRuleTiming({ ruleId: "R", ageMin: null, ageMax: null, actionText: "15 days after transplanting", transplantOffset: null, stages: tillering });
    expect(t).toMatchObject({ das: 35, basis: "stage_window", gap: "rule_relative_timing_clock_unresolved:R" });
  });
  it("keeps a multi-timing rule as a stage-window card and flags it — no date is invented", () => {
    const t = resolveRuleTiming({ ruleId: "R", ageMin: null, ageMax: null, actionText: "Weed at 15 days after transplanting and again 30 days after transplanting", transplantOffset: 25, stages: tillering });
    expect(t).toMatchObject({ das: 35, basis: "stage_window", gap: "rule_relative_timing_multiple_needs_structured_anchor:R" });
  });
  it("refuses a converted day that falls outside every stage the rule names", () => {
    const t = resolveRuleTiming({ ruleId: "R", ageMin: null, ageMax: null, actionText: "90 days after sowing", transplantOffset: null, stages: tillering });
    expect(t.gap).toBe("rule_relative_timing_outside_named_stage:R");
    expect(t.das).toBe(35);
  });
  it("'after planting' is the sowing clock only for a method without a nursery", () => {
    const input = { ruleId: "R", ageMin: null, ageMax: null, actionText: "40 days after planting", stages: tillering };
    expect(resolveRuleTiming({ ...input, transplantOffset: null }).basis).toBe("text_relative_converted");
    expect(resolveRuleTiming({ ...input, transplantOffset: 25 }).gap).toBe("rule_relative_timing_clock_unresolved:R");
  });
  it("a rule without any timing text stays at its stage start with no gap", () => {
    expect(resolveRuleTiming({ ruleId: "R", ageMin: null, ageMax: null, actionText: "Keep bunds clean", transplantOffset: 25, stages: tillering })).toMatchObject({ das: 35, gap: null });
  });
});
describe("variety maturity clock is never fabricated", () => {
  it("adds the transplant offset to a transplant-referenced duration and refuses unverified tiers", () => {
    expect(resolvedMaturityDas(119, "transplanting", "C_documented_source", 45)).toEqual({ maxDas: 164, issue: null });
    expect(resolvedMaturityDas(119, "transplanting", "C_documented_source", null).maxDas).toBeNull();
    expect(resolvedMaturityDas(119, "sowing", "D_unverified", 0)).toEqual({ maxDas: null, issue: "variety_duration_evidence_unverified" });
    expect(resolvedMaturityDas(135, "sowing", "C_documented_source", null)).toEqual({ maxDas: 135, issue: null });
  });
});

// ── Multi-picking ──
describe("repeated-picking crops are recognised from the stage graph itself", () => {
  it("counts every biological harvest stage; a single harvest stage is not repeated picking", () => {
    const chilli = [{ growth_stage: "flowering" }, { growth_stage: "first_picking" }, { growth_stage: "successive_harvest" }];
    expect(biologicalHarvestStages(chilli)).toHaveLength(2);
    expect(biologicalHarvestStages([{ growth_stage: "fruiting" }, { growth_stage: "harvest_maturity" }])).toHaveLength(1);
  });
});

// ── Structured, language-independent treatment safety ──
describe("scouting-card treatment safety is decided from typed rule fields", () => {
  const dosed = { rule_id: "R1", category: "disease", etl_threshold: "5% leaf area", active_ingredient: "X 75 WP", dosage_per_acre: "160 g", application_method: "foliar spray", phi_days: 21, chemical_class: "triazole", regulatory_status: "approved", is_farmer_servable: true };
  it("withholds an input treatment that is not expert approved", () => {
    const b = buildWatchBrief({ ...dosed, expert_approved: false });
    expect(b).toMatchObject({ treatment_authorized: false, if_seen: null, treatment: null, withheld_reason: "pending_expert_approval", carries_input: true });
    expect(watchLine(b)).not.toContain("160 g");
    expect(watchLine(b)).toContain("5% leaf area");
  });
  it("renders the DB dose and PHI only for an expert-approved, regulator-approved rule", () => {
    const b = buildWatchBrief({ ...dosed, expert_approved: true });
    expect(b.treatment_authorized).toBe(true);
    expect(b.treatment).toEqual({ active_ingredient: "X 75 WP", dosage_per_acre: "160 g", application_method: "foliar spray", phi_days: 21 });
    expect(watchLine(b)).toContain("160 g per acre");
    expect(watchLine(b)).toContain("21 days");
  });
  it("blocks banned classes, non-approved regulatory status and safety blocks even when expert approved", () => {
    expect(treatmentAuthorization({ ...dosed, expert_approved: true }, new Set(["triazole"])).reason).toBe("banned_chemical_class");
    expect(treatmentAuthorization({ ...dosed, expert_approved: true, regulatory_status: "restricted" }).reason).toBe("regulatory_status_not_approved");
    expect(treatmentAuthorization({ ...dosed, expert_approved: true, is_safety_block: true }).authorized).toBe(false);
  });
  it("allows a cultural practice that carries no input", () => {
    const b = buildWatchBrief({ rule_id: "R2", category: "pest", condition_code: "stem_borer", action_text: "Clip leaf tips before transplanting", is_farmer_servable: true });
    expect(b).toMatchObject({ treatment_authorized: true, carries_input: false, if_seen: "Clip leaf tips before transplanting" });
  });
  it("is independent of the farmer language: the same structure passes or fails whatever the words are", () => {
    for (const words of ["फवारणी करा", "தெளிக்கவும்", "Spray now", "ಸಿಂಪಡಿಸಿ"]) {
      const ok = { task_type: "monitoring", instructions: [words], resources: { watch_list: [{ treatment_authorized: true, if_seen: words }] } };
      expect(monitoringViolations(ok)).toEqual([]);
      const bad = { task_type: "monitoring", instructions: [words], resources: { watch_list: [{ treatment_authorized: false, if_seen: words, treatment: { dosage_per_acre: "1" } }] } };
      expect(monitoringViolations(bad)).toEqual(["MONITORING_UNAUTHORIZED_TREATMENT"]);
      expect(enforceMonitoringStructure(bad)).toBe(1);
      expect(monitoringViolations(bad)).toEqual([]);
      expect(bad.resources.watch_list[0]).toMatchObject({ if_seen: null, treatment: null });
    }
  });
  it("a monitoring card can never carry a quantity, nutrient or water volume", () => {
    expect(monitoringViolations({ task_type: "monitoring", quantity: { value: 1, unit: "kg" }, nutrient: "N", water_volume: { stage_total_liters: 1 } }))
      .toEqual(["MONITORING_CARRIES_QUANTITY", "MONITORING_CARRIES_NUTRIENT", "MONITORING_CARRIES_WATER_VOLUME"]);
    expect(monitoringViolations({ task_type: "nutrition", quantity: { value: 1, unit: "kg" } })).toEqual([]);
  });
});

// ── Release status ──
describe("release status: provisional by default, approved only by an exact current approval", () => {
  const scope: ReleaseScope = { cropCode: "rice", cultivationMethod: "transplanted", stageClockMethod: "transplanted", cropCycle: "universal", regionCode: "IN-MH", varietyId: null };
  const stage: ReleaseStage = { id: "s1", crop_code: "rice", growth_stage: "harvest", stage_code: "RICE_HARVEST", das_min: 110, das_max: 130, das_reference: "sowing", clock_reference: "sowing", gdd_min: null, gdd_max: null, base_temperature_c: null, cultivation_method: "transplanted", crop_cycle: "universal", is_moisture_critical: false, kc_coefficient: null, boundary_grace_days: 0 };
  const now = new Date("2026-11-12T00:00:00Z");
  const approval = (sha: string, o: Partial<CropReleaseApproval> = {}): CropReleaseApproval => ({ id: "ap1", crop_code: "rice", cultivation_method: "transplanted", crop_cycle: "universal", region_code: "IN-MH", variety_id: null, status: "approved", stage_graph_sha256: sha, evidence_bundle_sha256: "b".repeat(64), reviewed_by: "review-board", reviewed_at: "2026-11-01T00:00:00Z", expires_at: "2027-11-01T00:00:00Z", ...o });
  it("an empty registry gives a provisional schedule instead of blocking generation", async () => {
    const sha = await stageGraphSha256([stage]);
    expect(resolveReleaseStatus({ approval: null, registryError: false, scope, graphSha256: sha, now })).toMatchObject({ status: "provisional", reasons: ["CROP_RELEASE_NOT_APPROVED"], approval_id: null });
  });
  it("an unreadable / not-yet-deployed registry gives provisional, never approved and never an outage", async () => {
    const sha = await stageGraphSha256([stage]);
    const r = resolveReleaseStatus({ approval: approval(sha), registryError: true, scope, graphSha256: sha, now });
    expect(r).toMatchObject({ status: "provisional", registry: "unavailable", approval_id: null });
    expect(r.reasons).toEqual(["CROP_RELEASE_REGISTRY_UNAVAILABLE"]);
  });
  it("is approved only for the exact scope and current stage-graph fingerprint", async () => {
    const sha = await stageGraphSha256([stage]);
    expect(resolveReleaseStatus({ approval: approval(sha), registryError: false, scope, graphSha256: sha, now })).toMatchObject({ status: "approved", approval_id: "ap1", reasons: [] });
    const edited = await stageGraphSha256([{ ...stage, das_min: 111 }]);
    expect(resolveReleaseStatus({ approval: approval(sha), registryError: false, scope, graphSha256: edited, now }).reasons).toContain("CROP_RELEASE_STAGE_GRAPH_STALE");
    expect(resolveReleaseStatus({ approval: approval(sha, { expires_at: "2026-11-01T00:00:00Z" }), registryError: false, scope, graphSha256: sha, now }).status).toBe("provisional");
    expect(resolveReleaseStatus({ approval: approval(sha, { status: "revoked" }), registryError: false, scope, graphSha256: sha, now }).status).toBe("provisional");
    expect(resolveReleaseStatus({ approval: approval(sha), registryError: false, scope, graphSha256: sha, extraReasons: ["VARIETY_MATURITY_CLOCK_NOT_VERIFIED"], now }).status).toBe("provisional");
  });
});

// ── LLM harness: success, repair and fallback ──
const node = (id: string, o: Partial<CandidateNode> = {}): CandidateNode => ({ id, task_index: 0, task_type: "monitoring", domain: "MONITORING", days_from_sowing: 0, stage_uuid: null, stage_key: null, stage_order: 0, priority: "medium", weather_dependent: false, rule_ids: [], source_count: 1, depends_on: [], required: true, default_status: "SCHEDULED", trigger_class: null, condition_code: null, materializable: true, ...o });
const graph: ScheduleCandidateGraph = {
  schema_version: "schedule_candidate_graph_v2",
  nodes: [
    node("task_0002", { days_from_sowing: 30, task_type: "nutrition" }),
    node("task_0001", { days_from_sowing: 0, task_type: "land_preparation" }),
    node("ev_pest", { required: false, default_status: "CONDITIONAL", trigger_class: "OBSERVATION", days_from_sowing: 20 }),
    node("ev_weed", { required: false, default_status: "SCHEDULED", days_from_sowing: 10, task_type: "weed_management" }),
    node("ev_note", { required: false, default_status: "MONITOR", materializable: false, days_from_sowing: 5 }),
  ],
  edges: [{ from: "ev_weed", to: "ev_note" }],
};
describe("compact planner contract", () => {
  it("builds a complete, valid plan from an EMPTY decision list (the model need not echo candidates)", () => {
    const plan = assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions: [] });
    expect(plan.sequence).toHaveLength(graph.nodes.length);
    expect(validatePlanIntent(plan, graph)).toEqual([]);
    expect(plan.sequence.find((x) => x.candidate_id === "ev_pest")?.status).toBe("CONDITIONAL");
  });
  it("orders by day and honours dependency edges even against day order", () => {
    const ids = orderCandidates(graph).map((n) => n.id);
    expect(ids.indexOf("task_0001")).toBe(0);
    expect(ids.indexOf("ev_weed")).toBeLessThan(ids.indexOf("ev_note"));
    expect(ids.indexOf("task_0002")).toBe(ids.length - 1);
  });
  it("applies a model decision and keeps the model's reason", () => {
    const plan = assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions: [{ candidate_id: "ev_weed", status: "INSUFFICIENT_DATA", reason: "no dose in evidence" }] });
    expect(plan.sequence.find((x) => x.candidate_id === "ev_weed")).toMatchObject({ status: "INSUFFICIENT_DATA", reason: "no dose in evidence" });
    expect(validatePlanIntent(plan, graph)).toEqual([]);
  });
  it("the validator still rejects promotion of an observation rule, a demoted baseline task and an invented id", () => {
    const mk = (decisions: Array<{ candidate_id: string; status: string }>) => validatePlanIntent(assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions }), graph);
    expect(mk([{ candidate_id: "ev_pest", status: "SCHEDULED" }])).toContain("observation_candidate_promoted_to_scheduled:ev_pest");
    expect(mk([{ candidate_id: "task_0001", status: "MONITOR" }])).toContain("required_baseline_not_scheduled:task_0001");
    expect(mk([{ candidate_id: "made_up", status: "SCHEDULED" }])).toContain("unknown_candidate_id:made_up");
  });
  it("still honours a model that returns the legacy full sequence", () => {
    const full = assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions: [] });
    const plan = planFromModelOutput({ schema_version: "schedule_plan_intent_v3", status: "READY", sequence: full.sequence }, graph);
    expect(validatePlanIntent(plan, graph)).toEqual([]);
  });
  it("never lets the first provider take the whole budget while another provider is waiting", () => {
    expect(providerBudgetMs(30_000, 3, 25_000, 6_000)).toBe(18_000);
    expect(providerBudgetMs(12_000, 2, 25_000, 6_000)).toBe(7_200);
    expect(providerBudgetMs(30_000, 1, 25_000, 6_000)).toBe(25_000);
    expect(providerBudgetMs(5_000, 2, 25_000, 6_000)).toBe(0);
  });
});
describe("planner loop: LLM success, repair, and deterministic-fallback signal", () => {
  const opts = (ms = 60_000) => ({ maxAttempts: 2, minAttemptMs: 8_000, remainingMs: () => ms });
  const good = () => assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions: [] });
  it("LLM success: a valid plan is accepted on the first attempt", async () => {
    const out = await runPlanner(graph, async () => ({ plan: good(), provider: "p", model: "m" }), validatePlanIntent, opts());
    expect(out).toMatchObject({ ok: true, attempts: 1, provider: "p", model: "m" });
  });
  it("repair: validation errors of attempt 1 are passed to attempt 2, which succeeds", async () => {
    const seen: string[][] = [];
    const out = await runPlanner(graph, async (errors) => {
      seen.push(errors);
      return seen.length === 1
        ? { plan: assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions: [{ candidate_id: "ev_pest", status: "SCHEDULED" }] }), provider: "p", model: "m" }
        : { plan: good(), provider: "p", model: "m" };
    }, validatePlanIntent, opts());
    expect(out.ok).toBe(true);
    expect(out.attempts).toBe(2);
    expect(seen[0]).toEqual([]);
    expect(seen[1]).toContain("observation_candidate_promoted_to_scheduled:ev_pest");
  });
  it("fallback: a provider timeout stops immediately and reports the real attempt count", async () => {
    let calls = 0;
    const out = await runPlanner(graph, async () => { calls += 1; throw new Error("MODEL_TIMEOUT"); }, validatePlanIntent, opts());
    expect(out).toEqual({ ok: false, attempts: 1, errors: ["MODEL_TIMEOUT"] });
    expect(calls).toBe(1);
  });
  it("fallback: an invalid plan twice ends in fallback with the validator's errors", async () => {
    const bad = () => ({ plan: assembleCompactPlan(graph, { schema_version: "schedule_plan_intent_v3", status: "READY", decisions: [{ candidate_id: "task_0001", status: "MONITOR" }] }), provider: "p", model: "m" });
    const out = await runPlanner(graph, async () => bad(), validatePlanIntent, opts());
    expect(out.ok).toBe(false);
    expect(out.attempts).toBe(2);
    expect(out.errors).toContain("required_baseline_not_scheduled:task_0001");
  });
  it("fallback: with no budget the model is never called and the trace says why", async () => {
    let calls = 0;
    const out = await runPlanner(graph, async () => { calls += 1; return { plan: good(), provider: "p", model: "m" }; }, validatePlanIntent, opts(2_000));
    expect(out).toEqual({ ok: false, attempts: 0, errors: ["PLANNER_BUDGET_EXHAUSTED"] });
    expect(calls).toBe(0);
  });
  it("a NEEDS_DATA plan is not accepted as a schedule", async () => {
    const out = await runPlanner(graph, async () => ({ plan: { ...good(), status: "NEEDS_DATA" as const }, provider: "p", model: "m" }), validatePlanIntent, opts());
    expect(out.ok).toBe(false);
    expect(out.errors).toEqual(["planner_status:NEEDS_DATA"]);
  });
});

// ── Dynamic engine pure contracts ──
describe("dynamic engine evidence contracts", () => {
  it("thermal evidence compares GDD with the stage's own window and never fabricates one", () => {
    expect(thermalStageEvidence(900, 800, 1200)).toBe("corroborated");
    expect(thermalStageEvidence(1500, 800, 1200)).toBe("gdd_ahead_of_stage");
    expect(thermalStageEvidence(500, 800, 1200)).toBe("gdd_behind_stage");
    expect(thermalStageEvidence(null, 800, 1200)).toBe("no_gdd");
    expect(thermalStageEvidence(900, null, null)).toBe("no_thermal_window");
  });
  it("a verified nutrient decision is preferred; a WATCH request alone never authorizes", () => {
    const watch = { status: "WATCH", action_code: "OBSERVE_BEFORE_INPUT" }, verified = { status: "DUE", action_code: "APPLY_NUTRIENT_VERIFIED" };
    expect(pickNutrientDecision([watch, verified])).toBe(verified);
    expect(pickNutrientDecision([watch])).toBe(watch);
    expect(pickNutrientDecision([])).toBeNull();
  });
  it("records how old each evidence stream is, with null for a stream that does not exist", () => {
    const f = evidenceFreshness({ state_date: "2026-11-12", water: { metric_date: "2026-11-11" }, canopy: { date: "2026-11-02" }, observations: [{}], gaps: ["soil_missing"] }, "2026-11-12");
    expect(f).toEqual({ state_age_days: 0, water_age_days: 1, satellite_age_days: 10, farmer_observations: 1, gaps: ["soil_missing"] });
    expect(evidenceFreshness({ state_date: "2026-11-12", water: null, canopy: null }, "2026-11-12")).toMatchObject({ water_age_days: null, satellite_age_days: null, farmer_observations: 0 });
  });
});
