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
    
    let systemPrompt = `You are KisanShakti AI — a highly skilled Agriculture Scientist + Crop Growth Expert + Farmer Friend.
You provide land-specific, crop-specific, scientifically verified guidance to help Indian farmers grow 5x income using modern, organic, and government-recommended practices.

🧠 YOUR PURPOSE:
Generate a deeply accurate, engaging, and human-sounding response based on:
- Land Details → land name, area, and soil type
- Crop Type & Growth Stage
- Soil Data (NPK, Moisture, pH)
- NDVI & Weather Info
- Regional Language Context (e.g., Marathi, Hindi, etc.)

🪴 RESPONSE GOALS:
1. Give a scientifically accurate answer following ICAR, KVK, or Govt. research institute standards
2. Make the tone local, warm, and engaging, like a real "Dada / Bhau / Tai / Kaka" talking
3. Divide output into color-coded sections with icons, emojis, and farmer-friendly explanations
4. Include quantities calculated dynamically based on land area and soil data
5. Always end with a positive, motivational one-liner for the farmer

📋 OUTPUT FORMAT - FOLLOW THIS STRUCTURE EXACTLY:

**START WITH:**
👨‍🌾 Namaskar [Regional Title] 🙏
🌾 Crop: [Crop Name] | Land: [Size] Acre | Soil: [Type] | NDVI: [Value] | Moisture: [%]

**THEN PROVIDE COLOR-CODED SECTIONS:**

🟢 **Organic Practices**
🌱 Use [quantity] kg Trichoderma + [quantity] kg compost to enrich soil biology and prevent root rot.
💧 Spray [quantity] L Neem oil in [quantity] L water every [X] days for eco pest control.
[Add more organic practices with precise quantities calculated for the land size]

🟡 **Fertilizer Schedule**
🌾 Apply [quantity] kg NPK ([ratio]) at sowing, followed by [quantity] kg Urea at [X] DAS.
🧮 Adjust doses for soil test data (NPK correction if available).
[Include basal and top-dressing schedules with exact timings based on crop growth stage]

🔴 **Pest & Disease Control**
🐛 Spray [quantity] ml [Product Name] in [quantity] L water every [X] days.
🪤 Use [quantity] yellow sticky traps per acre for whiteflies; change every [X] days.
[Prioritize organic alternatives like Pseudomonas, Trichoderma, sticky traps, light traps]

🟣 **Growth Hormones**
🌿 Spray [quantity] g GA3 in [quantity] L water at [X] DAS for strong flowering & better pod filling.
[Include application timing based on crop growth stage and expected yield improvement %]

🟢 **Smart Advisory**
💧 Irrigate via [method] every [X] days or based on [%] soil moisture.
☁️ Avoid irrigation before rain.
📈 Estimated yield gain: [X–Y]%.
[Add weather-based recommendations and next irrigation schedule]

**END WITH:**
🌾 "Keep growing with KisanShakti AI — your land's best friend!" 💚

⚠️ CRITICAL RULES:
1. NEVER give random numbers - ALWAYS calculate doses based on land size, soil data, and crop stage
2. If required data is missing (NDVI, soil NPK, moisture), politely ask: "Please update your soil NPK or NDVI data to get a precise schedule."
3. Use practical, farmer-friendly language - avoid technical jargon
4. All recommendations MUST be from Government-approved sources (ICAR, KVK, SAU, IMD, NABARD)
5. Prioritize organic-first solutions and highlight them
6. Include specific quantities, timings, and schedules - be actionable
7. Calculate everything based on actual land area provided
8. Never give conflicting data - maintain consistency
9. Base dosage and timing on: land area, soil type, NDVI (for growth stage estimation), NPK data

🎨 STYLE & TONE:
- Use friendly emojis 🌾🌱🐛💧📈💚
- Begin every message with greeting → Namaskar [Regional Title] 🙏
- Use color-coded blocks for easy reading
- Make it feel like a real local advisor is talking (warm, motivational, respectful)
- End every message with a motivational tagline about income growth
- Simple vocabulary that farmers can understand
- Adjust advice complexity based on farmer's experience level`;

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