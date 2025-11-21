import { ResolvedTenant } from './tenantMiddleware.ts';

/**
 * Tenant Blocker Middleware - Enterprise Multi-Tenant SaaS
 * 
 * Blocks requests for inactive, suspended, or pending tenants
 * Returns appropriate error responses with tenant-specific messages
 */

export interface BlockResult {
  blocked: boolean;
  reason?: string;
  errorCode?: string;
  statusCode?: number;
  message?: string;
}

/**
 * Check if tenant should be blocked from accessing the system
 */
export function checkTenantStatus(tenant: ResolvedTenant): BlockResult {
  console.log('🔍 [TenantBlocker] Checking tenant status:', {
    tenantId: tenant.id,
    name: tenant.name,
    status: tenant.status,
  });

  switch (tenant.status) {
    case 'active':
      console.log('✅ [TenantBlocker] Tenant is active');
      return {
        blocked: false,
      };

    case 'inactive':
      console.warn('⚠️ [TenantBlocker] Tenant is inactive:', tenant.name);
      return {
        blocked: true,
        reason: 'Tenant account is inactive',
        errorCode: 'TENANT_INACTIVE',
        statusCode: 403,
        message: getTenantMessage(tenant, 'inactive'),
      };

    case 'suspended':
      console.warn('🚫 [TenantBlocker] Tenant is suspended:', tenant.name);
      return {
        blocked: true,
        reason: 'Tenant account has been suspended',
        errorCode: 'TENANT_SUSPENDED',
        statusCode: 403,
        message: getTenantMessage(tenant, 'suspended'),
      };

    case 'pending':
      console.warn('⏳ [TenantBlocker] Tenant is pending activation:', tenant.name);
      return {
        blocked: true,
        reason: 'Tenant account is pending activation',
        errorCode: 'TENANT_PENDING',
        statusCode: 403,
        message: getTenantMessage(tenant, 'pending'),
      };

    default:
      console.error('❌ [TenantBlocker] Unknown tenant status:', tenant.status);
      return {
        blocked: true,
        reason: 'Invalid tenant status',
        errorCode: 'TENANT_INVALID_STATUS',
        statusCode: 403,
        message: getTenantMessage(tenant, 'unknown'),
      };
  }
}

/**
 * Get tenant-specific message based on status
 */
function getTenantMessage(tenant: ResolvedTenant, status: string): string {
  const companyName = tenant.branding?.company_name || tenant.name;

  switch (status) {
    case 'inactive':
      return `${companyName}'s account is currently inactive. Please contact support to reactivate your account.`;

    case 'suspended':
      return `${companyName}'s account has been suspended. Please contact support at support@${tenant.domain} for assistance.`;

    case 'pending':
      return `${companyName}'s account is pending activation. You will receive an email once your account is ready.`;

    case 'unknown':
      return `${companyName}'s account status is invalid. Please contact support.`;

    default:
      return 'Access denied. Please contact support.';
  }
}

/**
 * Check if tenant has access to specific feature
 */
export function checkTenantFeature(tenant: ResolvedTenant, feature: string): BlockResult {
  console.log('🔍 [TenantBlocker] Checking feature access:', {
    tenantId: tenant.id,
    feature,
    availableFeatures: tenant.features,
  });

  if (tenant.features.includes(feature)) {
    console.log('✅ [TenantBlocker] Feature is enabled:', feature);
    return {
      blocked: false,
    };
  }

  console.warn('⚠️ [TenantBlocker] Feature not available for tenant:', feature);
  return {
    blocked: true,
    reason: `Feature '${feature}' is not available for this account`,
    errorCode: 'FEATURE_NOT_AVAILABLE',
    statusCode: 403,
    message: getFeatureMessage(tenant, feature),
  };
}

/**
 * Get feature-specific message
 */
function getFeatureMessage(tenant: ResolvedTenant, feature: string): string {
  const companyName = tenant.branding?.company_name || tenant.name;
  return `The '${feature}' feature is not enabled for ${companyName}. Please upgrade your plan or contact support.`;
}

/**
 * Create error response for blocked requests
 */
export function createBlockedResponse(blockResult: BlockResult, corsHeaders?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders,
  };

  return new Response(
    JSON.stringify({
      error: blockResult.reason,
      errorCode: blockResult.errorCode,
      message: blockResult.message,
      timestamp: new Date().toISOString(),
    }),
    {
      status: blockResult.statusCode || 403,
      headers,
    }
  );
}

/**
 * Middleware wrapper for easy integration
 */
export async function withTenantBlocker(
  tenant: ResolvedTenant,
  corsHeaders?: Record<string, string>
): Promise<Response | null> {
  const blockResult = checkTenantStatus(tenant);

  if (blockResult.blocked) {
    return createBlockedResponse(blockResult, corsHeaders);
  }

  return null; // Allow request to proceed
}
