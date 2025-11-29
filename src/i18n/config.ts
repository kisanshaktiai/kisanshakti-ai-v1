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

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { 
        translation: { 
          ...en, 
          ...enWeather.weather, 
          ...enHome.home, 
          ...enLands.lands, 
          ...enProfile.profile,
          ...enMarket.market,
          ...enSocial.social,
          ...enSchedule.schedule,
          ...enAnalytics.analytics,
          ...enChat.chat,
          ...enInstascan.instascan,
          ...enAuth.auth,
          ...enToast.toast,
          ...enPwa.pwa,
          ...enNdvi.ndvi,
          ...enSchemes.schemes,
          ...enAdvisory.advisory,
          ...enVideo.video,
          ...enError.error,
          ...enSync.sync
        } 
      },
      hi: { 
        translation: { 
          ...hi, 
          ...hiWeather.weather, 
          ...hiHome.home, 
          ...hiLands.lands, 
          ...hiProfile.profile,
          ...hiMarket.market,
          ...hiSocial.social,
          ...hiSchedule.schedule,
          ...hiAnalytics.analytics,
          ...hiChat.chat,
          ...hiInstascan.instascan,
          ...hiAuth.auth,
          ...hiToast.toast,
          ...hiPwa.pwa,
          ...hiNdvi.ndvi,
          ...hiSchemes.schemes,
          ...hiAdvisory.advisory,
          ...hiVideo.video,
          ...hiError.error,
          ...hiSync.sync
        } 
      },
      pa: { translation: pa },
      mr: { 
        translation: { 
          ...mr, 
          ...mrWeather.weather, 
          ...mrHome.home, 
          ...mrLands.lands, 
          ...mrProfile.profile,
          ...mrMarket.market,
          ...mrSocial.social,
          ...mrSchedule.schedule,
          ...mrAnalytics.analytics,
          ...mrChat.chat,
          ...mrInstascan.instascan,
          ...mrAuth.auth,
          ...mrToast.toast,
          ...mrPwa.pwa,
          ...mrNdvi.ndvi,
          ...mrSchemes.schemes,
          ...mrAdvisory.advisory,
          ...mrVideo.video,
          ...mrError.error,
          ...mrSync.sync
        } 
      },
      ta: { translation: ta },
    },
    lng: 'hi', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;