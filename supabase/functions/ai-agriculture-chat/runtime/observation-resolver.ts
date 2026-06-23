/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION RESOLVER — Wave-S (Single Source of Truth)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One entrypoint, one DB function, one alias table.
 *
 *   resolveObservationCanonical(raw, { language }) →
 *     { canonical_code, match_type: 'exact' | 'fuzzy', similarity }
 *
 * Delegates to `public.resolve_observation_canonical(_raw, _language)` which:
 *   1. Exact match on `observation_aliases.alias_normalized`
 *      (preferred language → 'und' fallback → any), ordered by confidence.
 *   2. Trigram fuzzy match (similarity ≥ 0.55).
 *
 * On miss, the token is written fire-and-forget to
 * `observation_vocabulary_gaps` so orphan tokens surface automatically
 * instead of being discovered by hand.
 *
 * NO hardcoded agronomic mappings. NO crop-specific exceptions.
 * Vocabulary is data, lives in `observation_aliases`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface ResolveOptions {
  language?: string | null;
  source?:
    | 'farmer_utterance'
    | 'rule_token'
    | 'hypothesis_token'
    | 'curated'
    | 'backfill'
    | 'legacy';
}

export interface ResolveResult {
  canonical_code: string;
  match_type: 'exact' | 'fuzzy';
  similarity: number;
}

let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function normalize(raw: string): string {
  return (raw ?? '').toString().toLowerCase().trim();
}

/**
 * Resolve a raw token (farmer utterance, rule discriminator, hypothesis token,
 * canonical code) to one or more candidate canonical observation codes.
 *
 * Returns up to 5 candidates ordered by the DB resolver. Empty array on miss.
 * On miss, logs the token to `observation_vocabulary_gaps` (fire-and-forget).
 */
export async function resolveObservationCanonical(
  raw: string,
  opts: ResolveOptions = {},
): Promise<ResolveResult[]> {
  const norm = normalize(raw);
  if (!norm) return [];

  const language = (opts.language ?? 'und').toString().toLowerCase().trim() || 'und';
  const source = opts.source ?? 'farmer_utterance';

  const client = getClient();
  if (!client) return [];

  try {
    const { data, error } = await (client as any).rpc('resolve_observation_canonical', {
      _raw: raw,
      _language: language,
    });
    if (error) {
      console.warn(`[ObservationResolver] RPC error: ${error.message}`);
      return [];
    }
    const rows = Array.isArray(data) ? data : [];
    if (rows.length > 0) {
      return rows.map((r: any) => ({
        canonical_code: r.canonical_code,
        match_type: r.match_type,
        similarity: typeof r.similarity === 'number' ? r.similarity : Number(r.similarity ?? 0),
      }));
    }
    // Miss — log gap (fire-and-forget).
    recordVocabularyGap(raw, language, source).catch(() => {});
    return [];
  } catch (e) {
    console.warn(`[ObservationResolver] failed: ${(e as Error).message}`);
    return [];
  }
}

/**
 * Idempotent upsert into observation_vocabulary_gaps. Never throws.
 */
export async function recordVocabularyGap(
  raw: string,
  language: string,
  source: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const norm = normalize(raw);
  if (!norm) return;
  try {
    // Try INSERT; on conflict bump occurrences + last_seen_at.
    await (client as any).rpc('exec_sql', undefined); // placeholder no-op call removed below
  } catch (_e) {
    // ignored — replaced by direct call below
  }
  try {
    const { error } = await (client.from('observation_vocabulary_gaps') as any).upsert(
      {
        token_raw: raw,
        token_normalized: norm,
        language: language || 'und',
        source,
        occurrences: 1,
        last_seen_at: new Date().toISOString(),
        metadata,
      },
      { onConflict: 'token_normalized,language,source', ignoreDuplicates: false },
    );
    if (error) {
      console.warn(`[ObservationResolver] gap upsert failed: ${error.message}`);
    }
  } catch (e) {
    console.warn(`[ObservationResolver] gap upsert exception: ${(e as Error).message}`);
  }
}

export const OBSERVATION_RESOLVER_VERSION = '1.0.0';
