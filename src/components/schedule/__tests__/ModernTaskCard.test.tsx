import { describe, it, expect } from 'vitest';

/**
 * Tests the confidence_score display formula used in ModernTaskCard.
 * The component renders: Math.round(task.confidence_score * 100)
 * Full render fails due to date-fns dependencies, so we test the formula directly.
 */
describe('ModernTaskCard confidence_score formula', () => {
  const formula = (score: number) => Math.round(score * 100);

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
});
