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
          ...enProfile.profile 
        } 
      },
      hi: { 
        translation: { 
          ...hi, 
          ...hiWeather.weather, 
          ...hiHome.home, 
          ...hiLands.lands, 
          ...hiProfile.profile 
        } 
      },
      pa: { translation: pa },
      mr: { 
        translation: { 
          ...mr, 
          ...mrWeather.weather, 
          ...mrHome.home, 
          ...mrLands.lands, 
          ...mrProfile.profile 
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