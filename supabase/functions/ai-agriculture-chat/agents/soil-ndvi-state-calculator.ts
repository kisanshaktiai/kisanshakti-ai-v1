/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENHANCED SOIL & NDVI STATE CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Converts raw soil test values and NDVI readings into categorical states
 * for rule engine consumption (based on ICAR standards)
 * 
 * CRITICAL: All calculations are CROP + STAGE SPECIFIC
 * Cotton at Vegetative needs different NPK than Cotton at Flowering!
 */

export type NutrientState = 'LOW' | 'ADEQUATE' | 'HIGH';
export type NDVIState = 'EXCELLENT' | 'HEALTHY' | 'MODERATE_STRESS' | 'HIGH_STRESS' | 'CRITICAL';
export type NDVITrend = 'RISING' | 'STABLE' | 'DECLINING';
export type SoilType = 'SANDY' | 'SANDY_LOAM' | 'LOAMY' | 'CLAY_LOAM' | 'CLAY' | 'BLACK_COTTON' | 'RED' | 'LATERITE';

// ═══════════════════════════════════════════════════════════════════════════
// CROP + STAGE SPECIFIC NITROGEN REQUIREMENTS (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nitrogen requirements by crop and growth stage (kg/ha)
 * Source: ICAR Crop Production Guidelines 2024
 * 
 * CRITICAL: Same soil N=180 kg/ha means:
 * - LOW for Cotton at Vegetative (needs 200-400)
 * - ADEQUATE for Cotton at Fruiting (needs 100-200)
 * - HIGH for Soybean at Vegetative (needs 100-200)
 */
const NITROGEN_REQUIREMENTS_BY_STAGE: Record<string, {
  vegetative: { low: number; high: number };
  flowering: { low: number; high: number };
  fruiting: { low: number; high: number };
}> = {
  'COTTON': {
    vegetative: { low: 200, high: 400 },
    flowering: { low: 150, high: 300 },
    fruiting: { low: 100, high: 200 }
  },
  'RICE': {
    vegetative: { low: 180, high: 350 },
    flowering: { low: 120, high: 250 },
    fruiting: { low: 80, high: 150 }
  },
  'PADDY': {
    vegetative: { low: 180, high: 350 },
    flowering: { low: 120, high: 250 },
    fruiting: { low: 80, high: 150 }
  },
  'WHEAT': {
    vegetative: { low: 150, high: 300 },
    flowering: { low: 100, high: 200 },
    fruiting: { low: 60, high: 120 }
  },
  'SOYBEAN': {
    vegetative: { low: 100, high: 200 },
    flowering: { low: 80, high: 150 },
    fruiting: { low: 60, high: 100 }
  },
  'SUGARCANE': {
    vegetative: { low: 250, high: 500 },
    flowering: { low: 200, high: 400 },
    fruiting: { low: 150, high: 300 }
  },
  'MAIZE': {
    vegetative: { low: 150, high: 300 },
    flowering: { low: 100, high: 200 },
    fruiting: { low: 80, high: 150 }
  },
  'TOMATO': {
    vegetative: { low: 180, high: 350 },
    flowering: { low: 150, high: 300 },
    fruiting: { low: 120, high: 250 }
  },
  'ONION': {
    vegetative: { low: 150, high: 300 },
    flowering: { low: 100, high: 200 },
    fruiting: { low: 80, high: 150 }
  },
  'CHILLI': {
    vegetative: { low: 150, high: 300 },
    flowering: { low: 120, high: 250 },
    fruiting: { low: 100, high: 200 }
  },
  'GROUNDNUT': {
    vegetative: { low: 100, high: 200 },
    flowering: { low: 80, high: 150 },
    fruiting: { low: 60, high: 120 }
  },
  'TUR': {
    vegetative: { low: 80, high: 150 },
    flowering: { low: 60, high: 120 },
    fruiting: { low: 40, high: 80 }
  },
  'POTATO': {
    vegetative: { low: 150, high: 300 },
    flowering: { low: 120, high: 250 },
    fruiting: { low: 100, high: 200 }
  }
};

// Simple requirements for P and K (not stage-dependent)
const PHOSPHORUS_REQUIREMENTS: Record<string, { low: number; high: number }> = {
  'COTTON': { low: 15, high: 30 },
  'RICE': { low: 12, high: 25 },
  'PADDY': { low: 12, high: 25 },
  'WHEAT': { low: 12, high: 25 },
  'SOYBEAN': { low: 15, high: 30 },
  'SUGARCANE': { low: 20, high: 40 },
  'MAIZE': { low: 15, high: 30 },
  'TOMATO': { low: 20, high: 40 },
  'ONION': { low: 20, high: 40 },
  'CHILLI': { low: 20, high: 40 },
  'GROUNDNUT': { low: 15, high: 30 },
  'TUR': { low: 15, high: 30 },
  'POTATO': { low: 25, high: 50 }
};

const POTASSIUM_REQUIREMENTS: Record<string, { low: number; high: number }> = {
  'COTTON': { low: 150, high: 300 },
  'RICE': { low: 120, high: 250 },
  'PADDY': { low: 120, high: 250 },
  'WHEAT': { low: 120, high: 250 },
  'SOYBEAN': { low: 150, high: 300 },
  'SUGARCANE': { low: 200, high: 400 },
  'MAIZE': { low: 150, high: 300 },
  'TOMATO': { low: 180, high: 350 },
  'ONION': { low: 180, high: 350 },
  'CHILLI': { low: 180, high: 350 },
  'GROUNDNUT': { low: 150, high: 300 },
  'TUR': { low: 120, high: 250 },
  'POTATO': { low: 200, high: 400 }
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC NDVI THRESHOLDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * NDVI thresholds vary by crop type!
 * Dense canopy crops (Rice, Sugarcane) have higher baseline NDVI
 * Sparse crops (Onion, Potato) have lower baseline NDVI
 * 
 * CRITICAL: NDVI=0.50 means:
 * - MODERATE_STRESS for Rice (dense canopy expected)
 * - HEALTHY for Onion (lower baseline)
 */
const NDVI_THRESHOLDS_BY_CROP: Record<string, {
  excellent: number;
  healthy: number;
  moderate: number;
  stress: number;
}> = {
  'RICE': { excellent: 0.80, healthy: 0.65, moderate: 0.45, stress: 0.30 },
  'PADDY': { excellent: 0.80, healthy: 0.65, moderate: 0.45, stress: 0.30 },
  'WHEAT': { excellent: 0.80, healthy: 0.65, moderate: 0.45, stress: 0.30 },
  'COTTON': { excellent: 0.75, healthy: 0.60, moderate: 0.40, stress: 0.25 },
  'SUGARCANE': { excellent: 0.85, healthy: 0.70, moderate: 0.50, stress: 0.35 },
  'SOYBEAN': { excellent: 0.75, healthy: 0.60, moderate: 0.40, stress: 0.25 },
  'MAIZE': { excellent: 0.80, healthy: 0.65, moderate: 0.45, stress: 0.30 },
  'TOMATO': { excellent: 0.70, healthy: 0.55, moderate: 0.35, stress: 0.20 },
  'ONION': { excellent: 0.60, healthy: 0.45, moderate: 0.30, stress: 0.15 },
  'POTATO': { excellent: 0.65, healthy: 0.50, moderate: 0.35, stress: 0.20 },
  'CHILLI': { excellent: 0.70, healthy: 0.55, moderate: 0.35, stress: 0.20 },
  'GROUNDNUT': { excellent: 0.70, healthy: 0.55, moderate: 0.40, stress: 0.25 },
  'TUR': { excellent: 0.70, healthy: 0.55, moderate: 0.40, stress: 0.25 }
};

// Default thresholds for unknown crops
const DEFAULT_NDVI_THRESHOLDS = { excellent: 0.75, healthy: 0.60, moderate: 0.40, stress: 0.25 };

// ═══════════════════════════════════════════════════════════════════════════
// CROP + STAGE SPECIFIC NITROGEN CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map crop stage string to normalized stage key
 */
function normalizeStageForNutrients(cropStage?: string): 'vegetative' | 'flowering' | 'fruiting' {
  if (!cropStage) return 'vegetative';
  
  const stage = cropStage.toUpperCase();
  
  // Fruiting/Maturity stage
  if (stage.includes('FRUIT') || stage.includes('MATURITY') || stage.includes('HARVEST') || 
      stage.includes('BOLL') || stage.includes('POD') || stage.includes('GRAIN')) {
    return 'fruiting';
  }
  
  // Flowering stage
  if (stage.includes('FLOWER') || stage.includes('REPRODUCTIVE') || stage.includes('BLOOM') ||
      stage.includes('SQUARE')) {
    return 'flowering';
  }
  
  // Everything else is vegetative
  return 'vegetative';
}

/**
 * Calculate nitrogen state for specific crop and growth stage
 */
export function calculateNitrogenState(
  nitrogenKgPerHa: number | undefined | null,
  cropCode: string,
  cropStage?: string
): NutrientState | undefined {
  if (nitrogenKgPerHa === undefined || nitrogenKgPerHa === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const cropReq = NITROGEN_REQUIREMENTS_BY_STAGE[cropUpper];
  
  // Fallback for unknown crops
  if (!cropReq) {
    const defaultReq = { low: 150, high: 300 };
    if (nitrogenKgPerHa < defaultReq.low) return 'LOW';
    if (nitrogenKgPerHa > defaultReq.high) return 'HIGH';
    return 'ADEQUATE';
  }
  
  // Get stage-specific requirements
  const stageKey = normalizeStageForNutrients(cropStage);
  const req = cropReq[stageKey];
  
  if (nitrogenKgPerHa < req.low) return 'LOW';
  if (nitrogenKgPerHa > req.high) return 'HIGH';
  return 'ADEQUATE';
}

/**
 * Calculate phosphorus state (not stage-dependent)
 */
export function calculatePhosphorusState(
  phosphorusKgPerHa: number | undefined | null,
  cropCode: string
): NutrientState | undefined {
  if (phosphorusKgPerHa === undefined || phosphorusKgPerHa === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const req = PHOSPHORUS_REQUIREMENTS[cropUpper] || { low: 15, high: 30 };
  
  if (phosphorusKgPerHa < req.low) return 'LOW';
  if (phosphorusKgPerHa > req.high) return 'HIGH';
  return 'ADEQUATE';
}

/**
 * Calculate potassium state (not stage-dependent)
 */
export function calculatePotassiumState(
  potassiumKgPerHa: number | undefined | null,
  cropCode: string
): NutrientState | undefined {
  if (potassiumKgPerHa === undefined || potassiumKgPerHa === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const req = POTASSIUM_REQUIREMENTS[cropUpper] || { low: 150, high: 300 };
  
  if (potassiumKgPerHa < req.low) return 'LOW';
  if (potassiumKgPerHa > req.high) return 'HIGH';
  return 'ADEQUATE';
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC NDVI CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map NDVI value to health state (CROP-SPECIFIC)
 */
export function mapNDVIToState(
  ndviValue: number | undefined | null,
  cropCode?: string
): NDVIState | undefined {
  if (ndviValue === undefined || ndviValue === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const thresholds = NDVI_THRESHOLDS_BY_CROP[cropUpper] || DEFAULT_NDVI_THRESHOLDS;
  
  if (ndviValue >= thresholds.excellent) return 'EXCELLENT';
  if (ndviValue >= thresholds.healthy) return 'HEALTHY';
  if (ndviValue >= thresholds.moderate) return 'MODERATE_STRESS';
  if (ndviValue >= thresholds.stress) return 'HIGH_STRESS';
  return 'CRITICAL';
}

/**
 * Calculate NDVI trend from trend value or historical readings
 */
export function calculateNDVITrend(
  trendValue?: number,
  ndviHistory?: Array<{ value: number; date: string }>
): NDVITrend | undefined {
  // If trend value is directly available
  if (trendValue !== undefined && trendValue !== null) {
    if (trendValue > 0.02) return 'RISING';
    if (trendValue < -0.02) return 'DECLINING';
    return 'STABLE';
  }
  
  // Calculate from history if available
  if (!ndviHistory || ndviHistory.length < 2) return undefined;
  
  const latest = ndviHistory[0].value;
  const previous = ndviHistory[1].value;
  const change = latest - previous;
  
  if (change > 0.05) return 'RISING';
  if (change < -0.05) return 'DECLINING';
  return 'STABLE';
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL TYPE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function normalizeSoilType(soilType: string | undefined): SoilType {
  if (!soilType) return 'LOAMY';
  
  const normalized = soilType.toUpperCase();
  
  if (normalized.includes('SANDY') && normalized.includes('LOAM')) return 'SANDY_LOAM';
  if (normalized.includes('CLAY') && normalized.includes('LOAM')) return 'CLAY_LOAM';
  if (normalized.includes('BLACK') || normalized.includes('COTTON')) return 'BLACK_COTTON';
  if (normalized.includes('LATERITE')) return 'LATERITE';
  if (normalized.includes('RED')) return 'RED';
  if (normalized.includes('SANDY')) return 'SANDY';
  if (normalized.includes('CLAY')) return 'CLAY';
  
  return 'LOAMY';
}

// ═══════════════════════════════════════════════════════════════════════════
// FERTILIZER DOSAGE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export interface FertilizerDosage {
  deficiency_kg_per_ha: number;
  urea_kg_per_acre?: number;
  dap_kg_per_acre?: number;
  mop_kg_per_acre?: number;
  recommendation: string;
}

/**
 * Calculate required fertilizer dosage based on deficiency
 */
export function calculateFertilizerDosage(
  currentKgPerHa: number,
  cropCode: string,
  cropStage: string,
  nutrientType: 'N' | 'P' | 'K'
): FertilizerDosage {
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  
  // Get target requirement
  let targetKgPerHa: number;
  
  if (nutrientType === 'N') {
    const cropReq = NITROGEN_REQUIREMENTS_BY_STAGE[cropUpper] || NITROGEN_REQUIREMENTS_BY_STAGE['COTTON'];
    const stageKey = normalizeStageForNutrients(cropStage);
    const req = cropReq[stageKey];
    targetKgPerHa = (req.low + req.high) / 2;
  } else if (nutrientType === 'P') {
    const req = PHOSPHORUS_REQUIREMENTS[cropUpper] || PHOSPHORUS_REQUIREMENTS['COTTON'];
    targetKgPerHa = (req.low + req.high) / 2;
  } else {
    const req = POTASSIUM_REQUIREMENTS[cropUpper] || POTASSIUM_REQUIREMENTS['COTTON'];
    targetKgPerHa = (req.low + req.high) / 2;
  }
  
  const deficiencyKgPerHa = Math.max(0, targetKgPerHa - currentKgPerHa);
  const deficiencyKgPerAcre = deficiencyKgPerHa / 2.47;
  
  const result: FertilizerDosage = {
    deficiency_kg_per_ha: Math.round(deficiencyKgPerHa),
    recommendation: ''
  };
  
  if (nutrientType === 'N') {
    result.urea_kg_per_acre = Math.round((deficiencyKgPerAcre / 0.46) * 10) / 10;
    result.recommendation = `Apply Urea ${result.urea_kg_per_acre} kg/acre`;
  } else if (nutrientType === 'P') {
    result.dap_kg_per_acre = Math.round((deficiencyKgPerAcre / 0.20) * 10) / 10;
    result.recommendation = `Apply DAP ${result.dap_kg_per_acre} kg/acre`;
  } else {
    result.mop_kg_per_acre = Math.round((deficiencyKgPerAcre / 0.50) * 10) / 10;
    result.recommendation = `Apply MOP ${result.mop_kg_per_acre} kg/acre`;
  }
  
  return result;
}

/**
 * Calculate nutrient deficiency amount
 */
export function calculateNutrientDeficiency(
  currentKgPerHa: number,
  cropCode: string,
  nutrientType: 'N' | 'P' | 'K',
  cropStage?: string
): number {
  return calculateFertilizerDosage(currentKgPerHa, cropCode, cropStage || 'VEGETATIVE', nutrientType).deficiency_kg_per_ha;
}

// ═══════════════════════════════════════════════════════════════════════════
// CROP CONTEXT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CropValidation {
  valid: boolean;
  error?: string;
  warning?: string;
  normalized_crop?: string;
}

/**
 * Validate that crop code is recognized - CRITICAL for training data quality
 */
export function validateCropContext(
  cropCode: string | undefined,
  landId?: string
): CropValidation {
  if (!cropCode || cropCode === 'UNKNOWN' || cropCode === '') {
    return {
      valid: false,
      error: `Land ${landId || 'unknown'} has no current crop defined. Cannot provide crop-specific advice.`
    };
  }
  
  const cropUpper = cropCode.toUpperCase();
  const knownCrops = Object.keys(NITROGEN_REQUIREMENTS_BY_STAGE);
  
  if (!knownCrops.includes(cropUpper)) {
    return {
      valid: true,
      warning: `Crop "${cropCode}" not in knowledge base. Using default (Cotton) parameters.`,
      normalized_crop: 'COTTON'
    };
  }
  
  return { 
    valid: true,
    normalized_crop: cropUpper
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE STATE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CalculatedFieldStates {
  soil_nitrogen_state?: NutrientState;
  soil_phosphorus_state?: NutrientState;
  soil_potassium_state?: NutrientState;
  soil_ph?: number;
  soil_organic_carbon?: number;
  soil_type: SoilType;
  ndvi?: number;
  ndvi_state?: NDVIState;
  ndvi_trend?: NDVITrend;
  has_soil_data: boolean;
  has_ndvi_data: boolean;
  nitrogen_dosage?: FertilizerDosage;
  phosphorus_dosage?: FertilizerDosage;
  potassium_dosage?: FertilizerDosage;
}

/**
 * Calculate all field states from land context
 * ENHANCED: Now includes crop stage for nitrogen calculation
 */
export function calculateFieldStates(
  landContext: any,
  cropCode: string,
  cropStage?: string
): CalculatedFieldStates {
  const soilHealth = landContext?.soil_health;
  const ndviData = landContext?.ndvi;
  const stage = cropStage || landContext?.growth_stage || 'VEGETATIVE';
  
  // CRITICAL FIX: Support both old and new soil schema keys for backward compatibility
  // New keys: nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, ph_level
  // Old keys: nitrogen, phosphorus, potassium, ph
  const nitrogen = soilHealth?.nitrogen_kg_per_ha ?? soilHealth?.nitrogen;
  const phosphorus = soilHealth?.phosphorus_kg_per_ha ?? soilHealth?.phosphorus;
  const potassium = soilHealth?.potassium_kg_per_ha ?? soilHealth?.potassium;
  const ph = soilHealth?.ph_level ?? soilHealth?.ph;
  const organicCarbon = soilHealth?.organic_carbon_percent ?? soilHealth?.organic_carbon;
  
  // CRITICAL FIX: Support both old and new NDVI schema keys
  // New: ndvi_value, mean_ndvi; Old: value
  const ndviValue = ndviData?.ndvi_value ?? ndviData?.mean_ndvi ?? ndviData?.value;
  const ndviTrendValue = ndviData?.trend_slope ?? ndviData?.trend;
  
  // Calculate nutrient states with stage awareness
  const nState = calculateNitrogenState(nitrogen, cropCode, stage);
  const pState = calculatePhosphorusState(phosphorus, cropCode);
  const kState = calculatePotassiumState(potassium, cropCode);
  
  // Calculate dosages if deficient
  const result: CalculatedFieldStates = {
    soil_nitrogen_state: nState,
    soil_phosphorus_state: pState,
    soil_potassium_state: kState,
    soil_ph: ph,
    soil_organic_carbon: organicCarbon,
    soil_type: normalizeSoilType(landContext?.soil_type),
    ndvi: ndviValue,
    ndvi_state: mapNDVIToState(ndviValue, cropCode),
    ndvi_trend: calculateNDVITrend(ndviTrendValue, landContext?.ndvi_history),
    // CRITICAL FIX: Use normalized values for has_soil_data check
    has_soil_data: !!(nitrogen !== undefined || phosphorus !== undefined || potassium !== undefined),
    has_ndvi_data: !!(ndviValue !== undefined && ndviValue !== null)
  };
  
  // Add dosage recommendations for deficient nutrients
  if (nState === 'LOW' && nitrogen !== undefined) {
    result.nitrogen_dosage = calculateFertilizerDosage(nitrogen, cropCode, stage, 'N');
  }
  if (pState === 'LOW' && phosphorus !== undefined) {
    result.phosphorus_dosage = calculateFertilizerDosage(phosphorus, cropCode, stage, 'P');
  }
  if (kState === 'LOW' && potassium !== undefined) {
    result.potassium_dosage = calculateFertilizerDosage(potassium, cropCode, stage, 'K');
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log complete state calculation for debugging
 */
export function logStateCalculation(
  cropCode: string,
  fieldStates: CalculatedFieldStates,
  cropStage?: string
): void {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 [StateCalculator] LAND-CROP-SPECIFIC STATE CALCULATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Crop: ${cropCode} (Stage: ${cropStage || 'VEGETATIVE'})`);
  console.log('───────────────────────────────────────────────────────────────');
  
  if (fieldStates.has_soil_data) {
    console.log('   📊 Soil Nutrient States:');
    console.log(`      Nitrogen: ${fieldStates.soil_nitrogen_state || 'N/A'}`);
    console.log(`      Phosphorus: ${fieldStates.soil_phosphorus_state || 'N/A'}`);
    console.log(`      Potassium: ${fieldStates.soil_potassium_state || 'N/A'}`);
    console.log(`      pH: ${fieldStates.soil_ph || 'N/A'}`);
    console.log(`      Organic Carbon: ${fieldStates.soil_organic_carbon || 'N/A'}%`);
    console.log(`      Soil Type: ${fieldStates.soil_type}`);
    
    // Log dosage recommendations
    if (fieldStates.nitrogen_dosage) {
      console.log(`      ⚠️ N Deficiency: ${fieldStates.nitrogen_dosage.recommendation}`);
    }
    if (fieldStates.phosphorus_dosage) {
      console.log(`      ⚠️ P Deficiency: ${fieldStates.phosphorus_dosage.recommendation}`);
    }
    if (fieldStates.potassium_dosage) {
      console.log(`      ⚠️ K Deficiency: ${fieldStates.potassium_dosage.recommendation}`);
    }
  } else {
    console.log('   📊 Soil: No test data available');
  }
  
  console.log('───────────────────────────────────────────────────────────────');
  
  if (fieldStates.has_ndvi_data) {
    console.log('   🛰️ NDVI State:');
    console.log(`      Value: ${fieldStates.ndvi?.toFixed(2)} → ${fieldStates.ndvi_state}`);
    console.log(`      Trend: ${fieldStates.ndvi_trend || 'UNKNOWN'}`);
  } else {
    console.log('   🛰️ NDVI: No satellite data available');
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
}

/**
 * Log complete land-crop context for debugging
 */
export function logLandCropStateCalculation(
  landId: string,
  cropCode: string,
  cropStage: string,
  soilHealth: any,
  ndvi: any
): void {
  const fieldStates = calculateFieldStates({ soil_health: soilHealth, ndvi, growth_stage: cropStage }, cropCode, cropStage);
  console.log(`   Land ID: ${landId}`);
  logStateCalculation(cropCode, fieldStates, cropStage);
}
