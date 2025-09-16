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
    
    // Check if OpenAI API key is configured
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured in Supabase secrets');
      throw new Error('AI service not configured. Please contact support.');
    }
    
    let scheduleData: any;
    
    try {
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
        const errorText = await response.text();
        console.error('OpenAI API error:', errorText);
        
        // Parse error to check for specific issues
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.code === 'insufficient_quota') {
            console.error('OpenAI API quota exceeded');
            // Generate a fallback schedule
            scheduleData = generateFallbackSchedule(cropName, cropVariety, sowingDate, land);
          } else {
            throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
          }
        } catch (parseError) {
          throw new Error('Failed to generate crop schedule');
        }
      } else {
        const aiResponse = await response.json();
        scheduleData = JSON.parse(aiResponse.choices[0].message.content);
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      // Use fallback schedule generation
      scheduleData = generateFallbackSchedule(cropName, cropVariety, sowingDate, land);
    }

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

// Fallback schedule generator for when OpenAI API fails
function generateFallbackSchedule(cropName: string, cropVariety: string | null, sowingDate: string, land: any) {
  console.log('Generating fallback schedule due to API limitations');
  
  const sowingDateObj = new Date(sowingDate);
  const lifecycleDays = getDefaultLifecycleDays(cropName);
  const harvestDate = new Date(sowingDateObj);
  harvestDate.setDate(harvestDate.getDate() + lifecycleDays);
  
  // Generate basic tasks based on crop type
  const tasks = generateBasicTasks(cropName, sowingDateObj, lifecycleDays, land);
  
  return {
    lifecycle_days: lifecycleDays,
    expected_harvest_date: harvestDate.toISOString().split('T')[0],
    tasks: tasks,
    best_practices: getDefaultBestPractices(cropName),
    common_issues: getDefaultCommonIssues(cropName),
    yield_estimate: getDefaultYieldEstimate(cropName, land.area_acres)
  };
}

function getDefaultLifecycleDays(cropName: string): number {
  const cropLifecycles: Record<string, number> = {
    'rice': 120,
    'wheat': 110,
    'maize': 90,
    'cotton': 180,
    'sugarcane': 365,
    'groundnut': 100,
    'soybean': 90,
    'potato': 90,
    'tomato': 75,
    'onion': 120,
    'chili': 150,
    'brinjal': 120,
    'okra': 55,
    'cabbage': 90,
    'cauliflower': 85
  };
  
  return cropLifecycles[cropName.toLowerCase()] || 90;
}

function generateBasicTasks(cropName: string, sowingDate: Date, lifecycleDays: number, land: any) {
  const tasks = [];
  
  // Land Preparation (Day -7)
  const prepDate = new Date(sowingDate);
  prepDate.setDate(prepDate.getDate() - 7);
  tasks.push({
    day_from_sowing: -7,
    task_date: prepDate.toISOString().split('T')[0],
    task_type: 'other',
    task_name: 'Land Preparation',
    task_description: 'Prepare the field for sowing by plowing, leveling, and creating beds/furrows as needed',
    duration_hours: 8,
    priority: 'high',
    weather_dependent: true,
    resources: {
      labor_persons: 2
    },
    estimated_cost: 2000,
    instructions: ['Plow the field', 'Level the soil', 'Create beds or furrows', 'Remove weeds and debris'],
    precautions: ['Ensure soil moisture is optimal', 'Avoid working in wet conditions'],
    ideal_weather: {
      temperature_min: 15,
      temperature_max: 35,
      humidity_min: 40,
      humidity_max: 70,
      wind_speed_max: 20,
      rainfall_ok: false
    }
  });
  
  // Sowing (Day 0)
  tasks.push({
    day_from_sowing: 0,
    task_date: sowingDate.toISOString().split('T')[0],
    task_type: 'other',
    task_name: 'Sowing/Planting',
    task_description: `Sow ${cropName} seeds or transplant seedlings at recommended spacing`,
    duration_hours: 6,
    priority: 'high',
    weather_dependent: true,
    resources: {
      labor_persons: 3
    },
    estimated_cost: 1500,
    instructions: ['Mark rows at proper spacing', 'Sow seeds at recommended depth', 'Cover seeds with soil', 'Light irrigation if needed'],
    precautions: ['Use treated seeds', 'Maintain proper spacing', 'Avoid deep sowing'],
    ideal_weather: {
      temperature_min: 18,
      temperature_max: 32,
      humidity_min: 50,
      humidity_max: 75,
      wind_speed_max: 15,
      rainfall_ok: false
    }
  });
  
  // First Irrigation (Day 3)
  const firstIrrigationDate = new Date(sowingDate);
  firstIrrigationDate.setDate(firstIrrigationDate.getDate() + 3);
  tasks.push({
    day_from_sowing: 3,
    task_date: firstIrrigationDate.toISOString().split('T')[0],
    task_type: 'irrigation',
    task_name: 'First Irrigation',
    task_description: 'Light irrigation to ensure seed germination',
    duration_hours: 3,
    priority: 'high',
    weather_dependent: true,
    resources: {
      water_liters: land.area_acres * 5000,
      labor_persons: 1
    },
    estimated_cost: 500,
    instructions: ['Check soil moisture', 'Apply light irrigation', 'Avoid waterlogging', 'Ensure uniform water distribution'],
    precautions: ['Do not over-irrigate', 'Check weather forecast'],
    ideal_weather: {
      temperature_min: 15,
      temperature_max: 35,
      humidity_min: 30,
      humidity_max: 80,
      wind_speed_max: 25,
      rainfall_ok: false
    }
  });
  
  // Regular irrigation schedule
  for (let day = 10; day < lifecycleDays - 10; day += 7) {
    const irrigationDate = new Date(sowingDate);
    irrigationDate.setDate(irrigationDate.getDate() + day);
    tasks.push({
      day_from_sowing: day,
      task_date: irrigationDate.toISOString().split('T')[0],
      task_type: 'irrigation',
      task_name: `Irrigation - Week ${Math.floor(day / 7)}`,
      task_description: 'Regular irrigation based on soil moisture and crop requirement',
      duration_hours: 3,
      priority: 'medium',
      weather_dependent: true,
      resources: {
        water_liters: land.area_acres * 7000,
        labor_persons: 1
      },
      estimated_cost: 500,
      instructions: ['Check soil moisture', 'Irrigate as per requirement', 'Ensure proper drainage'],
      precautions: ['Avoid water stress', 'Check for rainfall forecast'],
      ideal_weather: {
        temperature_min: 15,
        temperature_max: 38,
        humidity_min: 30,
        humidity_max: 85,
        wind_speed_max: 30,
        rainfall_ok: false
      }
    });
  }
  
  // Fertilizer applications
  const fertilizerDays = [15, 30, 45, 60];
  fertilizerDays.forEach((day, index) => {
    if (day < lifecycleDays) {
      const fertilizerDate = new Date(sowingDate);
      fertilizerDate.setDate(fertilizerDate.getDate() + day);
      tasks.push({
        day_from_sowing: day,
        task_date: fertilizerDate.toISOString().split('T')[0],
        task_type: 'fertilizer',
        task_name: `Fertilizer Application ${index + 1}`,
        task_description: index === 0 ? 'Basal fertilizer application' : `Top dressing ${index}`,
        duration_hours: 4,
        priority: 'high',
        weather_dependent: true,
        resources: {
          fertilizer_kg: land.area_acres * 50,
          labor_persons: 2
        },
        estimated_cost: 2000,
        instructions: ['Calculate fertilizer requirement', 'Apply uniformly', 'Light irrigation after application'],
        precautions: ['Wear protective gear', 'Avoid contact with skin', 'Store fertilizer safely'],
        ideal_weather: {
          temperature_min: 15,
          temperature_max: 35,
          humidity_min: 40,
          humidity_max: 75,
          wind_speed_max: 15,
          rainfall_ok: false
        }
      });
    }
  });
  
  // Weeding
  const weedingDays = [20, 40];
  weedingDays.forEach((day, index) => {
    if (day < lifecycleDays) {
      const weedingDate = new Date(sowingDate);
      weedingDate.setDate(weedingDate.getDate() + day);
      tasks.push({
        day_from_sowing: day,
        task_date: weedingDate.toISOString().split('T')[0],
        task_type: 'weeding',
        task_name: `Weeding ${index + 1}`,
        task_description: 'Remove weeds to reduce competition for nutrients',
        duration_hours: 6,
        priority: 'medium',
        weather_dependent: false,
        resources: {
          labor_persons: 3
        },
        estimated_cost: 1500,
        instructions: ['Remove weeds carefully', 'Avoid damaging crop roots', 'Dispose of weeds properly'],
        precautions: ['Use appropriate tools', 'Work when soil is moist but not wet'],
        ideal_weather: {
          temperature_min: 15,
          temperature_max: 35,
          humidity_min: 30,
          humidity_max: 80,
          wind_speed_max: 30,
          rainfall_ok: false
        }
      });
    }
  });
  
  // Harvest
  const harvestDate = new Date(sowingDate);
  harvestDate.setDate(harvestDate.getDate() + lifecycleDays);
  tasks.push({
    day_from_sowing: lifecycleDays,
    task_date: harvestDate.toISOString().split('T')[0],
    task_type: 'harvest',
    task_name: 'Harvesting',
    task_description: `Harvest ${cropName} at optimal maturity`,
    duration_hours: 8,
    priority: 'high',
    weather_dependent: true,
    resources: {
      labor_persons: 5
    },
    estimated_cost: 3000,
    instructions: ['Check crop maturity', 'Harvest in morning hours', 'Handle produce carefully', 'Store in appropriate conditions'],
    precautions: ['Avoid harvesting in wet conditions', 'Use clean containers'],
    ideal_weather: {
      temperature_min: 15,
      temperature_max: 35,
      humidity_min: 30,
      humidity_max: 70,
      wind_speed_max: 20,
      rainfall_ok: false
    }
  });
  
  return tasks.sort((a, b) => a.day_from_sowing - b.day_from_sowing);
}

function getDefaultBestPractices(cropName: string): string[] {
  return [
    `Use certified seeds/planting material for ${cropName}`,
    'Maintain proper plant spacing for optimal growth',
    'Follow integrated pest management (IPM) practices',
    'Ensure timely irrigation based on crop stage',
    'Apply fertilizers based on soil test recommendations',
    'Monitor crop regularly for pests and diseases',
    'Harvest at proper maturity stage',
    'Follow post-harvest handling best practices'
  ];
}

function getDefaultCommonIssues(cropName: string): string[] {
  return [
    'Pest attacks - Monitor regularly and apply appropriate control measures',
    'Nutrient deficiency - Look for yellowing leaves or stunted growth',
    'Water stress - Maintain consistent soil moisture',
    'Weed competition - Regular weeding required',
    'Disease incidence - Use preventive fungicides if needed',
    'Weather stress - Protect from extreme temperatures'
  ];
}

function getDefaultYieldEstimate(cropName: string, areaAcres: number): any {
  const yieldPerAcre: Record<string, { min: number, max: number }> = {
    'rice': { min: 1500, max: 2500 },
    'wheat': { min: 1200, max: 2000 },
    'maize': { min: 2000, max: 3500 },
    'cotton': { min: 400, max: 700 },
    'sugarcane': { min: 30000, max: 45000 },
    'groundnut': { min: 800, max: 1500 },
    'soybean': { min: 800, max: 1200 },
    'potato': { min: 8000, max: 12000 },
    'tomato': { min: 10000, max: 20000 },
    'onion': { min: 8000, max: 15000 }
  };
  
  const defaultYield = { min: 1000, max: 2000 };
  const cropYield = yieldPerAcre[cropName.toLowerCase()] || defaultYield;
  
  return {
    min_kg: cropYield.min * areaAcres,
    max_kg: cropYield.max * areaAcres,
    unit: 'kg'
  };
}