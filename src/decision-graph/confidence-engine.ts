/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIDENCE & RISK ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Calculates overall confidence and risk level from input data and causes.
 * Uses weighted averages and rule-based risk assessment.
 * 
 * CRITICAL: Deterministic logic only - no AI
 * 
 * Version: 1.0.0
 */

import {
  DecisionInput,
  Cause,
  RiskLevel,
  DataConfidence,
  NDVIState,
  CauseRule
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Data source weights for confidence calculation
 * NDVI is weighted highest as it's the primary health indicator
 */
const CONFIDENCE_WEIGHTS = {
  soil: 0.30,    // 30% weight
  ndvi: 0.50,    // 50% weight (primary indicator)
  weather: 0.20  // 20% weight
} as const;

/**
 * Calculate overall confidence from individual data source confidence
 * 
 * @param dataConfidence - Confidence levels for each data source
 * @returns Overall confidence (0-1)
 */
export function calculateOverallConfidence(dataConfidence: DataConfidence): number {
  // Count how many data sources are available (non-zero)
  const availableSources = [
    dataConfidence.soil > 0,
    dataConfidence.ndvi > 0,
    dataConfidence.weather > 0
  ].filter(Boolean).length;
  
  // If we have sowing date + crop info (always available), that's minimum 40% confidence
  // Each data source adds confidence on top of that
  const MINIMUM_BASE_CONFIDENCE = 0.40; // We know crop + sowing date + DAS
  
  // Calculate weighted contribution from available data
  const weighted = 
    dataConfidence.soil * CONFIDENCE_WEIGHTS.soil +
    dataConfidence.ndvi * CONFIDENCE_WEIGHTS.ndvi +
    dataConfidence.weather * CONFIDENCE_WEIGHTS.weather;
  
  // Floor: Even with no sensor data, rule-based advice from crop stage + DAS is ~40% reliable
  // Max: With all data sources fresh, we get 40% base + 60% from data = 100%
  const totalConfidence = MINIMUM_BASE_CONFIDENCE + (weighted * 0.6);

  // Round to 2 decimal places, clamp to 0-1
  return Math.min(1.0, Math.max(0.40, Math.round(totalConfidence * 100) / 100));
}

/**
 * Adjust confidence based on inferred causes
 * Critical causes with low data confidence should reduce overall confidence
 * 
 * @param baseConfidence - Initial calculated confidence
 * @param causes - Inferred causes
 * @param dataConfidence - Individual data source confidence
 * @returns Adjusted confidence (0-1)
 */
export function adjustConfidenceForCauses(
  baseConfidence: number,
  causes: Cause[],
  dataConfidence: DataConfidence
): number {
  let adjusted = baseConfidence;

  // Critical causes require high confidence data
  const criticalCauses = causes.filter(c => 
    c.includes('CRITICAL') || 
    c.includes('IMMINENT') || 
    c.includes('EMERGENCY') ||
    c.includes('SEVERE')
  );

  if (criticalCauses.length > 0) {
    // If we have critical causes but low confidence, reduce overall confidence
    const minConfidence = Math.min(dataConfidence.soil, dataConfidence.ndvi, dataConfidence.weather);
    if (minConfidence < 0.5) {
      adjusted = adjusted * 0.8; // 20% penalty for low confidence on critical issues
    }
  }

  // Multiple causes might indicate uncertain situation
  if (causes.length > 5) {
    adjusted = adjusted * 0.95; // 5% penalty for too many causes
  }

  // Healthy causes with high confidence should boost slightly
  const healthyCauses = causes.filter(c => 
    c.includes('OPTIMAL') || 
    c.includes('HEALTHY') ||
    c.includes('RECOVERY')
  );

  if (healthyCauses.length > 0 && baseConfidence > 0.7) {
    adjusted = Math.min(1.0, adjusted * 1.05); // 5% boost
  }

  return Math.round(adjusted * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE CONFIDENCE ADJUSTMENT (STEP 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adjust confidence based on rule-level confidence scores
 * Rules with lower certainty should reduce overall advisory confidence
 * 
 * @param baseConfidence - Base confidence from data sources
 * @param appliedRules - Rules that fired
 * @returns Adjusted confidence (0-1)
 */
export function adjustConfidenceForRuleStrength(
  baseConfidence: number,
  appliedRules: CauseRule[]
): number {
  if (appliedRules.length === 0) {
    return baseConfidence;
  }

  // Calculate average rule confidence (default 0.8 for rules without explicit confidence)
  const avgRuleConfidence = appliedRules
    .map(r => r.cause_confidence ?? 0.8)
    .reduce((a, b) => a + b, 0) / appliedRules.length;

  // Apply rule confidence as a modifier
  return Math.round(baseConfidence * avgRuleConfidence * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK LEVEL CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Causes that indicate critical risk level
 */
const CRITICAL_CAUSES: Cause[] = [
  Cause.CROP_FAILURE_IMMINENT,
  Cause.TOTAL_CROP_LOSS_RISK,
  Cause.WATER_STRESS_CRITICAL,
  Cause.DROUGHT_STRESS,
  Cause.COMPOUND_STRESS,
  Cause.MULTIPLE_STRESSOR_EMERGENCY,
  Cause.EPIDEMIC_RISK,
  Cause.SALVAGE_HARVEST_NEEDED
];

/**
 * Causes that indicate high risk level
 */
const HIGH_RISK_CAUSES: Cause[] = [
  Cause.NITROGEN_DEFICIENCY_CRITICAL,
  Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
  Cause.POTASSIUM_DEFICIENCY_CRITICAL,
  Cause.SEVERE_NUTRIENT_DEPLETION,
  Cause.WATER_STRESS_MODERATE,
  Cause.WATER_STRESS_WHEAT_CRI,
  Cause.WATER_STRESS_COTTON_BOLL,
  Cause.WATERLOGGING_SEVERE,
  Cause.HEAT_STRESS_SEVERE,
  Cause.FROST_DAMAGE_RISK,
  Cause.TERMINAL_HEAT_WHEAT,
  Cause.SPIKELET_STERILITY_RICE,
  Cause.RICE_BLAST_RISK,
  Cause.RICE_BACTERIAL_BLIGHT_RISK,
  Cause.BOLLWORM_RISK,
  Cause.WEED_COMPETITION_CRITICAL,
  Cause.UNCERTAIN_CRITICAL,
  Cause.FORCED_MATURITY_RISK
];

/**
 * Causes that indicate medium risk level
 */
const MEDIUM_RISK_CAUSES: Cause[] = [
  Cause.NITROGEN_DEFICIENCY,
  Cause.PHOSPHORUS_DEFICIENCY,
  Cause.POTASSIUM_DEFICIENCY,
  Cause.ZINC_DEFICIENCY,
  Cause.NUTRIENT_LOCKOUT_ACIDIC,
  Cause.NUTRIENT_LOCKOUT_ALKALINE,
  Cause.WATER_STRESS_MILD,
  Cause.WATERLOGGING,
  Cause.HEAT_STRESS,
  Cause.COLD_STRESS,
  Cause.WHEAT_RUST_RISK,
  Cause.LATE_BLIGHT_RISK,
  Cause.EARLY_BLIGHT_RISK,
  Cause.POWDERY_MILDEW_RISK,
  Cause.ROOT_ROT_RISK,
  Cause.DAMPING_OFF_RISK,
  Cause.APHID_RISK,
  Cause.STEM_BORER_RISK,
  Cause.WHITEFLY_RISK,
  Cause.THRIPS_RISK,
  Cause.WEED_EMERGENCE_WINDOW,
  Cause.EXCESS_NITROGEN_LODGING,
  Cause.EXCESS_NITROGEN_DISEASE
];

/**
 * Calculate risk level based on causes and NDVI state
 * 
 * Priority order:
 * 1. Check for critical causes
 * 2. Check for high risk causes
 * 3. Check NDVI state
 * 4. Check for medium risk causes
 * 5. Default to low
 * 
 * @param causes - Inferred causes
 * @param ndviState - Current NDVI state
 * @param confidence - Overall confidence
 * @returns RiskLevel
 */
export function calculateRiskLevel(
  causes: Cause[],
  ndviState: NDVIState,
  confidence: number
): RiskLevel {
  // Check for critical causes
  if (causes.some(c => CRITICAL_CAUSES.includes(c))) {
    return RiskLevel.CRITICAL;
  }

  // Critical NDVI with low confidence
  if (ndviState === NDVIState.CRITICAL && confidence < 0.5) {
    return RiskLevel.CRITICAL;
  }

  // Critical NDVI state alone
  if (ndviState === NDVIState.CRITICAL) {
    return RiskLevel.HIGH;
  }

  // Check for high risk causes
  if (causes.some(c => HIGH_RISK_CAUSES.includes(c))) {
    return RiskLevel.HIGH;
  }

  // High stress NDVI
  if (ndviState === NDVIState.HIGH_STRESS) {
    return RiskLevel.HIGH;
  }

  // Check for medium risk causes
  if (causes.some(c => MEDIUM_RISK_CAUSES.includes(c))) {
    return RiskLevel.MEDIUM;
  }

  // Moderate stress NDVI
  if (ndviState === NDVIState.MODERATE_STRESS) {
    return RiskLevel.MEDIUM;
  }

  // Multiple minor issues
  if (causes.length >= 3) {
    return RiskLevel.MEDIUM;
  }

  // Default to low risk
  return RiskLevel.LOW;
}

/**
 * Get risk level description for UI
 * 
 * @param riskLevel - Calculated risk level
 * @returns Description object
 */
export function getRiskDescription(riskLevel: RiskLevel): {
  label: string;
  labelKey: string;
  description: string;
  color: string;
  urgency: string;
} {
  switch (riskLevel) {
    case RiskLevel.CRITICAL:
      return {
        label: 'Critical',
        labelKey: 'risk.critical',
        description: 'Immediate action required to prevent crop loss',
        color: 'red',
        urgency: 'Act within hours'
      };
    case RiskLevel.HIGH:
      return {
        label: 'High',
        labelKey: 'risk.high',
        description: 'Urgent action recommended within 24-48 hours',
        color: 'orange',
        urgency: 'Act within 1-2 days'
      };
    case RiskLevel.MEDIUM:
      return {
        label: 'Medium',
        labelKey: 'risk.medium',
        description: 'Action recommended within 3-7 days',
        color: 'yellow',
        urgency: 'Act within 1 week'
      };
    case RiskLevel.LOW:
      return {
        label: 'Low',
        labelKey: 'risk.low',
        description: 'No immediate action needed, continue monitoring',
        color: 'green',
        urgency: 'Monitor regularly'
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate both confidence and risk level
 * 
 * @param input - Decision input
 * @param causes - Inferred causes
 * @returns Object with confidence and risk level
 */
export function calculateConfidenceAndRisk(
  input: DecisionInput,
  causes: Cause[]
): {
  confidence: number;
  riskLevel: RiskLevel;
} {
  // Calculate base confidence
  const baseConfidence = calculateOverallConfidence(input.data_confidence);
  
  // Adjust for causes
  const confidence = adjustConfidenceForCauses(
    baseConfidence,
    causes,
    input.data_confidence
  );
  
  // Calculate risk level
  const riskLevel = calculateRiskLevel(causes, input.ndvi_state, confidence);

  return {
    confidence,
    riskLevel
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  CONFIDENCE_WEIGHTS,
  CRITICAL_CAUSES,
  HIGH_RISK_CAUSES,
  MEDIUM_RISK_CAUSES
};
