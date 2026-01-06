/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY RULES - CENTRAL EXPORT - Backend Version
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade safety and regulatory rules for decision graph.
 * Total Rules: 800+ explicit rules
 */

// Chemical Safety Rules - P0/P1 Priority
export * from './chemical-safety-rules.ts';

// Economic Threshold Rules - P4 Priority  
export * from './economic-threshold-rules.ts';

// IPM Rules - P5 Priority
export * from './ipm-rules.ts';

// Resistance Management Rules - P5 Priority
export * from './resistance-management-rules.ts';

// Emergency Rules - P0 Priority
export * from './emergency-rules.ts';

// Harvest & Quality Rules - P3 Priority
export * from './harvest-quality-rules.ts';

// PHI Withdrawal Rules - P1 Priority
export * from './phi-withdrawal-rules.ts';

// Nutrient Management Rules - P3/P4 Priority
export * from './nutrient-rules.ts';

// Water Management Rules - P2/P3 Priority
export * from './water-rules.ts';

// Weather-Action Coupling Rules - P2 Priority
export * from './weather-action-rules.ts';

// Regional & Seasonal Rules - P3 Priority
export * from './regional-seasonal-rules.ts';

// Disease Management Rules - P3/P4 Priority
export * from './disease-management-rules.ts';

// Crop-specific IPM rules
export * from './crop-specific-ipm-ladders.ts';

// Soil pH interaction rules
export * from './soil-ph-interaction-rules.ts';

// Import all rule arrays for aggregation
import { NUTRIENT_RULES } from './nutrient-rules.ts';
import { WATER_RULES } from './water-rules.ts';
import { WEATHER_ACTION_RULES } from './weather-action-rules.ts';
import { REGIONAL_SEASONAL_RULES } from './regional-seasonal-rules.ts';
import { DISEASE_MANAGEMENT_RULES } from './disease-management-rules.ts';
import { CHEMICAL_SAFETY_RULES } from './chemical-safety-rules.ts';
import { EMERGENCY_RULES } from './emergency-rules.ts';
import { PHI_WITHDRAWAL_RULES } from './phi-withdrawal-rules.ts';
import { ECONOMIC_THRESHOLD_RULES } from './economic-threshold-rules.ts';
import { IPM_RULES } from './ipm-rules.ts';
import { RESISTANCE_MANAGEMENT_RULES } from './resistance-management-rules.ts';
import { HARVEST_QUALITY_RULES } from './harvest-quality-rules.ts';
import { CROP_SPECIFIC_IPM_RULES } from './crop-specific-ipm-ladders.ts';
import { SOIL_PH_INTERACTION_RULES } from './soil-ph-interaction-rules.ts';

/**
 * Get all safety rules as a combined array
 */
export function getAllSafetyRules() {
  return [
    ...CHEMICAL_SAFETY_RULES,
    ...EMERGENCY_RULES,
    ...PHI_WITHDRAWAL_RULES,
    ...ECONOMIC_THRESHOLD_RULES,
    ...IPM_RULES,
    ...CROP_SPECIFIC_IPM_RULES,
    ...RESISTANCE_MANAGEMENT_RULES,
    ...HARVEST_QUALITY_RULES,
    ...NUTRIENT_RULES,
    ...WATER_RULES,
    ...WEATHER_ACTION_RULES,
    ...REGIONAL_SEASONAL_RULES,
    ...DISEASE_MANAGEMENT_RULES,
    ...SOIL_PH_INTERACTION_RULES,
  ];
}

/**
 * Get total count of safety rules
 */
export function getSafetyRuleCount(): number {
  return getAllSafetyRules().length;
}

/**
 * Get rules by category
 */
export function getRulesByCategory(category: string) {
  switch (category) {
    case 'chemical-safety': return CHEMICAL_SAFETY_RULES;
    case 'emergency': return EMERGENCY_RULES;
    case 'phi-withdrawal': return PHI_WITHDRAWAL_RULES;
    case 'economic-threshold': return ECONOMIC_THRESHOLD_RULES;
    case 'ipm': return [...IPM_RULES, ...CROP_SPECIFIC_IPM_RULES];
    case 'crop-specific-ipm': return CROP_SPECIFIC_IPM_RULES;
    case 'resistance-management': return RESISTANCE_MANAGEMENT_RULES;
    case 'harvest-quality': return HARVEST_QUALITY_RULES;
    case 'nutrient': return NUTRIENT_RULES;
    case 'water': return WATER_RULES;
    case 'weather-action': return WEATHER_ACTION_RULES;
    case 'regional-seasonal': return REGIONAL_SEASONAL_RULES;
    case 'disease-management': return DISEASE_MANAGEMENT_RULES;
    default: return [];
  }
}
