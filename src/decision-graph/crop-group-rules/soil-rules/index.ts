/**
 * Soil Rules Index
 * Central export for all soil-related rules
 * Total: 130 rules across 4 specialized modules
 */

import { CauseRule } from '../../types';

// Import all soil rule modules
import { SOIL_PH_RULES } from './soil-ph-rules';
import { SOIL_NUTRIENT_RULES } from './soil-nutrient-rules';
import { SOIL_PHYSICAL_RULES } from './soil-physical-rules';
import { SOIL_BIOLOGICAL_RULES } from './soil-biological-rules';

// Combined export of all soil rules
export const ALL_SOIL_RULES: CauseRule[] = [
  ...SOIL_PH_RULES,
  ...SOIL_NUTRIENT_RULES,
  ...SOIL_PHYSICAL_RULES,
  ...SOIL_BIOLOGICAL_RULES,
];

// Get total soil rule count
export function getSoilRuleCount(): number {
  return ALL_SOIL_RULES.length;
}

// Get rules by soil category
export function getSoilRulesByCategory(category: 'ph' | 'nutrient' | 'physical' | 'biological'): CauseRule[] {
  switch (category) {
    case 'ph':
      return SOIL_PH_RULES;
    case 'nutrient':
      return SOIL_NUTRIENT_RULES;
    case 'physical':
      return SOIL_PHYSICAL_RULES;
    case 'biological':
      return SOIL_BIOLOGICAL_RULES;
    default:
      return [];
  }
}

// Re-export individual modules
export { SOIL_PH_RULES } from './soil-ph-rules';
export { SOIL_NUTRIENT_RULES } from './soil-nutrient-rules';
export { SOIL_PHYSICAL_RULES } from './soil-physical-rules';
export { SOIL_BIOLOGICAL_RULES } from './soil-biological-rules';

export default ALL_SOIL_RULES;
