/**
 * Centralized AI Configuration
 * Single source of truth for all AI model settings across edge functions
 * Supports both OpenAI and Google AI (via Lovable Gateway)
 */

// AI Provider types
export type AIProvider = "openai" | "google";

// Model configurations per provider
export const AI_MODELS = {
  openai: {
    default: "gpt-4o-mini",
    fallback: "gpt-4o-mini",
    premium: "gpt-4o",
  },
  google: {
    default: "google/gemini-2.5-flash",
    fallback: "google/gemini-2.5-flash-lite", 
    premium: "google/gemini-2.5-pro",
  },
} as const;

// API endpoints
export const AI_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://ai.gateway.lovable.dev/v1/chat/completions",
} as const;

export const AI_CONFIG = {
  // Default provider (can be overridden per request)
  DEFAULT_PROVIDER: "google" as AIProvider, // Use Lovable AI Gateway by default
  
  // Primary model - gpt-4o-mini for OpenAI, gemini-2.5-flash for Google
  MODEL: "google/gemini-2.5-flash",
  OPENAI_MODEL: "gpt-4o-mini",
  GOOGLE_MODEL: "google/gemini-2.5-flash",
  
  // Fallback model for retries
  FALLBACK_MODEL: "google/gemini-2.5-flash-lite",
  OPENAI_FALLBACK: "gpt-4o-mini",
  GOOGLE_FALLBACK: "google/gemini-2.5-flash-lite",

  // Token limits - OPTIMIZED to prevent 502 timeouts
  MAX_TOKENS: 4096,
  MAX_TOKENS_SCHEDULE: 8000, // Reduced to prevent timeout issues
  MAX_TOKENS_CHAT: 4096,
  MAX_TOKENS_ANALYSIS: 4096,

  // Rate limiting
  RATE_LIMIT_SCHEDULE: { maxRequests: 30, windowMs: 60000 },
  RATE_LIMIT_CHAT: { maxRequests: 60, windowMs: 60000 },
  RATE_LIMIT_ANALYSIS: { maxRequests: 20, windowMs: 60000 },
  
  // Request timeout in ms
  REQUEST_TIMEOUT: 55000, // Increased for complex schedules
} as const;

// Legacy export for backward compatibility
export const OPENAI_API_URL = AI_ENDPOINTS.openai;

/**
 * Get the appropriate API endpoint for the provider
 */
export function getAPIEndpoint(provider: AIProvider): string {
  return AI_ENDPOINTS[provider];
}

/**
 * Get the API key for the specified provider
 */
export function getAPIKey(provider: AIProvider): string {
  if (provider === "google") {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      console.warn("⚠️ LOVABLE_API_KEY not found, falling back to OpenAI");
      return validateOpenAIKey();
    }
    return key;
  }
  return validateOpenAIKey();
}

/**
 * Validate OpenAI API key exists
 */
export function validateOpenAIKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
  }
  return key;
}

/**
 * Get the model for the specified provider
 */
export function getModel(provider: AIProvider, tier: "default" | "fallback" | "premium" = "default"): string {
  return AI_MODELS[provider][tier];
}

/**
 * Determine provider from model name
 */
export function getProviderFromModel(model: string): AIProvider {
  if (model.startsWith("google/") || model.startsWith("gemini")) {
    return "google";
  }
  return "openai";
}

/**
 * Build AI request payload - handles differences between OpenAI and Google
 */
export function buildAIRequest(
  provider: AIProvider,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens?: number;
    tools?: any[];
    toolChoice?: any;
    temperature?: number;
  } = {}
): any {
  const payload: any = {
    model,
    messages,
  };

  // Token limit handling
  if (options.maxTokens) {
    // Google/Gemini uses max_tokens, OpenAI newer models use max_completion_tokens
    payload.max_tokens = options.maxTokens;
  }

  // Temperature (only for OpenAI legacy models, not GPT-5)
  if (options.temperature !== undefined && provider === "openai" && !model.includes("gpt-5")) {
    payload.temperature = options.temperature;
  }

  // Tools/function calling
  if (options.tools) {
    payload.tools = options.tools;
    
    // Tool choice handling differs by provider
    if (options.toolChoice) {
      if (provider === "google") {
        // Lovable AI Gateway / Google uses "auto" or "required" as string
        // For forced tool calling, use "required" or "any"
        if (typeof options.toolChoice === 'object' && options.toolChoice.type === 'function') {
          // Convert OpenAI-style forced tool choice to Google-compatible
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
