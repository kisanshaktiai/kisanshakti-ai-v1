/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 * Used by the Proactive Alerts screen.
 *
 * The previous implementation had its own text preprocessor that converted
 * digits into words using hardcoded Hindi and English tables, so a Marathi
 * alert was spoken as "two दिवसांत". Numbers are now left as digits and read by
 * the voice in its own locale.
 */
import { useCallback, useState } from 'react';
import { useSpeech } from '@/hooks/useSpeech';

interface UseEnhancedTTSOptions {
  language?: string;
  onEnd?: () => void;
  onError?: (error: string) => void;
  autoCheckVoices?: boolean;
}

export function useEnhancedTTS(options: UseEnhancedTTSOptions = {}) {
  const { language = 'hi', onEnd, onError } = options;
  const [promptDismissed, setPromptDismissed] = useState(false);

  const s = useSpeech({ language, onEnd, onError });

  const speak = useCallback(
    async (text: string, lang?: string) => {
      await s.speak(text, lang);
    },
    [s]
  );

  const dismissVoicePrompt = useCallback(() => setPromptDismissed(true), []);

  return {
    speak,
    stop: s.stop,
    isSpeaking: s.isSpeaking,
    isLoading: s.isLoading,
    error: s.error,
    hasEnhancedVoices: s.source === 'cloud',
    shouldPromptDownload: s.voiceUnavailable && !promptDismissed,
    dismissVoicePrompt,
    getDownloadInstructions: () => '',
    preferences: {},
    setPreferences: () => undefined,
    currentChunk: s.currentChunk,
    voiceUnavailable: s.voiceUnavailable,
    openVoiceInstall: s.openVoiceInstall,
    canInstallVoice: s.canInstallVoice,
  };
}
