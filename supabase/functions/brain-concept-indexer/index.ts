// REPO: kisanshaktiai/kisanshakti-ai-v1 (farmer app)  BRANCH: decision-brain-update  (NEW FILE)
// PATH: supabase/functions/brain-concept-indexer/index.ts
//
// CHANGE LOG
// 2026-10-11 — Decision Brain target flow step 1: builds and tests the concept index.
//   Ops-only: bearer = service-role key, or the vault key brain_concept_indexer_key read through
//   get_sweep_key() (so it can be called from SQL with net.http_post), the same rule as rag-eval.
//   Not farmer-facing.
//   POST JSON actions:
//     { action: 'status' }
//         counts: active phrases, embedded with the route's model, waiting, shadow-log rows.
//     { action: 'refresh' }
//         RPC brain_concept_index_refresh(): syncs the index from observation_aliases,
//         observation_translations and intent_translations (insert / reactivate / deactivate;
//         never deletes).
//     { action: 'embed', maxRows?: number, budgetMs?: number }
//         embeds active phrases that have no vector, or a vector from another model, with the
//         model on registry route brain.embed (embedForTask — no model name in code), in
//         batches, and stores them with RPC brain_concept_index_store_embeddings(). Call
//         repeatedly until `remaining` is 0.
//     { action: 'search', queries: string[], kinds?: ('observation'|'intent')[], limit?: number }
//         returns the candidates for up to 50 test questions (nothing written).
//     { action: 'eval', label: string, questions: [{ id: string, text: string }], limit?: number }
//         same search for up to 200 questions; writes one brain_concept_shadow_log row per
//         question with run_kind='eval' and status_detail '<label>:<id>', so results are read
//         and scored with SQL next to the graded answer key.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { embedForTask, readEmbeddingContract } from '../_shared/embeddingProvider.ts';
import { resolveAITaskChain } from '../_shared/aiConfig.ts';
import { classifyScript, conceptQueryText, searchConceptIndex } from '../_shared/conceptIndex.ts';

const TASK = 'brain.embed';
const OPS_KEY_NAME = 'brain_concept_indexer_key';
const FN = 'brain-concept-indexer';
const PAGE = 500;              // rows read per page while embedding
const STORE_CHUNK = 100;       // vectors per store RPC call
const DEFAULT_BUDGET_MS = 110_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// deno-lint-ignore no-explicit-any
async function currentModelKey(supabase: any): Promise<{ ok: true; modelKey: string } | { ok: false; error: string }> {
  const chain = await resolveAITaskChain(supabase, TASK);
  if (!chain.ok) return { ok: false, error: `${chain.errorClass}: ${chain.detail}` };
  if (chain.emergency) return { ok: false, error: 'registry_unavailable' };
  const model = chain.chain.find((m) => readEmbeddingContract(m) !== null);
  return model ? { ok: true, modelKey: model.model_key } : { ok: false, error: `no embedding model on route ${TASK}` };
}

// deno-lint-ignore no-explicit-any
async function pendingRows(supabase: any, modelKey: string, limit: number): Promise<Array<{ id: number; surface_text: string }>> {
  const { data: fresh, error: e1 } = await supabase
    .from('brain_concept_index').select('id, surface_text')
    .eq('is_active', true).is('embedding', null)
    .order('id', { ascending: true }).limit(limit);
  if (e1) throw new Error(`read_pending: ${e1.message}`);
  if (fresh && fresh.length) return fresh;
  const { data: stale, error: e2 } = await supabase
    .from('brain_concept_index').select('id, surface_text')
    .eq('is_active', true).not('embedding_model', 'is', null).neq('embedding_model', modelKey)
    .order('id', { ascending: true }).limit(limit);
  if (e2) throw new Error(`read_stale: ${e2.message}`);
  return stale ?? [];
}

// deno-lint-ignore no-explicit-any
async function countRows(supabase: any, build: (q: any) => any): Promise<number | null> {
  const { count, error } = await build(supabase.from('brain_concept_index').select('id', { count: 'exact', head: true }));
  return error ? null : (count ?? 0);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);
  // Auth: service role, or the vault ops key (SQL net.http_post cannot hold the service key) —
  // the same rule as rag-eval.
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let allowed = Boolean(serviceRoleKey) && bearer === serviceRoleKey;
  if (!allowed && bearer) {
    const { data: opsKey } = await supabase.rpc('get_sweep_key', { p_name: OPS_KEY_NAME });
    allowed = Boolean(opsKey) && String(opsKey) === bearer;
  }
  if (!allowed) return json(401, { error: 'Unauthorized' });

  // deno-lint-ignore no-explicit-any
  const body: any = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');

  try {
    if (action === 'status') {
      const mk = await currentModelKey(supabase);
      const modelKey = mk.ok ? mk.modelKey : null;
      const active = await countRows(supabase, (q) => q.eq('is_active', true));
      const embedded = modelKey ? await countRows(supabase, (q) => q.eq('is_active', true).eq('embedding_model', modelKey)) : null;
      const waiting = await countRows(supabase, (q) => q.eq('is_active', true).is('embedding', null));
      const { count: logRows } = await supabase.from('brain_concept_shadow_log').select('id', { count: 'exact', head: true });
      return json(200, { action, route: TASK, model: modelKey, model_error: mk.ok ? null : mk.error, active, embedded_with_route_model: embedded, waiting_without_vector: waiting, shadow_log_rows: logRows ?? null });
    }

    if (action === 'refresh') {
      const { data, error } = await supabase.rpc('brain_concept_index_refresh');
      if (error) return json(500, { action, error: error.message });
      return json(200, { action, result: Array.isArray(data) ? data[0] : data });
    }

    if (action === 'embed') {
      const t0 = Date.now();
      const budget = Math.min(Math.max(Number(body?.budgetMs) || DEFAULT_BUDGET_MS, 5_000), 140_000);
      const maxRows = Math.min(Math.max(Number(body?.maxRows) || 5_000, 1), 20_000);
      const mk = await currentModelKey(supabase);
      if (!mk.ok) return json(500, { action, error: mk.error });
      let embedded = 0;
      let failures: Array<{ reason: string; rows: number }> = [];
      const modelsUsed = new Set<string>();
      while (embedded < maxRows && Date.now() - t0 < budget - 10_000) {
        const rows = await pendingRows(supabase, mk.modelKey, Math.min(PAGE, maxRows - embedded));
        if (!rows.length) break;
        const res = await embedForTask(supabase, TASK, rows.map((r) => r.surface_text), 'document', {
          functionName: FN, timeoutMs: Math.max(5_000, budget - (Date.now() - t0) - 5_000),
          metadata: { action: 'embed', rows: rows.length },
        });
        if (!res.ok) { failures.push({ reason: res.reason, rows: rows.length }); break; }
        modelsUsed.add(res.modelKey);
        for (let i = 0; i < rows.length; i += STORE_CHUNK) {
          const chunk = rows.slice(i, i + STORE_CHUNK).map((r, j) => ({ id: r.id, embedding: JSON.stringify(res.vectors[i + j]) }));
          const { data: stored, error } = await supabase.rpc('brain_concept_index_store_embeddings', { p_rows: chunk, p_model: res.modelKey });
          if (error) { failures.push({ reason: `store: ${error.message}`, rows: chunk.length }); break; }
          embedded += Number(stored ?? 0);
        }
        if (failures.length) break;
      }
      const remaining = (await pendingRows(supabase, mk.modelKey, 1)).length > 0;
      failures = failures.slice(0, 5);
      return json(failures.length ? 502 : 200, { action, model_route: mk.modelKey, models_used: [...modelsUsed], embedded, remaining_work: remaining, failures, ms: Date.now() - t0 });
    }

    if (action === 'search' || action === 'eval') {
      const isEval = action === 'eval';
      const label = String(body?.label ?? '').trim().slice(0, 60);
      if (isEval && !label) return json(400, { action, error: 'label is required for eval' });
      // deno-lint-ignore no-explicit-any
      const items: Array<{ id: string; text: string }> = isEval
        ? (Array.isArray(body?.questions) ? body.questions : []).map((q: any, i: number) => ({ id: String(q?.id ?? i + 1), text: String(q?.text ?? '') }))
        : (Array.isArray(body?.queries) ? body.queries : []).map((t: unknown, i: number) => ({ id: String(i + 1), text: String(t ?? '') }));
      const cap = isEval ? 200 : 50;
      const list = items.map((q) => ({ ...q, query: conceptQueryText(q.text) })).filter((q) => q.query).slice(0, cap);
      if (!list.length) return json(400, { action, error: 'no questions' });
      const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 50);
      const kinds = Array.isArray(body?.kinds) ? body.kinds.filter((k: unknown) => k === 'observation' || k === 'intent') : null;

      const emb = await embedForTask(supabase, TASK, list.map((q) => q.query), 'query', { functionName: FN, timeoutMs: 60_000, metadata: { action, n: list.length } });
      if (!emb.ok) return json(502, { action, error: `embed: ${emb.reason}`, model: emb.modelKey });
      const perQueryEmbedMs = Math.round(emb.latencyMs / list.length);

      // deno-lint-ignore no-explicit-any
      const out: any[] = [];
      // deno-lint-ignore no-explicit-any
      const logRows: any[] = [];
      for (let i = 0; i < list.length; i++) {
        const q = list[i];
        const found = await searchConceptIndex(supabase, q.query, emb.vectors[i], emb.modelKey, { limit, kinds });
        out.push({ id: q.id, text: q.text, ok: found.ok, search_ms: found.ms, ...(found.ok ? { candidates: found.candidates } : { error: found.error }) });
        if (isEval) {
          logRows.push({
            run_kind: 'eval', query_text: q.text, script_class: classifyScript(q.query),
            status: found.ok ? 'ok' : 'error', status_detail: found.ok ? `${label}:${q.id}` : `${label}:${q.id} ${found.error}`,
            embedding_model: emb.modelKey, embed_ms: perQueryEmbedMs, search_ms: found.ms,
            candidates: found.ok ? found.candidates : [],
          });
        }
      }
      if (isEval) {
        const { error } = await supabase.from('brain_concept_shadow_log').insert(logRows);
        if (error) return json(500, { action, error: `log insert: ${error.message}` });
        return json(200, { action, label, model: emb.modelKey, questions: list.length, written: logRows.length, embed_ms_total: emb.latencyMs });
      }
      return json(200, { action, model: emb.modelKey, embed_ms_total: emb.latencyMs, results: out });
    }

    return json(400, { error: `unknown action '${action}' — use status | refresh | embed | search | eval` });
  } catch (e) {
    return json(500, { action, error: e instanceof Error ? e.message : String(e) });
  }
});
