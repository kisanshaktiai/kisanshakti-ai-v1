/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHARED LANGUAGE TYPES - Language-Agnostic Architecture
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SSOT for all language-related types, script detection, and validation.
 * Replaces all hardcoded 'mr' | 'hi' | 'en' unions across the codebase.
 * Supports ANY language via open string type with known codes as hints.
 * 
 * @version 1.0.0
 */

export const LANGUAGE_TYPES_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// OPEN LANGUAGE TYPE - Accepts any language code
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Any BCP-47 language code. The system is language-agnostic.
 * Known codes are listed in KNOWN_LANGUAGES for reference only.
 */
export type SupportedLanguage = string;

/** Known language codes (not exhaustive - system accepts any) */
export const KNOWN_LANGUAGES = [
  'mr', 'hi', 'en', 'ta', 'te', 'bn', 'gu', 'kn', 'pa', 'ml', 'or'
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT RANGES - Unicode ranges for script detection
// ═══════════════════════════════════════════════════════════════════════════

export const SCRIPT_RANGES: Record<string, RegExp> = {
  mr: /[\u0900-\u097F]/,  // Devanagari
  hi: /[\u0900-\u097F]/,  // Devanagari
  ta: /[\u0B80-\u0BFF]/,  // Tamil
  te: /[\u0C00-\u0C7F]/,  // Telugu
  kn: /[\u0C80-\u0CFF]/,  // Kannada
  ml: /[\u0D00-\u0D7F]/,  // Malayalam
  bn: /[\u0980-\u09FF]/,  // Bengali
  gu: /[\u0A80-\u0AFF]/,  // Gujarati
  pa: /[\u0A00-\u0A7F]/,  // Gurmukhi
  or: /[\u0B00-\u0B7F]/,  // Odia
  ur: /[\u0600-\u06FF]/,  // Arabic (Urdu)
  en: /[a-zA-Z]/,          // Latin
};

// ═══════════════════════════════════════════════════════════════════════════
// SCRIPT DETECTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if text is translated into the target language's script.
 * Returns true if ≥30% of content characters match the expected script.
 * For unknown languages, returns true (assume valid).
 */
export function isTranslatedForLanguage(text: string, language: string): boolean {
  if (!text || text.trim().length === 0) return false;
  if (language === 'en') return /[a-zA-Z]/.test(text);
  
  const scriptRegex = SCRIPT_RANGES[language];
  if (!scriptRegex) return true; // Unknown script = assume valid (LLM handled it)
  
  // Strip numbers, punctuation, symbols, whitespace
  const chars = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (chars.length === 0) return false;
  
  const matchCount = (chars.match(new RegExp(scriptRegex.source, 'g')) || []).length;
  return matchCount / chars.length > 0.3;
}

/**
 * Check if text contains untranslated English for a non-English target.
 * Replaces the old Devanagari-only check.
 */
export function isUntranslatedText(text: string | undefined | null, language: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  if (language === 'en') return false;
  
  // Check if text matches expected script
  if (!isTranslatedForLanguage(t, language)) return true;
  
  // Check for common English-only patterns that indicate failed translation
  if (/\bcheck\s+for\b/i.test(t)) return true;
  
  return false;
}

/**
 * Get the expected script regex for a language.
 * Returns null for unknown languages.
 */
export function getExpectedScriptRange(language: string): RegExp | null {
  return SCRIPT_RANGES[language] || null;
}

/**
 * Fallback language (always English)
 */
export function getLanguageFallback(_language: string): string {
  return 'en';
}

/**
 * Check if language uses Devanagari script (mr, hi, sa, etc.)
 */
export function isDevanagariLanguage(language: string): boolean {
  return ['mr', 'hi', 'sa', 'ne', 'kok', 'mai', 'bho'].includes(language);
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTILINGUAL TEXT TYPE - Replaces { mr: string; hi: string; en: string }
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Language-agnostic text record. Only 'en' is mandatory.
 * Other languages resolved at runtime from DB or LLM.
 */
export type MultilingualText = Record<string, string>;

/**
 * Get text for a language from a multilingual record, with fallback to English.
 */
export function getTextForLanguage(
  texts: MultilingualText | undefined | null,
  language: string
): string {
  if (!texts) return '';
  return texts[language] || texts['en'] || Object.values(texts)[0] || '';
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE CONSISTENCY LABELS - Replaces 'MARATHI_ONLY' etc.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get a language consistency label from a language code.
 * Language-agnostic: works for any language code.
 */
export function getLanguageConsistencyLabel(language: string): string {
  return `${language.toUpperCase()}_ONLY`;
}

export default {
  LANGUAGE_TYPES_VERSION,
  KNOWN_LANGUAGES,
  SCRIPT_RANGES,
  isTranslatedForLanguage,
  isUntranslatedText,
  getExpectedScriptRange,
  getLanguageFallback,
  isDevanagariLanguage,
  getTextForLanguage,
  getLanguageConsistencyLabel,
};
