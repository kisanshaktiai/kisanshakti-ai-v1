/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI REGISTRY CLIENT — DB-SSOT for AI model choice
 * ───────────────────────────────────────────────────────────────────────────
 * CHANGE LOG (newest first)
 *   2026-09-27 — Initial. One service-role client for agents that call
 *     callAITask() (_shared/aiConfig.ts) but receive no Supabase client from
 *     their caller (nlu-agent, intent-classifier, llm-response-generator).
 *     The registry tables (ai_model_catalog / ai_task_route / ai_task_route_step)
 *     and the usage ledger (ai_model_metrics) are readable/writable by the
 *     service role only (RLS), so a user-scoped client cannot be used here.
 *     Same env-based creation as intent-classifier's registry loaders.
 *     Returns null when the credentials are missing; callers keep their
 *     existing no-LLM fallback in that case.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

let client: ReturnType<typeof createClient> | null = null;

export function aiRegistryClient(): ReturnType<typeof createClient> | null {
  if (client) return client;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  client = createClient(supabaseUrl, serviceKey);
  return client;
}
