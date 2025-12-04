import { useState, useCallback, useRef } from 'react';
import { nativeTTSService } from '@/services/nativeTTSService';

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

export function useTextToSpeech({ 
  language = 'hi', 
  rate = 1.0, 
  pitch = 1.0,
  onError
}: UseTextToSpeechProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported] = useState(true);
  const [isVoicesLoaded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const speakingRef = useRef(false);

  const speak = useCallback(async (text: string) => {
    if (!text.trim()) {
      return;
    }

    try {
      setError(null);
      setIsSpeaking(true);
      speakingRef.current = true;

      const result = await nativeTTSService.speak(
        text,
        language,
        { rate, pitch, volume: 1.0 },
        {
          onStart: () => {
            setIsSpeaking(true);
          },
          onEnd: () => {
            setIsSpeaking(false);
            speakingRef.current = false;
          },
          onError: (err) => {
            const errorMsg = err.message || 'Speech synthesis failed';
            setError(errorMsg);
            onError?.(errorMsg);
            setIsSpeaking(false);
            speakingRef.current = false;
          }
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      console.log(`[TTS] Provider: ${result.provider}, Language: ${result.usedLanguage}`);
    } catch (err) {
      console.error('Error in speak function:', err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred while trying to speak';
      setError(errorMsg);
      onError?.(errorMsg);
      setIsSpeaking(false);
      speakingRef.current = false;
    }
  }, [language, rate, pitch, onError]);

  const stop = useCallback(() => {
    try {
      nativeTTSService.stop();
      setIsSpeaking(false);
      speakingRef.current = false;
      setError(null);
    } catch (err) {
      console.error('Error stopping speech:', err);
    }
  }, []);

  // Note: Native TTS doesn't support pause/resume
  const pause = useCallback(() => {
    console.warn('[TTS] Pause not supported on native TTS');
  }, []);

  const resume = useCallback(() => {
    console.warn('[TTS] Resume not supported on native TTS');
  }, []);

  const reset = useCallback(() => {
    stop();
    setError(null);
  }, [stop]);

  return {
    speak,
    stop,
    pause,
    resume,
    reset,
    isSpeaking,
    isSupported,
    isVoicesLoaded,
    error,
  };
}
