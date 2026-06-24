/**
 * TTS Settings Store
 * Zustand store for TTS configuration with localStorage persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Supported languages configuration
export const TTS_LANGUAGES = {
  en: { code: 'en-IN', name: 'English', nativeName: 'English' },
  hi: { code: 'hi-IN', name: 'Hindi', nativeName: 'हिंदी' },
  mr: { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी' },
  pa: { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  ta: { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்' },
} as const;

export type TTSLanguageCode = keyof typeof TTS_LANGUAGES;

interface TTSSettingsState {
  // Core settings
  isEnabled: boolean;
  rate: number;         // Speech rate: 0.5 - 2.0
  pitch: number;        // Speech pitch: 0.5 - 2.0
  volume: number;       // Volume: 0.0 - 1.0
  
  // Feature toggles
  autoReadChat: boolean;      // Auto-read AI chat responses
  autoReadAlerts: boolean;    // Auto-read weather/task alerts
  autoReadSchedule: boolean;  // Auto-read schedule items
  
  // Playback state (not persisted)
  currentMessageId: string | null;
  isPaused: boolean;
  
  // Actions
  setEnabled: (enabled: boolean) => void;
  setRate: (rate: number) => void;
  setPitch: (pitch: number) => void;
  setVolume: (volume: number) => void;
  setAutoReadChat: (enabled: boolean) => void;
  setAutoReadAlerts: (enabled: boolean) => void;
  setAutoReadSchedule: (enabled: boolean) => void;
  updateSettings: (settings: Partial<Pick<TTSSettingsState, 'rate' | 'pitch' | 'volume'>>) => void;
  setCurrentMessageId: (id: string | null) => void;
  setPaused: (paused: boolean) => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS = {
  isEnabled: true,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  autoReadChat: false,
  autoReadAlerts: true,
  autoReadSchedule: false,
  currentMessageId: null,
  isPaused: false,
};

export const useTTSSettingsStore = create<TTSSettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setEnabled: (enabled) => set({ isEnabled: enabled }),
      
      setRate: (rate) => set({ rate: Math.max(0.5, Math.min(2.0, rate)) }),
      
      setPitch: (pitch) => set({ pitch: Math.max(0.5, Math.min(2.0, pitch)) }),
      
      setVolume: (volume) => set({ volume: Math.max(0.0, Math.min(1.0, volume)) }),
      
      setAutoReadChat: (enabled) => set({ autoReadChat: enabled }),
      
      setAutoReadAlerts: (enabled) => set({ autoReadAlerts: enabled }),
      
      setAutoReadSchedule: (enabled) => set({ autoReadSchedule: enabled }),
      
      updateSettings: (settings) => set((state) => ({
        ...state,
        ...settings,
        rate: settings.rate !== undefined 
          ? Math.max(0.5, Math.min(2.0, settings.rate)) 
          : state.rate,
        pitch: settings.pitch !== undefined 
          ? Math.max(0.5, Math.min(2.0, settings.pitch)) 
          : state.pitch,
        volume: settings.volume !== undefined 
          ? Math.max(0.0, Math.min(1.0, settings.volume)) 
          : state.volume,
      })),
      
      setCurrentMessageId: (id) => set({ currentMessageId: id, isPaused: false }),
      
      setPaused: (paused) => set({ isPaused: paused }),
      
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'tts-settings-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isEnabled: state.isEnabled,
        rate: state.rate,
        pitch: state.pitch,
        volume: state.volume,
        autoReadChat: state.autoReadChat,
        autoReadAlerts: state.autoReadAlerts,
        autoReadSchedule: state.autoReadSchedule,
      }),
    }
  )
);

// Selector hooks for optimal re-renders
export const useTTSEnabled = () => useTTSSettingsStore((s) => s.isEnabled);
export const useTTSRate = () => useTTSSettingsStore((s) => s.rate);
export const useTTSVolume = () => useTTSSettingsStore((s) => s.volume);
export const useTTSCurrentMessage = () => useTTSSettingsStore((s) => s.currentMessageId);
