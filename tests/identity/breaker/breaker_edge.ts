/**
 * tests/identity/breaker/breaker_edge.ts
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 *
 * Independent attack run against the REAL auth core (_shared/farmer-auth-core.ts)
 * and the REAL session verifier (_shared/sessionVerify.ts), on a throw-away local
 * replica behind PostgREST (built by run_breaker_edge.sh, cutover applied).
 * Never point it at a Supabase project.
 *
 * Every line:  PASS | id | what was tried | evidence     (attack failed)
 *              BROKEN | id | what was tried | evidence   (attack succeeded)
 *              INFO | …                                  (observation)
 * All people are fake; mobiles are in the unassigned 00000xxxxx range.
 * SMS: fetch() to the SMS provider is intercepted in-process; nothing leaves the machine.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const POSTGREST = Deno.env.get("IT_POSTGREST_URL")!;
const SECRET = Deno.env.get("IT_JWT_SECRET")!;
const PROXY_PORT = Number(Deno.env.get("IT_PROXY_PORT") ?? "54397");
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function jwt(role: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

// The SMS provider is never contacted: the call is answered here and the code is kept.
const smsLog: { mobile: string; code: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (url.includes("msg91.com")) {
    try {
      const b = JSON.parse(init?.body ?? "{}");
      smsLog.push({ mobile: String(b.recipients?.[0]?.mobiles ?? ""), code: String(b.recipients?.[0]?.otp ?? "") });
    } catch { /* ignore */ }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }
  return realFetch(input, init);
};

const proxy = Deno.serve({ port: PROXY_PORT, onListen: () => {} }, async (req) => {
  const u = new URL(req.url);
  const target = POSTGREST + u.pathname.replace(/^\/rest\/v1/, "") + u.search;
  const res = await realFetch(target, { method: req.method, headers: req.headers, body: req.body });
  return new Response(res.body, { status: res.status, headers: res.headers });
});

const SERVICE_KEY = await jwt("service_role");
const ANON_KEY = await jwt("anon");
const AUTHED_KEY = await jwt("authenticated");
Deno.env.set("SUPABASE_URL", `http://127.0.0.1:${PROXY_PORT}`);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY);
Deno.env.set("SUPABASE_ANON_KEY", ANON_KEY);
Deno.env.set("MSG91_AUTH_KEY", "local-fake-key");
Deno.env.set("MSG91_OTP_TEMPLATE_ID", "local-fake-template");

const core = await import("../../../supabase/functions/_shared/farmer-auth-core.ts");
const verify = await import("../../../supabase/functions/_shared/sessionVerify.ts");
const db = createClient(`http://127.0.0.1:${PROXY_PORT}`, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let broken = 0, passed = 0;
function verdict(id: string, what: string, held: boolean, evidence: unknown) {
  if (held) passed++; else broken++;
  console.log(`${held ? "PASS" : "BROKEN"} | ${id} | ${what} | ${typeof evidence === "string" ? evidence : JSON.stringify(evidence)}`);
}
const info = (id: string, what: string, evidence: unknown) =>
  console.log(`INFO | ${id} | ${what} | ${typeof evidence === "string" ? evidence : JSON.stringify(evidence)}`);

async function call(body: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "identity-breaker" };
  if (token) headers["x-session-token"] = token;
  const res = await core.handleFarmerAuth(new Request("http://local/farmer-auth", { method: "POST", headers }), body);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text), text };
}
/** Shape of a reply with the secrets taken out, to compare two replies. */
const shape = (r: { status: number; body: any }) =>
  `${r.status} ${JSON.stringify(r.body, (k, v) => (k === "token" || k === "expiresAt" || k === "retryAfterSeconds" ? "*" : v))}`;
async function rows(table: string, filter: Record<string, unknown>) {
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
const clearLimits = async () => { await db.from("rate_limit_tracking").delete().neq("identifier", ""); };
/** What the browser does: PostgREST with the anon key plus headers. */
async function rest(method: string, path: string, headers: Record<string, string>, body?: unknown, key = ANON_KEY) {
  const res = await realFetch(`${POSTGREST}${path}`, {
    method, headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return `${res.status} ${text.slice(0, 140)}`;
}
const verifierReq = (h: Record<string, string>) => new Request("http://local/x", { headers: h });
const roleOf = (acc: any, role: string) => acc?.roles?.find((r: any) => r.role === role)?.status ?? null;

try {
  await setFlag({ is_enabled: true, target_tenants: [A] });

  // ── people ────────────────────────────────────────────────────────────────
  const FA = "0000008102", PV = "0000008101", UN = "0000008199";
  const fa = await call({ action: "register", mobile: FA, tenantId: A, pin: "1234", language: "mr" });
  const pv = await call({ action: "register", mobile: PV, tenantId: A, pin: "1234", roles: ["SERVICE_PROVIDER"], displayName: "Fake Provider" });
  if (fa.status !== 200 || pv.status !== 200) throw new Error(`setup failed: ${fa.text} ${pv.text}`);
  const faId = fa.body.farmer.id, pvId = pv.body.account.id;
  let faTok = fa.body.session.token; const pvTok = pv.body.session.token;

  console.log("=== E. enumeration by unauthenticated callers ===");
  {
    const withT = async (m: string) => shape(await call({ action: "lookup", mobile: m, tenantId: A }));
    const noT = async (m: string) => shape(await call({ action: "lookup", mobile: m }));
    const f = [await withT(FA), await noT(FA)], p = [await withT(PV), await noT(PV)], u = [await withT(UN), await noT(UN)];
    verdict("E01", "lookup WITH tenantId: farmer vs provider-only number", f[0] === p[0], { farmer: f[0], provider: p[0], unknown: u[0] });
    verdict("E02", "lookup with tenantId vs WITHOUT tenantId: the pair of answers is the same for a farmer and a provider-only number",
      f.join(" / ") === p.join(" / "), { farmer: f, providerOnly: p, unknown: u });

    const wrong = async (m: string, t?: string) => shape(await call({ action: "verifyPin", mobile: m, tenantId: t, pin: "0000" }));
    verdict("E03", "verifyPin wrong PIN: farmer vs provider-only vs unknown", new Set([await wrong(FA, A), await wrong(PV, A), await wrong(UN, A)]).size === 1,
      { farmer: await wrong(FA, A), provider: await wrong(PV, A), unknown: await wrong(UN, A) });
    await db.from("farmers").update({ failed_login_attempts: 0 }).eq("id", faId);
    await db.from("accounts").update({ failed_login_attempts: 0 }).eq("id", pvId);

    const reg = async (m: string, extra: Record<string, unknown>) => shape(await call({ action: "register", mobile: m, tenantId: A, pin: "9999", ...extra }));
    const rf = [await reg(FA, {}), await reg(FA, { roles: ["CUSTOMER"] })], rp = [await reg(PV, {}), await reg(PV, { roles: ["CUSTOMER"] })];
    verdict("E04", "register (plain, and with roles) for a taken number: farmer vs provider-only", rf.join("/") === rp.join("/"), { farmer: rf, provider: rp });
    verdict("E05", "…and neither registration attempt replaced the PIN of the existing person",
      (await call({ action: "verifyPin", mobile: FA, tenantId: A, pin: "9999" })).status === 401 && (await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "9999" })).status === 401, "old PINs still the only ones");
    await db.from("farmers").update({ failed_login_attempts: 0 }).eq("id", faId);
    await db.from("accounts").update({ failed_login_attempts: 0 }).eq("id", pvId);

    const cp = async (m: string) => shape(await call({ action: "changePin", mobile: m, tenantId: A, newPin: "7777" }));
    verdict("E06", "changePin with no PIN and no session: farmer vs provider-only vs unknown", new Set([await cp(FA), await cp(PV), await cp(UN)]).size === 1, { farmer: await cp(FA), provider: await cp(PV), unknown: await cp(UN) });

    const rr = async (m: string, t?: string) => shape(await call({ action: "requestPinReset", mobile: m, tenantId: t }));
    const resF = await rr(FA, A), resP = await rr(PV, A), resU = await rr(UN, A);
    verdict("E07", "requestPinReset WITH tenantId: farmer vs provider-only", resF === resP, { farmer: resF, provider: resP, unknown: resU });
    await db.from("pin_reset_codes").delete().neq("mobile_number", "");
    const resF2 = await rr(FA), resP2 = await rr(PV);
    verdict("E08", "requestPinReset WITHOUT tenantId: farmer vs provider-only", resF2 === resP2, { farmer: resF2, providerOnly: resP2 });
    await db.from("pin_reset_codes").delete().neq("mobile_number", "");
  }

  console.log("=== A / B. sessions, roles, suspension (auth core + verifier) ===");
  {
    const a = await verify.resolveVerifiedAccount(verifierReq({ "x-session-token": pvTok }), ["FARMER", "SERVICE_PROVIDER", "CUSTOMER"]);
    const f = await verify.resolveVerifiedCaller(verifierReq({ "x-session-token": pvTok, "x-farmer-id": faId, "x-tenant-id": A }));
    verdict("A20", "provider token + forged x-farmer-id / x-tenant-id of a real farmer, through the edge-function verifier", f === null && (a as any)?.role === "SERVICE_PROVIDER", { farmerCaller: f, account: a });
    verdict("A21", "provider token asks for a FARMER-only function (resolveVerifiedAccount(['FARMER']))",
      (await verify.resolveVerifiedAccount(verifierReq({ "x-session-token": pvTok }), ["FARMER"])) === null, "null");
    verdict("A22", "no token, only x-farmer-id", (await verify.resolveVerifiedCaller(verifierReq({ "x-farmer-id": faId, "x-tenant-id": A }))) === null, "null");

    const sw = [];
    for (const role of ["CUSTOMER", "FARMER", "ADMIN", "farmer", null, ["FARMER"], { role: "FARMER" }]) sw.push(shape(await call({ action: "switchRole", role }, pvTok)));
    verdict("A23", "provider switches to a role it does not hold / invalid codes", sw.every((s) => /^(403|400) /.test(s)) &&
      (await rows("user_sessions", { user_id: pvId }))[0].active_role === "SERVICE_PROVIDER", sw);

    for (const hint of ["FARMER", "CUSTOMER", "ADMIN", ["FARMER"], { a: 1 }, 1]) {
      const r = await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234", role: hint });
      if (r.body.account?.activeRole !== "SERVICE_PROVIDER" || r.body.farmer !== null) { verdict("A24", `verifyPin role hint ${JSON.stringify(hint)} for a provider-only person`, false, shape(r)); }
    }
    verdict("A24", "verifyPin role hints (FARMER, CUSTOMER, ADMIN, array, object, number) for a provider-only person: always the held role, never farmer data", true, "activeRole SERVICE_PROVIDER, farmer null, 6 of 6");

    // REST, as the browser: anon key + the provider's own token
    const h = { "x-session-token": pvTok, "x-farmer-id": faId, "x-tenant-id": A };
    const r1 = [
      await rest("GET", `/farmers?select=id,mobile_number&id=eq.${faId}`, h),
      await rest("GET", `/user_profiles?select=*&farmer_id=eq.${faId}`, h),
      await rest("GET", `/accounts?select=*`, h),
      await rest("GET", `/account_roles?select=*`, h),
      await rest("GET", `/user_sessions?select=*`, h),
      await rest("GET", `/pin_reset_codes?select=*`, h),
      await rest("PATCH", `/user_sessions?user_id=eq.${pvId}`, h, { active_role: "FARMER" }),
      await rest("POST", `/rpc/account_switch_session_role`, h, { p_token_hash: "x", p_role: "FARMER" }),
      await rest("POST", `/rpc/account_add_role_self`, h, { p_account_id: pvId, p_role: "FARMER" }),
      await rest("POST", `/rpc/account_register_self`, h, { p_tenant_id: A, p_mobile: "0000008198", p_pin_hash: "ab".repeat(32), p_roles: ["CUSTOMER"], p_language: "hi", p_display_name: "x" }),
      await rest("POST", `/rpc/link_farmer_account`, h, { p_farmer_id: pvId, p_tenant_id: A, p_mobile: PV, p_source: "X" }),
      await rest("GET", `/v_identity_integrity_gaps?select=*`, h),
    ];
    verdict("B20", "provider token over PostgREST (anon key): farmer rows, account tables, session rows, service-only functions", r1.every((s) => /^(401|403|404) /.test(s) || /^200 \[\]/.test(s)), r1);
    const r2 = [
      await rest("GET", `/farmers?select=id,mobile_number&id=eq.${faId}`, h, undefined, AUTHED_KEY),
      await rest("GET", `/accounts?select=*`, h, undefined, AUTHED_KEY),
      await rest("PATCH", `/user_sessions?user_id=eq.${pvId}`, h, { active_role: "FARMER" }, AUTHED_KEY),
      await rest("POST", `/rpc/account_add_role_self`, h, { p_account_id: pvId, p_role: "FARMER" }, AUTHED_KEY),
    ];
    verdict("B21", "same with a JWT of DB role `authenticated` (no auth.uid): no farmer row, no account row, session row unchanged, no service-only function",
      r2[0] === "200 []" && r2[1].startsWith("403 ") && r2[3].startsWith("403 ") && (await rows("user_sessions", { user_id: pvId })).every((s: any) => s.active_role === "SERVICE_PROVIDER"),
      { replies: r2, sessionRolesAfterPatch: (await rows("user_sessions", { user_id: pvId })).map((s: any) => s.active_role) });

    // role suspended mid-session
    await db.from("account_roles").update({ status: "SUSPENDED" }).eq("account_id", pvId).eq("role", "SERVICE_PROVIDER");
    const si = await call({ action: "sessionInfo" }, pvTok);
    const lg = await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234" });
    const swb = await call({ action: "switchRole", role: "SERVICE_PROVIDER" }, pvTok);
    const add = await call({ action: "addRole", role: "SERVICE_PROVIDER" }, pvTok);
    verdict("A25", "provider role SUSPENDED: next verifier call, sessionInfo, fresh login, switch back in, re-add",
      (await verify.resolveVerifiedAccount(verifierReq({ "x-session-token": pvTok }), ["SERVICE_PROVIDER"])) === null &&
      si.body.account?.activeRole === null && lg.status === 401 && swb.status === 403 && add.body.roleStatus === "SUSPENDED",
      { sessionInfoActiveRole: si.body.account?.activeRole, login: shape(lg), switch: shape(swb), reAdd: add.body.roleStatus });
    const addC = await call({ action: "addRole", role: "CUSTOMER" }, pvTok);
    const swC = await call({ action: "switchRole", role: "CUSTOMER" }, pvTok);
    info("A26", "a person whose ONLY role is SUSPENDED, holding a session from before: self-adds CUSTOMER and switches into it (a different role; logging in afresh was refused a moment earlier)",
      { addRole: `${addC.status} ${addC.body.roleStatus}`, switchRole: `${swC.status} ${swC.body.account?.activeRole}`, loginNow: (await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234" })).status });
    await db.from("account_roles").update({ status: "ACTIVE" }).eq("account_id", pvId).eq("role", "SERVICE_PROVIDER");
    await call({ action: "switchRole", role: "SERVICE_PROVIDER" }, pvTok);

    // account suspended
    await db.from("accounts").update({ status: "SUSPENDED" }).eq("id", pvId);
    const s1 = [shape(await call({ action: "sessionInfo" }, pvTok)), shape(await call({ action: "switchRole", role: "CUSTOMER" }, pvTok)), shape(await call({ action: "addRole", role: "FARMER" }, pvTok)),
      shape(await call({ action: "updateAccount", displayName: "x" }, pvTok)), shape(await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234" })),
      shape(await call({ action: "changePin", mobile: PV, tenantId: A, newPin: "5555", currentPin: "1234" }, pvTok)), shape(await call({ action: "register", mobile: PV, tenantId: A, pin: "5555" }))];
    verdict("A27", "account SUSPENDED: sessionInfo, switchRole, addRole, updateAccount, login, changePin, re-register as farmer",
      s1.every((s) => /^(401|409) /.test(s)) && (await verify.resolveVerifiedAccount(verifierReq({ "x-session-token": pvTok }), ["SERVICE_PROVIDER", "CUSTOMER"])) === null, s1);
    await db.from("accounts").update({ status: "ACTIVE" }).eq("id", pvId);

    // FARMER role / account suspended for a FARMER: what does login hand back?
    for (const [id, label, patchRole, patchAcc] of [
      ["A28", "FARMER role SUSPENDED (flag ON)", "SUSPENDED", "ACTIVE"],
      ["A29", "farmer's account SUSPENDED (flag ON)", "ACTIVE", "SUSPENDED"],
      ["A30", "FARMER role REVOKED in account_roles (flag ON)", "REVOKED", "ACTIVE"],
    ] as const) {
      await db.from("account_roles").update({ status: patchRole }).eq("account_id", faId).eq("role", "FARMER");
      await db.from("accounts").update({ status: patchAcc }).eq("id", faId);
      const r = await call({ action: "verifyPin", mobile: FA, tenantId: A, pin: "1234" });
      const ctx = r.body.session?.token ? await verify.resolveVerifiedCaller(verifierReq({ "x-session-token": r.body.session.token })) : null;
      verdict(id, `${label}: the farmer logs in with the correct PIN`, r.status !== 200,
        { status: r.status, sessionIssued: !!r.body.session?.token, farmerRowReturned: !!r.body.farmer?.id, farmerFields: r.body.farmer ? Object.keys(r.body.farmer).length : 0,
          profileReturned: !!r.body.profile, activeRole: r.body.account?.activeRole, dbFarmerContextForThatToken: ctx });
    }
    await setFlag({ is_enabled: false, target_tenants: [] });
    {
      const r = await call({ action: "verifyPin", mobile: FA, tenantId: A, pin: "1234" });
      const ctx = r.body.session?.token ? await verify.resolveVerifiedCaller(verifierReq({ "x-session-token": r.body.session.token })) : null;
      verdict("A31", "FARMER role REVOKED, flag OFF: the farmer logs in with the correct PIN", r.status !== 200,
        { status: r.status, sessionIssued: !!r.body.session?.token, farmerRowReturned: !!r.body.farmer?.id, profileReturned: !!r.body.profile, dbFarmerContextForThatToken: ctx });
    }
    await setFlag({ is_enabled: true, target_tenants: [A] });
    await db.from("account_roles").update({ status: "ACTIVE" }).eq("account_id", faId).eq("role", "FARMER");
    await db.from("accounts").update({ status: "ACTIVE" }).eq("id", faId);
    faTok = (await call({ action: "verifyPin", mobile: FA, tenantId: A, pin: "1234" })).body.session.token;

    // farmer who switches to another workspace
    await call({ action: "addRole", role: "CUSTOMER" }, faTok);
    const toC = await call({ action: "switchRole", role: "CUSTOMER" }, faTok);
    const inC = await verify.resolveVerifiedCaller(verifierReq({ "x-session-token": faTok, "x-farmer-id": faId }));
    const back = await call({ action: "switchRole", role: "FARMER" }, faTok);
    const inF = await verify.resolveVerifiedCaller(verifierReq({ "x-session-token": faTok }));
    verdict("B22", "farmer switches to the Customer workspace: the reply carries no farmer row, and the same token no longer resolves to a farmer; switching back restores it",
      toC.status === 200 && toC.body.farmer === null && toC.body.profile === null && inC === null && back.body.farmer?.id === faId && (inF as any)?.farmerId === faId,
      { toCustomer: { status: toC.status, farmer: toC.body.farmer }, farmerCallerWhileCustomer: inC, back: (inF as any)?.kind });

    // logout
    const lo = await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234" });
    await call({ action: "logout", sessionToken: lo.body.session.token });
    verdict("A32", "token after logout: sessionInfo, switchRole, verifier", (await call({ action: "sessionInfo" }, lo.body.session.token)).status === 401 &&
      (await call({ action: "switchRole", role: "SERVICE_PROVIDER" }, lo.body.session.token)).status === 401 &&
      (await verify.resolveVerifiedAccount(verifierReq({ "x-session-token": lo.body.session.token }), ["SERVICE_PROVIDER"])) === null, "401 / 401 / null");
    // header vs body token
    const mix = await call({ action: "sessionInfo", sessionToken: faTok }, pvTok);
    verdict("A33", "header token of the provider + body sessionToken of the farmer: one identity only, the header's", mix.body.account?.id === pvId, { answeredFor: mix.body.account?.id === pvId ? "provider (header)" : mix.body.account?.id });
  }

  console.log("=== D. elevated values ===");
  {
    await clearLimits();
    const bad = [];
    for (const role of ["ADMIN", "TENANT_ADMIN", "VERIFIED_PROVIDER", "farmer", "", null, ["CUSTOMER"], { role: "CUSTOMER" }, 1]) bad.push((await call({ action: "addRole", role }, pvTok)).status);
    verdict("D20", "addRole with 9 invalid / elevated / crafted role values", bad.every((s) => s === 400), bad);
    const crafted = [];
    for (const roles of [["ADMIN"], ["CUSTOMER", "ADMIN"], ["CUSTOMER", "CUSTOMER"], [], "CUSTOMER", [["CUSTOMER"]], [null], { 0: "CUSTOMER", length: 1 }, ["customer"], ["FARMER", "FARMER"], null]) {
      crafted.push((await call({ action: "register", mobile: "0000008150", tenantId: A, pin: "1234", roles })).status);
    }
    verdict("D21", "register with 11 crafted roles values", crafted.every((s) => s === 400) && (await rows("accounts", { mobile_number: "0000008150" })).length === 0 && (await rows("farmers", { mobile_number: "0000008150" })).length === 0, crafted);
    await clearLimits();
    const el = await call({ action: "register", mobile: "0000008151", tenantId: A, pin: "1234", roles: ["FARMER", "SERVICE_PROVIDER"], status: "ACTIVE", mobile_verified_at: new Date().toISOString(),
      mobileVerified: true, is_verified: true, seller_verified: true, verified: true, granted_by: pvId, source: "ADMIN", role: "ADMIN", account: { status: "VERIFIED" } });
    const acc = (await rows("accounts", { mobile_number: "0000008151" }))[0], frm = (await rows("farmers", { mobile_number: "0000008151" }))[0];
    const rl = await rows("account_roles", { account_id: acc.id });
    verdict("D22", "register carrying mobile_verified_at / is_verified / seller_verified / status / source / granted_by",
      el.status === 200 && acc.mobile_verified_at === null && frm.is_verified === false && frm.seller_verified === false && rl.every((r: any) => r.granted_by === null && ["FARMER_TRIGGER", "SELF_ADDED"].includes(r.source)),
      { mobile_verified_at: acc.mobile_verified_at, is_verified: frm.is_verified, seller_verified: frm.seller_verified, roles: rl.map((r: any) => `${r.role}:${r.status}:${r.source}`) });
    const up = await call({ action: "updateAccount", displayName: "Fake Name", status: "ACTIVE", mobile_verified_at: new Date().toISOString(), pin_hash: "ab".repeat(32), tenant_id: B, tenantId: B,
      mobile_number: "0000000001", id: faId, accountId: faId, roles: [{ role: "FARMER", status: "ACTIVE" }] }, pvTok);
    const after = (await rows("accounts", { id: pvId }))[0];
    verdict("D23", "updateAccount carrying status / mobile_verified_at / pin_hash / tenant_id / mobile_number / another account id / roles",
      up.status === 200 && after.mobile_verified_at === null && after.tenant_id === A && after.mobile_number === PV && after.display_name === "Fake Name" &&
      (await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234" })).status === 200 && (await rows("accounts", { id: faId }))[0].display_name !== "Fake Name" &&
      (await rows("account_roles", { account_id: pvId })).every((r: any) => r.role !== "FARMER"),
      { mobile_verified_at: after.mobile_verified_at, tenant: after.tenant_id === A ? "unchanged" : after.tenant_id, pinStillOld: true });

    // D24: Farmer role revoked by the tenant admin, re-added by the person
    await clearLimits();
    const p3 = await call({ action: "register", mobile: "0000008103", tenantId: A, pin: "1234", roles: ["SERVICE_PROVIDER"] });
    const p3Tok = p3.body.session.token, p3Id = p3.body.account.id;
    const add1 = await call({ action: "addRole", role: "FARMER" }, p3Tok);
    await db.from("farmers").delete().eq("id", p3Id);                 // the tenant portal removes this person as a farmer
    const mid = (await rows("account_roles", { account_id: p3Id, role: "FARMER" }))[0].status;
    const add2 = await call({ action: "addRole", role: "FARMER" }, p3Tok);
    const now = (await rows("account_roles", { account_id: p3Id, role: "FARMER" }))[0].status;
    const swF = await call({ action: "switchRole", role: "FARMER" }, p3Tok);
    const ctx = await verify.resolveVerifiedCaller(verifierReq({ "x-session-token": p3Tok }));
    verdict("D24", "provider adds FARMER; the tenant admin deletes the farmers row (role REVOKED); the person calls addRole FARMER again",
      now === "REVOKED", { firstAdd: add1.body.roleStatus, afterAdminDelete: mid, secondAdd: `${add2.status} ${add2.body.roleStatus}`, roleNow: now, switchToFarmer: swF.status, farmerContext: (ctx as any)?.kind ?? null });
  }

  console.log("=== C. lock-out through number squatting (unauthenticated) ===");
  {
    await clearLimits();
    const VICTIM = "0000008120";
    // 1. anyone, no proof of owning the number, registers it as a Customer
    const sq = await call({ action: "register", mobile: VICTIM, tenantId: A, pin: "4321", roles: ["CUSTOMER"] });
    // 2. the tenant portal adds the real farmer with that number (service-role insert here; the tenant-admin insert is C05 in the SQL script)
    const { error: insErr } = await db.from("farmers").insert({ mobile_number: VICTIM, tenant_id: A, pin_hash: "c0".repeat(32), farmer_code: "BK-VICTIM-1" });
    // give the farmer a PIN he knows (as the portal / first-login flow would)
    const pinHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("2468" + "kisan_shakti_2024")))).map((b) => b.toString(16).padStart(2, "0")).join("");
    await db.from("farmers").update({ pin_hash: pinHash }).eq("mobile_number", VICTIM).eq("tenant_id", A);
    const victim = (await rows("farmers", { mobile_number: VICTIM, tenant_id: A }))[0];
    // 3. the farmer logs in with the correct PIN
    const login = await call({ action: "verifyPin", mobile: VICTIM, tenantId: A, pin: "2468" });
    const reg2 = await call({ action: "register", mobile: VICTIM, tenantId: A, pin: "2468" });
    const reset = await call({ action: "requestPinReset", mobile: VICTIM, tenantId: A });
    const squatterLogin = await call({ action: "verifyPin", mobile: VICTIM, tenantId: A, pin: "4321" });
    verdict("C20", "an unauthenticated caller registers somebody's number as a Customer; the tenant portal then adds that person as a farmer; the farmer logs in with the correct PIN",
      login.status === 200, { squatterRegistration: sq.status, portalInsert: insErr ? insErr.message : "ok", farmerAccount: (await rows("accounts", { id: victim.id })).length,
        farmerLoginCorrectPin: shape(login), farmerRegisterAgain: shape(reg2), pinResetRequest: shape(reset), squatterLoginNow: shape(squatterLogin),
        note: (await rows("account_link_conflicts", { farmer_id: victim.id }))[0]?.reason });
  }

  console.log("=== E. rate limits and lockout on the new actions ===");
  {
    await clearLimits();
    let ok = 0;
    for (let i = 0; i < 12; i++) if ((await call({ action: "register", mobile: `00000082${String(i).padStart(2, "0")}`, tenantId: A, pin: "1234", roles: ["CUSTOMER"] })).status === 200) ok++;
    info("E20", "12 Customer registrations for 12 different numbers from one caller, no proof of any number (limit is 5 per hour PER NUMBER; farmer registration has no limit either)", `${ok} of 12 accepted`);
    await clearLimits();
    const seq = [];
    for (let i = 0; i < 7; i++) seq.push((await call({ action: "register", mobile: "0000008230", tenantId: A, pin: "1234", roles: ["CUSTOMER"] })).status);
    verdict("E21", "7 role registrations for ONE number in a row (limit 5 per hour)", seq.slice(5).every((s) => s === 429), seq);
    await clearLimits();
    const adds = [];
    for (let i = 0; i < 12; i++) adds.push((await call({ action: "addRole", role: "CUSTOMER" }, pvTok)).status);
    verdict("E22", "12 addRole calls in a row (limit 10 per hour)", adds.slice(10).every((s) => s === 429), adds);
    await clearLimits();
    const burst = await Promise.all(Array.from({ length: 80 }, () => call({ action: "switchRole", role: "SERVICE_PROVIDER" }, pvTok)));
    const okB = burst.filter((r) => r.status === 200).length;
    verdict("E23", "80 switchRole calls fired in parallel (limit 30 per minute)", okB <= 30, { accepted: okB, limited: burst.filter((r) => r.status === 429).length, trackingRows: (await rows("rate_limit_tracking", { identifier: pvId })).length });
    await clearLimits();
    const burst2 = await Promise.all(Array.from({ length: 30 }, () => call({ action: "register", mobile: "0000008231", tenantId: A, pin: "1234", roles: ["CUSTOMER"] })));
    verdict("E24", "30 role registrations for one number fired in parallel (limit 5 per hour)", burst2.filter((r) => r.status !== 429).length <= 5,
      { notLimited: burst2.filter((r) => r.status !== 429).length, limited: burst2.filter((r) => r.status === 429).length });

    // PIN lockout under parallel guessing: account path (new) and farmer path (existing) side by side
    const lk = await call({ action: "register", mobile: "0000008240", tenantId: A, pin: "1234", roles: ["SERVICE_PROVIDER"] });
    await call({ action: "register", mobile: "0000008241", tenantId: A, pin: "1234" });
    const guess = (m: string) => Promise.all(Array.from({ length: 60 }, (_, i) => call({ action: "verifyPin", mobile: m, tenantId: A, pin: String(2000 + i) })));
    const g1 = await guess("0000008240"), g2 = await guess("0000008241");
    const ev = (g: any[]) => ({ evaluatedGuesses: g.filter((r) => r.status === 401).length, lockedOut: g.filter((r) => r.status === 429).length });
    verdict("E25", "60 wrong PINs fired in parallel at a provider-only number (lockout after 5)", ev(g1).evaluatedGuesses <= 5, { accountPath: ev(g1), farmerPathSameAttack: ev(g2), counterAfter: (await rows("accounts", { id: lk.body.account.id }))[0].failed_login_attempts });
    // the same weakness used for what it is good for: find an unknown 4-digit PIN of a provider-only number in ONE burst
    const tgt = await call({ action: "register", mobile: "0000008242", tenantId: A, pin: "1187", roles: ["SERVICE_PROVIDER"] });
    await db.from("user_sessions").update({ is_active: false }).eq("user_id", tgt.body.account.id);
    const sweep = await Promise.all(Array.from({ length: 300 }, (_, i) => call({ action: "verifyPin", mobile: "0000008242", tenantId: A, pin: String(1000 + i) })));
    const hit = sweep.findIndex((r) => r.status === 200);
    const stolen = hit >= 0 ? await verify.resolveVerifiedAccount(verifierReq({ "x-session-token": sweep[hit].body.session.token }), ["SERVICE_PROVIDER"]) : null;
    verdict("E27", "300 PIN guesses (1000-1299) fired in parallel at a provider-only number whose PIN the attacker does not know; lockout is 5 attempts", hit < 0,
      { guessesEvaluated: sweep.filter((r) => r.status === 401 || r.status === 200).length, lockedOutReplies: sweep.filter((r) => r.status === 429).length,
        pinFound: hit >= 0 ? String(1000 + hit) : null, liveSessionObtainedAs: (stolen as any)?.role ?? null });
    const seqG = [];
    for (let i = 0; i < 3; i++) seqG.push((await call({ action: "verifyPin", mobile: "0000008240", tenantId: A, pin: "1234" })).status);
    info("E26", "…then the correct PIN, three times, right after the burst", seqG);
  }

  console.log("=== F. tenancy through the auth core ===");
  {
    await clearLimits();
    await setFlag({ is_enabled: true, target_tenants: [A, B] });
    // PV (tenant A, provider). Somebody registers the same number in tenant B as a customer, with another PIN.
    const tw = await call({ action: "register", mobile: PV, tenantId: B, pin: "8888", roles: ["CUSTOMER"] });
    const twTok = tw.body.session.token, twId = tw.body.account.id;
    const t1 = [shape(await call({ action: "switchRole", role: "SERVICE_PROVIDER", tenantId: A }, twTok)),
      shape(await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "8888" })), shape(await call({ action: "verifyPin", mobile: PV, tenantId: B, pin: "1234" })),
      shape(await call({ action: "changePin", mobile: PV, tenantId: A, newPin: "8888" }, twTok))];
    await db.from("accounts").update({ failed_login_attempts: 0 }).in("id", [pvId, twId]);
    const addX = await call({ action: "addRole", role: "SERVICE_PROVIDER", tenantId: A, accountId: pvId }, twTok);
    const rolesTw = await rows("account_roles", { account_id: twId });
    const upd = await call({ action: "updateAccount", displayName: "Twin B", tenantId: A, accountId: pvId }, twTok);
    verdict("F20", "same number in tenant B (own PIN, own session): switch into / log in as / change the PIN of / add roles to / rename the tenant-A twin",
      t1.every((s) => /^(401|403) /.test(s)) && rolesTw.every((r: any) => r.tenant_id === B) && (await rows("account_roles", { account_id: pvId })).length === 2 &&
      (await rows("accounts", { id: pvId }))[0].display_name === "Fake Name" && (await call({ action: "verifyPin", mobile: PV, tenantId: A, pin: "1234" })).status === 200,
      { attempts: t1, addRoleLandedOn: rolesTw.map((r: any) => `${r.role}@${r.tenant_id === B ? "B" : "A"}`), addStatus: addX.status, rename: upd.status });

    // PIN reset: number X is a FARMER in tenant A; the attacker holds an account-only registration of X in tenant B.
    const X = "0000008260";
    const fx = await call({ action: "register", mobile: X, tenantId: A, pin: "1234" });
    await call({ action: "register", mobile: X, tenantId: B, pin: "9999", roles: ["CUSTOMER"] });
    smsLog.length = 0;
    const rq = await call({ action: "requestPinReset", mobile: X, tenantId: B });
    const code = smsLog.at(-1)?.code ?? "";
    const useA = await call({ action: "verifyPinReset", mobile: X, tenantId: A, code, newPin: "5555" });
    const useNone = await call({ action: "verifyPinReset", mobile: X, code, newPin: "5555" });
    const farmerOld = await call({ action: "verifyPin", mobile: X, tenantId: A, pin: "1234" });
    verdict("F21", "reset code issued for the tenant-B account-only registration of a number, replayed against the tenant-A FARMER of that number (with tenantId A, and with no tenantId)",
      useA.status === 401 && useNone.status === 401 && farmerOld.status === 200, { request: shape(rq), codeCaptured: /^\d{6}$/.test(code), againstTenantA: shape(useA), tenantless: shape(useNone), farmerOldPinStillWorks: farmerOld.status === 200 });
    // reverse: the farmer's own code replayed against the tenant-B account
    await db.from("pin_reset_codes").delete().neq("mobile_number", "");
    smsLog.length = 0;
    await call({ action: "requestPinReset", mobile: X, tenantId: A });
    const codeF = smsLog.at(-1)?.code ?? "";
    const useB = await call({ action: "verifyPinReset", mobile: X, tenantId: B, code: codeF, newPin: "5555" });
    verdict("F22", "reset code issued for the tenant-A farmer replayed against the tenant-B account of the same number", useB.status === 401 &&
      (await call({ action: "verifyPin", mobile: X, tenantId: B, pin: "9999" })).status === 200, shape(useB));
    const okReset = await call({ action: "verifyPinReset", mobile: X, tenantId: A, code: codeF, newPin: "6666" });
    info("F23", "control: the right code for the right tenant does reset the farmer PIN (proves the two refusals above were real checks)", { status: okReset.status, oldSessionDead: (await call({ action: "sessionInfo" }, fx.body.session.token)).status });

    // flag ON for A only: a tenant-B account's session
    await setFlag({ is_enabled: true, target_tenants: [A] });
    const off = [shape(await call({ action: "switchRole", role: "CUSTOMER" }, twTok)), shape(await call({ action: "addRole", role: "SERVICE_PROVIDER" }, twTok)),
      shape(await call({ action: "verifyPin", mobile: PV, tenantId: B, pin: "8888" })), shape(await call({ action: "register", mobile: "0000008261", tenantId: B, pin: "1234", roles: ["CUSTOMER"] }))];
    verdict("F24", "flag turned off for tenant B: its account-only people cannot switch, add, log in or register", off.every((s) => /^(401|403) /.test(s)), off);
    await db.from("accounts").update({ failed_login_attempts: 0 }).eq("id", twId);
  }

  console.log("=== single-copy credential ===");
  {
    await clearLimits();
    const M = "0000008270";
    const p = await call({ action: "register", mobile: M, tenantId: A, pin: "1111", roles: ["SERVICE_PROVIDER"] });
    const tok = p.body.session.token, id = p.body.account.id;
    await call({ action: "addRole", role: "FARMER" }, tok);
    const a1 = (await rows("accounts", { id }))[0], f1 = (await rows("farmers", { id }))[0];
    const cp = await call({ action: "changePin", mobile: M, tenantId: A, currentPin: "1111", newPin: "2222" });
    const oldAfterChange = (await call({ action: "verifyPin", mobile: M, tenantId: A, pin: "1111" })).status;
    const newAfterChange = (await call({ action: "verifyPin", mobile: M, tenantId: A, pin: "2222" })).status;
    await db.from("farmers").delete().eq("id", id);     // portal deletes the farmers row; the person stays a provider
    const a2 = (await rows("accounts", { id }))[0];
    await db.from("accounts").update({ failed_login_attempts: 0 }).eq("id", id);
    const oldAfterDelete = (await call({ action: "verifyPin", mobile: M, tenantId: A, pin: "1111" })).status;
    const newAfterDelete = await call({ action: "verifyPin", mobile: M, tenantId: A, pin: "2222" });
    verdict("S01", "provider adds FARMER, changes the PIN, the portal deletes the farmers row: exactly one live credential at every step and the old PIN dead everywhere",
      a1.pin_hash === null && !!f1.pin_hash && cp.status === 200 && oldAfterChange === 401 && newAfterChange === 200 && !!a2.pin_hash && oldAfterDelete === 401 &&
      newAfterDelete.status === 200 && newAfterDelete.body.account.activeRole === "SERVICE_PROVIDER",
      { afterAdd: { accountPin: a1.pin_hash, farmerPin: !!f1.pin_hash }, oldPinAfterChange: oldAfterChange, newPinAfterChange: newAfterChange,
        afterFarmerDelete: { accountPin: !!a2.pin_hash, oldPin: oldAfterDelete, newPin: newAfterDelete.status } });

    // two addRole FARMER at once
    await clearLimits();
    const q = await call({ action: "register", mobile: "0000008271", tenantId: A, pin: "1111", roles: ["CUSTOMER"] });
    const both = await Promise.all([call({ action: "addRole", role: "FARMER" }, q.body.session.token), call({ action: "addRole", role: "FARMER" }, q.body.session.token), call({ action: "addRole", role: "FARMER" }, q.body.session.token)]);
    const qa = (await rows("accounts", { id: q.body.account.id }))[0], qf = await rows("farmers", { id: q.body.account.id });
    verdict("S02", "three addRole FARMER at once: one farmers row, credential on exactly one side", qf.length === 1 && qa.pin_hash === null && !!qf[0].pin_hash, { replies: both.map((r) => `${r.status} ${r.body.roleStatus ?? r.body.error}`), farmers: qf.length, accountPin: qa.pin_hash });

    // addRole FARMER raced with changePin (the account path writes accounts.pin_hash after its own read)
    let twice = 0, none = 0, oldStillOpens = 0; const rounds = 25;
    for (let i = 0; i < rounds; i++) {
      await clearLimits();
      const m = `00000083${String(i).padStart(2, "0")}`;
      const r = await call({ action: "register", mobile: m, tenantId: A, pin: "1111", roles: ["SERVICE_PROVIDER"] });
      await Promise.all([call({ action: "changePin", mobile: m, tenantId: A, currentPin: "1111", newPin: "2222" }), call({ action: "addRole", role: "FARMER" }, r.body.session.token)]);
      const acc = (await rows("accounts", { id: r.body.account.id }))[0], frm = (await rows("farmers", { id: r.body.account.id }))[0];
      if (acc.pin_hash && frm?.pin_hash) twice++;
      if (!acc.pin_hash && !frm?.pin_hash) none++;
      if (frm && (await call({ action: "verifyPin", mobile: m, tenantId: A, pin: "1111" })).status === 200) oldStillOpens++;
    }
    verdict("S03", `changePin (1111 -> 2222, replied 200) raced with addRole FARMER, ${rounds} fresh people`, twice === 0 && none === 0 && oldStillOpens === 0,
      { credentialHeldTwice: twice, credentialHeldNowhere: none, peopleWhoseOLDPinStillLogsInAfterTheChange: oldStillOpens, of: rounds });

    // reset code issued while account-only, used after becoming a farmer
    await clearLimits();
    const z = await call({ action: "register", mobile: "0000008272", tenantId: A, pin: "1111", roles: ["SERVICE_PROVIDER"] });
    smsLog.length = 0;
    await call({ action: "requestPinReset", mobile: "0000008272", tenantId: A });
    const zc = smsLog.at(-1)?.code ?? "";
    await call({ action: "addRole", role: "FARMER" }, z.body.session.token);
    const zr = await call({ action: "verifyPinReset", mobile: "0000008272", tenantId: A, code: zc, newPin: "3333" });
    const zAcc = (await rows("accounts", { id: z.body.account.id }))[0];
    verdict("S04", "reset code issued for the account, used after the credential moved to the farmers row", zAcc.pin_hash === null, { reply: shape(zr), accountPinAfter: zAcc.pin_hash });
  }
} catch (e) {
  console.log(`SCRIPT ERROR | ${(e as Error).stack ?? e}`);
  broken++;
} finally {
  console.log("───────────────────────────────────────────────────────────────────────────");
  console.log(`auth core: ${passed} PASS, ${broken} BROKEN`);
  await proxy.shutdown();
  Deno.exit(broken === 0 ? 0 : 1);
}
