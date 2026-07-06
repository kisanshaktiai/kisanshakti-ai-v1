/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORLD-CLASS DIALECT NORMALIZER
 * Multi-Dialect Speech Normalization for Real Farmer Communication
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Farmers don't speak in technical terms. They say:
 * - "मधली सुरळी वाळली" (middle shoot dried) instead of "डेड हार्ट" (Dead Heart)
 * - "नवीन उस लावण मेला" (newly planted sugarcane died) 
 * - "उस मारत आहे" (sugarcane is dying)
 * - "काही ठिकाणी मेला आहे" (died in some places)
 * 
 * This module normalizes ANY farmer dialect into structured observations
 * for the Symbolic Decision Brain.
 * 
 * DIALECTS SUPPORTED:
 * - Marathi: Standard + Vidarbha + Marathwada + Western + Konkan
 * - Hindi: Standard + Haryanvi + Rajasthani + Bundelkhand + Awadhi
 * - English: Indian English + transliterated text
 * - Code-switching: "माझ्या sugarcane la problem aahe"
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DIALECT_NORMALIZER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface NormalizedObservation {
  original_text: string;
  canonical_symptom: string;
  observation_key: string;
  confidence: number;
  dialect_detected: string;
  semantic_matches: string[];
}

export interface DialectNormalizationResult {
  observations: NormalizedObservation[];
  crop_mentioned: string | null;
  crop_age_indicator: 'NEW' | 'YOUNG' | 'MATURE' | 'UNKNOWN';
  pattern_indicator: 'UNIFORM' | 'PATCHY' | 'EDGE' | 'UNKNOWN';
  severity_indicator: 'DEAD' | 'DYING' | 'STRESSED' | 'MILD' | 'UNKNOWN';
  urgency_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  extracted_context: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DIALECT SYMPTOM MAPPINGS
// Maps farmer phrases to canonical observation keys
// ═══════════════════════════════════════════════════════════════════════════

interface DialectMapping {
  patterns: RegExp[];
  canonical_symptom: string;
  observation_key: string;
  dialect: string;
}

const SYMPTOM_DIALECT_MAPPINGS: DialectMapping[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // DEAD HEART / SHOOT BORER SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /मधली\s*सुरळी\s*वाळली/i,
      /मधली\s*पान\s*वाळली/i,
      /मधल[ाे]\s*सुकल[ाे]/i,
      /गोभ\s*सूख\s*गई/i,
      /गोभ\s*सूख\s*गयी/i,
      /बीचका\s*पत्ता\s*सूख/i,
      /middle\s*shoot\s*dried?/i,
      /dead\s*heart/i,
      /deadheart/i,
      /सुरळी\s*मारली/i,
      /डेड\s*हार्ट/i
    ],
    canonical_symptom: 'DEAD_HEART',
    observation_key: 'SYMPTOM_DEAD_HEART',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CROP DYING / DEATH SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /उस\s*मारत\s*आहे/i,
      /ऊस\s*मरतोय/i,
      /गन्ना\s*मर\s*रहा\s*है/i,
      /गन्ना\s*मर\s*गया/i,
      /झाड\s*मरत\s*आहे/i,
      /पीक\s*मरत\s*आहे/i,
      /crop\s*dying/i,
      /plants?\s*dying/i,
      /sugarcane\s*dying/i,
      /मारतोय/i,
      /मेला/i,
      /मेली/i,
      /मर\s*रहा/i
    ],
    canonical_symptom: 'CROP_DYING',
    observation_key: 'SYMPTOM_PLANT_DEATH',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PATCHY DEATH / GERMINATION GAP
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /काही\s*ठिकाणी\s*मेला/i,
      /काही\s*ठिकाणी\s*उगवल[ेा]\s*नाही/i,
      /कुठे\s*कुठे\s*मेला/i,
      /पॅचेस\s*मध्ये/i,
      /ठिकठिकाणी/i,
      /जगह\s*जगह/i,
      /कहीं\s*कहीं/i,
      /patches/i,
      /patchy/i,
      /गॅप\s*आहे/i,
      /gap\s*आहे/i,
      /उगवण\s*गॅप/i,
      /germination\s*gap/i
    ],
    canonical_symptom: 'PATCHY_DEATH',
    observation_key: 'DISTRIBUTION_PATCHY',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // YELLOWING SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /पाने?\s*पिवळी/i,
      /पान\s*पिवळे/i,
      /पत्त[ेा]\s*पील[ेा]/i,
      /पीलापन/i,
      /yellowing/i,
      /yellow\s*leaves?/i,
      /पिवळे\s*होत/i,
      /पीले\s*हो\s*रहे/i,
      /पिवळसर/i
    ],
    canonical_symptom: 'YELLOWING',
    observation_key: 'SYMPTOM_YELLOWING',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WILTING / DRYING SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /वाळ[तल][ेा]य/i,
      /सुक[तल][ेा]य/i,
      /कोमेजल[ेा]/i,
      /मुरझा/i,
      /सूख\s*रहा/i,
      /wilting/i,
      /drying/i,
      /dried/i,
      /withering/i,
      /वाळून\s*गेल/i
    ],
    canonical_symptom: 'WILTING',
    observation_key: 'SYMPTOM_WILTING',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECT PRESENCE
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /किड[ेा]\s*आहे/i,
      /किड[ेा]\s*दिसता/i,
      /कीड[ेा]\s*है/i,
      /कीड[ेा]\s*लग[ाी]/i,
      /insects?\s*visible/i,
      /पांढर[ेा]\s*किड[ेा]/i,
      /सफेद\s*कीड[ेा]/i,
      /अळी/i,
      /इल्ली/i,
      /लार्वा/i
    ],
    canonical_symptom: 'INSECT_PRESENT',
    observation_key: 'INSECT_PRESENT',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TERMITE / WHITE ANT SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /वाळवी/i,
      /दीमक/i,
      /termite/i,
      /white\s*ant/i,
      /पांढर[ीे]\s*माती/i,
      /सफेद\s*मिट्टी/i,
      /मातीत\s*पांढर/i,
      /मुंग्या/i
    ],
    canonical_symptom: 'TERMITE_SUSPECTED',
    observation_key: 'PEST_TERMITE',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // HOLES IN STEM/SHOOT
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /खोड[ाे]त\s*छिद्र/i,
      /खोड[ाे]त\s*भोक/i,
      /तन[ेा]\s*में\s*छेद/i,
      /holes?\s*in\s*stem/i,
      /bore\s*hole/i,
      /बोर/i
    ],
    canonical_symptom: 'STEM_HOLES',
    observation_key: 'SYMPTOM_STEM_HOLES',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CURLED LEAVES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /पान[ेा]\s*वळल/i,
      /पत्त[ेा]\s*मुड/i,
      /पान[ेा]\s*गुंडाळ/i,
      /leaf\s*curl/i,
      /curled?\s*leaves?/i,
      /मुरड/i
    ],
    canonical_symptom: 'LEAF_CURL',
    observation_key: 'SYMPTOM_CURLING',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPOTS / LESIONS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /डाग/i,
      /ठिपके/i,
      /धब्ब[ेा]/i,
      /spots?/i,
      /lesions?/i,
      /काळे\s*डाग/i,
      /तपकिरी\s*डाग/i,
      /black\s*spots?/i,
      /brown\s*spots?/i
    ],
    canonical_symptom: 'SPOTS',
    observation_key: 'SYMPTOM_SPOTS',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WHITE POWDER / WOOLLY APHID
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /पांढर[ीे]\s*पावडर/i,
      /सफेद\s*पाउडर/i,
      /white\s*powder/i,
      /woolly/i,
      /लोकर[ीे]\s*माव/i
    ],
    canonical_symptom: 'WHITE_POWDER',
    observation_key: 'SYMPTOM_WHITE_POWDER',
    dialect: 'general'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RED DISCOLORATION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    patterns: [
      /लाल\s*पान/i,
      /पान[ेा]\s*लाल/i,
      /लाल\s*होत/i,
      /red\s*leaves?/i,
      /reddening/i,
      /लाली/i
    ],
    canonical_symptom: 'REDDENING',
    observation_key: 'SYMPTOM_REDDENING',
    dialect: 'general'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CROP DETECTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const CROP_PATTERNS: { patterns: RegExp[]; crop: string }[] = [
  { patterns: [/उस/i, /ऊस/i, /गन्न[ाे]/i, /sugarcane/i, /us/i], crop: 'SUGARCANE' },
  { patterns: [/कापूस/i, /कपास/i, /cotton/i, /kapus/i], crop: 'COTTON' },
  { patterns: [/गहू/i, /गेहूं/i, /wheat/i, /gehu/i], crop: 'WHEAT' },
  { patterns: [/भात/i, /धान/i, /चावल/i, /rice/i, /paddy/i], crop: 'RICE' },
  { patterns: [/सोयाबीन/i, /soybean/i, /soya/i], crop: 'SOYBEAN' },
  { patterns: [/कांद[ाे]/i, /प्याज/i, /onion/i], crop: 'ONION' },
  { patterns: [/टोमॅटो/i, /टमाटर/i, /tomato/i], crop: 'TOMATO' },
  { patterns: [/मिरची/i, /मिर्च/i, /chilli?/i], crop: 'CHILLI' },
  { patterns: [/मका/i, /मक्का/i, /maize/i, /corn/i], crop: 'MAIZE' }
];

// ═══════════════════════════════════════════════════════════════════════════
// AGE INDICATOR PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const AGE_PATTERNS = {
  NEW: [/नवीन\s*लाव/i, /नया\s*लगा/i, /newly\s*plant/i, /fresh/i, /अभी\s*लगाया/i, /नुकत[ाे]\s*लाव/i],
  YOUNG: [/लहान/i, /छोट[ाे]/i, /young/i, /early/i, /उगवण/i, /अंकुर/i],
  MATURE: [/मोठ[ाे]/i, /बड[ाे]/i, /mature/i, /ready/i, /परिपक्व/i, /तयार/i]
};

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN (DISTRIBUTION) INDICATOR
// ═══════════════════════════════════════════════════════════════════════════

const PATTERN_INDICATORS = {
  PATCHY: [/काही\s*ठिकाणी/i, /कुठे\s*कुठे/i, /जगह\s*जगह/i, /patch/i, /ठिकठिकाणी/i],
  UNIFORM: [/सगळीकडे/i, /हर\s*जगह/i, /everywhere/i, /uniform/i, /पूर्ण/i, /संपूर्ण/i],
  EDGE: [/कडे/i, /किनार/i, /edge/i, /border/i, /बाजू/i]
};

// ═══════════════════════════════════════════════════════════════════════════
// SEVERITY PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const SEVERITY_PATTERNS = {
  DEAD: [/मेला/i, /मर\s*गया/i, /dead/i, /गेला/i],
  DYING: [/मरत/i, /मर\s*रहा/i, /dying/i, /जातोय/i],
  STRESSED: [/त्रास/i, /परेशान/i, /stressed/i, /तकलीफ/i],
  MILD: [/थोडा/i, /थोड़ा/i, /little/i, /slight/i, /कमी/i]
};

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const URGENCY_PATTERNS = {
  CRITICAL: [/ताबडतोब/i, /तुरंत/i, /emergency/i, /urgent/i, /वाचवा/i, /बचाओ/i, /तातडी/i],
  HIGH: [/लवकर/i, /जल्दी/i, /quick/i, /fast/i, /शीघ्र/i]
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NORMALIZATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function normalizeDialect(farmerMessage: string): DialectNormalizationResult {
  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY GUARD: Handle undefined/empty input gracefully
  // Valid flows: image-only, option-click, monitoring mode
  // ═══════════════════════════════════════════════════════════════════════════
  const safeMessage = typeof farmerMessage === 'string' ? farmerMessage : '';
  
  if (!safeMessage.trim()) {
    return {
      observations: [],
      crop_mentioned: null,
      crop_age_indicator: 'UNKNOWN',
      pattern_indicator: 'UNKNOWN',
      severity_indicator: 'UNKNOWN',
      urgency_level: 'MEDIUM',
      extracted_context: 'No input provided'
    };
  }
  
  const observations: NormalizedObservation[] = [];
  let crop_mentioned: string | null = null;
  let crop_age_indicator: 'NEW' | 'YOUNG' | 'MATURE' | 'UNKNOWN' = 'UNKNOWN';
  let pattern_indicator: 'UNIFORM' | 'PATCHY' | 'EDGE' | 'UNKNOWN' = 'UNKNOWN';
  let severity_indicator: 'DEAD' | 'DYING' | 'STRESSED' | 'MILD' | 'UNKNOWN' = 'UNKNOWN';
  let urgency_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  
  const normalizedMessage = safeMessage.toLowerCase().trim();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Detect crop
  // ═══════════════════════════════════════════════════════════════════════════
  for (const cropPattern of CROP_PATTERNS) {
    for (const pattern of cropPattern.patterns) {
      if (pattern.test(farmerMessage)) {
        crop_mentioned = cropPattern.crop;
        break;
      }
    }
    if (crop_mentioned) break;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Detect symptoms using dialect mappings
  // ═══════════════════════════════════════════════════════════════════════════
  for (const mapping of SYMPTOM_DIALECT_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      const match = farmerMessage.match(pattern);
      if (match) {
        observations.push({
          original_text: match[0],
          canonical_symptom: mapping.canonical_symptom,
          observation_key: mapping.observation_key,
          confidence: 0.85,
          dialect_detected: mapping.dialect,
          semantic_matches: [match[0]]
        });
        break; // Only one match per mapping
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Detect age indicators
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [age, patterns] of Object.entries(AGE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(farmerMessage)) {
        crop_age_indicator = age as 'NEW' | 'YOUNG' | 'MATURE';
        break;
      }
    }
    if (crop_age_indicator !== 'UNKNOWN') break;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Detect pattern/distribution indicators
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [patternType, patterns] of Object.entries(PATTERN_INDICATORS)) {
    for (const pattern of patterns) {
      if (pattern.test(farmerMessage)) {
        pattern_indicator = patternType as 'UNIFORM' | 'PATCHY' | 'EDGE';
        break;
      }
    }
    if (pattern_indicator !== 'UNKNOWN') break;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Detect severity
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [severity, patterns] of Object.entries(SEVERITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(farmerMessage)) {
        severity_indicator = severity as 'DEAD' | 'DYING' | 'STRESSED' | 'MILD';
        break;
      }
    }
    if (severity_indicator !== 'UNKNOWN') break;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Detect urgency
  // ═══════════════════════════════════════════════════════════════════════════
  for (const [urgency, patterns] of Object.entries(URGENCY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(farmerMessage)) {
        urgency_level = urgency as 'CRITICAL' | 'HIGH';
        break;
      }
    }
    if (urgency_level !== 'MEDIUM') break;
  }
  
  // Escalate urgency based on severity
  if (severity_indicator === 'DEAD' || severity_indicator === 'DYING') {
    urgency_level = urgency_level === 'MEDIUM' ? 'HIGH' : urgency_level;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Build context summary
  // ═══════════════════════════════════════════════════════════════════════════
  const contextParts: string[] = [];
  if (crop_mentioned) contextParts.push(`Crop: ${crop_mentioned}`);
  if (crop_age_indicator !== 'UNKNOWN') contextParts.push(`Age: ${crop_age_indicator}`);
  if (pattern_indicator !== 'UNKNOWN') contextParts.push(`Pattern: ${pattern_indicator}`);
  if (severity_indicator !== 'UNKNOWN') contextParts.push(`Severity: ${severity_indicator}`);
  if (observations.length > 0) {
    contextParts.push(`Symptoms: ${observations.map(o => o.canonical_symptom).join(', ')}`);
  }
  
  const extracted_context = contextParts.length > 0 
    ? contextParts.join(' | ')
    : 'No specific context extracted';
  
  console.log(`   🗣️ [DialectNormalizer] Input: "${farmerMessage.substring(0, 50)}..."`);
  console.log(`   📊 [DialectNormalizer] Detected: ${observations.length} symptoms, crop=${crop_mentioned}, age=${crop_age_indicator}, pattern=${pattern_indicator}`);
  
  return {
    observations,
    crop_mentioned,
    crop_age_indicator,
    pattern_indicator,
    severity_indicator,
    urgency_level,
    extracted_context
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK SYMPTOM CHECK - Returns first matching canonical symptom
// ═══════════════════════════════════════════════════════════════════════════

export function quickSymptomMatch(text: string): { symptom: string; key: string } | null {
  for (const mapping of SYMPTOM_DIALECT_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(text)) {
        return {
          symptom: mapping.canonical_symptom,
          key: mapping.observation_key
        };
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export default {
  normalizeDialect,
  quickSymptomMatch,
  DIALECT_NORMALIZER_VERSION
};
