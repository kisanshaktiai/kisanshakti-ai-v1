import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveTenantFromRequest } from '../_shared/tenantMiddleware.ts';
import { withTenantBlocker } from '../_shared/tenantBlocker.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { handleFarmerAuth, isFarmerAuthAction } from '../_shared/farmer-auth-core.ts';

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

type ThemeSource = Record<string, any>;

function firstThemeValue(source: ThemeSource, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function setThemeAlias(target: ThemeSource, group: string, key: string, source: ThemeSource, aliases: string[]) {
  const value = firstThemeValue(source, aliases);
  if (value === undefined) return;
  const existing = target[group];
  target[group] = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  if (target[group][key] === undefined || target[group][key] === null || target[group][key] === '') {
    target[group][key] = value;
  }
}

function normalizeThemeConfig(theme?: ThemeSource | null) {
  if (!theme) return undefined;
  const out: ThemeSource = { ...theme };

  setThemeAlias(out, 'core', 'primary', theme, ['primary', 'primary_color', 'primary_color_hex', 'brand_primary_color']);
  setThemeAlias(out, 'core', 'primary_foreground', theme, ['primary_foreground', 'primary_foreground_color', 'on_primary', 'on_primary_color']);
  setThemeAlias(out, 'core', 'secondary', theme, ['secondary', 'secondary_color', 'secondary_color_hex', 'brand_secondary_color']);
  setThemeAlias(out, 'core', 'secondary_foreground', theme, ['secondary_foreground', 'secondary_foreground_color', 'on_secondary', 'on_secondary_color']);
  setThemeAlias(out, 'core', 'accent', theme, ['accent', 'accent_color', 'accent_color_hex', 'brand_accent_color']);
  setThemeAlias(out, 'core', 'accent_foreground', theme, ['accent_foreground', 'accent_foreground_color', 'on_accent', 'on_accent_color']);
  setThemeAlias(out, 'core', 'ring', theme, ['ring', 'ring_color', 'focus_color']);

  setThemeAlias(out, 'neutral', 'background', theme, ['background', 'background_color', 'background_color_hex', 'app_background_color']);
  setThemeAlias(out, 'neutral', 'on_background', theme, ['on_background', 'on_background_color', 'foreground', 'foreground_color', 'text_color', 'text_color_hex']);
  setThemeAlias(out, 'neutral', 'surface', theme, ['surface', 'surface_color', 'surface_color_hex', 'card', 'card_color', 'popover', 'panel_color']);
  setThemeAlias(out, 'neutral', 'on_surface', theme, ['on_surface', 'on_surface_color', 'card_foreground', 'card_foreground_color', 'surface_text_color', 'text_color']);
  setThemeAlias(out, 'neutral', 'border', theme, ['border', 'border_color', 'border_color_hex', 'input', 'input_color', 'divider_color']);

  setThemeAlias(out, 'status', 'success', theme, ['success', 'success_color', 'success_color_hex']);
  setThemeAlias(out, 'status', 'warning', theme, ['warning', 'warning_color', 'warning_color_hex']);
  setThemeAlias(out, 'status', 'error', theme, ['error', 'error_color', 'error_color_hex', 'destructive', 'destructive_color']);
  setThemeAlias(out, 'status', 'info', theme, ['info', 'info_color', 'info_color_hex']);

  setThemeAlias(out, 'navigation', 'nav_background', theme, ['nav_background', 'nav_background_color', 'bottom_nav_background', 'bottom_nav_background_color', 'navigation_background_color']);
  setThemeAlias(out, 'navigation', 'nav_active', theme, ['nav_active', 'nav_active_color', 'bottom_nav_active', 'bottom_nav_active_color', 'navigation_active_color']);
  setThemeAlias(out, 'navigation', 'nav_inactive', theme, ['nav_inactive', 'nav_inactive_color', 'bottom_nav_inactive', 'bottom_nav_inactive_color', 'navigation_inactive_color']);
  setThemeAlias(out, 'navigation', 'nav_border', theme, ['nav_border', 'nav_border_color', 'bottom_nav_border', 'bottom_nav_border_color', 'navigation_border_color']);

  setThemeAlias(out, 'support', 'disabled', theme, ['disabled', 'disabled_color', 'disabled_text_color']);
  setThemeAlias(out, 'support', 'overlay', theme, ['overlay', 'overlay_color']);

  setThemeAlias(out, 'typography', 'font_family', theme, ['font_family', 'fontFamily']);
  setThemeAlias(out, 'typography', 'font_size_base', theme, ['font_size_base', 'fontSizeBase', 'base_font_size']);
  setThemeAlias(out, 'typography', 'font_weight_regular', theme, ['font_weight_regular', 'regular_font_weight']);
  setThemeAlias(out, 'typography', 'font_weight_medium', theme, ['font_weight_medium', 'medium_font_weight']);
  setThemeAlias(out, 'typography', 'font_weight_bold', theme, ['font_weight_bold', 'bold_font_weight']);

  return out;
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

  // Fetch legacy/parallel `tenant_branding` row — some tenant-portal flows still
  // write tagline/description/logo here (column `app_tagline`). Used ONLY as a
  // fallback when the matching field in `white_label_configs.brand_identity` is
  // missing or empty, so partner edits in either surface reach the mobile app.
  const { data: tenantBranding } = await supabase
    .from('tenant_branding')
    .select('app_name, app_tagline, company_description, logo_url, favicon_url, primary_color, secondary_color, accent_color, background_color, text_color, font_family, updated_at')
    .eq('tenant_id', tenant.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  console.log('📦 [TenantConfig] White label data loaded:', {
    hasBrandIdentity: !!whiteLabel?.brand_identity,
    hasMobileTheme: !!whiteLabel?.mobile_theme,
    hasThemeColors: !!whiteLabel?.theme_colors,
    hasPWA: !!whiteLabel?.pwa_config,
    hasTenantBrandingFallback: !!tenantBranding,
      themeColorNamespaces: Object.keys(whiteLabel?.theme_colors || {}),
      mobileThemeNamespaces: Object.keys(whiteLabel?.mobile_theme || {}),
    lastDeployedAt: whiteLabel?.last_deployed_at,
  });

  // Extract branding — coalesce non-empty values across the two branding sources.
  const brandIdentity: any = whiteLabel?.brand_identity || {};
  const tb: any = tenantBranding || {};
  const pick = (...vals: any[]) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return undefined;
  };
  const branding = {
    company_name: pick(brandIdentity.company_name, brandIdentity.app_name, tb.app_name, tenant.name),
    tagline: pick(brandIdentity.tagline, brandIdentity.app_tagline, tb.app_tagline),
    logo_url: pick(brandIdentity.logo_url, tb.logo_url),
    favicon_url: pick(brandIdentity.favicon_url, tb.favicon_url),
    primary_color: pick(brandIdentity.primary_color, tb.primary_color),
    secondary_color: pick(brandIdentity.secondary_color, tb.secondary_color),
    accent_color: pick(brandIdentity.accent_color, tb.accent_color),
    background_color: pick(brandIdentity.background_color, tb.background_color),
    text_color: pick(brandIdentity.text_color, tb.text_color),
    font_family: pick(brandIdentity.font_family, tb.font_family),
    description: pick(brandIdentity.description, brandIdentity.company_description, tb.company_description),
  };

  // ---- Deep-merge theme groups ----
  // theme_colors carries navigation/charts/maps/weather/gradients/dark_mode.
  // mobile_theme carries core/neutral/status/support/typography/border_radius/shadows/spacing.
  // Picking only one column (the prior `mobile_theme || theme_colors` logic) DROPS half
  // the namespaces — that was the root cause of preset changes "not reaching" the app.
  const tc: any = normalizeThemeConfig(whiteLabel?.theme_colors) || {};
  const mt: any = normalizeThemeConfig(whiteLabel?.mobile_theme) || {};
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

  // Farmer authentication transport.
  // The auth handler lives in ../_shared/farmer-auth-core.ts and is also served
  // by the `farmer-auth` function; it is mounted here as well so the client has
  // a always-reachable endpoint for login/registration.
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (isFarmerAuthAction(body)) {
      return await handleFarmerAuth(req, body);
    }
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
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store',
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
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store',
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
