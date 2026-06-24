import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';
import { loadVarietyProfile } from '../_shared/variety-context.ts';
import { loadResistanceMap, resolveLandVarietyId } from '../_shared/variety-resistance.ts';
import { runHarvestEngine } from './harvest-engine.ts';

// Minimal projection of variety fields for client consumption.
const VARIETY_SELECT =
  'id, name, name_local, variety_code, maturity_days_min, maturity_days_max, ' +
  'yield_potential_qtl_per_acre, water_demand_mm_per_season, irrigation_sensitivity, ' +
  'climate_suitability, soil_suitability, agro_ecological_suitability, ' +
  'variety_completeness_score';

async function fetchVarietySummary(supabase: any, varietyId: string | null | undefined) {
  if (!varietyId) return null;
  const { data, error } = await supabase
    .from('master_products')
    .select(VARIETY_SELECT)
    .eq('id', varietyId)
    .eq('product_type', 'seed')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ─────────────────────────────────────────────────────────────────
    // Cron action: harvest-engine
    // Same auth pattern as proactive-evaluator (anon Bearer from pg_cron).
    // Idempotent service-role sweep; returns only aggregate counts.
    // ─────────────────────────────────────────────────────────────────
    {
      const earlyUrl = new URL(req.url);
      if (earlyUrl.searchParams.get('action') === 'harvest-engine') {
        const summary = await runHarvestEngine(supabase);
        return new Response(JSON.stringify(summary), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }


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

    // ─────────────────────────────────────────────────────────────────
    // Farmer-facing harvest confirmation endpoints (Step 3)
    //   POST ?action=harvest-pending  → list open requests
    //   POST ?action=harvest-confirm  → confirm (full/partial/abandoned)
    //   POST ?action=harvest-snooze   → push due_at out by N days
    // Tenant/farmer scoping is inherited from the headers already
    // validated above (farmer→tenant association guard).
    // ─────────────────────────────────────────────────────────────────
    {
      const harvestUrl = new URL(req.url);
      const harvestAction = harvestUrl.searchParams.get('action');
      const harvestActions = new Set(['harvest-pending', 'harvest-confirm', 'harvest-snooze']);

      if (harvestAction && harvestActions.has(harvestAction)) {
        if (req.method !== 'POST' && harvestAction !== 'harvest-pending') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed for this action' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // ── LIST PENDING ──────────────────────────────────────────────
        if (harvestAction === 'harvest-pending') {
          const { data, error } = await supabase
            .from('harvest_confirmation_requests')
            .select(`
              id, schedule_id, land_id, due_at, reminder_count, last_reminded_at, triggered_at, status,
              crop_schedules:schedule_id ( id, crop_name, crop_variety, sowing_date, expected_harvest_date, harvest_status ),
              lands:land_id ( id, name, area_acres )
            `)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('status', 'PENDING')
            .order('due_at', { ascending: true })
            .limit(50);

          if (error) {
            return new Response(
              JSON.stringify({ error: 'Failed to load pending harvests', details: error.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({ data: data || [] }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Parse JSON body for the two write actions
        let body: any = {};
        try { body = await req.json(); } catch (_) { /* empty body */ }

        // ── CONFIRM ───────────────────────────────────────────────────
        if (harvestAction === 'harvest-confirm') {
          const VALID_OUTCOMES = new Set(['FULLY_HARVESTED', 'PARTIALLY_HARVESTED', 'ABANDONED']);
          const scheduleIdIn = String(body?.schedule_id || '').trim();
          const outcome = String(body?.outcome || '').trim();
          const actualDateRaw = body?.actual_harvest_date ? String(body.actual_harvest_date) : null;
          const yieldQtl = body?.yield_qtl != null ? Number(body.yield_qtl) : null;
          const notes = body?.notes ? String(body.notes).slice(0, 2000) : null;

          if (!scheduleIdIn || !VALID_OUTCOMES.has(outcome)) {
            return new Response(
              JSON.stringify({ error: 'Invalid payload', details: 'schedule_id and a valid outcome are required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (outcome !== 'ABANDONED' && !actualDateRaw) {
            return new Response(
              JSON.stringify({ error: 'actual_harvest_date is required for harvest outcomes' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Ownership + bounds check
          const { data: sched, error: schedErr } = await supabase
            .from('crop_schedules')
            .select('id, tenant_id, farmer_id, sowing_date, expected_harvest_date, harvest_status, is_active')
            .eq('id', scheduleIdIn)
            .maybeSingle();
          if (schedErr || !sched) {
            return new Response(
              JSON.stringify({ error: 'Schedule not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          if (sched.tenant_id !== tenantId || sched.farmer_id !== farmerId) {
            return new Response(
              JSON.stringify({ error: 'Forbidden' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const todayStr = new Date().toISOString().slice(0, 10);
          let actualDate = actualDateRaw;
          if (actualDate) {
            if (actualDate > todayStr) {
              return new Response(
                JSON.stringify({ error: 'actual_harvest_date cannot be in the future' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            if (sched.sowing_date && actualDate < sched.sowing_date) {
              return new Response(
                JSON.stringify({ error: 'actual_harvest_date cannot be before sowing date' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          const harvestResponse = {
            source: 'manual',
            outcome,
            yield_qtl: yieldQtl,
            notes,
            confirmed_at: new Date().toISOString(),
          };

          // Trigger fn_cascade_harvest_completion runs for FULLY_HARVESTED + ABANDONED
          // (releases land, closes request, writes audit). PARTIALLY_HARVESTED keeps
          // the schedule active so the farmer can confirm subsequent passes.
          const update: any = {
            harvest_status: outcome,
            harvest_confirmed_by: farmerId,
            harvest_response: harvestResponse,
          };
          if (outcome !== 'ABANDONED' && actualDate) update.actual_harvest_date = actualDate;

          const { error: updErr } = await supabase
            .from('crop_schedules')
            .update(update)
            .eq('id', sched.id)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId);
          if (updErr) {
            return new Response(
              JSON.stringify({ error: 'Failed to confirm harvest', details: updErr.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // For PARTIAL the trigger does not close the request — do it here.
          if (outcome === 'PARTIALLY_HARVESTED') {
            await supabase
              .from('harvest_confirmation_requests')
              .update({
                status: 'RESPONDED',
                response: 'PARTIALLY_HARVESTED',
                responded_at: new Date().toISOString(),
                response_payload: harvestResponse,
              })
              .eq('schedule_id', sched.id)
              .eq('status', 'PENDING');

            await supabase.from('crop_lifecycle_events').insert({
              tenant_id: tenantId, farmer_id: farmerId, schedule_id: sched.id,
              event_type: 'HARVEST_PARTIAL_CONFIRMED',
              from_status: String(sched.harvest_status || 'NOT_STARTED'),
              to_status: 'PARTIALLY_HARVESTED',
              payload: harvestResponse,
              actor: farmerId,
            });
          }

          // Mark related farmer_alerts as actioned (best effort)
          await supabase
            .from('farmer_alerts')
            .update({ is_actioned: true, actioned_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('schedule_id', sched.id)
            .in('alert_type', ['HARVEST_READY', 'HARVEST_REMINDER']);

          return new Response(
            JSON.stringify({ ok: true, schedule_id: sched.id, outcome }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // ── SNOOZE ────────────────────────────────────────────────────
        if (harvestAction === 'harvest-snooze') {
          const requestIdIn = String(body?.request_id || '').trim();
          const days = Math.min(Math.max(parseInt(String(body?.days ?? 7), 10) || 7, 1), 30);
          if (!requestIdIn) {
            return new Response(
              JSON.stringify({ error: 'request_id is required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const newDue = new Date(Date.now() + days * 86400_000).toISOString();
          const { error: snoozeErr } = await supabase
            .from('harvest_confirmation_requests')
            .update({ due_at: newDue })
            .eq('id', requestIdIn)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .eq('status', 'PENDING');
          if (snoozeErr) {
            return new Response(
              JSON.stringify({ error: 'Failed to snooze', details: snoozeErr.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({ ok: true, request_id: requestIdIn, due_at: newDue }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
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
    const actionParam = url.searchParams.get('action');

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
        // ─── action=variety-context&land_id=… ──────────────────────────
        // Resolves the planted variety for a land (lands → active schedule
        // fallback), returns the full master_products variety summary and
        // a resistance list. Used by the chat orchestrator + frontend.
        if (actionParam === 'variety-context') {
          const landId = landIdParam || url.searchParams.get('landId');
          if (!landId) {
            return new Response(
              JSON.stringify({ error: 'land_id is required' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const { data: landRow } = await supabase
            .from('lands')
            .select('id, current_crop, current_crop_variety_id, state, soil_type')
            .eq('id', landId)
            .eq('tenant_id', tenantId)
            .eq('farmer_id', farmerId)
            .maybeSingle();
          if (!landRow) {
            return new Response(
              JSON.stringify({ error: 'Land not found' }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const varietyId = landRow.current_crop_variety_id
            || await resolveLandVarietyId(supabase, landId);
          const [variety, resistance, profile] = await Promise.all([
            fetchVarietySummary(supabase, varietyId),
            loadResistanceMap(supabase, varietyId).then(m => Array.from(m.values())),
            varietyId
              ? loadVarietyProfile(supabase, {
                  cropName: landRow.current_crop || '',
                  stateName: landRow.state || null,
                  landVarietyId: varietyId,
                }).catch(() => null)
              : Promise.resolve(null),
          ]);
          return new Response(
            JSON.stringify({
              data: {
                land_id: landId,
                variety_id: varietyId,
                variety,
                resistance,
                profile,
              },
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

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

          // Attach variety summary so the client can render variety-aware UI
          // without a second round-trip. variety_id may live on the schedule
          // row or be inherited from the land.
          const varietyId = (data as any)?.variety_id
            ?? await resolveLandVarietyId(supabase, (data as any)?.land_id).catch(() => null);
          const variety = await fetchVarietySummary(supabase, varietyId);
          return new Response(
            JSON.stringify({ data: { ...data, variety_id: varietyId, variety } }),
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
