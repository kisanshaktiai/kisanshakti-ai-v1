import { describe, expect, it } from 'vitest';
import { matchesScope, pricePage } from '../../../supabase/functions/market-price-intelligence/commodityScope';

describe('source-code market separation', () => {
  it.each([['बोकड', '09017'], ['शेळ्या', '09015'], ['बैल', '09002']])('%s belongs only to livestock', (_, code) => {
    expect(matchesScope(code, 'livestock')).toBe(true);
    expect(matchesScope(code, 'produce')).toBe(false);
  });
  it('does not classify all 09-prefixed products as animals: ghee 09016 stays in produce', () => {
    expect(matchesScope('09016', 'produce')).toBe(true);
    expect(matchesScope('09016', 'livestock')).toBe(false);
  });
  it('retains unclassified agricultural products', () => {
    expect(matchesScope(null, 'produce')).toBe(true);
    expect(matchesScope(null, 'livestock')).toBe(false);
  });
  it('makes every ranked price reachable instead of dropping rows beyond 150', () => {
    const rows = Array.from({ length: 341 }, (_, i) => i);
    const pages = [0, 150, 300].map(offset => pricePage(rows, offset, 150));
    expect(pages.flatMap(p => p.data)).toEqual(rows);
    expect(pages[0].hasMore).toBe(true);
    expect(pages[2].hasMore).toBe(false);
    expect(pages[2].totalRecords).toBe(341);
  });
});