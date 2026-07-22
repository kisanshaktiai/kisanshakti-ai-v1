/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER MESSAGE BUILDER - Structured JSON Response Format
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 5-LAYER ARCHITECTURE OUTPUT:
 * This is the final AI Language Layer that produces farmer-friendly,
 * literacy-adapted, vernacular responses in a structured JSON format.
 * 
 * INPUT: Symbolic Decision Brain advisory (deterministic, safe)
 * OUTPUT: Structured JSON message in farmer's language
 */

import type { UnifiedAdvisory, Action, Cause } from '@/decision-graph/types-only';

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL LAND CONTEXT TYPE (Previously from deprecated decisionBrainChatService)
// ═══════════════════════════════════════════════════════════════════════════

export interface LandContext {
  land_id: string;
  land_name?: string;
  id?: string;
  name?: string;
  crop_code?: string;
  crop_group?: string;
  crop_stage?: string;
  crop_name?: string;
  current_crop?: string;
  sowing_date?: string;
  cultivation_date?: string | Date;
  area_hectares?: number;
  area_acres?: number;
  farming_mode?: string;
  irrigation_type?: string;
  location?: {
    state?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
  soil_data?: {
    n?: number;
    p?: number;
    k?: number;
    ph?: number;
    organic_carbon?: number;
    moisture?: number;
    test_date?: string | Date;
  };
  ndvi_data?: {
    value?: number;
    trend?: number;
    timestamp?: string | Date;
  };
  weather_data?: {
    temperature?: number;
    humidity?: number;
    rain_expected?: boolean;
    rain_expected_hours?: number;
    wind_speed?: number;
    timestamp?: string | Date;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED FARMER MESSAGE TYPE (Exact format from requirements)
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerMessage {
  language: string;
  literacy_adapted: boolean;
  greeting: string;
  
  problem_summary: {
    text: string;
    severity_indication: string;
    urgency: string;
  };
  
  cause_explanation: {
    text: string;
    contributing_factors: string[];
    why_now: string;
  };
  
  recommended_solution: {
    main_action: {
      title: string;
      what_to_use: string;
      how_much_land: string;
      when: string;
      why_this_time: string;
      how_to_apply: string;
    };
    supporting_actions: Array<{
      action: string;
      details: string;
      reason: string;
    }>;
    why_not_other_solutions: string;
  };
  
  safety_precautions: {
    mandatory: string[];
    important: string[];
    emergency: string;
  };
  
  follow_up: {
    day_3: string;
    day_5: string;
    day_7: string;
    alert_condition: string;
  };
  
  confidence_disclosure: {
    confidence_label: 'HIGH_CONFIDENCE' | 'GOOD_CONFIDENCE' | 'MODERATE_CONFIDENCE' | 'LOW_CONFIDENCE';
    message: string;
  };
  
  closing: string;
}

export interface FarmerMessageResponse {
  farmer_message: FarmerMessage;
  raw_text: string; // Plain text version for TTS and simple display
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

interface LanguageTemplates {
  greeting: string;
  severity: Record<string, string>;
  urgency: Record<string, string>;
  confidenceLabels: Record<string, string>;
  safetyMandatory: string[];
  safetyImportant: string[];
  emergency: string;
  closing: string;
  noActionNeeded: string;
  cropHealthy: string;
  monitorMessage: string;
}

const TEMPLATES: Record<string, LanguageTemplates> = {
  mr: {
    greeting: 'नमस्कार शेतकरी मित्रा,',
    severity: {
      CRITICAL: 'समस्या अत्यंत गंभीर आहे',
      HIGH: 'समस्या गंभीर आहे',
      MEDIUM: 'सध्या समस्या मध्यम पातळीवर आहे',
      LOW: 'समस्या कमी आहे'
    },
    urgency: {
      IMMEDIATE: 'आज लगेच उपाय करणे गरजेचे आहे',
      WITHIN_24_HOURS: '२४ तासांच्या आत योग्य उपाय करणे गरजेचे आहे',
      WITHIN_3_DAYS: '३ दिवसांच्या आत योग्य उपाय करणे गरजेचे आहे',
      WITHIN_1_WEEK: '७ दिवसांच्या आत योग्य उपाय करणे गरजेचे आहे',
      FLEXIBLE: 'सोयीनुसार उपाय करा'
    },
    confidenceLabels: {
      HIGH_CONFIDENCE: 'या सल्ल्यावर आमचा पूर्ण विश्वास आहे।',
      GOOD_CONFIDENCE: 'या सल्ल्यावर आमचा चांगला विश्वास आहे। तरीही लक्ष ठेवणे महत्त्वाचे आहे।',
      MODERATE_CONFIDENCE: 'हा सल्ला सामान्य मार्गदर्शक आहे। जास्त माहितीसाठी कृषी अधिकाऱ्यांशी संपर्क करा।',
      LOW_CONFIDENCE: 'हे प्राथमिक मार्गदर्शन आहे। कृपया कृषी तज्ञांचा सल्ला घ्या।'
    },
    safetyMandatory: [
      '✓ हातमोजे वापरा',
      '✓ तोंडावर मास्क बांधा',
      '✓ पूर्ण बाहीचे कपडे घाला'
    ],
    safetyImportant: [
      'फवारणी करताना वारा पाठीमागे ठेवा',
      'फवारणीनंतर हात साबणाने धुवा',
      'रिकाम्या बाटल्या पाण्याच्या स्त्रोतापासून दूर गाडा'
    ],
    emergency: 'जर औषध चुकून तोंडात गेले किंवा चक्कर आली तर त्वरित जवळच्या दवाखान्यात जा',
    closing: 'काळजी घ्या। पिकावर नियमित लक्ष ठेवा। आम्ही तुमच्यासोबत आहोत।',
    noActionNeeded: 'सध्या कोणतीही समस्या आढळली नाही। पीक चांगले वाढत आहे।',
    cropHealthy: 'तुमचे पीक निरोगी आहे।',
    monitorMessage: 'नियमित निरीक्षण करा।'
  },
  hi: {
    greeting: 'नमस्कार किसान भाई,',
    severity: {
      CRITICAL: 'समस्या बहुत गंभीर है',
      HIGH: 'समस्या गंभीर है',
      MEDIUM: 'अभी समस्या मध्यम स्तर पर है',
      LOW: 'समस्या कम है'
    },
    urgency: {
      IMMEDIATE: 'आज तुरंत उपाय करना जरूरी है',
      WITHIN_24_HOURS: '२४ घंटे के भीतर उचित उपाय करना जरूरी है',
      WITHIN_3_DAYS: '३ दिन के भीतर उचित उपाय करना जरूरी है',
      WITHIN_1_WEEK: '७ दिन के भीतर उचित उपाय करना जरूरी है',
      FLEXIBLE: 'सुविधानुसार उपाय करें'
    },
    confidenceLabels: {
      HIGH_CONFIDENCE: 'इस सलाह पर हमें पूर्ण विश्वास है।',
      GOOD_CONFIDENCE: 'इस सलाह पर हमें अच्छा विश्वास है। फिर भी निगरानी महत्वपूर्ण है।',
      MODERATE_CONFIDENCE: 'यह सलाह सामान्य मार्गदर्शन है। अधिक जानकारी के लिए कृषि अधिकारी से संपर्क करें।',
      LOW_CONFIDENCE: 'यह प्रारंभिक मार्गदर्शन है। कृपया कृषि विशेषज्ञ से सलाह लें।'
    },
    safetyMandatory: [
      '✓ दस्ताने पहनें',
      '✓ मुंह पर मास्क बांधें',
      '✓ पूरी बाजू के कपड़े पहनें'
    ],
    safetyImportant: [
      'छिड़काव करते समय हवा पीछे रखें',
      'छिड़काव के बाद हाथ साबुन से धोएं',
      'खाली बोतलों को पानी के स्रोत से दूर गाड़ें'
    ],
    emergency: 'अगर दवा गलती से मुंह में गई या चक्कर आए तो तुरंत नजदीकी अस्पताल जाएं',
    closing: 'ध्यान रखें। फसल पर नियमित नजर रखें। हम आपके साथ हैं।',
    noActionNeeded: 'अभी कोई समस्या नहीं मिली। फसल अच्छी बढ़ रही है।',
    cropHealthy: 'आपकी फसल स्वस्थ है।',
    monitorMessage: 'नियमित निगरानी करें।'
  },
  en: {
    greeting: 'Hello Farmer,',
    severity: {
      CRITICAL: 'The problem is very critical',
      HIGH: 'The problem is serious',
      MEDIUM: 'The problem is at a moderate level currently',
      LOW: 'The problem is minor'
    },
    urgency: {
      IMMEDIATE: 'Immediate action is required today',
      WITHIN_24_HOURS: 'Action required within 24 hours',
      WITHIN_3_DAYS: 'Action required within 3 days',
      WITHIN_1_WEEK: 'Action required within 7 days',
      FLEXIBLE: 'Take action at your convenience'
    },
    confidenceLabels: {
      HIGH_CONFIDENCE: 'We have full confidence in this advice.',
      GOOD_CONFIDENCE: 'We have good confidence in this advice. Monitoring is still important.',
      MODERATE_CONFIDENCE: 'This is general guidance. Contact an agriculture officer for more details.',
      LOW_CONFIDENCE: 'This is preliminary guidance. Please consult an agriculture expert.'
    },
    safetyMandatory: [
      '✓ Wear gloves',
      '✓ Wear a mask on face',
      '✓ Wear full-sleeve clothes'
    ],
    safetyImportant: [
      'Keep wind at your back while spraying',
      'Wash hands with soap after spraying',
      'Bury empty bottles away from water sources'
    ],
    emergency: 'If medicine accidentally enters mouth or you feel dizzy, immediately go to the nearest hospital',
    closing: 'Take care. Keep regular watch on crops. We are with you.',
    noActionNeeded: 'No issues found currently. Crop is growing well.',
    cropHealthy: 'Your crop is healthy.',
    monitorMessage: 'Continue regular monitoring.'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_DETAILS: Record<string, Record<string, { title: string; what_to_use: string; how_to_apply: string; why_this_time: string }>> = {
  mr: {
    APPLY_NEEM_OIL: {
      title: 'कडुलिंबाच्या तेलाची फवारणी',
      what_to_use: '500 मिली कडुलिंबाचे तेल 200 लिटर पाण्यात मिसळा',
      how_to_apply: 'पानांच्या वरच्या आणि खालच्या बाजूस नीट फवारणी करा',
      why_this_time: 'सकाळी थंड वातावरणात औषध चांगले कार्य करते'
    },
    IRRIGATE_IMMEDIATELY: {
      title: 'ताबडतोब पाणी द्या',
      what_to_use: 'ठिबक किंवा तुषार सिंचन वापरा',
      how_to_apply: 'संपूर्ण शेतात समान पाणी द्या',
      why_this_time: 'सकाळी लवकर किंवा संध्याकाळी पाणी द्या'
    },
    APPLY_NITROGEN: {
      title: 'युरिया खत टाका',
      what_to_use: 'युरिया 50 किलो प्रति एकर',
      how_to_apply: 'ओळीत पिकाच्या बुडाजवळ टाका, पाने ओली असताना टाकू नका',
      why_this_time: 'सकाळी ओलसर मातीत टाका'
    },
    APPLY_INSECTICIDE: {
      title: 'किटकनाशक फवारणी',
      what_to_use: 'शिफारस केलेले किटकनाशक वापरा',
      how_to_apply: 'पानांच्या दोन्ही बाजूंना फवारणी करा',
      why_this_time: 'सकाळी थंड वातावरणात फवारणी चांगली होते'
    },
    APPLY_FUNGICIDE: {
      title: 'बुरशीनाशक फवारणी',
      what_to_use: 'शिफारस केलेले बुरशीनाशक वापरा',
      how_to_apply: 'संपूर्ण पानावर फवारणी करा',
      why_this_time: 'पाऊस नसताना फवारणी करा'
    },
    MONITOR_CLOSELY: {
      title: 'बारकाईने निरीक्षण करा',
      what_to_use: 'कोणतेही औषध आवश्यक नाही',
      how_to_apply: 'दररोज सकाळी पीक तपासा',
      why_this_time: 'सकाळी थंड वातावरणात किडी सक्रिय असतात'
    }
  },
  hi: {
    APPLY_NEEM_OIL: {
      title: 'नीम तेल का छिड़काव',
      what_to_use: '500 मिली नीम तेल 200 लीटर पानी में मिलाएं',
      how_to_apply: 'पत्तियों के ऊपर और नीचे दोनों तरफ छिड़काव करें',
      why_this_time: 'सुबह ठंडे मौसम में दवाई अच्छे से काम करती है'
    },
    IRRIGATE_IMMEDIATELY: {
      title: 'तुरंत पानी दें',
      what_to_use: 'ड्रिप या स्प्रिंकलर सिंचाई का उपयोग करें',
      how_to_apply: 'पूरे खेत में समान रूप से पानी दें',
      why_this_time: 'सुबह जल्दी या शाम को पानी दें'
    },
    APPLY_NITROGEN: {
      title: 'यूरिया खाद डालें',
      what_to_use: 'यूरिया 50 किलो प्रति एकड़',
      how_to_apply: 'कतार में पौधों की जड़ के पास डालें, गीली पत्तियों पर न डालें',
      why_this_time: 'सुबह नम मिट्टी में डालें'
    },
    APPLY_INSECTICIDE: {
      title: 'कीटनाशक छिड़काव',
      what_to_use: 'अनुशंसित कीटनाशक का उपयोग करें',
      how_to_apply: 'पत्तियों के दोनों तरफ छिड़काव करें',
      why_this_time: 'सुबह ठंडे मौसम में छिड़काव अच्छा होता है'
    },
    APPLY_FUNGICIDE: {
      title: 'फफूंदनाशक छिड़काव',
      what_to_use: 'अनुशंसित फफूंदनाशक का उपयोग करें',
      how_to_apply: 'पूरी पत्ती पर छिड़काव करें',
      why_this_time: 'बारिश न होने पर छिड़काव करें'
    },
    MONITOR_CLOSELY: {
      title: 'बारीकी से निगरानी करें',
      what_to_use: 'कोई दवाई जरूरी नहीं',
      how_to_apply: 'रोजाना सुबह फसल की जांच करें',
      why_this_time: 'सुबह ठंडे मौसम में कीड़े सक्रिय रहते हैं'
    }
  },
  en: {
    APPLY_NEEM_OIL: {
      title: 'Neem Oil Spray',
      what_to_use: 'Mix 500 ml neem oil in 200 liters water',
      how_to_apply: 'Spray on both upper and lower sides of leaves',
      why_this_time: 'Medicine works better in cool morning weather'
    },
    IRRIGATE_IMMEDIATELY: {
      title: 'Irrigate Immediately',
      what_to_use: 'Use drip or sprinkler irrigation',
      how_to_apply: 'Apply water uniformly across the field',
      why_this_time: 'Water early morning or evening'
    },
    APPLY_NITROGEN: {
      title: 'Apply Urea Fertilizer',
      what_to_use: 'Urea 50 kg per acre',
      how_to_apply: 'Apply in rows near plant base, not on wet leaves',
      why_this_time: 'Apply in morning on moist soil'
    },
    APPLY_INSECTICIDE: {
      title: 'Insecticide Spray',
      what_to_use: 'Use recommended insecticide',
      how_to_apply: 'Spray on both sides of leaves',
      why_this_time: 'Spraying works better in cool morning weather'
    },
    APPLY_FUNGICIDE: {
      title: 'Fungicide Spray',
      what_to_use: 'Use recommended fungicide',
      how_to_apply: 'Spray on entire leaf surface',
      why_this_time: 'Spray when there is no rain'
    },
    MONITOR_CLOSELY: {
      title: 'Monitor Closely',
      what_to_use: 'No medicine required',
      how_to_apply: 'Check crop every morning',
      why_this_time: 'Pests are active in cool morning weather'
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE EXPLANATIONS
// ═══════════════════════════════════════════════════════════════════════════

const CAUSE_EXPLANATIONS: Record<string, Record<string, { text: string; why_now: string }>> = {
  mr: {
    WATER_STRESS: { text: 'मातीत पाणी कमी असल्याने पाने वाकडी होत आहेत।', why_now: 'या टप्प्यावर पिकाला जास्त पाण्याची गरज आहे।' },
    NITROGEN_DEFICIENCY: { text: 'नायट्रोजन कमी असल्याने पाने पिवळी पडत आहेत।', why_now: 'वाढीच्या टप्प्यात नायट्रोजनची गरज जास्त असते।' },
    SHOOT_BORER_RISK: { text: 'खोड पोखरणारी अळी मधल्या सुरळीत शिरते आणि गाभा वाळतो।', why_now: 'या टप्प्यावर किडीची वाढ वेगाने होते।' },
    HEAT_STRESS: { text: 'जास्त तापमानामुळे पाने सुकत आहेत।', why_now: 'उन्हाळ्यात तापमान वाढल्याने।' },
    APHID_RISK: { text: 'माव्याचा प्रादुर्भाव - पाने चुरळत आहेत।', why_now: 'दमट हवामानात माव्याची वाढ होते।' },
    BOLLWORM_RISK: { text: 'बोंडअळीचा धोका - फळांमध्ये छिद्रे दिसतात।', why_now: 'फुलोऱ्याच्या अवस्थेत बोंडअळी येते।' },
    OPTIMAL_GROWTH: { text: 'सध्या पीक चांगले वाढत आहे।', why_now: 'सर्व परिस्थिती अनुकूल आहे।' }
  },
  hi: {
    WATER_STRESS: { text: 'मिट्टी में पानी कम होने से पत्ते मुरझा रहे हैं।', why_now: 'इस अवस्था में फसल को ज्यादा पानी की जरूरत है।' },
    NITROGEN_DEFICIENCY: { text: 'नाइट्रोजन कम होने से पत्ते पीले पड़ रहे हैं।', why_now: 'बढ़ने की अवस्था में नाइट्रोजन की जरूरत ज्यादा होती है।' },
    SHOOT_BORER_RISK: { text: 'तना छेदक मध्य पत्ती में घुसकर गभ सुखा देता है।', why_now: 'इस अवस्था में कीड़े की बढ़त तेज होती है।' },
    HEAT_STRESS: { text: 'ज्यादा तापमान से पत्ते सूख रहे हैं।', why_now: 'गर्मी में तापमान बढ़ने से।' },
    APHID_RISK: { text: 'माहू का प्रकोप - पत्ते सिकुड़ रहे हैं।', why_now: 'नम मौसम में माहू बढ़ता है।' },
    BOLLWORM_RISK: { text: 'बॉलवर्म का खतरा - फलों में छेद दिख रहे हैं।', why_now: 'फूल आने की अवस्था में बॉलवर्म आता है।' },
    OPTIMAL_GROWTH: { text: 'अभी फसल अच्छी बढ़ रही है।', why_now: 'सभी परिस्थितियां अनुकूल हैं।' }
  },
  en: {
    WATER_STRESS: { text: 'Leaves are wilting due to low soil moisture.', why_now: 'Crop needs more water at this growth stage.' },
    NITROGEN_DEFICIENCY: { text: 'Leaves are yellowing due to nitrogen deficiency.', why_now: 'Nitrogen requirement is high during growth phase.' },
    SHOOT_BORER_RISK: { text: 'Shoot borer enters central whorl causing dead heart.', why_now: 'Pest growth is rapid at this stage.' },
    HEAT_STRESS: { text: 'Leaves are drying due to high temperature.', why_now: 'Due to rising summer temperatures.' },
    APHID_RISK: { text: 'Aphid infestation - leaves are curling.', why_now: 'Aphids multiply in humid weather.' },
    BOLLWORM_RISK: { text: 'Bollworm risk - holes visible in bolls.', why_now: 'Bollworm appears during flowering stage.' },
    OPTIMAL_GROWTH: { text: 'Crop is growing well currently.', why_now: 'All conditions are favorable.' }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function buildFarmerMessage(
  advisory: UnifiedAdvisory,
  landContext: LandContext | null,
  language: string = 'en'
): FarmerMessageResponse {
  const lang = language === 'mr' ? 'mr' : language === 'hi' ? 'hi' : 'en';
  const templates = TEMPLATES[lang] || TEMPLATES.en;
  
  const cropName = landContext?.current_crop || landContext?.crop_name || 'crop';
  const areaAcres = landContext?.area_acres || (landContext?.area_hectares ? (landContext.area_hectares * 2.47) : 1);
  
  // Determine primary cause and action
  const primaryCause = advisory.causes[0];
  const primaryAction = advisory.actions[0];
  
  // Get cause explanation
  const causeKey = primaryCause?.toString() || 'OPTIMAL_GROWTH';
  const causeExplanation = CAUSE_EXPLANATIONS[lang]?.[causeKey] || CAUSE_EXPLANATIONS.en?.[causeKey] || {
    text: templates.cropHealthy,
    why_now: templates.monitorMessage
  };
  
  // Get action details
  const actionKey = primaryAction?.action?.toString() || 'MONITOR_CLOSELY';
  const actionDetails = ACTION_DETAILS[lang]?.[actionKey] || ACTION_DETAILS.en?.[actionKey] || {
    title: templates.monitorMessage,
    what_to_use: '',
    how_to_apply: '',
    why_this_time: ''
  };
  
  // Calculate how much for land
  const howMuchLand = lang === 'mr' 
    ? `${areaAcres.toFixed(1)} एकरासाठी`
    : lang === 'hi'
    ? `${areaAcres.toFixed(1)} एकड़ के लिए`
    : `For ${areaAcres.toFixed(1)} acres`;
  
  // Determine risk level and urgency
  const riskLevel = advisory.risk_level || 'MEDIUM';
  const urgency = primaryAction?.urgency || 'WITHIN_3_DAYS';
  
  // Build contributing factors
  const contributingFactors = advisory.causes.slice(0, 3).map(cause => {
    const key = cause.toString();
    return CAUSE_EXPLANATIONS[lang]?.[key]?.text || cause.toString().replace(/_/g, ' ').toLowerCase();
  });
  
  // Build supporting actions
  const supportingActions = advisory.actions.slice(1, 3).map(action => {
    const key = action.action.toString();
    const details = ACTION_DETAILS[lang]?.[key] || ACTION_DETAILS.en?.[key];
    return {
      action: details?.title || key.replace(/_/g, ' ').toLowerCase(),
      details: details?.what_to_use || '',
      reason: details?.why_this_time || ''
    };
  });
  
  // Determine confidence
  const confidence = advisory.confidence || 0.6;
  let confidenceLabel: FarmerMessage['confidence_disclosure']['confidence_label'];
  if (confidence >= 0.85) confidenceLabel = 'HIGH_CONFIDENCE';
  else if (confidence >= 0.65) confidenceLabel = 'GOOD_CONFIDENCE';
  else if (confidence >= 0.45) confidenceLabel = 'MODERATE_CONFIDENCE';
  else confidenceLabel = 'LOW_CONFIDENCE';
  
  // Build the structured message
  const farmerMessage: FarmerMessage = {
    language: lang,
    literacy_adapted: true,
    greeting: templates.greeting,
    
    problem_summary: {
      text: advisory.causes.length > 0 
        ? `${cropName} ${causeExplanation.text}`
        : templates.noActionNeeded,
      severity_indication: templates.severity[riskLevel] || templates.severity.MEDIUM,
      urgency: templates.urgency[urgency] || templates.urgency.WITHIN_3_DAYS
    },
    
    cause_explanation: {
      text: causeExplanation.text,
      contributing_factors: contributingFactors.length > 0 ? contributingFactors : [templates.cropHealthy],
      why_now: causeExplanation.why_now
    },
    
    recommended_solution: {
      main_action: {
        title: actionDetails.title,
        what_to_use: actionDetails.what_to_use,
        how_much_land: howMuchLand,
        when: lang === 'mr' ? 'उद्या सकाळी 6 ते 10 वाजेपर्यंत' : lang === 'hi' ? 'कल सुबह 6 से 10 बजे तक' : 'Tomorrow morning 6 to 10 AM',
        why_this_time: actionDetails.why_this_time,
        how_to_apply: actionDetails.how_to_apply
      },
      supporting_actions: supportingActions,
      why_not_other_solutions: lang === 'mr' 
        ? 'रासायनिक औषधांची फवारणी सध्या योग्य नाही कारण पावसाची शक्यता आहे।'
        : lang === 'hi'
        ? 'रासायनिक दवाओं का छिड़काव अभी उचित नहीं क्योंकि बारिश की संभावना है।'
        : 'Chemical spray is not suitable now due to possibility of rain.'
    },
    
    safety_precautions: {
      mandatory: templates.safetyMandatory,
      important: templates.safetyImportant,
      emergency: templates.emergency
    },
    
    follow_up: {
      day_3: lang === 'mr' ? '३ दिवसांनी पिकावर किडीची संख्या तपासा' : lang === 'hi' ? '३ दिन बाद फसल पर कीड़ों की संख्या जांचें' : 'Check pest count on crop after 3 days',
      day_5: lang === 'mr' ? 'फोटो काढून पुन्हा पाठवा (गरज असल्यास)' : lang === 'hi' ? 'फोटो लेकर फिर से भेजें (जरूरत हो तो)' : 'Take photo and send again (if needed)',
      day_7: lang === 'mr' ? 'गरज असल्यास दुसरी फवारणी' : lang === 'hi' ? 'जरूरत हो तो दूसरा छिड़काव' : 'Second spray if needed',
      alert_condition: lang === 'mr' ? 'जर नुकसान ३०% पेक्षा जास्त वाटले तर तज्ञाशी संपर्क करा' : lang === 'hi' ? 'अगर नुकसान 30% से ज्यादा लगे तो विशेषज्ञ से संपर्क करें' : 'If damage exceeds 30%, contact an expert'
    },
    
    confidence_disclosure: {
      confidence_label: confidenceLabel,
      message: templates.confidenceLabels[confidenceLabel]
    },
    
    closing: templates.closing
  };
  
  // Build raw text version for TTS
  const rawText = buildRawTextFromMessage(farmerMessage);
  
  return {
    farmer_message: farmerMessage,
    raw_text: rawText
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Convert structured message to plain text
// ═══════════════════════════════════════════════════════════════════════════

function buildRawTextFromMessage(msg: FarmerMessage): string {
  const lines: string[] = [];
  
  lines.push(msg.greeting);
  lines.push('');
  lines.push(msg.problem_summary.text);
  lines.push(msg.problem_summary.severity_indication);
  lines.push(msg.problem_summary.urgency);
  lines.push('');
  lines.push(msg.cause_explanation.text);
  if (msg.cause_explanation.contributing_factors.length > 0) {
    lines.push(...msg.cause_explanation.contributing_factors.map(f => `• ${f}`));
  }
  lines.push('');
  lines.push(`✅ ${msg.recommended_solution.main_action.title}`);
  lines.push(`${msg.recommended_solution.main_action.what_to_use}`);
  lines.push(`${msg.recommended_solution.main_action.how_much_land}`);
  lines.push(`${msg.recommended_solution.main_action.when}`);
  lines.push(`${msg.recommended_solution.main_action.how_to_apply}`);
  lines.push('');
  lines.push(...msg.safety_precautions.mandatory);
  lines.push('');
  lines.push(`⚠️ ${msg.safety_precautions.emergency}`);
  lines.push('');
  lines.push(`📊 ${msg.confidence_disclosure.message}`);
  lines.push('');
  lines.push(msg.closing);
  
  return lines.join('\n');
}

export default buildFarmerMessage;
