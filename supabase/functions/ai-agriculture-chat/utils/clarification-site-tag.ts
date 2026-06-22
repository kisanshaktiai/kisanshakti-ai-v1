/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION SITE TAGGER (WAVE J v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single-purpose helper that stamps every CLARIFICATION_QUESTION emission
 * with a stable site identifier so v_ai_clarification_attribution_90d can
 * attribute drops to the precise code path that produced them.
 *
 * Usage at each emission site:
 *     return tagClarificationSite('orch.g2_context_completeness', {
 *       type: 'CLARIFICATION_QUESTION',
 *       ...
 *     });
 *
 * The helper is intentionally non-invasive: it never alters the response
 * shape, only stamps `metadata.clarification_site` (and ensures `metadata`
 * exists). All existing fields are preserved.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CLARIFICATION_SITE_TAG_VERSION = '1.0.0';

/** Canonical list of every emission-site identifier. Keep in sync with
 *  audit dashboards / docs/ws13-wave-j-site-catalog.md. */
export const CLARIFICATION_SITES = {
  HARD_GATE_OPTION_REMINDER:        'orch.hard_gate_option_reminder',          // L2902
  NLU_LOW_CONFIDENCE:               'orch.nlu_low_confidence',                  // L3247
  STAGE_CLARIFICATION:              'orch.stage_clarification',                 // L3649
  DIAGNOSIS_FIRST_OPTIONS:          'orch.diagnosis_first_options',             // L4768
  IDENTIFY_LOCATION_INVARIANT:      'orch.identify_location_invariant',         // L5026
  G2_CONTEXT_COMPLETENESS:          'orch.g2_context_completeness',             // L5993
  MULTIMATCH_COMPETITION:           'orch.multimatch_competition',              // L6851
  DYNAMIC_OPTIONS:                  'orch.dynamic_options',                     // L6965
  DIAGNOSTIC_STATE_NEXT_QUESTION:   'orch.diagnostic_state_next_question',      // L7069
  MANDATORY_FALLBACK_OBS:           'orch.mandatory_fallback_observations',     // L7651
  INTENT_LOCK_ALL_FILTERED:         'orch.intent_lock_all_filtered',            // L7764
  DIAGNOSIS_FIRST_GENERATOR:        'decision.diagnosis_first_generator',       // diagnosis-first-generator.ts:798
} as const;

export type ClarificationSiteId = typeof CLARIFICATION_SITES[keyof typeof CLARIFICATION_SITES];

/**
 * Stamp a clarification response with its emission-site identifier.
 * Idempotent — re-tagging a response simply overwrites the prior tag.
 */
export function tagClarificationSite<T extends Record<string, any>>(siteId: string, response: T): T {
  if (!response || typeof response !== 'object') return response;
  const existing = (response as any).metadata ?? {};
  (response as any).metadata = {
    ...existing,
    clarification_site: siteId,
  };
  return response;
}
