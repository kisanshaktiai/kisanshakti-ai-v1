/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION BRAIN CHAT SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Integrates the Symbolic Decision Graph Engine with the AI Chat.
 * 
 * CRITICAL FLOW:
 * 1. User asks agricultural question
 * 2. Try Decision Brain FIRST (0 tokens, <100ms, deterministic)
 * 3. If Decision Brain returns advisory → format and return (no AI)
 * 4. If Decision Brain cannot answer → fall back to AI
 * 
 * ZERO AI for farming recommendations - all from ICAR/FAO rules
 */

import { 
  runDecisionGraphSync,
  buildDecisionInput,
  UnifiedAdvisory,
  CropGroup,
  CropStage,
  RiskLevel,
  Cause,
  FarmingMode,
  NDVIState,
  NDVITrend,
  WeatherState,
  SoilNState,
  SoilPState,
  SoilKState,
  SoilPHState,
  SoilMoistureState,
  getRiskDescription,
  Action,
  getCropGroup
} from '@/decision-graph';

// ═══════════════════════════════════════════════════════════════════════════
// CROP NAME TO CODE MAPPING (Multi-language support)
// ═══════════════════════════════════════════════════════════════════════════

const CROP_NAME_TO_CODE: Record<string, string> = {
  // English
  'wheat': 'wheat',
  'rice': 'rice',
  'paddy': 'rice',
  'cotton': 'cotton',
  'sugarcane': 'sugarcane',
  'soybean': 'soybean',
  'maize': 'maize',
  'corn': 'maize',
  'groundnut': 'groundnut',
  'peanut': 'groundnut',
  'tomato': 'tomato',
  'onion': 'onion',
  'potato': 'potato',
  'gram': 'gram',
  'chickpea': 'gram',
  'mustard': 'mustard',
  'sunflower': 'sunflower',
  'turmeric': 'turmeric',
  'ginger': 'ginger',
  'banana': 'banana',
  'mango': 'mango',
  'grapes': 'grapes',
  'pomegranate': 'pomegranate',
  'chilli': 'chilli',
  'brinjal': 'brinjal',
  'okra': 'okra',
  'cabbage': 'cabbage',
  'cauliflower': 'cauliflower',
  
  // Hindi (हिंदी)
  'गेहूं': 'wheat',
  'गेहूँ': 'wheat',
  'चावल': 'rice',
  'धान': 'rice',
  'कपास': 'cotton',
  'रुई': 'cotton',
  'गन्ना': 'sugarcane',
  'ईख': 'sugarcane',
  'सोयाबीन': 'soybean',
  'मक्का': 'maize',
  'मूंगफली': 'groundnut',
  'टमाटर': 'tomato',
  'प्याज': 'onion',
  'आलू': 'potato',
  'चना': 'gram',
  'सरसों': 'mustard',
  'सूरजमुखी': 'sunflower',
  'हल्दी': 'turmeric',
  'अदरक': 'ginger',
  'केला': 'banana',
  'आम': 'mango',
  'अंगूर': 'grapes',
  'अनार': 'pomegranate',
  'मिर्च': 'chilli',
  'बैंगन': 'brinjal',
  'भिंडी': 'okra',
  'बंदगोभी': 'cabbage',
  'फूलगोभी': 'cauliflower',
  
  // Marathi (मराठी)
  'गहू': 'wheat',
  'तांदूळ': 'rice',
  'भात': 'rice',
  'कापूस': 'cotton',
  'ऊस': 'sugarcane',
  'सोयाबिन': 'soybean',
  'मका': 'maize',
  'भुईमूग': 'groundnut',
  'शेंगदाणा': 'groundnut',
  'टोमॅटो': 'tomato',
  'कांदा': 'onion',
  'बटाटा': 'potato',
  'हरभरा': 'gram',
  'मोहरी': 'mustard',
  'सूर्यफूल': 'sunflower',
  'हळद': 'turmeric',
  'आले': 'ginger',
  'केळी': 'banana',
  'आंबा': 'mango',
  'द्राक्षे': 'grapes',
  'डाळिंब': 'pomegranate',
  'मिरची': 'chilli',
  'वांगी': 'brinjal',
  'भेंडी': 'okra',
  'कोबी': 'cabbage',
  'फ्लॉवर': 'cauliflower'
};

/**
 * Normalize crop name to crop code
 */
function normalizeCropName(cropName: string | undefined): string | null {
  if (!cropName) return null;
  
  const normalized = cropName.toLowerCase().trim();
  
  // Direct match
  if (CROP_NAME_TO_CODE[normalized]) {
    return CROP_NAME_TO_CODE[normalized];
  }
  
  // Case-insensitive match for Hindi/Marathi
  if (CROP_NAME_TO_CODE[cropName]) {
    return CROP_NAME_TO_CODE[cropName];
  }
  
  // Partial match
  for (const [name, code] of Object.entries(CROP_NAME_TO_CODE)) {
    if (normalized.includes(name.toLowerCase()) || name.toLowerCase().includes(normalized)) {
      return code;
    }
  }
  
  // Return as-is if no match (might be valid crop code)
  return normalized;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

interface QueryClassification {
  isAgricultural: boolean;
  queryType: 'watering' | 'fertilizer' | 'pest' | 'disease' | 'harvest' | 'weather' | 'general' | 'non_agri';
  canUseDecisionBrain: boolean;
  requiresAI: boolean;
  matchedKeywords: string[];
}

/**
 * Classify user query to determine if Decision Brain can handle it
 */
export function classifyQueryForDecisionBrain(query: string): QueryClassification {
  const q = query.toLowerCase();
  const matchedKeywords: string[] = [];
  
  // Agricultural keywords (Hindi, Marathi, English)
  const agriKeywords = {
    watering: [
      'water', 'irrigation', 'irrigate', 'पानी', 'सिंचाई', 'पाणी', 'सिंचन',
      'drip', 'ड्रिप', 'कब पानी', 'when to water', 'कितना पानी', 'how much water',
      'पाणी द्या', 'पाणी देणे', 'पाणी कधी'
    ],
    fertilizer: [
      'fertilizer', 'खाद', 'खत', 'urea', 'यूरिया', 'युरिया', 'dap', 'डीएपी',
      'npk', 'potash', 'पोटाश', 'nitrogen', 'नाइट्रोजन', 'nutrient', 'पोषण',
      'कौनसी खाद', 'which fertilizer', 'कितनी खाद', 'how much fertilizer',
      'खत द्या', 'खत कधी'
    ],
    pest: [
      'pest', 'कीट', 'किड', 'insect', 'bug', 'worm', 'कीड़ा', 'इल्ली',
      'spray', 'स्प्रे', 'फवारणी', 'pesticide', 'कीटनाशक', 'किटकनाशक',
      'किडा', 'कीड', 'अळी'
    ],
    disease: [
      'disease', 'रोग', 'blight', 'rust', 'wilt', 'rot', 'fungus',
      'फफूंद', 'पीला पड़ना', 'yellowing', 'spots', 'धब्बे',
      'करपा', 'तांबेरा', 'बुरशी'
    ],
    harvest: [
      'harvest', 'कटाई', 'कापणी', 'when to harvest', 'कब काटें',
      'ready', 'mature', 'पकना', 'तैयार', 'पिकले', 'काढणी'
    ],
    weather: [
      'weather', 'मौसम', 'हवामान', 'rain', 'बारिश', 'पाऊस',
      'temperature', 'तापमान', 'heat', 'गर्मी', 'cold', 'ठंड'
    ],
    general: [
      'crop', 'फसल', 'पीक', 'field', 'खेत', 'शेत', 'land', 'जमीन',
      'farming', 'खेती', 'शेती', 'agriculture', 'कृषि', 'grow', 'उगाना',
      'sowing', 'बुवाई', 'पेरणी', 'plant', 'पौधा', 'झाड', 'aaj kya karna hai',
      'आज क्या करना है', 'आज काय करायचे', 'today', 'आज', 'advice', 'सलाह',
      'काय करू', 'क्या करें', 'what should i do', 'tell me', 'बताओ', 'सांगा'
    ]
  };
  
  // Check each category
  for (const [category, keywords] of Object.entries(agriKeywords)) {
    for (const kw of keywords) {
      if (q.includes(kw)) {
        matchedKeywords.push(kw);
        console.log(`🔍 [Decision Brain] Query matched keyword: "${kw}" → category: ${category}`);
        return {
          isAgricultural: true,
          queryType: category as QueryClassification['queryType'],
          canUseDecisionBrain: ['watering', 'fertilizer', 'pest', 'disease', 'harvest', 'general'].includes(category),
          requiresAI: false,
          matchedKeywords
        };
      }
    }
  }
  
  // Non-agricultural query
  console.log(`🔍 [Decision Brain] Query not matched as agricultural: "${q.substring(0, 50)}..."`);
  return {
    isAgricultural: false,
    queryType: 'non_agri',
    canUseDecisionBrain: false,
    requiresAI: true,
    matchedKeywords
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAND CONTEXT TO DECISION INPUT CONVERTER
// ═══════════════════════════════════════════════════════════════════════════

export interface LandContext {
  id?: string;
  name?: string;
  crop_name?: string;
  crop_code?: string;
  crop_group?: string;
  area_hectares?: number;
  farming_mode?: string;
  irrigation_type?: string;
  sowing_date?: string;
  soil_data?: {
    n?: number;
    p?: number;
    k?: number;
    ph?: number;
    organic_carbon?: number;
    moisture?: number;
  };
  ndvi_data?: {
    value?: number;
    trend?: number;
  };
  weather_data?: {
    temperature?: number;
    humidity?: number;
    rain_expected?: boolean;
    wind_speed?: number;
  };
  location?: {
    state?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
}

/**
 * Convert land context to DecisionInput for the engine
 */
export function landContextToDecisionInput(
  land: LandContext | null,
  farmerId: string = 'anonymous',
  tenantId: string = 'default'
) {
  console.log(`🔄 [Decision Brain] Converting land context:`, {
    landId: land?.id,
    landName: land?.name,
    crop_name: land?.crop_name,
    crop_code: land?.crop_code,
    hasSoilData: !!land?.soil_data,
    hasNdviData: !!land?.ndvi_data,
    hasWeatherData: !!land?.weather_data
  });

  if (!land) {
    console.log(`❌ [Decision Brain] No land context provided`);
    return null;
  }
  
  // Try to get crop code from crop_code or crop_name
  let cropCode = land.crop_code || normalizeCropName(land.crop_name);
  
  if (!cropCode) {
    console.log(`❌ [Decision Brain] No valid crop code found. crop_name: "${land.crop_name}", crop_code: "${land.crop_code}"`);
    return null;
  }
  
  console.log(`✅ [Decision Brain] Resolved crop code: "${cropCode}" from "${land.crop_name || land.crop_code}"`);
  
  // Calculate days after sowing
  let sowingDate = new Date();
  sowingDate.setDate(sowingDate.getDate() - 30); // Default 30 days ago
  
  if (land.sowing_date) {
    sowingDate = new Date(land.sowing_date);
  }
  
  cropCode = cropCode.toLowerCase();
  
  // Build raw farm data for the fact extractor with sensible defaults
  const rawFarmData = {
    farmerId: farmerId,
    landId: land.id || 'unknown',
    tenantId: tenantId,
    cropCode: cropCode,
    sowingDate: sowingDate.toISOString(),
    farmingMode: land.farming_mode,
    
    // Soil data with defaults
    soilN: land.soil_data?.n ?? 80,  // Default adequate N
    soilP: land.soil_data?.p ?? 40,  // Default adequate P
    soilK: land.soil_data?.k ?? 40,  // Default adequate K
    soilPH: land.soil_data?.ph ?? 7.0,  // Default neutral pH
    soilMoisture: land.soil_data?.moisture ?? 50,  // Default moderate moisture
    soilOrganicCarbon: land.soil_data?.organic_carbon,
    
    // NDVI data with defaults
    ndviValue: land.ndvi_data?.value ?? 0.55,  // Default healthy NDVI
    ndviTrend: land.ndvi_data?.trend ?? 0,  // Default stable trend
    
    // Weather data with defaults
    temperature: land.weather_data?.temperature ?? 28,  // Default moderate temp
    humidity: land.weather_data?.humidity ?? 60,  // Default moderate humidity
    rainExpected: land.weather_data?.rain_expected ?? false,
    windSpeed: land.weather_data?.wind_speed ?? 10,
    
    // Regional info
    stateCode: land.location?.state,
    districtCode: land.location?.district,
    
    // Irrigation
    irrigationMethod: land.irrigation_type
  };
  
  console.log(`📊 [Decision Brain] Raw farm data:`, {
    cropCode: rawFarmData.cropCode,
    sowingDate: rawFarmData.sowingDate,
    soilN: rawFarmData.soilN,
    soilP: rawFarmData.soilP,
    soilK: rawFarmData.soilK,
    ndviValue: rawFarmData.ndviValue,
    temperature: rawFarmData.temperature
  });
  
  try {
    const decisionInput = buildDecisionInput(rawFarmData);
    console.log(`✅ [Decision Brain] Built DecisionInput:`, {
      crop_code: decisionInput.crop_code,
      crop_group: decisionInput.crop_group,
      crop_stage: decisionInput.crop_stage,
      days_after_sowing: decisionInput.days_after_sowing,
      ndvi_state: decisionInput.ndvi_state,
      farming_mode: decisionInput.farming_mode
    });
    return decisionInput;
  } catch (error) {
    console.error(`❌ [Decision Brain] Failed to build DecisionInput:`, error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVISORY TO CHAT RESPONSE FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

interface ChatResponse {
  response: string;
  structuredResponse?: {
    cards: Array<{
      id: string;
      type: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation';
      title: string;
      content: string;
      color: string;
      gradient: string[];
      icon: string;
      priority: number;
    }>;
    language: string;
  };
  source: 'decision_brain' | 'ai';
  advisory?: UnifiedAdvisory;
  executionTimeMs: number;
}

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    greeting: "Here's your farming advisory",
    riskCritical: "CRITICAL - Immediate action required!",
    riskHigh: "HIGH PRIORITY - Urgent attention needed",
    riskMedium: "Moderate attention needed",
    riskLow: "Crop is healthy - continue monitoring",
    causesTitle: "Issues Detected",
    actionsTitle: "Recommended Actions",
    scientificBasis: "Based on ICAR/FAO guidelines",
    noActionNeeded: "Your crop is doing well! Continue regular monitoring.",
    confidence: "Confidence",
    rulesApplied: "rules applied",
    wateringNeeded: "Irrigation Required",
    fertilizerNeeded: "Fertilizer Application",
    pestControl: "Pest Control",
    diseaseControl: "Disease Management",
    harvestReady: "Harvest Time",
    priority: "Priority",
    source: "🧠 Decision Brain (0 AI tokens, instant)"
  },
  hi: {
    greeting: "आपकी खेती की सलाह",
    riskCritical: "गंभीर - तुरंत कार्रवाई करें!",
    riskHigh: "उच्च प्राथमिकता - तत्काल ध्यान दें",
    riskMedium: "मध्यम ध्यान आवश्यक",
    riskLow: "फसल स्वस्थ है - निगरानी जारी रखें",
    causesTitle: "समस्याएं पाई गईं",
    actionsTitle: "सुझाई गई कार्रवाई",
    scientificBasis: "ICAR/FAO दिशानिर्देशों पर आधारित",
    noActionNeeded: "आपकी फसल अच्छी है! नियमित निगरानी जारी रखें।",
    confidence: "विश्वसनीयता",
    rulesApplied: "नियम लागू",
    wateringNeeded: "सिंचाई आवश्यक",
    fertilizerNeeded: "खाद डालें",
    pestControl: "कीट नियंत्रण",
    diseaseControl: "रोग प्रबंधन",
    harvestReady: "कटाई का समय",
    priority: "प्राथमिकता",
    source: "🧠 निर्णय मस्तिष्क (0 AI टोकन, तुरंत)"
  },
  mr: {
    greeting: "तुमची शेती सल्ला",
    riskCritical: "गंभीर - ताबडतोब कारवाई करा!",
    riskHigh: "उच्च प्राधान्य - त्वरित लक्ष द्या",
    riskMedium: "मध्यम लक्ष आवश्यक",
    riskLow: "पीक निरोगी आहे - निरीक्षण सुरू ठेवा",
    causesTitle: "समस्या आढळल्या",
    actionsTitle: "शिफारस केलेल्या कृती",
    scientificBasis: "ICAR/FAO मार्गदर्शक तत्त्वांवर आधारित",
    noActionNeeded: "तुमचे पीक चांगले आहे! नियमित निरीक्षण सुरू ठेवा।",
    confidence: "विश्वासार्हता",
    rulesApplied: "नियम लागू",
    wateringNeeded: "पाणी द्यावे",
    fertilizerNeeded: "खत द्यावे",
    pestControl: "कीड नियंत्रण",
    diseaseControl: "रोग व्यवस्थापन",
    harvestReady: "कापणीची वेळ",
    priority: "प्राधान्य",
    source: "🧠 निर्णय मेंदू (0 AI टोकन, त्वरित)"
  }
};

/**
 * Format Cause enum to human-readable text
 */
function formatCause(cause: Cause, language: string): string {
  const causeTranslations: Record<string, Partial<Record<Cause, string>>> = {
    en: {
      [Cause.WATER_STRESS_CRITICAL]: "Critical water stress - immediate irrigation needed",
      [Cause.WATER_STRESS_MODERATE]: "Moderate water stress",
      [Cause.WATER_STRESS_MILD]: "Mild water stress",
      [Cause.NITROGEN_DEFICIENCY]: "Nitrogen deficiency",
      [Cause.NITROGEN_DEFICIENCY_CRITICAL]: "Critical nitrogen deficiency",
      [Cause.PHOSPHORUS_DEFICIENCY]: "Phosphorus deficiency",
      [Cause.POTASSIUM_DEFICIENCY]: "Potassium deficiency",
      [Cause.HEAT_STRESS]: "Heat stress affecting crop",
      [Cause.COLD_STRESS]: "Cold stress risk",
      [Cause.BOLLWORM_RISK]: "Bollworm infestation risk",
      [Cause.APHID_RISK]: "Aphid attack risk",
      [Cause.RICE_BLAST_RISK]: "Rice blast disease risk",
      [Cause.WHEAT_RUST_RISK]: "Wheat rust risk",
      [Cause.OPTIMAL_GROWTH]: "Optimal growth conditions",
      [Cause.HARVEST_READY]: "Crop ready for harvest"
    },
    hi: {
      [Cause.WATER_STRESS_CRITICAL]: "गंभीर पानी की कमी - तुरंत सिंचाई करें",
      [Cause.WATER_STRESS_MODERATE]: "मध्यम पानी की कमी",
      [Cause.WATER_STRESS_MILD]: "हल्की पानी की कमी",
      [Cause.NITROGEN_DEFICIENCY]: "नाइट्रोजन की कमी",
      [Cause.NITROGEN_DEFICIENCY_CRITICAL]: "गंभीर नाइट्रोजन की कमी",
      [Cause.PHOSPHORUS_DEFICIENCY]: "फॉस्फोरस की कमी",
      [Cause.POTASSIUM_DEFICIENCY]: "पोटाश की कमी",
      [Cause.HEAT_STRESS]: "गर्मी का तनाव",
      [Cause.COLD_STRESS]: "ठंड का खतरा",
      [Cause.BOLLWORM_RISK]: "बॉलवर्म का खतरा",
      [Cause.APHID_RISK]: "एफिड का खतरा",
      [Cause.RICE_BLAST_RISK]: "धान का ब्लास्ट रोग",
      [Cause.WHEAT_RUST_RISK]: "गेहूं में रस्ट रोग",
      [Cause.OPTIMAL_GROWTH]: "उत्तम वृद्धि की स्थिति",
      [Cause.HARVEST_READY]: "कटाई के लिए तैयार"
    },
    mr: {
      [Cause.WATER_STRESS_CRITICAL]: "गंभीर पाण्याची कमतरता - ताबडतोब पाणी द्या",
      [Cause.WATER_STRESS_MODERATE]: "मध्यम पाण्याची कमतरता",
      [Cause.WATER_STRESS_MILD]: "सौम्य पाण्याची कमतरता",
      [Cause.NITROGEN_DEFICIENCY]: "नायट्रोजनची कमतरता",
      [Cause.NITROGEN_DEFICIENCY_CRITICAL]: "गंभीर नायट्रोजनची कमतरता",
      [Cause.PHOSPHORUS_DEFICIENCY]: "स्फुरदाची कमतरता",
      [Cause.POTASSIUM_DEFICIENCY]: "पालाशची कमतरता",
      [Cause.HEAT_STRESS]: "उष्णतेचा ताण",
      [Cause.COLD_STRESS]: "थंडीचा धोका",
      [Cause.BOLLWORM_RISK]: "बोंडअळीचा धोका",
      [Cause.APHID_RISK]: "माव्याचा धोका",
      [Cause.RICE_BLAST_RISK]: "भाताचा करपा रोग",
      [Cause.WHEAT_RUST_RISK]: "गहू तांबेरा रोग",
      [Cause.OPTIMAL_GROWTH]: "उत्तम वाढीची परिस्थिती",
      [Cause.HARVEST_READY]: "कापणीसाठी तयार"
    }
  };
  
  const lang = causeTranslations[language] || causeTranslations.en;
  return lang[cause] || cause.replace(/_/g, ' ').toLowerCase();
}

/**
 * Format Action enum to human-readable text
 */
function formatAction(action: Action, language: string): string {
  const actionTranslations: Record<string, Partial<Record<Action, string>>> = {
    en: {
      [Action.IRRIGATE_IMMEDIATELY]: "Apply irrigation immediately",
      [Action.IRRIGATE_LIGHT]: "Apply light irrigation",
      [Action.IRRIGATE_HEAVY]: "Apply heavy irrigation",
      [Action.EMERGENCY_IRRIGATION]: "Apply emergency irrigation",
      [Action.APPLY_NITROGEN]: "Apply nitrogen fertilizer",
      [Action.APPLY_PHOSPHORUS]: "Apply phosphorus fertilizer",
      [Action.APPLY_POTASSIUM]: "Apply potassium fertilizer",
      [Action.APPLY_ORGANIC_MANURE]: "Apply organic manure",
      [Action.APPLY_INSECTICIDE]: "Apply insecticide",
      [Action.APPLY_FUNGICIDE]: "Apply fungicide",
      [Action.APPLY_NEEM_OIL]: "Apply neem oil spray",
      [Action.MONITOR_CLOSELY]: "Monitor field closely",
      [Action.WAIT_AND_WATCH]: "Wait and observe",
      [Action.CONTINUE_CURRENT]: "Continue current practices",
      [Action.EARLY_HARVEST]: "Harvest early",
      [Action.SALVAGE_HARVEST]: "Salvage harvest immediately"
    },
    hi: {
      [Action.IRRIGATE_IMMEDIATELY]: "तुरंत सिंचाई करें",
      [Action.IRRIGATE_LIGHT]: "हल्की सिंचाई करें",
      [Action.IRRIGATE_HEAVY]: "भारी सिंचाई करें",
      [Action.EMERGENCY_IRRIGATION]: "आपातकालीन सिंचाई करें",
      [Action.APPLY_NITROGEN]: "नाइट्रोजन खाद डालें",
      [Action.APPLY_PHOSPHORUS]: "फॉस्फोरस खाद डालें",
      [Action.APPLY_POTASSIUM]: "पोटाश खाद डालें",
      [Action.APPLY_ORGANIC_MANURE]: "जैविक खाद डालें",
      [Action.APPLY_INSECTICIDE]: "कीटनाशक स्प्रे करें",
      [Action.APPLY_FUNGICIDE]: "फफूंदनाशक स्प्रे करें",
      [Action.APPLY_NEEM_OIL]: "नीम तेल स्प्रे करें",
      [Action.MONITOR_CLOSELY]: "बारीकी से निगरानी करें",
      [Action.WAIT_AND_WATCH]: "इंतजार करें और देखें",
      [Action.CONTINUE_CURRENT]: "वर्तमान तरीके जारी रखें",
      [Action.EARLY_HARVEST]: "जल्दी कटाई करें",
      [Action.SALVAGE_HARVEST]: "तुरंत बचाव कटाई करें"
    },
    mr: {
      [Action.IRRIGATE_IMMEDIATELY]: "ताबडतोब पाणी द्या",
      [Action.IRRIGATE_LIGHT]: "हलके पाणी द्या",
      [Action.IRRIGATE_HEAVY]: "जास्त पाणी द्या",
      [Action.EMERGENCY_IRRIGATION]: "आणीबाणी पाणी द्या",
      [Action.APPLY_NITROGEN]: "नायट्रोजन खत द्या",
      [Action.APPLY_PHOSPHORUS]: "स्फुरद खत द्या",
      [Action.APPLY_POTASSIUM]: "पालाश खत द्या",
      [Action.APPLY_ORGANIC_MANURE]: "सेंद्रिय खत द्या",
      [Action.APPLY_INSECTICIDE]: "किटकनाशक फवारणी करा",
      [Action.APPLY_FUNGICIDE]: "बुरशीनाशक फवारणी करा",
      [Action.APPLY_NEEM_OIL]: "कडुलिंब तेल फवारणी करा",
      [Action.MONITOR_CLOSELY]: "बारकाईने निरीक्षण करा",
      [Action.WAIT_AND_WATCH]: "थांबा आणि पहा",
      [Action.CONTINUE_CURRENT]: "सध्याच्या पद्धती सुरू ठेवा",
      [Action.EARLY_HARVEST]: "लवकर कापणी करा",
      [Action.SALVAGE_HARVEST]: "ताबडतोब बचाव कापणी करा"
    }
  };
  
  const lang = actionTranslations[language] || actionTranslations.en;
  return lang[action] || action.replace(/_/g, ' ').toLowerCase();
}

/**
 * Get action category for card styling
 */
function getActionCategory(action: Action): string {
  const irrigationActions = [Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY, Action.EMERGENCY_IRRIGATION, Action.DRAIN_FIELD];
  const nutrientActions = [Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM, Action.APPLY_ZINC, Action.APPLY_ORGANIC_MANURE, Action.APPLY_MICRONUTRIENTS];
  const pestActions = [Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL, Action.APPLY_BIO_CONTROL, Action.INSTALL_PHEROMONE_TRAPS, Action.INSTALL_TRAPS];
  const diseaseActions = [Action.APPLY_FUNGICIDE, Action.APPLY_TRICHODERMA];
  
  if (irrigationActions.includes(action)) return 'irrigation';
  if (nutrientActions.includes(action)) return 'nutrient';
  if (pestActions.includes(action)) return 'pest';
  if (diseaseActions.includes(action)) return 'disease';
  return 'info';
}

/**
 * Format UnifiedAdvisory to chat-friendly response
 */
export function formatAdvisoryForChat(
  advisory: UnifiedAdvisory,
  language: string = 'en'
): ChatResponse {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const riskDesc = getRiskDescription(advisory.risk_level);
  
  let responseText = '';
  const cards: ChatResponse['structuredResponse']['cards'] = [];
  
  // Add greeting
  responseText += `🌾 **${t.greeting}**\n\n`;
  
  // Add risk-based greeting
  if (advisory.risk_level === RiskLevel.CRITICAL) {
    responseText += `⚠️ ${t.riskCritical}\n\n`;
  } else if (advisory.risk_level === RiskLevel.HIGH) {
    responseText += `🔴 ${t.riskHigh}\n\n`;
  } else if (advisory.risk_level === RiskLevel.MEDIUM) {
    responseText += `🟡 ${t.riskMedium}\n\n`;
  } else {
    responseText += `🟢 ${t.riskLow}\n\n`;
  }
  
  // Add causes if any
  if (advisory.causes.length > 0) {
    responseText += `📊 **${t.causesTitle}:**\n`;
    for (const cause of advisory.causes.slice(0, 3)) {
      responseText += `• ${formatCause(cause, language)}\n`;
    }
    responseText += '\n';
  }
  
  // Add actions
  if (advisory.actions.length > 0) {
    responseText += `✅ **${t.actionsTitle}:**\n\n`;
    
    for (let i = 0; i < Math.min(advisory.actions.length, 5); i++) {
      const action = advisory.actions[i];
      const actionText = formatAction(action.action, language);
      const urgencyText = action.urgency.replace(/_/g, ' ');
      
      responseText += `${i + 1}. **${actionText}**\n`;
      responseText += `   ⏰ ${urgencyText}\n`;
      if (action.scientific_source) {
        responseText += `   📚 ${action.scientific_source}\n`;
      }
      responseText += '\n';
      
      // Create card for structured response
      const category = getActionCategory(action.action);
      let cardType: 'organic' | 'fertilizer' | 'pesticide' | 'warning' | 'success' | 'info' | 'hormone' | 'irrigation' = 'info';
      let cardIcon = 'info';
      let cardColor = '#3B82F6';
      
      if (category === 'irrigation') {
        cardType = 'irrigation';
        cardIcon = 'droplet';
        cardColor = '#0EA5E9';
      } else if (category === 'nutrient') {
        cardType = 'fertilizer';
        cardIcon = 'leaf';
        cardColor = '#22C55E';
      } else if (category === 'pest') {
        cardType = 'pesticide';
        cardIcon = 'bug';
        cardColor = '#EF4444';
      } else if (category === 'disease') {
        cardType = 'warning';
        cardIcon = 'alert-triangle';
        cardColor = '#F59E0B';
      }
      
      cards.push({
        id: `action-${i}`,
        type: cardType,
        title: actionText,
        content: `${urgencyText} | ${action.scientific_source || 'ICAR Guidelines'}`,
        color: cardColor,
        gradient: [cardColor, cardColor + '80'],
        icon: cardIcon,
        priority: action.priority
      });
    }
  } else {
    responseText += `✅ ${t.noActionNeeded}\n\n`;
  }
  
  // Add scientific basis and source
  responseText += `\n---\n📚 ${t.scientificBasis}\n`;
  responseText += `${t.confidence}: ${Math.round(advisory.confidence * 100)}% | ${advisory.rules_applied.length} ${t.rulesApplied}\n`;
  responseText += `\n_${t.source}_`;
  
  return {
    response: responseText,
    structuredResponse: cards.length > 0 ? { cards, language } : undefined,
    source: 'decision_brain',
    advisory,
    executionTimeMs: 0 // Will be set by caller
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SERVICE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionBrainResult {
  handled: boolean;
  response?: ChatResponse;
  fallbackToAI: boolean;
  reason?: string;
}

/**
 * Try to answer using Decision Brain
 * Returns handled=true if answered, fallbackToAI=true if AI needed
 */
export function tryDecisionBrain(
  query: string,
  landContext: LandContext | null,
  language: string = 'en',
  farmerId: string = 'anonymous',
  tenantId: string = 'default'
): DecisionBrainResult {
  const startTime = Date.now();
  
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`🧠 [DECISION BRAIN] Starting analysis...`);
  console.log(`Query: "${query.substring(0, 100)}..."`);
  console.log(`Language: ${language}`);
  console.log(`Land: ${landContext?.name || 'No land context'}`);
  console.log(`Crop: ${landContext?.crop_name || landContext?.crop_code || 'Unknown'}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
  
  // Step 1: Classify query
  const classification = classifyQueryForDecisionBrain(query);
  console.log(`📋 [Decision Brain] Classification:`, classification);
  
  // If not agricultural, fall back to AI
  if (!classification.isAgricultural) {
    console.log(`❌ [Decision Brain] Query not agricultural → AI Fallback`);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'non_agricultural_query'
    };
  }
  
  // Step 2: Check if we have land context
  if (!landContext) {
    console.log(`❌ [Decision Brain] No land context → AI Fallback`);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'no_land_context'
    };
  }
  
  // Step 3: Convert land context to decision input
  const decisionInput = landContextToDecisionInput(landContext, farmerId, tenantId);
  if (!decisionInput) {
    console.log(`❌ [Decision Brain] Invalid land data → AI Fallback`);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'invalid_land_data'
    };
  }
  
  // Step 4: Run Decision Graph
  try {
    console.log(`🔄 [Decision Brain] Running Decision Graph...`);
    const advisory = runDecisionGraphSync(decisionInput);
    
    console.log(`📊 [Decision Brain] Advisory result:`, {
      risk_level: advisory.risk_level,
      causes_count: advisory.causes.length,
      actions_count: advisory.actions.length,
      confidence: advisory.confidence,
      rules_applied: advisory.rules_applied.length
    });
    
    // Step 5: Format response
    const chatResponse = formatAdvisoryForChat(advisory, language);
    chatResponse.executionTimeMs = Date.now() - startTime;
    
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`✅ [DECISION BRAIN] SUCCESS!`);
    console.log(`⏱️ Execution time: ${chatResponse.executionTimeMs}ms`);
    console.log(`📏 Rules applied: ${advisory.rules_applied.length}`);
    console.log(`🎯 Actions generated: ${advisory.actions.length}`);
    console.log(`💰 AI tokens used: 0`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
    
    return {
      handled: true,
      response: chatResponse,
      fallbackToAI: false
    };
    
  } catch (error) {
    console.error(`❌ [Decision Brain] Execution error:`, error);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'execution_error'
    };
  }
}

/**
 * Get Decision Brain status for debugging
 */
export function getDecisionBrainStatus(): {
  available: boolean;
  version: string;
  rulesLoaded: boolean;
} {
  return {
    available: true,
    version: '1.0.0',
    rulesLoaded: true
  };
}
