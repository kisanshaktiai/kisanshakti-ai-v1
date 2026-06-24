/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMUNICATION TRANSLATION DICTIONARY v2.0 — DB-DRIVEN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * REFACTORED: All hardcoded Marathi/Hindi/English dictionaries REMOVED.
 * Translation now flows from:
 *   1. observation_translations DB table (via i18n cache)
 *   2. English fallback (formatted code)
 *   3. LLM narration layer translates at runtime
 * 
 * This file retains the same exported function signatures for backward
 * compatibility but resolves translations from the centralized i18n cache.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  getTranslation,
  normalizeI18nKey,
} from '../i18n/translation-loader.ts';

// Language-agnostic type - accepts any language code
export type SupportedLanguage = string;
export type TrilingualText = Record<string, string>;

// ═══════════════════════════════════════════════════════════════════════════
// CORE RESOLUTION: DB-first, English fallback
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve a symbolic code to a farmer-friendly label via DB cache.
 * Fallback chain: DB translation → English formatted code
 */
function resolveFromDB(code: string, lang: SupportedLanguage): string {
  if (!code) return '';
  const normalized = normalizeI18nKey(code);
  return getTranslation(normalized, lang);
}

/**
 * Format a code for human display when no translation exists
 */
function formatCodeForDisplay(code: string): string {
  return code
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Same signatures, DB-driven implementation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Translate any text using DB cache
 */
export function translateText(
  key: string,
  _dictionary: Record<string, TrilingualText>,
  lang: SupportedLanguage
): string {
  // Dictionary param kept for backward compat but ignored — DB is SSOT
  return resolveFromDB(key, lang);
}

/**
 * Get product name with local translation
 */
export function getProductName(
  productName: string,
  lang: SupportedLanguage
): string {
  const dbResult = resolveFromDB(productName, lang);
  // If DB returned the formatted code (no real translation), return original
  if (dbResult === formatCodeForDisplay(normalizeI18nKey(productName))) {
    return productName; // Keep original product name
  }
  return dbResult;
}

/**
 * Get cause translation with fallback
 */
export function getCauseTranslation(
  causeCode: string,
  lang: SupportedLanguage
): string {
  return resolveFromDB(causeCode, lang);
}

/**
 * Get action translation with fallback
 */
export function getActionTranslation(
  actionType: string,
  lang: SupportedLanguage
): string {
  return resolveFromDB(actionType, lang);
}

/**
 * Get method translation
 */
export function getMethodTranslation(
  method: string,
  lang: SupportedLanguage
): string {
  return resolveFromDB(method, lang);
}

/**
 * Get urgency translation
 */
export function getUrgencyTranslation(
  urgency: string,
  lang: SupportedLanguage
): string {
  return resolveFromDB(urgency, lang);
}

/**
 * Get safety gear translation
 */
export function getSafetyGearTranslation(
  gear: string,
  lang: SupportedLanguage
): string {
  return resolveFromDB(gear, lang);
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGLISH LEAKAGE DETECTION — Script-aware
// ═══════════════════════════════════════════════════════════════════════════

const SCRIPT_RANGES: Record<string, RegExp> = {
  mr: /[\u0900-\u097F]/, hi: /[\u0900-\u097F]/,
  ta: /[\u0B80-\u0BFF]/, te: /[\u0C00-\u0C7F]/, kn: /[\u0C80-\u0CFF]/,
  ml: /[\u0D00-\u0D7F]/, bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/,
  pa: /[\u0A00-\u0A7F]/, or: /[\u0B00-\u0B7F]/,
};

/**
 * Check if response contains significant untranslated English text
 */
export function hasUntranslatedEnglish(text: string, lang: SupportedLanguage): boolean {
  if (lang === 'en') return false;
  
  const cleanText = text
    .replace(/\d+(\.\d+)?%?/g, '')
    .replace(/\b[A-Z]{2,}\b/g, '')
    .replace(/₹[\d,]+/g, '')
    .replace(/\b(SC|SL|WP|WG|EC|SG|SP|G)\b/gi, '');
  
  const scriptRegex = SCRIPT_RANGES[lang];
  const scriptChars = scriptRegex
    ? (cleanText.match(new RegExp(scriptRegex.source, 'g')) || []).length
    : 0;
  const asciiAlphaChars = (cleanText.match(/[a-zA-Z]/g) || []).length;
  
  const total = scriptChars + asciiAlphaChars;
  if (total < 20) return false;
  
  const englishRatio = asciiAlphaChars / total;
  return englishRatio > 0.3;
}

/**
 * Post-process response to fix English leakage
 * Delegates to LLM narration layer — no hardcoded replacements
 */
export function ensureFullTranslation(
  text: string,
  lang: SupportedLanguage
): string {
  // No-op: LLM narration layer handles full translation at runtime.
  // This function is kept for backward compatibility only.
  return text;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED CONSTANTS — Empty, retained for import compatibility
// These were previously 963 lines of hardcoded mr/hi/en dictionaries.
// All translations now come from observation_translations DB table.
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use resolveFromDB() - translations come from observation_translations table */
export const CAUSE_TRANSLATIONS: Record<string, TrilingualText> = {};
/** @deprecated Use resolveFromDB() */
export const ACTION_TRANSLATIONS: Record<string, TrilingualText> = {};
/** @deprecated Use resolveFromDB() */
export const PRODUCT_TRANSLATIONS: Record<string, TrilingualText> = {};
/** @deprecated Use resolveFromDB() */
export const METHOD_TRANSLATIONS: Record<string, TrilingualText> = {};
/** @deprecated Use resolveFromDB() */
export const URGENCY_TRANSLATIONS: Record<string, TrilingualText> = {};
/** @deprecated Use resolveFromDB() */
export const SAFETY_GEAR_TRANSLATIONS: Record<string, TrilingualText> = {};
