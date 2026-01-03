/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION GENERATOR - Farmer-Friendly Options & Photo Requests
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Generates smart clarification responses with:
 * - Max 3 simple, farmer-friendly options
 * - Optional photo request when visual evidence helps
 * - Single question OR options OR photo request (never all together)
 */

export interface ClarificationInput {
  language: 'mr' | 'hi' | 'en';
  farmer_message: string;
  observations: string[];
  crop_code?: string;
  clarification_type: 'NONE' | 'OPTIONS' | 'PHOTO' | 'OPTIONS_PLUS_PHOTO';
  clarification_options?: string[];
}

export interface ClarificationOutput {
  response_text: string;
  options: string[];
  photo_requested: boolean;
  clarification_prompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM-BASED OPTIONS DATABASE (Farmer-friendly visual symptoms)
// ═══════════════════════════════════════════════════════════════════════════

const SYMPTOM_OPTIONS_DATABASE: Record<string, Record<string, string[]>> = {
  // Dead/dying plants - multiple causes
  plant_dying: {
    mr: [
      'मधोमध कोंब वाळलेला आहे',
      'झाड मुळासकट कुजलेले दिसते',
      'पाणी साचते / फार ओल आहे'
    ],
    hi: [
      'बीच का कोंपल सूख गया है',
      'पौधा जड़ से सड़ा हुआ दिखता है',
      'पानी भर जाता है / बहुत गीला है'
    ],
    en: [
      'Central shoot is dried/dead',
      'Plant looks rotted from root',
      'Water logging / too wet'
    ]
  },
  
  // Leaf damage - could be pest/disease/nutrient
  leaf_damage: {
    mr: [
      'पानावर काळे/तपकिरी डाग आहेत',
      'पान पूर्ण पिवळे झाले आहे',
      'पानावर किडे/अळी दिसतात'
    ],
    hi: [
      'पत्तों पर काले/भूरे धब्बे हैं',
      'पत्ता पूरा पीला हो गया है',
      'पत्तों पर कीड़े/इल्ली दिखती है'
    ],
    en: [
      'Black/brown spots on leaves',
      'Entire leaf turned yellow',
      'Insects/larvae visible on leaves'
    ]
  },
  
  // Growth issues
  poor_growth: {
    mr: [
      'वाढ खुंटली आहे / फुटवे कमी',
      'पान लहान आणि पिवळट आहेत',
      'झाडे कमकुवत आणि बारीक आहेत'
    ],
    hi: [
      'बढ़वार रुक गई है / कम फुटाव',
      'पत्ते छोटे और पीलापन लिए हैं',
      'पौधे कमजोर और पतले हैं'
    ],
    en: [
      'Growth stunted / less tillering',
      'Leaves small and yellowish',
      'Plants weak and thin'
    ]
  },
  
  // Sugarcane specific
  sugarcane_issue: {
    mr: [
      'मधली सुरळी वाळली आहे (डेड हार्ट)',
      'खोडात भोक आणि भुसा दिसतो',
      'पाने वरून खाली वाळत आहेत'
    ],
    hi: [
      'बीच की पोंगली सूखी है (डेड हार्ट)',
      'तने में छेद और बुरादा दिखता है',
      'पत्ते ऊपर से नीचे सूख रहे हैं'
    ],
    en: [
      'Central whorl dried (dead heart)',
      'Holes and frass in stem',
      'Leaves drying from top to bottom'
    ]
  },
  
  // Cotton specific
  cotton_issue: {
    mr: [
      'बोंडावर अळी आहे / बोंड खराब',
      'पानावर पांढरी माशी आहे',
      'पान लाल/तपकिरी होत आहे'
    ],
    hi: [
      'बॉल पर इल्ली है / बॉल खराब',
      'पत्तों पर सफेद मक्खी है',
      'पत्ते लाल/भूरे हो रहे हैं'
    ],
    en: [
      'Larvae on bolls / damaged bolls',
      'Whitefly on leaves',
      'Leaves turning red/brown'
    ]
  },
  
  // Rice/Wheat specific
  cereal_issue: {
    mr: [
      'दाण्यात किडे आहेत',
      'ओंब्या रिकाम्या आहेत',
      'पान करपट/तांबेरा दिसतो'
    ],
    hi: [
      'दानों में कीड़े हैं',
      'बालियां खाली हैं',
      'पत्तों पर झुलसा/रतुआ दिखता है'
    ],
    en: [
      'Insects in grains',
      'Empty ears/panicles',
      'Blight/rust on leaves'
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACKNOWLEDGMENT TEMPLATES (Language-specific)
// ═══════════════════════════════════════════════════════════════════════════

const ACKNOWLEDGMENT_TEMPLATES: Record<string, string> = {
  mr: '🌾 समजले.',
  hi: '🌾 समझ गया.',
  en: '🌾 Understood.'
};

const CLARIFICATION_INTRO: Record<string, string> = {
  mr: 'अचूक कारण समजण्यासाठी कृपया खालीलपैकी एक निवडा:',
  hi: 'सही कारण समझने के लिए कृपया नीचे से एक चुनें:',
  en: 'To understand the exact cause, please select one:'
};

const PHOTO_REQUEST: Record<string, string> = {
  mr: '👉 शक्य असल्यास त्या भागाचा फोटो पाठवल्यास अधिक अचूक सल्ला देता येईल.',
  hi: '👉 अगर संभव हो तो उस भाग की फोटो भेजें, अधिक सटीक सलाह मिलेगी।',
  en: '👉 If possible, send a photo of that area for more accurate advice.'
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect symptom category from farmer's observations
 */
function detectSymptomCategory(
  observations: string[],
  farmer_message: string,
  crop_code?: string
): string {
  const combined = (observations.join(' ') + ' ' + farmer_message).toLowerCase();
  
  // Check for crop-specific patterns first
  if (crop_code) {
    const cropUpper = crop_code.toUpperCase();
    if (cropUpper.includes('SUGARCANE') || cropUpper.includes('US') || combined.includes('ऊस') || combined.includes('गन्ना')) {
      return 'sugarcane_issue';
    }
    if (cropUpper.includes('COTTON') || cropUpper.includes('KAPAS') || combined.includes('कापूस') || combined.includes('कपास')) {
      return 'cotton_issue';
    }
    if (cropUpper.includes('RICE') || cropUpper.includes('WHEAT') || combined.includes('गहू') || combined.includes('धान') || combined.includes('भात')) {
      return 'cereal_issue';
    }
  }
  
  // Check symptom patterns
  const dyingPatterns = /मेल|मर|सुक|वाळ|dying|dead|died|सूख|मरा/i;
  const leafPatterns = /पान|पत्त|leaf|leaves|डाग|spot|पीला|yellow/i;
  const growthPatterns = /वाढ|growth|बढ़|खुंट|stunt|कमकुवत|weak/i;
  
  if (dyingPatterns.test(combined)) return 'plant_dying';
  if (leafPatterns.test(combined)) return 'leaf_damage';
  if (growthPatterns.test(combined)) return 'poor_growth';
  
  // Default based on crop if available
  if (crop_code?.toUpperCase().includes('SUGARCANE')) return 'sugarcane_issue';
  
  return 'plant_dying'; // Safe default
}

/**
 * Get clarification options based on symptom category
 */
function getOptionsForSymptom(
  symptomCategory: string,
  language: 'mr' | 'hi' | 'en'
): string[] {
  const options = SYMPTOM_OPTIONS_DATABASE[symptomCategory];
  if (!options) return SYMPTOM_OPTIONS_DATABASE['plant_dying'][language] || [];
  return options[language] || options['en'] || [];
}

/**
 * Generate clarification response for farmer
 */
export function generateClarificationResponse(input: ClarificationInput): ClarificationOutput {
  const { language, farmer_message, observations, crop_code, clarification_type, clarification_options } = input;
  
  // If no clarification needed, return empty
  if (clarification_type === 'NONE') {
    return {
      response_text: '',
      options: [],
      photo_requested: false,
      clarification_prompt: ''
    };
  }
  
  // Get symptom category and options
  const symptomCategory = detectSymptomCategory(observations, farmer_message, crop_code);
  
  // Use AI-provided options if available, otherwise use database
  const options = clarification_options?.length 
    ? clarification_options.slice(0, 3) 
    : getOptionsForSymptom(symptomCategory, language);
  
  // Build response
  const acknowledgment = ACKNOWLEDGMENT_TEMPLATES[language] || ACKNOWLEDGMENT_TEMPLATES['en'];
  const intro = CLARIFICATION_INTRO[language] || CLARIFICATION_INTRO['en'];
  const photoMsg = PHOTO_REQUEST[language] || PHOTO_REQUEST['en'];
  
  let response_text = `${acknowledgment}\n\n`;
  
  // Add context based on what farmer said
  if (observations.length > 0) {
    const contextMap: Record<string, string> = {
      mr: `तुम्ही सांगत आहात की "${observations[0]}"`,
      hi: `आप बता रहे हैं कि "${observations[0]}"`,
      en: `You're saying that "${observations[0]}"`
    };
    response_text += (contextMap[language] || contextMap['en']) + '\n\n';
  }
  
  // Add options with numbers and emojis
  response_text += intro + '\n\n';
  options.forEach((opt, idx) => {
    const emoji = idx === 0 ? '1️⃣' : idx === 1 ? '2️⃣' : '3️⃣';
    response_text += `${emoji} ${opt}\n`;
  });
  
  // Add photo request if applicable
  const needsPhoto = clarification_type === 'PHOTO' || clarification_type === 'OPTIONS_PLUS_PHOTO';
  if (needsPhoto) {
    response_text += `\n${photoMsg}`;
  }
  
  return {
    response_text,
    options,
    photo_requested: needsPhoto,
    clarification_prompt: intro
  };
}

/**
 * Check if farmer's follow-up matches one of the options
 */
export function matchFarmerResponseToOption(
  farmer_response: string,
  previous_options: string[]
): { matched: boolean; matched_option?: string; option_index?: number } {
  const normalized = farmer_response.toLowerCase().trim();
  
  // Check for number response (1, 2, 3)
  const numberMatch = normalized.match(/^[१२३123]$/);
  if (numberMatch) {
    const numMap: Record<string, number> = { '१': 0, '२': 1, '३': 2, '1': 0, '2': 1, '3': 2 };
    const idx = numMap[numberMatch[0]];
    if (idx !== undefined && previous_options[idx]) {
      return {
        matched: true,
        matched_option: previous_options[idx],
        option_index: idx
      };
    }
  }
  
  // Check for partial text match
  for (let i = 0; i < previous_options.length; i++) {
    const optNormalized = previous_options[i].toLowerCase();
    // If farmer typed at least 40% of the option text, consider it a match
    const words = optNormalized.split(/\s+/);
    const matchedWords = words.filter(w => normalized.includes(w) && w.length > 2);
    if (matchedWords.length >= Math.ceil(words.length * 0.4)) {
      return {
        matched: true,
        matched_option: previous_options[i],
        option_index: i
      };
    }
  }
  
  return { matched: false };
}

/**
 * Map selected option to symptom observation for decision brain
 */
export function mapOptionToObservation(
  option: string,
  language: 'mr' | 'hi' | 'en'
): { observation: string; likely_cause: string } {
  const optLower = option.toLowerCase();
  
  // Dead heart patterns
  if (optLower.includes('कोंब वाळ') || optLower.includes('पोंगली सूख') || optLower.includes('dead heart') || optLower.includes('whorl dried')) {
    return { observation: 'dead heart / मधली सुरळी वाळली', likely_cause: 'SHOOT_BORER' };
  }
  
  // Root rot patterns
  if (optLower.includes('मुळासकट') || optLower.includes('जड़ से सड़') || optLower.includes('rotted from root')) {
    return { observation: 'root rot / मुळासकट कुजले', likely_cause: 'ROOT_ROT' };
  }
  
  // Water logging patterns
  if (optLower.includes('पाणी साच') || optLower.includes('पानी भर') || optLower.includes('water log') || optLower.includes('too wet')) {
    return { observation: 'water logging / पाणी साचणे', likely_cause: 'WATER_LOGGING' };
  }
  
  // Stem borer patterns
  if (optLower.includes('भोक') || optLower.includes('भुसा') || optLower.includes('छेद') || optLower.includes('बुरादा') || optLower.includes('hole') || optLower.includes('frass')) {
    return { observation: 'stem bore holes with frass', likely_cause: 'STEM_BORER' };
  }
  
  // Whitefly patterns
  if (optLower.includes('पांढरी माशी') || optLower.includes('सफेद मक्खी') || optLower.includes('whitefly')) {
    return { observation: 'whitefly infestation', likely_cause: 'WHITEFLY' };
  }
  
  // Bollworm patterns
  if (optLower.includes('बोंड') || optLower.includes('बॉल') || optLower.includes('boll')) {
    return { observation: 'bollworm damage', likely_cause: 'BOLLWORM' };
  }
  
  // Leaf spot/blight patterns
  if (optLower.includes('डाग') || optLower.includes('धब्बे') || optLower.includes('spot')) {
    return { observation: 'leaf spots', likely_cause: 'LEAF_SPOT' };
  }
  
  // Yellow leaves - nutrient deficiency
  if (optLower.includes('पिवळ') || optLower.includes('पीला') || optLower.includes('yellow')) {
    return { observation: 'yellowing leaves', likely_cause: 'NITROGEN_DEFICIENCY' };
  }
  
  // Default
  return { observation: option, likely_cause: 'UNKNOWN' };
}
