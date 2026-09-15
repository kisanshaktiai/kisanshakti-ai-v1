import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Farmer TTS gateway.
 *
 * Policy:
 *   1. Bhashini — primary Indian-language neural TTS, FEMALE voice preferred.
 *   2. Google — exact-language fallback only.
 *   3. OpenAI — English fallback only.
 *
 * Bhashini credentials stay server-side. The client sends only text + ISO-639
 * language code. Bhashini's documented TTS config exposes supportedVoices and
 * accepts gender in the TTS compute configuration.
 */

const BHASHINI_CONFIG_URL = 'https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline';
const MAX_TEXT_CHARS = 1800;
const configCache = new Map<string, BhashiniConfig>();

interface BhashiniConfig {
  callbackUrl: string;
  authName: string;
  authValue: string;
  serviceId: string;
  gender: 'female';
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
  return LANGUAGE_ALIASES[language.trim().toLowerCase().split('-')[0]] || null;
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
    if (text.length > MAX_TEXT_CHARS) return jsonResponse({ error: `Text exceeds ${MAX_TEXT_CHARS} characters` }, 413);

    const bhashini = await bhashiniTTS(text, language);
    if (bhashini) {
      return jsonResponse({
        audioContent: bhashini.audioContent,
        mimeType: 'audio/wav',
        provider: 'bhashini',
        voiceGender: 'female',
        language,
      });
    }

    const googleKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (googleKey) {
      try {
        const result = await googleTTS(text, language, googleKey);
        if (result) return jsonResponse({ audioContent: result, mimeType: 'audio/mp3', provider: 'google', language });
      } catch (error) {
        console.warn('[community-tts] Google fallback failed:', error instanceof Error ? error.message : error);
      }
    }

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
    headers: { 'Content-Type': 'application/json', userID: userId, ulcaApiKey: apiKey },
    body: JSON.stringify({
      pipelineTasks: [{ taskType: 'tts', config: { language: { sourceLanguage: language } } }],
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

  // Bhashini documents supportedVoices as a per-service list such as
  // ['male','female']. Choose a service that actually supports female rather
  // than selecting the first service and merely asking it for female.
  const languageConfigs = configs.filter((x: any) => x?.language?.sourceLanguage === language);
  const languageConfig = languageConfigs.find((x: any) =>
    Array.isArray(x?.supportedVoices) && x.supportedVoices.includes('female')
  );

  if (!endpoint?.callbackUrl || !endpoint?.inferenceApiKey?.name || !endpoint?.inferenceApiKey?.value || !languageConfig?.serviceId) {
    throw new Error(`Bhashini has no exact-language FEMALE TTS service for ${language}`);
  }

  const result: BhashiniConfig = {
    callbackUrl: endpoint.callbackUrl,
    authName: endpoint.inferenceApiKey.name,
    authValue: endpoint.inferenceApiKey.value,
    serviceId: languageConfig.serviceId,
    gender: 'female',
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  configCache.set(language, result);
  return result;
}

async function bhashiniTTS(text: string, language: string): Promise<{ audioContent: string } | null> {
  try {
    const config = await getBhashiniConfig(language);
    if (!config) return null;

    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [config.authName]: config.authValue },
      body: JSON.stringify({
        pipelineTasks: [{
          taskType: 'tts',
          config: {
            language: { sourceLanguage: language },
            serviceId: config.serviceId,
            gender: config.gender,
            samplingRate: 22050,
          },
        }],
        inputData: { input: [{ source: text }] },
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
    hi: { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-D' },
    en: { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
    mr: { languageCode: 'mr-IN', name: 'mr-IN-Wavenet-A' },
    ta: { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-D' },
    te: { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
    kn: { languageCode: 'kn-IN', name: 'kn-IN-Wavenet-A' },
    ml: { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A' },
    gu: { languageCode: 'gu-IN', name: 'gu-IN-Wavenet-A' },
    bn: { languageCode: 'bn-IN', name: 'bn-IN-Wavenet-A' },
    pa: { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A' },
  };
  const voice = voiceMap[language];
  if (!voice) return null;
  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice, audioConfig: { audioEncoding: 'MP3', speakingRate: 0.88, pitch: 1.0 } }),
  });
  if (!response.ok) throw new Error(`Google TTS error: ${response.status}`);
  const data = await response.json();
  return data.audioContent || null;
}

async function openaiTTS(text: string, apiKey: string): Promise<string | null> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', input: text.slice(0, 4000), voice: 'nova', response_format: 'mp3', speed: 0.88 }),
  });
  if (!response.ok) throw new Error(`OpenAI TTS error: ${response.status}`);
  return base64Encode(await response.arrayBuffer());
}
