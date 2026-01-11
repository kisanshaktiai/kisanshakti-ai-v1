/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WEATHER SAFETY GATE - G5: Block Spray When Weather Unsafe
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Implements Gate G5 from 8-gate architecture:
 * - Block spray recommendations when rain probability > 50%
 * - Block spray when wind speed > 15 km/h
 * - Block spray when temperature > 35°C or < 10°C
 * 
 * CRITICAL: Prevents farmer from wasting money on washed-away pesticides
 * 
 * VERSION: 1.0.0
 */

import type { AuthoritativeLandState } from './authoritative-state-loader.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type WeatherSafetyStatus = 'SAFE' | 'UNSAFE' | 'CAUTION' | 'UNKNOWN';

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
    forecast_hours?: number;
  };
  spray_type?: 'PESTICIDE' | 'FUNGICIDE' | 'HERBICIDE' | 'FOLIAR_FERTILIZER' | 'BIOLOGICAL';
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

const SPRAY_THRESHOLDS = {
  PESTICIDE: {
    max_rain_probability: 40,
    max_wind_speed: 12,
    min_temperature: 15,
    max_temperature: 35
  },
  FUNGICIDE: {
    max_rain_probability: 30, // Fungicides more sensitive to wash-off
    max_wind_speed: 10,
    min_temperature: 12,
    max_temperature: 32
  },
  HERBICIDE: {
    max_rain_probability: 50, // More rain tolerant
    max_wind_speed: 8, // But very drift sensitive
    min_temperature: 10,
    max_temperature: 30
  },
  FOLIAR_FERTILIZER: {
    max_rain_probability: 60,
    max_wind_speed: 15,
    min_temperature: 15,
    max_temperature: 38
  },
  BIOLOGICAL: {
    max_rain_probability: 50,
    max_wind_speed: 15,
    min_temperature: 18, // Biological agents need warmth
    max_temperature: 35
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SAFETY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export function checkWeatherSafety(input: WeatherSafetyInput): WeatherSafetyResult {
  console.log('🌦️ [WeatherSafetyGate] Checking spray safety...');
  
  const sprayType = input.spray_type || 'PESTICIDE';
  const thresholds = SPRAY_THRESHOLDS[sprayType];
  
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
      result.block_reason_mr = '⛈️ पावसाची शक्यता जास्त आहे - आज फवारणी टाळा. औषध वाहून जाईल आणि पैसे वाया जातील.';
      result.block_reason_hi = '⛈️ बारिश की संभावना अधिक है - आज स्प्रे न करें। दवाई बह जाएगी और पैसे बर्बाद होंगे।';
      result.block_reason_en = '⛈️ High rain probability - avoid spraying today. Pesticide will wash off, wasting money.';
      result.alternative_actions.push('Wait for clear weather (next 6-12 hours)');
      result.alternative_actions.push('Check weather forecast before scheduling');
    }
    
    if (blockedReasons.includes('high_wind')) {
      result.block_reason_mr = '💨 वारा जास्त आहे - फवारणी करू नका. औषध शेजारच्या शेतात जाईल.';
      result.block_reason_hi = '💨 हवा तेज है - स्प्रे न करें। दवाई पड़ोसी खेत में चली जाएगी।';
      result.block_reason_en = '💨 Wind too strong - do not spray. Pesticide will drift to neighboring fields.';
      result.alternative_actions.push('Spray early morning when wind is calm');
      result.alternative_actions.push('Wait for wind speed < 10 km/h');
    }
    
    if (blockedReasons.includes('too_hot')) {
      result.block_reason_mr = '🌡️ खूप गरम आहे - संध्याकाळी 5 नंतर फवारणी करा.';
      result.block_reason_hi = '🌡️ बहुत गर्मी है - शाम 5 बजे के बाद स्प्रे करें।';
      result.block_reason_en = '🌡️ Too hot - spray after 5 PM when temperature drops.';
      result.alternative_actions.push('Spray during cooler hours (6-9 AM or 5-7 PM)');
      result.recommended_spray_window = {
        start_time: '17:00',
        end_time: '19:00',
        reason: 'Cooler temperature, better efficacy'
      };
    }
    
    if (blockedReasons.includes('too_cold')) {
      result.block_reason_mr = '❄️ खूप थंड आहे - दुपारी 11-2 वाजता फवारणी करा.';
      result.block_reason_hi = '❄️ बहुत ठंड है - दोपहर 11-2 बजे स्प्रे करें।';
      result.block_reason_en = '❄️ Too cold - spray during warmest hours (11 AM - 2 PM).';
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
  language: 'mr' | 'hi' | 'en'
): string | null {
  const result = checkWeatherSafety({ land_state: landState });
  
  if (result.spray_allowed) return null;
  
  switch (language) {
    case 'mr': return result.block_reason_mr || null;
    case 'hi': return result.block_reason_hi || null;
    default: return result.block_reason_en || null;
  }
}
