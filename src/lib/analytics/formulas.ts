/** Display and classification helpers. Agronomic limits are supplied by DB rows. */

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

export function formatINR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);
}
