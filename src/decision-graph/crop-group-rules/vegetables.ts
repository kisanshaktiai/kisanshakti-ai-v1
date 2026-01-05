/**
 * VEGETABLES CROP GROUP RULES
 * Crops: Tomato, Onion, Potato, Brinjal, Cabbage, Cauliflower, Chilli
 * Total: 50+ rules
 * Sources: ICAR-IIVR Varanasi, ICAR-DOGR Pune, ICAR-CPRI Shimla
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
// TOMATO RULES (14 rules)
// Reference: ICAR-IIVR Varanasi Package of Practices 2024
// ═══════════════════════════════════════════════════════════════════════════

export const TOMATO_RULES: CauseRule[] = [
  // Late blight - devastating disease
  {
    rule_id: 'C_VEG_TOMATO_DISEASE_001',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.LATE_BLIGHT_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIVR Varanasi',
    scientific_basis: 'Phytophthora infestans thrives at 15-22°C with >90% RH and free moisture. Can destroy crop in 7-10 days. Preventive spray with Mancozeb+Metalaxyl.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Early blight (Alternaria)
  {
    rule_id: 'C_VEG_TOMATO_DISEASE_002',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Early blight (Alternaria solani) attacks nitrogen-deficient and stressed plants. Causes target board spots on leaves.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Bacterial wilt
  {
    rule_id: 'C_VEG_TOMATO_DISEASE_003',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Bacterial wilt (Ralstonia solanacearum) spreads in warm wet soils. Plants wilt without yellowing. Soil-borne, no chemical control.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Fusarium wilt
  {
    rule_id: 'C_VEG_TOMATO_DISEASE_004',
    category: 'disease',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Fusarium wilt favored by warm soil (28-32°C). Causes one-sided yellowing and wilting.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Fruit borer (Helicoverpa)
  {
    rule_id: 'C_VEG_TOMATO_PEST_001',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FRUIT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Tomato fruit borer (Helicoverpa armigera) bores into fruits. ICAR ETL: 1 larva/plant or 5% fruit damage. Use pheromone traps.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Whitefly (ToLCV vector)
  {
    rule_id: 'C_VEG_TOMATO_PEST_002',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WHITEFLY_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Whitefly (Bemisia tabaci) transmits Tomato Leaf Curl Virus (ToLCV). ICAR ETL: 5-10 adults/plant. Vector control essential.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Thrips
  {
    rule_id: 'C_VEG_TOMATO_PEST_003',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.THRIPS_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Thrips cause upward curling of leaves. Transmit Tomato Spotted Wilt Virus (TSWV).',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Mite infestation
  {
    rule_id: 'C_VEG_TOMATO_PEST_004',
    category: 'pest',
    crop_code: 'tomato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.MITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Red spider mite causes bronzing of leaves. Severe in hot dry weather. Use Dicofol or sulphur.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Critical water stress at flowering
  {
    rule_id: 'C_VEG_TOMATO_WATER_001',
    category: 'water',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Flowering is most water-sensitive stage. Stress causes flower drop and blossom end rot.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Fruit development water
  {
    rule_id: 'C_VEG_TOMATO_WATER_002',
    category: 'water',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Consistent moisture needed during fruit development. Irregular watering causes fruit cracking.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Calcium deficiency (Blossom end rot)
  {
    rule_id: 'C_VEG_TOMATO_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Blossom end rot caused by calcium deficiency due to irregular watering. Spray CaCl2 0.5%.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },

  // Potassium for fruit quality
  {
    rule_id: 'C_VEG_TOMATO_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Potassium is critical for fruit color, taste, and shelf life. Apply 50% K as top-dress at flowering.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ONION RULES (10 rules)
// Reference: ICAR-DOGR Pune
// ═══════════════════════════════════════════════════════════════════════════

export const ONION_RULES: CauseRule[] = [
  // Purple blotch
  {
    rule_id: 'C_VEG_ONION_DISEASE_001',
    category: 'disease',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.PURPLE_BLOTCH_RISK,
    priority: 8,
    scientific_source: 'ICAR-DOGR Pune',
    scientific_basis: 'Alternaria porri causes purple lesions on leaves. Favored by 80-90% RH and 25-30°C. Spray Mancozeb 0.25%.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Stemphylium blight
  {
    rule_id: 'C_VEG_ONION_DISEASE_002',
    category: 'disease',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Stemphylium blight causes yellowing and tip drying. Common during humid weather.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Basal rot
  {
    rule_id: 'C_VEG_ONION_DISEASE_003',
    category: 'disease',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Fusarium basal rot causes soft rotting at bulb base. Favored by waterlogging.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Thrips - most serious pest
  {
    rule_id: 'C_VEG_ONION_PEST_001',
    category: 'pest',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.THRIPS_RISK,
    priority: 9,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Thrips tabaci causes silvery streaks on leaves. Most serious pest of onion. ICAR ETL: 25-30 thrips/plant.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Bulb formation irrigation - critical
  {
    rule_id: 'C_VEG_ONION_WATER_001',
    category: 'water',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Bulb development requires consistent moisture. Stress causes bolting, small bulbs, and splits.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Stop irrigation at maturity
  {
    rule_id: 'C_VEG_ONION_WATER_002',
    category: 'water',
    crop_code: 'onion',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.crop_stage === CropStage.MATURITY &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 7,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Stop irrigation 10-15 days before harvest. Excess water at maturity causes bulb rot in storage.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Nitrogen at bulb initiation
  {
    rule_id: 'C_VEG_ONION_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'onion',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing <= 45,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Nitrogen needed for leaf growth which determines bulb size. Apply 50% N at 30 DAT.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // Sulphur for pungency
  {
    rule_id: 'C_VEG_ONION_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Sulphur is critical for onion pungency and storage quality. Apply 30-40 kg S/ha.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// POTATO RULES (12 rules)
// Reference: ICAR-CPRI Shimla
// ═══════════════════════════════════════════════════════════════════════════

export const POTATO_RULES: CauseRule[] = [
  // Late blight - most devastating
  {
    rule_id: 'C_VEG_POTATO_DISEASE_001',
    category: 'disease',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.LATE_BLIGHT_RISK,
    priority: 10,
    scientific_source: 'ICAR-CPRI Shimla',
    scientific_basis: 'Phytophthora infestans can destroy entire potato crop in 7-10 days. Favored by 10-20°C with >90% RH. Preventive spray with Mancozeb+Metalaxyl mandatory.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Early blight
  {
    rule_id: 'C_VEG_POTATO_DISEASE_002',
    category: 'disease',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Early blight (Alternaria solani) attacks stressed, N-deficient plants. Causes target-spot lesions.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Common scab
  {
    rule_id: 'C_VEG_POTATO_DISEASE_003',
    category: 'disease',
    crop_code: 'potato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 70,
    cause: Cause.ROOT_ROT_RISK,
    priority: 6,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Common scab (Streptomyces) favored by dry alkaline soil. Maintain moisture during tuber initiation.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Black scurf
  {
    rule_id: 'C_VEG_POTATO_DISEASE_004',
    category: 'disease',
    crop_code: 'potato',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.weather_state === WeatherState.COLD_STRESS &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Black scurf (Rhizoctonia) causes delayed emergence and stem canker in cold wet soils.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Aphid (virus vector)
  {
    rule_id: 'C_VEG_POTATO_PEST_001',
    category: 'pest',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 8,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Green peach aphid (Myzus persicae) transmits potato viruses (PLRV, PVY). ETL: 20 aphids/100 leaves.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Cutworm
  {
    rule_id: 'C_VEG_POTATO_PEST_002',
    category: 'pest',
    crop_code: 'potato',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.crop_stage === CropStage.GERMINATION &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CUTWORM_RISK,
    priority: 7,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Cutworm cuts seedlings at ground level. Active at night. Flood irrigation controls larvae.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Tuber initiation water - critical
  {
    rule_id: 'C_VEG_POTATO_WATER_001',
    category: 'water',
    crop_code: 'potato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 70 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Tuber initiation and bulking (45-70 DAP) is most water-sensitive period. Stress causes misshapen tubers and reduces yield by 30-50%.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Stop irrigation at maturity
  {
    rule_id: 'C_VEG_POTATO_WATER_002',
    category: 'water',
    crop_code: 'potato',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.crop_stage === CropStage.MATURITY &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 7,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Stop irrigation 10-12 days before harvest. Wet harvest causes lenticel swelling and storage rot.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Potassium for tuber quality
  {
    rule_id: 'C_VEG_POTATO_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'potato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Potassium is critical for tuber size, starch content, and storage quality. Apply 100-150 kg K2O/ha.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Nitrogen at stolon
  {
    rule_id: 'C_VEG_POTATO_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 40,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'First N top-dress at 25-30 DAP with earthing up. Nitrogen needed for canopy development.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },

  // Frost damage
  {
    rule_id: 'C_VEG_POTATO_COLD_001',
    category: 'temperature',
    crop_code: 'potato',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'potato' &&
      input.weather_state === WeatherState.FROST_RISK,
    cause: Cause.FROST_DAMAGE_RISK,
    priority: 9,
    scientific_source: 'ICAR-CPRI',
    scientific_basis: 'Potato foliage is killed by frost. Light irrigation before frost raises temperature. Cover with straw if frost predicted.',
    icar_package: 'ICAR-CPRI Potato PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BRINJAL (EGGPLANT) RULES (6 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const BRINJAL_RULES: CauseRule[] = [
  // Fruit and shoot borer - major pest
  {
    rule_id: 'C_VEG_BRINJAL_PEST_001',
    category: 'pest',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'brinjal' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SHOOT_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Leucinodes orbonalis bores into shoots (causing wilting) and fruits. Most serious pest. ETL: 5% shoot damage.',
    icar_package: 'ICAR-IIVR Brinjal PoP 2024'
  },

  // Jassid
  {
    rule_id: 'C_VEG_BRINJAL_PEST_002',
    category: 'pest',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'brinjal' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.JASSID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Jassids cause upward curling of leaves with yellowing margins (hopper burn).',
    icar_package: 'ICAR-IIVR Brinjal PoP 2024'
  },

  // Phomopsis blight
  {
    rule_id: 'C_VEG_BRINJAL_DISEASE_001',
    category: 'disease',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'brinjal' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Phomopsis blight causes fruit rot and leaf spots in humid weather.',
    icar_package: 'ICAR-IIVR Brinjal PoP 2024'
  },

// Bacterial wilt
  {
    rule_id: 'C_VEG_BRINJAL_DISEASE_002',
    category: 'disease',
    crop_code: 'brinjal',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'brinjal' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Bacterial wilt (Ralstonia) causes sudden wilting in warm wet soils. No chemical control. Use grafted seedlings.',
    icar_package: 'ICAR-IIVR Brinjal PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL VEGETABLES FALLBACK RULES (10 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_VEGETABLES_RULES: CauseRule[] = [
  // General water stress
  {
    rule_id: 'C_VEG_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Vegetables have shallow roots and high water demand (4-6 mm/day). Regular irrigation essential.'
  },

  // Damping off in nursery
  {
    rule_id: 'C_VEG_ALL_DISEASE_001',
    category: 'disease',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_stage === CropStage.GERMINATION &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.DAMPING_OFF_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Damping off (Pythium/Rhizoctonia) kills seedlings in overwatered nurseries. Treat soil with Trichoderma.'
  },

  // Nitrogen for leafy growth
  {
    rule_id: 'C_VEG_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Nitrogen is critical for vegetable leaf development. Deficiency causes stunted pale plants.'
  },

  // Phosphorus for rooting
  {
    rule_id: 'C_VEG_ALL_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Phosphorus supports root development and early establishment in vegetables.'
  },

  // Potassium for fruit quality
  {
    rule_id: 'C_VEG_ALL_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Potassium is critical for fruit/tuber quality, color, and storage in vegetables.'
  },

  // Optimal growth
  {
    rule_id: 'C_VEG_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HEALTHY &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Healthy NDVI with stable trend indicates good vegetable crop establishment.'
  },

  // Recovery trend
  {
    rule_id: 'C_VEG_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_trend === NDVITrend.RISING,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI',
    scientific_basis: 'Rising NDVI indicates crop recovery from stress.'
  },

  // Critical decline
  {
    rule_id: 'C_VEG_ALL_CRITICAL_001',
    category: 'critical',
    crop_code: 'ALL_VEGETABLES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.CRITICAL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    priority: 10,
    scientific_source: 'NASA + ICAR',
    scientific_basis: 'NDVI <0.20 with declining trend indicates severe stress - immediate diagnosis needed.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL PERIOD WATER STRESS (CPWS) RULES - VEGETABLES
// ═══════════════════════════════════════════════════════════════════════════

export const VEGETABLES_CPWS_RULES: CauseRule[] = [
  {
    rule_id: 'CPWS_TOMATO_001',
    category: 'water',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_TOMATO_FLOWERING,
    priority: 10,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Flowering-fruit set stage EXTREMELY sensitive. Water stress causes flower drop, blossom end rot.',
    icar_package: 'ICAR-IIVR Tomato PoP 2024'
  },
  {
    rule_id: 'CPWS_ONION_001',
    category: 'water',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 60 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_ONION_BULB_INITIATION,
    priority: 9,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Bulb initiation (40-60 DAT) critical period. Stress = small bulbs.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CABBAGE RULES (7 rules)
// Source: ICAR-IIVR + ICAR-IIHR
// ═══════════════════════════════════════════════════════════════════════════

export const CABBAGE_RULES: CauseRule[] = [
  // CABBAGE_DISEASE_001: Black Rot - Most Destructive
  {
    rule_id: 'C_VEG_CABBAGE_DISEASE_001',
    category: 'disease',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cabbage' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CABBAGE_BLACK_ROT_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIVR Varanasi',
    scientific_basis: 'Xanthomonas campestris pv. campestris causes V-shaped yellow lesions from leaf margins. Systemic vascular disease. Can destroy entire crop. NO chemical cure - only prevention. Hot water seed treatment 50°C for 25 min mandatory.',
    icar_package: 'ICAR-IIVR Cabbage PoP 2024'
  },

  // CABBAGE_DISEASE_002: Clubroot
  {
    rule_id: 'C_VEG_CABBAGE_DISEASE_002',
    category: 'disease',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cabbage' &&
      input.metadata?.soil_ph_state === 'ACIDIC' &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.CABBAGE_CLUBROOT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Plasmodiophora brassicae causes root galls. Favored by acidic pH <6.5. Apply lime to raise pH to 7.0-7.2. Soil-borne pathogen survives 20+ years. Rotate out of Brassica for 5-7 years.',
    icar_package: 'ICAR Clubroot Management'
  },

  // CABBAGE_PEST_001: Diamondback Moth - THE Major Pest
  {
    rule_id: 'C_VEG_CABBAGE_PEST_001',
    category: 'pest',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cabbage' &&
      input.metadata?.pest_detected === 'DIAMONDBACK_MOTH' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CABBAGE_DIAMONDBACK_MOTH_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR + Global IPM',
    scientific_basis: 'Plutella xylostella is MOST serious pest of Brassicas worldwide. Highly resistant to pyrethroids. ETL: 5 larvae/plant. MUST use IPM ladder. Release Trichogramma @ 40,000/acre OR Bt spray.',
    icar_package: 'ICAR-IIVR Cabbage IPM 2024'
  },

  // CABBAGE_PEST_002: Cabbage Aphid
  {
    rule_id: 'C_VEG_CABBAGE_PEST_002',
    category: 'pest',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cabbage' &&
      input.metadata?.pest_detected === 'APHID' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.CABBAGE_APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Brevicoryne brassicae forms dense colonies inside head. Dry weather favors aphids. ETL: 10-15% plants infested. Spray neem oil 0.3% OR imidacloprid 0.3ml/L.',
    icar_package: 'ICAR-IIVR Pest Management'
  },

  // CABBAGE_NUTRIENT_001: Boron Deficiency - Hollow Stem
  {
    rule_id: 'C_VEG_CABBAGE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cabbage' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.metadata?.hollow_stem === true,
    cause: Cause.BORON_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Boron deficiency causes brown heart (hollow stem) in cabbage. Head develops brown patches internally. Unmarketable. Apply borax @ 10 kg/ha at planting OR foliar 0.2% at head initiation.',
    icar_package: 'ICAR-IIVR Nutrition Guide'
  },

  // CABBAGE_WATER_001: Head Formation Critical Period
  {
    rule_id: 'C_VEG_CABBAGE_WATER_001',
    category: 'water',
    crop_code: 'cabbage',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cabbage' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Head formation stage requires consistent moisture. Water stress causes loose heads, cracking, bolting. Irrigate every 5-7 days.',
    icar_package: 'ICAR-IIVR Cabbage PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CAULIFLOWER RULES (6 rules)
// Source: ICAR-IIVR + ICAR-IIHR
// ═══════════════════════════════════════════════════════════════════════════

export const CAULIFLOWER_RULES: CauseRule[] = [
  // CAULIFLOWER_DISEASE_001: Downy Mildew
  {
    rule_id: 'C_VEG_CAULIFLOWER_DISEASE_001',
    category: 'disease',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing <= 45,
    cause: Cause.CAULIFLOWER_DOWNY_MILDEW_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Peronospora parasitica attacks seedling stage. Yellow patches on upper leaf surface, white fungal growth below. Spray Metalaxyl+Mancozeb 0.25%.',
    icar_package: 'ICAR-IIVR Cauliflower PoP 2024'
  },

  // CAULIFLOWER_DISEASE_002: Black Rot
  {
    rule_id: 'C_VEG_CAULIFLOWER_DISEASE_002',
    category: 'disease',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CAULIFLOWER_BLACK_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Xanthomonas campestris - same as cabbage. V-shaped yellow lesions. Hot water seed treatment 50°C for 25 min. Streptocycline 200 ppm spray.',
    icar_package: 'ICAR-IIVR Disease Package'
  },

  // CAULIFLOWER_PEST_001: Diamondback Moth
  {
    rule_id: 'C_VEG_CAULIFLOWER_PEST_001',
    category: 'pest',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower' &&
      input.metadata?.pest_detected === 'DIAMONDBACK_MOTH',
    cause: Cause.CABBAGE_DIAMONDBACK_MOTH_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Plutella xylostella attacks leaves before curd formation. Bt spray OR Spinosad. AVOID pyrethroids (resistance).',
    icar_package: 'ICAR-IIVR IPM Package'
  },

  // CAULIFLOWER_PEST_002: Aphid
  {
    rule_id: 'C_VEG_CAULIFLOWER_PEST_002',
    category: 'pest',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower' &&
      input.metadata?.pest_detected === 'APHID',
    cause: Cause.CAULIFLOWER_APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Aphids cluster on curd, causing black sooty mold. Quality loss. Neem oil 0.3% OR imidacloprid.',
    icar_package: 'ICAR-IIVR Pest Control'
  },

  // CAULIFLOWER_NUTRIENT_001: Boron for Curd Quality
  {
    rule_id: 'C_VEG_CAULIFLOWER_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.BORON_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Boron deficiency causes brown spots in curd. Apply borax @ 10 kg/ha OR foliar 0.2% at curd initiation.',
    icar_package: 'ICAR-IIVR Nutrition'
  },

  // CAULIFLOWER_WATER_001: Curd Development
  {
    rule_id: 'C_VEG_CAULIFLOWER_WATER_001',
    category: 'water',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Curd development requires continuous moisture. Stress causes small, loose, ricey curds. Irrigate every 5-7 days.',
    icar_package: 'ICAR-IIVR Cauliflower PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// OKRA (BHINDI) RULES (6 rules)
// Source: ICAR-IIVR
// ═══════════════════════════════════════════════════════════════════════════

export const OKRA_RULES: CauseRule[] = [
  // OKRA_DISEASE_001: Yellow Vein Mosaic Virus - MOST Destructive
  {
    rule_id: 'C_VEG_OKRA_DISEASE_001',
    category: 'disease',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'okra' &&
      input.metadata?.pest_detected === 'WHITEFLY' &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.OKRA_YELLOW_VEIN_MOSAIC_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIVR + IIHR',
    scientific_basis: 'YVMV (Bhindi Yellow Vein Mosaic Virus) transmitted by whitefly Bemisia tabaci. Causes severe yellowing of veins, stunting, fruit deformation. Can cause 90-100% yield loss. NO CURE - only prevention. Control whitefly vector. Use resistant varieties like Arka Anamika.',
    icar_package: 'ICAR-IIVR Okra PoP 2024'
  },

  // OKRA_DISEASE_002: Powdery Mildew
  {
    rule_id: 'C_VEG_OKRA_DISEASE_002',
    category: 'disease',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'okra' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.OKRA_POWDERY_MILDEW_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Erysiphe cichoracearum causes white powdery coating on leaves. Favored by dry weather. Reduces photosynthesis. Spray Sulphur 0.2% OR Carbendazim 0.1%.',
    icar_package: 'ICAR-IIVR Disease Management'
  },

  // OKRA_PEST_001: Shoot and Fruit Borer - Major Pest
  {
    rule_id: 'C_VEG_OKRA_PEST_001',
    category: 'pest',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'okra' &&
      input.metadata?.pest_detected === 'SHOOT_FRUIT_BORER' &&
      (Number(input.metadata?.fruit_damage_percent) || 0) > 5,
    cause: Cause.OKRA_SHOOT_FRUIT_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Earias vittella bores into shoots (vegetative) and fruits (reproductive). ETL: 5% damaged fruits. Makes fruits unmarketable. Spray Spinosad 0.3ml/L OR release Trichogramma @ 40,000/acre.',
    icar_package: 'ICAR-IIVR Okra IPM'
  },

  // OKRA_PEST_002: Jassid (Leafhopper)
  {
    rule_id: 'C_VEG_OKRA_PEST_002',
    category: 'pest',
    crop_code: 'okra',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'okra' &&
      input.metadata?.pest_detected === 'JASSID' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.OKRA_JASSID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Amrasca biguttula sucks sap from leaf undersurface. Causes hopper burn (leaf curling, browning). ETL: 5 nymphs/leaf. Spray imidacloprid 0.3ml/L.',
    icar_package: 'ICAR-IIVR Pest Package'
  },

  // OKRA_PEST_003: Whitefly (YVMV Vector)
  {
    rule_id: 'C_VEG_OKRA_PEST_003',
    category: 'pest',
    crop_code: 'okra',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'okra' &&
      input.metadata?.pest_detected === 'WHITEFLY' &&
      input.days_after_sowing <= 30,
    cause: Cause.OKRA_WHITEFLY_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Whitefly is YVMV vector. MUST control in first 30 days to prevent virus. ETL: 3 adults/leaf. Yellow sticky traps + neem oil OR imidacloprid seed treatment.',
    icar_package: 'ICAR-IIVR YVMV Prevention'
  },

  // OKRA_WATER_001: Flowering Critical Period
  {
    rule_id: 'C_VEG_OKRA_WATER_001',
    category: 'water',
    crop_code: 'okra',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'okra' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Flowering-fruiting requires consistent moisture. Water stress reduces fruit set. Irrigate every 5-7 days in summer.',
    icar_package: 'ICAR-IIVR Okra PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// BEANS (FRENCH BEAN, CLUSTER BEAN) RULES (6 rules)
// Source: ICAR-IIVR + IIPR
// ═══════════════════════════════════════════════════════════════════════════

export const BEANS_RULES: CauseRule[] = [
  // BEANS_DISEASE_001: Anthracnose
  {
    rule_id: 'C_VEG_BEANS_DISEASE_001',
    category: 'disease',
    crop_code: 'beans',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.crop_code === 'beans' || input.crop_code === 'french_bean') &&
      input.weather_state === WeatherState.RAIN_ACTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BEANS_ANTHRACNOSE_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Colletotrichum lindemuthianum causes dark sunken lesions on pods and stems. Spread by rain splash. Seed-borne. Hot water seed treatment 50°C for 10 min. Spray Mancozeb 0.25% OR Carbendazim 0.1%.',
    icar_package: 'ICAR-IIVR Beans PoP 2024'
  },

  // BEANS_DISEASE_002: Rust
  {
    rule_id: 'C_VEG_BEANS_DISEASE_002',
    category: 'disease',
    crop_code: 'beans',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_code === 'beans' || input.crop_code === 'french_bean') &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.BEANS_RUST_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Uromyces appendiculatus causes reddish-brown pustules on leaves. Spray Mancozeb 0.25% at first sign.',
    icar_package: 'ICAR-IIVR Disease Management'
  },

  // BEANS_DISEASE_003: Root Rot
  {
    rule_id: 'C_VEG_BEANS_DISEASE_003',
    category: 'disease',
    crop_code: 'beans',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_code === 'beans' || input.crop_code === 'french_bean') &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.BEANS_ROOT_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Rhizoctonia solani + Fusarium complex causes root rot in waterlogged soils. Poor drainage fatal. Seed treatment with Trichoderma. Improve drainage immediately.',
    icar_package: 'ICAR-IIPR Pulse Diseases'
  },

  // BEANS_PEST_001: Pod Borer
  {
    rule_id: 'C_VEG_BEANS_PEST_001',
    category: 'pest',
    crop_code: 'beans',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.crop_code === 'beans' || input.crop_code === 'french_bean') &&
      input.metadata?.pest_detected === 'POD_BORER' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.BEANS_POD_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Helicoverpa armigera bores into pods. ETL: 2 larvae/10 plants. Spray Spinosad 0.3ml/L OR Bt.',
    icar_package: 'ICAR-IIVR Vegetable IPM'
  },

  // BEANS_PEST_002: Aphid
  {
    rule_id: 'C_VEG_BEANS_PEST_002',
    category: 'pest',
    crop_code: 'beans',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_code === 'beans' || input.crop_code === 'french_bean') &&
      input.metadata?.pest_detected === 'APHID',
    cause: Cause.BEANS_APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Aphis craccivora colonies on tender shoots. Spray neem oil 0.3% OR imidacloprid 0.3ml/L.',
    icar_package: 'ICAR-IIVR Pest Control'
  },

  // BEANS_NUTRIENT_001: Nitrogen Fixation
  {
    rule_id: 'C_VEG_BEANS_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'beans',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      (input.crop_code === 'beans' || input.crop_code === 'french_bean') &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.GERMINATION,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Beans fix atmospheric N through Rhizobium. Seed inoculation with Rhizobium @ 200g/10kg seed. Apply starter N 20 kg/ha.',
    icar_package: 'ICAR-IIPR Pulse Production'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CUCUMBER RULES (12 rules) - ICAR-IIVR Standards
// ═══════════════════════════════════════════════════════════════════════════

export const CUCUMBER_RULES: CauseRule[] = [
  {
    rule_id: 'C_VEG_CUCUMBER_DISEASE_001',
    category: 'disease',
    crop_code: 'cucumber',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cucumber' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Downy mildew (Pseudoperonospora cubensis) causes angular yellow spots. Spray Metalaxyl+Mancozeb 0.25%.',
    icar_package: 'ICAR-IIVR Cucurbit PoP'
  },
  {
    rule_id: 'C_VEG_CUCUMBER_DISEASE_002',
    category: 'disease',
    crop_code: 'cucumber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cucumber' &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Powdery mildew causes white powdery growth on leaves. Spray wettable sulfur 0.25% or Karathane 0.1%.',
    icar_package: 'ICAR-IIVR Cucurbit PoP'
  },
  {
    rule_id: 'C_VEG_CUCUMBER_PEST_001',
    category: 'pest',
    crop_code: 'cucumber',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'cucumber' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FRUIT_FLY_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Fruit fly (Bactrocera cucurbitae) maggots damage fruits. Use cuelure traps at 25/ha. Spray Malathion 0.1% as bait spray.',
    icar_package: 'ICAR-IIVR Cucurbit IPM'
  },
  {
    rule_id: 'C_VEG_CUCUMBER_PEST_002',
    category: 'pest',
    crop_code: 'cucumber',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cucumber' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Aphids transmit cucumber mosaic virus. Spray imidacloprid 0.3ml/L or neem oil 0.3%.',
    icar_package: 'ICAR-IIVR Cucurbit IPM'
  },
  {
    rule_id: 'C_VEG_CUCUMBER_WATER_001',
    category: 'water',
    crop_code: 'cucumber',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cucumber' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Flowering and fruit development requires consistent moisture. Water stress causes bitter fruits and flower drop.',
    icar_package: 'ICAR-IIVR Cucurbit PoP'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// LEAFY VEGETABLES RULES (8 rules) - ICAR Standards
// ═══════════════════════════════════════════════════════════════════════════

export const LEAFY_VEGETABLES_RULES: CauseRule[] = [
  {
    rule_id: 'C_VEG_LEAFY_PEST_001',
    category: 'pest',
    crop_code: 'spinach',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_code === 'spinach' || input.crop_code === 'amaranthus' || input.crop_code === 'fenugreek') &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Aphids congregate on tender leaves. Use neem-based pesticides for food safety.',
    icar_package: 'ICAR-IIVR Leafy Vegetables PoP'
  },
  {
    rule_id: 'C_VEG_LEAFY_PEST_002',
    category: 'pest',
    crop_code: 'spinach',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_code === 'spinach' || input.crop_code === 'amaranthus') &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.MITE_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Spider mites attack during dry weather. Spray dicofol 0.05% or wettable sulfur.',
    icar_package: 'ICAR-IIVR Pest Control'
  },
  {
    rule_id: 'C_VEG_LEAFY_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'spinach',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_code === 'spinach' || input.crop_code === 'amaranthus') &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Leafy vegetables need high N for leaf growth. Apply 25 kg N/ha every 15 days as urea spray 1%.',
    icar_package: 'ICAR-IIVR Nutrition Schedule'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED VEGETABLES RULES
// ═══════════════════════════════════════════════════════════════════════════

export const VEGETABLES_RULES: CauseRule[] = [
  ...TOMATO_RULES,
  ...ONION_RULES,
  ...POTATO_RULES,
  ...BRINJAL_RULES,
  ...CABBAGE_RULES,
  ...CAULIFLOWER_RULES,
  ...OKRA_RULES,
  ...BEANS_RULES,
  ...CUCUMBER_RULES,
  ...LEAFY_VEGETABLES_RULES,
  ...VEGETABLES_CPWS_RULES,
  ...ALL_VEGETABLES_RULES
];

export default VEGETABLES_RULES;
