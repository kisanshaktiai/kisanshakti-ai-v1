// ═══════════════════════════════════════════════════════════════════════════
// Decision Readiness Gate
//
// Architectural fix: hypothesis competition runs BEFORE the Understanding
// Gate. If at least one candidate hypothesis scores ≥ READY_TOP_SCORE, OR if
// any candidate has a mapped decision rule, the system is "ready to reason"
// and the generic severity/photo/affected_part Understanding Gate is bypassed.
//
// World-class agronomic systems use *diagnosis to create certainty*, not
// *certainty before diagnosis*. This module is the single arbiter of that
// decision.
//
// Returns:
//   ready=true                 → caller should set bypassClarification=true
//                                and let the hypothesis arbitration + rule
//                                evaluator run their normal course.
//   ready=false + reason       → caller falls back to existing Understanding
//                                Gate / scope-aware clarification.
// ═══════════════════════════════════════════════════════════════════════════

import {
  evaluateCandidateHypotheses,
  type CandidateHypothesis,
  type HypothesisEvaluationOutput,
} from './hypothesis-evaluator.ts';
import { isDiagnosticEntryObservation } from './diagnosis-only-mode.ts';

export const READINESS_GATE_VERSION = '1.1.0'; // Phase-24: diagnostic-entry pre-check

// Tunable thresholds (see plan.md, Phase 1)
export const READY_TOP_SCORE = 0.55;     // top candidate must clear this
export const READY_SPREAD = 0.10;        // top1 − top2 spread for confidence

export interface ReadinessProbeInput {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  ndvi_level?: string;
  ndvi_trend?: string;
  known_observations: string[];
  user_query: string;
  supabaseClient: any;
  trace_id: string;
  variety_id?: string | null;
  variety_resistance?: any;
}

export interface ReadinessProbeResult {
  ready: boolean;
  reason: string;
  top_score: number;
  spread: number;
  candidates_count: number;
  top_candidates: Array<{ cause: string; rule_id: string; score: number }>;
  fired_rule_ids: string[];
  evaluation: HypothesisEvaluationOutput | null;
}

export async function runHypothesisReadinessProbe(
  input: ReadinessProbeInput,
): Promise<ReadinessProbeResult> {
  const empty: ReadinessProbeResult = {
    ready: false,
    reason: 'NO_CANDIDATES',
    top_score: 0,
    spread: 0,
    candidates_count: 0,
    top_candidates: [],
    fired_rule_ids: [],
    evaluation: null,
  };

  if (!input.crop_code || input.crop_code === 'UNKNOWN') {
    return { ...empty, reason: 'NO_CROP_CONTEXT' };
  }
  if (!input.known_observations || input.known_observations.length === 0) {
    return { ...empty, reason: 'NO_OBSERVATIONS' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase-24: DIAGNOSTIC-ENTRY PRE-CHECK
  // If the farmer reported a germination/emergence/establishment problem,
  // the symbolic brain MUST run — even if hypothesis_master coverage for
  // those canonical groups is sparse and the evaluator returns weak scores.
  // The gate must not short-circuit to a generic CLARIFY.
  // ═══════════════════════════════════════════════════════════════════════════
  const hasDiagnosticEntry = input.known_observations.some((o) =>
    isDiagnosticEntryObservation(o),
  );


  let evaluation: HypothesisEvaluationOutput;
  try {
    evaluation = await evaluateCandidateHypotheses({
      crop_code: input.crop_code,
      growth_stage: input.growth_stage,
      days_since_sowing: input.days_since_sowing,
      ndvi_level: input.ndvi_level,
      ndvi_trend: input.ndvi_trend,
      known_observations: input.known_observations,
      user_query: input.user_query,
      supabaseClient: input.supabaseClient,
      trace_id: input.trace_id,
      variety_id: input.variety_id ?? null,
      variety_resistance: input.variety_resistance,
    });
  } catch (err) {
    return { ...empty, reason: `EVALUATOR_ERROR:${(err as Error).message}` };
  }

  const candidates: CandidateHypothesis[] = evaluation.candidates || [];
  if (candidates.length === 0) {
    return { ...empty, evaluation, reason: 'NO_CANDIDATES' };
  }

  const sorted = [...candidates].sort(
    (a, b) => (b.total_score ?? 0) - (a.total_score ?? 0),
  );
  const top = sorted[0];
  const second = sorted[1];
  const topScore = top.total_score ?? 0;
  const spread = (top.total_score ?? 0) - (second?.total_score ?? 0);
  const firedRuleIds = sorted
    .filter((c) => c.rule_id)
    .map((c) => c.rule_id);

  const result: ReadinessProbeResult = {
    ready: false,
    reason: '',
    top_score: topScore,
    spread,
    candidates_count: candidates.length,
    top_candidates: sorted.slice(0, 5).map((c) => ({
      cause: c.cause,
      rule_id: c.rule_id,
      score: c.total_score ?? 0,
    })),
    fired_rule_ids: firedRuleIds,
    evaluation,
  };

  // Phase-24: diagnostic-entry observations FORCE ready=true so the symbolic
  // brain (hypothesis arbitration + rule engine + targeted clarifier) runs
  // even when hypothesis_master coverage for the GERMINATION/EMERGENCE
  // canonical group is sparse and the evaluator returns weak scores.
  if (hasDiagnosticEntry) {
    return {
      ...result,
      ready: true,
      reason: 'DIAGNOSTIC_ENTRY_OBSERVATION',
    };
  }

  // Readiness rules (any one suffices)
  if (topScore >= READY_TOP_SCORE && spread >= READY_SPREAD) {
    return { ...result, ready: true, reason: 'STRONG_TOP_AND_SPREAD' };
  }
  if (topScore >= READY_TOP_SCORE && candidates.length === 1) {
    return { ...result, ready: true, reason: 'STRONG_TOP_SINGLE_CANDIDATE' };
  }
  if (topScore >= 0.70) {
    // Very confident top — spread doesn't matter
    return { ...result, ready: true, reason: 'VERY_HIGH_TOP_SCORE' };
  }
  if (firedRuleIds.length > 0 && topScore >= 0.40) {
    // At least one decision rule maps cleanly to a candidate — let the rule
    // engine compete; do not block with a generic clarification.
    return { ...result, ready: true, reason: 'MAPPED_RULE_AVAILABLE' };
  }

  return {
    ...result,
    ready: false,
    reason: `WEAK_HYPOTHESIS(top=${topScore.toFixed(2)},spread=${spread.toFixed(2)})`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Structured BRAIN_TRACE log — single source of truth for verification.
// ═══════════════════════════════════════════════════════════════════════════
export function logBrainTrace(args: {
  trace_id: string;
  intent_code: string;
  intent_confidence: number;
  observations_confirmed: number;
  observations_extracted: number;
  observations_inferred: number;
  probe: ReadinessProbeResult;
  decision: 'RESPOND' | 'CLARIFY_TARGETED' | 'CLARIFY_GENERIC';
  gate_reason: string;
}) {
  const top = args.probe.top_candidates
    .map(
      (c, i) =>
        `${i + 1}.${c.cause}(${c.score.toFixed(2)}${c.rule_id ? `,${c.rule_id}` : ''})`,
    )
    .join(' ');
  console.log(
    `\n[BRAIN_TRACE] trace=${args.trace_id}\n` +
      `  INTENT: ${args.intent_code} (${args.intent_confidence.toFixed(2)})\n` +
      `  OBSERVATIONS: confirmed=${args.observations_confirmed} extracted=${args.observations_extracted} inferred=${args.observations_inferred}\n` +
      `  HYPOTHESES (top 5, n=${args.probe.candidates_count}): ${top || 'none'}\n` +
      `  RULES (mapped): ${args.probe.fired_rule_ids.slice(0, 10).join(', ') || 'none'}\n` +
      `  PROBE: ready=${args.probe.ready} reason=${args.probe.reason} top=${args.probe.top_score.toFixed(2)} spread=${args.probe.spread.toFixed(2)}\n` +
      `  DECISION: ${args.decision} (${args.gate_reason})`,
  );
}
