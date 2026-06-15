/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP-STAGE-MASTER CACHE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SSOT for resolving (crop_code, days-after-sowing) → growth_stage.
 *
 * Source: public.crop_stage_master
 *   crop_code | growth_stage | das_min | das_max
 *
 * RULE: agronomic stage windows MUST come from the database. Never hardcode.
 * If the table has no rows for a crop, callers receive `null` (NOT a guess)
 * and must surface the missing-data condition explicitly.
 *
 * Cached for the lifetime of the warm isolate (~5 min TTL); refreshed lazily.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface CropStageWindow {
  growth_stage: string;
  das_min: number;
  das_max: number;
}

type CacheValue = {
  byCrop: Map<string, CropStageWindow[]>;
  expiresAt: number;
};

let cache: CacheValue | null = null;
const TTL_MS = 5 * 60 * 1000;
let warnedMissing: Set<string> = new Set();

async function loadCache(supabase: SupabaseClient): Promise<CacheValue> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  const byCrop = new Map<string, CropStageWindow[]>();
  // Paginate defensively (PostgREST 1000-row cap).
  const PAGE = 1000;
  for (let page = 0; page < 5; page++) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from('crop_stage_master')
      .select('crop_code, growth_stage, das_min, das_max')
      .order('crop_code', { ascending: true })
      .order('das_min', { ascending: true })
      .range(from, to);
    if (error) {
      console.warn(`[CropStageMaster] DB error: ${error.message}`);
      break;
    }
    const rows = data || [];
    for (const r of rows) {
      const code = String(r.crop_code || '').toUpperCase();
      if (!code) continue;
      const list = byCrop.get(code) || [];
      list.push({
        growth_stage: String(r.growth_stage || '').toUpperCase(),
        das_min: Number(r.das_min ?? 0),
        das_max: Number(r.das_max ?? 0),
      });
      byCrop.set(code, list);
    }
    if (rows.length < PAGE) break;
  }
  cache = { byCrop, expiresAt: now + TTL_MS };
  console.log(`✅ [CropStageMaster] Cached stage windows for ${byCrop.size} crops`);
  return cache;
}

/**
 * Resolve growth_stage for a crop_code + days-since-sowing using DB SSOT.
 * Returns null when the crop has no rows in crop_stage_master (caller must
 * surface UNKNOWN — never invent a stage from code).
 */
export async function resolveStageFromMaster(
  supabase: SupabaseClient,
  cropCode: string,
  daysSinceSowing: number,
): Promise<{ stage: string; source: 'crop_stage_master' } | null> {
  if (!cropCode) return null;
  const c = await loadCache(supabase);
  const code = cropCode.toUpperCase();
  const rows = c.byCrop.get(code);
  if (!rows || rows.length === 0) {
    if (!warnedMissing.has(code)) {
      warnedMissing.add(code);
      console.warn(`⚠️ [CropStageMaster] No rows for crop_code=${code} — stage will be UNKNOWN until seeded`);
    }
    return null;
  }
  // Pick the window covering DAS.
  const match = rows.find((r) => daysSinceSowing >= r.das_min && daysSinceSowing <= r.das_max);
  if (match) return { stage: match.growth_stage, source: 'crop_stage_master' };
  // Past the last window — return the row with the largest das_max (HARVEST/POST_HARVEST).
  const last = [...rows].sort((a, b) => b.das_max - a.das_max)[0];
  return { stage: last.growth_stage, source: 'crop_stage_master' };
}

export async function getStageWindowsForCrop(
  supabase: SupabaseClient,
  cropCode: string,
): Promise<CropStageWindow[]> {
  const c = await loadCache(supabase);
  return c.byCrop.get(cropCode.toUpperCase()) || [];
}
