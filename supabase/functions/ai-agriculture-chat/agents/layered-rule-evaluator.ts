// ============= LAYERED RULE EVALUATION PIPELINE - v3.0 with Graph Control & ETL =============
// PHASE-17: Enhanced with graph control, temporal constraints, and ETL validation
// Rules loaded from database at runtime to prevent bundle timeout

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

import {
  loadAllRules,
  loadRulesForCrop,
  getRuleCount,
  getConditionLedger,
  ConditionStatus,
  type ExecutableRule,
  type ConditionEntry
} from '../bundled-rules/loader.ts';

import { getCropCodeVariants } from '../utils/crop-code-normalizer.ts';

// PHASE-16: Import SymbolicReasoner for proper JSON condition evaluation
import {
  SymbolicReasoner,
  type SymbolicFact
} from '../decision/symbolic-reasoner.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE-17: GRAPH CONTROL & SAFETY VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════
import {
  validateGraphConstraints,
  checkRuleBlocking,
  checkPrerequisites,
  logGraphValidation,
  type GraphValidationInput,
  type GraphValidationResult
} from '../decision/graph-control-validator.ts';

import {
  shouldBlockSpray,
  logETLValidation,
  loadETLStandards,
  lookupETLFromStandards,
  type ETLInput,
  type ETLContext,
  type ETLValidationResult
} from '../decision/etl-gate.ts';

import {
  getSafetyWarning,
  formatSafetyWarning,
  checkResistanceRotation,
  type SafetyLevel,
  type SafetyWarning
} from '../decision/safety-enhancement.ts';

// Fix 1: Import nutrition conflict arbitration gates
import {
  passesZincSpecificityGate,
  passesMicronutrientSpecificityGate,
  checkWaterStressDominance,
  checkMacronutrientDominance
} from '../decision/nutrition-conflict-arbitrator.ts';

// PHASE-16: Singleton instance for rule evaluation
let symbolicReasonerInstance: SymbolicReasoner | null = null;

function getSymbolicReasoner(): SymbolicReasoner {
  if (!symbolicReasonerInstance) {
    symbolicReasonerInstance = new SymbolicReasoner();
  }
  return symbolicReasonerInstance;
}

// ==================== TYPE DEFINITIONS ====================

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

// ═══════════════════════════════════════════════════════════════════════════
// MANDATORY INTERFACE: MatchedResponse for primary decision eligibility
// CRITICAL: A response is ONLY eligible for primary decision if it has:
//   - rule_id (EXISTS)
//   - action_type (NOT NULL)
//   - action_text OR i18n_key (NOT NULL) - LLM narration layer handles text
// NOTE: response_en/hi/mr columns were DROPPED per SSOT architecture
// ═══════════════════════════════════════════════════════════════════════════
export interface MatchedResponse {
  rule_id: string;
  cause: string;
  action_type: string;  // MANDATORY - required for primary eligibility
  priority?: number;     // For deterministic selection
  confidence_score?: number;
  // RESPONSE CONTRACT (language-independent)
  action_text?: string;
  reason_text?: string;
  knowledge_text?: string;
  i18n_key?: string;
  // Fix 4: conditions_json for downstream arbitration inspection
  conditions_json?: Record<string, unknown>;
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 8: Rich agronomic fields for deterministic response builder
  // ═══════════════════════════════════════════════════════════════════════════
  active_ingredient?: string;
  dosage_per_acre?: string;
  water_volume_per_acre?: string;
  application_method?: string;
  target_pest_stage?: string;
  chemical_class?: string;
  treatment_type?: string;
  biological_group?: string;
  phi_days?: number;
  reentry_interval_hours?: number;
  bee_toxicity?: string;
  aquatic_toxicity?: string;
  farmer_safety_level?: string;
  regulatory_status?: string;
  organic_alternative?: string;
  ipm_level?: number;
  mode_of_action?: string;
  resistance_group?: string;
  // Cost
  material_cost_per_acre_min?: number;
  material_cost_per_acre_max?: number;
  labor_cost_per_acre_min?: number;
  labor_cost_per_acre_max?: number;
  labor_hours_per_acre?: number;
  equipment_required?: string[];
  equipment_cost_per_acre?: number;
  total_cost_estimated?: number;
  // ROI
  roi_yield_gain_pct?: number;
  roi_cost_saved_min?: number;
  roi_cost_saved_max?: number;
  roi_net_score?: number;
  roi_confidence?: number;
  // Monitoring
  success_indicators?: string[];
  failure_indicators?: string[];
  // Environmental
  min_temperature?: number;
  max_temperature?: number;
  max_wind_speed?: number;
  rain_delay_hours?: number;
  weather_dependency?: any;
  // References
  scientific_source?: string;
  icar_package_ref?: string;
  university_source?: string;
  // Confidence/Risk
  risk_level?: string;
  response_severity?: string;
  data_authority_rank?: number;
  // Legacy
  response_mr?: string;
  response_hi?: string;
  response_en?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MANDATORY INTERFACE: PrimaryDecision - built from selected MatchedResponse
// This is the ACTUAL PRIMARY DECISION passed to UnifiedGate and LLM Formatter
// NOTE: All narration is LLM-generated - no language-specific columns
// ═══════════════════════════════════════════════════════════════════════════
export interface PrimaryDecision {
  rule_id: string;
  action_type: string;
  priority: number;
  confidence_score: number;
  // LEDGER-DERIVED AUTHORITY FIELDS (SSOT for confidence)
  normalized_score: number;      // raw ledger ratio (0-1)
  total_required: number;        // denominator from ledger
  passed_required: number;       // numerator from ledger
  weighted_confidence: number;   // density-adjusted final confidence
  // RESPONSE CONTRACT (language-independent)
  action_text?: string;
  reason_text?: string;
  knowledge_text?: string;
  i18n_key?: string;
  // ═══════════════════════════════════════════════════════════════════════════
  // RICH AGRONOMIC FIELDS — Must match MatchedResponse for full propagation
  // ═══════════════════════════════════════════════════════════════════════════
  cause?: string | null;
  active_ingredient?: string | null;
  dosage_per_acre?: string | null;
  water_volume_per_acre?: string | null;
  application_method?: string | null;
  target_pest_stage?: string | null;
  chemical_class?: string | null;
  treatment_type?: string | null;
  biological_group?: string | null;
  phi_days?: number | null;
  reentry_interval_hours?: number | null;
  bee_toxicity?: string | null;
  aquatic_toxicity?: string | null;
  farmer_safety_level?: string | null;
  regulatory_status?: string | null;
  organic_alternative?: string | null;
  ipm_level?: number | null;
  mode_of_action?: string | null;
  resistance_group?: string | null;
  // Cost
  material_cost_per_acre_min?: number | null;
  material_cost_per_acre_max?: number | null;
  labor_cost_per_acre_min?: number | null;
  labor_cost_per_acre_max?: number | null;
  labor_hours_per_acre?: number | null;
  equipment_required?: string[] | null;
  equipment_cost_per_acre?: number | null;
  total_cost_estimated?: number | null;
  // ROI
  roi_yield_gain_pct?: number | null;
  roi_cost_saved_min?: number | null;
  roi_cost_saved_max?: number | null;
  roi_net_score?: number | null;
  roi_confidence?: number | null;
  // Monitoring
  success_indicators?: string[] | null;
  failure_indicators?: string[] | null;
  // Environmental
  min_temperature?: number | null;
  max_temperature?: number | null;
  max_wind_speed?: number | null;
  rain_delay_hours?: number | null;
  weather_dependency?: any;
  // References
  scientific_source?: string | null;
  scientific_basis?: string | null;
  icar_package_ref?: string | null;
  university_source?: string | null;
  // Confidence/Risk
  risk_level?: string | null;
  response_severity?: string | null;
  data_authority_rank?: number | null;
  // Legacy
  response_mr?: string | null;
  response_hi?: string | null;
  response_en?: string | null;
}

export interface LayeredRuleResult {
  rules_evaluated: number;
  rules_matched: number;
  rules_applied: string[];
  rules_blocked_by_graph: string[];
  rules_blocked_by_etl: string[];
  observations: string[];
  diagnoses: Diagnosis[];
  final_diagnosis: Diagnosis | null;
  exclusions: { cause: string; reason: string }[];
  prescription_allowed: boolean;
  prescription_gate_reason?: string;
  safety_blocks: { rule_id: string; message: string }[];
  prescriptions: RuleAssertions[];
  warnings: RuleAssertions[];
  safety_warnings: string[];
  confidence_in_result: number;
  // All matched responses from evaluation (for audit/fallback)
  matched_responses: MatchedResponse[];
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: PRIMARY_DECISION - Built from highest-priority eligible response
  // This MUST be passed to orchestrator.ts and mapped into decision_output
  // ═══════════════════════════════════════════════════════════════════════════
  primary_decision: PrimaryDecision | null;
}

// ==================== STUB: Empty rule arrays ====================
// Rules loaded from database at runtime

const ALL_WHEAT_IPM_RULES: Rule[] = [];
const ALL_UNIVERSAL_RULES: Rule[] = [];
export const CORE_RULES: Rule[] = [];

export const ALL_RULES: Rule[] = [];

// ==================== CONDITION MATCHING (STRICT AND-BASED VALIDATION) ====================

/**
 * STRICT CONSTRAINT-BASED CONDITION VALIDATION
 * 
 * CRITICAL: Any condition requiring contextual data FAILS if canonical context 
 * value is UNKNOWN, NOT_TESTED, null, or undefined.
 * Missing/indeterminate data NEVER passes a condition check.
 */
const INDETERMINATE_VALUES = new Set(['', 'UNKNOWN', 'NOT_TESTED', 'N/A', 'UNDEFINED', 'NULL']);

function isDataPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string' && INDETERMINATE_VALUES.has(value.toUpperCase().trim())) return false;
  return true;
}

function matchesConditions(rule: Rule, state: CanonicalState): boolean {
  const conditions = rule.when;
  
  if (conditions.custom && !conditions.custom(state)) return false;
  if (conditions.crop_type?.length && !conditions.crop_type.includes(state.crop_type as CropType)) return false;
  if (conditions.crop_stage?.length && !conditions.crop_stage.includes(state.crop_stage as CropStage)) return false;
  if (conditions.visual_symptom?.length && !conditions.visual_symptom.includes(state.visual_symptom as VisualSymptom)) return false;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STRICT: Contextual data conditions FAIL if data is missing/UNKNOWN
  // This prevents rules requiring NDVI/soil/weather from matching without evidence
  // ═══════════════════════════════════════════════════════════════════════════
  if (conditions.ndvi_level?.length) {
    if (!isDataPresent(state.ndvi_level)) return false;
    if (!conditions.ndvi_level.includes(state.ndvi_level as NDVILevel)) return false;
  }
  if (conditions.ndvi_trend?.length) {
    if (!isDataPresent(state.ndvi_trend)) return false;
    if (!conditions.ndvi_trend.includes(state.ndvi_trend as NDVITrend)) return false;
  }
  if (conditions.soil_nitrogen?.length) {
    if (!isDataPresent(state.soil_nitrogen)) return false;
    if (!conditions.soil_nitrogen.includes(state.soil_nitrogen as SoilNitrogen)) return false;
  }
  if (conditions.soil_phosphorus?.length) {
    if (!isDataPresent(state.soil_phosphorus)) return false;
    if (!conditions.soil_phosphorus.includes(state.soil_phosphorus as SoilPhosphorus)) return false;
  }
  if (conditions.soil_potassium?.length) {
    if (!isDataPresent(state.soil_potassium)) return false;
    if (!conditions.soil_potassium.includes(state.soil_potassium as SoilPotassium)) return false;
  }
  if (conditions.water_stress?.length) {
    if (!isDataPresent(state.water_stress)) return false;
    if (!conditions.water_stress.includes(state.water_stress as WaterStress)) return false;
  }
  if (conditions.severity?.length && !conditions.severity.includes(state.severity as SeverityLevel)) return false;
  
  return true;
}

// ==================== MAIN EVALUATION ====================

/**
 * PHASE-17: Enhanced rule evaluation with graph control, ETL, and safety
 * CRITICAL: All array operations are now null-safe to prevent crashes
 */
export function evaluateRulesLayered(
  rules: Rule[], 
  state: CanonicalState,
  options?: {
    daysSinceSowing?: number;
    observedPestCount?: number;
    recentTreatments?: { resistance_group: string; date: string }[];
    traceId?: string;
    /** When PrescriptionGate overrides LOW confidence due to strong symptom evidence,
     *  this flag relaxes the pre-selection confidence gate from 0.60 → 0.40 */
    prescriptionGateOverride?: boolean;
  }
): LayeredRuleResult {
  // PHASE-16: Safe initialization - prevent undefined errors
  const safeRules = Array.isArray(rules) ? rules : [];
  const traceId = options?.traceId || `eval_${Date.now()}`;
  
  const result: LayeredRuleResult = {
    rules_evaluated: 0,
    rules_matched: 0,
    rules_applied: [],
    rules_blocked_by_graph: [],
    rules_blocked_by_etl: [],
    observations: [],
    diagnoses: [],
    final_diagnosis: null,
    exclusions: [],
    prescription_allowed: true,
    safety_blocks: [],
    prescriptions: [],
    warnings: [],
    safety_warnings: [],
    confidence_in_result: 0.5,
    matched_responses: [],
    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL: primary_decision is NULL until explicitly built from eligible response
    // This will be populated AFTER evaluation via selectPrimaryDecision()
    // ═══════════════════════════════════════════════════════════════════════════
    primary_decision: null
  };
  
  // PHASE-16: Early return if no rules to evaluate
  if (safeRules.length === 0) {
    console.warn('⚠️ [LayeredRuleEvaluator] No rules to evaluate - returning empty result');
    return result;
  }
  
  // PHASE-17: Graph control context - track fired rules and their blocking relationships
  const firedRules = new Map<string, string[]>(); // rule_id -> blocks_rule_ids
  const firedRuleIds = new Set<string>();
  
  const diagnosisCandidates: Diagnosis[] = [];
  const rulesByCategory = groupRulesByCategory(safeRules);
  
  // PHASE 1: OBSERVATION
  for (const rule of rulesByCategory.get(RuleCategory.OBSERVATION) || []) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      if (rule.then.observation) result.observations.push(rule.then.observation);
    }
  }
  
  // PHASE 2: DIAGNOSIS
  for (const rule of rulesByCategory.get(RuleCategory.DIAGNOSIS) || []) {
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
        
        // CRITICAL: Collect response text from matched diagnosis rules for LLM formatting
        // SSOT ARCHITECTURE: action_text + i18n_key are the only response fields
        // response_mr/hi/en columns were DROPPED - narration is LLM-generated
        const actionDetails = rule.then.action_details || {};
        const ruleActionType = rule.then.action_type || actionDetails.action_type;
        const rulePriority = rule.priority || 50;
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PRIMARY_ACTION_ELIGIBILITY: Only add if action_type exists AND has content
        // ═══════════════════════════════════════════════════════════════════════════
        if (ruleActionType && (actionDetails.action_text || actionDetails.i18n_key)) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause || 'DIAGNOSIS',
            action_type: ruleActionType,
            priority: rulePriority,
            confidence_score: rule.then.cause_confidence,
            action_text: actionDetails.action_text,
            reason_text: actionDetails.reason_text,
            knowledge_text: actionDetails.knowledge_text,
            i18n_key: actionDetails.i18n_key,
            conditions_json: actionDetails.conditions_json || null,
            // PRODUCTION FIX: Propagate ALL rich agronomic fields (matching PRESCRIPTION path)
            active_ingredient: actionDetails.active_ingredient,
            dosage_per_acre: actionDetails.dosage_per_acre,
            water_volume_per_acre: actionDetails.water_volume_per_acre,
            application_method: actionDetails.application_method,
            target_pest_stage: actionDetails.target_pest_stage,
            chemical_class: actionDetails.chemical_class,
            treatment_type: actionDetails.treatment_type,
            biological_group: actionDetails.biological_group,
            phi_days: actionDetails.phi_days,
            reentry_interval_hours: actionDetails.reentry_interval_hours,
            bee_toxicity: actionDetails.bee_toxicity,
            aquatic_toxicity: actionDetails.aquatic_toxicity,
            farmer_safety_level: actionDetails.farmer_safety_level,
            regulatory_status: actionDetails.regulatory_status,
            organic_alternative: actionDetails.organic_alternative,
            ipm_level: actionDetails.ipm_level,
            mode_of_action: actionDetails.mode_of_action,
            resistance_group: actionDetails.resistance_group,
            material_cost_per_acre_min: actionDetails.material_cost_per_acre_min,
            material_cost_per_acre_max: actionDetails.material_cost_per_acre_max,
            labor_cost_per_acre_min: actionDetails.labor_cost_per_acre_min,
            labor_cost_per_acre_max: actionDetails.labor_cost_per_acre_max,
            labor_hours_per_acre: actionDetails.labor_hours_per_acre,
            equipment_required: actionDetails.equipment_required,
            equipment_cost_per_acre: actionDetails.equipment_cost_per_acre,
            total_cost_estimated: actionDetails.total_cost_estimated,
            roi_yield_gain_pct: actionDetails.roi_yield_gain_pct,
            roi_cost_saved_min: actionDetails.roi_cost_saved_min,
            roi_cost_saved_max: actionDetails.roi_cost_saved_max,
            roi_net_score: actionDetails.roi_net_score,
            roi_confidence: actionDetails.roi_confidence,
            success_indicators: actionDetails.success_indicators,
            failure_indicators: actionDetails.failure_indicators,
            min_temperature: actionDetails.min_temperature,
            max_temperature: actionDetails.max_temperature,
            max_wind_speed: actionDetails.max_wind_speed,
            rain_delay_hours: actionDetails.rain_delay_hours,
            weather_dependency: actionDetails.weather_dependency,
            scientific_source: rule.scientific_basis,
            icar_package_ref: actionDetails.icar_package_ref,
            university_source: actionDetails.university_source,
            risk_level: actionDetails.risk_level,
            response_severity: actionDetails.response_severity,
            data_authority_rank: actionDetails.data_authority_rank,
          });
        } else if (ruleActionType) {
          // Rules with action_type but no content - still eligible with cause
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause || 'DIAGNOSIS',
            action_type: ruleActionType,
            priority: rulePriority
          });
        }
      }
    }
  }
  
  // PHASE 3: EXCLUSION
  for (const rule of rulesByCategory.get(RuleCategory.EXCLUSION) || []) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      if (rule.then.exclude_cause) {
        result.exclusions.push({ cause: rule.then.exclude_cause, reason: rule.then.exclusion_reason || 'Excluded by rule' });
      }
    }
  }
  
  // PHASE 4: SAFETY
  for (const rule of rulesByCategory.get(RuleCategory.SAFETY) || []) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      if (rule.then.block_prescription) {
        result.prescription_allowed = false;
        result.safety_blocks.push({ rule_id: rule.id, message: rule.then.safety_message || 'Blocked' });
      }
    }
  }
  
  // Check prescription gate
  const gateResult = checkPrescriptionGate(state);
  if (!gateResult.allowed) {
    result.prescription_allowed = false;
    result.prescription_gate_reason = gateResult.reason;
  }
  
  // PHASE 5: PRESCRIPTION with Graph Control, ETL, and Safety
  if (result.prescription_allowed) {
    for (const rule of rulesByCategory.get(RuleCategory.PRESCRIPTION) || []) {
      result.rules_evaluated++;
      
      if (!matchesConditions(rule, state)) continue;
      
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE-17: GRAPH CONTROL VALIDATION
      // Check if this rule is blocked by any previously fired rule
      // ═══════════════════════════════════════════════════════════════════════
      const graphInput: GraphValidationInput = {
        rule_id: rule.id,
        blocks_rule_ids: rule.then.action_details?.blocks_rule_ids || [],
        prerequisite_rule_ids: rule.then.action_details?.prerequisite_rule_ids || []
      };
      
      const graphResult = validateGraphConstraints(graphInput, firedRules, firedRuleIds);
      logGraphValidation(rule.id, graphResult, traceId);
      
      if (!graphResult.can_fire) {
        result.rules_blocked_by_graph.push(rule.id);
        console.log(`🚫 [GraphControl] Rule ${rule.id} blocked: ${graphResult.reason}`);
        continue; // Skip this rule
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE-17: ETL VALIDATION (for pesticide/treatment rules)
      // ═══════════════════════════════════════════════════════════════════════
      const etlApplicable = rule.then.action_details?.etl_applicable;
      if (etlApplicable !== false) {
        // Try DB-backed ETL standards first, fall back to rule-level values
        const pestCode = rule.then.action_details?.pest_code || rule.condition?.condition_code;
        const dbETL = lookupETLFromStandards(pestCode, options?.cropCode, options?.growthStage);
        
        const etlInput: ETLInput = {
          rule_id: rule.id,
          etl_applicable: rule.then.action_details?.etl_applicable,
          etl_value_min: dbETL?.etl_value_min ?? rule.then.action_details?.etl_value_min,
          etl_value_max: dbETL?.etl_value_max ?? rule.then.action_details?.etl_value_max,
          action_type: rule.then.action_type,
          ipm_level: rule.then.action_details?.ipm_level
        };
        
        const etlContext: ETLContext = {
          observed_pest_count: options?.observedPestCount,
          has_photo_confirmation: false
        };
        
        const etlResult = shouldBlockSpray(etlInput, etlContext);
        logETLValidation(rule.id, etlResult, traceId);
        
        if (!etlResult.spray_allowed && etlResult.recommendation !== 'ETL_NOT_APPLICABLE') {
          result.rules_blocked_by_etl.push(rule.id);
          console.log(`🚫 [ETL] Rule ${rule.id} blocked: ${etlResult.reason}`);
          continue; // Skip this rule - pest count below threshold
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE-17: RESISTANCE ROTATION CHECK
      // ═══════════════════════════════════════════════════════════════════════
      const resistanceGroup = rule.then.action_details?.resistance_group;
      if (resistanceGroup && options?.recentTreatments) {
        const recentGroups = options.recentTreatments.map(t => t.resistance_group);
        const rotationResult = checkResistanceRotation(resistanceGroup, recentGroups);
        
        if (!rotationResult.rotation_allowed) {
          result.warnings.push({
            warning_type: 'RESISTANCE_WARNING',
            warning_message: rotationResult.warning || `Resistance risk: ${resistanceGroup} used consecutively`,
            warning_severity: 'HIGH'
          });
          console.warn(`⚠️ [Resistance] ${rule.id}: ${rotationResult.warning}`);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE-17: FARMER SAFETY WARNING GENERATION
      // ═══════════════════════════════════════════════════════════════════════
      const farmerSafetyLevel = rule.then.action_details?.farmer_safety_level as SafetyLevel | undefined;
      if (farmerSafetyLevel && farmerSafetyLevel !== 'SAFE') {
        const safetyWarning = getSafetyWarning(farmerSafetyLevel, 'en');
        if (safetyWarning) {
          const warningText = formatSafetyWarning(safetyWarning, 'en');
          result.safety_warnings.push(warningText);
        }
      }
      
      // Rule passed all validations - fire it
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      result.prescriptions.push(rule.then);
      
      // Register fired rule for graph control tracking
      firedRules.set(rule.id, rule.then.action_details?.blocks_rule_ids || []);
      firedRuleIds.add(rule.id);
      
      // CRITICAL: Also collect responses from prescription rules
      // PRODUCTION HARDENING: Include action_type and new response contract fields
      const prescriptionActionDetails = rule.then.action_details || {};
      const prescriptionActionType = rule.then.action_type || prescriptionActionDetails.action_type;
      
      if (prescriptionActionType && (prescriptionActionDetails.action_text || prescriptionActionDetails.i18n_key)) {
        result.matched_responses.push({
          rule_id: rule.id,
          cause: rule.then.possible_cause || prescriptionActionType || 'TREATMENT',
          action_type: prescriptionActionType,
          action_text: prescriptionActionDetails.action_text,
          reason_text: prescriptionActionDetails.reason_text,
          knowledge_text: prescriptionActionDetails.knowledge_text,
          i18n_key: prescriptionActionDetails.i18n_key,
          conditions_json: prescriptionActionDetails.conditions_json || null,
          // PHASE 8: Rich agronomic fields for deterministic response builder
          active_ingredient: prescriptionActionDetails.active_ingredient,
          dosage_per_acre: prescriptionActionDetails.dosage_per_acre,
          water_volume_per_acre: prescriptionActionDetails.water_volume_per_acre,
          application_method: prescriptionActionDetails.application_method,
          target_pest_stage: prescriptionActionDetails.target_pest_stage,
          chemical_class: prescriptionActionDetails.chemical_class,
          treatment_type: prescriptionActionDetails.treatment_type,
          biological_group: prescriptionActionDetails.biological_group,
          phi_days: prescriptionActionDetails.phi_days,
          reentry_interval_hours: prescriptionActionDetails.reentry_interval_hours,
          bee_toxicity: prescriptionActionDetails.bee_toxicity,
          aquatic_toxicity: prescriptionActionDetails.aquatic_toxicity,
          farmer_safety_level: prescriptionActionDetails.farmer_safety_level,
          regulatory_status: prescriptionActionDetails.regulatory_status,
          organic_alternative: prescriptionActionDetails.organic_alternative,
          ipm_level: prescriptionActionDetails.ipm_level,
          mode_of_action: prescriptionActionDetails.mode_of_action,
          resistance_group: prescriptionActionDetails.resistance_group,
          material_cost_per_acre_min: prescriptionActionDetails.material_cost_per_acre_min,
          material_cost_per_acre_max: prescriptionActionDetails.material_cost_per_acre_max,
          labor_cost_per_acre_min: prescriptionActionDetails.labor_cost_per_acre_min,
          labor_cost_per_acre_max: prescriptionActionDetails.labor_cost_per_acre_max,
          labor_hours_per_acre: prescriptionActionDetails.labor_hours_per_acre,
          equipment_required: prescriptionActionDetails.equipment_required,
          equipment_cost_per_acre: prescriptionActionDetails.equipment_cost_per_acre,
          total_cost_estimated: prescriptionActionDetails.total_cost_estimated,
          roi_yield_gain_pct: prescriptionActionDetails.roi_yield_gain_pct,
          roi_cost_saved_min: prescriptionActionDetails.roi_cost_saved_min,
          roi_cost_saved_max: prescriptionActionDetails.roi_cost_saved_max,
          roi_net_score: prescriptionActionDetails.roi_net_score,
          roi_confidence: prescriptionActionDetails.roi_confidence,
          success_indicators: prescriptionActionDetails.success_indicators,
          failure_indicators: prescriptionActionDetails.failure_indicators,
          min_temperature: prescriptionActionDetails.min_temperature,
          max_temperature: prescriptionActionDetails.max_temperature,
          max_wind_speed: prescriptionActionDetails.max_wind_speed,
          rain_delay_hours: prescriptionActionDetails.rain_delay_hours,
          weather_dependency: prescriptionActionDetails.weather_dependency,
          scientific_source: rule.scientific_basis,
          icar_package_ref: prescriptionActionDetails.icar_package_ref,
          university_source: prescriptionActionDetails.university_source,
          risk_level: prescriptionActionDetails.risk_level,
          response_severity: prescriptionActionDetails.response_severity,
          data_authority_rank: prescriptionActionDetails.data_authority_rank,
        });
      } else if (prescriptionActionType) {
        // Rules with action_type but minimal content - still eligible
        result.matched_responses.push({
          rule_id: rule.id,
          cause: rule.then.possible_cause || 'TREATMENT',
          action_type: prescriptionActionType
        });
      }
    }
  } else {
    // CRITICAL: Even when prescriptions are blocked, evaluate prescription rules to collect responses
    // This ensures we can use IPM treatment responses for observation-only mode
    for (const rule of rulesByCategory.get(RuleCategory.PRESCRIPTION) || []) {
      result.rules_evaluated++;
      if (matchesConditions(rule, state)) {
        // Don't add to prescriptions (blocked), but collect responses for display
        // SSOT ARCHITECTURE: action_text + i18n_key only (response_mr/hi/en dropped)
        const blockedActionDetails = rule.then.action_details || {};
        const blockedActionType = rule.then.action_type || blockedActionDetails.action_type || 'MONITORING_ADVICE';
        if (blockedActionDetails.action_text || blockedActionDetails.i18n_key || blockedActionType) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause || blockedActionType,
            action_type: blockedActionType,
            action_text: blockedActionDetails.action_text,
            reason_text: blockedActionDetails.reason_text,
            knowledge_text: blockedActionDetails.knowledge_text,
            i18n_key: blockedActionDetails.i18n_key,
            conditions_json: blockedActionDetails.conditions_json || null,
            // PRODUCTION FIX: Propagate ALL rich agronomic fields (matching PRESCRIPTION path)
            active_ingredient: blockedActionDetails.active_ingredient,
            dosage_per_acre: blockedActionDetails.dosage_per_acre,
            water_volume_per_acre: blockedActionDetails.water_volume_per_acre,
            application_method: blockedActionDetails.application_method,
            target_pest_stage: blockedActionDetails.target_pest_stage,
            chemical_class: blockedActionDetails.chemical_class,
            treatment_type: blockedActionDetails.treatment_type,
            biological_group: blockedActionDetails.biological_group,
            phi_days: blockedActionDetails.phi_days,
            reentry_interval_hours: blockedActionDetails.reentry_interval_hours,
            bee_toxicity: blockedActionDetails.bee_toxicity,
            aquatic_toxicity: blockedActionDetails.aquatic_toxicity,
            farmer_safety_level: blockedActionDetails.farmer_safety_level,
            regulatory_status: blockedActionDetails.regulatory_status,
            organic_alternative: blockedActionDetails.organic_alternative,
            ipm_level: blockedActionDetails.ipm_level,
            mode_of_action: blockedActionDetails.mode_of_action,
            resistance_group: blockedActionDetails.resistance_group,
            material_cost_per_acre_min: blockedActionDetails.material_cost_per_acre_min,
            material_cost_per_acre_max: blockedActionDetails.material_cost_per_acre_max,
            labor_cost_per_acre_min: blockedActionDetails.labor_cost_per_acre_min,
            labor_cost_per_acre_max: blockedActionDetails.labor_cost_per_acre_max,
            labor_hours_per_acre: blockedActionDetails.labor_hours_per_acre,
            equipment_required: blockedActionDetails.equipment_required,
            equipment_cost_per_acre: blockedActionDetails.equipment_cost_per_acre,
            total_cost_estimated: blockedActionDetails.total_cost_estimated,
            roi_yield_gain_pct: blockedActionDetails.roi_yield_gain_pct,
            roi_cost_saved_min: blockedActionDetails.roi_cost_saved_min,
            roi_cost_saved_max: blockedActionDetails.roi_cost_saved_max,
            roi_net_score: blockedActionDetails.roi_net_score,
            roi_confidence: blockedActionDetails.roi_confidence,
            success_indicators: blockedActionDetails.success_indicators,
            failure_indicators: blockedActionDetails.failure_indicators,
            min_temperature: blockedActionDetails.min_temperature,
            max_temperature: blockedActionDetails.max_temperature,
            max_wind_speed: blockedActionDetails.max_wind_speed,
            rain_delay_hours: blockedActionDetails.rain_delay_hours,
            weather_dependency: blockedActionDetails.weather_dependency,
            scientific_source: rule.scientific_basis,
            icar_package_ref: blockedActionDetails.icar_package_ref,
            university_source: blockedActionDetails.university_source,
            risk_level: blockedActionDetails.risk_level,
            response_severity: blockedActionDetails.response_severity,
            data_authority_rank: blockedActionDetails.data_authority_rank,
          });
        }
      }
    }
  }
  
  // PHASE 6: WARNING
  for (const rule of rulesByCategory.get(RuleCategory.WARNING) || []) {
    result.rules_evaluated++;
    if (matchesConditions(rule, state)) {
      result.rules_matched++;
      result.rules_applied.push(rule.id);
      result.warnings.push(rule.then);
    }
  }
  
  result.diagnoses = diagnosisCandidates;
  const conflictResult = resolveConflicts(diagnosisCandidates, state);
  result.final_diagnosis = conflictResult.primary_diagnosis;
  result.confidence_in_result = conflictResult.confidence_in_resolution;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: BUILD PRIMARY_DECISION FROM ELIGIBLE MATCHED RESPONSES
  // PRIMARY_ACTION_ELIGIBILITY: rule_id EXISTS + action_type NOT NULL + content NOT NULL
  // NOTE: response_en/hi/mr were DROPPED - content = action_text OR i18n_key
  // ═══════════════════════════════════════════════════════════════════════════
  // BUG 2 FIX: Deduplicate matched_responses by rule_id (keep first occurrence)
  const seenRuleIds = new Set<string>();
  result.matched_responses = result.matched_responses.filter(r => {
    if (!r.rule_id || seenRuleIds.has(r.rule_id)) return false;
    seenRuleIds.add(r.rule_id);
    return true;
  });
  
  // FIX 3 (v6.1): Relaxed eligibility — accept rules with reason_text or knowledge_text
  // when action_text is null. Many DB rules have valid reason/knowledge but null action_text.
  // The formatter can build a response from reason_text + knowledge_text.
  const eligibleResponses = result.matched_responses.filter(r => 
    r.rule_id && 
    r.action_type && 
    (r.action_text || r.i18n_key || r.reason_text || r.knowledge_text)
  );
  
  if (eligibleResponses.length > 0) {
    // ═══════════════════════════════════════════════════════════════════════════
    // Fix 1: NUTRITION CONFLICT ARBITRATION before primary selection
    // Filters out nutrition rules that fail zinc gate, water stress, or macro dominance
    // ═══════════════════════════════════════════════════════════════════════════
    const arbitratedResponses = eligibleResponses.filter(r => {
      const ruleCategory = (r.cause || '').toLowerCase();
      const ruleIdUpper = r.rule_id.toUpperCase();
      const isNutrition = ruleCategory.includes('nutri') || ruleCategory.includes('deficiency') || 
        ruleIdUpper.includes('MICRO') || ruleIdUpper.includes('NUTRI') || ruleIdUpper.includes('ZN') || ruleIdUpper.includes('ZINC');
      
      if (!isNutrition) return true; // Non-nutrition rules pass through
      
      const currentSymptoms = state.visual_symptoms || [];
      
      // Zinc specificity gate
      const zincGate = passesZincSpecificityGate(r.rule_id, [], { all_observations: currentSymptoms });
      if (!zincGate.passes) {
        console.log(`🚫 [ArbitrationGate] ${r.rule_id} blocked: ${zincGate.reason}`);
        return false;
      }
      
      // Micronutrient specificity gate (Fe/Mn/S)
      const microGate = passesMicronutrientSpecificityGate(r.rule_id, [], { all_observations: currentSymptoms });
      if (!microGate.passes) {
        console.log(`🚫 [ArbitrationGate] ${r.rule_id} blocked by micronutrient gate: ${microGate.reason}`);
        return false;
      }
      
      // Water stress dominance
      const waterBlock = checkWaterStressDominance(currentSymptoms, r.action_type, ruleCategory);
      if (waterBlock.blocked) {
        console.log(`🚫 [ArbitrationGate] ${r.rule_id} blocked by water stress: ${waterBlock.reason}`);
        return false;
      }
      
      // Macronutrient dominance
      const macroBlock = checkMacronutrientDominance(currentSymptoms, r.rule_id, r.cause || '', {});
      if (macroBlock.blocked) {
        console.log(`🚫 [ArbitrationGate] ${r.rule_id} blocked by macro dominance: ${macroBlock.reason}`);
        return false;
      }
      
      return true;
    });
    
    const responsesForSelection = arbitratedResponses.length > 0 ? arbitratedResponses : eligibleResponses;
    
    if (arbitratedResponses.length < eligibleResponses.length) {
      console.log(`🔬 [ArbitrationGate] Filtered ${eligibleResponses.length - arbitratedResponses.length} nutrition rules, ${arbitratedResponses.length} remaining`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SAFETY_GATE EXCLUSION: safety_gate rules must NEVER be primary decision
    // They are applied post-selection as overlays, not competing candidates
    // ═══════════════════════════════════════════════════════════════════════════
    const SAFETY_GATE_ACTION_TYPES = new Set([
      'safety_gate', 'SAFETY_GATE', 'BLOCK', 'URGENT_BLOCK',
      'weather_block', 'WEATHER_BLOCK'
    ]);
    
    const nonSafetyResponses = responsesForSelection.filter(r => 
      !SAFETY_GATE_ACTION_TYPES.has(r.action_type)
    );
    
    const candidatesForPrimary = nonSafetyResponses.length > 0 ? nonSafetyResponses : responsesForSelection;
    
    if (nonSafetyResponses.length < responsesForSelection.length) {
      console.log(`🛡️ [SafetyGateExclusion] Excluded ${responsesForSelection.length - nonSafetyResponses.length} safety_gate rules from primary arbitration`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // NORMALIZED SCORING: score = matched_conditions / total_required_conditions
    // No urgency bias, no action_type boosting. Pure evidence ratio.
    // ═══════════════════════════════════════════════════════════════════════════
    
    // BUG 5 FIX: Use confirmed observations for primary scoring when available
    const confirmedObs = (state as any).confirmed_observations;
    const primarySymptomSource = (confirmedObs && confirmedObs.length > 0) 
      ? confirmedObs 
      : (state.visual_symptoms || []);
    const currentSymptoms = primarySymptomSource.map((s: string) => s.toUpperCase().replace(/[\s-]/g, '_'));
    
    const scored = candidatesForPrimary.map(r => {
      // ═══════════════════════════════════════════════════════════════════
      // LEDGER-BASED SCORING: Use condition ledger for accurate scoring
      // Only counts REQUIRED conditions in denominator
      // ═══════════════════════════════════════════════════════════════════
      const ledger = getConditionLedger(r.rule_id);
      // PHASE D: generic-rule penalty (set by bundled-rules/loader.ts when a rule
      // lacks rule_intent or required_observation_category). Demote so specific
      // intent-bound rules win when both pass the same conditions.
      const genericPenalty = ((r as any)._genericPenalty === true) ? 0.85 : 1.0;
      if (ledger && ledger.length > 0) {
        const requiredEntries = ledger.filter(e => e.required);
        const passedRequired = requiredEntries.filter(e => e.status === ConditionStatus.PASSED).length;
        const totalRequired = requiredEntries.length;
        const normalizedScore = totalRequired > 0 ? Math.min(1.0, passedRequired / totalRequired) : (r.confidence_score ?? 0.5);
        const contentBonus = ((r.action_text ? 0.02 : 0) + (r.reason_text ? 0.015 : 0) + (r.knowledge_text ? 0.015 : 0));
        const finalScore = Math.min(1.0, (normalizedScore + contentBonus) * genericPenalty);
        return { response: r, evidenceScore: finalScore, matchedConditions: passedRequired, totalConditions: totalRequired };
      }
      
      // Fallback: legacy scoring if no ledger available
      const ruleConditions = r.conditions_json || {};
      const ruleObs: string[] = Array.isArray(ruleConditions.observations) ? ruleConditions.observations : [];
      const conditionKeys = Object.keys(ruleConditions).filter(k => k !== 'trigger_keywords' && k !== 'observations');
      const totalConditions = ruleObs.length + conditionKeys.length;
      let matchedConditions = 0;
      if (ruleObs.length > 0 && currentSymptoms.length > 0) {
        for (const o of ruleObs) {
          const oNorm = String(o).toUpperCase().replace(/[\s-]/g, '_');
          if (currentSymptoms.some((sym: string) => sym.includes(oNorm) || oNorm.includes(sym))) {
            matchedConditions++;
          }
        }
      }
      for (const key of conditionKeys) {
        const stateVal = (state as any)[key];
        if (isDataPresent(stateVal)) matchedConditions++;
      }
      const normalizedScore = totalConditions > 0 ? Math.min(1.0, matchedConditions / totalConditions) : (r.confidence_score ?? 0.5);
      const contentBonus = ((r.action_text ? 0.02 : 0) + (r.reason_text ? 0.015 : 0) + (r.knowledge_text ? 0.015 : 0));
      const finalScore = Math.min(1.0, (normalizedScore + contentBonus) * genericPenalty);
      return { response: r, evidenceScore: finalScore, matchedConditions, totalConditions };
    });


    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE G — G1: TIERED ARGMAX (Intent + Semantic > Intent|Semantic > Generic)
    // Partition candidates so a generic rule can NEVER outrank an intent-bound
    // rule, regardless of evidence score. Argmax runs only inside the highest
    // non-empty tier. This is the locked authority order:
    //   1) Intent Match  2) Semantic Match  3) Hypothesis  4) Sci-validated
    //   5) Generic (allowed only if 1–3 empty)
    // ═══════════════════════════════════════════════════════════════════════════
    const hasIntent = (r: any) => r && r.rule_intent != null && r._genericPenalty !== true;
    const hasSemantic = (s: { matchedConditions: number; totalConditions: number }) =>
      s.totalConditions > 0 && s.matchedConditions > 0;
    const tier0: typeof scored = [];
    const tier1: typeof scored = [];
    const tier2: typeof scored = [];
    for (const s of scored) {
      const intentBound = hasIntent(s.response as any);
      const semanticBound = hasSemantic(s);
      if (intentBound && semanticBound) tier0.push(s);
      else if (intentBound || semanticBound) tier1.push(s);
      else tier2.push(s);
    }
    const winnerTier = tier0.length > 0 ? 0 : (tier1.length > 0 ? 1 : 2);
    const activeScored = winnerTier === 0 ? tier0 : (winnerTier === 1 ? tier1 : tier2);
    console.log(`[BRAIN_TRACE][RULE_TIER] t0=${tier0.length} t1=${tier1.length} t2=${tier2.length} winner_tier=${winnerTier}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // AUDIT FIX: Sort by data_authority_rank DESC first, then evidence score
    // data_authority_rank: 95 = highest authority (ICAR/research validated)
    //                      55 = lowest authority (generic advisory)
    // ═══════════════════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════════════════
    // CATEGORY PRIORITY MAP — Rule conflict resolution pre-sort
    // SAFETY_GATE rules ALWAYS surface first regardless of evidence score
    // ═══════════════════════════════════════════════════════════════════════════
    const CATEGORY_PRIORITY_MAP: Record<string, number> = {
      'SAFETY_GATE': 100,  'BLOCK': 100,
      'URGENT_ACTION': 90,
      'RECOMMEND': 80,     'SPRAY': 80,     'TREATMENT': 80,
      'CHEMICAL_CONTROL': 80, 'BIOLOGICAL_CONTROL': 80,
      'FERTILIZER_APPLICATION': 70,
      'NUTRIENT_RECOMMENDATION': 60,
      'CULTURAL_CONTROL': 40, 'CULTURAL_PRACTICE': 40,
      'MONITOR': 20,       'OBSERVATION': 20,
      'NO_ACTION_REQUIRED': 10, 'NO_ACTION': 10,
    };

    activeScored.sort((a, b) => {
      // P0: Category priority (safety gates always win)
      const catA = CATEGORY_PRIORITY_MAP[(a.response.action_type || '').toUpperCase()] ?? 50;
      const catB = CATEGORY_PRIORITY_MAP[(b.response.action_type || '').toUpperCase()] ?? 50;
      // Only apply category override for extreme differences (safety vs treatment)
      if (Math.abs(catA - catB) >= 20) {
        if (catA !== catB) return catB - catA;
      }
      // P1: data_authority_rank (higher = better)
      const rankA = (a.response as any).data_authority_rank ?? 50;
      const rankB = (b.response as any).data_authority_rank ?? 50;
      if (rankA !== rankB) return rankB - rankA;
      // P2: evidence score
      if (a.evidenceScore !== b.evidenceScore) return b.evidenceScore - a.evidenceScore;
      // P3: priority field from rule
      const priA = a.response.priority ?? 50;
      const priB = b.response.priority ?? 50;
      if (priA !== priB) return priB - priA;
      // P4: confidence_score
      return (b.response.confidence_score ?? 0) - (a.response.confidence_score ?? 0);
    });
    // Preserve original `scored` shape for downstream code: rewrite it with
    // tier-winning candidates first, then the rest (so scored[0] is the winner).
    const remaining = scored.filter(s => !activeScored.includes(s));
    scored.length = 0;
    scored.push(...activeScored, ...remaining);
    const best = scored[0].response;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-SELECTION CONFIDENCE GATE: If best rule score < threshold, trigger clarification
    // PRODUCTION FIX: When PrescriptionGate overrides LOW confidence (strong symptom 
    // evidence), relax threshold from 0.60 → 0.40 to allow rule selection.
    // ═══════════════════════════════════════════════════════════════════════════
    const BASE_CONFIDENCE_GATE_THRESHOLD = 0.60;
    const OVERRIDE_CONFIDENCE_GATE_THRESHOLD = 0.40;
    const hasOverride = !!options?.prescriptionGateOverride;
    const CONFIDENCE_GATE_THRESHOLD = hasOverride ? OVERRIDE_CONFIDENCE_GATE_THRESHOLD : BASE_CONFIDENCE_GATE_THRESHOLD;
    const computedConfidence = Math.min(1.0, scored[0].evidenceScore);
    
    if (hasOverride) {
      console.log(`   🔓 [ConfidenceGate] PrescriptionGate override ACTIVE — threshold relaxed: ${(BASE_CONFIDENCE_GATE_THRESHOLD * 100).toFixed(0)}% → ${(OVERRIDE_CONFIDENCE_GATE_THRESHOLD * 100).toFixed(0)}%`);
    }
    
    if (computedConfidence < CONFIDENCE_GATE_THRESHOLD) {
      console.warn(`⚠️ [ConfidenceGate] Score ${(computedConfidence * 100).toFixed(0)}% < ${(CONFIDENCE_GATE_THRESHOLD * 100).toFixed(0)}% threshold${hasOverride ? ' (override active)' : ''}`);
      console.warn(`   Best candidate: ${best.rule_id} (score=${scored[0].evidenceScore.toFixed(3)}, matched=${scored[0].matchedConditions}/${scored[0].totalConditions})`);
      console.warn(`   ACTION: Skipping primary selection → triggering clarification`);
      // primary_decision remains null — orchestrator will route to clarification
    } else {
      // ═══════════════════════════════════════════════════════════════════════════
      // MANDATORY: Build complete PrimaryDecision with density-weighted confidence
      // SSOT ARCHITECTURE: weighted_confidence is the authoritative confidence score
      // ═══════════════════════════════════════════════════════════════════════════
      // BUG FIX: Guard against division by zero when totalConditions = 0
      // This happens for fallback rules like SC_DIAG_GENERAL_015 with {no_matching_diagnosis: true}
      const totalConds = scored[0].totalConditions;
      const matchedConds = scored[0].matchedConditions;
      const baseScore = totalConds > 0 ? matchedConds / totalConds : (scored[0].response.confidence_score ?? 0.5);
      const densityWeight = totalConds > 0 ? Math.min(1.0, Math.log(totalConds + 1) / Math.log(10)) : 0.3;
      const weightedConfidence = Math.min(1.0, baseScore * (0.5 + 0.5 * densityWeight));
      
      result.primary_decision = {
        rule_id: best.rule_id,
        action_type: best.action_type,
        priority: best.priority ?? 50,
        confidence_score: weightedConfidence,
        normalized_score: scored[0].evidenceScore,
        total_required: scored[0].totalConditions,
        passed_required: scored[0].matchedConditions,
        weighted_confidence: weightedConfidence,
        action_text: best.action_text,
        reason_text: best.reason_text,
        knowledge_text: best.knowledge_text,
        i18n_key: best.i18n_key,
        // PRODUCTION FIX: Propagate ALL rich agronomic fields from MatchedResponse
        cause: best.cause || null,
        active_ingredient: best.active_ingredient || null,
        dosage_per_acre: best.dosage_per_acre || null,
        water_volume_per_acre: best.water_volume_per_acre || null,
        application_method: best.application_method || null,
        target_pest_stage: best.target_pest_stage || null,
        chemical_class: best.chemical_class || null,
        treatment_type: best.treatment_type || null,
        biological_group: best.biological_group || null,
        phi_days: best.phi_days || null,
        reentry_interval_hours: best.reentry_interval_hours || null,
        bee_toxicity: best.bee_toxicity || null,
        aquatic_toxicity: best.aquatic_toxicity || null,
        farmer_safety_level: best.farmer_safety_level || null,
        regulatory_status: best.regulatory_status || null,
        organic_alternative: best.organic_alternative || null,
        ipm_level: best.ipm_level || null,
        mode_of_action: best.mode_of_action || null,
        resistance_group: best.resistance_group || null,
        material_cost_per_acre_min: best.material_cost_per_acre_min || null,
        material_cost_per_acre_max: best.material_cost_per_acre_max || null,
        labor_cost_per_acre_min: best.labor_cost_per_acre_min || null,
        labor_cost_per_acre_max: best.labor_cost_per_acre_max || null,
        labor_hours_per_acre: best.labor_hours_per_acre || null,
        equipment_required: best.equipment_required || null,
        equipment_cost_per_acre: best.equipment_cost_per_acre || null,
        total_cost_estimated: best.total_cost_estimated || null,
        roi_yield_gain_pct: best.roi_yield_gain_pct || null,
        roi_cost_saved_min: best.roi_cost_saved_min || null,
        roi_cost_saved_max: best.roi_cost_saved_max || null,
        roi_net_score: best.roi_net_score || null,
        roi_confidence: best.roi_confidence || null,
        success_indicators: best.success_indicators || null,
        failure_indicators: best.failure_indicators || null,
        min_temperature: best.min_temperature || null,
        max_temperature: best.max_temperature || null,
        max_wind_speed: best.max_wind_speed || null,
        rain_delay_hours: best.rain_delay_hours || null,
        weather_dependency: best.weather_dependency || null,
        scientific_source: best.scientific_source || null,
        icar_package_ref: best.icar_package_ref || null,
        university_source: best.university_source || null,
        risk_level: best.risk_level || null,
        response_severity: best.response_severity || null,
        data_authority_rank: best.data_authority_rank || null,
        response_mr: best.response_mr || null,
        response_hi: best.response_hi || null,
        response_en: best.response_en || null,
      };
      
      console.log(`📊 Decision Authority:`);
      console.log(`   rule_id: ${best.rule_id}`);
      console.log(`   base_score: ${scored[0].evidenceScore.toFixed(3)}`);
      console.log(`   total_required: ${scored[0].totalConditions}`);
      console.log(`   passed_required: ${scored[0].matchedConditions}`);
      console.log(`   density_weight: ${densityWeight.toFixed(3)}`);
      console.log(`   weighted_confidence: ${weightedConfidence.toFixed(3)}`);
    }
  } else {
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 7: RULE_DATA_INTEGRITY_ERROR - Fail-fast when rules matched but
    // no primary action can be resolved. This indicates data quality issues
    // in the decision_rules table (missing action_text/i18n_key).
    // ═══════════════════════════════════════════════════════════════════════════
    const matchedRuleIds = result.matched_responses.map(r => r.rule_id);
    console.error(`🚨 [RULE_DATA_INTEGRITY_ERROR] matched_responses=${result.matched_responses.length} but 0 eligible for primary!`);
    console.error(`   Matched rule IDs: [${matchedRuleIds.join(', ')}]`);
    console.error(`   source=layered-rule-evaluator.ts`);
    result.matched_responses.forEach((r, i) => {
      console.error(`   ${i + 1}. rule_id=${r.rule_id}, action_type=${r.action_type || 'MISSING'}, has_content=${!!(r.action_text || r.i18n_key)}`);
    });
    
    // PHASE 7: If matched_responses > 0 but zero are eligible, this is a data integrity error.
    // DO NOT silently continue - log the error for DB fixes.
    if (result.matched_responses.length > 0) {
      console.error(`🚨 [RULE_DATA_INTEGRITY_ERROR] ${result.matched_responses.length} rules matched but NONE have action_text or i18n_key. Fix these rules in decision_rules table.`);
    }
    // primary_decision remains null - orchestrator.ts will handle fallback
  }
  
  // Log evaluation summary
  console.log(`📊 [LayeredRuleEvaluator] Summary:`);
  console.log(`   Rules evaluated: ${result.rules_evaluated}`);
  console.log(`   Rules matched: ${result.rules_matched}`);
  console.log(`   Matched responses: ${result.matched_responses.length}`);
  console.log(`   Eligible for primary: ${eligibleResponses.length}`);
  console.log(`   Primary decision: ${result.primary_decision ? result.primary_decision.rule_id : 'NULL'}`);
  console.log(`   Blocked by graph: ${result.rules_blocked_by_graph.length}`);
  console.log(`   Blocked by ETL: ${result.rules_blocked_by_etl.length}`);
  console.log(`   Safety warnings: ${result.safety_warnings.length}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH_NODE_TRACE — RULE_ENGINE
  // Emits one uniform node line for forensic pipeline reconstruction.
  // Never silent: even zero-match still surfaces block_reasons so the
  // orchestrator invariant checker can attribute the gap.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const blockReasons: string[] = [];
    if (result.rules_blocked_by_graph.length) blockReasons.push(`graph:${result.rules_blocked_by_graph.length}`);
    if (result.rules_blocked_by_etl.length)   blockReasons.push(`etl:${result.rules_blocked_by_etl.length}`);
    if (result.safety_blocks.length)          blockReasons.push(`safety:${result.safety_blocks.length}`);
    if (result.rules_evaluated > 0 && result.rules_matched === 0) blockReasons.push('no_condition_match');
    if (result.rules_matched > 0 && eligibleResponses.length === 0) blockReasons.push('no_eligible_response');

    // eslint-disable-next-line no-console
    console.log(
      `[GRAPH_NODE_TRACE][${traceId}] node=RULE_ENGINE ` +
        JSON.stringify({
          loaded: safeRules.length,
          evaluated: result.rules_evaluated,
          matched: result.rules_matched,
          eligible: eligibleResponses.length,
          winner: result.primary_decision?.rule_id ?? null,
          blocked_by_graph: result.rules_blocked_by_graph.length,
          blocked_by_etl: result.rules_blocked_by_etl.length,
          safety_blocks: result.safety_blocks.length,
          block_reasons: blockReasons,
        }),
    );
  } catch {/* trace must not throw */}

  return result;
}

function groupRulesByCategory(rules: Rule[]): Map<RuleCategory, Rule[]> {
  const grouped = new Map<RuleCategory, Rule[]>();
  for (const cat of [1,2,3,4,5,6]) grouped.set(cat as RuleCategory, []);
  for (const rule of rules) {
    if (!rule.active) continue;
    grouped.get(rule.category)?.push(rule);
  }
  for (const [cat, catRules] of grouped) {
    // P2-2: Sort by data_authority_rank DESC then priority DESC
    catRules.sort((a, b) => {
      const rankA = (a as any).data_authority_rank ?? 50;
      const rankB = (b as any).data_authority_rank ?? 50;
      if (rankA !== rankB) return rankB - rankA;
      return b.priority - a.priority;
    });
  }
  return grouped;
}

// ==================== ASYNC RULE LOADING ====================

let cachedConvertedRules: Rule[] | null = null;

/**
 * Load rules with optional crop code filtering.
 * CRITICAL FIX: Without cropCode, loads ALL rules (517+) causing rule explosion.
 * Always pass cropCode when available to narrow candidates.
 */
export async function getAllRulesWithBundled(cropCode?: string): Promise<Rule[]> {
  // If crop-specific, don't use global cache - filter from loaded rules
  const allRules = await loadAllRules();
  
  let rulesToConvert: ExecutableRule[];
  if (cropCode) {
    // Use crop-code-normalizer to get all valid variants for matching
    const variants = getCropCodeVariants(cropCode).map(v => v.toLowerCase());
    rulesToConvert = allRules.filter(r => {
      const ruleCrop = r.crop_code?.toLowerCase() || '';
      return variants.includes(ruleCrop) || ruleCrop === 'all' || ruleCrop === '*' || ruleCrop === 'universal';
    });
    console.log(`📦 Loaded ${rulesToConvert.length}/${allRules.length} crop-filtered rules for ${cropCode} (variants: ${variants.join(',')})`);
  } else {
    rulesToConvert = allRules;
    console.log(`📦 Loaded ${rulesToConvert.length} bundled rules from database (NO crop filter - consider passing cropCode)`);
  }
  
  return rulesToConvert.map(convertBundledToRule);
}

function convertBundledToRule(bundled: ExecutableRule): Rule {
  return {
    id: bundled.rule_id,
    category: mapBundledCategory(bundled.category),
    priority: bundled.priority || 50,
    when: {
      custom: (state: CanonicalState & { user_query?: string; visual_symptoms?: string[] }) => {
        try {
          // ═══════════════════════════════════════════════════════════════════════════
          // ═══════════════════════════════════════════════════════════════════════════
          // STAGE PRE-FILTER: Enforce stage_applicable BEFORE evaluating other conditions
          // v7.8 FIX: When stage is a DEFAULT/INFERRED value (VEGETATIVE, UNKNOWN),
          // SKIP the strict stage gate. Default stages are not authoritative — they
          // should NOT block pest/disease rules from firing. The conditions_json 
          // evaluator has softer stage handling that properly skips when data is missing.
          // ═══════════════════════════════════════════════════════════════════════════
          const stageApplicable = bundled.stage_applicable || [];
          const currentStage = state.crop_stage?.toUpperCase()?.replace(/[\s-]/g, '_') || '';
          
          // v7.8: Default/generic stages should NOT block rules
          const DEFAULT_STAGES = new Set(['VEGETATIVE', 'UNKNOWN', 'DEFAULT', '']);
          const isAuthoritativeStage = currentStage && !DEFAULT_STAGES.has(currentStage);
          
          if (stageApplicable.length > 0 && isAuthoritativeStage) {
            // Normalize all stage values for comparison
            const normalizedApplicableStages = stageApplicable.map((s: string) => 
              s.toUpperCase().replace(/[\s-]/g, '_')
            );
            
            // Check for wildcard matches
            const hasWildcard = normalizedApplicableStages.some((s: string) => 
              s === '*' || s === 'ALL' || s === 'UNIVERSAL' || s === 'ANY'
            );
            
            if (!hasWildcard) {
              // ───────────────────────────────────────────────────────────
              // Phase Z FIX (H3): Stage-family equivalence.
              // Rules tagged for an early-life stage (emergence/seedling)
              // must remain reachable when the canonical stage is a
              // semantically-equivalent neighbour (germination / nursery /
              // establishment). The runtime previously used a strict
              // `.includes()` which hard-blocked every emergence-failure
              // rule when the land's current_crop_stage = GERMINATION.
              // The family map MUST stay symmetric and crop-independent.
              // ───────────────────────────────────────────────────────────
              /**
               * @deprecated STAGE_FAMILIES — DO NOT ADD NEW AGRONOMY.
               * Stage relationships must originate from the ontology database
               * (crop_stage_master.stage_relationships). This in-code map is
               * retained temporarily; stages missing from it now fall through
               * a soft bypass (see [STAGE_ONTOLOGY_MISSING] log below) instead
               * of hard-rejecting rules. Tracked for ontology-migration pass.
               */
              const STAGE_FAMILIES: Record<string, string[]> = {
                GERMINATION:   ['GERMINATION', 'NURSERY', 'SEEDLING', 'EMERGENCE', 'ESTABLISHMENT'],
                EMERGENCE:     ['EMERGENCE', 'GERMINATION', 'SEEDLING', 'NURSERY', 'ESTABLISHMENT'],
                SEEDLING:      ['SEEDLING', 'NURSERY', 'GERMINATION', 'EMERGENCE', 'ESTABLISHMENT'],
                NURSERY:       ['NURSERY', 'SEEDLING', 'GERMINATION', 'EMERGENCE'],
                ESTABLISHMENT: ['ESTABLISHMENT', 'SEEDLING', 'EMERGENCE', 'GERMINATION'],
                TILLERING:     ['TILLERING', 'VEGETATIVE'],
                VEGETATIVE:    ['VEGETATIVE', 'TILLERING'],
                FLOWERING:     ['FLOWERING', 'REPRODUCTIVE', 'PANICLE_INITIATION', 'BOOTING'],
                REPRODUCTIVE:  ['REPRODUCTIVE', 'FLOWERING', 'BOOTING', 'PANICLE_INITIATION'],
                BOOTING:       ['BOOTING', 'PANICLE_INITIATION', 'FLOWERING', 'REPRODUCTIVE'],
                PANICLE_INITIATION: ['PANICLE_INITIATION', 'BOOTING', 'FLOWERING', 'REPRODUCTIVE'],
                GRAIN_FILLING: ['GRAIN_FILLING', 'MILK', 'DOUGH', 'MATURITY'],
                MATURITY:      ['MATURITY', 'HARVEST', 'GRAIN_FILLING'],
                HARVEST:       ['HARVEST', 'MATURITY'],
              };
              const family = STAGE_FAMILIES[currentStage] || null;
              const exactMatch = normalizedApplicableStages.includes(currentStage);
              const familyMatch = family
                ? normalizedApplicableStages.some((s: string) => s === currentStage || family.includes(s))
                : false;

              if (!exactMatch && !familyMatch) {
                if (!family) {
                  // Ontology-missing: DO NOT reject. Emit forensic log for
                  // future DB-backed stage_relationships migration. The rule
                  // still faces DB-level STAGE predicates downstream.
                  console.log(
                    `[STAGE_ONTOLOGY_MISSING] rule=${bundled.rule_id} current_stage=${currentStage} ` +
                    `applicable=[${normalizedApplicableStages.join(',')}] action=BYPASS_STAGE_GATE ` +
                    `reason=STAGE_FAMILIES_deprecated_awaiting_db_stage_relationships`
                  );
                } else {
                  if (bundled.priority && bundled.priority > 70) {
                    console.log(`🚫 [StageGate] Rule ${bundled.rule_id} blocked: stage_applicable=[${normalizedApplicableStages.join(',')}] vs current=${currentStage} (family=[${family.join(',')}])`);
                  }
                  return false; // HARD GATE only when family is known and mismatches
                }
              }
            }
          }
          
          // ═══════════════════════════════════════════════════════════════════════════
          // CRITICAL FIX: ENFORCE crop_code matching with proper normalization
          // Database uses short codes (SC, CTN) while CanonicalState uses full names (SUGARCANE, COTTON)
          // ═══════════════════════════════════════════════════════════════════════════
          /**
           * @deprecated cropCodeAliases — DO NOT ADD NEW AGRONOMY.
           * Crop code equivalences must originate from the ontology database
           * (crop_synonyms / crops table). Retained only until DB-backed
           * resolver is wired in. Tracked for ontology-migration pass.
           */
          const cropCodeAliases: Record<string, string[]> = {
            'SC': ['SUGARCANE', 'SUGAR_CANE', 'USCANE', 'CANE'],
            'CTN': ['COTTON', 'KAPAS'],
            'WH': ['WHEAT', 'GEHUN'],
            'RIC': ['RICE', 'PADDY', 'DHAN'],
            'SOY': ['SOYBEAN', 'SOYA'],
            'MAZ': ['MAIZE', 'CORN', 'MAKKA'],
            'GRN': ['GROUNDNUT', 'PEANUT'],
            'ON': ['ONION', 'KANDA'],
            'TOM': ['TOMATO'],
            'POT': ['POTATO', 'ALOO']
          };
          
          const ruleCropCode = bundled.crop_code?.toUpperCase() || '';
          const stateCropCode = state.crop_type?.toUpperCase() || '';
          
          if (ruleCropCode && stateCropCode) {
            const isUniversalRule = ruleCropCode === '*' || ruleCropCode === 'ALL' || ruleCropCode === 'UNIVERSAL';
            if (!isUniversalRule) {
              if (ruleCropCode === stateCropCode) {
                // Direct match - OK
              } else if (cropCodeAliases[ruleCropCode]?.includes(stateCropCode)) {
                // Alias match - OK
              } else if (Object.entries(cropCodeAliases).some(([code, aliases]) => 
                aliases.includes(stateCropCode) && code === ruleCropCode
              )) {
                // Reverse alias match - OK
              } else {
                return false;
              }
            }
          }
          
          // ═══════════════════════════════════════════════════════════════════════════
          // OBSERVATION LAYER FILTER: required_observation_category + required_plant_part
          // Prevents cross-domain rule matching (e.g., nutrient rules for pest symptoms)
          // ═══════════════════════════════════════════════════════════════════════════
          // ─────────────────────────────────────────────────────────────
          // Ontology-first evidence union. Priority = authority.
          //   1. observation_codes[]         (canonical DB ontology codes)
          //   2. confirmed_observations[]    (verified by farmer / vision)
          //   3. synthetic_observations[]    (inferred by symbolic bridge)
          //   4. visual_symptom              (legacy singular enum)
          // NO observation → symptom conversion. Codes flow verbatim.
          // ─────────────────────────────────────────────────────────────
          const _obsCodes:  string[] = Array.isArray((state as any).observation_codes)      ? (state as any).observation_codes      : [];
          const _confirmed: string[] = Array.isArray((state as any).confirmed_observations) ? (state as any).confirmed_observations : [];
          const _synthetic: string[] = Array.isArray((state as any).synthetic_observations) ? (state as any).synthetic_observations : [];
          const _secondary: string[] = Array.isArray(state.secondary_symptoms)
            ? state.secondary_symptoms.map((s: any) => String(s)) : [];
          const _legacy: string[] = (state.visual_symptom && state.visual_symptom !== 'NONE' && state.visual_symptom !== 'UNKNOWN')
            ? [String(state.visual_symptom)] : [];
          const evidenceCodesUpper: string[] = [...new Set(
            [..._obsCodes, ..._confirmed, ..._synthetic, ..._secondary, ..._legacy]
              .filter(Boolean)
              .map((s: string) => String(s).toUpperCase().replace(/[\s-]/g, '_'))
          )];
          const visualSymptoms = evidenceCodesUpper;
          
          if (visualSymptoms.length > 0) {
            // Infer observation categories from symptom codes using keyword patterns
            const inferredCategories = new Set<string>();
            const inferredPlantParts = new Set<string>();
            
            const CATEGORY_PATTERNS: Record<string, string[]> = {
              'PEST': ['BORE', 'BORER', 'INSECT', 'LARVAE', 'GRUB', 'TERMITE', 'APHID', 'WHITEFLY', 
                       'MEALYBUG', 'MITE', 'THRIPS', 'CATERPILLAR', 'FRASS', 'WEBBING', 'HONEYDEW',
                       'SCALE', 'WOOLLY', 'CRAWLING', 'EGG_MASS', 'DEAD_HEART', 'MUD_TUBE', 'GNAW',
                       'RAT', 'RODENT', 'SOOTY_MOLD', 'EXIT_HOLE', 'TUNNEL'],
              'DISEASE': ['ROT', 'RUST', 'SMUT', 'WILT', 'BLIGHT', 'MOSAIC', 'STREAK', 'LESION',
                          'PUSTULE', 'OOZE', 'GUMMOSIS', 'MILDEW', 'SCALD', 'POKKAH', 'GRASSY_SHOOT',
                          'RED_INTERNAL', 'BLACK_WHIP', 'BACTERIAL', 'FUNGAL', 'VIRAL', 'WHIP_SMUT',
                          'RED_PITH', 'ALCOHOL_SMELL', 'SOUR_SMELL', 'SPORE'],
              'NUTRIENT': ['CHLOROSIS', 'INTERVEINAL', 'PURPLE_LEAVES', 'NUTRIENT', 'DEFICIENCY',
                           'YELLOWING', 'REDDISH_PURPLE', 'CORKY', 'WHITE_BUD', 'KHAIRA'],
              'ABIOTIC': ['WATERLOGGING', 'FROST', 'SALT', 'DROUGHT', 'HAIL', 'WIND_DAMAGE',
                          'STANDING_WATER', 'FROZEN', 'ICE_CRYSTAL', 'SALINE'],
              'PHYSIOLOGY': ['STUNTED', 'POOR_GROWTH', 'LODGING', 'GAPS', 'UNEVEN', 'DRYING',
                             'WILTING', 'CURLING', 'BROWNING', 'TIP_BURN'],
              'MANAGEMENT': ['WEED', 'SPACING', 'PLANTING', 'HARVEST']
            };
            
            const PLANT_PART_PATTERNS: Record<string, string[]> = {
              'STEM': ['STEM', 'INTERNODE', 'CANE', 'STALK', 'BORE_HOLE', 'TUNNEL', 'BORED'],
              'LEAF': ['LEAF', 'FOLIAR', 'CHLOROSIS', 'YELLOWING', 'SPOT', 'RUST', 'CURL', 'SCALD'],
              'ROOT': ['ROOT', 'BASAL', 'UNDERGROUND', 'TERMITE', 'GRUB'],
              'WHOLE': ['WHOLE', 'PLANT_DEATH', 'WILT', 'STUNTED', 'DEATH', 'LODGING', 'GENERAL'],
              'FRUIT': ['FRUIT', 'BOLL', 'GRAIN', 'SEED', 'POD'],
              'FLOWER': ['FLOWER', 'PANICLE', 'TASSEL'],
              'SOIL': ['SOIL', 'MUD_TUBE', 'SALT_CRUST', 'WATERLOGGING']
            };
            
            for (const symptom of visualSymptoms) {
              for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
                if (patterns.some(p => symptom.includes(p))) {
                  inferredCategories.add(category);
                }
              }
              for (const [part, patterns] of Object.entries(PLANT_PART_PATTERNS)) {
                if (patterns.some(p => symptom.includes(p))) {
                  inferredPlantParts.add(part);
                }
              }
            }
            
            // Apply category filter
            const reqCat = bundled.required_observation_category;
            if (reqCat && Array.isArray(reqCat) && reqCat.length > 0 && inferredCategories.size > 0) {
              const hasMatch = reqCat.some((cat: string) => inferredCategories.has(cat.toUpperCase()));
              if (!hasMatch) {
                return false; // Category mismatch
              }
            }
            
            // Apply plant part filter with WHOLE wildcard
            const reqPart = bundled.required_plant_part;
            if (reqPart && Array.isArray(reqPart) && reqPart.length > 0 && inferredPlantParts.size > 0) {
              const hasMatch = 
                inferredPlantParts.has('WHOLE') ||
                reqPart.includes('WHOLE') ||
                reqPart.some((part: string) => inferredPlantParts.has(part.toUpperCase()));
              if (!hasMatch) {
                return false; // Plant part mismatch
              }
            }
          }
          
          // Pass ALL CanonicalState properties to rule conditions
          // ═══════════════════════════════════════════════════════════════════
          // v7.9 CRITICAL FIX: CanonicalState has visual_symptom (SINGULAR enum)
          // but rule evaluator needs visual_symptoms (PLURAL array of observation codes).
          // The observations are stored in confirmed_observations + synthetic_observations
          // which are injected into the extended canonical state by the orchestrator.
          // Without this bridge, input.visual_symptoms was ALWAYS empty, causing
          // every observation-based condition to FAIL with SKIPPED_NO_DATA + required:true.
          // ═══════════════════════════════════════════════════════════════════
          const confirmedObs: string[] = (state as any).confirmed_observations || [];
          const syntheticObs: string[] = (state as any).synthetic_observations || [];
          const secondarySyms: string[] = Array.isArray(state.secondary_symptoms) 
            ? state.secondary_symptoms.map((s: any) => String(s)) : [];
          const allVisualSymptoms = [
            ...confirmedObs,
            ...syntheticObs,
            ...secondarySyms,
            // Also include the primary visual_symptom if it's a real value
            ...(state.visual_symptom && state.visual_symptom !== 'NONE' && state.visual_symptom !== 'UNKNOWN' 
              ? [String(state.visual_symptom)] : [])
          ];
          // Deduplicate
          const uniqueVisualSymptoms = [...new Set(allVisualSymptoms.filter(Boolean))];
          
          const input = {
            crop_code: state.crop_type?.toLowerCase() || '',
            crop_stage: state.crop_stage?.toLowerCase() || '',
            user_query: state.user_query || '',
            // v7.9 FIX: visual_symptoms now populated from confirmed + synthetic observations
            visual_symptoms: uniqueVisualSymptoms,
            visual_symptom: state.visual_symptom || '',
            // Also expose as 'observations' for evaluateConditionsJson inputObservations
            observations: uniqueVisualSymptoms,
            // Soil data
            soil_nitrogen: state.soil_nitrogen || '',
            soil_phosphorus: state.soil_phosphorus || '',
            soil_potassium: state.soil_potassium || '',
            // NDVI data
            ndvi_level: state.ndvi_level || '',
            ndvi_trend: state.ndvi_trend || '',
            // Environmental stress
            water_stress: state.water_stress || '',
            // Severity
            severity: state.severity || '',
            // Weather context
            weather: state.weather || {},
            // Data confidence
            data_confidence: state.data_confidence || '',
            // Extended context for strict constraint evaluation
            days_since_sowing: (state as any).days_since_sowing,
            soil_ph: (state as any).soil_ph,
            soil_type_name: (state as any).soil_type_name,
            soil_moisture_status: (state as any).soil_moisture_status,
            pest_count: (state as any).pest_count,
            region: (state as any).region,
            ndvi_pattern: (state as any).ndvi_pattern,
            ratoon_number: (state as any).ratoon_number,
            soil_organic_carbon: (state as any).soil_organic_carbon,
            soil_ec: (state as any).soil_ec,
            disease_confirmed: (state as any).disease_confirmed,
            irrigation_method: (state as any).irrigation_method,
            crop_cycle: (state as any).crop_cycle,
            farming_mode: (state as any).farming_mode,
          };
          return bundled.conditions(input);
        } catch (e) { 
          console.warn(`⚠️ Rule ${bundled.rule_id} condition error:`, e);
          return false; 
        }
      }
    },
    then: {
      possible_cause: bundled.cause,
      cause_confidence: bundled.confidence_score || 0.7,
      // ═══════════════════════════════════════════════════════════════════════════
      // PRODUCTION HARDENING: action_type is REQUIRED - use from DB, fallback to RECOMMEND
      // ═══════════════════════════════════════════════════════════════════════════
      action_type: bundled.action_type || 'RECOMMEND',
      action_details: {
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 1: Graph Control Fields - CRITICAL for rule dependencies
        // ═══════════════════════════════════════════════════════════════════════════
        blocks_rule_ids: bundled.blocks_rule_ids || [],
        prerequisite_rule_ids: bundled.prerequisite_rule_ids || [],
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 2: Temporal Constraint Fields - CRITICAL for age-based filtering
        // ═══════════════════════════════════════════════════════════════════════════
        crop_age_days_min: bundled.crop_age_days_min,
        crop_age_days_max: bundled.crop_age_days_max,
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 3: ETL Safety Gate Fields - CRITICAL for spray decision
        // ═══════════════════════════════════════════════════════════════════════════
        etl_applicable: bundled.etl_applicable,
        etl_value_min: bundled.etl_value_min,
        etl_value_max: bundled.etl_value_max,
        
        // ═══════════════════════════════════════════════════════════════════════════
        // PHASE 6: Safety Enhancement Fields - CRITICAL for farmer safety
        // ═══════════════════════════════════════════════════════════════════════════
        farmer_safety_level: bundled.farmer_safety_level,
        resistance_group: bundled.resistance_group,
        mode_of_action: bundled.mode_of_action,
        
        // ═══════════════════════════════════════════════════════════════════════════
        // NEW RESPONSE CONTRACT: action_text, reason_text, knowledge_text (PRIORITY)
        // Legacy response_mr/hi/en are FALLBACK ONLY
        // ═══════════════════════════════════════════════════════════════════════════
        action_text: bundled.action_text,
        reason_text: bundled.reason_text,
        knowledge_text: bundled.knowledge_text,
        i18n_key: bundled.i18n_key,
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CRITICAL: Include action_type in action_details for downstream propagation
        // This ensures action_type is available in matched_responses
        // ═══════════════════════════════════════════════════════════════════════════
        action_type: bundled.action_type || 'RECOMMEND',
        
        // LEGACY: Deprecated response fields (fallback only)
        response_mr: bundled.response_mr,
        response_hi: bundled.response_hi,
        response_en: bundled.response_en,
        
        alternatives: bundled.alternatives,
        // Product info for prescription rules
        active_ingredient: bundled.active_ingredient,
        phi_days: bundled.phi_days,
        bee_toxicity: bundled.bee_toxicity,
        ipm_level: bundled.ipm_level,
        etl_threshold: bundled.etl_threshold,
        organic_alternative: bundled.organic_alternative,
        
        // ═══════════════════════════════════════════════════════════════════════
        // PHASE 8: Rich agronomic fields for deterministic response builder
        // ═══════════════════════════════════════════════════════════════════════
        dosage_per_acre: bundled.dosage_per_acre,
        water_volume_per_acre: bundled.water_volume_per_acre,
        application_method: bundled.application_method,
        target_pest_stage: bundled.target_pest_stage,
        chemical_class: bundled.chemical_class,
        treatment_type: bundled.treatment_type,
        biological_group: bundled.biological_group,
        reentry_interval_hours: bundled.reentry_interval_hours,
        aquatic_toxicity: bundled.aquatic_toxicity,
        regulatory_status: bundled.regulatory_status,
        material_cost_per_acre_min: bundled.material_cost_per_acre_min,
        material_cost_per_acre_max: bundled.material_cost_per_acre_max,
        labor_cost_per_acre_min: bundled.labor_cost_per_acre_min,
        labor_cost_per_acre_max: bundled.labor_cost_per_acre_max,
        labor_hours_per_acre: bundled.labor_hours_per_acre,
        equipment_required: bundled.equipment_required,
        equipment_cost_per_acre: bundled.equipment_cost_per_acre,
        total_cost_estimated: bundled.total_cost_estimated,
        roi_yield_gain_pct: bundled.roi_yield_gain_pct,
        roi_cost_saved_min: bundled.roi_cost_saved_min,
        roi_cost_saved_max: bundled.roi_cost_saved_max,
        roi_net_score: bundled.roi_net_score,
        roi_confidence: bundled.roi_confidence,
        success_indicators: bundled.success_indicators,
        failure_indicators: bundled.failure_indicators,
        min_temperature: bundled.min_temperature,
        max_temperature: bundled.max_temperature,
        max_wind_speed: bundled.max_wind_speed,
        rain_delay_hours: bundled.rain_delay_hours,
        weather_dependency: bundled.weather_dependency,
        university_source: bundled.university_source,
        risk_level: bundled.risk_level,
        response_severity: bundled.response_severity,
        data_authority_rank: bundled.data_authority_rank,
        icar_package_ref: bundled.icar_package_ref,
        
        // CRITICAL: Include rule_id for traceability within action_details
        rule_id: bundled.rule_id,
        // Fix 4: Include conditions_json for downstream arbitration
        conditions_json: bundled.conditions_json || null
      },
      // CRITICAL: Include rule_id for traceability at top level
      product_reference: bundled.rule_id
    },
    scientific_basis: bundled.scientific_basis || bundled.scientific_source,
    active: true
  };
}

function mapBundledCategory(category: string): RuleCategory {
  const map: Record<string, RuleCategory> = {
    // OBSERVATION rules - gather facts
    'observation': RuleCategory.OBSERVATION,
    'crop_identity': RuleCategory.OBSERVATION,
    'growth_stage': RuleCategory.OBSERVATION,
    'soil': RuleCategory.OBSERVATION,
    'cropping_system': RuleCategory.OBSERVATION,
    'monitoring': RuleCategory.OBSERVATION,
    
    // DIAGNOSIS rules - identify causes
    'diagnosis': RuleCategory.DIAGNOSIS,
    'pest': RuleCategory.DIAGNOSIS,
    'disease': RuleCategory.DIAGNOSIS,
    'weed': RuleCategory.DIAGNOSIS,
    'stress': RuleCategory.DIAGNOSIS,
    
    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Nutrition rules go to PRESCRIPTION, NOT DIAGNOSIS
    // This prevents urgent nutrition rules from dominating primary selection
    // over pest/disease diagnosis rules via ACTION_TYPE_PRIORITY
    // ═══════════════════════════════════════════════════════════════════════
    'nutrient': RuleCategory.PRESCRIPTION,
    'nutrition': RuleCategory.PRESCRIPTION,
    
    // EXCLUSION rules - rule out causes
    'exclusion': RuleCategory.EXCLUSION,
    
    // SAFETY rules - block dangerous actions
    'safety': RuleCategory.SAFETY,
    'weather_safety': RuleCategory.SAFETY,
    'risk_safety': RuleCategory.SAFETY,
    'decision_gate': RuleCategory.SAFETY,
    
    // PRESCRIPTION rules - provide treatments
    'prescription': RuleCategory.PRESCRIPTION,
    'irrigation': RuleCategory.PRESCRIPTION,
    'fertilizer': RuleCategory.PRESCRIPTION,
    'ipm_treatment': RuleCategory.PRESCRIPTION,
    'treatment': RuleCategory.PRESCRIPTION,
    'stage_advisory': RuleCategory.PRESCRIPTION,
    'economics': RuleCategory.PRESCRIPTION,
    'harvest': RuleCategory.PRESCRIPTION,
    'planting': RuleCategory.PRESCRIPTION,
    'ratoon_management': RuleCategory.PRESCRIPTION,
    
    // ═══════════════════════════════════════════════════════════════════════
    // PRODUCTION FIX v7.5: Categories that were falling to OBSERVATION default
    // causing rules to be evaluated in Phase 1 where matched_responses are NOT
    // collected. These must route to DIAGNOSIS or PRESCRIPTION to produce output.
    // ═══════════════════════════════════════════════════════════════════════
    'ipm': RuleCategory.PRESCRIPTION,           // IPM monitoring/trap rules
    'stage_problems': RuleCategory.DIAGNOSIS,   // Stage-specific pest/disease alerts
    'advisory': RuleCategory.PRESCRIPTION,      // General advisory rules
    'cultural_practice': RuleCategory.PRESCRIPTION,
    'integrated_management': RuleCategory.PRESCRIPTION,
    'biocontrol': RuleCategory.PRESCRIPTION,
    'general': RuleCategory.DIAGNOSIS,          // General diagnostic rules
    
    // WARNING rules - inform about risks
    'warning': RuleCategory.WARNING,
    'weather': RuleCategory.WARNING,
    
    // CLARIFICATION - special handling
    'clarification': RuleCategory.OBSERVATION,
    
    // ═══════════════════════════════════════════════════════════════════════
    // FORENSIC AUDIT FIX v8.0: 4 previously unmapped categories
    // These were defaulting to DIAGNOSIS via the fallback, causing 7 warnings/request
    // ═══════════════════════════════════════════════════════════════════════
    'governance': RuleCategory.SAFETY,              // Policy/regulatory rules
    'resistance_mgmt': RuleCategory.PRESCRIPTION,   // Resistance management protocols
    'weed_management': RuleCategory.PRESCRIPTION,   // Weed treatment rules
    'physiology': RuleCategory.DIAGNOSIS,            // Physiological disorder identification

    // ═══════════════════════════════════════════════════════════════════════
    // Phase H — Fix 11: Category canonicalization. Explicit mapping for the
    // categories that were silently coerced to DIAGNOSIS (one warning per request).
    // ═══════════════════════════════════════════════════════════════════════
    'crop_rotation':         RuleCategory.PRESCRIPTION,
    'proactive_pest':        RuleCategory.WARNING,
    'proactive_monitoring':  RuleCategory.OBSERVATION,
    'management':            RuleCategory.PRESCRIPTION,

    // ═══════════════════════════════════════════════════════════════════════
    // Phase Y — Fix E: rest of the proactive_* family + nutrition/irrigation
    // were silently falling through to the DIAGNOSIS default, re-typing
    // advisory rules as diagnoses. Map the whole family explicitly.
    // ═══════════════════════════════════════════════════════════════════════
    'proactive_irrigation':  RuleCategory.PRESCRIPTION,
    'proactive_nutrition':   RuleCategory.PRESCRIPTION,
    'proactive_disease':     RuleCategory.WARNING,
    'proactive_weed':        RuleCategory.WARNING,
    'proactive_weather':     RuleCategory.WARNING,
  };

  const norm = category?.toLowerCase()?.trim();
  const mapped = norm ? map[norm] : undefined;
  if (mapped) return mapped;

  // Family fallback before the unknown-default — anything proactive_* is a
  // warning, not a diagnosis.
  if (norm && norm.startsWith('proactive_')) {
    console.warn(`⚠️ [mapBundledCategory] Unmapped proactive family '${category}' → WARNING (family fallback)`);
    return RuleCategory.WARNING;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase Y — Fix E: unknown categories MUST NOT silently become DIAGNOSIS.
  // That misroutes advisory/observational rules into the diagnosis pipeline
  // and is one of the documented contributors to the "Tungro for
  // ungerminated rice" failure. Default to OBSERVATION; a rule that genuinely
  // wants to be a diagnosis must declare it explicitly.
  // ═══════════════════════════════════════════════════════════════════════
  console.warn(`⚠️ [mapBundledCategory] Unmapped category '${category}' → OBSERVATION (safe default; was DIAGNOSIS)`);
  return RuleCategory.OBSERVATION;
}

// ==================== KEYWORD FALLBACK ====================

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE-AGNOSTIC: Strong agricultural observation codes (NO hardcoded mr/hi/en words)
// These are canonical observation symbols, NOT language-specific keywords.
// Language detection is handled by the Neuro-Symbolic Bridge (LLM semantic normalizer).
// ═══════════════════════════════════════════════════════════════════════════
const STRONG_AGRI_OBSERVATION_CODES = [
  'DEAD_HEART', 'PLANT_DEATH', 'DRYING_WILTING', 'GERMINATION_FAILURE',
  'GAPS_IN_FIELD', 'PEST_DAMAGE', 'DISEASE_PATTERN', 'STEM_BORER',
  'LEAF_YELLOWING', 'LEAF_DRYING', 'ROOT_DAMAGE', 'TERMITE_DAMAGE',
  'HOLES_VISIBLE', 'BORE_HOLES', 'FRASS_VISIBLE', 'INSECT_PRESENT',
  'FUNGAL_GROWTH', 'WILTING', 'STUNTED_GROWTH', 'COLOR_CHANGE'
];

export async function evaluateBundledKeywordRules(
  userQuery: string,
  state: CanonicalState
): Promise<{ ruleId: string; cause: string; confidence: number; response: { mr?: string; hi?: string; en?: string } }[]> {
  const allBundled = await loadAllRules();
  const queryLower = userQuery.toLowerCase();
  const stateCropLower = state.crop_type?.toLowerCase() || '';
  const stateStageLower = state.crop_stage?.toLowerCase() || '';
  const matches: any[] = [];
  
  // AUDIT FIX: trigger_keywords column was DROPPED and 0 rules have it in conditions_json
  // This function now matches by cause and observations in conditions_json instead
  for (const rule of allBundled) {
    const ruleCause = (rule.cause || '').toLowerCase();
    const ruleId = (rule.rule_id || '').toLowerCase();
    
    // Match by cause or rule_id against query
    const causeMatch = ruleCause && queryLower.includes(ruleCause);
    const idMatch = ruleId && queryLower.includes(ruleId);
    
    if (causeMatch || idMatch) {
      const ruleCropLower = rule.crop_code?.toLowerCase() || '';
      const cropMatch = ruleCropLower === 'all' || ruleCropLower === '*' || 
                       ruleCropLower === 'universal' || ruleCropLower === stateCropLower;
      
      // Stage match with case-insensitive comparison (stages now UPPERCASE from loader)
      const ruleStages = rule.stage_applicable?.map((s: string) => s.toUpperCase()) || [];
      const stageMatch = ruleStages.length === 0 || ruleStages.includes(stateStageLower.toUpperCase());
      
      if (cropMatch) {
        matches.push({
          ruleId: rule.rule_id,
          cause: rule.cause,
          confidence: (rule.cause_confidence || 0.7) + (stageMatch ? 0.1 : 0),
          response: {} // AUDIT FIX: response_mr/hi/en columns DROPPED - LLM renders responses
        });
      }
    }
  }
  
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

// LANGUAGE-AGNOSTIC: Check if extracted observations contain strong agricultural signals
// This should be called with canonical observation codes, NOT raw user text
export function hasStrongAgriObservations(observations: string[]): boolean {
  if (!observations || observations.length === 0) return false;
  const obsUpper = observations.map(o => o.toUpperCase().replace(/[\s-]/g, '_'));
  return STRONG_AGRI_OBSERVATION_CODES.some(code => 
    obsUpper.some(obs => obs.includes(code) || code.includes(obs))
  );
}

export async function evaluateBundledRulesForCrop(cropCode: string, input: any): Promise<any[]> {
  const rules = loadRulesForCrop(cropCode);
  return rules.map(r => ({ ruleId: r.rule_id, cause: r.cause, confidence: r.cause_confidence || 0.7 }));
}

export function getTotalRuleCount(): { core: number; bundled: number; total: number } {
  const bundledCount = getRuleCount();
  return { core: 0, bundled: bundledCount, total: bundledCount };
}

function validateWheatBiocontrol(_bioagent: string): boolean { return true; }

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

console.log('📦 [LayeredRuleEvaluator] Using stub - rules loaded from database at runtime');
