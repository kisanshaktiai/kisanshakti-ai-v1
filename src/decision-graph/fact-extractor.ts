/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT EXTRACTOR - Raw Data → Symbolic States
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Converts raw numeric values into symbolic states using ICAR/FAO/NASA thresholds.
 * This is the ONLY place where numeric thresholds are applied.
 * 
 * After this module, all logic operates on SYMBOLS only.
 * 
 * Standards:
 * - NDVI: NASA Earth Observations, ESA Sentinel-2
 * - Soil: ICAR Soil Testing Standards
 * - Weather: IMD/FAO Thresholds
 * 
 * Version: 1.0.0
 */

import {
  SoilNState,
  SoilPState,
  SoilKState,
  SoilPHState,
  SoilMoistureState,
  SoilZincState,
  SoilOCState,
  SoilTexture,
  SoilStates,
  NDVIState,
  NDVITrend,
  WeatherState,
  CropStage,
  CropGroup,
  FarmingMode,
  IrrigationSource,
  IrrigationMethod,
  DataConfidence,
  DecisionInput,
  NDVI_THRESHOLDS,
  NDVI_TREND_THRESHOLDS,
  SOIL_PH_THRESHOLDS,
  SOIL_MOISTURE_THRESHOLDS,
  TEMPERATURE_THRESHOLDS,
  HUMIDITY_THRESHOLDS
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// NPK TARGETS BY CROP - ICAR Standards (kg/ha)
// ═══════════════════════════════════════════════════════════════════════════

interface NPKTarget {
  n: number;
  p: number;
  k: number;
}

const NPK_TARGETS: Record<string, NPKTarget> = {
  wheat: { n: 120, p: 60, k: 40 },
  rice: { n: 120, p: 60, k: 60 },
  cotton: { n: 150, p: 60, k: 60 },
  sugarcane: { n: 250, p: 85, k: 85 },
  soybean: { n: 30, p: 60, k: 30 },
  maize: { n: 120, p: 60, k: 40 },
  groundnut: { n: 25, p: 50, k: 50 },
  tomato: { n: 150, p: 80, k: 80 },
  onion: { n: 110, p: 40, k: 60 },
  potato: { n: 150, p: 100, k: 100 },
  gram: { n: 20, p: 40, k: 20 },
  mustard: { n: 80, p: 40, k: 40 },
  default: { n: 80, p: 40, k: 40 }
};

// ═══════════════════════════════════════════════════════════════════════════
// NDVI STATE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract NDVI state from raw NDVI value
 * Based on NASA/ESA/ICAR scientific thresholds
 * 
 * @param ndviValue - Raw NDVI value (-1 to 1)
 * @returns NDVIState symbol
 */
export function extractNDVIState(ndviValue: number): NDVIState {
  if (ndviValue >= NDVI_THRESHOLDS.EXCELLENT) {
    return NDVIState.EXCELLENT;
  }
  if (ndviValue >= NDVI_THRESHOLDS.HEALTHY) {
    return NDVIState.HEALTHY;
  }
  if (ndviValue >= NDVI_THRESHOLDS.MODERATE) {
    return NDVIState.MODERATE_STRESS;
  }
  if (ndviValue >= NDVI_THRESHOLDS.POOR) {
    return NDVIState.HIGH_STRESS;
  }
  return NDVIState.CRITICAL;
}

/**
 * Extract NDVI trend from daily change rate
 * 
 * @param trendPerDay - NDVI change per day
 * @returns NDVITrend symbol
 */
export function extractNDVITrend(trendPerDay: number): NDVITrend {
  if (trendPerDay > NDVI_TREND_THRESHOLDS.RISING) {
    return NDVITrend.RISING;
  }
  if (trendPerDay < NDVI_TREND_THRESHOLDS.DECLINING) {
    return NDVITrend.DECLINING;
  }
  return NDVITrend.STABLE;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL STATE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract Nitrogen state based on crop requirement
 * Uses ICAR soil testing standards
 * 
 * @param availableN - Available nitrogen in soil (kg/ha)
 * @param cropCode - Crop code for target lookup
 * @returns SoilNState symbol
 */
export function extractSoilNState(availableN: number, cropCode: string): SoilNState {
  const target = NPK_TARGETS[cropCode.toLowerCase()] || NPK_TARGETS.default;
  const ratio = availableN / target.n;

  if (ratio < 0.6) {
    return SoilNState.LOW_N;
  }
  if (ratio > 1.2) {
    return SoilNState.HIGH_N;
  }
  return SoilNState.ADEQUATE_N;
}

/**
 * Extract Phosphorus state based on crop requirement
 * 
 * @param availableP - Available phosphorus in soil (kg/ha)
 * @param cropCode - Crop code for target lookup
 * @returns SoilPState symbol
 */
export function extractSoilPState(availableP: number, cropCode: string): SoilPState {
  const target = NPK_TARGETS[cropCode.toLowerCase()] || NPK_TARGETS.default;
  const ratio = availableP / target.p;

  if (ratio < 0.6) {
    return SoilPState.LOW_P;
  }
  if (ratio > 1.2) {
    return SoilPState.HIGH_P;
  }
  return SoilPState.ADEQUATE_P;
}

/**
 * Extract Potassium state based on crop requirement
 * 
 * @param availableK - Available potassium in soil (kg/ha)
 * @param cropCode - Crop code for target lookup
 * @returns SoilKState symbol
 */
export function extractSoilKState(availableK: number, cropCode: string): SoilKState {
  const target = NPK_TARGETS[cropCode.toLowerCase()] || NPK_TARGETS.default;
  const ratio = availableK / target.k;

  if (ratio < 0.6) {
    return SoilKState.LOW_K;
  }
  if (ratio > 1.2) {
    return SoilKState.HIGH_K;
  }
  return SoilKState.ADEQUATE_K;
}

/**
 * Extract pH state from soil pH value
 * Based on ICAR soil classification
 * 
 * @param pH - Soil pH value (0-14)
 * @returns SoilPHState symbol
 */
export function extractSoilPHState(pH: number): SoilPHState {
  if (pH < SOIL_PH_THRESHOLDS.ACIDIC_MAX) {
    return SoilPHState.ACIDIC;
  }
  if (pH > SOIL_PH_THRESHOLDS.ALKALINE_MIN) {
    return SoilPHState.ALKALINE;
  }
  return SoilPHState.NEUTRAL;
}

/**
 * Extract soil moisture state from field capacity percentage
 * 
 * @param moisturePct - Soil moisture as % of field capacity
 * @returns SoilMoistureState symbol
 */
export function extractSoilMoistureState(moisturePct: number): SoilMoistureState {
  if (moisturePct < SOIL_MOISTURE_THRESHOLDS.DRY_MAX) {
    return SoilMoistureState.DRY;
  }
  if (moisturePct > SOIL_MOISTURE_THRESHOLDS.WATERLOGGED_MIN) {
    return SoilMoistureState.WATERLOGGED;
  }
  return SoilMoistureState.OPTIMAL;
}

/**
 * Extract zinc state from soil zinc content
 * Critical for rice production
 * 
 * @param zincPPM - Zinc content in ppm
 * @returns SoilZincState symbol
 */
export function extractSoilZincState(zincPPM: number): SoilZincState {
  if (zincPPM < 0.6) {
    return SoilZincState.LOW_ZN;
  }
  if (zincPPM > 2.0) {
    return SoilZincState.HIGH_ZN;
  }
  return SoilZincState.ADEQUATE_ZN;
}

/**
 * Extract organic carbon state
 * 
 * @param ocPct - Organic carbon percentage
 * @returns SoilOCState symbol
 */
export function extractSoilOCState(ocPct: number): SoilOCState {
  if (ocPct < 0.5) {
    return SoilOCState.LOW_OC;
  }
  if (ocPct > 0.75) {
    return SoilOCState.HIGH_OC;
  }
  return SoilOCState.MEDIUM_OC;
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL TEXTURE EXTRACTION (STEP 2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract soil texture from sand and clay percentages
 * Based on USDA Soil Texture Triangle / ICAR classification
 * 
 * Texture affects:
 * - Fertilizer retention (sandy = low, clay = high)
 * - Irrigation frequency (sandy = frequent, clay = less frequent)
 * - N/K split recommendations (sandy = more splits)
 * 
 * @param sandPct - Sand percentage (0-100)
 * @param clayPct - Clay percentage (0-100)
 * @returns SoilTexture symbol
 */
export function extractSoilTexture(sandPct: number, clayPct: number): SoilTexture {
  // Simplified USDA texture triangle classification
  // Full triangle has 12 classes; we use 5 for practical field use
  
  // Sandy: >85% sand
  if (sandPct >= 85) {
    return SoilTexture.SANDY;
  }
  
  // Clay: >40% clay
  if (clayPct >= 40) {
    return SoilTexture.CLAY;
  }
  
  // Clay loam: 25-40% clay
  if (clayPct >= 25 && clayPct < 40) {
    return SoilTexture.CLAY_LOAM;
  }
  
  // Sandy loam: 70-85% sand
  if (sandPct >= 70 && sandPct < 85) {
    return SoilTexture.SANDY_LOAM;
  }
  
  // Loamy: balanced texture (default for most soils)
  return SoilTexture.LOAMY;
}

/**
 * Get fertilizer efficiency modifier based on soil texture
 * 
 * Sandy soils have low nutrient retention, requiring:
 * - More frequent, smaller fertilizer applications
 * - Higher total amounts (due to leaching)
 * 
 * Clay soils have high nutrient retention, allowing:
 * - Less frequent applications
 * - Risk of nutrient lockup in dry conditions
 * 
 * @param texture - Soil texture
 * @returns Efficiency modifier (1.0 = standard, <1.0 = reduce, >1.0 = increase)
 */
export function getSoilTextureEfficiencyModifier(texture: SoilTexture): {
  n_modifier: number;
  p_modifier: number;
  k_modifier: number;
  irrigation_frequency_modifier: number;
  split_application_recommended: boolean;
} {
  switch (texture) {
    case SoilTexture.SANDY:
      return {
        n_modifier: 1.25,      // 25% more N needed due to leaching
        p_modifier: 1.10,      // 10% more P
        k_modifier: 1.30,      // 30% more K (highly mobile)
        irrigation_frequency_modifier: 1.5,  // 50% more frequent irrigation
        split_application_recommended: true  // Must split applications
      };
    case SoilTexture.SANDY_LOAM:
      return {
        n_modifier: 1.10,
        p_modifier: 1.05,
        k_modifier: 1.15,
        irrigation_frequency_modifier: 1.2,
        split_application_recommended: true
      };
    case SoilTexture.LOAMY:
      return {
        n_modifier: 1.0,       // Standard recommendations
        p_modifier: 1.0,
        k_modifier: 1.0,
        irrigation_frequency_modifier: 1.0,
        split_application_recommended: false
      };
    case SoilTexture.CLAY_LOAM:
      return {
        n_modifier: 0.95,      // Slightly less needed
        p_modifier: 1.0,
        k_modifier: 0.95,
        irrigation_frequency_modifier: 0.8,
        split_application_recommended: false
      };
    case SoilTexture.CLAY:
      return {
        n_modifier: 0.90,      // 10% less N (better retention)
        p_modifier: 1.0,       // P fixation - standard amount
        k_modifier: 0.85,      // 15% less K (high retention)
        irrigation_frequency_modifier: 0.6,
        split_application_recommended: false
      };
  }
}

/**
 * Extract complete soil states from raw soil data
 * 
 * @param soilData - Raw soil test data
 * @param cropCode - Crop code for NPK targets
 * @returns Complete SoilStates object
 */
export function extractSoilStates(
  soilData: {
    n: number;
    p: number;
    k: number;
    pH: number;
    moisture?: number;
    zinc?: number;
    organicCarbon?: number;
    sandPct?: number;
    clayPct?: number;
  },
  cropCode: string
): SoilStates {
  return {
    n: extractSoilNState(soilData.n, cropCode),
    p: extractSoilPState(soilData.p, cropCode),
    k: extractSoilKState(soilData.k, cropCode),
    ph: extractSoilPHState(soilData.pH),
    moisture: soilData.moisture !== undefined 
      ? extractSoilMoistureState(soilData.moisture) 
      : SoilMoistureState.OPTIMAL,
    zinc: soilData.zinc !== undefined 
      ? extractSoilZincState(soilData.zinc) 
      : undefined,
    organic_carbon: soilData.organicCarbon !== undefined 
      ? extractSoilOCState(soilData.organicCarbon) 
      : undefined,
    // STEP 2: Add soil texture extraction
    texture: (soilData.sandPct !== undefined && soilData.clayPct !== undefined)
      ? extractSoilTexture(soilData.sandPct, soilData.clayPct)
      : undefined
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER STATE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

interface WeatherData {
  temperature: number;
  temperatureMin?: number;
  temperatureMax?: number;
  humidity: number;
  windSpeed?: number;
  rainExpected?: boolean;
  rainActive?: boolean;
  daysSinceRain?: number;
  hailWarning?: boolean;
}

/**
 * Extract weather state from raw weather data
 * Based on IMD/FAO thresholds
 * 
 * Priority order for weather state determination:
 * 1. Active rain
 * 2. Hailstorm warning
 * 3. Frost risk
 * 4. Heat stress
 * 5. Cold stress
 * 6. Strong wind
 * 7. High humidity
 * 8. Dry spell
 * 9. Rain expected
 * 10. Clear
 * 
 * @param weather - Raw weather data
 * @returns WeatherState symbol
 */
export function extractWeatherState(weather: WeatherData): WeatherState {
  const maxTemp = weather.temperatureMax ?? weather.temperature;
  const minTemp = weather.temperatureMin ?? weather.temperature;

  // Priority 1: Active rain
  if (weather.rainActive) {
    return WeatherState.RAIN_ACTIVE;
  }

  // Priority 2: Hailstorm warning
  if (weather.hailWarning) {
    return WeatherState.HAILSTORM_RISK;
  }

  // Priority 3: Frost risk
  if (minTemp < TEMPERATURE_THRESHOLDS.FROST_RISK) {
    return WeatherState.FROST_RISK;
  }

  // Priority 4: Severe heat stress
  if (maxTemp > TEMPERATURE_THRESHOLDS.HEAT_STRESS_SEVERE) {
    return WeatherState.HEAT_STRESS;
  }

  // Priority 5: Cold stress
  if (minTemp < TEMPERATURE_THRESHOLDS.COLD_STRESS) {
    return WeatherState.COLD_STRESS;
  }

  // Priority 6: Heat stress
  if (maxTemp > TEMPERATURE_THRESHOLDS.HEAT_STRESS) {
    return WeatherState.HEAT_STRESS;
  }

  // Priority 7: Strong wind (spray unfavorable)
  if (weather.windSpeed && weather.windSpeed > 25) {
    return WeatherState.STRONG_WIND;
  }

  // Priority 8: High humidity (disease favorable)
  if (weather.humidity > HUMIDITY_THRESHOLDS.HIGH_HUMIDITY) {
    return WeatherState.HIGH_HUMIDITY;
  }

  // Priority 9: Dry spell
  if (weather.daysSinceRain && weather.daysSinceRain >= 7) {
    return WeatherState.DRY_SPELL;
  }

  // Priority 10: Rain expected
  if (weather.rainExpected) {
    return WeatherState.RAIN_EXPECTED;
  }

  // Default: Clear conditions
  return WeatherState.CLEAR;
}

/**
 * Extract weather states for forecast days
 * 
 * @param forecastDays - Array of weather data for each forecast day
 * @returns Array of WeatherState symbols
 */
export function extractWeatherForecast(forecastDays: WeatherData[]): WeatherState[] {
  return forecastDays.map(day => extractWeatherState(day));
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP STAGE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

interface CropStageConfig {
  germination: [number, number];
  vegetative: [number, number];
  reproductive: [number, number];
  maturity: [number, number];
  harvest: [number, number];
}

const CROP_STAGE_DAS: Record<string, CropStageConfig> = {
  wheat: {
    germination: [0, 15],
    vegetative: [15, 75],
    reproductive: [75, 105],
    maturity: [105, 130],
    harvest: [130, 150]
  },
  rice: {
    germination: [0, 15],
    vegetative: [15, 55],
    reproductive: [55, 95],
    maturity: [95, 120],
    harvest: [120, 140]
  },
  cotton: {
    germination: [0, 20],
    vegetative: [20, 60],
    reproductive: [60, 120],
    maturity: [120, 160],
    harvest: [160, 200]
  },
  sugarcane: {
    germination: [0, 35],
    vegetative: [35, 100],
    reproductive: [100, 270],
    maturity: [270, 330],
    harvest: [330, 400]
  },
  tomato: {
    germination: [0, 15],
    vegetative: [15, 40],
    reproductive: [40, 90],
    maturity: [90, 120],
    harvest: [120, 150]
  },
  onion: {
    germination: [0, 15],
    vegetative: [15, 60],
    reproductive: [60, 100],
    maturity: [100, 130],
    harvest: [130, 150]
  },
  default: {
    germination: [0, 15],
    vegetative: [15, 60],
    reproductive: [60, 100],
    maturity: [100, 130],
    harvest: [130, 150]
  }
};

/**
 * Extract crop stage from days after sowing
 * 
 * @param daysAfterSowing - Days since sowing
 * @param cropCode - Crop code for stage lookup
 * @returns CropStage symbol
 */
export function extractCropStage(daysAfterSowing: number, cropCode: string): CropStage {
  const config = CROP_STAGE_DAS[cropCode.toLowerCase()] || CROP_STAGE_DAS.default;

  if (daysAfterSowing < 0) {
    return CropStage.PLANNING;
  }
  if (daysAfterSowing < config.germination[1]) {
    return CropStage.GERMINATION;
  }
  if (daysAfterSowing < config.vegetative[1]) {
    return CropStage.VEGETATIVE;
  }
  if (daysAfterSowing < config.reproductive[1]) {
    return CropStage.REPRODUCTIVE;
  }
  if (daysAfterSowing < config.maturity[1]) {
    return CropStage.MATURITY;
  }
  if (daysAfterSowing < config.harvest[1]) {
    return CropStage.HARVEST;
  }
  return CropStage.POST_HARVEST;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP GROUP MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const CROP_GROUP_MAP: Record<string, CropGroup> = {
  // Cereals
  wheat: CropGroup.CEREALS,
  rice: CropGroup.CEREALS,
  maize: CropGroup.CEREALS,
  barley: CropGroup.CEREALS,
  sorghum: CropGroup.CEREALS,
  bajra: CropGroup.CEREALS,
  ragi: CropGroup.CEREALS,
  oats: CropGroup.CEREALS,

  // Pulses
  gram: CropGroup.PULSES,
  chickpea: CropGroup.PULSES,
  lentil: CropGroup.PULSES,
  masoor: CropGroup.PULSES,
  moong: CropGroup.PULSES,
  mungbean: CropGroup.PULSES,
  urad: CropGroup.PULSES,
  blackgram: CropGroup.PULSES,
  arhar: CropGroup.PULSES,
  pigeonpea: CropGroup.PULSES,
  redgram: CropGroup.PULSES,
  pea: CropGroup.PULSES,

  // Oilseeds
  soybean: CropGroup.OILSEEDS,
  groundnut: CropGroup.OILSEEDS,
  mustard: CropGroup.OILSEEDS,
  rapeseed: CropGroup.OILSEEDS,
  sunflower: CropGroup.OILSEEDS,
  sesame: CropGroup.OILSEEDS,
  til: CropGroup.OILSEEDS,
  safflower: CropGroup.OILSEEDS,
  castor: CropGroup.OILSEEDS,
  linseed: CropGroup.OILSEEDS,

  // Fiber
  cotton: CropGroup.FIBER,
  jute: CropGroup.FIBER,
  mesta: CropGroup.FIBER,
  sunhemp: CropGroup.FIBER,

  // Sugarcane
  sugarcane: CropGroup.SUGARCANE,

  // Vegetables
  tomato: CropGroup.VEGETABLES,
  onion: CropGroup.VEGETABLES,
  potato: CropGroup.VEGETABLES,
  brinjal: CropGroup.VEGETABLES,
  eggplant: CropGroup.VEGETABLES,
  cabbage: CropGroup.VEGETABLES,
  cauliflower: CropGroup.VEGETABLES,
  chilli: CropGroup.VEGETABLES,
  pepper: CropGroup.VEGETABLES,
  capsicum: CropGroup.VEGETABLES,
  okra: CropGroup.VEGETABLES,
  ladyfinger: CropGroup.VEGETABLES,
  cucumber: CropGroup.VEGETABLES,
  bottlegourd: CropGroup.VEGETABLES,
  bittergourd: CropGroup.VEGETABLES,
  pumpkin: CropGroup.VEGETABLES,
  carrot: CropGroup.VEGETABLES,
  radish: CropGroup.VEGETABLES,
  beetroot: CropGroup.VEGETABLES,
  spinach: CropGroup.VEGETABLES,
  coriander: CropGroup.VEGETABLES,
  fenugreek: CropGroup.VEGETABLES,
  garlic: CropGroup.VEGETABLES,
  peas: CropGroup.VEGETABLES,
  beans: CropGroup.VEGETABLES,
  frenchbean: CropGroup.VEGETABLES,

  // Fruits
  mango: CropGroup.FRUITS,
  banana: CropGroup.FRUITS,
  citrus: CropGroup.FRUITS,
  orange: CropGroup.FRUITS,
  mosambi: CropGroup.FRUITS,
  lemon: CropGroup.FRUITS,
  lime: CropGroup.FRUITS,
  grapes: CropGroup.FRUITS,
  pomegranate: CropGroup.FRUITS,
  guava: CropGroup.FRUITS,
  papaya: CropGroup.FRUITS,
  apple: CropGroup.FRUITS,
  watermelon: CropGroup.FRUITS,
  muskmelon: CropGroup.FRUITS,
  sapota: CropGroup.FRUITS,
  custardapple: CropGroup.FRUITS,
  jackfruit: CropGroup.FRUITS,
  pineapple: CropGroup.FRUITS,
  coconut: CropGroup.FRUITS,

  // Spices
  turmeric: CropGroup.SPICES,
  ginger: CropGroup.SPICES,
  cumin: CropGroup.SPICES,
  jeera: CropGroup.SPICES,
  fennel: CropGroup.SPICES,
  saunf: CropGroup.SPICES,
  cardamom: CropGroup.SPICES,
  blackpepper: CropGroup.SPICES,
  clove: CropGroup.SPICES,
  nutmeg: CropGroup.SPICES,
  cinnamon: CropGroup.SPICES,
  ajwain: CropGroup.SPICES,
  fenugreekspice: CropGroup.SPICES,

  // Fodder
  berseem: CropGroup.FODDER,
  lucerne: CropGroup.FODDER,
  alfalfa: CropGroup.FODDER,
  napier: CropGroup.FODDER,
  maizefodder: CropGroup.FODDER,
  jowarfodder: CropGroup.FODDER,
  oatsfodder: CropGroup.FODDER,
  guinea: CropGroup.FODDER,
  para: CropGroup.FODDER
};

/**
 * Get crop group from crop code
 * 
 * @param cropCode - Crop code
 * @returns CropGroup symbol
 */
export function getCropGroup(cropCode: string): CropGroup {
  return CROP_GROUP_MAP[cropCode.toLowerCase()] || CropGroup.VEGETABLES;
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA CONFIDENCE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

interface DataAge {
  soilTestDays?: number;      // Days since last soil test
  ndviDataHours?: number;     // Hours since NDVI update
  weatherForecastHours?: number; // Hours since weather update
}

/**
 * Calculate data confidence based on data age
 * Newer data = higher confidence
 * 
 * @param dataAge - Age of various data sources
 * @returns DataConfidence object
 */
export function calculateDataConfidence(dataAge: DataAge): DataConfidence {
  // Soil confidence (degrades over 90 days)
  let soilConfidence = 1.0;
  if (dataAge.soilTestDays !== undefined) {
    if (dataAge.soilTestDays > 180) {
      soilConfidence = 0.3;
    } else if (dataAge.soilTestDays > 90) {
      soilConfidence = 0.5;
    } else if (dataAge.soilTestDays > 30) {
      soilConfidence = 0.7;
    } else if (dataAge.soilTestDays > 7) {
      soilConfidence = 0.9;
    }
  } else {
    soilConfidence = 0.5; // No soil test data
  }

  // NDVI confidence (degrades over 48 hours)
  let ndviConfidence = 1.0;
  if (dataAge.ndviDataHours !== undefined) {
    if (dataAge.ndviDataHours > 168) { // > 7 days
      ndviConfidence = 0.3;
    } else if (dataAge.ndviDataHours > 72) { // > 3 days
      ndviConfidence = 0.5;
    } else if (dataAge.ndviDataHours > 48) {
      ndviConfidence = 0.7;
    } else if (dataAge.ndviDataHours > 24) {
      ndviConfidence = 0.9;
    }
  } else {
    ndviConfidence = 0.5; // No NDVI data
  }

  // Weather confidence (degrades over 24 hours)
  let weatherConfidence = 1.0;
  if (dataAge.weatherForecastHours !== undefined) {
    if (dataAge.weatherForecastHours > 12) {
      weatherConfidence = 0.7;
    } else if (dataAge.weatherForecastHours > 6) {
      weatherConfidence = 0.85;
    } else if (dataAge.weatherForecastHours > 3) {
      weatherConfidence = 0.95;
    }
  } else {
    weatherConfidence = 0.6; // No recent weather data
  }

  return {
    soil: soilConfidence,
    ndvi: ndviConfidence,
    weather: weatherConfidence
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMING MODE EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract farming mode from string
 * 
 * @param mode - Farming mode string
 * @returns FarmingMode symbol
 */
export function extractFarmingMode(mode?: string): FarmingMode {
  if (!mode) return FarmingMode.CONVENTIONAL;
  
  const normalized = mode.toLowerCase().replace(/[_\s-]/g, '');
  
  if (normalized.includes('organiconly') || normalized === 'organic') {
    return FarmingMode.ORGANIC_ONLY;
  }
  if (normalized.includes('organicfertilizer') || normalized.includes('fertilizer')) {
    return FarmingMode.ORGANIC_FERTILIZER;
  }
  return FarmingMode.CONVENTIONAL;
}

// ═══════════════════════════════════════════════════════════════════════════
// IRRIGATION EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract irrigation source from string
 * 
 * @param source - Irrigation source string
 * @returns IrrigationSource symbol
 */
export function extractIrrigationSource(source?: string): IrrigationSource {
  if (!source) return IrrigationSource.RAINFED;
  
  const normalized = source.toLowerCase();
  
  if (normalized.includes('bore') || normalized.includes('tube') || normalized.includes('ground')) {
    return IrrigationSource.BOREWELL;
  }
  if (normalized.includes('canal') || normalized.includes('surface')) {
    return IrrigationSource.CANAL;
  }
  if (normalized.includes('pond') || normalized.includes('tank')) {
    return IrrigationSource.POND;
  }
  if (normalized.includes('river') || normalized.includes('stream')) {
    return IrrigationSource.RIVER;
  }
  return IrrigationSource.RAINFED;
}

/**
 * Extract irrigation method from string
 * 
 * @param method - Irrigation method string
 * @returns IrrigationMethod symbol
 */
export function extractIrrigationMethod(method?: string): IrrigationMethod {
  if (!method) return IrrigationMethod.RAINFED;
  
  const normalized = method.toLowerCase();
  
  if (normalized.includes('drip')) {
    return IrrigationMethod.DRIP;
  }
  if (normalized.includes('sprinkler') || normalized.includes('spray')) {
    return IrrigationMethod.SPRINKLER;
  }
  if (normalized.includes('furrow')) {
    return IrrigationMethod.FURROW;
  }
  if (normalized.includes('flood') || normalized.includes('surface') || normalized.includes('basin')) {
    return IrrigationMethod.FLOOD;
  }
  return IrrigationMethod.RAINFED;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE DECISION INPUT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

interface RawFarmData {
  // Identity
  farmerId: string;
  landId: string;
  tenantId: string;

  // Crop info
  cropCode: string;
  cropVariety?: string;
  sowingDate: string;
  farmingMode?: string;

  // Raw soil data
  soilN?: number;
  soilP?: number;
  soilK?: number;
  soilPH?: number;
  soilMoisture?: number;
  soilZinc?: number;
  soilOrganicCarbon?: number;

  // Raw NDVI data
  ndviValue?: number;
  ndviTrend?: number;

  // Raw weather data
  temperature?: number;
  temperatureMin?: number;
  temperatureMax?: number;
  humidity?: number;
  windSpeed?: number;
  rainExpected?: boolean;
  rainActive?: boolean;
  daysSinceRain?: number;
  hailWarning?: boolean;

  // Weather forecast (3 days)
  forecastDays?: WeatherData[];

  // Regional info
  agroClimaticZone?: string;
  districtCode?: string;
  stateCode?: string;

  // Irrigation info
  irrigationSource?: string;
  irrigationMethod?: string;
  waterAvailable?: boolean;

  // Cropping system
  previousCrop?: string;
  rotationYear?: number;

  // Data age for confidence calculation
  soilTestDays?: number;
  ndviDataHours?: number;
  weatherForecastHours?: number;

  // Farmer profile
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  costSensitivity?: 'high' | 'medium' | 'low';
}

/**
 * Build complete DecisionInput from raw farm data
 * This is the main entry point for fact extraction
 * 
 * CRITICAL: After this function, all logic operates on SYMBOLS only
 * 
 * @param rawData - Raw farm data from database/API
 * @returns Complete DecisionInput ready for Decision Graph
 */
export function buildDecisionInput(rawData: RawFarmData): DecisionInput {
  const cropCode = rawData.cropCode.toLowerCase();
  const sowingDate = new Date(rawData.sowingDate);
  const today = new Date();
  const daysAfterSowing = Math.floor((today.getTime() - sowingDate.getTime()) / (1000 * 60 * 60 * 24));

  // Extract soil states
  const soilStates = extractSoilStates(
    {
      n: rawData.soilN ?? 80,
      p: rawData.soilP ?? 40,
      k: rawData.soilK ?? 40,
      pH: rawData.soilPH ?? 7.0,
      moisture: rawData.soilMoisture,
      zinc: rawData.soilZinc,
      organicCarbon: rawData.soilOrganicCarbon
    },
    cropCode
  );

  // Extract weather state
  const weatherState = extractWeatherState({
    temperature: rawData.temperature ?? 25,
    temperatureMin: rawData.temperatureMin,
    temperatureMax: rawData.temperatureMax,
    humidity: rawData.humidity ?? 60,
    windSpeed: rawData.windSpeed,
    rainExpected: rawData.rainExpected,
    rainActive: rawData.rainActive,
    daysSinceRain: rawData.daysSinceRain,
    hailWarning: rawData.hailWarning
  });

  // Extract weather forecast
  const weatherForecast = rawData.forecastDays 
    ? extractWeatherForecast(rawData.forecastDays)
    : [weatherState, weatherState, weatherState];

  // Calculate data confidence
  const dataConfidence = calculateDataConfidence({
    soilTestDays: rawData.soilTestDays,
    ndviDataHours: rawData.ndviDataHours,
    weatherForecastHours: rawData.weatherForecastHours
  });

  return {
    // Identity
    farmer_id: rawData.farmerId,
    land_id: rawData.landId,
    tenant_id: rawData.tenantId,

    // Crop context
    crop_code: cropCode,
    crop_group: getCropGroup(cropCode),
    crop_variety: rawData.cropVariety,
    crop_stage: extractCropStage(daysAfterSowing, cropCode),
    sowing_date: rawData.sowingDate,
    days_after_sowing: daysAfterSowing,
    farming_mode: extractFarmingMode(rawData.farmingMode),

    // Symbolic states
    soil_states: soilStates,
    ndvi_state: extractNDVIState(rawData.ndviValue ?? 0.5),
    ndvi_trend: extractNDVITrend(rawData.ndviTrend ?? 0),
    weather_state: weatherState,
    weather_forecast_3day: weatherForecast,

    // Data confidence
    data_confidence: dataConfidence,

    // Regional context
    agro_climatic_zone: rawData.agroClimaticZone,
    district_code: rawData.districtCode,
    state_code: rawData.stateCode,

    // Irrigation context
    irrigation_source: extractIrrigationSource(rawData.irrigationSource),
    irrigation_method: extractIrrigationMethod(rawData.irrigationMethod),
    water_available: rawData.waterAvailable ?? true,

    // Cropping system
    previous_crop: rawData.previousCrop,
    crop_rotation_year: rawData.rotationYear,

    // Farmer profile
    farmer_profile: rawData.riskTolerance || rawData.costSensitivity
      ? {
          risk_tolerance: rawData.riskTolerance ?? 'moderate',
          cost_sensitivity: rawData.costSensitivity ?? 'medium'
        }
      : undefined
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  NPK_TARGETS,
  CROP_STAGE_DAS,
  CROP_GROUP_MAP
};
