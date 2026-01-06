/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMERGENCY & CRISIS RULES - PRODUCTION GRADE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P0 (Emergency Override)
 * Based on: FAO Emergency Response Protocol, ICAR-CRIDA, State Contingency Plans
 * 
 * These rules handle pest/disease outbreaks, weather crises, and emergency situations.
 */

import { 
  CauseRule, 
  Cause, 
  CropStage,
  SoilMoistureState,
  PRIORITY_LEVEL_TO_NUMERIC,
  PriorityLevel,
  DecisionInput 
} from '../types';

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
// EMERGENCY TYPES AND PROTOCOLS
// ═══════════════════════════════════════════════════════════════════════════

export interface OutbreakDefinition {
  type: 'pest' | 'disease';
  suddenOnsetThreshold: number;
  rapidSpreadThreshold: number;
  severityThreshold: number;
}

export const OUTBREAK_THRESHOLDS: OutbreakDefinition = {
  type: 'pest',
  suddenOnsetThreshold: 30,
  rapidSpreadThreshold: 10,
  severityThreshold: 60,
};

export interface WeatherEmergency {
  type: 'drought' | 'flood' | 'hailstorm' | 'heat_wave' | 'frost' | 'cyclone';
  indicators: string[];
  immediateActions: string[];
  mediumTermActions?: string[];
  longTermActions?: string[];
}

export const WEATHER_EMERGENCIES: Record<string, WeatherEmergency> = {
  drought: {
    type: 'drought',
    indicators: ['Rainfall deficit >50% of normal', 'Soil moisture <20% field capacity', 'Crop wilting widespread'],
    immediateActions: ['Life-saving irrigation (if available)', 'Mulching to conserve moisture', 'Anti-transpirant spray (kaolin clay)'],
    mediumTermActions: ['Thinning to reduce plant population', 'Foliar nutrition (reduce root demand)'],
    longTermActions: ['Crop insurance claim', 'Consider early harvest/grazing use'],
  },
  flood: {
    type: 'flood',
    indicators: ['Waterlogging >48 hours', 'Submergence of crop'],
    immediateActions: ['Drain excess water ASAP', 'Prevent soil compaction'],
    mediumTermActions: ['Disease prevention (copper spray)', 'Nitrogen top dress (leaching loss recovery)', 'Micronutrient spray (reduced uptake recovery)'],
  },
  hailstorm: {
    type: 'hailstorm',
    indicators: ['Physical injury to plants'],
    immediateActions: ['Prophylactic fungicide (prevent infection through wounds)', 'Fertilizer spray for recovery', 'Remove severely damaged parts', 'Insurance assessment within 72 hours'],
  },
  heat_wave: {
    type: 'heat_wave',
    indicators: ['Temperature >40°C for >3 days'],
    immediateActions: ['Increase irrigation frequency', 'Light irrigation in afternoon (cooling)', 'Anti-transpirant spray', 'Avoid fertilizer/pesticide application'],
  },
  frost: {
    type: 'frost',
    indicators: ['Temperature <0°C forecast', 'Clear sky, calm wind conditions'],
    immediateActions: ['Light irrigation before frost (soil heat release)', 'Smoke/fog generation in extreme cases', 'Cover nurseries and high-value crops'],
  },
  cyclone: {
    type: 'cyclone',
    indicators: ['IMD cyclone warning issued', 'Wind speed >60 kmph expected'],
    immediateActions: ['Harvest mature crops immediately', 'Stake tall crops (banana, sugarcane)', 'Drain excess water from fields', 'Protect harvested produce'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY RULES
// ═══════════════════════════════════════════════════════════════════════════

export const EMERGENCY_RULES: CauseRule[] = [
  // PEST OUTBREAK DETECTION
  {
    rule_id: 'EMERGENCY_001',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const fieldAffected = num(input.metadata?.fieldAffectedPercent);
      const daysToReach = num(input.metadata?.daysToReachCurrentLevel, 30);
      const dailyIncrease = num(input.metadata?.dailyIncreasePercent);
      
      const isSuddenOnset = fieldAffected >= 30 && daysToReach <= 7;
      const isRapidSpread = dailyIncrease >= 10;
      const isSevere = fieldAffected >= 60;
      
      return (isSuddenOnset && isRapidSpread) || isSevere;
    },
    cause: Cause.PEST_OUTBREAK_DETECTED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'FAO Emergency Response Protocol',
    scientific_basis: 'Outbreak = >30% field in <7 days OR >10% daily increase OR >60% crop at risk. Requires immediate escalation and emergency chemical authorization.',
    icar_package: 'ICAR Outbreak Management Guidelines',
  },

  // DISEASE OUTBREAK DETECTION
  {
    rule_id: 'EMERGENCY_002',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const dsi = num(input.metadata?.diseaseSeverityIndex);
      const dailyIncrease = num(input.metadata?.dsiDailyIncrease);
      const diseaseType = str(input.metadata?.diseaseType).toLowerCase();
      
      const isDangerousDisease = ['late_blight', 'blast', 'downy_mildew'].includes(diseaseType);
      
      return (dsi >= 40 && dailyIncrease >= 5) || (isDangerousDisease && dsi >= 25);
    },
    cause: Cause.DISEASE_OUTBREAK_DETECTED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'ICAR Disease Emergency Protocol',
    scientific_basis: 'Disease outbreak when DSI >40% with rapid spread, or >25% for highly aggressive diseases.',
    icar_package: 'FAO Disease Outbreak Management',
  },

  // LOCUST SWARM EMERGENCY
  {
    rule_id: 'EMERGENCY_003',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      return bool(input.metadata?.locustSwarmDetected) || bool(input.metadata?.locustWarningIssued);
    },
    cause: Cause.LOCUST_SWARM_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'FAO Locust Outbreak Management',
    scientific_basis: 'Locust swarms can destroy 100% of crops in hours. Immediate coordinated response required.',
    icar_package: 'ICAR Locust Control Guidelines',
  },

  // ARMYWORM INVASION
  {
    rule_id: 'EMERGENCY_004',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const pest = str(input.metadata?.pestType).toLowerCase();
      const larvaeCount = num(input.metadata?.larvaeCount);
      return pest.includes('armyworm') && larvaeCount >= 10;
    },
    cause: Cause.ARMYWORM_INVASION,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Fall Armyworm Emergency Protocol',
    scientific_basis: 'Fall armyworm spreads rapidly and has developed multiple resistances. Early intervention critical.',
    icar_package: 'ICAR Fall Armyworm Management',
  },

  // DROUGHT EMERGENCY
  {
    rule_id: 'EMERGENCY_005',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const rainfallDeficit = num(input.metadata?.rainfallDeficitPercent);
      const soilMoisture = input.soil_states?.moisture;
      const wiltingObserved = bool(input.metadata?.wiltingObserved);
      
      return rainfallDeficit >= 50 || soilMoisture === SoilMoistureState.DRY || wiltingObserved;
    },
    cause: Cause.DROUGHT_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'ICAR-CRIDA Drought Management',
    scientific_basis: 'Rainfall deficit >50% OR soil moisture <20% field capacity OR widespread wilting indicates drought emergency.',
    icar_package: 'State Contingency Crop Planning',
  },

  // FLOOD EMERGENCY
  {
    rule_id: 'EMERGENCY_006',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const waterloggingHours = num(input.metadata?.waterloggingHours);
      const submergence = bool(input.metadata?.cropSubmerged);
      
      return waterloggingHours >= 48 || submergence;
    },
    cause: Cause.FLOOD_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Flood Damage Management',
    scientific_basis: 'Waterlogging >48 hours causes root damage and disease. Immediate drainage critical.',
    icar_package: 'ICAR Flood Recovery Guidelines',
  },

  // HAILSTORM EMERGENCY
  {
    rule_id: 'EMERGENCY_007',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      return bool(input.metadata?.hailstormOccurred) || bool(input.metadata?.physicalDamageObserved);
    },
    cause: Cause.HAILSTORM_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Hail Damage Management',
    scientific_basis: 'Physical damage from hail creates wounds for pathogen entry. Immediate prophylactic fungicide required.',
    icar_package: 'Post-Hail Recovery Protocol',
  },

  // HEAT WAVE EMERGENCY
  {
    rule_id: 'EMERGENCY_008',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const currentTemp = input.weather?.temperature ?? 25;
      const consecutiveHotDays = num(input.metadata?.consecutiveDaysAbove40);
      
      return currentTemp >= 42 || consecutiveHotDays >= 3;
    },
    cause: Cause.HEAT_WAVE_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Heat Stress Management',
    scientific_basis: 'Temperature >40°C for >3 days causes severe heat stress.',
    icar_package: 'ICAR-CRIDA Heat Wave Management',
  },

  // FROST EMERGENCY
  {
    rule_id: 'EMERGENCY_009',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const currentTemp = input.weather?.temperature ?? 25;
      const frostWarning = bool(input.metadata?.frostWarningIssued);
      
      return currentTemp <= 2 || frostWarning;
    },
    cause: Cause.FROST_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Frost Protection Guidelines',
    scientific_basis: 'Frost damages cell membranes and kills sensitive crops.',
    icar_package: 'Cold Weather Crop Protection',
  },

  // CYCLONE EMERGENCY
  {
    rule_id: 'EMERGENCY_010',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const windSpeed = input.weather?.wind_speed ?? 0;
      return bool(input.metadata?.cycloneWarningIssued) || windSpeed >= 60;
    },
    cause: Cause.CYCLONE_EMERGENCY,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'IMD Cyclone Preparedness',
    scientific_basis: 'Cyclone with wind >60 kmph causes mechanical damage and lodging.',
    icar_package: 'Coastal Agriculture Cyclone Management',
  },

  // EMERGENCY CHEMICAL AUTHORIZATION
  {
    rule_id: 'EMERGENCY_011',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const isOutbreak = bool(input.metadata?.outbreakDeclared);
      const allLowerLevelsFailed = bool(input.metadata?.allIPMLevelsFailed);
      const cropAtRisk = num(input.metadata?.fieldAffectedPercent) >= 60;
      
      return isOutbreak && allLowerLevelsFailed && cropAtRisk;
    },
    cause: Cause.EMERGENCY_CHEMICAL_AUTHORIZED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Emergency Pest Control Protocol',
    scientific_basis: 'Emergency chemical use authorized only when: outbreak declared, all IPM levels failed, >60% crop at risk.',
    icar_package: 'FAO Emergency Pesticide Protocol',
  },

  // SALVAGE HARVEST RECOMMENDATION
  {
    rule_id: 'EMERGENCY_012',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input: DecisionInput): boolean => {
      const damagePercent = num(input.metadata?.cropDamagePercent);
      const recoveryPossible = bool(input.metadata?.recoveryPossible);
      const isNearMaturity = input.crop_stage === CropStage.MATURITY;
      
      return damagePercent >= 50 && !recoveryPossible && isNearMaturity;
    },
    cause: Cause.SALVAGE_HARVEST_RECOMMENDED,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P0_EMERGENCY],
    scientific_source: 'Crop Loss Mitigation',
    scientific_basis: 'When damage >50% and recovery not possible near maturity, salvage harvest minimizes further loss.',
    icar_package: 'Emergency Harvest Guidelines',
  },

  // INSURANCE CLAIM ADVISORY
  {
    rule_id: 'EMERGENCY_013',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput): boolean => {
      const significantLoss = num(input.metadata?.cropDamagePercent) >= 33;
      const hasInsurance = bool(input.metadata?.hasCropInsurance);
      const emergencyOccurred = bool(input.metadata?.droughtEmergency) || 
                                bool(input.metadata?.floodEmergency) || 
                                bool(input.metadata?.hailstormOccurred);
      
      return significantLoss && hasInsurance && emergencyOccurred;
    },
    cause: Cause.INSURANCE_CLAIM_ELIGIBLE,
    priority: PRIORITY_LEVEL_TO_NUMERIC[PriorityLevel.P3_CROP_STAGE],
    scientific_source: 'PMFBY Guidelines',
    scientific_basis: 'Crop loss >33% from natural calamity eligible for insurance claim. Report within 72 hours.',
    icar_package: 'Pradhan Mantri Fasal Bima Yojana',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function isOutbreak(
  fieldAffectedPercent: number,
  daysToReach: number,
  dailyIncrease: number
): boolean {
  const isSuddenOnset = fieldAffectedPercent >= 30 && daysToReach <= 7;
  const isRapidSpread = dailyIncrease >= 10;
  const isSevere = fieldAffectedPercent >= 60;
  
  return (isSuddenOnset && isRapidSpread) || isSevere;
}

export function getWeatherEmergencyProtocol(weatherType: string): WeatherEmergency | undefined {
  return WEATHER_EMERGENCIES[weatherType.toLowerCase()];
}

export function getImmediateActions(emergencyType: string): string[] {
  const protocol = WEATHER_EMERGENCIES[emergencyType.toLowerCase()];
  return protocol?.immediateActions || [
    'Assess damage extent',
    'Document with photos',
    'Contact local agriculture officer',
    'Report to insurance if applicable',
  ];
}

export function calculateEmergencyPriority(
  damagePercent: number,
  spreadRate: number,
  cropStage: string,
  cropValue: number
): number {
  let priority = 0;
  
  if (damagePercent >= 60) priority += 40;
  else if (damagePercent >= 40) priority += 30;
  else if (damagePercent >= 20) priority += 20;
  
  if (spreadRate >= 15) priority += 30;
  else if (spreadRate >= 10) priority += 20;
  else if (spreadRate >= 5) priority += 10;
  
  if (['reproductive', 'maturity'].includes(cropStage)) priority += 20;
  
  if (cropValue > 100000) priority += 10;
  
  return Math.min(priority, 100);
}

export default EMERGENCY_RULES;
