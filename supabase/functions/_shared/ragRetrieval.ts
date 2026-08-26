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
}

export interface RagResult {
  evidence: Evidence[];
  mode: 'fulltext' | 'hybrid';
  belowThreshold: boolean;
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
/** minimum fused score to count as "we found something" — tune via golden set */
const MIN_RRF_SCORE = 1 / (RRF_K + CANDIDATES_PER_LEG); // at least a mid-rank hit in one leg
const AUTHORITY_BOOST: Record<string, number> = {
  central_govt: 1.15,
  icar: 1.15,
  state_agri_university: 1.10,
  state_govt: 1.10,
  kvk: 1.05,
  other: 1.0,
};

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
    e.sem = row.score;
    fused.set(row.chunk_id, e);
  });

  const ranked = [...fused.values()]
    .map((e) => ({ ...e, final: e.rrf * (AUTHORITY_BOOST[e.row.authority_tier] ?? 1.0) }))
    .sort((a, b) => b.final - a.final);

  // A lexical-only hit must cover a meaningful share of the query terms
  // (re-ranked score ≥ 1.0 ≈ one third coverage or a section-title hit);
  // single-keyword noise ('tomato price' matching 'market') is dropped unless
  // the semantic leg also found it.
  const passing = ranked
    .filter((e) => e.rrf >= MIN_RRF_SCORE)
    .filter((e) => e.sem !== null || (e.lex !== null && e.lex >= 1.0))
    .slice(0, maxEvidence);
  const belowThreshold = passing.length === 0;

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
  }));

  const latencyMs = Date.now() - startedAt;

  // ── Audit log (§30). Best-effort; never break retrieval on log failure.
  try {
    await supabase.from('rag_retrieval_logs').insert({
      session_id: audit.sessionId || null,
      turn_id: audit.turnId || null,
      trace_id: audit.traceId || null,
      tenant_id: audit.tenantIdText || null,
      farmer_id: audit.farmerId || null,
      query_text: query,
      query_language: language,
      filters_applied: { ...rpcArgs, purpose, query_original: audit.queryOriginal ?? null },
      retrieval_mode: mode,
      chunks_returned: evidence.map((ev) => ({
        chunk_id: ev.chunkId,
        document_id: ev.documentId,
        rank: ev.rankScore,
        lex: ev.lexicalScore,
        sem: ev.semanticScore,
      })),
      top_score: evidence[0]?.rankScore ?? null,
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

  return { evidence, mode, belowThreshold, embeddingModel, latencyMs, traceNote };
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

/** Human-readable citation lines appended to farmer answer. */
export function buildCitationLines(evidence: Evidence[], language: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const ev of evidence) {
    const key = `${ev.documentId}:${ev.pageNumber ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const page = ev.pageNumber != null
      ? language === 'hi' ? `, पृष्ठ ${ev.pageNumber}` : language === 'mr' ? `, पान ${ev.pageNumber}` : `, p.${ev.pageNumber}`
      : '';
    lines.push(`${ev.publisher} — ${ev.title}${page}`);
  }
  const label = language === 'hi' ? 'स्रोत' : language === 'mr' ? 'स्रोत' : 'Sources';
  return `\n\n${label}:\n` + lines.slice(0, 3).map((l) => `• ${l}`).join('\n');
}

// ── Numeric fidelity gate (deterministic; no LLM as judge) ──────────────────
const NUM_RE = /\d+(?:[.,]\d+)?/g;
const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function normaliseNumbers(s: string): string[] {
  const latin = s.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
  return (latin.match(NUM_RE) || []).map((n) => n.replace(',', '.').replace(/\.0+$/, ''));
}

/**
 * Every number in `answer` must also occur in the evidence texts or in the
 * farmer's own question. Returns the offending numbers (empty ⇒ faithful).
 * "[3]" / "[EVIDENCE 3]" style citation markers are ignored.
 */
/**
 * Remove only the sentences/bullets that contain unsupported numbers; keep the rest.
 * Returns '' when nothing safe remains. Never substitutes placeholder glyphs.
 */
export function dropUnsupportedSentences(answer: string, evidence: Evidence[], question: string): string {
  const parts = answer.split(/(?<=[.!?।])\s+|\n+/);
  const kept = parts.filter((p) => p.trim() && unsupportedNumbers(p, evidence, question).length === 0);
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function unsupportedNumbers(answer: string, evidence: Evidence[], question: string): string[] {
  const allowed = new Set<string>([
    ...normaliseNumbers(question),
    ...evidence.flatMap((ev) => normaliseNumbers(ev.text)),
  ]);
  const stripped = answer
    .replace(/\[EVIDENCE\s+\d+\]/gi, ' ')
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' ');
  const found = normaliseNumbers(stripped);
  return [...new Set(found.filter((n) => !allowed.has(n)))];
}
