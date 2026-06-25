/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAGE KNOWLEDGE CACHE — Phase E SSOT
 * ═══════════════════════════════════════════════════════════════════════════
 * Single runtime source for crop growth-stage data. Loads:
 *   - public.crop_stage_master    (DAS → stage_code, stage_category)
 *   - public.crop_stage_knowledge (per-stage agronomic knowledge)
 *
 * Replaces the hardcoded SEEDLING/VEGETATIVE/REPRODUCTIVE/MATURITY lists in
 * utils/stage-normalizer.ts. Those lists now act as a last-resort fallback
 * only when the DB rows are missing for a given crop.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface StageMasterRow {
  crop_code: string;
  stage_code: string;
  stage_category?: string | null;
  das_start?: number | null;
  das_end?: number | null;
  display_name?: string | null;
}

export interface StageKnowledgeRow {
  crop_code: string;
  stage_code: string;
  action_codes?: string[] | null;
  risk_codes?: string[] | null;
  [k: string]: unknown;
}

interface Cache {
  loadedAt: number;
  master: StageMasterRow[];
  knowledge: StageKnowledgeRow[];
  byCropStage: Map<string, StageMasterRow>; // `${crop}|${stage}` → row
  knowledgeByCropStage: Map<string, StageKnowledgeRow>;
}

let cache: Cache | null = null;
const TTL_MS = 10 * 60 * 1000;

function k(crop: string, stage: string) {
  return `${(crop || '').toLowerCase()}|${(stage || '').toLowerCase()}`;
}

export async function loadStageKnowledge(supabase: any): Promise<void> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return;

  const master: StageMasterRow[] = [];
  const knowledge: StageKnowledgeRow[] = [];

  try {
    const { data, error } = await supabase
      .from('crop_stage_master')
      .select('crop_code, stage_code, stage_category, das_start, das_end, display_name')
      .limit(5000);
    if (!error && Array.isArray(data)) master.push(...data);
  } catch (e) {
    console.warn('[STAGE_KNOWLEDGE] crop_stage_master load failed', e);
  }

  try {
    const { data, error } = await supabase
      .from('crop_stage_knowledge')
      .select('*')
      .limit(5000);
    if (!error && Array.isArray(data)) knowledge.push(...data);
  } catch (e) {
    console.warn('[STAGE_KNOWLEDGE] crop_stage_knowledge load failed', e);
  }

  const byCropStage = new Map<string, StageMasterRow>();
  for (const r of master) byCropStage.set(k(r.crop_code, r.stage_code), r);

  const knowledgeByCropStage = new Map<string, StageKnowledgeRow>();
  for (const r of knowledge) knowledgeByCropStage.set(k(r.crop_code, r.stage_code), r);

  cache = { loadedAt: now, master, knowledge, byCropStage, knowledgeByCropStage };
  console.log(
    `[STAGE_KNOWLEDGE] loaded master=${master.length} knowledge=${knowledge.length}`
  );
}

export function getStageRow(crop: string, stage: string): StageMasterRow | null {
  if (!cache) return null;
  return cache.byCropStage.get(k(crop, stage)) ?? null;
}

export function getStageKnowledge(crop: string, stage: string): StageKnowledgeRow | null {
  if (!cache) return null;
  return cache.knowledgeByCropStage.get(k(crop, stage)) ?? null;
}

/** DB-first stage category lookup. Returns null when DB has no row. */
export function getStageCategoryFromDB(
  crop: string,
  stage: string
): string | null {
  const row = getStageRow(crop, stage);
  return row?.stage_category ? row.stage_category.toUpperCase() : null;
}

/** DB-first DAS → stage lookup. */
export function getStageByDAS(crop: string, das: number): StageMasterRow | null {
  if (!cache) return null;
  const cropKey = (crop || '').toLowerCase();
  for (const r of cache.master) {
    if (r.crop_code?.toLowerCase() !== cropKey) continue;
    if ((r.das_start ?? -Infinity) <= das && (r.das_end ?? Infinity) >= das) {
      return r;
    }
  }
  return null;
}

export function isStageKnowledgeLoaded(): boolean {
  return !!cache && cache.master.length > 0;
}
