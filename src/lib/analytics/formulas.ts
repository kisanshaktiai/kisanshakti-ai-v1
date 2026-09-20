/**
 * Agronomic formula constants & helpers.
 *
 * Values reflect commonly-used Indian agronomy references (CACP Cost of
 * Cultivation Studies, ICAR field bulletins, state DoA package-of-practices).
 * They are applied to REAL per-land data (NDVI, soil, weather, schedules,
 * market_prices) — never used as final values, only as projection baselines
 * with an explicit disclaimer in the UI.
 */

export const ACRE_TO_HA = 0.404686;
export const HA_TO_ACRE = 1 / ACRE_TO_HA;
export const QUINTAL_TO_KG = 100;

export function nutrientLevel(
  value: number | null | undefined,
  minimum: number | null | undefined,
  maximum: number | null | undefined,
): 'low' | 'medium' | 'high' | 'unknown' {
  if (value == null || minimum == null || maximum == null || Number.isNaN(value)) return 'unknown';
  if (value < minimum) return 'low';
  if (value > maximum) return 'high';
  return 'medium';
}

export function formatINR(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
}
