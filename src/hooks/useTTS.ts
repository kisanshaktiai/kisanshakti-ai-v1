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
  // Hooks are always called; caller-supplied options only override the value.
  const storedRate = useTTSSettingsStore((state) => state.rate);
  const storedPitch = useTTSSettingsStore((state) => state.pitch);
  const storedVolume = useTTSSettingsStore((state) => state.volume);
  const rate = options.rate ?? storedRate;
  const pitch = options.pitch ?? storedPitch;
  const volume = options.volume ?? storedVolume;
  const updateSettings = useTTSSettingsStore((state) => state.updateSettings);
  const config: TTSConfig = { rate, pitch, volume };

  const s = useSpeech({
    language: options.language ?? currentLanguage,
    rate: options.rate,
    pitch: options.pitch,
    volume: options.volume,
    allowCloud: options.allowCloud,
    quality: options.quality,
    allowCrossLanguageVoice: options.allowCrossLanguageVoice,
    onStart: options.onStart,
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
