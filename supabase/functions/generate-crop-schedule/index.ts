import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get headers for authentication
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');
    
    if (!tenantId || !farmerId || !sessionToken) {
      throw new Error('Missing authentication headers');
    }

    const { 
      landId, 
      cropName, 
      cropVariety,
      sowingDate,
      weatherData,
      regenerate = false
    } = await req.json();

    // Fetch land details
    const { data: land, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .eq('farmer_id', farmerId)
      .maybeSingle();

    if (landError || !land) {
      throw new Error('Land not found or access denied');
    }

    // Create prompt for OpenAI
    const prompt = `Generate a comprehensive crop schedule for ${cropName} ${cropVariety ? '(' + cropVariety + ')' : ''} following FAO and ICAR best practices.

Land Details:
- Area: ${land.area_acres} acres (${land.area_guntas} guntas)
- Soil Type: ${land.soil_type || 'Not specified'}
- Soil pH: ${land.soil_ph || 'Not specified'}
- Organic Carbon: ${land.organic_carbon_percent || 'Not specified'}%
- NPK levels: N-${land.nitrogen_kg_per_ha || 'Unknown'}, P-${land.phosphorus_kg_per_ha || 'Unknown'}, K-${land.potassium_kg_per_ha || 'Unknown'}
- Irrigation Type: ${land.irrigation_type || 'Not specified'}
- Water Source: ${land.water_source || 'Not specified'}
- Location: ${land.state}, ${land.district}, ${land.taluka}
- Sowing Date: ${sowingDate}

Weather Forecast (Next 48 hours):
${weatherData ? JSON.stringify(weatherData) : 'No weather data available'}

Generate a detailed JSON schedule with the following structure:
{
  "lifecycle_days": <total days from sowing to harvest>,
  "expected_harvest_date": "<date>",
  "tasks": [
    {
      "day_from_sowing": <number>,
      "task_date": "<date>",
      "task_type": "<irrigation|fertilizer|pesticide|weeding|pruning|harvest|other>",
      "task_name": "<clear task name>",
      "task_description": "<detailed description>",
      "duration_hours": <estimated hours>,
      "priority": "<high|medium|low>",
      "weather_dependent": <true|false>,
      "resources": {
        "water_liters": <amount if applicable>,
        "fertilizer_kg": <amount if applicable>,
        "pesticide_ml": <amount if applicable>,
        "labor_persons": <number if applicable>
      },
      "estimated_cost": <cost in INR>,
      "instructions": ["step 1", "step 2", ...],
      "precautions": ["safety measure 1", ...],
      "ideal_weather": {
        "temperature_min": <celsius>,
        "temperature_max": <celsius>,
        "humidity_min": <%>,
        "humidity_max": <%>,
        "wind_speed_max": <km/h>,
        "rainfall_ok": <true|false>
      }
    }
  ],
  "best_practices": ["practice 1", "practice 2", ...],
  "common_issues": ["issue 1", "issue 2", ...],
  "yield_estimate": {
    "min_kg": <minimum expected yield>,
    "max_kg": <maximum expected yield>,
    "unit": "kg"
  }
}

Important:
1. Follow Indian agricultural calendar and practices
2. Consider monsoon patterns and local climate
3. Include traditional wisdom with modern techniques
4. Provide specific fertilizer compositions (NPK ratios)
5. Include organic alternatives where possible
6. Consider water conservation techniques
7. Add pest/disease management based on seasonal risks
8. Make the schedule practical for small-scale farmers`;

    console.log('Generating crop schedule with OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert agricultural advisor with deep knowledge of FAO and ICAR guidelines. Generate practical, science-based crop schedules optimized for Indian farming conditions.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error('Failed to generate crop schedule');
    }

    const aiResponse = await response.json();
    const scheduleData = JSON.parse(aiResponse.choices[0].message.content);

    // If regenerating, deactivate existing schedules
    if (regenerate) {
      await supabase
        .from('crop_schedules')
        .update({ is_active: false })
        .eq('land_id', landId)
        .eq('farmer_id', farmerId)
        .eq('is_active', true);
    }

    // Create crop schedule record
    const { data: schedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        land_id: landId,
        farmer_id: farmerId,
        tenant_id: tenantId,
        crop_name: cropName,
        crop_variety: cropVariety,
        sowing_date: sowingDate,
        expected_harvest_date: scheduleData.expected_harvest_date,
        weather_data: weatherData,
        generation_params: {
          land_details: {
            area_acres: land.area_acres,
            soil_type: land.soil_type,
            irrigation_type: land.irrigation_type
          },
          model: 'gpt-4o-mini',
          generated_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (scheduleError) {
      console.error('Error creating schedule:', scheduleError);
      throw new Error('Failed to save schedule');
    }

    // Create individual tasks
    const tasks = scheduleData.tasks.map((task: any) => ({
      schedule_id: schedule.id,
      task_date: task.task_date,
      task_type: task.task_type,
      task_name: task.task_name,
      task_description: task.task_description,
      duration_hours: task.duration_hours,
      priority: task.priority,
      weather_dependent: task.weather_dependent,
      resources: task.resources,
      estimated_cost: task.estimated_cost,
      instructions: task.instructions,
      precautions: task.precautions,
      ideal_weather: task.ideal_weather,
      status: 'pending'
    }));

    const { error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasks);

    if (tasksError) {
      console.error('Error creating tasks:', tasksError);
      throw new Error('Failed to save tasks');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        scheduleId: schedule.id,
        data: {
          ...schedule,
          tasks: tasks,
          lifecycle_days: scheduleData.lifecycle_days,
          best_practices: scheduleData.best_practices,
          common_issues: scheduleData.common_issues,
          yield_estimate: scheduleData.yield_estimate
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-crop-schedule:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});