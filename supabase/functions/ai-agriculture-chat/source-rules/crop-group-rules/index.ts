/**
 * Crop Group Rules Index - Backend Version
 * Central export for all crop group rules
 */

import { CauseRule, CropGroup } from '../types.ts';

// Import all crop group rules
import { CEREALS_RULES } from './cereals.ts';
import { PULSES_RULES } from './pulses.ts';
import { VEGETABLES_RULES } from './vegetables.ts';
import { FIBER_RULES } from './fiber.ts';
import { OILSEEDS_RULES } from './oilseeds.ts';
import SUGARCANE_RULES from './sugarcane.ts';
import { FRUITS_RULES } from './fruits.ts';
import { SPICES_RULES } from './spices.ts';
import { FODDER_RULES } from './fodder.ts';
import MICRONUTRIENT_RULES from './micronutrients.ts';
import { PLANTATION_RULES } from './plantation.ts';
import { POST_HARVEST_RULES } from './post-harvest.ts';
import { ORGANIC_FARMING_RULES } from './organic-farming.ts';
import { ALL_SOIL_RULES } from './soil-rules/index.ts';

// Map of crop group to rules
export const CROP_GROUP_RULES: Map<CropGroup, CauseRule[]> = new Map([
  [CropGroup.CEREALS, CEREALS_RULES],
  [CropGroup.PULSES, PULSES_RULES],
  [CropGroup.VEGETABLES, VEGETABLES_RULES],
  [CropGroup.FIBER, FIBER_RULES],
  [CropGroup.OILSEEDS, OILSEEDS_RULES],
  [CropGroup.SUGARCANE, SUGARCANE_RULES],
  [CropGroup.FRUITS, FRUITS_RULES],
  [CropGroup.SPICES, SPICES_RULES],
  [CropGroup.FODDER, FODDER_RULES],
  [CropGroup.PLANTATION, PLANTATION_RULES],
]);

// Get all crop group rules as a flat array
export function getAllCropGroupRules(): CauseRule[] {
  const allRules: CauseRule[] = [];
  for (const rules of CROP_GROUP_RULES.values()) {
    allRules.push(...rules);
  }
  return allRules;
}

// Get rules for a specific crop group
export function getRulesForCropGroup(group: CropGroup): CauseRule[] {
  return CROP_GROUP_RULES.get(group) || [];
}

// Get total rule count
export function getTotalRuleCount(): number {
  let count = MICRONUTRIENT_RULES.length + POST_HARVEST_RULES.length + ALL_SOIL_RULES.length + ORGANIC_FARMING_RULES.length;
  for (const rules of CROP_GROUP_RULES.values()) {
    count += rules.length;
  }
  return count;
}

// Universal rules that apply across all crops
export const UNIVERSAL_RULES = [...MICRONUTRIENT_RULES, ...POST_HARVEST_RULES];

// Wheat IPM rules (different Rule interface - for layered evaluator)
export * from './wheat-ipm-rules.ts';

// Re-export individual rule sets
export {
  CEREALS_RULES,
  PULSES_RULES,
  VEGETABLES_RULES,
  FIBER_RULES,
  OILSEEDS_RULES,
  SUGARCANE_RULES,
  FRUITS_RULES,
  SPICES_RULES,
  FODDER_RULES,
  MICRONUTRIENT_RULES,
  PLANTATION_RULES,
  POST_HARVEST_RULES,
  ORGANIC_FARMING_RULES,
  ALL_SOIL_RULES,
};
