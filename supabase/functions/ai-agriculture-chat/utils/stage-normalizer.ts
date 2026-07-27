/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED STAGE NORMALIZER (v2.0.0 — DB stage graph is the only authority)
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
 * - Stage category / adjacency / compatibility come ONLY from
 *   crop_stage_master + crop_stage_graph (cultivation_method aware)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { stageFamily, stagesEquivalent } from '../runtime/stage-family-shim.ts';

export const STAGE_NORMALIZER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// STAGE CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type StageCategory = 'SEEDLING' | 'VEGETATIVE' | 'REPRODUCTIVE' | 'MATURITY' | 'UNKNOWN';

// NOTE (2026-07-27): the hardcoded SEEDLING/PRE_SOWING/VEGETATIVE/REPRODUCTIVE/
// MATURITY stage lists were DELETED. They duplicated `public.crop_stage_graph`
// and merged direct-seeded and transplanted timelines into one path. Stage
// category, adjacency and compatibility now come EXCLUSIVELY from the DB via
// utils/stage-knowledge-cache.ts + runtime/stage-family-shim.ts.

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
 * DB-only stage category resolution (SSOT: crop_stage_master, scoped to the
 * active cultivation lane). Returns UNKNOWN when crop is missing or the DB has
 * no row — never synthesizes a category from stage-name heuristics.
 */
export function getStageCategory(
  stage: string | undefined | null,
  crop?: string | null,
): StageCategory {
  if (!stage || !crop) return 'UNKNOWN';
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
  } catch { /* fall through */ }
  console.log(`[STAGE_SSOT] source=crop_stage_master result=MISS crop=${crop ?? 'null'} stage=${stage} category=UNKNOWN`);
  return 'UNKNOWN';
}

/**
 * Get all stage variants for a DB query against `stage_applicable`.
 * SSOT: `public.crop_stage_graph` (via the stage-family shim). No hardcoded
 * category expansion — only the canonical stage, its DB-curated family for the
 * ACTIVE cultivation lane, and the universal wildcards.
 */
export function getStageQueryVariants(
  stage: string | undefined | null,
  crop?: string | null,
): string[] {
  if (!stage) return ['all', '*'];

  const dbStage = normalizeStageForDB(stage);
  const variants = new Set<string>([
    dbStage,
    dbStage.toLowerCase(),
    dbStage.toUpperCase(),
    'all',
    '*',
  ]);

  for (const s of stageFamily(dbStage, crop ?? null)) {
    variants.add(s);
    variants.add(s.toUpperCase());
  }

  return Array.from(variants);
}

/**
 * Check if two stages are compatible. Wildcards always pass; otherwise the DB
 * stage graph decides (exact stage or same curated family in the active lane).
 */
export function areStagesCompatible(
  ruleStage: string | undefined | null,
  currentStage: string | undefined | null,
  crop?: string | null,
): boolean {
  if (!ruleStage || ruleStage === '*' || ruleStage.toLowerCase() === 'all') return true;
  if (!currentStage) return false;

  const a = normalizeStageForDB(ruleStage);
  const b = normalizeStageForDB(currentStage);
  if (a === b) return true;
  return stagesEquivalent(a, b, crop ?? null);
}

/**
 * Stage relevance score (0-1) for rule ranking.
 *   1.0 exact stage · 0.8 DB-curated family · 0.5 wildcard/universal · 0.1 else
 * No substring guessing, no hardcoded category buckets.
 */
export function calculateStageRelevanceScore(
  stageApplicable: string[] | null | undefined,
  currentStage: string,
  crop?: string | null,
): number {
  if (!stageApplicable || !Array.isArray(stageApplicable) || stageApplicable.length === 0) {
    return 0.5; // Universal rules get base score
  }

  const current = normalizeStageForDB(currentStage).toLowerCase();

  if (stageApplicable.some((s) => normalizeStageForDB(s).toLowerCase() === current)) {
    return 1.0;
  }

  if (
    stageApplicable.some((s) =>
      stagesEquivalent(normalizeStageForDB(s).toLowerCase(), current, crop ?? null)
    )
  ) {
    return 0.8;
  }

  if (stageApplicable.some((s) => {
    const lower = String(s || '').toLowerCase();
    return lower === '*' || lower === 'all';
  })) {
    return 0.5;
  }

  return 0.1;
}
