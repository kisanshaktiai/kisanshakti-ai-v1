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
// IPM DEFAULT PRODUCTS (when rule engine returns null)
// ═══════════════════════════════════════════════════════════════════════════

export const IPM_DEFAULTS: Record<string, {
  chemical: { name: string; dosage: string; method: string; phi_days: number };
  biological: { name: string; dosage: string; method: string };
  mechanical: { action: string; frequency: string };
}> = {
  SHOOT_BORER: {
    chemical: { name: 'Chlorantraniliprole 18.5 SC', dosage: '3ml/10L', method: 'SOIL_DRENCH', phi_days: 21 },
    biological: { name: 'Trichogramma chilonis', dosage: '50,000/acre (6 releases)', method: 'RELEASE' },
    mechanical: { action: 'Remove and destroy dead hearts weekly', frequency: 'Weekly inspection' }
  },
  STEM_BORER: {
    chemical: { name: 'Fipronil 5 SC', dosage: '30ml/10L', method: 'SOIL_DRENCH', phi_days: 30 },
    biological: { name: 'Cotesia flavipes', dosage: '5000 cocoons/acre', method: 'RELEASE' },
    mechanical: { action: 'Collect and destroy egg masses', frequency: 'Every 3 days' }
  },
  BOLLWORM: {
    chemical: { name: 'Emamectin benzoate 5 SG', dosage: '4g/10L', method: 'FOLIAR_SPRAY', phi_days: 7 },
    biological: { name: 'NPV (HaNPV)', dosage: '250 LE/acre', method: 'EVENING_SPRAY' },
    mechanical: { action: 'Pheromone traps + bird perches', frequency: '5 traps/acre' }
  },
  WHITEFLY: {
    chemical: { name: 'Diafenthiuron 50 WP', dosage: '12g/10L', method: 'FOLIAR_SPRAY', phi_days: 14 },
    biological: { name: 'Verticillium lecanii', dosage: '5g/L', method: 'EVENING_SPRAY' },
    mechanical: { action: 'Yellow sticky traps', frequency: '12 traps/acre' }
  },
  APHID: {
    chemical: { name: 'Thiamethoxam 25 WG', dosage: '4g/10L', method: 'FOLIAR_SPRAY', phi_days: 14 },
    biological: { name: 'Chrysoperla carnea', dosage: '5000/acre', method: 'RELEASE' },
    mechanical: { action: 'Remove heavily infested shoots', frequency: 'As needed' }
  },
  THRIPS: {
    chemical: { name: 'Fipronil 5 SC', dosage: '15ml/10L', method: 'FOLIAR_SPRAY', phi_days: 14 },
    biological: { name: 'Beauveria bassiana', dosage: '5g/L', method: 'EVENING_SPRAY' },
    mechanical: { action: 'Blue sticky traps', frequency: '10 traps/acre' }
  },
  FRUIT_BORER: {
    chemical: { name: 'Chlorantraniliprole 18.5 SC', dosage: '3ml/10L', method: 'FOLIAR_SPRAY', phi_days: 3 },
    biological: { name: 'Trichogramma pretiosum', dosage: '1 lakh/acre', method: 'WEEKLY_RELEASE' },
    mechanical: { action: 'Pheromone traps + early picking of infested fruits', frequency: 'Every 3 days' }
  },
  MEALYBUG: {
    chemical: { name: 'Buprofezin 25 SC', dosage: '20ml/10L', method: 'FOLIAR_SPRAY', phi_days: 21 },
    biological: { name: 'Cryptolaemus montrouzieri', dosage: '10 beetles/plant', method: 'RELEASE' },
    mechanical: { action: 'Destroy ant colonies + remove infested parts', frequency: 'Weekly' }
  }
};

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
  message_mr: string;
  message_hi: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  field: string;
  original_value: string;
  reason: string;
}

export interface AgronomicWarning {
  code: string;
  message_en: string;
  message_mr: string;
  message_hi: string;
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
          message_mr: `${pestCode} (खोडकिडा) साठी फवारणी प्रभावी नाही. जमिनीत औषध द्या.`,
          message_hi: `${pestCode} (तना छेदक) के लिए छिड़काव प्रभावी नहीं है। मिट्टी में दवा दें।`,
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
          message_mr: `${stage} अवस्थेत ${pestCode} होणे अशक्य आहे. कृपया निदान तपासा.`,
          message_hi: `${stage} अवस्था में ${pestCode} असंभव है। कृपया निदान जांचें।`,
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
          message_mr: `${stage} अवस्थेत ${pestCode} असामान्य आहे. कृपया फोटो पाठवून पुष्टी करा.`,
          message_hi: `${stage} अवस्था में ${pestCode} असामान्य है। कृपया फोटो से पुष्टि करें।`,
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
  
  if (recommendation.pest_code) {
    const pestCode = recommendation.pest_code.toUpperCase();
    const defaults = IPM_DEFAULTS[pestCode];
    
    // If product_name is missing or null, fill from IPM defaults
    if (!recommendation.product_name || recommendation.product_name.toLowerCase().includes('null')) {
      if (defaults) {
        const ipmLevel = recommendation.ipm_level || 5;
        if (ipmLevel >= 5) {
          corrections.push({
            field: 'product_name',
            original_value: recommendation.product_name || 'null',
            corrected_value: defaults.chemical.name,
            reason: 'Filled from IPM database for high infestation'
          });
          console.log(`   📦 Auto-filled product: ${defaults.chemical.name}`);
        } else if (ipmLevel >= 3) {
          corrections.push({
            field: 'product_name',
            original_value: recommendation.product_name || 'null',
            corrected_value: defaults.biological.name,
            reason: 'Filled from IPM database for moderate infestation'
          });
        }
      }
    }
    
    // If dosage is missing
    if (!recommendation.dosage || recommendation.dosage.toLowerCase().includes('label')) {
      if (defaults) {
        const ipmLevel = recommendation.ipm_level || 5;
        const source = ipmLevel >= 5 ? defaults.chemical : defaults.biological;
        corrections.push({
          field: 'dosage',
          original_value: recommendation.dosage || 'As per label',
          corrected_value: source.dosage,
          reason: 'Filled from IPM database'
        });
        console.log(`   📏 Auto-filled dosage: ${source.dosage}`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION 4: Method Completion for Boring Pests
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (recommendation.pest_code && !recommendation.application_method) {
    const pestCode = recommendation.pest_code.toUpperCase();
    const defaults = IPM_DEFAULTS[pestCode];
    
    if (defaults) {
      const method = PEST_BIOLOGY.BORING_PESTS.includes(pestCode) 
        ? defaults.chemical.method 
        : 'FOLIAR_SPRAY';
        
      corrections.push({
        field: 'application_method',
        original_value: 'undefined',
        corrected_value: method,
        reason: `Default method for ${pestCode} based on pest biology`
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

export function getIPMDefaultRecommendation(
  pestCode: string,
  ipmLevel: number = 5
): {
  product_name: string;
  dosage: string;
  application_method: string;
  phi_days?: number;
} | null {
  const defaults = IPM_DEFAULTS[pestCode.toUpperCase()];
  if (!defaults) return null;
  
  if (ipmLevel >= 5) {
    return {
      product_name: defaults.chemical.name,
      dosage: defaults.chemical.dosage,
      application_method: defaults.chemical.method,
      phi_days: defaults.chemical.phi_days
    };
  } else if (ipmLevel >= 3) {
    return {
      product_name: defaults.biological.name,
      dosage: defaults.biological.dosage,
      application_method: defaults.biological.method
    };
  } else {
    return {
      product_name: defaults.mechanical.action,
      dosage: defaults.mechanical.frequency,
      application_method: 'MECHANICAL'
    };
  }
}

export default validateAgronomicAccuracy;
