// OBSERVATION-TO-CAUSE MAPPER - Symbolic (No AI) Cause Inference

export const OBSERVATION_MAPPER_VERSION = '1.0.0';

// TYPE DEFINITIONS

export interface ObservationMapperInput {
  observations: string[];
  crop_code?: string;
  growth_stage?: string;
  language?: string;
}

export interface CauseMappingResult {
  cause_codes: string[];
  cause_type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'UNKNOWN';
  confidence: number;
  ambiguous: boolean;
  matched_patterns: string[];
  requires_clarification: boolean;
  clarification_question?: string;
}

interface PatternRule {
  patterns: RegExp[];
  cause_code: string;
  cause_type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER';
  crop_specific?: string[];  // Only match for these crops
  confidence: number;
}

// OBSERVATION → CAUSE RULES (Deterministic, Auditable)

const OBSERVATION_RULES: PatternRule[] = [
  // ═══ PEST PATTERNS ═══
  
  // Shoot Borer / Dead Heart (Sugarcane, Maize)
  {
    patterns: [
      /dead\s*heart/i,
      /मधली\s*सुरळी/i,
      /सुखी\s*सुरळी/i,
      /सुरळी.*(वाळली|मरली|सुकली|पूर्ण)/i,
      /गाभा\s*सुकला/i,
      /डेड\s*हार्ट/i,
      /shoot\s*borer/i,
      /खोडकिडा/i,
      /तना\s*छेदक/i
    ],
    cause_code: 'SHOOT_BORER',
    cause_type: 'PEST',
    crop_specific: ['SUGARCANE', 'MAIZE', 'SORGHUM'],
    confidence: 0.92
  },
  
  // Stem Borer
  {
    patterns: [
      /stem\s*borer/i,
      /खोड\s*किडा/i,
      /तना\s*छेदक/i,
      /holes?\s*in\s*stem/i,
      /खोडात\s*छिद्र/i
    ],
    cause_code: 'STEM_BORER',
    cause_type: 'PEST',
    confidence: 0.88
  },
  
  // Bollworm (Cotton)
  {
    patterns: [
      /boll\s*worm/i,
      /बोंड\s*अळी/i,
      /बोंडातील\s*किडा/i,
      /holes?\s*in\s*boll/i,
      /बोंडात\s*छिद्र/i,
      /damaged\s*bolls?/i
    ],
    cause_code: 'BOLLWORM',
    cause_type: 'PEST',
    crop_specific: ['COTTON'],
    confidence: 0.90
  },
  
  // Whitefly
  {
    patterns: [
      /white\s*fl(y|ies)/i,
      /पांढऱ्या?\s*माश[ाी]/i,
      /सफेद\s*मक्खी/i,
      /tiny\s*white\s*insects?/i,
      /पांढरे\s*किडे/i
    ],
    cause_code: 'WHITEFLY',
    cause_type: 'PEST',
    confidence: 0.90
  },
  
  // Aphid
  {
    patterns: [
      /aphid/i,
      /मावा/i,
      /माहूं/i,
      /sticky\s*honeydew/i,
      /चिकट\s*पाणी/i,
      /small\s*green\s*insects?/i,
      /हिरवे\s*किडे/i
    ],
    cause_code: 'APHID',
    cause_type: 'PEST',
    confidence: 0.88
  },
  
  // Thrips
  {
    patterns: [
      /thrips?/i,
      /तुडतुडे/i,
      /थ्रिप्स/i,
      /silver\s*leaves?/i,
      /चांदी\s*रंगाची\s*पाने/i
    ],
    cause_code: 'THRIPS',
    cause_type: 'PEST',
    confidence: 0.85
  },
  
  // Jassid
  {
    patterns: [
      /jassid/i,
      /तुडतुडा/i,
      /जैसिड/i,
      /leaf\s*hopper/i,
      /पान\s*उडी/i
    ],
    cause_code: 'JASSID',
    cause_type: 'PEST',
    confidence: 0.85
  },
  
  // Mealybug
  {
    patterns: [
      /mealy\s*bug/i,
      /पिठ्या\s*ढेकूण/i,
      /मिलीबग/i,
      /white\s*cotton.*(mass|growth)/i,
      /पांढरी\s*कापसासारखी/i
    ],
    cause_code: 'MEALYBUG',
    cause_type: 'PEST',
    confidence: 0.88
  },
  
  // Armyworm
  {
    patterns: [
      /army\s*worm/i,
      /लष्करी\s*अळी/i,
      /आर्मीवर्म/i,
      /caterpillar\s*eating\s*leaves/i,
      /पाने\s*खाणारी\s*अळी/i
    ],
    cause_code: 'ARMYWORM',
    cause_type: 'PEST',
    confidence: 0.87
  },
  
  // Fruit Borer
  {
    patterns: [
      /fruit\s*borer/i,
      /फळ\s*पोखरणारा/i,
      /holes?\s*in\s*fruit/i,
      /फळात\s*छिद्र/i,
      /tomato\s*borer/i
    ],
    cause_code: 'FRUIT_BORER',
    cause_type: 'PEST',
    crop_specific: ['TOMATO', 'CHILLI', 'BRINJAL'],
    confidence: 0.88
  },
  
  // ═══ DISEASE PATTERNS ═══
  
  // Powdery Mildew
  {
    patterns: [
      /powdery\s*mildew/i,
      /पांढरी\s*भुकटी/i,
      /सफेद\s*पाउडर/i,
      /white\s*powder\s*on\s*leaves?/i,
      /भुरी/i,
      /चूर्णिल\s*आसिता/i
    ],
    cause_code: 'POWDERY_MILDEW',
    cause_type: 'DISEASE',
    confidence: 0.90
  },
  
  // Downy Mildew
  {
    patterns: [
      /downy\s*mildew/i,
      /केवडा/i,
      /मृदुरोमिल/i,
      /yellow\s*patches?\s*with\s*white\s*growth/i,
      /पिवळे\s*डाग.*पांढरी\s*वाढ/i
    ],
    cause_code: 'DOWNY_MILDEW',
    cause_type: 'DISEASE',
    confidence: 0.88
  },
  
  // Rust
  {
    patterns: [
      /rust/i,
      /तांबेरा/i,
      /रतुआ/i,
      /orange\s*(spots?|pustules?)/i,
      /नारिंगी\s*डाग/i,
      /तांबड्या\s*रंगाचे\s*डाग/i
    ],
    cause_code: 'RUST',
    cause_type: 'DISEASE',
    confidence: 0.90
  },
  
  // Wilt
  {
    patterns: [
      /wilt(ing)?/i,
      /मर\s*रोग/i,
      /उकठा/i,
      /plant\s*(dying|wilting)/i,
      /झाड\s*मरतंय/i,
      /sudden\s*wilting/i
    ],
    cause_code: 'WILT',
    cause_type: 'DISEASE',
    confidence: 0.85
  },
  
  // Blight
  {
    patterns: [
      /blight/i,
      /करपा/i,
      /झुलसा/i,
      /leaves?\s*burn(ing|ed)?/i,
      /पाने\s*करपली/i,
      /brown\s*dead\s*spots?/i
    ],
    cause_code: 'BLIGHT',
    cause_type: 'DISEASE',
    confidence: 0.87
  },
  
  // Leaf Curl
  {
    patterns: [
      /leaf\s*curl/i,
      /पाने\s*वळलेली/i,
      /पत्ती\s*मोड/i,
      /curled?\s*leaves?/i,
      /पाने\s*कुरळे/i
    ],
    cause_code: 'LEAF_CURL',
    cause_type: 'DISEASE',
    confidence: 0.88
  },
  
  // Anthracnose
  {
    patterns: [
      /anthracnose/i,
      /करपा/i,
      /dark\s*sunken\s*spots?/i,
      /काळे\s*खोल\s*डाग/i
    ],
    cause_code: 'ANTHRACNOSE',
    cause_type: 'DISEASE',
    confidence: 0.85
  },
  
  // Red Rot (Sugarcane)
  {
    patterns: [
      /red\s*rot/i,
      /तांबडा\s*कुज/i,
      /लाल\s*सड़न/i,
      /red\s*colou?r\s*inside\s*stem/i
    ],
    cause_code: 'RED_ROT',
    cause_type: 'DISEASE',
    crop_specific: ['SUGARCANE'],
    confidence: 0.90
  },
  
  // Smut (Sugarcane)
  {
    patterns: [
      /smut/i,
      /काणी/i,
      /कांडी/i,
      /black\s*whip.*(growth|structure)/i
    ],
    cause_code: 'SMUT',
    cause_type: 'DISEASE',
    crop_specific: ['SUGARCANE'],
    confidence: 0.90
  },
  
  // ═══ NUTRIENT PATTERNS ═══
  
  // Nitrogen Deficiency
  {
    patterns: [
      /nitrogen\s*deficien/i,
      /नायट्रोजन\s*कमी/i,
      /yellow(ing)?\s*leaves?.*older/i,
      /जुनी\s*पाने\s*पिवळी/i,
      /pale\s*green\s*leaves?/i,
      /फिक्कट\s*हिरवी\s*पाने/i
    ],
    cause_code: 'NITROGEN_DEFICIENCY',
    cause_type: 'NUTRIENT',
    confidence: 0.82
  },
  
  // Phosphorus Deficiency
  {
    patterns: [
      /phosphorus\s*deficien/i,
      /स्फुरद\s*कमी/i,
      /purple\s*leaves?/i,
      /जांभळी\s*पाने/i,
      /stunted\s*growth/i,
      /वाढ\s*खुंटली/i
    ],
    cause_code: 'PHOSPHORUS_DEFICIENCY',
    cause_type: 'NUTRIENT',
    confidence: 0.80
  },
  
  // Potassium Deficiency
  {
    patterns: [
      /potassium\s*deficien/i,
      /पालाश\s*कमी/i,
      /leaf\s*edge\s*burn/i,
      /पानाच्या\s*कडा\s*करपल्या/i,
      /marginal\s*necrosis/i
    ],
    cause_code: 'POTASSIUM_DEFICIENCY',
    cause_type: 'NUTRIENT',
    confidence: 0.80
  },
  
  // Magnesium Deficiency (Interveinal chlorosis on OLDER leaves)
  {
    patterns: [
      /magnesium\s*deficien/i,
      /mg\s*deficien/i,
      /मॅग्नेशियम\s*कमी/i,
      /interveinal\s*chlorosis/i,
      /शिरांमधील\s*(पिवळेपणा|पिवळा)/i,
      /शिरा\s*हिरव्या.*पान\s*पिवळ/i,
      /पानाच्या\s*शिरांमधील\s*भाग\s*पिवळा/i,
      /veins?\s*green.*yellow/i,
      /yellow.*between\s*veins?/i,
      /पिवळे\s*पट्टे.*शिरा\s*हिरव/i
    ],
    cause_code: 'MAGNESIUM_DEFICIENCY',
    cause_type: 'NUTRIENT',
    confidence: 0.88
  },
  
  // Zinc Deficiency (Interveinal chlorosis on YOUNG leaves + white bands)
  {
    patterns: [
      /zinc\s*deficien/i,
      /zn\s*deficien/i,
      /जस्त\s*कमी/i,
      /झिंक\s*कमी/i,
      /white\s*band/i,
      /पांढरे\s*पट्टे/i,
      /young\s*leaves?\s*yellow.*veins?\s*green/i,
      /नवीन\s*पाने\s*पिवळी/i,
      /khaira/i,
      /खैरा/i
    ],
    cause_code: 'ZINC_DEFICIENCY',
    cause_type: 'NUTRIENT',
    crop_specific: ['RICE', 'SUGARCANE', 'MAIZE', 'WHEAT'],
    confidence: 0.85
  },
  
  // Iron Deficiency (Chlorosis on YOUNGEST leaves, entire leaf pale)
  {
    patterns: [
      /iron\s*deficien/i,
      /fe\s*deficien/i,
      /लोह\s*कमी/i,
      /आयर्न\s*कमी/i,
      /youngest\s*leaves?\s*yellow/i,
      /entire\s*leaf\s*pale/i,
      /सगळं\s*पान\s*पिवळं/i,
      /नवीन\s*पान\s*पूर्ण\s*पिवळे/i
    ],
    cause_code: 'IRON_DEFICIENCY',
    cause_type: 'NUTRIENT',
    confidence: 0.82
  },

  // ═══ WATER PATTERNS ═══
  
  // Water Stress / Drought
  {
    patterns: [
      /drought\s*stress/i,
      /पाण्याची\s*कमतरता/i,
      /wilting\s*in\s*afternoon/i,
      /दुपारी\s*सुकतात/i,
      /need\s*water/i,
      /पाणी\s*पाहिजे/i
    ],
    cause_code: 'WATER_STRESS',
    cause_type: 'WATER',
    confidence: 0.85
  },
  
  // Waterlogging
  {
    patterns: [
      /waterlog/i,
      /पाणी\s*साचलं/i,
      /जलभराव/i,
      /standing\s*water/i,
      /शेतात\s*पाणी\s*साठलं/i
    ],
    cause_code: 'WATERLOGGING',
    cause_type: 'WATER',
    confidence: 0.88
  }
];

// CORE MAPPING FUNCTION

// Map farmer observations to cause codes using deterministic rules
export function mapObservationsToCauses(
  input: ObservationMapperInput
): CauseMappingResult {
  const { observations, crop_code, growth_stage } = input;
  
  const cause_codes: string[] = [];
  const matched_patterns: string[] = [];
  let highest_confidence = 0;
  let primary_cause_type: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'UNKNOWN' = 'UNKNOWN';
  
  // Combine all observations into searchable text
  const combinedText = observations.join(' ');
  
  console.log(`🔍 [ObservationMapper] Mapping observations: "${combinedText.substring(0, 100)}..."`);
  console.log(`   Crop context: ${crop_code || 'NOT_SPECIFIED'}`);
  
  // Check each rule
  for (const rule of OBSERVATION_RULES) {
    // Skip crop-specific rules if crop doesn't match
    if (rule.crop_specific && crop_code) {
      if (!rule.crop_specific.includes(crop_code.toUpperCase())) {
        continue;
      }
    }
    
    // Check patterns
    for (const pattern of rule.patterns) {
      if (pattern.test(combinedText)) {
        // Avoid duplicates
        if (!cause_codes.includes(rule.cause_code)) {
          cause_codes.push(rule.cause_code);
          matched_patterns.push(pattern.source);
          
          // Track highest confidence and primary type
          if (rule.confidence > highest_confidence) {
            highest_confidence = rule.confidence;
            primary_cause_type = rule.cause_type;
          }
          
          console.log(`   ✅ Matched: ${rule.cause_code} (${rule.cause_type}) via pattern: ${pattern.source}`);
        }
        break; // Only count once per rule
      }
    }
  }
  
  // Check for ambiguity (multiple different cause types)
  const cause_types = new Set(
    cause_codes.map(code => {
      const rule = OBSERVATION_RULES.find(r => r.cause_code === code);
      return rule?.cause_type || 'UNKNOWN';
    })
  );
  const ambiguous = cause_types.size > 1;
  
  // Determine if clarification needed
  const requires_clarification = 
    cause_codes.length === 0 || 
    highest_confidence < 0.7 ||
    ambiguous;
  
  // Generate clarification question if needed
  let clarification_question: string | undefined;
  if (requires_clarification) {
    if (cause_codes.length === 0) {
      clarification_question = generateNoCauseQuestion(input.language);
    } else if (ambiguous) {
      clarification_question = generateAmbiguityQuestion(cause_codes, input.language);
    }
  }
  
  const result: CauseMappingResult = {
    cause_codes,
    cause_type: primary_cause_type,
    confidence: highest_confidence || 0.3,
    ambiguous,
    matched_patterns,
    requires_clarification,
    clarification_question
  };
  
  console.log(`📊 [ObservationMapper] Result: ${cause_codes.length} causes found, type=${primary_cause_type}, confidence=${highest_confidence.toFixed(2)}`);
  
  return result;
}

// CLARIFICATION QUESTION GENERATORS

function generateNoCauseQuestion(language?: string): string {
  const questions = {
    mr: 'पिकात नक्की काय दिसतंय? कृपया अधिक तपशील द्या - किडे, डाग, पानांचा रंग बदल इत्यादी.',
    hi: 'फसल में क्या दिख रहा है? कृपया अधिक विवरण दें - कीड़े, धब्बे, पत्तों का रंग बदलाव आदि.',
    en: 'What exactly do you see in the crop? Please provide more details - insects, spots, leaf color changes, etc.'
  };
  return questions[language || 'en'];
}

function generateAmbiguityQuestion(cause_codes: string[], language?: string): string {
  const questions = {
    mr: `आम्हाला अनेक समस्या दिसत आहेत. तुमची मुख्य समस्या कोणती आहे?`,
    hi: `हमें कई समस्याएं दिख रही हैं। आपकी मुख्य समस्या कौन सी है?`,
    en: `We detected multiple issues. Which is your primary concern?`
  };
  return questions[language || 'en'];
}

// HELPER FUNCTIONS

// Get cause type for a cause code
export function getCauseType(cause_code: string): 'PEST' | 'DISEASE' | 'NUTRIENT' | 'WATER' | 'UNKNOWN' {
  const rule = OBSERVATION_RULES.find(r => r.cause_code === cause_code);
  return rule?.cause_type || 'UNKNOWN';
}

// Check if a cause code is crop-specific
export function isCropSpecificCause(cause_code: string): string[] | undefined {
  const rule = OBSERVATION_RULES.find(r => r.cause_code === cause_code);
  return rule?.crop_specific;
}

// Get all registered cause codes
export function getAllCauseCodes(): string[] {
  return OBSERVATION_RULES.map(r => r.cause_code);
}

// Validate that cause codes from AI match our rules
export function validateCauseCode(code: string): boolean {
  return OBSERVATION_RULES.some(r => r.cause_code === code.toUpperCase());
}
