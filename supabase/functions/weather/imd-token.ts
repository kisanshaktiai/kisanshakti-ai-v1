import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const PROVIDER = "IMD";
const DEFAULT_TOKEN_URL = "https://api.imd.gov.in/api/oauth/token.php";

type LogFn = (level: string, event: string, data?: Record<string, unknown>) => void;

function env(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const v = Number(Deno.env.get(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

let inFlight: Promise<string | null> | null = null;

export interface ImdCredentials {
  apiKey: string;
  email: string;
  password: string;
}

export function getImdCredentials(log: LogFn): ImdCredentials | null {
  const apiKey = env("IMD_API_KEY");
  const email = env("IMD_EMAIL");
  const password = env("IMD_PASSWORD");

  const missing: string[] = [];
  if (!apiKey) missing.push("IMD_API_KEY");
  if (!email) missing.push("IMD_EMAIL");
  if (!password) missing.push("IMD_PASSWORD");

  if (missing.length) {
    log("warn", "imd_credentials_missing", {
      missing,
      hint: "IMD requires X-API-KEY plus a JWT obtained with email+password. All three secrets are mandatory.",
    });
    return null;
  }
  return { apiKey, email, password };
}

function extractToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  for (const f of ["access_token", "accessToken", "token", "jwt"]) {
    const v = obj[f];
    if (typeof v === "string" && v.length > 20) return v;
  }
  const nested = obj.data;
  if (nested && typeof nested === "object") return extractToken(nested);
  return null;
}

/**
 * Extract the expiry claim from IMD's token.
 *
 * IMD does NOT issue a standard 3-segment JWT. Its format is:
 *     base64url(payload) "." hex_hmac_signature
 * e.g. eyJ1aWQiOjY3LCJleHAiOjE3ODYwMjMxMDd9.a93b3b...  (2 segments, 101 chars)
 * where segment[0] decodes to {"uid":67,"exp":1786023107}.
 *
 * A standard JWT (header.payload.signature) carries claims in segment[1].
 * We therefore try every segment and use the first that decodes to JSON
 * containing a usable `exp`. This handles IMD's 2-segment format today and a
 * standard 3-segment JWT if IMD ever migrates, without further code changes.
 *
 * The token's own `exp` is authoritative — it is what the server enforces —
 * so it is preferred over the advertised `expires_in`.
 */
function expiryFromJwtClaim(token: string): Date | null {
  const segments = token.split(".");
  if (segments.length < 2) return null;

  for (const seg of segments) {
    // A hex signature contains no base64url payload; skip cheaply.
    if (!seg || /^[0-9a-f]{32,}$/i.test(seg)) continue;
    try {
      const b64 = seg.replace(/-/g, "+").replace(/_/g, "/")
        .padEnd(Math.ceil(seg.length / 4) * 4, "=");
      const decoded = atob(b64);
      if (!decoded.trimStart().startsWith("{")) continue;

      const claims = JSON.parse(decoded) as Record<string, unknown>;
      const exp = Number(claims.exp);
      if (!Number.isFinite(exp) || exp <= 0) continue;

      // exp is seconds since epoch; guard against milliseconds.
      const d = new Date(exp > 1e11 ? exp : exp * 1000);
      if (isNaN(d.getTime())) continue;

      // Reject an already-expired or absurdly distant claim rather than
      // trusting it blindly.
      const ms = d.getTime() - Date.now();
      if (ms <= 0 || ms > 30 * 24 * 3600_000) continue;

      return d;
    } catch {
      continue;
    }
  }
  return null;
}

function expiryFromBody(payload: unknown): Date | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const raw = obj.expires_in ?? obj.expiresIn ?? obj.expires ?? obj.expiry;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    return n < 1e7
      ? new Date(Date.now() + n * 1000)
      : new Date(n > 1e11 ? n : n * 1000);
  }
  return null;
}

async function login(
  creds: ImdCredentials,
  log: LogFn,
): Promise<{ token: string; expiresAt: Date; tokenType: string } | null> {
  const url = env("IMD_TOKEN_URL", DEFAULT_TOKEN_URL);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "X-API-KEY": creds.apiKey,
      },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
      signal: ctrl.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      log("error", "imd_login_failed", {
        status: res.status,
        body: text.slice(0, 200),
        latency_ms: Date.now() - started,
        hint: res.status === 401 || res.status === 403
          ? "Check IMD_EMAIL/IMD_PASSWORD, and whether the X-API-KEY IP binding permits this server."
          : undefined,
      });
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      log("error", "imd_login_unparseable", { body_prefix: text.slice(0, 120) });
      return null;
    }

    const token = extractToken(payload);
    if (!token) {
      log("error", "imd_login_no_token_field", {
        top_level_keys: Object.keys(payload as object),
        hint: "Expected access_token per the IMD docs.",
      });
      return null;
    }

    const jwtExp = expiryFromJwtClaim(token);
    const bodyExp = expiryFromBody(payload);
    const expiresAt = jwtExp ?? bodyExp
      ?? new Date(Date.now() + envInt("IMD_TOKEN_TTL_SECONDS", 3600) * 1000);

    log("info", "imd_login_ok", {
      latency_ms: Date.now() - started,
      expires_at: expiresAt.toISOString(),
      lifetime_min: Math.round((expiresAt.getTime() - Date.now()) / 60000),
      expiry_source: jwtExp ? "jwt_exp_claim" : bodyExp ? "expires_in" : "configured_ttl",
      token_length: token.length,
    });

    return {
      token,
      expiresAt,
      tokenType: (payload as Record<string, unknown>).token_type as string ?? "Bearer",
    };
  } catch (e) {
    log("error", "imd_login_exception", {
      error_message: (e as Error).message,
      latency_ms: Date.now() - started,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getImdToken(
  supabase: SupabaseClient,
  creds: ImdCredentials,
  log: LogFn,
  forceRefresh = false,
): Promise<string | null> {
  const safety = envInt("IMD_TOKEN_SAFETY_SECONDS", 300) * 1000;

  if (!forceRefresh) {
    try {
      const { data } = await supabase
        .from("weather_provider_token")
        .select("token, expires_at")
        .eq("provider", PROVIDER)
        .maybeSingle();

      if (data?.token && new Date(data.expires_at).getTime() - safety > Date.now()) {
        log("info", "imd_token_cache_hit", {
          minutes_remaining: Math.round(
            (new Date(data.expires_at).getTime() - Date.now()) / 60000,
          ),
        });
        return data.token as string;
      }
    } catch (e) {
      log("warn", "imd_token_cache_read_failed", { error_message: String(e) });
    }
  }

  if (inFlight) {
    log("info", "imd_token_awaiting_inflight_login", {});
    return await inFlight;
  }

  inFlight = (async () => {
    const result = await login(creds, log);

    if (!result) {
      try {
        await supabase.from("weather_provider_token").upsert({
          provider: PROVIDER,
          token: "",
          expires_at: new Date(Date.now() - 1000).toISOString(),
          last_error: "login failed - see function logs",
          last_error_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "provider" });
      } catch { /* telemetry must not mask the real failure */ }
      return null;
    }

    try {
      const { data: prev } = await supabase
        .from("weather_provider_token")
        .select("refresh_count")
        .eq("provider", PROVIDER)
        .maybeSingle();

      await supabase.from("weather_provider_token").upsert({
        provider: PROVIDER,
        token: result.token,
        token_type: result.tokenType,
        expires_at: result.expiresAt.toISOString(),
        obtained_at: new Date().toISOString(),
        refresh_count: ((prev?.refresh_count as number) ?? 0) + 1,
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider" });
    } catch (e) {
      log("warn", "imd_token_cache_write_failed", { error_message: String(e) });
    }

    return result.token;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export async function invalidateImdToken(
  supabase: SupabaseClient,
  log: LogFn,
): Promise<void> {
  inFlight = null;
  try {
    await supabase
      .from("weather_provider_token")
      .update({
        expires_at: new Date(Date.now() - 1000).toISOString(),
        last_error: "invalidated after 401/403 on a data call",
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("provider", PROVIDER);
    log("warn", "imd_token_invalidated", {});
  } catch (e) {
    log("warn", "imd_token_invalidate_failed", { error_message: String(e) });
  }
}

export function imdAuthHeaders(apiKey: string, token: string): Record<string, string> {
  return {
    "X-API-KEY": apiKey,
    Authorization: `Bearer ${token}`,
  };
}
