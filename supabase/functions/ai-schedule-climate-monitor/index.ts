import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { ruralLanguageGuide } from '../_shared/ruralLanguageGuide.ts';

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
  reasonLocal: string; // Localized reason for notification
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

    const { scheduleId, climateData, language = 'mr' } = await req.json() as {
      scheduleId: string;
      climateData: ClimateData;
      language?: string;
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

    // Get rural language terms
    const ruralTerms = ruralLanguageGuide[language] || ruralLanguageGuide['mr'];

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

    // Get schedule and farmer info for notifications
    const { data: schedule } = await supabase
      .from('crop_schedules')
      .select('*, farmers(id, language)')
      .eq('id', scheduleId)
      .single();

    const farmerLanguage = schedule?.farmers?.language || language;

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

    // Climate-adaptive logic with localized reasons
    for (const task of tasks || []) {
      let shouldAdjust = false;
      let adjustmentReason = '';
      let adjustmentReasonLocal = '';
      let daysToDelay = 0;

      // Heavy rainfall check (>50mm in 24h)
      if (climateData.rainfall_24h > 50) {
        if (task.task_type === 'irrigation') {
          shouldAdjust = true;
          daysToDelay = 3;
          adjustmentReason = 'Heavy rainfall detected (>50mm). Irrigation postponed to allow soil drainage.';
          adjustmentReasonLocal = farmerLanguage === 'mr' 
            ? `जोरदार ${ruralTerms.rain} झाला (${climateData.rainfall_24h}mm). ${ruralTerms.irrigation} 3 दिवस पुढे ढकलले. जमीन सुकू द्या.`
            : `भारी ${ruralTerms.rain} हुई (${climateData.rainfall_24h}mm). ${ruralTerms.irrigation} 3 दिन टाला गया. मिट्टी सूखने दें.`;
        } else if (task.task_type === 'fertilizer' || task.task_type === 'pesticide' || task.task_type === 'pest_control') {
          shouldAdjust = true;
          daysToDelay = 2;
          adjustmentReason = `Heavy rainfall (${climateData.rainfall_24h}mm) can wash away ${task.task_type}. Task delayed.`;
          adjustmentReasonLocal = farmerLanguage === 'mr'
            ? `जोरदार ${ruralTerms.rain} मुळे ${task.task_type === 'fertilizer' ? ruralTerms.fertilizer : ruralTerms.pesticide} वाहून जाईल. 2 दिवस थांबा.`
            : `भारी ${ruralTerms.rain} से ${task.task_type === 'fertilizer' ? ruralTerms.fertilizer : ruralTerms.pesticide} बह जाएगी. 2 दिन रुकें.`;
        }
      }

      // NDVI-based crop health check
      if (climateData.ndvi_value < 0.3 && task.task_type === 'fertilizer') {
        shouldAdjust = true;
        daysToDelay = -1; // Advance by 1 day
        adjustmentReason = `Low NDVI (${climateData.ndvi_value}) indicates crop stress. Fertilizer application advanced.`;
        adjustmentReasonLocal = farmerLanguage === 'mr'
          ? `पीक कमजोर दिसतेय (NDVI: ${climateData.ndvi_value}). ${ruralTerms.fertilizer} 1 दिवस आधी करा. पिकाला ताण आहे.`
          : `फसल कमजोर लग रही है (NDVI: ${climateData.ndvi_value}). ${ruralTerms.fertilizer} 1 दिन पहले करें. फसल को तनाव है.`;
      } else if (climateData.ndvi_value > 0.7 && task.task_type === 'irrigation') {
        shouldAdjust = true;
        daysToDelay = 1;
        adjustmentReasonLocal = farmerLanguage === 'mr'
          ? `पीक चांगले आहे (NDVI: ${climateData.ndvi_value}). ${ruralTerms.irrigation} 1 दिवस उशीरा करू शकता.`
          : `फसल अच्छी है (NDVI: ${climateData.ndvi_value}). ${ruralTerms.irrigation} 1 दिन देर से कर सकते हैं.`;
        adjustmentReason = `Healthy crop (NDVI: ${climateData.ndvi_value}). Irrigation can be delayed.`;
      }

      // Temperature-based adjustments
      if (climateData.temperature_avg > 35 && task.task_type === 'irrigation') {
        shouldAdjust = true;
        daysToDelay = -1;
        adjustmentReason = `High temperature (${climateData.temperature_avg}°C). Irrigation advanced to prevent heat stress.`;
        adjustmentReasonLocal = farmerLanguage === 'mr'
          ? `खूप ${ruralTerms.hot} आहे (${climateData.temperature_avg}°C). ${ruralTerms.irrigation} आधी करा, नाहीतर पीक जळेल.`
          : `बहुत ${ruralTerms.hot} है (${climateData.temperature_avg}°C). ${ruralTerms.irrigation} जल्दी करें, वरना फसल जल जाएगी.`;
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
            reasonLocal: adjustmentReasonLocal,
          });
          adjustmentsMade = true;

          // Create notification for climate adjustment
          const notificationTitle = farmerLanguage === 'mr'
            ? `⚠️ वेळापत्रक बदल: ${task.task_name}`
            : `⚠️ शेड्यूल बदला: ${task.task_name}`;
          
          const notificationBody = adjustmentReasonLocal;

          await supabase.from('alert_notifications').insert({
            tenant_id: schedule?.tenant_id,
            farmer_id: schedule?.farmer_id,
            land_id: schedule?.land_id,
            alert_type: 'climate_adjustment',
            title: notificationTitle,
            message: notificationBody,
            priority: 'high',
            data: {
              task_id: task.id,
              task_name: task.task_name,
              old_date: task.task_date,
              new_date: newDate.toISOString().split('T')[0],
              reason: adjustmentReason,
              climate_data: climateData,
            },
          });

          console.log(`📱 Notification created for task adjustment: ${task.task_name}`);
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
      
      console.log(`✅ Climate monitoring: ${adjustments.length} tasks adjusted for schedule ${scheduleId}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        climateRecorded: true,
        adjustmentsMade,
        adjustments,
        language: farmerLanguage,
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
