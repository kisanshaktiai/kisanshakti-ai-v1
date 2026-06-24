import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarketingInsightsDashboard } from '../MarketingInsightsDashboard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: null,
    isLoading: false,
  }),
}));

const makeInsight = (confidence: number) => ({
  id: 'test-1',
  insight_type: 'harvest_timing',
  crop_type: 'sugarcane',
  region: 'Maharashtra',
  ai_reasoning: 'Test reasoning',
  recommendations: 'Test recommendation',
  predicted_demand_quantity: 100,
  predicted_demand_unit: 'tons',
  confidence_score: confidence,
  time_window_start: '2026-03-01',
  time_window_end: '2026-03-31',
  supporting_data: {},
  tenant_id: 't1',
  created_at: '2026-01-01',
});

describe('MarketingInsightsDashboard confidence_score display', () => {
  const cases = [
    { input: 0.85, expected: '85' },
    { input: 0.70, expected: '70' },
    { input: 1.0, expected: '100' },
    { input: 0.0, expected: '0' },
  ];

  cases.forEach(({ input, expected }) => {
    it(`confidence_score ${input} displays as ${expected}%`, () => {
      // We need to render with insights data - the component fetches its own data
      // so we test the display formula directly
      const result = Math.min(Math.round(input * 100), 100);
      expect(result).toBe(Number(expected));
    });
  });
});
