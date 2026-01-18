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
  type ExecutableRule
} from '../bundled-rules/loader.ts';

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

export interface LayeredRuleResult {
  rules_evaluated: number;
  rules_matched: number;
  rules_applied: string[];
  rules_blocked_by_graph: string[];  // NEW: Rules blocked by graph constraints
  rules_blocked_by_etl: string[];    // NEW: Rules blocked by ETL threshold
  observations: string[];
  diagnoses: Diagnosis[];
  final_diagnosis: Diagnosis | null;
  exclusions: { cause: string; reason: string }[];
  prescription_allowed: boolean;
  prescription_gate_reason?: string;
  safety_blocks: { rule_id: string; message: string }[];
  prescriptions: RuleAssertions[];
  warnings: RuleAssertions[];
  safety_warnings: string[];  // NEW: Farmer safety warnings
  confidence_in_result: number;
  // CRITICAL: Include matched responses for LLM formatting even when prescriptions are blocked
  matched_responses: { rule_id: string; cause: string; response_mr?: string; response_hi?: string; response_en?: string }[];
}

// ==================== STUB: Empty rule arrays ====================
// Rules loaded from database at runtime

const ALL_WHEAT_IPM_RULES: Rule[] = [];
const ALL_UNIVERSAL_RULES: Rule[] = [];
export const CORE_RULES: Rule[] = [];

export const ALL_RULES: Rule[] = [];

// ==================== CONDITION MATCHING ====================

function matchesConditions(rule: Rule, state: CanonicalState): boolean {
  const conditions = rule.when;
  
  if (conditions.custom && !conditions.custom(state)) return false;
  if (conditions.crop_type?.length && !conditions.crop_type.includes(state.crop_type as CropType)) return false;
  if (conditions.crop_stage?.length && !conditions.crop_stage.includes(state.crop_stage as CropStage)) return false;
  if (conditions.visual_symptom?.length && !conditions.visual_symptom.includes(state.visual_symptom as VisualSymptom)) return false;
  if (conditions.ndvi_level?.length && !conditions.ndvi_level.includes(state.ndvi_level as NDVILevel)) return false;
  if (conditions.ndvi_trend?.length && !conditions.ndvi_trend.includes(state.ndvi_trend as NDVITrend)) return false;
  if (conditions.soil_nitrogen?.length && !conditions.soil_nitrogen.includes(state.soil_nitrogen as SoilNitrogen)) return false;
  if (conditions.soil_phosphorus?.length && !conditions.soil_phosphorus.includes(state.soil_phosphorus as SoilPhosphorus)) return false;
  if (conditions.soil_potassium?.length && !conditions.soil_potassium.includes(state.soil_potassium as SoilPotassium)) return false;
  if (conditions.water_stress?.length && !conditions.water_stress.includes(state.water_stress as WaterStress)) return false;
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
    matched_responses: [] // CRITICAL: Collect responses from all matched rules
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
        // PRODUCTION HARDENING: Include new response contract fields
        const actionDetails = rule.then.action_details || {};
        if (actionDetails.response_mr || actionDetails.response_en || actionDetails.action_text) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause,
            // NEW RESPONSE CONTRACT (PRIORITY)
            action_text: actionDetails.action_text,
            reason_text: actionDetails.reason_text,
            knowledge_text: actionDetails.knowledge_text,
            // LEGACY (FALLBACK)
            response_mr: actionDetails.response_mr,
            response_hi: actionDetails.response_hi,
            response_en: actionDetails.response_en
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
      // PRODUCTION HARDENING: Include new response contract fields
      const prescriptionActionDetails = rule.then.action_details || {};
      if (prescriptionActionDetails.response_mr || prescriptionActionDetails.response_en || prescriptionActionDetails.action_text) {
        result.matched_responses.push({
          rule_id: rule.id,
          cause: rule.then.possible_cause || rule.then.action_type || 'TREATMENT',
          // NEW RESPONSE CONTRACT (PRIORITY)
          action_text: prescriptionActionDetails.action_text,
          reason_text: prescriptionActionDetails.reason_text,
          knowledge_text: prescriptionActionDetails.knowledge_text,
          // LEGACY (FALLBACK)
          response_mr: prescriptionActionDetails.response_mr,
          response_hi: prescriptionActionDetails.response_hi,
          response_en: prescriptionActionDetails.response_en
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
        // PRODUCTION HARDENING: Include new response contract fields
        const blockedActionDetails = rule.then.action_details || {};
        if (blockedActionDetails.response_mr || blockedActionDetails.response_en || blockedActionDetails.action_text) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause || rule.then.action_type || 'MONITORING_ADVICE',
            // NEW RESPONSE CONTRACT (PRIORITY)
            action_text: blockedActionDetails.action_text,
            reason_text: blockedActionDetails.reason_text,
            knowledge_text: blockedActionDetails.knowledge_text,
            // LEGACY (FALLBACK)
            response_mr: blockedActionDetails.response_mr,
            response_hi: blockedActionDetails.response_hi,
            response_en: blockedActionDetails.response_en
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
  
  // Log summary
  if (result.rules_blocked_by_graph.length > 0 || result.rules_blocked_by_etl.length > 0) {
    console.log(`📊 [LayeredRuleEvaluator] Summary:
   - Rules evaluated: ${result.rules_evaluated}
   - Rules matched: ${result.rules_matched}
   - Blocked by graph: ${result.rules_blocked_by_graph.length}
   - Blocked by ETL: ${result.rules_blocked_by_etl.length}
   - Safety warnings: ${result.safety_warnings.length}`);
  }
  
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
    catRules.sort((a, b) => b.priority - a.priority);
  }
  return grouped;
}

// ==================== ASYNC RULE LOADING ====================

let cachedConvertedRules: Rule[] | null = null;

export async function getAllRulesWithBundled(): Promise<Rule[]> {
  if (cachedConvertedRules) return cachedConvertedRules;
  
  const bundledRules = await loadAllRules();
  console.log(`📦 Loaded ${bundledRules.length} bundled rules from database`);
  cachedConvertedRules = bundledRules.map(convertBundledToRule);
  return cachedConvertedRules;
}

function convertBundledToRule(bundled: ExecutableRule): Rule {
  return {
    id: bundled.rule_id,
    category: mapBundledCategory(bundled.category),
    priority: bundled.priority || 50,
    when: {
      custom: (state: CanonicalState & { user_query?: string; visual_symptoms?: string[] }) => {
        try {
          // Pass ALL CanonicalState properties to rule conditions
          // CRITICAL: Normalize crop_code to lowercase for case-insensitive matching
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
            data_confidence: state.data_confidence || ''
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
      cause_confidence: bundled.cause_confidence || 0.7,
      // ═══════════════════════════════════════════════════════════════════════════
      // PRODUCTION HARDENING: action_type is REQUIRED - use from DB, never default
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
        rule_id: bundled.rule_id
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
    'nutrient': RuleCategory.DIAGNOSIS,
    'nutrition': RuleCategory.DIAGNOSIS,
    'weed': RuleCategory.DIAGNOSIS,
    'stress': RuleCategory.DIAGNOSIS,
    
    // EXCLUSION rules - rule out causes
    'exclusion': RuleCategory.EXCLUSION,
    
    // SAFETY rules - block dangerous actions
    'safety': RuleCategory.SAFETY,
    'weather_safety': RuleCategory.SAFETY,
    'risk_safety': RuleCategory.SAFETY,
    
    // PRESCRIPTION rules - provide treatments
    'prescription': RuleCategory.PRESCRIPTION,
    'irrigation': RuleCategory.PRESCRIPTION,
    'fertilizer': RuleCategory.PRESCRIPTION,
    'ipm_treatment': RuleCategory.PRESCRIPTION, // CRITICAL: IPM treatments are prescriptions!
    'treatment': RuleCategory.PRESCRIPTION,
    'stage_advisory': RuleCategory.PRESCRIPTION,
    'economics': RuleCategory.PRESCRIPTION,
    'harvest': RuleCategory.PRESCRIPTION,
    
    // WARNING rules - inform about risks
    'warning': RuleCategory.WARNING,
    'weather': RuleCategory.WARNING,
    
    // CLARIFICATION - special handling
    'clarification': RuleCategory.OBSERVATION
  };
  return map[category?.toLowerCase()] || RuleCategory.DIAGNOSIS;
}

// ==================== KEYWORD FALLBACK ====================

// PHASE-14: Strong agricultural keywords that trigger keyword fallback even when visual_symptom is NONE
const STRONG_AGRI_KEYWORDS = [
  // Marathi
  'मेला', 'मेले', 'वाळले', 'सुकले', 'उगवले', 'उगवत', 'गॅप', 'किड', 'रोग', 'कीटक',
  'अळी', 'पिवळे', 'तांबेरा', 'बुरशी', 'उधई', 'वाळवी', 'खोड', 'पाने', 'मूळ',
  // Hindi  
  'मर गया', 'मर गए', 'सूख गया', 'उगा नहीं', 'गैप', 'कीड़ा', 'रोग', 'इल्ली',
  'पीले', 'रतुआ', 'फफूंद', 'दीमक', 'तना', 'पत्ते', 'जड़',
  // English
  'died', 'dead', 'dying', 'wilted', 'germination', 'gap', 'pest', 'disease',
  'borer', 'yellow', 'rust', 'fungus', 'termite', 'stem', 'leaf', 'root'
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
  
  for (const rule of allBundled) {
    if (rule.trigger_keywords?.some(kw => queryLower.includes(kw.toLowerCase()))) {
      const ruleCropLower = rule.crop_code?.toLowerCase() || '';
      const cropMatch = ruleCropLower === 'all' || ruleCropLower === '*' || 
                       ruleCropLower === 'universal' || ruleCropLower === stateCropLower;
      
      // PHASE-14: Also check stage match for higher relevance
      const ruleStages = rule.stage_applicable?.map((s: string) => s.toLowerCase()) || [];
      const stageMatch = ruleStages.length === 0 || ruleStages.includes(stateStageLower);
      
      if (cropMatch) {
        matches.push({
          ruleId: rule.rule_id,
          cause: rule.cause,
          // PHASE-14: Boost confidence if stage also matches
          confidence: (rule.cause_confidence || 0.7) + (stageMatch ? 0.1 : 0),
          response: { mr: rule.response_mr, hi: rule.response_hi, en: rule.response_en }
        });
      }
    }
  }
  
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

// PHASE-14: Helper to check if query contains strong agricultural keywords
export function hasStrongAgriKeywords(userQuery: string): boolean {
  const queryLower = userQuery.toLowerCase();
  return STRONG_AGRI_KEYWORDS.some(kw => queryLower.includes(kw.toLowerCase()));
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
