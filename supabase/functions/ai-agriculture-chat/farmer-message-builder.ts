/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER MESSAGE BUILDER - AI Language Layer (Layer 4)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Final layer in the 5-Layer Architecture:
 * 
 * Farmer Language → AI Understanding → Structured Meaning → 
 * Symbolic Decision Brain → AI Language Layer (THIS)
 * 
 * Converts symbolic decision brain output into farmer-friendly,
 * literacy-adapted, vernacular structured JSON response.
 */

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED FARMER MESSAGE TYPE
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
  raw_text: string;
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
  followUpDay3: string;
  followUpDay5: string;
  followUpDay7: string;
  alertCondition: string;
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
    monitorMessage: 'नियमित निरीक्षण करा।',
    followUpDay3: '३ दिवसांनी पिकावर किडीची संख्या तपासा',
    followUpDay5: 'फोटो काढून पुन्हा पाठवा (गरज असल्यास)',
    followUpDay7: 'गरज असल्यास दुसरी फवारणी',
    alertCondition: 'जर नुकसान ३०% पेक्षा जास्त वाटले तर तज्ञाशी संपर्क करा'
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
    monitorMessage: 'नियमित निगरानी करें।',
    followUpDay3: '३ दिन बाद फसल पर कीड़ों की संख्या जांचें',
    followUpDay5: 'फोटो लेकर फिर भेजें (जरूरत हो तो)',
    followUpDay7: 'जरूरत हो तो दूसरा छिड़काव करें',
    alertCondition: 'अगर नुकसान ३०% से ज्यादा लगे तो विशेषज्ञ से संपर्क करें'
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
    monitorMessage: 'Continue regular monitoring.',
    followUpDay3: 'Check pest count on crop after 3 days',
    followUpDay5: 'Take photo and send again (if needed)',
    followUpDay7: 'Second spray if needed',
    alertCondition: 'If damage appears more than 30%, contact an expert'
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
      how_to_apply: 'Check crop daily in the morning',
      why_this_time: 'Pests are active in cool morning weather'
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionBrainOutput {
  riskLevel: string;
  causes: string[];
  actions: Array<{
    action: string;
    priority?: number;
    product?: {
      name?: string;
      dose?: string;
    };
    timing?: string;
  }>;
  confidence: number;
  rulesApplied?: string[];
}

export interface LandContextForMessage {
  cropName?: string;
  areaAcres?: number;
  growthStage?: string;
  farmingMode?: string;
}

export function buildFarmerMessage(
  decisionOutput: DecisionBrainOutput,
  language: string = 'hi',
  landContext?: LandContextForMessage
): FarmerMessageResponse {
  const lang = language === 'mr' ? 'mr' : language === 'hi' ? 'hi' : 'en';
  const t = TEMPLATES[lang];
  const actionDetails = ACTION_DETAILS[lang];
  
  // Map risk level to severity
  const severityMap: Record<string, string> = {
    'CRITICAL': 'CRITICAL',
    'HIGH': 'HIGH',
    'MEDIUM': 'MEDIUM',
    'LOW': 'LOW'
  };
  const severity = severityMap[decisionOutput.riskLevel] || 'MEDIUM';
  
  // Map confidence to label
  let confidenceLabel: FarmerMessage['confidence_disclosure']['confidence_label'];
  if (decisionOutput.confidence >= 0.85) {
    confidenceLabel = 'HIGH_CONFIDENCE';
  } else if (decisionOutput.confidence >= 0.65) {
    confidenceLabel = 'GOOD_CONFIDENCE';
  } else if (decisionOutput.confidence >= 0.45) {
    confidenceLabel = 'MODERATE_CONFIDENCE';
  } else {
    confidenceLabel = 'LOW_CONFIDENCE';
  }
  
  // Build problem summary
  const problemText = decisionOutput.causes.length > 0
    ? buildProblemText(decisionOutput.causes, lang, landContext?.cropName)
    : t.noActionNeeded;
  
  // Get primary action
  const primaryAction = decisionOutput.actions[0];
  const actionCode = primaryAction?.action || 'MONITOR_CLOSELY';
  const actionInfo = actionDetails[actionCode] || actionDetails['MONITOR_CLOSELY'];
  
  // Calculate area-specific dosage
  const areaAcres = landContext?.areaAcres || 1;
  const areaText = lang === 'mr' 
    ? `${(areaAcres * 40).toFixed(0)} गुंठा (${areaAcres.toFixed(2)} एकर)`
    : lang === 'hi'
      ? `${areaAcres.toFixed(2)} एकड़`
      : `${areaAcres.toFixed(2)} acres`;
  
  // Determine urgency based on risk level
  const urgencyLevel = severity === 'CRITICAL' ? 'IMMEDIATE' 
    : severity === 'HIGH' ? 'WITHIN_24_HOURS'
    : severity === 'MEDIUM' ? 'WITHIN_3_DAYS'
    : 'WITHIN_1_WEEK';
  
  // Build supporting actions
  const supportingActions = decisionOutput.actions.slice(1, 3).map(action => ({
    action: actionDetails[action.action]?.title || action.action,
    details: action.product?.dose || '',
    reason: action.timing || ''
  }));
  
  // Build farmer message
  const farmerMessage: FarmerMessage = {
    language: lang,
    literacy_adapted: true,
    greeting: t.greeting,
    
    problem_summary: {
      text: problemText,
      severity_indication: t.severity[severity],
      urgency: t.urgency[urgencyLevel]
    },
    
    cause_explanation: {
      text: buildCauseExplanation(decisionOutput.causes, lang),
      contributing_factors: decisionOutput.causes.slice(0, 3).map(c => translateCause(c, lang)),
      why_now: buildWhyNow(landContext?.growthStage, lang)
    },
    
    recommended_solution: {
      main_action: {
        title: actionInfo.title,
        what_to_use: actionInfo.what_to_use,
        how_much_land: areaText,
        when: lang === 'mr' ? 'उद्या सकाळी 6 ते 10 वाजेपर्यंत' 
            : lang === 'hi' ? 'कल सुबह 6 से 10 बजे के बीच'
            : 'Tomorrow morning between 6-10 AM',
        why_this_time: actionInfo.why_this_time,
        how_to_apply: actionInfo.how_to_apply
      },
      supporting_actions: supportingActions,
      why_not_other_solutions: buildWhyNotOtherSolutions(decisionOutput.riskLevel, lang, landContext?.farmingMode)
    },
    
    safety_precautions: {
      mandatory: t.safetyMandatory,
      important: t.safetyImportant,
      emergency: t.emergency
    },
    
    follow_up: {
      day_3: t.followUpDay3,
      day_5: t.followUpDay5,
      day_7: t.followUpDay7,
      alert_condition: t.alertCondition
    },
    
    confidence_disclosure: {
      confidence_label: confidenceLabel,
      message: t.confidenceLabels[confidenceLabel]
    },
    
    closing: t.closing
  };
  
  // Build raw text for TTS
  const rawText = buildRawTextFromMessage(farmerMessage, lang);
  
  return {
    farmer_message: farmerMessage,
    raw_text: rawText
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildProblemText(causes: string[], lang: string, cropName?: string): string {
  const cropText = cropName || (lang === 'mr' ? 'तुमच्या पिकावर' : lang === 'hi' ? 'आपकी फसल पर' : 'on your crop');
  
  if (causes.length === 0) {
    return lang === 'mr' ? 'कोणतीही समस्या आढळली नाही।' 
         : lang === 'hi' ? 'कोई समस्या नहीं मिली।'
         : 'No issues found.';
  }
  
  const causeTranslations = causes.slice(0, 2).map(c => translateCause(c, lang));
  
  if (lang === 'mr') {
    return `${cropText} ${causeTranslations.join(' आणि ')} या समस्या दिसत आहेत।`;
  } else if (lang === 'hi') {
    return `${cropText} ${causeTranslations.join(' और ')} ये समस्याएं दिख रही हैं।`;
  } else {
    return `${cropText} is showing signs of ${causeTranslations.join(' and ')}.`;
  }
}

function translateCause(cause: string, lang: string): string {
  const causeTranslations: Record<string, Record<string, string>> = {
    'APHID_INFESTATION': {
      mr: 'माशी (एफिड)',
      hi: 'माहू (एफिड)',
      en: 'Aphid infestation'
    },
    'POWDERY_MILDEW_FUNGUS': {
      mr: 'पांढरा पावडर (पावडरी मिल्ड्यू)',
      hi: 'सफेद पाउडर (पाउडरी मिल्ड्यू)',
      en: 'Powdery Mildew'
    },
    'NITROGEN_DEFICIENCY': {
      mr: 'नत्राची कमतरता',
      hi: 'नाइट्रोजन की कमी',
      en: 'Nitrogen deficiency'
    },
    'WATER_STRESS': {
      mr: 'पाण्याची कमतरता',
      hi: 'पानी की कमी',
      en: 'Water stress'
    },
    'FUNGAL_INFECTION': {
      mr: 'बुरशीजन्य संसर्ग',
      hi: 'फफूंद संक्रमण',
      en: 'Fungal infection'
    }
  };
  
  return causeTranslations[cause]?.[lang] || cause;
}

function buildCauseExplanation(causes: string[], lang: string): string {
  if (causes.length === 0) {
    return lang === 'mr' ? 'पीक निरोगी आहे।'
         : lang === 'hi' ? 'फसल स्वस्थ है।'
         : 'Crop is healthy.';
  }
  
  const primaryCause = causes[0];
  
  if (lang === 'mr') {
    if (primaryCause.includes('APHID')) {
      return 'माशी पानांचा रस शोषून घेत असल्यामुळे पाने वाकडी होत आहेत।';
    } else if (primaryCause.includes('NITROGEN')) {
      return 'जमिनीत नत्राची कमतरता असल्यामुळे पाने पिवळी पडत आहेत।';
    }
    return 'समस्येचे कारण ओळखले आहे।';
  } else if (lang === 'hi') {
    if (primaryCause.includes('APHID')) {
      return 'माहू पत्तियों का रस चूस रहे हैं इसलिए पत्ते मुड़ रहे हैं।';
    } else if (primaryCause.includes('NITROGEN')) {
      return 'मिट्टी में नाइट्रोजन की कमी से पत्ते पीले पड़ रहे हैं।';
    }
    return 'समस्या का कारण पहचाना गया है।';
  }
  
  return 'Cause has been identified.';
}

function buildWhyNow(growthStage: string | undefined, lang: string): string {
  if (lang === 'mr') {
    return growthStage 
      ? `${growthStage} अवस्थेत किडीची वाढ वेगाने होते`
      : 'या हंगामात किडीचा प्रादुर्भाव सामान्य आहे';
  } else if (lang === 'hi') {
    return growthStage
      ? `${growthStage} अवस्था में कीड़ों की वृद्धि तेज होती है`
      : 'इस मौसम में कीड़ों का प्रकोप सामान्य है';
  }
  return growthStage 
    ? `Pest growth is rapid during ${growthStage} stage`
    : 'Pest outbreak is common during this season';
}

function buildWhyNotOtherSolutions(riskLevel: string, lang: string, farmingMode?: string): string {
  const isOrganic = farmingMode?.toUpperCase() === 'ORGANIC';
  
  if (lang === 'mr') {
    if (isOrganic) {
      return 'तुम्ही सेंद्रिय शेती करत असल्याने रासायनिक औषधे वापरत नाही।';
    }
    return 'रासायनिक औषधांची फवारणी सध्या योग्य नाही कारण पावसाची शक्यता आहे।';
  } else if (lang === 'hi') {
    if (isOrganic) {
      return 'आप जैविक खेती करते हैं इसलिए रासायनिक दवाइयां नहीं दी जा रहीं।';
    }
    return 'रासायनिक दवाई का छिड़काव अभी उचित नहीं क्योंकि बारिश की संभावना है।';
  }
  
  if (isOrganic) {
    return 'Chemical solutions not recommended as you practice organic farming.';
  }
  return 'Chemical spray is not ideal now due to expected rain.';
}

function buildRawTextFromMessage(msg: FarmerMessage, lang: string): string {
  const lines: string[] = [];
  
  lines.push(msg.greeting);
  lines.push('');
  lines.push(msg.problem_summary.text);
  lines.push(msg.problem_summary.severity_indication);
  lines.push(msg.problem_summary.urgency);
  lines.push('');
  lines.push(msg.cause_explanation.text);
  lines.push('');
  lines.push(msg.recommended_solution.main_action.title);
  lines.push(msg.recommended_solution.main_action.what_to_use);
  lines.push(msg.recommended_solution.main_action.when);
  lines.push(msg.recommended_solution.main_action.how_to_apply);
  lines.push('');
  
  if (msg.safety_precautions.mandatory.length > 0) {
    lines.push(...msg.safety_precautions.mandatory);
  }
  
  lines.push('');
  lines.push(msg.confidence_disclosure.message);
  lines.push('');
  lines.push(msg.closing);
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTHY CROP RESPONSE
// ═══════════════════════════════════════════════════════════════════════════

export function buildHealthyCropMessage(
  language: string = 'hi',
  landContext?: LandContextForMessage
): FarmerMessageResponse {
  const lang = language === 'mr' ? 'mr' : language === 'hi' ? 'hi' : 'en';
  const t = TEMPLATES[lang];
  
  const farmerMessage: FarmerMessage = {
    language: lang,
    literacy_adapted: true,
    greeting: t.greeting,
    
    problem_summary: {
      text: t.cropHealthy,
      severity_indication: '',
      urgency: ''
    },
    
    cause_explanation: {
      text: t.noActionNeeded,
      contributing_factors: [],
      why_now: ''
    },
    
    recommended_solution: {
      main_action: {
        title: t.monitorMessage,
        what_to_use: '',
        how_much_land: '',
        when: '',
        why_this_time: '',
        how_to_apply: ''
      },
      supporting_actions: [],
      why_not_other_solutions: ''
    },
    
    safety_precautions: {
      mandatory: [],
      important: [],
      emergency: ''
    },
    
    follow_up: {
      day_3: t.followUpDay3,
      day_5: '',
      day_7: '',
      alert_condition: ''
    },
    
    confidence_disclosure: {
      confidence_label: 'HIGH_CONFIDENCE',
      message: t.confidenceLabels['HIGH_CONFIDENCE']
    },
    
    closing: t.closing
  };
  
  const rawText = buildRawTextFromMessage(farmerMessage, lang);
  
  return {
    farmer_message: farmerMessage,
    raw_text: rawText
  };
}
