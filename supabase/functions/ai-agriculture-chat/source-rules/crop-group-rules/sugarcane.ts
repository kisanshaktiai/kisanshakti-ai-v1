/**
 * SUGARCANE CROP GROUP RULES
 * Total: 30+ rules
 * Source: ICAR-SBI Coimbatore (Sugarcane Breeding Institute)
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
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE RULES
// Source: ICAR-SBI Coimbatore, ICAR-IISR Lucknow
// ═══════════════════════════════════════════════════════════════════════════

export const SUGARCANE_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PEST RULES (8+ rules)
  // ─────────────────────────────────────────────────────────────────────────

  // C_SUGAR_PEST_001: Early Shoot Borer
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
    priority: 9,
    scientific_source: 'ICAR-SBI Coimbatore',
    scientific_basis: 'Chilo infuscatellus causes dead hearts in young cane (up to 3 months). ETL: 10% dead hearts. Peak during March-May in tropical zones.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_002: Top Borer
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
    scientific_basis: 'Scirpophaga excerptalis causes bunchy top and dead heart during grand growth. Peak during monsoon.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_003: Internode Borer
  {
    rule_id: 'C_SUGAR_PEST_003',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 120 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Chilo sacchariphagus indicus bores into internodes creating tunnels. Reduces sucrose recovery.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_004: Pyrilla (Sugarcane Leafhopper)
  {
    rule_id: 'C_SUGAR_PEST_004',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.JASSID_RISK,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Pyrilla perpusilla sucks sap and excretes honeydew causing sooty mold. ETL: 5 nymphs/leaf. Favored by excess nitrogen.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_005: White Grub
  {
    rule_id: 'C_SUGAR_PEST_005',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.moisture === SoilMoistureState.OPTIMAL &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.ROOT_GRUB_RISK,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Holotrichia serrata larvae feed on roots causing yellowing and drying of clumps in patches.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_006: Woolly Aphid
  {
    rule_id: 'C_SUGAR_PEST_006',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Ceratovacuna lanigera causes white woolly colonies on leaves. Reduces photosynthesis.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_007: Scale Insect
  {
    rule_id: 'C_SUGAR_PEST_007',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 200 &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Melanaspis glomerata forms scales on internodes reducing juice quality.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_PEST_008: Termites
  {
    rule_id: 'C_SUGAR_PEST_008',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.days_after_sowing <= 90,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Odontotermes obesus attacks setts and roots in dry conditions causing patchy germination.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RULES (8+ rules)
  // ─────────────────────────────────────────────────────────────────────────

  // C_SUGAR_DISEASE_001: Red Rot
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
    priority: 10,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Colletotrichum falcatum is most destructive fungal disease. Causes reddening of internal tissues with white patches. Spreads through infected setts.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_DISEASE_002: Wilt
  {
    rule_id: 'C_SUGAR_DISEASE_002',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 180 &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Fusarium sacchari causes wilting during maturity. Internal pith shows pink discoloration.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_DISEASE_003: Smut
  {
    rule_id: 'C_SUGAR_DISEASE_003',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Sporisorium scitamineum produces whip-like structure from growing point. Ratoon crops more susceptible.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_DISEASE_004: Grassy Shoot Disease
  {
    rule_id: 'C_SUGAR_DISEASE_004',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Phytoplasma causes excessive tillering with grassy appearance. Transmitted by leafhopper.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_DISEASE_005: Yellow Leaf Disease
  {
    rule_id: 'C_SUGAR_DISEASE_005',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Sugarcane yellow leaf virus causes midrib yellowing. Transmitted by aphids.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_DISEASE_006: Rust
  {
    rule_id: 'C_SUGAR_DISEASE_006',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.RUST_RISK,
    priority: 6,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Puccinia melanocephala causes brown rust pustules on leaves.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_DISEASE_007: Pokkah Boeng
  {
    rule_id: 'C_SUGAR_DISEASE_007',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 6,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Fusarium moniliforme causes malformed spindles and chlorotic young leaves.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WATER STRESS RULES (5+ rules)
  // ─────────────────────────────────────────────────────────────────────────

  // C_SUGAR_WATER_001: Germination Phase
  {
    rule_id: 'C_SUGAR_WATER_001',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.crop_stage === CropStage.GERMINATION &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Adequate moisture during germination (0-45 DAP) ensures good bud sprouting. Irrigate every 7 days.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_WATER_002: Tillering Phase
  {
    rule_id: 'C_SUGAR_WATER_002',
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
    scientific_basis: 'Tillering phase (45-120 DAP) requires adequate moisture for tiller production. 50% of total tillers form during this phase.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_WATER_003: Grand Growth Critical
  {
    rule_id: 'C_SUGAR_WATER_003',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.days_after_sowing >= 120 && input.days_after_sowing <= 270 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Grand growth phase (120-270 DAP) has maximum water demand. Contributes 70% of final cane weight. Stress reduces cane yield by 40%.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_WATER_004: Maturity Phase - Reduce Irrigation
  {
    rule_id: 'C_SUGAR_WATER_004',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.crop_stage === CropStage.MATURITY &&
      input.soil_states.moisture === SoilMoistureState.OPTIMAL,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 5,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Reduce irrigation during maturity (last 6-8 weeks) to enhance sucrose accumulation.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_WATER_005: Waterlogging
  {
    rule_id: 'C_SUGAR_WATER_005',
    category: 'water',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 8,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Waterlogging reduces germination, promotes red rot, and causes root death. Drain within 48 hours.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT RULES (5+ rules)
  // ─────────────────────────────────────────────────────────────────────────

  // C_SUGAR_NUTRIENT_001: Nitrogen for Tillering
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
    scientific_basis: 'Nitrogen is critical during tillering for tiller production and cane yield. Apply 150-200 kg N/ha in 3 splits.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_NUTRIENT_002: Potassium for Sucrose
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
    priority: 9,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Potassium is critical for sucrose accumulation during maturity phase. Apply 60-80 kg K2O/ha.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_NUTRIENT_003: Phosphorus for Root
  {
    rule_id: 'C_SUGAR_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.p === SoilPState.LOW_P &&
      input.days_after_sowing <= 90,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Phosphorus promotes root development and early vigor. Apply full dose at planting.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // C_SUGAR_NUTRIENT_004: Excess Nitrogen Warning
  {
    rule_id: 'C_SUGAR_NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.days_after_sowing >= 200,
    cause: Cause.EXCESS_NITROGEN,
    priority: 7,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Excess nitrogen during maturity delays ripening and reduces sucrose. Attracts pests.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTHY RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_SUGAR_HEALTHY_001: Optimal Growth
  {
    rule_id: 'C_SUGAR_HEALTHY_001',
    category: 'healthy',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      (input.ndvi_state === NDVIState.EXCELLENT || input.ndvi_state === NDVIState.HEALTHY) &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR-SBI',
    scientific_basis: 'Excellent NDVI during grand growth indicates high yield potential. Target >0.6 NDVI.'
  },

  // C_SUGAR_HEALTHY_002: Recovery Trend
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

  // C_SUGAR_HEALTHY_003: Maturity Ready
  {
    rule_id: 'C_SUGAR_HEALTHY_003',
    category: 'healthy',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.crop_stage === CropStage.MATURITY &&
      input.days_after_sowing >= 300,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Cane is ready for harvest at 10-12 months when Brix reaches 18-20%.'
  },
];

export default SUGARCANE_RULES;
