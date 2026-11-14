// Regression tests for live schedule 4fa451a0 (Rice Indrayani, transplanted, Kodoli; 2026-11-15 sample).
// The generator is REPLAYED on production-derived rows (fixtures/4fa451a0_tp_nursery.ts) through the
// deterministic post-harness steps index.ts runs. The farmer-language composer (an LLM) is not replayed;
// its acceptance rules are tested directly.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeTransplantOffset, generateBaseline, type BaselineTask } from "../../supabase/functions/ai-smart-schedule/generator/baseline-generator";
import { getStages } from "../../supabase/functions/ai-smart-schedule/db/agronomy-repo";
import { applyRuleStageOffsets, biologicalStageOrder, sequenceTasks } from "../../supabase/functions/ai-smart-schedule/generator/stage-sequence";
import { consolidateByStage, operationOrder } from "../../supabase/functions/ai-smart-schedule/generator/stage-work-plan";
import { detailedStepsOf, labelStageClock } from "../../supabase/functions/ai-smart-schedule/generator/timeline-integrity";
import { respectsFactBoundary, type TaskFacts } from "../../supabase/functions/ai-smart-schedule/generator/compose-farmer-text";
import { languageLabel, setLanguageDetector, wrongSameScriptLanguage, type DetectAll } from "../../supabase/functions/ai-smart-schedule/generator/language-guard";
import { buildStageTimeline } from "../../src/lib/scheduleStageTimeline";
import { fixture, INPUTS, VARIETY } from "./fixtures/4fa451a0_tp_nursery";
import { fakeSupabase } from "./fixtures/fake-supabase";

async function replay(migrated: boolean) {
  const db = fakeSupabase(fixture(migrated) as never) as never;
  const baseline = await generateBaseline(db, { ...INPUTS, gaps: [] } as never);
  const stageRows = await getStages(db, "rice", "universal", "transplanted", VARIETY);
  const offset = computeTransplantOffset(stageRows, INPUTS.sowingDate, INPUTS.transplantDate);
  const order = biologicalStageOrder(stageRows, offset);
  applyRuleStageOffsets(baseline.tasks, new Map(), order);
  labelStageClock(baseline.tasks, order, offset);
  const tasks = sequenceTasks(consolidateByStage(baseline.tasks).tasks, order);
  const nurseryDay0 = tasks.filter((t) => t.stage_key === "RICE_NURSERY" && t.days_from_sowing === 0);
  return { baseline, tasks, nurseryDay0 };
}
const textOf = (t: BaselineTask) => detailedStepsOf(t).join("\n");
const at = (steps: string[], needle: string) => steps.findIndex((s) => s.includes(needle));

describe("4fa451a0 — nursery practices were silently dropped (baseline duplicate merge)", () => {
  it("the fungicide seed dressing, seed rate and nursery bed reach the farmer card (code alone, before the data migration)", async () => {
    const { nurseryDay0 } = await replay(false);
    const all = nurseryDay0.map(textOf).join("\n");
    expect(all).toContain("Tricyclazole 75 WP @ 2 g/kg seed");            // was dropped on every transplanted schedule
    expect(all).toContain("30 to 40 kg of seed per hectare");
    expect(all).toContain("raised beds between 25 May and 7 July");
  });
});

describe("4fa451a0 — day-0 nursery order (after the data migration)", () => {
  it("one establishment card: select & float → fungicide dressing → biofertilizer → sow → bed, then water, then scouting", async () => {
    const { nurseryDay0 } = await replay(true);
    const types = nurseryDay0.map((t) => t.task_type);
    const est = nurseryDay0[0];
    expect(types.indexOf("irrigation")).toBeGreaterThan(0);
    expect(nurseryDay0.some((t) => t.task_type === "nutrition")).toBe(false);   // biofertilizer is no longer a field-feeding card
    const steps = detailedStepsOf(est);
    const select = at(steps, "Float the seed in water"), dress = at(steps, "Tricyclazole"), bio = at(steps, "Azotobacter"),
      sow = at(steps, "kg of seed for 3.51 acre"), bed = at(steps, "raised beds");
    for (const [name, i] of Object.entries({ select, dress, bio, sow, bed })) expect(i, name).toBeGreaterThanOrEqual(0);
    expect(select).toBeLessThan(dress);
    expect(dress).toBeLessThan(bio);
    expect(bio).toBeLessThan(sow);
    expect(bio).toBeLessThan(bed);
    expect(steps.join(" ")).not.toContain("then sow on a raised bed");      // sowing no longer precedes treatment
    expect(est.quantity).toEqual({ value: 49.72, unit: "kg" });              // the crop-standard seed rate stays
  });

  it("chaar sutri (a whole-season system with a 170 kg/ha briquette dose) is not a dated nursery card", async () => {
    const { tasks } = await replay(true);
    expect(tasks.flatMap((t) => t.rule_ids ?? [])).not.toContain("RICE_MGT_CHAAR_SUTRI_MH_001");
    expect(tasks.map(textOf).join("\n")).not.toContain("170 kg per hectare");
  });
});

describe("operationOrder — DB sequence_after and seed-before-sowing, crop-agnostic", () => {
  const card = (name: string, type: string, rules: string[] = [], after: string[] = []) =>
    ({ task_name: name, task_type: type, task_description: name, instructions: [], rule_ids: rules, days_from_sowing: 0, resources: after.length ? { sequence_after: after } : {} }) as unknown as BaselineTask;
  it("returns null when nothing orders the members (card folded exactly as before)", () => {
    expect(operationOrder([card("a", "advisory", ["A"]), card("b", "advisory", ["B"])])).toBeNull();
  });
  it("treats seed before sowing for any crop, and follows sequence_after edges", () => {
    const o = operationOrder([card("sow", "sowing"), card("treat", "seed_treatment", ["T"], ["S"]), card("select", "advisory", ["S"])])!;
    expect(o.map((t) => t.task_name)).toEqual(["select", "treat", "sow"]);
  });
  it("a cycle in the data falls back to generation order instead of guessing", () => {
    expect(operationOrder([card("a", "advisory", ["A"], ["B"]), card("b", "advisory", ["B"], ["A"])])).toBeNull();
  });
});

describe("4fa451a0 — Hindi text saved as Marathi (same-script language guard)", () => {
  // Real text from the schedule. A detector stand-in that returns what the trigram model returned on these
  // exact strings (Deno test persist… covers the real model): Hindi card → hin, Marathi cards → mar.
  const HINDI = "भात की पौधशाला \n अपने जिले के लिए सुझाया हुआ प्रमाणित बीज लें। बीज को पानी में डालें। जो बीज ऊपर तैरें, उन्हें निकाल दें। फिर ऊँची क्यारी पर बोएँ।";
  const MARATHI = "रोपवाटिका पाणी \n पेरणीनंतर 0 ते 24 दिवसांपर्यंत साधारण दर 2 दिवसांनी शेतातील पाणी पाहा. शेताला पाणी हवे असेल तेव्हा पाणी द्या.";
  const detect: DetectAll = (text) => (text.includes("पौधशाला") ? [["hin", 1], ["mar", 0.86]] : [["mar", 1], ["hin", 0.83]]);
  it("rejects a whole card written in another language of the same script", () => {
    expect(wrongSameScriptLanguage(HINDI, "mr", detect)).toBe("hi");
    expect(wrongSameScriptLanguage(MARATHI, "mr", detect)).toBeNull();
  });
  it("does not judge short titles, close calls, unsupported pairs or without a model", () => {
    expect(wrongSameScriptLanguage("भात की पौधशाला", "mr", detect)).toBeNull();                       // too short to judge
    expect(wrongSameScriptLanguage(HINDI, "mr", () => [["hin", 1], ["mar", 0.96]])).toBeNull();     // margin not met
    expect(wrongSameScriptLanguage(HINDI, "ta", detect)).toBeNull();                                // no same-script pair
    expect(wrongSameScriptLanguage(HINDI, "mr", null)).toBeNull();                                  // no model registered
  });
  it("the composer's fact boundary rejects the Hindi card when the model is registered", () => {
    const facts = { index: 0, task_type: "nursery", stage_name: "nursery", phase: null, days_from_sowing: 0, window: null,
      fallback_name: "Nursery", fallback_description: "Use certified seed.", fallback_instructions: [], quantity: null, water_volume: null,
      inputs: [], product_equivalents: [], phi_days: null, condition: null, recurrence: null, source_text: ["Use certified seed."] } as unknown as TaskFacts;
    const [name, desc] = HINDI.split(" \n ");
    setLanguageDetector(detect);
    try {
      expect(respectsFactBoundary({ task_name: name, task_description: desc, instructions: [] }, facts, "mr")).toBe(false);
    } finally { setLanguageDetector(null); }
  });
  it("the prompt names the language in full from the runtime's locale data", () => {
    expect(languageLabel("mr")).toMatch(/^mr \(Marathi/);
  });
});

describe("4fa451a0 — composer rules that caused the regression are gone", () => {
  const src = readFileSync("supabase/functions/ai-smart-schedule/generator/compose-farmer-text.ts", "utf8");
  it("no rule tells the model to translate the unit the fact boundary requires verbatim", () => {
    expect(src).not.toContain("carry the unit and the words into his language");
    expect(src).toContain("Keep only numerals, the unit of a supplied quantity, product names and fertilizer grades exactly as given.");
  });
  it("the composer gets the proven variety dossier, not the field dossier", () => {
    expect(readFileSync("supabase/functions/ai-smart-schedule/index.ts", "utf8")).toContain("composerVarietyView(varietyProfile))");
  });
});

describe("4fa451a0 — same-day cards shown in the generator's order, not fetch order", () => {
  it("the stage view sorts same-day tasks by sequence_order", () => {
    const t = (id: string, seq: number) => ({ id, task_date: "2026-05-25", status: "pending", stage_key: "RICE_NURSERY", stage_name: "nursery", sequence_order: seq });
    const [stage] = buildStageTimeline([t("scout", 4), t("water", 3), t("est", 1)], [{ stage_key: "RICE_NURSERY", stage_name: "nursery", order: 1 }]);
    expect(stage.tasks.map((x) => x.id)).toEqual(["est", "water", "scout"]);
  });
  it("the API orders same-day tasks by sequence_order", () => {
    expect(readFileSync("supabase/functions/schedules-api/index.ts", "utf8")).toContain("query.order('sequence_order', { ascending: true, nullsFirst: false })");
  });
});
