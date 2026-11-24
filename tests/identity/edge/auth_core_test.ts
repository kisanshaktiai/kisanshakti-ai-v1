/**
 * tests/identity/edge/auth_core_test.ts
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 *
 * Runs the REAL auth core (supabase/functions/_shared/farmer-auth-core.ts) and the
 * REAL session verifier (_shared/sessionVerify.ts) against a throw-away local
 * replica behind PostgREST, the same way they run in production: supabase-js with
 * a service-role key for the core, and the anon key plus x-session-token for the
 * verifier. Started by run_edge.sh; never point it at a Supabase project.
 *
 * Test people are generic and fake; mobiles are in the unassigned 00000xxxxx range.
 */
// Local assertions: the test machine has no route to a remote module registry.
function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`not equal\n  actual:   ${a}\n  expected: ${e}`);
}
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const POSTGREST = Deno.env.get("IT_POSTGREST_URL")!;
const SECRET = Deno.env.get("IT_JWT_SECRET")!;
const CUTOVER = Deno.env.get("IT_CUTOVER") === "1";
const PROXY_PORT = Number(Deno.env.get("IT_PROXY_PORT") ?? "54399");

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

// ── tiny HS256 JWT, as PostgREST expects ─────────────────────────────────────
const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function jwt(role: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// supabase-js calls <SUPABASE_URL>/rest/v1/...; PostgREST serves from the root.
const proxy = Deno.serve({ port: PROXY_PORT, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  const target = POSTGREST + u.pathname.replace(/^\/rest\/v1/, "") + u.search;
  const res = await fetch(target, { method: req.method, headers: req.headers, body: req.body });
  return new Response(res.body, { status: res.status, headers: res.headers });
});

const SERVICE_KEY = await jwt("service_role");
const ANON_KEY = await jwt("anon");
Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${PROXY_PORT}`);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);

const core = await import("../../../supabase/functions/_shared/farmer-auth-core.ts");
const verify = await import("../../../supabase/functions/_shared/sessionVerify.ts");
const db = createClient(`http://127.0.0.1:${PROXY_PORT}`, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const everyReply: string[] = [];
async function call(body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "identity-it" };
  if (token) headers["x-session-token"] = token;
  const res = await core.handleFarmerAuth(new Request("http://local/farmer-auth", { method: "POST", headers }), body);
  const text = await res.text();
  everyReply.push(text);
  return { status: res.status, body: JSON.parse(text) };
}
async function one(table: string, filter: Record<string, unknown>) {
  let q = db.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q = v === null ? q.is(k, null) : q.eq(k, v as string);
  const { data, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}
async function setFlag(patch: Record<string, unknown>) {
  const { error } = await db.from("feature_flags").update(patch).eq("flag_name", "multi_role_identity");
  if (error) throw new Error(error.message);
}
const roleOf = (acc: any, role: string) => acc?.roles?.find((r: any) => r.role === role)?.status ?? null;

const F1 = "0000007001"; // farmer, registered with the flag OFF
const P1 = "0000007101"; // service provider only
const C1 = "0000007102"; // farmer + customer in one registration
const P2 = "0000007103"; // provider used for lockout
const P3 = "0000007104"; // provider used for PIN change and reset
const P4 = "0000007105"; // rate-limit subject

Deno.test({ name: "auth core, multi-role identity", sanitizeResources: false, sanitizeOps: false }, async (t) => {
  let f1Token = "";
  let p1Token = "";
  let p1Id = "";

  // ═══════════════════════════ flag OFF ═══════════════════════════════════
  await t.step("flag OFF: the seeded flag is off and unknown to nobody's benefit", async () => {
    const [flag] = await one("feature_flags", { flag_name: "multi_role_identity" });
    assertEquals([flag.is_enabled, flag.rollout_percentage, flag.target_tenants.length], [false, 0, 0]);
  });

  await t.step("flag OFF: farmer registration replies exactly as before and records active_role FARMER", async () => {
    const r = await call({ action: "register", mobile: F1, tenantId: TENANT_A, pin: "1234", language: "mr" });
    assertEquals(r.status, 200);
    assertEquals(Object.keys(r.body).sort(), ["farmer", "profile", "session"]);
    assertEquals(r.body.profile, null);
    assert(!("pin_hash" in r.body.farmer));
    f1Token = r.body.session.token;
    const [sess] = await one("user_sessions", { access_token_hash: await sha256Hex(f1Token) });
    assertEquals(sess.active_role, "FARMER");
    assert(sess.role_verified_at);
    const acc = await one("accounts", { id: r.body.farmer.id });
    assertEquals([acc.length, acc[0].tenant_id, acc[0].mobile_number, acc[0].pin_hash], [1, TENANT_A, F1, null]);
    const roles = await one("account_roles", { account_id: r.body.farmer.id });
    assertEquals(roles.map((x: any) => `${x.role}:${x.status}:${x.source}`), ["FARMER:ACTIVE:FARMER_TRIGGER"]);
  });

  await t.step("flag OFF: farmer login, wrong PIN, lookup and the RLS session context all behave as before", async () => {
    const ok = await call({ action: "verifyPin", mobile: F1, tenantId: TENANT_A, pin: "1234" });
    assertEquals([ok.status, Object.keys(ok.body).sort()], [200, ["farmer", "profile", "session"]]);
    const bad = await call({ action: "verifyPin", mobile: F1, tenantId: TENANT_A, pin: "9999" });
    assertEquals([bad.status, bad.body], [401, { error: "invalid_credentials" }]);
    const unknown = await call({ action: "verifyPin", mobile: "0000007999", tenantId: TENANT_A, pin: "1234" });
    assertEquals([unknown.status, unknown.body], [401, { error: "invalid_credentials" }]);
    const look = await call({ action: "lookup", mobile: F1, tenantId: TENANT_A });
    assertEquals(look.body, { exists: true, requiresPinSetup: false, multiRole: false });
    const ctx = await verify.lookupSession(ok.body.session.token);
    assertEquals([ctx?.farmer_id, ctx?.tenant_id], [ok.body.farmer.id, TENANT_A]);
    const caller = await verify.resolveVerifiedCaller(new Request("http://x", { headers: { "x-session-token": ok.body.session.token } }));
    assertEquals(caller?.kind, "farmer");
  });

  await t.step("flag OFF: every multi-role action is refused; sessionInfo only reports the flag", async () => {
    const reg = await call({ action: "register", mobile: P1, tenantId: TENANT_A, pin: "1234", roles: ["SERVICE_PROVIDER"] });
    assertEquals([reg.status, reg.body], [403, { error: "feature_disabled" }]);
    const both = await call({ action: "register", mobile: P1, tenantId: TENANT_A, pin: "1234", roles: ["FARMER", "CUSTOMER"] });
    assertEquals([both.status, both.body], [403, { error: "feature_disabled" }]);
    assertEquals((await one("farmers", { mobile_number: P1 })).length, 0);
    assertEquals((await one("accounts", { mobile_number: P1 })).length, 0);
    for (const action of ["switchRole", "addRole"]) {
      const r = await call({ action, role: "CUSTOMER" }, f1Token);
      assertEquals([r.status, r.body], [403, { error: "feature_disabled" }]);
    }
    const upd = await call({ action: "updateAccount", displayName: "Test Name" }, f1Token);
    assertEquals([upd.status, upd.body], [403, { error: "feature_disabled" }]);
    const info = await call({ action: "sessionInfo" }, f1Token);
    assertEquals([info.status, info.body.multiRole, info.body.account.activeRole], [200, false, "FARMER"]);
    const none = await call({ action: "sessionInfo" });
    assertEquals([none.status, none.body], [401, { error: "session_required" }]);
  });

  // ═══════════════════════════ flag ON for tenant A ═══════════════════════
  await setFlag({ is_enabled: true, target_tenants: [TENANT_A] });

  await t.step("flag ON for tenant A only: lookup reports it per tenant", async () => {
    assertEquals((await call({ action: "lookup", mobile: "0000007998", tenantId: TENANT_A })).body, { exists: false, requiresPinSetup: false, multiRole: true });
    assertEquals((await call({ action: "lookup", mobile: "0000007998", tenantId: TENANT_B })).body, { exists: false, requiresPinSetup: false, multiRole: false });
    assertEquals((await call({ action: "lookup", mobile: "0000007998" })).body, { exists: false, requiresPinSetup: false, multiRole: false });
  });

  await t.step("provider-only registration: account with the credential, no farmers row, no user_profiles row", async () => {
    const r = await call({ action: "register", mobile: P1, tenantId: TENANT_A, pin: "2468", language: "hi", roles: ["SERVICE_PROVIDER"], displayName: "  Test Provider One " });
    assertEquals(r.status, 200);
    assertEquals([r.body.farmer, r.body.profile], [null, null]);
    assertEquals(r.body.account.roles, [{ role: "SERVICE_PROVIDER", status: "ACTIVE" }]);
    assertEquals([r.body.account.activeRole, r.body.account.displayName, r.body.account.languageCode, r.body.account.tenantId], ["SERVICE_PROVIDER", "Test Provider One", "hi", TENANT_A]);
    assertEquals(r.body.account.mobileMasked, "••••••7101");
    p1Token = r.body.session.token;
    p1Id = r.body.account.id;
    assertEquals((await one("farmers", { mobile_number: P1 })).length, 0);
    assertEquals((await one("user_profiles", { mobile_number: P1 })).length, 0);
    const [acc] = await one("accounts", { id: p1Id });
    assertEquals([acc.pin_hash, acc.status], [await sha256Hex("2468" + "kisan_shakti_2024"), "ACTIVE"]);
    const [sess] = await one("user_sessions", { access_token_hash: await sha256Hex(p1Token) });
    assertEquals([sess.user_id, sess.active_role], [p1Id, "SERVICE_PROVIDER"]);
  });

  await t.step("E: lookup answers for a provider exactly as for a farmer, and never lists roles", async () => {
    const provider = await call({ action: "lookup", mobile: P1, tenantId: TENANT_A });
    const farmer = await call({ action: "lookup", mobile: F1, tenantId: TENANT_A });
    assertEquals(provider.body, farmer.body);
    assertEquals(Object.keys(provider.body).sort(), ["exists", "multiRole", "requiresPinSetup"]);
  });

  await t.step("A, B: a provider session has an account context and NO farmer context", async () => {
    const login = await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_A, pin: "2468" });
    assertEquals([login.status, login.body.farmer, login.body.account.activeRole], [200, null, "SERVICE_PROVIDER"]);
    p1Token = login.body.session.token;
    assertEquals(await verify.lookupSession(p1Token), null);
    assertEquals(await verify.resolveVerifiedCaller(new Request("http://x", { headers: { "x-session-token": p1Token } })), null);
    const acc = await verify.lookupAccountSession(p1Token);
    assertEquals([acc?.account_id, acc?.tenant_id, acc?.active_role], [p1Id, TENANT_A, "SERVICE_PROVIDER"]);
    const req = new Request("http://x", { headers: { "x-session-token": p1Token } });
    assertEquals((await verify.resolveVerifiedAccount(req, ["SERVICE_PROVIDER"]))?.kind, "account");
    assertEquals(await verify.resolveVerifiedAccount(req, ["CUSTOMER"]), null);
    assertEquals(await verify.resolveVerifiedAccount(req, ["FARMER"]), null);
    assertEquals(await verify.resolveVerifiedAccount(req, []), null);
    // A header is not identity.
    const forged = new Request("http://x", { headers: { "x-session-token": "not-a-token", "x-farmer-id": p1Id, "x-tenant-id": TENANT_A } });
    assertEquals(await verify.resolveVerifiedAccount(forged, ["SERVICE_PROVIDER", "CUSTOMER", "FARMER"]), null);
  });

  await t.step("A: a role hint the account does not hold is ignored; wrong PIN and wrong tenant are uniform", async () => {
    const hinted = await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_A, pin: "2468", role: "FARMER" });
    assertEquals(hinted.body.account.activeRole, "SERVICE_PROVIDER");
    const bad = await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_A, pin: "0000" });
    assertEquals([bad.status, bad.body], [401, { error: "invalid_credentials" }]);
    const otherTenant = await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_B, pin: "2468" });
    assertEquals([otherTenant.status, otherTenant.body], [401, { error: "invalid_credentials" }]);
    const noTenant = await call({ action: "verifyPin", mobile: P1, pin: "2468" });
    assertEquals([noTenant.status, noTenant.body], [401, { error: "invalid_credentials" }]);
    await db.from("accounts").update({ failed_login_attempts: 0 }).eq("id", p1Id);
  });

  await t.step("a number that is already a provider cannot be registered again, as a farmer or as anything", async () => {
    const farmersBefore = (await one("farmers", { tenant_id: TENANT_A })).length;
    const asFarmer = await call({ action: "register", mobile: P1, tenantId: TENANT_A, pin: "1111" });
    assertEquals([asFarmer.status, asFarmer.body], [409, { error: "already_registered" }]);
    const again = await call({ action: "register", mobile: P1, tenantId: TENANT_A, pin: "1111", roles: ["CUSTOMER"] });
    assertEquals([again.status, again.body], [409, { error: "already_registered" }]);
    const farmerAsProvider = await call({ action: "register", mobile: F1, tenantId: TENANT_A, pin: "1111", roles: ["SERVICE_PROVIDER"] });
    assertEquals([farmerAsProvider.status, farmerAsProvider.body], [409, { error: "already_registered" }]);
    assertEquals((await one("farmers", { tenant_id: TENANT_A })).length, farmersBefore);
    assertEquals((await one("accounts", { mobile_number: P1 })).length, 1);
    assertEquals((await one("account_link_conflicts", { resolved_at: null })).length, 0);
  });

  await t.step("D: only the three role codes can be registered or added", async () => {
    for (const roles of [["ADMIN"], ["SERVICE_PROVIDER", "VERIFIER"], [], "SERVICE_PROVIDER", ["CUSTOMER", "CUSTOMER"]]) {
      const r = await call({ action: "register", mobile: "0000007997", tenantId: TENANT_A, pin: "1234", roles });
      assertEquals([r.status, r.body], [400, { error: "invalid_role" }]);
    }
    for (const role of ["ADMIN", "tenant_admin", "", null, "farmer"]) {
      const add = await call({ action: "addRole", role }, p1Token);
      assertEquals([add.status, add.body], [400, { error: "invalid_role" }]);
      const sw = await call({ action: "switchRole", role }, p1Token);
      assertEquals([sw.status, sw.body], [400, { error: "invalid_role" }]);
    }
    assertEquals((await one("accounts", { mobile_number: "0000007997" })).length, 0);
    assertEquals((await one("account_roles", { account_id: p1Id })).length, 1);
  });

  await t.step("farmer + customer in one registration: one login, two roles, Farmer workspace unless asked", async () => {
    const r = await call({ action: "register", mobile: C1, tenantId: TENANT_A, pin: "1357", roles: ["CUSTOMER", "FARMER"] });
    assertEquals(r.status, 200);
    assertEquals(r.body.account.roles, [{ role: "FARMER", status: "ACTIVE" }, { role: "CUSTOMER", status: "ACTIVE" }]);
    assertEquals([r.body.account.activeRole, r.body.account.id], ["FARMER", r.body.farmer.id]);
    assertEquals((await one("accounts", { mobile_number: C1 })).length, 1);
    assertEquals((await one("accounts", { id: r.body.farmer.id }))[0].pin_hash, null); // credential stays on farmers
    const asCustomer = await call({ action: "verifyPin", mobile: C1, tenantId: TENANT_A, pin: "1357", role: "CUSTOMER" });
    assertEquals(asCustomer.body.account.activeRole, "CUSTOMER");
    const auto = await call({ action: "verifyPin", mobile: C1, tenantId: TENANT_A, pin: "1357", role: "AUTO" });
    assertEquals(auto.body.account.activeRole, "CUSTOMER"); // the one used last
    const legacy = await call({ action: "verifyPin", mobile: C1, tenantId: TENANT_A, pin: "1357" });
    assertEquals(legacy.body.account.activeRole, "FARMER"); // a client that sends no hint
    // B: the same farmer, on a session in the Customer workspace.
    const farmerCtx = await verify.lookupSession(asCustomer.body.session.token);
    if (CUTOVER) assertEquals(farmerCtx, null);
    else assertEquals(farmerCtx?.farmer_id, r.body.farmer.id); // closed only by the cutover
    assertEquals((await verify.lookupAccountSession(asCustomer.body.session.token))?.active_role, "CUSTOMER");
    assertEquals((await verify.lookupSession(legacy.body.session.token))?.farmer_id, r.body.farmer.id);
  });

  await t.step("A: workspace switch needs an ACTIVE membership and keeps the same token", async () => {
    const no = await call({ action: "switchRole", role: "CUSTOMER" }, p1Token);
    assertEquals([no.status, no.body], [403, { error: "role_not_held" }]);
    const noFarmer = await call({ action: "switchRole", role: "FARMER" }, p1Token);
    assertEquals([noFarmer.status, noFarmer.body], [403, { error: "role_not_held" }]);
    assertEquals((await verify.lookupAccountSession(p1Token))?.active_role, "SERVICE_PROVIDER");

    const add = await call({ action: "addRole", role: "CUSTOMER" }, p1Token);
    assertEquals([add.status, add.body.roleStatus, roleOf(add.body.account, "CUSTOMER"), add.body.account.activeRole], [200, "ACTIVE", "ACTIVE", "SERVICE_PROVIDER"]);
    const sw = await call({ action: "switchRole", role: "CUSTOMER" }, p1Token);
    assertEquals([sw.status, sw.body.account.activeRole, sw.body.farmer, sw.body.profile], [200, "CUSTOMER", null, null]);
    assertEquals((await verify.lookupAccountSession(p1Token))?.active_role, "CUSTOMER");
    assertEquals(await verify.lookupSession(p1Token), null);
    const unknownToken = await call({ action: "switchRole", role: "CUSTOMER" }, "0".repeat(64));
    assertEquals([unknownToken.status, unknownToken.body], [401, { error: "session_required" }]);
  });

  await t.step("A: suspension takes effect on the next request and cannot be undone by the person", async () => {
    await db.from("account_roles").update({ status: "SUSPENDED" }).eq("account_id", p1Id).eq("role", "CUSTOMER");
    assertEquals(await verify.lookupAccountSession(p1Token), null);
    const info = await call({ action: "sessionInfo" }, p1Token);
    assertEquals([info.body.account.activeRole, roleOf(info.body.account, "CUSTOMER")], [null, "SUSPENDED"]);
    const readd = await call({ action: "addRole", role: "CUSTOMER" }, p1Token);
    assertEquals([readd.status, readd.body.roleStatus], [200, "SUSPENDED"]);
    const sw = await call({ action: "switchRole", role: "CUSTOMER" }, p1Token);
    assertEquals([sw.status, sw.body], [403, { error: "role_not_held" }]);
    const back = await call({ action: "switchRole", role: "SERVICE_PROVIDER" }, p1Token);
    assertEquals([back.status, back.body.account.activeRole], [200, "SERVICE_PROVIDER"]);

    await db.from("accounts").update({ status: "SUSPENDED" }).eq("id", p1Id);
    assertEquals(await verify.lookupAccountSession(p1Token), null);
    assertEquals((await call({ action: "sessionInfo" }, p1Token)).body, { error: "session_required" });
    assertEquals((await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_A, pin: "2468" })).body, { error: "invalid_credentials" });
    await db.from("accounts").update({ status: "ACTIVE" }).eq("id", p1Id);
    await db.from("account_roles").update({ status: "ACTIVE" }).eq("account_id", p1Id).eq("role", "CUSTOMER");
  });

  await t.step("provider adds the Farmer role: farmers row with the same id, credential MOVED, same PIN still works", async () => {
    const before = (await one("accounts", { id: p1Id }))[0].pin_hash;
    const add = await call({ action: "addRole", role: "FARMER" }, p1Token);
    assertEquals([add.status, add.body.roleStatus, roleOf(add.body.account, "FARMER")], [200, "ACTIVE", "ACTIVE"]);
    const [farmer] = await one("farmers", { id: p1Id });
    assertEquals([farmer.tenant_id, farmer.mobile_number, farmer.pin_hash, farmer.is_active], [TENANT_A, P1, before, true]);
    assertEquals((await one("accounts", { id: p1Id }))[0].pin_hash, null); // single copy
    assertEquals((await one("accounts", { mobile_number: P1 })).length, 1);
    const twice = await call({ action: "addRole", role: "FARMER" }, p1Token);
    assertEquals([twice.status, twice.body.roleStatus], [200, "ACTIVE"]);
    assertEquals((await one("farmers", { mobile_number: P1 })).length, 1);

    const sw = await call({ action: "switchRole", role: "FARMER" }, p1Token);
    assertEquals([sw.status, sw.body.account.activeRole, sw.body.farmer.id], [200, "FARMER", p1Id]);
    assert(!("pin_hash" in sw.body.farmer));
    assertEquals((await verify.lookupSession(p1Token))?.farmer_id, p1Id);

    const login = await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_A, pin: "2468" });
    assertEquals([login.status, login.body.farmer.id, login.body.account.activeRole], [200, p1Id, "FARMER"]);
    const gaps = await db.from("v_identity_integrity_gaps").select("*");
    assertEquals(gaps.data, []);
  });

  await t.step("PIN lockout for a person without a farmers row: same 5 attempts, same replies", async () => {
    const r = await call({ action: "register", mobile: P2, tenantId: TENANT_A, pin: "4321", roles: ["SERVICE_PROVIDER", "CUSTOMER"] });
    assertEquals([r.status, r.body.account.activeRole], [200, "SERVICE_PROVIDER"]);
    for (let i = 0; i < 5; i++) {
      const bad = await call({ action: "verifyPin", mobile: P2, tenantId: TENANT_A, pin: "0000" });
      assertEquals([bad.status, bad.body], [401, { error: "invalid_credentials" }]);
    }
    const locked = await call({ action: "verifyPin", mobile: P2, tenantId: TENANT_A, pin: "4321" });
    assertEquals([locked.status, locked.body.error], [429, "locked_out"]);
    assert(locked.body.retryAfterSeconds > 0);
  });

  await t.step("PIN change and PIN reset for a person without a farmers row", async () => {
    const reg = await call({ action: "register", mobile: P3, tenantId: TENANT_A, pin: "1010", roles: ["CUSTOMER"] });
    const id = reg.body.account.id;
    const oldToken = reg.body.session.token;

    const noProof = await call({ action: "changePin", mobile: P3, tenantId: TENANT_A, newPin: "2020" });
    assertEquals([noProof.status, noProof.body], [401, { error: "invalid_credentials" }]);
    const otherSession = await call({ action: "changePin", mobile: P3, tenantId: TENANT_A, newPin: "2020" }, p1Token);
    assertEquals([otherSession.status, otherSession.body], [401, { error: "invalid_credentials" }]);

    const changed = await call({ action: "changePin", mobile: P3, tenantId: TENANT_A, currentPin: "1010", newPin: "2020" });
    assertEquals([changed.status, changed.body.account.activeRole, changed.body.farmer], [200, "CUSTOMER", null]);
    assertEquals(await verify.lookupAccountSession(oldToken), null); // old sessions are dead
    assertEquals((await call({ action: "verifyPin", mobile: P3, tenantId: TENANT_A, pin: "1010" })).status, 401);
    await db.from("accounts").update({ failed_login_attempts: 0 }).eq("id", id);
    assertEquals((await call({ action: "verifyPin", mobile: P3, tenantId: TENANT_A, pin: "2020" })).status, 200);

    // Without an SMS gateway both kinds of person get the same answer, and an unknown number a uniform one.
    assertEquals((await call({ action: "requestPinReset", mobile: P3, tenantId: TENANT_A })).body, { error: "sms_not_configured" });
    assertEquals((await call({ action: "requestPinReset", mobile: F1, tenantId: TENANT_A })).body, { error: "sms_not_configured" });
    assertEquals((await call({ action: "requestPinReset", mobile: "0000007996", tenantId: TENANT_A })).body, { sent: true, expiresInSeconds: 600 });

    // The code row the SMS step would have written (account_id set, farmer_id NULL).
    const ins = await db.from("pin_reset_codes").insert({
      account_id: id, tenant_id: TENANT_A, mobile_number: P3,
      code_hash: await sha256Hex("654321" + "kisan_shakti_2024"),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    assertEquals(ins.error, null);
    const wrong = await call({ action: "verifyPinReset", mobile: P3, tenantId: TENANT_A, code: "000000", newPin: "3030" });
    assertEquals([wrong.status, wrong.body], [401, { error: "invalid_reset_code" }]);
    const reset = await call({ action: "verifyPinReset", mobile: P3, tenantId: TENANT_A, code: "654321", newPin: "3030" });
    assertEquals([reset.status, reset.body.account.activeRole], [200, "CUSTOMER"]);
    const replay = await call({ action: "verifyPinReset", mobile: P3, tenantId: TENANT_A, code: "654321", newPin: "4040" });
    assertEquals([replay.status, replay.body], [401, { error: "invalid_reset_code" }]);
    assertEquals((await call({ action: "verifyPin", mobile: P3, tenantId: TENANT_A, pin: "3030" })).status, 200);
    assertEquals((await one("accounts", { id }))[0].pin_hash, await sha256Hex("3030" + "kisan_shakti_2024"));
  });

  await t.step("updateAccount changes only the caller's own display name and language", async () => {
    const ok = await call({ action: "updateAccount", displayName: " Test Provider Renamed ", languageCode: "mr" }, p1Token);
    assertEquals([ok.status, ok.body.account.displayName, ok.body.account.languageCode], [200, "Test Provider Renamed", "mr"]);
    for (const patch of [{ displayName: "" }, { displayName: "x".repeat(81) }, { languageCode: "EN" }, { languageCode: "english" }, {}]) {
      const bad = await call({ action: "updateAccount", ...patch }, p1Token);
      assertEquals(bad.status, 400);
    }
    const sneaky = await call({ action: "updateAccount", displayName: "Test Name", status: "ACTIVE", tenant_id: TENANT_B, pin_hash: "x", id: "00000000-0000-0000-0000-000000000000" }, p1Token);
    assertEquals(sneaky.status, 200);
    const [acc] = await one("accounts", { id: p1Id });
    assertEquals([acc.tenant_id, acc.pin_hash, acc.status, acc.display_name], [TENANT_A, null, "ACTIVE", "Test Name"]);
  });

  await t.step("F: the same number in another tenant is a separate identity, and only where the flag is on", async () => {
    const off = await call({ action: "register", mobile: P1, tenantId: TENANT_B, pin: "8888", roles: ["SERVICE_PROVIDER"] });
    assertEquals([off.status, off.body], [403, { error: "feature_disabled" }]);
    await setFlag({ target_tenants: [TENANT_A, TENANT_B] });
    const on = await call({ action: "register", mobile: P1, tenantId: TENANT_B, pin: "8888", roles: ["SERVICE_PROVIDER"] });
    assertEquals([on.status, on.body.account.tenantId], [200, TENANT_B]);
    assert(on.body.account.id !== p1Id);
    assertEquals((await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_B, pin: "2468" })).status, 401); // tenant A's PIN
    assertEquals((await call({ action: "verifyPin", mobile: P1, tenantId: TENANT_A, pin: "8888" })).status, 401); // tenant B's PIN
    const cross = await db.from("account_roles").select("account_id, tenant_id, accounts!inner(tenant_id)");
    assertEquals((cross.data ?? []).filter((r: any) => r.tenant_id !== r.accounts.tenant_id).length, 0);
    await db.from("farmers").update({ failed_login_attempts: 0 }).eq("id", p1Id);
  });

  await t.step("E: role registration is rate-limited per number", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await call({ action: "register", mobile: P4, tenantId: TENANT_A, pin: "1234", roles: ["CUSTOMER"] })).status);
    }
    assertEquals(statuses, [200, 409, 409, 409, 409, 429, 429]);
  });

  await t.step("logout kills the token for every context", async () => {
    await call({ action: "switchRole", role: "SERVICE_PROVIDER" }, p1Token);
    assert(await verify.lookupAccountSession(p1Token));
    assertEquals((await call({ action: "logout", sessionToken: p1Token })).body, { ok: true });
    assertEquals(await verify.lookupAccountSession(p1Token), null);
    assertEquals(await verify.lookupSession(p1Token), null);
    assertEquals((await call({ action: "sessionInfo" }, p1Token)).body, { error: "session_required" });
  });

  await t.step("the farmer registered before the flag still logs in, and no reply ever carried a pin_hash", async () => {
    const login = await call({ action: "verifyPin", mobile: F1, tenantId: TENANT_A, pin: "1234" });
    assertEquals([login.status, login.body.account.activeRole, login.body.account.roles], [200, "FARMER", [{ role: "FARMER", status: "ACTIVE" }]]);
    assertEquals((await verify.lookupSession(login.body.session.token))?.farmer_id, login.body.farmer.id);
    assertEquals(everyReply.filter((r) => r.includes("pin_hash")).length, 0);
    assertEquals(everyReply.filter((r) => /[0-9a-f]{64}/.test(r.replace(/"token":"[0-9a-f]{64}"/g, ""))).length, 0);
    const gaps = await db.from("v_identity_integrity_gaps").select("*");
    assertEquals(gaps.data, []);
    assertEquals(core.isFarmerAuthAction({ action: "switchRole" }) && core.isFarmerAuthAction({ action: "verifyPin" }) && !core.isFarmerAuthAction({ action: "nope" }), true);
  });

  await proxy.shutdown();
});
