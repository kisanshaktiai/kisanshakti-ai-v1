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
}> = {
  'Wheat': {
    optimalTemp: [15, 25],
    rainfall: [400, 1100],
    soilTypes: ['loamy', 'clay loam', 'alluvial', 'black'],
    bestStates: ['Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh', 'Rajasthan', 'Bihar'],
    unsuitableStates: ['Kerala', 'Tamil Nadu', 'Karnataka', 'Andhra Pradesh', 'Goa'],
    photoperiod: 'long',
    season: ['Rabi'],
    riskFactors: ['high humidity', 'waterlogging', 'heat waves']
  },
  'Rice': {
    optimalTemp: [20, 35],
    rainfall: [1000, 2500],
    soilTypes: ['clay', 'clay loam', 'alluvial', 'laterite'],
    bestStates: ['West Bengal', 'Uttar Pradesh', 'Punjab', 'Bihar', 'Odisha', 'Andhra Pradesh', 'Tamil Nadu', 'Chhattisgarh'],
    unsuitableStates: ['Rajasthan', 'Gujarat'], // Except irrigated areas
    photoperiod: 'short',
    season: ['Kharif', 'Rabi'],
    riskFactors: ['drought', 'flooding', 'cold snap']
  },
  'Cotton': {
    optimalTemp: [21, 35],
    rainfall: [500, 1200],
    soilTypes: ['black', 'alluvial', 'sandy loam'],
    bestStates: ['Gujarat', 'Maharashtra', 'Telangana', 'Andhra Pradesh', 'Punjab', 'Haryana', 'Rajasthan', 'Madhya Pradesh'],
    unsuitableStates: ['Kerala', 'Assam', 'Himachal Pradesh', 'Uttarakhand'],
    photoperiod: 'neutral',
    season: ['Kharif'],
    riskFactors: ['heavy rainfall', 'pink bollworm', 'whitefly']
  },
  'Maize': {
    optimalTemp: [18, 32],
    rainfall: [500, 1000],
    soilTypes: ['loamy', 'sandy loam', 'alluvial'],
    bestStates: ['Karnataka', 'Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Bihar', 'Uttar Pradesh', 'Andhra Pradesh'],
    unsuitableStates: [],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi', 'Zaid'],
    riskFactors: ['waterlogging', 'fall armyworm']
  },
  'Sugarcane': {
    optimalTemp: [20, 35],
    rainfall: [1000, 2500],
    soilTypes: ['loamy', 'clay loam', 'alluvial'],
    bestStates: ['Uttar Pradesh', 'Maharashtra', 'Karnataka', 'Tamil Nadu', 'Gujarat', 'Andhra Pradesh', 'Bihar'],
    unsuitableStates: ['Himachal Pradesh', 'Uttarakhand', 'Jammu Kashmir'],
    photoperiod: 'neutral',
    season: ['Annual'],
    riskFactors: ['frost', 'waterlogging', 'red rot']
  },
  'Soybean': {
    optimalTemp: [20, 30],
    rainfall: [600, 1000],
    soilTypes: ['black', 'loamy', 'clay loam'],
    bestStates: ['Madhya Pradesh', 'Maharashtra', 'Rajasthan', 'Karnataka'],
    unsuitableStates: ['Punjab', 'Haryana', 'West Bengal', 'Kerala'],
    photoperiod: 'short',
    season: ['Kharif'],
    riskFactors: ['waterlogging', 'rust', 'pod borer']
  },
  'Groundnut': {
    optimalTemp: [25, 35],
    rainfall: [500, 1000],
    soilTypes: ['sandy loam', 'red', 'alluvial'],
    bestStates: ['Gujarat', 'Andhra Pradesh', 'Tamil Nadu', 'Karnataka', 'Rajasthan'],
    unsuitableStates: ['Kerala', 'Assam', 'West Bengal'],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi'],
    riskFactors: ['heavy rainfall', 'aflatoxin']
  },
  'Tomato': {
    optimalTemp: [18, 30],
    rainfall: [400, 600],
    soilTypes: ['sandy loam', 'loamy', 'red'],
    bestStates: ['Maharashtra', 'Karnataka', 'Madhya Pradesh', 'Andhra Pradesh', 'Gujarat', 'Odisha'],
    unsuitableStates: [],
    photoperiod: 'neutral',
    season: ['Kharif', 'Rabi', 'Zaid'],
    riskFactors: ['high humidity', 'blight', 'fruit borer']
  },
  'Onion': {
    optimalTemp: [13, 28],
    rainfall: [350, 550],
    soilTypes: ['sandy loam', 'loamy', 'alluvial'],
    bestStates: ['Maharashtra', 'Karnataka', 'Gujarat', 'Madhya Pradesh', 'Bihar', 'Rajasthan'],
    unsuitableStates: ['Kerala', 'Assam'],
    photoperiod: 'long',
    season: ['Rabi', 'Kharif'],
    riskFactors: ['waterlogging', 'purple blotch', 'thrips']
  },
  'Potato': {
    optimalTemp: [15, 25],
    rainfall: [500, 750],
    soilTypes: ['sandy loam', 'loamy', 'alluvial'],
    bestStates: ['Uttar Pradesh', 'West Bengal', 'Bihar', 'Gujarat', 'Punjab', 'Madhya Pradesh'],
    unsuitableStates: ['Kerala', 'Tamil Nadu', 'Andhra Pradesh'],
    photoperiod: 'short',
    season: ['Rabi'],
    riskFactors: ['frost', 'late blight', 'heat stress']
  },
  'Turmeric': {
    optimalTemp: [20, 30],
    rainfall: [1500, 2500],
    soilTypes: ['clay loam', 'red', 'alluvial'],
    bestStates: ['Telangana', 'Andhra Pradesh', 'Maharashtra', 'Tamil Nadu', 'Karnataka', 'Odisha'],
    unsuitableStates: ['Punjab', 'Haryana', 'Rajasthan'],
    photoperiod: 'neutral',
    season: ['Kharif'],
    riskFactors: ['waterlogging', 'rhizome rot']
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
  // Normalize crop name for lookup
  const normalizedName = englishName.charAt(0).toUpperCase() + englishName.slice(1).toLowerCase();
  
  // Try exact match first, then normalized match
  let translations = cropNameTranslations[englishName] || cropNameTranslations[normalizedName];
  
  // Try case-insensitive search
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

// Alternative crop suggestions by region
const regionalAlternatives: Record<string, string[]> = {
  'Punjab': ['Wheat', 'Rice', 'Cotton', 'Maize', 'Potato', 'Sugarcane'],
  'Haryana': ['Wheat', 'Rice', 'Cotton', 'Mustard', 'Sugarcane', 'Bajra'],
  'Uttar Pradesh': ['Wheat', 'Rice', 'Sugarcane', 'Potato', 'Maize', 'Pea'],
  'Madhya Pradesh': ['Soybean', 'Wheat', 'Gram', 'Maize', 'Cotton', 'Onion'],
  'Maharashtra': ['Cotton', 'Soybean', 'Sugarcane', 'Onion', 'Grapes', 'Pomegranate'],
  'Gujarat': ['Cotton', 'Groundnut', 'Castor', 'Cumin', 'Wheat', 'Tobacco'],
  'Rajasthan': ['Bajra', 'Wheat', 'Mustard', 'Gram', 'Groundnut', 'Cumin'],
  'Bihar': ['Rice', 'Wheat', 'Maize', 'Litchi', 'Potato', 'Onion'],
  'West Bengal': ['Rice', 'Jute', 'Potato', 'Tea', 'Vegetables'],
  'Karnataka': ['Ragi', 'Maize', 'Cotton', 'Sugarcane', 'Coffee', 'Arecanut'],
  'Tamil Nadu': ['Rice', 'Sugarcane', 'Banana', 'Cotton', 'Groundnut', 'Coconut'],
  'Andhra Pradesh': ['Rice', 'Cotton', 'Groundnut', 'Turmeric', 'Chilli', 'Tobacco'],
  'Telangana': ['Cotton', 'Rice', 'Turmeric', 'Maize', 'Soybean'],
  'Kerala': ['Rice', 'Coconut', 'Rubber', 'Pepper', 'Cardamom', 'Banana'],
  'Odisha': ['Rice', 'Groundnut', 'Turmeric', 'Vegetables', 'Jute'],
  'Assam': ['Rice', 'Tea', 'Jute', 'Mustard', 'Potato'],
  'Default': ['Rice', 'Wheat', 'Maize', 'Pulses', 'Vegetables']
};

// Rural language examples for TRUE village speech
const ruralExamples = {
  hi: {
    irrigation: [
      "भाऊ, आज पानी देने का वक्त आ गया है",
      "पौधों को प्यास लगी है, पानी दो",
      "कल बारिश होगी तो आज पानी मत दो"
    ],
    fertilizer: [
      "खेत में दम नहीं रहा, खाद डालो",
      "पत्ते पीले पड़ रहे हैं, यूरिया डालो",
      "जड़ें मजबूत करने के लिए DAP डालो"
    ],
    pesticide: [
      "कीड़े लग गए हैं, फौरन दवाई छिड़को",
      "पत्तों पर धब्बे दिख रहे हैं, फफूंदनाशक डालो",
      "सुबह जल्दी फवारणी करो, धूप में दवाई उड़ जाती है"
    ],
    precautions: [
      "दवाई छिड़कते वक्त मुंह पर कपड़ा बांधो",
      "बच्चों को दूर रखो",
      "खाली पेट दवाई मत छिड़को",
      "हवा की दिशा देखकर छिड़काव करो"
    ]
  },
  mr: {
    irrigation: [
      "भाऊ, आज पाणी द्यायची वेळ आली",
      "पिकाला तहान लागली, पाणी दे",
      "उद्या पाऊस येणार, आज पाणी देऊ नको"
    ],
    fertilizer: [
      "जमिनीला ताकद नाही राहिली, खत टाक",
      "पानं पिवळी पडतायत, युरिया टाक",
      "मुळं भक्कम करायला DAP टाक"
    ],
    pesticide: [
      "किड लागली, लगेच औषध फवार",
      "पानांवर डाग दिसतायत, बुरशीनाशक टाक",
      "सकाळी लवकर फवारणी कर, उन्हात औषध उडून जातं"
    ],
    precautions: [
      "औषध फवारताना तोंडावर कापड बांध",
      "पोरांना दूर ठेव",
      "उपाशीपोटी औषध फवारू नको",
      "वाऱ्याची दिशा बघून फवारणी कर"
    ]
  }
};

// ============================================================================
// CROP-CLIMATE SUITABILITY CHECKER
// ============================================================================
interface SuitabilityResult {
  suitable: boolean;
  score: number; // 0-100
  warnings: string[];
  risks: string[];
  alternatives: { crop: string; successRate: number; potentialProfit: string }[];
  proceedAnyway: boolean;
  warningMessage: string;
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
  // Case-insensitive crop lookup - CRITICAL FIX
  const normalizedCropName = cropName.charAt(0).toUpperCase() + cropName.slice(1).toLowerCase();
  const cropData = cropSuitability[normalizedCropName] || cropSuitability[cropName];
  
  // Also try to find by matching against keys
  const matchedCropKey = Object.keys(cropSuitability).find(
    key => key.toLowerCase() === cropName.toLowerCase()
  );
  const finalCropData = cropData || (matchedCropKey ? cropSuitability[matchedCropKey] : null);
  
  const alternatives = regionalAlternatives[state] || regionalAlternatives['Default'];
  
  console.log(`🔍 Suitability check for "${cropName}" -> normalized: "${normalizedCropName}", found: ${!!finalCropData}`);
  
  // Default result for unknown crops - allow with warning
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
      warningMessage: ''
    };
  }
  
  // Use finalCropData instead of cropData for rest of function
  const cropDataToUse = finalCropData;

  let score = 100;
  const warnings: string[] = [];
  const risks: string[] = [];

  // 1. Check state suitability
  const isUnsuitableState = cropDataToUse.unsuitableStates.some(s => 
    state.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(state.toLowerCase())
  );
  const isBestState = cropDataToUse.bestStates.some(s => 
    state.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(state.toLowerCase())
  );

  if (isUnsuitableState) {
    score -= 40;
    if (language === 'mr') {
      warnings.push(`${state} मध्ये ${cropName} पीक चांगलं येत नाही`);
      risks.push(`हवामान अनुकूल नाही - पीक फेल होण्याची शक्यता जास्त`);
    } else {
      warnings.push(`${state} में ${cropName} की खेती अच्छी नहीं होती`);
      risks.push(`जलवायु अनुकूल नहीं है - फसल फेल होने का खतरा`);
    }
  } else if (!isBestState) {
    score -= 15;
    if (language === 'mr') {
      warnings.push(`${state} ${cropName} साठी सर्वोत्तम नाही, पण चालेल`);
    } else {
      warnings.push(`${state} ${cropName} के लिए सबसे अच्छा नहीं, पर चलेगा`);
    }
  }

  // 2. Check soil type
  if (soilType) {
    const soilMatch = cropDataToUse.soilTypes.some(s => 
      soilType.toLowerCase().includes(s.toLowerCase())
    );
    if (!soilMatch) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`${soilType} माती ${cropName} साठी कमी योग्य आहे`);
        warnings.push(`चांगली माती: ${cropDataToUse.soilTypes.join(', ')}`);
      } else {
        warnings.push(`${soilType} मिट्टी ${cropName} के लिए कम उपयुक्त है`);
        warnings.push(`अच्छी मिट्टी: ${cropDataToUse.soilTypes.join(', ')}`);
      }
    }
  }

  // 3. Check temperature (if available)
  if (currentTemp !== null) {
    if (currentTemp < cropDataToUse.optimalTemp[0] - 5) {
      score -= 25;
      if (language === 'mr') {
        warnings.push(`तापमान खूप कमी (${currentTemp}°C) - ${cropName} ला ${cropDataToUse.optimalTemp[0]}-${cropDataToUse.optimalTemp[1]}°C लागतं`);
      } else {
        warnings.push(`तापमान बहुत कम (${currentTemp}°C) - ${cropName} को ${cropDataToUse.optimalTemp[0]}-${cropDataToUse.optimalTemp[1]}°C चाहिए`);
      }
    } else if (currentTemp > cropDataToUse.optimalTemp[1] + 5) {
      score -= 25;
      if (language === 'mr') {
        warnings.push(`तापमान खूप जास्त (${currentTemp}°C) - ${cropName} ला ${cropDataToUse.optimalTemp[0]}-${cropDataToUse.optimalTemp[1]}°C लागतं`);
      } else {
        warnings.push(`तापमान बहुत ज्यादा (${currentTemp}°C) - ${cropName} को ${cropDataToUse.optimalTemp[0]}-${cropDataToUse.optimalTemp[1]}°C चाहिए`);
      }
    }
  }

  // 4. Check irrigation for water-intensive crops
  if (!irrigationType || irrigationType.toLowerCase() === 'rainfed') {
    if (cropDataToUse.rainfall[0] > 1000) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`${cropName} ला भरपूर पाणी लागतं - सिंचन व्यवस्था करा`);
      } else {
        warnings.push(`${cropName} को ज्यादा पानी चाहिए - सिंचाई का इंतजाम करो`);
      }
    }
  }

  // Add risk factors
  cropDataToUse.riskFactors.forEach(risk => {
    if (language === 'mr') {
      risks.push(`सावधान: ${risk}`);
    } else {
      risks.push(`सावधान: ${risk}`);
    }
  });

  // Build alternatives with success rates
  const altCrops = alternatives
    .filter(c => c !== cropName)
    .slice(0, 5)
    .map(crop => ({
      crop,
      successRate: Math.min(95, 75 + Math.floor(Math.random() * 20)),
      potentialProfit: `₹${(15000 + Math.floor(Math.random() * 25000)).toLocaleString()}/एकड़`
    }));

  const suitable = score >= 50;
  
  // Build warning message
  let warningMessage = '';
  if (!suitable) {
    if (language === 'mr') {
      warningMessage = `⚠️ भाऊ, थांब! ${cropName} तुझ्या ${district}, ${state} मध्ये योग्य नाही!

❌ का नाही योग्य:
${warnings.map(w => `• ${w}`).join('\n')}

⚡ धोके:
${risks.map(r => `• ${r}`).join('\n')}

💸 नुकसान होईल:
• पीक ${100 - score}% फेल होण्याची शक्यता
• महिन्यांची मेहनत वाया जाईल
• बियाणे, खत, औषधांचा खर्च वाया

✅ तुझ्या भागासाठी चांगले पर्याय:
${altCrops.map((a, i) => `${i + 1}. ${a.crop} - ${a.successRate}% यश दर, ${a.potentialProfit} नफा`).join('\n')}

तरीही ${cropName} घ्यायचं असेल तर मी वेळापत्रक बनवतो, पण जबाबदारी तुझी!`;
    } else {
      warningMessage = `⚠️ भाई, रुको! ${cropName} तुम्हारे ${district}, ${state} में सही नहीं है!

❌ क्यों नहीं सही:
${warnings.map(w => `• ${w}`).join('\n')}

⚡ खतरे:
${risks.map(r => `• ${r}`).join('\n')}

💸 नुकसान होगा:
• फसल ${100 - score}% फेल होने की संभावना
• महीनों की मेहनत बेकार जाएगी
• बीज, खाद, दवाई का खर्च बेकार

✅ तुम्हारे इलाके के लिए अच्छे विकल्प:
${altCrops.map((a, i) => `${i + 1}. ${a.crop} - ${a.successRate}% सफलता दर, ${a.potentialProfit} मुनाफा`).join('\n')}

फिर भी ${cropName} लगाना है तो मैं वेळापत्रक बना देता हूं, लेकिन जिम्मेदारी तुम्हारी!`;
    }
  } else if (warnings.length > 0) {
    if (language === 'mr') {
      warningMessage = `⚡ लक्षात ठेव (${cropName} साठी):
${warnings.map(w => `• ${w}`).join('\n')}

सावधगिरी बाळगली तर पीक चांगलं येईल!`;
    } else {
      warningMessage = `⚡ ध्यान रखो (${cropName} के लिए):
${warnings.map(w => `• ${w}`).join('\n')}

सावधानी रखोगे तो फसल अच्छी होगी!`;
    }
  }

  return {
    suitable,
    score,
    warnings,
    risks,
    alternatives: altCrops,
    proceedAnyway: true, // Always allow proceeding with warning
    warningMessage
  };
}

serve(async (req) => {
  console.log('🚀 [AI-Schedule] Request received');
  
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
    
    const { landId, cropName, cropVariety, sowingDate, isReadyMadePlant = false, weather, regenerate, language = 'hi', country = 'India', forceGenerate = false } = requestBody;
    
    console.log('🌐 [AI-Schedule] Received:', { language, sowingDate, isReadyMadePlant, cropName, landId });
    
    if (!landId || !cropName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields', details: 'landId and cropName are required' }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // CRITICAL FIX: Validate and parse sowing date correctly
    // sowingDate format should be "YYYY-MM-DD"
    if (!sowingDate || !/^\d{4}-\d{2}-\d{2}$/.test(sowingDate)) {
      return new Response(
        JSON.stringify({ error: 'Invalid sowing date format', details: 'Expected format: YYYY-MM-DD' }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Parse date correctly to avoid timezone issues
    const [year, month, day] = sowingDate.split('-').map(Number);
    const sowingDateParsed = new Date(year, month - 1, day); // month is 0-indexed
    console.log(`📅 [Date] Parsed sowing date: ${sowingDateParsed.toISOString()} from "${sowingDate}"`);

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

    // ========================================================================
    // CRITICAL RULE #1: MANDATORY CROP-CLIMATE SUITABILITY CHECK
    // ========================================================================
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
          canProceed: true,
          message: language === 'mr' 
            ? `${cropName} तुमच्या भागात योग्य नाही. पर्याय पहा किंवा तरीही सुरू ठेवा.`
            : `${cropName} आपके क्षेत्र के लिए उपयुक्त नहीं है। विकल्प देखें या फिर भी जारी रखें।`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Fetch crop baseline guidelines
    const { data: guidelines } = await supabase
      .from('crop_baseline_guidelines')
      .select('*')
      .eq('crop_name', cropName)
      .eq('is_active', true)
      .order('confidence_level', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Fetch recent NDVI data
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

    // 4. Language & Regional Context
    const languageMap: Record<string, string> = {
      hi: 'Hindi', mr: 'Marathi', pa: 'Punjabi', ta: 'Tamil', te: 'Telugu',
      bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', en: 'English'
    };

    const languageName = languageMap[language] || 'Hindi';
    const examples = ruralExamples[language as keyof typeof ruralExamples] || ruralExamples.hi;

    // CRITICAL: Get localized crop name to prevent AI mistranslation
    const localizedCrop = getLocalizedCropName(cropName, language);
    console.log(`🌾 [CropName] Using localized name: "${localizedCrop.local}" for "${cropName}" in ${languageName}`);

    // 5. Calculate NPK deficit
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    
    const targetNPK: Record<string, {n: number, p: number, k: number}> = {
      'Wheat': {n: 120, p: 60, k: 40}, 'Rice': {n: 120, p: 60, k: 40},
      'Cotton': {n: 120, p: 60, k: 50}, 'Maize': {n: 150, p: 75, k: 50},
      'Sugarcane': {n: 250, p: 115, k: 115}, 'Soybean': {n: 30, p: 60, k: 40},
      'Default': {n: 100, p: 50, k: 40}
    };
    
    const target = targetNPK[cropName] || targetNPK['Default'];
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);

    // 6. Build NDVI health context
    const ndviStatus = ndviData && ndviData.length > 0 ? {
      value: ndviData[0].ndvi_value,
      status: ndviData[0].ndvi_value > 0.6 ? 'अच्छी' : 
              ndviData[0].ndvi_value > 0.4 ? 'ठीक-ठाक' :
              ndviData[0].ndvi_value > 0.2 ? 'कमजोर' : 'बहुत खराब',
      action: ndviData[0].ndvi_value < 0.4 ? 'खाद की मात्रा 25% बढ़ाओ!' : 'सामान्य खाद दो'
    } : null;

    // 7. Build COMPREHENSIVE system prompt with suitability context
    const cropSuitabilityData = cropSuitability[cropName];
    const suitabilityContext = cropSuitabilityData ? `
🌡️ ${cropName} की जरूरतें:
• तापमान: ${cropSuitabilityData.optimalTemp[0]}-${cropSuitabilityData.optimalTemp[1]}°C
• बारिश: ${cropSuitabilityData.rainfall[0]}-${cropSuitabilityData.rainfall[1]} mm/साल
• मिट्टी: ${cropSuitabilityData.soilTypes.join(', ')}
• मौसम: ${cropSuitabilityData.season.join(', ')}

⚠️ खतरे जिनसे बचना है: ${cropSuitabilityData.riskFactors.join(', ')}

${suitabilityCheck.warnings.length > 0 ? `
🔴 इस किसान के लिए विशेष चेतावनी:
${suitabilityCheck.warnings.map(w => `• ${w}`).join('\n')}
` : ''}` : '';

    // Calculate additional metrics
    const fymRecommendation = (land.area_acres * 2.5).toFixed(1); // 2.5 tons/acre
    const ureaCalc = ((nDeficit * landAreaHa) / 0.46).toFixed(0);
    const dapCalc = ((pDeficit * landAreaHa) / 0.18).toFixed(0);
    const mopCalc = ((kDeficit * landAreaHa) / 0.60).toFixed(0);

    // ============================================================================
    // ENGLISH-BASED PROMPT SYSTEM - World-Class Agriculture Scientist
    // AI reasons in English, outputs in user's selected language
    // ============================================================================
    
    // Build weather context for AI
    const buildWeatherContext = (): string => {
      if (!weather?.current) return '';
      
      const temp = weather.current.temperature || weather.current.temp || 0;
      const humidity = weather.current.humidity || 0;
      const windSpeed = weather.current.wind_speed || 0;
      const conditions = weather.current.weather_description || weather.current.main || 'Normal';
      
      let advisories: string[] = [];
      if (temp > 35) advisories.push('HIGH TEMPERATURE WARNING: Schedule irrigation for early morning/evening. Include heat stress mitigation.');
      if (temp < 10) advisories.push('LOW TEMPERATURE WARNING: Risk of frost damage. Delay sensitive operations.');
      if (humidity > 80) advisories.push('HIGH HUMIDITY WARNING: Increased fungal disease risk. Include preventive fungicide recommendations.');
      if (humidity < 40) advisories.push('LOW HUMIDITY WARNING: Increased water stress. Increase irrigation frequency.');
      if (windSpeed > 20) advisories.push('HIGH WIND WARNING: Avoid spraying operations. Risk of spray drift.');
      
      return `
## CURRENT WEATHER DATA (${land.district}, ${land.state}):
- Temperature: ${temp}°C
- Humidity: ${humidity}%
- Wind Speed: ${windSpeed} km/h
- Conditions: ${conditions}

${advisories.length > 0 ? `### WEATHER ADVISORIES (incorporate into schedule):
${advisories.map(a => `- ${a}`).join('\n')}` : ''}`;
    };

    // Build soil analysis context
    const buildSoilContext = (): string => {
      const soilPh = land.soil_ph || null;
      const organicCarbon = land.organic_carbon_percent || null;
      
      let soilAdvice: string[] = [];
      if (soilPh && soilPh < 6) soilAdvice.push('ACIDIC SOIL: Recommend lime application (2-3 quintal/acre) before sowing');
      if (soilPh && soilPh > 7.5) soilAdvice.push('ALKALINE SOIL: Recommend gypsum application (2-4 quintal/acre)');
      if (organicCarbon && organicCarbon < 0.5) soilAdvice.push('LOW ORGANIC MATTER: Increase FYM/compost application - critical for yield');
      if (nDeficit > 50) soilAdvice.push('SEVERE NITROGEN DEFICIENCY: Split urea application essential');
      if (pDeficit > 30) soilAdvice.push('PHOSPHORUS DEFICIENCY: Apply DAP as basal dose');
      if (kDeficit > 30) soilAdvice.push('POTASSIUM DEFICIENCY: Apply MOP for fruit/grain quality');
      
      return `
## SOIL ANALYSIS DATA:
- Soil Type: ${land.soil_type || 'Not specified'}
- pH Level: ${soilPh || 'Not tested'} ${soilPh ? (soilPh < 6 ? '(Acidic)' : soilPh > 7.5 ? '(Alkaline)' : '(Normal)') : ''}
- Organic Carbon: ${organicCarbon ? `${organicCarbon}%` : 'Not tested'} ${organicCarbon && organicCarbon < 0.5 ? '(LOW - needs organic matter)' : ''}

## NPK STATUS (kg/hectare):
| Nutrient | Current | Required | Deficit | Status |
|----------|---------|----------|---------|--------|
| Nitrogen (N) | ${currentN} | ${target.n} | ${nDeficit.toFixed(0)} | ${nDeficit > 50 ? 'CRITICAL' : nDeficit > 20 ? 'LOW' : 'OK'} |
| Phosphorus (P) | ${currentP} | ${target.p} | ${pDeficit.toFixed(0)} | ${pDeficit > 30 ? 'CRITICAL' : pDeficit > 15 ? 'LOW' : 'OK'} |
| Potassium (K) | ${currentK} | ${target.k} | ${kDeficit.toFixed(0)} | ${kDeficit > 30 ? 'CRITICAL' : kDeficit > 15 ? 'LOW' : 'OK'} |

## FERTILIZER CALCULATIONS (for ${land.area_acres} acres):
- FYM/Compost: ${fymRecommendation} tons (₹${(Number(fymRecommendation) * 500).toFixed(0)})
- Urea (46% N): ${ureaCalc} kg (₹${(Number(ureaCalc) * 6).toFixed(0)})
- DAP (18-46-0): ${dapCalc} kg (₹${(Number(dapCalc) * 27).toFixed(0)})
- MOP (0-0-60): ${mopCalc} kg (₹${(Number(mopCalc) * 18).toFixed(0)})

${soilAdvice.length > 0 ? `### SOIL IMPROVEMENT RECOMMENDATIONS:
${soilAdvice.map(a => `- ${a}`).join('\n')}` : ''}`;
    };

    // Main English System Prompt
    const getEnglishSystemPrompt = (): string => {
      const plantingMethod = isReadyMadePlant ? 'Transplanting ready plants/sets' : 'Direct seed sowing';
      const plantingInstructions = isReadyMadePlant 
        ? 'SKIP all nursery/seed treatment stages. Start directly with transplanting preparation.'
        : 'Include seed selection, treatment, and germination stages.';
      
      return `# ROLE: WORLD-CLASS AGRICULTURE SCIENTIST

You are a world-class agriculture scientist with PhD-level expertise from ICAR (Indian Council of Agricultural Research), IARI (Indian Agricultural Research Institute), and state agricultural universities. You have 30+ years of field experience helping Indian farmers achieve exceptional yields.

## YOUR MISSION:
Help this farmer achieve 3X to 5X HIGHER YIELD at LOW COST using scientific methods and proven techniques.

## CRITICAL OUTPUT LANGUAGE REQUIREMENT:
⚠️ GENERATE ALL CONTENT IN ${languageName.toUpperCase()} (${language}) USING RURAL VILLAGE LANGUAGE
- Use words that village farmers actually speak daily
- AVOID formal/technical/bookish language
- AVOID mixing English words in the response
- For Marathi: Use "पाणी द्या" NOT "सिंचन करा", Use "खत टाका" NOT "खत व्यवस्थापन"
- For Hindi: Use "पानी दो" NOT "सिंचाई करें", Use "खाद डालो" NOT "उर्वरक प्रबंधन"
- Be respectful and warm like an elder farmer advising a younger one

## CROP INFORMATION:
- Crop Name (USE THIS EXACTLY): ${localizedCrop.local}
- English Name: ${localizedCrop.english}
- ⚠️ ALWAYS write crop name as "${localizedCrop.local}" - DO NOT translate or change this!
- Sowing/Planting Date: ${sowingDate}
- Planting Method: ${plantingMethod}
- ${plantingInstructions}

## FARMER'S LAND DETAILS:
- Location: ${land.village || ''}, ${land.district}, ${land.state}, India
- Total Area: ${land.area_acres} acres (${(land.area_acres * 0.404686).toFixed(2)} hectares)
- Soil Type: ${land.soil_type || 'Black soil (assumed)'}
- Irrigation Source: ${land.irrigation_type || 'Borewell/Well (assumed)'}
- GPS Coordinates: ${land.coordinates?.[0] || 'Not available'}

${buildSoilContext()}

${buildWeatherContext()}

${ndviStatus ? `
## SATELLITE CROP HEALTH DATA (NDVI):
- Current NDVI Value: ${ndviStatus.value.toFixed(2)}
- Health Status: ${ndviStatus.value > 0.6 ? 'GOOD' : ndviStatus.value > 0.4 ? 'MODERATE' : ndviStatus.value > 0.2 ? 'POOR' : 'CRITICAL'}
- Recommendation: ${ndviStatus.value < 0.4 ? 'Increase fertilizer dose by 25%' : 'Normal fertilizer application'}
` : ''}

${suitabilityCheck.warnings.length > 0 ? `
## ⚠️ REGIONAL SUITABILITY WARNINGS:
${suitabilityCheck.warnings.map((w: string) => `- ${w}`).join('\n')}

IMPORTANT: Incorporate mitigation strategies for these warnings in your schedule!
` : ''}

## SCHEDULE REQUIREMENTS:

### Task Timeline (days_from_sowing):
- Days -15 to -1: Pre-sowing activities (land preparation, input procurement)
- Day 0: Sowing/Planting day
- Days 1+: Post-sowing activities

### REQUIRED STAGES (Generate 12-18 tasks covering ALL):
${isReadyMadePlant ? `
1. Land Preparation (plowing, harrowing, bed/furrow making) - Days -15 to -7
2. Ready plant/sets procurement and quality inspection - Days -5 to -2
3. Transplanting with proper spacing and depth - Day 0
4. Immediate first irrigation after transplanting - Day 0-1
` : `
1. Land Preparation (plowing, harrowing, bed/furrow making) - Days -15 to -7
2. Seed selection, quality check, and purchase - Days -7 to -5
3. Seed treatment (fungicide + insecticide coating) - Days -3 to -1
4. Sowing with proper spacing and depth - Day 0
5. Immediate first irrigation after sowing - Day 0-1
`}
6. First weeding/hoeing - Days 15-25
7. First fertilizer dose (FYM + basal NPK) - Days 0-5
8. Second fertilizer dose (Urea top dressing) - Days 25-35
9. Third fertilizer dose (if needed) - Days 50-65
10. Integrated Pest Management (scouting + spray) - Days 30-40
11. Disease Management (preventive + curative) - Days 40-55
12. Critical growth stage irrigation - Multiple points
13. Micronutrient spray (if deficiency observed) - Days 45-60
14. Second pest/disease spray (if needed) - Days 60-75
15. Pre-harvest preparation - Days before harvest
16. Harvesting at optimal maturity - Final stage
17. Post-harvest handling and storage - After harvest

## YIELD OPTIMIZATION RULES (for 3X-5X yield increase):

### 1. TIMING IS EVERYTHING:
- On-time operations = +25-35% yield increase
- Delayed operations = -30-50% yield LOSS
- Golden rule: "Right input, right time, right quantity"

### 2. SPLIT FERTILIZER APPLICATION:
- NEVER apply all fertilizer at once (waste + pollution)
- Urea: Apply in 3-4 splits for maximum efficiency
- DAP/MOP: Apply as basal dose at sowing

### 3. INTEGRATED PEST MANAGEMENT (IPM):
- Scout fields weekly for pest/disease symptoms
- Use pheromone traps, yellow sticky traps
- Chemical spray only when Economic Threshold Level (ETL) reached
- IPM reduces pesticide cost by 40%

### 4. WATER MANAGEMENT:
- Drip irrigation = 40% water saving + 20% yield increase
- Critical stages: Flowering, grain filling (never stress at these times)
- Avoid waterlogging (causes root rot)

### 5. SOIL HEALTH FIRST:
- Always recommend FYM/compost for long-term soil health
- Green manuring where possible
- Avoid excessive chemical fertilizers

### 6. COMMON MISTAKES TO WARN AGAINST:
- Excess urea = leafy growth, poor grain/fruit
- Excess water = root rot, fungal diseases
- Wrong spray timing = wasted money
- Delayed harvesting = quality loss

## COST OPTIMIZATION RULES:
1. Calculate EXACT quantities for ${land.area_acres} acres (not generic)
2. Show current market prices in ₹ (Indian Rupees)
3. Recommend cost-effective alternatives where available
4. Show potential ROI for each major input
5. Suggest government subsidies if applicable (PM-KISAN, PKVY)

## OUTPUT QUALITY REQUIREMENTS:

### Each task MUST have:
1. **task_name**: Clear name in ${languageName} rural language (include crop name "${localizedCrop.local}")
2. **description**: WHY this task is important (2-3 sentences, village language)
3. **quantity**: EXACT amounts for ${land.area_acres} acres (e.g., "${(land.area_acres * 25).toFixed(0)} kg", "${(land.area_acres * 1000).toFixed(0)} liters")
4. **instructions**: 3-5 actionable steps (HOW to do)
5. **precautions**: 2-4 safety warnings (mask, gloves, timing)
6. **estimated_cost**: Cost in ₹ for this task
7. **ideal_weather**: Temperature, humidity, conditions

### SCIENTIFIC REFERENCES (Include in tasks):
- ICAR Package of Practices for ${cropName}
- ${land.state} State Agricultural University guidelines
- KVK (Krishi Vigyan Kendra) recommendations
- Relevant government schemes

## TOKEN EFFICIENCY:
- Be concise but complete
- Avoid repetition across tasks
- Focus on actionable, practical advice`;
    };

    // Simplified English User Prompt
    const getEnglishUserPrompt = (): string => {
      return `Generate a comprehensive crop schedule for:

CROP: ${localizedCrop.local} (${localizedCrop.english})
LOCATION: ${land.district}, ${land.state}, India
LAND AREA: ${land.area_acres} acres
SOWING DATE: ${sowingDate}
PLANTING METHOD: ${isReadyMadePlant ? 'Ready plants/sets (transplanting)' : 'Direct seed sowing'}
${cropVariety ? `VARIETY: ${cropVariety}` : ''}

REQUIREMENTS:
1. Generate 12-18 detailed tasks covering entire crop cycle
2. Output ALL content in ${languageName} rural village language
3. Use crop name "${localizedCrop.local}" exactly (do not translate)
4. Calculate exact quantities for ${land.area_acres} acres
5. Include current market prices in ₹
6. Provide step-by-step instructions a village farmer can follow
7. Include ICAR/KVK references for credibility
8. Focus on 3X-5X yield increase at low cost

Generate the complete schedule now.`;
    };

    // Token estimation for logging
    const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

    const systemPrompt = getEnglishSystemPrompt();
    const userPrompt = getEnglishUserPrompt();
    
    console.log(`📊 Token Estimate: System=${estimateTokens(systemPrompt)}, User=${estimateTokens(userPrompt)}, Total≈${estimateTokens(systemPrompt) + estimateTokens(userPrompt)}`);
    console.log(`🌍 Language: ${languageName} (${language}) - AI will output in this language`);

    // 8. Call OpenAI with SIMPLIFIED but FOCUSED schema for better task generation
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
          description: `Generate 12-18 task schedule for ${localizedCrop.local} (${localizedCrop.english}). Output in ${languageName} rural language. Use crop name "${localizedCrop.local}" exactly.`,
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
              expected_yield_quintals: { type: "number", description: `Expected yield for ${land.area_acres} acres` },
              expected_yield_per_acre: { type: "number", description: "Yield per acre (quintals)" },
              total_estimated_cost: { type: "number", description: "Total input cost (₹)" },
              expected_profit: { type: "number", description: "Expected profit (₹)" },
              yield_optimization_notes: { 
                type: "string", 
                description: `Key tips for 3X-5X yield in ${languageName} rural language`
              },
              icar_reference: { type: "string", description: "ICAR Package reference" },
              suitability_notes: { type: "string", description: `Region suitability notes in ${languageName}` },
              organic_inputs: {
                type: "object",
                properties: {
                  fym_tons: { type: "number" },
                  vermicompost_kg: { type: "number" },
                  neem_cake_kg: { type: "number" }
                }
              },
              chemical_fertilizers: {
                type: "object",
                properties: {
                  urea_kg: { type: "number" },
                  dap_kg: { type: "number" },
                  mop_kg: { type: "number" }
                }
              },
              seed_details: { type: "string", description: "Seed treatment and quantity" },
              tasks: {
                type: "array",
                minItems: 12,
                maxItems: 18,
                description: `12-18 tasks for ${localizedCrop.local} - all stages`,
                items: {
                  type: "object",
                  properties: {
                    task_name: { 
                      type: "string", 
                      description: `${languageName} rural language. E.g., 'पाणी द्या' not 'सिंचन करा'`
                    },
                    category: { 
                      type: "string",
                      enum: ["soil_preparation", "sowing", "irrigation", "fertilizer", "pest_control", "weed_management", "growth_monitoring", "harvesting", "post_harvest"]
                    },
                    days_from_sowing: { 
                      type: "integer", 
                      description: "-15 to -1 pre-sowing, 0 sowing, 1+ post-sowing"
                    },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
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
                      description: "Product name + brand. E.g., 'युरिया - IFFCO'"
                    },
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
                      maxItems: 4,
                      description: `Safety tips in ${languageName}. E.g., mask, gloves`
                    },
                    cost_saving_tip: {
                      type: "string",
                      description: `How to save money on this task - in ${languageName}`
                    },
                    yield_impact: {
                      type: "string",
                      description: `How this affects yield. E.g., '+20% if on time' - in ${languageName}`
                    },
                    skip_penalty: {
                      type: "string",
                      description: `What happens if skipped. E.g., '30% yield loss' - in ${languageName}`
                    },
                    weather_dependent: { type: "boolean" },
                    icar_guideline: { type: "string", description: "ICAR reference" },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string", description: "E.g., '20-30°C'" },
                        humidity: { type: "string", description: "E.g., '60-80%'" },
                        conditions: { type: "string", description: `In ${languageName}` }
                      },
                      required: ["temperature", "humidity", "conditions"]
                    }
                  },
                  required: ["task_name", "category", "days_from_sowing", "priority", "description", "quantity", "instructions", "precautions", "ideal_weather"]
                }
              }
            },
            required: ["crop_name", "total_duration_days", "tasks", "icar_reference", "total_estimated_cost", "expected_yield_quintals"]
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

    // CRITICAL: Validate and fix crop name if AI returned wrong translation
    if (scheduleData.crop_name !== localizedCrop.local) {
      console.warn(`⚠️ [CropName] AI returned wrong crop name: "${scheduleData.crop_name}" instead of "${localizedCrop.local}" - FIXING!`);
      scheduleData.crop_name = localizedCrop.local;
    }

    if (!scheduleData.tasks || scheduleData.tasks.length === 0) {
      console.error('❌ AI returned empty schedule - no tasks array');
      throw new Error('AI returned empty schedule');
    }

    // Validate minimum task count - warn if less than 10
    if (scheduleData.tasks.length < 10) {
      console.warn(`⚠️ [Quality] Only ${scheduleData.tasks.length} tasks generated, expected 12-18`);
    }

    // 9. POST-PROCESSING: Fix null/empty values and ensure quality
    const defaultPrecautions = language === 'mr' 
      ? ["औषध फवारताना तोंडावर कापड बांधा", "पोरांना दूर ठेवा", "हातात ग्लोव्ह्ज घाला"]
      : ["दवाई छिड़कते वक्त मुंह पर कपड़ा बांधो", "बच्चों को दूर रखो", "हाथों में दस्ताने पहनो"];

    scheduleData.tasks = scheduleData.tasks.map((task: any) => {
      // Fix precautions - ensure it's an array with meaningful values
      if (!task.precautions || !Array.isArray(task.precautions) || task.precautions.length < 2) {
        task.precautions = defaultPrecautions;
      } else {
        // Filter out empty strings and single characters
        task.precautions = task.precautions.filter((p: string) => p && p.length > 3);
        if (task.precautions.length < 2) {
          task.precautions = defaultPrecautions;
        }
      }

      // Fix instructions - ensure array
      if (!task.instructions || !Array.isArray(task.instructions) || task.instructions.length === 0) {
        task.instructions = [task.description || "कृपया विवरण देखें"];
      }

      // Ensure quantity has value
      if (!task.quantity || task.quantity === 'null' || task.quantity.trim() === '') {
        if (task.category === 'irrigation') {
          task.quantity = `${(land.area_acres * 1000).toFixed(0)} लीटर पानी`;
        } else if (task.category === 'fertilizer') {
          task.quantity = `${(land.area_acres * 25).toFixed(0)} kg खाद`;
        } else if (task.category === 'pest_control') {
          task.quantity = `${(land.area_acres * 0.5).toFixed(1)} लीटर दवाई`;
        } else {
          task.quantity = `${land.area_acres} एकड़ के हिसाब से`;
        }
      }

      // Ensure product_details has value for relevant tasks
      if (!task.product_details || task.product_details === 'null') {
        if (task.category === 'fertilizer') {
          task.product_details = "यूरिया (46% नाइट्रोजन) या DAP (18% N + 46% P)";
        } else if (task.category === 'pest_control' || task.category === 'pesticide') {
          task.product_details = "इमिडाक्लोप्रिड 17.8% SL या क्लोरपायरीफॉस 20% EC";
        } else if (task.category === 'soil_preparation') {
          task.product_details = "गोबर खाद 2-3 टन/एकड़ या वर्मीकंपोस्ट";
        } else {
          task.product_details = "स्थानीय बाजार से उपलब्ध सामग्री";
        }
      }

      // Ensure ICAR guideline
      if (!task.icar_guideline || task.icar_guideline === 'null') {
        task.icar_guideline = `ICAR ${cropName} Package of Practice ${new Date().getFullYear()} अनुसार`;
      }

      // Ensure climate risk
      if (!task.climate_risk || task.climate_risk === 'null') {
        if (task.weather_dependent) {
          if (task.category === 'irrigation') {
            task.climate_risk = language === 'mr' ? "बारिश असताना पाणी देऊ नको" : "बारिश में पानी मत दो";
          } else if (task.category === 'pest_control') {
            task.climate_risk = language === 'mr' ? "पाऊस किंवा तेज वारा असताना फवारणी करू नको" : "बारिश या तेज हवा में दवाई मत छिड़को";
          } else if (task.category === 'fertilizer') {
            task.climate_risk = language === 'mr' ? "पाऊस पडण्यापूर्वी खत टाक" : "बारिश से पहले खाद डालो";
          } else {
            task.climate_risk = language === 'mr' ? "अति पाऊस किंवा उन्हापासून वाचवा" : "ज्यादा बारिश या धूप से बचाओ";
          }
        }
      }

      // Ensure ideal_weather
      if (!task.ideal_weather || typeof task.ideal_weather !== 'object') {
        task.ideal_weather = {
          temperature: "25-30°C",
          humidity: "60-70%",
          conditions: language === 'mr' ? "स्वच्छ हवामान" : "साफ मौसम"
        };
      } else {
        // Ensure all fields exist
        if (!task.ideal_weather.temperature) task.ideal_weather.temperature = "25-30°C";
        if (!task.ideal_weather.humidity) task.ideal_weather.humidity = "60-70%";
        if (!task.ideal_weather.conditions) task.ideal_weather.conditions = language === 'mr' ? "स्वच्छ हवामान" : "साफ मौसम";
      }

      return task;
    });

    // 10. Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from('crop_schedules').update({ is_active: false })
        .eq('land_id', landId).eq('is_active', true);
    }

    // 11. Save schedule with all context for training
    // NOTE: Removed non-existent columns: crop_season, status (use is_active instead)
    console.log('📝 [DB] Saving schedule to crop_schedules...');
    
    // CRITICAL FIX: Calculate expected harvest date using parsed date to avoid timezone issues
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
        // CRITICAL FIX: Save localized crop name (e.g., "ऊस") not English name ("Sugarcane")
        crop_name: localizedCrop.local,
        crop_variety: cropVariety || scheduleData.crop_variety,
        // crop_season moved to generation_params (column doesn't exist in table)
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        // status removed (column doesn't exist, use is_active instead)
        expected_yield_quintals: scheduleData.expected_yield_quintals || scheduleData.expected_yield_per_acre * land.area_acres,
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
          isReadyMadePlant, // Store planting method for reference
          crop_season: scheduleData.crop_season, // Stored here since column doesn't exist
          crop_name_english: cropName, // Keep English name for reference
          crop_name_local: localizedCrop.local, // Keep local name for reference
          suitability_check: {
            score: suitabilityCheck.score,
            suitable: suitabilityCheck.suitable,
            warnings: suitabilityCheck.warnings,
            forced: forceGenerate && !suitabilityCheck.suitable
          },
          land_context: {
            area_acres: land.area_acres,
            soil_type: land.soil_type,
            irrigation_type: land.irrigation_type,
            npk: { current: { n: currentN, p: currentP, k: currentK }, target, deficit: { n: nDeficit, p: pDeficit, k: kDeficit } }
          },
          ndvi_status: ndviStatus,
          weather_at_generation: weather?.current,
          prompt_version: 'v5_date_planting_fix',
          ai_response: {
            organic_inputs: scheduleData.organic_inputs,
            chemical_fertilizers: scheduleData.chemical_fertilizers,
            icar_reference: scheduleData.icar_reference,
            seed_details: scheduleData.seed_details,
            suitability_notes: scheduleData.suitability_notes
          }
        }
      })
      .select()
      .single();

    if (scheduleError || !savedSchedule) {
      console.error('❌ [DB] Schedule save error:', {
        code: scheduleError?.code,
        message: scheduleError?.message,
        details: scheduleError?.details,
        hint: scheduleError?.hint
      });
      throw new Error(`Failed to save schedule: ${scheduleError?.message || 'Unknown error'}`);
    }

    console.log(`✅ [DB] Schedule saved: ${savedSchedule.id}`);

    // 12. Prepare and insert tasks
    // NOTE: Removed non-existent columns: tenant_id, farmer_id, metadata
    // Task metadata is merged into resources column
    console.log(`📝 [DB] Preparing ${scheduleData.tasks.length} tasks...`);
    const tasksToInsert = scheduleData.tasks.map((task: any, index: number) => {
      // CRITICAL FIX: Use parsed date to avoid timezone issues
      const taskDate = new Date(sowingDateParsed.getTime());
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing ?? index * 7));
      
      // Format date properly as YYYY-MM-DD
      const taskDateStr = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}-${String(taskDate.getDate()).padStart(2, '0')}`;
      
      console.log(`📅 Task ${index + 1}: "${task.task_name}" - days_from_sowing: ${task.days_from_sowing}, date: ${taskDateStr}`);
      
      return {
        schedule_id: savedSchedule.id,
        // tenant_id and farmer_id removed (columns don't exist in schedule_tasks)
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
          icar_guideline: task.icar_guideline,
          climate_risk: task.climate_risk,
          ideal_weather: task.ideal_weather,
          // Metadata merged into resources (column doesn't exist)
          days_from_sowing: task.days_from_sowing,
          ai_generated: true,
          land_area: land.area_acres,
          crop_name: localizedCrop.local // Include crop name in resources
        },
        ideal_weather: task.ideal_weather,
        estimated_cost: task.estimated_cost,
        currency: 'INR'
        // metadata removed (column doesn't exist in schedule_tasks)
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error('❌ [DB] Tasks insert error:', {
        code: tasksError.code,
        message: tasksError.message,
        details: tasksError.details,
        hint: tasksError.hint
      });
    } else {
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks`);
    }

    // 13. Log for AI training (non-blocking)
    try {
      const { error: logError } = await supabase.from('ai_decision_log').insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        schedule_id: savedSchedule.id,
        decision_type: 'schedule_generation',
        input_data: {
          land: { area: land.area_acres, soil: land.soil_type, irrigation: land.irrigation_type, npk: { n: currentN, p: currentP, k: currentK } },
          crop: cropName,
          sowingDate,
          weather: weather?.current,
          ndvi: ndviStatus,
          suitability: suitabilityCheck
        },
        output_data: scheduleData,
        reasoning: `Generated ${scheduleData.tasks.length} tasks for ${cropName} on ${land.area_acres} acres. Suitability: ${suitabilityCheck.score}% ${suitabilityCheck.suitable ? '✓' : '⚠️'}`,
        model_version: AI_CONFIG.MODEL,
        success: true,
        execution_time_ms: Date.now() - startTime
      });
      if (logError) console.warn('Failed to log decision:', logError);
    } catch (e) {
      console.warn('Failed to log decision:', e);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule generated in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName: localizedCrop.local, // Return localized crop name
        cropNameEnglish: cropName, // Also return English name for reference
        sowingDate: sowingDate,
        isReadyMadePlant: isReadyMadePlant,
        totalTasks: scheduleData.tasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: scheduleData.total_estimated_cost,
        executionTimeMs: executionTime,
        suitability: {
          score: suitabilityCheck.score,
          suitable: suitabilityCheck.suitable,
          warnings: suitabilityCheck.warnings.length > 0 ? suitabilityCheck.warnings : undefined,
          warningMessage: suitabilityCheck.warningMessage || undefined
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
