// Centralized AI Configuration

// AI Provider types
export type AIProvider = "openai" | "google" | "gemini";

// Model configurations per provider - UPDATED to Gemini 2.5 Flash
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
    // PRODUCTION: Gemini 2.5 Flash - best balance of speed, quality, and rural language support
    default: "gemini-2.5-flash",
    fallback: "gemini-2.0-flash",
    premium: "gemini-2.5-pro",
  },
} as const;

// API endpoints - PRODUCTION: Only use Gemini & OpenAI directly, NO Lovable AI Gateway
export const AI_ENDPOINTS = {
  openai: "https://api.openai.com/v1/chat/completions",
  google: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", // Use Gemini directly
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
} as const;

export const AI_CONFIG = {
  // Default provider - OpenAI preferred for reliable JSON structured output
  DEFAULT_PROVIDER: "openai" as AIProvider,
  
  // PRODUCTION: Gemini 2.5 Flash - best for agriculture schedules
  MODEL: "gemini-2.5-flash",
  OPENAI_MODEL: "gpt-4o-mini",
  GOOGLE_MODEL: "google/gemini-2.5-flash",
  GEMINI_MODEL: "gemini-2.5-flash",
  
  // Vision model for image/crop analysis
  VISION_MODEL: "gpt-4o",
  
  // Fallback models for retry logic
  FALLBACK_MODEL: "gemini-2.0-flash",
  OPENAI_FALLBACK: "gpt-4o-mini",
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
  // Try Gemini first (preferred for agriculture)
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey && geminiKey.trim() !== "") return geminiKey;
  
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey && openaiKey.trim() !== "") return openaiKey;
  
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

// Get the best available provider for schedule generation
export function getBestScheduleProvider(): { provider: AIProvider; model: string } {
  // CRITICAL FIX: OpenAI FIRST for schedule generation (reliable structured output)
  if (hasOpenAIKey()) {
    console.log("🚀 [AIConfig] Using OpenAI for schedule generation (primary)");
    return { provider: "openai", model: AI_MODELS.openai.default };
  }
  
  // Fallback to Gemini if OpenAI not available
  if (hasGeminiKey()) {
    console.log("🔄 [AIConfig] Falling back to Gemini for schedule generation");
    return { provider: "gemini", model: AI_MODELS.gemini.default };
  }
  
  throw new Error("No AI API keys configured. Please add GEMINI_API_KEY or OPENAI_API_KEY in Supabase secrets.");
}

// Validate configuration before making AI calls
export function validateAIConfig(): { valid: boolean; error?: string; provider?: AIProvider } {
  if (!hasAnyAIKey()) {
    return { 
      valid: false, 
      error: "No AI API keys configured. Please add GEMINI_API_KEY in Supabase secrets for best results." 
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

  // Token limit handling
  if (options.maxTokens) {
    payload.max_tokens = options.maxTokens;
  }

  // Temperature - Gemini works better with controlled temperature
  if (options.temperature !== undefined) {
    payload.temperature = options.temperature;
  } else {
    // Lower temperature for structured outputs
    payload.temperature = provider === "gemini" ? 0.4 : 0.7;
  }

  // For Gemini, prefer JSON mode over tool calling for complex schedules
  // Gemini's function calling has limitations with complex nested schemas
  if (provider === "gemini" && options.useJsonMode !== false) {
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
