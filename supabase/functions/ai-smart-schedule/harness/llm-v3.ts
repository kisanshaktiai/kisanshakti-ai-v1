import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";
import type { PlanIntent, ScheduleHarnessContext } from "./types.ts";

const TIMEOUT = 20_000;
const RETRY_DELAYS_MS = [2_000, 6_000];

const systemPrompt = () => [
  "You are the constrained agronomic planning model inside a high-assurance agricultural system.",
  "The database-backed evidence pack is the only source of agricultural facts.",
  "Compose a practical crop plan only from supplied candidates: select, sequence, and classify them.",
  "The resolved context snapshot is factual request context only. It does NOT authorize deriving new agronomy from weather, soil, NDVI, dates, coordinates, or model memory.",
  "Every required baseline candidate must be retained as SCHEDULED.",
  "Optional CONTEXT_SCHEDULE candidates may be SCHEDULED only when they are materializable and their supplied evidence authorizes that status.",
  "Observation-triggered candidates must remain CONDITIONAL or MONITOR; never promote an observation candidate to SCHEDULED.",
  "Use INSUFFICIENT_DATA when supplied evidence is not sufficient to authorize an application.",
  "Never invent or alter an input, product, quantity, dose, PHI, date, stage, trigger, dependency, regulatory fact, or evidence.",
  "Never convert an evidence-only micronutrient requirement into an application dose.",
  "Do not force every domain to appear. Use only the supplied evidence and preserve gaps.",
  "Dynamic weather/soil/NDVI changes remain the responsibility of the existing reconciler and Decision Brain.",
  "Return JSON only matching schedule_plan_intent_v3.",
].join("\n");

const prompt = (c: ScheduleHarnessContext, errors: string[]) => JSON.stringify({
  crop_code: c.cropCode,
  cultivation_method: c.cultivationMethod,
  crop_cycle: c.cropCycle,
  resolved_context: c.contextSnapshot,
  known_gaps: c.gaps,
  domain_summary: c.evidencePack.domain_summary,
  candidates: c.graph.nodes.map((n) => ({
    id: n.id, required: n.required, materializable: n.materializable, default_status: n.default_status,
    domain: n.domain, task_type: n.task_type, days_from_sowing: n.days_from_sowing,
    stage_key: n.stage_key, stage_order: n.stage_order, priority: n.priority,
    weather_dependent: n.weather_dependent, trigger_class: n.trigger_class,
    condition_code: n.condition_code, depends_on: n.depends_on, rule_ids: n.rule_ids,
    evidence: n.evidence ?? null,
  })),
  edges: c.graph.edges,
  previous_validation_errors: errors,
  required_output: {
    schema_version: "schedule_plan_intent_v3",
    status: "READY | NEEDS_DATA | NO_VALID_PLAN",
    sequence: [{ candidate_id: "task_0001", sequence_order: 1, status: "SCHEDULED" }],
    uncertainties: [], reasoning_summary: "short non-authoritative planning summary",
  },
});

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function requestPlan(context: ScheduleHarnessContext, repairErrors: string[] = []): Promise<{ plan: PlanIntent; provider: AIProvider; model: string }> {
  const providers = getScheduleProviderChain();
  let lastError: unknown = new Error("MODEL_UNAVAILABLE");
  for (const { provider, model } of providers) {
    const key = getAPIKey(provider);
    if (!key) continue;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);
      try {
        const payload = buildAIRequest(
          provider, model,
          [{ role: "system", content: systemPrompt() }, { role: "user", content: prompt(context, repairErrors) }],
          { maxTokens: 3500, temperature: 0, useJsonMode: true },
        );
        const response = await fetch(getAPIEndpoint(provider), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
          body: JSON.stringify(payload), signal: controller.signal,
        });
        if (!response.ok) {
          const retryAfter = Number(response.headers.get("Retry-After") ?? "");
          const error = new Error(`MODEL_HTTP_${response.status}`);
          lastError = error;
          if (response.status === 429 || response.status >= 500) {
            if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(Math.min(retryAfter * 1000, 20_000));
            continue;
          }
          break;
        }
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) { lastError = new Error("MODEL_EMPTY_RESPONSE"); break; }
        const parsed = JSON.parse(content);
        return {
          plan: {
            schema_version: parsed.schema_version,
            status: parsed.status,
            sequence: Array.isArray(parsed.sequence) ? parsed.sequence.map((x: Record<string, unknown>) => ({
              candidate_id: String(x.candidate_id ?? ""),
              sequence_order: Number(x.sequence_order),
              status: String(x.status ?? "INSUFFICIENT_DATA") as PlanIntent["sequence"][number]["status"],
              reason: x.reason == null ? undefined : String(x.reason),
            })) : [],
            uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : [],
            reasoning_summary: String(parsed.reasoning_summary ?? ""),
          },
          provider, model,
        };
      } catch (error) {
        lastError = error;
        if (error instanceof SyntaxError) break;
      } finally { clearTimeout(timer); }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}