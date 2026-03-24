/**
 * ═══════════════════════════════════════════════════════════════════════════
 * useTTSFacade - Unified TTS Hook
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Single hook for all TTS needs. Replaces:
 * - useAdvancedTextToSpeech
 * - useCommunityTTS
 * - useEnhancedTTS
 * - useHybridTTS
 * - useTTS
 * - useTextToSpeech
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ttsFacade, TTSOptions, TTSResult, TTSProvider } from '@/services/tts/TTSFacade';

interface UseTTSFacadeOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  autoStop?: boolean;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

interface UseTTSFacadeReturn {
  speak: (text: string, lang?: string) => Promise<TTSResult>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
  lastProvider: TTSProvider | null;
  isSupported: boolean;
  supportedLanguages: string[];
}

export function useTTSFacade(options: UseTTSFacadeOptions = {}): UseTTSFacadeReturn {
  const { 
    language = 'en', 
    rate = 1.0, 
    pitch = 1.0, 
    autoStop = true,
    onEnd,
    onError 
  } = options;
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState<TTSProvider | null>(null);
  
  const mountedRef = useRef(true);
  
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (autoStop) {
        ttsFacade.stop();
      }
    };
  }, [autoStop]);
  
  const speak = useCallback(async (text: string, lang?: string): Promise<TTSResult> => {
    if (!text?.trim()) {
      return { success: false, provider: 'none', error: 'Empty text' };
    }
    
    // Stop any current playback
    ttsFacade.stop();
    
    setIsLoading(true);
    setError(null);
    
    const ttsOptions: TTSOptions = {
      language: lang || language,
      rate,
      pitch,
      onStart: () => {
        if (mountedRef.current) {
          setIsSpeaking(true);
          setIsLoading(false);
        }
      },
      onEnd: () => {
        if (mountedRef.current) {
          setIsSpeaking(false);
          onEnd?.();
        }
      },
      onError: (err) => {
        if (mountedRef.current) {
          setError(err);
          setIsSpeaking(false);
          setIsLoading(false);
          onError?.(err);
        }
      }
    };
    
    const result = await ttsFacade.speak(text, ttsOptions);
    
    if (mountedRef.current) {
      setLastProvider(result.provider as TTSProvider);
      if (!result.success) {
        setError(result.error || 'TTS failed');
      }
      setIsLoading(false);
    }
    
    return result;
  }, [language, rate, pitch, onEnd, onError]);
  
  const stop = useCallback(() => {
    ttsFacade.stop();
    setIsSpeaking(false);
    setIsLoading(false);
    setError(null);
  }, []);
  
  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
    lastProvider,
    isSupported: true, // TTS has multiple fallbacks, always supported
    supportedLanguages: ttsFacade.getSupportedLanguages()
  };
}
