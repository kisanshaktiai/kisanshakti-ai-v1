// Tenant Access Guard — Phase 5 (Pilot)

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
  // Skip the jwt.sub === x-farmer-id check.
  allowFarmerImpersonation?: boolean;
}

// Detect whether the Authorization header is the project's SERVICE_ROLE key.
function isServiceRoleRequest(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey || !token) return false;
  return token.length === serviceKey.length && token === serviceKey;
}

// Detect whether the Authorization header is the project's ANON key.
function isAnonKeyRequest(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice('Bearer '.length).trim();
  if (!token) return false;

  // Fast-path: env equality
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (anonKey && token === anonKey) return true;

  // Decode JWT payload (no signature check — only used to classify the token)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    // Anon/publishable keys have role=anon and no sub claim
    return payload?.role === 'anon' && !payload?.sub;
  } catch {
    return false;
  }
}

// Main guard entry point. Call at the top of any Class A handler.
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
  const isAnonKey = !isServiceRole && isAnonKeyRequest(req);

  // ── Step 1: JWT validation ─────────────────────────────────────────────
  let jwtUserId: string | null = null;
  if (!isServiceRole && !isAnonKey) {
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
  } else if (isServiceRole) {
    console.log('🔑 [TenantAccessGuard] Service-role request — JWT/spoof checks bypassed');
  } else {
    console.log('🔓 [TenantAccessGuard] Anon-key request — relying on custom-auth headers (x-farmer-id / x-tenant-id)');
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
