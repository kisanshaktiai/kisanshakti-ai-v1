/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 * Used by the chat message speaker button.
 */
import { useSpeech } from '@/hooks/useSpeech';

interface UseAdvancedTextToSpeechProps {
  language: string;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useAdvancedTextToSpeech({
  language,
  onEnd,
  onError,
}: UseAdvancedTextToSpeechProps) {
  const s = useSpeech({ language, onEnd, onError });

  return {
    speak: s.speak,
    stop: s.stop,
    pause: s.pause,
    resume: s.resume,
    isSpeaking: s.isSpeaking,
    isLoading: s.isLoading,
    isPaused: s.isPaused,
    isSupported: s.isSupported,
    currentSentence: s.currentChunk,
    progress: s.progress,
    /** BCP-47 locale actually spoken when it differs from the request, else null. */
    fallbackLanguage: s.isFallback ? s.spokenLocale : null,
    voiceUnavailable: s.voiceUnavailable,
    openVoiceInstall: s.openVoiceInstall,
    canInstallVoice: s.canInstallVoice,
    engine: s.source,
    provider: s.source,
    sentences: [] as string[],
  };
}
