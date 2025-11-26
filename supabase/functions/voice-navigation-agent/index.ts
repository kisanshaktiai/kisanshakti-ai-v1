import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

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

    // AI Fallback: Use Lovable AI to understand natural language
    console.log('[Voice Agent] Using AI fallback for:', transcript);

    const aiPrompt = `
You are a voice navigation assistant for a farming app in ${language} language.
The user said: "${transcript}"
Current context: ${JSON.stringify(context || {})}

Available features in the app:
- Home (घर): Dashboard with overview
- Lands (ज़मीन): View and manage farm lands
- Weather (मौसम): Weather forecast and farming insights  
- Schedule (कार्यक्रम): Crop schedules and tasks
- AI Chat (AI बातचीत): Ask farming questions
- Market (बाज़ार): Buy/sell farming products
- Profile (प्रोफाइल): User profile and settings
- Analytics (विश्लेषण): Farm analytics and reports
- Soil Health (मिट्टी स्वास्थ्य): Soil test results

Your task:
1. Identify what the user wants to do
2. Suggest the closest matching feature
3. Provide 3 example phrases they could say in ${language}
4. Respond in ${language} language

Return JSON:
{
  "intent": "navigate.feature_name",
  "route": "/app/route",
  "suggestions": ["phrase1", "phrase2", "phrase3"],
  "response": "helpful message in ${language}"
}
`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful voice assistant for rural Indian farmers.' },
          { role: 'user', content: aiPrompt }
        ],
        temperature: 0.3,
      }),
    });

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
