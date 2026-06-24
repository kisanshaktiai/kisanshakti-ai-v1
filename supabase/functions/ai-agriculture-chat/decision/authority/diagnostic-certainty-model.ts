/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC CERTAINTY MODEL — Single Source of Truth
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pure function: graphs in → certainty out. No side effects, no I/O.
 *
 * `certainty ∈ [0, 1]` is a weighted aggregate of:
 *   • evidence_coverage      — fraction of required obs that are confirmed
 *   • contradiction_score    — penalty for negated/competing evidence
 *   • competing_hypotheses   — count of hypotheses with conf ≥ 0.30
 *   • observation_confidence — mean confidence of evidence nodes
 *   • visual_confidence      — photo-derived contribution
 *   • rule_confidence        — top rule's weighted_confidence
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface CertaintyInputs {
  /** Observations confirmed by farmer/photo/sensor */
  confirmed_observations: string[];
  /** Observations the top hypothesis requires that are still missing */
  required_observations_missing: string[];
  /** Hypotheses (canonical_group or rule_id) with their posterior confidence ∈ [0,1] */
  hypotheses: Array<{ id: string; confidence: number }>;
  /** Evidence with explicit negation (e.g. farmer said "no waterlogging") */
  contradictions_count: number;
  /** Mean confidence of evidence nodes ∈ [0,1] */
  observation_confidence: number;
  /** Visual/photo derived confidence ∈ [0,1]; 0 if no photo */
  visual_confidence: number;
  /** Top decision_rule confidence ∈ [0,1]; 0 if none matched */
  rule_confidence: number;
  /** Does the top hypothesis require visual confirmation? */
  visual_confirmation_required: boolean;
}

export interface CertaintyResult {
  certainty: number;
  competing_hypotheses: number;
  evidence_coverage: number;
  contradiction_score: number;
  observation_confidence: number;
  visual_confidence: number;
  rule_confidence: number;
  required_observations_missing: number;
  visual_confirmation_required: boolean;
  breakdown: Record<string, number>;
}

const COMPETING_THRESHOLD = 0.30;

const WEIGHTS = {
  evidence_coverage: 0.30,
  observation_confidence: 0.20,
  rule_confidence: 0.20,
  visual_confidence: 0.10,
  hypothesis_dominance: 0.20, // 1 - (2nd / 1st)
};

export function computeCertainty(input: CertaintyInputs): CertaintyResult {
  const sortedHyps = [...input.hypotheses].sort((a, b) => b.confidence - a.confidence);
  const competing = sortedHyps.filter(h => h.confidence >= COMPETING_THRESHOLD).length;

  const top = sortedHyps[0]?.confidence ?? 0;
  const second = sortedHyps[1]?.confidence ?? 0;
  const dominance = top > 0 ? Math.max(0, 1 - second / Math.max(top, 1e-6)) : 0;

  const totalRequired =
    input.confirmed_observations.length + input.required_observations_missing.length;
  const evidenceCoverage =
    totalRequired > 0 ? input.confirmed_observations.length / totalRequired : 0;

  const contradictionPenalty = Math.min(0.3, input.contradictions_count * 0.1);

  const raw =
    WEIGHTS.evidence_coverage * evidenceCoverage +
    WEIGHTS.observation_confidence * clamp01(input.observation_confidence) +
    WEIGHTS.rule_confidence * clamp01(input.rule_confidence) +
    WEIGHTS.visual_confidence * clamp01(input.visual_confidence) +
    WEIGHTS.hypothesis_dominance * dominance;

  const certainty = clamp01(raw - contradictionPenalty);

  return {
    certainty,
    competing_hypotheses: competing,
    evidence_coverage: evidenceCoverage,
    contradiction_score: contradictionPenalty,
    observation_confidence: clamp01(input.observation_confidence),
    visual_confidence: clamp01(input.visual_confidence),
    rule_confidence: clamp01(input.rule_confidence),
    required_observations_missing: input.required_observations_missing.length,
    visual_confirmation_required: input.visual_confirmation_required,
    breakdown: {
      evidence_coverage: WEIGHTS.evidence_coverage * evidenceCoverage,
      observation_confidence: WEIGHTS.observation_confidence * clamp01(input.observation_confidence),
      rule_confidence: WEIGHTS.rule_confidence * clamp01(input.rule_confidence),
      visual_confidence: WEIGHTS.visual_confidence * clamp01(input.visual_confidence),
      hypothesis_dominance: WEIGHTS.hypothesis_dominance * dominance,
      contradiction_penalty: -contradictionPenalty,
    },
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
