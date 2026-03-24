/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC RESPONSE BUILDER - Farmer-Friendly Diagnostic Mode Responses
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Builds structured responses when in DIAGNOSTIC MODE:
 * - Shows ranked probable causes
 * - Provides field-observable checks
 * - NEVER recommends chemicals
 * - Optionally requests photo
 * 
 * FORMAT:
 * 📋 Detected Symptom
 * 🔍 Possible Causes (ranked by probability)
 * 🔬 What to Check (field-observable questions)
 * 📷 Photo Request (if needed)
 * ⚠️ No chemical recommendation until confirmed
 */

import { DiagnosticDecision, DiagnosticMode } from './diagnosticModeController';
import { FieldContextSnapshot } from './fieldContextSnapshot';
import { SymptomAnalysis } from './symptomPatternRecognizer';
import { ChatPhotoRequest, buildPhotoRequestMessage } from './photoDisambiguationService';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosticResponse {
  mode: DiagnosticMode;
  message: string;
  structuredParts: {
    symptomSummary: string;
    rankedCauses: string;
    checkItems: string;
    photoSection: string;
    warningSection: string;
    dataSection: string;
  };
  photoRequest: ChatPhotoRequest | null;
  showCameraButton: boolean;
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a complete diagnostic mode response
 */
export function buildDiagnosticResponse(
  diagnosticDecision: DiagnosticDecision,
  symptomAnalysis: SymptomAnalysis,
  fieldSnapshot: FieldContextSnapshot,
  language: string = 'mr'
): DiagnosticResponse {
  const lang = (language === 'hi' || language === 'mr') ? language : 'en';
  
  // Build each section
  const symptomSummary = buildSymptomSummary(symptomAnalysis, lang);
  const dataSection = buildDataSection(fieldSnapshot, lang);
  const rankedCauses = buildRankedCauses(diagnosticDecision, lang);
  const checkItems = buildCheckItems(diagnosticDecision, lang);
  const photoSection = buildPhotoSection(diagnosticDecision, lang);
  const warningSection = buildWarningSection(diagnosticDecision, lang);
  
  // Build photo request if needed
  let photoRequest: ChatPhotoRequest | null = null;
  if (diagnosticDecision.mode === 'PHOTO_REQUIRED' && diagnosticDecision.photoRequest) {
    photoRequest = buildPhotoRequestMessage(
      diagnosticDecision.photoRequest,
      diagnosticDecision.remainingCauses,
      language
    );
  }
  
  // Assemble full message
  const message = assembleMessage({
    symptomSummary,
    dataSection,
    rankedCauses,
    checkItems,
    photoSection,
    warningSection
  }, lang);
  
  return {
    mode: diagnosticDecision.mode,
    message,
    structuredParts: {
      symptomSummary,
      rankedCauses,
      checkItems,
      photoSection,
      warningSection,
      dataSection
    },
    photoRequest,
    showCameraButton: diagnosticDecision.mode === 'PHOTO_REQUIRED',
    confidence: diagnosticDecision.confidence
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildSymptomSummary(
  symptomAnalysis: SymptomAnalysis,
  lang: 'mr' | 'hi' | 'en'
): string {
  if (symptomAnalysis.detected_symptoms.length === 0) {
    return '';
  }
  
  const symptomName = symptomAnalysis.detected_symptoms[0]?.symptom_name || 'Unknown symptom';
  
  const templates = {
    mr: `📋 आढळलेले लक्षण: ${symptomName}`,
    hi: `📋 पाया गया लक्षण: ${symptomName}`,
    en: `📋 Detected Symptom: ${symptomName}`
  };
  
  return templates[lang];
}

function buildDataSection(
  fieldSnapshot: FieldContextSnapshot,
  lang: 'mr' | 'hi' | 'en'
): string {
  let section = '';
  
  // ✅ NEW: Add land identity header (CRITICAL for multi-land chat)
  const landHeaders = {
    mr: '📍 तुमचा शेत',
    hi: '📍 आपका खेत',
    en: '📍 Your Field'
  };
  
  // Show land name prominently
  if (fieldSnapshot.landName && fieldSnapshot.landName !== 'Unknown Land') {
    section += `${landHeaders[lang]}: **${fieldSnapshot.landName}**\n\n`;
  }
  
  const headers = {
    mr: '📊 शेताची माहिती:',
    hi: '📊 खेत की जानकारी:',
    en: '📊 Field Data:'
  };
  
  section += headers[lang] + '\n';
  
  // Crop info with growth stage
  const cropLabels = { mr: 'पीक', hi: 'फसल', en: 'Crop' };
  const daysLabels = { mr: 'दिवस', hi: 'दिन', en: 'days' };
  const stageLabels = { 
    mr: { GERMINATION: 'उगवण', VEGETATIVE: 'वाढ', REPRODUCTIVE: 'फुलोरा', MATURITY: 'पक्वता', HARVEST: 'कापणी' },
    hi: { GERMINATION: 'अंकुरण', VEGETATIVE: 'वृद्धि', REPRODUCTIVE: 'फूलन', MATURITY: 'परिपक्वता', HARVEST: 'कटाई' },
    en: { GERMINATION: 'Germination', VEGETATIVE: 'Vegetative', REPRODUCTIVE: 'Reproductive', MATURITY: 'Maturity', HARVEST: 'Harvest' }
  };
  
  const stageKey = fieldSnapshot.growthStage?.toString() || 'VEGETATIVE';
  const stageDisplay = stageLabels[lang][stageKey as keyof typeof stageLabels['mr']] || stageKey;
  
  section += `• ${cropLabels[lang]}: ${fieldSnapshot.cropName || 'Unknown'} (${fieldSnapshot.daysAfterSowing} ${daysLabels[lang]} - ${stageDisplay})\n`;
  
  // Area - use gunta for small farms
  if (fieldSnapshot.areaGunta) {
    const areaLabels = { mr: 'क्षेत्र', hi: 'क्षेत्र', en: 'Area' };
    const areaDisplay = fieldSnapshot.areaGunta <= 40 
      ? `${Math.round(fieldSnapshot.areaGunta)} ${lang === 'en' ? 'gunta' : 'गुंठा'}`
      : `${fieldSnapshot.areaAcres.toFixed(2)} ${lang === 'en' ? 'acres' : 'एकर'}`;
    section += `• ${areaLabels[lang]}: ${areaDisplay}\n`;
  }
  
  // Soil moisture
  if (fieldSnapshot.soilBaseline.moisture !== undefined) {
    const moistureLabels = { mr: 'मातीचा ओलावा', hi: 'मिट्टी की नमी', en: 'Soil Moisture' };
    section += `• ${moistureLabels[lang]}: ${fieldSnapshot.soilBaseline.moisture}%\n`;
  }
  
  // NDVI
  if (fieldSnapshot.ndviStatus?.value !== undefined) {
    const ndviLabels = { mr: 'पिक आरोग्य (NDVI)', hi: 'फसल स्वास्थ्य (NDVI)', en: 'Crop Health (NDVI)' };
    const ndviValue = (fieldSnapshot.ndviStatus.value * 100).toFixed(0);
    section += `• ${ndviLabels[lang]}: ${ndviValue}%\n`;
  }
  
  // Weather
  if (fieldSnapshot.weatherConditions?.temperature !== undefined) {
    const weatherLabels = { mr: 'हवामान', hi: 'मौसम', en: 'Weather' };
    section += `• ${weatherLabels[lang]}: ${fieldSnapshot.weatherConditions.temperature}°C\n`;
  }
  
  return section;
}

function buildRankedCauses(
  decision: DiagnosticDecision,
  lang: 'mr' | 'hi' | 'en'
): string {
  if (decision.remainingCauses.length === 0) {
    return '';
  }
  
  const headers = {
    mr: '🔍 संभाव्य कारणे:',
    hi: '🔍 संभावित कारण:',
    en: '🔍 Possible Causes:'
  };
  
  const probabilityLabels = {
    mr: 'शक्यता',
    hi: 'संभावना',
    en: 'probability'
  };
  
  let section = headers[lang] + '\n';
  
  decision.remainingCauses.slice(0, 3).forEach((cause, i) => {
    const icon = i === 0 ? '1️⃣' : i === 1 ? '2️⃣' : '3️⃣';
    const probability = Math.round(cause.probability * 100);
    section += `${icon} ${cause.cause_name} – ${probability}% ${probabilityLabels[lang]}\n`;
    
    // Add key differentiating factor
    if (cause.differentiating_factors.length > 0) {
      section += `   ↳ ${cause.differentiating_factors[0]}\n`;
    }
  });
  
  // Show eliminated causes if any
  if (decision.eliminatedCauses.length > 0) {
    const eliminatedLabels = {
      mr: '\n❌ नाकारलेली कारणे:',
      hi: '\n❌ खारिज कारण:',
      en: '\n❌ Eliminated Causes:'
    };
    section += eliminatedLabels[lang] + '\n';
    
    decision.eliminatedCauses.slice(0, 2).forEach(ec => {
      section += `• ${ec.causeName}: ${ec.eliminationReason}\n`;
    });
  }
  
  return section;
}

function buildCheckItems(
  decision: DiagnosticDecision,
  lang: 'mr' | 'hi' | 'en'
): string {
  if (decision.disambiguationQuestions.length === 0) {
    return '';
  }
  
  const headers = {
    mr: '🔬 खात्री करण्यासाठी तपासा:',
    hi: '🔬 पुष्टि के लिए जांचें:',
    en: '🔬 Check to Confirm:'
  };
  
  let section = headers[lang] + '\n';
  
  decision.disambiguationQuestions.forEach((q, i) => {
    section += `□ ${q.question}\n`;
  });
  
  return section;
}

function buildPhotoSection(
  decision: DiagnosticDecision,
  lang: 'mr' | 'hi' | 'en'
): string {
  if (decision.mode !== 'PHOTO_REQUIRED' || !decision.photoRequest) {
    return '';
  }
  
  const headers = {
    mr: '📷 अधिक खात्रीसाठी फोटो पाठवा',
    hi: '📷 पुष्टि के लिए फोटो भेजें',
    en: '📷 Send Photo for Confirmation'
  };
  
  let section = headers[lang] + '\n';
  
  decision.photoRequest.whatToCapture.forEach((item, i) => {
    section += `${i + 1}. ${item}\n`;
  });
  
  return section;
}

function buildWarningSection(
  decision: DiagnosticDecision,
  lang: 'mr' | 'hi' | 'en'
): string {
  if (decision.mode === 'ACTION') {
    return '';
  }
  
  const warnings = {
    mr: '⚠️ किटकनाशक/बुरशीनाशक फवारणीची शिफारस तपासणीनंतरच केली जाईल',
    hi: '⚠️ कीटनाशक/फफूंदनाशक की सिफारिश जांच के बाद ही की जाएगी',
    en: '⚠️ Pesticide/fungicide recommendation will be given only after confirmation'
  };
  
  let section = warnings[lang];
  
  // Add confidence
  const confidenceLabels = {
    mr: '\n\n📈 विश्वासार्हता',
    hi: '\n\n📈 विश्वसनीयता',
    en: '\n\n📈 Confidence'
  };
  
  section += `${confidenceLabels[lang]}: ${Math.round(decision.confidence * 100)}%`;
  
  return section;
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════

function assembleMessage(
  parts: {
    symptomSummary: string;
    dataSection: string;
    rankedCauses: string;
    checkItems: string;
    photoSection: string;
    warningSection: string;
  },
  lang: 'mr' | 'hi' | 'en'
): string {
  const sections: string[] = [];
  
  if (parts.symptomSummary) sections.push(parts.symptomSummary);
  if (parts.dataSection) sections.push(parts.dataSection);
  if (parts.rankedCauses) sections.push(parts.rankedCauses);
  if (parts.checkItems) sections.push(parts.checkItems);
  if (parts.photoSection) sections.push(parts.photoSection);
  if (parts.warningSection) sections.push(parts.warningSection);
  
  return sections.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLLOW-UP INTELLIGENCE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export interface FollowUpGuidance {
  whatShouldChange: string;
  whenToCheck: string;
  whatToObserve: string[];
}

export function buildFollowUpGuidance(
  decision: DiagnosticDecision,
  language: string = 'mr'
): FollowUpGuidance {
  const lang = (language === 'hi' || language === 'mr') ? language : 'en';
  
  const primaryCause = decision.primaryCause;
  
  if (!primaryCause) {
    return {
      whatShouldChange: lang === 'mr' ? 'सध्या कोणतेही स्पष्ट लक्षण नाही' :
                        lang === 'hi' ? 'अभी कोई स्पष्ट लक्षण नहीं' :
                        'No clear symptom currently',
      whenToCheck: lang === 'mr' ? '3-5 दिवसांनी पुन्हा तपासा' :
                   lang === 'hi' ? '3-5 दिन बाद फिर जांचें' :
                   'Check again in 3-5 days',
      whatToObserve: lang === 'mr' ? ['पानांचा रंग', 'वाढ', 'नवीन लक्षणे'] :
                     lang === 'hi' ? ['पत्तों का रंग', 'विकास', 'नए लक्षण'] :
                     ['Leaf color', 'Growth', 'New symptoms']
    };
  }
  
  // Build cause-specific follow-up
  const causeStr = primaryCause.cause.toString().toUpperCase();
  
  if (causeStr.includes('BORER')) {
    return {
      whatShouldChange: lang === 'mr' ? 'किड नियंत्रणानंतर नवीन पाने निरोगी दिसावीत' :
                        lang === 'hi' ? 'कीट नियंत्रण के बाद नई पत्तियां स्वस्थ दिखें' :
                        'New leaves should appear healthy after pest control',
      whenToCheck: lang === 'mr' ? '7-10 दिवसांनी तपासा' :
                   lang === 'hi' ? '7-10 दिन बाद जांचें' :
                   'Check in 7-10 days',
      whatToObserve: lang === 'mr' ? ['नवीन सुरळी निरोगी आहे का', 'नवीन छिद्रे नाहीत ना', 'वाढ सुरू झाली का'] :
                     lang === 'hi' ? ['नई सुरळी स्वस्थ है क्या', 'नए छेद नहीं हैं', 'विकास शुरू हुआ क्या'] :
                     ['Is new whorl healthy', 'No new bore holes', 'Growth resumed']
    };
  }
  
  if (causeStr.includes('WATER_STRESS')) {
    return {
      whatShouldChange: lang === 'mr' ? 'पाणी दिल्यानंतर पाने ताठ व्हावीत' :
                        lang === 'hi' ? 'पानी देने के बाद पत्तियां तनी दिखें' :
                        'Leaves should become turgid after irrigation',
      whenToCheck: lang === 'mr' ? '2-3 दिवसांनी तपासा' :
                   lang === 'hi' ? '2-3 दिन बाद जांचें' :
                   'Check in 2-3 days',
      whatToObserve: lang === 'mr' ? ['पाने ताठ झाली का', 'मातीत ओलावा पुरेसा आहे का', 'नवीन वाढ दिसते का'] :
                     lang === 'hi' ? ['पत्तियां तनी क्या', 'मिट्टी में नमी पर्याप्त है क्या', 'नई वृद्धि दिखती है क्या'] :
                     ['Are leaves turgid', 'Is soil moisture adequate', 'Is new growth visible']
    };
  }
  
  if (causeStr.includes('DEFICIENCY')) {
    return {
      whatShouldChange: lang === 'mr' ? 'खत दिल्यानंतर नवीन पाने हिरवी दिसावीत' :
                        lang === 'hi' ? 'खाद देने के बाद नई पत्तियां हरी दिखें' :
                        'New leaves should appear green after fertilizer application',
      whenToCheck: lang === 'mr' ? '10-14 दिवसांनी तपासा' :
                   lang === 'hi' ? '10-14 दिन बाद जांचें' :
                   'Check in 10-14 days',
      whatToObserve: lang === 'mr' ? ['नवीन पानांचा रंग', 'वाढीचा वेग', 'जुन्या पानांची स्थिती'] :
                     lang === 'hi' ? ['नई पत्तियों का रंग', 'वृद्धि की गति', 'पुरानी पत्तियों की स्थिति'] :
                     ['Color of new leaves', 'Growth rate', 'Condition of old leaves']
    };
  }
  
  // Default follow-up
  return {
    whatShouldChange: lang === 'mr' ? 'उपचारानंतर सुधारणा दिसावी' :
                      lang === 'hi' ? 'उपचार के बाद सुधार दिखे' :
                      'Improvement should be visible after treatment',
    whenToCheck: lang === 'mr' ? '5-7 दिवसांनी तपासा' :
                 lang === 'hi' ? '5-7 दिन बाद जांचें' :
                 'Check in 5-7 days',
    whatToObserve: lang === 'mr' ? ['एकूण आरोग्य', 'नवीन वाढ', 'लक्षणे कमी झाली का'] :
                   lang === 'hi' ? ['समग्र स्वास्थ्य', 'नई वृद्धि', 'लक्षण कम हुए क्या'] :
                   ['Overall health', 'New growth', 'Symptoms reduced']
  };
}
