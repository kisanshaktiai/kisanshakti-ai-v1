/**
 * Tenant Access Guard — Phase 5 (Pilot)
 *
 * Single canonical entry-guard for authenticated, farmer-scoped edge functions.
 * Composes the existing helpers into one call so business logic stays clean.
 *
 * What it enforces, in order:
 *   1. JWT is present, well-formed, unexpired (validateJWT → getUser).
 *   2. x-tenant-id / x-farmer-id headers are present and valid UUIDs.
 *   3. The farmer row exists AND farmer.tenant_id === x-tenant-id.
 *   4. jwt.sub === x-farmer-id  (anti-spoof: a logged-in farmer cannot
 *      impersonate another farmer in the same tenant).
 *      Bypass: when the request is signed with the SERVICE_ROLE key
 *      (used by cron jobs and admin tooling), step 4 is skipped.
 *
 * Returns either:
 *   - GuardedContext  → safe to proceed
 *   - Response        → already-formed 401/403 ready to return
 *
 * Usage:
 *   const guard = await guardTenantAccess(req);
 *   if (guard instanceof Response) return guard;
 *   const { tenantId, farmerId, userId, supabase } = guard;
 *
 * Class C (public/config) functions MUST NOT use this guard.
 * Class D (webhooks) should use signature validation instead.
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { validateJWT } from './jwtValidator.ts';
import {
  validateAuthHeaders,
  validateTenantFarmerAssociation,
} from './authMiddleware.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-client-domain, if-none-match, origin, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

export interface GuardedContext {
  /** Authenticated user id from JWT (sub). Equals farmerId for normal users. */
  userId: string | null;
  /** Tenant id from x-tenant-id header (UUID). */
  tenantId: string;
  /** Farmer id from x-farmer-id header (UUID). */
  farmerId: string;
  /** Optional session token from x-session-token header. */
  sessionToken: string | null;
  /** True if the caller used SERVICE_ROLE_KEY (cron/admin); JWT and spoof checks were bypassed. */
  isServiceRole: boolean;
  /** Service-role Supabase client, ready for RLS-bypassing queries inside the function. */
  supabase: SupabaseClient;
}

export interface GuardOptions {
  /** Allow x-farmer-id to be missing (background jobs only). Default: false. */
  allowMissingFarmerId?: boolean;
  /**
   * Skip the jwt.sub === x-farmer-id check.
   * Service-role callers always skip it; this option lets you skip it for
   * specific admin routes that legitimately impersonate farmers.
   * Default: false.
   */
  allowFarmerImpersonation?: boolean;
}

/**
 * Detect whether the Authorization header is the project's SERVICE_ROLE key.
 * Compared in constant-ish time by length + equality.
 */
function isServiceRoleRequest(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || !token) return false;
  return token.length === serviceKey.length && token === serviceKey;
}

/**
 * Detect whether the Authorization header is the project's ANON key.
 * The farmer app uses custom auth (x-farmer-id / x-tenant-id headers); when
 * no real Supabase session JWT exists the client falls back to the anon key
 * as Bearer. In that case we skip JWT/spoof checks and rely on header
 * validation + farmer↔tenant association lookup for authorization.
 */
function isAnonKeyRequest(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey || !token) return false;
  return token.length === anonKey.length && token === anonKey;
}

/**
 * Main guard entry point. Call at the top of any Class A handler.
 */
export async function guardTenantAccess(
  req: Request,
  options: GuardOptions = {},
): Promise<GuardedContext | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ [TenantAccessGuard] Missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return new Response(
      JSON.stringify({
        error: 'Server configuration error',
        code: 'SERVER_CONFIG_ERROR',
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: corsHeaders },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const isServiceRole = isServiceRoleRequest(req);

  // ── Step 1: JWT validation (skipped for service-role callers) ──────────
  let jwtUserId: string | null = null;
  if (!isServiceRole) {
    const jwtResult = await validateJWT(req);
    if (!jwtResult.valid) {
      console.warn('🚫 [TenantAccessGuard] JWT validation failed:', jwtResult.errorCode);
      return new Response(
        JSON.stringify({
          error: jwtResult.error || 'Authentication required',
          code: jwtResult.errorCode || 'INVALID_TOKEN',
          timestamp: new Date().toISOString(),
        }),
        {
          status: jwtResult.errorCode === 'NO_AUTH_HEADER' ? 401 : 403,
          headers: corsHeaders,
        },
      );
    }
    jwtUserId = jwtResult.userId ?? null;
  } else {
    console.log('🔑 [TenantAccessGuard] Service-role request — JWT/spoof checks bypassed');
  }

  // ── Step 2: Header validation (always required) ────────────────────────
  const headerResult = await validateAuthHeaders(req, {
    allowMissingFarmerId: options.allowMissingFarmerId ?? false,
  });
  if (headerResult instanceof Response) return headerResult;
  const { tenantId, farmerId, sessionToken } = headerResult;

  // ── Step 3: Farmer ↔ Tenant association ────────────────────────────────
  if (farmerId) {
    const assocResult = await validateTenantFarmerAssociation(supabase, tenantId, farmerId);
    if (assocResult instanceof Response) return assocResult;
  }

  // ── Step 4: Anti-spoof — jwt.sub must equal x-farmer-id ────────────────
  // Bypassed for service-role and when allowFarmerImpersonation is set.
  if (
    !isServiceRole &&
    !options.allowFarmerImpersonation &&
    jwtUserId &&
    farmerId &&
    jwtUserId !== farmerId
  ) {
    console.error('🚨 [TenantAccessGuard] Farmer spoof attempt:', {
      jwtSub: jwtUserId,
      headerFarmerId: farmerId,
      tenantId,
    });
    return new Response(
      JSON.stringify({
        error: 'Forbidden',
        details: 'Authenticated user does not match x-farmer-id header',
        code: 'FARMER_IDENTITY_MISMATCH',
        timestamp: new Date().toISOString(),
      }),
      { status: 403, headers: corsHeaders },
    );
  }

  return {
    userId: jwtUserId,
    tenantId,
    farmerId,
    sessionToken,
    isServiceRole,
    supabase,
  };
}

/** Re-export shared CORS for guarded handlers that don't define their own. */
export const guardCorsHeaders = corsHeaders;
