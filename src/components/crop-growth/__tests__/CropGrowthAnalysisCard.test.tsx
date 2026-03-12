import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CropGrowthAnalysisCard } from '../CropGrowthAnalysisCard';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

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
    { input: 0.0, expected: '0' },
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
      // The action confidence badge shows just the percentage
      expect(screen.getByText(`${expected}%`)).toBeInTheDocument();
    });
  });
});
