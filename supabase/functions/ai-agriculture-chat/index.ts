import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// System prompt for agriculture-focused responses
const SYSTEM_PROMPT = `You are a knowledgeable agricultural assistant specifically designed to help Indian farmers. 
Your responses should be:
1. In simple, clear language that rural farmers can easily understand
2. Focused only on agriculture, farming, crops, livestock, and related topics
3. Practical and actionable, considering Indian farming conditions
4. Respectful of traditional farming knowledge while introducing modern techniques
5. Aware of Indian agricultural seasons, crops, and practices
6. Helpful with pest management, soil health, irrigation, and crop selection
7. Able to provide guidance on government schemes, subsidies, and market prices when relevant

If asked about non-agricultural topics, politely redirect the conversation back to farming-related matters.
Always prioritize sustainable and economically viable solutions for small and medium-scale farmers.`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      messages, 
      landId,
      imageUrl,
      quickReply,
      sessionId 
    } = await req.json();

    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    console.log('Processing chat request:', { landId, sessionId, messageCount: messages.length });

    // Prepare messages for OpenAI
    const openAIMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ];

    // If there's an image for crop disease identification
    if (imageUrl) {
      const lastMessage = openAIMessages[openAIMessages.length - 1];
      lastMessage.content = [
        { type: 'text', text: lastMessage.content },
        { type: 'image_url', image_url: { url: imageUrl } }
      ];
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
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    console.log('AI response generated successfully');

    // Generate quick reply suggestions based on context
    const quickReplySuggestions = generateQuickReplies(aiResponse, messages);

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        quickReplies: quickReplySuggestions,
        metadata: {
          model: 'gpt-4o-mini',
          timestamp: new Date().toISOString()
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in ai-agriculture-chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: 'Failed to process chat request'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

function generateQuickReplies(aiResponse: string, messages: any[]): string[] {
  const suggestions: string[] = [];
  
  // Context-based quick replies
  const responseText = aiResponse.toLowerCase();
  const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || '';
  
  // Pest and disease related
  if (responseText.includes('pest') || responseText.includes('disease') || responseText.includes('insect')) {
    suggestions.push('How to prevent this?', 'What organic solutions work?', 'Best pesticide for this?');
  }
  
  // Crop related
  if (responseText.includes('crop') || responseText.includes('plant')) {
    suggestions.push('Best time to sow?', 'Water requirements?', 'Expected yield?');
  }
  
  // Soil related
  if (responseText.includes('soil') || responseText.includes('fertilizer')) {
    suggestions.push('How to test soil?', 'Organic fertilizer options?', 'NPK requirements?');
  }
  
  // Weather related
  if (responseText.includes('weather') || responseText.includes('rain') || responseText.includes('monsoon')) {
    suggestions.push('Irrigation schedule?', 'Drought resistant crops?', 'Rain water harvesting?');
  }
  
  // Market related
  if (responseText.includes('price') || responseText.includes('market') || responseText.includes('sell')) {
    suggestions.push('Current market rates?', 'Best time to sell?', 'Storage tips?');
  }
  
  // Government schemes
  if (responseText.includes('scheme') || responseText.includes('subsidy') || responseText.includes('government')) {
    suggestions.push('How to apply?', 'Required documents?', 'Eligibility criteria?');
  }
  
  // Default suggestions if no specific context
  if (suggestions.length === 0) {
    suggestions.push(
      'Tell me more',
      'What else should I know?',
      'Any precautions?',
      'Alternative methods?'
    );
  }
  
  // Return only top 4 suggestions
  return suggestions.slice(0, 4);
}