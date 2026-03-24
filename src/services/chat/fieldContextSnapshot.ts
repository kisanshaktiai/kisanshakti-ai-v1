/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIELD CONTEXT SNAPSHOT BUILDER - KisanShakti AI Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Builds a comprehensive, real-time Field Context Snapshot before generating
 * any advisory. This snapshot defines WHAT CAN BE SAFELY DONE NOW.
 * 
 * MANDATORY DATA SOURCES (DO NOT GUESS):
 * 1. Soil Data (Baseline - Static) - from SoilGrids
 * 2. NDVI & Vegetation Indices (Dynamic) - updates every 5 days
 * 3. Weather Data (Highly Dynamic) - updates every 5-10 minutes
 * 
 * ❌ NOT allowed to assume soil, NDVI, or weather values
 * ❌ NOT allowed to hallucinate missing data
 */

import type { LandContext } from './farmerMessageBuilder';
import type { CropStage } from '@/decision-graph';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type DataCertaintyLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DataFreshnessInfo {
  source: 'soil' | 'ndvi' | 'weather';
  ageDescription: string;
  isStale: boolean;
  lastUpdated?: Date;
  certaintyContribution: DataCertaintyLevel;
}

export interface FieldContextSnapshot {
  // Land Identity (CRITICAL for multi-land chat isolation)
  landId: string;
  landName: string;
  
  // Crop & Growth Stage
  cropName: string;
  cropCode: string;
  cropGroup: string;
  growthStage: CropStage;
  daysAfterSowing: number;
  sowingDate: Date;
  
  // Soil Baseline (from SoilGrids - Static)
  soilBaseline: {
    nitrogen: number;
    phosphorus: number;
    potassium: number;
    ph: number;
    organicCarbon?: number;
    moisture?: number;
    testDate?: Date;
    isEstimated: boolean;
  };
  
  // NDVI Status & Trend (Dynamic - updates every 5 days)
  ndviStatus: {
    value: number;
    state: string;
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';
    lastUpdated?: Date;
    isStale: boolean;
    ageHours: number;
  };
  
  // Weather Conditions (Highly Dynamic)
  weatherConditions: {
    temperature: number;
    humidity: number;
    rainExpected: boolean;
    rainExpectedHours?: number;
    windSpeed: number;
    lastUpdated?: Date;
    isStale: boolean;
    ageHours: number;
  };
  
  // Last AI Recommendation (if any)
  lastRecommendation?: {
    action: string;
    date: Date;
    wasFollowed?: boolean;
  };
  
  // Data Freshness Summary
  dataFreshness: {
    soil: DataFreshnessInfo;
    ndvi: DataFreshnessInfo;
    weather: DataFreshnessInfo;
    overallCertainty: DataCertaintyLevel;
  };
  
  // Area Information
  areaHectares: number;
  areaAcres: number;
  areaGunta: number;
  
  // Location Context
  location?: {
    state?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Farming Mode
  farmingMode: 'ORGANIC' | 'CONVENTIONAL' | 'INTEGRATED' | 'UNKNOWN';
  irrigationType?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CERTAINTY LEVEL CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate overall data certainty level
 * 
 * DECISION RULE:
 * - HIGH → soil + NDVI + weather are recent → allow fertilizer/chemical/strong actions
 * - MEDIUM → NDVI or soil estimated/old → prefer mechanical, cultural, monitoring actions
 * - LOW → partial or missing confirmation → observation + caution, no aggressive input advice
 */
export function calculateDataCertainty(snapshot: FieldContextSnapshot): DataCertaintyLevel {
  const { soil, ndvi, weather } = snapshot.dataFreshness;
  
  // Count stale data sources
  const staleCount = [
    soil.isStale,
    ndvi.isStale,
    weather.isStale
  ].filter(Boolean).length;
  
  // Weather is most critical for spray/action decisions
  if (weather.isStale) {
    // If weather is stale, max certainty is MEDIUM
    return staleCount >= 2 ? 'LOW' : 'MEDIUM';
  }
  
  // NDVI is important for crop health assessment
  if (ndvi.isStale && soil.isStale) {
    return 'LOW';
  }
  
  if (ndvi.isStale || soil.isStale) {
    return 'MEDIUM';
  }
  
  return 'HIGH';
}

/**
 * Calculate freshness for a specific data source
 */
function calculateFreshness(
  source: 'soil' | 'ndvi' | 'weather',
  timestamp?: Date | string,
  hasData: boolean = true,
  language: string = 'en'
): DataFreshnessInfo {
  const now = new Date();
  let lastUpdated: Date | undefined;
  let ageHours = 0;
  let ageDays = 0;
  
  if (timestamp) {
    lastUpdated = new Date(timestamp);
    ageHours = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
    ageDays = ageHours / 24;
  }
  
  let isStale = !hasData;
  let ageDescription = '';
  let certaintyContribution: DataCertaintyLevel = 'HIGH';
  
  // Localized text maps
  const labels = {
    en: {
      noSoilData: 'No soil test data',
      soilDaysOld: (d: number) => `Soil test ${d} days old`,
      recentSoilTest: 'Recent soil test',
      noNdviData: 'No NDVI data',
      ndviDaysOld: (d: number) => `NDVI ${d} days old`,
      ndviHoursOld: (h: number) => `NDVI ${h} hours ago`,
      recentNdvi: 'Recent NDVI',
      noWeatherData: 'No weather data',
      weatherHoursOld: (h: number) => `Weather ${h} hours old`,
      currentWeather: 'Current weather',
    },
    hi: {
      noSoilData: 'मिट्टी परीक्षण डेटा नहीं',
      soilDaysOld: (d: number) => `मिट्टी परीक्षण ${d} दिन पुराना`,
      recentSoilTest: 'हाल का मिट्टी परीक्षण',
      noNdviData: 'उपग्रह डेटा नहीं',
      ndviDaysOld: (d: number) => `उपग्रह ${d} दिन पुराना`,
      ndviHoursOld: (h: number) => `उपग्रह ${h} घंटे पहले`,
      recentNdvi: 'हाल का उपग्रह डेटा',
      noWeatherData: 'मौसम डेटा नहीं',
      weatherHoursOld: (h: number) => `मौसम ${h} घंटे पुराना`,
      currentWeather: 'वर्तमान मौसम',
    },
    mr: {
      noSoilData: 'माती परीक्षण माहिती नाही',
      soilDaysOld: (d: number) => `माती परीक्षण ${d} दिवस जुने`,
      recentSoilTest: 'अलीकडील माती परीक्षण',
      noNdviData: 'उपग्रह माहिती नाही',
      ndviDaysOld: (d: number) => `उपग्रह ${d} दिवस जुने`,
      ndviHoursOld: (h: number) => `उपग्रह ${h} तासांपूर्वी`,
      recentNdvi: 'अलीकडील उपग्रह माहिती',
      noWeatherData: 'हवामान माहिती नाही',
      weatherHoursOld: (h: number) => `हवामान ${h} तास जुने`,
      currentWeather: 'सध्याचे हवामान',
    },
  };
  
  const lang = labels[language as keyof typeof labels] || labels.en;
  
  switch (source) {
    case 'soil':
      // Soil data is considered baseline, stale after 180 days
      isStale = !hasData || ageDays > 180;
      if (!hasData) {
        ageDescription = lang.noSoilData;
        certaintyContribution = 'LOW';
      } else if (ageDays > 180) {
        ageDescription = lang.soilDaysOld(Math.round(ageDays));
        certaintyContribution = 'MEDIUM';
      } else if (ageDays > 90) {
        ageDescription = lang.soilDaysOld(Math.round(ageDays));
        certaintyContribution = 'MEDIUM';
      } else {
        ageDescription = lang.recentSoilTest;
        certaintyContribution = 'HIGH';
      }
      break;
      
    case 'ndvi':
      // NDVI updates every 5 days, stale after 72 hours
      isStale = !hasData || ageHours > 72;
      if (!hasData) {
        ageDescription = lang.noNdviData;
        certaintyContribution = 'LOW';
      } else if (ageHours > 72) {
        ageDescription = lang.ndviDaysOld(Math.round(ageHours / 24));
        certaintyContribution = 'MEDIUM';
      } else if (ageHours > 24) {
        ageDescription = lang.ndviHoursOld(Math.round(ageHours));
        certaintyContribution = 'MEDIUM';
      } else {
        ageDescription = lang.recentNdvi;
        certaintyContribution = 'HIGH';
      }
      break;
      
    case 'weather':
      // Weather is most critical, stale after 6 hours
      isStale = !hasData || ageHours > 6;
      if (!hasData) {
        ageDescription = lang.noWeatherData;
        certaintyContribution = 'LOW';
      } else if (ageHours > 6) {
        ageDescription = lang.weatherHoursOld(Math.round(ageHours));
        certaintyContribution = 'LOW'; // Weather staleness is critical
      } else if (ageHours > 2) {
        ageDescription = lang.weatherHoursOld(Math.round(ageHours));
        certaintyContribution = 'MEDIUM';
      } else {
        ageDescription = lang.currentWeather;
        certaintyContribution = 'HIGH';
      }
      break;
  }
  
  return {
    source,
    ageDescription,
    isStale,
    lastUpdated,
    certaintyContribution
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SNAPSHOT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a comprehensive Field Context Snapshot from land context
 * 
 * This is the FIRST STEP before generating any advisory.
 * The snapshot defines WHAT CAN BE SAFELY DONE NOW.
 */
export function buildFieldContextSnapshot(
  landContext: LandContext,
  cropStage: CropStage,
  daysAfterSowing: number,
  landId?: string,
  landName?: string,
  language: string = 'en'
): FieldContextSnapshot {
  const now = new Date();
  
  // Parse sowing date
  let sowingDate = new Date();
  sowingDate.setDate(sowingDate.getDate() - daysAfterSowing);
  if (landContext.sowing_date) {
    sowingDate = new Date(landContext.sowing_date);
  } else if (landContext.cultivation_date) {
    sowingDate = new Date(landContext.cultivation_date);
  }
  
  // Calculate area conversions
  const areaHectares = landContext.area_hectares || (landContext.area_acres ? landContext.area_acres * 0.404686 : 1);
  const areaAcres = areaHectares / 0.404686;
  const areaGunta = areaAcres * 40; // 1 acre = 40 gunta
  
  // Calculate freshness for each data source (with language for localized descriptions)
  const soilFreshness = calculateFreshness(
    'soil',
    landContext.soil_data?.test_date,
    landContext.soil_data?.n !== undefined,
    language
  );
  
  const ndviFreshness = calculateFreshness(
    'ndvi',
    landContext.ndvi_data?.timestamp,
    landContext.ndvi_data?.value !== undefined,
    language
  );
  
  const weatherFreshness = calculateFreshness(
    'weather',
    landContext.weather_data?.timestamp,
    landContext.weather_data?.temperature !== undefined,
    language
  );
  
  // Calculate NDVI age in hours
  let ndviAgeHours = 24; // Default
  if (landContext.ndvi_data?.timestamp) {
    ndviAgeHours = (now.getTime() - new Date(landContext.ndvi_data.timestamp).getTime()) / (1000 * 60 * 60);
  }
  
  // Calculate weather age in hours
  let weatherAgeHours = 6; // Default
  if (landContext.weather_data?.timestamp) {
    weatherAgeHours = (now.getTime() - new Date(landContext.weather_data.timestamp).getTime()) / (1000 * 60 * 60);
  }
  
  // Determine NDVI trend
  let ndviTrend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN' = 'UNKNOWN';
  if (landContext.ndvi_data?.trend !== undefined) {
    if (landContext.ndvi_data.trend > 0.02) ndviTrend = 'IMPROVING';
    else if (landContext.ndvi_data.trend < -0.02) ndviTrend = 'DECLINING';
    else ndviTrend = 'STABLE';
  }
  
  // Determine NDVI state description
  let ndviState = 'UNKNOWN';
  const ndviValue = landContext.ndvi_data?.value ?? 0.55;
  if (ndviValue >= 0.7) ndviState = 'HEALTHY';
  else if (ndviValue >= 0.5) ndviState = 'MODERATE';
  else if (ndviValue >= 0.3) ndviState = 'STRESS';
  else ndviState = 'CRITICAL';
  
  // Determine farming mode
  let farmingMode: 'ORGANIC' | 'CONVENTIONAL' | 'INTEGRATED' | 'UNKNOWN' = 'UNKNOWN';
  if (landContext.farming_mode) {
    const mode = landContext.farming_mode.toUpperCase();
    if (mode.includes('ORGANIC')) farmingMode = 'ORGANIC';
    else if (mode.includes('CONVENTIONAL')) farmingMode = 'CONVENTIONAL';
    else if (mode.includes('INTEGRATED')) farmingMode = 'INTEGRATED';
  }
  
  // Build the snapshot
  const snapshot: FieldContextSnapshot = {
    // Land Identity
    landId: landId || landContext.id || 'unknown',
    landName: landName || landContext.name || 'Unknown Land',
    
    // Crop Info
    cropName: landContext.crop_name || landContext.current_crop || 'Unknown',
    cropCode: landContext.crop_code || '',
    cropGroup: landContext.crop_group || '',
    growthStage: cropStage,
    daysAfterSowing,
    sowingDate,
    
    soilBaseline: {
      nitrogen: landContext.soil_data?.n ?? 80,
      phosphorus: landContext.soil_data?.p ?? 40,
      potassium: landContext.soil_data?.k ?? 40,
      ph: landContext.soil_data?.ph ?? 7.0,
      organicCarbon: landContext.soil_data?.organic_carbon,
      moisture: landContext.soil_data?.moisture,
      testDate: landContext.soil_data?.test_date ? new Date(landContext.soil_data.test_date) : undefined,
      isEstimated: landContext.soil_data?.n === undefined
    },
    
    ndviStatus: {
      value: ndviValue,
      state: ndviState,
      trend: ndviTrend,
      lastUpdated: landContext.ndvi_data?.timestamp ? new Date(landContext.ndvi_data.timestamp) : undefined,
      isStale: ndviFreshness.isStale,
      ageHours: ndviAgeHours
    },
    
    weatherConditions: {
      temperature: landContext.weather_data?.temperature ?? 28,
      humidity: landContext.weather_data?.humidity ?? 60,
      rainExpected: landContext.weather_data?.rain_expected ?? false,
      rainExpectedHours: landContext.weather_data?.rain_expected_hours,
      windSpeed: landContext.weather_data?.wind_speed ?? 10,
      lastUpdated: landContext.weather_data?.timestamp ? new Date(landContext.weather_data.timestamp) : undefined,
      isStale: weatherFreshness.isStale,
      ageHours: weatherAgeHours
    },
    
    dataFreshness: {
      soil: soilFreshness,
      ndvi: ndviFreshness,
      weather: weatherFreshness,
      overallCertainty: 'HIGH' // Will be calculated below
    },
    
    areaHectares,
    areaAcres,
    areaGunta,
    
    location: landContext.location,
    farmingMode,
    irrigationType: landContext.irrigation_type
  };
  
  // Calculate overall certainty
  snapshot.dataFreshness.overallCertainty = calculateDataCertainty(snapshot);
  
  return snapshot;
}

// ═══════════════════════════════════════════════════════════════════════════
// CERTAINTY-BASED ACTION GATING
// ═══════════════════════════════════════════════════════════════════════════

export type ActionSafetyLevel = 'AGGRESSIVE' | 'MODERATE' | 'CONSERVATIVE';

/**
 * Get allowed action safety level based on data certainty
 */
export function getAllowedActionLevel(certainty: DataCertaintyLevel): ActionSafetyLevel {
  switch (certainty) {
    case 'HIGH':
      // Allow fertilizer, chemical, strong actions
      return 'AGGRESSIVE';
    case 'MEDIUM':
      // Prefer mechanical, cultural, monitoring actions
      return 'MODERATE';
    case 'LOW':
      // Observation + caution, no aggressive input advice
      return 'CONSERVATIVE';
  }
}

/**
 * Check if a specific action type is allowed at current certainty level
 */
export function isActionAllowedAtCertainty(
  actionType: 'fertilizer' | 'pesticide' | 'fungicide' | 'irrigation' | 'mechanical' | 'monitoring',
  certainty: DataCertaintyLevel
): { allowed: boolean; reason?: string } {
  const level = getAllowedActionLevel(certainty);
  
  switch (level) {
    case 'CONSERVATIVE':
      // Only allow monitoring and observation
      if (actionType === 'monitoring') {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: certainty === 'LOW' 
          ? 'Data is partial or missing - only observation recommended until confirmed'
          : 'Data certainty is low - aggressive actions not recommended'
      };
      
    case 'MODERATE':
      // Allow mechanical, cultural, monitoring - not chemicals
      if (['mechanical', 'monitoring', 'irrigation'].includes(actionType)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'Data is partially outdated - prefer mechanical/cultural actions over chemical inputs'
      };
      
    case 'AGGRESSIVE':
      // All actions allowed
      return { allowed: true };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOCALIZED CONTEXT DESCRIPTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a farmer-friendly field context description
 */
export function getFieldContextDescription(
  snapshot: FieldContextSnapshot,
  language: string
): string {
  const { cropName, daysAfterSowing, growthStage, areaGunta, areaAcres } = snapshot;
  const { overallCertainty } = snapshot.dataFreshness;
  
  // Format area - prefer Gunta for small farms, Acres for larger
  const areaText = areaGunta <= 40 
    ? `${Math.round(areaGunta)} गुंठा` 
    : `${areaAcres.toFixed(2)} एकर`;
  
  const stageDescription = formatGrowthStage(growthStage, daysAfterSowing, language);
  
  if (language === 'mr') {
    return `तुमचा ${cropName} सध्या ${stageDescription} (${daysAfterSowing} दिवस) आहे।`;
  } else if (language === 'hi') {
    return `आपका ${cropName} अभी ${stageDescription} (${daysAfterSowing} दिन) में है।`;
  } else {
    return `Your ${cropName} is currently in ${stageDescription} (Day ${daysAfterSowing}).`;
  }
}

function formatGrowthStage(stage: CropStage, das: number, language: string): string {
  const stageMap: Record<string, Record<CropStage, string>> = {
    mr: {
      GERMINATION: 'उगवण अवस्थेत',
      VEGETATIVE: 'वाढीच्या अवस्थेत',
      REPRODUCTIVE: 'फुलोरा अवस्थेत',
      MATURITY: 'पक्व अवस्थेत',
      HARVEST: 'कापणीसाठी तयार'
    } as Record<CropStage, string>,
    hi: {
      GERMINATION: 'अंकुरण अवस्था',
      VEGETATIVE: 'वृद्धि अवस्था',
      REPRODUCTIVE: 'फूलन अवस्था',
      MATURITY: 'परिपक्व अवस्था',
      HARVEST: 'कटाई के लिए तैयार'
    } as Record<CropStage, string>,
    en: {
      GERMINATION: 'germination stage',
      VEGETATIVE: 'vegetative stage',
      REPRODUCTIVE: 'reproductive stage',
      MATURITY: 'maturity stage',
      HARVEST: 'ready for harvest'
    } as Record<CropStage, string>
  };
  
  const map = stageMap[language] || stageMap.en;
  return map[stage] || stage.replace(/_/g, ' ').toLowerCase();
}
