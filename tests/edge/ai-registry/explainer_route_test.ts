// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/explainer_route_test.ts
//
// CHANGE LOG
// 2026-09-26 — First call site on the AI model SSOT: the chat explainer
//   (agents/llm-response-formatter.ts explainerLLM) now calls
//   callAITask('brain.explain'). Live trace trace_muib5ioe_2jc6ov showed the
//   old hardcoded chain sending gpt-5.6-luna no reasoning_effort (API default
//   `medium`), timing out at 8 s on both passes, and the farmer getting a
//   facts-only card. The fixture is the live registry read on 2026-09-26 with
//   migration 20260926140000 applied (brain.explain reasoning_effort = low).
//   Run with: deno test --allow-read --allow-env --node-modules-dir=auto tests/edge/ai-registry/

import { assert, assertEquals } from "../../decision-brain/assert.ts";
import { _resetAIRegistryForTests, callAITask } from "../../../supabase/functions/_shared/aiConfig.ts";
import { explainerLLM } from "../../../supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts";

const LIVE = JSON.parse(await Deno.readTextFile("tests/edge/ai-registry/fixture_live_registry_2026-09-26.json"));
function withExplainReasoning() {
  const fx = JSON.parse(JSON.stringify(LIVE));
  fx.ai_task_route.find((r: { task_key: string }) => r.task_key === "brain.explain").params = { reasoning_effort: "low" };
  return fx;
}

// deno-lint-ignore no-explicit-any
function mockDb(fixture: any) {
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
        then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
  return { db, ledger };
}

type Scripted = { status?: number; text?: string; hang?: boolean };
// deno-lint-ignore no-explicit-any
const sent: Array<{ url: string; body: any }> = [];
function scriptFetch(byModel: Record<string, Scripted[]>) {
  sent.length = 0;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url: String(url), body });
    const next = byModel[body.model]?.shift();
    if (!next) throw new Error(`test: no scripted response for ${body.model}`);
    if (next.hang) return new Promise((_, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: next.text ?? "" } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }), { status: next.status ?? 200 }));
  }) as typeof fetch;
}
function keys() { _resetAIRegistryForTests(); for (const k of ["OPENAI_API_KEY", "GEMINI_API_KEY", "LOVABLE_API_KEY"]) Deno.env.set(k, `t-${k}`); }

Deno.test("explainerLLM: routes brain.explain → gpt-5.6-luna with reasoning_effort low, 2800 completion tokens, no temperature; ledger row carries farmer and trace", async () => {
  keys();
  const { db, ledger } = mockDb(withExplainReasoning());
  scriptFetch({ "gpt-5.6-luna": [{ text: "explained" }] });
  const out = await explainerLLM("sys", "user", { db, farmerId: "ec8135fc-3560-44f8-8a6e-f28589f580fb", traceId: "trace_x" });
  assertEquals(out, "explained");
  assertEquals(sent.length, 1);
  assertEquals(sent[0].url, "https://api.openai.com/v1/chat/completions");
  assertEquals(sent[0].body.reasoning_effort, "low");
  assertEquals(sent[0].body.max_completion_tokens, 2800);
  assert(!("temperature" in sent[0].body) && !("max_tokens" in sent[0].body), "luna contract: no temperature, no max_tokens");
  assertEquals([ledger[0].task_key, ledger[0].model_name, ledger[0].farmer_id, ledger[0].function_name], ["brain.explain", "openai:gpt-5.6-luna", "ec8135fc-3560-44f8-8a6e-f28589f580fb", "ai-agriculture-chat"]);
  assertEquals(ledger[0].metadata.trace_id, "trace_x");
});

Deno.test("explainerLLM: a hung gpt-5.6-luna is cut at its per-step cap and gemini-3.5-flash-lite answers with reasoning_effort low", async () => {
  keys();
  const { db, ledger } = mockDb(withExplainReasoning());
  scriptFetch({ "gpt-5.6-luna": [{ hang: true }], "gemini-3.5-flash-lite": [{ text: "from gemini" }] });
  const t0 = Date.now();
  const out = await explainerLLM("sys", "user", { db, farmerId: null, traceId: null });
  const ms = Date.now() - t0;
  assertEquals(out, "from gemini");
  assert(ms >= 7900 && ms < 9500, `luna must be cut at the 8 s step cap, not the 24 s budget (took ${ms} ms)`);
  assertEquals(sent[1].url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assertEquals(sent[1].body.reasoning_effort, "low");
  assertEquals(sent[1].body.max_tokens, 2800);
  assert(!("temperature" in sent[1].body), "Gemini 3 contract: no temperature");
  assertEquals(ledger[0].fallback_used, true);
  assertEquals(ledger[0].metadata.attempts.map((a: { outcome: string }) => a.outcome), ["timeout", "ok"]);
});

Deno.test("explainerLLM: when every model fails it throws, so the explainer keeps its facts-only fallback", async () => {
  keys();
  const { db, ledger } = mockDb(withExplainReasoning());
  scriptFetch({ "gpt-5.6-luna": [{ status: 500 }], "gemini-3.5-flash-lite": [{ status: 503 }], "google/gemini-3.8-flash": [{ status: 502 }] });
  let threw = false;
  try { await explainerLLM("sys", "user", { db }); } catch (e) { threw = (e as Error).message === "no LLM provider produced text for the explainer"; }
  assert(threw, "must throw the same error the explainer already handles");
  assertEquals([ledger.length, ledger[0].error_class], [1, "server_error"]);
});

Deno.test("router attemptTimeoutMs: without it the first step may use the whole budget (unchanged default behaviour)", async () => {
  keys();
  const { db } = mockDb(withExplainReasoning());
  scriptFetch({ "gpt-5.6-luna": [{ hang: true }] });
  const t0 = Date.now();
  const r = await callAITask({ db, task: "brain.explain", functionName: "t", messages: [{ role: "user", content: "x" }], timeoutMs: 1500 });
  assert(!r.ok && r.errorClass === "timeout", "budget exhausted on step 1");
  assert(Date.now() - t0 < 2500);
  assertEquals(r.attempts.length, 1);
});

Deno.test("chat index.ts passes the service-role client, farmer and trace to explainerLLM", async () => {
  const src = await Deno.readTextFile("supabase/functions/ai-agriculture-chat/index.ts");
  assert(/_explainerLLM\(system, user, \{ db: supabase, farmerId: finalFarmerId, traceId: _explainTrace \}\)/.test(src), "explainer call site must hand the router its db/farmer/trace");
  assert(!/llm: _explainerLLM,/.test(src), "the bare two-argument callback must not come back");
});
