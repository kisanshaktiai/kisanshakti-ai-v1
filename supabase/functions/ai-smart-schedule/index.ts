import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from '../_shared/aiConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

// Rural language examples for TRUE village speech
const ruralExamples = {
  hi: {
    irrigation: [
      "भाऊ, आज पानी देने का वक्त आ गया है",
      "पौधों को प्यास लगी है, पानी दो",
      "कल बारिश होगी तो आज पानी मत दो"
    ],
    fertilizer: [
      "खेत में दम नहीं रहा, खाद डालो",
      "पत्ते पीले पड़ रहे हैं, यूरिया डालो",
      "जड़ें मजबूत करने के लिए DAP डालो"
    ],
    pesticide: [
      "कीड़े लग गए हैं, फौरन दवाई छिड़को",
      "पत्तों पर धब्बे दिख रहे हैं, फफूंदनाशक डालो",
      "सुबह जल्दी फवारणी करो, धूप में दवाई उड़ जाती है"
    ],
    precautions: [
      "दवाई छिड़कते वक्त मुंह पर कपड़ा बांधो",
      "बच्चों को दूर रखो",
      "खाली पेट दवाई मत छिड़को",
      "हवा की दिशा देखकर छिड़काव करो"
    ]
  },
  mr: {
    irrigation: [
      "भाऊ, आज पाणी द्यायची वेळ आली",
      "पिकाला तहान लागली, पाणी दे",
      "उद्या पाऊस येणार, आज पाणी देऊ नको"
    ],
    fertilizer: [
      "जमिनीला ताकद नाही राहिली, खत टाक",
      "पानं पिवळी पडतायत, युरिया टाक",
      "मुळं भक्कम करायला DAP टाक"
    ],
    pesticide: [
      "किड लागली, लगेच औषध फवार",
      "पानांवर डाग दिसतायत, बुरशीनाशक टाक",
      "सकाळी लवकर फवारणी कर, उन्हात औषध उडून जातं"
    ],
    precautions: [
      "औषध फवारताना तोंडावर कापड बांध",
      "पोरांना दूर ठेव",
      "उपाशीपोटी औषध फवारू नको",
      "वाऱ्याची दिशा बघून फवारणी कर"
    ]
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const OPENAI_API_KEY = validateOpenAIKey();
    console.log(`🤖 [AI-Schedule] Using model: ${AI_CONFIG.MODEL}`);
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required headers', details: 'x-tenant-id and x-farmer-id headers are required' }),
        { status: 401, headers: corsHeaders }
      );
    }
    
    const { landId, cropName, cropVariety, sowingDate, isReadyMadePlant = false, weather, regenerate, language = 'hi', country = 'India' } = await req.json();
    
    console.log('🌐 [AI-Schedule] Received language:', language);

    const rateLimitKey = `${tenantId}:${farmerId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'ai-smart-schedule', { maxRequests: 30, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', resetTime: new Date(rateLimit.resetTime).toISOString() }),
        { status: 429, headers: { ...corsHeaders, 'X-RateLimit-Remaining': String(rateLimit.remaining) } }
      );
    }

    console.log(`📍 AI Schedule - Land: ${landId}, Crop: ${cropName}, Farmer: ${farmerId}`);

    // 1. Fetch comprehensive land details
    const { data: land, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .single();

    if (landError || !land) throw new Error('Land not found');

    // 2. Fetch crop baseline guidelines
    const { data: guidelines } = await supabase
      .from('crop_baseline_guidelines')
      .select('*')
      .eq('crop_name', cropName)
      .eq('is_active', true)
      .order('confidence_level', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Fetch recent NDVI data
    const { data: ndviData } = await supabase
      .from('ndvi_cache')
      .select('*')
      .eq('land_id', landId)
      .order('cached_at', { ascending: false })
      .limit(5);

    console.log('📊 Land Context:', {
      area: land.area_acres,
      soilType: land.soil_type,
      irrigation: land.irrigation_type,
      ndviPoints: ndviData?.length || 0,
      hasSoilData: !!(land.nitrogen_kg_per_ha || land.phosphorus_kg_per_ha)
    });

    // 4. Language & Regional Context
    const languageMap: Record<string, string> = {
      hi: 'Hindi', mr: 'Marathi', pa: 'Punjabi', ta: 'Tamil', te: 'Telugu',
      bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', en: 'English'
    };

    const languageName = languageMap[language] || 'Hindi';
    const examples = ruralExamples[language as keyof typeof ruralExamples] || ruralExamples.hi;

    // 5. Calculate NPK deficit
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    
    const targetNPK: Record<string, {n: number, p: number, k: number}> = {
      'Wheat': {n: 120, p: 60, k: 40}, 'Rice': {n: 120, p: 60, k: 40},
      'Cotton': {n: 120, p: 60, k: 50}, 'Maize': {n: 150, p: 75, k: 50},
      'Sugarcane': {n: 250, p: 115, k: 115}, 'Soybean': {n: 30, p: 60, k: 40},
      'Default': {n: 100, p: 50, k: 40}
    };
    
    const target = targetNPK[cropName] || targetNPK['Default'];
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // 6. Build NDVI health context
    const ndviStatus = ndviData && ndviData.length > 0 ? {
      value: ndviData[0].ndvi_value,
      status: ndviData[0].ndvi_value > 0.6 ? 'अच्छी' : 
              ndviData[0].ndvi_value > 0.4 ? 'ठीक-ठाक' :
              ndviData[0].ndvi_value > 0.2 ? 'कमजोर' : 'बहुत खराब',
      action: ndviData[0].ndvi_value < 0.4 ? 'खाद की मात्रा 25% बढ़ाओ!' : 'सामान्य खाद दो'
    } : null;

    // 7. Build CLEAR & SIMPLE system prompt
    const systemPrompt = `तू एक 50 साल के अनुभवी किसान हो। गाँव के भाई को सलाह दे रहे हो। किताबी भाषा नहीं बोलनी!

🎯 काम: ${land.area_acres} एकड़ जमीन के लिए ${cropName} का पूरा वेळापत्रक बनाना है।

⚠️ भाषा के नियम (सबसे जरूरी!):
❌ गलत: "सिंचन प्रबंधन करें", "उर्वरक अनुप्रयोग", "कीटनाशक व्यवस्थापन"
✅ सही: "पानी दो", "खाद डालो", "दवाई छिड़को"

${language === 'mr' ? `
मराठी उदाहरणे (असंच बोलायचं):
${examples.irrigation.map((e: string) => `• ${e}`).join('\n')}
${examples.fertilizer.map((e: string) => `• ${e}`).join('\n')}
${examples.pesticide.map((e: string) => `• ${e}`).join('\n')}
` : `
हिंदी उदाहरण (ऐसे ही बोलना है):
${examples.irrigation.map((e: string) => `• ${e}`).join('\n')}
${examples.fertilizer.map((e: string) => `• ${e}`).join('\n')}
${examples.pesticide.map((e: string) => `• ${e}`).join('\n')}
`}

📊 इस जमीन की जानकारी:
• क्षेत्र: ${land.area_acres} एकड़ (${landAreaHa.toFixed(2)} हेक्टेयर)
• जगह: ${land.village || ''}, ${land.district}, ${land.state}
• मिट्टी: ${land.soil_type || 'काली/दोमट'}
• पानी: ${land.irrigation_type || 'बोरवेल/कुआं'}
• pH: ${land.soil_ph || '6.5-7.5'}

🧪 मिट्टी में पोषक तत्व (kg/ha):
• नाइट्रोजन: ${currentN} (चाहिए: ${target.n}, कमी: ${nDeficit.toFixed(0)})
• फॉस्फोरस: ${currentP} (चाहिए: ${target.p}, कमी: ${pDeficit.toFixed(0)})  
• पोटाश: ${currentK} (चाहिए: ${target.k}, कमी: ${kDeficit.toFixed(0)})

📦 ${land.area_acres} एकड़ के लिए खाद (अंदाजा):
• यूरिया: ${((nDeficit * landAreaHa) / 0.46).toFixed(0)} kg
• DAP: ${((pDeficit * landAreaHa) / 0.18).toFixed(0)} kg
• MOP: ${((kDeficit * landAreaHa) / 0.60).toFixed(0)} kg

${ndviStatus ? `
🛰️ सैटेलाइट से फसल की हालत: ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}
करना होगा: ${ndviStatus.action}
` : ''}

💰 खर्च के नियम:
• सारी कीमतें "₹" में लिखना ($ नहीं!)
• "अंदाजे ₹500" ऐसे लिखना
• 2024-25 के भाव

🌿 खाद की प्राथमिकता:
1. गोबर की खाद, कंपोस्ट (पहले)
2. जैविक खाद - अजोटोबैक्टर, PSB
3. रासायनिक खाद (सिर्फ कमी पूरी करने को)

🧪 दवाई/खाद के साथ जरूर बताना:
• नाम (ब्रांड + साल्ट नाम)
• सक्रिय तत्व और % (जैसे: "इमिडाक्लोप्रिड 17.8% SL")
• कितना लगेगा (जैसे: "50 kg यूरिया 1 एकड़ के लिए")

भाषा: ${languageName} - पूरा जवाब इसी भाषा में!`;

    const userPrompt = `भाई, मेरे ${land.area_acres} एकड़ खेत में ${cropName}${cropVariety ? ` (${cropVariety})` : ''} ${isReadyMadePlant ? 'लगाना' : 'बोना'} है।

📅 तारीख: ${sowingDate}
📍 जगह: ${land.district}, ${land.state}
💧 पानी: ${land.irrigation_type || 'बोरवेल'}
🌾 मिट्टी: ${land.soil_type || 'काली मिट्टी'}

मिट्टी में खाद:
• N=${currentN}, P=${currentP}, K=${currentK} kg/ha (अभी है)
• N=${target.n}, P=${target.p}, K=${target.k} kg/ha (चाहिए)
• कमी: N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha

${ndviStatus ? `सैटेलाइट से: ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}` : ''}

${weather?.forecast ? `अगले हफ्ते मौसम:
${weather.forecast.filter((f: any) => f.rainfall > 5).map((f: any) => `• दिन ${f.day}: ${f.rainfall}mm बारिश`).join('\n') || '• कोई बड़ी बारिश नहीं'}
` : ''}

पूरा वेळापत्रक बताओ (12-15 काम):
1. जमीन तैयारी
2. ${isReadyMadePlant ? 'पौधे लगाना' : 'बीज बोना'}
3. पानी कब देना (5-6 बार)
4. खाद कब डालना (3-4 बार) - गोबर + रासायनिक
5. कीड़े-रोग की दवाई (2-3 बार)
6. घास निकालना (2 बार)
7. कटाई

हर काम के लिए बताना:
✅ क्या करना है
✅ कितना सामान लगेगा (${land.area_acres} एकड़ के हिसाब से)
✅ खाद/दवाई का नाम + सक्रिय तत्व
✅ कैसे करना है (step by step)
✅ क्या सावधानी रखनी है (2-3 बातें)
✅ कौन से मौसम में करना है
✅ कितना खर्च आएगा

आखिर में बताओ:
• कितनी फसल होगी (क्विंटल में)
• कुल खर्च
• कमाई

भाषा: ${languageName} - गाँव वाली भाषा में बोलो!`;

    // 8. Call OpenAI
    const requestBody = {
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
          description: "Generate agricultural schedule with land-specific recommendations",
          parameters: {
            type: "object",
            properties: {
              crop_name: { type: "string" },
              crop_season: { type: "string" },
              total_duration_days: { type: "integer" },
              expected_yield_quintals: { type: "number" },
              expected_yield_per_acre: { type: "number" },
              expected_market_price_per_quintal: { type: "number" },
              expected_gross_revenue: { type: "number" },
              expected_net_profit: { type: "number" },
              total_estimated_cost: { type: "number" },
              icar_reference: { type: "string" },
              seed_quantity_kg: { type: "number" },
              seed_details: { type: "string" },
              organic_inputs: {
                type: "object",
                properties: {
                  fym_kg: { type: "number" },
                  compost_kg: { type: "number" },
                  vermicompost_kg: { type: "number" }
                }
              },
              chemical_fertilizers: {
                type: "object",
                properties: {
                  urea_kg: { type: "number" },
                  dap_kg: { type: "number" },
                  mop_kg: { type: "number" }
                }
              },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_name: { type: "string", description: "Rural language task name" },
                    category: { 
                      type: "string",
                      enum: ["soil_preparation", "sowing", "irrigation", "fertilizer", "pest_control", "weed_management", "harvesting"]
                    },
                    days_from_sowing: { type: "integer" },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                    description: { type: "string", description: "Why this task matters, in rural speech" },
                    quantity: { type: "string", description: "Exact amount like '50 kg यूरिया' or '2000 लीटर पानी'" },
                    product_details: { type: "string", description: "Product name + active ingredient + percentage" },
                    estimated_cost: { type: "number" },
                    instructions: { type: "array", items: { type: "string" } },
                    precautions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
                    weather_dependent: { type: "boolean" },
                    icar_guideline: { type: "string", description: "ICAR recommendation if applicable" },
                    climate_risk: { type: "string", description: "Weather risk warning if any" },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string" },
                        humidity: { type: "string" },
                        conditions: { type: "string" }
                      }
                    }
                  },
                  required: ["task_name", "category", "days_from_sowing", "priority", "description", "instructions", "precautions"]
                }
              }
            },
            required: ["crop_name", "total_duration_days", "tasks"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "create_crop_schedule" } },
    };
    
    console.log('🤖 Calling AI API:', { model: requestBody.model, promptLength: systemPrompt.length + userPrompt.length });
    
    const aiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      if (aiResponse.status === 429) throw new Error('Rate limit exceeded');
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const responseText = await aiResponse.text();
    const aiData = JSON.parse(responseText);
    
    const message = aiData.choices[0].message;
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.error('No tool call in response:', message.content?.substring(0, 500));
      throw new Error('AI did not return structured schedule');
    }

    const toolCall = message.tool_calls[0];
    let scheduleData = JSON.parse(toolCall.function.arguments);
    
    console.log('✓ Schedule:', scheduleData.crop_name, scheduleData.total_duration_days, 'days,', scheduleData.tasks?.length, 'tasks');

    if (!scheduleData.tasks || scheduleData.tasks.length === 0) {
      throw new Error('AI returned empty schedule');
    }

    // 9. POST-PROCESSING: Fix null/empty values and ensure quality
    const defaultPrecautions = language === 'mr' 
      ? ["औषध फवारताना तोंडावर कापड बांधा", "पोरांना दूर ठेवा", "हातात ग्लोव्ह्ज घाला"]
      : ["दवाई छिड़कते वक्त मुंह पर कपड़ा बांधो", "बच्चों को दूर रखो", "हाथों में दस्ताने पहनो"];

    scheduleData.tasks = scheduleData.tasks.map((task: any) => {
      // Fix precautions - ensure it's an array with meaningful values
      if (!task.precautions || !Array.isArray(task.precautions) || task.precautions.length < 2) {
        task.precautions = defaultPrecautions;
      } else {
        // Filter out empty strings and single characters
        task.precautions = task.precautions.filter((p: string) => p && p.length > 3);
        if (task.precautions.length < 2) {
          task.precautions = defaultPrecautions;
        }
      }

      // Fix instructions - ensure array
      if (!task.instructions || !Array.isArray(task.instructions) || task.instructions.length === 0) {
        task.instructions = [task.description || "कृपया विवरण देखें"];
      }

      // Ensure quantity has value
      if (!task.quantity || task.quantity === 'null' || task.quantity.trim() === '') {
        if (task.category === 'irrigation') {
          task.quantity = `${(land.area_acres * 1000).toFixed(0)} लीटर पानी`;
        } else if (task.category === 'fertilizer') {
          task.quantity = `${(land.area_acres * 25).toFixed(0)} kg खाद`;
        }
      }

      // Ensure product_details has value for relevant tasks
      if (!task.product_details || task.product_details === 'null') {
        if (task.category === 'fertilizer') {
          task.product_details = "यूरिया (46% नाइट्रोजन) या DAP (18% N + 46% P)";
        } else if (task.category === 'pest_control' || task.category === 'pesticide') {
          task.product_details = "इमिडाक्लोप्रिड 17.8% SL या क्लोरपायरीफॉस 20% EC";
        }
      }

      // Ensure ICAR guideline
      if (!task.icar_guideline || task.icar_guideline === 'null') {
        task.icar_guideline = `ICAR ${cropName} मार्गदर्शिका अनुसार`;
      }

      // Ensure climate risk
      if (!task.climate_risk || task.climate_risk === 'null') {
        if (task.weather_dependent) {
          task.climate_risk = "बारिश/तेज धूप में न करें";
        }
      }

      // Ensure ideal_weather
      if (!task.ideal_weather || typeof task.ideal_weather !== 'object') {
        task.ideal_weather = {
          temperature: "25-30",
          humidity: "60-70",
          conditions: "साफ मौसम"
        };
      }

      return task;
    });

    // 10. Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from('crop_schedules').update({ is_active: false })
        .eq('land_id', landId).eq('is_active', true);
    }

    // 11. Save schedule with all context for training
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety || scheduleData.crop_variety,
        crop_season: scheduleData.crop_season,
        sowing_date: sowingDate,
        expected_harvest_date: new Date(new Date(sowingDate).getTime() + (scheduleData.total_duration_days || 120) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_active: true,
        status: 'active',
        expected_yield_quintals: scheduleData.expected_yield_quintals || scheduleData.expected_yield_per_acre * land.area_acres,
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
          land_context: {
            area_acres: land.area_acres,
            soil_type: land.soil_type,
            irrigation_type: land.irrigation_type,
            npk: { current: { n: currentN, p: currentP, k: currentK }, target, deficit: { n: nDeficit, p: pDeficit, k: kDeficit } }
          },
          ndvi_status: ndviStatus,
          weather_at_generation: weather?.current,
          prompt_version: 'v3_rural_enhanced'
        },
        ai_response_metadata: {
          organic_inputs: scheduleData.organic_inputs,
          chemical_fertilizers: scheduleData.chemical_fertilizers,
          icar_reference: scheduleData.icar_reference,
          seed_details: scheduleData.seed_details
        }
      })
      .select()
      .single();

    if (scheduleError || !savedSchedule) {
      console.error('Schedule save error:', scheduleError);
      throw new Error('Failed to save schedule');
    }

    console.log(`✓ Schedule saved: ${savedSchedule.id}`);

    // 12. Prepare and insert tasks
    const tasksToInsert = scheduleData.tasks.map((task: any, index: number) => {
      const taskDate = new Date(sowingDate);
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing || index * 7));
      
      return {
        schedule_id: savedSchedule.id,
        tenant_id: tenantId,
        farmer_id: farmerId,
        task_date: taskDate.toISOString().split('T')[0],
        task_type: task.category || 'other',
        task_name: task.task_name,
        task_description: task.description,
        status: 'pending',
        priority: task.priority || 'medium',
        weather_dependent: task.weather_dependent || false,
        instructions: task.instructions || [],
        precautions: task.precautions || [],
        resources: {
          quantity: task.quantity,
          product_details: task.product_details,
          icar_guideline: task.icar_guideline,
          climate_risk: task.climate_risk,
          ideal_weather: task.ideal_weather
        },
        ideal_weather: task.ideal_weather,
        estimated_cost: task.estimated_cost,
        currency: 'INR',
        metadata: {
          days_from_sowing: task.days_from_sowing,
          ai_generated: true,
          land_area: land.area_acres
        }
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) console.error('Tasks insert error:', tasksError);
    else console.log(`✓ Inserted ${insertedTasks?.length || 0} tasks`);

    // 13. Log for AI training (non-blocking)
    try {
      const { error: logError } = await supabase.from('ai_decision_log').insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        schedule_id: savedSchedule.id,
        decision_type: 'schedule_generation',
        input_data: {
          land: { area: land.area_acres, soil: land.soil_type, irrigation: land.irrigation_type, npk: { n: currentN, p: currentP, k: currentK } },
          crop: cropName,
          sowingDate,
          weather: weather?.current,
          ndvi: ndviStatus
        },
        output_data: scheduleData,
        reasoning: `Generated ${scheduleData.tasks.length} tasks for ${cropName} on ${land.area_acres} acres with ${land.soil_type || 'unknown'} soil`,
        model_version: AI_CONFIG.MODEL,
        success: true,
        execution_time_ms: Date.now() - startTime
      });
      if (logError) console.warn('Failed to log decision:', logError);
    } catch (e) {
      console.warn('Failed to log decision:', e);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule generated in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName: scheduleData.crop_name,
        totalTasks: scheduleData.tasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: scheduleData.total_estimated_cost,
        executionTimeMs: executionTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ AI Schedule Error:', error);
    return new Response(
      JSON.stringify({ error: error.message, details: 'Failed to generate crop schedule' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
