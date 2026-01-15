/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS-FIRST RESPONSE GENERATOR (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * When crop damage is detected with full land context, immediately generate
 * ranked diagnosis options from candidate hypotheses (decision_rules) instead
 * of asking generic clarification questions.
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "When a farmer reports dying crops, we present possible causes immediately.
 * We do NOT ask 'what problem do you see?' - that's not agronomist practice."
 * 
 * ARCHITECTURE:
 * 1. Takes candidate hypotheses from hypothesis-evaluator.ts
 * 2. Generates ranked diagnosis options (top 3-5 causes)
 * 3. Includes differentiating observations from observable_characteristics
 * 4. ALWAYS appends photo option as final fallback
 * 5. Returns response ready for UI rendering
 * 
 * HARD INVARIANTS:
 * - When land context exists, options MUST come from decision_rules
 * - Generic symptom lists are NEVER returned
 * - Photo option is ALWAYS available
 * - Diagnoses ranked by: priority → confidence → severity
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { CandidateHypothesis, HypothesisEvaluationOutput } from './hypothesis-evaluator.ts';

export const DIAGNOSIS_FIRST_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosisOption {
  id: string;
  cause: string;
  cause_label: string;  // Farmer-friendly name in requested language
  canonical_group: string;
  observation_key: string;  // Key differentiating symptom to look for
  observation_label: string;  // What farmer should check
  confidence: number;
  priority: number;
  icon: string;  // Emoji for visual aid
  rule_id: string;
}

export interface PhotoOption {
  id: 'PHOTO_UPLOAD';
  label: string;
  icon: '📷';
  description: string;
}

export interface DiagnosisFirstOutput {
  mode: 'DIAGNOSIS_FIRST';
  source: 'DECISION_RULES';
  question_text: string;
  
  // Ranked diagnosis options (top 3-5)
  diagnoses: DiagnosisOption[];
  
  // Photo option (always last)
  photo_option: PhotoOption;
  
  // Metadata
  crop_code: string;
  growth_stage: string;
  total_hypotheses_considered: number;
  timestamp: number;
  trace_id: string;
}

export interface DiagnosisFirstInput {
  hypotheses: CandidateHypothesis[];
  crop_code: string;
  growth_stage: string;
  current_observations: string[];
  language: 'mr' | 'hi' | 'en';
  damage_observations?: string[];
  trace_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP ICONS
// ═══════════════════════════════════════════════════════════════════════════

const GROUP_ICONS: Record<string, string> = {
  'pest': '🐛',
  'borer': '🐛',
  'insect': '🐜',
  'mite': '🕷️',
  'disease': '🦠',
  'fungal': '🍄',
  'bacterial': '🦠',
  'viral': '🧬',
  'stress': '🌡️',
  'irrigation': '💧',
  'nutrition': '🍃',
  'deficiency': '🌿',
  'germination': '🌱',
  'establishment': '🌱',
  'soil_borne': '🪱',
  'termite': '🐜',
  'unknown': '🔍'
};

function getGroupIcon(canonicalGroup: string): string {
  const groupLower = canonicalGroup.toLowerCase();
  return GROUP_ICONS[groupLower] || '🔍';
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE NAME TRANSLATIONS
// ═══════════════════════════════════════════════════════════════════════════

const CAUSE_TRANSLATIONS: Record<string, { mr: string; hi: string; en: string }> = {
  // Borers
  'shoot_borer': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Shoot Borer' },
  'stem_borer': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Stem Borer' },
  'internode_borer': { mr: 'कांडी किडा', hi: 'इंटरनोड बोरर', en: 'Internode Borer' },
  'early_shoot_borer': { mr: 'सुरुवातीची खोड किडा', hi: 'प्रारंभिक तना छेदक', en: 'Early Shoot Borer' },
  'top_borer': { mr: 'शेंडा किडा', hi: 'टॉप बोरर', en: 'Top Borer' },
  
  // Termites and soil pests
  'termite': { mr: 'वाळवी', hi: 'दीमक', en: 'Termite' },
  'termite_attack': { mr: 'वाळवी हल्ला', hi: 'दीमक का हमला', en: 'Termite Attack' },
  'white_grub': { mr: 'पांढरी अळी', hi: 'सफेद ग्रब', en: 'White Grub' },
  'root_grub': { mr: 'मूळ अळी', hi: 'जड़ ग्रब', en: 'Root Grub' },
  
  // Sucking pests
  'whitefly': { mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly' },
  'aphid': { mr: 'मावा', hi: 'माहू', en: 'Aphid' },
  'thrips': { mr: 'तुडतुडे', hi: 'थ्रिप्स', en: 'Thrips' },
  'jassid': { mr: 'तुडतुडे', hi: 'जैसिड', en: 'Jassid' },
  'mealybug': { mr: 'लुसलुशी किडा', hi: 'मीलीबग', en: 'Mealybug' },
  
  // Bollworms
  'bollworm': { mr: 'बोंडअळी', hi: 'बोलवर्म', en: 'Bollworm' },
  'pink_bollworm': { mr: 'गुलाबी बोंडअळी', hi: 'गुलाबी बोलवर्म', en: 'Pink Bollworm' },
  'american_bollworm': { mr: 'अमेरिकन बोंडअळी', hi: 'अमेरिकन बोलवर्म', en: 'American Bollworm' },
  
  // Diseases
  'root_rot': { mr: 'मूळ कुज', hi: 'जड़ सड़न', en: 'Root Rot' },
  'wilt': { mr: 'मर रोग', hi: 'म्लानि', en: 'Wilt' },
  'red_rot': { mr: 'लाल कुज', hi: 'लाल सड़न', en: 'Red Rot' },
  'smut': { mr: 'काणी', hi: 'कंडुआ', en: 'Smut' },
  'leaf_spot': { mr: 'पानावर डाग', hi: 'पत्ती धब्बा', en: 'Leaf Spot' },
  'rust': { mr: 'तांबेरा', hi: 'गेरुआ', en: 'Rust' },
  'blight': { mr: 'करपा', hi: 'झुलसा', en: 'Blight' },
  'collar_rot': { mr: 'मुळांची कुज', hi: 'कॉलर रॉट', en: 'Collar Rot' },
  
  // Stress/Deficiency
  'water_stress': { mr: 'पाणी ताण', hi: 'पानी तनाव', en: 'Water Stress' },
  'waterlogging': { mr: 'पाणी साचणे', hi: 'जलभराव', en: 'Waterlogging' },
  'nitrogen_deficiency': { mr: 'नायट्रोजन कमतरता', hi: 'नाइट्रोजन की कमी', en: 'Nitrogen Deficiency' },
  'phosphorus_deficiency': { mr: 'स्फुरद कमतरता', hi: 'फास्फोरस की कमी', en: 'Phosphorus Deficiency' },
  'potassium_deficiency': { mr: 'पालाश कमतरता', hi: 'पोटाश की कमी', en: 'Potassium Deficiency' },
  'iron_deficiency': { mr: 'लोह कमतरता', hi: 'लोहे की कमी', en: 'Iron Deficiency' }
};

function getCauseLabel(cause: string, language: 'mr' | 'hi' | 'en'): string {
  const normalized = cause.toLowerCase().replace(/[\s-]+/g, '_');
  const translation = CAUSE_TRANSLATIONS[normalized];
  if (translation) {
    return translation[language];
  }
  // Fallback: capitalize cause name
  return cause.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION KEY TO FARMER-FRIENDLY LABEL
// ═══════════════════════════════════════════════════════════════════════════

const OBSERVATION_LABELS: Record<string, { mr: string; hi: string; en: string }> = {
  'DEAD_HEART': { mr: 'मधला सुरळी वाळलेला', hi: 'मध्य सूख गया', en: 'Dead heart (central whorl dried)' },
  'DEAD_HEART_VISIBLE': { mr: 'मधला सुरळी वाळलेला', hi: 'मध्य सूख गया', en: 'Dead heart visible' },
  'TUNNELS_IN_STEM': { mr: 'खोडात भोके', hi: 'तने में सुरंग', en: 'Tunnels in stem' },
  'BORE_HOLES': { mr: 'खोडावर भोके', hi: 'तने में छेद', en: 'Bore holes in stem' },
  'FRASS_VISIBLE': { mr: 'भुसा दिसतो', hi: 'भूसा दिखता है', en: 'Frass (sawdust-like waste) visible' },
  'MUD_TUBES_VISIBLE': { mr: 'मातीचे बोगदे', hi: 'मिट्टी की नलियाँ', en: 'Mud tubes at base' },
  'MUD_GALLERIES': { mr: 'मातीचे बोगदे', hi: 'मिट्टी की नलियाँ', en: 'Mud galleries' },
  'TERMITE_DAMAGE': { mr: 'वाळवीचे नुकसान', hi: 'दीमक का नुकसान', en: 'Termite damage' },
  'ROOT_DAMAGE': { mr: 'मुळांचे नुकसान', hi: 'जड़ का नुकसान', en: 'Root damage visible' },
  'ROOT_ROT': { mr: 'मूळ कुजलेले', hi: 'जड़ सड़ी', en: 'Roots are rotting' },
  'WATERLOGGED_ROOTS': { mr: 'मुळांवर पाणी', hi: 'जड़ों में पानी', en: 'Waterlogged roots' },
  'EASY_TO_PULL': { mr: 'झाड सहज उपटते', hi: 'पौधा आसानी से उखड़ता', en: 'Plant pulls out easily' },
  'PLANT_FALLING_OVER': { mr: 'झाड पडते', hi: 'पौधा गिर रहा', en: 'Plant falling over' },
  'WILTING': { mr: 'मुरझलेले', hi: 'मुरझाया', en: 'Wilting visible' },
  'YELLOWING': { mr: 'पिवळे झाले', hi: 'पीला हो गया', en: 'Yellowing' },
  'HONEYDEW': { mr: 'चिकट पदार्थ', hi: 'चिपचिपा पदार्थ', en: 'Sticky honeydew' },
  'SOOTY_MOLD': { mr: 'काळी बुरशी', hi: 'काला फफूंद', en: 'Black sooty mold' },
  'SMALL_INSECTS_VISIBLE': { mr: 'लहान किडे दिसतात', hi: 'छोटे कीड़े दिखते', en: 'Small insects visible' },
  'LARVAE_VISIBLE': { mr: 'अळ्या दिसतात', hi: 'लार्वा दिखता है', en: 'Larvae visible' }
};

function getObservationLabel(key: string, language: 'mr' | 'hi' | 'en'): string {
  const normalized = key.toUpperCase().replace(/[\s-]+/g, '_');
  const translation = OBSERVATION_LABELS[normalized];
  if (translation) {
    return translation[language];
  }
  // Fallback: format the key
  return key.replace(/_/g, ' ').toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO OPTION LABELS
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_LABELS: Record<string, { label: string; description: string }> = {
  'mr': { label: '📷 फोटो पाठवा', description: 'अधिक अचूक निदानासाठी पिकाचा फोटो पाठवा' },
  'hi': { label: '📷 फोटो भेजें', description: 'अधिक सटीक निदान के लिए फसल का फोटो भेजें' },
  'en': { label: '📷 Send Photo', description: 'Send a crop photo for more accurate diagnosis' }
};

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSIS QUESTION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const DIAGNOSIS_QUESTION_TEMPLATES: Record<string, { single: string; multiple: string }> = {
  'mr': {
    single: '🔬 तुमच्या पिकाला {cause} चा त्रास असू शकतो. खालील पैकी काय दिसते?',
    multiple: '🔬 तुमच्या पिकाला खालीलपैकी कोणती समस्या असू शकते? (सर्वात जवळचे निवडा)'
  },
  'hi': {
    single: '🔬 आपकी फसल को {cause} की समस्या हो सकती है। इनमें से क्या दिखता है?',
    multiple: '🔬 आपकी फसल में इनमें से कौन सी समस्या हो सकती है? (सबसे नज़दीकी चुनें)'
  },
  'en': {
    single: '🔬 Your crop may be affected by {cause}. Which of these do you see?',
    multiple: '🔬 Your crop may have one of these issues. Select the closest match:'
  }
};

function getQuestionText(
  diagnoses: DiagnosisOption[],
  language: 'mr' | 'hi' | 'en'
): string {
  const template = DIAGNOSIS_QUESTION_TEMPLATES[language] || DIAGNOSIS_QUESTION_TEMPLATES['en'];
  
  if (diagnoses.length === 1) {
    return template.single.replace('{cause}', diagnoses[0].cause_label);
  }
  
  return template.multiple;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate diagnosis-first response from candidate hypotheses.
 * 
 * PRINCIPLE: When crop damage is reported with land context, show ranked
 * diagnosis options immediately - don't ask generic clarification questions.
 * 
 * This is how a senior agronomist operates in the field.
 */
export function generateDiagnosisFirstResponse(
  input: DiagnosisFirstInput
): DiagnosisFirstOutput | null {
  const {
    hypotheses,
    crop_code,
    growth_stage,
    current_observations,
    language,
    damage_observations,
    trace_id
  } = input;
  
  const traceIdFinal = trace_id || `diag_${Date.now()}`;
  
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`🔬 [DiagnosisFirst v${DIAGNOSIS_FIRST_VERSION}] Generating diagnosis options`);
  console.log(`   Mode=DIAGNOSIS_FIRST`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Clarification=HYPOTHESIS_DRIVEN`);
  console.log(`   Crop=${crop_code}, Stage=${growth_stage}`);
  console.log(`   Hypotheses received: ${hypotheses.length}`);
  console.log(`   Damage observations: ${(damage_observations || []).join(', ') || 'none'}`);
  
  // Validate: Need at least one hypothesis
  if (!hypotheses || hypotheses.length === 0) {
    console.log(`   ⚠️ No hypotheses available - cannot generate diagnosis-first response`);
    return null;
  }
  
  // Sort hypotheses by priority → confidence (total_score)
  const sortedHypotheses = [...hypotheses].sort((a, b) => {
    // Higher priority first (priority 1 is highest)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Higher confidence first
    return b.total_score - a.total_score;
  });
  
  // Take top 4 hypotheses
  const topHypotheses = sortedHypotheses.slice(0, 4);
  
  console.log(`   📊 Top hypotheses:`);
  topHypotheses.forEach((h, i) => {
    console.log(`      ${i + 1}. ${h.cause} (group=${h.canonical_group}, priority=${h.priority}, score=${h.total_score.toFixed(2)})`);
  });
  
  // Generate diagnosis options
  const diagnoses: DiagnosisOption[] = topHypotheses.map((h, idx) => {
    // Get the best differentiating observation for this hypothesis
    let bestObservation = h.observable_characteristics?.[0];
    
    // Try to find an observation not already known
    for (const obs of h.observable_characteristics || []) {
      const obsKey = obs.observation_key.toUpperCase();
      if (!current_observations.some(co => co.toUpperCase() === obsKey)) {
        bestObservation = obs;
        break;
      }
    }
    
    const observationKey = bestObservation?.observation_key || 'VISUAL_CHECK';
    
    return {
      id: `diag_${idx}_${h.rule_id}`,
      cause: h.cause,
      cause_label: getCauseLabel(h.cause, language),
      canonical_group: h.canonical_group,
      observation_key: observationKey,
      observation_label: getObservationLabel(observationKey, language),
      confidence: h.total_score,
      priority: h.priority,
      icon: getGroupIcon(h.canonical_group),
      rule_id: h.rule_id
    };
  });
  
  // Generate photo option (ALWAYS present)
  const photoLabels = PHOTO_LABELS[language] || PHOTO_LABELS['en'];
  const photoOption: PhotoOption = {
    id: 'PHOTO_UPLOAD',
    label: photoLabels.label,
    icon: '📷',
    description: photoLabels.description
  };
  
  // Generate question text
  const questionText = getQuestionText(diagnoses, language);
  
  console.log(`   ✅ Generated ${diagnoses.length} diagnosis options + photo option`);
  console.log(`   Question: "${questionText.substring(0, 60)}..."`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  return {
    mode: 'DIAGNOSIS_FIRST',
    source: 'DECISION_RULES',
    question_text: questionText,
    diagnoses,
    photo_option: photoOption,
    crop_code,
    growth_stage,
    total_hypotheses_considered: hypotheses.length,
    timestamp: Date.now(),
    trace_id: traceIdFinal
  };
}

/**
 * Create UNKNOWN diagnosis when no rules match.
 * This is a formal positive output - we NEVER suppress output when crop damage exists.
 */
export function createUnknownDiagnosisResponse(
  crop_code: string,
  growth_stage: string,
  damage_observations: string[],
  language: 'mr' | 'hi' | 'en',
  trace_id?: string
): DiagnosisFirstOutput {
  const traceIdFinal = trace_id || `unknown_${Date.now()}`;
  
  console.log(`\n🔍 [DiagnosisFirst] Creating UNKNOWN diagnosis response`);
  console.log(`   Crop=${crop_code}, Stage=${growth_stage}`);
  console.log(`   Damage observed: ${damage_observations.join(', ')}`);
  
  const unknownMessages: Record<string, string> = {
    'mr': '🔍 तुमच्या पिकात समस्या दिसत आहे पण नेमके कारण ओळखण्यासाठी अधिक माहिती हवी.',
    'hi': '🔍 आपकी फसल में समस्या है लेकिन सही कारण जानने के लिए अधिक जानकारी चाहिए।',
    'en': '🔍 Your crop has an issue but we need more information to identify the exact cause.'
  };
  
  const checkLabels: Record<string, { water: string; pest: string; nutrient: string }> = {
    'mr': {
      water: 'पाण्याची समस्या (जास्त/कमी पाणी)',
      pest: 'कीड/किडीचा हल्ला',
      nutrient: 'पोषण कमतरता (खत कमी)'
    },
    'hi': {
      water: 'पानी की समस्या (अधिक/कम पानी)',
      pest: 'कीड़े/कीटक का हमला',
      nutrient: 'पोषक तत्वों की कमी'
    },
    'en': {
      water: 'Water issue (too much/too little)',
      pest: 'Pest/insect attack',
      nutrient: 'Nutrient deficiency'
    }
  };
  
  const labels = checkLabels[language] || checkLabels['en'];
  
  const diagnoses: DiagnosisOption[] = [
    {
      id: 'unknown_water',
      cause: 'water_issue',
      cause_label: labels.water,
      canonical_group: 'stress',
      observation_key: 'WATER_STRESS_CHECK',
      observation_label: labels.water,
      confidence: 0.3,
      priority: 1,
      icon: '💧',
      rule_id: 'UNKNOWN_FALLBACK'
    },
    {
      id: 'unknown_pest',
      cause: 'pest_issue',
      cause_label: labels.pest,
      canonical_group: 'pest',
      observation_key: 'PEST_CHECK',
      observation_label: labels.pest,
      confidence: 0.3,
      priority: 2,
      icon: '🐛',
      rule_id: 'UNKNOWN_FALLBACK'
    },
    {
      id: 'unknown_nutrient',
      cause: 'nutrient_issue',
      cause_label: labels.nutrient,
      canonical_group: 'deficiency',
      observation_key: 'NUTRIENT_CHECK',
      observation_label: labels.nutrient,
      confidence: 0.3,
      priority: 3,
      icon: '🌿',
      rule_id: 'UNKNOWN_FALLBACK'
    }
  ];
  
  const photoLabels = PHOTO_LABELS[language] || PHOTO_LABELS['en'];
  const photoOption: PhotoOption = {
    id: 'PHOTO_UPLOAD',
    label: photoLabels.label,
    icon: '📷',
    description: photoLabels.description
  };
  
  return {
    mode: 'DIAGNOSIS_FIRST',
    source: 'DECISION_RULES',
    question_text: unknownMessages[language] || unknownMessages['en'],
    diagnoses,
    photo_option: photoOption,
    crop_code,
    growth_stage,
    total_hypotheses_considered: 0,
    timestamp: Date.now(),
    trace_id: traceIdFinal
  };
}

/**
 * Format DiagnosisFirstOutput for ClarificationOptionsUI.
 * Converts to the format expected by the frontend.
 */
export function formatForClarificationUI(
  output: DiagnosisFirstOutput
): {
  type: 'CLARIFICATION_QUESTION';
  orchestratorType: 'DIAGNOSTIC_CONFIRMATION';
  question: string;
  options: Array<{
    id: string;
    label: string;
    observation_key: string;
    rule_id: string;
    confidence_boost: number;
    icon?: string;
    cause?: string;
  }>;
  selectionType: 'single_choice';
  maxSelections: 1;
  metadata: {
    source: string;
    mode: string;
    crop_code: string;
    growth_stage: string;
  };
} {
  // Convert diagnoses to clarification options format
  const options = output.diagnoses.map(d => ({
    id: d.id,
    label: `${d.icon} ${d.cause_label} (${d.observation_label})`,
    observation_key: d.observation_key,
    rule_id: d.rule_id,
    confidence_boost: 0.20,  // Standard boost for confirmed diagnosis option
    icon: d.icon,
    cause: d.cause
  }));
  
  // Add photo option at end
  options.push({
    id: output.photo_option.id,
    label: output.photo_option.label,
    observation_key: 'PHOTO_UPLOAD',
    rule_id: 'PHOTO_FALLBACK',
    confidence_boost: 0.25,
    icon: output.photo_option.icon
  });
  
  return {
    type: 'CLARIFICATION_QUESTION',
    orchestratorType: 'DIAGNOSTIC_CONFIRMATION',
    question: output.question_text,
    options,
    selectionType: 'single_choice',
    maxSelections: 1,
    metadata: {
      source: output.source,
      mode: output.mode,
      crop_code: output.crop_code,
      growth_stage: output.growth_stage
    }
  };
}
