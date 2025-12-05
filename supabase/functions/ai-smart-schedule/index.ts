import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from '../_shared/aiConfig.ts';
import { ruralLanguageGuide, icarGuidelines, getIcarGuidance, getClimateAlerts } from '../_shared/ruralLanguageGuide.ts';

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

    // 1. Fetch comprehensive land details with ALL context
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

    // 3. Fetch recent NDVI data (satellite vegetation health)
    const { data: ndviData } = await supabase
      .from('ndvi_cache')
      .select('*')
      .eq('land_id', landId)
      .order('cached_at', { ascending: false })
      .limit(5);

    // 4. Fetch soil test reports if available
    const { data: soilReports } = await supabase
      .from('lands')
      .select('soil_type, soil_ph, organic_carbon_percent, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, last_soil_test_date')
      .eq('id', landId)
      .single();

    console.log('📊 Land Context:', {
      area: land.area_acres,
      soilType: land.soil_type,
      irrigation: land.irrigation_type,
      ndviPoints: ndviData?.length || 0,
      hasSoilData: !!(soilReports?.nitrogen_kg_per_ha || soilReports?.phosphorus_kg_per_ha)
    });

    // 5. Language & Regional Context
    const languageMap: Record<string, string> = {
      hi: 'Hindi', mr: 'Marathi', pa: 'Punjabi', ta: 'Tamil', te: 'Telugu',
      bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', en: 'English'
    };

    const regionalData: Record<string, any> = {
      'Punjab': { season: 'Rabi', zone: 'Trans-Gangetic Plains' },
      'Haryana': { season: 'Rabi', zone: 'Trans-Gangetic Plains' },
      'Maharashtra': { season: 'Kharif', zone: 'Western Maharashtra Plains' },
      'Karnataka': { season: 'Kharif', zone: 'Deccan Plateau' },
      'Tamil Nadu': { season: 'Samba', zone: 'Cauvery Delta' },
      'Andhra Pradesh': { season: 'Kharif', zone: 'Coastal Andhra' },
      'Telangana': { season: 'Kharif', zone: 'Telangana Plateau' },
      'Uttar Pradesh': { season: 'Rabi', zone: 'Indo-Gangetic Plains' },
      'West Bengal': { season: 'Kharif', zone: 'Gangetic Delta' },
      'Gujarat': { season: 'Kharif', zone: 'Gujarat Plains' },
      'Madhya Pradesh': { season: 'Kharif', zone: 'Central Highlands' },
      'Rajasthan': { season: 'Kharif', zone: 'Western Arid Region' }
    };

    const region = regionalData[land.state] || { season: 'Monsoon', zone: 'Local' };
    const languageName = languageMap[language] || 'Hindi';
    const ruralTerms = ruralLanguageGuide[language] || ruralLanguageGuide['hi'];
    
    // 6. Get ICAR guidance and climate alerts
    const icarGuidance = getIcarGuidance(cropName);
    const climateAlerts = getClimateAlerts(cropName, weather);
    const icarCropData = icarGuidelines[cropName];

    // 7. Calculate NPK deficit based on soil data
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

    // 8. Build NDVI health context
    const ndviStatus = ndviData && ndviData.length > 0 ? {
      value: ndviData[0].ndvi_value,
      status: ndviData[0].ndvi_value > 0.6 ? 'निरोगी' : 
              ndviData[0].ndvi_value > 0.4 ? 'सामान्य' :
              ndviData[0].ndvi_value > 0.2 ? 'कमजोर' : 'गंभीर',
      action: ndviData[0].ndvi_value < 0.4 ? 'खताची मात्रा 25% वाढवा!' : 'सामान्य खत द्या'
    } : null;

    // 9. Build comprehensive RURAL language system prompt
    const systemPrompt = `तू ${land.state} मधला जुना अनुभवी शेतकरी आहेस. 50 वर्षांचा अनुभव आहे. गावातल्या भावाला सल्ला देतोय - किताबी भाषा नाही!

🎯 तुझं काम: या शेतकऱ्याला त्याच्या ${land.area_acres} एकर शेतासाठी ${cropName} पिकाचं संपूर्ण वेळापत्रक द्यायचं आहे.

🗣️ बोलण्याची पद्धत (CRITICAL - हे पाळच!):
❌ चुकीचं (किताबी): "सिंचन प्रबंधन करा", "उर्वरक व्यवस्थापन", "कीटक नियंत्रण उपाय"
✅ बरोबर (गावाकडचं): "भाऊ पाणी द्यायची वेळ आली", "खत टाकायचं बघ", "किडे लागलेत, औषध फवार"

उदाहरणं:
- "पोरा, आता पाणी दे नाहीतर पीक सुकून जाईल"
- "भाऊ, युरिया टाक - पानं पिवळी पडायला लागलीत"
- "लक्षात ठेव - सकाळी लवकर फवारणी कर, ऊन झालं की औषध उडून जातं"
- "3 दिवसांनी पाऊस येणार, आज पाणी देऊ नकोस"

📊 या शेताची संपूर्ण माहिती:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏞️ जमीन: ${land.area_acres} एकर (${landAreaHa.toFixed(2)} हेक्टर)
📍 ठिकाण: ${land.village || ''}, ${land.taluka || ''}, ${land.district}, ${land.state}
🌾 माती: ${land.soil_type || 'माहिती नाही'}
💧 पाण्याची सोय: ${land.irrigation_type || land.water_source || 'बोअर/विहीर'}
📐 जमिनीचा उतार: ${land.slope_percentage ? `${land.slope_percentage}%` : 'सपाट'}

🧪 मातीची तपासणी (${land.last_soil_test_date ? `तारीख: ${land.last_soil_test_date}` : 'तपासणी केलेली नाही'}):
- pH: ${land.soil_ph || 'माहिती नाही'} ${land.soil_ph ? (land.soil_ph < 6 ? '(आम्लयुक्त - चुना लागेल)' : land.soil_ph > 7.5 ? '(क्षारयुक्त - जिप्सम लागेल)' : '(योग्य)') : ''}
- सेंद्रिय कार्बन: ${land.organic_carbon_percent ? `${land.organic_carbon_percent}%` : 'माहिती नाही'}
- नायट्रोजन (N): ${currentN || 0} kg/ha ${currentN < 50 ? '⚠️ कमी!' : currentN < 100 ? '(मध्यम)' : '(चांगला)'}
- फॉस्फरस (P): ${currentP || 0} kg/ha ${currentP < 20 ? '⚠️ कमी!' : currentP < 40 ? '(मध्यम)' : '(चांगला)'}
- पोटॅश (K): ${currentK || 0} kg/ha ${currentK < 20 ? '⚠️ कमी!' : currentK < 40 ? '(मध्यम)' : '(चांगला)'}

📊 ${cropName} पिकासाठी लागणारं (Target):
- N: ${target.n} kg/ha, P: ${target.p} kg/ha, K: ${target.k} kg/ha
- कमतरता भरायची: N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha
- एकूण ${land.area_acres} एकरसाठी:
  * युरिया: ${((nDeficit * landAreaHa) / 0.46).toFixed(0)} kg (46% N असतं)
  * DAP: ${((pDeficit * landAreaHa) / 0.18).toFixed(0)} kg (18% N + 46% P)
  * MOP: ${((kDeficit * landAreaHa) / 0.60).toFixed(0)} kg (60% K)

${ndviStatus ? `
🛰️ सॅटेलाइट आकडा (NDVI): ${ndviStatus.value.toFixed(2)}
स्थिती: ${ndviStatus.status}
कृती: ${ndviStatus.action}
` : ''}

${icarGuidance ? `
📚 ICAR/कृषी विद्यापीठ शिफारस (${cropName}):
${icarGuidance}
` : ''}

${icarCropData ? `
🐛 ${cropName} मध्ये येणारे कीड: ${icarCropData.common_pests?.join(', ') || 'माहिती नाही'}
🦠 ${cropName} मध्ये येणारे रोग: ${icarCropData.common_diseases?.join(', ') || 'माहिती नाही'}
` : ''}

${climateAlerts.length > 0 ? `
⚠️ हवामान धोका:
${climateAlerts.map(a => `• ${a}`).join('\n')}
` : ''}

💰 खर्चाबद्दल (CRITICAL):
- सर्व किंमती "अंदाजे ₹X,XXX" अशा लिहा
- $ कधीच वापरू नका - फक्त ₹ (INR)!
- बाजारभाव 2024-25 च्या दरानुसार

🌿 खत शिफारस प्राधान्य:
1. पहिलं प्राधान्य: सेंद्रिय खत (शेणखत, कंपोस्ट, गांडूळ खत)
2. जैविक खत (अझोटोबॅक्टर, PSB, राइझोबियम)
3. रासायनिक खत (फक्त कमतरता भरण्यासाठी)

🌱 खत/कीटकनाशक घटक (CRITICAL - हे सांगणे आवश्यक!):
प्रत्येक खत/औषधासाठी सांगा:
- नाव (ब्रँड + जेनेरिक)
- सक्रिय घटक (Active Ingredient) आणि टक्केवारी
- उदा: "इमिडाक्लोप्रिड 17.8% SL (Confidor/Admire)" किंवा "युरिया (46% नायट्रोजन)"

भाषा: ${languageName} (code: ${language}) - पूर्ण ${languageName} मध्येच!`;

    const userPrompt = `भाऊ, माझं ${land.area_acres} एकर शेत आहे ${land.district}, ${land.state} मध्ये.

🌱 पीक: ${cropName}${cropVariety ? ` (${cropVariety} जात)` : ''}
📅 ${isReadyMadePlant ? 'रोपे लावणी' : 'पेरणी'} तारीख: ${sowingDate}
💧 पाण्याची सोय: ${land.irrigation_type || land.water_source || 'बोअर/विहीर'}
🌾 माती: ${land.soil_type || 'सामान्य'}

मातीची स्थिती:
- N=${currentN}, P=${currentP}, K=${currentK} kg/ha (सध्या)
- N=${target.n}, P=${target.p}, K=${target.k} kg/ha (पिकाला लागणारं)
- भरायची कमतरता: N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha

${ndviStatus ? `सॅटेलाइट आकडा: ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}` : ''}

${weather?.forecast ? `
पुढच्या आठवड्याचा पाऊस:
${weather.forecast.filter((f: any) => f.rainfall > 5).map((f: any) => `• दिवस ${f.day}: ${f.rainfall}mm`).join('\n') || '• मोठा पाऊस नाही'}
` : ''}

आजोबा, मला पूर्ण वेळापत्रक सांगा:

1. कोणकोणती कामं (12-15 कामं)?
   - जमीन तयारी, ${isReadyMadePlant ? 'रोपे लावणी' : 'पेरणी'}
   - पाणी कधी द्यायचं (6-8 वेळा)
   - खत कधी टाकायचं (3-4 वेळा) - सेंद्रिय + रासायनिक
   - कीड-रोगावर औषध (2-3 वेळा)
   - तण काढणे (2 वेळा)
   - कापणी

2. खत/औषधासाठी सांगा:
   - नाव (ब्रँड + जेनेरिक)
   - सक्रिय घटक (Active Ingredient) + टक्केवारी
   - किती लागेल (${land.area_acres} एकरसाठी)
   - कसं द्यायचं

3. प्रत्येक कामासाठी:
   - का करायचं (धमकी: "नाही केलं तर...")
   - कसं करायचं (step by step)
   - काळजी घ्या (2-3 गोष्टी)
   - कोणत्या हवामानात करायचं

💰 हिशोब सांगा:
- उत्पादन किती होईल (क्विंटल)
- खर्च किती येईल
- नफा किती राहील

💬 गावाकडच्या भाषेत सांग - "सिंचन प्रबंधन" नको, "पाणी देणे" सांग!
भाषा: ${languageName}`;

    // 10. Call OpenAI with comprehensive tool schema
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
          description: "Generate comprehensive agricultural schedule with land-specific recommendations",
          parameters: {
            type: "object",
            properties: {
              crop_name: { type: "string" },
              crop_season: { type: "string" },
              total_duration_days: { type: "integer" },
              
              // Yield & Revenue
              expected_yield_quintals: { type: "number", description: "Total yield in quintals for entire land" },
              expected_yield_per_acre: { type: "number", description: "Yield per acre in quintals" },
              expected_market_price_per_quintal: { type: "number", description: "Price in ₹ per quintal" },
              expected_gross_revenue: { type: "number", description: "Total revenue in ₹" },
              expected_net_profit: { type: "number", description: "Net profit in ₹" },
              total_estimated_cost: { type: "number", description: "Total cost in ₹" },
              
              // ICAR Reference
              icar_reference: { type: "string" },
              university_recommendation: { type: "string" },
              
              // Seeds & Water
              seed_quantity_kg: { type: "number", description: "Seed quantity for this land size" },
              seed_details: { type: "string", description: "Seed variety, treatment, source" },
              total_water_requirement_liters: { type: "number" },
              
              // Organic Fertilizers (PRIORITY)
              organic_inputs: {
                type: "object",
                properties: {
                  fym_kg: { type: "number", description: "Farm Yard Manure in kg" },
                  compost_kg: { type: "number", description: "Compost in kg" },
                  vermicompost_kg: { type: "number", description: "Vermicompost in kg" },
                  green_manure: { type: "string", description: "Green manure crop name if applicable" },
                  neem_cake_kg: { type: "number", description: "Neem cake in kg" }
                }
              },
              
              // Bio Fertilizers
              bio_fertilizers: {
                type: "object",
                properties: {
                  azotobacter_packets: { type: "number" },
                  psb_packets: { type: "number", description: "Phosphate Solubilizing Bacteria" },
                  rhizobium_packets: { type: "number", description: "For legumes" },
                  mycorrhiza_kg: { type: "number" }
                }
              },
              
              // Chemical Fertilizers (to fill deficit only)
              chemical_fertilizers: {
                type: "object",
                properties: {
                  urea_kg: { type: "number", description: "Urea (46% N)" },
                  dap_kg: { type: "number", description: "DAP (18% N + 46% P)" },
                  mop_kg: { type: "number", description: "MOP (60% K)" },
                  ssp_kg: { type: "number", description: "SSP (16% P)" },
                  complex_npk_kg: { type: "number", description: "NPK complex" },
                  micronutrients: { type: "string", description: "Zinc, Boron, etc." }
                }
              },
              
              // Pest Management with Active Ingredients
              pest_management: {
                type: "object",
                properties: {
                  bio_pesticides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Product name" },
                        active_ingredient: { type: "string", description: "Active ingredient and %" },
                        quantity: { type: "string", description: "Quantity with unit" },
                        target_pest: { type: "string" }
                      }
                    }
                  },
                  chemical_pesticides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Brand name + generic" },
                        active_ingredient: { type: "string", description: "Active ingredient and %" },
                        quantity: { type: "string" },
                        target_pest: { type: "string" },
                        phi_days: { type: "number", description: "Pre-harvest interval" }
                      }
                    }
                  },
                  fungicides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        active_ingredient: { type: "string" },
                        quantity: { type: "string" },
                        target_disease: { type: "string" }
                      }
                    }
                  },
                  herbicides: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        active_ingredient: { type: "string" },
                        quantity: { type: "string" },
                        application_timing: { type: "string" }
                      }
                    }
                  }
                }
              },
              
              // Climate alerts
              climate_alerts: { type: "array", items: { type: "string" } },
              expected_pests: { type: "array", items: { type: "string" } },
              expected_diseases: { type: "array", items: { type: "string" } },
              
              // Tasks
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_name: { type: "string", description: `In ${languageName} using rural terms` },
                    category: { 
                      type: "string",
                      enum: ["soil_preparation", "sowing", "irrigation", "fertilizer", "pest_control", "weed_management", "harvesting"]
                    },
                    days_from_sowing: { type: "integer" },
                    priority: { type: "string", enum: ["low", "medium", "high"] },
                    description: { type: "string", description: `In ${languageName}, explain why this is important` },
                    quantity: { type: "string", description: "Specific quantity (e.g., '50 kg युरिया', '2000 लीटर पाणी')" },
                    product_details: { type: "string", description: "Product name + active ingredient + %" },
                    estimated_cost: { type: "number", description: "Cost in ₹" },
                    instructions: { type: "array", items: { type: "string" }, description: `Step-by-step in ${languageName}` },
                    precautions: { type: "array", items: { type: "string" }, description: "2-3 safety points" },
                    weather_dependent: { type: "boolean" },
                    icar_guideline: { type: "string" },
                    climate_risk: { type: "string" },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string" },
                        humidity: { type: "string" },
                        conditions: { type: "string" }
                      }
                    }
                  },
                  required: ["task_name", "category", "days_from_sowing", "priority", "description", "precautions"]
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
    const scheduleData = JSON.parse(toolCall.function.arguments);
    
    console.log('✓ Schedule:', scheduleData.crop_name, scheduleData.total_duration_days, 'days,', scheduleData.tasks?.length, 'tasks');

    if (!scheduleData.tasks || scheduleData.tasks.length === 0) {
      throw new Error('AI returned empty schedule');
    }

    // Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from('crop_schedules').update({ is_active: false })
        .eq('land_id', landId).eq('is_active', true);
    }

    // Save schedule with all land context for training
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety,
        sowing_date: sowingDate,
        expected_harvest_date: new Date(new Date(sowingDate).getTime() + scheduleData.total_duration_days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        
        seed_quantity_kg: scheduleData.seed_quantity_kg || null,
        total_water_requirement_liters: scheduleData.total_water_requirement_liters || null,
        calculated_for_area_acres: land.area_acres,
        
        // Chemical Fertilizers
        fertilizer_n_kg: scheduleData.chemical_fertilizers?.urea_kg ? scheduleData.chemical_fertilizers.urea_kg * 0.46 : null,
        fertilizer_p_kg: scheduleData.chemical_fertilizers?.dap_kg ? scheduleData.chemical_fertilizers.dap_kg * 0.46 : null,
        fertilizer_k_kg: scheduleData.chemical_fertilizers?.mop_kg ? scheduleData.chemical_fertilizers.mop_kg * 0.60 : null,
        
        // Yield & Revenue
        expected_yield_quintals: scheduleData.expected_yield_quintals || null,
        expected_yield_per_acre: scheduleData.expected_yield_per_acre || null,
        expected_market_price_per_quintal: scheduleData.expected_market_price_per_quintal || null,
        expected_gross_revenue: scheduleData.expected_gross_revenue || null,
        expected_net_profit: scheduleData.expected_net_profit || null,
        total_estimated_cost: scheduleData.total_estimated_cost || null,
        
        // Organic Inputs
        organic_fertilizer_kg: scheduleData.organic_inputs?.fym_kg || null,
        vermicompost_kg: scheduleData.organic_inputs?.vermicompost_kg || null,
        organic_input_details: scheduleData.organic_inputs || null,
        
        // Pest Management
        pesticide_requirements: scheduleData.pest_management || null,
        
        ai_model: AI_CONFIG.MODEL,
        generation_language: language,
        country: country,
        
        // Store FULL context for AI training
        generation_params: {
          scheduleData,
          land_context: {
            area_acres: land.area_acres,
            soil_type: land.soil_type,
            soil_ph: land.soil_ph,
            irrigation_type: land.irrigation_type,
            current_npk: { n: currentN, p: currentP, k: currentK },
            target_npk: target,
            deficit_npk: { n: nDeficit, p: pDeficit, k: kDeficit },
            ndvi: ndviStatus,
            location: { village: land.village, taluka: land.taluka, district: land.district, state: land.state }
          },
          weather_context: weather,
          region,
          icar_reference: scheduleData.icar_reference || icarCropData?.icar_reference || null,
          climate_alerts: scheduleData.climate_alerts || climateAlerts,
          expected_pests: scheduleData.expected_pests || icarCropData?.common_pests || null,
          expected_diseases: scheduleData.expected_diseases || icarCropData?.common_diseases || null,
          organic_inputs: scheduleData.organic_inputs,
          bio_fertilizers: scheduleData.bio_fertilizers,
          chemical_fertilizers: scheduleData.chemical_fertilizers,
          pest_management: scheduleData.pest_management,
          generated_at: new Date().toISOString()
        },
        is_active: true,
      })
      .select()
      .single();

    if (scheduleError) throw scheduleError;

    // Save tasks with all details
    const tasks = scheduleData.tasks.map((task: any) => ({
      schedule_id: savedSchedule.id,
      task_name: task.task_name,
      task_type: task.category || 'general',
      task_description: task.description,
      task_date: new Date(new Date(sowingDate).getTime() + task.days_from_sowing * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      priority: task.priority || 'medium',
      status: 'pending',
      estimated_cost: task.estimated_cost || null,
      instructions: task.instructions || [],
      language: language,
      currency: 'INR',
      resources: {
        quantity: task.quantity || null,
        product_details: task.product_details || null,
        precautions: task.precautions || [],
        ideal_weather: task.ideal_weather || null,
        icar_guideline: task.icar_guideline || null,
        climate_risk: task.climate_risk || null,
      },
      weather_dependent: task.weather_dependent || (task.category === 'irrigation' || task.category === 'pest_control'),
    }));

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasks)
      .select();

    if (tasksError) console.error('Tasks insert error:', tasksError);
    else console.log(`✓ Inserted ${insertedTasks?.length || 0} tasks`);

    // Log for AI training
    await supabase.from('ai_decision_log').insert({
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
    }).catch(e => console.warn('Failed to log decision:', e));

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule generated in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        taskCount: insertedTasks?.length || 0,
        cropName: scheduleData.crop_name,
        duration: scheduleData.total_duration_days,
        executionTimeMs: executionTime,
        landContext: {
          area: land.area_acres,
          soilType: land.soil_type,
          irrigation: land.irrigation_type,
          ndviStatus: ndviStatus?.status
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ AI Schedule Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate schedule', details: 'Failed to generate crop schedule' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
