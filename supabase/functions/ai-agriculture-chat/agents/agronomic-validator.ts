/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRONOMIC VALIDATOR - Scientific Accuracy Validation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PART 4 of KisanShakti comprehensive fix:
 * - Pest biology-based application method validation
 * - Growth stage plausibility checks
 * - Product detail completion with IPM defaults
 * - Pre-send validation gates
 * 
 * VERSION: 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// PEST BIOLOGY DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_BIOLOGY = {
  // Boring/Internal Pests (attack inside stems/fruits) - FOLIAR SPRAY WON'T WORK
  BORING_PESTS: [
    'SHOOT_BORER', 'STEM_BORER', 'FRUIT_BORER', 'POD_BORER', 
    'INTERNODE_BORER', 'TOP_BORER', 'ROOT_BORER', 'PINK_BOLLWORM',
    'BOLLWORM', 'GIRDLE_BEETLE'
  ],
  
  // Sucking Pests (feed on plant surface) - FOLIAR SPRAY EFFECTIVE
  SUCKING_PESTS: [
    'APHID', 'WHITEFLY', 'JASSID', 'THRIPS', 'MEALYBUG',
    'MITES', 'SCALE_INSECT', 'LEAFHOPPERS', 'BPH', 'BROWN_PLANTHOPPER'
  ],
  
  // Chewing Pests (eat leaves/parts) - FOLIAR SPRAY EFFECTIVE
  CHEWING_PESTS: [
    'CATERPILLAR', 'BEETLE', 'GRASSHOPPER', 'ARMYWORM', 
    'CUTWORM', 'LEAF_ROLLER', 'LEAF_MINER', 'WEEVIL'
  ]
};

// Allowed application methods by pest biology
export const ALLOWED_METHODS_BY_BIOLOGY: Record<string, string[]> = {
  BORING_PESTS: [
    'SOIL_APPLICATION', 
    'GRANULAR_APPLICATION', 
    'WHORL_APPLICATION', 
    'STEM_INJECTION',
    'SOIL_DRENCH',
    'BASAL_APPLICATION'
  ],
  SUCKING_PESTS: [
    'FOLIAR_SPRAY', 
    'SYSTEMIC_SPRAY',
    'CONTACT_SPRAY',
    'MIST_SPRAY'
  ],
  CHEWING_PESTS: [
    'FOLIAR_SPRAY', 
    'DUST_APPLICATION', 
    'BAIT',
    'CONTACT_SPRAY'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// IPM DEFAULT PRODUCTS - DB-DRIVEN LOOKUP
// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 FIX: Removed hardcoded IPM_DEFAULTS dictionary.
// Product recommendations MUST come from decision_rules table via the
// symbolic rule engine. The validator now only validates pest biology
// compatibility (boring vs sucking vs chewing) without injecting products.
// If the rule engine returns no product, the system asks for clarification
// rather than inventing recommendations from hardcoded data.
// ═══════════════════════════════════════════════════════════════════════════

// Legacy compatibility: empty object so existing references don't crash
export const IPM_DEFAULTS: Record<string, any> = {};
// NOTE: All product recommendations now come exclusively from decision_rules table

// ═══════════════════════════════════════════════════════════════════════════
// PEST-STAGE COMPATIBILITY MATRIX
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_STAGE_COMPATIBILITY: Record<string, {
  likely_stages: string[];
  unlikely_stages: string[];
  impossible_stages: string[];
}> = {
  SHOOT_BORER: {
    likely_stages: ['TILLERING', 'EARLY_GROWTH', 'VEGETATIVE', 'GRAND_GROWTH'],
    unlikely_stages: ['GERMINATION'],  // 0-30 days - too early
    impossible_stages: ['MATURITY', 'HARVEST', 'POST_HARVEST']
  },
  STEM_BORER: {
    likely_stages: ['VEGETATIVE', 'REPRODUCTIVE', 'GRAND_GROWTH'],
    unlikely_stages: ['GERMINATION', 'EMERGENCE'],
    impossible_stages: ['POST_HARVEST']
  },
  BOLLWORM: {
    likely_stages: ['FLOWERING', 'FRUITING', 'BOLL_FORMATION'],
    unlikely_stages: ['GERMINATION', 'VEGETATIVE'],
    impossible_stages: ['SEEDLING']
  },
  WHITEFLY: {
    likely_stages: ['VEGETATIVE', 'FLOWERING', 'FRUITING'],
    unlikely_stages: [],
    impossible_stages: ['POST_HARVEST']
  },
  APHID: {
    likely_stages: ['SEEDLING', 'VEGETATIVE', 'FLOWERING'],
    unlikely_stages: [],
    impossible_stages: ['POST_HARVEST']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface AgronomicValidationResult {
  is_valid: boolean;
  errors: AgronomicError[];
  warnings: AgronomicWarning[];
  corrections_applied: AgronomicCorrection[];
  confidence_adjustment: number;  // -1.0 to +0.0 (can only reduce confidence)
}

export interface AgronomicError {
  code: string;
  message_en: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  field: string;
  original_value: string;
  reason: string;
}

export interface AgronomicWarning {
  code: string;
  message_en: string;
  field: string;
  suggestion: string;
}

export interface AgronomicCorrection {
  field: string;
  original_value: string;
  corrected_value: string;
  reason: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function validateAgronomicAccuracy(
  recommendation: {
    pest_code?: string;
    disease_code?: string;
    product_name?: string;
    dosage?: string;
    application_method?: string;
    crop_code?: string;
    crop_stage?: string;
    ipm_level?: number;
  }
): AgronomicValidationResult {
  const errors: AgronomicError[] = [];
  const warnings: AgronomicWarning[] = [];
  const corrections: AgronomicCorrection[] = [];
  let confidenceAdjustment = 0;
  
  console.log(`🔬 [AgronomicValidator] Validating recommendation...`);
  console.log(`   Pest: ${recommendation.pest_code || 'None'}`);
  console.log(`   Method: ${recommendation.application_method || 'None'}`);
  console.log(`   Stage: ${recommendation.crop_stage || 'Unknown'}`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION 1: Pest Biology vs Application Method
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (recommendation.pest_code && recommendation.application_method) {
    const pestCode = recommendation.pest_code.toUpperCase();
    const method = recommendation.application_method.toUpperCase();
    
    // Check if it's a boring pest
    if (PEST_BIOLOGY.BORING_PESTS.includes(pestCode)) {
      // Check if method is foliar spray (WRONG for boring pests)
      if (method.includes('FOLIAR') || method.includes('SPRAY')) {
        // This is an agronomic ERROR - foliar won't reach boring pests
        errors.push({
          code: 'PEST_METHOD_MISMATCH',
          message_en: `Foliar spray is ineffective for ${pestCode} (a boring pest). Use soil/granular application.`,
          severity: 'CRITICAL',
          field: 'application_method',
          original_value: method,
          reason: 'Boring pests live inside stems/fruits where foliar spray cannot reach'
        });
        
        // Auto-correct to proper method
        const correctedMethod = 'SOIL_APPLICATION';
        corrections.push({
          field: 'application_method',
          original_value: method,
          corrected_value: correctedMethod,
          reason: 'Changed to soil application for boring pest'
        });
        
        confidenceAdjustment -= 0.2;
        console.log(`   ⚠️ CORRECTED: ${method} → ${correctedMethod} for boring pest`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION 2: Growth Stage Plausibility
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (recommendation.pest_code && recommendation.crop_stage) {
    const pestCode = recommendation.pest_code.toUpperCase();
    const stage = recommendation.crop_stage.toUpperCase();
    const compatibility = PEST_STAGE_COMPATIBILITY[pestCode];
    
    if (compatibility) {
      if (compatibility.impossible_stages.includes(stage)) {
        errors.push({
          code: 'PEST_STAGE_IMPOSSIBLE',
          message_en: `${pestCode} cannot occur during ${stage} stage. Please verify diagnosis.`,
          severity: 'HIGH',
          field: 'pest_stage_combination',
          original_value: `${pestCode}@${stage}`,
          reason: 'Pest biology does not match crop stage'
        });
        confidenceAdjustment -= 0.3;
      } else if (compatibility.unlikely_stages.includes(stage)) {
        warnings.push({
          code: 'PEST_STAGE_UNLIKELY',
          message_en: `${pestCode} is unusual at ${stage} stage. Please confirm with photo.`,
          field: 'pest_stage_combination',
          suggestion: 'Request photo for confirmation'
        });
        confidenceAdjustment -= 0.15;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION 3: Product Detail Completion
  // ═══════════════════════════════════════════════════════════════════════════
  
  // VALIDATION 3: Product Detail Completion
  // PHASE 1 FIX: No longer auto-fills products from hardcoded defaults.
  // Products MUST come from decision_rules table via symbolic brain.
  // If missing, we flag it as a warning (not auto-correct with hardcoded data).
  if (recommendation.pest_code) {
    const pestCode = recommendation.pest_code.toUpperCase();
    
    if (!recommendation.product_name || recommendation.product_name.toLowerCase().includes('null')) {
      warnings.push({
        code: 'MISSING_PRODUCT_FROM_RULES',
        message_en: `No product recommendation from rule engine for ${pestCode}. Check decision_rules table.`,
        field: 'product_name',
        suggestion: 'Ensure decision_rules has matching rule with structured_dosage for this pest'
      });
      console.log(`   ⚠️ No product from rule engine for ${pestCode} - DB gap detected`);
    }
  }
  
  // VALIDATION 4: Method Completion for Boring Pests (biology-only, no product injection)
  if (recommendation.pest_code && !recommendation.application_method) {
    const pestCode = recommendation.pest_code.toUpperCase();
    
    if (PEST_BIOLOGY.BORING_PESTS.includes(pestCode)) {
      corrections.push({
        field: 'application_method',
        original_value: 'undefined',
        corrected_value: 'SOIL_APPLICATION',
        reason: `Default method for ${pestCode} based on boring pest biology`
      });
    } else if (PEST_BIOLOGY.SUCKING_PESTS.includes(pestCode)) {
      corrections.push({
        field: 'application_method',
        original_value: 'undefined',
        corrected_value: 'FOLIAR_SPRAY',
        reason: `Default method for ${pestCode} based on sucking pest biology`
      });
    }
  }
  
  const isValid = errors.filter(e => e.severity === 'CRITICAL').length === 0;
  
  console.log(`   ✅ Validation complete: ${isValid ? 'PASSED' : 'FAILED'}`);
  console.log(`   Errors: ${errors.length}, Warnings: ${warnings.length}, Corrections: ${corrections.length}`);
  
  return {
    is_valid: isValid,
    errors,
    warnings,
    corrections_applied: corrections,
    confidence_adjustment: confidenceAdjustment
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLY CORRECTIONS TO RECOMMENDATION
// ═══════════════════════════════════════════════════════════════════════════

export function applyAgronomicCorrections<T extends Record<string, any>>(
  recommendation: T,
  corrections: AgronomicCorrection[]
): T {
  const corrected = { ...recommendation };
  
  for (const correction of corrections) {
    if (correction.field in corrected) {
      (corrected as any)[correction.field] = correction.corrected_value;
    }
  }
  
  return corrected;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET DEFAULT IPM RECOMMENDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PHASE 1 FIX: This function now returns null always.
 * Product recommendations MUST come from the decision_rules table,
 * not from hardcoded defaults. The rule engine is the SSOT.
 */
export function getIPMDefaultRecommendation(
  pestCode: string,
  _ipmLevel: number = 5
): {
  product_name: string;
  dosage: string;
  application_method: string;
  phi_days?: number;
} | null {
  console.log(`⚠️ [AgronomicValidator] getIPMDefaultRecommendation() called for ${pestCode} - returning null (DB-only policy)`);
  return null;
}

export default validateAgronomicAccuracy;
