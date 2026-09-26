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
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';
import { useLanguageStore } from '@/stores/languageStore';

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
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { rate, pitch, volume, allowCloud, quality, allowCrossLanguageVoice, onStart, onEnd, onError } = options;

  // The farmer's app language is the default; a screen only passes a language
  // when it is reading text in some other language (a translated post, say).
  const currentLanguage = useLanguageStore((state) => state.currentLanguage);
  const language = options.language || currentLanguage || 'en';

  // The farmer's saved speech settings (Profile / chat settings) are the
  // default for every screen; a caller-supplied value only overrides them.
  const settingsRate = useTTSSettingsStore((state) => state.rate);
  const settingsPitch = useTTSSettingsStore((state) => state.pitch);
  const settingsVolume = useTTSSettingsStore((state) => state.volume);
  const effectiveRate = rate ?? settingsRate;
  const effectivePitch = pitch ?? settingsPitch;
  const effectiveVolume = volume ?? settingsVolume;

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
  // The read this hook started; only that one is stopped on unmount.
  const ownRequest = useRef<number | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      ttsEngine.stopRequest(ownRequest.current);
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
        { rate: effectiveRate, pitch: effectivePitch, volume: effectiveVolume, allowCloud, quality, allowCrossLanguageVoice },
        {
          onStart: (src, requestId) => {
            ownRequest.current = requestId;
            if (!mounted.current) return;
            setSource(src);
            setIsLoading(false);
            setIsSpeaking(true);
            onStart?.();
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
    [language, effectiveRate, effectivePitch, effectiveVolume, allowCloud, quality, allowCrossLanguageVoice, onStart, onEnd, onError, reset]
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
