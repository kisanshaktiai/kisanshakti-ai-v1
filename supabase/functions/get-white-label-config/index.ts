import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  if (!theme) return {};
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

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant_id');
    const domain = url.searchParams.get('domain');
    
    // Rate limiting: 200 requests per minute per domain
    const identifier = domain || tenantId || 'anonymous';
    console.log('Rate limit check:', { identifier, domain, tenantId });
    
    try {
      const rateLimit = await checkRateLimit(identifier, 'get-white-label-config', { maxRequests: 200, windowMs: 60000 });
      console.log('Rate limit result:', rateLimit);
      
      if (!rateLimit.allowed) {
        console.log('Rate limit exceeded for identifier:', identifier);
        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded',
            resetTime: new Date(rateLimit.resetTime).toISOString()
          }),
          { 
            status: 429, 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              'X-RateLimit-Remaining': rateLimit.remaining.toString(),
              'X-RateLimit-Reset': rateLimit.resetTime.toString()
            } 
          }
        );
      }
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open on rate limit errors to avoid blocking legitimate traffic
    }
    
    console.log('Fetching white-label config:', { tenantId, domain });

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let tenant = null
    
    // Try to fetch by tenant_id first
    if (tenantId) {
      console.log('📍 [Step 1] Checking tenant_id:', tenantId)
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single()
      
      if (!error && data) {
        tenant = data
        console.log('✅ [Step 1] Found tenant by ID:', tenant.name)
      } else {
        console.log('❌ [Step 1] Not found by tenant_id:', error?.message)
      }
    }
    
    // If not found by ID, try by domain
    if (!tenant && domain) {
      console.log('📍 [Step 2] Checking custom_domain:', domain)
      // Check custom domain first
      let { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('custom_domain', domain)
        .single()
      
      if (!error && data) {
        tenant = data
        console.log('✅ [Step 2] Found tenant by custom domain:', tenant.name)
      } else {
        console.log('❌ [Step 2] Not found by custom_domain:', error?.message)
      }
      
    // Check subdomain if not found
    if (!tenant) {
      const subdomain = domain.split('.')[0]
      console.log('📍 [Step 3] Trying subdomain lookup:', subdomain);
      
      const { data: subdomainData, error: subdomainError } = await supabase
        .from('tenants')
        .select('*')
        .eq('subdomain', subdomain)
        .single()
      
      if (!subdomainError && subdomainData) {
        tenant = subdomainData
        console.log('✅ [Step 3] Found tenant by subdomain:', tenant.name)
      } else {
        console.log('❌ [Step 3] Not found by subdomain:', subdomainError?.message)
      }
    }
  }
  
  // STEP 3.5: FARMER APP PRIORITY - Check white_label_configs.farmer_app.custom_domain
  if (!tenant && domain) {
    console.log('📍 [Step 3.5] 🌾 FARMER APP: Checking white_label_configs for:', domain);
    
    const { data: whitelabelDomains, error: wlError } = await supabase
      .from('white_label_configs')
      .select('tenant_id, domain_config');
    
    if (whitelabelDomains && whitelabelDomains.length > 0) {
      // PRIORITY 1: Check farmer_app.custom_domain (main use case for farmer app skeleton)
      const matchedConfig = whitelabelDomains.find(wl => {
        const domainConfig = wl.domain_config;
        
        // Check nested farmer_app structure first
        if (domainConfig?.farmer_app?.custom_domain === domain) {
          console.log('✅ [Farmer App] Matched farmer_app.custom_domain');
          return true;
        }
        
        // Fallback to flat structure (legacy support)
        if (domainConfig?.custom_domain === domain) {
          console.log('✅ [Legacy] Matched flat custom_domain');
          return true;
        }
        
        if (domainConfig?.subdomain === domain) {
          console.log('✅ [Legacy] Matched subdomain');
          return true;
        }
        
        return false;
      });
      
      if (matchedConfig) {
        console.log('🔍 Found domain in white_label_configs:', matchedConfig.tenant_id);
        
        // Fetch the full tenant record
        const { data: tenantFromWL, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('id', matchedConfig.tenant_id)
          .single();
        
        if (tenantFromWL && !tenantError) {
          tenant = tenantFromWL;
          console.log('✅ [Step 3.5] Found tenant via white_label_configs:', tenant.name);
        } else {
          console.log('❌ [Step 3.5] Failed to fetch tenant:', tenantError?.message);
        }
      } else {
        console.log('❌ [Step 3.5] No matching domain in white_label_configs');
      }
    } else {
      console.log('❌ [Step 3.5] No white_label_configs found:', wlError?.message);
    }
  }
  
  // If still no tenant, get default
    if (!tenant) {
      const { data: defaultTenant, error: defaultError } = await supabase
        .from('tenants')
        .select('*')
        .eq('is_default', true)
        .single()
      
      if (!defaultError && defaultTenant) {
        tenant = defaultTenant
        console.log('✅ Using default tenant:', tenant.name)
      }
    }
    
    if (!tenant) {
      console.error('❌ No tenant found')
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    console.log('📦 Fetching white_label_configs for tenant:', tenant.id)
    
    // Fetch white_label_configs separately to ensure we get the data
    const { data: whiteLabelData, error: wlError } = await supabase
      .from('white_label_configs')
      .select('*')
      .eq('tenant_id', tenant.id)
      .maybeSingle()
    
    if (wlError) {
      console.error('❌ Error fetching white_label_configs:', wlError)
    } else if (whiteLabelData) {
      console.log('✅ Found white_label_configs:', whiteLabelData.id)
    } else {
      console.log('⚠️ No white_label_configs found for tenant')
    }
    
    // Fetch latest tenant_branding row as a parallel fallback source for
    // partner edits (tagline/description/logo) that bypass white_label_configs.
    const { data: tenantBrandingRow } = await supabase
      .from('tenant_branding')
      .select('app_name, app_tagline, company_description, logo_url, favicon_url, primary_color, secondary_color, accent_color, background_color, text_color, font_family, updated_at')
      .eq('tenant_id', tenant.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const pick = (...vals: any[]) => {
      for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== '') return v
      }
      return undefined
    }

    // Transform white label config if exists
    let whiteLabelConfig: any = null
    if (whiteLabelData) {
      const lastDeployedAt = whiteLabelData.last_deployed_at || whiteLabelData.updated_at || tenant.updated_at || ''
      const bi: any = whiteLabelData.brand_identity || {}
      const tb: any = tenantBrandingRow || {}
      // Coalesce per-field so empty values in brand_identity fall back to tenant_branding.
      const mergedBrandIdentity: any = {
        ...bi,
        company_name: pick(bi.company_name, bi.app_name, tb.app_name, tenant.name),
        app_name: pick(bi.app_name, tb.app_name, bi.company_name, tenant.name),
        tagline: pick(bi.tagline, bi.app_tagline, tb.app_tagline),
        logo_url: pick(bi.logo_url, tb.logo_url),
        favicon_url: pick(bi.favicon_url, tb.favicon_url),
        primary_color: pick(bi.primary_color, tb.primary_color),
        secondary_color: pick(bi.secondary_color, tb.secondary_color),
        accent_color: pick(bi.accent_color, tb.accent_color),
        background_color: pick(bi.background_color, tb.background_color),
        text_color: pick(bi.text_color, tb.text_color),
        font_family: pick(bi.font_family, tb.font_family),
        description: pick(bi.description, bi.company_description, tb.company_description),
      }
      whiteLabelConfig = {
        brand_identity: mergedBrandIdentity,
        app_customization: whiteLabelData.app_customization || {},
        pwa_config: whiteLabelData.pwa_config || {},
        theme_colors: normalizeThemeConfig(whiteLabelData.theme_colors),
        mobile_theme: normalizeThemeConfig(whiteLabelData.mobile_theme),
        splash_screens: whiteLabelData.splash_screens || {},
        email_templates: whiteLabelData.email_templates || {},
        domain_config: whiteLabelData.domain_config || {},
        last_deployed_at: lastDeployedAt
      }
      console.log('✅ Transformed white label config with theme_colors', {
        tagline_source: bi.tagline ? 'brand_identity' : (tb.app_tagline ? 'tenant_branding' : 'none'),
      })
    } else if (tenantBrandingRow || tenant.tenant_branding) {
      console.log('⚠️ Falling back to tenant_branding')
      const tb: any = tenantBrandingRow || tenant.tenant_branding || {}
      whiteLabelConfig = {
        brand_identity: {
          company_name: pick(tb.app_name, tenant.name),
          app_name: pick(tb.app_name, tenant.name),
          tagline: pick(tb.app_tagline),
          description: pick(tb.company_description),
          logo_url: tb.logo_url,
          favicon_url: tb.favicon_url,
          primary_color: tb.primary_color,
          secondary_color: tb.secondary_color,
          accent_color: tb.accent_color,
          background_color: tb.background_color,
          text_color: tb.text_color,
          font_family: tb.font_family,
        },
        app_customization: {
          theme_mode: tb.theme_mode || 'system',
          primary_color: tb.primary_color,
          secondary_color: tb.secondary_color,
          accent_color: tb.accent_color,
        },
        pwa_config: {},
        theme_colors: {},
        email_templates: {}
      }
    } else {
      console.log('❌ No white label config or tenant branding found')
    }
    
    // Prepare response
    const response = {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subdomain: tenant.subdomain,
        custom_domain: tenant.custom_domain,
        is_default: tenant.is_default,
        settings: tenant.settings || {},
        status: tenant.status
      },
      whiteLabelConfig,
      features: tenant.features || [],
      languages: tenant.supported_languages || ['en', 'hi', 'mr', 'pa', 'ta'],
      timestamp: new Date().toISOString(),
      metadata: {
        last_deployed_at: whiteLabelData?.last_deployed_at || whiteLabelData?.updated_at || tenant.updated_at || null,
        etag: `"${tenant.id}-${whiteLabelData?.last_deployed_at || whiteLabelData?.updated_at || tenant.updated_at || ''}"`
      }
    }
    
    console.log('Sending white-label config for tenant:', tenant.name)
    
    // Return with cache headers for better performance
    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store',
          'ETag': response.metadata.etag
        }
      }
    )
  } catch (error) {
    console.error('Error fetching white-label config:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})