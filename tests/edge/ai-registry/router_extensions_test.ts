// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/router_extensions_test.ts
//
// CHANGE LOG
// 2026-09-27 — AI model SSOT, all call sites: locks for the router additions every migrated call
//   site relies on (supabase/functions/_shared/aiConfig.ts):
//     * PARITY — for every live catalog model, buildTaskRequest() with the options the migrated
//       call sites pass produces the SAME body the old buildAIRequest() produced, so moving a call
//       onto the registry changes where the model comes from and nothing else;
//     * tools / toolChoice / responseFormat / jsonModeProviders pass-through;
//     * a function-calling answer (tool_calls, null content) is a success;
//     * mergeAIRouteParams: database params override caller defaults;
//     * resolveAITaskChain + recordAITaskCall (ai-smart-schedule's own retry loops);
//     * isNextGenOpenAIModel covers gpt-6 (legacy name-based paths).
//   Fixture: live registry read 2026-09-26. No network: database mocked, fetch scripted.
//   Run with: deno test --allow-read --allow-env tests/edge/ai-registry/

import { assert, assertEquals } from "../../decision-brain/assert.ts";
import {
  _resetAIRegistryForTests,
  classifyAIFailure,
  buildAIRequest,
  buildTaskRequest,
  callAITask,
  isNextGenOpenAIModel,
  mergeAIRouteParams,
  readAIUsage,
  recordAITaskCall,
  resolveAITaskChain,
  type AICatalogModel,
} from "../../../supabase/functions/_shared/aiConfig.ts";

const LIVE = JSON.parse(await Deno.readTextFile("tests/edge/ai-registry/fixture_live_registry_2026-09-26.json"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const model = (key: string): AICatalogModel => LIVE.ai_model_catalog.find((m: AICatalogModel) => m.model_key === key);
const MSG = [{ role: "system", content: "Return only valid JSON." }, { role: "user", content: "x" }];

// deno-lint-ignore no-explicit-any
function mockDb(fixture: any, opts: { down?: boolean } = {}) {
  // deno-lint-ignore no-explicit-any
  const ledger: any[] = [];
  const db = {
    from(table: string) {
      // deno-lint-ignore no-explicit-any
      if (table === "ai_model_metrics") return { insert: (row: any) => { ledger.push(row); return Promise.resolve({ error: null }); } };
      // deno-lint-ignore no-explicit-any
      let rows: any[] = fixture[table] ?? [];
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select: () => q, order: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        // deno-lint-ignore no-explicit-any
        then: (res: any, rej: any) => Promise.resolve(opts.down ? { data: null, error: { message: "down" } } : { data: rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
  return { db, ledger };
}
// deno-lint-ignore no-explicit-any
const sent: Array<{ url: string; body: any }> = [];
// deno-lint-ignore no-explicit-any
function scriptFetch(byModel: Record<string, Array<{ status: number; body: any }>>) {
  sent.length = 0;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url: String(url), body });
    const next = byModel[body.model]?.shift();
    if (!next) throw new Error(`test: no scripted response for ${body.model}`);
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
  }) as typeof fetch;
}
function keys() { _resetAIRegistryForTests(); for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "LOVABLE_API_KEY"]) Deno.env.set(k, `t-${k}`); }

// ── PARITY: registry request == old buildAIRequest request, for every routable live model ─────
const ROUTABLE = LIVE.ai_model_catalog.filter((m: AICatalogModel) => m.status === "active" || m.status === "deprecated") as AICatalogModel[];
// The one place the two builders legitimately differ: buildAIRequest sent reasoning_effort "none" to EVERY
// gpt-5.x/o-series name, including models whose contract rejects "none" (gpt-5-mini accepts
// minimal/low/medium/high only → the old body would have been refused with HTTP 400). The contract-built body
// leaves it out. No live call sends such a model through buildAIRequest (alert.enrich is hand-built).
// deno-lint-ignore no-explicit-any
function legacyAsContractAllows(m: AICatalogModel, body: any) {
  const b = { ...body };
  if ("reasoning_effort" in b && !m.api_contract.reasoning_efforts.includes(b.reasoning_effort)) delete b.reasoning_effort;
  return b;
}
Deno.test("parity exception is real: old builder sent reasoning_effort none to gpt-5-mini, whose contract rejects it", () => {
  const m = model("openai:gpt-5-mini");
  assertEquals(buildAIRequest(m.provider, m.api_model_id, MSG, { maxTokens: 10 }).reasoning_effort, "none");
  assert(!m.api_contract.reasoning_efforts.includes("none"));
  assert(!("reasoning_effort" in buildTaskRequest(m, MSG, { reasoningEffort: "none" })));
});

Deno.test("parity: schedule/general-chat style calls (buildAIRequest useJsonMode default) — same body for every live model", () => {
  for (const m of ROUTABLE) {
    for (const temperature of [0, 0.3]) {
      const legacy = buildAIRequest(m.provider, m.api_model_id, MSG, { maxTokens: 8000, temperature, useJsonMode: true });
      const registry = buildTaskRequest(m, MSG, mergeAIRouteParams({}, {
        maxOutputTokens: 8000, temperature, reasoningEffort: "none", jsonModeProviders: ["gemini", "lovable"],
      }));
      assertEquals(registry, legacyAsContractAllows(m, legacy), `${m.model_key} temperature=${temperature}`);
    }
  }
});

Deno.test("parity: useJsonMode:false callers (ai-general-chat) — same body for every live model", () => {
  for (const m of ROUTABLE) {
    const legacy = buildAIRequest(m.provider, m.api_model_id, MSG, { maxTokens: 4096, temperature: 0.6, useJsonMode: false });
    const registry = buildTaskRequest(m, MSG, mergeAIRouteParams({}, { maxOutputTokens: 4096, temperature: 0.6, reasoningEffort: "none" }));
    assertEquals(registry, legacyAsContractAllows(m, legacy), m.model_key);
  }
});

// ── Pass-through options ─────────────────────────────────────────────────────────────────────
Deno.test("jsonModeProviders: json_object only for the listed providers; explicit jsonMode wins; jsonMode:false disables", () => {
  const opts = { jsonModeProviders: ["gemini", "lovable"] as const };
  assertEquals(buildTaskRequest(model("gemini:gemini-3.5-flash-lite"), MSG, { ...opts, jsonModeProviders: [...opts.jsonModeProviders] }).response_format, { type: "json_object" });
  assert(!("response_format" in buildTaskRequest(model("openai:gpt-5.6-luna"), MSG, { jsonModeProviders: ["gemini", "lovable"] })));
  assertEquals(buildTaskRequest(model("openai:gpt-5.6-luna"), MSG, { jsonMode: true, jsonModeProviders: ["gemini"] }).response_format, { type: "json_object" });
  assert(!("response_format" in buildTaskRequest(model("gemini:gemini-3.5-flash-lite"), MSG, { jsonMode: false, jsonModeProviders: ["gemini"] })));
});

Deno.test("responseFormat (json_schema) wins over JSON mode; tools + tool_choice pass through unchanged", () => {
  const schema = { type: "json_schema", json_schema: { name: "p", schema: { type: "object" }, strict: true } };
  const tools = [{ type: "function", function: { name: "classify", parameters: { type: "object" } } }];
  const toolChoice = { type: "function", function: { name: "classify" } };
  const body = buildTaskRequest(model("lovable:google/gemini-3-flash-preview"), MSG, { responseFormat: schema, jsonMode: true, tools, toolChoice });
  assertEquals(body.response_format, schema);
  assertEquals(body.tools, tools);
  assertEquals(body.tool_choice, toolChoice);
  assert(!("tools" in buildTaskRequest(model("lovable:google/gemini-3-flash-preview"), MSG, {})), "no tools key unless asked");
});

Deno.test("mergeAIRouteParams: database route params override the caller's defaults; pass-through options are kept", () => {
  const merged = mergeAIRouteParams({ reasoning_effort: "low", max_output_tokens: 1200, json_mode: false }, {
    reasoningEffort: "none", maxOutputTokens: 8000, temperature: 0, jsonMode: true, jsonModeProviders: ["gemini"], tools: [1], toolChoice: "auto",
  });
  assertEquals(merged, { maxOutputTokens: 1200, temperature: 0, reasoningEffort: "low", jsonMode: false, jsonModeProviders: ["gemini"], responseFormat: undefined, tools: [1], toolChoice: "auto" });
});

// ── callAITask: function calling, api id, price id ───────────────────────────────────────────
Deno.test("callAITask: a tool_calls answer with null content is a success; toolCalls, apiModelId and priceId are returned", async () => {
  keys();
  const { db, ledger } = mockDb(LIVE);
  const toolCalls = [{ id: "c1", type: "function", function: { name: "classify", arguments: "{\"allowed\":true}" } }];
  scriptFetch({ "google/gemini-3-flash-preview": [{ status: 200, body: { choices: [{ message: { content: null, tool_calls: toolCalls } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } }] });
  const r = await callAITask({ db, task: "community.moderate", functionName: "community-moderate", messages: MSG,
    tools: [{ type: "function", function: { name: "classify", parameters: { type: "object" } } }], toolChoice: { type: "function", function: { name: "classify" } } });
  assert(r.ok, "tool answer must count as ok");
  if (r.ok) {
    assertEquals(r.content, "");
    assertEquals(r.toolCalls, toolCalls);
    assertEquals([r.apiModelId, r.provider], ["google/gemini-3-flash-preview", "lovable"]);
  }
  assertEquals(sent[0].url, "https://ai.gateway.lovable.dev/v1/chat/completions");
  assertEquals(sent[0].body.tool_choice, { type: "function", function: { name: "classify" } });
  assertEquals([ledger.length, ledger[0].task_key, ledger[0].error_class], [1, "community.moderate", "ok"]);
});

Deno.test("callAITask: without tools, a null-content answer is still empty_output (unchanged)", async () => {
  keys();
  const { db } = mockDb(LIVE);
  scriptFetch({ "gpt-4o-mini": [{ status: 200, body: { choices: [{ message: { content: null } }] } }] });
  const r = await callAITask({ db, task: "voice.navigate", functionName: "t", messages: MSG, maxOutputTokens: 150 });
  assert(!r.ok && r.errorClass === "empty_output");
});

Deno.test("callAITask: failure result carries the last HTTP status (call sites map 401/402/429 as before)", async () => {
  keys();
  const { db } = mockDb(LIVE);
  scriptFetch({ "gpt-4o": [{ status: 402, body: { error: "billing" } }] });
  const r = await callAITask({ db, task: "vision.crop_scan", functionName: "ai-crop-scan", messages: MSG, maxOutputTokens: 8000, jsonMode: true });
  assert(!r.ok && r.httpStatus === 402 && r.errorClass === "other");
});

// ── 2026-10-02 review fixes ───────────────────────────────────────────────────────────────
Deno.test("callAITask: minContentChars — a reply shorter than the minimum is empty_output and the chain moves on (forceTranslate's >30-character rule)", async () => {
  keys();
  const { db, ledger } = mockDb(LIVE);
  // brain.translate live chain: lovable gemini-3.8-flash → gemini-3.5-flash-lite → gpt-5.6-luna
  scriptFetch({
    "google/gemini-3.8-flash": [{ status: 200, body: { choices: [{ message: { content: "ok" } }] } }],
    "gemini-3.5-flash-lite": [{ status: 200, body: { choices: [{ message: { content: "x".repeat(40) } }], usage: { prompt_tokens: 5, completion_tokens: 40 } } }],
  });
  const r = await callAITask({ db, task: "brain.translate", functionName: "t", messages: MSG, minContentChars: 31 });
  assert(r.ok, "second step must answer");
  if (r.ok) assertEquals([r.apiModelId, r.fallbackUsed, r.content.length], ["gemini-3.5-flash-lite", true, 40]);
  assertEquals(r.attempts.map((a) => a.outcome), ["empty_output", "ok"]);
  assertEquals([ledger.length, ledger[0].model_name, ledger[0].fallback_used], [1, "gemini:gemini-3.5-flash-lite", true]);
});

Deno.test("classifyAIFailure: OpenAI's 'no credits remaining' 429 is quota_exhausted, and callAITask then cools the provider for minutes, not seconds", async () => {
  assertEquals(classifyAIFailure(429, JSON.stringify({ error: { message: "You have no credits remaining. Add credits to continue using the API", code: "insufficient_quota" } })), "quota_exhausted");
  assertEquals(classifyAIFailure(429, JSON.stringify({ error: { message: "You have no credits remaining." } })), "quota_exhausted");
  assertEquals(classifyAIFailure(429, JSON.stringify({ error: { message: "Rate limit reached for requests" } })), "rate_limited");
  keys();
  const { db } = mockDb(LIVE);
  // voice.navigate: single step gpt-4o-mini. First call: drained credits. Second call within seconds: provider skipped (cooling), no fetch.
  scriptFetch({ "gpt-4o-mini": [{ status: 429, body: { error: { message: "You have no credits remaining." } } }] });
  const r1 = await callAITask({ db, task: "voice.navigate", functionName: "t", messages: MSG, maxOutputTokens: 150 });
  assert(!r1.ok && r1.errorClass === "quota_exhausted" && r1.httpStatus === 429);
  const r2 = await callAITask({ db, task: "voice.navigate", functionName: "t", messages: MSG, maxOutputTokens: 150 });
  assert(!r2.ok && r2.errorClass === "no_provider_available");
  assertEquals(r2.attempts.map((a) => a.outcome), ["skipped_cooldown"]);
  assertEquals(sent.length, 1, "the drained provider must not be called again while cooling down");
});

// ── resolveAITaskChain + recordAITaskCall (ai-smart-schedule loops) ──────────────────────────
Deno.test("resolveAITaskChain: schedule.compose returns the live chain in step order; missing/inactive routes are reported", async () => {
  keys();
  const { db } = mockDb(LIVE);
  const r = await resolveAITaskChain(db, "schedule.compose");
  assert(r.ok);
  if (r.ok) assertEquals(r.chain.map((m) => m.model_key), ["lovable:google/gemini-3.8-flash", "openai:gpt-5.6-luna", "gemini:gemini-3.5-flash-lite"]);
  const missing = await resolveAITaskChain(db, "no.such_task");
  assert(!missing.ok && missing.errorClass === "route_missing");
  const fx = clone(LIVE); fx.ai_task_route.find((x: { task_key: string }) => x.task_key === "schedule.compose").is_active = false;
  _resetAIRegistryForTests();
  const inactive = await resolveAITaskChain(mockDb(fx).db, "schedule.compose");
  assert(!inactive.ok && inactive.errorClass === "route_inactive");
});

Deno.test("resolveAITaskChain: cold start with the database down → emergency default, flagged so no ledger row is written", async () => {
  keys();
  const { db, ledger } = mockDb(LIVE, { down: true });
  const r = await resolveAITaskChain(db, "schedule.compose");
  assert(r.ok && r.emergency && r.chain.length === 1);
  if (r.ok) await recordAITaskCall(db, { task: "schedule.compose", functionName: "t", model: r.chain[0], modelRequested: r.chain[0], ok: true, latencyMs: 1, emergency: r.emergency });
  assertEquals(ledger.length, 0);
});

Deno.test("recordAITaskCall: one ledger row, priced from ai_model_pricing, fallback flagged, usage in ledger shape", async () => {
  keys();
  const { db, ledger } = mockDb(LIVE);
  const usage = readAIUsage({ usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } } });
  await recordAITaskCall(db, { task: "schedule.compose", functionName: "ai-smart-schedule", model: model("openai:gpt-5.6-luna"), modelRequested: model("lovable:google/gemini-3.8-flash"),
    ok: true, httpStatus: 200, latencyMs: 1234, usage, farmerId: null, metadata: { caller: "narrateChunk" } });
  assertEquals(ledger.length, 1);
  const row = ledger[0];
  assertEquals([row.model_name, row.model_requested, row.task_key, row.error_class, row.fallback_used, row.error_rate], ["openai:gpt-5.6-luna", "lovable:google/gemini-3.8-flash", "schedule.compose", "ok", true, 0]);
  assertEquals(row.cost_usd, 0.0008); // 1000 × 0.0002/1k + 500 × 0.0012/1k (live gpt-5.6-luna price)
  assert(!("tenant_id" in row), "tenant is derived by the database trigger, never sent by code");
});

// ── Legacy name rule ─────────────────────────────────────────────────────────────────────────
Deno.test("isNextGenOpenAIModel covers gpt-6 and later; gpt-4o stays legacy", () => {
  for (const m of ["gpt-5.6-luna", "gpt-6-luna", "gpt-6", "openai/gpt-5-mini", "gpt-7-sol", "o3-mini"]) assert(isNextGenOpenAIModel(m), m);
  for (const m of ["gpt-4o", "gpt-4o-mini", "openai/gpt-4o-mini", "gemini-3.5-flash-lite"]) assert(!isNextGenOpenAIModel(m), m);
});
