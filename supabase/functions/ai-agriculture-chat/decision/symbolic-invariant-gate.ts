/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC INVARIANT GATE — Wave-R
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Universal, crop-agnostic, language-agnostic safety contract:
 *
 *   1. NO RULES FIRED  ⇒  NO TREATMENT TEXT
 *   2. EMITTED RULE-ID ∉ FIRED RULE-IDS  ⇒  NO TREATMENT TEXT
 *
 * Forensic preservation: this gate NEVER deletes candidate evidence. It moves
 * any candidate that fails the contract into
 *   decisionOutput.internal_candidates.*
 * so dashboards, audits and the decision logger keep full visibility, but
 * scrubs only the farmer-visible surface:
 *   decisionOutput.response_payload.*
 *
 * Every downstream consumer that emits text to the farmer (LLM formatter,
 * deterministic narration, prescription gate) MUST read from
 * `response_payload`, not from `primary_decision` / `matched_responses`.
 *
 * Fail-soft: never throws. On any unexpected shape the gate scrubs and
 * records a violation rather than letting unsafe content through.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { firedRuleIds, rulesActuallyFired } from '../runtime/rules-fired.ts';
import { recordSafetyViolation, type SafetyViolation } from '../runtime/safety-metrics.ts';

export interface InvariantGateContext {
  trace_id: string;
  tenant_id?: string | null;
  farmer_id?: string | null;
  session_id?: string | null;
  crop_code?: string | null;
  language?: string | null;
  intent?: string | null;
  observations?: Record<string, unknown>;
  /** Optional advisory hit from observation-rule-lookup — never narrated. */
  observation_rule_hit?: unknown;
}

export interface InvariantGateResult {
  gate_action: 'PASS' | 'SCRUB_NO_RULES' | 'SCRUB_IDENTITY_MISMATCH';
  rules_fired_count: number;
  fired_rule_ids: string[];
  emitted_rule_id: string | null;
  scrubbed_rule_ids: string[];
  reason: string;
}

function ridOf(x: unknown): string | null {
  if (!x) return null;
  if (typeof x === 'string') return x;
  if (typeof x === 'object') {
    const rid = (x as { rule_id?: unknown }).rule_id;
    return typeof rid === 'string' ? rid : null;
  }
  return null;
}

/**
 * Enforce the symbolic safety contract on `decisionOutput` (in place).
 * Returns a structured result; never throws.
 */
export async function enforceNoRuleNoTreatment(
  decisionOutput: any,
  ctx: InvariantGateContext,
): Promise<InvariantGateResult> {
  // Defensive: if decisionOutput is missing/non-object, treat as scrub.
  if (!decisionOutput || typeof decisionOutput !== 'object') {
    return {
      gate_action: 'PASS',
      rules_fired_count: 0,
      fired_rule_ids: [],
      emitted_rule_id: null,
      scrubbed_rule_ids: [],
      reason: 'no_decision_output',
    };
  }

  // Always make response_payload reference available, even on PASS.
  // Initial value mirrors current decision_output so unchanged turns work.
  const primary = decisionOutput.primary_decision ?? null;
  const secondary = Array.isArray(decisionOutput.secondary_recommendations)
    ? decisionOutput.secondary_recommendations
    : [];
  const matched = Array.isArray(decisionOutput.matched_responses)
    ? decisionOutput.matched_responses
    : [];
  const actions = Array.isArray(decisionOutput.actions_returned)
    ? decisionOutput.actions_returned
    : [];

  const fired = firedRuleIds(decisionOutput);
  const firedSet = new Set(fired);
  const rulesFiredCount = fired.length;

  // Wave-S authority desync probe: primary exists but rules_applied empty
  // means an upstream layer set primary_decision without registering its
  // rule_id in the SSOT fired-set. Log loudly so regressions are visible.
  const primaryRidProbe = ridOf(decisionOutput.primary_decision);
  if (primaryRidProbe && rulesFiredCount === 0) {
    console.warn(
      `🚨 [SYMBOLIC_AUTHORITY_DESYNC] trace=${ctx.trace_id} primary_rule_id=${primaryRidProbe} ` +
      `but rules_applied is empty — a competing authority bypassed LayeredRuleEvaluator. ` +
      `This will be scrubbed by NO_RULES_FIRED_HARD_GATE.`,
    );
  } else if (primaryRidProbe && !firedSet.has(primaryRidProbe)) {
    console.warn(
      `🚨 [SYMBOLIC_AUTHORITY_DESYNC] trace=${ctx.trace_id} primary_rule_id=${primaryRidProbe} ` +
      `is NOT in fired-set [${fired.join(',')}] — competing authority detected. ` +
      `This will be scrubbed by RULE_EMISSION_MISMATCH_HARD_GATE.`,
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CASE 1 — No rule actually fired. Strip everything from farmer surface.
  // ═════════════════════════════════════════════════════════════════════════
  if (rulesFiredCount === 0) {
    const candidateRuleIds = Array.from(
      new Set(
        [
          ridOf(primary),
          ...matched.map(ridOf),
          ...secondary.map(ridOf),
          ridOf((ctx.observation_rule_hit as any)),
        ].filter((s): s is string => !!s),
      ),
    );

    decisionOutput.internal_candidates = {
      ...(decisionOutput.internal_candidates ?? {}),
      matched_responses: matched,
      candidate_rules: Array.isArray(decisionOutput.candidate_rules)
        ? decisionOutput.candidate_rules
        : [],
      primary_decision_candidate: primary,
      secondary_recommendations_candidates: secondary,
      observation_rule_hit: ctx.observation_rule_hit ?? null,
    };

    decisionOutput.response_payload = {
      primary_decision: null,
      secondary_recommendations: [],
      matched_responses: [],
      actions_returned: [],
    };
    // Also null out the legacy top-level fields used by older formatter paths
    // so we get defence-in-depth. The originals live in internal_candidates.
    decisionOutput.primary_decision = null;
    decisionOutput.secondary_recommendations = [];
    decisionOutput.matched_responses = [];
    decisionOutput.actions_returned = [];

    decisionOutput.response_mode = 'OBSERVATION';
    decisionOutput.gate_reason = 'NO_RULES_FIRED_HARD_GATE';

    await recordSafetyViolation(buildViolation(ctx, {
      reason: 'NO_RULES_FIRED_HARD_GATE',
      emitted_rule_id: ridOf(primary),
      fired_rule_ids: [],
      candidate_rule_ids: candidateRuleIds,
    }));

    return {
      gate_action: 'SCRUB_NO_RULES',
      rules_fired_count: 0,
      fired_rule_ids: [],
      emitted_rule_id: ridOf(primary),
      scrubbed_rule_ids: candidateRuleIds,
      reason: 'NO_RULES_FIRED_HARD_GATE',
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // CASE 2 — Rules fired. Verify rule-identity for everything we will emit.
  //          Any candidate whose rule_id ∉ firedSet is moved to internal.
  // ═════════════════════════════════════════════════════════════════════════
  const primaryRid = ridOf(primary);
  const primaryMismatch = primaryRid !== null && !firedSet.has(primaryRid);

  const cleanedSecondary: unknown[] = [];
  const droppedSecondary: unknown[] = [];
  for (const r of secondary) {
    const rid = ridOf(r);
    if (rid && firedSet.has(rid)) cleanedSecondary.push(r);
    else droppedSecondary.push(r);
  }

  const cleanedMatched: unknown[] = [];
  const droppedMatched: unknown[] = [];
  for (const r of matched) {
    const rid = ridOf(r);
    if (rid && firedSet.has(rid)) cleanedMatched.push(r);
    else droppedMatched.push(r);
  }

  const scrubbedIds = Array.from(
    new Set(
      [
        ...(primaryMismatch && primaryRid ? [primaryRid] : []),
        ...droppedSecondary.map(ridOf),
        ...droppedMatched.map(ridOf),
      ].filter((s): s is string => !!s),
    ),
  );

  decisionOutput.internal_candidates = {
    ...(decisionOutput.internal_candidates ?? {}),
    matched_responses_dropped: droppedMatched,
    secondary_dropped: droppedSecondary,
    observation_rule_hit: ctx.observation_rule_hit ?? null,
    ...(primaryMismatch
      ? { primary_decision_mismatch: primary }
      : {}),
  };

  if (primaryMismatch) {
    // Treat identity-mismatch as hard scrub of the primary.
    decisionOutput.primary_decision = null;
    decisionOutput.response_mode = 'OBSERVATION';
    decisionOutput.gate_reason = 'RULE_EMISSION_MISMATCH_HARD_GATE';

    decisionOutput.response_payload = {
      primary_decision: null,
      secondary_recommendations: cleanedSecondary,
      matched_responses: cleanedMatched,
      actions_returned: actions,
    };
    decisionOutput.secondary_recommendations = cleanedSecondary;
    decisionOutput.matched_responses = cleanedMatched;

    await recordSafetyViolation(buildViolation(ctx, {
      reason: 'RULE_EMISSION_MISMATCH_HARD_GATE',
      emitted_rule_id: primaryRid,
      fired_rule_ids: fired,
      candidate_rule_ids: scrubbedIds,
    }));

    return {
      gate_action: 'SCRUB_IDENTITY_MISMATCH',
      rules_fired_count: rulesFiredCount,
      fired_rule_ids: fired,
      emitted_rule_id: primaryRid,
      scrubbed_rule_ids: scrubbedIds,
      reason: 'RULE_EMISSION_MISMATCH_HARD_GATE',
    };
  }

  // Normal pass: still write response_payload so consumers have ONE place to read.
  decisionOutput.secondary_recommendations = cleanedSecondary;
  decisionOutput.matched_responses = cleanedMatched;
  decisionOutput.response_payload = {
    primary_decision: primary,
    secondary_recommendations: cleanedSecondary,
    matched_responses: cleanedMatched,
    actions_returned: actions,
  };

  return {
    gate_action: 'PASS',
    rules_fired_count: rulesFiredCount,
    fired_rule_ids: fired,
    emitted_rule_id: primaryRid,
    scrubbed_rule_ids: scrubbedIds,
    reason: 'rules_fired_and_identity_verified',
  };
}

function buildViolation(
  ctx: InvariantGateContext,
  partial: Pick<
    SafetyViolation,
    'reason' | 'emitted_rule_id' | 'fired_rule_ids' | 'candidate_rule_ids'
  >,
): SafetyViolation {
  return {
    reason: partial.reason,
    trace_id: ctx.trace_id,
    tenant_id: ctx.tenant_id ?? null,
    farmer_id: ctx.farmer_id ?? null,
    session_id: ctx.session_id ?? null,
    crop_code: ctx.crop_code ?? null,
    language: ctx.language ?? null,
    intent: ctx.intent ?? null,
    emitted_rule_id: partial.emitted_rule_id ?? null,
    fired_rule_ids: partial.fired_rule_ids ?? [],
    candidate_rule_ids: partial.candidate_rule_ids ?? [],
    observations: ctx.observations ?? {},
    details: {
      observation_rule_hit_rule_id: ridOf(ctx.observation_rule_hit),
    },
  };
}

/**
 * Utility: returns true iff `decisionOutput.response_payload` allows the
 * formatter to render treatment text. Used by formatter precondition checks.
 */
export function responsePayloadHasTreatment(decisionOutput: unknown): boolean {
  const dec = (decisionOutput || {}) as Record<string, unknown>;
  const rp = dec.response_payload as Record<string, unknown> | undefined;
  if (!rp) {
    // No payload yet → trust legacy fields, but only if rules actually fired.
    return rulesActuallyFired(dec) > 0 && !!(dec as any).primary_decision;
  }
  return !!rp.primary_decision;
}

export const SYMBOLIC_INVARIANT_GATE_VERSION = '1.0.0';
