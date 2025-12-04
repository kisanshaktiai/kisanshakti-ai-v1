import { useState, useCallback, useRef } from 'react';
import { universalTTSService } from '@/services/universalTTSService';

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

export function useTextToSpeech({ 
  language = 'hi-IN', 
  rate = 0.9, 
  pitch = 1.0,
  onError
}: UseTextToSpeechProps = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported] = useState(true); // Universal TTS always has some provider
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

      const result = await universalTTSService.speak({
        text,
        language,
        rate,
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
      });

      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      console.log(`[TTS] Used provider: ${result.provider}`);
    } catch (err) {
      console.error('Error in speak function:', err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred while trying to speak';
      setError(errorMsg);
      onError?.(errorMsg);
      setIsSpeaking(false);
      speakingRef.current = false;
    }
  }, [language, rate, onError]);

  const stop = useCallback(() => {
    try {
      universalTTSService.stop();
      setIsSpeaking(false);
      speakingRef.current = false;
      setError(null);
    } catch (err) {
      console.error('Error stopping speech:', err);
    }
  }, []);

  const pause = useCallback(() => {
    // Cloud TTS doesn't support pause - just stop
    if (speakingRef.current) {
      // For web speech API fallback only
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.pause();
        } catch (err) {
          console.error('Error pausing speech:', err);
        }
      }
    }
  }, []);

  const resume = useCallback(() => {
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      try {
        window.speechSynthesis.resume();
      } catch (err) {
        console.error('Error resuming speech:', err);
      }
    }
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
