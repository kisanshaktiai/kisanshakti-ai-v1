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

    // Initialize Supabase client (needed for validation)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    // Detect InstaScan mode (vision analysis)
    const isInstaScan = !!imageUrl;
    
    // Prepare messages for OpenAI
    let openAIMessages: any[] = [];
    let openAIModel = 'gpt-5-mini-2025-08-07'; // Default model
    let tools = undefined;
    let tool_choice = undefined;

    if (isInstaScan) {
      // InstaScan: Vision analysis with structured output
      console.log('InstaScan mode: Analyzing crop image with vision API');
      openAIModel = 'gpt-4o-mini'; // Vision-capable model
      
      const instaScanPrompt = `You are an expert agricultural AI assistant specializing in crop health analysis. Analyze the provided crop image and identify:

1. CROP TYPE: What crop is in the image? (wheat, rice, cotton, sugarcane, maize, tomato, etc.)
2. HEALTH STATUS: Is the crop healthy, needs attention, or in critical condition?
3. DISEASES/PESTS: Any visible diseases, pests, nutrient deficiencies, or damage?
4. ACTIONABLE SUGGESTIONS: Provide 3-5 specific, practical recommendations for the farmer

Be specific, accurate, and provide actionable advice. If you cannot identify the crop clearly, say "Unknown Crop" and ask for a clearer image.

Language: Respond in ${language === 'en' ? 'English' : language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : language === 'pa' ? 'Punjabi' : language === 'ta' ? 'Tamil' : 'English'}.`;

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
                  description: 'Name of the identified crop (e.g., "Wheat", "Rice", "Unknown Crop")'
                },
                condition: {
                  type: 'string',
                  enum: ['healthy', 'warning', 'critical'],
                  description: 'Overall health status of the crop'
                },
                diseases: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of detected diseases, pests, or issues. Empty array if none detected.'
                },
                suggestions: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '3-5 actionable recommendations for the farmer'
                },
                confidence: {
                  type: 'number',
                  minimum: 0,
                  maximum: 100,
                  description: 'Confidence level of the analysis (0-100)'
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

    const requestBody: any = {
      model: openAIModel,
      messages: openAIMessages,
      max_completion_tokens: isInstaScan ? 1000 : 2000,
      stream: false
    };

    if (tools) {
      requestBody.tools = tools;
      requestBody.tool_choice = tool_choice;
    }

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!openAIResponse.ok) {
      const errorData = await openAIResponse.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API failed: ${openAIResponse.status} - ${errorData}`);
    }

    const aiData = await openAIResponse.json();
    
    let aiMessage: string;
    let structuredResult = null;

    // Handle structured output from tool calling
    if (isInstaScan && aiData.choices[0].message.tool_calls) {
      const toolCall = aiData.choices[0].message.tool_calls[0];
      try {
        structuredResult = JSON.parse(toolCall.function.arguments);
        console.log('Structured InstaScan result:', structuredResult);
        // Format as readable text for storage
        aiMessage = `Crop: ${structuredResult.cropName}\nCondition: ${structuredResult.condition}\nDiseases: ${structuredResult.diseases.join(', ') || 'None'}\nSuggestions: ${structuredResult.suggestions.join(' ')}`;
      } catch (e) {
        console.error('Failed to parse tool call:', e);
        throw new Error('Failed to parse crop analysis results');
      }
    } else {
      aiMessage = aiData.choices[0].message.content;
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