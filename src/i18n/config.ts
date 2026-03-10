import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import pa from './locales/pa.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
// Page-level imports
import enWeather from './locales/en/weather.json';
import hiWeather from './locales/hi/weather.json';
import mrWeather from './locales/mr/weather.json';
import enHome from './locales/en/home.json';
import hiHome from './locales/hi/home.json';
import mrHome from './locales/mr/home.json';
import enLands from './locales/en/lands.json';
import hiLands from './locales/hi/lands.json';
import mrLands from './locales/mr/lands.json';
import enProfile from './locales/en/profile.json';
import hiProfile from './locales/hi/profile.json';
import mrProfile from './locales/mr/profile.json';
import enMarket from './locales/en/market.json';
import hiMarket from './locales/hi/market.json';
import mrMarket from './locales/mr/market.json';
import enSocial from './locales/en/social.json';
import hiSocial from './locales/hi/social.json';
import mrSocial from './locales/mr/social.json';
import enSchedule from './locales/en/schedule.json';
import hiSchedule from './locales/hi/schedule.json';
import mrSchedule from './locales/mr/schedule.json';
import enAnalytics from './locales/en/analytics.json';
import hiAnalytics from './locales/hi/analytics.json';
import mrAnalytics from './locales/mr/analytics.json';
import enChat from './locales/en/chat.json';
import hiChat from './locales/hi/chat.json';
import mrChat from './locales/mr/chat.json';
import enInstascan from './locales/en/instascan.json';
import hiInstascan from './locales/hi/instascan.json';
import mrInstascan from './locales/mr/instascan.json';
import enAuth from './locales/en/auth.json';
import hiAuth from './locales/hi/auth.json';
import mrAuth from './locales/mr/auth.json';
import enToast from './locales/en/toast.json';
import hiToast from './locales/hi/toast.json';
import mrToast from './locales/mr/toast.json';
import enPwa from './locales/en/pwa.json';
import hiPwa from './locales/hi/pwa.json';
import mrPwa from './locales/mr/pwa.json';
import enNdvi from './locales/en/ndvi.json';
import hiNdvi from './locales/hi/ndvi.json';
import mrNdvi from './locales/mr/ndvi.json';
import enSchemes from './locales/en/schemes.json';
import hiSchemes from './locales/hi/schemes.json';
import mrSchemes from './locales/mr/schemes.json';
import enAdvisory from './locales/en/advisory.json';
import hiAdvisory from './locales/hi/advisory.json';
import mrAdvisory from './locales/mr/advisory.json';
import enVideo from './locales/en/video.json';
import hiVideo from './locales/hi/video.json';
import mrVideo from './locales/mr/video.json';
import enError from './locales/en/error.json';
import hiError from './locales/hi/error.json';
import mrError from './locales/mr/error.json';
import enSync from './locales/en/sync.json';
import hiSync from './locales/hi/sync.json';
import mrSync from './locales/mr/sync.json';
// New locale files
import enCommon from './locales/en/common.json';
import hiCommon from './locales/hi/common.json';
import mrCommon from './locales/mr/common.json';
import enVoice from './locales/en/voice.json';
import hiVoice from './locales/hi/voice.json';
import mrVoice from './locales/mr/voice.json';
import enNotification from './locales/en/notification.json';
import hiNotification from './locales/hi/notification.json';
import mrNotification from './locales/mr/notification.json';
import enSoil from './locales/en/soil.json';
import hiSoil from './locales/hi/soil.json';
import mrSoil from './locales/mr/soil.json';
import enProfileEdit from './locales/en/profile_edit.json';
import hiProfileEdit from './locales/hi/profile_edit.json';
import mrProfileEdit from './locales/mr/profile_edit.json';
import enCropGrowth from './locales/en/cropGrowth.json';
import hiCropGrowth from './locales/hi/cropGrowth.json';
import mrCropGrowth from './locales/mr/cropGrowth.json';
import enChatCards from './locales/en/chat-cards.json';
import hiChatCards from './locales/hi/chat-cards.json';
import mrChatCards from './locales/mr/chat-cards.json';

// Helper function to dynamically merge base and page-level translations
// This makes adding new languages in the future seamless - just add JSON files!
const mergeTranslations = (base: any, pageModules: Record<string, any>) => {
  const result = { ...base };
  for (const [key, module] of Object.entries(pageModules)) {
    result[key] = { ...(base[key] || {}), ...(module[key] || {}) };
  }
  return result;
};

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
      en: { 
        translation: mergeTranslations(en, {
          auth: enAuth,
          toast: enToast,
          weather: enWeather,
          home: enHome,
          lands: enLands,
          profile: enProfile,
          market: enMarket,
          social: enSocial,
          schedule: enSchedule,
          analytics: enAnalytics,
          chat: enChat,
          instascan: enInstascan,
          pwa: enPwa,
          ndvi: enNdvi,
          schemes: enSchemes,
          advisory: enAdvisory,
          video: enVideo,
          error: enError,
          sync: enSync,
          common: enCommon,
          voice: enVoice,
          notification: enNotification,
          soil: enSoil,
          profile_edit: enProfileEdit,
          cropGrowth: enCropGrowth,
          chatCards: enChatCards,
        })
      },
      hi: { 
        translation: mergeTranslations(hi, {
          auth: hiAuth,
          toast: hiToast,
          weather: hiWeather,
          home: hiHome,
          lands: hiLands,
          profile: hiProfile,
          market: hiMarket,
          social: hiSocial,
          schedule: hiSchedule,
          analytics: hiAnalytics,
          chat: hiChat,
          instascan: hiInstascan,
          pwa: hiPwa,
          ndvi: hiNdvi,
          schemes: hiSchemes,
          advisory: hiAdvisory,
          video: hiVideo,
          error: hiError,
          sync: hiSync,
          common: hiCommon,
          voice: hiVoice,
          notification: hiNotification,
          soil: hiSoil,
          profile_edit: hiProfileEdit,
          cropGrowth: hiCropGrowth,
          chatCards: hiChatCards,
        })
      },
      pa: { translation: pa },
      mr: { 
        translation: mergeTranslations(mr, {
          auth: mrAuth,
          toast: mrToast,
          weather: mrWeather,
          home: mrHome,
          lands: mrLands,
          profile: mrProfile,
          market: mrMarket,
          social: mrSocial,
          schedule: mrSchedule,
          analytics: mrAnalytics,
          chat: mrChat,
          instascan: mrInstascan,
          pwa: mrPwa,
          ndvi: mrNdvi,
          schemes: mrSchemes,
          advisory: mrAdvisory,
          video: mrVideo,
          error: mrError,
          sync: mrSync,
          common: mrCommon,
          voice: mrVoice,
          notification: mrNotification,
          soil: mrSoil,
          profile_edit: mrProfileEdit,
          cropGrowth: mrCropGrowth,
        })
      },
      ta: { translation: ta },
    },
    lng: getInitialLanguage(), // Initialize with persisted language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
