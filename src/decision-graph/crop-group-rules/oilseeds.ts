/**
 * OILSEEDS CROP GROUP RULES
 * Crops: Soybean, Groundnut, Mustard, Sunflower, Sesame
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
// SOYBEAN RULES
// ═══════════════════════════════════════════════════════════════════════════

export const SOYBEAN_RULES: CauseRule[] = [
  // Girdle beetle risk
  {
    rule_id: 'C_OIL_SOYBEAN_PEST_001',
    category: 'pest',
    crop_code: 'soybean',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR Indore',
    scientific_basis: 'Girdle beetle girdles stem causing plant death. ETL: 5% girdled plants.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Yellow mosaic risk
  {
    rule_id: 'C_OIL_SOYBEAN_DISEASE_001',
    category: 'disease',
    crop_code: 'soybean',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WHITEFLY_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Whitefly transmits Yellow Mosaic Virus. Control vector to prevent disease.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Flowering irrigation
  {
    rule_id: 'C_OIL_SOYBEAN_WATER_001',
    category: 'water',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Flowering and pod filling are critical for soybean. Stress causes flower drop.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GROUNDNUT RULES
// ═══════════════════════════════════════════════════════════════════════════

export const GROUNDNUT_RULES: CauseRule[] = [
  // Tikka disease
  {
    rule_id: 'C_OIL_GROUNDNUT_DISEASE_001',
    category: 'disease',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-DGR Junagadh',
    scientific_basis: 'Tikka disease (Cercospora) causes leaf spots. Favored by humid weather.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Pegging stage irrigation
  {
    rule_id: 'C_OIL_GROUNDNUT_WATER_001',
    category: 'water',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.days_after_sowing >= 35 && input.days_after_sowing <= 50 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Pegging and pod development require adequate soil moisture.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Calcium for pod filling
  {
    rule_id: 'C_OIL_GROUNDNUT_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Phosphorus and calcium are critical for pod development in groundnut.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MUSTARD RULES
// ═══════════════════════════════════════════════════════════════════════════

export const MUSTARD_RULES: CauseRule[] = [
  // Aphid risk - major pest
  {
    rule_id: 'C_OIL_MUSTARD_PEST_001',
    category: 'pest',
    crop_code: 'mustard',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state !== WeatherState.RAIN_ACTIVE,
    cause: Cause.APHID_RISK,
    priority: 9,
    scientific_source: 'ICAR-DRMR Bharatpur',
    scientific_basis: 'Mustard aphid (Lipaphis erysimi) is most destructive pest. ETL: 50 aphids/plant.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // White rust risk
  {
    rule_id: 'C_OIL_MUSTARD_DISEASE_001',
    category: 'disease',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'White rust (Albugo) spreads in cool humid weather.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Frost risk
  {
    rule_id: 'C_OIL_MUSTARD_TEMP_001',
    category: 'temperature',
    crop_code: 'mustard',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.weather_state === WeatherState.FROST_RISK &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FROST_DAMAGE_RISK,
    priority: 9,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Frost during flowering causes flower drop and siliqua damage.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL OILSEEDS FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_OILSEEDS_RULES: CauseRule[] = [
  // Phosphorus for oil content
  {
    rule_id: 'C_OIL_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR Oilseeds',
    scientific_basis: 'Phosphorus is critical for oil synthesis in all oilseed crops.'
  },

  // Optimal growth
  {
    rule_id: 'C_OIL_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR',
    scientific_basis: 'Healthy NDVI indicates good crop establishment.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED OILSEEDS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const OILSEEDS_RULES: CauseRule[] = [
  ...SOYBEAN_RULES,
  ...GROUNDNUT_RULES,
  ...MUSTARD_RULES,
  ...ALL_OILSEEDS_RULES
];

export default OILSEEDS_RULES;
