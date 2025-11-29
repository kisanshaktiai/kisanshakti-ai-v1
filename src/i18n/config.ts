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
          ...enInstascan.instascan
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
          ...hiInstascan.instascan
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
          ...mrInstascan.instascan
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