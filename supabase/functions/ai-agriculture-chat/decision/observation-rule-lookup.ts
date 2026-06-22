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

// Post-migration: decision_rules.farmer_safety_level is stored lowercase.
const SAFE_LEVELS = ['safe', 'caution'] as const;

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
  const obsList = (args.confirmedObservations || [])
    .filter((s) => typeof s === 'string' && s.length > 0)
    .map((s) => s.toLowerCase()); // condition_code stored lowercase post-migration
  if (obsList.length === 0 || !args.cropCode) return null;

  const cropLc = args.cropCode.toLowerCase();
  const stageLc = (args.growthStage || '').toLowerCase();
  const establishmentFamily = ['germination', 'nursery', 'seedling', 'emergence', 'establishment'];
  const stageCandidates = establishmentFamily.includes(stageLc)
    ? establishmentFamily
    : [stageLc].filter(Boolean);

  const { data, error } = await supabase
    .from('decision_rules')
    .select('rule_id, condition_code, crop_code, growth_stage, action_text, action_type, farmer_safety_level, priority, is_active, conditions_json')
    .in('condition_code', obsList)
    .eq('crop_code', cropLc)
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

  // ───────────────────────────────────────────────────────────────────────
  // DAS-first filter (SSOT). Per crop-timeline-ssot: DAS from crop_schedules
  // is authoritative; growth_stage labels in `crop_stage_master` can OVERLAP
  // (e.g. rice DAS=9 falls in both "germination" 0–10 AND "nursery" 0–25),
  // so the orchestrator may legitimately pass either label to this function.
  // A rule's `conditions_json.das_range` is the canonical scope window; the
  // `growth_stage` column is a secondary label. We therefore:
  //   1. Accept a rule if its DAS range covers current DAS, OR
  //   2. Accept it if the stage labels match (legacy path for rules with no
  //      das_range).
  // Rules failing BOTH are rejected.
  // ───────────────────────────────────────────────────────────────────────
  const das = typeof args.daysSinceSowing === 'number' && Number.isFinite(args.daysSinceSowing)
    ? args.daysSinceSowing
    : null;
  const stageU = (args.growthStage || '').toUpperCase();

  const dasFiltered = rows.filter((r) => {
    const cj = r.conditions_json as any;
    const dr = cj?.das_range;
    const hasDasRange = dr && typeof dr === 'object';
    const rowStageLc = (r.growth_stage || '').toLowerCase();
    const stageLabelMatches =
      !r.growth_stage ||
      r.growth_stage.toUpperCase() === stageU ||
      (stageCandidates.length > 0 && stageCandidates.includes(rowStageLc));

    if (hasDasRange && das !== null) {
      const min = Number(dr.min ?? dr.from ?? Number.NEGATIVE_INFINITY);
      const max = Number(dr.max ?? dr.to ?? Number.POSITIVE_INFINITY);
      const inDasWindow = das >= min && das <= max;
      // DAS-range is SSOT: if it matches, accept regardless of stage label.
      if (inDasWindow) return true;
      // If DAS-range exists but excludes current DAS, the rule does not apply
      // even when the stage label coincidentally matches.
      return false;
    }
    // No das_range on the rule → fall back to stage label match.
    return stageLabelMatches;
  });

  if (dasFiltered.length === 0) {
    console.log(`[ObservationRuleLookup] No rules matched after DAS/stage filter (das=${das}, stage=${stageU}, candidates=${rows.length})`);
    return null;
  }

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

  // Preserve legacy in-memory contract: action_type / farmer_safety_level / growth_stage
  // are consumed elsewhere via UPPER comparisons (e.g. 'BLOCK', 'SAFE'). The DB
  // post-migration stores them lowercase, so normalise back to UPPER on egress.
  return {
    rule_id: top.rule_id,
    action_text: top.action_text,
    action_type: top.action_type ? String(top.action_type).toUpperCase() : null,
    farmer_safety_level: top.farmer_safety_level ? String(top.farmer_safety_level).toUpperCase() : null,
    growth_stage: top.growth_stage ? String(top.growth_stage).toUpperCase() : null,
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
  return symptomKeys.filter((s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('OBS_'));
}
