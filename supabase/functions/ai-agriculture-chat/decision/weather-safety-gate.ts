/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEATHER SAFETY GATE - G5: Block Spray When Weather Unsafe
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Implements Gate G5 from 8-gate architecture:
 * - Block spray recommendations when rain probability > 50%
 * - Block spray when wind speed > 15 km/h
 * - Block spray when temperature > 35°C or < 10°C
 * - NEW: Disease risk assessment for preventive spray recommendations
 * 
 * CRITICAL: Prevents farmer from wasting money on washed-away pesticides
 * 
 * VERSION: 2.1.0 - Thresholds sourced from system_config (M2 DB-SSOT).
 *
 * CHANGE LOG (newest first)
 *   2026-07-24 — P3: SPRAY_THRESHOLDS moved to system_config. Legacy TS map
 *     retained ONLY as cold-boot fallback for cases where the cache has not
 *     yet preloaded (systemConfigReady()===false). Values in the DB were
 *     seeded identical to the legacy map, so behavior is preserved.
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';
import { getConfigJson } from '../utils/db-ssot/system-config-cache.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type WeatherSafetyStatus = 'SAFE' | 'UNSAFE' | 'CAUTION' | 'UNKNOWN';
export type DiseaseRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DiseaseRiskResult {
  level: DiseaseRiskLevel;
  score: number;
  factors: string[];
  spray_urgency: 'NONE' | 'MONITOR' | 'PREVENTIVE' | 'URGENT';
}

export interface WeatherSafetyResult {
  status: WeatherSafetyStatus;
  spray_allowed: boolean;
  
  // Individual checks
  rain_check: {
    passed: boolean;
    rain_probability: number | null;
    threshold: number;
    message: string;
  };
  wind_check: {
    passed: boolean;
    wind_speed: number | null;
    threshold: number;
    message: string;
  };
  temperature_check: {
    passed: boolean;
    temperature: number | null;
    min_threshold: number;
    max_threshold: number;
    message: string;
  };
  
  // NEW: Disease risk assessment
  disease_risk?: DiseaseRiskResult;
  
  // Recommendation
  recommended_spray_window?: {
    start_time: string;
    end_time: string;
    reason: string;
  };
  
  // Messages
  block_reason_mr?: string;
  block_reason_hi?: string;
  block_reason_en?: string;
  
  // Alternative actions
  alternative_actions: string[];
}

export interface WeatherSafetyInput {
  land_state?: AuthoritativeLandState | null;
  weather_data?: {
    rain_probability?: number;
    wind_speed_kmh?: number;
    temperature_c?: number;
    humidity?: number;
    dew_point_c?: number; // NEW: For disease risk calculation
    recent_rainfall_mm?: number; // NEW: 24h rainfall
    forecast_hours?: number;
  };
  spray_type?: 'PESTICIDE' | 'FUNGICIDE' | 'HERBICIDE' | 'FOLIAR_FERTILIZER' | 'BIOLOGICAL';
  include_disease_risk?: boolean; // NEW: Flag to include disease assessment
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY THRESHOLDS — DB-SSOT (system_config), cold-boot legacy fallback
// ───────────────────────────────────────────────────────────────────────────
// Do NOT edit the numbers below. They are cold-boot fallbacks only; the
// authoritative values live in public.system_config rows:
//   spray_max_rain_probability_pct, spray_max_wind_kmh,
//   spray_min_temperature_c,       spray_max_temperature_c.
// Legacy values are byte-identical to the seeded DB rows.
// ═══════════════════════════════════════════════════════════════════════════

type SprayType = 'PESTICIDE' | 'FUNGICIDE' | 'HERBICIDE' | 'FOLIAR_FERTILIZER' | 'BIOLOGICAL';

const _LEGACY_MAX_RAIN: Record<SprayType, number> = {
  PESTICIDE: 40, FUNGICIDE: 30, HERBICIDE: 50, FOLIAR_FERTILIZER: 60, BIOLOGICAL: 50,
};
const _LEGACY_MAX_WIND: Record<SprayType, number> = {
  PESTICIDE: 12, FUNGICIDE: 10, HERBICIDE: 8,  FOLIAR_FERTILIZER: 15, BIOLOGICAL: 15,
};
const _LEGACY_MIN_TEMP: Record<SprayType, number> = {
  PESTICIDE: 15, FUNGICIDE: 12, HERBICIDE: 10, FOLIAR_FERTILIZER: 15, BIOLOGICAL: 18,
};
const _LEGACY_MAX_TEMP: Record<SprayType, number> = {
  PESTICIDE: 35, FUNGICIDE: 32, HERBICIDE: 30, FOLIAR_FERTILIZER: 38, BIOLOGICAL: 35,
};

function resolveSprayThresholds(sprayType: SprayType) {
  const maxRain = getConfigJson('spray_max_rain_probability_pct', _LEGACY_MAX_RAIN);
  const maxWind = getConfigJson('spray_max_wind_kmh',            _LEGACY_MAX_WIND);
  const minTemp = getConfigJson('spray_min_temperature_c',       _LEGACY_MIN_TEMP);
  const maxTemp = getConfigJson('spray_max_temperature_c',       _LEGACY_MAX_TEMP);
  return {
    max_rain_probability: Number((maxRain as any)[sprayType] ?? _LEGACY_MAX_RAIN[sprayType]),
    max_wind_speed:       Number((maxWind as any)[sprayType] ?? _LEGACY_MAX_WIND[sprayType]),
    min_temperature:      Number((minTemp as any)[sprayType] ?? _LEGACY_MIN_TEMP[sprayType]),
    max_temperature:      Number((maxTemp as any)[sprayType] ?? _LEGACY_MAX_TEMP[sprayType]),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE RISK CALCULATION (for preventive spray recommendations)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Dew Point using Magnus-Tetens formula
 */
function calculateDewPoint(tempC: number, humidityPercent: number): number {
  if (humidityPercent <= 0) return tempC - 20;
  if (humidityPercent >= 100) return tempC;
  
  const a = 17.27;
  const b = 237.7;
  const gamma = (a * tempC / (b + tempC)) + Math.log(humidityPercent / 100);
  return Math.round(((b * gamma) / (a - gamma)) * 10) / 10;
}

/**
 * Calculate disease risk based on weather conditions
 * High disease risk may indicate need for preventive fungicide spray
 */
function calculateDiseaseRiskForSpray(
  tempC: number,
  humidityPercent: number,
  dewPointC: number | null,
  recentRainfallMm: number = 0
): DiseaseRiskResult {
  let score = 0;
  const factors: string[] = [];
  
  // Calculate dew point if not provided
  const dew = dewPointC ?? calculateDewPoint(tempC, humidityPercent);
  
  // High humidity favors fungal diseases
  if (humidityPercent > 85) { 
    score += 25; 
    factors.push('HIGH_HUMIDITY'); 
  } else if (humidityPercent > 70) { 
    score += 15; 
    factors.push('MODERATE_HUMIDITY'); 
  }
  
  // Temperature close to dew point = condensation = leaf wetness
  const dewPointProximity = Math.abs(tempC - dew);
  if (dewPointProximity < 2) { 
    score += 30; 
    factors.push('CONDENSATION_LIKELY'); 
  } else if (dewPointProximity < 5) { 
    score += 15; 
    factors.push('CONDENSATION_POSSIBLE'); 
  }
  
  // Optimal disease development temperature (20-28°C for most pathogens)
  if (tempC >= 20 && tempC <= 28) { 
    score += 20; 
    factors.push('OPTIMAL_PATHOGEN_TEMP'); 
  } else if (tempC >= 15 && tempC <= 32) { 
    score += 10; 
    factors.push('FAVORABLE_PATHOGEN_TEMP'); 
  }
  
  // Recent rainfall = wet canopy
  if (recentRainfallMm > 15) { 
    score += 25; 
    factors.push('WET_CANOPY'); 
  } else if (recentRainfallMm > 5) { 
    score += 15; 
    factors.push('DAMP_CONDITIONS'); 
  }
  
  // Determine risk level and spray urgency
  let level: DiseaseRiskLevel;
  let spray_urgency: DiseaseRiskResult['spray_urgency'];
  
  if (score >= 75) {
    level = 'CRITICAL';
    spray_urgency = 'URGENT';
  } else if (score >= 50) {
    level = 'HIGH';
    spray_urgency = 'PREVENTIVE';
  } else if (score >= 25) {
    level = 'MEDIUM';
    spray_urgency = 'MONITOR';
  } else {
    level = 'LOW';
    spray_urgency = 'NONE';
  }
  
  return {
    level,
    score: Math.min(100, score),
    factors,
    spray_urgency
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SAFETY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export function checkWeatherSafety(input: WeatherSafetyInput): WeatherSafetyResult {
  console.log('🌦️ [WeatherSafetyGate] Checking spray safety...');
  
  const sprayType = input.spray_type || 'PESTICIDE';
  const thresholds = resolveSprayThresholds(sprayType);
  
  // Extract weather data from land state or direct input
  const weatherData = input.weather_data || {
    rain_probability: input.land_state?.weather.rain_probability ?? null,
    wind_speed_kmh: input.land_state?.weather.wind_speed ?? null,
    temperature_c: input.land_state?.weather.temperature ?? null,
    humidity: input.land_state?.weather.humidity ?? null
  };
  
  // Initialize result
  const result: WeatherSafetyResult = {
    status: 'UNKNOWN',
    spray_allowed: true,
    rain_check: {
      passed: true,
      rain_probability: weatherData.rain_probability ?? null,
      threshold: thresholds.max_rain_probability,
      message: ''
    },
    wind_check: {
      passed: true,
      wind_speed: weatherData.wind_speed_kmh ?? null,
      threshold: thresholds.max_wind_speed,
      message: ''
    },
    temperature_check: {
      passed: true,
      temperature: weatherData.temperature_c ?? null,
      min_threshold: thresholds.min_temperature,
      max_threshold: thresholds.max_temperature,
      message: ''
    },
    alternative_actions: []
  };
  
  // Check if we have any weather data
  const hasWeatherData = weatherData.rain_probability !== null || 
                         weatherData.wind_speed_kmh !== null || 
                         weatherData.temperature_c !== null;
  
  if (!hasWeatherData) {
    result.status = 'UNKNOWN';
    result.rain_check.message = 'No weather data available';
    result.wind_check.message = 'No weather data available';
    result.temperature_check.message = 'No weather data available';
    result.alternative_actions.push('Check local weather before spraying');
    console.log('   ⚠️ No weather data available');
    return result;
  }
  
  let blockedReasons: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════
  // CHECK 1: Rain Probability
  // ═══════════════════════════════════════════════════════════════════════
  if (weatherData.rain_probability !== null) {
    if (weatherData.rain_probability > thresholds.max_rain_probability) {
      result.rain_check.passed = false;
      result.rain_check.message = `Rain probability ${weatherData.rain_probability}% exceeds safe threshold ${thresholds.max_rain_probability}%`;
      result.spray_allowed = false;
      blockedReasons.push('high_rain');
      console.log(`   ❌ Rain: ${weatherData.rain_probability}% > ${thresholds.max_rain_probability}%`);
    } else if (weatherData.rain_probability > thresholds.max_rain_probability * 0.7) {
      result.rain_check.message = `Rain probability ${weatherData.rain_probability}% - monitor closely`;
      result.status = 'CAUTION';
      console.log(`   ⚠️ Rain: ${weatherData.rain_probability}% (caution)`);
    } else {
      result.rain_check.message = `Rain probability ${weatherData.rain_probability}% - safe to spray`;
      console.log(`   ✅ Rain: ${weatherData.rain_probability}% (safe)`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CHECK 2: Wind Speed
  // ═══════════════════════════════════════════════════════════════════════
  if (weatherData.wind_speed_kmh !== null) {
    if (weatherData.wind_speed_kmh > thresholds.max_wind_speed) {
      result.wind_check.passed = false;
      result.wind_check.message = `Wind speed ${weatherData.wind_speed_kmh} km/h exceeds safe threshold ${thresholds.max_wind_speed} km/h`;
      result.spray_allowed = false;
      blockedReasons.push('high_wind');
      console.log(`   ❌ Wind: ${weatherData.wind_speed_kmh} km/h > ${thresholds.max_wind_speed} km/h`);
    } else if (weatherData.wind_speed_kmh > thresholds.max_wind_speed * 0.7) {
      result.wind_check.message = `Wind speed ${weatherData.wind_speed_kmh} km/h - spray carefully`;
      if (result.status !== 'UNSAFE') result.status = 'CAUTION';
      console.log(`   ⚠️ Wind: ${weatherData.wind_speed_kmh} km/h (caution)`);
    } else {
      result.wind_check.message = `Wind speed ${weatherData.wind_speed_kmh} km/h - safe to spray`;
      console.log(`   ✅ Wind: ${weatherData.wind_speed_kmh} km/h (safe)`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CHECK 3: Temperature
  // ═══════════════════════════════════════════════════════════════════════
  if (weatherData.temperature_c !== null) {
    if (weatherData.temperature_c < thresholds.min_temperature) {
      result.temperature_check.passed = false;
      result.temperature_check.message = `Temperature ${weatherData.temperature_c}°C too cold (min: ${thresholds.min_temperature}°C)`;
      result.spray_allowed = false;
      blockedReasons.push('too_cold');
      console.log(`   ❌ Temp: ${weatherData.temperature_c}°C < ${thresholds.min_temperature}°C`);
    } else if (weatherData.temperature_c > thresholds.max_temperature) {
      result.temperature_check.passed = false;
      result.temperature_check.message = `Temperature ${weatherData.temperature_c}°C too hot (max: ${thresholds.max_temperature}°C)`;
      result.spray_allowed = false;
      blockedReasons.push('too_hot');
      console.log(`   ❌ Temp: ${weatherData.temperature_c}°C > ${thresholds.max_temperature}°C`);
    } else {
      result.temperature_check.message = `Temperature ${weatherData.temperature_c}°C - suitable for spraying`;
      console.log(`   ✅ Temp: ${weatherData.temperature_c}°C (safe)`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // GENERATE RESULT
  // ═══════════════════════════════════════════════════════════════════════
  
  if (!result.spray_allowed) {
    result.status = 'UNSAFE';
    
    // Generate blocking messages
    if (blockedReasons.includes('high_rain')) {
      result.block_reason_en = '⛈️ High rain probability - avoid spraying today. Pesticide will wash off, wasting money.';
      result.block_reason_mr = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.block_reason_hi = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.alternative_actions.push('Wait for clear weather (next 6-12 hours)');
      result.alternative_actions.push('Check weather forecast before scheduling');
    }
    
    if (blockedReasons.includes('high_wind')) {
      result.block_reason_en = '💨 Wind too strong - do not spray. Pesticide will drift to neighboring fields.';
      result.block_reason_mr = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.block_reason_hi = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.alternative_actions.push('Spray early morning when wind is calm');
      result.alternative_actions.push('Wait for wind speed < 10 km/h');
    }
    
    if (blockedReasons.includes('too_hot')) {
      result.block_reason_en = '🌡️ Too hot - spray after 5 PM when temperature drops.';
      result.block_reason_mr = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.block_reason_hi = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.alternative_actions.push('Spray during cooler hours (6-9 AM or 5-7 PM)');
      result.recommended_spray_window = {
        start_time: '17:00',
        end_time: '19:00',
        reason: 'Cooler temperature, better efficacy'
      };
    }
    
    if (blockedReasons.includes('too_cold')) {
      result.block_reason_en = '❄️ Too cold - spray during warmest hours (11 AM - 2 PM).';
      result.block_reason_mr = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.block_reason_hi = result.block_reason_en; // @deprecated - LLM translates at runtime
      result.alternative_actions.push('Spray during warmest part of day');
      result.recommended_spray_window = {
        start_time: '11:00',
        end_time: '14:00',
        reason: 'Warmer temperature, better absorption'
      };
    }
  } else if (result.status === 'CAUTION') {
    result.alternative_actions.push('Monitor conditions and spray quickly');
    result.alternative_actions.push('Have backup plan if weather changes');
  } else {
    result.status = 'SAFE';
    result.alternative_actions.push('Good conditions for spraying');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CHECK 4: Disease Risk Assessment (NEW - for preventive spray recommendations)
  // ═══════════════════════════════════════════════════════════════════════
  if (input.include_disease_risk !== false && weatherData.temperature_c !== null && weatherData.humidity !== null) {
    const diseaseRisk = calculateDiseaseRiskForSpray(
      weatherData.temperature_c,
      weatherData.humidity ?? 65,
      weatherData.dew_point_c ?? null,
      weatherData.recent_rainfall_mm ?? 0
    );
    
    result.disease_risk = diseaseRisk;
    
    console.log(`🦠 [WeatherSafetyGate] Disease Risk: ${diseaseRisk.level} (score: ${diseaseRisk.score}), Factors: ${diseaseRisk.factors.join(', ')}`);
    
    // Add disease-based recommendations
    if (diseaseRisk.level === 'CRITICAL' || diseaseRisk.level === 'HIGH') {
      // Even if weather is unsafe for general spraying, disease pressure may warrant urgent action
      if (diseaseRisk.spray_urgency === 'URGENT') {
        result.alternative_actions.push('🚨 High disease pressure - apply preventive fungicide ASAP when weather permits');
      } else if (diseaseRisk.spray_urgency === 'PREVENTIVE') {
        result.alternative_actions.push('⚠️ Disease risk elevated - consider preventive spray within 24-48 hours');
      }
      
      // If spray is allowed and disease risk is high, recommend urgency
      if (result.spray_allowed && (diseaseRisk.level === 'CRITICAL' || diseaseRisk.level === 'HIGH')) {
        result.recommended_spray_window = {
          start_time: 'ASAP',
          end_time: '24h',
          reason: `Disease risk ${diseaseRisk.level} - ${diseaseRisk.factors.join(', ')}`
        };
      }
    }
  }
  
  console.log(`🌦️ [WeatherSafetyGate] Result: ${result.status}, Spray Allowed: ${result.spray_allowed}`);
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick check if spraying is safe
 */
export function isSpraySafe(landState: AuthoritativeLandState | null): boolean {
  const result = checkWeatherSafety({ land_state: landState });
  return result.spray_allowed;
}

/**
 * Get spray safety message in specified language
 */
export function getSpraySafetyMessage(
  landState: AuthoritativeLandState | null, 
  language: string
): string | null {
  const result = checkWeatherSafety({ land_state: landState });
  
  if (result.spray_allowed) return null;
  
  const messages: Record<string, string | undefined> = {
    mr: result.block_reason_mr,
    hi: result.block_reason_hi,
    en: result.block_reason_en
  };
  return messages[language] || result.block_reason_en || null;
}
