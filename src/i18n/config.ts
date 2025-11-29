import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import pa from './locales/pa.json';
import mr from './locales/mr.json';
import ta from './locales/ta.json';
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
        translation: { 
          ...en,
          // Merge base and page-level namespaces (with fallbacks)
          auth: { ...((en as any).auth || {}), ...enAuth.auth },
          toast: enToast.toast,
          weather: enWeather.weather,
          home: { ...((en as any).home || {}), ...enHome.home },
          lands: enLands.lands,
          profile: enProfile.profile,
          market: enMarket.market,
          social: enSocial.social,
          schedule: enSchedule.schedule,
          analytics: enAnalytics.analytics,
          chat: enChat.chat,
          instascan: enInstascan.instascan,
          pwa: enPwa.pwa,
          ndvi: enNdvi.ndvi,
          schemes: enSchemes.schemes,
          advisory: enAdvisory.advisory,
          video: enVideo.video,
          error: enError.error,
          sync: enSync.sync,
        } 
      },
      hi: { 
        translation: { 
          ...hi,
          // Merge base and page-level namespaces (with fallbacks)
          auth: { ...((hi as any).auth || {}), ...hiAuth.auth },
          toast: hiToast.toast,
          weather: hiWeather.weather,
          home: { ...((hi as any).home || {}), ...hiHome.home },
          lands: hiLands.lands,
          profile: hiProfile.profile,
          market: hiMarket.market,
          social: hiSocial.social,
          schedule: hiSchedule.schedule,
          analytics: hiAnalytics.analytics,
          chat: hiChat.chat,
          instascan: hiInstascan.instascan,
          pwa: hiPwa.pwa,
          ndvi: hiNdvi.ndvi,
          schemes: hiSchemes.schemes,
          advisory: hiAdvisory.advisory,
          video: hiVideo.video,
          error: hiError.error,
          sync: hiSync.sync,
        } 
      },
      pa: { translation: pa },
      mr: { 
        translation: { 
          ...mr,
          // Merge base and page-level namespaces (with fallbacks)
          auth: { ...((mr as any).auth || {}), ...mrAuth.auth },
          toast: mrToast.toast,
          weather: mrWeather.weather,
          home: { ...((mr as any).home || {}), ...mrHome.home },
          lands: mrLands.lands,
          profile: mrProfile.profile,
          market: mrMarket.market,
          social: mrSocial.social,
          schedule: mrSchedule.schedule,
          analytics: mrAnalytics.analytics,
          chat: mrChat.chat,
          instascan: mrInstascan.instascan,
          pwa: mrPwa.pwa,
          ndvi: mrNdvi.ndvi,
          schemes: mrSchemes.schemes,
          advisory: mrAdvisory.advisory,
          video: mrVideo.video,
          error: mrError.error,
          sync: mrSync.sync,
        } 
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