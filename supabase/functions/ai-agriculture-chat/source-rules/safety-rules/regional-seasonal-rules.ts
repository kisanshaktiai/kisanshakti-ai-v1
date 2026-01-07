/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGIONAL & SEASONAL RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3 (Crop Stage Requirements)
 * Based on: ICAR Regional Research, Planning Commission Agro-Climatic Zones
 * 
 * Scientific References:
 * - ICAR AICRP Regional Research Stations
 * - Planning Commission Agro-Climatic Regional Planning (1988)
 * - ICAR Crop Production Guidelines
 * - NCIPM Seasonal Pest Dynamics
 */

import { 
  CauseRule, 
  Cause, 
  PriorityLevel,
  CropStage,
  Season,
  AgroClimaticZone,
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
// INDIAN CROP SEASONS DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface SeasonData {
  season: Season;
  period: string;
  sowingWindow: string;
  harvestWindow: string;
  characteristics: string[];
  majorCrops: string[];
  pestPressure: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  diseaseRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  irrigationNeed: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
}

export const SEASON_DATA: SeasonData[] = [
  {
    season: Season.KHARIF,
    period: 'June-October',
    sowingWindow: 'June-July (with monsoon onset)',
    harvestWindow: 'September-October',
    characteristics: ['Monsoon dependent', 'High humidity', 'Moderate to high temperatures'],
    majorCrops: ['Rice', 'Cotton', 'Soybean', 'Maize', 'Groundnut', 'Sugarcane'],
    pestPressure: 'HIGH',
    diseaseRisk: 'VERY_HIGH',
    irrigationNeed: 'LOW',
  },
  {
    season: Season.RABI,
    period: 'October-March',
    sowingWindow: 'October-November',
    harvestWindow: 'February-April',
    characteristics: ['Irrigation dependent', 'Low humidity', 'Cool temperatures'],
    majorCrops: ['Wheat', 'Chickpea', 'Mustard', 'Potato', 'Barley', 'Lentil'],
    pestPressure: 'MODERATE',
    diseaseRisk: 'MODERATE',
    irrigationNeed: 'CRITICAL',
  },
  {
    season: Season.ZAID,
    period: 'March-June',
    sowingWindow: 'March-April',
    harvestWindow: 'May-June',
    characteristics: ['Hot and dry', 'High evapotranspiration', 'Irrigation essential'],
    majorCrops: ['Watermelon', 'Muskmelon', 'Cucumber', 'Vegetables', 'Fodder'],
    pestPressure: 'MODERATE',
    diseaseRisk: 'LOW',
    irrigationNeed: 'CRITICAL',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// AGRO-CLIMATIC ZONE DATA
// ═══════════════════════════════════════════════════════════════════════════

export interface ZoneData {
  zone: AgroClimaticZone;
  characteristics: string;
  states: string[];
  majorCrops: string[];
  pestPressure: 'LOW' | 'MODERATE' | 'HIGH';
  diseaseRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  waterStress: 'RARE' | 'OCCASIONAL' | 'COMMON' | 'CRITICAL';
  specialConsiderations: string[];
}

export const ZONE_DATA: ZoneData[] = [
  {
    zone: AgroClimaticZone.ZONE_1_WESTERN_HIMALAYAS,
    characteristics: 'Cold, high altitude',
    states: ['Jammu & Kashmir', 'Himachal Pradesh', 'Uttarakhand'],
    majorCrops: ['Apple', 'Stone fruits', 'Potato', 'Off-season vegetables'],
    pestPressure: 'LOW',
    diseaseRisk: 'MODERATE',
    waterStress: 'RARE',
    specialConsiderations: ['Cold storage critical', 'Short growing season', 'Frost protection needed'],
  },
  {
    zone: AgroClimaticZone.ZONE_2_EASTERN_HIMALAYAS,
    characteristics: 'High rainfall, hilly',
    states: ['Arunachal Pradesh', 'Meghalaya', 'Nagaland', 'Mizoram', 'Manipur', 'Tripura', 'Sikkim'],
    majorCrops: ['Tea', 'Cardamom', 'Orange', 'Pineapple', 'Ginger'],
    pestPressure: 'MODERATE',
    diseaseRisk: 'HIGH',
    waterStress: 'RARE',
    specialConsiderations: ['Continuous disease protection', 'Soil erosion management', 'Organic farming potential'],
  },
  {
    zone: AgroClimaticZone.ZONE_6_TRANS_GANGETIC,
    characteristics: 'Fertile alluvial, intensive agriculture',
    states: ['Punjab', 'Haryana', 'Delhi', 'Parts of Rajasthan'],
    majorCrops: ['Wheat', 'Rice', 'Cotton', 'Sugarcane'],
    pestPressure: 'HIGH',
    diseaseRisk: 'MODERATE',
    waterStress: 'CRITICAL',
    specialConsiderations: ['Groundwater depletion critical', 'Crop diversification needed', 'Stubble burning issue'],
  },
  {
    zone: AgroClimaticZone.ZONE_8_CENTRAL_PLATEAU,
    characteristics: 'Semi-arid, black soils',
    states: ['Madhya Pradesh', 'Parts of Maharashtra'],
    majorCrops: ['Soybean', 'Cotton', 'Chickpea', 'Wheat'],
    pestPressure: 'HIGH',
    diseaseRisk: 'MODERATE',
    waterStress: 'COMMON',
    specialConsiderations: ['Rainfed agriculture dominant', 'Soil moisture conservation critical', 'Bollworm hotspot'],
  },
  {
    zone: AgroClimaticZone.ZONE_9_WESTERN_PLATEAU,
    characteristics: 'Semi-arid, black cotton soils',
    states: ['Maharashtra (Vidarbha, Marathwada)', 'Parts of Karnataka'],
    majorCrops: ['Cotton', 'Soybean', 'Jowar', 'Sugarcane'],
    pestPressure: 'HIGH',
    diseaseRisk: 'MODERATE',
    waterStress: 'COMMON',
    specialConsiderations: ['Dryland farming techniques', 'Bollworm and pink bollworm pressure', 'Irrigation critical at flowering'],
  },
  {
    zone: AgroClimaticZone.ZONE_12_WEST_COAST,
    characteristics: 'High rainfall, humid tropical',
    states: ['Kerala', 'Coastal Karnataka', 'Goa', 'Coastal Maharashtra'],
    majorCrops: ['Rice', 'Coconut', 'Cashew', 'Spices', 'Rubber'],
    pestPressure: 'MODERATE',
    diseaseRisk: 'VERY_HIGH',
    waterStress: 'RARE',
    specialConsiderations: ['Continuous fungicide protection', 'Drainage critical', 'Organic matter rapid decomposition'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// REGIONAL-SPECIFIC PEST/DISEASE PROFILES
// ═══════════════════════════════════════════════════════════════════════════

export interface RegionalPestProfile {
  region: string;
  crop: string;
  majorPests: string[];
  peakPeriod: string;
  resistantVarieties?: string[];
  irrigationCritical?: string;
}

export const REGIONAL_PEST_PROFILES: RegionalPestProfile[] = [
  {
    region: 'Maharashtra-Vidarbha',
    crop: 'Cotton',
    majorPests: ['Bollworm', 'Aphids', 'Whitefly', 'Pink bollworm'],
    peakPeriod: 'September-November',
    resistantVarieties: ['Bt cotton hybrids'],
    irrigationCritical: 'Flowering and boll formation',
  },
  {
    region: 'Punjab-Haryana',
    crop: 'Rice',
    majorPests: ['Pink stem borer', 'Brown plant hopper'],
    peakPeriod: 'August-September',
    resistantVarieties: ['Pusa 44', 'PR 126'],
  },
  {
    region: 'Punjab-Haryana',
    crop: 'Wheat',
    majorPests: ['Yellow rust', 'Brown rust', 'Karnal bunt'],
    peakPeriod: 'February-March',
    resistantVarieties: ['HD 3086', 'PBW 725'],
    irrigationCritical: 'Crown root (21-25 DAS)',
  },
  {
    region: 'Kerala-Coastal',
    crop: 'Rice',
    majorPests: ['Leaf folder', 'Stem borer', 'Blast'],
    peakPeriod: 'Throughout monsoon',
    resistantVarieties: ['Jyothi', 'Uma'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// REGIONAL & SEASONAL RULES
// ═══════════════════════════════════════════════════════════════════════════

export const REGIONAL_SEASONAL_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // KHARIF SEASON RULES (Monsoon Season)
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SEASON_001',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const humidity = num(input.weather?.humidity);
      return season === Season.KHARIF && humidity > 80;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Crop Production Guidelines',
    scientific_basis: 'Kharif season (June-October) has VERY HIGH disease risk due to monsoon humidity. Prophylactic fungicide sprays essential.',
    icar_package: 'ICAR Kharif Season Disease Management',
  },
  
  {
    rule_id: 'SEASON_002',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const pestDensity = num(input.metadata?.pestDensity);
      return season === Season.KHARIF && pestDensity > 10;
    },
    cause: Cause.PEST_OUTBREAK_DETECTED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'NCIPM Seasonal Pest Dynamics',
    scientific_basis: 'Kharif season has HIGH pest pressure due to favorable breeding conditions. Early season monitoring and biological control critical.',
    icar_package: 'ICAR Kharif Pest Management Strategy',
  },
  
  {
    rule_id: 'SEASON_003',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const waterlogged = input.soil_states?.moisture === 'WATERLOGGED';
      return season === Season.KHARIF && waterlogged;
    },
    cause: Cause.WATERLOGGING,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Drainage Management',
    scientific_basis: 'Kharif drainage more important than irrigation. Ensure field drainage before monsoon. Waterlogging causes root rot.',
    icar_package: 'ICAR Monsoon Crop Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // RABI SEASON RULES (Winter Season)
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SEASON_004',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const moisture = input.soil_states?.moisture;
      return season === Season.RABI && moisture === 'DRY';
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Rabi Irrigation Management',
    scientific_basis: 'Rabi season is irrigation dependent. Water stress causes significant yield loss in wheat, chickpea, and mustard.',
    icar_package: 'ICAR Rabi Critical Irrigation Schedule',
  },
  
  {
    rule_id: 'SEASON_005',
    category: 'seasonal',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const temp = num(input.weather?.temperature);
      const isWheat = str(input.crop_code).toLowerCase().includes('wheat');
      const isLateStage = input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY;
      return season === Season.RABI && isWheat && temp > 30 && isLateStage;
    },
    cause: Cause.TERMINAL_HEAT_WHEAT,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR-IARI Wheat Terminal Heat Guidelines',
    scientific_basis: 'Terminal heat (>30°C during grain filling) causes 5% yield loss per day. Light irrigation for cooling, early harvest if >35°C.',
    icar_package: 'ICAR Terminal Heat Management in Wheat',
  },
  
  {
    rule_id: 'SEASON_006',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const frostRisk = input.weather_state === 'FROST_RISK';
      return season === Season.RABI && frostRisk;
    },
    cause: Cause.FROST_DAMAGE_RISK,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'ICAR Frost Protection Guidelines',
    scientific_basis: 'Rabi crops (wheat, potato, vegetables) susceptible to frost damage. Light irrigation, smoke/fog generation for protection.',
    icar_package: 'ICAR Winter Crop Protection',
  },
  
  {
    rule_id: 'SEASON_007',
    category: 'seasonal',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const isWheat = str(input.crop_code).toLowerCase().includes('wheat');
      const humidity = num(input.weather?.humidity);
      // Rust favorable conditions
      return season === Season.RABI && isWheat && humidity > 70;
    },
    cause: Cause.WHEAT_RUST_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IARI Rust Management',
    scientific_basis: 'Monitor for cold-weather diseases (yellow rust, brown rust) in February-March. Scout weekly during high humidity periods.',
    icar_package: 'ICAR Wheat Disease Surveillance',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ZAID SEASON RULES (Summer Season)
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'SEASON_008',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const temp = num(input.weather?.temperature);
      return season === Season.ZAID && temp > 40;
    },
    cause: Cause.HEAT_STRESS_SEVERE,
    priority: PriorityLevel.P1_REGULATORY,
    scientific_source: 'ICAR Summer Crop Management',
    scientific_basis: 'Zaid crops face extreme heat stress. Increase irrigation frequency, mulching, shade nets for vegetables.',
    icar_package: 'ICAR Summer Stress Mitigation',
  },
  
  {
    rule_id: 'SEASON_009',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const moisture = input.soil_states?.moisture;
      return season === Season.ZAID && moisture === 'DRY';
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR Zaid Irrigation Management',
    scientific_basis: 'Zaid season irrigation is CRITICAL. High evapotranspiration requires daily/alternate day irrigation for vegetables.',
    icar_package: 'ICAR Zaid Crop Water Management',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // ZONE-SPECIFIC RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'ZONE_001',
    category: 'regional',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input: DecisionInput): boolean => {
      const zone = input.metadata?.agroClimaticZone;
      const isCotton = str(input.crop_code).toLowerCase().includes('cotton');
      const isVidarbha = zone === AgroClimaticZone.ZONE_9_WESTERN_PLATEAU || 
                         str(input.metadata?.region).toLowerCase().includes('vidarbha');
      return isCotton && isVidarbha;
    },
    cause: Cause.BOLLWORM_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CICR Vidarbha Cotton Package',
    scientific_basis: 'Maharashtra Vidarbha: Peak bollworm pressure September-November. Use Bt cotton + pheromone traps + Trichogramma.',
    icar_package: 'ICAR-CICR Regional Cotton IPM',
  },
  
  {
    rule_id: 'ZONE_002',
    category: 'regional',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const zone = input.metadata?.agroClimaticZone;
      const isHighRainfallZone = zone === AgroClimaticZone.ZONE_12_WEST_COAST ||
                                 zone === AgroClimaticZone.ZONE_2_EASTERN_HIMALAYAS;
      return isHighRainfallZone;
    },
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Coastal Zone Management',
    scientific_basis: 'High rainfall zones (West Coast, Eastern Himalayas) have VERY HIGH disease risk. Continuous fungicide protection and drainage critical.',
    icar_package: 'ICAR High Rainfall Zone Disease Management',
  },
  
  {
    rule_id: 'ZONE_003',
    category: 'regional',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const zone = input.metadata?.agroClimaticZone;
      const moisture = input.soil_states?.moisture;
      const isPunjabHaryana = zone === AgroClimaticZone.ZONE_6_TRANS_GANGETIC;
      return isPunjabHaryana && moisture === 'DRY';
    },
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: PriorityLevel.P2_WEATHER_SAFETY,
    scientific_source: 'ICAR Punjab-Haryana Water Management',
    scientific_basis: 'Trans-Gangetic zone (Punjab-Haryana) faces critical groundwater depletion. Promote drip irrigation, laser leveling, and crop diversification.',
    icar_package: 'ICAR Groundwater Conservation Strategy',
  },
  
  {
    rule_id: 'ZONE_004',
    category: 'regional',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const zone = input.metadata?.agroClimaticZone;
      const isCentralPlateau = zone === AgroClimaticZone.ZONE_8_CENTRAL_PLATEAU ||
                               zone === AgroClimaticZone.ZONE_9_WESTERN_PLATEAU;
      const rainfed = bool(input.metadata?.rainfedAgriculture);
      return isCentralPlateau && rainfed;
    },
    cause: Cause.DROUGHT_STRESS,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CRIDA Dryland Agriculture',
    scientific_basis: 'Central/Western Plateau zones: Rainfed agriculture dominant. Implement soil moisture conservation, mulching, contingency crops.',
    icar_package: 'ICAR-CRIDA Dryland Farming Package',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // MONSOON ADAPTATION RULES
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'MONSOON_001',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const month = new Date().getMonth();
      const isJuneJuly = month === 5 || month === 6;
      const sowingPlanned = bool(input.metadata?.sowingPlanned);
      const noRain = input.weather_state !== 'RAIN_ACTIVE' && input.weather_state !== 'RAIN_EXPECTED';
      return isJuneJuly && sowingPlanned && noRain;
    },
    cause: Cause.DROUGHT_STRESS,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'IMD Monsoon Advisory',
    scientific_basis: 'Kharif sowing depends on monsoon onset. Delay sowing if monsoon delayed. Use contingency crop varieties if delayed >2 weeks.',
    icar_package: 'ICAR Contingency Crop Planning',
  },
  
  {
    rule_id: 'MONSOON_002',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const heavyRain = num(input.metadata?.rainfallLast24h) > 50;
      return season === Season.KHARIF && heavyRain;
    },
    cause: Cause.FLOOD_EMERGENCY,
    priority: PriorityLevel.P0_EMERGENCY,
    scientific_source: 'ICAR Flood Management',
    scientific_basis: 'Heavy monsoon rain (>50mm/day) requires immediate drainage. Post-flood: disease prevention spray + nitrogen top dress.',
    icar_package: 'ICAR Post-Flood Crop Recovery',
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE PRESSURE MULTIPLIERS BY SEASON
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'PRESSURE_001',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const diseaseObserved = bool(input.metadata?.diseaseSymptoms);
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      // Kharif: reduce disease threshold by 50% (more aggressive treatment)
      return season === Season.KHARIF && diseaseObserved && dsi > 5;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR Seasonal Disease Management',
    scientific_basis: 'Kharif season: Reduce disease action threshold by 50% due to high disease pressure. Preventive fungicide at DSI > 5%.',
    icar_package: 'ICAR Monsoon Disease Thresholds',
  },
  
  {
    rule_id: 'PRESSURE_002',
    category: 'seasonal',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const season = input.metadata?.currentSeason;
      const diseaseObserved = bool(input.metadata?.diseaseSymptoms);
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      // Rabi: normal thresholds
      return season === Season.RABI && diseaseObserved && dsi > 10;
    },
    cause: Cause.DISEASE_SEVERITY_THRESHOLD_EXCEEDED,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR Seasonal Disease Management',
    scientific_basis: 'Rabi season: Lower disease pressure allows standard action threshold of DSI > 10%. Targeted intervention only.',
    icar_package: 'ICAR Rabi Disease Management',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current season based on date
 */
export function getCurrentSeason(date: Date = new Date()): Season {
  const month = date.getMonth();
  if (month >= 5 && month <= 9) {
    return Season.KHARIF; // June-October
  } else if (month >= 9 || month <= 2) {
    return Season.RABI; // October-March
  }
  return Season.ZAID; // March-June
}

/**
 * Get season data
 */
export function getSeasonData(season: Season): SeasonData | undefined {
  return SEASON_DATA.find(s => s.season === season);
}

/**
 * Get zone data
 */
export function getZoneData(zone: AgroClimaticZone): ZoneData | undefined {
  return ZONE_DATA.find(z => z.zone === zone);
}

/**
 * Get regional pest profile
 */
export function getRegionalPestProfile(region: string, crop: string): RegionalPestProfile | undefined {
  return REGIONAL_PEST_PROFILES.find(
    p => p.region.toLowerCase().includes(region.toLowerCase()) && 
         p.crop.toLowerCase() === crop.toLowerCase()
  );
}

/**
 * Adjust threshold based on season
 */
export function adjustThresholdForSeason(
  baseThreshold: number,
  season: Season,
  type: 'pest' | 'disease'
): number {
  const seasonData = getSeasonData(season);
  if (!seasonData) return baseThreshold;
  
  if (type === 'disease') {
    if (seasonData.diseaseRisk === 'VERY_HIGH') return baseThreshold * 0.5;
    if (seasonData.diseaseRisk === 'HIGH') return baseThreshold * 0.7;
    if (seasonData.diseaseRisk === 'LOW') return baseThreshold * 1.3;
  } else {
    if (seasonData.pestPressure === 'HIGH' || seasonData.pestPressure === 'VERY_HIGH') return baseThreshold * 0.7;
    if (seasonData.pestPressure === 'LOW') return baseThreshold * 1.3;
  }
  
  return baseThreshold;
}

/**
 * Get seasonal recommendations
 */
export function getSeasonalRecommendations(season: Season): {
  priorities: string[];
  mandatoryPractices: string[];
  monitoring: string[];
} {
  if (season === Season.KHARIF) {
    return {
      priorities: ['Disease prevention', 'Drainage management', 'Early pest monitoring'],
      mandatoryPractices: ['Seed treatment', 'Resistant varieties', 'Prophylactic fungicide'],
      monitoring: ['Weekly disease scouting', 'Pheromone traps for bollworm', 'Drainage checks after rain'],
    };
  } else if (season === Season.RABI) {
    return {
      priorities: ['Irrigation management', 'Cold protection', 'Targeted disease control'],
      mandatoryPractices: ['Critical stage irrigation', 'Frost protection measures'],
      monitoring: ['Rust surveillance in wheat', 'Soil moisture monitoring', 'Temperature tracking'],
    };
  }
  return {
    priorities: ['Irrigation', 'Heat stress management', 'Pest monitoring'],
    mandatoryPractices: ['Daily irrigation', 'Mulching', 'Shade protection'],
    monitoring: ['Daily soil moisture', 'Temperature monitoring', 'Fruit fly traps'],
  };
}

export default REGIONAL_SEASONAL_RULES;
