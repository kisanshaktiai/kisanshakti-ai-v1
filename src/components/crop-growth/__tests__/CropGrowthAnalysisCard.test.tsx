import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

import { CropGrowthAnalysisCard } from '../CropGrowthAnalysisCard';

const baseAnalysis = {
  id: 'test-1',
  crop_current_status: 'Test status',
  visual_observation_summary: 'Test summary',
  farmer_message: 'Test message',
  created_at: '2026-01-01T00:00:00Z',
  canopy_health_score: 0.8,
};

describe('CropGrowthAnalysisCard confidence_score display', () => {
  const cases = [
    { input: 0.85, expected: '85' },
    { input: 0.70, expected: '70' },
    { input: 1.0, expected: '100' },
  ];

  cases.forEach(({ input, expected }) => {
    it(`analysis_confidence ${input} displays as ${expected}%`, () => {
      render(
        <CropGrowthAnalysisCard
          analysis={{ ...baseAnalysis, analysis_confidence: input }}
        />
      );
      expect(screen.getByText(new RegExp(`${expected}%\\s*confident`))).toBeInTheDocument();
    });
  });

  // Test 0.0 - with != null check it should still render
  it('analysis_confidence 0.0 displays as 0%', () => {
    render(
      <CropGrowthAnalysisCard
        analysis={{ ...baseAnalysis, analysis_confidence: 0.0 }}
      />
    );
    expect(screen.getByText(new RegExp(`0%\\s*confident`))).toBeInTheDocument();
  });

  cases.forEach(({ input, expected }) => {
    it(`action confidence_score ${input} displays as ${expected}%`, () => {
      render(
        <CropGrowthAnalysisCard
          analysis={{
            ...baseAnalysis,
            recommended_actions: [{
              action: 'Test action',
              timing: 'Now',
              reason: 'Test',
              priority: 'high',
              confidence_score: input,
            }],
          }}
        />
      );
      expect(screen.getByText(`${expected}%`)).toBeInTheDocument();
    });
  });
});
