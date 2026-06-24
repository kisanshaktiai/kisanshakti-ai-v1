/**
 * useTTS - Simple, fast TTS hook with instant playback
 * Integrates with Zustand store and i18next
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { nativeTTSService, TTSConfig, TTSResult, TTSProvider } from '@/services/nativeTTSService';
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';
import { toast } from '@/hooks/use-toast';

interface UseTTSOptions {
  /** Override language (defaults to current i18next language) */
  language?: string;
  /** Called when speech starts */
  onStart?: () => void;
  /** Called when speech ends */
  onEnd?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Auto-stop previous speech before starting new */
  autoStop?: boolean;
}

interface UseTTSReturn {
  /** Speak text instantly */
  speak: (text: string) => Promise<TTSResult>;
  /** Stop current speech */
  stop: () => void;
  /** Pause speech (Web only) */
  pause: () => void;
  /** Resume speech (Web only) */
  resume: () => void;
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Whether TTS is loading/initializing */
  isLoading: boolean;
  /** Whether TTS is paused */
  isPaused: boolean;
  /** Whether TTS is supported */
  isSupported: boolean;
  /** Current TTS configuration */
  config: TTSConfig;
  /** Update TTS configuration */
  updateConfig: (config: Partial<TTSConfig>) => void;
  /** Last used provider */
  lastProvider: TTSProvider | null;
  /** Time to first audio in ms */
  latency: number | null;
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const { i18n } = useTranslation();
  const {
    language: overrideLanguage,
    onStart,
    onEnd,
    onError,
    autoStop = true,
  } = options;

  // Get settings from store
  const { rate, pitch, volume, isEnabled } = useTTSSettingsStore();

  // Local state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastProvider, setLastProvider] = useState<TTSProvider | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  // Refs for callbacks
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  }, [onStart, onEnd, onError]);

  // Determine language
  const currentLanguage = overrideLanguage || i18n.language || 'hi';

  // Check if supported
  const isSupported = typeof window !== 'undefined' && (
    'speechSynthesis' in window || 
    nativeTTSService.isNativeAvailable()
  );

  // Config object
  const config: TTSConfig = { rate, pitch, volume };

  /**
   * Speak text with instant feedback
   */
  const speak = useCallback(async (text: string): Promise<TTSResult> => {
    if (!text?.trim()) {
      return { success: false, provider: 'none', error: 'No text provided' };
    }

    if (!isEnabled) {
      console.log('[useTTS] TTS is disabled');
      return { success: false, provider: 'none', error: 'TTS is disabled' };
    }

    // Stop previous if needed
    if (autoStop && isSpeaking) {
      nativeTTSService.stop();
    }

    // Set loading immediately for instant feedback
    setIsLoading(true);
    setIsPaused(false);

    try {
      const result = await nativeTTSService.speak(
        text,
        currentLanguage,
        config,
        {
          onStart: () => {
            setIsLoading(false);
            setIsSpeaking(true);
            onStartRef.current?.();
          },
          onEnd: () => {
            setIsSpeaking(false);
            setIsLoading(false);
            setIsPaused(false);
            onEndRef.current?.();
          },
          onError: (error) => {
            setIsSpeaking(false);
            setIsLoading(false);
            const msg = error.message || 'TTS failed';
            onErrorRef.current?.(msg);
            toast({
              variant: 'destructive',
              title: 'Speech Error',
              description: msg,
            });
          },
        }
      );

      setLastProvider(result.provider);
      if (result.startTime) {
        setLatency(Math.round(result.startTime));
      }

      if (!result.success) {
        setIsLoading(false);
        setIsSpeaking(false);
      }

      return result;
    } catch (error) {
      setIsLoading(false);
      setIsSpeaking(false);
      const msg = error instanceof Error ? error.message : 'TTS failed';
      onErrorRef.current?.(msg);
      return { success: false, provider: 'none', error: msg };
    }
  }, [currentLanguage, config, isEnabled, autoStop, isSpeaking]);

  /**
   * Stop speaking
   */
  const stop = useCallback(() => {
    nativeTTSService.stop();
    setIsSpeaking(false);
    setIsLoading(false);
    setIsPaused(false);
  }, []);

  /**
   * Pause speaking
   */
  const pause = useCallback(() => {
    nativeTTSService.pause();
    setIsPaused(true);
  }, []);

  /**
   * Resume speaking
   */
  const resume = useCallback(() => {
    nativeTTSService.resume();
    setIsPaused(false);
  }, []);

  /**
   * Update config in store
   */
  const updateConfig = useCallback((newConfig: Partial<TTSConfig>) => {
    useTTSSettingsStore.getState().updateSettings(newConfig);
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    isSpeaking,
    isLoading,
    isPaused,
    isSupported,
    config,
    updateConfig,
    lastProvider,
    latency,
  };
}

export default useTTS;
