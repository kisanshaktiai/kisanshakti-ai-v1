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
  'germination', 'seedling', 'establishment', 'sprouting', 'emergence',
  'planting', 'sowing', 'transplanting', 'post_planting', 'pre_sowing',
  'early_growth', 'd0_7', 'd8_15', 'd16_30'
];

const VEGETATIVE_STAGES = [
  'vegetative', 'tillering', 'early_tillering', 'grand_growth', 'cane_formation',
  'rosette', 'leaf_development', 'stem_elongation', 'canopy', 
  'post_irrigation', 'd31_60', 'd61_90'
];

const REPRODUCTIVE_STAGES = [
  'flowering', 'fruiting', 'grain_filling', 'pod_formation', 'boll_formation',
  'boll_development', 'boll_opening', 'heading', 'booting', 'ear_emergence',
  'squaring', 'd91_120'
];

const MATURITY_STAGES = [
  'maturity', 'ripening', 'harvest', 'pre_harvest', 'drying', 'senescence',
  'post_harvest', 'ratoon', 'ratoon_init', 'early_ratoon',
  'd121_180', 'd180_plus'
];

// ═══════════════════════════════════════════════════════════════════════════
// STAGE TO DB FORMAT MAPPING
// Converts UI/frontend stage names to database-compatible format
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_DB_MAP: Record<string, string> = {
  // Seedling variants
  'seedling': 'germination',
  'sprouting': 'germination',
  'emergence': 'germination',
  'planting': 'planting',
  'sowing': 'germination',
  'transplanting': 'germination',
  'post_planting': 'planting',
  'pre_sowing': 'pre_sowing',
  
  // Vegetative variants  
  'vegetative': 'tillering',
  'tillering': 'tillering',
  'early_tillering': 'tillering',
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
  
  // Maturity variants
  'maturation': 'maturity',
  'maturity': 'maturity',
  'ripening': 'maturity',
  'pre_harvest': 'maturity',
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
/**
 * DB-first stage category resolution. When `crop` is provided and
 * crop_stage_master has a row for (crop, stage), the DB stage_category wins.
 * Otherwise falls back to the static SEEDLING/VEGETATIVE/REPRODUCTIVE/MATURITY
 * lists below (kept ONLY as a last-resort fallback — see
 * utils/stage-knowledge-cache.ts for the runtime SSOT).
 */
export function getStageCategory(
  stage: string | undefined | null,
  crop?: string | null,
): StageCategory {
  if (!stage) return 'UNKNOWN';

  // 1) DB-first when both crop+stage are known.
  if (crop) {
    try {
      // Lazy require to avoid a hard dep cycle with the cache module.
      // The cache is populated by orchestrator pre-load at request start.
      // deno-lint-ignore no-explicit-any
      const cache = (globalThis as any).__stageKnowledgeCacheRef;
      if (cache && typeof cache.getStageCategoryFromDB === 'function') {
        const cat = cache.getStageCategoryFromDB(crop, stage);
        if (cat) return cat as StageCategory;
      }
    } catch { /* fall through to static map */ }
  }

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
    variants.add('seedling');
    variants.add('establishment');
    variants.add('planting');
    variants.add('early_growth');
  } else if (category === 'VEGETATIVE') {
    variants.add('vegetative');
    variants.add('tillering');
    variants.add('early_tillering');
    variants.add('grand_growth');
    variants.add('cane_formation');
  } else if (category === 'REPRODUCTIVE') {
    variants.add('flowering');
    variants.add('reproductive');
    variants.add('squaring');
    variants.add('boll_development');
  } else if (category === 'MATURITY') {
    variants.add('maturity');
    variants.add('harvest');
    variants.add('pre_harvest');
    variants.add('ratoon');
    variants.add('post_harvest');
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

