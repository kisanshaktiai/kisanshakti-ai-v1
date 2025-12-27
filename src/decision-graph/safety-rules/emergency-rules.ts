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
  PriorityLevel,
  DecisionInput 
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY TYPES AND PROTOCOLS
// ═══════════════════════════════════════════════════════════════════════════

export interface OutbreakDefinition {
  type: 'pest' | 'disease';
  suddenOnsetThreshold: number; // % field affected in < 7 days
  rapidSpreadThreshold: number; // % daily increase
  severityThreshold: number; // % crop loss threat
}

export const OUTBREAK_THRESHOLDS: OutbreakDefinition = {
  type: 'pest',
  suddenOnsetThreshold: 30, // >30% field in <7 days
  rapidSpreadThreshold: 10, // >10% daily increase
  severityThreshold: 60, // >60% crop loss threat
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
    indicators: [
      'Rainfall deficit >50% of normal',
      'Soil moisture <20% field capacity',
      'Crop wilting widespread',
    ],
    immediateActions: [
      'Life-saving irrigation (if available)',
      'Mulching to conserve moisture',
      'Anti-transpirant spray (kaolin clay)',
    ],
    mediumTermActions: [
      'Thinning to reduce plant population',
      'Foliar nutrition (reduce root demand)',
    ],
    longTermActions: [
      'Crop insurance claim',
      'Consider early harvest/grazing use',
    ],
  },
  flood: {
    type: 'flood',
    indicators: [
      'Waterlogging >48 hours',
      'Submergence of crop',
    ],
    immediateActions: [
      'Drain excess water ASAP',
      'Prevent soil compaction',
    ],
    mediumTermActions: [
      'Disease prevention (copper spray)',
      'Nitrogen top dress (leaching loss recovery)',
      'Micronutrient spray (reduced uptake recovery)',
    ],
  },
  hailstorm: {
    type: 'hailstorm',
    indicators: ['Physical injury to plants'],
    immediateActions: [
      'Prophylactic fungicide (prevent infection through wounds)',
      'Fertilizer spray for recovery',
      'Remove severely damaged parts',
      'Insurance assessment within 72 hours',
    ],
  },
  heat_wave: {
    type: 'heat_wave',
    indicators: ['Temperature >40°C for >3 days'],
    immediateActions: [
      'Increase irrigation frequency',
      'Light irrigation in afternoon (cooling)',
      'Anti-transpirant spray',
      'Avoid fertilizer/pesticide application',
    ],
  },
  frost: {
    type: 'frost',
    indicators: [
      'Temperature <0°C forecast',
      'Clear sky, calm wind conditions',
    ],
    immediateActions: [
      'Light irrigation before frost (soil heat release)',
      'Smoke/fog generation in extreme cases',
      'Cover nurseries and high-value crops',
    ],
  },
  cyclone: {
    type: 'cyclone',
    indicators: [
      'IMD cyclone warning issued',
      'Wind speed >60 kmph expected',
    ],
    immediateActions: [
      'Harvest mature crops immediately',
      'Stake tall crops (banana, sugarcane)',
      'Drain excess water from fields',
      'Protect harvested produce',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EMERGENCY RULES
// ═══════════════════════════════════════════════════════════════════════════

export const EMERGENCY_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PEST OUTBREAK DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_001',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const fieldAffected = input.metadata?.fieldAffectedPercent || 0;
      const daysToReach = input.metadata?.daysToReachCurrentLevel || 30;
      const dailyIncrease = input.metadata?.dailyIncreasePercent || 0;
      
      const isSuddenOnset = fieldAffected >= 30 && daysToReach <= 7;
      const isRapidSpread = dailyIncrease >= 10;
      const isSevere = fieldAffected >= 60;
      
      return (isSuddenOnset && isRapidSpread) || isSevere;
    },
    cause: Cause.PEST_OUTBREAK_DETECTED,
    priority: PriorityLevel.P0,
    scientific_source: 'FAO Emergency Response Protocol',
    scientific_basis: 'Outbreak = >30% field in <7 days OR >10% daily increase OR >60% crop at risk. Requires immediate escalation and emergency chemical authorization.',
    icar_package: 'ICAR Outbreak Management Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE OUTBREAK DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_002',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const dsi = input.metadata?.diseaseSeverityIndex || 0;
      const dailyIncrease = input.metadata?.dsiDailyIncrease || 0;
      const diseaseType = input.metadata?.diseaseType?.toLowerCase() || '';
      
      // Late blight and blast are especially dangerous
      const isDangerousDisease = ['late_blight', 'blast', 'downy_mildew'].includes(diseaseType);
      
      return (dsi >= 40 && dailyIncrease >= 5) || (isDangerousDisease && dsi >= 25);
    },
    cause: Cause.DISEASE_OUTBREAK_DETECTED,
    priority: PriorityLevel.P0,
    scientific_source: 'ICAR Disease Emergency Protocol',
    scientific_basis: 'Disease outbreak when DSI >40% with rapid spread, or >25% for highly aggressive diseases. Immediate intensive treatment required.',
    icar_package: 'FAO Disease Outbreak Management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOCUST SWARM EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_003',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      return input.metadata?.locustSwarmDetected || 
             input.metadata?.locustWarningIssued;
    },
    cause: Cause.LOCUST_SWARM_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'FAO Locust Outbreak Management',
    scientific_basis: 'Locust swarms can destroy 100% of crops in hours. Immediate coordinated response with government agencies required.',
    icar_package: 'ICAR Locust Control Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ARMYWORM INVASION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_004',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const pest = input.metadata?.pestType?.toLowerCase() || '';
      const larvaeCount = input.metadata?.larvaeCount || 0;
      return pest.includes('armyworm') && larvaeCount >= 10;
    },
    cause: Cause.ARMYWORM_INVASION,
    priority: PriorityLevel.P0,
    scientific_source: 'Fall Armyworm Emergency Protocol',
    scientific_basis: 'Fall armyworm (Spodoptera frugiperda) spreads rapidly and has developed multiple resistances. Early intervention critical.',
    icar_package: 'ICAR Fall Armyworm Management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DROUGHT EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_005',
    category: 'weather',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const rainfallDeficit = input.metadata?.rainfallDeficitPercent || 0;
      const soilMoisture = input.soil?.moisture_state || '';
      const wiltingObserved = input.metadata?.wiltingObserved;
      
      return rainfallDeficit >= 50 || soilMoisture === 'critical_low' || wiltingObserved;
    },
    cause: Cause.DROUGHT_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'ICAR-CRIDA Drought Management',
    scientific_basis: 'Rainfall deficit >50% OR soil moisture <20% field capacity OR widespread wilting indicates drought emergency requiring immediate water conservation measures.',
    icar_package: 'State Contingency Crop Planning',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FLOOD EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_006',
    category: 'weather',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const waterloggingHours = input.metadata?.waterloggingHours || 0;
      const submergence = input.metadata?.cropSubmerged;
      
      return waterloggingHours >= 48 || submergence;
    },
    cause: Cause.FLOOD_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'Flood Damage Management',
    scientific_basis: 'Waterlogging >48 hours causes root damage and disease. Immediate drainage and post-flood disease prevention critical.',
    icar_package: 'ICAR Flood Recovery Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HAILSTORM EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_007',
    category: 'weather',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      return input.metadata?.hailstormOccurred || input.metadata?.physicalDamageObserved;
    },
    cause: Cause.HAILSTORM_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'Hail Damage Management',
    scientific_basis: 'Physical damage from hail creates wounds for pathogen entry. Immediate prophylactic fungicide and recovery nutrition required.',
    icar_package: 'Post-Hail Recovery Protocol',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HEAT WAVE EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_008',
    category: 'weather',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const currentTemp = input.weather?.temperature || 25;
      const consecutiveHotDays = input.metadata?.consecutiveDaysAbove40 || 0;
      
      return currentTemp >= 42 || consecutiveHotDays >= 3;
    },
    cause: Cause.HEAT_WAVE_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'Heat Stress Management',
    scientific_basis: 'Temperature >40°C for >3 days causes severe heat stress. Increased irrigation, anti-transpirants, avoid all chemical applications.',
    icar_package: 'ICAR-CRIDA Heat Wave Management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FROST EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_009',
    category: 'weather',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const currentTemp = input.weather?.temperature || 25;
      const frostWarning = input.metadata?.frostWarningIssued;
      
      return currentTemp <= 2 || frostWarning;
    },
    cause: Cause.FROST_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'Frost Protection Guidelines',
    scientific_basis: 'Frost damages cell membranes and kills sensitive crops. Light irrigation before frost releases soil heat. Cover high-value crops.',
    icar_package: 'Cold Weather Crop Protection',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CYCLONE EMERGENCY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_010',
    category: 'weather',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      return input.metadata?.cycloneWarningIssued || 
             (input.weather?.wind_speed || 0) >= 60;
    },
    cause: Cause.CYCLONE_EMERGENCY,
    priority: PriorityLevel.P0,
    scientific_source: 'IMD Cyclone Preparedness',
    scientific_basis: 'Cyclone with wind >60 kmph causes mechanical damage and lodging. Harvest mature crops immediately, stake tall crops, ensure drainage.',
    icar_package: 'Coastal Agriculture Cyclone Management',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EMERGENCY CHEMICAL AUTHORIZATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_011',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const isOutbreak = input.metadata?.outbreakDeclared;
      const allLowerLevelsFailed = input.metadata?.allIPMLevelsFailed;
      const cropAtRisk = (input.metadata?.fieldAffectedPercent || 0) >= 60;
      
      return isOutbreak && allLowerLevelsFailed && cropAtRisk;
    },
    cause: Cause.EMERGENCY_CHEMICAL_AUTHORIZED,
    priority: PriorityLevel.P0,
    scientific_source: 'Emergency Pest Control Protocol',
    scientific_basis: 'Emergency chemical use authorized only when: outbreak declared, all IPM levels failed, >60% crop at risk. Expert approval mandatory.',
    icar_package: 'FAO Emergency Pesticide Protocol',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SALVAGE HARVEST RECOMMENDATION
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_012',
    category: 'emergency',
    crop_code: 'all',
    stage_applicable: ['maturity', 'late_maturity'],
    conditions: (input: DecisionInput) => {
      const damagePercent = input.metadata?.cropDamagePercent || 0;
      const recoveryPossible = input.metadata?.recoveryPossible;
      const isNearMaturity = ['maturity', 'late_maturity', 'grain_filling'].includes(input.crop_stage);
      
      return damagePercent >= 50 && !recoveryPossible && isNearMaturity;
    },
    cause: Cause.SALVAGE_HARVEST_RECOMMENDED,
    priority: PriorityLevel.P0,
    scientific_source: 'Crop Loss Mitigation',
    scientific_basis: 'When damage >50% and recovery not possible near maturity, salvage harvest minimizes further loss. Better partial harvest than total loss.',
    icar_package: 'Emergency Harvest Guidelines',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INSURANCE CLAIM ADVISORY
  // ─────────────────────────────────────────────────────────────────────────
  {
    rule_id: 'EMERGENCY_013',
    category: 'advisory',
    crop_code: 'all',
    stage_applicable: [],
    conditions: (input: DecisionInput) => {
      const significantLoss = (input.metadata?.cropDamagePercent || 0) >= 33;
      const hasInsurance = input.metadata?.hasCropInsurance;
      const emergencyOccurred = input.metadata?.droughtEmergency || 
                                input.metadata?.floodEmergency || 
                                input.metadata?.hailstormOccurred;
      
      return significantLoss && hasInsurance && emergencyOccurred;
    },
    cause: Cause.INSURANCE_CLAIM_ELIGIBLE,
    priority: PriorityLevel.P3,
    scientific_source: 'PMFBY Guidelines',
    scientific_basis: 'Crop loss >33% from natural calamity eligible for insurance claim. Report within 72 hours, document damage with photos, contact agriculture office.',
    icar_package: 'Pradhan Mantri Fasal Bima Yojana',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine if situation qualifies as outbreak
 */
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

/**
 * Get emergency response protocol for weather type
 */
export function getWeatherEmergencyProtocol(weatherType: string): WeatherEmergency | undefined {
  return WEATHER_EMERGENCIES[weatherType.toLowerCase()];
}

/**
 * Get immediate actions for emergency type
 */
export function getImmediateActions(emergencyType: string): string[] {
  const protocol = WEATHER_EMERGENCIES[emergencyType.toLowerCase()];
  return protocol?.immediateActions || [
    'Assess damage extent',
    'Document with photos',
    'Contact local agriculture officer',
    'Report to insurance if applicable',
  ];
}

/**
 * Calculate priority score for emergency
 */
export function calculateEmergencyPriority(
  damagePercent: number,
  spreadRate: number,
  cropStage: string,
  cropValue: number
): number {
  let priority = 0;
  
  // Damage severity
  if (damagePercent >= 60) priority += 40;
  else if (damagePercent >= 40) priority += 30;
  else if (damagePercent >= 20) priority += 20;
  
  // Spread rate
  if (spreadRate >= 15) priority += 30;
  else if (spreadRate >= 10) priority += 20;
  else if (spreadRate >= 5) priority += 10;
  
  // Critical stage multiplier
  const criticalStages = ['flowering', 'grain_filling', 'boll_formation', 'fruiting'];
  if (criticalStages.includes(cropStage)) priority += 20;
  
  // High value crop multiplier
  if (cropValue >= 100000) priority += 10;
  
  return Math.min(priority, 100);
}

export default EMERGENCY_RULES;
