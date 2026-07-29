/**
 * CHANGE LOG
 * 2026-07-29 10:20 UTC — FIX C1-b: request-scoped cultivation lane via
 *   AsyncLocalStorage (`runWithCultivationLane` / `enterCultivationLane` /
 *   `currentLane`). All lookups resolve the lane from the explicit arg first,
 *   then the request store. `byCropStage` is now lane-keyed (rice DSR vs
 *   transplanted no longer collide), `getStageByDAS` lost its "first hit"
 *   branch (deterministic: exact lane → 'any' → lowest das_min, logged as
 *   [STAGE_LANE_UNKNOWN]), and `laneMatches` degrades NULL row methods to
 *   'any' so the 134 NULL-lane crop_stage_graph edges stay visible.
 * 2026-07-28 04:45 UTC — FIX C1: deleted module-scope `activeCultivationMethod`
 *   (cross-request contamination hazard). Setter/getter are deprecated stubs;
 *   stage lookups default to lane-agnostic when no explicit method is passed.
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

import { AsyncLocalStorage } from 'node:async_hooks';



export interface StageMasterRow {
  crop_code: string;
  growth_stage: string;
  das_min?: number | null;
  das_max?: number | null;
  stage_description?: string | null;
  /**
   * v6 — cultivation_method dimension (e.g. 'direct_seeded', 'transplanted',
   * 'any', or NULL). Callers of getStageByDAS may filter by this to respect
   * the biological path recorded in crop_schedules.
   */
  cultivation_method?: string | null;
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

/** Adjacency key — cultivation_method is part of the identity so that
 *  direct-seeded and transplanted timelines never merge into one path. */
function ak(crop: string, method: string, stage: string) {
  return `${(crop || '').toLowerCase()}|${(method || 'any').toLowerCase()}|${(stage || '').toLowerCase()}`;
}

/**
 * FIX C1 (2026-07-28): Deleted `activeCultivationMethod` module-scope state.
 * That variable created a cross-request data-corruption hazard in Supabase
 * Edge Functions: Deno isolates serve multiple concurrent requests, every
 * `await` between the set and downstream reads is a preemption point, and
 * concurrent farmer B could overwrite the lane while farmer A was awaiting
 * a DB call. When A resumed, its stage lookups used B's lane — silently
 * giving A wrong-lane agronomic advice.
 *
 * The setter is now a deprecated no-op that logs a warning so any residual
 * call sites are visible in production. The getter returns null so any
 * legacy caller that reads it gets the lane-agnostic behavior (safe default).
 *
 * Correct pattern: every stage-lookup call MUST pass cultivationMethod
 * explicitly, resolved from THIS request's BiologicalState / CanonicalState.
 * Callers that currently omit the arg get lane-agnostic matching (which
 * matches every row regardless of cultivation_method) — cross-farmer
 * contamination cannot happen because there is no shared state.
 */
export function setActiveCultivationMethod(method: string | null | undefined): void {
  // Deprecated no-op — retained for API compatibility only.
  const raw = method ? String(method).toLowerCase().trim() : null;
  console.warn(
    `[STAGE_LANE_DEPRECATED] setActiveCultivationMethod called with method=${raw ?? 'null'}; ` +
    `module-scope state was removed to prevent cross-request contamination. ` +
    `Use runWithCultivationLane()/enterCultivationLane() or pass cultivationMethod ` +
    `explicitly to getStageRow/getStageByDAS/getStageFamilyFromDB instead.`,
  );
}

export function getActiveCultivationMethod(): string | null {
  // FIX C1-b: now backed by the REQUEST-SCOPED store (AsyncLocalStorage), not
  // by module-scope mutable state. Safe under concurrency.
  return currentLane();
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX C1-b (2026-07-29) — REQUEST-SCOPED CULTIVATION LANE
// ───────────────────────────────────────────────────────────────────────────
// AsyncLocalStorage gives every in-flight request its own lane. Unlike the
// module-scope variable deleted by FIX C1, a store entered inside request A's
// async context is invisible to request B, so concurrent farmers can never
// read each other's cultivation lane.
// ═══════════════════════════════════════════════════════════════════════════

interface LaneStore {
  lane: string | null;
  warned: Set<string>;
}

const laneALS = new AsyncLocalStorage<LaneStore>();

function normLane(method: string | null | undefined): string | null {
  const raw = method ? String(method).trim().toLowerCase() : '';
  return raw ? raw : null;
}

/** Run `fn` with `method` as the active cultivation lane for this request. */
export function runWithCultivationLane<T>(
  method: string | null | undefined,
  fn: () => T,
): T {
  return laneALS.run({ lane: normLane(method), warned: new Set<string>() }, fn);
}

/**
 * Set the lane for the CURRENT async context onward (no callback wrapping).
 * Used by the orchestrator the moment SessionSSOT resolves the lane mid-turn.
 * Falls back to a warning (lane-agnostic behaviour) if the runtime does not
 * implement `enterWith`.
 */
export function enterCultivationLane(method: string | null | undefined): void {
  const lane = normLane(method);
  try {
    laneALS.enterWith({ lane, warned: new Set<string>() });
  } catch (e) {
    console.warn(
      `[STAGE_LANE_ENTER_FAILED] method=${lane ?? 'null'} err=${(e as Error).message} ` +
      `→ lookups fall back to lane-agnostic`,
    );
  }
}

/** The lane bound to the current request context, or null when unknown. */
export function currentLane(): string | null {
  return laneALS.getStore()?.lane ?? null;
}

/** Explicit arg wins (including an explicit null); otherwise the request store. */
function resolveLane(cultivationMethod: string | null | undefined): string | null {
  if (cultivationMethod === undefined) return currentLane();
  return normLane(cultivationMethod);
}

/** Log a lane-ambiguity warning at most once per request context. */
function warnOnce(key: string, message: string): void {
  const store = laneALS.getStore();
  if (store) {
    if (store.warned.has(key)) return;
    store.warned.add(key);
  }
  console.warn(message);
}

/** A stage-graph / stage-master row belongs to the requested lane when its own
 *  method equals the lane or is the universal 'any'. Unknown lane → all rows.
 *  FIX C1-b: a NULL row method degrades to 'any' — crop_stage_graph has 134
 *  NULL-lane edges covering every non-rice crop; rejecting them would delete
 *  those stage families entirely. */
function laneMatches(rowMethod: unknown, lane: string | null): boolean {
  const m = rowMethod ? String(rowMethod).toLowerCase() : 'any';
  if (!lane) return true;
  return m === lane || m === 'any';
}


export async function loadStageKnowledge(supabase: any): Promise<void> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return;

  const master: StageMasterRow[] = [];
  const knowledge: StageKnowledgeRow[] = [];

  try {
    const { data, error } = await supabase
      .from('crop_stage_master')
      .select('crop_code, growth_stage, stage_description, das_min, das_max, cultivation_method')
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
      .select('crop_code, from_stage_id, to_stage_id, edge_type, cultivation_method')
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
        const edgeMethod = e.cultivation_method
          ? String(e.cultivation_method).toLowerCase()
          : 'any';
        const keyF = ak(crop, edgeMethod, from);
        const keyT = ak(crop, edgeMethod, to);
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

  // FIX C1-b: lane-keyed index (`crop|method|stage`). The previous
  // `crop|stage` key let rice direct_seeded and transplanted rows overwrite
  // each other at load time, so one lane silently disappeared.
  const byCropStage = new Map<string, StageMasterRow>();
  for (const r of master) {
    const m = r.cultivation_method ? String(r.cultivation_method).toLowerCase() : 'any';
    byCropStage.set(ak(r.crop_code, m, r.growth_stage), r);
  }


  const knowledgeByCropStage = new Map<string, StageKnowledgeRow>();
  for (const r of knowledge) knowledgeByCropStage.set(k(r.crop_code, r.growth_stage), r);

  cache = { loadedAt: now, master, knowledge, byCropStage, knowledgeByCropStage, stageAdjacency };
  console.log(
    `[STAGE_KNOWLEDGE] loaded master=${master.length} knowledge=${knowledge.length} adjacency=${stageAdjacency.size}`
  );
}


export function getStageRow(
  crop: string,
  stage: string,
  cultivationMethod?: string | null,
): StageMasterRow | null {
  if (!cache) return null;
export function getStageRow(
  crop: string,
  stage: string,
  cultivationMethod?: string | null,
): StageMasterRow | null {
  if (!cache) return null;
  // FIX C1-b: explicit arg wins; otherwise the REQUEST-SCOPED lane.
  const lane = resolveLane(cultivationMethod);
  const cropKey = (crop || '').toLowerCase();
  const stageKey = (stage || '').toLowerCase();

  if (lane) {
    const exact = cache.byCropStage.get(ak(cropKey, lane, stageKey));
    if (exact) return exact;
    return cache.byCropStage.get(ak(cropKey, 'any', stageKey)) ?? null;
  }

  // Lane unknown → scan master deterministically ('any' first, then lowest
  // das_min). NEVER rely on a lane-agnostic map key (that was the collision).
  let anyRow: StageMasterRow | null = null;
  let best: StageMasterRow | null = null;
  for (const r of cache.master) {
    if (r.crop_code?.toLowerCase() !== cropKey) continue;
    if (r.growth_stage?.toLowerCase() !== stageKey) continue;
    const m = r.cultivation_method ? String(r.cultivation_method).toLowerCase() : 'any';
    if (m === 'any' && !anyRow) anyRow = r;
    if (!best || (r.das_min ?? Infinity) < (best.das_min ?? Infinity)) best = r;
  }
  const picked = anyRow ?? best;
  if (picked) {
    warnOnce(
      `row:${cropKey}:${stageKey}`,
      `[STAGE_LANE_UNKNOWN] crop=${cropKey} stage=${stageKey} ` +
      `picked=${picked.growth_stage} method=${picked.cultivation_method ?? 'any'}`,
    );
  }
  return picked;
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

/**
 * DB-first DAS → stage lookup.
 *
 * v7 — NULL cultivation_method is treated as a data-quality issue and is
 * NEVER matched at runtime (mirrors the SQL resolver). A row qualifies iff
 * its own `cultivation_method` is 'any' OR equals the requested method
 * (case-insensitive). Exact match is preferred over 'any'.
 *
 * When `cultivationMethod` is undefined the legacy first-hit behaviour is
 * preserved so pre-v6 callers stay green.
 */
export function getStageByDAS(
  crop: string,
  das: number,
  cultivationMethod?: string | null,
): StageMasterRow | null {
  if (!cache) return null;
  const cropKey = (crop || '').toLowerCase();
  // FIX C1 (2026-07-28): no module-scope fallback. Lane-agnostic default
  // when caller omits cultivationMethod — prevents cross-request contamination.
  const resolvedMethod = cultivationMethod === undefined ? null : cultivationMethod;
  const method = resolvedMethod ? String(resolvedMethod).toLowerCase() : null;

  let exact: StageMasterRow | null = null;
  let anyRow: StageMasterRow | null = null;

  for (const r of cache.master) {
    if (r.crop_code?.toLowerCase() !== cropKey) continue;
    if (!((r.das_min ?? -Infinity) <= das && (r.das_max ?? Infinity) >= das)) continue;
    const rowMethod = r.cultivation_method ? String(r.cultivation_method).toLowerCase() : null;

    if (method) {
      // NULL rows are excluded — treated as data-quality issue.
      if (rowMethod === null) continue;
      if (rowMethod === method && !exact) exact = r;
      else if (rowMethod === 'any' && !anyRow) anyRow = r;
    } else {
      // Legacy path — return first hit as before.
      return r;
    }
  }
  return exact ?? anyRow;
}



export function isStageKnowledgeLoaded(): boolean {
  return !!cache && cache.master.length > 0;
}

/**
 * DB-first stage family lookup — SSOT is `public.crop_stage_graph`.
 * Returns adjacent stages (including the query stage itself) for a given
 * (crop, stage). Returns `null` when the cache is unloaded OR when the DB
 * has no entry for that (crop, stage) — callers MUST treat null as
 * "unknown, singleton fallback" and NEVER substitute a hardcoded family.
 */
export function getStageFamilyFromDB(
  crop: string,
  stage: string,
  cultivationMethod?: string | null,
): string[] | null {
  if (!cache) return null;
  // FIX C1 (2026-07-28): no module-scope fallback. Lane-agnostic default
  // when caller omits cultivationMethod — prevents cross-request contamination.
  const resolved = cultivationMethod === undefined ? null : cultivationMethod;
  const lane = resolved ? String(resolved).toLowerCase() : null;
  const cropKey = (crop || '').toLowerCase();
  const stageKey = (stage || '').toLowerCase();
  const out = new Set<string>();
  for (const [key, set] of cache.stageAdjacency) {
    const [c, m, st] = key.split('|');
    if (c !== cropKey || st !== stageKey) continue;
    if (!laneMatches(m, lane)) continue;
    for (const v of set) out.add(v);
  }
  if (out.size === 0) return null;
  return Array.from(out);
}

/**
 * DB-first symmetric equivalence — true iff `b` is in the DB-curated stage
 * family of `(crop, a)` OR vice versa. Returns `null` when the DB has no
 * data for either side; callers decide the fallback semantics.
 */
export function stagesEquivalentFromDB(
  crop: string,
  a: string,
  b: string,
  cultivationMethod?: string | null,
): boolean | null {
  if (!cache) return null;
  const aNorm = String(a || '').toLowerCase();
  const bNorm = String(b || '').toLowerCase();
  if (!aNorm || !bNorm) return null;
  if (aNorm === bNorm) return true;
  const famA = getStageFamilyFromDB(crop, aNorm, cultivationMethod);
  if (famA && famA.includes(bNorm)) return true;
  const famB = getStageFamilyFromDB(crop, bNorm, cultivationMethod);
  if (famB && famB.includes(aNorm)) return true;
  if (!famA && !famB) return null; // no DB data for this lane — signal unknown
  return false;
}
