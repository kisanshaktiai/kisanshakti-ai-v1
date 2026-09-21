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
 *
 * CHANGE LOG
 * 2026-09-21 — RAG PHASE 0 (design v2 S4 + identifier pass):
 *   (1) Topic taxonomy comes from the rag_topics table, not from a list in this
 *       file. The old `topic` field used its own 14 labels (nutrition, pest, …)
 *       which matched none of the 20 rag_topics.code values the search RPCs
 *       filter on, so the topic hint could never reach p_topics. The interpreter
 *       now sees the live codes with their labels and returns `topic_codes`
 *       (validated against the table). loadTopicTaxonomy() is the loader; the
 *       caller passes the list in, the same way it passes corpusCrops.
 *   (2) Identifiers are first-class: `identifiers` carries variety codes,
 *       product, scheme and chemical names. A deterministic extractor finds
 *       code-shaped tokens (letters+digits) in any script's text; the
 *       interpreter adds named identifiers it recognises in the farmer's
 *       language. The union feeds the lexical identifier pass in ragRetrieval.
 *   (3) Crop-specific example phrases removed from the interpreter prompt: the
 *       prompt now states the rule only, in keeping with the rest of this file.
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
  /** rag_topics.code values the question is about (validated; may be empty) */
  topicCodes: string[];
  /** identifiers named in the question: variety codes, product / scheme / chemical names */
  identifiers: string[];
  /** true when the LLM step ran and returned a valid rewrite */
  normalized: boolean;
  latencyMs: number;
}

export interface TopicTaxonomyEntry { code: string; label: string }

const MAX_QUERY_CHARS = 200;
const TIMEOUT_MS = 8000;
const MAX_TOPICS = 3;
const MAX_IDENTIFIERS = 8;
const MAX_IDENTIFIER_CHARS = 40;

const SYSTEM = `You are a translation and search-intent interpreter for an Indian farming
help-desk. The farmer's message may be in any Indian language or script, with
dialect words, mixed English, or spelling mistakes.

Return ONLY a JSON object with these keys and nothing else:
{
  "query_en": string,        // the farmer's question rewritten as a concise ENGLISH
                             // search query (5-20 words) using standard agronomy terms.
                             // Keep any numbers the farmer wrote.
  "language": string,        // ISO-639-1 code of the message language
  "crop": string|null,       // crop common name in English lowercase, or null
  "topic_codes": string[],   // 0-3 codes chosen ONLY from the topic list in the
                             // message, best match first; [] if none fits
  "identifiers": string[]    // names or codes the farmer used for a specific thing:
                             // a crop variety, a product or brand, a chemical, a
                             // scheme, a machine model. Copy each EXACTLY as the
                             // farmer wrote it (same script, same spelling). [] if none.
}
Rules: do not answer the question; do not add facts; do not invent a crop, an
identifier or a topic that the message does not support; keep numbers exactly as
written.`;

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

/**
 * Deterministic identifier extractor. Finds code-shaped tokens: a short letter
 * group joined to a digit group ("AB 1234", "AB-1234", "AB1234", "Abcd-12").
 * Such codes are written in Latin letters and digits inside text of any script,
 * so this is script-agnostic by construction. Bare numbers are not identifiers
 * (they are farmer-supplied quantities and are preserved separately).
 */
const CODE_TOKEN_RE = /(?<![\p{L}\p{M}\p{N}])(?:[A-Z]{2,6}[-\s]?\d{2,6}[A-Z0-9-]*|[A-Za-z]{2,8}-\d{2,6}[A-Za-z0-9-]*|[A-Za-z]{1,6}\d{2,6}[A-Za-z0-9]*)(?![\p{L}\p{M}\p{N}])/gu;

export function extractIdentifiers(text: string): string[] {
  const out = new Set<string>();
  for (const m of latinDigits(text).matchAll(CODE_TOKEN_RE)) {
    const tok = m[0].replace(/\s+/g, ' ').trim();
    if (tok.length >= 3 && tok.length <= MAX_IDENTIFIER_CHARS) out.add(tok);
  }
  return [...out].slice(0, MAX_IDENTIFIERS);
}

function mergeIdentifiers(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list || []) {
      const v = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_IDENTIFIER_CHARS);
      if (v.length < 2) continue;
      const key = v.toLowerCase();
      if (!seen.has(key)) seen.set(key, v);
    }
  }
  return [...seen.values()].slice(0, MAX_IDENTIFIERS);
}

/**
 * The subject taxonomy the search RPCs filter on (rag_topics.code). Loaded from
 * the SSOT table and cached briefly; best-effort — an empty list simply means
 * the interpreter is not asked for topics and retrieval runs unfiltered.
 */
let topicCache: { at: number; v: TopicTaxonomyEntry[] } | null = null;
export async function loadTopicTaxonomy(supabase: any): Promise<TopicTaxonomyEntry[]> {
  if (topicCache && Date.now() - topicCache.at < 300_000) return topicCache.v;
  try {
    const { data } = await supabase.from('rag_topics').select('code, label').eq('is_active', true).order('sort_order');
    const v = ((data || []) as Array<{ code?: string; label?: string }>)
      .filter((t) => t.code && t.label)
      .map((t) => ({ code: String(t.code), label: String(t.label) }));
    topicCache = { at: Date.now(), v };
    return v;
  } catch {
    return topicCache?.v ?? [];
  }
}

export async function normalizeQueryForRetrieval(
  userText: string,
  uiLanguage: string,
  traceId: string,
  corpusCrops?: string[] | null,
  priorFarmerTurns?: string[] | null,
  topics?: TopicTaxonomyEntry[] | null,
): Promise<NormalizedQuery> {
  const t0 = Date.now();
  const original = userText.trim();
  const fallback: NormalizedQuery = {
    query: original.slice(0, MAX_QUERY_CHARS), original, detectedLanguage: null,
    cropHint: null, topicCodes: [], identifiers: extractIdentifiers(original), normalized: false, latencyMs: 0,
  };
  if (!original) return fallback;

  // FIX F5 (RAG audit 2026-09-04): a local-language crop word was normalised to a
  // crop the corpus does not hold, so hundreds of relevant chunks were reported
  // as a corpus gap. When the caller knows which crops the corpus actually holds,
  // tell the interpreter to map a MENTIONED crop to the closest name in that list
  // (still never inventing a crop that was not mentioned). Language-agnostic by
  // design: no example words in any target language — the interpreter is told
  // the rule, and it knows every supported language's crop names itself.
  const cropHintLine = (corpusCrops && corpusCrops.length)
    ? `\nKnown crops in the knowledge base: ${corpusCrops.join(', ')}. If the farmer clearly refers to one of these crops — in any language, script, dialect, spelling, or Latin-script transliteration of a local crop word — set "crop" to the matching English name from this list. Do NOT force an unrelated crop onto the list.`
    : '';

  // Topic taxonomy from rag_topics (S4). Codes with their labels, so the
  // interpreter chooses by meaning; only listed codes are accepted back.
  const topicList = (topics || []).filter((t) => t.code && t.label);
  const topicLine = topicList.length
    ? `\nTopic list (code: label): ${topicList.map((t) => `${t.code}: ${t.label}`).join('; ')}.\nChoose "topic_codes" only from these codes, by the meaning of the farmer's question; leave it empty when none clearly applies.`
    : '';
  const allowedTopics = new Set(topicList.map((t) => t.code));

  // Thread context (added 2026-09-04): a farmer's short reply — a place name, a
  // number, "yes", a detail the assistant just asked for — carries no topic on
  // its own. Without the thread, "my district is X" became "X district farming
  // information" with crop=null and the previous question's crop was lost.
  // The prior farmer turns are CONTEXT ONLY: query_en still expresses what the
  // farmer wants NOW, but resolved against that context (topic + crop carried
  // forward when the current message is a reply to it).
  const priorTurns = (priorFarmerTurns || []).map((s) => (s || '').trim()).filter(Boolean).slice(-2);
  const contextLine = priorTurns.length
    ? `\nPrevious farmer messages in this conversation, oldest first (context only): ${priorTurns.map((s, i) => `(${i + 1}) ${s.slice(0, 300)}`).join(' ')}\nIf the current message is a short reply, a place name, a number, or a detail that answers a follow-up question, interpret it as continuing the previous topic: keep that topic and its crop in "query_en", "crop" and "topic_codes".`
    : '';

  try {
    const { provider, model, apiKey } = getBestAvailableProvider();
    const payload = buildAIRequest(
      provider, model,
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `UI language: ${uiLanguage}${cropHintLine}${topicLine}${contextLine}\nFarmer message: ${original}` },
      ],
      { maxTokens: 300, temperature: 0, useJsonMode: true },
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
    const topicCodes = (Array.isArray(obj.topic_codes) ? obj.topic_codes : [])
      .map((c) => String(c ?? '').trim().toLowerCase())
      .filter((c, i, arr) => allowedTopics.has(c) && arr.indexOf(c) === i)
      .slice(0, MAX_TOPICS);
    const identifiers = mergeIdentifiers(
      extractIdentifiers(original),
      extractIdentifiers(query),
      Array.isArray(obj.identifiers) ? obj.identifiers.map((v) => String(v ?? '')) : [],
    );

    return { query, original, detectedLanguage: lang, cropHint: crop, topicCodes, identifiers, normalized: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    console.warn(`[${traceId}] query normalizer degraded to original text: ${(e as Error).message}`);
    return { ...fallback, latencyMs: Date.now() - t0 };
  }
}

/**
 * Map a crop hint to crops.value using the SSOT table. Best-effort.
 * FIX F5 (RAG audit 2026-09-04): also match crops.local_name, so a
 * local-language crop word the normaliser passes through resolves instead of
 * falling through to an unfiltered retrieval. value/label/local_name are all
 * compared case-insensitively.
 * (local_name is populated per crop in the DB; NULL rows simply don't match.)
 */
export async function resolveCropCode(supabase: any, cropHint: string | null): Promise<string | null> {
  if (!cropHint) return null;
  const needle = cropHint.trim().toLowerCase();
  if (!needle) return null;
  try {
    const { data } = await supabase.from('crops').select('value, label, local_name').eq('is_active', true).limit(500);
    const hit = (data || []).find((c: { value?: string; label?: string; local_name?: string }) =>
      [c.value, c.label, c.local_name].some((v) => typeof v === 'string' && v.toLowerCase() === needle));
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
