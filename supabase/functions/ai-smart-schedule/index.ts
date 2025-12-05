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
    // Use centralized AI config
    const OPENAI_API_KEY = validateOpenAIKey();
    console.log(`🤖 [AI-Schedule] Using model: ${AI_CONFIG.MODEL}`);
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // SECURITY: Extract tenant and farmer IDs from headers (not body)
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    // Validate required headers
    if (!tenantId || !farmerId) {
      console.error('Missing required headers:', { tenantId, farmerId });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required headers',
          details: 'x-tenant-id and x-farmer-id headers are required'
        }),
        { status: 401, headers: corsHeaders }
      );
    }
    
    const { landId, cropName, cropVariety, sowingDate, isReadyMadePlant = false, weather, regenerate, language = 'hi', country = 'India' } = await req.json();
    
    // Log received language for debugging
    console.log('🌐 [AI-Schedule] Received language parameter:', language);

    // Rate limiting: 30 requests per minute per farmer
    const rateLimitKey = `${tenantId}:${farmerId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'ai-smart-schedule', { maxRequests: 30, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString()
          } 
        }
      );
    }

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

    console.log('Crop guidelines found:', guidelines ? 'Yes' : 'No');

    // 3. Fetch recent NDVI data if available
    const { data: ndviData } = await supabase
      .from('ndvi_cache')
      .select('*')
      .eq('land_id', landId)
      .order('cached_at', { ascending: false })
      .limit(5);

    console.log('NDVI data points found:', ndviData?.length || 0);

    // 4. Regional & Language Context - Pure Languages Only
    const languageMap: Record<string, string> = {
      hi: 'Hindi',
      mr: 'Marathi', 
      pa: 'Punjabi',
      ta: 'Tamil',
      te: 'Telugu',
      bn: 'Bengali',
      gu: 'Gujarati',
      kn: 'Kannada',
      en: 'English'
    };

    const regionalData: Record<string, any> = {
      'Punjab': { season: 'Rabi (Oct-Mar)', crop: 'Wheat', zone: 'Trans-Gangetic Plains' },
      'Haryana': { season: 'Rabi (Oct-Mar)', crop: 'Wheat', zone: 'Trans-Gangetic Plains' },
      'Maharashtra': { season: 'Kharif (Jun-Nov)', crop: 'Cotton', zone: 'Western Maharashtra Plains' },
      'Karnataka': { season: 'Kharif (Jun-Sep)', crop: 'Ragi', zone: 'Deccan Plateau' },
      'Tamil Nadu': { season: 'Samba (Aug-Jan)', crop: 'Rice', zone: 'Cauvery Delta' },
      'Andhra Pradesh': { season: 'Kharif (Jun-Oct)', crop: 'Rice', zone: 'Coastal Andhra' },
      'Telangana': { season: 'Kharif (Jun-Oct)', crop: 'Cotton', zone: 'Telangana Plateau' },
      'Uttar Pradesh': { season: 'Rabi (Nov-Apr)', crop: 'Wheat', zone: 'Indo-Gangetic Plains' },
      'West Bengal': { season: 'Kharif (Jun-Nov)', crop: 'Rice', zone: 'Gangetic Delta' },
      'Gujarat': { season: 'Kharif (Jun-Oct)', crop: 'Cotton', zone: 'Gujarat Plains' },
      'Madhya Pradesh': { season: 'Kharif (Jun-Oct)', crop: 'Soybean', zone: 'Central Highlands' },
      'Rajasthan': { season: 'Kharif (Jul-Oct)', crop: 'Bajra', zone: 'Western Arid Region' }
    };

    const region = regionalData[land.state] || { season: 'Monsoon', crop: 'Mixed', zone: 'Local' };
    const languageName = languageMap[language] || 'Hindi';
    
    // Get rural language terms for this language
    const ruralTerms = ruralLanguageGuide[language] || ruralLanguageGuide['hi'];
    
    console.log('🌐 [AI-Schedule] Language config:', { 
      receivedLanguage: language, 
      resolvedLanguageName: languageName,
      isEnglish: language === 'en'
    });

    // 5. Get ICAR guidance and climate alerts
    const icarGuidance = getIcarGuidance(cropName);
    const climateAlerts = getClimateAlerts(cropName, weather);
    const icarCropData = icarGuidelines[cropName];
    
    console.log('📚 [AI-Schedule] ICAR guidance available:', !!icarGuidance);
    console.log('⚠️ [AI-Schedule] Climate alerts:', climateAlerts.length);

    // 6. Build Comprehensive Context-Aware Prompt with NATURAL RURAL Language
    // Conversational village elder style - NOT textbook/robotic
    const ruralStyleExamples: Record<string, string> = {
      hi: `
❌ रोबोट जैसी भाषा मत लिखो:
"सिंचाई प्रबंधन करें" "उर्वरक प्रयोग करें" "कीट नियंत्रण"

✅ गाँव के बड़े-बुजुर्ग जैसे बोलो:
"भाई, अब पानी देने का वक्त आ गया" 
"खेत में यूरिया छिड़कने का समय है"
"कीड़े लग गए तो फसल खराब हो जाएगी, दवाई छिड़को"
"तीन दिन बाद बारिश आने वाली है, आज पानी मत दो"`,
      mr: `
❌ किताबी भाषा नको:
"सिंचन व्यवस्थापन करा" "खत व्यवस्थापन" "कीड नियंत्रण"

✅ गावाकडच्या आजोबांसारखं बोला:
"पोरा, आता पाणी द्यायचं वेळ आलंय"
"शेतात युरिया टाकायची वेळ झाली बघ"
"किडे लागले तर पीक वाया जाईल, औषध फवारा"
"तीन दिवसांनी पाऊस येणार, आज पाणी देऊ नका"`,
      en: `
❌ Don't write like a textbook:
"Implement irrigation management" "Apply fertilizer" "Pest control measures"

✅ Speak like a village elder:
"Time to water your field, brother"
"Your crops need urea now, spread it today"
"Watch out for pests, they'll ruin your harvest - spray medicine"
"Rain coming in 3 days, skip watering today"`
    };

    const styleExample = ruralStyleExamples[language] || ruralStyleExamples['hi'];

    // Build system prompt with NATURAL conversational rural language
    const systemPrompt = `तुम्ही ${land.state}, भारतातील एक अनुभवी शेतकरी आजोबा आहात. 50 वर्षांचा शेतीचा अनुभव आहे.

🎯 तुमचं काम: नवीन शेतकऱ्याला त्याच्याच भाषेत सल्ला द्या - जसं गावातला मोठा भाऊ किंवा आजोबा बोलतात!

${styleExample}

🗣️ बोलण्याची पद्धत:
- "भाऊ/पोरा/बाबा" अशी हाक मारा
- "आता वेळ आलीय...", "लक्षात ठेव...", "जपून कर..." असं बोला
- का करायचं ते सांगा: "असं केलं नाही तर पीक वाया जाईल"
- हवामानाचा संबंध सांगा: "ऊन जास्त असताना...", "पाऊस आला तर..."
- गावातले शब्द वापरा: "खत टाका", "पाणी द्या", "औषध फवारा", "तण काढा"

📊 शेताची माहिती:
- जमीन: ${land.area_acres} एकर (${(land.area_acres * 0.404686).toFixed(2)} हेक्टर)
- माती: ${land.soil_type || 'सामान्य'}
- ठिकाण: ${land.village || land.taluka || land.district}, ${land.state}
- सिंचन: ${land.irrigation_type || 'सामान्य'}

${icarGuidance ? `
📚 ICAR/कृषी विद्यापीठाच्या शिफारशी (${cropName}):
${icarGuidance}
(हे शास्त्रीय मार्गदर्शन आहे - शेतकऱ्याला सोप्या भाषेत सांगा)
` : ''}

${climateAlerts.length > 0 ? `
⚠️ सध्याच्या हवामानानुसार धोका:
${climateAlerts.map(a => `• ${a}`).join('\n')}
(शेतकऱ्याला चेतावणी द्या - "भाऊ, लक्षात ठेव..." असं बोला)
` : ''}

${icarCropData ? `
🐛 ${cropName} पिकात सामान्यपणे कीड:
${icarCropData.common_pests?.map((p: string) => `• ${p}`).join('\n') || 'माहिती नाही'}

🦠 ${cropName} पिकात सामान्यपणे रोग:
${icarCropData.common_diseases?.map((d: string) => `• ${d}`).join('\n') || 'माहिती नाही'}
` : ''}

💰 खर्चाबद्दल:
- किंमती "अंदाजे ₹X,XXX" असं लिहा
- $ कधीच वापरू नका - फक्त ₹!
- बाजारभाव सध्याच्या दराने सांगा

📝 प्रत्येक कामासाठी (task) द्या:
1. नाव: गावाच्या भाषेत ("${ruralTerms.irrigation}", "${ruralTerms.fertilizer}")
2. वर्णन: का करायचं ते सांगा, धमकी द्या ("नाही केलं तर...")
3. सूचना: कसं करायचं step-by-step
4. सावधानी: 2-3 गोष्टी लक्षात ठेवायच्या
5. हवामान: कोणत्या वातावरणात करायचं
6. ICAR शिफारस: असेल तर सांगा

भाषा: ${languageName} (code: ${language}) - पूर्ण ${languageName} मध्येच लिहा!`;

    // Build crop baseline context
    const guidelineContext = guidelines ? `
STANDARD CROP GUIDELINES FOR ${cropName}:
- Seed Rate: ${guidelines.seed_rate_kg_per_ha || '?'} kg/ha (Standard)
- Expected Yield: ${guidelines.expected_yield_kg_per_ha || '?'} kg/ha
- Water Requirement: ${guidelines.water_requirement_mm || '?'} mm total
- Duration: ${guidelines.duration_days || '?'} days
- Fertilizer NPK Recommendation: ${guidelines.npk_recommendation || 'N/A'}
- Spacing: ${guidelines.plant_spacing_cm || 'Standard spacing'}

IMPORTANT: Scale these quantities to ${land.area_acres} acres (${(land.area_acres * 0.404686).toFixed(2)} hectares)` : '';

    // Build NDVI health context
    const ndviContext = ndviData && ndviData.length > 0 ? `
VEGETATION HEALTH (NDVI - Satellite Data):
- Latest Reading: ${ndviData[0].ndvi_value} on ${new Date(ndviData[0].cached_at).toLocaleDateString()}
- Historical Trend: ${ndviData.slice(0, 3).map(d => `${new Date(d.cached_at).toLocaleDateString()}: ${d.ndvi_value}`).join(', ')}
- Health Status: ${
  ndviData[0].ndvi_value > 0.6 ? 'HEALTHY - Crop is thriving, reduce nitrogen slightly' : 
  ndviData[0].ndvi_value > 0.4 ? 'MODERATE - Normal growth, follow standard fertilizer plan' :
  ndviData[0].ndvi_value > 0.2 ? 'STRESSED - Low vigor, INCREASE nitrogen by 20-30%, check for water stress' :
  'CRITICAL - Severe stress, immediate nitrogen boost needed, investigate pest/disease'
}

ACTION: ${ndviData[0].ndvi_value < 0.4 ? 'Advance first nitrogen application by 3-5 days and increase dose by 25%' : 'Follow standard schedule'}` : 'NDVI data not available - use baseline guidelines';

    // Build NPK deficit calculation
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    
    // Target NPK for common crops (these should ideally come from guidelines)
    const targetNPK: Record<string, {n: number, p: number, k: number}> = {
      'Wheat': {n: 120, p: 60, k: 40},
      'Rice': {n: 120, p: 60, k: 40},
      'Cotton': {n: 120, p: 60, k: 50},
      'Maize': {n: 150, p: 75, k: 50},
      'Sugarcane': {n: 250, p: 115, k: 115},
      'Soybean': {n: 30, p: 60, k: 40}, // Legume, fixes nitrogen
      'Default': {n: 100, p: 50, k: 40}
    };
    
    const target = targetNPK[cropName] || targetNPK['Default'];
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    const npkContext = `
SOIL NUTRIENT STATUS (Current vs Target for ${cropName}):
- Soil Type: ${land.soil_type || 'Unknown'}
- pH: ${land.soil_ph || 'Unknown'}
- Current NPK: N=${currentN} P=${currentP} K=${currentK} kg/ha
- Target NPK: N=${target.n} P=${target.p} K=${target.k} kg/ha
- DEFICIT TO APPLY: N=${nDeficit.toFixed(0)} P=${pDeficit.toFixed(0)} K=${kDeficit.toFixed(0)} kg/ha
- Total for ${land.area_acres} acres (${landAreaHa.toFixed(2)} ha):
  * Nitrogen needed: ${(nDeficit * landAreaHa).toFixed(1)} kg
  * Phosphorus needed: ${(pDeficit * landAreaHa).toFixed(1)} kg
  * Potassium needed: ${(kDeficit * landAreaHa).toFixed(1)} kg

FERTILIZER STRATEGY: Apply deficit amount in 2-3 split doses. Adjust based on NDVI if available.`;

    // Build weather context
    const weatherContext = weather?.current && weather?.forecast ? `
CURRENT WEATHER & 7-DAY FORECAST:
- Now: ${weather.current.temp}°C, ${weather.current.humidity}% humidity, ${weather.current.conditions}
- Wind: ${weather.current.wind_speed} m/s
- Cloud Cover: ${weather.current.clouds}%
${weather.current.uv_index ? `- UV Index: ${weather.current.uv_index}` : ''}

RAINFALL FORECAST (Next 7 Days):
${weather.forecast.map((f: any) => `Day ${f.day}: ${f.temp_min}°-${f.temp_max}°C, ${f.rainfall}mm rain (${(f.pop * 100).toFixed(0)}% chance), ${f.description}`).join('\n')}

WEATHER-BASED ACTIONS:
${weather.forecast.some((f: any) => f.rainfall > 10) ? 
  `- SKIP irrigation on days with >10mm predicted rain: ${weather.forecast.filter((f: any) => f.rainfall > 10).map((f: any) => `Day ${f.day}`).join(', ')}
- POSTPONE pesticide/fungicide application if heavy rain expected within 24 hours` : 
  '- No significant rain forecasted, schedule irrigation normally'}
${weather.current.temp > 35 ? '- HIGH TEMPERATURE ALERT: Increase irrigation frequency, water in early morning/evening' : ''}
${weather.current.temp < 10 ? '- LOW TEMPERATURE ALERT: Delay sowing if below minimum germination temp' : ''}` : 'Weather data not available';

    const userPrompt = `भाऊ, माझं ${land.area_acres} एकर शेत आहे ${land.district}, ${land.state} मध्ये.

🌱 मी ${cropName}${cropVariety ? ` (${cropVariety})` : ''} लावणार आहे.
📅 पेरणी तारीख: ${sowingDate}
🚜 पद्धत: ${isReadyMadePlant ? 'तयार रोपे लावणार (नर्सरीतून)' : 'बियाणे पेरणार'}
💧 सिंचन: ${land.irrigation_type || 'बोअर/विहीर'}

🌍 मातीची स्थिती:
- प्रकार: ${land.soil_type || 'सामान्य माती'}
- सध्या: N=${currentN}, P=${currentP}, K=${currentK} kg/ha
- पिकाला लागणारं: N=${target.n}, P=${target.p}, K=${target.k} kg/ha
- कमतरता: N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha भरायची

${ndviData && ndviData.length > 0 ? `
🛰️ सॅटेलाइट आकडा (NDVI): ${ndviData[0].ndvi_value}
${ndviData[0].ndvi_value < 0.4 ? '⚠️ पीक थोडं कमजोर दिसतंय - खताची मात्रा 25% वाढवा!' : '✅ पीक निरोगी आहे'}
` : ''}

${weather?.forecast ? `
🌧️ पुढच्या आठवड्याचा पाऊस:
${weather.forecast.filter((f: any) => f.rainfall > 5).map((f: any) => `• दिवस ${f.day}: ${f.rainfall}mm पाऊस येणार`).join('\n') || '• मोठा पाऊस नाही - नियमित पाणी द्या'}
` : ''}

${climateAlerts.length > 0 ? `
⚠️ आजोबा, हे लक्षात ठेवा:
${climateAlerts.map(a => `• ${a}`).join('\n')}
` : ''}

आजोबा, मला सांगा:
1. कोणकोणती कामं करायची (10-12 कामं)?
   - ${isReadyMadePlant ? 'रोपे लावणी' : 'जमीन तयार करणे, पेरणी'}
   - पाणी कधी कधी द्यायचं (6-8 वेळा)
   - खत कधी टाकायचं (2-3 वेळा, कमतरतेनुसार)
   - कीड-रोगांवर कधी फवारणी (2-3 वेळा)
   - तण कधी काढायचं (2 वेळा)
   - कापणी कधी

2. प्रत्येक कामासाठी सांगा:
   - का करायचं (नाही केलं तर काय होईल)
   - कसं करायचं (step-by-step)
   - काय काळजी घ्यायची (2-3 गोष्टी)
   - कोणत्या हवामानात करायचं

3. हिशोब सांगा:
   - किती उत्पादन होईल (क्विंटल)
   - बाजारभाव किती मिळेल
   - एकूण खर्च किती येईल
   - नफा किती राहील

💬 गावाकडच्या भाषेत सांगा - "सिंचन प्रबंधन" नको, "पाणी देणे" सांगा!
💰 खर्च "अंदाजे ₹X,XXX" असा सांगा ($ नको!)
📚 ICAR/कृषी विद्यापीठाची शिफारस असेल तर सांगा

भाषा: ${languageName} - पूर्ण ${languageName} मध्येच उत्तर द्या!`;


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

    // 6. Call OpenAI with tool calling (using centralized config)
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
          description: "Generate a comprehensive agricultural crop schedule with tasks and recommendations",
          parameters: {
            type: "object",
            properties: {
              crop_name: { type: "string" },
              crop_season: { type: "string", description: "Kharif, Rabi, or Zaid" },
              total_duration_days: { type: "integer" },
              
              // Yield & Revenue
              expected_yield_quintals: { type: "number", description: "Total harvest in quintals (100kg) for entire land" },
              expected_yield_per_acre: { type: "number", description: "Yield per acre in quintals" },
              expected_market_price_per_quintal: { type: "number", description: "Market price per quintal in INR (₹)" },
              expected_gross_revenue: { type: "number", description: "Total revenue = yield × price in ₹" },
              expected_net_profit: { type: "number", description: "Net profit = revenue - costs in ₹" },
              total_estimated_cost: { type: "number", description: "Total cost in ₹ (Rupees only, no $)" },
              
              // ICAR Reference
              icar_reference: { type: "string", description: "ICAR bulletin or guideline reference" },
              university_recommendation: { type: "string", description: "Agricultural university recommendation if any" },
              
              // Seeds & Water
              seed_quantity_kg: { type: "number", description: "Exact seed quantity in kg for this land size" },
              total_water_requirement_liters: { type: "number", description: "Total water for entire season in liters" },
              
              // Chemical Fertilizers
              fertilizer_plan: {
                type: "object",
                properties: {
                  nitrogen_kg: { type: "number", description: "Total N (chemical) in kg" },
                  phosphorus_kg: { type: "number", description: "Total P (chemical) in kg" },
                  potassium_kg: { type: "number", description: "Total K (chemical) in kg" }
                }
              },
              
              // Organic Inputs (simplified for model compatibility)
              organic_fertilizer_kg: { 
                type: "number", 
                description: "Total organic fertilizer (FYM, compost) in kg" 
              },
              bio_fertilizer_units: { 
                type: "number", 
                description: "Bio-fertilizer packets needed" 
              },
              vermicompost_kg: { 
                type: "number", 
                description: "Vermicompost in kg" 
              },
              
              // Pest Management (simplified)
              insecticide_ml: { 
                type: "number", 
                description: "Total insecticide in ml for entire season" 
              },
              fungicide_gm: { 
                type: "number", 
                description: "Total fungicide in grams" 
              },
              herbicide_ml: { 
                type: "number", 
                description: "Total herbicide in ml" 
              },
              bio_pesticide_ml: { 
                type: "number", 
                description: "Bio-pesticide (Neem oil) in ml" 
              },
              
              // Growth Regulators (simplified)
              pgr_hormone_ml: { 
                type: "number", 
                description: "Plant growth regulator in ml (GA3, NAA, etc.)" 
              },
              
              // Climate-based alerts
              climate_alerts: {
                type: "array",
                items: { type: "string" },
                description: "Weather-based pest/disease alerts for this crop"
              },
              
              // Common pests/diseases for this crop
              expected_pests: {
                type: "array",
                items: { type: "string" },
                description: "Common pests expected in this crop based on region and season"
              },
              expected_diseases: {
                type: "array",
                items: { type: "string" },
                description: "Common diseases expected in this crop based on region and climate"
              },
              
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_name: { type: "string", description: `Task name in ${languageName} language ONLY using rural/village terminology. Must use ${languageName} script.` },
                    category: { 
                      type: "string",
                      enum: ["soil_preparation", "sowing", "irrigation", "fertilizer", "pest_control", "weed_management", "harvesting"]
                    },
                    days_from_sowing: { type: "integer" },
                    priority: { 
                      type: "string",
                      enum: ["low", "medium", "high"]
                    },
                    description: { type: "string", description: `Task description in ${languageName} language ONLY using simple village terms. Explain "why" this task is important.` },
                    quantity: { type: "string", description: "Specific quantity for this task (e.g., '50 kg युरिया', '2000 लीटर पाणी')" },
                    estimated_cost: { type: "number", description: "Cost in ₹ (Rupees). Will be displayed as 'अंदाजे ₹X,XXX'" },
                    instructions: {
                      type: "array",
                      items: { type: "string" },
                      description: `Step-by-step instructions in ${languageName} language using village terminology. Be practical and specific.`
                    },
                    precautions: {
                      type: "array",
                      items: { type: "string" },
                      description: `2-3 safety precautions in ${languageName}. Include timing, weather conditions, and safety measures.`
                    },
                    weather_dependent: { type: "boolean", description: "Should this task be rescheduled based on weather?" },
                    icar_guideline: { type: "string", description: "Relevant ICAR recommendation for this task if any" },
                    climate_risk: { type: "string", description: "Pest/disease risk based on current climate conditions" },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string", description: "Ideal temperature range (e.g., '20-30')" },
                        humidity: { type: "string", description: "Ideal humidity range (e.g., '60-80')" },
                        conditions: { type: "string", description: "Weather conditions (e.g., 'cloudy', 'no rain expected')" }
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
    
    console.log('🤖 [AI-Schedule] Calling OpenAI API:', {
      model: requestBody.model,
      maxTokens: requestBody.max_completion_tokens,
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      estimatedTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4)
    });
    
    const aiResponse = await fetch(OPENAI_API_URL, {
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

    // Check if tool call exists with detailed debugging
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.error('❌ No tool call in OpenAI response');
      console.error('Full message object:', JSON.stringify(message, null, 2));
      console.error('Message content:', message.content);
      console.error('Finish reason:', aiData.choices[0].finish_reason);
      console.error('Model used:', requestBody.model);
      console.error('Has content?', !!message.content);
      console.error('Content type:', typeof message.content);
      
      // If model returned text content instead of tool call, log it
      if (message.content) {
        console.error('Model returned text instead of tool call. First 1000 chars:', 
          message.content.substring(0, 1000));
      }
      
      throw new Error(`OpenAI did not return a tool call. Model: ${requestBody.model}, Finish reason: ${aiData.choices[0].finish_reason}. The schema may be too complex or the model doesn't support function calling.`);
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
      console.log('✓ ICAR Reference:', scheduleData.icar_reference || 'None');
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

    // 7. Validate AI output for land-specific calculations
    const validation = {
      has_seed_qty: !!scheduleData.seed_quantity_kg,
      has_fertilizer_plan: !!scheduleData.fertilizer_plan,
      has_water_req: !!scheduleData.total_water_requirement_liters,
      tasks_with_quantities: scheduleData.tasks.filter((t: any) => t.quantity).length,
      tasks_with_precautions: scheduleData.tasks.filter((t: any) => t.precautions?.length).length,
      total_tasks: scheduleData.tasks.length
    };
    
    console.log('AI Output Validation:', validation);
    
    if (!validation.has_seed_qty || !validation.has_fertilizer_plan) {
      console.warn('⚠️ AI did not provide complete quantity calculations');
    }

    // 8. Save main schedule with ALL calculated quantities to database columns
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
        
        // Save ALL quantities to dedicated columns (not just JSON)
        seed_quantity_kg: scheduleData.seed_quantity_kg || null,
        total_water_requirement_liters: scheduleData.total_water_requirement_liters || null,
        calculated_for_area_acres: land.area_acres,
        
        // Chemical Fertilizers
        fertilizer_n_kg: scheduleData.fertilizer_plan?.nitrogen_kg || null,
        fertilizer_p_kg: scheduleData.fertilizer_plan?.phosphorus_kg || null,
        fertilizer_k_kg: scheduleData.fertilizer_plan?.potassium_kg || null,
        
        // Yield & Revenue
        expected_yield_quintals: scheduleData.expected_yield_quintals || null,
        expected_yield_per_acre: scheduleData.expected_yield_per_acre || null,
        expected_market_price_per_quintal: scheduleData.expected_market_price_per_quintal || null,
        expected_gross_revenue: scheduleData.expected_gross_revenue || null,
        expected_net_profit: scheduleData.expected_net_profit || null,
        total_estimated_cost: scheduleData.total_estimated_cost || null,
        
        // Organic Inputs (now top-level fields)
        organic_fertilizer_kg: scheduleData.organic_fertilizer_kg || null,
        bio_fertilizer_units: scheduleData.bio_fertilizer_units || null,
        organic_manure_kg: scheduleData.organic_fertilizer_kg || null, // FYM/compost
        vermicompost_kg: scheduleData.vermicompost_kg || null,
        organic_input_details: {
          organic_fertilizer_kg: scheduleData.organic_fertilizer_kg,
          bio_fertilizer_units: scheduleData.bio_fertilizer_units,
          vermicompost_kg: scheduleData.vermicompost_kg
        },
        
        // Pest Management (simplified structure)
        pesticide_requirements: {
          insecticide_ml: scheduleData.insecticide_ml,
          fungicide_gm: scheduleData.fungicide_gm,
          herbicide_ml: scheduleData.herbicide_ml,
          bio_pesticide_ml: scheduleData.bio_pesticide_ml
        },
        insecticide_ml: scheduleData.insecticide_ml || null,
        fungicide_gm: scheduleData.fungicide_gm || null,
        herbicide_ml: scheduleData.herbicide_ml || null,
        bio_pesticide_ml: scheduleData.bio_pesticide_ml || null,
        
        // Growth Regulators (simplified)
        growth_regulators: scheduleData.pgr_hormone_ml ? {
          pgr_hormone_ml: scheduleData.pgr_hormone_ml
        } : null,
        pgr_hormone_ml: scheduleData.pgr_hormone_ml || null,
        
        // ICAR & Climate info stored in generation_params (columns don't exist in schema)
        
        // Product recommendations (to be populated from product_categories)
        recommended_products: {
          seeds: scheduleData.seed_quantity_kg ? {
            quantity_kg: scheduleData.seed_quantity_kg,
            category: 'seeds'
          } : null,
          chemical_fertilizers: scheduleData.fertilizer_plan ? {
            nitrogen_kg: scheduleData.fertilizer_plan.nitrogen_kg,
            phosphorus_kg: scheduleData.fertilizer_plan.phosphorus_kg,
            potassium_kg: scheduleData.fertilizer_plan.potassium_kg,
            category: 'fertilizers-chemical'
          } : null,
          organic_fertilizers: (scheduleData.organic_fertilizer_kg || scheduleData.bio_fertilizer_units || scheduleData.vermicompost_kg) ? {
            organic_fertilizer_kg: scheduleData.organic_fertilizer_kg,
            bio_fertilizer_units: scheduleData.bio_fertilizer_units,
            vermicompost_kg: scheduleData.vermicompost_kg,
            category: 'fertilizers-organic'
          } : null,
          pesticides: (scheduleData.insecticide_ml || scheduleData.fungicide_gm || scheduleData.herbicide_ml || scheduleData.bio_pesticide_ml) ? {
            insecticide_ml: scheduleData.insecticide_ml,
            fungicide_gm: scheduleData.fungicide_gm,
            herbicide_ml: scheduleData.herbicide_ml,
            bio_pesticide_ml: scheduleData.bio_pesticide_ml
          } : null,
          growth_regulators: scheduleData.pgr_hormone_ml ? {
            pgr_hormone_ml: scheduleData.pgr_hormone_ml
          } : null
        },
        
        ai_model: AI_CONFIG.MODEL,
        generation_language: language,
        country: country,
        generation_params: {
          scheduleData,
          region: region,
          generated_at: new Date().toISOString(),
          // ICAR & Climate info stored here
          icar_reference: scheduleData.icar_reference || icarCropData?.icar_reference || null,
          climate_alerts: scheduleData.climate_alerts || climateAlerts,
          expected_pests: scheduleData.expected_pests || icarCropData?.common_pests || null,
          expected_diseases: scheduleData.expected_diseases || icarCropData?.common_diseases || null,
          calculations: {
            seed_kg: scheduleData.seed_quantity_kg,
            water_liters: scheduleData.total_water_requirement_liters,
            fertilizer: scheduleData.fertilizer_plan,
            organic_inputs: {
              organic_fertilizer_kg: scheduleData.organic_fertilizer_kg,
              bio_fertilizer_units: scheduleData.bio_fertilizer_units,
              vermicompost_kg: scheduleData.vermicompost_kg
            },
            pest_management: {
              insecticide_ml: scheduleData.insecticide_ml,
              fungicide_gm: scheduleData.fungicide_gm,
              herbicide_ml: scheduleData.herbicide_ml,
              bio_pesticide_ml: scheduleData.bio_pesticide_ml
            },
            growth_enhancement: {
              pgr_hormone_ml: scheduleData.pgr_hormone_ml
            },
            land_area_ha: landAreaHa,
            ndvi_considered: !!ndviData?.length,
            weather_forecast_used: !!weather?.forecast?.length,
            yield_quintals: scheduleData.expected_yield_quintals,
            market_price: scheduleData.expected_market_price_per_quintal,
            revenue: scheduleData.expected_gross_revenue,
            profit: scheduleData.expected_net_profit
          }
        },
        is_active: true,
      })
      .select()
      .single();

    if (scheduleError) throw scheduleError;

    // 9. Save individual tasks with quantities and weather dependency
    // Note: precautions, ideal_weather, icar_guideline, climate_risk stored in resources JSON
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
      currency: 'INR', // Always INR for India
      resources: {
        quantity: task.quantity || null,
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

    if (tasksError) {
      console.error('Error inserting tasks:', tasksError);
    } else {
      console.log(`✓ Inserted ${insertedTasks?.length || 0} tasks`);
      
      // 9.5. Auto-schedule rich notifications for each task
      if (insertedTasks && insertedTasks.length > 0) {
        const notificationRecords = [];
        const now = new Date();
        const approxText = ruralTerms.approximately || 'अंदाजे';

        for (const task of insertedTasks) {
          const taskDate = new Date(task.task_date);
          
          // Schedule notifications: 5 days before, 1 day before, and same day
          const notificationTypes = [
            { type: '5_days', daysBefore: 5 },
            { type: '1_day', daysBefore: 1 },
            { type: 'same_day', daysBefore: 0 },
          ];

          notificationTypes.forEach(({ type, daysBefore }) => {
            const scheduledTime = new Date(taskDate);
            scheduledTime.setDate(scheduledTime.getDate() - daysBefore);
            scheduledTime.setHours(9, 0, 0, 0); // 9 AM local time

            // Only schedule if notification time is in the future
            if (scheduledTime > now) {
              // Build rich notification content
              const notificationTitle = type === 'same_day' 
                ? `आज: ${task.task_name}`
                : type === '1_day'
                ? `उद्या: ${task.task_name}`
                : `${daysBefore} दिवसांत: ${task.task_name}`;
              
              const notificationBody = task.task_description?.substring(0, 200) || '';
              
              notificationRecords.push({
                task_id: task.id,
                user_id: farmerId,
                notification_type: type,
                scheduled_for: scheduledTime.toISOString(),
                status: 'pending',
                // Rich notification content
                title: notificationTitle,
                body: notificationBody,
                data: {
                  task_name: task.task_name,
                  task_type: task.task_type,
                  task_date: task.task_date,
                  priority: task.priority,
                  precautions: task.precautions || [],
                  estimated_cost: task.estimated_cost ? `${approxText} ₹${task.estimated_cost.toLocaleString('en-IN')}` : null,
                  weather_dependent: task.weather_dependent,
                  icar_guideline: task.icar_guideline,
                  climate_risk: task.climate_risk,
                }
              });
            }
          });
        }

        // Batch insert all notifications
        if (notificationRecords.length > 0) {
          const { error: notifError } = await supabase
            .from('task_notifications')
            .insert(notificationRecords);

          if (notifError) {
            console.error('Error scheduling notifications:', notifError);
          } else {
            console.log(`✓ Scheduled ${notificationRecords.length} rich notifications for ${insertedTasks.length} tasks`);
          }
        }
      }
    }

    // 10. Log AI decision with comprehensive metadata
    const executionTime = Date.now() - startTime;
    await supabase.from('ai_decision_log').insert({
      tenant_id: tenantId,
      farmer_id: farmerId,
      land_id: landId,
      schedule_id: savedSchedule.id,
      decision_type: 'schedule_generation',
      model_version: `openai/${AI_CONFIG.MODEL}`,
      input_data: { landId, cropName, cropVariety, sowingDate, icarGuidanceUsed: !!icarGuidance, climateAlertsCount: climateAlerts.length },
      output_data: scheduleData,
      reasoning: `Generated for ${land.state} region in ${languageName}. ICAR: ${scheduleData.icar_reference || 'N/A'}. Climate alerts: ${climateAlerts.length}`,
      confidence_score: 0.9,
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
        tasks: insertedTasks,
        icar_reference: scheduleData.icar_reference || icarCropData?.icar_reference,
        climate_alerts: climateAlerts,
        language: language,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('AI Schedule Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Failed to generate crop schedule'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
