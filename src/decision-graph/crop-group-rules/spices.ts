/**
 * SPICES CROP GROUP RULES
 * Crops: Turmeric, Ginger, Chilli, Black Pepper, Cardamom, Cumin, Coriander
 * Total: 40+ rules
 * Sources: ICAR-IISR Calicut, ICAR-IIHR Bangalore
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
// TURMERIC RULES (10+ rules)
// Source: ICAR-IISR Calicut
// ═══════════════════════════════════════════════════════════════════════════

export const TURMERIC_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_SPICE_TURMERIC_DISEASE_001: Rhizome Rot - Pythium
  {
    rule_id: 'C_SPICE_TURMERIC_DISEASE_001',
    category: 'disease',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 10,
    scientific_source: 'ICAR-IISR Calicut',
    scientific_basis: 'Pythium aphanidermatum causes soft rot of rhizomes. Waterlogging is the primary predisposing factor. Yellowing starts from lower leaves.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // C_SPICE_TURMERIC_DISEASE_002: Leaf Blotch
  {
    rule_id: 'C_SPICE_TURMERIC_DISEASE_002',
    category: 'disease',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Taphrina maculans causes brown rectangular spots on leaves. Reduces photosynthesis.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // C_SPICE_TURMERIC_DISEASE_003: Leaf Spot
  {
    rule_id: 'C_SPICE_TURMERIC_DISEASE_003',
    category: 'disease',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Colletotrichum capsici causes brown spots with yellow halo on leaves.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEST RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_SPICE_TURMERIC_PEST_001: Shoot Borer
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
    scientific_basis: 'Conogethes punctiferalis bores into pseudostem causing dead heart. Frass at bore hole is diagnostic. ETL: 15% dead hearts.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // C_SPICE_TURMERIC_PEST_002: Rhizome Scale
  {
    rule_id: 'C_SPICE_TURMERIC_PEST_002',
    category: 'pest',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Aspidiella hartii sucks sap from stored rhizomes. Active in dry storage conditions.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // C_SPICE_TURMERIC_PEST_003: Thrips
  {
    rule_id: 'C_SPICE_TURMERIC_PEST_003',
    category: 'pest',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.THRIPS_RISK,
    priority: 6,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Panchaetothrips indicus causes silvering of leaves in dry weather.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT AND WATER RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_SPICE_TURMERIC_NUTRIENT_001: Potassium for Rhizome
  {
    rule_id: 'C_SPICE_TURMERIC_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Potassium is critical for rhizome development and curcumin content. Apply 120 kg K2O/ha.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },

  // C_SPICE_TURMERIC_WATER_001: Active Growth
  {
    rule_id: 'C_SPICE_TURMERIC_WATER_001',
    category: 'water',
    crop_code: 'turmeric',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'turmeric' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Turmeric requires 1500-2000mm rainfall. Irrigate at 7-10 day intervals.',
    icar_package: 'ICAR-IISR Turmeric PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GINGER RULES (10+ rules)
// Source: ICAR-IISR Calicut
// ═══════════════════════════════════════════════════════════════════════════

export const GINGER_RULES: CauseRule[] = [
  // C_SPICE_GINGER_DISEASE_001: Bacterial Soft Rot
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
    scientific_basis: 'Ralstonia solanacearum causes rapid collapse. Most destructive disease. No chemical cure - use disease-free seed rhizomes.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // C_SPICE_GINGER_DISEASE_002: Pythium Soft Rot
  {
    rule_id: 'C_SPICE_GINGER_DISEASE_002',
    category: 'disease',
    crop_code: 'ginger',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Pythium myriotylum causes watery soft rot with foul smell. Drain excess water immediately.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // C_SPICE_GINGER_DISEASE_003: Phyllosticta Leaf Spot
  {
    rule_id: 'C_SPICE_GINGER_DISEASE_003',
    category: 'disease',
    crop_code: 'ginger',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Phyllosticta zingiberi causes oval spots with grey centers on leaves.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // C_SPICE_GINGER_PEST_001: Rhizome Fly
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
    scientific_basis: 'Mimegralla coeruleifrons maggots bore into rhizomes during monsoon. Rotting smell from affected plants.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // C_SPICE_GINGER_PEST_002: Shoot Borer
  {
    rule_id: 'C_SPICE_GINGER_PEST_002',
    category: 'pest',
    crop_code: 'ginger',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Conogethes punctiferalis (same as turmeric) bores into pseudostem.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // C_SPICE_GINGER_WATER_001: Rhizome Development
  {
    rule_id: 'C_SPICE_GINGER_WATER_001',
    category: 'water',
    crop_code: 'ginger',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Adequate moisture during rhizome bulking (4-7 months) is critical for yield.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },

  // C_SPICE_GINGER_NUTRIENT_001: Nitrogen for Vegetative
  {
    rule_id: 'C_SPICE_GINGER_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ginger',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ginger' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Nitrogen promotes tiller production and leaf growth. Apply 75 kg N/ha in splits.',
    icar_package: 'ICAR-IISR Ginger PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CHILLI RULES (10+ rules)
// Source: ICAR-IIHR Bangalore
// ═══════════════════════════════════════════════════════════════════════════

export const CHILLI_RULES: CauseRule[] = [
  // C_SPICE_CHILLI_DISEASE_001: Anthracnose (Die-back)
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
    priority: 9,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Colletotrichum capsici causes fruit rot and die-back. Sunken lesions on fruits. Major post-harvest loss.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_DISEASE_002: Bacterial Wilt
  {
    rule_id: 'C_SPICE_CHILLI_DISEASE_002',
    category: 'disease',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Ralstonia solanacearum causes sudden wilting. Browning of vascular tissue. No chemical control.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_DISEASE_003: Powdery Mildew
  {
    rule_id: 'C_SPICE_CHILLI_DISEASE_003',
    category: 'disease',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Leveillula taurica causes white powdery growth on lower leaf surface.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_DISEASE_004: Leaf Curl Virus
  {
    rule_id: 'C_SPICE_CHILLI_DISEASE_004',
    category: 'disease',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Begomovirus transmitted by whitefly. Causes upward curling of leaves and stunting.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_PEST_001: Thrips
  {
    rule_id: 'C_SPICE_CHILLI_PEST_001',
    category: 'pest',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.THRIPS_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Scirtothrips dorsalis causes upward leaf curl and silvering. Transmits Chilli leaf curl virus. ETL: 10 thrips/leaf.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_PEST_002: Fruit Borer
  {
    rule_id: 'C_SPICE_CHILLI_PEST_002',
    category: 'pest',
    crop_code: 'chilli',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FRUIT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Helicoverpa armigera bores into fruits. ETL: 5% fruit damage or 1 larva/plant.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_PEST_003: Broad Mite
  {
    rule_id: 'C_SPICE_CHILLI_PEST_003',
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
    scientific_basis: 'Polyphagotarsonemus latus causes downward curling of leaves and stunted growth.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_PEST_004: Aphid
  {
    rule_id: 'C_SPICE_CHILLI_PEST_004',
    category: 'pest',
    crop_code: 'chilli',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Myzus persicae and Aphis gossypii transmit mosaic viruses. Excess nitrogen attracts aphids.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },

  // C_SPICE_CHILLI_WATER_001: Flowering Stage
  {
    rule_id: 'C_SPICE_CHILLI_WATER_001',
    category: 'water',
    crop_code: 'chilli',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'chilli' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Water stress during flowering causes flower and fruit drop. Critical yield loss period.',
    icar_package: 'ICAR-IIHR Chilli PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BLACK PEPPER RULES (6+ rules)
// Source: ICAR-IISR Calicut
// ═══════════════════════════════════════════════════════════════════════════

export const BLACK_PEPPER_RULES: CauseRule[] = [
  // C_SPICE_PEPPER_DISEASE_001: Phytophthora Foot Rot
  {
    rule_id: 'C_SPICE_PEPPER_DISEASE_001',
    category: 'disease',
    crop_code: 'black_pepper',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'black_pepper' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 10,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Phytophthora capsici causes quick wilt. Most devastating disease of pepper. Collar region turns black.',
    icar_package: 'ICAR-IISR Black Pepper PoP 2024'
  },

  // C_SPICE_PEPPER_DISEASE_002: Anthracnose
  {
    rule_id: 'C_SPICE_PEPPER_DISEASE_002',
    category: 'disease',
    crop_code: 'black_pepper',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'black_pepper' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Colletotrichum gloeosporioides causes spike shedding and berry rot.',
    icar_package: 'ICAR-IISR Black Pepper PoP 2024'
  },

  // C_SPICE_PEPPER_PEST_001: Pollu Beetle
  {
    rule_id: 'C_SPICE_PEPPER_PEST_001',
    category: 'pest',
    crop_code: 'black_pepper',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'black_pepper' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Longitarsus nigripennis causes hollow berries (pollu disease). ETL: 10% spike infestation.',
    icar_package: 'ICAR-IISR Black Pepper PoP 2024'
  },

  // C_SPICE_PEPPER_PEST_002: Scale Insect
  {
    rule_id: 'C_SPICE_PEPPER_PEST_002',
    category: 'pest',
    crop_code: 'black_pepper',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'black_pepper' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Lepidosaphes piperis causes yellowing and drying of leaves in dry weather.',
    icar_package: 'ICAR-IISR Black Pepper PoP 2024'
  },

  // C_SPICE_PEPPER_WATER_001: Spike Development
  {
    rule_id: 'C_SPICE_PEPPER_WATER_001',
    category: 'water',
    crop_code: 'black_pepper',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'black_pepper' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Water stress during spike development causes spike shedding.',
    icar_package: 'ICAR-IISR Black Pepper PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CARDAMOM RULES (5+ rules)
// Source: ICAR-IISR Cardamom Research Centre
// ═══════════════════════════════════════════════════════════════════════════

export const CARDAMOM_RULES: CauseRule[] = [
  // C_SPICE_CARDAMOM_DISEASE_001: Katte Disease (Mosaic)
  {
    rule_id: 'C_SPICE_CARDAMOM_DISEASE_001',
    category: 'disease',
    crop_code: 'cardamom',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cardamom' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 9,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Cardamom mosaic virus causes mosaic patterns and stunting. Transmitted by aphids.',
    icar_package: 'ICAR-IISR Cardamom PoP 2024'
  },

  // C_SPICE_CARDAMOM_DISEASE_002: Capsule Rot
  {
    rule_id: 'C_SPICE_CARDAMOM_DISEASE_002',
    category: 'disease',
    crop_code: 'cardamom',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cardamom' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Phytophthora meadii causes capsule rot during southwest monsoon.',
    icar_package: 'ICAR-IISR Cardamom PoP 2024'
  },

  // C_SPICE_CARDAMOM_PEST_001: Thrips
  {
    rule_id: 'C_SPICE_CARDAMOM_PEST_001',
    category: 'pest',
    crop_code: 'cardamom',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cardamom' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.THRIPS_RISK,
    priority: 8,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Sciothrips cardamomi causes scab on capsules reducing quality.',
    icar_package: 'ICAR-IISR Cardamom PoP 2024'
  },

  // C_SPICE_CARDAMOM_PEST_002: Shoot Borer
  {
    rule_id: 'C_SPICE_CARDAMOM_PEST_002',
    category: 'pest',
    crop_code: 'cardamom',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cardamom' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Conogethes punctiferalis bores into pseudostem causing dead heart.',
    icar_package: 'ICAR-IISR Cardamom PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL SPICES FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_SPICES_RULES: CauseRule[] = [
  // C_SPICE_ALL_DISEASE_001: Rhizome/Root Rot Risk
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
    scientific_basis: 'Rhizome spices are highly susceptible to rot in waterlogged conditions. Ensure good drainage.'
  },

  // C_SPICE_ALL_NUTRIENT_001: Phosphorus for Root
  {
    rule_id: 'C_SPICE_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_SPICES',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P &&
      input.days_after_sowing <= 60,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR',
    scientific_basis: 'Phosphorus promotes rhizome/root development in spice crops.'
  },

  // C_SPICE_ALL_HEALTHY_001: Optimal Growth
  {
    rule_id: 'C_SPICE_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_SPICES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.HEALTHY || input.ndvi_state === NDVIState.EXCELLENT) &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR',
    scientific_basis: 'Healthy NDVI indicates good crop establishment.'
  },

  // C_SPICE_ALL_HEALTHY_002: Recovery Trend
  {
    rule_id: 'C_SPICE_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_SPICES',
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
// CUMIN RULES (8 rules) - ICAR-NRCSS Standards
// ═══════════════════════════════════════════════════════════════════════════

export const CUMIN_RULES: CauseRule[] = [
  {
    rule_id: 'C_SPICE_CUMIN_DISEASE_001',
    category: 'disease',
    crop_code: 'cumin',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cumin' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.CUMIN_BLIGHT_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Alternaria blight (Alternaria burnsii) causes severe damage in humid conditions. Spray Mancozeb 0.25%.',
    icar_package: 'ICAR-NRCSS Cumin PoP'
  },
  {
    rule_id: 'C_SPICE_CUMIN_DISEASE_002',
    category: 'disease',
    crop_code: 'cumin',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cumin' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.CUMIN_WILT_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Fusarium wilt in waterlogged soils. Seed treatment with Trichoderma, crop rotation.',
    icar_package: 'ICAR-NRCSS Cumin Disease Management'
  },
  {
    rule_id: 'C_SPICE_CUMIN_PEST_001',
    category: 'pest',
    crop_code: 'cumin',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cumin' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CUMIN_APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Aphids cause leaf curling and honeydew. Spray imidacloprid 0.3ml/L or neem oil.',
    icar_package: 'ICAR-NRCSS Cumin IPM'
  },
  {
    rule_id: 'C_SPICE_CUMIN_WATER_001',
    category: 'water',
    crop_code: 'cumin',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cumin' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Flowering stage water stress reduces seed set. Irrigate at flowering and seed formation.',
    icar_package: 'ICAR-NRCSS Cumin PoP'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CORIANDER RULES (8 rules) - ICAR-NRCSS Standards
// ═══════════════════════════════════════════════════════════════════════════

export const CORIANDER_RULES: CauseRule[] = [
  {
    rule_id: 'C_SPICE_CORIANDER_DISEASE_001',
    category: 'disease',
    crop_code: 'coriander',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'coriander' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.CORIANDER_WILT_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Wilt (Fusarium oxysporum) in waterlogged conditions. Seed treatment with Trichoderma essential.',
    icar_package: 'ICAR-NRCSS Coriander PoP'
  },
  {
    rule_id: 'C_SPICE_CORIANDER_DISEASE_002',
    category: 'disease',
    crop_code: 'coriander',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'coriander' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.CORIANDER_POWDERY_MILDEW_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Powdery mildew in late season. Spray wettable sulfur 0.25% or Karathane 0.1%.',
    icar_package: 'ICAR-NRCSS Coriander Disease Management'
  },
  {
    rule_id: 'C_SPICE_CORIANDER_PEST_001',
    category: 'pest',
    crop_code: 'coriander',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'coriander' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CORIANDER_APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Aphids (Hyadaphis coriandri) cause leaf curling. Spray neem oil 0.3% or imidacloprid.',
    icar_package: 'ICAR-NRCSS Coriander IPM'
  },
  {
    rule_id: 'C_SPICE_CORIANDER_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'coriander',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'coriander' &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Apply 40-60 kg N/ha for leaf type, 30-40 kg N/ha for seed type coriander.',
    icar_package: 'ICAR-NRCSS Coriander Nutrition'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// FENUGREEK RULES (6 rules) - ICAR-NRCSS Standards
// ═══════════════════════════════════════════════════════════════════════════

export const FENUGREEK_RULES: CauseRule[] = [
  {
    rule_id: 'C_SPICE_FENUGREEK_DISEASE_001',
    category: 'disease',
    crop_code: 'fenugreek',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'fenugreek' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 8,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Powdery mildew major disease. Spray wettable sulfur 0.25% or Karathane 0.1%.',
    icar_package: 'ICAR-NRCSS Fenugreek PoP'
  },
  {
    rule_id: 'C_SPICE_FENUGREEK_DISEASE_002',
    category: 'disease',
    crop_code: 'fenugreek',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fenugreek' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Root rot in waterlogged conditions. Ensure drainage, seed treatment with Trichoderma.',
    icar_package: 'ICAR-NRCSS Fenugreek Disease Management'
  },
  {
    rule_id: 'C_SPICE_FENUGREEK_PEST_001',
    category: 'pest',
    crop_code: 'fenugreek',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'fenugreek' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-NRCSS',
    scientific_basis: 'Aphids attack tender growth. Spray neem oil 0.3% for safe control.',
    icar_package: 'ICAR-NRCSS Fenugreek IPM'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED SPICES RULES
// ═══════════════════════════════════════════════════════════════════════════

export const SPICES_RULES: CauseRule[] = [
  ...TURMERIC_RULES,
  ...GINGER_RULES,
  ...CHILLI_RULES,
  ...BLACK_PEPPER_RULES,
  ...CARDAMOM_RULES,
  ...CUMIN_RULES,
  ...CORIANDER_RULES,
  ...FENUGREEK_RULES,
  ...ALL_SPICES_RULES
];

export default SPICES_RULES;
