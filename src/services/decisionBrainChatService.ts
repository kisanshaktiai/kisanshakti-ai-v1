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
  Action
} from '@/decision-graph';

// ═══════════════════════════════════════════════════════════════════════════
// QUERY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════

interface QueryClassification {
  isAgricultural: boolean;
  queryType: 'watering' | 'fertilizer' | 'pest' | 'disease' | 'harvest' | 'weather' | 'general' | 'non_agri';
  canUseDecisionBrain: boolean;
  requiresAI: boolean;
}

/**
 * Classify user query to determine if Decision Brain can handle it
 */
export function classifyQueryForDecisionBrain(query: string): QueryClassification {
  const q = query.toLowerCase();
  
  // Agricultural keywords (Hindi, Marathi, English)
  const agriKeywords = {
    watering: [
      'water', 'irrigation', 'irrigate', 'पानी', 'सिंचाई', 'पाणी', 'सिंचन',
      'drip', 'ड्रिप', 'कब पानी', 'when to water', 'कितना पानी', 'how much water'
    ],
    fertilizer: [
      'fertilizer', 'खाद', 'खत', 'urea', 'यूरिया', 'युरिया', 'dap', 'डीएपी',
      'npk', 'potash', 'पोटाश', 'nitrogen', 'नाइट्रोजन', 'nutrient', 'पोषण',
      'कौनसी खाद', 'which fertilizer', 'कितनी खाद', 'how much fertilizer'
    ],
    pest: [
      'pest', 'कीट', 'किड', 'insect', 'bug', 'worm', 'कीड़ा', 'इल्ली',
      'spray', 'स्प्रे', 'फवारणी', 'pesticide', 'कीटनाशक', 'किटकनाशक'
    ],
    disease: [
      'disease', 'रोग', 'blight', 'rust', 'wilt', 'rot', 'fungus',
      'फफूंद', 'पीला पड़ना', 'yellowing', 'spots', 'धब्बे'
    ],
    harvest: [
      'harvest', 'कटाई', 'कापणी', 'when to harvest', 'कब काटें',
      'ready', 'mature', 'पकना', 'तैयार'
    ],
    weather: [
      'weather', 'मौसम', 'हवामान', 'rain', 'बारिश', 'पाऊस',
      'temperature', 'तापमान', 'heat', 'गर्मी', 'cold', 'ठंड'
    ],
    general: [
      'crop', 'फसल', 'पीक', 'field', 'खेत', 'शेत', 'land', 'जमीन',
      'farming', 'खेती', 'शेती', 'agriculture', 'कृषि', 'grow', 'उगाना',
      'sowing', 'बुवाई', 'पेरणी', 'plant', 'पौधा', 'झाड', 'aaj kya karna hai',
      'आज क्या करना है', 'आज काय करायचे', 'today', 'आज'
    ]
  };
  
  // Check each category
  for (const [category, keywords] of Object.entries(agriKeywords)) {
    if (keywords.some(kw => q.includes(kw))) {
      return {
        isAgricultural: true,
        queryType: category as QueryClassification['queryType'],
        canUseDecisionBrain: ['watering', 'fertilizer', 'pest', 'disease', 'harvest', 'general'].includes(category),
        requiresAI: false
      };
    }
  }
  
  // Non-agricultural query
  return {
    isAgricultural: false,
    queryType: 'non_agri',
    canUseDecisionBrain: false,
    requiresAI: true
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
  if (!land || !land.crop_code) {
    return null;
  }
  
  // Calculate days after sowing
  let sowingDate = new Date();
  sowingDate.setDate(sowingDate.getDate() - 30); // Default 30 days ago
  
  if (land.sowing_date) {
    sowingDate = new Date(land.sowing_date);
  }
  
  const cropCode = land.crop_code.toLowerCase();
  
  // Build raw farm data for the fact extractor
  const rawFarmData = {
    farmerId: farmerId,
    landId: land.id || 'unknown',
    tenantId: tenantId,
    cropCode: cropCode,
    sowingDate: sowingDate.toISOString(),
    farmingMode: land.farming_mode,
    
    // Soil data
    soilN: land.soil_data?.n,
    soilP: land.soil_data?.p,
    soilK: land.soil_data?.k,
    soilPH: land.soil_data?.ph,
    soilMoisture: land.soil_data?.moisture,
    soilOrganicCarbon: land.soil_data?.organic_carbon,
    
    // NDVI data
    ndviValue: land.ndvi_data?.value,
    ndviTrend: land.ndvi_data?.trend,
    
    // Weather data
    temperature: land.weather_data?.temperature,
    humidity: land.weather_data?.humidity,
    rainExpected: land.weather_data?.rain_expected,
    windSpeed: land.weather_data?.wind_speed,
    
    // Regional info
    stateCode: land.location?.state,
    districtCode: land.location?.district,
    
    // Irrigation
    irrigationMethod: land.irrigation_type
  };
  
  return buildDecisionInput(rawFarmData);
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVISORY TO CHAT RESPONSE FORMATTER
// ═══════════════════════════════════════════════════════════════════════════

interface ChatResponse {
  response: string;
  structuredResponse?: {
    cards: Array<{
      id: string;
      type: string;
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
    priority: "Priority"
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
    priority: "प्राथमिकता"
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
    priority: "प्राधान्य"
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
      [Action.IRRIGATE_NORMAL]: "Apply normal irrigation",
      [Action.IRRIGATE_CRITICAL]: "Apply emergency irrigation immediately",
      [Action.IRRIGATE_LIGHT]: "Apply light irrigation",
      [Action.APPLY_UREA]: "Apply Urea fertilizer",
      [Action.APPLY_DAP]: "Apply DAP fertilizer",
      [Action.APPLY_MOP]: "Apply Muriate of Potash",
      [Action.APPLY_NPK_COMPLEX]: "Apply NPK complex fertilizer",
      [Action.APPLY_COMPOST]: "Apply organic compost",
      [Action.APPLY_FYM]: "Apply Farm Yard Manure",
      [Action.SPRAY_INSECTICIDE]: "Spray insecticide",
      [Action.SPRAY_FUNGICIDE]: "Spray fungicide",
      [Action.MONITOR_CLOSELY]: "Monitor field closely",
      [Action.WAIT_AND_WATCH]: "Wait and observe",
      [Action.CONTINUE_CURRENT]: "Continue current practices",
      [Action.HARVEST_NOW]: "Harvest immediately",
      [Action.PREPARE_HARVEST]: "Prepare for harvesting"
    },
    hi: {
      [Action.IRRIGATE_NORMAL]: "सामान्य सिंचाई करें",
      [Action.IRRIGATE_CRITICAL]: "तुरंत आपातकालीन सिंचाई करें",
      [Action.IRRIGATE_LIGHT]: "हल्की सिंचाई करें",
      [Action.APPLY_UREA]: "यूरिया खाद डालें",
      [Action.APPLY_DAP]: "DAP खाद डालें",
      [Action.APPLY_MOP]: "पोटाश खाद डालें",
      [Action.APPLY_NPK_COMPLEX]: "NPK मिश्रित खाद डालें",
      [Action.APPLY_COMPOST]: "जैविक खाद डालें",
      [Action.APPLY_FYM]: "गोबर की खाद डालें",
      [Action.SPRAY_INSECTICIDE]: "कीटनाशक स्प्रे करें",
      [Action.SPRAY_FUNGICIDE]: "फफूंदनाशक स्प्रे करें",
      [Action.MONITOR_CLOSELY]: "बारीकी से निगरानी करें",
      [Action.WAIT_AND_WATCH]: "इंतजार करें और देखें",
      [Action.CONTINUE_CURRENT]: "वर्तमान तरीके जारी रखें",
      [Action.HARVEST_NOW]: "अभी कटाई करें",
      [Action.PREPARE_HARVEST]: "कटाई की तैयारी करें"
    },
    mr: {
      [Action.IRRIGATE_NORMAL]: "सामान्य पाणी द्या",
      [Action.IRRIGATE_CRITICAL]: "ताबडतोब आणीबाणी पाणी द्या",
      [Action.IRRIGATE_LIGHT]: "हलके पाणी द्या",
      [Action.APPLY_UREA]: "युरिया खत द्या",
      [Action.APPLY_DAP]: "DAP खत द्या",
      [Action.APPLY_MOP]: "पोटॅश खत द्या",
      [Action.APPLY_NPK_COMPLEX]: "NPK मिश्रित खत द्या",
      [Action.APPLY_COMPOST]: "सेंद्रिय खत द्या",
      [Action.APPLY_FYM]: "शेणखत द्या",
      [Action.SPRAY_INSECTICIDE]: "किटकनाशक फवारणी करा",
      [Action.SPRAY_FUNGICIDE]: "बुरशीनाशक फवारणी करा",
      [Action.MONITOR_CLOSELY]: "बारकाईने निरीक्षण करा",
      [Action.WAIT_AND_WATCH]: "थांबा आणि पहा",
      [Action.CONTINUE_CURRENT]: "सध्याच्या पद्धती सुरू ठेवा",
      [Action.HARVEST_NOW]: "आत्ता कापणी करा",
      [Action.PREPARE_HARVEST]: "कापणीची तयारी करा"
    }
  };
  
  const lang = actionTranslations[language] || actionTranslations.en;
  return lang[action] || action.replace(/_/g, ' ').toLowerCase();
}

/**
 * Get action category for card styling
 */
function getActionCategory(action: Action): string {
  const irrigationActions = [Action.IRRIGATE_NORMAL, Action.IRRIGATE_CRITICAL, Action.IRRIGATE_LIGHT, Action.DRAIN_WATER];
  const nutrientActions = [Action.APPLY_UREA, Action.APPLY_DAP, Action.APPLY_MOP, Action.APPLY_NPK_COMPLEX, Action.APPLY_COMPOST, Action.APPLY_FYM];
  const pestActions = [Action.SPRAY_INSECTICIDE, Action.SPRAY_ORGANIC_PESTICIDE, Action.INSTALL_PHEROMONE_TRAP, Action.BIOLOGICAL_CONTROL];
  const diseaseActions = [Action.SPRAY_FUNGICIDE, Action.SPRAY_ORGANIC_FUNGICIDE, Action.REMOVE_INFECTED_PLANTS];
  
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
    responseText += `📊 ${t.causesTitle}:\n`;
    for (const cause of advisory.causes.slice(0, 3)) {
      responseText += `• ${formatCause(cause, language)}\n`;
    }
    responseText += '\n';
  }
  
  // Add actions
  if (advisory.actions.length > 0) {
    responseText += `✅ ${t.actionsTitle}:\n\n`;
    
    for (let i = 0; i < Math.min(advisory.actions.length, 5); i++) {
      const action = advisory.actions[i];
      const actionText = formatAction(action.action, language);
      const urgencyText = action.urgency.replace(/_/g, ' ');
      
      responseText += `${i + 1}. ${actionText}\n`;
      responseText += `   ⏰ ${urgencyText}\n`;
      if (action.scientific_source) {
        responseText += `   📚 ${action.scientific_source}\n`;
      }
      responseText += '\n';
      
      // Create card for structured response
      const category = getActionCategory(action.action);
      let cardType = 'info';
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
  
  // Add scientific basis
  responseText += `\n📚 ${t.scientificBasis}\n`;
  responseText += `${t.confidence}: ${Math.round(advisory.confidence * 100)}% | ${advisory.rules_applied.length} ${t.rulesApplied}`;
  
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
  
  // Step 1: Classify query
  const classification = classifyQueryForDecisionBrain(query);
  
  // If not agricultural, fall back to AI
  if (!classification.isAgricultural) {
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'non_agricultural_query'
    };
  }
  
  // Step 2: Check if we have land context
  if (!landContext) {
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'no_land_context'
    };
  }
  
  // Step 3: Convert land context to decision input
  const decisionInput = landContextToDecisionInput(landContext, farmerId, tenantId);
  if (!decisionInput) {
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'invalid_land_data'
    };
  }
  
  // Step 4: Run Decision Graph
  try {
    const advisory = runDecisionGraphSync(decisionInput);
    
    // Step 5: Format response
    const chatResponse = formatAdvisoryForChat(advisory, language);
    chatResponse.executionTimeMs = Date.now() - startTime;
    
    console.log(`🧠 [Decision Brain] Answered in ${chatResponse.executionTimeMs}ms with ${advisory.rules_applied.length} rules, 0 AI tokens`);
    
    return {
      handled: true,
      response: chatResponse,
      fallbackToAI: false
    };
    
  } catch (error) {
    console.error('[Decision Brain] Execution error:', error);
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
  
  // Step 4: Run Decision Graph
  try {
    const advisory = runDecisionGraphSync(decisionInput);
    
    // Step 5: Format response
    const chatResponse = formatAdvisoryForChat(advisory, language);
    chatResponse.executionTimeMs = Date.now() - startTime;
    
    console.log(`🧠 [Decision Brain] Answered in ${chatResponse.executionTimeMs}ms with ${advisory.rules_applied.length} rules, 0 AI tokens`);
    
    return {
      handled: true,
      response: chatResponse,
      fallbackToAI: false
    };
    
  } catch (error) {
    console.error('[Decision Brain] Execution error:', error);
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
