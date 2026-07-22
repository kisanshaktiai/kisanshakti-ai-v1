/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC MODE CONTROLLER - Diagnosis-First Execution Model
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This module determines whether the system should be in:
 * - DIAGNOSTIC MODE: Multiple causes remain → ask questions / request photo
 * - ACTION MODE: Single confirmed cause → run Decision Graph
 * - PHOTO_REQUIRED: Confidence too low → request visual confirmation
 * 
 * NON-NEGOTIABLE RULES:
 * ❌ NO chemical advice in Diagnostic Mode
 * ❌ NO fertilizer advice without soil confirmation
 * ❌ NO single-cause certainty if ≥2 causes remain with close probability
 * ✅ Eliminate causes using field data (soil, NDVI, weather, crop age)
 * ✅ Generate disambiguation questions when needed
 * ✅ Request photo when confidence is low
 * 
 * Based on Israeli, Dutch, and Brazilian advisory systems.
 */

import { Cause, CropStage } from '@/decision-graph/types-only';
import { 
  FieldContextSnapshot, 
  DataCertaintyLevel,
  getAllowedActionLevel,
  ActionSafetyLevel
} from './fieldContextSnapshot';
import { 
  SymptomAnalysis, 
  PossibleCause 
} from './symptomPatternRecognizer';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type DiagnosticMode = 'DIAGNOSTIC' | 'ACTION' | 'PHOTO_REQUIRED';

export interface EliminatedCause {
  cause: Cause;
  causeName: string;
  eliminationReason: string;
  fieldDataUsed: string;
}

export interface PhotoRequest {
  reason: string;
  whatToCapture: string[];
  urgency: 'LOW' | 'MEDIUM' | 'HIGH';
  contextForAnalysis: {
    suspectedCauses: string[];
    cropCode?: string;
    daysAfterSowing?: number;
  };
}

export interface DiagnosticDecision {
  mode: DiagnosticMode;
  // Land Identity (for multi-land chat isolation)
  landId: string;
  landName: string;
  cropName: string;
  remainingCauses: PossibleCause[];
  eliminatedCauses: EliminatedCause[];
  primaryCause: PossibleCause | null;
  disambiguationQuestions: DisambiguationQuestion[];
  photoRequest: PhotoRequest | null;
  canRecommendChemicals: boolean;
  canRecommendFertilizers: boolean;
  confidence: number;
  reasoning: string[];
}

export interface DisambiguationQuestion {
  question: string;
  yesIndicates: string;
  noIndicates: string;
  fieldObservable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE ELIMINATION RULES (Based on Field Data)
// ═══════════════════════════════════════════════════════════════════════════

interface CauseEliminationRule {
  causePatterns: string[]; // Patterns to match cause names
  eliminateWhen: (fieldSnapshot: FieldContextSnapshot, daysAfterSowing: number) => boolean;
  reason: (fieldSnapshot: FieldContextSnapshot, daysAfterSowing: number) => string;
  fieldDataUsed: string;
}

const CAUSE_ELIMINATION_RULES: CauseEliminationRule[] = [
  // SHOOT BORER: Only in young crop (30-120 days)
  {
    causePatterns: ['SHOOT_BORER', 'EARLY_SHOOT'],
    eliminateWhen: (fs, das) => das > 150 || das < 25,
    reason: (fs, das) => das > 150 
      ? `Crop is ${das} days old - shoot borer affects young crop (30-120 days)`
      : `Crop is only ${das} days old - too young for typical shoot borer damage`,
    fieldDataUsed: 'days_after_sowing'
  },
  
  // STEM BORER / TOP BORER: Older crop (90+ days)
  {
    causePatterns: ['STEM_BORER', 'TOP_BORER'],
    eliminateWhen: (fs, das) => das < 60,
    reason: (fs, das) => `Crop is only ${das} days old - stem/top borer typically appears after 90 days`,
    fieldDataUsed: 'days_after_sowing'
  },
  
  // WATER STRESS: Eliminate if soil moisture is adequate
  {
    causePatterns: ['WATER_STRESS', 'DROUGHT'],
    eliminateWhen: (fs) => {
      const moisture = fs.soilBaseline.moisture;
      return moisture !== undefined && moisture > 55;
    },
    reason: (fs) => `Soil moisture is ${fs.soilBaseline.moisture}% - adequate for crop needs (stress unlikely)`,
    fieldDataUsed: 'soil_moisture'
  },
  
  // WATERLOGGING: Eliminate if soil is dry
  {
    causePatterns: ['WATERLOGGING', 'ROOT_ROT'],
    eliminateWhen: (fs) => {
      const moisture = fs.soilBaseline.moisture;
      return moisture !== undefined && moisture < 40;
    },
    reason: (fs) => `Soil moisture is ${fs.soilBaseline.moisture}% - too dry for waterlogging`,
    fieldDataUsed: 'soil_moisture'
  },
  
  // NITROGEN DEFICIENCY: Eliminate if N levels are adequate
  {
    causePatterns: ['NITROGEN_DEFICIENCY', 'N_DEFICIENCY'],
    eliminateWhen: (fs) => {
      const nLevel = fs.soilBaseline.nitrogen;
      return nLevel !== undefined && nLevel > 60;
    },
    reason: (fs) => `Soil nitrogen is ${fs.soilBaseline.nitrogen}% - adequate levels (deficiency unlikely)`,
    fieldDataUsed: 'soil_nitrogen'
  },
  
  // FROST DAMAGE: Eliminate if temperature is normal
  {
    causePatterns: ['FROST', 'COLD_DAMAGE'],
    eliminateWhen: (fs) => {
      const temp = fs.weatherConditions?.temperature;
      return temp !== undefined && temp > 10;
    },
    reason: (fs) => `Temperature is ${fs.weatherConditions?.temperature}°C - no frost risk`,
    fieldDataUsed: 'weather_temperature'
  },
  
  // HEAT STRESS: Eliminate if temperature is moderate
  {
    causePatterns: ['HEAT_STRESS', 'HEAT_DAMAGE'],
    eliminateWhen: (fs) => {
      const temp = fs.weatherConditions?.temperature;
      return temp !== undefined && temp < 35;
    },
    reason: (fs) => `Temperature is ${fs.weatherConditions?.temperature}°C - no heat stress risk`,
    fieldDataUsed: 'weather_temperature'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// DISAMBIGUATION QUESTIONS DATABASE
// ═══════════════════════════════════════════════════════════════════════════

interface DisambiguationTemplate {
  symptomId: string;
  questions: {
    mr: DisambiguationQuestion[];
    hi: DisambiguationQuestion[];
    en: DisambiguationQuestion[];
  };
}

const DISAMBIGUATION_QUESTIONS: DisambiguationTemplate[] = [
  {
    symptomId: 'SC_DEAD_HEART',
    questions: {
      mr: [
        { 
          question: 'गाभा ओढल्यावर सहज निघतो का?', 
          yesIndicates: 'SHOOT_BORER', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        },
        { 
          question: 'बुंध्याजवळ छिद्र आणि भुसा दिसतो का?', 
          yesIndicates: 'SHOOT_BORER', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        },
        { 
          question: 'खोड कापल्यावर आत अळी दिसते का?', 
          yesIndicates: 'STEM_BORER', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        },
        { 
          question: 'सगळी पाने वाळली आहेत का फक्त मधलीच?', 
          yesIndicates: 'WATER_STRESS', 
          noIndicates: 'BORER',
          fieldObservable: true 
        },
        { 
          question: 'जमीन कोरडी आणि भेगाळ आहे का?', 
          yesIndicates: 'WATER_STRESS', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        }
      ],
      hi: [
        { 
          question: 'गभ खींचने पर आसानी से निकलता है?', 
          yesIndicates: 'SHOOT_BORER', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        },
        { 
          question: 'जड़ के पास छेद और भूसा दिखता है?', 
          yesIndicates: 'SHOOT_BORER', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        },
        { 
          question: 'तना काटने पर अंदर इल्ली दिखती है?', 
          yesIndicates: 'STEM_BORER', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        },
        { 
          question: 'सारी पत्तियां सूखी हैं या सिर्फ बीच की?', 
          yesIndicates: 'WATER_STRESS', 
          noIndicates: 'BORER',
          fieldObservable: true 
        }
      ],
      en: [
        { 
          question: 'Does the dead heart pull out easily when tugged?', 
          yesIndicates: 'SHOOT_BORER', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        },
        { 
          question: 'Are there bore holes and frass near the base?', 
          yesIndicates: 'SHOOT_BORER', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        },
        { 
          question: 'When you cut the stem, is there a larva inside?', 
          yesIndicates: 'STEM_BORER', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        },
        { 
          question: 'Are all leaves wilting or just the central whorl?', 
          yesIndicates: 'WATER_STRESS', 
          noIndicates: 'BORER',
          fieldObservable: true 
        }
      ]
    }
  },
  {
    symptomId: 'LEAF_YELLOWING',
    questions: {
      mr: [
        { 
          question: 'खालची (जुनी) पाने आधी पिवळी झाली का?', 
          yesIndicates: 'NITROGEN_DEFICIENCY', 
          noIndicates: 'IRON_DEFICIENCY',
          fieldObservable: true 
        },
        { 
          question: 'शिरा हिरव्या आहेत पण बाकी भाग पिवळा आहे का?', 
          yesIndicates: 'IRON_DEFICIENCY', 
          noIndicates: 'NITROGEN_DEFICIENCY',
          fieldObservable: true 
        },
        { 
          question: 'जमिनीत पाणी साचले आहे का?', 
          yesIndicates: 'WATERLOGGING', 
          noIndicates: 'OTHER',
          fieldObservable: true 
        }
      ],
      hi: [
        { 
          question: 'क्या नीचे (पुरानी) पत्तियां पहले पीली हुईं?', 
          yesIndicates: 'NITROGEN_DEFICIENCY', 
          noIndicates: 'IRON_DEFICIENCY',
          fieldObservable: true 
        },
        { 
          question: 'क्या नसें हरी हैं लेकिन बाकी भाग पीला है?', 
          yesIndicates: 'IRON_DEFICIENCY', 
          noIndicates: 'NITROGEN_DEFICIENCY',
          fieldObservable: true 
        }
      ],
      en: [
        { 
          question: 'Did the lower (older) leaves turn yellow first?', 
          yesIndicates: 'NITROGEN_DEFICIENCY', 
          noIndicates: 'IRON_DEFICIENCY',
          fieldObservable: true 
        },
        { 
          question: 'Are veins green but the rest of leaf yellow?', 
          yesIndicates: 'IRON_DEFICIENCY', 
          noIndicates: 'NITROGEN_DEFICIENCY',
          fieldObservable: true 
        }
      ]
    }
  },
  {
    symptomId: 'LEAF_ROLLING',
    questions: {
      mr: [
        { 
          question: 'सकाळी झाड बरे दिसते का?', 
          yesIndicates: 'MILD_WATER_STRESS', 
          noIndicates: 'SEVERE_STRESS_OR_DISEASE',
          fieldObservable: true 
        },
        { 
          question: 'काही झाडे चांगली आहेत का (सगळी नाही)?', 
          yesIndicates: 'WILT_DISEASE', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        },
        { 
          question: 'फांदी कापल्यावर आतून तपकिरी दिसते का?', 
          yesIndicates: 'WILT_DISEASE', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        }
      ],
      hi: [
        { 
          question: 'क्या सुबह पौधा ठीक दिखता है?', 
          yesIndicates: 'MILD_WATER_STRESS', 
          noIndicates: 'SEVERE_STRESS_OR_DISEASE',
          fieldObservable: true 
        },
        { 
          question: 'क्या कुछ पौधे ठीक हैं (सब नहीं)?', 
          yesIndicates: 'WILT_DISEASE', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        }
      ],
      en: [
        { 
          question: 'Does the plant look better in the morning?', 
          yesIndicates: 'MILD_WATER_STRESS', 
          noIndicates: 'SEVERE_STRESS_OR_DISEASE',
          fieldObservable: true 
        },
        { 
          question: 'Are some plants healthy (not all affected)?', 
          yesIndicates: 'WILT_DISEASE', 
          noIndicates: 'WATER_STRESS',
          fieldObservable: true 
        }
      ]
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO REQUEST TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

interface PhotoRequestTemplate {
  symptomPatterns: string[];
  request: {
    mr: PhotoRequest;
    hi: PhotoRequest;
    en: PhotoRequest;
  };
}

const PHOTO_REQUEST_TEMPLATES: PhotoRequestTemplate[] = [
  {
    symptomPatterns: ['DEAD_HEART', 'WHORL', 'BORER'],
    request: {
      mr: {
        reason: 'मधली सुरळी वाळण्याची कारणे निश्चित करण्यासाठी फोटो आवश्यक आहे',
        whatToCapture: [
          'गाभा ओढून त्याचा फोटो काढा',
          'खोडाच्या बुंध्याजवळील भाग दाखवा',
          'वाळलेल्या सुरळीचा जवळून फोटो'
        ],
        urgency: 'MEDIUM',
        contextForAnalysis: { suspectedCauses: [] }
      },
      hi: {
        reason: 'गभ सूखने का कारण जानने के लिए फोटो जरूरी है',
        whatToCapture: [
          'गभ निकालकर उसका फोटो लें',
          'तने के पास का भाग दिखाएं',
          'सूखी पत्ती का करीब से फोटो'
        ],
        urgency: 'MEDIUM',
        contextForAnalysis: { suspectedCauses: [] }
      },
      en: {
        reason: 'Photo needed to determine the exact cause of dead heart',
        whatToCapture: [
          'Pull out the dead heart and take a photo',
          'Show the base of the stem near soil level',
          'Close-up of the dried whorl'
        ],
        urgency: 'MEDIUM',
        contextForAnalysis: { suspectedCauses: [] }
      }
    }
  },
  {
    symptomPatterns: ['YELLOWING', 'YELLOW', 'PALE'],
    request: {
      mr: {
        reason: 'पाने पिवळी होण्याचे नेमके कारण शोधण्यासाठी फोटो पाठवा',
        whatToCapture: [
          'पिवळ्या पानांचा जवळून फोटो',
          'संपूर्ण झाडाचा फोटो',
          'मातीची स्थिती दाखवा'
        ],
        urgency: 'LOW',
        contextForAnalysis: { suspectedCauses: [] }
      },
      hi: {
        reason: 'पत्ते पीले होने का सही कारण जानने के लिए फोटो भेजें',
        whatToCapture: [
          'पीली पत्तियों का करीबी फोटो',
          'पूरे पौधे का फोटो',
          'मिट्टी की स्थिति दिखाएं'
        ],
        urgency: 'LOW',
        contextForAnalysis: { suspectedCauses: [] }
      },
      en: {
        reason: 'Photo needed to identify exact cause of yellowing',
        whatToCapture: [
          'Close-up of yellow leaves',
          'Full plant photo',
          'Show soil condition'
        ],
        urgency: 'LOW',
        contextForAnalysis: { suspectedCauses: [] }
      }
    }
  },
  {
    symptomPatterns: ['SPOT', 'LESION', 'BLIGHT', 'RUST'],
    request: {
      mr: {
        reason: 'रोगाचे निदान करण्यासाठी डागांचा स्पष्ट फोटो आवश्यक',
        whatToCapture: [
          'डाग असलेल्या पानांचा जवळून फोटो',
          'डागांचा आकार आणि रंग स्पष्ट दिसेल असा फोटो',
          'पानाच्या खालच्या बाजूचा फोटो'
        ],
        urgency: 'HIGH',
        contextForAnalysis: { suspectedCauses: [] }
      },
      hi: {
        reason: 'बीमारी पहचानने के लिए धब्बों का स्पष्ट फोटो चाहिए',
        whatToCapture: [
          'धब्बे वाली पत्तियों का करीबी फोटो',
          'धब्बों का आकार और रंग स्पष्ट दिखे',
          'पत्ती की निचली तरफ का फोटो'
        ],
        urgency: 'HIGH',
        contextForAnalysis: { suspectedCauses: [] }
      },
      en: {
        reason: 'Clear photo of spots needed for disease diagnosis',
        whatToCapture: [
          'Close-up of affected leaves with spots',
          'Clear view of spot shape and color',
          'Photo of leaf underside'
        ],
        urgency: 'HIGH',
        contextForAnalysis: { suspectedCauses: [] }
      }
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAGNOSTIC MODE DETERMINATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine whether to enter DIAGNOSTIC, ACTION, or PHOTO_REQUIRED mode
 * 
 * CRITICAL RULES:
 * 1. If multiple causes have close probability → DIAGNOSTIC (ask questions)
 * 2. If confidence < 40% → PHOTO_REQUIRED
 * 3. If single dominant cause → ACTION (run Decision Graph)
 * 4. NO chemicals in DIAGNOSTIC mode
 */
export function determineDiagnosticMode(
  symptomAnalysis: SymptomAnalysis,
  fieldSnapshot: FieldContextSnapshot,
  language: string = 'mr'
): DiagnosticDecision {
  const reasoning: string[] = [];
  const eliminatedCauses: EliminatedCause[] = [];
  
  // Get language code for templates
  const lang = (language === 'hi' || language === 'mr' || language === 'en') 
    ? language as 'hi' | 'mr' | 'en'
    : 'en';
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: ELIMINATE CAUSES USING FIELD DATA
  // ═══════════════════════════════════════════════════════════════════════
  
  let remainingCauses = [...symptomAnalysis.possible_causes];
  const daysAfterSowing = fieldSnapshot.daysAfterSowing || 60;
  
  for (const cause of symptomAnalysis.possible_causes) {
    for (const rule of CAUSE_ELIMINATION_RULES) {
      // Check if this rule applies to this cause
      const matchesPattern = rule.causePatterns.some(pattern => 
        cause.cause.toString().includes(pattern) || 
        cause.cause_name.toUpperCase().includes(pattern)
      );
      
      if (matchesPattern && rule.eliminateWhen(fieldSnapshot, daysAfterSowing)) {
        // Eliminate this cause
        remainingCauses = remainingCauses.filter(c => c.cause !== cause.cause);
        eliminatedCauses.push({
          cause: cause.cause,
          causeName: cause.cause_name,
          eliminationReason: rule.reason(fieldSnapshot, daysAfterSowing),
          fieldDataUsed: rule.fieldDataUsed
        });
        reasoning.push(`Eliminated ${cause.cause_name}: ${rule.reason(fieldSnapshot, daysAfterSowing)}`);
      }
    }
  }
  
  console.log(`🔍 [Diagnostic Mode] Cause Elimination:`, {
    original: symptomAnalysis.possible_causes.length,
    eliminated: eliminatedCauses.length,
    remaining: remainingCauses.length
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: CHECK DATA CERTAINTY FOR ACTION GATING
  // ═══════════════════════════════════════════════════════════════════════
  
  const dataCertainty = fieldSnapshot.dataFreshness.overallCertainty;
  const actionSafetyLevel = getAllowedActionLevel(dataCertainty);
  
  // Determine if chemicals/fertilizers can be recommended
  const canRecommendChemicals = actionSafetyLevel === 'AGGRESSIVE';
  const canRecommendFertilizers = actionSafetyLevel !== 'CONSERVATIVE' && 
    !fieldSnapshot.soilBaseline.isEstimated;
  
  reasoning.push(`Data certainty: ${dataCertainty} → Action level: ${actionSafetyLevel}`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: DETERMINE MODE BASED ON REMAINING CAUSES
  // ═══════════════════════════════════════════════════════════════════════
  
  let mode: DiagnosticMode = 'ACTION';
  let confidence = symptomAnalysis.confidence;
  let disambiguationQuestions: DisambiguationQuestion[] = [];
  let photoRequest: PhotoRequest | null = null;
  
  if (remainingCauses.length === 0) {
    // No symptoms detected or all eliminated
    mode = 'ACTION';
    reasoning.push('No symptoms detected or all causes eliminated → proceeding with general advisory');
  } else if (remainingCauses.length === 1) {
    // Single cause → ACTION MODE
    mode = 'ACTION';
    confidence = Math.min(0.90, confidence + 0.15);
    reasoning.push(`Single cause remaining: ${remainingCauses[0].cause_name} → ACTION mode`);
  } else {
    // Multiple causes remaining
    const topCause = remainingCauses[0];
    const secondCause = remainingCauses[1];
    const probabilityGap = topCause.probability - secondCause.probability;
    
    if (probabilityGap > 0.25) {
      // Clear dominant cause
      mode = 'ACTION';
      reasoning.push(`Dominant cause: ${topCause.cause_name} (${Math.round(topCause.probability * 100)}% vs ${Math.round(secondCause.probability * 100)}%)`);
    } else if (confidence < 0.40) {
      // Very low confidence → request photo
      mode = 'PHOTO_REQUIRED';
      reasoning.push(`Confidence too low (${Math.round(confidence * 100)}%) → photo required`);
      
      // Generate photo request
      photoRequest = generatePhotoRequest(symptomAnalysis, remainingCauses, lang);
    } else {
      // Close probabilities → DIAGNOSTIC MODE
      mode = 'DIAGNOSTIC';
      reasoning.push(`Multiple causes with close probability → DIAGNOSTIC mode`);
      reasoning.push(`Top causes: ${remainingCauses.slice(0, 3).map(c => `${c.cause_name} (${Math.round(c.probability * 100)}%)`).join(', ')}`);
      
      // Generate disambiguation questions
      disambiguationQuestions = generateDisambiguationQuestions(symptomAnalysis, lang);
      
      // If no good questions, request photo
      if (disambiguationQuestions.length === 0) {
        mode = 'PHOTO_REQUIRED';
        reasoning.push('No good disambiguation questions available → photo required');
        photoRequest = generatePhotoRequest(symptomAnalysis, remainingCauses, lang);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: FINAL SAFETY CHECK
  // ═══════════════════════════════════════════════════════════════════════
  
  // If in DIAGNOSTIC mode, NEVER allow chemical recommendations
  const finalCanRecommendChemicals = mode === 'ACTION' ? canRecommendChemicals : false;
  const finalCanRecommendFertilizers = mode === 'ACTION' ? canRecommendFertilizers : false;
  
  if (mode === 'DIAGNOSTIC') {
    reasoning.push('DIAGNOSTIC MODE: Chemical and fertilizer recommendations blocked');
  }
  
  console.log(`🎯 [Diagnostic Mode] Final Decision:`, {
    mode,
    remainingCauses: remainingCauses.length,
    confidence: Math.round(confidence * 100) + '%',
    canChemicals: finalCanRecommendChemicals,
    canFertilizers: finalCanRecommendFertilizers
  });
  
  return {
    mode,
    // Land Identity
    landId: fieldSnapshot.landId,
    landName: fieldSnapshot.landName,
    cropName: fieldSnapshot.cropName,
    remainingCauses,
    eliminatedCauses,
    primaryCause: remainingCauses[0] || null,
    disambiguationQuestions,
    photoRequest,
    canRecommendChemicals: finalCanRecommendChemicals,
    canRecommendFertilizers: finalCanRecommendFertilizers,
    confidence,
    reasoning
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate disambiguation questions for the farmer
 */
function generateDisambiguationQuestions(
  symptomAnalysis: SymptomAnalysis,
  lang: 'mr' | 'hi' | 'en'
): DisambiguationQuestion[] {
  const questions: DisambiguationQuestion[] = [];
  
  // Find matching question templates based on detected symptoms
  for (const symptom of symptomAnalysis.detected_symptoms) {
    const template = DISAMBIGUATION_QUESTIONS.find(t => t.symptomId === symptom.symptom_id);
    if (template && template.questions[lang]) {
      questions.push(...template.questions[lang].slice(0, 2));
    }
  }
  
  // If no specific questions found, use follow-up checks from causes
  if (questions.length === 0 && symptomAnalysis.possible_causes.length > 0) {
    for (const cause of symptomAnalysis.possible_causes.slice(0, 2)) {
      for (const check of cause.additional_symptoms_to_check.slice(0, 2)) {
        questions.push({
          question: check,
          yesIndicates: cause.cause_name,
          noIndicates: 'OTHER',
          fieldObservable: true
        });
      }
    }
  }
  
  // Return max 3 unique questions
  const uniqueQuestions: DisambiguationQuestion[] = [];
  const seenQuestions = new Set<string>();
  
  for (const q of questions) {
    if (!seenQuestions.has(q.question)) {
      seenQuestions.add(q.question);
      uniqueQuestions.push(q);
      if (uniqueQuestions.length >= 3) break;
    }
  }
  
  return uniqueQuestions;
}

/**
 * Generate photo request based on symptoms and suspected causes
 */
function generatePhotoRequest(
  symptomAnalysis: SymptomAnalysis,
  remainingCauses: PossibleCause[],
  lang: 'mr' | 'hi' | 'en'
): PhotoRequest {
  // Find matching photo request template
  for (const template of PHOTO_REQUEST_TEMPLATES) {
    const matchesSymptom = symptomAnalysis.detected_symptoms.some(s =>
      template.symptomPatterns.some(p => 
        s.symptom_id.toUpperCase().includes(p) ||
        s.symptom_name.toUpperCase().includes(p)
      )
    );
    
    if (matchesSymptom) {
      const request = { ...template.request[lang] };
      request.contextForAnalysis.suspectedCauses = remainingCauses.map(c => c.cause_name);
      return request;
    }
  }
  
  // Default photo request
  const defaultRequests = {
    mr: {
      reason: 'समस्येचे नेमके निदान करण्यासाठी फोटो पाठवा',
      whatToCapture: [
        'प्रभावित भागाचा जवळून फोटो',
        'संपूर्ण झाडाचा फोटो',
        'आजूबाजूच्या झाडांची स्थिती'
      ],
      urgency: 'MEDIUM' as const,
      contextForAnalysis: {
        suspectedCauses: remainingCauses.map(c => c.cause_name)
      }
    },
    hi: {
      reason: 'समस्या की सही पहचान के लिए फोटो भेजें',
      whatToCapture: [
        'प्रभावित भाग का करीबी फोटो',
        'पूरे पौधे का फोटो',
        'आसपास के पौधों की स्थिति'
      ],
      urgency: 'MEDIUM' as const,
      contextForAnalysis: {
        suspectedCauses: remainingCauses.map(c => c.cause_name)
      }
    },
    en: {
      reason: 'Photo needed for accurate diagnosis',
      whatToCapture: [
        'Close-up of affected area',
        'Full plant photo',
        'Condition of surrounding plants'
      ],
      urgency: 'MEDIUM' as const,
      contextForAnalysis: {
        suspectedCauses: remainingCauses.map(c => c.cause_name)
      }
    }
  };
  
  return defaultRequests[lang];
}

/**
 * Check if a specific cause type is allowed given the diagnostic decision
 */
export function isCauseActionAllowed(
  decision: DiagnosticDecision,
  actionType: 'chemical' | 'fertilizer' | 'irrigation' | 'mechanical' | 'observation'
): boolean {
  switch (actionType) {
    case 'chemical':
      return decision.canRecommendChemicals && decision.mode === 'ACTION';
    case 'fertilizer':
      return decision.canRecommendFertilizers && decision.mode === 'ACTION';
    case 'irrigation':
      return decision.mode === 'ACTION';
    case 'mechanical':
      return decision.mode !== 'PHOTO_REQUIRED'; // Allowed in both DIAGNOSTIC and ACTION
    case 'observation':
      return true; // Always allowed
    default:
      return false;
  }
}
