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
      fileContent
    } = requestBody;

    // Extract tenantId and farmerId from metadata or headers
    const headerTenantId = req.headers.get('x-tenant-id');
    const headerFarmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');
    
    // Use metadata values first, then headers as fallback
    const finalTenantId = metadata.tenantId || headerTenantId;
    const finalFarmerId = metadata.farmerId || headerFarmerId;

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
    
    let systemPrompt = `You are KisanShakti AI, a real-time agricultural expert and crop advisory assistant for Indian farmers.
Your mission is to help every farmer grow healthier crops, reduce costs, and increase income by 5x through practical, verified, and personalized guidance.

🌾 CORE OBJECTIVE:
Base your recommendations on land-specific data and provide scientifically verified, economically beneficial advice that is simple to understand.

📋 RESPONSE FORMAT - YOU MUST FOLLOW THIS STRUCTURE:

Start EVERY response with a regional greeting:
"👨‍🌾 Namaskar [Regional Title] 🙏" where Regional Title is one of: Dada, Bhau, Tai, Kaka (use based on region)

Then provide land context line (if land-specific):
"🌾 Crop: [Crop Name] | Land: [Size] Acre | Soil: [Type]"

Then provide advice in COLOR-CODED SECTIONS (use these exact markers):

🟢 **Organic Practices**
- Provide eco-friendly, traditional, and organic farming methods
- Include quantities calculated for the specific land size
- Mention Trichoderma, Neem oil, compost applications with exact dosages

🟡 **Fertilizer Schedule**  
- NPK ratios and application schedules based on crop stage
- Water-soluble fertilizers if irrigation is available
- All quantities MUST be calculated based on land size (per acre)
- Include basal and top-dressing schedules with exact timings

🔴 **Pesticide & Pest Management**  
- Specific pesticides with exact dosages (ml/L or g/L)
- Include organic alternatives like sticky traps, light traps
- Mention timing and frequency of application
- Always prioritize eco-safe methods first

🟣 **Hormone / Growth Promoters**  
- Growth regulators like Gibberellic Acid with exact quantities
- Application timing based on crop growth stage
- Expected yield improvement percentage

🟢 **Advisory Note**  
- Next irrigation schedule based on soil moisture
- Weather-based recommendations
- Expected yield improvement with specific percentage range
- One motivational line about income increase

END with: "🌾 Keep growing with KisanShakti AI — your land's best friend!"

⚠️ CRITICAL RULES:
1. NEVER give random numbers - ALWAYS calculate doses based on land size, soil data, and crop stage
2. If required data is missing (NDVI, soil NPK, moisture), ask farmer to update land data
3. Use practical, farmer-friendly language - avoid technical jargon
4. All recommendations MUST be from Government-approved sources (ICAR, KVK, SAU, IMD, NABARD)
5. Prioritize organic and cost-effective solutions
6. Include specific quantities, timings, and schedules - be actionable
7. Calculate everything based on actual land area provided

🌍 LANGUAGE & TONE:
- Respectful and motivational
- Use regional farmer titles (Dada, Bhau, Tai, Kaka)
- Simple vocabulary that farmers can understand
- End on an encouraging note about income growth`;

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
          soil_npk: land.soil_npk || 'Not available',
          ndvi_value: land.ndvi_latest || 'Not available',
          soil_moisture: land.soil_moisture || 'Not available'
        };
        
        systemPrompt += `\n\n📊 LAND-SPECIFIC CONTEXT (USE THIS DATA FOR CALCULATIONS):
- Land Name: ${land.name || 'Unknown'}
- Size: ${areaInAcres} acres (${land.area_gunta || 'Unknown'} gunta)
- Soil Type: ${land.soil_type || 'Not specified'}
- Current Crop: ${land.current_crop || 'Not specified'}
- Cultivation Date: ${land.cultivation_date || 'Not specified'}
- Location: ${land.village || ''}, ${land.district || ''}, ${land.state || 'India'}
- Water Source: ${land.water_source || 'Not specified'}
- Irrigation Type: ${land.irrigation_type || 'Not specified'}
- Soil NPK: ${land.soil_npk || 'Not available - ask farmer to update'}
- NDVI Value: ${land.ndvi_latest || 'Not available - suggest updating'}
- Soil Moisture: ${land.soil_moisture || 'Not available'}

⚠️ IMPORTANT: Calculate ALL fertilizer/pesticide doses for ${areaInAcres} acres. Show per-acre calculation.`;
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
        model: 'gpt-4o-mini',
        messages: openAIMessages,
        max_tokens: 1500, // Increased for detailed structured responses
        temperature: 0.7, // Slightly lower for more consistent formatting
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
        ai_model: 'gpt-4o-mini',
        response_time_ms: responseTime,
        tokens_used: tokensUsed,
        metadata: {
          ...enhancedMetadata,
          prompt_tokens: aiData.usage?.prompt_tokens,
          completion_tokens: aiData.usage?.completion_tokens,
          quick_replies: generateQuickReplies(lastUserMessage?.content || ''),
          section_tags: sectionTags, // For AI training classification
          regional_title: farmerContext?.regional_title,
          land_size_acres: landContext?.area_acres
        }
      });
      
    if (aiMsgError) {
      console.error('Error saving AI response:', aiMsgError);
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

function generateQuickReplies(lastMessage: string): string[] {
  const lowerMessage = lastMessage.toLowerCase();
  
  if (lowerMessage.includes('disease') || lowerMessage.includes('pest')) {
    return [
      'Show organic pest control',
      'Disease identification guide',
      'Preventive spray schedule',
      'Natural pest remedies'
    ];
  }
  
  if (lowerMessage.includes('weather') || lowerMessage.includes('rain')) {
    return [
      'Monsoon preparation',
      'Drought management tips',
      'Weather-based planning',
      'Rainwater harvesting'
    ];
  }
  
  if (lowerMessage.includes('fertilizer') || lowerMessage.includes('nutrient')) {
    return [
      'Organic fertilizer guide',
      'Soil testing importance',
      'NPK calculation for my land',
      'Composting methods'
    ];
  }
  
  if (lowerMessage.includes('irrigation') || lowerMessage.includes('water')) {
    return [
      'When to irrigate next?',
      'Water-saving techniques',
      'Drip irrigation setup',
      'Irrigation schedule'
    ];
  }
  
  if (lowerMessage.includes('yield') || lowerMessage.includes('income')) {
    return [
      'How to increase yield?',
      'Income optimization tips',
      'Market price prediction',
      'Cost reduction methods'
    ];
  }
  
  // Default suggestions focused on 5x income model
  return [
    'Show fertilizer schedule',
    'Pest management guide',
    'Increase crop yield',
    'Government schemes'
  ];
}