// supabase/functions/mcp-handler/index.ts
// OpenAI-Compatible MCP Server

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// MCP TOOL DEFINITIONS - OpenAI Format
// ============================================================================

const MCP_TOOLS = [
  {
    name: "get_land_data",
    description:
      "Fetches complete land details including area, GPS coordinates, soil type, irrigation source, soil health report (NPK, pH, organic carbon), current crop, and planting date from database",
    inputSchema: {
      type: "object",
      properties: {
        land_id: {
          type: "string",
          description: "Unique identifier for the land/field",
        },
        farmer_id: {
          type: "string",
          description: "Unique identifier for the farmer",
        },
        tenant_id: {
          type: "string",
          description: "Tenant organization ID (optional, defaults to 'default-tenant')",
        },
      },
      required: ["land_id", "farmer_id"],
    },
  },
  {
    name: "get_weather_data",
    description:
      "Fetches 5-day weather forecast with agricultural insights including temperature, rainfall, humidity, wind speed, safe spraying windows, irrigation recommendations, and drought/flood risk alerts",
    inputSchema: {
      type: "object",
      properties: {
        land_id: {
          type: "string",
          description: "Land ID to get coordinates from (optional if lat/lon provided)",
        },
        latitude: {
          type: "number",
          description: "Latitude coordinate (optional if land_id provided)",
        },
        longitude: {
          type: "number",
          description: "Longitude coordinate (optional if land_id provided)",
        },
        farmer_id: {
          type: "string",
          description: "Farmer ID for authentication",
        },
        tenant_id: {
          type: "string",
          description: "Tenant ID (optional)",
        },
      },
      required: [],
    },
  },
  {
    name: "save_crop_schedule",
    description:
      "Saves a newly generated crop cultivation schedule with all tasks to the database. Include crop details, economic projections, fertilizer requirements, and complete task list",
    inputSchema: {
      type: "object",
      properties: {
        land_id: {
          type: "string",
          description: "Land where crop will be grown",
        },
        farmer_id: {
          type: "string",
          description: "Farmer who owns the schedule",
        },
        tenant_id: {
          type: "string",
          description: "Tenant ID (optional)",
        },
        crop_name: {
          type: "string",
          description: "Name of the crop",
        },
        schedule_data: {
          type: "object",
          description:
            "Complete schedule object with crop_variety, sowing_date, expected_harvest_date, total_estimated_cost, expected_yield_quintals, fertilizer amounts, tasks array, etc.",
          properties: {
            crop_variety: { type: "string" },
            sowing_date: { type: "string" },
            expected_harvest_date: { type: "string" },
            total_estimated_cost: { type: "number" },
            expected_yield_quintals: { type: "number" },
            expected_net_profit: { type: "number" },
            fertilizer_n_kg: { type: "number" },
            fertilizer_p_kg: { type: "number" },
            fertilizer_k_kg: { type: "number" },
            generation_language: { type: "string" },
            tasks: {
              type: "array",
              items: { type: "object" },
            },
          },
        },
      },
      required: ["land_id", "farmer_id", "crop_name", "schedule_data"],
    },
  },
  {
    name: "validate_crop_for_region",
    description:
      "Validates if a crop is climatically and agronomically suitable for the farmer's region. Returns suitability score, warnings, and crop cultivation guidelines from ICAR/agricultural universities",
    inputSchema: {
      type: "object",
      properties: {
        crop_name: {
          type: "string",
          description: "Name of the crop to validate",
        },
        state: {
          type: "string",
          description: "State where crop will be grown",
        },
        district: {
          type: "string",
          description: "District within the state",
        },
        soil_type: {
          type: "string",
          description: "Type of soil (e.g., loamy, clayey, sandy)",
        },
        farmer_id: {
          type: "string",
          description: "Farmer ID",
        },
        tenant_id: {
          type: "string",
          description: "Tenant ID (optional)",
        },
      },
      required: ["crop_name", "state", "district"],
    },
  },
  {
    name: "get_product_recommendations",
    description:
      "AI-powered product recommendations (seeds, fertilizers, pesticides, growth regulators) based on crop, soil health deficiencies, pest/disease issues, and budget constraints",
    inputSchema: {
      type: "object",
      properties: {
        crop_name: {
          type: "string",
          description: "Crop name for product matching",
        },
        category: {
          type: "string",
          description: "Product category: fertilizer, pesticide, seed, growth_regulator",
        },
        issue_type: {
          type: "string",
          description: "Specific pest or disease to target (optional)",
        },
        budget: {
          type: "number",
          description: "Maximum price per unit in INR (optional)",
        },
        soil_health: {
          type: "object",
          description: "Soil NPK levels for matching products (optional)",
          properties: {
            nitrogen_kg_per_ha: { type: "number" },
            phosphorus_kg_per_ha: { type: "number" },
            potassium_kg_per_ha: { type: "number" },
          },
        },
        farmer_id: {
          type: "string",
          description: "Farmer ID",
        },
        tenant_id: {
          type: "string",
          description: "Tenant ID",
        },
      },
      required: ["farmer_id", "tenant_id"],
    },
  },
];

// ============================================================================
// TOOL EXECUTION HANDLERS
// ============================================================================

async function executeTool(toolName: string, params: any) {
  const tenant_id = params.tenant_id || "default-tenant";
  const farmer_id = params.farmer_id || "default-farmer";

  switch (toolName) {
    case "get_land_data":
      return await getLandData(params, { tenantId: tenant_id, farmerId: farmer_id });

    case "get_weather_data":
      return await getWeatherData(params, { tenantId: tenant_id, farmerId: farmer_id });

    case "save_crop_schedule":
      return await saveCropSchedule(params, { tenantId: tenant_id, farmerId: farmer_id });

    case "validate_crop_for_region":
      return await validateCropForRegion(params, { tenantId: tenant_id, farmerId: farmer_id });

    case "get_product_recommendations":
      return await getProductRecommendations(params, { tenantId: tenant_id, farmerId: farmer_id });

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ============================================================================
// IMPLEMENTATION FUNCTIONS
// ============================================================================

async function getLandData(params: any, context: any) {
  const { land_id } = params;

  const { data, error } = await supabase
    .from("lands")
    .select("*")
    .eq("id", land_id)
    .eq("farmer_id", context.farmerId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single();

  if (error) throw new Error(`Failed to fetch land data: ${error.message}`);
  if (!data) throw new Error("Land not found");

  return {
    land_id: data.id,
    name: data.name,
    area_acres: data.area_acres,
    area_guntas: data.area_guntas,
    latitude: data.center_lat,
    longitude: data.center_lon,
    soil_type: data.soil_type,
    soil_health: {
      soil_ph: data.soil_ph,
      organic_carbon_percent: data.organic_carbon_percent,
      nitrogen_kg_per_ha: data.nitrogen_kg_per_ha,
      phosphorus_kg_per_ha: data.phosphorus_kg_per_ha,
      potassium_kg_per_ha: data.potassium_kg_per_ha,
      last_soil_test_date: data.last_soil_test_date,
    },
    irrigation: {
      irrigation_type: data.irrigation_type,
      irrigation_source: data.irrigation_source,
      water_source: data.water_source,
    },
    current_crop: data.current_crop,
    crop_stage: data.crop_stage,
    planting_date: data.planting_date,
    expected_harvest_date: data.expected_harvest_date,
    location: {
      state: data.state,
      district: data.district,
      taluka: data.taluka,
      village: data.village,
    },
  };
}

async function getWeatherData(params: any, context: any) {
  let lat = params.latitude;
  let lon = params.longitude;

  if (params.land_id && (!lat || !lon)) {
    const { data: land } = await supabase
      .from("lands")
      .select("center_lat, center_lon")
      .eq("id", params.land_id)
      .eq("farmer_id", context.farmerId)
      .single();

    if (land) {
      lat = land.center_lat;
      lon = land.center_lon;
    }
  }

  if (!lat || !lon) {
    return { error: "Coordinates required" };
  }

  const weatherApiKey = Deno.env.get("OPENWEATHER_API_KEY");
  if (!weatherApiKey) {
    return { error: "Weather API not configured", note: "Add OPENWEATHER_API_KEY to Supabase secrets" };
  }

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=metric&cnt=40`,
    );

    const weatherData = await response.json();

    if (!weatherData.list) {
      return { error: "Failed to fetch weather" };
    }

    const forecast = weatherData.list.slice(0, 16).map((item: any) => ({
      datetime: item.dt_txt,
      date: item.dt_txt.split(" ")[0],
      temperature: Math.round(item.main.temp),
      humidity: item.main.humidity,
      rainfall_mm: item.rain?.["3h"] || 0,
      wind_speed: item.wind.speed,
      conditions: item.weather[0].description,
    }));

    const avgTemp = forecast.reduce((sum: number, d: any) => sum + d.temperature, 0) / forecast.length;
    const totalRain = forecast.reduce((sum: number, d: any) => sum + d.rainfall_mm, 0);

    const alerts = [];
    if (avgTemp > 38) alerts.push("High temperature - ensure adequate irrigation");
    if (totalRain > 100) alerts.push("Heavy rainfall expected - ensure drainage");
    if (totalRain < 5) alerts.push("Dry weather - plan irrigation");

    const sprayWindows = forecast
      .filter((d: any) => d.wind_speed < 10 && d.rainfall_mm < 2)
      .map((d: any) => d.datetime)
      .slice(0, 5);

    return {
      current: forecast[0],
      forecast,
      agricultural_alerts: alerts,
      spray_windows: sprayWindows,
      irrigation_recommendation: totalRain < 20 ? "Increase irrigation" : "Monitor soil moisture",
    };
  } catch (err) {
    return { error: "Weather API error", details: err.message };
  }
}

async function saveCropSchedule(params: any, context: any) {
  const { land_id, crop_name, schedule_data } = params;

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
      expected_net_profit: schedule_data.expected_net_profit,
      fertilizer_n_kg: schedule_data.fertilizer_n_kg,
      fertilizer_p_kg: schedule_data.fertilizer_p_kg,
      fertilizer_k_kg: schedule_data.fertilizer_k_kg,
      generation_language: schedule_data.generation_language,
      is_active: true,
    })
    .select()
    .single();

  if (scheduleError) throw new Error(`Failed to save schedule: ${scheduleError.message}`);

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
    }));

    const { error: tasksError } = await supabase.from("schedule_tasks").insert(tasks);

    if (tasksError) throw new Error(`Failed to save tasks: ${tasksError.message}`);
  }

  return {
    success: true,
    schedule_id: schedule.id,
    message: "Schedule saved successfully",
  };
}

async function validateCropForRegion(params: any, context: any) {
  const { crop_name, state, district, soil_type } = params;

  const { data: cropData } = await supabase
    .from("crop_baseline_guidelines")
    .select("*")
    .eq("crop_name", crop_name)
    .eq("is_active", true)
    .maybeSingle();

  const warnings: string[] = [];
  let suitability_score = 100;

  if (!cropData) {
    warnings.push(`No baseline data found for ${crop_name}`);
    suitability_score = 60;
  } else {
    if (cropData.soil_type && soil_type && cropData.soil_type !== soil_type) {
      warnings.push(`Soil mismatch: ${crop_name} prefers ${cropData.soil_type}`);
      suitability_score -= 15;
    }
  }

  return {
    crop_name,
    region: `${district}, ${state}`,
    suitability_score,
    suitable: suitability_score >= 70,
    warnings,
    crop_guidelines: cropData
      ? {
          growth_duration_days: cropData.growth_duration_days,
          optimal_temp_min: cropData.optimal_temp_min,
          optimal_temp_max: cropData.optimal_temp_max,
          water_requirement_mm: cropData.water_requirement_mm,
        }
      : null,
  };
}

async function getProductRecommendations(params: any, context: any) {
  const { crop_name, category, budget, soil_health } = params;

  let query = supabase.from("products").select("*").eq("tenant_id", context.tenantId).eq("is_active", true);

  if (category) query = query.eq("product_type", category);
  if (budget) query = query.lte("price_per_unit", budget);

  const { data: products } = await query.limit(10);

  return {
    products: products || [],
    count: products?.length || 0,
  };
}

// ============================================================================
// MAIN HTTP HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  // ==================== TOOLS LIST ENDPOINT ====================
  // GET /mcp-handler (returns available tools)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        name: "Supabase Agricultural Backend",
        version: "1.0.0",
        tools: MCP_TOOLS,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ==================== TOOL EXECUTION ENDPOINT ====================
  // POST /mcp-handler (executes a tool)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { name, arguments: toolArgs } = body;

      console.log(`🔧 Tool Called: ${name}`, toolArgs);

      const result = await executeTool(name, toolArgs || {});

      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("❌ Tool Error:", error);

      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: error.message }),
            },
          ],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
