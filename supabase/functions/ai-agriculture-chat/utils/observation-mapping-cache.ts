/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION MAPPING CACHE — DB-backed SSOT for intent → observations
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG
 *   2026-07-09 10:35 UTC — SCOPE-AWARE REFACTOR. The cache no longer collapses
 *     `intent_observation_mapping` down to `intent_code`. It now retains the
 *     full 4-dimensional row set (crop_code, growth_stage, das_min, das_max,
 *     assertion_strength, confidence_rank) and applies scope at lookup time.
 *
 *     Previously `getObservationsForIntent(intent)` returned the UNION of
 *     every crop / stage / DAS row for that intent, which put wrong-crop
 *     observation codes (brinjal, chilli, onion, cotton, sugarcane, …) on
 *     screen for a rice land at DAS=31 stage=transplanting.
 *
 *     Fail-closed: an out-of-scope lookup returns an empty entry. There is
 *     NO fallback to the unscoped union anywhere.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SSOT: `public.intent_observation_mapping` joined against
 * `public.observation_master` for the modal `affected_plant_part` per intent.
 *
 * CONTRACT (2030 Neuro-Symbolic Brain):
 *  - Loaded ONCE per edge request boot by `orchestrator.ts` alongside
 *    `StageKnowledgeCache.loadStageKnowledge`.
 *  - Consumers call `getObservationsForIntent(intentCode, scope)` where
 *    `scope = { crop_code, growth_stage, das }` from the frozen
 *    BiologicalState / canonical land context.
 *  - Cache MISS or empty scope-filtered result → returns an empty entry —
 *    caller MUST log `[OBS_MAPPING_CACHE_MISS]` and produce NO observation
 *    codes. NEVER fall back to hardcoded agronomy or unscoped unions.
 *
 * FILTER POLICY:
 *  - Row filter:      `is_active=true`
 *  - Assertion order: LITERAL > STRONG_HYPOTHESIS > DIFFERENTIAL
 *  - Crop scope:      cropCode.toLowerCase() ∪ 'all' ∪ 'universal'
 *  - Stage scope:     normalizeStageForDB(stage) ∪ 'all'
 *  - DAS scope:       das === null OR das_min ≤ das ≤ das_max
 *  - Dedup by `observation_code` — keep row with best (lowest) rank
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { normalizeStageForDB } from './stage-normalizer.ts';
import { canonicalObsCode, canonicalCropCode } from './canonical-code.ts';

interface IOMRow {
  intent_code: string;
  crop_code: string | null;
  growth_stage: string | null;
  das_min: number | null;
  das_max: number | null;
  observation_code: string;
  assertion_strength: string | null;
  confidence_rank: number | null;
  cultivation_method?: string | null;
}

interface ObsMasterRow {
  observation_code: string;
  affected_plant_part: string | null;
}

import {
  loadObservationSource,
  observationMasterRows,
} from './db-ssot/observation-source.ts';

export interface IntentMappingScope {
  crop_code?: string | null;
  growth_stage?: string | null;
  das?: number | null;
}

export interface IntentMappingEntry {
  observation_codes: string[];       // deduped, ordered by assertion + rank
  modal_affected_part: string | null; // DB-derived from filtered subset
  source_rows: number;
}

interface Cache {
  loadedAt: number;
  /** intent_code → all curated rows for that intent (raw, 4-D). */
  rowsByIntent: Map<string, IOMRow[]>;
  /** observation_code → modal affected_plant_part (from observation_master). */
  partByObservationCode: Map<string, string>;
}

const EMPTY_ENTRY: IntentMappingEntry = Object.freeze({
  observation_codes: Object.freeze([]) as unknown as string[],
  modal_affected_part: null,
  source_rows: 0,
});

const ASSERTION_PRIORITY: Record<string, number> = {
  LITERAL: 0,
  STRONG_HYPOTHESIS: 1,
  DIFFERENTIAL: 2,
};

let cache: Cache | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function loadObservationMapping(supabase: any): Promise<void> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return;

  // Paginate IOM to bypass the PostgREST 1000-row cap — 13k+ rows expected.
  // Pages are fetched CONCURRENTLY (bounded) after an exact count; ordering is
  // preserved by writing each page into its slot. Same rows, same order.
  const iom: IOMRow[] = [];
  const PAGE = 1000;
  const COLS = 'intent_code, crop_code, growth_stage, das_min, das_max, observation_code, assertion_strength, confidence_rank';
  const base = () => supabase
    .from('intent_observation_mapping')
    .select(COLS)
    .eq('is_active', true)
    .order('intent_code', { ascending: true })
    .order('confidence_rank', { ascending: true, nullsFirst: false });
  try {
    let total = -1;
    try {
      const { count, error } = await supabase
        .from('intent_observation_mapping')
        .select(COLS, { count: 'exact', head: true })
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      total = Number(count ?? 0);
    } catch (e) {
      console.warn('[OBS_MAPPING_CACHE] count failed — serial fallback', (e as Error).message);
    }

    const fetchPage = async (offset: number): Promise<IOMRow[] | null> => {
      const { data, error } = await base().range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[OBS_MAPPING_CACHE] intent_observation_mapping paged select error @${offset}:`, error.message);
        return null;
      }
      return (data as IOMRow[] | null) ?? [];
    };

    if (total < 0) {
      for (let offset = 0; ; offset += PAGE) {
        const rows = await fetchPage(offset);
        if (rows === null) break;
        iom.push(...rows);
        if (rows.length < PAGE) break;
      }
    } else {
      const offsets: number[] = [];
      for (let o = 0; o < total; o += PAGE) offsets.push(o);
      const pages: (IOMRow[] | null)[] = new Array(offsets.length).fill(null);
      let next = 0;
      const worker = async () => {
        for (;;) {
          const i = next++;
          if (i >= offsets.length) return;
          pages[i] = await fetchPage(offsets[i]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, offsets.length) }, worker));
      for (const p of pages) if (p) iom.push(...p);
    }
  } catch (e) {
    console.warn('[OBS_MAPPING_CACHE] IOM load failed', e);
  }

  // P0-A.1: affected_plant_part now comes from the shared single-read
  // observation_master source instead of chunked `.in()` re-reads.
  const partByCode = new Map<string, string>();
  try {
    await loadObservationSource(supabase);
    for (const r of observationMasterRows()) {
      if (r?.observation_code && r.affected_plant_part) {
        partByCode.set(String(r.observation_code).toLowerCase(), r.affected_plant_part);
      }
    }
  } catch (e) {
    console.warn('[OBS_MAPPING_CACHE] observation_master enrichment failed', e);
  }

  // Group rows by intent (raw — no scope collapse).
  const rowsByIntent = new Map<string, IOMRow[]>();
  for (const r of iom) {
    const key = String(r.intent_code || '').toUpperCase();
    if (!key || !r.observation_code) continue;
    let bucket = rowsByIntent.get(key);
    if (!bucket) {
      bucket = [];
      rowsByIntent.set(key, bucket);
    }
    bucket.push(r);
  }

  cache = {
    loadedAt: now,
    rowsByIntent,
    partByObservationCode: partByCode,
  };
  console.log(
    `[OBS_MAPPING_CACHE] loaded iom_rows=${iom.length} intents=${rowsByIntent.size} obs_with_part=${partByCode.size}`
  );
}

// DB-backed intent → observations lookup — SCOPE-AWARE.
export function getObservationsForIntent(
  intentCode: string,
  scope?: IntentMappingScope,
): IntentMappingEntry {
  if (!cache) return EMPTY_ENTRY;
  const key = String(intentCode || '').toUpperCase();
  if (!key) return EMPTY_ENTRY;

  const rows = cache.rowsByIntent.get(key);
  if (!rows || rows.length === 0) return EMPTY_ENTRY;

  const cropRaw = canonicalCropCode(scope?.crop_code);
  const cropAllowed = new Set<string>();
  if (cropRaw) cropAllowed.add(cropRaw);
  cropAllowed.add('all');
  cropAllowed.add('universal');

  const stageAllowed = new Set<string>(['all']);
  if (scope?.growth_stage) {
    const s = normalizeStageForDB(String(scope.growth_stage)).toLowerCase();
    if (s) stageAllowed.add(s);
  }

  const das = typeof scope?.das === 'number' && isFinite(scope!.das!) ? scope!.das! : null;

  // Dedup by observation_code; keep best row (lowest assertion priority, then
  // lowest confidence_rank).
  const bestByCode = new Map<string, IOMRow>();
  for (const r of rows) {
    const rowCrop = canonicalCropCode(r.crop_code);
    if (rowCrop && !cropAllowed.has(rowCrop)) continue;

    const rowStage = String(r.growth_stage || 'all').trim().toLowerCase();
    if (!stageAllowed.has(rowStage)) continue;

    if (das != null) {
      const lo = typeof r.das_min === 'number' ? r.das_min : 0;
      const hi = typeof r.das_max === 'number' ? r.das_max : 9999;
      if (das < lo || das > hi) continue;
    }

    const code = canonicalObsCode(r.observation_code);
    if (!code) continue;

    const strength = String(r.assertion_strength || 'DIFFERENTIAL').toUpperCase();
    const rowPriority = ASSERTION_PRIORITY[strength] ?? 3;
    const rowRank = typeof r.confidence_rank === 'number' ? r.confidence_rank : 999;

    const prev = bestByCode.get(code);
    if (!prev) {
      bestByCode.set(code, r);
      continue;
    }
    const prevPriority = ASSERTION_PRIORITY[String(prev.assertion_strength || 'DIFFERENTIAL').toUpperCase()] ?? 3;
    const prevRank = typeof prev.confidence_rank === 'number' ? prev.confidence_rank : 999;
    if (rowPriority < prevPriority || (rowPriority === prevPriority && rowRank < prevRank)) {
      bestByCode.set(code, r);
    }
  }

  if (bestByCode.size === 0) {
    console.log(
      `[OBS_MAPPING_SCOPE] intent=${key} crop=${cropRaw || 'null'} ` +
      `stage=${scope?.growth_stage ?? 'null'} das=${das ?? 'null'} returned=0`
    );
    return EMPTY_ENTRY;
  }

  const ordered = Array.from(bestByCode.values()).sort((a, b) => {
    const pa = ASSERTION_PRIORITY[String(a.assertion_strength || 'DIFFERENTIAL').toUpperCase()] ?? 3;
    const pb = ASSERTION_PRIORITY[String(b.assertion_strength || 'DIFFERENTIAL').toUpperCase()] ?? 3;
    if (pa !== pb) return pa - pb;
    const ra = typeof a.confidence_rank === 'number' ? a.confidence_rank : 999;
    const rb = typeof b.confidence_rank === 'number' ? b.confidence_rank : 999;
    return ra - rb;
  });

  const observation_codes = ordered.map((r) => r.observation_code);

  // Modal affected_plant_part across the filtered subset only.
  const partCounts = new Map<string, number>();
  for (const code of observation_codes) {
    const part = cache.partByObservationCode.get(code.toLowerCase());
    if (part) partCounts.set(part, (partCounts.get(part) ?? 0) + 1);
  }
  let modal: string | null = null;
  let modalCount = 0;
  for (const [p, c] of partCounts) {
    if (c > modalCount) { modal = p; modalCount = c; }
  }

  console.log(
    `[OBS_MAPPING_SCOPE] intent=${key} crop=${cropRaw || 'null'} ` +
    `stage=${scope?.growth_stage ?? 'null'} das=${das ?? 'null'} returned=${observation_codes.length}`
  );

  return {
    observation_codes,
    modal_affected_part: modal,
    source_rows: observation_codes.length,
  };
}

export function isObservationMappingLoaded(): boolean {
  return !!cache && cache.rowsByIntent.size > 0;
}

/** Test-only cache reset. */
export function __resetObservationMappingCache(): void {
  cache = null;
}

/**
 * P0-B.1 — DB-SSOT crop scope for intents.
 * Returns the set of intent codes that have at least one active
 * `intent_observation_mapping` row applicable to `cropCode`. Rows with a NULL
 * crop_code are crop-agnostic and therefore eligible for every crop.
 * Returns null when the cache is cold (caller must not filter in that case).
 */
export function getIntentCodesForCrop(cropCode?: string | null): Set<string> | null {
  if (!cache) return null;
  const crop = String(cropCode || '').trim().toLowerCase();
  const out = new Set<string>();
  for (const [intent, rows] of cache.rowsByIntent) {
    for (const r of rows) {
      const rc = r.crop_code == null ? null : String(r.crop_code).trim().toLowerCase();
      if (rc === null || rc === '' || rc === 'all' || (crop && rc === crop)) {
        out.add(intent);
        break;
      }
    }
  }
  return out.size > 0 ? out : null;
}
