/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION-ACTION INVARIANT GATE  (Phase 2 / RC-13 fix)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * INVARIANT (audited & approved in prior plan):
 *
 *   IF response.clarification_required === true
 *   THEN response.actions MUST be empty,
 *        response.recommendations MUST be empty,
 *        response.communication MUST NOT carry treatment/product fields.
 *
 * Production bug being fixed:
 *   Farmer query about emergence-failure produced
 *     understanding_confidence = 53%, clarification_required = true,
 *   yet the response still contained a DIAGNOSIS_ONLY_MODE payload with
 *   treatment actions. This violates the agronomic safety contract — we
 *   were prescribing treatment with insufficient understanding.
 *
 * This gate runs LAST, immediately before the response is serialised.
 * It is the single defence-in-depth guarantee that no future code path
 * can bypass clarification by mutating flags upstream.
 *
 * The gate is ALWAYS ON unless `CLARIFICATION_INVARIANT=off` env is set.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getClarificationInvariantEnabled } from '../runtime/feature-flags.ts';
import { funnelRecord } from '../runtime/funnel-tracker.ts';

export interface ClarificationInvariantResult {
  invariant_violated: boolean;
  fields_stripped: string[];
  reason: string;
  enforced: boolean;
  shadow_only: boolean;
}

/**
 * Inspect a response payload (the object that will become the orchestrator's
 * JSON response). If clarification_required=true but treatment-carrying
 * fields are populated, STRIP them in place and return a violation report.
 *
 * Mutates `payload` for performance (it's the final response object).
 */
export function enforceClarificationInvariant(
  payload: Record<string, any>,
  ctx: { trace_id?: string; source?: string } = {}
): ClarificationInvariantResult {
  const enabled = getClarificationInvariantEnabled();

  if (!enabled) {
    return {
      invariant_violated: false,
      fields_stripped: [],
      reason: 'Invariant disabled via CLARIFICATION_INVARIANT=off',
      enforced: false,
      shadow_only: false,
    };
  }

  // Detect "clarification required" across the multiple shapes that
  // historically encoded the state.
  const clarReq =
    payload?.clarification_required === true ||
    payload?.understanding?.clarification_required === true ||
    payload?.metadata?.clarification_required === true ||
    payload?.type === 'CLARIFICATION_QUESTION' ||
    payload?.communication?.message_type === 'CLARIFICATION_QUESTION';

  if (!clarReq) {
    return {
      invariant_violated: false,
      fields_stripped: [],
      reason: 'clarification_required is false — no invariant to enforce',
      enforced: true,
      shadow_only: false,
    };
  }

  const stripped: string[] = [];

  // 1. Top-level treatment-carrying arrays
  for (const k of ['actions', 'actions_returned', 'recommendations', 'products', 'rules_fired', 'matched_responses']) {
    const v = (payload as any)[k];
    if (Array.isArray(v) && v.length > 0) {
      (payload as any)[k] = [];
      stripped.push(k);
    }
  }

  // 2. Metadata mirrors
  if (payload?.metadata && typeof payload.metadata === 'object') {
    for (const k of ['actions_returned', 'actionsReturned', 'rules_applied', 'rulesFired', 'matched_responses', 'matchedResponses']) {
      const v = payload.metadata[k];
      if (Array.isArray(v) && v.length > 0) {
        payload.metadata[k] = [];
        stripped.push(`metadata.${k}`);
      }
    }
    if (payload.metadata.recommendations_provided === true) {
      payload.metadata.recommendations_provided = false;
      stripped.push('metadata.recommendations_provided');
    }
  }

  // 3. decision_output / symbolic decision
  if (payload?.decision_output && typeof payload.decision_output === 'object') {
    for (const k of ['actions_returned', 'rules_applied', 'matched_responses', 'primary_decision']) {
      if (payload.decision_output[k] != null) {
        const v = payload.decision_output[k];
        if (Array.isArray(v) ? v.length > 0 : true) {
          payload.decision_output[k] = Array.isArray(v) ? [] : null;
          stripped.push(`decision_output.${k}`);
        }
      }
    }
  }

  // 4. Communication payload — clear product/dosage/application fields
  if (payload?.communication && typeof payload.communication === 'object') {
    const c = payload.communication;
    for (const k of ['recommended_product', 'recommended_products', 'dosage', 'application_details', 'phi_days', 'spray_window']) {
      if (c[k] != null) {
        delete c[k];
        stripped.push(`communication.${k}`);
      }
    }
  }

  // Force the response type to CLARIFICATION_QUESTION if we detected the
  // invariant from any other shape — so the client never receives a
  // half-prescription payload labelled as a diagnosis.
  if (stripped.length > 0 && payload.type !== 'CLARIFICATION_QUESTION') {
    payload._original_type = payload.type;
    payload.type = 'CLARIFICATION_QUESTION';
    stripped.push('type→CLARIFICATION_QUESTION');
  }

  const violated = stripped.length > 0;

  if (violated) {
    console.error(
      `🚨 [ClarificationInvariant] VIOLATION DETECTED (trace=${ctx.trace_id ?? 'n/a'} source=${ctx.source ?? 'n/a'}) — stripped: ${stripped.join(', ')}`
    );
  }
  try {
    if (ctx.trace_id) {
      funnelRecord(ctx.trace_id, 'invariant_stripped', stripped.length);
      if (violated) funnelRecord(ctx.trace_id, 'clarification_forced', 1);
    }
  } catch { /* never block on instrumentation */ }

  return {
    invariant_violated: violated,
    fields_stripped: stripped,
    reason: violated
      ? `Stripped ${stripped.length} treatment fields because clarification_required=true`
      : 'clarification_required=true and no treatment fields present',
    enforced: true,
    shadow_only: false,
  };
}

export const CLARIFICATION_INVARIANT_VERSION = '1.0.0';
