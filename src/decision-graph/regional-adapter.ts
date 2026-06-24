/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGIONAL ADAPTER - Agro-Climatic Zone Modifiers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Applies regional modifiers to actions based on agro-climatic zones.
 * India has 15 agro-climatic zones with distinct characteristics.
 * 
 * CRITICAL: Regional modifiers adjust priorities and dosages but NEVER
 * override core safety rules or farming mode constraints.
 * 
 * Version: 1.0.0
 * Standards: ICAR Agro-Climatic Zone Classification
 */

import {
  Action,
  ActionUrgency,
  PrioritizedAction,
  DecisionInput,
  CropGroup,
  FarmingMode
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// AGRO-CLIMATIC ZONE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export enum AgroClimaticZone {
  // Himalayan Region
  WESTERN_HIMALAYAN = 'WESTERN_HIMALAYAN',       // J&K, HP, Uttarakhand hills
  EASTERN_HIMALAYAN = 'EASTERN_HIMALAYAN',       // NE hills, Sikkim
  
  // Indo-Gangetic Plains
  LOWER_GANGETIC = 'LOWER_GANGETIC',             // West Bengal plains
  MIDDLE_GANGETIC = 'MIDDLE_GANGETIC',           // Bihar, East UP
  UPPER_GANGETIC = 'UPPER_GANGETIC',             // West UP, Haryana
  TRANS_GANGETIC = 'TRANS_GANGETIC',             // Punjab, North Haryana
  
  // Central India
  CENTRAL_PLATEAU = 'CENTRAL_PLATEAU',           // MP, Chhattisgarh, parts of MH
  WESTERN_PLATEAU = 'WESTERN_PLATEAU',           // MH, parts of Karnataka
  
  // Peninsular India
  SOUTHERN_PLATEAU = 'SOUTHERN_PLATEAU',         // Karnataka, Telangana, AP
  EAST_COAST = 'EAST_COAST',                     // TN, Coastal AP, Odisha
  WEST_COAST = 'WEST_COAST',                     // Kerala, Coastal Karnataka, Goa
  
  // Arid & Semi-Arid
  WESTERN_DRY = 'WESTERN_DRY',                   // Rajasthan, Gujarat
  GUJARAT_PLAINS = 'GUJARAT_PLAINS',             // Gujarat plains
  
  // Island
  ISLANDS = 'ISLANDS'                            // Andaman, Lakshadweep
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONE CHARACTERISTICS
// ═══════════════════════════════════════════════════════════════════════════

export interface ZoneCharacteristics {
  zone: AgroClimaticZone;
  rainfall_pattern: 'assured' | 'variable' | 'scanty' | 'heavy';
  annual_rainfall_mm: [number, number];  // [min, max]
  temperature_regime: 'tropical' | 'subtropical' | 'temperate' | 'arid';
  soil_type_dominant: string[];
  water_scarcity_risk: 'low' | 'medium' | 'high' | 'very_high';
  disease_pressure: 'low' | 'moderate' | 'high';
  typical_crops: string[];
  
  // Regional modifiers
  irrigation_urgency_modifier: number;    // -2 to +2 on priority
  disease_urgency_modifier: number;       // -2 to +2 on priority
  nutrient_dose_modifier: number;         // 0.8 to 1.2 multiplier
  spray_window_hours: [number, number];   // Best hours for spraying
}

export const ZONE_CHARACTERISTICS: Map<AgroClimaticZone, ZoneCharacteristics> = new Map([
  [AgroClimaticZone.WESTERN_HIMALAYAN, {
    zone: AgroClimaticZone.WESTERN_HIMALAYAN,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [1000, 2500],
    temperature_regime: 'temperate',
    soil_type_dominant: ['brown_hill', 'podzolic'],
    water_scarcity_risk: 'low',
    disease_pressure: 'moderate',
    typical_crops: ['wheat', 'rice', 'maize', 'apple', 'vegetables'],
    irrigation_urgency_modifier: -1,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 0.9,
    spray_window_hours: [6, 10]
  }],
  
  [AgroClimaticZone.EASTERN_HIMALAYAN, {
    zone: AgroClimaticZone.EASTERN_HIMALAYAN,
    rainfall_pattern: 'heavy',
    annual_rainfall_mm: [2000, 4000],
    temperature_regime: 'subtropical',
    soil_type_dominant: ['red_loam', 'laterite'],
    water_scarcity_risk: 'low',
    disease_pressure: 'high',
    typical_crops: ['rice', 'maize', 'tea', 'ginger', 'citrus'],
    irrigation_urgency_modifier: -2,
    disease_urgency_modifier: +1,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.UPPER_GANGETIC, {
    zone: AgroClimaticZone.UPPER_GANGETIC,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [600, 1000],
    temperature_regime: 'subtropical',
    soil_type_dominant: ['alluvial', 'sandy_loam'],
    water_scarcity_risk: 'medium',
    disease_pressure: 'moderate',
    typical_crops: ['wheat', 'rice', 'sugarcane', 'mustard', 'potato'],
    irrigation_urgency_modifier: +1,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [6, 10]
  }],
  
  [AgroClimaticZone.TRANS_GANGETIC, {
    zone: AgroClimaticZone.TRANS_GANGETIC,
    rainfall_pattern: 'scanty',
    annual_rainfall_mm: [400, 700],
    temperature_regime: 'subtropical',
    soil_type_dominant: ['alluvial', 'loamy'],
    water_scarcity_risk: 'high',
    disease_pressure: 'low',
    typical_crops: ['wheat', 'rice', 'cotton', 'sugarcane', 'maize'],
    irrigation_urgency_modifier: +2,
    disease_urgency_modifier: -1,
    nutrient_dose_modifier: 1.1,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.MIDDLE_GANGETIC, {
    zone: AgroClimaticZone.MIDDLE_GANGETIC,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [900, 1400],
    temperature_regime: 'subtropical',
    soil_type_dominant: ['alluvial', 'clay_loam'],
    water_scarcity_risk: 'medium',
    disease_pressure: 'moderate',
    typical_crops: ['rice', 'wheat', 'maize', 'pulses', 'vegetables'],
    irrigation_urgency_modifier: 0,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [6, 10]
  }],
  
  [AgroClimaticZone.LOWER_GANGETIC, {
    zone: AgroClimaticZone.LOWER_GANGETIC,
    rainfall_pattern: 'heavy',
    annual_rainfall_mm: [1400, 2000],
    temperature_regime: 'tropical',
    soil_type_dominant: ['alluvial', 'deltaic'],
    water_scarcity_risk: 'low',
    disease_pressure: 'high',
    typical_crops: ['rice', 'jute', 'vegetables', 'pulses', 'oilseeds'],
    irrigation_urgency_modifier: -1,
    disease_urgency_modifier: +1,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.CENTRAL_PLATEAU, {
    zone: AgroClimaticZone.CENTRAL_PLATEAU,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [800, 1400],
    temperature_regime: 'subtropical',
    soil_type_dominant: ['black_cotton', 'red'],
    water_scarcity_risk: 'medium',
    disease_pressure: 'moderate',
    typical_crops: ['soybean', 'cotton', 'pulses', 'wheat', 'rice'],
    irrigation_urgency_modifier: +1,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 0.95,
    spray_window_hours: [6, 10]
  }],
  
  [AgroClimaticZone.WESTERN_PLATEAU, {
    zone: AgroClimaticZone.WESTERN_PLATEAU,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [600, 1200],
    temperature_regime: 'tropical',
    soil_type_dominant: ['black_cotton', 'laterite'],
    water_scarcity_risk: 'high',
    disease_pressure: 'moderate',
    typical_crops: ['cotton', 'sugarcane', 'sorghum', 'onion', 'grapes'],
    irrigation_urgency_modifier: +2,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.SOUTHERN_PLATEAU, {
    zone: AgroClimaticZone.SOUTHERN_PLATEAU,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [500, 1000],
    temperature_regime: 'tropical',
    soil_type_dominant: ['red', 'black_cotton', 'laterite'],
    water_scarcity_risk: 'high',
    disease_pressure: 'moderate',
    typical_crops: ['cotton', 'groundnut', 'rice', 'pulses', 'sunflower'],
    irrigation_urgency_modifier: +2,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 0.95,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.EAST_COAST, {
    zone: AgroClimaticZone.EAST_COAST,
    rainfall_pattern: 'assured',
    annual_rainfall_mm: [1000, 1500],
    temperature_regime: 'tropical',
    soil_type_dominant: ['alluvial', 'coastal_sandy', 'red'],
    water_scarcity_risk: 'low',
    disease_pressure: 'high',
    typical_crops: ['rice', 'sugarcane', 'groundnut', 'banana', 'coconut'],
    irrigation_urgency_modifier: -1,
    disease_urgency_modifier: +1,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.WEST_COAST, {
    zone: AgroClimaticZone.WEST_COAST,
    rainfall_pattern: 'heavy',
    annual_rainfall_mm: [2500, 4000],
    temperature_regime: 'tropical',
    soil_type_dominant: ['laterite', 'coastal_alluvial'],
    water_scarcity_risk: 'low',
    disease_pressure: 'high',
    typical_crops: ['rice', 'coconut', 'arecanut', 'rubber', 'spices'],
    irrigation_urgency_modifier: -2,
    disease_urgency_modifier: +2,
    nutrient_dose_modifier: 0.9,
    spray_window_hours: [6, 10]
  }],
  
  [AgroClimaticZone.WESTERN_DRY, {
    zone: AgroClimaticZone.WESTERN_DRY,
    rainfall_pattern: 'scanty',
    annual_rainfall_mm: [200, 500],
    temperature_regime: 'arid',
    soil_type_dominant: ['desert', 'sandy', 'saline'],
    water_scarcity_risk: 'very_high',
    disease_pressure: 'low',
    typical_crops: ['pearl_millet', 'cluster_bean', 'cumin', 'mustard', 'fodder'],
    irrigation_urgency_modifier: +3,
    disease_urgency_modifier: -1,
    nutrient_dose_modifier: 0.85,
    spray_window_hours: [4, 8]
  }],
  
  [AgroClimaticZone.GUJARAT_PLAINS, {
    zone: AgroClimaticZone.GUJARAT_PLAINS,
    rainfall_pattern: 'variable',
    annual_rainfall_mm: [400, 1000],
    temperature_regime: 'tropical',
    soil_type_dominant: ['black_cotton', 'alluvial', 'sandy'],
    water_scarcity_risk: 'high',
    disease_pressure: 'moderate',
    typical_crops: ['cotton', 'groundnut', 'castor', 'tobacco', 'cumin'],
    irrigation_urgency_modifier: +2,
    disease_urgency_modifier: 0,
    nutrient_dose_modifier: 1.0,
    spray_window_hours: [5, 9]
  }],
  
  [AgroClimaticZone.ISLANDS, {
    zone: AgroClimaticZone.ISLANDS,
    rainfall_pattern: 'heavy',
    annual_rainfall_mm: [2000, 3500],
    temperature_regime: 'tropical',
    soil_type_dominant: ['laterite', 'coastal_sandy'],
    water_scarcity_risk: 'medium',
    disease_pressure: 'high',
    typical_crops: ['rice', 'coconut', 'arecanut', 'spices', 'banana'],
    irrigation_urgency_modifier: 0,
    disease_urgency_modifier: +1,
    nutrient_dose_modifier: 0.95,
    spray_window_hours: [5, 9]
  }]
]);

// ═══════════════════════════════════════════════════════════════════════════
// STATE TO ZONE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

export const STATE_TO_ZONE: Map<string, AgroClimaticZone> = new Map([
  // Himalayan
  ['JK', AgroClimaticZone.WESTERN_HIMALAYAN],
  ['HP', AgroClimaticZone.WESTERN_HIMALAYAN],
  ['UK', AgroClimaticZone.WESTERN_HIMALAYAN],
  ['SK', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['AR', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['NL', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['MN', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['MZ', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['TR', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['ML', AgroClimaticZone.EASTERN_HIMALAYAN],
  ['AS', AgroClimaticZone.EASTERN_HIMALAYAN],
  
  // Indo-Gangetic
  ['PB', AgroClimaticZone.TRANS_GANGETIC],
  ['HR', AgroClimaticZone.TRANS_GANGETIC],
  ['UP', AgroClimaticZone.UPPER_GANGETIC],  // Default, varies by district
  ['BR', AgroClimaticZone.MIDDLE_GANGETIC],
  ['JH', AgroClimaticZone.MIDDLE_GANGETIC],
  ['WB', AgroClimaticZone.LOWER_GANGETIC],
  
  // Central
  ['MP', AgroClimaticZone.CENTRAL_PLATEAU],
  ['CG', AgroClimaticZone.CENTRAL_PLATEAU],
  ['MH', AgroClimaticZone.WESTERN_PLATEAU],  // Default, varies by district
  
  // Peninsular
  ['KA', AgroClimaticZone.SOUTHERN_PLATEAU],  // Default
  ['TS', AgroClimaticZone.SOUTHERN_PLATEAU],
  ['AP', AgroClimaticZone.EAST_COAST],
  ['TN', AgroClimaticZone.EAST_COAST],
  ['OR', AgroClimaticZone.EAST_COAST],
  ['KL', AgroClimaticZone.WEST_COAST],
  ['GA', AgroClimaticZone.WEST_COAST],
  
  // Arid
  ['RJ', AgroClimaticZone.WESTERN_DRY],
  ['GJ', AgroClimaticZone.GUJARAT_PLAINS],
  
  // Islands
  ['AN', AgroClimaticZone.ISLANDS],
  ['LD', AgroClimaticZone.ISLANDS]
]);

// ═══════════════════════════════════════════════════════════════════════════
// REGIONAL ACTION MODIFIERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Regional modification result
 */
export interface RegionalModificationResult {
  actions: PrioritizedAction[];
  modifications_applied: string[];
  zone_used: AgroClimaticZone | null;
}

/**
 * Determine zone from input
 */
export function determineZone(input: DecisionInput): AgroClimaticZone | null {
  // Priority 1: Explicit zone in input
  if (input.agro_climatic_zone) {
    const zone = Object.values(AgroClimaticZone).find(
      z => z === input.agro_climatic_zone?.toUpperCase()
    );
    if (zone) return zone;
  }
  
  // Priority 2: State code mapping
  if (input.state_code) {
    return STATE_TO_ZONE.get(input.state_code.toUpperCase()) || null;
  }
  
  return null;
}

/**
 * Apply regional modifiers to actions
 * 
 * CRITICAL RULES:
 * 1. Never override farming mode constraints
 * 2. Never reduce priority below 1 or above 10
 * 3. Always document modifications
 * 4. Preserve action order after modification
 */
export function applyRegionalModifiers(
  actions: PrioritizedAction[],
  input: DecisionInput
): RegionalModificationResult {
  const zone = determineZone(input);
  
  if (!zone) {
    return {
      actions,
      modifications_applied: [],
      zone_used: null
    };
  }
  
  const zoneInfo = ZONE_CHARACTERISTICS.get(zone);
  if (!zoneInfo) {
    return {
      actions,
      modifications_applied: [],
      zone_used: zone
    };
  }
  
  const modifications: string[] = [];
  
  const modifiedActions = actions.map(action => {
    const modified = { ...action };
    let priorityDelta = 0;
    
    // Irrigation actions - adjust by water scarcity
    if (isIrrigationAction(action.action)) {
      priorityDelta += zoneInfo.irrigation_urgency_modifier;
      
      // Extra boost for very high water scarcity zones
      if (zoneInfo.water_scarcity_risk === 'very_high') {
        priorityDelta += 1;
      }
      
      // Reduce priority if water assured
      if (zoneInfo.water_scarcity_risk === 'low') {
        priorityDelta -= 1;
      }
    }
    
    // Disease actions - adjust by disease pressure
    if (isDiseaseAction(action.action)) {
      priorityDelta += zoneInfo.disease_urgency_modifier;
      
      // High humidity zones = higher disease risk
      if (zoneInfo.disease_pressure === 'high') {
        priorityDelta += 1;
      }
    }
    
    // Apply priority delta with bounds
    if (priorityDelta !== 0) {
      const newPriority = Math.max(1, Math.min(10, action.priority + priorityDelta));
      if (newPriority !== action.priority) {
        modified.priority = newPriority;
        modifications.push(
          `${action.action}: priority ${action.priority} → ${newPriority} (${zone})`
        );
      }
    }
    
    // Adjust urgency for critical zones
    if (zoneInfo.water_scarcity_risk === 'very_high' && isIrrigationAction(action.action)) {
      if (action.urgency === 'within_3days') {
        modified.urgency = 'within_24h' as ActionUrgency;
        modifications.push(`${action.action}: urgency elevated (water scarcity zone)`);
      }
    }
    
    return modified;
  });
  
  // Re-sort by priority after modifications
  modifiedActions.sort((a, b) => b.priority - a.priority);
  
  return {
    actions: modifiedActions,
    modifications_applied: modifications,
    zone_used: zone
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TYPE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isIrrigationAction(action: Action): boolean {
  const irrigationActions: Action[] = [
    Action.IRRIGATE_IMMEDIATELY,
    Action.IRRIGATE_LIGHT,
    Action.IRRIGATE_HEAVY,
    Action.EMERGENCY_IRRIGATION,
    Action.LIGHT_IRRIGATION_COOLING
  ];
  return irrigationActions.includes(action);
}

function isDiseaseAction(action: Action): boolean {
  const diseaseActions: Action[] = [
    Action.APPLY_FUNGICIDE,
    Action.APPLY_BIO_CONTROL,
    Action.APPLY_TRICHODERMA,
    Action.EMERGENCY_SPRAY
  ];
  return diseaseActions.includes(action);
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRAY WINDOW VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get optimal spray window for zone
 */
export function getOptimalSprayWindow(
  zone: AgroClimaticZone,
  currentHour?: number
): { 
  start_hour: number; 
  end_hour: number; 
  is_optimal_now: boolean;
  next_window_in_hours: number | null;
} {
  const zoneInfo = ZONE_CHARACTERISTICS.get(zone);
  const defaultWindow = [6, 10] as [number, number];
  const [start, end] = zoneInfo?.spray_window_hours || defaultWindow;
  
  const hour = currentHour ?? new Date().getHours();
  const isOptimalNow = hour >= start && hour <= end;
  
  let nextWindowInHours: number | null = null;
  if (!isOptimalNow) {
    if (hour < start) {
      nextWindowInHours = start - hour;
    } else {
      nextWindowInHours = (24 - hour) + start;
    }
  }
  
  return {
    start_hour: start,
    end_hour: end,
    is_optimal_now: isOptimalNow,
    next_window_in_hours: nextWindowInHours
  };
}

/**
 * Get zone-specific recommendations
 */
export function getZoneSpecificNotes(
  zone: AgroClimaticZone,
  action: Action
): string[] {
  const notes: string[] = [];
  const zoneInfo = ZONE_CHARACTERISTICS.get(zone);
  
  if (!zoneInfo) return notes;
  
  // Water-related notes
  if (isIrrigationAction(action)) {
    if (zoneInfo.water_scarcity_risk === 'very_high') {
      notes.push('advisory.regional.water_scarcity_critical');
      notes.push('advisory.regional.use_drip_if_available');
    } else if (zoneInfo.water_scarcity_risk === 'high') {
      notes.push('advisory.regional.water_scarcity_moderate');
    }
  }
  
  // Disease-related notes
  if (isDiseaseAction(action)) {
    if (zoneInfo.disease_pressure === 'high') {
      notes.push('advisory.regional.high_disease_pressure');
      notes.push('advisory.regional.preventive_spray_recommended');
    }
  }
  
  // Heavy rainfall zones
  if (zoneInfo.rainfall_pattern === 'heavy') {
    if (action === Action.APPLY_FUNGICIDE || action === Action.APPLY_INSECTICIDE) {
      notes.push('advisory.regional.check_rain_before_spray');
    }
  }
  
  return notes;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  applyRegionalModifiers as default
};
