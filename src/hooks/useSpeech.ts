/**
 * useSpeech — the one Read Aloud hook.
 *
 * Every screen should use this. The older hooks (useTextToSpeech,
 * useAdvancedTextToSpeech, useTTS, useEnhancedTTS, useCommunityTTS,
 * useTTSFacade) are now thin wrappers over this one so that existing call
 * sites keep working while there is a single implementation underneath.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsEngine, type SpeechSource, type QualityMode } from '@/services/tts/ttsEngine';

export interface UseSpeechOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  allowCloud?: boolean;
  /** Defaults to 'auto': best voice available right now. */
  quality?: QualityMode;
  /** Default false: a Hindi voice reading Marathi is not Marathi speech. */
  allowCrossLanguageVoice?: boolean;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { language = 'hi', rate, pitch, volume, allowCloud, quality, allowCrossLanguageVoice, onEnd, onError } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(-1);
  const [totalChunks, setTotalChunks] = useState(0);
  const [source, setSource] = useState<SpeechSource>('none');
  const [spokenLocale, setSpokenLocale] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = ttsEngine.isSupported();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ttsEngine.stop();
    };
  }, []);

  const reset = useCallback(() => {
    if (!mounted.current) return;
    setIsSpeaking(false);
    setIsLoading(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentChunk(-1);
  }, []);

  const speak = useCallback(
    async (text: string, languageOverride?: string) => {
      const lang = languageOverride || language;

      setError(null);
      setVoiceUnavailable(false);
      setIsFallback(false);
      setIsLoading(true);
      setProgress(0);

      const result = await ttsEngine.speak(
        text,
        lang,
        { rate, pitch, volume, allowCloud, quality, allowCrossLanguageVoice },
        {
          onStart: (src) => {
            if (!mounted.current) return;
            setSource(src);
            setIsLoading(false);
            setIsSpeaking(true);
          },
          onChunk: (index, total) => {
            if (!mounted.current) return;
            setCurrentChunk(index);
            setTotalChunks(total);
          },
          onProgress: (percent) => {
            if (mounted.current) setProgress(percent);
          },
          onEnd: () => {
            if (!mounted.current) return;
            reset();
            onEnd?.();
          },
          onError: (message) => {
            if (!mounted.current) return;
            setError(message);
            if (message === 'voice-unavailable') setVoiceUnavailable(true);
            reset();
            onError?.(message);
          },
        }
      );

      if (!mounted.current) return result;

      setIsLoading(false);
      setIsFallback(result.isFallback);
      setSpokenLocale(result.locale ?? null);
      if (result.voiceUnavailable) setVoiceUnavailable(true);
      if (!result.success) setIsSpeaking(false);

      return result;
    },
    [language, rate, pitch, volume, allowCloud, quality, allowCrossLanguageVoice, onEnd, onError, reset]
  );

  const stop = useCallback(() => {
    ttsEngine.stop();
    reset();
  }, [reset]);

  const pause = useCallback(() => {
    ttsEngine.pause();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    ttsEngine.resume();
    setIsPaused(false);
  }, []);

  const openVoiceInstall = useCallback(async () => {
    const opened = await ttsEngine.openVoiceInstall();
    if (opened && mounted.current) setVoiceUnavailable(false);
    return opened;
  }, []);

  return {
    speak,
    stop,
    pause,
    resume,
    reset,
    isSpeaking,
    isLoading,
    isPaused,
    isSupported,
    progress,
    currentChunk,
    totalChunks,
    source,
    spokenLocale,
    isFallback,
    voiceUnavailable,
    error,
    openVoiceInstall,
    canInstallVoice: ttsEngine.canInstallVoice(),
    voiceInstallHintOnly: ttsEngine.voiceInstallHintOnly(),
  };
}
