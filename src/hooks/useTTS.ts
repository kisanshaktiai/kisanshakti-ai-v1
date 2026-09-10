/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 */
import { useCallback } from 'react';
import { useSpeech } from '@/hooks/useSpeech';
import { useLanguageStore } from '@/stores/languageStore';
import { useTTSSettingsStore } from '@/stores/ttsSettingsStore';

export interface TTSConfig {
  rate: number;
  pitch: number;
  volume: number;
}

export function useTTS() {
  const currentLanguage = useLanguageStore((state) => state.currentLanguage);

  // Read the farmer's saved speech settings so the Profile settings panel keeps
  // controlling playback.
  const rate = useTTSSettingsStore((state) => state.rate);
  const pitch = useTTSSettingsStore((state) => state.pitch);
  const volume = useTTSSettingsStore((state) => state.volume);
  const updateSettings = useTTSSettingsStore((state) => state.updateSettings);
  const config: TTSConfig = { rate, pitch, volume };

  const s = useSpeech({ language: currentLanguage, rate, pitch, volume });

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
