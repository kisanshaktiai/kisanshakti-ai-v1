import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';
import { rateGuard } from '../_shared/rateGuard.ts';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Sprint 5: cost-control rate limit (Whisper API calls).
  const rl = await rateGuard(req, { endpoint: 'transcribe-voice', maxRequests: 30, windowMs: 60_000 });
  if (rl) return rl;

  try {

    const { audio, language } = await req.json();

    if (!audio) {
      throw new Error('No audio data provided');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Convert base64 to blob
    const binaryString = atob(audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/webm' });

    // Create form data for OpenAI Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    
    // Map language codes to Whisper language codes
    const languageMap: Record<string, string> = {
      'hi': 'hi',
      'en': 'en',
      'mr': 'mr',
      'ta': 'ta',
      'te': 'te',
      'kn': 'kn',
      'ml': 'ml',
      'gu': 'gu',
      'bn': 'bn',
      'pa': 'pa',
    };

    if (language && languageMap[language]) {
      formData.append('language', languageMap[language]);
    }

    console.log('Transcribing audio in language:', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API error:', response.status, errorText);
      throw new Error(`Transcription API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Transcription result:', data);

    return new Response(
      JSON.stringify({ text: data.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Transcription error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
