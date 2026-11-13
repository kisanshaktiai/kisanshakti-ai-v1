// Behavioural tests for the composer / day-0 changes of 2026-11-13. The AI control plane module is
// replaced by a minimal stand-in and global fetch by a recorder, so the REAL composeFarmerText runs
// end to end and the tests assert on the prompt it sends and on what it accepts.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../supabase/functions/_shared/aiConfig.ts", () => ({
  buildTaskRequest: (_m: unknown, messages: unknown) => ({ messages }),
  classifyAIFailure: () => "other",
  getAPIEndpoint: () => "http://model.invalid/v1",
  hasAIProviderKey: () => true,
  mergeAIRouteParams: () => ({}),
  noteAIKeyResponse: () => undefined,
  pickAIKey: async () => ({ slot: 1, apiKey: "k", pool: "p", group: "g" }),
  readAIUsage: () => ({}),
  recordAITaskCall: async () => undefined,
  resolveAITaskChain: async () => ({ ok: true, chain: [{ provider: "openai", api_model_id: "m", model_key: "m" }], params: {}, emergency: false }),
}));

import { composeFarmerText, numbersOf, respectsFactBoundary, type TaskFacts } from "../../supabase/functions/ai-smart-schedule/generator/compose-farmer-text";
import { establishmentDescription } from "../../supabase/functions/ai-smart-schedule/generator/establishment-text";

const facts = (index: number, o: Partial<TaskFacts> = {}): TaskFacts => ({
  index, task_type: "monitoring", stage_name: "Tillering", phase: null, days_from_sowing: 40, window: null,
  fallback_name: "Field check", fallback_description: "Walk the field and look at the plants.", fallback_instructions: [],
  quantity: null, water_volume: null, inputs: [], product_equivalents: [], phi_days: null, condition: null, recurrence: null,
  source_text: ["Walk the field and look at the plants."], ...o,
});
const MR = (text: string) => ({ task_name: "शेत तपासणी", task_description: text, instructions: [] as string[] });

/** Install a model that answers every task of the request with `reply(item)`; returns the prompts it saw. */
function installModel(reply: (taskIndex: number) => { task_name: string; task_description: string; instructions: string[] }) {
  const prompts: Array<Record<string, any>> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { messages: Array<{ content: string }> };
    const p = JSON.parse(body.messages[1].content) as Record<string, any>;
    prompts.push(p);
    const tasks = (p.tasks as Array<{ i: number }>).map((t) => ({ i: t.i, ...reply(t.i) }));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ tasks }) } }] }), { status: 200 });
  }));
  return prompts;
}
afterEach(() => { vi.unstubAllGlobals(); });
const ai = { db: { from: () => ({}) } };

describe("fact boundary: chemical formulas are names, not quantities", () => {
  it("numbersOf ignores formula subscripts but keeps every real quantity, even when glued to a unit", () => {
    expect(numbersOf("Potassium (K2O basis) 5.16 kg")).toEqual(["5.16"]);
    expect(numbersOf("P2O5 and ZnSO4 and NH4")).toEqual([]);
    expect(numbersOf("NPK 19:19:19, 25kg")).toEqual(["19", "19", "19", "25"]);
  });
  it("a correct translation that writes K2O is accepted even though the source sentence never mentions it", () => {
    const f = facts(0, { task_type: "nutrition", quantity: { value: 5.16, unit: "kg" }, fallback_name: "Apply Potassium (K2O basis) fertilizer", fallback_description: "Apply 5.16 kg Potassium to this field.", fallback_instructions: [], source_text: ["Apply 5.16 kg Potassium to this field."] });
    expect(respectsFactBoundary({ task_name: "पोटॅश (K2O) खत द्या", task_description: "या शेतात 5.16 kg पोटॅशियम खत द्या.", instructions: [] }, f, "mr")).toBe(true);
  });
  it("an invented or changed quantity is still rejected", () => {
    const f = facts(0, { task_type: "nutrition", quantity: { value: 5.16, unit: "kg" }, fallback_description: "Apply 5.16 kg Potassium to this field.", source_text: ["Apply 5.16 kg Potassium to this field."] });
    expect(respectsFactBoundary({ task_name: "पोटॅश (K2O) खत द्या", task_description: "या शेतात 6.16 kg पोटॅशियम खत द्या.", instructions: [] }, f, "mr")).toBe(false);
  });
});

describe("composer: stage-aware reuse", () => {
  it("identical wording at two different growth stages is composed as two tasks, so one stage's text cannot drift onto the other", async () => {
    const prompts = installModel(() => MR("शेतात जाऊन झाडे पहा."));
    const out = await composeFarmerText([facts(0, { stage_name: "Tillering" }), facts(1, { stage_name: "Booting" })], "mr", 60_000, ai);
    expect(prompts.flatMap((p) => p.tasks)).toHaveLength(2);
    expect(out.composedCount).toBe(2);
  });
  it("identical wording in the SAME stage is still composed once and reused", async () => {
    const prompts = installModel(() => MR("शेतात जाऊन झाडे पहा."));
    const out = await composeFarmerText([facts(0, { days_from_sowing: 40 }), facts(1, { days_from_sowing: 47 })], "mr", 60_000, ai);
    expect(prompts.flatMap((p) => p.tasks)).toHaveLength(1);
    expect(out.composedIndices).toEqual([0, 1]);
  });
  it("a reused composition that carries one task's day number is NOT copied onto a task due on another day", async () => {
    installModel(() => MR("४० ऐवजी 40 व्या दिवशी शेतात जाऊन झाडे पहा."));
    const out = await composeFarmerText([facts(0, { days_from_sowing: 40 }), facts(1, { days_from_sowing: 47 })], "mr", 60_000, ai);
    expect(out.composedIndices).toEqual([0]);
    expect(out.tasks[1].task_description).toBe("Walk the field and look at the plants.");
  });
});

describe("composer: selected crop context", () => {
  const view = { crop: "Rice", variety: "Rice Indrayani", stages: ["Nursery", "Tillering"], resistance: [{ threat: "Blast", level: "R" }] };
  it("sends the selected crop, variety and stages with rules that keep the text on that crop and stage", async () => {
    const prompts = installModel(() => MR("शेतात जाऊन झाडे पहा."));
    await composeFarmerText([facts(0)], "mr", 60_000, ai, view);
    expect(prompts[0].selected_crop).toEqual(view);
    const rules = (prompts[0].rules as string[]).join(" ");
    expect(rules).toContain("selected_crop");
    expect(rules).toContain("never copy a number");
    expect(rules).toContain("resistant variety cannot get a problem");
  });
  it("without a profile the prompt is unchanged: no selected_crop and no crop rules", async () => {
    const prompts = installModel(() => MR("शेतात जाऊन झाडे पहा."));
    await composeFarmerText([facts(0)], "mr", 60_000, ai);
    expect(prompts[0].selected_crop).toBeUndefined();
    expect((prompts[0].rules as string[]).join(" ")).not.toContain("selected_crop");
  });
});

describe("day-0 establishment card", () => {
  it("names the selected crop, variety and stage when the seed quantity is withheld", () => {
    const text = establishmentDescription({ cropLabel: "Rice", cropCode: "rice", varietyName: "Rice Indrayani", stageLabel: "Nursery", seedKg: null, areaAcres: 2 });
    expect(text).toContain("Rice (Rice Indrayani)");
    expect(text).toContain("Nursery stage");
    expect(text).toContain("pending verification");
    expect(text).not.toMatch(/\d/);
  });
  it("with a verified quantity it carries exactly that quantity and area, and no other number", () => {
    const text = establishmentDescription({ cropLabel: "Rice", cropCode: "rice", varietyName: "Rice Indrayani", stageLabel: "Nursery", seedKg: 8.5, areaAcres: 2 });
    expect(numbersOf(text)).toEqual(["8.5", "2"]);
    expect(text).toContain("Rice (Rice Indrayani)");
  });
  it("falls back to the crop code, and to a neutral subject when nothing is known, without inventing a name", () => {
    expect(establishmentDescription({ cropLabel: null, cropCode: "rice", varietyName: null, stageLabel: null, seedKg: null, areaAcres: null })).toMatch(/^Start rice using certified seed/);
    expect(establishmentDescription({ cropLabel: null, cropCode: null, varietyName: null, stageLabel: null, seedKg: null, areaAcres: null })).toMatch(/^Start the crop using certified seed/);
  });
});
