/**
 * Voice Navigation Store
 * Zustand store for voice navigation settings and state persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VoiceNavigationSettings {
  // Feature toggles
  isEnabled: boolean;
  autoStartOnLaunch: boolean;
  speakConfirmations: boolean;
  speakErrors: boolean;
  
  // Recognition settings
  confidenceThreshold: number; // 0.0 - 1.0
  continuousMode: boolean;
  
  // UI settings
  showFloatingButton: boolean;
  floatingButtonPosition: 'bottom-right' | 'bottom-left' | 'bottom-center';
  showTranscript: boolean;
  showExamples: boolean;
  hapticFeedback: boolean;
  
  // Performance
  preferNative: boolean; // Prefer native over web
  offlineFirst: boolean; // Try local matching before cloud
  
  // History
  commandHistory: Array<{
    transcript: string;
    intent: string;
    timestamp: number;
    latencyMs: number;
    provider: 'local' | 'cloud';
  }>;
}

interface VoiceNavigationStore extends VoiceNavigationSettings {
  // Actions
  setEnabled: (enabled: boolean) => void;
  setAutoStartOnLaunch: (autoStart: boolean) => void;
  setSpeakConfirmations: (speak: boolean) => void;
  setSpeakErrors: (speak: boolean) => void;
  setConfidenceThreshold: (threshold: number) => void;
  setContinuousMode: (continuous: boolean) => void;
  setShowFloatingButton: (show: boolean) => void;
  setFloatingButtonPosition: (position: 'bottom-right' | 'bottom-left' | 'bottom-center') => void;
  setShowTranscript: (show: boolean) => void;
  setShowExamples: (show: boolean) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setPreferNative: (prefer: boolean) => void;
  setOfflineFirst: (offline: boolean) => void;
  addToHistory: (entry: VoiceNavigationSettings['commandHistory'][0]) => void;
  clearHistory: () => void;
  resetToDefaults: () => void;
}

const DEFAULT_SETTINGS: VoiceNavigationSettings = {
  isEnabled: true,
  autoStartOnLaunch: false,
  speakConfirmations: true,
  speakErrors: true,
  confidenceThreshold: 0.6,
  continuousMode: false,
  showFloatingButton: true,
  floatingButtonPosition: 'bottom-right',
  showTranscript: true,
  showExamples: true,
  hapticFeedback: true,
  preferNative: true,
  offlineFirst: true,
  commandHistory: [],
};

export const useVoiceNavigationStore = create<VoiceNavigationStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,

      setEnabled: (enabled) => set({ isEnabled: enabled }),
      
      setAutoStartOnLaunch: (autoStart) => set({ autoStartOnLaunch: autoStart }),
      
      setSpeakConfirmations: (speak) => set({ speakConfirmations: speak }),
      
      setSpeakErrors: (speak) => set({ speakErrors: speak }),
      
      setConfidenceThreshold: (threshold) => set({ 
        confidenceThreshold: Math.max(0, Math.min(1, threshold)) 
      }),
      
      setContinuousMode: (continuous) => set({ continuousMode: continuous }),
      
      setShowFloatingButton: (show) => set({ showFloatingButton: show }),
      
      setFloatingButtonPosition: (position) => set({ floatingButtonPosition: position }),
      
      setShowTranscript: (show) => set({ showTranscript: show }),
      
      setShowExamples: (show) => set({ showExamples: show }),
      
      setHapticFeedback: (enabled) => set({ hapticFeedback: enabled }),
      
      setPreferNative: (prefer) => set({ preferNative: prefer }),
      
      setOfflineFirst: (offline) => set({ offlineFirst: offline }),
      
      addToHistory: (entry) => set((state) => ({
        commandHistory: [
          entry,
          ...state.commandHistory.slice(0, 49), // Keep last 50
        ],
      })),
      
      clearHistory: () => set({ commandHistory: [] }),
      
      resetToDefaults: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'voice-navigation-settings',
      partialize: (state) => ({
        isEnabled: state.isEnabled,
        autoStartOnLaunch: state.autoStartOnLaunch,
        speakConfirmations: state.speakConfirmations,
        speakErrors: state.speakErrors,
        confidenceThreshold: state.confidenceThreshold,
        continuousMode: state.continuousMode,
        showFloatingButton: state.showFloatingButton,
        floatingButtonPosition: state.floatingButtonPosition,
        showTranscript: state.showTranscript,
        showExamples: state.showExamples,
        hapticFeedback: state.hapticFeedback,
        preferNative: state.preferNative,
        offlineFirst: state.offlineFirst,
        // Don't persist history to avoid storage bloat
      }),
    }
  )
);

export default useVoiceNavigationStore;
