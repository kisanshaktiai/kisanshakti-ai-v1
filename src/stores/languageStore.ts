import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n, { loadPageTranslations } from '@/i18n/config';
import { supabase } from '@/integrations/supabase/client';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  displayOrder?: number;
}

interface LanguageState {
  currentLanguage: string;
  availableLanguages: Language[];
  isLoading: boolean;
  
  // Actions
  setLanguage: (language: string) => void;
  toggleLanguage: () => void;
  fetchLanguages: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      currentLanguage: 'hi',
      availableLanguages: [
        { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', displayOrder: 1 },
        { code: 'en', name: 'English', nativeName: 'English', displayOrder: 2 },
        { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', displayOrder: 3 },
        { code: 'mr', name: 'Marathi', nativeName: 'मराठी', displayOrder: 4 },
        { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', displayOrder: 5 },
        { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', displayOrder: 6 },
        { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', displayOrder: 7 },
        { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', displayOrder: 8 },
        { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', displayOrder: 9 },
        { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', displayOrder: 10 },
        { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', displayOrder: 11 },
        { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', displayOrder: 12 },
        { code: 'ur', name: 'Urdu', nativeName: 'اردو', displayOrder: 13 },
        { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', displayOrder: 14 },
      ],
      isLoading: false,

      setLanguage: (language) => {
        console.log('🌐 [Language] Changing language to:', language);

        // Preload the target language's page bundles BEFORE switching i18n,
        // so React never re-renders with missing keys (the "key flash" bug).
        loadPageTranslations(language)
          .catch((err) => console.warn('⚠️ [Language] Page bundle preload failed:', err))
          .finally(() => {
            set({ currentLanguage: language });
            i18n.changeLanguage(language).then(() => {
              console.log('✅ [Language] i18n language changed successfully');
              if (typeof window !== 'undefined') {
                import('@/hooks/use-toast').then(({ toast }) => {
                  const languageName = get().availableLanguages.find(l => l.code === language)?.nativeName || language;
                  toast({
                    title: i18n.t('toast.language_changed') || 'Language Changed',
                    description: i18n.t('toast.language_changed_to', { language: languageName }) || `Language changed to ${languageName}`,
                  });
                }).catch(() => {
                  console.log('⚠️ [Language] Toast notification unavailable');
                });
              }
            }).catch((error) => {
              console.error('❌ [Language] Failed to change i18n language:', error);
            });
          });
      },

      toggleLanguage: () => {
        const { currentLanguage, availableLanguages, setLanguage } = get();
        const currentIndex = availableLanguages.findIndex(l => l.code === currentLanguage);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        setLanguage(availableLanguages[nextIndex].code);
      },

      fetchLanguages: async () => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase
            .from('master_languages')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

          if (data && !error) {
            const languages = data.map(lang => ({
              code: lang.code,
              name: lang.name,
              nativeName: lang.native_name,
              displayOrder: lang.display_order
            }));
            set({ availableLanguages: languages, isLoading: false });
          } else {
            // Use fallback languages if fetch fails
            set({ isLoading: false });
          }
        } catch (error) {
          console.error('Error fetching languages:', error);
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'language-storage',
    }
  )
);