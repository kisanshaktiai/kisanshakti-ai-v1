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
  growth_stage: string;
  das_min?: number | null;
  das_max?: number | null;
  stage_description?: string | null;
}

export interface StageKnowledgeRow {
  crop_code: string;
  growth_stage: string;
  critical_actions?: string[] | null;
  pest_watch?: string[] | null;
  disease_watch?: string[] | null;
  [k: string]: unknown;
}

interface StageGraphEdge {
  crop_code: string;
  from_stage: string;
  to_stage: string;
  edge_type: string;
}

interface Cache {
  loadedAt: number;
  master: StageMasterRow[];
  knowledge: StageKnowledgeRow[];
  byCropStage: Map<string, StageMasterRow>; // `${crop}|${stage}` → row
  knowledgeByCropStage: Map<string, StageKnowledgeRow>;
  // Adjacency list built from public.crop_stage_graph — SSOT for stage
  // equivalence/adjacency. Key = `${crop}|${stage}`, value = set of adjacent
  // stage codes (lowercased). Built from ALL edge types symmetrically since
  // any edge type (STAGE_PRECEDES / ENABLES / CONCURRENT_WITH / TRIGGERS)
  // marks the two stages as belonging to the same crop's phenological family
  // for the purpose of rule stage-gating.
  stageAdjacency: Map<string, Set<string>>;
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
      .select('crop_code, growth_stage, stage_description, das_min, das_max')
      .limit(5000);
    if (error) {
      console.warn('[STAGE_KNOWLEDGE] crop_stage_master select error:', error.message);
    } else if (Array.isArray(data)) {
      master.push(...data);
    }
  } catch (e) {
    console.warn('[STAGE_KNOWLEDGE] crop_stage_master load failed', e);
  }

  try {
    const { data, error } = await supabase
      .from('crop_stage_knowledge')
      .select('*')
      .limit(5000);
    if (error) {
      console.warn('[STAGE_KNOWLEDGE] crop_stage_knowledge select error:', error.message);
    } else if (Array.isArray(data)) {
      knowledge.push(...data);
    }
  } catch (e) {
    console.warn('[STAGE_KNOWLEDGE] crop_stage_knowledge load failed', e);
  }

  // ── crop_stage_graph → adjacency (SSOT for stage families) ───────────
  // Joined against crop_stage_master to resolve UUIDs → growth_stage names.
  const stageAdjacency = new Map<string, Set<string>>();
  try {
    // Build a UUID→stage_name map first from the master rows we already have.
    const idToStage = new Map<string, { crop: string; stage: string }>();
    const { data: masterFull, error: masterErr } = await supabase
      .from('crop_stage_master')
      .select('id, crop_code, growth_stage')
      .limit(10000);
    if (masterErr) {
      console.warn('[STAGE_KNOWLEDGE] crop_stage_master id-map error:', masterErr.message);
    } else if (Array.isArray(masterFull)) {
      for (const r of masterFull) {
        if (r?.id) idToStage.set(String(r.id), {
          crop: String(r.crop_code || '').toLowerCase(),
          stage: String(r.growth_stage || '').toLowerCase(),
        });
      }
    }

    const { data: edges, error: edgeErr } = await supabase
      .from('crop_stage_graph')
      .select('crop_code, from_stage_id, to_stage_id, edge_type')
      .limit(5000);
    if (edgeErr) {
      console.warn('[STAGE_KNOWLEDGE] crop_stage_graph select error:', edgeErr.message);
    } else if (Array.isArray(edges)) {
      let edgeCount = 0;
      for (const e of edges) {
        const crop = String(e.crop_code || '').toLowerCase();
        const from = idToStage.get(String(e.from_stage_id))?.stage;
        const to   = idToStage.get(String(e.to_stage_id))?.stage;
        if (!crop || !from || !to) continue;
        // Symmetric adjacency — all curated edge types (STAGE_PRECEDES,
        // ENABLES, CONCURRENT_WITH, TRIGGERS) mark the two stages as
        // neighbours in the same crop's phenological graph.
        const keyF = `${crop}|${from}`;
        const keyT = `${crop}|${to}`;
        if (!stageAdjacency.has(keyF)) stageAdjacency.set(keyF, new Set([from]));
        if (!stageAdjacency.has(keyT)) stageAdjacency.set(keyT, new Set([to]));
        stageAdjacency.get(keyF)!.add(to);
        stageAdjacency.get(keyT)!.add(from);
        edgeCount++;
      }
      console.log(`[STAGE_KNOWLEDGE] crop_stage_graph edges=${edgeCount} adjacency_keys=${stageAdjacency.size}`);
    }
  } catch (e) {
    console.warn('[STAGE_KNOWLEDGE] crop_stage_graph load failed', e);
  }

  const byCropStage = new Map<string, StageMasterRow>();
  for (const r of master) byCropStage.set(k(r.crop_code, r.growth_stage), r);

  const knowledgeByCropStage = new Map<string, StageKnowledgeRow>();
  for (const r of knowledge) knowledgeByCropStage.set(k(r.crop_code, r.growth_stage), r);

  cache = { loadedAt: now, master, knowledge, byCropStage, knowledgeByCropStage, stageAdjacency };
  console.log(
    `[STAGE_KNOWLEDGE] loaded master=${master.length} knowledge=${knowledge.length} adjacency=${stageAdjacency.size}`
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

/** DB-first stage category lookup. Returns null when DB has no row.
 *  Note: crop_stage_master has no `stage_category` column — returns the
 *  growth_stage itself uppercased, which is what downstream callers compare. */
export function getStageCategoryFromDB(
  crop: string,
  stage: string
): string | null {
  const row = getStageRow(crop, stage);
  return row?.growth_stage ? row.growth_stage.toUpperCase() : null;
}

/** DB-first DAS → stage lookup. */
export function getStageByDAS(crop: string, das: number): StageMasterRow | null {
  if (!cache) return null;
  const cropKey = (crop || '').toLowerCase();
  for (const r of cache.master) {
    if (r.crop_code?.toLowerCase() !== cropKey) continue;
    if ((r.das_min ?? -Infinity) <= das && (r.das_max ?? Infinity) >= das) {
      return r;
    }
  }
  return null;
}


export function isStageKnowledgeLoaded(): boolean {
  return !!cache && cache.master.length > 0;
}
