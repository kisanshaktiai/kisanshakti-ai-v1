/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTELLIGENCE LAYERS - CENTRAL EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade intelligence modules for decision graph.
 */

// Core Intelligence Modules
export * from './weed-intelligence';
export * from './organic-intelligence';
export * from './variety-database';
export * from './variety-recommendation-rules';
export * from './resistance-management';

// P1 Modules
export * from './soil-test-integration';
export * from './explainable-ai-engine';

// P2 Modules
export * from './disease-forecasting';
export * from './carbon-sustainability';

// P3 Modules
export * from './market-intelligence';

// NEW: Missing Modules Implemented
export * from './intercropping-rules';
export * from './equipment-calibration';
export * from './remote-sensing-indices';
export * from './protected-cultivation';
export * from './outcome-tracking';

// Combined Intelligence Rules
import { VARIETY_RECOMMENDATION_RULES } from './variety-recommendation-rules';

export const ALL_INTELLIGENCE_RULES = [
  ...VARIETY_RECOMMENDATION_RULES
];
