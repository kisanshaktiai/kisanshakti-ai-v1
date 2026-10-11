// REPO: kisanshaktiai/kisanshakti-ai-v1 (farmer app)  BRANCH: decision-brain-update  (NEW FILE)
// PATH: tests/decision-brain/concept_retriever_test.ts
//
// CHANGE LOG
// 2026-10-11 — Decision Brain target flow step 1 (shadow): locks
//   * _shared/embeddingProvider.ts embedForTask(): model only from the registry route, request
//     shape from ai_model_catalog.api_contract.embedding, batching, unit-length vectors,
//     dimension check, one ledger row per provider call, no call when the route has no
//     embedding model;
//   * _shared/conceptIndex.ts: script class from Unicode properties, chip-marker stripping,
//     RPC brain_concept_search arguments;
//   * agents/concept-retriever.ts: flag off ⇒ no embedding call and no log row; flag on ⇒ one
//     shadow-log row with candidates next to the brain's intent/observations; failures become
//     status rows and never throw;
//   * source guards: no Indic-script text and no model id in the new runtime files; the
//     orchestrator starts the shadow without awaiting it and logs it before returning.
//   No network: database mocked, fetch scripted. Registry rows = live fixture 2026-09-26 plus the
//   catalog row / route / price that migration 20261010190000_brain_concept_index.sql inserts.
//   Run: deno test --allow-read --allow-env tests/decision-brain/concept_retriever_test.ts

import { assert, assertEquals } from './assert.ts';
import { _resetAIRegistryForTests } from '../../supabase/functions/_shared/aiConfig.ts';
import {
  applyEmbedTemplate,
  embedForTask,
  readEmbeddingContract,
} from '../../supabase/functions/_shared/embeddingProvider.ts';
import { classifyScript, conceptQueryText } from '../../supabase/functions/_shared/conceptIndex.ts';
import {
  buildShadowLogRow,
  finishConceptShadow,
  startConceptShadow,
} from '../../supabase/functions/ai-agriculture-chat/agents/concept-retriever.ts';

const LIVE = JSON.parse(await Deno.readTextFile('tests/edge/ai-registry/fixture_live_registry_2026-09-26.json'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// The rows the migration inserts (copied from the SQL file).
const EMBED_MODEL = {
  model_key: 'gemini:gemini-embedding-2', provider: 'gemini', api_model_id: 'gemini-embedding-2', status: 'active',
  input_modalities: ['text'],
  api_contract: {
    token_param: 'max_tokens', temperature: 'omit', reasoning_efforts: [],
    embedding: { api: 'gemini_batch_embed', dimensions: 768, batch_limit: 100, query_template: 'task: search result | query: {text}', document_template: 'title: none | text: {text}' },
  },
};

// deno-lint-ignore no-explicit-any
function registry(opts: { route?: boolean; steps?: string[] } = {}): any {
  const f = clone(LIVE);
  f.ai_model_catalog.push(clone(EMBED_MODEL));
  if (opts.route !== false) f.ai_task_route.push({ task_key: 'brain.embed', is_active: true, params: {}, prefer_free_pool: true });
  for (const [i, k] of (opts.steps ?? ['gemini:gemini-embedding-2']).entries()) f.ai_task_route_step.push({ task_key: 'brain.embed', step_no: i + 1, model_key: k });
  f.ai_model_pricing.push({ id: 'p-embed', model_name: 'gemini:gemini-embedding-2', effective_from: '2026-10-10', input_cost_per_1k: 0.0002, output_cost_per_1k: 0, cached_input_cost_per_1k: null, is_active: true, currency: 'USD' });
  f.ai_key_slot = [];
  f.ai_model_group = [];
  return f;
}

// deno-lint-ignore no-explicit-any
function mockDb(fixture: any, extra: { flag?: any; rpcRows?: any[]; rpcError?: string } = {}) {
  // deno-lint-ignore no-explicit-any
  const ledger: any[] = [];
  // deno-lint-ignore no-explicit-any
  const shadow: any[] = [];
  // deno-lint-ignore no-explicit-any
  const rpcCalls: Array<{ fn: string; args: any }> = [];
  // deno-lint-ignore no-explicit-any
  const db: any = {
    from(table: string) {
      // deno-lint-ignore no-explicit-any
      if (table === 'ai_model_metrics') return { insert: (row: any) => { ledger.push(row); return Promise.resolve({ error: null }); } };
      // deno-lint-ignore no-explicit-any
      if (table === 'brain_concept_shadow_log') return { insert: (row: any) => { shadow.push(row); return Promise.resolve({ error: null }); } };
      if (table === 'feature_flags') {
        // deno-lint-ignore no-explicit-any
        const q: any = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: extra.flag ?? null, error: null }) };
        return q;
      }
      // deno-lint-ignore no-explicit-any
      let rows: any[] = fixture[table] ?? [];
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select: () => q, order: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        // deno-lint-ignore no-explicit-any
        then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return q;
    },
    // deno-lint-ignore no-explicit-any
    rpc(fn: string, args: any) {
      rpcCalls.push({ fn, args });
      if (fn === 'ai_key_pool_usage_today') return Promise.resolve({ data: [], error: null });
      if (extra.rpcError) return Promise.resolve({ data: null, error: { message: extra.rpcError } });
      return Promise.resolve({ data: extra.rpcRows ?? [], error: null });
    },
  };
  return { db, ledger, shadow, rpcCalls };
}

// deno-lint-ignore no-explicit-any
const sent: Array<{ url: string; headers: Record<string, string>; body: any }> = [];
function vec(n: number, seed = 1): number[] {
  return Array.from({ length: n }, (_, i) => ((i % 7) + seed) / 10);
}
// deno-lint-ignore no-explicit-any
function scriptFetch(replies: Array<{ status: number; body?: any; dims?: number }>) {
  sent.length = 0;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url: String(url), headers: init.headers as Record<string, string>, body });
    const next = replies.shift();
    if (!next) throw new Error('test: no scripted reply');
    // deno-lint-ignore no-explicit-any
    const n = (body.requests ?? []).length;
    const payload = next.body ?? { embeddings: Array.from({ length: n }, (_, i) => ({ values: vec(next.dims ?? 768, i + 1) })), usageMetadata: { promptTokenCount: 10 * n } };
    return Promise.resolve(new Response(JSON.stringify(payload), { status: next.status }));
  }) as typeof fetch;
}
function keys(on = true) {
  _resetAIRegistryForTests();
  if (on) Deno.env.set('GEMINI_API_KEY', 't-GEMINI'); else Deno.env.delete('GEMINI_API_KEY');
}

// ── conceptIndex helpers ──────────────────────────────────────────────────────────────────────
Deno.test('classifyScript: Unicode script classes only', () => {
  assertEquals(classifyScript('पाने पिवळी'), 'native');
  assertEquals(classifyScript('pikat khup tan aale aahe'), 'latin');
  assertEquals(classifyScript('kds 726 पिक घ्यायचे'), 'mixed');
  assertEquals(classifyScript('10:42 ?'), 'none');
  assertEquals(classifyScript(''), 'none');
});

Deno.test('conceptQueryText: chip marker removed, whitespace collapsed', () => {
  assertEquals(conceptQueryText('abc  [obs_keys:x_y,z]  def'), 'abc def');
  assertEquals(conceptQueryText('[OBS_KEYS:a]'), '');
});

// ── embedding contract ───────────────────────────────────────────────────────────────────────
Deno.test('readEmbeddingContract: embedding model valid; chat model and bad contracts are null', () => {
  const c = readEmbeddingContract(EMBED_MODEL as never);
  assertEquals(c?.api, 'gemini_batch_embed');
  assertEquals(c?.dimensions, 768);
  assertEquals(c?.batch_limit, 100);
  assertEquals(readEmbeddingContract(LIVE.ai_model_catalog[0]), null);
  assertEquals(readEmbeddingContract({ api_contract: { embedding: { api: 'other', dimensions: 768 } } } as never), null);
  assertEquals(readEmbeddingContract({ api_contract: { embedding: { api: 'openai_embeddings', dimensions: 0 } } } as never), null);
});

Deno.test('applyEmbedTemplate: query and document templates from the contract', () => {
  const c = readEmbeddingContract(EMBED_MODEL as never)!;
  assertEquals(applyEmbedTemplate(c, 'query', 'Q'), 'task: search result | query: Q');
  assertEquals(applyEmbedTemplate(c, 'document', 'D'), 'title: none | text: D');
  assertEquals(applyEmbedTemplate({ ...c, query_template: undefined }, 'query', 'Q'), 'Q');
});

// ── embedForTask ─────────────────────────────────────────────────────────────────────────────
Deno.test('embedForTask: model from route, gemini request shape, unit vectors, ledger row', async () => {
  keys();
  const { db, ledger } = mockDb(registry());
  scriptFetch([{ status: 200 }]);
  const r = await embedForTask(db, 'brain.embed', ['a', 'b'], 'query', { functionName: 'test-fn', farmerId: null });
  assert(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  assertEquals(r.modelKey, 'gemini:gemini-embedding-2');
  assertEquals(r.vectors.length, 2);
  assertEquals(r.vectors[0].length, 768);
  const norm = Math.sqrt(r.vectors[0].reduce((s, x) => s + x * x, 0));
  assert(Math.abs(norm - 1) < 1e-9, `norm ${norm}`);
  assertEquals(sent.length, 1);
  assert(sent[0].url.endsWith('/models/gemini-embedding-2:batchEmbedContents'), sent[0].url);
  assertEquals(sent[0].headers['x-goog-api-key'], 't-GEMINI');
  assertEquals(sent[0].body.requests.length, 2);
  assertEquals(sent[0].body.requests[0].content.parts[0].text, 'task: search result | query: a');
  assertEquals(sent[0].body.requests[0].outputDimensionality, 768);
  assertEquals(sent[0].body.requests[0].model, 'models/gemini-embedding-2');
  assertEquals(ledger.length, 1);
  assertEquals(ledger[0].task_key, 'brain.embed');
  assertEquals(ledger[0].function_name, 'test-fn');
  assertEquals(ledger[0].error_class, 'ok');
  assertEquals(ledger[0].resource_usage.input_tokens, 20);
});

Deno.test('embedForTask: batches by batch_limit and keeps order', async () => {
  keys();
  const { db, ledger } = mockDb(registry());
  scriptFetch([{ status: 200 }, { status: 200 }]);
  const texts = Array.from({ length: 150 }, (_, i) => `t${i}`);
  const r = await embedForTask(db, 'brain.embed', texts, 'document', { functionName: 'f' });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(sent.length, 2);
  assertEquals(sent[0].body.requests.length, 100);
  assertEquals(sent[1].body.requests.length, 50);
  assertEquals(sent[1].body.requests[0].content.parts[0].text, 'title: none | text: t100');
  assertEquals(r.vectors.length, 150);
  assertEquals(ledger.length, 2);
});

Deno.test('embedForTask: wrong vector size is a failure, not silent data', async () => {
  keys();
  const { db, ledger } = mockDb(registry());
  scriptFetch([{ status: 200, dims: 3072 }]);
  const r = await embedForTask(db, 'brain.embed', ['a'], 'query', { functionName: 'f' });
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.reason, 'dimension_or_count_mismatch');
  assertEquals(ledger[0].error_class, 'empty_output');
});

Deno.test('embedForTask: HTTP 429 → http_429 and classified in the ledger', async () => {
  keys();
  const { db, ledger } = mockDb(registry());
  scriptFetch([{ status: 429, body: { error: { message: 'rate' } } }]);
  const r = await embedForTask(db, 'brain.embed', ['a'], 'query', { functionName: 'f' });
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.reason, 'http_429');
  assertEquals(ledger[0].error_class, 'rate_limited');
});

Deno.test('embedForTask: no route / chat model on route / no key → no provider call', async () => {
  keys();
  scriptFetch([]);
  let r = await embedForTask(mockDb(registry({ route: false, steps: [] })).db, 'brain.embed', ['a'], 'query', { functionName: 'f' });
  assertEquals(r.ok ? 'ok' : r.reason, 'route_missing');
  keys();
  r = await embedForTask(mockDb(registry({ steps: ['openai:gpt-5-mini'] })).db, 'brain.embed', ['a'], 'query', { functionName: 'f' });
  assertEquals(r.ok ? 'ok' : r.reason, 'no_embedding_model_on_route');
  keys(false);
  r = await embedForTask(mockDb(registry()).db, 'brain.embed', ['a'], 'query', { functionName: 'f' });
  assertEquals(r.ok ? 'ok' : r.reason, 'key_no_key');
  assertEquals(sent.length, 0);
});

// ── shadow retriever ─────────────────────────────────────────────────────────────────────────
const ON = { is_enabled: true, rollout_percentage: 100, target_tenants: [], target_users: [], flag_status: 'active', expires_at: null };
const OFF = { ...ON, is_enabled: false };
const FARMER = 'ec8135fc-3560-44f8-8a6e-f28589f580fb';

Deno.test('shadow: flag off ⇒ no embedding call, no log row', async () => {
  keys();
  const m = mockDb(registry(), { flag: OFF });
  scriptFetch([]);
  const h = startConceptShadow({ supabase: m.db, text: 'some farmer text', farmerId: FARMER, tenantId: 'x', traceId: 't1' });
  assert(h !== null);
  await finishConceptShadow(h, { intentCode: 'X' });
  assertEquals(sent.length, 0);
  assertEquals(m.shadow.length, 0);
  assertEquals(m.rpcCalls.filter((c) => c.fn === 'brain_concept_search').length, 0);
});

Deno.test('shadow: flag on ⇒ search with route model, one row next to the brain decision', async () => {
  keys();
  const rows = [
    { concept_kind: 'intent', concept_code: 'FERTILIZER_SCHEDULE', rrf: 0.032, sem_rank: 1, sem_score: 0.81, sem_text: 's', lex_rank: 2, lex_score: 0.5, lex_text: 'l', is_farmer_observable: null, category: 'nutrition' },
    { concept_kind: 'observation', concept_code: 'leaf_yellowing', rrf: 0.016, sem_rank: null, sem_score: null, sem_text: null, lex_rank: 1, lex_score: 0.9, lex_text: 'l2', is_farmer_observable: true, category: 'nutrient' },
  ];
  const m = mockDb(registry(), { flag: ON, rpcRows: rows });
  scriptFetch([{ status: 200 }]);
  const h = startConceptShadow({ supabase: m.db, text: 'farmer text [obs_keys:a]', farmerId: FARMER, tenantId: 'not-a-uuid', sessionId: 's1', traceId: 't2', language: 'mr' });
  await finishConceptShadow(h, { intentCode: 'FERTILIZER_SCHEDULE', observationCodes: ['a', 'a', 'b'], responseType: 'RECOMMENDATION' });
  const search = m.rpcCalls.find((c) => c.fn === 'brain_concept_search');
  assert(search, 'search rpc called');
  assertEquals(search!.args.p_model, 'gemini:gemini-embedding-2');
  assertEquals(search!.args.p_query_text, 'farmer text');
  assertEquals(JSON.parse(search!.args.p_query_embedding).length, 768);
  assertEquals(sent[0].body.requests[0].content.parts[0].text, 'task: search result | query: farmer text');
  assertEquals(m.shadow.length, 1);
  const row = m.shadow[0];
  assertEquals(row.status, 'ok');
  assertEquals(row.run_kind, 'chat');
  assertEquals(row.farmer_id, FARMER);
  assertEquals(row.tenant_id, null);
  assertEquals(row.query_text, 'farmer text [obs_keys:a]');
  assertEquals(row.script_class, 'latin');
  assertEquals(row.brain_intent, 'FERTILIZER_SCHEDULE');
  assertEquals(row.brain_observations, ['a', 'b']);
  assertEquals(row.response_type, 'RECOMMENDATION');
  assertEquals(row.candidates.length, 2);
  assertEquals(row.candidates[0].code, 'FERTILIZER_SCHEDULE');
  assertEquals(row.candidates[1].farmer_observable, true);
  assertEquals(row.embedding_model, 'gemini:gemini-embedding-2');
});

Deno.test('shadow: provider or search failure ⇒ error row, never a throw', async () => {
  keys();
  let m = mockDb(registry(), { flag: ON });
  scriptFetch([{ status: 500, body: { error: 'x' } }]);
  let h = startConceptShadow({ supabase: m.db, text: 'abc', farmerId: FARMER });
  await finishConceptShadow(h, {});
  assertEquals(m.shadow[0].status, 'error');
  assertEquals(m.shadow[0].status_detail, 'embed:http_500');
  keys();
  m = mockDb(registry(), { flag: ON, rpcError: 'boom' });
  scriptFetch([{ status: 200 }]);
  h = startConceptShadow({ supabase: m.db, text: 'abc', farmerId: FARMER });
  await finishConceptShadow(h, {});
  assertEquals(m.shadow[0].status, 'error');
  assertEquals(m.shadow[0].status_detail, 'search:boom');
});

Deno.test('shadow: empty or missing input ⇒ no handle', () => {
  assertEquals(startConceptShadow({ supabase: {}, text: '   ' }), null);
  assertEquals(startConceptShadow({ supabase: null, text: 'x' }), null);
});

Deno.test('buildShadowLogRow: observations de-duplicated and capped', () => {
  const row = buildShadowLogRow({ supabase: null, text: 'q' }, { status: 'ok', detail: null, scriptClass: 'latin', modelKey: 'm', embedMs: 1, searchMs: 2, candidates: [] },
    { observationCodes: Array.from({ length: 80 }, (_, i) => `c${i % 60}`) });
  assertEquals(row.brain_observations?.length, 50);
});

// ── source guards ────────────────────────────────────────────────────────────────────────────
Deno.test('source guard: new runtime files hold no Indic-script text and no model id', async () => {
  const files = [
    'supabase/functions/ai-agriculture-chat/agents/concept-retriever.ts',
    'supabase/functions/_shared/conceptIndex.ts',
    'supabase/functions/brain-concept-indexer/index.ts',
  ];
  const ep = await Deno.readTextFile('supabase/functions/_shared/embeddingProvider.ts');
  const epNew = ep.slice(ep.indexOf('REGISTRY-ROUTED EMBEDDINGS (Decision Brain concept retrieval)'));
  const srcs = await Promise.all(files.map((f) => Deno.readTextFile(f)));
  for (const [i, src] of [...srcs, epNew].entries()) {
    const name = files[i] ?? 'embeddingProvider.ts (new section)';
    assert(!/[ऀ-෿]/.test(src), `${name}: Indic-script text found`);
    assert(!/gemini-embedding|text-embedding|embed-multilingual/.test(src), `${name}: model id in code`);
  }
});

Deno.test('source guard: orchestrator starts the shadow detached and logs it before returning', async () => {
  const src = await Deno.readTextFile('supabase/functions/ai-agriculture-chat/agents/orchestrator.ts');
  assert(src.includes("from './concept-retriever.ts'"), 'import present');
  assert(/const _conceptShadow = startConceptShadow\(/.test(src), 'start present');
  assert(!/await\s+startConceptShadow/.test(src), 'start must not be awaited');
  assert(!/await\s+finishConceptShadow/.test(src), 'finish must not be awaited');
  const fin = src.indexOf('void finishConceptShadow(_conceptShadow');
  const ret = src.indexOf('return response;', fin);
  assert(fin > 0 && ret > fin && ret - fin < 800, 'finish runs right before return response');
  assert(src.includes('(this as any).__conceptShadowIntent = intentCode;'), 'intent captured');
});
