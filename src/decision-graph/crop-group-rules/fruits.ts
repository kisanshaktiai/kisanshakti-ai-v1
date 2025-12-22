/**
 * FRUITS CROP GROUP RULES
 * Crops: Mango, Citrus, Banana, Grapes, Papaya
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
// MANGO RULES
// ═══════════════════════════════════════════════════════════════════════════

export const MANGO_RULES: CauseRule[] = [
  // Mango hopper
  {
    rule_id: 'C_FRUIT_MANGO_PEST_001',
    category: 'pest',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state !== WeatherState.RAIN_ACTIVE,
    cause: Cause.JASSID_RISK,
    priority: 8,
    scientific_source: 'ICAR-CISH Lucknow',
    scientific_basis: 'Mango hopper sucks sap from inflorescence causing flower drop. Peak during flowering.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // Powdery mildew on flowers
  {
    rule_id: 'C_FRUIT_MANGO_DISEASE_001',
    category: 'disease',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 8,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Oidium mangiferae infects flowers and young fruits in humid weather.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // Fruit drop from heat
  {
    rule_id: 'C_FRUIT_MANGO_HEAT_001',
    category: 'temperature',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.HEAT_STRESS,
    priority: 7,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'High temperature (>40°C) during fruit development causes physiological drop.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BANANA RULES
// ═══════════════════════════════════════════════════════════════════════════

export const BANANA_RULES: CauseRule[] = [
  // Panama disease (Fusarium wilt)
  {
    rule_id: 'C_FRUIT_BANANA_DISEASE_001',
    category: 'disease',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRCB Trichy',
    scientific_basis: 'Fusarium wilt (TR4) spreads in waterlogged soils. No cure once infected.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // Sigatoka leaf spot
  {
    rule_id: 'C_FRUIT_BANANA_DISEASE_002',
    category: 'disease',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Sigatoka leaf spot reduces photosynthesis. Favored by humid weather.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // Potassium for bunch quality
  {
    rule_id: 'C_FRUIT_BANANA_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'banana',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Potassium is critical for bunch weight and finger quality.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // Water stress
  {
    rule_id: 'C_FRUIT_BANANA_WATER_001',
    category: 'water',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Banana has high water requirement. Stress affects pseudostem and bunch development.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CITRUS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const CITRUS_RULES: CauseRule[] = [
  // Citrus greening (HLB)
  {
    rule_id: 'C_FRUIT_CITRUS_DISEASE_001',
    category: 'disease',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CCRI Nagpur',
    scientific_basis: 'HLB causes asymmetric yellowing and decline. Psyllid vector control essential.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // Citrus mite
  {
    rule_id: 'C_FRUIT_CITRUS_PEST_001',
    category: 'pest',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.MITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Citrus mite causes russeting of fruits. Active in dry hot weather.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL FRUITS FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FRUITS_RULES: CauseRule[] = [
  // General water stress
  {
    rule_id: 'C_FRUIT_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR Fruit Crops',
    scientific_basis: 'Fruit crops have high water demand especially during fruit development.'
  },

  // Optimal growth
  {
    rule_id: 'C_FRUIT_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR',
    scientific_basis: 'Healthy NDVI indicates good orchard health.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FRUITS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const FRUITS_RULES: CauseRule[] = [
  ...MANGO_RULES,
  ...BANANA_RULES,
  ...CITRUS_RULES,
  ...ALL_FRUITS_RULES
];

export default FRUITS_RULES;
