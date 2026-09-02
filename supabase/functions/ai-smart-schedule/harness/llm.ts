import {
  buildAIRequest,
  getAPIEndpoint,
  getAPIKey,
  getScheduleProviderChain,
  type AIProvider,
} from "../../_shared/aiConfig.ts";
import type { PlanIntent, ScheduleHarnessContext } from "./types.ts";

const TIMEOUT = 12_000;
const systemPrompt = () => [
  "You are a constrained schedule planner inside a high-assurance agricultural system.",
  "Your model role is sequencing only, not agronomic reasoning.",
  "The candidate graph is authoritative and was produced by deterministic database-backed logic.",
  "You MUST preserve every candidate exactly once when status is READY.",
  "You may choose only a dependency-valid sequence already permitted by the supplied graph.",
  "Never invent, remove, rename, merge or duplicate candidates.",
  "Never invent quantities, dates, products, doses, PHI, stages, rules, evidence or agricultural facts.",
  "If the supplied graph cannot support a valid plan, return NEEDS_DATA or NO_VALID_PLAN.",
  "Return JSON only matching schedule_plan_intent_v2.",
].join("\n");

const prompt = (c: ScheduleHarnessContext, errors: string[]) => JSON.stringify({
  crop_code: c.cropCode,
  cultivation_method: c.cultivationMethod,
  crop_cycle: c.cropCycle,
  known_gaps: c.gaps,
  candidate_graph: {
    nodes: c.graph.nodes.map((n) => ({
      id: n.id,
      task_type: n.task_type,
      days_from_sowing: n.days_from_sowing,
      stage_key: n.stage_key,
      stage_order: n.stage_order,
      weather_dependent: n.weather_dependent,
      depends_on: n.depends_on,
      required: n.required,
    })),
    edges: c.graph.edges,
  },
  previous_validation_errors: errors,
  required_output: {
    schema_version: "schedule_plan_intent_v2",
    status: "READY | NEEDS_DATA | NO_VALID_PLAN",
    sequence: [{ candidate_id: "task_0001", sequence_order: 1 }],
    uncertainties: [],
    reasoning_summary: "short non-authoritative sequencing summary",
  },
});

export async function requestPlan(
  context: ScheduleHarnessContext,
  repairErrors: string[] = [],
): Promise<{ plan: PlanIntent; provider: AIProvider; model: string }> {
  const providers = getScheduleProviderChain();
  let lastError: unknown = new Error("MODEL_UNAVAILABLE");

  // Primary: GPT-5.6 Luna. Provider fallback: Gemini.
  for (const { provider, model } of providers) {
    const key = getAPIKey(provider);
    if (!key) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const payload = buildAIRequest(
        provider,
        model,
        [
          { role: "system", content: systemPrompt() },
          { role: "user", content: prompt(context, repairErrors) },
        ],
        // Candidate sequencing is deterministic by contract.
        { maxTokens: 2500, temperature: 0, useJsonMode: true },
      );
      const response = await fetch(getAPIEndpoint(provider), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`MODEL_HTTP_${response.status}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("MODEL_EMPTY_RESPONSE");
      const parsed = JSON.parse(content);
      return {
        plan: {
          schema_version: parsed.schema_version,
          status: parsed.status,
          sequence: Array.isArray(parsed.sequence)
            ? parsed.sequence.map((x: Record<string, unknown>) => ({
                candidate_id: String(x.candidate_id ?? ""),
                sequence_order: Number(x.sequence_order),
              }))
            : [],
          uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : [],
          reasoning_summary: String(parsed.reasoning_summary ?? ""),
        },
        provider,
        model,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
