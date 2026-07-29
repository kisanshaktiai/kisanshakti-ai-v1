// CONTEXT VALIDATOR - LAYER 2: Context Assembly & Validation

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import type { SymbolicFact } from './symbolic-reasoner.ts';
import type { BiologicalState } from '../agents/biological-state.ts';
// PR-4c: getStageByDAS import DELETED. Stage is consumed from
import { getCachedSynonymMap } from '../utils/crop-synonyms-cache.ts';

// TYPE DEFINITIONS

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
  stage_source: 'LOCKED' | 'CONFIRMED' | 'CALCULATED' | 'DEFAULT' | 'UNKNOWN';
  
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
  // Backward-compatible aliases consumed by older orchestrator call sites.
  clarification_prompt?: string;
  clarification_options?: Array<{ label: string; observation_key?: string }>;
}

export interface ContextValidationInput {
  farmer_mentioned_crop?: string | null;
  land_context?: {
    crop_name?: string;
    crop_code?: string;
    sowing_date?: string;
    area_hectares?: number;
  };
  land_state?: AuthoritativeLandState | null;
  biological_state?: BiologicalState | null;
  facts?: SymbolicFact | null;
  symptom_keys?: string[];
  user_query?: string;
}

// STAGE RESOLUTION — DB SSOT

// SYMPTOM-NDVI CONTRADICTION PATTERNS

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

// MAIN VALIDATION CLASS

export class ContextValidator {
  
  // MAIN: Validate and reconcile context
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

    if (result.clarification_question) {
      result.clarification_prompt =
        result.clarification_question.question_en ||
        result.clarification_question.question_mr ||
        result.clarification_question.question_hi;
      result.clarification_options = (result.clarification_question.options || []).map((label) => ({
        label,
        observation_key: label,
      }));
    }
    
    console.log(`✅ [ContextValidator] Status: ${result.status}, Quality: ${result.data_quality_score}%`);
    
    return result;
  }
  
  // G2.1: Crop Context Reconciliation
  private validateCropContext(input: ContextValidationInput, result: ContextValidationResult): void {
    // CRITICAL FIX: Treat 'UNKNOWN' as null/undefined so the priority chain falls through
    const stripUnknown = (v: string | undefined | null): string | undefined => 
      (v && v !== 'UNKNOWN' && v !== 'unknown') ? v : undefined;
    
    const landCrop = stripUnknown(input.land_context?.crop_name) || stripUnknown(input.land_context?.crop_code);
    const farmerCrop = stripUnknown(input.farmer_mentioned_crop);
    const landStateCrop =
      stripUnknown(input.land_state?.crop?.current_crop) ||
      stripUnknown(input.land_state?.crop?.crop_code);
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
  
  // G2.2: Growth Stage Consumption (PR-4c — READ-ONLY from BiologicalState SSOT)
  private validateGrowthStage(input: ContextValidationInput, result: ContextValidationResult): void {
    const bioState: BiologicalState | null =
      input.biological_state ?? ((input.land_state as any)?.biological_state as BiologicalState | null) ?? null;
    const bioStage: string | null =
      bioState?.is_locked && bioState?.growth_stage ? String(bioState.growth_stage) : null;
    const loaderStage: string | null =
      input.land_state?.crop?.growth_stage ? String(input.land_state.crop.growth_stage) : null;

    if (bioStage) {
      result.reconciled_stage = bioStage.toUpperCase();
      result.stage_source = 'LOCKED';
      result.gates_passed.push('G2_STAGE_DETERMINISM');
      console.log(
        `   Stage: ${result.reconciled_stage} (source=BIOLOGICAL_STATE, ` +
        `resolver=${bioState?.resolver_version ?? 'n/a'}, conf=${bioState?.confidence ?? 'n/a'})`
      );
      return;
    }

    if (loaderStage) {
      result.reconciled_stage = loaderStage.toUpperCase();
      result.stage_source = 'CONFIRMED';
      result.gates_passed.push('G2_STAGE_DETERMINISM');
      console.log(`   Stage: ${result.reconciled_stage} (source=LAND_STATE_CROP)`);
      return;
    }

    // No authoritative stage available. Do NOT invent one — downstream must
    // either request clarification or proceed stage-agnostic.
    result.reconciled_stage = null;
    result.stage_source = 'UNKNOWN';
    result.warnings.push(
      'Growth stage UNKNOWN — resolve_crop_phenology returned no row and no biological_state is locked'
    );
    result.gates_passed.push('G2_STAGE_DETERMINISM');
  }
  
  // G3: NDVI-Symptom Consistency Check
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
  
  // Calculate overall data quality score (0-100)
  private calculateDataQuality(input: ContextValidationInput, result: ContextValidationResult): number {
    let score = 0;
    
    // Crop data (20 points)
    if (result.reconciled_crop) score += 20;
    
    // Stage data (20 points)
    if (result.stage_source === 'LOCKED') score += 20;
    else if (result.stage_source === 'CONFIRMED') score += 20;
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
    // AuthoritativeLandState exposes raw soil values, not legacy `npk_available`.
    const soil = input.land_state?.soil;
    if (soil && (
      soil.nitrogen_kg_per_ha !== null ||
      soil.phosphorus_kg_per_ha !== null ||
      soil.potassium_kg_per_ha !== null ||
      soil.ph !== null ||
      soil.texture !== null
    )) {
      score += 15;
    }
    
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
  
  // Normalize crop name for comparison.
  private normalizeCrop(crop: string): string {
    const raw = (crop || '').toLowerCase().trim();
    if (!raw) return raw;
    const canonical = getCachedSynonymMap().get(raw);
    return canonical ? String(canonical).toLowerCase() : raw;
  }
  
  // FIX: Normalize NDVI value access across different data structures
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

// SINGLETON & CONVENIENCE FUNCTIONS

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

// G3: Perform NDVI-symptom consistency checks
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
