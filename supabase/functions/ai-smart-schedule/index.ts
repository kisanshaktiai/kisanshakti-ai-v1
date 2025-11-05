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
      console.error('OPENAI_API_KEY is not configured in Supabase secrets');
      throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in Supabase secrets.');
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
- Location: ${land.village || land.taluka || land.district || 'Not specified'}, ${land.district || ''}, ${land.state || ''}
- Area: ${land.area_acres || 'N/A'} acres${land.area_guntas ? ` (${land.area_guntas} guntas)` : ''}
- Soil Type: ${land.soil_type || 'Not specified'}
- Soil pH: ${land.soil_ph || 'Not specified'}
- NPK Levels: N=${land.nitrogen_kg_per_ha || '?'} kg/ha, P=${land.phosphorus_kg_per_ha || '?'} kg/ha, K=${land.potassium_kg_per_ha || '?'} kg/ha
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

    // 5. Validate critical data before calling OpenAI
    console.log('Validating land data:', {
      hasArea: !!land.area_acres,
      hasSoilType: !!land.soil_type,
      hasNPK: !!(land.nitrogen_kg_per_ha || land.phosphorus_kg_per_ha || land.potassium_kg_per_ha),
      hasLocation: !!(land.village || land.taluka || land.district)
    });
    
    if (!land.area_acres) {
      console.warn('Missing area_acres - this may affect AI quality');
    }

    // 6. Call OpenAI GPT-5-mini with explicit JSON instructions
    const enhancedUserPrompt = userPrompt + '\n\nIMPORTANT: Return ONLY valid JSON in the exact structure specified above. Do not include any explanatory text before or after the JSON.';
    
    const requestBody = {
      model: 'gpt-5-mini-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: enhancedUserPrompt }
      ],
      tools: [{
        type: "function",
        function: {
          name: "create_crop_schedule",
          description: "Generate a comprehensive agricultural crop schedule with tasks and recommendations",
          parameters: {
            type: "object",
            properties: {
              crop_name: { type: "string", description: "Name of the crop" },
              total_duration_days: { type: "integer", description: "Total growing duration in days" },
              confidence_score: { type: "number", minimum: 0, maximum: 1, description: "Confidence in recommendations (0-1)" },
              ai_reasoning: { type: "string", description: "Brief explanation of key decisions" },
              risk_factors: { 
                type: "array", 
                items: { type: "string" },
                description: "List of potential risks"
              },
              optimization_notes: { type: "string", description: "Notes on schedule optimization" },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_name: { type: "string" },
                    category: { 
                      type: "string",
                      enum: ["irrigation", "fertilizer", "pest_control", "disease_control", "weed_management", "harvesting", "soil_preparation"]
                    },
                    days_from_sowing: { type: "integer" },
                    priority: { 
                      type: "string",
                      enum: ["low", "medium", "high", "critical"]
                    },
                    description: { type: "string" },
                    reason: { type: "string" },
                    inputs_needed: { 
                      type: "array",
                      items: { type: "string" }
                    },
                    estimated_cost: { type: "number" },
                    weather_dependency: { type: "string" },
                    success_indicators: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["task_name", "category", "days_from_sowing", "priority", "description"]
                }
              }
            },
            required: ["crop_name", "total_duration_days", "tasks", "confidence_score"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "create_crop_schedule" } },
      max_completion_tokens: 8192,
    };
    
    console.log('Calling OpenAI API with model:', requestBody.model);
    console.log('Prompt stats - System:', systemPrompt.length, 'chars, User:', enhancedUserPrompt.length, 'chars');
    console.log('Estimated tokens:', Math.ceil((systemPrompt.length + enhancedUserPrompt.length) / 4));
    
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log('OpenAI API response status:', aiResponse.status);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }
      if (aiResponse.status === 401) {
        throw new Error('Invalid OpenAI API key. Please check your configuration.');
      }
      
      throw new Error(`OpenAI API error: ${aiResponse.status} - ${errorText}`);
    }

    // Parse OpenAI response with comprehensive error handling
    let aiData;
    let responseText;
    try {
      responseText = await aiResponse.text();
      console.log('Full response length:', responseText.length);
      console.log('OpenAI response (first 500 chars):', responseText.substring(0, 500));
      
      aiData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.error('Raw response text:', responseText || 'Unable to read response');
      throw new Error('Invalid JSON response from OpenAI API');
    }

    // Validate response structure
    if (!aiData.choices || !aiData.choices[0] || !aiData.choices[0].message) {
      console.error('Invalid OpenAI response structure:', JSON.stringify(aiData));
      throw new Error('OpenAI API returned invalid response structure');
    }

    // Extract from tool call instead of message content
    const message = aiData.choices[0].message;

    // Check if tool call exists
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.error('No tool call in OpenAI response');
      console.error('Full message:', JSON.stringify(message));
      console.error('Finish reason:', aiData.choices[0].finish_reason);
      throw new Error('OpenAI did not return a tool call. The model may not support function calling.');
    }

    const toolCall = message.tool_calls[0];
    console.log('✓ Tool call received:', toolCall.function.name);
    console.log('✓ Arguments length:', toolCall.function.arguments.length);

    // Log token usage for monitoring
    if (aiData.usage) {
      console.log('Token Usage:', {
        prompt_tokens: aiData.usage.prompt_tokens,
        completion_tokens: aiData.usage.completion_tokens,
        total_tokens: aiData.usage.total_tokens,
        finish_reason: aiData.choices[0].finish_reason,
        used_tool_call: true
      });
      
      // Warn if approaching limit
      if (aiData.usage.completion_tokens > 7000) {
        console.warn('⚠️ Response approaching token limit. Consider simplifying prompt.');
      }
      
      // Critical: Check if response was truncated
      if (aiData.choices[0].finish_reason === 'length') {
        console.error('❌ Response truncated due to token limit!');
        throw new Error('OpenAI response was truncated. The schedule may be incomplete. Please try again or contact support.');
      }
    }

    // Parse the schedule data from tool call arguments
    let scheduleData;
    try {
      scheduleData = JSON.parse(toolCall.function.arguments);
      console.log('✓ Schedule data parsed successfully from tool call');
      console.log('✓ Crop:', scheduleData.crop_name);
      console.log('✓ Duration:', scheduleData.total_duration_days, 'days');
      console.log('✓ Tasks count:', scheduleData.tasks?.length || 0);
      console.log('✓ Confidence:', scheduleData.confidence_score);
    } catch (parseError) {
      console.error('Failed to parse tool call arguments as JSON:', parseError);
      console.error('Raw arguments:', toolCall.function.arguments);
      throw new Error('AI returned invalid JSON format for schedule');
    }

    // Validate required fields
    if (!scheduleData.crop_name || !scheduleData.tasks || scheduleData.tasks.length === 0) {
      console.error('Invalid schedule structure:', {
        hasCropName: !!scheduleData.crop_name,
        hasTasks: !!scheduleData.tasks,
        taskCount: scheduleData.tasks?.length || 0
      });
      throw new Error('AI returned incomplete schedule data');
    }

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
      soil_data: { 
        soil_type: land.soil_type, 
        soil_ph: land.soil_ph, 
        npk: { 
          n: land.nitrogen_kg_per_ha, 
          p: land.phosphorus_kg_per_ha, 
          k: land.potassium_kg_per_ha 
        } 
      },
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
