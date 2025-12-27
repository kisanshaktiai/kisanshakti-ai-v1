/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEATHER-ACTION COUPLING RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P2 (Weather & Environmental Safety)
 * Based on: FAO Spray Guidelines, ISO 22866:2005, ASABE S572.1
 * 
 * Scientific References:
 * - FAO Spray Application Guidelines
 * - Wauchope 1978 - Pesticide wash-off studies
 * - Butler Ellis 2017 - Temperature effects on pesticide performance
 * - ISO 22866:2005 - Pesticide drift measurement
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  CropStage,
  WeatherState,
  DecisionInput 
} from '../types';

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
// RAIN PROBABILITY DECISION MATRIX
// ═══════════════════════════════════════════════════════════════════════════

export interface RainDecisionMatrix {
  probabilityRange: string;
  status: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'BLOCK';
  action: string;
  considerations: string[];
}

export const RAIN_DECISION_MATRIX: RainDecisionMatrix[] = [
  {
    probabilityRange: '0-20%',
    status: 'SAFE',
    action: 'Proceed with application',
    considerations: ['Normal application conditions'],
  },
  {
    probabilityRange: '20-40%',
    status: 'CAUTION',
    action: 'Monitor forecast, consider rain-fast formulations',
    considerations: ['Use sticker adjuvants', 'Apply in morning if rain expected later'],
  },
  {
    probabilityRange: '40-60%',
    status: 'HIGH_RISK',
    action: 'Delay recommended',
    considerations: ['High risk of wash-off', 'Consider rain-fast formulations only'],
  },
  {
    probabilityRange: '60%+',
    status: 'BLOCK',
    action: 'Wait for weather window',
    considerations: ['Application ineffective', 'Environmental contamination risk'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// TEMPERATURE RESTRICTION DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface TemperatureRestriction {
  product: string;
  maxTemp: number;
  reason: string;
  action: string;
}

export const TEMPERATURE_RESTRICTIONS: TemperatureRestriction[] = [
  { product: 'sulfur', maxTemp: 32, reason: 'Severe phytotoxicity above 32°C', action: 'BLOCK sulfur application' },
  { product: 'oil-based', maxTemp: 30, reason: 'Leaf burn risk', action: 'Avoid oil sprays' },
  { product: 'all-foliar', maxTemp: 35, reason: 'Rapid evaporation, reduced efficacy', action: 'Apply early morning (6-9 AM) or evening (4-7 PM)' },
];

// ═══════════════════════════════════════════════════════════════════════════
// WIND SPEED RESTRICTION DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface WindRestriction {
  speedRange: string;
  status: 'IDEAL' | 'CAUTION' | 'BLOCK';
  action: string;
  adjustments?: string[];
}

export const WIND_RESTRICTIONS: WindRestriction[] = [
  {
    speedRange: '0-10 km/h',
    status: 'IDEAL',
    action: 'Proceed with normal application',
  },
  {
    speedRange: '10-15 km/h',
    status: 'CAUTION',
    action: 'Apply with adjustments',
    adjustments: ['Use larger droplet size nozzles', 'Reduce boom height', 'Consider drift reduction agents', 'Avoid volatile chemicals (2,4-D type)'],
  },
  {
    speedRange: '>15 km/h',
    status: 'BLOCK',
    action: 'Wait for wind to subside below 10 km/h',
    adjustments: ['Unacceptable drift risk', 'Environmental contamination', 'Neighboring crop damage'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// OPTIMAL APPLICATION WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplicationWindow {
  season: 'summer' | 'winter';
  optimal: string;
  avoid: string;
  reason: string;
}

export const APPLICATION_WINDOWS: ApplicationWindow[] = [
  { season: 'summer', optimal: '6-9 AM or 5-7 PM', avoid: '11 AM - 4 PM', reason: 'Avoid hot midday temperatures' },
  { season: 'winter', optimal: '10 AM - 3 PM', avoid: 'Early morning (dew), late evening (cold)', reason: 'Warmer temperatures during day for better uptake' },
];

// ═══════════════════════════════════════════════════════════════════════════
// WEATHER-ACTION COUPLING RULES
// ═══════════════════════════════════════════════════════════════════════════

export const WEATHER_ACTION_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // RAIN FORECAST RESTRICTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_001',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const rainProbability = num(input.weather?.rain_probability);
      const sprayPlanned = bool(input.metadata?.contactPesticideSprayPlanned);
      // Contact pesticides need 6 hours rain-free
      return sprayPlanned && rainProbability > 60;
    },
    cause: Cause.RAIN_FORECAST_SPRAY_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Spray Application Guidelines, Wauchope 1978',
    scientific_basis: 'Contact pesticides require 6 hours rain-free period for adhesion and efficacy. Rain within 6h causes >80% wash-off.',
    icar_package: 'ICAR Pesticide Application Manual',
  },
  
  {
    rule_id: 'WEATHER_002',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const rainProbability = num(input.weather?.rain_probability);
      const sprayPlanned = bool(input.metadata?.systemicPesticideSprayPlanned);
      // Systemic pesticides need 2-4 hours rain-free
      return sprayPlanned && rainProbability > 60;
    },
    cause: Cause.RAIN_FORECAST_SPRAY_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Spray Application Guidelines',
    scientific_basis: 'Systemic pesticides require 2-4 hours for cuticular penetration. Rain within 4h causes significant loss.',
    icar_package: 'ICAR Pesticide Application Manual',
  },
  
  {
    rule_id: 'WEATHER_003',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const rainProbability = num(input.weather?.rain_probability);
      // Moderate risk zone
      return rainProbability >= 40 && rainProbability < 60;
    },
    cause: Cause.RAIN_FORECAST_SPRAY_BLOCK,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'FAO Spray Application Guidelines',
    scientific_basis: 'Rain probability 40-60% creates high wash-off risk. Delay application or use rain-fast formulations with sticker adjuvants.',
    icar_package: 'ICAR Weather-Based Spraying',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // TEMPERATURE RESTRICTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_004',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const temp = num(input.weather?.temperature);
      const sulfurPlanned = bool(input.metadata?.sulfurApplicationPlanned);
      return sulfurPlanned && temp > 32;
    },
    cause: Cause.SULFUR_TEMP_BLOCK,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'Phytotoxicity Guidelines, ICAR',
    scientific_basis: 'Sulfur causes severe phytotoxicity (leaf burn, necrosis) above 32°C. Use non-sulfur fungicide alternatives.',
    icar_package: 'ICAR Package of Practices',
  },
  
  {
    rule_id: 'WEATHER_005',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const temp = num(input.weather?.temperature);
      const oilSprayPlanned = bool(input.metadata?.oilBasedSprayPlanned);
      return oilSprayPlanned && temp > 30;
    },
    cause: Cause.OIL_SPRAY_TEMP_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'Oil Spray Guidelines',
    scientific_basis: 'Oil-based sprays (neem oil, horticultural oils) cause leaf burn above 30°C. Apply only in cool conditions.',
    icar_package: 'ICAR Neem Application Guidelines',
  },
  
  {
    rule_id: 'WEATHER_006',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const temp = num(input.weather?.temperature);
      const currentHour = new Date().getHours();
      const isMidday = currentHour >= 11 && currentHour <= 16;
      return temp > 35 && isMidday;
    },
    cause: Cause.HIGH_TEMP_SPRAY_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'Butler Ellis 2017 - Temperature effects on pesticide performance',
    scientific_basis: 'Temperature >35°C causes rapid spray droplet evaporation, reduced coverage, increased phytotoxicity risk, and applicator heat stress.',
    icar_package: 'ICAR Summer Spray Guidelines',
  },
  
  {
    rule_id: 'WEATHER_007',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const temp = num(input.weather?.temperature);
      return temp < 15;
    },
    cause: Cause.LOW_TEMP_EFFICACY_REDUCED,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'Cold Weather Pesticide Guidelines',
    scientific_basis: 'Temperature <15°C reduces pesticide efficacy: slower insect metabolism, poor systemic uptake. Increase rate by 10-20% or delay.',
    icar_package: 'ICAR Winter Spray Guidelines',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // WIND SPEED RESTRICTIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_008',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const windSpeed = num(input.weather?.wind_speed);
      return windSpeed > 15;
    },
    cause: Cause.HIGH_WIND_SPRAY_BLOCK,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'ISO 22866:2005 - Pesticide drift measurement, ASABE S572.1',
    scientific_basis: 'Wind >15 km/h causes unacceptable spray drift to non-target areas, environmental contamination, neighboring crop damage, and applicator exposure.',
    icar_package: 'ICAR Spray Drift Prevention',
  },
  
  {
    rule_id: 'WEATHER_009',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const windSpeed = num(input.weather?.wind_speed);
      const sensitiveAreaNearby = bool(input.metadata?.sensitiveAreaNearby);
      // Stricter limit near sensitive areas
      return windSpeed > 8 && sensitiveAreaNearby;
    },
    cause: Cause.HIGH_WIND_SPRAY_BLOCK,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'EPA Pesticide Drift Guidelines',
    scientific_basis: 'Near sensitive areas (organic farms, water bodies, residential, bee hives), maximum wind speed is 8 km/h due to drift risk.',
    icar_package: 'ICAR Buffer Zone Guidelines',
  },
  
  {
    rule_id: 'WEATHER_010',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const windSpeed = num(input.weather?.wind_speed);
      const volatileHerbicide = bool(input.metadata?.volatileHerbicidePlanned);
      // Very strict limit for volatile herbicides
      return windSpeed > 5 && volatileHerbicide;
    },
    cause: Cause.HIGH_WIND_SPRAY_BLOCK,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'Volatile Herbicide Guidelines',
    scientific_basis: 'Volatile herbicides (2,4-D, Dicamba) have maximum wind limit of 5 km/h due to high vapor drift risk. Can damage crops over 1 km away.',
    icar_package: 'ICAR Herbicide Drift Prevention',
  },
  
  {
    rule_id: 'WEATHER_011',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const windSpeed = num(input.weather?.wind_speed);
      return windSpeed >= 10 && windSpeed <= 15;
    },
    cause: Cause.HIGH_WIND_SPRAY_BLOCK,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ASABE Spray Nozzle Classification',
    scientific_basis: 'Wind 10-15 km/h requires adjustments: larger droplet nozzles, reduced boom height, drift reduction agents. Avoid volatile chemicals.',
    icar_package: 'ICAR Spray Application Optimization',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // HUMIDITY-BASED RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_012',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const humidity = num(input.weather?.humidity);
      const foliarSprayPlanned = bool(input.metadata?.foliarNutrientSprayPlanned);
      return foliarSprayPlanned && humidity < 40;
    },
    cause: Cause.HIGH_TEMP_SPRAY_BLOCK,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'Foliar Nutrition Guidelines',
    scientific_basis: 'Very low humidity (<40%) causes rapid spray evaporation before leaf absorption. Apply in morning when humidity is higher.',
    icar_package: 'ICAR Foliar Application Guidelines',
  },
  
  {
    rule_id: 'WEATHER_013',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const humidity = num(input.weather?.humidity);
      const beauveriaPlanned = bool(input.metadata?.entomopathoGenSprayPlanned);
      return beauveriaPlanned && humidity < 60;
    },
    cause: Cause.LOW_TEMP_EFFICACY_REDUCED,
    priority: PriorityLevel.P5_IPM,
    scientific_source: 'Entomopathogen Application Guidelines',
    scientific_basis: 'Beauveria bassiana and other entomopathogens require high humidity (>60%) for spore germination. Apply during humid periods.',
    icar_package: 'ICAR Biological Control Application',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // COMBINED WEATHER CONDITIONS
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_014',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const temp = num(input.weather?.temperature);
      const humidity = num(input.weather?.humidity);
      const windSpeed = num(input.weather?.wind_speed);
      
      // Optimal spray conditions
      const optimalTemp = temp >= 20 && temp <= 30;
      const optimalHumidity = humidity >= 50 && humidity <= 80;
      const optimalWind = windSpeed < 10;
      
      return optimalTemp && optimalHumidity && optimalWind;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'FAO Optimal Spray Conditions',
    scientific_basis: 'Optimal spray conditions: 20-30°C, 50-80% humidity, <10 km/h wind. Maximum efficacy and coverage.',
    icar_package: 'ICAR Spray Timing Optimization',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // NITROGEN APPLICATION WEATHER RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_015',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const expectedRain = num(input.metadata?.expectedRainfall24h);
      const nitrogenPlanned = bool(input.metadata?.nitrogenApplicationPlanned);
      // Light rain (5-10mm) is optimal for urea dissolution and incorporation
      return nitrogenPlanned && expectedRain >= 5 && expectedRain <= 10;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'FAO Fertilizer Guidelines',
    scientific_basis: 'Light rain (5-10mm) within 24h helps urea dissolution and soil incorporation, reducing volatilization loss.',
    icar_package: 'ICAR Nitrogen Application Timing',
  },
  
  {
    rule_id: 'WEATHER_016',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const expectedRain = num(input.metadata?.expectedRainfall24h);
      const nitrogenPlanned = bool(input.metadata?.nitrogenApplicationPlanned);
      // Heavy rain causes leaching loss
      return nitrogenPlanned && expectedRain > 25;
    },
    cause: Cause.RAIN_FORECAST_SPRAY_BLOCK,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'FAO Fertilizer Guidelines',
    scientific_basis: 'Heavy rain (>25mm) causes significant nitrogen leaching loss. Delay urea application until weather stabilizes.',
    icar_package: 'ICAR Nitrogen Loss Prevention',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // TIME OF DAY OPTIMIZATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'WEATHER_017',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const currentHour = new Date().getHours();
      const temp = num(input.weather?.temperature);
      const isSummer = temp > 30;
      const isOptimalWindow = (currentHour >= 6 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19);
      
      return isSummer && isOptimalWindow;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'Summer Spray Guidelines',
    scientific_basis: 'Summer spray application optimal during 6-9 AM or 5-7 PM. Avoid midday heat for better efficacy and reduced phytotoxicity.',
    icar_package: 'ICAR Seasonal Spray Timing',
  },
  
  {
    rule_id: 'WEATHER_018',
    category: 'weather_safety',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const currentHour = new Date().getHours();
      const temp = num(input.weather?.temperature);
      const isWinter = temp < 20;
      const isOptimalWindow = currentHour >= 10 && currentHour <= 15;
      
      return isWinter && isOptimalWindow;
    },
    cause: Cause.OPTIMAL_GROWTH,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'Winter Spray Guidelines',
    scientific_basis: 'Winter spray application optimal during 10 AM - 3 PM when temperatures are warmer for better uptake and efficacy.',
    icar_package: 'ICAR Seasonal Spray Timing',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get rain decision based on probability
 */
export function getRainDecision(rainProbability: number): RainDecisionMatrix {
  if (rainProbability >= 60) {
    return RAIN_DECISION_MATRIX[3]; // BLOCK
  } else if (rainProbability >= 40) {
    return RAIN_DECISION_MATRIX[2]; // HIGH_RISK
  } else if (rainProbability >= 20) {
    return RAIN_DECISION_MATRIX[1]; // CAUTION
  }
  return RAIN_DECISION_MATRIX[0]; // SAFE
}

/**
 * Get wind restriction based on speed
 */
export function getWindRestriction(windSpeed: number): WindRestriction {
  if (windSpeed > 15) {
    return WIND_RESTRICTIONS[2]; // BLOCK
  } else if (windSpeed >= 10) {
    return WIND_RESTRICTIONS[1]; // CAUTION
  }
  return WIND_RESTRICTIONS[0]; // IDEAL
}

/**
 * Check if temperature is safe for sulfur application
 */
export function isSulfurApplicationSafe(temperature: number): boolean {
  return temperature <= 32;
}

/**
 * Get optimal application window
 */
export function getOptimalApplicationWindow(
  temperature: number,
  isSummer: boolean
): { window: string; avoid: string } {
  if (isSummer || temperature > 30) {
    return { window: '6-9 AM or 5-7 PM', avoid: '11 AM - 4 PM' };
  }
  return { window: '10 AM - 3 PM', avoid: 'Early morning (dew), late evening (cold)' };
}

/**
 * Comprehensive spray condition assessment
 */
export function assessSprayConditions(
  temperature: number,
  humidity: number,
  windSpeed: number,
  rainProbability: number
): {
  overall: 'OPTIMAL' | 'ACCEPTABLE' | 'MARGINAL' | 'UNSUITABLE';
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 0;
  
  // Temperature check
  if (temperature >= 20 && temperature <= 30) {
    score += 25;
  } else if (temperature > 35) {
    issues.push('Temperature too high (>35°C)');
    recommendations.push('Apply in early morning or evening');
  } else if (temperature < 15) {
    issues.push('Temperature too low (<15°C)');
    recommendations.push('Delay until warmer or increase application rate');
  } else {
    score += 15;
  }
  
  // Humidity check
  if (humidity >= 50 && humidity <= 80) {
    score += 25;
  } else if (humidity < 40) {
    issues.push('Humidity too low (<40%)');
    recommendations.push('Apply when humidity is higher');
  } else {
    score += 15;
  }
  
  // Wind check
  if (windSpeed < 10) {
    score += 25;
  } else if (windSpeed > 15) {
    issues.push('Wind speed too high (>15 km/h)');
    recommendations.push('Wait for wind to subside');
  } else {
    issues.push('Wind speed marginal (10-15 km/h)');
    recommendations.push('Use larger droplet nozzles, reduce boom height');
    score += 10;
  }
  
  // Rain check
  if (rainProbability < 20) {
    score += 25;
  } else if (rainProbability > 60) {
    issues.push('Rain probability too high (>60%)');
    recommendations.push('Wait for dry weather window');
  } else {
    issues.push('Rain risk moderate');
    recommendations.push('Use rain-fast formulations with sticker');
    score += 10;
  }
  
  // Determine overall rating
  let overall: 'OPTIMAL' | 'ACCEPTABLE' | 'MARGINAL' | 'UNSUITABLE';
  if (score >= 90) {
    overall = 'OPTIMAL';
  } else if (score >= 70) {
    overall = 'ACCEPTABLE';
  } else if (score >= 50) {
    overall = 'MARGINAL';
  } else {
    overall = 'UNSUITABLE';
  }
  
  return { overall, issues, recommendations };
}

export default WEATHER_ACTION_RULES;
