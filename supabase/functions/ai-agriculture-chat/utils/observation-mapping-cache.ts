/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION MAPPING CACHE — DB-backed SSOT for intent → observations
 * ═══════════════════════════════════════════════════════════════════════════
 * Replaces the deleted hardcoded `INTENT_TO_OBSERVATION_MAPPINGS` table in
 * `decision/observation-code-mapper.ts`.
 *
 * SSOT: `public.intent_observation_mapping` (13,539 active rows across 86
 * intents at 2026-07-08) joined against `public.observation_master` for the
 * modal `affected_plant_part` per intent — the DB-derived analogue of the
 * old `default_part` field.
 *
 * CONTRACT (2030 Neuro-Symbolic Brain):
 *  - Loaded ONCE per edge request boot by `orchestrator.ts` alongside
 *    `StageKnowledgeCache.loadStageKnowledge`.
 *  - Consumers call `getObservationsForIntent(intentCode)` synchronously.
 *  - Cache MISS returns `null` — caller MUST log `[OBS_MAPPING_CACHE_MISS]`
 *    and produce an empty result. NEVER fall back to hardcoded agronomy.
 *
 * FILTER POLICY:
 *  - `is_active=true`
 *  - `assertion_strength IN ('LITERAL','STRONG')` — mirrors the report's
 *    recommendation, avoids flooding rule engine with weak associations.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface IOMRow {
  intent_code: string;
  observation_code: string;
  assertion_strength: string | null;
  confidence_rank: number | null;
}

interface ObsMasterRow {
  observation_code: string;
  affected_plant_part: string | null;
}

interface IntentMappingEntry {
  observation_codes: string[];       // deduped, ordered by confidence_rank
  modal_affected_part: string | null; // DB-derived, replaces hardcoded default_part
  source_rows: number;
}

interface Cache {
  loadedAt: number;
  byIntent: Map<string, IntentMappingEntry>;
}

let cache: Cache | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function loadObservationMapping(supabase: any): Promise<void> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) return;

  // Paginate IOM to bypass the PostgREST 1000-row cap — 13k+ rows expected.
  const iom: IOMRow[] = [];
  const PAGE = 1000;
  try {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('intent_observation_mapping')
        .select('intent_code, observation_code, assertion_strength, confidence_rank')
        .eq('is_active', true)
        .in('assertion_strength', ['LITERAL', 'STRONG'])
        .order('intent_code', { ascending: true })
        .order('confidence_rank', { ascending: true, nullsFirst: false })
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[OBS_MAPPING_CACHE] intent_observation_mapping paged select error @${offset}:`, error.message);
        break;
      }
      const rows = (data as IOMRow[] | null) ?? [];
      iom.push(...rows);
      if (rows.length < PAGE) break;
    }
  } catch (e) {
    console.warn('[OBS_MAPPING_CACHE] IOM load failed', e);
  }

  // Load affected_plant_part for the involved observations.
  const codes = Array.from(new Set(iom.map((r) => r.observation_code).filter(Boolean)));
  const partByCode = new Map<string, string>();
  try {
    // Chunk the .in() list — PostgREST caps around 1000-2000 predicate values.
    const CHUNK = 500;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const slice = codes.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('observation_master')
        .select('observation_code, affected_plant_part')
        .in('observation_code', slice);
      if (error) {
        console.warn(`[OBS_MAPPING_CACHE] observation_master select error @${i}:`, error.message);
        continue;
      }
      for (const r of (data as ObsMasterRow[] | null) ?? []) {
        if (r?.observation_code && r.affected_plant_part) {
          partByCode.set(r.observation_code, r.affected_plant_part);
        }
      }
    }
  } catch (e) {
    console.warn('[OBS_MAPPING_CACHE] observation_master enrichment failed', e);
  }

  // Group by intent.
  const grouping = new Map<string, { codes: string[]; parts: string[] }>();
  for (const r of iom) {
    const key = (r.intent_code || '').toUpperCase();
    if (!key || !r.observation_code) continue;
    let bucket = grouping.get(key);
    if (!bucket) {
      bucket = { codes: [], parts: [] };
      grouping.set(key, bucket);
    }
    if (!bucket.codes.includes(r.observation_code)) bucket.codes.push(r.observation_code);
    const part = partByCode.get(r.observation_code);
    if (part) bucket.parts.push(part);
  }

  const byIntent = new Map<string, IntentMappingEntry>();
  for (const [intent, bucket] of grouping.entries()) {
    // Modal (most common) affected part across matched observations.
    const partCounts = new Map<string, number>();
    for (const p of bucket.parts) partCounts.set(p, (partCounts.get(p) ?? 0) + 1);
    let modal: string | null = null;
    let modalCount = 0;
    for (const [p, c] of partCounts) {
      if (c > modalCount) { modal = p; modalCount = c; }
    }
    byIntent.set(intent, {
      observation_codes: bucket.codes,
      modal_affected_part: modal,
      source_rows: bucket.codes.length,
    });
  }

  cache = { loadedAt: now, byIntent };
  console.log(
    `[OBS_MAPPING_CACHE] loaded iom_rows=${iom.length} intents=${byIntent.size} obs_with_part=${partByCode.size}`
  );
}

/**
 * DB-backed intent → observations lookup. Returns `null` on cache miss so
 * callers can emit `[OBS_MAPPING_CACHE_MISS]` and produce an empty result.
 * NEVER substitute a hardcoded fallback.
 */
export function getObservationsForIntent(intentCode: string): IntentMappingEntry | null {
  if (!cache) return null;
  const key = (intentCode || '').toUpperCase();
  if (!key) return null;
  return cache.byIntent.get(key) ?? null;
}

export function isObservationMappingLoaded(): boolean {
  return !!cache && cache.byIntent.size > 0;
}
