/**
 * ragRetrieval.ts — the ONLY retrieval path for the RAG subsystem.
 *
 * Hybrid retrieval (master prompt §17, design v2 §4.3):
 *   BM25 with IDF on the query terms      (RPC rag_search_bm25)
 * + BM25 with IDF on identifiers only     (RPC rag_search_bm25, when the query names any)
 * + pgvector semantic                     (RPC rag_search_vector, only when provider available)
 * → Reciprocal Rank Fusion merge → cross-encoder rerank (when the caller asks for it)
 * → gates → per-document diversity → authority as tie-break → trust gate → evidence.
 *
 * FAILURE BEHAVIOR (§31, design v2 principle 7): a leg that fails degrades to
 * the legs that ran. If NO leg ran, or anything else throws, the result is
 * mode 'error' with evidence: [] and belowThreshold: true — the caller MUST
 * take the insufficient-evidence path in code, never let the LLM improvise.
 * ragRetrieve itself never throws.
 *
 * Every call is audit-logged to rag_retrieval_logs (§30), now including every
 * candidate considered (`candidates`), not only the survivors.
 *
 * CHANGE LOG
 * 2026-09-21 — RAG PHASE 0 (design v2 §5, defects R1–R5, S1, S4):
 *   R1  Lexical leg is BM25 with inverse document frequency (rag_search_bm25)
 *       instead of pgroonga's raw occurrence count; the in-process
 *       rerankLexical() heuristic and its stop-word list are gone with it.
 *   —   Identifiers are first-class: the caller's identifiers go to the RPC
 *       (phrase match earns their own IDF mass) and also run as a separate
 *       identifier-only leg so the identifier chunk always enters the pool.
 *   R2  No authority multiplier on the fused score. Authority is a tie-break:
 *       among candidates whose scores are within RELATIVE_TIE of each other,
 *       the higher tier wins; it never lifts a weaker match over a stronger.
 *   —   Per-document diversity: at most MAX_PER_DOCUMENT evidence per document
 *       in the cut, so one long document cannot crowd out the specific one.
 *   —   Cross-encoder reranker (rerankProvider.ts) over the top RERANK_POOL
 *       fused candidates when audit.rerank is true. The schedule path does not
 *       ask for it and keeps its latency budget. Rerank failure degrades to
 *       the fused order and is recorded in traceNote.
 *   R5  `candidates` logged: per-leg rank and score, rerank score, final score
 *       and the gate that admitted or dropped each one.
 *   S4  RagFilters.topicCodes → p_topics on every leg.
 *   S1  Errors surface as mode 'error' and are logged as such, so a database
 *       outage is never recorded as a corpus gap and the caller can tell the
 *       two apart. Candidate width is CANDIDATES_PER_LEG = 60 per leg and the
 *       evidence cut MAX_EVIDENCE = 8 (design §4: 8–10).
 * 2026-09-04 — RAG GAP GATE SURGICAL FIX: a valid candidate that passes the
 *   per-candidate semantic/lexical gates must not be discarded because the
 *   global best cosine is below a separate gap floor. The previous compound
 *   condition made valid schedule evidence disappear when best cosine was
 *   0.54 and the gap floor was 0.55. Corpus-gap status now depends on whether
 *   any candidate passes the explicit evidence gates. Query construction also
 *   includes the task description/instruction hints so schedule retrieval has
 *   enough agronomic vocabulary without changing facts.
 * 2026-08-27b — belowThreshold no longer forces a gap on a hybrid run whose semantic
 *   leg degraded to fulltext (bestSem===null); top_score logs bestSem only.
 * 2026-08-27 — corpus-gap gates use cosine and system_config.rag_retrieval floors.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import { getEmbeddingProvider } from './embeddingProvider.ts';
import { getRerankProvider } from './rerankProvider.ts';

export type RetrievalPurpose =
  | 'GENERAL_CHAT'
  | 'SCHEDULE_DOCUMENT_SELECTION'
  | 'SCHEDULE_EXTRACTION'
  | 'SCHEDULE_VALIDATION'
  | 'GOLDEN_EVAL';

export interface RagFilters {
  stateCodes?: string[] | null;
  cropCodes?: string[] | null;
  docTypes?: string[] | null;
  tenantId?: string | null;
  /** rag_topics.code values → p_topics on every leg (S4) */
  topicCodes?: string[] | null;
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
  rankScore: number;
  lexicalScore: number | null;
  semanticScore: number | null;
  rerankScore: number | null;
  trustPrior: number | null;
  servable: boolean;
}

export type RetrievalMode = 'fulltext' | 'hybrid' | 'error';

export interface RagResult {
  evidence: Evidence[];
  mode: RetrievalMode;
  belowThreshold: boolean;
  bestSemanticScore: number | null;
  embeddingModel: string | null;
  latencyMs: number;
  traceNote: string;
  /** set only when mode === 'error' */
  error: string | null;
}

export interface RagAudit {
  sessionId?: string | null;
  turnId?: string | null;
  traceId?: string | null;
  farmerId?: string | null;
  tenantIdText?: string | null;
  purpose?: RetrievalPurpose;
  maxEvidence?: number;
  queryOriginal?: string | null;
  /** identifiers named in the question (variety codes, product / scheme / chemical names) */
  identifiers?: string[] | null;
  /** run the cross-encoder reranker over the fused candidates (General chat opts in) */
  rerank?: boolean;
}

const RRF_K = 60;
const CANDIDATES_PER_LEG = 60;
const RERANK_POOL = 40;
const MAX_EVIDENCE = 8;
const MAX_PER_DOCUMENT = 3;
const MAX_QUERY_TERMS = 12;
const MAX_LOGGED_CANDIDATES = 200;
const MIN_TRUST_FOR_OTHER_TIER = 0.6;
const LEXICAL_RELATIVE_CUTOFF = 0.4;
/** two scores this close (relative) are a tie, and authority decides */
const RELATIVE_TIE = 0.02;

/** Higher rank = more authoritative. Tie-break only — never a multiplier. */
const AUTHORITY_RANK: Record<string, number> = {
  central_govt: 3,
  icar: 3,
  state_agri_university: 2,
  state_govt: 2,
  kvk: 1,
  other: 0,
};

interface RetrievalTunables {
  min_semantic_score: number;
  gap_semantic_score: number;
  min_rerank_score: number;
}
const DEFAULT_TUNABLES: RetrievalTunables = { min_semantic_score: 0.45, gap_semantic_score: 0.55, min_rerank_score: 0.25 };
let tunablesCache: { at: number; v: RetrievalTunables } | null = null;

async function loadTunables(supabase: SupabaseClient): Promise<RetrievalTunables> {
  if (tunablesCache && Date.now() - tunablesCache.at < 60_000) return tunablesCache.v;
  let v = DEFAULT_TUNABLES;
  try {
    const { data } = await supabase.from('system_config').select('config_value').eq('config_key', 'rag_retrieval').maybeSingle();
    const cfg = (data?.config_value ?? {}) as Partial<RetrievalTunables>;
    v = {
      min_semantic_score: Number(cfg.min_semantic_score ?? DEFAULT_TUNABLES.min_semantic_score),
      gap_semantic_score: Number(cfg.gap_semantic_score ?? DEFAULT_TUNABLES.gap_semantic_score),
      min_rerank_score: Number(cfg.min_rerank_score ?? DEFAULT_TUNABLES.min_rerank_score),
    };
  } catch { /* keep defaults */ }
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
  topic_codes?: string[] | null;
  /** rag_search_bm25 only */
  matched_lexemes?: string[] | null;
  identifier_hits?: number | null;
}

/**
 * Query terms for the BM25 leg. The RPC tokenises with the language-neutral
 * 'simple' configuration and weights every term by its inverse document
 * frequency, so no stop-word list is needed here: a word that appears in
 * most chunks earns almost nothing. Only the count is bounded.
 * \p{M} is part of a word: in Indic scripts the vowel signs are combining
 * marks, and splitting on them cuts every word into fragments.
 */
export function queryTerms(q: string): string[] {
  const seen = new Set<string>();
  for (const t of q.toLowerCase().split(/[^\p{L}\p{M}\p{N}.%/-]+/u)) {
    const w = t.replace(/^[.%/-]+|[.%/-]+$/g, '');
    if (w.length >= 2 && !seen.has(w)) seen.add(w);
    if (seen.size >= MAX_QUERY_TERMS) break;
  }
  return [...seen];
}

type GateOutcome = 'kept' | 'front_matter' | 'below_gate' | 'diversity' | 'over_cut';

interface Candidate {
  row: RpcRow;
  rrf: number;
  lexRank: number | null;
  lex: number | null;
  idRank: number | null;
  identifierHits: number;
  semRank: number | null;
  sem: number | null;
  rerank: number | null;
  final: number;
  gate: GateOutcome;
}

function authorityRank(tier: string): number {
  return AUTHORITY_RANK[tier] ?? 0;
}

/**
 * Score first; when two RERANK scores are within RELATIVE_TIE, the higher
 * authority tier first. The tie rule applies only to rerank scores, which are
 * relevance in [0, 1]: RRF scores are rank-derived and adjacent ranks always
 * differ by under 2 % (1/61 vs 1/62), so on a fused order the same rule would
 * let authority swap every neighbouring pair.
 */
function compareCandidates(a: Candidate, b: Candidate, tieBreak: boolean): number {
  if (tieBreak) {
    const gap = Math.abs(a.final - b.final);
    const tie = gap <= RELATIVE_TIE * Math.max(Math.abs(a.final), Math.abs(b.final));
    if (tie) {
      const auth = authorityRank(b.row.authority_tier) - authorityRank(a.row.authority_tier);
      if (auth !== 0) return auth;
    }
  }
  return b.final - a.final;
}

/**
 * Per-document diversity: at most MAX_PER_DOCUMENT from any one document in
 * the cut. When that leaves the cut short, the skipped candidates fill it in
 * score order — diversity never makes the answer thinner than the corpus can
 * support.
 */
function applyDiversity(sorted: Candidate[], maxEvidence: number): Candidate[] {
  const perDoc = new Map<string, number>();
  const picked: Candidate[] = [];
  const skipped: Candidate[] = [];
  for (const c of sorted) {
    if (picked.length >= maxEvidence) { c.gate = 'over_cut'; continue; }
    const n = perDoc.get(c.row.document_id) ?? 0;
    if (n >= MAX_PER_DOCUMENT) { c.gate = 'diversity'; skipped.push(c); continue; }
    perDoc.set(c.row.document_id, n + 1);
    c.gate = 'kept';
    picked.push(c);
  }
  for (const c of skipped) {
    if (picked.length >= maxEvidence) break;
    c.gate = 'kept';
    picked.push(c);
  }
  return picked;
}

export async function ragRetrieve(
  supabase: SupabaseClient,
  query: string,
  language: string,
  filters: RagFilters,
  audit: RagAudit,
): Promise<RagResult> {
  const startedAt = Date.now();
  const purpose: RetrievalPurpose = audit.purpose ?? 'GENERAL_CHAT';
  const maxEvidence = Math.max(1, Math.min(audit.maxEvidence ?? MAX_EVIDENCE, CANDIDATES_PER_LEG));
  const identifiers = (audit.identifiers || []).map((s) => String(s || '').trim()).filter((s) => s.length >= 2);

  const rpcArgs = {
    p_limit: CANDIDATES_PER_LEG,
    p_states: filters.stateCodes?.length ? filters.stateCodes : null,
    p_crops: filters.cropCodes?.length ? filters.cropCodes : null,
    p_doc_types: filters.docTypes?.length ? filters.docTypes : null,
    p_tenant: filters.tenantId || null,
    p_topics: filters.topicCodes?.length ? filters.topicCodes : null,
  };

  const logRow = (fields: Record<string, unknown>) => supabase.from('rag_retrieval_logs').insert({
    session_id: audit.sessionId || null, turn_id: audit.turnId || null, trace_id: audit.traceId || null,
    tenant_id: audit.tenantIdText || null, farmer_id: audit.farmerId || null,
    query_text: query, query_language: language, retrieval_purpose: purpose,
    ...fields,
  });

  try {
    const provider = getEmbeddingProvider();
    const tun = await loadTunables(supabase);
    let mode: RetrievalMode = 'fulltext';
    let embeddingModel: string | null = null;
    let traceNote = '';
    let legsRun = 0;

    // ── Leg 1: BM25 on the query terms (identifiers included, phrase-boosted)
    let lexical: RpcRow[] = [];
    const terms = queryTerms(query);
    try {
      const { data, error } = await supabase.rpc('rag_search_bm25', {
        p_terms: terms, p_identifiers: identifiers.length ? identifiers : null, ...rpcArgs,
      });
      if (error) throw error;
      lexical = (data || []) as RpcRow[];
      legsRun++;
    } catch (e) {
      traceNote += `bm25_err:${(e as Error).message};`;
    }

    // ── Leg 2: BM25 on the identifiers alone, so the identifier chunk is in the
    //    pool even when the query-term leg's cut did not reach it.
    let identifierLeg: RpcRow[] = [];
    if (identifiers.length) {
      try {
        const { data, error } = await supabase.rpc('rag_search_bm25', {
          p_terms: [], p_identifiers: identifiers, ...rpcArgs,
        });
        if (error) throw error;
        identifierLeg = (data || []) as RpcRow[];
        legsRun++;
      } catch (e) {
        traceNote += `identifier_err:${(e as Error).message};`;
      }
    }

    // ── Leg 3: dense
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
        legsRun++;
      } catch (e) {
        traceNote += `vector_degraded:${(e as Error).message};`;
        mode = 'fulltext';
      }
    }

    if (legsRun === 0) {
      throw new Error(`NO_RETRIEVAL_LEG_RAN:${traceNote}`);
    }

    // ── Reciprocal Rank Fusion across the legs that ran
    const fused = new Map<string, Candidate>();
    const get = (row: RpcRow): Candidate => {
      let c = fused.get(row.chunk_id);
      if (!c) {
        c = { row, rrf: 0, lexRank: null, lex: null, idRank: null, identifierHits: 0, semRank: null, sem: null, rerank: null, final: 0, gate: 'below_gate' };
        fused.set(row.chunk_id, c);
      }
      return c;
    };
    lexical.forEach((row, i) => {
      const c = get(row);
      c.rrf += 1 / (RRF_K + i + 1);
      c.lexRank = i + 1; c.lex = Number(row.score); c.identifierHits = Math.max(c.identifierHits, Number(row.identifier_hits ?? 0));
    });
    identifierLeg.forEach((row, i) => {
      const c = get(row);
      c.rrf += 1 / (RRF_K + i + 1);
      c.idRank = i + 1;
      if (c.lex === null) c.lex = Number(row.score);
      c.identifierHits = Math.max(c.identifierHits, Number(row.identifier_hits ?? 0));
    });
    semantic.forEach((row, i) => {
      const c = get(row);
      c.rrf += 1 / (RRF_K + i + 1);
      c.semRank = i + 1; c.sem = Number(row.score);
    });

    const candidates = [...fused.values()];
    for (const c of candidates) c.final = c.rrf;
    candidates.sort((a, b) => b.final - a.final);

    // ── Cross-encoder rerank over the top of the fused list (caller opt-in)
    let rerankModel: string | null = null;
    let reranked = false;
    if (audit.rerank && candidates.length) {
      const reranker = getRerankProvider();
      if (reranker.available()) {
        const pool = candidates.slice(0, RERANK_POOL);
        try {
          const docs = pool.map((c) => [c.row.title, c.row.section_path].filter(Boolean).join(' — ') + '\n' + c.row.chunk_text);
          const hits = await reranker.rerank(query, docs, pool.length);
          for (const h of hits) pool[h.index].rerank = h.score;
          for (const c of pool) if (c.rerank === null) c.rerank = 0;
          rerankModel = reranker.version();
          reranked = true;
          for (const c of candidates) c.final = c.rerank ?? 0;
        } catch (e) {
          traceNote += `rerank_degraded:${(e as Error).message};`;
        }
      } else {
        traceNote += 'rerank_unconfigured;';
      }
    }

    // ── Gates. Front matter never serves. With a rerank score, that score is
    //    the gate; otherwise the semantic floor or the relative lexical floor,
    //    and an identifier phrase hit always clears the lexical floor.
    const topLex = Math.max(0, ...candidates.map((c) => c.lex ?? 0));
    const bestSem = semantic.length ? Math.max(...semantic.map((r) => Number(r.score))) : null;
    const isFrontMatter = (row: RpcRow) => (row.page_number ?? 99) <= 1 && !row.section_path;
    const passesGate = (c: Candidate): boolean => {
      if (reranked) return (c.rerank ?? 0) >= tun.min_rerank_score;
      const semOk = c.sem !== null && c.sem >= tun.min_semantic_score;
      const lexOk = c.lex !== null && (c.identifierHits > 0 || c.lex >= topLex * LEXICAL_RELATIVE_CUTOFF);
      return semOk || lexOk;
    };

    const passing: Candidate[] = [];
    for (const c of candidates) {
      if (isFrontMatter(c.row)) { c.gate = 'front_matter'; continue; }
      if (!passesGate(c)) { c.gate = 'below_gate'; continue; }
      passing.push(c);
    }
    passing.sort((a, b) => compareCandidates(a, b, reranked));
    const cut = applyDiversity(passing, maxEvidence);

    // A candidate that passes the explicit gates is evidence. Do not apply a second
    // global cosine floor after this point: that previously turned valid evidence
    // into NO_EVIDENCE whenever bestSem was just below gap_semantic_score.
    const belowThreshold = cut.length === 0;
    if (mode === 'hybrid' && bestSem !== null && bestSem < tun.gap_semantic_score && cut.length) {
      traceNote += `semantic_gap_floor_not_applied:passing_candidate=${cut.length};`;
    }

    const trustByDoc = new Map<string, number | null>();
    if (cut.length) {
      try {
        const { data: docs } = await supabase
          .from('rag_documents')
          .select('id, rag_source_registry!inner(trust_prior)')
          .in('id', [...new Set(cut.map((c) => c.row.document_id))]);
        for (const d of (docs || []) as Array<{ id: string; rag_source_registry: { trust_prior: number | null } | { trust_prior: number | null }[] }>) {
          const reg = Array.isArray(d.rag_source_registry) ? d.rag_source_registry[0] : d.rag_source_registry;
          trustByDoc.set(d.id, reg?.trust_prior == null ? null : Number(reg.trust_prior));
        }
      } catch (e) {
        traceNote += `trust_lookup_err:${(e as Error).message};`;
      }
    }

    const evidence: Evidence[] = cut.map((c) => ({
      chunkId: c.row.chunk_id, documentId: c.row.document_id, text: c.row.chunk_text,
      sectionPath: c.row.section_path, pageNumber: c.row.page_number, language: c.row.language,
      title: c.row.title, publisher: c.row.publisher, authorityTier: c.row.authority_tier,
      docType: c.row.doc_type, docVersion: c.row.doc_version, rankScore: c.final,
      lexicalScore: c.lex, semanticScore: c.sem, rerankScore: c.rerank,
      trustPrior: trustByDoc.get(c.row.document_id) ?? null,
      servable: c.row.authority_tier !== 'other' || (trustByDoc.get(c.row.document_id) ?? 0) >= MIN_TRUST_FOR_OTHER_TIER,
    }));

    const latencyMs = Date.now() - startedAt;
    const loggedCandidates = candidates.slice(0, MAX_LOGGED_CANDIDATES).map((c) => ({
      chunk_id: c.row.chunk_id, document_id: c.row.document_id, page: c.row.page_number,
      lex_rank: c.lexRank, lex: c.lex, id_rank: c.idRank, id_hits: c.identifierHits, sem_rank: c.semRank, sem: c.sem,
      rrf: Number(c.rrf.toFixed(6)), rerank: c.rerank, final: Number(c.final.toFixed(6)), gate: c.gate,
    }));
    try {
      await logRow({
        filters_applied: { ...rpcArgs, purpose, query_original: audit.queryOriginal ?? null,
          terms, identifiers, rerank: { requested: !!audit.rerank, applied: reranked, model: rerankModel },
          gates: { min_semantic_score: tun.min_semantic_score, gap_semantic_score: tun.gap_semantic_score, min_rerank_score: tun.min_rerank_score },
          legs: { lexical: lexical.length, identifier: identifierLeg.length, semantic: semantic.length } },
        retrieval_mode: mode,
        chunks_returned: evidence.map((ev) => ({ chunk_id: ev.chunkId, document_id: ev.documentId, rank: ev.rankScore, lex: ev.lexicalScore, sem: ev.semanticScore, rerank: ev.rerankScore })),
        candidates: loggedCandidates,
        top_score: bestSem, below_threshold: belowThreshold, embedding_model: embeddingModel,
        latency_ms: latencyMs,
        document_ids: [...new Set(evidence.map((ev) => ev.documentId))], chunk_ids: evidence.map((ev) => ev.chunkId),
      });
    } catch (e) {
      console.warn('[ragRetrieval] audit log failed:', (e as Error).message);
    }

    return { evidence: belowThreshold ? [] : evidence, mode, belowThreshold, bestSemanticScore: bestSem, embeddingModel, latencyMs, traceNote, error: null };
  } catch (e) {
    // S1: a retrieval failure is an outcome of its own, never a corpus gap and
    // never a reason for the caller to answer ungated.
    const message = (e as Error).message || String(e);
    const latencyMs = Date.now() - startedAt;
    console.error(`[ragRetrieval] retrieval error (${purpose}):`, message);
    try {
      await logRow({
        filters_applied: { ...rpcArgs, purpose, query_original: audit.queryOriginal ?? null, error: message },
        retrieval_mode: 'error', chunks_returned: [], candidates: [], top_score: null, below_threshold: true,
        embedding_model: null, latency_ms: latencyMs, document_ids: [], chunk_ids: [],
      });
    } catch (logErr) {
      console.warn('[ragRetrieval] audit log failed:', (logErr as Error).message);
    }
    return { evidence: [], mode: 'error', belowThreshold: true, bestSemanticScore: null, embeddingModel: null, latencyMs, traceNote: `error:${message};`, error: message };
  }
}

export function buildEvidenceBlock(evidence: Evidence[]): string {
  return evidence.map((ev, i) => {
    const cite = [ev.publisher, ev.title, ev.docVersion !== '1' ? `v${ev.docVersion}` : null,
      ev.sectionPath ? `Section: ${ev.sectionPath}` : null, ev.pageNumber != null ? `Page ${ev.pageNumber}` : null]
      .filter(Boolean).join(' — ');
    return `[EVIDENCE ${i + 1}] (${cite})\n${ev.text}`;
  }).join('\n\n');
}

const CITE_LABEL: Record<string, { sources: string; page: string; pages: string }> = {
  en:{sources:'Sources',page:'p.',pages:'pp.'}, hi:{sources:'स्रोत',page:'पृष्ठ',pages:'पृष्ठ'},
  mr:{sources:'स्रोत',page:'पान',pages:'पाने'}, pa:{sources:'ਸਰੋਤ',page:'ਪੰਨਾ',pages:'ਪੰਨੇ'},
  gu:{sources:'સ્રોત',page:'પાનું',pages:'પાનાં'}, ta:{sources:'ஆதாரம்',page:'பக்கம்',pages:'பக்கங்கள்'},
  te:{sources:'మూలం',page:'పేజీ',pages:'పేజీలు'}, kn:{sources:'ಮೂಲ',page:'ಪುಟ',pages:'ಪುಟಗಳು'},
  ml:{sources:'ഉറവിടം',page:'പേജ്',pages:'പേജുകൾ'}, bn:{sources:'উৎস',page:'পৃষ্ঠা',pages:'পৃষ্ঠা'},
  or:{sources:'ଉତ୍ସ',page:'ପୃଷ୍ଠା',pages:'ପୃଷ୍ଠା'}, ur:{sources:'ماخذ',page:'صفحہ',pages:'صفحات'},
};

export function citedEvidenceIndexes(answer: string): number[] {
  const out = new Set<number>();
  for (const m of answer.matchAll(/\[(?:EVIDENCE\s+)?(\d+(?:\s*,\s*\d+)*)\]/gi))
    for (const n of m[1].split(',')) { const i = parseInt(n.trim(), 10); if (i > 0) out.add(i); }
  return [...out].sort((a,b)=>a-b);
}
export function stripCitationMarkers(answer: string): string {
  return answer.replace(/\s*\[(?:EVIDENCE\s+)?\d+(?:\s*,\s*\d+)*\]/gi,'').replace(/[ \t]{2,}/g,' ').trim();
}
/**
 * Citation lines: ONE line per document, listing the pages actually cited.
 * `used` = 1-based evidence indexes referenced in the answer; when empty, all
 * evidence is listed. Only servable evidence is ever cited.
 * RESTORED 2026-09-04: the 2026-09-04 gap-gate rewrite dropped this export while
 * ai-general-chat/index.ts still imports it — the function failed at worker boot
 * ("does not provide an export named 'buildCitationLines'"), taking General chat
 * fully offline. Body is byte-identical to the pre-rewrite version (c5fe778).
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
/**
 * Structured form of buildCitationLines (added 2026-09-04) for the chat UI's
 * collapsible references card. Same selection rules (one entry per document,
 * cited pages only, servable only, max 3). `label`/`pageWord` come from the
 * CITE_LABEL table so the app renders the farmer's language without any UI
 * string of its own; `items` carry stable ids for future deep-links.
 */
export interface CitationRefs {
  label: string;
  pageWord: string;
  pagesWord: string;
  items: Array<{ documentId: string; title: string; publisher: string; pages: number[] }>;
}
export function buildCitationRefs(evidence: Evidence[], language: string, used: number[] = []): CitationRefs | null {
  const L = CITE_LABEL[language] ?? CITE_LABEL.en;
  const pick = used.length ? used.map((i) => evidence[i - 1]).filter(Boolean) : evidence;
  const byDoc = new Map<string, { ev: Evidence; pages: Set<number> }>();
  for (const ev of pick) {
    if (!ev.servable) continue;
    const g = byDoc.get(ev.documentId) ?? { ev, pages: new Set<number>() };
    if (ev.pageNumber != null) g.pages.add(ev.pageNumber);
    byDoc.set(ev.documentId, g);
  }
  if (!byDoc.size) return null;
  const items = [...byDoc.values()].slice(0, 3).map(({ ev, pages }) => ({
    documentId: ev.documentId, title: ev.title, publisher: ev.publisher, pages: [...pages].sort((a, b) => a - b),
  }));
  return { label: L.sources, pageWord: L.page, pagesWord: L.pages, items };
}

const HA_TO_ACRE=0.4047;
const UNIT_WORDS: Record<string,{kg:string;q:string;acre:string;note:string}> = {
  en:{kg:'kg',q:'quintal',acre:'per acre',note:'1 hectare ≈ 2.5 acres'},
  hi:{kg:'किलो',q:'क्विंटल',acre:'प्रति एकड़',note:'१ हेक्टेयर ≈ २.५ एकड़'},
  mr:{kg:'किलो',q:'क्विंटल',acre:'एकरी',note:'१ हेक्टर ≈ २.५ एकर'},
  gu:{kg:'કિલો',q:'ક્વિન્ટલ',acre:'એકર દીઠ',note:'૧ હેક્ટર ≈ ૨.૫ એકર'},
  pa:{kg:'ਕਿਲੋ',q:'ਕੁਇੰਟਲ',acre:'ਪ੍ਰਤੀ ਏਕੜ',note:'੧ ਹੈਕਟੇਅਰ ≈ ੨.੫ ਏਕੜ'},
};
const DEVANAGARI_DIGITS='०१२३४५६७८९';
function normaliseNumbers(s:string):string[]{const latin=s.replace(/[०-९]/g,d=>String(DEVANAGARI_DIGITS.indexOf(d)));return(latin.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>n.replace(',','.').replace(/\.0+$/,''));}
function evidenceNumberText(ev:Evidence):string{return `${ev.text} ${ev.sectionPath??''} ${ev.title??''}`;}
export function acreEquivalentsLine(answer:string,evidence:Evidence[],language:string):string{
  const W=UNIT_WORDS[language]??UNIT_WORDS.en; const ansNums=new Set(normaliseNumbers(answer)); const out:string[]=[]; const seen=new Set<string>();
  for(const ev of evidence) for(const m of evidenceNumberText(ev).matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(kg|kilograms?|quintals?|q)\s*(?:[a-z]+\s+)?(?:\/|per)\s*(?:ha|hectare)/gi)){
    const a=parseFloat(m[1]);const b=m[2]?parseFloat(m[2]):null;if(!ansNums.has(String(a))&&!(b!=null&&ansNums.has(String(b))))continue;
    const unit=/^q/i.test(m[3])?W.q:W.kg;const conv=(x:number)=>Math.round(x*HA_TO_ACRE*10)/10;const key=`${a}-${b}-${unit}`;if(seen.has(key))continue;seen.add(key);
    out.push(b!=null?`${conv(a)}–${conv(b)} ${unit} ${W.acre}`:`${conv(a)} ${unit} ${W.acre}`);
  }
  if(!out.length)return''; const line=`\n(${W.note}: ${out.join('; ')})`; return language==='mr'||language==='hi'?line.replace(/\d/g,d=>DEVANAGARI_DIGITS[Number(d)]):line;
}
const NUM_RE=/\d+(?:[.,]\d+)?/g;
export function unsupportedNumbers(answer:string,evidence:Evidence[],question:string):string[]{
  const allowed=new Set<string>([...normaliseNumbers(question),...evidence.flatMap(ev=>normaliseNumbers(evidenceNumberText(ev)))]);
  const stripped=answer.replace(/\[EVIDENCE\s+\d+\]/gi,' ').replace(/\[\d+(?:\s*,\s*\d+)*\]/g,' ');
  return[...new Set(normaliseNumbers(stripped).filter(n=>!allowed.has(n)))];
}
export function dropUnsupportedSentences(answer:string,evidence:Evidence[],question:string):string{
  return answer.split(/(?<=[.!?।])\s+|\n+/).filter(p=>p.trim()&&unsupportedNumbers(p,evidence,question).length===0).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}