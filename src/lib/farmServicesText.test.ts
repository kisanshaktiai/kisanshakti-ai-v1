import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/config', () => ({
  default: {
    language: 'en',
    exists: (key: string) => !key.includes('PER_TRAY'),
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'n' in options ? `${key}|${options.n}` : options && 'count' in options ? `${key}|${options.count}` : (options?.defaultValue as string) ?? key,
  },
}));
vi.mock('@/services/providerWorkspaceService', () => ({
  localName: (names: Record<string, string> | undefined, language: string) => names?.[language] || names?.default || '',
}));

import { amountText, dayValue, estimateText, phoneLink, plantVarietyText, requestsSummary } from './farmServicesText';

describe('farm services text helpers', () => {
  it('works out a cost only when the amount and the rate are in the same unit', () => {
    expect(estimateText(2.5, 'PER_ACRE', 1200, 'PER_ACRE', 'INR')).toContain('3,000');
    expect(estimateText(2.5, 'PER_ACRE', 900, 'PER_HOUR', 'INR')).toBeNull();
    expect(estimateText(2.5, 'PER_ACRE', null, 'PER_ACRE', 'INR')).toBeNull();
    expect(estimateText(0, 'PER_ACRE', 1200, 'PER_ACRE', 'INR')).toBeNull();
  });

  it('says an amount in the unit\'s own words, and falls back to the unit label for a unit without wording', () => {
    expect(amountText(2.5, 'PER_ACRE')).toBe('farmServices.amount.PER_ACRE|2.5');
    expect(amountText(3, 'PER_TRAY')).toBe('3 · PER_TRAY');
    expect(amountText(1, 'NEGOTIABLE', true)).toBe('');
  });

  it('prefers the master\'s variety name in the reader\'s language, then the nursery\'s own name', () => {
    expect(plantVarietyText({ en: 'Variety One', hi: 'Hindi Name', mr: null }, 'Own Name', 'hi')).toBe('Hindi Name');
    expect(plantVarietyText({ en: 'Variety One', hi: null, mr: null }, 'Own Name', 'mr')).toBe('Variety One');
    expect(plantVarietyText(null, 'Own Name', 'en')).toBe('Own Name');
    expect(plantVarietyText(null, null, 'en')).toBe('');
  });

  it('keeps only dialable characters in a phone link', () => {
    expect(phoneLink('+91 90000-00001')).toBe('tel:+919000000001');
  });

  it('gives the device\'s calendar day as YYYY-MM-DD', () => {
    expect(dayValue(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dayValue(1) > dayValue(0)).toBe(true);
  });

  it('summarises requests with what waits for the farmer first', () => {
    expect(requestsSummary(null)).toBe('farmServices.requests.summaryNone');
    expect(requestsSummary({ offers_waiting: 0, open: 0, booked: 0, to_rate: 0 })).toBe('farmServices.requests.summaryNone');
    expect(requestsSummary({ offers_waiting: 2, open: 3, booked: 1, to_rate: 0 }))
      .toBe('farmServices.requests.summaryAnswers|2 · farmServices.requests.summaryBooked|1 · farmServices.requests.summaryOpen|3');
  });
});
