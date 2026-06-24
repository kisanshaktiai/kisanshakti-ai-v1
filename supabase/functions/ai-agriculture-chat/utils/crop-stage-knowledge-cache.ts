/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP-STAGE-KNOWLEDGE CACHE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SSOT for stage-specific agronomic advisory fallback content (water,
 * fertilizer, pest/disease watch-lists, critical/avoid actions, NDVI bands).
 *
 * Source: public.crop_stage_knowledge
 *   crop_code | growth_stage | aliases | water | fertilizer | pest_watch |
 *   disease_watch | critical_actions | avoid_actions | ndvi_min | ndvi_max |
 *   yield_impact_if_stressed
 *
 * RULE: agronomic advisory content MUST come from the database. Never
 * hardcode. If the table has no row for a crop/stage, callers receive
 * `null` and must surface the missing-data condition explicitly.
 *
 * Cached for the lifetime of the warm isolate (~5 min TTL); refreshed lazily.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface StageAdvice {
  water: string;
  fertilizer: string;
  pest_watch: string[];
  disease_watch: string[];
  critical_actions: string[];
  avoid_actions: string[];
  expected_ndvi_range: { min: number; max: number };
  yield_impact_if_stressed: string;
}

interface StageKnowledgeRow {
  growth_stage: string;
  aliases: string[];
  advice: StageAdvice;
}

type CacheValue = {
  byCrop: Map<string, StageKnowledgeRow[]>;
  expiresAt: number;
};

let cache: CacheValue | null = null;
const TTL_MS = 5 * 60 * 1000;
let warnedMissing: Set<string> = new Set();

async function loadCache(supabase: SupabaseClient): Promise<CacheValue> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache;

  const byCrop = new Map<string, StageKnowledgeRow[]>();
  const PAGE = 1000;
  for (let page = 0; page < 5; page++) {
    const from = page * PAGE;
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from('crop_stage_knowledge')
      .select('crop_code, growth_stage, aliases, water, fertilizer, pest_watch, disease_watch, critical_actions, avoid_actions, ndvi_min, ndvi_max, yield_impact_if_stressed')
      .order('crop_code', { ascending: true })
      .range(from, to);
    if (error) {
      console.warn(`[CropStageKnowledge] DB error: ${error.message}`);
      break;
    }
    const rows = data || [];
    for (const r of rows) {
      const code = String(r.crop_code || '').toUpperCase();
      if (!code) continue;
      const list = byCrop.get(code) || [];
      list.push({
        growth_stage: String(r.growth_stage || '').toUpperCase(),
        aliases: (r.aliases || []).map((a: string) => String(a).toUpperCase()),
        advice: {
          water: r.water,
          fertilizer: r.fertilizer,
          pest_watch: r.pest_watch || [],
          disease_watch: r.disease_watch || [],
          critical_actions: r.critical_actions || [],
          avoid_actions: r.avoid_actions || [],
          expected_ndvi_range: { min: Number(r.ndvi_min ?? 0), max: Number(r.ndvi_max ?? 0) },
          yield_impact_if_stressed: r.yield_impact_if_stressed || '',
        },
      });
      byCrop.set(code, list);
    }
    if (rows.length < PAGE) break;
  }
  cache = { byCrop, expiresAt: now + TTL_MS };
  console.log(`✅ [CropStageKnowledge] Cached advisory rows for ${byCrop.size} crops`);
  return cache;
}

/**
 * Resolve stage-specific advisory content for a crop_code + growth_stage
 * (or one of its DB-documented aliases) from the DB SSOT.
 */
export async function getStageSpecificAdvice(
  supabase: SupabaseClient,
  cropCode: string,
  stage: string,
): Promise<StageAdvice | null> {
  const c = await loadCache(supabase);
  const cropU = (cropCode || '').toUpperCase();
  const rows = c.byCrop.get(cropU);
  if (!rows || rows.length === 0) {
    if (!warnedMissing.has(cropU)) {
      warnedMissing.add(cropU);
      console.warn(`⚠️ [CropStageKnowledge] No rows for crop_code=${cropU} — advisory will be missing until seeded`);
    }
    return null;
  }

  const stageU = (stage || '').toUpperCase();
  const direct = rows.find((r) => r.growth_stage === stageU);
  const matched = direct || rows.find((r) => r.aliases.includes(stageU));
  if (!matched) {
    console.log(`[CropStageKnowledge] No advice for stage: ${stage} in crop: ${cropCode}`);
    return null;
  }

  return matched.advice;
}

export async function getAvailableCropAdvisors(supabase: SupabaseClient): Promise<string[]> {
  const c = await loadCache(supabase);
  return Array.from(c.byCrop.keys());
}
