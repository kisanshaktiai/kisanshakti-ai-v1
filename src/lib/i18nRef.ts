/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REFERENCE-TABLE i18n RESOLVER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centralized helper that picks the right localized column from any reference
 * row (soil_types, water_sources, irrigation_types, crop_groups, crops,
 * districts, states, talukas, villages, …) based on the farmer's selected
 * language.
 *
 * Convention in the DB: a base column (`label` | `name` | `group_name`) is
 * accompanied by `{base}_<lang>` siblings for every supported language.
 * Falls back to the base column when a translation is missing — never
 * blank-screens the UI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';

export const SUPPORTED_REF_LANGS = [
  'hi', 'mr', 'pa', 'ta', 'te', 'bn', 'gu', 'kn', 'ml', 'or', 'as', 'ur', 'sa',
] as const;

export type RefBaseField = 'label' | 'name' | 'group_name' | 'description';

/** Normalize a language code (drop region suffix, lowercase). */
export function normalizeLang(lang: string | undefined | null): string {
  return (lang || 'en').toLowerCase().split('-')[0];
}

/**
 * Pick the localized value for a reference row.
 * - row[`${base}_<lang>`] when present
 * - else row[base]
 * - else ''
 */
export function pickLocalized<T extends Record<string, any>>(
  row: T | null | undefined,
  base: RefBaseField,
  lang: string,
): string {
  if (!row) return '';
  const code = normalizeLang(lang);
  const localized = row[`${base}_${code}`];
  if (localized && typeof localized === 'string' && localized.trim()) return localized;
  const fallback = row[base];
  return typeof fallback === 'string' ? fallback : '';
}

/**
 * React hook returning a memoized resolver bound to the current i18n language.
 * Use in components: `const tRef = useLocalizedRef(); tRef(crop, 'label')`.
 */
export function useLocalizedRef() {
  const { i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  return useCallback(
    <T extends Record<string, any>>(row: T | null | undefined, base: RefBaseField = 'label') =>
      pickLocalized(row, base, lang),
    [lang],
  );
}

/**
 * Build the comma-separated column list for a `.select()` call that grabs the
 * base column plus every supported language sibling.
 *
 * Example: `cols('label')` → `"label,label_hi,label_mr,label_pa,…"`
 */
export function cols(base: RefBaseField, ...extras: string[]): string {
  const langCols = SUPPORTED_REF_LANGS.map((l) => `${base}_${l}`);
  return [base, ...langCols, ...extras].join(',');
}

/**
 * Type-safe enricher: returns a new array with `displayLabel` /
 * `displayDescription` resolved against the current language.
 */
export function enrichRefRows<T extends Record<string, any>>(
  rows: T[] | null | undefined,
  lang: string,
  baseLabel: RefBaseField = 'label',
): Array<T & { displayLabel: string; displayDescription: string }> {
  if (!rows) return [];
  return rows.map((row) => ({
    ...row,
    displayLabel: pickLocalized(row, baseLabel, lang),
    displayDescription: pickLocalized(row, 'description', lang),
  }));
}
