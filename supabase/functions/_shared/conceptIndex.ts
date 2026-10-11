// REPO: kisanshaktiai/kisanshakti-ai-v1 (farmer app)  BRANCH: decision-brain-update  (NEW FILE)
// PATH: supabase/functions/_shared/conceptIndex.ts
//
// CHANGE LOG
// 2026-10-11 — Decision Brain target flow step 1: the shared reader of the concept index.
//   Used by ai-agriculture-chat (agents/concept-retriever.ts, shadow mode) and by the
//   brain-concept-indexer edge function (search / eval actions), so both call
//   RPC brain_concept_search() the same way and store candidates in the same shape.
//   No farmer word, crop, stage or model name appears here: the script class comes from
//   Unicode script properties; the model key comes from the caller (embedForTask result).

/** Writing system of a text: 'latin' (English or romanized), 'native' (any non-Latin script), 'mixed', 'none'. */
export type ScriptClass = 'native' | 'latin' | 'mixed' | 'none';

export function classifyScript(text: string): ScriptClass {
  let latin = 0;
  let other = 0;
  for (const ch of String(text ?? '')) {
    if (!/\p{L}/u.test(ch)) continue;
    if (/\p{Script=Latin}/u.test(ch)) latin++;
    else other++;
  }
  const total = latin + other;
  if (total === 0) return 'none';
  if (latin / total >= 0.8) return 'latin';
  if (other / total >= 0.8) return 'native';
  return 'mixed';
}

/** The chat's own chip marker ([obs_keys:…]) is protocol, not farmer text; it is removed before search. */
export function conceptQueryText(text: string, maxChars = 1000): string {
  return String(text ?? '')
    .replace(/\[obs_keys:[^\]]*\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

/** One row of brain_concept_search(), in the compact shape stored in brain_concept_shadow_log.candidates. */
export interface ConceptCandidate {
  kind: 'observation' | 'intent';
  code: string;
  rrf: number;
  sem_rank: number | null;
  sem_score: number | null;
  sem_text: string | null;
  lex_rank: number | null;
  lex_score: number | null;
  lex_text: string | null;
  farmer_observable: boolean | null;
  category: string | null;
}

// deno-lint-ignore no-explicit-any
export function toConceptCandidate(r: any): ConceptCandidate {
  const num = (x: unknown) => (x === null || x === undefined || Number.isNaN(Number(x)) ? null : Number(x));
  return {
    kind: r?.concept_kind === 'intent' ? 'intent' : 'observation',
    code: String(r?.concept_code ?? ''),
    rrf: Number(r?.rrf ?? 0),
    sem_rank: num(r?.sem_rank),
    sem_score: num(r?.sem_score),
    sem_text: r?.sem_text ?? null,
    lex_rank: num(r?.lex_rank),
    lex_score: num(r?.lex_score),
    lex_text: r?.lex_text ?? null,
    farmer_observable: typeof r?.is_farmer_observable === 'boolean' ? r.is_farmer_observable : null,
    category: r?.category ?? null,
  };
}

/**
 * Hybrid search of the concept index. `vector` must come from model `modelKey` (only rows embedded
 * by that model take part in the meaning leg); pass vector null for the spelling leg alone.
 */
export async function searchConceptIndex(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  queryText: string,
  vector: number[] | null,
  modelKey: string | null,
  opts: { limit?: number; kinds?: Array<'observation' | 'intent'> | null } = {},
): Promise<{ ok: true; candidates: ConceptCandidate[]; ms: number } | { ok: false; error: string; ms: number }> {
  const t0 = Date.now();
  try {
    const { data, error } = await supabase.rpc('brain_concept_search', {
      p_query_text: queryText,
      p_query_embedding: vector ? JSON.stringify(vector) : null,
      p_model: modelKey ?? '',
      p_kinds: opts.kinds && opts.kinds.length ? opts.kinds : null,
      p_limit: opts.limit ?? 20,
    });
    if (error) return { ok: false, error: String(error.message ?? error).slice(0, 300), ms: Date.now() - t0 };
    return { ok: true, candidates: Array.isArray(data) ? data.map(toConceptCandidate) : [], ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300), ms: Date.now() - t0 };
  }
}
