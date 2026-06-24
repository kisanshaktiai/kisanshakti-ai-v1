/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE-9: CROSS-CROP SYMPTOM ONTOLOGY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Define canonical observation-only symptom keys that work across ALL crops.
 * These are PURE OBSERVATIONS - no crop names, pest names, disease names.
 * 
 * PRINCIPLES:
 * ❌ No crop names
 * ❌ No pest names
 * ❌ No disease names
 * ❌ No nutrients
 * ✅ Observation only
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CROSS_CROP_SYMPTOM_ONTOLOGY_VERSION = '3.0.0'; // Phase-15: Weed observation keys

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CROP SYMPTOM KEYS
// Pure observation codes that work uniformly across all crops
// ═══════════════════════════════════════════════════════════════════════════

export enum CrossCropSymptomKey {
  // ═══════════════════════════════════════════════════════════════════════════
  // LEAF SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  LEAF_YELLOWING = 'LEAF_YELLOWING',
  LEAF_DRYING = 'LEAF_DRYING',
  LEAF_SPOTS = 'LEAF_SPOTS',
  LEAF_HOLES = 'LEAF_HOLES',
  LEAF_CURLING = 'LEAF_CURLING',
  LEAF_WILTING = 'LEAF_WILTING',
  LEAF_BROWNING = 'LEAF_BROWNING',
  LEAF_EDGES_BURN = 'LEAF_EDGES_BURN',
  LEAF_DROPPING = 'LEAF_DROPPING',
  LEAF_STICKY = 'LEAF_STICKY',
  LEAF_POWDER_COATING = 'LEAF_POWDER_COATING',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEM SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  STEM_WEAKENING = 'STEM_WEAKENING',
  STEM_BREAKAGE = 'STEM_BREAKAGE',
  STEM_DISCOLORATION = 'STEM_DISCOLORATION',
  STEM_HOLES = 'STEM_HOLES',
  STEM_SWELLING = 'STEM_SWELLING',
  STEM_FRASS_VISIBLE = 'STEM_FRASS_VISIBLE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROOT SYMPTOMS
  // ═══════════════════════════════════════════════════════════════════════════
  ROOT_DAMAGE_VISIBLE = 'ROOT_DAMAGE_VISIBLE',
  ROOT_ROTTING = 'ROOT_ROTTING',
  ROOT_WEAK = 'ROOT_WEAK',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECT OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  SMALL_INSECTS_VISIBLE = 'SMALL_INSECTS_VISIBLE',
  LARGE_INSECTS_VISIBLE = 'LARGE_INSECTS_VISIBLE',
  FLYING_INSECTS_VISIBLE = 'FLYING_INSECTS_VISIBLE',
  CRAWLING_INSECTS_VISIBLE = 'CRAWLING_INSECTS_VISIBLE',
  LARVAE_VISIBLE = 'LARVAE_VISIBLE',
  EGGS_VISIBLE = 'EGGS_VISIBLE',
  WEBBING_VISIBLE = 'WEBBING_VISIBLE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-11: INSECT DENSITY OBSERVATIONS (few vs many)
  // Agronomically relevant first-order classification
  // ═══════════════════════════════════════════════════════════════════════════
  INSECT_DENSITY_FEW = 'INSECT_DENSITY_FEW',
  INSECT_DENSITY_MANY = 'INSECT_DENSITY_MANY',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-11: PLANT RESPONSE TO INSECTS (visible damage indicators)
  // These are observed plant reactions when insects are present
  // ═══════════════════════════════════════════════════════════════════════════
  PLANT_RESPONSE_CURLING = 'PLANT_RESPONSE_CURLING',
  PLANT_RESPONSE_YELLOWING = 'PLANT_RESPONSE_YELLOWING',
  PLANT_RESPONSE_STICKY = 'PLANT_RESPONSE_STICKY',
  PLANT_RESPONSE_HOLES = 'PLANT_RESPONSE_HOLES',
  PLANT_RESPONSE_NONE = 'PLANT_RESPONSE_NONE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GROWTH ABNORMALITIES
  // ═══════════════════════════════════════════════════════════════════════════
  STUNTED_GROWTH = 'STUNTED_GROWTH',
  PATCHY_GROWTH = 'PATCHY_GROWTH',
  UNEVEN_HEIGHT = 'UNEVEN_HEIGHT',
  DELAYED_FLOWERING = 'DELAYED_FLOWERING',
  POOR_FRUIT_SET = 'POOR_FRUIT_SET',
  ABNORMAL_SHAPE = 'ABNORMAL_SHAPE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTION PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════
  AFFECTED_PATCHES = 'AFFECTED_PATCHES',
  AFFECTED_EDGES = 'AFFECTED_EDGES',
  UNIFORM_DAMAGE = 'UNIFORM_DAMAGE',
  SPREADING_PATTERN = 'SPREADING_PATTERN',
  RANDOM_DISTRIBUTION = 'RANDOM_DISTRIBUTION',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL PLANT CONDITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  OVERALL_WEAK = 'OVERALL_WEAK',
  COLOR_ABNORMAL = 'COLOR_ABNORMAL',
  HONEYDEW_PRESENT = 'HONEYDEW_PRESENT',
  SOOTY_MOLD_VISIBLE = 'SOOTY_MOLD_VISIBLE',
  FRUIT_DAMAGE = 'FRUIT_DAMAGE',
  FLOWER_DAMAGE = 'FLOWER_DAMAGE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-14: PLANT DEATH / STAND FAILURE (Critical for diagnosis mode)
  // ═══════════════════════════════════════════════════════════════════════════
  PLANT_DEATH = 'PLANT_DEATH',
  SEEDLING_DEATH = 'SEEDLING_DEATH',
  GERMINATION_FAILURE = 'GERMINATION_FAILURE',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE-15: WEED OBSERVATIONS
  // Pure field observations of weed presence, density, and type
  // ═══════════════════════════════════════════════════════════════════════════
  WEED_PRESENT = 'WEED_PRESENT',
  WEED_HEAVY = 'WEED_HEAVY',
  WEED_ABOVE_CROP = 'WEED_ABOVE_CROP',
  WEED_IN_ROWS = 'WEED_IN_ROWS',
  WEED_INFESTATION = 'WEED_INFESTATION',
  GRASS_WEEDS = 'GRASS_WEEDS',
  BROADLEAF_WEEDS = 'BROADLEAF_WEEDS'
}

// ═══════════════════════════════════════════════════════════════════════════
// SYMPTOM CATEGORIES (For UI grouping, NOT for diagnosis)
// ═══════════════════════════════════════════════════════════════════════════

export type SymptomCategory = 
  | 'LEAF'
  | 'STEM'
  | 'ROOT'
  | 'INSECT'
  | 'GROWTH'
  | 'DISTRIBUTION'
  | 'WEED'
  | 'GENERAL';

export function getSymptomCategory(symptom: CrossCropSymptomKey): SymptomCategory {
  if (symptom.startsWith('LEAF_')) return 'LEAF';
  if (symptom.startsWith('STEM_')) return 'STEM';
  if (symptom.startsWith('ROOT_')) return 'ROOT';
  if (symptom.startsWith('WEED_') || symptom === CrossCropSymptomKey.GRASS_WEEDS || 
      symptom === CrossCropSymptomKey.BROADLEAF_WEEDS) return 'WEED';
  if (symptom.includes('INSECTS') || symptom.includes('LARVAE') || 
      symptom.includes('EGGS') || symptom.includes('WEBBING')) return 'INSECT';
  if (symptom.includes('GROWTH') || symptom.includes('FLOWERING') || 
      symptom.includes('FRUIT_SET') || symptom.includes('SHAPE') ||
      symptom.includes('HEIGHT')) return 'GROWTH';
  if (symptom.includes('AFFECTED') || symptom.includes('UNIFORM') || 
      symptom.includes('SPREADING') || symptom.includes('DISTRIBUTION') ||
      symptom.includes('PATCHES')) return 'DISTRIBUTION';
  return 'GENERAL';
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize cross-crop symptoms to array for storage/logging
 */
export function serializeCrossCropSymptoms(symptoms: Set<CrossCropSymptomKey>): string[] {
  return Array.from(symptoms);
}

/**
 * Deserialize array back to Set
 */
export function deserializeCrossCropSymptoms(symptomArray: string[]): Set<CrossCropSymptomKey> {
  return new Set(symptomArray as CrossCropSymptomKey[]);
}

/**
 * Get all symptoms in a category
 */
export function getSymptomsInCategory(category: SymptomCategory): CrossCropSymptomKey[] {
  return Object.values(CrossCropSymptomKey).filter(s => getSymptomCategory(s) === category);
}

export default {
  CrossCropSymptomKey,
  getSymptomCategory,
  serializeCrossCropSymptoms,
  deserializeCrossCropSymptoms,
  getSymptomsInCategory,
  CROSS_CROP_SYMPTOM_ONTOLOGY_VERSION
};
