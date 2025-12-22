/**
 * SPICES CROP GROUP RULES
 * Crops: Turmeric, Ginger, Chilli, Cumin, Coriander
 * Total: 20+ rules
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
// TURMERIC RULES
// ═══════════════════════════════════════════════════════════════════════════

export const TURMERIC_RULES: CauseRule[] = [
  // Rhizome rot
  {
    rule_id: 'C_SPICE_TURMERIC_DISEASE_001',
    category: 'disease',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IISR Calicut',
    scientific_basis: 'Pythium and Fusarium rhizome rot spreads in waterlogged conditions.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // Shoot borer
  {
    rule_id: 'C_SPICE_TURMERIC_PEST_001',
    category: 'pest',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Shoot borer (Conogethes punctiferalis) bores into pseudostem.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GINGER RULES
// ═══════════════════════════════════════════════════════════════════════════

export const GINGER_RULES: CauseRule[] = [
  // Soft rot - bacterial
  {
    rule_id: 'C_SPICE_GINGER_DISEASE_001',
    category: 'disease',
    crop_code: 'ginger',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.ROOT_ROT_RISK,
    priority: 10,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Bacterial soft rot (Ralstonia) is most destructive disease. Spreads rapidly in wet conditions.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // Rhizome fly
  {
    rule_id: 'C_SPICE_GINGER_PEST_001',
    category: 'pest',
    crop_code: 'ginger',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Rhizome fly maggots bore into rhizomes during monsoon.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CHILLI RULES
// ═══════════════════════════════════════════════════════════════════════════

export const CHILLI_RULES: CauseRule[] = [
  // Anthracnose
  {
    rule_id: 'C_SPICE_CHILLI_DISEASE_001',
    category: 'disease',
    crop_code: 'chilli',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Colletotrichum causes fruit rot in humid conditions.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // Thrips
  {
    rule_id: 'C_SPICE_CHILLI_PEST_001',
    category: 'pest',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.THRIPS_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Thrips cause leaf curl and transmit viruses. Active in dry weather.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // Mite - broad mite
  {
    rule_id: 'C_SPICE_CHILLI_PEST_002',
    category: 'pest',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.MITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Broad mite causes leaf curling and stunting. Hot dry weather favors buildup.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL SPICES FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_SPICES_RULES: CauseRule[] = [
  // Rhizome/root rot risk in wet conditions
  {
    rule_id: 'C_SPICE_ALL_DISEASE_001',
    category: 'disease',
    crop_code: 'ALL_SPICES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Rhizome spices are highly susceptible to rot in waterlogged conditions.'
  },

  // Optimal growth
  {
    rule_id: 'C_SPICE_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_SPICES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Healthy NDVI indicates good crop establishment.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED SPICES RULES
// ═══════════════════════════════════════════════════════════════════════════

export const SPICES_RULES: CauseRule[] = [
  ...TURMERIC_RULES,
  ...GINGER_RULES,
  ...CHILLI_RULES,
  ...ALL_SPICES_RULES
];

export default SPICES_RULES;
