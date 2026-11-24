import i18n from '@/i18n/config';
import type { PricingUnit, ProviderService } from '@/services/providerWorkspaceService';

/**
 * Text helpers of the Provider Workspace. Every word shown comes from the
 * provider bundle by key; dates, numbers, money, weekday and month names come
 * from Intl in the language the person chose. Nothing here holds a word of
 * any language.
 */

export type CatalogueKind =
  | 'category' | 'unit' | 'equipmentType' | 'attribute' | 'providerType'
  | 'skillTier' | 'nurseryKind' | 'paymentMethod';

/**
 * Label of a catalogue code. A code that has no translation yet (a row added
 * to the lookup table later) shows the label stored with the row.
 */
export function catalogueLabel(kind: CatalogueKind, code: string | null | undefined, fallback?: string): string {
  if (!code) return '';
  return i18n.t(`provider.catalogue.${kind}.${code}`, { defaultValue: fallback || code });
}

/** Text for an error code raised by a provider function. */
export function providerErrorMessage(error: unknown): string {
  const raw = (error as { code?: unknown } | null | undefined)?.code;
  const code = typeof raw === 'string' ? raw : '';
  const key = `provider.errors.${code}`;
  return code && i18n.exists(key) ? i18n.t(key) : i18n.t('provider.errors.generic');
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** "₹1,200 · Per acre", or the unit alone when the rate is open to discussion. */
export function serviceRateText(service: Pick<ProviderService, 'base_rate' | 'currency' | 'pricing_unit'>, units: PricingUnit[]): string {
  const unit = units.find((u) => u.code === service.pricing_unit);
  const unitLabel = catalogueLabel('unit', service.pricing_unit, unit?.label_en);
  if (service.base_rate == null) return unitLabel;
  return i18n.t('provider.services.rateWithUnit', {
    rate: formatMoney(Number(service.base_rate), service.currency),
    unit: unitLabel,
  });
}

/** A calendar date ("2026-12-03") or an instant, shown as a day in the chosen language. */
export function formatDay(value: string | Date): string {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Weekday name; 0 = Sunday, as the server counts. */
export function weekdayName(weekday: number): string {
  // 4 January 1970 was a Sunday.
  return new Intl.DateTimeFormat(i18n.language, { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(1970, 0, 4 + weekday)));
}

/** Month name; 1 = January. */
export function monthName(month: number): string {
  return new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(1970, month - 1, 1)));
}

/** "HH:MM" from "HH:MM" or "HH:MM:SS". */
export function clockValue(value: string | null | undefined): string {
  return value ? value.slice(0, 5) : '';
}

/** A number typed into a form: empty text is "not given" (null). */
export function numberOrNull(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
