/**
 * App Version Edge Function
 * Returns the current app version from the database
 * Used by clients to detect new deployments and trigger cache invalidation
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';

interface AppVersion {
  id: string;
  version: string;
  build_hash: string;
  is_current: boolean;
  force_update: boolean;
  release_notes: string | null;
  features_added: string[] | null;
  bugs_fixed: string[] | null;
  breaking_changes: string[] | null;
  min_supported_version: string | null;
  deployed_at: string | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse app_key from query params with default fallback
    const url = new URL(req.url);
    const appKey = url.searchParams.get('app_key') || 'farmer_app';
    
    console.log('[app-version] Fetching current app version for:', appKey);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Fetch current version for the specified app_key (defaults to farmer_app)
    const { data: versions, error } = await supabaseClient
      .from('app_versions')
      .select('*')
      .eq('app_key', appKey)
      .eq('is_current', true)
      .order('deployed_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      console.error('[app-version] Database error:', error);
      throw error;
    }

    const currentVersion = versions?.[0] || null;

    if (!currentVersion) {
      console.warn('[app-version] No current version found in database');
      return new Response(
        JSON.stringify({
          error: 'No current version configured',
          version: '1.0.0',
          build_hash: 'unknown',
          force_update: false,
        }),
        {
          status: 404,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60', // Cache for 1 minute
          },
        }
      );
    }

    const response = {
      version: currentVersion.version,
      build_hash: currentVersion.build_hash,
      force_update: currentVersion.force_update || false,
      release_notes: currentVersion.release_notes,
      features_added: currentVersion.features_added,
      bugs_fixed: currentVersion.bugs_fixed,
      breaking_changes: currentVersion.breaking_changes,
      min_supported_version: currentVersion.min_supported_version,
      deployed_at: currentVersion.deployed_at,
    };

    console.log('[app-version] Current version:', response.version, 'Build:', response.build_hash);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Cache for 1 minute
      },
    });
  } catch (error) {
    console.error('[app-version] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        version: '1.0.0',
        build_hash: 'error',
        force_update: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
