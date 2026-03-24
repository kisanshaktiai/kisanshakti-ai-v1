/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AGRICULTURAL WEATHER CALCULATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Precision farming weather indices calculated from raw API data:
 * - Dew Point (Magnus-Tetens formula)
 * - Vapor Pressure Deficit (VPD)
 * - Reference Evapotranspiration (ET0 - Hargreaves method)
 * - Growing Degree Days (GDD)
 * - Disease Risk Index (multi-factor)
 * - Sunshine Hours (estimated from cloud cover)
 * 
 * VERSION: 1.0.0
 * CREATED: 2025-02-08
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEW POINT CALCULATION (Magnus-Tetens Formula)
// Critical for disease prediction - fungal diseases thrive when temp ≈ dew point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Dew Point using Magnus-Tetens approximation
 * @param tempC - Temperature in Celsius
 * @param humidityPercent - Relative humidity (0-100)
 * @returns Dew point temperature in Celsius
 */
export function calculateDewPoint(tempC: number, humidityPercent: number): number {
  if (humidityPercent <= 0) return tempC - 20; // Dry air fallback
  if (humidityPercent >= 100) return tempC; // Saturated air
  
  const a = 17.27;
  const b = 237.7;
  const gamma = (a * tempC / (b + tempC)) + Math.log(humidityPercent / 100);
  const dewPoint = (b * gamma) / (a - gamma);
  
  return Math.round(dewPoint * 10) / 10; // Round to 1 decimal
}

// ═══════════════════════════════════════════════════════════════════════════
// VAPOR PRESSURE DEFICIT (VPD)
// Critical for crop stress prediction and greenhouse management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Vapor Pressure Deficit
 * @param tempC - Temperature in Celsius
 * @param humidityPercent - Relative humidity (0-100)
 * @returns VPD in kPa
 */
export function calculateVPD(tempC: number, humidityPercent: number): number {
  const saturationVP = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const actualVP = saturationVP * (humidityPercent / 100);
  const vpd = saturationVP - actualVP;
  
  return Math.round(vpd * 100) / 100; // Round to 2 decimals
}

/**
 * Interpret VPD for crop health
 */
export function interpretVPD(vpd: number): { level: 'LOW' | 'OPTIMAL' | 'HIGH' | 'CRITICAL'; message: string } {
  if (vpd < 0.4) {
    return { level: 'LOW', message: 'Low transpiration, disease risk increased' };
  } else if (vpd >= 0.4 && vpd <= 1.2) {
    return { level: 'OPTIMAL', message: 'Optimal transpiration range for most crops' };
  } else if (vpd > 1.2 && vpd <= 2.0) {
    return { level: 'HIGH', message: 'High transpiration stress, irrigate if needed' };
  } else {
    return { level: 'CRITICAL', message: 'Severe water stress, immediate irrigation required' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EVAPOTRANSPIRATION (ET0 - Hargreaves Method)
// Simplified method when full Penman-Monteith data unavailable
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate extraterrestrial radiation (Ra)
 * @param latitude - Latitude in degrees
 * @param dayOfYear - Day of year (1-365)
 * @returns Ra in MJ/m²/day
 */
export function calculateExtraterrestrialRadiation(latitude: number, dayOfYear: number): number {
  const latRad = latitude * Math.PI / 180;
  const dr = 1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365);
  const delta = 0.409 * Math.sin(2 * Math.PI * dayOfYear / 365 - 1.39);
  
  // Sunset hour angle
  const ws = Math.acos(-Math.tan(latRad) * Math.tan(delta));
  
  // Solar constant = 0.0820 MJ/m²/min
  const Gsc = 0.0820;
  
  // Ra calculation
  const Ra = (24 * 60 / Math.PI) * Gsc * dr * (
    ws * Math.sin(latRad) * Math.sin(delta) +
    Math.cos(latRad) * Math.cos(delta) * Math.sin(ws)
  );
  
  return Math.max(0, Ra);
}

/**
 * Estimate Reference Evapotranspiration (ET0) using Hargreaves method
 * Use when full Penman-Monteith data (solar radiation, wind) not available
 * 
 * @param tempMax - Maximum temperature (°C)
 * @param tempMin - Minimum temperature (°C)
 * @param latitude - Latitude in degrees
 * @param dayOfYear - Day of year (1-365)
 * @returns ET0 in mm/day
 */
export function calculateET0Hargreaves(
  tempMax: number,
  tempMin: number,
  latitude: number,
  dayOfYear: number
): number {
  const tempMean = (tempMax + tempMin) / 2;
  const tempRange = Math.max(0, tempMax - tempMin);
  const Ra = calculateExtraterrestrialRadiation(latitude, dayOfYear);
  
  // Hargreaves equation: ET0 = 0.0023 × Ra × √(TD) × (Tmean + 17.8)
  // Ra needs to be converted from MJ/m²/day to mm/day equivalent (divide by λ ≈ 2.45)
  const RaInMmPerDay = Ra / 2.45;
  
  const et0 = 0.0023 * RaInMmPerDay * Math.sqrt(tempRange) * (tempMean + 17.8);
  
  return Math.round(Math.max(0, et0) * 10) / 10; // Round to 1 decimal
}

// ═══════════════════════════════════════════════════════════════════════════
// GROWING DEGREE DAYS (GDD)
// Critical for phenology prediction - crop stage advancement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate daily Growing Degree Days (Simple Method)
 * @param tempMax - Maximum temperature (°C)
 * @param tempMin - Minimum temperature (°C)
 * @param baseTemp - Base temperature for crop (default 10°C)
 * @param maxTemp - Maximum cap temperature (default 30°C)
 * @returns GDD for the day
 */
export function calculateDailyGDD(
  tempMax: number,
  tempMin: number,
  baseTemp: number = 10,
  maxTemp: number = 30
): number {
  // Cap temperatures
  const cappedMax = Math.min(tempMax, maxTemp);
  const cappedMin = Math.max(tempMin, baseTemp);
  
  // Ensure cappedMax >= cappedMin
  if (cappedMax <= cappedMin) {
    return 0;
  }
  
  const avgTemp = (cappedMax + cappedMin) / 2;
  const gdd = Math.max(0, avgTemp - baseTemp);
  
  return Math.round(gdd * 10) / 10;
}

/**
 * Get crop-specific GDD parameters
 */
export function getCropGDDParams(cropCode: string): { baseTemp: number; maxTemp: number } {
  const params: Record<string, { baseTemp: number; maxTemp: number }> = {
    // Row crops
    'SC': { baseTemp: 12, maxTemp: 34 }, // Sugarcane
    'SUGARCANE': { baseTemp: 12, maxTemp: 34 },
    'COTTON': { baseTemp: 15.6, maxTemp: 37 },
    'WHEAT': { baseTemp: 4, maxTemp: 25 },
    'RICE': { baseTemp: 10, maxTemp: 40 },
    'MAIZE': { baseTemp: 10, maxTemp: 30 },
    'SOYBEAN': { baseTemp: 10, maxTemp: 30 },
    
    // Vegetables
    'TOMATO': { baseTemp: 10, maxTemp: 30 },
    'ONION': { baseTemp: 7, maxTemp: 30 },
    'POTATO': { baseTemp: 7, maxTemp: 25 },
    'CHILI': { baseTemp: 15, maxTemp: 35 },
    
    // Pulses
    'CHICKPEA': { baseTemp: 5, maxTemp: 25 },
    'PIGEON_PEA': { baseTemp: 10, maxTemp: 35 },
    
    // Default
    'DEFAULT': { baseTemp: 10, maxTemp: 30 }
  };
  
  return params[cropCode.toUpperCase()] || params['DEFAULT'];
}

// ═══════════════════════════════════════════════════════════════════════════
// SUNSHINE HOURS ESTIMATION
// Critical for photosynthesis models
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate sunshine hours from cloud cover
 * @param cloudCoverPercent - Cloud cover percentage (0-100)
 * @param sunriseTimestamp - Unix timestamp for sunrise
 * @param sunsetTimestamp - Unix timestamp for sunset
 * @returns Estimated sunshine hours
 */
export function estimateSunshineHours(
  cloudCoverPercent: number,
  sunriseTimestamp: number,
  sunsetTimestamp: number
): number {
  // Calculate daylight hours
  const daylightHours = (sunsetTimestamp - sunriseTimestamp) / 3600; // Convert seconds to hours
  
  if (daylightHours <= 0) return 0;
  
  // Clear fraction (0-1)
  const clearFraction = (100 - Math.min(100, Math.max(0, cloudCoverPercent))) / 100;
  
  // Atmospheric absorption factor (typically 0.85-0.95)
  const atmosphericFactor = 0.9;
  
  const sunshineHours = daylightHours * clearFraction * atmosphericFactor;
  
  return Math.round(sunshineHours * 10) / 10;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE RISK INDEX
// Multi-factor agricultural disease prediction
// ═══════════════════════════════════════════════════════════════════════════

export type DiseaseRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DiseaseRiskResult {
  level: DiseaseRiskLevel;
  score: number; // 0-100
  factors: string[];
  recommendations: string[];
  spray_urgency: 'NONE' | 'MONITOR' | 'PREVENTIVE' | 'URGENT';
}

/**
 * Calculate agricultural disease risk based on weather conditions
 * @param tempC - Current temperature in Celsius
 * @param humidityPercent - Relative humidity (0-100)
 * @param dewPointC - Dew point temperature in Celsius (or null to calculate)
 * @param recentRainfallMm - Rainfall in last 24-48 hours (mm)
 * @param leafWetnessHours - Hours of leaf wetness (optional, estimate from rain+humidity)
 */
export function calculateDiseaseRiskIndex(
  tempC: number,
  humidityPercent: number,
  dewPointC: number | null,
  recentRainfallMm: number = 0,
  leafWetnessHours: number = 0
): DiseaseRiskResult {
  let score = 0;
  const factors: string[] = [];
  const recommendations: string[] = [];
  
  // Calculate dew point if not provided
  const dew = dewPointC ?? calculateDewPoint(tempC, humidityPercent);
  
  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 1: High Humidity (25 points max)
  // ═══════════════════════════════════════════════════════════════════════
  if (humidityPercent > 85) {
    score += 25;
    factors.push('HIGH_HUMIDITY');
    recommendations.push('Ensure good air circulation around crops');
  } else if (humidityPercent > 70) {
    score += 15;
    factors.push('MODERATE_HUMIDITY');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 2: Dew Point Proximity (30 points max)
  // When temp approaches dew point = condensation = leaf wetness
  // ═══════════════════════════════════════════════════════════════════════
  const dewPointProximity = Math.abs(tempC - dew);
  
  if (dewPointProximity < 2) {
    score += 30;
    factors.push('CONDENSATION_LIKELY');
    recommendations.push('Fungal disease risk high - consider preventive fungicide');
  } else if (dewPointProximity < 5) {
    score += 15;
    factors.push('CONDENSATION_POSSIBLE');
    recommendations.push('Monitor for early morning dew formation');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 3: Optimal Pathogen Temperature (20 points max)
  // Most fungal pathogens thrive between 20-28°C
  // ═══════════════════════════════════════════════════════════════════════
  if (tempC >= 20 && tempC <= 28) {
    score += 20;
    factors.push('OPTIMAL_PATHOGEN_TEMP');
  } else if (tempC >= 15 && tempC <= 32) {
    score += 10;
    factors.push('FAVORABLE_PATHOGEN_TEMP');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 4: Recent Rainfall (25 points max)
  // Wet canopy promotes spore germination and spread
  // ═══════════════════════════════════════════════════════════════════════
  if (recentRainfallMm > 15) {
    score += 25;
    factors.push('WET_CANOPY');
    recommendations.push('Wait for canopy to dry before any treatment');
  } else if (recentRainfallMm > 5) {
    score += 15;
    factors.push('DAMP_CONDITIONS');
  } else if (recentRainfallMm > 2) {
    score += 10;
    factors.push('LIGHT_MOISTURE');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // FACTOR 5: Prolonged Leaf Wetness (15 points max)
  // ═══════════════════════════════════════════════════════════════════════
  if (leafWetnessHours > 8) {
    score += 15;
    factors.push('PROLONGED_LEAF_WETNESS');
    recommendations.push('Extended wet period - scout for disease symptoms');
  } else if (leafWetnessHours > 4) {
    score += 10;
    factors.push('MODERATE_LEAF_WETNESS');
  }
  
  // Estimate leaf wetness if not provided (based on rain and humidity)
  if (leafWetnessHours === 0 && recentRainfallMm > 5 && humidityPercent > 80) {
    score += 5;
    factors.push('ESTIMATED_LEAF_WETNESS');
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // DETERMINE RISK LEVEL AND SPRAY URGENCY
  // ═══════════════════════════════════════════════════════════════════════
  let level: DiseaseRiskLevel;
  let spray_urgency: DiseaseRiskResult['spray_urgency'];
  
  if (score >= 75) {
    level = 'CRITICAL';
    spray_urgency = 'URGENT';
    recommendations.push('🚨 Apply preventive fungicide immediately if not sprayed in last 7 days');
  } else if (score >= 50) {
    level = 'HIGH';
    spray_urgency = 'PREVENTIVE';
    recommendations.push('⚠️ Consider preventive fungicide application within 24-48 hours');
  } else if (score >= 25) {
    level = 'MEDIUM';
    spray_urgency = 'MONITOR';
    recommendations.push('Scout fields for early disease symptoms');
  } else {
    level = 'LOW';
    spray_urgency = 'NONE';
    recommendations.push('Conditions unfavorable for disease - continue normal monitoring');
  }
  
  return {
    level,
    score: Math.min(100, score),
    factors,
    recommendations,
    spray_urgency
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IRRIGATION DECISION SUPPORT
// Based on ET0 and rainfall balance
// ═══════════════════════════════════════════════════════════════════════════

export interface IrrigationRecommendation {
  needs_irrigation: boolean;
  water_deficit_mm: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommended_amount_mm: number;
  message: string;
}

/**
 * Calculate irrigation recommendation based on ET0 and rainfall
 * @param et0Mm - Reference evapotranspiration (mm/day)
 * @param rainfallMm - Recent rainfall (mm)
 * @param cropCoefficient - Kc value for crop stage (typically 0.3-1.2)
 * @param soilMoisturePercent - Current soil moisture (optional)
 */
export function calculateIrrigationNeed(
  et0Mm: number,
  rainfallMm: number,
  cropCoefficient: number = 1.0,
  soilMoisturePercent?: number
): IrrigationRecommendation {
  // Crop water requirement (ETc)
  const etc = et0Mm * cropCoefficient;
  
  // Water balance (simplified)
  const waterDeficit = etc - rainfallMm;
  
  // Determine priority
  let priority: IrrigationRecommendation['priority'];
  let needs_irrigation: boolean;
  let message: string;
  
  // Consider soil moisture if available
  if (soilMoisturePercent !== undefined) {
    if (soilMoisturePercent < 25) {
      priority = 'CRITICAL';
      needs_irrigation = true;
      message = 'Soil moisture critically low - irrigate immediately';
    } else if (soilMoisturePercent < 40) {
      priority = 'HIGH';
      needs_irrigation = true;
      message = 'Soil moisture low - irrigate within 24 hours';
    } else if (soilMoisturePercent < 60 && waterDeficit > 2) {
      priority = 'MEDIUM';
      needs_irrigation = true;
      message = 'Consider irrigation based on crop water demand';
    } else {
      priority = 'LOW';
      needs_irrigation = false;
      message = 'Soil moisture adequate - continue monitoring';
    }
  } else {
    // No soil moisture data - use ET-based decision
    if (waterDeficit > 5) {
      priority = 'HIGH';
      needs_irrigation = true;
      message = `High water demand (${waterDeficit.toFixed(1)} mm/day deficit) - irrigate soon`;
    } else if (waterDeficit > 2) {
      priority = 'MEDIUM';
      needs_irrigation = true;
      message = `Moderate water deficit - consider irrigation`;
    } else {
      priority = 'LOW';
      needs_irrigation = false;
      message = 'Recent rainfall covers crop water demand';
    }
  }
  
  // Recommended amount (typically replace deficit + 20% for efficiency losses)
  const recommendedAmount = Math.max(0, waterDeficit * 1.2);
  
  return {
    needs_irrigation,
    water_deficit_mm: Math.round(waterDeficit * 10) / 10,
    priority,
    recommended_amount_mm: Math.round(recommendedAmount * 10) / 10,
    message
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE AGRICULTURAL WEATHER INDICES
// Calculate all indices from raw weather data
// ═══════════════════════════════════════════════════════════════════════════

export interface AgriculturalWeatherIndices {
  dew_point_c: number;
  vpd_kpa: number;
  vpd_interpretation: { level: string; message: string };
  et0_mm: number;
  gdd: number;
  sunshine_hours: number;
  disease_risk: DiseaseRiskResult;
  irrigation_need: IrrigationRecommendation;
}

export interface WeatherInputForIndices {
  temperature_c: number;
  temperature_max_c?: number;
  temperature_min_c?: number;
  humidity_percent: number;
  cloud_cover_percent?: number;
  sunrise_timestamp?: number;
  sunset_timestamp?: number;
  rainfall_24h_mm?: number;
  latitude?: number;
  day_of_year?: number;
  crop_code?: string;
  crop_coefficient?: number;
  soil_moisture_percent?: number;
}

/**
 * Calculate all agricultural weather indices from raw data
 */
export function calculateAllAgriculturalIndices(input: WeatherInputForIndices): AgriculturalWeatherIndices {
  const {
    temperature_c,
    temperature_max_c = temperature_c + 3,
    temperature_min_c = temperature_c - 5,
    humidity_percent,
    cloud_cover_percent = 30,
    sunrise_timestamp = Date.now() / 1000 - 6 * 3600, // Default 6 hours ago
    sunset_timestamp = Date.now() / 1000 + 6 * 3600,   // Default 6 hours ahead
    rainfall_24h_mm = 0,
    latitude = 20, // Default to central India
    day_of_year = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000),
    crop_code = 'DEFAULT',
    crop_coefficient = 1.0,
    soil_moisture_percent
  } = input;
  
  // Calculate indices
  const dew_point_c = calculateDewPoint(temperature_c, humidity_percent);
  const vpd_kpa = calculateVPD(temperature_c, humidity_percent);
  const vpd_interpretation = interpretVPD(vpd_kpa);
  const et0_mm = calculateET0Hargreaves(temperature_max_c, temperature_min_c, latitude, day_of_year);
  
  const gddParams = getCropGDDParams(crop_code);
  const gdd = calculateDailyGDD(temperature_max_c, temperature_min_c, gddParams.baseTemp, gddParams.maxTemp);
  
  const sunshine_hours = estimateSunshineHours(cloud_cover_percent, sunrise_timestamp, sunset_timestamp);
  
  const disease_risk = calculateDiseaseRiskIndex(
    temperature_c,
    humidity_percent,
    dew_point_c,
    rainfall_24h_mm
  );
  
  const irrigation_need = calculateIrrigationNeed(
    et0_mm,
    rainfall_24h_mm,
    crop_coefficient,
    soil_moisture_percent
  );
  
  return {
    dew_point_c,
    vpd_kpa,
    vpd_interpretation,
    et0_mm,
    gdd,
    sunshine_hours,
    disease_risk,
    irrigation_need
  };
}
