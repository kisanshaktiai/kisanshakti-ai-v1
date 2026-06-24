/**
 * Hook for using Hybrid TTS (Kokoro + Native)
 * Provides high-quality TTS for Hindi/English and native TTS for other Indian languages
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { hybridTTSService, TTSProvider, ALL_SUPPORTED_LANGUAGES } from '@/services/hybridTTSService';
import { useLanguageStore } from '@/stores/languageStore';

interface UseHybridTTSOptions {
  autoPreload?: boolean; // Automatically preload Kokoro model
  onError?: (error: string) => void;
}

interface UseHybridTTSReturn {
  speak: (text: string, language?: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  currentProvider: TTSProvider | null;
  kokoroLoaded: boolean;
  kokoroProgress: number;
  preloadKokoro: () => Promise<boolean>;
  getProviderForLanguage: (language: string) => TTSProvider;
  supportedLanguages: typeof ALL_SUPPORTED_LANGUAGES;
  error: string | null;
}

export function useHybridTTS(options: UseHybridTTSOptions = {}): UseHybridTTSReturn {
  const { autoPreload = false, onError } = options;
  const { currentLanguage } = useLanguageStore();
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentProvider, setCurrentProvider] = useState<TTSProvider | null>(null);
  const [kokoroLoaded, setKokoroLoaded] = useState(hybridTTSService.isKokoroLoaded());
  const [kokoroProgress, setKokoroProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const speakingRef = useRef(false);

  // Auto-preload Kokoro model if enabled
  useEffect(() => {
    if (autoPreload && !kokoroLoaded) {
      const lang = currentLanguage.split('-')[0].toLowerCase();
      // Only preload if the current language uses Kokoro (en, hi)
      if (lang === 'en' || lang === 'hi') {
        console.log('[useHybridTTS] Auto-preloading Kokoro for', lang);
        preloadKokoro();
      }
    }
  }, [autoPreload, currentLanguage, kokoroLoaded]);

  const preloadKokoro = useCallback(async (): Promise<boolean> => {
    if (kokoroLoaded) return true;
    
    setIsLoading(true);
    try {
      const success = await hybridTTSService.preloadKokoro((progress) => {
        setKokoroProgress(progress);
      });
      setKokoroLoaded(success);
      return success;
    } catch (err) {
      console.error('[useHybridTTS] Preload failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [kokoroLoaded]);

  const speak = useCallback(async (text: string, language?: string): Promise<void> => {
    if (!text.trim()) {
      return;
    }

    const lang = language || currentLanguage;
    const provider = hybridTTSService.getProviderForLanguage(lang);
    
    setError(null);
    setIsLoading(true);
    setCurrentProvider(provider);
    speakingRef.current = true;

    try {
      const result = await hybridTTSService.speak(text, lang, undefined, {
        onStart: () => {
          setIsSpeaking(true);
          setIsLoading(false);
        },
        onEnd: () => {
          setIsSpeaking(false);
          speakingRef.current = false;
        },
        onError: (err) => {
          const errorMsg = err.message || 'TTS failed';
          setError(errorMsg);
          onError?.(errorMsg);
          setIsSpeaking(false);
          setIsLoading(false);
          speakingRef.current = false;
        },
      });

      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      // Update Kokoro loaded status
      if (provider === 'kokoro') {
        setKokoroLoaded(hybridTTSService.isKokoroLoaded());
      }

      console.log(`[useHybridTTS] Spoke with ${result.provider}: "${text.substring(0, 30)}..."`);
    } catch (err) {
      console.error('[useHybridTTS] Error:', err);
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      onError?.(errorMsg);
      setIsSpeaking(false);
      setIsLoading(false);
      speakingRef.current = false;
    }
  }, [currentLanguage, onError]);

  const stop = useCallback(() => {
    hybridTTSService.stop();
    setIsSpeaking(false);
    setIsLoading(false);
    speakingRef.current = false;
    setError(null);
  }, []);

  const getProviderForLanguage = useCallback((language: string): TTSProvider => {
    return hybridTTSService.getProviderForLanguage(language);
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    currentProvider,
    kokoroLoaded,
    kokoroProgress,
    preloadKokoro,
    getProviderForLanguage,
    supportedLanguages: ALL_SUPPORTED_LANGUAGES,
    error,
  };
}
