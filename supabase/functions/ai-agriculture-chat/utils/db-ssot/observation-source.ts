/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-08-02 — P0-A.1 CREATED. Single shared read of `observation_master` and
 *   `observation_aliases` per isolate. Previously OBS_INDEX, TAXONOMY and
 *   OBS_CLASSIFICATION each issued their own paginated read of both tables
 *   (~9.5 s of a 22.6 s cold request). This module reads each table EXACTLY
 *   ONCE (TTL-gated, single-flight, same in-flight-lock pattern as
 *   `utils/crop-vocabulary-cache.ts`) and hands the raw rows to each consumer,
 *   which keeps its own projection/filter logic verbatim.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CONTRACT — this file adds NO agronomic knowledge and NO filtering opinion.
 *   - `observation_master` is loaded WITHOUT an `is_active` filter (the
 *     taxonomy consumer legitimately needs all 2550 rows; OBS_INDEX and
 *     OBS_CLASSIFICATION filter `is_active === true` in memory → 2007).
 *   - `observation_aliases` is loaded WITH `active = true`, because all three
 *     consumers apply exactly that filter today — keeping it in SQL preserves
 *     the identical row set and avoids paging inactive rows.
 *   - Column sets are the SUPERSET of what the three consumers select.
 *   - On error the arrays stay empty and `partial` is true; every consumer
 *     degrades exactly as it did when its own query failed.
 * ═══════════════════════════════════════════════════════════════════════════
 */

type Supa = any;

export interface ObservationMasterSourceRow {
  observation_code: string;
  semantic_class: string | null;
  canonical_group: string | null;
  observation_category: string | null;
  affected_plant_part: string | null;
  is_diagnostic: boolean | null;
  is_farmer_observable: boolean | null;
  can_generate_question: boolean | null;
  clarity_score: number | null;
  discriminator_score: number | null;
  frequency_score: number | null;
  applies_to_stages: string[] | null;
  is_active: boolean | null;
}

export interface ObservationAliasSourceRow {
  alias_code: string | null;
  alias_normalized: string | null;
  alias_text: string | null;
  canonical_code: string | null;
  active: boolean | null;
  language: string | null;
}

const MASTER_COLUMNS =
  'observation_code, semantic_class, canonical_group, observation_category, affected_plant_part, ' +
  'is_diagnostic, is_farmer_observable, can_generate_question, clarity_score, discriminator_score, frequency_score, applies_to_stages, is_active';
const ALIAS_COLUMNS = 'alias_code, alias_normalized, alias_text, canonical_code, active, language';

const TTL_MS = 10 * 60 * 1000;
const PAGE = 1000;

interface SourceState {
  loadedAt: number | null;
  loading: Promise<void> | null;
  master: ObservationMasterSourceRow[];
  aliases: ObservationAliasSourceRow[];
  partialMaster: boolean;
  partialAliases: boolean;
}

const state: SourceState = {
  loadedAt: null,
  loading: null,
  master: [],
  aliases: [],
  partialMaster: false,
  partialAliases: false,
};

function isFresh(): boolean {
  return state.loadedAt !== null && Date.now() - state.loadedAt < TTL_MS;
}

/**
 * PARALLEL PAGINATION. PostgREST hard-caps a response at 1000 rows, so a 14k
 * row table needs 15 requests. Issuing them serially cost ~10 s; here we ask
 * for the exact count once and then fetch the pages concurrently (bounded),
 * preserving page order when assembling. Row set and ordering are identical
 * to the serial version — this is purely a transport-level change.
 */
const MAX_CONCURRENT_PAGES = 6;

async function pagedLoad<T>(
  supabase: Supa,
  table: string,
  columns: string,
  extra: (q: any) => any,
): Promise<{ rows: T[]; partial: boolean }> {
  let partial = false;
  let total = 0;
  try {
    const { count, error } = await extra(
      supabase.from(table).select(columns, { count: 'exact', head: true }),
    );
    if (error) throw new Error(error.message);
    total = Number(count ?? 0);
  } catch (e) {
    console.warn(`[OBS_SOURCE_COUNT_ERR] table=${table} err=${(e as Error).message} — serial fallback`);
    total = -1;
  }

  const fetchPage = async (offset: number): Promise<T[] | null> => {
    try {
      const { data, error } = await extra(supabase.from(table).select(columns))
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[OBS_SOURCE_LOAD_ERR] table=${table} offset=${offset} err=${error.message}`);
        return null;
      }
      return (data as T[] | null) ?? [];
    } catch (e) {
      console.warn(`[OBS_SOURCE_LOAD_ERR] table=${table} offset=${offset} exception=${(e as Error).message}`);
      return null;
    }
  };

  if (total < 0) {
    // Count failed — fall back to the original serial walk.
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const batch = await fetchPage(offset);
      if (batch === null) { partial = true; break; }
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return { rows, partial };
  }

  const offsets: number[] = [];
  for (let o = 0; o < total; o += PAGE) offsets.push(o);
  const pages: (T[] | null)[] = new Array(offsets.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= offsets.length) return;
      pages[i] = await fetchPage(offsets[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_PAGES, offsets.length) }, worker),
  );

  const rows: T[] = [];
  for (const p of pages) {
    if (p === null) { partial = true; continue; }
    rows.push(...p);
  }
  return { rows, partial };
}

/** Load both tables exactly once per isolate. Idempotent + single-flight + TTL-gated. */
export async function loadObservationSource(supabase: Supa, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && isFresh()) return;
  if (state.loading) return state.loading;

  state.loading = (async () => {
    const started = Date.now();
    try {
      const [masterR, aliasR] = await Promise.all([
        pagedLoad<ObservationMasterSourceRow>(
          supabase,
          'observation_master',
          MASTER_COLUMNS,
          (q) => q.order('observation_code', { ascending: true }),
        ),
        pagedLoad<ObservationAliasSourceRow>(
          supabase,
          'observation_aliases',
          ALIAS_COLUMNS,
          (q) => q.eq('active', true).order('alias_code', { ascending: true }),
        ),
      ]);

      if (masterR.rows.length > 0) state.master = masterR.rows;
      if (aliasR.rows.length > 0) state.aliases = aliasR.rows;
      state.partialMaster = masterR.partial;
      state.partialAliases = aliasR.partial;
      state.loadedAt = Date.now();

      console.log(
        `[OBS_SOURCE] loaded_ms=${Date.now() - started} master_rows=${state.master.length} ` +
          `alias_rows=${state.aliases.length} partial=${masterR.partial || aliasR.partial}`,
      );
    } catch (e) {
      console.error(`[OBS_SOURCE] load_failed err=${(e as Error).message}`);
    } finally {
      state.loading = null;
    }
  })();

  return state.loading;
}

/** All `observation_master` rows (UNFILTERED — callers apply their own is_active policy). */
export function observationMasterRows(): ReadonlyArray<ObservationMasterSourceRow> {
  return state.master;
}

/** All ACTIVE `observation_aliases` rows. */
export function observationAliasRows(): ReadonlyArray<ObservationAliasSourceRow> {
  return state.aliases;
}

export function observationSourceReady(): boolean {
  return state.loadedAt !== null && state.master.length > 0;
}

export function observationSourceSnapshot() {
  return {
    loadedAt: state.loadedAt,
    master_rows: state.master.length,
    alias_rows: state.aliases.length,
    partial: state.partialMaster || state.partialAliases,
  };
}

/** Test-only reset. */
export function __resetObservationSource(): void {
  state.loadedAt = null;
  state.loading = null;
  state.master = [];
  state.aliases = [];
  state.partialMaster = false;
  state.partialAliases = false;
}
