/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HARVEST & QUALITY RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3 (Crop Stage)
 * Based on: ICAR Harvest Guidelines, FAO Post-Harvest Management, Quality Standards
 * 
 * Maturity indicators, harvest timing, post-harvest handling, and quality rules.
 */

import { 
  CauseRule, 
  Cause, 
  CropStage,
  CropGroup,
  PRIORITY_LEVEL_TO_NUMERIC,
  PriorityLevel,
  DecisionInput 
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE METADATA HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** Safely extract a number from metadata */
function num(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/** Safely extract a string from metadata */
function str(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') return value;
  return defaultValue;
}

/** Safely extract a boolean from metadata */
function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP MATURITY INDICATORS
// ═══════════════════════════════════════════════════════════════════════════

export interface MaturityIndicator {
  crop: string;
  visualIndicators: string[];
  physicalTests?: { parameter: string; optimalValue: string }[];
  harvestWindow: string;
  optimalTime: string;
}

export const MATURITY_INDICATORS: MaturityIndicator[] = [
  {
    crop: 'cotton',
    visualIndicators: ['Boll bursting (60-70% bolls open)', 'Fiber turning from cream to white'],
    harvestWindow: '3-4 pickings over 4-6 weeks',
    optimalTime: 'Early morning after dew dries',
  },
  {
    crop: 'tomato',
    visualIndicators: ['Color change from green to breaker stage', 'For market: 50-75% red', 'For long distance: Breaker to turning stage'],
    physicalTests: [{ parameter: 'Firmness', optimalValue: 'Slight give on pressing' }],
    harvestWindow: 'Every 3-5 days',
    optimalTime: 'Early morning (4-8 AM) for maximum turgidity',
  },
  {
    crop: 'rice',
    visualIndicators: ['80-85% grains in panicle hard', 'Straw turns yellow'],
    physicalTests: [{ parameter: 'Moisture content', optimalValue: '20-25%' }],
    harvestWindow: '7-10 days from full maturity',
    optimalTime: 'After morning dew dries',
  },
  {
    crop: 'wheat',
    visualIndicators: ['Grain hard on biting', 'Straw yellow to golden'],
    physicalTests: [{ parameter: 'Moisture content', optimalValue: '20-22%' }],
    harvestWindow: '5-7 days from maturity',
    optimalTime: 'Late morning (10 AM - 2 PM)',
  },
  {
    crop: 'maize',
    visualIndicators: ['Husk drying and brown', 'Black layer formation at grain base', 'Milk line disappeared'],
    physicalTests: [{ parameter: 'Moisture content', optimalValue: '20-25%' }],
    harvestWindow: '7-10 days',
    optimalTime: 'Dry weather conditions',
  },
  {
    crop: 'sugarcane',
    visualIndicators: ['Leaves yellowing from bottom', 'Metallic sound on tapping cane', 'High brix reading (18-20%)'],
    physicalTests: [{ parameter: 'Brix', optimalValue: '18-20%' }],
    harvestWindow: '15-20 days from peak maturity',
    optimalTime: 'After 12 months age, cool weather preferred',
  },
  {
    crop: 'potato',
    visualIndicators: ['Vines dying back', "Skin firmly set (doesn't peel easily)"],
    physicalTests: [{ parameter: 'Specific gravity', optimalValue: '>1.080' }],
    harvestWindow: '2-3 weeks after vine death',
    optimalTime: 'Dry soil conditions',
  },
  {
    crop: 'onion',
    visualIndicators: ['50-75% neck fall', 'Leaves yellowing and drying'],
    harvestWindow: '7-10 days after neck fall',
    optimalTime: 'Dry weather, morning hours',
  },
  {
    crop: 'mango',
    visualIndicators: ['Shoulder development (fuller shape)', 'Color change (variety specific)', 'Specific gravity <1.0 (floats in water)'],
    physicalTests: [{ parameter: 'Specific gravity', optimalValue: '<1.0' }],
    harvestWindow: 'Variety specific (110-150 days from flowering)',
    optimalTime: 'Morning, with 1cm stalk attached',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HARVEST TIMING OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════

export interface HarvestTimingAdvice {
  timing: 'EARLY' | 'OPTIMAL' | 'LATE';
  advantages: string[];
  disadvantages: string[];
}

export const HARVEST_TIMING: Record<string, HarvestTimingAdvice> = {
  early: {
    timing: 'EARLY',
    advantages: ['Escape late season pests', 'Better storage', 'Premium price sometimes'],
    disadvantages: ['Reduced yield', 'Poor quality', 'Incomplete maturity'],
  },
  optimal: {
    timing: 'OPTIMAL',
    advantages: ['Maximum yield + quality balance', 'Best market price'],
    disadvantages: ['Narrow window', 'Weather risk'],
  },
  late: {
    timing: 'LATE',
    advantages: ['Maximum yield', 'Full maturity'],
    disadvantages: ['Quality deterioration', 'Shattering/lodging risk', 'Weather risk', 'Pest/disease buildup'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// TIME OF DAY HARVESTING RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════

export const HARVEST_TIME_OF_DAY = {
  vegetables: {
    optimal: '4-8 AM (Early morning)',
    reason: 'Maximum turgidity, coolest temperature, longest shelf life',
  },
  fruits: {
    optimal: '8-10 AM (After dew evaporates)',
    reason: 'Avoid moisture on fruits (fungal growth prevention)',
  },
  grains: {
    optimal: '10 AM - 2 PM (After dew dries)',
    reason: 'Lower moisture content optimal for threshing',
  },
  flowers: {
    optimal: '4-6 AM (Before sunrise)',
    reason: 'Maximum freshness and vase life',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HARVEST & QUALITY RULES
// ═══════════════════════════════════════════════════════════════════════════

export const HARVEST_QUALITY_RULES: CauseRule[] = [
  // CROP APPROACHING MATURITY
  {
    rule_id: 'HARVEST_001',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const maturityPercent = num(input.metadata?.maturityPercent);
      return maturityPercent >= 80 && maturityPercent < 100;
    },
    cause: Cause.CROP_APPROACHING_MATURITY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'ICAR Harvest Guidelines',
    scientific_basis: 'At 80%+ maturity, prepare for harvest within 3-5 days. Check weather forecast and arrange labor/machinery.',
    icar_package: 'Crop Maturity Assessment Manual',
  },

  // OPTIMAL HARVEST WINDOW
  {
    rule_id: 'HARVEST_002',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const maturityPercent = num(input.metadata?.maturityPercent);
      const weatherStable = !bool(input.metadata?.rainForecast7days);
      return maturityPercent >= 90 && weatherStable;
    },
    cause: Cause.OPTIMAL_HARVEST_WINDOW,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Harvest Timing Optimization',
    scientific_basis: 'Maturity ≥90% with stable weather = optimal harvest window. Harvest within 3-5 days for maximum yield and quality.',
    icar_package: 'ICAR Post-Harvest Management',
  },

  // RAIN FORECAST - EARLY HARVEST ADVISORY
  {
    rule_id: 'HARVEST_003',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const maturityPercent = num(input.metadata?.maturityPercent);
      const rainForecast = bool(input.metadata?.rainForecast7days);
      return maturityPercent >= 85 && rainForecast;
    },
    cause: Cause.EARLY_HARVEST_ADVISED_RAIN,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P2_WEATHER_SAFETY],
    scientific_source: 'Weather-Based Harvest Advisory',
    scientific_basis: 'Rain forecast with mature crop = harvest immediately. Rain delays harvest, causes lodging, disease, quality loss.',
    icar_package: 'Weather-Responsive Agriculture',
  },

  // DELAYED HARVEST WARNING
  {
    rule_id: 'HARVEST_004',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.HARVEST],
    conditions: (input: DecisionInput): boolean => {
      const maturityPercent = num(input.metadata?.maturityPercent);
      const daysOverMature = num(input.metadata?.daysOverMature);
      return maturityPercent >= 100 && daysOverMature >= 7;
    },
    cause: Cause.DELAYED_HARVEST_QUALITY_LOSS,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P2_WEATHER_SAFETY],
    scientific_source: 'Post-Maturity Quality Studies',
    scientific_basis: 'Delayed harvest >7 days after full maturity causes shattering, lodging, pest/disease buildup, quality deterioration.',
    icar_package: 'Harvest Loss Prevention',
  },

  // GRAIN MOISTURE CONTENT CHECK
  {
    rule_id: 'HARVEST_005',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const moistureContent = num(input.metadata?.grainMoisturePercent);
      const cropGroup = input.crop_group;
      const isGrain = [CropGroup.CEREALS, CropGroup.PULSES, CropGroup.OILSEEDS].includes(cropGroup);
      return isGrain && (moistureContent < 18 || moistureContent > 25);
    },
    cause: Cause.GRAIN_MOISTURE_SUBOPTIMAL,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Grain Quality Standards',
    scientific_basis: 'Optimal harvest moisture 20-25%. Too low = shattering loss. Too high = storage problems, fungal growth.',
    icar_package: 'FCI Grain Quality Parameters',
  },

  // VEGETABLE HARVEST TIME ADVISORY
  {
    rule_id: 'HARVEST_006',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const cropGroup = input.crop_group;
      const currentHour = new Date().getHours();
      const isVegetable = cropGroup === CropGroup.VEGETABLES;
      const notEarlyMorning = currentHour >= 8;
      return isVegetable && notEarlyMorning && bool(input.metadata?.harvestPlanned);
    },
    cause: Cause.SUBOPTIMAL_HARVEST_TIME,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P6_OPTIMIZATION],
    scientific_source: 'Post-Harvest Handling Guidelines',
    scientific_basis: 'Vegetables should be harvested early morning (4-8 AM) for maximum turgidity, coolest temperature, longest shelf life.',
    icar_package: 'FAO Post-Harvest Vegetable Handling',
  },

  // EXPORT QUALITY REQUIREMENTS
  {
    rule_id: 'HARVEST_007',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const isExportGrade = str(input.metadata?.targetMarket) === 'export';
      const defects = num(input.metadata?.qualityDefectPercent);
      return isExportGrade && defects > 2;
    },
    cause: Cause.EXPORT_QUALITY_NOT_MET,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Export Quality Standards',
    scientific_basis: 'Export grade requires <2% defects. Higher defects = rejection or price penalty. Sort carefully and maintain cold chain.',
    icar_package: 'APEDA Export Quality Guidelines',
  },

  // POST-HARVEST HANDLING ADVISORY
  {
    rule_id: 'HARVEST_008',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const cropHarvested = bool(input.metadata?.recentlyHarvested);
      const noPreCooling = !bool(input.metadata?.preCoolingDone);
      const isPerishable = [CropGroup.VEGETABLES, CropGroup.FRUITS].includes(input.crop_group);
      return cropHarvested && noPreCooling && isPerishable;
    },
    cause: Cause.POST_HARVEST_HANDLING_NEEDED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'FAO Post-Harvest Management',
    scientific_basis: 'Perishables require pre-cooling within 2 hours of harvest. Field heat removal extends shelf life by 50-100%.',
    icar_package: 'Cold Chain Management',
  },

  // GRAIN DRYING REQUIRED
  {
    rule_id: 'HARVEST_009',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const moistureContent = num(input.metadata?.grainMoisturePercent);
      const isGrain = [CropGroup.CEREALS, CropGroup.PULSES, CropGroup.OILSEEDS].includes(input.crop_group);
      return isGrain && moistureContent > 14;
    },
    cause: Cause.GRAIN_DRYING_REQUIRED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Safe Grain Storage Guidelines',
    scientific_basis: 'Safe storage moisture <14% for grains. Higher moisture causes fungal growth, heating, quality loss. Sun dry or use dryers.',
    icar_package: 'ICAR Grain Storage Manual',
  },

  // STORAGE PEST PREVENTION
  {
    rule_id: 'HARVEST_010',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const storagePlanned = bool(input.metadata?.storagePlanned);
      const noTreatment = !bool(input.metadata?.storageTreatmentDone);
      const isGrain = [CropGroup.CEREALS, CropGroup.PULSES].includes(input.crop_group);
      return storagePlanned && noTreatment && isGrain;
    },
    cause: Cause.STORAGE_PEST_PREVENTION_NEEDED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Stored Grain Pest Management',
    scientific_basis: 'Stored grain pests (weevil, borer) cause 10-30% loss. Treat with approved storage pesticides or hermetic storage.',
    icar_package: 'ICAR Stored Grain Pest Control',
  },

  // BRIX/SUGAR CONTENT CHECK (SUGARCANE)
  {
    rule_id: 'HARVEST_011',
    category: 'harvest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const brix = num(input.metadata?.brixReading);
      return brix < 18;
    },
    cause: Cause.SUGARCANE_BRIX_LOW,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Sugar Mill Quality Standards',
    scientific_basis: 'Sugarcane optimal brix 18-20%. Below 18% = immature cane, lower recovery, price penalty from mill.',
    icar_package: 'ICAR-SBI Sugarcane Harvest Guide',
  },

  // FRUIT SPECIFIC GRAVITY TEST
  {
    rule_id: 'HARVEST_012',
    category: 'harvest',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const isFruit = input.crop_group === CropGroup.FRUITS;
      const specificGravity = num(input.metadata?.specificGravity, 1.0);
      // Mango floats (SG < 1.0) when mature
      return isFruit && input.crop_code === 'mango' && specificGravity >= 1.0;
    },
    cause: Cause.FRUIT_NOT_MATURE_SG_TEST,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'Fruit Maturity Testing',
    scientific_basis: 'Mango specific gravity <1.0 (floats in water) indicates maturity. Harvesting immature fruit = poor quality, no ripening.',
    icar_package: 'Mango Maturity Assessment',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function getMaturityIndicators(cropCode: string): MaturityIndicator | undefined {
  return MATURITY_INDICATORS.find(m => m.crop.toLowerCase() === cropCode.toLowerCase());
}

export function getOptimalHarvestTime(cropGroup: string): { optimal: string; reason: string } {
  const groups: Record<string, keyof typeof HARVEST_TIME_OF_DAY> = {
    vegetables: 'vegetables',
    fruits: 'fruits',
    cereals: 'grains',
    pulses: 'grains',
    oilseeds: 'grains',
    flowers: 'flowers',
  };
  
  const key = groups[cropGroup.toLowerCase()] || 'grains';
  return HARVEST_TIME_OF_DAY[key];
}

export function calculateDaysToHarvest(
  maturityPercent: number,
  dailyMaturityRate: number = 3
): number {
  if (maturityPercent >= 90) return 0;
  const remaining = 90 - maturityPercent;
  return Math.ceil(remaining / dailyMaturityRate);
}

export function getHarvestDecision(
  maturityPercent: number,
  rainForecast: boolean,
  pestPressure: boolean
): { action: string; urgency: 'IMMEDIATE' | 'SOON' | 'WAIT' | 'MONITOR'; reason: string } {
  if (maturityPercent >= 90 && rainForecast) {
    return { action: 'Harvest immediately', urgency: 'IMMEDIATE', reason: 'Rain forecast with mature crop' };
  }
  if (maturityPercent >= 95 && pestPressure) {
    return { action: 'Harvest within 24 hours', urgency: 'IMMEDIATE', reason: 'Pest pressure on mature crop' };
  }
  if (maturityPercent >= 90) {
    return { action: 'Harvest within 3-5 days', urgency: 'SOON', reason: 'Crop at optimal maturity' };
  }
  if (maturityPercent >= 80) {
    return { action: 'Prepare for harvest', urgency: 'WAIT', reason: 'Approaching maturity' };
  }
  return { action: 'Continue monitoring', urgency: 'MONITOR', reason: 'Not yet mature' };
}

export default HARVEST_QUALITY_RULES;
