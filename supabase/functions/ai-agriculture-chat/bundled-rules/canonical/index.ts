/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL RULES INDEX - All 13 Rule Groups
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This index consolidates all 13 canonical rule groups for the agricultural
 * decision brain. Each group handles a specific domain of agricultural knowledge.
 * 
 * IMPORTANT: All imports use static .ts extensions for Deno compatibility.
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS FROM ALL 13 CANONICAL GROUPS
// ═══════════════════════════════════════════════════════════════════════════

import { CROP_IDENTITY_RULES, CROP_IDENTITY_RULE_COUNT } from './01_crop_identity.ts';
import { GROWTH_STAGE_RULES, GROWTH_STAGE_RULE_COUNT } from './02_growth_stage.ts';
import { OBSERVATION_RULES, OBSERVATION_RULE_COUNT } from './03_observation.ts';
import { NUTRIENT_RULES, NUTRIENT_RULE_COUNT } from './04_nutrient.ts';
import { PEST_RULES, PEST_RULE_COUNT } from './05_pest.ts';
import { DISEASE_RULES, DISEASE_RULE_COUNT } from './06_disease.ts';
import { WEED_RULES, WEED_RULE_COUNT } from './07_weed.ts';
import { SOIL_RULES, SOIL_RULE_COUNT } from './08_soil.ts';
import { WEATHER_RULES, WEATHER_RULE_COUNT } from './09_weather.ts';
import { IRRIGATION_RULES, IRRIGATION_RULE_COUNT } from './10_irrigation.ts';
import { FERTILIZER_RULES, FERTILIZER_RULE_COUNT } from './11_fertilizer.ts';
import { CROPPING_SYSTEM_RULES, CROPPING_SYSTEM_RULE_COUNT } from './12_cropping_system.ts';
import { RISK_SAFETY_RULES, RISK_SAFETY_RULE_COUNT } from './13_risk_safety.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RE-EXPORTS FOR EXTERNAL USE
// ═══════════════════════════════════════════════════════════════════════════

export { CROP_IDENTITY_RULES, CROP_IDENTITY_RULE_COUNT } from './01_crop_identity.ts';
export { GROWTH_STAGE_RULES, GROWTH_STAGE_RULE_COUNT } from './02_growth_stage.ts';
export { OBSERVATION_RULES, OBSERVATION_RULE_COUNT } from './03_observation.ts';
export { NUTRIENT_RULES, NUTRIENT_RULE_COUNT } from './04_nutrient.ts';
export { PEST_RULES, PEST_RULE_COUNT } from './05_pest.ts';
export { DISEASE_RULES, DISEASE_RULE_COUNT } from './06_disease.ts';
export { WEED_RULES, WEED_RULE_COUNT } from './07_weed.ts';
export { SOIL_RULES, SOIL_RULE_COUNT } from './08_soil.ts';
export { WEATHER_RULES, WEATHER_RULE_COUNT } from './09_weather.ts';
export { IRRIGATION_RULES, IRRIGATION_RULE_COUNT } from './10_irrigation.ts';
export { FERTILIZER_RULES, FERTILIZER_RULE_COUNT } from './11_fertilizer.ts';
export { CROPPING_SYSTEM_RULES, CROPPING_SYSTEM_RULE_COUNT } from './12_cropping_system.ts';
export { RISK_SAFETY_RULES, RISK_SAFETY_RULE_COUNT } from './13_risk_safety.ts';

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED CANONICAL RULES ARRAY
// ═══════════════════════════════════════════════════════════════════════════

/** All canonical rules combined from 13 groups */
export const ALL_CANONICAL_RULES: BundledRule[] = [
  ...CROP_IDENTITY_RULES,
  ...GROWTH_STAGE_RULES,
  ...OBSERVATION_RULES,
  ...NUTRIENT_RULES,
  ...PEST_RULES,
  ...DISEASE_RULES,
  ...WEED_RULES,
  ...SOIL_RULES,
  ...WEATHER_RULES,
  ...IRRIGATION_RULES,
  ...FERTILIZER_RULES,
  ...CROPPING_SYSTEM_RULES,
  ...RISK_SAFETY_RULES
];

/** Total count of all canonical rules */
export const CANONICAL_RULE_COUNT = ALL_CANONICAL_RULES.length;

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP COUNTS METADATA
// ═══════════════════════════════════════════════════════════════════════════

export const CANONICAL_GROUP_COUNTS = {
  crop_identity: CROP_IDENTITY_RULE_COUNT,
  growth_stage: GROWTH_STAGE_RULE_COUNT,
  observation: OBSERVATION_RULE_COUNT,
  nutrient: NUTRIENT_RULE_COUNT,
  pest: PEST_RULE_COUNT,
  disease: DISEASE_RULE_COUNT,
  weed: WEED_RULE_COUNT,
  soil: SOIL_RULE_COUNT,
  weather: WEATHER_RULE_COUNT,
  irrigation: IRRIGATION_RULE_COUNT,
  fertilizer: FERTILIZER_RULE_COUNT,
  cropping_system: CROPPING_SYSTEM_RULE_COUNT,
  risk_safety: RISK_SAFETY_RULE_COUNT,
};

console.log(`✅ Canonical Rules loaded: ${CANONICAL_RULE_COUNT} rules across 13 groups`);
console.log(`   📊 Groups:`, JSON.stringify(CANONICAL_GROUP_COUNTS));
