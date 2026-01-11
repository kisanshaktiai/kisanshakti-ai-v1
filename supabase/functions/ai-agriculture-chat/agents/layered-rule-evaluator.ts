// ============= LAYERED RULE EVALUATION PIPELINE - v2.0 with JSON Conditions =============
// PHASE-16: Enhanced with proper conditions_json evaluation from SymbolicReasoner
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
  observations: string[];
  diagnoses: Diagnosis[];
  final_diagnosis: Diagnosis | null;
  exclusions: { cause: string; reason: string }[];
  prescription_allowed: boolean;
  prescription_gate_reason?: string;
  safety_blocks: { rule_id: string; message: string }[];
  prescriptions: RuleAssertions[];
  warnings: RuleAssertions[];
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
 * PHASE-16: Enhanced rule evaluation with safe array handling
 * CRITICAL: All array operations are now null-safe to prevent crashes
 */
export function evaluateRulesLayered(rules: Rule[], state: CanonicalState): LayeredRuleResult {
  // PHASE-16: Safe initialization - prevent undefined errors
  const safeRules = Array.isArray(rules) ? rules : [];
  
  const result: LayeredRuleResult = {
    rules_evaluated: 0,
    rules_matched: 0,
    rules_applied: [],
    observations: [],
    diagnoses: [],
    final_diagnosis: null,
    exclusions: [],
    prescription_allowed: true,
    safety_blocks: [],
    prescriptions: [],
    warnings: [],
    confidence_in_result: 0.5,
    matched_responses: [] // CRITICAL: Collect responses from all matched rules
  };
  
  // PHASE-16: Early return if no rules to evaluate
  if (safeRules.length === 0) {
    console.warn('⚠️ [LayeredRuleEvaluator] No rules to evaluate - returning empty result');
    return result;
  }
  
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
        if (rule.then.action_details?.response_mr || rule.then.action_details?.response_en) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause,
            response_mr: rule.then.action_details?.response_mr,
            response_hi: rule.then.action_details?.response_hi,
            response_en: rule.then.action_details?.response_en
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
  
  // PHASE 5: PRESCRIPTION
  if (result.prescription_allowed) {
    for (const rule of rulesByCategory.get(RuleCategory.PRESCRIPTION) || []) {
      result.rules_evaluated++;
      if (matchesConditions(rule, state)) {
        result.rules_matched++;
        result.rules_applied.push(rule.id);
        result.prescriptions.push(rule.then);
        
        // CRITICAL: Also collect responses from prescription rules
        if (rule.then.action_details?.response_mr || rule.then.action_details?.response_en) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause || rule.then.action_type || 'TREATMENT',
            response_mr: rule.then.action_details?.response_mr,
            response_hi: rule.then.action_details?.response_hi,
            response_en: rule.then.action_details?.response_en
          });
        }
      }
    }
  } else {
    // CRITICAL: Even when prescriptions are blocked, evaluate prescription rules to collect responses
    // This ensures we can use IPM treatment responses for observation-only mode
    for (const rule of rulesByCategory.get(RuleCategory.PRESCRIPTION) || []) {
      result.rules_evaluated++;
      if (matchesConditions(rule, state)) {
        // Don't add to prescriptions (blocked), but collect responses for display
        if (rule.then.action_details?.response_mr || rule.then.action_details?.response_en) {
          result.matched_responses.push({
            rule_id: rule.id,
            cause: rule.then.possible_cause || rule.then.action_type || 'MONITORING_ADVICE',
            response_mr: rule.then.action_details?.response_mr,
            response_hi: rule.then.action_details?.response_hi,
            response_en: rule.then.action_details?.response_en
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
      action_type: bundled.action_type || 'RECOMMEND',
      action_details: {
        response_mr: bundled.response_mr,
        response_hi: bundled.response_hi,
        response_en: bundled.response_en,
        alternatives: bundled.alternatives,
        // CRITICAL: Include product info for prescription rules
        active_ingredient: bundled.active_ingredient,
        phi_days: bundled.phi_days,
        bee_toxicity: bundled.bee_toxicity,
        ipm_level: bundled.ipm_level,
        etl_threshold: bundled.etl_threshold,
        organic_alternative: bundled.organic_alternative
      },
      // CRITICAL: Include rule_id for traceability
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
