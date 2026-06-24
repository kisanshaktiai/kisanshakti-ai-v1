/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC DECISION AUTHORITY — Single Source of Truth (SSOT)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The ONLY component permitted to set:
 *   • response_mode
 *   • clarification_required
 *   • recommendation_allowed
 *   • diagnostic_state
 *
 * Reads the final orchestrator payload + signals, computes certainty, and
 * decides the canonical authority verdict. All mutations are traced via
 * authority-trace.ts.
 *
 * Invariants enforced:
 *   1. Rules matched ≠ diagnosis confirmed.
 *   2. competing_hypotheses > 1 ⇒ CLARIFICATION.
 *   3. required_observations_missing > 0 ⇒ CLARIFICATION.
 *   4. certainty < THRESHOLD ⇒ CLARIFICATION.
 *   5. visual_confirmation_required && no photo ⇒ CLARIFICATION (PHOTO_REQUIRED).
 *
 * This module is the ONLY writer; everything else is read-only consumer.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { computeCertainty, type CertaintyResult } from './diagnostic-certainty-model.ts';
import { logAuthorityMutation } from './authority-trace.ts';

export const DIAGNOSTIC_AUTHORITY_VERSION = '1.0.0';

export const TREATMENT_CERTAINTY_THRESHOLD = 0.70;
export const OBSERVATION_CERTAINTY_THRESHOLD = 0.40;

export type DiagnosticState =
  | 'NEEDS_EVIDENCE'
  | 'COMPETING_HYPOTHESES'
  | 'CONFIRMED'
  | 'OBSERVATION_ONLY'
  | 'PHOTO_REQUIRED';

export type AuthorityResponseMode =
  | 'TREATMENT'
  | 'OBSERVATION'
  | 'CLARIFICATION'
  | 'INFORMATION'
  | 'PHOTO_REQUIRED';

export interface AuthoritySignals {
  trace_id: string;
  /** Has the farmer asked a symptom-bearing question? */
  has_symptoms: boolean;
  /** Whether photo was supplied this turn */
  has_photo: boolean;
  /** Visual ambiguity flag from upstream */
  visual_confirmation_required?: boolean;
  /** Confirmed OBS codes (from text + photo + prior clarifications) */
  confirmed_observations: string[];
  /** OBS codes top hypothesis still needs */
  required_observations_missing: string[];
  /** Competing hypotheses with posteriors */
  hypotheses: Array<{ id: string; confidence: number }>;
  /** Negated evidence count */
  contradictions_count: number;
  /** Mean evidence confidence ∈ [0,1] */
  observation_confidence: number;
  /** Photo confidence ∈ [0,1] */
  visual_confidence: number;
  /** Top decision_rule confidence ∈ [0,1] */
  rule_confidence: number;
  /** Whether any decision_rule actually fired */
  rules_fired_count: number;
  /** Whether orchestrator already produced a clarification surface */
  upstream_clarification_required: boolean;
  /** Whether orchestrator already produced recommendations */
  upstream_has_recommendations: boolean;
}

export interface AuthorityVerdict {
  version: string;
  trace_id: string;
  diagnostic_state: DiagnosticState;
  response_mode: AuthorityResponseMode;
  clarification_required: boolean;
  recommendation_allowed: boolean;
  diagnostic_certainty: number;
  reason: string;
  certainty_breakdown: CertaintyResult;
}

export function decideAuthority(signals: AuthoritySignals): AuthorityVerdict {
  const certainty = computeCertainty({
    confirmed_observations: signals.confirmed_observations,
    required_observations_missing: signals.required_observations_missing,
    hypotheses: signals.hypotheses,
    contradictions_count: signals.contradictions_count,
    observation_confidence: signals.observation_confidence,
    visual_confidence: signals.visual_confidence,
    rule_confidence: signals.rule_confidence,
    visual_confirmation_required: !!signals.visual_confirmation_required,
  });

  const reasons: string[] = [];
  let state: DiagnosticState = 'OBSERVATION_ONLY';
  let mode: AuthorityResponseMode = 'OBSERVATION';
  let clarify = false;
  let allowRec = false;

  // Invariant 5: visual confirmation needed but no photo → PHOTO_REQUIRED
  if (signals.visual_confirmation_required && !signals.has_photo) {
    state = 'PHOTO_REQUIRED';
    mode = 'PHOTO_REQUIRED';
    clarify = true;
    allowRec = false;
    reasons.push('visual_confirmation_required && !has_photo');
  }
  // Invariant 2: competing hypotheses
  else if (certainty.competing_hypotheses > 1) {
    state = 'COMPETING_HYPOTHESES';
    mode = 'CLARIFICATION';
    clarify = true;
    allowRec = false;
    reasons.push(`competing_hypotheses=${certainty.competing_hypotheses}`);
  }
  // Invariant 3: required obs missing
  else if (certainty.required_observations_missing > 0 && signals.has_symptoms) {
    state = 'NEEDS_EVIDENCE';
    mode = 'CLARIFICATION';
    clarify = true;
    allowRec = false;
    reasons.push(`required_observations_missing=${certainty.required_observations_missing}`);
  }
  // Invariant 4 / 1: certainty gate (rules fired ≠ certainty)
  else if (certainty.certainty < TREATMENT_CERTAINTY_THRESHOLD && signals.has_symptoms) {
    if (certainty.certainty < OBSERVATION_CERTAINTY_THRESHOLD) {
      state = 'NEEDS_EVIDENCE';
      mode = 'CLARIFICATION';
      clarify = true;
      allowRec = false;
      reasons.push(`certainty=${certainty.certainty.toFixed(2)} < observation_threshold`);
    } else {
      state = 'OBSERVATION_ONLY';
      mode = 'OBSERVATION';
      clarify = false;
      allowRec = false;
      reasons.push(`certainty=${certainty.certainty.toFixed(2)} < treatment_threshold`);
    }
  }
  // Path to TREATMENT
  else if (certainty.certainty >= TREATMENT_CERTAINTY_THRESHOLD && signals.rules_fired_count > 0) {
    state = 'CONFIRMED';
    mode = 'TREATMENT';
    clarify = false;
    allowRec = true;
    reasons.push(
      `certainty=${certainty.certainty.toFixed(2)} ≥ treatment_threshold && rules_fired=${signals.rules_fired_count}`
    );
  } else {
    state = 'OBSERVATION_ONLY';
    mode = 'OBSERVATION';
    reasons.push('fallback_observation');
  }

  return {
    version: DIAGNOSTIC_AUTHORITY_VERSION,
    trace_id: signals.trace_id,
    diagnostic_state: state,
    response_mode: mode,
    clarification_required: clarify,
    recommendation_allowed: allowRec,
    diagnostic_certainty: certainty.certainty,
    reason: reasons.join(' | '),
    certainty_breakdown: certainty,
  };
}

/**
 * enforceAuthorityOnPayload
 *
 * Mutates the final responsePayload in place to match the SSOT verdict.
 * Strips recommendation-carrying fields when clarification_required=true.
 * Every overwritten field is traced.
 */
export function enforceAuthorityOnPayload(
  responsePayload: Record<string, any>,
  verdict: AuthorityVerdict,
  source = 'index.ts:authority-enforce',
): { overridden: string[]; stripped: string[] } {
  const overridden: string[] = [];
  const stripped: string[] = [];

  const prevMode = responsePayload.response_mode ?? responsePayload?.metadata?.response_mode ?? null;
  const prevClarify = responsePayload.clarification_required ?? null;
  const prevAllow = responsePayload.recommendation_allowed ?? null;
  const prevState = responsePayload.diagnostic_state ?? null;

  if (prevMode !== verdict.response_mode) {
    responsePayload.response_mode = verdict.response_mode;
    if (responsePayload.metadata) responsePayload.metadata.response_mode = verdict.response_mode;
    logAuthorityMutation({
      field: 'response_mode',
      old_value: prevMode,
      new_value: verdict.response_mode,
      source,
      trace_id: verdict.trace_id,
      reason: verdict.reason,
      certainty_snapshot: verdict.diagnostic_certainty,
    });
    overridden.push('response_mode');
  }

  if (prevClarify !== verdict.clarification_required) {
    responsePayload.clarification_required = verdict.clarification_required;
    logAuthorityMutation({
      field: 'clarification_required',
      old_value: prevClarify,
      new_value: verdict.clarification_required,
      source,
      trace_id: verdict.trace_id,
      reason: verdict.reason,
      certainty_snapshot: verdict.diagnostic_certainty,
    });
    overridden.push('clarification_required');
  }

  if (prevAllow !== verdict.recommendation_allowed) {
    responsePayload.recommendation_allowed = verdict.recommendation_allowed;
    logAuthorityMutation({
      field: 'recommendation_allowed',
      old_value: prevAllow,
      new_value: verdict.recommendation_allowed,
      source,
      trace_id: verdict.trace_id,
      reason: verdict.reason,
      certainty_snapshot: verdict.diagnostic_certainty,
    });
    overridden.push('recommendation_allowed');
  }

  if (prevState !== verdict.diagnostic_state) {
    responsePayload.diagnostic_state = verdict.diagnostic_state;
    logAuthorityMutation({
      field: 'diagnostic_state',
      old_value: prevState,
      new_value: verdict.diagnostic_state,
      source,
      trace_id: verdict.trace_id,
      reason: verdict.reason,
      certainty_snapshot: verdict.diagnostic_certainty,
    });
    overridden.push('diagnostic_state');
  }

  responsePayload.diagnostic_certainty = verdict.diagnostic_certainty;
  responsePayload.authority_verdict = {
    version: verdict.version,
    state: verdict.diagnostic_state,
    response_mode: verdict.response_mode,
    certainty: verdict.diagnostic_certainty,
    reason: verdict.reason,
    breakdown: verdict.certainty_breakdown,
  };

  // If clarification is required, strip recommendation-carrying fields
  if (verdict.clarification_required || !verdict.recommendation_allowed) {
    const recommendationFields = [
      'actions',
      'primary_decision',
      'secondary_recommendations',
      'matched_responses',
      'actions_returned',
      'recommendations',
    ];
    for (const f of recommendationFields) {
      if (
        Array.isArray(responsePayload[f]) && responsePayload[f].length > 0
        || (responsePayload[f] && typeof responsePayload[f] === 'object' && !Array.isArray(responsePayload[f]))
      ) {
        stripped.push(f);
        responsePayload[f] = Array.isArray(responsePayload[f]) ? [] : null;
      }
    }
  }

  return { overridden, stripped };
}
