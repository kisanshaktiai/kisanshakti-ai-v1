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

export type RetrievalPurpose =
  | 'GENERAL_CHAT'
  | 'SCHEDULE_DOCUMENT_SELECTION'
  | 'SCHEDULE_EXTRACTION'
  | 'SCHEDULE_VALIDATION';

export interface RagFilters {
  stateCodes?: string[] | null;
  cropCodes?: string[] | null;
  docTypes?: string[] | null;
  tenantId?: string | null;
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
  trustPrior: number | null;
  servable: boolean;
}

export interface RagResult {
  evidence: Evidence[];
  mode: 'fulltext' | 'hybrid';
  belowThreshold: boolean;
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
  purpose?: RetrievalPurpose;
  maxEvidence?: number;
  queryOriginal?: string | null;
}

const RRF_K = 60;
const CANDIDATES_PER_LEG = 30;
const MAX_EVIDENCE = 6;
const MIN_TRUST_FOR_OTHER_TIER = 0.6;
const LEXICAL_RELATIVE_CUTOFF = 0.4;

const AUTHORITY_BOOST: Record<string, number> = {
  central_govt: 1.15,
  icar: 1.15,
  state_agri_university: 1.10,
  state_govt: 1.10,
  kvk: 1.05,
  other: 1.0,
};

interface RetrievalTunables {
  min_semantic_score: number;
  gap_semantic_score: number;
}
const DEFAULT_TUNABLES: RetrievalTunables = { min_semantic_score: 0.45, gap_semantic_score: 0.55 };
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
}

const STOPWORDS = new Set([
  'and','or','the','for','of','in','on','to','is','are','a','an','what','how','much','many','per',
  'with','at','by','from','my','me','i','you','your','do','does','it','this','that','be','can','should',
  'about','when','which','will','need','needs','want','please','tell','kya','hai','ka','ki','ke','mein',
]);

export function cleanQueryForFulltext(q: string): string {
  const terms = q.toLowerCase().split(/[^\p{L}\p{N}.%/-]+/u).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return (terms.length ? terms : [q.trim()]).slice(0, 12).join(' ');
}

function skeleton(w: string): string {
  return w.length < 4 ? w : w[0] + w.slice(1).replace(/[aeiouy]/g, '');
}
function termMatches(qt: string, word: string): boolean {
  if (qt === word) return true;
  if (qt.length >= 5 && word.length >= 5 && (word.startsWith(qt) || qt.startsWith(word))) return true;
  return qt.length >= 5 && skeleton(qt) === skeleton(word);
}
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/\S*www\.\S*/g, ' ').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2);
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
    let score = coverage * 3 + (tf / lengthNorm) * 0.5 + secHits;
    const sec = row.section_path || '';
    if (!sec) score *= 0.4;
    else if ((sec.replace(/[^0-9.]/g, '').length / sec.length) > 0.5) score *= 0.5;
    if ((row.page_number ?? 99) <= 1) score *= 0.5;
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

  let lexical: RpcRow[] = [];
  try {
    const { data, error } = await supabase.rpc('rag_search_fulltext', {
      p_query: cleanQueryForFulltext(query),
      ...rpcArgs,
    });
    if (error) throw error;
    lexical = rerankLexical(query, (data || []) as RpcRow[])
      .filter((r) => r.coverage > 0)
      .map((r) => ({ ...r.row, score: Number(r.lexRank.toFixed(4)) }));
  } catch (e) {
    traceNote += `fulltext_err:${(e as Error).message};`;
  }

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

  const fused = new Map<string, { row: RpcRow; rrf: number; lex: number | null; sem: number | null }>();
  lexical.forEach((row, i) => {
    const e = fused.get(row.chunk_id) || { row, rrf: 0, lex: null, sem: null };
    e.rrf += 1 / (RRF_K + i + 1); e.lex = row.score; fused.set(row.chunk_id, e);
  });
  semantic.forEach((row, i) => {
    const e = fused.get(row.chunk_id) || { row, rrf: 0, lex: null, sem: null };
    e.rrf += 1 / (RRF_K + i + 1); e.sem = Number(row.score); fused.set(row.chunk_id, e);
  });

  const ranked = [...fused.values()]
    .map((e) => ({ ...e, final: e.rrf * (AUTHORITY_BOOST[e.row.authority_tier] ?? 1.0) }))
    .sort((a, b) => b.final - a.final);

  const topLex = Math.max(0, ...ranked.map((e) => e.lex ?? 0));
  const bestSem = semantic.length ? Math.max(...semantic.map((r) => Number(r.score))) : null;
  const semOk = (e: { sem: number | null }) => e.sem !== null && e.sem >= tun.min_semantic_score;
  const isFrontMatter = (row: RpcRow) => (row.page_number ?? 99) <= 1 && !row.section_path;

  const passing = ranked
    .filter((e) => !isFrontMatter(e.row))
    .filter((e) => semOk(e) || (e.lex !== null && e.lex >= 1.0))
    .filter((e) => semOk(e) || (e.lex !== null && e.lex >= topLex * LEXICAL_RELATIVE_CUTOFF))
    .slice(0, maxEvidence);

  // A candidate that passes the explicit gates is evidence. Do not apply a second
  // global cosine floor after this point: that previously turned valid evidence
  // into NO_EVIDENCE whenever bestSem was just below gap_semantic_score.
  const belowThreshold = passing.length === 0;
  if (mode === 'hybrid' && bestSem !== null && bestSem < tun.gap_semantic_score && passing.length) {
    traceNote += `semantic_gap_floor_not_applied:passing_candidate=${passing.length};`;
  }

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
    chunkId: e.row.chunk_id, documentId: e.row.document_id, text: e.row.chunk_text,
    sectionPath: e.row.section_path, pageNumber: e.row.page_number, language: e.row.language,
    title: e.row.title, publisher: e.row.publisher, authorityTier: e.row.authority_tier,
    docType: e.row.doc_type, docVersion: e.row.doc_version, rankScore: e.final,
    lexicalScore: e.lex, semanticScore: e.sem, trustPrior: trustByDoc.get(e.row.document_id) ?? null,
    servable: e.row.authority_tier !== 'other' || (trustByDoc.get(e.row.document_id) ?? 0) >= MIN_TRUST_FOR_OTHER_TIER,
  }));

  const latencyMs = Date.now() - startedAt;
  try {
    await supabase.from('rag_retrieval_logs').insert({
      session_id: audit.sessionId || null, turn_id: audit.turnId || null, trace_id: audit.traceId || null,
      tenant_id: audit.tenantIdText || null, farmer_id: audit.farmerId || null,
      query_text: query, query_language: language,
      filters_applied: { ...rpcArgs, purpose, query_original: audit.queryOriginal ?? null,
        gates: { min_semantic_score: tun.min_semantic_score, gap_semantic_score: tun.gap_semantic_score } },
      retrieval_mode: mode,
      chunks_returned: evidence.map((ev) => ({ chunk_id: ev.chunkId, document_id: ev.documentId, rank: ev.rankScore, lex: ev.lexicalScore, sem: ev.semanticScore })),
      top_score: bestSem, below_threshold: belowThreshold, embedding_model: embeddingModel,
      latency_ms: latencyMs, retrieval_purpose: purpose,
      document_ids: [...new Set(evidence.map((ev) => ev.documentId))], chunk_ids: evidence.map((ev) => ev.chunkId),
    });
  } catch (e) {
    console.warn('[ragRetrieval] audit log failed:', (e as Error).message);
  }

  return { evidence: belowThreshold ? [] : evidence, mode, belowThreshold, bestSemanticScore: bestSem, embeddingModel, latencyMs, traceNote };
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