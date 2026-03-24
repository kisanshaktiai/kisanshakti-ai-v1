/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL RULES INDEX - LIGHTWEIGHT STUB
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Minimal stub to prevent bundle timeout.
 * Rules are loaded from database at runtime via loader.ts.
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// STUB EXPORTS - Empty arrays (rules loaded at runtime from database)
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_IDENTITY_RULES: BundledRule[] = [];
export const CROP_IDENTITY_RULE_COUNT = 0;

export const GROWTH_STAGE_RULES: BundledRule[] = [];
export const GROWTH_STAGE_RULE_COUNT = 0;

export const OBSERVATION_RULES: BundledRule[] = [];
export const OBSERVATION_RULE_COUNT = 0;

export const NUTRIENT_RULES: BundledRule[] = [];
export const NUTRIENT_RULE_COUNT = 0;

export const PEST_RULES: BundledRule[] = [];
export const PEST_RULE_COUNT = 0;

export const DISEASE_RULES: BundledRule[] = [];
export const DISEASE_RULE_COUNT = 0;

export const WEED_RULES: BundledRule[] = [];
export const WEED_RULE_COUNT = 0;

export const SOIL_RULES: BundledRule[] = [];
export const SOIL_RULE_COUNT = 0;

export const WEATHER_RULES: BundledRule[] = [];
export const WEATHER_RULE_COUNT = 0;

export const IRRIGATION_RULES: BundledRule[] = [];
export const IRRIGATION_RULE_COUNT = 0;

export const FERTILIZER_RULES: BundledRule[] = [];
export const FERTILIZER_RULE_COUNT = 0;

export const CROPPING_SYSTEM_RULES: BundledRule[] = [];
export const CROPPING_SYSTEM_RULE_COUNT = 0;

export const RISK_SAFETY_RULES: BundledRule[] = [];
export const RISK_SAFETY_RULE_COUNT = 0;

/** All canonical rules - loaded at runtime */
export const ALL_CANONICAL_RULES: BundledRule[] = [];
export const CANONICAL_RULE_COUNT = 0;

export const CANONICAL_GROUP_COUNTS = {
  crop_identity: 0,
  growth_stage: 0,
  observation: 0,
  nutrient: 0,
  pest: 0,
  disease: 0,
  weed: 0,
  soil: 0,
  weather: 0,
  irrigation: 0,
  fertilizer: 0,
  cropping_system: 0,
  risk_safety: 0,
};

console.log('📦 Canonical Rules: Using stub - rules loaded from database at runtime');
