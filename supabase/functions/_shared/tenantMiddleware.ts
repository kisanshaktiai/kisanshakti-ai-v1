import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Tenant Middleware - Enterprise Multi-Tenant SaaS
 * 
 * Resolves tenant from incoming request headers:
 * - Host header (primary)
 * - X-Forwarded-Host header (behind proxy)
 * - x-tenant-id header (explicit override for testing)
 * 
 * Caches tenant data in-memory for performance
 */

export interface ResolvedTenant {
  id: string;
  name: string;
  slug: string;
  domain: string;
  subdomain?: string;
  custom_domain?: string;
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  settings: any;
  branding?: {
    company_name?: string;
    logo_url?: string;
    primary_color?: string;
  };
  features: string[];
}

// In-memory cache for tenant lookups (1 hour TTL)
const tenantCache = new Map<string, { tenant: ResolvedTenant; expires: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Extract domain from request headers
 */
export function extractDomain(req: Request): string {
  // Priority 0: Custom client domain header (most reliable for production)
  const clientDomain = req.headers.get('x-client-domain');
  if (clientDomain) {
    console.log('🔍 [TenantMiddleware] Using x-client-domain:', clientDomain);
    return clientDomain;
  }

  // Priority 1: X-Forwarded-Host (when behind reverse proxy)
  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    console.log('🔍 [TenantMiddleware] Using x-forwarded-host:', forwardedHost);
    return forwardedHost.split(',')[0].trim();
  }

  // Priority 2: Host header (standard)
  const host = req.headers.get('host');
  if (host) {
    console.log('🔍 [TenantMiddleware] Using host header:', host);
    return host;
  }

  // Priority 3: Origin header (fallback)
  const origin = req.headers.get('origin');
  if (origin) {
    const url = new URL(origin);
    console.log('🔍 [TenantMiddleware] Using origin header:', url.hostname);
    return url.hostname;
  }

  console.warn('⚠️ [TenantMiddleware] No domain found in headers, using localhost');
  return 'localhost';
}

/**
 * Resolve tenant from domain with multi-stage lookup
 */
export async function resolveTenantFromRequest(
  req: Request,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ResolvedTenant | null> {
  const startTime = Date.now();

  // Check for explicit tenant ID in header (for testing/override)
  const explicitTenantId = req.headers.get('x-tenant-id');
  if (explicitTenantId) {
    console.log('🎯 [TenantMiddleware] Using explicit tenant ID:', explicitTenantId);
    return await fetchTenantById(explicitTenantId, supabaseUrl, supabaseKey);
  }

  // Extract domain from request
  const domain = extractDomain(req);
  console.log('🔍 [TenantMiddleware] Resolving tenant for domain:', domain);

  // Check cache first
  const cached = tenantCache.get(domain);
  if (cached && cached.expires > Date.now()) {
    console.log('⚡ [TenantMiddleware] Cache hit for domain:', domain);
    return cached.tenant;
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let tenant: ResolvedTenant | null = null;

    // STAGE 1: Exact custom_domain match in tenants table
    const { data: exactMatch } = await supabase
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status, settings')
      .eq('custom_domain', domain)
      .maybeSingle();

    if (exactMatch) {
      console.log('✅ [Stage 1] Found by tenants.custom_domain');
      tenant = await enrichTenantData(exactMatch, supabase);
    }

    // STAGE 2: Subdomain match in tenants table
    if (!tenant) {
      const { data: subdomainMatch } = await supabase
        .from('tenants')
        .select('id, name, slug, subdomain, custom_domain, status, settings')
        .eq('subdomain', domain)
        .maybeSingle();

      if (subdomainMatch) {
        console.log('✅ [Stage 2] Found by tenants.subdomain');
        tenant = await enrichTenantData(subdomainMatch, supabase);
      }
    }

    // STAGE 3: Check white_label_configs.domain_config
    if (!tenant) {
      const { data: whitelabelConfigs } = await supabase
        .from('white_label_configs')
        .select('tenant_id, domain_config, brand_identity');

      const matchedConfig = whitelabelConfigs?.find((wl: any) => {
        const domainConfig = wl.domain_config;
        return (
          domainConfig?.farmer_app?.custom_domain === domain ||
          domainConfig?.custom_domain === domain ||
          domainConfig?.subdomain === domain
        );
      });

      if (matchedConfig) {
        console.log('✅ [Stage 3] Found in white_label_configs');
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('id, name, slug, subdomain, custom_domain, status, settings')
          .eq('id', matchedConfig.tenant_id)
          .maybeSingle();

        if (tenantData) {
          tenant = await enrichTenantData(tenantData, supabase, matchedConfig.brand_identity);
        }
      }
    }

    // STAGE 4: Fallback for development (localhost, lovable.app, lovableproject.com) or edge-runtime
    if (!tenant && (
      domain === 'localhost' || 
      domain.includes('127.0.0.1') ||
      domain.includes('lovable.app') ||
      domain.includes('lovableproject.com') ||
      domain.includes('edge-runtime.supabase.com')
    )) {
      console.log('🔧 [Stage 4] Development/Edge Runtime mode - fetching default tenant');
      
      // First try to get tenant marked as default
      let { data: defaultTenant } = await supabase
        .from('tenants')
        .select('id, name, slug, subdomain, custom_domain, status, settings')
        .eq('is_default', true)
        .eq('status', 'active')
        .maybeSingle();

      // If no default tenant, get first active tenant
      if (!defaultTenant) {
        console.log('🔧 [Stage 4] No default tenant found, using first active tenant');
        const { data: firstTenant } = await supabase
          .from('tenants')
          .select('id, name, slug, subdomain, custom_domain, status, settings')
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        defaultTenant = firstTenant;
      }

      if (defaultTenant) {
        console.log('✅ [Stage 4] Using tenant:', defaultTenant.name, `(${defaultTenant.id})`);
        tenant = await enrichTenantData(defaultTenant, supabase);
      } else {
        console.error('❌ [Stage 4] No active tenants found in database');
      }
    }

    if (tenant) {
      // Cache the result
      tenantCache.set(domain, {
        tenant,
        expires: Date.now() + CACHE_TTL,
      });

      const elapsed = Date.now() - startTime;
      console.log(`✅ [TenantMiddleware] Resolved tenant: ${tenant.name} (${elapsed}ms)`);
      return tenant;
    }

    console.error('❌ [TenantMiddleware] No tenant found for domain:', domain);
    return null;
  } catch (error) {
    console.error('❌ [TenantMiddleware] Error resolving tenant:', error);
    return null;
  }
}

/**
 * Fetch tenant by ID (for explicit tenant header)
 */
async function fetchTenantById(
  tenantId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<ResolvedTenant | null> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id, name, slug, subdomain, custom_domain, status, settings')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenantData) return null;

  return await enrichTenantData(tenantData, supabase);
}

/**
 * Enrich tenant data with branding and features
 */
async function enrichTenantData(
  tenantData: any,
  supabase: any,
  providedBranding?: any
): Promise<ResolvedTenant> {
  let branding = providedBranding;

  // Fetch branding if not provided
  if (!branding) {
    const { data: whiteLabel } = await supabase
      .from('white_label_configs')
      .select('brand_identity')
      .eq('tenant_id', tenantData.id)
      .maybeSingle();

    branding = whiteLabel?.brand_identity;
  }

  return {
    id: tenantData.id,
    name: tenantData.name,
    slug: tenantData.slug,
    domain: tenantData.custom_domain || tenantData.subdomain || 'unknown',
    subdomain: tenantData.subdomain,
    custom_domain: tenantData.custom_domain,
    status: tenantData.status || 'active',
    settings: tenantData.settings || {},
    branding: branding
      ? {
          company_name: branding.company_name,
          logo_url: branding.logo_url,
          primary_color: branding.primary_color,
        }
      : undefined,
    features: tenantData.settings?.features || [],
  };
}

/**
 * Clear cache for a specific domain (useful for testing)
 */
export function clearTenantCache(domain?: string) {
  if (domain) {
    tenantCache.delete(domain);
    console.log('🗑️ [TenantMiddleware] Cleared cache for domain:', domain);
  } else {
    tenantCache.clear();
    console.log('🗑️ [TenantMiddleware] Cleared entire tenant cache');
  }
}

/**
 * Get cache statistics (for monitoring)
 */
export function getTenantCacheStats() {
  return {
    size: tenantCache.size,
    entries: Array.from(tenantCache.keys()),
  };
}
