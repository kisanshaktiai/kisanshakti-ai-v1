/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY METRICS — Wave-R
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Emits structured `safety_violation_count{reason,crop,tenant}` metrics
 * (via console.log so existing log scrapers can pick them up) AND inserts
 * a forensic row into `public.ai_safety_violations` for dashboard queries.
 *
 * Fail-soft: never throws — observability must never break a farmer response.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

export type SafetyViolationReason =
  | 'NO_RULES_FIRED_HARD_GATE'
  | 'RULE_EMISSION_MISMATCH_HARD_GATE'
  | 'NO_DIAGNOSIS_HARD_GATE'
  | 'FORMATTER_PRECONDITION_VIOLATION'
  | 'HYDRATE_BLOCKED_NO_RULES_FIRED'
  | 'ADVISORY_LOOKUP_REJECTED_NO_RULES_FIRED';

export interface SafetyViolation {
  reason: SafetyViolationReason;
  trace_id: string;
  tenant_id?: string | null;
  farmer_id?: string | null;
  session_id?: string | null;
  crop_code?: string | null;
  language?: string | null;
  intent?: string | null;
  emitted_rule_id?: string | null;
  fired_rule_ids?: string[];
  candidate_rule_ids?: string[];
  observations?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/**
 * Record a symbolic-safety violation. Logs the metric line first so it is
 * captured even when the DB insert fails. Never throws.
 */
export async function recordSafetyViolation(v: SafetyViolation): Promise<void> {
  // 1) Always log — structured for log scrapers / dashboards.
  try {
    const cropTag = v.crop_code ? v.crop_code.toLowerCase() : 'unknown';
    const tenantTag = v.tenant_id ? v.tenant_id.slice(0, 8) : 'no_tenant';
    console.warn(
      `🚫 [SAFETY_CONTRACT_VIOLATION] reason=${v.reason} crop=${cropTag} tenant=${tenantTag} ` +
        `emitted=${v.emitted_rule_id || 'none'} fired=[${(v.fired_rule_ids || []).join(',')}] ` +
        `candidates=[${(v.candidate_rule_ids || []).join(',')}] trace=${v.trace_id}`,
    );
    // Counter line — easy to grep / parse.
    console.log(
      `METRIC safety_violation_count{reason="${v.reason}",crop="${cropTag}",tenant="${tenantTag}"} 1`,
    );
  } catch (_e) {
    // ignore logging failures
  }

  // 2) Try to persist for dashboard queries. Service role only.
  const client = getClient();
  if (!client) return;
  try {
    await (client.from('ai_safety_violations') as any).insert({
      trace_id: v.trace_id,
      tenant_id: v.tenant_id ?? null,
      farmer_id: v.farmer_id ?? null,
      session_id: v.session_id ?? null,
      crop_code: v.crop_code ?? null,
      language: v.language ?? null,
      intent: v.intent ?? null,
      reason: v.reason,
      emitted_rule_id: v.emitted_rule_id ?? null,
      fired_rule_ids: v.fired_rule_ids ?? [],
      candidate_rule_ids: v.candidate_rule_ids ?? [],
      observations: v.observations ?? {},
      details: v.details ?? {},
    });
  } catch (e) {
    // Never let telemetry break the response path.
    console.warn(`[SafetyMetrics] insert failed (non-fatal): ${(e as Error).message}`);
  }
}

export const SAFETY_METRICS_VERSION = '1.0.0';
