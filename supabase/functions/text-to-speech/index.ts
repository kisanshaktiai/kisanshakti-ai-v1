/**
 * text-to-speech — the app's only cloud speech endpoint.
 *
 * Two actions on one function, per the standing one-feature-one-function rule:
 *   { action: 'status' }                    -> which vendors are configured
 *   { action: 'synthesize', text, language} -> base64 audio
 *
 * Vendor preference: Bhashini first, Google second. Adding BHASHINI_API_KEY
 * (and BHASHINI_USER_ID / BHASHINI_PIPELINE_ID) to Supabase secrets is the only
 * step needed to move the app onto Bhashini. No client change is required.
 *
 * The app calls this ONLY when the handset has no voice for the farmer's
 * language. Device speech remains the primary path and costs nothing.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rateGuard.ts';

const BHASHINI_API_KEY = Deno.env.get('BHASHINI_API_KEY');
const BHASHINI_USER_ID = Deno.env.get('BHASHINI_USER_ID');
const BHASHINI_PIPELINE_ID = Deno.env.get('BHASHINI_PIPELINE_ID');
const BHASHINI_ENDPOINT = Deno.env.get('BHASHINI_ENDPOINT');
const GOOGLE_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const MAX_TEXT_LENGTH = 5000;

/**
 * Chirp 3: HD is Google's current generative voice tier and is what makes the
 * reading sound conversational rather than synthetic. Voice names follow
 * <locale>-Chirp3-HD-<voice>. Locales listed here are the Indian ones Google
 * documents for this tier; pa-IN is documented as Preview.
 *
 * Chirp 3: HD does NOT accept SSML, speakingRate or pitch. Sending those makes
 * the request fail, which is why audioConfig differs per tier below.
 */
const CHIRP3_VOICES: Record<string, string> = {
  'hi-IN': 'hi-IN-Chirp3-HD-Kore',
  'mr-IN': 'mr-IN-Chirp3-HD-Kore',
  'bn-IN': 'bn-IN-Chirp3-HD-Kore',
  'gu-IN': 'gu-IN-Chirp3-HD-Kore',
  'kn-IN': 'kn-IN-Chirp3-HD-Kore',
  'ml-IN': 'ml-IN-Chirp3-HD-Kore',
  'ta-IN': 'ta-IN-Chirp3-HD-Kore',
  'te-IN': 'te-IN-Chirp3-HD-Kore',
  'ur-IN': 'ur-IN-Chirp3-HD-Kore',
  'pa-IN': 'pa-IN-Chirp3-HD-Kore',
  'en-IN': 'en-IN-Chirp3-HD-Kore',
};

/** Older tier, used only where Chirp 3: HD has no voice for the locale. */
const WAVENET_VOICES: Record<string, string> = {
  'hi-IN': 'hi-IN-Wavenet-A',
  'mr-IN': 'mr-IN-Wavenet-A',
  'ta-IN': 'ta-IN-Wavenet-A',
  'te-IN': 'te-IN-Standard-A',
  'bn-IN': 'bn-IN-Wavenet-A',
  'gu-IN': 'gu-IN-Wavenet-A',
  'kn-IN': 'kn-IN-Wavenet-A',
  'ml-IN': 'ml-IN-Wavenet-A',
  'pa-IN': 'pa-IN-Wavenet-A',
  'ur-IN': 'ur-IN-Wavenet-A',
  'en-IN': 'en-IN-Wavenet-A',
};

const GOOGLE_VOICES: Record<string, string> = { ...WAVENET_VOICES, ...CHIRP3_VOICES };

/** Bhashini source-language codes, keyed by the locale the app sends. */
const BHASHINI_LANGS: Record<string, string> = {
  'hi-IN': 'hi', 'mr-IN': 'mr', 'ta-IN': 'ta', 'te-IN': 'te', 'bn-IN': 'bn',
  'gu-IN': 'gu', 'kn-IN': 'kn', 'ml-IN': 'ml', 'pa-IN': 'pa', 'or-IN': 'or',
  'as-IN': 'as', 'ur-IN': 'ur', 'en-IN': 'en',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Human language names, used to steer the Lovable AI voice. */
const LANG_NAMES: Record<string, string> = {
  hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', te: 'Telugu', bn: 'Bengali',
  gu: 'Gujarati', kn: 'Kannada', ml: 'Malayalam', pa: 'Punjabi', or: 'Odia',
  as: 'Assamese', ur: 'Urdu', en: 'Indian English',
};

function configuredVendors(): string[] {
  const vendors: string[] = [];
  if (BHASHINI_API_KEY && BHASHINI_USER_ID && BHASHINI_PIPELINE_ID) vendors.push('bhashini');
  if (GOOGLE_API_KEY) vendors.push('google');
  // Always-on floor: no extra secret to configure, so Read Aloud never dies
  // just because the handset lacks the farmer's language pack.
  if (LOVABLE_API_KEY) vendors.push('lovable');
  return vendors;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function synthesiseLovable(text: string, locale: string) {
  const base = locale.split('-')[0];
  const langName = LANG_NAMES[base] || base;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini-tts',
      input: text,
      voice: 'alloy',
      response_format: 'mp3',
      instructions: `Speak in ${langName} with a natural rural Indian accent. Speak calmly and a little slowly, as if explaining to a farmer.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lovable AI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('Lovable AI returned no audio');

  return { audioContent: toBase64(bytes), mimeType: 'audio/mpeg', vendor: 'lovable' };
}

async function synthesiseBhashini(text: string, locale: string) {
  const sourceLanguage = BHASHINI_LANGS[locale] || locale.split('-')[0];
  const endpoint = BHASHINI_ENDPOINT || 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: BHASHINI_API_KEY!,
      userID: BHASHINI_USER_ID!,
    },
    body: JSON.stringify({
      pipelineTasks: [
        { taskType: 'tts', config: { language: { sourceLanguage }, gender: 'female' } },
      ],
      inputData: { input: [{ source: text }] },
      pipelineRequestConfig: { pipelineId: BHASHINI_PIPELINE_ID },
    }),
  });

  if (!response.ok) {
    throw new Error(`Bhashini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  const audio = data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
  if (!audio) throw new Error('Bhashini returned no audio');

  return { audioContent: audio, mimeType: 'audio/wav', vendor: 'bhashini' };
}

async function synthesiseGoogle(text: string, locale: string) {
  const chirpVoice = CHIRP3_VOICES[locale];
  const voiceName = chirpVoice || WAVENET_VOICES[locale];
  if (!voiceName) throw new Error(`Google has no configured voice for ${locale}`);

  // Chirp 3: HD rejects speakingRate and pitch. Only the older tiers take them.
  const audioConfig = chirpVoice
    ? { audioEncoding: 'MP3' }
    : { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 };

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: locale, name: voiceName },
        audioConfig,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  if (!data.audioContent) throw new Error('Google returned no audio');

  return {
    audioContent: data.audioContent,
    mimeType: 'audio/mpeg',
    vendor: 'google',
    tier: chirpVoice ? 'chirp3-hd' : 'wavenet',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'synthesize';

    if (action === 'status') {
      const available = configuredVendors();
      const languages =
        available[0] === 'bhashini' ? Object.keys(BHASHINI_LANGS)
        : available[0] === 'google' ? Object.keys(GOOGLE_VOICES)
        : available[0] === 'lovable' ? Object.keys(BHASHINI_LANGS)
        : [];
      return json({ available, languages });
    }

    const rateLimited = await checkRateLimit(req, 'text-to-speech', 60);
    if (rateLimited) return rateLimited;

    const { text, language } = body;
    if (!text || typeof text !== 'string') return json({ error: 'text is required' }, 400);

    const locale = typeof language === 'string' && language ? language : 'hi-IN';
    const trimmed = text.slice(0, MAX_TEXT_LENGTH);

    const vendors = configuredVendors();
    if (vendors.length === 0) {
      // Not an error: the app simply stays on device speech.
      return json({ error: 'no-vendor-configured', available: [] }, 200);
    }

    let lastError = '';
    for (const vendor of vendors) {
      try {
        const result =
          vendor === 'bhashini'
            ? await synthesiseBhashini(trimmed, locale)
            : await synthesiseGoogle(trimmed, locale);
        return json(result);
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error(`[text-to-speech] ${vendor} failed:`, lastError);
      }
    }

    return json({ error: lastError || 'synthesis failed' }, 502);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error('[text-to-speech]', message);
    return json({ error: message }, 500);
  }
});
