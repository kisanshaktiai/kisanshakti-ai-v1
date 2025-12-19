/**
 * Centralized AI Configuration
 * Single source of truth for all AI model settings across edge functions
 * UPDATED: Supports GEMINI_API_KEY for direct Google AI calls
 */

// AI Provider types
export type AIProvider = "openai" | "google" | "gemini";

// Model configurations per provider
export const AI_MODELS = {
  openai: {
    default: "gpt-4o-mini",
    fallback: "gpt-4o-mini",
    premium: "gpt-4o",
    vision: "gpt-4o",
  },
  google: {
    default: "google/gemini-2.5-flash",
    fallback: "google/gemini-2.5-flash-lite", 
    premium: "google/gemini-2.5-pro",
  },
  gemini: {
    default: "gemini-2.5-flash-preview-05-20",
    fallback: "gemini-2.0-flash",
    premium: "gemini-2.5-pro-preview-05-06",
  },
} as const;

// API endpoints
export const AI_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://ai.gateway.lovable.dev/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
} as const;

export const AI_CONFIG = {
  // Default provider - now using Gemini for schedule generation
  DEFAULT_PROVIDER: "gemini" as AIProvider,
  
  // Primary model - Gemini for high-quality agriculture schedules
  MODEL: "gemini-2.5-flash-preview-05-20",
  OPENAI_MODEL: "gpt-4o-mini",
  GOOGLE_MODEL: "google/gemini-2.5-flash",
  GEMINI_MODEL: "gemini-2.5-flash-preview-05-20",
  
  // Vision model for image analysis
  VISION_MODEL: "gpt-4o",
  
  // Fallback model for retries
  FALLBACK_MODEL: "gemini-2.0-flash",
  OPENAI_FALLBACK: "gpt-4o-mini",
  GOOGLE_FALLBACK: "google/gemini-2.5-flash-lite",
  GEMINI_FALLBACK: "gemini-2.0-flash",

  // Token limits - OPTIMIZED to prevent 502 timeouts
  MAX_TOKENS: 4096,
  MAX_TOKENS_SCHEDULE: 16000, // Increased for longer, more detailed schedules
  MAX_TOKENS_CHAT: 4096,
  MAX_TOKENS_ANALYSIS: 4096,

  // Rate limiting
  RATE_LIMIT_SCHEDULE: { maxRequests: 30, windowMs: 60000 },
  RATE_LIMIT_CHAT: { maxRequests: 60, windowMs: 60000 },
  RATE_LIMIT_ANALYSIS: { maxRequests: 20, windowMs: 60000 },
  
  // Request timeout in ms
  REQUEST_TIMEOUT: 55000,
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
 * Now prioritizes GEMINI_API_KEY for Gemini provider
 */
export function getAPIKey(provider: AIProvider): string {
  if (provider === "gemini") {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (geminiKey) {
      return geminiKey;
    }
    console.warn("⚠️ GEMINI_API_KEY not found, falling back to OpenAI");
    return validateOpenAIKey();
  }
  
  if (provider === "openai") {
    return validateOpenAIKey();
  }
  
  // Google/Lovable AI Gateway fallback
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    console.warn("⚠️ LOVABLE_API_KEY not found, falling back to OpenAI");
    return validateOpenAIKey();
  }
  return key;
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
 * Check if Gemini API key is available
 */
export function hasGeminiKey(): boolean {
  return !!Deno.env.get("GEMINI_API_KEY");
}

/**
 * Get the model for the specified provider
 */
export function getModel(provider: AIProvider, tier: "default" | "fallback" | "premium" | "vision" = "default"): string {
  if (tier === "vision" && provider === "openai") {
    return AI_MODELS.openai.vision;
  }
  return AI_MODELS[provider][tier as "default" | "fallback" | "premium"] || AI_MODELS[provider].default;
}

/**
 * Determine provider from model name
 */
export function getProviderFromModel(model: string): AIProvider {
  if (model.startsWith("google/") || model.startsWith("gemini-flash")) {
    return "google";
  }
  if (model.startsWith("gemini-")) {
    return "gemini";
  }
  return "openai";
}

/**
 * Get the best available provider for schedule generation
 * Prioritizes Gemini if GEMINI_API_KEY is set
 */
export function getBestScheduleProvider(): { provider: AIProvider; model: string } {
  // Check for Gemini API key first (preferred for schedule generation)
  if (hasGeminiKey()) {
    return { provider: "gemini", model: AI_MODELS.gemini.default };
  }
  
  // Fallback to OpenAI if available
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    return { provider: "openai", model: AI_MODELS.openai.default };
  }
  
  // Last resort: Lovable AI Gateway
  return { provider: "google", model: AI_MODELS.google.default };
}

/**
 * Build AI request payload - handles differences between OpenAI, Google, and Gemini
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
    payload.max_tokens = options.maxTokens;
  }

  // Temperature (supported by most models, Gemini defaults to 1.0)
  if (options.temperature !== undefined) {
    payload.temperature = options.temperature;
  } else if (provider === "gemini") {
    // Set lower temperature for Gemini to get more consistent, detailed output
    payload.temperature = 0.7;
  }

  // Tools/function calling
  if (options.tools) {
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
      } else if (provider === "gemini") {
        // Gemini OpenAI-compatible API format
        if (typeof options.toolChoice === 'object' && options.toolChoice.type === 'function') {
          payload.tool_choice = { type: "function", function: { name: options.toolChoice.function.name } };
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
