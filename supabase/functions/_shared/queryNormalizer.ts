/**
 * queryNormalizer.ts — understand the farmer's question BEFORE retrieval.
 *
 * WHY: the RAG corpus is English (rag_documents.language='en'); pgroonga full-text
 * on a Marathi/Hindi question returns 0 rows (verified live 2026-08-24). The LLM
 * is used here strictly as an INTERPRETER (master prompt: LLM = language layer,
 * never agronomic authority): it rewrites the question into an English search
 * query and extracts hints. It produces NO facts, NO numbers, NO advice.
 *
 * Deterministic guarantees:
 *  - Any failure ⇒ { query: originalText } (retrieval proceeds as before).
 *  - Output is validated: query non-empty, ≤ 200 chars; hints are short tokens.
 *  - Numbers in the original question are preserved in the normalised query so
 *    the numeric fidelity gate still treats them as farmer-supplied.
 */

import { getBestAvailableProvider, buildAIRequest, getAPIEndpoint } from './aiConfig.ts';

export interface NormalizedQuery {
  /** English retrieval query (falls back to original text) */
  query: string;
  /** original farmer text, untouched */
  original: string;
  /** ISO-639-1 guess of the question language ('mr','hi','en',...) or null */
  detectedLanguage: string | null;
  /** crop mentioned, English common name lowercase, or null */
  cropHint: string | null;
  /** short topic label: nutrition|pest|disease|weed|irrigation|seed|variety|scheme|market|weather|soil|harvest|livestock|other */
  topic: string | null;
  /** true when the LLM step ran and returned a valid rewrite */
  normalized: boolean;
  latencyMs: number;
}

const MAX_QUERY_CHARS = 200;
const TIMEOUT_MS = 8000;
const TOPICS = new Set([
  'nutrition', 'pest', 'disease', 'weed', 'irrigation', 'seed', 'variety', 'scheme',
  'market', 'weather', 'soil', 'harvest', 'livestock', 'other',
]);

const SYSTEM = `You are a translation and search-intent interpreter for an Indian farming
help-desk. The farmer's message may be in any Indian language or script, with
dialect words, mixed English, or spelling mistakes.

Return ONLY a JSON object with these keys and nothing else:
{
  "query_en": string,        // the farmer's question rewritten as a concise ENGLISH
                             // search query (5-20 words) using standard agronomy terms
                             // (e.g. "soybean seed rate spacing sowing", "rice urea top
                             // dressing tillering dose"). Keep any numbers the farmer wrote.
  "language": string,        // ISO-639-1 code of the message language, e.g. "mr","hi","en"
  "crop": string|null,       // crop common name in English lowercase, or null
  "topic": string            // one of: nutrition, pest, disease, weed, irrigation, seed,
                             // variety, scheme, market, weather, soil, harvest, livestock, other
}
Rules: do not answer the question; do not add facts; do not invent a crop that was
not mentioned; keep numbers exactly as written.`;

function latinDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)));
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export async function normalizeQueryForRetrieval(
  userText: string,
  uiLanguage: string,
  traceId: string,
): Promise<NormalizedQuery> {
  const t0 = Date.now();
  const original = userText.trim();
  const fallback: NormalizedQuery = {
    query: original.slice(0, MAX_QUERY_CHARS), original, detectedLanguage: null,
    cropHint: null, topic: null, normalized: false, latencyMs: 0,
  };
  if (!original) return fallback;

  try {
    const { provider, model, apiKey } = getBestAvailableProvider();
    const payload = buildAIRequest(
      provider, model,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `UI language: ${uiLanguage}\nFarmer message: ${original}` },
      ],
      { maxTokens: 200, temperature: 0, useJsonMode: true },
    );
    if (provider === 'openai') payload.response_format = { type: 'json_object' };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let raw = '';
    try {
      const res = await fetch(getAPIEndpoint(provider), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`NORMALIZER_HTTP_${res.status}`);
      const json = await res.json();
      raw = (json?.choices?.[0]?.message?.content || '').toString();
    } finally {
      clearTimeout(t);
    }

    const obj = extractJson(raw);
    if (!obj) throw new Error('NORMALIZER_BAD_JSON');

    let query = String(obj.query_en ?? '').replace(/\s+/g, ' ').trim();
    if (!query || query.length > MAX_QUERY_CHARS * 2) throw new Error('NORMALIZER_EMPTY_QUERY');
    query = query.slice(0, MAX_QUERY_CHARS);

    // Guarantee: every number the farmer wrote survives in the query (fidelity gate input).
    const origNums = latinDigits(original).match(/\d+(?:[.,]\d+)?/g) || [];
    const qNums = new Set(latinDigits(query).match(/\d+(?:[.,]\d+)?/g) || []);
    const missing = origNums.filter((n) => !qNums.has(n));
    if (missing.length) query = `${query} ${missing.join(' ')}`.slice(0, MAX_QUERY_CHARS);

    const lang = typeof obj.language === 'string' && /^[a-z]{2}$/.test(obj.language) ? obj.language : null;
    const crop = typeof obj.crop === 'string' && obj.crop.trim() ? obj.crop.trim().toLowerCase().slice(0, 40) : null;
    const topicRaw = typeof obj.topic === 'string' ? obj.topic.trim().toLowerCase() : '';
    const topic = TOPICS.has(topicRaw) ? topicRaw : null;

    return { query, original, detectedLanguage: lang, cropHint: crop, topic, normalized: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.warn(`[${traceId}] query normalizer degraded to original text: ${(e as Error).message}`);
    return { ...fallback, latencyMs: Date.now() - t0 };
  }
}

/** Map a crop hint (English common name) to crops.value using the SSOT table. Best-effort. */
export async function resolveCropCode(supabase: any, cropHint: string | null): Promise<string | null> {
  if (!cropHint) return null;
  try {
    const { data } = await supabase.from('crops').select('value, label').eq('is_active', true).limit(500);
    const hit = (data || []).find((c: { value?: string; label?: string }) =>
      [c.value, c.label].some((v) => typeof v === 'string' && v.toLowerCase() === cropHint));
    return hit?.value ? String(hit.value) : null;
  } catch {
    return null;
  }
}

/** Map a state name (user_profiles.state, free text) to states.code. Best-effort. */
export async function resolveStateCode(supabase: any, stateName: string | null | undefined): Promise<string | null> {
  const s = (stateName || '').trim();
  if (!s) return null;
  if (/^[A-Z]{2}$/.test(s)) return s;
  try {
    const { data } = await supabase.from('states').select('code').ilike('name', s).limit(1).maybeSingle();
    return data?.code ? String(data.code) : null;
  } catch {
    return null;
  }
}
