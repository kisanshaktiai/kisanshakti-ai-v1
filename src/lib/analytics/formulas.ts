/**
 * Analytics formatters. No agronomy, no crop or currency tables live here:
 * every figure the page shows is computed server-side (v_land_economics,
 * land_farm_state, land_weather_state) and only formatted in the browser.
 */

/** Locale-aware number, e.g. 15.8 → "15.8" in the farmer's locale. */
export function formatNumber(value: number | null | undefined, digits = 0, locale?: string): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

/**
 * Money in the farmer's locale. `currencyCode` comes from the row being shown
 * (financial_transactions.currency, land_expense_estimate.currency_code); the
 * fallback is the database default for financial_transactions.currency.
 */
export const DEFAULT_CURRENCY_CODE = 'INR';

export function formatMoney(value: number | null | undefined, locale?: string, currencyCode: string = DEFAULT_CURRENCY_CODE): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value);
}

/** "9.6 – 13.0" style range; either end missing → "—". */
export function formatRange(low: number | null | undefined, high: number | null | undefined, digits = 1, locale?: string): string {
  if (low == null || high == null) return '—';
  return `${formatNumber(low, digits, locale)} – ${formatNumber(high, digits, locale)}`;
}
