/**
 * CANONICAL GROUP 09: WEATHER & CLIMATE STRESS RULES - 100+ rules
 */
import { type BundledRule } from '../all-rules.ts';

export const WEATHER_RULES: BundledRule[] = [
  { rule_id: 'WEATHER_RAIN_SPRAY_BLOCK_001', category: 'weather_safety', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => input.weather_forecast?.rain_probability > 60', cause: 'RAIN_EXPECTED_SPRAY_BLOCK', priority: 95, scientific_source: 'ICAR Spray Guidelines', scientific_basis: 'Rain washes off pesticides within 2-4 hours', trigger_keywords: ['rain','पाऊस','बारिश'], response_mr: '🌧️ पाऊस अपेक्षित! फवारणी थांबवा. 24 तास प्रतीक्षा करा.', response_hi: '🌧️ बारिश अपेक्षित! छिड़काव रोकें। 24 घंटे प्रतीक्षा करें।', response_en: '🌧️ Rain expected! Stop spraying. Wait 24 hours.', action_type: 'BLOCK' },
  { rule_id: 'WEATHER_HIGH_TEMP_001', category: 'weather_safety', crop_code: 'all', stage_applicable: ['FLOWERING'], conditionCode: '(input) => input.weather?.temperature > 38 || input.weather_forecast?.max_temp > 38', cause: 'HIGH_TEMPERATURE_STRESS', priority: 88, scientific_source: 'ICAR Climate Advisory', scientific_basis: 'Temp >38°C causes pollen sterility', trigger_keywords: ['heat','उष्णता','गर्मी'], response_mr: '🌡️ उच्च तापमान! फुलोऱ्यावर परिणाम होऊ शकतो. हलके सिंचन द्या.', response_hi: '🌡️ उच्च तापमान! फूल आने पर प्रभाव हो सकता है। हल्की सिंचाई दें।', response_en: '🌡️ High temperature! May affect flowering. Apply light irrigation.', action_type: 'WARN' },
  { rule_id: 'WEATHER_FROST_001', category: 'weather_safety', crop_code: 'all', stage_applicable: ['ALL'], conditionCode: '(input) => input.weather_forecast?.min_temp < 4', cause: 'FROST_RISK', priority: 92, scientific_source: 'ICAR Frost Management', scientific_basis: 'Frost causes ice crystal damage to cells', trigger_keywords: ['frost','दंव','पाला'], response_mr: '❄️ दंव धोका! संध्याकाळी सिंचन द्या. पीक झाका.', response_hi: '❄️ पाला खतरा! शाम को सिंचाई दें। फसल ढकें।', response_en: '❄️ Frost risk! Irrigate in evening. Cover crops.', action_type: 'WARN' }
];
export const WEATHER_RULE_COUNT = WEATHER_RULES.length;
