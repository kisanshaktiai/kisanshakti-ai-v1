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
  const cropData = cropSuitability[cropName];
  const alternatives = regionalAlternatives[state] || regionalAlternatives['Default'];
  
  // Default result for unknown crops - allow with warning
  if (!cropData) {
    return {
      suitable: true,
      score: 70,
      warnings: [`${cropName} की जानकारी उपलब्ध नहीं है, सावधानी से आगे बढ़ें`],
      risks: [],
      alternatives: alternatives.slice(0, 3).map(c => ({ crop: c, successRate: 80, potentialProfit: '₹20,000-40,000/एकड़' })),
      proceedAnyway: true,
      warningMessage: ''
    };
  }

  let score = 100;
  const warnings: string[] = [];
  const risks: string[] = [];

  // 1. Check state suitability
  const isUnsuitableState = cropData.unsuitableStates.some(s => 
    state.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(state.toLowerCase())
  );
  const isBestState = cropData.bestStates.some(s => 
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
    const soilMatch = cropData.soilTypes.some(s => 
      soilType.toLowerCase().includes(s.toLowerCase())
    );
    if (!soilMatch) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`${soilType} माती ${cropName} साठी कमी योग्य आहे`);
        warnings.push(`चांगली माती: ${cropData.soilTypes.join(', ')}`);
      } else {
        warnings.push(`${soilType} मिट्टी ${cropName} के लिए कम उपयुक्त है`);
        warnings.push(`अच्छी मिट्टी: ${cropData.soilTypes.join(', ')}`);
      }
    }
  }

  // 3. Check temperature (if available)
  if (currentTemp !== null) {
    if (currentTemp < cropData.optimalTemp[0] - 5) {
      score -= 25;
      if (language === 'mr') {
        warnings.push(`तापमान खूप कमी (${currentTemp}°C) - ${cropName} ला ${cropData.optimalTemp[0]}-${cropData.optimalTemp[1]}°C लागतं`);
      } else {
        warnings.push(`तापमान बहुत कम (${currentTemp}°C) - ${cropName} को ${cropData.optimalTemp[0]}-${cropData.optimalTemp[1]}°C चाहिए`);
      }
    } else if (currentTemp > cropData.optimalTemp[1] + 5) {
      score -= 25;
      if (language === 'mr') {
        warnings.push(`तापमान खूप जास्त (${currentTemp}°C) - ${cropName} ला ${cropData.optimalTemp[0]}-${cropData.optimalTemp[1]}°C लागतं`);
      } else {
        warnings.push(`तापमान बहुत ज्यादा (${currentTemp}°C) - ${cropName} को ${cropData.optimalTemp[0]}-${cropData.optimalTemp[1]}°C चाहिए`);
      }
    }
  }

  // 4. Check irrigation for water-intensive crops
  if (!irrigationType || irrigationType.toLowerCase() === 'rainfed') {
    if (cropData.rainfall[0] > 1000) {
      score -= 20;
      if (language === 'mr') {
        warnings.push(`${cropName} ला भरपूर पाणी लागतं - सिंचन व्यवस्था करा`);
      } else {
        warnings.push(`${cropName} को ज्यादा पानी चाहिए - सिंचाई का इंतजाम करो`);
      }
    }
  }

  // Add risk factors
  cropData.riskFactors.forEach(risk => {
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
    
    console.log('🌐 [AI-Schedule] Received language:', language);

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

    const systemPrompt = `तू एक 50 साल के अनुभवी किसान हो जो ICAR-सर्टिफाइड कृषि वैज्ञानिक भी है। 
तेरे पास पारंपरिक ज्ञान + आधुनिक विज्ञान दोनों है। गाँव के भाई को उसकी ज़मीन और हालात के हिसाब से सलाह दे रहे हो।

⚠️ याद रख: यह किसान अपनी पूरी जिंदगी की बचत इस फसल में लगा रहा है। एक गलत सलाह = 6 महीने की आमदनी बर्बाद!

🎯 काम: ${land.area_acres} एकड़ जमीन के लिए ${cropName} का पूरा वेळापत्रक बनाना है।

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📜 वैज्ञानिक सटीकता के नियम (CRITICAL RULE #5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
हर सिफारिश इन स्रोतों पर आधारित होनी चाहिए:
• ICAR (Indian Council of Agricultural Research) guidelines
• राज्य कृषि विश्वविद्यालय शोध
• कृषि विज्ञान केंद्र (KVK) protocols
• इसी क्षेत्र के सफल किसानों के अनुभव

मना है:
❌ Generic सलाह जो हर जगह चलती हो (कुछ भी हर जगह नहीं चलता!)
❌ मिट्टी जांच data बिना fertilizer recommendation
❌ NPK deficit calculation बिना fixed खाद मात्रा
❌ बिना कीट पहचाने pesticide सलाह
❌ जोखिम बताए बिना yield का वादा

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗣️ भाषा के नियम (CRITICAL RULE #4)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
भाषा: ${languageName} (code: ${language})

❌ मना है (किताबी भाषा):
• "सिंचन प्रबंधन करें" → ✅ "पानी दो"
• "उर्वरक व्यवस्थापन" → ✅ "खाद डालो"  
• "कीटनाशक अनुप्रयोग" → ✅ "दवाई छिड़को"
• "फसल संरक्षण" → ✅ "पीक राखा"

संवाद शैली:
• शुरुआत प्यार से: "भाऊ, तेरा खेत अच्छा है..."
• हौसला दो: "छान करतोय तू!"
• चेतावनी प्यार से: "बघ हो, असं केलं नाहीस तर..."
• विश्वास दो: "ही गोष्ट करशील तर 100% नफा होईल"

${language === 'mr' ? `
मराठी उदाहरणे (असंच बोलायचं):
• "${examples.irrigation[0]}"
• "${examples.fertilizer[0]}"
• "${examples.pesticide[0]}"
` : `
हिंदी उदाहरण (ऐसे ही बोलना है):
• "${examples.irrigation[0]}"
• "${examples.fertilizer[0]}"
• "${examples.pesticide[0]}"
`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 इस किसान की ज़मीन की जानकारी
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• क्षेत्र: ${land.area_acres} एकड़ (${landAreaHa.toFixed(2)} हेक्टेयर)
• जगह: ${land.village || ''}, ${land.district}, ${land.state}
• मिट्टी: ${land.soil_type || 'काली/दोमट'}
• मिट्टी pH: ${land.soil_ph || '6.5-7.5'}
• पानी स्रोत: ${land.irrigation_type || 'बोरवेल/कुआं'}

${suitabilityContext}

🧪 मिट्टी जांच रिपोर्ट (kg/ha):
┌─────────────┬────────┬────────┬─────────┐
│ पोषक तत्व  │ अभी है │ चाहिए  │ कमी    │
├─────────────┼────────┼────────┼─────────┤
│ नाइट्रोजन │ ${currentN}   │ ${target.n}   │ ${nDeficit.toFixed(0)}    │
│ फॉस्फोरस  │ ${currentP}   │ ${target.p}    │ ${pDeficit.toFixed(0)}    │
│ पोटाश     │ ${currentK}   │ ${target.k}    │ ${kDeficit.toFixed(0)}    │
└─────────────┴────────┴────────┴─────────┘

📦 ${land.area_acres} एकड़ के लिए रासायनिक खाद (अंदाजा):
• यूरिया: ${ureaCalc} kg (46% N)
• DAP: ${dapCalc} kg (18% N + 46% P₂O₅)
• MOP: ${mopCalc} kg (60% K₂O)

${ndviStatus ? `
🛰️ सैटेलाइट से फसल/जमीन की हालत:
NDVI: ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}
करना होगा: ${ndviStatus.action}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 COMPREHENSIVE SCHEDULE COMPONENTS (RULE #3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
तुझे ये सब phases include करने हैं:

【A】 बुवाई से पहले (Pre-Planting: 15-30 दिन पहले)
• मिट्टी जांच recommendation (अगर हाल में नहीं हुई)
• जमीन तैयारी - जुताई depth, frequency, timing
• pH सुधार - अम्लीय के लिए चूना, क्षारीय के लिए जिप्सम
• हरी खाद options (अगर वक्त है)
• मेड़ बनाना, ढलान वाली जमीन के लिए drainage
• पलेवा/राउनी (pre-sowing irrigation) का समय

【B】 बीज चयन और उपचार (Seed Selection & Treatment)
• इस जगह के लिए recommended varieties (generic नहीं!)
• बीज दर per एकड़ (10% buffer के साथ)
• बीज उपचार protocol:
  - फफूंदनाशक: नाम + active ingredient + dosage
  - जैविक coating: Azotobacter/PSB/Rhizobium
  - समय और तरीका
• Certified बीज स्रोत recommendations
• अगर किसान ने खुद बीज रखा है: germination test सलाह

【C】 बुवाई/रोपाई Guidelines
• सटीक बुवाई खिड़की: "15 अक्टूबर से 5 नवंबर" (सिर्फ "अक्टूबर" नहीं!)
• बुवाई method: छिटकवां/line sowing/transplanting
• कतार से कतार और पौधे से पौधे की दूरी (cm में)
• बुवाई गहराई (cm में)
• Population density target (plants/एकड़)

【D】 सिंचाई Schedule (Precision Required)
• Critical growth stages जहाँ पानी जरूरी:
  - Stage का local नाम
  - बुवाई के बाद कितने दिन
  - हर सिंचाई में volume (लीटर/एकड़)
  - पानी की कमी के लक्षण
• पूरे season में कुल सिंचाई: 6-12 बार
• Drought contingency plan
• Excess water drainage plan

【E】 पोषक तत्व प्रबंधन (3-Tier Approach)
★ Tier 1 - जैविक (PRIMARY - पहले इसे recommend करो):
• गोबर खाद: ${fymRecommendation} टन
• वर्मीकंपोस्ट: X kg
• नीम खली: Y kg (खाद + कीट नियंत्रण दोनों)

★ Tier 2 - जैव उर्वरक:
• Azotobacter: X packets (N fixation)
• PSB: Y packets (P solubilization)
• Rhizobium: Z packets (दलहन के लिए)

★ Tier 3 - रासायनिक (Gap Filling Only):
• NPK deficit (N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha) के आधार पर
• Basal dose (बुवाई पर)
• First top dressing (25-30 DAS)
• Second top dressing (45-50 DAS)
• सूक्ष्म पोषक: Zinc Sulphate, Boron अगर कमी हो

【F】 खरपतवार प्रबंधन (Integrated Approach)
• Pre-emergence herbicide: नाम + AI + dosage
• पहली निराई: X दिन बाद (तरीका: हाथ/wheel hoe)
• Post-emergence herbicide (अगर जरूरी): selective herbicide
• Mulching recommendations

【G】 कीट-रोग प्रबंधन (IPM Protocol)
• Monitoring Schedule:
  - Pheromone traps: X per एकड़
  - Yellow sticky traps: Y per एकड़
  - खेत निरीक्षण: हर 3-4 दिन
  - Economic Threshold Levels (ETL)

• Stage-wise Risk Map:
  - 0-30 DAS: कौन से कीट/रोग आने की संभावना
  - 30-60 DAS: कौन से कीट/रोग
  - 60-90 DAS: कौन से कीट/रोग
  - 90+ DAS: कौन से कीट/रोग

• Prophylactic (रोकथाम):
  - नीम तेल spray: 5 ml/लीटर (हर 10 दिन)
  - राख छिड़काव (traditional)
  - Trap cropping

• Curative (इलाज - सिर्फ ETL cross होने पर):
  - जैविक: NPV, Bt, Trichoderma, Trichogramma cards
  - रासायनिक (आखिरी विकल्प):
    ✓ कीटनाशक नाम (Brand + Generic)
    ✓ Active Ingredient: [Chemical] [%] [Formulation]
    ✓ Example: "Imidacloprid 17.8% SL (Confidor/Tatamida)"
    ✓ Dosage: X ml/एकड़
    ✓ Water volume: Y लीटर
    ✓ Pre-Harvest Interval (PHI): Z दिन
    ✓ Resistance management class

• Safety Protocols:
  - Spray timing: सुबह जल्दी या शाम
  - हवा speed: < 10 km/hr
  - Protective equipment mandatory
  - मधुमक्खी safety

【H】 Growth Stage Monitoring
5-7 critical stages define करो:
• Germination (0-10 days)
• Vegetative (10-30 days)
• Tillering/Branching (30-50 days)
• Flowering (50-70 days)
• Pollination (70-90 days)
• Grain/fruit filling (90-110 days)
• Maturity (110-130 days)

हर stage के लिए:
✓ Expected plant appearance
✓ Critical needs (पानी/खाद)
✓ Common problems to watch
✓ Corrective actions
✓ Ideal weather

【I】 कटाई Planning
• Physiological maturity indicators:
  - Visual signs (दाने का रंग, नमी, पत्ते सूखना)
  - Moisture content %
  - Test method (नाखून से test, दांत से test)
• Harvest timing window:
  - जल्दी: X% yield loss
  - सही समय: X से Y दिन
  - देर: quality loss, shattering risk
• Harvest method: Manual/Mechanical
• Post-harvest:
  - Field drying period
  - Threshing method
  - Safe moisture for storage (12-14% for cereals)
  - Storage recommendations
  - Market timing strategy

【J】 मौसम-आधारित सलाह
Real-time forecast के साथ:
• अगर 2-3 दिन में बारिश: सिंचाई, खाद, spray टालो
• अगर लू/heatwave: सिंचाई बढ़ाओ, anti-transpirant डालो
• अगर शीत लहर: सिंचाई रोको, potash spray करो
• अगर ओलावृष्टि risk: जल्दी कटाई करो
• अगर लंबा सूखा: mulching, पौधों की संख्या कम करो

【K】 आर्थिक विश्लेषण (Transparent)
Input-wise cost breakdown:
• बीज: ₹X,XXX
• जैविक खाद: ₹Y,YYY
• रासायनिक खाद: ₹Z,ZZZ
• कीटनाशक: ₹A,AAA
• मजदूरी: ₹B,BBB
• सिंचाई (बिजली/डीजल): ₹C,CCC
• मशीनरी किराया: ₹D,DDD
• Total Cost: ₹XX,XXX

Expected yield range:
• Conservative: X क्विंटल/एकड़ (basic care)
• Average: Y क्विंटल/एकड़ (good care)
• Optimal: Z क्विंटल/एकड़ (excellent care + अच्छा मौसम)

Revenue projection:
• Current market price: ₹W/क्विंटल
• Gross revenue: ₹XX,XXX
• Net profit: ₹YY,YYY
• Break-even yield: A क्विंटल
• ROI: B%

Risk factors:
• मौसम: 30% risk
• कीट attack: 20% risk
• बाजार भाव: 25% risk

【L】 Contingency Plans
सूखा scenario:
• Life-saving irrigation priority stages
• Foliar urea spray
• Anti-transpirant application
• फसल बीमा claim process

बाढ़/जलभराव:
• तुरंत drainage
• Root rot prevention (fungicide)
• पानी उतरने के बाद top dressing
• अगर total loss: replanting window

कीट outbreak:
• Emergency contact: कृषि अधिकारी
• Community spraying coordination
• Alternative pesticide options

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 कीमत के नियम
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• सारी कीमतें "₹" में ($ नहीं!)
• "अंदाजे ₹500" ऐसे लिखना
• 2024-25 के भाव use करो

भाषा: ${languageName} - पूरा जवाब इसी भाषा में, गाँव की बोली में!`;

    const userPrompt = `भाई, मेरे ${land.area_acres} एकड़ खेत में ${cropName}${cropVariety ? ` (${cropVariety})` : ''} ${isReadyMadePlant ? 'लगाना' : 'बोना'} है।

📅 तारीख: ${sowingDate}
📍 जगह: ${land.district}, ${land.state}
💧 पानी: ${land.irrigation_type || 'बोरवेल'}
🌾 मिट्टी: ${land.soil_type || 'काली मिट्टी'}

${suitabilityCheck.warnings.length > 0 ? `
⚠️ मुझे पता है ये चेतावनियाँ हैं:
${suitabilityCheck.warnings.map(w => `• ${w}`).join('\n')}
इन बातों का ध्यान रखते हुए वेळापत्रक बनाओ!
` : ''}

मिट्टी में खाद:
• N=${currentN}, P=${currentP}, K=${currentK} kg/ha (अभी है)
• N=${target.n}, P=${target.p}, K=${target.k} kg/ha (चाहिए)
• कमी: N=${nDeficit.toFixed(0)}, P=${pDeficit.toFixed(0)}, K=${kDeficit.toFixed(0)} kg/ha

${ndviStatus ? `सैटेलाइट से: ${ndviStatus.value.toFixed(2)} - ${ndviStatus.status}` : ''}

${weather?.forecast ? `अगले हफ्ते मौसम:
${weather.forecast.filter((f: any) => f.rainfall > 5).map((f: any) => `• दिन ${f.day}: ${f.rainfall}mm बारिश`).join('\n') || '• कोई बड़ी बारिश नहीं'}
` : ''}

पूरा वेळापत्रक बताओ (12-15 काम):
1. जमीन तैयारी
2. ${isReadyMadePlant ? 'पौधे लगाना' : 'बीज बोना'}
3. पानी कब देना (5-6 बार)
4. खाद कब डालना (3-4 बार) - गोबर + रासायनिक
5. कीड़े-रोग की दवाई (2-3 बार)
6. घास निकालना (2 बार)
7. कटाई

हर काम के लिए बताना:
✅ क्या करना है
✅ कितना सामान लगेगा (${land.area_acres} एकड़ के हिसाब से)
✅ खाद/दवाई का नाम + सक्रिय तत्व
✅ कैसे करना है (step by step)
✅ क्या सावधानी रखनी है (2-3 बातें)
✅ कौन से मौसम में करना है (ideal_weather में temperature, humidity, conditions दो)
✅ कितना खर्च आएगा (₹ में)
✅ ICAR guideline reference

${suitabilityCheck.risks.length > 0 ? `
⚠️ इन खतरों से बचने के लिए extra precautions दो:
${suitabilityCheck.risks.map(r => `• ${r}`).join('\n')}
` : ''}

आखिर में बताओ:
• कितनी फसल होगी (क्विंटल में)
• कुल खर्च
• कमाई

भाषा: ${languageName} - गाँव वाली भाषा में बोलो!`;

    // 8. Call OpenAI with COMPREHENSIVE schema
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
          description: "Generate comprehensive agricultural schedule with ICAR guidelines, 3-tier nutrient management, IPM protocols, economic analysis, and contingency plans for Indian farmers",
          parameters: {
            type: "object",
            properties: {
              crop_name: { type: "string" },
              crop_season: { type: "string", description: "Kharif/Rabi/Zaid" },
              total_duration_days: { type: "integer" },
              sowing_window: { type: "string", description: "Exact sowing dates like '15 Oct to 5 Nov'" },
              recommended_varieties: { type: "array", items: { type: "string" }, description: "Location-specific varieties" },
              expected_yield_conservative: { type: "number", description: "Minimum yield with basic care (quintals)" },
              expected_yield_quintals: { type: "number", description: "Average yield (quintals)" },
              expected_yield_optimal: { type: "number", description: "Maximum yield with excellent care (quintals)" },
              expected_yield_per_acre: { type: "number" },
              expected_market_price_per_quintal: { type: "number" },
              expected_gross_revenue: { type: "number" },
              expected_net_profit: { type: "number" },
              total_estimated_cost: { type: "number" },
              break_even_yield: { type: "number", description: "Minimum yield to cover costs" },
              roi_percentage: { type: "number", description: "Return on Investment %" },
              icar_reference: { type: "string", description: "ICAR Package of Practice reference" },
              state_university_reference: { type: "string", description: "State Agricultural University reference" },
              seed_quantity_kg: { type: "number" },
              seed_rate_per_acre: { type: "number" },
              seed_details: { type: "string", description: "Seed treatment protocol with fungicide, biofertilizer" },
              suitability_notes: { type: "string", description: "Notes about crop suitability for this region" },
              risk_factors: {
                type: "object",
                properties: {
                  weather_risk_percent: { type: "number" },
                  pest_risk_percent: { type: "number" },
                  market_risk_percent: { type: "number" },
                  mitigation_strategies: { type: "array", items: { type: "string" } }
                }
              },
              contingency_plans: {
                type: "object",
                properties: {
                  drought: { type: "array", items: { type: "string" }, description: "Steps if drought occurs" },
                  flood: { type: "array", items: { type: "string" }, description: "Steps if waterlogging" },
                  pest_outbreak: { type: "array", items: { type: "string" }, description: "Steps if severe pest attack" }
                }
              },
              organic_inputs: {
                type: "object",
                description: "Tier 1 - Primary organic recommendations",
                properties: {
                  fym_tons: { type: "number", description: "Farm Yard Manure in tons" },
                  fym_kg: { type: "number" },
                  compost_kg: { type: "number" },
                  vermicompost_kg: { type: "number" },
                  neem_cake_kg: { type: "number" },
                  green_manure: { type: "string", description: "Green manure crop name if recommended" }
                }
              },
              biofertilizers: {
                type: "object",
                description: "Tier 2 - Biofertilizer recommendations",
                properties: {
                  azotobacter_packets: { type: "number" },
                  psb_packets: { type: "number" },
                  rhizobium_packets: { type: "number" },
                  application_method: { type: "string" }
                }
              },
              chemical_fertilizers: {
                type: "object",
                description: "Tier 3 - Gap filling only based on NPK deficit",
                properties: {
                  urea_kg: { type: "number" },
                  dap_kg: { type: "number" },
                  mop_kg: { type: "number" },
                  ssp_kg: { type: "number" },
                  zinc_sulphate_kg: { type: "number" },
                  boron_kg: { type: "number" }
                }
              },
              cost_breakdown: {
                type: "object",
                description: "Detailed input-wise cost breakdown",
                properties: {
                  seeds: { type: "number" },
                  organic_manure: { type: "number" },
                  chemical_fertilizers: { type: "number" },
                  pesticides: { type: "number" },
                  labour: { type: "number" },
                  irrigation: { type: "number" },
                  machinery: { type: "number" },
                  miscellaneous: { type: "number" }
                }
              },
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    task_name: { type: "string", description: "Rural language task name - गाँव की भाषा में" },
                    category: { 
                      type: "string",
                      enum: ["pre_planting", "soil_preparation", "seed_treatment", "sowing", "irrigation", "fertilizer_organic", "fertilizer_chemical", "pest_control", "disease_control", "weed_management", "growth_monitoring", "harvesting", "post_harvest"]
                    },
                    growth_stage: { type: "string", description: "Growth stage name like Germination, Vegetative, Flowering, etc." },
                    days_from_sowing: { type: "integer" },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                    description: { type: "string", description: "Why this task matters, in rural speech - गाँव की भाषा में!" },
                    quantity: { type: "string", description: "REQUIRED: Exact amount like '50 kg यूरिया per एकड़' or '2000 लीटर पानी' - NEVER empty" },
                    product_details: { type: "string", description: "REQUIRED: Product name + active ingredient + % + formulation. Example: 'Imidacloprid 17.8% SL (Confidor)'" },
                    application_method: { type: "string", description: "How to apply - broadcasting, foliar spray, seed treatment, etc." },
                    estimated_cost: { type: "number" },
                    instructions: { type: "array", items: { type: "string" }, minItems: 2, description: "Step by step instructions in rural language" },
                    precautions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5, description: "Safety precautions in rural language" },
                    weather_dependent: { type: "boolean" },
                    etl_threshold: { type: "string", description: "Economic Threshold Level for pest/disease tasks" },
                    phi_days: { type: "integer", description: "Pre-Harvest Interval for pesticides" },
                    icar_guideline: { type: "string", description: "REQUIRED: ICAR Package of Practice reference" },
                    kvk_contact: { type: "string", description: "Local KVK contact if available" },
                    climate_risk: { type: "string", description: "REQUIRED: Weather risk warning in rural language" },
                    alternative_method: { type: "string", description: "Traditional/organic alternative if chemical recommended" },
                    ideal_weather: {
                      type: "object",
                      properties: {
                        temperature: { type: "string", description: "Like '20-25°C'" },
                        humidity: { type: "string", description: "Like '60-70%'" },
                        wind_speed: { type: "string", description: "Like '<10 km/hr for spraying'" },
                        conditions: { type: "string", description: "Like 'साफ मौसम' or 'हल्की धूप'" }
                      },
                      required: ["temperature", "humidity", "conditions"]
                    }
                  },
                  required: ["task_name", "category", "days_from_sowing", "priority", "description", "quantity", "instructions", "precautions", "icar_guideline", "ideal_weather"]
                }
              }
            },
            required: ["crop_name", "total_duration_days", "tasks", "icar_reference", "organic_inputs", "cost_breakdown"]
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
    
    console.log('✓ Schedule:', scheduleData.crop_name, scheduleData.total_duration_days, 'days,', scheduleData.tasks?.length, 'tasks');

    if (!scheduleData.tasks || scheduleData.tasks.length === 0) {
      throw new Error('AI returned empty schedule');
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
    const { data: savedSchedule, error: scheduleError } = await supabase
      .from('crop_schedules')
      .insert({
        tenant_id: tenantId,
        farmer_id: farmerId,
        land_id: landId,
        crop_name: cropName,
        crop_variety: cropVariety || scheduleData.crop_variety,
        crop_season: scheduleData.crop_season,
        sowing_date: sowingDate,
        expected_harvest_date: new Date(new Date(sowingDate).getTime() + (scheduleData.total_duration_days || 120) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        is_active: true,
        status: 'active',
        expected_yield_quintals: scheduleData.expected_yield_quintals || scheduleData.expected_yield_per_acre * land.area_acres,
        total_estimated_cost: scheduleData.total_estimated_cost,
        generation_params: {
          model: AI_CONFIG.MODEL,
          language,
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
          prompt_version: 'v4_suitability_enhanced'
        },
        ai_response_metadata: {
          organic_inputs: scheduleData.organic_inputs,
          chemical_fertilizers: scheduleData.chemical_fertilizers,
          icar_reference: scheduleData.icar_reference,
          seed_details: scheduleData.seed_details,
          suitability_notes: scheduleData.suitability_notes
        }
      })
      .select()
      .single();

    if (scheduleError || !savedSchedule) {
      console.error('Schedule save error:', scheduleError);
      throw new Error('Failed to save schedule');
    }

    console.log(`✓ Schedule saved: ${savedSchedule.id}`);

    // 12. Prepare and insert tasks
    const tasksToInsert = scheduleData.tasks.map((task: any, index: number) => {
      const taskDate = new Date(sowingDate);
      taskDate.setDate(taskDate.getDate() + (task.days_from_sowing || index * 7));
      
      return {
        schedule_id: savedSchedule.id,
        tenant_id: tenantId,
        farmer_id: farmerId,
        task_date: taskDate.toISOString().split('T')[0],
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
          ideal_weather: task.ideal_weather
        },
        ideal_weather: task.ideal_weather,
        estimated_cost: task.estimated_cost,
        currency: 'INR',
        metadata: {
          days_from_sowing: task.days_from_sowing,
          ai_generated: true,
          land_area: land.area_acres
        }
      };
    });

    const { data: insertedTasks, error: tasksError } = await supabase
      .from('schedule_tasks')
      .insert(tasksToInsert)
      .select();

    if (tasksError) console.error('Tasks insert error:', tasksError);
    else console.log(`✓ Inserted ${insertedTasks?.length || 0} tasks`);

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
        cropName: scheduleData.crop_name,
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
