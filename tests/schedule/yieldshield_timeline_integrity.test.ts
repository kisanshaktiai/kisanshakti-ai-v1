// Regression tests for defects confirmed on live schedule 155a7891 (transplanted rice, sown day 0,
// transplanted day 35), using an anonymised fixture of its stage rows and card layout.
import { describe, expect, it } from "vitest";
import { biologicalStageOrder } from "../../supabase/functions/ai-smart-schedule/generator/stage-sequence";
import { detailedStepsOf, HARVEST_REVIEW_LINE, labelStageClock, markTimingConfidence, runQualityGates } from "../../supabase/functions/ai-smart-schedule/generator/timeline-integrity";
import type { StageRow } from "../../supabase/functions/ai-smart-schedule/db/agronomy-repo";
import type { BaselineTask } from "../../supabase/functions/ai-smart-schedule/generator/baseline-generator";

const st = (id: string, growth: string, min: number, max: number, clock: string, pi: number | null, derived = false): StageRow => ({ id, crop_code: "c", growth_stage: growth, stage_code: `C_${id.toUpperCase()}`, das_min: min, das_max: max, das_reference: clock, clock_reference: clock, gdd_min: null, gdd_max: null, phenology_index: pi, boundary_grace_days: 0, ...(derived ? { variety_window_source: "derived:phenology_scaling", variety_window_reliability: "indicative_photoperiod_sensitive" } : {}) } as unknown as StageRow);
const stages = [st("nur", "nursery", 0, 24, "nursery_sowing", 1.5), st("tp", "transplanting", 21, 30, "nursery_sowing", 3), st("est", "transplant_establishment", 0, 9, "transplanting", 3.2), st("till", "tillering", 10, 48, "transplanting", 4, true), st("mat", "maturity", 114, 119, "transplanting", 10, true), st("harv", "harvest", 114, 124, "transplanting", 11, true), st("post", "post_harvest", 125, 155, "transplanting", 11.5)];
const OFFSET = 35;
const order = biologicalStageOrder(stages, OFFSET);
const card = (name: string, stage: string, type: string, day: number, o: Partial<BaselineTask> = {}): BaselineTask => ({ task_name: name, task_type: type, task_description: "", days_from_sowing: day, anchor_type: "STAGE", anchor_stage: stage, gdd_target: null, stage_key: `C_${stage.toUpperCase()}`, stage_uuid: stage, stage_name: stage, stage_order: 0, priority: "low", weather_dependent: false, nutrient: null, quantity: null, estimated_cost: null, rule_ids: [], confidence: null, source_refs: [], instructions: [], precautions: [], ...o });

describe("stage clock labels", () => {
  it("a stage counted from transplanting states its window in days after transplanting; the stored day is unchanged", () => {
    const t = card("check", "till", "monitoring", 45, { instructions: ["Walk the field once a week from DAS 45 to 83."] });
    expect(labelStageClock([t], order, OFFSET)).toBe(1);
    expect(t.instructions).toEqual(["Walk the field once a week from 10 to 48 days after transplanting."]);
    expect(t.days_from_sowing).toBe(45);
    expect((t.resources as { stage_clock: unknown }).stage_clock).toEqual({ reference: "transplanting", days_after_transplanting: 10 });
  });
  it("a nursery-clock stage keeps days after sowing, and nothing changes without a transplanting date", () => {
    const n = card("water", "nur", "irrigation", 0, { instructions: ["Irrigate about every 2 days from DAS 0 to 24."] });
    labelStageClock([n], order, OFFSET);
    expect(n.instructions[0]).toContain("DAS 0 to 24");
    const t = card("check", "till", "monitoring", 45, { instructions: ["from DAS 45 to 83"] });
    expect(labelStageClock([t], order, null)).toBe(0);
  });
});

describe("timing confidence and harvest", () => {
  const harvestSide = new Set(["mat", "harv", "post"]);
  it("a window from a derived variety profile is marked indicative, a crop-level one verified", () => {
    const a = card("top-dress", "till", "nutrition", 56), b = card("water", "est", "irrigation", 35);
    expect(markTimingConfidence([a, b], order, false, harvestSide)).toEqual({ indicative: 1, harvest_review: 0 });
    expect((a.resources as { timing: { confidence: string } }).timing.confidence).toBe("indicative");
    expect((b.resources as { timing: { confidence: string } }).timing.confidence).toBe("verified");
  });
  it("with unverified maturity the harvest card carries no calendar window and an explicit review requirement", () => {
    const h = card("harvest", "harv", "harvest", 149, { task_description: "Harvest when 80 to 90 per cent of the grains are mature.", instructions: ["Timing window: 114 to 124 days after transplanting (harvest)."] });
    markTimingConfidence([h], order, false, harvestSide);
    expect(h.instructions).toEqual([HARVEST_REVIEW_LINE]);
    expect(h.task_description).toBe("Harvest when 80 to 90 per cent of the grains are mature.");
    expect(h.resources).toMatchObject({ timing: { confidence: "unknown" }, review_required: ["VARIETY_MATURITY_CLOCK_NOT_VERIFIED"] });
  });
  it("with verified maturity the harvest window is kept", () => {
    const h = card("harvest", "harv", "harvest", 149, { instructions: ["Timing window: DAS 149 to 159 (harvest)."] });
    markTimingConfidence([h], order, true, harvestSide);
    expect(h.instructions).toEqual(["Timing window: DAS 149 to 159 (harvest)."]);
    expect((h.resources as { review_required?: unknown }).review_required).toBeUndefined();
  });
});

describe("quality gates", () => {
  const dose = (n: string, v: number, stage: string, day: number) => card(`dose ${n}`, stage, "nutrition", day, { nutrient: n, quantity: { value: v, unit: "kg" }, task_description: "x" });
  // live figures: 3.51 acres at 100:50:50 kg/ha, split 50/25/25 (N, K) and 100 (P)
  const programme = { N: 142.04, P: 71.02, K: 71.02 };
  const live = [dose("N", 71.02, "tp", 35), dose("P", 71.02, "tp", 35), dose("K", 35.51, "tp", 35), dose("N", 35.51, "till", 56), dose("K", 17.75, "till", 56)];
  it("the live fertilizer split passes the mass balance (independent check: 1.4205 ha x 100 kg N = 142.05 kg)", () => {
    expect(Math.abs(3.51 * 0.404686 * 100 - programme.N)).toBeLessThan(0.05);
    // 2026-11-13: this slice holds only the feeding cards, so it is safe (no blocking finding) but not a
    // complete programme; `passed` now means complete AND safe, so it is read from readiness here.
    expect(runQualityGates(live, order, programme)).toMatchObject({ blocking: [], readiness: { safe_to_save: true } });
  });
  it("blocks a plan whose doses add up to more than the season's programme", () => {
    const r = runQualityGates([...live, dose("N", 71.02, "till", 60), dose("N", 35.51, "till", 70)], order, programme);
    expect(r.passed).toBe(false);
    expect(r.blocking[0].code).toBe("NUTRIENT_DOSES_EXCEED_SEASON_PROGRAMME");
  });
  it("counts the doses folded into a merged card", () => {
    const merged = card("fert", "tp", "nutrition", 35, { task_description: "x", resources: { stage_work: { members: [{ nutrient: "N", quantity: { value: 200, unit: "kg" } }] } } });
    expect(runQualityGates([merged], order, programme).passed).toBe(false);
  });
  it("blocks a treatment on a scouting card", () => {
    const scout = card("check", "till", "monitoring", 45, { task_description: "x", resources: { watch_list: [{ treatment_authorized: false, if_seen: "Apply product", treatment: null }] } });
    expect(runQualityGates([scout], order, {}).blocking.map((b) => b.code)).toContain("MONITORING_UNAUTHORIZED_TREATMENT");
  });
  it("blocks an establishment-stage card listed before a transplanting-stage card on the same day", () => {
    const r = runQualityGates([card("water after planting", "est", "irrigation", 35, { task_description: "x" }), card("plant", "tp", "advisory", 35, { task_description: "x" })], order, {});
    expect(r.blocking.map((b) => b.code)).toContain("STAGE_ORDER_REVERSED_ON_SAME_DAY");
  });
  it("warns, without blocking, on a card dated outside its stage, a rule on two cards and a card with no instruction", () => {
    const r = runQualityGates([card("a", "nur", "advisory", 30, { task_description: "x", rule_ids: ["R"] }), card("b", "est", "advisory", 36, { rule_ids: ["R"] })], order, {});
    expect(r.blocking).toEqual([]);
    expect(r.readiness.safe_to_save).toBe(true);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["EXECUTABLE_TASK_WITHOUT_INSTRUCTIONS", "RULE_ON_TWO_CARDS", "TASK_DATED_OUTSIDE_ITS_STAGE"]);
  });
});

describe("detailed steps", () => {
  it("are the card's steps then its precautions, each once; a card with no steps uses its description", () => {
    expect(detailedStepsOf({ task_description: "d", instructions: ["one", "two", "one"], precautions: ["wear gloves", "two"] })).toEqual(["d", "one", "two", "wear gloves"]);
    expect(detailedStepsOf({ task_description: "one", instructions: ["one", "two"], precautions: [] })).toEqual(["one", "two"]);
    expect(detailedStepsOf({ task_description: "Dry the grain.", instructions: [], precautions: [] })).toEqual(["Dry the grain."]);
    expect(detailedStepsOf({ task_description: "", instructions: [], precautions: [] })).toEqual([]);
  });
});
