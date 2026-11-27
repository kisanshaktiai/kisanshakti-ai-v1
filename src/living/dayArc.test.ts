import { describe, it, expect } from 'vitest';
import { arcPoint, indiaDay, nextDays, rainSegments, ARC_W } from './dayArc';

describe('dayArc', () => {
  it('runs the arc from the left end at sunrise to the right end at sunset', () => {
    expect(arcPoint(0).x).toBeLessThan(arcPoint(1).x);
    expect(arcPoint(0.5).y).toBeLessThan(arcPoint(0).y);
    expect(arcPoint(1).x).toBeLessThanOrEqual(ARC_W);
  });

  it('keeps only daylight hours with a rain chance and clips them to the arc', () => {
    const rise = 1_700_000_000, set = rise + 10 * 3600;
    const segs = rainSegments([
      { dt: rise - 7200, pop: 0.9 },           // before sunrise: dropped
      { dt: rise - 1800, pop: 0.5 },           // straddles sunrise: clipped to start at 0
      { dt: rise + 3600, pop: 0 },             // no chance: dropped
      { dt: rise + 5 * 3600, pop: 0.4 },
      { dt: set + 3600, pop: 1 },              // after sunset: dropped
    ], rise, set);
    expect(segs).toHaveLength(2);
    expect(segs[0].from).toBe(0);
    expect(segs[1]).toEqual({ from: 0.5, to: 0.6, chance: 0.4 });
  });

  it('returns nothing when sun times or hours are missing', () => {
    expect(rainSegments(null, 1, 2)).toEqual([]);
    expect(rainSegments([{ dt: 1, pop: 1 }], null, undefined)).toEqual([]);
  });

  it('lists India calendar days', () => {
    const noonIst = Date.UTC(2026, 10, 27, 6, 30);
    expect(indiaDay(noonIst)).toBe('2026-11-27');
    expect(nextDays(noonIst, 3)).toEqual(['2026-11-27', '2026-11-28', '2026-11-29']);
    // 20:00 UTC is already the next day in India
    expect(indiaDay(Date.UTC(2026, 10, 27, 20, 0))).toBe('2026-11-28');
  });
});
