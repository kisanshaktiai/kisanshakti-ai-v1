/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 4: CENTRALIZED I18N TRANSLATION LOADER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Provides a centralized, database-driven translation system using i18n_key
 * as the single anchor for all multilingual content.
 * 
 * ARCHITECTURE:
 * - i18n_key is the only multilingual anchor
 * - Translations loaded from database (observation_translations) at runtime
 * - Fallback chain: DB translation → action_text (English) → key itself
 * - Caching for performance
 * - NO hardcoded multilingual dictionaries (SSOT compliant)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const I18N_LOADER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface Translation {
  key: string;
  [language: string]: string | undefined;  // Any language code → translated text
  category?: string;
}

export interface TranslationCache {
  translations: Map<string, Translation>;
  loaded_at: number;
  version: string;
}

// Language-agnostic: accepts any language code
export type SupportedLanguage = string;

// ═══════════════════════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════════════════════

let translationCache: TranslationCache | null = null;
const CACHE_TTL = 3600000; // 1 hour

// ═══════════════════════════════════════════════════════════════════════════
// CORE TRANSLATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get translation for a given i18n_key
 * 
 * Fallback chain:
 * 1. Cached database translation (from observation_translations)
 * 2. English action_text from decision_rules cache
 * 3. Key itself (formatted for display)
 * 
 * @param i18nKey - The translation key
 * @param language - Target language (mr, hi, en)
 * @returns Translated string
 */
export function getTranslation(
  i18nKey: string | null | undefined,
  language: SupportedLanguage
): string {
  if (!i18nKey) {
    return '';
  }
  
  // Normalize key
  const normalizedKey = normalizeI18nKey(i18nKey);
  
  // Check cache
  if (translationCache?.translations.has(normalizedKey)) {
    const translation = translationCache.translations.get(normalizedKey)!;
    const value = translation[language];
    
    // For English, return directly
    if (value && language === 'en') {
      return value;
    }
    // For non-English: only return if genuinely different from English (real translation)
    if (value && language !== 'en' && value !== translation.en) {
      return value;
    }
    // Fall through - no genuine translation available
  }
  
  // Format key for display - language-aware to prevent English leakage
  return formatKeyForDisplay(normalizedKey, language);
}

/**
 * Get full translation object for a key
 */
export function getTranslationObject(i18nKey: string): Translation | null {
  const normalizedKey = normalizeI18nKey(i18nKey);
  
  if (translationCache?.translations.has(normalizedKey)) {
    return translationCache.translations.get(normalizedKey)!;
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEY NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize i18n_key to consistent format
 * - Converts to uppercase
 * - Replaces spaces and hyphens with underscores
 * - Removes parenthetical scientific names
 */
export function normalizeI18nKey(key: string): string {
  if (!key) return '';
  
  return key
    .toUpperCase()
    .replace(/\([^)]*\)/g, '')  // Remove (scientific names)
    .replace(/[\s-]+/g, '_')     // Spaces/hyphens to underscores
    .replace(/_+/g, '_')         // Remove duplicate underscores
    .replace(/^_|_$/g, '')       // Trim leading/trailing underscores
    .trim();
}

/**
 * Format key for human-readable display.
 * For English: SHOOT_BORER → Shoot Borer
 * For non-English: return raw code to avoid English leakage in regional UI
 */
function formatKeyForDisplay(key: string, language?: string): string {
  // If language is specified and not English, return raw code (avoid English title-case)
  if (language && language !== 'en') {
    return key.replace(/_/g, ' ');
  }
  return key
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH TRANSLATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get translations for multiple keys at once
 */
export function getTranslations(
  keys: string[],
  language: SupportedLanguage
): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const key of keys) {
    result[key] = getTranslation(key, language);
  }
  
  return result;
}

/**
 * Translate a cause string (handles complex formats)
 */
export function translateCause(
  cause: string,
  language: SupportedLanguage
): string {
  if (!cause) return '';
  
  // Try direct translation first
  const direct = getTranslation(cause, language);
  if (direct !== formatKeyForDisplay(normalizeI18nKey(cause))) {
    return direct;
  }
  
  // Handle compound causes like "EARLY_SHOOT_BORER_INFESTATION"
  const simplifiedCause = cause
    .replace(/_(INFESTATION|ATTACK|DAMAGE|SUSPECT)$/i, '')
    .replace(/_?(germination|tillering|vegetative|grand_growth|maturity)$/i, '');
  
  return getTranslation(simplifiedCause, language);
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize translation cache from database
 * Loads from TWO sources:
 * 1. observation_translations → genuine multilingual labels (SSOT)
 * 2. decision_rules i18n_key → English action_text only (LLM translates at runtime)
 */
export async function initializeTranslationCache(
  supabaseClient: any
): Promise<void> {
  const now = Date.now();
  
  // Check if cache is still valid
  if (translationCache && now < translationCache.loaded_at + CACHE_TTL) {
    return;
  }
  
  try {
    const translations = new Map<string, Translation>();
    
    // ═══════════════════════════════════════════════════════════════════
    // SOURCE 1: observation_translations (genuine multilingual labels)
    // This is the SSOT for pest/disease/symptom/action display names
    // ═══════════════════════════════════════════════════════════════════
    const { data: obsTranslations, error: obsError } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, language_code, display_text, description_text')
      .limit(10000); // 2026-06-17: bumped from 5000 — table currently has 5145 rows, was silently truncating
    
    if (obsError) {
      console.warn('⚠️ [I18N] Failed to load observation_translations:', obsError.message);
    } else if (obsTranslations) {
      // Group by observation_code and build Translation objects
      const grouped = new Map<string, Translation>();
      for (const row of obsTranslations) {
        const code = (row.observation_code || '').toUpperCase();
        if (!code) continue;
        
        if (!grouped.has(code)) {
          grouped.set(code, { key: code });
        }
        const entry = grouped.get(code)!;
        const lang = (row.language_code || 'en').toLowerCase();
        // Prefer description_text (farmer-friendly) over display_text (technical)
        const hasGoodDescription = row.description_text && 
          row.description_text.length > 10 && 
          row.description_text.length > (row.display_text?.length || 0);
        entry[lang] = hasGoodDescription ? row.description_text : row.display_text;
      }
      
      // Merge into main translations map
      for (const [code, translation] of grouped) {
        translations.set(code, translation);
      }
      console.log(`   ✅ [I18N] Loaded ${grouped.size} observation translations from DB`);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // SOURCE 2: decision_rules i18n_key → English action_text ONLY
    // LLM narration layer handles translation at runtime
    // ═══════════════════════════════════════════════════════════════════
    const { data: ruleData, error: ruleError } = await supabaseClient
      .from('decision_rules')
      .select('i18n_key, action_text, reason_text, cause, category')
      .not('i18n_key', 'is', null)
      .limit(2000);
    
    if (ruleError) {
      console.warn('⚠️ [I18N] Failed to load decision_rules:', ruleError.message);
    } else {
      let ruleCount = 0;
      for (const row of ruleData || []) {
        if (row.i18n_key) {
          const key = normalizeI18nKey(row.i18n_key);
          const text = row.action_text || row.reason_text || row.cause || '';
          // Store ONLY English text for rule-level content
          // mr/hi translation happens via LLM narration layer at runtime
          if (!translations.has(key)) {
            translations.set(key, {
              key,
              en: text,  // English only - LLM translates at runtime
              category: row.category
            });
            ruleCount++;
          }
        }
      }
      console.log(`   ✅ [I18N] Loaded ${ruleCount} rule i18n_keys (English only)`);
    }
    
    translationCache = {
      translations,
      loaded_at: now,
      version: I18N_LOADER_VERSION
    };
    
    console.log(`✅ [I18N v${I18N_LOADER_VERSION}] Total cache: ${translations.size} entries`);
  } catch (e) {
    console.error('❌ [I18N] Cache initialization failed:', e);
  }
}

/**
 * Clear translation cache
 */
export function clearTranslationCache(): void {
  translationCache = null;
  console.log('🧹 [I18N] Cache cleared');
}

/**
 * Check if cache is initialized
 */
export function isCacheInitialized(): boolean {
  return translationCache !== null;
}

export default {
  I18N_LOADER_VERSION,
  getTranslation,
  getTranslationObject,
  getTranslations,
  translateCause,
  normalizeI18nKey,
  initializeTranslationCache,
  clearTranslationCache,
  isCacheInitialized
};
