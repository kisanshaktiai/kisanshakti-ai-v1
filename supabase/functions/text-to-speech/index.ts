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
import { rateGuard } from '../_shared/rateGuard.ts';

// Bhashini (Digital India Bhashini Division). Contract per the official docs at
// dibd-bhashini.gitbook.io/bhashini-apis: a Pipeline Config call, then a
// Pipeline Compute call.
//   BHASHINI_USER_ID        userID header, from My Profile on bhashini.gov.in/ulca
//   BHASHINI_API_KEY        the ULCA / "Udyat" key, ulcaApiKey header on the config call
//   BHASHINI_PIPELINE_ID    pipeline ID chosen on the ULCA portal
//   BHASHINI_INFERENCE_KEY  optional. The inference key generated under an app name
//                           in My Profile. When absent, the one returned by the
//                           config call is used.
const BHASHINI_USER_ID = Deno.env.get('BHASHINI_USER_ID');
const BHASHINI_API_KEY = Deno.env.get('BHASHINI_API_KEY');
const BHASHINI_PIPELINE_ID = Deno.env.get('BHASHINI_PIPELINE_ID');
const BHASHINI_INFERENCE_KEY = Deno.env.get('BHASHINI_INFERENCE_KEY');
const BHASHINI_CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
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

/**
 * Per-language TTS service resolved from the Pipeline Config call.
 * Cached in the function instance; refreshed when a language is missing.
 */
interface BhashiniTtsService {
  serviceId: string;
  voices: string[];
}
interface BhashiniConfig {
  callbackUrl: string;
  inferenceKey: string;
  services: Record<string, BhashiniTtsService>;
  fetchedAt: number;
}
let bhashiniConfig: BhashiniConfig | null = null;
const BHASHINI_CONFIG_TTL_MS = 6 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function configuredVendors(): string[] {
  const vendors: string[] = [];
  if (BHASHINI_API_KEY && BHASHINI_USER_ID && BHASHINI_PIPELINE_ID) vendors.push('bhashini');
  if (GOOGLE_API_KEY) vendors.push('google');
  if (LOVABLE_API_KEY) vendors.push('lovable');
  return vendors;
}

/**
 * Pipeline Config call. Returns the compute endpoint, the inference key, and the
 * serviceId for TTS in every language this pipeline supports. Asking without a
 * language filter returns the full list, so one call covers all 14 languages.
 */
async function loadBhashiniConfig(force = false): Promise<BhashiniConfig> {
  if (!force && bhashiniConfig && Date.now() - bhashiniConfig.fetchedAt < BHASHINI_CONFIG_TTL_MS) {
    return bhashiniConfig;
  }

  const response = await fetch(BHASHINI_CONFIG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      userID: BHASHINI_USER_ID!,
      ulcaApiKey: BHASHINI_API_KEY!,
    },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'tts' }],
      pipelineRequestConfig: { pipelineId: BHASHINI_PIPELINE_ID },
    }),
  });

  if (!response.ok) {
    throw new Error(`Bhashini config ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  const endpoint = data?.pipelineInferenceAPIEndPoint;
  const ttsBlock = (data?.pipelineResponseConfig || []).find((b: { taskType?: string }) => b.taskType === 'tts');

  const services: Record<string, BhashiniTtsService> = {};
  for (const c of ttsBlock?.config || []) {
    const lang = c?.language?.sourceLanguage;
    if (lang && c.serviceId) {
      services[lang] = { serviceId: c.serviceId, voices: c.supportedVoices || [] };
    }
  }

  bhashiniConfig = {
    callbackUrl: endpoint?.callbackUrl || 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline',
    inferenceKey: BHASHINI_INFERENCE_KEY || endpoint?.inferenceApiKey?.value || '',
    services,
    fetchedAt: Date.now(),
  };
  return bhashiniConfig;
}

/**
 * Pipeline Compute call for TTS.
 *
 * text-normalization is Bhashini's own pre-processor: it renders numbers and
 * dates as words IN THE TARGET LANGUAGE on the server, which is exactly what a
 * dose or a date needs and does not require any word table in this codebase.
 * high-compression returns 64 kbps audio for low-bandwidth rural networks.
 * Both are optional per the docs; if a service rejects them the call is
 * retried once without them so a farmer is never left without audio.
 */
async function synthesiseBhashini(text: string, locale: string) {
  const sourceLanguage = locale.split('-')[0].toLowerCase();

  let cfg = await loadBhashiniConfig();
  let service = cfg.services[sourceLanguage];
  if (!service) {
    cfg = await loadBhashiniConfig(true);
    service = cfg.services[sourceLanguage];
  }
  if (!service) throw new Error(`Bhashini has no TTS service for ${sourceLanguage}`);
  if (!cfg.inferenceKey) throw new Error('Bhashini inference key missing');

  const gender = service.voices.includes('female') ? 'female' : service.voices[0] || 'female';

  const compute = async (withProcessors: boolean) => {
    const config: Record<string, unknown> = {
      language: { sourceLanguage },
      serviceId: service!.serviceId,
      gender,
      speed: 1.0,
      samplingRate: 22050,
    };
    if (withProcessors) {
      config.preProcessors = ['text-normalization'];
      config.postProcessors = ['high-compression'];
    }
    return fetch(cfg.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: cfg.inferenceKey },
      body: JSON.stringify({
        pipelineTasks: [{ taskType: 'tts', config }],
        inputData: { input: [{ source: text }], audio: [{ audioContent: null }] },
      }),
    });
  };

  let response = await compute(true);
  if (!response.ok) {
    const firstError = (await response.text()).slice(0, 200);
    console.warn('[text-to-speech] Bhashini with processors failed, retrying plain:', firstError);
    response = await compute(false);
  }
  if (!response.ok) {
    throw new Error(`Bhashini compute ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const data = await response.json();
  const tts = (data?.pipelineResponse || []).find((r: { taskType?: string }) => r.taskType === 'tts') || data?.pipelineResponse?.[0];
  const audio = tts?.audio?.[0]?.audioContent;
  if (!audio) throw new Error('Bhashini returned no audio');

  const format = String(tts?.config?.audioFormat || 'wav').toLowerCase();
  const mimeType = format === 'mp3' ? 'audio/mpeg' : format === 'ogg' ? 'audio/ogg' : 'audio/wav';

  return { audioContent: audio, mimeType, vendor: 'bhashini', tier: service.serviceId };
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

/**
 * Last-resort natural voice. This is the tier the app was using before Bhashini
 * was wired in, so it must stay: it is what keeps the reading human-sounding
 * when Bhashini has no service for the language and Google is unavailable.
 */
async function synthesiseLovable(text: string, locale: string) {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini-tts',
      input: text,
      voice: 'alloy',
      response_format: 'mp3',
      instructions: `Speak naturally and warmly in ${locale}, at an unhurried pace, as a helpful rural agriculture advisor talking to a farmer.`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lovable AI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return { audioContent: btoa(binary), mimeType: 'audio/mpeg', vendor: 'lovable', tier: 'gpt-4o-mini-tts' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'synthesize';

    if (action === 'status') {
      const available = configuredVendors();
      let languages: string[] = [];
      if (available[0] === 'bhashini') {
        try {
          const cfg = await loadBhashiniConfig();
          languages = Object.keys(cfg.services).map((l) => `${l}-IN`);
        } catch (e) {
          console.error('[text-to-speech] Bhashini config failed:', e);
        }
      }
      // Never report an empty language list while another vendor can still
      // speak: the app would wrongly conclude no cloud voice exists.
      if (languages.length === 0 && (available.includes('google') || available.includes('lovable'))) {
        languages = Object.keys(GOOGLE_VOICES);
      }
      return json({ available, languages });
    }

    // Force a fresh config read, e.g. after Bhashini adds a language.
    if (action === 'discover') {
      if (!configuredVendors().includes('bhashini')) return json({ error: 'bhashini-not-configured' }, 400);
      const cfg = await loadBhashiniConfig(true);
      return json({ callbackUrl: cfg.callbackUrl, services: cfg.services, hasInferenceKey: !!cfg.inferenceKey });
    }

    const rateLimited = await rateGuard(req, { endpoint: 'text-to-speech', maxRequests: 60 });
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
            : vendor === 'google'
              ? await synthesiseGoogle(trimmed, locale)
              : await synthesiseLovable(trimmed, locale);
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
