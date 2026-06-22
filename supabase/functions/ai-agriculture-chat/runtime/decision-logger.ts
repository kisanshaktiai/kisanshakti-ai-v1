/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION LOGGER — Wave A1/A2 observability
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Writes one row per orchestrator turn to `ai_decision_log` so we can
 * reconstruct runtime reachability of observations / hypotheses / rules /
 * gates. Without this the forensic audit (WS13) has nothing to measure.
 *
 * Fail-soft: never throws — observability must never break a farmer
 * response.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { getDecisionLogEnabled } from './feature-flags.ts';

export interface DecisionLogTurn {
  trace_id?: string;
  tenant_id?: string | null;
  farmer_id?: string | null;
  land_id?: string | null;
  decision_type: string;                  // intent_code or 'CLARIFICATION' etc.
  model_version?: string;
  prompt_version?: string;
  input_data?: Record<string, unknown>;   // { query, observations, intent, ... }
  output_data?: Record<string, unknown>;  // { response_type, actions_count, clarification_required, ... }
  reasoning?: string;
  confidence_score?: number | null;
  execution_time_ms?: number;
  weather_data?: Record<string, unknown> | null;
  ndvi_data?: Record<string, unknown> | null;
  soil_data?: Record<string, unknown> | null;
  success: boolean;
  error_message?: string | null;
  hypothesis_id?: string | null;
  hypothesis_score?: number | null;
  hypothesis_decision_path?: string | null;
  top_5_rejected_rules?: unknown;
  evaluation_trace?: unknown;
  missing_data_fields?: string[];
  variety_resistance_applied?: Record<string, unknown> | null;
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
 * Insert one ai_decision_log row. Fire-and-forget by default.
 */
export async function logDecisionTurn(turn: DecisionLogTurn): Promise<void> {
  if (!getDecisionLogEnabled()) return;

  const client = getClient();
  if (!client) {
    console.warn('[DecisionLogger] No Supabase credentials — skipping insert');
    return;
  }

  try {
    const row = {
      tenant_id: turn.tenant_id ?? null,
      farmer_id: turn.farmer_id ?? null,
      land_id: turn.land_id ?? null,
      decision_type: turn.decision_type ?? 'UNKNOWN',
      model_version: turn.model_version ?? 'orchestrator-v1',
      prompt_version: turn.prompt_version ?? null,
      input_data: turn.input_data ?? {},
      output_data: turn.output_data ?? {},
      reasoning: turn.reasoning ?? null,
      confidence_score: turn.confidence_score ?? null,
      execution_time_ms: turn.execution_time_ms ?? null,
      weather_data: turn.weather_data ?? null,
      ndvi_data: turn.ndvi_data ?? null,
      soil_data: turn.soil_data ?? null,
      success: turn.success ?? true,
      error_message: turn.error_message ?? null,
      hypothesis_id: turn.hypothesis_id ?? null,
      hypothesis_score: turn.hypothesis_score ?? null,
      hypothesis_decision_path: turn.hypothesis_decision_path ?? null,
      top_5_rejected_rules: turn.top_5_rejected_rules ?? null,
      evaluation_trace: turn.evaluation_trace ?? null,
      missing_data_fields: turn.missing_data_fields ?? null,
      variety_resistance_applied: turn.variety_resistance_applied ?? null,
    };

    const { error } = await (client.from('ai_decision_log') as any).insert(row);
    if (error) {
      console.warn(`[DecisionLogger] Insert failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[DecisionLogger] Exception: ${(e as Error).message}`);
  }
}

/**
 * Insert an orchestrator_metrics row for pipeline-level timing.
 */
export async function logOrchestratorMetrics(metrics: {
  session_id?: string | null;
  tenant_id?: string | null;
  total_processing_time_ms?: number;
  success?: boolean;
  phase_timings?: Record<string, number>;
  agent_performance?: Record<string, unknown>;
  escalation_triggered?: boolean;
  safety_status?: string;
  final_confidence?: number | null;
  rules_applied_count?: number;
  error_type?: string | null;
  error_message?: string | null;
}): Promise<void> {
  if (!getDecisionLogEnabled()) return;
  const client = getClient();
  if (!client) return;
  try {
    await (client.from('orchestrator_metrics') as any).insert({
      session_id: metrics.session_id ?? null,
      tenant_id: metrics.tenant_id ?? null,
      total_processing_time_ms: metrics.total_processing_time_ms ?? null,
      success: metrics.success ?? true,
      phase_timings: metrics.phase_timings ?? {},
      agent_performance: metrics.agent_performance ?? {},
      escalation_triggered: metrics.escalation_triggered ?? false,
      safety_status: metrics.safety_status ?? null,
      final_confidence: metrics.final_confidence ?? null,
      rules_applied_count: metrics.rules_applied_count ?? 0,
      error_type: metrics.error_type ?? null,
      error_message: metrics.error_message ?? null,
    });
  } catch (e) {
    console.warn(`[DecisionLogger] orchestrator_metrics insert failed: ${(e as Error).message}`);
  }
}

export const DECISION_LOGGER_VERSION = '1.0.0';
