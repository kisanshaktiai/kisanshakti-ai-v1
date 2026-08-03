/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EVIDENCE CONFIDENCE — pre-hypothesis evidence weighting layer
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 *   2026-07-26 — CREATED. Forensic audit F1/F4. `assertion_strength` was being
 *     used as a hard SQL exclusion gate (`.eq('assertion_strength','LITERAL')`)
 *     which made 13,245 of 13,594 active `intent_observation_mapping` rows
 *     invisible to the graph. `decision/confidence-calculator.ts` is a
 *     POST-decision calibrator and cannot repair that loss because it never
 *     sees observation candidates.
 *
 *     This module is the missing FIRST confidence stage:
 *
 *       intent → observation mapping
 *            ↓
 *       EVIDENCE CONFIDENCE   ← this file
 *            ↓
 *       hypothesis competition
 *            ↓
 *       decision rules
 *            ↓
 *       ConfidenceCalculator (unchanged, post-decision)
 *
 * CONTRACT
 *   - `assertion_strength` and `confidence_rank` are WEIGHTS, never filters.
 *     No observation is ever excluded from the graph by its strength.
 *   - Every numeric weight is read from `public.system_config`. There are no
 *     agronomy constants in this file; the fallbacks exist only so a cold
 *     boot preserves today's ordering (LITERAL > STRONG_HYPOTHESIS >
 *     DIFFERENTIAL) and are logged via `[SYSCFG_MISS]` by the cache.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getConfigNumber } from '../utils/db-ssot/system-config-cache.ts';
import { canonicalObsCode } from '../utils/canonical-code.ts';

export type EvidenceSource =
  | 'FARMER_CONFIRMED'
  | 'FARMER_STATED'
  | 'VISION'
  | 'SENSOR'
  | 'INFERRED_PEER'
  | 'UNKNOWN';

export interface EvidenceCandidate {
  observation_code: string;
  assertion_strength?: string | null;
  confidence_rank?: number | null;
  is_diagnostic?: boolean | null;
  clarity_score?: number | null;
  discriminator_score?: number | null;
  frequency_score?: number | null;
  source?: EvidenceSource;
}

export interface ScoredEvidence extends EvidenceCandidate {
  observation_code: string;
  evidence_confidence: number;
  weight_breakdown: {
    assertion: number;
    rank: number;
    diagnostic: number;
    quality: number;
    source: number;
  };
}

export interface EvidenceWeights {
  assertion: Record<string, number>;
  assertionDefault: number;
  rankDecay: number;
  diagnosticBoost: number;
  source: Record<string, number>;
  sourceDefault: number;
  /** Bounded injection cap for zero-observation intent fallbacks. */
  fallbackMaxInject: number;
  qualityScaleMax: number;
  minInjectConfidence: number;
}

const CFG = {
  literal: 'evidence_weight_assertion_literal',
  strong: 'evidence_weight_assertion_strong_hypothesis',
  differential: 'evidence_weight_assertion_differential',
  assertionDefault: 'evidence_weight_assertion_default',
  rankDecay: 'evidence_weight_rank_decay',
  diagnosticBoost: 'evidence_weight_diagnostic_boost',
  srcFarmerConfirmed: 'evidence_weight_source_farmer_confirmed',
  srcFarmerStated: 'evidence_weight_source_farmer_stated',
  srcVision: 'evidence_weight_source_vision',
  srcSensor: 'evidence_weight_source_sensor',
  srcInferredPeer: 'evidence_weight_source_inferred_peer',
  srcDefault: 'evidence_weight_source_default',
  fallbackMaxInject: 'evidence_iom_fallback_max_inject',
  qualityScaleMax: 'evidence_quality_score_scale_max',
  minInjectConfidence: 'evidence_min_confidence_for_injection',
} as const;

/** Reads all weights from the preloaded system_config cache (sync). */
export function getEvidenceWeights(): EvidenceWeights {
  return {
    assertion: {
      LITERAL: getConfigNumber(CFG.literal, 1.0),
      STRONG_HYPOTHESIS: getConfigNumber(CFG.strong, 0.75),
      DIFFERENTIAL: getConfigNumber(CFG.differential, 0.45),
    },
    assertionDefault: getConfigNumber(CFG.assertionDefault, 0.45),
    rankDecay: getConfigNumber(CFG.rankDecay, 0.05),
    diagnosticBoost: getConfigNumber(CFG.diagnosticBoost, 1.25),
    source: {
      FARMER_CONFIRMED: getConfigNumber(CFG.srcFarmerConfirmed, 1.0),
      FARMER_STATED: getConfigNumber(CFG.srcFarmerStated, 0.95),
      VISION: getConfigNumber(CFG.srcVision, 0.85),
      SENSOR: getConfigNumber(CFG.srcSensor, 0.9),
      INFERRED_PEER: getConfigNumber(CFG.srcInferredPeer, 0.6),
    },
    sourceDefault: getConfigNumber(CFG.srcDefault, 0.7),
    fallbackMaxInject: getConfigNumber(CFG.fallbackMaxInject, 12),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normScore(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  // observation_master quality scores are curated on either 0–1 or 0–10.
  return v > 1 ? clamp01(v / 10) : clamp01(v);
}

/** Score a single evidence candidate. Never returns 0 for a real code. */
export function scoreEvidence(
  candidate: EvidenceCandidate,
  weights: EvidenceWeights = getEvidenceWeights(),
): ScoredEvidence {
  const code = canonicalObsCode(candidate.observation_code);

  const strength = String(candidate.assertion_strength ?? '').trim().toUpperCase();
  const assertion = weights.assertion[strength] ?? weights.assertionDefault;

  const rankRaw = typeof candidate.confidence_rank === 'number' && Number.isFinite(candidate.confidence_rank)
    ? Math.max(0, candidate.confidence_rank)
    : null;
  const rank = rankRaw === null ? 1 : clamp01(1 - weights.rankDecay * Math.max(0, rankRaw - 1));

  const diagnostic = candidate.is_diagnostic === true ? weights.diagnosticBoost : 1;

  const qualityParts = [
    normScore(candidate.clarity_score),
    normScore(candidate.discriminator_score),
    normScore(candidate.frequency_score),
  ].filter((n): n is number => n !== null);
  const quality = qualityParts.length === 0
    ? 1
    : 0.5 + 0.5 * (qualityParts.reduce((a, b) => a + b, 0) / qualityParts.length);

  const src = String(candidate.source ?? 'UNKNOWN').toUpperCase();
  const source = weights.source[src] ?? weights.sourceDefault;

  const evidence_confidence = clamp01(assertion * rank * diagnostic * quality * source);

  return {
    ...candidate,
    observation_code: code,
    evidence_confidence,
    weight_breakdown: { assertion, rank, diagnostic, quality, source },
  };
}

// Score a candidate set and return it ordered by evidence confidence.
export function scoreEvidenceSet(
  candidates: ReadonlyArray<EvidenceCandidate>,
  weights: EvidenceWeights = getEvidenceWeights(),
): ScoredEvidence[] {
  const best = new Map<string, ScoredEvidence>();
  for (const c of candidates ?? []) {
    const scored = scoreEvidence(c, weights);
    if (!scored.observation_code) continue;
    const prev = best.get(scored.observation_code);
    if (!prev || scored.evidence_confidence > prev.evidence_confidence) {
      best.set(scored.observation_code, scored);
    }
  }
  const out = Array.from(best.values()).sort((a, b) => b.evidence_confidence - a.evidence_confidence);

  if (out.length > 0) {
    const byStrength = new Map<string, number>();
    for (const s of out) {
      const k = String(s.assertion_strength ?? 'NONE').toUpperCase();
      byStrength.set(k, (byStrength.get(k) ?? 0) + 1);
    }
    console.log(
      `[EVIDENCE_CONFIDENCE] scored=${out.length} ` +
      `strengths=${Array.from(byStrength).map(([k, v]) => `${k}:${v}`).join(',')} ` +
      `top=${out[0].observation_code}@${out[0].evidence_confidence.toFixed(3)} ` +
      `min=${out[out.length - 1].evidence_confidence.toFixed(3)}`,
    );
  }
  return out;
}

/** Lookup map consumed by the hypothesis graph evaluator. */
export function toEvidenceConfidenceMap(scored: ReadonlyArray<ScoredEvidence>): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of scored) m.set(s.observation_code, s.evidence_confidence);
  return m;
}
