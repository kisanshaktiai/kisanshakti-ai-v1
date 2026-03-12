import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, language } = await req.json();

    if (!text) {
      throw new Error('No text provided');
    }

    console.log('TTS request:', { textLength: text.length, language });

    // Try Google Cloud TTS first (higher quality for Indian languages)
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
    
    if (GOOGLE_API_KEY) {
      try {
        const result = await googleTTS(text, language, GOOGLE_API_KEY);
        if (result) {
          console.log('Using Google Cloud TTS');
          return new Response(
            JSON.stringify({ audioContent: result }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (googleError) {
        console.warn('Google TTS failed, trying OpenAI:', googleError.message);
      }
    }

    // Fallback to OpenAI TTS
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (OPENAI_API_KEY) {
      const result = await openaiTTS(text, OPENAI_API_KEY);
      if (result) {
        console.log('Using OpenAI TTS');
        return new Response(
          JSON.stringify({ audioContent: result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // No TTS available
    return new Response(
      JSON.stringify({ error: 'No TTS service available', audioContent: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('TTS error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function googleTTS(text: string, language: string, apiKey: string): Promise<string | null> {
  // Map language codes to Google Cloud TTS voice names
  const voiceMap: Record<string, { languageCode: string; name: string }> = {
    'hi-IN': { languageCode: 'hi-IN', name: 'hi-IN-Wavenet-D' },
    'en-IN': { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
    'mr-IN': { languageCode: 'mr-IN', name: 'mr-IN-Wavenet-A' },
    'ta-IN': { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-D' },
    'te-IN': { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
    'kn-IN': { languageCode: 'kn-IN', name: 'kn-IN-Wavenet-A' },
    'ml-IN': { languageCode: 'ml-IN', name: 'ml-IN-Wavenet-A' },
    'gu-IN': { languageCode: 'gu-IN', name: 'gu-IN-Wavenet-A' },
    'bn-IN': { languageCode: 'bn-IN', name: 'bn-IN-Wavenet-A' },
    'pa-IN': { languageCode: 'pa-IN', name: 'pa-IN-Wavenet-A' },
  };

  const voice = voiceMap[language] || voiceMap['hi-IN'];

  const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: voice.languageCode,
        name: voice.name,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 0.9,
        pitch: 0,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google TTS error:', response.status, errorText);
    throw new Error(`Google TTS error: ${response.status}`);
  }

  const data = await response.json();
  return data.audioContent || null;
}

async function openaiTTS(text: string, apiKey: string): Promise<string | null> {
  // OpenAI TTS has a 4096 character limit, truncate if needed
  const truncatedText = text.length > 4000 ? text.substring(0, 4000) + '...' : text;

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: truncatedText,
      voice: 'nova', // Warm, friendly voice
      response_format: 'mp3',
      speed: 0.95,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI TTS error:', response.status, errorText);
    throw new Error(`OpenAI TTS error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  return base64Encode(audioBuffer);
}
