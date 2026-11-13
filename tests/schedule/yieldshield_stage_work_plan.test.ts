// Behavioural tests for the 2026-11-13 stage-wise work plan and variety stage windows.
import { describe, expect, it } from "vitest";
import { consolidateByStage, workGroupOf } from "../../supabase/functions/ai-smart-schedule/generator/stage-work-plan";
import { applyVarietyStageWindows, type StageRow, type VarietyStageWindow } from "../../supabase/functions/ai-smart-schedule/db/agronomy-repo";
import { computeTransplantOffset, toDas, type BaselineTask } from "../../supabase/functions/ai-smart-schedule/generator/baseline-generator";

const task = (o: Partial<BaselineTask>): BaselineTask => ({
  task_name: "t", task_type: "advisory", task_description: "", days_from_sowing: 0, anchor_type: "STAGE", anchor_stage: "S1", gdd_target: null,
  stage_key: "S1", stage_uuid: "s1", stage_name: "stage one", stage_order: 1, priority: "low", weather_dependent: false, nutrient: null, quantity: null,
  estimated_cost: null, rule_ids: [], confidence: null, source_refs: [], instructions: [], precautions: [], ...o,
});

describe("stage-wise work plan", () => {
  it("the nutrients given on the same stage become ONE feeding card that keeps every dose as its own input", () => {
    const out = consolidateByStage([
      task({ task_name: "N", task_type: "nutrition", nutrient: "N", quantity: { value: 35.51, unit: "kg" }, task_description: "Apply 35.51 kg of Nitrogen (N) to this field.", priority: "high", rule_ids: ["r1"], resources: { requirement_semantics: "BASELINE", product_equivalents: [{ product_name: "Urea", product_kg: 77.2 }] } }),
      task({ task_name: "K", task_type: "nutrition", nutrient: "K", quantity: { value: 17.75, unit: "kg" }, task_description: "Apply 17.75 kg of Potassium (K2O basis) to this field.", priority: "high", rule_ids: ["r2"], resources: { requirement_semantics: "BASELINE", product_equivalents: [{ product_name: "MOP", product_kg: 29.6 }] } }),
    ]);
    expect(out.tasks).toHaveLength(1);
    const card = out.tasks[0];
    expect(card.quantity).toBeNull();
    const inputs = (card.resources as { inputs: Array<{ nutrient: string; dose_value: number; dose_unit: string }> }).inputs;
    expect(inputs.map((i) => [i.nutrient, i.dose_value, i.dose_unit])).toEqual([["N", 35.51, "kg"], ["K", 17.75, "kg"]]);
    expect([card.task_description, ...card.instructions].join(" ")).toContain("17.75 kg");
    expect([card.task_description, ...card.instructions].join(" ")).toContain("35.51 kg");
    expect(card.task_name).toBe("Apply fertilizer: N + K");
    expect(card.task_description).toBe("Apply 35.51 kg of Nitrogen (N) to this field. Apply 17.75 kg of Potassium (K2O basis) to this field.");
    expect(card.instructions).toEqual([]);
    expect(card.rule_ids).toEqual(["r1", "r2"]);
    expect((card.resources as { product_equivalents: unknown[] }).product_equivalents).toHaveLength(2);
    expect((card.resources as { stage_work: { merged_count: number; group: string } }).stage_work).toMatchObject({ merged_count: 2, group: "nutrition" });
  });
  it("a stage card that only states its window takes the practice text of the stage's rule cards", () => {
    const out = consolidateByStage([
      task({ task_name: "Nursery management", task_type: "nursery", task_description: "Window: DAS 0 to 24 (nursery).", instructions: ["Window: DAS 0 to 24 (nursery)."], priority: "high", resources: { stage_window_card: true } }),
      task({ task_name: "Raise the nursery", task_type: "advisory", task_description: "Raise seedlings on a raised bed.", instructions: ["Keep the bed moist."], rule_ids: ["r9"] }),
      task({ task_name: "Sowing / planting", task_type: "sowing", task_description: "Start the crop using certified seed.", priority: "critical" }),
    ]);
    expect(out.tasks).toHaveLength(1);
    const card = out.tasks[0];
    expect(card.task_type).toBe("nursery");
    expect(card.priority).toBe("critical");
    expect(card.task_description).toBe("Raise seedlings on a raised bed.");
    expect(card.instructions).toEqual(["Keep the bed moist.", "Start the crop using certified seed."]);
    expect(card.instructions.join(" ")).not.toContain("Window:");
    expect(card.rule_ids).toEqual(["r9"]);
  });
  it("the scouting card leads the crop check and keeps its watch list; the critical water-stress check raises its priority", () => {
    const watch = [{ rule_id: "x", visible: true }];
    const out = consolidateByStage([
      task({ task_name: "Pest note", task_type: "pest_management", task_description: "Close old burrows on the bunds." }),
      task({ task_name: "Scouting", task_type: "monitoring", task_description: "Walk the field weekly.", resources: { watch_list: watch }, recurrence: { interval_days: 7, window_start: 50, window_end: 88, expected_events: 6 } }),
      task({ task_name: "Water stress", task_type: "monitoring", task_description: "Check standing water.", priority: "critical", resources: { critical_stage: true } }),
    ]);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0]).toMatchObject({ task_type: "monitoring", priority: "critical", task_description: "Walk the field weekly." });
    expect((out.tasks[0].resources as { watch_list: unknown }).watch_list).toBe(watch);
    expect(out.tasks[0].recurrence?.interval_days).toBe(7);
    expect(out.tasks[0].instructions).toEqual(["Close old burrows on the bunds.", "Check standing water."]);
  });
  it("different stages and different kinds of work are never merged, and a card with no stage is untouched", () => {
    const loose = task({ task_name: "loose", stage_uuid: null, stage_key: null, anchor_stage: null });
    const out = consolidateByStage([
      task({ task_name: "a", task_type: "irrigation" }), task({ task_name: "b", task_type: "nutrition" }),
      task({ task_name: "c", task_type: "irrigation", stage_uuid: "s2", stage_key: "S2", stage_order: 2, days_from_sowing: 30 }), loose,
    ]);
    expect(out.tasks).toHaveLength(4);
    expect(out.tasks).toContain(loose);
    expect(out).toMatchObject({ before: 4, after: 4, merged_groups: 0 });
  });
  it("a 41-card plan shaped like the audited rice schedule comes down to one card per stage and kind of work", () => {
    const shape: Array<[string, string, number]> = [
      ["nursery", "sowing", 1], ["nursery", "nutrition", 1], ["nursery", "advisory", 1], ["nursery", "irrigation", 1], ["nursery", "nursery", 1], ["nursery", "pest_management", 1], ["nursery", "monitoring", 1],
      ["land", "monitoring", 1], ["land", "land_preparation", 1],
      ["tp", "nutrition", 3], ["tp", "irrigation", 1], ["tp", "monitoring", 1], ["tp", "advisory", 1],
      ["est", "irrigation", 2], ["est", "weed_management", 1], ["est", "monitoring", 1], ["est", "nutrition", 1],
      ["till", "nutrition", 2], ["till", "advisory", 1], ["till", "irrigation", 1], ["till", "monitoring", 1],
      ["pi", "nutrition", 2], ["pi", "irrigation", 1], ["pi", "monitoring", 1],
      ["boot", "monitoring", 2], ["head", "monitoring", 2], ["flower", "monitoring", 2],
      ["grain", "monitoring", 1], ["grain", "irrigation", 1], ["mat", "monitoring", 1], ["harv", "harvest", 1], ["post", "post_harvest", 1], ["post", "advisory", 1],
    ];
    const tasks = shape.flatMap(([stage, type, n], si) => Array.from({ length: n }, (_, i) => task({ task_name: `${stage}-${type}-${i}`, task_type: type, stage_uuid: stage, stage_key: stage, stage_order: si, days_from_sowing: si })));
    expect(tasks).toHaveLength(41);
    const out = consolidateByStage(tasks);
    expect(out.after).toBe(29);
    const keys = out.tasks.map((t) => `${t.stage_uuid}|${workGroupOf(t.task_type)}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(out.tasks.flatMap((t) => ((t.resources as { stage_work?: { members: unknown[] } } | undefined)?.stage_work?.members ?? [t]))).toHaveLength(41);
  });
});

// ── Variety stage windows: the live rice rows for a medium-duration variety (transplanted) ─────
const stage = (id: string, code: string, growth: string, min: number, max: number, clock: string): StageRow => ({ id, crop_code: "rice", growth_stage: growth, stage_code: code, das_min: min, das_max: max, das_reference: clock, clock_reference: clock, gdd_min: null, gdd_max: null, base_temperature_c: null, cultivation_method: "transplanted", crop_cycle: "universal", is_moisture_critical: false, kc_coefficient: null, boundary_grace_days: 0 } as unknown as StageRow);
const win = (id: string, min: number | null, max: number | null, ref: string, method = "transplanted"): VarietyStageWindow => ({ stage_uuid: id, das_min_override: min, das_max_override: max, das_reference: ref, cultivation_method: method, source: "derived", calendar_reliability: "indicative" });
const generic = [
  stage("nur", "RICE_NURSERY", "nursery", 0, 24, "nursery_sowing"), stage("till", "RICE_TP_TILLERING", "tillering", 10, 34, "transplanting"),
  stage("pi", "RICE_TP_PANICLE_INITIATION", "panicle_initiation", 35, 49, "transplanting"), stage("boot", "RICE_TP_BOOTING", "booting", 50, 59, "transplanting"),
  stage("post", "RICE_TP_POST_HARVEST", "post_harvest", 125, 155, "transplanting"),
];

describe("variety stage windows", () => {
  it("the selected variety's own windows replace the crop-level ones, so panicle initiation is dated for that variety", () => {
    const rows = applyVarietyStageWindows(generic, [win("till", 10, 48, "transplanting"), win("pi", 49, 61, "transplanting"), win("boot", 62, 74, "transplanting")], "transplanted");
    const pi = rows.find((r) => r.id === "pi")!;
    expect([pi.das_min, pi.das_max, pi.variety_window_source]).toEqual([49, 61, "derived"]);
    const offset = computeTransplantOffset(rows, "2026-05-26", "2026-07-05");
    expect(offset).toBe(40);
    expect(toDas(pi, pi.das_min, offset)).toBe(89);
  });
  it("a stage with no variety row keeps the crop-level window", () => {
    const rows = applyVarietyStageWindows(generic, [win("pi", 49, 61, "transplanting")], "transplanted");
    expect(rows.find((r) => r.id === "post")).toMatchObject({ das_min: 125, das_max: 155 });
    expect(rows.find((r) => r.id === "post")!.variety_window_source).toBeUndefined();
  });
  it("a window counted on a different clock, for another method, incomplete or inverted is NOT applied", () => {
    const rows = applyVarietyStageWindows(generic, [win("pi", 60, 70, "nursery_sowing"), win("boot", 62, 74, "transplanting", "direct_seeded"), win("till", 10, null, "transplanting"), win("nur", 30, 5, "nursery_sowing")], "transplanted");
    expect(rows.map((r) => [r.id, r.das_min, r.das_max])).toEqual(generic.map((r) => [r.id, r.das_min, r.das_max]));
  });
  it("no variety rows leaves the stage list unchanged", () => {
    expect(applyVarietyStageWindows(generic, [], "transplanted")).toBe(generic);
  });
});
