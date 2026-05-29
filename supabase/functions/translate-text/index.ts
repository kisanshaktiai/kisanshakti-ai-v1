import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { rateGuard } from '../_shared/rateGuard.ts';


// Language code mapping
const LANGUAGE_NAMES: Record<string, string> = {
  'hi': 'Hindi',
  'en': 'English',
  'mr': 'Marathi',
  'ta': 'Tamil',
  'te': 'Telugu',
  'kn': 'Kannada',
  'ml': 'Malayalam',
  'gu': 'Gujarati',
  'bn': 'Bengali',
  'pa': 'Punjabi',
  'or': 'Odia',
  'as': 'Assamese',
};

// Custom error class to track HTTP status
class APIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Sprint 5: cost-control rate limit (OpenAI translations).
  const rl = await rateGuard(req, { endpoint: 'translate-text', maxRequests: 60, windowMs: 60_000 });
  if (rl) return rl;


  try {
    const { text, texts, sourceLanguage, targetLanguage, batch } = await req.json();

    // Skip translation if same language
    if (sourceLanguage === targetLanguage) {
      return new Response(
        JSON.stringify(batch ? { translations: texts } : { translatedText: text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new APIError('OPENAI_API_KEY not configured', 500);
    }

    const sourceLangName = LANGUAGE_NAMES[sourceLanguage] || sourceLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    // Handle batch translation
    if (batch && texts && Array.isArray(texts)) {
      const translations = await Promise.all(
        texts.map(async (t: string) => {
          return await translateSingle(t, sourceLangName, targetLangName, OPENAI_API_KEY);
        })
      );

      return new Response(
        JSON.stringify({ translations }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single text translation
    const translatedText = await translateSingle(text, sourceLangName, targetLangName, OPENAI_API_KEY);

    return new Response(
      JSON.stringify({ translatedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Translation error:', error);
    
    // Properly surface 402 and 429 errors
    const status = error instanceof APIError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function translateSingle(
  text: string, 
  sourceLang: string, 
  targetLang: string, 
  apiKey: string
): Promise<string> {
  const prompt = `You are a professional translator specializing in Indian agricultural terminology. Translate the following text from ${sourceLang} to ${targetLang}. 

IMPORTANT RULES:
1. Preserve agricultural and farming terminology accurately
2. Keep the natural, conversational tone
3. Do NOT translate proper nouns, brand names, or technical terms that are commonly used in their original form
4. Keep emojis and formatting intact
5. Only output the translated text, nothing else

Text to translate:
${text}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: prompt }
      ],
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error:', response.status, errorText);
    
    // Pass through rate limit errors
    if (response.status === 429) {
      throw new APIError('Rate limit exceeded. Please try again later.', 429);
    }
    if (response.status === 402 || response.status === 401) {
      throw new APIError('OpenAI API authentication/billing error.', response.status);
    }
    
    throw new APIError(`Translation API error: ${response.status}`, response.status);
  }

  const data = await response.json();
  const translatedText = data.choices?.[0]?.message?.content?.trim();

  if (!translatedText) {
    throw new APIError('No translation received', 500);
  }

  return translatedText;
}
