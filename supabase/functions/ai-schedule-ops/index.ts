import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { ruralLanguageGuide } from '../_shared/ruralLanguageGuide.ts';
import { corsHeaders } from '../_shared/cors.ts';

// ============================================================================
// UNIFIED AI SCHEDULE OPERATIONS FUNCTION
// Combines: ai-schedule-monitor, ai-schedule-climate-monitor, ai-weather-schedule-sync
// ============================================================================

// Weather condition mappings for task adjustments (from ai-weather-schedule-sync)
const WEATHER_TASK_IMPACTS: Record<string, { 
  affectedCategories: string[]; 
  action: 'postpone' | 'advance' | 'skip';
  daysShift: number;
  reason: Record<string, string>;
}> = {
  heavy_rain: {
    affectedCategories: ['sowing', 'fertilizer', 'pest_control', 'disease_control', 'harvest'],
    action: 'postpone',
    daysShift: 2,
    reason: { hi: 'भारी बारिश के कारण', mr: 'जोरदार पावसामुळे', en: 'Due to heavy rain' },
  },
  continuous_rain: {
    affectedCategories: ['fertilizer', 'pest_control', 'harvest', 'post_harvest'],
    action: 'postpone',
    daysShift: 3,
    reason: { hi: 'लगातार बारिश के कारण', mr: 'सतत पावसामुळे', en: 'Due to continuous rain' },
  },
  extreme_heat: {
    affectedCategories: ['transplanting', 'sowing'],
    action: 'postpone',
    daysShift: 1,
    reason: { hi: 'अत्यधिक गर्मी के कारण', mr: 'अत्यंत उष्णतेमुळे', en: 'Due to extreme heat' },
  },
  frost: {
    affectedCategories: ['sowing', 'transplanting', 'growth_promoter'],
    action: 'postpone',
    daysShift: 2,
    reason: { hi: 'पाले के कारण', mr: 'दव/थंडीमुळे', en: 'Due to frost' },
  },
  high_wind: {
    affectedCategories: ['pest_control', 'disease_control', 'growth_promoter'],
    action: 'postpone',
    daysShift: 1,
    reason: { hi: 'तेज हवा के कारण', mr: 'वादळी वाऱ्यामुळे', en: 'Due to high wind' },
  },
  ideal_spray: {
    affectedCategories: ['pest_control', 'disease_control', 'growth_promoter'],
    action: 'advance',
    daysShift: -1,
    reason: { hi: 'छिड़काव के लिए आदर्श मौसम', mr: 'फवारणीसाठी आदर्श हवामान', en: 'Ideal weather for spraying' },
  },
};

// Detect weather conditions from forecast
function detectWeatherCondition(weather: any): string[] {
  const conditions: string[] = [];
  if (weather.rain_mm > 30) conditions.push('heavy_rain');
  if (weather.rain_mm > 10 && weather.consecutive_rain_days >= 2) conditions.push('continuous_rain');
  if (weather.temp_max > 42) conditions.push('extreme_heat');
  if (weather.temp_min < 5) conditions.push('frost');
  if (weather.wind_speed > 25) conditions.push('high_wind');
  if (weather.rain_mm === 0 && weather.wind_speed < 10 && weather.humidity > 60) conditions.push('ideal_spray');
  return conditions;
}

// Fetch weather for location
async function fetchWeatherForLocation(lat: number, lon: number): Promise<any> {
  const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
  if (!OPENWEATHER_API_KEY) {
    console.warn("OpenWeather API key not configured, using mock data");
    return {
      rain_mm: 0, temp_max: 32, temp_min: 22, humidity: 65,
      wind_speed: 8, consecutive_rain_days: 0, forecast_days: [],
    };
  }
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );
    if (!response.ok) return null;
    const data = await response.json();
    const today = data.list?.[0];
    return {
      rain_mm: today?.rain?.['3h'] || 0,
      temp_max: today?.main?.temp_max || 30,
      temp_min: today?.main?.temp_min || 20,
      humidity: today?.main?.humidity || 60,
      wind_speed: (today?.wind?.speed || 0) * 3.6,
      consecutive_rain_days: 0,
      forecast_days: data.list?.slice(0, 8) || [],
    };
  } catch (error) {
    console.error("Weather fetch error:", error);
    return null;
  }
}

// ============================================================================
// ACTION: monitor - AI-based schedule monitoring (from ai-schedule-monitor)
// ============================================================================
async function handleMonitor(req: Request, supabase: any, tenantId: string | null) {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const clientIp = req.headers.get('x-forwarded-for') || 'monitor-service';
  const rateLimit = await checkRateLimit(clientIp, 'ai-schedule-ops-monitor', { maxRequests: 10, windowMs: 3600000 });
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', resetTime: new Date(rateLimit.resetTime).toISOString() }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let scheduleQuery = supabase
    .from('crop_schedules')
    .select('*, lands(*)')
    .eq('is_active', true)
    .gte('harvest_date', new Date().toISOString().split('T')[0]);
  
  if (tenantId) scheduleQuery = scheduleQuery.eq('tenant_id', tenantId);
  
  const { data: activeSchedules } = await scheduleQuery;
  if (!activeSchedules || activeSchedules.length === 0) {
    return new Response(
      JSON.stringify({ message: 'No active schedules to monitor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`📊 [Monitor] Analyzing ${activeSchedules.length} active schedules`);
  const results = [];

  for (const schedule of activeSchedules) {
    try {
      // Fetch weather
      const weatherResponse = await fetch(
        `https://qfklkkzxemsbeniyugiz.supabase.co/functions/v1/weather?lat=${schedule.lands?.latitude}&lng=${schedule.lands?.longitude}`
      );
      const weather = weatherResponse.ok ? await weatherResponse.json() : null;

      // Fetch latest NDVI
      const { data: latestNdvi } = await supabase
        .from('ndvi_cache')
        .select('*')
        .eq('land_id', schedule.land_id)
        .order('cached_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Fetch land soil data
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', schedule.land_id)
        .single();

      const systemPrompt = `You are an AI agricultural monitoring system for KisanShakti AI.
Analyze current crop conditions and generate:
1. Schedule refinements if conditions have changed significantly
2. Urgent alerts for farmers if action is needed
3. Predictive insights about upcoming needs
Be proactive, precise, and always explain your reasoning.`;

      const userPrompt = `Analyze conditions for:
**SCHEDULE:** Crop: ${schedule.crop_name} ${schedule.crop_variety || ''}, Sowing: ${schedule.sowing_date}, Days: ${Math.floor((Date.now() - new Date(schedule.sowing_date).getTime()) / 86400000)}
**CONDITIONS:** Weather: ${JSON.stringify(weather?.current || {})}, NDVI: ${latestNdvi?.ndvi_value || 'N/A'}, Soil pH: ${land?.soil_ph || 'Unknown'}

Return JSON: {"health_score":0-100,"refinements":[{"type":"string","severity":"low|medium|high|critical","reason":"string","recommended_action":"string","original_date":"YYYY-MM-DD|null","new_date":"YYYY-MM-DD|null"}],"alerts":[{"type":"string","priority":"low|medium|high|critical","title":"string","message":"string","action_required":"string","expires_in_hours":number}],"predictions":{"upcoming_needs":[],"estimated_costs":number,"optimal_timing":"string"}}`;

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          response_format: { type: 'json_object' },
          max_completion_tokens: 2048,
        }),
      });

      if (!aiResponse.ok) {
        console.error(`OpenAI error for schedule ${schedule.id}:`, aiResponse.status);
        continue;
      }

      const aiData = await aiResponse.json();
      const analysis = JSON.parse(aiData.choices[0].message.content);

      // Save monitoring data
      await supabase.from('schedule_monitoring').insert({
        schedule_id: schedule.id,
        tenant_id: schedule.tenant_id,
        farmer_id: schedule.farmer_id,
        land_id: schedule.land_id,
        check_date: new Date().toISOString().split('T')[0],
        weather_conditions: weather?.current,
        ndvi_value: latestNdvi?.ndvi_value,
        soil_ph: land?.soil_ph,
        npk_levels: { n: land?.nitrogen, p: land?.phosphorus, k: land?.potassium },
        health_score: analysis.health_score,
        alerts_generated: analysis.alerts?.length || 0,
        refinements_applied: 0,
      });

      // Save refinements
      if (analysis.refinements?.length > 0) {
        const refinements = analysis.refinements.map((r: any) => ({
          schedule_id: schedule.id, tenant_id: schedule.tenant_id, farmer_id: schedule.farmer_id,
          land_id: schedule.land_id, refinement_type: r.type, trigger_data: { weather, ndvi: latestNdvi },
          ai_reasoning: r.reason, recommended_action: r.recommended_action,
          original_date: r.original_date, new_date: r.new_date, severity: r.severity, status: 'pending',
        }));
        await supabase.from('ai_schedule_refinements').insert(refinements);
      }

      // Save alerts
      if (analysis.alerts?.length > 0) {
        const alerts = analysis.alerts.map((a: any) => ({
          tenant_id: schedule.tenant_id, farmer_id: schedule.farmer_id, land_id: schedule.land_id,
          schedule_id: schedule.id, alert_type: a.type, priority: a.priority, title: a.title,
          message: a.message, ai_reasoning: analysis.health_score < 70 ? 'Health score below threshold' : 'Proactive monitoring',
          action_required: a.action_required, data_source: { weather, ndvi: latestNdvi },
          expires_at: new Date(Date.now() + (a.expires_in_hours || 72) * 3600000).toISOString(),
        }));
        await supabase.from('farmer_alerts').insert(alerts);
      }

      // Log decision
      await supabase.from('ai_decision_log').insert({
        tenant_id: schedule.tenant_id, farmer_id: schedule.farmer_id, land_id: schedule.land_id,
        schedule_id: schedule.id, decision_type: 'schedule_refinement', model_version: 'openai/gpt-4o-mini',
        input_data: { schedule_id: schedule.id, days_since_sowing: Math.floor((Date.now() - new Date(schedule.sowing_date).getTime()) / 86400000) },
        output_data: analysis, reasoning: `Health: ${analysis.health_score}/100`,
        confidence_score: analysis.health_score / 100, weather_data: weather, ndvi_data: latestNdvi,
        soil_data: { ph: land?.soil_ph }, success: true,
      });

      results.push({
        schedule_id: schedule.id, crop: schedule.crop_name, health_score: analysis.health_score,
        alerts: analysis.alerts?.length || 0, refinements: analysis.refinements?.length || 0,
      });
    } catch (scheduleError) {
      console.error(`Error monitoring schedule ${schedule.id}:`, scheduleError);
    }
  }

  return new Response(
    JSON.stringify({ success: true, monitored: results.length, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============================================================================
// ACTION: climate - Climate-based task adjustments (from ai-schedule-climate-monitor)
// ============================================================================
interface ClimateData {
  rainfall_24h: number;
  ndvi_value: number;
  temperature_avg: number;
}

async function handleClimate(req: Request, supabase: any, tenantId: string | null, farmerId: string | null) {
  const { scheduleId, climateData, language = 'mr' } = await req.json() as {
    scheduleId: string;
    climateData: ClimateData;
    language?: string;
  };

  const rateLimit = await checkRateLimit(scheduleId, 'ai-schedule-ops-climate', { maxRequests: 500, windowMs: 3600000 });
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded', resetTime: new Date(rateLimit.resetTime).toISOString() }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('🌦️ [Climate] Monitoring for schedule:', scheduleId, climateData);

  const ruralTerms = ruralLanguageGuide[language] || ruralLanguageGuide['mr'];

  // Record climate data
  await supabase.from('schedule_climate_monitoring').upsert({
    schedule_id: scheduleId,
    monitoring_date: new Date().toISOString().split('T')[0],
    rainfall_24h: climateData.rainfall_24h,
    ndvi_value: climateData.ndvi_value,
    temperature_avg: climateData.temperature_avg,
  });

  // Get schedule and farmer info
  const { data: schedule } = await supabase
    .from('crop_schedules')
    .select('*, farmers(id, language)')
    .eq('id', scheduleId)
    .single();

  const farmerLanguage = schedule?.farmers?.language || language;

  // Get active tasks
  const { data: tasks } = await supabase
    .from('schedule_tasks')
    .select('*')
    .eq('schedule_id', scheduleId)
    .eq('status', 'pending')
    .gte('task_date', new Date().toISOString().split('T')[0]);

  const adjustments: any[] = [];

  for (const task of tasks || []) {
    let shouldAdjust = false;
    let adjustmentReason = '';
    let adjustmentReasonLocal = '';
    let daysToDelay = 0;

    // Heavy rainfall check
    if (climateData.rainfall_24h > 50) {
      if (task.task_type === 'irrigation') {
        shouldAdjust = true;
        daysToDelay = 3;
        adjustmentReason = 'Heavy rainfall detected (>50mm). Irrigation postponed.';
        adjustmentReasonLocal = farmerLanguage === 'mr' 
          ? `जोरदार ${ruralTerms.rain} झाला. ${ruralTerms.irrigation} 3 दिवस पुढे.`
          : `भारी ${ruralTerms.rain} हुई. ${ruralTerms.irrigation} 3 दिन टाला.`;
      } else if (['fertilizer', 'pesticide', 'pest_control'].includes(task.task_type)) {
        shouldAdjust = true;
        daysToDelay = 2;
        adjustmentReason = `Heavy rainfall can wash away ${task.task_type}. Task delayed.`;
        adjustmentReasonLocal = farmerLanguage === 'mr'
          ? `जोरदार ${ruralTerms.rain} मुळे ${task.task_type === 'fertilizer' ? ruralTerms.fertilizer : ruralTerms.pesticide} वाहून जाईल.`
          : `भारी ${ruralTerms.rain} से ${task.task_type === 'fertilizer' ? ruralTerms.fertilizer : ruralTerms.pesticide} बह जाएगी.`;
      }
    }

    // NDVI-based check
    if (climateData.ndvi_value < 0.3 && task.task_type === 'fertilizer') {
      shouldAdjust = true;
      daysToDelay = -1;
      adjustmentReason = `Low NDVI (${climateData.ndvi_value}) indicates crop stress.`;
      adjustmentReasonLocal = farmerLanguage === 'mr'
        ? `पीक कमजोर (NDVI: ${climateData.ndvi_value}). ${ruralTerms.fertilizer} आधी करा.`
        : `फसल कमजोर (NDVI: ${climateData.ndvi_value}). ${ruralTerms.fertilizer} जल्दी करें.`;
    } else if (climateData.ndvi_value > 0.7 && task.task_type === 'irrigation') {
      shouldAdjust = true;
      daysToDelay = 1;
      adjustmentReason = `Healthy crop (NDVI: ${climateData.ndvi_value}). Irrigation can be delayed.`;
      adjustmentReasonLocal = farmerLanguage === 'mr'
        ? `पीक चांगले (NDVI: ${climateData.ndvi_value}). ${ruralTerms.irrigation} उशीरा करू शकता.`
        : `फसल अच्छी (NDVI: ${climateData.ndvi_value}). ${ruralTerms.irrigation} देर से कर सकते हैं.`;
    }

    // Temperature-based check
    if (climateData.temperature_avg > 35 && task.task_type === 'irrigation') {
      shouldAdjust = true;
      daysToDelay = -1;
      adjustmentReason = `High temperature (${climateData.temperature_avg}°C). Irrigation advanced.`;
      adjustmentReasonLocal = farmerLanguage === 'mr'
        ? `खूप ${ruralTerms.hot} (${climateData.temperature_avg}°C). ${ruralTerms.irrigation} आधी करा.`
        : `बहुत ${ruralTerms.hot} (${climateData.temperature_avg}°C). ${ruralTerms.irrigation} जल्दी करें.`;
    }

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
          taskId: task.id, oldDate: task.task_date, newDate: newDate.toISOString().split('T')[0],
          reason: adjustmentReason, reasonLocal: adjustmentReasonLocal,
        });

        // Create notification
        await supabase.from('alert_notifications').insert({
          tenant_id: schedule?.tenant_id, farmer_id: schedule?.farmer_id, land_id: schedule?.land_id,
          alert_type: 'climate_adjustment',
          title: farmerLanguage === 'mr' ? `⚠️ वेळापत्रक बदल: ${task.task_name}` : `⚠️ शेड्यूल बदला: ${task.task_name}`,
          message: adjustmentReasonLocal,
          priority: 'high',
          data: { task_id: task.id, task_name: task.task_name, old_date: task.task_date, new_date: newDate.toISOString().split('T')[0], climate_data: climateData },
        });
      }
    }
  }

  if (adjustments.length > 0) {
    await supabase.from('schedule_climate_monitoring').update({
      adjustment_triggered: true,
      adjustment_reason: `Auto-adjusted ${adjustments.length} tasks`,
      tasks_rescheduled: adjustments.length,
    }).eq('schedule_id', scheduleId).eq('monitoring_date', new Date().toISOString().split('T')[0]);
  }

  return new Response(
    JSON.stringify({ success: true, climateRecorded: true, adjustmentsMade: adjustments.length > 0, adjustments, language: farmerLanguage }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ============================================================================
// ACTION: weather-sync - Weather-based schedule sync (from ai-weather-schedule-sync)
// ============================================================================
async function handleWeatherSync(supabase: any) {
  console.log("🌦️ [Weather-Sync] Starting schedule weather sync...");
  const startTime = Date.now();

  const { data: activeSchedules, error: schedulesError } = await supabase
    .from("crop_schedules")
    .select(`id, farmer_id, tenant_id, crop_name, sowing_date, generation_language, weather_auto_update_enabled, last_weather_check, lands!inner(id, name, latitude, longitude)`)
    .eq("is_active", true)
    .eq("weather_auto_update_enabled", true);

  if (schedulesError) throw schedulesError;

  console.log(`📋 [Weather-Sync] Found ${activeSchedules?.length || 0} active schedules`);

  let updatedCount = 0;
  let notificationsCreated = 0;

  for (const schedule of activeSchedules || []) {
    const land = schedule.lands;
    if (!land?.latitude || !land?.longitude) continue;

    const weather = await fetchWeatherForLocation(land.latitude, land.longitude);
    if (!weather) continue;

    const conditions = detectWeatherCondition(weather);
    if (conditions.length === 0) {
      await supabase.from("crop_schedules").update({ last_weather_check: new Date().toISOString() }).eq("id", schedule.id);
      continue;
    }

    console.log(`🌧️ [Weather] Schedule ${schedule.id}: ${conditions.join(', ')}`);

    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const { data: upcomingTasks } = await supabase
      .from("schedule_tasks")
      .select("*")
      .eq("schedule_id", schedule.id)
      .eq("status", "pending")
      .gte("task_date", today.toISOString().split("T")[0])
      .lte("task_date", nextWeek.toISOString().split("T")[0]);

    if (!upcomingTasks?.length) continue;

    for (const task of upcomingTasks) {
      for (const condition of conditions) {
        const impact = WEATHER_TASK_IMPACTS[condition];
        if (!impact || !impact.affectedCategories.includes(task.task_type)) continue;

        const oldDate = new Date(task.task_date);
        const newDate = new Date(oldDate);
        newDate.setDate(newDate.getDate() + impact.daysShift);

        const { error: updateError } = await supabase.from("schedule_tasks").update({
          task_date: newDate.toISOString().split("T")[0],
          climate_adjusted: true,
          original_date_before_climate_adjust: task.task_date,
          climate_adjustment_reason: impact.reason[schedule.generation_language || 'hi'],
        }).eq("id", task.id);

        if (!updateError) {
          updatedCount++;
          const lang = schedule.generation_language || 'hi';
          const { error: notifError } = await supabase.from("alert_notifications").insert({
            farmer_id: schedule.farmer_id, tenant_id: schedule.tenant_id, land_id: land.id,
            alert_type: "weather_adjustment",
            title: lang === 'hi' ? `⚠️ ${impact.reason.hi}` : lang === 'mr' ? `⚠️ ${impact.reason.mr}` : `⚠️ ${impact.reason.en}`,
            message: `"${task.task_name}" ${oldDate.toLocaleDateString()} → ${newDate.toLocaleDateString()}`,
            priority: "high",
            data: { task_id: task.id, task_name: task.task_name, old_date: task.task_date, new_date: newDate.toISOString().split("T")[0], weather_condition: condition },
          });
          if (!notifError) notificationsCreated++;
        }
      }
    }

    await supabase.from("crop_schedules").update({ last_weather_check: new Date().toISOString() }).eq("id", schedule.id);
  }

  const executionTime = Date.now() - startTime;
  console.log(`✅ [Weather-Sync] Complete: ${updatedCount} tasks, ${notificationsCreated} notifications (${executionTime}ms)`);

  return new Response(
    JSON.stringify({ success: true, schedulesChecked: activeSchedules?.length || 0, tasksUpdated: updatedCount, notificationsCreated, executionTimeMs: executionTime }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Extract action from URL query params
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'monitor';

    // Extract tenant/farmer from headers
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');

    console.log(`🚀 [ScheduleOps] Action: ${action}, Tenant: ${tenantId || 'all'}`);

    switch (action) {
      case 'monitor':
        return await handleMonitor(req, supabase, tenantId);
      
      case 'climate':
        return await handleClimate(req, supabase, tenantId, farmerId);
      
      case 'weather-sync':
        return await handleWeatherSync(supabase);
      
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}. Valid actions: monitor, climate, weather-sync` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('❌ [ScheduleOps] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message, executionTimeMs: Date.now() - startTime }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
