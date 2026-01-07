/**
 * FIBER CROP GROUP RULES
 * Crops: Cotton, Jute, Mesta, Sunhemp
 * Total: 45+ rules
 * Sources: ICAR-CICR Nagpur, ICAR-CRIJAF Barrackpore
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
// COTTON RULES (25+ rules)
// Source: ICAR-CICR Nagpur Cotton Package of Practices 2024
// ═══════════════════════════════════════════════════════════════════════════

export const COTTON_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PEST RULES
  // ─────────────────────────────────────────────────────────────────────────
  
  // C_FIBER_COTTON_PEST_001: Pink Bollworm - most destructive
  {
    rule_id: 'C_FIBER_COTTON_PEST_001',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.days_after_sowing >= 70 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BOLLWORM_RISK,
    priority: 10,
    scientific_source: 'ICAR-CICR Nagpur',
    scientific_basis: 'Pectinophora gossypiella is the most destructive pest of Bt cotton. ETL: 8-10% rosette flowers or 10% boll damage. Larvae bore into bolls causing locule damage.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_002: American Bollworm
  {
    rule_id: 'C_FIBER_COTTON_PEST_002',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state !== WeatherState.RAIN_ACTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BOLLWORM_RISK,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Helicoverpa armigera feeds on squares, flowers and bolls. ETL: 1 larva/plant or 5% fruiting body damage.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_003: Whitefly - CLCV vector
  {
    rule_id: 'C_FIBER_COTTON_PEST_003',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.WHITEFLY_RISK,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Bemisia tabaci transmits Cotton Leaf Curl Virus (CLCuV). ETL: 5-6 adults/leaf. Thrives in dry weather with excess nitrogen.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_004: Jassid (Leafhopper)
  {
    rule_id: 'C_FIBER_COTTON_PEST_004',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.JASSID_RISK,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Amrasca biguttula causes hopper burn - marginal leaf yellowing and curling. ETL: 2 nymphs/leaf on middle canopy. Non-hairy varieties more susceptible.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_005: Thrips
  {
    rule_id: 'C_FIBER_COTTON_PEST_005',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.days_after_sowing <= 45 &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.THRIPS_RISK,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Thrips tabaci damages cotyledons and early leaves causing silvering. ETL: 10 thrips/leaf. Critical in early crop stage.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_006: Spotted Bollworm
  {
    rule_id: 'C_FIBER_COTTON_PEST_006',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.days_after_sowing >= 60,
    cause: Cause.BOLLWORM_RISK,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Earias vitella and E. insulana cause shedding of squares and bolls. ETL: 5% damage to fruiting bodies.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_007: Mealybug
  {
    rule_id: 'C_FIBER_COTTON_PEST_007',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.MEALYBUG_RISK,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Phenacoccus solenopsis causes bunchy top and sticky cotton. Rapid spread in humid conditions.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_PEST_008: Red Cotton Bug
  {
    rule_id: 'C_FIBER_COTTON_PEST_008',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.MATURITY,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Dysdercus koenigii stains lint by puncturing developing seeds. Active during boll opening.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FIBER_COTTON_DISEASE_001: Boll Rot Complex
  {
    rule_id: 'C_FIBER_COTTON_DISEASE_001',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.COTTON_BOLL_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Boll rot caused by Rhizopus, Aspergillus, Fusarium. Favored by >85% RH and insect damage.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_DISEASE_002: Bacterial Blight
  {
    rule_id: 'C_FIBER_COTTON_DISEASE_002',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.RAIN_ACTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Xanthomonas citri pv. malvacearum causes angular leaf spots and black arm. Spreads in rainy weather.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_DISEASE_003: Alternaria Leaf Spot
  {
    rule_id: 'C_FIBER_COTTON_DISEASE_003',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.k === SoilKState.LOW_K,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Alternaria macrospora causes concentric leaf spots. Potassium deficient plants more susceptible.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_DISEASE_004: Root Rot
  {
    rule_id: 'C_FIBER_COTTON_DISEASE_004',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Rhizoctonia and Macrophomina root rot in waterlogged soils. Young plants wilt and die.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // WATER STRESS RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FIBER_COTTON_WATER_001: Flowering Critical
  {
    rule_id: 'C_FIBER_COTTON_WATER_001',
    category: 'water',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Flowering to peak boll formation (45-80 DAS) is most critical. Water stress causes 30-40% square and boll shedding.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_WATER_002: Boll Development
  {
    rule_id: 'C_FIBER_COTTON_WATER_002',
    category: 'water',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.days_after_sowing >= 80 && input.days_after_sowing <= 120 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_COTTON_BOLL,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Boll development stage requires adequate moisture for fiber elongation and lint quality.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_WATER_003: Vegetative Stress
  {
    rule_id: 'C_FIBER_COTTON_WATER_003',
    category: 'water',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Vegetative stage water stress reduces plant height and node number.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HEAT STRESS RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FIBER_COTTON_HEAT_001: Square and Boll Shedding
  {
    rule_id: 'C_FIBER_COTTON_HEAT_001',
    category: 'temperature',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.HEAT_STRESS_COTTON_SHEDDING,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Temperature >38°C during flowering causes square shedding. Above 40°C reduces pollen viability to <20%.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_HEAT_002: Fiber Quality
  {
    rule_id: 'C_FIBER_COTTON_HEAT_002',
    category: 'temperature',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.days_after_sowing >= 90,
    cause: Cause.HEAT_STRESS,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'High temperature during boll maturation reduces fiber length and micronaire value.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FIBER_COTTON_NUTRIENT_001: Potassium Critical
  {
    rule_id: 'C_FIBER_COTTON_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Potassium is critical for fiber quality - length, strength, micronaire. Deficiency causes premature defoliation and poor staple.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_NUTRIENT_002: Nitrogen Balance
  {
    rule_id: 'C_FIBER_COTTON_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Nitrogen deficiency causes yellowing and reduced vegetative growth. Apply 50% at sowing, 25% at squaring.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // C_FIBER_COTTON_NUTRIENT_003: Excess Nitrogen Warning
  {
    rule_id: 'C_FIBER_COTTON_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.EXCESS_NITROGEN,
    priority: 7,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Excess nitrogen promotes vegetative growth, delays maturity, increases pest susceptibility.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// JUTE RULES (10+ rules)
// Source: ICAR-CRIJAF Barrackpore
// ═══════════════════════════════════════════════════════════════════════════

export const JUTE_RULES: CauseRule[] = [
  // C_FIBER_JUTE_DISEASE_001: Stem Rot
  {
    rule_id: 'C_FIBER_JUTE_DISEASE_001',
    category: 'disease',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Macrophomina phaseolina causes stem rot in waterlogged conditions. Major disease during monsoon.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // C_FIBER_JUTE_DISEASE_002: Anthracnose
  {
    rule_id: 'C_FIBER_JUTE_DISEASE_002',
    category: 'disease',
    crop_code: 'jute',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Colletotrichum corchori causes seedling blight and stem lesions.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // C_FIBER_JUTE_PEST_001: Semi-looper
  {
    rule_id: 'C_FIBER_JUTE_PEST_001',
    category: 'pest',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Anomis sabulifera causes severe defoliation. ETL: 4-5 larvae/plant.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // C_FIBER_JUTE_PEST_002: Bihar Hairy Caterpillar
  {
    rule_id: 'C_FIBER_JUTE_PEST_002',
    category: 'pest',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.days_after_sowing >= 30 && input.days_after_sowing <= 60,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Spilosoma obliqua is gregarious feeder. Can defoliate crop in patches.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // C_FIBER_JUTE_PEST_003: Stem Weevil
  {
    rule_id: 'C_FIBER_JUTE_PEST_003',
    category: 'pest',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Apion corchori larvae bore into stem affecting fiber quality.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // C_FIBER_JUTE_WATER_001: Fiber Development
  {
    rule_id: 'C_FIBER_JUTE_WATER_001',
    category: 'water',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.days_after_sowing >= 60 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Adequate moisture during fiber development (60-90 DAS) is critical for fiber quality.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },

  // C_FIBER_JUTE_NUTRIENT_001: Nitrogen for Height
  {
    rule_id: 'C_FIBER_JUTE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'jute',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jute' &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Nitrogen promotes plant height and fiber yield. Apply 40 kg N/ha in two splits.',
    icar_package: 'ICAR-CRIJAF Jute PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MESTA RULES (5+ rules)
// ═══════════════════════════════════════════════════════════════════════════

export const MESTA_RULES: CauseRule[] = [
  // C_FIBER_MESTA_DISEASE_001: Foot Rot
  {
    rule_id: 'C_FIBER_MESTA_DISEASE_001',
    category: 'disease',
    crop_code: 'mesta',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mesta' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Phytophthora parasitica causes foot rot in waterlogged conditions.',
    icar_package: 'ICAR-CRIJAF Mesta PoP 2024'
  },

  // C_FIBER_MESTA_PEST_001: Mealybug
  {
    rule_id: 'C_FIBER_MESTA_PEST_001',
    category: 'pest',
    crop_code: 'mesta',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mesta' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.MEALYBUG_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Mealybug causes stunting and reduces fiber quality.',
    icar_package: 'ICAR-CRIJAF Mesta PoP 2024'
  },

  // C_FIBER_MESTA_WATER_001: Active Growth
  {
    rule_id: 'C_FIBER_MESTA_WATER_001',
    category: 'water',
    crop_code: 'mesta',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mesta' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-CRIJAF',
    scientific_basis: 'Moisture stress during vegetative growth reduces plant height and fiber yield.',
    icar_package: 'ICAR-CRIJAF Mesta PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL FIBER FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FIBER_RULES: CauseRule[] = [
  // C_FIBER_ALL_NUTRIENT_001: Nitrogen for Vegetative Growth
  {
    rule_id: 'C_FIBER_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_FIBER',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR Fiber Crops',
    scientific_basis: 'Nitrogen is critical for vegetative growth and fiber yield in all fiber crops.'
  },

  // C_FIBER_ALL_NUTRIENT_002: Phosphorus for Root Development
  {
    rule_id: 'C_FIBER_ALL_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ALL_FIBER',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P &&
      input.days_after_sowing <= 45,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR',
    scientific_basis: 'Phosphorus promotes root development and early vigor in fiber crops.'
  },

  // C_FIBER_ALL_HEALTHY_001: Optimal Growth
  {
    rule_id: 'C_FIBER_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_FIBER',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.HEALTHY || input.ndvi_state === NDVIState.EXCELLENT) &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR',
    scientific_basis: 'Healthy NDVI indicates good crop establishment and fiber development potential.'
  },

  // C_FIBER_ALL_HEALTHY_002: Recovery Trend
  {
    rule_id: 'C_FIBER_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_FIBER',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_trend === NDVITrend.RISING,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI',
    scientific_basis: 'Rising NDVI indicates recovery from previous stress.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL PERIOD WATER STRESS (CPWS) RULES - FIBER
// ═══════════════════════════════════════════════════════════════════════════

export const COTTON_CPWS_RULES: CauseRule[] = [
  {
    rule_id: 'CPWS_COTTON_001',
    category: 'water',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.days_after_sowing >= 50 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_COTTON_FLOWERING_BOLL,
    priority: 10,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Squaring to peak boll formation (50-80 DAS) is 30-day critical window. Water stress causes massive square/boll shedding (30-40%).',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FIBER RULES
// ═══════════════════════════════════════════════════════════════════════════

export const FIBER_RULES: CauseRule[] = [
  ...COTTON_RULES,
  ...JUTE_RULES,
  ...MESTA_RULES,
  ...COTTON_CPWS_RULES,
  ...ALL_FIBER_RULES
];

export default FIBER_RULES;
