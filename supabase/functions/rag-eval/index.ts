// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: supabase/functions/rag-eval/index.ts
//
// CHANGE LOG
// 2026-09-21 — RAG PHASE 0 (design v2 §3.6 "measurable", §4.1, §5): nightly
//   retrieval metrics over the golden set. Runs the SAME path General chat runs
//   (query normaliser → filters → ragRetrieve with identifiers, topics and the
//   reranker, with the same state and original-text fallbacks) for every active
//   row of rag_golden_questions and writes one rag_eval_runs row:
//     recall@10, MRR, nDCG@10          — document level, over the questions that
//                                        have expected documents
//     identifier_recall_at_10           — the slice of questions naming an
//                                        identifier; chunk level when expected
//                                        chunks are recorded, else document level
//     no_answer_correct_rate            — questions the corpus is NOT expected to
//                                        answer, scored on returning no evidence
//     no_evidence_rate, error_rate      — over answerable questions
//     p50 / p95 retrieval latency
//   Answer faithfulness is not measured here: it needs a generated answer per
//   question and belongs with the LLM path, not the retriever.
//
//   Ops-triggered only (service context or the vault sweep key `rag_eval_key`,
//   the same pattern as the schedule narration sweep). Not farmer-facing.
//   Retrievals are logged with purpose GOLDEN_EVAL so they never mix with
//   farmer traffic in rag_retrieval_logs statistics.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.2';
import { ragRetrieve, type RagResult } from '../_shared/ragRetrieval.ts';
import { normalizeQueryForRetrieval, loadTopicTaxonomy, resolveCropCode } from '../_shared/queryNormalizer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const K = 10;
const SWEEP_KEY_NAME = 'rag_eval_key';
const TIME_BUDGET_MS = 280_000; // under the 300 s cron timeout, leaving room to write the row

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

interface GoldenQuestion {
  id: string;
  question_text: string;
  language: string;
  expected_document_ids: string[];
  expected_chunk_ids: string[];
  identifiers: string[];
  crop_codes: string[] | null;
  state_codes: string[] | null;
  topic_codes: string[] | null;
}

interface QuestionOutcome {
  question_id: string;
  language: string;
  query_en: string;
  mode: string;
  latency_ms: number;
  retrieved_document_ids: string[];
  retrieved_chunk_ids: string[];
  expected_document_ids: string[];
  expected_chunk_ids: string[];
  identifier_question: boolean;
  no_answer_question: boolean;
  first_hit_rank: number | null;
  recall: number | null;
  ndcg: number | null;
  identifier_recall: number | null;
  no_answer_correct: boolean | null;
  error: string | null;
}

function dcg(hits: boolean[]): number {
  return hits.reduce((s, h, i) => s + (h ? 1 / Math.log2(i + 2) : 0), 0);
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

async function loadCorpusCrops(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('rag_documents').select('crop_codes').eq('is_active', true);
  const set = new Set<string>();
  for (const d of (data || []) as Array<{ crop_codes?: string[] | null }>) for (const c of d.crop_codes || []) if (c) set.add(String(c).toLowerCase());
  return [...set];
}

/** The General chat retrieval sequence: primary, then without the state filter, then the farmer's own words. */
async function retrieveLikeGeneralChat(
  supabase: SupabaseClient, q: GoldenQuestion, corpusCrops: string[], topics: Awaited<ReturnType<typeof loadTopicTaxonomy>>, runId: string,
): Promise<{ result: RagResult; queryEn: string }> {
  const normalized = await normalizeQueryForRetrieval(q.question_text, q.language, runId.slice(0, 8), corpusCrops, null, topics);
  const resolvedCrop = await resolveCropCode(supabase, normalized.cropHint);
  const cropCodes = resolvedCrop ? [resolvedCrop] : (q.crop_codes?.length ? q.crop_codes : null);
  const stateCodes = q.state_codes?.length ? q.state_codes : null;
  const topicCodes = normalized.topicCodes.length ? normalized.topicCodes : null;
  const audit = { traceId: runId.slice(0, 8), purpose: 'GOLDEN_EVAL' as const, queryOriginal: q.question_text, identifiers: normalized.identifiers, rerank: true, maxEvidence: K };
  let result = await ragRetrieve(supabase, normalized.query, q.language, { tenantId: null, stateCodes, cropCodes, topicCodes }, audit);
  if (result.belowThreshold && result.mode !== 'error' && stateCodes) {
    result = await ragRetrieve(supabase, normalized.query, q.language, { tenantId: null, cropCodes, topicCodes }, audit);
  }
  if (result.belowThreshold && result.mode !== 'error' && normalized.query !== q.question_text) {
    result = await ragRetrieve(supabase, q.question_text, q.language, { tenantId: null, cropCodes, topicCodes }, { ...audit, queryOriginal: null });
  }
  return { result, queryEn: normalized.query };
}

function scoreQuestion(q: GoldenQuestion, result: RagResult, queryEn: string): QuestionOutcome {
  const servable = result.evidence.filter((e) => e.servable);
  const docs: string[] = [];
  for (const e of servable) if (!docs.includes(e.documentId)) docs.push(e.documentId);
  const chunks = servable.map((e) => e.chunkId);
  const expectedDocs = q.expected_document_ids || [];
  const expectedChunks = q.expected_chunk_ids || [];
  const noAnswer = expectedDocs.length === 0;
  const identifierQ = (q.identifiers || []).length > 0;

  const out: QuestionOutcome = {
    question_id: q.id, language: q.language, query_en: queryEn, mode: result.mode, latency_ms: result.latencyMs,
    retrieved_document_ids: docs, retrieved_chunk_ids: chunks, expected_document_ids: expectedDocs, expected_chunk_ids: expectedChunks,
    identifier_question: identifierQ, no_answer_question: noAnswer,
    first_hit_rank: null, recall: null, ndcg: null, identifier_recall: null, no_answer_correct: null, error: result.error,
  };
  if (result.mode === 'error') return out;

  if (noAnswer) {
    out.no_answer_correct = servable.length === 0;
    return out;
  }
  const top = docs.slice(0, K);
  const hits = top.map((d) => expectedDocs.includes(d));
  const firstHit = hits.findIndex(Boolean);
  out.first_hit_rank = firstHit >= 0 ? firstHit + 1 : null;
  out.recall = expectedDocs.filter((d) => top.includes(d)).length / expectedDocs.length;
  const ideal = dcg(expectedDocs.slice(0, K).map(() => true));
  out.ndcg = ideal > 0 ? dcg(hits) / ideal : null;
  if (identifierQ) {
    out.identifier_recall = expectedChunks.length
      ? expectedChunks.filter((c) => chunks.slice(0, K).includes(c)).length / expectedChunks.length
      : out.recall;
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

  // ── Auth: service role, or the vault sweep key (cron cannot hold the service key)
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let allowed = Boolean(serviceRoleKey) && bearer === serviceRoleKey;
  if (!allowed && bearer) {
    const { data: sweepKey } = await supabase.rpc('get_sweep_key', { p_name: SWEEP_KEY_NAME });
    allowed = Boolean(sweepKey) && String(sweepKey) === bearer;
  }
  if (!allowed) return json(401, { error: 'Unauthorized' });

  const body = await req.json().catch(() => ({}));
  const trigger = body?.trigger === 'manual' ? 'manual' : 'nightly';
  const limit = Math.min(Math.max(Number(body?.limit) || 500, 1), 500);

  const { data: run, error: runErr } = await supabase
    .from('rag_eval_runs')
    .insert({ trigger, status: 'running' })
    .select('id')
    .single();
  if (runErr || !run) return json(500, { error: `Could not open eval run: ${runErr?.message}` });
  const runId = run.id as string;

  try {
    const { data: rows, error: qErr } = await supabase
      .from('rag_golden_questions')
      .select('id, question_text, language, expected_document_ids, expected_chunk_ids, identifiers, crop_codes, state_codes, topic_codes')
      .eq('is_active', true)
      .order('created_at')
      .limit(limit);
    if (qErr) throw new Error(`golden set read failed: ${qErr.message}`);
    const questions = (rows || []) as GoldenQuestion[];

    const [corpusCrops, topics] = await Promise.all([loadCorpusCrops(supabase), loadTopicTaxonomy(supabase)]);

    const outcomes: QuestionOutcome[] = [];
    for (const q of questions) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      try {
        const { result, queryEn } = await retrieveLikeGeneralChat(supabase, q, corpusCrops, topics, runId);
        outcomes.push(scoreQuestion(q, result, queryEn));
      } catch (e) {
        outcomes.push(scoreQuestion(q, { evidence: [], mode: 'error', belowThreshold: true, bestSemanticScore: null, embeddingModel: null, latencyMs: 0, traceNote: '', error: (e as Error).message }, q.question_text));
      }
    }

    const answerable = outcomes.filter((o) => !o.no_answer_question && o.mode !== 'error');
    const noAnswer = outcomes.filter((o) => o.no_answer_question && o.mode !== 'error');
    const identifierQs = answerable.filter((o) => o.identifier_question);
    const latencies = outcomes.map((o) => o.latency_ms).filter((n) => n > 0).sort((a, b) => a - b);
    const r4 = (x: number | null) => (x === null ? null : Number(x.toFixed(4)));

    const summary = {
      status: 'completed',
      finished_at: new Date().toISOString(),
      retrieval_config: {
        k: K, evidence_cut: K, rerank_requested: true,
        modes: outcomes.reduce((acc, o) => ({ ...acc, [o.mode]: (acc[o.mode] ?? 0) + 1 }), {} as Record<string, number>),
      },
      questions_total: questions.length,
      questions_evaluated: outcomes.length,
      recall_at_10: r4(mean(answerable.map((o) => o.recall ?? 0))),
      mrr: r4(mean(answerable.map((o) => (o.first_hit_rank ? 1 / o.first_hit_rank : 0)))),
      ndcg_at_10: r4(mean(answerable.map((o) => o.ndcg ?? 0))),
      identifier_recall_at_10: r4(mean(identifierQs.map((o) => o.identifier_recall ?? 0))),
      identifier_questions: identifierQs.length,
      no_answer_correct_rate: r4(mean(noAnswer.map((o) => (o.no_answer_correct ? 1 : 0)))),
      no_answer_questions: noAnswer.length,
      no_evidence_rate: r4(mean(answerable.map((o) => (o.retrieved_document_ids.length === 0 ? 1 : 0)))),
      error_rate: r4(outcomes.length ? outcomes.filter((o) => o.mode === 'error').length / outcomes.length : null),
      p50_latency_ms: percentile(latencies, 0.5),
      p95_latency_ms: percentile(latencies, 0.95),
      per_question: outcomes,
    };
    await supabase.from('rag_eval_runs').update(summary).eq('id', runId);
    console.log(`📊 rag-eval run=${runId} n=${outcomes.length}/${questions.length} recall@10=${summary.recall_at_10} mrr=${summary.mrr} ndcg@10=${summary.ndcg_at_10} id-recall=${summary.identifier_recall_at_10} errors=${summary.error_rate}`);
    return json(200, { run_id: runId, ...summary, per_question: undefined });
  } catch (e) {
    const message = (e as Error).message;
    await supabase.from('rag_eval_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error: message }).eq('id', runId);
    console.error(`[rag-eval] run=${runId} failed:`, message);
    return json(500, { run_id: runId, error: message });
  }
});
