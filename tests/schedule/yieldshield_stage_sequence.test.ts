// Behavioural tests for the 2026-11-13 task-sequence fix. The stage rows are the live rice rows
// (transplanted, with the selected variety's windows applied) and the cards are the stage/type
// layout of the schedule generated on 2026-11-13 whose order was wrong in the field.
import { describe, expect, it } from "vitest";
import { applyRuleStageOffsets, biologicalStageOrder, sequenceTasks } from "../../supabase/functions/ai-smart-schedule/generator/stage-sequence";
import type { RuleStageOffset, StageRow } from "../../supabase/functions/ai-smart-schedule/db/agronomy-repo";
import type { BaselineTask } from "../../supabase/functions/ai-smart-schedule/generator/baseline-generator";

const st = (id: string, growth: string, min: number, max: number, clock: string, pi: number | null): StageRow => ({ id, crop_code: "rice", growth_stage: growth, stage_code: `C_${id.toUpperCase()}`, das_min: min, das_max: max, das_reference: clock, clock_reference: clock, gdd_min: null, gdd_max: null, base_temperature_c: null, cultivation_method: "transplanted", crop_cycle: "universal", phenology_index: pi } as unknown as StageRow);
// Listed in the RAW day order getStages returns (clocks mixed) — the order that used to become stage_order.
const stages = [
  st("nur", "nursery", 0, 24, "nursery_sowing", 1.5), st("est", "transplant_establishment", 0, 9, "transplanting", 3.2), st("till", "tillering", 10, 48, "transplanting", 4),
  st("land", "land_preparation", 15, 30, "sowing", null), st("tp", "transplanting", 21, 30, "nursery_sowing", 3), st("pi", "panicle_initiation", 49, 61, "transplanting", 5),
  st("mat", "maturity", 114, 119, "transplanting", 10), st("harv", "harvest", 114, 124, "transplanting", 11), st("post", "post_harvest", 125, 155, "transplanting", 11.5),
];
const OFFSET = 40;
const card = (name: string, stage: string, type: string, day: number, o: Partial<BaselineTask> = {}): BaselineTask => ({
  task_name: name, task_type: type, task_description: name, days_from_sowing: day, anchor_type: "STAGE", anchor_stage: stage, gdd_target: null,
  stage_key: `C_${stage.toUpperCase()}`, stage_uuid: stage, stage_name: stage, stage_order: 0, priority: "low", weather_dependent: false, nutrient: null, quantity: null,
  estimated_cost: null, rule_ids: [], confidence: null, source_refs: [], instructions: [], precautions: [], ...o,
});

describe("biological stage order", () => {
  const order = biologicalStageOrder(stages, OFFSET);
  it("follows the crop's biological sequence, not raw day numbers from mixed clocks", () => {
    expect(order.map((p) => p.stage.growth_stage)).toEqual(["nursery", "land_preparation", "transplanting", "transplant_establishment", "tillering", "panicle_initiation", "maturity", "harvest", "post_harvest"]);
  });
  it("puts each stage's window on the sowing axis", () => {
    const at = (g: string) => order.find((p) => p.stage.growth_stage === g)!;
    expect([at("transplant_establishment").from, at("transplant_establishment").to]).toEqual([40, 49]);
    expect([at("panicle_initiation").from, at("land_preparation").from]).toEqual([89, 15]);
  });
  it("keeps transplanting before establishment even when the field was planted earlier than the stage's nursery window", () => {
    const early = biologicalStageOrder(stages, 18).map((p) => p.stage.growth_stage);
    expect(early.indexOf("transplanting")).toBeLessThan(early.indexOf("transplant_establishment"));
  });
});

describe("schedule sequence", () => {
  const order = biologicalStageOrder(stages, OFFSET);
  const seq = (tasks: BaselineTask[]) => sequenceTasks(tasks, order).map((t) => t.task_name);
  it("transplanting day: basal fertilizer, plant, water, check — and only then the establishment stage's work", () => {
    expect(seq([
      card("est-water", "est", "irrigation", 40), card("est-check", "est", "monitoring", 40), card("est-feed", "est", "nutrition", 40), card("est-weed", "est", "weed_management", 40),
      card("tp-plant", "tp", "advisory", 40), card("tp-water", "tp", "irrigation", 40), card("tp-check", "tp", "monitoring", 40), card("tp-basal", "tp", "nutrition", 40),
    ])).toEqual(["tp-basal", "tp-plant", "tp-water", "tp-check", "est-feed", "est-weed", "est-water", "est-check"]);
  });
  it("nursery day: seed treatment, sow, water, check", () => {
    expect(seq([card("water", "nur", "irrigation", 0), card("check", "nur", "monitoring", 0), card("sow", "nur", "nursery", 0), card("seed-treatment", "nur", "nutrition", 0)]))
      .toEqual(["seed-treatment", "sow", "water", "check"]);
  });
  it("the maturity check comes before the harvest card on the same day, and land preparation before transplanting", () => {
    expect(seq([card("harvest", "harv", "harvest", 154), card("maturity-check", "mat", "monitoring", 154), card("plant", "tp", "advisory", 40), card("prepare-land", "land", "land_preparation", 15)]))
      .toEqual(["prepare-land", "plant", "maturity-check", "harvest"]);
  });
  it("writes the biological rank onto every card", () => {
    const out = sequenceTasks([card("a", "est", "irrigation", 40), card("b", "land", "land_preparation", 15)], order);
    expect(out.map((t) => [t.task_name, t.stage_order])).toEqual([["b", 2], ["a", 4]]);
  });
});

describe("rule timing inside the stage", () => {
  const order = biologicalStageOrder(stages, OFFSET);
  const off = (rule_id: string, offset_min: number, offset_max: number | null, stages: string[]): [string, RuleStageOffset] => [rule_id, { rule_id, offset_min, offset_max, stages }];
  const offsets = new Map([off("BGA", 8, 10, ["transplant_establishment"]), off("WEED", 15, 45, ["seedling", "transplant_establishment", "tillering"]), off("WATER", 0, 7, ["transplanting", "transplant_establishment"])]);
  it("dates each card from its rule: water from planting day, algae 8 days later, first weeding 15 days later", () => {
    const tasks = [card("weed", "est", "weed_management", 40, { rule_ids: ["WEED"] }), card("algae", "est", "nutrition", 40, { rule_ids: ["BGA"] }), card("water", "est", "irrigation", 40, { rule_ids: ["WATER"] })];
    expect(applyRuleStageOffsets(tasks, offsets, order)).toBe(3);
    expect(sequenceTasks(tasks, order).map((t) => [t.task_name, t.days_from_sowing])).toEqual([["water", 40], ["algae", 48], ["weed", 55]]);
    expect((tasks[1].resources as { window: Record<string, unknown> }).window).toMatchObject({ from_das: 48, to_das: 50, clock: "sowing" });
  });
  it("a card whose day falls in a later stage the rule covers becomes that stage's work; otherwise it stays", () => {
    const weed = card("weed", "est", "weed_management", 40, { rule_ids: ["WEED"] });
    const algae = card("algae", "est", "nutrition", 40, { rule_ids: ["BGA"] });
    applyRuleStageOffsets([weed, algae], offsets, order);
    expect([weed.stage_name, weed.stage_uuid]).toEqual(["tillering", "till"]);
    expect(algae.stage_name).toBe("est");
  });
  it("never moves a scouting card or a dosed card, and does nothing when no offsets are stored", () => {
    const scout = card("scout", "est", "monitoring", 40, { rule_ids: ["WEED"] });
    const dosed = card("dose", "est", "nutrition", 40, { rule_ids: ["BGA"], quantity: { value: 5, unit: "kg" } });
    expect(applyRuleStageOffsets([scout, dosed], offsets, order)).toBe(0);
    expect([scout.days_from_sowing, dosed.days_from_sowing]).toEqual([40, 40]);
    expect(applyRuleStageOffsets([card("x", "est", "nutrition", 40, { rule_ids: ["BGA"] })], new Map(), order)).toBe(0);
  });
});

// ── 2026-11-13 (agronomy round): dated cards keep their date; a moved card is named for its stage ──
import { consolidateByStage } from "../../supabase/functions/ai-smart-schedule/generator/stage-work-plan";
describe("dated operation inside a merged card", () => {
  const order = biologicalStageOrder(stages, 35);
  it("first weeding stays 15 days after transplanting, separate from a stage-long note on another day, and is named for tillering", () => {
    const weed = card("weed — transplant establishment", "est", "weed_management", 35, { rule_ids: ["WEED"] });
    const note = card("weekly walk", "till", "advisory", 45, { rule_ids: ["SCOUT"] });
    applyRuleStageOffsets([weed, note], new Map([["WEED", { rule_id: "WEED", offset_min: 15, offset_max: 45, stages: ["transplant_establishment", "tillering"] }]]), order);
    const out = consolidateByStage([weed, note]).tasks;
    // two events on two days: the weeding keeps its own date and is not folded into the note
    expect(out.map((t) => [t.task_name, t.days_from_sowing])).toEqual([["weekly walk", 45], ["weed — tillering", 50]]);
  });
});
