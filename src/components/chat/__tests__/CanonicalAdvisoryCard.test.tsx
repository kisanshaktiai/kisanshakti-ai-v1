import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanonicalAdvisoryCard } from '../CanonicalAdvisoryCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const makeAdvisory = (confidence: number) => ({
  version: '1.0',
  diagnosis: {
    problem: 'Test problem',
    category: 'pest',
    rule_id: 'TEST_001',
    confidence_score: confidence,
    response_decision: 'TREAT' as const,
  },
  explanation: {
    what_is_happening: 'Test explanation',
    why_it_matters: 'Test why',
    how_we_know: 'Test how',
  },
  treatment: {
    has_treatment: true,
    primary: {
      action_type: 'spray',
      action_text: 'Test spray',
      product_name: 'TestProduct',
      dosage: '10ml/L',
      timing: 'morning',
      method: 'foliar spray',
    },
  },
  prevention: { has_prevention: false, measures: [] },
  economics: { has_economics: false },
  monitoring: { has_monitoring: false, success_indicators: [], failure_indicators: [] },
  trace: {
    rule_id: 'TEST_001',
    confidence_score: confidence,
  },
});

describe('CanonicalAdvisoryCard confidence_score display', () => {
  const cases = [
    { input: 0.85, expected: '85%' },
    { input: 0.70, expected: '70%' },
    { input: 1.0, expected: '100%' },
    { input: 0.0, expected: '0%' },
  ];

  cases.forEach(({ input, expected }) => {
    it(`confidence_score ${input} displays as ${expected}`, () => {
      render(<CanonicalAdvisoryCard advisory={makeAdvisory(input)} />);
      // The trace section shows "Confidence: X%"
      const elements = screen.getAllByText((_content, element) => {
        return element?.textContent?.includes(`Confidence: ${expected}`) ?? false;
      });
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });
});
