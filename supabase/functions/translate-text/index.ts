// CHANGE LOG (newest first)
// 2026-10-04 — optional `purpose: 'farm_advice'` (+ optional `context`: crop, stage,
//   region) for alert and advice text. Those strings are written in English by
//   agronomists and were coming out in textbook register (the crop named by its
//   kitchen word, "drought" for a dry field). The farm-advice prompt asks for the
//   words a farmer in that region uses in the field, short spoken sentences,
//   numbers kept exactly. Requests without `purpose` (Community posts) get the
//   same prompt as before.
// 2026-10-02 — Rebased on the 2026-10-02 branch version (commit eece5418), which added the
//   degrade-to-original-text behaviour: a provider failure returns HTTP 200 with the untranslated
//   text and `degraded: true, reason: <status>` so the Community screen never breaks, and each text
//   in a batch fails on its own. That behaviour is kept. What changes: the model again comes from
//   the AI model registry (task 'farmer.translate') through callAITask instead of the hardcoded
//   'openai/gpt-6-astra' on the Lovable gateway with a hardcoded 'gpt-4o-mini' fallback. Status
//   mapping kept from that version: exhausted credits ⇒ reason 402, rate limit ⇒ 429, other provider
//   HTTP status passed through, no response (timeout/network/no key/no route) ⇒ 500.
// 2026-09-27 — AI model SSOT: translateSingle calls callAITask task 'farmer.translate'; the
//   model comes from ai_task_route_step. A module-level service-role client reads the
//   registry. Request knobs unchanged: max 2000 output tokens, no temperature, no JSON mode,
//   no reasoning effort. The call has the router's 55 s budget; every call writes one
//   ai_model_metrics row.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from '../_shared/cors.ts';
import { rateGuard } from '../_shared/rateGuard.ts';
import { callAITask } from '../_shared/aiConfig.ts';

// Service-role client for the AI model registry (callAITask reads the route and writes the ledger).
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);


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
    const { text, texts, sourceLanguage, targetLanguage, batch, purpose, context } = await req.json();
    const farmAdvice = purpose === 'farm_advice';
    const adviceContext = farmAdvice ? cleanContext(context) : null;

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
        return { text: await translateSingle(t, sourceLangName, targetLangName, adviceContext) };
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

/** Only short plain strings from the optional context reach the prompt. */
function cleanContext(raw: unknown): { crop?: string; stage?: string; region?: string } {
  const c = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined);
  return { crop: pick(c.crop), stage: pick(c.stage), region: pick(c.region) };
}

function farmAdvicePrompt(
  text: string,
  sourceLang: string,
  targetLang: string,
  ctx: { crop?: string; stage?: string; region?: string },
): string {
  const about = [
    ctx.crop && `crop: ${ctx.crop}`,
    ctx.stage && `crop stage: ${ctx.stage.replace(/_/g, ' ')}`,
    ctx.region && `region: ${ctx.region}`,
  ].filter(Boolean).join('; ');
  return `You are rewriting farm advice for a small farmer in rural India who will read it on a phone, often aloud to family. Translate the text below from ${sourceLang} to ${targetLang} in the way a trusted village agriculture officer would say it to that farmer face to face.
${about ? `\nThe advice is about this field (${about}).\n` : ''}
How to write it:
1. Use the everyday spoken words farmers of that region use in the field. Name the crop by the word used for the plant growing in the field, not the word for the grain or food in the kitchen. Name problems the way farmers describe them (for example "the field is short of water"), not with textbook or government terms.
2. Short sentences, one action per sentence. Say what to do first, then why, if the text gives a why.
3. Keep every number, unit, date, percentage and quantity exactly as written. Do not add, drop, round or convert any number.
4. Do not add advice, products, doses or warnings that are not in the text, and do not leave out any instruction that is in it.
5. A technical term with no common spoken word may stay as it is, explained in a few simple words in brackets the first time.
6. Keep emojis and line breaks. Output only the translated text.

Text:
${text}`;
}

async function translateSingle(
  text: string,
  sourceLang: string,
  targetLang: string,
  adviceContext: { crop?: string; stage?: string; region?: string } | null = null,
): Promise<string> {
  const prompt = adviceContext ? farmAdvicePrompt(text, sourceLang, targetLang, adviceContext) : `You are a professional translator specializing in Indian agricultural terminology. Translate the following text from ${sourceLang} to ${targetLang}.

IMPORTANT RULES:
1. Preserve agricultural and farming terminology accurately
2. Keep the natural, conversational tone
3. Do NOT translate proper nouns, brand names, or technical terms that are commonly used in their original form
4. Keep emojis and formatting intact
5. Only output the translated text, nothing else

Text to translate:
${text}`;

  // AI model SSOT: model chain from registry task farmer.translate (the router tries each step in
  // order and skips a provider that is cooling down after a 429 / exhausted credits).
  // Same request as before: max 2000 output tokens, no temperature.
  const r = await callAITask({
    db: supabase,
    task: 'farmer.translate',
    functionName: 'translate-text',
    messages: [
      { role: 'user', content: prompt }
    ],
    farmerId: null,
    maxOutputTokens: 2000,
    metadata: { caller: 'translate-text' },
  });

  if (r.ok) {
    const out = r.content.trim();
    if (!out) throw new APIError('No translation received', 500);
    return out;
  }

  console.error('Provider error:', r.httpStatus ?? '-', r.errorClass, (r.detail || '').slice(0, 300));
  // Exhausted credits are reported by OpenAI as 429 insufficient_quota — treat as billing (402).
  if (r.errorClass === 'quota_exhausted') {
    throw new APIError(`Translation API error: ${r.httpStatus ?? 429}`, 402);
  }
  if (r.errorClass === 'rate_limited'
    || (r.errorClass === 'no_provider_available' && r.attempts.some((a) => a.outcome === 'skipped_cooldown'))) {
    throw new APIError('Rate limit exceeded. Please try again later.', 429);
  }
  if (r.errorClass === 'empty_output') {
    throw new APIError('No translation received', 500);
  }
  if (r.httpStatus) {
    throw new APIError(`Translation API error: ${r.httpStatus}`, r.httpStatus);
  }
  // No HTTP response (timeout, network, no key, no route): 500, as a fetch exception was.
  throw new APIError(r.detail || r.errorClass, 500);
}
