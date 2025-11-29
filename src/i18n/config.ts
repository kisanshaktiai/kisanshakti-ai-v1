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

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, ...enWeather.weather } },
      hi: { translation: { ...hi, ...hiWeather.weather } },
      pa: { translation: pa },
      mr: { translation: { ...mr, ...mrWeather.weather } },
      ta: { translation: ta },
    },
    lng: 'hi', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;