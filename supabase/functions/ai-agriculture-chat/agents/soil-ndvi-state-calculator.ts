/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOIL & NDVI STATE CALCULATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Converts raw soil test values and NDVI readings into categorical states
 * for rule engine consumption (based on ICAR standards)
 */

export type NutrientState = 'LOW' | 'ADEQUATE' | 'HIGH';
export type NDVIState = 'EXCELLENT' | 'HEALTHY' | 'MODERATE_STRESS' | 'HIGH_STRESS' | 'CRITICAL';
export type NDVITrend = 'RISING' | 'STABLE' | 'DECLINING';
export type SoilType = 'SANDY' | 'SANDY_LOAM' | 'LOAMY' | 'CLAY_LOAM' | 'CLAY' | 'BLACK_COTTON' | 'RED' | 'LATERITE';

// ═══════════════════════════════════════════════════════════════════════════
// SOIL NUTRIENT STATE CALCULATION (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crop-specific nitrogen requirements (kg/ha)
 * Based on ICAR recommendations for medium fertility soils
 */
const NITROGEN_REQUIREMENTS: Record<string, { low: number; high: number }> = {
  'COTTON': { low: 200, high: 400 },
  'RICE': { low: 180, high: 350 },
  'PADDY': { low: 180, high: 350 },
  'WHEAT': { low: 150, high: 300 },
  'SOYBEAN': { low: 100, high: 200 },
  'SUGARCANE': { low: 250, high: 500 },
  'MAIZE': { low: 150, high: 300 },
  'TOMATO': { low: 180, high: 350 },
  'ONION': { low: 150, high: 300 },
  'CHILLI': { low: 150, high: 300 },
  'GROUNDNUT': { low: 100, high: 200 }
};

/**
 * Crop-specific phosphorus requirements (kg/ha)
 */
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
  'GROUNDNUT': { low: 15, high: 30 }
};

/**
 * Crop-specific potassium requirements (kg/ha)
 */
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
  'GROUNDNUT': { low: 150, high: 300 }
};

/**
 * Calculate nitrogen state for crop-specific requirements
 */
export function calculateNitrogenState(
  nitrogenKgPerHa: number | undefined | null,
  cropCode: string
): NutrientState | undefined {
  if (nitrogenKgPerHa === undefined || nitrogenKgPerHa === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const requirements = NITROGEN_REQUIREMENTS[cropUpper] || { low: 150, high: 300 };
  
  if (nitrogenKgPerHa < requirements.low) return 'LOW';
  if (nitrogenKgPerHa > requirements.high) return 'HIGH';
  return 'ADEQUATE';
}

/**
 * Calculate phosphorus state for crop-specific requirements
 */
export function calculatePhosphorusState(
  phosphorusKgPerHa: number | undefined | null,
  cropCode: string
): NutrientState | undefined {
  if (phosphorusKgPerHa === undefined || phosphorusKgPerHa === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const requirements = PHOSPHORUS_REQUIREMENTS[cropUpper] || { low: 15, high: 30 };
  
  if (phosphorusKgPerHa < requirements.low) return 'LOW';
  if (phosphorusKgPerHa > requirements.high) return 'HIGH';
  return 'ADEQUATE';
}

/**
 * Calculate potassium state for crop-specific requirements
 */
export function calculatePotassiumState(
  potassiumKgPerHa: number | undefined | null,
  cropCode: string
): NutrientState | undefined {
  if (potassiumKgPerHa === undefined || potassiumKgPerHa === null) return undefined;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const requirements = POTASSIUM_REQUIREMENTS[cropUpper] || { low: 150, high: 300 };
  
  if (potassiumKgPerHa < requirements.low) return 'LOW';
  if (potassiumKgPerHa > requirements.high) return 'HIGH';
  return 'ADEQUATE';
}

// ═══════════════════════════════════════════════════════════════════════════
// NDVI STATE CALCULATION (Standard Interpretation)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map NDVI value to health state category
 * Based on standard NDVI interpretation for agricultural crops
 * 
 * NDVI Scale:
 * - 0.75-1.00: Excellent (dense, healthy vegetation)
 * - 0.60-0.75: Healthy (good vegetation cover)
 * - 0.40-0.60: Moderate stress (thin vegetation or mild stress)
 * - 0.25-0.40: High stress (sparse vegetation or disease)
 * - 0.00-0.25: Critical (very poor or dying vegetation)
 */
export function mapNDVIToState(ndviValue: number | undefined | null): NDVIState | undefined {
  if (ndviValue === undefined || ndviValue === null) return undefined;
  
  if (ndviValue >= 0.75) return 'EXCELLENT';
  if (ndviValue >= 0.60) return 'HEALTHY';
  if (ndviValue >= 0.40) return 'MODERATE_STRESS';
  if (ndviValue >= 0.25) return 'HIGH_STRESS';
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
  
  // Compare latest vs previous reading
  const latest = ndviHistory[0].value;
  const previous = ndviHistory[1].value;
  const change = latest - previous;
  
  // Threshold for significant change: 0.05 NDVI units
  if (change > 0.05) return 'RISING';
  if (change < -0.05) return 'DECLINING';
  return 'STABLE';
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL TYPE NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize soil type string to standard categories
 */
export function normalizeSoilType(soilType: string | undefined): SoilType {
  if (!soilType) return 'LOAMY';
  
  const normalized = soilType.toUpperCase();
  
  // Check for specific soil types
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
// HELPER: Get Nutrient Deficiency Amount
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate how much nutrient is deficient (for fertilizer recommendation)
 */
export function calculateNutrientDeficiency(
  currentKgPerHa: number,
  cropCode: string,
  nutrientType: 'N' | 'P' | 'K'
): number {
  const requirements = nutrientType === 'N' ? NITROGEN_REQUIREMENTS :
                       nutrientType === 'P' ? PHOSPHORUS_REQUIREMENTS :
                       POTASSIUM_REQUIREMENTS;
  
  const cropUpper = cropCode?.toUpperCase() || 'COTTON';
  const req = requirements[cropUpper] || requirements['COTTON'];
  
  // Target is midpoint of low-high range
  const target = (req.low + req.high) / 2;
  const deficiency = Math.max(0, target - currentKgPerHa);
  
  return Math.round(deficiency);
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
}

/**
 * Calculate all field states from land context
 */
export function calculateFieldStates(
  landContext: any,
  cropCode: string
): CalculatedFieldStates {
  const soilHealth = landContext?.soil_health;
  const ndviData = landContext?.ndvi;
  
  return {
    // Soil nutrient states
    soil_nitrogen_state: calculateNitrogenState(soilHealth?.nitrogen, cropCode),
    soil_phosphorus_state: calculatePhosphorusState(soilHealth?.phosphorus, cropCode),
    soil_potassium_state: calculatePotassiumState(soilHealth?.potassium, cropCode),
    
    // Soil properties
    soil_ph: soilHealth?.ph,
    soil_organic_carbon: soilHealth?.organic_carbon,
    soil_type: normalizeSoilType(landContext?.soil_type),
    
    // NDVI data
    ndvi: ndviData?.value,
    ndvi_state: mapNDVIToState(ndviData?.value),
    ndvi_trend: calculateNDVITrend(ndviData?.trend, landContext?.ndvi_history),
    
    // Flags for data availability
    has_soil_data: !!(soilHealth?.nitrogen || soilHealth?.phosphorus || soilHealth?.potassium),
    has_ndvi_data: !!(ndviData?.value)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log soil/NDVI state calculation for debugging
 */
export function logStateCalculation(
  cropCode: string,
  fieldStates: CalculatedFieldStates
): void {
  console.log('🧪 [StateCalculator] Field conditions calculated:');
  console.log(`   Crop: ${cropCode}`);
  
  if (fieldStates.has_soil_data) {
    console.log(`   Soil NPK States: N=${fieldStates.soil_nitrogen_state || 'N/A'}, P=${fieldStates.soil_phosphorus_state || 'N/A'}, K=${fieldStates.soil_potassium_state || 'N/A'}`);
    console.log(`   Soil pH: ${fieldStates.soil_ph || 'N/A'}, OC: ${fieldStates.soil_organic_carbon || 'N/A'}`);
    console.log(`   Soil Type: ${fieldStates.soil_type}`);
  } else {
    console.log('   Soil: No test data available');
  }
  
  if (fieldStates.has_ndvi_data) {
    console.log(`   NDVI: ${fieldStates.ndvi?.toFixed(2)} (${fieldStates.ndvi_state}), Trend: ${fieldStates.ndvi_trend || 'N/A'}`);
  } else {
    console.log('   NDVI: No satellite data available');
  }
}
