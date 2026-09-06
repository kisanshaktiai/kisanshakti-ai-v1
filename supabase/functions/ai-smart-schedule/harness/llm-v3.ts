// CHANGE LOG
// 2026-09-05 — Deadline-aware planner call. The caller passes an absolute deadline; each
//   provider gets ONE attempt bounded by the time that is actually left, a 429/5xx moves to
//   the next provider immediately (no Retry-After sleeps inside a request-scoped function),
//   and the prompt now states the full composition contract: every candidate appears exactly
//   once, ordering follows days_from_sowing + supplied dependency edges, CONDITIONAL must name
//   the supplied trigger, and every reason may cite ONLY supplied rule_ids / evidence fields.
//   Output schema is unchanged (schedule_plan_intent_v3) so validator.ts needs no change.
//   No crop-, language- or region-specific wording is introduced here.

import { buildAIRequest, getAPIEndpoint, getAPIKey, getScheduleProviderChain, type AIProvider } from "../../_shared/aiConfig.ts";
import type { PlanIntent, ScheduleHarnessContext } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 25_000;
const MIN_USEFUL_MS = 6_000;
const MAX_OUTPUT_TOKENS = 6_000;

export interface RequestPlanOptions { deadlineAt?: number }

const systemPrompt = () => [
  "You are the constrained agronomic planning model inside a high-assurance agricultural system.",
  "The database-backed evidence pack is the only source of agricultural facts. You compose a plan; you never create agronomy.",
  "The plan you return is rendered to a smallholder farmer as a dated, stage-by-stage crop schedule, so it must be complete, ordered and internally consistent.",
  "COMPOSITION CONTRACT:",
  "1. Every candidate id in `candidates` appears in `sequence` exactly once. Do not add ids that are not supplied. Do not drop any id.",
  "2. Every candidate with required=true keeps status SCHEDULED.",
  "3. Order by days_from_sowing ascending; a candidate must come after every id listed in its depends_on and after every edge that points to it. Use stage_order, then priority, to order candidates on the same day.",
  "4. An optional candidate may be SCHEDULED only when materializable=true and its supplied evidence authorizes an application at that stage. Otherwise use CONDITIONAL (a supplied trigger or condition_code must be met first), MONITOR (observation/scouting knowledge, no treatment implied) or INSUFFICIENT_DATA (evidence exists but does not authorize an application).",
  "5. Observation-triggered candidates (trigger_class OBSERVATION) are CONDITIONAL or MONITOR, never SCHEDULED.",
  "6. `reason` is one short sentence and may reference only the supplied rule_ids, condition_code, trigger_class, evidence fields and known_gaps. Never state a product, dose, quantity, date, PHI, threshold or stage that is not in the supplied candidate.",
  "7. `uncertainties` lists the supplied known_gaps that affect this plan, plus any candidate you set to INSUFFICIENT_DATA, in the form `<candidate_id>: <supplied reason>`.",
  "7b. `domain_coverage` classifies EVERY key of `domain_summary` plus every domain named in `audited_domains`: SCHEDULED (a dated application exists), CONDITIONAL (only trigger-gated candidates exist), MONITOR (observation-only), NOT_REQUIRED (evidence records no requirement), INSUFFICIENT_DATA (evidence exists without an authorized dose/form), NO_AUTHORITATIVE_RULE (no supplied candidate at all). This is a self-check on completeness; it must agree with `sequence`.",
  "8. The resolved context snapshot is factual request context only. It does NOT authorize deriving new agronomy from weather, soil, NDVI, dates, coordinates or model memory.",
  "9. Never invent or alter an input, product, quantity, dose, PHI, date, stage, trigger, dependency, regulatory fact or evidence. Never convert an evidence-only requirement into an application.",
  "10. Do not force every domain to appear. Preserve gaps. Dynamic weather/soil/NDVI adaptation belongs to the reconciler and Decision Brain, not to this plan.",
  "Return JSON only, matching schedule_plan_intent_v3. status is READY when every required candidate is SCHEDULED and the ordering rules hold; NEEDS_DATA when a required candidate cannot be placed from the supplied evidence; NO_VALID_PLAN only when the supplied candidates contradict each other.",
].join("\n");

const prompt = (c: ScheduleHarnessContext, errors: string[]) => JSON.stringify({
  crop_code: c.cropCode, cultivation_method: c.cultivationMethod, crop_cycle: c.cropCycle,
  resolved_context: c.contextSnapshot, known_gaps: c.gaps, domain_summary: c.evidencePack.domain_summary,
  candidate_count: c.graph.nodes.length,
  audited_domains: ["LAND_PREPARATION","SEED_TREATMENT","PLANTING","NUTRIENT","MICRONUTRIENT","ORGANIC_INPUT","BIOLOGICAL_INPUT","IRRIGATION","WEED","PEST","DISEASE","PGR","INTERCULTURAL","MONITORING","HARVEST","POST_HARVEST"],
  candidates: c.graph.nodes.map((n) => ({ id:n.id, required:n.required, materializable:n.materializable, default_status:n.default_status, domain:n.domain, task_type:n.task_type, days_from_sowing:n.days_from_sowing, stage_key:n.stage_key, stage_order:n.stage_order, priority:n.priority, weather_dependent:n.weather_dependent, trigger_class:n.trigger_class, condition_code:n.condition_code, depends_on:n.depends_on, rule_ids:n.rule_ids, evidence:n.evidence ?? null })),
  edges: c.graph.edges, previous_validation_errors: errors,
  required_output: {
    schema_version:"schedule_plan_intent_v3",
    status:"READY | NEEDS_DATA | NO_VALID_PLAN",
    sequence:[{ candidate_id:"task_0001", sequence_order:1, status:"SCHEDULED | CONDITIONAL | MONITOR | INSUFFICIENT_DATA", reason:"one short sentence citing only supplied fields" }],
    uncertainties:["<candidate_id or gap>: <supplied reason>"],
    domain_coverage:{"<DOMAIN>":"SCHEDULED | CONDITIONAL | MONITOR | NOT_REQUIRED | INSUFFICIENT_DATA | NO_AUTHORITATIVE_RULE"},
    reasoning_summary:"short non-authoritative planning summary",
  },
});

export async function requestPlan(context: ScheduleHarnessContext, repairErrors: string[] = [], options: RequestPlanOptions = {}): Promise<{ plan: PlanIntent; provider: AIProvider; model: string }> {
  const providers = getScheduleProviderChain();
  const remaining = () => options.deadlineAt ? options.deadlineAt - Date.now() : DEFAULT_TIMEOUT_MS;
  let lastError: unknown = new Error("MODEL_UNAVAILABLE");
  for (const { provider, model } of providers) {
    const key = getAPIKey(provider);
    if (!key) continue;
    const budget = Math.min(DEFAULT_TIMEOUT_MS, remaining());
    if (budget < MIN_USEFUL_MS) { lastError = new Error("MODEL_TIMEOUT"); break; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    try {
      const payload = buildAIRequest(provider, model, [{role:"system",content:systemPrompt()},{role:"user",content:prompt(context,repairErrors)}], {maxTokens:MAX_OUTPUT_TOKENS,temperature:0,useJsonMode:true});
      const response = await fetch(getAPIEndpoint(provider), {method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload),signal:controller.signal});
      if (!response.ok) {
        // 429 / 5xx: the next provider is the retry. Sleeping here only burns the request deadline.
        lastError = new Error(`MODEL_HTTP_${response.status}`);
        continue;
      }
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) { lastError = new Error("MODEL_EMPTY_RESPONSE"); continue; }
      const parsed = JSON.parse(content);
      return { plan: {
        schema_version: parsed.schema_version, status: parsed.status,
        sequence: Array.isArray(parsed.sequence) ? parsed.sequence.map((x: Record<string, unknown>) => ({candidate_id:String(x.candidate_id ?? ""),sequence_order:Number(x.sequence_order),status:String(x.status ?? "INSUFFICIENT_DATA") as PlanIntent["sequence"][number]["status"],reason:x.reason == null ? undefined : String(x.reason)})) : [],
        uncertainties: Array.isArray(parsed.uncertainties) ? parsed.uncertainties.map(String) : [], domain_coverage: parsed.domain_coverage && typeof parsed.domain_coverage === "object" ? Object.fromEntries(Object.entries(parsed.domain_coverage).map(([k,v]) => [String(k).toUpperCase(), String(v).toUpperCase()])) : undefined, reasoning_summary:String(parsed.reasoning_summary ?? "")
      }, provider, model };
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError" ? new Error("MODEL_TIMEOUT") : error;
      if (error instanceof SyntaxError) continue;
    } finally { clearTimeout(timer); }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
