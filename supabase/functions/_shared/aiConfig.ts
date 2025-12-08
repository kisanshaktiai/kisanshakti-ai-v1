/**
 * Centralized AI Configuration
 * Single source of truth for all AI model settings across edge functions
 */

export const AI_CONFIG = {
  // Primary model for schedule generation - gpt-4o for better structured output
  MODEL: "gpt-4o",

  // Token limits - OPTIMIZED for edge function resource limits
  MAX_TOKENS: 8192,
  MAX_TOKENS_SCHEDULE: 12000, // Reduced to prevent WORKER_LIMIT while ensuring 10 stages
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
