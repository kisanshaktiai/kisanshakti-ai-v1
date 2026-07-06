/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED CONFIDENCE THRESHOLDS (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SINGLE SOURCE OF TRUTH for all confidence thresholds used in:
 * - diagnosis-conflict-resolver.ts
 * - unified-decision-gate.ts
 * - confidence-engine.ts
 * - hypothesis-evaluator.ts
 * 
 * INVARIANT: All confidence-related decisions MUST use these constants.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CONFIDENCE_THRESHOLDS_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CORE DECISION THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export const CONFIDENCE_THRESHOLDS = {
  // ═══════════════════════════════════════════════════════════════════════════
  // TREATMENT & SAFETY GATES
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Minimum confidence required to recommend treatment/spray */
  TREATMENT_ALLOWED: 0.70,
  
  /** Minimum confidence for urgent treatment recommendations */
  URGENT_TREATMENT_ALLOWED: 0.80,
  
  /** Below this, force clarification before any action */
  MINIMUM_BASE: 0.40,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CLARIFICATION TRIGGERS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Trigger clarification if below this */
  CLARIFICATION_REQUIRED: 0.60,
  
  /** All diagnoses considered LOW if below this */
  LOW_CONFIDENCE: 0.50,
  
  /** Ambiguous diagnosis threshold (multiple causes with similar confidence) */
  AMBIGUITY_DELTA: 0.15,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY DETECTION (NLP)
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** High confidence entity match */
  ENTITY_HIGH: 1.0,
  
  /** Medium confidence entity match */
  ENTITY_MEDIUM: 0.8,
  
  /** Low confidence entity match */
  ENTITY_LOW: 0.5,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RISK ADJUSTMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Penalty multiplier for critical severity cases */
  CRITICAL_PENALTY: 0.8,
  
  /** Penalty multiplier when multiple causes detected */
  MULTIPLE_CAUSES_PENALTY: 0.95,
  
  /** Boost multiplier for healthy crop indicators */
  HEALTHY_BOOST: 1.05,
  
  /** Boost for pathognomonic (unique) symptoms */
  PATHOGNOMONIC_BOOST: 0.25,
  
  /** Boost for suggestive symptoms */
  SUGGESTIVE_BOOST: 0.12,
  
  /** Boost for non-specific symptoms */
  NON_SPECIFIC_BOOST: 0.05,
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SYMPTOM COVERAGE
  // ═══════════════════════════════════════════════════════════════════════════
  
  /** Minimum symptom coverage to proceed without clarification */
  SYMPTOM_COVERAGE_THRESHOLD: 0.40,
  
  /** High symptom coverage (confident diagnosis) */
  HIGH_SYMPTOM_COVERAGE: 0.70,
  
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if confidence is sufficient for treatment recommendation
 */
export function canRecommendTreatment(confidence: number): boolean {
  return confidence >= CONFIDENCE_THRESHOLDS.TREATMENT_ALLOWED;
}

/**
 * Check if clarification is required based on confidence
 */
export function requiresClarification(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.CLARIFICATION_REQUIRED;
}

/**
 * Check if confidence is too low for any recommendation
 */
export function isTooLowForAction(confidence: number): boolean {
  return confidence < CONFIDENCE_THRESHOLDS.MINIMUM_BASE;
}

/**
 * Apply diagnostic power boost to confidence
 */
export function applyDiagnosticBoost(
  baseConfidence: number, 
  diagnosticPower: 'HIGH' | 'MEDIUM' | 'LOW'
): number {
  const boost = diagnosticPower === 'HIGH' 
    ? CONFIDENCE_THRESHOLDS.PATHOGNOMONIC_BOOST
    : diagnosticPower === 'MEDIUM'
    ? CONFIDENCE_THRESHOLDS.SUGGESTIVE_BOOST
    : CONFIDENCE_THRESHOLDS.NON_SPECIFIC_BOOST;
  
  return Math.min(1.0, baseConfidence + boost);
}

/**
 * Determine decision mode based on confidence level
 */
export function getDecisionMode(confidence: number): 
  'TREATMENT' | 'MONITORING' | 'CLARIFICATION' | 'BLOCKED' {
  
  if (confidence >= CONFIDENCE_THRESHOLDS.TREATMENT_ALLOWED) {
    return 'TREATMENT';
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.CLARIFICATION_REQUIRED) {
    return 'MONITORING';
  }
  if (confidence >= CONFIDENCE_THRESHOLDS.MINIMUM_BASE) {
    return 'CLARIFICATION';
  }
  return 'BLOCKED';
}

console.log('📊 [ConfidenceThresholds] Loaded v1.0.0 - centralized thresholds');
