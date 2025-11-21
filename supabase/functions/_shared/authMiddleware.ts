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
