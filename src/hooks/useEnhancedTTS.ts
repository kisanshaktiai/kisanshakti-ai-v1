/**
 * Enhanced TTS Hook with Natural Voice Quality
 * Features optimized settings, voice detection, and text preprocessing
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { enhancedTTSService, VoicePreferences } from '@/services/enhancedNativeTTSService';

interface UseEnhancedTTSOptions {
  language?: string;
  onEnd?: () => void;
  onError?: (error: string) => void;
  autoCheckVoices?: boolean;
}

interface UseEnhancedTTSReturn {
  speak: (text: string, lang?: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
  // Voice quality
  hasEnhancedVoices: boolean;
  shouldPromptDownload: boolean;
  dismissVoicePrompt: () => void;
  getDownloadInstructions: () => { android: string; ios: string };
  // Settings
  preferences: VoicePreferences;
  setPreferences: (prefs: Partial<VoicePreferences>) => void;
  // Progress
  currentChunk: number;
  totalChunks: number;
}

export function useEnhancedTTS(options: UseEnhancedTTSOptions = {}): UseEnhancedTTSReturn {
  const { language = 'hi', onEnd, onError, autoCheckVoices = true } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasEnhancedVoices, setHasEnhancedVoices] = useState(true);
  const [shouldPromptDownload, setShouldPromptDownload] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [preferences, setPreferencesState] = useState<VoicePreferences>(
    enhancedTTSService.getPreferences()
  );

  const speakingRef = useRef(false);

  // Check voice quality on mount
  useEffect(() => {
    if (autoCheckVoices) {
      enhancedTTSService.shouldPromptForVoiceDownload().then(shouldPrompt => {
        setShouldPromptDownload(shouldPrompt);
        setHasEnhancedVoices(enhancedTTSService.hasEnhancedVoices());
      });
    }
  }, [autoCheckVoices]);

  const speak = useCallback(async (text: string, lang?: string) => {
    if (!text.trim()) return;

    try {
      setError(null);
      setIsLoading(true);

      const result = await enhancedTTSService.speak(
        text,
        lang || language,
        {
          onStart: () => {
            setIsSpeaking(true);
            setIsLoading(false);
            speakingRef.current = true;
          },
          onEnd: () => {
            setIsSpeaking(false);
            speakingRef.current = false;
            setCurrentChunk(0);
            setTotalChunks(0);
            onEnd?.();
          },
          onError: (err) => {
            const msg = err.message || 'Speech failed';
            setError(msg);
            onError?.(msg);
            setIsSpeaking(false);
            speakingRef.current = false;
          },
          onChunkStart: (chunk, total) => {
            setCurrentChunk(chunk + 1);
            setTotalChunks(total);
          }
        }
      );

      if (!result.success && result.error) {
        throw new Error(result.error);
      }

      console.log('[useEnhancedTTS] Result:', {
        voice: result.voiceUsed,
        quality: result.voiceQuality
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS error';
      setError(msg);
      onError?.(msg);
      setIsSpeaking(false);
      setIsLoading(false);
    }
  }, [language, onEnd, onError]);

  const stop = useCallback(() => {
    enhancedTTSService.stop();
    setIsSpeaking(false);
    speakingRef.current = false;
    setCurrentChunk(0);
    setTotalChunks(0);
    setError(null);
  }, []);

  const dismissVoicePrompt = useCallback(() => {
    enhancedTTSService.dismissVoicePrompt();
    setShouldPromptDownload(false);
  }, []);

  const getDownloadInstructions = useCallback(() => {
    return enhancedTTSService.getVoiceDownloadInstructions();
  }, []);

  const setPreferences = useCallback((prefs: Partial<VoicePreferences>) => {
    enhancedTTSService.setPreferences(prefs);
    setPreferencesState(enhancedTTSService.getPreferences());
  }, []);

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
    hasEnhancedVoices,
    shouldPromptDownload,
    dismissVoicePrompt,
    getDownloadInstructions,
    preferences,
    setPreferences,
    currentChunk,
    totalChunks
  };
}
