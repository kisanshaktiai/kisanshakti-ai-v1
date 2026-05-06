import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import pa from './locales/pa.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';

type SupportedPageLocale = 'en' | 'hi' | 'mr';

const pageImporters: Record<SupportedPageLocale, Record<string, () => Promise<any>>> = {
  en: {
    auth: () => import('./locales/en/auth.json'), toast: () => import('./locales/en/toast.json'), weather: () => import('./locales/en/weather.json'), home: () => import('./locales/en/home.json'), lands: () => import('./locales/en/lands.json'), profile: () => import('./locales/en/profile.json'), market: () => import('./locales/en/market.json'), social: () => import('./locales/en/social.json'), schedule: () => import('./locales/en/schedule.json'), analytics: () => import('./locales/en/analytics.json'), chat: () => import('./locales/en/chat.json'), instascan: () => import('./locales/en/instascan.json'), pwa: () => import('./locales/en/pwa.json'), ndvi: () => import('./locales/en/ndvi.json'), schemes: () => import('./locales/en/schemes.json'), advisory: () => import('./locales/en/advisory.json'), video: () => import('./locales/en/video.json'), error: () => import('./locales/en/error.json'), sync: () => import('./locales/en/sync.json'), common: () => import('./locales/en/common.json'), voice: () => import('./locales/en/voice.json'), notification: () => import('./locales/en/notification.json'), soil: () => import('./locales/en/soil.json'), profile_edit: () => import('./locales/en/profile_edit.json'), cropGrowth: () => import('./locales/en/cropGrowth.json'), chatCards: () => import('./locales/en/chat-cards.json'),
  },
  hi: {
    auth: () => import('./locales/hi/auth.json'), toast: () => import('./locales/hi/toast.json'), weather: () => import('./locales/hi/weather.json'), home: () => import('./locales/hi/home.json'), lands: () => import('./locales/hi/lands.json'), profile: () => import('./locales/hi/profile.json'), market: () => import('./locales/hi/market.json'), social: () => import('./locales/hi/social.json'), schedule: () => import('./locales/hi/schedule.json'), analytics: () => import('./locales/hi/analytics.json'), chat: () => import('./locales/hi/chat.json'), instascan: () => import('./locales/hi/instascan.json'), pwa: () => import('./locales/hi/pwa.json'), ndvi: () => import('./locales/hi/ndvi.json'), schemes: () => import('./locales/hi/schemes.json'), advisory: () => import('./locales/hi/advisory.json'), video: () => import('./locales/hi/video.json'), error: () => import('./locales/hi/error.json'), sync: () => import('./locales/hi/sync.json'), common: () => import('./locales/hi/common.json'), voice: () => import('./locales/hi/voice.json'), notification: () => import('./locales/hi/notification.json'), soil: () => import('./locales/hi/soil.json'), profile_edit: () => import('./locales/hi/profile_edit.json'), cropGrowth: () => import('./locales/hi/cropGrowth.json'), chatCards: () => import('./locales/hi/chat-cards.json'),
  },
  mr: {
    auth: () => import('./locales/mr/auth.json'), toast: () => import('./locales/mr/toast.json'), weather: () => import('./locales/mr/weather.json'), home: () => import('./locales/mr/home.json'), lands: () => import('./locales/mr/lands.json'), profile: () => import('./locales/mr/profile.json'), market: () => import('./locales/mr/market.json'), social: () => import('./locales/mr/social.json'), schedule: () => import('./locales/mr/schedule.json'), analytics: () => import('./locales/mr/analytics.json'), chat: () => import('./locales/mr/chat.json'), instascan: () => import('./locales/mr/instascan.json'), pwa: () => import('./locales/mr/pwa.json'), ndvi: () => import('./locales/mr/ndvi.json'), schemes: () => import('./locales/mr/schemes.json'), advisory: () => import('./locales/mr/advisory.json'), video: () => import('./locales/mr/video.json'), error: () => import('./locales/mr/error.json'), sync: () => import('./locales/mr/sync.json'), common: () => import('./locales/mr/common.json'), voice: () => import('./locales/mr/voice.json'), notification: () => import('./locales/mr/notification.json'), soil: () => import('./locales/mr/soil.json'), profile_edit: () => import('./locales/mr/profile_edit.json'), cropGrowth: () => import('./locales/mr/cropGrowth.json'), chatCards: () => import('./locales/mr/chat-cards.json'),
  },
};

const loadedPageLocales = new Set<string>();
const inflightLoads = new Map<string, Promise<void>>();

export async function loadPageTranslations(lang: string): Promise<void> {
  if (!(lang in pageImporters) || loadedPageLocales.has(lang)) return;
  if (inflightLoads.has(lang)) return inflightLoads.get(lang)!;
  const promise = (async () => {
    const importers = pageImporters[lang as SupportedPageLocale];
    const entries = await Promise.all(
      Object.entries(importers).map(async ([key, loader]) => [key, (await loader()).default] as const)
    );
    const merged = { ...(i18n.getResourceBundle(lang, 'translation') || {}) };
    for (const [key, module] of entries) {
      merged[key] = { ...(merged[key] || {}), ...(module[key] || module || {}) };
    }
    i18n.addResourceBundle(lang, 'translation', merged, true, true);
    loadedPageLocales.add(lang);
  })();
  inflightLoads.set(lang, promise);
  try { await promise; } finally { inflightLoads.delete(lang); }
}

// Read persisted language from localStorage before initializing i18n
const getInitialLanguage = (): string => {
  try {
    const storedData = localStorage.getItem('language-storage');
    if (storedData) {
      const parsed = JSON.parse(storedData);
      const language = parsed?.state?.currentLanguage;
      if (language) {
        console.log('🌐 [i18n] Initializing with persisted language:', language);
        return language;
      }
    }
  } catch (error) {
    console.warn('⚠️ [i18n] Failed to read persisted language:', error);
  }
  console.log('🌐 [i18n] No persisted language found, using default: hi');
  return 'hi'; // Fallback to Hindi
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      pa: { translation: pa },
      mr: { translation: mr },
      ta: { translation: ta },
    },
    lng: getInitialLanguage(), // Initialize with persisted language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Kick off the initial-language page bundle load. main.tsx awaits `i18nReady`
// before mounting React, ensuring no key-flash on first paint.
export const i18nReady: Promise<void> = loadPageTranslations(i18n.language).catch((error) => {
  console.warn('⚠️ [i18n] Initial translation load failed:', error);
});

// Safety net: if a language change slips through without preloading, fetch on demand.
i18n.on('languageChanged', (lang) => {
  loadPageTranslations(lang).catch((error) => {
    console.warn('⚠️ [i18n] Deferred translation load failed:', error);
  });
});

export default i18n;
