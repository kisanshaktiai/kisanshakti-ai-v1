import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { AI_CONFIG, OPENAI_API_URL, validateOpenAIKey } from '../_shared/aiConfig.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-farmer-id',
};

// Language mapping
const LANGUAGES: Record<string, string> = {
  hi: 'Hindi', mr: 'Marathi', pa: 'Punjabi', ta: 'Tamil', te: 'Telugu',
  bn: 'Bengali', gu: 'Gujarati', kn: 'Kannada', en: 'English'
};

// NPK targets by crop (kg/ha)
const NPK_TARGETS: Record<string, { n: number; p: number; k: number }> = {
  'wheat': { n: 120, p: 60, k: 40 }, 'rice': { n: 120, p: 60, k: 40 },
  'cotton': { n: 120, p: 60, k: 50 }, 'maize': { n: 150, p: 75, k: 50 },
  'sugarcane': { n: 250, p: 115, k: 115 }, 'soybean': { n: 30, p: 60, k: 40 },
  'groundnut': { n: 25, p: 50, k: 45 }, 'tomato': { n: 100, p: 60, k: 80 },
  'onion': { n: 100, p: 50, k: 50 }, 'potato': { n: 150, p: 80, k: 100 },
  'chilli': { n: 100, p: 50, k: 50 }, 'brinjal': { n: 100, p: 50, k: 50 },
  'cabbage': { n: 120, p: 60, k: 60 }, 'cauliflower': { n: 120, p: 60, k: 60 },
  'default': { n: 100, p: 50, k: 40 }
};

// Crop suitability data (temp ranges, water needs, suitable soils)
const CROP_REQUIREMENTS: Record<string, { 
  tempMin: number; tempMax: number; 
  waterMm: number; 
  soils: string[]; 
  seasons: string[];
  needsIrrigation: boolean;
}> = {
  'wheat': { tempMin: 10, tempMax: 25, waterMm: 450, soils: ['black', 'alluvial', 'loamy'], seasons: ['rabi'], needsIrrigation: true },
  'rice': { tempMin: 20, tempMax: 35, waterMm: 1200, soils: ['clay', 'alluvial', 'black'], seasons: ['kharif'], needsIrrigation: true },
  'cotton': { tempMin: 21, tempMax: 35, waterMm: 700, soils: ['black', 'alluvial'], seasons: ['kharif'], needsIrrigation: true },
  'maize': { tempMin: 18, tempMax: 32, waterMm: 500, soils: ['loamy', 'alluvial', 'black'], seasons: ['kharif', 'rabi'], needsIrrigation: true },
  'sugarcane': { tempMin: 20, tempMax: 35, waterMm: 1500, soils: ['black', 'alluvial', 'loamy'], seasons: ['kharif'], needsIrrigation: true },
  'soybean': { tempMin: 20, tempMax: 30, waterMm: 450, soils: ['black', 'loamy'], seasons: ['kharif'], needsIrrigation: false },
  'groundnut': { tempMin: 22, tempMax: 32, waterMm: 500, soils: ['sandy', 'loamy', 'red'], seasons: ['kharif', 'rabi'], needsIrrigation: false },
  'tomato': { tempMin: 18, tempMax: 30, waterMm: 600, soils: ['loamy', 'alluvial', 'red'], seasons: ['rabi', 'kharif'], needsIrrigation: true },
  'onion': { tempMin: 13, tempMax: 28, waterMm: 550, soils: ['loamy', 'alluvial', 'black'], seasons: ['rabi', 'kharif'], needsIrrigation: true },
  'potato': { tempMin: 15, tempMax: 25, waterMm: 500, soils: ['loamy', 'alluvial', 'sandy'], seasons: ['rabi'], needsIrrigation: true },
  'chilli': { tempMin: 20, tempMax: 35, waterMm: 600, soils: ['loamy', 'black', 'alluvial'], seasons: ['kharif', 'rabi'], needsIrrigation: true },
  'brinjal': { tempMin: 22, tempMax: 35, waterMm: 600, soils: ['loamy', 'alluvial', 'black'], seasons: ['kharif', 'rabi'], needsIrrigation: true },
};

// Helper: Build irrigation-specific instructions
function buildIrrigationRules(irrigationType: string | null, language: string): string {
  const type = (irrigationType || 'manual').toLowerCase();
  
  const rules: Record<string, Record<string, string>> = {
    'drip': {
      hi: `सिंचाई प्रकार: ड्रिप सिंचाई उपलब्ध है
✅ ड्रिप शेड्यूल, फर्टिगेशन, पानी बचत तरीके सुझाएं
✅ गणना करें: लीटर/घंटा, प्रति सत्र अवधि`,
      mr: `सिंचन प्रकार: ड्रिप सिंचन उपलब्ध आहे
✅ ड्रिप शेड्यूल, फर्टिगेशन, पाणी बचत पद्धती सुचवा
✅ गणना करा: लिटर/तास, प्रति सत्र कालावधी`,
      en: `IRRIGATION: Drip irrigation available
✅ Recommend: Drip schedules, fertigation, water-efficient methods
✅ Calculate: Liters/hour, duration per session`
    },
    'sprinkler': {
      hi: `सिंचाई प्रकार: स्प्रिंकलर सिस्टम उपलब्ध है
✅ स्प्रिंकलर शेड्यूल, ओवरहेड सिंचाई सुझाएं
⚠️ उच्च आर्द्रता में सिंचाई से बचें (फंगल खतरा)`,
      mr: `सिंचन प्रकार: स्प्रिंकलर सिस्टम उपलब्ध आहे
✅ स्प्रिंकलर शेड्यूल, ओव्हरहेड सिंचन सुचवा
⚠️ जास्त आर्द्रतेत सिंचन टाळा (बुरशी धोका)`,
      en: `IRRIGATION: Sprinkler available
✅ Recommend: Sprinkler schedules, overhead irrigation
⚠️ Avoid during high humidity (fungal risk)`
    },
    'manual': {
      hi: `सिंचाई प्रकार: मैन्युअल (ड्रिप/स्प्रिंकलर नहीं है!)
❌ ड्रिप या स्प्रिंकलर की सिफारिश मत करो - किसान के पास नहीं है!
✅ सुझाएं: बाढ़ सिंचाई, नाली सिंचाई, रिंग बेसिन विधि
✅ गणना करें: प्रति सिंचाई पानी की मात्रा लीटर में`,
      mr: `सिंचन प्रकार: मॅन्युअल (ड्रिप/स्प्रिंकलर नाही!)
❌ ड्रिप किंवा स्प्रिंकलर सुचवू नका - शेतकऱ्याकडे नाही!
✅ सुचवा: पाण्याचा पाट, सरी पद्धत, रिंग बेसिन पद्धत
✅ गणना करा: प्रति सिंचन पाण्याचे प्रमाण लिटरमध्ये`,
      en: `IRRIGATION: MANUAL (NO drip/sprinkler!)
❌ DO NOT recommend drip or sprinkler - farmer doesn't have it!
✅ Recommend: Flood irrigation, furrow method, ring basin
✅ Calculate: Water volume per irrigation in liters`
    },
    'well': {
      hi: `सिंचाई प्रकार: कुएं से सिंचाई
✅ पंप आधारित शेड्यूल सुझाएं
✅ विचार करें: पंप क्षमता, पानी की मेज, बिजली/डीजल खर्च`,
      mr: `सिंचन प्रकार: विहिरीतून सिंचन
✅ पंप आधारित शेड्यूल सुचवा
✅ विचार करा: पंप क्षमता, पाण्याची पातळी, वीज/डिझेल खर्च`,
      en: `IRRIGATION: Well-based
✅ Recommend: Pump-based schedules
✅ Consider: Pump capacity, water table, electricity/fuel costs`
    },
    'canal': {
      hi: `सिंचाई प्रकार: नहर सिंचाई
⚠️ पानी उपलब्धता रोटेशन शेड्यूल पर निर्भर
✅ नहर पानी उपलब्धता दिनों के अनुसार योजना बनाएं`,
      mr: `सिंचन प्रकार: कालवा सिंचन
⚠️ पाणी उपलब्धता रोटेशन शेड्यूलवर अवलंबून
✅ कालव्याच्या पाण्याच्या उपलब्धतेनुसार नियोजन करा`,
      en: `IRRIGATION: Canal
⚠️ Water availability depends on rotation schedule
✅ Plan around canal water availability days`
    },
    'rainfed': {
      hi: `सिंचाई प्रकार: वर्षा आधारित (कोई सिंचाई स्रोत नहीं!)
❌ कोई भी सिंचाई सिफारिश मत करो - किसान बारिश पर निर्भर है!
✅ सुझाएं: वर्षा जल संचयन, मल्चिंग, सूखा-सहिष्णु तरीके
✅ ध्यान दें: नमी संरक्षण, महत्वपूर्ण वर्षा-अंतर प्रबंधन`,
      mr: `सिंचन प्रकार: पावसावर अवलंबून (सिंचन स्त्रोत नाही!)
❌ कोणतीही सिंचन शिफारस करू नका - शेतकरी पावसावर अवलंबून!
✅ सुचवा: पावसाचे पाणी साठवण, मल्चिंग, दुष्काळ-सहन पद्धती
✅ लक्ष द्या: ओलावा संवर्धन, पावसाच्या खंडात व्यवस्थापन`,
      en: `IRRIGATION: RAINFED (NO irrigation source!)
❌ DO NOT recommend ANY irrigation - farmer depends on rain!
✅ Recommend: Rainwater harvesting, mulching, drought-tolerant practices
✅ Focus: Moisture conservation, rain-gap management`
    }
  };

  const langKey = ['hi', 'mr'].includes(language) ? language : 'en';
  return rules[type]?.[langKey] || rules['manual'][langKey];
}

// Helper: Build soil-specific instructions
function buildSoilInstructions(land: any, language: string): string {
  const instructions: string[] = [];
  const isHindi = language === 'hi';
  const isMarathi = language === 'mr';
  
  // pH-based recommendations
  if (land.soil_ph) {
    if (land.soil_ph < 6.0) {
      instructions.push(isMarathi 
        ? `⚠️ मातीचा pH ${land.soil_ph} आम्लयुक्त आहे - चुना वापरणे आवश्यक (2-4 क्विंटल/एकर)`
        : isHindi 
          ? `⚠️ मिट्टी का pH ${land.soil_ph} अम्लीय है - चूना डालना आवश्यक (2-4 क्विंटल/एकर)`
          : `⚠️ Soil pH ${land.soil_ph} is ACIDIC - MUST apply lime (2-4 quintals/acre)`);
    } else if (land.soil_ph > 7.5) {
      instructions.push(isMarathi 
        ? `⚠️ मातीचा pH ${land.soil_ph} क्षारीय आहे - जिप्सम वापरणे आवश्यक`
        : isHindi 
          ? `⚠️ मिट्टी का pH ${land.soil_ph} क्षारीय है - जिप्सम डालना आवश्यक`
          : `⚠️ Soil pH ${land.soil_ph} is ALKALINE - MUST apply gypsum`);
    }
  }

  // Organic carbon check
  if (land.organic_carbon_percent !== null && land.organic_carbon_percent < 0.5) {
    instructions.push(isMarathi 
      ? `⚠️ सेंद्रिय कार्बन ${land.organic_carbon_percent}% खूप कमी - शेणखत/कंपोस्ट आवश्यक (5-10 टन/एकर)`
      : isHindi 
        ? `⚠️ जैविक कार्बन ${land.organic_carbon_percent}% बहुत कम है - गोबर खाद/कंपोस्ट आवश्यक (5-10 टन/एकर)`
        : `⚠️ Organic carbon ${land.organic_carbon_percent}% is VERY LOW - MUST add FYM/compost (5-10 tons/acre)`);
  }

  return instructions.length > 0 ? instructions.join('\n') : (isMarathi ? 'माती ठीक आहे' : isHindi ? 'मिट्टी ठीक है' : 'Soil is OK');
}

// Helper: Build weather-aware rules
function buildWeatherRules(weather: any, forecast: any[], language: string): string {
  const rules: string[] = [];
  const isHindi = language === 'hi';
  const isMarathi = language === 'mr';
  
  if (!weather) return '';
  
  const temp = weather.temperature_celsius;
  const humidity = weather.humidity_percent;
  
  if (temp && temp > 35) {
    rules.push(isMarathi 
      ? `🌡️ उच्च तापमान (${temp}°C) - सिंचन फक्त सकाळी/संध्याकाळी करा`
      : isHindi 
        ? `🌡️ उच्च तापमान (${temp}°C) - सिंचाई सुबह/शाम ही करें`
        : `🌡️ HIGH TEMP (${temp}°C) - Irrigate early morning/evening only`);
  }
  if (temp && temp < 15) {
    rules.push(isMarathi 
      ? `🌡️ कमी तापमान (${temp}°C) - दंव धोका, संवेदनशील काम पुढे ढकला`
      : isHindi 
        ? `🌡️ कम तापमान (${temp}°C) - पाला खतरा, संवेदनशील काम टालें`
        : `🌡️ LOW TEMP (${temp}°C) - Frost risk, delay sensitive operations`);
  }
  if (humidity && humidity > 80) {
    rules.push(isMarathi 
      ? `💧 उच्च आर्द्रता (${humidity}%) - बुरशी रोग धोका, बुरशीनाशक फवारणी करा`
      : isHindi 
        ? `💧 उच्च आर्द्रता (${humidity}%) - फफूंद रोग खतरा, फफूंदनाशक छिड़काव करें`
        : `💧 HIGH HUMIDITY (${humidity}%) - Fungal risk, include preventive fungicide`);
  }
  
  // Check forecast for rain
  if (forecast && forecast.length > 0) {
    const rainyDays = forecast.filter(f => f.rain_amount_mm && f.rain_amount_mm > 5).length;
    if (rainyDays > 3) {
      rules.push(isMarathi 
        ? `🌧️ ${rainyDays} पावसाळी दिवस येत आहेत - कीटकनाशक फवारणी कोरड्या दिवशी करा`
        : isHindi 
          ? `🌧️ ${rainyDays} बारिश वाले दिन आ रहे हैं - कीटनाशक छिड़काव सूखे दिन करें`
          : `🌧️ ${rainyDays} rainy days ahead - Plan pesticide sprays on dry days`);
    }
  }
  
  return rules.join('\n');
}

// Helper: Validate crop suitability
function validateCropSuitability(
  cropName: string, 
  land: any, 
  weather: any, 
  language: string
): { suitable: boolean; riskScore: number; warnings: string[]; alternatives: string[] } {
  const warnings: string[] = [];
  let riskScore = 0;
  
  const cropKey = cropName.toLowerCase();
  const requirements = CROP_REQUIREMENTS[cropKey];
  
  if (!requirements) {
    // Unknown crop, proceed with caution
    return { suitable: true, riskScore: 10, warnings: [], alternatives: [] };
  }
  
  const isHindi = language === 'hi';
  const isMarathi = language === 'mr';
  
  // Temperature check
  const currentTemp = weather?.temperature_celsius || 25;
  if (currentTemp < requirements.tempMin) {
    warnings.push(isMarathi 
      ? `तापमान खूप कमी: ${currentTemp}°C (${requirements.tempMin}°C+ आवश्यक)`
      : isHindi 
        ? `तापमान बहुत कम: ${currentTemp}°C (${requirements.tempMin}°C+ चाहिए)`
        : `Temperature too low: ${currentTemp}°C (need ${requirements.tempMin}°C+)`);
    riskScore += 25;
  }
  if (currentTemp > requirements.tempMax) {
    warnings.push(isMarathi 
      ? `तापमान खूप जास्त: ${currentTemp}°C (${requirements.tempMax}°C पेक्षा कमी हवे)`
      : isHindi 
        ? `तापमान बहुत अधिक: ${currentTemp}°C (${requirements.tempMax}°C से कम चाहिए)`
        : `Temperature too high: ${currentTemp}°C (need <${requirements.tempMax}°C)`);
    riskScore += 25;
  }
  
  // Soil type check
  const landSoil = (land.soil_type || '').toLowerCase();
  if (landSoil && !requirements.soils.some(s => landSoil.includes(s))) {
    warnings.push(isMarathi 
      ? `माती ${land.soil_type} ${cropName} साठी आदर्श नाही`
      : isHindi 
        ? `मिट्टी ${land.soil_type} ${cropName} के लिए आदर्श नहीं है`
        : `Soil ${land.soil_type} not ideal for ${cropName}`);
    riskScore += 20;
  }
  
  // Irrigation check for high-water crops
  const irrigationType = (land.irrigation_type || 'manual').toLowerCase();
  if (requirements.waterMm > 800 && irrigationType === 'rainfed') {
    warnings.push(isMarathi 
      ? `${cropName} ला जास्त पाणी लागते, पण तुमचे शेत पावसावर अवलंबून आहे`
      : isHindi 
        ? `${cropName} को अधिक पानी चाहिए, लेकिन आपका खेत बारिश पर निर्भर है`
        : `${cropName} needs high water but your land is rainfed`);
    riskScore += 30;
  }
  
  // pH check
  if (land.soil_ph && (land.soil_ph < 5.5 || land.soil_ph > 8.5)) {
    warnings.push(isMarathi 
      ? `मातीचा pH ${land.soil_ph} आदर्श श्रेणी बाहेर आहे`
      : isHindi 
        ? `मिट्टी का pH ${land.soil_ph} आदर्श सीमा के बाहर है`
        : `Soil pH ${land.soil_ph} outside optimal range`);
    riskScore += 15;
  }
  
  // Suggest alternatives if unsuitable
  const alternatives: string[] = [];
  if (riskScore >= 50) {
    // Suggest crops that match the land conditions
    for (const [crop, req] of Object.entries(CROP_REQUIREMENTS)) {
      if (crop === cropKey) continue;
      
      let score = 0;
      // Check if crop suits current irrigation
      if (irrigationType === 'rainfed' && !req.needsIrrigation) score += 30;
      if (irrigationType !== 'rainfed' && req.needsIrrigation) score += 20;
      // Check soil match
      if (landSoil && req.soils.some(s => landSoil.includes(s))) score += 30;
      // Check temp match
      if (currentTemp >= req.tempMin && currentTemp <= req.tempMax) score += 40;
      
      if (score >= 60) alternatives.push(crop);
    }
  }
  
  return { 
    suitable: riskScore < 50, 
    riskScore, 
    warnings, 
    alternatives: alternatives.slice(0, 5) 
  };
}

// Helper: Get residual nutrient info from previous crop
function getPreviousCropContext(previousCrop: string | null, language: string): string {
  if (!previousCrop) return '';
  
  const isHindi = language === 'hi';
  const isMarathi = language === 'mr';
  
  const prevCrop = previousCrop.toLowerCase();
  
  // Legumes leave nitrogen
  const legumes = ['soybean', 'groundnut', 'moong', 'urad', 'chickpea', 'peas', 'lentil'];
  if (legumes.some(l => prevCrop.includes(l))) {
    return isMarathi 
      ? `मागील पीक (${previousCrop}) डाळवर्गीय होते - मातीत नत्र शिल्लक असू शकते, नत्र खत 20-30% कमी करा`
      : isHindi 
        ? `पिछली फसल (${previousCrop}) दलहन थी - मिट्टी में नाइट्रोजन बचा हो सकता है, नाइट्रोजन खाद 20-30% कम करें`
        : `Previous crop (${previousCrop}) was legume - residual nitrogen in soil, reduce N fertilizer by 20-30%`;
  }
  
  // Heavy feeders deplete nutrients
  const heavyFeeders = ['sugarcane', 'cotton', 'maize', 'potato'];
  if (heavyFeeders.some(h => prevCrop.includes(h))) {
    return isMarathi 
      ? `मागील पीक (${previousCrop}) जड पोषक वापरणारे होते - माती थकलेली असू शकते, जास्त खत आवश्यक`
      : isHindi 
        ? `पिछली फसल (${previousCrop}) भारी पोषक उपयोगकर्ता थी - मिट्टी थकी हो सकती है, अधिक खाद आवश्यक`
        : `Previous crop (${previousCrop}) was heavy feeder - soil may be depleted, need more fertilizer`;
  }
  
  return isMarathi 
    ? `मागील पीक: ${previousCrop} - याचा विचार करून खत नियोजन करा`
    : isHindi 
      ? `पिछली फसल: ${previousCrop} - इसे ध्यान में रखकर खाद योजना बनाएं`
      : `Previous crop: ${previousCrop} - consider this for fertilizer planning`;
}

serve(async (req) => {
  console.log('🚀 [AI-Schedule] Request received');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const OPENAI_API_KEY = validateOpenAIKey();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const tenantId = req.headers.get('x-tenant-id');
    const farmerId = req.headers.get('x-farmer-id');
    
    if (!tenantId || !farmerId) {
      return new Response(
        JSON.stringify({ error: 'Missing headers', details: 'x-tenant-id and x-farmer-id required' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { 
      landId, cropName, cropVariety, sowingDate, 
      isReadyMadePlant = false, regenerate, 
      language = 'hi', forceGenerate = false 
    } = body;
    
    console.log('📋 [AI-Schedule] Request:', { landId, cropName, sowingDate, language });
    
    if (!landId || !cropName || !sowingDate) {
      return new Response(
        JSON.stringify({ error: 'Missing fields', details: 'landId, cropName, sowingDate required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(`${tenantId}:${farmerId}`, 'ai-smart-schedule', { maxRequests: 30, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: corsHeaders }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: FETCH COMPLETE LAND DATA
    // ═══════════════════════════════════════════════════════════════
    console.log('📍 [Phase 1] Fetching land data...');
    
    const { data: land, error: landError } = await supabase
      .from('lands')
      .select('*')
      .eq('id', landId)
      .single();

    if (landError || !land) {
      console.error('❌ Land not found:', landError);
      return new Response(
        JSON.stringify({ error: 'Land not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    console.log('✅ Land data:', { 
      name: land.name, 
      area: land.area_acres, 
      soil: land.soil_type,
      irrigation: land.irrigation_type,
      ph: land.soil_ph,
      prevCrop: land.previous_crop 
    });

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: FETCH WEATHER FROM DATABASE
    // ═══════════════════════════════════════════════════════════════
    console.log('🌤️ [Phase 2] Fetching weather from DB...');
    
    let dbWeather = null;
    let dbForecast: any[] = [];
    
    if (land.center_lat && land.center_lon) {
      const locationKey = `${Number(land.center_lat).toFixed(2)},${Number(land.center_lon).toFixed(2)}`;
      console.log('📍 Location key:', locationKey);
      
      // Fetch current weather
      const { data: currentWeather } = await supabase
        .from('weather_current')
        .select('*')
        .eq('location_key', locationKey)
        .single();
      
      if (currentWeather) {
        dbWeather = currentWeather;
        console.log('✅ Current weather:', { 
          temp: currentWeather.temperature_celsius, 
          humidity: currentWeather.humidity_percent 
        });
      }
      
      // Fetch 7-day forecast
      const { data: forecast } = await supabase
        .from('weather_forecasts')
        .select('*')
        .eq('location_key', locationKey)
        .gte('forecast_time', new Date().toISOString())
        .order('forecast_time', { ascending: true })
        .limit(7);
      
      if (forecast && forecast.length > 0) {
        dbForecast = forecast;
        console.log(`✅ Forecast: ${forecast.length} days`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: CROP SUITABILITY VALIDATION (BEFORE AI)
    // ═══════════════════════════════════════════════════════════════
    console.log('🌱 [Phase 3] Validating crop suitability...');
    
    const suitability = validateCropSuitability(cropName, land, dbWeather, language);
    console.log('📊 Suitability:', { 
      suitable: suitability.suitable, 
      riskScore: suitability.riskScore, 
      warnings: suitability.warnings.length 
    });
    
    // If crop is not suitable and forceGenerate is false, return warning
    if (!suitability.suitable && !forceGenerate) {
      const languageName = LANGUAGES[language] || 'Hindi';
      const isMarathi = language === 'mr';
      const isHindi = language === 'hi';
      
      const warningMessage = isMarathi 
        ? `⚠️ भाऊ, थांब! ${cropName} तुझ्या ${land.district || 'या भागात'} मध्ये योग्य नाही!`
        : isHindi 
          ? `⚠️ भाई, रुको! ${cropName} आपके ${land.district || 'इस क्षेत्र'} में उपयुक्त नहीं है!`
          : `⚠️ Warning! ${cropName} may not be suitable for ${land.district || 'this area'}!`;
      
      console.log('⚠️ Returning suitability warning');
      
      return new Response(
        JSON.stringify({
          suitabilityWarning: true,
          score: suitability.riskScore,
          warnings: suitability.warnings,
          alternatives: suitability.alternatives,
          warningMessage,
          canProceed: true,
          message: isMarathi 
            ? 'तरीही पुढे जायचे असल्यास forceGenerate: true पाठवा'
            : isHindi 
              ? 'फिर भी आगे बढ़ना है तो forceGenerate: true भेजें'
              : 'To proceed anyway, send forceGenerate: true'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: BUILD DYNAMIC CONTEXT
    // ═══════════════════════════════════════════════════════════════
    console.log('📝 [Phase 4] Building dynamic context...');
    
    // Parse sowing date
    const [year, month, day] = sowingDate.split('-').map(Number);
    const sowingDateParsed = new Date(year, month - 1, day);

    // Calculate NPK deficit
    const cropKey = cropName.toLowerCase();
    const target = NPK_TARGETS[cropKey] || NPK_TARGETS['default'];
    const landAreaHa = land.area_acres * 0.404686;
    const currentN = land.nitrogen_kg_per_ha || 0;
    const currentP = land.phosphorus_kg_per_ha || 0;
    const currentK = land.potassium_kg_per_ha || 0;
    const nDeficit = Math.max(0, target.n - currentN);
    const pDeficit = Math.max(0, target.p - currentP);
    const kDeficit = Math.max(0, target.k - currentK);
    const kExcess = currentK > target.k ? currentK - target.k : 0;

    // Fertilizer calculations
    const ureaKg = ((nDeficit * landAreaHa) / 0.46).toFixed(0);
    const dapKg = ((pDeficit * landAreaHa) / 0.18).toFixed(0);
    const mopKg = kExcess > 0 ? '0' : ((kDeficit * landAreaHa) / 0.60).toFixed(0);
    const fymTons = (land.area_acres * 2.5).toFixed(1);

    const languageName = LANGUAGES[language] || 'Hindi';
    const plantingMethod = isReadyMadePlant ? 'Transplanting' : 'Direct sowing';
    
    // Build dynamic rule strings
    const irrigationRules = buildIrrigationRules(land.irrigation_type, language);
    const soilInstructions = buildSoilInstructions(land, language);
    const weatherRules = buildWeatherRules(dbWeather, dbForecast, language);
    const previousCropContext = getPreviousCropContext(land.previous_crop, language);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5: BUILD ENHANCED SYSTEM PROMPT
    // ═══════════════════════════════════════════════════════════════
    console.log('🤖 [Phase 5] Building enhanced prompt...');
    
    const systemPrompt = `You are an expert agricultural scientist helping Indian farmers achieve 3X-5X higher yields.

CRITICAL: Generate ALL content in ${languageName} (${language}) using RURAL VILLAGE language, not formal/bookish terms.
- Use words farmers actually speak: "पाणी द्या" not "सिंचन प्रबंधन"
- Address farmer respectfully (भाऊ for Marathi, भाई for Hindi)

═══════════════════════════════════════════════════════════════
📍 FARMER'S LAND DATA (USE THIS EXACTLY - NO GENERIC ADVICE!)
═══════════════════════════════════════════════════════════════
- Name: ${land.name || 'Unknown'}
- Location: ${land.village || ''}, ${land.taluka || ''}, ${land.district || 'Unknown'}, ${land.state || 'India'}
- Area: ${land.area_acres} acres
- Soil Type: ${land.soil_type || 'Unknown'}
- Soil pH: ${land.soil_ph || 'Not tested'}
- Organic Carbon: ${land.organic_carbon_percent || 'Not tested'}%

═══════════════════════════════════════════════════════════════
🚿 IRRIGATION RULES (MANDATORY - DO NOT VIOLATE!)
═══════════════════════════════════════════════════════════════
${irrigationRules}

═══════════════════════════════════════════════════════════════
🧪 SOIL HEALTH ACTIONS REQUIRED
═══════════════════════════════════════════════════════════════
${soilInstructions}

NPK STATUS (kg/ha):
- Nitrogen: Current ${currentN}, Need ${target.n}, Deficit ${nDeficit.toFixed(0)}
- Phosphorus: Current ${currentP}, Need ${target.p}, Deficit ${pDeficit.toFixed(0)}
- Potassium: Current ${currentK}, Need ${target.k}${kExcess > 0 ? `, EXCESS ${kExcess.toFixed(0)} - reduce MOP!` : `, Deficit ${kDeficit.toFixed(0)}`}

FERTILIZER CALCULATIONS (for ${land.area_acres} acres):
- FYM: ${fymTons} tons (organic first!)
- Urea: ${ureaKg} kg (if N deficit)
- DAP: ${dapKg} kg (if P deficit)
- MOP: ${mopKg} kg (${kExcess > 0 ? 'NOT NEEDED - K is excess!' : 'if K deficit'})

${previousCropContext ? `═══════════════════════════════════════════════════════════════
🌿 PREVIOUS CROP CONTEXT
═══════════════════════════════════════════════════════════════
${previousCropContext}` : ''}

═══════════════════════════════════════════════════════════════
🌤️ CURRENT WEATHER & FORECAST
═══════════════════════════════════════════════════════════════
${dbWeather ? `Current: ${dbWeather.temperature_celsius}°C, Humidity: ${dbWeather.humidity_percent}%` : 'Weather data not available'}
${weatherRules}

═══════════════════════════════════════════════════════════════
🌱 CROP DETAILS
═══════════════════════════════════════════════════════════════
Crop: ${cropName}${cropVariety ? ` (${cropVariety})` : ''}
Sowing Date: ${sowingDate}
Method: ${plantingMethod}${isReadyMadePlant ? ' (SKIP seed/nursery tasks!)' : ' (Include seed treatment!)'}

═══════════════════════════════════════════════════════════════
📋 SCHEDULE GENERATION RULES (STRICT!)
═══════════════════════════════════════════════════════════════
1. Generate 12-15 tasks covering FULL crop cycle
2. ALWAYS use ${land.area_acres} acres for quantity calculations
3. NEVER recommend irrigation methods farmer doesn't have
4. Include EXACT quantities: kg, liters, ml per acre
5. For pesticides: Brand + Active Ingredient + % + Dosage + PHI
6. For fertilizers: Calculate based on NPK deficit shown above
7. Include cost estimates in ₹ (INR)
8. Each task must have yield_impact and skip_penalty
9. Consider weather forecast for timing recommendations`;

    const userPrompt = `Generate comprehensive ${cropName} schedule for ${land.area_acres} acres starting ${sowingDate}.
Output MUST be in ${languageName} rural language. Include 12-15 tasks with exact quantities and costs.
Remember: Farmer has ${land.irrigation_type || 'manual'} irrigation only!`;

    console.log('🤖 [AI] Calling OpenAI...');
    
    const aiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
            description: `Create ${cropName} schedule in ${languageName}`,
            parameters: {
              type: "object",
              properties: {
                crop_name: { type: "string" },
                total_duration_days: { type: "integer" },
                expected_yield_quintals: { type: "number" },
                total_estimated_cost: { type: "number" },
                expected_profit: { type: "number" },
                tasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      task_name: { type: "string" },
                      category: { type: "string", enum: ["land_preparation", "sowing", "irrigation", "fertilizer", "weeding", "pest_control", "disease_control", "harvesting", "other"] },
                      days_from_sowing: { type: "integer" },
                      priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                      description: { type: "string" },
                      quantity: { type: "string" },
                      product_details: { type: "string" },
                      estimated_cost: { type: "number" },
                      instructions: { type: "array", items: { type: "string" } },
                      precautions: { type: "array", items: { type: "string" } },
                      yield_impact: { type: "string" },
                      skip_penalty: { type: "string" },
                      weather_dependent: { type: "boolean" }
                    },
                    required: ["task_name", "category", "days_from_sowing", "priority", "description", "instructions"]
                  }
                }
              },
              required: ["crop_name", "total_duration_days", "tasks"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "create_crop_schedule" } }
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('❌ AI error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const message = aiData.choices[0].message;
    
    if (!message.tool_calls?.[0]) {
      throw new Error('AI did not return structured schedule');
    }

    const scheduleData = JSON.parse(message.tool_calls[0].function.arguments);
    console.log(`✅ [AI] Generated ${scheduleData.tasks?.length || 0} tasks`);

    if (!scheduleData.tasks?.length) {
      throw new Error('AI returned empty schedule');
    }

    // Deactivate old schedules if regenerating
    if (regenerate) {
      await supabase.from('crop_schedules')
        .update({ is_active: false })
        .eq('land_id', landId)
        .eq('is_active', true);
    }

    // Calculate harvest date
    const harvestDate = new Date(sowingDateParsed);
    harvestDate.setDate(harvestDate.getDate() + (scheduleData.total_duration_days || 120));
    const harvestDateStr = harvestDate.toISOString().split('T')[0];

    // Save schedule
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety || scheduleData.crop_variety,
        sowing_date: sowingDate,
        expected_harvest_date: harvestDateStr,
        is_active: true,
        expected_yield_quintals: scheduleData.expected_yield_quintals,
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
          isReadyMadePlant,
          land_area: land.area_acres,
          irrigation_type: land.irrigation_type,
          soil_type: land.soil_type,
          soil_ph: land.soil_ph,
          previous_crop: land.previous_crop,
          npk_deficit: { n: nDeficit, p: pDeficit, k: kDeficit },
          suitability_score: suitability.riskScore,
          weather_at_generation: dbWeather ? {
            temp: dbWeather.temperature_celsius,
            humidity: dbWeather.humidity_percent
          } : null
        }
      })
      .select()
      .single();

    if (scheduleError) {
      console.error('❌ Schedule save error:', scheduleError);
      throw new Error(`Failed to save schedule: ${scheduleError.message}`);
    }

    console.log(`✅ [DB] Schedule saved: ${savedSchedule.id}`);

    // Prepare and insert tasks
    const defaultPrecautions = language === 'mr' 
      ? ["मास्क वापरा", "हातमोजे घाला", "मुलांना दूर ठेवा"]
      : ["मास्क पहनो", "दस्ताने पहनो", "बच्चों को दूर रखो"];

    const tasksToInsert = scheduleData.tasks.map((task: any, index: number) => {
      const taskDate = new Date(sowingDateParsed);
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing ?? index * 7));
      
      return {
        schedule_id: savedSchedule.id,
        task_date: taskDate.toISOString().split('T')[0],
        task_type: task.category || 'other',
        task_name: task.task_name,
        task_description: task.description,
        status: 'pending',
        priority: task.priority || 'medium',
        weather_dependent: task.weather_dependent || false,
        instructions: task.instructions || [task.description],
        precautions: task.precautions?.length ? task.precautions : defaultPrecautions,
        resources: {
          quantity: task.quantity || `${land.area_acres} acres`,
          product_details: task.product_details,
          yield_impact: task.yield_impact,
          skip_penalty: task.skip_penalty,
          days_from_sowing: task.days_from_sowing
        },
        estimated_cost: task.estimated_cost,
        currency: 'INR'
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) {
      console.error('❌ Tasks insert error:', tasksError);
    } else {
      console.log(`✅ [DB] Inserted ${insertedTasks?.length || 0} tasks`);
    }

    const executionTime = Date.now() - startTime;
    console.log(`✅ Schedule complete in ${executionTime}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        scheduleId: savedSchedule.id,
        cropName,
        sowingDate,
        totalTasks: scheduleData.tasks.length,
        duration: scheduleData.total_duration_days,
        expectedYield: scheduleData.expected_yield_quintals,
        totalCost: scheduleData.total_estimated_cost,
        expectedProfit: scheduleData.expected_profit,
        landContext: {
          irrigationType: land.irrigation_type,
          soilType: land.soil_type,
          previousCrop: land.previous_crop
        },
        suitabilityScore: suitability.riskScore,
        executionTimeMs: executionTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [AI-Schedule] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Schedule generation failed',
        executionTimeMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
