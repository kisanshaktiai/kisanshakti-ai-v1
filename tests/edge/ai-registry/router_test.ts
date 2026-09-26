// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/router_test.ts
//
// CHANGE LOG
// 2026-09-25 — AI model SSOT Phase 1: behaviour locks for callAITask() in
//   supabase/functions/_shared/aiConfig.ts. The registry fixture is the live
//   ai_model_catalog / ai_task_route / ai_task_route_step / ai_model_pricing
//   rows read from project qfklkkzxemsbeniyugiz on 2026-09-25. No network:
//   the database is mocked and fetch is scripted per model.
//   Run with: deno test --allow-read --allow-env tests/edge/ai-registry/

import { assert, assertEquals } from "../../decision-brain/assert.ts";
import {
  AI_MODELS,
  _resetAIRegistryForTests,
  buildTaskRequest,
  callAITask,
  classifyAIFailure,
  loadAIRegistry,
  priceAICall,
  type AICatalogModel,
} from "../../../supabase/functions/_shared/aiConfig.ts";

const FIXTURE = JSON.parse(await Deno.readTextFile("tests/edge/ai-registry/fixture_live_registry_2026-09-25.json"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const model = (key: string): AICatalogModel => FIXTURE.ai_model_catalog.find((m: AICatalogModel) => m.model_key === key);

// deno-lint-ignore no-explicit-any
function mockDb(fixture: any, opts: { down?: boolean } = {}) {
  // deno-lint-ignore no-explicit-any
  const ledger: any[] = [];
  const db = {
    from(table: string) {
      if (table === "ai_model_metrics") {
        // deno-lint-ignore no-explicit-any
        return { insert: (row: any) => { ledger.push(row); return Promise.resolve({ error: null }); } };
      }
      // deno-lint-ignore no-explicit-any
      let rows: any[] = fixture[table] ?? [];
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select: () => q,
        order: () => q,
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; },
        // deno-lint-ignore no-explicit-any
        then: (res: any, rej: any) =>
          Promise.resolve(opts.down ? { data: null, error: { message: "db unreachable" } } : { data: rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
  return { db, ledger };
}

type Scripted = { status: number; body?: unknown; headers?: Record<string, string>; hang?: boolean };
// deno-lint-ignore no-explicit-any
const sent: Array<{ url: string; auth: string; body: any }> = [];
function scriptFetch(byModel: Record<string, Scripted[]>) {
  sent.length = 0;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url: String(url), auth: String((init.headers as Record<string, string>).Authorization), body });
    const next = byModel[body.model]?.shift();
    if (!next) throw new Error(`test: no scripted response for ${body.model}`);
    if (next.hang) {
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    }
    return Promise.resolve(new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {}),
      { status: next.status, headers: next.headers }));
  }) as typeof fetch;
}
const okBody = (text: string, usage: Record<string, unknown> = {}) => ({ choices: [{ message: { content: text } }], usage });

function setKeys(keys: { openai?: boolean; gemini?: boolean; lovable?: boolean }) {
  for (const [k, on] of [["OPENAI_API_KEY", keys.openai], ["GEMINI_API_KEY", keys.gemini], ["LOVABLE_API_KEY", keys.lovable]] as const) {
    if (on) Deno.env.set(k, `test-${k}`); else Deno.env.delete(k);
  }
}
function fresh(keys = { openai: true, gemini: true, lovable: true }) { _resetAIRegistryForTests(); setKeys(keys); }
const MSG = [{ role: "user", content: "farmer question" }];

// ── Contract: the request is built from the catalog row, not the model name ──
Deno.test("contract: gpt-6-luna gets max_completion_tokens, no temperature, keeps reasoning_effort none", () => {
  const body = buildTaskRequest(model("openai:gpt-6-luna"), MSG, { maxOutputTokens: 900, temperature: 0.3, reasoningEffort: "none" });
  assertEquals(body.max_completion_tokens, 900);
  assert(!("max_tokens" in body), "gpt-6 must not receive max_tokens (the old name regex would have sent it)");
  assert(!("temperature" in body), "temperature must be omitted for this contract");
  assertEquals(body.reasoning_effort, "none");
});

Deno.test("contract: gpt-4o keeps legacy max_tokens + temperature and never gets reasoning_effort", () => {
  const body = buildTaskRequest(model("openai:gpt-4o"), MSG, { maxOutputTokens: 500, temperature: 0.2, reasoningEffort: "none", jsonMode: true });
  assertEquals(body.max_tokens, 500);
  assertEquals(body.temperature, 0.2);
  assert(!("reasoning_effort" in body), "legacy model does not accept reasoning_effort");
  assertEquals(body.response_format, { type: "json_object" });
});

Deno.test("contract: gpt-5-mini drops reasoning_effort none (it only accepts minimal/low/medium/high) but keeps low", () => {
  assert(!("reasoning_effort" in buildTaskRequest(model("openai:gpt-5-mini"), MSG, { reasoningEffort: "none" })));
  assertEquals(buildTaskRequest(model("openai:gpt-5-mini"), MSG, { reasoningEffort: "low" }).reasoning_effort, "low");
});

// ── Zero behaviour change + ledger ──────────────────────────────────────────
Deno.test("brain.explain: first step is gpt-5.6-luna on the OpenAI endpoint; one ledger row with exact cost", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE));
  scriptFetch({ "gpt-5.6-luna": [{ status: 200, body: okBody("answer", { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 400 }, completion_tokens_details: { reasoning_tokens: 120 } }) }] });
  const r = await callAITask({ db, task: "brain.explain", functionName: "ai-agriculture-chat", messages: MSG, farmerId: "f-1", maxOutputTokens: 2800, temperature: 0.5 });
  assert(r.ok, "call should succeed");
  assertEquals(sent.length, 1);
  assertEquals(sent[0].url, "https://api.openai.com/v1/chat/completions");
  assertEquals(sent[0].auth, "Bearer test-OPENAI_API_KEY");
  assertEquals(sent[0].body.max_completion_tokens, 2800);
  assert(!("temperature" in sent[0].body), "luna contract omits temperature, exactly as aiConfig does today");
  assertEquals(ledger.length, 1);
  const row = ledger[0];
  assertEquals([row.model_name, row.model_requested, row.task_key, row.function_name, row.farmer_id], ["openai:gpt-5.6-luna", "openai:gpt-5.6-luna", "brain.explain", "ai-agriculture-chat", "f-1"]);
  assertEquals([row.error_class, row.error_rate, row.query_count, row.fallback_used], ["ok", 0, 1, false]);
  assertEquals(row.resource_usage, { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 500, reasoning_tokens: 120 });
  // (600 × 0.0002 + 400 × 0.00002 + 500 × 0.0012) / 1000 = 0.000728
  assertEquals(row.cost_usd, 0.000728);
  assertEquals(row.price_id, "e698dbc6-69fc-4f9b-a8de-811712a1c0dd");
  assert(!("tenant_id" in row), "tenant is derived by the database trigger, never sent by code");
});

// ── Fallback, cooldown, failure classes ─────────────────────────────────────
Deno.test("429 on OpenAI: falls to gemini step 2, then the next call skips OpenAI while it cools down", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE));
  scriptFetch({
    "gpt-5.6-luna": [{ status: 429, body: "rate limit", headers: { "Retry-After": "3" } }],
    "gemini-2.5-flash": [{ status: 200, body: okBody("from gemini") }, { status: 200, body: okBody("again gemini") }],
  });
  const r1 = await callAITask({ db, task: "brain.classify", functionName: "ai-agriculture-chat", messages: MSG });
  assert(r1.ok && r1.fallbackUsed && r1.modelKey === "gemini:gemini-2.5-flash", "must fall back to step 2");
  assertEquals(sent[1].url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assertEquals(ledger[0].model_requested, "openai:gpt-5.6-luna");
  assertEquals(ledger[0].metadata.attempts.map((a: { outcome: string }) => a.outcome), ["rate_limited", "ok"]);
  const r2 = await callAITask({ db, task: "rag.answer", functionName: "ai-general-chat", messages: MSG });
  assert(r2.ok, "second call succeeds");
  assertEquals(r2.attempts[0].outcome, "skipped_cooldown");
  assertEquals(sent.length, 3, "OpenAI must not be called during cooldown");
});

Deno.test("retired model (404 'no longer available') on every step: one failure ledger row, never throws", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE));
  scriptFetch({
    "gpt-5.6-luna": [{ status: 500, body: "upstream" }],
    "gemini-2.5-flash": [{ status: 404, body: "This model models/gemini-2.5-flash is no longer available." }],
  });
  const r = await callAITask({ db, task: "rag.normalize", functionName: "ai-general-chat", messages: MSG });
  assert(!r.ok && r.errorClass === "model_retired", "last failure class is reported");
  assertEquals(ledger.length, 1);
  assertEquals([ledger[0].error_class, ledger[0].error_rate, ledger[0].model_name, ledger[0].cost_usd], ["model_retired", 1, "gemini:gemini-2.5-flash", null]);
  assertEquals(ledger[0].metadata.attempts.map((a: { outcome: string }) => a.outcome), ["server_error", "model_retired"]);
});

Deno.test("provider without an API key is skipped, not called", async () => {
  fresh({ openai: true, gemini: true, lovable: false });
  const { db } = mockDb(clone(FIXTURE));
  scriptFetch({ "gemini-2.5-flash": [{ status: 200, body: okBody("ok") }] });
  const r = await callAITask({ db, task: "brain.translate", functionName: "ai-agriculture-chat", messages: MSG });
  assert(r.ok && r.modelKey === "gemini:gemini-2.5-flash");
  assertEquals(r.attempts[0].outcome, "skipped_no_key");
});

Deno.test("empty model content moves to the next step", async () => {
  fresh();
  const { db } = mockDb(clone(FIXTURE));
  scriptFetch({ "gpt-5.6-luna": [{ status: 200, body: okBody("   ") }], "gemini-2.5-flash": [{ status: 200, body: okBody("real text") }] });
  const r = await callAITask({ db, task: "rag.answer", functionName: "ai-general-chat", messages: MSG });
  assert(r.ok && r.content === "real text");
  assertEquals(r.attempts[0].outcome, "empty_output");
});

Deno.test("timeout: a hung provider is aborted inside the call budget", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE));
  scriptFetch({ "gpt-5.6-luna": [{ status: 200, hang: true }] });
  const t0 = Date.now();
  const r = await callAITask({ db, task: "brain.nlu", functionName: "ai-agriculture-chat", messages: MSG, timeoutMs: 1500 });
  assert(!r.ok && r.errorClass === "timeout", "hung call must end as timeout");
  assert(Date.now() - t0 < 2500, "must respect the budget");
  assertEquals(ledger[0].error_class, "timeout");
});

// ── Routes that must not call anything ──────────────────────────────────────
Deno.test("inactive route (vision.diagnose) and unknown task: no model call, no ledger row", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE));
  scriptFetch({});
  const a = await callAITask({ db, task: "vision.diagnose", functionName: "ai-agriculture-chat", messages: MSG });
  const b = await callAITask({ db, task: "no.such_task", functionName: "x", messages: MSG });
  assert(!a.ok && a.errorClass === "route_inactive");
  assert(!b.ok && b.errorClass === "route_missing");
  assertEquals([sent.length, ledger.length], [0, 0]);
});

// ── Route params (set by a super admin) override call-site defaults ────────
Deno.test("route params override call-site values", async () => {
  fresh();
  const fx = clone(FIXTURE);
  fx.ai_task_route.find((r: { task_key: string }) => r.task_key === "voice.navigate").params = { max_output_tokens: 300, temperature: 0.1, json_mode: true };
  const { db } = mockDb(fx);
  scriptFetch({ "gpt-4o-mini": [{ status: 200, body: okBody("{}") }] });
  await callAITask({ db, task: "voice.navigate", functionName: "voice-navigation-agent", messages: MSG, maxOutputTokens: 1000, temperature: 0.7 });
  assertEquals([sent[0].body.max_tokens, sent[0].body.temperature], [300, 0.1]);
  assertEquals(sent[0].body.response_format, { type: "json_object" });
});

// ── Prices ──────────────────────────────────────────────────────────────────
Deno.test("Lovable-gateway model has no price row: cost recorded as null, not guessed", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE));
  scriptFetch({ "google/gemini-3-flash-preview": [{ status: 200, body: okBody("ok", { prompt_tokens: 10, completion_tokens: 5 }) }] });
  await callAITask({ db, task: "community.moderate", functionName: "community-moderate", messages: MSG });
  assertEquals(sent[0].url, "https://ai.gateway.lovable.dev/v1/chat/completions");
  assertEquals([ledger[0].cost_usd, ledger[0].price_id], [null, null]);
});

Deno.test("price row is chosen by effective_from; a future price is not applied early", () => {
  const rows = [
    { id: "new", model_name: "m", input_cost_per_1k: 1, cached_input_cost_per_1k: null, output_cost_per_1k: 1, effective_from: "2026-12-01" },
    { id: "cur", model_name: "m", input_cost_per_1k: 0.5, cached_input_cost_per_1k: null, output_cost_per_1k: 0.5, effective_from: "2026-09-25" },
  ];
  const usage = { input_tokens: 1000, cached_input_tokens: 0, output_tokens: 0, reasoning_tokens: 0 };
  assertEquals(priceAICall(rows, usage, "2026-10-01"), { costUsd: 0.5, priceId: "cur" });
  assertEquals(priceAICall(rows, usage, "2026-12-02"), { costUsd: 1, priceId: "new" });
});

// ── Registry availability ───────────────────────────────────────────────────
Deno.test("cold start with the database down: EMERGENCY_DEFAULT uses AI_MODELS.openai.default and writes no ledger row", async () => {
  fresh();
  const { db, ledger } = mockDb(clone(FIXTURE), { down: true });
  scriptFetch({ [AI_MODELS.openai.default]: [{ status: 200, body: okBody("emergency answer") }] });
  const r = await callAITask({ db, task: "brain.explain", functionName: "ai-agriculture-chat", messages: MSG, maxOutputTokens: 100 });
  assert(r.ok && r.modelKey === `openai:${AI_MODELS.openai.default}`);
  assertEquals(ledger.length, 0);
});

Deno.test("refresh failure keeps serving the previous snapshot", async () => {
  fresh();
  const good = mockDb(clone(FIXTURE));
  assert((await loadAIRegistry(good.db)) !== null);
  const down = mockDb(clone(FIXTURE), { down: true });
  const snap = await loadAIRegistry(down.db, { force: true });
  assert(snap !== null && snap.routes.has("brain.explain"), "previous snapshot must still be served");
});

Deno.test("classifyAIFailure: quota vs rate limit vs contract", () => {
  assertEquals(classifyAIFailure(429, '{"error":{"code":"insufficient_quota"}}'), "quota_exhausted");
  assertEquals(classifyAIFailure(429, "slow down"), "rate_limited");
  assertEquals(classifyAIFailure(400, "Unsupported parameter: 'max_tokens'"), "contract_rejected");
  assertEquals(classifyAIFailure(503, ""), "server_error");
});
