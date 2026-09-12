/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 */
import { useCallback } from 'react';
import { useSpeech, type UseSpeechOptions } from '@/hooks/useSpeech';
import { useLanguageStore } from '@/stores/languageStore';
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';

export interface TTSConfig {
  rate: number;
  pitch: number;
  volume: number;
}

export function useTTS(options: UseSpeechOptions = {}) {
  const currentLanguage = useLanguageStore((state) => state.currentLanguage);

  // Read the farmer's saved speech settings so the Profile settings panel keeps
  // controlling playback. Caller-supplied options take precedence.
  const rate = options.rate ?? useTTSSettingsStore((state) => state.rate);
  const pitch = options.pitch ?? useTTSSettingsStore((state) => state.pitch);
  const volume = options.volume ?? useTTSSettingsStore((state) => state.volume);
  const updateSettings = useTTSSettingsStore((state) => state.updateSettings);
  const config: TTSConfig = { rate, pitch, volume };

  const s = useSpeech({
    language: options.language ?? currentLanguage,
    rate,
    pitch,
    volume,
    allowCloud: options.allowCloud,
    quality: options.quality,
    allowCrossLanguageVoice: options.allowCrossLanguageVoice,
    onEnd: options.onEnd,
    onError: options.onError,
  });

  const updateConfig = useCallback(
    (partial: Partial<TTSConfig>) => updateSettings(partial),
    [updateSettings]
  );

  return {
    speak: s.speak,
    stop: s.stop,
    pause: s.pause,
    resume: s.resume,
    isSpeaking: s.isSpeaking,
    isLoading: s.isLoading,
    isPaused: s.isPaused,
    isSupported: s.isSupported,
    config,
    updateConfig,
    lastProvider: s.source,
    latency: 0,
    voiceUnavailable: s.voiceUnavailable,
    openVoiceInstall: s.openVoiceInstall,
  };
}
