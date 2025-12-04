/**
 * Enhanced Text-to-Speech Hook
 * Uses enhanced TTS service with natural voice quality
 */

import { useState, useCallback, useRef } from 'react';
import { enhancedTTSService } from '@/services/enhancedNativeTTSService';

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

export function useTextToSpeech({ 
  language = 'hi', 
  rate,  // Will use enhanced defaults if not provided
  pitch, // Will use enhanced defaults if not provided
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

      // Use enhanced TTS service with optimized settings
      const result = await enhancedTTSService.speak(
        text,
        language,
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
        },
        // Override with user-provided values if specified
        rate !== undefined || pitch !== undefined 
          ? { rate: rate ?? 0.9, pitch: pitch ?? 1.0 } 
          : undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      console.log(`[TTS] Voice: ${result.voiceUsed || 'default'}, Quality: ${result.voiceQuality || 'unknown'}`);
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
      enhancedTTSService.stop();
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
