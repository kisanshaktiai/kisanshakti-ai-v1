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
 * - Translations loaded from database at runtime
 * - Fallback chain: i18n_key → action_text → response_en → key itself
 * - Caching for performance
 * 
 * REPLACES:
 * - Hardcoded PEST_TRANSLATIONS in llm-response-formatter.ts
 * - Hardcoded DISEASE_TRANSLATIONS in llm-response-formatter.ts
 * - Hardcoded CAUSE_TRANSLATIONS in diagnosis-first-generator.ts
 * - All other inline translation dictionaries
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const I18N_LOADER_VERSION = '1.0.0';

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
// FALLBACK TRANSLATIONS (Critical terms that must always be available)
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_TRANSLATIONS: Record<string, Translation> = {
  // Pests - English is mandatory, mr/hi kept as known fallbacks
  'SHOOT_BORER': { key: 'SHOOT_BORER', en: 'Shoot Borer', mr: 'अंकुर बेधक (खोड किडा)', hi: 'अंकुर बेधक (तना छेदक)', category: 'pest' },
  'STEM_BORER': { key: 'STEM_BORER', en: 'Stem Borer', mr: 'खोड किडा', hi: 'तना छेदक', category: 'pest' },
  'TOP_BORER': { key: 'TOP_BORER', en: 'Top Borer', mr: 'शेंडा बेधक', hi: 'शीर्ष बेधक', category: 'pest' },
  'INTERNODE_BORER': { key: 'INTERNODE_BORER', en: 'Internode Borer', mr: 'कांडी बेधक', hi: 'गांठ बेधक', category: 'pest' },
  'ROOT_BORER': { key: 'ROOT_BORER', en: 'Root Borer', mr: 'मूळ बेधक', hi: 'जड़ बेधक', category: 'pest' },
  'EARLY_SHOOT_BORER': { key: 'EARLY_SHOOT_BORER', en: 'Early Shoot Borer', mr: 'लवकर खोड किडा', hi: 'शुरुआती तना छेदक', category: 'pest' },
  'TERMITE': { key: 'TERMITE', en: 'Termite', mr: 'वाळवी (उधई)', hi: 'दीमक', category: 'pest' },
  'WHITE_GRUB': { key: 'WHITE_GRUB', en: 'White Grub', mr: 'पांढरी अळी', hi: 'सफेद गिडार', category: 'pest' },
  'APHID': { key: 'APHID', en: 'Aphid', mr: 'मावा', hi: 'माहूं', category: 'pest' },
  'WHITEFLY': { key: 'WHITEFLY', en: 'Whitefly', mr: 'पांढरी माशी', hi: 'सफेद मक्खी', category: 'pest' },
  'THRIPS': { key: 'THRIPS', en: 'Thrips', mr: 'तुडतुडे', hi: 'थ्रिप्स', category: 'pest' },
  'MEALYBUG': { key: 'MEALYBUG', en: 'Mealybug', mr: 'पिठ्या ढेकूण', hi: 'मिलीबग', category: 'pest' },
  'PYRILLA': { key: 'PYRILLA', en: 'Pyrilla (Leaf Hopper)', mr: 'पायरिला (तुडतुडा)', hi: 'पायरिला', category: 'pest' },
  'WOOLLY_APHID': { key: 'WOOLLY_APHID', en: 'Woolly Aphid', mr: 'लोकरी मावा', hi: 'ऊनी माहूं', category: 'pest' },
  'SCALE_INSECT': { key: 'SCALE_INSECT', en: 'Scale Insect', mr: 'खवले किडा', hi: 'स्केल कीट', category: 'pest' },
  'BOLLWORM': { key: 'BOLLWORM', en: 'Bollworm', mr: 'बोंड अळी', hi: 'बॉलवर्म', category: 'pest' },
  'JASSID': { key: 'JASSID', en: 'Jassid', mr: 'तुडतुडा', hi: 'जैसिड', category: 'pest' },
  
  // Diseases
  'RED_ROT': { key: 'RED_ROT', en: 'Red Rot', mr: 'तांबडा कूज (रेड रॉट)', hi: 'लाल सड़न', category: 'disease' },
  'SMUT': { key: 'SMUT', en: 'Smut (Whip Smut)', mr: 'काणी (स्मट)', hi: 'कंडुआ', category: 'disease' },
  'WILT': { key: 'WILT', en: 'Wilt', mr: 'मर रोग', hi: 'उकठा', category: 'disease' },
  'RUST': { key: 'RUST', en: 'Rust', mr: 'तांबेरा', hi: 'रतुआ', category: 'disease' },
  'BLAST': { key: 'BLAST', en: 'Blast', mr: 'करपा', hi: 'ब्लास्ट', category: 'disease' },
  'BLIGHT': { key: 'BLIGHT', en: 'Blight', mr: 'करपा', hi: 'झुलसा', category: 'disease' },
  'LEAF_SPOT': { key: 'LEAF_SPOT', en: 'Leaf Spot', mr: 'पान ठिपके', hi: 'पत्ती धब्बा', category: 'disease' },
  'LEAF_SCALD': { key: 'LEAF_SCALD', en: 'Leaf Scald', mr: 'पान भाजणे', hi: 'पत्ती झुलसा', category: 'disease' },
  'GRASSY_SHOOT': { key: 'GRASSY_SHOOT', en: 'Grassy Shoot Disease', mr: 'गवती फुटवे', hi: 'घासी शूट', category: 'disease' },
  'RATOON_STUNTING': { key: 'RATOON_STUNTING', en: 'Ratoon Stunting Disease', mr: 'खोडवा खुंटणे', hi: 'रेटून स्टंटिंग', category: 'disease' },
  'POWDERY_MILDEW': { key: 'POWDERY_MILDEW', en: 'Powdery Mildew', mr: 'भुरी', hi: 'चूर्णिल आसिता', category: 'disease' },
  'DOWNY_MILDEW': { key: 'DOWNY_MILDEW', en: 'Downy Mildew', mr: 'केवडा', hi: 'मृदुरोमिल आसिता', category: 'disease' },
  
  // Symptoms
  'DEAD_HEART': { key: 'DEAD_HEART', en: 'Dead Heart', mr: 'मेलेला गाभा (डेड हार्ट)', hi: 'मृत गभा', category: 'symptom' },
  'YELLOWING': { key: 'YELLOWING', en: 'Yellowing', mr: 'पानं पिवळी पडणे', hi: 'पत्तियां पीली पड़ना', category: 'symptom' },
  'WILTING': { key: 'WILTING', en: 'Wilting', mr: 'सुकणे / मलूल होणे', hi: 'मुरझाना', category: 'symptom' },
  'STUNTED_GROWTH': { key: 'STUNTED_GROWTH', en: 'Stunted Growth', mr: 'वाढ खुंटणे', hi: 'बौनापन', category: 'symptom' },
  'DRYING': { key: 'DRYING', en: 'Drying', mr: 'वाळणे', hi: 'सूखना', category: 'symptom' },
  
  // Actions
  'MONITOR': { key: 'MONITOR', en: 'Monitor', mr: 'निरीक्षण करा', hi: 'निगरानी करें', category: 'action' },
  'SPRAY': { key: 'SPRAY', en: 'Spray', mr: 'फवारणी करा', hi: 'स्प्रे करें', category: 'action' },
  'APPLY': { key: 'APPLY', en: 'Apply', mr: 'वापरा', hi: 'लगाएं', category: 'action' },
  'REMOVE': { key: 'REMOVE', en: 'Remove', mr: 'काढून टाका', hi: 'हटाएं', category: 'action' },
  'IRRIGATE': { key: 'IRRIGATE', en: 'Irrigate', mr: 'पाणी द्या', hi: 'सिंचाई करें', category: 'action' }
};

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
 * 1. Cached database translation
 * 2. Fallback translations
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
  
  // Check cache first
  if (translationCache?.translations.has(normalizedKey)) {
    const translation = translationCache.translations.get(normalizedKey)!;
    const value = translation[language];
    // CRITICAL FIX: Don't return English placeholder text for non-English languages
    // The cache stores English action_text as placeholder for mr/hi - detect and skip
    if (value && language === 'en') {
      return value;
    }
    if (value && language !== 'en' && value !== translation.en) {
      // Genuine translation exists (different from English) - use it
      return value;
    }
    // For non-English where value equals English (placeholder), fall through to fallbacks
  }
  
  // Check fallback translations
  if (FALLBACK_TRANSLATIONS[normalizedKey]) {
    const translation = FALLBACK_TRANSLATIONS[normalizedKey];
    const value = translation[language];
    // For non-English: only return if we have a genuine translation (not English)
    if (value && (language === 'en' || value !== translation.en)) {
      return value;
    }
    // If non-English and value equals English (no real translation), return raw code
    if (language !== 'en') {
      return normalizedKey.replace(/_/g, ' ');
    }
    return translation.en || normalizedKey;
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
  
  if (FALLBACK_TRANSLATIONS[normalizedKey]) {
    return FALLBACK_TRANSLATIONS[normalizedKey];
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
 * Called once at startup or when cache expires
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
    // Load translations from decision_rules i18n_key + action_text fields
    // NOTE: response_mr/hi/en columns were DROPPED per SSOT architecture
    const { data, error } = await supabaseClient
      .from('decision_rules')
      .select('i18n_key, action_text, reason_text, cause, category')
      .not('i18n_key', 'is', null)
      .limit(2000);
    
    if (error) {
      console.warn('⚠️ [I18N] Failed to load translations:', error.message);
      return;
    }
    
    const translations = new Map<string, Translation>();
    
    // Add database translations - using action_text as source for all languages
    // LLM narration layer handles actual translation
    for (const row of data || []) {
      if (row.i18n_key) {
        const key = normalizeI18nKey(row.i18n_key);
        const text = row.action_text || row.reason_text || row.cause || '';
        translations.set(key, {
          key,
          mr: text,  // Placeholder - LLM translates at runtime
          hi: text,  // Placeholder - LLM translates at runtime
          en: text,  // Base English text
          category: row.category
        });
      }
    }
    
    // Add fallbacks
    for (const [key, translation] of Object.entries(FALLBACK_TRANSLATIONS)) {
      if (!translations.has(key)) {
        translations.set(key, translation);
      }
    }
    
    translationCache = {
      translations,
      loaded_at: now,
      version: I18N_LOADER_VERSION
    };
    
    console.log(`✅ [I18N] Loaded ${translations.size} translations`);
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
