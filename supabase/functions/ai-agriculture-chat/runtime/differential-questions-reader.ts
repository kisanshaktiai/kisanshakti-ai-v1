/**
 * Step 1 — DB reader for `public.observation_differential_questions`.
 *
 * This is the ONLY authority for the text of a differential question the
 * runtime shows a farmer when the observation graph has ambiguous evidence.
 *
 * Contract:
 *   - No hardcoded question templates in TypeScript.
 *   - No LLM generation of the question text.
 *   - No agriculture knowledge in this file — it is a pure DB reader with
 *     a deterministic language + crop fallback chain.
 *
 * Schema (verified 2026-07-05):
 *   observation_code TEXT NOT NULL
 *   language         TEXT NOT NULL       -- 'en' | 'hi' | 'mr' | ...
 *   crop_code        TEXT NULL           -- NULL = crop-agnostic default
 *   question_text    TEXT NOT NULL
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';

export interface DifferentialQuestion {
  observation_code: string;
  language: string;
  crop_code: string | null;
  question_text: string;
}

let _cachedClient: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_cachedClient) return _cachedClient;
  _cachedClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  return _cachedClient;
}

/**
 * Resolve a differential question for the given (observation_code, language,
 * crop_code) tuple. Fallback order:
 *
 *   1. exact (obs, lang, crop)
 *   2. crop-agnostic (obs, lang, crop=NULL)
 *   3. exact obs+crop in English
 *   4. crop-agnostic English
 *   5. null (caller must NOT synthesize text)
 *
 * Returns `null` when the graph has no registered question — callers MUST
 * treat that as "no differential question available" rather than fabricate
 * one.
 */
export async function readDifferentialQuestion(
  observation_code: string,
  language: string,
  crop_code?: string | null,
): Promise<DifferentialQuestion | null> {
  if (!observation_code) return null;
  const obs = observation_code.trim();
  const lang = (language || 'en').trim().toLowerCase();
  const crop = (crop_code || '').trim().toUpperCase() || null;

  const supabase = client();

  const tryFetch = async (l: string, c: string | null): Promise<DifferentialQuestion | null> => {
    let q = supabase
      .from('observation_differential_questions')
      .select('observation_code, language, crop_code, question_text')
      .eq('observation_code', obs)
      .eq('language', l)
      .limit(1);
    q = c === null ? q.is('crop_code', null) : q.eq('crop_code', c);
    const { data, error } = await q.maybeSingle();
    if (error) {
      console.warn(
        `[DIFF_QUESTIONS_READER] fetch failed obs=${obs} lang=${l} crop=${c ?? 'NULL'}: ${error.message}`,
      );
      return null;
    }
    return (data as DifferentialQuestion) ?? null;
  };

  // 1. exact language + crop
  if (crop) {
    const r = await tryFetch(lang, crop);
    if (r) return r;
  }
  // 2. exact language, crop-agnostic
  const r2 = await tryFetch(lang, null);
  if (r2) return r2;

  // 3./4. English fallback (only if not already tried)
  if (lang !== 'en') {
    if (crop) {
      const r3 = await tryFetch('en', crop);
      if (r3) return r3;
    }
    const r4 = await tryFetch('en', null);
    if (r4) return r4;
  }

  console.log(
    `[DIFF_QUESTIONS_READER] no row for obs=${obs} lang=${lang} crop=${crop ?? 'NULL'} — caller must NOT synthesize.`,
  );
  return null;
}

/**
 * Batch reader — resolves questions for many observation codes at once,
 * applying the same fallback per code. Returns a Map keyed by observation_code.
 */
export async function readDifferentialQuestions(
  observation_codes: string[],
  language: string,
  crop_code?: string | null,
): Promise<Map<string, DifferentialQuestion>> {
  const out = new Map<string, DifferentialQuestion>();
  const uniq = Array.from(new Set((observation_codes || []).filter(Boolean).map((c) => c.trim())));
  if (uniq.length === 0) return out;

  // One fanned-out fetch keeps latency bounded and avoids leaking per-code
  // retries into hot paths. `readDifferentialQuestion` already logs misses.
  await Promise.all(
    uniq.map(async (code) => {
      const q = await readDifferentialQuestion(code, language, crop_code);
      if (q) out.set(code, q);
    }),
  );
  return out;
}
