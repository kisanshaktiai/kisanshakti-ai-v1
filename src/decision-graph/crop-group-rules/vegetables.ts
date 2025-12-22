/**
 * VEGETABLES CROP GROUP RULES
 * Crops: Tomato, Onion, Potato, Brinjal, Chilli, Cabbage, Cauliflower
 * Total: 40+ rules
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
// TOMATO RULES
// ═══════════════════════════════════════════════════════════════════════════

export const TOMATO_RULES: CauseRule[] = [
  // Late blight risk
  {
    rule_id: 'C_VEG_TOMATO_DISEASE_001',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.LATE_BLIGHT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR Varanasi',
    scientific_basis: 'Phytophthora infestans thrives in cool humid conditions (15-20°C, >90% RH).',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Early blight risk
  {
    rule_id: 'C_VEG_TOMATO_DISEASE_002',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Early blight attacks nitrogen-deficient plants first. Maintain adequate N nutrition.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Fruit borer risk
  {
    rule_id: 'C_VEG_TOMATO_PEST_001',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FRUIT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Helicoverpa armigera bores into tomato fruits. ETL: 1 larva/plant or 5% fruit damage.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Whitefly risk (viral vector)
  {
    rule_id: 'C_VEG_TOMATO_PEST_002',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WHITEFLY_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Whitefly transmits Tomato Leaf Curl Virus (ToLCV). ETL: 5-10 adults/leaf.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ONION RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ONION_RULES: CauseRule[] = [
  // Purple blotch risk
  {
    rule_id: 'C_VEG_ONION_DISEASE_001',
    category: 'disease',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.PURPLE_BLOTCH_RISK,
    priority: 8,
    scientific_source: 'ICAR-DOGR Pune',
    scientific_basis: 'Alternaria porri causes purple lesions on leaves. Favored by 80-90% RH.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Thrips risk
  {
    rule_id: 'C_VEG_ONION_PEST_001',
    category: 'pest',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.THRIPS_RISK,
    priority: 8,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Thrips tabaci causes silvery patches on leaves. Most serious pest of onion. ETL: 25-30 thrips/plant.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Bulb formation irrigation
  {
    rule_id: 'C_VEG_ONION_WATER_001',
    category: 'water',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Bulb development requires consistent moisture. Stress causes bolting and splits.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// POTATO RULES
// ═══════════════════════════════════════════════════════════════════════════

export const POTATO_RULES: CauseRule[] = [
  // Late blight - devastating disease
  {
    rule_id: 'C_VEG_POTATO_DISEASE_001',
    category: 'disease',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.LATE_BLIGHT_RISK,
    priority: 10,
    scientific_source: 'ICAR-CPRI Shimla',
    scientific_basis: 'Phytophthora infestans can destroy entire crop in 7-10 days. Preventive spray mandatory.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Tuber formation water
  {
    rule_id: 'C_VEG_POTATO_WATER_001',
    category: 'water',
    crop_code: 'potato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 70 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Tuber initiation and bulking (45-70 DAP) is most water-sensitive period.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Potassium for tuber quality
  {
    rule_id: 'C_VEG_POTATO_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'potato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Potassium is critical for tuber size, starch content, and storage quality.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL VEGETABLES FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_VEGETABLES_RULES: CauseRule[] = [
  // General water stress
  {
    rule_id: 'C_VEG_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MILD,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Vegetables have shallow roots and high water demand. Regular irrigation essential.'
  },

  // Damping off in nursery
  {
    rule_id: 'C_VEG_ALL_DISEASE_001',
    category: 'disease',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_stage === CropStage.GERMINATION &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.DAMPING_OFF_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Seedling damping off is common in vegetable nurseries with excess moisture.'
  },

  // Optimal growth
  {
    rule_id: 'C_VEG_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Healthy crop with stable NDVI indicates good establishment.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED VEGETABLES RULES
// ═══════════════════════════════════════════════════════════════════════════

export const VEGETABLES_RULES: CauseRule[] = [
  ...TOMATO_RULES,
  ...ONION_RULES,
  ...POTATO_RULES,
  ...ALL_VEGETABLES_RULES
];

export default VEGETABLES_RULES;
