// The narration sweeper must not mark a card as written when only its title was accepted.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../supabase/functions/_shared/aiConfig.ts", () => ({
  buildTaskRequest: (_m: unknown, messages: unknown) => ({ messages }), classifyAIFailure: () => "other", getAPIEndpoint: () => "http://model.invalid/v1",
  hasAIProviderKey: () => true, mergeAIRouteParams: () => ({}), noteAIKeyResponse: () => undefined, pickAIKey: async () => ({ slot: 1, apiKey: "k", pool: "p", group: "g" }),
  readAIUsage: () => ({}), recordAITaskCall: async () => undefined,
  resolveAITaskChain: async () => ({ ok: true, chain: [{ provider: "openai", api_model_id: "m", model_key: "m" }], params: {}, emergency: false }),
}));
import { narrateTasks } from "../../supabase/functions/ai-smart-schedule/generator/narrate";

const reply = (items: unknown[]) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(items) } }] }), { status: 200 })));
afterEach(() => vi.unstubAllGlobals());
const task = { task_name: "Water the nursery", task_description: "Irrigate the nursery bed every 2 days.", instructions: [] as string[] };
const ai = { db: { from: () => ({}) } } as never;

describe("narration sweeper acceptance", () => {
  it("a card whose title is translated but whose description came back in English stays pending", async () => {
    reply([{ i: 0, name: "रोपवाटिकेला पाणी", desc: "Irrigate the nursery bed every 2 days.", instructions: [] }]);
    const out = await narrateTasks([task], "mr", 30_000, ai);
    expect(out.appliedIndices).toEqual([]);
    expect(out.tasks[0].task_description).toBe("Irrigate the nursery bed every 2 days.");
    expect(out.tasks[0].task_name).toBe("Water the nursery");
  });
  it("a card with every field in the farmer's language is accepted", async () => {
    reply([{ i: 0, name: "रोपवाटिकेला पाणी", desc: "रोपवाटिकेच्या वाफ्याला दर 2 दिवसांनी पाणी द्या.", instructions: [] }]);
    const out = await narrateTasks([task], "mr", 30_000, ai);
    expect(out.appliedIndices).toEqual([0]);
    expect(out.tasks[0].task_description).toContain("2");
  });
});
