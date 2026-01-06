/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARM EQUIPMENT CALIBRATION (GAP 7.3)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Equipment-specific dose calculations:
 * - Sprayer type profiles (knapsack, tractor, drone)
 * - Water volume per acre lookup
 * - Concentration calculations
 * - Nozzle recommendations
 * 
 * Reference: ICAR-IARI, NCIPM Sprayer Calibration Guidelines
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type SprayerType = 
  | 'KNAPSACK_MANUAL'
  | 'KNAPSACK_POWER'
  | 'TRACTOR_BOOM'
  | 'TRACTOR_MIST_BLOWER'
  | 'DRONE'
  | 'ULVA'
  | 'POWER_SPRAYER';

export interface SprayerProfile {
  type: SprayerType;
  display_name: string;
  water_volume_per_acre_liters: number;
  coverage_efficiency: number;  // 0-1
  typical_tank_capacity_liters: number;
  swath_width_meters?: number;
  droplet_size: 'FINE' | 'MEDIUM' | 'COARSE' | 'VARIABLE';
  suitable_for: string[];  // Product types
  not_suitable_for: string[];
  operating_pressure_psi?: [number, number];  // [min, max]
  speed_km_per_hour?: number;
}

export interface DoseCalculation {
  chemical_name: string;
  original_dose_per_acre: { value: number; unit: string };
  
  for_sprayer: {
    type: SprayerType;
    water_volume_liters: number;
    chemical_per_tank: { value: number; unit: string };
    tanks_per_acre: number;
    concentration_percent: number;
  };
  
  calibration_tips: string[];
  warnings: string[];
}

export interface NozzleRecommendation {
  nozzle_type: string;
  droplet_size: string;
  suitable_chemicals: string[];
  pressure_range_psi: [number, number];
  flow_rate_lpm: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SPRAYER DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const SPRAYER_PROFILES: Record<SprayerType, SprayerProfile> = {
  KNAPSACK_MANUAL: {
    type: 'KNAPSACK_MANUAL',
    display_name: 'Manual Knapsack Sprayer',
    water_volume_per_acre_liters: 200,
    coverage_efficiency: 0.75,
    typical_tank_capacity_liters: 16,
    droplet_size: 'MEDIUM',
    suitable_for: ['INSECTICIDE', 'FUNGICIDE', 'HERBICIDE', 'FOLIAR_FERTILIZER'],
    not_suitable_for: ['ULTRA_LOW_VOLUME'],
    operating_pressure_psi: [15, 25]
  },
  KNAPSACK_POWER: {
    type: 'KNAPSACK_POWER',
    display_name: 'Power Knapsack Sprayer',
    water_volume_per_acre_liters: 150,
    coverage_efficiency: 0.82,
    typical_tank_capacity_liters: 20,
    droplet_size: 'MEDIUM',
    suitable_for: ['INSECTICIDE', 'FUNGICIDE', 'HERBICIDE', 'FOLIAR_FERTILIZER'],
    not_suitable_for: ['ULTRA_LOW_VOLUME'],
    operating_pressure_psi: [30, 50]
  },
  TRACTOR_BOOM: {
    type: 'TRACTOR_BOOM',
    display_name: 'Tractor-Mounted Boom Sprayer',
    water_volume_per_acre_liters: 80,
    coverage_efficiency: 0.90,
    typical_tank_capacity_liters: 400,
    swath_width_meters: 10,
    droplet_size: 'VARIABLE',
    suitable_for: ['HERBICIDE', 'FUNGICIDE', 'INSECTICIDE'],
    not_suitable_for: [],
    operating_pressure_psi: [30, 60],
    speed_km_per_hour: 6
  },
  TRACTOR_MIST_BLOWER: {
    type: 'TRACTOR_MIST_BLOWER',
    display_name: 'Tractor-Mounted Mist Blower',
    water_volume_per_acre_liters: 40,
    coverage_efficiency: 0.88,
    typical_tank_capacity_liters: 400,
    droplet_size: 'FINE',
    suitable_for: ['INSECTICIDE', 'FUNGICIDE', 'ACARICIDE'],
    not_suitable_for: ['HERBICIDE'],  // Drift risk
    operating_pressure_psi: [60, 100],
    speed_km_per_hour: 4
  },
  DRONE: {
    type: 'DRONE',
    display_name: 'Agricultural Drone Sprayer',
    water_volume_per_acre_liters: 10,  // Ultra-low volume
    coverage_efficiency: 0.95,
    typical_tank_capacity_liters: 10,
    swath_width_meters: 4,
    droplet_size: 'FINE',
    suitable_for: ['INSECTICIDE', 'FUNGICIDE', 'GROWTH_REGULATOR'],
    not_suitable_for: ['HERBICIDE', 'GRANULAR'],
    speed_km_per_hour: 15
  },
  ULVA: {
    type: 'ULVA',
    display_name: 'ULVA (Ultra Low Volume Applicator)',
    water_volume_per_acre_liters: 5,
    coverage_efficiency: 0.85,
    typical_tank_capacity_liters: 1,
    droplet_size: 'FINE',
    suitable_for: ['INSECTICIDE', 'FUNGICIDE'],
    not_suitable_for: ['HERBICIDE', 'CONTACT_FUNGICIDE'],
    operating_pressure_psi: [0, 0]  // Battery-operated
  },
  POWER_SPRAYER: {
    type: 'POWER_SPRAYER',
    display_name: 'Engine-Powered Sprayer',
    water_volume_per_acre_liters: 150,
    coverage_efficiency: 0.85,
    typical_tank_capacity_liters: 100,
    droplet_size: 'MEDIUM',
    suitable_for: ['INSECTICIDE', 'FUNGICIDE', 'HERBICIDE'],
    not_suitable_for: [],
    operating_pressure_psi: [50, 80]
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// NOZZLE DATABASE
// ═══════════════════════════════════════════════════════════════════════════

export const NOZZLE_RECOMMENDATIONS: NozzleRecommendation[] = [
  {
    nozzle_type: 'Hollow Cone',
    droplet_size: 'FINE',
    suitable_chemicals: ['INSECTICIDE', 'FUNGICIDE', 'ACARICIDE'],
    pressure_range_psi: [30, 60],
    flow_rate_lpm: 0.4
  },
  {
    nozzle_type: 'Flat Fan (80°)',
    droplet_size: 'MEDIUM',
    suitable_chemicals: ['HERBICIDE', 'FUNGICIDE'],
    pressure_range_psi: [20, 40],
    flow_rate_lpm: 0.6
  },
  {
    nozzle_type: 'Flat Fan (110°)',
    droplet_size: 'MEDIUM',
    suitable_chemicals: ['HERBICIDE_PRE_EMERGENCE', 'SOIL_APPLICATION'],
    pressure_range_psi: [15, 30],
    flow_rate_lpm: 0.8
  },
  {
    nozzle_type: 'Full Cone',
    droplet_size: 'COARSE',
    suitable_chemicals: ['HERBICIDE', 'SOIL_DRENCH'],
    pressure_range_psi: [20, 50],
    flow_rate_lpm: 1.0
  },
  {
    nozzle_type: 'Air Induction',
    droplet_size: 'COARSE',
    suitable_chemicals: ['HERBICIDE', 'SYSTEMIC_INSECTICIDE'],
    pressure_range_psi: [30, 60],
    flow_rate_lpm: 0.8
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get sprayer profile
 */
export function getSprayerProfile(type: SprayerType): SprayerProfile {
  return SPRAYER_PROFILES[type] || SPRAYER_PROFILES.KNAPSACK_MANUAL;
}

/**
 * Calculate dose for specific sprayer
 */
export function calculateDoseForSprayer(
  chemicalName: string,
  originalDoseValue: number,
  originalDoseUnit: string,  // 'ml/acre', 'g/acre', 'ml/ha', etc.
  sprayerType: SprayerType
): DoseCalculation {
  const sprayer = getSprayerProfile(sprayerType);
  const waterVolume = sprayer.water_volume_per_acre_liters;
  const tankCapacity = sprayer.typical_tank_capacity_liters;
  
  // Normalize dose to per acre
  let dosePerAcre = originalDoseValue;
  if (originalDoseUnit.includes('ha')) {
    dosePerAcre = originalDoseValue / 2.47;  // 1 ha = 2.47 acres
  }
  
  // Calculate chemical per tank
  const tanksPerAcre = waterVolume / tankCapacity;
  const chemicalPerTank = dosePerAcre / tanksPerAcre;
  
  // Calculate concentration
  const concentrationPercent = (dosePerAcre / (waterVolume * 1000)) * 100;  // Convert L to ml
  
  // Build calibration tips
  const tips: string[] = [];
  const warnings: string[] = [];
  
  tips.push(`For ${sprayer.display_name}: Use ${waterVolume}L water per acre`);
  tips.push(`Add ${chemicalPerTank.toFixed(1)}${originalDoseUnit.includes('ml') ? 'ml' : 'g'} per ${tankCapacity}L tank`);
  tips.push(`You will need ${tanksPerAcre.toFixed(1)} tank loads per acre`);
  
  if (sprayer.operating_pressure_psi) {
    tips.push(`Maintain pressure: ${sprayer.operating_pressure_psi[0]}-${sprayer.operating_pressure_psi[1]} PSI`);
  }
  
  // Warnings based on sprayer type
  if (sprayerType === 'DRONE' || sprayerType === 'ULVA') {
    warnings.push('Low volume spraying - use recommended adjuvant for better coverage');
    warnings.push('Ensure droplet size is appropriate for the chemical');
  }
  
  if (sprayerType === 'TRACTOR_MIST_BLOWER') {
    warnings.push('Fine droplets - avoid spraying in windy conditions (>10 km/h)');
  }
  
  return {
    chemical_name: chemicalName,
    original_dose_per_acre: { value: dosePerAcre, unit: originalDoseUnit },
    for_sprayer: {
      type: sprayerType,
      water_volume_liters: waterVolume,
      chemical_per_tank: {
        value: Math.round(chemicalPerTank * 10) / 10,
        unit: originalDoseUnit.includes('ml') ? 'ml' : 'g'
      },
      tanks_per_acre: Math.round(tanksPerAcre * 10) / 10,
      concentration_percent: Math.round(concentrationPercent * 1000) / 1000
    },
    calibration_tips: tips,
    warnings
  };
}

/**
 * Get nozzle recommendation
 */
export function getNozzleRecommendation(
  chemicalType: string,
  sprayerType: SprayerType
): NozzleRecommendation | null {
  const sprayer = getSprayerProfile(sprayerType);
  
  // Find matching nozzle
  const suitable = NOZZLE_RECOMMENDATIONS.filter(n => 
    n.suitable_chemicals.some(c => 
      chemicalType.toUpperCase().includes(c) || c.includes(chemicalType.toUpperCase())
    )
  );
  
  if (suitable.length === 0) {
    return NOZZLE_RECOMMENDATIONS[0];  // Default hollow cone
  }
  
  // Match droplet size preference
  if (sprayer.droplet_size === 'FINE') {
    return suitable.find(n => n.droplet_size === 'FINE') || suitable[0];
  } else if (sprayer.droplet_size === 'COARSE') {
    return suitable.find(n => n.droplet_size === 'COARSE') || suitable[0];
  }
  
  return suitable[0];
}

/**
 * Convert dose between sprayer types
 */
export function convertDoseBetweenSprayers(
  doseInOriginalSprayer: number,
  originalSprayerType: SprayerType,
  targetSprayerType: SprayerType
): {
  converted_dose: number;
  explanation: string;
} {
  const original = getSprayerProfile(originalSprayerType);
  const target = getSprayerProfile(targetSprayerType);
  
  // Dose per acre remains same, only water volume changes
  // The concentration changes inversely with water volume
  
  const waterRatio = original.water_volume_per_acre_liters / target.water_volume_per_acre_liters;
  
  return {
    converted_dose: doseInOriginalSprayer,  // Chemical dose stays same!
    explanation: `Chemical dose remains ${doseInOriginalSprayer} per acre. ` +
      `Water volume changes from ${original.water_volume_per_acre_liters}L to ${target.water_volume_per_acre_liters}L. ` +
      `Concentration will be ${waterRatio.toFixed(1)}x ${waterRatio > 1 ? 'higher' : 'lower'}.`
  };
}

/**
 * Check if sprayer is suitable for chemical type
 */
export function isSprayerSuitable(
  sprayerType: SprayerType,
  chemicalType: string
): { suitable: boolean; reason?: string; alternative?: SprayerType } {
  const sprayer = getSprayerProfile(sprayerType);
  const chemUpper = chemicalType.toUpperCase();
  
  // Check not suitable list
  if (sprayer.not_suitable_for.some(ns => chemUpper.includes(ns))) {
    // Find alternative
    const alternatives = Object.values(SPRAYER_PROFILES).filter(s => 
      s.suitable_for.some(sf => chemUpper.includes(sf)) &&
      !s.not_suitable_for.some(ns => chemUpper.includes(ns))
    );
    
    return {
      suitable: false,
      reason: `${sprayer.display_name} not recommended for ${chemicalType} due to drift risk or coverage issues`,
      alternative: alternatives[0]?.type
    };
  }
  
  // Check suitable list
  if (sprayer.suitable_for.some(sf => chemUpper.includes(sf))) {
    return { suitable: true };
  }
  
  return {
    suitable: true,
    reason: 'Should work, but not specifically optimized for this chemical type'
  };
}

/**
 * Get farmer-friendly spray instructions
 */
export function getSprayInstructions(
  calculation: DoseCalculation,
  language: 'mr' | 'hi' | 'en' = 'en'
): string {
  const s = calculation.for_sprayer;
  
  const instructions: Record<string, string> = {
    en: `📋 **Spray Instructions for ${calculation.chemical_name}:**\n\n` +
      `🔹 Water: ${s.water_volume_liters}L per acre\n` +
      `🔹 Chemical: ${s.chemical_per_tank.value}${s.chemical_per_tank.unit} per ${SPRAYER_PROFILES[s.type].typical_tank_capacity_liters}L tank\n` +
      `🔹 Tank loads needed: ${s.tanks_per_acre} per acre\n\n` +
      `💡 Tips:\n${calculation.calibration_tips.map(t => `• ${t}`).join('\n')}`,
    
    mr: `📋 **${calculation.chemical_name} फवारणी सूचना:**\n\n` +
      `🔹 पाणी: ${s.water_volume_liters} लिटर प्रति एकर\n` +
      `🔹 औषध: ${s.chemical_per_tank.value}${s.chemical_per_tank.unit} प्रति ${SPRAYER_PROFILES[s.type].typical_tank_capacity_liters} लिटर टाकी\n` +
      `🔹 टाक्या: ${s.tanks_per_acre} प्रति एकर\n\n` +
      `💡 टिप्स:\n${calculation.calibration_tips.map(t => `• ${t}`).join('\n')}`,
    
    hi: `📋 **${calculation.chemical_name} छिड़काव निर्देश:**\n\n` +
      `🔹 पानी: ${s.water_volume_liters} लीटर प्रति एकड़\n` +
      `🔹 दवा: ${s.chemical_per_tank.value}${s.chemical_per_tank.unit} प्रति ${SPRAYER_PROFILES[s.type].typical_tank_capacity_liters} लीटर टंकी\n` +
      `🔹 टंकी: ${s.tanks_per_acre} प्रति एकड़\n\n` +
      `💡 सुझाव:\n${calculation.calibration_tips.map(t => `• ${t}`).join('\n')}`
  };
  
  return instructions[language] || instructions.en;
}
