import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const domain = url.searchParams.get('domain') || req.headers.get('host') || '';
    
    // Rate limiting: 100 requests per minute per domain
    const rateLimit = checkRateLimit(domain, { maxRequests: 100, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('[generate-manifest] Fetching manifest for domain:', domain);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tenant by domain
    let tenant = null;
    
    // Try custom domain first
    const { data: customDomainTenant } = await supabase
      .from('tenants')
      .select('*, white_label_configs(*)')
      .eq('custom_domain', domain)
      .eq('is_active', true)
      .maybeSingle();

    if (customDomainTenant) {
      tenant = customDomainTenant;
    } else {
      // Try subdomain
      const subdomain = domain.split('.')[0];
      const { data: subdomainTenant } = await supabase
        .from('tenants')
        .select('*, white_label_configs(*)')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .maybeSingle();

      if (subdomainTenant) {
        tenant = subdomainTenant;
      } else {
        // Fallback to default tenant
        const { data: defaultTenant } = await supabase
          .from('tenants')
          .select('*, white_label_configs(*)')
          .eq('is_default', true)
          .maybeSingle();
        
        tenant = defaultTenant;
      }
    }

    if (!tenant) {
      console.error('[generate-manifest] No tenant found for domain:', domain);
      // Return default manifest
      return new Response(
        JSON.stringify({
          name: 'KisanShakti',
          short_name: 'KisanShakti',
          description: 'Digital platform empowering Indian farmers',
          start_url: '/',
          display: 'standalone',
          background_color: '#f9fafb',
          theme_color: '#22c55e',
          orientation: 'portrait',
          scope: '/',
          icons: [
            {
              src: '/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ],
          categories: ['productivity', 'utilities'],
          lang: 'hi',
          dir: 'ltr'
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300', // 5 minutes
          },
        }
      );
    }

    // Get branding from white_label_configs or tenant_branding
    const config = tenant.white_label_configs?.[0] || tenant.tenant_branding || {};
    
    const manifest = {
      name: config.app_name || tenant.name || 'KisanShakti',
      short_name: config.app_name?.substring(0, 12) || tenant.name?.substring(0, 12) || 'KisanShakti',
      description: config.tagline || 'Digital platform empowering farmers',
      start_url: '/',
      display: 'standalone',
      background_color: config.background_color || '#f9fafb',
      theme_color: config.primary_color || '#22c55e',
      orientation: 'portrait',
      scope: '/',
      icons: [
        {
          src: config.app_icon_url || '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable'
        },
        {
          src: config.app_icon_url || '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ],
      categories: ['productivity', 'utilities'],
      lang: config.default_language || 'hi',
      dir: 'ltr'
    };

    console.log('[generate-manifest] Generated manifest for tenant:', tenant.name);

    return new Response(JSON.stringify(manifest), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 minutes
      },
    });
  } catch (error) {
    console.error('[generate-manifest] Error:', error);
    
    // Return default manifest on error
    return new Response(
      JSON.stringify({
        name: 'KisanShakti',
        short_name: 'KisanShakti',
        description: 'Digital platform empowering farmers',
        start_url: '/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#22c55e',
        orientation: 'portrait',
        scope: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        categories: ['productivity', 'utilities'],
        lang: 'hi',
        dir: 'ltr'
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  }
});
