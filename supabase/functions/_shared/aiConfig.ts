// Centralized AI Configuration

// AI Provider types
// 2026-09-08 — "lovable" is the managed Lovable AI Gateway (LOVABLE_API_KEY). It is added as a
// narration provider because direct OpenAI/Gemini keys were returning sustained HTTP 429 during
// schedule narration, which left farmer schedules half-English.
export type AIProvider = "openai" | "google" | "gemini" | "lovable";

// Model configurations: OpenAI GPT-5.6 Luna primary, Gemini provider fallback
export const AI_MODELS = {
  openai: {
    // GPT-5.6 Luna is the primary high-volume production model.
    default: "gpt-5.6-luna",
    fallback: "gpt-5.6-luna",
    premium: "gpt-5.6-terra",
    vision: "gpt-5.6-luna",
  },
  google: {
    default: "google/gemini-2.5-flash",
    fallback: "google/gemini-2.5-flash-lite", 
    premium: "google/gemini-2.5-pro",
  },
  gemini: {
    // PRODUCTION: Gemini 2.5 Flash - best balance of speed, quality, and rural language support
    default: "gemini-2.5-flash",
    fallback: "gemini-2.0-flash",
    premium: "gemini-2.5-pro",
  },
  lovable: {
    default: "google/gemini-2.5-flash",
    fallback: "google/gemini-2.5-flash-lite",
    premium: "google/gemini-2.5-pro",
  },
} as const;

// API endpoints
export const AI_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", // Use Gemini directly
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  lovable: "https://ai.gateway.lovable.dev/v1/chat/completions",
} as const;

export const AI_CONFIG = {
  // Default provider - OpenAI preferred for reliable JSON structured output
  DEFAULT_PROVIDER: "openai" as AIProvider,
  
  // Primary schedule model. Gemini is used only after OpenAI provider failure.
  MODEL: "gpt-5.6-luna",
  OPENAI_MODEL: "gpt-5.6-luna",
  GOOGLE_MODEL: "google/gemini-2.5-flash",
  GEMINI_MODEL: "gemini-2.5-flash",
  
  // Vision model for image/crop analysis
  VISION_MODEL: "gpt-4o",
  
  // Fallback models for retry logic
  FALLBACK_MODEL: "gemini-2.0-flash",
  // Schedule fallback is provider-level Gemini, not an older OpenAI model.
  OPENAI_FALLBACK: "gpt-5.6-luna",
  GOOGLE_FALLBACK: "google/gemini-2.5-flash-lite",
  GEMINI_FALLBACK: "gemini-2.0-flash",

  // Token limits - optimized for detailed schedules without timeouts
  MAX_TOKENS: 4096,
  MAX_TOKENS_SCHEDULE: 16000,
  MAX_TOKENS_CHAT: 4096,
  MAX_TOKENS_ANALYSIS: 4096,

  // Rate limiting configuration
  RATE_LIMIT_SCHEDULE: { maxRequests: 30, windowMs: 60000 },
  RATE_LIMIT_CHAT: { maxRequests: 60, windowMs: 60000 },
  RATE_LIMIT_ANALYSIS: { maxRequests: 20, windowMs: 60000 },
  
  // Request timeout (55s to stay under Supabase 60s limit)
  REQUEST_TIMEOUT: 55000,
} as const;

// Legacy export for backward compatibility
export const OPENAI_API_URL = AI_ENDPOINTS.openai;

// Get the appropriate API endpoint for the provider
export function getAPIEndpoint(provider: AIProvider): string {
  return AI_ENDPOINTS[provider];
}

// Get the API key for the specified provider
export function getAPIKey(provider: AIProvider): string {
  if (provider === 'lovable') {
    const key = Deno.env.get("LOVABLE_API_KEY");
    return key && key.trim() !== "" ? key : "";
  }
  if (provider === 'openai') {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey && openaiKey.trim() !== "") {
      console.log("✅ [AIConfig] Using OPENAI_API_KEY for provider: openai");
      return openaiKey;
    }
    console.log("⚠️ [AIConfig] OpenAI provider requested but OPENAI_API_KEY not configured");
    return ""; // Return empty for backward compatibility
  }
  
  if (provider === 'gemini' || provider === 'google') {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey && geminiKey.trim() !== "") {
      console.log(`✅ [AIConfig] Using GEMINI_API_KEY for provider: ${provider}`);
      return geminiKey;
    }
    console.log(`⚠️ [AIConfig] Gemini provider requested but GEMINI_API_KEY not configured`);
    return ""; // Return empty for backward compatibility
  }
  
  console.log(`⚠️ [AIConfig] Unknown provider: ${provider}`);
  return "";
}

// Get any available API key (for backward compatibility)
export function getAnyAPIKey(): string {
  // OpenAI first for all generic compatibility callers.
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey && openaiKey.trim() !== "") return openaiKey;

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey && geminiKey.trim() !== "") return geminiKey;
  
  throw new Error("No AI API keys configured. Please add GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets.");
}

// Check if OpenAI API key is available
export function hasOpenAIKey(): boolean {
  const key = Deno.env.get("OPENAI_API_KEY");
  return !!(key && key.trim() !== "");
}

// Get the best available provider with matching key - CRITICAL for preventing 401 errors
export function getBestAvailableProvider(): { 
  provider: AIProvider; 
  model: string; 
  apiKey: string 
} {
  // CRITICAL FIX: OpenAI FIRST - Gemini's OpenAI-compatible endpoint returns
  if (hasOpenAIKey()) {
    console.log("✅ [AIConfig] getBestAvailableProvider: Using OpenAI (primary - reliable JSON)");
    return { 
      provider: "openai", 
      model: AI_MODELS.openai.default,
      apiKey: Deno.env.get("OPENAI_API_KEY")!
    };
  }
  
  // Fallback to Gemini if OpenAI not available
  if (hasGeminiKey()) {
    console.log("✅ [AIConfig] getBestAvailableProvider: Using Gemini (fallback)");
    return { 
      provider: "gemini", 
      model: AI_MODELS.gemini.default,
      apiKey: Deno.env.get("GEMINI_API_KEY")!
    };
  }
  
  throw new Error("No AI API keys configured. Please add GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets.");
}

// Validate OpenAI API key exists in Supabase secrets
export function validateOpenAIKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key || key.trim() === "") {
    throw new Error("No AI API keys configured. Please add GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets.");
  }
  console.log("✅ [AIConfig] Using OPENAI_API_KEY from Supabase secrets");
  return key;
}

// Check if Gemini API key is available in secrets
export function hasGeminiKey(): boolean {
  const key = Deno.env.get("GEMINI_API_KEY");
  return !!(key && key.trim() !== "");
}

// Check if any AI API key is configured (Gemini or OpenAI only)
export function hasAnyAIKey(): boolean {
  return hasGeminiKey() || !!(Deno.env.get("OPENAI_API_KEY")?.trim());
}

// Get the model for the specified provider
export function getModel(provider: AIProvider, tier: "default" | "fallback" | "premium" | "vision" = "default"): string {
  if (tier === "vision" && provider === "openai") {
    return AI_MODELS.openai.vision;
  }
  return AI_MODELS[provider][tier as "default" | "fallback" | "premium"] || AI_MODELS[provider].default;
}

// Determine provider from model name
export function getProviderFromModel(model: string): AIProvider {
  if (model.startsWith("google/") || model.startsWith("gemini-flash")) {
    return "google";
  }
  if (model.startsWith("gemini-")) {
    return "gemini";
  }
  return "openai";
}

// Newer OpenAI models (gpt-5.x, and the o1/o3/o4 reasoning families) differ from
// the legacy Chat Completions contract in two ways, both verified live 2026-09-04:
//   1. they only accept `max_completion_tokens`; `max_tokens` returns HTTP 400;
//   2. they only accept the DEFAULT temperature (1); any other value returns
//      HTTP 400 ("'temperature' does not support 0.3 with this model").
// Legacy chat models (gpt-4o, gpt-4, gpt-3.5) keep `max_tokens` + free temperature.
// Matches on the model string so new model IDs in the same families need no code change.
export function isNextGenOpenAIModel(model: string): boolean {
  const m = (model || "").toLowerCase();
  return /(^|[/_-])(gpt-5|o1|o3|o4)/.test(m);
}
export function requiresMaxCompletionTokens(model: string): boolean {
  return isNextGenOpenAIModel(model);
}
/** true when the provider+model pair rejects a caller-supplied temperature. */
export function rejectsCustomTemperature(provider: AIProvider, model: string): boolean {
  return provider === "openai" && isNextGenOpenAIModel(model);
}

// Get the best available provider for schedule generation
export function getBestScheduleProvider(): { provider: AIProvider; model: string } {
  // CRITICAL FIX: OpenAI FIRST for schedule generation (reliable structured output)
  if (hasOpenAIKey()) {
    console.log("🚀 [AIConfig] Using OpenAI for schedule generation (primary)");
    // Schedule planner/narrator can be pinned by secret without code changes.
    // Default is a current balanced reasoning model; general chat defaults remain unchanged.
    const scheduleModel = Deno.env.get("OPENAI_SCHEDULE_MODEL")?.trim() || "gpt-5.6-luna";
    return { provider: "openai", model: scheduleModel };
  }
  
  // Fallback to Gemini if OpenAI not available
  if (hasGeminiKey()) {
    console.log("🔄 [AIConfig] Falling back to Gemini for schedule generation");
    return { provider: "gemini", model: AI_MODELS.gemini.default };
  }
  
  throw new Error("No AI API keys configured. Please add GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets.");
}

// Ordered schedule provider chain. OpenAI is always attempted first when configured;
// Gemini is used only as a provider fallback after an OpenAI request failure.
export function getScheduleProviderChain(): Array<{ provider: AIProvider; model: string }> {
  const chain: Array<{ provider: AIProvider; model: string }> = [];
  // Managed gateway first: direct OpenAI/Gemini keys were rate-limiting narration to a standstill.
  if (getAPIKey("lovable")) {
    chain.push({
      provider: "lovable",
      model: Deno.env.get("LOVABLE_SCHEDULE_MODEL")?.trim() || AI_MODELS.lovable.default,
    });
  }
  if (hasOpenAIKey()) {
    chain.push({
      provider: "openai",
      model: Deno.env.get("OPENAI_SCHEDULE_MODEL")?.trim() || "gpt-5.6-luna",
    });
  }
  if (hasGeminiKey()) {
    chain.push({
      provider: "gemini",
      model: Deno.env.get("GEMINI_SCHEDULE_FALLBACK_MODEL")?.trim() || AI_MODELS.gemini.default,
    });
  }
  if (!chain.length) throw new Error("No AI API keys configured. Please add OPENAI_API_KEY or GEMINI_API_KEY in Supabase secrets.");
  return chain;
}

// Validate configuration before making AI calls
export function validateAIConfig(): { valid: boolean; error?: string; provider?: AIProvider } {
  if (!hasAnyAIKey()) {
    return { 
      valid: false, 
      error: "No AI API keys configured. Please add OPENAI_API_KEY (primary) or GEMINI_API_KEY (fallback) in Supabase secrets." 
    };
  }
  
  const { provider } = getBestScheduleProvider();
  return { valid: true, provider };
}

// Build AI request payload - handles differences between OpenAI, Google, and Gemini
export function buildAIRequest(
  provider: AIProvider,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens?: number;
    tools?: any[];
    toolChoice?: any;
    temperature?: number;
    useJsonMode?: boolean;
  } = {}
): any {
  const payload: any = {
    model,
    messages,
  };

  // Token limit handling.
  // FIX (outage 2026-09-04): newer OpenAI models (gpt-5.x and o-series reasoning
  // models) reject the legacy `max_tokens` and require `max_completion_tokens`
  // ("Unsupported parameter: 'max_tokens' is not supported with this model. Use
  // 'max_completion_tokens' instead."). Gemini's OpenAI-compatible endpoint still
  // uses `max_tokens`. Choose the key by provider + model so every buildAIRequest
  // caller is fixed centrally, with no caller-side changes.
  if (options.maxTokens) {
    if (provider === "openai" && requiresMaxCompletionTokens(model)) {
      payload.max_completion_tokens = options.maxTokens;
    } else {
      payload.max_tokens = options.maxTokens;
    }
  }

  // GPT-5.x on /v1/chat/completions runs with reasoning on by default, which silently consumed the
  // whole output budget and returned empty content during schedule narration.
  if (provider === "openai" && isNextGenOpenAIModel(model)) {
    payload.reasoning_effort = "none";
  }

  // Temperature - Gemini works better with controlled temperature.
  // FIX (outage 2026-09-04, second 400 after the max_tokens fix): gpt-5.x / o-series
  // reject every non-default temperature ("Only the default (1) value is
  // supported"). For those models the key is simply not sent — the API then uses
  // its default. Every other provider/model keeps the existing behaviour exactly.
  if (rejectsCustomTemperature(provider, model)) {
    // intentionally no payload.temperature
  } else if (options.temperature !== undefined) {
    payload.temperature = options.temperature;
  } else {
    // Lower temperature for structured outputs
    payload.temperature = (provider === "gemini" || provider === "lovable") ? 0.4 : 0.7;
  }

  // For Gemini, prefer JSON mode over tool calling for complex schedules
  // Gemini's function calling has limitations with complex nested schemas
  if ((provider === "gemini" || provider === "lovable") && options.useJsonMode !== false) {
    // Skip tools for Gemini - use JSON mode instead
    // The system prompt should instruct to return JSON
    payload.response_format = { type: "json_object" };
    console.log("🔧 [AIConfig] Using JSON mode for Gemini (better for complex structures)");
    return payload;
  }

  // Tools/function calling for OpenAI and Google
  if (options.tools && provider !== "gemini") {
    payload.tools = options.tools;
    
    // Tool choice handling
    if (options.toolChoice) {
      if (provider === "google") {
        // Lovable AI Gateway / Google uses "auto" or "required" as string
        if (typeof options.toolChoice === 'object' && options.toolChoice.type === 'function') {
          payload.tool_choice = "required";
        } else {
          payload.tool_choice = options.toolChoice;
        }
      } else {
        // OpenAI format
        payload.tool_choice = options.toolChoice;
      }
    }
  }

  return payload;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI MODEL REGISTRY ROUTER — 2026-09-25, AI model SSOT Phase 1
// ───────────────────────────────────────────────────────────────────────────
// Callers name a TASK, never a model:  callAITask({ db, task: 'brain.explain', … })
//   * the chain of models comes from the database (ai_task_route →
//     ai_task_route_step → ai_model_catalog, migration 20260925120000);
//   * each request is built from the model's api_contract row (token
//     parameter, temperature rule, accepted reasoning efforts) — not from the
//     model name, so a new model family needs a catalog row, not a code change;
//   * steps are tried in order; a step is skipped when its provider key is not
//     configured or the provider is cooling down after a 429 (narrate.ts rule);
//   * every attempted call writes ONE row to the usage ledger ai_model_metrics
//     (tokens, cost from ai_model_pricing, fallback, failure class, latency).
// Registry cache: 10 min TTL, single-flight (utils/db-ssot/system-config-cache
// pattern). If a refresh fails the previous snapshot keeps serving. Only on a
// cold start with the database unreachable does the call fall back to
// AI_MODELS.openai.default above, logged as [AIRegistry] EMERGENCY_DEFAULT.
// Values a call site passes (maxOutputTokens, temperature, reasoningEffort,
// jsonMode) are defaults; ai_task_route.params, when set, overrides them.
// Nothing above this section is changed.
// ═══════════════════════════════════════════════════════════════════════════

/** Service-role Supabase client (only .from() is used). */
// deno-lint-ignore no-explicit-any
type RegistryDb = { from(table: string): any };

export interface AIModelContract {
  token_param: "max_tokens" | "max_completion_tokens";
  temperature: "allowed" | "omit";
  reasoning_efforts: string[];
}
export interface AICatalogModel {
  model_key: string;
  provider: AIProvider;
  api_model_id: string;
  status: "candidate" | "active" | "deprecated" | "retired";
  input_modalities: string[];
  api_contract: AIModelContract;
}
interface AIRouteParams { max_output_tokens?: number; temperature?: number; reasoning_effort?: string; json_mode?: boolean }
interface AITaskRoute { task_key: string; is_active: boolean; params: AIRouteParams; steps: string[] }
interface AIPriceRow {
  id: string;
  model_name: string;
  input_cost_per_1k: number;
  cached_input_cost_per_1k: number | null;
  output_cost_per_1k: number;
  effective_from: string;
}
interface AIRegistrySnapshot {
  loadedAt: number;
  models: Map<string, AICatalogModel>;
  routes: Map<string, AITaskRoute>;
  prices: Map<string, AIPriceRow[]>; // newest effective_from first
}

/** Failure classes — identical to the ai_model_metrics.error_class CHECK list. */
export type AICallErrorClass =
  | "rate_limited" | "quota_exhausted" | "model_retired" | "contract_rejected"
  | "server_error" | "timeout" | "network" | "empty_output" | "other";

export interface AITaskCall {
  db: RegistryDb;
  task: string;
  functionName: string;
  // deno-lint-ignore no-explicit-any
  messages: Array<{ role: string; content: any }>;
  farmerId?: string | null;
  maxOutputTokens?: number;
  temperature?: number;
  reasoningEffort?: string;
  jsonMode?: boolean;
  /** Whole-call budget across all steps; default AI_CONFIG.REQUEST_TIMEOUT. */
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}
export interface AICallUsage { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_tokens: number }
interface AIAttempt { model_key: string; outcome: "ok" | AICallErrorClass | "skipped_no_key" | "skipped_cooldown"; http_status?: number; ms?: number }
export type AITaskResult =
  | { ok: true; content: string; modelKey: string; provider: AIProvider; fallbackUsed: boolean; usage: AICallUsage; costUsd: number | null; attempts: AIAttempt[] }
  | { ok: false; errorClass: AICallErrorClass | "route_missing" | "route_inactive" | "no_provider_available"; detail: string; attempts: AIAttempt[] };

const AI_REGISTRY_TTL_MS = 10 * 60 * 1000;       // same TTL as system-config-cache.ts
const AI_PROVIDER_COOLDOWN_DEFAULT_MS = 5_000;   // narrate.ts default when no Retry-After
const AI_PROVIDER_COOLDOWN_MAX_MS = 8_000;       // narrate.ts MAX_RETRY_AFTER_MS
const AI_MIN_ATTEMPT_MS = 1_000;

let aiRegistry: AIRegistrySnapshot | null = null;
let aiRegistryLoading: Promise<AIRegistrySnapshot | null> | null = null;
const aiProviderCooldownUntil = new Map<AIProvider, number>();

async function fetchAIRegistry(db: RegistryDb): Promise<AIRegistrySnapshot> {
  const [cat, routes, steps, prices] = await Promise.all([
    db.from("ai_model_catalog").select("model_key,provider,api_model_id,status,input_modalities,api_contract"),
    db.from("ai_task_route").select("task_key,is_active,params"),
    db.from("ai_task_route_step").select("task_key,step_no,model_key").order("step_no", { ascending: true }),
    db.from("ai_model_pricing")
      .select("id,model_name,input_cost_per_1k,cached_input_cost_per_1k,output_cost_per_1k,effective_from,currency")
      .eq("is_active", true)
      .order("effective_from", { ascending: false }),
  ]);
  for (const [name, r] of [["ai_model_catalog", cat], ["ai_task_route", routes], ["ai_task_route_step", steps], ["ai_model_pricing", prices]] as const) {
    if (r?.error || !Array.isArray(r?.data)) throw new Error(`${name}: ${r?.error?.message ?? "no data"}`);
  }
  const models = new Map<string, AICatalogModel>();
  for (const m of cat.data) models.set(m.model_key, m as AICatalogModel);
  const routeMap = new Map<string, AITaskRoute>();
  for (const r of routes.data) routeMap.set(r.task_key, { task_key: r.task_key, is_active: r.is_active === true, params: r.params ?? {}, steps: [] });
  for (const s of steps.data) routeMap.get(s.task_key)?.steps.push(s.model_key);
  const priceMap = new Map<string, AIPriceRow[]>();
  for (const p of prices.data) {
    if (p.currency !== "USD") continue;
    const row: AIPriceRow = {
      id: p.id,
      model_name: p.model_name,
      input_cost_per_1k: Number(p.input_cost_per_1k),
      cached_input_cost_per_1k: p.cached_input_cost_per_1k === null || p.cached_input_cost_per_1k === undefined ? null : Number(p.cached_input_cost_per_1k),
      output_cost_per_1k: Number(p.output_cost_per_1k),
      effective_from: String(p.effective_from),
    };
    const list = priceMap.get(row.model_name) ?? [];
    list.push(row);
    priceMap.set(row.model_name, list);
  }
  return { loadedAt: Date.now(), models, routes: routeMap, prices: priceMap };
}

/** Loads (or returns the cached) registry. Returns the previous snapshot if a refresh fails; null only on a cold start with the database unreachable. */
export async function loadAIRegistry(db: RegistryDb, opts: { force?: boolean } = {}): Promise<AIRegistrySnapshot | null> {
  if (!opts.force && aiRegistry && Date.now() - aiRegistry.loadedAt < AI_REGISTRY_TTL_MS) return aiRegistry;
  if (aiRegistryLoading) return aiRegistryLoading;
  aiRegistryLoading = fetchAIRegistry(db)
    .then((snap) => { aiRegistry = snap; return snap; })
    .catch((e) => {
      console.error(`[AIRegistry] load failed: ${e instanceof Error ? e.message : String(e)} — ${aiRegistry ? "serving previous snapshot" : "no snapshot yet"}`);
      return aiRegistry;
    })
    .finally(() => { aiRegistryLoading = null; });
  return aiRegistryLoading;
}

/** Builds a Chat Completions body from the model's contract row. */
export function buildTaskRequest(
  model: AICatalogModel,
  // deno-lint-ignore no-explicit-any
  messages: Array<{ role: string; content: any }>,
  opts: { maxOutputTokens?: number; temperature?: number; reasoningEffort?: string; jsonMode?: boolean } = {},
): Record<string, unknown> {
  const c = model.api_contract;
  const body: Record<string, unknown> = { model: model.api_model_id, messages };
  if (opts.maxOutputTokens !== undefined) body[c.token_param] = opts.maxOutputTokens;
  if (opts.temperature !== undefined && c.temperature === "allowed") body.temperature = opts.temperature;
  if (opts.reasoningEffort !== undefined && c.reasoning_efforts.includes(opts.reasoningEffort)) body.reasoning_effort = opts.reasoningEffort;
  if (opts.jsonMode === true) body.response_format = { type: "json_object" };
  return body;
}

export function classifyAIFailure(httpStatus: number, bodyText: string): AICallErrorClass {
  const b = (bodyText || "").toLowerCase();
  if (httpStatus === 429) return b.includes("insufficient_quota") || b.includes("exceeded your current quota") ? "quota_exhausted" : "rate_limited";
  if (httpStatus === 404 || b.includes("model_not_found") || b.includes("no longer available") || b.includes("does not exist")) return "model_retired";
  if (httpStatus === 400 || httpStatus === 422) return "contract_rejected";
  if (httpStatus >= 500) return "server_error";
  return "other";
}

/** Cost of one call from the newest active price row effective on or before the call date. null when no price is known. */
export function priceAICall(prices: AIPriceRow[] | undefined, usage: AICallUsage, callDate: string): { costUsd: number | null; priceId: string | null } {
  const p = (prices ?? []).find((r) => r.effective_from <= callDate);
  if (!p) return { costUsd: null, priceId: null };
  const uncached = Math.max(usage.input_tokens - usage.cached_input_tokens, 0);
  const cachedRate = p.cached_input_cost_per_1k ?? p.input_cost_per_1k;
  const cost = (uncached * p.input_cost_per_1k + usage.cached_input_tokens * cachedRate + usage.output_tokens * p.output_cost_per_1k) / 1000;
  return { costUsd: Math.round(cost * 1e8) / 1e8, priceId: p.id };
}

function emergencyModel(): AICatalogModel {
  const id = AI_MODELS.openai.default;
  return {
    model_key: `openai:${id}`, provider: "openai", api_model_id: id, status: "active", input_modalities: ["text"],
    api_contract: {
      token_param: requiresMaxCompletionTokens(id) ? "max_completion_tokens" : "max_tokens",
      temperature: rejectsCustomTemperature("openai", id) ? "omit" : "allowed",
      reasoning_efforts: [],
    },
  };
}

function readUsage(json: any): AICallUsage {
  const u = json?.usage ?? {};
  return {
    input_tokens: Number(u.prompt_tokens ?? 0),
    cached_input_tokens: Number(u.prompt_tokens_details?.cached_tokens ?? 0),
    output_tokens: Number(u.completion_tokens ?? 0),
    reasoning_tokens: Number(u.completion_tokens_details?.reasoning_tokens ?? 0),
  };
}

async function writeAILedger(db: RegistryDb, row: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await db.from("ai_model_metrics").insert(row);
    if (error) console.error(`[AIRegistry] ledger insert failed: ${error.message}`);
  } catch (e) {
    console.error(`[AIRegistry] ledger insert threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Runs one AI call for a task through its registry chain and records it in the usage ledger. Never throws for provider failures. */
export async function callAITask(call: AITaskCall): Promise<AITaskResult> {
  const started = Date.now();
  const budget = call.timeoutMs ?? AI_CONFIG.REQUEST_TIMEOUT;
  const snap = await loadAIRegistry(call.db);

  let chain: AICatalogModel[];
  let params: AIRouteParams = {};
  const emergency = snap === null;
  if (emergency) {
    console.error(`[AIRegistry] EMERGENCY_DEFAULT task=${call.task}: registry unavailable on cold start, using ${AI_MODELS.openai.default}`);
    chain = [emergencyModel()];
  } else {
    const route = snap.routes.get(call.task);
    if (!route) return { ok: false, errorClass: "route_missing", detail: `no ai_task_route row for ${call.task}`, attempts: [] };
    if (!route.is_active) return { ok: false, errorClass: "route_inactive", detail: `ai_task_route ${call.task} is inactive`, attempts: [] };
    params = route.params;
    chain = route.steps.map((k) => snap.models.get(k)).filter((m): m is AICatalogModel => !!m);
  }

  const opts = {
    maxOutputTokens: params.max_output_tokens ?? call.maxOutputTokens,
    temperature: params.temperature ?? call.temperature,
    reasoningEffort: params.reasoning_effort ?? call.reasoningEffort,
    jsonMode: params.json_mode ?? call.jsonMode,
  };

  const attempts: AIAttempt[] = [];
  let last: { model: AICatalogModel; errorClass: AICallErrorClass; status: number | null; detail: string } | null = null;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const apiKey = getAPIKey(model.provider);
    if (!apiKey) { attempts.push({ model_key: model.model_key, outcome: "skipped_no_key" }); continue; }
    if ((aiProviderCooldownUntil.get(model.provider) ?? 0) > Date.now()) { attempts.push({ model_key: model.model_key, outcome: "skipped_cooldown" }); continue; }
    const remaining = budget - (Date.now() - started);
    if (remaining < AI_MIN_ATTEMPT_MS) { last = { model, errorClass: "timeout", status: null, detail: "call budget exhausted" }; break; }

    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await fetch(getAPIEndpoint(model.provider), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(buildTaskRequest(model, call.messages, opts)),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        const cls = classifyAIFailure(res.status, text);
        if (res.status === 429) {
          const h = res.headers.get("Retry-After");
          const retryMs = h && !isNaN(Number(h)) ? Math.min(Number(h) * 1000, AI_PROVIDER_COOLDOWN_MAX_MS) : AI_PROVIDER_COOLDOWN_DEFAULT_MS;
          aiProviderCooldownUntil.set(model.provider, Date.now() + retryMs);
        }
        attempts.push({ model_key: model.model_key, outcome: cls, http_status: res.status, ms: Date.now() - t0 });
        last = { model, errorClass: cls, status: res.status, detail: text.slice(0, 300) };
        console.warn(`[AIRegistry] task=${call.task} ${model.model_key} ${res.status} ${cls}`);
        continue;
      }
      // deno-lint-ignore no-explicit-any
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* handled as empty below */ }
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        attempts.push({ model_key: model.model_key, outcome: "empty_output", http_status: res.status, ms: Date.now() - t0 });
        last = { model, errorClass: "empty_output", status: res.status, detail: "empty model content" };
        continue;
      }
      attempts.push({ model_key: model.model_key, outcome: "ok", http_status: res.status, ms: Date.now() - t0 });
      const usage = readUsage(json);
      const callDate = new Date().toISOString().slice(0, 10);
      const priced = emergency ? { costUsd: null, priceId: null } : priceAICall(snap!.prices.get(model.model_key), usage, callDate);
      const fallbackUsed = model.model_key !== chain[0].model_key;
      if (!emergency) {
        await writeAILedger(call.db, {
          model_name: model.model_key, model_requested: chain[0].model_key, task_key: call.task, function_name: call.functionName,
          farmer_id: call.farmerId ?? null, fallback_used: fallbackUsed, error_class: "ok", http_status: res.status,
          query_count: 1, avg_response_time_ms: Date.now() - started, error_rate: 0, resource_usage: usage,
          cost_usd: priced.costUsd, price_id: priced.priceId, metadata: { ...(call.metadata ?? {}), attempts },
        });
      }
      return { ok: true, content, modelKey: model.model_key, provider: model.provider, fallbackUsed, usage, costUsd: priced.costUsd, attempts };
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const cls: AICallErrorClass = aborted ? "timeout" : "network";
      attempts.push({ model_key: model.model_key, outcome: cls, ms: Date.now() - t0 });
      last = { model, errorClass: cls, status: null, detail: e instanceof Error ? e.message : String(e) };
      console.warn(`[AIRegistry] task=${call.task} ${model.model_key} ${cls}`);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!last) {
    return { ok: false, errorClass: "no_provider_available", detail: "every step was skipped (no API key or provider cooling down)", attempts };
  }
  if (!emergency) {
    await writeAILedger(call.db, {
      model_name: last.model.model_key, model_requested: chain[0].model_key, task_key: call.task, function_name: call.functionName,
      farmer_id: call.farmerId ?? null, fallback_used: last.model.model_key !== chain[0].model_key, error_class: last.errorClass,
      http_status: last.status, query_count: 1, avg_response_time_ms: Date.now() - started, error_rate: 1,
      resource_usage: {}, cost_usd: null, price_id: null, metadata: { ...(call.metadata ?? {}), attempts, detail: last.detail },
    });
  }
  return { ok: false, errorClass: last.errorClass, detail: last.detail, attempts };
}

/** Test/debug only: clears the registry cache and provider cooldowns. */
export function _resetAIRegistryForTests(): void {
  aiRegistry = null;
  aiRegistryLoading = null;
  aiProviderCooldownUntil.clear();
}
