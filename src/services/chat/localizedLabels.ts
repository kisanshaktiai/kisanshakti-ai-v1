/**
 * Localized Labels Service
 * 
 * Provides pure single-language strings for all UI elements.
 * NO English words should appear when language is set to mr/hi.
 */

export type SupportedLanguage = 'en' | 'hi' | 'mr';

// Freshness/age descriptions for data
export const FRESHNESS_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    justNow: 'Just now',
    minutesAgo: '{n} minutes ago',
    hoursAgo: '{n} hours ago',
    today: 'Today',
    yesterday: 'Yesterday',
    daysAgo: '{n} days ago',
    weeksAgo: '{n} weeks ago',
    monthsAgo: '{n} months ago',
    noData: 'No data available',
    stale: 'Data may be outdated',
    fresh: 'Recent data',
    realtime: 'Live data',
  },
  hi: {
    justNow: 'अभी',
    minutesAgo: '{n} मिनट पहले',
    hoursAgo: '{n} घंटे पहले',
    today: 'आज',
    yesterday: 'कल',
    daysAgo: '{n} दिन पहले',
    weeksAgo: '{n} हफ्ते पहले',
    monthsAgo: '{n} महीने पहले',
    noData: 'कोई डेटा उपलब्ध नहीं',
    stale: 'डेटा पुराना हो सकता है',
    fresh: 'हाल का डेटा',
    realtime: 'लाइव डेटा',
  },
  mr: {
    justNow: 'आत्ता',
    minutesAgo: '{n} मिनिटांपूर्वी',
    hoursAgo: '{n} तासांपूर्वी',
    today: 'आज',
    yesterday: 'काल',
    daysAgo: '{n} दिवसांपूर्वी',
    weeksAgo: '{n} आठवड्यांपूर्वी',
    monthsAgo: '{n} महिन्यांपूर्वी',
    noData: 'माहिती उपलब्ध नाही',
    stale: 'माहिती जुनी असू शकते',
    fresh: 'अलीकडील माहिती',
    realtime: 'थेट माहिती',
  },
};

// Confidence level labels
export const CONFIDENCE_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    veryHigh: 'Very High Confidence',
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence',
    veryLow: 'Very Low Confidence',
    unknown: 'Confidence Unknown',
    basedOnData: 'Based on available data',
    needsMoreInfo: 'More information needed',
  },
  hi: {
    veryHigh: 'बहुत उच्च विश्वास',
    high: 'उच्च विश्वास',
    medium: 'मध्यम विश्वास',
    low: 'कम विश्वास',
    veryLow: 'बहुत कम विश्वास',
    unknown: 'विश्वास अज्ञात',
    basedOnData: 'उपलब्ध डेटा के आधार पर',
    needsMoreInfo: 'अधिक जानकारी आवश्यक',
  },
  mr: {
    veryHigh: 'अत्यंत उच्च विश्वास',
    high: 'उच्च विश्वास',
    medium: 'मध्यम विश्वास',
    low: 'कमी विश्वास',
    veryLow: 'अत्यंत कमी विश्वास',
    unknown: 'विश्वास अज्ञात',
    basedOnData: 'उपलब्ध माहितीवर आधारित',
    needsMoreInfo: 'अधिक माहिती आवश्यक',
  },
};

// Risk level labels
export const RISK_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    critical: 'Critical Risk',
    high: 'High Risk',
    medium: 'Medium Risk',
    low: 'Low Risk',
    none: 'No Risk',
  },
  hi: {
    critical: 'गंभीर जोखिम',
    high: 'उच्च जोखिम',
    medium: 'मध्यम जोखिम',
    low: 'कम जोखिम',
    none: 'कोई जोखिम नहीं',
  },
  mr: {
    critical: 'गंभीर धोका',
    high: 'उच्च धोका',
    medium: 'मध्यम धोका',
    low: 'कमी धोका',
    none: 'धोका नाही',
  },
};

// Action type labels (for quick reply chips)
export const ACTION_TYPE_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    WATER_NOW: 'Water Now',
    WATER_DELAY: 'Delay Watering',
    APPLY_FERTILIZER: 'Apply Fertilizer',
    APPLY_PESTICIDE: 'Apply Pesticide',
    APPLY_FUNGICIDE: 'Apply Fungicide',
    HARVEST_READY: 'Ready to Harvest',
    WAIT_HARVEST: 'Wait for Harvest',
    INSPECT_FIELD: 'Inspect Field',
    TAKE_PHOTO: 'Take Photo',
    CHECK_WEATHER: 'Check Weather',
    CHECK_PRICE: 'Check Market Price',
    EMERGENCY_ACTION: 'Urgent Action Required',
    CONSULT_EXPERT: 'Consult Expert',
    MONITOR: 'Monitor Closely',
    NO_ACTION: 'No Action Needed',
  },
  hi: {
    WATER_NOW: 'अभी पानी दें',
    WATER_DELAY: 'पानी देना रोकें',
    APPLY_FERTILIZER: 'खाद डालें',
    APPLY_PESTICIDE: 'कीटनाशक लगाएं',
    APPLY_FUNGICIDE: 'फफूंदनाशक लगाएं',
    HARVEST_READY: 'कटाई के लिए तैयार',
    WAIT_HARVEST: 'कटाई का इंतजार करें',
    INSPECT_FIELD: 'खेत का निरीक्षण करें',
    TAKE_PHOTO: 'फोटो लें',
    CHECK_WEATHER: 'मौसम देखें',
    CHECK_PRICE: 'बाजार भाव देखें',
    EMERGENCY_ACTION: 'तुरंत कार्रवाई आवश्यक',
    CONSULT_EXPERT: 'विशेषज्ञ से परामर्श करें',
    MONITOR: 'निगरानी रखें',
    NO_ACTION: 'कोई कार्रवाई नहीं चाहिए',
  },
  mr: {
    WATER_NOW: 'आत्ता पाणी द्या',
    WATER_DELAY: 'पाणी थांबवा',
    APPLY_FERTILIZER: 'खत द्या',
    APPLY_PESTICIDE: 'कीटकनाशक फवारा',
    APPLY_FUNGICIDE: 'बुरशीनाशक फवारा',
    HARVEST_READY: 'काढणीस तयार',
    WAIT_HARVEST: 'काढणीची वाट पहा',
    INSPECT_FIELD: 'शेताची तपासणी करा',
    TAKE_PHOTO: 'फोटो काढा',
    CHECK_WEATHER: 'हवामान पहा',
    CHECK_PRICE: 'बाजारभाव पहा',
    EMERGENCY_ACTION: 'तात्काळ कृती आवश्यक',
    CONSULT_EXPERT: 'तज्ञांशी संपर्क करा',
    MONITOR: 'लक्ष ठेवा',
    NO_ACTION: 'कृती आवश्यक नाही',
  },
};

// Data source labels
export const DATA_SOURCE_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    weather: 'Weather Data',
    soil: 'Soil Data',
    ndvi: 'Satellite Data',
    schedule: 'Schedule Data',
    vision: 'Image Analysis',
    sensor: 'Sensor Data',
    manual: 'Manual Entry',
    estimated: 'Estimated',
  },
  hi: {
    weather: 'मौसम डेटा',
    soil: 'मिट्टी डेटा',
    ndvi: 'उपग्रह डेटा',
    schedule: 'अनुसूची डेटा',
    vision: 'चित्र विश्लेषण',
    sensor: 'सेंसर डेटा',
    manual: 'मैनुअल प्रविष्टि',
    estimated: 'अनुमानित',
  },
  mr: {
    weather: 'हवामान माहिती',
    soil: 'माती माहिती',
    ndvi: 'उपग्रह माहिती',
    schedule: 'वेळापत्रक माहिती',
    vision: 'प्रतिमा विश्लेषण',
    sensor: 'सेन्सर माहिती',
    manual: 'हाताने नोंद',
    estimated: 'अंदाजित',
  },
};

// Diagnostic mode labels
export const DIAGNOSTIC_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    analyzing: 'Analyzing your field...',
    possibleCauses: 'Possible Causes',
    mostLikely: 'Most Likely',
    needPhoto: 'Photo needed for confirmation',
    answerYes: 'Yes',
    answerNo: 'No',
    question: 'Question',
    confidence: 'Confidence',
    severity: 'Severity',
    nextSteps: 'Next Steps',
    recommendation: 'Recommendation',
    warning: 'Warning',
    caution: 'Caution',
  },
  hi: {
    analyzing: 'आपके खेत का विश्लेषण...',
    possibleCauses: 'संभावित कारण',
    mostLikely: 'सबसे संभावित',
    needPhoto: 'पुष्टि के लिए फोटो चाहिए',
    answerYes: 'हां',
    answerNo: 'नहीं',
    question: 'प्रश्न',
    confidence: 'विश्वास',
    severity: 'गंभीरता',
    nextSteps: 'अगले कदम',
    recommendation: 'सिफारिश',
    warning: 'चेतावनी',
    caution: 'सावधान',
  },
  mr: {
    analyzing: 'तुमच्या शेताचे विश्लेषण...',
    possibleCauses: 'संभाव्य कारणे',
    mostLikely: 'सर्वात संभाव्य',
    needPhoto: 'खात्री करण्यासाठी फोटो हवा',
    answerYes: 'होय',
    answerNo: 'नाही',
    question: 'प्रश्न',
    confidence: 'विश्वास',
    severity: 'तीव्रता',
    nextSteps: 'पुढील पावले',
    recommendation: 'शिफारस',
    warning: 'इशारा',
    caution: 'सावधगिरी',
  },
};

// Response mode labels (for debugging badge)
export const RESPONSE_MODE_LABELS: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    rulesBasedRecommendation: 'Rules-based',
    aiAssisted: 'AI-assisted',
    diagnostic: 'Diagnostic mode',
    fallback: 'General response',
  },
  hi: {
    rulesBasedRecommendation: 'नियमों पर आधारित',
    aiAssisted: 'AI सहायता',
    diagnostic: 'निदान मोड',
    fallback: 'सामान्य उत्तर',
  },
  mr: {
    rulesBasedRecommendation: 'नियमांवर आधारित',
    aiAssisted: 'AI सहाय्य',
    diagnostic: 'निदान मोड',
    fallback: 'सामान्य उत्तर',
  },
};

// Helper function to get localized label
export function getLabel(
  category: 'freshness' | 'confidence' | 'risk' | 'action' | 'dataSource' | 'diagnostic' | 'responseMode',
  key: string,
  language: SupportedLanguage = 'en'
): string {
  const categories = {
    freshness: FRESHNESS_LABELS,
    confidence: CONFIDENCE_LABELS,
    risk: RISK_LABELS,
    action: ACTION_TYPE_LABELS,
    dataSource: DATA_SOURCE_LABELS,
    diagnostic: DIAGNOSTIC_LABELS,
    responseMode: RESPONSE_MODE_LABELS,
  };
  
  const categoryLabels = categories[category];
  const langLabels = categoryLabels[language] || categoryLabels.en;
  
  return langLabels[key] || langLabels[key.toLowerCase()] || key;
}

// Helper to format freshness with number substitution
export function formatFreshness(
  key: string,
  n: number,
  language: SupportedLanguage = 'en'
): string {
  const template = FRESHNESS_LABELS[language]?.[key] || FRESHNESS_LABELS.en[key] || key;
  
  // Use localized number formatting
  const localizedNumber = formatLocalizedNumber(n, language);
  return template.replace('{n}', localizedNumber);
}

// Format numbers in localized script (Devanagari for Hindi/Marathi)
export function formatLocalizedNumber(num: number, language: SupportedLanguage): string {
  if (language === 'en') {
    return num.toString();
  }
  
  // Convert to Devanagari numerals for Hindi/Marathi
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return num.toString().split('').map(digit => {
    const n = parseInt(digit, 10);
    return isNaN(n) ? digit : devanagariDigits[n];
  }).join('');
}

// Format percentage in localized script
export function formatLocalizedPercentage(percent: number, language: SupportedLanguage): string {
  const num = Math.round(percent);
  return `${formatLocalizedNumber(num, language)}%`;
}

// Get age description from timestamp
export function getAgeDescription(timestamp: Date | string | number | null, language: SupportedLanguage = 'en'): string {
  if (!timestamp) {
    return FRESHNESS_LABELS[language]?.noData || FRESHNESS_LABELS.en.noData;
  }
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  
  if (diffMinutes < 5) {
    return FRESHNESS_LABELS[language]?.justNow || FRESHNESS_LABELS.en.justNow;
  } else if (diffMinutes < 60) {
    return formatFreshness('minutesAgo', diffMinutes, language);
  } else if (diffHours < 24) {
    return formatFreshness('hoursAgo', diffHours, language);
  } else if (diffDays === 0) {
    return FRESHNESS_LABELS[language]?.today || FRESHNESS_LABELS.en.today;
  } else if (diffDays === 1) {
    return FRESHNESS_LABELS[language]?.yesterday || FRESHNESS_LABELS.en.yesterday;
  } else if (diffDays < 7) {
    return formatFreshness('daysAgo', diffDays, language);
  } else if (diffWeeks < 4) {
    return formatFreshness('weeksAgo', diffWeeks, language);
  } else {
    return formatFreshness('monthsAgo', diffMonths, language);
  }
}

// Get confidence label from score
export function getConfidenceLabel(score: number, language: SupportedLanguage = 'en'): string {
  if (score >= 0.9) return CONFIDENCE_LABELS[language]?.veryHigh || CONFIDENCE_LABELS.en.veryHigh;
  if (score >= 0.7) return CONFIDENCE_LABELS[language]?.high || CONFIDENCE_LABELS.en.high;
  if (score >= 0.5) return CONFIDENCE_LABELS[language]?.medium || CONFIDENCE_LABELS.en.medium;
  if (score >= 0.3) return CONFIDENCE_LABELS[language]?.low || CONFIDENCE_LABELS.en.low;
  if (score > 0) return CONFIDENCE_LABELS[language]?.veryLow || CONFIDENCE_LABELS.en.veryLow;
  return CONFIDENCE_LABELS[language]?.unknown || CONFIDENCE_LABELS.en.unknown;
}

// Get risk label from level
export function getRiskLabel(level: string, language: SupportedLanguage = 'en'): string {
  const normalized = level.toLowerCase();
  return RISK_LABELS[language]?.[normalized] || RISK_LABELS.en[normalized] || level;
}

// Get action label from action type
export function getActionLabel(actionType: string, language: SupportedLanguage = 'en'): string {
  // Handle underscore-separated action types
  const normalized = actionType.toUpperCase().replace(/\s+/g, '_');
  return ACTION_TYPE_LABELS[language]?.[normalized] || 
         ACTION_TYPE_LABELS.en[normalized] || 
         // Fallback: humanize the action type in the target language
         actionType.replace(/_/g, ' ').toLowerCase();
}
