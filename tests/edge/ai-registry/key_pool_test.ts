// REPO: kisanshaktiai/kisanshakti-ai-v1  BRANCH: kisanshakti-ai-update  (NEW FILE)
// PATH: tests/edge/ai-registry/key_pool_test.ts
//
// CHANGE LOG
// 2026-10-04 — FREE TIER FIRST: locks the chain-ordering rules added to aiConfig.ts
//   (orderChainByFreePool, used by callAITask and resolveAITaskChain):
//     * a route whose step 1 would be billed and whose later step has complimentary-pool room is
//       reordered so the free step is tried first; the ledger records free_first + route_step1;
//     * the reorder is stable and two-tier, so the admin's step_no order is kept inside each tier;
//     * prefer_free_pool = false, a single-step chain, an unreadable usage read, or a chain whose
//       steps are all in the same tier all leave the order exactly as the admin set it;
//     * a failed usage read is now reported as pool "unknown", not "paid" (it was indistinguishable
//       in the ledger from a deliberate paid call).
// 2026-10-03 — AI control plane Phase 2a (key pool): locks the key-rotation rules of
//   supabase/functions/_shared/aiConfig.ts (pickAIKey / callAITask / recordAITaskCall):
//     * no ai_key_slot rows (before migration 20261003100000) ⇒ the provider's single secret, slot 1;
//     * the first enabled key with free-pool room for the model's group is used ("free"); a key whose
//       pool is spent is passed over; when every pool is spent the lowest key carries paid traffic;
//     * a 429 cools ONE key and the same model is retried at once on the next key; the cooled key is
//       skipped without a request on the next call;
//     * tokens used by this isolate count against the pool before the ledger is re-read;
//     * a key whose secret is missing is skipped; a failed usage read ⇒ paid on the lowest key;
//     * the ledger row records key_slot / pool / pool_group (callAITask and recordAITaskCall).
//   Fixture: live registry read 2026-09-26 + key-pool rows as the migration seeds them (slots 2 and 3
//   enabled here). No network: database mocked, fetch scripted.
//   Run with: deno test --allow-read --allow-env tests/edge/ai-registry/

import { assert, assertEquals } from "../../decision-brain/assert.ts";
import {
  _resetAIRegistryForTests,
  aiModelGroupKey,
  callAITask,
  hasAIProviderKey,
  loadAIRegistry,
  pickAIKey,
  recordAITaskCall,
  resolveAITaskChain,
  type AICatalogModel,
} from "../../../supabase/functions/_shared/aiConfig.ts";

const LIVE = JSON.parse(await Deno.readTextFile("tests/edge/ai-registry/fixture_live_registry_2026-09-26.json"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const model = (key: string): AICatalogModel => LIVE.ai_model_catalog.find((m: AICatalogModel) => m.model_key === key);
const MSG = [{ role: "user", content: "x" }];
const OK = (tokensIn = 1000, tokensOut = 200) => ({ status: 200, body: { choices: [{ message: { content: "answer text" } }], usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut } } });

const GROUPS = [
  { group_key: "openai_big", provider: "openai", is_active: true, api_model_ids: ["gpt-6-luna", "gpt-4o", "gpt-5"] },
  { group_key: "openai_mini", provider: "openai", is_active: true, api_model_ids: ["gpt-5.6-luna", "gpt-5-mini", "gpt-4o-mini"] },
];
const POOL: Record<string, number> = { openai_big: 250000, openai_mini: 2500000 };
function slots(enabled: number[] = [1, 2, 3]) {
  return [1, 2, 3].map((n) => ({ provider: "openai", slot_no: n, env_var: n === 1 ? "OPENAI_API_KEY" : `OPENAI_API_KEY_${n}`, is_enabled: enabled.includes(n), daily_pool: POOL, reserve_tokens: 20000 }))
    .concat([{ provider: "gemini", slot_no: 1, env_var: "GEMINI_API_KEY", is_enabled: true, daily_pool: {}, reserve_tokens: 0 }, { provider: "lovable", slot_no: 1, env_var: "LOVABLE_API_KEY", is_enabled: true, daily_pool: {}, reserve_tokens: 0 }]);
}
type UsageRow = { provider: string; key_slot: number; group_key: string | null; tokens: number; calls: number };

// deno-lint-ignore no-explicit-any
function mockDb(fixture: any, opts: { usage?: UsageRow[] | "error" | "no_rpc"; slotTableError?: boolean } = {}) {
  // deno-lint-ignore no-explicit-any
  const ledger: any[] = [];
  let rpcCalls = 0;
  // deno-lint-ignore no-explicit-any
  const db: any = {
    from(table: string) {
      // deno-lint-ignore no-explicit-any
      if (table === "ai_model_metrics") return { insert: (row: any) => { ledger.push(row); return Promise.resolve({ error: null }); } };
      const broken = opts.slotTableError && (table === "ai_key_slot" || table === "ai_model_group");
      // deno-lint-ignore no-explicit-any
      let rows: any[] = fixture[table] ?? [];
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select: () => q, order: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        // deno-lint-ignore no-explicit-any
        then: (res: any, rej: any) => Promise.resolve(broken ? { data: null, error: { message: `relation "${table}" does not exist` } } : { data: rows, error: null }).then(res, rej),
      };
      return q;
    },
  };
  if (opts.usage !== "no_rpc") {
    db.rpc = (fn: string) => {
      rpcCalls++;
      assertEquals(fn, "ai_key_pool_usage_today");
      if (opts.usage === "error") return Promise.resolve({ data: null, error: { message: "function does not exist" } });
      return Promise.resolve({ data: opts.usage ?? [], error: null });
    };
  }
  return { db, ledger, rpcCalls: () => rpcCalls };
}
// deno-lint-ignore no-explicit-any
const sent: Array<{ url: string; auth: string; body: any }> = [];
// deno-lint-ignore no-explicit-any
function scriptFetch(byModel: Record<string, Array<{ status: number; body: any; headers?: Record<string, string> }>>) {
  sent.length = 0;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ url: String(url), auth: String((init.headers as Record<string, string>).Authorization ?? ""), body });
    const next = byModel[body.model]?.shift();
    if (!next) throw new Error(`test: no scripted response for ${body.model}`);
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers }));
  }) as typeof fetch;
}
function keys(present: string[] = ["OPENAI_API_KEY", "OPENAI_API_KEY_2", "OPENAI_API_KEY_3", "GEMINI_API_KEY", "LOVABLE_API_KEY"]) {
  _resetAIRegistryForTests();
  for (const k of ["OPENAI_API_KEY", "OPENAI_API_KEY_2", "OPENAI_API_KEY_3", "GEMINI_API_KEY", "LOVABLE_API_KEY"]) {
    if (present.includes(k)) Deno.env.set(k, `t-${k}`); else Deno.env.delete(k);
  }
}
function poolFixture(enabled: number[] = [1, 2, 3]) {
  const f = clone(LIVE);
  f.ai_key_slot = slots(enabled);
  f.ai_model_group = GROUPS;
  return f;
}
const slotOf = (auth: string) => auth === "Bearer t-OPENAI_API_KEY" ? 1 : auth === "Bearer t-OPENAI_API_KEY_2" ? 2 : auth === "Bearer t-OPENAI_API_KEY_3" ? 3 : NaN;

// ── group lookup ─────────────────────────────────────────────────────────────────────────────
Deno.test("aiModelGroupKey: exact member match without the date suffix; no group ⇒ null", () => {
  const snap = { groups: GROUPS as never };
  assertEquals(aiModelGroupKey(snap, { provider: "openai", api_model_id: "gpt-5.6-luna" }), "openai_mini");
  assertEquals(aiModelGroupKey(snap, { provider: "openai", api_model_id: "gpt-5-mini-2025-08-07" }), "openai_mini");
  assertEquals(aiModelGroupKey(snap, { provider: "openai", api_model_id: "gpt-4o" }), "openai_big");
  assertEquals(aiModelGroupKey(snap, { provider: "openai", api_model_id: "gpt-4o-mini" }), "openai_mini", "gpt-4o-mini is not a prefix match of gpt-4o");
  assertEquals(aiModelGroupKey(snap, { provider: "gemini", api_model_id: "gemini-3.5-flash-lite" }), null);
  assertEquals(aiModelGroupKey(null, { provider: "openai", api_model_id: "gpt-4o" }), null);
});

// ── before the migration: unchanged behaviour ────────────────────────────────────────────────
Deno.test("no ai_key_slot rows ⇒ the provider's single secret as slot 1, pool none; ledger carries key_slot 1", async () => {
  keys();
  const { db, ledger } = mockDb(LIVE);
  scriptFetch({ "gpt-5.6-luna": [OK()] });
  const r = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(r.ok);
  assertEquals(sent[0].auth, "Bearer t-OPENAI_API_KEY");
  assertEquals(r.attempts, [{ model_key: "openai:gpt-5.6-luna", outcome: "ok", http_status: 200, ms: r.attempts[0].ms, key_slot: 1, pool: "none" }]);
  assertEquals([ledger[0].metadata.key_slot, ledger[0].metadata.pool, ledger[0].metadata.pool_group], [1, "none", null]);
});

Deno.test("ai_key_slot / ai_model_group reads failing (tables absent) does not fail the registry load", async () => {
  keys();
  const { db } = mockDb(LIVE, { slotTableError: true });
  const snap = await loadAIRegistry(db);
  assert(snap !== null && snap.routes.size > 0 && snap.keySlots.size === 0 && snap.groups.length === 0);
  const pick = await pickAIKey(db, model("openai:gpt-5.6-luna"));
  assertEquals(pick, { apiKey: "t-OPENAI_API_KEY", slot: 1, pool: "none", group: null });
});

// ── pool-first selection ─────────────────────────────────────────────────────────────────────
Deno.test("first key with free-pool room is used: slot 1 pool spent ⇒ slot 2 'free'; model group recorded", async () => {
  keys();
  const { db, ledger } = mockDb(poolFixture(), { usage: [{ provider: "openai", key_slot: 1, group_key: "openai_mini", tokens: 2_490_000, calls: 900 }] });
  scriptFetch({ "gpt-5.6-luna": [OK()] });
  const r = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(r.ok);
  assertEquals(slotOf(sent[0].auth), 2, "2,490,000 used + 20,000 reserve ≥ 2,500,000 ⇒ slot 1 has no room");
  assertEquals([ledger[0].metadata.key_slot, ledger[0].metadata.pool, ledger[0].metadata.pool_group], [2, "free", "openai_mini"]);
});

Deno.test("pools are per group: slot 1's mini pool spent does not block its big pool (gpt-4o on slot 1 'free')", async () => {
  keys();
  const { db } = mockDb(poolFixture(), { usage: [{ provider: "openai", key_slot: 1, group_key: "openai_mini", tokens: 2_600_000, calls: 900 }] });
  const pick = await pickAIKey(db, model("openai:gpt-4o"));
  assertEquals(pick, { apiKey: "t-OPENAI_API_KEY", slot: 1, pool: "free", group: "openai_big" });
});

Deno.test("every pool spent ⇒ the lowest enabled key carries paid traffic ('paid'), no rotation", async () => {
  keys();
  const usage = [1, 2, 3].map((n) => ({ provider: "openai", key_slot: n, group_key: "openai_mini", tokens: 2_500_000, calls: 1 }));
  const { db, ledger } = mockDb(poolFixture(), { usage });
  scriptFetch({ "gpt-5.6-luna": [OK()] });
  const r = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(r.ok);
  assertEquals(slotOf(sent[0].auth), 1);
  assertEquals([ledger[0].metadata.key_slot, ledger[0].metadata.pool], [1, "paid"]);
});

Deno.test("a model outside every group ⇒ lowest key, pool 'none' (gemini)", async () => {
  keys();
  const { db } = mockDb(poolFixture());
  assertEquals(await pickAIKey(db, model("gemini:gemini-3.5-flash-lite")), { apiKey: "t-GEMINI_API_KEY", slot: 1, pool: "none", group: null });
});

Deno.test("a key whose secret is not set is skipped (slot 2 missing ⇒ slot 3)", async () => {
  keys(["OPENAI_API_KEY", "OPENAI_API_KEY_3", "GEMINI_API_KEY", "LOVABLE_API_KEY"]);
  const { db } = mockDb(poolFixture(), { usage: [{ provider: "openai", key_slot: 1, group_key: "openai_mini", tokens: 2_500_000, calls: 1 }] });
  const pick = await pickAIKey(db, model("openai:gpt-5.6-luna"));
  assertEquals([pick.slot, (pick as { pool: string }).pool], [3, "free"]);
  assert(hasAIProviderKey("openai"));
});

Deno.test("a disabled slot is never used; no enabled slot with a secret ⇒ no_key and hasAIProviderKey false", async () => {
  keys(["OPENAI_API_KEY_2", "GEMINI_API_KEY"]);
  const { db } = mockDb(poolFixture([1, 3]));
  await loadAIRegistry(db);
  assertEquals(await pickAIKey(db, model("openai:gpt-5.6-luna")), { apiKey: "", slot: null, reason: "no_key" });
  assert(!hasAIProviderKey("openai"));
  assert(hasAIProviderKey("gemini"));
});

Deno.test("usage read failing (function missing / db error) ⇒ lowest key, pool reported as unknown, no throw", async () => {
  keys();
  const { db } = mockDb(poolFixture(), { usage: "error" });
  assertEquals(await pickAIKey(db, model("openai:gpt-5.6-luna")), { apiKey: "t-OPENAI_API_KEY", slot: 1, pool: "unknown", group: "openai_mini" });
  keys();
  const noRpc = mockDb(poolFixture(), { usage: "no_rpc" });
  assertEquals(await pickAIKey(noRpc.db, model("openai:gpt-5.6-luna")), { apiKey: "t-OPENAI_API_KEY", slot: 1, pool: "unknown", group: "openai_mini" });
});

Deno.test("tokens used by this isolate count against the pool before the ledger is re-read (60 s cache, one rpc read)", async () => {
  keys();
  const { db, rpcCalls } = mockDb(poolFixture(), { usage: [{ provider: "openai", key_slot: 1, group_key: "openai_mini", tokens: 2_470_000, calls: 1 }] });
  scriptFetch({ "gpt-5.6-luna": [OK(8000, 3000), OK(1000, 100)] });
  const a = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(a.ok);
  assertEquals(slotOf(sent[0].auth), 1, "2,470,000 + 20,000 reserve < 2,500,000 ⇒ room on slot 1");
  const b = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(b.ok);
  assertEquals(slotOf(sent[1].auth), 2, "after 11,000 more tokens slot 1 is at 2,481,000 + 20,000 ≥ pool ⇒ slot 2");
  assertEquals(rpcCalls(), 1, "usage was read once; the second pick used the local count");
});

// ── 429 ⇒ next key for the same model, then the cooled key is skipped ────────────────────────
Deno.test("429 on a key: that key cools down, the SAME model is retried at once on the next key; next call skips the cooled key without a request", async () => {
  keys();
  const { db, ledger } = mockDb(poolFixture());
  scriptFetch({ "gpt-5.6-luna": [{ status: 429, body: { error: { message: "You have no credits remaining", type: "insufficient_quota" } } }, OK(), OK()] });
  const r = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(r.ok);
  assertEquals(r.fallbackUsed, false, "same model answered — not a model fallback");
  assertEquals(sent.map((s) => [s.body.model, slotOf(s.auth)]), [["gpt-5.6-luna", 1], ["gpt-5.6-luna", 2]]);
  assertEquals(r.attempts.map((a) => [a.outcome, a.key_slot]), [["quota_exhausted", 1], ["ok", 2]]);
  assertEquals([ledger.length, ledger[0].error_class, ledger[0].metadata.key_slot], [1, "ok", 2]);
  const r2 = await callAITask({ db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(r2.ok);
  assertEquals(sent.length, 3);
  assertEquals(slotOf(sent[2].auth), 2, "slot 1 is cooling down (5 min) — straight to slot 2, no request on slot 1");
  assertEquals(r2.attempts.map((a) => [a.outcome, a.key_slot]), [["ok", 2]]);
});

Deno.test("429 on every key ⇒ the chain moves to the next model (gemini), as before", async () => {
  keys();
  const { db } = mockDb(poolFixture());
  const limited = { status: 429, body: { error: { message: "Rate limit reached" } }, headers: { "Retry-After": "2" } };
  scriptFetch({ "gpt-5.6-luna": [limited, limited, limited], "gemini-3.5-flash-lite": [OK()] });
  const r = await callAITask({ db, task: "brain.classify", functionName: "t", messages: MSG });
  assert(r.ok && r.fallbackUsed && r.modelKey === "gemini:gemini-3.5-flash-lite");
  assertEquals(r.attempts.map((a) => [a.outcome, a.key_slot]), [["rate_limited", 1], ["rate_limited", 2], ["rate_limited", 3], ["ok", 1]]);
});

Deno.test("a non-429 failure (500) does not rotate keys: next model, as before", async () => {
  keys();
  const { db } = mockDb(poolFixture());
  scriptFetch({ "gpt-5.6-luna": [{ status: 500, body: { error: "boom" } }], "gemini-3.5-flash-lite": [OK()] });
  const r = await callAITask({ db, task: "brain.classify", functionName: "t", messages: MSG });
  assert(r.ok && r.fallbackUsed);
  assertEquals(sent.map((s) => s.body.model), ["gpt-5.6-luna", "gemini-3.5-flash-lite"]);
});

// ── ai-smart-schedule's own loops: recordAITaskCall carries the key ──────────────────────────
Deno.test("recordAITaskCall with key ⇒ metadata.key_slot / pool / pool_group; without key ⇒ metadata unchanged", async () => {
  keys();
  const { db, ledger } = mockDb(poolFixture());
  const resolved = await resolveAITaskChain(db, "schedule.compose");
  assert(resolved.ok);
  const m = resolved.chain.find((x) => x.provider === "openai")!;
  const pick = await pickAIKey(db, m);
  assert(pick.slot !== null);
  await recordAITaskCall(db, { task: "schedule.compose", functionName: "ai-smart-schedule", model: m, modelRequested: resolved.chain[0], ok: true, httpStatus: 200, latencyMs: 5, usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_tokens: 0 }, metadata: { caller: "test" }, key: { slot: pick.slot, pool: pick.pool, group: pick.group } });
  await recordAITaskCall(db, { task: "schedule.compose", functionName: "ai-smart-schedule", model: m, modelRequested: resolved.chain[0], ok: false, errorClass: "timeout", latencyMs: 5, metadata: { caller: "test" } });
  assertEquals(ledger[0].metadata, { caller: "test", key_slot: 1, pool: "free", pool_group: "openai_mini" });
  assertEquals(ledger[1].metadata, { caller: "test" });
});

// ── 2026-10-04 FREE TIER FIRST: the chain is reordered so free-pool steps go before billed ones ──
// Helper: the pool fixture with prefer_free_pool set on one route (the live fixture predates the column).
function freeFirstFixture(task: string, prefer: boolean, enabled: number[] = [1, 2, 3]) {
  const f = poolFixture(enabled);
  // deno-lint-ignore no-explicit-any
  for (const r of f.ai_task_route as any[]) if (r.task_key === task) r.prefer_free_pool = prefer;
  return f;
}

Deno.test("free tier first: a lovable-first chain is reordered so the openai step with pool room is tried first", async () => {
  keys();
  // brain.translate in the live fixture is lovable -> gemini -> openai. Only the openai model is in a
  // complimentary group, so it must be promoted to the front; lovable and gemini keep their order.
  const { db, ledger } = mockDb(freeFirstFixture("brain.translate", true));
  scriptFetch({ "gpt-5.6-luna": [OK()] });
  const r = await callAITask({ db, task: "brain.translate", functionName: "t", messages: MSG });
  assert(r.ok);
  assertEquals(sent.map((x) => x.body.model), ["gpt-5.6-luna"], "the free step answered on the first attempt");
  assertEquals(slotOf(sent[0].auth), 1);
  assertEquals(r.modelKey, "openai:gpt-5.6-luna");
  assertEquals(ledger[0].metadata.pool, "free");
  assertEquals(ledger[0].metadata.free_first, true);
  assertEquals(ledger[0].metadata.route_step1, "lovable:google/gemini-3.8-flash", "the admin's own step 1 is kept in the audit");
  assertEquals(ledger[0].model_requested, "openai:gpt-5.6-luna", "model_requested is what was tried first");
  assertEquals(ledger[0].fallback_used, false);
});

Deno.test("free tier first: the promoted step keeps the admin's order among the billed steps behind it", async () => {
  keys();
  const { db } = mockDb(freeFirstFixture("brain.translate", true));
  const resolved = await resolveAITaskChain(db, "brain.translate");
  assert(resolved.ok);
  assertEquals(resolved.chain.map((m) => m.model_key), [
    "openai:gpt-5.6-luna",
    "lovable:google/gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
  ], "two-tier stable sort: free step to the front, the two billed steps keep step_no order");
});

Deno.test("free tier first: prefer_free_pool = false leaves the admin's order exactly as set", async () => {
  keys();
  const { db } = mockDb(freeFirstFixture("brain.translate", false));
  const resolved = await resolveAITaskChain(db, "brain.translate");
  assert(resolved.ok);
  assertEquals(resolved.chain.map((m) => m.model_key), [
    "lovable:google/gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
    "openai:gpt-5.6-luna",
  ]);
});

Deno.test("free tier first: a spent pool is not promoted — the chain stays as the admin set it", async () => {
  keys();
  // Slot 1 has 2,490,000 of 2,500,000 used and the reserve is 20,000, so no slot-1 room; slots 2 and 3
  // are enabled with fresh pools here, so the openai step IS still free and must be promoted.
  const spent = mockDb(freeFirstFixture("brain.translate", true, [1]), {
    usage: [{ provider: "openai", key_slot: 1, group_key: "openai_mini", tokens: 2_490_000, calls: 1 }],
  });
  const resolved = await resolveAITaskChain(spent.db, "brain.translate");
  assert(resolved.ok);
  assertEquals(resolved.chain.map((m) => m.model_key), [
    "lovable:google/gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
    "openai:gpt-5.6-luna",
  ], "only slot 1 is enabled and its pool is spent ⇒ nothing is free ⇒ order untouched");
});

Deno.test("free tier first: an unreadable usage read never changes which model answers", async () => {
  keys();
  const { db } = mockDb(freeFirstFixture("brain.translate", true), { usage: "error" });
  const resolved = await resolveAITaskChain(db, "brain.translate");
  assert(resolved.ok);
  assertEquals(resolved.chain.map((m) => m.model_key), [
    "lovable:google/gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
    "openai:gpt-5.6-luna",
  ], "pool state unknown ⇒ the admin's order stands");
});

Deno.test("free tier first: an all-free chain and a single-step chain are both left untouched, and no free_first is logged", async () => {
  keys();
  // brain.classify is openai -> gemini: the openai step is already first, so the order cannot change.
  const a = mockDb(freeFirstFixture("brain.classify", true));
  const ra = await resolveAITaskChain(a.db, "brain.classify");
  assert(ra.ok);
  assertEquals(ra.chain.map((m) => m.model_key), ["openai:gpt-5.6-luna", "gemini:gemini-3.5-flash-lite"]);
  // brain.nlu is a single step: nothing to reorder, and the ledger carries no free_first key.
  keys();
  const b = mockDb(freeFirstFixture("brain.nlu", true));
  scriptFetch({ "gpt-5.6-luna": [OK()] });
  const r = await callAITask({ db: b.db, task: "brain.nlu", functionName: "t", messages: MSG });
  assert(r.ok);
  assertEquals(b.ledger[0].metadata.free_first, undefined, "no reorder ⇒ no free_first in the ledger row");
  assertEquals(b.ledger[0].metadata.route_step1, undefined);
});

Deno.test("free tier first: a key whose secret is missing does not make its model look free", async () => {
  // Every openai slot is enabled in the fixture but no OPENAI_* secret is set, so the openai step has no
  // usable key and must not be promoted ahead of the lovable step that does have one.
  keys(["GEMINI_API_KEY", "LOVABLE_API_KEY"]);
  const { db } = mockDb(freeFirstFixture("brain.translate", true));
  const resolved = await resolveAITaskChain(db, "brain.translate");
  assert(resolved.ok);
  assertEquals(resolved.chain.map((m) => m.model_key), [
    "lovable:google/gemini-3.8-flash",
    "gemini:gemini-3.5-flash-lite",
    "openai:gpt-5.6-luna",
  ], "no openai secret ⇒ no free room ⇒ order untouched");
});
