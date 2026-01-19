/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRONOMIC OBSERVATION VALIDATOR v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL BIOLOGICAL GATE between Phase-1 (Language) and Phase-2 (Symbolic Brain)
 * 
 * PURPOSE:
 * Validates farmer observations against crop-stage biological rules BEFORE
 * allowing them to become symbols in the canonical state.
 * 
 * PRINCIPLE: "Farmers describe symptoms, but biology dictates what's possible"
 * 
 * This validator:
 * 1. Accepts { crop, days_since_sowing, observation_candidate }
 * 2. Checks validity against crop-stage biological rules
 * 3. Returns one of: VALID, INVALID, or CORRECTED
 * 
 * If INVALID:
 *   - Do NOT create symbols
 *   - Do NOT lock stage
 *   - Return a clarification request
 * 
 * If CORRECTED:
 *   - Replace observation with nearest biologically valid one
 *   - Log a FARMER_MISCONCEPTION_CORRECTION event
 * 
 * NO LLM LOGIC IS ALLOWED IN THIS MODULE - Pure deterministic rules only.
 */

import { RawObservationCandidate, Phase1TranslationOutput } from '../agents/raw-observation-contract.ts';

export const AGRONOMIC_VALIDATOR_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationResult = 'VALID' | 'INVALID' | 'CORRECTED';

export interface AgronomicValidationInput {
  crop_code: string;
  days_since_sowing: number | null;
  growth_stage?: string;
  observation_candidate: RawObservationCandidate;
}

export interface AgronomicValidationOutput {
  result: ValidationResult;
  
  /** Original raw phrase */
  original_phrase: string;
  
  /** If CORRECTED, the nearest valid observation */
  corrected_observation?: string;
  
  /** Reason for validation result */
  reason: string;
  
  /** If INVALID, suggested clarification question */
  clarification_question?: string;
  
  /** Biological rule that was applied */
  rule_applied?: string;
  
  /** Logging event type */
  event_type: 'OBSERVATION_VALID' | 'OBSERVATION_INVALID' | 'FARMER_MISCONCEPTION_CORRECTION';
}

export interface BatchValidationOutput {
  valid_observations: string[];
  invalid_observations: string[];
  corrections: Array<{ from: string; to: string; reason: string }>;
  clarification_needed: boolean;
  clarification_question?: string;
  all_results: AgronomicValidationOutput[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-STAGE BIOLOGICAL RULES (Deterministic - No LLM)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Stage-specific observation validity rules
 * 
 * Format: CROP -> STAGE_RANGE -> ALLOWED_OBSERVATIONS
 * If an observation is not in allowed list, it's biologically unlikely
 */
const STAGE_OBSERVATION_RULES: Record<string, Record<string, string[]>> = {
  'SUGARCANE': {
    // Days 0-30: Germination/Seedling
    'GERMINATION': [
      'poor_germination', 'gaps', 'sett_rot', 'seedling_death', 'termite_damage',
      'soil_issues', 'water_stress', 'no_sprouting', 'patchy_growth'
    ],
    'SEEDLING': [
      'seedling_death', 'yellowing', 'wilting', 'termite', 'early_shoot_borer',
      'sett_rot', 'root_rot', 'gaps', 'stunted_growth', 'leaf_drying'
    ],
    // Days 30-90: Tillering/Vegetative
    'TILLERING': [
      'dead_heart', 'shoot_borer', 'yellowing', 'internode_borer', 'top_borer',
      'white_grub', 'leaf_spots', 'rust', 'stunted_growth', 'poor_tillering'
    ],
    'VEGETATIVE': [
      'shoot_borer', 'internode_borer', 'top_borer', 'yellowing', 'leaf_spots',
      'rust', 'smut', 'red_rot', 'wilt', 'lodging'
    ],
    // Days 90-180: Grand Growth
    'GRAND_GROWTH': [
      'internode_borer', 'top_borer', 'red_rot', 'smut', 'wilt', 
      'yellowing', 'lodging', 'water_stress', 'nutrient_deficiency'
    ],
    // Days 180+: Maturity
    'MATURITY': [
      'red_rot', 'smut', 'wilt', 'lodging', 'ratoon_stunting',
      'internode_borer', 'top_borer', 'poor_juice_quality'
    ]
  },
  
  'COTTON': {
    'GERMINATION': ['poor_germination', 'seedling_death', 'damping_off', 'soil_issues'],
    'SEEDLING': ['aphid', 'jassid', 'thrips', 'whitefly', 'seedling_death', 'wilting'],
    'VEGETATIVE': ['aphid', 'jassid', 'whitefly', 'bollworm', 'leaf_curl', 'yellowing'],
    'FLOWERING': ['bollworm', 'pink_bollworm', 'flower_drop', 'bud_rot'],
    'BOLL_FORMATION': ['bollworm', 'pink_bollworm', 'boll_rot', 'staining'],
    'MATURITY': ['boll_rot', 'staining', 'poor_opening']
  },
  
  'RICE': {
    'GERMINATION': ['poor_germination', 'seedling_death', 'blast', 'brown_spot'],
    'SEEDLING': ['blast', 'brown_spot', 'yellowing', 'stem_borer', 'leaf_folder'],
    'TILLERING': ['stem_borer', 'dead_heart', 'blast', 'sheath_blight', 'bph'],
    'BOOTING': ['stem_borer', 'white_ear', 'sheath_blight', 'false_smut'],
    'FLOWERING': ['white_ear', 'false_smut', 'grain_discoloration', 'neck_blast'],
    'MATURITY': ['grain_discoloration', 'lodging', 'sheath_rot']
  },
  
  'SOYBEAN': {
    'GERMINATION': ['poor_germination', 'seedling_death', 'collar_rot'],
    'VEGETATIVE': ['girdle_beetle', 'stem_fly', 'defoliators', 'yellowing'],
    'FLOWERING': ['pod_borer', 'leaf_eating', 'flower_drop', 'rust'],
    'MATURITY': ['pod_borer', 'pod_shattering', 'seed_damage']
  },
  
  'WHEAT': {
    'GERMINATION': ['poor_germination', 'seedling_death', 'loose_smut'],
    'TILLERING': ['aphid', 'yellowing', 'rust', 'powdery_mildew'],
    'BOOTING': ['rust', 'aphid', 'karnal_bunt', 'head_blight'],
    'HEADING': ['rust', 'karnal_bunt', 'aphid', 'ear_cockle'],
    'MATURITY': ['grain_shriveling', 'lodging', 'ear_cockle']
  }
};

/**
 * Days After Sowing (DAS) to Stage mapping
 */
const DAS_TO_STAGE: Record<string, Array<{ min: number; max: number; stage: string }>> = {
  'SUGARCANE': [
    { min: 0, max: 21, stage: 'GERMINATION' },
    { min: 22, max: 45, stage: 'SEEDLING' },
    { min: 46, max: 120, stage: 'TILLERING' },
    { min: 121, max: 180, stage: 'GRAND_GROWTH' },
    { min: 181, max: 365, stage: 'MATURITY' }
  ],
  'COTTON': [
    { min: 0, max: 15, stage: 'GERMINATION' },
    { min: 16, max: 45, stage: 'SEEDLING' },
    { min: 46, max: 75, stage: 'VEGETATIVE' },
    { min: 76, max: 100, stage: 'FLOWERING' },
    { min: 101, max: 140, stage: 'BOLL_FORMATION' },
    { min: 141, max: 180, stage: 'MATURITY' }
  ],
  'RICE': [
    { min: 0, max: 15, stage: 'GERMINATION' },
    { min: 16, max: 30, stage: 'SEEDLING' },
    { min: 31, max: 60, stage: 'TILLERING' },
    { min: 61, max: 80, stage: 'BOOTING' },
    { min: 81, max: 100, stage: 'FLOWERING' },
    { min: 101, max: 130, stage: 'MATURITY' }
  ],
  'SOYBEAN': [
    { min: 0, max: 10, stage: 'GERMINATION' },
    { min: 11, max: 45, stage: 'VEGETATIVE' },
    { min: 46, max: 80, stage: 'FLOWERING' },
    { min: 81, max: 120, stage: 'MATURITY' }
  ],
  'WHEAT': [
    { min: 0, max: 15, stage: 'GERMINATION' },
    { min: 16, max: 50, stage: 'TILLERING' },
    { min: 51, max: 80, stage: 'BOOTING' },
    { min: 81, max: 100, stage: 'HEADING' },
    { min: 101, max: 140, stage: 'MATURITY' }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION EXTRACTION FROM RAW PHRASES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pattern matching for common observation keywords (multilingual)
 */
const OBSERVATION_PATTERNS: Record<string, string[]> = {
  'dead_heart': ['मधली सुरळी', 'सुरळी वाळली', 'dead heart', 'गाभा सुकला', 'गोभ सूख'],
  'shoot_borer': ['खोड किडा', 'शूट बोरर', 'shoot borer', 'stem borer', 'तना छेदक'],
  'yellowing': ['पिवळे', 'पीला', 'yellow', 'पिवळी'],
  'wilting': ['वाळणे', 'मुरझाना', 'wilting', 'सुकणे', 'सूखना'],
  'seedling_death': ['रोप मेले', 'बिचडे मर गए', 'seedling died', 'मेले', 'मर गए'],
  'termite': ['वाळवी', 'दीमक', 'termite', 'white ant'],
  'gaps': ['गॅप', 'gaps', 'खाली जागा', 'रिक्त स्थान'],
  'sett_rot': ['बेणे कूज', 'बीज सड़न', 'sett rot', 'pineapple disease'],
  'root_rot': ['मुळ कूज', 'जड़ सड़न', 'root rot'],
  'internode_borer': ['इंटरनोड बोरर', 'internode borer', 'गांठ छेदक'],
  'top_borer': ['टॉप बोरर', 'top borer', 'शीर्ष छेदक'],
  'red_rot': ['तांबेरा', 'लाल सड़न', 'red rot'],
  'smut': ['काणी', 'कांगियारी', 'smut'],
  'aphid': ['मावा', 'माहू', 'aphid'],
  'whitefly': ['पांढरी माशी', 'सफेद मक्खी', 'whitefly'],
  'bollworm': ['बोंड अळी', 'बॉलवर्म', 'bollworm'],
  'blast': ['करपा', 'ब्लास्ट', 'blast'],
  'rust': ['तांबेरा', 'रतुआ', 'rust'],
  'lodging': ['झुकणे', 'लॉजिंग', 'lodging', 'गिरना']
};

/**
 * Extract observation keyword from raw phrase
 */
function extractObservationFromPhrase(phrase: string): string | null {
  const lower = phrase.toLowerCase();
  
  for (const [observation, patterns] of Object.entries(OBSERVATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return observation;
      }
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE DERIVATION FROM DAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get growth stage from DAS for a crop
 */
export function getStageFromDAS(crop: string, das: number): string {
  const cropUpper = crop.toUpperCase();
  const stageRanges = DAS_TO_STAGE[cropUpper];
  
  if (!stageRanges) {
    return 'UNKNOWN';
  }
  
  for (const range of stageRanges) {
    if (das >= range.min && das <= range.max) {
      return range.stage;
    }
  }
  
  // Default to last stage if DAS exceeds all ranges
  return stageRanges[stageRanges.length - 1]?.stage || 'UNKNOWN';
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE VALIDATION LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a single observation against crop-stage biology
 */
export function validateAgronomicObservation(
  input: AgronomicValidationInput
): AgronomicValidationOutput {
  const { crop_code, days_since_sowing, growth_stage, observation_candidate } = input;
  const cropUpper = crop_code.toUpperCase();
  
  // Extract the observation keyword from raw phrase
  const observation = extractObservationFromPhrase(observation_candidate.raw_phrase);
  
  // If we can't identify the observation, it's still valid (just unknown)
  if (!observation) {
    return {
      result: 'VALID',
      original_phrase: observation_candidate.raw_phrase,
      reason: 'Observation not recognized - allowing for manual interpretation',
      event_type: 'OBSERVATION_VALID'
    };
  }
  
  // Determine current stage
  let currentStage = growth_stage?.toUpperCase() || 'UNKNOWN';
  if (currentStage === 'UNKNOWN' && days_since_sowing !== null) {
    currentStage = getStageFromDAS(cropUpper, days_since_sowing);
  }
  
  // Get allowed observations for this crop/stage
  const cropRules = STAGE_OBSERVATION_RULES[cropUpper];
  if (!cropRules) {
    // Unknown crop - allow all observations
    return {
      result: 'VALID',
      original_phrase: observation_candidate.raw_phrase,
      reason: `Crop ${cropUpper} not in biological rules - allowing observation`,
      event_type: 'OBSERVATION_VALID'
    };
  }
  
  const allowedObservations = cropRules[currentStage];
  if (!allowedObservations) {
    // Unknown stage - allow all observations
    return {
      result: 'VALID',
      original_phrase: observation_candidate.raw_phrase,
      reason: `Stage ${currentStage} not in biological rules - allowing observation`,
      event_type: 'OBSERVATION_VALID'
    };
  }
  
  // Check if observation is allowed for this stage
  if (allowedObservations.includes(observation)) {
    return {
      result: 'VALID',
      original_phrase: observation_candidate.raw_phrase,
      reason: `${observation} is biologically valid for ${cropUpper}/${currentStage}`,
      rule_applied: `STAGE_RULE:${cropUpper}/${currentStage}`,
      event_type: 'OBSERVATION_VALID'
    };
  }
  
  // OBSERVATION IS BIOLOGICALLY UNLIKELY - Check for corrections
  const correction = findNearestValidObservation(observation, allowedObservations, currentStage, days_since_sowing);
  
  if (correction) {
    console.log(`🔄 [AgronomicValidator] FARMER_MISCONCEPTION_CORRECTION: ${observation} → ${correction.suggested}`);
    return {
      result: 'CORRECTED',
      original_phrase: observation_candidate.raw_phrase,
      corrected_observation: correction.suggested,
      reason: correction.reason,
      rule_applied: `CORRECTION_RULE:${cropUpper}/${currentStage}`,
      event_type: 'FARMER_MISCONCEPTION_CORRECTION'
    };
  }
  
  // No valid correction - INVALID observation
  console.log(`🚫 [AgronomicValidator] INVALID observation: ${observation} for ${cropUpper}/${currentStage} (DAS: ${days_since_sowing})`);
  return {
    result: 'INVALID',
    original_phrase: observation_candidate.raw_phrase,
    reason: `${observation} is biologically unlikely at ${currentStage} stage (DAS: ${days_since_sowing})`,
    clarification_question: generateClarificationQuestion(cropUpper, currentStage, observation, allowedObservations),
    rule_applied: `BIOLOGICAL_CONSTRAINT:${cropUpper}/${currentStage}`,
    event_type: 'OBSERVATION_INVALID'
  };
}

/**
 * Find the nearest biologically valid observation
 */
function findNearestValidObservation(
  observation: string,
  allowedObservations: string[],
  stage: string,
  das: number | null
): { suggested: string; reason: string } | null {
  // Common correction mappings
  const corrections: Record<string, Record<string, { to: string; reason: string }>> = {
    // Dead heart at germination is actually sett_rot or seedling_death
    'dead_heart': {
      'GERMINATION': { to: 'sett_rot', reason: 'Dead heart symptoms at germination stage indicate sett rot or seedling death, not borer damage' },
      'SEEDLING': { to: 'early_shoot_borer', reason: 'Early stage dead heart likely early shoot borer damage' }
    },
    // Internode borer at early stages is likely shoot_borer
    'internode_borer': {
      'GERMINATION': { to: 'seedling_death', reason: 'Internode borer does not attack germination stage' },
      'SEEDLING': { to: 'early_shoot_borer', reason: 'At seedling stage, likely early shoot borer not internode borer' },
      'TILLERING': { to: 'shoot_borer', reason: 'At tillering, likely shoot borer causing dead heart' }
    },
    // Top borer at early stages is incorrect
    'top_borer': {
      'GERMINATION': { to: 'seedling_death', reason: 'Top borer does not attack germination stage' },
      'SEEDLING': { to: 'early_shoot_borer', reason: 'Top borer appears later in crop cycle' }
    },
    // Red rot at early stages is incorrect
    'red_rot': {
      'GERMINATION': { to: 'sett_rot', reason: 'At germination, rotting is sett rot not red rot' },
      'SEEDLING': { to: 'sett_rot', reason: 'Red rot appears in mature canes, not seedlings' }
    },
    // Smut at early stages is seed-borne
    'smut': {
      'GERMINATION': { to: 'seedling_death', reason: 'Smut whip appears later, early symptoms are seed-borne infection' },
      'SEEDLING': { to: 'seedling_death', reason: 'Smut symptoms visible from tillering stage onwards' }
    }
  };
  
  const observationCorrections = corrections[observation];
  if (observationCorrections && observationCorrections[stage]) {
    const correction = observationCorrections[stage];
    if (allowedObservations.includes(correction.to)) {
      return correction;
    }
  }
  
  return null;
}

/**
 * Generate clarification question for invalid observation
 */
function generateClarificationQuestion(
  crop: string,
  stage: string,
  invalidObservation: string,
  allowedObservations: string[]
): string {
  // Get top 3 most likely observations for this stage
  const suggestions = allowedObservations.slice(0, 3);
  
  // Translate observation names to display names
  const displayNames: Record<string, Record<string, string>> = {
    mr: {
      'sett_rot': 'बेणे कूज',
      'seedling_death': 'रोप मृत्यू',
      'termite': 'वाळवी',
      'gaps': 'गॅप/रिकामी जागा',
      'yellowing': 'पिवळेपणा',
      'early_shoot_borer': 'सुरुवातीची खोड किडा',
      'shoot_borer': 'खोड किडा',
      'dead_heart': 'मेलेला गाभा',
      'wilting': 'मुरझवणे'
    },
    hi: {
      'sett_rot': 'बीज सड़न',
      'seedling_death': 'पौध मृत्यु',
      'termite': 'दीमक',
      'gaps': 'गैप/खाली जगह',
      'yellowing': 'पीलापन',
      'early_shoot_borer': 'प्रारंभिक तना छेदक',
      'shoot_borer': 'तना छेदक',
      'dead_heart': 'मृत गोभ',
      'wilting': 'मुरझाना'
    }
  };
  
  const mrSuggestions = suggestions.map(s => displayNames.mr[s] || s).join(', ');
  
  return `${crop} च्या ${stage} अवस्थेत ${invalidObservation} संभव नाही. कृपया खालीलपैकी निवडा: ${mrSuggestions}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate all observations from Phase1TranslationOutput
 */
export function validatePhase1Observations(
  phase1Output: Phase1TranslationOutput,
  cropCode: string,
  daysSinceSowing: number | null,
  growthStage?: string
): BatchValidationOutput {
  const allResults: AgronomicValidationOutput[] = [];
  const validObservations: string[] = [];
  const invalidObservations: string[] = [];
  const corrections: Array<{ from: string; to: string; reason: string }> = [];
  
  for (const candidate of phase1Output.observation_candidates) {
    const result = validateAgronomicObservation({
      crop_code: cropCode,
      days_since_sowing: daysSinceSowing,
      growth_stage: growthStage,
      observation_candidate: candidate
    });
    
    allResults.push(result);
    
    if (result.result === 'VALID') {
      validObservations.push(candidate.raw_phrase);
    } else if (result.result === 'CORRECTED') {
      corrections.push({
        from: candidate.raw_phrase,
        to: result.corrected_observation || '',
        reason: result.reason
      });
      validObservations.push(result.corrected_observation || candidate.raw_phrase);
    } else {
      invalidObservations.push(candidate.raw_phrase);
    }
  }
  
  const hasInvalid = invalidObservations.length > 0;
  const firstInvalidResult = allResults.find(r => r.result === 'INVALID');
  
  return {
    valid_observations: validObservations,
    invalid_observations: invalidObservations,
    corrections,
    clarification_needed: hasInvalid,
    clarification_question: firstInvalidResult?.clarification_question,
    all_results: allResults
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  AGRONOMIC_VALIDATOR_VERSION,
  validateAgronomicObservation,
  validatePhase1Observations,
  getStageFromDAS,
  extractObservationFromPhrase
};
