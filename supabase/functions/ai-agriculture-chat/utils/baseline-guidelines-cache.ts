/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP BASELINE GUIDELINES CACHE v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In-memory cache for crop_baseline_guidelines_v2 table.
 * Provides stage-wise nutrient and irrigation data for the decision engine.
 * 
 * Performance: 10-minute TTL, keyed by crop_code.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const BASELINE_CACHE_VERSION = '1.0.0';

export interface BaselineGuideline {
  crop_code: string;
  growth_stage: string;
  das_start: number | null;
  das_end: number | null;
  nitrogen_optimal: number | null;
  phosphorus_optimal: number | null;
  potassium_optimal: number | null;
  irrigation_interval_days: number | null;
  irrigation_critical: boolean;
  key_activities: string | null;
  common_problems: string | null;
  source_reference: string | null;
}

interface GuidelineCache {
  entries: Map<string, BaselineGuideline[]>; // crop_code → guidelines[]
  loadedAt: number;
  loadingPromise?: Promise<void>;
}

let cache: GuidelineCache | null = null;
const CACHE_TTL = 600_000; // 10 minutes

/**
 * Pre-load all baseline guidelines from crop_baseline_guidelines_v2.
 * Call once during orchestrator init.
 */
export async function loadBaselineGuidelines(supabase: any): Promise<void> {
  const now = Date.now();
  
  if (cache && (now - cache.loadedAt) < CACHE_TTL) {
    return;
  }
  
  if (cache?.loadingPromise) {
    return cache.loadingPromise;
  }

  const loadPromise = (async (): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('crop_baseline_guidelines_v2')
        .select('crop_code, growth_stage, das_start, das_end, nitrogen_optimal, phosphorus_optimal, potassium_optimal, irrigation_interval_days, irrigation_critical, key_activities, common_problems, source_reference')
        .eq('is_active', true);
      
      if (error) {
        console.error(`[BASELINE] Load failed: ${error.message}`);
        return;
      }
      
      const entries = new Map<string, BaselineGuideline[]>();
      for (const row of (data || []) as BaselineGuideline[]) {
        const existing = entries.get(row.crop_code) || [];
        existing.push(row);
        entries.set(row.crop_code, existing);
      }
      
      console.log(`[BASELINE] Loaded ${(data || []).length} guidelines for ${entries.size} crops`);
      cache = { entries, loadedAt: Date.now() };
    } catch (e) {
      console.error(`[BASELINE] Cache error:`, e instanceof Error ? e.message : 'unknown');
    }
  })();
  
  if (!cache) {
    cache = { entries: new Map(), loadedAt: 0, loadingPromise: loadPromise };
  } else {
    cache.loadingPromise = loadPromise;
  }
  
  await loadPromise;
  if (cache) delete cache.loadingPromise;
}

/**
 * Get baseline guidelines for a specific crop and optional growth stage.
 * Returns all stages for the crop if no stage specified.
 */
export function getBaselineForCrop(
  cropCode: string,
  growthStage?: string
): BaselineGuideline[] {
  if (!cache) return [];
  
  const guidelines = cache.entries.get(cropCode) || [];
  
  if (!growthStage) return guidelines;
  
  return guidelines.filter(g => 
    g.growth_stage.toLowerCase() === growthStage.toLowerCase()
  );
}

/**
 * Get nutrient recommendation for a crop at a specific DAS (days after sowing).
 */
export function getBaselineByDAS(
  cropCode: string,
  das: number
): BaselineGuideline | null {
  if (!cache) return null;
  
  const guidelines = cache.entries.get(cropCode) || [];
  
  return guidelines.find(g => 
    g.das_start !== null && g.das_end !== null &&
    das >= g.das_start && das <= g.das_end
  ) || null;
}
