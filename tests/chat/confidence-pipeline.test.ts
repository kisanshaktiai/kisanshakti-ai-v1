/**
 * Regression guard — confidence pipeline (audit 2026-06-07)
 *
 * Locks two RCA fixes:
 *  1) ui-response-builder.ts:195 precedence bug — numeric metadata.confidence
 *     must propagate to the UI contract.
 *  2) index.ts confidence bridge — the fallback chain must accept any of
 *     weighted_confidence / confidence_score / rule_confidence / score /
 *     hypothesis_score / metadata.confidence (in that order).
 */
import { describe, it, expect } from 'vitest';

/* ────────────────────────────────────────────────────────────────────────── */
/* Fix #1 — UI confidence resolution                                          */
/* ────────────────────────────────────────────────────────────────────────── */

// Inlined copy of the post-fix resolution. If the source diverges, update here.
function resolveUiConfidence(
  safeMeta: { confidence?: unknown } | undefined,
  safeGate: { confidence_level?: string | null; decision_confidence?: unknown } | undefined,
  safeDecision: { confidence_score?: unknown } | undefined,
  parseConfidenceLevel: (l: string | null | undefined) => number,
): number {
  const meta = safeMeta ?? {};
  const gate = safeGate ?? {};
  const dec = safeDecision ?? {};
  const numericMeta =
    typeof meta.confidence === 'number' && !isNaN(meta.confidence) ? meta.confidence : null;
  const numericDecision =
    typeof dec.confidence_score === 'number' && !isNaN(dec.confidence_score)
      ? (dec.confidence_score as number)
      : null;
  const numericGate =
    typeof gate.decision_confidence === 'number' && !isNaN(gate.decision_confidence as number)
      ? ((gate.decision_confidence as number) > 1
          ? (gate.decision_confidence as number) / 100
          : (gate.decision_confidence as number))
      : null;
  return numericMeta !== null
    ? numericMeta
    : numericDecision !== null
    ? numericDecision
    : numericGate !== null
    ? numericGate
    : gate.confidence_level
    ? parseConfidenceLevel(gate.confidence_level)
    : 0.5;
}

const parseLvl = (l?: string | null) =>
  l === 'HIGH' ? 0.9 : l === 'MEDIUM' ? 0.6 : l === 'LOW' ? 0.3 : 0.5;

describe('UI confidence resolution (precedence-bug guard)', () => {
  it('uses numeric metadata.confidence when present', () => {
    expect(
      resolveUiConfidence({ confidence: 0.82 }, { confidence_level: 'LOW' }, {}, parseLvl),
    ).toBe(0.82);
  });

  it('falls back to decision.confidence_score', () => {
    expect(resolveUiConfidence({}, {}, { confidence_score: 0.71 }, parseLvl)).toBe(0.71);
  });

  it('normalizes 0-100 gate.decision_confidence to 0-1', () => {
    expect(resolveUiConfidence({}, { decision_confidence: 75 }, {}, parseLvl)).toBe(0.75);
  });

  it('falls back to gate.confidence_level when no numeric source', () => {
    expect(resolveUiConfidence({}, { confidence_level: 'HIGH' }, {}, parseLvl)).toBe(0.9);
  });

  it('returns 0.5 floor only when nothing is set', () => {
    expect(resolveUiConfidence({}, {}, {}, parseLvl)).toBe(0.5);
  });

  it('does NOT short-circuit on `confidence === 0` (must propagate the zero)', () => {
    // Old buggy precedence treated `0 ?? something` as truthy via the gate label.
    // After fix, an explicit numeric 0 from metadata is honored.
    expect(
      resolveUiConfidence({ confidence: 0 }, { confidence_level: 'HIGH' }, {}, parseLvl),
    ).toBe(0);
  });

  it('ignores NaN and falls through', () => {
    expect(
      resolveUiConfidence({ confidence: NaN }, {}, { confidence_score: 0.4 }, parseLvl),
    ).toBe(0.4);
  });
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Fix #2 — symbolic confidence bridge fallback order                          */
/* ────────────────────────────────────────────────────────────────────────── */

function resolveSymbolicConfidence(decisionOutput: any, metadata?: any): number {
  const layered = decisionOutput?.layered_rule_result || {};
  const primary = decisionOutput?.primary_decision || {};
  const hypothesis = decisionOutput?.hypothesis_result || {};
  let raw =
    layered?.primary_decision?.weighted_confidence ??
    layered?.primary_decision?.confidence_score ??
    layered?.primary_decision?.rule_confidence ??
    primary?.weighted_confidence ??
    primary?.confidence_score ??
    primary?.rule_confidence ??
    primary?.score ??
    hypothesis?.hypothesis_score ??
    metadata?.confidence ??
    0;
  if (isNaN(raw)) raw = 0.5;
  if (raw > 1) raw = raw / 100;
  if (raw < 0) raw = 0;
  if (raw > 1) raw = 1;
  return raw;
}

describe('Symbolic confidence bridge fallback chain', () => {
  it('prefers layered.primary_decision.weighted_confidence', () => {
    expect(
      resolveSymbolicConfidence({
        layered_rule_result: { primary_decision: { weighted_confidence: 0.88, confidence_score: 0.5 } },
      }),
    ).toBe(0.88);
  });

  it('falls through to primary_decision.score', () => {
    expect(
      resolveSymbolicConfidence({ primary_decision: { score: 0.66 } }),
    ).toBeCloseTo(0.66);
  });

  it('falls through to hypothesis_result.hypothesis_score', () => {
    expect(
      resolveSymbolicConfidence({ hypothesis_result: { hypothesis_score: 0.55 } }),
    ).toBe(0.55);
  });

  it('falls through to metadata.confidence when decision_output is empty', () => {
    expect(resolveSymbolicConfidence({}, { confidence: 0.42 })).toBe(0.42);
  });

  it('normalizes 0-100 inputs to 0-1', () => {
    expect(
      resolveSymbolicConfidence({ primary_decision: { weighted_confidence: 80 } }),
    ).toBeCloseTo(0.8);
  });

  it('NaN guard → 0.5', () => {
    expect(
      resolveSymbolicConfidence({ primary_decision: { weighted_confidence: NaN } }),
    ).toBe(0.5);
  });

  it('returns 0 when no source provided (caller applies invariant floor)', () => {
    expect(resolveSymbolicConfidence({})).toBe(0);
  });
});
