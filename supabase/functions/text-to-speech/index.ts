import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { rateGuard } from '../_shared/rateGuard.ts';


// Language to voice mapping for Google Cloud TTS
const GOOGLE_VOICE_MAP: Record<string, { languageCode: string; name: string }> = {
  'hi': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
  'hi-IN': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-A' },
  'mr': { languageCode: 'mr-IN', name: 'mr-IN-Wavenet-A' },
  'mr-IN': { languageCode: 'mr-IN', name: 'mr-IN-Wavenet-A' },
  'ta': { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-A' },
  'ta-IN': { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-A' },
  'te': { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
  'te-IN': { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
  'bn': { languageCode: 'bn-IN', name: 'bn-IN-Wavenet-A' },
  'bn-IN': { languageCode: 'bn-IN', name: 'bn-IN-Wavenet-A' },
  'gu': { languageCode: 'gu-IN', name: 'gu-IN-Wavenet-A' },
  'gu-IN': { languageCode: 'gu-IN', name: 'gu-IN-Wavenet-A' },
  'kn': { languageCode: 'kn-IN', name: 'kn-IN-Wavenet-A' },
  'kn-IN': { languageCode: 'kn-IN', name: 'kn-IN-Wavenet-A' },
  'ml': { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A' },
  'ml-IN': { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A' },
  'pa': { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A' },
  'pa-IN': { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A' },
  'en': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
  'en-IN': { languageCode: 'en-IN', name: 'en-IN-Wavenet-A' },
  'en-US': { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
};

// OpenAI voice mapping
const OPENAI_VOICE = 'alloy'; // Best for multilingual

async function synthesizeWithGoogle(text: string, language: string, apiKey: string): Promise<ArrayBuffer> {
  const voiceConfig = GOOGLE_VOICE_MAP[language] || GOOGLE_VOICE_MAP['en-IN'];
  
  const requestBody = {
    input: { text },
    voice: {
      languageCode: voiceConfig.languageCode,
      name: voiceConfig.name,
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0,
    },
  };

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google TTS Error:', response.status, errorText);
    throw new Error(`Google TTS failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Google returns base64 encoded audio
  const binaryString = atob(data.audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes.buffer;
}

async function synthesizeWithOpenAI(text: string, apiKey: string): Promise<ArrayBuffer> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: OPENAI_VOICE,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI TTS Error:', response.status, errorText);
    throw new Error(`OpenAI TTS failed: ${response.status}`);
  }

  return await response.arrayBuffer();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Sprint 5: cost-control rate limit (Google/OpenAI TTS).
  const rl = await rateGuard(req, { endpoint: 'text-to-speech', maxRequests: 60, windowMs: 60_000 });
  if (rl) return rl;


  try {
    const { text, language = 'en-IN' } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit text length for safety
    const truncatedText = text.slice(0, 5000);

    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    let audioBuffer: ArrayBuffer;
    let provider = 'google';

    // Try Google TTS first
    if (googleApiKey) {
      try {
        console.log(`Attempting Google TTS for language: ${language}`);
        audioBuffer = await synthesizeWithGoogle(truncatedText, language, googleApiKey);
        console.log('Google TTS succeeded');
      } catch (googleError) {
        console.error('Google TTS failed, falling back to OpenAI:', googleError);
        
        // Fallback to OpenAI
        if (openaiApiKey) {
          audioBuffer = await synthesizeWithOpenAI(truncatedText, openaiApiKey);
          provider = 'openai';
          console.log('OpenAI TTS succeeded as fallback');
        } else {
          throw new Error('No TTS provider available');
        }
      }
    } else if (openaiApiKey) {
      // No Google key, use OpenAI directly
      console.log('Using OpenAI TTS (no Google key)');
      audioBuffer = await synthesizeWithOpenAI(truncatedText, openaiApiKey);
      provider = 'openai';
    } else {
      return new Response(
        JSON.stringify({ error: 'No TTS API keys configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert to base64 safely (avoid stack overflow with large buffers)
    const uint8Array = new Uint8Array(audioBuffer);
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Audio = btoa(binaryString);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio, 
        provider,
        language,
        contentType: 'audio/mp3'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('TTS Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'TTS failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
