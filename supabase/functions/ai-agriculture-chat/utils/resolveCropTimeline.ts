/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESOLVE CROP TIMELINE — SSOT for DAS, growth_stage, expected harvest
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Source-of-truth chain (DB-driven, no hardcoded agronomy):
 *   • sowing_date     ← crop_schedules (is_active=true, latest sowing_date)
 *   • maturity_days   ← master_products.maturity_days_max
 *                       → crop_baseline_guidelines_v2.das_end
 *                       → 120 (final fallback)
 *   • growth_stage    ← crop_stage_master via DAS range
 *
 * NEVER invent a stage from a code-side table. If crop_stage_master has no
 * row for the crop, return growth_stage='UNKNOWN' so the caller can flag
 * the missing-data condition.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import { resolveStageFromMaster } from './crop-stage-master-cache.ts';

export interface CropTimeline {
  crop_code: string | null;
  crop_name: string | null;
  variety_id: string | null;
  sowing_date: string | null; // YYYY-MM-DD
  days_since_sowing: number | null;
  growth_stage: string; // canonical upper, or 'UNKNOWN'
  maturity_days: number | null;
  expected_harvest_date: string | null;
  maturity_source: 'variety' | 'baseline' | 'fallback' | 'none';
  stage_source: 'crop_stage_master' | 'fallback';
  schedule_source: 'crop_schedules' | 'none';
}

const FALLBACK_MATURITY = 120;

function dayDiffUtc(fromIso: string, todayIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(todayIso + 'T00:00:00Z').getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Normalise a free-form crop name to the upper-case crop_code used by
 * `decision_rules` / `crop_stage_master` / `crop_baseline_guidelines_v2`.
 * Tries crop_synonyms first (DB SSOT); falls back to a small ASCII upper-case
 * of the original string (vocabulary normalisation, not agronomy).
 */
async function normaliseCropCode(
  supabase: SupabaseClient,
  cropName: string | null,
): Promise<string | null> {
  if (!cropName) return null;
  const trimmed = cropName.trim();
  if (!trimmed) return null;
  try {
    const { data } = await supabase
      .from('crop_synonyms')
      .select('crop_code')
      .ilike('synonym', trimmed)
      .limit(1)
      .maybeSingle();
    if (data?.crop_code) return String(data.crop_code).toUpperCase();
  } catch (_e) {
    /* swallow — synonyms table is optional vocab cache */
  }
  // Vocabulary fallback: upper-case ASCII for English crop names.
  if (/^[a-zA-Z ]+$/.test(trimmed)) return trimmed.toUpperCase();
  return null;
}

async function resolveMaturity(
  supabase: SupabaseClient,
  varietyId: string | null,
  cropCode: string | null,
): Promise<{ days: number; source: CropTimeline['maturity_source'] }> {
  if (varietyId) {
    try {
      const { data } = await supabase
        .from('master_products')
        .select('maturity_days_max')
        .eq('id', varietyId)
        .maybeSingle();
      const v = Number(data?.maturity_days_max);
      if (Number.isFinite(v) && v > 0) return { days: v, source: 'variety' };
    } catch (_e) { /* fall through */ }
  }
  if (cropCode) {
    try {
      const { data } = await supabase
        .from('crop_baseline_guidelines_v2')
        .select('das_end')
        .eq('crop_code', cropCode)
        .order('das_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      const v = Number(data?.das_end);
      if (Number.isFinite(v) && v > 0) return { days: v, source: 'baseline' };
    } catch (_e) { /* fall through */ }
  }
  return { days: FALLBACK_MATURITY, source: 'fallback' };
}

/**
 * Resolve full crop timeline for a land. Memoised per-request on scope.turnCache.
 */
export async function resolveCropTimeline(args: {
  landId: string | null | undefined;
  supabase: SupabaseClient;
  scope?: { turnCache?: Map<string, unknown> } | undefined;
}): Promise<CropTimeline> {
  const empty: CropTimeline = {
    crop_code: null,
    crop_name: null,
    variety_id: null,
    sowing_date: null,
    days_since_sowing: null,
    growth_stage: 'UNKNOWN',
    maturity_days: null,
    expected_harvest_date: null,
    maturity_source: 'none',
    stage_source: 'fallback',
    schedule_source: 'none',
  };

  if (!args.landId) return empty;

  const cacheKey = `cropTimeline:${args.landId}`;
  const cache = args.scope?.turnCache;
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey) as CropTimeline;

  try {
    const { data: schedRow } = await args.supabase
      .from('crop_schedules')
      .select('crop_name, crop_variety, sowing_date')
      .eq('land_id', args.landId)
      .eq('is_active', true)
      .order('sowing_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!schedRow?.sowing_date || !schedRow?.crop_name) {
      if (cache) cache.set(cacheKey, empty);
      return empty;
    }

    // Resolve variety_id by joining lands.variety_id (preferred) — cheap separate query.
    let varietyId: string | null = null;
    try {
      const { data: landRow } = await args.supabase
        .from('lands')
        .select('variety_id')
        .eq('id', args.landId)
        .maybeSingle();
      varietyId = (landRow as any)?.variety_id ?? null;
    } catch (_e) { /* optional */ }

    const cropCode = await normaliseCropCode(args.supabase, schedRow.crop_name);
    const sowingDate = String(schedRow.sowing_date).slice(0, 10);
    const days = dayDiffUtc(sowingDate, todayIsoUtc());

    const { days: maturityDays, source: maturitySource } = await resolveMaturity(
      args.supabase,
      varietyId,
      cropCode,
    );

    let stage = 'UNKNOWN';
    let stageSource: CropTimeline['stage_source'] = 'fallback';
    if (cropCode) {
      const sm = await resolveStageFromMaster(args.supabase, cropCode, days);
      if (sm) {
        stage = sm.stage;
        stageSource = sm.source;
      }
    }

    let expectedHarvest: string | null = null;
    if (maturityDays > 0) {
      const sow = new Date(sowingDate + 'T00:00:00Z');
      expectedHarvest = new Date(sow.getTime() + maturityDays * 86400000).toISOString().slice(0, 10);
    }

    const out: CropTimeline = {
      crop_code: cropCode,
      crop_name: String(schedRow.crop_name),
      variety_id: varietyId,
      sowing_date: sowingDate,
      days_since_sowing: days,
      growth_stage: stage,
      maturity_days: maturityDays,
      expected_harvest_date: expectedHarvest,
      maturity_source: maturitySource,
      stage_source: stageSource,
      schedule_source: 'crop_schedules',
    };
    if (cache) cache.set(cacheKey, out);
    return out;
  } catch (e) {
    console.warn(`[resolveCropTimeline] failed: ${(e as Error).message}`);
    return empty;
  }
}
