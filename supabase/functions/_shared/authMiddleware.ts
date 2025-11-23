import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ResolvedTenant } from './tenantMiddleware.ts';

/**
 * Auth Middleware - Enterprise Multi-Tenant SaaS
 * 
 * Validates JWT tokens and ensures tenant_id in token matches domain tenant
 * Prevents cross-tenant access attempts
 */

export interface AuthContext {
  userId: string;
  tenantId: string;
  email?: string;
  role?: string;
  isValid: boolean;
}

export interface ValidationResult {
  valid: boolean;
  authContext?: AuthContext;
  error?: string;
  errorCode?: string;
}

/**
 * Extract and decode JWT from Authorization header
 */
function extractJWT(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  // Extract token from "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    console.warn('⚠️ [AuthMiddleware] Invalid authorization header format');
    return null;
  }

  return parts[1];
}

/**
 * Decode JWT payload (without verification - Supabase client handles that)
 */
function decodeJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode base64 payload
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (error) {
    console.error('❌ [AuthMiddleware] Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Validate JWT and ensure tenant_id matches domain tenant
 */
export async function validateTenantAuth(
  req: Request,
  tenant: ResolvedTenant,
  supabaseUrl: string,
  supabaseKey: string,
  requireAuth: boolean = true
): Promise<ValidationResult> {
  // Extract JWT from request
  const token = extractJWT(req);

  if (!token) {
    if (requireAuth) {
      console.error('❌ [AuthMiddleware] No authorization token provided');
      return {
        valid: false,
        error: 'Authentication required',
        errorCode: 'NO_AUTH_TOKEN',
      };
    }

    console.log('ℹ️ [AuthMiddleware] No auth token, but auth not required');
    return { valid: true };
  }

  // Decode JWT payload
  const payload = decodeJWT(token);
  if (!payload) {
    console.error('❌ [AuthMiddleware] Failed to decode JWT');
    return {
      valid: false,
      error: 'Invalid authentication token',
      errorCode: 'INVALID_TOKEN',
    };
  }

  console.log('🔍 [AuthMiddleware] JWT payload:', {
    sub: payload.sub,
    tenant_id: payload.tenant_id || payload.user_metadata?.tenant_id,
    email: payload.email,
  });

  // Verify token with Supabase
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    console.error('❌ [AuthMiddleware] Token verification failed:', error);
    return {
      valid: false,
      error: 'Invalid or expired token',
      errorCode: 'TOKEN_VERIFICATION_FAILED',
    };
  }

  // Extract tenant_id from JWT
  const tokenTenantId = payload.tenant_id || payload.user_metadata?.tenant_id || user.user_metadata?.tenant_id;

  if (!tokenTenantId) {
    console.error('❌ [AuthMiddleware] No tenant_id in JWT');
    return {
      valid: false,
      error: 'Missing tenant information in token',
      errorCode: 'NO_TENANT_IN_TOKEN',
    };
  }

  // CRITICAL: Validate tenant_id matches domain tenant
  if (tokenTenantId !== tenant.id) {
    console.error('🚨 [AuthMiddleware] SECURITY VIOLATION: Tenant ID mismatch', {
      tokenTenantId,
      domainTenantId: tenant.id,
      userId: user.id,
      domain: tenant.domain,
    });

    // Log security event for monitoring
    await logSecurityEvent(supabase, {
      event_type: 'TENANT_MISMATCH',
      user_id: user.id,
      token_tenant_id: tokenTenantId,
      domain_tenant_id: tenant.id,
      domain: tenant.domain,
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
      user_agent: req.headers.get('user-agent'),
    });

    return {
      valid: false,
      error: 'Access denied: Tenant mismatch',
      errorCode: 'TENANT_MISMATCH',
    };
  }

  // Create auth context
  const authContext: AuthContext = {
    userId: user.id,
    tenantId: tokenTenantId,
    email: user.email,
    role: user.user_metadata?.role || user.role || 'user',
    isValid: true,
  };

  console.log('✅ [AuthMiddleware] Authentication validated:', {
    userId: authContext.userId,
    tenantId: authContext.tenantId,
    email: authContext.email,
  });

  return {
    valid: true,
    authContext,
  };
}

/**
 * Log security events for monitoring
 */
async function logSecurityEvent(supabase: any, event: any): Promise<void> {
  try {
    await supabase.from('security_events').insert({
      event_type: event.event_type,
      user_id: event.user_id,
      metadata: {
        token_tenant_id: event.token_tenant_id,
        domain_tenant_id: event.domain_tenant_id,
        domain: event.domain,
        ip_address: event.ip_address,
        user_agent: event.user_agent,
      },
      created_at: new Date().toISOString(),
    });

    console.log('📝 [AuthMiddleware] Security event logged:', event.event_type);
  } catch (error) {
    console.error('❌ [AuthMiddleware] Failed to log security event:', error);
    // Don't fail the request if logging fails
  }
}

/**
 * Extract auth context from request without validation (for internal use)
 */
export function extractAuthContext(req: Request): Partial<AuthContext> | null {
  const token = extractJWT(req);
  if (!token) return null;

  const payload = decodeJWT(token);
  if (!payload) return null;

  return {
    userId: payload.sub,
    tenantId: payload.tenant_id || payload.user_metadata?.tenant_id,
    email: payload.email,
    role: payload.role || payload.user_metadata?.role,
  };
}

// =============================================================================
// HEADER-BASED AUTHENTICATION (for mobile/web apps)
// =============================================================================

/**
 * Header-based authentication context
 */
export interface HeaderAuthContext {
  tenantId: string;
  farmerId: string;
  sessionToken: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
  'Content-Type': 'application/json'
};

/**
 * Validates authentication headers from incoming requests
 * 
 * @param req - The incoming HTTP request
 * @param options - Optional configuration
 * @param options.requireSessionToken - Whether to require x-session-token header (default: false)
 * @param options.allowMissingFarmerId - Whether farmerId is optional for background jobs (default: false)
 * 
 * @returns HeaderAuthContext object if valid, or Response with error if invalid
 * 
 * @example
 * ```typescript
 * const authResult = await validateAuthHeaders(req);
 * if (authResult instanceof Response) {
 *   return authResult; // Return error response
 * }
 * const { tenantId, farmerId, sessionToken } = authResult;
 * ```
 */
export async function validateAuthHeaders(
  req: Request,
  options?: {
    requireSessionToken?: boolean;
    allowMissingFarmerId?: boolean;
  }
): Promise<HeaderAuthContext | Response> {
  const tenantId = req.headers.get('x-tenant-id');
  const farmerId = req.headers.get('x-farmer-id');
  const sessionToken = req.headers.get('x-session-token');

  // Log headers for debugging (without sensitive data)
  console.log('🔐 [validateAuthHeaders] Validating headers:', {
    hasTenantId: !!tenantId,
    hasFarmerId: !!farmerId,
    hasSessionToken: !!sessionToken,
    requireSessionToken: options?.requireSessionToken || false,
    allowMissingFarmerId: options?.allowMissingFarmerId || false,
    timestamp: new Date().toISOString()
  });

  // Validate tenant ID (always required)
  if (!tenantId) {
    console.error('🚨 [validateAuthHeaders] Missing x-tenant-id header');
    return new Response(
      JSON.stringify({ 
        error: 'Authentication required',
        details: 'x-tenant-id header is required',
        code: 'MISSING_TENANT_ID'
      }),
      { 
        status: 401, 
        headers: corsHeaders
      }
    );
  }

  // Validate farmer ID (required unless explicitly allowed to be missing)
  if (!farmerId && !options?.allowMissingFarmerId) {
    console.error('🚨 [validateAuthHeaders] Missing x-farmer-id header');
    return new Response(
      JSON.stringify({ 
        error: 'Authentication required',
        details: 'x-farmer-id header is required',
        code: 'MISSING_FARMER_ID'
      }),
      { 
        status: 401, 
        headers: corsHeaders
      }
    );
  }

  // Validate session token if required
  if (options?.requireSessionToken && !sessionToken) {
    console.error('🚨 [validateAuthHeaders] Missing x-session-token header');
    return new Response(
      JSON.stringify({ 
        error: 'Authentication required',
        details: 'x-session-token header is required for this operation',
        code: 'MISSING_SESSION_TOKEN'
      }),
      { 
        status: 401, 
        headers: corsHeaders
      }
    );
  }

  // Validate header formats (basic validation)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(tenantId)) {
    console.error('🚨 [validateAuthHeaders] Invalid tenantId format:', tenantId);
    return new Response(
      JSON.stringify({ 
        error: 'Invalid authentication',
        details: 'x-tenant-id must be a valid UUID',
        code: 'INVALID_TENANT_ID_FORMAT'
      }),
      { 
        status: 400, 
        headers: corsHeaders
      }
    );
  }

  if (farmerId && !uuidRegex.test(farmerId)) {
    console.error('🚨 [validateAuthHeaders] Invalid farmerId format:', farmerId);
    return new Response(
      JSON.stringify({ 
        error: 'Invalid authentication',
        details: 'x-farmer-id must be a valid UUID',
        code: 'INVALID_FARMER_ID_FORMAT'
      }),
      { 
        status: 400, 
        headers: corsHeaders
      }
    );
  }

  console.log('✅ [validateAuthHeaders] Headers validated successfully');

  return {
    tenantId,
    farmerId: farmerId || '', // Return empty string if optional and missing
    sessionToken: sessionToken || null
  };
}

/**
 * Validates tenant-farmer association in the database
 * 
 * This ensures the farmer belongs to the specified tenant, preventing
 * cross-tenant data access attempts.
 * 
 * @param supabase - Supabase client instance
 * @param tenantId - Tenant ID from headers
 * @param farmerId - Farmer ID from headers
 * 
 * @returns true if valid, Response with error if invalid
 * 
 * @example
 * ```typescript
 * const validationResult = await validateTenantFarmerAssociation(supabase, tenantId, farmerId);
 * if (validationResult instanceof Response) {
 *   return validationResult;
 * }
 * // Continue with business logic
 * ```
 */
export async function validateTenantFarmerAssociation(
  supabase: any,
  tenantId: string,
  farmerId: string
): Promise<true | Response> {
  console.log('🔐 [validateTenantFarmerAssociation] Validating association...');

  try {
    const { data: farmer, error } = await supabase
      .from('farmers')
      .select('id, tenant_id, farmer_name')
      .eq('id', farmerId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !farmer) {
      console.error('🚨 [validateTenantFarmerAssociation] Invalid association:', {
        tenantId,
        farmerId,
        error: error?.message,
        code: error?.code
      });

      return new Response(
        JSON.stringify({ 
          error: 'Unauthorized',
          details: 'Invalid tenant-farmer association',
          code: 'INVALID_TENANT_FARMER_ASSOCIATION'
        }),
        { 
          status: 403, 
          headers: corsHeaders
        }
      );
    }

    console.log('✅ [validateTenantFarmerAssociation] Association validated:', {
      farmerId: farmer.id,
      farmerName: farmer.farmer_name,
      tenantId: farmer.tenant_id
    });

    return true;
  } catch (err) {
    console.error('🚨 [validateTenantFarmerAssociation] Error:', err);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: 'Failed to validate authentication',
        code: 'VALIDATION_ERROR'
      }),
      { 
        status: 500, 
        headers: corsHeaders
      }
    );
  }
}

/**
 * Creates a standardized CORS response for OPTIONS requests
 * 
 * @returns Response object with CORS headers
 */
export function createCorsResponse(): Response {
  return new Response(null, { 
    status: 204,
    headers: corsHeaders 
  });
}

/**
 * Creates a standardized error response with proper CORS headers
 * 
 * @param message - Error message
 * @param status - HTTP status code (default: 500)
 * @param code - Error code for client-side handling
 * 
 * @returns Response object with error details
 */
export function createErrorResponse(
  message: string,
  status: number = 500,
  code?: string
): Response {
  return new Response(
    JSON.stringify({ 
      error: message,
      code: code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }),
    { 
      status, 
      headers: corsHeaders
    }
  );
}

/**
 * Creates a standardized success response with proper CORS headers
 * 
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * 
 * @returns Response object with data
 */
export function createSuccessResponse(
  data: any,
  status: number = 200
): Response {
  return new Response(
    JSON.stringify(data),
    { 
      status, 
      headers: corsHeaders
    }
  );
}
