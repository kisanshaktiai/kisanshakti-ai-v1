/**
 * farmer-auth-core — server-authoritative farmer authentication handler
 *
 * Shared by the `farmer-auth` function and (as a transport fallback) by
 * `tenant-config`, which accepts the same action payloads on POST.
 *
 * CHANGE LOG
 * 2026-09-01 — Initial version. Replaces the client-side farmer lookup /
 *              registration / PIN write paths that were previously exposed
 *              through public RLS policies (account-takeover class bug).
 *
 * Actions:
 *   lookup      { mobile, tenantId }                       -> { exists, requiresPinSetup }
 *   register    { mobile, tenantId, pin, language }        -> session
 *   verifyPin   { mobile, tenantId, pin }                  -> session + farmer + profile
 *   changePin   { mobile, tenantId, currentPin, newPin }   -> session
 *   logout      { sessionToken }                           -> { ok }
 *
 * 2026-11-24 — Multi-role identity (Task 1, M2). A person is now an account
 *              (public.accounts) holding FARMER / SERVICE_PROVIDER / CUSTOMER
 *              memberships (public.account_roles). Every existing farmer line
 *              below is unchanged; the account paths sit beside it and are
 *              served only while the `multi_role_identity` feature flag is ON
 *              for the tenant. With the flag OFF the only difference from the
 *              previous version is that a new session row records
 *              active_role = 'FARMER' (NULL already meant FARMER).
 *
 *              Credential, single copy: a person with a farmers row keeps
 *              farmers.pin_hash; a person without one keeps accounts.pin_hash.
 *
 *   lookup      also returns { multiRole } (the flag, for the client)
 *   register    also accepts { roles: [...], role, displayName }
 *   verifyPin   also accepts { role } (a role code, or "AUTO" = last used)
 *               and returns { account } when the flag is ON
 *   changePin / requestPinReset / verifyPinReset
 *               also serve a person without a farmers row
 *
 *   New, authenticated by the session token (x-session-token or sessionToken):
 *   sessionInfo   {}                                         -> { account, multiRole }
 *   switchRole    { role }                                   -> { account, farmer, profile }
 *   addRole       { role }                                   -> { account, roleStatus }
 *   updateAccount { displayName?, languageCode? }            -> { account }
 *
 * `account` = { id, tenantId, displayName, avatarUrl, languageCode,
 *               mobileMasked, roles: [{ role, status }], activeRole }.
 * Roles are returned only to an authenticated caller, never by lookup.
 *
 * No endpoint ever returns pin_hash. Identity (farmer_id / tenant_id) is only
 * ever derived here, server-side, and handed back with an opaque session token
 * whose SHA-256 hash is persisted in public.user_sessions.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { isFlagEnabled } from "../_shared/featureFlags.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Must match the historical client-side hash so existing PINs keep working.
const PIN_SALT = "kisan_shakti_2024";
const SESSION_TTL_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// --- PIN reset (forgot-PIN) policy -----------------------------------------
const RESET_CODE_TTL_MS = 10 * 60_000;
const RESET_MAX_ATTEMPTS = 5;
const RESET_MAX_PER_HOUR = 3;
const RESET_MIN_INTERVAL_MS = 60_000;

// --- Multi-role identity ----------------------------------------------------
const MULTI_ROLE_FLAG = "multi_role_identity";
// Order = which workspace opens when nothing else decides it.
const ROLE_CODES = ["FARMER", "SERVICE_PROVIDER", "CUSTOMER"] as const;
type RoleCode = typeof ROLE_CODES[number];
// Role endpoints are limited per person, like the PIN lockout and the reset limits.
const ROLE_REGISTER_LIMIT = { maxRequests: 5, windowMs: 3600_000 };
const ROLE_ADD_LIMIT = { maxRequests: 10, windowMs: 3600_000 };
const ROLE_SWITCH_LIMIT = { maxRequests: 30, windowMs: 60_000 };
const ACCOUNT_UPDATE_LIMIT = { maxRequests: 20, windowMs: 3600_000 };

const MSG91_AUTH_KEY = Deno.env.get("MSG91_AUTH_KEY") ?? "";
const MSG91_SENDER_ID = Deno.env.get("MSG91_SENDER_ID") ?? "";
const MSG91_OTP_TEMPLATE_ID = Deno.env.get("MSG91_OTP_TEMPLATE_ID") ?? "";

/** SMS delivery is optional infrastructure; without it there is no reset path. */
function smsConfigured(): boolean {
  return !!(MSG91_AUTH_KEY && MSG91_OTP_TEMPLATE_ID);
}

async function sendOtpSms(mobile: string, code: string): Promise<boolean> {
  try {
    const res = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: MSG91_AUTH_KEY,
      },
      body: JSON.stringify({
        template_id: MSG91_OTP_TEMPLATE_ID,
        sender: MSG91_SENDER_ID || undefined,
        short_url: "0",
        recipients: [{ mobiles: `91${mobile}`, otp: code }],
      }),
    });
    if (!res.ok) {
      console.error("[farmer-auth] sms send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[farmer-auth] sms send error", err);
    return false;
  }
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const hashPin = (pin: string) => sha256Hex(pin + PIN_SALT);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidMobile(m: unknown): m is string {
  return typeof m === "string" && /^\d{10}$/.test(m);
}
function isValidPin(p: unknown): p is string {
  return typeof p === "string" && /^\d{4,6}$/.test(p);
}
function isUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** Mints an opaque session token and persists only its hash. */
async function createSession(farmerId: string, req: Request, activeRole: RoleCode = "FARMER") {
  const raw = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const hash = await sha256Hex(raw);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000).toISOString();

  // Retire other live sessions for this device class is intentionally NOT done:
  // farmers legitimately use multiple devices. Expired rows are pruned lazily.
  await admin.from("user_sessions")
    .update({ is_active: false })
    .eq("user_id", farmerId)
    .lt("expires_at", new Date().toISOString());

  const { error } = await admin.from("user_sessions").insert({
    user_id: farmerId,
    session_id: crypto.randomUUID(),
    access_token_hash: hash,
    expires_at: expiresAt,
    is_active: true,
    last_activity_at: new Date().toISOString(),
    active_role: activeRole,
    role_verified_at: new Date().toISOString(),
    device_info: {
      ua: req.headers.get("user-agent") ?? null,
      platform: req.headers.get("x-supabase-client-platform") ?? null,
    },
  });
  if (error) throw new Error(`session_create_failed: ${error.message}`);

  return { token: raw, expiresAt };
}

/** Never leaks pin_hash to the client. */
function sanitizeFarmer(farmer: Record<string, unknown>) {
  const { pin_hash: _pin, ...safe } = farmer;
  return safe;
}

async function findFarmer(mobile: string, tenantId: string | null) {
  let q = admin.from("farmers").select("*").eq("mobile_number", mobile).limit(2);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

function lockoutRemainingMs(farmer: any): number {
  const failed = Number(farmer.failed_login_attempts ?? 0);
  if (failed < MAX_FAILED_ATTEMPTS || !farmer.last_failed_login) return 0;
  const until = new Date(farmer.last_failed_login).getTime() + LOCKOUT_MINUTES * 60_000;
  return Math.max(0, until - Date.now());
}

// ============================================================================
// Multi-role identity helpers
// ============================================================================

function isRoleCode(v: unknown): v is RoleCode {
  return typeof v === "string" && (ROLE_CODES as readonly string[]).includes(v);
}

/** Feature flag, per tenant. Without a tenant the account paths are never served. */
async function multiRoleEnabled(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  const decision = await isFlagEnabled(admin, MULTI_ROLE_FLAG, { tenantId });
  return decision.enabled;
}

/**
 * The open account of a (tenant, mobile). Callers use it only after findFarmer()
 * found nothing, so the account it returns belongs to a person without a farmers
 * row. Always needs a tenant: there is no "first match" for accounts.
 */
async function findAccountOnly(mobile: string, tenantId: string | null) {
  if (!tenantId) return null;
  const { data, error } = await admin.from("accounts").select("*")
    .eq("tenant_id", tenantId)
    .eq("mobile_number", mobile)
    .neq("status", "CLOSED")
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

/** Roles the account holds as ACTIVE right now, in ROLE_CODES order. */
async function activeRolesOf(accountId: string): Promise<RoleCode[]> {
  const { data, error } = await admin.from("account_roles")
    .select("role, status")
    .eq("account_id", accountId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  const held = new Set((data ?? []).map((r: any) => r.role));
  return ROLE_CODES.filter((r) => held.has(r));
}

/**
 * Which workspace a new session opens. A role code the account holds wins;
 * "AUTO" means the role of the person's most recent session; otherwise the first
 * held role in ROLE_CODES order, so a client that sends no hint (every version
 * before multi-role) always gets FARMER when the person is a farmer.
 */
async function chooseRole(accountId: string, held: RoleCode[], hint: unknown): Promise<RoleCode | null> {
  if (isRoleCode(hint) && held.includes(hint)) return hint;
  if (hint === "AUTO") {
    const { data } = await admin.from("user_sessions")
      .select("active_role")
      .eq("user_id", accountId)
      .not("active_role", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.active_role;
    if (isRoleCode(last) && held.includes(last)) return last;
  }
  return held[0] ?? null;
}

function maskMobile(mobile: unknown): string | null {
  return typeof mobile === "string" && mobile.length >= 4
    ? "•".repeat(mobile.length - 4) + mobile.slice(-4)
    : null;
}

/** What the signed-in person may know about their own account. Never the PIN. */
async function accountSummary(accountId: string, activeRole: RoleCode | null) {
  const { data: acc } = await admin.from("accounts")
    .select("id, tenant_id, mobile_number, display_name, avatar_url, language_code")
    .eq("id", accountId)
    .maybeSingle();
  if (!acc) return null;
  const { data: roles } = await admin.from("account_roles")
    .select("role, status")
    .eq("account_id", accountId)
    .neq("status", "REVOKED");
  const byRole = new Map((roles ?? []).map((r: any) => [r.role, r.status]));
  return {
    id: acc.id,
    tenantId: acc.tenant_id,
    displayName: acc.display_name ?? null,
    avatarUrl: acc.avatar_url ?? null,
    languageCode: acc.language_code ?? null,
    mobileMasked: maskMobile(acc.mobile_number),
    roles: ROLE_CODES.filter((r) => byRole.has(r)).map((r) => ({ role: r, status: byRole.get(r) })),
    activeRole,
  };
}

/** Session role for a farmer login. Flag OFF: FARMER, and no account is read. */
async function farmerSessionRole(farmer: any, hint: unknown): Promise<{ role: RoleCode; multi: boolean }> {
  const multi = await multiRoleEnabled(farmer.tenant_id);
  if (!multi) return { role: "FARMER", multi };
  const held = await activeRolesOf(farmer.id);
  return { role: (await chooseRole(farmer.id, held, hint)) ?? "FARMER", multi };
}

/** The same reply shape farmer logins use, plus `account` while the flag is ON. */
async function farmerAuthReply(farmer: any, profile: any, req: Request, hint: unknown) {
  const { role, multi } = await farmerSessionRole(farmer, hint);
  const session = await createSession(farmer.id, req, role);
  return json({
    session: { token: session.token, expiresAt: session.expiresAt },
    farmer: sanitizeFarmer(farmer),
    profile: profile ?? null,
    ...(multi ? { account: await accountSummary(farmer.id, role) } : {}),
  });
}

/** Reply for a person without a farmers row. Null = no ACTIVE role (fail closed). */
async function accountAuthReply(account: any, req: Request, hint: unknown): Promise<Response | null> {
  const held = await activeRolesOf(account.id);
  const role = await chooseRole(account.id, held, hint);
  if (!role || role === "FARMER") return null;
  const session = await createSession(account.id, req, role);
  return json({
    session: { token: session.token, expiresAt: session.expiresAt },
    account: await accountSummary(account.id, role),
    farmer: null,
    profile: null,
  });
}

async function rateLimited(identifier: string, endpoint: string, config: { maxRequests: number; windowMs: number }) {
  const res = await checkRateLimit(identifier, `farmer-auth:${endpoint}`, config);
  if (res.allowed) return null;
  return json({
    error: "rate_limited",
    retryAfterSeconds: Math.max(1, Math.ceil((res.resetTime - Date.now()) / 1000)),
  }, 429);
}

/** The live session behind the caller's token, with its ACTIVE account. */
async function sessionAccount(req: Request, body: any) {
  const token = req.headers.get("x-session-token") ?? body?.sessionToken;
  if (typeof token !== "string" || token.length === 0) return null;
  const tokenHash = await sha256Hex(token);
  const { data: sess } = await admin.from("user_sessions")
    .select("id, user_id, active_role, expires_at")
    .eq("access_token_hash", tokenHash)
    .eq("is_active", true)
    .maybeSingle();
  if (!sess || new Date(sess.expires_at).getTime() <= Date.now()) return null;
  const { data: account } = await admin.from("accounts")
    .select("*").eq("id", sess.user_id).maybeSingle();
  if (!account || account.status !== "ACTIVE") return null;
  return { tokenHash, sess, account };
}

/** The session's role, only while the membership behind it is still ACTIVE. */
async function liveSessionRole(ctx: { sess: any; account: any }): Promise<RoleCode | null> {
  const role = ctx.sess.active_role ?? "FARMER";
  const held = await activeRolesOf(ctx.account.id);
  return isRoleCode(role) && held.includes(role) ? role : null;
}

/** Maps the codes raised by the account_* database functions to client errors. */
function accountRpcError(message: string | undefined): Response {
  const m = message ?? "";
  if (m.includes("ACCOUNT_EXISTS")) return json({ error: "already_registered" }, 409);
  if (m.includes("ACCOUNT_ROLE_INVALID")) return json({ error: "invalid_role" }, 400);
  if (m.includes("ACCOUNT_INPUT_INVALID")) return json({ error: "invalid_request" }, 400);
  if (m.includes("ROLE_NOT_HELD")) return json({ error: "role_not_held" }, 403);
  if (m.includes("ROLE_NOT_AVAILABLE")) return json({ error: "role_not_available" }, 403);
  if (m.includes("SESSION_INVALID") || m.includes("ACCOUNT_NOT_ACTIVE")) {
    return json({ error: "session_required" }, 401);
  }
  console.error("[farmer-auth] account rpc error", m);
  return json({ error: "server_error" }, 500);
}

/** Session-authenticated actions. Returns null when `action` is not one of them. */
async function handleSessionAction(action: string, req: Request, body: any): Promise<Response | null> {
  if (!["sessionInfo", "switchRole", "addRole", "updateAccount"].includes(action)) return null;

  const ctx = await sessionAccount(req, body);
  if (!ctx) return json({ error: "session_required" }, 401);
  const multi = await multiRoleEnabled(ctx.account.tenant_id);

  if (action === "sessionInfo") {
    return json({
      account: await accountSummary(ctx.account.id, await liveSessionRole(ctx)),
      multiRole: multi,
    });
  }

  if (!multi) return json({ error: "feature_disabled" }, 403);

  if (action === "switchRole") {
    if (!isRoleCode(body?.role)) return json({ error: "invalid_role" }, 400);
    const limited = await rateLimited(ctx.account.id, "switchRole", ROLE_SWITCH_LIMIT);
    if (limited) return limited;

    const { error } = await admin.rpc("account_switch_session_role", {
      p_token_hash: ctx.tokenHash, p_role: body.role,
    });
    if (error) return accountRpcError(error.message);

    let farmer: any = null;
    let profile: any = null;
    if (body.role === "FARMER") {
      const { data: f } = await admin.from("farmers").select("*").eq("id", ctx.account.id).maybeSingle();
      farmer = f ? sanitizeFarmer(f) : null;
      const { data: p } = await admin.from("user_profiles")
        .select("*").eq("farmer_id", ctx.account.id).maybeSingle();
      profile = p ?? null;
    }
    return json({ account: await accountSummary(ctx.account.id, body.role), farmer, profile });
  }

  if (action === "addRole") {
    if (!isRoleCode(body?.role)) return json({ error: "invalid_role" }, 400);
    const limited = await rateLimited(ctx.account.id, "addRole", ROLE_ADD_LIMIT);
    if (limited) return limited;

    const { data, error } = await admin.rpc("account_add_role_self", {
      p_account_id: ctx.account.id, p_role: body.role,
    });
    if (error) return accountRpcError(error.message);
    return json({
      account: await accountSummary(ctx.account.id, await liveSessionRole(ctx)),
      roleStatus: data ?? null,
    });
  }

  // updateAccount
  const patch: Record<string, unknown> = {};
  if (body?.displayName !== undefined) {
    const name = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (name.length < 1 || name.length > 80) return json({ error: "invalid_display_name" }, 400);
    patch.display_name = name;
  }
  if (body?.languageCode !== undefined) {
    if (typeof body.languageCode !== "string" || !/^[a-z]{2,3}$/.test(body.languageCode)) {
      return json({ error: "invalid_language" }, 400);
    }
    patch.language_code = body.languageCode;
  }
  if (Object.keys(patch).length === 0) return json({ error: "invalid_request" }, 400);
  const limited = await rateLimited(ctx.account.id, "updateAccount", ACCOUNT_UPDATE_LIMIT);
  if (limited) return limited;

  const { error } = await admin.from("accounts").update(patch).eq("id", ctx.account.id);
  if (error) return json({ error: "server_error" }, 500);
  return json({ account: await accountSummary(ctx.account.id, await liveSessionRole(ctx)) });
}

/** verifyPin for a person without a farmers row (credential on accounts). */
async function accountVerifyPin(account: any, req: Request, body: any): Promise<Response> {
  // Same uniform reply as the farmer path: nothing tells an unknown number, a
  // suspended account and a wrong PIN apart.
  if (account.status !== "ACTIVE" || !account.pin_hash) return json({ error: "invalid_credentials" }, 401);

  const remaining = lockoutRemainingMs(account);
  if (remaining > 0) {
    return json({ error: "locked_out", retryAfterSeconds: Math.ceil(remaining / 1000) }, 429);
  }

  const ok = (await hashPin(body.pin)) === account.pin_hash;
  if (!ok) {
    await admin.from("accounts").update({
      failed_login_attempts: Number(account.failed_login_attempts ?? 0) + 1,
      last_failed_login: new Date().toISOString(),
    }).eq("id", account.id);
    return json({ error: "invalid_credentials" }, 401);
  }

  await admin.from("accounts").update({
    failed_login_attempts: 0,
    last_login_at: new Date().toISOString(),
  }).eq("id", account.id);

  return (await accountAuthReply(account, req, body?.role)) ?? json({ error: "invalid_credentials" }, 401);
}

/** changePin for a person without a farmers row. No first-time PIN branch. */
async function accountChangePin(account: any, req: Request, body: any): Promise<Response> {
  if (account.status !== "ACTIVE" || !account.pin_hash) return json({ error: "invalid_credentials" }, 401);

  let authorized = false;
  if (isValidPin(body?.currentPin)) {
    const remaining = lockoutRemainingMs(account);
    if (remaining > 0) {
      return json({ error: "locked_out", retryAfterSeconds: Math.ceil(remaining / 1000) }, 429);
    }
    authorized = (await hashPin(body.currentPin)) === account.pin_hash;
    if (!authorized) {
      await admin.from("accounts").update({
        failed_login_attempts: Number(account.failed_login_attempts ?? 0) + 1,
        last_failed_login: new Date().toISOString(),
      }).eq("id", account.id);
    }
  }

  if (!authorized) {
    const ctx = await sessionAccount(req, body);
    authorized = !!ctx && ctx.sess.user_id === account.id;
  }

  if (!authorized) return json({ error: "invalid_credentials" }, 401);

  const { error } = await admin.from("accounts").update({
    pin_hash: await hashPin(body.newPin),
    pin_updated_at: new Date().toISOString(),
    failed_login_attempts: 0,
  }).eq("id", account.id);
  if (error) return json({ error: "server_error" }, 500);

  // Any existing session is invalidated on credential change. chooseRole("AUTO")
  // still reads the role of the last one, so the person returns to the same workspace.
  await admin.from("user_sessions").update({ is_active: false }).eq("user_id", account.id);

  return (await accountAuthReply(account, req, body?.role ?? "AUTO")) ?? json({ error: "invalid_credentials" }, 401);
}

/** requestPinReset for a person without a farmers row. Same limits as farmers. */
async function accountRequestPinReset(account: any, mobile: string): Promise<Response> {
  if (account.status !== "ACTIVE") return json({ sent: true });

  const { data: recent } = await admin.from("pin_reset_codes")
    .select("created_at")
    .eq("account_id", account.id)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
    .order("created_at", { ascending: false });

  if ((recent?.length ?? 0) >= RESET_MAX_PER_HOUR) {
    return json({ error: "rate_limited", retryAfterSeconds: 3600 }, 429);
  }
  const lastAt = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
  const sinceLast = Date.now() - lastAt;
  if (lastAt && sinceLast < RESET_MIN_INTERVAL_MS) {
    return json({
      error: "rate_limited",
      retryAfterSeconds: Math.ceil((RESET_MIN_INTERVAL_MS - sinceLast) / 1000),
    }, 429);
  }

  if (!smsConfigured()) {
    return json({ error: "sms_not_configured" }, 503);
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)
    .padStart(6, "0");

  await admin.from("pin_reset_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("account_id", account.id)
    .is("consumed_at", null);

  const { error: insErr } = await admin.from("pin_reset_codes").insert({
    account_id: account.id,
    tenant_id: account.tenant_id,
    mobile_number: mobile,
    code_hash: await sha256Hex(code + PIN_SALT),
    expires_at: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString(),
  });
  if (insErr) return json({ error: "server_error" }, 500);

  const delivered = await sendOtpSms(mobile, code);
  if (!delivered) return json({ error: "sms_send_failed" }, 502);

  return json({ sent: true, expiresInSeconds: RESET_CODE_TTL_MS / 1000 });
}

/** verifyPinReset for a person without a farmers row. */
async function accountVerifyPinReset(account: any, req: Request, body: any, code: string): Promise<Response> {
  if (account.status !== "ACTIVE") return json({ error: "invalid_reset_code" }, 401);

  const { data: row } = await admin.from("pin_reset_codes")
    .select("*")
    .eq("account_id", account.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return json({ error: "invalid_reset_code" }, 401);
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return json({ error: "reset_code_expired" }, 401);
  }
  if (Number(row.attempts ?? 0) >= RESET_MAX_ATTEMPTS) {
    return json({ error: "reset_code_expired" }, 401);
  }

  const matches = (await sha256Hex(code + PIN_SALT)) === row.code_hash;
  if (!matches) {
    await admin.from("pin_reset_codes")
      .update({ attempts: Number(row.attempts ?? 0) + 1 })
      .eq("id", row.id);
    return json({ error: "invalid_reset_code" }, 401);
  }

  await admin.from("pin_reset_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  const { error: updErr } = await admin.from("accounts").update({
    pin_hash: await hashPin(body.newPin),
    pin_updated_at: new Date().toISOString(),
    failed_login_attempts: 0,
  }).eq("id", account.id);
  if (updErr) return json({ error: "server_error" }, 500);

  await admin.from("user_sessions").update({ is_active: false }).eq("user_id", account.id);

  return (await accountAuthReply(account, req, body?.role ?? "AUTO")) ?? json({ error: "invalid_reset_code" }, 401);
}

export async function handleFarmerAuth(req: Request, body: any): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const action = String(body?.action ?? "");
    const mobile = body?.mobile;
    const tenantId = isUuid(body?.tenantId) ? body.tenantId : null;

    if (action === "logout") {
      const token = String(body?.sessionToken ?? "");
      if (token) {
        await admin.from("user_sessions")
          .update({ is_active: false })
          .eq("access_token_hash", await sha256Hex(token));
      }
      return json({ ok: true });
    }

    // Actions that identify the caller by the session token, not by a mobile number.
    const sessionReply = await handleSessionAction(action, req, body);
    if (sessionReply) return sessionReply;

    if (!isValidMobile(mobile)) {
      return json({ error: "invalid_mobile" }, 400);
    }

    // ---------------------------------------------------------------- lookup
    if (action === "lookup") {
      const farmer = await findFarmer(mobile, tenantId);
      // `multiRole` is the feature flag for this tenant: the client cannot read
      // feature_flags, and it says nothing about the number being looked up.
      const multiRole = await multiRoleEnabled(tenantId);
      // A person without a farmers row answers exactly like a farmer with a PIN:
      // lookup never says which roles a number holds.
      const account = !farmer && multiRole ? await findAccountOnly(mobile, tenantId) : null;
      // Deliberately minimal: no farmer id, no tenant id, no profile data.
      return json({
        exists: !!farmer || !!account,
        requiresPinSetup: !!farmer && !farmer.pin_hash,
        multiRole,
      });
    }

    // -------------------------------------------------------------- register
    if (action === "register") {
      if (!isValidPin(body?.pin)) return json({ error: "invalid_pin" }, 400);
      if (!tenantId) return json({ error: "tenant_required" }, 400);

      // `roles` absent = a farmer registration, exactly as before multi-role.
      let roles: RoleCode[] = ["FARMER"];
      if (body?.roles !== undefined) {
        const asked: unknown[] = Array.isArray(body.roles) ? body.roles : [];
        if (asked.length === 0 || !asked.every(isRoleCode) || new Set(asked).size !== asked.length) {
          return json({ error: "invalid_role" }, 400);
        }
        roles = ROLE_CODES.filter((r) => asked.includes(r));
      }
      const extraRoles = roles.filter((r) => r !== "FARMER");
      if (extraRoles.length > 0) {
        if (!(await multiRoleEnabled(tenantId))) return json({ error: "feature_disabled" }, 403);
        const limited = await rateLimited(`${tenantId}:${mobile}`, "registerRoles", ROLE_REGISTER_LIMIT);
        if (limited) return limited;
      }

      const existing = await findFarmer(mobile, tenantId);
      if (existing && existing.pin_hash) {
        return json({ error: "already_registered" }, 409);
      }

      const pinHash = await hashPin(body.pin);
      const language = typeof body?.language === "string" ? body.language : "hi";

      // The number already belongs to a person without a farmers row: they sign
      // in and add the Farmer role from the Roles page. Creating a second
      // identity for the same number here is never right.
      const accountOnly = existing ? null : await findAccountOnly(mobile, tenantId);
      if (accountOnly) return json({ error: "already_registered" }, 409);

      // Service Provider and/or Customer without Farmer: no farmers row and no
      // user_profiles row. The credential lives on the account.
      if (!roles.includes("FARMER")) {
        if (existing) return json({ error: "already_registered" }, 409);
        const { data: accountId, error: regErr } = await admin.rpc("account_register_self", {
          p_tenant_id: tenantId,
          p_mobile: mobile,
          p_pin_hash: pinHash,
          p_roles: roles,
          p_language: language,
          p_display_name: typeof body?.displayName === "string" ? body.displayName : null,
        });
        if (regErr || !accountId) return accountRpcError(regErr?.message);
        const reply = await accountAuthReply({ id: accountId }, req, body?.role);
        return reply ?? json({ error: "registration_failed" }, 500);
      }

      let farmer = existing;
      if (farmer) {
        const { data, error } = await admin.from("farmers")
          .update({ pin_hash: pinHash, pin_updated_at: new Date().toISOString(), is_active: true })
          .eq("id", farmer.id)
          .select("*")
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        farmer = data;
      } else {
        const { data, error } = await admin.from("farmers")
          .insert({
            mobile_number: mobile,
            tenant_id: tenantId,
            pin_hash: pinHash,
            pin_updated_at: new Date().toISOString(),
            language_preference: language,
            is_active: true,
            app_install_date: new Date().toISOString(),
            total_app_opens: 0,
            login_attempts: 0,
            failed_login_attempts: 0,
          })
          .select("*")
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        farmer = data;
      }

      if (!farmer) return json({ error: "registration_failed" }, 500);

      // Ensure a profile row exists (previously done client-side).
      await admin.from("user_profiles").upsert({
        id: farmer.id,
        farmer_id: farmer.id,
        tenant_id: tenantId,
        mobile_number: mobile,
        preferred_language: language,
        is_profile_complete: false,
      }, { onConflict: "id" });

      // Farmer plus other roles: the farmer exists now (its account and FARMER
      // membership came from the database trigger); add the rest to that account.
      for (const role of extraRoles) {
        const { error: addErr } = await admin.rpc("account_add_role_self", {
          p_account_id: farmer.id, p_role: role,
        });
        if (addErr) return accountRpcError(addErr.message);
      }

      return await farmerAuthReply(farmer, null, req, body?.role);
    }

    // ------------------------------------------------------------- verifyPin
    if (action === "verifyPin") {
      if (!isValidPin(body?.pin)) return json({ error: "invalid_pin" }, 400);

      const farmer = await findFarmer(mobile, tenantId);
      if (!farmer && await multiRoleEnabled(tenantId)) {
        const account = await findAccountOnly(mobile, tenantId);
        if (account) return await accountVerifyPin(account, req, body);
      }
      // Uniform response for unknown account vs wrong PIN (no enumeration).
      if (!farmer || !farmer.pin_hash) return json({ error: "invalid_credentials" }, 401);

      const remaining = lockoutRemainingMs(farmer);
      if (remaining > 0) {
        return json({ error: "locked_out", retryAfterSeconds: Math.ceil(remaining / 1000) }, 429);
      }

      const ok = (await hashPin(body.pin)) === farmer.pin_hash;
      if (!ok) {
        await admin.from("farmers").update({
          failed_login_attempts: Number(farmer.failed_login_attempts ?? 0) + 1,
          last_failed_login: new Date().toISOString(),
        }).eq("id", farmer.id);
        return json({ error: "invalid_credentials" }, 401);
      }

      await admin.from("farmers").update({
        failed_login_attempts: 0,
        last_login_at: new Date().toISOString(),
        last_app_open: new Date().toISOString(),
        total_app_opens: Number(farmer.total_app_opens ?? 0) + 1,
      }).eq("id", farmer.id);

      const { data: profile } = await admin.from("user_profiles")
        .select("*").eq("farmer_id", farmer.id).maybeSingle();

      return await farmerAuthReply(farmer, profile, req, body?.role);
    }

    // ------------------------------------------------------------- changePin
    if (action === "changePin") {
      if (!isValidPin(body?.newPin)) return json({ error: "invalid_pin" }, 400);

      const farmer = await findFarmer(mobile, tenantId);
      if (!farmer && await multiRoleEnabled(tenantId)) {
        const account = await findAccountOnly(mobile, tenantId);
        if (account) return await accountChangePin(account, req, body);
      }
      if (!farmer) return json({ error: "invalid_credentials" }, 401);

      // A PIN can only be replaced by proving the current PIN, or by proving a
      // live verified session for this exact farmer. There is no unauthenticated
      // reset path — that is precisely the hole this function closes.
      let authorized = false;

      if (farmer.pin_hash && isValidPin(body?.currentPin)) {
        const remaining = lockoutRemainingMs(farmer);
        if (remaining > 0) {
          return json({ error: "locked_out", retryAfterSeconds: Math.ceil(remaining / 1000) }, 429);
        }
        authorized = (await hashPin(body.currentPin)) === farmer.pin_hash;
        if (!authorized) {
          await admin.from("farmers").update({
            failed_login_attempts: Number(farmer.failed_login_attempts ?? 0) + 1,
            last_failed_login: new Date().toISOString(),
          }).eq("id", farmer.id);
        }
      }

      if (!authorized) {
        const token = req.headers.get("x-session-token") ?? body?.sessionToken;
        if (typeof token === "string" && token.length > 0) {
          const { data: sess } = await admin.from("user_sessions")
            .select("user_id, is_active, expires_at")
            .eq("access_token_hash", await sha256Hex(token))
            .eq("is_active", true)
            .maybeSingle();
          authorized = !!sess && sess.user_id === farmer.id &&
            new Date(sess.expires_at).getTime() > Date.now();
        }
      }

      // First-time PIN setup for a farmer row that has no PIN yet.
      if (!authorized && !farmer.pin_hash) authorized = true;

      if (!authorized) return json({ error: "invalid_credentials" }, 401);

      const { error } = await admin.from("farmers").update({
        pin_hash: await hashPin(body.newPin),
        pin_updated_at: new Date().toISOString(),
        failed_login_attempts: 0,
      }).eq("id", farmer.id);
      if (error) return json({ error: error.message }, 400);

      // Any existing session is invalidated on credential change.
      await admin.from("user_sessions")
        .update({ is_active: false }).eq("user_id", farmer.id);

      const { data: profile } = await admin.from("user_profiles")
        .select("*").eq("farmer_id", farmer.id).maybeSingle();

      return await farmerAuthReply(farmer, profile, req, body?.role);
    }

    // -------------------------------------------------------- requestPinReset
    // Sends a one-time code by SMS. This is the ONLY account-recovery path for
    // a farmer who forgot their PIN. The code itself is never stored.
    if (action === "requestPinReset") {
      const farmer = await findFarmer(mobile, tenantId);
      if (!farmer && await multiRoleEnabled(tenantId)) {
        const account = await findAccountOnly(mobile, tenantId);
        if (account) return await accountRequestPinReset(account, mobile);
      }
      // Uniform response — never reveal whether the mobile is registered.
      if (!farmer) return json({ sent: true });

      // Rate limit: max 3 per hour, min 60s between sends.
      const { data: recent } = await admin.from("pin_reset_codes")
        .select("created_at")
        .eq("farmer_id", farmer.id)
        .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
        .order("created_at", { ascending: false });

      if ((recent?.length ?? 0) >= RESET_MAX_PER_HOUR) {
        return json({ error: "rate_limited", retryAfterSeconds: 3600 }, 429);
      }
      const lastAt = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
      const sinceLast = Date.now() - lastAt;
      if (lastAt && sinceLast < RESET_MIN_INTERVAL_MS) {
        return json({
          error: "rate_limited",
          retryAfterSeconds: Math.ceil((RESET_MIN_INTERVAL_MS - sinceLast) / 1000),
        }, 429);
      }

      if (!smsConfigured()) {
        return json({ error: "sms_not_configured" }, 503);
      }

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000)
        .padStart(6, "0");

      // Invalidate any previous unconsumed codes.
      await admin.from("pin_reset_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("farmer_id", farmer.id)
        .is("consumed_at", null);

      const { error: insErr } = await admin.from("pin_reset_codes").insert({
        farmer_id: farmer.id,
        tenant_id: farmer.tenant_id ?? tenantId,
        mobile_number: mobile,
        code_hash: await sha256Hex(code + PIN_SALT),
        expires_at: new Date(Date.now() + RESET_CODE_TTL_MS).toISOString(),
      });
      if (insErr) return json({ error: "server_error" }, 500);

      const delivered = await sendOtpSms(mobile, code);
      if (!delivered) return json({ error: "sms_send_failed" }, 502);

      return json({ sent: true, expiresInSeconds: RESET_CODE_TTL_MS / 1000 });
    }

    // --------------------------------------------------------- verifyPinReset
    if (action === "verifyPinReset") {
      if (!isValidPin(body?.newPin)) return json({ error: "invalid_pin" }, 400);
      const code = String(body?.code ?? "");
      if (!/^\d{6}$/.test(code)) return json({ error: "invalid_reset_code" }, 400);

      const farmer = await findFarmer(mobile, tenantId);
      if (!farmer && await multiRoleEnabled(tenantId)) {
        const account = await findAccountOnly(mobile, tenantId);
        if (account) return await accountVerifyPinReset(account, req, body, code);
      }
      if (!farmer) return json({ error: "invalid_reset_code" }, 401);

      const { data: row } = await admin.from("pin_reset_codes")
        .select("*")
        .eq("farmer_id", farmer.id)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json({ error: "invalid_reset_code" }, 401);
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        return json({ error: "reset_code_expired" }, 401);
      }
      if (Number(row.attempts ?? 0) >= RESET_MAX_ATTEMPTS) {
        return json({ error: "reset_code_expired" }, 401);
      }

      const matches = (await sha256Hex(code + PIN_SALT)) === row.code_hash;
      if (!matches) {
        await admin.from("pin_reset_codes")
          .update({ attempts: Number(row.attempts ?? 0) + 1 })
          .eq("id", row.id);
        return json({ error: "invalid_reset_code" }, 401);
      }

      await admin.from("pin_reset_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);

      const { error: updErr } = await admin.from("farmers").update({
        pin_hash: await hashPin(body.newPin),
        pin_updated_at: new Date().toISOString(),
        failed_login_attempts: 0,
      }).eq("id", farmer.id);
      if (updErr) return json({ error: "server_error" }, 500);

      // Credential change invalidates every existing session.
      await admin.from("user_sessions")
        .update({ is_active: false }).eq("user_id", farmer.id);

      const { data: profile } = await admin.from("user_profiles")
        .select("*").eq("farmer_id", farmer.id).maybeSingle();

      return await farmerAuthReply(farmer, profile, req, body?.role);
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[farmer-auth] error", err);
    return json({ error: "server_error" }, 500);
  }
}

/** True when a POST body targets the farmer-auth action router. */
export function isFarmerAuthAction(body: any): boolean {
  return typeof body?.action === "string" &&
    [
      "lookup",
      "register",
      "verifyPin",
      "changePin",
      "logout",
      "requestPinReset",
      "verifyPinReset",
      "sessionInfo",
      "switchRole",
      "addRole",
      "updateAccount",
    ].includes(body.action);
}
