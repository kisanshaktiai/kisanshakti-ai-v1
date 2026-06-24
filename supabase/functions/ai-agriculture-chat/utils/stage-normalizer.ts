/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED STAGE NORMALIZER (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SINGLE SOURCE OF TRUTH for growth stage normalization across:
 * - orchestrator.ts
 * - hypothesis-evaluator.ts
 * - canonical-state-builder.ts
 * - diagnosis-first-generator.ts
 * 
 * INVARIANTS:
 * - All stage normalization MUST go through this module
 * - DB stage format: lowercase with underscores (e.g., 'germination', 'grand_growth')
 * - Stage categories: SEEDLING, VEGETATIVE, REPRODUCTIVE, MATURITY
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const STAGE_NORMALIZER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// STAGE CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type StageCategory = 'SEEDLING' | 'VEGETATIVE' | 'REPRODUCTIVE' | 'MATURITY' | 'UNKNOWN';

const SEEDLING_STAGES = [
  'germination', 'nursery', 'seedling', 'establishment', 'sprouting', 'emergence',
  'planting', 'sowing', 'transplanting', 'post_planting', 'pre_sowing',
  'early_growth', 'land_preparation', 'pre_planting', 'transplant_establishment',
  'd0_7', 'd8_15', 'd16_30'
];

const VEGETATIVE_STAGES = [
  'vegetative', 'tillering', 'early_tillering', 'grand_growth', 'cane_formation',
  'rosette', 'leaf_development', 'stem_elongation', 'canopy', 
  'post_irrigation', 'early_vegetative', 'late_vegetative', 'knee_high',
  'jointing', 'cri', 'cri_stage', 'tuber_initiation', 'bulb_initiation',
  'd31_60', 'd61_90'
];

const REPRODUCTIVE_STAGES = [
  'flowering', 'fruiting', 'grain_filling', 'pod_formation', 'boll_formation',
  'boll_development', 'boll_opening', 'heading', 'booting', 'ear_emergence',
  'squaring', 'flowering_initiation', 'fruit_setting', 'fruit_set',
  'fruit_development', 'tuber_bulking', 'bulb_development', 'tasseling',
  'silking', 'seed_fill', 'd91_120'
];

const MATURITY_STAGES = [
  'maturity', 'ripening', 'harvest', 'pre_harvest', 'drying', 'senescence',
  'post_harvest', 'ratoon', 'ratoon_init', 'early_ratoon', 'maturation_harvest',
  'first_picking', 'successive_harvest', 'red_ripe_dry', 'begin_maturity',
  'd121_180', 'd180_plus'
];

// ═══════════════════════════════════════════════════════════════════════════
// STAGE TO DB FORMAT MAPPING
// Converts UI/frontend stage names to database-compatible format
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_DB_MAP: Record<string, string> = {
  // Seedling variants
  'nursery': 'germination',
  'nursery_stage': 'germination',
  'seedling': 'germination',
  'sprouting': 'germination',
  'emergence': 'germination',
  'planting': 'planting',
  'sowing': 'germination',
  'transplanting': 'germination',
  'post_planting': 'planting',
  'pre_sowing': 'pre_sowing',
  'land_preparation': 'pre_sowing',
  'pre_planting': 'pre_sowing',
  'transplant_establishment': 'germination',
  
  // Vegetative variants  
  'vegetative': 'tillering',
  'tillering': 'tillering',
  'early_tillering': 'tillering',
  'early_vegetative': 'tillering',
  'late_vegetative': 'tillering',
  'knee_high': 'tillering',
  'jointing': 'tillering',
  'cri': 'tillering',
  'cri_stage': 'tillering',
  'tuber_initiation': 'tillering',
  'bulb_initiation': 'tillering',
  'leaf_development': 'tillering',
  'stem_elongation': 'tillering',
  'early_growth': 'germination',
  
  // Grand growth (sugarcane specific)
  'grand_growth': 'grand_growth',
  'grandgrowth': 'grand_growth',
  'grand-growth': 'grand_growth',
  'canopy': 'grand_growth',
  'cane_formation': 'grand_growth',
  
  // Reproductive variants
  'flowering': 'flowering',
  'reproductive': 'flowering',
  'fruiting': 'fruiting',
  'grain_filling': 'grain_filling',
  'pod_formation': 'pod_formation',
  'boll_formation': 'boll_formation',
  'boll_development': 'boll_formation',
  'boll_opening': 'boll_opening',
  'heading': 'heading',
  'booting': 'booting',
  'squaring': 'squaring',
  'flowering_initiation': 'flowering',
  'fruit_setting': 'fruiting',
  'fruit_set': 'fruiting',
  'fruit_development': 'fruiting',
  'tuber_bulking': 'pod_formation',
  'bulb_development': 'pod_formation',
  'tasseling': 'flowering',
  'silking': 'flowering',
  'seed_fill': 'grain_filling',
  
  // Maturity variants
  'maturation': 'maturity',
  'maturity': 'maturity',
  'ripening': 'maturity',
  'pre_harvest': 'maturity',
  'maturation_harvest': 'maturity',
  'first_picking': 'harvest',
  'successive_harvest': 'harvest',
  'red_ripe_dry': 'maturity',
  'begin_maturity': 'maturity',
  'harvesting': 'harvest',
  'harvest': 'harvest',
  'drying': 'harvest',
  'post_harvest': 'post_harvest',
  
  // Ratoon (sugarcane specific - NOT post_harvest!)
  'ratoon': 'ratoon',
  'ratoon_init': 'ratoon',
  'early_ratoon': 'ratoon',
  'post_irrigation': 'tillering',
  
  // Pass-through (already in correct format)
  'germination': 'germination',
  'establishment': 'germination',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a stage name to database-compatible format.
 * E.g., "Seedling" → "germination", "Grand Growth" → "grand_growth"
 */
export function normalizeStageForDB(stage: string | undefined | null): string {
  if (!stage) return 'unknown';
  
  // Convert to lowercase and replace spaces/hyphens with underscores
  const key = stage.toLowerCase().trim().replace(/[\s-]+/g, '_');
  
  // Look up in mapping
  return STAGE_DB_MAP[key] || key;
}

/**
 * Get the broad category for a stage.
 * Used for cross-stage rule evaluation and fallback logic.
 */
export function getStageCategory(stage: string | undefined | null): StageCategory {
  if (!stage) return 'UNKNOWN';
  
  const normalizedStage = stage.toLowerCase().trim().replace(/[\s-]+/g, '_');
  
  if (SEEDLING_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    return 'SEEDLING';
  }
  if (VEGETATIVE_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    return 'VEGETATIVE';
  }
  if (REPRODUCTIVE_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    return 'REPRODUCTIVE';
  }
  if (MATURITY_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    return 'MATURITY';
  }
  
  return 'UNKNOWN';
}

/**
 * Get all stage variants for DB query.
 * Returns array of possible stage values to match against stage_applicable column.
 */
export function getStageQueryVariants(stage: string | undefined | null): string[] {
  if (!stage) return ['all', '*'];
  
  const dbStage = normalizeStageForDB(stage);
  const category = getStageCategory(stage);
  
  const variants = new Set<string>([
    dbStage,
    dbStage.toLowerCase(),
    dbStage.toUpperCase(),
    'all',
    '*'
  ]);
  
  // Add category-based stages for broader matching
  if (category === 'SEEDLING') {
    variants.add('germination');
    variants.add('nursery');
    variants.add('seedling');
    variants.add('establishment');
    variants.add('emergence');
    variants.add('planting');
    variants.add('early_growth');
    variants.add('transplant_establishment');
    variants.add('land_preparation');
  } else if (category === 'VEGETATIVE') {
    variants.add('vegetative');
    variants.add('tillering');
    variants.add('early_tillering');
    variants.add('early_vegetative');
    variants.add('late_vegetative');
    variants.add('knee_high');
    variants.add('jointing');
    variants.add('grand_growth');
    variants.add('cane_formation');
  } else if (category === 'REPRODUCTIVE') {
    variants.add('flowering');
    variants.add('reproductive');
    variants.add('squaring');
    variants.add('boll_development');
    variants.add('fruit_setting');
    variants.add('fruit_set');
    variants.add('fruit_development');
    variants.add('tuber_bulking');
    variants.add('bulb_development');
    variants.add('tasseling');
    variants.add('silking');
  } else if (category === 'MATURITY') {
    variants.add('maturity');
    variants.add('harvest');
    variants.add('pre_harvest');
    variants.add('ratoon');
    variants.add('post_harvest');
    variants.add('first_picking');
    variants.add('successive_harvest');
  }
  
  return Array.from(variants);
}

/**
 * Check if two stages are compatible (same category or one is wildcard).
 */
export function areStagesCompatible(
  ruleStage: string | undefined | null,
  currentStage: string | undefined | null
): boolean {
  if (!ruleStage || ruleStage === '*' || ruleStage.toLowerCase() === 'all') {
    return true;
  }
  
  if (!currentStage) return false;
  
  // Exact match (normalized)
  if (normalizeStageForDB(ruleStage) === normalizeStageForDB(currentStage)) {
    return true;
  }
  
  // Same category match
  return getStageCategory(ruleStage) === getStageCategory(currentStage);
}

/**
 * Calculate stage relevance score (0-1).
 * Higher score = better match for rule evaluation.
 * CRITICAL FIX: Case-insensitive comparison to handle DB uppercase vs code lowercase
 */
export function calculateStageRelevanceScore(
  stageApplicable: string[] | null | undefined,
  currentStage: string
): number {
  if (!stageApplicable || !Array.isArray(stageApplicable) || stageApplicable.length === 0) {
    return 0.5; // Universal rules get base score
  }
  
  const normalizedCurrent = normalizeStageForDB(currentStage).toLowerCase();
  const currentCategory = getStageCategory(currentStage);
  
  // CRITICAL FIX: Case-insensitive exact match (highest score)
  if (stageApplicable.some(s => normalizeStageForDB(s).toLowerCase() === normalizedCurrent)) {
    return 1.0;
  }
  
  // Case-insensitive substring match
  if (stageApplicable.some(s => {
    const normalized = normalizeStageForDB(s).toLowerCase();
    return normalizedCurrent.includes(normalized) || normalized.includes(normalizedCurrent);
  })) {
    return 0.9;
  }
  
  // Same category match (case-insensitive)
  if (stageApplicable.some(s => getStageCategory(s) === currentCategory)) {
    return 0.7;
  }
  
  // Wildcard match (case-insensitive)
  if (stageApplicable.some(s => {
    const lower = s.toLowerCase();
    return lower === '*' || lower === 'all';
  })) {
    return 0.5;
  }
  
  // No match - low relevance
  return 0.1;
}

