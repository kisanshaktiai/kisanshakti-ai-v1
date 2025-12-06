import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from '../_shared/aiConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

// Language mapping
const LANGUAGES: Record<string, string> = {
  hi: 'Hindi', mr: 'Marathi', pa: 'Punjabi', ta: 'Tamil', te: 'Telugu',
  bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', en: 'English'
};

// NPK targets by crop (kg/ha) - minimal essential data
const NPK_TARGETS: Record<string, { n: number; p: number; k: number }> = {
  'wheat': { n: 120, p: 60, k: 40 }, 'rice': { n: 120, p: 60, k: 40 },
  'cotton': { n: 120, p: 60, k: 50 }, 'maize': { n: 150, p: 75, k: 50 },
  'sugarcane': { n: 250, p: 115, k: 115 }, 'soybean': { n: 30, p: 60, k: 40 },
  'groundnut': { n: 25, p: 50, k: 45 }, 'tomato': { n: 100, p: 60, k: 80 },
  'onion': { n: 100, p: 50, k: 50 }, 'potato': { n: 150, p: 80, k: 100 },
  'default': { n: 100, p: 50, k: 40 }
};

serve(async (req) => {
  console.log('🚀 [AI-Schedule] Request received');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const OPENAI_API_KEY = validateOpenAIKey();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing headers', details: 'x-tenant-id and x-farmer-id required' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { 
      landId, cropName, cropVariety, sowingDate, 
      isReadyMadePlant = false, weather, regenerate, 
      language = 'hi', forceGenerate = false 
    } = body;
    
    console.log('📋 [AI-Schedule] Request:', { landId, cropName, sowingDate, language });
    
    if (!landId || !cropName || !sowingDate) {
      return new Response(
        JSON.stringify({ error: 'Missing fields', details: 'landId, cropName, sowingDate required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(`${tenantId}:${farmerId}`, 'ai-smart-schedule', { maxRequests: 30, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: corsHeaders }
      );
    }

    // Fetch land data
    const { data: land, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .single();

    if (landError || !land) {
      return new Response(
        JSON.stringify({ error: 'Land not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    // Parse sowing date
    const [year, month, day] = sowingDate.split('-').map(Number);
    const sowingDateParsed = new Date(year, month - 1, day);

    // Calculate NPK deficit
    const cropKey = cropName.toLowerCase();
    const target = NPK_TARGETS[cropKey] || NPK_TARGETS['default'];
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // Fertilizer calculations
    const ureaKg = ((nDeficit * landAreaHa) / 0.46).toFixed(0);
    const dapKg = ((pDeficit * landAreaHa) / 0.18).toFixed(0);
    const mopKg = ((kDeficit * landAreaHa) / 0.60).toFixed(0);
    const fymTons = (land.area_acres * 2.5).toFixed(1);

    const languageName = LANGUAGES[language] || 'Hindi';
    const plantingMethod = isReadyMadePlant ? 'Transplanting' : 'Direct sowing';

    // Build concise system prompt
    const systemPrompt = `You are an expert agricultural scientist helping Indian farmers achieve 3X-5X higher yields.

CRITICAL: Generate ALL content in ${languageName} (${language}) using RURAL VILLAGE language, not formal/bookish terms.
- Use words farmers actually speak: "पाणी द्या" not "सिंचन प्रबंधन"
- Address farmer respectfully (भाऊ/भाई based on language)

CROP: ${cropName}
LOCATION: ${land.district || 'Unknown'}, ${land.state || 'India'}
AREA: ${land.area_acres} acres
SOWING: ${sowingDate}
METHOD: ${plantingMethod}
SOIL: ${land.soil_type || 'Not specified'}
IRRIGATION: ${land.irrigation_type || 'Available'}

NPK STATUS (kg/ha):
- N: Current ${currentN}, Need ${target.n}, Deficit ${nDeficit.toFixed(0)}
- P: Current ${currentP}, Need ${target.p}, Deficit ${pDeficit.toFixed(0)}
- K: Current ${currentK}, Need ${target.k}, Deficit ${kDeficit.toFixed(0)}

FERTILIZER CALCULATIONS (${land.area_acres} acres):
- FYM: ${fymTons} tons
- Urea: ${ureaKg} kg
- DAP: ${dapKg} kg
- MOP: ${mopKg} kg

${weather?.current ? `WEATHER: ${weather.current.temperature || weather.current.temp}°C, ${weather.current.humidity}% humidity` : ''}

TASK RULES:
- Generate 12-15 tasks covering full crop cycle
- Days -15 to -1: Pre-sowing (land prep, fertilizer, ${isReadyMadePlant ? 'plant procurement' : 'seed treatment'})
- Day 0: ${isReadyMadePlant ? 'Transplanting' : 'Sowing'}
- Days 1+: Irrigation, weeding, fertilizer, pest/disease control, harvest
- Include EXACT quantities for ${land.area_acres} acres
- For chemicals: Brand name + Active Ingredient + % + Dosage + PHI
- Include yield_impact and skip_penalty for each task`;

    const userPrompt = `Generate comprehensive ${cropName} schedule for ${land.area_acres} acres, sowing ${sowingDate}. 
Output in ${languageName} rural language. Include 12-15 tasks with quantities, costs, instructions.`;

    console.log('🤖 [AI] Calling OpenAI...');
    
    const aiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_CONFIG.MODEL,
        max_completion_tokens: AI_CONFIG.MAX_TOKENS_SCHEDULE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_crop_schedule",
            description: `Create ${cropName} schedule in ${languageName}`,
            parameters: {
              type: "object",
              properties: {
                crop_name: { type: "string" },
                total_duration_days: { type: "integer" },
                expected_yield_quintals: { type: "number" },
                total_estimated_cost: { type: "number" },
                expected_profit: { type: "number" },
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      task_name: { type: "string" },
                      category: { type: "string" },
                      days_from_sowing: { type: "integer" },
                      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      description: { type: "string" },
                      quantity: { type: "string" },
                      product_details: { type: "string" },
                      estimated_cost: { type: "number" },
                      instructions: { type: "array", items: { type: "string" } },
                      precautions: { type: "array", items: { type: "string" } },
                      yield_impact: { type: "string" },
                      skip_penalty: { type: "string" }
                    },
                    required: ["task_name", "category", "days_from_sowing", "priority", "description", "instructions"]
                  }
                }
              },
              required: ["crop_name", "total_duration_days", "tasks"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_crop_schedule" } }
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('❌ AI error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const message = aiData.choices[0].message;
    
    if (!message.tool_calls?.[0]) {
      throw new Error('AI did not return structured schedule');
    }

    const scheduleData = JSON.parse(message.tool_calls[0].function.arguments);
    console.log(`✅ [AI] Generated ${scheduleData.tasks?.length || 0} tasks`);

    if (!scheduleData.tasks?.length) {
      throw new Error('AI returned empty schedule');
    }

    // Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from('crop_schedules')
        .update({ is_active: false })
        .eq('land_id', landId)
        .eq('is_active', true);
    }

    // Calculate harvest date
    const harvestDate = new Date(sowingDateParsed);
    harvestDate.setDate(harvestDate.getDate() + (scheduleData.total_duration_days || 120));
    const harvestDateStr = harvestDate.toISOString().split('T')[0];

    // Save schedule
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety || scheduleData.crop_variety,
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        expected_yield_quintals: scheduleData.expected_yield_quintals,
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
          isReadyMadePlant,
          land_area: land.area_acres,
          npk_deficit: { n: nDeficit, p: pDeficit, k: kDeficit }
        }
      })
      .select()
      .single();

    if (scheduleError) {
      console.error('❌ Schedule save error:', scheduleError);
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    console.log(`✅ [DB] Schedule saved: ${savedSchedule.id}`);

    // Prepare and insert tasks
    const defaultPrecautions = language === 'mr' 
      ? ["मास्क वापरा", "हातमोजे घाला", "मुलांना दूर ठेवा"]
      : ["मास्क पहनो", "दस्ताने पहनो", "बच्चों को दूर रखो"];

    const tasksToInsert = scheduleData.tasks.map((task: any, index: number) => {
      const taskDate = new Date(sowingDateParsed);
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing ?? index * 7));
      
      return {
        schedule_id: savedSchedule.id,
        task_date: taskDate.toISOString().split('T')[0],
        task_type: task.category || 'other',
        task_name: task.task_name,
        task_description: task.description,
        status: 'pending',
        priority: task.priority || 'medium',
        weather_dependent: task.weather_dependent || false,
        instructions: task.instructions || [task.description],
        precautions: task.precautions?.length ? task.precautions : defaultPrecautions,
        resources: {
          quantity: task.quantity || `${land.area_acres} acres`,
          product_details: task.product_details,
          yield_impact: task.yield_impact,
          skip_penalty: task.skip_penalty,
          days_from_sowing: task.days_from_sowing
        },
        estimated_cost: task.estimated_cost,
        currency: 'INR'
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error('❌ Tasks insert error:', tasksError);
    } else {
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule complete in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName,
        sowingDate,
        totalTasks: scheduleData.tasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: scheduleData.total_estimated_cost,
        expectedProfit: scheduleData.expected_profit,
        executionTimeMs: executionTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [AI-Schedule] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Schedule generation failed',
        executionTimeMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
