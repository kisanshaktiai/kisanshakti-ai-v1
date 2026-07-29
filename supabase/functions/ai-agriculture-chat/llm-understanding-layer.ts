// LLM UNDERSTANDING LAYER - Layer 2 in 5-Layer Symbolic Brain Architecture

// NEW OUTPUT TYPE - UnderstandingOutput (as per spec)

// UnderstandingOutput - The primary output type for the LLM Understanding Layer.
export interface UnderstandingOutput {
  // Detected language of farmer input
  language_detected: string;
  
  // Intent classification (drives which rules to load)
  intent: 'DIAGNOSIS' | 'TREATMENT' | 'PREVENTION' | 'INFORMATION' | 'SCHEDULING';
  
  // Extracted observations (ENGLISH KEYS ONLY)
  observations: Array<{
    key: string;              // English ONLY (e.g., "LEAF_YELLOWING", "PATCHY_DEATH")
    original_text: string;    // Farmer's exact words
    category: 'SYMPTOM' | 'LOCATION' | 'TIMING' | 'SEVERITY';
    confidence: number;
    metadata?: any;
  }>;
  
  // Crop identification
  crop: {
    code: string;            // Canonical crop code (e.g., "SUGARCANE")
    confidence: number;
  };
  
  // Urgency level
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';
  
  // Overall confidence in understanding
  confidence: number;
  
  // What context is still needed for full understanding
  context_needed: string[];
  
  // Raw farmer text (for logging/audit)
  raw_farmer_text: string;
}

// OUTPUT VALIDATION - Prevent diagnosis leakage

// Validates that the UnderstandingOutput doesn't contain forbidden diagnosis words.
export function validateUnderstandingOutput(output: any): { valid: boolean; violations: string[] } {
  const forbiddenWords = [
    'pest_code', 'disease_code', 'product_name', 'dosage',
    'treatment_id', 'recommendation_id', 'spray_schedule',
    'chemical_name', 'fungicide', 'insecticide', 'pesticide_code'
  ];
  
  const violations: string[] = [];
  const outputStr = JSON.stringify(output).toLowerCase();
  
  for (const word of forbiddenWords) {
    if (outputStr.includes(word.toLowerCase())) {
      violations.push(`Forbidden diagnosis word found: ${word}`);
    }
  }
  
  // Validate observations have English keys only
  if (output.observations && Array.isArray(output.observations)) {
    for (const obs of output.observations) {
      if (obs.key) {
        // Check if key contains Devanagari characters (Hindi/Marathi)
        if (/[\u0900-\u097F]/.test(obs.key)) {
          violations.push(`Observation key must be English: ${obs.key}`);
        }
        // Check if key is uppercase snake_case
        if (!/^[A-Z][A-Z0-9_]*$/.test(obs.key)) {
          violations.push(`Observation key must be UPPERCASE_SNAKE_CASE: ${obs.key}`);
        }
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

// LEGACY TYPES (Kept for backward compatibility)

export interface SemanticUnderstanding {
  primaryIntent: 'diagnosis' | 'treatment' | 'prevention' | 'general_advice' | 'scheduling' | 'weather' | 'market' | 'greeting' | 'unknown';
  symptoms: SymptomMention[];
  cropMention?: {
    name: string;
    vernacularName: string;
    cropCode: string;
    confidence: number;
  };
  urgency: 'immediate' | 'soon' | 'flexible' | 'unknown';
  aspect: 'pest' | 'disease' | 'nutrition' | 'irrigation' | 'growth' | 'harvest' | 'general';
  rawAnalysis: {
    inputText: string;
    language: string;
    wordCount: number;
    hasQuestion: boolean;
    hasEmergencyWords: boolean;
  };
  confidence: number;
}

export interface SymptomMention {
  rawText: string;
  normalizedSymptom: string;
  affectedPart: 'leaf' | 'stem' | 'root' | 'fruit' | 'flower' | 'whole_plant' | 'unknown';
  severity?: 'mild' | 'moderate' | 'severe';
  confidence: number;
}

// SYMPTOM PATTERNS (Multi-language)

interface SymptomPattern {
  patterns: RegExp[];
  normalizedSymptom: string;
  affectedPart: SymptomMention['affectedPart'];
  possibleCauses: string[];
}

const SYMPTOM_PATTERNS: SymptomPattern[] = [
  // Leaf yellowing
  {
    patterns: [
      /पीला|पिवळ|पिल्ल|yellow|yellowing/i,
      /पाने?\s*(पीला|पिवळ)/i,
      /पत्ते?\s*(पीले|पिवळे)/i,
      /पानां?वर\s*पिवळे\s*डाग/i
    ],
    normalizedSymptom: 'LEAF_YELLOWING',
    affectedPart: 'leaf',
    possibleCauses: ['NITROGEN_DEFICIENCY', 'IRON_DEFICIENCY', 'OVERWATERING', 'VIRAL_INFECTION']
  },
  
  // Leaf curling
  {
    patterns: [
      /मुड|मुरडणे|curl|curling|वाक/i,
      /पाने?\s*(मुड|वाक)/i,
      /पत्ते?\s*(मुड|मुरड)/i
    ],
    normalizedSymptom: 'LEAF_CURLING',
    affectedPart: 'leaf',
    possibleCauses: ['APHID_INFESTATION', 'VIRAL_INFECTION', 'HEAT_STRESS', 'THRIPS']
  },
  
  // Spots/patches
  {
    patterns: [
      /डाग|धब्बा|spot|patch|भूरा|काला|brown|black/i,
      /पानांवर\s*(डाग|धब्बे)/i,
      /पत्तों\s*पर\s*(दाग|धब्बे)/i
    ],
    normalizedSymptom: 'LEAF_SPOTS',
    affectedPart: 'leaf',
    possibleCauses: ['FUNGAL_INFECTION', 'BACTERIAL_BLIGHT', 'NUTRIENT_BURN']
  },
  
  // Wilting
  {
    patterns: [
      /मुरझा|सुख|सुकणे|wilt|droop|लटक/i,
      /पौधा?\s*(मुरझा|सुख)/i,
      /झाड\s*(सुक|लटक)/i
    ],
    normalizedSymptom: 'WILTING',
    affectedPart: 'whole_plant',
    possibleCauses: ['WATER_STRESS', 'ROOT_ROT', 'WILT_DISEASE', 'HEAT_STRESS']
  },
  
  // Pest presence
  {
    patterns: [
      /कीड़|किडी|इल्ली|माशी|मावा|aphid|pest|insect|bug/i,
      /कीड़े?\s*(लग|दिख|आ)/i,
      /किडी\s*(लाग|दिस|आल)/i
    ],
    normalizedSymptom: 'PEST_VISIBLE',
    affectedPart: 'unknown',
    possibleCauses: ['APHID_INFESTATION', 'CATERPILLAR', 'WHITEFLY', 'MITES']
  },
  
  // Powdery coating
  {
    patterns: [
      /पाउडर|पांढरा|सफेद|white\s*powder|powdery|भुकटी/i,
      /पांढरी?\s*(पाउडर|भुकटी)/i,
      /सफेद\s*(पाउडर|पर्त)/i
    ],
    normalizedSymptom: 'POWDERY_MILDEW',
    affectedPart: 'leaf',
    possibleCauses: ['POWDERY_MILDEW_FUNGUS']
  },
  
  // Root problems
  {
    patterns: [
      /जड़|मूळ|root|सड|कुजणे|rot/i,
      /जड़\s*(सड|खराब)/i,
      /मूळ\s*(कुज|सड)/i
    ],
    normalizedSymptom: 'ROOT_PROBLEM',
    affectedPart: 'root',
    possibleCauses: ['ROOT_ROT', 'NEMATODES', 'OVERWATERING']
  },
  
  // Stunted growth
  {
    patterns: [
      /बढ़\s*(नहीं|कम)|वाढ\s*(नाही|कमी)|stunted|slow\s*growth/i,
      /छोटा\s*रह|लहान\s*राह/i
    ],
    normalizedSymptom: 'STUNTED_GROWTH',
    affectedPart: 'whole_plant',
    possibleCauses: ['NITROGEN_DEFICIENCY', 'PHOSPHORUS_DEFICIENCY', 'ROOT_BOUND', 'VIRAL_INFECTION']
  },
  
  // Fruit problems
  {
    patterns: [
      /फल|फळ|fruit|टमाटर|बैंगन/i,
      /फल\s*(खराब|सड|गिर)/i,
      /फळ\s*(खराब|कुज|गळ)/i
    ],
    normalizedSymptom: 'FRUIT_PROBLEM',
    affectedPart: 'fruit',
    possibleCauses: ['FRUIT_ROT', 'BORER', 'NUTRIENT_DEFICIENCY', 'BLOSSOM_END_ROT']
  }
];

// INTENT PATTERNS

interface IntentPattern {
  patterns: RegExp[];
  intent: SemanticUnderstanding['primaryIntent'];
  aspect?: SemanticUnderstanding['aspect'];
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Diagnosis intent
  {
    patterns: [
      /क्या\s*(हुआ|है|हो\s*रह)/i,
      /काय\s*(झाल|आहे|होत)/i,
      /what('s|\s+is)\s*(wrong|happening)/i,
      /समस्या|problem|issue|अडचण/i
    ],
    intent: 'diagnosis'
  },
  
  // Treatment intent
  {
    patterns: [
      /कैसे\s*(ठीक|इलाज|उपाय)/i,
      /कसे\s*(बरे|उपाय|इलाज)/i,
      /how\s*(to\s*)?(fix|treat|solve|cure)/i,
      /दवाई|औषध|spray|medicine/i,
      /उपाय|उपचार|treatment/i
    ],
    intent: 'treatment',
    aspect: 'pest'
  },
  
  // Prevention intent
  {
    patterns: [
      /कैसे\s*बचा|कसे\s*टाळ|how\s*to\s*prevent/i,
      /रोकथाम|प्रतिबंध|prevention/i,
      /न\s*हो|होऊ\s*नये|avoid/i
    ],
    intent: 'prevention'
  },
  
  // Scheduling intent
  {
    patterns: [
      /कब|कधी|when/i,
      /समय|वेळ|timing|schedule/i,
      /आज|उद्या|today|tomorrow/i
    ],
    intent: 'scheduling'
  },
  
  // Weather intent
  {
    patterns: [
      /मौसम|हवामान|weather/i,
      /बारिश|पाऊस|rain/i,
      /तापमान|temperature/i
    ],
    intent: 'weather'
  },
  
  // Market intent
  {
    patterns: [
      /भाव|किंमत|price|rate/i,
      /बेचना|विक्री|sell/i,
      /मंडी|market|बाजार/i
    ],
    intent: 'market'
  },
  
  // Greeting
  {
    patterns: [
      /^(नमस्ते|नमस्कार|hello|hi|hey)$/i,
      /^(हाँ|हो|yes|ok|okay)$/i
    ],
    intent: 'greeting'
  }
];

// URGENCY PATTERNS

const URGENCY_PATTERNS = {
  immediate: [
    /तुरंत|लगेच|immediately|urgent|जल्दी|emergency/i,
    /मर\s*रह|मर\s*जा|dying/i,
    /बहुत\s*(खराब|गंभीर)|खूप\s*(वाईट|गंभीर)/i
  ],
  soon: [
    /जल्दी|लवकर|soon|quickly/i,
    /आज|today|उद्या|tomorrow/i
  ]
};

// CROP PATTERNS (Multi-language)

const CROP_PATTERNS: Record<string, { patterns: RegExp[]; code: string }> = {
  'cotton': { patterns: [/कपास|कापूस|cotton|रुई/i], code: 'cotton' },
  'tomato': { patterns: [/टमाटर|टोमॅटो|tomato/i], code: 'tomato' },
  'wheat': { patterns: [/गेहूं|गहू|wheat/i], code: 'wheat' },
  'rice': { patterns: [/धान|चावल|तांदूळ|rice|paddy/i], code: 'rice' },
  'onion': { patterns: [/प्याज|कांदा|onion/i], code: 'onion' },
  'sugarcane': { patterns: [/गन्ना|ऊस|sugarcane/i], code: 'sugarcane' },
  'soybean': { patterns: [/सोयाबीन|सोयाबिन|soybean/i], code: 'soybean' },
  'maize': { patterns: [/मक्का|मका|maize|corn/i], code: 'maize' },
  'groundnut': { patterns: [/मूंगफली|भुईमूग|groundnut|peanut/i], code: 'groundnut' },
  'chilli': { patterns: [/मिर्च|मिरची|chilli|chili/i], code: 'chilli' },
  'brinjal': { patterns: [/बैंगन|वांगी|brinjal|eggplant/i], code: 'brinjal' },
  'potato': { patterns: [/आलू|बटाटा|potato/i], code: 'potato' },
  'gram': { patterns: [/चना|हरभरा|gram|chickpea/i], code: 'gram' },
  'turmeric': { patterns: [/हल्दी|हळद|turmeric/i], code: 'turmeric' },
  'banana': { patterns: [/केला|केळ|banana/i], code: 'banana' }
};

// MAIN UNDERSTANDING FUNCTION

export function parseSemanticUnderstanding(
  rawInput: string,
  language: string = 'hi'
): SemanticUnderstanding {
  const text = rawInput.trim();
  const wordCount = text.split(/\s+/).length;
  
  // 1. Detect symptoms
  const symptoms: SymptomMention[] = [];
  for (const pattern of SYMPTOM_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = text.match(regex);
      if (match) {
        symptoms.push({
          rawText: match[0],
          normalizedSymptom: pattern.normalizedSymptom,
          affectedPart: pattern.affectedPart,
          confidence: 0.8
        });
        break; // Only add once per pattern
      }
    }
  }
  
  // 2. Detect primary intent
  let primaryIntent: SemanticUnderstanding['primaryIntent'] = 'unknown';
  let aspect: SemanticUnderstanding['aspect'] = 'general';
  
  for (const intentPattern of INTENT_PATTERNS) {
    for (const regex of intentPattern.patterns) {
      if (regex.test(text)) {
        primaryIntent = intentPattern.intent;
        if (intentPattern.aspect) {
          aspect = intentPattern.aspect;
        }
        break;
      }
    }
    if (primaryIntent !== 'unknown') break;
  }
  
  // If symptoms found but no intent, assume diagnosis
  if (symptoms.length > 0 && primaryIntent === 'unknown') {
    primaryIntent = 'diagnosis';
  }
  
  // 3. Detect urgency
  let urgency: SemanticUnderstanding['urgency'] = 'unknown';
  for (const pattern of URGENCY_PATTERNS.immediate) {
    if (pattern.test(text)) {
      urgency = 'immediate';
      break;
    }
  }
  if (urgency === 'unknown') {
    for (const pattern of URGENCY_PATTERNS.soon) {
      if (pattern.test(text)) {
        urgency = 'soon';
        break;
      }
    }
  }
  if (urgency === 'unknown') {
    urgency = 'flexible';
  }
  
  // 4. Detect crop
  let cropMention: SemanticUnderstanding['cropMention'] | undefined;
  for (const [cropName, cropInfo] of Object.entries(CROP_PATTERNS)) {
    for (const pattern of cropInfo.patterns) {
      const match = text.match(pattern);
      if (match) {
        cropMention = {
          name: cropName,
          vernacularName: match[0],
          cropCode: cropInfo.code,
          confidence: 0.9
        };
        break;
      }
    }
    if (cropMention) break;
  }
  
  // 5. Determine aspect from symptoms
  if (aspect === 'general' && symptoms.length > 0) {
    const firstSymptom = symptoms[0];
    if (firstSymptom.normalizedSymptom.includes('PEST') || 
        firstSymptom.normalizedSymptom === 'LEAF_CURLING') {
      aspect = 'pest';
    } else if (firstSymptom.normalizedSymptom.includes('MILDEW') || 
               firstSymptom.normalizedSymptom.includes('SPOTS') ||
               firstSymptom.normalizedSymptom.includes('ROT')) {
      aspect = 'disease';
    } else if (firstSymptom.normalizedSymptom === 'STUNTED_GROWTH' ||
               firstSymptom.normalizedSymptom === 'LEAF_YELLOWING') {
      aspect = 'nutrition';
    }
  }
  
  // 6. Calculate confidence
  let confidence = 0.5;
  if (symptoms.length > 0) confidence += 0.2;
  if (primaryIntent !== 'unknown') confidence += 0.15;
  if (cropMention) confidence += 0.1;
  if (wordCount >= 3) confidence += 0.05;
  confidence = Math.min(confidence, 1.0);
  
  return {
    primaryIntent,
    symptoms,
    cropMention,
    urgency,
    aspect,
    rawAnalysis: {
      inputText: text,
      language,
      wordCount,
      hasQuestion: /\?|क्या|कैसे|कब|काय|कसे|कधी/.test(text),
      hasEmergencyWords: urgency === 'immediate'
    },
    confidence
  };
}

// CONVERT TO CANONICAL STRUCTURED MEANING

export interface StructuredMeaning {
  queryType: 'PEST_QUERY' | 'DISEASE_QUERY' | 'FERTILIZER_QUERY' | 'IRRIGATION_QUERY' | 
             'SCHEDULE_QUERY' | 'WEATHER_QUERY' | 'MARKET_QUERY' | 'GENERAL_QUERY';
  
  problemCategory?: 'pest' | 'disease' | 'nutrient' | 'water' | 'environmental';
  
  detectedSymptoms: string[];  // Canonical symptom codes
  
  cropCode?: string;
  
  urgencyLevel: 'IMMEDIATE' | 'WITHIN_24_HOURS' | 'WITHIN_3_DAYS' | 'WITHIN_1_WEEK' | 'FLEXIBLE';
  
  requiresPhoto: boolean;
  
  confidenceScore: number;
}

export function extractStructuredMeaning(
  understanding: SemanticUnderstanding
): StructuredMeaning {
  // Map intent to query type
  const intentToQueryType: Record<string, StructuredMeaning['queryType']> = {
    'diagnosis': 'PEST_QUERY',
    'treatment': 'PEST_QUERY',
    'prevention': 'DISEASE_QUERY',
    'general_advice': 'GENERAL_QUERY',
    'scheduling': 'SCHEDULE_QUERY',
    'weather': 'WEATHER_QUERY',
    'market': 'MARKET_QUERY',
    'greeting': 'GENERAL_QUERY',
    'unknown': 'GENERAL_QUERY'
  };
  
  let queryType = intentToQueryType[understanding.primaryIntent] || 'GENERAL_QUERY';
  
  // Refine query type based on aspect
  if (understanding.aspect === 'disease') {
    queryType = 'DISEASE_QUERY';
  } else if (understanding.aspect === 'nutrition') {
    queryType = 'FERTILIZER_QUERY';
  } else if (understanding.aspect === 'irrigation') {
    queryType = 'IRRIGATION_QUERY';
  }
  
  // Map urgency
  const urgencyMap: Record<string, StructuredMeaning['urgencyLevel']> = {
    'immediate': 'IMMEDIATE',
    'soon': 'WITHIN_24_HOURS',
    'flexible': 'WITHIN_1_WEEK',
    'unknown': 'FLEXIBLE'
  };
  
  // Determine problem category
  let problemCategory: StructuredMeaning['problemCategory'] | undefined;
  if (understanding.aspect === 'pest') {
    problemCategory = 'pest';
  } else if (understanding.aspect === 'disease') {
    problemCategory = 'disease';
  } else if (understanding.aspect === 'nutrition') {
    problemCategory = 'nutrient';
  } else if (understanding.aspect === 'irrigation') {
    problemCategory = 'water';
  }
  
  // Check if photo is needed (symptoms but low confidence)
  const requiresPhoto = understanding.symptoms.length > 0 && 
                        understanding.confidence < 0.7;
  
  return {
    queryType,
    problemCategory,
    detectedSymptoms: understanding.symptoms.map(s => s.normalizedSymptom),
    cropCode: understanding.cropMention?.cropCode,
    urgencyLevel: urgencyMap[understanding.urgency],
    requiresPhoto,
    confidenceScore: understanding.confidence
  };
}
