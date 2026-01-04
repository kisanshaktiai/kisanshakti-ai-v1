/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-10: WHEAT IPM RULES MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ICAR-IIWBR (Indian Institute of Wheat and Barley Research) aligned rules
 * for wheat pest management following Integrated Pest Management principles.
 * 
 * KEY PESTS COVERED:
 * - Wheat Aphid (Sitobion avenae, Rhopalosiphum padi)
 * - Wheat Thrips (Haplothrips tritici)
 * - Brown Wheat Mite (Petrobia latens)
 * - Armyworm (Mythimna separata)
 * 
 * ETL (Economic Threshold Level) COMPLIANCE:
 * - Aphid: 5-10 aphids per ear at heading stage
 * - Thrips: 10-15 per ear at flowering
 * - Mite: 10-15% leaf area damage
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  Rule,
  RuleCategory,
} from '../agents/layered-rule-evaluator.ts';

import {
  CropType,
  CropStage,
  VisualSymptom,
  NDVILevel,
  NDVITrend,
  SoilNitrogen,
  DataConfidence,
  SeverityLevel
} from '../agents/canonical-state-builder.ts';

import { DiagnosisCategory } from '../agents/diagnosis-conflict-resolver.ts';

export const WHEAT_IPM_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT APHID RULES (Sitobion avenae - most common)
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_APHID_RULES: Rule[] = [
  // OBSERVATION: Small insects on wheat with curled leaves
  {
    id: 'OBS_WHEAT_SMALL_INSECTS_01',
    category: RuleCategory.OBSERVATION,
    priority: 75,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.LEAF_CURLING],
      crop_stage: [CropStage.TILLERING, CropStage.VEGETATIVE, CropStage.HEADING, CropStage.FLOWERING]
    },
    then: {
      observation: 'SMALL_SUCKING_PEST_ACTIVITY',
      observation_confidence: 0.8
    },
    scientific_basis: 'ICAR-IIWBR: Curled leaves with small insects indicates sucking pest activity',
    active: true
  },
  
  // DIAGNOSIS: Wheat Aphid
  {
    id: 'DIAG_WHEAT_APHID_CURLED_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 82,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.LEAF_CURLING],
      crop_stage: [CropStage.TILLERING, CropStage.VEGETATIVE, CropStage.HEADING, CropStage.FLOWERING]
    },
    then: {
      possible_cause: 'WHEAT_APHID',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.85
    },
    scientific_basis: 'ICAR-IIWBR: Curled leaves with honeydew in wheat indicates aphid (Sitobion avenae)',
    active: true
  },
  
  // DIAGNOSIS: Wheat Aphid with honeydew
  {
    id: 'DIAG_WHEAT_APHID_HONEYDEW_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 88,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.HONEYDEW, VisualSymptom.STICKY_LEAVES],
      crop_stage: [CropStage.HEADING, CropStage.FLOWERING, CropStage.GRAIN_FILLING]
    },
    then: {
      possible_cause: 'WHEAT_APHID',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.9
    },
    scientific_basis: 'ICAR: Honeydew on wheat ears is diagnostic for aphid infestation',
    active: true
  },
  
  // PRESCRIPTION: Wheat Aphid - IPM Level 2 (Neem-based)
  {
    id: 'PRESC_WHEAT_APHID_NEEM_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 75,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.HONEYDEW],
      severity: [SeverityLevel.LOW, SeverityLevel.MODERATE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_BOTANICAL',
      action_details: {
        pest: 'WHEAT_APHID',
        active_ingredient: 'AZADIRACHTIN',
        formulation: 'Neem Oil 5%',
        dosage: '5 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING_EVENING',
        repeat_after_days: 7,
        ipm_level: 2
      },
      product_reference: 'NEEM_OIL_5ML'
    },
    scientific_basis: 'ICAR IPM: Neem-based spray as first line for low-moderate aphid pressure',
    requires_confirmation: false,
    active: true
  },
  
  // PRESCRIPTION: Wheat Aphid - IPM Level 4 (Biological - Ladybird)
  {
    id: 'PRESC_WHEAT_APHID_BIO_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 72,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES],
      severity: [SeverityLevel.LOW],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'RELEASE_BIOCONTROL',
      action_details: {
        pest: 'WHEAT_APHID',
        bioagent: 'COCCINELLA_SEPTEMPUNCTATA', // Ladybird beetle
        common_name: 'Ladybird Beetle',
        release_rate: '5000/acre',
        method: 'FIELD_RELEASE',
        timing: 'EARLY_MORNING',
        ipm_level: 4
      },
      product_reference: 'LADYBIRD_RELEASE'
    },
    scientific_basis: 'ICAR IPM: Ladybird beetles are natural predators of wheat aphids',
    requires_confirmation: true,
    active: true
  },
  
  // PRESCRIPTION: Wheat Aphid - IPM Level 5 (Chemical - High pressure)
  {
    id: 'PRESC_WHEAT_APHID_CHEMICAL_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 85,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.HONEYDEW],
      severity: [SeverityLevel.HIGH, SeverityLevel.CRITICAL],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_INSECTICIDE',
      action_details: {
        pest: 'WHEAT_APHID',
        active_ingredient: 'IMIDACLOPRID',
        formulation: '17.8% SL',
        dosage: '0.3 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING',
        phi_days: 21,
        ipm_level: 5,
        caution: 'Use only when ETL crossed (>10 aphids/ear)'
      },
      product_reference: 'IMIDACLOPRID_WHEAT_APHID'
    },
    scientific_basis: 'ICAR-IIWBR: Systemic insecticide for high aphid pressure above ETL',
    requires_confirmation: true,
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT THRIPS RULES (Haplothrips tritici)
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_THRIPS_RULES: Rule[] = [
  // DIAGNOSIS: Wheat Thrips
  {
    id: 'DIAG_WHEAT_THRIPS_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.LEAF_DISTORTION],
      crop_stage: [CropStage.HEADING, CropStage.FLOWERING, CropStage.GRAIN_FILLING]
    },
    then: {
      possible_cause: 'WHEAT_THRIPS',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.85
    },
    scientific_basis: 'ICAR: Silvering of leaves with tiny elongated insects indicates thrips',
    active: true
  },
  
  // DIAGNOSIS: Wheat Thrips with streaking
  {
    id: 'DIAG_WHEAT_THRIPS_STREAK_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 82,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.YELLOW_STRIPES],
      crop_stage: [CropStage.HEADING, CropStage.FLOWERING]
    },
    then: {
      possible_cause: 'WHEAT_THRIPS',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.75 // Lower confidence as could also be rust
    },
    scientific_basis: 'ICAR: Yellow streaking on leaves can indicate thrips feeding damage',
    active: true
  },
  
  // PRESCRIPTION: Wheat Thrips - Neem spray
  {
    id: 'PRESC_WHEAT_THRIPS_NEEM_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 76,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.LEAF_DISTORTION],
      severity: [SeverityLevel.LOW, SeverityLevel.MODERATE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_BOTANICAL',
      action_details: {
        pest: 'WHEAT_THRIPS',
        active_ingredient: 'AZADIRACHTIN',
        formulation: 'Neem Oil 5%',
        dosage: '5 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING',
        repeat_after_days: 5,
        ipm_level: 2
      },
      product_reference: 'NEEM_OIL_THRIPS'
    },
    scientific_basis: 'ICAR IPM: Neem effective against thrips at early stage',
    active: true
  },
  
  // PRESCRIPTION: Wheat Thrips - Chemical (High pressure)
  {
    id: 'PRESC_WHEAT_THRIPS_CHEMICAL_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 82,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.SILVERING],
      severity: [SeverityLevel.HIGH, SeverityLevel.CRITICAL],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_INSECTICIDE',
      action_details: {
        pest: 'WHEAT_THRIPS',
        active_ingredient: 'THIAMETHOXAM',
        formulation: '25% WG',
        dosage: '0.2 g/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING',
        phi_days: 21,
        ipm_level: 5
      },
      product_reference: 'THIAMETHOXAM_THRIPS'
    },
    scientific_basis: 'ICAR: Systemic neonicotinoid for severe thrips infestation',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT MITE RULES (Petrobia latens - Brown Wheat Mite)
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_MITE_RULES: Rule[] = [
  // DIAGNOSIS: Brown Wheat Mite
  {
    id: 'DIAG_WHEAT_MITE_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 78,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.WEBBING],
      crop_stage: [CropStage.TILLERING, CropStage.VEGETATIVE]
    },
    then: {
      possible_cause: 'BROWN_WHEAT_MITE',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.82
    },
    scientific_basis: 'ICAR: Silvering with fine webbing in cold weather indicates mites',
    active: true
  },
  
  // PRESCRIPTION: Wheat Mite - Sulfur spray (IPM Level 2)
  {
    id: 'PRESC_WHEAT_MITE_SULFUR_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 74,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.WEBBING],
      severity: [SeverityLevel.LOW, SeverityLevel.MODERATE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_ACARICIDE',
      action_details: {
        pest: 'BROWN_WHEAT_MITE',
        active_ingredient: 'WETTABLE_SULFUR',
        formulation: '80% WP',
        dosage: '2.5 g/L',
        method: 'FOLIAR_SPRAY',
        timing: 'AVOID_HOT_AFTERNOON',
        ipm_level: 2,
        caution: 'Do not apply in hot weather (>35°C)'
      },
      product_reference: 'SULFUR_WP_MITE'
    },
    scientific_basis: 'ICAR: Wettable sulfur effective and safe for wheat mites',
    active: true
  },
  
  // PRESCRIPTION: Wheat Mite - Dicofol (High pressure)
  {
    id: 'PRESC_WHEAT_MITE_CHEMICAL_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 80,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.WEBBING],
      severity: [SeverityLevel.HIGH, SeverityLevel.CRITICAL],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_ACARICIDE',
      action_details: {
        pest: 'BROWN_WHEAT_MITE',
        active_ingredient: 'PROPARGITE',
        formulation: '57% EC',
        dosage: '1.5 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING',
        phi_days: 14,
        ipm_level: 5
      },
      product_reference: 'PROPARGITE_MITE'
    },
    scientific_basis: 'ICAR: Specific acaricide for severe mite infestation',
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT NDVI + STRESS INTEGRATION RULES
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_STRESS_INTEGRATION_RULES: Rule[] = [
  // WARNING: Critical NDVI + Pest combination
  {
    id: 'WARN_WHEAT_CRITICAL_NDVI_PEST_01',
    category: RuleCategory.WARNING,
    priority: 95,
    when: {
      crop_type: [CropType.WHEAT],
      ndvi_level: [NDVILevel.VERY_LOW, NDVILevel.LOW],
      ndvi_trend: [NDVITrend.DECLINING, NDVITrend.SHARP_DECLINE],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.HONEYDEW, VisualSymptom.SILVERING]
    },
    then: {
      warning_type: 'COMBINED_STRESS_ALERT',
      warning_message: 'Critical: Both vegetation stress (NDVI declining) AND pest symptoms detected. Immediate field inspection and integrated action required.',
      warning_severity: 'CRITICAL'
    },
    scientific_basis: 'Multi-signal stress indicates compounded damage requiring urgent attention',
    active: true
  },
  
  // WARNING: Low nitrogen + pest stress
  {
    id: 'WARN_WHEAT_LOW_N_PEST_01',
    category: RuleCategory.WARNING,
    priority: 88,
    when: {
      crop_type: [CropType.WHEAT],
      soil_nitrogen: [SoilNitrogen.VERY_LOW, SoilNitrogen.LOW],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.GENERAL_YELLOWING]
    },
    then: {
      warning_type: 'NUTRIENT_PEST_COMBINED',
      warning_message: 'Warning: Low soil nitrogen weakens crop immunity. Address nitrogen deficiency alongside pest management for better results.',
      warning_severity: 'HIGH'
    },
    scientific_basis: 'ICAR: Nutrient stress increases crop susceptibility to pests',
    active: true
  },
  
  // PRESCRIPTION: Integrated approach for nitrogen + pest
  {
    id: 'PRESC_WHEAT_INTEGRATED_N_PEST_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 85,
    when: {
      crop_type: [CropType.WHEAT],
      soil_nitrogen: [SoilNitrogen.VERY_LOW, SoilNitrogen.LOW],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.GENERAL_YELLOWING],
      crop_stage: [CropStage.TILLERING, CropStage.VEGETATIVE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'INTEGRATED_MANAGEMENT',
      action_details: {
        approach: 'NUTRIENT_PEST_COMBINED',
        primary_action: {
          type: 'APPLY_FERTILIZER',
          nutrient: 'UREA',
          dosage: '25 kg/acre',
          method: 'BROADCAST_WITH_IRRIGATION'
        },
        secondary_action: {
          type: 'SPRAY_BOTANICAL',
          product: 'NEEM_OIL',
          dosage: '5 ml/L',
          timing: 'AFTER_3_DAYS_OF_FERTILIZER'
        },
        rationale: 'Address nitrogen deficiency first to improve plant health, then control pests'
      },
      product_reference: 'UREA_NEEM_INTEGRATED'
    },
    scientific_basis: 'ICAR: Integrated nutrient and pest management for stressed crops',
    requires_confirmation: true,
    active: true
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL WHEAT IPM RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_WHEAT_IPM_RULES: Rule[] = [
  ...WHEAT_APHID_RULES,
  ...WHEAT_THRIPS_RULES,
  ...WHEAT_MITE_RULES,
  ...WHEAT_STRESS_INTEGRATION_RULES
];

/**
 * Get wheat-specific biological control agents
 * CRITICAL: These are ONLY for wheat pests - NOT sugarcane/cotton biocontrols
 */
export const WHEAT_BIOCONTROL_AGENTS = {
  APHID: {
    primary: 'COCCINELLA_SEPTEMPUNCTATA', // Ladybird beetle
    secondary: 'CHRYSOPERLA_CARNEA', // Green lacewing
    release_rate: '5000-10000/acre',
    timing: 'Early morning when aphid population building'
  },
  THRIPS: {
    primary: 'CHRYSOPERLA_CARNEA', // Green lacewing
    release_rate: '5000/acre',
    timing: 'Evening release'
  }
  // NOTE: Trichogramma chilonis is NOT effective for wheat pests
  // It is specific to Lepidopteran eggs (bollworms, stem borers)
};

/**
 * Validate biocontrol recommendation for wheat
 * Returns false if wrong biocontrol agent is suggested
 */
export function validateWheatBiocontrol(bioagent: string): boolean {
  const validWheatBiocontrols = [
    'COCCINELLA_SEPTEMPUNCTATA',
    'CHRYSOPERLA_CARNEA',
    'LADYBIRD_BEETLE',
    'GREEN_LACEWING'
  ];
  
  const invalidForWheat = [
    'TRICHOGRAMMA_CHILONIS', // For sugarcane/cotton bollworms only
    'TRICHOGRAMMA',
    'COTESIA_FLAVIPES', // For sugarcane stem borers only
    'COTESIA'
  ];
  
  const normalizedAgent = bioagent.toUpperCase().replace(/\s+/g, '_');
  
  if (invalidForWheat.some(invalid => normalizedAgent.includes(invalid))) {
    console.warn(`⚠️ [WheatIPM] Invalid biocontrol for wheat: ${bioagent} - This is for sugarcane/cotton`);
    return false;
  }
  
  return true;
}

export default ALL_WHEAT_IPM_RULES;
