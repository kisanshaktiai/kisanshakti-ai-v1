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
import { getCachedSynonymMap } from '../utils/crop-synonyms-cache.ts';

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
// STAGE RESOLUTION — DB SSOT
// ═══════════════════════════════════════════════════════════════════════════
// PR-3: The former in-file `ICAR_CROP_CALENDARS` table (8 crops × 4-6 stages)
// has been DELETED. It duplicated `public.crop_stage_master` (146+ curated
// rows across all supported crops), was drifting, and violated the SSOT
// invariant that no agronomic calendar may live outside the database.
// Stage lookup now goes through `StageKnowledgeCache.getStageByDAS()` —
// preloaded by the orchestrator at boot (idempotent, 10-minute TTL).
// If the cache misses, we surface `stage_source='DEFAULT'` with a
// `VEGETATIVE` fallback (a generic bucket, not per-crop agronomy) rather
// than re-inject a hardcoded table.

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
    
    // DB SSOT: crop_stage_master via StageKnowledgeCache (preloaded at
    // orchestrator boot). No hardcoded per-crop calendars live in this file.
    const crop = (cropCode || '').toLowerCase();
    if (!isStageKnowledgeLoaded()) {
      result.reconciled_stage = 'VEGETATIVE';
      result.stage_source = 'DEFAULT';
      result.warnings.push('Stage knowledge cache not loaded, defaulting to VEGETATIVE');
      result.gates_passed.push('G2_STAGE_DETERMINISM');
      return;
    }

    const stageRow = getStageByDAS(crop, daysSinceSowing);
    if (stageRow?.growth_stage) {
      result.reconciled_stage = stageRow.growth_stage.toUpperCase();
      result.stage_source = 'CONFIRMED';
      result.gates_passed.push('G2_STAGE_DETERMINISM');
      console.log(`   Stage: ${result.reconciled_stage} (${daysSinceSowing} DAS, crop_stage_master)`);
      return;
    }

    // Cache miss for this (crop, DAS) — do NOT reintroduce a hardcoded
    // per-crop table. Fall back to generic VEGETATIVE with a warning so the
    // downstream pipeline continues without blocking on missing DB curation.
    result.reconciled_stage = 'VEGETATIVE';
    result.stage_source = 'DEFAULT';
    result.warnings.push(`No crop_stage_master row for crop=${crop} DAS=${daysSinceSowing}; defaulting to VEGETATIVE`);
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
   * Normalize crop name for comparison.
   *
   * PR-3: The former hardcoded multilingual regex (sugarcane/wheat/rice/…)
   * has been DELETED. Resolution now flows through the DB-loaded synonym
   * cache (`public.crop_synonyms`, 200+ curated variants across 8 languages)
   * plus a fall-through to the lowercased trim of the input. No agronomic
   * or linguistic table lives in this file.
   */
  private normalizeCrop(crop: string): string {
    const raw = (crop || '').toLowerCase().trim();
    if (!raw) return raw;
    const canonical = getCachedSynonymMap().get(raw);
    return canonical ? String(canonical).toLowerCase() : raw;
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
