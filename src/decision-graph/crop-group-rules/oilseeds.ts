/**
 * OILSEEDS CROP GROUP RULES
 * Crops: Soybean, Groundnut, Mustard, Sunflower, Sesame
 * Total: 45+ rules
 * Sources: ICAR-IISR Indore, ICAR-DGR Junagadh, ICAR-DRMR Bharatpur
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  SoilPState,
  SoilKState,
  SoilMoistureState,
  WeatherState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// SOYBEAN RULES (12 rules)
// Reference: ICAR-IISR Indore Package of Practices 2024
// ═══════════════════════════════════════════════════════════════════════════

export const SOYBEAN_RULES: CauseRule[] = [
  // Girdle beetle - major pest
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
    scientific_basis: 'Girdle beetle (Obereopsis brevis) girdles stem causing plant death above girdle. ICAR ETL: 5% girdled plants.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Stem fly
  {
    rule_id: 'C_OIL_SOYBEAN_PEST_002',
    category: 'pest',
    crop_code: 'soybean',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 40 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Stem fly (Melanagromyza sojae) maggots tunnel inside stem. Common in vegetative stage.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Semilooper/defoliators
  {
    rule_id: 'C_OIL_SOYBEAN_PEST_003',
    category: 'pest',
    crop_code: 'soybean',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Semilooper and tobacco caterpillar defoliate soybean. ETL: 25% defoliation or 4 larvae/meter row.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Yellow mosaic virus
  {
    rule_id: 'C_OIL_SOYBEAN_DISEASE_001',
    category: 'disease',
    crop_code: 'soybean',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WHITEFLY_RISK,
    priority: 9,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Yellow Mosaic Virus (YMV) transmitted by whitefly. Causes yellow patches. Control vector to prevent disease.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Charcoal rot
  {
    rule_id: 'C_OIL_SOYBEAN_DISEASE_002',
    category: 'disease',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Charcoal rot (Macrophomina phaseolina) occurs under drought + heat stress. Causes premature drying.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Rhizoctonia root rot
  {
    rule_id: 'C_OIL_SOYBEAN_DISEASE_003',
    category: 'disease',
    crop_code: 'soybean',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Root rot complex (Rhizoctonia, Fusarium) in waterlogged soils. Causes seedling mortality and poor stand.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Flowering irrigation - critical
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
    scientific_basis: 'Flowering and pod filling are critical for soybean. Stress causes flower drop and empty pods.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Pod filling water
  {
    rule_id: 'C_OIL_SOYBEAN_WATER_002',
    category: 'water',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.days_after_sowing >= 60 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Pod filling (60-80 DAS) needs adequate moisture. Stress reduces seed size and oil content.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Phosphorus for nodulation
  {
    rule_id: 'C_OIL_SOYBEAN_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'soybean',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Phosphorus is critical for nodulation and nitrogen fixation. Apply 60-80 kg P2O5/ha at sowing.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },

  // Sulphur for oil
  {
    rule_id: 'C_OIL_SOYBEAN_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Sulphur is critical for protein and oil synthesis in soybean. Apply 20-40 kg S/ha.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GROUNDNUT RULES (12 rules)
// Reference: ICAR-DGR Junagadh
// ═══════════════════════════════════════════════════════════════════════════

export const GROUNDNUT_RULES: CauseRule[] = [
  // Tikka disease (Early leaf spot)
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
    scientific_basis: 'Tikka disease (Cercospora arachidicola) causes brown spots on leaves. Favored by humid weather (25-30°C, >80% RH).',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Late leaf spot
  {
    rule_id: 'C_OIL_GROUNDNUT_DISEASE_002',
    category: 'disease',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 60,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Late leaf spot (Phaeoisariopsis personata) appears from pod development. Causes severe defoliation.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Stem rot (collar rot)
  {
    rule_id: 'C_OIL_GROUNDNUT_DISEASE_003',
    category: 'disease',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Stem rot (Sclerotium rolfsii) causes sudden wilting. White mycelium at collar. Favored by wet conditions.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Rust
  {
    rule_id: 'C_OIL_GROUNDNUT_DISEASE_004',
    category: 'disease',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WHEAT_RUST_RISK,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Groundnut rust (Puccinia arachidis) spreads rapidly in humid weather. Causes orange pustules on leaves.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Aphid (vector)
  {
    rule_id: 'C_OIL_GROUNDNUT_PEST_001',
    category: 'pest',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Aphids transmit Groundnut Bud Necrosis Virus (GBNV). Control vector early.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Thrips (vector)
  {
    rule_id: 'C_OIL_GROUNDNUT_PEST_002',
    category: 'pest',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.days_after_sowing <= 40,
    cause: Cause.THRIPS_RISK,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Thrips transmit Peanut Bud Necrosis Disease (PBND). Most critical in first 40 days. ETL: 10 thrips/plant.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Pegging stage irrigation - critical
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
    scientific_basis: 'Pegging (35-50 DAS) is most water-sensitive. Peg entry needs soft moist soil. Stress causes peg abortion.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Pod development water
  {
    rule_id: 'C_OIL_GROUNDNUT_WATER_002',
    category: 'water',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.days_after_sowing >= 50 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Pod development (50-80 DAS) needs consistent moisture for kernel filling.',
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
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Calcium is critical for kernel development. Apply gypsum 250-500 kg/ha at pegging.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // Phosphorus deficiency
  {
    rule_id: 'C_OIL_GROUNDNUT_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Phosphorus supports nodulation and early pod development.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MUSTARD RULES (12 rules)
// Reference: ICAR-DRMR Bharatpur
// ═══════════════════════════════════════════════════════════════════════════

export const MUSTARD_RULES: CauseRule[] = [
  // Aphid - most destructive pest
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
    priority: 10,
    scientific_source: 'ICAR-DRMR Bharatpur',
    scientific_basis: 'Mustard aphid (Lipaphis erysimi) is most destructive pest. ICAR ETL: 50 aphids/plant or 25-30% infestation. Can cause 50-90% yield loss.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Painted bug
  {
    rule_id: 'C_OIL_MUSTARD_PEST_002',
    category: 'pest',
    crop_code: 'mustard',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.days_after_sowing <= 30 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Painted bug (Bagrada hilaris) sucks sap from seedlings. Critical in early stage.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Sawfly
  {
    rule_id: 'C_OIL_MUSTARD_PEST_003',
    category: 'pest',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 6,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Mustard sawfly larvae feed on leaves from margins. Common in humid weather.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // White rust (Albugo)
  {
    rule_id: 'C_OIL_MUSTARD_DISEASE_001',
    category: 'disease',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 8,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'White rust (Albugo candida) spreads in cool humid weather (10-20°C, >80% RH). Causes staghead deformity.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Alternaria blight
  {
    rule_id: 'C_OIL_MUSTARD_DISEASE_002',
    category: 'disease',
    crop_code: 'mustard',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Alternaria blight causes dark concentric spots on leaves, stem, and siliqua. Favored by humid weather.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Sclerotinia rot
  {
    rule_id: 'C_OIL_MUSTARD_DISEASE_003',
    category: 'disease',
    crop_code: 'mustard',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_state === NDVIState.EXCELLENT,
    cause: Cause.ROOT_ROT_RISK,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Sclerotinia stem rot favored by dense canopy and high humidity. Causes stem bleaching.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Frost at flowering
  {
    rule_id: 'C_OIL_MUSTARD_COLD_001',
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
    scientific_basis: 'Frost during flowering causes flower drop and siliqua damage. Light irrigation before frost provides protection.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Pre-flowering irrigation
  {
    rule_id: 'C_OIL_MUSTARD_WATER_001',
    category: 'water',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.days_after_sowing >= 30 && input.days_after_sowing <= 40 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'First irrigation at 30-35 DAS (pre-flowering) is critical for mustard.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Pod development water
  {
    rule_id: 'C_OIL_MUSTARD_WATER_002',
    category: 'water',
    crop_code: 'mustard',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.days_after_sowing >= 55 && input.days_after_sowing <= 70 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Second irrigation at siliqua development (55-65 DAS) supports seed filling.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // Sulphur for oil content
  {
    rule_id: 'C_OIL_MUSTARD_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Sulphur is critical for oil content and quality in mustard. Apply 40 kg S/ha.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SUNFLOWER RULES (6 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const SUNFLOWER_RULES: CauseRule[] = [
  // Head rot (Rhizopus)
  {
    rule_id: 'C_OIL_SUNFLOWER_DISEASE_001',
    category: 'disease',
    crop_code: 'sunflower',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sunflower' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.COTTON_BOLL_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIOR',
    scientific_basis: 'Head rot (Rhizopus) causes soft rotting of heads. Favored by rain during flowering.',
    icar_package: 'ICAR-IIOR Sunflower PoP 2024'
  },

  // Alternaria leaf spot
  {
    rule_id: 'C_OIL_SUNFLOWER_DISEASE_002',
    category: 'disease',
    crop_code: 'sunflower',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sunflower' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIOR',
    scientific_basis: 'Alternaria causes dark spots on leaves leading to defoliation.',
    icar_package: 'ICAR-IIOR Sunflower PoP 2024'
  },

  // Bird damage
  {
    rule_id: 'C_OIL_SUNFLOWER_PEST_001',
    category: 'pest',
    crop_code: 'sunflower',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'sunflower' &&
      input.crop_stage === CropStage.MATURITY,
    cause: Cause.FRUIT_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIOR',
    scientific_basis: 'Birds (parrots, crows) cause severe damage to maturing heads. Use bird scarers and reflective tape.',
    icar_package: 'ICAR-IIOR Sunflower PoP 2024'
  },

  // Flowering irrigation
  {
    rule_id: 'C_OIL_SUNFLOWER_WATER_001',
    category: 'water',
    crop_code: 'sunflower',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sunflower' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIOR',
    scientific_basis: 'Flowering is most water-sensitive stage in sunflower. Stress reduces seed set.',
    icar_package: 'ICAR-IIOR Sunflower PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL OILSEEDS FALLBACK RULES (8 rules)
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
    scientific_basis: 'Phosphorus is critical for oil synthesis in all oilseed crops. Apply full P at sowing.'
  },

  // Sulphur deficiency
  {
    rule_id: 'C_OIL_ALL_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.soil_states.n === SoilNState.ADEQUATE_N,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR',
    scientific_basis: 'Sulphur is second most important nutrient for oilseeds after N. Critical for oil synthesis.'
  },

  // Waterlogging sensitivity
  {
    rule_id: 'C_OIL_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 8,
    scientific_source: 'ICAR',
    scientific_basis: 'Most oilseeds are sensitive to waterlogging. Causes root rot and poor nodulation.'
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

  // Recovery trend
  {
    rule_id: 'C_OIL_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_trend === NDVITrend.RISING,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI',
    scientific_basis: 'Rising NDVI indicates recovery from stress.'
  },

  // Critical decline
  {
    rule_id: 'C_OIL_ALL_CRITICAL_001',
    category: 'critical',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.CRITICAL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    priority: 10,
    scientific_source: 'NASA + ICAR',
    scientific_basis: 'NDVI <0.20 with declining trend indicates severe stress requiring immediate intervention.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL PERIOD WATER STRESS (CPWS) RULES - OILSEEDS
// ═══════════════════════════════════════════════════════════════════════════

export const OILSEEDS_CPWS_RULES: CauseRule[] = [
  {
    rule_id: 'CPWS_SOYBEAN_001',
    category: 'water',
    crop_code: 'soybean',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'soybean' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 60 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_SOYBEAN_FLOWERING,
    priority: 10,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Flowering-pod formation (40-60 DAS) critical 20-day window. Water stress causes flower drop and pod abortion.',
    icar_package: 'ICAR-IISR Soybean PoP 2024'
  },
  {
    rule_id: 'CPWS_GROUNDNUT_001',
    category: 'water',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 60 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_GROUNDNUT_PEGGING,
    priority: 10,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Pegging stage (40-60 DAS) UNIQUE critical period. Pegs must penetrate soil to form pods. DRY HARD soil = NO pods.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED OILSEEDS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const OILSEEDS_RULES: CauseRule[] = [
  ...SOYBEAN_RULES,
  ...GROUNDNUT_RULES,
  ...MUSTARD_RULES,
  ...SUNFLOWER_RULES,
  ...OILSEEDS_CPWS_RULES,
  ...ALL_OILSEEDS_RULES
];

export default OILSEEDS_RULES;
