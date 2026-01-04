/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-8: CLARIFICATION RENDERER (LLM = TRANSLATOR ONLY)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Convert ObservationKeys to farmer-friendly language safely.
 * The LLM ONLY translates - it NEVER decides anything.
 * 
 * PHASE-8.1 UPDATE:
 * - Stage-aware framing when CropContextAuthority exists
 * - Prepend crop + stage info to clarification questions (NO DIAGNOSIS)
 * 
 * RULES:
 * - Input: ClarificationScope + ObservationKeys + Language + optional CropContext
 * - Output: Question + Options (validated for safety)
 * - LLM is a RENDERER ONLY - no decisions
 * - Hard validation gate rejects unsafe output
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ObservationKey } from '../decision/observation-ontology.ts';
import { type CropContextAuthority, formatCropContextFrame } from '../decision/context-authority.ts';

export const CLARIFICATION_RENDERER_VERSION = '1.1.0'; // Phase-8.1 update

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION SCOPE ENUM (PHASE-8)
// ═══════════════════════════════════════════════════════════════════════════

export enum ClarificationScope {
  IDENTIFY_CROP = 'IDENTIFY_CROP',
  IDENTIFY_LOCATION = 'IDENTIFY_LOCATION',        // Affected part
  IDENTIFY_DISTRIBUTION = 'IDENTIFY_DISTRIBUTION',
  IDENTIFY_SEVERITY = 'IDENTIFY_SEVERITY',
  IDENTIFY_TIMING = 'IDENTIFY_TIMING',
  IDENTIFY_INSECT_TYPE = 'IDENTIFY_INSECT_TYPE',  // PHASE-10: Before distribution for insects
  REFINE_OBSERVATION = 'REFINE_OBSERVATION',
  PHOTO_ONLY = 'PHOTO_ONLY',
  STOP_ESCALATE = 'STOP_ESCALATE'
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationRenderInput {
  scope: ClarificationScope;
  target_observation_keys: ObservationKey[];
  language_code: 'mr' | 'hi' | 'en';
  max_options: number;  // 2-4
  turn_count: number;
  constraints: {
    no_diagnosis: true;
    no_treatment: true;
    no_assumptions: true;
  };
  /** PHASE-8.1: Optional crop context for stage-aware framing */
  cropContext?: CropContextAuthority | null;
}

export interface ClarificationRenderOutput {
  question: string;
  options: string[];
  photo_request: boolean;
  validation_passed: boolean;
  violations: string[];
  scope: ClarificationScope;
  rendered_by: 'TEMPLATE' | 'LLM';
  /** PHASE-8.1: Whether crop context framing was applied */
  crop_framing_applied?: boolean;
}

export interface SafetyValidationResult {
  valid: boolean;
  violations: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE-BASED RENDERER (Preferred - No LLM needed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-defined safe templates for each clarification scope.
 * These are diagnosis-neutral and safe to use without validation.
 */
const CLARIFICATION_TEMPLATES: Record<ClarificationScope, Record<'mr' | 'hi' | 'en', {
  question: string;
  options: string[];
}>> = {
  [ClarificationScope.IDENTIFY_CROP]: {
    mr: {
      question: '🌾 कोणत्या पिकाबद्दल तुम्ही विचारत आहात?',
      options: ['ऊस', 'कापूस', 'सोयाबीन', 'इतर पीक']
    },
    hi: {
      question: '🌾 आप किस फसल के बारे में पूछ रहे हैं?',
      options: ['गन्ना', 'कपास', 'सोयाबीन', 'अन्य फसल']
    },
    en: {
      question: '🌾 Which crop are you asking about?',
      options: ['Sugarcane', 'Cotton', 'Soybean', 'Other crop']
    }
  },
  
  [ClarificationScope.IDENTIFY_LOCATION]: {
    mr: {
      question: '🌿 झाडाच्या कोणत्या भागावर समस्या दिसते?',
      options: ['पान', 'खोड / देठ', 'मूळ', 'फळ / बोंड']
    },
    hi: {
      question: '🌿 पौधे के किस हिस्से पर समस्या दिख रही है?',
      options: ['पत्ते', 'तना / डंठल', 'जड़', 'फल / बॉल']
    },
    en: {
      question: '🌿 Which part of the plant is affected?',
      options: ['Leaves', 'Stem / Stalk', 'Roots', 'Fruit / Boll']
    }
  },
  
  [ClarificationScope.IDENTIFY_DISTRIBUTION]: {
    mr: {
      question: '📍 शेतात समस्या कशी पसरली आहे?',
      options: ['सगळीकडे सारखी', 'ठिकठिकाणी वेगळी', 'कडेने जास्त', 'मध्यभागी जास्त']
    },
    hi: {
      question: '📍 खेत में समस्या कैसे फैली है?',
      options: ['हर जगह एक जैसी', 'जगह-जगह अलग', 'किनारों पर ज्यादा', 'बीच में ज्यादा']
    },
    en: {
      question: '📍 How is the problem distributed in the field?',
      options: ['Uniform everywhere', 'Patchy/scattered', 'More on edges', 'More in center']
    }
  },
  
  [ClarificationScope.IDENTIFY_SEVERITY]: {
    mr: {
      question: '📊 समस्या किती गंभीर आहे?',
      options: ['थोडी (काही झाडे)', 'मध्यम (अर्धे शेत)', 'जास्त (बहुतेक शेत)']
    },
    hi: {
      question: '📊 समस्या कितनी गंभीर है?',
      options: ['थोड़ी (कुछ पौधे)', 'मध्यम (आधा खेत)', 'ज्यादा (अधिकतर खेत)']
    },
    en: {
      question: '📊 How severe is the problem?',
      options: ['Light (few plants)', 'Moderate (half field)', 'Heavy (most of field)']
    }
  },
  
  [ClarificationScope.IDENTIFY_TIMING]: {
    mr: {
      question: '⏰ समस्या कधीपासून दिसत आहे?',
      options: ['आज / काल', 'या आठवड्यात', 'गेल्या आठवड्यापासून', 'खूप दिवसांपासून']
    },
    hi: {
      question: '⏰ समस्या कब से दिख रही है?',
      options: ['आज / कल', 'इस हफ्ते', 'पिछले हफ्ते से', 'बहुत दिनों से']
    },
    en: {
      question: '⏰ When did you first notice this problem?',
      options: ['Today/Yesterday', 'This week', 'Since last week', 'Long time']
    }
  },
  
  // PHASE-10: Insect type clarification (before distribution for SMALL_INSECTS_VISIBLE)
  [ClarificationScope.IDENTIFY_INSECT_TYPE]: {
    mr: {
      question: '🐛 किडे कसे दिसतात? (यामुळे योग्य उपाय सांगता येईल)',
      options: ['हिरवट-पिवळे लहान किडे (मावा)', 'बारीक लांबट काळे किडे (थ्रिप्स)', 'पानांवर जाळी आणि लाल ठिपके (कोळी)']
    },
    hi: {
      question: '🐛 कीड़े कैसे दिखते हैं? (इससे सही इलाज बताना आसान होगा)',
      options: ['हरे-पीले छोटे कीड़े (माहूं)', 'पतले लंबे काले कीड़े (थ्रिप्स)', 'पत्तों पर जाला और लाल धब्बे (मकड़ी)']
    },
    en: {
      question: '🐛 What do the insects look like? (This helps recommend the right treatment)',
      options: ['Small green-yellow insects (Aphids)', 'Tiny elongated dark insects (Thrips)', 'Fine webbing with red spots (Mites)']
    }
  },
  
  [ClarificationScope.REFINE_OBSERVATION]: {
    mr: {
      question: '🔍 तुम्ही नेमके काय पाहत आहात?',
      options: ['रंग बदलला', 'छिद्र/भोक दिसतात', 'वाळलेले/सुकलेले', 'किडे दिसतात']
    },
    hi: {
      question: '🔍 आप ठीक से क्या देख रहे हैं?',
      options: ['रंग बदला है', 'छेद दिखते हैं', 'सूखा/मुरझाया', 'कीड़े दिखते हैं']
    },
    en: {
      question: '🔍 What exactly are you observing?',
      options: ['Color change', 'Holes visible', 'Drying/wilting', 'Insects visible']
    }
  },
  
  [ClarificationScope.PHOTO_ONLY]: {
    mr: {
      question: '📸 कृपया प्रभावित भागाचा फोटो पाठवा. यामुळे अचूक सल्ला देणे सोपे होईल.',
      options: []
    },
    hi: {
      question: '📸 कृपया प्रभावित हिस्से की फोटो भेजें। इससे सही सलाह देना आसान होगा।',
      options: []
    },
    en: {
      question: '📸 Please send a photo of the affected area. This will help provide accurate advice.',
      options: []
    }
  },
  
  [ClarificationScope.STOP_ESCALATE]: {
    mr: {
      question: '🌱 सध्या पिकाचे निरीक्षण करा. जर समस्या वाढली तर परत संपर्क करा किंवा जवळच्या कृषी सेवा केंद्राला भेट द्या.',
      options: []
    },
    hi: {
      question: '🌱 अभी फसल की निगरानी करें। अगर समस्या बढ़े तो फिर संपर्क करें या नजदीकी कृषि सेवा केंद्र जाएं।',
      options: []
    },
    en: {
      question: '🌱 Please monitor your crop for now. If the problem increases, contact us again or visit your nearest agriculture service center.',
      options: []
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY VALIDATION (HARD GATE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FORBIDDEN patterns - if any match, the turn FAILS.
 * This is the HARD SAFETY GATE.
 * 
 * PHASE-9 UPDATE: Added additional pest patterns as per Task 8 requirements.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  // Pest names (Marathi/Hindi/English) - PHASE-9 EXTENDED
  /बोरर|borer|छेदक|stem\s*borer|shoot\s*borer/i,
  /बोंड\s*अळी|bollworm|बॉल\s*वर्म|pink\s*bollworm/i,
  /मावा|माहू|aphid/i,
  /तुडतुड|फुदक|hopper|jassid|planthopper/i,
  /स्पोडोप्टेरा|spodoptera|caterpillar|army\s*worm/i,
  /पांढरी\s*माशी|सफेद\s*मक्खी|whitefly|white\s*fly/i,
  /थ्रिप्स|thrips/i,
  /मीली\s*बग|mealybug|mealy\s*bug/i,
  
  // Disease names - PHASE-9 EXTENDED
  /तांबेरा|रतुआ|rust/i,
  /करपा|ब्लास्ट|blast/i,
  /कुज(?!त)|सड़न|rot(?!ting)/i,  // Negative lookahead to allow "rotting" as symptom
  /झुलसा|blight/i,
  /फफूंद|fungus|fungal/i,
  /विषाणू|वायरस|virus|viral/i,
  /जीवाणू|bacteria|bacterial/i,
  /मुरझाना|wilt(?!ing)/i,  // Allow "wilting" as symptom
  
  // Nutrient names
  /नत्र|नाइट्रोजन|nitrogen/i,
  /स्फुरद|फास्फोरस|phosphorus/i,
  /पालाश|पोटाश|potassium|potash/i,
  /सूक्ष्म\s*पोषक|micronutrient/i,
  /जस्त|जिंक|zinc/i,
  /लोह|आयरन|iron\s+deficiency/i,
  
  // Treatment patterns
  /spray|फवारणी|स्प्रे/i,
  /ml\s*\/\s*liter|ग्रॅम\s*.*\s*लिटर/i,
  /pesticide|कीटनाशक/i,
  /fungicide|फफूंदनाशक|बुरशीनाशक/i,
  /dosage|डोस|मात्रा/i,
  /apply|लावा|लगाओ|छिड़काव/i,
  
  // Product names
  /imidacloprid|chlorpyrifos|monocrotophos/i,
  /thiamethoxam|acetamiprid|fipronil/i,
  /carbendazim|mancozeb|copper/i
];

/**
 * Validate clarification output for safety.
 * If ANY forbidden pattern is found, the turn FAILS.
 */
export function validateClarificationSafety(
  output: Pick<ClarificationRenderOutput, 'question' | 'options'>
): SafetyValidationResult {
  const violations: string[] = [];
  
  // Check question
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(output.question)) {
      violations.push(`Forbidden pattern in question: ${pattern.source}`);
    }
  }
  
  // Check each option
  for (const option of output.options) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(option)) {
        violations.push(`Forbidden pattern in option "${option.substring(0, 20)}...": ${pattern.source}`);
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Render clarification using templates (no LLM needed).
 * Templates are pre-validated and safe.
 * 
 * PHASE-8.1: Added crop context framing for stage-aware questions.
 */
export function renderClarification(
  input: ClarificationRenderInput
): ClarificationRenderOutput {
  const { scope, language_code, max_options, turn_count, cropContext } = input;
  
  // Get template for this scope and language
  const template = CLARIFICATION_TEMPLATES[scope]?.[language_code];
  
  if (!template) {
    // Fallback to English
    const fallbackTemplate = CLARIFICATION_TEMPLATES[scope]?.en || {
      question: 'Please provide more details about your crop issue.',
      options: []
    };
    
    return {
      question: fallbackTemplate.question,
      options: fallbackTemplate.options.slice(0, max_options),
      photo_request: scope === ClarificationScope.PHOTO_ONLY,
      validation_passed: true, // Templates are pre-validated
      violations: [],
      scope,
      rendered_by: 'TEMPLATE',
      crop_framing_applied: false
    };
  }
  
  // Limit options to max_options
  const limitedOptions = template.options.slice(0, max_options);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-8.1: Stage-Aware Framing (NO DIAGNOSIS)
  // If crop context exists, prepend crop + stage info to question
  // ═══════════════════════════════════════════════════════════════════════════
  let finalQuestion = template.question;
  let cropFramingApplied = false;
  
  if (cropContext && cropContext.crop_name && scope !== ClarificationScope.IDENTIFY_CROP) {
    // Prepend crop context frame (e.g., "🌾 तुमच्या गव्हामध्ये (Tillering अवस्था)")
    const cropFrame = formatCropContextFrame(cropContext, language_code);
    
    // Format: "{CropFrame}\n\n{Question}"
    finalQuestion = `${cropFrame}\n\n${template.question}`;
    cropFramingApplied = true;
  }
  
  // Templates are pre-validated, but run safety check anyway
  const safetyResult = validateClarificationSafety({
    question: finalQuestion,
    options: limitedOptions
  });
  
  return {
    question: finalQuestion,
    options: limitedOptions,
    photo_request: scope === ClarificationScope.PHOTO_ONLY,
    validation_passed: safetyResult.valid,
    violations: safetyResult.violations,
    scope,
    rendered_by: 'TEMPLATE',
    crop_framing_applied: cropFramingApplied
  };
}

/**
 * Get monitoring advice for when clarification limit is reached (STOP_ESCALATE).
 */
export function getMonitoringAdvice(language: 'mr' | 'hi' | 'en'): string {
  const advice: Record<string, string> = {
    mr: '🌱 सध्या पिकाचे काळजीपूर्वक निरीक्षण करा. जर समस्या वाढली तर:\n\n1️⃣ प्रभावित भागाचा स्पष्ट फोटो काढा\n2️⃣ परत आमच्याशी संपर्क करा\n3️⃣ किंवा जवळच्या कृषी सेवा केंद्राला भेट द्या\n\nतुमच्या पिकाची काळजी घ्या! 🙏',
    hi: '🌱 अभी फसल की ध्यान से निगरानी करें। अगर समस्या बढ़े तो:\n\n1️⃣ प्रभावित हिस्से की साफ फोटो लें\n2️⃣ फिर से हमसे संपर्क करें\n3️⃣ या नजदीकी कृषि सेवा केंद्र जाएं\n\nअपनी फसल का ख्याल रखें! 🙏',
    en: '🌱 Please monitor your crop carefully for now. If the problem increases:\n\n1️⃣ Take a clear photo of the affected area\n2️⃣ Contact us again\n3️⃣ Or visit your nearest agriculture service center\n\nTake care of your crop! 🙏'
  };
  
  return advice[language] || advice.en;
}

export default {
  ClarificationScope,
  renderClarification,
  validateClarificationSafety,
  getMonitoringAdvice,
  CLARIFICATION_RENDERER_VERSION
};
