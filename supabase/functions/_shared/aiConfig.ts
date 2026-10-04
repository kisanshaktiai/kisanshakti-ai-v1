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
  // 2026-09-26 — Gemini 2.5 family replaced: Google limits 2.5 to prior users and its
  // retirement date is unsettled (Gemini API: none announced; Google Cloud lifecycle page:
  // 2026-10-20); Lovable marks 2.5 deprecated. Successors are the models Google
  // recommends for new work: 3.5 Flash-Lite (direct, same price as 2.5 Flash) and
  // 3.8 Flash (Lovable's default chat model). Gemini 3 models get no custom
  // temperature — see rejectsCustomTemperature().
  google: {
    default: "google/gemini-3.8-flash",
    fallback: "google/gemini-3.8-flash",
    premium: "google/gemini-3.1-pro-preview",
  },
  gemini: {
    // PRODUCTION: Gemini 3.5 Flash-Lite — direct Gemini API fallback provider
    default: "gemini-3.5-flash-lite",
    fallback: "gemini-2.0-flash",
    premium: "gemini-3.1-pro-preview",
  },
  lovable: {
    default: "google/gemini-3.8-flash",
    fallback: "google/gemini-3.8-flash",
    premium: "google/gemini-3.1-pro-preview",
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
  GOOGLE_MODEL: "google/gemini-3.8-flash",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  
  // Vision model for image/crop analysis
  VISION_MODEL: "gpt-4o",
  
  // Fallback models for retry logic
  FALLBACK_MODEL: "gemini-2.0-flash",
  // Schedule fallback is provider-level Gemini, not an older OpenAI model.
  OPENAI_FALLBACK: "gpt-5.6-luna",
  GOOGLE_FALLBACK: "google/gemini-3.8-flash",
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
// 2026-09-27 — gpt-6 and later belong to the same family (developers.openai.com model page
// for gpt-6-luna: max_completion_tokens, reasoning none…max). The old pattern stopped at
// gpt-5, so a gpt-6 name would have been sent max_tokens + a custom temperature. Only the
// legacy name-based paths use this; registry calls take the contract from ai_model_catalog.
export function isNextGenOpenAIModel(model: string): boolean {
  const m = (model || "").toLowerCase();
  return /(^|[/_-])(gpt-([5-9]|[1-9][0-9])|o1|o3|o4)/.test(m);
}
export function requiresMaxCompletionTokens(model: string): boolean {
  return isNextGenOpenAIModel(model);
}
/** true when the provider+model pair rejects a caller-supplied temperature. */
// 2026-09-26 — Gemini 3 and later (direct Gemini API or via the Lovable gateway):
// Google "strongly recommend[s] keeping the temperature parameter at its default
// value of 1.0"; a lower value "may lead to unexpected behavior, such as looping or
// degraded performance" (ai.google.dev/gemini-api/docs/gemini-3). Same effect as the
// OpenAI rule: the key is not sent and the API uses its default. Gemini 2.x and
// earlier keep caller temperatures exactly as before.
export function rejectsCustomTemperature(provider: AIProvider, model: string): boolean {
  if (provider === "openai") return isNextGenOpenAIModel(model);
  if (provider === "gemini" || provider === "google" || provider === "lovable") {
    return /(^|\/)gemini-([3-9]|[1-9][0-9])([.-]|$)/.test((model || "").toLowerCase());
  }
  return false;
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
//
// 2026-10-03 — KEY POOL (Phase 2a, migration 20261003100000_ai_key_pool.sql):
//   * a provider may have several API keys (ai_key_slot: secret NAME per slot, never
//     the key; enabled flag; daily complimentary-token pool per model group;
//     reserve). The router picks the key per call with pickAIKey(): the first
//     enabled slot that still has free-pool room for the model's group (today's
//     UTC tokens from the ledger via ai_key_pool_usage_today(), cached 60 s, plus
//     what this isolate used since), else the lowest enabled slot for PAID traffic.
//     OpenAI sends no signal when a free pool is spent — it just bills — so the
//     count is ours, and the keys must be used by this router only.
//   * a 429 on one key cools down THAT key (provider#slot), not the provider, and
//     the same model is retried at once on the next eligible key.
//   * ledger rows carry metadata.key_slot, metadata.pool (free | paid | none) and
//     metadata.pool_group; attempts carry key_slot.
//   * no ai_key_slot rows for a provider (e.g. before the migration) ⇒ exactly the
//     previous behaviour: the provider's single secret (getAPIKey), treated as slot 1.
// ═══════════════════════════════════════════════════════════════════════════

/** Service-role Supabase client (.from() always; .rpc() when the client has it — the key-pool usage read). */
// deno-lint-ignore no-explicit-any
type RegistryDb = { from(table: string): any; rpc?(fn: string, args?: Record<string, unknown>): any };

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
export interface AIRouteParams { max_output_tokens?: number; temperature?: number; reasoning_effort?: string; json_mode?: boolean }
interface AITaskRoute { task_key: string; is_active: boolean; params: AIRouteParams; steps: string[]; prefer_free_pool: boolean }
interface AIPriceRow {
  id: string;
  model_name: string;
  input_cost_per_1k: number;
  cached_input_cost_per_1k: number | null;
  output_cost_per_1k: number;
  effective_from: string;
}
/** One API key of a provider (ai_key_slot). The key itself lives in the secret named env_var. */
export interface AIKeySlot {
  provider: AIProvider;
  slot_no: number;
  env_var: string;
  is_enabled: boolean;
  daily_pool: Record<string, number>; // group_key → tokens per UTC day
  reserve_tokens: number;
}
/** Models that share one daily complimentary-token pool (ai_model_group); ids without date suffix. */
export interface AIModelGroup { group_key: string; provider: AIProvider; api_model_ids: string[] }
interface AIRegistrySnapshot {
  loadedAt: number;
  models: Map<string, AICatalogModel>;
  routes: Map<string, AITaskRoute>;
  prices: Map<string, AIPriceRow[]>; // newest effective_from first
  keySlots: Map<AIProvider, AIKeySlot[]>; // enabled slots only, slot_no ascending; absent ⇒ legacy single key
  groups: AIModelGroup[];
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
  /** Optional cap for a single step, so one slow model cannot use the whole budget and starve the fallbacks. */
  attemptTimeoutMs?: number;
  metadata?: Record<string, unknown>;
  // ── 2026-09-27 — options that existing call sites already send, so they can move onto the
  // registry without changing their requests. None of them names a model.
  /** JSON mode for these providers only — reproduces buildAIRequest(useJsonMode), which set response_format json_object for gemini/lovable and never for openai. `jsonMode: true` (or route params.json_mode) applies to every provider and wins. */
  jsonModeProviders?: AIProvider[];
  /** Explicit response_format (e.g. json_schema). Wins over jsonMode / jsonModeProviders. */
  // deno-lint-ignore no-explicit-any
  responseFormat?: Record<string, any>;
  /** Function calling, passed through unchanged (OpenAI-compatible shape). */
  // deno-lint-ignore no-explicit-any
  tools?: any[];
  // deno-lint-ignore no-explicit-any
  toolChoice?: any;
  /** 2026-10-02 — an answer shorter than this many characters counts as empty_output and the chain moves
   *  on (ai-agriculture-chat forceTranslate kept its "longer than 30 characters" rule this way). */
  minContentChars?: number;
}
export interface AICallUsage { input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_tokens: number }
interface AIAttempt { model_key: string; outcome: "ok" | AICallErrorClass | "skipped_no_key" | "skipped_cooldown"; http_status?: number; ms?: number; key_slot?: number; pool?: AIKeyPool }
/** Which pool a call was charged to: a key's complimentary pool, the organisation's paid balance, a provider with no pool at all, or (2026-10-04) a pool whose use could not be read. */
export type AIKeyPool = "free" | "paid" | "none" | "unknown";
export type AIKeyPick =
  | { apiKey: string; slot: number; pool: AIKeyPool; group: string | null }
  | { apiKey: ""; slot: null; reason: "no_key" | "cooldown" };
export type AITaskResult =
  // apiModelId / toolCalls added 2026-09-27: callers record the model string they already stored (e.g. ai_chat_messages.ai_model) and read tool calls.
  // deno-lint-ignore no-explicit-any
  | { ok: true; content: string; modelKey: string; apiModelId: string; provider: AIProvider; fallbackUsed: boolean; usage: AICallUsage; costUsd: number | null; priceId: string | null; attempts: AIAttempt[]; toolCalls: any[] }
  | { ok: false; errorClass: AICallErrorClass | "route_missing" | "route_inactive" | "no_provider_available"; detail: string; attempts: AIAttempt[]; httpStatus?: number | null };

const AI_REGISTRY_TTL_MS = 10 * 60 * 1000;       // same TTL as system-config-cache.ts
const AI_PROVIDER_COOLDOWN_DEFAULT_MS = 5_000;   // narrate.ts default when no Retry-After
const AI_PROVIDER_COOLDOWN_MAX_MS = 8_000;       // narrate.ts MAX_RETRY_AFTER_MS
// 2026-10-02 — exhausted credits ("insufficient_quota" / "no credits remaining") do not clear in seconds:
// cool the provider for 5 minutes so every call does not pay a failed round trip before its fallback.
const AI_PROVIDER_QUOTA_COOLDOWN_MS = 5 * 60 * 1000;
const AI_MIN_ATTEMPT_MS = 1_000;
const AI_KEY_POOL_TTL_MS = 60_000;               // today's pool usage is re-read from the ledger at most once a minute

let aiRegistry: AIRegistrySnapshot | null = null;
let aiRegistryLoading: Promise<AIRegistrySnapshot | null> | null = null;
// 2026-10-03 — cooldown per KEY ("provider#slot"), not per provider: a 429 on one organisation's key
// says nothing about the other keys. Legacy single-key providers use slot 1.
const aiKeyCooldownUntil = new Map<string, number>();
const keyId = (provider: AIProvider, slot: number) => `${provider}#${slot}`;

// Today's complimentary-pool use per "provider#slot#group": the ledger's count (UTC day) plus what this
// isolate has used since that read (the ledger write is queued, so it would otherwise be invisible).
interface AIKeyPoolUsage { day: string; loadedAt: number; ok: boolean; used: Map<string, number> }
let aiKeyPoolUsage: AIKeyPoolUsage | null = null;
let aiKeyPoolLoading: Promise<AIKeyPoolUsage> | null = null;
const aiKeyPoolLocal = new Map<string, number>();
const poolId = (provider: AIProvider, slot: number, group: string) => `${provider}#${slot}#${group}`;
const utcDay = () => new Date().toISOString().slice(0, 10);

async function fetchAIRegistry(db: RegistryDb): Promise<AIRegistrySnapshot> {
  const [cat, routes, steps, prices, slots, groups] = await Promise.all([
    db.from("ai_model_catalog").select("model_key,provider,api_model_id,status,input_modalities,api_contract"),
    db.from("ai_task_route").select("task_key,is_active,params,prefer_free_pool"),
    db.from("ai_task_route_step").select("task_key,step_no,model_key").order("step_no", { ascending: true }),
    db.from("ai_model_pricing")
      .select("id,model_name,input_cost_per_1k,cached_input_cost_per_1k,output_cost_per_1k,effective_from,currency")
      .eq("is_active", true)
      .order("effective_from", { ascending: false }),
    // Key pool (2026-10-03). These two reads are TOLERANT: before migration 20261003100000 the tables do
    // not exist, and the router must keep working exactly as before (one key per provider).
    db.from("ai_key_slot").select("provider,slot_no,env_var,is_enabled,daily_pool,reserve_tokens").eq("is_enabled", true).order("slot_no", { ascending: true }),
    db.from("ai_model_group").select("group_key,provider,api_model_ids").eq("is_active", true),
  ]);
  for (const [name, r] of [["ai_model_catalog", cat], ["ai_task_route", routes], ["ai_task_route_step", steps], ["ai_model_pricing", prices]] as const) {
    if (r?.error || !Array.isArray(r?.data)) throw new Error(`${name}: ${r?.error?.message ?? "no data"}`);
  }
  const keySlots = new Map<AIProvider, AIKeySlot[]>();
  if (slots?.error || !Array.isArray(slots?.data)) {
    console.warn(`[AIRegistry] ai_key_slot unavailable (${slots?.error?.message ?? "no data"}) — single key per provider`);
  } else {
    for (const s of slots.data) {
      const row: AIKeySlot = {
        provider: s.provider, slot_no: Number(s.slot_no), env_var: String(s.env_var), is_enabled: s.is_enabled === true,
        daily_pool: s.daily_pool && typeof s.daily_pool === "object" ? s.daily_pool : {}, reserve_tokens: Number(s.reserve_tokens ?? 0),
      };
      const list = keySlots.get(row.provider) ?? [];
      list.push(row);
      keySlots.set(row.provider, list);
    }
    for (const list of keySlots.values()) list.sort((a, b) => a.slot_no - b.slot_no);
  }
  const groupList: AIModelGroup[] = [];
  if (groups?.error || !Array.isArray(groups?.data)) {
    console.warn(`[AIRegistry] ai_model_group unavailable (${groups?.error?.message ?? "no data"}) — no complimentary pools`);
  } else {
    for (const g of groups.data) groupList.push({ group_key: String(g.group_key), provider: g.provider, api_model_ids: Array.isArray(g.api_model_ids) ? g.api_model_ids.map(String) : [] });
  }
  const models = new Map<string, AICatalogModel>();
  for (const m of cat.data) models.set(m.model_key, m as AICatalogModel);
  const routeMap = new Map<string, AITaskRoute>();
  for (const r of routes.data) routeMap.set(r.task_key, { task_key: r.task_key, is_active: r.is_active === true, params: r.params ?? {}, steps: [], prefer_free_pool: r.prefer_free_pool !== false });
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
  return { loadedAt: Date.now(), models, routes: routeMap, prices: priceMap, keySlots, groups: groupList };
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

/** Request options for one call: ai_task_route.params (database) override the caller's defaults. One rule for callAITask and for resolveAITaskChain users. */
export function mergeAIRouteParams(
  params: AIRouteParams,
  call: Pick<AITaskCall, "maxOutputTokens" | "temperature" | "reasoningEffort" | "jsonMode" | "jsonModeProviders" | "responseFormat" | "tools" | "toolChoice">,
) {
  return {
    maxOutputTokens: params.max_output_tokens ?? call.maxOutputTokens,
    temperature: params.temperature ?? call.temperature,
    reasoningEffort: params.reasoning_effort ?? call.reasoningEffort,
    jsonMode: params.json_mode ?? call.jsonMode,
    jsonModeProviders: call.jsonModeProviders,
    responseFormat: call.responseFormat,
    tools: call.tools,
    toolChoice: call.toolChoice,
  };
}

/** Builds a Chat Completions body from the model's contract row. */
export function buildTaskRequest(
  model: AICatalogModel,
  // deno-lint-ignore no-explicit-any
  messages: Array<{ role: string; content: any }>,
  opts: {
    maxOutputTokens?: number; temperature?: number; reasoningEffort?: string; jsonMode?: boolean;
    // deno-lint-ignore no-explicit-any
    jsonModeProviders?: AIProvider[]; responseFormat?: Record<string, any>; tools?: any[]; toolChoice?: any;
  } = {},
): Record<string, unknown> {
  const c = model.api_contract;
  const body: Record<string, unknown> = { model: model.api_model_id, messages };
  if (opts.maxOutputTokens !== undefined) body[c.token_param] = opts.maxOutputTokens;
  if (opts.temperature !== undefined && c.temperature === "allowed") body.temperature = opts.temperature;
  if (opts.reasoningEffort !== undefined && c.reasoning_efforts.includes(opts.reasoningEffort)) body.reasoning_effort = opts.reasoningEffort;
  if (opts.responseFormat) body.response_format = opts.responseFormat;
  else if (opts.jsonMode === true || (opts.jsonMode === undefined && opts.jsonModeProviders?.includes(model.provider))) body.response_format = { type: "json_object" };
  if (opts.tools && opts.tools.length) {
    body.tools = opts.tools;
    if (opts.toolChoice !== undefined) body.tool_choice = opts.toolChoice;
  }
  return body;
}

export function classifyAIFailure(httpStatus: number, bodyText: string): AICallErrorClass {
  const b = (bodyText || "").toLowerCase();
  if (httpStatus === 429) {
    // 2026-10-02 — OpenAI's current wording for a drained balance is "You have no credits remaining" (seen live 2026-10-01).
    return b.includes("insufficient_quota") || b.includes("exceeded your current quota")
      || b.includes("no credits remaining") || b.includes("credit_balance_exhausted") ? "quota_exhausted" : "rate_limited";
  }
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

// 2026-10-02 — the ledger insert is taken off the request path: on the Supabase Edge Runtime the
// write is handed to EdgeRuntime.waitUntil (it completes after the response); anywhere else it is
// awaited as before. A chat turn makes up to five routed calls, so this removes up to five
// sequential inserts from the farmer's wait. writeAILedger never throws.
function queueAILedger(db: RegistryDb, row: Record<string, unknown>): Promise<void> {
  const p = writeAILedger(db, row);
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") { rt.waitUntil(p); return Promise.resolve(); }
  return p;
}

// ── Key pool (2026-10-03) ─────────────────────────────────────────────────────────────────────

/** Complimentary-pool group of a model (ai_model_group, matched without the -YYYY-MM-DD snapshot suffix), or null. */
export function aiModelGroupKey(snap: { groups: AIModelGroup[] } | null, model: Pick<AICatalogModel, "provider" | "api_model_id">): string | null {
  if (!snap) return null;
  const id = model.api_model_id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  const g = snap.groups.find((x) => x.provider === model.provider && x.api_model_ids.includes(id));
  return g ? g.group_key : null;
}

function readSlotKey(slot: AIKeySlot): string {
  const v = Deno.env.get(slot.env_var);
  return v && v.trim() !== "" ? v : "";
}

/** True when the provider has at least one usable key: an enabled slot whose secret is set, or (no slot rows) its legacy secret. Sync — uses the loaded snapshot. */
export function hasAIProviderKey(provider: AIProvider): boolean {
  const slots = aiRegistry?.keySlots.get(provider);
  if (!slots || slots.length === 0) return !!getAPIKey(provider);
  return slots.some((s) => s.is_enabled && readSlotKey(s) !== "");
}

async function fetchAIKeyPoolUsage(db: RegistryDb): Promise<AIKeyPoolUsage> {
  const day = utcDay();
  const used = new Map<string, number>();
  if (typeof db.rpc !== "function") return { day, loadedAt: Date.now(), ok: false, used };
  try {
    const r = await db.rpc("ai_key_pool_usage_today");
    if (r?.error || !Array.isArray(r?.data)) {
      console.warn(`[AIRegistry] ai_key_pool_usage_today unavailable (${r?.error?.message ?? "no data"}) — pools treated as spent`);
      return { day, loadedAt: Date.now(), ok: false, used };
    }
    for (const row of r.data) {
      if (!row.group_key) continue;
      used.set(poolId(row.provider, Number(row.key_slot), String(row.group_key)), Number(row.tokens ?? 0));
    }
    return { day, loadedAt: Date.now(), ok: true, used };
  } catch (e) {
    console.warn(`[AIRegistry] ai_key_pool_usage_today threw: ${e instanceof Error ? e.message : String(e)} — pools treated as spent`);
    return { day, loadedAt: Date.now(), ok: false, used };
  }
}

/** Today's pool usage (60 s cache, single-flight, re-read at the UTC day change). A failed read counts as "unknown" ⇒ paid. */
async function loadAIKeyPoolUsage(db: RegistryDb): Promise<AIKeyPoolUsage> {
  const fresh = aiKeyPoolUsage && aiKeyPoolUsage.day === utcDay() && Date.now() - aiKeyPoolUsage.loadedAt < AI_KEY_POOL_TTL_MS;
  if (fresh) return aiKeyPoolUsage!;
  if (aiKeyPoolLoading) return aiKeyPoolLoading;
  aiKeyPoolLoading = fetchAIKeyPoolUsage(db)
    .then((u) => {
      // The ledger now holds (or will shortly hold) what this isolate added since the previous read.
      if (u.ok) aiKeyPoolLocal.clear();
      aiKeyPoolUsage = u;
      return u;
    })
    .finally(() => { aiKeyPoolLoading = null; });
  return aiKeyPoolLoading;
}

function poolUsed(usage: AIKeyPoolUsage, provider: AIProvider, slot: number, group: string): number {
  const id = poolId(provider, slot, group);
  return (usage.used.get(id) ?? 0) + (aiKeyPoolLocal.get(id) ?? 0);
}

/** Records a finished call against its key's pool so the next pick sees it before the ledger does. */
export function noteAIKeyUsage(provider: AIProvider, slot: number, group: string | null, usage: AICallUsage): void {
  if (!group) return;
  const id = poolId(provider, slot, group);
  aiKeyPoolLocal.set(id, (aiKeyPoolLocal.get(id) ?? 0) + usage.input_tokens + usage.output_tokens);
}

/** Cools down ONE key after a 429 (Retry-After capped at 8 s; a drained balance for 5 min). Other statuses: no-op. */
export function noteAIKeyResponse(provider: AIProvider, slot: number, httpStatus: number, bodyText: string, retryAfter?: string | null): void {
  if (httpStatus !== 429) return;
  const cls = classifyAIFailure(httpStatus, bodyText);
  const h = retryAfter ?? null;
  const retryMs = cls === "quota_exhausted" ? AI_PROVIDER_QUOTA_COOLDOWN_MS
    : h && !isNaN(Number(h)) ? Math.min(Number(h) * 1000, AI_PROVIDER_COOLDOWN_MAX_MS) : AI_PROVIDER_COOLDOWN_DEFAULT_MS;
  aiKeyCooldownUntil.set(keyId(provider, slot), Date.now() + retryMs);
}

export function aiKeyCooldownRemaining(provider: AIProvider, slot: number): number {
  return Math.max(0, (aiKeyCooldownUntil.get(keyId(provider, slot)) ?? 0) - Date.now());
}

/**
 * The key to use for one call of `model`: the first enabled slot (slot_no order, `exclude`d and
 * cooling-down slots skipped) whose complimentary pool for the model's group still has room
 * (used + reserve < pool); when no slot has room, the lowest eligible slot, charged as "paid".
 * A model outside every group goes to the lowest eligible slot as "none". No ai_key_slot rows for the
 * provider ⇒ the legacy secret as slot 1 ("none"). Never throws.
 */
export async function pickAIKey(db: RegistryDb, model: AICatalogModel, opts: { exclude?: number[] } = {}): Promise<AIKeyPick> {
  const snap = await loadAIRegistry(db);
  const exclude = new Set(opts.exclude ?? []);
  const slots = snap?.keySlots.get(model.provider) ?? [];
  if (slots.length === 0) {
    const apiKey = getAPIKey(model.provider);
    if (!apiKey) return { apiKey: "", slot: null, reason: "no_key" };
    if (exclude.has(1) || aiKeyCooldownRemaining(model.provider, 1) > 0) return { apiKey: "", slot: null, reason: "cooldown" };
    return { apiKey, slot: 1, pool: "none", group: null };
  }
  let cooling = false;
  const eligible: Array<{ slot: AIKeySlot; apiKey: string }> = [];
  for (const s of slots) {
    if (!s.is_enabled || exclude.has(s.slot_no)) { if (exclude.has(s.slot_no)) cooling = true; continue; }
    const apiKey = readSlotKey(s);
    if (!apiKey) continue;
    if (aiKeyCooldownRemaining(model.provider, s.slot_no) > 0) { cooling = true; continue; }
    eligible.push({ slot: s, apiKey });
  }
  if (eligible.length === 0) return { apiKey: "", slot: null, reason: cooling ? "cooldown" : "no_key" };
  const group = aiModelGroupKey(snap, model);
  if (!group) return { apiKey: eligible[0].apiKey, slot: eligible[0].slot.slot_no, pool: "none", group: null };
  const hasPool = eligible.some((e) => (e.slot.daily_pool[group] ?? 0) > 0);
  // 2026-10-04 — a failed pool-usage read used to return pool: "paid", which is indistinguishable in the
  // ledger from a deliberate paid call. It is now reported as "unknown" and warned about, so the one case
  // where the router cannot tell free from paid is visible on the API Keys screen.
  let poolState: AIKeyPool = "paid";
  if (hasPool) {
    const usage = await loadAIKeyPoolUsage(db);
    if (usage.ok) {
      for (const e of eligible) {
        const pool = e.slot.daily_pool[group] ?? 0;
        if (pool > 0 && poolUsed(usage, model.provider, e.slot.slot_no, group) + e.slot.reserve_tokens < pool) {
          return { apiKey: e.apiKey, slot: e.slot.slot_no, pool: "free", group };
        }
      }
    } else {
      poolState = "unknown";
      console.warn(`[AIRegistry] pool usage unreadable for ${model.model_key} (group ${group}) — using key#${eligible[0].slot.slot_no}, billing state undetermined`);
    }
  }
  return { apiKey: eligible[0].apiKey, slot: eligible[0].slot.slot_no, pool: poolState, group };
}

/**
 * 2026-10-04 — FREE TIER FIRST.
 * Reorders a route's chain so every step that can still be served from a key's complimentary pool is
 * tried before any step that would be billed. The sort has exactly two tiers and is stable, so it can
 * only move a free step ahead of a billed one: two free steps keep the admin's step_no order between
 * them, and so do two billed steps.
 * A step counts as free when its model belongs to a complimentary-token group (ai_model_group) AND at
 * least one enabled key of its provider has its secret set and still has room in that group
 * (used + reserve < pool) — the same test pickAIKey applies when it chooses the key.
 * The chain is returned UNCHANGED when the route has prefer_free_pool = false, when there is only one
 * step, when the pool-usage read is unavailable, or when every step sits in the same tier. An unknown
 * pool state therefore never changes which model answers.
 */
async function orderChainByFreePool(
  db: RegistryDb,
  snap: AIRegistrySnapshot,
  chain: AICatalogModel[],
): Promise<{ chain: AICatalogModel[]; reordered: boolean }> {
  if (chain.length < 2) return { chain, reordered: false };
  const usage = await loadAIKeyPoolUsage(db);
  if (!usage.ok) return { chain, reordered: false };
  const hasFreeRoom = (model: AICatalogModel): boolean => {
    const group = aiModelGroupKey(snap, model);
    if (!group) return false;
    const slots = snap.keySlots.get(model.provider) ?? [];
    return slots.some((s) => {
      const pool = s.daily_pool[group] ?? 0;
      return s.is_enabled && pool > 0 && readSlotKey(s) !== ""
        && poolUsed(usage, model.provider, s.slot_no, group) + s.reserve_tokens < pool;
    });
  };
  const tiered = chain.map((model, index) => ({ model, index, tier: hasFreeRoom(model) ? 0 : 1 }));
  if (tiered.every((t) => t.tier === tiered[0].tier)) return { chain, reordered: false };
  tiered.sort((a, b) => a.tier - b.tier || a.index - b.index);
  return { chain: tiered.map((t) => t.model), reordered: true };
}

/** Runs one AI call for a task through its registry chain and records it in the usage ledger. Never throws for provider failures. */
export async function callAITask(call: AITaskCall): Promise<AITaskResult> {
  const started = Date.now();
  const budget = call.timeoutMs ?? AI_CONFIG.REQUEST_TIMEOUT;
  const snap = await loadAIRegistry(call.db);

  let chain: AICatalogModel[];
  let params: AIRouteParams = {};
  // 2026-10-04 — free tier first: what the route's own step 1 was, and whether the chain was reordered.
  // Both go into the ledger row so the audit shows the admin's order next to the order actually tried.
  let routeStep1: string | null = null;
  let freeFirst = false;
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
    if (route.prefer_free_pool && chain.length > 1) {
      routeStep1 = chain[0].model_key;
      const ordered = await orderChainByFreePool(call.db, snap, chain);
      chain = ordered.chain;
      freeFirst = ordered.reordered;
      if (freeFirst) console.log(`[AIRegistry] FREE_FIRST task=${call.task}: ${routeStep1} -> ${chain[0].model_key}`);
    }
  }

  const opts = mergeAIRouteParams(params, call);

  const attempts: AIAttempt[] = [];
  let last: { model: AICatalogModel; errorClass: AICallErrorClass; status: number | null; detail: string; keySlot: number | null; pool: AIKeyPool | null } | null = null;

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    // 2026-10-03 — key pool: one model may be tried on several keys. A 429 on a key cools that key and
    // the same model goes straight to the next eligible key; any other failure moves to the next model.
    const triedSlots: number[] = [];
    let pick = await pickAIKey(call.db, model);
    if (pick.slot === null) { attempts.push({ model_key: model.model_key, outcome: pick.reason === "cooldown" ? "skipped_cooldown" : "skipped_no_key" }); continue; }
    while (pick.slot !== null) {
      const { apiKey, slot, pool, group } = pick;
      const remaining = budget - (Date.now() - started);
      if (remaining < AI_MIN_ATTEMPT_MS) { last = { model, errorClass: "timeout", status: null, detail: "call budget exhausted", keySlot: slot, pool }; break; }

      const t0 = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), call.attemptTimeoutMs ? Math.min(remaining, call.attemptTimeoutMs) : remaining);
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
          noteAIKeyResponse(model.provider, slot, res.status, text, res.headers.get("Retry-After"));
          attempts.push({ model_key: model.model_key, outcome: cls, http_status: res.status, ms: Date.now() - t0, key_slot: slot, pool });
          last = { model, errorClass: cls, status: res.status, detail: text.slice(0, 300), keySlot: slot, pool };
          console.warn(`[AIRegistry] task=${call.task} ${model.model_key} key#${slot} ${res.status} ${cls}`);
          if (res.status === 429) {
            triedSlots.push(slot);
            pick = await pickAIKey(call.db, model, { exclude: triedSlots });
            continue; // same model, next key (or the loop ends when no key is left)
          }
          break;
        }
        // deno-lint-ignore no-explicit-any
        let json: any = null;
        try { json = JSON.parse(text); } catch { /* handled as empty below */ }
        const content = json?.choices?.[0]?.message?.content;
        const toolCalls = Array.isArray(json?.choices?.[0]?.message?.tool_calls) ? json.choices[0].message.tool_calls : [];
        // A function-calling request is answered by tool_calls, usually with null content.
        const minChars = Math.max(1, call.minContentChars ?? 1);
        const answered = (typeof content === "string" && content.trim().length >= minChars) || (!!call.tools?.length && toolCalls.length > 0);
        const usage = readUsage(json);
        noteAIKeyUsage(model.provider, slot, group, usage); // tokens were spent on this key either way
        if (!answered) {
          attempts.push({ model_key: model.model_key, outcome: "empty_output", http_status: res.status, ms: Date.now() - t0, key_slot: slot, pool });
          last = { model, errorClass: "empty_output", status: res.status, detail: "empty model content", keySlot: slot, pool };
          break;
        }
        attempts.push({ model_key: model.model_key, outcome: "ok", http_status: res.status, ms: Date.now() - t0, key_slot: slot, pool });
        const callDate = new Date().toISOString().slice(0, 10);
        const priced = emergency ? { costUsd: null, priceId: null } : priceAICall(snap!.prices.get(model.model_key), usage, callDate);
        const fallbackUsed = model.model_key !== chain[0].model_key;
        if (!emergency) {
          await queueAILedger(call.db, {
            model_name: model.model_key, model_requested: chain[0].model_key, task_key: call.task, function_name: call.functionName,
            farmer_id: call.farmerId ?? null, fallback_used: fallbackUsed, error_class: "ok", http_status: res.status,
            query_count: 1, avg_response_time_ms: Date.now() - started, error_rate: 0, resource_usage: usage,
            cost_usd: priced.costUsd, price_id: priced.priceId,
            metadata: { ...(call.metadata ?? {}), attempts, key_slot: slot, pool, pool_group: group, ...(freeFirst ? { free_first: true, route_step1: routeStep1 } : {}) },
          });
        }
        return {
          ok: true, content: typeof content === "string" ? content : "", modelKey: model.model_key, apiModelId: model.api_model_id,
          provider: model.provider, fallbackUsed, usage, costUsd: priced.costUsd, priceId: priced.priceId, attempts, toolCalls,
        };
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        const cls: AICallErrorClass = aborted ? "timeout" : "network";
        attempts.push({ model_key: model.model_key, outcome: cls, ms: Date.now() - t0, key_slot: slot, pool });
        last = { model, errorClass: cls, status: null, detail: e instanceof Error ? e.message : String(e), keySlot: slot, pool };
        console.warn(`[AIRegistry] task=${call.task} ${model.model_key} key#${slot} ${cls}`);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
    if (last?.errorClass === "timeout" && last.detail === "call budget exhausted") break;
  }

  if (!last) {
    return { ok: false, errorClass: "no_provider_available", detail: "every step was skipped (no API key or key cooling down)", attempts };
  }
  if (!emergency) {
    await queueAILedger(call.db, {
      model_name: last.model.model_key, model_requested: chain[0].model_key, task_key: call.task, function_name: call.functionName,
      farmer_id: call.farmerId ?? null, fallback_used: last.model.model_key !== chain[0].model_key, error_class: last.errorClass,
      http_status: last.status, query_count: 1, avg_response_time_ms: Date.now() - started, error_rate: 1,
      resource_usage: {}, cost_usd: null, price_id: null,
      metadata: { ...(call.metadata ?? {}), attempts, detail: last.detail, key_slot: last.keySlot, pool: last.pool, ...(freeFirst ? { free_first: true, route_step1: routeStep1 } : {}) },
    });
  }
  return { ok: false, errorClass: last.errorClass, detail: last.detail, attempts, httpStatus: last.status };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2026-09-27 — REGISTRY LOOKUP + LEDGER FOR CALL SITES WITH THEIR OWN RETRY LOOPS
// ───────────────────────────────────────────────────────────────────────────
// ai-smart-schedule runs its own provider loops (per-chunk retries, Retry-After
// cooldowns, shared deadlines). Rewriting those loops onto callAITask would change
// behaviour the schedule relies on, so those sites only swap WHERE the model list
// comes from: resolveAITaskChain() returns the same registry chain callAITask uses
// (same cache, same route checks, same cold-start emergency default), and
// recordAITaskCall() writes the same ledger row callAITask writes.
// ═══════════════════════════════════════════════════════════════════════════

export type AITaskChainResult =
  | { ok: true; chain: AICatalogModel[]; params: AIRouteParams; emergency: boolean }
  | { ok: false; errorClass: "route_missing" | "route_inactive"; detail: string };

/** The ordered model chain for a task, straight from the registry (no model name in code). */
export async function resolveAITaskChain(db: RegistryDb, task: string): Promise<AITaskChainResult> {
  const snap = await loadAIRegistry(db);
  if (snap === null) {
    console.error(`[AIRegistry] EMERGENCY_DEFAULT task=${task}: registry unavailable on cold start, using ${AI_MODELS.openai.default}`);
    return { ok: true, chain: [emergencyModel()], params: {}, emergency: true };
  }
  const route = snap.routes.get(task);
  if (!route) return { ok: false, errorClass: "route_missing", detail: `no ai_task_route row for ${task}` };
  if (!route.is_active) return { ok: false, errorClass: "route_inactive", detail: `ai_task_route ${task} is inactive` };
  let chain = route.steps.map((k) => snap.models.get(k)).filter((m): m is AICatalogModel => !!m);
  // 2026-10-04 — free tier first, the same rule callAITask applies, so the call sites that run their own
  // retry loops (ai-smart-schedule) also try the complimentary-pool steps before the billed ones.
  if (route.prefer_free_pool && chain.length > 1) {
    const ordered = await orderChainByFreePool(db, snap, chain);
    if (ordered.reordered) {
      console.log(`[AIRegistry] FREE_FIRST task=${task}: ${chain[0].model_key} -> ${ordered.chain[0].model_key}`);
      chain = ordered.chain;
    }
  }
  return { ok: true, chain, params: route.params, emergency: false };
}

/** Usage block of an OpenAI-compatible response, in ledger shape. */
// deno-lint-ignore no-explicit-any
export function readAIUsage(json: any): AICallUsage {
  return readUsage(json);
}

/** Writes one usage-ledger row for a call made outside callAITask. Never throws. */
export async function recordAITaskCall(db: RegistryDb, row: {
  task: string; functionName: string; model: AICatalogModel; modelRequested: AICatalogModel;
  ok: boolean; errorClass?: AICallErrorClass; httpStatus?: number | null; latencyMs: number;
  usage?: AICallUsage; farmerId?: string | null; emergency?: boolean;
  metadata?: Record<string, unknown>;
  /** 2026-10-03 — the key the call went out on (from pickAIKey); recorded in metadata and counted against its pool. */
  key?: { slot: number; pool: AIKeyPool; group: string | null } | null;
}): Promise<void> {
  if (row.emergency) return; // same rule as callAITask: no ledger row for the cold-start emergency default
  try {
    const snap = await loadAIRegistry(db);
    const usage = row.usage ?? { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0 };
    if (row.ok && row.key) noteAIKeyUsage(row.model.provider, row.key.slot, row.key.group, usage);
    const priced = row.ok && snap ? priceAICall(snap.prices.get(row.model.model_key), usage, new Date().toISOString().slice(0, 10)) : { costUsd: null, priceId: null };
    await queueAILedger(db, {
      model_name: row.model.model_key, model_requested: row.modelRequested.model_key, task_key: row.task, function_name: row.functionName,
      farmer_id: row.farmerId ?? null, fallback_used: row.model.model_key !== row.modelRequested.model_key,
      error_class: row.ok ? "ok" : (row.errorClass ?? "other"), http_status: row.httpStatus ?? null, query_count: 1,
      avg_response_time_ms: row.latencyMs, error_rate: row.ok ? 0 : 1, resource_usage: row.ok ? usage : {},
      cost_usd: priced.costUsd, price_id: priced.priceId,
      metadata: row.key ? { ...(row.metadata ?? {}), key_slot: row.key.slot, pool: row.key.pool, pool_group: row.key.group } : (row.metadata ?? {}),
    });
  } catch (e) {
    console.error(`[AIRegistry] ledger record threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Test/debug only: clears the registry cache, key cooldowns and the pool-usage cache. */
export function _resetAIRegistryForTests(): void {
  aiRegistry = null;
  aiRegistryLoading = null;
  aiKeyCooldownUntil.clear();
  aiKeyPoolUsage = null;
  aiKeyPoolLoading = null;
  aiKeyPoolLocal.clear();
}
