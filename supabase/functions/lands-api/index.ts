import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key for RLS bypass
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Extract authentication context from headers
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');

    console.log('Request context:', { tenantId, farmerId, sessionToken, method: req.method });

    // Validate required headers
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required headers', 
          details: 'x-tenant-id and x-farmer-id headers are required' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request URL - extract only the path after '/lands-api'
    const url = new URL(req.url);
    const pathAfterFunction = url.pathname.split('/lands-api')[1] || '';
    const cleanPath = pathAfterFunction.startsWith('/') ? pathAfterFunction.slice(1) : pathAfterFunction;
    
    // Get land ID if present (e.g., /lands-api/{id})
    const landId = cleanPath && !cleanPath.includes('/') ? cleanPath : null;

    // Set session variables for RLS
    const { error: sessionError } = await supabase.rpc('set_app_session', {
      p_tenant_id: tenantId,
      p_farmer_id: farmerId,
      p_session_token: sessionToken
    });

    if (sessionError) {
      console.error('Failed to set session:', sessionError);
      // Continue without RLS session - edge functions use service role key
      // This allows the API to work even if the RPC function doesn't exist
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        // Check if fetching a specific land by ID
        if (landId) {
          console.log('🔍 [LandsAPI] Fetching specific land:', { 
            landId, 
            tenantId, 
            farmerId,
            hasSessionToken: !!sessionToken
          });
          
          // Fetch specific land by ID
          const { data, error } = await supabase
            .from('lands')
            .select('*')
            .eq('id', landId)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .single();

          if (error) {
            console.error('❌ [LandsAPI] Database error fetching land:', {
              error: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint
            });
            return new Response(
              JSON.stringify({ 
                error: error.message,
                details: error.details,
                hint: error.hint 
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (!data) {
            console.warn('⚠️ [LandsAPI] No land found matching criteria:', {
              landId,
              tenantId,
              farmerId
            });
            
            // Query without farmer_id to check if land exists but with different farmer
            const { data: anyLand } = await supabase
              .from('lands')
              .select('id, farmer_id, tenant_id')
              .eq('id', landId)
              .eq('tenant_id', tenantId)
              .maybeSingle();
            
            if (anyLand) {
              console.error('❌ [LandsAPI] PERMISSION ISSUE: Land exists but farmer_id mismatch:', {
                requestedFarmerId: farmerId,
                actualFarmerId: anyLand.farmer_id,
                landId,
                tenantId
              });
            } else {
              console.warn('⚠️ [LandsAPI] Land does not exist in this tenant');
            }
            
            return new Response(
              JSON.stringify({ 
                error: 'Land not found', 
                details: 'The requested land was not found or you do not have permission to view it' 
              }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log('✅ [LandsAPI] Land fetched successfully:', {
            landId: data.id,
            landName: data.name
          });

          return new Response(
            JSON.stringify({ data, success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // List all lands for the farmer
          const { data, error } = await supabase
            .from('lands')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

          if (error) {
            console.error('Error fetching lands:', error);
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ data, success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'POST': {
        // Create new land
        const body = await req.json();
        
        // Ensure tenant_id and farmer_id are set correctly
        const landData = {
          ...body,
          tenant_id: tenantId,
          farmer_id: farmerId,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('lands')
          .insert([landData])
          .select()
          .single();

        if (error) {
          console.error('Error creating land:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ data, success: true }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'PUT':
      case 'PATCH': {
        // Update existing land
        if (!landId) {
          return new Response(
            JSON.stringify({ error: 'Land ID is required for update' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const body = await req.json();
        
        // Remove fields that shouldn't be updated
        delete body.id;
        delete body.tenant_id;
        delete body.farmer_id;
        delete body.created_at;

        const updateData = {
          ...body,
          updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
          .from('lands')
          .update(updateData)
          .eq('id', landId)
          .eq('tenant_id', tenantId)
          .eq('farmer_id', farmerId)
          .is('deleted_at', null)
          .select()
          .single();

        if (error) {
          console.error('Error updating land:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ error: 'Land not found or access denied' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ data, success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'DELETE': {
        // Soft delete (update is_active and set deleted_at)
        if (!landId) {
          return new Response(
            JSON.stringify({ error: 'Land ID is required for deletion' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('lands')
          .update({
            is_active: false,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', landId)
          .eq('tenant_id', tenantId)
          .eq('farmer_id', farmerId)
          .is('deleted_at', null)
          .select()
          .single();

        if (error) {
          console.error('Error deleting land:', error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!data) {
          return new Response(
            JSON.stringify({ error: 'Land not found or already deleted' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ data, success: true, message: 'Land deleted successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Method ${req.method} not allowed` }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message, 
        details: 'An unexpected error occurred while processing the request' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});