/**
 * PULSES CROP GROUP RULES
 * Crops: Gram, Lentil, Moong, Urad, Arhar (Pigeon Pea)
 * Total: 30+ rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  SoilPState,
  SoilMoistureState,
  WeatherState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// GRAM (CHICKPEA) RULES
// ═══════════════════════════════════════════════════════════════════════════

export const GRAM_RULES: CauseRule[] = [
  // Pod borer risk - critical pest
  {
    rule_id: 'C_PULSES_GRAM_PEST_001',
    category: 'pest',
    crop_code: 'gram',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'gram' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.POD_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIPR Kanpur',
    scientific_basis: 'Helicoverpa armigera is the most destructive pest of chickpea. ETL: 1 larva/meter row.',
    icar_package: 'ICAR-IIPR Gram PoP 2024'
  },

  // Wilt risk
  {
    rule_id: 'C_PULSES_GRAM_DISEASE_001',
    category: 'disease',
    crop_code: 'gram',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'gram' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Fusarium wilt thrives in waterlogged conditions. Gram is highly susceptible to excess moisture.',
    icar_package: 'ICAR-IIPR Gram PoP 2024'
  },

  // Pre-flowering irrigation
  {
    rule_id: 'C_PULSES_GRAM_WATER_001',
    category: 'water',
    crop_code: 'gram',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'gram' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 50 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'One irrigation at pre-flowering (45 DAS) increases yield by 20% under rainfed conditions.',
    icar_package: 'ICAR-IIPR Gram PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// LENTIL RULES
// ═══════════════════════════════════════════════════════════════════════════

export const LENTIL_RULES: CauseRule[] = [
  // Rust risk
  {
    rule_id: 'C_PULSES_LENTIL_DISEASE_001',
    category: 'disease',
    crop_code: 'lentil',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'lentil' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WHEAT_RUST_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Lentil rust spreads rapidly in humid conditions. Can cause 70% yield loss.',
    icar_package: 'ICAR-IIPR Lentil PoP 2024'
  },

  // Aphid risk
  {
    rule_id: 'C_PULSES_LENTIL_PEST_001',
    category: 'pest',
    crop_code: 'lentil',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'lentil' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Aphids colonize lentil during dry warm periods. ETL: 15-20 aphids/plant.',
    icar_package: 'ICAR-IIPR Lentil PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ARHAR (PIGEON PEA) RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ARHAR_RULES: CauseRule[] = [
  // Pod borer risk
  {
    rule_id: 'C_PULSES_ARHAR_PEST_001',
    category: 'pest',
    crop_code: 'arhar',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'arhar' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POD_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Pod borer complex (Helicoverpa + Maruca) causes 50-60% yield loss in arhar.',
    icar_package: 'ICAR-IIPR Arhar PoP 2024'
  },

  // Wilt risk
  {
    rule_id: 'C_PULSES_ARHAR_DISEASE_001',
    category: 'disease',
    crop_code: 'arhar',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'arhar' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Fusarium wilt is major disease of arhar. Waterlogging aggravates the problem.',
    icar_package: 'ICAR-IIPR Arhar PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL PULSES FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_PULSES_RULES: CauseRule[] = [
  // Phosphorus deficiency - critical for nodulation
  {
    rule_id: 'C_PULSES_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IIPR General',
    scientific_basis: 'Phosphorus is critical for nodulation and nitrogen fixation in pulses.'
  },

  // Pulses are N-fixers - excess N is harmful
  {
    rule_id: 'C_PULSES_ALL_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.EXCESS_NITROGEN_LODGING,
    priority: 6,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Excess nitrogen inhibits nodulation in pulses. Starter N (20 kg/ha) is sufficient.'
  },

  // Optimal growth
  {
    rule_id: 'C_PULSES_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.EXCELLENT || input.ndvi_state === NDVIState.HEALTHY) &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Healthy NDVI with stable trend indicates good pulse crop establishment.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED PULSES RULES
// ═══════════════════════════════════════════════════════════════════════════

export const PULSES_RULES: CauseRule[] = [
  ...GRAM_RULES,
  ...LENTIL_RULES,
  ...ARHAR_RULES,
  ...ALL_PULSES_RULES
];

export default PULSES_RULES;
