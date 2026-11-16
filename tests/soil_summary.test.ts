import { describe, it, expect } from 'vitest';
import { soilMetrics, measuredCount } from '@/lib/soilSummary';

describe('soil summary', () => {
  it('never invents zeros when no soil test exists', () => {
    const m = soilMetrics(null);
    expect(measuredCount(m)).toBe(0);
    expect(m.every((x) => x.value === null)).toBe(true);
  });
  it('keeps saved values and their saved levels', () => {
    const m = soilMetrics({ ph_level: 7.2, nitrogen_kg_per_ha: 0, nitrogen_level: 'Low' });
    expect(m.find((x) => x.key === 'ph')!.value).toBe(7.2);
    expect(m.find((x) => x.key === 'nitrogen')!.value).toBe(0);
    expect(m.find((x) => x.key === 'nitrogen')!.level).toBe('Low');
    expect(measuredCount(m)).toBe(2);
  });
});
