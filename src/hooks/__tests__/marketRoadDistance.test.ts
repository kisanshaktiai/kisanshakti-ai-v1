import { describe, it, expect } from 'vitest';
import { parseMatrix, durationMinutes } from '../../../supabase/functions/market-price-intelligence/roadDistance';

describe('road distance matrix', () => {
  it('rebuilds cells by destination index, treating omitted index as 0', () => {
    const r = parseMatrix([
      { destinationIndex: 1, condition: 'ROUTE_EXISTS', distanceMeters: 32400, duration: '2700s' },
      { condition: 'ROUTE_EXISTS', distanceMeters: 18000, duration: '1500s' },
    ], 2);
    expect(r[0]).toEqual({ km: 18, min: 25 });
    expect(r[1]).toEqual({ km: 32, min: 45 });
  });
  it('keeps missing routes unavailable instead of zero', () => {
    const r = parseMatrix([{ destinationIndex: 0, condition: 'ROUTE_NOT_FOUND' }], 2);
    expect(r).toEqual([null, null]);
  });
  it('parses duration strings', () => { expect(durationMinutes('90s')).toBe(2); expect(durationMinutes(undefined)).toBeNull(); });
});
