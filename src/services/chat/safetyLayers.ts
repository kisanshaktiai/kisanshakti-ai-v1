/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION BRAIN SAFETY LAYERS - Critical Pre/Post Decision Guards
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ICAR/FAO compliant safety filters that run BEFORE and AFTER decision graph.
 * These do NOT modify decision graph logic - only add safety constraints.
 * 
 * Includes:
 * - Data Freshness Enforcement
 * - Chemical Safety & Do-Not-Mix Guard
 * - Vision Confidence Gating
 * - Economic Capability Filter
 * - Season & Crop Calendar Guard
 * - Confidence Honesty Patch
 */

import { Action, CropStage, UnifiedAdvisory, PrioritizedAction } from '@/decision-graph/types-only';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DataFreshnessFlags {
  ndviStale: boolean;      // > 72 hours old
  soilStale: boolean;      // > 180 days old
  weatherStale: boolean;   // Missing or > 6 hours old
  ndviAgeDays?: number;
  soilAgeDays?: number;
  weatherAgeHours?: number;
}

export interface FarmerProfile {
  landholding_class: 'MARGINAL' | 'SMALL' | 'MEDIUM' | 'LARGE';
  budget_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  subsidy_eligible?: boolean;
}

export interface SeasonContext {
  season: 'KHARIF' | 'RABI' | 'ZAID';
  monsoonPhase?: 'PRE' | 'ACTIVE' | 'WITHDRAWAL';
  currentMonth: number;
}

export interface ChemicalSafetyResult {
  safe: boolean;
  blockedReasons: string[];
  blockedActions: Action[];
}

export interface VisionGatingResult {
  allowPesticides: boolean;
  allowFungicides: boolean;
  confidence: number;
  message?: string;
}

export interface BlockedActionWithReason {
  action: Action;
  reason: string;
  reasonKey: string;
  category: 'CHEMICAL_SAFETY' | 'VISION_CONFIDENCE' | 'ECONOMIC' | 'SEASON' | 'DATA_FRESHNESS';
}

export interface SafetyFilterResult {
  allowedActions: PrioritizedAction[];
  blockedActions: BlockedActionWithReason[];
  secondaryActions: PrioritizedAction[];
  adjustedConfidence: number;
  freshnessFlags: DataFreshnessFlags;
  warnings: string[];
  safetyLog: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA FRESHNESS ENFORCEMENT (MANDATORY)
// ═══════════════════════════════════════════════════════════════════════════

export interface DataTimestamps {
  ndviTimestamp?: Date | string;
  soilTestTimestamp?: Date | string;
  weatherTimestamp?: Date | string;
}

/**
 * Calculate data freshness flags and downgrade confidence if stale
 */
export function calculateDataFreshness(timestamps: DataTimestamps): DataFreshnessFlags {
  const now = new Date();
  
  let ndviAgeDays: number | undefined;
  let soilAgeDays: number | undefined;
  let weatherAgeHours: number | undefined;
  
  if (timestamps.ndviTimestamp) {
    const ndviDate = new Date(timestamps.ndviTimestamp);
    ndviAgeDays = (now.getTime() - ndviDate.getTime()) / (1000 * 60 * 60 * 24);
  }
  
  if (timestamps.soilTestTimestamp) {
    const soilDate = new Date(timestamps.soilTestTimestamp);
    soilAgeDays = (now.getTime() - soilDate.getTime()) / (1000 * 60 * 60 * 24);
  }
  
  if (timestamps.weatherTimestamp) {
    const weatherDate = new Date(timestamps.weatherTimestamp);
    weatherAgeHours = (now.getTime() - weatherDate.getTime()) / (1000 * 60 * 60);
  }
  
  return {
    ndviStale: ndviAgeDays !== undefined ? ndviAgeDays > 3 : true, // > 72 hours
    soilStale: soilAgeDays !== undefined ? soilAgeDays > 180 : true, // > 6 months
    weatherStale: weatherAgeHours !== undefined ? weatherAgeHours > 6 : true, // > 6 hours
    ndviAgeDays,
    soilAgeDays,
    weatherAgeHours
  };
}

/**
 * Calculate confidence penalty based on data freshness
 */
export function calculateFreshnessPenalty(flags: DataFreshnessFlags): number {
  let penalty = 0;
  
  if (flags.ndviStale) penalty += 0.15;      // -15% for stale NDVI
  if (flags.soilStale) penalty += 0.10;      // -10% for stale soil test
  if (flags.weatherStale) penalty += 0.20;   // -20% for stale weather (critical for spray decisions)
  
  return Math.min(penalty, 0.40); // Max 40% penalty
}

// ═══════════════════════════════════════════════════════════════════════════
// CHEMICAL SAFETY & DO-NOT-MIX GUARD (MANDATORY)
// ═══════════════════════════════════════════════════════════════════════════

interface WeatherConditions {
  temperature?: number;
  windSpeed?: number;
  rainExpectedHours?: number;
  humidity?: number;
}

const UNSAFE_CHEMICAL_COMBINATIONS = [
  { a: 'NEEM_OIL', b: 'SULFUR', reason: 'Neem oil + Sulfur can cause phytotoxicity' },
  { a: 'COPPER', b: 'TRIAZOLE', reason: 'Copper fungicide + Triazole may reduce efficacy' },
  { a: 'LIME', b: 'PHOSPHORUS', reason: 'Lime + Phosphorus fertilizer reduces P availability' },
];

// Stages where spraying is unsafe (using string values that match enum)
const SPRAY_UNSAFE_STAGE_VALUES = [
  CropStage.REPRODUCTIVE  // Flowering is part of REPRODUCTIVE stage
];

const SPRAY_ACTIONS: Action[] = [
  Action.APPLY_INSECTICIDE,
  Action.APPLY_FUNGICIDE,
  Action.APPLY_NEEM_OIL,
  Action.APPLY_BIO_CONTROL,
  Action.APPLY_TRICHODERMA
];

/**
 * Check chemical spray safety based on weather and crop stage
 */
export function checkChemicalSafety(
  weather: WeatherConditions,
  cropStage: CropStage,
  actions: Action[]
): ChemicalSafetyResult {
  const blockedReasons: string[] = [];
  const blockedActions: Action[] = [];
  
  const sprayActions = actions.filter(a => SPRAY_ACTIONS.includes(a));
  
  if (sprayActions.length === 0) {
    return { safe: true, blockedReasons: [], blockedActions: [] };
  }
  
  // Temperature check (> 35°C)
  if (weather.temperature && weather.temperature > 35) {
    blockedReasons.push(`High temperature (${weather.temperature}°C > 35°C) - spray may evaporate or cause leaf burn`);
    blockedActions.push(...sprayActions);
  }
  
  // Wind speed check (> 15 km/h)
  if (weather.windSpeed && weather.windSpeed > 15) {
    blockedReasons.push(`High wind speed (${weather.windSpeed} km/h > 15 km/h) - spray drift risk`);
    blockedActions.push(...sprayActions);
  }
  
  // Rain expected within 12 hours
  if (weather.rainExpectedHours !== undefined && weather.rainExpectedHours < 12) {
    blockedReasons.push(`Rain expected in ${weather.rainExpectedHours} hours - spray will wash off`);
    blockedActions.push(...sprayActions);
  }
  
  // Flowering/Reproductive stage check
  if (SPRAY_UNSAFE_STAGE_VALUES.includes(cropStage)) {
    blockedReasons.push(`Crop in ${cropStage} stage - chemical spray may damage flowers/fruit`);
    blockedActions.push(...sprayActions.filter(a => 
      a === Action.APPLY_INSECTICIDE || a === Action.APPLY_FUNGICIDE
    ));
  }
  
  return {
    safe: blockedActions.length === 0,
    blockedReasons,
    blockedActions: [...new Set(blockedActions)] // Remove duplicates
  };
}

/**
 * Check for unsafe chemical combinations
 */
export function checkChemicalCombinations(actions: Action[]): { safe: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const actionStrings = actions.map(a => a.toString().toUpperCase());
  
  for (const combo of UNSAFE_CHEMICAL_COMBINATIONS) {
    const hasA = actionStrings.some(a => a.includes(combo.a));
    const hasB = actionStrings.some(a => a.includes(combo.b));
    
    if (hasA && hasB) {
      warnings.push(combo.reason);
    }
  }
  
  return { safe: warnings.length === 0, warnings };
}

// ═══════════════════════════════════════════════════════════════════════════
// VISION CONFIDENCE GATING (MANDATORY)
// ═══════════════════════════════════════════════════════════════════════════

const MIN_VISION_CONFIDENCE_FOR_PESTICIDE = 0.7;

/**
 * Gate pesticide/fungicide actions based on vision analysis confidence
 */
export function gateVisionConfidence(visionConfidence?: number): VisionGatingResult {
  if (visionConfidence === undefined) {
    return {
      allowPesticides: true,
      allowFungicides: true,
      confidence: 1,
      message: undefined
    };
  }
  
  if (visionConfidence < MIN_VISION_CONFIDENCE_FOR_PESTICIDE) {
    return {
      allowPesticides: false,
      allowFungicides: false,
      confidence: visionConfidence,
      message: `Image confidence low (${Math.round(visionConfidence * 100)}%) - manual confirmation required before applying chemicals`
    };
  }
  
  return {
    allowPesticides: true,
    allowFungicides: true,
    confidence: visionConfidence,
    message: undefined
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC CAPABILITY FILTER (MANDATORY)
// ═══════════════════════════════════════════════════════════════════════════

const BUDGET_THRESHOLDS: Record<FarmerProfile['landholding_class'], number> = {
  MARGINAL: 2000,   // ₹2000 max per action
  SMALL: 5000,      // ₹5000 max per action
  MEDIUM: 15000,    // ₹15000 max per action
  LARGE: 50000      // ₹50000 max per action
};

/**
 * Filter high-cost actions for low-budget farmers
 */
export function filterByEconomicCapability(
  actions: PrioritizedAction[],
  farmerProfile?: FarmerProfile
): {
  primaryActions: PrioritizedAction[];
  secondaryActions: PrioritizedAction[];
  economicWarnings: string[];
} {
  if (!farmerProfile) {
    return { primaryActions: actions, secondaryActions: [], economicWarnings: [] };
  }
  
  const budgetThreshold = BUDGET_THRESHOLDS[farmerProfile.landholding_class] || BUDGET_THRESHOLDS.MEDIUM;
  const primaryActions: PrioritizedAction[] = [];
  const secondaryActions: PrioritizedAction[] = [];
  const economicWarnings: string[] = [];
  
  for (const action of actions) {
    const cost = action.estimated_cost_inr || 0;
    
    if (cost > budgetThreshold) {
      secondaryActions.push(action);
      economicWarnings.push(
        `${action.action} (₹${cost}) moved to optional - high cost for ${farmerProfile.landholding_class} farmer`
      );
    } else {
      primaryActions.push(action);
    }
  }
  
  // For marginal farmers, never recommend high-cost as urgent
  if (farmerProfile.landholding_class === 'MARGINAL') {
    const urgentHighCost = primaryActions.filter(a => 
      (a.estimated_cost_inr || 0) > 1000 && a.urgency?.toString() === 'IMMEDIATE'
    );
    
    for (const action of urgentHighCost) {
      const idx = primaryActions.indexOf(action);
      if (idx > -1) {
        primaryActions.splice(idx, 1);
        secondaryActions.push(action);
        economicWarnings.push(
          `${action.action} is optional based on your budget constraints`
        );
      }
    }
  }
  
  return { primaryActions, secondaryActions, economicWarnings };
}

// ═══════════════════════════════════════════════════════════════════════════
// SEASON & CROP CALENDAR GUARD (MANDATORY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current season based on month
 */
export function getCurrentSeason(): SeasonContext {
  const currentMonth = new Date().getMonth() + 1; // 1-12
  
  let season: SeasonContext['season'];
  let monsoonPhase: SeasonContext['monsoonPhase'] | undefined;
  
  if (currentMonth >= 6 && currentMonth <= 10) {
    season = 'KHARIF';
    if (currentMonth === 6) monsoonPhase = 'PRE';
    else if (currentMonth >= 7 && currentMonth <= 9) monsoonPhase = 'ACTIVE';
    else monsoonPhase = 'WITHDRAWAL';
  } else if (currentMonth >= 11 || currentMonth <= 3) {
    season = 'RABI';
  } else {
    season = 'ZAID';
  }
  
  return { season, monsoonPhase, currentMonth };
}

/**
 * Check for seasonal mismatches and calendar violations
 */
export function checkSeasonalSafety(
  cropStage: CropStage,
  seasonContext: SeasonContext,
  actions: Action[]
): { warnings: string[]; blockedActions: Action[] } {
  const warnings: string[] = [];
  const blockedActions: Action[] = [];
  
  // Block late fertilizer in maturity/harvest stage
  if (cropStage === CropStage.MATURITY || cropStage === CropStage.HARVEST) {
    const fertilizerActions = actions.filter(a => 
      a === Action.APPLY_NITROGEN || 
      a === Action.APPLY_PHOSPHORUS || 
      a === Action.APPLY_POTASSIUM ||
      a === Action.APPLY_MICRONUTRIENTS
    );
    
    if (fertilizerActions.length > 0) {
      warnings.push('Fertilizer not recommended at maturity stage - may delay harvest');
      blockedActions.push(...fertilizerActions);
    }
  }
  
  // Block spraying before monsoon rain band (PRE phase)
  if (seasonContext.monsoonPhase === 'PRE') {
    const sprayActions = actions.filter(a => SPRAY_ACTIONS.includes(a));
    
    if (sprayActions.length > 0) {
      warnings.push('Pre-monsoon phase - spray may wash off with incoming rain. Wait for dry window.');
    }
  }
  
  // Active monsoon - warn about spray timing
  if (seasonContext.monsoonPhase === 'ACTIVE') {
    const sprayActions = actions.filter(a => SPRAY_ACTIONS.includes(a));
    
    if (sprayActions.length > 0) {
      warnings.push('Active monsoon - apply spray only in dry windows (2+ hours no rain expected)');
    }
  }
  
  return { warnings, blockedActions };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE HONESTY PATCH (MANDATORY)
// ═══════════════════════════════════════════════════════════════════════════

export interface ConfidenceFactors {
  dataFreshness: DataFreshnessFlags;
  visionConfidence?: number;
  weatherCertainty?: number; // 0-1, how certain is weather forecast
  ruleCompleteness: number;  // 0-1, how complete are rules for this crop
}

/**
 * Calculate honest confidence considering all factors
 * ✅ FIX: Returns localized warnings based on language parameter
 */
export function calculateHonestConfidence(
  baseConfidence: number,
  factors: ConfidenceFactors,
  language: string = 'en'
): {
  adjustedConfidence: number;
  confidenceWarnings: string[];
  isPartialData: boolean;
} {
  let penalty = 0;
  const confidenceWarnings: string[] = [];
  
  // Localized warning messages
  const warnings: Record<string, Record<string, string>> = {
    weatherStale: {
      en: 'Weather data is stale - spray timing may be uncertain',
      hi: 'मौसम डेटा पुराना है - स्प्रे का समय अनिश्चित हो सकता है',
      mr: 'हवामान डेटा जुना आहे - फवारणीची वेळ अनिश्चित असू शकते'
    },
    ndviStale: {
      en: 'NDVI data is old - crop health assessment may be outdated',
      hi: 'NDVI डेटा पुराना है - फसल स्वास्थ्य आकलन पुराना हो सकता है',
      mr: 'NDVI डेटा जुना आहे - पीक आरोग्य मूल्यांकन जुने असू शकते'
    },
    soilStale: {
      en: 'Soil test is old - nutrient recommendations are approximate',
      hi: 'मिट्टी परीक्षण पुराना है - पोषक तत्व अनुशंसाएं अनुमानित हैं',
      mr: 'माती चाचणी जुनी आहे - पोषक तत्व शिफारसी अंदाजे आहेत'
    },
    visionLow: {
      en: 'Image analysis has lower confidence - verify conditions in field',
      hi: 'छवि विश्लेषण में कम विश्वास - खेत में स्थिति की पुष्टि करें',
      mr: 'प्रतिमा विश्लेषणात कमी विश्वास - शेतात स्थिती तपासा'
    },
    weatherUncertain: {
      en: 'Weather forecast is uncertain - monitor conditions before action',
      hi: 'मौसम पूर्वानुमान अनिश्चित - कार्रवाई से पहले स्थिति देखें',
      mr: 'हवामान अंदाज अनिश्चित - कृती करण्यापूर्वी परिस्थिती पहा'
    },
    limitedData: {
      en: 'Limited regional data for this crop - recommendations are general',
      hi: 'इस फसल के लिए सीमित क्षेत्रीय डेटा - अनुशंसाएं सामान्य हैं',
      mr: 'या पिकासाठी मर्यादित प्रादेशिक डेटा - शिफारसी सामान्य आहेत'
    },
    partialData: {
      en: 'This advice is based on partial data – confirm in field',
      hi: 'यह सलाह आंशिक डेटा पर आधारित है - खेत में पुष्टि करें',
      mr: 'हा सल्ला अंशिक डेटावर आधारित आहे - शेतात पुष्टी करा'
    }
  };
  
  const getWarning = (key: string): string => {
    return warnings[key]?.[language] || warnings[key]?.en || key;
  };
  
  // Data freshness penalty
  const freshnessPenalty = calculateFreshnessPenalty(factors.dataFreshness);
  if (freshnessPenalty > 0) {
    penalty += freshnessPenalty;
    if (factors.dataFreshness.weatherStale) {
      confidenceWarnings.push(getWarning('weatherStale'));
    }
    if (factors.dataFreshness.ndviStale) {
      confidenceWarnings.push(getWarning('ndviStale'));
    }
    if (factors.dataFreshness.soilStale) {
      confidenceWarnings.push(getWarning('soilStale'));
    }
  }
  
  // Vision confidence penalty
  if (factors.visionConfidence !== undefined && factors.visionConfidence < 0.8) {
    penalty += (1 - factors.visionConfidence) * 0.2; // Up to 20% penalty
    confidenceWarnings.push(getWarning('visionLow'));
  }
  
  // Weather certainty penalty
  if (factors.weatherCertainty !== undefined && factors.weatherCertainty < 0.7) {
    penalty += (1 - factors.weatherCertainty) * 0.15; // Up to 15% penalty
    confidenceWarnings.push(getWarning('weatherUncertain'));
  }
  
  // Rule completeness penalty
  if (factors.ruleCompleteness < 0.7) {
    penalty += (1 - factors.ruleCompleteness) * 0.1; // Up to 10% penalty
    confidenceWarnings.push(getWarning('limitedData'));
  }
  
  const adjustedConfidence = Math.max(0.3, baseConfidence - penalty);
  const isPartialData = adjustedConfidence < 0.6;
  
  if (isPartialData) {
    confidenceWarnings.push(getWarning('partialData'));
  }
  
  return { adjustedConfidence, confidenceWarnings, isPartialData };
}

// ═══════════════════════════════════════════════════════════════════════════
// INTENT-DEPTH ENFORCEMENT (WHY / WHEN / HOW)
// ═══════════════════════════════════════════════════════════════════════════

export type IntentType = 'WHY' | 'WHEN' | 'HOW' | 'STATUS_CHECK' | 'ACTION_NEEDED' | 'GENERAL';

export interface IntentDepthResult {
  showCauses: boolean;
  showScientificReasoning: boolean;
  showActionCards: boolean;
  showTimingWindows: boolean;
  suppressNonCriticalActions: boolean;
}

/**
 * Enforce response structure based on intent type
 * This runs BEFORE formatting, not via AI
 */
export function enforceIntentDepth(intent: IntentType): IntentDepthResult {
  switch (intent) {
    case 'WHY':
      return {
        showCauses: true,
        showScientificReasoning: true,
        showActionCards: false,
        showTimingWindows: false,
        suppressNonCriticalActions: true
      };
      
    case 'WHEN':
      return {
        showCauses: false,
        showScientificReasoning: false,
        showActionCards: false,
        showTimingWindows: true,
        suppressNonCriticalActions: true
      };
      
    case 'STATUS_CHECK':
      return {
        showCauses: true,
        showScientificReasoning: false,
        showActionCards: false, // Only show if CRITICAL
        showTimingWindows: false,
        suppressNonCriticalActions: true
      };
      
    case 'HOW':
    case 'ACTION_NEEDED':
      return {
        showCauses: true,
        showScientificReasoning: true,
        showActionCards: true,
        showTimingWindows: true,
        suppressNonCriticalActions: false
      };
      
    case 'GENERAL':
    default:
      return {
        showCauses: true,
        showScientificReasoning: false,
        showActionCards: true,
        showTimingWindows: true,
        suppressNonCriticalActions: false
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SAFETY FILTER ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

export interface SafetyFilterInput {
  advisory: UnifiedAdvisory;
  cropStage: CropStage;
  weather?: WeatherConditions;
  visionConfidence?: number;
  farmerProfile?: FarmerProfile;
  dataTimestamps?: DataTimestamps;
  ruleCompleteness?: number;
  language?: string; // ✅ NEW: For localized warnings
}

/**
 * Run all safety filters on advisory
 * Returns filtered actions with explanations
 */
export function runAllSafetyFilters(input: SafetyFilterInput): SafetyFilterResult {
  const safetyLog: string[] = [];
  const warnings: string[] = [];
  const blockedActions: BlockedActionWithReason[] = [];
  let adjustedConfidence = input.advisory.confidence;
  
  console.log(`🛡️ [Safety Layers] Running safety filters on ${input.advisory.actions.length} actions`);
  
  // 1. Data Freshness
  const freshnessFlags = input.dataTimestamps 
    ? calculateDataFreshness(input.dataTimestamps)
    : { ndviStale: true, soilStale: true, weatherStale: true };
  
  const freshnessPenalty = calculateFreshnessPenalty(freshnessFlags);
  if (freshnessPenalty > 0) {
    safetyLog.push(`Freshness penalty: -${Math.round(freshnessPenalty * 100)}%`);
    adjustedConfidence -= freshnessPenalty;
  }
  
  // 2. Block spray if weather is stale
  let allowedActions = [...input.advisory.actions];
  
  if (freshnessFlags.weatherStale) {
    const sprayToBlock = allowedActions.filter(a => SPRAY_ACTIONS.includes(a.action));
    for (const action of sprayToBlock) {
      blockedActions.push({
        action: action.action,
        reason: 'Weather data stale or missing - spray timing unsafe',
        reasonKey: 'WEATHER_STALE',
        category: 'DATA_FRESHNESS'
      });
      warnings.push('Spray blocked: Weather data required for safe application timing');
    }
    allowedActions = allowedActions.filter(a => !SPRAY_ACTIONS.includes(a.action));
    safetyLog.push(`Blocked ${sprayToBlock.length} spray actions due to stale weather`);
  }
  
  // 3. Chemical Safety
  if (input.weather) {
    const chemicalSafety = checkChemicalSafety(input.weather, input.cropStage, allowedActions.map(a => a.action));
    
    if (!chemicalSafety.safe) {
      for (const blocked of chemicalSafety.blockedActions) {
        blockedActions.push({
          action: blocked,
          reason: chemicalSafety.blockedReasons[0] || 'Chemical safety concern',
          reasonKey: 'CHEMICAL_SAFETY',
          category: 'CHEMICAL_SAFETY'
        });
      }
      warnings.push(...chemicalSafety.blockedReasons);
      allowedActions = allowedActions.filter(a => !chemicalSafety.blockedActions.includes(a.action));
      safetyLog.push(`Chemical safety blocked ${chemicalSafety.blockedActions.length} actions`);
    }
    
    // Check combinations
    const combos = checkChemicalCombinations(allowedActions.map(a => a.action));
    warnings.push(...combos.warnings);
  }
  
  // 4. Vision Confidence Gating
  if (input.visionConfidence !== undefined) {
    const visionGate = gateVisionConfidence(input.visionConfidence);
    
    if (!visionGate.allowPesticides) {
      const pesticideActions = allowedActions.filter(a => 
        a.action === Action.APPLY_INSECTICIDE || a.action === Action.APPLY_FUNGICIDE
      );
      
      for (const action of pesticideActions) {
        blockedActions.push({
          action: action.action,
          reason: visionGate.message || 'Vision confidence too low',
          reasonKey: 'VISION_LOW_CONFIDENCE',
          category: 'VISION_CONFIDENCE'
        });
      }
      
      // Replace with monitoring actions
      allowedActions = allowedActions.filter(a => 
        a.action !== Action.APPLY_INSECTICIDE && a.action !== Action.APPLY_FUNGICIDE
      );
      
      if (visionGate.message) warnings.push(visionGate.message);
      safetyLog.push(`Vision gating blocked pesticide/fungicide actions (confidence: ${Math.round(input.visionConfidence * 100)}%)`);
    }
  }
  
  // 5. Seasonal Safety
  const seasonContext = getCurrentSeason();
  const seasonalCheck = checkSeasonalSafety(input.cropStage, seasonContext, allowedActions.map(a => a.action));
  
  for (const blocked of seasonalCheck.blockedActions) {
    blockedActions.push({
      action: blocked,
      reason: seasonalCheck.warnings[0] || 'Seasonal timing concern',
      reasonKey: 'SEASONAL_MISMATCH',
      category: 'SEASON'
    });
  }
  warnings.push(...seasonalCheck.warnings);
  allowedActions = allowedActions.filter(a => !seasonalCheck.blockedActions.includes(a.action));
  
  // 6. Economic Filter
  let secondaryActions: PrioritizedAction[] = [];
  
  if (input.farmerProfile) {
    const economicResult = filterByEconomicCapability(allowedActions, input.farmerProfile);
    allowedActions = economicResult.primaryActions;
    secondaryActions = economicResult.secondaryActions;
    warnings.push(...economicResult.economicWarnings);
    
    if (secondaryActions.length > 0) {
      safetyLog.push(`Economic filter moved ${secondaryActions.length} actions to secondary`);
    }
  }
  
  // 7. Calculate Honest Confidence with language-aware warnings
  const honestConfidence = calculateHonestConfidence(adjustedConfidence, {
    dataFreshness: freshnessFlags,
    visionConfidence: input.visionConfidence,
    ruleCompleteness: input.ruleCompleteness || 0.8
  }, input.language || 'en');
  
  warnings.push(...honestConfidence.confidenceWarnings);
  
  console.log(`🛡️ [Safety Layers] Complete:`, {
    originalActions: input.advisory.actions.length,
    allowedActions: allowedActions.length,
    blockedActions: blockedActions.length,
    secondaryActions: secondaryActions.length,
    originalConfidence: Math.round(input.advisory.confidence * 100),
    adjustedConfidence: Math.round(honestConfidence.adjustedConfidence * 100)
  });
  
  return {
    allowedActions,
    blockedActions,
    secondaryActions,
    adjustedConfidence: honestConfidence.adjustedConfidence,
    freshnessFlags,
    warnings,
    safetyLog
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSLATIONS FOR BLOCKED ACTION REASONS
// ═══════════════════════════════════════════════════════════════════════════

export function translateBlockedReason(reasonKey: string, language: string): string {
  const translations: Record<string, Record<string, string>> = {
    WEATHER_STALE: {
      en: 'Weather data stale - spray timing unsafe',
      hi: 'मौसम डेटा पुराना है - स्प्रे का समय सुरक्षित नहीं',
      mr: 'हवामान डेटा जुना आहे - फवारणी वेळ सुरक्षित नाही'
    },
    CHEMICAL_SAFETY: {
      en: 'Weather conditions unsafe for spraying',
      hi: 'मौसम की स्थिति स्प्रे के लिए असुरक्षित',
      mr: 'हवामान परिस्थिती फवारणीसाठी असुरक्षित'
    },
    VISION_LOW_CONFIDENCE: {
      en: 'Image confidence low - confirm before applying chemicals',
      hi: 'तस्वीर की पुष्टि कमजोर - रसायन डालने से पहले जांचें',
      mr: 'प्रतिमा विश्वास कमी - रसायने वापरण्यापूर्वी पुष्टी करा'
    },
    SEASONAL_MISMATCH: {
      en: 'Not recommended at this crop stage',
      hi: 'इस फसल अवस्था में सुझाव नहीं',
      mr: 'या पीक अवस्थेत शिफारस केलेले नाही'
    },
    ECONOMIC_HIGH_COST: {
      en: 'High cost - optional based on budget',
      hi: 'अधिक खर्च - बजट के अनुसार वैकल्पिक',
      mr: 'जास्त खर्च - बजेटनुसार पर्यायी'
    }
  };
  
  return translations[reasonKey]?.[language] || translations[reasonKey]?.en || reasonKey;
}
