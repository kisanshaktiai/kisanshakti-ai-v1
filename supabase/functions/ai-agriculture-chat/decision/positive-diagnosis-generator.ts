// ✅ FORENSIC REFACTOR COMPLETE
// Authority: Pure symbolic positive diagnosis evaluator - emits diagnosis codes, confidence, and i18n_keys ONLY

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * POSITIVE DIAGNOSIS GENERATOR - SSOT COMPLIANT v2.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Generate "NO_INTERVENTION_REQUIRED" as a POSITIVE terminal diagnosis
 * when crop is healthy and no treatment is needed.
 * 
 * ARCHITECTURAL ROLE:
 * - Outputs ONLY symbolic codes and structured data
 * - NO language text (mr/hi/en) in this file
 * - All human-readable messages via i18n_keys
 * - Narration layer handles text rendering
 * 
 * AGRONOMIC RATIONALE:
 * 40-55% of early crop complaints are "monitor only" cases.
 * This is a SUCCESS, not a failure state.
 * 
 * VERSION: 2.0.0 - SSOT Compliant
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';

export const POSITIVE_DIAGNOSIS_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL ENUMS - Language-neutral codes only
// ═══════════════════════════════════════════════════════════════════════════

export type DiagnosisType = 
  | 'NO_INTERVENTION_REQUIRED' 
  | 'MONITOR_AND_WAIT' 
  | 'NEEDS_INVESTIGATION';

export type PositiveReasonCode = 
  | 'HEALTHY_NDVI'
  | 'MILD_SYMPTOMS_NORMAL_GROWTH'
  | 'EARLY_STAGE_ADJUSTMENT'
  | 'NO_SPECIFIC_THREAT'
  | 'SEASONAL_VARIATION'
  | 'NEEDS_CLARIFICATION';

export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'unknown';

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC INPUT/OUTPUT CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════

export interface PositiveDiagnosisInput {
  ndvi_value: number | null;
  ndvi_trend: string | null;
  symptoms_count: number;
  symptoms_severity: SeverityLevel;
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  rules_matched: number;
  land_state?: AuthoritativeLandState | null;
}

/**
 * Symbolic output - NO text, only codes and metadata
 */
export interface PositiveDiagnosisOutput {
  is_positive: boolean;
  diagnosis_type: DiagnosisType;
  confidence: number;
  follow_up_days: number;
  reason_code: PositiveReasonCode;
  i18n_key: string;
  recommendation_codes: string[];
  metadata: {
    ndvi_healthy: boolean;
    symptoms_non_critical: boolean;
    no_rules_matched: boolean;
    evaluation_factors: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NDVI HEALTH THRESHOLDS BY STAGE - Pure data, no interpretation text
// ═══════════════════════════════════════════════════════════════════════════

const NDVI_HEALTHY_THRESHOLDS: Record<string, number> = {
  'GERMINATION': 0.25,
  'SEEDLING': 0.30,
  'TILLERING': 0.40,
  'VEGETATIVE': 0.45,
  'GRAND_GROWTH': 0.50,
  'FLOWERING': 0.48,
  'FRUITING': 0.45,
  'MATURITY': 0.35,
  'HARVEST': 0.25,
  'DEFAULT': 0.40
};

/**
 * Get NDVI health threshold for a specific growth stage
 */
function getNDVIThreshold(stage: string): number {
  const normalizedStage = stage.toUpperCase().replace(/[\s-]/g, '_');
  return NDVI_HEALTHY_THRESHOLDS[normalizedStage] || NDVI_HEALTHY_THRESHOLDS['DEFAULT'];
}

/**
 * Check if NDVI indicates healthy crop
 */
function isNDVIHealthy(ndviValue: number | null, stage: string): boolean {
  if (ndviValue === null) return false;
  const threshold = getNDVIThreshold(stage);
  return ndviValue >= threshold;
}

/**
 * Check if symptoms indicate mild, non-critical issues
 */
function areSymptomsNonCritical(severity: SeverityLevel, symptomCount: number): boolean {
  if (severity === 'HIGH' || severity === 'CRITICAL') return false;
  if (symptomCount > 3) return false;
  return severity === 'LOW' || severity === 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN POSITIVE DIAGNOSIS EVALUATION - Symbolic output only
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate if the current state warrants a POSITIVE "no intervention" diagnosis.
 * 
 * This is a SUCCESS state, not a fallback.
 * 
 * Conditions for positive diagnosis:
 * 1. NDVI is healthy for the growth stage
 * 2. Symptoms are mild or non-specific
 * 3. No specific rules matched (meaning no clear pest/disease)
 * 4. Crop stage is progressing normally
 * 
 * @returns Symbolic output with codes - NO text
 */
export function evaluatePositiveDiagnosis(
  input: PositiveDiagnosisInput
): PositiveDiagnosisOutput {
  console.log(`[PositiveDiagnosis v${POSITIVE_DIAGNOSIS_VERSION}] Evaluating...`);
  console.log(`  NDVI: ${input.ndvi_value}, Stage: ${input.growth_stage}, Symptoms: ${input.symptoms_count}`);
  
  const ndviHealthy = isNDVIHealthy(input.ndvi_value, input.growth_stage);
  const symptomsNonCritical = areSymptomsNonCritical(input.symptoms_severity, input.symptoms_count);
  const noRulesMatched = input.rules_matched === 0;
  
  const evaluationFactors: string[] = [];
  if (ndviHealthy) evaluationFactors.push('NDVI_HEALTHY');
  if (symptomsNonCritical) evaluationFactors.push('SYMPTOMS_NON_CRITICAL');
  if (noRulesMatched) evaluationFactors.push('NO_RULES_MATCHED');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 1: HEALTHY NDVI + MILD SYMPTOMS + NO RULES → NO INTERVENTION REQUIRED
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (ndviHealthy && symptomsNonCritical && noRulesMatched) {
    console.log(`  ✅ POSITIVE: diagnosis_type=NO_INTERVENTION_REQUIRED`);
    
    return {
      is_positive: true,
      diagnosis_type: 'NO_INTERVENTION_REQUIRED',
      confidence: 0.85,
      follow_up_days: calculateFollowUpDays(input.growth_stage),
      reason_code: 'HEALTHY_NDVI',
      i18n_key: 'diagnosis.positive.healthy_ndvi',
      recommendation_codes: ['CONTINUE_MONITORING', 'MAINTAIN_IRRIGATION', 'NO_TREATMENT'],
      metadata: {
        ndvi_healthy: ndviHealthy,
        symptoms_non_critical: symptomsNonCritical,
        no_rules_matched: noRulesMatched,
        evaluation_factors: evaluationFactors
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 2: EARLY STAGE ADJUSTMENT (DAS < 30 with mild symptoms)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (input.days_since_sowing !== null && 
      input.days_since_sowing < 30 && 
      symptomsNonCritical && 
      noRulesMatched) {
    console.log(`  ✅ POSITIVE: diagnosis_type=MONITOR_AND_WAIT (early_stage)`);
    
    return {
      is_positive: true,
      diagnosis_type: 'MONITOR_AND_WAIT',
      confidence: 0.78,
      follow_up_days: 7,
      reason_code: 'EARLY_STAGE_ADJUSTMENT',
      i18n_key: 'diagnosis.positive.early_stage',
      recommendation_codes: ['WAIT_7_DAYS', 'ENSURE_MOISTURE', 'AVOID_INTERVENTION', 'REPORT_IF_WORSE'],
      metadata: {
        ndvi_healthy: ndviHealthy,
        symptoms_non_critical: symptomsNonCritical,
        no_rules_matched: noRulesMatched,
        evaluation_factors: [...evaluationFactors, 'EARLY_DAS']
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 3: MILD SYMPTOMS WITH NORMAL GROWTH
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (symptomsNonCritical && input.symptoms_count <= 2 && noRulesMatched) {
    console.log(`  ✅ POSITIVE: diagnosis_type=MONITOR_AND_WAIT (mild_symptoms)`);
    
    return {
      is_positive: true,
      diagnosis_type: 'MONITOR_AND_WAIT',
      confidence: 0.72,
      follow_up_days: 5,
      reason_code: 'MILD_SYMPTOMS_NORMAL_GROWTH',
      i18n_key: 'diagnosis.positive.mild_symptoms',
      recommendation_codes: ['OBSERVE_5_DAYS', 'TAKE_PHOTOS', 'NO_SPRAY'],
      metadata: {
        ndvi_healthy: ndviHealthy,
        symptoms_non_critical: symptomsNonCritical,
        no_rules_matched: noRulesMatched,
        evaluation_factors: [...evaluationFactors, 'LOW_SYMPTOM_COUNT']
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CASE 4: NOT A POSITIVE CASE → NEEDS INVESTIGATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`  ⚠️ NOT positive - diagnosis_type=NEEDS_INVESTIGATION`);
  
  return {
    is_positive: false,
    diagnosis_type: 'NEEDS_INVESTIGATION',
    confidence: 0.50,
    follow_up_days: 3,
    reason_code: 'NEEDS_CLARIFICATION',
    i18n_key: 'diagnosis.needs_investigation',
    recommendation_codes: [],
    metadata: {
      ndvi_healthy: ndviHealthy,
      symptoms_non_critical: symptomsNonCritical,
      no_rules_matched: noRulesMatched,
      evaluation_factors: evaluationFactors
    }
  };
}

/**
 * Calculate appropriate follow-up days based on growth stage
 */
function calculateFollowUpDays(stage: string): number {
  const normalizedStage = stage.toUpperCase();
  
  // Early stages - more frequent monitoring
  if (['GERMINATION', 'SEEDLING'].includes(normalizedStage)) {
    return 5;
  }
  
  // Active growth - weekly monitoring
  if (['TILLERING', 'VEGETATIVE', 'GRAND_GROWTH'].includes(normalizedStage)) {
    return 7;
  }
  
  // Critical reproductive stages - careful monitoring
  if (['FLOWERING', 'FRUITING'].includes(normalizedStage)) {
    return 5;
  }
  
  // Late stages - can wait longer
  if (['MATURITY', 'HARVEST'].includes(normalizedStage)) {
    return 10;
  }
  
  return 7; // Default weekly check
}

// ═══════════════════════════════════════════════════════════════════════════
// I18N KEY REGISTRY - Maps reason codes to translation keys
// ═══════════════════════════════════════════════════════════════════════════

export const POSITIVE_DIAGNOSIS_I18N_KEYS: Record<PositiveReasonCode, string> = {
  'HEALTHY_NDVI': 'diagnosis.positive.healthy_ndvi',
  'MILD_SYMPTOMS_NORMAL_GROWTH': 'diagnosis.positive.mild_symptoms',
  'EARLY_STAGE_ADJUSTMENT': 'diagnosis.positive.early_stage',
  'NO_SPECIFIC_THREAT': 'diagnosis.positive.no_threat',
  'SEASONAL_VARIATION': 'diagnosis.positive.seasonal',
  'NEEDS_CLARIFICATION': 'diagnosis.needs_clarification'
};

/**
 * Get i18n key for a reason code
 */
export function getPositiveDiagnosisI18nKey(reasonCode: PositiveReasonCode): string {
  return POSITIVE_DIAGNOSIS_I18N_KEYS[reasonCode];
}
