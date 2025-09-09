import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  landId?: string;
  imageUrl?: string;
  sessionId?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const requestData: ChatRequest = await req.json();
    const { messages, landId, imageUrl, sessionId } = requestData;

    console.log('Processing chat request:', { 
      messageCount: messages.length, 
      landId, 
      hasImage: !!imageUrl,
      sessionId 
    });

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get land-specific context if landId is provided
    let landContext = '';
    if (landId) {
      const { data: land } = await supabase
        .from('lands')
        .select('*')
        .eq('id', landId)
        .single();

      if (land) {
        landContext = `
        Current land details:
        - Location: ${land.location || 'Not specified'}
        - Crop: ${land.crop_type || 'Not specified'}
        - Size: ${land.size || 'Not specified'} acres
        - Soil Type: ${land.soil_type || 'Not specified'}
        - Irrigation: ${land.irrigation_type || 'Not specified'}
        `;
      }
    }

    // Build system prompt
    const systemPrompt = `You are an expert agricultural AI assistant helping farmers in India. 
    You provide practical, actionable advice on farming, crop management, weather, and agricultural best practices.
    Keep responses concise and relevant to the farmer's needs.
    ${landContext ? `\n${landContext}` : ''}`;

    // Prepare messages for OpenAI
    const openAIMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // If there's an image, add it to the last user message
    if (imageUrl && messages.length > 0) {
      const lastUserMessageIndex = messages.map((m, i) => ({ ...m, index: i }))
        .filter(m => m.role === 'user')
        .pop()?.index;
      
      if (lastUserMessageIndex !== undefined) {
        openAIMessages[lastUserMessageIndex + 1] = {
          role: 'user',
          content: messages[lastUserMessageIndex].content + '\n[User has uploaded an image for analysis]'
        };
      }
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openAIMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;

    console.log('Chat response generated successfully');

    // Generate quick replies based on the context
    const quickReplies = generateQuickReplies(messages[messages.length - 1]?.content || '');

    return new Response(
      JSON.stringify({ 
        message: assistantMessage,
        quickReplies 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in ai-agriculture-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateQuickReplies(lastMessage: string): string[] {
  const lowerMessage = lastMessage.toLowerCase();
  
  if (lowerMessage.includes('weather') || lowerMessage.includes('rain')) {
    return [
      'What about tomorrow?',
      'Best time to spray?',
      'Rainfall prediction?',
      'Temperature trends?'
    ];
  }
  
  if (lowerMessage.includes('pest') || lowerMessage.includes('disease')) {
    return [
      'Organic solutions?',
      'Chemical treatment?',
      'Prevention methods?',
      'Cost-effective options?'
    ];
  }
  
  if (lowerMessage.includes('fertilizer') || lowerMessage.includes('nutrient')) {
    return [
      'Application schedule?',
      'Organic alternatives?',
      'Dosage calculation?',
      'Soil testing needed?'
    ];
  }
  
  if (lowerMessage.includes('market') || lowerMessage.includes('price')) {
    return [
      'Current rates?',
      'Best selling time?',
      'Storage options?',
      'Direct buyer contacts?'
    ];
  }
  
  // Default quick replies
  return [
    'Weather forecast',
    'Pest management',
    'Fertilizer advice',
    'Market prices'
  ];
}