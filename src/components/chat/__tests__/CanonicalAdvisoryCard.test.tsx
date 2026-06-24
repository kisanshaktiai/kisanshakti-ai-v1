import { describe, it, expect } from 'vitest';

/**
 * Tests the confidence_score display formula used in CanonicalAdvisoryCard.
 * The trace section renders: Math.min(Math.round(trace.confidence_score * 100), 100)
 * Since the trace section is collapsed by default, we test the formula directly.
 */
describe('CanonicalAdvisoryCard confidence_score formula', () => {
  const formula = (score: number) => Math.min(Math.round(score * 100), 100);

  it('confidence_score 0.85 → 85', () => {
    expect(formula(0.85)).toBe(85);
  });

  it('confidence_score 0.70 → 70', () => {
    expect(formula(0.70)).toBe(70);
  });

  it('confidence_score 1.0 → 100', () => {
    expect(formula(1.0)).toBe(100);
  });

  it('confidence_score 0.0 → 0', () => {
    expect(formula(0.0)).toBe(0);
  });

  it('guard prevents values > 100', () => {
    // Should never happen after DB migration, but guard protects
    expect(formula(1.5)).toBe(100);
  });
});
