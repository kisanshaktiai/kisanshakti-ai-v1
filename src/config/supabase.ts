/**
 * Centralized Supabase Configuration
 * 
 * SECURITY NOTE: The ANON_KEY is the Supabase "anon" (anonymous) key.
 * It is DESIGNED to be used client-side and is NOT a secret.
 * Security is enforced through Row Level Security (RLS) policies.
 * See: https://supabase.com/docs/guides/api#api-keys
 * 
 * This file centralizes all Supabase configuration to:
 * 1. Avoid scattered hardcoded values across the codebase
 * 2. Make key rotation easier
 * 3. Provide single source of truth
 */

export const SUPABASE_CONFIG = {
  PROJECT_ID: 'qfklkkzxemsbeniyugiz',
  URL: 'https://qfklkkzxemsbeniyugiz.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4',
} as const;

// Helper to construct function URLs
export const getSupabaseFunctionUrl = (functionName: string): string => {
  return `${SUPABASE_CONFIG.URL}/functions/v1/${functionName}`;
};

// Helper to get standard headers for edge function calls
export const getSupabaseHeaders = (): HeadersInit => {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_CONFIG.ANON_KEY,
  };
};
