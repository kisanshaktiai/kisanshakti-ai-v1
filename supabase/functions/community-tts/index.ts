import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Farmer TTS gateway.
 *
 * Provider policy:
 *   1. Bhashini — primary Indian-language neural TTS when configured.
 *   2. Google — exact-language fallback only (never another language's voice).
 *   3. OpenAI — English fallback only; never used to fake an Indic language.
 *
 * Bhashini credentials stay server-side. The mobile/web client sends only
 * { text, language } using ISO-639 language codes (mr, hi, ta ...).
 */

const BHASHINI_CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
const MAX_TEXT_CHARS = 1800;
const configCache = new Map<string, BhashiniConfig>();

interface BhashiniConfig {
  callbackUrl: string;
  authName: string;
  authValue: string;
  serviceId: string;
  gender?: 'male' | 'female';
  expiresAt: number;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en', hi: 'hi', mr: 'mr', ta: 'ta', te: 'te', kn: 'kn', ml: 'ml', gu: 'gu',
  bn: 'bn', pa: 'pa', or: 'or', as: 'as', ur: 'ur', mai: 'mai', sa: 'sa', ne: 'ne',
  sd: 'sd', kok: 'kok', doi: 'doi', mni: 'mni', sat: 'sat', ks: 'ks', bo: 'bo',
  bh: 'bh', raj: 'raj', awa: 'awa', mag: 'mag', hne: 'hne', gom: 'gom',
};

function canonicalLanguage(language: unknown): string | null {
  if (typeof language !== 'string') return null;
  const base = language.trim().toLowerCase().split('-')[0];
  return LANGUAGE_ALIASES[base] || null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const language = canonicalLanguage(body?.language);

    if (!text) return jsonResponse({ error: 'No text provided' }, 400);
    if (!language) return jsonResponse({ error: 'Unsupported or missing language' }, 400);
    if (text.length > MAX_TEXT_CHARS) {
      return jsonResponse({ error: `Text exceeds ${MAX_TEXT_CHARS} characters` }, 413);
    }

    // Primary: Bhashini. It is intentionally exact-language only.
    const bhashini = await bhashiniTTS(text, language);
    if (bhashini) {
      return jsonResponse({
        audioContent: bhashini.audioContent,
        mimeType: 'audio/wav',
        provider: 'bhashini',
        language,
      });
    }

    // Exact-language Google fallback. If there is no exact voice mapping, do
    // not fall back to Hindi/English; native mobile TTS will handle offline.
    const googleKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (googleKey) {
      try {
        const result = await googleTTS(text, language, googleKey);
        if (result) return jsonResponse({ audioContent: result, mimeType: 'audio/mp3', provider: 'google', language });
      } catch (error) {
        console.warn('[community-tts] Google fallback failed:', error instanceof Error ? error.message : error);
      }
    }

    // OpenAI is deliberately restricted to English. Never use a generic voice
    // to pronounce Marathi/Tamil/etc. because that produces misleading speech.
    if (language === 'en') {
      const openAiKey = Deno.env.get('OPENAI_API_KEY');
      if (openAiKey) {
        try {
          const result = await openaiTTS(text, openAiKey);
          if (result) return jsonResponse({ audioContent: result, mimeType: 'audio/mp3', provider: 'openai', language });
        } catch (error) {
          console.warn('[community-tts] OpenAI fallback failed:', error instanceof Error ? error.message : error);
        }
      }
    }

    return jsonResponse({ error: `No exact-language online TTS provider available for ${language}`, audioContent: null }, 503);
  } catch (error) {
    console.error('[community-tts] TTS error:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'TTS error' }, 500);
  }
});

async function getBhashiniConfig(language: string): Promise<BhashiniConfig | null> {
  const userId = Deno.env.get('BHASHINI_USER_ID');
  const apiKey = Deno.env.get('BHASHINI_API_KEY');
  const pipelineId = Deno.env.get('BHASHINI_PIPELINE_ID');
  if (!userId || !apiKey || !pipelineId) return null;

  const cached = configCache.get(language);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const response = await fetch(BHASHINI_CONFIG_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      userID: userId,
      ulcaApiKey: apiKey,
    },
    body: JSON.stringify({
      pipelineTasks: [
        { taskType: 'tts', config: { language: { sourceLanguage: language } } },
      ],
      pipelineRequestConfig: { pipelineId },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Bhashini config ${response.status}: ${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const endpoint = data?.pipelineInferenceAPIEndPoint;
  const configs = data?.pipelineResponseConfig?.find((x: any) => x?.taskType === 'tts')?.config || [];
  const languageConfig = configs.find((x: any) => x?.language?.sourceLanguage === language);
  if (!endpoint?.callbackUrl || !endpoint?.inferenceApiKey?.name || !endpoint?.inferenceApiKey?.value || !languageConfig?.serviceId) {
    throw new Error(`Bhashini has no exact TTS service for ${language}`);
  }

  const requestedGender = Deno.env.get('BHASHINI_TTS_GENDER')?.toLowerCase();
  const supportedVoices = Array.isArray(languageConfig.supportedVoices) ? languageConfig.supportedVoices : [];
  const gender = requestedGender === 'male' || requestedGender === 'female'
    ? (supportedVoices.includes(requestedGender) ? requestedGender : undefined)
    : (supportedVoices.includes('female') ? 'female' : supportedVoices.includes('male') ? 'male' : undefined);

  const result: BhashiniConfig = {
    callbackUrl: endpoint.callbackUrl,
    authName: endpoint.inferenceApiKey.name,
    authValue: endpoint.inferenceApiKey.value,
    serviceId: languageConfig.serviceId,
    gender,
    // Refresh well before a platform-side credential expires; the config is
    // dynamically allocated by Bhashini, so never persist it permanently.
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  configCache.set(language, result);
  return result;
}

async function bhashiniTTS(text: string, language: string): Promise<{ audioContent: string } | null> {
  try {
    const config = await getBhashiniConfig(language);
    if (!config) return null;

    const ttsConfig: Record<string, unknown> = {
      language: { sourceLanguage: language },
      serviceId: config.serviceId,
    };
    if (config.gender) ttsConfig.gender = config.gender;

    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.authName]: config.authValue,
      },
      body: JSON.stringify({
        pipelineTasks: [{ taskType: 'tts', config: ttsConfig }],
        inputData: {
          input: [{ source: text }],
          audio: [{ audioContent: null }],
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Bhashini compute ${response.status}: ${detail.slice(0, 500)}`);
    }

    const data = await response.json();
    const audioContent = data?.pipelineResponse?.find((x: any) => x?.taskType === 'tts')?.audio?.[0]?.audioContent;
    if (!audioContent) throw new Error('Bhashini returned no audioContent');
    return { audioContent };
  } catch (error) {
    console.warn('[community-tts] Bhashini failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function googleTTS(text: string, language: string, apiKey: string): Promise<string | null> {
  const voiceMap: Record<string, { languageCode: string; name: string }> = {
    'hi': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-D' },
    'en': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
    'mr': { languageCode: 'mr-IN', name: 'mr-IN-Wavenet-A' },
    'ta': { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-D' },
    'te': { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
    'kn': { languageCode: 'kn-IN', name: 'kn-IN-Wavenet-A' },
    'ml': { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A' },
    'gu': { languageCode: 'gu-IN', name: 'gu-IN-Wavenet-A' },
    'bn': { languageCode: 'bn-IN', name: 'bn-IN-Wavenet-A' },
    'pa': { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A' },
  };
  const voice = voiceMap[language];
  if (!voice) return null;

  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.94, pitch: 0 },
    }),
  });
  if (!response.ok) throw new Error(`Google TTS error: ${response.status}`);
  const data = await response.json();
  return data.audioContent || null;
}

async function openaiTTS(text: string, apiKey: string): Promise<string | null> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'tts-1',
      input: text.slice(0, 4000),
      voice: 'nova',
      response_format: 'mp3',
      speed: 0.94,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI TTS error: ${response.status}`);
  return base64Encode(await response.arrayBuffer());
}
