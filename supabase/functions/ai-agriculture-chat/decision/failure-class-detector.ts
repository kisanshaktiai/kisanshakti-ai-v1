/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAILURE CLASS DETECTOR - CANONICAL SYMBOL VERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Determine primary failure class before generating clarification options.
 * Uses ONLY canonical ObservationKeys - NO hardcoded language strings.
 * 
 * REFACTORED: Phase-1 SSOT Compliance
 * - Removed all hardcoded Marathi/Hindi/English keyword arrays
 * - Now operates exclusively on pre-extracted canonical symbols
 * - Language-agnostic logic for production readiness
 * 
 * FAILURE CLASSES:
 * - ESTABLISHMENT_FAILURE: Plant death, gaps, poor emergence
 * - VEGETATIVE_STRESS: Growth issues during vegetative stage
 * - PEST_DAMAGE: Visible insect/pest activity
 * - DISEASE_SYMPTOM: Fungal, bacterial, viral symptoms
 * - NUTRIENT_DEFICIENCY: Nutrient-related visual symptoms
 * 
 * RULES:
 * 1. Derive failure class from canonical observations only
 * 2. No language-dependent logic - pure canonical symbol matching
 * 3. Used to scope clarification domain
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const FAILURE_CLASS_VERSION = '2.0.0'; // SSOT-compliant version

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type FailureClass = 
  | 'ESTABLISHMENT_FAILURE'
  | 'VEGETATIVE_STRESS'
  | 'PEST_DAMAGE'
  | 'DISEASE_SYMPTOM'
  | 'NUTRIENT_DEFICIENCY'
  | 'WEED_COMPETITION'
  | 'UNKNOWN';

/**
 * SSOT-COMPLIANT INPUT
 * Uses pre-extracted canonical observation codes, NOT raw user text
 */
export interface FailureClassInput {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  /** Canonical observation codes from LLM/induction extraction */
  observations: string[];
  /** Pre-extracted symptoms from language induction layer */
  symptoms: string[];
  symptom_scope: 'WHOLE_PLANT' | 'PART' | 'UNKNOWN';
  /** Intent code from intent classifier */
  detected_intent: string;
}

export interface FailureClassResult {
  primary_class: FailureClass;
  confidence: number;
  matched_observations: string[];
  reasoning: string;
  stage_compatible: boolean;
  derived_from: 'STAGE' | 'OBSERVATIONS' | 'SYMPTOMS' | 'INTENT' | 'DEFAULT';
}

export interface FailureClassAuditLog {
  trace_id: string;
  timestamp: number;
  input: FailureClassInput;
  result: FailureClassResult;
  clarification_domain: string;
  fallback_used: boolean;
  fallback_reason: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL OBSERVATION SETS FOR FAILURE CLASS DETECTION
// These are language-agnostic observation codes from observation_master
// ═══════════════════════════════════════════════════════════════════════════

const ESTABLISHMENT_OBSERVATIONS = new Set([
  'PLANT_DEATH',
  'SEEDLING_DEATH',
  'GERMINATION_FAILURE',
  'GAPS_IN_FIELD',
  'SETT_ROT',
  'SEED_ROT',
  'BUD_NOT_SPROUTING',
  'POOR_EMERGENCE',
  'EMPTY_SPOTS',
  'MISSING_PLANTS',
  'ROOT_ROT',
  'DAMPING_OFF',
  'WILT_TERMINAL'
]);

const PEST_OBSERVATIONS = new Set([
  'INSECT_PRESENT',
  'INSECT_VISIBLE',
  'PEST_DAMAGE',
  'CATERPILLAR_VISIBLE',
  'LARVAE_VISIBLE',
  'BORER_SUSPECTED',
  'APHIDS_PRESENT',
  'WHITEFLY_PRESENT',
  'MEALYBUG_PRESENT',
  'JASSID_PRESENT',
  'THRIPS_PRESENT',
  'MITE_PRESENT',
  'TERMITE_SUSPECTED',
  'GRUB_PRESENT',
  'HOLES_VISIBLE',
  'CHEWING_DAMAGE',
  'DEAD_HEART',
  'DEAD_HEART_PRESENT',
  'STEM_BORING_MARKS',
  'FRASS_VISIBLE'
]);

const DISEASE_OBSERVATIONS = new Set([
  'LEAF_SPOTS',
  'LEAF_BLIGHT',
  'STEM_ROT',
  'FUNGAL_GROWTH',
  'POWDERY_MILDEW',
  'DOWNY_MILDEW',
  'RUST_PRESENT',
  'SMUT_PRESENT',
  'WILT_DISEASE',
  'BACTERIAL_OOZE',
  'LESIONS_VISIBLE',
  'NECROSIS_VISIBLE',
  'CANKER_PRESENT',
  'SCAB_PRESENT',
  'MOSAIC_PATTERN',
  'VIRAL_SYMPTOMS',
  'BLACK_SPOTS',
  'RED_SPOTS',
  'WHITE_POWDERY_GROWTH'
]);

const NUTRIENT_OBSERVATIONS = new Set([
  'LEAF_YELLOWING',
  'CHLOROSIS',
  'INTERVEINAL_YELLOWING',
  'PURPLE_LEAVES',
  'RED_LEAVES',
  'PALE_GREEN',
  'TIP_BURN',
  'MARGINAL_BURN',
  'STUNTED_GROWTH',
  'STUNTED_PLANTS',
  'POOR_TILLERING',
  'NUTRIENT_DEFICIENCY'
]);

const WEED_OBSERVATIONS = new Set([
  'WEED_PRESENT',
  'WEED_HEAVY',
  'WEED_ABOVE_CROP',
  'WEED_IN_ROWS',
  'WEED_INFESTATION',
  'GRASS_WEEDS',
  'BROADLEAF_WEEDS'
]);

const VEGETATIVE_STRESS_OBSERVATIONS = new Set([
  'WILTING',
  'DROOPING',
  'SLOW_GROWTH',
  'WEAK_STEMS',
  'SMALL_LEAVES',
  'THIN_STEMS',
  'WATER_STRESS',
  'HEAT_STRESS',
  'WATERLOGGING',
  'DRYING',
  'LEAF_DRYING',
  'LEAF_CURLING'
]);

// ═══════════════════════════════════════════════════════════════════════════
// STAGE-BASED FAILURE CLASS MAPPING
// Early stages → ESTABLISHMENT_FAILURE priority
// ═══════════════════════════════════════════════════════════════════════════

const EARLY_STAGES = new Set([
  'GERMINATION', 'ESTABLISHMENT', 'SEEDLING', 'NURSERY', 'TRANSPLANTING',
  'EMERGENCE', 'BUD_SPROUTING', 'PLANTING', 'SPROUTING',
  'germination', 'establishment', 'seedling', 'nursery', 'transplanting',
  'emergence', 'bud_sprouting', 'planting', 'sprouting'
]);

const VEGETATIVE_STAGES = new Set([
  'VEGETATIVE', 'TILLERING', 'GRAND_GROWTH', 'EARLY_VEGETATIVE',
  'ACTIVE_VEGETATIVE', 'ROSETTE', 'LEAF_DEVELOPMENT',
  'vegetative', 'tillering', 'grand_growth', 'early_vegetative',
  'active_vegetative', 'rosette', 'leaf_development'
]);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION: Match observations against a canonical set
// ═══════════════════════════════════════════════════════════════════════════

function countMatches(observations: string[], targetSet: Set<string>): string[] {
  const matched: string[] = [];
  
  for (const obs of observations) {
    const upperObs = obs.toUpperCase().replace(/-/g, '_');
    if (targetSet.has(upperObs) || targetSet.has(obs)) {
      matched.push(upperObs);
    }
  }
  
  return matched;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE DETECTION FUNCTION - SSOT COMPLIANT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect primary failure class from canonical observations.
 * NO language-dependent logic - pure canonical symbol matching.
 */
export function detectPrimaryFailureClass(input: FailureClassInput): FailureClassResult {
  const { crop_code, growth_stage, days_since_sowing, observations, symptoms, symptom_scope } = input;

  // Defensive normalization (prevents response-generation failures if upstream omits fields)
  const safeObservations = Array.isArray(observations) ? observations : [];
  const safeSymptoms = Array.isArray(symptoms) ? symptoms : [];
  const safeScope: FailureClassInput['symptom_scope'] = symptom_scope || 'UNKNOWN';

  const normalizedStage = (growth_stage || 'UNKNOWN').toUpperCase();

  // Combine observations and symptoms for matching
  const allObservations = [...safeObservations, ...safeSymptoms];

  console.log(`🔍 [FailureClass v${FAILURE_CLASS_VERSION}] Detecting for ${crop_code}/${normalizedStage}, DAS: ${days_since_sowing}`);
  console.log(`   Observations: [${allObservations.slice(0, 5).join(', ')}${allObservations.length > 5 ? '...' : ''}]`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Check for ESTABLISHMENT_FAILURE signals
  // Priority if: early stage + whole plant symptoms + death/gap observations
  // ═══════════════════════════════════════════════════════════════════════════

  const isEarlyStage = EARLY_STAGES.has(normalizedStage) || EARLY_STAGES.has(growth_stage);
  const isVeryEarlyDAS = days_since_sowing !== null && days_since_sowing <= 30;
  const isWholePlant = safeScope === 'WHOLE_PLANT';

  const establishmentMatches = countMatches(allObservations, ESTABLISHMENT_OBSERVATIONS);
  
  // ESTABLISHMENT_FAILURE priority conditions
  if ((isEarlyStage || isVeryEarlyDAS) && 
      (establishmentMatches.length > 0 || isWholePlant)) {
    console.log(`   ✅ ESTABLISHMENT_FAILURE detected (early stage + ${establishmentMatches.length} observations)`);
    return {
      primary_class: 'ESTABLISHMENT_FAILURE',
      confidence: 0.85 + (establishmentMatches.length * 0.05),
      matched_observations: establishmentMatches,
      reasoning: `Early stage (${normalizedStage}, DAS: ${days_since_sowing}) with establishment failure observations`,
      stage_compatible: true,
      derived_from: establishmentMatches.length > 0 ? 'OBSERVATIONS' : 'STAGE'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2a: Check WEED_COMPETITION signals (before pest to prevent misrouting)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const weedMatches = countMatches(allObservations, WEED_OBSERVATIONS);
  
  if (weedMatches.length > 0) {
    console.log(`   ✅ WEED_COMPETITION detected (${weedMatches.length} observations)`);
    return {
      primary_class: 'WEED_COMPETITION',
      confidence: 0.82 + (weedMatches.length * 0.04),
      matched_observations: weedMatches,
      reasoning: `Weed competition observations detected: ${weedMatches.slice(0, 3).join(', ')}`,
      stage_compatible: true,
      derived_from: 'OBSERVATIONS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2b: Check PEST_DAMAGE signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const pestMatches = countMatches(allObservations, PEST_OBSERVATIONS);
  
  if (pestMatches.length > 0) {
    console.log(`   ✅ PEST_DAMAGE detected (${pestMatches.length} observations)`);
    return {
      primary_class: 'PEST_DAMAGE',
      confidence: 0.80 + (pestMatches.length * 0.04),
      matched_observations: pestMatches,
      reasoning: `Pest/insect observations detected: ${pestMatches.slice(0, 3).join(', ')}`,
      stage_compatible: true,
      derived_from: 'OBSERVATIONS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Check DISEASE_SYMPTOM signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const diseaseMatches = countMatches(allObservations, DISEASE_OBSERVATIONS);
  
  if (diseaseMatches.length > 0) {
    console.log(`   ✅ DISEASE_SYMPTOM detected (${diseaseMatches.length} observations)`);
    return {
      primary_class: 'DISEASE_SYMPTOM',
      confidence: 0.78 + (diseaseMatches.length * 0.04),
      matched_observations: diseaseMatches,
      reasoning: `Disease observations detected: ${diseaseMatches.slice(0, 3).join(', ')}`,
      stage_compatible: true,
      derived_from: 'OBSERVATIONS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Check NUTRIENT_DEFICIENCY signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const nutrientMatches = countMatches(allObservations, NUTRIENT_OBSERVATIONS);
  
  if (nutrientMatches.length > 0) {
    console.log(`   ✅ NUTRIENT_DEFICIENCY detected (${nutrientMatches.length} observations)`);
    return {
      primary_class: 'NUTRIENT_DEFICIENCY',
      confidence: 0.75 + (nutrientMatches.length * 0.04),
      matched_observations: nutrientMatches,
      reasoning: `Nutrient deficiency observations detected: ${nutrientMatches.slice(0, 3).join(', ')}`,
      stage_compatible: true,
      derived_from: 'OBSERVATIONS'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Check VEGETATIVE_STRESS signals
  // ═══════════════════════════════════════════════════════════════════════════
  
  const stressMatches = countMatches(allObservations, VEGETATIVE_STRESS_OBSERVATIONS);
  const isVegetativeStage = VEGETATIVE_STAGES.has(normalizedStage) || VEGETATIVE_STAGES.has(growth_stage);
  
  if (stressMatches.length > 0 || isVegetativeStage) {
    console.log(`   ✅ VEGETATIVE_STRESS detected (${stressMatches.length} observations, vegetative: ${isVegetativeStage})`);
    return {
      primary_class: 'VEGETATIVE_STRESS',
      confidence: 0.70 + (stressMatches.length * 0.05),
      matched_observations: stressMatches,
      reasoning: isVegetativeStage 
        ? `Vegetative stage (${normalizedStage}) with stress observations`
        : `Stress observations detected: ${stressMatches.slice(0, 3).join(', ')}`,
      stage_compatible: true,
      derived_from: stressMatches.length > 0 ? 'OBSERVATIONS' : 'STAGE'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT: Cannot determine specific class
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`   ⚠️ Could not determine specific failure class - using UNKNOWN`);
  return {
    primary_class: 'UNKNOWN',
    confidence: 0.40,
    matched_observations: [],
    reasoning: 'No specific failure class indicators found in canonical observations',
    stage_compatible: true,
    derived_from: 'DEFAULT'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION DOMAIN MAPPING
// Maps failure class to appropriate clarification domain
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationDomain {
  name: string;
  allowed_symptom_scopes: ('WHOLE_PLANT' | 'STEM' | 'LEAF' | 'ROOT' | 'FRUIT')[];
  canonical_groups: string[];
  excluded_observations: string[];
}

const CLARIFICATION_DOMAINS: Record<FailureClass, ClarificationDomain> = {
  ESTABLISHMENT_FAILURE: {
    name: 'ESTABLISHMENT',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'ROOT', 'STEM'],
    canonical_groups: ['establishment', 'germination', 'root'],
    excluded_observations: ['LEAF_CURL', 'FRUIT_DROP']
  },
  VEGETATIVE_STRESS: {
    name: 'VEGETATIVE',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM'],
    canonical_groups: ['stress', 'vegetative', 'growth'],
    excluded_observations: ['FLOWER_DROP', 'FRUIT_ROT']
  },
  PEST_DAMAGE: {
    name: 'PEST',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM', 'ROOT', 'FRUIT'],
    canonical_groups: ['pest', 'insect', 'damage'],
    excluded_observations: []
  },
  DISEASE_SYMPTOM: {
    name: 'DISEASE',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM', 'ROOT', 'FRUIT'],
    canonical_groups: ['disease', 'fungal', 'bacterial', 'viral'],
    excluded_observations: []
  },
  NUTRIENT_DEFICIENCY: {
    name: 'NUTRIENT',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF'],
    canonical_groups: ['nutrient', 'deficiency'],
    excluded_observations: ['INSECT_HOLES', 'PEST_FRASS']
  },
  WEED_COMPETITION: {
    name: 'WEED',
    allowed_symptom_scopes: ['WHOLE_PLANT'],
    canonical_groups: ['weed', '06_weed'],
    excluded_observations: ['DEAD_HEART', 'INSECT_VISIBLE']
  },
  UNKNOWN: {
    name: 'GENERAL',
    allowed_symptom_scopes: ['WHOLE_PLANT', 'LEAF', 'STEM', 'ROOT', 'FRUIT'],
    canonical_groups: ['general'],
    excluded_observations: []
  }
};

/**
 * Get clarification domain for a failure class
 */
export function getClarificationDomain(failureClass: FailureClass): ClarificationDomain {
  return CLARIFICATION_DOMAINS[failureClass] || CLARIFICATION_DOMAINS.UNKNOWN;
}

/**
 * Get failure class confidence thresholds
 */
export function getFailureClassThresholds(): Record<FailureClass, number> {
  return {
    ESTABLISHMENT_FAILURE: 0.80,
    WEED_COMPETITION: 0.78,
    PEST_DAMAGE: 0.75,
    DISEASE_SYMPTOM: 0.70,
    NUTRIENT_DEFICIENCY: 0.65,
    VEGETATIVE_STRESS: 0.60,
    UNKNOWN: 0.40
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGE COMPATIBILITY CHECK - CANONICAL VERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an observation is stage-compatible.
 * Uses canonical stage names - no language dependency.
 */
export function isObservationStageCompatible(
  observationKey: string,
  stage: string
): boolean {
  if (!observationKey || !stage) return true; // Allow if no stage/obs specified
  
  const upperStage = stage.toUpperCase();
  const upperObs = observationKey.toUpperCase();
  
  // Establishment observations only valid in early stages
  const isEarlyStage = EARLY_STAGES.has(stage) || EARLY_STAGES.has(upperStage);
  const isEstablishmentObs = ESTABLISHMENT_OBSERVATIONS.has(upperObs);
  
  if (isEstablishmentObs && !isEarlyStage) {
    // Establishment observations not valid in late stages
    return false;
  }
  
  // Flowering/fruiting observations not valid in very early stages
  const floweringObs = new Set(['FLOWER_DROP', 'FRUIT_ROT', 'FRUIT_DROP', 'POD_BORER']);
  if (floweringObs.has(upperObs) && isEarlyStage) {
    return false;
  }
  
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// FALLBACK OPTIONS FOR CLARIFICATION - CANONICAL VERSION
// ═══════════════════════════════════════════════════════════════════════════

export interface FallbackOption {
  observation_key: string;
  label: string;
  category: string;
}

/**
 * Get fallback clarification options for a failure class.
 * Returns canonical observation keys with English labels.
 * Localization happens at the rendering layer via i18n.
 */
export function getFailureClassFallbackOptions(
  failureClass: FailureClass,
  _language: string = 'en'
): FallbackOption[] {
  // NOTE: Language parameter retained for interface compatibility
  // Actual localization uses i18n keys at render time
  
  // FIX 34: Labels are observation_keys only — localization happens via translateClarificationOptions() at render time
  const optionsByClass: Record<FailureClass, FallbackOption[]> = {
    ESTABLISHMENT_FAILURE: [
      { observation_key: 'GERMINATION_FAILURE', label: 'GERMINATION_FAILURE', category: 'establishment' },
      { observation_key: 'SEEDLING_DEATH', label: 'SEEDLING_DEATH', category: 'establishment' },
      { observation_key: 'GAPS_IN_FIELD', label: 'GAPS_IN_FIELD', category: 'establishment' },
      { observation_key: 'ROOT_ROT', label: 'ROOT_ROT', category: 'establishment' }
    ],
    VEGETATIVE_STRESS: [
      { observation_key: 'STUNTED_GROWTH', label: 'STUNTED_GROWTH', category: 'stress' },
      { observation_key: 'WILTING', label: 'WILTING', category: 'stress' },
      { observation_key: 'LEAF_CURLING', label: 'LEAF_CURLING', category: 'stress' },
      { observation_key: 'LEAF_YELLOWING', label: 'LEAF_YELLOWING', category: 'stress' }
    ],
    PEST_DAMAGE: [
      { observation_key: 'INSECTS_VISIBLE', label: 'INSECTS_VISIBLE', category: 'pest' },
      { observation_key: 'HOLES_VISIBLE', label: 'HOLES_VISIBLE', category: 'pest' },
      { observation_key: 'DEAD_HEART', label: 'DEAD_HEART', category: 'pest' },
      { observation_key: 'CATERPILLAR_VISIBLE', label: 'CATERPILLAR_VISIBLE', category: 'pest' }
    ],
    DISEASE_SYMPTOM: [
      { observation_key: 'LEAF_SPOTS', label: 'LEAF_SPOTS', category: 'disease' },
      { observation_key: 'FUNGAL_GROWTH', label: 'FUNGAL_GROWTH', category: 'disease' },
      { observation_key: 'WILT_DISEASE', label: 'WILT_DISEASE', category: 'disease' },
      { observation_key: 'RUST_PRESENT', label: 'RUST_PRESENT', category: 'disease' }
    ],
    NUTRIENT_DEFICIENCY: [
      { observation_key: 'LEAF_YELLOWING', label: 'LEAF_YELLOWING', category: 'nutrient' },
      { observation_key: 'CHLOROSIS', label: 'CHLOROSIS', category: 'nutrient' },
      { observation_key: 'PURPLISH_LEAVES', label: 'PURPLISH_LEAVES', category: 'nutrient' },
      { observation_key: 'STUNTED_GROWTH', label: 'STUNTED_GROWTH', category: 'nutrient' }
    ],
    WEED_COMPETITION: [
      { observation_key: 'WEED_PRESENT', label: 'WEED_PRESENT', category: 'weed' },
      { observation_key: 'WEED_HEAVY', label: 'WEED_HEAVY', category: 'weed' },
      { observation_key: 'WEED_ABOVE_CROP', label: 'WEED_ABOVE_CROP', category: 'weed' },
      { observation_key: 'GRASS_WEEDS', label: 'GRASS_WEEDS', category: 'weed' }
    ],
    UNKNOWN: [
      { observation_key: 'UNKNOWN_SYMPTOM', label: 'UNKNOWN_SYMPTOM', category: 'general' },
      { observation_key: 'PHOTO_REQUEST', label: 'PHOTO_REQUEST', category: 'general' }
    ]
  };
  
  return optionsByClass[failureClass] || optionsByClass.UNKNOWN;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

export function createFailureClassAudit(
  traceId: string,
  input: FailureClassInput,
  result: FailureClassResult
): FailureClassAuditLog {
  return {
    trace_id: traceId,
    timestamp: Date.now(),
    input,
    result,
    clarification_domain: getClarificationDomain(result.primary_class).name,
    fallback_used: result.derived_from === 'DEFAULT',
    fallback_reason: result.derived_from === 'DEFAULT' 
      ? 'No canonical observations matched any failure class'
      : null
  };
}

/**
 * Log failure class detection for debugging and audit purposes.
 */
export function logFailureClassDetection(
  traceId: string,
  input: FailureClassInput,
  result: FailureClassResult,
  domainName: string,
  fallbackUsed: boolean,
  fallbackReason: string | null
): void {
  console.log(`📊 [FailureClass ${traceId}] Detection complete:`);
  console.log(`   Primary: ${result.primary_class} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
  console.log(`   Domain: ${domainName}`);
  console.log(`   Matched observations: ${result.matched_observations.join(', ') || 'none'}`);
  console.log(`   Derived from: ${result.derived_from}`);
  
  if (fallbackUsed) {
    console.warn(`   ⚠️ Fallback used: ${fallbackReason || 'unknown reason'}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  detectPrimaryFailureClass,
  getClarificationDomain,
  getFailureClassThresholds,
  createFailureClassAudit,
  isObservationStageCompatible,
  getFailureClassFallbackOptions,
  logFailureClassDetection,
  FAILURE_CLASS_VERSION
};
