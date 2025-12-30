/**
 * Advanced Rules Index
 * Central export for all advanced technology rules
 * 
 * These rules represent cutting-edge agricultural technologies from:
 * - Israel (Precision Fertigation, Protected Cultivation)
 * - Netherlands (Wageningen Research)
 * - Brazil (EMBRAPA High-Yield Systems)
 * - Japan/Korea (PGR, Silicon Technology)
 * - USA (Microbiome, Biostimulants)
 */

import { CauseRule } from '../types';

// Import all advanced rule sets
import ALL_PGR_RULES, { 
  TOMATO_PGR_RULES, 
  COTTON_PGR_RULES, 
  WHEAT_PGR_RULES, 
  RICE_PGR_RULES 
} from './pgr-hormone-rules';

import ALL_FERTIGATION_RULES, {
  TOMATO_FERTIGATION_RULES,
  POTATO_FERTIGATION_RULES,
  ONION_FERTIGATION_RULES
} from './precision-fertigation-rules';

import ALL_BIOLOGICAL_RULES, {
  NITROGEN_FIXATION_RULES,
  PHOSPHORUS_RULES,
  BIOCONTROL_RULES,
  BIOSTIMULANT_RULES
} from './microbiome-biological-rules';

// Combined advanced rules
export const ALL_ADVANCED_RULES: CauseRule[] = [
  ...ALL_PGR_RULES,
  ...ALL_FERTIGATION_RULES,
  ...ALL_BIOLOGICAL_RULES,
];

// Get rules count
export function getAdvancedRulesCount(): number {
  return ALL_ADVANCED_RULES.length;
}

// Get rules by category
export function getAdvancedRulesByCategory(category: string): CauseRule[] {
  return ALL_ADVANCED_RULES.filter(rule => rule.category === category);
}

// Get rules by crop
export function getAdvancedRulesByCrop(cropCode: string): CauseRule[] {
  return ALL_ADVANCED_RULES.filter(
    rule => rule.crop_code === cropCode || rule.crop_code === '*'
  );
}

// Re-export individual rule sets
export {
  // PGR Rules
  ALL_PGR_RULES,
  TOMATO_PGR_RULES,
  COTTON_PGR_RULES,
  WHEAT_PGR_RULES,
  RICE_PGR_RULES,
  
  // Fertigation Rules
  ALL_FERTIGATION_RULES,
  TOMATO_FERTIGATION_RULES,
  POTATO_FERTIGATION_RULES,
  ONION_FERTIGATION_RULES,
  
  // Biological Rules
  ALL_BIOLOGICAL_RULES,
  NITROGEN_FIXATION_RULES,
  PHOSPHORUS_RULES,
  BIOCONTROL_RULES,
  BIOSTIMULANT_RULES,
};

export default ALL_ADVANCED_RULES;
