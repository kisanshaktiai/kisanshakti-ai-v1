/**
 * Centralized AI Configuration
 * Single source of truth for all AI model settings across edge functions
 */

export const AI_CONFIG = {
  // Primary model for schedule generation, chat, and complex tasks
  MODEL: "gpt-4.1-2025-04-14",

  // Token limits - INCREASED for comprehensive schedule generation
  MAX_TOKENS: 16384,
  MAX_TOKENS_SCHEDULE: 32768, // Increased for ALL 10 farming stages with detailed tasks
  MAX_TOKENS_CHAT: 8192,
  MAX_TOKENS_ANALYSIS: 8192,

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
