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
// Comprehensive crop-specific symptoms with local Marathi/Hindi terminology
// ═══════════════════════════════════════════════════════════════════════════

const SYMPTOM_OPTIONS_DATABASE: Record<string, Record<string, string[]>> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL SYMPTOMS (All crops)
  // ═══════════════════════════════════════════════════════════════════════════
  
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUGARCANE (ऊस / गन्ना) SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  sugarcane_borer: {
    mr: [
      'आतडी किडा - खोडात भोक दिसतो',
      'खोड बोरर - आतला भाग खाल्लेला',
      'मधली सुरळी ओढल्यावर निघते'
    ],
    hi: [
      'तना छेदक - तने में छेद दिखता है',
      'स्टेम बोरर - अंदर का भाग खाया हुआ',
      'बीच की पोंगली खींचने पर निकलती है'
    ],
    en: [
      'Internodal borer - holes in stem',
      'Stem borer - inner part eaten',
      'Central whorl comes out when pulled'
    ]
  },
  
  sugarcane_disease: {
    mr: [
      'लाल कुज - पाने लालसर होत आहेत',
      'ऊस कुजलेला वास येतो',
      'गड्ड्यावर काळे डाग दिसतात'
    ],
    hi: [
      'लाल सड़न - पत्ते लाल हो रहे हैं',
      'गन्ने से सड़ी हुई गंध आती है',
      'गांठों पर काले धब्बे दिखते हैं'
    ],
    en: [
      'Red rot - leaves turning reddish',
      'Rotting smell from sugarcane',
      'Black spots on nodes'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COTTON (कापूस / कपास) SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  cotton_bollworm: {
    mr: [
      'गुलाबी बोंड अळी - बोंडात अळी',
      'अमेरिकन बोंड अळी - मोठी हिरवी अळी',
      'बोंडे पूर्ण खाल्लेली दिसतात'
    ],
    hi: [
      'गुलाबी बॉल वर्म - बॉल में इल्ली',
      'अमेरिकन बॉल वर्म - बड़ी हरी इल्ली',
      'बॉल पूरी खाई हुई दिखती है'
    ],
    en: [
      'Pink bollworm - larvae in boll',
      'American bollworm - large green larvae',
      'Bolls appear completely eaten'
    ]
  },
  
  cotton_sucking_pest: {
    mr: [
      'मावा - पानाखाली लहान किडे',
      'तुडतुडा - पानांवर पिवळे डाग',
      'पांढरी माशी - चिकट पाने'
    ],
    hi: [
      'माहू - पत्ते के नीचे छोटे कीड़े',
      'जैसिड - पत्तों पर पीले धब्बे',
      'सफेद मक्खी - चिपचिपे पत्ते'
    ],
    en: [
      'Aphids - small insects under leaves',
      'Jassid - yellow spots on leaves',
      'Whitefly - sticky leaves'
    ]
  },
  
  cotton_disease: {
    mr: [
      'बोंड कुज - बोंड काळे होत आहेत',
      'पान करपा - पाने वाळत आहेत',
      'मुळकुज - झाड अचानक सुकते'
    ],
    hi: [
      'बॉल राट - बॉल काली हो रही है',
      'पत्ता झुलसा - पत्ते सूख रहे हैं',
      'जड़ गलन - पौधा अचानक सूखता है'
    ],
    en: [
      'Boll rot - bolls turning black',
      'Leaf blight - leaves drying',
      'Root rot - plant suddenly wilts'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WHEAT (गहू / गेहूं) SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════════
  wheat_issue: {
    mr: [
      'तांबेरा - पानावर तपकिरी पट्टे',
      'करपा - पानांवर काळे डाग',
      'ओंब्या रिकाम्या राहत आहेत'
    ],
    hi: [
      'रतुआ - पत्तों पर भूरी धारियां',
      'झुलसा - पत्तों पर काले धब्बे',
      'बालियां खाली रह रही हैं'
    ],
    en: [
      'Rust - brown stripes on leaves',
      'Blight - black spots on leaves',
      'Ears remaining empty'
    ]
  },
  
  wheat_rust: {
    mr: [
      'पिवळा तांबेरा - पिवळ्या पट्ट्या',
      'तपकिरी तांबेरा - तपकिरी पावडर',
      'काळा तांबेरा - काळे ठिपके'
    ],
    hi: [
      'पीला रतुआ - पीली धारियां',
      'भूरा रतुआ - भूरा पाउडर',
      'काला रतुआ - काले धब्बे'
    ],
    en: [
      'Yellow rust - yellow stripes',
      'Brown rust - brown powder',
      'Black rust - black spots'
    ]
  },
  
  wheat_pest: {
    mr: [
      'उंदीर - खोड कुरतडलेले दिसते',
      'माव्या - ओंब्यांवर किडे',
      'दाणे खाल्लेले दिसतात'
    ],
    hi: [
      'चूहे - तना कुतरा हुआ दिखता है',
      'माहू - बालियों पर कीड़े',
      'दाने खाए हुए दिखते हैं'
    ],
    en: [
      'Rodents - stem appears gnawed',
      'Aphids - insects on ears',
      'Grains appear eaten'
    ]
  },
  
  wheat_nutrient: {
    mr: [
      'पान पिवळे - नत्राची कमतरता',
      'पान जांभळे - स्फुरदाची कमतरता',
      'पानांच्या टोकांवर जळलेले'
    ],
    hi: [
      'पत्ते पीले - नाइट्रोजन की कमी',
      'पत्ते बैंगनी - फास्फोरस की कमी',
      'पत्तों के सिरे जले हुए'
    ],
    en: [
      'Yellow leaves - nitrogen deficiency',
      'Purple leaves - phosphorus deficiency',
      'Burnt leaf tips'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RICE (भात / धान) SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════════
  rice_issue: {
    mr: [
      'करपा - पानावर काळे डाग',
      'खोडकिडा - वाळलेले कोंब',
      'तुडतुडा - पान पिवळे होत आहे'
    ],
    hi: [
      'झुलसा - पत्तों पर काले धब्बे',
      'तना छेदक - सूखी हुई कोंपल',
      'भूरा फुदका - पत्ते पीले हो रहे हैं'
    ],
    en: [
      'Blast - black spots on leaves',
      'Stem borer - dried shoots',
      'Brown planthopper - yellowing leaves'
    ]
  },
  
  rice_blast: {
    mr: [
      'पान करपा - पानावर डोळ्यांसारखे डाग',
      'खोड करपा - खोड काळे होत आहे',
      'मानेवर करपा - ओंबी लोंबत आहे'
    ],
    hi: [
      'पत्ता ब्लास्ट - पत्तों पर आंख जैसे धब्बे',
      'तना ब्लास्ट - तना काला हो रहा है',
      'गर्दन ब्लास्ट - बाली लटक रही है'
    ],
    en: [
      'Leaf blast - eye-shaped spots on leaves',
      'Node blast - stem turning black',
      'Neck blast - panicle hanging'
    ]
  },
  
  rice_borer: {
    mr: [
      'पांढरा कोंब (डेड हार्ट)',
      'पांढऱ्या ओंब्या (व्हाईट हेड)',
      'खोडात अळी दिसते'
    ],
    hi: [
      'सफेद कोंपल (डेड हार्ट)',
      'सफेद बाली (व्हाइट हेड)',
      'तने में इल्ली दिखती है'
    ],
    en: [
      'White shoot (dead heart)',
      'White panicle (white head)',
      'Larvae visible in stem'
    ]
  },
  
  rice_hopper: {
    mr: [
      'तपकिरी तुडतुडा - झाडे जळल्यासारखी',
      'हिरवा तुडतुडा - पान पिवळट',
      'पानावर मधासारखा चिकट थर'
    ],
    hi: [
      'भूरा फुदका - पौधे जले हुए जैसे',
      'हरा फुदका - पत्ते पीलापन लिए',
      'पत्तों पर शहद जैसी चिपचिपी परत'
    ],
    en: [
      'Brown planthopper - plants look burnt',
      'Green leafhopper - yellowish leaves',
      'Honeydew layer on leaves'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SOYBEAN (सोयाबीन) SPECIFIC
  // ═══════════════════════════════════════════════════════════════════════════
  soybean_issue: {
    mr: [
      'पान खाणारी अळी - पान कापलेले',
      'खोड माशी - खोड काळे होत आहे',
      'पान पिवळे होत आहे'
    ],
    hi: [
      'पत्ता खाने वाली इल्ली - पत्ता कटा हुआ',
      'तना मक्खी - तना काला हो रहा है',
      'पत्ते पीले हो रहे हैं'
    ],
    en: [
      'Leaf eating caterpillar - leaves cut',
      'Stem fly - stem turning black',
      'Leaves turning yellow'
    ]
  },
  
  soybean_caterpillar: {
    mr: [
      'स्पोडोप्टेरा - हिरवी अळी पान खातेय',
      'चक्री भुंगा - पान गोल कापलेले',
      'शेंगा पोखरणारी अळी'
    ],
    hi: [
      'स्पोडोप्टेरा - हरी इल्ली पत्ता खा रही है',
      'गर्डल बीटल - पत्ता गोल कटा हुआ',
      'फली छेदक इल्ली'
    ],
    en: [
      'Spodoptera - green caterpillar eating leaves',
      'Girdle beetle - leaves cut in circle',
      'Pod borer larvae'
    ]
  },
  
  soybean_stemfly: {
    mr: [
      'खोड माशी - खोड काळे, मुळे तपकिरी',
      'खोड फोडल्यावर अळी दिसते',
      'झाड पिवळे होऊन वाळते'
    ],
    hi: [
      'तना मक्खी - तना काला, जड़ें भूरी',
      'तना फाड़ने पर इल्ली दिखती है',
      'पौधा पीला होकर सूखता है'
    ],
    en: [
      'Stem fly - black stem, brown roots',
      'Larvae visible inside stem',
      'Plant yellows and wilts'
    ]
  },
  
  soybean_disease: {
    mr: [
      'चारकोल रॉट - मुळे काळी',
      'पान करपा - तपकिरी डाग',
      'बुरशीचा पांढरा थर'
    ],
    hi: [
      'चारकोल राट - जड़ें काली',
      'पत्ता झुलसा - भूरे धब्बे',
      'फफूंद की सफेद परत'
    ],
    en: [
      'Charcoal rot - black roots',
      'Leaf blight - brown spots',
      'White fungal layer'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CEREAL GENERAL (Rice/Wheat combined)
  // ═══════════════════════════════════════════════════════════════════════════
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
    
    // SUGARCANE
    if (cropUpper.includes('SUGARCANE') || cropUpper.includes('US') || combined.includes('ऊस') || combined.includes('गन्ना')) {
      // More specific sugarcane symptoms
      if (combined.includes('बोरर') || combined.includes('किडा') || combined.includes('भोक') || combined.includes('छेद')) {
        return 'sugarcane_borer';
      }
      if (combined.includes('कुज') || combined.includes('सड़') || combined.includes('रॉट') || combined.includes('लाल')) {
        return 'sugarcane_disease';
      }
      return 'sugarcane_issue';
    }
    
    // COTTON
    if (cropUpper.includes('COTTON') || cropUpper.includes('KAPAS') || combined.includes('कापूस') || combined.includes('कपास')) {
      if (combined.includes('बोंड') || combined.includes('बॉल') || combined.includes('अळी') || combined.includes('इल्ली')) {
        return 'cotton_bollworm';
      }
      if (combined.includes('माव') || combined.includes('माहू') || combined.includes('तुडतुड') || combined.includes('माशी') || combined.includes('मक्खी')) {
        return 'cotton_sucking_pest';
      }
      if (combined.includes('कुज') || combined.includes('सड़') || combined.includes('करपा') || combined.includes('झुलसा')) {
        return 'cotton_disease';
      }
      return 'cotton_issue';
    }
    
    // WHEAT
    if (cropUpper.includes('WHEAT') || cropUpper.includes('GAHU') || combined.includes('गहू') || combined.includes('गेहूं')) {
      if (combined.includes('तांबेरा') || combined.includes('रतुआ') || combined.includes('rust')) {
        return 'wheat_rust';
      }
      if (combined.includes('उंदीर') || combined.includes('चूह') || combined.includes('माव') || combined.includes('किडे')) {
        return 'wheat_pest';
      }
      if (combined.includes('पिवळ') || combined.includes('पीला') || combined.includes('जांभळ') || combined.includes('बैंगनी')) {
        return 'wheat_nutrient';
      }
      return 'wheat_issue';
    }
    
    // RICE
    if (cropUpper.includes('RICE') || cropUpper.includes('PADDY') || cropUpper.includes('DHAN') || combined.includes('भात') || combined.includes('धान')) {
      if (combined.includes('करपा') || combined.includes('ब्लास्ट') || combined.includes('blast')) {
        return 'rice_blast';
      }
      if (combined.includes('खोडकिड') || combined.includes('बोरर') || combined.includes('borer') || combined.includes('डेड हार्ट') || combined.includes('व्हाईट')) {
        return 'rice_borer';
      }
      if (combined.includes('तुडतुड') || combined.includes('फुदक') || combined.includes('hopper')) {
        return 'rice_hopper';
      }
      return 'rice_issue';
    }
    
    // SOYBEAN
    if (cropUpper.includes('SOYBEAN') || cropUpper.includes('SOYA') || combined.includes('सोयाबीन') || combined.includes('सोयाबिन')) {
      if (combined.includes('अळी') || combined.includes('इल्ली') || combined.includes('चक्री') || combined.includes('गर्डल')) {
        return 'soybean_caterpillar';
      }
      if (combined.includes('खोड माशी') || combined.includes('तना मक्खी') || combined.includes('stem fly')) {
        return 'soybean_stemfly';
      }
      if (combined.includes('कुज') || combined.includes('राट') || combined.includes('rot') || combined.includes('बुरश')) {
        return 'soybean_disease';
      }
      return 'soybean_issue';
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
  if (crop_code?.toUpperCase().includes('COTTON')) return 'cotton_issue';
  if (crop_code?.toUpperCase().includes('WHEAT')) return 'wheat_issue';
  if (crop_code?.toUpperCase().includes('RICE')) return 'rice_issue';
  if (crop_code?.toUpperCase().includes('SOYBEAN')) return 'soybean_issue';
  
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
 * Validate that clarification options are in the correct language
 * Returns false if options appear to be in wrong language (e.g., English for mr/hi)
 */
function validateOptionsLanguage(options: string[], expectedLanguage: 'mr' | 'hi' | 'en'): boolean {
  if (expectedLanguage === 'en') return true; // English options always OK for English
  
  // For Marathi/Hindi, check if options contain Devanagari script
  const devanagariPattern = /[\u0900-\u097F]/;
  const englishOnlyPattern = /^[A-Za-z\s\-.,!?]+$/;
  
  for (const opt of options) {
    // If option is purely English (no Devanagari), it's wrong for mr/hi
    if (englishOnlyPattern.test(opt.trim())) {
      console.warn(`   ⚠️ Option "${opt.substring(0, 30)}..." is in English but expected ${expectedLanguage}`);
      return false;
    }
  }
  
  // Check at least one option has Devanagari
  const hasDevanagari = options.some(opt => devanagariPattern.test(opt));
  if (!hasDevanagari && (expectedLanguage === 'mr' || expectedLanguage === 'hi')) {
    return false;
  }
  
  return true;
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
  
  // CRITICAL FIX: Always prefer database options in farmer's language
  // Only use AI-provided options if they are in the correct language (not English for mr/hi)
  let options: string[] = [];
  
  if (clarification_options?.length) {
    // Validate that options are in the correct language
    const hasCorrectLanguage = validateOptionsLanguage(clarification_options, language);
    if (hasCorrectLanguage) {
      options = clarification_options.slice(0, 3);
    } else {
      console.log(`   ⚠️ Clarification options in wrong language, using database fallback`);
      options = getOptionsForSymptom(symptomCategory, language);
    }
  } else {
    options = getOptionsForSymptom(symptomCategory, language);
  }
  
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SUGARCANE MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Dead heart patterns
  if (optLower.includes('कोंब वाळ') || optLower.includes('पोंगली सूख') || optLower.includes('dead heart') || optLower.includes('whorl dried') || optLower.includes('सुरळी') || optLower.includes('पोंगली')) {
    return { observation: 'dead heart / मधली सुरळी वाळली', likely_cause: 'SHOOT_BORER' };
  }
  
  // Stem borer patterns
  if (optLower.includes('भोक') || optLower.includes('भुसा') || optLower.includes('छेद') || optLower.includes('बुरादा') || optLower.includes('hole') || optLower.includes('frass') || optLower.includes('आतडी') || optLower.includes('तना छेदक')) {
    return { observation: 'stem bore holes with frass', likely_cause: 'STEM_BORER' };
  }
  
  // Red rot
  if (optLower.includes('लाल कुज') || optLower.includes('लाल सड़न') || optLower.includes('red rot') || optLower.includes('लालसर')) {
    return { observation: 'red rot disease', likely_cause: 'RED_ROT' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COTTON MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Bollworm patterns
  if (optLower.includes('बोंड') || optLower.includes('बॉल') || optLower.includes('boll') || optLower.includes('गुलाबी') || optLower.includes('अमेरिकन')) {
    if (optLower.includes('गुलाबी') || optLower.includes('pink')) {
      return { observation: 'pink bollworm damage', likely_cause: 'PINK_BOLLWORM' };
    }
    return { observation: 'bollworm damage', likely_cause: 'BOLLWORM' };
  }
  
  // Whitefly patterns
  if (optLower.includes('पांढरी माशी') || optLower.includes('सफेद मक्खी') || optLower.includes('whitefly') || optLower.includes('चिकट') || optLower.includes('चिपचिप')) {
    return { observation: 'whitefly infestation', likely_cause: 'WHITEFLY' };
  }
  
  // Aphids
  if (optLower.includes('मावा') || optLower.includes('माहू') || optLower.includes('aphid')) {
    return { observation: 'aphid infestation', likely_cause: 'APHIDS' };
  }
  
  // Jassid
  if (optLower.includes('तुडतुडा') || optLower.includes('जैसिड') || optLower.includes('jassid')) {
    return { observation: 'jassid damage', likely_cause: 'JASSID' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WHEAT MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Rust patterns
  if (optLower.includes('तांबेरा') || optLower.includes('रतुआ') || optLower.includes('rust')) {
    if (optLower.includes('पिवळ') || optLower.includes('पीला') || optLower.includes('yellow')) {
      return { observation: 'yellow rust on wheat', likely_cause: 'YELLOW_RUST' };
    }
    if (optLower.includes('काळ') || optLower.includes('काला') || optLower.includes('black')) {
      return { observation: 'black rust on wheat', likely_cause: 'BLACK_RUST' };
    }
    return { observation: 'brown rust on wheat', likely_cause: 'BROWN_RUST' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RICE MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Blast patterns
  if (optLower.includes('करपा') || optLower.includes('ब्लास्ट') || optLower.includes('blast') || optLower.includes('डोळ्यांसारखे') || optLower.includes('आंख जैसे')) {
    if (optLower.includes('मान') || optLower.includes('गर्दन') || optLower.includes('neck') || optLower.includes('लोंबत') || optLower.includes('लटक')) {
      return { observation: 'neck blast on rice', likely_cause: 'NECK_BLAST' };
    }
    if (optLower.includes('खोड') || optLower.includes('तना') || optLower.includes('node')) {
      return { observation: 'node blast on rice', likely_cause: 'NODE_BLAST' };
    }
    return { observation: 'leaf blast on rice', likely_cause: 'LEAF_BLAST' };
  }
  
  // Rice borer
  if (optLower.includes('पांढरा कोंब') || optLower.includes('सफेद कोंपल') || optLower.includes('व्हाईट हेड') || optLower.includes('व्हाइट हेड') || optLower.includes('white head')) {
    return { observation: 'stem borer damage in rice', likely_cause: 'RICE_STEM_BORER' };
  }
  
  // Planthopper
  if (optLower.includes('तुडतुड') || optLower.includes('फुदक') || optLower.includes('hopper') || optLower.includes('जळल्यासारख') || optLower.includes('जले हुए')) {
    if (optLower.includes('तपकिरी') || optLower.includes('भूरा') || optLower.includes('brown')) {
      return { observation: 'brown planthopper infestation', likely_cause: 'BROWN_PLANTHOPPER' };
    }
    return { observation: 'green leafhopper damage', likely_cause: 'GREEN_LEAFHOPPER' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SOYBEAN MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Caterpillar
  if (optLower.includes('स्पोडोप्टेरा') || optLower.includes('spodoptera') || optLower.includes('पान खाणारी') || optLower.includes('पत्ता खाने')) {
    return { observation: 'spodoptera caterpillar damage', likely_cause: 'SPODOPTERA' };
  }
  
  // Girdle beetle
  if (optLower.includes('चक्री') || optLower.includes('गर्डल') || optLower.includes('girdle') || optLower.includes('गोल कापलेल') || optLower.includes('गोल कटा')) {
    return { observation: 'girdle beetle damage', likely_cause: 'GIRDLE_BEETLE' };
  }
  
  // Stem fly
  if (optLower.includes('खोड माशी') || optLower.includes('तना मक्खी') || optLower.includes('stem fly')) {
    return { observation: 'stem fly damage', likely_cause: 'SOYBEAN_STEM_FLY' };
  }
  
  // Charcoal rot
  if (optLower.includes('चारकोल') || optLower.includes('charcoal') || optLower.includes('मुळे काळी') || optLower.includes('जड़ें काली')) {
    return { observation: 'charcoal rot disease', likely_cause: 'CHARCOAL_ROT' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL MAPPINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Root rot patterns
  if (optLower.includes('मुळासकट') || optLower.includes('जड़ से सड़') || optLower.includes('rotted from root') || optLower.includes('मुळकुज') || optLower.includes('जड़ गलन')) {
    return { observation: 'root rot / मुळासकट कुजले', likely_cause: 'ROOT_ROT' };
  }
  
  // Water logging patterns
  if (optLower.includes('पाणी साच') || optLower.includes('पानी भर') || optLower.includes('water log') || optLower.includes('too wet') || optLower.includes('ओल')) {
    return { observation: 'water logging / पाणी साचणे', likely_cause: 'WATER_LOGGING' };
  }
  
  // Leaf spot/blight patterns
  if (optLower.includes('डाग') || optLower.includes('धब्बे') || optLower.includes('spot') || optLower.includes('झुलसा')) {
    return { observation: 'leaf spots', likely_cause: 'LEAF_SPOT' };
  }
  
  // Yellow leaves - nutrient deficiency
  if (optLower.includes('पिवळ') || optLower.includes('पीला') || optLower.includes('yellow')) {
    return { observation: 'yellowing leaves', likely_cause: 'NITROGEN_DEFICIENCY' };
  }
  
  // Default
  return { observation: option, likely_cause: 'UNKNOWN' };
}
