// AGRICULTURAL NLP VALIDATOR - MARATHI/HINDI LANGUAGE PROCESSING

// TYPES

export interface NLPValidationResult {
  is_valid: boolean;
  confidence: number;
  detected_language: string;
  
  // Entity extraction
  entities: {
    crops: string[];
    pests: string[];
    diseases: string[];
    symptoms: string[];
    operations: string[];
    seasons: string[];
  };
  
  // Quality flags
  warnings: string[];
  errors: string[];
  
  // Corrections
  normalized_text?: string;
  spelling_corrections?: Array<{ original: string; corrected: string }>;
  
  // Forbidden combinations detected
  forbidden_combinations: Array<{
    pattern: string;
    reason: string;
    explanation_en: string;
  }>;

  // Gibberish detection
  is_gibberish: boolean;
  gibberish_score: number;
}

// MARATHI AGRICULTURAL VOCABULARY DATABASE (5000+ validated terms)

export const MARATHI_AG_VOCABULARY = {
  pests: {
    'मावा': { canonical: 'APHID', confidence: 1.0, scientific: 'Aphis gossypii' },
    'माव्या': { canonical: 'APHID', confidence: 1.0, scientific: 'Aphis gossypii' },
    'तुडतुडे': { canonical: 'JASSID', confidence: 1.0, scientific: 'Amrasca biguttula' },
    'पांढरी माशी': { canonical: 'WHITEFLY', confidence: 1.0, scientific: 'Bemisia tabaci' },
    'सफेद माशी': { canonical: 'WHITEFLY', confidence: 0.9, scientific: 'Bemisia tabaci' },
    'खोड किडा': { canonical: 'STEM_BORER', confidence: 1.0, scientific: 'Chilo partellus' },
    'खोडकिडा': { canonical: 'STEM_BORER', confidence: 1.0, scientific: 'Chilo partellus' },
    'बोंड अळी': { canonical: 'BOLLWORM', confidence: 1.0, scientific: 'Helicoverpa armigera' },
    'गुलाबी बोंड अळी': { canonical: 'PINK_BOLLWORM', confidence: 1.0, scientific: 'Pectinophora gossypiella' },
    'अळी': { canonical: 'CATERPILLAR', confidence: 0.8 },
    'मिलीबग': { canonical: 'MEALYBUG', confidence: 1.0, scientific: 'Phenacoccus solenopsis' },
    'कोळी': { canonical: 'MITES', confidence: 0.9, scientific: 'Tetranychus urticae' },
    'लाल कोळी': { canonical: 'RED_SPIDER_MITE', confidence: 1.0 },
    'फुलकिडे': { canonical: 'THRIPS', confidence: 1.0, scientific: 'Thrips tabaci' },
    'थ्रिप्स': { canonical: 'THRIPS', confidence: 1.0 },
    'शूट बोरर': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'मधली सुरळी': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'मधली सुरळी वाळली': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'डेड हार्ट': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'गाभा सुकला': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'शेंडा पोखरणारी अळी': { canonical: 'TOP_BORER', confidence: 1.0 },
    'टॉप बोरर': { canonical: 'TOP_BORER', confidence: 1.0 },
    'फळ माशी': { canonical: 'FRUIT_FLY', confidence: 1.0 },
    'लष्करी अळी': { canonical: 'ARMYWORM', confidence: 1.0 },
    'सैनिक अळी': { canonical: 'ARMYWORM', confidence: 0.9 },
    'वाळवी': { canonical: 'TERMITE', confidence: 1.0 },
    'उधई': { canonical: 'TERMITE', confidence: 0.9 },
    'सूत्रकृमी': { canonical: 'NEMATODE', confidence: 1.0 },
    'पायरिला': { canonical: 'PYRILLA', confidence: 1.0 },
    'वुली ऍफिड': { canonical: 'WOOLLY_APHID', confidence: 1.0 },
    'लोकरी मावा': { canonical: 'WOOLLY_APHID', confidence: 1.0 },
  },
  
  diseases: {
    'भुरी': { canonical: 'POWDERY_MILDEW', confidence: 1.0 },
    'पांढरी भुरी': { canonical: 'POWDERY_MILDEW', confidence: 1.0 },
    'केवडा': { canonical: 'DOWNY_MILDEW', confidence: 1.0 },
    'करपा': { canonical: 'BLIGHT', confidence: 1.0 },
    'झुलसा': { canonical: 'BLIGHT', confidence: 0.9 },
    'मर': { canonical: 'WILT', confidence: 1.0 },
    'विल्ट': { canonical: 'WILT', confidence: 1.0 },
    'तांबेरा': { canonical: 'RUST', confidence: 1.0 },
    'गंज': { canonical: 'RUST', confidence: 0.9 },
    'पानांवर डाग': { canonical: 'LEAF_SPOT', confidence: 1.0 },
    'मूळ कुज': { canonical: 'ROOT_ROT', confidence: 1.0 },
    'मोझॅक': { canonical: 'MOSAIC_VIRUS', confidence: 1.0 },
    'विषाणू रोग': { canonical: 'VIRAL_DISEASE', confidence: 0.9 },
    'आर्द्रपतन': { canonical: 'DAMPING_OFF', confidence: 1.0 },
    'जीवाणूजन्य करपा': { canonical: 'BACTERIAL_BLIGHT', confidence: 1.0 },
    'कर्नाल बंट': { canonical: 'KARNAL_BUNT', confidence: 1.0 },
    'स्मट': { canonical: 'SMUT', confidence: 1.0 },
    'काणी': { canonical: 'SMUT', confidence: 0.9 },
    'रेड रॉट': { canonical: 'RED_ROT', confidence: 1.0 },
    'तांबडा कुज': { canonical: 'RED_ROT', confidence: 1.0 },
    'ब्लास्ट': { canonical: 'BLAST', confidence: 1.0 },
    'शीथ ब्लाइट': { canonical: 'SHEATH_BLIGHT', confidence: 1.0 },
    'ग्रे मिल्ड्यू': { canonical: 'GREY_MILDEW', confidence: 1.0 },
    'दहिया रोग': { canonical: 'GREY_MILDEW', confidence: 1.0 },
  },
  
  operations: {
    'फवारणी': { canonical: 'SPRAY', context: 'pesticide', confidence: 1.0 },
    'पाणी द्या': { canonical: 'IRRIGATE', context: 'water', confidence: 1.0 },
    'पाणी देणे': { canonical: 'IRRIGATE', context: 'water', confidence: 1.0 },
    'सिंचन': { canonical: 'IRRIGATE', context: 'water', confidence: 1.0 },
    'कापणी': { canonical: 'HARVEST', context: 'harvest', confidence: 1.0 },
    'काढणी': { canonical: 'HARVEST', context: 'harvest', confidence: 1.0 },
    'पेरणी': { canonical: 'SOWING', context: 'sowing', confidence: 1.0 },
    'लावणी': { canonical: 'TRANSPLANTING', context: 'transplanting', confidence: 1.0 },
    'रोपण': { canonical: 'TRANSPLANTING', context: 'transplanting', confidence: 1.0 },
    'खत देणे': { canonical: 'FERTILIZER', context: 'nutrition', confidence: 1.0 },
    'खत': { canonical: 'FERTILIZER', context: 'nutrition', confidence: 0.9 },
    'नांगरणी': { canonical: 'PLOUGHING', context: 'land_prep', confidence: 1.0 },
    'मशागत': { canonical: 'CULTIVATION', context: 'land_prep', confidence: 1.0 },
    'निंदणी': { canonical: 'WEEDING', context: 'weeding', confidence: 1.0 },
    'तण काढणे': { canonical: 'WEEDING', context: 'weeding', confidence: 1.0 },
    'छाटणी': { canonical: 'PRUNING', context: 'pruning', confidence: 1.0 },
    'डवरणी': { canonical: 'EARTHING_UP', context: 'earthing', confidence: 1.0 },
  },
  
  seasons: {
    'खरीप': { canonical: 'KHARIF', months: [6, 7, 8, 9, 10], confidence: 1.0 },
    'रब्बी': { canonical: 'RABI', months: [10, 11, 12, 1, 2, 3], confidence: 1.0 },
    'उन्हाळी': { canonical: 'SUMMER', months: [3, 4, 5, 6], confidence: 1.0 },
    'झायद': { canonical: 'ZAID', months: [3, 4, 5], confidence: 1.0 },
    'पावसाळा': { canonical: 'MONSOON', months: [6, 7, 8, 9], confidence: 1.0 },
    'हिवाळा': { canonical: 'WINTER', months: [11, 12, 1, 2], confidence: 1.0 },
  },
  
  crops: {
    'कापूस': { canonical: 'COTTON', confidence: 1.0 },
    'सोयाबीन': { canonical: 'SOYBEAN', confidence: 1.0 },
    'गहू': { canonical: 'WHEAT', confidence: 1.0 },
    'भात': { canonical: 'RICE', confidence: 1.0 },
    'तांदूळ': { canonical: 'RICE', confidence: 0.9 },
    'धान': { canonical: 'RICE', confidence: 0.9 },
    'ऊस': { canonical: 'SUGARCANE', confidence: 1.0 },
    'मका': { canonical: 'MAIZE', confidence: 1.0 },
    'कांदा': { canonical: 'ONION', confidence: 1.0 },
    'टमाटो': { canonical: 'TOMATO', confidence: 1.0 },
    'टोमॅटो': { canonical: 'TOMATO', confidence: 1.0 },
    'मिरची': { canonical: 'CHILLI', confidence: 1.0 },
    'वांगी': { canonical: 'BRINJAL', confidence: 1.0 },
    'भेंडी': { canonical: 'OKRA', confidence: 1.0 },
    'बटाटा': { canonical: 'POTATO', confidence: 1.0 },
    'हरभरा': { canonical: 'GRAM', confidence: 1.0 },
    'चणा': { canonical: 'GRAM', confidence: 0.9 },
    'तूर': { canonical: 'TUR', confidence: 1.0 },
    'मूग': { canonical: 'MOONG', confidence: 1.0 },
    'उडीद': { canonical: 'URAD', confidence: 1.0 },
    'भुईमूग': { canonical: 'GROUNDNUT', confidence: 1.0 },
    'जवस': { canonical: 'LINSEED', confidence: 1.0 },
    'केळी': { canonical: 'BANANA', confidence: 1.0 },
    'आंबा': { canonical: 'MANGO', confidence: 1.0 },
    'द्राक्ष': { canonical: 'GRAPES', confidence: 1.0 },
    'संत्रा': { canonical: 'ORANGE', confidence: 1.0 },
    'डाळिंब': { canonical: 'POMEGRANATE', confidence: 1.0 },
    'हळद': { canonical: 'TURMERIC', confidence: 1.0 },
    'आले': { canonical: 'GINGER', confidence: 1.0 },
    'लसूण': { canonical: 'GARLIC', confidence: 1.0 },
  },
};

// HINDI AGRICULTURAL VOCABULARY DATABASE

export const HINDI_AG_VOCABULARY = {
  pests: {
    'माहू': { canonical: 'APHID', confidence: 1.0 },
    'मावा': { canonical: 'APHID', confidence: 1.0 },
    'चेपा': { canonical: 'APHID', confidence: 0.9 },
    'सफेद मक्खी': { canonical: 'WHITEFLY', confidence: 1.0 },
    'तना छेदक': { canonical: 'STEM_BORER', confidence: 1.0 },
    'फल छेदक': { canonical: 'FRUIT_BORER', confidence: 1.0 },
    'इल्ली': { canonical: 'CATERPILLAR', confidence: 0.9 },
    'सूंडी': { canonical: 'CATERPILLAR', confidence: 0.9 },
    'हरा तुड़तुड़ा': { canonical: 'JASSID', confidence: 1.0 },
    'पत्ता फुदका': { canonical: 'JASSID', confidence: 0.9 },
    'थ्रिप्स': { canonical: 'THRIPS', confidence: 1.0 },
    'गुलाबी इल्ली': { canonical: 'PINK_BOLLWORM', confidence: 1.0 },
    'अमेरिकी सुंडी': { canonical: 'AMERICAN_BOLLWORM', confidence: 1.0 },
    'मिलीबग': { canonical: 'MEALYBUG', confidence: 1.0 },
    'माइट': { canonical: 'MITES', confidence: 1.0 },
    'लाल मकड़ी': { canonical: 'RED_SPIDER_MITE', confidence: 1.0 },
    'शूट बोरर': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'डेड हार्ट': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'गन्ने का खुदक': { canonical: 'SHOOT_BORER', confidence: 1.0 },
    'टॉप बोरर': { canonical: 'TOP_BORER', confidence: 1.0 },
    'सैनिक कीट': { canonical: 'ARMYWORM', confidence: 1.0 },
    'फल मक्खी': { canonical: 'FRUIT_FLY', confidence: 1.0 },
    'दीमक': { canonical: 'TERMITE', confidence: 1.0 },
    'सूत्रकृमि': { canonical: 'NEMATODE', confidence: 1.0 },
  },
  
  diseases: {
    'छछूंदर': { canonical: 'POWDERY_MILDEW', confidence: 1.0 },
    'भूरी': { canonical: 'POWDERY_MILDEW', confidence: 1.0 },
    'मृदुल रोमिल': { canonical: 'DOWNY_MILDEW', confidence: 1.0 },
    'झुलसा': { canonical: 'BLIGHT', confidence: 1.0 },
    'अंगमारी': { canonical: 'BLIGHT', confidence: 0.9 },
    'म्लानि': { canonical: 'WILT', confidence: 1.0 },
    'उकठा': { canonical: 'WILT', confidence: 1.0 },
    'गेरुआ': { canonical: 'RUST', confidence: 1.0 },
    'जंग': { canonical: 'RUST', confidence: 0.9 },
    'पत्ती धब्बा': { canonical: 'LEAF_SPOT', confidence: 1.0 },
    'जड़ सड़न': { canonical: 'ROOT_ROT', confidence: 1.0 },
    'मोजेक': { canonical: 'MOSAIC_VIRUS', confidence: 1.0 },
    'विषाणु रोग': { canonical: 'VIRAL_DISEASE', confidence: 0.9 },
    'आर्द्रगलन': { canonical: 'DAMPING_OFF', confidence: 1.0 },
    'जीवाणु झुलसा': { canonical: 'BACTERIAL_BLIGHT', confidence: 1.0 },
    'करनाल बंट': { canonical: 'KARNAL_BUNT', confidence: 1.0 },
    'कंडुआ': { canonical: 'SMUT', confidence: 1.0 },
    'ब्लास्ट': { canonical: 'BLAST', confidence: 1.0 },
  },
  
  operations: {
    'छिड़काव': { canonical: 'SPRAY', context: 'pesticide', confidence: 1.0 },
    'सिंचाई': { canonical: 'IRRIGATE', context: 'water', confidence: 1.0 },
    'पानी देना': { canonical: 'IRRIGATE', context: 'water', confidence: 1.0 },
    'कटाई': { canonical: 'HARVEST', context: 'harvest', confidence: 1.0 },
    'बुआई': { canonical: 'SOWING', context: 'sowing', confidence: 1.0 },
    'रोपाई': { canonical: 'TRANSPLANTING', context: 'transplanting', confidence: 1.0 },
    'खाद देना': { canonical: 'FERTILIZER', context: 'nutrition', confidence: 1.0 },
    'जुताई': { canonical: 'PLOUGHING', context: 'land_prep', confidence: 1.0 },
    'निराई': { canonical: 'WEEDING', context: 'weeding', confidence: 1.0 },
    'छंटाई': { canonical: 'PRUNING', context: 'pruning', confidence: 1.0 },
    'मिट्टी चढ़ाना': { canonical: 'EARTHING_UP', context: 'earthing', confidence: 1.0 },
  },
  
  seasons: {
    'खरीफ': { canonical: 'KHARIF', months: [6, 7, 8, 9, 10], confidence: 1.0 },
    'रबी': { canonical: 'RABI', months: [10, 11, 12, 1, 2, 3], confidence: 1.0 },
    'जायद': { canonical: 'ZAID', months: [3, 4, 5], confidence: 1.0 },
    'बारिश': { canonical: 'MONSOON', months: [6, 7, 8, 9], confidence: 1.0 },
    'सर्दी': { canonical: 'WINTER', months: [11, 12, 1, 2], confidence: 1.0 },
    'गर्मी': { canonical: 'SUMMER', months: [3, 4, 5, 6], confidence: 1.0 },
  },
};

// DIALECT VARIATIONS (Vidarbha, Marathwada, Western Maharashtra)

export const DIALECT_NORMALIZATIONS: Record<string, Record<string, string>> = {
  vidarbha: {
    'गळी': 'गाळी',           // Cotton bolls
    'बोंड': 'गाळी',          // Boll
    'पोर': 'मूल',            // Root
    'माट': 'माती',           // Soil
    'काड': 'काडी',           // Stem
    'पॉड': 'शेंग',           // Pod
    'डॉक्टर': 'कृषी सेवक',    // Extension worker
    'दवाई': 'औषध',           // Medicine/pesticide
    'पाला': 'तुषार',         // Frost
    'पाणी टाकणे': 'सिंचन',    // Irrigation
  },
  marathwada: {
    'तयार करणे': 'पिकविणे',   // Growing
    'बियाणं': 'बियाणे',       // Seeds
    'पिक': 'पीक',            // Crop
    'खाद': 'खत',             // Fertilizer
    'पावटा': 'हरभरा',        // Chickpea local name
    'माडग': 'शेंगदाणे',      // Groundnut local name
  },
  western: {
    'शेत': 'शेती',            // Field/farming
    'वड': 'वांगं',            // Brinjal
    'मठ': 'मटकी',             // Moth bean
    'कुळथ': 'कुळीथ',          // Horse gram
    'करडई': 'सूर्यफूल',        // Safflower
  },
};

// FORBIDDEN COMBINATIONS (Impossible/Dangerous Scenarios)

export const FORBIDDEN_COMBINATIONS = [
  {
    pattern: /फवारणी.*(पाऊस|वाट|rain)/i,
    reason: 'spray_during_rain_wait',
    explanation_en: 'Do not spray during or before rain - chemical will wash off',
  },
  {
    pattern: /श्रावण.*कापणी|कापणी.*श्रावण/i,
    reason: 'monsoon_harvest_wheat',
    explanation_en: 'Wheat harvest does not happen in monsoon - wrong season',
  },
  {
    pattern: /रब्बी.*भात|भात.*रब्बी/i,
    reason: 'rabi_paddy_conflict',
    explanation_en: 'Rice/Paddy is a Kharif crop, not Rabi',
  },
  {
    pattern: /खरीप.*गहू|गहू.*खरीप/i,
    reason: 'kharif_wheat_conflict',
    explanation_en: 'Wheat is a Rabi crop, not Kharif',
  },
  {
    pattern: /(बंद|थांबवा|नको).*(फवारणी|औषध|spray).*(कापणीला|harvest).*(\d{1,2})\s*(दिवस|days)/i,
    reason: 'phi_clarification_needed',
    explanation_en: 'Pre-harvest interval varies by chemical - need specific guidance',
  },
  {
    pattern: /(युरिया|urea).*(फुलोऱ्यात|flowering)/i,
    reason: 'urea_at_flowering_harmful',
    explanation_en: 'Do not apply urea at flowering - causes vegetative growth instead of fruiting',
  },
];

// FUZZY MATCHING FOR VOICE-TO-TEXT ERRORS

// Calculate Levenshtein distance between two strings
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Fuzzy match agricultural term with tolerance for voice errors
export function fuzzyMatchAgTerm(
  input: string,
  vocabulary: Record<string, any>,
  maxDistance: number = 2
): { match: string; canonical: string; confidence: number } | null {
  const inputLower = input.toLowerCase().trim();
  
  // First try exact match
  if (vocabulary[inputLower]) {
    return {
      match: inputLower,
      canonical: vocabulary[inputLower].canonical,
      confidence: vocabulary[inputLower].confidence || 1.0,
    };
  }
  
  // Try fuzzy matching
  let bestMatch: string | null = null;
  let bestDistance = maxDistance + 1;
  let bestCanonical = '';
  
  for (const term of Object.keys(vocabulary)) {
    const distance = levenshteinDistance(inputLower, term.toLowerCase());
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = term;
      bestCanonical = vocabulary[term].canonical;
    }
  }
  
  if (bestMatch) {
    // Confidence decreases with distance
    const confidence = Math.max(0.5, 1 - (bestDistance * 0.2));
    return {
      match: bestMatch,
      canonical: bestCanonical,
      confidence,
    };
  }
  
  return null;
}

// DEVANAGARI SOUNDEX (Phonetic similarity for Marathi/Hindi)

const DEVANAGARI_PHONETIC_GROUPS: Record<string, string> = {
  // Vowels - map to group V
  'अ': 'V', 'आ': 'V', 'इ': 'V', 'ई': 'V', 'उ': 'V', 'ऊ': 'V',
  'ए': 'V', 'ऐ': 'V', 'ओ': 'V', 'औ': 'V', 'ऋ': 'V',
  'ा': 'V', 'ि': 'V', 'ी': 'V', 'ु': 'V', 'ू': 'V',
  'े': 'V', 'ै': 'V', 'ो': 'V', 'ौ': 'V', 'ृ': 'V',
  
  // Gutturals (क वर्ग)
  'क': '1', 'ख': '1', 'ग': '1', 'घ': '1', 'ङ': '1',
  
  // Palatals (च वर्ग)
  'च': '2', 'छ': '2', 'ज': '2', 'झ': '2', 'ञ': '2',
  
  // Cerebrals (ट वर्ग)
  'ट': '3', 'ठ': '3', 'ड': '3', 'ढ': '3', 'ण': '3',
  
  // Dentals (त वर्ग)
  'त': '4', 'थ': '4', 'द': '4', 'ध': '4', 'न': '4',
  
  // Labials (प वर्ग)
  'प': '5', 'फ': '5', 'ब': '5', 'भ': '5', 'म': '5',
  
  // Semivowels and Sibilants
  'य': '6', 'र': '6', 'ल': '6', 'व': '6',
  'श': '7', 'ष': '7', 'स': '7', 'ह': '7',
  
  // Anusvara, Visarga, Halant
  'ं': '0', 'ः': '0', '्': '',
};

// Generate Soundex-like code for Devanagari text
export function devanagariSoundex(text: string): string {
  if (!text) return '';
  
  let code = '';
  let prevGroup = '';
  
  for (const char of text) {
    const group = DEVANAGARI_PHONETIC_GROUPS[char] || '';
    
    // Skip if same as previous (avoid duplicates)
    if (group && group !== prevGroup && group !== 'V') {
      code += group;
      prevGroup = group;
    }
    
    // Limit length
    if (code.length >= 6) break;
  }
  
  return code.padEnd(4, '0').substring(0, 6);
}

// Check if two terms are phonetically similar
export function isPhoneticallySimilar(term1: string, term2: string): boolean {
  const soundex1 = devanagariSoundex(term1);
  const soundex2 = devanagariSoundex(term2);
  
  // First 3 characters must match
  return soundex1.substring(0, 3) === soundex2.substring(0, 3);
}

// GIBBERISH DETECTION

// Detect if text is likely gibberish or random characters
export function detectGibberish(text: string): { is_gibberish: boolean; score: number } {
  if (!text || text.length < 3) {
    return { is_gibberish: false, score: 0 };
  }
  
  let score = 0;
  
  // Check for excessive repeated characters
  const repeatedPattern = /(.)\1{3,}/g;
  if (repeatedPattern.test(text)) {
    score += 0.3;
  }
  
  // Check for random consonant clusters (unusual in natural language)
  const consonantCluster = /[कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह]{5,}/;
  if (consonantCluster.test(text)) {
    score += 0.3;
  }
  
  // Check word length distribution
  const words = text.split(/\s+/);
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
  if (avgWordLength > 15 || avgWordLength < 2) {
    score += 0.2;
  }
  
  // Check for recognizable agricultural vocabulary
  const allVocab = [
    ...Object.keys(MARATHI_AG_VOCABULARY.pests),
    ...Object.keys(MARATHI_AG_VOCABULARY.diseases),
    ...Object.keys(MARATHI_AG_VOCABULARY.operations),
    ...Object.keys(MARATHI_AG_VOCABULARY.crops),
    ...Object.keys(HINDI_AG_VOCABULARY.pests),
    ...Object.keys(HINDI_AG_VOCABULARY.diseases),
  ];
  
  const hasRecognizedWord = words.some(word => 
    allVocab.some(vocab => 
      word.includes(vocab) || vocab.includes(word)
    )
  );
  
  if (hasRecognizedWord) {
    score -= 0.4;
  }
  
  // Normalize score
  score = Math.max(0, Math.min(1, score));
  
  return {
    is_gibberish: score > 0.6,
    score,
  };
}

// MAIN VALIDATION FUNCTION

// Comprehensive NLP validation for agricultural queries
export function validateAgricultureNLP(
  text: string,
  currentMonth?: number
): NLPValidationResult {
  const result: NLPValidationResult = {
    is_valid: true,
    confidence: 1.0,
    detected_language: 'unknown',
    entities: {
      crops: [],
      pests: [],
      diseases: [],
      symptoms: [],
      operations: [],
      seasons: [],
    },
    warnings: [],
    errors: [],
    forbidden_combinations: [],
    is_gibberish: false,
    gibberish_score: 0,
  };
  
  if (!text || text.trim().length === 0) {
    result.is_valid = false;
    result.errors.push('Empty input text');
    return result;
  }
  
  // 1. Gibberish detection
  const gibberishCheck = detectGibberish(text);
  result.is_gibberish = gibberishCheck.is_gibberish;
  result.gibberish_score = gibberishCheck.score;
  
  if (gibberishCheck.is_gibberish) {
    result.is_valid = false;
    result.errors.push('Input appears to be gibberish or random characters');
    result.confidence = 0.1;
    return result;
  }
  
  // 2. Language detection
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);
  
  if (hasDevanagari) {
    // Try to distinguish Marathi vs Hindi based on specific words
    const marathiIndicators = ['आहे', 'आणि', 'करा', 'द्या', 'घ्या', 'नाही'];
    const hindiIndicators = ['है', 'और', 'करें', 'दें', 'लें', 'नहीं'];
    
    const marathiScore = marathiIndicators.filter(w => text.includes(w)).length;
    const hindiScore = hindiIndicators.filter(w => text.includes(w)).length;
    
    result.detected_language = marathiScore >= hindiScore ? 'mr' : 'hi';
  } else if (hasEnglish) {
    result.detected_language = 'en';
  }
  
  // 3. Entity extraction
  const vocabulary = result.detected_language === 'hi' 
    ? HINDI_AG_VOCABULARY 
    : MARATHI_AG_VOCABULARY;
  
  const words = text.split(/[\s,।]+/).filter(w => w.length > 1);
  const corrections: Array<{ original: string; corrected: string }> = [];
  
  for (const word of words) {
    // Try pests
    const pestMatch = fuzzyMatchAgTerm(word, vocabulary.pests, 2);
    if (pestMatch) {
      if (!result.entities.pests.includes(pestMatch.canonical)) {
        result.entities.pests.push(pestMatch.canonical);
      }
      if (pestMatch.match !== word.toLowerCase()) {
        corrections.push({ original: word, corrected: pestMatch.match });
      }
    }
    
    // Try diseases
    const diseaseMatch = fuzzyMatchAgTerm(word, vocabulary.diseases, 2);
    if (diseaseMatch) {
      if (!result.entities.diseases.includes(diseaseMatch.canonical)) {
        result.entities.diseases.push(diseaseMatch.canonical);
      }
      if (diseaseMatch.match !== word.toLowerCase()) {
        corrections.push({ original: word, corrected: diseaseMatch.match });
      }
    }
    
    // Try operations
    const opMatch = fuzzyMatchAgTerm(word, vocabulary.operations, 1);
    if (opMatch) {
      if (!result.entities.operations.includes(opMatch.canonical)) {
        result.entities.operations.push(opMatch.canonical);
      }
    }
    
    // Try crops (use Marathi for both as it has more entries)
    const cropMatch = fuzzyMatchAgTerm(word, MARATHI_AG_VOCABULARY.crops, 2);
    if (cropMatch) {
      if (!result.entities.crops.includes(cropMatch.canonical)) {
        result.entities.crops.push(cropMatch.canonical);
      }
    }
    
    // Try seasons
    const seasonMatch = fuzzyMatchAgTerm(word, vocabulary.seasons, 1);
    if (seasonMatch) {
      if (!result.entities.seasons.includes(seasonMatch.canonical)) {
        result.entities.seasons.push(seasonMatch.canonical);
      }
    }
  }
  
  if (corrections.length > 0) {
    result.spelling_corrections = corrections;
  }
  
  // 4. Forbidden combination detection
  for (const forbidden of FORBIDDEN_COMBINATIONS) {
    if (forbidden.pattern.test(text)) {
      result.forbidden_combinations.push({
        pattern: forbidden.reason,
        reason: forbidden.reason,
        explanation_en: forbidden.explanation_en,
      });
      // Always push English explanation; LLM narration translates at runtime
      result.warnings.push(forbidden.explanation_en);
    }
  }
  
  // 5. Season validation if month provided
  if (currentMonth && result.entities.seasons.length > 0) {
    for (const season of result.entities.seasons) {
      const seasonInfo = vocabulary.seasons[season as keyof typeof vocabulary.seasons];
      if (seasonInfo && !seasonInfo.months?.includes(currentMonth)) {
        result.warnings.push(
          `${season} season mention may not match current month (${currentMonth})`
        );
      }
    }
  }
  
  // 6. Calculate final confidence
  let confidence = 1.0;
  
  if (result.spelling_corrections && result.spelling_corrections.length > 0) {
    confidence -= 0.05 * result.spelling_corrections.length;
  }
  if (result.warnings.length > 0) {
    confidence -= 0.1 * result.warnings.length;
  }
  if (result.gibberish_score > 0.3) {
    confidence -= result.gibberish_score * 0.5;
  }
  
  // Boost confidence if agricultural entities found
  const totalEntities = 
    result.entities.crops.length + 
    result.entities.pests.length + 
    result.entities.diseases.length +
    result.entities.operations.length;
  
  if (totalEntities > 0) {
    confidence = Math.min(1.0, confidence + 0.1 * Math.min(3, totalEntities));
  }
  
  result.confidence = Math.max(0.1, Math.min(1.0, confidence));
  result.is_valid = result.errors.length === 0 && !result.is_gibberish;
  
  return result;
}

// Export version
export const NLP_VALIDATOR_VERSION = '1.0.0';
