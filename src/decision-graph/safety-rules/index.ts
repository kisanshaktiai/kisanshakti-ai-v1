/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFETY RULES - CENTRAL EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade safety and regulatory rules for decision graph.
 * Includes chemical safety, economic thresholds, IPM, resistance management,
 * emergency protocols, harvest quality, and PHI/withdrawal rules.
 * 
 * NOTE: These rule files contain comprehensive rule definitions based on
 * the 2000+ rules document. Type compatibility fixes may be needed to
 * align with the existing DecisionInput interface.
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

/**
 * Get total count of safety rules
 */
export function getSafetyRuleCount(): number {
  // Import counts from each module
  // Note: This is a placeholder - actual implementation would import and count
  return 650; // Approximate based on document analysis
}
