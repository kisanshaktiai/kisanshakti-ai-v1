/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUNDLED AGRICULTURAL RULES - SERVER-SIDE ONLY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * All 2000+ ICAR-aligned rules imported from source-rules/
 * This file is the central aggregator for the edge function.
 */

import { CauseRule } from '../source-rules/types.ts';
import { getAllCropGroupRules, getTotalRuleCount as getCropGroupCount, CEREALS_RULES, PULSES_RULES, VEGETABLES_RULES, FIBER_RULES, OILSEEDS_RULES, SUGARCANE_RULES, FRUITS_RULES, SPICES_RULES, FODDER_RULES, PLANTATION_RULES } from '../source-rules/crop-group-rules/index.ts';
import { getAllSafetyRules, getSafetyRuleCount } from '../source-rules/safety-rules/index.ts';
import { ALL_ADVANCED_RULES, getAdvancedRulesCount } from '../source-rules/advanced-rules/index.ts';
import { ALL_INTELLIGENCE_RULES, getIntelligenceRulesCount } from '../source-rules/intelligence/index.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface BundledRule {
  rule_id: string;
  category: string;
  crop_code: string;
  stage_applicable: string[];
  conditionCode: string;
  cause: string;
  priority: number;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  cause_confidence?: number;
  economic_tier?: string;
  estimated_cost_inr?: number;
}

export interface BundleMetadata {
  totalRules: number;
  generatedAt: string;
  version: string;
  rulesByCategory: Record<string, number>;
  rulesByCropGroup: Record<string, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUNDLED RULES DATA
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_GROUP_RULES: Record<string, CauseRule[]> = {
  cereals: CEREALS_RULES,
  pulses: PULSES_RULES,
  vegetables: VEGETABLES_RULES,
  fiber: FIBER_RULES,
  oilseeds: OILSEEDS_RULES,
  sugarcane: SUGARCANE_RULES,
  fruits: FRUITS_RULES,
  spices: SPICES_RULES,
  fodder: FODDER_RULES,
  plantation: PLANTATION_RULES,
};

export const SAFETY_RULES: CauseRule[] = getAllSafetyRules();
export const ADVANCED_RULES: CauseRule[] = ALL_ADVANCED_RULES;
export const INTELLIGENCE_RULES: CauseRule[] = ALL_INTELLIGENCE_RULES;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getAllCropGroupRulesFlat(): CauseRule[] {
  return getAllCropGroupRules();
}

export function getAllSafetyRulesFlat(): CauseRule[] {
  return SAFETY_RULES;
}

export function getAllRules(): CauseRule[] {
  return [
    ...getAllCropGroupRules(),
    ...SAFETY_RULES,
    ...ADVANCED_RULES,
    ...INTELLIGENCE_RULES,
  ];
}

export function getRuleCount(): number {
  return getAllRules().length;
}

export const BUNDLE_METADATA: BundleMetadata = {
  totalRules: getRuleCount(),
  generatedAt: new Date().toISOString(),
  version: "1.0.0",
  rulesByCategory: {
    crop_group: getCropGroupCount(),
    safety: getSafetyRuleCount(),
    advanced: getAdvancedRulesCount(),
    intelligence: getIntelligenceRulesCount(),
  },
  rulesByCropGroup: Object.fromEntries(
    Object.entries(CROP_GROUP_RULES).map(([key, rules]) => [key, rules.length])
  ),
};

console.log(`[BundledRules] Loaded ${getRuleCount()} total rules from source-rules/`);
