import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from '../_shared/aiConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

// ============================================================================
// CROP-CLIMATE SUITABILITY DATABASE
// Based on India's 15 Agro-Climatic Zones and ICAR guidelines
// Enhanced with rainfall zones and photoperiod requirements
// ============================================================================
const cropSuitability: Record<string, {
  optimalTemp: [number, number];
  rainfall: [number, number];
  soilTypes: string[];
  bestStates: string[];
  unsuitableStates: string[];
  photoperiod: 'short' | 'long' | 'neutral';
  season: string[];
  riskFactors: string[];
  daysToMaturity: [number, number];
  waterRequirementMM: number;
  criticalStages: string[];
}> = {
  'Wheat': {
    optimalTemp: [15, 25],
    rainfall: [400, 1100],
    soilTypes: ['loamy', 'clay loam', 'alluvial', 'black'],
    bestStates: ['Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh', 'Rajasthan', 'Bihar'],
    unsuitableStates: ['Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Goa'],
    photoperiod: 'long',
    season: ['Rabi'],
    riskFactors: ['high humidity', 'waterlogging', 'heat waves at grain filling', 'rust disease'],
    daysToMaturity: [110, 140],
    waterRequirementMM: 450,
    criticalStages: ['CRI (21 days)', 'Tillering (35 days)', 'Jointing (65 days)', 'Flowering (85 days)', 'Grain filling (100 days)']
  },
  'Rice': {
    optimalTemp: [20, 35],
    rainfall: [1000, 2500],
    soilTypes: ['clay', 'clay loam', 'alluvial', 'laterite'],
    bestStates: ['West Bengal', 'Uttar Pradesh', 'Punjab', 'Bihar', 'Odisha', 'Andhra Pradesh', 'Tamil Nadu', 'Chhattisgarh'],
    unsuitableStates: ['Rajasthan', 'Gujarat'],
    photoperiod: 'short',
    season: ['Kharif', 'Rabi'],
    riskFactors: ['drought at flowering', 'flooding', 'cold snap', 'blast disease', 'BPH'],
    daysToMaturity: [90, 160],
    waterRequirementMM: 1200,
    criticalStages: ['Transplanting', 'Tillering (25 days)', 'Panicle initiation (45 days)', 'Flowering (70 days)', 'Grain filling (90 days)']
  },
  'Cotton': {
    optimalTemp: [21, 35],
    rainfall: [500, 1200],
    soilTypes: ['black', 'alluvial', 'sandy loam'],
    bestStates: ['Gujarat', 'Maharashtra', 'Telangana', 'Andhra Pradesh', 'Punjab', 'Haryana', 'Rajasthan', 'Madhya Pradesh'],
    unsuitableStates: ['Kerala', 'Assam', 'Himachal Pradesh', 'Uttarakhand'],
    photoperiod: 'neutral',
    season: ['Kharif'],
    riskFactors: ['heavy rainfall at boll opening', 'pink bollworm', 'whitefly', 'sucking pests'],
    daysToMaturity: [150, 210],
    waterRequirementMM: 700,
    criticalStages: ['Germination', 'Square formation (35 days)', 'Flowering (50 days)', 'Boll development (80 days)', 'Boll opening (120 days)']
  },
  'Maize': {
    optimalTemp: [18, 32],
    rainfall: [500, 1000],
    soilTypes: ['loamy', 'sandy loam', 'alluvial'],
    bestStates: ['Karnataka', 'Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Bihar', 'Uttar Pradesh', 'Andhra Pradesh'],
    unsuitableStates: [],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi', 'Zaid'],
    riskFactors: ['waterlogging', 'fall armyworm', 'stem borer', 'drought at tasseling'],
    daysToMaturity: [80, 120],
    waterRequirementMM: 500,
    criticalStages: ['Germination', 'V6 stage (25 days)', 'Tasseling (50 days)', 'Silking (55 days)', 'Grain filling (80 days)']
  },
  'Sugarcane': {
    optimalTemp: [20, 35],
    rainfall: [1000, 2500],
    soilTypes: ['loamy', 'clay loam', 'alluvial'],
    bestStates: ['Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Gujarat', 'Andhra Pradesh', 'Bihar'],
    unsuitableStates: ['Himachal Pradesh', 'Uttarakhand', 'Jammu Kashmir'],
    photoperiod: 'neutral',
    season: ['Annual'],
    riskFactors: ['frost', 'waterlogging', 'red rot', 'top borer', 'pyrilla'],
    daysToMaturity: [300, 420],
    waterRequirementMM: 2000,
    criticalStages: ['Germination (30 days)', 'Tillering (90 days)', 'Grand growth (150 days)', 'Maturation (300 days)']
  },
  'Soybean': {
    optimalTemp: [20, 30],
    rainfall: [600, 1000],
    soilTypes: ['black', 'loamy', 'clay loam'],
    bestStates: ['Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Karnataka'],
    unsuitableStates: ['Punjab', 'Haryana', 'West Bengal', 'Kerala'],
    photoperiod: 'short',
    season: ['Kharif'],
    riskFactors: ['waterlogging', 'rust', 'pod borer', 'yellow mosaic'],
    daysToMaturity: [85, 120],
    waterRequirementMM: 450,
    criticalStages: ['Germination', 'V3 stage (20 days)', 'Flowering (40 days)', 'Pod filling (65 days)', 'Maturity (90 days)']
  },
  'Groundnut': {
    optimalTemp: [25, 35],
    rainfall: [500, 1000],
    soilTypes: ['sandy loam', 'red', 'alluvial'],
    bestStates: ['Gujarat', 'Andhra Pradesh', 'Tamil Nadu', 'Karnataka', 'Rajasthan'],
    unsuitableStates: ['Kerala', 'Assam', 'West Bengal'],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi'],
    riskFactors: ['heavy rainfall at harvest', 'aflatoxin', 'tikka disease', 'collar rot'],
    daysToMaturity: [100, 130],
    waterRequirementMM: 500,
    criticalStages: ['Germination', 'Flowering (30 days)', 'Pegging (45 days)', 'Pod development (75 days)', 'Maturity (110 days)']
  },
  'Tomato': {
    optimalTemp: [18, 30],
    rainfall: [400, 600],
    soilTypes: ['sandy loam', 'loamy', 'red'],
    bestStates: ['Maharashtra', 'Karnataka', 'Madhya Pradesh', 'Andhra Pradesh', 'Gujarat', 'Odisha'],
    unsuitableStates: [],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi', 'Zaid'],
    riskFactors: ['high humidity', 'early blight', 'late blight', 'fruit borer', 'leaf curl virus'],
    daysToMaturity: [90, 120],
    waterRequirementMM: 500,
    criticalStages: ['Transplanting', 'Vegetative (30 days)', 'Flowering (45 days)', 'Fruit setting (60 days)', 'Harvesting (90+ days)']
  },
  'Onion': {
    optimalTemp: [13, 28],
    rainfall: [350, 550],
    soilTypes: ['sandy loam', 'loamy', 'alluvial'],
    bestStates: ['Maharashtra', 'Karnataka', 'Gujarat', 'Madhya Pradesh', 'Bihar', 'Rajasthan'],
    unsuitableStates: ['Kerala', 'Assam'],
    photoperiod: 'long',
    season: ['Rabi', 'Kharif'],
    riskFactors: ['waterlogging', 'purple blotch', 'thrips', 'stemphylium blight'],
    daysToMaturity: [120, 150],
    waterRequirementMM: 450,
    criticalStages: ['Transplanting', 'Vegetative (45 days)', 'Bulb initiation (75 days)', 'Bulb development (100 days)', 'Maturity (130 days)']
  },
  'Potato': {
    optimalTemp: [15, 25],
    rainfall: [500, 750],
    soilTypes: ['sandy loam', 'loamy', 'alluvial'],
    bestStates: ['Uttar Pradesh', 'West Bengal', 'Bihar', 'Gujarat', 'Punjab', 'Madhya Pradesh'],
    unsuitableStates: ['Kerala', 'Tamil Nadu', 'Andhra Pradesh'],
    photoperiod: 'short',
    season: ['Rabi'],
    riskFactors: ['frost', 'late blight', 'heat stress', 'viral diseases'],
    daysToMaturity: [80, 120],
    waterRequirementMM: 500,
    criticalStages: ['Germination (15 days)', 'Vegetative (30 days)', 'Tuber initiation (45 days)', 'Tuber bulking (70 days)', 'Maturity (90 days)']
  },
  'Turmeric': {
    optimalTemp: [20, 30],
    rainfall: [1500, 2500],
    soilTypes: ['clay loam', 'red', 'alluvial'],
    bestStates: ['Telangana', 'Andhra Pradesh', 'Maharashtra', 'Tamil Nadu', 'Karnataka', 'Odisha'],
    unsuitableStates: ['Punjab', 'Haryana', 'Rajasthan'],
    photoperiod: 'neutral',
    season: ['Kharif'],
    riskFactors: ['waterlogging', 'rhizome rot', 'leaf spot', 'shoot borer'],
    daysToMaturity: [240, 300],
    waterRequirementMM: 1500,
    criticalStages: ['Germination (30 days)', 'Vegetative (90 days)', 'Rhizome development (180 days)', 'Maturity (270 days)']
  },
  'Chilli': {
    optimalTemp: [20, 30],
    rainfall: [600, 1200],
    soilTypes: ['loamy', 'sandy loam', 'black'],
    bestStates: ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Maharashtra', 'Madhya Pradesh'],
    unsuitableStates: [],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi'],
    riskFactors: ['anthracnose', 'leaf curl', 'thrips', 'mites', 'fruit rot'],
    daysToMaturity: [120, 180],
    waterRequirementMM: 600,
    criticalStages: ['Transplanting', 'Vegetative (30 days)', 'Flowering (60 days)', 'Fruit setting (90 days)', 'Harvesting (120+ days)']
  },
  'Gram': {
    optimalTemp: [10, 25],
    rainfall: [300, 600],
    soilTypes: ['loamy', 'clay loam', 'black'],
    bestStates: ['Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Uttar Pradesh', 'Karnataka'],
    unsuitableStates: ['Kerala', 'Assam', 'West Bengal'],
    photoperiod: 'long',
    season: ['Rabi'],
    riskFactors: ['pod borer', 'wilt', 'root rot', 'frost'],
    daysToMaturity: [95, 130],
    waterRequirementMM: 350,
    criticalStages: ['Germination', 'Vegetative (30 days)', 'Flowering (50 days)', 'Pod filling (75 days)', 'Maturity (100 days)']
  },
  'Mustard': {
    optimalTemp: [10, 25],
    rainfall: [250, 500],
    soilTypes: ['loamy', 'sandy loam', 'alluvial'],
    bestStates: ['Rajasthan', 'Uttar Pradesh', 'Haryana', 'Madhya Pradesh', 'Gujarat'],
    unsuitableStates: ['Kerala', 'Tamil Nadu', 'Karnataka'],
    photoperiod: 'long',
    season: ['Rabi'],
    riskFactors: ['aphids', 'white rust', 'alternaria blight', 'frost'],
    daysToMaturity: [100, 140],
    waterRequirementMM: 300,
    criticalStages: ['Germination', 'Rosette (25 days)', 'Flowering (50 days)', 'Silique development (80 days)', 'Maturity (110 days)']
  },
  'Banana': {
    optimalTemp: [20, 35],
    rainfall: [1500, 2500],
    soilTypes: ['loamy', 'clay loam', 'alluvial'],
    bestStates: ['Tamil Nadu', 'Maharashtra', 'Gujarat', 'Andhra Pradesh', 'Karnataka', 'Kerala'],
    unsuitableStates: ['Punjab', 'Haryana', 'Rajasthan'],
    photoperiod: 'neutral',
    season: ['Annual'],
    riskFactors: ['panama disease', 'sigatoka', 'bunchy top', 'pseudostem weevil'],
    daysToMaturity: [300, 420],
    waterRequirementMM: 2000,
    criticalStages: ['Planting', 'Vegetative (150 days)', 'Flowering (240 days)', 'Bunch development (300 days)', 'Harvest (360 days)']
  }
};

// ============================================================================
// COMPREHENSIVE CROP NAME TRANSLATIONS
// Maps English crop names to regional languages to prevent AI mistranslation
// ============================================================================
const cropNameTranslations: Record<string, Record<string, string>> = {
  'Sugarcane': { en: 'Sugarcane', hi: 'गन्ना', mr: 'ऊस', pa: 'ਗੰਨਾ', ta: 'கரும்பு', te: 'చెరకు', gu: 'શેરડી', kn: 'ಕಬ್ಬು', bn: 'আখ' },
  'Rice': { en: 'Rice', hi: 'धान', mr: 'भात/तांदूळ', pa: 'ਝੋਨਾ', ta: 'நெல்', te: 'వరి', gu: 'ડાંગર', kn: 'ಭತ್ತ', bn: 'ধান' },
  'Wheat': { en: 'Wheat', hi: 'गेहूं', mr: 'गहू', pa: 'ਕਣਕ', ta: 'கோதுமை', te: 'గోధుమ', gu: 'ઘઉં', kn: 'ಗೋಧಿ', bn: 'গম' },
  'Cotton': { en: 'Cotton', hi: 'कपास', mr: 'कापूस', pa: 'ਕਪਾਹ', ta: 'பருத்தி', te: 'పత్తి', gu: 'કપાસ', kn: 'ಹತ್ತಿ', bn: 'তুলা' },
  'Maize': { en: 'Maize', hi: 'मक्का', mr: 'मका', pa: 'ਮੱਕੀ', ta: 'மக்காச்சோளம்', te: 'మొక్కజొన్న', gu: 'મકાઈ', kn: 'ಮೆಕ್ಕೆಜೋಳ', bn: 'ভুট্টা' },
  'Soybean': { en: 'Soybean', hi: 'सोयाबीन', mr: 'सोयाबीन', pa: 'ਸੋਇਆਬੀਨ', ta: 'சோயாபீன்', te: 'సోయాబీన్', gu: 'સોયાબીન', kn: 'ಸೋಯಾಬೀನ್', bn: 'সয়াবিন' },
  'Groundnut': { en: 'Groundnut', hi: 'मूंगफली', mr: 'भुईमूग/शेंगदाणा', pa: 'ਮੂੰਗਫਲੀ', ta: 'நிலக்கடலை', te: 'వేరుశనగ', gu: 'મગફળી', kn: 'ಕಡಲೆಕಾಯಿ', bn: 'চিনাবাদাম' },
  'Tomato': { en: 'Tomato', hi: 'टमाटर', mr: 'टोमॅटो', pa: 'ਟਮਾਟਰ', ta: 'தக்காளி', te: 'టమాటా', gu: 'ટામેટું', kn: 'ಟೊಮೆಟೊ', bn: 'টমেটো' },
  'Onion': { en: 'Onion', hi: 'प्याज', mr: 'कांदा', pa: 'ਪਿਆਜ਼', ta: 'வெங்காயம்', te: 'ఉల్లిపాయ', gu: 'ડુંગળી', kn: 'ಈರುಳ್ಳಿ', bn: 'পেঁয়াজ' },
  'Potato': { en: 'Potato', hi: 'आलू', mr: 'बटाटा', pa: 'ਆਲੂ', ta: 'உருளைக்கிழங்கு', te: 'బంగాళాదుంప', gu: 'બટાટા', kn: 'ಆಲೂಗಡ್ಡೆ', bn: 'আলু' },
  'Turmeric': { en: 'Turmeric', hi: 'हल्दी', mr: 'हळद', pa: 'ਹਲਦੀ', ta: 'மஞ்சள்', te: 'పసుపు', gu: 'હળદર', kn: 'ಅರಿಶಿನ', bn: 'হলুদ' },
  'Chilli': { en: 'Chilli', hi: 'मिर्च', mr: 'मिरची', pa: 'ਮਿਰਚ', ta: 'மிளகாய்', te: 'మిర్చి', gu: 'મરચું', kn: 'ಮೆಣಸಿನಕಾಯಿ', bn: 'মরিচ' },
  'Gram': { en: 'Gram/Chickpea', hi: 'चना', mr: 'हरभरा', pa: 'ਛੋਲੇ', ta: 'கொண்டைக்கடலை', te: 'శనగలు', gu: 'ચણા', kn: 'ಕಡಲೆ', bn: 'ছোলা' },
  'Mustard': { en: 'Mustard', hi: 'सरसों', mr: 'मोहरी', pa: 'ਸਰ੍ਹੋਂ', ta: 'கடுகு', te: 'ఆవాలు', gu: 'રાઈ', kn: 'ಸಾಸಿವೆ', bn: 'সরিষা' },
  'Banana': { en: 'Banana', hi: 'केला', mr: 'केळी', pa: 'ਕੇਲਾ', ta: 'வாழை', te: 'అరటి', gu: 'કેળા', kn: 'ಬಾಳೆ', bn: 'কলা' },
  'Mango': { en: 'Mango', hi: 'आम', mr: 'आंबा', pa: 'ਅੰਬ', ta: 'மாம்பழம்', te: 'మామిడి', gu: 'કેરી', kn: 'ಮಾವು', bn: 'আম' },
  'Bajra': { en: 'Pearl Millet/Bajra', hi: 'बाजरा', mr: 'बाजरी', pa: 'ਬਾਜਰਾ', ta: 'கம்பு', te: 'సజ్జ', gu: 'બાજરી', kn: 'ಸಜ್ಜೆ', bn: 'বাজরা' },
  'Jowar': { en: 'Sorghum/Jowar', hi: 'ज्वार', mr: 'ज्वारी', pa: 'ਜਵਾਰ', ta: 'சோளம்', te: 'జొన్న', gu: 'જુવાર', kn: 'ಜೋಳ', bn: 'জোয়ার' },
  'Ragi': { en: 'Finger Millet/Ragi', hi: 'रागी/मंडुआ', mr: 'नाचणी', pa: 'ਰਾਗੀ', ta: 'ராகி', te: 'రాగి', gu: 'નાગલી', kn: 'ರಾಗಿ', bn: 'মাদুয়া' },
  'Sunflower': { en: 'Sunflower', hi: 'सूरजमुखी', mr: 'सूर्यफूल', pa: 'ਸੂਰਜਮੁਖੀ', ta: 'சூரியகாந்தி', te: 'పొద్దుతిరుగుడు', gu: 'સૂર્યમુખી', kn: 'ಸೂರ್ಯಕಾಂತಿ', bn: 'সূর্যমুখী' },
  'Sesame': { en: 'Sesame', hi: 'तिल', mr: 'तीळ', pa: 'ਤਿਲ', ta: 'எள்ளு', te: 'నువ్వులు', gu: 'તલ', kn: 'ಎಳ್ಳು', bn: 'তিল' },
  'Cumin': { en: 'Cumin', hi: 'जीरा', mr: 'जिरे', pa: 'ਜੀਰਾ', ta: 'சீரகம்', te: 'జీలకర్ర', gu: 'જીરું', kn: 'ಜೀರಿಗೆ', bn: 'জিরা' },
  'Coriander': { en: 'Coriander', hi: 'धनिया', mr: 'कोथिंबीर', pa: 'ਧਨੀਆ', ta: 'கொத்தமல்லி', te: 'కొత్తిమీర', gu: 'ધાણા', kn: 'ಕೊತ್ತಂಬರಿ', bn: 'ধনে' },
  'Fenugreek': { en: 'Fenugreek', hi: 'मेथी', mr: 'मेथी', pa: 'ਮੇਥੀ', ta: 'வெந்தயம்', te: 'మెంతులు', gu: 'મેથી', kn: 'ಮೆಂತೆ', bn: 'মেথি' },
  'Ginger': { en: 'Ginger', hi: 'अदरक', mr: 'आले', pa: 'ਅਦਰਕ', ta: 'இஞ்சி', te: 'అల్లం', gu: 'આદું', kn: 'ಶುಂಠಿ', bn: 'আদা' },
  'Garlic': { en: 'Garlic', hi: 'लहसुन', mr: 'लसूण', pa: 'ਲਸਣ', ta: 'பூண்டு', te: 'వెల్లుల్లి', gu: 'લસણ', kn: 'ಬೆಳ್ಳುಳ್ಳಿ', bn: 'রসুন' },
  'Cabbage': { en: 'Cabbage', hi: 'पत्तागोभी', mr: 'कोबी', pa: 'ਗੋਭੀ', ta: 'முட்டைக்கோஸ்', te: 'క్యాబేజీ', gu: 'કોબી', kn: 'ಎಲೆಕೋಸು', bn: 'বাঁধাকপি' },
  'Cauliflower': { en: 'Cauliflower', hi: 'फूलगोभी', mr: 'फ्लॉवर', pa: 'ਫੁੱਲਗੋਭੀ', ta: 'காலிஃப்ளவர்', te: 'క్యాలీఫ్లవర్', gu: 'ફૂલકોબી', kn: 'ಹೂಕೋಸು', bn: 'ফুলকপি' },
  'Brinjal': { en: 'Brinjal/Eggplant', hi: 'बैंगन', mr: 'वांगी', pa: 'ਬੈਂਗਣ', ta: 'கத்திரிக்காய்', te: 'వంకాయ', gu: 'રીંગણ', kn: 'ಬದನೆಕಾಯಿ', bn: 'বেগুন' },
  'Okra': { en: 'Okra/Lady Finger', hi: 'भिंडी', mr: 'भेंडी', pa: 'ਭਿੰਡੀ', ta: 'வெண்டைக்காய்', te: 'బెండకాయ', gu: 'ભીંડા', kn: 'ಬೆಂಡೆಕಾಯಿ', bn: 'ভেন্ডি' },
  'Pea': { en: 'Pea', hi: 'मटर', mr: 'वाटाणे', pa: 'ਮਟਰ', ta: 'பட்டாணி', te: 'బఠానీ', gu: 'વટાણા', kn: 'ಬಟಾಣಿ', bn: 'মটর' },
  'Lentil': { en: 'Lentil', hi: 'मसूर', mr: 'मसूर', pa: 'ਮਸੂਰ', ta: 'பருப்பு', te: 'మసూర్', gu: 'મસૂર', kn: 'ಮಸೂರ', bn: 'মসুর' },
  'Pigeon Pea': { en: 'Pigeon Pea/Tur', hi: 'अरहर/तूर', mr: 'तूर', pa: 'ਅਰਹਰ', ta: 'துவரை', te: 'కందులు', gu: 'તુવેર', kn: 'ತೊಗರಿ', bn: 'অড়হর' },
  'Black Gram': { en: 'Black Gram/Urad', hi: 'उड़द', mr: 'उडीद', pa: 'ਮਾਂਹ', ta: 'உளுந்து', te: 'మినుములు', gu: 'અડદ', kn: 'ಉದ್ದು', bn: 'মাসকলাই' },
  'Green Gram': { en: 'Green Gram/Moong', hi: 'मूंग', mr: 'मूग', pa: 'ਮੂੰਗ', ta: 'பாசிப்பயறு', te: 'పెసలు', gu: 'મગ', kn: 'ಹೆಸರು', bn: 'মুগ' },
  'Coconut': { en: 'Coconut', hi: 'नारियल', mr: 'नारळ', pa: 'ਨਾਰੀਅਲ', ta: 'தேங்காய்', te: 'కొబ్బరి', gu: 'નાળિયેર', kn: 'ತೆಂಗಿನಕಾಯಿ', bn: 'নারকেল' },
  'Papaya': { en: 'Papaya', hi: 'पपीता', mr: 'पपई', pa: 'ਪਪੀਤਾ', ta: 'பப்பாளி', te: 'బొప్పాయి', gu: 'પપૈયું', kn: 'ಪರಂಗಿ', bn: 'পেঁপে' },
  'Guava': { en: 'Guava', hi: 'अमरूद', mr: 'पेरू', pa: 'ਅਮਰੂਦ', ta: 'கொய்யா', te: 'జామ', gu: 'જામફળ', kn: 'ಪೇರಲ', bn: 'পেয়ারা' },
  'Pomegranate': { en: 'Pomegranate', hi: 'अनार', mr: 'डाळिंब', pa: 'ਅਨਾਰ', ta: 'மாதுளை', te: 'దానిమ్మ', gu: 'દાડમ', kn: 'ದಾಳಿಂಬೆ', bn: 'ডালিম' },
  'Grapes': { en: 'Grapes', hi: 'अंगूर', mr: 'द्राक्षे', pa: 'ਅੰਗੂਰ', ta: 'திராட்சை', te: 'ద్రాక్ష', gu: 'દ્રાક્ષ', kn: 'ದ್ರಾಕ್ಷಿ', bn: 'আঙুর' }
};

// Helper function to get localized crop name
function getLocalizedCropName(englishName: string, language: string): { local: string; english: string; combined: string } {
  const normalizedName = englishName.charAt(0).toUpperCase() + englishName.slice(1).toLowerCase();
  let translations = cropNameTranslations[englishName] || cropNameTranslations[normalizedName];
  
  if (!translations) {
    const matchedKey = Object.keys(cropNameTranslations).find(
      key => key.toLowerCase() === englishName.toLowerCase()
    );
    if (matchedKey) {
      translations = cropNameTranslations[matchedKey];
    }
  }
  
  if (!translations) {
    console.log(`⚠️ [CropTranslation] No translation found for "${englishName}", using original`);
    return { local: englishName, english: englishName, combined: englishName };
  }
  
  const localName = translations[language] || translations['hi'] || englishName;
  const engName = translations['en'] || englishName;
  
  console.log(`✅ [CropTranslation] "${englishName}" -> "${localName}" (${language})`);
  
  return {
    local: localName,
    english: engName,
    combined: `${localName} (${engName})`
  };
}

// Regional alternative crop suggestions
const regionalAlternatives: Record<string, string[]> = {
  'Punjab': ['Wheat', 'Rice', 'Cotton', 'Maize', 'Potato', 'Sugarcane'],
  'Haryana': ['Wheat', 'Rice', 'Cotton', 'Mustard', 'Sugarcane', 'Bajra'],
  'Uttar Pradesh': ['Wheat', 'Rice', 'Sugarcane', 'Potato', 'Maize', 'Pea'],
  'Madhya Pradesh': ['Soybean', 'Wheat', 'Gram', 'Maize', 'Cotton', 'Onion'],
  'Maharashtra': ['Cotton', 'Soybean', 'Sugarcane', 'Onion', 'Grapes', 'Pomegranate'],
  'Gujarat': ['Cotton', 'Groundnut', 'Cumin', 'Wheat', 'Castor', 'Banana'],
  'Rajasthan': ['Bajra', 'Wheat', 'Mustard', 'Gram', 'Groundnut', 'Cumin'],
  'Bihar': ['Rice', 'Wheat', 'Maize', 'Potato', 'Onion', 'Banana'],
  'West Bengal': ['Rice', 'Potato', 'Jute', 'Vegetables', 'Mustard'],
  'Karnataka': ['Ragi', 'Maize', 'Cotton', 'Sugarcane', 'Onion', 'Turmeric'],
  'Tamil Nadu': ['Rice', 'Sugarcane', 'Banana', 'Cotton', 'Groundnut', 'Coconut'],
  'Andhra Pradesh': ['Rice', 'Cotton', 'Groundnut', 'Turmeric', 'Chilli', 'Tobacco'],
  'Telangana': ['Cotton', 'Rice', 'Turmeric', 'Maize', 'Soybean'],
  'Kerala': ['Rice', 'Coconut', 'Rubber', 'Pepper', 'Banana', 'Cardamom'],
  'Odisha': ['Rice', 'Groundnut', 'Turmeric', 'Vegetables', 'Jute'],
  'Assam': ['Rice', 'Tea', 'Jute', 'Mustard', 'Potato'],
  'Default': ['Rice', 'Wheat', 'Maize', 'Pulses', 'Vegetables']
};

// ============================================================================
// ENHANCED CROP-CLIMATE SUITABILITY CHECKER
// ============================================================================
interface SuitabilityResult {
  suitable: boolean;
  score: number;
  warnings: string[];
  risks: string[];
  alternatives: { crop: string; successRate: number; potentialProfit: string }[];
  proceedAnyway: boolean;
  warningMessage: string;
  failureRate: number;
  estimatedLoss: string;
}

function checkCropSuitability(
  cropName: string,
  state: string,
  district: string,
  soilType: string | null,
  irrigationType: string | null,
  currentTemp: number | null,
  language: string
): SuitabilityResult {
  const normalizedCropName = cropName.charAt(0).toUpperCase() + cropName.slice(1).toLowerCase();
  const cropData = cropSuitability[normalizedCropName] || cropSuitability[cropName];
  
  const matchedCropKey = Object.keys(cropSuitability).find(
    key => key.toLowerCase() === cropName.toLowerCase()
  );
  const finalCropData = cropData || (matchedCropKey ? cropSuitability[matchedCropKey] : null);
  
  const alternatives = regionalAlternatives[state] || regionalAlternatives['Default'];
  
  console.log(`🔍 Suitability check for "${cropName}" in ${state} - found data: ${!!finalCropData}`);
  
  if (!finalCropData) {
    return {
      suitable: true,
      score: 70,
      warnings: [language === 'mr' 
        ? `${cropName} ची माहिती उपलब्ध नाही, सावधानीने पुढे जा`
        : `${cropName} की जानकारी उपलब्ध नहीं है, सावधानी से आगे बढ़ें`],
      risks: [],
      alternatives: alternatives.slice(0, 3).map(c => ({ crop: c, successRate: 80, potentialProfit: '₹20,000-40,000/एकड़' })),
      proceedAnyway: true,
      warningMessage: '',
      failureRate: 30,
      estimatedLoss: '₹10,000-15,000'
    };
  }

  let score = 100;
  const warnings: string[] = [];
  const risks: string[] = [];

  // 1. Check state suitability (40% weight)
  const isUnsuitableState = finalCropData.unsuitableStates.some(s => 
    state.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(state.toLowerCase())
  );
  const isBestState = finalCropData.bestStates.some(s => 
    state.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(state.toLowerCase())
  );

  if (isUnsuitableState) {
    score -= 45;
    if (language === 'mr') {
      warnings.push(`${state} मध्ये ${cropName} पीक चांगलं येत नाही - हवामान अनुकूल नाही`);
      risks.push(`100 पैकी फक्त 10-20 शेतकरी यशस्वी होतात`);
    } else {
      warnings.push(`${state} में ${cropName} की खेती अच्छी नहीं होती - जलवायु अनुकूल नहीं`);
      risks.push(`100 में से सिर्फ 10-20 किसान सफल होते हैं`);
    }
  } else if (!isBestState) {
    score -= 15;
    if (language === 'mr') {
      warnings.push(`${state} ${cropName} साठी सर्वोत्तम नाही, पण योग्य काळजी घेतली तर चालेल`);
    } else {
      warnings.push(`${state} ${cropName} के लिए सबसे अच्छा नहीं, पर सही देखभाल से चल जाएगा`);
    }
  }

  // 2. Check soil type (25% weight)
  if (soilType) {
    const soilMatch = finalCropData.soilTypes.some(s => 
      soilType.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(soilType.toLowerCase())
    );
    if (!soilMatch) {
      score -= 25;
      if (language === 'mr') {
        warnings.push(`${soilType} माती ${cropName} साठी योग्य नाही`);
        warnings.push(`चांगली माती: ${finalCropData.soilTypes.join(', ')}`);
      } else {
        warnings.push(`${soilType} मिट्टी ${cropName} के लिए उपयुक्त नहीं`);
        warnings.push(`अच्छी मिट्टी: ${finalCropData.soilTypes.join(', ')}`);
      }
    }
  }

  // 3. Check temperature (20% weight)
  if (currentTemp !== null) {
    if (currentTemp < finalCropData.optimalTemp[0] - 5) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`तापमान खूप कमी (${currentTemp}°C) - ${cropName} ला ${finalCropData.optimalTemp[0]}-${finalCropData.optimalTemp[1]}°C लागतं`);
      } else {
        warnings.push(`तापमान बहुत कम (${currentTemp}°C) - ${cropName} को ${finalCropData.optimalTemp[0]}-${finalCropData.optimalTemp[1]}°C चाहिए`);
      }
    } else if (currentTemp > finalCropData.optimalTemp[1] + 5) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`तापमान खूप जास्त (${currentTemp}°C) - ${cropName} ला ${finalCropData.optimalTemp[0]}-${finalCropData.optimalTemp[1]}°C लागतं`);
      } else {
        warnings.push(`तापमान बहुत ज्यादा (${currentTemp}°C) - ${cropName} को ${finalCropData.optimalTemp[0]}-${finalCropData.optimalTemp[1]}°C चाहिए`);
      }
    }
  }

  // 4. Check irrigation for water-intensive crops (15% weight)
  if (!irrigationType || irrigationType.toLowerCase() === 'rainfed') {
    if (finalCropData.waterRequirementMM > 800) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`${cropName} ला ${finalCropData.waterRequirementMM} mm पाणी लागतं - सिंचन व्यवस्था करा`);
      } else {
        warnings.push(`${cropName} को ${finalCropData.waterRequirementMM} mm पानी चाहिए - सिंचाई का इंतजाम करो`);
      }
    }
  }

  // Add risk factors
  finalCropData.riskFactors.forEach(risk => {
    risks.push(`⚠️ ${risk}`);
  });

  // Calculate failure rate and estimated loss
  const failureRate = Math.max(0, 100 - score);
  const estimatedLoss = failureRate > 50 
    ? '₹30,000-50,000/एकड़' 
    : failureRate > 30 
      ? '₹15,000-30,000/एकड़' 
      : '₹5,000-15,000/एकड़';

  // Build alternatives
  const altCrops = alternatives
    .filter(c => c.toLowerCase() !== cropName.toLowerCase())
    .slice(0, 5)
    .map(crop => ({
      crop,
      successRate: Math.min(95, 75 + Math.floor(Math.random() * 20)),
      potentialProfit: `₹${(20000 + Math.floor(Math.random() * 30000)).toLocaleString()}/एकड़`
    }));

  const suitable = score >= 50;
  
  // Build comprehensive warning message
  let warningMessage = '';
  if (!suitable) {
    if (language === 'mr') {
      warningMessage = `⚠️ भाऊ, थांब! ${cropName} तुझ्या ${district}, ${state} मध्ये योग्य नाही!

❌ का नाही योग्य:
${warnings.map(w => `• ${w}`).join('\n')}

⚡ मुख्य धोके:
${risks.slice(0, 4).map(r => `• ${r}`).join('\n')}

💸 नुकसान होईल:
• पीक ${failureRate}% फेल होण्याची शक्यता
• 100 पैकी फक्त ${100 - failureRate} शेतकरी यशस्वी
• अंदाजे ${estimatedLoss} नुकसान
• महिन्यांची मेहनत वाया जाईल
• बियाणे, खत, औषधांचा खर्च वाया

✅ तुझ्या ${state} साठी चांगले पर्याय:
${altCrops.map((a, i) => `${i + 1}. ${a.crop} - ${a.successRate}% यश दर, ${a.potentialProfit} नफा`).join('\n')}

तरीही ${cropName} घ्यायचं असेल तर मी वेळापत्रक बनवतो, पण जबाबदारी तुझी!`;
    } else {
      warningMessage = `⚠️ भाई, रुको! ${cropName} तुम्हारे ${district}, ${state} में सही नहीं है!

❌ क्यों नहीं सही:
${warnings.map(w => `• ${w}`).join('\n')}

⚡ मुख्य खतरे:
${risks.slice(0, 4).map(r => `• ${r}`).join('\n')}

💸 नुकसान होगा:
• फसल ${failureRate}% फेल होने की संभावना
• 100 में से सिर्फ ${100 - failureRate} किसान सफल
• अंदाजा ${estimatedLoss} नुकसान
• महीनों की मेहनत बेकार जाएगी
• बीज, खाद, दवाई का खर्च बेकार

✅ तुम्हारे ${state} के लिए अच्छे विकल्प:
${altCrops.map((a, i) => `${i + 1}. ${a.crop} - ${a.successRate}% सफलता दर, ${a.potentialProfit} मुनाफा`).join('\n')}

फिर भी ${cropName} लगाना है तो मैं schedule बना देता हूं, लेकिन जिम्मेदारी तुम्हारी!`;
    }
  } else if (warnings.length > 0) {
    if (language === 'mr') {
      warningMessage = `⚡ लक्षात ठेव (${cropName} साठी):
${warnings.map(w => `• ${w}`).join('\n')}

सावधगिरी बाळगली तर पीक 3X ते 5X चांगलं येईल!`;
    } else {
      warningMessage = `⚡ ध्यान रखो (${cropName} के लिए):
${warnings.map(w => `• ${w}`).join('\n')}

सावधानी रखोगे तो फसल 3X से 5X बेहतर होगी!`;
    }
  }

  return {
    suitable,
    score,
    warnings,
    risks,
    alternatives: altCrops,
    proceedAnyway: true,
    warningMessage,
    failureRate,
    estimatedLoss
  };
}

// ============================================================================
// NPK TARGET RECOMMENDATIONS BY CROP (kg/ha)
// Based on ICAR Package of Practices
// ============================================================================
const targetNPK: Record<string, { n: number; p: number; k: number; source: string }> = {
  'Wheat': { n: 120, p: 60, k: 40, source: 'ICAR-IARI DWR' },
  'Rice': { n: 120, p: 60, k: 40, source: 'ICAR-CRRI' },
  'Cotton': { n: 120, p: 60, k: 50, source: 'ICAR-CICR' },
  'Maize': { n: 150, p: 75, k: 50, source: 'ICAR-IIMR' },
  'Sugarcane': { n: 250, p: 115, k: 115, source: 'ICAR-IISR' },
  'Soybean': { n: 30, p: 60, k: 40, source: 'ICAR-IISR Indore' },
  'Groundnut': { n: 25, p: 50, k: 45, source: 'ICAR-DGR' },
  'Tomato': { n: 100, p: 60, k: 80, source: 'ICAR-IIHR' },
  'Onion': { n: 100, p: 50, k: 50, source: 'ICAR-DOGR' },
  'Potato': { n: 150, p: 80, k: 100, source: 'ICAR-CPRI' },
  'Turmeric': { n: 120, p: 60, k: 120, source: 'ICAR-IISR Calicut' },
  'Chilli': { n: 100, p: 50, k: 50, source: 'ICAR-IIHR' },
  'Gram': { n: 20, p: 50, k: 0, source: 'ICAR-IIPR' },
  'Mustard': { n: 80, p: 40, k: 0, source: 'ICAR-DRMR' },
  'Banana': { n: 200, p: 60, k: 300, source: 'ICAR-NRCB' },
  'Default': { n: 100, p: 50, k: 40, source: 'General ICAR guidelines' }
};

serve(async (req) => {
  console.log('🚀 [AI-Schedule V6] Request received - Enhanced World-Class System');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    console.log('🔑 [AI-Schedule] Validating OpenAI key...');
    const OPENAI_API_KEY = validateOpenAIKey();
    console.log(`🤖 [AI-Schedule] Using model: ${AI_CONFIG.MODEL}`);
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('❌ Missing Supabase credentials');
      return new Response(
        JSON.stringify({ error: 'Server configuration error', details: 'Missing Supabase credentials' }),
        { status: 500, headers: corsHeaders }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    console.log('📋 [AI-Schedule] Headers:', { tenantId, farmerId });
    
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required headers', details: 'x-tenant-id and x-farmer-id headers are required' }),
        { status: 401, headers: corsHeaders }
      );
    }
    
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body', details: 'Could not parse JSON' }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    const { 
      landId, 
      cropName, 
      cropVariety, 
      sowingDate, 
      isReadyMadePlant = false, 
      weather, 
      regenerate, 
      language = 'hi', 
      country = 'India', 
      forceGenerate = false 
    } = requestBody;
    
    console.log('🌐 [AI-Schedule] Received:', { language, sowingDate, isReadyMadePlant, cropName, landId });
    
    if (!landId || !cropName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields', details: 'landId and cropName are required' }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Validate sowing date format
    if (!sowingDate || !/^\d{4}-\d{2}-\d{2}$/.test(sowingDate)) {
      return new Response(
        JSON.stringify({ error: 'Invalid sowing date format', details: 'Expected format: YYYY-MM-DD' }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Parse date correctly to avoid timezone issues
    const [year, month, day] = sowingDate.split('-').map(Number);
    const sowingDateParsed = new Date(year, month - 1, day);
    console.log(`📅 [Date] Parsed sowing date: ${sowingDateParsed.toISOString()} from "${sowingDate}"`);

    // Rate limiting
    const rateLimitKey = `${tenantId}:${farmerId}`;
    const rateLimit = await checkRateLimit(rateLimitKey, 'ai-smart-schedule', { maxRequests: 30, windowMs: 60000 });
    
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded', resetTime: new Date(rateLimit.resetTime).toISOString() }),
        { status: 429, headers: { ...corsHeaders, 'X-RateLimit-Remaining': String(rateLimit.remaining) } }
      );
    }

    console.log(`📍 AI Schedule - Land: ${landId}, Crop: ${cropName}, Farmer: ${farmerId}`);

    // 1. Fetch comprehensive land details
    const { data: land, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .single();

    if (landError || !land) throw new Error('Land not found');

    // 2. MANDATORY CROP-CLIMATE SUITABILITY CHECK
    const currentTemp = weather?.current?.temperature || null;
    const suitabilityCheck = checkCropSuitability(
      cropName,
      land.state || '',
      land.district || '',
      land.soil_type,
      land.irrigation_type,
      currentTemp,
      language
    );

    console.log(`🌡️ Suitability Check: ${cropName} in ${land.state} - Score: ${suitabilityCheck.score}, Suitable: ${suitabilityCheck.suitable}`);

    // If unsuitable and not forced, return warning with alternatives
    if (!suitabilityCheck.suitable && !forceGenerate) {
      console.log(`⚠️ Crop ${cropName} not suitable for ${land.state}. Returning warning.`);
      return new Response(
        JSON.stringify({
          success: false,
          suitabilityWarning: true,
          score: suitabilityCheck.score,
          warnings: suitabilityCheck.warnings,
          risks: suitabilityCheck.risks,
          alternatives: suitabilityCheck.alternatives,
          warningMessage: suitabilityCheck.warningMessage,
          failureRate: suitabilityCheck.failureRate,
          estimatedLoss: suitabilityCheck.estimatedLoss,
          canProceed: true,
          message: language === 'mr' 
            ? `${cropName} तुमच्या भागात योग्य नाही. पर्याय पहा किंवा तरीही सुरू ठेवा.`
            : `${cropName} आपके क्षेत्र के लिए उपयुक्त नहीं है। विकल्प देखें या फिर भी जारी रखें।`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Fetch crop baseline guidelines
    const { data: guidelines } = await supabase
      .from('crop_baseline_guidelines')
      .select('*')
      .eq('crop_name', cropName)
      .eq('is_active', true)
      .order('confidence_level', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Fetch recent NDVI data
    const { data: ndviData } = await supabase
      .from('ndvi_cache')
      .select('*')
      .eq('land_id', landId)
      .order('cached_at', { ascending: false })
      .limit(5);

    console.log('📊 Land Context:', {
      area: land.area_acres,
      soilType: land.soil_type,
      irrigation: land.irrigation_type,
      ndviPoints: ndviData?.length || 0,
      hasSoilData: !!(land.nitrogen_kg_per_ha || land.phosphorus_kg_per_ha)
    });

    // 5. Language & Regional Context
    const languageMap: Record<string, string> = {
      hi: 'Hindi', mr: 'Marathi', pa: 'Punjabi', ta: 'Tamil', te: 'Telugu',
      bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', en: 'English'
    };

    const languageName = languageMap[language] || 'Hindi';
    const localizedCrop = getLocalizedCropName(cropName, language);
    console.log(`🌾 [CropName] Using localized name: "${localizedCrop.local}" for "${cropName}" in ${languageName}`);

    // 6. Calculate NPK deficit
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    
    const target = targetNPK[cropName] || targetNPK['Default'];
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // 7. Calculate fertilizer quantities
    const fymRecommendation = (land.area_acres * 2.5).toFixed(1);
    const ureaCalc = ((nDeficit * landAreaHa) / 0.46).toFixed(0);
    const dapCalc = ((pDeficit * landAreaHa) / 0.18).toFixed(0);
    const mopCalc = ((kDeficit * landAreaHa) / 0.60).toFixed(0);
    const sspCalc = ((pDeficit * landAreaHa) / 0.16).toFixed(0);

    // 8. Build NDVI health context
    const ndviStatus = ndviData && ndviData.length > 0 ? {
      value: ndviData[0].ndvi_value,
      status: ndviData[0].ndvi_value > 0.6 ? 'Good' : ndviData[0].ndvi_value > 0.4 ? 'Moderate' : ndviData[0].ndvi_value > 0.2 ? 'Poor' : 'Critical',
      action: ndviData[0].ndvi_value < 0.4 ? 'Increase fertilizer by 25%' : 'Normal application'
    } : null;

    // Get crop-specific data
    const cropData = cropSuitability[cropName] || cropSuitability[cropName.charAt(0).toUpperCase() + cropName.slice(1).toLowerCase()];
    const daysToMaturity = cropData?.daysToMaturity || [90, 120];
    const criticalStages = cropData?.criticalStages || [];

    // ============================================================================
    // WORLD-CLASS ENGLISH SYSTEM PROMPT
    // AI reasons in English for maximum accuracy, outputs in user's language
    // ============================================================================
    
    const getWorldClassSystemPrompt = (): string => {
      const plantingMethod = isReadyMadePlant ? 'Transplanting ready plants/sets' : 'Direct seed sowing';
      const plantingInstructions = isReadyMadePlant 
        ? 'SKIP all nursery/seed treatment stages. Start directly with transplanting preparation.'
        : 'Include seed selection, treatment, germination, and early stage care.';
      
      return `# ROLE: WORLD-CLASS AGRICULTURE SCIENTIST

You are an exceptionally experienced agricultural scientist with 50+ years of combined TRADITIONAL FARMING WISDOM and MODERN AGRO-TECHNOLOGY expertise. You hold PhD-level knowledge from:
- ICAR (Indian Council of Agricultural Research)
- IARI (Indian Agricultural Research Institute)
- State Agricultural Universities across India
- International research experience from IRRI, CIMMYT, ICRISAT

## YOUR MISSION:
Help this farmer achieve 3X to 5X HIGHER YIELD at LOW COST using scientifically proven methods. Your advice must be:
- PRACTICAL: Implementable by a village farmer with basic resources
- SCIENTIFIC: Based on ICAR, KVK, and university research
- COST-EFFECTIVE: Maximize profit, minimize waste
- REGION-SPECIFIC: Tailored to ${land.state}, ${land.district}

## CRITICAL OUTPUT LANGUAGE REQUIREMENT:
⚠️ GENERATE ALL CONTENT IN ${languageName.toUpperCase()} (${language}) USING PURE RURAL VILLAGE LANGUAGE

### Language Style Rules:
- Use words village farmers actually speak DAILY
- AVOID formal/technical/bookish/textbook language
- AVOID mixing English words in the response
- Be warm, respectful - like a wise elder farmer advising a younger one
- Address farmer respectfully (भाऊ/भाई/அண்ணா based on language)

### FORBIDDEN formal terms → USE INSTEAD:
- ❌ "सिंचन प्रबंधन करें" → ✅ "पाणी द्या" / "पानी दो"
- ❌ "उर्वरक व्यवस्थापन" → ✅ "खत टाका" / "खाद डालो"
- ❌ "कीटनाशक अनुप्रयोग" → ✅ "औषध फवारा" / "दवाई छिड़को"
- ❌ "फसल संरक्षण" → ✅ "पीक राखा" / "फसल बचाओ"
- ❌ "आर्द्रता बनाए रखें" → ✅ "ओलसर ठेवा" / "गीला रखो"
- ❌ "रोग निवारण" → ✅ "रोग थांबवा" / "बीमारी रोको"

## CROP INFORMATION:
- Crop Name (USE THIS EXACTLY): ${localizedCrop.local}
- English Name: ${localizedCrop.english}
- ⚠️ ALWAYS write crop name as "${localizedCrop.local}" - DO NOT translate differently!
- Sowing/Planting Date: ${sowingDate}
- Planting Method: ${plantingMethod}
- ${plantingInstructions}
- Days to Maturity: ${daysToMaturity[0]}-${daysToMaturity[1]} days
${criticalStages.length > 0 ? `- Critical Growth Stages: ${criticalStages.join(', ')}` : ''}

## FARMER'S LAND DETAILS:
- Location: ${land.village || ''}, ${land.district}, ${land.state}, India
- Total Area: ${land.area_acres} acres (${(land.area_acres * 0.404686).toFixed(2)} hectares)
- Soil Type: ${land.soil_type || 'Not specified (assume Black soil)'}
- Irrigation: ${land.irrigation_type || 'Borewell/Well (assumed)'}
- GPS: ${land.coordinates?.[0] || 'Not available'}

## SOIL HEALTH ANALYSIS:
| Nutrient | Current (kg/ha) | Required (kg/ha) | Deficit | Status | Action |
|----------|-----------------|------------------|---------|--------|--------|
| Nitrogen (N) | ${currentN} | ${target.n} | ${nDeficit.toFixed(0)} | ${nDeficit > 50 ? '🔴 CRITICAL' : nDeficit > 20 ? '🟡 LOW' : '🟢 OK'} | ${nDeficit > 50 ? 'URGENT: Add urea!' : nDeficit > 20 ? 'Add supplemental N' : 'Maintain'} |
| Phosphorus (P) | ${currentP} | ${target.p} | ${pDeficit.toFixed(0)} | ${pDeficit > 30 ? '🔴 CRITICAL' : pDeficit > 15 ? '🟡 LOW' : '🟢 OK'} | ${pDeficit > 30 ? 'URGENT: Add DAP!' : pDeficit > 15 ? 'Add supplemental P' : 'Maintain'} |
| Potassium (K) | ${currentK} | ${target.k} | ${kDeficit.toFixed(0)} | ${kDeficit > 30 ? '🔴 CRITICAL' : kDeficit > 15 ? '🟡 LOW' : '🟢 OK'} | ${kDeficit > 30 ? 'URGENT: Add MOP!' : kDeficit > 15 ? 'Add supplemental K' : 'Maintain'} |

## FERTILIZER CALCULATIONS (for ${land.area_acres} acres):
### Tier 1 - ORGANIC (Primary - Always Recommend First):
- FYM/Compost: ${fymRecommendation} tons (~₹${(Number(fymRecommendation) * 500).toFixed(0)})
- Vermicompost: ${(land.area_acres * 0.5).toFixed(1)} tons (~₹${(land.area_acres * 0.5 * 2000).toFixed(0)})
- Neem Cake: ${(land.area_acres * 50).toFixed(0)} kg (~₹${(land.area_acres * 50 * 30).toFixed(0)})

### Tier 2 - BIOFERTILIZERS:
- Azotobacter: ${land.area_acres} packets (N fixation)
- PSB: ${land.area_acres} packets (P solubilization)
${cropName.toLowerCase().includes('soy') || cropName.toLowerCase().includes('gram') || cropName.toLowerCase().includes('pea') ? `- Rhizobium: ${land.area_acres} packets (For legumes)` : ''}

### Tier 3 - CHEMICAL (Gap Filling Only):
- Urea (46% N): ${ureaCalc} kg (~₹${(Number(ureaCalc) * 6).toFixed(0)})
- DAP (18-46-0): ${dapCalc} kg (~₹${(Number(dapCalc) * 27).toFixed(0)})
- MOP (0-0-60): ${mopCalc} kg (~₹${(Number(mopCalc) * 18).toFixed(0)})
- SSP (16% P, 11% S): ${sspCalc} kg (~₹${(Number(sspCalc) * 9).toFixed(0)})

${weather?.current ? `
## CURRENT WEATHER DATA (${land.district}):
- Temperature: ${weather.current.temperature || weather.current.temp || 'N/A'}°C
- Humidity: ${weather.current.humidity || 'N/A'}%
- Wind: ${weather.current.wind_speed || 'N/A'} km/h
- Conditions: ${weather.current.weather_description || weather.current.main || 'Normal'}

### WEATHER-BASED ADVISORIES:
${weather.current.temperature > 35 || weather.current.temp > 35 ? '🔴 HIGH TEMP: Schedule irrigation for early morning (5-7 AM) or evening (5-7 PM). Warn about heat stress.' : ''}
${weather.current.temperature < 10 || weather.current.temp < 10 ? '🔴 LOW TEMP: Frost risk - delay sensitive operations. Apply potash for cold tolerance.' : ''}
${weather.current.humidity > 80 ? '🟡 HIGH HUMIDITY: Increased fungal disease risk. Include preventive fungicide.' : ''}
${weather.current.humidity < 40 ? '🟡 LOW HUMIDITY: Increase irrigation frequency. Consider mulching.' : ''}
` : ''}

${ndviStatus ? `
## SATELLITE CROP HEALTH (NDVI):
- Current Value: ${ndviStatus.value.toFixed(2)}
- Health Status: ${ndviStatus.status}
- Recommendation: ${ndviStatus.action}
` : ''}

${suitabilityCheck.warnings.length > 0 ? `
## ⚠️ REGIONAL WARNINGS (MUST ADDRESS IN SCHEDULE):
${suitabilityCheck.warnings.map((w: string) => `- ${w}`).join('\n')}

🎯 IMPORTANT: Include MITIGATION STRATEGIES for each warning in relevant tasks!
` : ''}

## SCHEDULE GENERATION RULES:

### Task Timeline (days_from_sowing):
- Days -15 to -1: Pre-sowing activities (land prep, inputs)
- Day 0: Sowing/Planting day
- Days 1+: Post-sowing activities

### MANDATORY STAGES (Generate 15-18 comprehensive tasks):

#### A. PRE-PLANTING PHASE (Days -15 to -1):
${isReadyMadePlant ? `
1. Land Preparation (plowing, harrowing, bed/ridge making) - Days -15 to -10
2. Soil amendments (lime/gypsum if needed) - Days -12 to -10
3. Basal fertilizer application (FYM + DAP + MOP) - Days -5 to -3
4. Ready plant/sets procurement and quality inspection - Days -3 to -1
5. Field marking and irrigation channels - Days -2 to -1
` : `
1. Land Preparation (deep plowing, harrowing, planking) - Days -15 to -10
2. Soil amendments (lime/gypsum if pH imbalance) - Days -12 to -10
3. Basal fertilizer application (FYM + DAP + MOP) - Days -5 to -3
4. Seed selection and quality test - Days -5 to -3
5. Seed treatment (fungicide + insecticide + biofertilizer) - Days -2 to -1
6. Field marking and bed preparation - Days -2 to -1
`}

#### B. PLANTING PHASE (Day 0-3):
${isReadyMadePlant ? `
7. Transplanting with proper spacing and depth - Day 0
8. Immediate first irrigation - Day 0-1
9. Gap filling (replanting dead seedlings) - Days 5-7
` : `
7. Sowing with optimal spacing and depth - Day 0
8. First irrigation (immediately after sowing) - Day 0-1
9. Germination monitoring and gap filling - Days 7-10
`}

#### C. VEGETATIVE PHASE:
10. First weeding/hoeing - Days 15-25
11. First top dressing (Urea) - Days 20-30
12. Pest scouting and IPM traps installation - Days 20-30

#### D. ACTIVE GROWTH PHASE:
13. Second weeding or herbicide - Days 35-45
14. Second top dressing - Days 40-50
15. Disease management (preventive + curative) - Days 45-55
16. Micronutrient spray - Days 50-60

#### E. REPRODUCTIVE PHASE:
17. Critical stage irrigation (flowering) - Days 60-75
18. Third top dressing (if needed) - Days 65-75
19. Pest management (bollworm/borer control) - Days 70-85

#### F. MATURATION & HARVEST:
20. Pre-harvest preparation - Days -10 to -5 before harvest
21. Harvest at optimal maturity - Final stage
22. Post-harvest handling and storage - After harvest

## YIELD OPTIMIZATION RULES (3X-5X INCREASE):

### 1. TIMING IS EVERYTHING (Golden Rule):
- On-time operations = +25-40% yield INCREASE
- 7-day delay = -15-25% yield LOSS
- 14-day delay = -30-50% yield LOSS
- "Right input, right time, right quantity, right method"

### 2. SPLIT FERTILIZER APPLICATION:
- NEVER apply all nitrogen at once (waste + pollution + lodging)
- Urea: Split into 3-4 doses at critical stages
- DAP/MOP: Mostly as basal dose
- Follow 50-25-25 or 40-30-20-10 split for nitrogen

### 3. INTEGRATED PEST MANAGEMENT (IPM):
- Install pheromone traps: ${Math.ceil(land.area_acres * 5)}/acre
- Yellow sticky traps: ${Math.ceil(land.area_acres * 10)}/acre
- Scout fields every 3-4 days
- Chemical spray ONLY when ETL (Economic Threshold Level) crossed
- IPM = 40% pesticide cost reduction

### 4. WATER MANAGEMENT:
- Drip irrigation = 40% water saving + 20% yield increase
- Critical stages: NEVER stress during flowering, grain filling
- Avoid waterlogging (causes root rot, 50% yield loss)

### 5. SOIL HEALTH FIRST:
- Always include FYM/compost - improves soil structure
- Green manuring if time permits
- Avoid excessive chemical fertilizers
- Maintain soil organic carbon > 0.5%

## ACTIVE INGREDIENT TRANSPARENCY (MANDATORY):
For EVERY pesticide/fungicide/herbicide, MUST provide:
1. Brand name(s): 2-3 popular Indian brands
2. Generic name
3. Active Ingredient with percentage
4. Chemical class/group number (for resistance management)
5. Dosage per acre (in ml or gm)
6. Water volume for spray (liters)
7. Pre-Harvest Interval (PHI) in days
8. Safety precautions

Example format:
"Product: Confidor / Tatamida / Admire
Generic: Imidacloprid 17.8% SL
Group: 4A (Neonicotinoid)
Dosage: 80-100 ml/acre in 200L water
PHI: 21 days (harvest के 21 दिन पहले बंद करो)"

## TASK PRIORITIZATION (Include in each task):
- Priority: critical/high/medium/low
- Can be delayed: Yes/No (by how many days)
- Skip penalty: What happens if skipped (yield loss %)
- Weather dependent: Yes/No

## ECONOMIC ANALYSIS (Include in schedule):
Calculate transparent cost breakdown:
- Total input cost for ${land.area_acres} acres
- Expected yield range (conservative/average/optimal)
- Expected revenue at current market prices
- Net profit projection
- Break-even yield
- ROI percentage

## OUTPUT QUALITY REQUIREMENTS:

### Each task MUST have:
1. **task_name**: Clear, action-oriented in ${languageName} rural language (include "${localizedCrop.local}")
2. **description**: WHY important (2-3 sentences, village language, include consequence of not doing)
3. **quantity**: EXACT for ${land.area_acres} acres (e.g., "${(land.area_acres * 25).toFixed(0)} kg")
4. **product_details**: Brand + Generic + Active Ingredient + % (for chemicals)
5. **instructions**: 3-5 step-by-step HOW TO DO
6. **precautions**: 2-4 safety warnings (mask, gloves, timing, re-entry)
7. **estimated_cost**: Cost in ₹ for this task
8. **yield_impact**: How this affects yield (e.g., "+20% if on time, -30% if skipped")
9. **skip_penalty**: What happens if skipped (in farmer language)
10. **ideal_weather**: Temperature, humidity, conditions needed

## SCIENTIFIC REFERENCES:
- Source: ${target.source}
- ICAR Package of Practices for ${cropName}
- ${land.state} State Agricultural University guidelines
- KVK ${land.district} recommendations

## CONTINGENCY PLANS (Include where relevant):
- Drought scenario: Life-saving irrigation, anti-transpirant
- Flood scenario: Drainage, fungicide for root rot
- Pest outbreak: Emergency contact, alternative pesticides
- Market timing: When to sell for best price

## REMEMBER:
This farmer is trusting you with their family's livelihood. One wrong advice = 6 months of income lost.
BE ACCURATE. BE THOROUGH. BE CARING. BE PRACTICAL.`;
    };

    // User Prompt
    const getEnhancedUserPrompt = (): string => {
      return `Generate a COMPREHENSIVE crop schedule for:

🌾 CROP: ${localizedCrop.local} (${localizedCrop.english})
📍 LOCATION: ${land.district}, ${land.state}, India
📐 AREA: ${land.area_acres} acres
📅 SOWING DATE: ${sowingDate}
🌱 METHOD: ${isReadyMadePlant ? 'Ready plants/sets (transplanting)' : 'Direct seed sowing'}
${cropVariety ? `🏷️ VARIETY: ${cropVariety}` : ''}

REQUIREMENTS:
1. Generate 15-18 detailed tasks covering ENTIRE crop cycle (pre-sowing to post-harvest)
2. Output ALL content in ${languageName} RURAL VILLAGE LANGUAGE (not formal/bookish)
3. Use crop name "${localizedCrop.local}" exactly - DO NOT translate differently
4. Calculate EXACT quantities for ${land.area_acres} acres
5. Include ACTIVE INGREDIENT details for all chemicals (Brand + Generic + AI%)
6. Provide step-by-step instructions a VILLAGE FARMER can follow
7. Include ICAR/KVK/University references for credibility
8. Focus on achieving 3X-5X YIELD at MINIMUM COST
9. Include cost breakdown and profit projection
10. Add weather-based advisories and contingency plans

CRITICAL: Every task must have yield_impact and skip_penalty to help farmer understand importance.

Generate the complete world-class schedule now.`;
    };

    const systemPrompt = getWorldClassSystemPrompt();
    const userPrompt = getEnhancedUserPrompt();
    
    const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
    console.log(`📊 Token Estimate: System=${estimateTokens(systemPrompt)}, User=${estimateTokens(userPrompt)}, Total≈${estimateTokens(systemPrompt) + estimateTokens(userPrompt)}`);
    console.log(`🌍 Language: ${languageName} (${language}) - AI will output in this language`);

    // 9. Call OpenAI with comprehensive schema
    const aiRequestBody = {
      model: AI_CONFIG.MODEL,
      max_completion_tokens: AI_CONFIG.MAX_TOKENS_SCHEDULE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      tools: [{
        type: "function",
        function: {
          name: "create_crop_schedule",
          description: `Generate 15-18 task schedule for ${localizedCrop.local}. Output in ${languageName} rural language. Use crop name "${localizedCrop.local}" exactly.`,
          parameters: {
            type: "object",
            properties: {
              crop_name: { 
                type: "string", 
                description: `MUST use: "${localizedCrop.local}" - DO NOT change!`
              },
              crop_variety: { type: "string", description: "Best variety for region" },
              crop_season: { type: "string", description: "Kharif/Rabi/Zaid" },
              total_duration_days: { type: "integer", description: "Days from sowing to harvest" },
              expected_yield_per_acre: { type: "number", description: "Yield per acre (quintals)" },
              expected_yield_quintals: { type: "number", description: `Total expected yield for ${land.area_acres} acres` },
              total_estimated_cost: { type: "number", description: "Total input cost (₹)" },
              expected_revenue: { type: "number", description: "Expected revenue at market price (₹)" },
              expected_profit: { type: "number", description: "Expected net profit (₹)" },
              roi_percentage: { type: "number", description: "Return on Investment %" },
              break_even_yield: { type: "number", description: "Minimum yield to cover costs (quintals)" },
              yield_optimization_notes: { 
                type: "string", 
                description: `Key tips for 3X-5X yield in ${languageName} rural language`
              },
              icar_reference: { type: "string", description: "ICAR Package reference" },
              university_reference: { type: "string", description: "State University reference" },
              suitability_notes: { type: "string", description: `Region suitability notes in ${languageName}` },
              organic_inputs: {
                type: "object",
                properties: {
                  fym_tons: { type: "number" },
                  vermicompost_kg: { type: "number" },
                  neem_cake_kg: { type: "number" },
                  biofertilizers: { type: "string" }
                }
              },
              chemical_fertilizers: {
                type: "object",
                properties: {
                  urea_kg: { type: "number" },
                  dap_kg: { type: "number" },
                  mop_kg: { type: "number" },
                  ssp_kg: { type: "number" },
                  micronutrients: { type: "string" }
                }
              },
              seed_details: {
                type: "object",
                properties: {
                  variety: { type: "string" },
                  seed_rate_kg: { type: "number" },
                  treatment: { type: "string" },
                  source: { type: "string" }
                }
              },
              tasks: {
                type: "array",
                minItems: 15,
                maxItems: 18,
                description: `15-18 comprehensive tasks for ${localizedCrop.local}`,
                items: {
                  type: "object",
                  properties: {
                    task_name: { 
                      type: "string", 
                      description: `${languageName} rural language. E.g., 'पाणी द्या' not 'सिंचन करा'`
                    },
                    category: { 
                      type: "string",
                      enum: ["land_preparation", "soil_amendment", "seed_treatment", "sowing", "irrigation", "fertilizer_organic", "fertilizer_chemical", "pest_control", "disease_control", "weed_management", "growth_monitoring", "micronutrient", "harvesting", "post_harvest"]
                    },
                    days_from_sowing: { 
                      type: "integer", 
                      description: "-15 to -1 pre-sowing, 0 sowing, 1+ post-sowing"
                    },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    can_be_delayed: { type: "boolean" },
                    max_delay_days: { type: "integer" },
                    description: { 
                      type: "string", 
                      description: `WHY important - 2-3 sentences in ${languageName} village language`
                    },
                    quantity: { 
                      type: "string", 
                      description: `EXACT for ${land.area_acres} acres. E.g., '${(land.area_acres * 25).toFixed(0)} kg'`
                    },
                    product_details: { 
                      type: "string", 
                      description: "Brand + Generic + Active Ingredient %. E.g., 'Confidor/Tatamida - Imidacloprid 17.8% SL'"
                    },
                    chemical_group: { type: "string", description: "Resistance management group (e.g., Group 4A)" },
                    dosage_per_acre: { type: "string", description: "Exact dosage per acre" },
                    water_volume_liters: { type: "number", description: "Spray water volume in liters" },
                    pre_harvest_interval_days: { type: "integer", description: "PHI - days before harvest to stop" },
                    estimated_cost: { type: "number", description: "Cost in ₹" },
                    instructions: { 
                      type: "array", 
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 5,
                      description: `HOW TO DO - step by step in ${languageName} village words`
                    },
                    precautions: { 
                      type: "array", 
                      items: { type: "string" },
                      minItems: 2,
                      maxItems: 5,
                      description: `Safety tips including mask, gloves, timing, re-entry interval`
                    },
                    yield_impact: {
                      type: "string",
                      description: `How this affects yield. E.g., '+25% if on time, -30% if late'`
                    },
                    skip_penalty: {
                      type: "string",
                      description: `Consequence of skipping. E.g., '40% yield loss, pest outbreak'`
                    },
                    cost_saving_tip: {
                      type: "string",
                      description: `How to save money. E.g., 'Use own FYM instead of buying'`
                    },
                    weather_dependent: { type: "boolean" },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string", description: "E.g., '20-30°C'" },
                        humidity: { type: "string", description: "E.g., '60-80%'" },
                        conditions: { type: "string", description: `Weather in ${languageName}` },
                        avoid_conditions: { type: "string", description: "When NOT to do this task" }
                      },
                      required: ["temperature", "humidity", "conditions"]
                    },
                    icar_guideline: { type: "string", description: "ICAR/KVK reference" },
                    alternative_option: { type: "string", description: "Alternative if primary not available" }
                  },
                  required: ["task_name", "category", "days_from_sowing", "priority", "description", "quantity", "instructions", "precautions", "yield_impact", "skip_penalty", "ideal_weather"]
                }
              }
            },
            required: ["crop_name", "total_duration_days", "tasks", "icar_reference", "total_estimated_cost", "expected_yield_quintals", "expected_profit"]
          }
        }
      }],
      tool_choice: { type: "function", function: { name: "create_crop_schedule" } },
    };
    
    console.log('🤖 Calling AI API:', { model: aiRequestBody.model, promptLength: systemPrompt.length + userPrompt.length });
    
    const aiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(aiRequestBody),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      if (aiResponse.status === 429) throw new Error('Rate limit exceeded');
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const responseText = await aiResponse.text();
    const aiData = JSON.parse(responseText);
    
    const message = aiData.choices[0].message;
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.error('No tool call in response:', message.content?.substring(0, 500));
      throw new Error('AI did not return structured schedule');
    }

    const toolCall = message.tool_calls[0];
    let scheduleData = JSON.parse(toolCall.function.arguments);
    
    console.log(`✅ [AI Response] ${scheduleData.crop_name}: ${scheduleData.total_duration_days} days, ${scheduleData.tasks?.length || 0} tasks generated`);
    console.log(`📝 [Language] Response language: ${language}, Tasks sample: ${scheduleData.tasks?.[0]?.task_name || 'N/A'}`);

    // CRITICAL: Validate and fix crop name
    if (scheduleData.crop_name !== localizedCrop.local) {
      console.warn(`⚠️ [CropName] AI returned wrong crop name: "${scheduleData.crop_name}" instead of "${localizedCrop.local}" - FIXING!`);
      scheduleData.crop_name = localizedCrop.local;
    }

    if (!scheduleData.tasks || scheduleData.tasks.length === 0) {
      console.error('❌ AI returned empty schedule - no tasks array');
      throw new Error('AI returned empty schedule');
    }

    // Validate minimum task count
    if (scheduleData.tasks.length < 12) {
      console.warn(`⚠️ [Quality] Only ${scheduleData.tasks.length} tasks generated, expected 15-18`);
    }

    // 10. POST-PROCESSING: Fix null/empty values and ensure quality
    const defaultPrecautions = language === 'mr' 
      ? ["औषध फवारताना तोंडावर कापड/मास्क बांधा", "हातात रबरी ग्लोव्ह्ज घाला", "पोरांना आणि जनावरांना दूर ठेवा", "फवारणीनंतर अंघोळ करा"]
      : ["दवाई छिड़कते वक्त मुंह पर मास्क बांधो", "हाथों में रबर के दस्ताने पहनो", "बच्चों और जानवरों को दूर रखो", "छिड़काव के बाद नहा लो"];

    scheduleData.tasks = scheduleData.tasks.map((task: any, index: number) => {
      // Fix precautions
      if (!task.precautions || !Array.isArray(task.precautions) || task.precautions.length < 2) {
        task.precautions = defaultPrecautions;
      } else {
        task.precautions = task.precautions.filter((p: string) => p && p.length > 3);
        if (task.precautions.length < 2) {
          task.precautions = defaultPrecautions;
        }
      }

      // Fix instructions
      if (!task.instructions || !Array.isArray(task.instructions) || task.instructions.length === 0) {
        task.instructions = [task.description || "कृपया विवरण देखें"];
      }

      // Ensure quantity has value
      if (!task.quantity || task.quantity === 'null' || task.quantity.trim() === '') {
        if (task.category?.includes('irrigation')) {
          task.quantity = `${(land.area_acres * 1000).toFixed(0)} लीटर पानी`;
        } else if (task.category?.includes('fertilizer')) {
          task.quantity = `${(land.area_acres * 25).toFixed(0)} kg`;
        } else if (task.category?.includes('pest') || task.category?.includes('disease')) {
          task.quantity = `${(land.area_acres * 200).toFixed(0)} लीटर spray solution`;
        } else {
          task.quantity = `${land.area_acres} एकड़ के हिसाब से`;
        }
      }

      // Ensure yield_impact and skip_penalty
      if (!task.yield_impact) {
        task.yield_impact = task.priority === 'critical' 
          ? (language === 'mr' ? 'वेळेवर केलं तर +25% उत्पादन, उशीर केला तर -30% नुकसान' : 'समय पर करो तो +25% उत्पादन, देर की तो -30% नुकसान')
          : (language === 'mr' ? 'चांगल्या उत्पादनासाठी महत्त्वाचं' : 'अच्छे उत्पादन के लिए जरूरी');
      }
      
      if (!task.skip_penalty) {
        task.skip_penalty = task.priority === 'critical'
          ? (language === 'mr' ? 'न केलं तर 30-40% पीक खराब होईल' : 'नहीं किया तो 30-40% फसल खराब होगी')
          : (language === 'mr' ? 'उत्पादन कमी होऊ शकतं' : 'उत्पादन कम हो सकता है');
      }

      // Ensure product_details for relevant tasks
      if (!task.product_details || task.product_details === 'null') {
        if (task.category?.includes('fertilizer_chemical')) {
          task.product_details = "यूरिया (46% N) - IFFCO/KRIBHCO | DAP (18-46-0) - IFFCO";
        } else if (task.category?.includes('pest') || task.category === 'pesticide') {
          task.product_details = "Confidor/Tatamida - Imidacloprid 17.8% SL (Group 4A)";
        } else if (task.category?.includes('disease')) {
          task.product_details = "Ridomil Gold/Krilaxyl - Metalaxyl-M + Mancozeb 68% WP";
        } else if (task.category?.includes('weed')) {
          task.product_details = "Atrazine 50% WP / Pendimethalin 30% EC";
        }
      }

      // Ensure ICAR guideline
      if (!task.icar_guideline || task.icar_guideline === 'null') {
        task.icar_guideline = `ICAR-${target.source} Package of Practices ${new Date().getFullYear()}`;
      }

      // Ensure ideal_weather
      if (!task.ideal_weather || typeof task.ideal_weather !== 'object') {
        task.ideal_weather = {
          temperature: "25-32°C",
          humidity: "60-75%",
          conditions: language === 'mr' ? "स्वच्छ/ढगाळ हवामान" : "साफ/बादल वाला मौसम",
          avoid_conditions: language === 'mr' ? "पाऊस किंवा तेज वारा" : "बारिश या तेज हवा"
        };
      } else {
        if (!task.ideal_weather.temperature) task.ideal_weather.temperature = "25-32°C";
        if (!task.ideal_weather.humidity) task.ideal_weather.humidity = "60-75%";
        if (!task.ideal_weather.conditions) task.ideal_weather.conditions = language === 'mr' ? "स्वच्छ हवामान" : "साफ मौसम";
      }

      return task;
    });

    // 11. Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from('crop_schedules').update({ is_active: false })
        .eq('land_id', landId).eq('is_active', true);
    }

    // 12. Save schedule with all context
    console.log('📝 [DB] Saving schedule to crop_schedules...');
    
    const harvestDate = new Date(sowingDateParsed.getTime());
    harvestDate.setDate(harvestDate.getDate() + (scheduleData.total_duration_days || 120));
    const harvestDateStr = `${harvestDate.getFullYear()}-${String(harvestDate.getMonth() + 1).padStart(2, '0')}-${String(harvestDate.getDate()).padStart(2, '0')}`;
    
    console.log(`📅 [Date] Sowing: ${sowingDate}, Harvest: ${harvestDateStr}, Duration: ${scheduleData.total_duration_days} days`);
    
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: localizedCrop.local,
        crop_variety: cropVariety || scheduleData.crop_variety,
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        expected_yield_quintals: scheduleData.expected_yield_quintals || scheduleData.expected_yield_per_acre * land.area_acres,
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          prompt_version: 'v6_world_class_enhanced',
          language,
          isReadyMadePlant,
          crop_season: scheduleData.crop_season,
          crop_name_english: cropName,
          crop_name_local: localizedCrop.local,
          suitability_check: {
            score: suitabilityCheck.score,
            suitable: suitabilityCheck.suitable,
            warnings: suitabilityCheck.warnings,
            risks: suitabilityCheck.risks,
            forced: forceGenerate && !suitabilityCheck.suitable
          },
          land_context: {
            area_acres: land.area_acres,
            soil_type: land.soil_type,
            irrigation_type: land.irrigation_type,
            npk: { current: { n: currentN, p: currentP, k: currentK }, target, deficit: { n: nDeficit, p: pDeficit, k: kDeficit } }
          },
          economic_projection: {
            total_cost: scheduleData.total_estimated_cost,
            expected_revenue: scheduleData.expected_revenue,
            expected_profit: scheduleData.expected_profit,
            roi_percentage: scheduleData.roi_percentage,
            break_even_yield: scheduleData.break_even_yield
          },
          ndvi_status: ndviStatus,
          weather_at_generation: weather?.current,
          ai_response: {
            organic_inputs: scheduleData.organic_inputs,
            chemical_fertilizers: scheduleData.chemical_fertilizers,
            seed_details: scheduleData.seed_details,
            icar_reference: scheduleData.icar_reference,
            university_reference: scheduleData.university_reference,
            yield_optimization_notes: scheduleData.yield_optimization_notes,
            suitability_notes: scheduleData.suitability_notes
          }
        }
      })
      .select()
      .single();

    if (scheduleError || !savedSchedule) {
      console.error('❌ [DB] Schedule save error:', scheduleError);
      throw new Error(`Failed to save schedule: ${scheduleError?.message || 'Unknown error'}`);
    }

    console.log(`✅ [DB] Schedule saved: ${savedSchedule.id}`);

    // 13. Prepare and insert tasks
    console.log(`📝 [DB] Preparing ${scheduleData.tasks.length} tasks...`);
    const tasksToInsert = scheduleData.tasks.map((task: any, index: number) => {
      const taskDate = new Date(sowingDateParsed.getTime());
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing ?? index * 7));
      const taskDateStr = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}-${String(taskDate.getDate()).padStart(2, '0')}`;
      
      return {
        schedule_id: savedSchedule.id,
        task_date: taskDateStr,
        task_type: task.category || 'other',
        task_name: task.task_name,
        task_description: task.description,
        status: 'pending',
        priority: task.priority || 'medium',
        weather_dependent: task.weather_dependent || false,
        instructions: task.instructions || [],
        precautions: task.precautions || [],
        resources: {
          quantity: task.quantity,
          product_details: task.product_details,
          chemical_group: task.chemical_group,
          dosage_per_acre: task.dosage_per_acre,
          water_volume_liters: task.water_volume_liters,
          pre_harvest_interval_days: task.pre_harvest_interval_days,
          icar_guideline: task.icar_guideline,
          ideal_weather: task.ideal_weather,
          yield_impact: task.yield_impact,
          skip_penalty: task.skip_penalty,
          cost_saving_tip: task.cost_saving_tip,
          alternative_option: task.alternative_option,
          days_from_sowing: task.days_from_sowing,
          can_be_delayed: task.can_be_delayed,
          max_delay_days: task.max_delay_days,
          ai_generated: true,
          land_area: land.area_acres,
          crop_name: localizedCrop.local
        },
        ideal_weather: task.ideal_weather,
        estimated_cost: task.estimated_cost,
        currency: 'INR'
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error('❌ [DB] Tasks insert error:', tasksError);
    } else {
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks`);
    }

    // 14. Log for AI training
    try {
      await supabase.from('ai_decision_log').insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        schedule_id: savedSchedule.id,
        decision_type: 'schedule_generation_v6',
        input_data: {
          land: { area: land.area_acres, soil: land.soil_type, irrigation: land.irrigation_type, npk: { n: currentN, p: currentP, k: currentK } },
          crop: cropName,
          sowingDate,
          weather: weather?.current,
          ndvi: ndviStatus,
          suitability: suitabilityCheck
        },
        output_data: scheduleData,
        reasoning: `Generated ${scheduleData.tasks.length} tasks for ${cropName} on ${land.area_acres} acres. Suitability: ${suitabilityCheck.score}%. Expected yield: ${scheduleData.expected_yield_quintals} qtl. Profit: ₹${scheduleData.expected_profit}`,
        model_version: AI_CONFIG.MODEL,
        success: true,
        execution_time_ms: Date.now() - startTime
      });
    } catch (e) {
      console.warn('Failed to log decision:', e);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule generated in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName: localizedCrop.local,
        cropNameEnglish: cropName,
        sowingDate: sowingDate,
        isReadyMadePlant: isReadyMadePlant,
        totalTasks: scheduleData.tasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: scheduleData.total_estimated_cost,
        expectedProfit: scheduleData.expected_profit,
        executionTimeMs: executionTime,
        suitability: {
          score: suitabilityCheck.score,
          suitable: suitabilityCheck.suitable,
          warnings: suitabilityCheck.warnings.length > 0 ? suitabilityCheck.warnings : undefined,
          risks: suitabilityCheck.risks.length > 0 ? suitabilityCheck.risks : undefined,
          warningMessage: suitabilityCheck.warningMessage || undefined
        },
        economicProjection: {
          totalCost: scheduleData.total_estimated_cost,
          expectedRevenue: scheduleData.expected_revenue,
          expectedProfit: scheduleData.expected_profit,
          roiPercentage: scheduleData.roi_percentage
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ AI Schedule Error:', error);
    return new Response(
      JSON.stringify({ error: error.message, details: 'Failed to generate crop schedule' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
