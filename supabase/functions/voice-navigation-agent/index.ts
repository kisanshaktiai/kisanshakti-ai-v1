import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';
import { rateGuard } from '../_shared/rateGuard.ts';


interface VoiceRequest {
  transcript: string;
  language: string;
  context?: {
    currentRoute?: string;
    landId?: string;
    sessionId?: string;
  };
}

interface AIResponse {
  matched: boolean;
  intent?: string;
  route?: string;
  action?: string;
  suggestions: string[];
  response: string;
  confidence: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Sprint 5: cost-control rate limit (intent classification per farmer).
  const rl = await rateGuard(req, { endpoint: 'voice-navigation-agent', maxRequests: 60, windowMs: 60_000 });
  if (rl) return rl;



  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Missing tenant ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { transcript, language, context }: VoiceRequest = await req.json();

    console.log(`[Voice Agent] Processing: "${transcript}" in ${language}`);

    // Load intents from database
    const { data: intents, error: intentsError } = await supabase
      .from('voice_navigation_intents')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('language_code', language)
      .eq('is_active', true);

    if (intentsError) {
      console.error('Error loading intents:', intentsError);
      throw intentsError;
    }

    // Try fuzzy matching first
    const normalizedTranscript = transcript.toLowerCase().trim();
    let bestMatch: any = null;
    let highestScore = 0;

    for (const intent of intents || []) {
      const patterns = intent.patterns as string[];
      for (const pattern of patterns) {
        const score = calculateSimilarity(normalizedTranscript, pattern.toLowerCase());
        if (score > highestScore) {
          highestScore = score;
          bestMatch = intent;
        }
      }
    }

    // If good match found (>70%), return it
    if (bestMatch && highestScore > 0.7) {
      const responseTemplate = bestMatch.response_template as Record<string, string>;
      return new Response(
        JSON.stringify({
          matched: true,
          intent: bestMatch.intent_id,
          route: bestMatch.route,
          action: bestMatch.action,
          suggestions: [],
          response: responseTemplate[language] || responseTemplate['en'] || 'Opening...',
          confidence: highestScore,
        } as AIResponse),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // AI Fallback: Use OpenAI to understand natural language
    console.log('[Voice Agent] Using OpenAI fallback for:', transcript);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ 
          matched: false,
          error: 'AI service not configured',
          response: getErrorMessage(language),
          suggestions: getSuggestions(language),
          confidence: 0
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optimized prompt - shorter to save tokens
    const aiPrompt = `User said in ${language}: "${transcript}"

App routes:
/app - Home
/app/lands - Lands (add:/app/lands/add)
/app/weather - Weather
/app/schedule - Schedule
/app/chat - AI Chat
/app/market - Market
/app/profile - Profile
/app/social - Community
/app/analytics - Analytics
/app/soil-health - Soil Health
/app/ndvi - NDVI Analysis
/app/schemes - Government Schemes
/app/advisory - Advisory

Match intent and return JSON:
{"intent":"navigate.X","route":"/app/X","suggestions":["p1","p2","p3"],"response":"msg in ${language}"}`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: aiPrompt }
        ],
        max_tokens: 150,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            matched: false,
            error: 'Rate limit exceeded',
            response: getErrorMessage(language),
            suggestions: getSuggestions(language),
            confidence: 0
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402 || aiResponse.status === 401) {
        return new Response(
          JSON.stringify({ 
            matched: false,
            error: 'API authentication/billing error',
            response: getErrorMessage(language),
            suggestions: getSuggestions(language),
            confidence: 0
          }),
          { status: aiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;
    
    // Parse AI response
    let aiResult: any;
    try {
      aiResult = JSON.parse(aiContent);
    } catch {
      // If AI didn't return valid JSON, provide fallback
      aiResult = {
        intent: 'unknown',
        route: null,
        suggestions: getSuggestions(language),
        response: getErrorMessage(language),
      };
    }

    // Log error correction for learning
    if (farmerId && context?.sessionId) {
      await supabase.from('voice_error_corrections').insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        session_id: context.sessionId,
        original_transcript: transcript,
        intended_action: aiResult.intent,
        suggested_phrases: aiResult.suggestions,
        language_code: language,
      });
    }

    return new Response(
      JSON.stringify({
        matched: !!aiResult.route,
        intent: aiResult.intent,
        route: aiResult.route,
        action: 'navigate',
        suggestions: aiResult.suggestions || [],
        response: aiResult.response,
        confidence: 0.5,
      } as AIResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Voice Agent] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        matched: false,
        suggestions: ['Try again', 'प्रयास करें', 'மீண்டும் முயற்சி செய்யவும்'],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Levenshtein distance for fuzzy matching
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function getSuggestions(language: string): string[] {
  const suggestions: Record<string, string[]> = {
    'hi': ['घर दिखाओ', 'मेरी ज़मीन', 'मौसम बताओ'],
    'en': ['Show home', 'My lands', 'Show weather'],
    'ta': ['முகப்பு காட்டு', 'எனது நிலங்கள்', 'வானிலை காட்டு'],
    'mr': ['घर दाखवा', 'माझी जमीन', 'हवामान दाखवा'],
    'pa': ['ਘਰ ਦਿਖਾਓ', 'ਮੇਰੀ ਜ਼ਮੀਨ', 'ਮੌਸਮ ਦੱਸੋ'],
  };
  return suggestions[language] || suggestions['en'];
}

function getErrorMessage(language: string): string {
  const messages: Record<string, string> = {
    'hi': 'मुझे समझ नहीं आया। कृपया इनमें से कुछ कहें:',
    'en': 'I did not understand. Please try saying:',
    'ta': 'எனக்கு புரியவில்லை. தயவுசெய்து இவற்றில் ஒன்றைச் சொல்லுங்கள்:',
    'mr': 'मला समजले नाही. कृपया यापैकी काहीतरी सांगा:',
    'pa': 'ਮੈਨੂੰ ਸਮਝ ਨਹੀਂ ਆਈ। ਕਿਰਪਾ ਕਰਕੇ ਇਹਨਾਂ ਵਿੱਚੋਂ ਕੁਝ ਕਹੋ:',
  };
  return messages[language] || messages['en'];
}
