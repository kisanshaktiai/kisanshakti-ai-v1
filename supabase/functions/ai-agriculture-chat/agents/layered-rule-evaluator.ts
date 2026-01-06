// ============= LAYERED RULE EVALUATION PIPELINE =============
// Evaluates rules in correct order: OBSERVATION → DIAGNOSIS → EXCLUSION → SAFETY → PRESCRIPTION
// This ensures deterministic, auditable, and safe decision making
// 
// PHASE-10 UPDATE: Added Wheat IPM Rules integration

import { 
  CanonicalState, 
  DataConfidence,
  SeverityLevel,
  CropType,
  CropStage,
  NDVILevel,
  NDVITrend,
  VisualSymptom,
  SoilNitrogen,
  SoilPhosphorus,
  SoilPotassium,
  WaterStress,
  checkPrescriptionGate
} from './canonical-state-builder.ts';

import { 
  DiagnosisCategory, 
  Diagnosis,
  resolveDiagnosisConflicts as resolveConflicts,
  CATEGORY_PRIORITY
} from './diagnosis-conflict-resolver.ts';

// Define Rule types locally to avoid circular imports
// (wheat-ipm-rules.ts also defines these locally)

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
  custom?: (state: CanonicalState) => boolean;
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
  warning_severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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

// PHASE-10: Import Wheat IPM Rules
// These are imported AFTER types are defined here (wheat-ipm-rules has its own local copies)
import { 
  ALL_WHEAT_IPM_RULES, 
  validateWheatBiocontrol
} from '../rules/wheat-ipm-rules.ts';

// PHASE-12: Import Universal Observation Rules (crop-agnostic)
import { 
  ALL_UNIVERSAL_RULES 
} from '../rules/universal-observation-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-13: Import Bundled Rules (2,000+ ICAR rules from src/decision-graph)
// ═══════════════════════════════════════════════════════════════════════════
import {
  loadAllRules,
  loadRulesForCrop,
  evaluateRules as evaluateBundledRules,
  getRuleCount,
  type ExecutableRule
} from '../bundled-rules/loader.ts';

// ==================== RULE EVALUATION RESULT ====================

export interface RuleEvaluationResult {
  observations: string[];
  diagnoses: Diagnosis[];
  exclusions: { cause: string; reason: string }[];
  safety_blocks: { rule_id: string; message: string }[];
  prescriptions: RuleAssertions[];
  warnings: RuleAssertions[];
  
  rules_evaluated: number;
  rules_matched: number;
  rules_applied: string[];
  rules_blocked: string[];
  
  prescription_allowed: boolean;
  prescription_gate_reason: string;
  
  final_diagnosis: Diagnosis | null;
  confidence_in_result: number;
}

// ==================== RULE MATCHING ====================

function matchesConditions(rule: Rule, state: CanonicalState): boolean {
  const conditions = rule.when;
  
  // Check each condition
  if (conditions.crop_type && !conditions.crop_type.includes(state.crop_type)) return false;
  if (conditions.crop_stage && !conditions.crop_stage.includes(state.crop_stage)) return false;
  if (conditions.visual_symptom && !conditions.visual_symptom.includes(state.visual_symptom)) return false;
  if (conditions.ndvi_level && !conditions.ndvi_level.includes(state.ndvi_level)) return false;
  if (conditions.ndvi_trend && !conditions.ndvi_trend.includes(state.ndvi_trend)) return false;
  if (conditions.soil_nitrogen && !conditions.soil_nitrogen.includes(state.soil_nitrogen)) return false;
  if (conditions.soil_phosphorus && !conditions.soil_phosphorus.includes(state.soil_phosphorus)) return false;
  if (conditions.soil_potassium && !conditions.soil_potassium.includes(state.soil_potassium)) return false;
  if (conditions.water_stress && !conditions.water_stress.includes(state.water_stress)) return false;
  if (conditions.data_confidence && !conditions.data_confidence.includes(state.data_confidence)) return false;
  if (conditions.severity && !conditions.severity.includes(state.severity)) return false;
  
  // Custom condition
  if (conditions.custom && !conditions.custom(state)) return false;
  
  return true;
}

// ==================== LAYERED EVALUATION ====================

export function evaluateRulesLayered(
  rules: Rule[],
  state: CanonicalState
): RuleEvaluationResult {
  const result: RuleEvaluationResult = {
    observations: [],
    diagnoses: [],
    exclusions: [],
    safety_blocks: [],
    prescriptions: [],
    warnings: [],
    rules_evaluated: 0,
    rules_matched: 0,
    rules_applied: [],
    rules_blocked: [],
    prescription_allowed: true,
    prescription_gate_reason: '',
    final_diagnosis: null,
    confidence_in_result: 0
  };
  
  // Group rules by category
  const rulesByCategory = groupRulesByCategory(rules);
  
  // PHASE 1: OBSERVATION rules
  const observationRules = rulesByCategory.get(RuleCategory.OBSERVATION) || [];
  for (const rule of observationRules) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      if (rule.then.observation) {
        result.observations.push(rule.then.observation);
      }
    }
  }
  
  // PHASE 2: DIAGNOSIS rules
  const diagnosisRules = rulesByCategory.get(RuleCategory.DIAGNOSIS) || [];
  const diagnosisCandidates: Diagnosis[] = [];
  
  for (const rule of diagnosisRules) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      
      if (rule.then.possible_cause) {
        diagnosisCandidates.push({
          id: rule.id,
          category: rule.then.cause_category || DiagnosisCategory.UNKNOWN,
          cause: rule.then.possible_cause,
          confidence: rule.then.cause_confidence || 0.5,
          evidence: result.observations,
          rule_ids: [rule.id],
          severity: state.severity,
          requires_immediate_action: state.severity === SeverityLevel.CRITICAL
        });
      }
    }
  }
  
  // PHASE 3: EXCLUSION rules (can remove diagnoses)
  const exclusionRules = rulesByCategory.get(RuleCategory.EXCLUSION) || [];
  for (const rule of exclusionRules) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      
      if (rule.then.exclude_cause) {
        result.exclusions.push({
          cause: rule.then.exclude_cause,
          reason: rule.then.exclusion_reason || 'Excluded by rule'
        });
        
        // Remove excluded diagnoses
        const excludedCause = rule.then.exclude_cause.toLowerCase();
        for (let i = diagnosisCandidates.length - 1; i >= 0; i--) {
          if (diagnosisCandidates[i].cause.toLowerCase().includes(excludedCause)) {
            diagnosisCandidates.splice(i, 1);
          }
        }
      }
    }
  }
  
  // PHASE 4: SAFETY rules (can block prescriptions)
  const safetyRules = rulesByCategory.get(RuleCategory.SAFETY) || [];
  for (const rule of safetyRules) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      
      if (rule.then.block_prescription) {
        result.prescription_allowed = false;
        result.safety_blocks.push({
          rule_id: rule.id,
          message: rule.then.safety_message || 'Blocked by safety rule'
        });
      }
    }
  }
  
  // Check prescription gate
  const gateResult = checkPrescriptionGate(state);
  if (!gateResult.allowed) {
    result.prescription_allowed = false;
    result.prescription_gate_reason = gateResult.reason;
  }
  
  // PHASE 5: PRESCRIPTION rules (only if allowed)
  if (result.prescription_allowed) {
    const prescriptionRules = rulesByCategory.get(RuleCategory.PRESCRIPTION) || [];
    for (const rule of prescriptionRules) {
      result.rules_evaluated++;
      if (matchesConditions(rule, state)) {
        result.rules_matched++;
        result.rules_applied.push(rule.id);
        result.prescriptions.push(rule.then);
      }
    }
  }
  
  // PHASE 6: WARNING rules (always evaluated)
  const warningRules = rulesByCategory.get(RuleCategory.WARNING) || [];
  for (const rule of warningRules) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      result.warnings.push(rule.then);
    }
  }
  
  // Resolve conflicts among diagnoses
  result.diagnoses = diagnosisCandidates;
  const conflictResult = resolveConflicts(diagnosisCandidates, state);
  result.final_diagnosis = conflictResult.primary_diagnosis;
  result.confidence_in_result = conflictResult.confidence_in_resolution;
  
  return result;
}

function groupRulesByCategory(rules: Rule[]): Map<RuleCategory, Rule[]> {
  const grouped = new Map<RuleCategory, Rule[]>();
  
  for (const category of Object.values(RuleCategory)) {
    if (typeof category === 'number') {
      grouped.set(category, []);
    }
  }
  
  for (const rule of rules) {
    if (!rule.active) continue;
    
    const categoryRules = grouped.get(rule.category) || [];
    categoryRules.push(rule);
    grouped.set(rule.category, categoryRules);
  }
  
  // Sort each category by priority (descending)
  for (const [category, categoryRules] of grouped) {
    categoryRules.sort((a, b) => b.priority - a.priority);
    grouped.set(category, categoryRules);
  }
  
  return grouped;
}

// ==================== BUILT-IN CORE RULES ====================

export const CORE_RULES: Rule[] = [
  // === OBSERVATION RULES ===
  {
    id: 'OBS_NDVI_STRESS_01',
    category: RuleCategory.OBSERVATION,
    priority: 80,
    when: {
      ndvi_level: [NDVILevel.VERY_LOW, NDVILevel.LOW]
    },
    then: {
      observation: 'VEGETATION_STRESS_DETECTED',
      observation_confidence: 0.9
    },
    scientific_basis: 'Low NDVI indicates reduced chlorophyll/biomass',
    active: true
  },
  {
    id: 'OBS_NDVI_DECLINE_01',
    category: RuleCategory.OBSERVATION,
    priority: 85,
    when: {
      ndvi_trend: [NDVITrend.SHARP_DECLINE, NDVITrend.DECLINING]
    },
    then: {
      observation: 'VEGETATION_DECLINING',
      observation_confidence: 0.85
    },
    scientific_basis: 'Declining NDVI trend indicates active stress or damage',
    active: true
  },
  {
    id: 'OBS_YELLOWING_01',
    category: RuleCategory.OBSERVATION,
    priority: 70,
    when: {
      visual_symptom: [VisualSymptom.GENERAL_YELLOWING, VisualSymptom.INTERVEINAL_YELLOWING]
    },
    then: {
      observation: 'CHLOROSIS_OBSERVED',
      observation_confidence: 0.8
    },
    active: true
  },
  
  // === DIAGNOSIS RULES ===
  {
    id: 'DIAG_N_DEFICIENCY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 75,
    when: {
      visual_symptom: [VisualSymptom.GENERAL_YELLOWING],
      soil_nitrogen: [SoilNitrogen.VERY_LOW, SoilNitrogen.LOW],
      crop_stage: [CropStage.VEGETATIVE, CropStage.TILLERING, CropStage.GRAND_GROWTH]
    },
    then: {
      possible_cause: 'NITROGEN_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.85
    },
    scientific_basis: 'ICAR Nutrient Management Guidelines',
    active: true
  },
  {
    id: 'DIAG_N_DEFICIENCY_02',
    category: RuleCategory.DIAGNOSIS,
    priority: 70,
    when: {
      visual_symptom: [VisualSymptom.GENERAL_YELLOWING, VisualSymptom.STUNTED_GROWTH],
      ndvi_trend: [NDVITrend.DECLINING, NDVITrend.SHARP_DECLINE],
      crop_stage: [CropStage.VEGETATIVE, CropStage.TILLERING]
    },
    then: {
      possible_cause: 'NITROGEN_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.7
    },
    scientific_basis: 'Yellowing with growth stagnation suggests N limitation',
    active: true
  },
  {
    id: 'DIAG_P_DEFICIENCY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 65,
    when: {
      soil_phosphorus: [SoilPhosphorus.VERY_LOW, SoilPhosphorus.LOW],
      crop_stage: [CropStage.SEEDLING, CropStage.VEGETATIVE]
    },
    then: {
      possible_cause: 'PHOSPHORUS_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.75
    },
    scientific_basis: 'Low soil P affects early root development',
    active: true
  },
  {
    id: 'DIAG_K_DEFICIENCY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 65,
    when: {
      visual_symptom: [VisualSymptom.LEAF_EDGE_BURN, VisualSymptom.LEAF_TIP_BURN],
      soil_potassium: [SoilPotassium.VERY_LOW, SoilPotassium.LOW]
    },
    then: {
      possible_cause: 'POTASSIUM_DEFICIENCY',
      cause_category: DiagnosisCategory.NUTRIENT_DEFICIENCY,
      cause_confidence: 0.8
    },
    scientific_basis: 'Marginal leaf scorch is classic K deficiency symptom',
    active: true
  },
  {
    id: 'DIAG_WATER_STRESS_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      visual_symptom: [VisualSymptom.WILTING, VisualSymptom.LEAF_ROLLING],
      water_stress: [WaterStress.MODERATE, WaterStress.SEVERE]
    },
    then: {
      possible_cause: 'WATER_STRESS',
      cause_category: DiagnosisCategory.WATER_STRESS,
      cause_confidence: 0.9
    },
    scientific_basis: 'Wilting with known water deficit confirms water stress',
    active: true
  },
  {
    id: 'DIAG_WATERLOG_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 78,
    when: {
      visual_symptom: [VisualSymptom.GENERAL_YELLOWING, VisualSymptom.WILTING],
      water_stress: [WaterStress.WATERLOGGED]
    },
    then: {
      possible_cause: 'WATERLOGGING_DAMAGE',
      cause_category: DiagnosisCategory.WATER_STRESS,
      cause_confidence: 0.85
    },
    scientific_basis: 'Root anoxia causes yellowing and wilting despite wet soil',
    active: true
  },
  
  // === EXCLUSION RULES ===
  {
    id: 'EXCL_NOT_N_IF_HIGH_N_01',
    category: RuleCategory.EXCLUSION,
    priority: 90,
    when: {
      soil_nitrogen: [SoilNitrogen.ADEQUATE, SoilNitrogen.HIGH, SoilNitrogen.EXCESS]
    },
    then: {
      exclude_cause: 'NITROGEN_DEFICIENCY',
      exclusion_reason: 'Soil nitrogen is adequate or high'
    },
    active: true
  },
  {
    id: 'EXCL_NOT_WATER_IF_ADEQUATE_01',
    category: RuleCategory.EXCLUSION,
    priority: 88,
    when: {
      water_stress: [WaterStress.NONE, WaterStress.MILD]
    },
    then: {
      exclude_cause: 'WATER_STRESS',
      exclusion_reason: 'No significant water stress detected'
    },
    active: true
  },
  
  // === SAFETY RULES ===
  {
    id: 'SAFETY_LOW_CONFIDENCE_01',
    category: RuleCategory.SAFETY,
    priority: 100,
    when: {
      data_confidence: [DataConfidence.VERY_LOW]
    },
    then: {
      block_prescription: true,
      safety_message: 'Insufficient data to make safe recommendations. Please provide more information (photo, soil test, or NDVI data).'
    },
    active: true
  },
  {
    id: 'SAFETY_UNKNOWN_CROP_01',
    category: RuleCategory.SAFETY,
    priority: 95,
    when: {
      crop_type: [CropType.UNKNOWN]
    },
    then: {
      block_prescription: true,
      safety_message: 'Cannot prescribe without knowing the crop type.'
    },
    active: true
  },
  
  // === PRESCRIPTION RULES ===
  {
    id: 'PRESC_N_SPLIT_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 70,
    when: {
      soil_nitrogen: [SoilNitrogen.VERY_LOW, SoilNitrogen.LOW],
      crop_stage: [CropStage.VEGETATIVE, CropStage.TILLERING],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'APPLY_FERTILIZER',
      action_details: {
        nutrient: 'NITROGEN',
        method: 'SPLIT_APPLICATION',
        timing: 'IMMEDIATE'
      },
      product_reference: 'UREA_SPLIT_SCHEDULE'
    },
    scientific_basis: 'ICAR fertilizer management for N deficiency',
    requires_confirmation: true,
    active: true
  },
  {
    id: 'PRESC_IRRIGATION_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 75,
    when: {
      water_stress: [WaterStress.MODERATE, WaterStress.SEVERE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'IRRIGATE',
      action_details: {
        method: 'LIGHT_FREQUENT',
        timing: 'IMMEDIATE'
      }
    },
    active: true
  },
  
  // === WARNING RULES ===
  {
    id: 'WARN_CRITICAL_NDVI_01',
    category: RuleCategory.WARNING,
    priority: 90,
    when: {
      ndvi_level: [NDVILevel.VERY_LOW],
      ndvi_trend: [NDVITrend.SHARP_DECLINE]
    },
    then: {
      warning_type: 'CRITICAL_VEGETATION_LOSS',
      warning_message: 'Critical vegetation stress detected. Immediate field inspection recommended.',
      warning_severity: 'CRITICAL'
    },
    active: true
  },

  // ==================== SUGARCANE RULES ====================
  
  // --- Sugarcane Pest: Shoot Borer ---
  {
    id: 'DIAG_SUGAR_SHOOT_BORER_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 85,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.DEAD_HEART],
      crop_stage: [CropStage.TILLERING, CropStage.VEGETATIVE]
    },
    then: {
      possible_cause: 'SHOOT_BORER',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.9
    },
    scientific_basis: 'ICAR Sugarcane Research - Dead heart in young canes indicates Chilo infuscatellus',
    active: true
  },
  {
    id: 'PRESC_SUGAR_SHOOT_BORER_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 85,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.DEAD_HEART],
      crop_stage: [CropStage.TILLERING, CropStage.VEGETATIVE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_INSECTICIDE',
      action_details: {
        pest: 'SHOOT_BORER',
        active_ingredient: 'CHLORANTRANILIPROLE',
        formulation: '18.5% SC',
        dosage: '0.4 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'MORNING_EVENING',
        phi_days: 21
      },
      product_reference: 'CORAGEN_CHLORANTRANILIPROLE'
    },
    scientific_basis: 'ICAR IPM recommendation for early borer attack',
    active: true
  },

  // --- Sugarcane Pest: Stem Borer ---
  {
    id: 'DIAG_SUGAR_STEM_BORER_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 82,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.STEM_BORING, VisualSymptom.HOLES_IN_STEM],
      crop_stage: [CropStage.GRAND_GROWTH, CropStage.MATURITY]
    },
    then: {
      possible_cause: 'STEM_BORER',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.88
    },
    scientific_basis: 'ICAR - Stem tunneling in mature canes indicates Chilo sacchariphagus',
    active: true
  },
  {
    id: 'PRESC_SUGAR_STEM_BORER_BIO_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 80,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.STEM_BORING],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'RELEASE_BIOCONTROL',
      action_details: {
        pest: 'STEM_BORER',
        bioagent: 'TRICHOGRAMMA_CHILONIS',
        release_rate: '50000/acre',
        frequency: '6 releases at weekly interval',
        method: 'CARD_RELEASE'
      },
      product_reference: 'TRICHOGRAMMA_CARDS'
    },
    scientific_basis: 'ICAR IPM - Biocontrol as first line for stem borer',
    active: true
  },

  // --- Sugarcane Disease: Red Rot ---
  {
    id: 'DIAG_SUGAR_RED_ROT_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 88,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.STEM_DISCOLORATION, VisualSymptom.WILTING],
      crop_stage: [CropStage.GRAND_GROWTH, CropStage.MATURITY]
    },
    then: {
      possible_cause: 'RED_ROT',
      cause_category: DiagnosisCategory.DISEASE,
      cause_confidence: 0.85
    },
    scientific_basis: 'ICAR SBI - Red internal tissue with alcohol smell indicates Colletotrichum falcatum',
    active: true
  },
  {
    id: 'PRESC_SUGAR_RED_ROT_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 85,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.STEM_DISCOLORATION],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'REMOVE_INFECTED',
      action_details: {
        disease: 'RED_ROT',
        method: 'ROGUE_INFECTED_CLUMPS',
        preventive: 'IMPROVE_DRAINAGE',
        fungicide: 'CARBENDAZIM_SETT_TREATMENT'
      }
    },
    scientific_basis: 'ICAR - No curative treatment, remove and prevent spread',
    active: true
  },

  // --- Sugarcane: Whitefly ---
  {
    id: 'DIAG_SUGAR_WHITEFLY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 78,
    when: {
      crop_type: [CropType.SUGARCANE],
      visual_symptom: [VisualSymptom.SOOTY_MOLD, VisualSymptom.GENERAL_YELLOWING]
    },
    then: {
      possible_cause: 'WHITEFLY',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.82
    },
    scientific_basis: 'ICAR - Sooty mold on leaves indicates whitefly honeydew',
    active: true
  },

  // ==================== WHEAT RULES ====================
  
  // --- Wheat Disease: Yellow Rust ---
  {
    id: 'DIAG_WHEAT_YELLOW_RUST_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 90,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.YELLOW_STRIPES, VisualSymptom.PUSTULES],
      crop_stage: [CropStage.TILLERING, CropStage.BOOTING, CropStage.HEADING]
    },
    then: {
      possible_cause: 'YELLOW_RUST',
      cause_category: DiagnosisCategory.DISEASE,
      cause_confidence: 0.92
    },
    scientific_basis: 'ICAR IIWBR - Yellow stripe pattern with uredinia indicates Puccinia striiformis',
    active: true
  },
  {
    id: 'PRESC_WHEAT_YELLOW_RUST_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 88,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.YELLOW_STRIPES, VisualSymptom.PUSTULES],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_FUNGICIDE',
      action_details: {
        disease: 'YELLOW_RUST',
        active_ingredient: 'PROPICONAZOLE',
        formulation: '25% EC',
        dosage: '1 ml/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EARLY_MORNING',
        repeat_after_days: 15,
        phi_days: 35
      },
      product_reference: 'TILT_PROPICONAZOLE'
    },
    scientific_basis: 'ICAR IPM - Immediate triazole spray on rust detection',
    active: true
  },

  // --- Wheat Disease: Powdery Mildew ---
  {
    id: 'DIAG_WHEAT_POWDERY_MILDEW_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 85,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.WHITE_POWDER, VisualSymptom.SPOTS_POWDERY]
    },
    then: {
      possible_cause: 'POWDERY_MILDEW',
      cause_category: DiagnosisCategory.DISEASE,
      cause_confidence: 0.9
    },
    scientific_basis: 'ICAR - White powdery growth on leaves indicates Blumeria graminis',
    active: true
  },
  {
    id: 'PRESC_WHEAT_POWDERY_MILDEW_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 82,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.WHITE_POWDER],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_FUNGICIDE',
      action_details: {
        disease: 'POWDERY_MILDEW',
        active_ingredient: 'SULFUR',
        formulation: '80% WP',
        dosage: '2.5 g/L',
        method: 'FOLIAR_SPRAY',
        timing: 'AVOID_HOT_HOURS'
      },
      product_reference: 'SULFUR_WP'
    },
    scientific_basis: 'ICAR - Wettable sulfur effective for powdery mildew',
    active: true
  },

  // --- Wheat Pest: Aphid ---
  {
    id: 'DIAG_WHEAT_APHID_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.HONEYDEW],
      crop_stage: [CropStage.HEADING, CropStage.FLOWERING, CropStage.GRAIN_FILLING]
    },
    then: {
      possible_cause: 'APHID',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.85
    },
    scientific_basis: 'ICAR - Curled leaves with sticky residue indicates aphid infestation',
    active: true
  },
  {
    id: 'PRESC_WHEAT_APHID_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 78,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.CURLED_LEAVES, VisualSymptom.HONEYDEW],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_INSECTICIDE',
      action_details: {
        pest: 'APHID',
        active_ingredient: 'IMIDACLOPRID',
        formulation: '17.8% SL',
        dosage: '0.3 ml/L',
        method: 'FOLIAR_SPRAY',
        phi_days: 21
      },
      product_reference: 'CONFIDOR_IMIDACLOPRID'
    },
    scientific_basis: 'ICAR IPM - Systemic insecticide for heavy aphid pressure',
    active: true
  },

  // --- Wheat: Termite ---
  {
    id: 'DIAG_WHEAT_TERMITE_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 82,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.WILTING, VisualSymptom.ROOT_DAMAGE],
      crop_stage: [CropStage.SEEDLING, CropStage.VEGETATIVE, CropStage.TILLERING]
    },
    then: {
      possible_cause: 'TERMITE',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.8
    },
    scientific_basis: 'ICAR - Sudden wilting with root damage in patches indicates termites',
    active: true
  },

  // ==================== COTTON RULES ====================
  
  // --- Cotton Pest: Pink Bollworm ---
  {
    id: 'DIAG_COTTON_PINK_BOLLWORM_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 92,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.BOLL_DAMAGE, VisualSymptom.ROSETTE_FLOWER],
      crop_stage: [CropStage.FLOWERING, CropStage.BOLL_FORMATION, CropStage.BOLL_OPENING]
    },
    then: {
      possible_cause: 'PINK_BOLLWORM',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.93
    },
    scientific_basis: 'ICAR CICR - Rosetted flowers and bored bolls indicate Pectinophora gossypiella',
    active: true
  },
  {
    id: 'PRESC_COTTON_PINK_BOLLWORM_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 90,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.BOLL_DAMAGE, VisualSymptom.ROSETTE_FLOWER],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_INSECTICIDE',
      action_details: {
        pest: 'PINK_BOLLWORM',
        active_ingredient: 'EMAMECTIN_BENZOATE',
        formulation: '5% SG',
        dosage: '0.4 g/L',
        method: 'FOLIAR_SPRAY',
        timing: 'EVENING',
        phi_days: 14
      },
      product_reference: 'PROCLAIM_EMAMECTIN'
    },
    scientific_basis: 'ICAR CICR IPM for bollworm complex',
    active: true
  },

  // --- Cotton Pest: American Bollworm ---
  {
    id: 'DIAG_COTTON_AMERICAN_BOLLWORM_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 90,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.BOLL_DAMAGE, VisualSymptom.LARGE_HOLES],
      crop_stage: [CropStage.FLOWERING, CropStage.BOLL_FORMATION]
    },
    then: {
      possible_cause: 'AMERICAN_BOLLWORM',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.88
    },
    scientific_basis: 'ICAR - Large irregular holes in bolls indicate Helicoverpa armigera',
    active: true
  },
  {
    id: 'PRESC_COTTON_BOLLWORM_BIO_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 88,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.BOLL_DAMAGE],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_BIOPESTICIDE',
      action_details: {
        pest: 'BOLLWORM',
        bioagent: 'NPV_HANPV',
        dosage: '250 LE/acre',
        method: 'FOLIAR_SPRAY',
        timing: 'LATE_EVENING',
        add_jaggery: '0.5%'
      },
      product_reference: 'HANPV_BIOCONTROL'
    },
    scientific_basis: 'ICAR IPM - HaNPV as first line for bollworm',
    active: true
  },

  // --- Cotton Pest: Whitefly ---
  {
    id: 'DIAG_COTTON_WHITEFLY_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 85,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.STICKY_LEAVES, VisualSymptom.SOOTY_MOLD, VisualSymptom.GENERAL_YELLOWING]
    },
    then: {
      possible_cause: 'WHITEFLY',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.88
    },
    scientific_basis: 'ICAR - Sticky leaves with sooty mold indicates Bemisia tabaci',
    active: true
  },
  {
    id: 'PRESC_COTTON_WHITEFLY_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 82,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.STICKY_LEAVES, VisualSymptom.SOOTY_MOLD],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_INSECTICIDE',
      action_details: {
        pest: 'WHITEFLY',
        active_ingredient: 'SPIROMESIFEN',
        formulation: '22.9% SC',
        dosage: '0.8 ml/L',
        method: 'FOLIAR_SPRAY',
        target: 'UNDERSURFACE_OF_LEAVES',
        phi_days: 21
      },
      product_reference: 'OBERON_SPIROMESIFEN'
    },
    scientific_basis: 'ICAR CICR - Growth regulator effective against whitefly nymphs',
    active: true
  },

  // --- Cotton Disease: Bacterial Blight ---
  {
    id: 'DIAG_COTTON_BACTERIAL_BLIGHT_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 86,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.ANGULAR_SPOTS, VisualSymptom.WATER_SOAKED_LESIONS]
    },
    then: {
      possible_cause: 'BACTERIAL_BLIGHT',
      cause_category: DiagnosisCategory.DISEASE,
      cause_confidence: 0.87
    },
    scientific_basis: 'ICAR - Angular water-soaked spots indicate Xanthomonas citri pv. malvacearum',
    active: true
  },
  {
    id: 'PRESC_COTTON_BACTERIAL_BLIGHT_01',
    category: RuleCategory.PRESCRIPTION,
    priority: 84,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.ANGULAR_SPOTS],
      data_confidence: [DataConfidence.MEDIUM, DataConfidence.HIGH]
    },
    then: {
      action_type: 'SPRAY_BACTERICIDE',
      action_details: {
        disease: 'BACTERIAL_BLIGHT',
        active_ingredient: 'STREPTOCYCLINE',
        formulation: 'SP',
        dosage: '0.1 g/L',
        combine_with: 'COPPER_OXYCHLORIDE_2.5g/L',
        method: 'FOLIAR_SPRAY'
      },
      product_reference: 'STREPTOCYCLINE_COC_MIX'
    },
    scientific_basis: 'ICAR - Antibiotic + copper combination for bacterial control',
    active: true
  },

  // --- Cotton: Jassid/Leafhopper ---
  {
    id: 'DIAG_COTTON_JASSID_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 78,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.LEAF_CURLING, VisualSymptom.LEAF_EDGE_BURN]
    },
    then: {
      possible_cause: 'JASSID',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.82
    },
    scientific_basis: 'ICAR - Leaf curling with marginal burn indicates Amrasca biguttula',
    active: true
  },

  // ==================== COMMON CROP RULES ====================
  
  // --- Common Pest: Thrips ---
  {
    id: 'DIAG_COMMON_THRIPS_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 75,
    when: {
      visual_symptom: [VisualSymptom.SILVERING, VisualSymptom.LEAF_DISTORTION]
    },
    then: {
      possible_cause: 'THRIPS',
      cause_category: DiagnosisCategory.PEST,
      cause_confidence: 0.8
    },
    scientific_basis: 'ICAR - Silvery sheen on leaves indicates thrips feeding damage',
    active: true
  },

  // --- Common Disease: Root Rot ---
  {
    id: 'DIAG_COMMON_ROOT_ROT_01',
    category: RuleCategory.DIAGNOSIS,
    priority: 80,
    when: {
      visual_symptom: [VisualSymptom.WILTING, VisualSymptom.ROOT_DISCOLORATION],
      water_stress: [WaterStress.WATERLOGGED]
    },
    then: {
      possible_cause: 'ROOT_ROT',
      cause_category: DiagnosisCategory.DISEASE,
      cause_confidence: 0.85
    },
    scientific_basis: 'ICAR - Wilting with waterlogging indicates fungal root rot',
    active: true
  },

  // --- Safety: Flowering Stage Pollinator Protection ---
  {
    id: 'SAFETY_POLLINATOR_PROTECT_01',
    category: RuleCategory.SAFETY,
    priority: 98,
    when: {
      crop_stage: [CropStage.FLOWERING],
      custom: (state) => state.severity !== SeverityLevel.CRITICAL
    },
    then: {
      block_prescription: false,
      safety_message: 'Crop in flowering stage - avoid neonicotinoids and bee-toxic chemicals. Use bio-pesticides or spray in late evening only.'
    },
    scientific_basis: 'FAO Pollinator Protection Guidelines',
    active: true
  },

  // === WARNING RULES FOR SPECIFIC CONDITIONS ===
  {
    id: 'WARN_BOLLWORM_OUTBREAK_01',
    category: RuleCategory.WARNING,
    priority: 88,
    when: {
      crop_type: [CropType.COTTON],
      visual_symptom: [VisualSymptom.BOLL_DAMAGE],
      severity: [SeverityLevel.HIGH, SeverityLevel.CRITICAL]
    },
    then: {
      warning_type: 'BOLLWORM_OUTBREAK',
      warning_message: 'High bollworm pressure detected. Immediate IPM action required to prevent crop loss.',
      warning_severity: 'HIGH'
    },
    active: true
  },
  {
    id: 'WARN_RUST_SPREAD_01',
    category: RuleCategory.WARNING,
    priority: 92,
    when: {
      crop_type: [CropType.WHEAT],
      visual_symptom: [VisualSymptom.YELLOW_STRIPES, VisualSymptom.PUSTULES],
      ndvi_trend: [NDVITrend.SHARP_DECLINE]
    },
    then: {
      warning_type: 'RUST_EPIDEMIC_RISK',
      warning_message: 'Yellow rust spreading rapidly. Alert neighboring farmers. Immediate fungicide spray required.',
      warning_severity: 'CRITICAL'
    },
    active: true
  }
];

// ==================== PHASE-12: MERGE ALL RULES ====================

/**
 * All rules including:
 * - Core rules (crop-specific diagnosis)
 * - Wheat IPM Rules (ICAR-IIWBR aligned)
 * - Universal Observation Rules (work for ALL crops)
 * - BUNDLED RULES from src/decision-graph/ (2,000+ ICAR rules)
 * 
 * PHASE-12: Universal rules are evaluated FIRST (higher priority)
 * to provide base observations for any crop
 * 
 * PHASE-13: Bundled rules from src/decision-graph/ are now included
 * providing complete ICAR agricultural intelligence
 */
export const ALL_RULES: Rule[] = [
  ...ALL_UNIVERSAL_RULES,  // PHASE-12: Universal crop-agnostic rules FIRST
  ...CORE_RULES,           // Crop-specific diagnosis rules
  ...ALL_WHEAT_IPM_RULES   // Wheat-specific IPM rules
];

/**
 * PHASE-13: Get complete rule set including bundled rules
 * This provides access to all 2,000+ ICAR rules
 */
export function getAllRulesWithBundled(): Rule[] {
  const bundledRules = loadAllRules();
  console.log(`📦 Loaded ${bundledRules.length} bundled rules from decision-graph`);
  
  // Convert bundled rules to Rule format and combine
  const convertedBundled = bundledRules.map(br => convertBundledToRule(br));
  
  return [
    ...ALL_UNIVERSAL_RULES,
    ...CORE_RULES,
    ...ALL_WHEAT_IPM_RULES,
    ...convertedBundled
  ];
}

/**
 * Convert ExecutableRule from bundled format to Rule format
 */
function convertBundledToRule(bundled: ExecutableRule): Rule {
  return {
    id: bundled.rule_id,
    category: mapBundledCategory(bundled.category),
    priority: bundled.priority || 50,
    when: {
      custom: (state: CanonicalState) => {
        try {
          // Create input for bundled rule evaluation
          const input = {
            crop_code: state.crop_type?.toLowerCase() || '',
            crop_stage: state.crop_stage?.toLowerCase() || '',
            days_after_sowing: 0, // Would need from context
            ndvi_state: state.ndvi_level || 'UNKNOWN',
            soil_states: {
              nitrogen: state.soil_nitrogen || 'UNKNOWN',
              phosphorus: state.soil_phosphorus || 'UNKNOWN',
              potassium: state.soil_potassium || 'UNKNOWN',
              moisture: state.water_stress || 'UNKNOWN'
            },
            weather: {},
            symptom: state.visual_symptom || 'UNKNOWN'
          };
          return bundled.condition(input);
        } catch {
          return false;
        }
      }
    },
    then: {
      possible_cause: bundled.cause,
      cause_confidence: bundled.cause_confidence || 0.7
    },
    scientific_basis: bundled.scientific_basis || bundled.scientific_source,
    active: true
  };
}

/**
 * Map bundled category string to RuleCategory enum
 */
function mapBundledCategory(category: string): RuleCategory {
  const categoryMap: Record<string, RuleCategory> = {
    'observation': RuleCategory.OBSERVATION,
    'diagnosis': RuleCategory.DIAGNOSIS,
    'exclusion': RuleCategory.EXCLUSION,
    'safety': RuleCategory.SAFETY,
    'prescription': RuleCategory.PRESCRIPTION,
    'warning': RuleCategory.WARNING
  };
  return categoryMap[category?.toLowerCase()] || RuleCategory.DIAGNOSIS;
}

/**
 * PHASE-13: Evaluate bundled rules for a specific crop
 */
export function evaluateBundledRulesForCrop(
  cropCode: string,
  input: Record<string, any>
): { ruleId: string; cause: string; confidence: number }[] {
  const rules = loadRulesForCrop(cropCode);
  return evaluateBundledRules(rules, input);
}

/**
 * PHASE-13: Get total rule count including bundled
 */
export function getTotalRuleCount(): { core: number; bundled: number; total: number } {
  const bundledCount = getRuleCount();
  const coreCount = ALL_RULES.length;
  return {
    core: coreCount,
    bundled: bundledCount,
    total: coreCount + bundledCount
  };
}

// ==================== EXPORTS ====================

export const LayeredRuleEvaluator = {
  evaluate: evaluateRulesLayered,
  matchesConditions,
  CORE_RULES,
  ALL_RULES,
  getAllRulesWithBundled,
  evaluateBundledRulesForCrop,
  getTotalRuleCount,
  RuleCategory,
  validateWheatBiocontrol
};

// Log rule counts on load
console.log(`✅ Layered Rule Evaluator loaded: ${ALL_RULES.length} core rules`);
try {
  const bundledCount = getRuleCount();
  console.log(`   📦 Bundled rules available: ${bundledCount}`);
} catch (e) {
  console.log(`   📦 Bundled rules: not yet generated (run npm run bundle-rules)`);
}
