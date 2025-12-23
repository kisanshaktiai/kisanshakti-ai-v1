/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION BRAIN CHAT SERVICE - Land-Scoped, Intent-Aware
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Integrates the Symbolic Decision Graph Engine with the AI Chat.
 * 
 * CRITICAL 4-STAGE PIPELINE:
 * 1. Land-Scoped Context (MANDATORY - chat NEVER runs without land)
 * 2. Intent Inference (Symbolic + Tolerant - offline-capable)
 * 3. Full Decision Graph (UNCHANGED - runs complete reasoning)
 * 4. Intent-Based Action Filtering (CRITICAL FIX - filters AFTER reasoning)
 * 
 * NON-NEGOTIABLE RULES:
 * ❌ Do NOT change Decision Graph logic
 * ❌ Do NOT let AI decide actions
 * ❌ Do NOT return unrelated advice
 * ✅ Filter advice AFTER reasoning based on farmer's intent
 * ✅ Say "no action needed" when appropriate
 * ✅ Log all interactions for training
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

// ✅ NEW: Import Intent-Aware Services
import {
  inferFarmerIntent,
  filterActionsByIntent,
  createChatInteractionLog,
  logChatInteraction,
  type FarmerIntent,
  type IntentInferenceResult,
  type IntentFilteredAdvisory
} from '@/services/chat/farmerIntentService';

// ✅ NEW: Import Safety Layers
import {
  runAllSafetyFilters,
  translateBlockedReason,
  type SafetyFilterResult,
  type DataTimestamps,
  type FarmerProfile
} from '@/services/chat/safetyLayers';

// ✅ NEW: Import Symptom Pattern Recognizer (Multi-Cause Analysis)
import {
  analyzeSymptoms,
  extractCausesFromSymptoms,
  type SymptomAnalysis,
  type PossibleCause
} from '@/services/chat/symptomPatternRecognizer';

// ✅ NEW: Import Field Context Snapshot Builder
import {
  buildFieldContextSnapshot,
  type FieldContextSnapshot
} from '@/services/chat/fieldContextSnapshot';

// ✅ NEW: Import Farmer Message Classifier
import {
  classifyFarmerMessage,
  type MessageClassification
} from '@/services/chat/farmerMessageClassifier';

// ✅ NEW: Import Structured Response Builder
import {
  buildStructuredResponse,
  type StructuredResponse
} from '@/services/chat/structuredResponseBuilder';

// ✅ NEW: Import Crop Selection Rules Engine
import {
  getCropRecommendations,
  formatCropRecommendationsForFarmer,
  type CropSelectionInput,
  type CropSelectionResult
} from '@/decision-graph/crop-selection-rules';

// ✅ NEW: Import Diagnosis-First Modules (Production-Ready Pipeline)
import {
  determineDiagnosticMode,
  type DiagnosticDecision,
  DiagnosticMode
} from '@/services/chat/diagnosticModeController';

import {
  buildDiagnosticResponse,
  type DiagnosticResponse
} from '@/services/chat/diagnosticResponseBuilder';

import {
  applyAbsoluteRulesGuard,
  canRecommendChemicals,
  canRecommendFertilizers,
  type RuleViolation,
  type GuardedAdvisory
} from '@/services/chat/absoluteRulesGuard';

// Re-export for external use
export { inferFarmerIntent };
export type { FarmerIntent, IntentInferenceResult };
export { analyzeSymptoms };
export type { SymptomAnalysis, PossibleCause };
export { determineDiagnosticMode };
export type { DiagnosticMode, DiagnosticDecision };

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
// CROP STAGE CALCULATOR - Determines growth stage from days after sowing
// ═══════════════════════════════════════════════════════════════════════════

interface CropStageDurations {
  germination: number;   // Days 0 - germination
  vegetative: number;    // Days germination - vegetative
  reproductive: number;  // Days vegetative - reproductive
  maturity: number;      // Days reproductive - maturity
}

const CROP_STAGE_DURATIONS: Record<string, CropStageDurations> = {
  // Sugarcane (long duration crop) - Germination ~21 days, then Tillering starts
  // 21-90 days = Tillering (vegetative), 90-180 = Grand Growth, 180-270 = Maturation
  'sugarcane': { germination: 21, vegetative: 120, reproductive: 240, maturity: 330 },
  
  // Cereals
  'wheat': { germination: 15, vegetative: 60, reproductive: 90, maturity: 120 },
  'rice': { germination: 20, vegetative: 55, reproductive: 90, maturity: 130 },
  'maize': { germination: 12, vegetative: 50, reproductive: 80, maturity: 100 },
  
  // Pulses
  'gram': { germination: 10, vegetative: 45, reproductive: 75, maturity: 100 },
  'soybean': { germination: 12, vegetative: 50, reproductive: 80, maturity: 110 },
  
  // Oilseeds
  'groundnut': { germination: 15, vegetative: 45, reproductive: 85, maturity: 115 },
  'sunflower': { germination: 12, vegetative: 45, reproductive: 70, maturity: 95 },
  'mustard': { germination: 10, vegetative: 45, reproductive: 75, maturity: 110 },
  
  // Cotton
  'cotton': { germination: 15, vegetative: 60, reproductive: 100, maturity: 160 },
  
  // Vegetables
  'tomato': { germination: 10, vegetative: 40, reproductive: 70, maturity: 100 },
  'onion': { germination: 12, vegetative: 50, reproductive: 90, maturity: 120 },
  'potato': { germination: 15, vegetative: 45, reproductive: 75, maturity: 100 },
  'brinjal': { germination: 12, vegetative: 45, reproductive: 80, maturity: 120 },
  'okra': { germination: 8, vegetative: 35, reproductive: 55, maturity: 75 },
  'chilli': { germination: 15, vegetative: 55, reproductive: 90, maturity: 130 },
  
  // Fruits
  'banana': { germination: 30, vegetative: 180, reproductive: 270, maturity: 360 },
  
  // Default for unknown crops
  'default': { germination: 15, vegetative: 50, reproductive: 80, maturity: 110 }
};

/**
 * Calculate the current crop stage from days after sowing
 * 
 * @param daysAfterSowing - Number of days since sowing
 * @param cropCode - Crop code to get specific stage durations
 * @returns The calculated CropStage
 */
export function calculateCropStageFromDAS(daysAfterSowing: number, cropCode?: string): CropStage {
  // Get crop-specific durations or default
  const normalizedCrop = cropCode?.toLowerCase() || 'default';
  const durations = CROP_STAGE_DURATIONS[normalizedCrop] || CROP_STAGE_DURATIONS['default'];
  
  // Determine stage based on days
  if (daysAfterSowing <= durations.germination) {
    return CropStage.GERMINATION;
  } else if (daysAfterSowing <= durations.vegetative) {
    return CropStage.VEGETATIVE;
  } else if (daysAfterSowing <= durations.reproductive) {
    return CropStage.REPRODUCTIVE;
  } else if (daysAfterSowing <= durations.maturity) {
    return CropStage.MATURITY;
  } else {
    return CropStage.HARVEST;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY CLASSIFICATION - HYBRID APPROACH (Symbolic Brain + Neural Enhancement)
// ═══════════════════════════════════════════════════════════════════════════
// 🎯 2030-READY PRINCIPLE: Every answer comes from symbolic logic. AI only refines language.

interface QueryClassification {
  isAgricultural: boolean;
  queryType: 'watering' | 'fertilizer' | 'pest' | 'disease' | 'harvest' | 'weather' | 'general' | 'crop_selection' | 'non_agri';
  canUseDecisionBrain: boolean;
  requiresAI: boolean;
  requiresAIEnhancement: boolean; // ✅ NEW: AI enhances but doesn't decide
  isFollowUp: boolean;           // ✅ NEW: Track follow-up questions
  isDetailedQuestion: boolean;   // ✅ NEW: Questions needing explanation
  needsPhotoForSoil?: boolean;   // ✅ NEW: Crop selection may need soil photo
  matchedKeywords: string[];
}

/**
 * Classify user query to determine processing path
 * 
 * 🎯 CRITICAL 2030 HYBRID RULES:
 * 1. Symbolic Brain ALWAYS runs for agricultural queries
 * 2. AI Enhancement is triggered for complex questions
 * 3. AI NEVER decides - only makes answers farmer-friendly
 * 
 * ✅ PRODUCTION-READY: Multi-crop, multi-language fuzzy matching
 */
export function classifyQueryForDecisionBrain(query: string): QueryClassification {
  const q = query.toLowerCase();
  const matchedKeywords: string[] = [];
  
  // ✅ HYBRID: Detect if this is a follow-up/detailed question
  const followupPatterns = [
    'tell me more', 'बताओ', 'सांगा', 'explain', 'समझाओ', 'समजावून सांगा',
    'how to', 'कैसे', 'कसे', 'why', 'क्यों', 'का', 'what is', 'क्या है', 'काय आहे',
    'details', 'विस्तार', 'विस्तृत', 'more about', 'के बारे में', 'बद्दल',
    'step by step', 'कदम', 'पायऱ्या', 'how much', 'कितना', 'किती',
    'which', 'कौनसा', 'कोणता', 'और', 'आणखी', 'more'
  ];
  
  const isFollowUp = followupPatterns.some(p => q.includes(p));
  const isDetailedQuestion = /\b(how|why|when|what|which|explain|details|step)\b/i.test(q) ||
                             /\b(कैसे|क्यों|कब|क्या|कौन|समझाओ|विस्तार)\b/.test(q) ||
                             /\b(कसे|का|कधी|काय|कोण|समजावा|विस्तृत)\b/.test(q);
  
  // ✅ CRITICAL FIX: Crop names in all languages (for fuzzy matching)
  const cropKeywords = [
    // English crops
    'wheat', 'rice', 'paddy', 'cotton', 'sugarcane', 'soybean', 'maize', 'corn',
    'groundnut', 'tomato', 'onion', 'potato', 'gram', 'chickpea', 'mustard',
    'sunflower', 'turmeric', 'ginger', 'banana', 'mango', 'grapes', 'pomegranate',
    'chilli', 'brinjal', 'okra', 'cabbage', 'cauliflower',
    // Hindi crops (हिंदी)
    'गेहूं', 'गेहूँ', 'चावल', 'धान', 'कपास', 'रुई', 'गन्ना', 'ईख', 'सोयाबीन',
    'मक्का', 'मूंगफली', 'टमाटर', 'प्याज', 'आलू', 'चना', 'सरसों', 'सूरजमुखी',
    'हल्दी', 'अदरक', 'केला', 'आम', 'अंगूर', 'अनार', 'मिर्च', 'बैंगन', 'भिंडी',
    // Marathi crops (मराठी)
    'गहू', 'तांदूळ', 'भात', 'कापूस', 'ऊस', 'सोयाबिन', 'मका', 'भुईमूग', 'शेंगदाणा',
    'टोमॅटो', 'कांदा', 'बटाटा', 'हरभरा', 'मोहरी', 'सूर्यफूल', 'हळद', 'आले',
    'केळी', 'आंबा', 'द्राक्षे', 'डाळिंब', 'मिरची', 'वांगी', 'भेंडी', 'कोबी', 'फ्लॉवर'
  ];
  
  // ✅ CRITICAL FIX: Problem/symptom words in all languages
  const problemKeywords = [
    // English problems
    'not growing', 'dying', 'wilting', 'drying', 'yellowing', 'problem', 'issue',
    'slow growth', 'stunted', 'leaves falling', 'not coming', 'poor', 'bad',
    'attack', 'damage', 'spots', 'holes', 'curling', 'browning',
    // Hindi problems (हिंदी)
    'नहीं हो रहा', 'मर रहा', 'सूख रहा', 'पीला हो', 'समस्या', 'परेशानी', 'दिक्कत',
    'वाढ नाही', 'बढ़ नहीं', 'नहीं बढ़', 'कम हो', 'खराब', 'गिर रहा', 'झड़ रहा',
    'रुक गया', 'धीमा', 'कमजोर', 'हमला', 'नुकसान', 'धब्बे', 'छेद', 'मुड़ रहा',
    // Marathi problems (मराठी)
    'होत नाही', 'वाढत नाही', 'वाढ नाही', 'वाळत', 'सुकत', 'मरत', 'पिवळे',
    'पिवळी', 'समस्या', 'त्रास', 'अडचण', 'खराब', 'गळत', 'पडत', 'कमी',
    'थांबले', 'मंद', 'कमकुवत', 'हल्ला', 'नुकसान', 'डाग', 'छिद्र', 'गुंडाळ',
    // Common negative patterns
    'नाही', 'नहीं', 'not', 'no'
  ];
  
  // Agricultural keywords (Hindi, Marathi, English)
  const agriKeywords = {
    watering: [
      'water', 'irrigation', 'irrigate', 'पानी', 'सिंचाई', 'पाणी', 'सिंचन',
      'drip', 'ड्रिप', 'कब पानी', 'when to water', 'कितना पानी', 'how much water',
      'पाणी द्या', 'पाणी देणे', 'पाणी कधी', 'ओलावा', 'नमी', 'moisture'
    ],
    fertilizer: [
      'fertilizer', 'खाद', 'खत', 'urea', 'यूरिया', 'युरिया', 'dap', 'डीएपी',
      'npk', 'potash', 'पोटाश', 'nitrogen', 'नाइट्रोजन', 'nutrient', 'पोषण',
      'कौनसी खाद', 'which fertilizer', 'कितनी खाद', 'how much fertilizer',
      'खत द्या', 'खत कधी', 'मॅन्युअर', 'manure', 'compost', 'कंपोस्ट'
    ],
    pest: [
      'pest', 'कीट', 'किड', 'insect', 'bug', 'worm', 'कीड़ा', 'इल्ली',
      'spray', 'स्प्रे', 'फवारणी', 'pesticide', 'कीटनाशक', 'किटकनाशक',
      'किडा', 'कीड', 'अळी', 'borer', 'बोरर', 'aphid', 'माव', 'caterpillar'
    ],
    disease: [
      'disease', 'रोग', 'blight', 'rust', 'wilt', 'rot', 'fungus',
      'फफूंद', 'बुरशी', 'पीला पड़ना', 'yellowing', 'spots', 'धब्बे',
      'करपा', 'तांबेरा', 'leaf curl', 'पान गुंडाळ', 'dead heart', 'गाभा मर'
    ],
    harvest: [
      'harvest', 'कटाई', 'कापणी', 'when to harvest', 'कब काटें',
      'ready', 'mature', 'पकना', 'तैयार', 'पिकले', 'काढणी', 'उत्पादन', 'yield'
    ],
    weather: [
      'weather', 'मौसम', 'हवामान', 'rain', 'बारिश', 'पाऊस',
      'temperature', 'तापमान', 'heat', 'गर्मी', 'cold', 'ठंड', 'थंडी'
    ],
    general: [
      'crop', 'फसल', 'पीक', 'field', 'खेत', 'शेत', 'land', 'जमीन',
      'farming', 'खेती', 'शेती', 'agriculture', 'कृषि', 'grow', 'उगाना', 'वाढ',
      'sowing', 'बुवाई', 'पेरणी', 'plant', 'पौधा', 'झाड', 'aaj kya karna hai',
      'आज क्या करना है', 'आज काय करायचे', 'today', 'आज', 'advice', 'सलाह',
      'काय करू', 'क्या करें', 'what should i do', 'current condition', 'crop condition',
      'growth', 'stage', 'अवस्था', 'care', 'देखभाल', 'काळजी'
    ],
    // ✅ NEW: Crop Selection / Rotation queries
    crop_selection: [
      'which crop', 'what to plant', 'crop selection', 'best crop', 'next crop',
      'what should i grow', 'what to grow', 'crop rotation', 'after harvest',
      'कौनसी फसल', 'क्या बोएं', 'फसल चुनाव', 'अगली फसल', 'क्या उगाएं',
      'कोणते पीक', 'कोणता पीक', 'पीक निवड', 'पुढचे पीक', 'काय पेरावे',
      'पीक घेवू', 'कोणते पीक घेऊ', 'काय लावू', 'काय लावावे', 'पेरणी करू',
      'कोणती फसल', 'फसल लगाएं', 'बोना चाहिए', 'उगाना चाहिए',
      'ya shetata', 'या शेतात', 'konte pik', 'konata pik', 'kay perave',
      'suitable crop', 'recommend crop', 'crop suggest', 'next season'
    ]
  };
  
  // ✅ CRITICAL FIX: Check each category - BUT NEVER bypass symbolic brain
  for (const [category, keywords] of Object.entries(agriKeywords)) {
    for (const kw of keywords) {
      if (q.includes(kw)) {
        matchedKeywords.push(kw);
        const isBrainCategory = ['watering', 'fertilizer', 'pest', 'disease', 'harvest', 'general'].includes(category);
        
        console.log(`🔍 [Decision Brain] Query matched: "${kw}" → ${category} | FollowUp: ${isFollowUp} | Detailed: ${isDetailedQuestion}`);
        
        return {
          isAgricultural: true,
          queryType: category as QueryClassification['queryType'],
          canUseDecisionBrain: isBrainCategory, // ✅ ALWAYS true for agri queries
          requiresAI: false, // ✅ NEVER bypass brain for pure AI
          requiresAIEnhancement: isFollowUp || isDetailedQuestion, // ✅ AI enhances AFTER brain
          isFollowUp,
          isDetailedQuestion,
          matchedKeywords
        };
      }
    }
  }
  
  // ✅ CRITICAL FIX: Check for CROP + PROBLEM pattern (e.g., "गहू वाढ होत नाही")
  const hasCropKeyword = cropKeywords.some(crop => q.includes(crop.toLowerCase()));
  const hasProblemKeyword = problemKeywords.some(prob => q.includes(prob.toLowerCase()));
  
  if (hasCropKeyword || hasProblemKeyword) {
    const matchedCrop = cropKeywords.find(crop => q.includes(crop.toLowerCase()));
    const matchedProblem = problemKeywords.find(prob => q.includes(prob.toLowerCase()));
    
    if (matchedCrop) matchedKeywords.push(matchedCrop);
    if (matchedProblem) matchedKeywords.push(matchedProblem);
    
    console.log(`🔍 [Decision Brain] Fuzzy matched crop/problem: crop="${matchedCrop}", problem="${matchedProblem}"`);
    
    // Determine query type based on problem
    let queryType: QueryClassification['queryType'] = 'general';
    if (hasProblemKeyword) {
      // Check if it's pest/disease related
      const isPestLike = /\b(कीड|किड|insect|bug|worm|borer|अळी|इल्ली)\b/i.test(q);
      const isDiseaseLike = /\b(रोग|disease|fungus|blight|rust|wilt|rot|बुरशी|करपा)\b/i.test(q);
      
      if (isPestLike) queryType = 'pest';
      else if (isDiseaseLike) queryType = 'disease';
      else queryType = 'general'; // Growth/symptom issues
    }
    
    return {
      isAgricultural: true,
      queryType,
      canUseDecisionBrain: true,
      requiresAI: false,
      requiresAIEnhancement: true,
      isFollowUp: false,
      isDetailedQuestion: true,
      matchedKeywords
    };
  }
  
  // Non-agricultural query - check if it might be agricultural but missed
  const maybeAgri = /\b(crop|plant|farm|field|soil|seed|harvest|grow)\b/i.test(q) ||
                    /\b(फसल|पौधा|खेत|मिट्टी|बीज|बुवाई|उगाना)\b/.test(q) ||
                    /\b(पीक|झाड|शेत|माती|बियाणे|पेरणी)\b/.test(q);
  
  if (maybeAgri) {
    console.log(`🔍 [Decision Brain] Possible agri query, running brain anyway: "${q.substring(0, 50)}..."`);
    return {
      isAgricultural: true,
      queryType: 'general',
      canUseDecisionBrain: true,
      requiresAI: false,
      requiresAIEnhancement: true, // Let AI enhance the response
      isFollowUp: false,
      isDetailedQuestion: true,
      matchedKeywords
    };
  }
  
  // Non-agricultural query
  console.log(`🔍 [Decision Brain] Non-agricultural query: "${q.substring(0, 50)}..."`);
  return {
    isAgricultural: false,
    queryType: 'non_agri',
    canUseDecisionBrain: false,
    requiresAI: true,
    requiresAIEnhancement: false,
    isFollowUp: false,
    isDetailedQuestion: false,
    matchedKeywords
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAND CONTEXT TO DECISION INPUT CONVERTER
// ═══════════════════════════════════════════════════════════════════════════

export interface LandContext {
  id?: string;
  name?: string;
  // ✅ CRITICAL: Support both current_crop (from landsApi) and crop_name (legacy)
  crop_name?: string;        // Primary crop identifier
  current_crop?: string;     // From landsApi (alternative source)
  crop_code?: string;
  crop_group?: string;
  // ✅ 2030-READY: Previous crop context for rotation-aware recommendations
  previous_crop?: string;    // Last season's crop
  previous_crop_id?: string; // For database reference
  last_harvest_date?: string; // When previous crop was harvested
  area_hectares?: number;
  area_acres?: number;       // From landsApi - will convert
  farming_mode?: string;
  irrigation_type?: string;
  sowing_date?: string;
  cultivation_date?: string; // From landsApi (alternative source)
  soil_data?: {
    n?: number;
    p?: number;
    k?: number;
    ph?: number;
    organic_carbon?: number;
    moisture?: number;
    test_date?: string;      // ✅ NEW: Soil test timestamp for freshness
  };
  ndvi_data?: {
    value?: number;
    trend?: number;
    timestamp?: string;      // ✅ NEW: NDVI data timestamp for freshness
  };
  weather_data?: {
    temperature?: number;
    humidity?: number;
    rain_expected?: boolean;
    rain_expected_hours?: number; // ✅ NEW: Hours until rain expected
    wind_speed?: number;
    timestamp?: string;      // ✅ NEW: Weather data timestamp for freshness
  };
  location?: {
    state?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
  // Vision analysis context (when coming from image/video analysis)
  vision_context?: {
    detected_crop?: string;
    detected_diseases?: string[];
    detected_pests?: string[];
    health_score?: number;
    confidence?: number;
  };
  // ✅ NEW: Farmer profile for economic filtering
  farmer_profile?: {
    landholding_class: 'MARGINAL' | 'SMALL' | 'MEDIUM' | 'LARGE';
    budget_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    subsidy_eligible?: boolean;
  };
  // ✅ NEW: Season context for calendar guards
  season_context?: {
    season: 'KHARIF' | 'RABI' | 'ZAID';
    monsoon_phase?: 'PRE' | 'ACTIVE' | 'WITHDRAWAL';
  };
}

/**
 * Convert land context to DecisionInput for the engine
 * ✅ FIXED: Handles both current_crop (landsApi) and crop_name (legacy)
 */
export function landContextToDecisionInput(
  land: LandContext | null,
  farmerId: string = 'anonymous',
  tenantId: string = 'default'
) {
  console.log(`🔄 [Decision Brain] Converting land context:`, {
    landId: land?.id,
    landName: land?.name,
    current_crop: land?.current_crop,
    crop_name: land?.crop_name,
    crop_code: land?.crop_code,
    vision_context: land?.vision_context,
    hasSoilData: !!land?.soil_data,
    hasNdviData: !!land?.ndvi_data,
    hasWeatherData: !!land?.weather_data
  });

  if (!land) {
    console.log(`❌ [Decision Brain] No land context provided`);
    return null;
  }
  
  // ✅ CRITICAL FIX: Priority order for crop resolution
  // 1. Vision detected crop (from image analysis)
  // 2. current_crop (from landsApi)
  // 3. crop_name (legacy field)
  // 4. crop_code (direct code)
  const rawCropValue = land.vision_context?.detected_crop 
    || land.current_crop 
    || land.crop_name 
    || land.crop_code;
  
  let cropCode = normalizeCropName(rawCropValue);
  
  if (!cropCode) {
    console.log(`❌ [Decision Brain] No valid crop code found.`, {
      vision_detected: land.vision_context?.detected_crop,
      current_crop: land.current_crop,
      crop_name: land.crop_name,
      crop_code: land.crop_code
    });
    return null;
  }
  
  console.log(`✅ [Decision Brain] Resolved crop code: "${cropCode}" from source: "${rawCropValue}"`);
  
  // Calculate days after sowing
  let sowingDate = new Date();
  sowingDate.setDate(sowingDate.getDate() - 30); // Default 30 days ago
  
  if (land.sowing_date) {
    sowingDate = new Date(land.sowing_date);
  } else if (land.cultivation_date) {
    sowingDate = new Date(land.cultivation_date);
  }
  
  cropCode = cropCode.toLowerCase();
  
  // ✅ FIX: Convert area_acres to hectares if needed
  const areaHectares = land.area_hectares || (land.area_acres ? land.area_acres * 0.404686 : 1);
  
  // ✅ VISION CONTEXT: Use detected diseases/pests to infer risk
  let inferredNdvi = land.ndvi_data?.value ?? 0.55;
  if (land.vision_context?.health_score) {
    // Convert health score (0-100) to NDVI-like value (0.2-0.8)
    inferredNdvi = 0.2 + (land.vision_context.health_score / 100) * 0.6;
  }
  
  // ✅ FIX: Calculate data age for accurate confidence scoring
  // Since we don't have timestamps in the interface, use presence-based estimation
  const soilTestDays = land.soil_data?.n !== undefined ? 30 : undefined; // Assume 30 days if we have soil data
  const ndviDataHours = land.ndvi_data?.value !== undefined ? 24 : undefined; // Assume 24 hours if we have NDVI
  const weatherForecastHours = land.weather_data?.temperature !== undefined ? 6 : undefined; // Assume 6 hours if we have weather
  
  // Build raw farm data for the fact extractor with sensible defaults
  const rawFarmData = {
    farmerId: farmerId,
    landId: land.id || 'unknown',
    tenantId: tenantId,
    cropCode: cropCode,
    sowingDate: sowingDate.toISOString(),
    farmingMode: land.farming_mode,
    
    // Soil data with defaults
    soilN: land.soil_data?.n ?? 80,
    soilP: land.soil_data?.p ?? 40,
    soilK: land.soil_data?.k ?? 40,
    soilPH: land.soil_data?.ph ?? 7.0,
    soilMoisture: land.soil_data?.moisture ?? 50,
    soilOrganicCarbon: land.soil_data?.organic_carbon,
    
    // NDVI data (may be inferred from vision analysis)
    ndviValue: inferredNdvi,
    ndviTrend: land.ndvi_data?.trend ?? 0,
    
    // Weather data with defaults
    temperature: land.weather_data?.temperature ?? 28,
    humidity: land.weather_data?.humidity ?? 60,
    rainExpected: land.weather_data?.rain_expected ?? false,
    windSpeed: land.weather_data?.wind_speed ?? 10,
    
    // Regional info
    stateCode: land.location?.state,
    districtCode: land.location?.district,
    
    // Irrigation
    irrigationMethod: land.irrigation_type,
    
    // ✅ 2030-READY: Previous crop for rotation-aware recommendations
    previousCrop: land.previous_crop ? normalizeCropName(land.previous_crop) : undefined,
    
    // ✅ Vision-detected issues (will be used for pest/disease rules)
    detectedDiseases: land.vision_context?.detected_diseases || [],
    detectedPests: land.vision_context?.detected_pests || [],
    
    // ✅ FIX: Data age for accurate confidence calculation
    soilTestDays,
    ndviDataHours,
    weatherForecastHours
  };
  
  console.log(`📊 [Decision Brain] Raw farm data:`, {
    cropCode: rawFarmData.cropCode,
    previousCrop: rawFarmData.previousCrop,
    sowingDate: rawFarmData.sowingDate,
    soilN: rawFarmData.soilN,
    soilP: rawFarmData.soilP,
    soilK: rawFarmData.soilK,
    ndviValue: rawFarmData.ndviValue,
    temperature: rawFarmData.temperature,
    hasVisionContext: !!(land.vision_context?.detected_diseases?.length || land.vision_context?.detected_pests?.length)
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
// ADVISORY TO CHAT RESPONSE FORMATTER - NEW STRUCTURED FORMAT
// ═══════════════════════════════════════════════════════════════════════════

import type { 
  LandContextDisplay, 
  ActionItem, 
  BlockedAction, 
  ConfidenceInfo,
  DecisionBrainResponse 
} from '@/components/chat/DecisionBrainCards';

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
  // ✅ NEW: Structured Decision Brain response
  decisionBrainResponse?: DecisionBrainResponse;
  // ✅ NEW: Crop selection result for "which crop" queries
  cropSelectionResult?: CropSelectionResult;
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
      [Cause.HARVEST_READY]: "Crop ready for harvest",
      // Sugarcane borer causes
      [Cause.SHOOT_BORER_RISK]: "Early Shoot Borer (Chilo infuscatellus) - dead heart in young cane",
      [Cause.STEM_BORER_RISK]: "Top Borer (Scirpophaga excerptalis) - dead heart and bunchy top"
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
      [Cause.HARVEST_READY]: "कटाई के लिए तैयार",
      // Sugarcane borer causes
      [Cause.SHOOT_BORER_RISK]: "अगेती छेदक (शूट बोरर) - गभा सूखना",
      [Cause.STEM_BORER_RISK]: "शीर्ष छेदक (टॉप बोरर) - गभा सूखना और झाड़ीदार शीर्ष"
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
      [Cause.HARVEST_READY]: "कापणीसाठी तयार",
      // Sugarcane borer causes
      [Cause.SHOOT_BORER_RISK]: "खोड पोखरणारी अळी (Early Shoot Borer) - मधली सुरळी वाळते",
      [Cause.STEM_BORER_RISK]: "शेंडा पोखरणारी अळी (Top Borer) - गाभा वाळतो आणि झुडूपासारखा शेंडा"
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
 * Format UnifiedAdvisory to NEW structured chat response
 * ✅ Includes: Land context, primary/secondary actions, blocked actions, confidence
 */
export function formatAdvisoryForChat(
  advisory: UnifiedAdvisory,
  language: string = 'en',
  landContext?: LandContext
): ChatResponse {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD LAND CONTEXT DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════
  let landContextDisplay: LandContextDisplay | undefined;
  
  if (landContext) {
    // ✅ FIX: Convert area to Gunta (1 acre = 40 guntas)
    const areaAcres = landContext.area_acres || (landContext.area_hectares ? landContext.area_hectares * 2.47105 : undefined);
    const areaGuntas = areaAcres ? Math.round(areaAcres * 40) : undefined;
    
    // ✅ FIX: Properly detect soil status from actual data
    const soilStatus = landContext.soil_data ? {
      nitrogen: landContext.soil_data.n !== undefined 
        ? (landContext.soil_data.n < 50 ? 'LOW' : landContext.soil_data.n > 100 ? 'HIGH' : 'ADEQUATE')
        : 'UNKNOWN',
      phosphorus: landContext.soil_data.p !== undefined 
        ? (landContext.soil_data.p < 25 ? 'LOW' : landContext.soil_data.p > 50 ? 'HIGH' : 'ADEQUATE')
        : 'UNKNOWN',
      potassium: landContext.soil_data.k !== undefined 
        ? (landContext.soil_data.k < 30 ? 'LOW' : landContext.soil_data.k > 60 ? 'HIGH' : 'ADEQUATE')
        : 'UNKNOWN',
      ph: landContext.soil_data.ph !== undefined 
        ? (landContext.soil_data.ph < 6.0 ? 'ACIDIC' : landContext.soil_data.ph > 7.5 ? 'ALKALINE' : 'NEUTRAL')
        : undefined,
      moisture: landContext.soil_data.moisture !== undefined 
        ? (landContext.soil_data.moisture < 30 ? 'DRY' : landContext.soil_data.moisture > 70 ? 'WET' : 'MOIST')
        : undefined
    } : undefined;
    
    // ✅ FIX: Properly detect NDVI state from actual data
    const ndviValue = landContext.ndvi_data?.value;
    const ndviState = ndviValue !== undefined
      ? (ndviValue > 0.6 ? 'HEALTHY' : ndviValue > 0.4 ? 'MODERATE_STRESS' : ndviValue > 0.2 ? 'SEVERE_STRESS' : 'CRITICAL')
      : (advisory.causes.includes(Cause.OPTIMAL_GROWTH) ? 'HEALTHY' 
        : advisory.causes.some(c => c.toString().includes('STRESS')) ? 'MODERATE_STRESS' 
        : undefined);
    
    landContextDisplay = {
      cropName: landContext.crop_name || landContext.current_crop || 'Unknown',
      cropGroup: landContext.crop_group || getCropGroup(landContext.crop_code || '') || 'Unknown',
      growthStage: advisory.rules_applied.find(r => r.includes('STAGE'))?.replace(/.*_STAGE_/, '') || 'Growing',
      landArea: areaGuntas ? `${areaGuntas} गुंठा` : areaAcres ? `${areaAcres.toFixed(2)} एकर` : undefined,
      landAreaGunta: areaGuntas,
      landAreaAcre: areaAcres,
      soilStatus,
      ndviState,
      ndviValue,
      ndviTrend: landContext.ndvi_data?.trend !== undefined 
        ? (landContext.ndvi_data.trend < -0.05 ? 'DECLINING' : landContext.ndvi_data.trend > 0.05 ? 'IMPROVING' : 'STABLE')
        : undefined,
      weather: landContext.weather_data ? {
        temperature: landContext.weather_data.temperature || 28,
        humidity: landContext.weather_data.humidity || 60,
        rainExpected: landContext.weather_data.rain_expected || false
      } : undefined,
      farmingMode: landContext.farming_mode || 'INTEGRATED',
      daysAfterSowing: landContext.sowing_date 
        ? Math.floor((Date.now() - new Date(landContext.sowing_date).getTime()) / (1000 * 60 * 60 * 24))
        : undefined
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIZE ACTIONS INTO PRIMARY/SECONDARY
  // ═══════════════════════════════════════════════════════════════════════════
  const primaryActions: ActionItem[] = [];
  const secondaryActions: ActionItem[] = [];
  
  for (const action of advisory.actions) {
    const actionItem: ActionItem = {
      action: formatAction(action.action, language),
      reason: getActionReason(action.action, advisory.causes, language),
      timing: formatUrgency(action.urgency, language),
      ruleSources: [action.scientific_source || 'ICAR'],
      priority: action.priority
    };
    
    // Priority 1-3 = Primary (do NOW), 4+ = Secondary (do NEXT)
    if (action.priority <= 3) {
      primaryActions.push(actionItem);
    } else {
      secondaryActions.push(actionItem);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINE BLOCKED ACTIONS (What NOT to do)
  // ═══════════════════════════════════════════════════════════════════════════
  const blockedActions: BlockedAction[] = [];
  
  // Check for weather-based blocks
  if (landContext?.weather_data?.rain_expected) {
    blockedActions.push({
      action: formatAction(Action.APPLY_INSECTICIDE, language),
      whyNot: language === 'hi' ? 'बारिश की संभावना - स्प्रे धुल जाएगा' 
        : language === 'mr' ? 'पावसाची शक्यता - फवारणी वाहून जाईल'
        : 'Rain expected - spray will wash off',
      blockedByRules: ['CONF_WEATHER_001']
    });
  }
  
  // Check for stage-based blocks (e.g., no spray during flowering)
  if (advisory.causes.some(c => c.toString().includes('FLOWERING') || c.toString().includes('MATURITY'))) {
    blockedActions.push({
      action: language === 'hi' ? 'रासायनिक स्प्रे' : language === 'mr' ? 'रासायनिक फवारणी' : 'Chemical spray',
      whyNot: language === 'hi' ? 'फूल/पकने की अवस्था में नुकसान हो सकता है'
        : language === 'mr' ? 'फुलोरा/पिकण्याच्या अवस्थेत नुकसान होऊ शकते'
        : 'Can damage crop during flowering/maturity stage',
      blockedByRules: ['CONF_STAGE_002']
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD CONFIDENCE INFO
  // ═══════════════════════════════════════════════════════════════════════════
  const confidenceExplanations: string[] = [];
  
  if (landContext?.ndvi_data?.value) confidenceExplanations.push(language === 'hi' ? 'हाल का NDVI डेटा उपलब्ध' : language === 'mr' ? 'अलीकडील NDVI डेटा उपलब्ध' : 'Recent NDVI data available');
  if (landContext?.weather_data) confidenceExplanations.push(language === 'hi' ? 'मौसम पूर्वानुमान विश्वसनीय' : language === 'mr' ? 'हवामान अंदाज विश्वसनीय' : 'Weather forecast reliable');
  if (landContext?.soil_data) confidenceExplanations.push(language === 'hi' ? 'मिट्टी परीक्षण उपलब्ध' : language === 'mr' ? 'माती चाचणी उपलब्ध' : 'Soil test available');
  if (confidenceExplanations.length === 0) {
    confidenceExplanations.push(language === 'hi' ? 'सामान्य दिशानिर्देशों पर आधारित' : language === 'mr' ? 'सामान्य मार्गदर्शक तत्त्वांवर आधारित' : 'Based on general guidelines');
  }
  
  // ✅ FIX: Ensure confidence is displayed as percentage (0-100) with minimum 40%
  // advisory.confidence comes as 0-1 from the engine, convert to percentage
  const rawConfidence = typeof advisory.confidence === 'number' ? advisory.confidence : 0;
  // If confidence is already 0-100 (>1), use as-is; otherwise convert from 0-1
  const confidenceAsPercent = rawConfidence > 1 ? rawConfidence : rawConfidence * 100;
  // Ensure minimum 40% when we have crop + stage data
  const finalConfidence = Math.max(40, Math.round(confidenceAsPercent));
  
  const confidenceInfo: ConfidenceInfo = {
    riskLevel: advisory.risk_level as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    confidence: finalConfidence, // ✅ Now always 0-100 with minimum 40%
    explanations: confidenceExplanations,
    rulesApplied: advisory.rules_applied.length
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD FARMER-FRIENDLY MESSAGE: FACTS → WHY → WHAT TO DO
  // ═══════════════════════════════════════════════════════════════════════════
  const cropName = landContextDisplay?.cropName || 'your crop';
  const area = landContextDisplay?.landArea || '';
  
  // Build FACTS section (Land, Soil, NDVI, Weather data)
  let factsSection = '';
  let whySection = '';
  let whatSection = '';
  
  if (language === 'hi') {
    // 📊 FACTS (तथ्य) - No markdown ** for plain text display
    factsSection = `📊 तथ्य (आपकी जमीन का डेटा):\n`;
    factsSection += `🌾 फसल: ${cropName}${area ? ` | क्षेत्र: ${area}` : ''}\n`;
    if (landContextDisplay?.growthStage) factsSection += `📅 अवस्था: ${landContextDisplay.growthStage}${landContextDisplay.daysAfterSowing ? ` (${landContextDisplay.daysAfterSowing} दिन)` : ''}\n`;
    if (landContextDisplay?.soilStatus) {
      factsSection += `🌍 मिट्टी: N=${landContextDisplay.soilStatus.nitrogen}, P=${landContextDisplay.soilStatus.phosphorus}, K=${landContextDisplay.soilStatus.potassium}`;
      if (landContextDisplay.soilStatus.ph) factsSection += `, pH=${landContextDisplay.soilStatus.ph}`;
      factsSection += '\n';
    }
    if (landContextDisplay?.ndviValue !== undefined) {
      factsSection += `🛰️ NDVI: ${(landContextDisplay.ndviValue * 100).toFixed(0)}% (${landContextDisplay.ndviState || 'जाँच करें'})`;
      if (landContextDisplay.ndviTrend) factsSection += ` ${landContextDisplay.ndviTrend === 'IMPROVING' ? '📈' : landContextDisplay.ndviTrend === 'DECLINING' ? '📉' : '➡️'}`;
      factsSection += '\n';
    }
    if (landContextDisplay?.weather) {
      factsSection += `🌤️ मौसम: ${landContextDisplay.weather.temperature}°C, नमी ${landContextDisplay.weather.humidity}%`;
      if (landContextDisplay.weather.rainExpected) factsSection += ' 🌧️ बारिश संभव';
      factsSection += '\n';
    }
    
    // 🔍 WHY (क्यों)
    if (advisory.causes.length > 0) {
      whySection = `\n🔍 क्यों (समस्याएं पाई गईं):\n`;
      whySection += advisory.causes.slice(0, 3).map(c => `⚠️ ${formatCause(c, language)}`).join('\n') + '\n';
    }
    
    // ✅ WHAT TO DO (क्या करें)
    whatSection = `\n✅ क्या करें:\n`;
    if (primaryActions.length > 0) {
      whatSection += primaryActions.map(a => `• ${a.action}${a.timing ? ` (${a.timing})` : ''}`).join('\n');
    } else {
      whatSection += t.noActionNeeded;
    }
    whatSection += `\n\n📊 विश्वसनीयता: ${finalConfidence}% | 📚 ICAR + FAO`;
    
  } else if (language === 'mr') {
    // 📊 FACTS (तथ्ये) - No markdown ** for plain text display
    factsSection = `📊 तथ्ये (तुमच्या जमिनीचा डेटा):\n`;
    factsSection += `🌾 पीक: ${cropName}${area ? ` | क्षेत्र: ${area}` : ''}\n`;
    if (landContextDisplay?.growthStage) factsSection += `📅 अवस्था: ${landContextDisplay.growthStage}${landContextDisplay.daysAfterSowing ? ` (${landContextDisplay.daysAfterSowing} दिवस)` : ''}\n`;
    if (landContextDisplay?.soilStatus) {
      factsSection += `🌍 माती: N=${landContextDisplay.soilStatus.nitrogen}, P=${landContextDisplay.soilStatus.phosphorus}, K=${landContextDisplay.soilStatus.potassium}`;
      if (landContextDisplay.soilStatus.ph) factsSection += `, pH=${landContextDisplay.soilStatus.ph}`;
      factsSection += '\n';
    }
    if (landContextDisplay?.ndviValue !== undefined) {
      factsSection += `🛰️ NDVI: ${(landContextDisplay.ndviValue * 100).toFixed(0)}% (${landContextDisplay.ndviState || 'तपासा'})`;
      if (landContextDisplay.ndviTrend) factsSection += ` ${landContextDisplay.ndviTrend === 'IMPROVING' ? '📈' : landContextDisplay.ndviTrend === 'DECLINING' ? '📉' : '➡️'}`;
      factsSection += '\n';
    }
    if (landContextDisplay?.weather) {
      factsSection += `🌤️ हवामान: ${landContextDisplay.weather.temperature}°C, आर्द्रता ${landContextDisplay.weather.humidity}%`;
      if (landContextDisplay.weather.rainExpected) factsSection += ' 🌧️ पाऊस शक्य';
      factsSection += '\n';
    }
    
    // 🔍 WHY (का)
    if (advisory.causes.length > 0) {
      whySection = `\n🔍 का (समस्या आढळल्या):\n`;
      whySection += advisory.causes.slice(0, 3).map(c => `⚠️ ${formatCause(c, language)}`).join('\n') + '\n';
    }
    
    // ✅ WHAT TO DO (काय करावे)
    whatSection = `\n✅ काय करावे:\n`;
    if (primaryActions.length > 0) {
      whatSection += primaryActions.map(a => `• ${a.action}${a.timing ? ` (${a.timing})` : ''}`).join('\n');
    } else {
      whatSection += t.noActionNeeded;
    }
    whatSection += `\n\n📊 विश्वासार्हता: ${finalConfidence}% | 📚 ICAR + FAO`;
    
  } else {
    // 📊 FACTS - No markdown ** for plain text display
    factsSection = `📊 FACTS (Your Land Data):\n`;
    factsSection += `🌾 Crop: ${cropName}${area ? ` | Area: ${area}` : ''}\n`;
    if (landContextDisplay?.growthStage) factsSection += `📅 Stage: ${landContextDisplay.growthStage}${landContextDisplay.daysAfterSowing ? ` (Day ${landContextDisplay.daysAfterSowing})` : ''}\n`;
    if (landContextDisplay?.soilStatus) {
      factsSection += `🌍 Soil: N=${landContextDisplay.soilStatus.nitrogen}, P=${landContextDisplay.soilStatus.phosphorus}, K=${landContextDisplay.soilStatus.potassium}`;
      if (landContextDisplay.soilStatus.ph) factsSection += `, pH=${landContextDisplay.soilStatus.ph}`;
      factsSection += '\n';
    }
    if (landContextDisplay?.ndviValue !== undefined) {
      factsSection += `🛰️ NDVI: ${(landContextDisplay.ndviValue * 100).toFixed(0)}% (${landContextDisplay.ndviState || 'Check'})`;
      if (landContextDisplay.ndviTrend) factsSection += ` ${landContextDisplay.ndviTrend === 'IMPROVING' ? '📈' : landContextDisplay.ndviTrend === 'DECLINING' ? '📉' : '➡️'}`;
      factsSection += '\n';
    }
    if (landContextDisplay?.weather) {
      factsSection += `🌤️ Weather: ${landContextDisplay.weather.temperature}°C, Humidity ${landContextDisplay.weather.humidity}%`;
      if (landContextDisplay.weather.rainExpected) factsSection += ' 🌧️ Rain expected';
      factsSection += '\n';
    }
    
    // 🔍 WHY
    if (advisory.causes.length > 0) {
      whySection = `\n🔍 WHY (Issues Detected):\n`;
      whySection += advisory.causes.slice(0, 3).map(c => `⚠️ ${formatCause(c, language)}`).join('\n') + '\n';
    }
    
    // ✅ WHAT TO DO
    whatSection = `\n✅ WHAT TO DO:\n`;
    if (primaryActions.length > 0) {
      whatSection += primaryActions.map(a => `• ${a.action}${a.timing ? ` (${a.timing})` : ''}`).join('\n');
    } else {
      whatSection += t.noActionNeeded;
    }
    whatSection += `\n\n📊 Confidence: ${finalConfidence}% | 📚 ICAR + FAO`;
  }
  
  const farmerMessage = factsSection + whySection + whatSection + `\n\n---\n🧠 *${t.source}*`;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD DECISION BRAIN RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════
  const decisionBrainResponse: DecisionBrainResponse = {
    landContext: landContextDisplay,
    primaryActions,
    secondaryActions,
    blockedActions,
    confidence: confidenceInfo,
    farmerMessage,
    language
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ALSO BUILD LEGACY CARDS FOR BACKWARDS COMPATIBILITY
  // ═══════════════════════════════════════════════════════════════════════════
  const cards: ChatResponse['structuredResponse']['cards'] = [];
  
  for (let i = 0; i < Math.min(advisory.actions.length, 5); i++) {
    const action = advisory.actions[i];
    const actionText = formatAction(action.action, language);
    const urgencyText = action.urgency.replace(/_/g, ' ');
    
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
  
  return {
    response: farmerMessage,
    structuredResponse: cards.length > 0 ? { cards, language } : undefined,
    decisionBrainResponse,
    source: 'decision_brain',
    advisory,
    executionTimeMs: 0
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getActionReason(action: Action, causes: Cause[], language: string): string {
  // Map common causes to action reasons
  const causeReasons: Record<string, Record<string, string>> = {
    en: {
      WATER_STRESS: 'Low soil moisture detected',
      NITROGEN_DEFICIENCY: 'Low nitrogen levels in soil',
      PHOSPHORUS_DEFICIENCY: 'Phosphorus deficiency detected',
      POTASSIUM_DEFICIENCY: 'Low potassium levels',
      HEAT_STRESS: 'High temperature stress on crop',
      PEST_RISK: 'Pest activity risk detected',
      DISEASE_RISK: 'Disease conditions present',
      OPTIMAL_GROWTH: 'Crop is growing well'
    },
    hi: {
      WATER_STRESS: 'मिट्टी में नमी कम है',
      NITROGEN_DEFICIENCY: 'नाइट्रोजन की कमी पाई गई',
      PHOSPHORUS_DEFICIENCY: 'फॉस्फोरस की कमी है',
      POTASSIUM_DEFICIENCY: 'पोटाश कम है',
      HEAT_STRESS: 'गर्मी का तनाव',
      PEST_RISK: 'कीट का खतरा',
      DISEASE_RISK: 'रोग की संभावना',
      OPTIMAL_GROWTH: 'फसल अच्छी है'
    },
    mr: {
      WATER_STRESS: 'मातीत ओलावा कमी आहे',
      NITROGEN_DEFICIENCY: 'नायट्रोजनची कमतरता आढळली',
      PHOSPHORUS_DEFICIENCY: 'स्फुरदाची कमतरता',
      POTASSIUM_DEFICIENCY: 'पालाश कमी आहे',
      HEAT_STRESS: 'उष्णतेचा ताण',
      PEST_RISK: 'किडीचा धोका',
      DISEASE_RISK: 'रोगाची शक्यता',
      OPTIMAL_GROWTH: 'पीक चांगले आहे'
    }
  };
  
  const reasons = causeReasons[language] || causeReasons.en;
  
  for (const cause of causes) {
    const causeStr = cause.toString();
    for (const [key, reason] of Object.entries(reasons)) {
      if (causeStr.includes(key)) return reason;
    }
  }
  
  return reasons.OPTIMAL_GROWTH;
}

function formatUrgency(urgency: string, language: string): string {
  const urgencyMap: Record<string, Record<string, string>> = {
    en: {
      WITHIN_24_HOURS: 'Within 24 hours',
      WITHIN_3_DAYS: 'Within 3 days',
      WITHIN_1_WEEK: 'Within 1 week',
      FLEXIBLE: 'Flexible timing',
      IMMEDIATE: 'Immediately'
    },
    hi: {
      WITHIN_24_HOURS: '24 घंटे के भीतर',
      WITHIN_3_DAYS: '3 दिन के भीतर',
      WITHIN_1_WEEK: '1 सप्ताह में',
      FLEXIBLE: 'लचीला समय',
      IMMEDIATE: 'तुरंत'
    },
    mr: {
      WITHIN_24_HOURS: '24 तासांत',
      WITHIN_3_DAYS: '3 दिवसांत',
      WITHIN_1_WEEK: '1 आठवड्यात',
      FLEXIBLE: 'लवचिक वेळ',
      IMMEDIATE: 'ताबडतोब'
    }
  };
  
  const map = urgencyMap[language] || urgencyMap.en;
  return map[urgency] || urgency.replace(/_/g, ' ').toLowerCase();
}

/**
 * ✅ FIX: Filter advisory actions based on query type
 * This ensures different questions get different, relevant answers
 */
function filterAdvisoryByQueryType(
  advisory: UnifiedAdvisory, 
  queryType: string
): UnifiedAdvisory {
  const irrigationActions = [
    Action.IRRIGATE_IMMEDIATELY, Action.IRRIGATE_LIGHT, Action.IRRIGATE_HEAVY, 
    Action.EMERGENCY_IRRIGATION, Action.DRAIN_FIELD
  ];
  const nutrientActions = [
    Action.APPLY_NITROGEN, Action.APPLY_PHOSPHORUS, Action.APPLY_POTASSIUM, 
    Action.APPLY_ZINC, Action.APPLY_ORGANIC_MANURE, Action.APPLY_MICRONUTRIENTS
  ];
  const pestActions = [
    Action.APPLY_INSECTICIDE, Action.APPLY_NEEM_OIL, Action.APPLY_BIO_CONTROL, 
    Action.INSTALL_PHEROMONE_TRAPS, Action.INSTALL_TRAPS
  ];
  const diseaseActions = [
    Action.APPLY_FUNGICIDE, Action.APPLY_TRICHODERMA
  ];
  const harvestActions = [
    Action.EARLY_HARVEST, Action.SALVAGE_HARVEST
  ];
  
  let relevantActions: Action[] = [];
  let relevantCauses: Cause[] = [];
  
  switch (queryType) {
    case 'watering':
      relevantActions = irrigationActions;
      relevantCauses = advisory.causes.filter(c => 
        c.toString().includes('WATER') || c.toString().includes('MOISTURE') || c.toString().includes('IRRIGATION')
      );
      break;
    case 'fertilizer':
      relevantActions = nutrientActions;
      relevantCauses = advisory.causes.filter(c => 
        c.toString().includes('NITROGEN') || c.toString().includes('PHOSPHORUS') || 
        c.toString().includes('POTASSIUM') || c.toString().includes('NUTRIENT') ||
        c.toString().includes('DEFICIENCY')
      );
      break;
    case 'pest':
      relevantActions = pestActions;
      relevantCauses = advisory.causes.filter(c => 
        c.toString().includes('PEST') || c.toString().includes('INSECT') || 
        c.toString().includes('WORM') || c.toString().includes('APHID') ||
        c.toString().includes('BOLLWORM')
      );
      break;
    case 'disease':
      relevantActions = diseaseActions;
      relevantCauses = advisory.causes.filter(c => 
        c.toString().includes('DISEASE') || c.toString().includes('FUNGUS') || 
        c.toString().includes('BLAST') || c.toString().includes('RUST') ||
        c.toString().includes('BLIGHT')
      );
      break;
    case 'harvest':
      relevantActions = harvestActions;
      relevantCauses = advisory.causes.filter(c => 
        c.toString().includes('HARVEST') || c.toString().includes('MATURE') || c.toString().includes('READY')
      );
      break;
    default:
      // For 'general' queries, return all actions
      return advisory;
  }
  
  // Filter actions to only include relevant ones
  const filteredActions = advisory.actions.filter(a => relevantActions.includes(a.action));
  
  // If no specific actions found, include monitoring actions as fallback
  if (filteredActions.length === 0) {
    const monitoringActions = advisory.actions.filter(a => 
      a.action === Action.MONITOR_CLOSELY || a.action === Action.WAIT_AND_WATCH || a.action === Action.CONTINUE_CURRENT
    );
    return {
      ...advisory,
      actions: monitoringActions.length > 0 ? monitoringActions : advisory.actions.slice(0, 2),
      causes: relevantCauses.length > 0 ? relevantCauses : advisory.causes
    };
  }
  
  return {
    ...advisory,
    actions: filteredActions,
    causes: relevantCauses.length > 0 ? relevantCauses : advisory.causes
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SERVICE FUNCTION - Intent-Aware Pipeline
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionBrainResult {
  handled: boolean;
  response?: ChatResponse;
  fallbackToAI: boolean;
  reason?: string;
  // ✅ NEW: Intent tracking for debugging and training
  inferredIntent?: FarmerIntent;
  intentConfidence?: number;
  // ✅ NEW: Crop selection result for "which crop" queries
  cropSelectionResult?: CropSelectionResult;
}

/**
 * Try to answer using Decision Brain with Intent-Aware Filtering
 * 
 * THE 4-STAGE PIPELINE:
 * 1. Land-Scoped Context (MANDATORY)
 * 2. Intent Inference (Symbolic + Tolerant)
 * 3. Full Decision Graph (UNCHANGED)
 * 4. Intent-Based Action Filtering (CRITICAL FIX)
 * 
 * Returns handled=true if answered, fallbackToAI=true if AI needed
 */
export function tryDecisionBrain(
  query: string,
  landContext: LandContext | null,
  language: string = 'en',
  farmerId: string = 'anonymous',
  tenantId: string = 'default',
  supabaseClient?: any // For logging
): DecisionBrainResult {
  const startTime = Date.now();
  
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`🧠 [DECISION BRAIN] Starting Intent-Aware Analysis...`);
  console.log(`Query: "${query.substring(0, 100)}..."`);
  console.log(`Language: ${language}`);
  console.log(`Land: ${landContext?.name || 'No land context'}`);
  console.log(`Crop: ${landContext?.crop_name || landContext?.crop_code || 'Unknown'}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 1: LAND-SCOPED CONTEXT CHECK (MANDATORY)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (!landContext) {
    console.log(`❌ [Decision Brain] No land context → AI Fallback`);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'no_land_context'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 1.3: FARMER MESSAGE CLASSIFICATION (NEW - 6-Category Intent)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const messageClassification = classifyFarmerMessage(query);
  
  console.log(`📝 [Decision Brain] Message Classification:`, {
    intent: messageClassification.intent,
    language: messageClassification.language,
    confidence: Math.round(messageClassification.confidence * 100) + '%',
    subIntent: messageClassification.subIntent,
    responseStyle: messageClassification.responseStyle
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 1.5: SYMPTOM PATTERN RECOGNITION (Multi-Cause Analysis)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get crop code for symptom analysis context
  const cropCode = landContext.crop_code || landContext.current_crop || landContext.crop_name;
  
  // Calculate days after sowing for symptom context
  let daysAfterSowing = 60; // Default
  if (landContext.sowing_date || landContext.cultivation_date) {
    const sowingDate = new Date(landContext.sowing_date || landContext.cultivation_date!);
    daysAfterSowing = Math.floor((Date.now() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  // Analyze symptoms in the farmer's query
  const symptomAnalysis = analyzeSymptoms(query, {
    cropCode: cropCode || undefined,
    daysAfterSowing,
    soilMoisture: landContext.soil_data?.moisture,
    hasVisualConfirmation: !!landContext.vision_context
  });
  
  if (symptomAnalysis.detected_symptoms.length > 0) {
    console.log(`🔬 [Decision Brain] Symptom Analysis:`, {
      detected: symptomAnalysis.detected_symptoms.map(s => s.symptom_name),
      possible_causes: symptomAnalysis.possible_causes.map(c => ({
        cause: c.cause_name,
        probability: Math.round(c.probability * 100) + '%'
      })),
      primary_cause: symptomAnalysis.primary_cause?.cause_name,
      needs_disambiguation: symptomAnalysis.needs_disambiguation,
      confidence: Math.round(symptomAnalysis.confidence * 100) + '%'
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 2: INTENT INFERENCE (Symbolic + Tolerant, Offline-capable)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const intentResult = inferFarmerIntent(query, language);
  
  // Boost intent confidence if symptom matches
  if (symptomAnalysis.detected_symptoms.length > 0) {
    // Map symptom primary cause to intent
    const primaryCause = symptomAnalysis.primary_cause?.cause;
    if (primaryCause) {
      // Water stress symptoms → boost WATER intent
      if (primaryCause.toString().includes('WATER_STRESS')) {
        if (intentResult.intent !== 'WATER') {
          intentResult.secondaryIntent = intentResult.intent;
          intentResult.intent = 'WATER';
        }
        intentResult.confidence = Math.min(1, intentResult.confidence + 0.2);
      }
      // Pest symptoms → boost PEST intent
      if (primaryCause.toString().includes('BORER') || 
          primaryCause.toString().includes('PEST') ||
          primaryCause.toString().includes('RISK')) {
        if (intentResult.intent !== 'PEST') {
          intentResult.secondaryIntent = intentResult.intent;
          intentResult.intent = 'PEST';
        }
        intentResult.confidence = Math.min(1, intentResult.confidence + 0.2);
      }
      // Disease symptoms → boost DISEASE intent
      if (primaryCause.toString().includes('DISEASE') || 
          primaryCause.toString().includes('DEFICIENCY')) {
        if (intentResult.intent !== 'DISEASE' && intentResult.intent !== 'NUTRIENT') {
          intentResult.secondaryIntent = intentResult.intent;
          // Deficiency is nutrient, disease is disease
          intentResult.intent = primaryCause.toString().includes('DEFICIENCY') ? 'NUTRIENT' : 'DISEASE';
        }
        intentResult.confidence = Math.min(1, intentResult.confidence + 0.2);
      }
    }
  }
  
  console.log(`🎯 [Decision Brain] Intent Inference:`, {
    intent: intentResult.intent,
    confidence: Math.round(intentResult.confidence * 100) + '%',
    keywords: intentResult.matchedKeywords,
    secondaryIntent: intentResult.secondaryIntent,
    isAmbiguous: intentResult.isAmbiguous,
    symptomBoosted: symptomAnalysis.detected_symptoms.length > 0
  });
  
  // Check basic agricultural classification (still needed for non-agri queries)
  const classification = classifyQueryForDecisionBrain(query);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ STAGE 2.4: CROP SELECTION QUERY HANDLER (NEW)
  // ═══════════════════════════════════════════════════════════════════════════
  // Handle "which crop to plant" queries separately using crop selection engine
  
  if (classification.queryType === 'crop_selection') {
    console.log(`🌱 [Decision Brain] Crop Selection Query Detected → Using Crop Selection Engine`);
    
    try {
      // Build crop selection input from land context
      const cropSelectionInput: CropSelectionInput = {
        previous_crop: landContext.previous_crop || landContext.crop_name || landContext.current_crop,
        soil_n: landContext.soil_data?.n !== undefined 
          ? (landContext.soil_data.n < 50 ? SoilNState.LOW_N : landContext.soil_data.n > 100 ? SoilNState.HIGH_N : SoilNState.ADEQUATE_N)
          : undefined,
        soil_ph: landContext.soil_data?.ph !== undefined
          ? (landContext.soil_data.ph < 6.0 ? SoilPHState.ACIDIC : landContext.soil_data.ph > 7.5 ? SoilPHState.ALKALINE : SoilPHState.NEUTRAL)
          : undefined,
        soil_moisture: landContext.soil_data?.moisture !== undefined
          ? (landContext.soil_data.moisture < 30 ? SoilMoistureState.DRY : landContext.soil_data.moisture > 70 ? SoilMoistureState.WATERLOGGED : SoilMoistureState.OPTIMAL)
          : undefined,
        irrigation_source: landContext.irrigation_type as any,
        land_area_acres: landContext.area_acres || (landContext.area_hectares ? landContext.area_hectares * 2.47105 : undefined),
        current_month: new Date().getMonth() + 1,
        state: landContext.location?.state,
        district: landContext.location?.district,
        language
      };
      
      console.log(`📊 [Crop Selection] Input:`, {
        previous_crop: cropSelectionInput.previous_crop,
        soil_n: cropSelectionInput.soil_n,
        soil_ph: cropSelectionInput.soil_ph,
        irrigation: cropSelectionInput.irrigation_source,
        area_acres: cropSelectionInput.land_area_acres,
        month: cropSelectionInput.current_month
      });
      
      // Get crop recommendations
      const cropResult = getCropRecommendations(cropSelectionInput);
      
      console.log(`✅ [Crop Selection] Result:`, {
        recommendations: cropResult.recommendations.length,
        top_crop: cropResult.recommendations[0]?.crop_name,
        confidence: cropResult.confidence,
        rules_applied: cropResult.rules_applied.length
      });
      
      // Format message for farmer
      const farmerMessage = formatCropRecommendationsForFarmer(cropResult, language);
      
      // Build chat response with crop selection result
      const chatResponse: ChatResponse = {
        response: farmerMessage,
        executionTimeMs: Date.now() - startTime,
        source: 'decision_brain',
        cropSelectionResult: cropResult, // ✅ NEW: Include crop selection result
        decisionBrainResponse: {
          language,
          landContext: {
            cropName: landContext.previous_crop || landContext.current_crop || 'N/A',
            cropGroup: 'SELECTION',
            growthStage: language === 'mr' ? 'पीक निवड' : language === 'hi' ? 'फसल चुनाव' : 'Crop Selection',
            landArea: landContext.area_acres 
              ? `${Math.round(landContext.area_acres * 40)} गुंठा` 
              : undefined,
            farmingMode: landContext.farming_mode || 'INTEGRATED'
          },
          farmerMessage,
          primaryActions: [],
          secondaryActions: [],
          blockedActions: [],
          confidence: {
            riskLevel: 'LOW',
            confidence: cropResult.confidence,
            explanations: cropResult.rules_applied,
            rulesApplied: cropResult.rules_applied.length
          }
        }
      };
      
      console.log(`\n════════════════════════════════════════════════════════════════`);
      console.log(`🌱 [DECISION BRAIN] CROP SELECTION COMPLETE`);
      console.log(`⏱️ Execution time: ${chatResponse.executionTimeMs}ms`);
      console.log(`📊 Recommendations: ${cropResult.recommendations.length}`);
      console.log(`🌾 Top crop: ${cropResult.recommendations[0]?.crop_name || 'None'}`);
      console.log(`════════════════════════════════════════════════════════════════\n`);
      
      return {
        handled: true,
        response: chatResponse,
        fallbackToAI: false,
        inferredIntent: intentResult.intent,
        intentConfidence: intentResult.confidence,
        cropSelectionResult: cropResult // ✅ NEW: Return crop selection result
      };
    } catch (cropSelectionError) {
      console.error(`❌ [Crop Selection] Error:`, cropSelectionError);
      // Fall through to normal processing
    }
  }
  
  // If not agricultural at all, fall back to AI
  if (!classification.isAgricultural && intentResult.intent === 'GENERAL' && intentResult.confidence < 0.2) {
    console.log(`❌ [Decision Brain] Query not agricultural → AI Fallback`);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'non_agricultural_query',
      inferredIntent: intentResult.intent,
      intentConfidence: intentResult.confidence
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 2.5: BUILD FIELD CONTEXT SNAPSHOT (Required for Diagnostic Mode)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ✅ Calculate crop stage BEFORE building snapshot (not hardcoded!)
  const calculatedCropStage = calculateCropStageFromDAS(daysAfterSowing, cropCode || undefined);
  
  console.log(`📊 [Decision Brain] Crop Stage Calculation:`, {
    cropCode: cropCode || 'unknown',
    daysAfterSowing,
    calculatedStage: calculatedCropStage,
    landId: landContext.id,
    landName: landContext.name
  });
  
  // ✅ Pass land identity to snapshot for multi-land isolation
  const fieldSnapshot = buildFieldContextSnapshot(
    landContext,
    calculatedCropStage,  // ✅ Calculated, not hardcoded!
    daysAfterSowing,
    landContext.id,       // ✅ Land ID for isolation
    landContext.name,     // ✅ Land name for display
    language              // ✅ Pass language for localized freshness descriptions
  );
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ STAGE 2.6: DIAGNOSTIC MODE DETERMINATION (NEW - CRITICAL!)
  // ═══════════════════════════════════════════════════════════════════════════
  // This is the core of the "Diagnosis-First" execution model.
  // Before running Decision Graph, we check if:
  // - Multiple causes remain → DIAGNOSTIC mode (ask questions)
  // - Confidence too low → PHOTO_REQUIRED mode (request photo)
  // - Single confirmed cause → ACTION mode (run Decision Graph)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const diagnosticDecision = determineDiagnosticMode(symptomAnalysis, fieldSnapshot);
  
  console.log(`🔬 [Decision Brain] Diagnostic Mode Determination:`, {
    mode: diagnosticDecision.mode,
    remainingCauses: diagnosticDecision.remainingCauses.length,
    eliminatedCauses: diagnosticDecision.eliminatedCauses.length,
    primaryCause: diagnosticDecision.primaryCause?.cause_name,
    canRecommendChemicals: diagnosticDecision.canRecommendChemicals,
    canRecommendFertilizers: diagnosticDecision.canRecommendFertilizers,
    confidence: Math.round(diagnosticDecision.confidence * 100) + '%'
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 2.7: HANDLE DIAGNOSTIC OR PHOTO_REQUIRED MODE
  // ═══════════════════════════════════════════════════════════════════════════
  // If we're in diagnostic mode, return early with diagnostic response.
  // Do NOT run Decision Graph or recommend chemicals in this mode!
  
  if (diagnosticDecision.mode === 'DIAGNOSTIC' || diagnosticDecision.mode === 'PHOTO_REQUIRED') {
    console.log(`📋 [Decision Brain] Entering ${diagnosticDecision.mode} mode - no chemicals/actions`);
    
    // Build diagnostic response using the new builder
    const diagnosticResponse = buildDiagnosticResponse(
      diagnosticDecision,
      symptomAnalysis,
      fieldSnapshot,
      language
    );
    
    // Create chat response for diagnostic mode
    const chatResponse: ChatResponse = {
      response: diagnosticResponse.message,
      executionTimeMs: Date.now() - startTime,
      source: 'decision_brain',
      decisionBrainResponse: {
        language,
        landContext: landContext ? {
          cropName: landContext.crop_name || landContext.current_crop || 'Unknown',
          cropGroup: landContext.crop_group || getCropGroup(landContext.crop_code || '') || 'Unknown',
          growthStage: fieldSnapshot.growthStage.toString(),
          landArea: landContext.area_acres ? `${Math.round(landContext.area_acres * 40)} गुंठा` : undefined,
          farmingMode: landContext.farming_mode || 'INTEGRATED'
        } : undefined,
        farmerMessage: diagnosticResponse.message,
        primaryActions: [],
        secondaryActions: [],
        blockedActions: [{
          action: language === 'mr' ? 'किटकनाशक/खत' : language === 'hi' ? 'कीटनाशक/खाद' : 'Pesticides/Fertilizers',
          whyNot: language === 'mr' ? 'निदान निश्चित होईपर्यंत थांबा' : language === 'hi' ? 'निदान की पुष्टि होने तक रुकें' : 'Wait until diagnosis is confirmed',
          blockedByRules: ['DIAGNOSTIC_MODE_NO_CHEMICALS']
        }],
        confidence: {
          riskLevel: diagnosticDecision.remainingCauses.length > 2 ? 'HIGH' : 'MEDIUM',
          confidence: diagnosticDecision.confidence,
          explanations: diagnosticDecision.reasoning,
          rulesApplied: 1
        }
      }
    };
    
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`📋 [DECISION BRAIN] DIAGNOSTIC MODE - No Action Given`);
    console.log(`⏱️ Execution time: ${chatResponse.executionTimeMs}ms`);
    console.log(`🔍 Mode: ${diagnosticDecision.mode}`);
    console.log(`📊 Remaining causes: ${diagnosticDecision.remainingCauses.length}`);
    console.log(`❓ Questions: ${diagnosticDecision.disambiguationQuestions.length}`);
    console.log(`📷 Photo requested: ${diagnosticDecision.photoRequest ? 'Yes' : 'No'}`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
    
    return {
      handled: true,
      response: chatResponse,
      fallbackToAI: false,
      inferredIntent: intentResult.intent,
      intentConfidence: intentResult.confidence
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STAGE 3: RUN FULL DECISION GRAPH (Only in ACTION mode!)
  // ═══════════════════════════════════════════════════════════════════════════
  // We only reach here if diagnosticDecision.mode === 'ACTION'
  // This means we have a single confirmed cause and can proceed.
  
  console.log(`✅ [Decision Brain] ACTION mode confirmed - proceeding to Decision Graph`);
  
  const decisionInput = landContextToDecisionInput(landContext, farmerId, tenantId);
  if (!decisionInput) {
    console.log(`❌ [Decision Brain] Invalid land data → AI Fallback`);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'invalid_land_data',
      inferredIntent: intentResult.intent,
      intentConfidence: intentResult.confidence
    };
  }
  
  // Inject symptom-inferred causes into decision input for better rule matching
  const symptomInferredCauses = extractCausesFromSymptoms(symptomAnalysis);
  if (symptomInferredCauses.length > 0) {
    console.log(`💉 [Decision Brain] Injecting symptom-inferred causes:`, symptomInferredCauses);
    // These will be added to the causes found by the decision graph
  }
  
  try {
    console.log(`🔄 [Decision Brain] Running Full Decision Graph...`);
    
    // Run the COMPLETE decision graph - no filtering at this stage
    const fullAdvisory = runDecisionGraphSync(decisionInput);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 3.5: MERGE SYMPTOM-INFERRED CAUSES (NEW)
    // ═══════════════════════════════════════════════════════════════════════════
    
    // Merge symptom-inferred causes with decision graph causes
    if (symptomInferredCauses.length > 0) {
      for (const cause of symptomInferredCauses) {
        if (!fullAdvisory.causes.includes(cause)) {
          fullAdvisory.causes.push(cause);
          fullAdvisory.reasoning_trace = [
            ...(fullAdvisory.reasoning_trace || []),
            `[Symptom Analysis] Inferred ${cause} from farmer's symptom description`
          ];
        }
      }
      
      // Add symptom analysis info to reasoning trace
      if (symptomAnalysis.primary_cause) {
        fullAdvisory.reasoning_trace = [
          ...(fullAdvisory.reasoning_trace || []),
          `[Symptom Analysis] Primary cause: ${symptomAnalysis.primary_cause.cause_name} (${Math.round(symptomAnalysis.primary_cause.probability * 100)}% probability)`,
          `[Symptom Analysis] Scientific basis: ${symptomAnalysis.primary_cause.scientific_basis}`
        ];
        
        // Add differentiating factors
        if (symptomAnalysis.possible_causes.length > 1) {
          fullAdvisory.reasoning_trace.push(
            `[Symptom Analysis] Alternative causes: ${symptomAnalysis.possible_causes.slice(1, 3).map(c => `${c.cause_name} (${Math.round(c.probability * 100)}%)`).join(', ')}`
          );
        }
      }
      
      // Boost confidence if symptom matches align with decision graph
      const symptomBoost = symptomAnalysis.confidence * 0.15; // Up to 15% boost
      fullAdvisory.confidence = Math.min(0.95, fullAdvisory.confidence + symptomBoost);
    }
    
    console.log(`📊 [Decision Brain] Full Advisory (after symptom merge):`, {
      risk_level: fullAdvisory.risk_level,
      causes_count: fullAdvisory.causes.length,
      actions_count: fullAdvisory.actions.length,
      rules_applied: fullAdvisory.rules_applied.length,
      symptom_causes_added: symptomInferredCauses.length
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 3.6: SAFETY LAYERS (Pre-intent filtering safety checks)
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log(`🛡️ [Decision Brain] Running Safety Layers...`);
    
    // Build data timestamps from land context
    const dataTimestamps: DataTimestamps = {
      ndviTimestamp: landContext.ndvi_data?.timestamp,
      soilTestTimestamp: landContext.soil_data?.test_date,
      weatherTimestamp: landContext.weather_data?.timestamp
    };
    
    // Run all safety filters with language for localized warnings
    const safetyResult = runAllSafetyFilters({
      advisory: fullAdvisory,
      cropStage: decisionInput.crop_stage,
      weather: landContext.weather_data ? {
        temperature: landContext.weather_data.temperature,
        windSpeed: landContext.weather_data.wind_speed,
        rainExpectedHours: landContext.weather_data.rain_expected_hours,
        humidity: landContext.weather_data.humidity
      } : undefined,
      visionConfidence: landContext.vision_context?.confidence,
      farmerProfile: landContext.farmer_profile,
      dataTimestamps,
      ruleCompleteness: 0.85, // Default rule completeness for most crops
      language // ✅ Pass language for localized warning messages
    });
    
    console.log(`🛡️ [Decision Brain] Safety Layers Complete:`, {
      allowedActions: safetyResult.allowedActions.length,
      blockedActions: safetyResult.blockedActions.length,
      secondaryActions: safetyResult.secondaryActions.length,
      originalConfidence: Math.round(fullAdvisory.confidence * 100),
      adjustedConfidence: Math.round(safetyResult.adjustedConfidence * 100),
      warnings: safetyResult.warnings.length
    });
    
    // Create safety-filtered advisory
    const safetyFilteredAdvisory: UnifiedAdvisory = {
      ...fullAdvisory,
      actions: safetyResult.allowedActions,
      confidence: safetyResult.adjustedConfidence,
      // Add blocked actions info to reasoning trace
      reasoning_trace: [
        ...(fullAdvisory.reasoning_trace || []),
        ...safetyResult.safetyLog.map(log => `[Safety] ${log}`),
        ...safetyResult.warnings.map(w => `[Warning] ${w}`)
      ]
    };
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 4: INTENT-BASED ACTION FILTERING (CRITICAL FIX)
    // ═══════════════════════════════════════════════════════════════════════════
    
    console.log(`🔍 [Decision Brain] Filtering actions for intent: ${intentResult.intent}...`);
    
    // Use safety-filtered advisory for intent filtering
    const filteredResult = filterActionsByIntent(safetyFilteredAdvisory, intentResult, language);
    
    // Add blocked actions from safety layers to the filtered result
    const allBlockedActions = [
      ...filteredResult.filteredOutActions,
      ...safetyResult.blockedActions.map(b => b.action)
    ];
    
    console.log(`✂️ [Decision Brain] Intent Filtering Result:`, {
      intent: intentResult.intent,
      actionsReturned: filteredResult.filteredActions.length,
      actionsFilteredOut: allBlockedActions.length,
      hasRelevantActions: filteredResult.hasRelevantActions,
      noActionReason: filteredResult.noActionReason,
      safetyBlocked: safetyResult.blockedActions.length
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // STAGE 4.5: BUILD FIELD CONTEXT SNAPSHOT (NEW - For Structured Responses)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const fieldSnapshot = buildFieldContextSnapshot(
      landContext,
      decisionInput.crop_stage,
      daysAfterSowing
    );
    
    console.log(`📊 [Decision Brain] Field Context Snapshot:`, {
      certainty: fieldSnapshot.dataFreshness.overallCertainty,
      daysAfterSowing: fieldSnapshot.daysAfterSowing,
      soilFresh: !fieldSnapshot.dataFreshness.soil.isStale,
      ndviFresh: !fieldSnapshot.dataFreshness.ndvi.isStale,
      weatherFresh: !fieldSnapshot.dataFreshness.weather.isStale
    });
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FORMAT RESPONSE (with Structured 5-Part Response)
    // ═══════════════════════════════════════════════════════════════════════════
    
    let chatResponse: ChatResponse;
    
    if (filteredResult.hasRelevantActions) {
      // Build structured 5-part response for production-ready output
      const structuredResponse = buildStructuredResponse(
        fieldSnapshot,
        filteredResult.advisory,
        messageClassification,
        language
      );
      
      console.log(`📝 [Decision Brain] Structured Response Built:`, {
        hasAction: !!structuredResponse.bestActionNow,
        timeWindow: structuredResponse.timeWindow,
        confidence: structuredResponse.confidenceDisclosure
      });
      
      // Use the structured farmer message as the primary response
      chatResponse = formatAdvisoryForChat(filteredResult.advisory, language, landContext);
      
      // Replace the farmer message with the structured one for cleaner output
      if (chatResponse.decisionBrainResponse) {
        chatResponse.decisionBrainResponse.farmerMessage = structuredResponse.farmerMessage;
      }
      chatResponse.response = structuredResponse.farmerMessage;
      
    } else {
      // CRITICAL: No action needed for this intent - generate safe response
      chatResponse = formatNoActionResponse(
        intentResult,
        filteredResult,
        safetyFilteredAdvisory, // Use safety-filtered advisory
        language,
        landContext
      );
    }
    
    // Add safety warnings to the response
    if (safetyResult.warnings.length > 0 && chatResponse.decisionBrainResponse) {
      const warningMessages = safetyResult.warnings.slice(0, 3).map(w => `⚠️ ${w}`).join('\n');
      chatResponse.decisionBrainResponse.farmerMessage = 
        chatResponse.decisionBrainResponse.farmerMessage + `\n\n${warningMessages}`;
    }
    
    // Add blocked actions from safety layers
    if (safetyResult.blockedActions.length > 0 && chatResponse.decisionBrainResponse) {
      const translatedBlockedActions: BlockedAction[] = safetyResult.blockedActions.map(b => ({
        action: b.action.toString().replace(/_/g, ' ').toLowerCase(),
        whyNot: translateBlockedReason(b.reasonKey, language),
        blockedByRules: [b.category]
      }));
      
      chatResponse.decisionBrainResponse.blockedActions = [
        ...(chatResponse.decisionBrainResponse.blockedActions || []),
        ...translatedBlockedActions
      ];
    }
    
    chatResponse.executionTimeMs = Date.now() - startTime;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // LOG INTERACTION FOR TRAINING (Non-blocking)
    // ═══════════════════════════════════════════════════════════════════════════
    
    const interactionLog = createChatInteractionLog(
      landContext.id || 'unknown',
      query,
      intentResult,
      filteredResult,
      !navigator.onLine
    );
    
    // Fire and forget - don't block on logging
    logChatInteraction(interactionLog, supabaseClient).catch(e => 
      console.warn('Chat logging failed:', e)
    );
    
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`✅ [DECISION BRAIN] SUCCESS - Intent-Aware Response with Safety!`);
    console.log(`⏱️ Execution time: ${chatResponse.executionTimeMs}ms`);
    console.log(`🎯 Intent: ${intentResult.intent} (${Math.round(intentResult.confidence * 100)}%)`);
    console.log(`📏 Actions for this intent: ${filteredResult.filteredActions.length}`);
    console.log(`🚫 Actions filtered out: ${allBlockedActions.length}`);
    console.log(`🛡️ Safety blocked: ${safetyResult.blockedActions.length}`);
    console.log(`📊 Adjusted confidence: ${Math.round(safetyResult.adjustedConfidence * 100)}%`);
    console.log(`💰 AI tokens used: 0`);
    console.log(`════════════════════════════════════════════════════════════════\n`);
    
    return {
      handled: true,
      response: chatResponse,
      fallbackToAI: false,
      inferredIntent: intentResult.intent,
      intentConfidence: intentResult.confidence
    };
    
  } catch (error) {
    console.error(`❌ [Decision Brain] Execution error:`, error);
    return {
      handled: false,
      fallbackToAI: true,
      reason: 'execution_error',
      inferredIntent: intentResult.intent,
      intentConfidence: intentResult.confidence
    };
  }
}

/**
 * Format a "No Action Needed" response when the farmer's intent
 * doesn't match any current actions from the Decision Graph.
 * 
 * CRITICAL: This prevents returning unrelated advice!
 */
function formatNoActionResponse(
  intentResult: IntentInferenceResult,
  filteredResult: IntentFilteredAdvisory,
  fullAdvisory: UnifiedAdvisory,
  language: string,
  landContext?: LandContext
): ChatResponse {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  
  // Build the farmer-friendly "no action" message
  const intentLabels: Record<FarmerIntent, Record<string, string>> = {
    WATER: { en: 'irrigation', hi: 'सिंचाई', mr: 'पाणी' },
    NUTRIENT: { en: 'fertilizer', hi: 'खाद', mr: 'खत' },
    PEST: { en: 'pest control', hi: 'कीट नियंत्रण', mr: 'कीड नियंत्रण' },
    WEED: { en: 'weeding', hi: 'निराई', mr: 'निंदणी' },
    DISEASE: { en: 'disease treatment', hi: 'रोग उपचार', mr: 'रोग उपचार' },
    HARVEST: { en: 'harvesting', hi: 'कटाई', mr: 'कापणी' },
    STATUS_CHECK: { en: 'status check', hi: 'स्थिति जांच', mr: 'स्थिती तपासणी' },
    WHEN: { en: 'timing', hi: 'समय', mr: 'वेळ' },
    WHY: { en: 'explanation', hi: 'कारण', mr: 'कारण' },
    GENERAL: { en: 'advice', hi: 'सलाह', mr: 'सल्ला' }
  };
  
  const intentLabel = intentLabels[intentResult.intent]?.[language] || intentLabels[intentResult.intent]?.en || 'advice';
  const cropName = landContext?.crop_name || landContext?.current_crop || 'crop';
  const areaAcres = landContext?.area_acres || (landContext?.area_hectares ? landContext.area_hectares * 2.47105 : undefined);
  const areaGuntas = areaAcres ? Math.round(areaAcres * 40) : undefined;
  const area = areaGuntas ? `${areaGuntas} गुंठा` : '';
  
  // Build message based on language - FACTS → WHY → WHAT format
  let farmerMessage: string;
  let noActionMessage: string;
  
  if (language === 'hi') {
    noActionMessage = filteredResult.noActionReason || `${intentLabel} की अभी जरूरत नहीं है।`;
    
    // 📊 FACTS - No markdown for plain text display
    let factsSection = `📊 तथ्य (आपकी जमीन का डेटा):\n`;
    factsSection += `🌾 फसल: ${cropName}${area ? ` | क्षेत्र: ${area}` : ''}\n`;
    if (landContext?.ndvi_data?.value !== undefined) {
      const ndviState = landContext.ndvi_data.value > 0.6 ? 'स्वस्थ' : landContext.ndvi_data.value > 0.4 ? 'ठीक' : 'ध्यान दें';
      factsSection += `🛰️ NDVI: ${(landContext.ndvi_data.value * 100).toFixed(0)}% (${ndviState})\n`;
    }
    if (landContext?.weather_data) {
      factsSection += `🌤️ मौसम: ${landContext.weather_data.temperature || 28}°C\n`;
    }
    
    const whySection = `\n🔍 क्यों:\n✅ ${noActionMessage}\n`;
    const whatSection = `\n✅ क्या करें:\n📋 ${filteredResult.noActionExplanation || 'नियमित निगरानी जारी रखें।'}\n`;
    
    farmerMessage = factsSection + whySection + whatSection + 
      `\n📊 विश्वसनीयता: ${Math.round(fullAdvisory.confidence * 100)}%\n---\n🧠 निर्णय मस्तिष्क (0 AI टोकन, तुरंत)`;
      
  } else if (language === 'mr') {
    noActionMessage = filteredResult.noActionReason || `${intentLabel} ची आत्ता गरज नाही।`;
    
    // 📊 FACTS - No markdown for plain text display
    let factsSection = `📊 तथ्ये (तुमच्या जमिनीचा डेटा):\n`;
    factsSection += `🌾 पीक: ${cropName}${area ? ` | क्षेत्र: ${area}` : ''}\n`;
    if (landContext?.ndvi_data?.value !== undefined) {
      const ndviState = landContext.ndvi_data.value > 0.6 ? 'निरोगी' : landContext.ndvi_data.value > 0.4 ? 'ठीक' : 'लक्ष द्या';
      factsSection += `🛰️ NDVI: ${(landContext.ndvi_data.value * 100).toFixed(0)}% (${ndviState})\n`;
    }
    if (landContext?.weather_data) {
      factsSection += `🌤️ हवामान: ${landContext.weather_data.temperature || 28}°C\n`;
    }
    
    const whySection = `\n🔍 का:\n✅ ${noActionMessage}\n`;
    const whatSection = `\n✅ काय करावे:\n📋 ${filteredResult.noActionExplanation || 'नियमित निरीक्षण सुरू ठेवा.'}\n`;
    
    farmerMessage = factsSection + whySection + whatSection + 
      `\n📊 विश्वासार्हता: ${Math.round(fullAdvisory.confidence * 100)}%\n---\n🧠 निर्णय मेंदू (0 AI टोकन, त्वरित)`;
      
  } else {
    noActionMessage = filteredResult.noActionReason || `No ${intentLabel} action required at this time.`;
    
    // 📊 FACTS - No markdown for plain text display
    let factsSection = `📊 FACTS (Your Land Data):\n`;
    factsSection += `🌾 Crop: ${cropName}${area ? ` | Area: ${area}` : ''}\n`;
    if (landContext?.ndvi_data?.value !== undefined) {
      const ndviState = landContext.ndvi_data.value > 0.6 ? 'Healthy' : landContext.ndvi_data.value > 0.4 ? 'OK' : 'Attention needed';
      factsSection += `🛰️ NDVI: ${(landContext.ndvi_data.value * 100).toFixed(0)}% (${ndviState})\n`;
    }
    if (landContext?.weather_data) {
      factsSection += `🌤️ Weather: ${landContext.weather_data.temperature || 28}°C\n`;
    }
    
    const whySection = `\n🔍 WHY:\n✅ ${noActionMessage}\n`;
    const whatSection = `\n✅ WHAT TO DO:\n📋 ${filteredResult.noActionExplanation || 'Continue regular monitoring.'}\n`;
    
    farmerMessage = factsSection + whySection + whatSection + 
      `\n📊 Confidence: ${Math.round(fullAdvisory.confidence * 100)}%\n---\n🧠 Decision Brain (0 AI tokens, instant)`;
  }
  
  // Build structured response with "no action" card
  const decisionBrainResponse: DecisionBrainResponse = {
    landContext: landContext ? {
      cropName: landContext.crop_name || landContext.current_crop || 'Unknown',
      cropGroup: landContext.crop_group || getCropGroup(landContext.crop_code || '') || 'Unknown',
      growthStage: 'Growing',
      landArea: landContext.area_acres ? `${Math.round(landContext.area_acres * 40)} गुंठा` : undefined,
      farmingMode: landContext.farming_mode || 'INTEGRATED'
    } : undefined,
    farmerMessage,
    primaryActions: [],
    secondaryActions: [],
    blockedActions: [],
    confidence: {
      riskLevel: fullAdvisory.risk_level === RiskLevel.LOW ? 'LOW' : 
                 fullAdvisory.risk_level === RiskLevel.MEDIUM ? 'MEDIUM' :
                 fullAdvisory.risk_level === RiskLevel.HIGH ? 'HIGH' : 'CRITICAL',
      confidence: Math.round(fullAdvisory.confidence * 100),
      explanations: [],
      rulesApplied: fullAdvisory.rules_applied.length
    },
    language
  };
  
  return {
    response: farmerMessage,
    structuredResponse: {
      cards: [{
        id: 'no-action',
        type: 'success',
        title: noActionMessage,
        content: filteredResult.noActionExplanation || 'Continue regular monitoring.',
        color: '#22C55E',
        gradient: ['#22C55E', '#16A34A'],
        icon: 'check-circle',
        priority: 1
      }],
      language
    },
    decisionBrainResponse,
    source: 'decision_brain',
    advisory: fullAdvisory, // Keep full advisory for reference
    executionTimeMs: 0
  };
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
    version: '2.0.0-intent-aware',
    rulesLoaded: true
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI FINE-TUNING FOR COMPLEX/CRITICAL CASES - 2030-READY HYBRID
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Only use AI to polish Decision Brain output when:
 * 1. Risk level is CRITICAL or HIGH
 * 2. Multiple complex causes detected
 * 3. Farmer asks detailed questions (how, why, explain)
 * 
 * AI receives Decision Brain advisory as CONTEXT, not for reasoning.
 * Max 300 tokens for refinement.
 */
export interface AIRefinementResult {
  refined: boolean;
  refinedResponse?: string;
  tokensUsed: number;
  reason: string;
}

/**
 * ✅ HYBRID ENHANCEMENT: Build prompt for AI to refine symbolic brain output
 * AI does NOT decide - only makes the advisory farmer-friendly
 */
export function buildHybridEnhancementPrompt(
  advisory: UnifiedAdvisory,
  query: string,
  language: string
): string {
  const langInstructions: Record<string, string> = {
    hi: 'हिंदी में गांव की बोली में संक्षिप्त और स्पष्ट उत्तर दें। सरल शब्दों का उपयोग करें।',
    mr: 'मराठीत गावाकडची बोली वापरून थोडक्यात आणि स्पष्ट उत्तर द्या. सोप्या शब्दांचा वापर करा.',
    en: 'Provide a brief and clear response in simple village English. Use easy words.'
  };
  
  const actionsText = advisory.actions.length > 0 
    ? advisory.actions.map(a => `• ${a.action}: ${a.justification_key || ''} (₹${a.estimated_cost_inr || 0})`).join('\n')
    : '• No immediate action needed - crop is in good condition';
  
  return `🧠 DECISION BRAIN OUTPUT (ICAR/FAO Verified Rules - DO NOT CHANGE):
═══════════════════════════════════════════════════════════════
CROP: ${advisory.facts.crop_code} | STAGE: ${advisory.facts.crop_stage}
RISK: ${advisory.risk_level} (${Math.round(advisory.confidence * 100)}% confidence)
ISSUES: ${advisory.causes.length > 0 ? advisory.causes.join(', ') : 'No issues detected'}
ACTIONS:
${actionsText}
═══════════════════════════════════════════════════════════════

👨‍🌾 FARMER'S QUESTION: "${query}"

📝 YOUR TASK (Language Refinement ONLY):
1. KEEP all recommended actions EXACTLY as given above
2. EXPLAIN them in simple farmer language
3. Add practical timing (morning/evening) if helpful
4. Mention economic benefit in ₹ if cost is given
5. Keep response under 200 words

${langInstructions[language] || langInstructions.en}

⚠️ CRITICAL RULES:
- DO NOT add new recommendations
- DO NOT change quantities/dosages
- DO NOT suggest alternatives
- ONLY rephrase in farmer-friendly language
- If "No action needed", reassure farmer their crop is healthy`;
}

export function buildRefinementPrompt(
  advisory: UnifiedAdvisory,
  language: string
): string {
  const langInstructions: Record<string, string> = {
    hi: 'हिंदी में संक्षिप्त और स्पष्ट उत्तर दें।',
    mr: 'मराठीत थोडक्यात आणि स्पष्ट उत्तर द्या.',
    en: 'Provide a brief and clear response in simple English.'
  };
  
  return `You are refining a farming advisory from our Decision Brain (ICAR/FAO rules).
DO NOT change the recommendations - only make them clearer and more actionable.

ADVISORY TO REFINE:
- Risk Level: ${advisory.risk_level}
- Issues: ${advisory.causes.join(', ')}
- Actions: ${advisory.actions.map(a => a.action).join(', ')}
- Confidence: ${Math.round(advisory.confidence * 100)}%

${langInstructions[language] || langInstructions.en}

Keep response under 100 words. Focus on WHAT to do TODAY.`;
}

/**
 * ✅ ENHANCED: Check if AI refinement/enhancement is needed
 * Combines classification info with advisory complexity
 */
export function shouldRefineWithAI(advisory: UnifiedAdvisory, classification?: QueryClassification): boolean {
  // Always enhance if classification says so
  if (classification?.requiresAIEnhancement) {
    console.log(`🤖 [Hybrid] AI enhancement requested by classification`);
    return true;
  }
  
  // Complex advisories with multiple actions benefit from AI explanation
  if (advisory.actions.length > 2) {
    console.log(`🤖 [Hybrid] AI enhancement for complex advisory (${advisory.actions.length} actions)`);
    return true;
  }
  
  // High risk situations need clear farmer communication
  if (advisory.risk_level === RiskLevel.HIGH || advisory.risk_level === RiskLevel.CRITICAL) {
    console.log(`🤖 [Hybrid] AI enhancement for high risk situation`);
    return true;
  }
  
  return false;
}

/**
 * ✅ 2030-READY HYBRID: Async version that ALWAYS runs symbolic brain first
 * Then optionally enhances with AI for farmer-friendly language
 */
export async function tryDecisionBrainWithAIRefinement(
  query: string,
  landContext: LandContext | null,
  language: string = 'en',
  farmerId: string = 'anonymous',
  tenantId: string = 'default',
  supabaseClient?: any
): Promise<DecisionBrainResult & { source: 'symbolic_only' | 'symbolic_ai_enhanced' | 'ai_fallback' }> {
  // ✅ STEP 1: Classify the query
  const classification = classifyQueryForDecisionBrain(query);
  
  console.log(`🎯 [Hybrid] Query classification:`, {
    queryType: classification.queryType,
    canUseDecisionBrain: classification.canUseDecisionBrain,
    requiresAIEnhancement: classification.requiresAIEnhancement,
    isFollowUp: classification.isFollowUp
  });
  
  // ✅ STEP 2: ALWAYS run symbolic brain first for agricultural queries
  const brainResult = tryDecisionBrain(query, landContext, language, farmerId, tenantId, supabaseClient);
  
  // If Decision Brain didn't handle it (non-agri query), return for AI fallback
  if (!brainResult.handled || !brainResult.response) {
    console.log(`⚠️ [Hybrid] Symbolic brain couldn't handle - pure AI fallback`);
    return { ...brainResult, source: 'ai_fallback' };
  }
  
  // ✅ STEP 3: Check if AI enhancement is needed
  const needsEnhancement = brainResult.response.advisory && 
    shouldRefineWithAI(brainResult.response.advisory, classification);
  
  if (!needsEnhancement) {
    console.log(`🧠 [Hybrid] Returning pure symbolic brain result (no AI enhancement needed)`);
    return { ...brainResult, source: 'symbolic_only' };
  }
  
  // If no supabase client provided, skip AI enhancement
  if (!supabaseClient) {
    console.log(`⚠️ [Hybrid] No supabase client for AI enhancement - returning symbolic result`);
    return { ...brainResult, source: 'symbolic_only' };
  }
  
  console.log(`🤖 [Hybrid] Enhancing symbolic brain output with AI for farmer-friendly language...`);
  
  try {
    // ✅ STEP 4: Validate advisory exists before building prompt
    if (!brainResult.response.advisory) {
      console.warn(`⚠️ [Hybrid] No advisory in brain result - skipping AI enhancement`);
      return { ...brainResult, source: 'symbolic_only' };
    }
    
    // ✅ STEP 5: Build hybrid enhancement prompt with FULL symbolic context
    const enhancementPrompt = buildHybridEnhancementPrompt(
      brainResult.response.advisory,
      query,
      language
    );
    
    // ✅ STEP 6: Validate prompt is not empty
    if (!enhancementPrompt || enhancementPrompt.length < 10) {
      console.warn(`⚠️ [Hybrid] Invalid enhancement prompt - skipping AI enhancement`);
      return { ...brainResult, source: 'symbolic_only' };
    }
    
    // ✅ FIX: Build request body with explicit validation
    const requestBody = {
      messages: [{ role: 'user', content: enhancementPrompt }],
      language: language || 'en',
      metadata: {
        farmerId,
        tenantId,
        mode: 'hybrid_enhancement',
        symbolicContext: {
          risk_level: brainResult.response.advisory?.risk_level || 'LOW',
          causes: (brainResult.response.advisory?.causes || []).map(c => String(c)),
          action_count: brainResult.response.advisory?.actions?.length || 0
        },
        maxTokens: 300
      }
    };
    
    // ✅ CRITICAL: Validate body before sending to prevent empty payload
    const bodyString = JSON.stringify(requestBody);
    if (!bodyString || bodyString.length < 50) {
      console.error(`❌ [Hybrid] Invalid request body - too short:`, bodyString?.length);
      return { ...brainResult, source: 'symbolic_only' };
    }
    
    console.log(`🤖 [Hybrid] Sending AI enhancement request:`, {
      promptLength: enhancementPrompt.length,
      bodyLength: bodyString.length,
      hasMessages: requestBody.messages.length > 0
    });
    
    // ✅ Call AI for enhancement using pre-serialized body
    const { data: aiData, error: aiError } = await supabaseClient.functions.invoke('ai-agriculture-chat', {
      body: requestBody,
      headers: {
        'x-tenant-id': tenantId,
        'x-farmer-id': farmerId
      }
    });
    
    if (aiError || !aiData?.response) {
      console.warn(`⚠️ [Hybrid] AI enhancement failed:`, aiError);
      return { ...brainResult, source: 'symbolic_only' }; // Fallback to symbolic
    }
    
    console.log(`✅ [Hybrid] AI enhanced response ready`);
    
    // ✅ STEP 5: Update response with AI-enhanced version
    if (brainResult.response.decisionBrainResponse) {
      brainResult.response.decisionBrainResponse.farmerMessage = aiData.response;
    }
    brainResult.response.response = aiData.response;
    
    return { ...brainResult, source: 'symbolic_ai_enhanced' };
    
  } catch (error) {
    console.warn(`⚠️ [Hybrid] AI enhancement exception:`, error);
    return { ...brainResult, source: 'symbolic_only' }; // Fallback to symbolic
  }
}
