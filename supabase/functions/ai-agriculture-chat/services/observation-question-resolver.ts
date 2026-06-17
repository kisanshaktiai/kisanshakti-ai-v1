/**
 * Observation Question Resolver
 * ─────────────────────────────────────────────────────────────────────────────
 * SSOT-driven clarification text for symptom codes.
 *
 * Replaces the near-empty `observation_differential_questions` table with a
 * derivation from the rich, already-populated SSOT tables:
 *   1. observation_translations.description_text  (crop-specific)
 *   2. observation_translations.description_text  (crop_code='ALL')
 *   3. observation_translations.display_text      (same fallback order)
 *   4. intent_translations.question_text          (via intent_observation_mapping)
 *   5. null  → caller falls through to stage advisory
 *
 * No template strings, no `{symptom}` placeholders, no LLM call.
 * 5-minute in-memory cache keyed by `${observation_code}|${language}|${crop}`.
 */

type SupabaseLike = {
  from: (t: string) => any;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: string | null; expires: number }>();

type ResolveSource = 'obs_translations_crop' | 'obs_translations_all' | 'obs_display' | 'intent_question' | 'none';

export interface ResolvedQuestion {
  text: string | null;
  source: ResolveSource;
}

function cacheGet(key: string): ResolvedQuestion | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  // Source is not preserved across cache (only the value matters for safety-gate)
  return { text: hit.value, source: hit.value ? 'obs_translations_crop' : 'none' };
}

function cacheSet(key: string, value: string | null): void {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve a localized clarifying question for a single observation_code.
 */
export async function resolveObservationQuestion(
  supabase: SupabaseLike,
  observation_code: string,
  language: string,
  crop_code: string | null | undefined
): Promise<ResolvedQuestion> {
  const cropUp = (crop_code || '').toUpperCase() || null;
  const key = `${observation_code}|${language}|${cropUp ?? '_'}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // SOURCE 1+2+3: observation_translations
  // CASE-INSENSITIVE LOOKUP (2026-06-17): observation_translations stores
  // observation_code in lowercase canonical form; callers may pass either
  // casing. Query both variants and let the caller key results case-agnostic.
  try {
    const codeVariants = Array.from(new Set([
      observation_code,
      observation_code.toLowerCase(),
      observation_code.toUpperCase(),
    ]));
    const { data: rows } = await supabase
      .from('observation_translations')
      .select('crop_code, description_text, display_text')
      .in('observation_code', codeVariants)
      .eq('language_code', language);

    if (rows && rows.length > 0) {
      // crop-specific description
      const cropRow = cropUp ? rows.find((r: any) => (r.crop_code || '').toUpperCase() === cropUp) : null;
      if (cropRow?.description_text?.trim()) {
        cacheSet(key, cropRow.description_text);
        return { text: cropRow.description_text, source: 'obs_translations_crop' };
      }
      // ALL-crop description
      const allRow = rows.find((r: any) => (r.crop_code || '').toUpperCase() === 'ALL');
      if (allRow?.description_text?.trim()) {
        cacheSet(key, allRow.description_text);
        return { text: allRow.description_text, source: 'obs_translations_all' };
      }
      // any description
      const anyDesc = rows.find((r: any) => r?.description_text?.trim());
      if (anyDesc?.description_text) {
        cacheSet(key, anyDesc.description_text);
        return { text: anyDesc.description_text, source: 'obs_translations_all' };
      }
      // display_text fallback (crop → ALL → any)
      const cropDisp = cropRow?.display_text?.trim() ? cropRow.display_text : null;
      const allDisp = allRow?.display_text?.trim() ? allRow.display_text : null;
      const anyDisp = rows.find((r: any) => r?.display_text?.trim())?.display_text || null;
      const chosen = cropDisp || allDisp || anyDisp;
      if (chosen) {
        cacheSet(key, chosen);
        return { text: chosen, source: 'obs_display' };
      }
    }
  } catch (e) {
    console.warn(`[ObsQuestionResolver] observation_translations lookup failed for ${observation_code}: ${(e as Error).message}`);
  }

  // SOURCE 4: intent_translations via intent_observation_mapping
  try {
    // Post-migration: intent_observation_mapping.observation_code is lowercase canonical.
    // Callers may pass UPPER snake_case (in-memory contract). Normalize at the DB boundary.
    const obsLc = String(observation_code || '').toLowerCase();
    const { data: mapRows } = await supabase
      .from('intent_observation_mapping')
      .select('intent_code, confidence_rank, is_active')
      .eq('observation_code', obsLc)
      .eq('is_active', true)
      .order('confidence_rank', { ascending: true })
      .limit(1);

    const intentCode = mapRows && mapRows[0]?.intent_code;
    if (intentCode) {
      const { data: intentRows } = await supabase
        .from('intent_translations')
        .select('question_text, display_text')
        .eq('intent_code', intentCode)
        .eq('language_code', language)
        .limit(1);
      const qt = intentRows && intentRows[0]?.question_text;
      if (qt && String(qt).trim().length > 0) {
        cacheSet(key, qt);
        return { text: qt, source: 'intent_question' };
      }
    }
  } catch (e) {
    console.warn(`[ObsQuestionResolver] intent_translations lookup failed for ${observation_code}: ${(e as Error).message}`);
  }

  // SOURCE 5: give up — caller falls through to stage advisory
  cacheSet(key, null);
  return { text: null, source: 'none' };
}

/**
 * Batch-resolve multiple symptom codes; returns a lookup map suitable for
 * `SafetyGateInput.differential_questions`. Codes that resolve to null are
 * omitted so the gate stays strict.
 */
export async function buildDifferentialQuestionLookup(
  supabase: SupabaseLike,
  observation_codes: string[],
  language: string,
  crop_code: string | null | undefined
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!observation_codes || observation_codes.length === 0) return out;

  const unique = Array.from(new Set(observation_codes.filter((c) => typeof c === 'string' && c.trim().length > 0)));
  const results = await Promise.all(
    unique.map(async (code) => {
      const r = await resolveObservationQuestion(supabase, code, language, crop_code);
      return { code, ...r };
    })
  );

  const summary: Record<string, number> = {};
  for (const r of results) {
    summary[r.source] = (summary[r.source] || 0) + 1;
    if (r.text) out[r.code] = r.text;
  }
  console.log(`[ObsQuestionResolver] resolved=${unique.length} lang=${language} crop=${crop_code || 'NONE'} sources=${JSON.stringify(summary)}`);

  return out;
}
