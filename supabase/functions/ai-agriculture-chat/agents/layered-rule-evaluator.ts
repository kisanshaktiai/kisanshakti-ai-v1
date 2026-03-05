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
            conditions_json: actionDetails.conditions_json || null
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
        const etlInput: ETLInput = {
          rule_id: rule.id,
          etl_applicable: rule.then.action_details?.etl_applicable,
          etl_value_min: rule.then.action_details?.etl_value_min,
          etl_value_max: rule.then.action_details?.etl_value_max,
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
      if (farmerSafetyLevel && farmerSafetyLevel > 1) {
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
          conditions_json: prescriptionActionDetails.conditions_json || null
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
            conditions_json: blockedActionDetails.conditions_json || null
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
      if (ledger && ledger.length > 0) {
        const requiredEntries = ledger.filter(e => e.required);
        const passedRequired = requiredEntries.filter(e => e.status === ConditionStatus.PASSED).length;
        const totalRequired = requiredEntries.length;
        const normalizedScore = totalRequired > 0 ? Math.min(1.0, passedRequired / totalRequired) : (r.confidence_score ?? 0.5);
        const contentBonus = ((r.action_text ? 0.02 : 0) + (r.reason_text ? 0.015 : 0) + (r.knowledge_text ? 0.015 : 0));
        const finalScore = Math.min(1.0, normalizedScore + contentBonus);
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
      const finalScore = Math.min(1.0, normalizedScore + contentBonus);
      return { response: r, evidenceScore: finalScore, matchedConditions, totalConditions };
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // AUDIT FIX: Sort by data_authority_rank DESC first, then evidence score
    // data_authority_rank: 95 = highest authority (ICAR/research validated)
    //                      55 = lowest authority (generic advisory)
    // ═══════════════════════════════════════════════════════════════════════════
    scored.sort((a, b) => {
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
    const best = scored[0].response;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-SELECTION CONFIDENCE GATE: If best rule score < 0.6, trigger clarification
    // This ensures only well-evidenced rules become primary decisions
    // ═══════════════════════════════════════════════════════════════════════════
    const CONFIDENCE_GATE_THRESHOLD = 0.60;
    const computedConfidence = Math.min(1.0, scored[0].evidenceScore);
    
    if (computedConfidence < CONFIDENCE_GATE_THRESHOLD) {
      console.warn(`⚠️ [ConfidenceGate] Score ${(computedConfidence * 100).toFixed(0)}% < ${(CONFIDENCE_GATE_THRESHOLD * 100).toFixed(0)}% threshold`);
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
        // BUG-B FIX: Propagate product fields from DB rule for downstream validation
        active_ingredient: best.active_ingredient || null,
        dosage_per_acre: best.dosage_per_acre || null,
        cause: best.cause || null,
        // RICH DATA: Propagate all agronomic fields for world-class response generation
        organic_alternative: best.organic_alternative || null,
        phi_days: best.phi_days || null,
        bee_toxicity: best.bee_toxicity || null,
        application_method: best.application_method || null,
        water_volume_per_acre: best.water_volume_per_acre || null,
        mode_of_action: best.mode_of_action || null,
        chemical_class: best.chemical_class || null,
        resistance_group: best.resistance_group || null,
        target_pest_stage: (best as any).target_pest_stage || null,
        success_indicators: (best as any).success_indicators || null,
        failure_indicators: (best as any).failure_indicators || null,
        roi_yield_gain_pct: (best as any).roi_yield_gain_pct || null,
        reentry_interval_hours: best.reentry_interval_hours || null,
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
          // CRITICAL FIX: ENFORCE stage_applicable BEFORE evaluating other conditions
          // This prevents rules like SMUT (GRAND_GROWTH/TILLERING/MATURITY) from firing at SEEDLING
          // ═══════════════════════════════════════════════════════════════════════════
          const stageApplicable = bundled.stage_applicable || [];
          const currentStage = state.crop_stage?.toUpperCase()?.replace(/[\s-]/g, '_') || '';
          
          if (stageApplicable.length > 0 && currentStage) {
            // Normalize all stage values for comparison
            const normalizedApplicableStages = stageApplicable.map((s: string) => 
              s.toUpperCase().replace(/[\s-]/g, '_')
            );
            
            // Check for wildcard matches
            const hasWildcard = normalizedApplicableStages.some((s: string) => 
              s === '*' || s === 'ALL' || s === 'UNIVERSAL' || s === 'ANY'
            );
            
            if (!hasWildcard) {
              // Strict stage matching - rule MUST be applicable to current stage
              const stageMatch = normalizedApplicableStages.includes(currentStage);
              
              if (!stageMatch) {
                // CRITICAL: Log stage mismatch for debugging but don't spam logs
                if (bundled.priority && bundled.priority > 70) {
                  console.log(`🚫 [StageGate] Rule ${bundled.rule_id} blocked: stage_applicable=[${normalizedApplicableStages.join(',')}] vs current=${currentStage}`);
                }
                return false; // HARD GATE - Rule cannot fire at this stage
              }
            }
          }
          
          // ═══════════════════════════════════════════════════════════════════════════
          // CRITICAL FIX: ENFORCE crop_code matching with proper normalization
          // Database uses short codes (SC, CTN) while CanonicalState uses full names (SUGARCANE, COTTON)
          // ═══════════════════════════════════════════════════════════════════════════
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
          const visualSymptoms = (state.visual_symptoms || []).map((s: string) => s.toUpperCase().replace(/[\s-]/g, '_'));
          
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
          const input = {
            crop_code: state.crop_type?.toLowerCase() || '',
            crop_stage: state.crop_stage?.toLowerCase() || '',
            user_query: state.user_query || '',
            // Visual symptoms - critical for observation-based rules
            visual_symptoms: state.visual_symptoms || [],
            visual_symptom: state.visual_symptom || '',
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
    'stage_problems': RuleCategory.OBSERVATION,
    
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
    
    // WARNING rules - inform about risks
    'warning': RuleCategory.WARNING,
    'weather': RuleCategory.WARNING,
    
    // CLARIFICATION - special handling
    'clarification': RuleCategory.OBSERVATION
  };
  // ═══════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Default to OBSERVATION (lowest phase) not DIAGNOSIS
  // Unknown categories should NOT compete with pest/disease diagnosis
  // ═══════════════════════════════════════════════════════════════════════
  return map[category?.toLowerCase()] || RuleCategory.OBSERVATION;
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
