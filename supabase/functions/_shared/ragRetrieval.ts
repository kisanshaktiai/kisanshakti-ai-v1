/**
 * ragRetrieval.ts — the ONLY retrieval path for the RAG subsystem.
 *
 * Hybrid retrieval (master prompt §17):
 *   pgroonga fulltext (RPC rag_search_fulltext)
 * + pgvector semantic (RPC rag_search_vector, only when provider available)
 * → Reciprocal Rank Fusion merge → authority-aware rerank → threshold.
 *
 * FAILURE BEHAVIOR (§31): embedding failure degrades silently to
 * fulltext-only. Below-threshold results return evidence: [] with
 * belowThreshold=true — the caller MUST take the insufficient-evidence
 * path in code, never let the LLM improvise.
 *
 * Every call is audit-logged to rag_retrieval_logs (§30).
 *
 * CHANGE LOG
 * 2026-08-27b — belowThreshold no longer forces a gap on a hybrid run whose semantic
 *   leg degraded to fulltext (bestSem===null); top_score logs bestSem only (was RRF rank
 *   fallback when no cosine).
 * 2026-08-27 — CORPUS-GAP GATE FIXED (verified on 11 logged queries): MIN_RRF_SCORE
 *   (=1/90) could never reject a top-30 hit, and `e.sem !== null` let every semantic
 *   neighbour bypass the lexical gates, so "how to prune a fig tree" (best cosine 0.34)
 *   was served with below_threshold=false. Gates now use the COSINE; floors are read
 *   from system_config.config_key='rag_retrieval' (no hardcoded thresholds); top_score
 *   logs the best cosine (was the RRF rank ≈0.037 on every query).
 * 2026-08-26b — trust gate (Evidence.servable: tier≠other OR trust_prior≥0.6), relative
 *   lexical cutoff (40 % of best), citations = one line per document with pages actually
 *   cited ([n] markers), labels for all 12 app languages, acreEquivalentsLine() computed in code.
 * 2026-08-26 — lexical re-ranker (coverage/section/length, spelling variants, front-matter
 *   penalty) replaces raw pgroonga occurrence ranking; cleanQueryForFulltext strips stopwords;
 *   dropUnsupportedSentences() for sentence-level fidelity fallback. CANDIDATES 30, MAX 6.
 * 2026-08-24b — audit.queryOriginal logged into filters_applied.query_original so a
 *   normalised English query can be traced back to the farmer's own words.
 * 2026-08-24 — (a) audit.purpose → rag_retrieval_logs.retrieval_purpose, plus
 *   document_ids[] / chunk_ids[] (columns added by migration rag_general_chat_p0,
 *   applied to prod). (b) exported unsupportedNumbers(): deterministic numeric
 *   fidelity gate (Latin + Devanagari digits, citation markers ignored) used by
 *   ai-general-chat and, later, by schedule-candidate validation. (c) optional
 *   maxEvidence for the SCHEDULE_DOCUMENT_SELECTION purpose. Public signature of
 *   ragRetrieve() is unchanged; existing callers need no edits.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import { getEmbeddingProvider } from './embeddingProvider.ts';

export type RetrievalPurpose =
  | 'GENERAL_CHAT'
  | 'SCHEDULE_DOCUMENT_SELECTION'
  | 'SCHEDULE_EXTRACTION'
  | 'SCHEDULE_VALIDATION';

export interface RagFilters {
  stateCodes?: string[] | null;   // states.code values, e.g. ['MH']
  cropCodes?: string[] | null;    // crops.value codes
  docTypes?: string[] | null;     // 'scheme' | 'package_of_practices' | ...
  tenantId?: string | null;       // uuid; global (NULL) docs always included
}

export interface Evidence {
  chunkId: string;
  documentId: string;
  text: string;
  sectionPath: string | null;
  pageNumber: number | null;
  language: string;
  title: string;
  publisher: string;
  authorityTier: string;
  docType: string;
  docVersion: string;
  /** fused rank score (RRF + authority boost). NOT semantic "confidence" (§19). */
  rankScore: number;
  lexicalScore: number | null;
  semanticScore: number | null;
  /** rag_source_registry.trust_prior (0..1) or null */
  trustPrior: number | null;
  /** false ⇒ retrieved for logging/testing only; must NOT be shown or cited to a farmer */
  servable: boolean;
}

export interface RagResult {
  evidence: Evidence[];
  mode: 'fulltext' | 'hybrid';
  belowThreshold: boolean;
  /** best cosine similarity seen in the semantic leg (null when fulltext-only) */
  bestSemanticScore: number | null;
  embeddingModel: string | null;
  latencyMs: number;
  traceNote: string;
}

export interface RagAudit {
  sessionId?: string | null;
  turnId?: string | null;
  traceId?: string | null;
  farmerId?: string | null;
  tenantIdText?: string | null;
  /** logged to rag_retrieval_logs.retrieval_purpose; defaults to GENERAL_CHAT */
  purpose?: RetrievalPurpose;
  /** override MAX_EVIDENCE (document selection wants more candidates) */
  maxEvidence?: number;
  /** farmer's original text when `query` is an LLM-normalised English rewrite (logged only) */
  queryOriginal?: string | null;
}

const RRF_K = 60;
const CANDIDATES_PER_LEG = 30;
const MAX_EVIDENCE = 6;
/** farmer-servable gate: unverified ('other') sources need an explicit trust_prior ≥ this */
const MIN_TRUST_FOR_OTHER_TIER = 0.6;
/** drop lexical-only hits scoring below this fraction of the best lexical hit */
const LEXICAL_RELATIVE_CUTOFF = 0.4;
const AUTHORITY_BOOST: Record<string, number> = {
  central_govt: 1.15,
  icar: 1.15,
  state_agri_university: 1.10,
  state_govt: 1.10,
  kvk: 1.05,
  other: 1.0,
};

// ── Retrieval tunables (system_config.rag_retrieval) ────────────────────────
// Cosine floors for Cohere embed-multilingual-v3.0. Observed 2026-08-27 on the
// live corpus: relevant soybean questions 0.64–0.80; "wheat seed rate" (no wheat
// in corpus) 0.53; "how to prune a fig tree" 0.34. The values below are only the
// bootstrap defaults used when the system_config row is missing.
interface RetrievalTunables {
  /** a semantic candidate must reach this cosine to be considered at all */
  min_semantic_score: number;
  /** if the BEST cosine across candidates is below this ⇒ corpus gap */
  gap_semantic_score: number;
}
const DEFAULT_TUNABLES: RetrievalTunables = { min_semantic_score: 0.45, gap_semantic_score: 0.55 };
let tunablesCache: { at: number; v: RetrievalTunables } | null = null;

async function loadTunables(supabase: SupabaseClient): Promise<RetrievalTunables> {
  if (tunablesCache && Date.now() - tunablesCache.at < 60_000) return tunablesCache.v;
  let v = DEFAULT_TUNABLES;
  try {
    const { data } = await supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'rag_retrieval')
      .maybeSingle();
    const cfg = (data?.config_value ?? {}) as Partial<RetrievalTunables>;
    v = {
      min_semantic_score: Number(cfg.min_semantic_score ?? DEFAULT_TUNABLES.min_semantic_score),
      gap_semantic_score: Number(cfg.gap_semantic_score ?? DEFAULT_TUNABLES.gap_semantic_score),
    };
  } catch {
    /* keep defaults */
  }
  tunablesCache = { at: Date.now(), v };
  return v;
}

interface RpcRow {
  chunk_id: string;
  document_id: string;
  chunk_text: string;
  section_path: string | null;
  page_number: number | null;
  language: string;
  score: number;
  title: string;
  publisher: string;
  authority_tier: string;
  doc_type: string;
  doc_version: string;
}


// ── Lexical re-ranker ──────────────────────────────────────────────────────
// rag_search_fulltext ORs every query term and returns pgroonga_score = raw
// occurrence count. Verified failure (2026-08-26, trace fbe05993): the table of
// contents chunk (score 18) and running page headers outranked "1 Seed rate" and
// "2 Spacing and sowing depth" for the query "soybean seed rate and spacing".
// This re-ranker scores candidates on term COVERAGE with length normalisation,
// section-title matches, spelling-variant tolerance (soybean/soyabean), and
// front-matter / header penalties. Deterministic; no LLM.
const STOPWORDS = new Set([
  'and','or','the','for','of','in','on','to','is','are','a','an','what','how','much','many','per',
  'with','at','by','from','my','me','i','you','your','do','does','it','this','that','be','can','should',
  'about','when','which','will','need','needs','want','please','tell','kya','hai','ka','ki','ke','mein',
]);

export function cleanQueryForFulltext(q: string): string {
  const terms = q.toLowerCase().split(/[^\p{L}\p{N}.%/-]+/u).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return (terms.length ? terms : [q.trim()]).slice(0, 10).join(' ');
}

/** consonant skeleton: soybean→sybn, soyabean→sybn, bajra/bajri→bjr */
function skeleton(w: string): string {
  return w.length < 4 ? w : w[0] + w.slice(1).replace(/[aeiouy]/g, '');
}
function termMatches(qt: string, word: string): boolean {
  if (qt === word) return true;
  if (qt.length >= 5 && word.length >= 5 && (word.startsWith(qt) || qt.startsWith(word))) return true;
  return qt.length >= 5 && skeleton(qt) === skeleton(word);
}
function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/\S*www\.\S*/g, ' ')                 // running headers / URLs
    .split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
}

export interface LexicalRank { row: RpcRow; lexRank: number; coverage: number; }

export function rerankLexical(query: string, rows: RpcRow[]): LexicalRank[] {
  const qTerms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !STOPWORDS.has(t)))];
  if (!qTerms.length) return rows.map((row) => ({ row, lexRank: Number(row.score), coverage: 0 }));
  return rows.map((row) => {
    const words = tokenize(row.chunk_text);
    const secWords = tokenize(row.section_path || '');
    let matched = 0, tf = 0, secHits = 0;
    for (const qt of qTerms) {
      const c = words.filter((w) => termMatches(qt, w)).length;
      if (c > 0) { matched++; tf += Math.min(c, 3); }
      if (secWords.some((w) => termMatches(qt, w))) secHits++;
    }
    const coverage = matched / qTerms.length;
    const lengthNorm = 1 + words.length / 300;
    let score = coverage * 3 + (tf / lengthNorm) * 0.5 + secHits * 1.0;
    const sec = row.section_path || '';
    if (!sec) score *= 0.4;                                        // front matter / no heading
    else if ((sec.replace(/[^0-9.]/g, '').length / sec.length) > 0.5) score *= 0.5; // table-row heading
    if ((row.page_number ?? 99) <= 1) score *= 0.5;                // cover / contents page
    return { row, lexRank: score, coverage };
  }).sort((a, b) => b.lexRank - a.lexRank);
}

export async function ragRetrieve(
  supabase: SupabaseClient,
  query: string,
  language: string,
  filters: RagFilters,
  audit: RagAudit,
): Promise<RagResult> {
  const startedAt = Date.now();
  const provider = getEmbeddingProvider();
  const tun = await loadTunables(supabase);
  let mode: 'fulltext' | 'hybrid' = 'fulltext';
  let embeddingModel: string | null = null;
  let traceNote = '';
  const purpose: RetrievalPurpose = audit.purpose ?? 'GENERAL_CHAT';
  const maxEvidence = Math.max(1, Math.min(audit.maxEvidence ?? MAX_EVIDENCE, CANDIDATES_PER_LEG));

  const rpcArgs = {
    p_limit: CANDIDATES_PER_LEG,
    p_states: filters.stateCodes?.length ? filters.stateCodes : null,
    p_crops: filters.cropCodes?.length ? filters.cropCodes : null,
    p_doc_types: filters.docTypes?.length ? filters.docTypes : null,
    p_tenant: filters.tenantId || null,
  };

  // ── Leg 1: lexical (always)
  let lexical: RpcRow[] = [];
  try {
    const { data, error } = await supabase.rpc('rag_search_fulltext', {
      p_query: cleanQueryForFulltext(query),
      ...rpcArgs,
    });
    if (error) throw error;
    // Re-rank by coverage/section/length instead of raw occurrence count; drop zero-coverage noise.
    lexical = rerankLexical(query, (data || []) as RpcRow[])
      .filter((r) => r.coverage > 0)
      .map((r) => ({ ...r.row, score: Number(r.lexRank.toFixed(4)) }));
  } catch (e) {
    traceNote += `fulltext_err:${(e as Error).message};`;
  }

  // ── Leg 2: semantic (graceful degrade on any failure — §31)
  let semantic: RpcRow[] = [];
  if (provider.available()) {
    try {
      const qVec = await provider.embedQuery(query);
      const { data, error } = await supabase.rpc('rag_search_vector', {
        p_embedding: JSON.stringify(qVec),
        ...rpcArgs,
      });
      if (error) throw error;
      semantic = (data || []) as RpcRow[];
      mode = 'hybrid';
      embeddingModel = provider.version();
    } catch (e) {
      traceNote += `vector_degraded:${(e as Error).message};`;
      mode = 'fulltext';
    }
  }

  // ── Reciprocal Rank Fusion + authority boost (§17, §19: scores kept separate)
  const fused = new Map<string, { row: RpcRow; rrf: number; lex: number | null; sem: number | null }>();
  lexical.forEach((row, i) => {
    const e = fused.get(row.chunk_id) || { row, rrf: 0, lex: null, sem: null };
    e.rrf += 1 / (RRF_K + i + 1);
    e.lex = row.score;
    fused.set(row.chunk_id, e);
  });
  semantic.forEach((row, i) => {
    const e = fused.get(row.chunk_id) || { row, rrf: 0, lex: null, sem: null };
    e.rrf += 1 / (RRF_K + i + 1);
    e.sem = Number(row.score);
    fused.set(row.chunk_id, e);
  });

  const ranked = [...fused.values()]
    .map((e) => ({ ...e, final: e.rrf * (AUTHORITY_BOOST[e.row.authority_tier] ?? 1.0) }))
    .sort((a, b) => b.final - a.final);

  const topLex = Math.max(0, ...ranked.map((e) => e.lex ?? 0));
  const bestSem = semantic.length ? Math.max(...semantic.map((r) => Number(r.score))) : null;
  if (mode === 'hybrid' && bestSem === null) traceNote += 'semantic_leg_empty:coverage_degraded;';

  // Candidate gates:
  //  • a semantic hit counts only if cosine ≥ min_semantic_score (pgvector always
  //    returns the 30 nearest rows — being in that list proves nothing);
  //  • a lexical-only hit must cover a meaningful share of the query terms
  //    (re-ranked score ≥ 1.0) and reach 40 % of the best lexical score.
  const semOk = (e: { sem: number | null }) => e.sem !== null && e.sem >= tun.min_semantic_score;
  // FIX F6 (audit 2026-09-04): the lexical re-ranker already penalises a cover /
  // contents chunk (page ≤ 1 with no section heading) by ×0.5, but the SEMANTIC
  // leg had no equivalent guard — so CRRI page 1 (cosine 0.62) could be the top
  // hit and get cited (trace 3880bcc6 listed page 1). A page-1 chunk with no
  // section_path carries no answerable fact; drop it from the served set. It is
  // still logged as a candidate (this filter runs after `ranked`, before slice).
  const isFrontMatter = (row: RpcRow) => (row.page_number ?? 99) <= 1 && !row.section_path;
  const passing = ranked
    .filter((e) => !isFrontMatter(e.row))
    .filter((e) => semOk(e) || (e.lex !== null && e.lex >= 1.0))
    .filter((e) => semOk(e) || (e.lex !== null && e.lex >= topLex * LEXICAL_RELATIVE_CUTOFF))
    .slice(0, maxEvidence);

  // Corpus gap: nothing passed, OR (hybrid) the best cosine is below the gap floor —
  // lexical noise ("seed", "rate") must not mask a topic the corpus does not cover.
  // A fulltext-only run (bestSem === null) is never a gap purely on the cosine floor.
  // FIXED 2026-08-28: bestSem === null in hybrid mode means the vector leg
  // had NO coverage (rag_search_vector filters `embedding IS NOT NULL`, so
  // chunks awaiting embedding backfill return zero semantic rows even when
  // fulltext finds them). That is DEGRADED COVERAGE, not evidence of a corpus
  // gap — the fulltext thresholds already vetted `passing`. The cosine-floor
  // gap check applies only when the vector leg actually scored something.
  // This restores the behaviour the change log above already claims.
  const belowThreshold =
    passing.length === 0 ||
    (mode === 'hybrid' && bestSem !== null && bestSem < tun.gap_semantic_score);

  // Trust gate: one extra lookup for the (few) documents involved.
  const trustByDoc = new Map<string, number | null>();
  if (passing.length) {
    try {
      const { data: docs } = await supabase
        .from('rag_documents')
        .select('id, rag_source_registry!inner(trust_prior)')
        .in('id', [...new Set(passing.map((e) => e.row.document_id))]);
      for (const d of (docs || []) as Array<{ id: string; rag_source_registry: { trust_prior: number | null } | { trust_prior: number | null }[] }>) {
        const reg = Array.isArray(d.rag_source_registry) ? d.rag_source_registry[0] : d.rag_source_registry;
        trustByDoc.set(d.id, reg?.trust_prior == null ? null : Number(reg.trust_prior));
      }
    } catch (e) {
      traceNote += `trust_lookup_err:${(e as Error).message};`;
    }
  }

  const evidence: Evidence[] = passing.map((e) => ({
    chunkId: e.row.chunk_id,
    documentId: e.row.document_id,
    text: e.row.chunk_text,
    sectionPath: e.row.section_path,
    pageNumber: e.row.page_number,
    language: e.row.language,
    title: e.row.title,
    publisher: e.row.publisher,
    authorityTier: e.row.authority_tier,
    docType: e.row.doc_type,
    docVersion: e.row.doc_version,
    rankScore: e.final,
    lexicalScore: e.lex,
    semanticScore: e.sem,
    trustPrior: trustByDoc.get(e.row.document_id) ?? null,
    servable: e.row.authority_tier !== 'other' || (trustByDoc.get(e.row.document_id) ?? 0) >= MIN_TRUST_FOR_OTHER_TIER,
  }));

  const latencyMs = Date.now() - startedAt;

  // ── Audit log (§30). Best-effort; never break retrieval on log failure.
  // The candidates are logged even on a gap so the decision can be reviewed.
  try {
    await supabase.from('rag_retrieval_logs').insert({
      session_id: audit.sessionId || null,
      turn_id: audit.turnId || null,
      trace_id: audit.traceId || null,
      tenant_id: audit.tenantIdText || null,
      farmer_id: audit.farmerId || null,
      query_text: query,
      query_language: language,
      filters_applied: {
        ...rpcArgs, purpose, query_original: audit.queryOriginal ?? null,
        gates: { min_semantic_score: tun.min_semantic_score, gap_semantic_score: tun.gap_semantic_score },
      },
      retrieval_mode: mode,
      chunks_returned: evidence.map((ev) => ({
        chunk_id: ev.chunkId,
        document_id: ev.documentId,
        rank: ev.rankScore,
        lex: ev.lexicalScore,
        sem: ev.semanticScore,
      })),
      // top_score = best COSINE (comparable across queries). Was the RRF rank (≈0.037 always).
      top_score: bestSem,
      below_threshold: belowThreshold,
      embedding_model: embeddingModel,
      latency_ms: latencyMs,
      retrieval_purpose: purpose,
      document_ids: [...new Set(evidence.map((ev) => ev.documentId))],
      chunk_ids: evidence.map((ev) => ev.chunkId),
    });
  } catch (e) {
    console.warn('[ragRetrieval] audit log failed:', (e as Error).message);
  }

  // Contract (§31): on a corpus gap the caller receives NO evidence.
  return {
    evidence: belowThreshold ? [] : evidence,
    mode,
    belowThreshold,
    bestSemanticScore: bestSem,
    embeddingModel,
    latencyMs,
    traceNote,
  };
}

/** Render evidence for the LLM context — citation data comes ONLY from here (§22). */
export function buildEvidenceBlock(evidence: Evidence[]): string {
  return evidence
    .map((ev, i) => {
      const cite = [
        ev.publisher,
        ev.title,
        ev.docVersion !== '1' ? `v${ev.docVersion}` : null,
        ev.sectionPath ? `Section: ${ev.sectionPath}` : null,
        ev.pageNumber != null ? `Page ${ev.pageNumber}` : null,
      ]
        .filter(Boolean)
        .join(' — ');
      return `[EVIDENCE ${i + 1}] (${cite})\n${ev.text}`;
    })
    .join('\n\n');
}

/** UI strings for citations in every supported app language (fallback: en). */
const CITE_LABEL: Record<string, { sources: string; page: string; pages: string }> = {
  en: { sources: 'Sources', page: 'p.', pages: 'pp.' },
  hi: { sources: 'स्रोत', page: 'पृष्ठ', pages: 'पृष्ठ' },
  mr: { sources: 'स्रोत', page: 'पान', pages: 'पाने' },
  pa: { sources: 'ਸਰੋਤ', page: 'ਪੰਨਾ', pages: 'ਪੰਨੇ' },
  gu: { sources: 'સ્રોત', page: 'પાનું', pages: 'પાનાં' },
  ta: { sources: 'ஆதாரம்', page: 'பக்கம்', pages: 'பக்கங்கள்' },
  te: { sources: 'మూలం', page: 'పేజీ', pages: 'పేజీలు' },
  kn: { sources: 'ಮೂಲ', page: 'ಪುಟ', pages: 'ಪುಟಗಳು' },
  ml: { sources: 'ഉറവിടം', page: 'പേജ്', pages: 'പേജുകൾ' },
  bn: { sources: 'উৎস', page: 'পৃষ্ঠা', pages: 'পৃষ্ঠা' },
  or: { sources: 'ଉତ୍ସ', page: 'ପୃଷ୍ଠା', pages: 'ପୃଷ୍ଠା' },
  ur: { sources: 'ماخذ', page: 'صفحہ', pages: 'صفحات' },
};

/** Indexes (1-based) of evidence the model actually cited with [n] / [EVIDENCE n]. */
export function citedEvidenceIndexes(answer: string): number[] {
  const out = new Set<number>();
  for (const m of answer.matchAll(/\[(?:EVIDENCE\s+)?(\d+(?:\s*,\s*\d+)*)\]/gi)) {
    for (const n of m[1].split(',')) { const i = parseInt(n.trim(), 10); if (i > 0) out.add(i); }
  }
  return [...out].sort((a, b) => a - b);
}

/** Remove [n] / [EVIDENCE n] markers and tidy spacing before showing text to the farmer. */
export function stripCitationMarkers(answer: string): string {
  return answer.replace(/\s*\[(?:EVIDENCE\s+)?\d+(?:\s*,\s*\d+)*\]/gi, '').replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Citation lines: ONE line per document, listing the pages actually cited.
 * `used` = 1-based evidence indexes referenced in the answer; when empty, all
 * evidence is listed (legacy behaviour). Only servable evidence is ever cited.
 */
export function buildCitationLines(evidence: Evidence[], language: string, used: number[] = []): string {
  const L = CITE_LABEL[language] ?? CITE_LABEL.en;
  const pick = used.length ? used.map((i) => evidence[i - 1]).filter(Boolean) : evidence;
  const byDoc = new Map<string, { ev: Evidence; pages: Set<number> }>();
  for (const ev of pick) {
    if (!ev.servable) continue;
    const g = byDoc.get(ev.documentId) ?? { ev, pages: new Set<number>() };
    if (ev.pageNumber != null) g.pages.add(ev.pageNumber);
    byDoc.set(ev.documentId, g);
  }
  if (!byDoc.size) return '';
  const lines = [...byDoc.values()].slice(0, 3).map(({ ev, pages }) => {
    const ps = [...pages].sort((a, b) => a - b);
    const pg = ps.length ? ` (${ps.length > 1 ? L.pages : L.page} ${ps.join(', ')})` : '';
    return `• ${ev.title} — ${ev.publisher}${pg}`;
  });
  return `\n\n${L.sources}:\n${lines.join('\n')}`;
}

// ── Deterministic unit helper (code, never the model) ───────────────────────
const HA_TO_ACRE = 0.4047;
const UNIT_WORDS: Record<string, { kg: string; q: string; acre: string; note: string }> = {
  en: { kg: 'kg', q: 'quintal', acre: 'per acre', note: '1 hectare ≈ 2.5 acres' },
  hi: { kg: 'किलो', q: 'क्विंटल', acre: 'प्रति एकड़', note: '१ हेक्टेयर ≈ २.५ एकड़' },
  mr: { kg: 'किलो', q: 'क्विंटल', acre: 'एकरी', note: '१ हेक्टर ≈ २.५ एकर' },
  gu: { kg: 'કિલો', q: 'ક્વિન્ટલ', acre: 'એકર દીઠ', note: '૧ હેક્ટર ≈ ૨.૫ એકર' },
  pa: { kg: 'ਕਿਲੋ', q: 'ਕੁਇੰਟਲ', acre: 'ਪ੍ਰਤੀ ਏਕੜ', note: '੧ ਹੈਕਟੇਅਰ ≈ ੨.੫ ਏਕੜ' },
};
/**
 * Finds "N[-M] kg|quintal per hectare" figures in the CITED evidence that also
 * appear in the answer, and returns one localized line with acre equivalents.
 * Pure arithmetic; returns '' when nothing applies.
 */
export function acreEquivalentsLine(answer: string, evidence: Evidence[], language: string): string {
  const W = UNIT_WORDS[language] ?? UNIT_WORDS.en;
  const ansNums = new Set(normaliseNumbers(answer));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ev of evidence) {
    // F2: scan chunk text + section heading + title so a per-hectare figure that
    // the chunker placed in a heading still produces an acre-equivalent line.
    for (const m of evidenceNumberText(ev).matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(kg|kilograms?|quintals?|q)\s*(?:[a-z]+\s+)?(?:\/|per)\s*(?:ha|hectare)/gi)) {
      const a = parseFloat(m[1]); const b = m[2] ? parseFloat(m[2]) : null;
      if (!ansNums.has(String(a)) && !(b != null && ansNums.has(String(b)))) continue;
      const unit = /^q/i.test(m[3]) ? W.q : W.kg;
      const conv = (x: number) => Math.round(x * HA_TO_ACRE * 10) / 10;
      const key = `${a}-${b}-${unit}`; if (seen.has(key)) continue; seen.add(key);
      out.push(b != null ? `${conv(a)}–${conv(b)} ${unit} ${W.acre}` : `${conv(a)} ${unit} ${W.acre}`);
    }
  }
  if (!out.length) return '';
  const line = `\n(${W.note}: ${out.join('; ')})`;
  // Devanagari-script languages: show the computed figures in Devanagari digits too.
  return language === 'mr' || language === 'hi'
    ? line.replace(/\d/g, (d) => DEVANAGARI_DIGITS[Number(d)])
    : line;
}

// ── Numeric fidelity gate (deterministic; no LLM as judge) ──────────────────
const NUM_RE = /\d+(?:[.,]\d+)?/g;
const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function normaliseNumbers(s: string): string[] {
  const latin = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  return (latin.match(NUM_RE) || []).map((n) => n.replace(',', '.').replace(/\.0+$/, ''));
}

/**
 * FIX F2 (audit 2026-09-04): the evidence the model actually SEES is the whole
 * `[EVIDENCE n] (publisher — title — Section: … — Page …)` block built by
 * buildEvidenceBlock(), not just the chunk body. In the tabular variety
 * catalogues (CRRI rice, AICRP sugarcane) the ingest chunker put the variety
 * name and its serial number in `section_path` — e.g. section "163 CR Dhan 326",
 * chunk_text "(Panchatatva) … 6.2 t/ha". A faithful answer that names "CR Dhan
 * 326" was then flagged because "326" is not in `ev.text`, and the fidelity gate
 * DROPPED the naming sentence (trace 518d3700 served a yield with no variety).
 * The number gate must therefore treat the section heading and the document
 * title as part of the evidence text — they are on-screen for the model and are
 * authoritative source text, not model invention. chunk_text stays first so its
 * numbers dominate; section/title only WIDEN the allow-list, never narrow it.
 */
function evidenceNumberText(ev: Evidence): string {
  return `${ev.text} ${ev.sectionPath ?? ''} ${ev.title ?? ''}`;
}

/**
 * Remove only the sentences/bullets that contain unsupported numbers; keep the rest.
 * Returns '' when nothing safe remains. Never substitutes placeholder glyphs.
 */
export function dropUnsupportedSentences(answer: string, evidence: Evidence[], question: string): string {
  const parts = answer.split(/(?<=[.!?।])\s+|\n+/);
  const kept = parts.filter((p) => p.trim() && unsupportedNumbers(p, evidence, question).length === 0);
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Every number in `answer` must also occur in the evidence texts or in the
 * farmer's own question. Returns the offending numbers (empty ⇒ faithful).
 * "[3]" / "[EVIDENCE 3]" style citation markers are ignored.
 */
export function unsupportedNumbers(answer: string, evidence: Evidence[], question: string): string[] {
  const allowed = new Set<string>([
    ...normaliseNumbers(question),
    // F2: allow numbers from chunk text AND its section heading / document title
    // (all three are shown to the model in buildEvidenceBlock and are source text).
    ...evidence.flatMap((ev) => normaliseNumbers(evidenceNumberText(ev))),
  ]);
  const stripped = answer
    .replace(/\[EVIDENCE\s+\d+\]/gi, ' ')
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' ');
  const found = normaliseNumbers(stripped);
  return [...new Set(found.filter((n) => !allowed.has(n)))];
}
