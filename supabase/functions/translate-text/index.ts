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

    const sourceLangName = LANGUAGE_NAMES[sourceLanguage] || sourceLanguage;
    const targetLangName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    // Provider failures (credits, rate limits) degrade to the original text
    // with HTTP 200 so the screen never breaks; `degraded` tells the client why.
    const safe = async (t: string): Promise<{ text: string; err?: APIError }> => {
      try {
        return { text: await translateSingle(t, sourceLangName, targetLangName) };
      } catch (e) {
        const err = e instanceof APIError ? e : new APIError(String(e), 500);
        console.error('Translation error:', err.status, err.message);
        return { text: t, err };
      }
    };

    if (batch && texts && Array.isArray(texts)) {
      const results = await Promise.all(texts.map((t: string) => safe(t)));
      const failed = results.find((r) => r.err)?.err;
      return new Response(
        JSON.stringify({
          translations: results.map((r) => r.text),
          ...(failed ? { degraded: true, reason: failed.status } : {}),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const r = await safe(text);
    return new Response(
      JSON.stringify({
        translatedText: r.text,
        ...(r.err ? { degraded: true, reason: r.err.status } : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Translation request error:', error);
    const status = error instanceof APIError ? error.status : 400;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function callProvider(
  url: string, apiKey: string, model: string, prompt: string,
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Provider ${model} error:`, response.status, errorText.slice(0, 300));
    // OpenAI reports exhausted credits as 429 insufficient_quota — treat as billing (402).
    const isQuota = /insufficient_quota|credit_balance_exhausted/.test(errorText);
    throw new APIError(`Translation API error: ${response.status}`, isQuota ? 402 : response.status);
  }
  const data = await response.json();
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new APIError('No translation received', 500);
  return out;
}

async function translateSingle(
  text: string,
  sourceLang: string,
  targetLang: string,
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

  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  let lastErr: APIError = new APIError('No translation provider configured', 500);

  if (lovableKey) {
    try {
      return await callProvider('https://ai.gateway.lovable.dev/v1/chat/completions', lovableKey, 'openai/gpt-6-astra', prompt);
    } catch (e) { lastErr = e as APIError; }
  }
  if (openaiKey) {
    try {
      return await callProvider('https://api.openai.com/v1/chat/completions', openaiKey, 'gpt-4o-mini', prompt);
    } catch (e) { lastErr = e as APIError; }
  }
  throw lastErr;
}
