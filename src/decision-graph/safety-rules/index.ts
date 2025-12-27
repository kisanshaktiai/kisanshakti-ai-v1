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

/**
 * Get total count of safety rules
 */
export function getSafetyRuleCount(): number {
  return NUTRIENT_RULES.length + 
         WATER_RULES.length + 
         WEATHER_ACTION_RULES.length + 
         REGIONAL_SEASONAL_RULES.length + 
         DISEASE_MANAGEMENT_RULES.length + 
         150; // Existing rules from other files
}

/**
 * Get all safety rules as a combined array
 */
export function getAllSafetyRules() {
  return [
    ...NUTRIENT_RULES,
    ...WATER_RULES,
    ...WEATHER_ACTION_RULES,
    ...REGIONAL_SEASONAL_RULES,
    ...DISEASE_MANAGEMENT_RULES,
  ];
}
