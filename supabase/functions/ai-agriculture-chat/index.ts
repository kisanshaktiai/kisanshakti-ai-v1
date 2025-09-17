import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
    
    // Get request headers for farmer context
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');
    
    if (!tenantId || !farmerId) {
      throw new Error('Missing tenant or farmer context');
    }

    const { 
      messages, 
      landId, 
      sessionId,
      imageUrl,
      language = 'en'
    } = await req.json();

    console.log('AI Chat Request:', { tenantId, farmerId, landId, sessionId, language });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Set app session for RLS
    await supabase.rpc('set_app_session', {
      p_tenant_id: tenantId,
      p_farmer_id: farmerId,
      p_session_token: sessionToken
    });

    // Get or create chat session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('ai_chat_sessions')
        .insert({
          tenant_id: tenantId,
          farmer_id: farmerId,
          land_id: landId,
          session_type: landId ? 'land_specific' : 'general',
          session_title: `Chat - ${new Date().toLocaleDateString()}`,
          metadata: { language }
        })
        .select()
        .single();

      if (sessionError) throw sessionError;
      currentSessionId = newSession.id;
    }

    // Get comprehensive context
    let landContext = null;
    let cropContext = null;
    let weatherContext = null;
    let locationContext = null;
    let agroClimateZone = null;

    if (landId) {
      // Fetch land details
      const { data: land } = await supabase
        .from('lands')
        .select('*, crops(*)')
        .eq('id', landId)
        .eq('tenant_id', tenantId)
        .single();

      if (land) {
        landContext = {
          name: land.name,
          size: land.size,
          soil_type: land.soil_type,
          location: land.location,
          coordinates: land.coordinates
        };

        if (land.crops && land.crops.length > 0) {
          cropContext = land.crops.map((c: any) => ({
            name: c.name,
            variety: c.variety,
            planting_date: c.planting_date,
            expected_harvest: c.expected_harvest,
            status: c.status
          }));
        }

        // Get location context and zone
        if (land.coordinates) {
          locationContext = {
            lat: land.coordinates.lat,
            lng: land.coordinates.lng,
            district: land.district,
            state: land.state
          };

          // Determine agro-climatic zone based on location
          const { data: zone } = await supabase
            .from('agricultural_zones')
            .select('zone_code, zone_name')
            .eq('zone_type', 'icar_agro_climatic')
            .contains('districts', [land.district])
            .single();

          if (zone) {
            agroClimateZone = zone.zone_code;
          }
        }
      }
    }

    // Get farmer context
    const { data: farmer } = await supabase
      .from('farmers')
      .select('name, mobile, language, location, district, state, total_land_size')
      .eq('id', farmerId)
      .eq('tenant_id', tenantId)
      .single();

    // Build system prompt with context
    let systemPrompt = `You are an expert agricultural advisor providing personalized farming advice in simple, natural language.
    
FARMER CONTEXT:
- Name: ${farmer?.name || 'Farmer'}
- Location: ${farmer?.district || 'Unknown'}, ${farmer?.state || 'India'}
- Total Land: ${farmer?.total_land_size || 'Unknown'} acres
- Preferred Language: ${language === 'hi' ? 'Hindi' : language === 'mr' ? 'Marathi' : language === 'pa' ? 'Punjabi' : language === 'ta' ? 'Tamil' : 'English'}
`;

    if (landContext) {
      systemPrompt += `
LAND DETAILS:
- Land Name: ${landContext.name}
- Size: ${landContext.size} acres
- Soil Type: ${landContext.soil_type || 'Not specified'}
- Location: ${landContext.location || 'Not specified'}
`;
    }

    if (cropContext && cropContext.length > 0) {
      systemPrompt += `
CURRENT CROPS:
${cropContext.map((c: any) => `- ${c.name} (${c.variety || 'Local variety'}), planted: ${c.planting_date || 'Unknown'}`).join('\n')}
`;
    }

    if (agroClimateZone) {
      systemPrompt += `
AGRO-CLIMATIC ZONE: ${agroClimateZone}
`;
    }

    systemPrompt += `
INSTRUCTIONS:
1. Provide advice specific to the farmer's location, land, and crops
2. Use simple, practical language that farmers can easily understand
3. Consider local climate, soil conditions, and seasonal patterns
4. Give actionable recommendations with specific timings and quantities
5. Include traditional wisdom along with modern techniques
6. Respond in the farmer's preferred language when possible
7. Be culturally sensitive and consider local farming practices
8. If discussing pesticides or fertilizers, mention organic alternatives
9. Provide cost-effective solutions suitable for small farmers`;

    // Prepare messages for OpenAI
    const openAIMessages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    if (messages && messages.length > 0) {
      messages.forEach((msg: any) => {
        if (msg.imageUrl) {
          openAIMessages.push({
            role: msg.role,
            content: [
              { type: 'text', text: msg.content },
              { type: 'image_url', image_url: { url: msg.imageUrl } }
            ]
          });
        } else {
          openAIMessages.push({
            role: msg.role,
            content: msg.content
          });
        }
      });
    }

    // Add current message with image if provided
    const lastUserMessage = messages[messages.length - 1];
    if (imageUrl && lastUserMessage) {
      openAIMessages[openAIMessages.length - 1] = {
        role: 'user',
        content: [
          { type: 'text', text: lastUserMessage.content },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      };
    }

    // Call OpenAI API
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Calling OpenAI with context:', { landId, hasImage: !!imageUrl });

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using vision-capable model for image support
        messages: openAIMessages,
        max_tokens: 800,
        temperature: 0.7,
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

    // Save user message to database
    const { error: userMsgError } = await supabase
      .from('ai_chat_messages')
      .insert({
        session_id: currentSessionId,
        tenant_id: tenantId,
        farmer_id: farmerId,
        role: 'user',
        content: lastUserMessage.content,
        land_context: landContext,
        crop_context: cropContext,
        weather_context: weatherContext,
        location_context: locationContext,
        agro_climatic_zone: agroClimateZone,
        crop_season: getCropSeason(),
        image_urls: imageUrl ? [imageUrl] : null
      });

    if (userMsgError) {
      console.error('Error saving user message:', userMsgError);
    }

    // Save AI response to database
    const responseTime = Date.now() - startTime;
    const { error: aiMsgError } = await supabase
      .from('ai_chat_messages')
      .insert({
        session_id: currentSessionId,
        tenant_id: tenantId,
        farmer_id: farmerId,
        role: 'assistant',
        content: aiMessage,
        land_context: landContext,
        crop_context: cropContext,
        weather_context: weatherContext,
        location_context: locationContext,
        agro_climatic_zone: agroClimateZone,
        crop_season: getCropSeason(),
        ai_model: 'gpt-4o-mini',
        response_time_ms: responseTime,
        tokens_used: tokensUsed
      });

    if (aiMsgError) {
      console.error('Error saving AI message:', aiMsgError);
    }

    // Update session metadata
    await supabase
      .from('ai_chat_sessions')
      .update({ 
        updated_at: new Date().toISOString(),
        metadata: { 
          language,
          last_land_id: landId,
          message_count: (messages?.length || 0) + 2
        }
      })
      .eq('id', currentSessionId);

    // Generate contextual quick replies
    const quickReplies = generateQuickReplies(lastUserMessage.content, landContext, cropContext);

    return new Response(
      JSON.stringify({ 
        message: aiMessage, 
        sessionId: currentSessionId,
        quickReplies,
        responseTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred processing your request',
        details: error.toString()
      }),
      { 
        status: 500, 
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

function generateQuickReplies(lastMessage: string, landContext: any, cropContext: any): string[] {
  const replies: string[] = [];
  const lowerMessage = lastMessage.toLowerCase();
  
  // Context-aware suggestions
  if (cropContext && cropContext.length > 0) {
    const currentCrop = cropContext[0];
    replies.push(`What fertilizer for ${currentCrop.name}?`);
    replies.push(`${currentCrop.name} disease prevention`);
    replies.push(`Best time to harvest ${currentCrop.name}`);
  }
  
  if (landContext) {
    replies.push(`Soil improvement for ${landContext.soil_type || 'my soil'}`);
    replies.push('Water management tips');
  }
  
  // Topic-based suggestions
  if (lowerMessage.includes('disease') || lowerMessage.includes('pest')) {
    replies.push('Organic pest control methods');
    replies.push('How to identify crop diseases?');
    replies.push('Preventive measures for pests');
  } else if (lowerMessage.includes('weather') || lowerMessage.includes('rain')) {
    replies.push('Monsoon preparation tips');
    replies.push('Drought management strategies');
    replies.push('Weather-based crop planning');
  } else if (lowerMessage.includes('market') || lowerMessage.includes('price')) {
    replies.push('Current market rates');
    replies.push('Best time to sell produce');
    replies.push('Direct marketing options');
  } else if (lowerMessage.includes('fertilizer') || lowerMessage.includes('nutrient')) {
    replies.push('Organic fertilizer options');
    replies.push('Soil testing importance');
    replies.push('NPK ratio explained');
  } else {
    // Default suggestions
    replies.push('Crop rotation benefits');
    replies.push('Government schemes for farmers');
    replies.push('Modern farming techniques');
    replies.push('Organic farming basics');
  }
  
  // Return top 4 suggestions
  return replies.slice(0, 4);
}