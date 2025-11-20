import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
    const rateLimit = checkRateLimit(identifier, { maxRequests: 200, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('Fetching white-label config:', { tenantId, domain });

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let tenant = null
    
    // Try to fetch by tenant_id first
    if (tenantId) {
      const { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          whiteLabel:white_label_configs(*)
        `)
        .eq('id', tenantId)
        .single()
      
      if (!error && data) {
        tenant = data
        console.log('Found tenant by ID:', tenant.name)
      }
    }
    
    // If not found by ID, try by domain
    if (!tenant && domain) {
      // Check custom domain first
      let { data, error } = await supabase
        .from('tenants')
        .select(`
          *,
          whiteLabel:white_label_configs(*)
        `)
        .eq('custom_domain', domain)
        .single()
      
      if (!error && data) {
        tenant = data
        console.log('Found tenant by custom domain:', tenant.name)
      }
      
      // Check subdomain if not found
      if (!tenant) {
        const subdomain = domain.split('.')[0]
        const { data: subdomainData, error: subdomainError } = await supabase
          .from('tenants')
          .select(`
            *,
            whiteLabel:white_label_configs(*)
          `)
          .eq('subdomain', subdomain)
          .single()
        
        if (!subdomainError && subdomainData) {
          tenant = subdomainData
          console.log('Found tenant by subdomain:', tenant.name)
        }
      }
    }
    
    // If still no tenant, get default
    if (!tenant) {
      const { data: defaultTenant, error: defaultError } = await supabase
        .from('tenants')
        .select(`
          *,
          whiteLabel:white_label_configs(*)
        `)
        .eq('is_default', true)
        .single()
      
      if (!defaultError && defaultTenant) {
        tenant = defaultTenant
        console.log('Using default tenant:', tenant.name)
      }
    }
    
    if (!tenant) {
      console.error('No tenant found')
      return new Response(
        JSON.stringify({ error: 'Tenant not found' }),
        { 
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }
    
    // Transform white label config if exists
    let whiteLabelConfig = null
    if (tenant.whiteLabel && tenant.whiteLabel.length > 0) {
      const wl = tenant.whiteLabel[0]
      whiteLabelConfig = {
        brand_identity: wl.brand_identity || {},
        app_customization: wl.app_customization || {},
        pwa_config: wl.pwa_config || {},
        theme_colors: wl.theme_colors || {},
        email_templates: wl.email_templates || {}
      }
    } else if (tenant.tenant_branding) {
      // Fallback to tenant_branding if no white_label_configs
      whiteLabelConfig = {
        brand_identity: {
          company_name: tenant.name,
          logo_url: tenant.tenant_branding.logo_url,
          ...tenant.tenant_branding
        },
        app_customization: {
          theme_mode: tenant.tenant_branding.theme_mode || 'system',
          primary_color: tenant.tenant_branding.primary_color,
          secondary_color: tenant.tenant_branding.secondary_color,
          accent_color: tenant.tenant_branding.accent_color,
          ...tenant.tenant_branding
        },
        pwa_config: {},
        theme_colors: {},
        email_templates: {}
      }
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
      timestamp: new Date().toISOString()
    }
    
    console.log('Sending white-label config for tenant:', tenant.name)
    
    // Return with cache headers for better performance
    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'ETag': `"${tenant.id}-${tenant.updated_at || ''}"` // For conditional requests
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