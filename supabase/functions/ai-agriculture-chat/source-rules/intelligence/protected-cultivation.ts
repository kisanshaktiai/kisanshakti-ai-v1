/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROTECTED CULTIVATION RULES (GAP 5.2)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for greenhouse/polyhouse agriculture:
 * - Structure type detection
 * - Modified pest/disease dynamics
 * - Humidity management
 * - Climate control recommendations
 * 
 * Reference: ICAR-IIHR, Netherlands Greenhouse Technology
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ProtectedStructureType = 
  | 'NATURALLY_VENTILATED_POLYHOUSE'
  | 'FAN_PAD_GREENHOUSE'
  | 'CLIMATE_CONTROLLED_GREENHOUSE'
  | 'SHADE_NET_HOUSE'
  | 'INSECT_PROOF_NET_HOUSE'
  | 'WALK_IN_TUNNEL'
  | 'LOW_TUNNEL'
  | 'RAIN_SHELTER';

export interface ProtectedStructure {
  type: ProtectedStructureType;
  display_name: string;
  temperature_control: boolean;
  humidity_control: boolean;
  ventilation: 'NATURAL' | 'FORCED' | 'BOTH';
  pest_exclusion_level: 'NONE' | 'PARTIAL' | 'HIGH';
  light_reduction_percent: number;
  typical_cost_per_sqm_inr: number;
  suitable_crops: string[];
}

export interface ProtectedEnvironmentParams {
  structure_type: ProtectedStructureType;
  current_temperature: number;
  current_humidity: number;
  ventilation_status: 'OPEN' | 'CLOSED' | 'PARTIAL';
  irrigation_type: 'DRIP' | 'FOGGER' | 'SPRINKLER';
  co2_level_ppm?: number;
  light_intensity_lux?: number;
}

export interface ProtectedCultivationAdvice {
  climate_action: string;
  pest_management: {
    higher_risk_pests: string[];
    lower_risk_pests: string[];
    biocontrol_preferred: boolean;
    modified_spray_advice?: string;
  };
  disease_management: {
    higher_risk_diseases: string[];
    preventive_actions: string[];
    humidity_threshold: number;
  };
  environment_optimization: {
    optimal_temp_range: [number, number];
    optimal_humidity_range: [number, number];
    ventilation_advice: string;
    co2_enrichment_advice?: string;
  };
  warnings: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURE DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const PROTECTED_STRUCTURES: Record<ProtectedStructureType, ProtectedStructure> = {
  NATURALLY_VENTILATED_POLYHOUSE: {
    type: 'NATURALLY_VENTILATED_POLYHOUSE',
    display_name: 'Naturally Ventilated Polyhouse',
    temperature_control: false,
    humidity_control: false,
    ventilation: 'NATURAL',
    pest_exclusion_level: 'PARTIAL',
    light_reduction_percent: 15,
    typical_cost_per_sqm_inr: 800,
    suitable_crops: ['TOMATO', 'CAPSICUM', 'CUCUMBER', 'ROSE', 'GERBERA', 'CARNATION']
  },
  FAN_PAD_GREENHOUSE: {
    type: 'FAN_PAD_GREENHOUSE',
    display_name: 'Fan & Pad Greenhouse',
    temperature_control: true,
    humidity_control: true,
    ventilation: 'FORCED',
    pest_exclusion_level: 'HIGH',
    light_reduction_percent: 20,
    typical_cost_per_sqm_inr: 2500,
    suitable_crops: ['TOMATO', 'CAPSICUM', 'STRAWBERRY', 'LETTUCE', 'HERBS']
  },
  CLIMATE_CONTROLLED_GREENHOUSE: {
    type: 'CLIMATE_CONTROLLED_GREENHOUSE',
    display_name: 'Climate Controlled Greenhouse',
    temperature_control: true,
    humidity_control: true,
    ventilation: 'BOTH',
    pest_exclusion_level: 'HIGH',
    light_reduction_percent: 25,
    typical_cost_per_sqm_inr: 5000,
    suitable_crops: ['TOMATO', 'CAPSICUM', 'CUCUMBER', 'STRAWBERRY', 'EXOTIC_VEGETABLES']
  },
  SHADE_NET_HOUSE: {
    type: 'SHADE_NET_HOUSE',
    display_name: 'Shade Net House',
    temperature_control: false,
    humidity_control: false,
    ventilation: 'NATURAL',
    pest_exclusion_level: 'NONE',
    light_reduction_percent: 35,
    typical_cost_per_sqm_inr: 200,
    suitable_crops: ['CAPSICUM', 'LEAFY_VEGETABLES', 'ORCHIDS', 'ANTHURIUM', 'NURSERY']
  },
  INSECT_PROOF_NET_HOUSE: {
    type: 'INSECT_PROOF_NET_HOUSE',
    display_name: 'Insect Proof Net House',
    temperature_control: false,
    humidity_control: false,
    ventilation: 'NATURAL',
    pest_exclusion_level: 'HIGH',
    light_reduction_percent: 20,
    typical_cost_per_sqm_inr: 350,
    suitable_crops: ['TOMATO', 'CAPSICUM', 'CUCUMBER', 'CABBAGE', 'CAULIFLOWER']
  },
  WALK_IN_TUNNEL: {
    type: 'WALK_IN_TUNNEL',
    display_name: 'Walk-in Tunnel',
    temperature_control: false,
    humidity_control: false,
    ventilation: 'NATURAL',
    pest_exclusion_level: 'PARTIAL',
    light_reduction_percent: 10,
    typical_cost_per_sqm_inr: 150,
    suitable_crops: ['TOMATO', 'CAPSICUM', 'CUCUMBER', 'STRAWBERRY']
  },
  LOW_TUNNEL: {
    type: 'LOW_TUNNEL',
    display_name: 'Low Tunnel',
    temperature_control: false,
    humidity_control: false,
    ventilation: 'NATURAL',
    pest_exclusion_level: 'NONE',
    light_reduction_percent: 5,
    typical_cost_per_sqm_inr: 50,
    suitable_crops: ['STRAWBERRY', 'LEAFY_VEGETABLES', 'NURSERY']
  },
  RAIN_SHELTER: {
    type: 'RAIN_SHELTER',
    display_name: 'Rain Shelter',
    temperature_control: false,
    humidity_control: false,
    ventilation: 'NATURAL',
    pest_exclusion_level: 'NONE',
    light_reduction_percent: 10,
    typical_cost_per_sqm_inr: 100,
    suitable_crops: ['TOMATO', 'GRAPES', 'CAPSICUM']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// PEST/DISEASE MODIFICATION DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const PROTECTED_PEST_DYNAMICS = {
  // Pests that INCREASE in protected cultivation
  increased_risk: [
    {
      pest: 'WHITEFLY',
      reason: 'Controlled environment favors rapid reproduction',
      multiplier: 1.5
    },
    {
      pest: 'THRIPS',
      reason: 'Protected from rain washing, higher survival',
      multiplier: 1.4
    },
    {
      pest: 'SPIDER_MITE',
      reason: 'Low humidity and warm conditions favor outbreak',
      multiplier: 2.0
    },
    {
      pest: 'APHID',
      reason: 'Year-round favorable conditions',
      multiplier: 1.3
    },
    {
      pest: 'MEALYBUG',
      reason: 'Protected from predators and weather',
      multiplier: 1.4
    }
  ],
  
  // Pests that DECREASE in protected cultivation
  decreased_risk: [
    {
      pest: 'FRUIT_BORER',
      reason: 'Adult moths excluded by net',
      multiplier: 0.2
    },
    {
      pest: 'STEM_BORER',
      reason: 'Moths cannot enter protected structure',
      multiplier: 0.3
    },
    {
      pest: 'DIAMONDBACK_MOTH',
      reason: 'Excluded by insect-proof net',
      multiplier: 0.1
    },
    {
      pest: 'CUTWORM',
      reason: 'Soil-borne pest management easier',
      multiplier: 0.4
    }
  ]
};

export const PROTECTED_DISEASE_DYNAMICS = {
  // Diseases that INCREASE in protected cultivation
  increased_risk: [
    {
      disease: 'POWDERY_MILDEW',
      reason: 'Low air movement, moderate humidity',
      humidity_threshold: 70,
      multiplier: 1.8
    },
    {
      disease: 'GRAY_MOLD',
      reason: 'High humidity, poor ventilation',
      humidity_threshold: 85,
      multiplier: 2.0
    },
    {
      disease: 'DAMPING_OFF',
      reason: 'High moisture in seedling stage',
      humidity_threshold: 90,
      multiplier: 1.5
    },
    {
      disease: 'FUSARIUM_WILT',
      reason: 'Soil temperature favorable, continuous cropping',
      multiplier: 1.4
    }
  ],
  
  // Diseases that DECREASE in protected cultivation
  decreased_risk: [
    {
      disease: 'LATE_BLIGHT',
      reason: 'Rain excluded, leaf wetness controlled',
      multiplier: 0.2
    },
    {
      disease: 'DOWNY_MILDEW',
      reason: 'No rain splash, controlled humidity',
      multiplier: 0.3
    },
    {
      disease: 'ANTHRACNOSE',
      reason: 'Rain splash transmission eliminated',
      multiplier: 0.4
    },
    {
      disease: 'BACTERIAL_SPOT',
      reason: 'No rain-driven spread',
      multiplier: 0.3
    }
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get protected structure profile
 */
export function getStructureProfile(type: ProtectedStructureType): ProtectedStructure {
  return PROTECTED_STRUCTURES[type];
}

/**
 * Check if pest risk is modified in protected cultivation
 */
export function getModifiedPestRisk(
  pestCode: string,
  structureType: ProtectedStructureType
): { modified: boolean; direction: 'INCREASED' | 'DECREASED' | 'SAME'; multiplier: number; reason?: string } {
  const structure = getStructureProfile(structureType);
  const pestUpper = pestCode.toUpperCase();
  
  // Check if pest exclusion is effective
  if (structure.pest_exclusion_level === 'HIGH') {
    const decreased = PROTECTED_PEST_DYNAMICS.decreased_risk.find(p => pestUpper.includes(p.pest));
    if (decreased) {
      return {
        modified: true,
        direction: 'DECREASED',
        multiplier: decreased.multiplier,
        reason: decreased.reason
      };
    }
  }
  
  // Check if pest increases in protected environment
  const increased = PROTECTED_PEST_DYNAMICS.increased_risk.find(p => pestUpper.includes(p.pest));
  if (increased) {
    return {
      modified: true,
      direction: 'INCREASED',
      multiplier: increased.multiplier,
      reason: increased.reason
    };
  }
  
  return { modified: false, direction: 'SAME', multiplier: 1.0 };
}

/**
 * Check if disease risk is modified in protected cultivation
 */
export function getModifiedDiseaseRisk(
  diseaseCode: string,
  structureType: ProtectedStructureType,
  currentHumidity?: number
): { modified: boolean; direction: 'INCREASED' | 'DECREASED' | 'SAME'; multiplier: number; reason?: string; humidity_warning?: boolean } {
  const structure = getStructureProfile(structureType);
  const diseaseUpper = diseaseCode.toUpperCase();
  
  // Check if rain-borne disease is reduced
  const decreased = PROTECTED_DISEASE_DYNAMICS.decreased_risk.find(d => diseaseUpper.includes(d.disease));
  if (decreased) {
    return {
      modified: true,
      direction: 'DECREASED',
      multiplier: decreased.multiplier,
      reason: decreased.reason
    };
  }
  
  // Check if disease increases with humidity
  const increased = PROTECTED_DISEASE_DYNAMICS.increased_risk.find(d => diseaseUpper.includes(d.disease));
  if (increased) {
    const humidityWarning = currentHumidity !== undefined && currentHumidity > (increased.humidity_threshold || 80);
    return {
      modified: true,
      direction: 'INCREASED',
      multiplier: humidityWarning ? increased.multiplier * 1.3 : increased.multiplier,
      reason: increased.reason,
      humidity_warning: humidityWarning
    };
  }
  
  return { modified: false, direction: 'SAME', multiplier: 1.0 };
}

/**
 * Get comprehensive protected cultivation advice
 */
export function getProtectedCultivationAdvice(
  params: ProtectedEnvironmentParams,
  crop: string
): ProtectedCultivationAdvice {
  const structure = getStructureProfile(params.structure_type);
  const warnings: string[] = [];
  
  // Climate action
  let climateAction = 'Maintain current settings';
  
  if (params.current_temperature > 35) {
    climateAction = '⚠️ Temperature too high. Increase ventilation, activate cooling (if available), use foggers.';
    warnings.push('Heat stress risk - immediate cooling needed');
  } else if (params.current_temperature < 15) {
    climateAction = '⚠️ Temperature too low. Close vents, consider heating for sensitive crops.';
    warnings.push('Cold stress risk');
  }
  
  // Humidity management
  let humidityAdvice = '';
  if (params.current_humidity > 85) {
    humidityAdvice = 'Open vents immediately. High humidity = disease explosion risk.';
    warnings.push('Disease outbreak risk due to high humidity (>85%)');
  } else if (params.current_humidity < 40) {
    humidityAdvice = 'Increase humidity with foggers. Low humidity stresses plants.';
    warnings.push('Low humidity - spider mite risk increases');
  }
  
  // Pest management
  const higherRiskPests = PROTECTED_PEST_DYNAMICS.increased_risk
    .filter(p => p.multiplier > 1.3)
    .map(p => p.pest);
  
  const lowerRiskPests = structure.pest_exclusion_level === 'HIGH' 
    ? PROTECTED_PEST_DYNAMICS.decreased_risk.map(p => p.pest)
    : [];
  
  // Disease management
  const higherRiskDiseases = PROTECTED_DISEASE_DYNAMICS.increased_risk
    .filter(d => params.current_humidity > (d.humidity_threshold || 80))
    .map(d => d.disease);
  
  const preventiveActions: string[] = [];
  if (params.current_humidity > 80) {
    preventiveActions.push('Improve ventilation - target <80% humidity');
    preventiveActions.push('Avoid evening irrigation - leaves must dry before night');
    preventiveActions.push('Apply preventive Trichoderma or copper fungicide');
  }
  
  // Environment optimization
  const optimalTemp: [number, number] = crop.includes('TOMATO') ? [20, 28] : [18, 30];
  const optimalHumidity: [number, number] = [60, 80];
  
  let ventilationAdvice = 'Maintain current ventilation';
  if (params.current_humidity > 80 && params.ventilation_status !== 'OPEN') {
    ventilationAdvice = '⚠️ Open vents to reduce humidity';
  } else if (params.current_temperature > 32 && params.ventilation_status !== 'OPEN') {
    ventilationAdvice = '⚠️ Open vents for cooling';
  }
  
  // CO2 enrichment
  let co2Advice: string | undefined;
  if (structure.temperature_control && params.ventilation_status === 'CLOSED') {
    co2Advice = 'CO₂ enrichment possible (1000-1500 ppm) when vents closed. Can increase yield 20-30%.';
    if (params.co2_level_ppm && params.co2_level_ppm < 400) {
      co2Advice = '⚠️ Low CO₂ detected. Consider CO₂ enrichment or open vents.';
    }
  }
  
  return {
    climate_action: climateAction,
    pest_management: {
      higher_risk_pests: higherRiskPests,
      lower_risk_pests: lowerRiskPests,
      biocontrol_preferred: true,  // Always prefer biocontrol in protected cultivation
      modified_spray_advice: 'Use reduced doses (75%) in protected cultivation. Prioritize biocontrol agents.'
    },
    disease_management: {
      higher_risk_diseases: higherRiskDiseases,
      preventive_actions: preventiveActions,
      humidity_threshold: 80
    },
    environment_optimization: {
      optimal_temp_range: optimalTemp,
      optimal_humidity_range: optimalHumidity,
      ventilation_advice: ventilationAdvice,
      co2_enrichment_advice: co2Advice
    },
    warnings
  };
}

/**
 * Should spray recommendation be modified for protected cultivation?
 */
export function modifySprayForProtectedCultivation(
  originalDose: number,
  chemicalType: string,
  structureType: ProtectedStructureType
): {
  modified_dose: number;
  modification_percent: number;
  reason: string;
  additional_precautions: string[];
} {
  const structure = getStructureProfile(structureType);
  const precautions: string[] = [];
  
  // Generally reduce dose in protected cultivation
  let modificationPercent = 0;
  let reason = 'No modification needed';
  
  if (structure.pest_exclusion_level === 'HIGH') {
    // Better coverage, lower volume needed
    modificationPercent = -25;
    reason = 'Reduced dose due to better coverage in enclosed structure';
  } else if (structure.pest_exclusion_level === 'PARTIAL') {
    modificationPercent = -15;
    reason = 'Slightly reduced dose for semi-enclosed structure';
  }
  
  // Safety precautions
  precautions.push('Ensure proper ventilation after spraying (minimum 30 minutes)');
  precautions.push('Workers must not re-enter until spray dries completely');
  
  if (!structure.humidity_control) {
    precautions.push('Avoid spraying in high humidity (>85%) - poor drying');
  }
  
  if (chemicalType.includes('SYSTEMIC')) {
    precautions.push('Systemic products work well - consider further dose reduction');
    modificationPercent = Math.min(modificationPercent, -20);
  }
  
  return {
    modified_dose: originalDose * (1 + modificationPercent / 100),
    modification_percent: modificationPercent,
    reason,
    additional_precautions: precautions
  };
}

/**
 * Get structure recommendations based on crop and region
 */
export function getStructureRecommendation(
  crop: string,
  region: string,
  budget: 'LOW' | 'MEDIUM' | 'HIGH'
): ProtectedStructure[] {
  const cropUpper = crop.toUpperCase();
  
  const suitable = Object.values(PROTECTED_STRUCTURES).filter(s => 
    s.suitable_crops.some(c => cropUpper.includes(c) || c.includes(cropUpper))
  );
  
  // Sort by budget
  if (budget === 'LOW') {
    return suitable.filter(s => s.typical_cost_per_sqm_inr < 500);
  } else if (budget === 'MEDIUM') {
    return suitable.filter(s => s.typical_cost_per_sqm_inr < 2000);
  }
  
  return suitable.sort((a, b) => b.typical_cost_per_sqm_inr - a.typical_cost_per_sqm_inr);
}
