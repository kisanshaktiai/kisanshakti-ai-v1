import { describe, it, expect } from 'vitest';
import { localizeDisplayUnits } from '@/lib/localizeDisplayUnits';

const mr: Record<string, string> = { 'schedule.units.day': 'दिवस', 'schedule.units.kg': 'किलो', 'schedule.units.mm': 'मिमी', 'schedule.frequency.every_day': 'दररोज' };
const t = (k: string) => mr[k] ?? k;
const digits = (s: string) => (s.match(/\d+(?:\.\d+)?/g) || []).join(',');

describe('localizeDisplayUnits', () => {
  it('translates "day N" in Marathi text and keeps numbers', () => {
    const src = 'पेरणीनंतर day 0 ते day 24 पर्यंत पाहा';
    const out = localizeDisplayUnits(src, t, 'mr');
    expect(out).toBe('पेरणीनंतर 0 दिवस ते 24 दिवस पर्यंत पाहा');
    expect(digits(out)).toBe(digits(src));
  });
  it('translates units after numbers and frequency phrases', () => {
    expect(localizeDisplayUnits('खत: 49.72 kg, पाणी 50 mm every day', t, 'mr')).toBe('खत: 49.72 किलो, पाणी 50 मिमी दररोज');
  });
  it('leaves English untouched', () => {
    expect(localizeDisplayUnits('day 0 to 24 days', t, 'en')).toBe('day 0 to 24 days');
  });
  it('leaves unknown tokens and units without translation untouched', () => {
    expect(localizeDisplayUnits('NPK 19:19:19 and 5 acre', t, 'mr')).toBe('NPK 19:19:19 and 5 acre');
  });
});
