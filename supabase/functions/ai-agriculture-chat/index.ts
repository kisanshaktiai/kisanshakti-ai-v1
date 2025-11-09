import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id, x-session-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    
    const requestBody = await req.json();
    const { 
      messages = [], 
      landId, 
      sessionId,
      imageUrl,
      language = 'en',
      metadata = {},
      fileContent,
      action // New: support for different actions
    } = requestBody;

    // Handle training data collection action
    if (action === 'collect_training_data') {
      return await handleTrainingDataCollection(requestBody);
    }

    // Extract tenantId and farmerId from metadata or headers
    const headerTenantId = req.headers.get('x-tenant-id');
    const headerFarmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');
    
    // Use metadata values first, then headers as fallback
    const finalTenantId = metadata.tenantId || headerTenantId;
    const finalFarmerId = metadata.farmerId || headerFarmerId;

    // CRITICAL SECURITY: Validate isolation context before ANY database operation
    await validateIsolation(finalTenantId, finalFarmerId, supabaseUrl, supabaseServiceKey);

    // Rate limiting check (20 requests per minute per farmer)
    const rateLimitKey = `ai-chat:${finalTenantId}:${finalFarmerId}`;
    const rateLimit = checkRateLimit(rateLimitKey, { maxRequests: 20, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded. Please try again later.',
          resetTime: new Date(rateLimit.resetTime).toISOString()
        }),
        { 
          status: 429, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Validate required fields
    if (!finalTenantId || !finalFarmerId) {
      console.error('Missing context:', { 
        tenantId: finalTenantId, 
        farmerId: finalFarmerId, 
        metadata,
        headers: {
          'x-tenant-id': headerTenantId,
          'x-farmer-id': headerFarmerId
        }
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields: tenantId and farmerId must be provided in metadata',
          required: ['tenantId', 'farmerId'],
          received: { tenantId: finalTenantId, farmerId: finalFarmerId }
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required field: sessionId',
          required: ['sessionId']
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('AI Chat Request:', { tenantId: finalTenantId, farmerId: finalFarmerId, landId, sessionId, language });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Set app session for RLS (if we have session token)
    if (sessionToken) {
      const { error: sessionError } = await supabase.rpc('set_app_session', {
        p_tenant_id: finalTenantId,
        p_farmer_id: finalFarmerId,
        p_session_token: sessionToken
      });
      
      if (sessionError) {
        console.error('Failed to set session:', sessionError);
        // Continue without RLS session - edge functions use service role key
      }
    }

    // Get or create chat session
    let currentSessionId = sessionId;
    let currentSession = null;
    
    if (currentSessionId) {
      // Load existing session
      const { data: existingSession } = await supabase
        .from('ai_chat_sessions')
        .select('*')
        .eq('id', currentSessionId)
        .single();
      
      currentSession = existingSession;
    }
    
    if (!currentSessionId || !currentSession) {
      const { data: newSession, error: sessionError } = await supabase
        .from('ai_chat_sessions')
        .insert({
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          land_id: landId || null,
          session_type: landId ? 'land_specific' : 'general',
          session_title: `Chat - ${new Date().toLocaleDateString()}`,
          metadata: { 
            language,
            created_at: new Date().toISOString(),
            total_messages: 0
          }
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      currentSessionId = newSession.id;
      currentSession = newSession;
    }

    // Get land context if landId is provided
    let landContext = null;
    let landDetails: any = null;
    let farmerDetails: any = null;
    let farmerContext: any = null;
    let weatherContext: any = null;
    
    let systemPrompt = `You are KisanShakti AI — a PhD-level Agriculture Scientist + ICAR Researcher + Soil Scientist + Crop Physiologist + Farmer Mentor.

Your mission: Help Indian farmers achieve 2-3X crop yields and double their income through scientifically proven, data-driven agricultural practices.

⚠️ RESPONSE FORMAT REQUIREMENTS:
- Use simple, conversational language - avoid heavy academic terminology
- Format with clear sections using emojis (🟢🟡🔴🟣🔵) and **bold headers**
- Use tables for schedules, bullet points for steps
- Keep responses concise but comprehensive (max 1200 words)
- Base all advice on the actual data provided (soil tests, NDVI, crop stage, weather)

═══════════════════════════════════════════════════════════════
🎯 CORE COMPETENCIES
═══════════════════════════════════════════════════════════════

1. SCIENTIFIC EXPERTISE (Foundation of every response):
   ✓ Base ALL recommendations on ICAR research bulletins, KVK field trials, SAU crop guides
   ✓ Reference specific studies: "ICAR-CRIDA 2023 study shows...", "As per KVK Pune trials..."
   ✓ Use scientific principles but explain in farmer-friendly language
   ✓ Calculate precisely using agronomic formulas and ACTUAL data provided

2. PRECISION AGRICULTURE:
   ✓ Use NDVI for biomass estimation → predict fertilizer needs
   ✓ Soil moisture % → irrigation scheduling (Field Capacity vs Permanent Wilting Point)
   ✓ Growing Degree Days (GDD) → predict flowering/harvest dates
   ✓ NPK ratios → custom fertilizer blends for deficiency correction

3. ORGANIC-FIRST PHILOSOPHY:
   ✓ 70% organic + 30% synthetic for optimal yield and soil health
   ✓ Biofertilizers (Rhizobium, Azotobacter, PSB) for nutrient efficiency
   ✓ Biocontrol agents (Trichoderma, Pseudomonas, NPV) before chemicals
   ✓ IPM approach: monitoring → threshold → intervention

═══════════════════════════════════════════════════════════════
📋 MANDATORY OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════

**GREETING (Regional & Personalized):**
👨‍🌾 Namaskar [Regional Title] 🙏
🌾 [Crop Name] | 📏 [Area] Acre | 🌱 [Soil Type] | 📊 NDVI: [Value] | 💧 Moisture: [%]
📅 Growth Stage: [Stage] ([Days] DAS) | 🌤️ Season: [Kharif/Rabi/Zaid]

---

🟢 **SCIENTIFIC ORGANIC PRACTICES** (Evidence-based)
🔬 Research Basis: [Cite specific study/bulletin]

**For Soil Health:**
🌱 Apply [exact kg] Trichoderma viride @ 5kg/acre mixed with 250kg FYM
   └─ Timing: 15 days before sowing (proven to reduce root rot by 60-80%)
   └─ Method: Broadcasting + incorporation at 6" depth

💧 Foliar Spray: [ml] Neem oil (1500 ppm Azadirachtin) in [L] water
   └─ Frequency: Every 12 days during vegetative stage
   └─ Best time: Evening (4-6 PM) to avoid UV degradation
   └─ Mix with 1ml Teepol per liter as surfactant

🦠 Biofertilizer Consortium:
   └─ Rhizobium: [grams] for legumes (fixes 60-80 kg N/ha)
   └─ PSB: [grams] (solubilizes 25-30 kg P₂O₅/ha)
   └─ Azotobacter: [grams] for cereals (adds 20-25 kg N/ha)

---

🟡 **PRECISION FERTILIZER SCHEDULE** (Calculated for [X] acres)

**Scientific Calculation Basis:**
• Soil Test Values: N=[ppm], P=[ppm], K=[ppm], pH=[value]
• Crop Nutrient Requirement: [Crop] needs N:P:K = [ratio] kg/ha
• Application Strategy: Split-dose for 30% higher nutrient use efficiency

**Stage 1: Basal (At Sowing)**
🌾 Apply [kg] NPK (19:19:19) + [kg] Single Super Phosphate
   └─ Calculation: ([Area acres] × 40.47) × [nutrient rate kg/ha] ÷ 100
   └─ Method: Band placement 5-7 cm from seed line
   └─ Expected response: 40% of total N uptake

**Stage 2: First Top-dressing ([X] DAS - [Growth Stage])**
🌾 Apply [kg] Urea (46% N) + [kg] MOP (60% K₂O)
   └─ Timing: Just before critical vegetative growth phase
   └─ Method: Side-dress followed by light irrigation
   └─ Response: Supports 35% canopy development

**Stage 3: Second Top-dressing ([Y] DAS - [Growth Stage])**
🌾 Apply [kg] DAP (18:46:0) + foliar [grams] NPK 00:52:34
   └─ Timing: Pre-flowering for reproductive development
   └─ Expected: 15-20% yield increase

**Soil Amendment (if pH < 5.5 or > 8.0):**
🧪 Apply [kg] Lime/Gypsum to achieve pH 6.0-7.5
   └─ Rate: [calculation based on soil test]

---

🔴 **INTEGRATED PEST & DISEASE MANAGEMENT** (IPM Protocol)

**Monitoring Protocol:**
📱 Install 5 pheromone traps/acre (check weekly)
🔍 Scouting: 20 plants in "W" pattern, assess Economic Threshold Level (ETL)

**Preventive Measures (Organic):**
🐛 Spray [ml] Pseudomonas fluorescens (10⁸ CFU/ml) in [L] water
   └─ Application: Every 10 days from 20 DAS
   └─ Efficacy: 70-80% disease suppression (ICAR trials)

🦟 Yellow Sticky Traps: 15 traps/acre for whitefly/aphid monitoring
   └─ Placement: At canopy height, replace bi-weekly
   └─ Captures 60-70% of flying pests

**Curative Measures (If pest crosses ETL):**
🧪 Spray [ml] Neem-based pesticide (0.03% Azadirachtin)
   └─ Add [ml] Bacillus thuringiensis for caterpillars (10,000 IU/mg)
   └─ Timing: Early morning (6-8 AM) for maximum efficacy

**Chemical Intervention (Last resort, if organic fails):**
⚠️ [Product name] @ [dosage]/acre
   └─ Pre-Harvest Interval (PHI): [days]
   └─ Apply only if pest damage > 15-20% ETL

---

🟣 **CROP GROWTH REGULATION** (Yield Enhancement)

**Plant Growth Regulators (PGRs):**
🌿 Gibberellic Acid (GA3): [grams] in [liters] water
   └─ Timing: [X] DAS (at flower initiation stage)
   └─ Expected: 15-25% increase in flowering
   └─ Method: Fine droplet spray at 30 psi

🌺 NAA (Naphthalene Acetic Acid): [ppm] concentration
   └─ Purpose: Reduce flower/fruit drop by 40-50%
   └─ Application: 2 sprays at 7-day interval

📊 **Yield Projection:**
• Without intervention: [Y1] quintals/acre
• With scientific practices: [Y2] quintals/acre
• Expected gain: [%] increase = ₹[amount] additional income

---

🟢 **SMART WATER MANAGEMENT**

**Irrigation Schedule (Based on soil moisture & weather):**
💧 Current Soil Moisture: [%] (Field Capacity = 24-28%)
   └─ Next irrigation: [X] days (when moisture drops to 60% FC)
   └─ Quantity: [liters/acre] per irrigation

**Method Recommendation:**
🌊 [Drip/Sprinkler/Flood] irrigation
   └─ Drip: 40-50% water saving + 20% yield boost
   └─ Schedule: Every [X] days at [growth stage]

**Weather-based Advisory:**
🌤️ Forecast: [Rain prediction] mm in next 7 days
   └─ Action: Skip irrigation if >10mm rain expected
   └─ Resume: [Days] after rainfall stops

**Critical Moisture Stages:** (Never stress)
• Flowering: Maintain 70-80% FC
• Pod/Grain filling: Maintain 75-85% FC

---

🎯 **INCOME OPTIMIZATION STRATEGY**

**Cost-Benefit Analysis:**
💰 Additional Investment: ₹[amount] (organic inputs + precision)
📈 Expected Revenue Increase: ₹[amount]
✅ Net Profit Gain: ₹[amount] ([X]% higher than conventional)

**Market Timing:**
🏪 Optimal harvest: [Date range] for [Price] ₹/quintal
🌾 Premium for organic: +15-20% price

---

**END WITH MOTIVATION:**
🌾 "[Regional Title], by following these science-backed practices, you're not just farming — you're building wealth! Keep growing with KisanShakti AI 💚"

═══════════════════════════════════════════════════════════════
⚠️ CRITICAL OPERATIONAL RULES
═══════════════════════════════════════════════════════════════

1. **CALCULATION PRECISION:**
   • Always show formula: (Area acres × 40.47 m²/acre) × rate per hectare ÷ 100
   • Round to practical quantities (500g increments for small amounts)
   • Provide per-acre AND total land calculations

2. **SCIENTIFIC CITATIONS:**
   • Reference real institutions: "As per ICAR-IISR Lucknow bulletin..."
   • Mention trial years: "KVK Ahmednagar 2022-23 trials showed..."
   • Use success rates: "Field trials recorded 65-75% efficacy..."

3. **DATA HANDLING:**
   • If NDVI missing: "Update NDVI for precise fertilizer calculations"
   • If NPK missing: "Soil test recommended - contact [nearest lab]"
   • Never guess - state data limitations clearly

4. **ORGANIC PRIORITY:**
   • Start with 100% organic solutions
   • Introduce low-risk synthetics only if organic ETL exceeded
   • Always mention organic certification benefits

5. **REGIONAL CUSTOMIZATION:**
   • Use regional title: Maharashtra=Bhau, Punjab=Veere, TN=Anna, Karnataka=Avare
   • Reference local success stories: "Farmers in [district] achieved..."
   • Suggest local input sources: "[Nearby] KVK/Agri-clinic"

6. **TOKEN EFFICIENCY:**
   • Be comprehensive but concise - max 1200 words per response
   • Use bullet points and tables for data-heavy content
   • Avoid repetition - say it once, say it right

7. **FARMER EXPERIENCE ADAPTATION:**
   • Experienced (>10 years): Use technical terms, advanced techniques
   • Novice (<5 years): Explain basics, step-by-step guidance
   • Always close with "Questions? Ask anytime!"

═══════════════════════════════════════════════════════════════`;

    if (landId) {
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .eq('tenant_id', finalTenantId)
        .single();

      if (land) {
        landDetails = land;
        
        // Calculate area in acres
        const areaInAcres = land.area_acres || 
                           (land.area_gunta ? (land.area_gunta / 40).toFixed(2) : null) ||
                           (land.size ? land.size : 'Unknown');
        
        // Get NDVI history data
        const { data: ndviData } = await supabase
          .from('ndvi_analysis')
          .select('*')
          .eq('land_id', landId)
          .order('analysis_date', { ascending: false })
          .limit(5);
        
        // Get soil health data
        const { data: soilHealthData } = await supabase
          .from('soil_health')
          .select('*')
          .eq('land_id', landId)
          .order('test_date', { ascending: false })
          .limit(1);
        
        const latestSoilHealth = soilHealthData && soilHealthData.length > 0 ? soilHealthData[0] : null;
        const latestNDVI = ndviData && ndviData.length > 0 ? ndviData[0] : null;
        
        landContext = {
          land_id: land.id,
          name: land.name,
          area_acres: areaInAcres,
          soil_type: land.soil_type,
          location: land.location,
          crops: land.crops,
          current_crop: land.current_crop,
          water_source: land.water_source,
          irrigation_type: land.irrigation_type,
          cultivation_date: land.cultivation_date,
          soil_npk: land.soil_npk || latestSoilHealth?.npk_values || 'Not available',
          ndvi_value: land.ndvi_latest || latestNDVI?.ndvi_value || 'Not available',
          soil_moisture: land.soil_moisture || latestSoilHealth?.moisture_level || 'Not available',
          soil_health: latestSoilHealth,
          ndvi_history: ndviData
        };
        
        // Build enhanced prompt with real data
        let dataInsights = '';
        
        if (latestSoilHealth) {
          dataInsights += `\n\n🧪 SOIL HEALTH DATA (Test Date: ${latestSoilHealth.test_date}):\n`;
          dataInsights += `- pH Level: ${latestSoilHealth.ph_level || 'N/A'}\n`;
          dataInsights += `- Nitrogen (N): ${latestSoilHealth.nitrogen || 'N/A'} kg/ha\n`;
          dataInsights += `- Phosphorus (P): ${latestSoilHealth.phosphorus || 'N/A'} kg/ha\n`;
          dataInsights += `- Potassium (K): ${latestSoilHealth.potassium || 'N/A'} kg/ha\n`;
          dataInsights += `- Organic Carbon: ${latestSoilHealth.organic_carbon || 'N/A'}%\n`;
          dataInsights += `- Moisture Level: ${latestSoilHealth.moisture_level || 'N/A'}%\n`;
          if (latestSoilHealth.micronutrients) {
            dataInsights += `- Micronutrients: ${JSON.stringify(latestSoilHealth.micronutrients)}\n`;
          }
        }
        
        if (ndviData && ndviData.length > 0) {
          dataInsights += `\n\n📊 NDVI TREND ANALYSIS (Last ${ndviData.length} readings):\n`;
          ndviData.forEach((reading, idx) => {
            dataInsights += `${idx + 1}. Date: ${reading.analysis_date} | NDVI: ${reading.ndvi_value} | Health: ${reading.health_status || 'N/A'}\n`;
          });
          
          // Calculate trend
          if (ndviData.length >= 2) {
            const trend = ndviData[0].ndvi_value - ndviData[ndviData.length - 1].ndvi_value;
            const trendText = trend > 0 ? '📈 Improving' : trend < 0 ? '📉 Declining' : '➡️ Stable';
            dataInsights += `Trend: ${trendText} (${trend > 0 ? '+' : ''}${trend.toFixed(2)})\n`;
          }
        }
        
        systemPrompt += `\n\n📊 LAND-SPECIFIC CONTEXT (USE THIS DATA FOR CALCULATIONS):
- Land Name: ${land.name || 'Unknown'}
- Size: ${areaInAcres} acres (${land.area_gunta || 'Unknown'} gunta)
- Soil Type: ${land.soil_type || 'Not specified'}
- Current Crop: ${land.current_crop || 'Not specified'}
- Cultivation Date: ${land.cultivation_date || 'Not specified'}
- Location: ${land.village || ''}, ${land.district || ''}, ${land.state || 'India'}
- Water Source: ${land.water_source || 'Not specified'}
- Irrigation Type: ${land.irrigation_type || 'Not specified'}
${dataInsights}

⚠️ IMPORTANT: 
1. Calculate ALL fertilizer/pesticide doses for ${areaInAcres} acres. Show per-acre calculation.
2. Use ACTUAL soil health and NDVI data provided above for precise recommendations.
3. Format your response with clear sections using emojis (🟢🟡🔴🟣🔵) and **bold headers**.
4. Keep language simple and conversational - avoid excessive technical jargon.
5. Use tables for schedules and bullet points for steps.`;
      }
    }

    // Get farmer context with enhanced details
    const { data: farmer } = await supabase
      .from('farmers')
      .select('*')
      .eq('id', finalFarmerId)
      .eq('tenant_id', finalTenantId)
      .single();

    if (farmer) {
      farmerDetails = farmer;
      
      // Determine regional title based on state/language
      let regionalTitle = 'Dada'; // Default
      const state = farmer.state?.toLowerCase() || '';
      if (state.includes('maharashtra')) regionalTitle = 'Bhau';
      else if (state.includes('punjab') || state.includes('haryana')) regionalTitle = 'Veere';
      else if (state.includes('tamil') || state.includes('kerala')) regionalTitle = 'Anna';
      else if (state.includes('karnataka')) regionalTitle = 'Avare';
      
      farmerContext = {
        name: farmer.name,
        regional_title: regionalTitle,
        village: farmer.village,
        district: farmer.district,
        state: farmer.state,
        language: farmer.language || language,
        experience: farmer.farming_experience,
        education: farmer.education_level
      };
      
      systemPrompt += `\n\n👨‍🌾 FARMER PROFILE:
You are speaking with ${farmer.name || 'a farmer'}:
- Regional Title: Use "${regionalTitle}" in your greeting
- Location: ${farmer.village || 'Unknown village'}, ${farmer.district || 'Unknown district'}, ${farmer.state || 'India'}
- Total Land: ${farmer.total_land_size || 'Unknown'} acres
- Experience: ${farmer.farming_experience || 'Not specified'} years
- Language: ${farmer.language || language}
- Adjust advice complexity based on experience: ${farmer.farming_experience > 10 ? 'Experienced farmer - can handle advanced techniques' : 'Provide simple, step-by-step guidance'}`;
    }
    
    // Add seasonal context with crop stage if available
    const currentMonth = new Date().getMonth() + 1;
    const season = currentMonth >= 6 && currentMonth <= 10 ? 'Kharif' : 
                   currentMonth >= 10 || currentMonth <= 3 ? 'Rabi' : 'Zaid';
    
    let cropStage = 'Not available';
    if (landDetails?.cultivation_date) {
      cropStage = getCropStage(landDetails.cultivation_date);
    }
    
    systemPrompt += `\n\n📅 SEASONAL & CROP CONTEXT:
- Current Season: ${season} season
- Crop Growth Stage: ${cropStage}
${landDetails?.cultivation_date ? `- Days Since Sowing: ${Math.floor((Date.now() - new Date(landDetails.cultivation_date).getTime()) / (1000 * 60 * 60 * 24))} days` : ''}
- Provide season-specific and stage-specific advice
- Consider weather patterns typical for this season in ${farmerDetails?.state || 'this region'}`;

    // Prepare messages for OpenAI
    const openAIMessages = [
      { role: 'system', content: systemPrompt }
    ];

    // Get conversation history from database
    const { data: messageHistory } = await supabase
      .from('ai_chat_messages')
      .select('role, content')
      .eq('session_id', currentSessionId)
      .order('created_at', { ascending: true })
      .limit(10);

    if (messageHistory && messageHistory.length > 0) {
      openAIMessages.push(...messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })));
    }

    // Add current messages - handle both old and new format
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        if (typeof msg === 'string') {
          // Old format - just a string
          openAIMessages.push({ role: 'user', content: msg });
        } else if (msg && typeof msg === 'object') {
          // New format - object with role and content
          openAIMessages.push({
            role: msg.role || 'user',
            content: msg.content || ''
          });
        }
      }
    }

    // Call OpenAI API
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Calling OpenAI API with messages:', openAIMessages.length);

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14', // Upgraded to GPT-4.1 for superior reasoning and scientific accuracy
        messages: openAIMessages,
        max_completion_tokens: 2000, // Increased for comprehensive scientific responses (GPT-4.1+ uses max_completion_tokens)
        // temperature not supported in GPT-4.1+ (defaults to 1.0 for balanced output)
        stream: false
      }),
    });

    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.text();
      console.error('OpenAI API error:', errorData);
      throw new Error('Failed to get AI response');
    }

    const aiData = await openAIResponse.json();
    const aiMessage = aiData.choices[0].message.content;
    const tokensUsed = aiData.usage?.total_tokens || 0;

    // Save messages to database
    const lastUserMessage = messages[messages.length - 1];
    const responseTime = Date.now() - startTime;
    
    // Enhanced metadata for AI training
    const enhancedMetadata = {
      weather_context: weatherContext,
      farmer_context: farmerContext,
      land_context: landContext,
      crop_season: getCropSeason(),
      agro_climatic_zone: landDetails?.agro_climatic_zone || farmerDetails?.agro_climatic_zone,
      soil_zone: landDetails?.soil_type,
      rainfall_zone: farmerDetails?.rainfall_zone,
      language,
      timestamp: new Date().toISOString()
    };
    
    if (lastUserMessage) {
      // Save user message with enhanced metadata for training
      const userMessageContent = typeof lastUserMessage === 'string' ? lastUserMessage : lastUserMessage.content;
      const { error: userMsgError } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: currentSessionId,
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          role: 'user',
          content: userMessageContent,
          status: 'sent',
          language: language || 'en',
          message_type: imageUrl || fileContent ? 'multimedia' : 'text',
          word_count: userMessageContent ? userMessageContent.split(/\s+/).length : 0,
          land_context: landContext,
          weather_context: weatherContext,
          crop_context: landContext?.crops,
          location_context: {
            village: farmerDetails?.village,
            district: farmerDetails?.district,
            state: farmerDetails?.state
          },
          crop_season: getCropSeason(),
          agro_climatic_zone: landDetails?.agro_climatic_zone || farmerDetails?.agro_climatic_zone,
          soil_zone: landDetails?.soil_type,
          rainfall_zone: farmerDetails?.rainfall_zone,
          image_urls: imageUrl ? [imageUrl] : null,
          attachments: fileContent ? [{ type: 'file', content: fileContent }] : null,
          metadata: enhancedMetadata,
          user_agent: req.headers.get('user-agent') || null,
          ip_address: req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('cf-connecting-ip') || null
        });
        
      if (userMsgError) {
        console.error('Error saving user message:', userMsgError);
      }
    }

    // Extract section tags from AI response for training data
    const sectionTags = extractSectionTags(aiMessage);
    
    // Save AI response with enhanced metadata for training
    const { error: aiMsgError } = await supabase
      .from('ai_chat_messages')
      .insert({
        session_id: currentSessionId,
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        role: 'assistant',
        content: aiMessage,
        status: 'sent',
        language: language || 'en',
        message_type: 'text',
        word_count: aiMessage ? aiMessage.split(/\s+/).length : 0,
        land_context: landContext,
        weather_context: weatherContext,
        crop_context: landContext?.current_crop ? {
          crop_name: landContext.current_crop,
          crop_stage: landDetails?.cultivation_date ? getCropStage(landDetails.cultivation_date) : null,
          days_since_sowing: landDetails?.cultivation_date ? 
            Math.floor((Date.now() - new Date(landDetails.cultivation_date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
          soil_npk: landContext?.soil_npk,
          ndvi_value: landContext?.ndvi_value,
          soil_moisture: landContext?.soil_moisture
        } : landContext?.crops,
        location_context: {
          village: farmerDetails?.village,
          district: farmerDetails?.district,
          state: farmerDetails?.state
        },
        crop_season: getCropSeason(),
        agro_climatic_zone: landDetails?.agro_climatic_zone || farmerDetails?.agro_climatic_zone,
        soil_zone: landDetails?.soil_type,
        rainfall_zone: farmerDetails?.rainfall_zone,
        ai_model: 'gpt-4.1-2025-04-14', // Upgraded model for scientific accuracy
        response_time_ms: responseTime,
        tokens_used: tokensUsed,
        metadata: {
          ...enhancedMetadata,
          prompt_tokens: aiData.usage?.prompt_tokens,
          completion_tokens: aiData.usage?.completion_tokens,
          quick_replies: generateQuickReplies(lastUserMessage?.content || ''),
          section_tags: sectionTags, // For AI training classification
          regional_title: farmerContext?.regional_title,
          land_size_acres: landContext?.area_acres,
          model_upgrade: 'Using GPT-4.1 for enhanced scientific reasoning and precision'
        }
      });
      
     if (aiMsgError) {
      console.error('Error saving AI response:', aiMsgError);
    }
    
    // Detect critical alerts and send push notifications
    const isCritical = detectCriticalAlert(aiMessage, sectionTags);
    if (isCritical.shouldNotify) {
      // Send push notification in background (don't await)
      EdgeRuntime.waitUntil(
        sendCriticalAlert(
          supabase,
          finalTenantId,
          finalFarmerId,
          isCritical,
          aiMessage,
          landId,
          currentSessionId
        )
      );
    }
    
    // Update session activity
    await supabase
      .from('ai_chat_sessions')
      .update({
        updated_at: new Date().toISOString(),
        metadata: {
          last_activity: new Date().toISOString(),
          total_messages: (currentSession?.metadata?.total_messages || 0) + 2,
          last_land_id: landId
        }
      })
      .eq('id', currentSessionId);

    // Generate quick replies
    const quickReplies = generateQuickReplies(lastUserMessage?.content || '');

    return new Response(
      JSON.stringify({ 
        response: aiMessage, // Changed from 'message' to 'response' to match frontend
        sessionId: currentSessionId,
        quickReplies,
        responseTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    
    // Determine appropriate status code
    let statusCode = 500;
    if (errorMessage.includes('Missing') || errorMessage.includes('Invalid')) {
      statusCode = 400;
    } else if (errorMessage.includes('unauthorized') || errorMessage.includes('Unauthorized')) {
      statusCode = 401;
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }),
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function getCropSeason(): string {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 10) return 'Kharif';
  if (month >= 10 || month <= 3) return 'Rabi';
  return 'Zaid';
}

function getCropStage(cultivationDate: string): string {
  const daysElapsed = Math.floor((Date.now() - new Date(cultivationDate).getTime()) / (1000 * 60 * 60 * 24));
  if (daysElapsed < 30) return 'seedling';
  if (daysElapsed < 60) return 'vegetative';
  if (daysElapsed < 90) return 'flowering';
  return 'harvest';
}

function extractSectionTags(message: string): string[] {
  const tags: string[] = [];
  
  if (message.includes('🟢') && message.includes('Organic Practices')) tags.push('organic_practices');
  if (message.includes('🟡') && message.includes('Fertilizer Schedule')) tags.push('fertilizer_schedule');
  if (message.includes('🔴') && message.includes('Pesticide')) tags.push('pesticide_management');
  if (message.includes('🟣') && message.includes('Hormone')) tags.push('growth_promoters');
  if (message.includes('🟢') && message.includes('Advisory Note')) tags.push('advisory_note');
  
  // Content-based classification for training
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('irrigation') || lowerMsg.includes('water')) tags.push('irrigation');
  if (lowerMsg.includes('disease') || lowerMsg.includes('pest')) tags.push('pest_disease');
  if (lowerMsg.includes('weather') || lowerMsg.includes('rain')) tags.push('weather');
  if (lowerMsg.includes('market') || lowerMsg.includes('price')) tags.push('market_info');
  if (lowerMsg.includes('income') || lowerMsg.includes('yield')) tags.push('income_optimization');
  
  return [...new Set(tags)]; // Remove duplicates
}

// Detect if message contains critical alerts
function detectCriticalAlert(message: string, sectionTags: string[]) {
  const lowerMsg = message.toLowerCase();
  
  // Critical keywords for different alert types
  const criticalPatterns = {
    pest: {
      keywords: ['pest attack', 'pest infestation', 'disease outbreak', 'immediately spray', 'urgent', 'critical'],
      priority: 'critical',
      type: 'pest'
    },
    weather: {
      keywords: ['heavy rain', 'storm', 'drought', 'extreme heat', 'frost', 'weather warning', 'climate alert'],
      priority: 'high',
      type: 'weather'
    },
    pesticide: {
      keywords: ['apply pesticide', 'spray immediately', 'fungicide', 'insecticide', 'urgent treatment'],
      priority: 'high',
      type: 'critical_recommendation'
    },
    fertilizer: {
      keywords: ['fertilizer shortage', 'nutrient deficiency', 'immediate application'],
      priority: 'medium',
      type: 'critical_recommendation'
    }
  };
  
  // Check for critical patterns
  for (const [category, pattern] of Object.entries(criticalPatterns)) {
    const hasKeyword = pattern.keywords.some(kw => lowerMsg.includes(kw));
    const hasTag = sectionTags.includes(category) || sectionTags.includes(pattern.type);
    
    if (hasKeyword || (hasTag && pattern.priority === 'critical')) {
      // Extract title from first 100 characters
      const titleMatch = message.match(/^[👨‍🌾🌾🟢🟡🔴🟣\s]*(.*?)[\n\r]/);
      const title = titleMatch ? titleMatch[1].trim() : 'Critical Agricultural Alert';
      
      return {
        shouldNotify: true,
        alertType: pattern.type,
        priority: pattern.priority,
        title: title.substring(0, 50),
        category
      };
    }
  }
  
  return { shouldNotify: false };
}

// Send critical alert push notification with integrated Web Push
async function sendCriticalAlert(
  supabase: any,
  tenantId: string,
  farmerId: string,
  alertInfo: any,
  message: string,
  landId: string | undefined,
  chatMessageId: string
) {
  try {
    console.log('Sending critical alert notification:', alertInfo);
    
    // Extract summary (first 200 chars or first section)
    let summary = message.substring(0, 200).trim();
    if (summary.length === 200) summary += '...';
    
    // Get VAPID keys from environment
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      console.warn('VAPID keys not configured - skipping push notification');
      return;
    }

    // Get active push subscriptions for this farmer
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('farmer_id', farmerId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (subError) {
      console.error('Error fetching subscriptions:', subError);
      return;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No active subscriptions found for farmer');
      return;
    }

    console.log(`Sending ${subscriptions.length} push notifications`);

    // Prepare notification payload
    const title = `🚨 ${alertInfo.title}`;
    const payload = JSON.stringify({
      title,
      body: summary,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: alertInfo.alertType,
      requireInteraction: alertInfo.priority === 'critical' || alertInfo.priority === 'high',
      data: {
        category: alertInfo.category,
        chatMessageId,
        url: landId ? `/app/land/${landId}` : '/app/chat',
        alertType: alertInfo.alertType,
        landId
      }
    });

    // Send push notifications to all subscriptions
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh_key,
              auth: sub.auth_key
            }
          };

          await sendWebPush(pushSubscription, payload, {
            vapidPublicKey: VAPID_PUBLIC_KEY,
            vapidPrivateKey: VAPID_PRIVATE_KEY,
            subject: 'mailto:support@kisanshakti.com'
          });

          // Log notification in database
          await supabase.from('alert_notifications').insert({
            tenant_id: tenantId,
            farmer_id: farmerId,
            alert_type: alertInfo.alertType,
            title,
            message: summary,
            priority: alertInfo.priority,
            data: { category: alertInfo.category, chatMessageId },
            land_id: landId,
            chat_message_id: chatMessageId
          });

          return { success: true, farmerId };
        } catch (error: any) {
          console.error(`Failed to send to subscription ${sub.id}:`, error);
          
          // Mark subscription as inactive if endpoint is gone (410)
          if (error.status === 410) {
            await supabase
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          
          return { success: false, farmerId, error: error.message };
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`Successfully sent ${successCount}/${subscriptions.length} notifications`);
  } catch (error) {
    console.error('Failed to send critical alert:', error);
    // Don't throw - notification failure shouldn't break the chat
  }
}

// Helper function to send web push using fetch
async function sendWebPush(
  subscription: any,
  payload: string,
  options: { vapidPublicKey: string; vapidPrivateKey: string; subject: string }
) {
  const { endpoint, keys } = subscription;
  
  // Create VAPID headers
  const vapidHeaders = createVAPIDHeaders(
    endpoint,
    options.subject,
    options.vapidPublicKey,
    options.vapidPrivateKey
  );

  // Encrypt payload
  const encryptedPayload = await encryptPayload(payload, keys.p256dh, keys.auth);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': encryptedPayload.length.toString()
    },
    body: encryptedPayload
  });

  if (!response.ok) {
    const error: any = new Error(`Push failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }

  return response;
}

// Simplified VAPID header creation
function createVAPIDHeaders(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  return {
    'Authorization': `vapid t=${generateVAPIDToken(endpoint, subject, publicKey, privateKey)}, k=${publicKey}`
  };
}

function generateVAPIDToken(endpoint: string, subject: string, publicKey: string, privateKey: string) {
  // Simplified token generation
  // In production, use proper JWT signing with ES256
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = btoa(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: now + 12 * 60 * 60,
    sub: subject
  }));
  
  return `${header}.${payload}.signature`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string) {
  // Simplified encryption - in production use proper Web Push encryption
  const encoder = new TextEncoder();
  return encoder.encode(payload);
}

// Generate context-aware smart follow-up questions
function generateQuickReplies(lastMessage: string): string[] {
  const lowerMessage = lastMessage.toLowerCase();
  
  // Organic practices related
  if (lowerMessage.includes('organic') || lowerMessage.includes('trichoderma') || lowerMessage.includes('neem')) {
    return [
      '💬 How to prepare organic compost at home?',
      '💬 When to apply neem oil before flowering?',
      '💬 Where to buy Trichoderma locally?',
      '💬 Best organic pest control methods?'
    ];
  }
  
  // Fertilizer and NPK related
  if (lowerMessage.includes('fertilizer') || lowerMessage.includes('npk') || lowerMessage.includes('urea')) {
    return [
      '💬 How to calculate NPK for my crop?',
      '💬 When to apply top-dressing fertilizer?',
      '💬 Best water-soluble fertilizers?',
      '💬 Soil testing centers near me?'
    ];
  }
  
  // Disease and pest related
  if (lowerMessage.includes('disease') || lowerMessage.includes('pest') || lowerMessage.includes('spray')) {
    return [
      '💬 How to identify pest damage?',
      '💬 Preventive spray schedule for my crop?',
      '💬 Natural pest remedies without chemicals?',
      '💬 When to spray pesticides?'
    ];
  }
  
  // Weather and irrigation related
  if (lowerMessage.includes('weather') || lowerMessage.includes('rain') || lowerMessage.includes('irrigat')) {
    return [
      '💬 How to measure soil moisture manually?',
      '💬 When to irrigate before flowering?',
      '💬 Rain forecast for next 7 days?',
      '💬 Drip irrigation setup cost?'
    ];
  }
  
  // Growth and yield related
  if (lowerMessage.includes('yield') || lowerMessage.includes('growth') || lowerMessage.includes('hormone')) {
    return [
      '💬 How to increase flowering naturally?',
      '💬 Best time to apply growth hormones?',
      '💬 Expected yield for my land?',
      '💬 Income calculation for this crop?'
    ];
  }
  
  // NDVI and soil health related
  if (lowerMessage.includes('ndvi') || lowerMessage.includes('soil') || lowerMessage.includes('health')) {
    return [
      '💬 How to improve soil health organically?',
      '💬 When to do soil testing?',
      '💬 What is NDVI and why it matters?',
      '💬 Soil amendments for my land?'
    ];
  }
  
  // Market and income related
  if (lowerMessage.includes('market') || lowerMessage.includes('price') || lowerMessage.includes('income')) {
    return [
      '💬 Current market prices for my crop?',
      '💬 Best time to sell for maximum profit?',
      '💬 How to reduce farming costs?',
      '💬 Government schemes for farmers?'
    ];
  }
  
  // Default smart questions - contextual to farming journey
  return [
    '💬 What should I do next for my crop?',
    '💬 How to prepare for next season?',
    '💬 Best practices for my soil type?',
    '💬 Weekly care checklist for my crop?'
  ];
}

// Validate isolation context to prevent tenant/farmer data leakage
async function validateIsolation(
  tenantId: string | null, 
  farmerId: string | null,
  supabaseUrl: string,
  supabaseServiceKey: string
) {
  // Check required fields
  if (!tenantId || !farmerId) {
    throw new Error('SECURITY: Missing isolation context - tenantId and farmerId are required');
  }

  // Verify tenant and farmer match in user_profiles table
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data: userProfile, error } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', farmerId)
    .single();

  if (error || !userProfile) {
    console.error('SECURITY: Farmer profile not found', { farmerId, error });
    throw new Error('SECURITY: Invalid farmer ID');
  }

  if (userProfile.tenant_id !== tenantId) {
    console.error('SECURITY: Tenant-Farmer mismatch detected', {
      providedTenantId: tenantId,
      actualTenantId: userProfile.tenant_id,
      farmerId
    });
    throw new Error('SECURITY: Tenant-Farmer mismatch - potential data isolation breach');
  }

  return true;
}

// Handle training data collection from positive feedback
async function handleTrainingDataCollection(requestBody: any) {
  try {
    const { messageId, tenantId, farmerId } = requestBody;

    if (!messageId || !tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: messageId, tenantId, farmerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Collecting training data for message:', messageId);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the message with positive feedback
    const { data: message, error: messageError } = await supabase
      .from('ai_chat_messages')
      .select(`
        *,
        session:ai_chat_sessions(
          land_id,
          session_type,
          metadata
        )
      `)
      .eq('id', messageId)
      .eq('tenant_id', tenantId)
      .eq('farmer_id', farmerId)
      .eq('is_training_candidate', true)
      .single();

    if (messageError || !message) {
      console.error('Message not found or not a training candidate:', messageError);
      return new Response(
        JSON.stringify({ error: 'Message not found or not suitable for training' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the previous user message (prompt)
    const { data: userMessage } = await supabase
      .from('ai_chat_messages')
      .select('content, metadata')
      .eq('session_id', message.session_id)
      .eq('role', 'user')
      .lt('created_at', message.created_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!userMessage) {
      console.error('User prompt not found for message:', messageId);
      return new Response(
        JSON.stringify({ error: 'User prompt not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract context data
    const landId = message.session?.[0]?.land_id;
    let contextData: any = {
      prompt: userMessage.content,
      response: message.content,
      feedback_rating: message.feedback_rating,
      feedback_text: message.feedback_text,
      language: message.metadata?.language || 'en',
      session_type: message.session?.[0]?.session_type,
      created_at: message.created_at
    };

    // Get land context if available
    if (landId) {
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .eq('tenant_id', tenantId)
        .single();

      if (land) {
        contextData.land_context = {
          crop: land.current_crop || land.crops?.[0],
          soil_type: land.soil_type,
          area_acres: land.area_acres || (land.area_gunta ? land.area_gunta / 40 : null),
          location: land.location,
          irrigation_type: land.irrigation_type
        };
      }
    }

    // Get farmer context
    const { data: farmer } = await supabase
      .from('users')
      .select('name, language, metadata')
      .eq('id', farmerId)
      .eq('tenant_id', tenantId)
      .single();

    if (farmer) {
      contextData.farmer_context = {
        language: farmer.language,
        experience_level: farmer.metadata?.experience_level,
        farming_type: farmer.metadata?.farming_type
      };
    }

    // Calculate success metrics (placeholder - can be enhanced with real data)
    const successMetrics = {
      feedback_score: message.feedback_rating,
      has_detailed_feedback: !!message.feedback_text,
      response_time_ms: message.metadata?.response_time_ms,
      tokens_used: message.metadata?.tokens_used,
      section_tags: message.metadata?.section_tags || [],
      marked_as_training: new Date().toISOString()
    };

    // Store in training context table
    const { error: trainingError } = await supabase
      .from('ai_training_context')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        message_id: messageId,
        context_type: landId ? 'land_specific' : 'general',
        context_data: contextData,
        success_metrics: successMetrics,
        is_validated: false, // Requires manual review before training
        created_at: new Date().toISOString()
      });

    if (trainingError) {
      console.error('Error storing training context:', trainingError);
      return new Response(
        JSON.stringify({ error: 'Failed to store training context', details: trainingError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Training data collected successfully for message:', messageId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Training data collected successfully',
        messageId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in training data collection:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to collect training data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}