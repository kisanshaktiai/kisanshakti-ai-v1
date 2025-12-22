/**
 * Crop Group Rules Index
 * Central export for all crop group rules
 */

import { CauseRule, CropGroup } from '../types';

// Import all crop group rules
import { CEREALS_RULES } from './cereals';
import { PULSES_RULES } from './pulses';
import { VEGETABLES_RULES } from './vegetables';
import { FIBER_RULES } from './fiber';
import { OILSEEDS_RULES } from './oilseeds';
import SUGARCANE_RULES from './sugarcane';
import { FRUITS_RULES } from './fruits';
import { SPICES_RULES } from './spices';
import { FODDER_RULES } from './fodder';

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
]);

// Get rules for a specific crop group
export function getRulesForCropGroup(group: CropGroup): CauseRule[] {
  return CROP_GROUP_RULES.get(group) || [];
}

// Get total rule count
export function getTotalRuleCount(): number {
  let count = 0;
  for (const rules of CROP_GROUP_RULES.values()) {
    count += rules.length;
  }
  return count;
}

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
};
