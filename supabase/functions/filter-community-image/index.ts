import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, messageId } = await req.json();
    
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Image URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OpenAI API key not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use GPT-4 Vision to analyze the image
    console.log('Analyzing image for agricultural content:', imageUrl);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an agricultural content moderator. Analyze images and determine if they are related to agriculture, farming, crops, livestock, agricultural machinery, or rural life. 
            
            Respond with a JSON object containing:
            - "isAgricultural": boolean (true if related to agriculture)
            - "confidence": number (0-100)
            - "category": string (type of agricultural content or "non-agricultural")
            - "description": string (brief description of what you see)
            - "reason": string (why it is or isn't agricultural)
            
            Be lenient - accept images of:
            - Crops, plants, seeds, vegetables, fruits
            - Farm animals, livestock
            - Agricultural machinery, tools
            - Farmland, fields, orchards
            - Farmers, agricultural workers
            - Rural landscapes, farms
            - Agricultural products, harvest
            - Weather conditions affecting farming
            - Pests, diseases affecting crops
            - Irrigation, water resources`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Is this image related to agriculture or farming? Analyze and respond with the JSON format specified.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return new Response(
        JSON.stringify({ error: 'Failed to analyze image' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const analysisText = data.choices[0].message.content;
    
    // Parse the JSON response
    let analysis;
    try {
      // Clean the response in case it has markdown formatting
      const cleanedText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      // Default to accepting the image if parsing fails
      analysis = {
        isAgricultural: true,
        confidence: 50,
        category: 'uncertain',
        description: 'Could not analyze image properly',
        reason: 'Analysis inconclusive, accepting by default'
      };
    }

    // Update message metadata with AI analysis if messageId provided
    if (messageId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('community_messages')
          .update({
            is_ai_filtered: true,
            metadata: {
              ai_analysis: analysis,
              filtered_at: new Date().toISOString()
            }
          })
          .eq('id', messageId);
      }
    }

    console.log('Image analysis complete:', analysis);

    return new Response(
      JSON.stringify({
        allowed: analysis.isAgricultural,
        analysis
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error in filter-community-image function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});