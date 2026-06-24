import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// All 22 official Indian languages + major dialects for TTS
export const ALL_INDIAN_LANGUAGES = {
  // Primary languages (most common)
  'hi': 'hi-IN',  // Hindi
  'en': 'en-IN',  // English (India)
  'mr': 'mr-IN',  // Marathi
  'ta': 'ta-IN',  // Tamil
  'te': 'te-IN',  // Telugu
  'bn': 'bn-IN',  // Bengali
  'gu': 'gu-IN',  // Gujarati
  'kn': 'kn-IN',  // Kannada
  'ml': 'ml-IN',  // Malayalam
  'pa': 'pa-IN',  // Punjabi
  'or': 'or-IN',  // Odia
  'as': 'as-IN',  // Assamese
  'ur': 'ur-IN',  // Urdu
  
  // Additional official languages
  'mai': 'mai-IN', // Maithili
  'sa': 'sa-IN',   // Sanskrit
  'ne': 'ne-IN',   // Nepali
  'sd': 'sd-IN',   // Sindhi
  'kok': 'kok-IN', // Konkani
  'doi': 'doi-IN', // Dogri
  'mni': 'mni-IN', // Manipuri
  'sat': 'sat-IN', // Santali
  'ks': 'ks-IN',   // Kashmiri
  'bo': 'bo-IN',   // Bodo
  
  // Regional dialects
  'bh': 'bh-IN',   // Bhojpuri
  'raj': 'raj-IN', // Rajasthani
  'awa': 'awa-IN', // Awadhi
  'mag': 'mag-IN', // Magahi
  'hne': 'hne-IN', // Chhattisgarhi
  'gom': 'gom-IN', // Goan Konkani
} as const;

// Pre-installed voices (shipped with APK)
export const PREINSTALLED_VOICES = {
  'hi': 'hi-IN',
  'en': 'en-IN',
  'mr': 'mr-IN',
} as const;

// Legacy export for backward compatibility
export const SUPPORTED_LANGUAGES = ALL_INDIAN_LANGUAGES;

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
  selectedVoices: Record<string, string>;
  autoRead: boolean;
  highlightFullMessage: boolean;
}

interface TTSState {
  availableVoices: Record<string, VoiceInfo>;
  voicesLoaded: boolean;
  settings: TTSSettings;
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
          voiceMap[voice.lang] = {
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
        const targetLang = ALL_INDIAN_LANGUAGES[lang as keyof typeof ALL_INDIAN_LANGUAGES] || lang;
        
        // Check if user has a preferred voice
        const preferredVoiceName = state.settings.selectedVoices[lang];
        if (preferredVoiceName) {
          const voice = voices.find(v => v.name === preferredVoiceName);
          if (voice) return voice;
        }

        // Find any voice matching the language
        const voiceForLang = voices.find(v => v.lang === targetLang || v.lang.startsWith(lang));
        if (voiceForLang) return voiceForLang;

        // Fallback chain: Hindi -> English-IN -> any Indian voice
        const fallbackLangs = ['hi-IN', 'en-IN', 'mr-IN'];
        for (const fallbackLang of fallbackLangs) {
          const fallbackVoice = voices.find(v => v.lang === fallbackLang);
          if (fallbackVoice) {
            console.log(`🔄 [TTS] Using fallback voice: ${fallbackLang} for ${lang}`);
            return fallbackVoice;
          }
        }

        // Last resort: any Indian voice
        const anyIndianVoice = voices.find(v => v.lang.endsWith('-IN'));
        if (anyIndianVoice) return anyIndianVoice;

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
