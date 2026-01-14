/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAILURE CLASS DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Determine primary failure class before generating clarification options.
 * Uses existing crop, stage, intent, and land context only.
 * 
 * FAILURE CLASSES:
 * - ESTABLISHMENT_FAILURE: Plant death, gaps, poor emergence
 * - VEGETATIVE_STRESS: Growth issues during vegetative stage
 * - PEST_DAMAGE: Visible insect/pest activity
 * - DISEASE_SYMPTOM: Fungal, bacterial, viral symptoms
 * - NUTRIENT_DEFICIENCY: Nutrient-related visual symptoms
 * 
 * RULES:
 * 1. Derive failure class from existing signals only
 * 2. No AI reasoning - pure keyword and context matching
 * 3. Used to scope clarification domain
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const FAILURE_CLASS_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type FailureClass = 
  | 'ESTABLISHMENT_FAILURE'
  | 'VEGETATIVE_STRESS'
  | 'PEST_DAMAGE'
  | 'DISEASE_SYMPTOM'
  | 'NUTRIENT_DEFICIENCY'
  | 'UNKNOWN';

export interface FailureClassInput {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  user_query: string;
  detected_intent: string;
  symptoms: string[];
  symptom_scope: 'WHOLE_PLANT' | 'PART' | 'UNKNOWN';
}

export interface FailureClassResult {
  primary_class: FailureClass;
  confidence: number;
  matched_keywords: string[];
  reasoning: string;
  stage_compatible: boolean;
  derived_from: 'STAGE' | 'KEYWORDS' | 'SYMPTOMS' | 'INTENT' | 'DEFAULT';
}

export interface FailureClassAuditLog {
  trace_id: string;
  timestamp: number;
  input: FailureClassInput;
  result: FailureClassResult;
  clarification_domain: string;
  fallback_used: boolean;
  fallback_reason: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD MAPS FOR FAILURE CLASS DETECTION
// Multilingual support: English, Hindi, Marathi
// ═══════════════════════════════════════════════════════════════════════════

const ESTABLISHMENT_KEYWORDS = [
  // English
  'dead', 'dying', 'not germinating', 'no germination', 'gaps', 'poor emergence',
  'plant death', 'seedling death', 'empty', 'missing plants', 'not coming up',
  'failed', 'germination failure', 'seed rot', 'sett rot', 'bud not sprouting',
  // Hindi
  'मर गया', 'मर रहा', 'अंकुरण नहीं', 'खाली जगह', 'बीज सड़', 'पौधा मर',
  'नहीं उगा', 'खड़ा नहीं', 'अंकुर नहीं', 'बीज नहीं निकला',
  // Marathi
  'मेला', 'मेले', 'उगला नाही', 'रिकामे', 'जागा खाली', 'बी सडले',
  'रोप मेले', 'उगवले नाही', 'अंकुर नाही', 'कोंब आला नाही'
];

const PEST_KEYWORDS = [
  // English
  'insect', 'pest', 'bug', 'worm', 'caterpillar', 'borer', 'aphid', 'jassid',
  'whitefly', 'mite', 'thrips', 'eating', 'eaten', 'holes', 'termite', 'grub',
  'moth', 'larva', 'crawler', 'flying', 'jumping',
  // Hindi
  'कीड़ा', 'कीड़े', 'कीट', 'छेद', 'खाया', 'खा रहा', 'इल्ली', 'सुंडी',
  'मक्खी', 'तेला', 'माहू', 'दीमक', 'भुंग', 'सफेद मक्खी',
  // Marathi
  'किड', 'किडे', 'अळी', 'भुंगा', 'छिद्र', 'खाल्ले', 'पांढरी माशी',
  'तुडतुडे', 'माव्‍या', 'वाळवी', 'उंट अळी', 'उडत', 'उडणारे'
];

const DISEASE_KEYWORDS = [
  // English
  'spot', 'spots', 'blight', 'rot', 'rust', 'mold', 'mildew', 'wilt',
  'fungus', 'infection', 'lesion', 'necrosis', 'canker', 'scab', 'smut',
  // Hindi
  'धब्बा', 'धब्बे', 'झुलसा', 'सड़न', 'गेरुआ', 'फफूंद', 'मुरझाना',
  'कंगियारी', 'अंगमारी', 'ऊतक', 'काला धब्बा',
  // Marathi
  'डाग', 'डाग', 'करपा', 'कूज', 'तांबेरा', 'बुरशी', 'मावा',
  'कोळपा', 'काळे डाग', 'लालसर डाग', 'पानावर डाग'
];

const NUTRIENT_KEYWORDS = [
  // English
  'yellow', 'yellowing', 'pale', 'chlorosis', 'deficiency', 'stunted',
  'purple', 'red leaves', 'tip burn', 'marginal burn', 'interveinal',
  // Hindi
  'पीला', 'पीलापन', 'हल्का रंग', 'बौना', 'पोषक', 'छोटा रह गया',
  'कमजोर', 'लाल पत्ते', 'किनारा जला',
  // Marathi
  'पिवळे', 'पिवळसर', 'फिकट', 'खुरटलेले', 'पोषण', 'वाढ नाही',
  'कमकुवत', 'लालसर', 'पान पिवळे', 'कडा जळाला'
];

const VEGETATIVE_STRESS_KEYWORDS = [
  // English
  'wilting', 'drooping', 'stunted growth', 'slow growth', 'weak',
  'stress', 'not growing', 'poor growth', 'thin stems', 'small leaves',
  // Hindi
  'मुरझाना', 'लटकना', 'धीमी वृद्धि', 'कमजोर', 'तनाव',
  'बढ़ नहीं रहा', 'खराब वृद्धि', 'पतले तने', 'छोटे पत्ते',
  // Marathi
  'सुकणे', 'वाकणे', 'वाढ कमी', 'कमकुवत', 'ताण',
  'वाढत नाही', 'पातळ खोड', 'लहान पाने'
];

// ═══════════════════════════════════════════════════════════════════════════
// STAGE-BASED FAILURE CLASS MAPPING
// Early stages → ESTABLISHMENT_FAILURE priority
// ═══════════════════════════════════════════════════════════════════════════

const EARLY_STAGES = [
  'GERMINATION', 'ESTABLISHMENT', 'SEEDLING', 'TRANSPLANTING',
  'EMERGENCE', 'BUD_SPROUTING', 'PLANTING', 'SPROUTING'
];

const VEGETATIVE_STAGES = [
  'VEGETATIVE', 'TILLERING', 'GRAND_GROWTH', 'EARLY_VEGETATIVE',
  'ACTIVE_VEGETATIVE', 'ROSETTE', 'LEAF_DEVELOPMENT'
];

// ═══════════════════════════════════════════════════════════════════════════
// CORE DETECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect primary failure class from existing signals.
 * No AI reasoning - pure keyword and context matching.
 */
export function detectPrimaryFailureClass(input: FailureClassInput): FailureClassResult {
  const { crop_code, growth_stage, days_since_sowing, user_query, symptoms, symptom_scope } = input;
  
  const normalizedQuery = user_query.toLowerCase();
  const normalizedStage = growth_stage.toUpperCase();
  const matchedKeywords: string[] = [];
  
  console.log(`🔍 [FailureClass] Detecting for ${crop_code}/${normalizedStage}, DAS: ${days_since_sowing}`);
  console.log(`   Query: \"${normalizedQuery.substring(0, 100)}...\"`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Check for ESTABLISHMENT_FAILURE signals
  // Priority if: early stage + whole plant symptoms + death/gap keywords
  // ═══════════════════════════════════════════════════════════════════════════
  
  const isEarlyStage = EARLY_STAGES.some(s => normalizedStage.includes(s));
  const isVeryEarlyDAS = days_since_sowing !== null && days_since_sowing <= 30;
  const isWholePlant = symptom_scope === 'WHOLE_PLANT';
  
  // Check establishment keywords
  const establishmentMatches = ESTABLISHMENT_KEYWORDS.filter(k => 
    normalizedQuery.includes(k.toLowerCase())
  );
  
  if (establishmentMatches.length > 0) {
    matchedKeywords.push(...establishmentMatches);
  }
  
  // Check symptoms for establishment issues
  const establishmentSymptoms = symptoms.filter(s => {
    const lower = s.toLowerCase();
    return lower.includes('dead') || lower.includes('gap') || lower.includes('rot') || 
           lower.includes('death') || lower.includes('empty') || lower.includes('missing');
  });
  
  // ESTABLISHMENT_FAILURE priority conditions
  if ((isEarlyStage || isVeryEarlyDAS) && 
      (establishmentMatches.length > 0 || establishmentSymptoms.length > 0 || isWholePlant)) {
    console.log(`   ✅ ESTABLISHMENT_FAILURE detected (early stage + death/gap signals)`);
    return {
      primary_class: 'ESTABLISHMENT_FAILURE',
      confidence: 0.85 + (establishmentMatches.length * 0.05),
      matched_keywords: matchedKeywords,
      reasoning: `Early stage (${normalizedStage}, DAS: ${days_since_sowing}) with establishment failure signals`,
      stage_compatible: true,
      derived_from: isEarlyStage ? 'STAGE' : 'KEYWORDS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Check PEST_DAMAGE signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const pestMatches = PEST_KEYWORDS.filter(k => normalizedQuery.includes(k.toLowerCase()));
  const pestSymptoms = symptoms.filter(s => {
    const lower = s.toLowerCase();
    return lower.includes('insect') || lower.includes('pest') || lower.includes('hole') ||
           lower.includes('eating') || lower.includes('bore') || lower.includes('kiḍ');
  });
  
  if (pestMatches.length > 0 || pestSymptoms.length > 0) {
    matchedKeywords.push(...pestMatches);
    console.log(`   ✅ PEST_DAMAGE detected (${pestMatches.length} keywords, ${pestSymptoms.length} symptoms)`);
    return {
      primary_class: 'PEST_DAMAGE',
      confidence: 0.80 + (pestMatches.length * 0.04),
      matched_keywords: matchedKeywords,
      reasoning: `Pest/insect signals in query or symptoms`,
      stage_compatible: true,
      derived_from: pestMatches.length > 0 ? 'KEYWORDS' : 'SYMPTOMS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Check DISEASE_SYMPTOM signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const diseaseMatches = DISEASE_KEYWORDS.filter(k => normalizedQuery.includes(k.toLowerCase()));
  const diseaseSymptoms = symptoms.filter(s => {
    const lower = s.toLowerCase();
    return lower.includes('spot') || lower.includes('rot') || lower.includes('blight') ||
           lower.includes('fungus') || lower.includes('wilt') || lower.includes('ḍāg');
  });
  
  if (diseaseMatches.length > 0 || diseaseSymptoms.length > 0) {
    matchedKeywords.push(...diseaseMatches);
    console.log(`   ✅ DISEASE_SYMPTOM detected (${diseaseMatches.length} keywords, ${diseaseSymptoms.length} symptoms)`);
    return {
      primary_class: 'DISEASE_SYMPTOM',
      confidence: 0.78 + (diseaseMatches.length * 0.04),
      matched_keywords: matchedKeywords,
      reasoning: `Disease signals in query or symptoms`,
      stage_compatible: true,
      derived_from: diseaseMatches.length > 0 ? 'KEYWORDS' : 'SYMPTOMS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Check NUTRIENT_DEFICIENCY signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const nutrientMatches = NUTRIENT_KEYWORDS.filter(k => normalizedQuery.includes(k.toLowerCase()));
  const nutrientSymptoms = symptoms.filter(s => {
    const lower = s.toLowerCase();
    return lower.includes('yellow') || lower.includes('pale') || lower.includes('chlor') ||
           lower.includes('defici') || lower.includes('pīvaḷ');
  });
  
  if (nutrientMatches.length > 0 || nutrientSymptoms.length > 0) {
    matchedKeywords.push(...nutrientMatches);
    console.log(`   ✅ NUTRIENT_DEFICIENCY detected (${nutrientMatches.length} keywords, ${nutrientSymptoms.length} symptoms)`);
    return {
      primary_class: 'NUTRIENT_DEFICIENCY',
      confidence: 0.75 + (nutrientMatches.length * 0.04),
      matched_keywords: matchedKeywords,
      reasoning: `Nutrient deficiency signals in query or symptoms`,
      stage_compatible: true,
      derived_from: nutrientMatches.length > 0 ? 'KEYWORDS' : 'SYMPTOMS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Check VEGETATIVE_STRESS signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const stressMatches = VEGETATIVE_STRESS_KEYWORDS.filter(k => normalizedQuery.includes(k.toLowerCase()));
  const isVegetativeStage = VEGETATIVE_STAGES.some(s => normalizedStage.includes(s));
  
  if (stressMatches.length > 0 || isVegetativeStage) {
    matchedKeywords.push(...stressMatches);
    console.log(`   ✅ VEGETATIVE_STRESS detected (${stressMatches.length} keywords, vegetative stage: ${isVegetativeStage})`);
    return {
      primary_class: 'VEGETATIVE_STRESS',
      confidence: 0.70 + (stressMatches.length * 0.05),
      matched_keywords: matchedKeywords,
      reasoning: isVegetativeStage 
        ? `Vegetative stage (${normalizedStage}) with stress signals`
        : `Stress signals detected in query`,
      stage_compatible: true,
      derived_from: isVegetativeStage ? 'STAGE' : 'KEYWORDS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT: Cannot determine specific class
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`   ⚠️ Could not determine specific failure class - using UNKNOWN`);
  return {
    primary_class: 'UNKNOWN',
    confidence: 0.40,
    matched_keywords: [],
    reasoning: 'No specific failure class indicators found',
    stage_compatible: true,
    derived_from: 'DEFAULT'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION DOMAIN MAPPING
// Maps failure class to appropriate clarification domain
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationDomain {
  name: string;
  allowed_symptom_scopes: ('WHOLE_PLANT' | 'STEM' | 'LEAF' | 'ROOT' | 'FRUIT')[];
  canonical_groups: string[];
  excluded_observations: string[];
}

const CLARIFICATION_DOMAINS: Record<FailureClass, ClarificationDomain> = {
  ESTABLISHMENT_FAILURE: {
    name: 'ESTABLISHMENT',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'STEM', 'ROOT'],
    canonical_groups: ['establishment', 'stress', 'seed_quality', 'soil_borne'],
    excluded_observations: [
      // Do NOT use leaf-level symptoms for establishment failure
      'LEAF_YELLOWING', 'LEAF_SPOTS', 'LEAF_CURLING', 'LEAF_HOLES',
      'FLYING_INSECTS', 'SMALL_INSECTS_VISIBLE', 'HONEYDEW'
    ]
  },
  VEGETATIVE_STRESS: {
    name: 'VEGETATIVE',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'STEM', 'LEAF'],
    canonical_groups: ['stress', 'water', 'nutrition', 'environment'],
    excluded_observations: ['FRUIT_DAMAGE', 'GRAIN_DAMAGE']
  },
  PEST_DAMAGE: {
    name: 'PEST',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'STEM', 'LEAF', 'FRUIT', 'ROOT'],
    canonical_groups: ['pest', 'insect', 'mite'],
    excluded_observations: []
  },
  DISEASE_SYMPTOM: {
    name: 'DISEASE',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'STEM', 'LEAF', 'FRUIT', 'ROOT'],
    canonical_groups: ['disease', 'fungal', 'bacterial', 'viral'],
    excluded_observations: []
  },
  NUTRIENT_DEFICIENCY: {
    name: 'NUTRIENT',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF'],
    canonical_groups: ['nutrition', 'deficiency', 'soil_health'],
    excluded_observations: ['INSECT_HOLES', 'PEST_EGGS', 'WEBBING']
  },
  UNKNOWN: {
    name: 'GENERAL',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'STEM', 'LEAF', 'ROOT', 'FRUIT'],
    canonical_groups: [],
    excluded_observations: []
  }
};

/**
 * Get the clarification domain for a failure class.
 */
export function getClarificationDomain(failureClass: FailureClass): ClarificationDomain {
  return CLARIFICATION_DOMAINS[failureClass] || CLARIFICATION_DOMAINS.UNKNOWN;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE COMPATIBILITY CHECK
// Ensures clarification options are valid for the locked growth stage
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_INCOMPATIBLE_OBSERVATIONS: Record<string, string[]> = {
  GERMINATION: ['FRUIT_DAMAGE', 'GRAIN_DAMAGE', 'FLOWERING_ISSUES', 'POD_DAMAGE'],
  SEEDLING: ['FRUIT_DAMAGE', 'GRAIN_DAMAGE', 'FLOWERING_ISSUES', 'POD_DAMAGE'],
  ESTABLISHMENT: ['FRUIT_DAMAGE', 'GRAIN_DAMAGE', 'FLOWERING_ISSUES', 'POD_DAMAGE'],
  VEGETATIVE: ['GRAIN_DAMAGE', 'POD_DAMAGE', 'FRUIT_RIPENING'],
  TILLERING: ['GRAIN_DAMAGE', 'POD_DAMAGE', 'FRUIT_RIPENING'],
  FLOWERING: [],
  FRUITING: [],
  MATURITY: [],
  HARVEST: []
};

/**
 * Check if an observation is compatible with the current growth stage.
 */
export function isObservationStageCompatible(
  observation: string,
  growthStage: string
): boolean {
  const normalizedStage = growthStage.toUpperCase();
  const normalizedObs = observation.toUpperCase();
  
  // Find matching stage pattern
  for (const [stagePattern, incompatible] of Object.entries(STAGE_INCOMPATIBLE_OBSERVATIONS)) {
    if (normalizedStage.includes(stagePattern)) {
      if (incompatible.some(inc => normalizedObs.includes(inc))) {
        console.log(`   ⛔ Observation ${observation} incompatible with stage ${growthStage}`);
        return false;
      }
    }
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK OPTIONS BY FAILURE CLASS
// Used only when no rule-driven options found
// ═══════════════════════════════════════════════════════════════════════════

export interface FallbackOption {
  id: string;
  label_en: string;
  label_hi: string;
  label_mr: string;
  observation_key: string;
}

const FAILURE_CLASS_FALLBACKS: Record<FailureClass, FallbackOption[]> = {
  ESTABLISHMENT_FAILURE: [
    {
      id: 'PLANT_GAPS',
      label_en: 'Gaps in the row - some plants missing',
      label_hi: 'पंक्ति में खाली जगह - कुछ पौधे गायब',
      label_mr: 'ओळीत जागा खाली - काही रोपे नाहीत',
      observation_key: 'PLANT_GAPS'
    },
    {
      id: 'SEED_NOT_SPROUTING',
      label_en: 'Seeds/setts not sprouting at all',
      label_hi: 'बीज/सेट बिल्कुल अंकुरित नहीं हो रहे',
      label_mr: 'बी/सेट अजिबात उगवत नाहीत',
      observation_key: 'SEED_NOT_SPROUTING'
    },
    {
      id: 'SEEDLING_DEATH',
      label_en: 'Seedlings died after coming up',
      label_hi: 'उगने के बाद पौधे मर गए',
      label_mr: 'उगल्यानंतर रोपे मेली',
      observation_key: 'SEEDLING_DEATH'
    }
  ],
  PEST_DAMAGE: [
    {
      id: 'VISIBLE_INSECTS',
      label_en: 'Can see insects on the plant',
      label_hi: 'पौधे पर कीड़े दिखाई दे रहे हैं',
      label_mr: 'झाडावर किडे दिसत आहेत',
      observation_key: 'VISIBLE_INSECTS'
    },
    {
      id: 'HOLES_IN_PLANT',
      label_en: 'Holes in leaves/stem',
      label_hi: 'पत्तों/तने में छेद',
      label_mr: 'पानावर/खोडावर छिद्रे',
      observation_key: 'HOLES_IN_PLANT'
    },
    {
      id: 'BORE_DAMAGE',
      label_en: 'Boring damage inside stem',
      label_hi: 'तने के अंदर छेद',
      label_mr: 'खोडाच्या आत छिद्र',
      observation_key: 'BORE_DAMAGE'
    }
  ],
  DISEASE_SYMPTOM: [
    {
      id: 'SPOTS_ON_LEAVES',
      label_en: 'Spots on leaves (brown/black/yellow)',
      label_hi: 'पत्तों पर धब्बे (भूरे/काले/पीले)',
      label_mr: 'पानावर डाग (तपकिरी/काळे/पिवळे)',
      observation_key: 'LEAF_SPOTS'
    },
    {
      id: 'ROTTING',
      label_en: 'Rotting smell or soft tissue',
      label_hi: 'सड़ने की गंध या नरम ऊतक',
      label_mr: 'कुजण्याचा वास किंवा मऊ भाग',
      observation_key: 'ROTTING'
    },
    {
      id: 'WILTING',
      label_en: 'Plant wilting even with water',
      label_hi: 'पानी होने पर भी पौधा मुरझा रहा',
      label_mr: 'पाणी असूनही रोप सुकतो',
      observation_key: 'WILTING'
    }
  ],
  NUTRIENT_DEFICIENCY: [
    {
      id: 'YELLOWING_PATTERN',
      label_en: 'Yellowing starting from which leaves?',
      label_hi: 'पीलापन किन पत्तों से शुरू?',
      label_mr: 'पिवळेपणा कोणत्या पानांपासून?',
      observation_key: 'YELLOWING_PATTERN'
    },
    {
      id: 'STUNTED_GROWTH',
      label_en: 'Plant small/stunted compared to others',
      label_hi: 'पौधा दूसरों से छोटा/बौना',
      label_mr: 'रोप इतरांपेक्षा लहान/खुरटलेले',
      observation_key: 'STUNTED_GROWTH'
    },
    {
      id: 'LEAF_COLOR',
      label_en: 'Unusual leaf color (purple/red edges)',
      label_hi: 'असामान्य पत्ती रंग (बैंगनी/लाल किनारे)',
      label_mr: 'असामान्य पानाचा रंग (जांभळा/लाल कडा)',
      observation_key: 'LEAF_COLOR'
    }
  ],
  VEGETATIVE_STRESS: [
    {
      id: 'WILTING_STRESS',
      label_en: 'Wilting during day, recovers at night?',
      label_hi: 'दिन में मुरझाना, रात में ठीक?',
      label_mr: 'दिवसा सुकणे, रात्री बरे?',
      observation_key: 'WILTING_STRESS'
    },
    {
      id: 'SLOW_GROWTH',
      label_en: 'Very slow growth compared to expected',
      label_hi: 'अपेक्षा से बहुत धीमी वृद्धि',
      label_mr: 'अपेक्षेपेक्षा खूप कमी वाढ',
      observation_key: 'SLOW_GROWTH'
    },
    {
      id: 'WATER_ISSUE',
      label_en: 'Water logging or drought signs?',
      label_hi: 'जलभराव या सूखे के संकेत?',
      label_mr: 'पाणी साचणे किंवा दुष्काळाची चिन्हे?',
      observation_key: 'WATER_ISSUE'
    }
  ],
  UNKNOWN: [
    {
      id: 'GENERAL_PROBLEM',
      label_en: 'Describe what you see on the plant',
      label_hi: 'पौधे पर क्या दिखाई दे रहा है बताएं',
      label_mr: 'झाडावर काय दिसते ते सांगा',
      observation_key: 'GENERAL_OBSERVATION'
    }
  ]
};

/**
 * Get fallback options for a specific failure class.
 */
export function getFailureClassFallbackOptions(
  failureClass: FailureClass,
  language: 'en' | 'hi' | 'mr'
): { id: string; label: string; observation_key: string }[] {
  const fallbacks = FAILURE_CLASS_FALLBACKS[failureClass] || FAILURE_CLASS_FALLBACKS.UNKNOWN;
  
  return fallbacks.map(f => ({
    id: f.id,
    label: f[`label_${language}`] || f.label_en,
    observation_key: f.observation_key
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

const _auditLogs: FailureClassAuditLog[] = [];

/**
 * Log failure class detection for audit purposes.
 */
export function logFailureClassDetection(
  traceId: string,
  input: FailureClassInput,
  result: FailureClassResult,
  clarificationDomain: string,
  fallbackUsed: boolean,
  fallbackReason: string | null
): void {
  const entry: FailureClassAuditLog = {
    trace_id: traceId,
    timestamp: Date.now(),
    input,
    result,
    clarification_domain: clarificationDomain,
    fallback_used: fallbackUsed,
    fallback_reason: fallbackReason
  };
  
  _auditLogs.push(entry);
  
  // Keep only last 50 entries
  if (_auditLogs.length > 50) {
    _auditLogs.shift();
  }
  
  // Console log
  console.log(`📝 [FailureClass] AUDIT | trace=${traceId}`);
  console.log(`   Class: ${result.primary_class} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
  console.log(`   Domain: ${clarificationDomain}, Fallback: ${fallbackUsed}`);
  if (fallbackReason) {
    console.log(`   Fallback Reason: ${fallbackReason}`);
  }
}

/**
 * Get recent audit logs.
 */
export function getFailureClassAuditLogs(traceId?: string): FailureClassAuditLog[] {
  if (traceId) {
    return _auditLogs.filter(log => log.trace_id === traceId);
  }
  return [..._auditLogs];
}
