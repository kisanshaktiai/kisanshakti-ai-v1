/**
 * FRUITS CROP GROUP RULES
 * Crops: Mango, Banana, Citrus, Grapes, Papaya, Guava, Pomegranate
 * Total: 50+ rules
 * Sources: ICAR-CISH Lucknow, ICAR-NRCB Trichy, ICAR-CCRI Nagpur, ICAR-NRC Grapes Pune
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
// MANGO RULES (12+ rules)
// Source: ICAR-CISH Lucknow, ICAR-IIHR Bangalore
// ═══════════════════════════════════════════════════════════════════════════

export const MANGO_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // PEST RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FRUIT_MANGO_PEST_001: Mango Hopper
  {
    rule_id: 'C_FRUIT_MANGO_PEST_001',
    category: 'pest',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state !== WeatherState.RAIN_ACTIVE,
    cause: Cause.JASSID_RISK,
    priority: 9,
    scientific_source: 'ICAR-CISH Lucknow',
    scientific_basis: 'Idioscopus species suck sap from inflorescence causing 25-60% flower drop. ETL: 5 hoppers/panicle. Peak during February-March flowering.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_PEST_002: Fruit Fly
  {
    rule_id: 'C_FRUIT_MANGO_PEST_002',
    category: 'pest',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.FRUIT_FLY_RISK,
    priority: 8,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Bactrocera dorsalis lays eggs in ripening fruits. Maggots cause fruit rot. Active in humid weather.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_PEST_003: Mealybug
  {
    rule_id: 'C_FRUIT_MANGO_PEST_003',
    category: 'pest',
    crop_code: 'mango',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.MEALYBUG_RISK,
    priority: 7,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Drosicha mangiferae nymphs climb trees in January. Suck sap from inflorescence causing drying.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_PEST_004: Stem Borer
  {
    rule_id: 'C_FRUIT_MANGO_PEST_004',
    category: 'pest',
    crop_code: 'mango',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Batocera rufomaculata bores into main trunk. Sawdust at bore holes is diagnostic sign.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FRUIT_MANGO_DISEASE_001: Powdery Mildew
  {
    rule_id: 'C_FRUIT_MANGO_DISEASE_001',
    category: 'disease',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 9,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Oidium mangiferae causes white powdery growth on flowers and young fruits. 15-25°C with 60-80% RH favors spread. Can cause 70-80% crop loss.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_DISEASE_002: Anthracnose
  {
    rule_id: 'C_FRUIT_MANGO_DISEASE_002',
    category: 'disease',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Colletotrichum gloeosporioides causes flower blight and fruit rot. Spreads in rainy weather.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_DISEASE_003: Bacterial Canker
  {
    rule_id: 'C_FRUIT_MANGO_DISEASE_003',
    category: 'disease',
    crop_code: 'mango',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.RAIN_ACTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Xanthomonas citri pv. mangiferaeindicae causes water-soaked lesions on leaves and fruits.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ENVIRONMENTAL STRESS
  // ─────────────────────────────────────────────────────────────────────────

  // C_FRUIT_MANGO_HEAT_001: Fruit Drop
  {
    rule_id: 'C_FRUIT_MANGO_HEAT_001',
    category: 'temperature',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.HEAT_STRESS,
    priority: 8,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'High temperature (>40°C) during fruit development causes physiological fruit drop. Optimum is 24-27°C.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_WATER_001: Flowering Stage
  {
    rule_id: 'C_FRUIT_MANGO_WATER_001',
    category: 'water',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Avoid irrigation during flowering but resume during fruit development.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },

  // C_FRUIT_MANGO_NUTRIENT_001: Potassium for Fruit Quality
  {
    rule_id: 'C_FRUIT_MANGO_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'mango',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'mango' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Potassium improves fruit size, color, and TSS. Apply 500g K2O/tree for bearing trees.',
    icar_package: 'ICAR-CISH Mango PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BANANA RULES (12+ rules)
// Source: ICAR-NRCB Trichy
// ═══════════════════════════════════════════════════════════════════════════

export const BANANA_RULES: CauseRule[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // DISEASE RULES - Critical for Banana
  // ─────────────────────────────────────────────────────────────────────────

  // C_FRUIT_BANANA_DISEASE_001: Panama Disease (Fusarium Wilt TR4)
  {
    rule_id: 'C_FRUIT_BANANA_DISEASE_001',
    category: 'disease',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.ROOT_ROT_RISK,
    priority: 10,
    scientific_source: 'ICAR-NRCB Trichy',
    scientific_basis: 'Fusarium oxysporum f.sp. cubense TR4 is most destructive. No chemical cure. Spreads through contaminated soil and water. Cavendish highly susceptible.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_DISEASE_002: Sigatoka Leaf Spot
  {
    rule_id: 'C_FRUIT_BANANA_DISEASE_002',
    category: 'disease',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Mycosphaerella fijiensis (Black Sigatoka) and M. musicola (Yellow Sigatoka) reduce photosynthetic area by 50%.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_DISEASE_003: Bacterial Wilt (Moko)
  {
    rule_id: 'C_FRUIT_BANANA_DISEASE_003',
    category: 'disease',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Ralstonia solanacearum causes rapid wilting. Spread through infected tools and insects.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_DISEASE_004: Bunchy Top Virus
  {
    rule_id: 'C_FRUIT_BANANA_DISEASE_004',
    category: 'disease',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'BBTV transmitted by banana aphid. Causes stunting and no bunch formation. Use tissue culture plantlets.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // PEST RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FRUIT_BANANA_PEST_001: Pseudostem Weevil
  {
    rule_id: 'C_FRUIT_BANANA_PEST_001',
    category: 'pest',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Odoiporus longicollis bores into pseudostem causing yellowing and snapping. Jelly-like sap exudation is sign.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_PEST_002: Rhizome Weevil
  {
    rule_id: 'C_FRUIT_BANANA_PEST_002',
    category: 'pest',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Cosmopolites sordidus larvae bore into corm reducing nutrient uptake.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NUTRIENT AND WATER RULES
  // ─────────────────────────────────────────────────────────────────────────

  // C_FRUIT_BANANA_NUTRIENT_001: Potassium Critical
  {
    rule_id: 'C_FRUIT_BANANA_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'banana',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Banana is heavy K feeder. Deficiency causes bunch choking, finger cracking. Apply 200g K2O/plant.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_NUTRIENT_002: Nitrogen for Vegetative Growth
  {
    rule_id: 'C_FRUIT_BANANA_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Nitrogen promotes leaf production and pseudostem development. Apply 200g N/plant in 4 splits.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_WATER_001: Critical Stress
  {
    rule_id: 'C_FRUIT_BANANA_WATER_001',
    category: 'water',
    crop_code: 'banana',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Banana requires 1800-2000mm water/year. Stress causes leaf folding, delayed flowering, small bunch.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },

  // C_FRUIT_BANANA_WATER_002: Bunch Emergence
  {
    rule_id: 'C_FRUIT_BANANA_WATER_002',
    category: 'water',
    crop_code: 'banana',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'banana' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Bunch emergence to harvest is most critical. Stress causes bunch choking and poor filling.',
    icar_package: 'ICAR-NRCB Banana PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// CITRUS RULES (10+ rules)
// Source: ICAR-CCRI Nagpur
// ═══════════════════════════════════════════════════════════════════════════

export const CITRUS_RULES: CauseRule[] = [
  // C_FRUIT_CITRUS_DISEASE_001: Citrus Greening (HLB)
  {
    rule_id: 'C_FRUIT_CITRUS_DISEASE_001',
    category: 'disease',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.VIRAL_DISEASE_RISK,
    priority: 10,
    scientific_source: 'ICAR-CCRI Nagpur',
    scientific_basis: 'Candidatus Liberibacter asiaticus causes asymmetric leaf yellowing, lopsided fruits. Transmitted by Asian citrus psyllid. No cure - remove infected trees.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_DISEASE_002: Phytophthora Root Rot
  {
    rule_id: 'C_FRUIT_CITRUS_DISEASE_002',
    category: 'disease',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Phytophthora nicotianae causes gummosis and root rot. Avoid waterlogging, use resistant rootstocks.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_DISEASE_003: Citrus Canker
  {
    rule_id: 'C_FRUIT_CITRUS_DISEASE_003',
    category: 'disease',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Xanthomonas citri causes raised corky lesions on leaves, twigs, fruits. Spreads in rainy weather through wind-driven rain.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_PEST_001: Citrus Psyllid
  {
    rule_id: 'C_FRUIT_CITRUS_PEST_001',
    category: 'pest',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 9,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Diaphorina citri transmits HLB. Monitor new flush. ETL: 8-10 adults or nymphs per flush.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_PEST_002: Citrus Mite
  {
    rule_id: 'C_FRUIT_CITRUS_PEST_002',
    category: 'pest',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.MITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Rust mite (Phyllocoptruta oleivora) causes fruit russeting. Active in hot dry weather.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_PEST_003: Citrus Leaf Miner
  {
    rule_id: 'C_FRUIT_CITRUS_PEST_003',
    category: 'pest',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Phyllocnistis citrella mines serpentine tunnels in young leaves. Creates entry for canker bacteria.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_WATER_001: Fruit Development
  {
    rule_id: 'C_FRUIT_CITRUS_WATER_001',
    category: 'water',
    crop_code: 'citrus',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Water stress during fruit development causes fruit drop and small fruit size.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },

  // C_FRUIT_CITRUS_NUTRIENT_001: Zinc Deficiency
  {
    rule_id: 'C_FRUIT_CITRUS_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Zinc deficiency causes mottled leaves and small pointed fruits. Spray ZnSO4 0.5%.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// GRAPES RULES (8+ rules)
// Source: ICAR-NRC Grapes Pune
// ═══════════════════════════════════════════════════════════════════════════

export const GRAPES_RULES: CauseRule[] = [
  // C_FRUIT_GRAPES_DISEASE_001: Downy Mildew
  {
    rule_id: 'C_FRUIT_GRAPES_DISEASE_001',
    category: 'disease',
    crop_code: 'grapes',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.DOWNY_MILDEW_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRC Grapes Pune',
    scientific_basis: 'Plasmopara viticola causes oil spots on leaves and white growth on underside. >95% RH with 20-25°C ideal.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },

  // C_FRUIT_GRAPES_DISEASE_002: Powdery Mildew
  {
    rule_id: 'C_FRUIT_GRAPES_DISEASE_002',
    category: 'disease',
    crop_code: 'grapes',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 8,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Uncinula necator causes white powdery growth. Unlike downy mildew, favored by dry conditions with moderate humidity.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },

  // C_FRUIT_GRAPES_DISEASE_003: Anthracnose
  {
    rule_id: 'C_FRUIT_GRAPES_DISEASE_003',
    category: 'disease',
    crop_code: 'grapes',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Elsinoe ampelina causes bird-eye spots on berries. Spreads in rainy weather.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },

  // C_FRUIT_GRAPES_PEST_001: Flea Beetle
  {
    rule_id: 'C_FRUIT_GRAPES_PEST_001',
    category: 'pest',
    crop_code: 'grapes',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Scelodonta strigicollis damages newly sprouting buds. Active at pruning time.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },

  // C_FRUIT_GRAPES_PEST_002: Thrips
  {
    rule_id: 'C_FRUIT_GRAPES_PEST_002',
    category: 'pest',
    crop_code: 'grapes',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.THRIPS_RISK,
    priority: 7,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Thrips cause scarring on berries reducing market quality.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },

  // C_FRUIT_GRAPES_WATER_001: Berry Development
  {
    rule_id: 'C_FRUIT_GRAPES_WATER_001',
    category: 'water',
    crop_code: 'grapes',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Water stress during berry development causes poor size and TSS.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },

  // C_FRUIT_GRAPES_NUTRIENT_001: Potassium for Quality
  {
    rule_id: 'C_FRUIT_GRAPES_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'grapes',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Potassium improves TSS, color development, and post-harvest life.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// POMEGRANATE RULES (6+ rules)
// Source: ICAR-NRC Pomegranate Solapur
// ═══════════════════════════════════════════════════════════════════════════

export const POMEGRANATE_RULES: CauseRule[] = [
  // C_FRUIT_POMEGRANATE_DISEASE_001: Bacterial Blight (Oily Spot)
  {
    rule_id: 'C_FRUIT_POMEGRANATE_DISEASE_001',
    category: 'disease',
    crop_code: 'pomegranate',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'pomegranate' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.BACTERIAL_WILT_RISK,
    priority: 10,
    scientific_source: 'ICAR-NRC Pomegranate Solapur',
    scientific_basis: 'Xanthomonas axonopodis pv. punicae causes oily spots on leaves and fruit cracking. Devastating during monsoon.',
    icar_package: 'ICAR-NRC Pomegranate PoP 2024'
  },

  // C_FRUIT_POMEGRANATE_DISEASE_002: Wilt
  {
    rule_id: 'C_FRUIT_POMEGRANATE_DISEASE_002',
    category: 'disease',
    crop_code: 'pomegranate',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'pomegranate' &&
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.ROOT_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-NRC Pomegranate',
    scientific_basis: 'Ceratocystis fimbriata causes sudden wilting. Spread through beetles and infected pruning tools.',
    icar_package: 'ICAR-NRC Pomegranate PoP 2024'
  },

  // C_FRUIT_POMEGRANATE_PEST_001: Fruit Borer
  {
    rule_id: 'C_FRUIT_POMEGRANATE_PEST_001',
    category: 'pest',
    crop_code: 'pomegranate',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'pomegranate' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FRUIT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-NRC Pomegranate',
    scientific_basis: 'Deudorix isocrates bores into developing fruits. ETL: 2-5% fruit damage.',
    icar_package: 'ICAR-NRC Pomegranate PoP 2024'
  },

  // C_FRUIT_POMEGRANATE_PEST_002: Aphid
  {
    rule_id: 'C_FRUIT_POMEGRANATE_PEST_002',
    category: 'pest',
    crop_code: 'pomegranate',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'pomegranate' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-NRC Pomegranate',
    scientific_basis: 'Aphis punicae causes leaf curling on new growth.',
    icar_package: 'ICAR-NRC Pomegranate PoP 2024'
  },

  // C_FRUIT_POMEGRANATE_WATER_001: Fruit Cracking
  {
    rule_id: 'C_FRUIT_POMEGRANATE_WATER_001',
    category: 'water',
    crop_code: 'pomegranate',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'pomegranate' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-NRC Pomegranate',
    scientific_basis: 'Irregular irrigation causes fruit cracking. Maintain uniform soil moisture.',
    icar_package: 'ICAR-NRC Pomegranate PoP 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL FRUITS FALLBACK RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_FRUITS_RULES: CauseRule[] = [
  // C_FRUIT_ALL_WATER_001: General Water Stress
  {
    rule_id: 'C_FRUIT_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR Fruit Crops',
    scientific_basis: 'Fruit crops have high water demand especially during fruit development.'
  },

  // C_FRUIT_ALL_NUTRIENT_001: Potassium for Quality
  {
    rule_id: 'C_FRUIT_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR',
    scientific_basis: 'Potassium is critical for fruit quality, size, and sweetness in all fruit crops.'
  },

  // C_FRUIT_ALL_HEALTHY_001: Optimal Growth
  {
    rule_id: 'C_FRUIT_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_FRUITS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.HEALTHY || input.ndvi_state === NDVIState.EXCELLENT) &&
      input.ndvi_trend !== NDVITrend.DECLINING,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR',
    scientific_basis: 'Healthy NDVI indicates good orchard health and fruit development.'
  },

  // C_FRUIT_ALL_HEALTHY_002: Recovery Trend
  {
    rule_id: 'C_FRUIT_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_FRUITS',
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
// PAPAYA RULES (10 rules) - ICAR-IIHR Standards
// ═══════════════════════════════════════════════════════════════════════════

export const PAPAYA_RULES: CauseRule[] = [
  {
    rule_id: 'C_FRUIT_PAPAYA_DISEASE_001',
    category: 'disease',
    crop_code: 'papaya',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'papaya' &&
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PAPAYA_RING_SPOT_VIRUS_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Papaya Ring Spot Virus (PRSV) is devastating with no cure. Control aphid vectors, rogue infected plants.',
    icar_package: 'ICAR-IIHR Papaya PoP'
  },
  {
    rule_id: 'C_FRUIT_PAPAYA_PEST_001',
    category: 'pest',
    crop_code: 'papaya',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'papaya' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PAPAYA_MEALYBUG_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Papaya mealybug (Paracoccus marginatus) causes stunting. Release Acerophagus papayae parasitoid.',
    icar_package: 'ICAR-IIHR Papaya IPM'
  },
  {
    rule_id: 'C_FRUIT_PAPAYA_DISEASE_002',
    category: 'disease',
    crop_code: 'papaya',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'papaya' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.PAPAYA_STEM_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Phytophthora stem rot in waterlogged conditions. Ensure drainage, apply Metalaxyl drenching.',
    icar_package: 'ICAR-IIHR Papaya Disease Management'
  },
  {
    rule_id: 'C_FRUIT_PAPAYA_PEST_002',
    category: 'pest',
    crop_code: 'papaya',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'papaya' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.PAPAYA_FRUIT_FLY_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIHR',
    scientific_basis: 'Fruit fly attacks ripening fruits. Use methyl eugenol traps, bagging fruits.',
    icar_package: 'ICAR-IIHR Papaya IPM'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// GUAVA RULES (10 rules) - ICAR-CISH Standards
// ═══════════════════════════════════════════════════════════════════════════

export const GUAVA_RULES: CauseRule[] = [
  {
    rule_id: 'C_FRUIT_GUAVA_DISEASE_001',
    category: 'disease',
    crop_code: 'guava',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'guava' &&
      input.ndvi_state === NDVIState.CRITICAL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.GUAVA_WILT_RISK,
    priority: 10,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Guava wilt (Fusarium oxysporum f.sp. psidii) is devastating. No cure - use resistant rootstocks, soil solarization.',
    icar_package: 'ICAR-CISH Guava Wilt Management'
  },
  {
    rule_id: 'C_FRUIT_GUAVA_PEST_001',
    category: 'pest',
    crop_code: 'guava',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'guava' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.GUAVA_FRUIT_FLY_RISK,
    priority: 8,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Fruit fly (Bactrocera dorsalis) causes major post-harvest losses. Use methyl eugenol traps, fruit bagging.',
    icar_package: 'ICAR-CISH Guava IPM'
  },
  {
    rule_id: 'C_FRUIT_GUAVA_DISEASE_002',
    category: 'disease',
    crop_code: 'guava',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'guava' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.GUAVA_ANTHRACNOSE_RISK,
    priority: 7,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Anthracnose causes fruit rot in rainy season. Spray Carbendazim 0.1% before and after flowering.',
    icar_package: 'ICAR-CISH Guava Disease Management'
  },
  {
    rule_id: 'C_FRUIT_GUAVA_PEST_002',
    category: 'pest',
    crop_code: 'guava',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'guava' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.GUAVA_BARK_EATING_CATERPILLAR_RISK,
    priority: 6,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Bark eating caterpillar damages trunk. Clean galleries, inject Dichlorvos, plug holes.',
    icar_package: 'ICAR-CISH Guava IPM'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// APPLE RULES (10 rules) - ICAR-CITH Srinagar Standards
// ═══════════════════════════════════════════════════════════════════════════

export const APPLE_RULES: CauseRule[] = [
  {
    rule_id: 'C_FRUIT_APPLE_DISEASE_001',
    category: 'disease',
    crop_code: 'apple',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'apple' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.APPLE_SCAB_RISK,
    priority: 9,
    scientific_source: 'ICAR-CITH Srinagar',
    scientific_basis: 'Apple scab (Venturia inaequalis) major disease in humid conditions. Spray Mancozeb+Carbendazim prophylactically.',
    icar_package: 'ICAR-CITH Apple PoP'
  },
  {
    rule_id: 'C_FRUIT_APPLE_PEST_001',
    category: 'pest',
    crop_code: 'apple',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'apple' &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.APPLE_WOOLLY_APHID_RISK,
    priority: 8,
    scientific_source: 'ICAR-CITH',
    scientific_basis: 'Woolly aphid causes galls on roots and shoots. Use resistant rootstocks (MM series), release Aphelinus mali.',
    icar_package: 'ICAR-CITH Apple IPM'
  },
  {
    rule_id: 'C_FRUIT_APPLE_DISEASE_002',
    category: 'disease',
    crop_code: 'apple',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'apple' &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.APPLE_FIRE_BLIGHT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CITH',
    scientific_basis: 'Fire blight (Erwinia amylovora) bacterial disease. Prune infected shoots, spray Streptocycline.',
    icar_package: 'ICAR-CITH Apple Disease Management'
  },
  {
    rule_id: 'C_FRUIT_APPLE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'apple',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'apple' &&
      input.soil_states.k === SoilKState.LOW_K,
    cause: Cause.APPLE_BITTER_PIT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CITH',
    scientific_basis: 'Bitter pit is calcium deficiency disorder. Spray Calcium Chloride 0.5% at fruit development.',
    icar_package: 'ICAR-CITH Apple Nutrition'
  },
  {
    rule_id: 'C_FRUIT_APPLE_PEST_002',
    category: 'pest',
    crop_code: 'apple',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'apple' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.APPLE_CODLING_MOTH_RISK,
    priority: 8,
    scientific_source: 'ICAR-CITH',
    scientific_basis: 'Codling moth larvae bore into fruits. Use pheromone traps, spray Carbaryl at petal fall.',
    icar_package: 'ICAR-CITH Apple IPM'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED FRUITS RULES
// ═══════════════════════════════════════════════════════════════════════════

export const FRUITS_RULES: CauseRule[] = [
  ...MANGO_RULES,
  ...BANANA_RULES,
  ...CITRUS_RULES,
  ...GRAPES_RULES,
  ...POMEGRANATE_RULES,
  ...PAPAYA_RULES,
  ...GUAVA_RULES,
  ...APPLE_RULES,
  ...ALL_FRUITS_RULES
];

export default FRUITS_RULES;
