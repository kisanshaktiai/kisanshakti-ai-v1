/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTELLIGENCE LAYERS - CENTRAL EXPORT - Backend Version
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade intelligence modules for decision graph.
 */

// Core Intelligence Modules
export * from './weed-intelligence.ts';
export * from './organic-intelligence.ts';
export * from './variety-database.ts';
export * from './variety-recommendation-rules.ts';
export * from './resistance-management.ts';

// P1 Modules
export * from './soil-test-integration.ts';
export * from './explainable-ai-engine.ts';

// P2 Modules
export * from './disease-forecasting.ts';
export * from './carbon-sustainability.ts';

// P3 Modules
export * from './market-intelligence.ts';

// Additional Modules
export * from './intercropping-rules.ts';
export * from './equipment-calibration.ts';
export * from './remote-sensing-indices.ts';
export * from './protected-cultivation.ts';
export * from './outcome-tracking.ts';

// Combined Intelligence Rules
import { VARIETY_RECOMMENDATION_RULES } from './variety-recommendation-rules.ts';

// Universal observation rules (different Rule interface - for layered evaluator)
export * from './universal-observation-rules.ts';

export const ALL_INTELLIGENCE_RULES = [
  ...VARIETY_RECOMMENDATION_RULES
];

export function getIntelligenceRulesCount(): number {
  return ALL_INTELLIGENCE_RULES.length;
}
