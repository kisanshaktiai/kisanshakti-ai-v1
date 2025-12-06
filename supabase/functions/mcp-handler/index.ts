// supabase/functions/mcp-handler/index.ts
// Universal MCP Handler for All AI Agents
// This edge function provides a unified interface for AI agents to interact with the database

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token",
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TOOL REGISTRY - All AI agent tools
// ============================================================================

const TOOL_HANDLERS: Record<string, (params: any, context: { tenantId: string; farmerId: string }) => Promise<any>> = {
  
  // ==================== LAND DATA TOOLS ====================
  
  get_land_data: async (params, context) => {
    const { land_id } = params;
    
    const { data, error } = await supabase
      .from("lands")
      .select("*")
      .eq("id", land_id)
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .single();
    
    if (error) throw error;
    if (!data) throw new Error("Land not found");
    
    return {
      id: data.id,
      name: data.name,
      area_acres: data.area_acres,
      area_guntas: data.area_guntas,
      center_lat: data.center_lat,
      center_lon: data.center_lon,
      soil_type: data.soil_type,
      soil_ph: data.soil_ph,
      organic_carbon_percent: data.organic_carbon_percent,
      nitrogen_kg_per_ha: data.nitrogen_kg_per_ha,
      phosphorus_kg_per_ha: data.phosphorus_kg_per_ha,
      potassium_kg_per_ha: data.potassium_kg_per_ha,
      irrigation_type: data.irrigation_type,
      irrigation_source: data.irrigation_source,
      water_source: data.water_source,
      current_crop: data.current_crop,
      current_crop_id: data.current_crop_id,
      crop_stage: data.crop_stage,
      previous_crop: data.previous_crop,
      planting_date: data.planting_date,
      cultivation_date: data.cultivation_date,
      expected_harvest_date: data.expected_harvest_date,
      state: data.state,
      district: data.district,
      taluka: data.taluka,
      village: data.village,
      last_ndvi_value: data.last_ndvi_value,
      last_ndvi_calculation: data.last_ndvi_calculation,
      last_soil_test_date: data.last_soil_test_date,
      soil_tested: data.soil_tested,
      ndvi_tested: data.ndvi_tested,
      elevation_meters: data.elevation_meters,
      slope_percentage: data.slope_percentage,
      land_type: data.land_type,
      ownership_type: data.ownership_type,
    };
  },

  get_all_lands: async (params, context) => {
    const { data, error } = await supabase
      .from("lands")
      .select("id, name, area_acres, current_crop, crop_stage, district, state, last_ndvi_value, irrigation_type, soil_type")
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    return {
      lands: data || [],
      count: data?.length || 0,
    };
  },

  get_land_with_soil_health: async (params, context) => {
    const { land_id } = params;
    
    // Get land data
    const { data: land, error: landError } = await supabase
      .from("lands")
      .select("*")
      .eq("id", land_id)
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .single();
    
    if (landError) throw landError;
    if (!land) throw new Error("Land not found");
    
    return {
      land_id: land.id,
      name: land.name,
      area_acres: land.area_acres,
      location: {
        state: land.state,
        district: land.district,
        taluka: land.taluka,
        village: land.village,
        latitude: land.center_lat,
        longitude: land.center_lon,
      },
      soil_health: {
        soil_type: land.soil_type,
        soil_ph: land.soil_ph,
        organic_carbon_percent: land.organic_carbon_percent,
        nitrogen_kg_per_ha: land.nitrogen_kg_per_ha,
        phosphorus_kg_per_ha: land.phosphorus_kg_per_ha,
        potassium_kg_per_ha: land.potassium_kg_per_ha,
        last_soil_test_date: land.last_soil_test_date,
        soil_tested: land.soil_tested,
      },
      crop_info: {
        current_crop: land.current_crop,
        crop_stage: land.crop_stage,
        previous_crop: land.previous_crop,
        planting_date: land.planting_date,
        expected_harvest_date: land.expected_harvest_date,
      },
      irrigation: {
        irrigation_type: land.irrigation_type,
        irrigation_source: land.irrigation_source,
        water_source: land.water_source,
      },
      ndvi: {
        last_ndvi_value: land.last_ndvi_value,
        last_ndvi_calculation: land.last_ndvi_calculation,
        ndvi_tested: land.ndvi_tested,
      },
    };
  },

  // ==================== CROP SCHEDULE TOOLS ====================
  
  get_crop_schedules: async (params, context) => {
    const { land_id, status } = params;
    
    let query = supabase
      .from("crop_schedules")
      .select("*")
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    
    if (land_id) {
      query = query.eq("land_id", land_id);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return {
      schedules: data?.map(s => ({
        id: s.id,
        land_id: s.land_id,
        crop_name: s.crop_name,
        crop_variety: s.crop_variety,
        sowing_date: s.sowing_date,
        expected_harvest_date: s.expected_harvest_date,
        total_estimated_cost: s.total_estimated_cost,
        expected_yield_quintals: s.expected_yield_quintals,
        expected_net_profit: s.expected_net_profit,
        fertilizer_n_kg: s.fertilizer_n_kg,
        fertilizer_p_kg: s.fertilizer_p_kg,
        fertilizer_k_kg: s.fertilizer_k_kg,
        seed_quantity_kg: s.seed_quantity_kg,
        weather_data: s.weather_data,
        generation_language: s.generation_language,
        created_at: s.created_at,
      })) || [],
      count: data?.length || 0,
    };
  },

  get_schedule_with_tasks: async (params, context) => {
    const { schedule_id } = params;
    
    // Get schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .select("*")
      .eq("id", schedule_id)
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .single();
    
    if (scheduleError) throw scheduleError;
    if (!schedule) throw new Error("Schedule not found");
    
    // Get tasks
    const { data: tasks, error: tasksError } = await supabase
      .from("schedule_tasks")
      .select("*")
      .eq("schedule_id", schedule_id)
      .order("task_date", { ascending: true });
    
    if (tasksError) throw tasksError;
    
    return {
      schedule: {
        id: schedule.id,
        crop_name: schedule.crop_name,
        crop_variety: schedule.crop_variety,
        sowing_date: schedule.sowing_date,
        expected_harvest_date: schedule.expected_harvest_date,
        total_estimated_cost: schedule.total_estimated_cost,
        expected_yield_quintals: schedule.expected_yield_quintals,
        expected_net_profit: schedule.expected_net_profit,
        fertilizer_n_kg: schedule.fertilizer_n_kg,
        fertilizer_p_kg: schedule.fertilizer_p_kg,
        fertilizer_k_kg: schedule.fertilizer_k_kg,
      },
      tasks: tasks?.map(t => ({
        id: t.id,
        task_name: t.task_name,
        task_type: t.task_type,
        task_date: t.task_date,
        task_description: t.task_description,
        priority: t.priority,
        status: t.status,
        estimated_cost: t.estimated_cost,
        instructions: t.instructions,
        precautions: t.precautions,
        weather_dependent: t.weather_dependent,
        ideal_weather: t.ideal_weather,
        resources: t.resources,
        completed_at: t.completed_at,
        auto_rescheduled: t.auto_rescheduled,
        reschedule_reason: t.reschedule_reason,
        climate_adjusted: t.climate_adjusted,
        climate_adjustment_reason: t.climate_adjustment_reason,
      })) || [],
      task_count: tasks?.length || 0,
    };
  },

  save_crop_schedule: async (params, context) => {
    const { land_id, crop_name, schedule_data } = params;
    
    // Save main schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from("crop_schedules")
      .insert({
        tenant_id: context.tenantId,
        farmer_id: context.farmerId,
        land_id,
        crop_name,
        crop_variety: schedule_data.crop_variety,
        sowing_date: schedule_data.sowing_date,
        expected_harvest_date: schedule_data.expected_harvest_date,
        total_estimated_cost: schedule_data.total_estimated_cost,
        expected_yield_quintals: schedule_data.expected_yield_quintals,
        expected_yield_per_acre: schedule_data.expected_yield_per_acre,
        expected_net_profit: schedule_data.expected_net_profit,
        expected_gross_revenue: schedule_data.expected_gross_revenue,
        expected_market_price_per_quintal: schedule_data.expected_market_price_per_quintal,
        fertilizer_n_kg: schedule_data.fertilizer_n_kg,
        fertilizer_p_kg: schedule_data.fertilizer_p_kg,
        fertilizer_k_kg: schedule_data.fertilizer_k_kg,
        seed_quantity_kg: schedule_data.seed_quantity_kg,
        organic_manure_kg: schedule_data.organic_manure_kg,
        calculated_for_area_acres: schedule_data.calculated_for_area_acres,
        weather_data: schedule_data.weather_data,
        generation_language: schedule_data.generation_language,
        ai_model: schedule_data.ai_model,
        is_active: true,
      })
      .select()
      .single();
    
    if (scheduleError) throw scheduleError;
    
    // Save all tasks
    if (schedule_data.tasks && schedule_data.tasks.length > 0) {
      const tasks = schedule_data.tasks.map((task: any) => ({
        schedule_id: schedule.id,
        task_name: task.task_name,
        task_type: task.task_type || task.category,
        task_date: task.task_date,
        task_description: task.task_description || task.description,
        priority: task.priority,
        status: "pending",
        estimated_cost: task.estimated_cost,
        instructions: task.instructions,
        precautions: task.precautions,
        weather_dependent: task.weather_dependent,
        ideal_weather: task.ideal_weather,
        resources: task.resources,
        duration_hours: task.duration_hours,
        language: schedule_data.generation_language,
        currency: "INR",
      }));
      
      const { error: tasksError } = await supabase
        .from("schedule_tasks")
        .insert(tasks);
      
      if (tasksError) throw tasksError;
    }
    
    return {
      success: true,
      schedule_id: schedule.id,
      message: "Schedule saved successfully",
    };
  },

  update_task_status: async (params, context) => {
    const { task_id, status, completion_notes } = params;
    
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };
    
    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = context.farmerId;
    }
    
    if (completion_notes) {
      updateData.completion_notes = completion_notes;
    }
    
    const { data, error } = await supabase
      .from("schedule_tasks")
      .update(updateData)
      .eq("id", task_id)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      task: data,
    };
  },

  // ==================== WEATHER TOOLS ====================
  
  get_weather_data: async (params, context) => {
    const { land_id, latitude, longitude } = params;
    
    // If land_id provided, get coordinates from land
    let lat = latitude;
    let lon = longitude;
    
    if (land_id && (!lat || !lon)) {
      const { data: land } = await supabase
        .from("lands")
        .select("center_lat, center_lon, district, state")
        .eq("id", land_id)
        .eq("farmer_id", context.farmerId)
        .single();
      
      if (land) {
        lat = land.center_lat;
        lon = land.center_lon;
      }
    }
    
    if (!lat || !lon) {
      throw new Error("Coordinates required. Provide land_id or latitude/longitude");
    }
    
    // Call weather API
    const weatherApiKey = Deno.env.get("OPENWEATHER_API_KEY");
    
    if (!weatherApiKey) {
      return {
        error: "Weather API not configured",
        latitude: lat,
        longitude: lon,
      };
    }
    
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric&cnt=40`
      );
      
      const weatherData = await response.json();
      
      if (!weatherData.list) {
        return { error: "Failed to fetch weather data" };
      }
      
      // Process forecast
      const forecast = weatherData.list.map((item: any) => ({
        datetime: item.dt_txt,
        date: item.dt_txt.split(" ")[0],
        temperature: Math.round(item.main.temp),
        temperature_max: Math.round(item.main.temp_max),
        temperature_min: Math.round(item.main.temp_min),
        humidity: item.main.humidity,
        rainfall_mm: item.rain?.["3h"] || 0,
        wind_speed: item.wind.speed,
        conditions: item.weather[0].main,
        description: item.weather[0].description,
      }));
      
      // Generate agricultural insights
      const avgTemp = forecast.slice(0, 8).reduce((sum: number, day: any) => sum + day.temperature, 0) / 8;
      const totalRain = forecast.slice(0, 8).reduce((sum: number, day: any) => sum + day.rainfall_mm, 0);
      
      const alerts = [];
      if (avgTemp > 38) alerts.push("High temperature alert - ensure adequate irrigation");
      if (avgTemp < 10) alerts.push("Low temperature alert - protect crops from frost");
      if (totalRain > 100) alerts.push("Heavy rainfall expected - ensure proper drainage");
      if (totalRain < 5) alerts.push("Dry weather - plan irrigation carefully");
      
      // Find safe spraying windows (low wind, no rain)
      const sprayWindows = forecast
        .filter((day: any) => day.wind_speed < 10 && day.rainfall_mm < 2)
        .slice(0, 5)
        .map((day: any) => day.datetime);
      
      return {
        current: forecast[0],
        forecast: forecast.slice(0, 16),
        agricultural_alerts: alerts,
        spray_windows: sprayWindows,
        irrigation_recommendation: totalRain < 20 ? "Increase irrigation" : "Monitor soil moisture",
        drought_risk: totalRain < 10,
        flood_risk: totalRain > 200,
      };
    } catch (err) {
      console.error("Weather API error:", err);
      return { error: "Failed to fetch weather data" };
    }
  },

  // ==================== PRODUCT RECOMMENDATION TOOLS ====================
  
  get_product_recommendations: async (params, context) => {
    const { crop_name, category, issue_type, budget, soil_health } = params;
    
    let query = supabase
      .from("products")
      .select("*")
      .eq("tenant_id", context.tenantId)
      .eq("is_active", true);
    
    // Filter by product type/category
    if (category) {
      query = query.eq("product_type", category);
    }
    
    // Budget filter
    if (budget) {
      query = query.lte("price_per_unit", budget);
    }
    
    const { data: products, error } = await query
      .order("is_featured", { ascending: false })
      .limit(20);
    
    if (error) throw error;
    
    // AI-enhanced ranking based on parameters
    const rankedProducts = products?.map(product => {
      let relevance_score = 50;
      
      // Boost organic products
      if (product.is_organic) relevance_score += 15;
      
      // Boost featured products
      if (product.is_featured) relevance_score += 10;
      
      // Match with suitable crops
      if (crop_name && product.suitable_crops) {
        const crops = product.suitable_crops as string[];
        if (crops.some(c => c.toLowerCase().includes(crop_name.toLowerCase()))) {
          relevance_score += 25;
        }
      }
      
      // Match with soil deficiencies
      if (soil_health && product.nutrient_composition) {
        const nutrients = product.nutrient_composition as any;
        if (soil_health.nitrogen_kg_per_ha < 200 && nutrients?.nitrogen) {
          relevance_score += 20;
        }
        if (soil_health.phosphorus_kg_per_ha < 20 && nutrients?.phosphorus) {
          relevance_score += 20;
        }
        if (soil_health.potassium_kg_per_ha < 150 && nutrients?.potassium) {
          relevance_score += 20;
        }
      }
      
      // Match with issue type (pests/diseases)
      if (issue_type && product.target_pests) {
        const pests = product.target_pests as string[];
        if (pests.some(p => p.toLowerCase().includes(issue_type.toLowerCase()))) {
          relevance_score += 30;
        }
      }
      if (issue_type && product.target_diseases) {
        const diseases = product.target_diseases as string[];
        if (diseases.some(d => d.toLowerCase().includes(issue_type.toLowerCase()))) {
          relevance_score += 30;
        }
      }
      
      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        manufacturer: product.manufacturer,
        product_type: product.product_type,
        description: product.description,
        price_per_unit: product.price_per_unit,
        unit_type: product.unit_type,
        is_organic: product.is_organic,
        is_featured: product.is_featured,
        images: product.images,
        dosage_instructions: product.dosage_instructions,
        application_method: product.application_method,
        safety_precautions: product.safety_precautions,
        suitable_crops: product.suitable_crops,
        target_pests: product.target_pests,
        target_diseases: product.target_diseases,
        waiting_period_days: product.waiting_period_days,
        relevance_score,
        why_recommended: generateProductReason(product, soil_health, issue_type, crop_name),
      };
    }).sort((a, b) => b.relevance_score - a.relevance_score);
    
    return {
      products: rankedProducts?.slice(0, 10) || [],
      total_count: rankedProducts?.length || 0,
    };
  },

  // ==================== FARMER PROFILE TOOLS ====================
  
  get_farmer_profile: async (params, context) => {
    const { data, error } = await supabase
      .from("farmers")
      .select("*")
      .eq("id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .single();
    
    if (error) throw error;
    if (!data) throw new Error("Farmer not found");
    
    return {
      id: data.id,
      farmer_name: data.farmer_name,
      mobile_number: data.mobile_number,
      language_preference: data.language_preference,
      location: data.location,
      total_land_acres: data.total_land_acres,
      primary_crops: data.primary_crops,
      farm_type: data.farm_type,
      farming_experience_years: data.farming_experience_years,
      has_irrigation: data.has_irrigation,
      irrigation_type: data.irrigation_type,
      has_tractor: data.has_tractor,
      has_storage: data.has_storage,
      subscription_status: data.subscription_status,
      is_verified: data.is_verified,
    };
  },

  // ==================== ALERT & NOTIFICATION TOOLS ====================
  
  get_farmer_alerts: async (params, context) => {
    const { land_id, alert_type, is_read, limit = 20 } = params;
    
    let query = supabase
      .from("farmer_alerts")
      .select("*")
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (land_id) {
      query = query.eq("land_id", land_id);
    }
    
    if (alert_type) {
      query = query.eq("alert_type", alert_type);
    }
    
    if (is_read !== undefined) {
      query = query.eq("is_read", is_read);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return {
      alerts: data || [],
      count: data?.length || 0,
    };
  },

  create_alert: async (params, context) => {
    const { land_id, schedule_id, alert_type, title, message, priority, ai_reasoning, action_required } = params;
    
    const { data, error } = await supabase
      .from("farmer_alerts")
      .insert({
        tenant_id: context.tenantId,
        farmer_id: context.farmerId,
        land_id,
        schedule_id,
        alert_type,
        title,
        message,
        priority: priority || "medium",
        ai_reasoning,
        action_required,
        is_read: false,
        is_actioned: false,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      alert_id: data.id,
    };
  },

  // ==================== CROP HISTORY TOOLS ====================
  
  get_crop_history: async (params, context) => {
    const { land_id, limit = 10 } = params;
    
    const { data, error } = await supabase
      .from("crop_history")
      .select("*")
      .eq("land_id", land_id)
      .eq("tenant_id", context.tenantId)
      .order("planting_date", { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    
    return {
      history: data?.map(h => ({
        id: h.id,
        crop_name: h.crop_name,
        variety: h.variety,
        season: h.season,
        planting_date: h.planting_date,
        harvest_date: h.harvest_date,
        growth_stage: h.growth_stage,
        status: h.status,
        yield_kg_per_acre: h.yield_kg_per_acre,
        notes: h.notes,
      })) || [],
      count: data?.length || 0,
    };
  },

  // ==================== NDVI & CROP HEALTH TOOLS ====================
  
  get_crop_health_assessment: async (params, context) => {
    const { land_id } = params;
    
    // Get latest NDVI data
    const { data: land } = await supabase
      .from("lands")
      .select("last_ndvi_value, last_ndvi_calculation, current_crop, crop_stage")
      .eq("id", land_id)
      .eq("farmer_id", context.farmerId)
      .single();
    
    // Get latest health assessment
    const { data: assessment } = await supabase
      .from("crop_health_assessments")
      .select("*")
      .eq("land_id", land_id)
      .eq("tenant_id", context.tenantId)
      .order("assessment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Get recent satellite alerts
    const { data: alerts } = await supabase
      .from("satellite_alerts")
      .select("*")
      .eq("land_id", land_id)
      .eq("tenant_id", context.tenantId)
      .order("created_at", { ascending: false })
      .limit(5);
    
    return {
      current_ndvi: land?.last_ndvi_value,
      last_ndvi_date: land?.last_ndvi_calculation,
      current_crop: land?.current_crop,
      crop_stage: land?.crop_stage,
      health_assessment: assessment ? {
        overall_health_score: assessment.overall_health_score,
        ndvi_avg: assessment.ndvi_avg,
        ndvi_min: assessment.ndvi_min,
        ndvi_max: assessment.ndvi_max,
        growth_stage: assessment.growth_stage,
        alert_level: assessment.alert_level,
        stress_indicators: assessment.stress_indicators,
        recommendations: assessment.recommendations,
        predicted_yield: assessment.predicted_yield,
      } : null,
      recent_alerts: alerts?.map(a => ({
        id: a.id,
        alert_type: a.alert_type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        ndvi_change: a.ndvi_change,
        status: a.status,
      })) || [],
    };
  },

  // ==================== AI CHAT TOOLS ====================
  
  get_chat_history: async (params, context) => {
    const { session_id, limit = 50 } = params;
    
    let query = supabase
      .from("ai_chat_messages")
      .select("*")
      .eq("farmer_id", context.farmerId)
      .eq("tenant_id", context.tenantId)
      .order("created_at", { ascending: true })
      .limit(limit);
    
    if (session_id) {
      query = query.eq("session_id", session_id);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return {
      messages: data?.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        language: m.language,
        created_at: m.created_at,
        land_context: m.land_context,
        crop_context: m.crop_context,
        weather_context: m.weather_context,
      })) || [],
      count: data?.length || 0,
    };
  },

  save_chat_message: async (params, context) => {
    const { session_id, role, content, language, land_context, crop_context, weather_context } = params;
    
    const { data, error } = await supabase
      .from("ai_chat_messages")
      .insert({
        tenant_id: context.tenantId,
        farmer_id: context.farmerId,
        session_id,
        role,
        content,
        language,
        land_context,
        crop_context,
        weather_context,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      success: true,
      message_id: data.id,
    };
  },

  // ==================== COMMUNITY & SOCIAL TOOLS ====================
  
  get_community_posts: async (params, context) => {
    const { community_id, limit = 20 } = params;
    
    let query = supabase
      .from("social_posts")
      .select(`
        *,
        farmers!social_posts_farmer_id_fkey (
          id,
          farmer_name
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (community_id) {
      query = query.eq("community_id", community_id);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return {
      posts: data || [],
      count: data?.length || 0,
    };
  },

  // ==================== ANALYTICS TOOLS ====================
  
  get_schedule_analytics: async (params, context) => {
    const { schedule_id } = params;
    
    // Get schedule with tasks
    const { data: tasks } = await supabase
      .from("schedule_tasks")
      .select("*")
      .eq("schedule_id", schedule_id);
    
    if (!tasks) {
      return { error: "No tasks found" };
    }
    
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === "completed").length;
    const pendingTasks = tasks.filter(t => t.status === "pending").length;
    const skippedTasks = tasks.filter(t => t.status === "skipped").length;
    const rescheduledTasks = tasks.filter(t => t.auto_rescheduled).length;
    
    const totalCost = tasks.reduce((sum, t) => sum + (t.estimated_cost || 0), 0);
    const completedCost = tasks
      .filter(t => t.status === "completed")
      .reduce((sum, t) => sum + (t.estimated_cost || 0), 0);
    
    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      skipped_tasks: skippedTasks,
      rescheduled_tasks: rescheduledTasks,
      completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      total_estimated_cost: totalCost,
      cost_spent: completedCost,
      cost_remaining: totalCost - completedCost,
    };
  },

  // ==================== AGRO-CLIMATIC ZONE TOOLS ====================
  
  validate_crop_for_region: async (params, context) => {
    const { crop_name, state, district, soil_type } = params;
    
    // Get agro-climatic zone data
    const { data: zoneData } = await supabase
      .from("agro_climatic_zones")
      .select("*")
      .eq("name", state)
      .eq("is_active", true)
      .maybeSingle();
    
    // Get crop baseline guidelines
    const { data: cropData } = await supabase
      .from("crop_baseline_guidelines")
      .select("*")
      .eq("crop_name", crop_name)
      .eq("is_active", true)
      .maybeSingle();
    
    const warnings: string[] = [];
    let suitability_score = 100;
    
    if (!cropData) {
      warnings.push(`No baseline data found for ${crop_name}. Using general guidelines.`);
      suitability_score -= 20;
    }
    
    if (cropData) {
      // Check soil compatibility
      if (cropData.soil_type && soil_type && cropData.soil_type !== soil_type) {
        warnings.push(`Soil type mismatch: ${crop_name} prefers ${cropData.soil_type}, but land has ${soil_type}`);
        suitability_score -= 15;
      }
      
      // Check climate zone
      if (cropData.climate_zone && zoneData && cropData.climate_zone !== zoneData.name) {
        warnings.push(`Climate zone consideration: ${crop_name} typically grown in ${cropData.climate_zone}`);
        suitability_score -= 10;
      }
    }
    
    return {
      crop_name,
      region: `${district}, ${state}`,
      soil_type,
      suitability_score,
      suitable: suitability_score >= 70,
      warnings,
      crop_guidelines: cropData ? {
        growth_duration_days: cropData.growth_duration_days,
        optimal_temp_min: cropData.optimal_temp_min,
        optimal_temp_max: cropData.optimal_temp_max,
        water_requirement_mm: cropData.water_requirement_mm,
        stages: cropData.stages,
        best_practices: cropData.best_practices,
        common_pests: cropData.common_pests,
        common_diseases: cropData.common_diseases,
      } : null,
    };
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateProductReason(
  product: any, 
  soil_health: any, 
  issue_type: string,
  crop_name: string
): string {
  const reasons: string[] = [];
  
  if (product.is_organic) {
    reasons.push("Organic and environmentally safe");
  }
  
  if (product.is_featured) {
    reasons.push("Featured product with high farmer ratings");
  }
  
  if (soil_health) {
    if (soil_health.nitrogen_kg_per_ha < 200 && product.nutrient_composition?.nitrogen) {
      reasons.push("Addresses nitrogen deficiency in your soil");
    }
    if (soil_health.phosphorus_kg_per_ha < 20 && product.nutrient_composition?.phosphorus) {
      reasons.push("Helps with phosphorus deficiency");
    }
    if (soil_health.potassium_kg_per_ha < 150 && product.nutrient_composition?.potassium) {
      reasons.push("Provides needed potassium");
    }
  }
  
  if (issue_type) {
    const pests = product.target_pests as string[] || [];
    const diseases = product.target_diseases as string[] || [];
    if (pests.some(p => p.toLowerCase().includes(issue_type.toLowerCase()))) {
      reasons.push(`Effective against ${issue_type}`);
    }
    if (diseases.some(d => d.toLowerCase().includes(issue_type.toLowerCase()))) {
      reasons.push(`Controls ${issue_type}`);
    }
  }
  
  if (crop_name && product.suitable_crops) {
    const crops = product.suitable_crops as string[];
    if (crops.some(c => c.toLowerCase().includes(crop_name.toLowerCase()))) {
      reasons.push(`Suitable for ${crop_name} cultivation`);
    }
  }
  
  return reasons.join(". ") || "Suitable for your farming conditions";
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract tenant and farmer context from headers
    const tenantId = req.headers.get("x-tenant-id");
    const farmerId = req.headers.get("x-farmer-id");
    
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({
          error: "Missing required headers",
          details: "x-tenant-id and x-farmer-id headers are required",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    const context = { tenantId, farmerId };
    
    const { tool_name, parameters = {} } = await req.json();
    
    console.log(`🔧 MCP Tool Called: ${tool_name}`, { tenantId, farmerId, parameters });
    
    // Check if tool exists
    if (!TOOL_HANDLERS[tool_name]) {
      return new Response(
        JSON.stringify({
          error: `Tool '${tool_name}' not found`,
          available_tools: Object.keys(TOOL_HANDLERS),
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    // Execute the tool
    const startTime = Date.now();
    const result = await TOOL_HANDLERS[tool_name](parameters, context);
    const executionTime = Date.now() - startTime;
    
    console.log(`✅ MCP Tool Success: ${tool_name} (${executionTime}ms)`);
    
    return new Response(
      JSON.stringify({
        success: true,
        tool_name,
        result,
        execution_time_ms: executionTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
    
  } catch (error) {
    console.error("❌ MCP Handler Error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
