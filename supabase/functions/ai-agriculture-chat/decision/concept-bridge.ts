/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCEPT BRIDGE — extractor vocabulary → canonical IOM observation codes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * v3.0 — 2026-07-04 (DB-wired)
 *
 * Runtime bridge from raw extractor labels (e.g. POOR_GERMINATION) into
 * canonical observation codes (e.g. obs_rice_no_emergence) using the
 * `public.observation_aliases` table as the ONLY source of truth.
 *
 * NO hardcoded crop/stage/symptom/pest/disease mappings live here. Adding a
 * new bridge = inserting a row in `observation_aliases`, not editing code.
 *
 * Table columns used:
 *     alias_code       (text) - lookup key (case-insensitive)
 *     canonical_code   (text) - target canonical observation code
 *     source           (text) - provenance label
 *     active           (bool) - only active rows participate
 *
 * NOTE: `observation_aliases` currently has no `crop_code` column. The
 * `cropCode` parameter is threaded through the API for future crop-scoped
 * curation and for forensic traces; it is NOT used to fabricate mappings
 * in code.
 * ═══════════════════════════════════════════════════════════════════════════
 */

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

  try {
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
 */
export async function bridgeCodesDb(
  supabase: any,
  cropCode: string | null | undefined,
  codes: ReadonlyArray<string>,
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
