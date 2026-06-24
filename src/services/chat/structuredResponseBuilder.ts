/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURED RESPONSE BUILDER - KisanShakti AI Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * STEP 5: RESPONSE CONSTRUCTION RULES
 * 
 * Your response MUST follow this structure:
 * 1️⃣ Field understanding (1 line) - Explain what you understand about the field
 * 2️⃣ Why it matters (1–2 lines) - Agronomic reasoning in simple farmer language
 * 3️⃣ Best action NOW - Only one clear recommendation
 * 4️⃣ Time window - When exactly to do it
 * 5️⃣ Confidence disclosure - Mention certainty level if data is partial
 * 
 * STEP 6: FOLLOW-UP INTELLIGENCE
 * - Define what should change
 * - Define when it should be checked
 * - Guide farmer what to observe next
 */

import type { FieldContextSnapshot, DataCertaintyLevel } from './fieldContextSnapshot';
import type { MessageClassification } from './farmerMessageClassifier';
import type { ActionItem, ConfidenceInfo, BlockedAction } from '@/components/chat/DecisionBrainCards';
import type { UnifiedAdvisory, Cause } from '@/decision-graph/types-only';
import { Action } from '@/decision-graph/types-only';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface StructuredResponse {
  // 1️⃣ Field Understanding
  fieldUnderstanding: string;
  
  // 2️⃣ Why It Matters
  whyItMatters: string;
  
  // 3️⃣ Best Action NOW (only ONE)
  bestActionNow: {
    action: string;
    details: string;
    quantity?: string;
  } | null;
  
  // 4️⃣ Time Window
  timeWindow: string;
  
  // 5️⃣ Confidence Disclosure
  confidenceDisclosure: string;
  
  // 6️⃣ Follow-up Intelligence
  followUp: {
    whatShouldChange: string;
    whenToCheck: string;
    whatToObserve: string;
  };
  
  // Complete farmer-friendly message
  farmerMessage: string;
  
  // Language
  language: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a structured response following the 5-part format
 */
export function buildStructuredResponse(
  fieldSnapshot: FieldContextSnapshot,
  advisory: UnifiedAdvisory,
  classification: MessageClassification,
  language: string
): StructuredResponse {
  const certainty = fieldSnapshot.dataFreshness.overallCertainty;
  
  // 1️⃣ Field Understanding
  const fieldUnderstanding = buildFieldUnderstanding(fieldSnapshot, language);
  
  // 2️⃣ Why It Matters
  const whyItMatters = buildWhyItMatters(advisory.causes, fieldSnapshot, language);
  
  // 3️⃣ Best Action NOW (only ONE primary action)
  const bestActionNow = buildBestActionNow(advisory, certainty, language);
  
  // 4️⃣ Time Window
  const timeWindow = buildTimeWindow(advisory, language);
  
  // 5️⃣ Confidence Disclosure
  const confidenceDisclosure = buildConfidenceDisclosure(certainty, fieldSnapshot, language);
  
  // 6️⃣ Follow-up Intelligence
  const followUp = buildFollowUpIntelligence(advisory, fieldSnapshot, language);
  
  // Combine into farmer-friendly message
  const farmerMessage = assembleMessage(
    fieldUnderstanding,
    whyItMatters,
    bestActionNow,
    timeWindow,
    confidenceDisclosure,
    followUp,
    language
  );
  
  return {
    fieldUnderstanding,
    whyItMatters,
    bestActionNow,
    timeWindow,
    confidenceDisclosure,
    followUp,
    farmerMessage,
    language
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildFieldUnderstanding(snapshot: FieldContextSnapshot, language: string): string {
  const { cropName, daysAfterSowing, growthStage, areaGunta, areaAcres } = snapshot;
  
  // Format area - prefer Gunta for small farms
  const areaText = areaGunta <= 40 
    ? `${Math.round(areaGunta)} गुंठा` 
    : `${areaAcres.toFixed(2)} एकर`;
  
  const stageText = formatStage(growthStage, language, cropName);
  
  if (language === 'mr') {
    return `तुमचा ${cropName} सध्या ${stageText} (${daysAfterSowing} दिवस) आहे।`;
  } else if (language === 'hi') {
    return `आपका ${cropName} अभी ${stageText} (${daysAfterSowing} दिन) में है।`;
  } else {
    return `Your ${cropName} is currently in ${stageText} (Day ${daysAfterSowing}).`;
  }
}

function buildWhyItMatters(causes: Cause[], snapshot: FieldContextSnapshot, language: string): string {
  if (causes.length === 0) {
    if (language === 'mr') {
      return 'सध्या कोणतीही विशेष समस्या आढळली नाही।';
    } else if (language === 'hi') {
      return 'अभी कोई विशेष समस्या नहीं मिली।';
    } else {
      return 'No specific issues detected at this time.';
    }
  }
  
  // Get the primary cause and explain in farmer language
  const primaryCause = causes[0];
  const causeExplanation = getCauseExplanation(primaryCause, snapshot, language);
  
  return causeExplanation;
}

function getCauseExplanation(cause: Cause, snapshot: FieldContextSnapshot, language: string): string {
  const causeStr = cause.toString();
  
  const explanations: Record<string, Record<string, string>> = {
    mr: {
      WATER_STRESS: 'या टप्प्यावर पाण्याची कमतरता असल्याने पिकाची वाढ मंदावते।',
      NITROGEN_DEFICIENCY: 'नायट्रोजन कमी असल्याने पाने पिवळी पडतात आणि वाढ कमी होते।',
      SHOOT_BORER_RISK: 'खोड पोखरणारी अळी मधल्या सुरळीत शिरते आणि गाभा वाळतो।',
      STEM_BORER_RISK: 'शेंडा पोखरणारी अळीमुळे मधली सुरळी वाळते।',
      HEAT_STRESS: 'जास्त तापमानामुळे पिकावर ताण येतो।',
      WEED_PRESSURE: 'या टप्प्यावर गवत पोषकद्रव्ये घेत असल्याने वाढ मंदावते।',
      OPTIMAL_GROWTH: 'पीक चांगले वाढत आहे, नियमित निरीक्षण करा।',
      HARVEST_READY: 'पीक कापणीसाठी तयार आहे।'
    },
    hi: {
      WATER_STRESS: 'इस अवस्था में पानी की कमी से फसल की वृद्धि रुक जाती है।',
      NITROGEN_DEFICIENCY: 'नाइट्रोजन की कमी से पत्ते पीले पड़ते हैं और वृद्धि कम होती है।',
      SHOOT_BORER_RISK: 'तना छेदक अली मध्य पत्ती में घुसकर गभ सुखा देता है।',
      STEM_BORER_RISK: 'शीर्ष छेदक के कारण मध्य पत्ती सूख जाती है।',
      HEAT_STRESS: 'अधिक तापमान से फसल पर तनाव पड़ता है।',
      WEED_PRESSURE: 'इस अवस्था में खरपतवार पोषक तत्व लेने से वृद्धि धीमी होती है।',
      OPTIMAL_GROWTH: 'फसल अच्छी बढ़ रही है, नियमित निगरानी करें।',
      HARVEST_READY: 'फसल कटाई के लिए तैयार है।'
    },
    en: {
      WATER_STRESS: 'At this stage, water stress slows down crop growth significantly.',
      NITROGEN_DEFICIENCY: 'Nitrogen deficiency causes yellowing leaves and reduced growth.',
      SHOOT_BORER_RISK: 'Early shoot borer enters the central whorl and causes dead heart.',
      STEM_BORER_RISK: 'Top borer causes the central whorl to dry up.',
      HEAT_STRESS: 'High temperature causes stress on the crop.',
      WEED_PRESSURE: 'At this stage, weeds compete for nutrients and slow growth.',
      OPTIMAL_GROWTH: 'Crop is growing well, continue regular monitoring.',
      HARVEST_READY: 'Crop is ready for harvest.'
    }
  };
  
  const lang = explanations[language] || explanations.en;
  
  for (const [key, explanation] of Object.entries(lang)) {
    if (causeStr.includes(key)) {
      return explanation;
    }
  }
  
  return lang.OPTIMAL_GROWTH;
}

function buildBestActionNow(
  advisory: UnifiedAdvisory, 
  certainty: DataCertaintyLevel,
  language: string
): StructuredResponse['bestActionNow'] {
  if (advisory.actions.length === 0) {
    return null;
  }
  
  // Get the highest priority action
  const primaryAction = advisory.actions[0];
  
  // At LOW certainty, only recommend monitoring
  if (certainty === 'LOW') {
    return {
      action: formatActionName(Action.MONITOR_CLOSELY, language),
      details: getMonitoringDetails(language)
    };
  }
  
  return {
    action: formatActionName(primaryAction.action, language),
    details: primaryAction.scientific_source || getActionDetails(primaryAction.action, language),
    quantity: (primaryAction as any).quantity
  };
}

function buildTimeWindow(advisory: UnifiedAdvisory, language: string): string {
  if (advisory.actions.length === 0) {
    if (language === 'mr') return 'आवश्यकता नाही।';
    if (language === 'hi') return 'आवश्यकता नहीं।';
    return 'No action needed.';
  }
  
  const primaryAction = advisory.actions[0];
  const urgency = primaryAction.urgency;
  
  return formatUrgencyToTimeWindow(urgency, language);
}

function buildConfidenceDisclosure(
  certainty: DataCertaintyLevel, 
  snapshot: FieldContextSnapshot,
  language: string
): string {
  const { soil, ndvi, weather } = snapshot.dataFreshness;
  const staleItems: string[] = [];
  
  if (weather.isStale) staleItems.push(weather.ageDescription);
  if (ndvi.isStale) staleItems.push(ndvi.ageDescription);
  if (soil.isStale) staleItems.push(soil.ageDescription);
  
  if (certainty === 'HIGH' || staleItems.length === 0) {
    if (language === 'mr') return 'हे उच्च खात्रीचे आहे।';
    if (language === 'hi') return 'यह उच्च विश्वसनीयता के साथ है।';
    return 'This is with high certainty.';
  }
  
  if (language === 'mr') {
    return `${staleItems.join(', ')} असल्याने हे ${certainty === 'LOW' ? 'कमी' : 'मध्यम'} खात्रीचे आहे।`;
  } else if (language === 'hi') {
    return `${staleItems.join(', ')} के कारण यह ${certainty === 'LOW' ? 'कम' : 'मध्यम'} विश्वसनीयता का है।`;
  } else {
    return `Due to ${staleItems.join(', ')}, this is ${certainty.toLowerCase()} certainty.`;
  }
}

function buildFollowUpIntelligence(
  advisory: UnifiedAdvisory,
  snapshot: FieldContextSnapshot,
  language: string
): StructuredResponse['followUp'] {
  const primaryCause = advisory.causes[0];
  const primaryAction = advisory.actions[0];
  
  // Default follow-up guidance
  let whatShouldChange = '';
  let whenToCheck = '';
  let whatToObserve = '';
  
  if (!primaryCause || !primaryAction) {
    if (language === 'mr') {
      whatShouldChange = 'पीक सध्या ठीक आहे।';
      whenToCheck = '3-5 दिवसांनी तपासा।';
      whatToObserve = 'पानांचा रंग आणि वाढ निरीक्षण करा।';
    } else if (language === 'hi') {
      whatShouldChange = 'फसल अभी ठीक है।';
      whenToCheck = '3-5 दिन बाद जांचें।';
      whatToObserve = 'पत्तों का रंग और वृद्धि देखें।';
    } else {
      whatShouldChange = 'Crop is currently fine.';
      whenToCheck = 'Check again in 3-5 days.';
      whatToObserve = 'Monitor leaf color and growth.';
    }
    return { whatShouldChange, whenToCheck, whatToObserve };
  }
  
  // Generate specific follow-up based on action type
  const actionStr = primaryAction.action.toString();
  
  if (language === 'mr') {
    if (actionStr.includes('IRRIGATE')) {
      whatShouldChange = 'पाणी दिल्यानंतर माती ओलसर व्हायला हवी।';
      whenToCheck = 'उद्या सकाळी तपासा।';
      whatToObserve = 'पाने ताठ झाली का ते पहा।';
    } else if (actionStr.includes('NITROGEN') || actionStr.includes('FERTILIZER')) {
      whatShouldChange = 'खत दिल्यानंतर 5-7 दिवसांत पानांचा रंग सुधारायला हवा।';
      whenToCheck = '1 आठवड्यानंतर तपासा।';
      whatToObserve = 'नवीन पाने गडद हिरवी होत आहेत का ते पहा।';
    } else if (actionStr.includes('INSECTICIDE') || actionStr.includes('NEEM')) {
      whatShouldChange = 'फवारणीनंतर किडींची संख्या कमी व्हायला हवी।';
      whenToCheck = '3 दिवसांनी तपासा।';
      whatToObserve = 'नवीन नुकसान होत नाही ना ते पहा।';
    } else {
      whatShouldChange = 'पिकाची स्थिती स्थिर राहायला हवी।';
      whenToCheck = '5 दिवसांनी तपासा।';
      whatToObserve = 'कोणतेही नवीन लक्षण दिसते का ते पहा।';
    }
  } else if (language === 'hi') {
    if (actionStr.includes('IRRIGATE')) {
      whatShouldChange = 'पानी देने के बाद मिट्टी नम होनी चाहिए।';
      whenToCheck = 'कल सुबह जांचें।';
      whatToObserve = 'पत्ते सीधे हो गए या नहीं देखें।';
    } else if (actionStr.includes('NITROGEN') || actionStr.includes('FERTILIZER')) {
      whatShouldChange = 'खाद देने के 5-7 दिन बाद पत्तों का रंग सुधरना चाहिए।';
      whenToCheck = '1 सप्ताह बाद जांचें।';
      whatToObserve = 'नए पत्ते गहरे हरे हो रहे हैं या नहीं देखें।';
    } else if (actionStr.includes('INSECTICIDE') || actionStr.includes('NEEM')) {
      whatShouldChange = 'स्प्रे के बाद कीड़ों की संख्या कम होनी चाहिए।';
      whenToCheck = '3 दिन बाद जांचें।';
      whatToObserve = 'नया नुकसान नहीं हो रहा देखें।';
    } else {
      whatShouldChange = 'फसल की स्थिति स्थिर रहनी चाहिए।';
      whenToCheck = '5 दिन बाद जांचें।';
      whatToObserve = 'कोई नया लक्षण दिखे तो बताएं।';
    }
  } else {
    if (actionStr.includes('IRRIGATE')) {
      whatShouldChange = 'Soil should become moist after irrigation.';
      whenToCheck = 'Check tomorrow morning.';
      whatToObserve = 'See if leaves have become upright.';
    } else if (actionStr.includes('NITROGEN') || actionStr.includes('FERTILIZER')) {
      whatShouldChange = 'Leaf color should improve in 5-7 days after application.';
      whenToCheck = 'Check after 1 week.';
      whatToObserve = 'See if new leaves are turning dark green.';
    } else if (actionStr.includes('INSECTICIDE') || actionStr.includes('NEEM')) {
      whatShouldChange = 'Pest count should reduce after spray.';
      whenToCheck = 'Check after 3 days.';
      whatToObserve = 'See if new damage has stopped.';
    } else {
      whatShouldChange = 'Crop condition should remain stable.';
      whenToCheck = 'Check after 5 days.';
      whatToObserve = 'Report any new symptoms.';
    }
  }
  
  return { whatShouldChange, whenToCheck, whatToObserve };
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════

function assembleMessage(
  fieldUnderstanding: string,
  whyItMatters: string,
  bestActionNow: StructuredResponse['bestActionNow'],
  timeWindow: string,
  confidenceDisclosure: string,
  followUp: StructuredResponse['followUp'],
  language: string
): string {
  let message = '';
  
  // 1️⃣ Field Understanding
  message += fieldUnderstanding + '\n';
  
  // 2️⃣ Why It Matters
  message += whyItMatters + '\n\n';
  
  // 3️⃣ Best Action NOW
  if (bestActionNow) {
    if (language === 'mr') {
      message += `त्यामुळे आत्ता ${bestActionNow.action} करणे योग्य आहे।`;
      if (bestActionNow.quantity) {
        message += ` (${bestActionNow.quantity})`;
      }
      message += '\n';
    } else if (language === 'hi') {
      message += `इसलिए अभी ${bestActionNow.action} करना उचित है।`;
      if (bestActionNow.quantity) {
        message += ` (${bestActionNow.quantity})`;
      }
      message += '\n';
    } else {
      message += `Therefore, ${bestActionNow.action} is recommended now.`;
      if (bestActionNow.quantity) {
        message += ` (${bestActionNow.quantity})`;
      }
      message += '\n';
    }
  } else {
    if (language === 'mr') {
      message += 'सध्या कोणतीही कृती आवश्यक नाही।\n';
    } else if (language === 'hi') {
      message += 'अभी कोई कार्रवाई आवश्यक नहीं।\n';
    } else {
      message += 'No action is needed at this time.\n';
    }
  }
  
  // 4️⃣ Time Window
  if (bestActionNow) {
    if (language === 'mr') {
      message += `हे ${timeWindow} करा।\n`;
    } else if (language === 'hi') {
      message += `यह ${timeWindow} करें।\n`;
    } else {
      message += `Do this ${timeWindow}.\n`;
    }
  }
  
  // 5️⃣ Confidence Disclosure
  message += confidenceDisclosure + '\n\n';
  
  // 6️⃣ Follow-up Intelligence
  if (language === 'mr') {
    message += `📋 पुढे काय:\n`;
    message += `• ${followUp.whatShouldChange}\n`;
    message += `• ${followUp.whenToCheck}\n`;
    message += `• ${followUp.whatToObserve}`;
  } else if (language === 'hi') {
    message += `📋 आगे क्या:\n`;
    message += `• ${followUp.whatShouldChange}\n`;
    message += `• ${followUp.whenToCheck}\n`;
    message += `• ${followUp.whatToObserve}`;
  } else {
    message += `📋 What's Next:\n`;
    message += `• ${followUp.whatShouldChange}\n`;
    message += `• ${followUp.whenToCheck}\n`;
    message += `• ${followUp.whatToObserve}`;
  }
  
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function formatStage(stage: any, language: string, cropName?: string): string {
  const stageStr = stage?.toString() || 'VEGETATIVE';
  const crop = (cropName || '').toLowerCase();
  
  // Sugarcane-specific stage names (agronomically accurate)
  if (crop.includes('sugarcane') || crop.includes('ऊस') || crop.includes('गन्ना')) {
    const sugarcaneStageMap: Record<string, Record<string, string>> = {
      mr: {
        GERMINATION: 'उगवण अवस्थेत',
        VEGETATIVE: 'फुटवे येण्याची अवस्था (Tillering)', // Tillering in Marathi
        REPRODUCTIVE: 'मोठी वाढ अवस्था (Grand Growth)',
        MATURITY: 'पक्व अवस्थेत',
        HARVEST: 'कापणीसाठी तयार'
      },
      hi: {
        GERMINATION: 'अंकुरण अवस्था',
        VEGETATIVE: 'कल्ले फूटने की अवस्था (Tillering)', // Tillering in Hindi
        REPRODUCTIVE: 'बड़ी वृद्धि अवस्था (Grand Growth)',
        MATURITY: 'परिपक्व अवस्था',
        HARVEST: 'कटाई के लिए तैयार'
      },
      en: {
        GERMINATION: 'germination stage',
        VEGETATIVE: 'tillering stage',
        REPRODUCTIVE: 'grand growth stage',
        MATURITY: 'maturity stage',
        HARVEST: 'harvest ready'
      }
    };
    const map = sugarcaneStageMap[language] || sugarcaneStageMap.en;
    return map[stageStr] || stageStr.toLowerCase().replace(/_/g, ' ');
  }
  
  // Default stage map for other crops
  const stageMap: Record<string, Record<string, string>> = {
    mr: {
      GERMINATION: 'उगवण अवस्थेत',
      VEGETATIVE: 'वाढीच्या अवस्थेत',
      REPRODUCTIVE: 'फुलोरा अवस्थेत',
      MATURITY: 'पक्व अवस्थेत',
      HARVEST: 'कापणीसाठी तयार'
    },
    hi: {
      GERMINATION: 'अंकुरण अवस्था में',
      VEGETATIVE: 'वृद्धि अवस्था में',
      REPRODUCTIVE: 'फूलन अवस्था में',
      MATURITY: 'परिपक्व अवस्था में',
      HARVEST: 'कटाई के लिए तैयार'
    },
    en: {
      GERMINATION: 'germination stage',
      VEGETATIVE: 'vegetative stage',
      REPRODUCTIVE: 'reproductive stage',
      MATURITY: 'maturity stage',
      HARVEST: 'harvest ready'
    }
  };
  
  const map = stageMap[language] || stageMap.en;
  return map[stageStr] || stageStr.toLowerCase().replace(/_/g, ' ');
}

function formatActionName(action: any, language: string): string {
  const actionStr = action?.toString() || '';
  
  const actionMap: Record<string, Record<string, string>> = {
    mr: {
      IRRIGATE_IMMEDIATELY: 'पाणी द्या',
      IRRIGATE_LIGHT: 'हलके पाणी द्या',
      APPLY_NITROGEN: 'नायट्रोजन खत द्या',
      APPLY_PHOSPHORUS: 'स्फुरद खत द्या',
      APPLY_POTASSIUM: 'पालाश खत द्या',
      APPLY_INSECTICIDE: 'किटकनाशक फवारणी करा',
      APPLY_FUNGICIDE: 'बुरशीनाशक फवारणी करा',
      APPLY_NEEM_OIL: 'कडुलिंब तेल फवारणी करा',
      MONITOR_CLOSELY: 'बारकाईने निरीक्षण करा',
      MECHANICAL_WEEDING: 'निंदणी करा'
    },
    hi: {
      IRRIGATE_IMMEDIATELY: 'पानी दें',
      IRRIGATE_LIGHT: 'हल्का पानी दें',
      APPLY_NITROGEN: 'नाइट्रोजन खाद दें',
      APPLY_PHOSPHORUS: 'फॉस्फोरस खाद दें',
      APPLY_POTASSIUM: 'पोटाश खाद दें',
      APPLY_INSECTICIDE: 'कीटनाशक स्प्रे करें',
      APPLY_FUNGICIDE: 'फफूंदनाशक स्प्रे करें',
      APPLY_NEEM_OIL: 'नीम तेल स्प्रे करें',
      MONITOR_CLOSELY: 'बारीकी से निगरानी करें',
      MECHANICAL_WEEDING: 'निराई करें'
    },
    en: {
      IRRIGATE_IMMEDIATELY: 'irrigate immediately',
      IRRIGATE_LIGHT: 'light irrigation',
      APPLY_NITROGEN: 'apply nitrogen fertilizer',
      APPLY_PHOSPHORUS: 'apply phosphorus fertilizer',
      APPLY_POTASSIUM: 'apply potassium fertilizer',
      APPLY_INSECTICIDE: 'spray insecticide',
      APPLY_FUNGICIDE: 'spray fungicide',
      APPLY_NEEM_OIL: 'spray neem oil',
      MONITOR_CLOSELY: 'monitor closely',
      MECHANICAL_WEEDING: 'mechanical weeding'
    }
  };
  
  const map = actionMap[language] || actionMap.en;
  
  for (const [key, value] of Object.entries(map)) {
    if (actionStr.includes(key)) {
      return value;
    }
  }
  
  return actionStr.toLowerCase().replace(/_/g, ' ');
}

function formatUrgencyToTimeWindow(urgency: any, language: string): string {
  const urgencyStr = urgency?.toString() || '';
  
  const urgencyMap: Record<string, Record<string, string>> = {
    mr: {
      IMMEDIATE: 'ताबडतोब',
      WITHIN_24_HOURS: 'पुढील 24 तासांत',
      WITHIN_3_DAYS: 'पुढील 3 दिवसांत',
      WITHIN_1_WEEK: 'पुढील 7 दिवसांत',
      FLEXIBLE: 'सोयीनुसार'
    },
    hi: {
      IMMEDIATE: 'तुरंत',
      WITHIN_24_HOURS: 'अगले 24 घंटों में',
      WITHIN_3_DAYS: 'अगले 3 दिनों में',
      WITHIN_1_WEEK: 'अगले 7 दिनों में',
      FLEXIBLE: 'सुविधानुसार'
    },
    en: {
      IMMEDIATE: 'immediately',
      WITHIN_24_HOURS: 'within 24 hours',
      WITHIN_3_DAYS: 'within 3 days',
      WITHIN_1_WEEK: 'within 1 week',
      FLEXIBLE: 'at your convenience'
    }
  };
  
  const map = urgencyMap[language] || urgencyMap.en;
  
  for (const [key, value] of Object.entries(map)) {
    if (urgencyStr.includes(key)) {
      return value;
    }
  }
  
  return map.WITHIN_3_DAYS;
}

function getMonitoringDetails(language: string): string {
  if (language === 'mr') {
    return 'डेटा अपूर्ण असल्याने फक्त निरीक्षण करा।';
  } else if (language === 'hi') {
    return 'डेटा अधूरा होने के कारण सिर्फ निगरानी करें।';
  } else {
    return 'Due to incomplete data, only monitoring is recommended.';
  }
}

function getActionDetails(action: any, language: string): string {
  // Return ICAR/FAO source
  return 'ICAR Guidelines';
}
