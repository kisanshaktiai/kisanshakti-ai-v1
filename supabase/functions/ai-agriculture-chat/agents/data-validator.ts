/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA VALIDATOR - NDVI, Growth Stage, and Data Quality Validation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PHASE 1: Critical Data Validation Layer
 * 
 * Validates:
 * - NDVI values against expected ranges for crop stage
 * - Growth stage calculation based on days since sowing
 * - Soil test data freshness and validity
 * - Data consistency across sources
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  valid: boolean;
  warning?: string;
  error?: string;
  confidence_penalty: number;
  corrected_value?: any;
  recommendations?: string[];
}

export interface NDVIValidationResult extends ValidationResult {
  expected_range: { min: number; max: number };
  actual_value: number;
  is_stale: boolean;
  age_days?: number;
}

export interface GrowthStageValidationResult extends ValidationResult {
  calculated_stage: string;
  input_stage?: string;
  days_since_sowing: number;
  crop_code: string;
}

export interface DataQualityReport {
  overall_score: number; // 0-100
  ndvi_valid: boolean;
  soil_valid: boolean;
  weather_valid: boolean;
  stage_valid: boolean;
  warnings: string[];
  critical_missing: string[];
  confidence_modifier: number; // 0.0-1.0, multiply with final confidence
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPECTED NDVI RANGES BY CROP STAGE (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

const NDVI_RANGES_BY_STAGE: Record<string, { min: number; max: number }> = {
  'GERMINATION': { min: 0.05, max: 0.20 },
  'SEEDLING': { min: 0.15, max: 0.35 },
  'TILLERING': { min: 0.30, max: 0.55 },
  'VEGETATIVE': { min: 0.40, max: 0.70 },
  'GRAND_GROWTH': { min: 0.50, max: 0.80 },
  'FLOWERING': { min: 0.55, max: 0.85 },
  'BOLL_FORMATION': { min: 0.50, max: 0.80 },
  'GRAIN_FILLING': { min: 0.45, max: 0.75 },
  'MATURITY': { min: 0.30, max: 0.60 },
  'HARVEST': { min: 0.20, max: 0.50 },
  'UNKNOWN': { min: 0.10, max: 0.80 },
};

// ═══════════════════════════════════════════════════════════════════════════
// CROP-SPECIFIC GROWTH STAGE DEFINITIONS (ICAR Standards)
// ═══════════════════════════════════════════════════════════════════════════

interface GrowthStageDefinition {
  maxDays: number;
  stage: string;
  typical_ndvi: { min: number; max: number };
}

const CROP_GROWTH_STAGES: Record<string, GrowthStageDefinition[]> = {
  'WHEAT': [
    { maxDays: 7, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.15 } },
    { maxDays: 21, stage: 'SEEDLING', typical_ndvi: { min: 0.15, max: 0.30 } },
    { maxDays: 45, stage: 'TILLERING', typical_ndvi: { min: 0.35, max: 0.55 } },
    { maxDays: 75, stage: 'STEM_ELONGATION', typical_ndvi: { min: 0.50, max: 0.70 } },
    { maxDays: 100, stage: 'FLOWERING', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 120, stage: 'GRAIN_FILLING', typical_ndvi: { min: 0.50, max: 0.70 } },
    { maxDays: 140, stage: 'MATURITY', typical_ndvi: { min: 0.35, max: 0.55 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.20, max: 0.40 } },
  ],
  'RICE': [
    { maxDays: 10, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.18 } },
    { maxDays: 25, stage: 'SEEDLING', typical_ndvi: { min: 0.18, max: 0.35 } },
    { maxDays: 45, stage: 'TILLERING', typical_ndvi: { min: 0.40, max: 0.60 } },
    { maxDays: 65, stage: 'PANICLE_INITIATION', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 85, stage: 'FLOWERING', typical_ndvi: { min: 0.60, max: 0.80 } },
    { maxDays: 110, stage: 'GRAIN_FILLING', typical_ndvi: { min: 0.50, max: 0.70 } },
    { maxDays: 130, stage: 'MATURITY', typical_ndvi: { min: 0.35, max: 0.55 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.20, max: 0.40 } },
  ],
  'SUGARCANE': [
    { maxDays: 30, stage: 'GERMINATION', typical_ndvi: { min: 0.10, max: 0.25 } },
    { maxDays: 60, stage: 'SEEDLING', typical_ndvi: { min: 0.20, max: 0.40 } },
    { maxDays: 90, stage: 'TILLERING', typical_ndvi: { min: 0.35, max: 0.55 } },
    { maxDays: 180, stage: 'GRAND_GROWTH', typical_ndvi: { min: 0.55, max: 0.80 } },
    { maxDays: 270, stage: 'MATURITY', typical_ndvi: { min: 0.50, max: 0.70 } },
    { maxDays: 330, stage: 'RIPENING', typical_ndvi: { min: 0.40, max: 0.60 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.30, max: 0.50 } },
  ],
  'COTTON': [
    { maxDays: 10, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.18 } },
    { maxDays: 25, stage: 'SEEDLING', typical_ndvi: { min: 0.18, max: 0.35 } },
    { maxDays: 50, stage: 'VEGETATIVE', typical_ndvi: { min: 0.40, max: 0.60 } },
    { maxDays: 70, stage: 'SQUARING', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 95, stage: 'FLOWERING', typical_ndvi: { min: 0.60, max: 0.80 } },
    { maxDays: 130, stage: 'BOLL_FORMATION', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 160, stage: 'BOLL_OPENING', typical_ndvi: { min: 0.40, max: 0.60 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.25, max: 0.45 } },
  ],
  'SOYBEAN': [
    { maxDays: 7, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.15 } },
    { maxDays: 20, stage: 'SEEDLING', typical_ndvi: { min: 0.15, max: 0.30 } },
    { maxDays: 40, stage: 'VEGETATIVE', typical_ndvi: { min: 0.40, max: 0.60 } },
    { maxDays: 60, stage: 'FLOWERING', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 80, stage: 'POD_FORMATION', typical_ndvi: { min: 0.50, max: 0.70 } },
    { maxDays: 100, stage: 'MATURITY', typical_ndvi: { min: 0.35, max: 0.55 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.20, max: 0.40 } },
  ],
  'MAIZE': [
    { maxDays: 7, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.15 } },
    { maxDays: 20, stage: 'SEEDLING', typical_ndvi: { min: 0.18, max: 0.35 } },
    { maxDays: 45, stage: 'VEGETATIVE', typical_ndvi: { min: 0.45, max: 0.65 } },
    { maxDays: 60, stage: 'TASSELING', typical_ndvi: { min: 0.60, max: 0.80 } },
    { maxDays: 75, stage: 'SILKING', typical_ndvi: { min: 0.60, max: 0.80 } },
    { maxDays: 100, stage: 'GRAIN_FILLING', typical_ndvi: { min: 0.50, max: 0.70 } },
    { maxDays: 120, stage: 'MATURITY', typical_ndvi: { min: 0.35, max: 0.55 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.20, max: 0.40 } },
  ],
  'GROUNDNUT': [
    { maxDays: 10, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.18 } },
    { maxDays: 25, stage: 'SEEDLING', typical_ndvi: { min: 0.18, max: 0.35 } },
    { maxDays: 45, stage: 'VEGETATIVE', typical_ndvi: { min: 0.40, max: 0.60 } },
    { maxDays: 65, stage: 'FLOWERING', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 90, stage: 'PEG_FORMATION', typical_ndvi: { min: 0.55, max: 0.75 } },
    { maxDays: 115, stage: 'POD_FILLING', typical_ndvi: { min: 0.45, max: 0.65 } },
    { maxDays: 130, stage: 'MATURITY', typical_ndvi: { min: 0.30, max: 0.50 } },
    { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.20, max: 0.40 } },
  ],
};

// Default stages for unknown crops
const DEFAULT_GROWTH_STAGES: GrowthStageDefinition[] = [
  { maxDays: 10, stage: 'GERMINATION', typical_ndvi: { min: 0.08, max: 0.18 } },
  { maxDays: 25, stage: 'SEEDLING', typical_ndvi: { min: 0.18, max: 0.35 } },
  { maxDays: 60, stage: 'VEGETATIVE', typical_ndvi: { min: 0.45, max: 0.70 } },
  { maxDays: 90, stage: 'FLOWERING', typical_ndvi: { min: 0.55, max: 0.80 } },
  { maxDays: 120, stage: 'MATURITY', typical_ndvi: { min: 0.35, max: 0.55 } },
  { maxDays: 999, stage: 'HARVEST', typical_ndvi: { min: 0.20, max: 0.40 } },
];

// ═══════════════════════════════════════════════════════════════════════════
// MINIMUM HARVEST AGE BY CROP (CRITICAL - Prevents premature harvest advice)
// ═══════════════════════════════════════════════════════════════════════════

export const MINIMUM_HARVEST_DAYS: Record<string, number> = {
  'WHEAT': 115,
  'RICE': 110,
  'SUGARCANE': 270,
  'COTTON': 150,
  'SOYBEAN': 95,
  'MAIZE': 90,
  'GROUNDNUT': 110,
  'TUR': 160,
  'GRAM': 100,
  'TOMATO': 75,
  'ONION': 90,
  'CHILLI': 80,
};

// ═══════════════════════════════════════════════════════════════════════════
// NDVI VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate NDVI value against expected range for crop stage
 * CRITICAL: Returns warning if NDVI doesn't match stage
 */
export function validateNDVIForStage(
  ndvi: number | undefined,
  cropStage: string | undefined,
  daysSinceSowing: number | undefined,
  cropCode: string | undefined,
  ndviAgeHours?: number
): NDVIValidationResult {
  // If no NDVI data, it's not invalid but not helpful
  if (ndvi === undefined || ndvi === null) {
    return {
      valid: true,
      warning: 'NDVI data not available - recommendations may be less accurate',
      confidence_penalty: 0.1,
      expected_range: { min: 0, max: 1 },
      actual_value: 0,
      is_stale: true,
    };
  }

  // Check if NDVI is stale (> 7 days old)
  const is_stale = ndviAgeHours ? ndviAgeHours > 168 : false; // 7 days

  // Get expected range for stage
  const stage = cropStage?.toUpperCase() || 'UNKNOWN';
  const expected = NDVI_RANGES_BY_STAGE[stage] || NDVI_RANGES_BY_STAGE['UNKNOWN'];

  // Calculate actual expected range based on crop-specific data if available
  let actualExpected = expected;
  if (cropCode && daysSinceSowing) {
    const cropStages = CROP_GROWTH_STAGES[cropCode.toUpperCase()] || DEFAULT_GROWTH_STAGES;
    for (const stagedef of cropStages) {
      if (daysSinceSowing <= stagedef.maxDays) {
        actualExpected = stagedef.typical_ndvi;
        break;
      }
    }
  }

  // Check if NDVI is within expected range (with 0.1 tolerance)
  const tolerance = 0.10;
  const isWithinRange = ndvi >= (actualExpected.min - tolerance) && ndvi <= (actualExpected.max + tolerance);

  if (!isWithinRange) {
    // CRITICAL: Flag as potential data quality issue
    const isTooLow = ndvi < actualExpected.min - tolerance;
    const isTooHigh = ndvi > actualExpected.max + tolerance;

    let warning = '';
    if (isTooLow) {
      warning = `NDVI ${ndvi.toFixed(2)} is unusually LOW for ${stage} stage (expected ${actualExpected.min}-${actualExpected.max}). `;
      warning += 'Possible causes: crop stress, water deficiency, pest damage, or stale satellite data.';
    } else if (isTooHigh) {
      warning = `NDVI ${ndvi.toFixed(2)} is unusually HIGH for ${stage} stage (expected ${actualExpected.min}-${actualExpected.max}). `;
      warning += 'Possible causes: weed cover, mixed pixels, or incorrect crop stage.';
    }

    return {
      valid: false,
      warning,
      confidence_penalty: 0.25,
      expected_range: actualExpected,
      actual_value: ndvi,
      is_stale,
      recommendations: [
        'Verify crop stage with field observation',
        'Check for crop stress symptoms',
        'Request updated satellite imagery if possible',
      ],
    };
  }

  // NDVI is valid but check if stale
  if (is_stale) {
    return {
      valid: true,
      warning: `NDVI data is ${Math.floor((ndviAgeHours || 0) / 24)} days old - may not reflect current conditions`,
      confidence_penalty: 0.1,
      expected_range: actualExpected,
      actual_value: ndvi,
      is_stale: true,
      age_days: Math.floor((ndviAgeHours || 0) / 24),
    };
  }

  return {
    valid: true,
    confidence_penalty: 0,
    expected_range: actualExpected,
    actual_value: ndvi,
    is_stale: false,
    age_days: Math.floor((ndviAgeHours || 0) / 24),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROWTH STAGE CALCULATOR (CRITICAL FIX)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate correct growth stage based on days since sowing
 * CRITICAL: This fixes the bug where 32-day Wheat was classified as SEEDLING
 */
export function calculateGrowthStage(
  daysSinceSowing: number | undefined,
  cropCode: string | undefined
): GrowthStageValidationResult {
  if (!daysSinceSowing || daysSinceSowing < 0) {
    return {
      valid: false,
      warning: 'Days since sowing not available',
      confidence_penalty: 0.2,
      calculated_stage: 'UNKNOWN',
      days_since_sowing: 0,
      crop_code: cropCode || 'UNKNOWN',
    };
  }

  const cropUpper = (cropCode || 'UNKNOWN').toUpperCase();
  const stages = CROP_GROWTH_STAGES[cropUpper] || DEFAULT_GROWTH_STAGES;

  let calculatedStage = 'UNKNOWN';
  for (const stagedef of stages) {
    if (daysSinceSowing <= stagedef.maxDays) {
      calculatedStage = stagedef.stage;
      break;
    }
  }

  return {
    valid: true,
    confidence_penalty: 0,
    calculated_stage: calculatedStage,
    days_since_sowing: daysSinceSowing,
    crop_code: cropUpper,
  };
}

/**
 * Validate provided growth stage against calculated stage
 * CRITICAL: Detects mismatches that could lead to wrong advice
 */
export function validateGrowthStage(
  providedStage: string | undefined,
  daysSinceSowing: number | undefined,
  cropCode: string | undefined
): GrowthStageValidationResult {
  const calculated = calculateGrowthStage(daysSinceSowing, cropCode);

  if (!providedStage) {
    return {
      ...calculated,
      warning: 'No growth stage provided, using calculated stage',
    };
  }

  const providedUpper = providedStage.toUpperCase();
  const calculatedUpper = calculated.calculated_stage.toUpperCase();

  // Check for major mismatches
  const youngStages = ['GERMINATION', 'SEEDLING'];
  const matureStages = ['MATURITY', 'HARVEST', 'RIPENING'];

  const isProvidedYoung = youngStages.includes(providedUpper);
  const isCalculatedYoung = youngStages.includes(calculatedUpper);
  const isProvidedMature = matureStages.includes(providedUpper);
  const isCalculatedMature = matureStages.includes(calculatedUpper);

  // CRITICAL: Flag if stages are wildly different
  if ((isProvidedYoung && isCalculatedMature) || (isProvidedMature && isCalculatedYoung)) {
    return {
      valid: false,
      warning: `CRITICAL MISMATCH: Provided stage "${providedStage}" conflicts with calculated stage "${calculated.calculated_stage}" for ${daysSinceSowing} days. Using calculated stage.`,
      error: 'Growth stage mismatch detected',
      confidence_penalty: 0.3,
      calculated_stage: calculated.calculated_stage,
      input_stage: providedStage,
      days_since_sowing: daysSinceSowing || 0,
      crop_code: cropCode || 'UNKNOWN',
      corrected_value: calculated.calculated_stage,
    };
  }

  // Minor mismatch (adjacent stages) - warning but use provided
  if (providedUpper !== calculatedUpper) {
    return {
      valid: true,
      warning: `Provided stage "${providedStage}" differs from calculated "${calculated.calculated_stage}". Using provided stage.`,
      confidence_penalty: 0.1,
      calculated_stage: calculated.calculated_stage,
      input_stage: providedStage,
      days_since_sowing: daysSinceSowing || 0,
      crop_code: cropCode || 'UNKNOWN',
    };
  }

  return {
    ...calculated,
    input_stage: providedStage,
    valid: true,
    confidence_penalty: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CAN RECOMMEND HARVEST VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if harvest advice is appropriate for current crop stage/age
 * CRITICAL: Prevents premature harvest recommendations
 */
export function canRecommendHarvest(
  daysSinceSowing: number | undefined,
  cropCode: string | undefined,
  cropStage: string | undefined
): ValidationResult {
  const cropUpper = (cropCode || '').toUpperCase();
  const minDays = MINIMUM_HARVEST_DAYS[cropUpper] || 90;

  // Check age
  if (daysSinceSowing && daysSinceSowing < minDays * 0.8) {
    return {
      valid: false,
      error: `Crop is only ${daysSinceSowing} days old. Minimum age for ${cropUpper} harvest is ${minDays} days.`,
      warning: 'Harvest recommendation BLOCKED - crop too young',
      confidence_penalty: 1.0, // Complete block
      recommendations: [
        `Wait until crop is at least ${minDays} days old`,
        'Check for harvest readiness indicators in field',
        'Test grain moisture before harvest',
      ],
    };
  }

  // Check stage
  const youngStages = ['GERMINATION', 'SEEDLING', 'VEGETATIVE', 'TILLERING', 'GRAND_GROWTH'];
  if (cropStage && youngStages.includes(cropStage.toUpperCase())) {
    return {
      valid: false,
      error: `Crop is in ${cropStage} stage. Harvest is NOT appropriate.`,
      warning: 'Harvest recommendation BLOCKED - wrong growth stage',
      confidence_penalty: 1.0,
    };
  }

  return {
    valid: true,
    confidence_penalty: 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SOIL DATA VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate soil test data freshness and completeness
 */
export function validateSoilData(
  soilData: {
    nitrogen_kg_per_ha?: number;
    phosphorus_kg_per_ha?: number;
    potassium_kg_per_ha?: number;
    ph_level?: number;
    test_date?: string;
  } | undefined
): ValidationResult {
  if (!soilData) {
    return {
      valid: true, // Not invalid, just missing
      warning: 'No soil test data available - fertilizer recommendations will be general',
      confidence_penalty: 0.15,
      recommendations: ['Consider getting soil tested for accurate fertilizer dosages'],
    };
  }

  const warnings: string[] = [];
  let confidencePenalty = 0;

  // Check data completeness
  if (!soilData.nitrogen_kg_per_ha && !soilData.phosphorus_kg_per_ha && !soilData.potassium_kg_per_ha) {
    warnings.push('NPK values missing from soil data');
    confidencePenalty += 0.1;
  }

  // Check data freshness
  if (soilData.test_date) {
    const testDate = new Date(soilData.test_date);
    const daysSinceTest = Math.floor((Date.now() - testDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceTest > 180) { // 6 months
      warnings.push(`Soil test is ${daysSinceTest} days old - consider retesting`);
      confidencePenalty += 0.05;
    }
    if (daysSinceTest > 365) { // 1 year
      warnings.push('Soil test is over 1 year old - results may not be accurate');
      confidencePenalty += 0.1;
    }
  }

  // Validate pH range
  if (soilData.ph_level && (soilData.ph_level < 4.0 || soilData.ph_level > 10.0)) {
    warnings.push(`pH value ${soilData.ph_level} is outside normal range (4.0-10.0)`);
    confidencePenalty += 0.1;
  }

  return {
    valid: warnings.length === 0,
    warning: warnings.join('. '),
    confidence_penalty: confidencePenalty,
    recommendations: warnings.length > 0 ? ['Verify soil test data accuracy'] : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE DATA QUALITY REPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate comprehensive data quality report for decision making
 */
export function generateDataQualityReport(context: {
  ndvi?: number;
  ndvi_age_hours?: number;
  crop_stage?: string;
  days_since_sowing?: number;
  crop_code?: string;
  soil_data?: any;
  weather_available?: boolean;
}): DataQualityReport {
  const warnings: string[] = [];
  const critical: string[] = [];
  let totalPenalty = 0;

  // Validate NDVI
  const ndviResult = validateNDVIForStage(
    context.ndvi,
    context.crop_stage,
    context.days_since_sowing,
    context.crop_code,
    context.ndvi_age_hours
  );
  if (!ndviResult.valid) {
    warnings.push(ndviResult.warning || 'NDVI validation failed');
  }
  totalPenalty += ndviResult.confidence_penalty;

  // Validate growth stage
  const stageResult = validateGrowthStage(
    context.crop_stage,
    context.days_since_sowing,
    context.crop_code
  );
  if (!stageResult.valid) {
    warnings.push(stageResult.warning || 'Growth stage validation failed');
    if (stageResult.error) critical.push(stageResult.error);
  }
  totalPenalty += stageResult.confidence_penalty;

  // Validate soil data
  const soilResult = validateSoilData(context.soil_data);
  if (!soilResult.valid) {
    warnings.push(soilResult.warning || 'Soil data incomplete');
  }
  totalPenalty += soilResult.confidence_penalty;

  // Check weather availability
  if (!context.weather_available) {
    warnings.push('Weather data not available');
    totalPenalty += 0.05;
  }

  // Check critical missing data
  if (!context.crop_code) {
    critical.push('Crop not identified');
    totalPenalty += 0.2;
  }
  if (!context.days_since_sowing) {
    critical.push('Days since sowing unknown');
    totalPenalty += 0.15;
  }

  // Calculate overall score
  const confidenceModifier = Math.max(0, 1 - totalPenalty);
  const overallScore = Math.round(confidenceModifier * 100);

  return {
    overall_score: overallScore,
    ndvi_valid: ndviResult.valid,
    soil_valid: soilResult.valid,
    weather_valid: context.weather_available || false,
    stage_valid: stageResult.valid,
    warnings,
    critical_missing: critical,
    confidence_modifier: confidenceModifier,
  };
}

// Export version
export const DATA_VALIDATOR_VERSION = '1.0.0';
