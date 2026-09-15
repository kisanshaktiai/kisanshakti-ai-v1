/**
 * useSpeech — the one Read Aloud hook.
 *
 * Every screen should use this. All playback routes through ttsEngine, which is
 * the single speech orchestration point for device/cloud selection, language,
 * preparation, settings, pause/resume and voice installation.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsEngine, type SpeechSource, type QualityMode } from '@/services/tts/ttsEngine';
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';

export interface UseSpeechOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  allowCloud?: boolean;
  quality?: QualityMode;
  allowCrossLanguageVoice?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const { language = 'hi', rate, pitch, volume, allowCloud, quality, allowCrossLanguageVoice, onStart, onEnd, onError } = options;
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
        { rate: effectiveRate, pitch: effectivePitch, volume: effectiveVolume, allowCloud, quality, allowCrossLanguageVoice },
        {
          onStart: (src) => {
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
