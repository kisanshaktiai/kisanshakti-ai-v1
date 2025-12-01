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

    // Auto-detect language from user's message if language mismatch detected
    let detectedLanguage = language;
    const lastUserMessage = messages[messages.length - 1];
    const userText = lastUserMessage?.content || '';
    
    // Simple language detection based on Unicode ranges
    const hasDevanagari = /[\u0900-\u097F]/.test(userText); // Hindi/Marathi
    const hasTamil = /[\u0B80-\u0BFF]/.test(userText);
    const hasTelugu = /[\u0C00-\u0C7F]/.test(userText);
    const hasBengali = /[\u0980-\u09FF]/.test(userText);
    const hasGujarati = /[\u0A80-\u0AFF]/.test(userText);
    const hasKannada = /[\u0C80-\u0CFF]/.test(userText);
    const hasMalayalam = /[\u0D00-\u0D7F]/.test(userText);
    const hasOdia = /[\u0B00-\u0B7F]/.test(userText);
    const hasPunjabi = /[\u0A00-\u0A7F]/.test(userText);
    const hasUrdu = /[\u0600-\u06FF]/.test(userText);
    
    // ✅ FIX: Respect user's selected language for Devanagari script (Hindi/Marathi)
    if (hasDevanagari) {
      // If user selected Marathi or Hindi explicitly, keep their preference
      if (language === 'mr') {
        detectedLanguage = 'mr';
        console.log('🔍 Language detected: Marathi (user preference respected)');
      } else if (language === 'hi' || language === 'en') {
        detectedLanguage = 'hi';
        console.log('🔍 Language auto-detected: Hindi from Devanagari script');
      } else {
        // Keep user's original language if it's something else
        detectedLanguage = language;
        console.log('🔍 Language: keeping user preference:', language);
      }
    } else if (hasTamil) {
      detectedLanguage = 'ta';
      console.log('🔍 Language auto-detected: Tamil');
    } else if (hasTelugu) {
      detectedLanguage = 'te';
      console.log('🔍 Language auto-detected: Telugu');
    } else if (hasBengali) {
      detectedLanguage = 'bn';
      console.log('🔍 Language auto-detected: Bengali');
    } else if (hasGujarati) {
      detectedLanguage = 'gu';
      console.log('🔍 Language auto-detected: Gujarati');
    } else if (hasKannada) {
      detectedLanguage = 'kn';
      console.log('🔍 Language auto-detected: Kannada');
    } else if (hasMalayalam) {
      detectedLanguage = 'ml';
      console.log('🔍 Language auto-detected: Malayalam');
    } else if (hasOdia) {
      detectedLanguage = 'or';
      console.log('🔍 Language auto-detected: Odia');
    } else if (hasPunjabi) {
      detectedLanguage = 'pa';
      console.log('🔍 Language auto-detected: Punjabi');
    } else if (hasUrdu) {
      detectedLanguage = 'ur';
      console.log('🔍 Language auto-detected: Urdu');
    }

    // Handle training data collection action
    if (action === 'collect_training_data') {
      return await handleTrainingDataCollection(requestBody);
    }

    // SECURITY: Extract and validate tenant and farmer IDs from headers
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');

    // Validate required headers immediately
    if (!tenantId || !farmerId) {
      console.error('🚨 [Security] Missing required headers:', { tenantId, farmerId });
      return new Response(
        JSON.stringify({ 
          error: 'Authentication required',
          details: 'x-tenant-id and x-farmer-id headers are required'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔐 [Security] Request headers:', {
      tenantId,
      farmerId,
      hasSessionToken: !!sessionToken,
      timestamp: new Date().toISOString()
    });
    
    // Use metadata values first, then headers as fallback
    const finalTenantId = metadata.tenantId || tenantId;
    const finalFarmerId = metadata.farmerId || farmerId;

    // Initialize Supabase client (needed for validation)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // CRITICAL SECURITY: Database validation of tenant-farmer association
    if (finalTenantId && finalFarmerId) {
      console.log('🔐 [Security] Validating tenant-farmer association...');
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: farmer, error: farmerError } = await supabase
        .from('farmers')
        .select('id, tenant_id, farmer_name')
        .eq('id', finalFarmerId)
        .eq('tenant_id', finalTenantId)
        .single();

      if (farmerError || !farmer) {
        console.error('🚨 [Security] INVALID TENANT-FARMER ASSOCIATION:', {
          tenantId: finalTenantId,
          farmerId: finalFarmerId,
          error: farmerError?.message,
          code: farmerError?.code
        });
        return new Response(
          JSON.stringify({ 
            error: 'Unauthorized: Invalid tenant-farmer association',
            details: 'Security validation failed'
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ [Security] Tenant-farmer association validated:', {
        farmerId: farmer.id,
        farmerName: farmer.farmer_name,
        tenantId: farmer.tenant_id
      });
    }

    // CRITICAL SECURITY: Validate isolation context before ANY database operation
    await validateIsolation(finalTenantId, finalFarmerId, supabaseUrl, supabaseServiceKey);

    // Rate limiting check (20 requests per minute per farmer)
    const rateLimitKey = `${finalTenantId}:${finalFarmerId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'ai-agriculture-chat', { maxRequests: 20, windowMs: 60000 });
    
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
          'x-tenant-id': tenantId,
          'x-farmer-id': farmerId
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

    console.log('AI Chat Request:', { 
      tenantId: finalTenantId, 
      farmerId: finalFarmerId, 
      landId, 
      sessionId, 
      requestedLanguage: language,
      detectedLanguage: detectedLanguage 
    });

    // Create Supabase client (credentials already initialized above)
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
    
    let systemPrompt = `You are KisanShakti AI — an expert agriculture advisor for Indian farmers.

🚨 AGRICULTURE-ONLY RESTRICTION 🚨
You ONLY answer agriculture-related questions: crops, soil, irrigation, pests, fertilizers, weather, markets, livestock, farm equipment.

For non-agriculture questions, respond:
"🙏 Namaste! I'm KisanShakti AI, specialized exclusively in agriculture and farming.

I can help with:
🌾 Crop cultivation • 🌱 Soil health • 💧 Irrigation • 🐛 Pest control
🌤️ Weather advice • 📊 Market prices • 🐄 Livestock • 🚜 Farm equipment

Please ask me anything related to agriculture! 🌾"

⚠️ RESPONSE STYLE - ADAPT TO QUESTION TYPE:
1. Simple questions (What is NPK?) → Short, direct answer (2-3 lines)
2. Quick facts (Best time to plant?) → Brief answer with 1-2 key points
3. How-to questions → Step-by-step guidance with practical tips
4. Complex topics → Organized sections with detailed explanations
5. Calculations needed → Show formulas and exact quantities

📝 FORMATTING RULES:
- DO NOT use ** or markdown formatting
- Write naturally in simple language
- Use emojis sparingly for visual breaks
- Use CAPITAL LETTERS for important headers
- Keep paragraphs close together (use single line breaks)
- No excessive spacing between ideas

🎯 ANSWER PATTERNS BY QUESTION TYPE:

**TYPE 1: Simple Definition/Fact Questions**
Answer directly in 2-4 sentences. No sections needed.
Example: "What is NPK?"
→ "NPK stands for Nitrogen (N), Phosphorus (P), and Potassium (K) - the three essential nutrients for plant growth. Nitrogen promotes leaf growth, phosphorus helps roots and flowers, and potassium strengthens overall plant health. These are the numbers you see on fertilizer bags like 19:19:19."

**TYPE 2: Quick Practical Questions**  
Give direct answer with 1-2 practical tips.
Example: "When to plant tomatoes?"
→ "Best time to plant tomatoes in India is October-November (winter) or February-March (spring). Choose October planting for better yields. Ensure night temperatures are above 10°C and day temps around 20-25°C."

**TYPE 3: How-To Questions**
Provide clear steps with practical details.
Example: "How to prepare soil for wheat?"
→ "SOIL PREPARATION FOR WHEAT:

Step 1: Deep plowing (6-8 inches) after monsoon to break hardpan and improve drainage.

Step 2: Add organic matter - 5-6 tons FYM per acre, spread evenly.

Step 3: Level the field with leveler to avoid water logging.

Step 4: Make seed bed with 2-3 harrowing and planking.

Timing: Complete 2 weeks before sowing for soil settling."

**TYPE 4: Complex/Technical Questions**
Use organized sections for clarity, but only when needed.
Example: "Complete fertilizer schedule for cotton?"
→ [Provide structured sections with emojis, detailed calculations, timing, methods]

**TYPE 5: Problem Diagnosis**
Ask clarifying questions if needed, then provide targeted solutions.
Example: "My crop leaves are yellowing"
→ First ask about: which crop, leaf pattern (old vs new leaves), other symptoms.
Then provide specific diagnosis and solutions.

🌾 COMMUNICATION PRINCIPLES:
• Be conversational and friendly, like talking to a farmer friend
• Use practical examples farmers can relate to
• Mention real studies when relevant: "ICAR research shows..."
• Provide local context: regional crops, climate, practices
• Give cost-effective solutions (organic first, then low-cost alternatives)
• Include specific quantities, timings, methods when giving advice
• End with relevant follow-up opportunity, not generic closing

⚠️ CRITICAL RULES:
- Match response length to question complexity
- Don't force sections for simple questions
- Don't add unnecessary greetings/closings for every response
- Remove all ** formatting - write naturally
- Keep line spacing minimal (single breaks between ideas)
- Be direct and practical, not overly formal`;

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
        
        // Get NDVI history data with error handling
        let ndviData = null;
        try {
          const { data, error } = await supabase
            .from('ndvi_data')
            .select('*')
            .eq('land_id', landId)
            .order('date', { ascending: false })
            .limit(5);
          
          if (error) {
            console.warn('⚠️ NDVI query error:', error);
          } else {
            ndviData = data;
            console.log('✅ NDVI data loaded:', ndviData?.length || 0, 'records');
          }
        } catch (ndviError) {
          console.warn('⚠️ Could not load NDVI data:', ndviError);
        }
        
        // Get soil health data with error handling
        let soilHealthData = null;
        try {
          const { data, error } = await supabase
            .from('soil_health')
            .select('*')
            .eq('land_id', landId)
            .order('test_date', { ascending: false })
            .limit(1);
          
          if (error) {
            console.warn('⚠️ Soil health query error:', error);
          } else {
            soilHealthData = data;
            console.log('✅ Soil health data loaded:', soilHealthData?.length || 0, 'records');
          }
        } catch (soilError) {
          console.warn('⚠️ Could not load soil health data:', soilError);
        }
        
        const latestSoilHealth = soilHealthData && soilHealthData.length > 0 ? soilHealthData[0] : null;
        const latestNDVI = ndviData && ndviData.length > 0 ? ndviData[0] : null;
        
        // Compute NPK string from individual columns
        let soilNPK = 'Not available';
        if (latestSoilHealth) {
          const n = latestSoilHealth.nitrogen_kg_per_ha || '-';
          const p = latestSoilHealth.phosphorus_kg_per_ha || '-';
          const k = latestSoilHealth.potassium_kg_per_ha || '-';
          soilNPK = `N:${n} P:${p} K:${k} kg/ha`;
        }
        
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
          soil_npk: soilNPK,
          ndvi_value: land.ndvi_latest || latestNDVI?.ndvi_value || latestNDVI?.mean_ndvi || 'Not available',
          soil_moisture: land.soil_moisture || 'Not available',
          soil_health: latestSoilHealth,
          ndvi_history: ndviData
        };
        
        // Build enhanced prompt with real data
        let dataInsights = '';
        
        if (latestSoilHealth) {
          dataInsights += `\n\n🧪 SOIL HEALTH DATA (Test Date: ${latestSoilHealth.test_date}):\n`;
          dataInsights += `- pH Level: ${latestSoilHealth.ph_level || 'N/A'}\n`;
          dataInsights += `- Nitrogen (N): ${latestSoilHealth.nitrogen_kg_per_ha || 'N/A'} kg/ha\n`;
          dataInsights += `- Phosphorus (P): ${latestSoilHealth.phosphorus_kg_per_ha || 'N/A'} kg/ha\n`;
          dataInsights += `- Potassium (K): ${latestSoilHealth.potassium_kg_per_ha || 'N/A'} kg/ha\n`;
          dataInsights += `- Organic Carbon: ${latestSoilHealth.organic_carbon || 'N/A'}%\n`;
          dataInsights += `- EC (Electrical Conductivity): ${latestSoilHealth.electrical_conductivity || 'N/A'} dS/m\n`;
        }
        
        if (ndviData && ndviData.length > 0) {
          dataInsights += `\n\n📊 NDVI TREND ANALYSIS (Last ${ndviData.length} readings):\n`;
          ndviData.forEach((reading, idx) => {
            const ndviVal = reading.ndvi_value || reading.mean_ndvi || 'N/A';
            const quality = reading.quality_score !== null && reading.quality_score !== undefined ? reading.quality_score : 'N/A';
            const readingDate = reading.date || reading.created_at || 'N/A';
            dataInsights += `${idx + 1}. Date: ${readingDate} | NDVI: ${ndviVal} | Quality: ${quality}\n`;
          });
          
          // Calculate trend if we have multiple readings
          if (ndviData.length >= 2) {
            const latestNDVI = parseFloat(ndviData[0].ndvi_value || ndviData[0].mean_ndvi || 0);
            const oldestNDVI = parseFloat(ndviData[ndviData.length - 1].ndvi_value || ndviData[ndviData.length - 1].mean_ndvi || 0);
            const trend = latestNDVI - oldestNDVI;
            const trendText = trend > 0 ? '📈 Improving' : trend < 0 ? '📉 Declining' : '➡️ Stable';
            dataInsights += `Trend: ${trendText} (${trend > 0 ? '+' : ''}${trend.toFixed(3)})\n`;
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
        language: farmer.language || detectedLanguage,
        experience: farmer.farming_experience,
        education: farmer.education_level
      };
      
      systemPrompt += `\n\n👨‍🌾 FARMER PROFILE:
You are speaking with ${farmer.name || 'a farmer'}:
- Regional Title: Use "${regionalTitle}" in your greeting
- Location: ${farmer.village || 'Unknown village'}, ${farmer.district || 'Unknown district'}, ${farmer.state || 'India'}
- Total Land: ${farmer.total_land_size || 'Unknown'} acres
- Experience: ${farmer.farming_experience || 'Not specified'} years
- Language: ${farmer.language || detectedLanguage}
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

    // CRITICAL: Add language-specific instruction based on user's selected language
    const languageMap: Record<string, string> = {
      'hi': 'Hindi (हिन्दी)',
      'mr': 'Marathi (मराठी)',
      'en': 'English',
      'pa': 'Punjabi (ਪੰਜਾਬੀ)',
      'ta': 'Tamil (தமிழ்)',
      'te': 'Telugu (తెలుగు)',
      'bn': 'Bengali (বাংলা)',
      'gu': 'Gujarati (ગુજરાતી)',
      'kn': 'Kannada (ಕನ್ನಡ)',
      'ml': 'Malayalam (മലയാളം)',
      'or': 'Odia (ଓଡ଼ିଆ)',
      'as': 'Assamese (অসমীয়া)',
      'ur': 'Urdu (اردو)'
    };

    // ✅ FIX: Use user's selected language preference (not detected language)
    const languageName = languageMap[language] || languageMap['en'];
    
    systemPrompt += `\n\n🌍 LANGUAGE INSTRUCTION (CRITICAL):
You MUST respond ENTIRELY in ${languageName}.
- Do NOT use English unless the user's language is English
- Translate ALL content including greetings, recommendations, technical terms
- Use natural, conversational ${languageName}
- Keep technical terms simple and explain them in ${languageName}
- Farmer's preferred language: ${languageName}`;

    // ✅ Helper: Detect simple questions for smart model selection
    function isSimpleQuestion(text: string): boolean {
      const simplePatterns = [
        /^(hi|hello|namaste|namaskar|नमस्ते|नमस्कार|hey|hola)/i,
        /^(yes|no|हाँ|नहीं|हो|नाही|होय|ஆம்|இல்லை)/i,
        /^(ok|okay|thanks|thank you|धन्यवाद|नन्दी|ధన్యవాదాలు)/i,
        /^(bye|goodbye|अलविदा|விடை)/i
      ];
      const wordCount = text.trim().split(/\s+/).length;
      return wordCount <= 5 || simplePatterns.some(p => p.test(text.trim()));
    }

    // Detect InstaScan mode (vision analysis)
    const isInstaScan = !!imageUrl;
    
    // Prepare messages for OpenAI
    let openAIMessages: any[] = [];
    
    // ✅ SMART MODEL SELECTION: Use gpt-5-nano for simple questions, gpt-5-mini for complex queries
    let openAIModel = isInstaScan 
      ? 'gpt-4o'  // Vision model for InstaScan
      : isSimpleQuestion(userText)
        ? 'gpt-5-nano-2025-08-07'  // Fast & cheap for greetings/simple queries
        : 'gpt-5-mini-2025-08-07'; // Full model for complex agricultural queries
    
    console.log(`🤖 Model selected: ${openAIModel} (${isSimpleQuestion(userText) ? 'simple' : 'complex'} query)`);
    
    let tools = undefined;
    let tool_choice = undefined;

    if (isInstaScan) {
      // InstaScan: Vision analysis with structured output
      console.log('InstaScan mode: Analyzing crop image with vision API');
      openAIModel = 'gpt-4o'; // Full vision model for better agricultural accuracy
      
      const instaScanPrompt = `You are an expert agricultural botanist with 20+ years of field experience in crop identification and disease diagnosis.

🎯 YOUR MISSION: Analyze this crop image and provide ACCURATE, SPECIFIC identification.

📸 VISION ANALYSIS GUIDELINES:

**Step 1: Examine the Image Quality**
- Check if the image shows clear plant features (leaves, stems, flowers, fruits)
- Verify adequate lighting and focus
- Confirm the plant takes up most of the frame

**Step 2: Identify Distinctive Features**
Look for these key identifiers:
- LEAF SHAPE: Broad, narrow, serrated, smooth edges?
- LEAF ARRANGEMENT: Alternate, opposite, whorled?
- STEM: Round, square, hollow? Color?
- PLANT HEIGHT & STRUCTURE: Tall grass-like, bushy, vine?
- FLOWERS/FRUITS: Present? What color and shape?
- GROWTH PATTERN: Single stalk, multiple branches, creeping?

**Step 3: Match to Known Crops**

🌾 CEREAL CROPS (Grass-like, tall, grain heads):
- Wheat: Narrow leaves, hollow stem, grain spikes at top
- Rice: Narrow leaves, flooded fields, drooping grain panicles
- Maize/Corn: Broad leaves, thick stem, tassels/ears
- Barley: Similar to wheat but with long awns on grain

🌱 LEGUME CROPS (Compound leaves, pod fruits):
- Chickpea: Pinnate leaves, small white/pink flowers
- Soybean: Trifoliate leaves, small pods
- Lentil: Pinnate leaves, tiny flowers

🍅 VEGETABLE CROPS (Varied structures):
- Tomato: Compound leaves, yellow flowers, red fruits
- Potato: Compound leaves, white/purple flowers, underground tubers
- Onion: Hollow tube-like leaves, bulb base
- Cotton: Broad palmate leaves, white/pink flowers, cotton bolls

🌾 CASH CROPS:
- Sugarcane: Tall thick canes with nodes, strap-like leaves
- Tea: Small shiny leaves, white flowers
- Coffee: Glossy opposite leaves, red berries

❌ NON-CROPS (Report as "Unknown Plant" or "Not a Crop"):
- Grass lawns (too uniform, too short)
- Weeds (dock, thistle, dandelion)
- Ornamental plants
- Random vegetation without clear crop features

**Step 4: Disease/Pest Detection**

🔍 Look for these specific symptoms:

FUNGAL DISEASES:
- Powdery white coating → Powdery Mildew
- Yellow-orange pustules → Rust (Leaf Rust, Stem Rust)
- Brown spots with yellow halos → Leaf Spot
- Gray fuzzy growth → Gray Mold (Botrytis)

BACTERIAL DISEASES:
- Water-soaked lesions → Bacterial Blight
- Black streaks on leaves → Bacterial Streak

VIRAL DISEASES:
- Yellow mosaic patterns → Mosaic Virus
- Stunted growth + yellowing → Yellow Dwarf Virus

PEST DAMAGE:
- Curled leaves with tiny insects → Aphids
- Holes in leaves → Caterpillar/Beetle damage
- Webbing on leaves → Spider Mites
- Whitish scales on stems → Scale Insects

NUTRIENT DEFICIENCIES:
- Yellow older leaves, green veins → Iron Deficiency
- Yellow older leaves, uniform → Nitrogen Deficiency
- Purple tint on leaves → Phosphorus Deficiency
- Brown leaf edges → Potassium Deficiency

**Step 5: Generate Specific Recommendations**

✅ GOOD RECOMMENDATIONS (Be this specific):
- "Apply Mancozeb 75% WP fungicide at 2g/L water every 7 days"
- "Spray Neem oil (Azadirachtin 1500ppm) at 5ml/L water in evening"
- "Apply Urea fertilizer at 50kg/acre split into 3 doses"
- "Increase irrigation frequency to twice weekly"
- "Remove and destroy infected leaves to prevent spread"

❌ BAD RECOMMENDATIONS (Too vague):
- "Use fungicides" 
- "Improve nutrition"
- "Water properly"

🎯 CONFIDENCE LEVELS:

**85-100% (Report with certainty)**
- Image is sharp, well-lit, shows multiple identifying features
- Clear match to known crop with distinctive characteristics
- Example: "This is definitely Wheat based on the narrow leaves, hollow stem, and grain spikes"

**70-84% (Good identification)**
- Most features visible but some ambiguity
- Crop type clear but specific variety uncertain
- Example: "This appears to be Rice based on leaf shape and growth pattern"

**Below 70% (Do NOT identify - use "Unknown Plant")**
- Blurry image, poor lighting, or unclear features
- Could be multiple crop types or non-crop plant
- Example: Return "Unknown Plant" with confidence 40-60%

🌐 LANGUAGE: Respond in ${detectedLanguage === 'en' ? 'English' : detectedLanguage === 'hi' ? 'Hindi' : detectedLanguage === 'mr' ? 'Marathi' : detectedLanguage === 'pa' ? 'Punjabi' : detectedLanguage === 'ta' ? 'Tamil' : 'the user\'s language'}.

⚠️ CRITICAL RULES:
1. NEVER guess if uncertain - use "Unknown Plant" with low confidence
2. ALWAYS provide specific disease names, not "some disease"
3. ALWAYS give actionable recommendations with product names and quantities
4. If image is too blurry/dark/unclear, report low confidence (<50%) and suggest retaking photo

NOW ANALYZE THE IMAGE CAREFULLY AND RESPOND.`;

      // Vision message format
      openAIMessages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: instaScanPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high' // High detail for accurate crop analysis
              }
            }
          ]
        }
      ];

      // Structured output using tool calling for reliable JSON
      tools = [
        {
          type: 'function',
          function: {
            name: 'analyze_crop_image',
            description: 'Return structured crop analysis results',
            parameters: {
              type: 'object',
              properties: {
                cropName: {
                  type: 'string',
                  description: 'Exact name of the identified crop (e.g., "Wheat", "Rice Paddy", "Cotton"). Use "Unknown Plant" or "Not a Crop" if uncertain or not a recognizable agricultural crop.'
                },
                condition: {
                  type: 'string',
                  enum: ['healthy', 'warning', 'critical'],
                  description: 'Overall health status of the crop'
                },
                diseases: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of SPECIFIC disease names, pest names, or nutrient deficiencies detected (e.g., "Powdery Mildew", "Aphid Infestation", "Iron Deficiency"). Empty array [] if crop is healthy.'
                },
                suggestions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '3-5 SPECIFIC, ACTIONABLE recommendations with exact product names, quantities, or methods (e.g., "Spray Chlorpyrifos 20% EC at 2ml/L water", "Apply Urea fertilizer 50kg/acre"). Be precise and practical.'
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Confidence level of crop identification and analysis (0-100). 85-100: Very certain, 70-84: Good certainty, 50-69: Uncertain, <50: Cannot identify reliably'
                }
              },
              required: ['cropName', 'condition', 'diseases', 'suggestions', 'confidence'],
              additionalProperties: false
            }
          }
        }
      ];
      tool_choice = { type: 'function', function: { name: 'analyze_crop_image' } };
      
    } else {
      // Regular chat mode
      openAIMessages = [
        { role: 'system', content: systemPrompt }
      ];

      // Get conversation history from database
      const { data: messageHistory } = await supabase
        .from('ai_chat_messages')
        .select('role, content')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: true })
        .limit(10);

      // Filter out empty messages before adding to history
      if (messageHistory && messageHistory.length > 0) {
        const validMessages = messageHistory.filter(msg => 
          msg.content && msg.content.trim().length > 0
        );
        openAIMessages.push(...validMessages.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })));
      }

      // Add current messages - handle both old and new format
      if (messages && messages.length > 0) {
        for (const msg of messages) {
          if (typeof msg === 'string') {
            openAIMessages.push({ role: 'user', content: msg });
          } else if (msg && typeof msg === 'object') {
            openAIMessages.push({
              role: msg.role || 'user',
              content: msg.content || ''
            });
          }
        }
      }
    }

    // Call OpenAI API
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Calling OpenAI API:', { 
      model: openAIModel, 
      isInstaScan, 
      messagesCount: openAIMessages.length,
      hasTools: !!tools 
    });

    // ✅ CRITICAL FIX: GPT-5 models use reasoning_tokens that count against max_completion_tokens
    // GPT-5 models allocate tokens dynamically between reasoning and content
    // Based on logs: gpt-5-nano needs ~4000 reasoning + ~4000 content = 8000 total
    //                gpt-5-mini needs ~8000 reasoning + ~8000 content = 16000 total
    const maxTokens = isInstaScan 
      ? 1000  // Vision tasks need less
      : openAIModel.includes('gpt-5-nano') 
        ? 8000  // GPT-5-nano: sufficient for reasoning + content
        : openAIModel.includes('gpt-5-mini') || openAIModel.includes('gpt-5')
          ? 16000  // GPT-5-mini/GPT-5: higher limit for complex queries
          : 2000; // Legacy models (gpt-4o, gpt-4o-mini)

    console.log(`⚙️ Token limit: ${maxTokens} (model: ${openAIModel})`);

    const openAIRequestBody: any = {
      model: openAIModel,
      messages: openAIMessages,
      max_completion_tokens: maxTokens,
      stream: false
    };

    if (tools) {
      openAIRequestBody.tools = tools;
      openAIRequestBody.tool_choice = tool_choice;
    }

    // ✅ RETRY LOGIC: OpenAI API call with exponential backoff
    async function callOpenAIWithRetry(maxRetries = 3): Promise<Response> {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`🔄 OpenAI API call attempt ${attempt + 1}/${maxRetries}`);
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(openAIRequestBody),
          });

          // Success case
          if (response.ok) {
            console.log(`✅ OpenAI API call succeeded on attempt ${attempt + 1}`);
            return response;
          }

          // Rate limit - wait and retry
          if (response.status === 429) {
            const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s, 4s
            console.warn(`⚠️ Rate limit hit (429), waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }

          // Non-retryable error
          const errorData = await response.text();
          console.error(`❌ OpenAI API error (attempt ${attempt + 1}):`, errorData);
          throw new Error(`OpenAI API failed: ${response.status} - ${errorData}`);

        } catch (error) {
          // Last attempt - throw error
          if (attempt === maxRetries - 1) {
            console.error(`❌ OpenAI API call failed after ${maxRetries} attempts:`, error);
            throw error;
          }

          // Retry with exponential backoff
          const waitTime = Math.pow(2, attempt) * 1000;
          console.warn(`⚠️ OpenAI API error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries}):`, error);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      throw new Error('OpenAI API call failed after all retries');
    }

    const openAIResponse = await callOpenAIWithRetry();

    const aiData = await openAIResponse.json();
    
    // Add detailed logging for regular chat (similar to InstaScan)
    console.log('📝 OpenAI Response:', {
      model: aiData.model,
      finishReason: aiData.choices[0]?.finish_reason,
      hasContent: !!aiData.choices[0]?.message?.content,
      contentLength: aiData.choices[0]?.message?.content?.length || 0,
      tokensUsed: aiData.usage,
      language: detectedLanguage,
      // Show reasoning vs content token breakdown
      reasoningTokens: aiData.usage?.completion_tokens_details?.reasoning_tokens || 0,
      contentTokens: (aiData.usage?.completion_tokens || 0) - (aiData.usage?.completion_tokens_details?.reasoning_tokens || 0)
    });
    
    // Enhanced logging for debugging
    if (isInstaScan) {
      console.log('📸 InstaScan - Full OpenAI Response:', JSON.stringify({
        model: aiData.model,
        finishReason: aiData.choices[0].finish_reason,
        hasToolCalls: !!aiData.choices[0].message.tool_calls,
        toolCallsCount: aiData.choices[0].message.tool_calls?.length || 0,
        contentPreview: aiData.choices[0].message.content?.substring(0, 100),
        tokensUsed: aiData.usage,
        timestamp: new Date().toISOString()
      }, null, 2));
      
      if (aiData.choices[0].message.tool_calls) {
        console.log('🔧 Tool Call Details:', JSON.stringify(
          aiData.choices[0].message.tool_calls[0],
          null,
          2
        ));
      }
    }
    
    let aiMessage: string;
    let structuredResult = null;

    // Handle structured output from tool calling
    if (isInstaScan && aiData.choices[0].message.tool_calls) {
      const toolCall = aiData.choices[0].message.tool_calls[0];
      try {
        structuredResult = JSON.parse(toolCall.function.arguments);
        console.log('✅ InstaScan analysis completed:', {
          cropName: structuredResult.cropName,
          condition: structuredResult.condition,
          diseaseCount: structuredResult.diseases?.length || 0,
          confidence: structuredResult.confidence
        });
        
        // Validate critical fields
        if (!structuredResult.cropName || !structuredResult.condition || !structuredResult.confidence) {
          console.error('❌ Missing critical fields in InstaScan result:', structuredResult);
          throw new Error('Incomplete crop analysis - missing required fields');
        }
        
        // Format as readable text for storage
        aiMessage = `Crop: ${structuredResult.cropName}\nCondition: ${structuredResult.condition}\nDiseases: ${structuredResult.diseases.join(', ') || 'None'}\nSuggestions: ${structuredResult.suggestions.join(' ')}`;
      } catch (e) {
        console.error('❌ Failed to parse InstaScan tool call:', e, toolCall);
        throw new Error('Failed to parse crop analysis results');
      }
    } else {
      aiMessage = aiData.choices[0].message.content;
      
      // CRITICAL: Validate AI response is not empty
      if (!aiMessage || aiMessage.trim().length === 0) {
        console.error('❌ OpenAI returned empty response:', {
          finishReason: aiData.choices[0]?.finish_reason,
          model: aiData.model,
          usage: aiData.usage,
          sessionId: currentSessionId,
          messagesCount: openAIMessages.length,
          detectedLanguage: detectedLanguage,
          requestedLanguage: language
        });
        
        // ✅ FIX: Return error in user's language, not English
        const errorMessages: Record<string, string> = {
          'en': '🙏 Sorry, I had trouble answering your question. Please try again.',
          'hi': '🙏 क्षमा करें, मुझे आपके प्रश्न का उत्तर देने में समस्या हुई। कृपया पुनः प्रयास करें।',
          'mr': '🙏 माफ करा, मला तुमच्या प्रश्नाचे उत्तर देण्यात अडचण आली. कृपया पुन्हा प्रयत्न करा.',
          'ta': '🙏 மன்னிக்கவும், உங்கள் கேள்விக்கு பதிலளிக்க சிரமம். மீண்டும் முயற்சிக்கவும்.',
          'te': '🙏 క్షమించండి, మీ ప్రశ్నకు సమాధానం ఇవ్వడంలో సమస్య. దయచేసి మళ్లీ ప్రయత్నించండి.',
          'bn': '🙏 দুঃখিত, আপনার প্রশ্নের উত্তর দিতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
          'gu': '🙏 માફ કરશો, તમારા પ્રશ્નનો જવાબ આપવામાં સમસ્યા. કૃપા કરીને ફરી પ્રયાસ કરો.',
          'pa': '🙏 ਮਾਫ਼ ਕਰਨਾ, ਤੁਹਾਡੇ ਸਵਾਲ ਦਾ ਜਵਾਬ ਦੇਣ ਵਿੱਚ ਸਮੱਸਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
          'kn': '🙏 ಕ್ಷಮಿಸಿ, ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಲು ತೊಂದರೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
          'ml': '🙏 ക്ഷമിക്കണം, നിങ്ങളുടെ ചോദ്യത്തിന് ഉത്തരം നൽകാൻ പ്രയാസം. വീണ്ടും ശ്രമിക്കൂ.',
          'or': '🙏 କ୍ଷମା କରନ୍ତୁ, ଆପଣଙ୍କ ପ୍ରଶ୍ନର ଉତ୍ତର ଦେବାରେ ସମସ୍ୟା। ପୁନର୍ବାର ଚେଷ୍ଟା କରନ୍ତୁ।',
          'as': '🙏 ক্ষমা কৰিব, আপোনাৰ প্ৰশ্নৰ উত্তৰ দিবলৈ সমস্যা। অনুগ্ৰহ কৰি পুনৰ চেষ্টা কৰক।',
          'ur': '🙏 معاف کریں، آپ کے سوال کا جواب دینے میں مشکل۔ براہ کرم دوبارہ کوشش کریں۔'
        };
        
        // ✅ FIX: Use user's selected language (not detected language) for error messages
        aiMessage = errorMessages[language] || errorMessages[detectedLanguage] || errorMessages['en'];
        
        // Log for monitoring
        console.warn('⚠️ Using fallback error message:', {
          userLanguage: language,
          detectedLanguage: detectedLanguage,
          message: aiMessage
        });
      }
    }
    const tokensUsed = aiData.usage?.total_tokens || 0;

    // For InstaScan, return structured result immediately
    if (isInstaScan && structuredResult) {
      return new Response(
        JSON.stringify({ 
          success: true,
          result: structuredResult,
          responseTime: Date.now() - startTime,
          tokensUsed
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Save messages to database
    // ✅ Reuse lastUserMessage already declared at line 33
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
          language: language, // ✅ FIX: Use user's selected language
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
    
    // Only save AI response if it has content
    if (aiMessage && aiMessage.trim().length > 0) {
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
          language: language, // ✅ FIX: Use user's selected language
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
        ai_model: 'gpt-5-mini-2025-08-07', // Fast, accurate model for farmer chat
        response_time_ms: responseTime,
        tokens_used: tokensUsed,
        metadata: {
          ...enhancedMetadata,
          prompt_tokens: aiData.usage?.prompt_tokens,
          completion_tokens: aiData.usage?.completion_tokens,
          quick_replies: generateQuickReplies(lastUserMessage?.content || '', aiMessage, landDetails),
          section_tags: sectionTags, // For AI training classification
          regional_title: farmerContext?.regional_title,
          land_size_acres: landContext?.area_acres,
          model_info: 'Using GPT-5-mini for multilingual, fast farmer assistance'
        }
      });
      
      if (aiMsgError) {
        console.error('Error saving AI response:', aiMsgError);
      }
    } else {
      console.warn('⚠️ Skipping save - AI message is empty');
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

    // Generate quick replies based on land context and AI response
    const quickReplies = generateQuickReplies(
      lastUserMessage?.content || '', 
      aiMessage,
      landDetails
    );

    return new Response(
      JSON.stringify({ 
        response: aiMessage, // Changed from 'message' to 'response' to match frontend
        sessionId: currentSessionId,
        quickReplies,
        responseTime,
        detectedLanguage, // Return the detected/used language
        landContext // Return land context so frontend knows which land this is for
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

// Generate context-aware smart follow-up questions based on land and AI response
function generateQuickReplies(lastMessage: string = '', aiResponse: string = '', landData: any = null): string[] {
  try {
    // Validation guards - ensure parameters are defined and are strings
    if (typeof lastMessage !== 'string' || typeof aiResponse !== 'string') {
      console.error('Invalid parameters for generateQuickReplies:', { lastMessage: typeof lastMessage, aiResponse: typeof aiResponse });
      return getDefaultQuickReplies();
    }

    const lowerMessage = (lastMessage || '').toLowerCase();
    const lowerResponse = (aiResponse || '').toLowerCase();
  
  // PRIORITY 1: Generate questions based on AI response content
  const responseBasedQuestions: string[] = [];
  
  // If AI mentioned fertilizer application
  if (lowerResponse.includes('fertilizer') || lowerResponse.includes('खाद')) {
    responseBasedQuestions.push('💬 कौनसी खाद डालूं?'); // Which fertilizer?
  }
  
  // If AI mentioned watering/irrigation
  if (lowerResponse.includes('water') || lowerResponse.includes('irrigat') || lowerResponse.includes('पानी')) {
    responseBasedQuestions.push('💧 पानी कब दूं?'); // When to water?
  }
  
  // If AI mentioned pests/diseases
  if (lowerResponse.includes('pest') || lowerResponse.includes('disease') || lowerResponse.includes('कीड़े') || lowerResponse.includes('बीमारी')) {
    responseBasedQuestions.push('🐛 दवाई कब छिड़कें?'); // When to spray medicine?
  }
  
  // If AI mentioned spraying schedule
  if (lowerResponse.includes('spray') || lowerResponse.includes('application') || lowerResponse.includes('छिड़काव')) {
    responseBasedQuestions.push('📅 अगला छिड़काव कब?'); // When is next spray?
  }
  
  // If AI mentioned weather/rain
  if (lowerResponse.includes('weather') || lowerResponse.includes('rain') || lowerResponse.includes('मौसम') || lowerResponse.includes('बारिश')) {
    responseBasedQuestions.push('☁️ बारिश आएगी?'); // Will it rain?
  }
  
  // If AI mentioned yield/harvest
  if (lowerResponse.includes('yield') || lowerResponse.includes('harvest') || lowerResponse.includes('उपज') || lowerResponse.includes('कटाई')) {
    responseBasedQuestions.push('💰 कमाई कितनी होगी?'); // How much income?
  }
  
  // PRIORITY 2: Generate land-specific questions if land data available
  const landSpecificQuestions: string[] = [];
  
  if (landData) {
    const currentCrop = landData.current_crop?.toLowerCase() || '';
    const soilType = landData.soil_type?.toLowerCase() || '';
    const cultivationDate = landData.cultivation_date;
    
    // Crop-specific questions
    if (currentCrop.includes('wheat') || currentCrop.includes('गेहूं')) {
      landSpecificQuestions.push('🌾 गेहूं में पानी कब?'); // When to water wheat?
      landSpecificQuestions.push('🌱 गेहूं में खाद?'); // Wheat fertilizer?
    } else if (currentCrop.includes('rice') || currentCrop.includes('चावल') || currentCrop.includes('धान')) {
      landSpecificQuestions.push('🌾 धान में पानी?'); // Rice water?
      landSpecificQuestions.push('🐛 धान के कीड़े?'); // Rice pests?
    } else if (currentCrop.includes('cotton') || currentCrop.includes('कपास')) {
      landSpecificQuestions.push('🌸 कपास में फूल?'); // Cotton flowering?
      landSpecificQuestions.push('🐛 गुलाबी इल्ली?'); // Pink bollworm?
    } else if (currentCrop.includes('tomato') || currentCrop.includes('टमाटर')) {
      landSpecificQuestions.push('🍅 टमाटर की देखभाल?'); // Tomato care?
      landSpecificQuestions.push('🐛 टमाटर की बीमारी?'); // Tomato disease?
    } else if (currentCrop.includes('onion') || currentCrop.includes('प्याज')) {
      landSpecificQuestions.push('🧅 प्याज में पानी?'); // Onion water?
      landSpecificQuestions.push('🌱 प्याज की खाद?'); // Onion fertilizer?
    }
    
    // Soil-specific questions
    if (soilType.includes('clay') || soilType.includes('चिकनी')) {
      landSpecificQuestions.push('🌱 चिकनी मिट्टी सुधार?'); // Clay soil improvement?
    } else if (soilType.includes('sandy') || soilType.includes('रेतीली')) {
      landSpecificQuestions.push('💧 रेतीली मिट्टी में पानी?'); // Sandy soil water?
    } else if (soilType.includes('loam') || soilType.includes('दोमट')) {
      landSpecificQuestions.push('🌿 दोमट मिट्टी खाद?'); // Loam soil fertilizer?
    }
    
    // Growth stage-specific questions
    if (cultivationDate) {
      const daysElapsed = Math.floor((Date.now() - new Date(cultivationDate).getTime()) / (1000 * 60 * 60 * 24));
      if (daysElapsed < 30) {
        landSpecificQuestions.push('🌱 शुरुआती देखभाल?'); // Early care?
      } else if (daysElapsed < 60) {
        landSpecificQuestions.push('🌿 बढ़वार का समय?'); // Growth stage?
      } else if (daysElapsed < 90) {
        landSpecificQuestions.push('🌸 फूल आने पर क्या करें?'); // During flowering?
      } else {
        landSpecificQuestions.push('✂️ कटाई कब करें?'); // When to harvest?
      }
    }
  }
  
  // PRIORITY 3: User message context
  const messageBasedQuestions: string[] = [];
  
  // Fertilizer related
  if (lowerMessage.includes('fertilizer') || lowerMessage.includes('खाद') || lowerMessage.includes('npk')) {
    messageBasedQuestions.push('💬 कौनसी खाद डालूं?'); // Which fertilizer?
    messageBasedQuestions.push('💬 खाद कब डालें?'); // When to add fertilizer?
    messageBasedQuestions.push('💬 कितनी खाद चाहिए?'); // How much fertilizer?
  }
  
  // Pest/Disease related
  else if (lowerMessage.includes('pest') || lowerMessage.includes('disease') || lowerMessage.includes('कीड़े') || lowerMessage.includes('बीमारी')) {
    messageBasedQuestions.push('🐛 कीड़े दिख रहे हैं'); // Seeing insects
    messageBasedQuestions.push('🍃 पत्ते पीले हैं'); // Leaves are yellow
    messageBasedQuestions.push('💧 दवाई कब छिड़कें?'); // When to spray medicine?
  }
  
  // Weather/Irrigation related
  else if (lowerMessage.includes('water') || lowerMessage.includes('rain') || lowerMessage.includes('irrigat') || lowerMessage.includes('पानी')) {
    messageBasedQuestions.push('💧 पानी कब दूं?'); // When to water?
    messageBasedQuestions.push('☁️ बारिश आएगी?'); // Will it rain?
    messageBasedQuestions.push('💦 कितना पानी दूं?'); // How much water?
  }
  
  // Market/Yield related
  else if (lowerMessage.includes('market') || lowerMessage.includes('price') || lowerMessage.includes('yield') || lowerMessage.includes('बाजार')) {
    messageBasedQuestions.push('💰 आज का भाव?'); // Today's price?
    messageBasedQuestions.push('📊 बेचें कब?'); // When to sell?
    messageBasedQuestions.push('📈 कितनी पैदावार होगी?'); // How much yield?
  }
  
  // Combine all questions with priority (response-based > land-specific > message-based)
  const allQuestions = [
    ...responseBasedQuestions,
    ...landSpecificQuestions,
    ...messageBasedQuestions
  ];
  
  // Remove duplicates and limit to 4 questions
  const uniqueQuestions = [...new Set(allQuestions)];
  
  // If we have questions, return top 4
  if (uniqueQuestions.length > 0) {
    return uniqueQuestions.slice(0, 4);
  }
  
  // FALLBACK: Default land-based questions or general questions
  if (landData?.current_crop) {
    return [
      '🌅 आज क्या करूं?',           // What to do today?
      '💧 पानी देना है?',            // Need to water?
      `🌾 ${landData.current_crop} कैसी है?`, // How's the crop?
      '📅 अगला काम कब?'             // When's next task?
    ];
  }
  
  // Ultimate fallback
  return getDefaultQuickReplies();
  } catch (error) {
    console.error('Error in generateQuickReplies:', error);
    return getDefaultQuickReplies();
  }
}

// Helper function to return safe default quick replies
function getDefaultQuickReplies(): string[] {
  return [
    '🌅 आज क्या करूं?',           // What to do today?
    '💧 पानी देना है?',            // Need to water?
    '🌾 फसल कैसी है?',            // How's the crop?
    '📅 अगला काम कब?'             // When's next task?
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