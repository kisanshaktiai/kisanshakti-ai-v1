/**
 * SUGARCANE CROP GROUP RULES
 * Total: 20+ rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  SoilKState,
  SoilMoistureState,
  WeatherState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE RULES
// ═══════════════════════════════════════════════════════════════════════════

export const SUGARCANE_RULES: CauseRule[] = [
  // Early shoot borer
  {
    rule_id: 'C_SUGAR_PEST_001',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      (input.crop_stage === CropStage.GERMINATION || input.crop_stage === CropStage.VEGETATIVE) &&
      input.days_after_sowing <= 120,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-SBI Coimbatore',
    scientific_basis: 'Early shoot borer causes dead hearts in young cane. ETL: 10% dead hearts.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Top borer
  {
    rule_id: 'C_SUGAR_PEST_002',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 90 && input.days_after_sowing <= 180 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Top borer causes bunchy top appearance. Peak during grand growth.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Red rot disease
  {
    rule_id: 'C_SUGAR_DISEASE_001',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.RED_ROT_SUGARCANE_RISK,
    priority: 9,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Colletotrichum falcatum causes red rot. Major disease during waterlogged conditions.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Tillering phase irrigation
  {
    rule_id: 'C_SUGAR_WATER_001',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 120 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Tillering phase (45-120 DAP) requires adequate moisture for tiller production.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Grand growth water - critical
  {
    rule_id: 'C_SUGAR_WATER_002',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 120 && input.days_after_sowing <= 270 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Grand growth phase (120-270 DAP) has maximum water demand. Stress reduces cane yield.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Nitrogen for tillering
  {
    rule_id: 'C_SUGAR_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing <= 120,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Nitrogen is critical during tillering for tiller production and cane yield.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Potassium for sucrose
  {
    rule_id: 'C_SUGAR_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.days_after_sowing >= 240,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Potassium is critical for sucrose accumulation during maturity phase.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Waterlogging risk
  {
    rule_id: 'C_SUGAR_WATER_003',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Waterlogging reduces germination and promotes red rot disease.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // Optimal growth
  {
    rule_id: 'C_SUGAR_HEALTHY_001',
    category: 'healthy',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.ndvi_state === NDVIState.EXCELLENT &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Excellent NDVI during grand growth indicates high yield potential.'
  },

  // Recovery trend
  {
    rule_id: 'C_SUGAR_HEALTHY_002',
    category: 'healthy',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.ndvi_trend === NDVITrend.RISING,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI',
    scientific_basis: 'Rising NDVI indicates recovery from previous stress.'
  },
];

export default SUGARCANE_RULES;
