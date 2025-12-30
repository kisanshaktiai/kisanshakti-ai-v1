/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRICULTURAL VOCABULARY DICTIONARY - MARATHI, HINDI, ENGLISH
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Comprehensive mapping of local agricultural terms to canonical codes.
 * Includes regional dialects, colloquialisms, and voice-to-text variations.
 */

import { AgriculturalTerm } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PEST VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_VOCABULARY: AgriculturalTerm[] = [
  {
    canonical: 'APHID',
    type: 'PEST',
    scientific_name: 'Aphis gossypii',
    terms: {
      mr: ['माशी', 'मावा', 'लहान माशी', 'हिरवी माशी', 'काळी माशी', 'माव्या'],
      hi: ['माहू', 'मावा', 'चेपा', 'तेला', 'छोटी मक्खी'],
      en: ['aphid', 'aphids', 'plant lice', 'greenfly', 'blackfly']
    }
  },
  {
    canonical: 'BOLLWORM',
    type: 'PEST',
    scientific_name: 'Helicoverpa armigera',
    terms: {
      mr: ['गाभा', 'बोंड अळी', 'अळी', 'गुलाबी अळी', 'हिरवी अळी'],
      hi: ['गाभा', 'बॉलवर्म', 'इल्ली', 'गुलाबी इल्ली', 'हरी इल्ली'],
      en: ['bollworm', 'helicoverpa', 'american bollworm', 'pod borer', 'fruit borer']
    }
  },
  {
    canonical: 'WHITEFLY',
    type: 'PEST',
    scientific_name: 'Bemisia tabaci',
    terms: {
      mr: ['पांढरी माशी', 'सफेद माशी', 'पांढरा किडा'],
      hi: ['सफेद मक्खी', 'व्हाइटफ्लाई', 'सफेद किड़ा'],
      en: ['whitefly', 'white fly', 'white flies']
    }
  },
  {
    canonical: 'THRIPS',
    type: 'PEST',
    scientific_name: 'Thrips tabaci',
    terms: {
      mr: ['फुलकिडे', 'थ्रिप्स', 'तुडतुडे', 'लहान किडे'],
      hi: ['थ्रिप्स', 'फूल किड़े', 'तुड़तुड़े'],
      en: ['thrips', 'thunder flies', 'storm bugs']
    }
  },
  {
    canonical: 'JASSID',
    type: 'PEST',
    scientific_name: 'Amrasca biguttula',
    terms: {
      mr: ['तुडतुडे', 'हिरवे तुडतुडे', 'जॅसिड'],
      hi: ['हरा तुड़तुड़ा', 'जेसिड', 'पत्ता फुदका'],
      en: ['jassid', 'leafhopper', 'cotton jassid']
    }
  },
  {
    canonical: 'MEALYBUG',
    type: 'PEST',
    scientific_name: 'Phenacoccus solenopsis',
    terms: {
      mr: ['मिलीबग', 'पांढरा किडा', 'कापूस किडा', 'चिवट किडा'],
      hi: ['मिलीबग', 'सफेद किड़ा', 'चिपचिपा किड़ा'],
      en: ['mealybug', 'mealy bug', 'cotton mealybug']
    }
  },
  {
    canonical: 'CATERPILLAR',
    type: 'PEST',
    terms: {
      mr: ['अळी', 'सुरवंट', 'हिरवी अळी', 'मोठी अळी'],
      hi: ['इल्ली', 'कैटरपिलर', 'सूंडी', 'लार्वा'],
      en: ['caterpillar', 'larvae', 'larva', 'worm']
    }
  },
  {
    canonical: 'STEM_BORER',
    type: 'PEST',
    scientific_name: 'Chilo partellus',
    terms: {
      mr: ['खोड किडा', 'खोडकिडा', 'बोअरर', 'छिद्र करणारा'],
      hi: ['तना छेदक', 'स्टेम बोरर', 'तने का किड़ा'],
      en: ['stem borer', 'stalk borer', 'shoot borer']
    }
  },
  {
    canonical: 'SHOOT_BORER',
    type: 'PEST',
    scientific_name: 'Chilo infuscatellus',
    terms: {
      // CRITICAL: Sugarcane dead heart / shoot borer patterns
      mr: ['शूट बोरर', 'मधली सुरळी', 'सुखी सुरळी', 'मधली सुरळी वाळली', 'मरलेली सुरळी', 'गाभा सुकला', 'डेड हार्ट', 'शेंडा पोखरणारी अळी', 'ऊस मधली सुरळी'],
      hi: ['शूट बोरर', 'डेड हार्ट', 'मृत मध्य', 'बीच की पत्ती सूखी', 'गन्ने का खुदक'],
      en: ['shoot borer', 'dead heart', 'early shoot borer', 'sugarcane borer', 'internode borer']
    }
  },
  {
    canonical: 'MITES',
    type: 'PEST',
    scientific_name: 'Tetranychus urticae',
    terms: {
      mr: ['कोळी', 'लाल कोळी', 'माइट'],
      hi: ['माइट', 'मकड़ी', 'लाल मकड़ी'],
      en: ['mites', 'spider mites', 'red spider mite']
    }
  },
  {
    canonical: 'ARMYWORM',
    type: 'PEST',
    scientific_name: 'Spodoptera frugiperda',
    terms: {
      mr: ['लष्करी अळी', 'आर्मीवर्म', 'सैनिक अळी'],
      hi: ['सैनिक कीट', 'आर्मीवर्म', 'सेना कीट'],
      en: ['armyworm', 'fall armyworm', 'army worm']
    }
  },
  {
    canonical: 'FRUIT_FLY',
    type: 'PEST',
    scientific_name: 'Bactrocera dorsalis',
    terms: {
      mr: ['फळ माशी', 'फ्रूट फ्लाय'],
      hi: ['फल मक्खी', 'फ्रूट फ्लाई'],
      en: ['fruit fly', 'fruit flies']
    }
  },
  {
    canonical: 'NEMATODE',
    type: 'PEST',
    scientific_name: 'Meloidogyne incognita',
    terms: {
      mr: ['सूत्रकृमी', 'नेमाटोड', 'मुळ किडा'],
      hi: ['सूत्रकृमि', 'नेमाटोड', 'जड़ का किड़ा'],
      en: ['nematode', 'root knot nematode', 'eelworm']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_VOCABULARY: AgriculturalTerm[] = [
  {
    canonical: 'POWDERY_MILDEW',
    type: 'DISEASE',
    terms: {
      mr: ['पांढरा पावडर', 'भुरी', 'पांढरी बुरशी', 'पांढरा डाग'],
      hi: ['सफेद पाउडर', 'भूरी', 'पाउडरी मिल्ड्यू', 'छछूंदर'],
      en: ['powdery mildew', 'white powder', 'pm']
    }
  },
  {
    canonical: 'DOWNY_MILDEW',
    type: 'DISEASE',
    terms: {
      mr: ['केवडा', 'डाउनी मिल्ड्यू', 'खालची बुरशी'],
      hi: ['मृदुल रोमिल', 'डाउनी मिल्ड्यू'],
      en: ['downy mildew', 'dm']
    }
  },
  {
    canonical: 'WILT',
    type: 'DISEASE',
    terms: {
      // CRITICAL FIX: Removed 'सुरळी' as it conflicts with SHOOT_BORER detection
      // 'सुरळी' alone typically means dead heart in sugarcane, not wilt
      mr: ['मर', 'विल्ट', 'झाड मरणे', 'पान कोमेजणे'],
      hi: ['म्लानि', 'विल्ट', 'मुरझाना', 'उकठा'],
      en: ['wilt', 'wilting', 'fusarium wilt', 'verticillium wilt']
    }
  },
  {
    canonical: 'BLIGHT',
    type: 'DISEASE',
    terms: {
      mr: ['करपा', 'ब्लाईट', 'पानं करपणे', 'झुलसा'],
      hi: ['झुलसा', 'ब्लाइट', 'अंगमारी'],
      en: ['blight', 'early blight', 'late blight']
    }
  },
  {
    canonical: 'RUST',
    type: 'DISEASE',
    terms: {
      mr: ['तांबेरा', 'गंज', 'रस्ट'],
      hi: ['गेरुआ', 'रस्ट', 'जंग'],
      en: ['rust', 'leaf rust', 'stem rust']
    }
  },
  {
    canonical: 'LEAF_SPOT',
    type: 'DISEASE',
    terms: {
      mr: ['पानांवर डाग', 'काळे डाग', 'तपकिरी डाग', 'पर्णदाग'],
      hi: ['पत्ती धब्बा', 'काले दाग', 'भूरे दाग'],
      en: ['leaf spot', 'spots on leaves', 'cercospora', 'alternaria']
    }
  },
  {
    canonical: 'ROOT_ROT',
    type: 'DISEASE',
    terms: {
      mr: ['मूळ कुज', 'मुळ सडणे', 'रूट रॉट'],
      hi: ['जड़ सड़न', 'रूट रॉट', 'जड़ गलना'],
      en: ['root rot', 'collar rot', 'root decay']
    }
  },
  {
    canonical: 'ANTHRACNOSE',
    type: 'DISEASE',
    terms: {
      mr: ['करप्या', 'अँथ्रॅकनोज', 'फळ कुज'],
      hi: ['एन्थ्राक्नोज', 'श्याम व्रण'],
      en: ['anthracnose', 'fruit rot']
    }
  },
  {
    canonical: 'BACTERIAL_BLIGHT',
    type: 'DISEASE',
    terms: {
      mr: ['जीवाणूजन्य करपा', 'बॅक्टेरियल ब्लाइट'],
      hi: ['जीवाणु झुलसा', 'बैक्टीरियल ब्लाइट'],
      en: ['bacterial blight', 'bacterial leaf blight', 'blb']
    }
  },
  {
    canonical: 'MOSAIC_VIRUS',
    type: 'DISEASE',
    terms: {
      mr: ['मोझॅक', 'विषाणू रोग', 'पानांवर नक्षी'],
      hi: ['मोजेक', 'वायरस', 'विषाणु रोग'],
      en: ['mosaic virus', 'virus', 'viral disease', 'ymv', 'clcuv']
    }
  },
  {
    canonical: 'DAMPING_OFF',
    type: 'DISEASE',
    terms: {
      mr: ['आर्द्रपतन', 'रोपे मरणे', 'डँपिंग ऑफ'],
      hi: ['आर्द्रगलन', 'डैम्पिंग ऑफ', 'पौधे गिरना'],
      en: ['damping off', 'seedling blight']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════

export const SYMPTOM_VOCABULARY: AgriculturalTerm[] = [
  {
    canonical: 'LEAF_YELLOWING',
    type: 'SYMPTOM',
    terms: {
      mr: ['पाने पिवळी', 'पिवळसर', 'पाने पिवळजळ', 'यलोइंग'],
      hi: ['पत्ते पीले', 'पीलापन', 'येलोइंग'],
      en: ['yellow leaves', 'yellowing', 'chlorosis']
    }
  },
  {
    canonical: 'LEAF_CURL',
    type: 'SYMPTOM',
    terms: {
      mr: ['पाने वाकडी', 'पाने मुरडणे', 'पानं वळणे', 'कर्लिंग'],
      hi: ['पत्ते मुड़ना', 'पत्ता मोड़', 'कर्लिंग'],
      en: ['leaf curl', 'curling', 'cupped leaves']
    }
  },
  {
    canonical: 'WILTING',
    type: 'SYMPTOM',
    terms: {
      mr: ['सुकणे', 'वाळणे', 'मलूल', 'झाड लटकणे'],
      hi: ['मुरझाना', 'सूखना', 'लटकना'],
      en: ['wilting', 'drooping', 'wilt']
    }
  },
  {
    canonical: 'HOLES_IN_LEAVES',
    type: 'SYMPTOM',
    terms: {
      mr: ['छिद्र', 'भोक', 'पानांना भोकं'],
      hi: ['छेद', 'छिद्र', 'पत्तों में छेद'],
      en: ['holes', 'perforations', 'shot holes']
    }
  },
  {
    canonical: 'STICKY_SUBSTANCE',
    type: 'SYMPTOM',
    terms: {
      mr: ['चिकट', 'चिवट', 'गोड पाणी', 'हनीड्यू'],
      hi: ['चिपचिपा', 'मधुरस', 'हनीड्यू'],
      en: ['sticky', 'honeydew', 'sticky substance']
    }
  },
  {
    canonical: 'BLACK_SOOTY_MOLD',
    type: 'SYMPTOM',
    terms: {
      mr: ['काळी बुरशी', 'काळपट', 'सूटी मोल्ड'],
      hi: ['काली फफूंद', 'काला दाग', 'सूटी मोल्ड'],
      en: ['black mold', 'sooty mold', 'black coating']
    }
  },
  {
    canonical: 'STUNTED_GROWTH',
    type: 'SYMPTOM',
    terms: {
      mr: ['वाढ कमी', 'लहान राहणे', 'वाढ थांबणे'],
      hi: ['बढ़त रुकना', 'छोटा रहना', 'वृद्धि रुकना'],
      en: ['stunted', 'poor growth', 'stunted growth']
    }
  },
  {
    canonical: 'DRYING',
    type: 'SYMPTOM',
    terms: {
      mr: ['सुकणे', 'वाळणे', 'करपणे', 'जळणे'],
      hi: ['सूखना', 'जलना', 'मरना'],
      en: ['drying', 'burning', 'scorching']
    }
  },
  {
    canonical: 'BROWN_SPOTS',
    type: 'SYMPTOM',
    terms: {
      mr: ['तपकिरी डाग', 'भुरे डाग', 'काळपट डाग'],
      hi: ['भूरे दाग', 'तांबे दाग'],
      en: ['brown spots', 'tan spots', 'lesions']
    }
  },
  {
    canonical: 'WHITE_POWDER',
    type: 'SYMPTOM',
    terms: {
      mr: ['पांढरी भुकटी', 'पांढरा पावडर', 'सफेद पावडर'],
      hi: ['सफेद पाउडर', 'सफेद भूरी'],
      en: ['white powder', 'powdery coating']
    }
  },
  {
    canonical: 'FRUIT_DROP',
    type: 'SYMPTOM',
    terms: {
      mr: ['फळ गळणे', 'फुले गळणे', 'गळती'],
      hi: ['फल गिरना', 'फूल गिरना', 'झड़ना'],
      en: ['fruit drop', 'flower drop', 'shedding']
    }
  },
  {
    canonical: 'WEBBING',
    type: 'SYMPTOM',
    terms: {
      mr: ['जाळे', 'कोळ्याचे जाळे'],
      hi: ['जाला', 'मकड़ी का जाला'],
      en: ['webbing', 'webs', 'spider webs']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CROP VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_VOCABULARY: AgriculturalTerm[] = [
  {
    canonical: 'COTTON',
    type: 'CROP',
    terms: {
      mr: ['कापूस', 'कापस', 'रुई'],
      hi: ['कपास', 'रूई', 'कॉटन'],
      en: ['cotton', 'bt cotton']
    }
  },
  {
    canonical: 'SOYBEAN',
    type: 'CROP',
    terms: {
      mr: ['सोयाबीन', 'सोयाबिन'],
      hi: ['सोयाबीन', 'भटमास'],
      en: ['soybean', 'soya', 'soy']
    }
  },
  {
    canonical: 'TOMATO',
    type: 'CROP',
    terms: {
      mr: ['टमाटो', 'टोमॅटो'],
      hi: ['टमाटर', 'टमाटा'],
      en: ['tomato', 'tomatoes']
    }
  },
  {
    canonical: 'CHILLI',
    type: 'CROP',
    terms: {
      mr: ['मिरची', 'हिरवी मिरची', 'लाल मिरची'],
      hi: ['मिर्च', 'मिर्ची', 'हरी मिर्च'],
      en: ['chilli', 'chili', 'pepper', 'hot pepper']
    }
  },
  {
    canonical: 'ONION',
    type: 'CROP',
    terms: {
      mr: ['कांदा', 'कांदे'],
      hi: ['प्याज', 'प्याजा'],
      en: ['onion', 'onions']
    }
  },
  {
    canonical: 'WHEAT',
    type: 'CROP',
    terms: {
      mr: ['गहू'],
      hi: ['गेहूं', 'गेहूँ'],
      en: ['wheat']
    }
  },
  {
    canonical: 'RICE',
    type: 'CROP',
    terms: {
      mr: ['भात', 'तांदूळ', 'धान'],
      hi: ['धान', 'चावल', 'पैडी'],
      en: ['rice', 'paddy']
    }
  },
  {
    canonical: 'MAIZE',
    type: 'CROP',
    terms: {
      mr: ['मका'],
      hi: ['मक्का', 'भुट्टा'],
      en: ['maize', 'corn']
    }
  },
  {
    canonical: 'SUGARCANE',
    type: 'CROP',
    terms: {
      mr: ['ऊस'],
      hi: ['गन्ना', 'ईख'],
      en: ['sugarcane', 'sugar cane']
    }
  },
  {
    canonical: 'BRINJAL',
    type: 'CROP',
    terms: {
      mr: ['वांगी', 'वांगे'],
      hi: ['बैंगन', 'बैगन'],
      en: ['brinjal', 'eggplant', 'aubergine']
    }
  },
  {
    canonical: 'GROUNDNUT',
    type: 'CROP',
    terms: {
      mr: ['भुईमूग', 'शेंगदाणे'],
      hi: ['मूंगफली', 'मूंगफुली'],
      en: ['groundnut', 'peanut']
    }
  },
  {
    canonical: 'GRAM',
    type: 'CROP',
    terms: {
      mr: ['हरभरा', 'चणा'],
      hi: ['चना', 'चने'],
      en: ['gram', 'chickpea', 'bengal gram']
    }
  },
  {
    canonical: 'PIGEON_PEA',
    type: 'CROP',
    terms: {
      mr: ['तूर', 'तूरडाळ'],
      hi: ['अरहर', 'तुअर'],
      en: ['pigeon pea', 'tur dal', 'arhar']
    }
  },
  {
    canonical: 'BANANA',
    type: 'CROP',
    terms: {
      mr: ['केळी', 'केळ'],
      hi: ['केला', 'केले'],
      en: ['banana', 'plantain']
    }
  },
  {
    canonical: 'POMEGRANATE',
    type: 'CROP',
    terms: {
      mr: ['डाळिंब'],
      hi: ['अनार'],
      en: ['pomegranate']
    }
  },
  {
    canonical: 'GRAPES',
    type: 'CROP',
    terms: {
      mr: ['द्राक्षे', 'द्राक्ष'],
      hi: ['अंगूर'],
      en: ['grapes', 'grape']
    }
  },
  {
    canonical: 'ORANGE',
    type: 'CROP',
    terms: {
      mr: ['संत्रा', 'संत्री', 'नारंगी'],
      hi: ['संतरा', 'नारंगी'],
      en: ['orange', 'mandarin', 'citrus']
    }
  },
  {
    canonical: 'TURMERIC',
    type: 'CROP',
    terms: {
      mr: ['हळद'],
      hi: ['हल्दी'],
      en: ['turmeric']
    }
  },
  {
    canonical: 'GINGER',
    type: 'CROP',
    terms: {
      mr: ['आले'],
      hi: ['अदरक'],
      en: ['ginger']
    }
  },
  {
    canonical: 'POTATO',
    type: 'CROP',
    terms: {
      mr: ['बटाटा', 'बटाटे'],
      hi: ['आलू'],
      en: ['potato', 'potatoes']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIZER & CHEMICAL VOCABULARY
// ═══════════════════════════════════════════════════════════════════════════

export const FERTILIZER_VOCABULARY: AgriculturalTerm[] = [
  {
    canonical: 'UREA',
    type: 'FERTILIZER',
    terms: {
      mr: ['युरिया', 'यूरिया'],
      hi: ['यूरिया', 'युरिया'],
      en: ['urea']
    }
  },
  {
    canonical: 'DAP',
    type: 'FERTILIZER',
    terms: {
      mr: ['डीएपी', 'DAP'],
      hi: ['डीएपी', 'DAP'],
      en: ['dap', 'di-ammonium phosphate']
    }
  },
  {
    canonical: 'MOP',
    type: 'FERTILIZER',
    terms: {
      mr: ['पोटॅश', 'MOP', 'मुरेट ऑफ पोटॅश'],
      hi: ['पोटाश', 'MOP'],
      en: ['mop', 'muriate of potash', 'potash']
    }
  },
  {
    canonical: 'NPK',
    type: 'FERTILIZER',
    terms: {
      mr: ['एनपीके', 'NPK', '१९:१९:१९', '10:26:26'],
      hi: ['एनपीके', 'NPK'],
      en: ['npk', '19:19:19', '10:26:26']
    }
  },
  {
    canonical: 'SSP',
    type: 'FERTILIZER',
    terms: {
      mr: ['SSP', 'सिंगल सुपर फॉस्फेट'],
      hi: ['SSP', 'सिंगल सुपर फास्फेट'],
      en: ['ssp', 'single super phosphate']
    }
  },
  {
    canonical: 'ZINC_SULPHATE',
    type: 'FERTILIZER',
    terms: {
      mr: ['झिंक सल्फेट', 'जस्त'],
      hi: ['जिंक सल्फेट', 'जस्ता'],
      en: ['zinc sulphate', 'zinc sulfate']
    }
  },
  {
    canonical: 'FERROUS_SULPHATE',
    type: 'FERTILIZER',
    terms: {
      mr: ['फेरस सल्फेट', 'लोह'],
      hi: ['फेरस सल्फेट', 'लोहा'],
      en: ['ferrous sulphate', 'iron sulphate']
    }
  },
  {
    canonical: 'CALCIUM_NITRATE',
    type: 'FERTILIZER',
    terms: {
      mr: ['कॅल्शियम नायट्रेट'],
      hi: ['कैल्शियम नाइट्रेट'],
      en: ['calcium nitrate', 'can']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// URGENCY INDICATORS
// ═══════════════════════════════════════════════════════════════════════════

export const URGENCY_PATTERNS = {
  high: {
    mr: [
      'ताबडतोब', 'लगेच', 'तातडीने', 'संपलं', 'मरतंय', 'वाचवा', 'काय करणार', 
      'सगळं खराब', 'पूर्ण नष्ट', 'अति गंभीर', 'खूप वाईट'
    ],
    hi: [
      'तुरंत', 'जल्दी', 'तातकालिक', 'मर रहा', 'बचाओ', 'क्या करें', 
      'सब खराब', 'पूरा खराब', 'बहुत गंभीर'
    ],
    en: [
      'immediately', 'urgent', 'emergency', 'dying', 'save', 'help', 
      'destroyed', 'severe', 'critical'
    ]
  },
  medium: {
    mr: ['लवकर', 'आज', 'उद्या', 'काळजी वाटते', 'समस्या आहे'],
    hi: ['जल्दी', 'आज', 'कल', 'चिंता है', 'समस्या है'],
    en: ['soon', 'today', 'tomorrow', 'worried', 'problem']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// EMOTIONAL STATE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

export const EMOTION_PATTERNS = {
  panic: {
    mr: ['सगळं संपलं', 'काय करणार', 'वाचवा', 'सर्वनाश', 'नाश झाला', '!!!'],
    hi: ['सब खत्म', 'क्या करें', 'बचाओ', 'सर्वनाश', 'बर्बाद', '!!!'],
    en: ['everything gone', 'what to do', 'save', 'destroyed', 'ruined', '!!!']
  },
  stressed: {
    mr: ['काळजी', 'चिंता', 'भीती', 'समजेना'],
    hi: ['चिंता', 'डर', 'समझ नहीं'],
    en: ['worried', 'concerned', 'scared', 'confused']
  },
  neutral: {
    mr: ['माहिती हवी', 'कृपया सांगा', 'मदत करा'],
    hi: ['जानकारी चाहिए', 'बताएं', 'मदद करें'],
    en: ['information', 'please tell', 'help']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function findCanonicalTerm(
  text: string,
  vocabulary: AgriculturalTerm[]
): { canonical: string; localTerm: string; confidence: number } | null {
  const normalizedText = text.toLowerCase().trim();
  
  for (const term of vocabulary) {
    for (const [lang, terms] of Object.entries(term.terms)) {
      for (const t of terms) {
        if (normalizedText.includes(t.toLowerCase())) {
          return {
            canonical: term.canonical,
            localTerm: t,
            confidence: 0.9
          };
        }
      }
    }
  }
  
  return null;
}

export function getAllCropTerms(): Map<string, string> {
  const map = new Map<string, string>();
  for (const crop of CROP_VOCABULARY) {
    for (const terms of Object.values(crop.terms)) {
      for (const term of terms) {
        map.set(term.toLowerCase(), crop.canonical);
      }
    }
  }
  return map;
}

export function getAllPestTerms(): Map<string, string> {
  const map = new Map<string, string>();
  for (const pest of PEST_VOCABULARY) {
    for (const terms of Object.values(pest.terms)) {
      for (const term of terms) {
        map.set(term.toLowerCase(), pest.canonical);
      }
    }
  }
  return map;
}

export function getAllDiseaseTerms(): Map<string, string> {
  const map = new Map<string, string>();
  for (const disease of DISEASE_VOCABULARY) {
    for (const terms of Object.values(disease.terms)) {
      for (const term of terms) {
        map.set(term.toLowerCase(), disease.canonical);
      }
    }
  }
  return map;
}

export function getAllSymptomTerms(): Map<string, string> {
  const map = new Map<string, string>();
  for (const symptom of SYMPTOM_VOCABULARY) {
    for (const terms of Object.values(symptom.terms)) {
      for (const term of terms) {
        map.set(term.toLowerCase(), symptom.canonical);
      }
    }
  }
  return map;
}
