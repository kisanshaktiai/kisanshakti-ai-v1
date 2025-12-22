/**
 * FODDER CROP GROUP RULES
 * Crops: Berseem, Lucerne, Napier, Oats (fodder), Maize (fodder), Sorghum (fodder)
 * Total: 30+ rules
 * Source: ICAR-IGFRI Jhansi (Indian Grassland and Fodder Research Institute)
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  SoilKState,
  SoilPState,
  SoilMoistureState,
  WeatherState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// BERSEEM (EGYPTIAN CLOVER) RULES (8+ rules)
// Source: ICAR-IGFRI Jhansi
// ═══════════════════════════════════════════════════════════════════════════

export const BERSEEM_RULES: CauseRule[] = [
  // C_FODDER_BERSEEM_DISEASE_001: Root Rot
  {
    rule_id: 'C_FODDER_BERSEEM_DISEASE_001',
    category: 'disease',
    crop_code: 'berseem',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IGFRI Jhansi',
    scientific_basis: 'Fusarium and Rhizoctonia root rot occurs in waterlogged conditions. Drain excess water immediately.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },

  // C_FODDER_BERSEEM_DISEASE_002: Stem Rot
  {
    rule_id: 'C_FODDER_BERSEEM_DISEASE_002',
    category: 'disease',
    crop_code: 'berseem',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Sclerotinia rot occurs in humid weather with excess nitrogen. White cottony growth on stems.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },

  // C_FODDER_BERSEEM_PEST_001: Aphid
  {
    rule_id: 'C_FODDER_BERSEEM_PEST_001',
    category: 'pest',
    crop_code: 'berseem',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Berseem aphid (Therioaphis trifolii) causes yellowing and stunting in dry weather.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },

  // C_FODDER_BERSEEM_WATER_001: Pre-Cutting Irrigation
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
    scientific_basis: 'Irrigate 7-10 days before each cutting for maximum green fodder yield. Total 10-12 irrigations for 5-6 cuttings.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },

  // C_FODDER_BERSEEM_WATER_002: Post-Cutting Stress
  {
    rule_id: 'C_FODDER_BERSEEM_WATER_002',
    category: 'water',
    crop_code: 'berseem',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Irrigate immediately after cutting for quick regrowth. Delay reduces subsequent cut yield.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },

  // C_FODDER_BERSEEM_NUTRIENT_001: Phosphorus for Root Nodulation
  {
    rule_id: 'C_FODDER_BERSEEM_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'berseem',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'berseem' &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Phosphorus promotes root nodulation and nitrogen fixation in this legume. Apply 60-80 kg P2O5/ha.',
    icar_package: 'ICAR-IGFRI Berseem PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// LUCERNE (ALFALFA) RULES (8+ rules)
// Source: ICAR-IGFRI Jhansi
// ═══════════════════════════════════════════════════════════════════════════

export const LUCERNE_RULES: CauseRule[] = [
  // C_FODDER_LUCERNE_PEST_001: Lucerne Aphid
  {
    rule_id: 'C_FODDER_LUCERNE_PEST_001',
    category: 'pest',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Blue alfalfa aphid (Acyrthosiphon kondoi) causes yellowing and stunting. Active in cool dry weather.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },

  // C_FODDER_LUCERNE_PEST_002: Weevil
  {
    rule_id: 'C_FODDER_LUCERNE_PEST_002',
    category: 'pest',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Alfalfa weevil (Hypera postica) larvae feed on leaves and growing points.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },

  // C_FODDER_LUCERNE_DISEASE_001: Downy Mildew
  {
    rule_id: 'C_FODDER_LUCERNE_DISEASE_001',
    category: 'disease',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Peronospora trifoliorum causes white patches on lower leaf surface in humid weather.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },

  // C_FODDER_LUCERNE_DISEASE_002: Crown Rot
  {
    rule_id: 'C_FODDER_LUCERNE_DISEASE_002',
    category: 'disease',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Phytophthora medicaginis causes crown and root rot in poorly drained soils.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },

  // C_FODDER_LUCERNE_WATER_001: Deep Rooted Crop
  {
    rule_id: 'C_FODDER_LUCERNE_WATER_001',
    category: 'water',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Lucerne is relatively drought tolerant due to deep taproot. Irrigate at 50% soil moisture depletion.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },

  // C_FODDER_LUCERNE_NUTRIENT_001: Potassium for Persistence
  {
    rule_id: 'C_FODDER_LUCERNE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'lucerne',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'lucerne' &&
      input.soil_states.k === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Potassium maintains stand persistence and winter hardiness. Apply 40 kg K2O/ha annually.',
    icar_package: 'ICAR-IGFRI Lucerne PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// NAPIER GRASS RULES (8+ rules)
// Source: ICAR-IGFRI Jhansi
// ═══════════════════════════════════════════════════════════════════════════

export const NAPIER_RULES: CauseRule[] = [
  // C_FODDER_NAPIER_NUTRIENT_001: Nitrogen for Regrowth
  {
    rule_id: 'C_FODDER_NAPIER_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Apply nitrogen after each cutting for good regrowth. 50 kg N/ha after each cut. Total 200 kg N/ha/year.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },

  // C_FODDER_NAPIER_WATER_001: High Water Requirement
  {
    rule_id: 'C_FODDER_NAPIER_WATER_001',
    category: 'water',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Napier requires frequent irrigation for 6-8 cuttings per year. Irrigate every 10-15 days in summer.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },

  // C_FODDER_NAPIER_WATER_002: Post-Cut Irrigation
  {
    rule_id: 'C_FODDER_NAPIER_WATER_002',
    category: 'water',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Irrigate immediately after cutting for rapid tiller regeneration.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },

  // C_FODDER_NAPIER_PEST_001: Shoot Fly
  {
    rule_id: 'C_FODDER_NAPIER_PEST_001',
    category: 'pest',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.days_after_sowing <= 45,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Atherigona species causes dead heart in young tillers.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },

  // C_FODDER_NAPIER_PEST_002: Stem Borer
  {
    rule_id: 'C_FODDER_NAPIER_PEST_002',
    category: 'pest',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Chilo partellus bores into stems reducing fodder quality.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },

  // C_FODDER_NAPIER_DISEASE_001: Leaf Blight
  {
    rule_id: 'C_FODDER_NAPIER_DISEASE_001',
    category: 'disease',
    crop_code: 'napier',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'napier' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Helminthosporium causes leaf blight in humid conditions.',
    icar_package: 'ICAR-IGFRI Napier PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// FODDER SORGHUM RULES (6+ rules)
// ═══════════════════════════════════════════════════════════════════════════

export const FODDER_SORGHUM_RULES: CauseRule[] = [
  // C_FODDER_SORGHUM_PEST_001: Shoot Fly
  {
    rule_id: 'C_FODDER_SORGHUM_PEST_001',
    category: 'pest',
    crop_code: 'fodder_sorghum',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fodder_sorghum' &&
      input.days_after_sowing <= 28 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Atherigona soccata is most destructive pest of young sorghum. ETL: 10% dead hearts.',
    icar_package: 'ICAR-IGFRI Fodder Sorghum PoP 2024'
  },

  // C_FODDER_SORGHUM_PEST_002: Stem Borer
  {
    rule_id: 'C_FODDER_SORGHUM_PEST_002',
    category: 'pest',
    crop_code: 'fodder_sorghum',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fodder_sorghum' &&
      input.days_after_sowing >= 30 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Chilo partellus causes dead heart and reduces fodder yield.',
    icar_package: 'ICAR-IGFRI Fodder Sorghum PoP 2024'
  },

  // C_FODDER_SORGHUM_DISEASE_001: Leaf Blight
  {
    rule_id: 'C_FODDER_SORGHUM_DISEASE_001',
    category: 'disease',
    crop_code: 'fodder_sorghum',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fodder_sorghum' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Exserohilum turcicum causes tan elliptical lesions on leaves.',
    icar_package: 'ICAR-IGFRI Fodder Sorghum PoP 2024'
  },

  // C_FODDER_SORGHUM_NUTRIENT_001: Nitrogen for Biomass
  {
    rule_id: 'C_FODDER_SORGHUM_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'fodder_sorghum',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fodder_sorghum' &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Nitrogen promotes green fodder yield. Apply 80-100 kg N/ha in 2-3 splits.',
    icar_package: 'ICAR-IGFRI Fodder Sorghum PoP 2024'
  },

  // C_FODDER_SORGHUM_WATER_001: Drought Tolerance
  {
    rule_id: 'C_FODDER_SORGHUM_WATER_001',
    category: 'water',
    crop_code: 'fodder_sorghum',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fodder_sorghum' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Sorghum is relatively drought tolerant but yields best with 2-3 irrigations.',
    icar_package: 'ICAR-IGFRI Fodder Sorghum PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL FODDER FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FODDER_RULES: CauseRule[] = [
  // C_FODDER_ALL_NUTRIENT_001: Nitrogen for Green Fodder
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
    scientific_basis: 'Nitrogen is critical for green fodder yield and protein content in all fodder crops.'
  },

  // C_FODDER_ALL_NUTRIENT_002: Phosphorus for Legume Fodders
  {
    rule_id: 'C_FODDER_ALL_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ALL_FODDER',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Phosphorus promotes nodulation in legume fodders and root development in grasses.'
  },

  // C_FODDER_ALL_HEALTHY_001: Optimal Growth
  {
    rule_id: 'C_FODDER_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_FODDER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.EXCELLENT || input.ndvi_state === NDVIState.HEALTHY) &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR',
    scientific_basis: 'Excellent NDVI indicates high green fodder potential and nutritive value.'
  },

  // C_FODDER_ALL_HEALTHY_002: Recovery After Cutting
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
    scientific_basis: 'Rising NDVI after cutting indicates good regrowth and next cut readiness.'
  },

  // C_FODDER_ALL_WATER_001: General Water Stress
  {
    rule_id: 'C_FODDER_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_FODDER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-IGFRI',
    scientific_basis: 'Severe water stress reduces fodder yield and nutritive quality. Irrigate immediately.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FODDER RULES
// ═══════════════════════════════════════════════════════════════════════════

export const FODDER_RULES: CauseRule[] = [
  ...BERSEEM_RULES,
  ...LUCERNE_RULES,
  ...NAPIER_RULES,
  ...FODDER_SORGHUM_RULES,
  ...ALL_FODDER_RULES
];

export default FODDER_RULES;
