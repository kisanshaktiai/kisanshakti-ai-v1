import { create } from 'zustand';

/**
 * Chat playback coordination: which message the speaker button is reading.
 * Speech settings (rate, pitch, volume) live in ttsSettingsStore and are
 * applied by useSpeech; voice availability is owned by ttsEngine.
 */
interface TTSState {
  currentlyPlaying: string | null;
  isPaused: boolean;

  // Actions
  setCurrentlyPlaying: (messageId: string | null) => void;
  setPaused: (paused: boolean) => void;
}

export const useTTSStore = create<TTSState>()((set) => ({
  currentlyPlaying: null,
  isPaused: false,

  setCurrentlyPlaying: (messageId) => set({ currentlyPlaying: messageId, isPaused: false }),

  setPaused: (paused) => set({ isPaused: paused }),
}));
