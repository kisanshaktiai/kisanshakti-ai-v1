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

// Explicit preview mode is opt-in. It never falls back to the production
// project, even if someone forgets to provide staging environment variables.
const PRODUCTION_PROJECT_ID = 'qfklkkzxemsbeniyugiz';
const PRODUCTION_URL = 'https://qfklkkzxemsbeniyugiz.supabase.co';
const PRODUCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFma2xra3p4ZW1zYmVuaXl1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjcxNjUsImV4cCI6MjA2ODAwMzE2NX0.dUnGp7wbwYom1FPbn_4EGf3PWjgmr8mXwL2w2SdYOh4';

const isYieldshieldTest = import.meta.env.MODE === 'yieldshield-test';
const testProjectId = String(import.meta.env.VITE_TEST_SUPABASE_PROJECT_ID ?? '').trim();
const testUrl = String(import.meta.env.VITE_TEST_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const testAnonKey = String(import.meta.env.VITE_TEST_SUPABASE_ANON_KEY ?? '').trim();

if (isYieldshieldTest) {
  if (!testProjectId || !testUrl || !testAnonKey) {
    throw new Error('[YieldShield] Test mode requires VITE_TEST_SUPABASE_PROJECT_ID, VITE_TEST_SUPABASE_URL and VITE_TEST_SUPABASE_ANON_KEY.');
  }
  if (testProjectId === PRODUCTION_PROJECT_ID ||
      testUrl === PRODUCTION_URL ||
      testUrl.includes('qfklkkzxemsbeniyugiz') ||
      testAnonKey === PRODUCTION_ANON_KEY) {
    throw new Error('[YieldShield] Production credentials are forbidden in isolated test mode.');
  }
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(testUrl);
  const isSupabaseHosted = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(testUrl);
  if (!isLocal && !isSupabaseHosted) {
    throw new Error('[YieldShield] Test URL must be localhost or an isolated Supabase project.');
  }
}

export const SUPABASE_CONFIG = {
  PROJECT_ID: isYieldshieldTest ? testProjectId : PRODUCTION_PROJECT_ID,
  URL: isYieldshieldTest ? testUrl : PRODUCTION_URL,
  ANON_KEY: isYieldshieldTest ? testAnonKey : PRODUCTION_ANON_KEY,
} as const;

export const IS_YIELDSHIELD_TEST = isYieldshieldTest;
export const PRODUCTION_SUPABASE_ORIGIN = PRODUCTION_URL;

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
