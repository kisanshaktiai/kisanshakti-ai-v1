/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-8: CLARIFICATION SCOPE RESOLVER (COMPLETE REWRITE)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Determine what to ask next using ObservationKeys ONLY.
 * No language strings, no text pattern matching, no diagnosis.
 * 
 * PHASE-8.1 UPDATE:
 * - Block crop clarification when CropContextAuthority exists
 * - Support hasCropContext flag to skip IDENTIFY_CROP scope
 * 
 * RULES:
 * - Input: Set<ObservationKey> + turn count + hasCropContext
 * - Output: ClarificationScope (deterministic)
 * - NEVER inspect raw text
 * - NEVER use pest/disease catalogs
 * - Max 3 clarification turns enforced
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  ObservationKey,
  isDimensionSatisfied,
  getNextMissingDimension,
  countSatisfiedDimensions,
  type ObservationKeySet
} from '../decision/observation-ontology.ts';

import { ClarificationScope } from './clarification-renderer.ts';

export const CLARIFICATION_SCOPE_RESOLVER_VERSION = '2.1.0'; // Phase-8.1 update

// Re-export ClarificationScope for convenience
export { ClarificationScope };

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION PLAN (OUTPUT)
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationPlan {
  scope: ClarificationScope;
  target_keys: ObservationKey[];
  turn_count: number;
  should_stop: boolean;
  reason: string;
  priority: number;
}

export interface ClarificationState {
  turn_count: number;
  previous_scopes: ClarificationScope[];
  observation_keys_before: string[];
  observation_keys_after: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maximum clarification turns before hard stop
 */
export const MAX_CLARIFICATION_TURNS = 3;

/**
 * Minimum dimensions required before allowing rule engine
 */
export const MIN_DIMENSIONS_FOR_DIAGNOSIS = 2; // crop + affected_part minimum

/**
 * Priority order for clarification scopes (lower = higher priority)
 */
const SCOPE_PRIORITY: Record<ClarificationScope, number> = {
  [ClarificationScope.IDENTIFY_CROP]: 1,
  [ClarificationScope.IDENTIFY_LOCATION]: 2,
  [ClarificationScope.IDENTIFY_DISTRIBUTION]: 3,
  [ClarificationScope.IDENTIFY_SEVERITY]: 4,
  [ClarificationScope.IDENTIFY_TIMING]: 5,
  [ClarificationScope.REFINE_OBSERVATION]: 6,
  [ClarificationScope.PHOTO_ONLY]: 7,
  [ClarificationScope.STOP_ESCALATE]: 8
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RESOLUTION FUNCTION (PHASE-8 CORE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve clarification plan based on ObservationKeys ONLY.
 * This is DETERMINISTIC - same keys + turn count = same output.
 * 
 * PHASE-8.1: Added hasCropContext parameter to skip crop clarification
 * when CropContextAuthority exists from crop_schedules.
 * 
 * PRIORITY ORDER (immutable):
 * 1. Crop identification (SKIPPED if hasCropContext=true)
 * 2. Affected part (location)
 * 3. Distribution
 * 4. Severity
 * 5. Timing
 * 6. Observation refinement
 * 7. Photo only
 * 8. Stop / escalate
 */
export function resolveClarificationPlan(
  observedKeys: Set<ObservationKey>,
  turnCount: number,
  previousScopes: ClarificationScope[] = [],
  hasCropContext: boolean = false // PHASE-8.1: Skip crop clarification if true
): ClarificationPlan {
  // ═══════════════════════════════════════════════════════════════════════════
  // HARD STOP: Maximum clarification turns reached
  // ═══════════════════════════════════════════════════════════════════════════
  if (turnCount >= MAX_CLARIFICATION_TURNS) {
    return {
      scope: ClarificationScope.STOP_ESCALATE,
      target_keys: [],
      turn_count: turnCount,
      should_stop: true,
      reason: `Maximum clarification turns (${MAX_CLARIFICATION_TURNS}) reached`,
      priority: SCOPE_PRIORITY[ClarificationScope.STOP_ESCALATE]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 1: Crop Unknown
  // PHASE-8.1: SKIP if hasCropContext (CropContextAuthority exists)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!hasCropContext && 
      observedKeys.has(ObservationKey.CROP_UNKNOWN) && 
      !observedKeys.has(ObservationKey.CROP_IDENTIFIED)) {
    return {
      scope: ClarificationScope.IDENTIFY_CROP,
      target_keys: [ObservationKey.CROP_IDENTIFIED],
      turn_count: turnCount,
      should_stop: false,
      reason: 'Crop not identified',
      priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_CROP]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 2: Affected Part Unknown
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.AFFECTED_PART_UNKNOWN)) {
    // Check if any specific part is identified
    const hasSpecificPart = [
      ObservationKey.AFFECTED_PART_LEAF,
      ObservationKey.AFFECTED_PART_STEM,
      ObservationKey.AFFECTED_PART_ROOT,
      ObservationKey.AFFECTED_PART_FRUIT,
      ObservationKey.AFFECTED_PART_WHOLE,
      ObservationKey.AFFECTED_PART_FLOWER,
      ObservationKey.AFFECTED_PART_BOLL
    ].some(k => observedKeys.has(k));
    
    if (!hasSpecificPart) {
      return {
        scope: ClarificationScope.IDENTIFY_LOCATION,
        target_keys: [
          ObservationKey.AFFECTED_PART_LEAF,
          ObservationKey.AFFECTED_PART_STEM,
          ObservationKey.AFFECTED_PART_ROOT,
          ObservationKey.AFFECTED_PART_FRUIT
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Affected plant part not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_LOCATION]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 3: Distribution Unknown
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.DISTRIBUTION_UNKNOWN)) {
    const hasDistribution = [
      ObservationKey.DISTRIBUTION_UNIFORM,
      ObservationKey.DISTRIBUTION_PATCHY,
      ObservationKey.DISTRIBUTION_EDGE,
      ObservationKey.DISTRIBUTION_CENTER,
      ObservationKey.DISTRIBUTION_SPREADING
    ].some(k => observedKeys.has(k));
    
    if (!hasDistribution && turnCount < 2) {
      return {
        scope: ClarificationScope.IDENTIFY_DISTRIBUTION,
        target_keys: [
          ObservationKey.DISTRIBUTION_UNIFORM,
          ObservationKey.DISTRIBUTION_PATCHY,
          ObservationKey.DISTRIBUTION_EDGE,
          ObservationKey.DISTRIBUTION_CENTER
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Symptom distribution not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_DISTRIBUTION]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 4: Severity Unknown (only if turn count allows)
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.SEVERITY_UNKNOWN) && turnCount < 2) {
    const hasSeverity = [
      ObservationKey.SEVERITY_LOW,
      ObservationKey.SEVERITY_MEDIUM,
      ObservationKey.SEVERITY_HIGH
    ].some(k => observedKeys.has(k));
    
    if (!hasSeverity) {
      return {
        scope: ClarificationScope.IDENTIFY_SEVERITY,
        target_keys: [
          ObservationKey.SEVERITY_LOW,
          ObservationKey.SEVERITY_MEDIUM,
          ObservationKey.SEVERITY_HIGH
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Severity level not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_SEVERITY]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 5: Timing Unknown (only if critical fields covered)
  // ═══════════════════════════════════════════════════════════════════════════
  if (observedKeys.has(ObservationKey.TIMING_UNKNOWN) && 
      turnCount < 2 &&
      observedKeys.has(ObservationKey.CROP_IDENTIFIED)) {
    const hasTiming = [
      ObservationKey.TIMING_RECENT,
      ObservationKey.TIMING_WEEK,
      ObservationKey.TIMING_LONG
    ].some(k => observedKeys.has(k));
    
    if (!hasTiming) {
      return {
        scope: ClarificationScope.IDENTIFY_TIMING,
        target_keys: [
          ObservationKey.TIMING_RECENT,
          ObservationKey.TIMING_WEEK,
          ObservationKey.TIMING_LONG
        ],
        turn_count: turnCount,
        should_stop: false,
        reason: 'Problem timing not identified',
        priority: SCOPE_PRIORITY[ClarificationScope.IDENTIFY_TIMING]
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 6: Observation Refinement (no specific phenomena detected)
  // ═══════════════════════════════════════════════════════════════════════════
  const hasPhenomena = [
    ObservationKey.INSECT_PRESENT,
    ObservationKey.SYMPTOM_COLOR_CHANGE,
    ObservationKey.SYMPTOM_YELLOWING,
    ObservationKey.SYMPTOM_BROWNING,
    ObservationKey.SYMPTOM_DRYING,
    ObservationKey.SYMPTOM_SPOTS,
    ObservationKey.SYMPTOM_HOLES,
    ObservationKey.SYMPTOM_WILTING,
    ObservationKey.SYMPTOM_CURLING,
    ObservationKey.SYMPTOM_STUNTING,
    ObservationKey.SYMPTOM_ROTTING
  ].some(k => observedKeys.has(k));
  
  if (!hasPhenomena && turnCount < MAX_CLARIFICATION_TURNS) {
    return {
      scope: ClarificationScope.REFINE_OBSERVATION,
      target_keys: [
        ObservationKey.SYMPTOM_COLOR_CHANGE,
        ObservationKey.SYMPTOM_HOLES,
        ObservationKey.SYMPTOM_DRYING,
        ObservationKey.INSECT_PRESENT
      ],
      turn_count: turnCount,
      should_stop: false,
      reason: 'No specific symptoms detected',
      priority: SCOPE_PRIORITY[ClarificationScope.REFINE_OBSERVATION]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRIORITY 7: Photo Only (if still insufficient after refinement)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!observedKeys.has(ObservationKey.PHOTO_PROVIDED) && 
      turnCount === MAX_CLARIFICATION_TURNS - 1) {
    return {
      scope: ClarificationScope.PHOTO_ONLY,
      target_keys: [ObservationKey.PHOTO_PROVIDED],
      turn_count: turnCount,
      should_stop: false,
      reason: 'Requesting photo for visual diagnosis',
      priority: SCOPE_PRIORITY[ClarificationScope.PHOTO_ONLY]
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DEFAULT: Stop and let rule engine handle with available info
  // ═══════════════════════════════════════════════════════════════════════════
  return {
    scope: ClarificationScope.STOP_ESCALATE,
    target_keys: [],
    turn_count: turnCount,
    should_stop: true,
    reason: 'Sufficient information available or max turns reached',
    priority: SCOPE_PRIORITY[ClarificationScope.STOP_ESCALATE]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if clarification is needed based on observation keys.
 */
export function needsClarification(observedKeys: Set<ObservationKey>): boolean {
  // Must have crop identified
  if (!observedKeys.has(ObservationKey.CROP_IDENTIFIED) && 
      observedKeys.has(ObservationKey.CROP_UNKNOWN)) {
    return true;
  }
  
  // Must have affected part
  const hasAffectedPart = [
    ObservationKey.AFFECTED_PART_LEAF,
    ObservationKey.AFFECTED_PART_STEM,
    ObservationKey.AFFECTED_PART_ROOT,
    ObservationKey.AFFECTED_PART_FRUIT,
    ObservationKey.AFFECTED_PART_WHOLE
  ].some(k => observedKeys.has(k));
  
  if (!hasAffectedPart && observedKeys.has(ObservationKey.AFFECTED_PART_UNKNOWN)) {
    return true;
  }
  
  // Count satisfied dimensions
  const satisfiedCount = countSatisfiedDimensions(observedKeys);
  
  return satisfiedCount < MIN_DIMENSIONS_FOR_DIAGNOSIS;
}

/**
 * Check if sufficient information is available to proceed to diagnosis.
 */
export function hasSufficientInformation(observedKeys: Set<ObservationKey>): boolean {
  // Must have crop
  if (!observedKeys.has(ObservationKey.CROP_IDENTIFIED)) {
    return false;
  }
  
  // Must have at least one specific affected part OR symptom phenomenon
  const hasAffectedPart = [
    ObservationKey.AFFECTED_PART_LEAF,
    ObservationKey.AFFECTED_PART_STEM,
    ObservationKey.AFFECTED_PART_ROOT,
    ObservationKey.AFFECTED_PART_FRUIT,
    ObservationKey.AFFECTED_PART_WHOLE,
    ObservationKey.AFFECTED_PART_BOLL
  ].some(k => observedKeys.has(k));
  
  const hasPhenomena = [
    ObservationKey.INSECT_PRESENT,
    ObservationKey.SYMPTOM_COLOR_CHANGE,
    ObservationKey.SYMPTOM_YELLOWING,
    ObservationKey.SYMPTOM_BROWNING,
    ObservationKey.SYMPTOM_DRYING,
    ObservationKey.SYMPTOM_SPOTS,
    ObservationKey.SYMPTOM_HOLES,
    ObservationKey.SYMPTOM_WILTING,
    ObservationKey.SYMPTOM_CURLING
  ].some(k => observedKeys.has(k));
  
  return hasAffectedPart || hasPhenomena;
}

/**
 * Initialize a new clarification state for a session.
 */
export function initializeClarificationState(): ClarificationState {
  return {
    turn_count: 0,
    previous_scopes: [],
    observation_keys_before: [],
    observation_keys_after: []
  };
}

/**
 * Update clarification state after a clarification turn.
 */
export function updateClarificationState(
  state: ClarificationState,
  scope: ClarificationScope,
  keysBefore: Set<ObservationKey>,
  keysAfter: Set<ObservationKey>
): ClarificationState {
  return {
    turn_count: state.turn_count + 1,
    previous_scopes: [...state.previous_scopes, scope],
    observation_keys_before: Array.from(keysBefore),
    observation_keys_after: Array.from(keysAfter)
  };
}

export default {
  ClarificationScope,
  resolveClarificationPlan,
  needsClarification,
  hasSufficientInformation,
  initializeClarificationState,
  updateClarificationState,
  MAX_CLARIFICATION_TURNS,
  MIN_DIMENSIONS_FOR_DIAGNOSIS,
  CLARIFICATION_SCOPE_RESOLVER_VERSION
};
