import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock react-i18next with initReactI18next export
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import ModernTaskCard from '../ModernTaskCard';

const baseTask = {
  id: 'test-1',
  schedule_id: 's1',
  task_type: 'fertilizer',
  task_name: 'Test task',
  task_description: 'desc',
  task_date: '2026-03-15',
  status: 'pending',
  priority: 'medium',
};

describe('ModernTaskCard confidence_score display', () => {
  const cases = [
    { input: 0.85, expected: '85' },
    { input: 0.70, expected: '70' },
    { input: 1.0, expected: '100' },
  ];

  cases.forEach(({ input, expected }) => {
    it(`confidence_score ${input} displays as ${expected}%`, () => {
      render(
        <ModernTaskCard
          task={{ ...baseTask, confidence_score: input }}
          isOverdue={false}
          daysUntil={5}
          onSpeak={() => {}}
        />
      );
      expect(screen.getByText(new RegExp(`${expected}%\\s*confident`))).toBeInTheDocument();
    });
  });
});
