import i18n from '@/i18n/config';
import type { FarmServicesError, RequestCounts } from '@/services/farmServicesService';
import { localName, type LocalNames } from '@/services/providerWorkspaceService';
import { catalogueLabel, formatMoney } from '@/lib/providerText';

/** Text for an error code raised by a "services near me" function. */
export function farmServicesErrorMessage(error: unknown): string {
  const code = (error as Partial<FarmServicesError> | null | undefined)?.code;
  const key = `farmServices.errors.${code ?? ''}`;
  return code && i18n.exists(key) ? i18n.t(key) : i18n.t('farmServices.errors.generic');
}

/** "4.5 km" in the chosen language. */
export function distanceText(km: number): string {
  return i18n.t('farmServices.distance', { km: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(km) });
}

const pad = (n: number) => String(n).padStart(2, '0');
/** The device's own calendar day, n days from today, as "YYYY-MM-DD". */
export function dayValue(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A number as people read it ("1,200", "2.5"). */
export function plainNumber(value: number): string {
  return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value);
}

/** "₹1,100 · Per hour", or the unit alone when no rate is set. */
export function rateText(rate: number | null | undefined, unit: string | null | undefined, currency: string): string {
  const unitLabel = unit ? catalogueLabel('unit', unit) : '';
  if (rate == null) return unitLabel || i18n.t('farmServices.rateOnAsk');
  return unitLabel ? i18n.t('provider.services.rateWithUnit', { rate: formatMoney(Number(rate), currency), unit: unitLabel }) : formatMoney(Number(rate), currency);
}

/**
 * Rough cost of a request, only when the amount asked and the rate are in the
 * same unit. Null when it cannot be worked out honestly.
 */
export function estimateText(quantity: number, quantityUnit: string, rate: number | null | undefined, rateUnit: string | null | undefined, currency: string): string | null {
  if (rate == null || !rateUnit || rateUnit !== quantityUnit || !(quantity > 0)) return null;
  return formatMoney(Math.round(quantity * Number(rate)), currency);
}

/**
 * "2.5 acres", "200 plants": the amount asked, said the way people say it.
 * A unit with no wording of its own shows the number beside the unit's label;
 * a unit that is settled by talking shows nothing.
 */
export function amountText(quantity: number, unit: string, negotiable = false): string {
  if (negotiable) return '';
  const key = `farmServices.amount.${unit}`;
  const n = plainNumber(Number(quantity));
  return i18n.exists(`${key}_other`) ? i18n.t(key, { count: Number(quantity), n }) : `${n} · ${catalogueLabel('unit', unit)}`;
}

/** The variety as the reader should see it: the master's name in his language, else the nursery's own name. */
export function plantVarietyText(
  varietyNames: Record<string, string | null> | null | undefined, ownName: string | null | undefined, language: string,
): string {
  if (varietyNames) {
    const names: LocalNames = {};
    for (const [key, value] of Object.entries(varietyNames)) if (value) names[key === 'en' ? 'default' : key] = value;
    const text = localName(names, language);
    if (text) return text;
  }
  return ownName ?? '';
}

/** The number to dial, kept to the characters a phone link allows. */
export function phoneLink(mobile: string): string {
  return `tel:${mobile.replace(/[^0-9+]/g, '')}`;
}

/** One line about the farmer's requests: what waits for him first, then what is booked or sent. */
export function requestsSummary(counts: RequestCounts | null | undefined): string {
  if (!counts) return i18n.t('farmServices.requests.summaryNone');
  const parts = [
    counts.offers_waiting > 0 ? i18n.t('farmServices.requests.summaryAnswers', { count: counts.offers_waiting }) : null,
    counts.booked > 0 ? i18n.t('farmServices.requests.summaryBooked', { count: counts.booked }) : null,
    counts.open > 0 ? i18n.t('farmServices.requests.summaryOpen', { count: counts.open }) : null,
    counts.to_rate > 0 ? i18n.t('farmServices.requests.summaryToRate', { count: counts.to_rate }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : i18n.t('farmServices.requests.summaryNone');
}
