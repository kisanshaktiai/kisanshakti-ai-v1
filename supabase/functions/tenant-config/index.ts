import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveTenantFromRequest } from '../_shared/tenantMiddleware.ts';
import { withTenantBlocker } from '../_shared/tenantBlocker.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Tenant Config API - Centralized Multi-Tenant Configuration Endpoint
 * 
 * Returns complete tenant configuration based on incoming domain:
 * - Tenant metadata (id, name, domain, status)
 * - Branding (logo, colors, company info)
 * - Theme configuration (colors, typography, gradients)
 * - PWA settings (manifest, icons, splash screens)
 * - Features and settings
 * 
 * Public endpoint (no authentication required)
 * Supports ETag caching for efficient updates
 * Rate limited to 100 requests/minute per IP
 */

interface TenantConfigResponse {
  tenant: {
    id: string;
    name: string;
    slug: string;
    domain: string;
    subdomain?: string;
    custom_domain?: string;
    status: string;
  };
  branding: {
    company_name?: string;
    tagline?: string;
    logo_url?: string;
    favicon_url?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    background_color?: string;
    text_color?: string;
    font_family?: string;
    description?: string;
  };
  theme?: {
    core?: Record<string, string>;
    neutral?: Record<string, string>;
    status?: Record<string, string>;
    typography?: {
      font_family?: string;
      font_size_base?: string;
      font_weight_normal?: string;
      font_weight_bold?: string;
    };
    navigation?: Record<string, string>;
    charts?: Record<string, string>;
    maps?: Record<string, string>;
    weather?: Record<string, string>;
    gradients?: Record<string, string>;
    dark_mode?: {
      enabled: boolean;
      colors?: Record<string, string>;
    };
  };
  pwa?: {
    name?: string;
    short_name?: string;
    description?: string;
    theme_color?: string;
    background_color?: string;
    display?: string;
    orientation?: string;
    icons?: Array<{
      src: string;
      sizes?: string;
      type?: string;
      purpose?: string;
    }>;
    splash_screens?: Array<{
      src: string;
      media?: string;
      sizes?: string;
    }>;
  };
  features: string[];
  settings: {
    languages: string[];
    defaultLanguage: string;
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    timeFormat?: string;
  };
  metadata: {
    cached_at: string;
    etag: string;
    version: string;
    last_deployed_at?: string | null;
  };

}

/**
 * Generate ETag for tenant configuration
 */
function generateETag(config: any): string {
  const configString = JSON.stringify(config);
  const hash = Array.from(configString)
    .reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0)
    .toString(36);
  return `"${hash}"`;
}

/**
 * Build complete tenant configuration response
 */
async function buildTenantConfig(
  tenant: any,
  supabase: any
): Promise<TenantConfigResponse> {
  console.log('🏗️ [TenantConfig] Building config for tenant:', tenant.id);

  // Fetch complete white label configuration
  const { data: whiteLabel } = await supabase
    .from('white_label_configs')
    .select(`
      brand_identity,
      app_customization,
      theme_colors,
      mobile_theme,
      pwa_config,
      splash_screens,
      domain_config,
      css_injection,
      last_deployed_at
    `)
    .eq('tenant_id', tenant.id)
    .maybeSingle();

  console.log('📦 [TenantConfig] White label data loaded:', {
    hasBrandIdentity: !!whiteLabel?.brand_identity,
    hasMobileTheme: !!whiteLabel?.mobile_theme,
    hasThemeColors: !!whiteLabel?.theme_colors,
    hasPWA: !!whiteLabel?.pwa_config,
    lastDeployedAt: whiteLabel?.last_deployed_at,
  });

  // Extract branding
  const brandIdentity = whiteLabel?.brand_identity || {};
  const branding = {
    company_name: brandIdentity.company_name || tenant.name,
    tagline: brandIdentity.tagline,
    logo_url: brandIdentity.logo_url,
    favicon_url: brandIdentity.favicon_url,
    primary_color: brandIdentity.primary_color, // No fallback - will use CSS defaults
    secondary_color: brandIdentity.secondary_color,
    accent_color: brandIdentity.accent_color,
    background_color: brandIdentity.background_color,
    text_color: brandIdentity.text_color,
    font_family: brandIdentity.font_family,
    description: brandIdentity.description,
  };

  // ---- Deep-merge theme groups ----
  // theme_colors carries navigation/charts/maps/weather/gradients/dark_mode.
  // mobile_theme carries core/neutral/status/support/typography/border_radius/shadows/spacing.
  // Picking only one column (the prior `mobile_theme || theme_colors` logic) DROPS half
  // the namespaces — that was the root cause of preset changes "not reaching" the app.
  const tc: any = whiteLabel?.theme_colors || {};
  const mt: any = whiteLabel?.mobile_theme || {};
  const themeKeys = new Set([...Object.keys(tc), ...Object.keys(mt)]);
  const theme: any = themeKeys.size ? {} : undefined;
  for (const k of themeKeys) {
    const a = tc[k]; const b = mt[k];
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      theme[k] = { ...a, ...b };
    } else {
      theme[k] = b ?? a;
    }
  }


  // Extract PWA config
  const pwaConfig = whiteLabel?.pwa_config;
  const pwa = pwaConfig ? {
    name: pwaConfig.name || branding.company_name,
    short_name: pwaConfig.short_name || branding.company_name?.substring(0, 12),
    description: pwaConfig.description || branding.description,
    theme_color: pwaConfig.theme_color || branding.primary_color,
    background_color: pwaConfig.background_color || branding.background_color,
    display: pwaConfig.display || 'standalone',
    orientation: pwaConfig.orientation || 'portrait',
    icons: pwaConfig.icons || [],
    splash_screens: whiteLabel?.splash_screens || [],
  } : undefined;

  // Extract features and settings
  const tenantSettings = tenant.settings || {};
  const features = tenantSettings.features || [
    'lands', 'schedule', 'chat', 'market', 'weather', 'social', 
    'analytics', 'profile', 'ndvi', 'schemes'
  ];

  const settings = {
    languages: tenantSettings.languages || ['en', 'hi', 'pa', 'mr', 'ta'],
    defaultLanguage: tenantSettings.defaultLanguage || 'hi',
    timezone: tenantSettings.timezone || 'Asia/Kolkata',
    currency: tenantSettings.currency || 'INR',
    dateFormat: tenantSettings.dateFormat || 'DD/MM/YYYY',
    timeFormat: tenantSettings.timeFormat || '24h',
  };

  // Build complete configuration
  const config: TenantConfigResponse = {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      subdomain: tenant.subdomain,
      custom_domain: tenant.custom_domain,
      status: tenant.status,
    },
    branding,
    theme,
    pwa,
    features,
    settings,
    metadata: {
      cached_at: new Date().toISOString(),
      etag: '', // Will be set after generating
      version: '1.0.0',
      last_deployed_at: whiteLabel?.last_deployed_at || null,
    },
  };

  // Generate ETag — include last_deployed_at so the DB trigger bump
  // forces a new ETag and clients with `If-None-Match` get a 200 instead of 304.
  config.metadata.etag = generateETag({ ...config, _lda: whiteLabel?.last_deployed_at });


  return config;
}

serve(async (req: Request) => {
  const requestStartTime = Date.now();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Allow': 'GET, OPTIONS'
        } 
      }
    );
  }

  try {
    console.log('🔧 [TenantConfig] Request received');

    // Environment validation
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    // ===== STEP 1: Rate Limiting =====
    const clientIp = req.headers.get('x-forwarded-for') || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    
    const rateLimit = await checkRateLimit(clientIp, 'tenant-config', { 
      maxRequests: 100, 
      windowMs: 60000 // 100 requests per minute
    });
    
    if (!rateLimit.allowed) {
      console.warn('⚠️ [TenantConfig] Rate limit exceeded for IP:', clientIp);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString(),
            'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000))
          } 
        }
      );
    }

    // ===== STEP 2: Resolve Tenant =====
    console.log('🔍 [TenantConfig] Resolving tenant from request...');
    let tenant = await resolveTenantFromRequest(req, supabaseUrl, supabaseKey);
    
    if (!tenant) {
      console.warn('⚠️ [TenantConfig] No tenant found for domain, loading default tenant');
      
      // Load default tenant as fallback
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // First try to get tenant marked as default
      let { data: defaultTenant } = await supabase
        .from('tenants')
        .select('id, name, slug, subdomain, custom_domain, status, settings')
        .eq('is_default', true)
        .eq('status', 'active')
        .maybeSingle();

      // If no default tenant, get first active tenant
      if (!defaultTenant) {
        console.log('🔧 [TenantConfig] No default tenant found, using first active tenant');
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
        console.log('✅ [TenantConfig] Using tenant:', defaultTenant.name, `(${defaultTenant.id})`);
        
        // Fetch branding for default tenant
        const { data: whiteLabel } = await supabase
          .from('white_label_configs')
          .select('brand_identity')
          .eq('tenant_id', defaultTenant.id)
          .maybeSingle();

        tenant = {
          id: defaultTenant.id,
          name: defaultTenant.name,
          slug: defaultTenant.slug,
          domain: defaultTenant.custom_domain || defaultTenant.subdomain || 'unknown',
          subdomain: defaultTenant.subdomain,
          custom_domain: defaultTenant.custom_domain,
          status: defaultTenant.status || 'active',
          settings: defaultTenant.settings || {},
          branding: whiteLabel?.brand_identity ? {
            company_name: whiteLabel.brand_identity.company_name,
            logo_url: whiteLabel.brand_identity.logo_url,
            primary_color: whiteLabel.brand_identity.primary_color,
          } : undefined,
          features: defaultTenant.settings?.features || [],
        };
      } else {
        console.error('❌ [TenantConfig] No active tenants found in database');
        return new Response(
          JSON.stringify({ 
            error: 'Tenant not found',
            message: 'No tenant configuration found for this domain and no active tenants in database. Please create at least one active tenant.'
          }),
          { 
            status: 404, 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json' 
            } 
          }
        );
      }
    }

    console.log(`✅ [TenantConfig] Tenant resolved: ${tenant.name} (${tenant.id})`);

    // ===== STEP 3: Block Inactive Tenants =====
    const blockResponse = await withTenantBlocker(tenant, corsHeaders);
    if (blockResponse) {
      console.warn(`🚫 [TenantConfig] Tenant blocked: ${tenant.status}`);
      return blockResponse;
    }

    // ===== STEP 4: Build Configuration =====
    const supabase = createClient(supabaseUrl, supabaseKey);
    const config = await buildTenantConfig(tenant, supabase);

    // ===== STEP 5: Check ETag for Cache Validation =====
    const clientETag = req.headers.get('if-none-match');
    if (clientETag && clientETag === config.metadata.etag) {
      console.log('⚡ [TenantConfig] ETag match - returning 304 Not Modified');
      return new Response(null, {
        status: 304,
        headers: {
          ...corsHeaders,
          'ETag': config.metadata.etag,
          'Cache-Control': 'public, max-age=60, must-revalidate', // short TTL; correctness via ETag
          'X-Tenant-ID': tenant.id,
        },
      });
    }

    // ===== STEP 6: Return Configuration =====
    const responseTime = Date.now() - requestStartTime;
    console.log(`✅ [TenantConfig] Config built successfully (${responseTime}ms)`);

    return new Response(
      JSON.stringify(config, null, 2),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'ETag': config.metadata.etag,
          'Cache-Control': 'public, max-age=60, must-revalidate', // short TTL; correctness via ETag
          'X-Tenant-ID': tenant.id,
          'X-Response-Time': `${responseTime}ms`,
        },
      }
    );

  } catch (error: any) {
    console.error('❌ [TenantConfig] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
