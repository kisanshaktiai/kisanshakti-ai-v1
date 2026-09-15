/**
 * Compatibility wrapper over useSpeech, the single Read Aloud implementation.
 * Community posts now speak on the device first like everything else, instead
 * of calling a cloud endpoint on every playback.
 */
import { useSpeech } from '@/hooks/useSpeech';

export const useCommunityTTS = () => {
  const s = useSpeech();

  return {
    speak: (text: string, language: string) => s.speak(text, language),
    stop: s.stop,
    pause: s.pause,
    resume: s.resume,
    isSpeaking: s.isSpeaking,
    isPaused: s.isPaused,
    isLoading: s.isLoading,
    voiceUnavailable: s.voiceUnavailable,
    openVoiceInstall: s.openVoiceInstall,
  };
};
