import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-farmer-id, x-tenant-id',
};

interface ClimateData {
  rainfall_24h: number;
  ndvi_value: number;
  temperature_avg: number;
}

interface TaskAdjustment {
  taskId: string;
  oldDate: string;
  newDate: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SECURITY: Extract tenant and farmer IDs from headers
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    // Log headers for monitoring (optional validation for background jobs)
    console.log('🔐 [Climate Monitor] Headers:', { tenantId, farmerId });

    const { scheduleId, climateData } = await req.json() as {
      scheduleId: string;
      climateData: ClimateData;
    };

    // Rate limiting: 500 requests per hour for climate monitoring
    const rateLimit = await checkRateLimit(scheduleId, 'ai-schedule-climate-monitor', { maxRequests: 500, windowMs: 3600000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded for climate monitoring.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json'
          } 
        }
      );
    }

    console.log('Climate monitoring for schedule:', scheduleId, climateData);

    // Record climate data
    const { error: climateError } = await supabase
      .from('schedule_climate_monitoring')
      .upsert({
        schedule_id: scheduleId,
        monitoring_date: new Date().toISOString().split('T')[0],
        rainfall_24h: climateData.rainfall_24h,
        ndvi_value: climateData.ndvi_value,
        temperature_avg: climateData.temperature_avg,
      });

    if (climateError) {
      console.error('Error recording climate data:', climateError);
    }

    // Get active tasks for this schedule
    const { data: tasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('status', 'pending')
      .gte('task_date', new Date().toISOString().split('T')[0]);

    if (tasksError) throw tasksError;

    const adjustments: TaskAdjustment[] = [];
    let adjustmentsMade = false;

    // Climate-adaptive logic
    for (const task of tasks || []) {
      let shouldAdjust = false;
      let adjustmentReason = '';
      let daysToDelay = 0;

      // Heavy rainfall check (>50mm in 24h)
      if (climateData.rainfall_24h > 50) {
        if (task.task_type === 'irrigation') {
          // Skip irrigation if heavy rain
          shouldAdjust = true;
          daysToDelay = 3;
          adjustmentReason = 'Heavy rainfall detected (>50mm). Irrigation postponed to allow soil drainage.';
        } else if (task.task_type === 'fertilizer' || task.task_type === 'pesticide') {
          // Delay fertilizer/pesticide due to rain
          shouldAdjust = true;
          daysToDelay = 2;
          adjustmentReason = `Heavy rainfall (${climateData.rainfall_24h}mm) can wash away ${task.task_type}. Task delayed.`;
        }
      }

      // NDVI-based crop health check
      if (climateData.ndvi_value < 0.3 && task.task_type === 'fertilizer') {
        // Low NDVI suggests poor crop health - prioritize fertilizer
        shouldAdjust = true;
        daysToDelay = -1; // Advance by 1 day
        adjustmentReason = `Low NDVI (${climateData.ndvi_value}) indicates crop stress. Fertilizer application advanced.`;
      } else if (climateData.ndvi_value > 0.7 && task.task_type === 'irrigation') {
        // High NDVI with good crop health - can delay irrigation
        shouldAdjust = true;
        daysToDelay = 1;
        adjustmentReason = `Healthy crop (NDVI: ${climateData.ndvi_value}). Irrigation can be delayed.`;
      }

      // Temperature-based adjustments
      if (climateData.temperature_avg > 35 && task.task_type === 'irrigation') {
        // High temperature - prioritize irrigation
        shouldAdjust = true;
        daysToDelay = -1;
        adjustmentReason = `High temperature (${climateData.temperature_avg}°C). Irrigation advanced to prevent heat stress.`;
      }

      // Apply adjustments
      if (shouldAdjust) {
        const currentDate = new Date(task.task_date);
        const newDate = new Date(currentDate);
        newDate.setDate(currentDate.getDate() + daysToDelay);

        const { error: updateError } = await supabase
          .from('schedule_tasks')
          .update({
            task_date: newDate.toISOString().split('T')[0],
            climate_adjusted: true,
            original_date_before_climate_adjust: task.task_date,
            climate_adjustment_reason: adjustmentReason,
          })
          .eq('id', task.id);

        if (!updateError) {
          adjustments.push({
            taskId: task.id,
            oldDate: task.task_date,
            newDate: newDate.toISOString().split('T')[0],
            reason: adjustmentReason,
          });
          adjustmentsMade = true;
        }
      }
    }

    // Update monitoring record with adjustment info
    if (adjustmentsMade) {
      await supabase
        .from('schedule_climate_monitoring')
        .update({
          adjustment_triggered: true,
          adjustment_reason: `Auto-adjusted ${adjustments.length} tasks based on climate data`,
          tasks_rescheduled: adjustments.length,
        })
        .eq('schedule_id', scheduleId)
        .eq('monitoring_date', new Date().toISOString().split('T')[0]);
    }

    return new Response(
      JSON.stringify({
        success: true,
        climateRecorded: true,
        adjustmentsMade,
        adjustments,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Climate monitoring error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});