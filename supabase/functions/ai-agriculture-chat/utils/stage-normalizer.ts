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

// FIX (2026-07-08): Removed agronomically wrong lumping of transplanting/
// planting/sowing/post_planting/pre_sowing into SEEDLING_STAGES. Transplanting
// means seedlings ALREADY germinated and were moved to field — biologically
// post-germination, adjacent to VEGETATIVE. Previous mapping caused
// RICE_GERMINATION_FAILURE to score stage_relevance=0.7 at stage=transplanting
// DAS=29 and win as INVARIANT_FALLBACK with "monitor only" advice.
const SEEDLING_STAGES = [
  'germination', 'seedling', 'establishment', 'sprouting', 'emergence',
  'early_growth', 'd0_7', 'd8_15', 'd16_30'
];

// Pre-establishment stages — NEITHER germination NOR vegetative.
const PRE_SOWING_STAGES = ['pre_sowing', 'sowing', 'planting', 'post_planting'];

const VEGETATIVE_STAGES = [
  'vegetative', 'transplanting', 'tillering', 'early_tillering', 'grand_growth',
  'cane_formation', 'rosette', 'leaf_development', 'stem_elongation', 'canopy',
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
  // Seedling / germination variants (true germination window only)
  'seedling': 'germination',
  'sprouting': 'germination',
  'emergence': 'germination',
  'germination': 'germination',
  'establishment': 'germination',
  'early_growth': 'germination',

  // Pre-establishment (self-mapping — do NOT collapse into germination)
  'pre_sowing': 'pre_sowing',
  'sowing': 'sowing',
  'planting': 'planting',
  'post_planting': 'post_planting',

  // Transplanting (rice/tobacco/tomato) — post-germination, self-mapping.
  // Belongs to VEGETATIVE category per crop_stage_graph TRANSPLANTING→TILLERING.
  'transplanting': 'transplanting',

  // Vegetative variants
  'vegetative': 'tillering',
  'tillering': 'tillering',
  'early_tillering': 'tillering',
  'leaf_development': 'tillering',
  'stem_elongation': 'tillering',

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

  // Ratoon (sugarcane specific)
  'ratoon': 'ratoon',
  'ratoon_init': 'ratoon',
  'early_ratoon': 'ratoon',
  'post_irrigation': 'tillering',
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

  // 1) DB-first when both crop+stage are known. SINGLE provenance emit.
  if (crop) {
    try {
      // deno-lint-ignore no-explicit-any
      const cache = (globalThis as any).__stageKnowledgeCacheRef;
      if (cache && typeof cache.getStageCategoryFromDB === 'function') {
        const cat = cache.getStageCategoryFromDB(crop, stage);
        if (cat) {
          console.log(`[STAGE_SSOT] source=crop_stage_master result=HIT crop=${crop} stage=${stage} category=${cat}`);
          return cat as StageCategory;
        }
      }
    } catch { /* fall through to static map */ }
  }

  const normalizedStage = stage.toLowerCase().trim().replace(/[\s-]+/g, '_');

  let resolved: StageCategory = 'UNKNOWN';
  if (SEEDLING_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    resolved = 'SEEDLING';
  } else if (VEGETATIVE_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    resolved = 'VEGETATIVE';
  } else if (REPRODUCTIVE_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    resolved = 'REPRODUCTIVE';
  } else if (MATURITY_STAGES.some(s => normalizedStage.includes(s) || s.includes(normalizedStage))) {
    resolved = 'MATURITY';
  }
  console.log(`[STAGE_SSOT] source=crop_stage_master result=MISS fallback=static_lists crop=${crop ?? 'null'} stage=${stage} category=${resolved}`);
  return resolved;
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

