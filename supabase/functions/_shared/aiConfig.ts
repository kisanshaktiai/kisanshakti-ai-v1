/**
 * Centralized AI Configuration
 * Single source of truth for all AI model settings across edge functions
 */

export const AI_CONFIG = {
  // Primary model for schedule generation - using efficient model
  MODEL: "gpt-4o-mini",

  // Token limits - OPTIMIZED for edge function resource limits
  // Note: 32768 causes WORKER_LIMIT errors, 16384 is the safe maximum
  MAX_TOKENS: 8192,
  MAX_TOKENS_SCHEDULE: 16384, // Balanced for all 10 farming stages without resource exhaustion
  MAX_TOKENS_CHAT: 4096,
  MAX_TOKENS_ANALYSIS: 4096,

  // Rate limiting
  RATE_LIMIT_SCHEDULE: { maxRequests: 30, windowMs: 60000 },
  RATE_LIMIT_CHAT: { maxRequests: 60, windowMs: 60000 },
  RATE_LIMIT_ANALYSIS: { maxRequests: 20, windowMs: 60000 },
} as const;

// Helper to get OpenAI API endpoint
export const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Validate API key exists
export function validateOpenAIKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured in Supabase secrets");
  }
  return key;
}
