import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Weather condition mappings for task adjustments
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
    reason: {
      hi: 'भारी बारिश के कारण',
      mr: 'जोरदार पावसामुळे',
      en: 'Due to heavy rain',
    },
  },
  continuous_rain: {
    affectedCategories: ['fertilizer', 'pest_control', 'harvest', 'post_harvest'],
    action: 'postpone',
    daysShift: 3,
    reason: {
      hi: 'लगातार बारिश के कारण',
      mr: 'सतत पावसामुळे',
      en: 'Due to continuous rain',
    },
  },
  extreme_heat: {
    affectedCategories: ['transplanting', 'sowing'],
    action: 'postpone',
    daysShift: 1,
    reason: {
      hi: 'अत्यधिक गर्मी के कारण',
      mr: 'अत्यंत उष्णतेमुळे',
      en: 'Due to extreme heat',
    },
  },
  frost: {
    affectedCategories: ['sowing', 'transplanting', 'growth_promoter'],
    action: 'postpone',
    daysShift: 2,
    reason: {
      hi: 'पाले के कारण',
      mr: 'दव/थंडीमुळे',
      en: 'Due to frost',
    },
  },
  high_wind: {
    affectedCategories: ['pest_control', 'disease_control', 'growth_promoter'],
    action: 'postpone',
    daysShift: 1,
    reason: {
      hi: 'तेज हवा के कारण',
      mr: 'वादळी वाऱ्यामुळे',
      en: 'Due to high wind',
    },
  },
  ideal_spray: {
    affectedCategories: ['pest_control', 'disease_control', 'growth_promoter'],
    action: 'advance',
    daysShift: -1,
    reason: {
      hi: 'छिड़काव के लिए आदर्श मौसम',
      mr: 'फवारणीसाठी आदर्श हवामान',
      en: 'Ideal weather for spraying',
    },
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
      rain_mm: 0,
      temp_max: 32,
      temp_min: 22,
      humidity: 65,
      wind_speed: 8,
      consecutive_rain_days: 0,
      forecast_days: [],
    };
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`
    );
    
    if (!response.ok) {
      console.error("Weather API error:", response.status);
      return null;
    }
    
    const data = await response.json();
    const today = data.list?.[0];
    
    return {
      rain_mm: today?.rain?.['3h'] || 0,
      temp_max: today?.main?.temp_max || 30,
      temp_min: today?.main?.temp_min || 20,
      humidity: today?.main?.humidity || 60,
      wind_speed: (today?.wind?.speed || 0) * 3.6, // Convert m/s to km/h
      consecutive_rain_days: 0, // Would need historical data
      forecast_days: data.list?.slice(0, 8) || [],
    };
  } catch (error) {
    console.error("Weather fetch error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("🌦️ [Weather-Sync] Starting schedule weather sync...");

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Fetch active schedules with weather auto-update enabled
    const { data: activeSchedules, error: schedulesError } = await supabase
      .from("crop_schedules")
      .select(`
        id, farmer_id, tenant_id, crop_name, sowing_date, generation_language,
        weather_auto_update_enabled, last_weather_check,
        lands!inner(id, name, latitude, longitude, state, district)
      `)
      .eq("is_active", true)
      .eq("weather_auto_update_enabled", true);

    if (schedulesError) {
      console.error("Error fetching schedules:", schedulesError);
      throw schedulesError;
    }

    console.log(`📋 [Weather-Sync] Found ${activeSchedules?.length || 0} active schedules to check`);

    let updatedCount = 0;
    let notificationsCreated = 0;

    for (const schedule of activeSchedules || []) {
      const land = schedule.lands;
      if (!land?.latitude || !land?.longitude) {
        console.log(`⚠️ Schedule ${schedule.id} has no location data, skipping`);
        continue;
      }

      // Fetch current weather
      const weather = await fetchWeatherForLocation(land.latitude, land.longitude);
      if (!weather) continue;

      // Detect weather conditions
      const conditions = detectWeatherCondition(weather);
      if (conditions.length === 0) {
        // Update last check time
        await supabase
          .from("crop_schedules")
          .update({ last_weather_check: new Date().toISOString() })
          .eq("id", schedule.id);
        continue;
      }

      console.log(`🌧️ [Weather] Schedule ${schedule.id}: Conditions detected: ${conditions.join(', ')}`);

      // Get upcoming tasks (next 7 days)
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const { data: upcomingTasks, error: tasksError } = await supabase
        .from("schedule_tasks")
        .select("*")
        .eq("schedule_id", schedule.id)
        .eq("status", "pending")
        .gte("task_date", today.toISOString().split("T")[0])
        .lte("task_date", nextWeek.toISOString().split("T")[0]);

      if (tasksError || !upcomingTasks?.length) continue;

      // Check each task for weather conflicts
      for (const task of upcomingTasks) {
        for (const condition of conditions) {
          const impact = WEATHER_TASK_IMPACTS[condition];
          if (!impact || !impact.affectedCategories.includes(task.task_type)) continue;

          // Calculate new date
          const oldDate = new Date(task.task_date);
          const newDate = new Date(oldDate);
          newDate.setDate(newDate.getDate() + impact.daysShift);

          // Update task
          const { error: updateError } = await supabase
            .from("schedule_tasks")
            .update({
              task_date: newDate.toISOString().split("T")[0],
              climate_adjusted: true,
              original_date_before_climate_adjust: task.task_date,
              climate_adjustment_reason: impact.reason[schedule.generation_language || 'hi'],
            })
            .eq("id", task.id);

          if (!updateError) {
            updatedCount++;

            // Create notification
            const lang = schedule.generation_language || 'hi';
            const notificationTitle = lang === 'hi' 
              ? `⚠️ ${impact.reason.hi} - काम ${impact.daysShift > 0 ? 'आगे बढ़ाया' : 'पहले किया'}`
              : lang === 'mr'
              ? `⚠️ ${impact.reason.mr} - काम ${impact.daysShift > 0 ? 'पुढे ढकलले' : 'आधी केले'}`
              : `⚠️ ${impact.reason.en} - Task ${impact.daysShift > 0 ? 'postponed' : 'advanced'}`;

            const notificationMessage = lang === 'hi'
              ? `"${task.task_name}" ${oldDate.toLocaleDateString('hi-IN')} से ${newDate.toLocaleDateString('hi-IN')} पर बदला गया`
              : lang === 'mr'
              ? `"${task.task_name}" ${oldDate.toLocaleDateString('mr-IN')} वरून ${newDate.toLocaleDateString('mr-IN')} वर बदलले`
              : `"${task.task_name}" moved from ${oldDate.toLocaleDateString()} to ${newDate.toLocaleDateString()}`;

            const { error: notifError } = await supabase
              .from("alert_notifications")
              .insert({
                farmer_id: schedule.farmer_id,
                tenant_id: schedule.tenant_id,
                land_id: land.id,
                alert_type: "weather_adjustment",
                title: notificationTitle,
                message: notificationMessage,
                priority: "high",
                data: {
                  task_id: task.id,
                  task_name: task.task_name,
                  old_date: task.task_date,
                  new_date: newDate.toISOString().split("T")[0],
                  weather_condition: condition,
                  weather_data: weather,
                },
              });

            if (!notifError) notificationsCreated++;
          }
        }
      }

      // Update last weather check
      await supabase
        .from("crop_schedules")
        .update({ last_weather_check: new Date().toISOString() })
        .eq("id", schedule.id);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ [Weather-Sync] Complete: ${updatedCount} tasks updated, ${notificationsCreated} notifications sent (${executionTime}ms)`);

    return new Response(
      JSON.stringify({
        success: true,
        schedulesChecked: activeSchedules?.length || 0,
        tasksUpdated: updatedCount,
        notificationsCreated,
        executionTimeMs: executionTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ [Weather-Sync] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Weather sync failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
