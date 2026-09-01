/**
 * farmer-auth — server-authoritative farmer authentication
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
 * No endpoint ever returns pin_hash. Identity (farmer_id / tenant_id) is only
 * ever derived here, server-side, and handed back with an opaque session token
 * whose SHA-256 hash is persisted in public.user_sessions.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Must match the historical client-side hash so existing PINs keep working.
const PIN_SALT = "kisan_shakti_2024";
const SESSION_TTL_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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
async function createSession(farmerId: string, req: Request) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
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

    if (!isValidMobile(mobile)) {
      return json({ error: "invalid_mobile" }, 400);
    }

    // ---------------------------------------------------------------- lookup
    if (action === "lookup") {
      const farmer = await findFarmer(mobile, tenantId);
      // Deliberately minimal: no farmer id, no tenant id, no profile data.
      return json({
        exists: !!farmer,
        requiresPinSetup: !!farmer && !farmer.pin_hash,
      });
    }

    // -------------------------------------------------------------- register
    if (action === "register") {
      if (!isValidPin(body?.pin)) return json({ error: "invalid_pin" }, 400);
      if (!tenantId) return json({ error: "tenant_required" }, 400);

      const existing = await findFarmer(mobile, tenantId);
      if (existing && existing.pin_hash) {
        return json({ error: "already_registered" }, 409);
      }

      const pinHash = await hashPin(body.pin);
      const language = typeof body?.language === "string" ? body.language : "hi";

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

      const session = await createSession(farmer.id, req);
      return json({
        session: { token: session.token, expiresAt: session.expiresAt },
        farmer: sanitizeFarmer(farmer),
        profile: null,
      });
    }

    // ------------------------------------------------------------- verifyPin
    if (action === "verifyPin") {
      if (!isValidPin(body?.pin)) return json({ error: "invalid_pin" }, 400);

      const farmer = await findFarmer(mobile, tenantId);
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

      const session = await createSession(farmer.id, req);
      return json({
        session: { token: session.token, expiresAt: session.expiresAt },
        farmer: sanitizeFarmer(farmer),
        profile: profile ?? null,
      });
    }

    // ------------------------------------------------------------- changePin
    if (action === "changePin") {
      if (!isValidPin(body?.newPin)) return json({ error: "invalid_pin" }, 400);

      const farmer = await findFarmer(mobile, tenantId);
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

      const session = await createSession(farmer.id, req);
      return json({
        session: { token: session.token, expiresAt: session.expiresAt },
        farmer: sanitizeFarmer(farmer),
        profile: profile ?? null,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[farmer-auth] error", err);
    return json({ error: "server_error" }, 500);
  }
});
