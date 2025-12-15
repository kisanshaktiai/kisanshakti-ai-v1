import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseCommunityTTSReturn {
  speak: (text: string, language: string) => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isSpeaking: boolean;
  isPaused: boolean;
  isLoading: boolean;
  error: string | null;
}

// Language code mapping for TTS
const LANGUAGE_CODES: Record<string, string> = {
  'hi': 'hi-IN',
  'en': 'en-IN',
  'mr': 'mr-IN',
  'ta': 'ta-IN',
  'te': 'te-IN',
  'kn': 'kn-IN',
  'ml': 'ml-IN',
  'gu': 'gu-IN',
  'bn': 'bn-IN',
  'pa': 'pa-IN',
  'or': 'or-IN',
  'as': 'as-IN',
};

export const useCommunityTTS = (): UseCommunityTTSReturn => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTextRef = useRef<string>('');

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    // Also stop Web Speech API
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    window.speechSynthesis?.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
    }
    window.speechSynthesis?.resume();
    setIsPaused(false);
  }, []);

  const speakWithWebSpeech = useCallback((text: string, language: string) => {
    return new Promise<void>((resolve, reject) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const langCode = LANGUAGE_CODES[language] || 'en-IN';
      
      // Find best voice for language
      const voices = synth.getVoices();
      const targetVoice = voices.find(v => v.lang.startsWith(language)) ||
                         voices.find(v => v.lang === langCode) ||
                         voices.find(v => v.lang.startsWith('en'));
      
      if (targetVoice) {
        utterance.voice = targetVoice;
      }
      
      utterance.lang = langCode;
      utterance.rate = 0.9;
      utterance.pitch = 1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = (e) => {
        setIsSpeaking(false);
        reject(e);
      };

      synth.cancel(); // Clear any previous
      synth.speak(utterance);
    });
  }, []);

  const speak = useCallback(async (text: string, language: string) => {
    // Stop any current playback
    stop();
    
    if (!text.trim()) return;
    
    currentTextRef.current = text;
    setIsLoading(true);
    setError(null);

    try {
      // Try edge function TTS first (higher quality)
      const { data, error: fnError } = await supabase.functions.invoke('community-tts', {
        body: {
          text,
          language: LANGUAGE_CODES[language] || 'en-IN'
        }
      });

      if (fnError) throw fnError;

      if (data?.audioContent) {
        // Play the audio
        const audioUrl = `data:audio/mp3;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => {
          setIsSpeaking(false);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          // Fallback to Web Speech
          speakWithWebSpeech(text, language);
        };

        await audio.play();
      } else {
        // No audio returned, use Web Speech
        await speakWithWebSpeech(text, language);
      }
    } catch (err: any) {
      console.warn('TTS edge function failed, using Web Speech:', err);
      // Fallback to Web Speech API
      try {
        await speakWithWebSpeech(text, language);
      } catch (webErr) {
        setError('Unable to play audio');
      }
    } finally {
      setIsLoading(false);
    }
  }, [stop, speakWithWebSpeech]);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isPaused,
    isLoading,
    error
  };
};
