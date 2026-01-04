// ============= LAYERED RULE EVALUATION PIPELINE =============
// Evaluates rules in correct order: OBSERVATION → DIAGNOSIS → EXCLUSION → SAFETY → PRESCRIPTION
// This ensures deterministic, auditable, and safe decision making

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

// ==================== RULE CATEGORIES ====================

export enum RuleCategory {
  OBSERVATION = 1,    // Interpret raw signals (NDVI decline → vegetation stress)
  DIAGNOSIS = 2,      // Identify possible causes (yellowing + low N → N deficiency)
  EXCLUSION = 3,      // Rule out misdiagnosis (not disease if no pathogens)
  SAFETY = 4,         // Can block all further processing (PHI, pollinator)
  PRESCRIPTION = 5,   // Actions (ONLY if gates pass)
  WARNING = 6         // Alerts (weather, disease outbreak)
}

// ==================== RULE INTERFACE ====================

export interface Rule {
  id: string;
  category: RuleCategory;
  priority: number;  // Higher = more important
  
  // Conditions - all must match
  when: RuleConditions;
  
  // Assertions when rule fires
  then: RuleAssertions;
  
  // Metadata
  scientific_basis?: string;
  requires_confirmation?: boolean;
  active: boolean;
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
  
  // Custom conditions
  custom?: (state: CanonicalState) => boolean;
}

export interface RuleAssertions {
  // For OBSERVATION rules
  observation?: string;
  observation_confidence?: number;
  
  // For DIAGNOSIS rules
  possible_cause?: string;
  cause_category?: DiagnosisCategory;
  cause_confidence?: number;
  
  // For EXCLUSION rules
  exclude_cause?: string;
  exclusion_reason?: string;
  
  // For SAFETY rules
  block_prescription?: boolean;
  safety_message?: string;
  
  // For PRESCRIPTION rules
  action_type?: string;
  action_details?: Record<string, any>;
  product_reference?: string;
  
  // For WARNING rules
  warning_type?: string;
  warning_message?: string;
  warning_severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

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
  }
];

// ==================== EXPORTS ====================

export const LayeredRuleEvaluator = {
  evaluate: evaluateRulesLayered,
  matchesConditions,
  CORE_RULES,
  RuleCategory
};
