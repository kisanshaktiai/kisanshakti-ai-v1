/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DB-DRIVEN TAXONOMIES — biotic / abiotic / weed classification SSOT
 * ═══════════════════════════════════════════════════════════════════════════
 * CHANGE LOG (newest first)
 *   2026-07-29 (Phase 0′ Step 3) — CREATED. Replaces the hardcoded
 *     PEST_EVIDENCE_CODES / PEST_RULE_CATEGORIES / BIOTIC_INDICATORS /
 *     ABIOTIC_CATEGORIES / BIOTIC_OBS_KEYS lists in `agents/orchestrator.ts`
 *     and `decision/symbolic-reasoner.ts`.
 *
 * SOURCES OF TRUTH (no agronomy is written in this file):
 *   observation_master.observation_code + .semantic_class  → observation class
 *   observation_aliases.alias_code → .canonical_code        → alias resolution
 *   decision_rules.biological_group (fallback .category)    → rule class
 *   system_config.taxonomy_*_semantic_classes / *_rule_groups → class buckets
 *
 * CONTRACT:
 *   - Matching is EXACT on canonicalized codes. Never substring `includes()`.
 *   - When the cache is not loaded or a code is unknown, callers MUST degrade
 *     to "no filter" — never substitute another hardcoded list.
 *   - Observability: [TAXONOMY_LOADED], [TAXONOMY_MISS].
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { canonicalObsCode } from './canonical-code.ts';

export type BiologicalClass = 'BIOTIC' | 'ABIOTIC' | 'WEED' | 'UNKNOWN';

const TTL_MS = 10 * 60 * 1000;

interface TaxonomyCache {
  loadedAt: number;
  /** canonical observation_code → semantic_class */
  obsClass: Map<string, string>;
  /** alias_code (canonicalized) → canonical observation_code */
  aliases: Map<string, string>;
  bioticClasses: Set<string>;
  weedClasses: Set<string>;
  abioticClasses: Set<string>;
  bioticGroups: Set<string>;
  weedGroups: Set<string>;
  abioticGroups: Set<string>;
}

let _cache: TaxonomyCache | null = null;
let _inflight: Promise<void> | null = null;

const lower = (s: unknown) => String(s ?? '').trim().toLowerCase();

function jsonArraySet(raw: unknown, fallbackEmpty = true): Set<string> {
  const out = new Set<string>();
  const val = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? (raw as any).value : null);
  if (Array.isArray(val)) for (const v of val) out.add(lower(v));
  if (out.size === 0 && !fallbackEmpty) return out;
  return out;
}

async function pagedSelect(
  supabase: any,
  table: string,
  columns: string,
  filter?: (q: any) => any,
): Promise<any[]> {
  const rows: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** Load (or refresh) the taxonomy cache. Safe to call on every turn. */
export async function loadTaxonomies(supabase: any, force = false): Promise<void> {
  if (!force && _cache && Date.now() - _cache.loadedAt < TTL_MS) return;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const [obsRows, aliasRows, cfgRes] = await Promise.all([
        pagedSelect(supabase, 'observation_master', 'observation_code, semantic_class'),
        pagedSelect(supabase, 'observation_aliases', 'alias_code, canonical_code, active', (q) => q.eq('active', true)),
        supabase.from('system_config').select('config_key, config_value').like('config_key', 'taxonomy_%'),
      ]);

      const obsClass = new Map<string, string>();
      for (const r of obsRows) {
        const code = canonicalObsCode(r.observation_code);
        if (code) obsClass.set(code, lower(r.semantic_class));
      }

      const aliases = new Map<string, string>();
      for (const r of aliasRows) {
        const a = canonicalObsCode(r.alias_code);
        const c = canonicalObsCode(r.canonical_code);
        if (a && c && !aliases.has(a)) aliases.set(a, c);
      }

      const cfg = new Map<string, unknown>();
      for (const r of (cfgRes?.data ?? [])) cfg.set(r.config_key, r.config_value);

      _cache = {
        loadedAt: Date.now(),
        obsClass,
        aliases,
        bioticClasses: jsonArraySet(cfg.get('taxonomy_biotic_semantic_classes')),
        weedClasses: jsonArraySet(cfg.get('taxonomy_weed_semantic_classes')),
        abioticClasses: jsonArraySet(cfg.get('taxonomy_abiotic_semantic_classes')),
        bioticGroups: jsonArraySet(cfg.get('taxonomy_biotic_rule_groups')),
        weedGroups: jsonArraySet(cfg.get('taxonomy_weed_rule_groups')),
        abioticGroups: jsonArraySet(cfg.get('taxonomy_abiotic_rule_groups')),
      };

      console.log(
        `[TAXONOMY_LOADED] observations=${obsClass.size} aliases=${aliases.size} ` +
        `biotic_classes=${_cache.bioticClasses.size} abiotic_classes=${_cache.abioticClasses.size} ` +
        `biotic_groups=${_cache.bioticGroups.size} abiotic_groups=${_cache.abioticGroups.size}`,
      );
    } catch (e) {
      console.error('[TAXONOMY_LOAD_FAILED]', (e as any)?.message || e);
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

export function isTaxonomyLoaded(): boolean {
  return !!_cache && _cache.obsClass.size > 0 &&
    (_cache.bioticClasses.size > 0 || _cache.abioticClasses.size > 0);
}

/** Resolve a raw token to its canonical observation_code via aliases. Null if unknown. */
export function resolveObservationCode(code: unknown): string | null {
  if (!_cache) return null;
  const c = canonicalObsCode(code);
  if (!c) return null;
  if (_cache.obsClass.has(c)) return c;
  const viaAlias = _cache.aliases.get(c);
  if (viaAlias && _cache.obsClass.has(viaAlias)) return viaAlias;
  return null;
}

/** semantic_class of an observation (after alias resolution). Null if unknown. */
export function observationSemanticClass(code: unknown): string | null {
  const resolved = resolveObservationCode(code);
  if (!resolved) {
    if (_cache) console.warn(`[TAXONOMY_MISS] observation=${canonicalObsCode(code)}`);
    return null;
  }
  return _cache!.obsClass.get(resolved) ?? null;
}

export function isBioticObservation(code: unknown): boolean {
  const sc = observationSemanticClass(code);
  return !!sc && !!_cache && _cache.bioticClasses.has(sc);
}

export function isWeedObservation(code: unknown): boolean {
  const sc = observationSemanticClass(code);
  return !!sc && !!_cache && _cache.weedClasses.has(sc);
}

export function isAbioticObservation(code: unknown): boolean {
  const sc = observationSemanticClass(code);
  return !!sc && !!_cache && _cache.abioticClasses.has(sc);
}

/** Class of a decision rule: biological_group first, category only as fallback. */
export function ruleBiologicalClass(rule: any): BiologicalClass {
  if (!_cache) return 'UNKNOWN';
  const candidates = [rule?.biological_group, rule?.category]
    .map(lower)
    .filter(Boolean);
  for (const v of candidates) {
    if (_cache.bioticGroups.has(v)) return 'BIOTIC';
    if (_cache.weedGroups.has(v)) return 'WEED';
    if (_cache.abioticGroups.has(v)) return 'ABIOTIC';
  }
  if (candidates.length > 0) {
    console.warn(`[TAXONOMY_MISS] rule=${rule?.rule_id ?? rule?.id ?? '?'} group=${candidates[0]}`);
  }
  return 'UNKNOWN';
}

export function isBioticRule(rule: any): boolean {
  return ruleBiologicalClass(rule) === 'BIOTIC';
}

export function isAbioticRule(rule: any): boolean {
  return ruleBiologicalClass(rule) === 'ABIOTIC';
}

/** Convenience: does any observation in the list resolve to a biotic class? */
export function hasBioticEvidence(observations: ReadonlyArray<unknown> | null | undefined): boolean {
  if (!isTaxonomyLoaded()) return false;
  return (observations ?? []).some((o) => isBioticObservation(o));
}

/** Convenience: the biotic subset of a list of raw observation tokens. */
export function bioticObservations(observations: ReadonlyArray<unknown> | null | undefined): string[] {
  if (!isTaxonomyLoaded()) return [];
  return (observations ?? [])
    .filter((o) => isBioticObservation(o))
    .map((o) => String(o));
}
