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
  mr: string;
  hi: string;
  en: string;
  category?: string;
}

export interface TranslationCache {
  translations: Map<string, Translation>;
  loaded_at: number;
  version: string;
}

export type SupportedLanguage = 'mr' | 'hi' | 'en';

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK TRANSLATIONS (Critical terms that must always be available)
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_TRANSLATIONS: Record<string, Translation> = {
  // Pests
  'SHOOT_BORER': { key: 'SHOOT_BORER', mr: 'अंकुर बेधक (खोड किडा)', hi: 'अंकुर बेधक (तना छेदक)', en: 'Shoot Borer', category: 'pest' },
  'STEM_BORER': { key: 'STEM_BORER', mr: 'खोड किडा', hi: 'तना छेदक', en: 'Stem Borer', category: 'pest' },
  'TOP_BORER': { key: 'TOP_BORER', mr: 'शेंडा बेधक', hi: 'शीर्ष बेधक', en: 'Top Borer', category: 'pest' },
  'INTERNODE_BORER': { key: 'INTERNODE_BORER', mr: 'कांडी बेधक', hi: 'गांठ बेधक', en: 'Internode Borer', category: 'pest' },
  'ROOT_BORER': { key: 'ROOT_BORER', mr: 'मूळ बेधक', hi: 'जड़ बेधक', en: 'Root Borer', category: 'pest' },
  'EARLY_SHOOT_BORER': { key: 'EARLY_SHOOT_BORER', mr: 'लवकर खोड किडा', hi: 'शुरुआती तना छेदक', en: 'Early Shoot Borer', category: 'pest' },
  'TERMITE': { key: 'TERMITE', mr: 'वाळवी (उधई)', hi: 'दीमक', en: 'Termite', category: 'pest' },
  'WHITE_GRUB': { key: 'WHITE_GRUB', mr: 'पांढरी अळी', hi: 'सफेद गिडार', en: 'White Grub', category: 'pest' },
  'APHID': { key: 'APHID', mr: 'मावा', hi: 'माहूं', en: 'Aphid', category: 'pest' },
  'WHITEFLY': { key: 'WHITEFLY', mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly', category: 'pest' },
  'THRIPS': { key: 'THRIPS', mr: 'तुडतुडे', hi: 'थ्रिप्स', en: 'Thrips', category: 'pest' },
  'MEALYBUG': { key: 'MEALYBUG', mr: 'पिठ्या ढेकूण', hi: 'मिलीबग', en: 'Mealybug', category: 'pest' },
  'PYRILLA': { key: 'PYRILLA', mr: 'पायरिला (तुडतुडा)', hi: 'पायरिला', en: 'Pyrilla (Leaf Hopper)', category: 'pest' },
  'WOOLLY_APHID': { key: 'WOOLLY_APHID', mr: 'लोकरी मावा', hi: 'ऊनी माहूं', en: 'Woolly Aphid', category: 'pest' },
  'SCALE_INSECT': { key: 'SCALE_INSECT', mr: 'खवले किडा', hi: 'स्केल कीट', en: 'Scale Insect', category: 'pest' },
  'BOLLWORM': { key: 'BOLLWORM', mr: 'बोंड अळी', hi: 'बॉलवर्म', en: 'Bollworm', category: 'pest' },
  'JASSID': { key: 'JASSID', mr: 'तुडतुडा', hi: 'जैसिड', en: 'Jassid', category: 'pest' },
  
  // Diseases
  'RED_ROT': { key: 'RED_ROT', mr: 'तांबडा कूज (रेड रॉट)', hi: 'लाल सड़न', en: 'Red Rot', category: 'disease' },
  'SMUT': { key: 'SMUT', mr: 'काणी (स्मट)', hi: 'कंडुआ', en: 'Smut (Whip Smut)', category: 'disease' },
  'WILT': { key: 'WILT', mr: 'मर रोग', hi: 'उकठा', en: 'Wilt', category: 'disease' },
  'RUST': { key: 'RUST', mr: 'तांबेरा', hi: 'रतुआ', en: 'Rust', category: 'disease' },
  'BLAST': { key: 'BLAST', mr: 'करपा', hi: 'ब्लास्ट', en: 'Blast', category: 'disease' },
  'BLIGHT': { key: 'BLIGHT', mr: 'करपा', hi: 'झुलसा', en: 'Blight', category: 'disease' },
  'LEAF_SPOT': { key: 'LEAF_SPOT', mr: 'पान ठिपके', hi: 'पत्ती धब्बा', en: 'Leaf Spot', category: 'disease' },
  'LEAF_SCALD': { key: 'LEAF_SCALD', mr: 'पान भाजणे', hi: 'पत्ती झुलसा', en: 'Leaf Scald', category: 'disease' },
  'GRASSY_SHOOT': { key: 'GRASSY_SHOOT', mr: 'गवती फुटवे', hi: 'घासी शूट', en: 'Grassy Shoot Disease', category: 'disease' },
  'RATOON_STUNTING': { key: 'RATOON_STUNTING', mr: 'खोडवा खुंटणे', hi: 'रेटून स्टंटिंग', en: 'Ratoon Stunting Disease', category: 'disease' },
  'POWDERY_MILDEW': { key: 'POWDERY_MILDEW', mr: 'भुरी', hi: 'चूर्णिल आसिता', en: 'Powdery Mildew', category: 'disease' },
  'DOWNY_MILDEW': { key: 'DOWNY_MILDEW', mr: 'केवडा', hi: 'मृदुरोमिल आसिता', en: 'Downy Mildew', category: 'disease' },
  
  // Symptoms
  'DEAD_HEART': { key: 'DEAD_HEART', mr: 'मेलेला गाभा (डेड हार्ट)', hi: 'मृत गभा', en: 'Dead Heart', category: 'symptom' },
  'YELLOWING': { key: 'YELLOWING', mr: 'पानं पिवळी पडणे', hi: 'पत्तियां पीली पड़ना', en: 'Yellowing', category: 'symptom' },
  'WILTING': { key: 'WILTING', mr: 'सुकणे / मलूल होणे', hi: 'मुरझाना', en: 'Wilting', category: 'symptom' },
  'STUNTED_GROWTH': { key: 'STUNTED_GROWTH', mr: 'वाढ खुंटणे', hi: 'बौनापन', en: 'Stunted Growth', category: 'symptom' },
  'DRYING': { key: 'DRYING', mr: 'वाळणे', hi: 'सूखना', en: 'Drying', category: 'symptom' },
  
  // Actions
  'MONITOR': { key: 'MONITOR', mr: 'निरीक्षण करा', hi: 'निगरानी करें', en: 'Monitor', category: 'action' },
  'SPRAY': { key: 'SPRAY', mr: 'फवारणी करा', hi: 'स्प्रे करें', en: 'Spray', category: 'action' },
  'APPLY': { key: 'APPLY', mr: 'वापरा', hi: 'लगाएं', en: 'Apply', category: 'action' },
  'REMOVE': { key: 'REMOVE', mr: 'काढून टाका', hi: 'हटाएं', en: 'Remove', category: 'action' },
  'IRRIGATE': { key: 'IRRIGATE', mr: 'पाणी द्या', hi: 'सिंचाई करें', en: 'Irrigate', category: 'action' }
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
    return translation[language] || translation.en || normalizedKey;
  }
  
  // Check fallback translations
  if (FALLBACK_TRANSLATIONS[normalizedKey]) {
    const translation = FALLBACK_TRANSLATIONS[normalizedKey];
    return translation[language] || translation.en || normalizedKey;
  }
  
  // Format key for display (SHOOT_BORER → Shoot Borer)
  return formatKeyForDisplay(normalizedKey);
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
 * Format key for human-readable display
 */
function formatKeyForDisplay(key: string): string {
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
    // Load translations from decision_rules i18n_key + response fields
    const { data, error } = await supabaseClient
      .from('decision_rules')
      .select('i18n_key, response_mr, response_hi, response_en, cause, category')
      .not('i18n_key', 'is', null)
      .limit(2000);
    
    if (error) {
      console.warn('⚠️ [I18N] Failed to load translations:', error.message);
      return;
    }
    
    const translations = new Map<string, Translation>();
    
    // Add database translations
    for (const row of data || []) {
      if (row.i18n_key) {
        const key = normalizeI18nKey(row.i18n_key);
        translations.set(key, {
          key,
          mr: row.response_mr || row.cause || '',
          hi: row.response_hi || row.cause || '',
          en: row.response_en || row.cause || '',
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
