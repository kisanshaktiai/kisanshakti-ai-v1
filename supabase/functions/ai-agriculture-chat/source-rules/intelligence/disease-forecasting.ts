/**
 * ═══════════════════════════════════════════════════════════════════════════
 * P2: DISEASE FORECASTING MODELS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Predictive models for crop diseases:
 * - BLITECAST (Late Blight - Potato/Tomato)
 * - FAST (Forewarning Against Severe Thunder)
 * - Downy Mildew Risk Model
 * - Powdery Mildew Risk Model
 * 
 * Reference: ICAR-CPRI, Penn State University Models
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface WeatherData {
  date: Date;
  temperature_min: number;
  temperature_max: number;
  temperature_avg: number;
  humidity_avg: number;
  humidity_min: number;
  humidity_max: number;
  rainfall_mm: number;
  leaf_wetness_hours?: number;
}

export interface DiseaseForecast {
  disease: string;
  crop: string;
  risk_level: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'EPIDEMIC';
  risk_score: number;  // 0-100
  
  expected_infection_date?: Date;
  days_to_infection: number;
  
  severity_value: number;
  severity_unit: string;
  
  preventive_action: string;
  spray_before_date?: Date;
  
  model_used: string;
  model_confidence: number;
  
  contributing_factors: Array<{
    factor: string;
    value: string;
    impact: 'FAVORABLE' | 'UNFAVORABLE' | 'NEUTRAL';
  }>;
  
  historical_comparison?: {
    same_period_last_year: string;
    avg_outbreak_date: Date;
  };
}

export interface ForecastInput {
  weather_history: WeatherData[];  // Last 10-14 days
  weather_forecast?: WeatherData[];  // Next 7 days
  crop: string;
  variety?: string;
  sowing_date: Date;
  location: {
    lat: number;
    lon: number;
    district?: string;
    state?: string;
  };
  previous_disease_history?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// BLITECAST MODEL (Late Blight - Phytophthora infestans)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * BLITECAST Severity Values based on Wallin's criteria
 * Reference: Wallin, 1962; Krause et al., 1975
 */
const BLITECAST_SEVERITY_TABLE = {
  // Temperature ranges and corresponding hours for each severity value
  // [min_temp, max_temp]: { hours_required_for_sv1, sv2, sv3, sv4 }
  '7.2-11.6': { sv1: 15, sv2: 18, sv3: 21, sv4: 24 },  // 45-53°F
  '11.7-15.0': { sv1: 12, sv2: 15, sv3: 18, sv4: 21 }, // 53-59°F
  '15.1-26.6': { sv1: 9, sv2: 12, sv3: 15, sv4: 18 },  // 59-80°F
} as const;

/**
 * Calculate BLITECAST Late Blight severity value for a day
 */
function calculateDailyBlitecastSV(weather: WeatherData): number {
  const avgTemp = weather.temperature_avg;
  const rh_hours = estimateHighHumidityHours(weather);
  
  let tempRange: string;
  if (avgTemp >= 7.2 && avgTemp <= 11.6) tempRange = '7.2-11.6';
  else if (avgTemp > 11.6 && avgTemp <= 15.0) tempRange = '11.7-15.0';
  else if (avgTemp > 15.0 && avgTemp <= 26.6) tempRange = '15.1-26.6';
  else return 0;  // Outside favorable range
  
  const thresholds = BLITECAST_SEVERITY_TABLE[tempRange];
  
  if (rh_hours >= thresholds.sv4) return 4;
  if (rh_hours >= thresholds.sv3) return 3;
  if (rh_hours >= thresholds.sv2) return 2;
  if (rh_hours >= thresholds.sv1) return 1;
  return 0;
}

/**
 * Estimate hours with RH > 90% (conducive to late blight)
 */
function estimateHighHumidityHours(weather: WeatherData): number {
  if (weather.leaf_wetness_hours) return weather.leaf_wetness_hours;
  
  // Estimate based on humidity and rainfall
  let hours = 0;
  
  if (weather.humidity_avg > 90) hours = 12;
  else if (weather.humidity_avg > 85) hours = 8;
  else if (weather.humidity_avg > 80) hours = 6;
  else if (weather.humidity_avg > 75) hours = 4;
  
  // Rainfall adds to wet hours
  if (weather.rainfall_mm > 10) hours += 6;
  else if (weather.rainfall_mm > 5) hours += 4;
  else if (weather.rainfall_mm > 0) hours += 2;
  
  return Math.min(hours, 24);
}

/**
 * BLITECAST Late Blight Forecast
 */
export function forecastLateBlight(input: ForecastInput): DiseaseForecast {
  if (!['potato', 'tomato'].includes(input.crop.toLowerCase())) {
    throw new Error('BLITECAST only applicable to potato and tomato');
  }
  
  // Calculate cumulative severity value
  let cumulativeSV = 0;
  const contributing_factors: DiseaseForecast['contributing_factors'] = [];
  
  for (const day of input.weather_history) {
    const dailySV = calculateDailyBlitecastSV(day);
    cumulativeSV += dailySV;
    
    if (dailySV > 0) {
      contributing_factors.push({
        factor: `Weather on ${day.date.toLocaleDateString()}`,
        value: `Temp: ${day.temperature_avg.toFixed(1)}°C, Humidity: ${day.humidity_avg}%, SV: ${dailySV}`,
        impact: dailySV >= 3 ? 'FAVORABLE' : 'NEUTRAL'
      });
    }
  }
  
  // Risk thresholds (BLITECAST recommendations)
  let risk_level: DiseaseForecast['risk_level'];
  let days_to_infection: number;
  let preventive_action: string;
  
  if (cumulativeSV >= 30) {
    risk_level = 'EPIDEMIC';
    days_to_infection = 0;
    preventive_action = 'IMMEDIATE spray with Mancozeb + Cymoxanil or Metalaxyl-M. Spray every 5-7 days.';
  } else if (cumulativeSV >= 20) {
    risk_level = 'SEVERE';
    days_to_infection = 2;
    preventive_action = 'Apply preventive fungicide (Mancozeb/Chlorothalonil) within 24-48 hours. Scout daily.';
  } else if (cumulativeSV >= 12) {
    risk_level = 'HIGH';
    days_to_infection = 5;
    preventive_action = 'Apply preventive fungicide within 3-5 days. Monitor weather closely.';
  } else if (cumulativeSV >= 6) {
    risk_level = 'MODERATE';
    days_to_infection = 7;
    preventive_action = 'Monitor field for symptoms. Prepare fungicide. Apply if rain forecast.';
  } else {
    risk_level = 'LOW';
    days_to_infection = 14;
    preventive_action = 'Continue monitoring. No spray needed currently.';
  }
  
  const spray_before_date = new Date();
  spray_before_date.setDate(spray_before_date.getDate() + Math.max(0, days_to_infection - 1));
  
  return {
    disease: 'Late Blight (Phytophthora infestans)',
    crop: input.crop,
    risk_level,
    risk_score: Math.min(100, Math.round(cumulativeSV * 3.3)),
    expected_infection_date: days_to_infection > 0 ? spray_before_date : new Date(),
    days_to_infection,
    severity_value: cumulativeSV,
    severity_unit: 'BLITECAST Severity Value (cumulative)',
    preventive_action,
    spray_before_date,
    model_used: 'BLITECAST (Wallin/Krause)',
    model_confidence: 0.85,
    contributing_factors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOWNY MILDEW MODEL (Grapes, Cucurbits)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Downy Mildew Risk Model based on 10-10-10 rule
 * (10°C minimum temp, 10mm rain, 10 hours wet foliage)
 */
export function forecastDownyMildew(input: ForecastInput): DiseaseForecast {
  let riskScore = 0;
  const contributing_factors: DiseaseForecast['contributing_factors'] = [];
  
  for (const day of input.weather_history.slice(-7)) {  // Last 7 days
    // Check temperature (optimal 18-22°C)
    if (day.temperature_avg >= 15 && day.temperature_avg <= 25) {
      riskScore += 5;
      contributing_factors.push({
        factor: 'Temperature',
        value: `${day.temperature_avg.toFixed(1)}°C (favorable 15-25°C)`,
        impact: 'FAVORABLE'
      });
    }
    
    // Check rainfall
    if (day.rainfall_mm >= 10) {
      riskScore += 10;
      contributing_factors.push({
        factor: 'Rainfall',
        value: `${day.rainfall_mm}mm (≥10mm triggers infection)`,
        impact: 'FAVORABLE'
      });
    }
    
    // Check humidity
    if (day.humidity_avg >= 85) {
      riskScore += 8;
    }
    
    // Check leaf wetness
    const wetHours = estimateHighHumidityHours(day);
    if (wetHours >= 10) {
      riskScore += 10;
      contributing_factors.push({
        factor: 'Leaf Wetness',
        value: `${wetHours} hours (≥10 hours promotes spore germination)`,
        impact: 'FAVORABLE'
      });
    }
  }
  
  let risk_level: DiseaseForecast['risk_level'];
  let days_to_infection: number;
  let preventive_action: string;
  
  if (riskScore >= 80) {
    risk_level = 'SEVERE';
    days_to_infection = 2;
    preventive_action = 'Apply Metalaxyl-M + Mancozeb or Fosetyl-Al immediately. Repeat every 7 days.';
  } else if (riskScore >= 50) {
    risk_level = 'HIGH';
    days_to_infection = 4;
    preventive_action = 'Apply preventive Mancozeb or Copper-based fungicide within 2-3 days.';
  } else if (riskScore >= 30) {
    risk_level = 'MODERATE';
    days_to_infection = 7;
    preventive_action = 'Monitor closely, especially undersides of leaves. Prepare fungicide.';
  } else {
    risk_level = 'LOW';
    days_to_infection = 14;
    preventive_action = 'Continue routine monitoring. Ensure good air circulation.';
  }
  
  return {
    disease: 'Downy Mildew (Peronospora/Plasmopara)',
    crop: input.crop,
    risk_level,
    risk_score: Math.min(100, riskScore),
    days_to_infection,
    severity_value: riskScore,
    severity_unit: 'Downy Mildew Risk Score',
    preventive_action,
    model_used: '10-10-10 Rule Model',
    model_confidence: 0.75,
    contributing_factors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// POWDERY MILDEW MODEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Powdery Mildew Risk Model
 * Optimal conditions: 20-30°C, 50-80% RH, NO rain
 */
export function forecastPowderyMildew(input: ForecastInput): DiseaseForecast {
  let riskScore = 0;
  const contributing_factors: DiseaseForecast['contributing_factors'] = [];
  
  for (const day of input.weather_history.slice(-7)) {
    // Optimal temperature (20-28°C)
    if (day.temperature_avg >= 20 && day.temperature_avg <= 28) {
      riskScore += 10;
      contributing_factors.push({
        factor: 'Temperature',
        value: `${day.temperature_avg.toFixed(1)}°C (optimal 20-28°C)`,
        impact: 'FAVORABLE'
      });
    }
    
    // Moderate humidity (50-80%) - powdery mildew doesn't like wet conditions
    if (day.humidity_avg >= 50 && day.humidity_avg <= 80) {
      riskScore += 8;
    }
    
    // No rain = favorable (rain washes off spores)
    if (day.rainfall_mm === 0) {
      riskScore += 5;
    } else {
      riskScore -= 5;  // Rain reduces risk
    }
    
    // Low moisture favors powdery mildew
    if (day.humidity_avg < 70 && day.rainfall_mm === 0) {
      riskScore += 5;
      contributing_factors.push({
        factor: 'Dry Conditions',
        value: `Low moisture (${day.humidity_avg}% RH, no rain)`,
        impact: 'FAVORABLE'
      });
    }
  }
  
  riskScore = Math.max(0, riskScore);
  
  let risk_level: DiseaseForecast['risk_level'];
  let days_to_infection: number;
  let preventive_action: string;
  
  if (riskScore >= 70) {
    risk_level = 'SEVERE';
    days_to_infection = 3;
    preventive_action = 'Apply Sulphur dust/WP (3g/L) or Myclobutanil/Hexaconazole. Repeat every 10-14 days.';
  } else if (riskScore >= 45) {
    risk_level = 'HIGH';
    days_to_infection = 5;
    preventive_action = 'Apply wettable Sulphur (2-3g/L) as preventive. Ensure good ventilation.';
  } else if (riskScore >= 25) {
    risk_level = 'MODERATE';
    days_to_infection = 10;
    preventive_action = 'Monitor lower leaves for white powdery growth. Prepare Sulphur spray.';
  } else {
    risk_level = 'LOW';
    days_to_infection = 21;
    preventive_action = 'Low risk currently. Maintain good field hygiene.';
  }
  
  return {
    disease: 'Powdery Mildew (Erysiphe/Podosphaera)',
    crop: input.crop,
    risk_level,
    risk_score: Math.min(100, riskScore),
    days_to_infection,
    severity_value: riskScore,
    severity_unit: 'Powdery Mildew Risk Score',
    preventive_action,
    model_used: 'Powdery Mildew Environmental Model',
    model_confidence: 0.72,
    contributing_factors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RUST DISEASE MODEL (Wheat, Sugarcane)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rust Disease Forecast (Yellow/Brown/Black Rust)
 */
export function forecastRust(input: ForecastInput, rustType: 'YELLOW' | 'BROWN' | 'BLACK'): DiseaseForecast {
  let riskScore = 0;
  const contributing_factors: DiseaseForecast['contributing_factors'] = [];
  
  // Optimal conditions vary by rust type
  const optimalTemp = {
    YELLOW: [10, 15],  // Yellow rust: cooler
    BROWN: [15, 25],   // Brown rust: moderate
    BLACK: [20, 30]    // Black rust: warmer
  };
  
  const [minOptimal, maxOptimal] = optimalTemp[rustType];
  
  for (const day of input.weather_history.slice(-10)) {
    // Temperature check
    if (day.temperature_avg >= minOptimal && day.temperature_avg <= maxOptimal) {
      riskScore += 8;
      contributing_factors.push({
        factor: 'Temperature',
        value: `${day.temperature_avg.toFixed(1)}°C (optimal for ${rustType.toLowerCase()} rust)`,
        impact: 'FAVORABLE'
      });
    }
    
    // Humidity - rust needs moisture for germination
    if (day.humidity_avg >= 80) {
      riskScore += 6;
    }
    
    // Dew duration (approximated)
    if (day.temperature_min < 15 && day.humidity_max > 85) {
      riskScore += 5;  // Heavy dew likely
    }
    
    // Light rain promotes rust
    if (day.rainfall_mm > 0 && day.rainfall_mm < 20) {
      riskScore += 4;
    }
  }
  
  let risk_level: DiseaseForecast['risk_level'];
  let days_to_infection: number;
  let preventive_action: string;
  
  if (riskScore >= 75) {
    risk_level = 'SEVERE';
    days_to_infection = 3;
    preventive_action = `Apply Propiconazole (0.1%) or Tebuconazole immediately. Scout for pustules.`;
  } else if (riskScore >= 50) {
    risk_level = 'HIGH';
    days_to_infection = 5;
    preventive_action = 'Apply preventive triazole fungicide. Check variety resistance status.';
  } else if (riskScore >= 30) {
    risk_level = 'MODERATE';
    days_to_infection = 10;
    preventive_action = 'Monitor crop closely. Check for rust pustules on leaves.';
  } else {
    risk_level = 'LOW';
    days_to_infection = 21;
    preventive_action = 'Low risk. Continue standard monitoring.';
  }
  
  return {
    disease: `${rustType.charAt(0) + rustType.slice(1).toLowerCase()} Rust (Puccinia spp.)`,
    crop: input.crop,
    risk_level,
    risk_score: Math.min(100, riskScore),
    days_to_infection,
    severity_value: riskScore,
    severity_unit: 'Rust Risk Score',
    preventive_action,
    model_used: 'Rust Environmental Prediction Model',
    model_confidence: 0.78,
    contributing_factors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED FORECAST FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export type DiseaseType = 
  | 'LATE_BLIGHT'
  | 'DOWNY_MILDEW'
  | 'POWDERY_MILDEW'
  | 'YELLOW_RUST'
  | 'BROWN_RUST'
  | 'BLACK_RUST';

/**
 * Get disease forecast for any supported disease
 */
export function getDiseaseForecast(
  diseaseType: DiseaseType,
  input: ForecastInput
): DiseaseForecast {
  switch (diseaseType) {
    case 'LATE_BLIGHT':
      return forecastLateBlight(input);
    case 'DOWNY_MILDEW':
      return forecastDownyMildew(input);
    case 'POWDERY_MILDEW':
      return forecastPowderyMildew(input);
    case 'YELLOW_RUST':
      return forecastRust(input, 'YELLOW');
    case 'BROWN_RUST':
      return forecastRust(input, 'BROWN');
    case 'BLACK_RUST':
      return forecastRust(input, 'BLACK');
    default:
      throw new Error(`Unsupported disease type: ${diseaseType}`);
  }
}

/**
 * Get all applicable disease forecasts for a crop
 */
export function getAllDiseaseForecastsForCrop(input: ForecastInput): DiseaseForecast[] {
  const crop = input.crop.toLowerCase();
  const forecasts: DiseaseForecast[] = [];
  
  // Crop-disease mapping
  const cropDiseases: Record<string, DiseaseType[]> = {
    potato: ['LATE_BLIGHT', 'POWDERY_MILDEW'],
    tomato: ['LATE_BLIGHT', 'POWDERY_MILDEW', 'DOWNY_MILDEW'],
    grape: ['DOWNY_MILDEW', 'POWDERY_MILDEW'],
    wheat: ['YELLOW_RUST', 'BROWN_RUST', 'BLACK_RUST', 'POWDERY_MILDEW'],
    rice: ['BROWN_RUST'],
    sugarcane: ['BROWN_RUST'],
    onion: ['DOWNY_MILDEW', 'POWDERY_MILDEW'],
    chilli: ['POWDERY_MILDEW'],
    cucumber: ['DOWNY_MILDEW', 'POWDERY_MILDEW'],
    muskmelon: ['DOWNY_MILDEW', 'POWDERY_MILDEW']
  };
  
  const diseases = cropDiseases[crop] || [];
  
  for (const disease of diseases) {
    try {
      forecasts.push(getDiseaseForecast(disease, input));
    } catch (e) {
      console.error(`Error forecasting ${disease} for ${crop}:`, e);
    }
  }
  
  // Sort by risk score descending
  return forecasts.sort((a, b) => b.risk_score - a.risk_score);
}
