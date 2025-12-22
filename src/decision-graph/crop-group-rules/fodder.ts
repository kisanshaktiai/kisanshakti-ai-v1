/**
 * FODDER CROP GROUP RULES
 * Crops: Berseem, Lucerne, Napier, Oats (fodder), Maize (fodder)
 * Total: 15+ rules
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
// BERSEEM RULES
// ═══════════════════════════════════════════════════════════════════════════

export const BERSEEM_RULES: CauseRule[] = [
  // Root rot
  {
    rule_id: 'C_FODDER_BERSEEM_DISEASE_001',
    category: 'disease',
    crop_code: 'berseem',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IGFRI Jhansi',
    scientific_basis: 'Berseem is susceptible to root rot in waterlogged conditions.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },

  // Cutting schedule water
  {
    rule_id: 'C_FODDER_BERSEEM_WATER_001',
    category: 'water',
    crop_code: 'berseem',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Irrigate 7-10 days before each cutting for maximum green fodder yield.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// LUCERNE (ALFALFA) RULES
// ═══════════════════════════════════════════════════════════════════════════

export const LUCERNE_RULES: CauseRule[] = [
  // Aphid risk
  {
    rule_id: 'C_FODDER_LUCERNE_PEST_001',
    category: 'pest',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Lucerne aphid causes yellowing and stunting. Active in dry weather.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },

  // Downy mildew
  {
    rule_id: 'C_FODDER_LUCERNE_DISEASE_001',
    category: 'disease',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Downy mildew causes white patches on leaves in humid weather.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// NAPIER GRASS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const NAPIER_RULES: CauseRule[] = [
  // Nitrogen for regrowth
  {
    rule_id: 'C_FODDER_NAPIER_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Apply nitrogen after each cutting for good regrowth.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },

  // Water after cutting
  {
    rule_id: 'C_FODDER_NAPIER_WATER_001',
    category: 'water',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Napier requires frequent irrigation for multiple cuttings.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL FODDER FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FODDER_RULES: CauseRule[] = [
  // Nitrogen for green fodder
  {
    rule_id: 'C_FODDER_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_FODDER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Nitrogen is critical for green fodder yield in all fodder crops.'
  },

  // Optimal growth
  {
    rule_id: 'C_FODDER_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_FODDER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.EXCELLENT &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Excellent NDVI indicates high green fodder potential.'
  },

  // Recovery after cutting
  {
    rule_id: 'C_FODDER_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_FODDER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.ndvi_trend === NDVITrend.RISING,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI',
    scientific_basis: 'Rising NDVI after cutting indicates good regrowth.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FODDER RULES
// ═══════════════════════════════════════════════════════════════════════════

export const FODDER_RULES: CauseRule[] = [
  ...BERSEEM_RULES,
  ...LUCERNE_RULES,
  ...NAPIER_RULES,
  ...ALL_FODDER_RULES
];

export default FODDER_RULES;
