import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '@/i18n/config';

interface LanguageState {
  currentLanguage: string;
  availableLanguages: Array<{
    code: string;
    name: string;
    nativeName: string;
  }>;
  
  // Actions
  setLanguage: (language: string) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      currentLanguage: 'hi',
      availableLanguages: [
        { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
        { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
        { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
        { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
        { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
        { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
        { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
        { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
        { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
        { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
        { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
        { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्' },
      ],

      setLanguage: (language) => {
        set({ currentLanguage: language });
        i18n.changeLanguage(language);
      },

      toggleLanguage: () => {
        const { currentLanguage, availableLanguages, setLanguage } = get();
        const currentIndex = availableLanguages.findIndex(l => l.code === currentLanguage);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        setLanguage(availableLanguages[nextIndex].code);
      },
    }),
    {
      name: 'language-storage',
    }
  )
);