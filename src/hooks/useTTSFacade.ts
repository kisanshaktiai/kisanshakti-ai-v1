/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 * Used by the header Speak-Page button.
 */
import { useCallback } from 'react';
import { useSpeech } from '@/hooks/useSpeech';
import { TTS_LANGUAGES } from '@/services/tts/ttsLanguages';

interface UseTTSFacadeOptions {
  language?: string;
  rate?: number;
  pitch?: number;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useTTSFacade(options: UseTTSFacadeOptions = {}) {
  const { language = 'hi', rate, pitch, onEnd, onError } = options;
  const s = useSpeech({ language, rate, pitch, onEnd, onError });

  const speak = useCallback((text: string, lang?: string) => s.speak(text, lang), [s]);

  return {
    speak,
    stop: s.stop,
    isSpeaking: s.isSpeaking,
    isLoading: s.isLoading,
    error: s.error,
    lastProvider: s.source,
    isSupported: s.isSupported,
    supportedLanguages: Object.values(TTS_LANGUAGES).map((l) => l.code),
    voiceUnavailable: s.voiceUnavailable,
    openVoiceInstall: s.openVoiceInstall,
  };
}
