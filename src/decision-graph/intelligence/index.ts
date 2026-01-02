/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTELLIGENCE LAYERS - CENTRAL EXPORT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Production-grade intelligence modules for decision graph.
 */

// Weed Intelligence - with validation & resistance logic
export * from './weed-intelligence';

// Organic Intelligence - with conflict rules & honest assessments
export * from './organic-intelligence';

// Variety Database - ICAR released varieties with resistance profiles
export * from './variety-database';

// Variety Recommendation Rules - triggers variety recommendations
export * from './variety-recommendation-rules';

// P1: Resistance Management System - Regional MOA rotation
export * from './resistance-management';

// Combined Intelligence Rules
import { VARIETY_RECOMMENDATION_RULES } from './variety-recommendation-rules';

export const ALL_INTELLIGENCE_RULES = [
  ...VARIETY_RECOMMENDATION_RULES
];
