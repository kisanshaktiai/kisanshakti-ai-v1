/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-12: UNIVERSAL OBSERVATION RULES MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * These rules work for ALL crops, vegetables, and plants.
 * NO hardcoded crop types - pure symptom-based inference.
 * 
 * DESIGN PRINCIPLE:
 * - Observation rules NEVER assume a specific pest/disease
 * - They only record what is SEEN and infer CATEGORY of problem
 * - Diagnosis rules are more specific but still work across crops
 * - The system looks like LLM output but is 100% symbolic rule-based
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  CropType,
  CropStage,
  VisualSymptom,
  NDVILevel,
  NDVITrend,
  SoilNitrogen,
  SoilPhosphorus,
  SoilPotassium,
  DataConfidence,
  SeverityLevel,
  WaterStress
} from '../agents/canonical-state-builder.ts';

import { DiagnosisCategory } from '../agents/diagnosis-conflict-resolver.ts';

// ==================== LOCAL RULE TYPES ====================

export enum RuleCategory {
  OBSERVATION = 1,
  DIAGNOSIS = 2,
  EXCLUSION = 3,
  SAFETY = 4,
  PRESCRIPTION = 5,
  WARNING = 6
}

export interface RuleConditions {
  crop_type?: CropType[];
  crop_stage?: CropStage[];
  visual_symptom?: VisualSymptom[];
  ndvi_level?: NDVILevel[];
  ndvi_trend?: NDVITrend[];
  soil_nitrogen?: SoilNitrogen[];
  soil_phosphorus?: SoilPhosphorus[];
  soil_potassium?: SoilPotassium[];
  water_stress?: WaterStress[];
  data_confidence?: DataConfidence[];
  severity?: SeverityLevel[];
  custom?: (state: any) => boolean;
}

export interface RuleAssertions {
  observation?: string;
  observation_confidence?: number;
  possible_cause?: string;
  cause_category?: DiagnosisCategory;
  cause_confidence?: number;
  exclude_cause?: string;
  exclusion_reason?: string;
  block_prescription?: boolean;
  safety_message?: string;
  action_type?: string;
  action_details?: Record<string, any>;
  product_reference?: string;
  warning_type?: string;
  warning_message?: string;
  warning_severity?: string;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  priority: number;
  when: RuleConditions;
  then: RuleAssertions;
  scientific_basis?: string;
  requires_confirmation?: boolean;
  active: boolean;
}

export const UNIVERSAL_RULES_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL INSECT OBSERVATION RULES (Crop-Agnostic)
// These fire for ANY crop when insect presence is reported
// ═══════════════════════════════════════════════════════════════════════════

export const UNIVERSAL_INSECT_OBSERVATION_RULES: Rule[] = [
  // OBSERVATION: Small insects visible - works for ANY crop
  {
    id: 'OBS_UNIVERSAL_SMALL_INSECTS_01',
    category: RuleCategory.OBSERVATION,
    priority: 70,
    when: {
      visual_symptom: [VisualSymptom.SMALL_INSECTS_VISIBLE]
    },
    then: {
      observation: 'INSECT_PRESENCE_DETECTED',
      observation_confidence: 0.9
    },
    scientific_basis: 'Universal: Small insects visible on plant indicates pest activity potential',
    active: true
  },
  
  // OBSERVATION: Flying insects - suggests sucking pest category
  {
    id: 'OBS_UNIVERSAL_FLYING_INSECTS_01',
    category: RuleCategory.OBSERVATION,
    priority: 75,
    when: {
      visual_symptom: [VisualSymptom.FLYING_INSECTS_VISIBLE]
    },
    then: {
      observation: 'FLYING_SUCKING_PEST_LIKELY',
      observation_confidence: 0.85
    },
    scientific_basis: 'Universal: Flying behavior indicates whitefly/aphid/planthopper category',
    active: true
  },
  
  // OBSERVATION: Crawling insects - suggests caterpillar/beetle category
  {
    id: 'OBS_UNIVERSAL_CRAWLING_INSECTS_01',
    category: RuleCategory.OBSERVATION,
    priority: 75,
    when: {
      visual_symptom: [VisualSymptom.CRAWLING_INSECTS_VISIBLE]
    },
    then: {
      observation: 'CRAWLING_PEST_LIKELY',
      observation_confidence: 0.85
    },
    scientific_basis: 'Universal: Crawling behavior indicates caterpillar/beetle/mealybug category',
    active: true
  },
  
  // OBSERVATION: Jumping insects - suggests hopper category
  {
    id: 'OBS_UNIVERSAL_JUMPING_INSECTS_01',
    category: RuleCategory.OBSERVATION,
    priority: 75,
    when: {
      visual_symptom: [VisualSymptom.JUMPING_INSECTS_VISIBLE]
    },
    then: {
      observation: 'HOPPER_PEST_LIKELY',
      observation_confidence: 0.85
    },
    scientific_basis: 'Universal: Jumping behavior indicates leafhopper/planthopper/jassid category',
    active: true
  },
  
  // OBSERVATION: Insects present but no damage - monitoring only
  {
    id: 'OBS_UNIVERSAL_NO_DAMAGE_01',
    category: RuleCategory.OBSERVATION,
    priority: 60,
    when: {
      visual_symptom: [VisualSymptom.INSECT_PRESENT_NO_DAMAGE]
    },
    then: {
      observation: 'INSECT_BELOW_ETL_MONITORING_ONLY',
      observation_confidence: 0.95
    },
    scientific_basis: 'IPM Principle: Insect presence without damage is below Economic Threshold Level',
    active: true
  },
  
  // OBSERVATION: Honeydew present - confirms sucking pest
  {
    id: 'OBS_UNIVERSAL_HONEYDEW_01',
    category: RuleCategory.OBSERVATION,
    priority: 80,
    when: {
      visual_symptom: [VisualSymptom.HONEYDEW, VisualSymptom.STICKY_LEAVES]
    },
    then: {
      observation: 'SUCKING_PEST_CONFIRMED',
      observation_confidence: 0.92
    },
    scientific_basis: 'Universal: Honeydew is diagnostic of aphid/whitefly/scale insects',
    active: true
  },
  
  // OBSERVATION: Leaf holes - chewing pest activity
  {
    id: 'OBS_UNIVERSAL_LEAF_HOLES_01',
    category: RuleCategory.OBSERVATION,
    priority: 78,
    when: {
      visual_symptom: [VisualSymptom.LEAF_HOLES, VisualSymptom.HOLES_IN_LEAVES]
    },
    then: {
      observation: 'CHEWING_PEST_ACTIVITY',
      observation_confidence: 0.88
    },
    scientific_basis: 'Universal: Holes in leaves indicate caterpillar/beetle/grasshopper feeding',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL DIAGNOSIS RULES (Infer pest category without naming species)
// ═══════════════════════════════════════════════════════════════════════════

export const UNIVERSAL_DIAGNOSIS_RULES: Rule[] = [
  // DIAGNOSIS: Sucking pest (flying + honeydew) - ANY crop
  {
    id: 'DIAG_UNIVERSAL_SUCKING_PEST_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      visual_symptom: [VisualSymptom.FLYING_INSECTS_VISIBLE, VisualSymptom.HONEYDEW]
    },
    then: {
      possible_cause: 'SUCKING_PEST_INFESTATION',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.85
    },
    scientific_basis: 'Universal: Flying insects + honeydew = aphid/whitefly/scale family',
    active: true
  },
  
  // DIAGNOSIS: Sucking pest (curled leaves + sticky)
  {
    id: 'DIAG_UNIVERSAL_SUCKING_PEST_02',
    category: RuleCategory.DIAGNOSIS,
    priority: 82,
    when: {
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.STICKY_LEAVES]
    },
    then: {
      possible_cause: 'SUCKING_PEST_INFESTATION',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.88
    },
    scientific_basis: 'Universal: Leaf curl + stickiness indicates sap-sucking pest damage',
    active: true
  },
  
  // DIAGNOSIS: Chewing pest (leaf holes + crawling)
  {
    id: 'DIAG_UNIVERSAL_CHEWING_PEST_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      visual_symptom: [VisualSymptom.LEAF_HOLES, VisualSymptom.CRAWLING_INSECTS_VISIBLE]
    },
    then: {
      possible_cause: 'CHEWING_PEST_INFESTATION',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.85
    },
    scientific_basis: 'Universal: Leaf holes + crawling insects = caterpillar/beetle feeding',
    active: true
  },
  
  // DIAGNOSIS: Mite infestation (silvering + webbing)
  {
    id: 'DIAG_UNIVERSAL_MITE_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 78,
    when: {
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.WEBBING]
    },
    then: {
      possible_cause: 'MITE_INFESTATION',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.82
    },
    scientific_basis: 'Universal: Silvering + fine webbing indicates mite damage',
    active: true
  },
  
  // DIAGNOSIS: Thrips (silvering + distortion)
  {
    id: 'DIAG_UNIVERSAL_THRIPS_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 76,
    when: {
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.LEAF_DISTORTION]
    },
    then: {
      possible_cause: 'THRIPS_INFESTATION',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.80
    },
    scientific_basis: 'Universal: Silvery sheen + leaf distortion indicates thrips',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL NUTRIENT DEFICIENCY RULES (Work for all crops)
// ═══════════════════════════════════════════════════════════════════════════

export const UNIVERSAL_NUTRIENT_RULES: Rule[] = [
  // DIAGNOSIS: Nitrogen deficiency (yellowing + low N)
  {
    id: 'DIAG_UNIVERSAL_N_DEFICIENCY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 75,
    when: {
      visual_symptom: [VisualSymptom.GENERAL_YELLOWING],
      soil_nitrogen: [SoilNitrogen.VERY_LOW, SoilNitrogen.LOW]
    },
    then: {
      possible_cause: 'NITROGEN_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.85
    },
    scientific_basis: 'Universal: Yellowing older leaves + low soil N indicates nitrogen deficiency',
    active: true
  },
  
  // DIAGNOSIS: Phosphorus deficiency (stunted + purple)
  {
    id: 'DIAG_UNIVERSAL_P_DEFICIENCY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 72,
    when: {
      visual_symptom: [VisualSymptom.STUNTED_GROWTH],
      soil_phosphorus: [SoilPhosphorus.VERY_LOW, SoilPhosphorus.LOW],
      crop_stage: [CropStage.SEEDLING, CropStage.VEGETATIVE, CropStage.GERMINATION]
    },
    then: {
      possible_cause: 'PHOSPHORUS_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.78
    },
    scientific_basis: 'Universal: Stunted growth in young plants + low P indicates phosphorus deficiency',
    active: true
  },
  
  // DIAGNOSIS: Potassium deficiency (leaf edge burn)
  {
    id: 'DIAG_UNIVERSAL_K_DEFICIENCY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 74,
    when: {
      visual_symptom: [VisualSymptom.LEAF_EDGE_BURN, VisualSymptom.LEAF_TIP_BURN],
      soil_potassium: [SoilPotassium.VERY_LOW, SoilPotassium.LOW]
    },
    then: {
      possible_cause: 'POTASSIUM_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.82
    },
    scientific_basis: 'Universal: Marginal leaf scorch + low K indicates potassium deficiency',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL WATER STRESS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const UNIVERSAL_WATER_STRESS_RULES: Rule[] = [
  // DIAGNOSIS: Water stress (wilting + moderate/severe stress)
  {
    id: 'DIAG_UNIVERSAL_WATER_STRESS_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 82,
    when: {
      visual_symptom: [VisualSymptom.WILTING, VisualSymptom.LEAF_ROLLING],
      water_stress: [WaterStress.MODERATE, WaterStress.SEVERE]
    },
    then: {
      possible_cause: 'WATER_DEFICIT_STRESS',
      cause_category: DiagnosisCategory.WATER_STRESS,
      cause_confidence: 0.90
    },
    scientific_basis: 'Universal: Wilting with known water deficit confirms water stress',
    active: true
  },
  
  // DIAGNOSIS: Waterlogging (yellowing + waterlogged)
  {
    id: 'DIAG_UNIVERSAL_WATERLOGGING_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      visual_symptom: [VisualSymptom.GENERAL_YELLOWING, VisualSymptom.WILTING],
      water_stress: [WaterStress.WATERLOGGED]
    },
    then: {
      possible_cause: 'WATERLOGGING_DAMAGE',
      cause_category: DiagnosisCategory.WATER_STRESS,
      cause_confidence: 0.88
    },
    scientific_basis: 'Universal: Yellowing + wilting in waterlogged conditions indicates root anoxia',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL PRESCRIPTION RULES (Safe for all crops)
// ═══════════════════════════════════════════════════════════════════════════

export const UNIVERSAL_PRESCRIPTION_RULES: Rule[] = [
  // PRESCRIPTION: Neem spray for sucking pests (all crops)
  {
    id: 'PRESC_UNIVERSAL_NEEM_SUCKING_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 70,
    when: {
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.HONEYDEW, VisualSymptom.FLYING_INSECTS_VISIBLE],
      severity: [SeverityLevel.LOW, SeverityLevel.MODERATE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_BOTANICAL',
      action_details: {
        pest_category: 'SUCKING_PESTS',
        active_ingredient: 'AZADIRACHTIN',
        formulation: 'Neem Oil 5%',
        dosage: '5 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING_OR_EVENING',
        repeat_after_days: 7,
        ipm_level: 2,
        safe_for_all_crops: true
      },
      product_reference: 'NEEM_OIL_UNIVERSAL'
    },
    scientific_basis: 'IPM: Neem is universally safe and effective against sucking pests',
    requires_confirmation: false,
    active: true
  },
  
  // PRESCRIPTION: Neem spray for chewing pests (all crops)
  {
    id: 'PRESC_UNIVERSAL_NEEM_CHEWING_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 68,
    when: {
      visual_symptom: [VisualSymptom.LEAF_HOLES, VisualSymptom.CRAWLING_INSECTS_VISIBLE, VisualSymptom.LARVAE_VISIBLE],
      severity: [SeverityLevel.LOW, SeverityLevel.MODERATE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_BOTANICAL',
      action_details: {
        pest_category: 'CHEWING_PESTS',
        active_ingredient: 'AZADIRACHTIN',
        formulation: 'Neem Oil 5%',
        dosage: '5 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING',
        repeat_after_days: 5,
        ipm_level: 2,
        safe_for_all_crops: true
      },
      product_reference: 'NEEM_OIL_CHEWING'
    },
    scientific_basis: 'IPM: Neem acts as antifeedant and growth regulator for caterpillars',
    requires_confirmation: false,
    active: true
  },
  
  // PRESCRIPTION: Sulfur for mites (all crops)
  {
    id: 'PRESC_UNIVERSAL_SULFUR_MITE_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 72,
    when: {
      visual_symptom: [VisualSymptom.WEBBING, VisualSymptom.SILVERING],
      severity: [SeverityLevel.LOW, SeverityLevel.MODERATE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_ACARICIDE',
      action_details: {
        pest_category: 'MITES',
        active_ingredient: 'WETTABLE_SULFUR',
        formulation: '80% WP',
        dosage: '2.5 g/L',
        method: 'FOLIAR_SPRAY',
        timing: 'AVOID_HOT_AFTERNOON',
        ipm_level: 2,
        caution: 'Do not apply when temperature exceeds 35°C',
        safe_for_all_crops: true
      },
      product_reference: 'SULFUR_WP_MITE'
    },
    scientific_basis: 'IPM: Wettable sulfur is safe acaricide for all crops',
    active: true
  },
  
  // PRESCRIPTION: Monitoring only for low insect presence
  {
    id: 'PRESC_UNIVERSAL_MONITOR_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 50,
    when: {
      visual_symptom: [VisualSymptom.INSECT_PRESENT_NO_DAMAGE, VisualSymptom.SMALL_INSECTS_VISIBLE],
      severity: [SeverityLevel.NONE, SeverityLevel.LOW]
    },
    then: {
      action_type: 'MONITOR',
      action_details: {
        recommendation: 'CONTINUE_OBSERVATION',
        check_after_days: 3,
        reason: 'Insect presence below Economic Threshold Level',
        do_not_spray: true,
        ipm_level: 1
      }
    },
    scientific_basis: 'IPM: Do not spray when pest population is below ETL',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL SAFETY RULES
// ═══════════════════════════════════════════════════════════════════════════

export const UNIVERSAL_SAFETY_RULES: Rule[] = [
  // SAFETY: Block prescription if crop unknown
  {
    id: 'SAFETY_UNIVERSAL_UNKNOWN_CROP_01',
    category: RuleCategory.SAFETY,
    priority: 100,
    when: {
      crop_type: [CropType.UNKNOWN]
    },
    then: {
      block_prescription: true,
      safety_message: 'Crop type not identified. Please confirm which crop is affected before treatment can be recommended.'
    },
    active: true
  },
  
  // SAFETY: Block prescription if data confidence very low
  {
    id: 'SAFETY_UNIVERSAL_LOW_CONFIDENCE_01',
    category: RuleCategory.SAFETY,
    priority: 98,
    when: {
      data_confidence: [DataConfidence.VERY_LOW]
    },
    then: {
      block_prescription: true,
      safety_message: 'Insufficient information to make safe recommendation. Please provide more details or a photo.'
    },
    active: true
  },
  
  // SAFETY: Flowering stage pollinator protection
  {
    id: 'SAFETY_UNIVERSAL_POLLINATOR_01',
    category: RuleCategory.SAFETY,
    priority: 95,
    when: {
      crop_stage: [CropStage.FLOWERING],
      custom: (state) => state.severity !== SeverityLevel.CRITICAL
    },
    then: {
      block_prescription: false,
      safety_message: 'Crop in flowering stage. Avoid neonicotinoids and bee-toxic chemicals. Prefer bio-pesticides or spray in late evening.'
    },
    scientific_basis: 'FAO Pollinator Protection Guidelines',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED UNIVERSAL RULES EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_UNIVERSAL_RULES: Rule[] = [
  ...UNIVERSAL_INSECT_OBSERVATION_RULES,
  ...UNIVERSAL_DIAGNOSIS_RULES,
  ...UNIVERSAL_NUTRIENT_RULES,
  ...UNIVERSAL_WATER_STRESS_RULES,
  ...UNIVERSAL_PRESCRIPTION_RULES,
  ...UNIVERSAL_SAFETY_RULES
];

export default ALL_UNIVERSAL_RULES;
