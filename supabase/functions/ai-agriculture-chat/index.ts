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
    
    const requestBody = await req.json();
    const { 
      messages = [], 
      landId, 
      sessionId,
      imageUrl,
      language = 'en',
      tenantId,
      farmerId,
      fileContent
    } = requestBody;

    // Get request headers for farmer context (fallback)
    const headerTenantId = req.headers.get('x-tenant-id');
    const headerFarmerId = req.headers.get('x-farmer-id');
    const sessionToken = req.headers.get('x-session-token');
    
    // Use body values first, then headers as fallback
    const finalTenantId = tenantId || headerTenantId;
    const finalFarmerId = farmerId || headerFarmerId;
    
    if (!finalTenantId || !finalFarmerId) {
      console.error('Missing context:', { tenantId: finalTenantId, farmerId: finalFarmerId, requestBody });
      throw new Error('Missing tenant or farmer context');
    }

    console.log('AI Chat Request:', { tenantId: finalTenantId, farmerId: finalFarmerId, landId, sessionId, language });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Set app session for RLS (if we have session token)
    if (sessionToken) {
      await supabase.rpc('set_app_session', {
        p_tenant_id: finalTenantId,
        p_farmer_id: finalFarmerId,
        p_session_token: sessionToken
      });
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
    let systemPrompt = `You are an expert agricultural advisor providing personalized farming advice in simple, natural language.
    
INSTRUCTIONS:
1. Provide advice specific to Indian farmers
2. Use simple, practical language that farmers can easily understand
3. Consider local climate, soil conditions, and seasonal patterns
4. Give actionable recommendations with specific timings and quantities
5. Include traditional wisdom along with modern techniques
6. Be culturally sensitive and consider local farming practices
7. If discussing pesticides or fertilizers, mention organic alternatives
8. Provide cost-effective solutions suitable for small farmers`;

    if (landId) {
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .eq('tenant_id', finalTenantId)
        .single();

      if (land) {
        landContext = {
          name: land.name,
          size: land.size,
          soil_type: land.soil_type,
          location: land.location
        };
        
        systemPrompt += `\n\nLAND DETAILS:
- Land Name: ${land.name || 'Unknown'}
- Size: ${land.size || 'Unknown'} acres
- Soil Type: ${land.soil_type || 'Not specified'}
- Location: ${land.location || 'Not specified'}`;
      }
    }

    // Get farmer context
    const { data: farmer } = await supabase
      .from('farmers')
      .select('name, district, state, total_land_size')
      .eq('id', finalFarmerId)
      .eq('tenant_id', finalTenantId)
      .single();

    if (farmer) {
      systemPrompt += `\n\nFARMER CONTEXT:
- Name: ${farmer.name || 'Farmer'}
- Location: ${farmer.district || 'Unknown'}, ${farmer.state || 'India'}
- Total Land: ${farmer.total_land_size || 'Unknown'} acres`;
    }

    // Prepare messages for OpenAI - simple format
    const openAIMessages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    for (const msg of messages) {
      openAIMessages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // Call OpenAI API
    const openAIKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Calling OpenAI API...');

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
      const { error: userMsgError } = await supabase
        .from('ai_chat_messages')
        .insert({
          session_id: currentSessionId,
          tenant_id: finalTenantId,
          farmer_id: finalFarmerId,
          role: 'user',
          content: lastUserMessage.content,
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
          metadata: enhancedMetadata
        });
        
      if (userMsgError) {
        console.error('Error saving user message:', userMsgError);
      }
    }

    // Save AI response with enhanced metadata for training
    const { error: aiMsgError } = await supabase
      .from('ai_chat_messages')
      .insert({
        session_id: currentSessionId,
        tenant_id: finalTenantId,
        farmer_id: finalFarmerId,
        role: 'assistant',
        content: aiMessage,
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
        ai_model: 'gpt-4o-mini',
        response_time_ms: responseTime,
        tokens_used: tokensUsed,
        metadata: {
          ...enhancedMetadata,
          prompt_tokens: aiData.usage?.prompt_tokens,
          completion_tokens: aiData.usage?.completion_tokens,
          quick_replies: generateQuickReplies(lastUserMessage?.content || '')
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
        message: aiMessage, 
        sessionId: currentSessionId,
        quickReplies,
        responseTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in AI chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage
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

function generateQuickReplies(lastMessage: string): string[] {
  const lowerMessage = lastMessage.toLowerCase();
  
  if (lowerMessage.includes('disease') || lowerMessage.includes('pest')) {
    return [
      'Organic pest control methods',
      'How to identify crop diseases?',
      'Preventive measures for pests',
      'Natural remedies'
    ];
  }
  
  if (lowerMessage.includes('weather') || lowerMessage.includes('rain')) {
    return [
      'Monsoon preparation tips',
      'Drought management strategies',
      'Weather-based crop planning',
      'Rain water harvesting'
    ];
  }
  
  if (lowerMessage.includes('fertilizer') || lowerMessage.includes('nutrient')) {
    return [
      'Organic fertilizer options',
      'Soil testing importance',
      'NPK ratio explained',
      'Composting methods'
    ];
  }
  
  // Default suggestions
  return [
    'Crop rotation benefits',
    'Government schemes for farmers',
    'Modern farming techniques',
    'Organic farming basics'
  ];
}