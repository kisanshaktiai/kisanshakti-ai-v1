/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 * Existing call sites keep their API; the behaviour comes from ttsEngine.
 */
import { useSpeech } from '@/hooks/useSpeech';

interface UseTextToSpeechProps {
  language?: string;
  rate?: number;
  pitch?: number;
  onError?: (error: string) => void;
}

export function useTextToSpeech({
  language = 'hi',
  rate = 0.95,
  pitch = 1.0,
  onError,
}: UseTextToSpeechProps = {}) {
  const s = useSpeech({ language, rate, pitch, onError });

  return {
    speak: s.speak,
    stop: s.stop,
    pause: s.pause,
    resume: s.resume,
    reset: s.reset,
    isSpeaking: s.isSpeaking,
    isSupported: s.isSupported,
    // Engine readiness, never the voice inventory. Gating playback on the
    // inventory silenced Read Aloud on handsets that report it late.
    isVoicesLoaded: s.isSupported,
    error: s.error,
    voiceUnavailable: s.voiceUnavailable,
    openVoiceInstall: s.openVoiceInstall,
    canInstallVoice: s.canInstallVoice,
  };
}
