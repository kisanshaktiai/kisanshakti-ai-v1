/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLARIFICATION SCOPE RESOLVER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Constrain clarification questions to what is ALREADY OBSERVED, not suspected.
 * Prevent diagnosis leakage before rule engine fires.
 * 
 * RULES:
 * - Clarification scope is determined by raw observations, NOT suspected causes
 * - DO NOT use pest/disease symptom lists unless diagnosis rules fired
 * - Options must refine the SAME observation category
 * - If scope is OBSERVATION_REFINEMENT → ask about what they described
 * - If scope is LOCATION_DISTRIBUTION → ask where symptom appears
 * - If scope is ESCALATION_ONLY → request photo only
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { ObservationExtraction } from './observation-extractor.ts';
import type { UnderstandingCheckResult } from './understanding-completeness-checker.ts';

export const CLARIFICATION_SCOPE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION SCOPE ENUM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Defines what KIND of clarification is appropriate given current observations.
 * This prevents asking crop-specific diagnosis questions before diagnosis rules fire.
 */
export enum ClarificationScope {
  /**
   * Refine the observation the farmer already made.
   * Ask about the same symptom but with more detail.
   * E.g., "You said leaves are yellowing - is it the whole leaf or just edges?"
   */
  OBSERVATION_REFINEMENT = 'OBSERVATION_REFINEMENT',
  
  /**
   * We don't know what crop is affected.
   * Ask only about crop identification, nothing else.
   */
  CROP_IDENTIFICATION = 'CROP_IDENTIFICATION',
  
  /**
   * We need to know WHERE on plant/field the symptom appears.
   * Ask about distribution (uniform, patchy, border) or affected part.
   */
  LOCATION_DISTRIBUTION = 'LOCATION_DISTRIBUTION',
  
  /**
   * We need to know HOW SEVERE and WHEN it started.
   * Ask about severity and timing only.
   */
  SEVERITY_TIMING = 'SEVERITY_TIMING',
  
  /**
   * Too little information to form any meaningful question.
   * Request photo only - no symptom options.
   */
  ESCALATION_ONLY = 'ESCALATION_ONLY'
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE RESOLUTION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationScopeResult {
  /**
   * The determined scope for clarification
   */
  scope: ClarificationScope;
  
  /**
   * Why this scope was chosen
   */
  scope_reason: string;
  
  /**
   * What category of options is allowed
   */
  allowed_option_categories: string[];
  
  /**
   * Whether photo request is appropriate
   */
  photo_appropriate: boolean;
  
  /**
   * The original observation to refine (if OBSERVATION_REFINEMENT)
   */
  observation_to_refine?: string;
  
  /**
   * Forbidden option categories (diagnosis-related)
   */
  forbidden_option_categories: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE-BASED CLARIFICATION OPTIONS (OBSERVATION-ONLY, NO DIAGNOSIS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options that ask about OBSERVATIONS only - no pest/disease names.
 * These are safe to show before any diagnosis rules fire.
 */
export const OBSERVATION_ONLY_OPTIONS: Record<string, Record<string, string[]>> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CROP IDENTIFICATION (when crop is unknown)
  // ═══════════════════════════════════════════════════════════════════════════
  crop_identification: {
    mr: [
      'ऊस (गन्ना)',
      'कापूस',
      'सोयाबीन',
      'तूर / हरभरा'
    ],
    hi: [
      'गन्ना',
      'कपास',
      'सोयाबीन',
      'अरहर / चना'
    ],
    en: [
      'Sugarcane',
      'Cotton',
      'Soybean',
      'Pulses'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AFFECTED PART (when part is unknown)
  // ═══════════════════════════════════════════════════════════════════════════
  affected_part: {
    mr: [
      'पान (पाने)',
      'खोड / देठ',
      'मूळ / मुळे',
      'फळ / बोंड / शेंग'
    ],
    hi: [
      'पत्ते',
      'तना / डंठल',
      'जड़ें',
      'फल / बॉल / फली'
    ],
    en: [
      'Leaves',
      'Stem / Stalk',
      'Roots',
      'Fruit / Boll / Pod'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SYMPTOM DISTRIBUTION (when distribution is unknown)
  // ═══════════════════════════════════════════════════════════════════════════
  symptom_distribution: {
    mr: [
      'सगळीकडे सारखे (uniform)',
      'ठिकठिकाणी वेगवेगळे (patchy)',
      'शेताच्या कडेवर जास्त',
      'मध्यभागी जास्त'
    ],
    hi: [
      'हर जगह एक जैसा (uniform)',
      'जगह-जगह अलग-अलग (patchy)',
      'खेत के किनारों पर ज्यादा',
      'बीच में ज्यादा'
    ],
    en: [
      'Uniform throughout field',
      'Patchy / scattered',
      'More on field borders',
      'More in center of field'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEVERITY LEVEL (when severity is unknown)
  // ═══════════════════════════════════════════════════════════════════════════
  severity_level: {
    mr: [
      'थोडे (काही झाडे फक्त)',
      'मध्यम (अर्धे शेत)',
      'जास्त (बहुतेक शेत)',
      'अति गंभीर (सगळीकडे)'
    ],
    hi: [
      'थोड़ा (कुछ पौधों पर)',
      'मध्यम (आधे खेत में)',
      'ज्यादा (अधिकतर खेत में)',
      'बहुत गंभीर (पूरे खेत में)'
    ],
    en: [
      'Light (only some plants)',
      'Moderate (half the field)',
      'Heavy (most of field)',
      'Severe (entire field)'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIMING (when timing is unknown)
  // ═══════════════════════════════════════════════════════════════════════════
  timing_started: {
    mr: [
      'आज / काल (1-2 दिवस)',
      'या आठवड्यात (3-7 दिवस)',
      'गेल्या आठवड्यापासून',
      'खूप दिवसांपासून (2+ आठवडे)'
    ],
    hi: [
      'आज / कल (1-2 दिन)',
      'इस हफ्ते (3-7 दिन)',
      'पिछले हफ्ते से',
      'बहुत दिनों से (2+ हफ्ते)'
    ],
    en: [
      'Today / Yesterday (1-2 days)',
      'This week (3-7 days)',
      'Since last week',
      'Long time (2+ weeks)'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VISUAL SYMPTOM REFINEMENT - GENERAL (when farmer described a symptom)
  // These are OBSERVATION descriptions, NOT diagnosis
  // ═══════════════════════════════════════════════════════════════════════════
  refine_yellowing: {
    mr: [
      'पूर्ण पान पिवळे',
      'फक्त कडा पिवळ्या',
      'शिरांमध्ये पिवळे (नसांसोबत)',
      'ठिपके ठिपके पिवळे'
    ],
    hi: [
      'पूरा पत्ता पीला',
      'सिर्फ किनारे पीले',
      'नसों में पीला (नसों के साथ)',
      'छोटे-छोटे पीले धब्बे'
    ],
    en: [
      'Entire leaf yellow',
      'Only edges yellow',
      'Yellow along veins',
      'Small yellow spots'
    ]
  },
  
  refine_drying: {
    mr: [
      'टोकापासून वाळते',
      'मध्यभागी वाळते',
      'मुळापासून वाळते',
      'एका बाजूने वाळते'
    ],
    hi: [
      'सिरे से सूख रहा',
      'बीच से सूख रहा',
      'जड़ से सूख रहा',
      'एक तरफ से सूख रहा'
    ],
    en: [
      'Drying from tip',
      'Drying from center',
      'Drying from base/root',
      'Drying on one side'
    ]
  },
  
  refine_spots: {
    mr: [
      'गोल डाग',
      'लांबट पट्टे',
      'अनियमित आकार',
      'डाग एकत्र पसरत आहेत'
    ],
    hi: [
      'गोल धब्बे',
      'लंबे पट्टे',
      'अनियमित आकार',
      'धब्बे फैल रहे हैं'
    ],
    en: [
      'Round spots',
      'Long stripes',
      'Irregular shape',
      'Spots spreading/merging'
    ]
  },
  
  refine_holes: {
    mr: [
      'लहान छिद्रे (पिनहोल)',
      'मोठी छिद्रे',
      'कडा खाल्लेल्या (ragged)',
      'पूर्ण भाग कापलेला'
    ],
    hi: [
      'छोटे छेद (पिनहोल)',
      'बड़े छेद',
      'किनारे कटे हुए (ragged)',
      'पूरा हिस्सा कटा हुआ'
    ],
    en: [
      'Small holes (pinhole)',
      'Large holes',
      'Ragged edges (chewed)',
      'Entire section cut'
    ]
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECT BEHAVIOR (for observation refinement when farmer mentioned insects)
  // ═══════════════════════════════════════════════════════════════════════════
  insect_behavior: {
    mr: [
      'उडतात हालवल्यावर',
      'पानाखाली लपतात',
      'खोडात आत जातात',
      'रात्री दिसतात'
    ],
    hi: [
      'हिलाने पर उड़ जाते हैं',
      'पत्ते के नीचे छिपे रहते हैं',
      'तने के अंदर जाते हैं',
      'रात को दिखते हैं'
    ],
    en: [
      'Fly away when disturbed',
      'Hide under leaves',
      'Bore into stem',
      'Visible at night'
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// FORBIDDEN CATEGORIES (require diagnosis rules to have fired)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * These option categories contain pest/disease names.
 * They are FORBIDDEN unless diagnosis rules have fired.
 */
export const DIAGNOSIS_CATEGORIES = [
  'sugarcane_borer',
  'sugarcane_disease',
  'cotton_bollworm',
  'cotton_sucking_pest',
  'cotton_disease',
  'wheat_rust',
  'wheat_pest',
  'rice_blast',
  'rice_borer',
  'rice_hopper',
  'soybean_caterpillar',
  'soybean_disease'
];

// ═══════════════════════════════════════════════════════════════════════════
// SCOPE RESOLUTION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine the appropriate clarification scope based on current observations.
 * This is PURELY SYMBOLIC - no AI inference.
 */
export function resolveClarificationScope(
  observations: ObservationExtraction,
  understandingResult: UnderstandingCheckResult,
  hasLandContext: boolean,
  diagnosisRulesFired: boolean = false
): ClarificationScopeResult {
  const unknownFields = understandingResult.unknown_critical_fields;
  const symptomCount = observations.raw_symptom_text.length;
  const hasSymptoms = symptomCount > 0 && observations.raw_symptom_text[0].length > 5;
  const hasCrop = !!observations.crop_mentioned || hasLandContext;
  const hasAffectedPart = observations.affected_part !== 'unknown';
  const hasDistribution = observations.symptom_distribution !== 'unknown';
  const hasSeverity = observations.severity_words.length > 0;
  const hasTiming = !!observations.time_reference;
  
  // Always forbid diagnosis categories unless rules have fired
  const forbiddenCategories = diagnosisRulesFired ? [] : DIAGNOSIS_CATEGORIES;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 1: Crop Unknown - Must identify crop first
  // ═══════════════════════════════════════════════════════════════════════════
  if (!hasCrop) {
    return {
      scope: ClarificationScope.CROP_IDENTIFICATION,
      scope_reason: 'Crop not identified - need to know which crop before any diagnosis',
      allowed_option_categories: ['crop_identification'],
      photo_appropriate: false,
      forbidden_option_categories: forbiddenCategories
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 2: No symptoms at all - Request photo
  // ═══════════════════════════════════════════════════════════════════════════
  if (!hasSymptoms) {
    return {
      scope: ClarificationScope.ESCALATION_ONLY,
      scope_reason: 'No symptoms described - photo required to proceed',
      allowed_option_categories: [],
      photo_appropriate: true,
      forbidden_option_categories: forbiddenCategories
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 3: Have symptom but missing location/part - Ask location
  // ═══════════════════════════════════════════════════════════════════════════
  if (!hasAffectedPart || !hasDistribution) {
    const allowedCategories: string[] = [];
    if (!hasAffectedPart) allowedCategories.push('affected_part');
    if (!hasDistribution) allowedCategories.push('symptom_distribution');
    
    return {
      scope: ClarificationScope.LOCATION_DISTRIBUTION,
      scope_reason: `Missing: ${!hasAffectedPart ? 'which part affected' : ''} ${!hasDistribution ? 'how distributed' : ''}`.trim(),
      allowed_option_categories: allowedCategories,
      photo_appropriate: true,
      forbidden_option_categories: forbiddenCategories
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 4: Have location but missing severity/timing - Ask severity
  // ═══════════════════════════════════════════════════════════════════════════
  if (!hasSeverity || !hasTiming) {
    const allowedCategories: string[] = [];
    if (!hasSeverity) allowedCategories.push('severity_level');
    if (!hasTiming) allowedCategories.push('timing_started');
    
    return {
      scope: ClarificationScope.SEVERITY_TIMING,
      scope_reason: `Missing: ${!hasSeverity ? 'severity level' : ''} ${!hasTiming ? 'when started' : ''}`.trim(),
      allowed_option_categories: allowedCategories,
      photo_appropriate: false,
      forbidden_option_categories: forbiddenCategories
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 5: Have basic info but symptom needs refinement
  // ═══════════════════════════════════════════════════════════════════════════
  const symptomText = observations.raw_symptom_text.join(' ').toLowerCase();
  let refinementCategory = 'affected_part'; // fallback
  
  // Detect what kind of symptom to refine
  if (symptomText.includes('पिवळ') || symptomText.includes('पीला') || symptomText.includes('yellow')) {
    refinementCategory = 'refine_yellowing';
  } else if (symptomText.includes('वाळ') || symptomText.includes('सूख') || symptomText.includes('dry') || symptomText.includes('wilt')) {
    refinementCategory = 'refine_drying';
  } else if (symptomText.includes('डाग') || symptomText.includes('धब्ब') || symptomText.includes('spot')) {
    refinementCategory = 'refine_spots';
  } else if (symptomText.includes('छिद्र') || symptomText.includes('छेद') || symptomText.includes('hole') || symptomText.includes('खाल्ल')) {
    refinementCategory = 'refine_holes';
  } else if (symptomText.includes('किड') || symptomText.includes('कीड') || symptomText.includes('insect') || symptomText.includes('bug')) {
    refinementCategory = 'insect_behavior';
  }
  
  return {
    scope: ClarificationScope.OBSERVATION_REFINEMENT,
    scope_reason: `Refining symptom: "${symptomText.substring(0, 50)}..."`,
    allowed_option_categories: [refinementCategory],
    photo_appropriate: true,
    observation_to_refine: symptomText.substring(0, 100),
    forbidden_option_categories: forbiddenCategories
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION: Check for diagnosis leakage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that clarification options do not leak diagnosis before rules fire.
 * Returns validation result with any violations found.
 */
export function validateClarificationNoLeakage(
  options: string[],
  diagnosisRulesFired: boolean
): { valid: boolean; violations: string[] } {
  if (diagnosisRulesFired) {
    // If diagnosis rules fired, any options are allowed
    return { valid: true, violations: [] };
  }
  
  const violations: string[] = [];
  
  // Check for pest/disease names in options
  const diagnosisPatterns = [
    // Pest names
    /बोरर|borer|छेदक/i,
    /बोंड\s*अळी|bollworm|बॉल\s*वर्म/i,
    /मावा|माहू|aphid/i,
    /तुडतुड|फुदक|hopper|jassid/i,
    /अळी.*खाणार|caterpillar|spodoptera/i,
    /पांढरी\s*माशी|सफेद\s*मक्खी|whitefly/i,
    /स्पोडोप्टेरा|चक्री\s*भुंग|girdle\s*beetle/i,
    
    // Disease names  
    /तांबेरा|रतुआ|rust/i,
    /करपा|ब्लास्ट|blast/i,
    /कुज|सड़न|rot(?!ting|ted)/i,
    /झुलसा|blight/i,
    
    // Nutrient deficiency diagnosis
    /नत्र.*कमतरता|नाइट्रोजन.*कमी|nitrogen\s*deficiency/i,
    /स्फुरद.*कमतरता|फास्फोरस.*कमी|phosphorus\s*deficiency/i
  ];
  
  for (const option of options) {
    for (const pattern of diagnosisPatterns) {
      if (pattern.test(option)) {
        violations.push(`Diagnosis leakage: "${option.substring(0, 50)}..." matches pattern ${pattern.source}`);
        break;
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Get scope-appropriate clarification options.
 * Only returns options that are valid for the given scope.
 */
export function getScopedClarificationOptions(
  scopeResult: ClarificationScopeResult,
  language: 'mr' | 'hi' | 'en'
): string[] {
  const options: string[] = [];
  
  for (const category of scopeResult.allowed_option_categories) {
    const categoryOptions = OBSERVATION_ONLY_OPTIONS[category];
    if (categoryOptions && categoryOptions[language]) {
      options.push(...categoryOptions[language].slice(0, 3));
    }
  }
  
  // Limit to 3 options max
  return options.slice(0, 3);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  ClarificationScope,
  resolveClarificationScope,
  validateClarificationNoLeakage,
  getScopedClarificationOptions,
  OBSERVATION_ONLY_OPTIONS,
  DIAGNOSIS_CATEGORIES,
  CLARIFICATION_SCOPE_VERSION
};
