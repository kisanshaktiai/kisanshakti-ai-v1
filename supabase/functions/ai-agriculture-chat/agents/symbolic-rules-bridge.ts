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
  trigger_keywords?: string[];
  response_mr?: string;
  response_hi?: string;
  response_en?: string;
  alternatives?: string[];
  action_type?: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'DELAY' | 'MONITOR';
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

export function matchRulesByKeywords(
  input: RuleExecutionInput,
  targetCategory?: RuleCategory
): SymbolicRule[] {
  console.log('🔍 [SymbolicBridge] matchRulesByKeywords - using database rules');
  
  // Rules are loaded from database via bundled-rules/loader.ts
  // Return empty for now - actual matching done via loadAllRules()
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

export function convertToRuleResult(
  rule: SymbolicRule | ExecutableRule,
  inputOrLanguage: any
): RuleResult {
  const language = typeof inputOrLanguage === 'string' 
    ? inputOrLanguage 
    : (inputOrLanguage?.language || 'en');
  
  const getResponse = () => {
    const r = rule as any;
    switch (language) {
      case 'mr': return r.response_mr || r.response_en || r.scientific_basis;
      case 'hi': return r.response_hi || r.response_en || r.scientific_basis;
      default: return r.response_en || r.scientific_basis;
    }
  };
  
  return {
    rule_id: rule.rule_id,
    priority: normalizePriority(rule.priority as any),
    action: rule.action_type || 'RECOMMEND',
    cause: rule.cause,
    reason: getResponse(),
    reason_mr: (rule as any).response_mr,
    reason_hi: (rule as any).response_hi,
    alternatives: (rule as any).alternatives,
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
