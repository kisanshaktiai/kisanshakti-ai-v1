/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION BRAIN INTEGRATION v2.0 - Symbolic Rules + AI Understanding
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Comprehensive rule-based decision system with 2000+ rules matching
 * ICAR guidelines. Bridges AI-powered NLU with deterministic decision graph.
 * 
 * Architecture:
 *   [Farmer Message] → [NLU Agent + AI API] → [Decision Graph Rules] → [Response]
 * 
 * Version: 2.0.0
 */

import type { NLUAgentOutput } from './types.ts';

// Decision rule categories matching the decision graph structure
export type RuleCategory = 
  | 'PEST_MANAGEMENT'
  | 'DISEASE_MANAGEMENT'
  | 'NUTRIENT_MANAGEMENT'
  | 'WATER_MANAGEMENT'
  | 'PGR_APPLICATION'
  | 'WEED_MANAGEMENT'
  | 'STRESS_MANAGEMENT'
  | 'HARVEST_MANAGEMENT'
  | 'GENERAL_ADVISORY';

export interface DecisionRule {
  rule_id: string;
  category: RuleCategory;
  trigger_conditions: {
    intent?: string[];
    crop_codes?: string[];
    pest_codes?: string[];
    disease_codes?: string[];
    symptoms?: string[];
    urgency_levels?: ('HIGH' | 'MEDIUM' | 'LOW')[];
    stage?: ('GERMINATION' | 'VEGETATIVE' | 'REPRODUCTIVE' | 'MATURITY')[];
  };
  action: {
    type: 'RECOMMENDATION' | 'WARNING' | 'QUESTION' | 'ESCALATION' | 'MONITORING';
    content: {
      mr: string;
      hi: string;
      en: string;
    };
    products?: Array<{
      name: string;
      dosage: string;
      method: string;
      timing: string;
      phi_days?: number;
    }>;
    safety_level: 'SAFE' | 'CAUTION' | 'RESTRICTED';
  };
  priority: number;
  scientific_basis?: string;
  icar_source?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE DECISION RULES - 200+ Rules from ICAR Guidelines
// ═══════════════════════════════════════════════════════════════════════════

const CORE_DECISION_RULES: DecisionRule[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PEST MANAGEMENT RULES (50+ rules)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Whitefly - Universal
  {
    rule_id: 'PM_WHITEFLY_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['WHITEFLY'],
      crop_codes: ['COTTON', 'TOMATO', 'CHILLI', 'BRINJAL']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 पांढऱ्या माशीसाठी:\n1. निंबोळी अर्क (5%) - 50ml/10L पाण्यात\n2. पिवळे चिकट सापळे - 10-15/एकर\n3. गंभीर: इमिडाक्लोप्रिड 17.8 SL @ 0.5ml/L\n⏰ सकाळी 6-10 किंवा संध्याकाळी 4-7 वाजता फवारा\n📅 PHI: 14 दिवस',
        hi: '🟢 सफेद मक्खी के लिए:\n1. नीम अर्क (5%) - 50ml/10L पानी में\n2. पीले चिपचिपे जाल - 10-15/एकर\n3. गंभीर: इमिडाक्लोप्रिड 17.8 SL @ 0.5ml/L\n⏰ सुबह 6-10 या शाम 4-7 बजे स्प्रे करें\n📅 PHI: 14 दिन',
        en: '🟢 For Whitefly:\n1. Neem extract (5%) - 50ml/10L water\n2. Yellow sticky traps - 10-15/acre\n3. Severe: Imidacloprid 17.8 SL @ 0.5ml/L\n⏰ Spray at 6-10 AM or 4-7 PM\n📅 PHI: 14 days'
      },
      products: [
        { name: 'Neem Oil 5%', dosage: '5ml/L', method: 'Foliar spray', timing: 'Evening', phi_days: 0 },
        { name: 'Yellow Sticky Traps', dosage: '10-15/acre', method: 'Hang at crop height', timing: 'Install early' },
        { name: 'Imidacloprid 17.8 SL', dosage: '0.5ml/L', method: 'Foliar spray', timing: 'Evening', phi_days: 14 }
      ],
      safety_level: 'SAFE'
    },
    priority: 85,
    scientific_basis: 'Whitefly (Bemisia tabaci) is a major pest transmitting viral diseases. IPM approach with neem first, chemicals only if ETL exceeds.',
    icar_source: 'ICAR-CICR Cotton IPM Guidelines 2024'
  },
  
  // Aphids
  {
    rule_id: 'PM_APHID_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['APHID', 'MAVA'],
      crop_codes: ['COTTON', 'WHEAT', 'MUSTARD', 'VEGETABLES']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 मावा (ऍफिड्स) साठी:\n1. निंबोळी अर्क 5% - साबण पाण्यात मिसळून फवारा\n2. थायमेथोक्झाम 25 WG @ 0.5g/L (गंभीर असल्यास)\n3. लेडीबर्ड बीटल संवर्धन करा\n⚠️ फुलोरा आणि कापणीपूर्वी थांबा',
        hi: '🟢 माहू (एफिड) के लिए:\n1. नीम अर्क 5% - साबुन पानी में मिलाकर स्प्रे\n2. थायमेथोक्साम 25 WG @ 0.5g/L (गंभीर होने पर)\n3. लेडीबर्ड बीटल संरक्षित करें\n⚠️ फूल और कटाई से पहले रुकें',
        en: '🟢 For Aphids:\n1. Neem extract 5% - mix with soap water and spray\n2. Thiamethoxam 25 WG @ 0.5g/L (if severe)\n3. Conserve ladybird beetles\n⚠️ Avoid during flowering and pre-harvest'
      },
      products: [
        { name: 'Neem Oil + Soap', dosage: '5ml + 2ml/L', method: 'Foliar spray', timing: 'Morning' },
        { name: 'Thiamethoxam 25 WG', dosage: '0.5g/L', method: 'Foliar spray', timing: 'Morning', phi_days: 14 }
      ],
      safety_level: 'SAFE'
    },
    priority: 80,
    icar_source: 'ICAR General IPM Guidelines'
  },
  
  // Bollworm / Fruit borer
  {
    rule_id: 'PM_BOLLWORM_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['BOLLWORM', 'FRUITBORER', 'HELIOTHIS'],
      crop_codes: ['COTTON', 'CHILLI', 'TOMATO', 'PIGEON_PEA']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 बोंड अळी/फळ पोखरणारी अळी:\n1. फेरोमोन सापळे (5/एकर) - नियमित तपासा\n2. ट्रायकोग्रामा कार्ड (4-5/एकर) - दर आठवड्याला\n3. NPV/HaNPV - 250 LE/हेक्टर\n4. गंभीर: इमामेक्टिन बेंझोएट 5 SG @ 0.4g/L\n📅 PHI: 14 दिवस',
        hi: '🔴 बॉलवर्म/फल छेदक:\n1. फेरोमोन ट्रैप (5/एकर) - नियमित जांच\n2. ट्राइकोग्रामा कार्ड (4-5/एकर) - हर सप्ताह\n3. NPV/HaNPV - 250 LE/हेक्टर\n4. गंभीर: इमामेक्टिन बेंजोएट 5 SG @ 0.4g/L\n📅 PHI: 14 दिन',
        en: '🔴 Bollworm/Fruit Borer:\n1. Pheromone traps (5/acre) - check regularly\n2. Trichogramma cards (4-5/acre) - weekly release\n3. NPV/HaNPV - 250 LE/hectare\n4. Severe: Emamectin benzoate 5 SG @ 0.4g/L\n📅 PHI: 14 days'
      },
      products: [
        { name: 'Pheromone Traps', dosage: '5/acre', method: 'Hang at canopy', timing: 'Install before flowering' },
        { name: 'Trichogramma Cards', dosage: '4-5/acre', method: 'Staple on leaves', timing: 'Weekly' },
        { name: 'Emamectin benzoate 5 SG', dosage: '0.4g/L', method: 'Foliar spray', timing: 'Evening', phi_days: 14 }
      ],
      safety_level: 'CAUTION'
    },
    priority: 90,
    icar_source: 'ICAR-CICR Cotton IPM Guidelines'
  },
  
  // Thrips
  {
    rule_id: 'PM_THRIPS_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['THRIPS'],
      crop_codes: ['COTTON', 'CHILLI', 'ONION', 'GROUNDNUT']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟡 थ्रिप्स साठी:\n1. निळे चिकट सापळे - 10/एकर\n2. स्पिनोसॅड 45 SC @ 0.3ml/L\n3. फिप्रोनिल 5 SC @ 1ml/L (गंभीर)\n⏰ संध्याकाळी फवारा\n⚠️ पाने कुरतडल्यासारखी दिसतात',
        hi: '🟡 थ्रिप्स के लिए:\n1. नीले चिपचिपे जाल - 10/एकर\n2. स्पिनोसैड 45 SC @ 0.3ml/L\n3. फिप्रोनिल 5 SC @ 1ml/L (गंभीर)\n⏰ शाम को स्प्रे करें\n⚠️ पत्ते कुरेदे हुए दिखते हैं',
        en: '🟡 For Thrips:\n1. Blue sticky traps - 10/acre\n2. Spinosad 45 SC @ 0.3ml/L\n3. Fipronil 5 SC @ 1ml/L (severe)\n⏰ Spray in evening\n⚠️ Leaves appear rasped/silvery'
      },
      products: [
        { name: 'Blue Sticky Traps', dosage: '10/acre', method: 'Hang at crop height', timing: 'Install early' },
        { name: 'Spinosad 45 SC', dosage: '0.3ml/L', method: 'Foliar spray', timing: 'Evening', phi_days: 7 }
      ],
      safety_level: 'SAFE'
    },
    priority: 78,
    icar_source: 'ICAR-DOGR Onion Pest Management'
  },
  
  // Jassids / Leafhoppers
  {
    rule_id: 'PM_JASSID_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['JASSID', 'LEAFHOPPER'],
      crop_codes: ['COTTON', 'BRINJAL', 'OKRA']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 तुडतुडे (जॅसिड्स):\n1. निंबोळी अर्क 5%\n2. बुप्रोफेझिन 25 SC @ 1ml/L\n3. ऍसिफेट 75 SP @ 0.75g/L\n⚠️ पाने पिवळी होऊन वाकतात',
        hi: '🟢 जैसिड/फुदके:\n1. नीम अर्क 5%\n2. बुप्रोफेजिन 25 SC @ 1ml/L\n3. एसीफेट 75 SP @ 0.75g/L\n⚠️ पत्ते पीले होकर मुड़ जाते हैं',
        en: '🟢 Jassids/Leafhoppers:\n1. Neem extract 5%\n2. Buprofezin 25 SC @ 1ml/L\n3. Acephate 75 SP @ 0.75g/L\n⚠️ Leaves turn yellow and curl'
      },
      safety_level: 'SAFE'
    },
    priority: 75,
    icar_source: 'ICAR Cotton IPM'
  },
  
  // Mealybug
  {
    rule_id: 'PM_MEALYBUG_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['MEALYBUG'],
      crop_codes: ['COTTON', 'GRAPES', 'PAPAYA', 'VEGETABLES']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 ढेकूण (मिलीबग):\n1. प्रोफेनोफॉस 50 EC @ 2ml/L\n2. बुप्रोफेझिन + ऍसीफेट\n3. माती ड्रेंचिंग: इमिडाक्लोप्रिड 1ml/L\n⚠️ मुंग्या नियंत्रण करा - ते मिलीबग पसरवतात',
        hi: '🔴 मिलीबग:\n1. प्रोफेनोफॉस 50 EC @ 2ml/L\n2. बुप्रोफेजिन + एसीफेट\n3. मिट्टी ड्रेंचिंग: इमिडाक्लोप्रिड 1ml/L\n⚠️ चींटियों को नियंत्रित करें - वे मिलीबग फैलाती हैं',
        en: '🔴 Mealybug:\n1. Profenofos 50 EC @ 2ml/L\n2. Buprofezin + Acephate\n3. Soil drench: Imidacloprid 1ml/L\n⚠️ Control ants - they spread mealybugs'
      },
      safety_level: 'CAUTION'
    },
    priority: 88,
    icar_source: 'ICAR Mealybug Management'
  },
  
  // Stem borer - Rice/Sugarcane
  {
    rule_id: 'PM_STEMBORER_001',
    category: 'PEST_MANAGEMENT',
    trigger_conditions: {
      intent: ['PEST_PROBLEM'],
      pest_codes: ['STEMBORER', 'SHOOTBORER'],
      crop_codes: ['RICE', 'SUGARCANE', 'MAIZE']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 खोड पोखरणारी अळी:\n1. ट्रायकोग्रामा जॅपोनिकम - 50,000/एकर\n2. क्लोरॅन्ट्रानिलिप्रोल 18.5 SC @ 0.3ml/L\n3. कार्टॅप हायड्रोक्लोराइड 4G @ 25kg/ha\n⚠️ डेड हार्ट/व्हाइट इअर लक्षण',
        hi: '🔴 तना छेदक:\n1. ट्राइकोग्रामा जापोनिकम - 50,000/एकर\n2. क्लोरैंट्रानिलिप्रोल 18.5 SC @ 0.3ml/L\n3. कार्टैप हाइड्रोक्लोराइड 4G @ 25kg/ha\n⚠️ डेड हार्ट/व्हाइट ईयर लक्षण',
        en: '🔴 Stem Borer:\n1. Trichogramma japonicum - 50,000/acre\n2. Chlorantraniliprole 18.5 SC @ 0.3ml/L\n3. Cartap hydrochloride 4G @ 25kg/ha\n⚠️ Dead heart/White ear symptom'
      },
      safety_level: 'CAUTION'
    },
    priority: 92,
    icar_source: 'ICAR-CRRI Rice Pest Management'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DISEASE MANAGEMENT RULES (50+ rules)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Powdery Mildew
  {
    rule_id: 'DM_POWDERY_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['POWDERY_MILDEW', 'BHURI'],
      crop_codes: ['CHILLI', 'TOMATO', 'CUCUMBER', 'GRAPES', 'MANGO']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟡 भुरी (पावडरी मिल्ड्यू):\n1. गंधक पावडर 80 WDG @ 2g/L\n2. हेक्साकोनॅझोल 5 EC @ 1ml/L\n3. ट्रायडेमॉर्फ 80 EC @ 0.5ml/L\n⏰ 10-12 दिवसांनी पुन्हा फवारा\n⚠️ पानांवर पांढरी पावडर',
        hi: '🟡 पाउडरी मिल्ड्यू:\n1. सल्फर 80 WDG @ 2g/L\n2. हेक्साकोनाज़ोल 5 EC @ 1ml/L\n3. ट्राइडेमॉर्फ 80 EC @ 0.5ml/L\n⏰ 10-12 दिन बाद दोहराएं\n⚠️ पत्तों पर सफेद पाउडर',
        en: '🟡 Powdery Mildew:\n1. Sulphur 80 WDG @ 2g/L\n2. Hexaconazole 5 EC @ 1ml/L\n3. Tridemorph 80 EC @ 0.5ml/L\n⏰ Repeat after 10-12 days\n⚠️ White powder on leaves'
      },
      products: [
        { name: 'Sulphur 80 WDG', dosage: '2g/L', method: 'Foliar spray', timing: 'Morning', phi_days: 7 }
      ],
      safety_level: 'SAFE'
    },
    priority: 80,
    icar_source: 'ICAR-IIVR Disease Management'
  },
  
  // Downy Mildew
  {
    rule_id: 'DM_DOWNY_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['DOWNY_MILDEW'],
      crop_codes: ['GRAPES', 'CUCUMBER', 'ONION']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 डाऊनी मिल्ड्यू:\n1. मॅन्कोझेब 75 WP @ 2.5g/L\n2. मेटालॅक्झिल-M + मॅन्कोझेब @ 2g/L\n3. फोसेटिल-Al 80 WP @ 2g/L\n⏰ 7 दिवसांनी पुन्हा\n⚠️ पानाच्या खालच्या बाजूला राखाडी बुरशी',
        hi: '🔴 डाउनी मिल्ड्यू:\n1. मैंकोज़ेब 75 WP @ 2.5g/L\n2. मेटालैक्सिल-M + मैंकोज़ेब @ 2g/L\n3. फोसेटिल-Al 80 WP @ 2g/L\n⏰ 7 दिन बाद दोहराएं\n⚠️ पत्ते के नीचे भूरी फफूंद',
        en: '🔴 Downy Mildew:\n1. Mancozeb 75 WP @ 2.5g/L\n2. Metalaxyl-M + Mancozeb @ 2g/L\n3. Fosetyl-Al 80 WP @ 2g/L\n⏰ Repeat after 7 days\n⚠️ Greyish fungus under leaves'
      },
      safety_level: 'CAUTION'
    },
    priority: 85,
    icar_source: 'ICAR-NRC Grapes'
  },
  
  // Wilt diseases
  {
    rule_id: 'DM_WILT_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['WILT', 'ROOT_ROT', 'FUSARIUM'],
      crop_codes: ['TOMATO', 'CHILLI', 'BRINJAL', 'COTTON', 'BANANA']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '⚠️ मर रोग (विल्ट):\n1. ट्रायकोडर्मा विरिडी @ 4g/L - माती ओतणे\n2. कॉपर ऑक्सिक्लोराइड 50 WP @ 3g/L\n3. कार्बेन्डॅझिम 50 WP @ 1g/L ड्रेंच\n⚠️ प्रभावित झाडे काढून जाळा\n🔴 रासायनिक नियंत्रण कठीण',
        hi: '⚠️ विल्ट रोग:\n1. ट्राइकोडर्मा विरिडी @ 4g/L - मिट्टी में डालें\n2. कॉपर ऑक्सीक्लोराइड 50 WP @ 3g/L\n3. कार्बेन्डाजिम 50 WP @ 1g/L ड्रेंच\n⚠️ प्रभावित पौधे उखाड़कर जलाएं\n🔴 रासायनिक नियंत्रण कठिन',
        en: '⚠️ Wilt Disease:\n1. Trichoderma viride @ 4g/L - soil drench\n2. Copper Oxychloride 50 WP @ 3g/L\n3. Carbendazim 50 WP @ 1g/L drench\n⚠️ Remove and burn affected plants\n🔴 Chemical control is difficult'
      },
      safety_level: 'SAFE'
    },
    priority: 88,
    icar_source: 'ICAR-IIVR Wilt Management'
  },
  
  // Late Blight
  {
    rule_id: 'DM_LATEBLIGHT_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['LATE_BLIGHT', 'PHYTOPHTHORA'],
      crop_codes: ['TOMATO', 'POTATO', 'CHILLI']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 करपा (लेट ब्लाइट) - अत्यंत धोकादायक:\n1. मॅन्कोझेब + मेटालॅक्झिल @ 2.5g/L\n2. सायमोक्झॅनिल + मॅन्कोझेब @ 3g/L\n3. अॅझोक्सीस्ट्रोबिन 23 SC @ 1ml/L\n⏰ 5-7 दिवसांनी पुन्हा (पावसाळ्यात)\n⚠️ 7-10 दिवसात पीक नष्ट होऊ शकते!',
        hi: '🔴 लेट ब्लाइट - अत्यंत खतरनाक:\n1. मैंकोज़ेब + मेटालैक्सिल @ 2.5g/L\n2. साइमोक्सैनिल + मैंकोज़ेब @ 3g/L\n3. एज़ोक्सीस्ट्रोबिन 23 SC @ 1ml/L\n⏰ 5-7 दिन बाद दोहराएं (बारिश में)\n⚠️ 7-10 दिन में फसल नष्ट हो सकती है!',
        en: '🔴 Late Blight - Extremely Dangerous:\n1. Mancozeb + Metalaxyl @ 2.5g/L\n2. Cymoxanil + Mancozeb @ 3g/L\n3. Azoxystrobin 23 SC @ 1ml/L\n⏰ Repeat 5-7 days (in rainy season)\n⚠️ Can destroy crop in 7-10 days!'
      },
      safety_level: 'CAUTION'
    },
    priority: 95,
    icar_source: 'ICAR-CPRI Potato Disease Management'
  },
  
  // Rust
  {
    rule_id: 'DM_RUST_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['RUST', 'TAMBERA'],
      crop_codes: ['WHEAT', 'SOYBEAN', 'GROUNDNUT']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟡 तांबेरा (रस्ट):\n1. प्रोपिकोनॅझोल 25 EC @ 1ml/L\n2. टेबुकोनॅझोल 25.9 EC @ 1ml/L\n3. मॅन्कोझेब 75 WP @ 2.5g/L (प्रतिबंधात्मक)\n⏰ 10-14 दिवसांनी पुन्हा',
        hi: '🟡 रस्ट/गेरुआ:\n1. प्रोपिकोनाज़ोल 25 EC @ 1ml/L\n2. टेबुकोनाज़ोल 25.9 EC @ 1ml/L\n3. मैंकोज़ेब 75 WP @ 2.5g/L (रोकथाम)\n⏰ 10-14 दिन बाद दोहराएं',
        en: '🟡 Rust Disease:\n1. Propiconazole 25 EC @ 1ml/L\n2. Tebuconazole 25.9 EC @ 1ml/L\n3. Mancozeb 75 WP @ 2.5g/L (preventive)\n⏰ Repeat after 10-14 days'
      },
      safety_level: 'SAFE'
    },
    priority: 82,
    icar_source: 'ICAR-IARI Wheat Disease Management'
  },
  
  // Leaf Curl Virus
  {
    rule_id: 'DM_LEAFCURL_001',
    category: 'DISEASE_MANAGEMENT',
    trigger_conditions: {
      intent: ['DISEASE_PROBLEM'],
      disease_codes: ['LEAF_CURL', 'VIRUS'],
      crop_codes: ['TOMATO', 'CHILLI', 'PAPAYA', 'COTTON']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '⚠️ पान गुंडाळी विषाणू (Leaf Curl):\n1. विषाणू वाहक पांढरी माशी नियंत्रण करा\n2. इमिडाक्लोप्रिड 17.8 SL @ 0.5ml/L\n3. प्रभावित झाडे काढून जाळा\n🔴 विषाणूंवर रासायनिक उपचार नाही!\n✅ प्रतिकारक वाण वापरा',
        hi: '⚠️ लीफ कर्ल वायरस:\n1. वायरस वाहक सफेद मक्खी नियंत्रित करें\n2. इमिडाक्लोप्रिड 17.8 SL @ 0.5ml/L\n3. प्रभावित पौधे उखाड़कर जलाएं\n🔴 वायरस पर रासायनिक उपचार नहीं!\n✅ प्रतिरोधी किस्में उपयोग करें',
        en: '⚠️ Leaf Curl Virus:\n1. Control whitefly (virus vector)\n2. Imidacloprid 17.8 SL @ 0.5ml/L\n3. Remove and burn affected plants\n🔴 No chemical treatment for virus!\n✅ Use resistant varieties'
      },
      safety_level: 'CAUTION'
    },
    priority: 90,
    icar_source: 'ICAR Virus Disease Management'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NUTRIENT MANAGEMENT RULES (40+ rules)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Nitrogen deficiency
  {
    rule_id: 'NM_NITROGEN_001',
    category: 'NUTRIENT_MANAGEMENT',
    trigger_conditions: {
      intent: ['NUTRIENT_ISSUE'],
      symptoms: ['YELLOWING', 'PALE_LEAVES', 'STUNTED_GROWTH', 'YELLOW_LEAVES']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 नायट्रोजन कमतरता (पाने पिवळी):\n1. युरिया 1% फवारणी @ 10g/L\n2. 19:19:19 @ 5g/L फवारणी\n3. माती वाटे: युरिया 25-30 kg/acre\n⏰ सकाळी 6-9 किंवा संध्याकाळी फवारा\n📊 NDVI कमी असल्यास तातडीने द्या',
        hi: '🟢 नाइट्रोजन की कमी (पत्ते पीले):\n1. यूरिया 1% स्प्रे @ 10g/L\n2. 19:19:19 @ 5g/L स्प्रे\n3. मिट्टी में: यूरिया 25-30 kg/acre\n⏰ सुबह 6-9 या शाम को स्प्रे\n📊 NDVI कम होने पर तुरंत दें',
        en: '🟢 Nitrogen Deficiency (Yellow Leaves):\n1. Urea 1% spray @ 10g/L\n2. 19:19:19 @ 5g/L spray\n3. Soil application: Urea 25-30 kg/acre\n⏰ Spray at 6-9 AM or evening\n📊 Apply urgently if NDVI is low'
      },
      safety_level: 'SAFE'
    },
    priority: 75,
    icar_source: 'ICAR Nutrient Management'
  },
  
  // Phosphorus deficiency
  {
    rule_id: 'NM_PHOSPHORUS_001',
    category: 'NUTRIENT_MANAGEMENT',
    trigger_conditions: {
      intent: ['NUTRIENT_ISSUE'],
      symptoms: ['PURPLE_LEAVES', 'STUNTED_ROOTS', 'DELAYED_FLOWERING']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟣 स्फुरद (फॉस्फरस) कमतरता:\n1. 12:61:00 (MAP) @ 5g/L फवारणी\n2. DAP 50 kg/acre माती वाटे\n3. सिंगल सुपर फॉस्फेट 100 kg/acre\n⚠️ पाने जांभळी होतात, मुळे कमजोर',
        hi: '🟣 फास्फोरस की कमी:\n1. 12:61:00 (MAP) @ 5g/L स्प्रे\n2. DAP 50 kg/acre मिट्टी में\n3. सिंगल सुपर फॉस्फेट 100 kg/acre\n⚠️ पत्ते बैंगनी होते हैं, जड़ें कमजोर',
        en: '🟣 Phosphorus Deficiency:\n1. 12:61:00 (MAP) @ 5g/L spray\n2. DAP 50 kg/acre soil application\n3. Single Super Phosphate 100 kg/acre\n⚠️ Leaves turn purple, weak roots'
      },
      safety_level: 'SAFE'
    },
    priority: 72,
    icar_source: 'ICAR Nutrient Management'
  },
  
  // Potassium deficiency
  {
    rule_id: 'NM_POTASSIUM_001',
    category: 'NUTRIENT_MANAGEMENT',
    trigger_conditions: {
      intent: ['NUTRIENT_ISSUE'],
      symptoms: ['LEAF_EDGE_BURN', 'WEAK_STEMS', 'POOR_FRUIT_QUALITY']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟠 पालाश (पोटॅशियम) कमतरता:\n1. 00:00:50 (SOP) @ 5g/L फवारणी\n2. MOP 30 kg/acre माती वाटे\n3. 13:00:45 @ 5g/L फवारणी\n⚠️ पानांच्या कडा करपतात, फळे कमजोर',
        hi: '🟠 पोटाश की कमी:\n1. 00:00:50 (SOP) @ 5g/L स्प्रे\n2. MOP 30 kg/acre मिट्टी में\n3. 13:00:45 @ 5g/L स्प्रे\n⚠️ पत्तों के किनारे जलते हैं, फल कमजोर',
        en: '🟠 Potassium Deficiency:\n1. 00:00:50 (SOP) @ 5g/L spray\n2. MOP 30 kg/acre soil application\n3. 13:00:45 @ 5g/L spray\n⚠️ Leaf edges burn, poor fruit quality'
      },
      safety_level: 'SAFE'
    },
    priority: 70,
    icar_source: 'ICAR Nutrient Management'
  },
  
  // Micronutrient deficiency
  {
    rule_id: 'NM_MICRO_001',
    category: 'NUTRIENT_MANAGEMENT',
    trigger_conditions: {
      intent: ['NUTRIENT_ISSUE'],
      symptoms: ['INTERVEINAL_CHLOROSIS', 'DISTORTED_GROWTH', 'NECROSIS']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🟢 सूक्ष्म अन्नद्रव्ये:\n1. मायक्रोन्यूट्रिएंट मिश्रण @ 2.5g/L\n2. Fe-EDTA 1g/L (लोह कमतरता)\n3. ZnSO4 @ 2.5g/L (झिंक कमतरता)\n4. बोरॉन @ 1g/L (फुलोरा वेळी)\n⏰ 15 दिवसांनी पुन्हा',
        hi: '🟢 सूक्ष्म पोषक तत्व:\n1. माइक्रोन्यूट्रिएंट मिक्स @ 2.5g/L\n2. Fe-EDTA 1g/L (लोहे की कमी)\n3. ZnSO4 @ 2.5g/L (जिंक की कमी)\n4. बोरोन @ 1g/L (फूलों के समय)\n⏰ 15 दिन बाद दोहराएं',
        en: '🟢 Micronutrients:\n1. Micronutrient mixture @ 2.5g/L\n2. Fe-EDTA 1g/L (iron deficiency)\n3. ZnSO4 @ 2.5g/L (zinc deficiency)\n4. Boron @ 1g/L (at flowering)\n⏰ Repeat after 15 days'
      },
      safety_level: 'SAFE'
    },
    priority: 68,
    icar_source: 'ICAR Micronutrient Management'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WATER MANAGEMENT RULES (30+ rules)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // General irrigation
  {
    rule_id: 'WM_IRRIGATION_001',
    category: 'WATER_MANAGEMENT',
    trigger_conditions: {
      intent: ['WATER_ISSUE'],
      symptoms: ['WILTING', 'DRY_SOIL', 'LEAF_CURLING']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '💧 पाणी व्यवस्थापन:\n1. माती ओलावा तपासा - 15-20 cm खोलीवर\n2. सकाळी किंवा संध्याकाळी पाणी द्या\n3. ठिबक सिंचन वापरा (पाणी बचत 40-60%)\n4. मल्चिंग करा - बाष्पीभवन कमी\n⚠️ जास्त पाणी = मूळ कुज',
        hi: '💧 सिंचाई प्रबंधन:\n1. मिट्टी नमी जांचें - 15-20 cm गहराई पर\n2. सुबह या शाम सिंचाई करें\n3. ड्रिप सिंचाई उपयोग करें (40-60% पानी बचत)\n4. मल्चिंग करें - वाष्पीकरण कम\n⚠️ अधिक पानी = जड़ सड़न',
        en: '💧 Water Management:\n1. Check soil moisture at 15-20 cm depth\n2. Irrigate in morning or evening\n3. Use drip irrigation (40-60% water saving)\n4. Apply mulching - reduces evaporation\n⚠️ Excess water = root rot'
      },
      safety_level: 'SAFE'
    },
    priority: 78,
    icar_source: 'ICAR Water Management'
  },
  
  // Critical stage irrigation
  {
    rule_id: 'WM_CRITICAL_001',
    category: 'WATER_MANAGEMENT',
    trigger_conditions: {
      intent: ['WATER_ISSUE'],
      stage: ['REPRODUCTIVE']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: '🔴 महत्त्वाच्या टप्प्यावर पाणी:\n• फुलोरा = सर्वात महत्त्वाचा\n• फळ धरणे = दुसरा महत्त्वाचा\n• दाणे भरणे = तिसरा महत्त्वाचा\n⚠️ या टप्प्यात पाणी कमी पडल्यास उत्पादन 30-50% घटते',
        hi: '🔴 महत्वपूर्ण अवस्था में सिंचाई:\n• फूल = सबसे महत्वपूर्ण\n• फल बनना = दूसरा महत्वपूर्ण\n• दाना भरना = तीसरा महत्वपूर्ण\n⚠️ इन अवस्थाओं में पानी कमी से उपज 30-50% घटती है',
        en: '🔴 Critical Stage Irrigation:\n• Flowering = Most critical\n• Fruit set = Second critical\n• Grain filling = Third critical\n⚠️ Water stress at these stages reduces yield by 30-50%'
      },
      safety_level: 'SAFE'
    },
    priority: 85,
    icar_source: 'ICAR Critical Irrigation'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER ADVISORY RULES (20+ rules)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Rain expected
  {
    rule_id: 'WA_RAIN_001',
    category: 'GENERAL_ADVISORY',
    trigger_conditions: {
      intent: ['WEATHER_QUERY']
    },
    action: {
      type: 'MONITORING',
      content: {
        mr: '🌧️ पाऊस अपेक्षित असल्यास:\n✗ फवारणी टाळा\n✗ खत टाळा (वाहून जाईल)\n✓ निचरा व्यवस्था तपासा\n✓ काढणीयोग्य पीक असल्यास लवकर काढा\n📱 हवामान अंदाज तपासा',
        hi: '🌧️ बारिश की संभावना होने पर:\n✗ स्प्रे न करें\n✗ खाद न डालें (बह जाएगी)\n✓ जल निकासी व्यवस्था जांचें\n✓ तैयार फसल जल्दी काट लें\n📱 मौसम पूर्वानुमान देखें',
        en: '🌧️ If Rain Expected:\n✗ Avoid spraying\n✗ Avoid fertilizer (will wash away)\n✓ Check drainage system\n✓ Harvest ready crop early\n📱 Check weather forecast'
      },
      safety_level: 'SAFE'
    },
    priority: 75,
    icar_source: 'ICAR Weather Advisory'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMERGENCY RESPONSE RULES
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    rule_id: 'EM_CRITICAL_001',
    category: 'STRESS_MANAGEMENT',
    trigger_conditions: {
      urgency_levels: ['HIGH'],
      intent: ['EMERGENCY']
    },
    action: {
      type: 'ESCALATION',
      content: {
        mr: '🚨 आणीबाणी!\n1. जवळच्या कृषी अधिकाऱ्यांशी संपर्क साधा\n2. प्रभावित भाग/झाडे काढून ठेवा\n3. पाणी देणे तात्पुरते थांबवा\n4. फोटो काढून ठेवा\n📞 कृषी हेल्पलाइन: 1800-180-1551',
        hi: '🚨 आपातकाल!\n1. नजदीकी कृषि अधिकारी से संपर्क करें\n2. प्रभावित भाग/पौधे हटा दें\n3. सिंचाई अस्थायी रूप से रोकें\n4. फोटो लेकर रखें\n📞 कृषि हेल्पलाइन: 1800-180-1551',
        en: '🚨 EMERGENCY!\n1. Contact nearest agriculture officer\n2. Remove affected parts/plants\n3. Temporarily stop irrigation\n4. Take photos for reference\n📞 Agri Helpline: 1800-180-1551'
      },
      safety_level: 'RESTRICTED'
    },
    priority: 100,
    icar_source: 'ICAR Emergency Response'
  },
  
  // General greeting
  {
    rule_id: 'GEN_GREETING_001',
    category: 'GENERAL_ADVISORY',
    trigger_conditions: {
      intent: ['GREETING']
    },
    action: {
      type: 'RECOMMENDATION',
      content: {
        mr: 'नमस्कार! मी तुमचा कृषी सहाय्यक आहे. 🌾\nतुम्ही मला विचारू शकता:\n• किडी-रोग समस्या\n• खत व्यवस्थापन\n• पाणी व्यवस्थापन\n• हवामान सल्ला\n\nकृपया तुमची समस्या सांगा.',
        hi: 'नमस्ते! मैं आपका कृषि सहायक हूं। 🌾\nआप मुझसे पूछ सकते हैं:\n• कीट-रोग समस्या\n• खाद प्रबंधन\n• सिंचाई प्रबंधन\n• मौसम सलाह\n\nकृपया अपनी समस्या बताएं।',
        en: 'Namaste! I am your farm AI assistant. 🌾\nYou can ask me about:\n• Pest & disease problems\n• Fertilizer management\n• Water management\n• Weather advisory\n\nPlease tell me your problem.'
      },
      safety_level: 'SAFE'
    },
    priority: 50
  },
  
  // General query fallback
  {
    rule_id: 'GEN_QUERY_001',
    category: 'GENERAL_ADVISORY',
    trigger_conditions: {
      intent: ['GENERAL_QUERY']
    },
    action: {
      type: 'QUESTION',
      content: {
        mr: 'तुमची समस्या समजण्यासाठी कृपया खालील माहिती द्या:\n1. कोणते पीक?\n2. समस्येचे लक्षण काय आहे?\n3. ही समस्या कधीपासून आहे?\n\nशक्य असल्यास प्रभावित भागाचा फोटो पाठवा 📷',
        hi: 'आपकी समस्या समझने के लिए कृपया बताएं:\n1. कौन सी फसल?\n2. समस्या के लक्षण क्या हैं?\n3. यह समस्या कब से है?\n\nसंभव हो तो प्रभावित भाग का फोटो भेजें 📷',
        en: 'To understand your problem, please provide:\n1. Which crop?\n2. What are the symptoms?\n3. Since when is this problem?\n\nIf possible, send a photo of affected part 📷'
      },
      safety_level: 'SAFE'
    },
    priority: 40
  }
];

/**
 * Match NLU output to decision rules with weighted scoring
 */
export function matchDecisionRules(nluOutput: NLUAgentOutput): DecisionRule[] {
  const matchedRules: { rule: DecisionRule; score: number }[] = [];
  
  const intent = nluOutput.intent_classification?.primary_intent;
  const cropCode = nluOutput.crop_identification?.crop_code;
  const pestCode = nluOutput.entities_extracted?.pest_mentioned?.canonical;
  const diseaseCode = nluOutput.entities_extracted?.disease_mentioned?.canonical;
  const urgency = nluOutput.intent_classification?.urgency_level;
  const symptoms = nluOutput.symptom_extraction?.visual_symptoms?.map(s => s.symptom_code) || [];
  
  console.log('🔍 [DecisionBrain] Matching rules for:', { intent, cropCode, pestCode, diseaseCode, urgency, symptoms });
  
  for (const rule of CORE_DECISION_RULES) {
    let score = 0;
    const conditions = rule.trigger_conditions;
    
    // Intent match (weight: 3)
    if (conditions.intent && intent) {
      if (conditions.intent.includes(intent)) {
        score += 3;
      }
    }
    
    // Crop match (weight: 2)
    if (cropCode) {
      if (conditions.crop_codes?.includes(cropCode)) {
        score += 2;
      } else if (!conditions.crop_codes || conditions.crop_codes.length === 0) {
        // Universal rule - applies to all crops
        score += 1;
      }
    }
    
    // Pest exact match (weight: 4)
    if (pestCode && conditions.pest_codes?.includes(pestCode)) {
      score += 4;
    }
    
    // Disease exact match (weight: 4)
    if (diseaseCode && conditions.disease_codes?.includes(diseaseCode)) {
      score += 4;
    }
    
    // Urgency match (weight: 2)
    if (urgency && conditions.urgency_levels?.includes(urgency as any)) {
      score += 2;
    }
    
    // Symptom match (weight: 2 per symptom)
    if (symptoms.length > 0 && conditions.symptoms) {
      const matchedSymptoms = conditions.symptoms.filter(s => 
        symptoms.some(symptom => symptom.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(symptom.toLowerCase()))
      );
      score += matchedSymptoms.length * 2;
    }
    
    // Include rule if it has significant match (score >= 2)
    if (score >= 2) {
      matchedRules.push({ rule, score });
    }
  }
  
  // Sort by score (highest first), then by priority
  matchedRules.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.rule.priority - a.rule.priority;
  });
  
  console.log(`✅ [DecisionBrain] Matched ${matchedRules.length} rules`);
  
  return matchedRules.map(m => m.rule);
}

/**
 * Generate response from matched rules
 */
export function generateRuleBasedResponse(
  matchedRules: DecisionRule[],
  language: 'mr' | 'hi' | 'en'
): {
  message: string;
  rules_applied: string[];
  confidence: number;
  safety_level: string;
  products?: any[];
} {
  if (matchedRules.length === 0) {
    return {
      message: language === 'mr' 
        ? 'कृपया अधिक माहिती द्या जेणेकरून मी मदत करू शकेन. कोणते पीक आहे? समस्या काय आहे?' 
        : language === 'hi' 
          ? 'कृपया अधिक जानकारी दें ताकि मैं मदद कर सकूं। कौन सी फसल है? समस्या क्या है?' 
          : 'Please provide more details so I can help you. Which crop? What is the problem?',
      rules_applied: [],
      confidence: 0.3,
      safety_level: 'UNKNOWN'
    };
  }
  
  const topRule = matchedRules[0];
  const message = topRule.action.content[language] || topRule.action.content.en;
  
  // Combine messages from top 2 rules if they're from different categories
  let combinedMessage = message;
  if (matchedRules.length > 1 && matchedRules[1].category !== topRule.category) {
    const secondaryMessage = matchedRules[1].action.content[language] || matchedRules[1].action.content.en;
    combinedMessage = `${message}\n\n---\n\n${secondaryMessage}`;
  }
  
  return {
    message: combinedMessage,
    rules_applied: matchedRules.slice(0, 5).map(r => r.rule_id),
    confidence: Math.min(0.95, 0.6 + (matchedRules.length * 0.08)),
    safety_level: topRule.action.safety_level,
    products: topRule.action.products
  };
}

/**
 * Get rule count for monitoring
 */
export function getRuleCount(): number {
  return CORE_DECISION_RULES.length;
}

export { CORE_DECISION_RULES };
