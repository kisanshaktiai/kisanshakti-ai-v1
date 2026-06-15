/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION → RULE LOOKUP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * When a farmer's symptom is captured as a confirmed observation
 * (e.g. OBS_RICE_NO_EMERGENCE) and a SAFE/CAUTION rule keyed on that
 * observation exists in `decision_rules` for the current crop+stage, the
 * caller should:
 *
 *   1. Bypass the Unified Gate's "young-crop / no confirmed diagnosis"
 *      block — the rule itself is the safety contract.
 *   2. Use the rule's action_text (translated where available) as the
 *      farmer-facing response instead of the generic monitoring template.
 *
 * Translations come from `decision_rules_translations_archive`.
 * English `action_text` is the fallback.
 *
 * This module is stateless; it accepts a Supabase client and reads via
 * PostgREST. No module-level mutable state.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface ObservationRuleHit {
  rule_id: string;
  action_text: string;
  action_type: string | null;
  farmer_safety_level: string | null;
  growth_stage: string | null;
  priority: number | null;
  /** Localised text (mr/hi) when found; else null. */
  localized_text: string | null;
  /** Effective text the caller should display. */
  text: string;
  source: 'rule_action_text';
}

const SAFE_LEVELS = ['SAFE', 'CAUTION'] as const;

/**
 * Look up the highest-priority SAFE/CAUTION rule whose `condition_code`
 * matches any of the confirmed observations for the given crop+stage.
 *
 * Returns `null` when no eligible rule exists.
 */
export async function lookupSafeRuleForObservations(
  supabase: SupabaseClient,
  args: {
    confirmedObservations: string[];
    cropCode: string;
    growthStage: string;
    language?: string;
    /** SSOT days-since-sowing — used to filter by conditions_json.das_range. */
    daysSinceSowing?: number | null;
  },
): Promise<ObservationRuleHit | null> {
  const obsList = (args.confirmedObservations || []).filter((s) => typeof s === 'string' && s.length > 0);
  if (obsList.length === 0 || !args.cropCode) return null;

  const { data, error } = await supabase
    .from('decision_rules')
    .select('rule_id, condition_code, crop_code, growth_stage, action_text, action_type, farmer_safety_level, priority, is_active, conditions_json')
    .in('condition_code', obsList)
    .eq('crop_code', args.cropCode)
    .eq('is_active', true)
    .in('farmer_safety_level', SAFE_LEVELS as unknown as string[]);

  if (error) {
    console.warn(`[ObservationRuleLookup] DB error: ${error.message}`);
    return null;
  }

  const rows = (data || []) as Array<{
    rule_id: string;
    condition_code: string;
    crop_code: string;
    growth_stage: string | null;
    action_text: string | null;
    action_type: string | null;
    farmer_safety_level: string | null;
    priority: number | null;
    conditions_json: Record<string, unknown> | null;
  }>;

  const stageMatch = rows.filter(
    (r) => !r.growth_stage || r.growth_stage.toUpperCase() === args.growthStage.toUpperCase(),
  );

  if (stageMatch.length === 0) return null;

  // DAS gate: when the caller supplies SSOT DAS, drop any rule whose
  // conditions_json.das_range excludes it. Rules without a das_range are
  // treated as DAS-agnostic.
  const das = typeof args.daysSinceSowing === 'number' && Number.isFinite(args.daysSinceSowing)
    ? args.daysSinceSowing
    : null;
  const dasFiltered = das === null ? stageMatch : stageMatch.filter((r) => {
    const cj = r.conditions_json as any;
    const dr = cj?.das_range;
    if (!dr || typeof dr !== 'object') return true;
    const min = Number(dr.min ?? dr.from ?? Number.NEGATIVE_INFINITY);
    const max = Number(dr.max ?? dr.to ?? Number.POSITIVE_INFINITY);
    return das >= min && das <= max;
  });

  if (dasFiltered.length === 0) return null;

  // Lowest priority value first (1 = highest urgency); fall back to rule_id
  // for deterministic ordering when priorities tie or are null.
  dasFiltered.sort((a, b) => {
    const pa = a.priority ?? 9999;
    const pb = b.priority ?? 9999;
    if (pa !== pb) return pa - pb;
    return a.rule_id.localeCompare(b.rule_id);
  });

  const top = dasFiltered[0];
  if (!top.action_text) return null;

  let localized: string | null = null;
  const lang = (args.language || '').toLowerCase();
  if (lang === 'mr' || lang === 'hi') {
    const { data: trans } = await supabase
      .from('decision_rules_translations_archive')
      .select('response_mr, response_hi')
      .eq('rule_id', top.rule_id)
      .maybeSingle();
    if (trans) {
      const candidate = lang === 'mr' ? trans.response_mr : trans.response_hi;
      if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
        localized = candidate;
      }
    }
  }

  return {
    rule_id: top.rule_id,
    action_text: top.action_text,
    action_type: top.action_type,
    farmer_safety_level: top.farmer_safety_level,
    growth_stage: top.growth_stage,
    priority: top.priority,
    localized_text: localized,
    text: localized ?? top.action_text,
    source: 'rule_action_text',
  };
}

/**
 * Convenience: filter a list of symptom keys for canonical OBS_* codes.
 */
export function extractObservationCodes(symptomKeys: string[] | undefined | null): string[] {
  if (!Array.isArray(symptomKeys)) return [];
  return symptomKeys.filter((s) => typeof s === 'string' && s.startsWith('OBS_'));
}
