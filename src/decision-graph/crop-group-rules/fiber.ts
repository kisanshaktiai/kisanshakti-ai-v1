/**
 * FIBER CROP GROUP RULES
 * Crops: Cotton, Jute, Mesta
 * Total: 25+ rules
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
// COTTON RULES
// ═══════════════════════════════════════════════════════════════════════════

export const COTTON_RULES: CauseRule[] = [
  // Bollworm risk - most critical pest
  {
    rule_id: 'C_FIBER_COTTON_PEST_001',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BOLLWORM_RISK,
    priority: 9,
    scientific_source: 'ICAR-CICR Nagpur',
    scientific_basis: 'Pink bollworm and American bollworm are major pests. ETL: 5-10% boll damage.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // Whitefly risk
  {
    rule_id: 'C_FIBER_COTTON_PEST_002',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.WHITEFLY_RISK,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Whitefly thrives in dry weather with excess nitrogen. Causes honeydew and transmits CLCV.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // Jassid risk
  {
    rule_id: 'C_FIBER_COTTON_PEST_003',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.JASSID_RISK,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Jassid causes leaf curl and hopper burn. ETL: 2 nymphs/leaf on middle canopy.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // Boll development water
  {
    rule_id: 'C_FIBER_COTTON_WATER_001',
    category: 'water',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_COTTON_BOLL,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Boll development stage (60-90 DAS) is critical for fiber quality and yield.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // Heat stress - boll shedding
  {
    rule_id: 'C_FIBER_COTTON_HEAT_001',
    category: 'temperature',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.HEAT_STRESS_COTTON_SHEDDING,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'High temperature (>38°C) during flowering causes square and boll shedding.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // Potassium for fiber quality
  {
    rule_id: 'C_FIBER_COTTON_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Potassium is critical for fiber length, strength, and micronaire.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // Boll rot risk
  {
    rule_id: 'C_FIBER_COTTON_DISEASE_001',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.COTTON_BOLL_ROT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Boll rot complex favored by high humidity. Affects fiber quality.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// JUTE RULES
// ═══════════════════════════════════════════════════════════════════════════

export const JUTE_RULES: CauseRule[] = [
  // Stem rot risk
  {
    rule_id: 'C_FIBER_JUTE_DISEASE_001',
    category: 'disease',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Macrophomina stem rot occurs in waterlogged conditions.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // Semi-looper risk
  {
    rule_id: 'C_FIBER_JUTE_PEST_001',
    category: 'pest',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Jute semi-looper causes severe defoliation. ETL: 5 larvae/plant.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL FIBER FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FIBER_RULES: CauseRule[] = [
  // Nitrogen for fiber yield
  {
    rule_id: 'C_FIBER_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_FIBER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR Fiber Crops',
    scientific_basis: 'Nitrogen is critical for vegetative growth and fiber yield in all fiber crops.'
  },

  // Optimal growth
  {
    rule_id: 'C_FIBER_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_FIBER',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Healthy NDVI indicates good crop establishment.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FIBER RULES
// ═══════════════════════════════════════════════════════════════════════════

export const FIBER_RULES: CauseRule[] = [
  ...COTTON_RULES,
  ...JUTE_RULES,
  ...ALL_FIBER_RULES
];

export default FIBER_RULES;
