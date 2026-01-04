/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-8: CANONICAL OBSERVATION ONTOLOGY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Define a language-independent, diagnosis-neutral set of observation keys.
 * All clarification logic operates on these keys - NEVER on raw text.
 * 
 * RULES:
 * - Keys represent ONLY what can be observed, NOT causes
 * - NO pest names, disease names, crop names, nutrient names
 * - ALL logic must work on these keys, not language strings
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const OBSERVATION_ONTOLOGY_VERSION = '1.0.0';

/**
 * Canonical observation keys - diagnosis-neutral, language-independent.
 * These represent ONLY what the farmer can observe - NOT causes or diagnoses.
 */
export enum ObservationKey {
  // ═══════════════════════════════════════════════════════════════════════════
  // CROP IDENTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════
  CROP_UNKNOWN = 'CROP_UNKNOWN',
  CROP_IDENTIFIED = 'CROP_IDENTIFIED',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AFFECTED PLANT PART
  // ═══════════════════════════════════════════════════════════════════════════
  AFFECTED_PART_UNKNOWN = 'AFFECTED_PART_UNKNOWN',
  AFFECTED_PART_LEAF = 'AFFECTED_PART_LEAF',
  AFFECTED_PART_STEM = 'AFFECTED_PART_STEM',
  AFFECTED_PART_ROOT = 'AFFECTED_PART_ROOT',
  AFFECTED_PART_FRUIT = 'AFFECTED_PART_FRUIT',
  AFFECTED_PART_WHOLE = 'AFFECTED_PART_WHOLE',
  AFFECTED_PART_FLOWER = 'AFFECTED_PART_FLOWER',
  AFFECTED_PART_BOLL = 'AFFECTED_PART_BOLL',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTION PATTERN
  // ═══════════════════════════════════════════════════════════════════════════
  DISTRIBUTION_UNKNOWN = 'DISTRIBUTION_UNKNOWN',
  DISTRIBUTION_UNIFORM = 'DISTRIBUTION_UNIFORM',
  DISTRIBUTION_PATCHY = 'DISTRIBUTION_PATCHY',
  DISTRIBUTION_EDGE = 'DISTRIBUTION_EDGE',
  DISTRIBUTION_CENTER = 'DISTRIBUTION_CENTER',
  DISTRIBUTION_SPREADING = 'DISTRIBUTION_SPREADING',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SEVERITY LEVEL
  // ═══════════════════════════════════════════════════════════════════════════
  SEVERITY_UNKNOWN = 'SEVERITY_UNKNOWN',
  SEVERITY_LOW = 'SEVERITY_LOW',
  SEVERITY_MEDIUM = 'SEVERITY_MEDIUM',
  SEVERITY_HIGH = 'SEVERITY_HIGH',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TIMING / ONSET
  // ═══════════════════════════════════════════════════════════════════════════
  TIMING_UNKNOWN = 'TIMING_UNKNOWN',
  TIMING_RECENT = 'TIMING_RECENT',       // 1-2 days
  TIMING_WEEK = 'TIMING_WEEK',           // 3-7 days
  TIMING_LONG = 'TIMING_LONG',           // 2+ weeks
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OBSERVED PHENOMENA (DIAGNOSIS-NEUTRAL)
  // These are visual observations - NOT diagnoses
  // ═══════════════════════════════════════════════════════════════════════════
  INSECT_PRESENT = 'INSECT_PRESENT',
  SYMPTOM_COLOR_CHANGE = 'SYMPTOM_COLOR_CHANGE',
  SYMPTOM_YELLOWING = 'SYMPTOM_YELLOWING',
  SYMPTOM_BROWNING = 'SYMPTOM_BROWNING',
  SYMPTOM_DRYING = 'SYMPTOM_DRYING',
  SYMPTOM_SPOTS = 'SYMPTOM_SPOTS',
  SYMPTOM_HOLES = 'SYMPTOM_HOLES',
  SYMPTOM_WILTING = 'SYMPTOM_WILTING',
  SYMPTOM_CURLING = 'SYMPTOM_CURLING',
  SYMPTOM_STUNTING = 'SYMPTOM_STUNTING',
  SYMPTOM_ROTTING = 'SYMPTOM_ROTTING',
  SYMPTOM_STICKY = 'SYMPTOM_STICKY',
  SYMPTOM_POWDER = 'SYMPTOM_POWDER',
  SYMPTOM_FRASS = 'SYMPTOM_FRASS',
  SYMPTOM_WEBBING = 'SYMPTOM_WEBBING',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FARMER ACTIONS ALREADY TAKEN
  // ═══════════════════════════════════════════════════════════════════════════
  ACTION_SPRAY_DONE = 'ACTION_SPRAY_DONE',
  ACTION_FERTILIZER_APPLIED = 'ACTION_FERTILIZER_APPLIED',
  ACTION_IRRIGATION_DONE = 'ACTION_IRRIGATION_DONE',
  ACTION_NONE = 'ACTION_NONE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHOTO AVAILABILITY
  // ═══════════════════════════════════════════════════════════════════════════
  PHOTO_PROVIDED = 'PHOTO_PROVIDED',
  PHOTO_NOT_PROVIDED = 'PHOTO_NOT_PROVIDED',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-10: INSECT TYPE OBSERVATIONS (diagnosis-neutral visual patterns)
  // These are based on WHAT THE FARMER SEES - not diagnoses
  // ═══════════════════════════════════════════════════════════════════════════
  PEST_TYPE_APHID = 'PEST_TYPE_APHID',       // Small, soft-bodied, greenish-yellow insects
  PEST_TYPE_THRIPS = 'PEST_TYPE_THRIPS',     // Tiny, elongated, slender insects
  PEST_TYPE_MITE = 'PEST_TYPE_MITE',         // Very small with webbing
  PEST_TYPE_CATERPILLAR = 'PEST_TYPE_CATERPILLAR', // Larvae with visible body segments
  PEST_TYPE_UNKNOWN = 'PEST_TYPE_UNKNOWN'    // Cannot identify insect type
}

/**
 * Type for a set of observation keys
 */
export type ObservationKeySet = Set<ObservationKey>;

/**
 * Critical observation keys that are REQUIRED before proceeding to diagnosis.
 * Missing any of these requires clarification.
 */
export const CRITICAL_OBSERVATION_KEYS: ObservationKey[] = [
  ObservationKey.CROP_IDENTIFIED,
  ObservationKey.AFFECTED_PART_LEAF,
  ObservationKey.AFFECTED_PART_STEM,
  ObservationKey.AFFECTED_PART_ROOT,
  ObservationKey.AFFECTED_PART_FRUIT,
  ObservationKey.AFFECTED_PART_WHOLE
];

/**
 * Keys that indicate sufficient understanding for each dimension
 */
export const SUFFICIENT_KEYS: Record<string, ObservationKey[]> = {
  crop: [ObservationKey.CROP_IDENTIFIED],
  affected_part: [
    ObservationKey.AFFECTED_PART_LEAF,
    ObservationKey.AFFECTED_PART_STEM,
    ObservationKey.AFFECTED_PART_ROOT,
    ObservationKey.AFFECTED_PART_FRUIT,
    ObservationKey.AFFECTED_PART_WHOLE,
    ObservationKey.AFFECTED_PART_FLOWER,
    ObservationKey.AFFECTED_PART_BOLL
  ],
  distribution: [
    ObservationKey.DISTRIBUTION_UNIFORM,
    ObservationKey.DISTRIBUTION_PATCHY,
    ObservationKey.DISTRIBUTION_EDGE,
    ObservationKey.DISTRIBUTION_CENTER,
    ObservationKey.DISTRIBUTION_SPREADING
  ],
  severity: [
    ObservationKey.SEVERITY_LOW,
    ObservationKey.SEVERITY_MEDIUM,
    ObservationKey.SEVERITY_HIGH
  ],
  timing: [
    ObservationKey.TIMING_RECENT,
    ObservationKey.TIMING_WEEK,
    ObservationKey.TIMING_LONG
  ]
};

/**
 * Check if a dimension is satisfied by the given observation keys
 */
export function isDimensionSatisfied(
  keys: Set<ObservationKey>,
  dimension: keyof typeof SUFFICIENT_KEYS
): boolean {
  const requiredKeys = SUFFICIENT_KEYS[dimension];
  return requiredKeys.some(k => keys.has(k));
}

/**
 * Get the next unsatisfied dimension in priority order
 */
export function getNextMissingDimension(
  keys: Set<ObservationKey>
): keyof typeof SUFFICIENT_KEYS | null {
  // Priority order: crop → affected_part → distribution → severity → timing
  const priorityOrder: (keyof typeof SUFFICIENT_KEYS)[] = [
    'crop',
    'affected_part',
    'distribution',
    'severity',
    'timing'
  ];
  
  for (const dimension of priorityOrder) {
    if (!isDimensionSatisfied(keys, dimension)) {
      return dimension;
    }
  }
  
  return null; // All dimensions satisfied
}

/**
 * Count how many dimensions are satisfied
 */
export function countSatisfiedDimensions(keys: Set<ObservationKey>): number {
  let count = 0;
  for (const dimension of Object.keys(SUFFICIENT_KEYS) as (keyof typeof SUFFICIENT_KEYS)[]) {
    if (isDimensionSatisfied(keys, dimension)) {
      count++;
    }
  }
  return count;
}

export default {
  ObservationKey,
  CRITICAL_OBSERVATION_KEYS,
  SUFFICIENT_KEYS,
  isDimensionSatisfied,
  getNextMissingDimension,
  countSatisfiedDimensions,
  OBSERVATION_ONTOLOGY_VERSION
};
