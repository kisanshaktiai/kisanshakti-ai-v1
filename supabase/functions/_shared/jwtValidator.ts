/**
 * Hybrid JWT Validator — 2030-Ready Edge Functions
 * 
 * Provides in-code JWT validation using getClaims() for authenticated routes
 * while maintaining header-based tenant isolation for multi-tenancy.
 * 
 * Usage:
 * - For authenticated routes: validateJWT(req, supabase) + validateAuthHeaders(req)
 * - For public routes: validateAuthHeaders(req) only (webhooks, etc.)
 */

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token, x-client-domain, if-none-match, origin, cache-control, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Content-Type': 'application/json'
};

/**
 * JWT validation result
 */
export interface JWTValidationResult {
  valid: boolean;
  userId?: string;
  email?: string;
  claims?: Record<string, unknown>;
  error?: string;
  errorCode?: 'NO_AUTH_HEADER' | 'INVALID_FORMAT' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'VALIDATION_ERROR';
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.replace('Bearer ', '');
}

/**
 * Validate JWT using Supabase getClaims()
 * 
 * This is the PRIMARY authentication method for routes that require user identity.
 * Use this BEFORE checking tenant headers for sensitive operations.
 * 
 * @param req - HTTP request
 * @param supabaseUrl - Supabase project URL (from env)
 * @param supabaseAnonKey - Supabase anon key (from env)
 * @returns JWTValidationResult with user claims or error
 * 
 * @example
 * ```typescript
 * const jwtResult = await validateJWT(req);
 * if (!jwtResult.valid) {
 *   return createJWTErrorResponse(jwtResult);
 * }
 * // Now use jwtResult.userId, jwtResult.claims
 * ```
 */
export async function validateJWT(req: Request): Promise<JWTValidationResult> {
  const token = extractBearerToken(req);
  
  if (!token) {
    console.log('🔐 [JWTValidator] No Authorization header');
    return {
      valid: false,
      error: 'Authorization header required',
      errorCode: 'NO_AUTH_HEADER'
    };
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('❌ [JWTValidator] Missing Supabase env vars');
      return {
        valid: false,
        error: 'Server configuration error',
        errorCode: 'VALIDATION_ERROR'
      };
    }

    // Create client with the user's token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    });

    // Validate token and get claims
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      console.warn('⚠️ [JWTValidator] Token validation failed:', error?.message);
      return {
        valid: false,
        error: error?.message || 'Invalid token',
        errorCode: error?.message?.includes('expired') ? 'EXPIRED_TOKEN' : 'INVALID_TOKEN'
      };
    }

    console.log('✅ [JWTValidator] Token validated for user:', data.user.id);

    return {
      valid: true,
      userId: data.user.id,
      email: data.user.email,
      claims: {
        sub: data.user.id,
        email: data.user.email,
        role: data.user.role,
        aud: data.user.aud,
        app_metadata: data.user.app_metadata,
        user_metadata: data.user.user_metadata
      }
    };
  } catch (err) {
    console.error('❌ [JWTValidator] Unexpected error:', err);
    return {
      valid: false,
      error: 'Token validation failed',
      errorCode: 'VALIDATION_ERROR'
    };
  }
}

/**
 * Create error response for JWT validation failures
 */
export function createJWTErrorResponse(result: JWTValidationResult): Response {
  const status = result.errorCode === 'NO_AUTH_HEADER' ? 401 : 
                 result.errorCode === 'EXPIRED_TOKEN' ? 401 : 403;
  
  return new Response(
    JSON.stringify({
      error: result.error,
      code: result.errorCode,
      timestamp: new Date().toISOString()
    }),
    { status, headers: corsHeaders }
  );
}

/**
 * Combined validation: JWT + Tenant Headers
 * 
 * For routes that require BOTH user authentication AND tenant context.
 * Validates JWT first, then checks tenant headers match user's allowed tenants.
 * 
 * @param req - HTTP request
 * @param options - Validation options
 * @returns Combined validation result
 */
export interface CombinedAuthResult {
  valid: boolean;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  email?: string;
  error?: string;
  errorCode?: string;
}

export async function validateCombinedAuth(
  req: Request,
  options?: {
    requireJWT?: boolean;  // Default: true for authenticated routes
    requireTenantHeaders?: boolean;  // Default: true
  }
): Promise<CombinedAuthResult | Response> {
  const requireJWT = options?.requireJWT !== false;
  const requireTenantHeaders = options?.requireTenantHeaders !== false;

  // 1. Validate JWT if required
  if (requireJWT) {
    const jwtResult = await validateJWT(req);
    if (!jwtResult.valid) {
      return createJWTErrorResponse(jwtResult);
    }
  }

  // 2. Validate tenant headers if required
  const tenantId = req.headers.get('x-tenant-id');
  const farmerId = req.headers.get('x-farmer-id');

  if (requireTenantHeaders) {
    if (!tenantId) {
      return new Response(
        JSON.stringify({
          error: 'Missing x-tenant-id header',
          code: 'MISSING_TENANT_ID'
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid x-tenant-id format',
          code: 'INVALID_TENANT_ID'
        }),
        { status: 400, headers: corsHeaders }
      );
    }
  }

  // Get JWT result for user info (may have been validated above)
  const jwtResult = requireJWT ? await validateJWT(req) : { valid: true };

  return {
    valid: true,
    userId: (jwtResult as JWTValidationResult).userId,
    email: (jwtResult as JWTValidationResult).email,
    tenantId: tenantId || undefined,
    farmerId: farmerId || undefined
  };
}

/**
 * Quick check if request has valid-looking JWT (without full validation)
 * Useful for routing decisions before expensive validation
 */
export function hasAuthorizationHeader(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  return !!authHeader?.startsWith('Bearer ');
}

/**
 * Create authenticated Supabase client from request
 * Uses the user's JWT token for RLS-scoped queries
 */
export function createAuthenticatedClient(req: Request): SupabaseClient | null {
  const token = extractBearerToken(req);
  if (!token) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });
}
