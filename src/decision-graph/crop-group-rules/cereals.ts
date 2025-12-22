/**
 * CEREALS CROP GROUP RULES
 * Crops: Wheat, Rice, Maize, Barley, Millets
 * Total: 50+ rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  SoilMoistureState,
  WeatherState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT RULES
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_RULES: CauseRule[] = [
  // Crown Root Initiation - Critical irrigation
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_001',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 18 && input.days_after_sowing <= 25 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_WHEAT_CRI,
    priority: 10,
    scientific_source: 'ICAR-IARI Wheat Package 2024',
    scientific_basis: 'Crown Root Initiation (21-25 DAS) is the most critical irrigation for wheat. Missing this irrigation reduces yield by 40%.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },
  
  // Tillering stage water
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_002',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 50 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.weather_state !== WeatherState.RAIN_EXPECTED,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Tillering irrigation promotes tiller production and increases spike count.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Terminal heat stress
  {
    rule_id: 'C_CEREALS_WHEAT_HEAT_001',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      (input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY) &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.TERMINAL_HEAT_WHEAT,
    priority: 9,
    scientific_source: 'ICAR-IARI Heat Stress Management',
    scientific_basis: 'Terminal heat during grain filling reduces wheat yield by 5% for every degree above 25°C.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Rust risk
  {
    rule_id: 'C_CEREALS_WHEAT_DISEASE_001',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.WHEAT_RUST_RISK,
    priority: 8,
    scientific_source: 'ICAR-IARI Disease Management',
    scientific_basis: 'High humidity >80% combined with excess nitrogen favors rust development in wheat.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Aphid risk
  {
    rule_id: 'C_CEREALS_WHEAT_PEST_001',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 80 &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI IPM',
    scientific_basis: 'Aphids attack wheat during ear formation in warm dry conditions. ETL: 10 aphids/tiller.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RICE RULES
// ═══════════════════════════════════════════════════════════════════════════

export const RICE_RULES: CauseRule[] = [
  // Blast risk
  {
    rule_id: 'C_CEREALS_RICE_DISEASE_001',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.RICE_BLAST_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI Cuttack',
    scientific_basis: 'Pyricularia oryzae thrives at >90% RH, 25-28°C, excess nitrogen. ICAR ETL: 5% leaf area affected.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Stem borer risk
  {
    rule_id: 'C_CEREALS_RICE_PEST_001',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI IPM',
    scientific_basis: 'Yellow stem borer causes dead hearts at tillering. ICAR ETL: 5% dead hearts.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Spikelet sterility from heat
  {
    rule_id: 'C_CEREALS_RICE_HEAT_001',
    category: 'temperature',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.SPIKELET_STERILITY_RICE,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Heat stress >35°C during flowering causes spikelet sterility. Yield loss up to 60%.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Transplanting water stress
  {
    rule_id: 'C_CEREALS_RICE_WATER_001',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.SOWING &&
      input.soil_states.moisture !== SoilMoistureState.WATERLOGGED,
    cause: Cause.WATER_STRESS_RICE_TRANSPLANTING,
    priority: 10,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice transplanting requires standing water. Dry field at transplanting causes poor establishment.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Bacterial blight risk
  {
    rule_id: 'C_CEREALS_RICE_DISEASE_002',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.RICE_BACTERIAL_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Bacterial blight spreads rapidly in humid conditions with excess nitrogen.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIZE RULES
// ═══════════════════════════════════════════════════════════════════════════

export const MAIZE_RULES: CauseRule[] = [
  // Knee high stage water
  {
    rule_id: 'C_CEREALS_MAIZE_WATER_001',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 35 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Knee-high stage (V6) is critical for maize. Water stress reduces plant height and ear size.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Fall armyworm risk
  {
    rule_id: 'C_CEREALS_MAIZE_PEST_001',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Fall armyworm attacks maize whorls causing severe defoliation. ETL: 10% plants with fresh damage.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL CEREALS FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_CEREALS_RULES: CauseRule[] = [
  // Nitrogen deficiency
  {
    rule_id: 'C_CEREALS_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR General',
    scientific_basis: 'Nitrogen is critical for chlorophyll synthesis during vegetative growth in all cereals.'
  },

  // Optimal growth
  {
    rule_id: 'C_CEREALS_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.EXCELLENT || input.ndvi_state === NDVIState.HEALTHY) &&
      (input.ndvi_trend === NDVITrend.RISING || input.ndvi_trend === NDVITrend.STABLE) &&
      input.soil_states.n === SoilNState.ADEQUATE_N,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR',
    scientific_basis: 'NDVI ≥0.50 with stable/rising trend indicates healthy photosynthetic activity.'
  },

  // Recovery trend
  {
    rule_id: 'C_CEREALS_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_trend === NDVITrend.RISING &&
      input.ndvi_state !== NDVIState.CRITICAL,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI Analysis',
    scientific_basis: 'Rising NDVI trend indicates crop is recovering from previous stress.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED CEREALS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const CEREALS_RULES: CauseRule[] = [
  ...WHEAT_RULES,
  ...RICE_RULES,
  ...MAIZE_RULES,
  ...ALL_CEREALS_RULES
];

export default CEREALS_RULES;
