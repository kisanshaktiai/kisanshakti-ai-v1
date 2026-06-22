/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION SITE TAGGER (WAVE K v1.1.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Stamps every CLARIFICATION_QUESTION emission with a stable site identifier
 * AND a disposition (intentional vs defect-suspect) so v_ai_clarification_
 * attribution_90d can separate "this clarification should never have fired"
 * from "this clarification is a legitimate hypothesis-differential step".
 *
 * WAVE K — disposition taxonomy:
 *
 *   - INTENTIONAL_DIFFERENTIAL  Asking the farmer to choose between competing
 *                               hypotheses is the correct symbolic behaviour.
 *                               Examples: DIAGNOSIS_FIRST_OPTIONS,
 *                               MULTIMATCH_COMPETITION.
 *   - INTENTIONAL_FOLLOWUP      Follow-up reminder for a prior clarification
 *                               that the farmer did not answer. Example:
 *                               HARD_GATE_OPTION_REMINDER.
 *   - INTENTIONAL_GATE          Required context-gathering before a decision
 *                               can be made safely. Examples:
 *                               G2_CONTEXT_COMPLETENESS, STAGE_CLARIFICATION,
 *                               IDENTIFY_LOCATION_INVARIANT.
 *   - DEFECT_SUSPECT            Should generally NOT fire when rules matched.
 *                               These are the Wave J / Wave K bypass targets.
 *                               Examples: INTENT_LOCK_ALL_FILTERED,
 *                               NLU_LOW_CONFIDENCE.
 *
 * Usage at each emission site:
 *     metadata: {
 *       clarification_site: CLARIFICATION_SITES.G2_CONTEXT_COMPLETENESS,
 *       ...
 *     }
 *
 * Reverse-lookup map (`SITE_DISPOSITIONS`) is consumed by the persistence
 * layer in index.ts to stamp `metadata.clarification_site_disposition` and
 * by v_ai_clarification_attribution_90d to bucket intentional sites under
 * `hypothesis_differential` / `intentional_gate` / `intentional_followup`
 * instead of `pre_brain_clarification`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CLARIFICATION_SITE_TAG_VERSION = '1.1.0';

/** Canonical list of every emission-site identifier. Keep in sync with
 *  docs/ws13-wave-j-site-catalog.md and the SITE_DISPOSITIONS map below. */
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

export type ClarificationSiteDisposition =
  | 'INTENTIONAL_DIFFERENTIAL'
  | 'INTENTIONAL_FOLLOWUP'
  | 'INTENTIONAL_GATE'
  | 'DEFECT_SUSPECT';

/**
 * Disposition table — single source of truth used by both the runtime
 * persistence layer (index.ts) and the SQL attribution view. When a new
 * emission site is added, append it here AND extend the CASE expression
 * in v_ai_clarification_attribution_90d.
 */
export const SITE_DISPOSITIONS: Record<string, ClarificationSiteDisposition> = {
  [CLARIFICATION_SITES.HARD_GATE_OPTION_REMINDER]:      'INTENTIONAL_FOLLOWUP',
  [CLARIFICATION_SITES.STAGE_CLARIFICATION]:            'INTENTIONAL_GATE',
  [CLARIFICATION_SITES.IDENTIFY_LOCATION_INVARIANT]:    'INTENTIONAL_GATE',
  [CLARIFICATION_SITES.G2_CONTEXT_COMPLETENESS]:        'INTENTIONAL_GATE',
  [CLARIFICATION_SITES.DIAGNOSIS_FIRST_OPTIONS]:        'INTENTIONAL_DIFFERENTIAL',
  [CLARIFICATION_SITES.DIAGNOSIS_FIRST_GENERATOR]:      'INTENTIONAL_DIFFERENTIAL',
  [CLARIFICATION_SITES.MULTIMATCH_COMPETITION]:         'INTENTIONAL_DIFFERENTIAL',
  [CLARIFICATION_SITES.DIAGNOSTIC_STATE_NEXT_QUESTION]: 'INTENTIONAL_DIFFERENTIAL',
  [CLARIFICATION_SITES.DYNAMIC_OPTIONS]:                'DEFECT_SUSPECT',
  [CLARIFICATION_SITES.MANDATORY_FALLBACK_OBS]:         'DEFECT_SUSPECT',
  [CLARIFICATION_SITES.NLU_LOW_CONFIDENCE]:             'DEFECT_SUSPECT',
  [CLARIFICATION_SITES.INTENT_LOCK_ALL_FILTERED]:       'DEFECT_SUSPECT',
};

export function getSiteDisposition(siteId?: string | null): ClarificationSiteDisposition | 'UNKNOWN' {
  if (!siteId) return 'UNKNOWN';
  return SITE_DISPOSITIONS[siteId] ?? 'UNKNOWN';
}

/**
 * Stamp a clarification response with its emission-site identifier.
 * Idempotent — re-tagging a response simply overwrites the prior tag.
 * (Kept for callers that prefer wrapping; in-place `metadata.clarification_site`
 * assignment is the dominant pattern.)
 */
export function tagClarificationSite<T extends Record<string, any>>(siteId: string, response: T): T {
  if (!response || typeof response !== 'object') return response;
  const existing = (response as any).metadata ?? {};
  (response as any).metadata = {
    ...existing,
    clarification_site: siteId,
    clarification_site_disposition: getSiteDisposition(siteId),
  };
  return response;
}
