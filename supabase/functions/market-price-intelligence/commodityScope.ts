// Source commodity identities verified against market_prices, 2026-11-11.
// Do not classify by translated names, the broad 'Other' category, or units.
export type MarketScope = 'produce' | 'livestock';
export const LIVESTOCK_CODES = ['09002', '09005', '09012', '09013', '09014', '09015', '09017', '09018', '09020'];

export function marketScope(value: unknown): MarketScope {
  return value === 'livestock' ? 'livestock' : 'produce';
}

export function matchesScope(code: string | null | undefined, scope: MarketScope): boolean {
  return LIVESTOCK_CODES.includes(code || '') === (scope === 'livestock');
}

// Null/unmapped commodity codes remain visible in produce, never silently dropped.
// deno-lint-ignore no-explicit-any
export function scopeQuery(query: any, scope: MarketScope): any {
  return scope === 'livestock'
    ? query.in('commodity_code', LIVESTOCK_CODES)
    : query.or(`commodity_code.is.null,commodity_code.not.in.(${LIVESTOCK_CODES.join(',')})`);
}

export function pricePage<T>(rows: T[], offset: number, limit: number) {
  return { data: rows.slice(offset, offset + limit), totalRecords: rows.length, hasMore: offset + limit < rows.length };
}