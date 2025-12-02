import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Language to voice ID mapping for pre-installed voices
export const PREINSTALLED_VOICES = {
  'hi': 'hi-IN', // Hindi - Primary
  'mr': 'mr-IN', // Marathi - Secondary
  'en': 'en-IN'  // English (Indian) - Tertiary
} as const;

// All supported Indian languages
export const SUPPORTED_LANGUAGES = {
  'hi': 'hi-IN',
  'mr': 'mr-IN',
  'en': 'en-IN',
  'ta': 'ta-IN',
  'te': 'te-IN',
  'kn': 'kn-IN',
  'pa': 'pa-IN',
  'gu': 'gu-IN',
  'bn': 'bn-IN',
  'ml': 'ml-IN',
  'or': 'or-IN',
  'as': 'as-IN',
  'ur': 'ur-IN'
} as const;

interface VoiceInfo {
  name: string;
  lang: string;
  isAvailable: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
  lastChecked?: number;
}

interface TTSSettings {
  speed: number;
  selectedVoices: Record<string, string>; // language -> voice name
  autoRead: boolean;
  highlightFullMessage: boolean;
}

interface TTSState {
  // Voice availability tracking
  availableVoices: Record<string, VoiceInfo>;
  voicesLoaded: boolean;
  
  // Settings
  settings: TTSSettings;
  
  // Current playback state
  currentlyPlaying: string | null;
  isPaused: boolean;
  
  // Actions
  setVoicesLoaded: (loaded: boolean) => void;
  updateVoiceAvailability: (voices: SpeechSynthesisVoice[]) => void;
  setVoiceDownloading: (lang: string, progress: number) => void;
  setVoiceAvailable: (lang: string, available: boolean) => void;
  updateSettings: (settings: Partial<TTSSettings>) => void;
  setCurrentlyPlaying: (messageId: string | null) => void;
  setPaused: (paused: boolean) => void;
  getPreferredVoiceForLanguage: (lang: string) => SpeechSynthesisVoice | null;
}

export const useTTSStore = create<TTSState>()(
  persist(
    (set, get) => ({
      availableVoices: {},
      voicesLoaded: false,
      settings: {
        speed: 1.0,
        selectedVoices: {},
        autoRead: false,
        highlightFullMessage: false
      },
      currentlyPlaying: null,
      isPaused: false,

      setVoicesLoaded: (loaded) => set({ voicesLoaded: loaded }),

      updateVoiceAvailability: (voices) => {
        const voiceMap: Record<string, VoiceInfo> = {};
        
        voices.forEach(voice => {
          const lang = voice.lang;
          voiceMap[lang] = {
            name: voice.name,
            lang: voice.lang,
            isAvailable: true,
            lastChecked: Date.now()
          };
        });

        set({ availableVoices: voiceMap, voicesLoaded: true });
        console.log('📢 [TTS] Voice availability updated:', Object.keys(voiceMap).length, 'voices found');
      },

      setVoiceDownloading: (lang, progress) => {
        set(state => ({
          availableVoices: {
            ...state.availableVoices,
            [lang]: {
              ...state.availableVoices[lang],
              isDownloading: true,
              downloadProgress: progress
            }
          }
        }));
      },

      setVoiceAvailable: (lang, available) => {
        set(state => ({
          availableVoices: {
            ...state.availableVoices,
            [lang]: {
              ...state.availableVoices[lang],
              isAvailable: available,
              isDownloading: false,
              downloadProgress: undefined
            }
          }
        }));
      },

      updateSettings: (newSettings) => {
        set(state => ({
          settings: { ...state.settings, ...newSettings }
        }));
      },

      setCurrentlyPlaying: (messageId) => set({ currentlyPlaying: messageId, isPaused: false }),
      
      setPaused: (paused) => set({ isPaused: paused }),

      getPreferredVoiceForLanguage: (lang: string) => {
        const state = get();
        const voices = window.speechSynthesis?.getVoices() || [];
        const targetLang = SUPPORTED_LANGUAGES[lang as keyof typeof SUPPORTED_LANGUAGES] || lang;
        
        // Check if user has a preferred voice for this language
        const preferredVoiceName = state.settings.selectedVoices[lang];
        if (preferredVoiceName) {
          const voice = voices.find(v => v.name === preferredVoiceName);
          if (voice) return voice;
        }

        // Find any voice matching the language
        const voiceForLang = voices.find(v => v.lang === targetLang || v.lang.startsWith(lang));
        if (voiceForLang) return voiceForLang;

        // Fallback chain: Hindi -> Marathi -> English-IN -> any Indian voice
        const fallbackLangs = ['hi-IN', 'mr-IN', 'en-IN'];
        for (const fallbackLang of fallbackLangs) {
          const fallbackVoice = voices.find(v => v.lang === fallbackLang);
          if (fallbackVoice) {
            console.log(`🔄 [TTS] Using fallback voice: ${fallbackLang} for ${lang}`);
            return fallbackVoice;
          }
        }

        // Last resort: any Indian voice (ending with -IN)
        const anyIndianVoice = voices.find(v => v.lang.endsWith('-IN'));
        if (anyIndianVoice) {
          console.log(`🔄 [TTS] Using any Indian voice: ${anyIndianVoice.lang} for ${lang}`);
          return anyIndianVoice;
        }

        return voices[0] || null;
      }
    }),
    {
      name: 'tts-storage',
      partialize: (state) => ({
        settings: state.settings,
        availableVoices: state.availableVoices
      })
    }
  )
);
