// ✅ FORENSIC REFACTOR COMPLETE
// Authority: Pure symbolic adapter - receives rule matches, outputs structured decision objects, NEVER formats language

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION BRAIN INTEGRATION v3.0 - SSOT SYMBOLIC ADAPTER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ARCHITECTURAL ROLE:
 * - Pure adapter between NLU output and symbolic rule engine
 * - Outputs ONLY structured decision objects
 * - Contains NO language text (mr/hi/en)
 * - Contains NO agronomic advice
 * - All text rendering delegated to narration layer
 * 
 * Version: 3.0.0 - SSOT Compliant
 */

import type { NLUAgentOutput } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL ENUMS - Language-neutral codes only
// ═══════════════════════════════════════════════════════════════════════════

export type RuleCategory = 
  | 'PEST_MANAGEMENT'
  | 'DISEASE_MANAGEMENT'
  | 'NUTRIENT_MANAGEMENT'
  | 'WATER_MANAGEMENT'
  | 'PGR_APPLICATION'
  | 'WEED_MANAGEMENT'
  | 'STRESS_MANAGEMENT'
  | 'HARVEST_MANAGEMENT'
  | 'GENERAL_ADVISORY';

export type ActionType = 
  | 'RECOMMENDATION' 
  | 'WARNING' 
  | 'QUESTION' 
  | 'ESCALATION' 
  | 'MONITORING'
  | 'BLOCK';

export type SafetyLevel = 'SAFE' | 'CAUTION' | 'RESTRICTED';

export type UrgencyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC OUTPUT CONTRACTS - No language text allowed
// ═══════════════════════════════════════════════════════════════════════════

export interface SymbolicProduct {
  product_code: string;
  dosage_code: string;
  method_code: string;
  timing_code: string;
  phi_days?: number;
}

export interface SymbolicRuleTrigger {
  intent_codes?: string[];
  crop_codes?: string[];
  pest_codes?: string[];
  disease_codes?: string[];
  symptom_codes?: string[];
  urgency_levels?: UrgencyLevel[];
  stage_codes?: string[];
}

export interface SymbolicRuleAction {
  action_type: ActionType;
  products?: SymbolicProduct[];
  safety_level: SafetyLevel;
  i18n_key: string; // Reference to translation table
}

export interface SymbolicDecisionRule {
  rule_id: string;
  category: RuleCategory;
  trigger_conditions: SymbolicRuleTrigger;
  action: SymbolicRuleAction;
  priority: number;
  scientific_basis_key?: string;
  icar_ref?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECISION OUTPUT CONTRACT - Structured, language-neutral
// ═══════════════════════════════════════════════════════════════════════════

export interface SymbolicDecisionOutput {
  result_type: 'DIAGNOSIS' | 'ADVICE' | 'CLARIFICATION' | 'NO_DECISION' | 'BLOCKED';
  rule_ids: string[];
  observation_codes: string[];
  cause_codes: string[];
  product_codes: string[];
  confidence: number;
  authority: 'SYMBOLIC_RULES' | 'DATABASE' | 'FALLBACK';
  requires_clarification: boolean;
  clarification_codes?: string[];
  safety_level: SafetyLevel;
  priority: number;
  i18n_keys: string[];
  metadata: {
    category: RuleCategory;
    icar_refs: string[];
    matched_rules_count: number;
    evaluation_time_ms: number;
  };
}

export interface DecisionBrainInput {
  nlu_output: NLUAgentOutput;
  crop_code: string;
  stage_code: string;
  symptom_codes: string[];
  observation_codes: string[];
  context: {
    land_id?: string;
    farmer_id?: string;
    tenant_id?: string;
    das?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC DECISION ADAPTER - Pure routing, no text generation
// ═══════════════════════════════════════════════════════════════════════════

export const DECISION_BRAIN_VERSION = '3.0.0';

/**
 * Match input against symbolic rules
 * Returns ONLY structured decision output - NO text
 */
export function matchSymbolicRules(
  input: DecisionBrainInput,
  rules: SymbolicDecisionRule[]
): SymbolicDecisionOutput {
  const startTime = Date.now();
  
  console.log(`[DecisionBrain v${DECISION_BRAIN_VERSION}] Matching rules...`);
  console.log(`  Crop: ${input.crop_code}, Stage: ${input.stage_code}`);
  console.log(`  Symptoms: ${input.symptom_codes.join(', ')}`);
  console.log(`  Observations: ${input.observation_codes.join(', ')}`);
  
  const matchedRules: SymbolicDecisionRule[] = [];
  
  for (const rule of rules) {
    if (ruleMatches(rule, input)) {
      matchedRules.push(rule);
    }
  }
  
  // Sort by priority (higher = more important)
  matchedRules.sort((a, b) => b.priority - a.priority);
  
  console.log(`  Matched ${matchedRules.length} rules`);
  
  if (matchedRules.length === 0) {
    return createNoMatchOutput(input, startTime);
  }
  
  return createMatchedOutput(matchedRules, input, startTime);
}

/**
 * Check if a rule matches the input conditions
 */
function ruleMatches(rule: SymbolicDecisionRule, input: DecisionBrainInput): boolean {
  const trigger = rule.trigger_conditions;
  
  // Check crop match
  if (trigger.crop_codes && trigger.crop_codes.length > 0) {
    if (!trigger.crop_codes.includes(input.crop_code)) {
      return false;
    }
  }
  
  // Check stage match
  if (trigger.stage_codes && trigger.stage_codes.length > 0) {
    if (!trigger.stage_codes.includes(input.stage_code)) {
      return false;
    }
  }
  
  // Check symptom match (any match counts)
  if (trigger.symptom_codes && trigger.symptom_codes.length > 0) {
    const hasSymptomMatch = trigger.symptom_codes.some(s => 
      input.symptom_codes.includes(s)
    );
    if (!hasSymptomMatch) {
      return false;
    }
  }
  
  // Check pest/disease codes
  if (trigger.pest_codes && trigger.pest_codes.length > 0) {
    const hasPestMatch = trigger.pest_codes.some(p => 
      input.observation_codes.includes(p)
    );
    if (!hasPestMatch && input.nlu_output?.pest_code) {
      if (!trigger.pest_codes.includes(input.nlu_output.pest_code)) {
        return false;
      }
    }
  }
  
  if (trigger.disease_codes && trigger.disease_codes.length > 0) {
    const hasDiseaseMatch = trigger.disease_codes.some(d => 
      input.observation_codes.includes(d)
    );
    if (!hasDiseaseMatch && input.nlu_output?.disease_code) {
      if (!trigger.disease_codes.includes(input.nlu_output.disease_code)) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Create output when no rules match
 */
function createNoMatchOutput(
  input: DecisionBrainInput,
  startTime: number
): SymbolicDecisionOutput {
  return {
    result_type: 'NO_DECISION',
    rule_ids: [],
    observation_codes: input.observation_codes,
    cause_codes: [],
    product_codes: [],
    confidence: 0.3,
    authority: 'FALLBACK',
    requires_clarification: true,
    clarification_codes: ['NEED_MORE_INFO'],
    safety_level: 'SAFE',
    priority: 0,
    i18n_keys: ['response.no_match'],
    metadata: {
      category: 'GENERAL_ADVISORY',
      icar_refs: [],
      matched_rules_count: 0,
      evaluation_time_ms: Date.now() - startTime
    }
  };
}

/**
 * Create output from matched rules
 */
function createMatchedOutput(
  matchedRules: SymbolicDecisionRule[],
  input: DecisionBrainInput,
  startTime: number
): SymbolicDecisionOutput {
  const primaryRule = matchedRules[0];
  
  // Extract all unique codes
  const ruleIds = matchedRules.map(r => r.rule_id);
  const causeCodesSet = new Set<string>();
  const productCodesSet = new Set<string>();
  const i18nKeysSet = new Set<string>();
  const icarRefs: string[] = [];
  
  for (const rule of matchedRules) {
    // Add i18n key
    i18nKeysSet.add(rule.action.i18n_key);
    
    // Extract product codes
    if (rule.action.products) {
      for (const product of rule.action.products) {
        productCodesSet.add(product.product_code);
      }
    }
    
    // Add ICAR reference
    if (rule.icar_ref) {
      icarRefs.push(rule.icar_ref);
    }
    
    // Extract cause codes from trigger
    if (rule.trigger_conditions.pest_codes) {
      rule.trigger_conditions.pest_codes.forEach(c => causeCodesSet.add(c));
    }
    if (rule.trigger_conditions.disease_codes) {
      rule.trigger_conditions.disease_codes.forEach(c => causeCodesSet.add(c));
    }
  }
  
  // Determine result type
  let resultType: SymbolicDecisionOutput['result_type'] = 'ADVICE';
  if (primaryRule.action.action_type === 'BLOCK') {
    resultType = 'BLOCKED';
  } else if (causeCodesSet.size > 0) {
    resultType = 'DIAGNOSIS';
  } else if (primaryRule.action.action_type === 'QUESTION') {
    resultType = 'CLARIFICATION';
  }
  
  // Calculate confidence based on rule match quality
  const confidence = calculateMatchConfidence(matchedRules, input);
  
  return {
    result_type: resultType,
    rule_ids: ruleIds,
    observation_codes: input.observation_codes,
    cause_codes: Array.from(causeCodesSet),
    product_codes: Array.from(productCodesSet),
    confidence,
    authority: 'SYMBOLIC_RULES',
    requires_clarification: primaryRule.action.action_type === 'QUESTION',
    safety_level: primaryRule.action.safety_level,
    priority: primaryRule.priority,
    i18n_keys: Array.from(i18nKeysSet),
    metadata: {
      category: primaryRule.category,
      icar_refs,
      matched_rules_count: matchedRules.length,
      evaluation_time_ms: Date.now() - startTime
    }
  };
}

/**
 * Calculate confidence score based on match quality
 */
function calculateMatchConfidence(
  matchedRules: SymbolicDecisionRule[],
  input: DecisionBrainInput
): number {
  if (matchedRules.length === 0) return 0.3;
  
  let confidence = 0.5;
  
  // More matched rules = higher confidence
  confidence += Math.min(matchedRules.length * 0.05, 0.2);
  
  // Specific pest/disease match = higher confidence
  const hasPestMatch = matchedRules.some(r => 
    r.trigger_conditions.pest_codes?.some(p => 
      input.observation_codes.includes(p)
    )
  );
  const hasDiseaseMatch = matchedRules.some(r => 
    r.trigger_conditions.disease_codes?.some(d => 
      input.observation_codes.includes(d)
    )
  );
  
  if (hasPestMatch || hasDiseaseMatch) {
    confidence += 0.15;
  }
  
  // Crop-specific match = higher confidence
  const hasCropMatch = matchedRules.some(r => 
    r.trigger_conditions.crop_codes?.includes(input.crop_code)
  );
  if (hasCropMatch) {
    confidence += 0.1;
  }
  
  return Math.min(confidence, 0.95);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY RULE CONVERSION - Transform old rules to symbolic format
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert legacy hardcoded rules to symbolic format
 * This strips all language text and keeps only codes
 */
export function convertLegacyRuleToSymbolic(legacyRule: any): SymbolicDecisionRule {
  return {
    rule_id: legacyRule.rule_id,
    category: legacyRule.category,
    trigger_conditions: {
      intent_codes: legacyRule.trigger_conditions?.intent,
      crop_codes: legacyRule.trigger_conditions?.crop_codes,
      pest_codes: legacyRule.trigger_conditions?.pest_codes,
      disease_codes: legacyRule.trigger_conditions?.disease_codes,
      symptom_codes: legacyRule.trigger_conditions?.symptoms,
      urgency_levels: legacyRule.trigger_conditions?.urgency_levels,
      stage_codes: legacyRule.trigger_conditions?.stage
    },
    action: {
      action_type: legacyRule.action?.type || 'MONITORING',
      products: legacyRule.action?.products?.map((p: any) => ({
        product_code: normalizeProductCode(p.name),
        dosage_code: p.dosage,
        method_code: normalizeMethodCode(p.method),
        timing_code: p.timing || 'DEFAULT',
        phi_days: p.phi_days
      })),
      safety_level: legacyRule.action?.safety_level || 'SAFE',
      i18n_key: `rule.${legacyRule.rule_id}`
    },
    priority: legacyRule.priority || 50,
    icar_ref: legacyRule.icar_source
  };
}

function normalizeProductCode(name: string): string {
  if (!name) return 'UNKNOWN';
  return name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

function normalizeMethodCode(method: string): string {
  if (!method) return 'FOLIAR_SPRAY';
  return method.toUpperCase().replace(/\s+/g, '_');
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPRECATED - Legacy rules registry removed
// All rules now loaded from database via bundled-rules/loader.ts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use database-driven rules instead
 * This constant is kept as empty for backward compatibility
 */
export const CORE_DECISION_RULES: SymbolicDecisionRule[] = [];

/**
 * @deprecated Use matchSymbolicRules with database rules instead
 */
export function findMatchingRules(
  nluOutput: NLUAgentOutput,
  cropCode?: string,
  stage?: string,
  additionalSymptoms?: string[]
): SymbolicDecisionOutput {
  console.warn('[DEPRECATED] findMatchingRules called - use matchSymbolicRules with database rules');
  
  const input: DecisionBrainInput = {
    nlu_output: nluOutput,
    crop_code: cropCode || nluOutput.crop_code || 'UNKNOWN',
    stage_code: stage || 'UNKNOWN',
    symptom_codes: additionalSymptoms || [],
    observation_codes: [],
    context: {}
  };
  
  return matchSymbolicRules(input, []);
}
