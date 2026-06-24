/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC RULES BRIDGE - Lightweight Stub (v1.0.0-stub)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules are loaded from database at runtime via bundled-rules/loader.ts
 * This stub prevents bundle timeout errors.
 */

import type { RuleResult, RuleExecutionInput } from './rule-engine-types.ts';
import type { RulePriority } from './rule-module-types.ts';

import {
  loadAllRules,
  loadSafetyRules,
  loadCropGroupRules,
  loadRulesForCrop,
  getRuleCount,
  findRulesForCause,
  type ExecutableRule
} from '../bundled-rules/loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type RuleCategory = 
  | 'nutrient' | 'water' | 'temperature' | 'disease' | 'pest' | 'weed' 
  | 'healthy' | 'critical' | 'emergency' | 'regulatory' | 'safety' 
  | 'economic' | 'ipm' | 'harvest' | 'resistance' | 'seasonal' 
  | 'regional' | 'weather_safety';

export type PriorityLevel = 
  | 'P0_EMERGENCY' | 'P1_REGULATORY' | 'P2_WEATHER_SAFETY' 
  | 'P3_CROP_STAGE' | 'P4_ECONOMIC' | 'P5_IPM' | 'P6_OPTIMIZATION';

export interface SymbolicRule {
  rule_id: string;
  category: RuleCategory;
  crop_code: string;
  priority: PriorityLevel | number;
  cause: string;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  // REMOVED: trigger_keywords - column was DROPPED, use conditions_json.trigger_keywords
  conditions_json?: Record<string, unknown>;
  // AUDIT FIX: response_mr/hi/en columns DROPPED - use action_text/reason_text/i18n_key
  action_text?: string;
  reason_text?: string;
  knowledge_text?: string;
  i18n_key?: string;
  alternatives?: string[];
  // AUDIT FIX: Aligned to 5-type DB canonical enum
  action_type?: 'RECOMMEND' | 'MONITOR' | 'BLOCK' | 'NO_ACTION_REQUIRED' | 'URGENT_ACTION';
}

// ═══════════════════════════════════════════════════════════════════════════
// STUB: Empty registry - rules loaded from database at runtime
// ═══════════════════════════════════════════════════════════════════════════

export const SYMBOLIC_RULES_REGISTRY: SymbolicRule[] = [];

// ═══════════════════════════════════════════════════════════════════════════
// PRIORITY CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

const PRIORITY_VALUES: Record<string, number> = {
  'P0_EMERGENCY': 100,
  'P1_REGULATORY': 90,
  'P2_WEATHER_SAFETY': 80,
  'P3_CROP_STAGE': 70,
  'P4_ECONOMIC': 60,
  'P5_IPM': 50,
  'P6_OPTIMIZATION': 40
};

function normalizePriority(priority: PriorityLevel | number): number {
  if (typeof priority === 'number') return priority;
  return PRIORITY_VALUES[priority] || 50;
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORD MATCHING - Uses database rules
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BUG FIX #3: Implement actual keyword matching instead of empty stub
// Supports both string[] and RuleExecutionInput for compatibility
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input type for matchRulesByKeywords - supports string array or object
 */
type KeywordInput = string[] | RuleExecutionInput | {
  crop_code?: string;
  crop_stage?: string;
  severity?: string;
  observations?: string[];
  user_query?: string;
  pest_code?: string;
  disease_code?: string;
};

/**
 * Extract keywords from various input types
 */
function extractKeywords(input: KeywordInput): string[] {
  // If input is already a string array
  if (Array.isArray(input)) {
    return input.map(s => s.toLowerCase());
  }
  
  const keywords: string[] = [];
  
  // Handle object input - check common properties
  const obj = input as any;
  
  // From farmer_context (RuleExecutionInput structure)
  if (obj.farmer_context) {
    if (obj.farmer_context.crop_code) keywords.push(obj.farmer_context.crop_code.toLowerCase());
    if (obj.farmer_context.crop_stage) keywords.push(obj.farmer_context.crop_stage.toLowerCase());
  }
  
  // From pest_disease_state (RuleExecutionInput structure)
  if (obj.pest_disease_state) {
    if (obj.pest_disease_state.pest_code && obj.pest_disease_state.pest_code !== 'UNKNOWN') {
      keywords.push(obj.pest_disease_state.pest_code.toLowerCase());
    }
    if (obj.pest_disease_state.disease_code && obj.pest_disease_state.disease_code !== 'UNKNOWN') {
      keywords.push(obj.pest_disease_state.disease_code.toLowerCase());
    }
    if (obj.pest_disease_state.severity && obj.pest_disease_state.severity !== 'UNKNOWN') {
      keywords.push(obj.pest_disease_state.severity.toLowerCase());
    }
  }
  
  // From simpler object structure
  if (obj.crop_code) keywords.push(obj.crop_code.toLowerCase());
  if (obj.crop_stage) keywords.push(obj.crop_stage.toLowerCase());
  if (obj.severity) keywords.push(obj.severity.toLowerCase());
  if (obj.pest_code) keywords.push(obj.pest_code.toLowerCase());
  if (obj.disease_code) keywords.push(obj.disease_code.toLowerCase());
  
  // Add observations
  if (obj.observations && Array.isArray(obj.observations)) {
    keywords.push(...obj.observations.map((o: string) => o.toLowerCase()));
  }
  
  // Add significant words from user query
  if (obj.user_query) {
    const words = obj.user_query.toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 2);
    keywords.push(...words);
  }
  
  return [...new Set(keywords)];
}

/**
 * Get crop code from various input types
 */
function getCropCodeFromInput(input: KeywordInput): string {
  if (Array.isArray(input)) {
    // Try to find common crop names in keywords
    const crops = ['sugarcane', 'cotton', 'soybean', 'rice', 'wheat', 'maize', 'onion', 'tomato', 'tur'];
    for (const crop of crops) {
      if (input.some(k => k.toLowerCase().includes(crop))) {
        return crop;
      }
    }
    return 'all';
  }
  
  const obj = input as any;
  return obj.farmer_context?.crop_code?.toLowerCase() || 
         obj.crop_code?.toLowerCase() || 
         'all';
}

export function matchRulesByKeywords(
  input: KeywordInput,
  targetCategory?: RuleCategory
): SymbolicRule[] {
  console.log('🔍 [SymbolicBridge] matchRulesByKeywords - using database rules');
  
  // Get all loaded rules for the crop
  const cropCode = getCropCodeFromInput(input);
  const allRules = loadRulesForCrop(cropCode);
  
  if (allRules.length === 0) {
    console.log(`   ⚠️ [SymbolicBridge] No cached rules available for crop: ${cropCode}`);
    return [];
  }
  
  // Filter by category if specified
  let filteredRules = targetCategory 
    ? allRules.filter(r => r.category === targetCategory)
    : allRules;
  
  // Extract keywords from input
  const keywords = extractKeywords(input);
  
  // Filter by keyword match - CRITICAL FIX: use conditions_json.trigger_keywords
  if (keywords.length > 0) {
    filteredRules = filteredRules.filter(r => {
      // Get trigger_keywords from conditions_json (column was DROPPED)
      const conditionsJson = (r as any).conditions_json || {};
      const ruleKeywords: string[] = conditionsJson.trigger_keywords || [];
      const ruleCause = (r.cause || '').toLowerCase();
      const ruleId = (r.rule_id || '').toLowerCase();
      
      // Check if any input keyword matches rule keywords, cause, or rule_id
      return keywords.some(kw => 
        ruleKeywords.some((rk: string) => 
          rk.toLowerCase().includes(kw) || kw.includes(rk.toLowerCase())
        ) ||
        ruleCause.includes(kw) ||
        ruleId.includes(kw)
      );
    });
  }
  
  console.log(`   📋 Symbolic Bridge: ${filteredRules.length} rules matched for ${targetCategory || 'all'}`);
  
  // Convert ExecutableRule to SymbolicRule format
  // AUDIT FIX: Removed dropped response_mr/hi/en, use action_text/reason_text/i18n_key
  return filteredRules.map(r => ({
    rule_id: r.rule_id,
    category: r.category as RuleCategory,
    crop_code: r.crop_code || 'all',
    priority: r.priority || 50,
    cause: r.cause || '',
    scientific_source: r.scientific_source || '',
    scientific_basis: r.scientific_basis || '',
    icar_package: r.icar_package_ref,
    conditions_json: (r as any).conditions_json || {},
    action_text: (r as any).action_text,
    reason_text: (r as any).reason_text,
    knowledge_text: (r as any).knowledge_text,
    i18n_key: (r as any).i18n_key,
    alternatives: r.alternatives || [],
    action_type: r.action_type as any
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

export function convertToRuleResult(
  rule: SymbolicRule | ExecutableRule,
  inputOrLanguage: any
): RuleResult {
  // AUDIT FIX: Use action_text/reason_text instead of dropped response_mr/hi/en
  const r = rule as any;
  const reason = r.action_text || r.reason_text || r.scientific_basis || rule.cause;
  
  return {
    rule_id: rule.rule_id,
    priority: normalizePriority(rule.priority as any),
    action: rule.action_type || 'RECOMMEND',
    cause: rule.cause,
    reason: reason,
    alternatives: r.alternatives,
    confidence: 0.85,
    scientific_source: rule.scientific_source,
    scientific_basis: rule.scientific_basis
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY/CROP FILTERING - Uses database via loader
// ═══════════════════════════════════════════════════════════════════════════

export function getRulesByCategory(category: RuleCategory): SymbolicRule[] {
  return [];
}

export function getRulesForCrop(cropCode: string): SymbolicRule[] {
  return [];
}

export function getRuleCountByCategory(): Record<string, number> {
  return {};
}

export function getTotalRuleCount(): number {
  return getRuleCount();
}

export function getBundledRulesForCrop(cropCode: string): ExecutableRule[] {
  return loadRulesForCrop(cropCode);
}

export function findRulesMatchingCause(cause: string): ExecutableRule[] {
  return findRulesForCause(cause);
}

console.log('📦 [SymbolicBridge] Using stub - rules loaded from database at runtime');
