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
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import { getEmbeddingProvider } from './embeddingProvider.ts';

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

const RRF_K = 60;
const CANDIDATES_PER_LEG = 20;
const MAX_EVIDENCE = 5;
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

export async function ragRetrieve(
  supabase: SupabaseClient,
  query: string,
  language: string,
  filters: RagFilters,
  audit: { sessionId?: string | null; turnId?: string | null; traceId?: string | null; farmerId?: string | null; tenantIdText?: string | null },
): Promise<RagResult> {
  const startedAt = Date.now();
  const provider = getEmbeddingProvider();
  let mode: 'fulltext' | 'hybrid' = 'fulltext';
  let embeddingModel: string | null = null;
  let traceNote = '';

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
      p_query: query,
      ...rpcArgs,
    });
    if (error) throw error;
    lexical = (data || []) as RpcRow[];
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

  const passing = ranked.filter((e) => e.rrf >= MIN_RRF_SCORE).slice(0, MAX_EVIDENCE);
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
      filters_applied: rpcArgs,
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
