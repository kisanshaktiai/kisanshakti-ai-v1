/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WATER MANAGEMENT RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3 (Crop Stage Requirements) to P6 (Optimization)
 * Based on: FAO-56 Crop Evapotranspiration, ICAR-AICRP on Water Management
 * 
 * Scientific References:
 * - Allen et al. 1998 - FAO-56 Crop Evapotranspiration
 * - Doorenbos & Kassam 1979 - Yield response to water
 * - INCID (Indian National Committee on Irrigation and Drainage)
 * - Postel et al. 2001 - Drip irrigation for small farmers
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  CropStage,
  SoilMoistureState,
  SoilTexture,
  IrrigationMethod,
  DecisionInput 
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SAFE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function num(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  return defaultValue;
}

function str(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') return value;
  return defaultValue;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true';
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP WATER REQUIREMENTS DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export interface CropWaterRequirement {
  crop: string;
  totalSeasonal: string;
  criticalStages: { stage: string; sensitivity: string; yieldReduction: string }[];
  irrigationSchedule: { method: string; frequency: string; depth: string }[];
}

export const CROP_WATER_REQUIREMENTS: CropWaterRequirement[] = [
  {
    crop: 'cotton',
    totalSeasonal: '650-900 mm',
    criticalStages: [
      { stage: 'Flowering', sensitivity: 'HIGH', yieldReduction: '40%' },
      { stage: 'Boll Formation', sensitivity: 'CRITICAL', yieldReduction: '50%' },
    ],
    irrigationSchedule: [
      { method: 'drip', frequency: 'Daily/alternate day', depth: '3-4 mm/day' },
      { method: 'furrow', frequency: '10-12 irrigations', depth: 'IW/CPE ratio 0.75' },
    ],
  },
  {
    crop: 'tomato',
    totalSeasonal: '600-800 mm',
    criticalStages: [
      { stage: 'Fruit Set', sensitivity: 'MAXIMUM', yieldReduction: '50%' },
      { stage: 'Fruit Development', sensitivity: 'HIGH', yieldReduction: '30%' },
    ],
    irrigationSchedule: [
      { method: 'drip', frequency: 'Daily', depth: '4-5 mm/day' },
    ],
  },
  {
    crop: 'rice',
    totalSeasonal: '1200-1500 mm',
    criticalStages: [
      { stage: 'Active Tillering', sensitivity: 'HIGH', yieldReduction: '30%' },
      { stage: 'Flowering', sensitivity: 'CRITICAL', yieldReduction: '50%' },
    ],
    irrigationSchedule: [
      { method: 'flood', frequency: 'Continuous', depth: '5-10 cm standing water' },
    ],
  },
  {
    crop: 'wheat',
    totalSeasonal: '350-500 mm',
    criticalStages: [
      { stage: 'Crown Root (21-25 DAS)', sensitivity: 'CRITICAL', yieldReduction: '35%' },
      { stage: 'Flowering (60-65 DAS)', sensitivity: 'CRITICAL', yieldReduction: '40%' },
      { stage: 'Grain Filling (85-90 DAS)', sensitivity: 'HIGH', yieldReduction: '25%' },
    ],
    irrigationSchedule: [
      { method: 'furrow', frequency: '4-6 irrigations', depth: '5-7 cm per irrigation' },
    ],
  },
  {
    crop: 'sugarcane',
    totalSeasonal: '1500-2500 mm',
    criticalStages: [
      { stage: 'Tillering (35-100 DAP)', sensitivity: 'HIGH', yieldReduction: '35%' },
      { stage: 'Grand Growth (100-270 DAP)', sensitivity: 'CRITICAL', yieldReduction: '50%' },
    ],
    irrigationSchedule: [
      { method: 'drip', frequency: 'Daily', depth: '6-8 mm/day' },
      { method: 'furrow', frequency: '20-30 irrigations', depth: '7-10 cm per irrigation' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// IRRIGATION METHOD EFFICIENCY DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface IrrigationMethodData {
  method: IrrigationMethod;
  efficiency: string;
  waterUse: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
  suitableFor: string[];
  advantages: string[];
  disadvantages: string[];
  restrictions?: string[];
}

export const IRRIGATION_METHODS: IrrigationMethodData[] = [
  {
    method: IrrigationMethod.FLOOD,
    efficiency: '40-60%',
    waterUse: 'VERY_HIGH',
    suitableFor: ['Rice', 'Level land'],
    advantages: ['Low cost', 'Simple'],
    disadvantages: ['High water waste', 'Weed growth', 'Nutrient leaching'],
  },
  {
    method: IrrigationMethod.FURROW,
    efficiency: '60-70%',
    waterUse: 'HIGH',
    suitableFor: ['Row crops - Cotton, Vegetables', 'Sloping land'],
    advantages: ['Moderate cost', 'Good drainage'],
    disadvantages: ['Uneven distribution', 'Labor intensive'],
  },
  {
    method: IrrigationMethod.SPRINKLER,
    efficiency: '70-80%',
    waterUse: 'MEDIUM',
    suitableFor: ['Field crops', 'Undulating terrain'],
    advantages: ['Even distribution', 'Can apply with fertilizer'],
    disadvantages: ['High initial cost', 'Wind drift', 'Energy intensive'],
    restrictions: ['Avoid during flowering (flower drop)', 'Not suitable in windy areas'],
  },
  {
    method: IrrigationMethod.DRIP,
    efficiency: '85-95%',
    waterUse: 'LOW',
    suitableFor: ['High value crops', 'Water scarce areas', 'Tomato', 'Capsicum', 'Grapes', 'Pomegranate'],
    advantages: ['Maximum efficiency', 'Fertigation possible', 'Weed reduction'],
    disadvantages: ['High initial cost', 'Clogging risk', 'Maintenance required'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SOIL MOISTURE TRIGGER THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

export interface SoilMoistureTrigger {
  soilTexture: SoilTexture;
  irrigateAt: string;
  reason: string;
}

export const SOIL_MOISTURE_TRIGGERS: SoilMoistureTrigger[] = [
  { soilTexture: SoilTexture.SANDY, irrigateAt: '70% field capacity', reason: 'Low water holding capacity, rapid drainage' },
  { soilTexture: SoilTexture.SANDY_LOAM, irrigateAt: '60-70% field capacity', reason: 'Moderate water holding' },
  { soilTexture: SoilTexture.LOAMY, irrigateAt: '50-60% field capacity', reason: 'Optimal water holding, ideal for most crops' },
  { soilTexture: SoilTexture.CLAY_LOAM, irrigateAt: '45-55% field capacity', reason: 'High water holding, slower drainage' },
  { soilTexture: SoilTexture.CLAY, irrigateAt: '40-50% field capacity', reason: 'Very high water holding, avoid waterlogging' },
];

// ═══════════════════════════════════════════════════════════════════════════
// WATER MANAGEMENT RULES
// ═══════════════════════════════════════════════════════════════════════════

export const WATER_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // CRITICAL STAGE IRRIGATION RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_001',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const isReproductive = input.crop_stage === CropStage.REPRODUCTIVE;
      const noRainExpected = input.weather_state !== 'RAIN_EXPECTED' && input.weather_state !== 'RAIN_ACTIVE';
      return moisture === SoilMoistureState.DRY && isReproductive && noRainExpected;
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR Critical Irrigation Stages',
    scientific_basis: 'Water stress at reproductive stage causes irreversible yield loss of 30-50%. Emergency irrigation mandatory.',
    icar_package: 'ICAR Critical Irrigation Guidelines',
  },
  
  {
    rule_id: 'WATER_002',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const isVegetative = input.crop_stage === CropStage.VEGETATIVE;
      const noRainExpected = input.weather_state !== 'RAIN_EXPECTED' && input.weather_state !== 'RAIN_ACTIVE';
      return moisture === SoilMoistureState.DRY && isVegetative && noRainExpected;
    },
    cause: Cause.WATER_STRESS_MODERATE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'FAO Irrigation Guide',
    scientific_basis: 'Water stress during vegetative stage reduces growth and delays flowering. Irrigation recommended within 24-48 hours.',
    icar_package: 'FAO-56 Crop Water Requirements',
  },
  
  {
    rule_id: 'WATER_003',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const das = num(input.metadata?.daysAfterSowing);
      const isWheat = str(input.crop_code).toLowerCase().includes('wheat');
      // Crown root irrigation critical window: 21-25 DAS
      return isWheat && moisture === SoilMoistureState.DRY && das >= 21 && das <= 28;
    },
    cause: Cause.WATER_STRESS_WHEAT_CRI,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR-IARI Wheat Package',
    scientific_basis: 'Crown root initiation (21-25 DAS) is the most critical irrigation stage for wheat. Stress causes 35% yield loss.',
    icar_package: 'ICAR-IARI Wheat Critical Irrigations',
  },
  
  {
    rule_id: 'WATER_004',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.SOWING],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const isRice = str(input.crop_code).toLowerCase().includes('rice');
      const isTransplanting = input.crop_stage === CropStage.SOWING;
      return isRice && isTransplanting && moisture !== SoilMoistureState.WATERLOGGED;
    },
    cause: Cause.WATER_STRESS_RICE_TRANSPLANTING,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR-CRRI Rice Package',
    scientific_basis: 'Rice requires standing water (2-5 cm) during transplanting for seedling establishment. Maintain water for 7 days post-transplanting.',
    icar_package: 'ICAR-CRRI Water Management in Rice',
  },
  
  {
    rule_id: 'WATER_005',
    category: 'water',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const isCotton = str(input.crop_code).toLowerCase().includes('cotton');
      const das = num(input.metadata?.daysAfterSowing);
      // Boll development critical period: 75-110 DAS
      return isCotton && moisture === SoilMoistureState.DRY && das >= 75 && das <= 120;
    },
    cause: Cause.WATER_STRESS_COTTON_BOLL,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR-CICR Cotton Package',
    scientific_basis: 'Water stress during boll development (75-110 DAS) causes 50% yield loss. Maintain adequate moisture for boll filling.',
    icar_package: 'ICAR-CICR Cotton Water Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // WATERLOGGING RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_006',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const isNotRice = !str(input.crop_code).toLowerCase().includes('rice');
      return moisture === SoilMoistureState.WATERLOGGED && isNotRice;
    },
    cause: Cause.WATERLOGGING,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'FAO Drainage Guide',
    scientific_basis: 'Waterlogging causes root asphyxiation within 24-48 hours. Drain excess water immediately to prevent root rot.',
    icar_package: 'ICAR Drainage Management',
  },
  
  {
    rule_id: 'WATER_007',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const isRaining = input.weather_state === 'RAIN_ACTIVE';
      const isNotRice = !str(input.crop_code).toLowerCase().includes('rice');
      return moisture === SoilMoistureState.WATERLOGGED && isRaining && isNotRice;
    },
    cause: Cause.WATERLOGGING_SEVERE,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'FAO Drainage Guide',
    scientific_basis: 'Active rain with waterlogged soil requires emergency drainage within hours to prevent crop loss.',
    icar_package: 'ICAR Emergency Drainage Protocol',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // DROUGHT STRESS RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_008',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const ndviCritical = input.ndvi_state === 'CRITICAL';
      const drySpell = input.weather_state === 'DRY_SPELL';
      const declining = input.ndvi_trend === 'DECLINING';
      return ndviCritical && drySpell && declining;
    },
    cause: Cause.DROUGHT_STRESS,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR-CRIDA Drought Management',
    scientific_basis: 'Prolonged dry spell with critical NDVI and declining trend indicates severe drought stress. Consider salvage harvest if recovery unlikely.',
    icar_package: 'ICAR-CRIDA Contingency Planning',
  },
  
  {
    rule_id: 'WATER_009',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const drySpell = input.weather_state === 'DRY_SPELL';
      const rainfallDeficit = num(input.metadata?.rainfallDeficitPercent) > 50;
      return drySpell && rainfallDeficit;
    },
    cause: Cause.DROUGHT_EMERGENCY,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR-CRIDA Drought Protocol',
    scientific_basis: 'Rainfall deficit >50% of normal indicates drought conditions. Implement contingency measures: life-saving irrigation, mulching, anti-transpirants.',
    icar_package: 'ICAR-CRIDA Drought Mitigation',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // SOIL TEXTURE-BASED IRRIGATION SCHEDULING
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_010',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const soilTexture = input.metadata?.soilTexture;
      const moisture = input.soil_states?.moisture;
      const fieldCapacity = num(input.metadata?.fieldCapacityPercent, 50);
      
      // Sandy soils need irrigation at 70% FC
      return soilTexture === SoilTexture.SANDY && 
             moisture === SoilMoistureState.DRY && 
             fieldCapacity < 70;
    },
    cause: Cause.WATER_STRESS_MILD,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'FAO Soil Water Management',
    scientific_basis: 'Sandy soils have low water holding capacity. Irrigate more frequently with smaller doses to prevent deep drainage loss.',
    icar_package: 'ICAR Soil-Based Irrigation Scheduling',
  },
  
  {
    rule_id: 'WATER_011',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const soilTexture = input.metadata?.soilTexture;
      const moisture = input.soil_states?.moisture;
      
      // Clay soils - avoid over-irrigation
      return soilTexture === SoilTexture.CLAY && 
             moisture === SoilMoistureState.OPTIMAL;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'FAO Soil Water Management',
    scientific_basis: 'Clay soils have high water holding capacity. Avoid over-irrigation to prevent waterlogging and poor aeration.',
    icar_package: 'ICAR Clay Soil Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // IRRIGATION METHOD RECOMMENDATIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_012',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const waterScarcity = bool(input.metadata?.waterScarcity);
      const currentMethod = input.metadata?.irrigationMethod;
      const isHighValueCrop = bool(input.metadata?.highValueCrop);
      
      return waterScarcity && currentMethod !== IrrigationMethod.DRIP && isHighValueCrop;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'Postel et al. 2001 - Drip irrigation for small farmers',
    scientific_basis: 'Drip irrigation achieves 85-95% efficiency vs 40-60% for flood. ROI payback in 2-3 years for high value crops.',
    icar_package: 'INCID Drip Irrigation Promotion',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // WEATHER-BASED IRRIGATION DECISIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_013',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const rainExpected = input.weather_state === 'RAIN_EXPECTED';
      const rainProbability = num(input.weather?.rain_probability);
      
      return moisture === SoilMoistureState.DRY && rainExpected && rainProbability > 60;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'FAO Weather-Based Irrigation',
    scientific_basis: 'Skip irrigation if rain probability >60% within 48 hours. Saves water and labor costs.',
    icar_package: 'ICAR Weather-Based Irrigation Advisory',
  },
  
  {
    rule_id: 'WATER_014',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const rainProbability = num(input.weather?.rain_probability);
      const isCriticalStage = input.crop_stage === CropStage.REPRODUCTIVE;
      
      return moisture === SoilMoistureState.DRY && rainProbability < 30 && isCriticalStage;
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Critical Irrigation',
    scientific_basis: 'At critical stage with low rain probability (<30%), irrigate within 24 hours to prevent yield loss.',
    icar_package: 'ICAR Critical Stage Irrigation',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HEAT STRESS IRRIGATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_015',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const heatStress = input.weather_state === 'HEAT_STRESS';
      const temp = num(input.weather?.temperature);
      return heatStress || temp > 40;
    },
    cause: Cause.HEAT_STRESS,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Heat Stress Management',
    scientific_basis: 'Heat wave (>40°C for >3 days) requires increased irrigation frequency and light afternoon irrigation for cooling effect.',
    icar_package: 'ICAR Heat Wave Response Protocol',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // FLOOD DAMAGE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WATER_016',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const moisture = input.soil_states?.moisture;
      const submergenceDays = num(input.metadata?.submergenceDays);
      const isNotRice = !str(input.crop_code).toLowerCase().includes('rice');
      
      return moisture === SoilMoistureState.WATERLOGGED && submergenceDays > 2 && isNotRice;
    },
    cause: Cause.FLOOD_EMERGENCY,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR Flood Management',
    scientific_basis: 'Submergence >48 hours causes permanent root damage. Emergency drainage + post-flood disease prevention (copper spray) + nitrogen top dress (leaching loss).',
    icar_package: 'ICAR Flood Damage Recovery Protocol',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get crop water requirements
 */
export function getCropWaterRequirement(cropCode: string): CropWaterRequirement | undefined {
  return CROP_WATER_REQUIREMENTS.find(c => c.crop.toLowerCase() === cropCode.toLowerCase());
}

/**
 * Get irrigation method data
 */
export function getIrrigationMethodData(method: IrrigationMethod): IrrigationMethodData | undefined {
  return IRRIGATION_METHODS.find(m => m.method === method);
}

/**
 * Get soil moisture trigger for soil type
 */
export function getSoilMoistureTrigger(soilTexture: SoilTexture): SoilMoistureTrigger | undefined {
  return SOIL_MOISTURE_TRIGGERS.find(t => t.soilTexture === soilTexture);
}

/**
 * Calculate irrigation decision based on soil moisture and weather
 */
export function calculateIrrigationDecision(
  currentMoisture: number,
  cropStage: CropStage,
  rainForecast48h: number,
  soilTexture: SoilTexture
): { action: string; urgency: 'IMMEDIATE' | 'WITHIN_24H' | 'WITHIN_48H' | 'SKIP'; reason: string } {
  const trigger = getSoilMoistureTrigger(soilTexture);
  const thresholdPercent = trigger ? parseInt(trigger.irrigateAt) : 50;
  
  // Critical stage adjustment
  const adjustedThreshold = cropStage === CropStage.REPRODUCTIVE ? thresholdPercent + 20 : thresholdPercent;
  
  if (currentMoisture < adjustedThreshold) {
    if (rainForecast48h < 10) {
      if (cropStage === CropStage.REPRODUCTIVE) {
        return {
          action: 'Irrigate immediately',
          urgency: 'IMMEDIATE',
          reason: 'Critical stage + dry soil + no rain expected',
        };
      }
      return {
        action: 'Irrigate within 24 hours',
        urgency: 'WITHIN_24H',
        reason: 'Soil moisture below threshold, no rain expected',
      };
    } else {
      return {
        action: 'Skip irrigation, rain expected',
        urgency: 'SKIP',
        reason: `Rain forecast: ${rainForecast48h}mm within 48 hours`,
      };
    }
  }
  
  return {
    action: 'No irrigation needed',
    urgency: 'SKIP',
    reason: 'Soil moisture adequate',
  };
}

/**
 * Recommend irrigation method based on conditions
 */
export function recommendIrrigationMethod(
  waterAvailability: 'ABUNDANT' | 'MODERATE' | 'SCARCE',
  cropType: string,
  landSize: number,
  terrain: 'FLAT' | 'SLOPING' | 'UNDULATING'
): { method: IrrigationMethod; reason: string; roi: string } {
  // Rice always needs flood
  if (cropType.toLowerCase().includes('rice')) {
    return {
      method: IrrigationMethod.FLOOD,
      reason: 'Rice requires standing water for optimal growth',
      roi: 'Standard practice',
    };
  }
  
  // Water scarce areas
  if (waterAvailability === 'SCARCE') {
    return {
      method: IrrigationMethod.DRIP,
      reason: 'Maximum water use efficiency (85-95%)',
      roi: 'Payback in 2-3 years for high value crops',
    };
  }
  
  // Undulating terrain
  if (terrain === 'UNDULATING') {
    return {
      method: IrrigationMethod.SPRINKLER,
      reason: 'Even distribution on uneven terrain',
      roi: 'Payback in 3-4 years',
    };
  }
  
  // Small farms with row crops
  if (landSize < 5) {
    return {
      method: IrrigationMethod.FURROW,
      reason: 'Cost-effective for small row crop fields',
      roi: 'Low initial investment',
    };
  }
  
  return {
    method: IrrigationMethod.SPRINKLER,
    reason: 'Balanced efficiency and cost for medium-large farms',
    roi: 'Payback in 3-4 years',
  };
}

export default WATER_RULES;
