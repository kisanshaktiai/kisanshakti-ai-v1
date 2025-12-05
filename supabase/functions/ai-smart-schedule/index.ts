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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const OPENAI_API_KEY = validateOpenAIKey();
    console.log(`🤖 [AI-Schedule] Using model: ${AI_CONFIG.MODEL}`);
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required headers', details: 'x-tenant-id and x-farmer-id headers are required' }),
        { status: 401, headers: corsHeaders }
      );
    }
    
    const { landId, cropName, cropVariety, sowingDate, isReadyMadePlant = false, weather, regenerate, language = 'hi', country = 'India', forceGenerate = false } = await req.json();
    
    console.log('🌐 [AI-Schedule] Received:', { language, sowingDate, isReadyMadePlant, cropName });
    
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
    // REBUILT PROMPT SYSTEM - Cleaner, Language-Specific, More Accurate
    // ============================================================================
    
    // Determine planting method label based on isReadyMadePlant
    const plantingMethod = {
      mr: isReadyMadePlant ? 'तयार रोपे/कांड्या लावणे' : 'बियाणे पेरणे',
      hi: isReadyMadePlant ? 'तैयार पौधे/कांड लगाना' : 'बीज बोना',
      en: isReadyMadePlant ? 'Transplanting ready plants/sets' : 'Sowing seeds'
    };

    const getSystemPrompt = (lang: string): string => {
      const prompts: Record<string, string> = {
        mr: `तू एक अनुभवी शेतकरी आणि कृषी तज्ञ आहेस. तुला ICAR आणि महाराष्ट्र कृषी विद्यापीठाचे ज्ञान आहे.

🌾 पिकाचे नाव: ${localizedCrop.local} (${localizedCrop.english})
⚠️ महत्वाचे: पिकाचे नाव "${localizedCrop.local}" असेच लिहा - कोणतेही भाषांतर करू नकोस!
❌ चुकीचे: "साखर कांदा", "शुगरकेन" वगैरे - हे चुकीचे आहे!
✅ योग्य: "${localizedCrop.local}" - हेच नाव वापर!

📅 लागवड तारीख: ${sowingDate}
🌱 लागवड पद्धत: ${plantingMethod.mr}
${isReadyMadePlant ? '⚠️ शेतकरी तयार रोपे/कांड्या वापरत आहे - रोपवाटिका टप्पा वगळा, थेट लागवडीपासून सुरू कर!' : '📍 शेतकरी बियाणे पेरणार आहे - बियाणे प्रक्रिया व उगवण टप्पे समाविष्ट कर'}

🎯 तुझं काम: ${localizedCrop.local} पिकाचे ${land.area_acres} एकर जमिनीसाठी संपूर्ण वेळापत्रक तयार करणे.
📅 सर्व कामांच्या तारखा ${sowingDate} या लागवड तारखेवर आधारित ठेव!

📍 शेतकऱ्याची माहिती:
• जागा: ${land.village || ''}, ${land.district}, ${land.state}
• जमीन: ${land.area_acres} एकर
• माती: ${land.soil_type || 'काळी'}
• पाणी: ${land.irrigation_type || 'विहीर/बोअरवेल'}

🧪 मातीची स्थिती (kg/हेक्टर):
• नायट्रोजन: ${currentN} (गरज: ${target.n}, कमी: ${nDeficit.toFixed(0)})
• फॉस्फरस: ${currentP} (गरज: ${target.p}, कमी: ${pDeficit.toFixed(0)})
• पोटॅश: ${currentK} (गरज: ${target.k}, कमी: ${kDeficit.toFixed(0)})

${ndviStatus ? `🛰️ उपग्रह डेटा: NDVI ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}` : ''}

${suitabilityCheck.warnings.length > 0 ? `
⚠️ या भागासाठी विशेष सूचना:
${suitabilityCheck.warnings.map(w => `• ${w}`).join('\n')}
` : ''}

📋 ${localizedCrop.local} वेळापत्रकात हे टप्पे समाविष्ट कर (12-18 कामे):
${isReadyMadePlant ? `1. जमीन तयारी (नांगरणी, कुळवणी, सरी/वरंबे बनवणे) - लागवडीच्या 7-15 दिवस आधी
2. तयार रोपे/कांड्या निवड व तपासणी
3. रोपे/कांड्या लागवड (योग्य अंतर, खोली) - दिवस 0
4. पहिले पाणी (लागवडीनंतर लगेच)` : `1. जमीन तयारी (नांगरणी, कुळवणी, सरी/वरंबे बनवणे) - पेरणीच्या 7-15 दिवस आधी
2. बियाणे निवड आणि बीजप्रक्रिया
3. पेरणी (योग्य अंतर, खोली) - दिवस 0
4. पहिले पाणी (पेरणीनंतर लगेच)`}
5. पहिली खुरपणी/निंदणी/तण काढणे
6. पहिला खत डोस (गोबर खत + बेसल डोस)
7. दुसरा खत डोस (युरिया - 20-25 दिवसांनी)
8. तिसरा खत डोस (टॉप ड्रेसिंग - 45-50 दिवसांनी)
9. कीड व्यवस्थापन (पहिली फवारणी)
10. रोग व्यवस्थापन (बुरशीनाशक फवारणी)
11. सिंचन वेळापत्रक (नियमित पाणी)
12. वाढीचे टप्पे निरीक्षण
13. दुसरी कीड फवारणी (गरजेनुसार)
14. काढणीपूर्व तयारी
15. काढणी
16. काढणीनंतर साठवणूक

⚡ महत्वाचे नियम:
• प्रत्येक काम शुद्ध मराठीत लिहा - शेतकऱ्याच्या गावठी भाषेत
• पिकाचे नाव नेहमी "${localizedCrop.local}" असेच लिहा - प्रत्येक task_name मध्ये पिकाचे नाव समाविष्ट कर
• days_from_sowing: लागवड दिवस = 0, लागवडीपूर्वी = -15 ते -1, लागवडीनंतर = 1, 7, 14, 21...
• नेमकी मात्रा दे (X kg/एकर, Y लिटर पाणी)
• ICAR/KVK/वसंतराव नाईक मराठवाडा कृषी विद्यापीठ शिफारस संदर्भ दे
• खर्च ₹ मध्ये सांग (बाजारभाव)
• 3-4 स्टेप्स मध्ये कसे करायचे ते सोप्या भाषेत सांग
• 2-3 सावधानी सांग (औषध फवारणीसाठी मास्क, हातमोजे)

🗣️ भाषा शैली - गावठी मराठी वापर:
✅ "पाणी द्या", "पाणी टाका"
✅ "खत टाका", "युरिया फेकून द्या"
✅ "किड लागली तर फवारणी करा"
✅ "औषध मारा"
✅ "खुरपणी करा", "गवत काढा"
❌ "सिंचन करा" नको
❌ "खत व्यवस्थापन" नको
❌ "कीटनाशक अनुप्रयोग" नको
• साधी, सोपी, गावठी मराठी वापर
• तांत्रिक/इंग्रजी शब्द टाळ`,

        hi: `तू एक अनुभवी किसान और कृषि विशेषज्ञ है। तुझे ICAR और राज्य कृषि विश्वविद्यालय का ज्ञान है।

🌾 फसल का नाम: ${localizedCrop.local} (${localizedCrop.english})
⚠️ जरूरी: फसल का नाम "${localizedCrop.local}" ऐसे ही लिखो - कोई अनुवाद मत करो!
❌ गलत: "शुगर केन", "चीनी प्याज" वगैरह - ये गलत है!
✅ सही: "${localizedCrop.local}" - यही नाम इस्तेमाल करो!

📅 बुवाई/रोपाई तारीख: ${sowingDate}
🌱 रोपाई का तरीका: ${plantingMethod.hi}
${isReadyMadePlant ? '⚠️ किसान तैयार पौधे/कांड इस्तेमाल कर रहा है - नर्सरी स्टेज छोड़ दो, सीधे रोपाई से शुरू करो!' : '📍 किसान बीज बोएगा - बीज उपचार और अंकुरण स्टेज शामिल करो'}

🎯 तेरा काम: ${localizedCrop.local} फसल का ${land.area_acres} एकड़ जमीन के लिए पूरा शेड्यूल बनाना।
📅 सभी कामों की तारीखें ${sowingDate} इस बुवाई तारीख पर आधारित रखो!

📍 किसान की जानकारी:
• जगह: ${land.village || ''}, ${land.district}, ${land.state}
• जमीन: ${land.area_acres} एकड़
• मिट्टी: ${land.soil_type || 'काली'}
• पानी: ${land.irrigation_type || 'बोरवेल/कुआं'}

🧪 मिट्टी की हालत (kg/हेक्टेयर):
• नाइट्रोजन: ${currentN} (चाहिए: ${target.n}, कमी: ${nDeficit.toFixed(0)})
• फॉस्फोरस: ${currentP} (चाहिए: ${target.p}, कमी: ${pDeficit.toFixed(0)})
• पोटाश: ${currentK} (चाहिए: ${target.k}, कमी: ${kDeficit.toFixed(0)})

${ndviStatus ? `🛰️ सैटेलाइट डेटा: NDVI ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}` : ''}

${suitabilityCheck.warnings.length > 0 ? `
⚠️ इस इलाके के लिए विशेष सूचना:
${suitabilityCheck.warnings.map(w => `• ${w}`).join('\n')}
` : ''}

📋 ${localizedCrop.local} शेड्यूल में ये चरण शामिल करो (12-18 काम):
${isReadyMadePlant ? `1. जमीन तैयारी (जुताई, पटेला, मेड़ बनाना) - रोपाई से 7-15 दिन पहले
2. तैयार पौधे/कांड का चुनाव और जांच
3. पौधे/कांड की रोपाई (सही दूरी, गहराई) - दिवस 0
4. पहला पानी (रोपाई के तुरंत बाद)` : `1. जमीन तैयारी (जुताई, पटेला, मेड़ बनाना) - बुवाई से 7-15 दिन पहले
2. बीज चुनाव और बीजोपचार
3. बुवाई (सही दूरी, गहराई) - दिवस 0
4. पहला पानी (बुवाई के तुरंत बाद)`}
5. पहली निराई/घास निकालना
6. पहला खाद डोज (गोबर खाद + बेसल डोज)
7. दूसरा खाद डोज (यूरिया - 20-25 दिन बाद)
8. तीसरा खाद डोज (टॉप ड्रेसिंग - 45-50 दिन बाद)
9. कीट प्रबंधन (पहला स्प्रे)
10. रोग प्रबंधन (फफूंदनाशक स्प्रे)
11. सिंचाई शेड्यूल (नियमित पानी)
12. वृद्धि चरण निगरानी
13. दूसरा कीट स्प्रे (जरूरत पड़े तो)
14. कटाई पूर्व तैयारी
15. कटाई
16. कटाई के बाद भंडारण

⚡ जरूरी नियम:
• हर काम शुद्ध हिंदी में लिखो - गाँव की देसी भाषा में
• फसल का नाम हमेशा "${localizedCrop.local}" ही लिखो - हर task_name में फसल का नाम शामिल करो
• days_from_sowing: बुवाई दिन = 0, बुवाई से पहले = -15 से -1, बुवाई के बाद = 1, 7, 14, 21...
• सटीक मात्रा दो (X kg/एकड़, Y लीटर पानी)
• ICAR/KVK सिफारिश reference दो
• खर्च ₹ में बताओ (बाजार भाव)
• 3-4 स्टेप में कैसे करना है समझाओ
• 2-3 सावधानी बताओ (दवाई छिड़कते वक्त मास्क, दस्ताने)

🗣️ भाषा शैली - देसी हिंदी बोलो:
✅ "पानी दो", "पानी लगाओ"
✅ "खाद डालो", "यूरिया फेंको"
✅ "कीड़े लगे तो दवाई छिड़को"
✅ "दवाई मारो"
✅ "निराई करो", "घास निकालो"
❌ "सिंचाई करें" नहीं
❌ "उर्वरक प्रबंधन" नहीं
❌ "कीटनाशक अनुप्रयोग" नहीं
• सीधी-सादी, देसी हिंदी बोलो
• टेक्निकल/अंग्रेजी शब्द मत बोलो`,

        en: `You are an experienced farmer and agricultural expert with ICAR and State Agricultural University knowledge.

🌾 Crop Name: ${localizedCrop.combined}
⚠️ IMPORTANT: Always use the crop name "${localizedCrop.local}" - DO NOT translate or change it!
✅ Correct: "${localizedCrop.local}" (${localizedCrop.english})

🎯 Your task: Create complete schedule for ${localizedCrop.local} crop on ${land.area_acres} acres of land.

📍 Farmer's Information:
• Location: ${land.village || ''}, ${land.district}, ${land.state}
• Land: ${land.area_acres} acres
• Soil: ${land.soil_type || 'Black'}
• Water: ${land.irrigation_type || 'Borewell/Well'}

🧪 Soil Status (kg/hectare):
• Nitrogen: ${currentN} (need: ${target.n}, deficit: ${nDeficit.toFixed(0)})
• Phosphorus: ${currentP} (need: ${target.p}, deficit: ${pDeficit.toFixed(0)})
• Potash: ${currentK} (need: ${target.k}, deficit: ${kDeficit.toFixed(0)})

${ndviStatus ? `🛰️ Satellite Data: NDVI ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}` : ''}

${suitabilityCheck.warnings.length > 0 ? `
⚠️ Special Note for this area:
${suitabilityCheck.warnings.map(w => `• ${w}`).join('\n')}
` : ''}

📋 Include these stages in ${localizedCrop.local} schedule (12-18 tasks):
1. Land preparation (plowing, harrowing, bed making)
2. Seed selection and treatment
3. Sowing/Transplanting (proper spacing, depth)
4. First irrigation (immediately after sowing)
5. First weeding
6. First fertilizer dose (FYM + basal dose)
7. Second fertilizer dose (Urea - 20-25 days)
8. Third fertilizer dose (Top dressing - 45-50 days)
9. Pest management (first spray)
10. Disease management (fungicide spray)
11. Irrigation schedule (regular watering)
12. Growth stage monitoring
13. Second pest spray (if needed)
14. Pre-harvest preparation
15. Harvesting
16. Post-harvest storage

⚡ Important Rules:
• Write each task in simple English
• Always use crop name "${localizedCrop.local}"
• Give exact quantities (X kg/acre, Y liters water)
• Give ICAR/KVK recommendation reference
• Show cost in ₹ (market rates)
• Explain how to do in 3-4 steps
• Give 2-3 precautions (mask, gloves for spraying)
• Mention weather conditions (temperature, humidity)`
      };

      return prompts[lang] || prompts['hi'];
    };

    const getUserPrompt = (lang: string): string => {
      const prompts: Record<string, string> = {
        mr: `माझी ${land.area_acres} एकर जमीन ${land.district}, ${land.state} मध्ये आहे.
मला ${localizedCrop.local} पिकाचे संपूर्ण वेळापत्रक हवे आहे.
पेरणी/लागवड तारीख: ${sowingDate}
${cropVariety ? `वाण: ${cropVariety}` : ''}

⚠️ महत्वाचे: पिकाचे नाव "${localizedCrop.local}" असेच वापरा!

कृपया 12-18 कामांचे विस्तृत वेळापत्रक द्या:
• प्रत्येक कामासाठी नेमकी मात्रा (${land.area_acres} एकर साठी)
• खाद/औषधांची नावे आणि बाजारभाव किंमत
• कसे करायचे (स्टेप बाय स्टेप सोप्या भाषेत)
• कोणत्या हवामानात करायचे
• ICAR/KVK शिफारस
• सावधानी (औषध फवारणीसाठी मास्क, हातमोजे)

सगळे शुद्ध मराठीत लिहा - शेतकऱ्याच्या गावठी भाषेत!`,

        hi: `मेरी ${land.area_acres} एकड़ जमीन ${land.district}, ${land.state} में है।
मुझे ${localizedCrop.local} फसल का पूरा शेड्यूल चाहिए।
बुवाई/रोपाई तारीख: ${sowingDate}
${cropVariety ? `किस्म: ${cropVariety}` : ''}

⚠️ जरूरी: फसल का नाम "${localizedCrop.local}" ही इस्तेमाल करो!

कृपया 12-18 कामों का विस्तृत शेड्यूल दो:
• हर काम के लिए सटीक मात्रा (${land.area_acres} एकड़ के लिए)
• खाद/दवाई के नाम और बाजार भाव कीमत
• कैसे करना है (स्टेप बाय स्टेप आसान भाषा में)
• किस मौसम में करना है
• ICAR/KVK सिफारिश
• सावधानी (दवाई छिड़कते वक्त मास्क, दस्ताने)

सब शुद्ध हिंदी में लिखो - गाँव की देसी भाषा में!`,

        en: `My ${land.area_acres} acre land is in ${land.district}, ${land.state}.
I need complete schedule for ${localizedCrop.local} (${localizedCrop.english}) crop.
Sowing/Planting date: ${sowingDate}
${cropVariety ? `Variety: ${cropVariety}` : ''}

⚠️ IMPORTANT: Use crop name "${localizedCrop.local}" only!

Please give detailed schedule with 12-18 tasks:
• Exact quantity for each task (for ${land.area_acres} acres)
• Fertilizer/medicine names and market cost
• How to do (step by step in simple language)
• Weather conditions
• ICAR/KVK recommendation
• Precautions (mask, gloves for spraying)

Write in simple, easy language!`
      };

      return prompts[lang] || prompts['hi'];
    };

    const systemPrompt = getSystemPrompt(language);
    const userPrompt = getUserPrompt(language);

    // 8. Call OpenAI with SIMPLIFIED but FOCUSED schema for better task generation
    const requestBody = {
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
          description: `Generate detailed agricultural schedule with 12-18 tasks for ${localizedCrop.local} (${localizedCrop.english}) crop. Each task must have clear instructions in ${languageName} rural language. IMPORTANT: Use crop name "${localizedCrop.local}" exactly - do NOT translate it!`,
          parameters: {
            type: "object",
            properties: {
              crop_name: { 
                type: "string", 
                description: `MUST use exactly: "${localizedCrop.local}" - DO NOT translate or change this name! This is the correct ${languageName} name for ${localizedCrop.english}.`
              },
              crop_variety: { type: "string", description: "Recommended variety for this region" },
              crop_season: { type: "string", description: "Kharif/Rabi/Zaid" },
              total_duration_days: { type: "integer", description: "Total crop duration from sowing to harvest" },
              expected_yield_quintals: { type: "number", description: "Expected yield in quintals for total land area" },
              expected_yield_per_acre: { type: "number", description: "Expected yield per acre in quintals" },
              total_estimated_cost: { type: "number", description: "Total cost in INR for all inputs" },
              expected_profit: { type: "number", description: "Expected profit after harvest in INR" },
              icar_reference: { type: "string", description: `ICAR Package of Practice reference, e.g., 'ICAR ${localizedCrop.english} Package of Practice 2024'` },
              suitability_notes: { type: "string", description: `Notes about ${localizedCrop.local} suitability for this region in rural ${languageName} language` },
              organic_inputs: {
                type: "object",
                properties: {
                  fym_tons: { type: "number", description: "Farm Yard Manure in tons" },
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
              seed_details: { type: "string", description: "Seed treatment and quantity details" },
              tasks: {
                type: "array",
                minItems: 12,
                maxItems: 18,
                description: `MUST generate 12-18 detailed tasks for ${localizedCrop.local} covering all crop stages`,
                items: {
                  type: "object",
                  properties: {
                    task_name: { 
                      type: "string", 
                      description: `Task name in ${languageName} rural language. NOT technical terms. Example for Marathi: 'पहिले पाणी द्या' instead of 'प्रथम सिंचन'. Example for Hindi: 'पहला पानी दो' instead of 'प्रथम सिंचाई'`
                    },
                    category: { 
                      type: "string",
                      enum: ["soil_preparation", "sowing", "irrigation", "fertilizer", "pest_control", "weed_management", "growth_monitoring", "harvesting", "post_harvest"],
                      description: "Task category"
                    },
                    days_from_sowing: { 
                      type: "integer", 
                      description: "Days from sowing when this task should be done. Use -15 to -1 for pre-sowing tasks, 0 for sowing day, positive numbers for post-sowing"
                    },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    description: { 
                      type: "string", 
                      description: `Clear explanation in ${languageName} rural language. WHY this task is important for ${localizedCrop.local}. 2-3 sentences in simple village language.`
                    },
                    quantity: { 
                      type: "string", 
                      description: `EXACT amount needed for ${land.area_acres} acres. Example: '${(land.area_acres * 25).toFixed(0)} kg युरिया' or '${(land.area_acres * 1000).toFixed(0)} लिटर पाणी'`
                    },
                    product_details: { 
                      type: "string", 
                      description: "Fertilizer/pesticide name with brand examples if applicable. Example: 'युरिया (46% N) - IFFCO/Coromandel'"
                    },
                    estimated_cost: { 
                      type: "number", 
                      description: "Cost in INR for this task"
                    },
                    instructions: { 
                      type: "array", 
                      items: { type: "string" },
                      minItems: 3,
                      maxItems: 5,
                      description: `Step-by-step HOW TO DO in ${languageName} rural language. Each step clear and actionable. Use simple village words.`
                    },
                    precautions: { 
                      type: "array", 
                      items: { type: "string" },
                      minItems: 2,
                      maxItems: 4,
                      description: `Safety precautions in ${languageName} village language. Example for Marathi: 'फवारणी करताना तोंडावर कापड बांधा'. Example for Hindi: 'दवाई छिड़कते वक्त मुंह पर कपड़ा बांधो'`
                    },
                    weather_dependent: { type: "boolean", description: "True if weather affects this task" },
                    icar_guideline: { 
                      type: "string", 
                      description: `ICAR recommendation reference. Example: 'ICAR ${localizedCrop.english} Package - Section 4.2'`
                    },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string", description: "Ideal temperature range. Example: '20-30°C'" },
                        humidity: { type: "string", description: "Ideal humidity. Example: '60-80%'" },
                        conditions: { type: "string", description: `Weather conditions in ${languageName}. Example: 'ढगाळ वातावरण, पाऊस नको' (Marathi) or 'साफ मौसम' (Hindi)` }
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
    
    console.log('🤖 Calling AI API:', { model: requestBody.model, promptLength: systemPrompt.length + userPrompt.length });
    
    const aiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
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
