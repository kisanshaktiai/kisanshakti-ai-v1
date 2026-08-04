/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 * ───────────────────────────────────────────────────────────────────────────
 * 2026-08-02 — P0-A.1: observation_master / observation_aliases are no longer
 *   read here. Both come from the shared `db-ssot/observation-source.ts`
 *   loader (one read per isolate); the projections below are unchanged —
 *   `is_active === true` is now applied in memory instead of in SQL.
 * 2026-07-22 — Phase 2 initial: unified observation index (SHADOW mode).
 *   Boot-time paginated load of four observation tables into a single
 *   in-memory index with sync accessors. Publishes `observationIndexDiff()`
 *   so per-site legacy queries can be dual-read-compared without changing
 *   their result. Zero routing / decision change in this phase — index is
 *   populated but NOT authoritative. After a 7-day clean window with zero
 *   `[OBS_INDEX_DIFF]` findings the per-site queries will be cut over
 *   (Phase 3b task, gated on this signal).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SSOT tables:
 *   - public.observation_master        (2540 active rows, PostgREST-paginated)
 *   - public.observation_aliases       (paginated; alias_code / alias_normalized / alias_text → canonical_code)
 *   - public.observation_translations  (paginated; per-language labels)
 *   - public.observation_intent_master (paginated; intent_code metadata)
 *
 * DISCIPLINE: enrichment_skip_on_miss. This loader is a READ-THROUGH INDEX
 * and MUST NOT hard-fail anything in Phase 2. If a table load errors, the
 * corresponding accessor returns null / empty and one warn line is emitted.
 * No caller may branch on this index in Phase 2 — all consumers still make
 * their existing queries. `observationIndexDiff()` merely LOGS divergence.
 *
 * INVARIANT: DB is brain. This file never encodes agronomic classification.
 * It only mirrors DB rows verbatim (with case-normalised lookup keys).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  loadObservationSource,
  observationMasterRows,
  observationAliasRows,
} from './observation-source.ts';

type Supa = any;

export interface ObservationMasterRow {
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

export interface ObservationAliasRow {
  alias_code: string | null;
  alias_normalized: string | null;
  alias_text: string | null;
  canonical_code: string | null;
  active: boolean | null;
}

export interface ObservationTranslationRow {
  observation_code: string;
  language_code: string;
  label: string | null;
  description: string | null;
}

export interface ObservationIntentRow {
  intent_code: string;
  routing_target: string | null;
  is_active: boolean | null;
  /** DB-SSOT establishment lanes this intent is meaningful for; '{any}' = wildcard. */
  cultivation_method_applicable: string[] | null;
}

interface IndexState {
  loadedAt: number | null;
  loading: Promise<void> | null;
  masterByCode: Map<string, ObservationMasterRow>;               // lower-case key
  aliasByAnyKey: Map<string, string>;                            // (alias_code|alias_normalized|alias_text lower) → canonical_code
  translationsByCode: Map<string, ObservationTranslationRow[]>;  // lower-case code → rows
  intentByCode: Map<string, ObservationIntentRow>;               // upper-case intent_code
  stats: {
    master_rows: number;
    alias_rows: number;
    translation_rows: number;
    intent_rows: number;
    partial: boolean;
  };
}

const TTL_MS = 10 * 60 * 1000;
const PAGE = 1000;

const state: IndexState = {
  loadedAt: null,
  loading: null,
  masterByCode: new Map(),
  aliasByAnyKey: new Map(),
  translationsByCode: new Map(),
  intentByCode: new Map(),
  stats: { master_rows: 0, alias_rows: 0, translation_rows: 0, intent_rows: 0, partial: false },
};

const nLower = (v: unknown) => String(v ?? '').trim().toLowerCase();
const nUpper = (v: unknown) => String(v ?? '').trim().toUpperCase();

function isFresh(): boolean {
  return state.loadedAt !== null && Date.now() - state.loadedAt < TTL_MS;
}

// PARALLEL PAGINATION — PostgREST caps responses at 1000 rows; pages are
// fetched concurrently (bounded) instead of serially. Identical row set/order.
const MAX_CONCURRENT_PAGES = 6;

async function pagedLoad<T>(
  supabase: Supa,
  table: string,
  columns: string,
  extra: (q: any) => any = (q) => q,
): Promise<{ rows: T[]; partial: boolean }> {
  let partial = false;
  let total = -1;
  try {
    const { count, error } = await extra(
      supabase.from(table).select(columns, { count: 'exact', head: true }),
    );
    if (error) throw new Error(error.message);
    total = Number(count ?? 0);
  } catch (e) {
    console.warn(`[OBS_INDEX_COUNT_ERR] table=${table} err=${(e as Error).message} — serial fallback`);
    total = -1;
  }

  const fetchPage = async (offset: number): Promise<T[] | null> => {
    try {
      const { data, error } = await extra(supabase.from(table).select(columns))
        .range(offset, offset + PAGE - 1);
      if (error) {
        console.warn(`[OBS_INDEX_LOAD_ERR] table=${table} offset=${offset} err=${error.message}`);
        return null;
      }
      return (data as T[] | null) ?? [];
    } catch (e) {
      console.warn(`[OBS_INDEX_LOAD_ERR] table=${table} offset=${offset} exception=${(e as Error).message}`);
      return null;
    }
  };

  if (total < 0) {
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

// Boot-time preload. Idempotent + single-flight + TTL-gated.
export async function preloadObservationIndex(supabase: Supa, opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && isFresh()) return;
  if (state.loading) return state.loading;

  state.loading = (async () => {
    const started = Date.now();
    let anyPartial = false;
    try {
      // P0-A.1: master/alias rows come from the shared single-read source.
      await loadObservationSource(supabase);
      const masterR = {
        rows: observationMasterRows().filter((r) => r?.is_active === true) as ObservationMasterRow[],
        partial: false,
      };
      const aliasR = {
        rows: observationAliasRows() as unknown as ObservationAliasRow[],
        partial: false,
      };
      const [transR, intentR] = await Promise.all([
        pagedLoad<any>(
          supabase,
          'observation_translations',
          // FIX G1 (DB schema mismatch): observation_translations has columns
          'observation_code, language_code, display_text, description_text',
        ),
        pagedLoad<ObservationIntentRow>(
          supabase,
          'observation_intent_master',
          'intent_code, routing_target, is_active',
          (q) => q.eq('is_active', true),
        ),
      ]);

      anyPartial = masterR.partial || aliasR.partial || transR.partial || intentR.partial;

      const masterByCode = new Map<string, ObservationMasterRow>();
      for (const r of masterR.rows) {
        if (!r?.observation_code) continue;
        masterByCode.set(nLower(r.observation_code), r);
      }

      const aliasByAnyKey = new Map<string, string>();
      for (const r of aliasR.rows) {
        const canonical = String(r?.canonical_code ?? '').trim();
        if (!canonical) continue;
        for (const raw of [r.alias_code, r.alias_normalized, r.alias_text]) {
          const k = nLower(raw);
          if (k && !aliasByAnyKey.has(k)) aliasByAnyKey.set(k, canonical);
        }
      }

      const translationsByCode = new Map<string, ObservationTranslationRow[]>();
      for (const r of transR.rows as any[]) {
        if (!r?.observation_code) continue;
        const k = nLower(r.observation_code);
        let bucket = translationsByCode.get(k);
        if (!bucket) { bucket = []; translationsByCode.set(k, bucket); }
        // FIX G1: map DB columns display_text/description_text into the
        bucket.push({
          observation_code: r.observation_code,
          language_code: r.language_code,
          label: r.display_text ?? null,
          description: r.description_text ?? null,
        });
      }

      const intentByCode = new Map<string, ObservationIntentRow>();
      for (const r of intentR.rows) {
        if (!r?.intent_code) continue;
        intentByCode.set(nUpper(r.intent_code), r);
      }

      // Atomic swap — only replace tables that returned rows (guard against a
      // transient empty response silently wiping the index).
      if (masterByCode.size > 0) state.masterByCode = masterByCode;
      if (aliasByAnyKey.size > 0) state.aliasByAnyKey = aliasByAnyKey;
      if (translationsByCode.size > 0) state.translationsByCode = translationsByCode;
      if (intentByCode.size > 0) state.intentByCode = intentByCode;

      state.stats = {
        master_rows: masterByCode.size,
        alias_rows: aliasByAnyKey.size,
        translation_rows: transR.rows.length,
        intent_rows: intentByCode.size,
        partial: anyPartial,
      };
      state.loadedAt = Date.now();

      console.log(
        `[OBS_INDEX] loaded_ms=${Date.now() - started} master=${masterByCode.size} ` +
          `alias_keys=${aliasByAnyKey.size} translations=${transR.rows.length} intents=${intentByCode.size} ` +
          `partial=${anyPartial}`,
      );
    } catch (e) {
      console.error(`[OBS_INDEX] preload_failed err=${(e as Error).message}`);
    } finally {
      state.loading = null;
    }
  })();

  return state.loading;
}

// SYNC ACCESSORS (read-only, non-authoritative in Phase 2)

export function observationIndexReady(): boolean {
  return state.loadedAt !== null && state.masterByCode.size > 0;
}

export function getObservationMaster(code: string): ObservationMasterRow | null {
  const k = nLower(code);
  if (!k) return null;
  return state.masterByCode.get(k) ?? null;
}

// Resolve any alias variant (upper `alias_code`, normalised, or free `alias_text`)
export function resolveAliasCanonical(anyKey: string): string | null {
  const k = nLower(anyKey);
  if (!k) return null;
  return state.aliasByAnyKey.get(k) ?? null;
}

export function getObservationTranslations(code: string): ObservationTranslationRow[] {
  const k = nLower(code);
  if (!k) return [];
  return state.translationsByCode.get(k) ?? [];
}

export function getObservationTranslation(code: string, languageCode: string): ObservationTranslationRow | null {
  const rows = getObservationTranslations(code);
  if (rows.length === 0) return null;
  const lang = nLower(languageCode);
  return rows.find((r) => nLower(r.language_code) === lang) ?? null;
}

export function getObservationIntent(intentCode: string): ObservationIntentRow | null {
  const k = nUpper(intentCode);
  if (!k) return null;
  return state.intentByCode.get(k) ?? null;
}

export function observationIndexSnapshot() {
  return {
    loadedAt: state.loadedAt,
    ...state.stats,
  };
}

// SHADOW-DIFF API — per-site dual-read compare (Phase 2, 7-day window)

// Compare a legacy per-site DB read against the shared index. Emits
export function observationIndexDiff(
  site: string,
  key: string,
  expected: unknown,
  actual: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!observationIndexReady()) return; // index not warm — skip; nothing to compare
  try {
    const same = deepEqualLite(expected, actual);
    if (same) return;
    const summary = {
      site,
      key: String(key ?? ''),
      expected: summarise(expected),
      actual: summarise(actual),
      ...(extra ?? {}),
    };
    console.warn(`[OBS_INDEX_DIFF] ${JSON.stringify(summary)}`);
  } catch (e) {
    // Diff must never break callers.
    console.warn(`[OBS_INDEX_DIFF_ERR] site=${site} err=${(e as Error).message}`);
  }
}

function summarise(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return { __array_len: v.length, sample: v.slice(0, 3) };
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    // Compress large rows to the identifying keys.
    return {
      observation_code: o.observation_code ?? null,
      canonical_code: o.canonical_code ?? null,
      alias_code: o.alias_code ?? null,
      intent_code: o.intent_code ?? null,
    };
  }
  return String(v);
}

function deepEqualLite(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'string') return nLower(a) === nLower(b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map((x) => nLower(x)).sort();
    const sb = [...b].map((x) => nLower(x)).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a as any), ...Object.keys(b as any)]);
    for (const k of keys) {
      const va = (a as any)[k];
      const vb = (b as any)[k];
      if (!deepEqualLite(va, vb)) return false;
    }
    return true;
  }
  return false;
}

/** Test-only reset. */
export function __resetObservationIndex(): void {
  state.loadedAt = null;
  state.loading = null;
  state.masterByCode = new Map();
  state.aliasByAnyKey = new Map();
  state.translationsByCode = new Map();
  state.intentByCode = new Map();
  state.stats = { master_rows: 0, alias_rows: 0, translation_rows: 0, intent_rows: 0, partial: false };
}
