/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCEPT BRIDGE — extractor vocabulary → canonical IOM observation codes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CHANGE LOG (newest first):
 *   2026-07-22 — Phase 3b cutover: `bridgeToCropVocab` now uses the shared
 *     observation-index as the authoritative alias resolver when warm.
 *     Legacy per-request `observation_aliases` query is retained ONLY as a
 *     cold-boot fallback (index not yet preloaded). Shadow `[OBS_INDEX_DIFF]`
 *     instrumentation removed.
 *   2026-07-09 04:12 UTC — Wired BIOLOGICAL_SCOPE_CONTRACT (P1). New optional
 *     `cropContext` on `bridgeCodesDb` triggers a post-bridge scope filter
 *     via `runtime/graph-contracts.ts::filterByBiologicalScope`. Cross-crop
 *     organ-specific codes are dropped with [OBS_SCOPE_REJECT] before they
 *     enter GRAPH_TRUTH_BUILT. Backward compatible: no context → no filter.
 *   2026-07-04 — DB-wired v3.0 using public.observation_aliases.
 *
 * Runtime bridge from raw extractor labels into canonical observation
 * codes using the `public.observation_aliases` table as the ONLY source
 * of truth. NO hardcoded crop/stage/symptom/pest/disease mappings.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { filterByBiologicalScope, type CropContext } from '../runtime/graph-contracts.ts';

export interface BridgedObservation {
  raw_code: string;
  canonical_code: string;
  source: 'observation_aliases' | 'identity';
}

/**
 * Resolve a single raw extractor code to its canonical form via
 * `observation_aliases`. Returns identity mapping when no row exists.
 */
export async function bridgeToCropVocab(
  supabase: any,
  cropCode: string | null | undefined,
  code: string,
): Promise<BridgedObservation> {
  const raw = String(code ?? '').trim();
  if (!raw) return { raw_code: raw, canonical_code: raw, source: 'identity' };

  // Phase 3b cutover (2026-07-22): shared observation-index is authoritative
  // when warm. Legacy per-request `observation_aliases` query is only used
  // as a cold-boot fallback.
  try {
    const { observationIndexReady, resolveAliasCanonical } =
      await import('../utils/db-ssot/observation-index.ts');

    if (observationIndexReady()) {
      const canonical = resolveAliasCanonical(raw);
      if (canonical && canonical !== raw) {
        console.log(`[OBSERVATION_BRIDGE] crop=${cropCode ?? 'UNKNOWN'} input=${raw} output=${canonical} source=observation_aliases_index`);
        return { raw_code: raw, canonical_code: canonical, source: 'observation_aliases' };
      }
      return { raw_code: raw, canonical_code: raw, source: 'identity' };
    }

    // Cold-boot fallback path — index not warm yet.
    console.warn(`[OBSERVATION_BRIDGE][COLD_BOOT] index not ready — using legacy DB path input=${raw}`);
    const { data, error } = await supabase
      .from('observation_aliases')
      .select('alias_code, canonical_code, active')
      .eq('active', true)
      .ilike('alias_code', raw)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`[OBSERVATION_BRIDGE][DB_ERROR] crop=${cropCode} input=${raw} error=${error.message}`);
      return { raw_code: raw, canonical_code: raw, source: 'identity' };
    }

    if (data?.canonical_code && data.canonical_code !== raw) {
      console.log(`[OBSERVATION_BRIDGE] crop=${cropCode ?? 'UNKNOWN'} input=${raw} output=${data.canonical_code} source=observation_aliases`);
      return { raw_code: raw, canonical_code: data.canonical_code, source: 'observation_aliases' };
    }

    return { raw_code: raw, canonical_code: raw, source: 'identity' };
  } catch (e) {
    console.warn(`[OBSERVATION_BRIDGE][EXCEPTION] crop=${cropCode} input=${raw} error=${(e as Error).message}`);
    return { raw_code: raw, canonical_code: raw, source: 'identity' };
  }
}

/**
 * Batch bridge. Preserves input order, deduplicates canonical outputs
 * case-insensitively. Emits a single trace line per bridged (non-identity)
 * transformation.
 *
 * When `cropContext` is provided, the BIOLOGICAL_SCOPE_CONTRACT (P1) is
 * applied AFTER bridging: canonical codes scoped to a foreign crop / organ
 * are dropped with [OBS_SCOPE_REJECT]. Universal / generic / current-crop /
 * current-crop-group codes pass through.
 */
export async function bridgeCodesDb(
  supabase: any,
  cropCode: string | null | undefined,
  codes: ReadonlyArray<string>,
  cropContext?: CropContext | null,
): Promise<BridgedObservation[]> {
  if (!Array.isArray(codes) || codes.length === 0) return [];

  const unique: string[] = [];
  const seenRaw = new Set<string>();
  for (const c of codes) {
    if (!c) continue;
    const k = String(c);
    const key = k.toLowerCase();
    if (seenRaw.has(key)) continue;
    seenRaw.add(key);
    unique.push(k);
  }

  // Single round-trip: fetch all aliases matching any raw code (case-insensitive)
  let rows: Array<{ alias_code: string; canonical_code: string }> = [];
  try {
    const { data, error } = await supabase
      .from('observation_aliases')
      .select('alias_code, canonical_code')
      .eq('active', true)
      .in('alias_code', unique.map((c) => c.toUpperCase()));
    if (error) {
      console.warn(`[OBSERVATION_BRIDGE][BATCH_DB_ERROR] crop=${cropCode} error=${error.message}`);
    } else if (Array.isArray(data)) {
      rows = data as any;
    }
  } catch (e) {
    console.warn(`[OBSERVATION_BRIDGE][BATCH_EXCEPTION] crop=${cropCode} error=${(e as Error).message}`);
  }

  // Also try lowercase in a second pass for aliases stored in lowercase
  if (rows.length < unique.length) {
    try {
      const { data } = await supabase
        .from('observation_aliases')
        .select('alias_code, canonical_code')
        .eq('active', true)
        .in('alias_code', unique.map((c) => c.toLowerCase()));
      if (Array.isArray(data)) {
        for (const r of data as any[]) {
          if (!rows.find((x) => x.alias_code.toLowerCase() === r.alias_code.toLowerCase())) {
            rows.push(r);
          }
        }
      }
    } catch { /* noop */ }
  }

  const lookup = new Map<string, string>();
  for (const r of rows) {
    lookup.set(String(r.alias_code).toLowerCase(), String(r.canonical_code));
  }

  const out: BridgedObservation[] = [];
  const seenCanonical = new Set<string>();
  for (const raw of unique) {
    const canonical = lookup.get(raw.toLowerCase()) ?? raw;
    const source: BridgedObservation['source'] =
      canonical !== raw ? 'observation_aliases' : 'identity';
    if (source === 'observation_aliases') {
      console.log(`[OBSERVATION_BRIDGE] crop=${cropCode ?? 'UNKNOWN'} input=${raw} output=${canonical} source=observation_aliases`);
    }
    const canonKey = canonical.toLowerCase();
    if (seenCanonical.has(canonKey)) continue;
    seenCanonical.add(canonKey);
    out.push({ raw_code: raw, canonical_code: canonical, source });
  }

  // BIOLOGICAL_SCOPE_CONTRACT (P1) — drop cross-crop / foreign-organ codes.
  // Backward compatible: no context → skip filtering.
  const effectiveCtx: CropContext | null =
    cropContext ?? (cropCode ? { crop_code: cropCode, crop_group: null } : null);
  if (effectiveCtx && out.length > 0) {
    try {
      const canonicalList = out.map((b) => b.canonical_code);
      const scope = await filterByBiologicalScope(supabase, effectiveCtx, canonicalList);
      if (scope.dropped_cross_crop.length || scope.dropped_unknown.length) {
        const kept = new Set(scope.accepted);
        const before = out.length;
        const filtered = out.filter((b) => kept.has(b.canonical_code));
        console.warn(
          `[CONCEPT_BRIDGE][SCOPE_FILTER] crop=${effectiveCtx.crop_code ?? 'UNKNOWN'} ` +
          `in=${before} out=${filtered.length} ` +
          `dropped_cross_crop=${scope.dropped_cross_crop.length} ` +
          `dropped_unknown=${scope.dropped_unknown.length}`,
        );
        return filtered;
      }
    } catch (e) {
      console.warn(`[CONCEPT_BRIDGE][SCOPE_FILTER][EXCEPTION] error=${(e as Error).message}`);
    }
  }

  return out;
}


/**
 * DEPRECATED — sync pass-through kept for legacy call sites during transition.
 * New code MUST call `bridgeCodesDb`.
 */
export function bridgeCodes(_cropCode: string | null | undefined, codes: string[]): string[] {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of codes) {
    if (!c) continue;
    const key = String(c).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-CANONICAL RESOLVER — intent_observation_mapping as ontology bridge
// ═══════════════════════════════════════════════════════════════════════════
// Extractor + observation_aliases yield generic observation codes.
// Hypothesis conditions are authored against crop-specific canonical
// codes. The equivalence class between the two is curated in
// `intent_observation_mapping`: rows for a given (intent_code, crop_code)
// form the curated evidence class for that intent.
//
// 2026-07-26 (forensic audit F1) — the `.eq('assertion_strength','LITERAL')`
// exclusion was DELETED. It made 13,245 of 13,594 active IOM rows invisible
// to the graph, so any farmer observation curated as DIFFERENTIAL produced
// `anchor=NONE` and zero peers, and the hypothesis conditions (authored
// against crop-specific codes) could never fire. `assertion_strength` is now
// a WEIGHT supplied to `decision/evidence-confidence.ts`, never a filter.
//
// NO hardcoded crop / stage / symptom / pest / disease is added here. The
// ontology stays in the database.
// ═══════════════════════════════════════════════════════════════════════════

import { canonicalObsCode, canonicalIntentCode, canonicalCropCode } from '../utils/canonical-code.ts';
import { scoreEvidenceSet, type EvidenceCandidate } from './evidence-confidence.ts';

export interface CanonicalResolved {
  code: string;
  source: 'input' | 'iom_literal_peer';
  assertion_strength?: string | null;
  confidence_rank?: number | null;
  evidence_confidence?: number;
}

export async function resolveCropCanonicalObservations(
  supabase: any,
  intentCode: string | null | undefined,
  cropCode: string | null | undefined,
  canonicalCodes: ReadonlyArray<string>,
): Promise<CanonicalResolved[]> {
  const inputs: string[] = Array.from(
    new Set((canonicalCodes ?? []).map((c) => canonicalObsCode(c)).filter(Boolean)),
  );
  const out: CanonicalResolved[] = inputs.map((c) => ({ code: c, source: 'input' }));

  const intent = canonicalIntentCode(intentCode);
  const crop = canonicalCropCode(cropCode);
  if (!intent || !crop || crop === 'unknown' || inputs.length === 0) {
    return out;
  }

  try {
    const cropScopes = Array.from(new Set([crop, 'all', 'universal']));
    const { data, error } = await supabase
      .from('intent_observation_mapping')
      .select('observation_code, crop_code, assertion_strength, confidence_rank, is_active')
      .eq('intent_code', intent)
      .in('crop_code', cropScopes)
      .eq('is_active', true)
      .order('confidence_rank', { ascending: true, nullsFirst: false });

    if (error) {
      console.warn(
        `[OBSERVATION_CANONICAL_RESOLVE][DB_ERROR] intent=${intent} crop=${crop} error=${error.message}`,
      );
      return out;
    }

    // Peer class = ALL active rows for the cell, regardless of strength.
    const peerRows = new Map<string, EvidenceCandidate>();
    const strengthCount: Record<string, number> = {};
    for (const row of (data ?? []) as Array<any>) {
      const code = canonicalObsCode(row?.observation_code);
      if (!code) continue;
      const strength = String(row?.assertion_strength ?? 'NONE').toUpperCase();
      strengthCount[strength] = (strengthCount[strength] ?? 0) + 1;
      const prev = peerRows.get(code);
      const rank = typeof row?.confidence_rank === 'number' ? row.confidence_rank : null;
      if (!prev || (rank !== null && (prev.confidence_rank ?? 999) > rank)) {
        peerRows.set(code, {
          observation_code: code,
          assertion_strength: row?.assertion_strength ?? null,
          confidence_rank: rank,
          source: 'INFERRED_PEER',
        });
      }
    }

    console.log(
      `[IOM_EVIDENCE] intent=${intent} crop=${crop} rows=${(data ?? []).length} ` +
      `peers=${peerRows.size} ` +
      Object.entries(strengthCount).map(([k, v]) => `${k.toLowerCase()}=${v}`).join(' ') +
      ' source=intent_observation_mapping',
    );

    if (peerRows.size === 0) {
      console.log(
        `[OBSERVATION_CANONICAL_RESOLVE] intent=${intent} crop=${crop} peers=0 source=intent_observation_mapping`,
      );
      return out;
    }

    const inputSet = new Set(inputs);
    const anchor = inputs.some((c) => peerRows.has(c));
    if (!anchor) {
      console.log(
        `[OBSERVATION_CANONICAL_RESOLVE] intent=${intent} crop=${crop} anchor=NONE ` +
        `inputs=[${inputs.join(',')}] peers=${peerRows.size} source=intent_observation_mapping`,
      );
      return out;
    }

    // Evidence confidence orders the peer injection; it never excludes.
    const scored = scoreEvidenceSet(Array.from(peerRows.values()));
    const injected: string[] = [];
    for (const s of scored) {
      if (inputSet.has(s.observation_code)) continue;
      out.push({
        code: s.observation_code,
        source: 'iom_literal_peer',
        assertion_strength: s.assertion_strength ?? null,
        confidence_rank: s.confidence_rank ?? null,
        evidence_confidence: s.evidence_confidence,
      });
      injected.push(`${s.observation_code}@${s.evidence_confidence.toFixed(2)}`);
    }

    console.log(
      `[OBSERVATION_CANONICAL_RESOLVE] intent=${intent} crop=${crop} inputs=[${inputs.join(',')}] ` +
      `injected=${injected.length} top=[${injected.slice(0, 8).join(',')}] source=intent_observation_mapping`,
    );
    return out;
  } catch (e) {
    console.warn(
      `[OBSERVATION_CANONICAL_RESOLVE][EXCEPTION] intent=${intent} crop=${crop} error=${(e as Error).message}`,
    );
    return out;
  }
}


