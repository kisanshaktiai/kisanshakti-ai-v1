// =====================================================
// config.ts — DATABASE-DRIVEN RUNTIME CONFIGURATION
// The code defines NOTHING agronomic. Every cap, window, threshold source,
// kill switch, and model name is read from the database:
//   * proactive_evaluator_config  — behaviour (tenant row overrides global)
//   * sci_method_registry         — governed scientific parameters (approved only)
//   * alert_suppression_matrix    — safety-block suppression semantics
// =====================================================

export interface EvaluatorConfig {
  daily_alert_cap_per_farmer: number;
  default_cooldown_hours: number;
  weather_freshness_hours: number;
  weather_proximity_max_km: number;
  alert_expiry_days: number;
  enrichment_min_risk_score: number;
  enrichment_batch_max: number;
  category_fallback_enabled: boolean;
  neural_invention_allowed: boolean;
  /** OpenAI model for narration rephrasing. DB-overridable via config key
   *  'enrichment_model'; default gpt-5-mini (cheap JSON-mode rephrasing). */
  enrichment_model: string;
}

export const CONFIG_SENTINEL = '00000000-0000-0000-0000-000000000000';

export async function loadEvaluatorConfig(supabase: any, tenantId: string): Promise<EvaluatorConfig> {
  // Fail-safe defaults mirror the seeded global rows; kill switches default OFF.
  const cfg: EvaluatorConfig = {
    daily_alert_cap_per_farmer: 5,
    default_cooldown_hours: 24,
    weather_freshness_hours: 6,
    weather_proximity_max_km: 55,
    alert_expiry_days: 7,
    enrichment_min_risk_score: 50,
    enrichment_batch_max: 8,
    category_fallback_enabled: false,
    neural_invention_allowed: false,
    enrichment_model: 'gpt-5-mini',
  };
  const { data } = await supabase
    .from('proactive_evaluator_config')
    .select('tenant_id, config_key, config_value')
    .in('tenant_id', [CONFIG_SENTINEL, tenantId]);
  if (!data) return cfg;
  // Global sentinel first, tenant rows override.
  const ordered = [...data].sort((a: any) => (a.tenant_id === CONFIG_SENTINEL ? -1 : 1));
  for (const row of ordered) {
    const key = row.config_key as keyof EvaluatorConfig;
    if (!(key in cfg)) continue;
    const v = row.config_value;
    if (typeof cfg[key] === 'boolean') (cfg as any)[key] = v === true || v === 'true';
    else if (typeof cfg[key] === 'string') (cfg as any)[key] = typeof v === 'string' ? v.replace(/^"|"$/g, '') : String(v);
    else {
      const n = Number(v);
      if (Number.isFinite(n)) (cfg as any)[key] = n;
    }
  }
  return cfg;
}

export interface MethodParams {
  irrigation: Record<string, any> | null;   // IRRIGATION_METHOD_PARAMS@approved
  urgency: Record<string, any> | null;      // ALERT_URGENCY_THRESHOLDS@approved
  infiltration: Record<string, any> | null; // SOIL_INFILTRATION_CAPS@approved
}

export async function loadApprovedMethodParams(supabase: any): Promise<MethodParams> {
  const { data } = await supabase
    .from('sci_method_registry')
    .select('method_id, version, params')
    .in('method_id', ['IRRIGATION_METHOD_PARAMS', 'ALERT_URGENCY_THRESHOLDS', 'SOIL_INFILTRATION_CAPS'])
    .eq('review_status', 'approved')
    .order('version', { ascending: false });
  const out: MethodParams = { irrigation: null, urgency: null, infiltration: null };
  for (const row of (data || [])) {
    if (row.method_id === 'IRRIGATION_METHOD_PARAMS' && !out.irrigation) out.irrigation = row.params;
    if (row.method_id === 'ALERT_URGENCY_THRESHOLDS' && !out.urgency) out.urgency = row.params;
    if (row.method_id === 'SOIL_INFILTRATION_CAPS' && !out.infiltration) out.infiltration = row.params;
  }
  return out;
}

export interface SuppressionRow {
  suppressor_rule_code: string;
  suppressed_category: string;
  suppression_hours: number;
}

export async function loadSuppressionMatrix(supabase: any): Promise<SuppressionRow[]> {
  const { data } = await supabase
    .from('alert_suppression_matrix')
    .select('suppressor_rule_code, suppressed_category, suppression_hours')
    .eq('is_active', true);
  return (data || []) as SuppressionRow[];
}
