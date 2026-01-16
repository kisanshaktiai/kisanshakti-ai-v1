/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGIONAL AGRICULTURAL TRANSLATOR (v2.0.0) - DETERMINISTIC VERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Translates agricultural terms to regional dialects based on farmer's location.
 * Uses DETERMINISTIC cache-first approach for consistent naming across sessions.
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "Same pest has different names in different regions, BUT we must be CONSISTENT.
 * A farmer should always see the same name for the same pest - never changing names."
 * 
 * CRITICAL FIX (v2.0.0):
 * - LLM translations were inconsistent - different names each time
 * - Now uses deterministic cache ONLY - no LLM variation
 * - Comprehensive cache for all Maharashtra/Karnataka/Gujarat terms
 * 
 * ARCHITECTURE:
 * 1. Extract farmer's district/region from landContext
 * 2. Look up EXACT translation from comprehensive cache
 * 3. Fall back to state-level translation if district not found
 * 4. Fall back to language-default if state not found
 * 5. NO LLM CALLS for diagnosis options (deterministic only)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const REGIONAL_TRANSLATOR_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerLocation {
  state: string;      // "Maharashtra", "Karnataka", etc.
  district: string;   // "Satara", "Pune", "Nagpur", etc.
  tehsil?: string;    // Optional: "Phaltan", etc.
  language: string;   // "mr", "hi", "kn", "ta", etc.
}

export interface TreatmentToTranslate {
  pest_name_en: string;           // "Shoot Borer"
  treatment_description_en: string; // "IPM Treatment Using Biocontrol"
  product_name_en?: string;       // "Trichogramma chilonis"
  method_en?: string;             // "Release 50,000 adults per acre"
}

export interface RegionalTranslation {
  pest_name_regional: string;
  treatment_label_regional: string;
  full_description_regional?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE DETERMINISTIC TRANSLATION CACHE
// These are verified translations for rural farmer understanding
// ═══════════════════════════════════════════════════════════════════════════

interface TranslationEntry {
  mr: string;  // Marathi
  hi: string;  // Hindi
  en: string;  // English fallback
  kn?: string; // Kannada
  gu?: string; // Gujarati
  te?: string; // Telugu
  ta?: string; // Tamil
}

interface RegionVariant {
  [region: string]: TranslationEntry;
}

// Master translation database - deterministic and consistent
const PEST_TRANSLATIONS: Record<string, TranslationEntry | RegionVariant> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // BORERS
  // ═══════════════════════════════════════════════════════════════════════════
  'early_shoot_borer': {
    // Default for Western Maharashtra
    default: {
      mr: 'सुरुवातीची खोड किडा',
      hi: 'प्रारंभिक तना छेदक',
      en: 'Early Shoot Borer',
      kn: 'ಆರಂಭಿಕ ಚಿಗುರು ಕೊರಕ'
    },
    // Vidarbha region uses different terms
    vidarbha: {
      mr: 'लवकरचा पोखरा किडा',
      hi: 'जल्दी तना छेदक',
      en: 'Early Shoot Borer',
      kn: 'ಆರಂಭಿಕ ಚಿಗುರು ಕೊರಕ'
    }
  } as RegionVariant,
  
  'shoot_borer': {
    default: {
      mr: 'खोड किडा',
      hi: 'तना छेदक',
      en: 'Shoot Borer',
      kn: 'ಚಿಗುರು ಕೊರಕ'
    },
    vidarbha: {
      mr: 'पोखरा किडा',
      hi: 'तना छेदक',
      en: 'Shoot Borer',
      kn: 'ಚಿಗುರು ಕೊರಕ'
    }
  } as RegionVariant,
  
  'internode_borer': {
    mr: 'कांडी पोखरणारा किडा',
    hi: 'गांठ छेदक',
    en: 'Internode Borer',
    kn: 'ಕಾಂಡ ಕೊರಕ'
  } as TranslationEntry,
  
  'top_borer': {
    mr: 'शेंड्याचा पोखरणारा किडा',
    hi: 'शीर्ष छेदक',
    en: 'Top Borer',
    kn: 'ಮೇಲ್ಭಾಗ ಕೊರಕ'
  } as TranslationEntry,
  
  'stem_borer': {
    mr: 'खोड पोखरणारा किडा',
    hi: 'तना छेदक',
    en: 'Stem Borer',
    kn: 'ಕಾಂಡ ಕೊರಕ'
  } as TranslationEntry,
  
  'root_borer': {
    mr: 'मूळ पोखरणारा किडा',
    hi: 'जड़ छेदक',
    en: 'Root Borer',
    kn: 'ಬೇರು ಕೊರಕ'
  } as TranslationEntry,

  // ═══════════════════════════════════════════════════════════════════════════
  // DEAD HEART (common symptom from borer attack)
  // ═══════════════════════════════════════════════════════════════════════════
  'dead_heart': {
    mr: 'मृत गाभा / सुरळी वाळणे',
    hi: 'मृत गाभा',
    en: 'Dead Heart',
    kn: 'ಸತ್ತ ಹೃದಯ'
  } as TranslationEntry,

  // ═══════════════════════════════════════════════════════════════════════════
  // TERMITES
  // ═══════════════════════════════════════════════════════════════════════════
  'termite': {
    default: {
      mr: 'वाळवी',
      hi: 'दीमक',
      en: 'Termite',
      kn: 'ಗೆದ್ದಲು',
      gu: 'ઉધઈ'
    },
    vidarbha: {
      mr: 'उधई',
      hi: 'दीमक',
      en: 'Termite',
      kn: 'ಗೆದ್ದಲು'
    }
  } as RegionVariant,
  
  'termite_damage': {
    mr: 'वाळवीचे नुकसान',
    hi: 'दीमक का नुकसान',
    en: 'Termite Damage',
    kn: 'ಗೆದ್ದಲು ಹಾನಿ'
  } as TranslationEntry,

  // ═══════════════════════════════════════════════════════════════════════════
  // SUCKING PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  'whitefly': {
    mr: 'पांढरी माशी',
    hi: 'सफेद मक्खी',
    en: 'Whitefly',
    kn: 'ಬಿಳಿ ನೊಣ',
    gu: 'સફેદ માખી'
  } as TranslationEntry,
  
  'aphid': {
    mr: 'मावा',
    hi: 'माहू / चेपा',
    en: 'Aphid',
    kn: 'ಹೇನು',
    gu: 'મોલો'
  } as TranslationEntry,
  
  'thrips': {
    mr: 'तुडतुडे / फुलकिडे',
    hi: 'थ्रिप्स',
    en: 'Thrips',
    kn: 'ಥ್ರಿಪ್ಸ್'
  } as TranslationEntry,
  
  'mealybug': {
    mr: 'पिठ्या ढेकूण',
    hi: 'मिली बग',
    en: 'Mealybug',
    kn: 'ಹಿಟ್ಟು ತಿಗಣೆ'
  } as TranslationEntry,
  
  'scale_insect': {
    mr: 'खवले किडा',
    hi: 'शल्क कीट',
    en: 'Scale Insect',
    kn: 'ಸ್ಕೇಲ್ ಕೀಟ'
  } as TranslationEntry,
  
  'pyrilla': {
    mr: 'पायरिल्ला',
    hi: 'पायरिल्ला',
    en: 'Pyrilla',
    kn: 'ಪೈರಿಲ್ಲಾ'
  } as TranslationEntry,
  
  'woolly_aphid': {
    mr: 'कापसी मावा',
    hi: 'रोएंदार माहू',
    en: 'Woolly Aphid',
    kn: 'ಉಣ್ಣೆ ಹೇನು'
  } as TranslationEntry,

  // ═══════════════════════════════════════════════════════════════════════════
  // DISEASES
  // ═══════════════════════════════════════════════════════════════════════════
  'red_rot': {
    mr: 'तांबेरा / लाल कूज',
    hi: 'लाल सड़न',
    en: 'Red Rot',
    kn: 'ಕೆಂಪು ಕೊಳೆ'
  } as TranslationEntry,
  
  'smut': {
    mr: 'काणी / स्मट',
    hi: 'कंडवा',
    en: 'Smut',
    kn: 'ಸ್ಮಟ್'
  } as TranslationEntry,
  
  'wilt': {
    mr: 'मर / विल्ट',
    hi: 'उकठा',
    en: 'Wilt',
    kn: 'ಸೊರಗು ರೋಗ'
  } as TranslationEntry,
  
  'root_rot': {
    mr: 'मूळ कुज',
    hi: 'जड़ सड़न',
    en: 'Root Rot',
    kn: 'ಬೇರು ಕೊಳೆ'
  } as TranslationEntry,
  
  'grassy_shoot': {
    mr: 'गवती फुटवे',
    hi: 'घासीय फुटाव',
    en: 'Grassy Shoot',
    kn: 'ಹುಲ್ಲು ಚಿಗುರು'
  } as TranslationEntry,
  
  'leaf_scald': {
    mr: 'पान करपा',
    hi: 'पत्ती झुलसा',
    en: 'Leaf Scald',
    kn: 'ಎಲೆ ಸುಡುವಿಕೆ'
  } as TranslationEntry,
  
  'rust': {
    mr: 'तांबेरा',
    hi: 'गेरुआ',
    en: 'Rust',
    kn: 'ತುಕ್ಕು'
  } as TranslationEntry,
  
  'pokkah_boeng': {
    mr: 'पोक्का बोंग',
    hi: 'पोक्का बोंग',
    en: 'Pokkah Boeng',
    kn: 'ಪೊಕ್ಕಾ ಬೋಂಗ್'
  } as TranslationEntry,
  
  'ratoon_stunting': {
    mr: 'खोडवा खुंटणे',
    hi: 'रैटून बौनापन',
    en: 'Ratoon Stunting Disease',
    kn: 'ರಾಟೂನ್ ಸ್ಟಂಟಿಂಗ್'
  } as TranslationEntry,
  
  'mosaic': {
    mr: 'मोज़ेक रोग',
    hi: 'मोज़ेक रोग',
    en: 'Mosaic Disease',
    kn: 'ಮೊಸಾಯಿಕ್ ರೋಗ'
  } as TranslationEntry,

  // ═══════════════════════════════════════════════════════════════════════════
  // WATER & NUTRIENT STRESS
  // ═══════════════════════════════════════════════════════════════════════════
  'water_stress': {
    mr: 'पाणी ताण',
    hi: 'पानी तनाव',
    en: 'Water Stress',
    kn: 'ನೀರಿನ ಒತ್ತಡ'
  } as TranslationEntry,
  
  'waterlogging': {
    mr: 'पाणी साचणे',
    hi: 'जल भराव',
    en: 'Waterlogging',
    kn: 'ನೀರು ನಿಲ್ಲುವಿಕೆ'
  } as TranslationEntry,
  
  'nutrient_deficiency': {
    mr: 'पोषण तत्वांची कमतरता',
    hi: 'पोषक तत्वों की कमी',
    en: 'Nutrient Deficiency',
    kn: 'ಪೋಷಕಾಂಶ ಕೊರತೆ'
  } as TranslationEntry,
  
  'nitrogen_deficiency': {
    mr: 'नत्राची कमतरता',
    hi: 'नाइट्रोजन की कमी',
    en: 'Nitrogen Deficiency',
    kn: 'ಸಾರಜನಕ ಕೊರತೆ'
  } as TranslationEntry,
  
  'iron_chlorosis': {
    mr: 'लोह कमतरता / पिवळेपणा',
    hi: 'लौह क्लोरोसिस',
    en: 'Iron Chlorosis',
    kn: 'ಕಬ್ಬಿಣ ಕ್ಲೋರೋಸಿಸ್'
  } as TranslationEntry,
  
  'phosphorus_deficiency': {
    mr: 'स्फुरदाची कमतरता',
    hi: 'फास्फोरस की कमी',
    en: 'Phosphorus Deficiency',
    kn: 'ರಂಜಕ ಕೊರತೆ'
  } as TranslationEntry,
  
  'potassium_deficiency': {
    mr: 'पालाशची कमतरता',
    hi: 'पोटैशियम की कमी',
    en: 'Potassium Deficiency',
    kn: 'ಪೊಟ್ಯಾಷಿಯಂ ಕೊರತೆ'
  } as TranslationEntry,

  // ═══════════════════════════════════════════════════════════════════════════
  // OTHER ISSUES
  // ═══════════════════════════════════════════════════════════════════════════
  'frost_damage': {
    mr: 'दहिवर / थंडीचे नुकसान',
    hi: 'पाला नुकसान',
    en: 'Frost Damage',
    kn: 'ಮಂಜುಗಡ್ಡೆ ಹಾನಿ'
  } as TranslationEntry,
  
  'heat_stress': {
    mr: 'उष्णतेचा ताण',
    hi: 'गर्मी तनाव',
    en: 'Heat Stress',
    kn: 'ಶಾಖ ಒತ್ತಡ'
  } as TranslationEntry,
  
  'lodging': {
    mr: 'लोळणे / पडणे',
    hi: 'गिरावट',
    en: 'Lodging',
    kn: 'ಉರುಳುವಿಕೆ'
  } as TranslationEntry,
  
  'poor_germination': {
    mr: 'कमी उगवण',
    hi: 'खराब अंकुरण',
    en: 'Poor Germination',
    kn: 'ಕಳಪೆ ಮೊಳಕೆಯೊಡೆಯುವಿಕೆ'
  } as TranslationEntry,
  
  'unknown': {
    mr: 'अज्ञात समस्या',
    hi: 'अज्ञात समस्या',
    en: 'Unknown Issue',
    kn: 'ಅಜ್ಞಾತ ಸಮಸ್ಯೆ'
  } as TranslationEntry
};

// ═══════════════════════════════════════════════════════════════════════════
// REGION CLASSIFICATION HELPER
// ═══════════════════════════════════════════════════════════════════════════

// Vidarbha districts (use different terms)
const VIDARBHA_DISTRICTS = [
  'nagpur', 'wardha', 'bhandara', 'gondia', 'chandrapur', 
  'gadchiroli', 'amravati', 'akola', 'buldhana', 'washim', 
  'yavatmal'
];

function getRegionVariant(district: string): string {
  const districtLower = district.toLowerCase().trim();
  if (VIDARBHA_DISTRICTS.includes(districtLower)) {
    return 'vidarbha';
  }
  return 'default';
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZE PEST NAME FOR LOOKUP
// CRITICAL FIX: Extract core pest name from verbose database values
// Examples:
//   "Early Shoot Borer (Chilo infuscatellus) infestation" → "early_shoot_borer"
//   "SMUT_SEED_BORNE" → "smut"
//   "IPM prevention for Red Rot using hot water treatment" → "red_rot"
// ═══════════════════════════════════════════════════════════════════════════

function normalizePestName(name: string): string {
  let normalized = name
    .toLowerCase()
    .trim();
  
  // Remove parenthetical scientific names: "(Chilo infuscatellus)"
  normalized = normalized.replace(/\([^)]*\)/g, '');
  
  // Remove common suffixes/prefixes that make matching fail
  const removePhrases = [
    'infestation', 'attack', 'damage', 'symptoms', 'problem',
    'ipm prevention for', 'ipm treatment for', 'using hot water treatment',
    'using biocontrol', 'most destructive', 'check for',
    'seed not germinated', 'dead heart present', 'insects visible',
    'seed borne', 'soil borne'
  ];
  for (const phrase of removePhrases) {
    normalized = normalized.replace(new RegExp(phrase, 'gi'), '');
  }
  
  // Convert to snake_case
  normalized = normalized
    .replace(/[\s-]+/g, '_')          // spaces/hyphens to underscore
    .replace(/['']/g, '')              // remove apostrophes
    .replace(/_+/g, '_')               // collapse multiple underscores
    .replace(/^_|_$/g, '');            // trim underscores
  
  // Try known patterns to extract core pest name
  const knownPatterns: [RegExp, string][] = [
    [/early_?shoot_?borer/i, 'early_shoot_borer'],
    [/shoot_?borer/i, 'shoot_borer'],
    [/stem_?borer/i, 'stem_borer'],
    [/internode_?borer/i, 'internode_borer'],
    [/top_?borer/i, 'top_borer'],
    [/root_?borer/i, 'root_borer'],
    [/termite/i, 'termite'],
    [/red_?rot/i, 'red_rot'],
    [/smut/i, 'smut'],
    [/wilt/i, 'wilt'],
    [/root_?rot/i, 'root_rot'],
    [/whitefly/i, 'whitefly'],
    [/aphid/i, 'aphid'],
    [/mealybug/i, 'mealybug'],
    [/thrips/i, 'thrips'],
    [/bollworm/i, 'bollworm'],
    [/pink_?bollworm/i, 'pink_bollworm'],
    [/american_?bollworm/i, 'american_bollworm'],
    [/leaf_?spot/i, 'leaf_spot'],
    [/rust/i, 'rust'],
    [/blight/i, 'blight'],
    [/powdery_?mildew/i, 'powdery_mildew'],
    [/downy_?mildew/i, 'downy_mildew'],
    [/nitrogen/i, 'nitrogen_deficiency'],
    [/phosphorus/i, 'phosphorus_deficiency'],
    [/potassium/i, 'potassium_deficiency'],
    [/iron/i, 'iron_deficiency'],
    [/water_?stress/i, 'water_stress'],
    [/waterlog/i, 'waterlogging'],
    [/dead_?heart/i, 'dead_heart'],
    [/poor_?germination/i, 'poor_germination'],
    [/lodging/i, 'lodging']
  ];
  
  for (const [pattern, key] of knownPatterns) {
    if (pattern.test(normalized) || pattern.test(name)) {
      console.log(`   [normalizePestName] Pattern matched: "${name}" → "${key}"`);
      return key;
    }
  }
  
  return normalized;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRANSLATION FUNCTION (DETERMINISTIC)
// ═══════════════════════════════════════════════════════════════════════════

function isTranslationEntry(value: unknown): value is TranslationEntry {
  return typeof value === 'object' && value !== null && 'en' in value;
}

function isRegionVariant(value: unknown): value is RegionVariant {
  return typeof value === 'object' && value !== null && 'default' in value;
}

/**
 * Translate agricultural terms to regional farmer vocabulary.
 * 
 * DETERMINISTIC ONLY - NO LLM CALLS
 * This ensures consistent naming across all sessions.
 */
export async function translateToRegionalTerms(
  treatment: TreatmentToTranslate,
  location: FarmerLocation
): Promise<RegionalTranslation> {
  const pestKey = normalizePestName(treatment.pest_name_en);
  const lang = location.language || 'mr';
  const regionVariant = getRegionVariant(location.district);
  
  console.log(`\n🌍 [RegionalTranslator v${REGIONAL_TRANSLATOR_VERSION}] DETERMINISTIC lookup`);
  console.log(`   Input: "${treatment.pest_name_en}" → key: "${pestKey}"`);
  console.log(`   Location: ${location.district}, ${location.state} (${lang})`);
  console.log(`   Region variant: ${regionVariant}`);
  
  const translationData = PEST_TRANSLATIONS[pestKey];
  
  if (!translationData) {
    // No translation found - return English with note
    console.log(`   ⚠️ No translation found for: ${pestKey}, using English`);
    return {
      pest_name_regional: treatment.pest_name_en,
      treatment_label_regional: treatment.treatment_description_en || treatment.pest_name_en
    };
  }
  
  let entry: TranslationEntry;
  
  if (isTranslationEntry(translationData)) {
    // Simple entry without region variants
    entry = translationData;
  } else if (isRegionVariant(translationData)) {
    // Entry with region variants - pick appropriate one
    entry = translationData[regionVariant] || translationData['default'];
  } else {
    // Fallback
    console.log(`   ⚠️ Invalid translation data structure for: ${pestKey}`);
    return {
      pest_name_regional: treatment.pest_name_en,
      treatment_label_regional: treatment.treatment_description_en || treatment.pest_name_en
    };
  }
  
  // Get translation in farmer's language, with fallbacks
  const translation = entry[lang as keyof TranslationEntry] || 
                     entry.mr || 
                     entry.hi || 
                     entry.en ||
                     treatment.pest_name_en;
  
  console.log(`   ✅ DETERMINISTIC translation: "${translation}"`);
  
  return {
    pest_name_regional: translation as string,
    treatment_label_regional: translation as string
  };
}

/**
 * Batch translate multiple terms for efficiency.
 */
export async function batchTranslateTerms(
  terms: TreatmentToTranslate[],
  location: FarmerLocation
): Promise<RegionalTranslation[]> {
  const results: RegionalTranslation[] = [];
  
  for (const term of terms) {
    const translation = await translateToRegionalTerms(term, location);
    results.push(translation);
  }
  
  return results;
}

/**
 * Quick translate just the pest/cause name for option labels.
 */
export async function translatePestName(
  pestNameEn: string,
  location: FarmerLocation
): Promise<string> {
  const translation = await translateToRegionalTerms(
    { pest_name_en: pestNameEn, treatment_description_en: '' },
    location
  );
  return translation.pest_name_regional;
}
