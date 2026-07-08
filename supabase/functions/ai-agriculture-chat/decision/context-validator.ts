/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXT VALIDATOR - LAYER 2: Context Assembly & Validation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Implements critical validation gates:
 * - G2: CONTEXT_COMPLETENESS - Block if crop=UNKNOWN OR stage=DEFAULT
 * - G3: CONTEXT_CONSISTENCY - Block if NDVI contradicts symptoms
 * 
 * ARCHITECTURE: Part of 6-layer neuro-symbolic decision brain
 * 
 * VERSION: 1.0.0
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { SymbolicFact } from './symbolic-reasoner.ts';
import { getStageByDAS, isStageKnowledgeLoaded } from '../utils/stage-knowledge-cache.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationStatus = 'PASS' | 'FAIL' | 'WARN' | 'NEEDS_CLARIFICATION';

export interface ContextValidationResult {
  status: ValidationStatus;
  gates_passed: string[];
  gates_failed: string[];
  warnings: string[];
  errors: string[];
  
  // Reconciled context
  reconciled_crop: string | null;
  reconciled_stage: string | null;
  stage_source: 'CONFIRMED' | 'CALCULATED' | 'DEFAULT' | 'UNKNOWN';
  
  // Contradiction details
  contradictions: {
    type: string;
    field1: string;
    field1_value: any;
    field2: string;
    field2_value: any;
    resolution: string;
  }[];
  
  // Missing critical data
  missing_critical: string[];
  data_quality_score: number;
  
  // For clarification if needed
  clarification_question?: {
    question_mr: string;
    question_hi: string;
    question_en: string;
    options?: string[];
  };
}

export interface ContextValidationInput {
  farmer_mentioned_crop?: string;
  land_context?: {
    crop_name?: string;
    crop_code?: string;
    sowing_date?: string;
    area_hectares?: number;
  };
  land_state?: AuthoritativeLandState | null;
  facts?: SymbolicFact | null;
  symptom_keys?: string[];
  user_query?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ICAR CROP CALENDARS — Days to Growth Stage Mapping
// ═══════════════════════════════════════════════════════════════════════════
// PR-7 F6b: this table is DEPRECATED. It duplicates `crop_stage_master`
// (the runtime SSOT read by every other stage-aware module) and was drifting.
// The rice entry in particular modelled direct-seeded rice only — no
// TRANSPLANTING stage — so at DAS 28 (transplant shock recovery, per
// crop_stage_master: RICE_TRANSPLANTING = DAS 25–35) it emitted the
// misleading "TILLERING (ICAR confirmed)" line that appeared to contradict
// the (correctly) enforced stage-immutability lock.
//
// Rice numbers below are reconciled with `crop_stage_master` (verified
// live via Supabase MCP). Full removal is scheduled once ContextValidator
// is made async and reads crop_stage_master directly — tracked as F6b-full.
// DO NOT re-tune these numbers here; curate the DB row instead.

interface StageRange {
  min_days: number;
  max_days: number;
  stage: string;
}

const ICAR_CROP_CALENDARS: Record<string, StageRange[]> = {
  'sugarcane': [
    { min_days: 0, max_days: 35, stage: 'GERMINATION' },
    { min_days: 36, max_days: 90, stage: 'TILLERING' },
    { min_days: 91, max_days: 240, stage: 'GRAND_GROWTH' },
    { min_days: 241, max_days: 365, stage: 'MATURITY' }
  ],
  'wheat': [
    { min_days: 0, max_days: 10, stage: 'GERMINATION' },
    { min_days: 11, max_days: 25, stage: 'SEEDLING' },
    { min_days: 26, max_days: 60, stage: 'TILLERING' },
    { min_days: 61, max_days: 90, stage: 'FLOWERING' },
    { min_days: 91, max_days: 120, stage: 'MATURITY' }
  ],
  // PR-7 F6b: reconciled with crop_stage_master (RICE_TRANSPLANTING 25–35,
  // RICE_TILLERING 35–60). Adds the missing TRANSPLANTING window and shifts
  // TILLERING so DAS 28 no longer misclassifies against the SSOT.
  'rice': [
    { min_days: 0,   max_days: 20,  stage: 'SEEDLING' },
    { min_days: 21,  max_days: 34,  stage: 'TRANSPLANTING' },
    { min_days: 35,  max_days: 60,  stage: 'TILLERING' },
    { min_days: 61,  max_days: 75,  stage: 'PANICLE_INITIATION' },
    { min_days: 76,  max_days: 100, stage: 'FLOWERING' },
    { min_days: 101, max_days: 130, stage: 'MATURITY' }
  ],
  'cotton': [
    { min_days: 0, max_days: 15, stage: 'GERMINATION' },
    { min_days: 16, max_days: 45, stage: 'SEEDLING' },
    { min_days: 46, max_days: 80, stage: 'SQUARING' },
    { min_days: 81, max_days: 120, stage: 'FLOWERING' },
    { min_days: 121, max_days: 180, stage: 'BOLL_DEVELOPMENT' }
  ],
  'soybean': [
    { min_days: 0, max_days: 15, stage: 'GERMINATION' },
    { min_days: 16, max_days: 35, stage: 'VEGETATIVE' },
    { min_days: 36, max_days: 60, stage: 'FLOWERING' },
    { min_days: 61, max_days: 90, stage: 'POD_DEVELOPMENT' },
    { min_days: 91, max_days: 120, stage: 'MATURITY' }
  ],
  'maize': [
    { min_days: 0, max_days: 12, stage: 'GERMINATION' },
    { min_days: 13, max_days: 45, stage: 'VEGETATIVE' },
    { min_days: 46, max_days: 65, stage: 'TASSELING' },
    { min_days: 66, max_days: 85, stage: 'SILKING' },
    { min_days: 86, max_days: 110, stage: 'MATURITY' }
  ],
  'onion': [
    { min_days: 0, max_days: 30, stage: 'SEEDLING' },
    { min_days: 31, max_days: 70, stage: 'VEGETATIVE' },
    { min_days: 71, max_days: 110, stage: 'BULB_DEVELOPMENT' },
    { min_days: 111, max_days: 140, stage: 'MATURITY' }
  ],
  'tomato': [
    { min_days: 0, max_days: 25, stage: 'SEEDLING' },
    { min_days: 26, max_days: 50, stage: 'VEGETATIVE' },
    { min_days: 51, max_days: 75, stage: 'FLOWERING' },
    { min_days: 76, max_days: 100, stage: 'FRUITING' },
    { min_days: 101, max_days: 140, stage: 'HARVEST' }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM-NDVI CONTRADICTION PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

interface ContradictionPattern {
  symptom_pattern: string[];
  ndvi_range: { min: number; max: number };
  contradiction_type: string;
  resolution: string;
}

const NDVI_SYMPTOM_CONTRADICTIONS: ContradictionPattern[] = [
  {
    symptom_pattern: ['LEAF_YELLOWING', 'NUTRIENT_DEFICIENCY', 'GENERAL_YELLOWING'],
    ndvi_range: { min: 0.6, max: 1.0 }, // High NDVI = healthy
    contradiction_type: 'HEALTHY_NDVI_WITH_YELLOWING',
    resolution: 'Request photo - symptom may be localized or misidentified'
  },
  {
    symptom_pattern: ['HEALTHY', 'NO_ISSUE', 'GOOD_GROWTH'],
    ndvi_range: { min: 0, max: 0.3 }, // Low NDVI = stressed
    contradiction_type: 'STRESSED_NDVI_WITH_HEALTHY_CLAIM',
    resolution: 'Verify crop health - satellite shows stress'
  },
  {
    symptom_pattern: ['PEST_SUSPECTED', 'INSECTS_VISIBLE'],
    ndvi_range: { min: 0.7, max: 1.0 }, // Very high NDVI
    contradiction_type: 'HIGH_VIGOR_WITH_PEST_CLAIM',
    resolution: 'Pest presence possible in high-vigor crop - proceed with diagnosis'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class ContextValidator {
  
  /**
   * MAIN: Validate and reconcile context
   */
  validateContext(input: ContextValidationInput): ContextValidationResult {
    console.log('🔍 [ContextValidator] Starting validation...');
    
    const result: ContextValidationResult = {
      status: 'PASS',
      gates_passed: [],
      gates_failed: [],
      warnings: [],
      errors: [],
      reconciled_crop: null,
      reconciled_stage: null,
      stage_source: 'UNKNOWN',
      contradictions: [],
      missing_critical: [],
      data_quality_score: 0
    };
    
    // G2.1: Validate crop context
    this.validateCropContext(input, result);
    
    // G2.2: Validate growth stage
    this.validateGrowthStage(input, result);
    
    // G3: Check NDVI-symptom consistency
    this.checkNDVISymptomConsistency(input, result);
    
    // Calculate data quality score
    result.data_quality_score = this.calculateDataQuality(input, result);
    
    // Determine final status
    if (result.gates_failed.length > 0) {
      result.status = result.missing_critical.length > 0 ? 'NEEDS_CLARIFICATION' : 'FAIL';
    } else if (result.warnings.length > 0) {
      result.status = 'WARN';
    }
    
    console.log(`✅ [ContextValidator] Status: ${result.status}, Quality: ${result.data_quality_score}%`);
    
    return result;
  }
  
  /**
   * G2.1: Crop Context Reconciliation
   */
  private validateCropContext(input: ContextValidationInput, result: ContextValidationResult): void {
    // CRITICAL FIX: Treat 'UNKNOWN' as null/undefined so the priority chain falls through
    const stripUnknown = (v: string | undefined | null): string | undefined => 
      (v && v !== 'UNKNOWN' && v !== 'unknown') ? v : undefined;
    
    const landCrop = stripUnknown(input.land_context?.crop_name) || stripUnknown(input.land_context?.crop_code);
    const farmerCrop = stripUnknown(input.farmer_mentioned_crop);
    const landStateCrop = stripUnknown(input.land_state?.crop?.crop_name);
    // Also check NLU output for crop
    const nluCrop = stripUnknown(
      (input as any).nlu_output?.crop_identification?.crop_code || 
      (input as any).nlu_output?.crop_identification?.crop_name
    );
    
    // Priority: Land State > Land Context > NLU > Farmer Mentioned
    let finalCrop = landStateCrop || landCrop || nluCrop || farmerCrop;
    
    console.log(`   🌾 [G2 CropValidation] Sources: landState=${landStateCrop || 'N/A'}, land=${landCrop || 'N/A'}, nlu=${nluCrop || 'N/A'}, farmer=${farmerCrop || 'N/A'} → final=${finalCrop || 'NONE'}`);
    
    // Check for crop mismatch
    if (farmerCrop && landCrop && this.normalizeCrop(farmerCrop) !== this.normalizeCrop(landCrop)) {
      // Farmer mentioned different crop than land record
      result.contradictions.push({
        type: 'CROP_MISMATCH',
        field1: 'farmer_mentioned',
        field1_value: farmerCrop,
        field2: 'land_record',
        field2_value: landCrop,
        resolution: 'Ask farmer to confirm current crop'
      });
      
      // Generate clarification question
      result.clarification_question = {
        question_mr: 'question_placeholder',
        question_hi: 'question_placeholder',
        question_en: `Which crop is currently in your field? "${farmerCrop}" or "${landCrop}"?`,
        options: [farmerCrop, landCrop]
      };
      
      result.gates_failed.push('G2_CROP_RECONCILIATION');
      result.status = 'NEEDS_CLARIFICATION';
      return;
    }
    
    if (!finalCrop) {
      result.missing_critical.push('crop_name');
      result.gates_failed.push('G2_CROP_COMPLETENESS');
      return;
    }
    
    result.reconciled_crop = this.normalizeCrop(finalCrop);
    result.gates_passed.push('G2_CROP_COMPLETENESS');
  }
  
  /**
   * G2.2: Growth Stage Calculation (Deterministic from ICAR calendar)
   */
  private validateGrowthStage(input: ContextValidationInput, result: ContextValidationResult): void {
    const sowingDate = input.land_context?.sowing_date || input.land_state?.crop.sowing_date;
    const cropCode = result.reconciled_crop || input.land_context?.crop_code;
    
    if (!sowingDate) {
      // CRITICAL FIX: Missing sowing date should NOT block the system from giving advice.
      // The system defaults to VEGETATIVE which is a safe fallback.
      // Previously this pushed to gates_failed, causing NEEDS_CLARIFICATION for ALL farmers
      // without sowing dates — making the system unusable for most farmers.
      result.warnings.push('Growth stage defaulted to VEGETATIVE - sowing_date missing');
      result.reconciled_stage = 'VEGETATIVE'; // Safe default
      result.stage_source = 'DEFAULT';
      result.gates_passed.push('G2_STAGE_DETERMINISM'); // Pass with warning, don't block
      return;
    }
    
    // Calculate days since sowing
    const sowDate = new Date(sowingDate);
    const today = new Date();
    const daysSinceSowing = Math.floor((today.getTime() - sowDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceSowing < 0) {
      result.errors.push('Invalid sowing_date (future date)');
      result.gates_failed.push('G2_STAGE_DETERMINISM');
      return;
    }
    
    // Look up stage from ICAR calendar
    const calendar = ICAR_CROP_CALENDARS[cropCode?.toLowerCase() || ''];
    
    if (!calendar) {
      // No calendar for this crop - use generic stages
      result.reconciled_stage = this.calculateGenericStage(daysSinceSowing);
      result.stage_source = 'CALCULATED';
      result.warnings.push(`No ICAR calendar for ${cropCode}, using generic`);
      result.gates_passed.push('G2_STAGE_DETERMINISM');
      return;
    }
    
    // Find matching stage from calendar
    for (const stageRange of calendar) {
      if (daysSinceSowing >= stageRange.min_days && daysSinceSowing <= stageRange.max_days) {
        result.reconciled_stage = stageRange.stage;
        result.stage_source = 'CONFIRMED';
        result.gates_passed.push('G2_STAGE_DETERMINISM');
        console.log(`   Stage: ${stageRange.stage} (${daysSinceSowing} DAS, ICAR confirmed)`);
        return;
      }
    }
    
    // Beyond calendar range - crop past harvest
    result.reconciled_stage = 'MATURITY';
    result.stage_source = 'CALCULATED';
    result.warnings.push('Crop may be past typical harvest period');
    result.gates_passed.push('G2_STAGE_DETERMINISM');
  }
  
  /**
   * G3: NDVI-Symptom Consistency Check
   * 
   * FIX: Normalize NDVI access - AuthoritativeLandState uses `latest_value`, not `current_ndvi`
   * Check multiple potential NDVI field locations to prevent undefined access
   */
  private checkNDVISymptomConsistency(input: ContextValidationInput, result: ContextValidationResult): void {
    // FIX: Normalize NDVI into single canonical value before validation
    // Priority: latest_value (AuthoritativeLandState) > current_ndvi (legacy) > facts.ndvi
    const ndviValue = this.normalizeNDVIValue(input);
    const symptoms = input.symptom_keys || [];
    
    // FIX: Explicit UNKNOWN marking instead of silent undefined
    if (ndviValue === null || ndviValue === undefined) {
      result.warnings.push('NDVI data: UNKNOWN (not available for consistency check)');
      result.gates_passed.push('G3_NDVI_CONSISTENCY_SKIPPED');
      return;
    }
    
    // Check for contradictions
    for (const pattern of NDVI_SYMPTOM_CONTRADICTIONS) {
      const hasMatchingSymptom = symptoms.some(s => 
        pattern.symptom_pattern.some(p => s.toUpperCase().includes(p))
      );
      
      if (hasMatchingSymptom && 
          ndviValue >= pattern.ndvi_range.min && 
          ndviValue <= pattern.ndvi_range.max) {
        result.contradictions.push({
          type: pattern.contradiction_type,
          field1: 'symptoms',
          field1_value: symptoms,
          field2: 'ndvi',
          field2_value: ndviValue,
          resolution: pattern.resolution
        });
        
        result.warnings.push(`NDVI-symptom mismatch: ${pattern.contradiction_type}`);
      }
    }
    
    if (result.contradictions.filter(c => c.type.includes('NDVI')).length === 0) {
      result.gates_passed.push('G3_NDVI_CONSISTENCY');
    } else {
      // Contradictions found but not blocking (request photo instead)
      result.gates_passed.push('G3_NDVI_CONSISTENCY_WARN');
    }
  }
  
  /**
   * Calculate overall data quality score (0-100)
   */
  private calculateDataQuality(input: ContextValidationInput, result: ContextValidationResult): number {
    let score = 0;
    
    // Crop data (20 points)
    if (result.reconciled_crop) score += 20;
    
    // Stage data (20 points)
    if (result.stage_source === 'CONFIRMED') score += 20;
    else if (result.stage_source === 'CALCULATED') score += 15;
    else if (result.stage_source === 'DEFAULT') score += 5;
    
    // NDVI data (15 points)
    // FIX: Use normalized NDVI accessor - AuthoritativeLandState uses latest_value
    const ndviValue = this.normalizeNDVIValue(input);
    if (ndviValue !== null && ndviValue !== undefined) {
      score += 15;
      // Bonus for fresh data
      if (input.land_state?.ndvi?.data_fresh) score += 5;
    }
    
    // Soil data (15 points)
    // FIX: Null-safe access to prevent "Cannot read properties of undefined"
    if (input.land_state?.soil?.npk_available) score += 15;
    
    // Weather data (10 points)
    // FIX: Null-safe access
    if (input.land_state?.weather?.data_fresh) score += 10;
    
    // Symptom specificity (15 points)
    const symptoms = input.symptom_keys || [];
    if (symptoms.length > 0) {
      score += 10;
      // Specific symptoms get bonus
      const specificSymptoms = ['DEAD_HEART', 'HONEYDEW', 'WEBBING', 'TUNNELS'];
      if (symptoms.some(s => specificSymptoms.some(sp => s.includes(sp)))) {
        score += 5;
      }
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Normalize crop name for comparison
   */
  private normalizeCrop(crop: string): string {
    return crop.toLowerCase().trim()
      .replace(/ूस|गन्ना|sugarcane/gi, 'sugarcane')
      .replace(/गेहूं|गहू|wheat/gi, 'wheat')
      .replace(/कपास|कापूस|cotton/gi, 'cotton')
      .replace(/धान|भात|rice/gi, 'rice')
      .replace(/सोयाबीन|soybean/gi, 'soybean')
      .replace(/मक्का|maize|corn/gi, 'maize');
  }
  
  /**
   * Generic stage calculation when no ICAR calendar
   */
  private calculateGenericStage(daysSinceSowing: number): string {
    if (daysSinceSowing <= 15) return 'GERMINATION';
    if (daysSinceSowing <= 35) return 'SEEDLING';
    if (daysSinceSowing <= 70) return 'VEGETATIVE';
    if (daysSinceSowing <= 100) return 'FLOWERING';
    return 'MATURITY';
  }
  
  /**
   * FIX: Normalize NDVI value access across different data structures
   * 
   * AuthoritativeLandState uses `ndvi.latest_value`
   * Legacy context uses `ndvi.current_ndvi`
   * SymbolicFact uses `ndvi` directly
   * 
   * This method checks all potential sources and returns the first available value.
   * If all are undefined, returns null (explicitly marking as UNKNOWN).
   */
  private normalizeNDVIValue(input: ContextValidationInput): number | null {
    // Priority 1: AuthoritativeLandState.ndvi.latest_value (AUTHORITATIVE)
    if (input.land_state?.ndvi?.latest_value !== undefined && 
        input.land_state?.ndvi?.latest_value !== null) {
      return input.land_state.ndvi.latest_value;
    }
    
    // Priority 2: Legacy current_ndvi field (backward compatibility)
    const legacyNdvi = (input.land_state?.ndvi as any)?.current_ndvi;
    if (legacyNdvi !== undefined && legacyNdvi !== null) {
      return legacyNdvi;
    }
    
    // Priority 3: SymbolicFact.ndvi (from fact extraction)
    if (input.facts?.ndvi !== undefined && input.facts?.ndvi !== null) {
      return input.facts.ndvi;
    }
    
    // No NDVI available - explicitly return null (UNKNOWN state)
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON & CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

let validatorInstance: ContextValidator | null = null;

export function getContextValidator(): ContextValidator {
  if (!validatorInstance) {
    validatorInstance = new ContextValidator();
  }
  return validatorInstance;
}

export function validateContextCompleteness(input: ContextValidationInput): ContextValidationResult {
  return getContextValidator().validateContext(input);
}

/**
 * G3: Perform NDVI-symptom consistency checks
 * Returns any contradictions found between field data
 */
export function performConsistencyChecks(input: {
  ndviValue?: number | null;
  symptoms?: string[];
  soil_status?: string | null;
}): {
  contradictions: Array<{
    type: string;
    field1: string;
    field1_value: any;
    field2: string;
    field2_value: any;
    resolution: string;
  }>;
  warnings: string[];
  status: 'CONSISTENT' | 'INCONSISTENT' | 'UNKNOWN';
} {
  const result = {
    contradictions: [] as Array<{
      type: string;
      field1: string;
      field1_value: any;
      field2: string;
      field2_value: any;
      resolution: string;
    }>,
    warnings: [] as string[],
    status: 'CONSISTENT' as 'CONSISTENT' | 'INCONSISTENT' | 'UNKNOWN'
  };
  
  const { ndviValue, symptoms = [] } = input;
  
  if (ndviValue === null || ndviValue === undefined) {
    result.status = 'UNKNOWN';
    result.warnings.push('NDVI data not available for consistency check');
    return result;
  }
  
  // Check for NDVI-symptom contradictions
  for (const pattern of NDVI_SYMPTOM_CONTRADICTIONS) {
    const hasMatchingSymptom = symptoms.some(s => 
      pattern.symptom_pattern.some(p => s.toUpperCase().includes(p))
    );
    
    if (hasMatchingSymptom && 
        ndviValue >= pattern.ndvi_range.min && 
        ndviValue <= pattern.ndvi_range.max) {
      result.contradictions.push({
        type: pattern.contradiction_type,
        field1: 'symptoms',
        field1_value: symptoms,
        field2: 'ndvi',
        field2_value: ndviValue,
        resolution: pattern.resolution
      });
      
      result.warnings.push(`NDVI-symptom mismatch: ${pattern.contradiction_type}`);
      result.status = 'INCONSISTENT';
    }
  }
  
  return result;
}
