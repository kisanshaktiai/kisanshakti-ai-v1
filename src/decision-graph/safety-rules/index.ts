/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY RULES - CENTRAL EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade safety and regulatory rules for decision graph.
 * Includes chemical safety, economic thresholds, IPM, resistance management,
 * emergency protocols, harvest quality, PHI/withdrawal, nutrient, water,
 * weather-action coupling, regional/seasonal, and disease management rules.
 * 
 * Total Rules: 800+ explicit rules based on 2000+ rules document
 */

// Chemical Safety Rules - P0/P1 Priority
// Contains: Banned chemicals, restricted chemicals, WHO toxicity, PPE requirements
export * from './chemical-safety-rules';

// Economic Threshold Rules - P4 Priority  
// Contains: ETL/EIL by crop-pest-stage, cost-benefit analysis, affordability
export * from './economic-threshold-rules';

// IPM Rules - P5 Priority
// Contains: 6-level IPM ladder, biological control, conservation practices
export * from './ipm-rules';

// Resistance Management Rules - P5 Priority
// Contains: IRAC/FRAC MOA rotation, Bt refuge, max applications
export * from './resistance-management-rules';

// Emergency Rules - P0 Priority
// Contains: Outbreak detection, weather crises, emergency chemical authorization
export * from './emergency-rules';

// Harvest & Quality Rules - P3 Priority
// Contains: Maturity indicators, harvest timing, post-harvest handling
export * from './harvest-quality-rules';

// PHI Withdrawal Rules - P1 Priority
// Contains: Pre-harvest intervals, MRL compliance, organic certification
export * from './phi-withdrawal-rules';

// Nutrient Management Rules - P3/P4 Priority
// Contains: Soil test interpretation, deficiency diagnosis, timing windows
export * from './nutrient-rules';

// Water Management Rules - P2/P3 Priority
// Contains: Irrigation scheduling, drought/waterlogging, crop water requirements
export * from './water-rules';

// Weather-Action Coupling Rules - P2 Priority
// Contains: Rain/temp/wind restrictions, spray timing optimization
export * from './weather-action-rules';

// Regional & Seasonal Rules - P3 Priority
// Contains: Kharif/Rabi/Zaid adaptations, agro-climatic zone adjustments
export * from './regional-seasonal-rules';

// Disease Management Rules - P3/P4 Priority
// Contains: Bacterial/fungal differentiation, fungicide rotation, DSI thresholds
export * from './disease-management-rules';

// Import all rule arrays for aggregation
import { NUTRIENT_RULES } from './nutrient-rules';
import { WATER_RULES } from './water-rules';
import { WEATHER_ACTION_RULES } from './weather-action-rules';
import { REGIONAL_SEASONAL_RULES } from './regional-seasonal-rules';
import { DISEASE_MANAGEMENT_RULES } from './disease-management-rules';
import { CHEMICAL_SAFETY_RULES } from './chemical-safety-rules';
import { EMERGENCY_RULES } from './emergency-rules';
import { PHI_WITHDRAWAL_RULES } from './phi-withdrawal-rules';
import { ECONOMIC_THRESHOLD_RULES } from './economic-threshold-rules';
import { IPM_RULES } from './ipm-rules';
import { RESISTANCE_MANAGEMENT_RULES } from './resistance-management-rules';
import { HARVEST_QUALITY_RULES } from './harvest-quality-rules';

/**
 * Get total count of safety rules
 */
export function getSafetyRuleCount(): number {
  return CHEMICAL_SAFETY_RULES.length +
         EMERGENCY_RULES.length +
         PHI_WITHDRAWAL_RULES.length +
         ECONOMIC_THRESHOLD_RULES.length +
         IPM_RULES.length +
         RESISTANCE_MANAGEMENT_RULES.length +
         HARVEST_QUALITY_RULES.length +
         NUTRIENT_RULES.length + 
         WATER_RULES.length + 
         WEATHER_ACTION_RULES.length + 
         REGIONAL_SEASONAL_RULES.length + 
         DISEASE_MANAGEMENT_RULES.length;
}

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
    ...RESISTANCE_MANAGEMENT_RULES,
    ...HARVEST_QUALITY_RULES,
    ...NUTRIENT_RULES,
    ...WATER_RULES,
    ...WEATHER_ACTION_RULES,
    ...REGIONAL_SEASONAL_RULES,
    ...DISEASE_MANAGEMENT_RULES,
  ];
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
    case 'ipm': return IPM_RULES;
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

/**
 * Get rule count by category
 */
export function getRuleCountByCategory(): Record<string, number> {
  return {
    'chemical-safety': CHEMICAL_SAFETY_RULES.length,
    'emergency': EMERGENCY_RULES.length,
    'phi-withdrawal': PHI_WITHDRAWAL_RULES.length,
    'economic-threshold': ECONOMIC_THRESHOLD_RULES.length,
    'ipm': IPM_RULES.length,
    'resistance-management': RESISTANCE_MANAGEMENT_RULES.length,
    'harvest-quality': HARVEST_QUALITY_RULES.length,
    'nutrient': NUTRIENT_RULES.length,
    'water': WATER_RULES.length,
    'weather-action': WEATHER_ACTION_RULES.length,
    'regional-seasonal': REGIONAL_SEASONAL_RULES.length,
    'disease-management': DISEASE_MANAGEMENT_RULES.length,
  };
}
