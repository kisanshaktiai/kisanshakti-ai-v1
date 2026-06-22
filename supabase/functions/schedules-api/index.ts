import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Extract tenant and farmer IDs from headers
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    if (!tenantId || !farmerId) {
      console.error('❌ [SchedulesAPI] Missing required headers:', { tenantId, farmerId });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required headers',
          details: 'x-tenant-id and x-farmer-id headers are required'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─────────────────────────────────────────────────────────────────
    // Tenant-Farmer Association Guard (F7 hardening)
    // Verify the claimed farmer actually belongs to the claimed tenant.
    // Prevents anon-key holders from spoofing arbitrary farmer IDs.
    // ─────────────────────────────────────────────────────────────────
    const { data: farmerRow, error: farmerErr } = await supabase
      .from('farmers')
      .select('id, tenant_id')
      .eq('id', farmerId)
      .maybeSingle();

    if (farmerErr || !farmerRow) {
      console.warn('🚫 [SchedulesAPI] Farmer lookup failed:', { farmerId, error: farmerErr?.message });
      return new Response(
        JSON.stringify({ error: 'Forbidden', details: 'Invalid farmer context' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (farmerRow.tenant_id !== tenantId) {
      console.warn('🚫 [SchedulesAPI] Tenant mismatch:', {
        claimed_tenant: tenantId,
        actual_tenant: farmerRow.tenant_id,
        farmer_id: farmerId,
      });
      return new Response(
        JSON.stringify({ error: 'Forbidden', details: 'Farmer does not belong to claimed tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse URL to get path segments
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const lastPart = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;
    
    // Check if this is a /tasks route
    const isTasksRoute = lastPart === 'tasks';
    const scheduleId = (lastPart && lastPart !== 'schedules-api' && !isTasksRoute) ? lastPart : null;
    const landIdParam = url.searchParams.get('land_id');
    const scheduleIdParam = url.searchParams.get('schedule_id');

    // PHASE 3A: Optional incremental + pagination params (backward-compatible)
    const sinceParam = url.searchParams.get('since'); // ISO8601 timestamp
    const limitParam = url.searchParams.get('limit');
    const cursorParam = url.searchParams.get('cursor'); // ISO8601 of last seen updated_at
    const parsedLimit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 500) : null;

    console.log(`📅 [SchedulesAPI] ${req.method} request:`, { 
      isTasksRoute,
      scheduleId, 
      scheduleIdParam,
      landIdParam, 
      tenantId, 
      farmerId,
      sinceParam,
      parsedLimit,
      cursorParam,
    });

    // Try to set app session context
    try {
      await supabase.rpc('set_app_session', {
        p_tenant_id: tenantId,
        p_user_id: farmerId
      });
    } catch (rpcError) {
      console.warn('⚠️ [SchedulesAPI] set_app_session RPC not available:', rpcError);
    }

    switch (req.method) {
      case 'GET': {
        // Handle /tasks route
        if (isTasksRoute) {
          console.log('📋 [SchedulesAPI] Fetching tasks:', { scheduleIdParam, sinceParam, parsedLimit, cursorParam });
          
          const isDeltaMode = Boolean(sinceParam || cursorParam || parsedLimit);
          let query = supabase
            .from('schedule_tasks')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            // Delta/pagination requires updated_at ordering; legacy callers keep task_date order.
            .order(isDeltaMode ? 'updated_at' : 'task_date', { ascending: true });

          if (scheduleIdParam) {
            query = query.eq('schedule_id', scheduleIdParam);
          }
          if (sinceParam) {
            query = query.gt('updated_at', sinceParam);
          }
          if (cursorParam) {
            query = query.gt('updated_at', cursorParam);
          }
          if (parsedLimit) {
            query = query.limit(parsedLimit);
          }

          const { data, error } = await query;

          if (error) {
            console.error('❌ [SchedulesAPI] Error fetching tasks:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to fetch tasks', details: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const nextCursor = parsedLimit && data && data.length === parsedLimit
            ? (data[data.length - 1] as any)?.updated_at ?? null
            : null;

          console.log(`✅ [SchedulesAPI] Fetched ${data?.length || 0} tasks (delta=${isDeltaMode})`);
          return new Response(
            JSON.stringify({ data: data || [], next_cursor: nextCursor }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        if (scheduleId) {
          // Get single schedule
          console.log('📅 [SchedulesAPI] Fetching schedule by ID:', scheduleId);
          const { data, error } = await supabase
            .from('crop_schedules')
            .select('*')
            .eq('id', scheduleId)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .single();

          if (error) {
            console.error('❌ [SchedulesAPI] Error fetching schedule:', error);
            return new Response(
              JSON.stringify({ error: 'Schedule not found', details: error.message }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ data }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // List schedules
          console.log('📅 [SchedulesAPI] Fetching schedules list', { sinceParam, parsedLimit });
          let query = supabase
            .from('crop_schedules')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

          if (landIdParam) {
            query = query.eq('land_id', landIdParam);
          }
          // PHASE 3A: Optional incremental delta sync
          if (sinceParam) {
            query = query.gt('updated_at', sinceParam);
          }
          if (parsedLimit) {
            query = query.limit(parsedLimit);
          }

          const { data, error } = await query;

          if (error) {
            console.error('❌ [SchedulesAPI] Error fetching schedules:', error);
            return new Response(
              JSON.stringify({ error: 'Failed to fetch schedules', details: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log(`✅ [SchedulesAPI] Fetched ${data?.length || 0} schedules (since=${sinceParam || 'none'})`);
          return new Response(
            JSON.stringify({ data: data || [] }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      case 'DELETE': {
        if (!scheduleId || scheduleId === 'schedules-api') {
          return new Response(
            JSON.stringify({ error: 'Schedule ID is required for deletion' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('🗑️ [SchedulesAPI] Deleting schedule:', scheduleId);
        
        // Soft delete by setting is_active to false
        const { error } = await supabase
          .from('crop_schedules')
          .update({ 
            is_active: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', scheduleId)
          .eq('tenant_id', tenantId)
          .eq('farmer_id', farmerId);

        if (error) {
          console.error('❌ [SchedulesAPI] Error deleting schedule:', error);
          return new Response(
            JSON.stringify({ error: 'Failed to delete schedule', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('✅ [SchedulesAPI] Schedule deleted (soft):', scheduleId);
        return new Response(
          JSON.stringify({ success: true }),
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
    console.error('❌ [SchedulesAPI] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
