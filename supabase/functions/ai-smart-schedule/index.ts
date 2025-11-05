import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const { landId, cropName, cropVariety, sowingDate, weather, regenerate, tenantId, farmerId } = await req.json();

    console.log(`AI Schedule Generation - Land: ${landId}, Crop: ${cropName}, Farmer: ${farmerId}`);

    // 1. Fetch comprehensive land details
    const { data: land, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .single();

    if (landError || !land) {
      throw new Error('Land not found');
    }

    // 2. Fetch baseline crop guidelines
    const { data: guidelines } = await supabase
      .from('crop_baseline_guidelines')
      .select('*')
      .eq('crop_name', cropName)
      .eq('is_active', true)
      .order('confidence_level', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Fetch recent NDVI data if available
    const { data: ndviData } = await supabase
      .from('ndvi_cache')
      .select('*')
      .eq('land_id', landId)
      .order('cached_at', { ascending: false })
      .limit(5);

    // 4. Build comprehensive AI prompt
    const systemPrompt = `You are an expert agricultural AI system for KisanShakti AI. 
Generate a detailed, actionable crop schedule that considers:
- Expert agricultural guidelines and best practices
- Real-time weather forecasts and seasonal patterns
- Soil health indicators (type, pH, NPK levels)
- Regional climate and water availability
- Growth stages and critical development periods
- NDVI vegetation health data when available

Provide explainable reasoning for each decision and ensure all recommendations are:
- Scientifically sound and region-appropriate
- Practical and implementable by farmers
- Optimized for crop yield and sustainability
- Multi-lingual ready (provide key terms in local languages)`;

    const userPrompt = `Generate a comprehensive crop schedule for:

**CROP DETAILS:**
- Crop: ${cropName}${cropVariety ? ` (Variety: ${cropVariety})` : ''}
- Sowing Date: ${sowingDate}

**LAND DETAILS:**
- Location: ${land.location || 'Not specified'}
- Area: ${land.area} ${land.area_unit}
- Soil Type: ${land.soil_type || 'Not specified'}
- Soil pH: ${land.soil_ph || 'Not specified'}
- NPK Levels: N=${land.nitrogen || '?'}, P=${land.phosphorus || '?'}, K=${land.potassium || '?'}
- Irrigation: ${land.irrigation_type || 'Not specified'}
- Water Source: ${land.water_source || 'Not specified'}

**WEATHER FORECAST:**
${JSON.stringify(weather || {}, null, 2)}

${guidelines ? `**EXPERT GUIDELINES:**
- Growth Duration: ${guidelines.growth_duration_days} days
- Optimal Temperature: ${guidelines.optimal_temp_min}°C - ${guidelines.optimal_temp_max}°C
- Water Requirement: ${guidelines.water_requirement_mm}mm
- Best Practices: ${guidelines.best_practices}
- Common Pests: ${JSON.stringify(guidelines.common_pests)}
- Common Diseases: ${JSON.stringify(guidelines.common_diseases)}` : ''}

${ndviData && ndviData.length > 0 ? `**RECENT NDVI DATA:**
${ndviData.map((n: any) => `- Date: ${n.cached_at}, NDVI: ${n.ndvi_value}`).join('\n')}` : ''}

Generate a JSON schedule with this EXACT structure:
{
  "crop_name": "string",
  "total_duration_days": number,
  "confidence_score": 0-1,
  "ai_reasoning": "detailed explanation of all decisions made",
  "risk_factors": ["list of potential risks"],
  "optimization_notes": "notes on how this schedule is optimized",
  "tasks": [
    {
      "task_name": "string",
      "category": "irrigation|fertilizer|pest_control|disease_control|weed_management|harvesting|soil_preparation",
      "days_from_sowing": number,
      "priority": "low|medium|high|critical",
      "description": "detailed instructions in simple language",
      "reason": "why this task at this time",
      "inputs_needed": ["list of materials/inputs"],
      "estimated_cost": number,
      "weather_dependency": "how weather affects this task",
      "success_indicators": ["what to look for"]
    }
  ]
}`;

    // 5. Call OpenAI GPT-5-mini
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 4096,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 401) {
        throw new Error('Invalid OpenAI API key. Please check your configuration.');
      }
      
      throw new Error(`OpenAI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const scheduleData = JSON.parse(aiData.choices[0].message.content);

    // 6. Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase
        .from('crop_schedules')
        .update({ is_active: false })
        .eq('land_id', landId)
        .eq('is_active', true);
    }

    // 7. Save main schedule
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety,
        sowing_date: sowingDate,
        harvest_date: new Date(new Date(sowingDate).getTime() + scheduleData.total_duration_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        schedule_data: scheduleData,
        is_active: true,
      })
      .select()
      .single();

    if (scheduleError) throw scheduleError;

    // 8. Save individual tasks
    const tasks = scheduleData.tasks.map((task: any) => ({
      schedule_id: savedSchedule.id,
      tenant_id: tenantId,
      farmer_id: farmerId,
      land_id: landId,
      task_name: task.task_name,
      task_category: task.category,
      description: task.description,
      due_date: new Date(new Date(sowingDate).getTime() + task.days_from_sowing * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: task.priority,
      status: 'pending',
      task_data: task,
    }));

    await supabase.from('schedule_tasks').insert(tasks);

    // 9. Log AI decision
    const executionTime = Date.now() - startTime;
    await supabase.from('ai_decision_log').insert({
      tenant_id: tenantId,
      farmer_id: farmerId,
      land_id: landId,
      schedule_id: savedSchedule.id,
      decision_type: 'schedule_generation',
      model_version: 'openai/gpt-5-mini-2025-08-07',
      input_data: { landId, cropName, cropVariety, sowingDate },
      output_data: scheduleData,
      reasoning: scheduleData.ai_reasoning,
      confidence_score: scheduleData.confidence_score,
      execution_time_ms: executionTime,
      weather_data: weather,
      ndvi_data: ndviData,
      soil_data: { soil_type: land.soil_type, soil_ph: land.soil_ph, npk: { n: land.nitrogen, p: land.phosphorus, k: land.potassium } },
      success: true,
    });

    console.log(`Schedule generated successfully in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        schedule_id: savedSchedule.id,
        schedule: scheduleData,
        execution_time_ms: executionTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-smart-schedule:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
