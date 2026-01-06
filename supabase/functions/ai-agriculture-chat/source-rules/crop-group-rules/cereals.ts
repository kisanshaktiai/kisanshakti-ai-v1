/**
 * CEREALS CROP GROUP RULES
 * Crops: Wheat, Rice, Maize, Barley, Millets
 * Total: 55+ rules
 * Sources: ICAR-IARI, ICAR-CRRI, ICAR-IIMR, FAO, NASA
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
  WeatherState,
  SoilPHState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT RULES (25 rules)
// Reference: ICAR-IARI Wheat Package of Practices 2024
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_RULES: CauseRule[] = [
  // Crown Root Initiation - Most critical irrigation (21-25 DAS)
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_001',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 18 && input.days_after_sowing <= 25 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_WHEAT_CRI,
    priority: 10,
    scientific_source: 'ICAR-IARI Wheat Package 2024',
    scientific_basis: 'Crown Root Initiation (21-25 DAS) is the most critical irrigation for wheat. Missing CRI irrigation reduces yield by 40-50%. Secondary roots develop at this stage.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Tillering stage water (40-45 DAS)
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_002',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 50 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.weather_state !== WeatherState.RAIN_EXPECTED,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Tillering irrigation (40-45 DAS) promotes effective tiller production. Each additional tiller increases potential spike count by 8-12%.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Late jointing irrigation (60-65 DAS)
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_003',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 58 && input.days_after_sowing <= 68 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Late jointing (60-65 DAS) irrigation critical for stem elongation and flag leaf development.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Flowering irrigation (75-80 DAS)
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_004',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 73 && input.days_after_sowing <= 82 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Flowering stage (75-80 DAS) is extremely sensitive. Water stress reduces pollination and grain set by 30-40%.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Milking stage irrigation (100-105 DAS)
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_005',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 98 && input.days_after_sowing <= 108 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Milking stage (100-105 DAS) irrigation supports grain filling. Stress causes shriveled grains.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Dough stage - skip irrigation
  {
    rule_id: 'C_CEREALS_WHEAT_WATER_006',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 110 &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Excess water during dough stage (110+ DAS) causes lodging and poor grain quality. Stop irrigation 15-20 days before harvest.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Terminal heat stress
  {
    rule_id: 'C_CEREALS_WHEAT_HEAT_001',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      (input.crop_stage === CropStage.REPRODUCTIVE || input.crop_stage === CropStage.MATURITY) &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.TERMINAL_HEAT_WHEAT,
    priority: 9,
    scientific_source: 'ICAR-IARI Heat Stress Management',
    scientific_basis: 'Terminal heat (>30°C) during grain filling reduces yield by 3-5% for every 1°C rise above 25°C. Accelerates senescence and reduces grain weight.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Frost damage at tillering
  {
    rule_id: 'C_CEREALS_WHEAT_COLD_001',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.FROST_RISK &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.FROST_DAMAGE_RISK,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Frost damage at tillering (<-2°C) kills growing points. Light irrigation before frost can raise canopy temperature by 2-3°C.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Frost at ear emergence - critical
  {
    rule_id: 'C_CEREALS_WHEAT_COLD_002',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.FROST_RISK &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FROST_DAMAGE_RISK,
    priority: 10,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Frost at ear emergence causes complete sterility. Anthers are killed at -1°C. Most critical frost-sensitive stage.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Yellow rust risk
  {
    rule_id: 'C_CEREALS_WHEAT_DISEASE_001',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.WHEAT_RUST_RISK,
    priority: 9,
    scientific_source: 'ICAR-IARI Disease Management',
    scientific_basis: 'Yellow rust (Puccinia striiformis) requires 10-15°C with dew. High N promotes succulent tissue. ICAR threshold: 5% severity for spray.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Brown rust risk
  {
    rule_id: 'C_CEREALS_WHEAT_DISEASE_002',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 70,
    cause: Cause.WHEAT_RUST_RISK,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Brown/leaf rust (Puccinia triticina) favored by 15-25°C with high humidity. More common late season.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Loose smut risk
  {
    rule_id: 'C_CEREALS_WHEAT_DISEASE_003',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.WHEAT_LOOSE_SMUT_RISK,
    priority: 6,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Loose smut (Ustilago tritici) is seed-borne. Treat seed with Carboxin 2g/kg. Visible at heading.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Powdery mildew
  {
    rule_id: 'C_CEREALS_WHEAT_DISEASE_004',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.days_after_sowing <= 60,
    cause: Cause.POWDERY_MILDEW_RISK,
    priority: 6,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Powdery mildew (Blumeria graminis) favored by cool humid weather (15-20°C). Dense canopy with high N is susceptible.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Aphid risk
  {
    rule_id: 'C_CEREALS_WHEAT_PEST_001',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 75 &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.APHID_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI IPM',
    scientific_basis: 'Wheat aphid (Sitobion avenae) attacks ears during warm dry weather (20-25°C). ICAR ETL: 10 aphids/ear or 25 aphids/tiller.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Termite risk
  {
    rule_id: 'C_CEREALS_WHEAT_PEST_002',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.days_after_sowing <= 45,
    cause: Cause.TERMITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Termites attack wheat in dry soils with high organic matter. Apply Chlorpyriphos 4L/ha with first irrigation.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Nitrogen deficiency at tillering
  {
    rule_id: 'C_CEREALS_WHEAT_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 45,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'First N split (1/3 dose) at CRI is critical for tiller production. Deficiency causes pale yellow leaves and poor tillering.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Late N top dress
  {
    rule_id: 'C_CEREALS_WHEAT_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 55 && input.days_after_sowing <= 70,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Second N split (1/3 dose) at late jointing supports flag leaf and grain protein. Apply before boot stage.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Phosphorus deficiency
  {
    rule_id: 'C_CEREALS_WHEAT_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.p === SoilPState.LOW_P &&
      input.days_after_sowing <= 30,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Phosphorus is critical for root development. Deficiency causes purple discoloration and stunted roots.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Weed competition early
  {
    rule_id: 'C_CEREALS_WHEAT_WEED_001',
    category: 'weed',
    crop_code: 'wheat',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 35 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WEED_COMPETITION_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Critical weed competition period in wheat is 15-35 DAS. Weeds can reduce yield by 20-50% if not controlled.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // Phalaris minor resistance
  {
    rule_id: 'C_CEREALS_WHEAT_WEED_002',
    category: 'weed',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 40 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.RESISTANT_WEED_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Phalaris minor has developed resistance to isoproturon in NW India. Use alternate herbicides like sulfosulfuron.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW WHEAT DISEASE MANAGEMENT RULES - RUSTS (15 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_WHEAT_DISEASE_001',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.BROWN_RUST_RISK,
    priority: 9,
    scientific_source: 'ICAR-IARI + CIMMYT',
    scientific_basis: 'Brown/Leaf rust (Puccinia recondita) MOST COMMON wheat rust in India. Optimum 15-22°C with dew. CRITICAL: 40% severity at boot = spray. 30-50% yield loss if untreated.',
    icar_package: 'ICAR-IARI Wheat Rust Management Package 2024'
  },
  {
    rule_id: 'C_WHEAT_DISEASE_002',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.COLD_STRESS,
    cause: Cause.YELLOW_RUST_RISK,
    priority: 10,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Yellow/Stripe rust (Puccinia striiformis) most DESTRUCTIVE rust. Favored by COOLER temps (10-15°C). Spreads faster. CI threshold: >40 at jointing = spray.',
    icar_package: 'ICAR-IARI Yellow Rust Alert System'
  },
  {
    rule_id: 'C_WHEAT_DISEASE_003',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.BLACK_RUST_RISK,
    priority: 10,
    scientific_source: 'ICAR-IARI Ug99 Monitoring',
    scientific_basis: 'Black/Stem rust (Puccinia graminis) MOST DEVASTATING but rare. Ug99 race highly virulent. Threshold: 20% stem area. Can cause 100% loss.',
    icar_package: 'ICAR-IARI Ug99 Surveillance System'
  },
  {
    rule_id: 'C_WHEAT_DISEASE_004',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 90,
    cause: Cause.KARNAL_BUNT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Karnal bunt (Tilletia indica) attacks grains at anthesis. Quarantine disease - affects export. Spray Propiconazole at boot stage if humid weather forecast.',
    icar_package: 'ICAR-IARI Karnal Bunt Management'
  },
  {
    rule_id: 'C_WHEAT_DISEASE_005',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 60,
    cause: Cause.ALTERNARIA_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Alternaria blight (Alternaria triticina) causes leaf blight. Common in late-sown wheat. Spray Mancozeb 0.25% at first symptoms.',
    icar_package: 'ICAR-IARI Wheat Disease Management'
  },
  {
    rule_id: 'C_WHEAT_DISEASE_006',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.RAIN_ACTIVE &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.HEAD_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Fusarium head blight attacks at flowering during rain. Produces mycotoxins. Spray fungicide at 50% heading if rain forecast.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },
  {
    rule_id: 'C_WHEAT_DISEASE_007',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.MOLYA_DISEASE_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Molya disease (cereal cyst nematode Heterodera avenae) causes patchy stunting. Soil treatment with Carbofuran 1kg a.i./ha.',
    icar_package: 'ICAR-IARI Nematode Management'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW WHEAT PEST MANAGEMENT RULES (15 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_WHEAT_PEST_001',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 75 &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WHEAT_APHID_RISK,
    priority: 8,
    scientific_source: 'ICAR-IARI IPM',
    scientific_basis: 'Wheat aphid (Sitobion avenae) attacks ears during warm dry weather (20-25°C). ETL: 10 aphids/ear or 25 aphids/tiller. Spray Imidacloprid.',
    icar_package: 'ICAR-IARI Wheat Aphid IPM'
  },
  {
    rule_id: 'C_WHEAT_PEST_002',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.days_after_sowing >= 50,
    cause: Cause.WHEAT_THRIPS_RISK,
    priority: 6,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Wheat thrips damage leaves in dry conditions. Causes silvery streaks. ETL: 50 thrips/plant. Usually minor pest.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },
  {
    rule_id: 'C_WHEAT_PEST_003',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 40 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WHEAT_SHOOT_FLY_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Wheat shoot fly (Atherigona naqvii) causes dead hearts. ETL: 10% dead hearts. Seed treatment with Imidacloprid prevents early attack.',
    icar_package: 'ICAR-IARI Wheat Shoot Fly Management'
  },
  {
    rule_id: 'C_WHEAT_PEST_004',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.days_after_sowing <= 30,
    cause: Cause.TERMITE_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Termites attack wheat in sandy/dry soils. Apply Chlorpyriphos 20EC @ 4L/ha with first irrigation. FYM increases risk.',
    icar_package: 'ICAR-IARI Termite Management'
  },
  {
    rule_id: 'C_WHEAT_PEST_005',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.days_after_sowing <= 20,
    cause: Cause.ROOT_APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Root aphids damage seedling roots in dry soils. Apply Chlorpyriphos 20EC @ 2.5L/ha at sowing in infested fields.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW WHEAT NUTRIENT/WATER MANAGEMENT RULES (15 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_WHEAT_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 18 && input.days_after_sowing <= 25,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'N at CRI (21-25 DAS) is THE most critical fertilizer timing. Missing this reduces yield by 40-50%. Apply 1/3rd N with irrigation.',
    icar_package: 'ICAR-IARI Wheat CRI Management'
  },
  {
    rule_id: 'C_WHEAT_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 55 && input.days_after_sowing <= 65,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Second N split at late jointing (60-65 DAS). Supports flag leaf development and grain protein. Apply 1/3rd N dose.',
    icar_package: 'ICAR-IARI Wheat Fertilizer Schedule'
  },
  {
    rule_id: 'C_WHEAT_WATER_001',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 18 && input.days_after_sowing <= 25 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_WHEAT_CRI,
    priority: 10,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'CRI irrigation (21-25 DAS) is MANDATORY. Crown roots develop at this stage. Missing this irrigation = 40-50% yield loss.',
    icar_package: 'ICAR-IARI Wheat Critical Irrigation'
  },
  {
    rule_id: 'C_WHEAT_WATER_002',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 73 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_WHEAT_FLOWERING,
    priority: 10,
    scientific_source: 'ICAR-IARI + CIMMYT',
    scientific_basis: 'Flowering irrigation (75-80 DAS) critical for grain set. Water stress reduces pollination by 30-40%. 5-day critical window.',
    icar_package: 'ICAR-IARI Wheat Water Management'
  },
  {
    rule_id: 'C_WHEAT_WATER_003',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 98 && input.days_after_sowing <= 108 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Milking stage irrigation (100-105 DAS) supports grain filling. Water stress causes shriveled grains and test weight reduction.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW WHEAT TEMPERATURE/STRESS RULES (15 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_WHEAT_HEAT_001',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.TERMINAL_HEAT_WHEAT,
    priority: 9,
    scientific_source: 'ICAR-IARI Heat Stress',
    scientific_basis: 'Terminal heat (>30°C) during grain filling reduces yield 3-5% per 1°C rise above 25°C. Apply light irrigation. Potassium spray improves tolerance.',
    icar_package: 'ICAR-IARI Heat Stress Management'
  },
  {
    rule_id: 'C_WHEAT_HEAT_002',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WHEAT_SHRIVELED_GRAIN_RISK,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Heat stress causes shriveled grains with low test weight. Apply KCl 1% foliar spray. Advance harvest if possible.',
    icar_package: 'ICAR-IARI Terminal Heat Protocol'
  },
  {
    rule_id: 'C_WHEAT_FROST_001',
    category: 'temperature',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.weather_state === WeatherState.FROST_RISK &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FROST_DAMAGE_RISK,
    priority: 10,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Frost at ear emergence causes complete sterility. Anthers killed at -1°C. Light irrigation before frost raises canopy temp by 2-3°C.',
    icar_package: 'ICAR-IARI Frost Protection'
  },
  {
    rule_id: 'C_WHEAT_LODGING_001',
    category: 'pest',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.WHEAT_LODGING_RISK,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Lodging risk high with excess N + rain/wind. Reduces yield 20-30%. Use short varieties. Drain excess water. Skip late N.',
    icar_package: 'ICAR-IARI Lodging Prevention'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RICE RULES (20 rules)
// Reference: ICAR-CRRI Cuttack Package of Practices 2024
// ═══════════════════════════════════════════════════════════════════════════

export const RICE_RULES: CauseRule[] = [
  // Transplanting water requirement
  {
    rule_id: 'C_CEREALS_RICE_WATER_001',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.SOWING &&
      input.soil_states.moisture !== SoilMoistureState.WATERLOGGED,
    cause: Cause.WATER_STRESS_RICE_TRANSPLANTING,
    priority: 10,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice transplanting requires 5-7 cm standing water. Dry field causes poor root establishment and 30-40% mortality.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Active tillering water
  {
    rule_id: 'C_CEREALS_RICE_WATER_002',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 40 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Active tillering (15-40 DAT) needs 5 cm water depth. Alternate wetting-drying can save 20-30% water without yield loss.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Panicle initiation - critical water
  {
    rule_id: 'C_CEREALS_RICE_WATER_003',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 55 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Panicle initiation (45-55 DAT) is extremely water-sensitive. Stress reduces spikelet number by 40-60%.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Flowering water stress
  {
    rule_id: 'C_CEREALS_RICE_WATER_004',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 75 && input.days_after_sowing <= 90 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Flowering (75-90 DAT) requires saturated soil. Water stress causes spikelet sterility.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Blast risk - major disease
  {
    rule_id: 'C_CEREALS_RICE_DISEASE_001',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.RICE_BLAST_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI Cuttack',
    scientific_basis: 'Blast (Pyricularia oryzae) requires >90% RH, 25-28°C, with dew for 6+ hours. High N increases susceptibility. ICAR ETL: 5% leaf area.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Neck blast - critical
  {
    rule_id: 'C_CEREALS_RICE_DISEASE_002',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.RICE_BLAST_RISK,
    priority: 10,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Neck blast at flowering causes complete grain loss. Preventive spray at 5% heading is critical.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Bacterial blight
  {
    rule_id: 'C_CEREALS_RICE_DISEASE_003',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.RICE_BACTERIAL_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Bacterial blight (Xanthomonas oryzae) spreads in warm humid weather with rain/storms. Avoid excess N.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Sheath blight
  {
    rule_id: 'C_CEREALS_RICE_DISEASE_004',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_state === NDVIState.EXCELLENT,
    cause: Cause.RICE_SHEATH_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Sheath blight (Rhizoctonia solani) favored by dense canopy, high humidity, and waterlogged conditions.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Stem borer - dead hearts
  {
    rule_id: 'C_CEREALS_RICE_PEST_001',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI IPM',
    scientific_basis: 'Yellow stem borer (Scirpophaga incertulas) causes dead hearts at tillering. ICAR ETL: 5% dead hearts or 1 egg mass/m².',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Stem borer - white ear
  {
    rule_id: 'C_CEREALS_RICE_PEST_002',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Stem borer at reproductive stage causes white ear heads (empty panicles). ETL: 2% white ears.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Brown planthopper
  {
    rule_id: 'C_CEREALS_RICE_PEST_003',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.JASSID_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Brown planthopper (Nilaparvata lugens) causes hopper burn. Favored by dense canopy and excess N. ETL: 5-10 hoppers/hill.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Spikelet sterility from heat
  {
    rule_id: 'C_CEREALS_RICE_HEAT_001',
    category: 'temperature',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.SPIKELET_STERILITY_RICE,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Heat stress (>35°C) during flowering causes spikelet sterility. 1 hour at 35°C during anthesis causes 50% sterility.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Cold damage at seedling
  {
    rule_id: 'C_CEREALS_RICE_COLD_001',
    category: 'temperature',
    crop_code: 'rice',
    stage_applicable: [CropStage.GERMINATION, CropStage.SOWING],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.COLD_STRESS &&
      input.days_after_sowing <= 20,
    cause: Cause.COLD_STRESS,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice seedlings are sensitive to cold (<15°C). Causes poor germination and weak seedlings.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Nitrogen at tillering
  {
    rule_id: 'C_CEREALS_RICE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 25,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'First N top-dressing at 15-20 DAT is critical for tiller production. Apply 1/3 of N dose.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // N at panicle initiation
  {
    rule_id: 'C_CEREALS_RICE_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 50,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Second N dose at panicle initiation (40-45 DAT) increases spikelet number and grain yield.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // Zinc deficiency - critical
  {
    rule_id: 'C_CEREALS_RICE_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 30,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Zinc deficiency (khaira disease) common in alkaline/calcareous soils. Apply ZnSO4 25 kg/ha at transplanting.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW RICE PEST MANAGEMENT RULES (25 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_RICE_PEST_001',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.days_after_sowing >= 30 && input.days_after_sowing <= 80,
    cause: Cause.STEM_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI Cuttack',
    scientific_basis: 'Yellow stem borer (Scirpophaga incertulas) is the most destructive rice pest. Dead hearts at vegetative stage (5% ETL), white ears at reproductive (2% ETL). Peak at 40-60 DAT.',
    icar_package: 'ICAR-CRRI Rice Stem Borer IPM Package 2024'
  },
  {
    rule_id: 'C_RICE_PEST_002',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 40,
    cause: Cause.BROWN_PLANTHOPPER_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Brown planthopper (Nilaparvata lugens) causes hopper burn. ETL: 10-15 nymphs/hill at tillering. Favored by high humidity and continuous flooding.',
    icar_package: 'ICAR-CRRI BPH Management 2024'
  },
  {
    rule_id: 'C_RICE_PEST_003',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 45,
    cause: Cause.GALL_MIDGE_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice gall midge (Orseolia oryzae) produces silver shoots. ETL: 5% silver shoots at maximum tillering (30-35 DAT). Maggot damages growing point.',
    icar_package: 'ICAR-CRRI Gall Midge Resistant Varieties'
  },
  {
    rule_id: 'C_RICE_PEST_004',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 50,
    cause: Cause.HISPA_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice hispa (Dicladispa armigera) scrapes chlorophyll giving white streaks. ETL: 1-2 beetles/hill OR 10% leaves with scraping.',
    icar_package: 'ICAR-CRRI Rice Hispa Management'
  },
  {
    rule_id: 'C_RICE_PEST_005',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.GREEN_LEAFHOPPER_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Green leafhopper (Nephotettix virescens) vectors Tungro virus. ETL: 5 hoppers/hill. Virus causes stunting, yellowing.',
    icar_package: 'ICAR-CRRI Tungro Management'
  },
  {
    rule_id: 'C_RICE_PEST_006',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 30 && input.days_after_sowing <= 60,
    cause: Cause.LEAF_FOLDER_RISK,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Leaf folder (Cnaphalocrocis medinalis) folds leaves and scrapes tissue. ETL: 1-2 damaged leaves/hill.',
    icar_package: 'ICAR-CRRI Minor Pest Management'
  },
  {
    rule_id: 'C_RICE_PEST_007',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 50,
    cause: Cause.CASE_WORM_RISK,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice case worm (Nymphula depunctalis) cuts leaf tips and makes tubular cases. ETL: 10% affected leaves. Common in waterlogged areas.',
    icar_package: 'ICAR-CRRI Rice Pest Management'
  },
  {
    rule_id: 'C_RICE_PEST_008',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 35,
    cause: Cause.RICE_THRIPS_RISK,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice thrips (Stenchaetothrips biformis) causes leaf tip curling and silvery streaks. ETL: 50 thrips/leaf. More severe in dry nurseries.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },
  {
    rule_id: 'C_RICE_PEST_009',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.RAIN_ACTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.RICE_ARMYWORM_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice armyworm (Mythimna separata) causes severe defoliation. ETL: 4-5 larvae/m². Outbreak common after dry spell followed by rain.',
    icar_package: 'ICAR-CRRI Emergency Pest Protocol'
  },
  {
    rule_id: 'C_RICE_PEST_010',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.RICE_EAR_CUTTING_CATERPILLAR,
    priority: 7,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Ear-cutting caterpillar (Mythimna loreyi) cuts panicles at heading. ETL: 2 larvae/m². Night feeder - difficult to detect.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW RICE DISEASE MANAGEMENT RULES (30 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_RICE_DISEASE_001',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.BLAST_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice blast (Magnaporthe oryzae) is THE most destructive rice disease. Threshold: 5% leaf area OR 1% neck infection. Favored by high N, 25-28°C, 85%+ humidity.',
    icar_package: 'ICAR-CRRI Blast Management Package 2024'
  },
  {
    rule_id: 'C_RICE_DISEASE_002',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.SHEATH_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Sheath blight (Rhizoctonia solani) second most important rice disease. Threshold: Grade 5 on DSI 0-9 scale. Favored by dense canopy, high N.',
    icar_package: 'ICAR-CRRI Sheath Blight Package 2024'
  },
  {
    rule_id: 'C_RICE_DISEASE_003',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.BACTERIAL_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Bacterial leaf blight (Xanthomonas oryzae pv. oryzae) causes kresek and leaf blight. Threshold: 5% leaf area at tillering. Spreads by water splash.',
    icar_package: 'ICAR-CRRI BLB Management 2024'
  },
  {
    rule_id: 'C_RICE_DISEASE_004',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.BROWN_SPOT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Brown spot (Bipolaris oryzae) common in nutrient-stressed crops. Threshold: 10% leaf area. K and Si deficiency increases susceptibility.',
    icar_package: 'ICAR-CRRI Rice Disease Package'
  },
  {
    rule_id: 'C_RICE_DISEASE_005',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 70,
    cause: Cause.FALSE_SMUT_RISK,
    priority: 7,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'False smut (Ustilaginoidea virens) attacks individual grains at flowering. Spray at boot stage if humidity >85% for >5 days.',
    icar_package: 'ICAR-CRRI Rice Disease Management'
  },
  {
    rule_id: 'C_RICE_DISEASE_006',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.SHEATH_ROT_RISK,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Sheath rot (Sarocladium oryzae) causes boot leaf sheath rotting. Reduces panicle emergence. Apply fungicide at boot stage.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },
  {
    rule_id: 'C_RICE_DISEASE_007',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.TUNGRO_VIRUS_RISK,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Tungro virus complex causes severe stunting and yellowing. Vectored by green leafhopper. No cure - uproot infected plants. Use resistant varieties.',
    icar_package: 'ICAR-CRRI Tungro Management'
  },
  {
    rule_id: 'C_RICE_DISEASE_008',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.p === SoilPState.HIGH_P &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.KHAIRA_DISEASE_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Khaira disease is zinc deficiency disorder. Dusty brown patches on leaves. High P soil locks up Zn. Apply ZnSO4 @ 25 kg/ha.',
    icar_package: 'ICAR-CRRI Micronutrient Management'
  },
  {
    rule_id: 'C_RICE_DISEASE_009',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.RICE_GRAIN_DISCOLORATION,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Grain discoloration complex caused by multiple fungi during wet maturity. Reduces milling quality. Spray fungicide at flowering.',
    icar_package: 'ICAR-CRRI Grain Quality Management'
  },
  {
    rule_id: 'C_RICE_DISEASE_010',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BLAST_RISK,
    priority: 10,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Neck blast at flowering is most critical - can cause 100% grain loss. Preventive spray at 5% heading MANDATORY if humidity >90%.',
    icar_package: 'ICAR-CRRI Emergency Blast Protocol'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW RICE NUTRIENT MANAGEMENT RULES (15 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_RICE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 10 && input.days_after_sowing <= 20,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'First N split at 10-15 DAT critical for recovery and tillering. Apply 1/3rd N dose. LCC reading <3 indicates immediate N need.',
    icar_package: 'ICAR-CRRI LCC Based N Management'
  },
  {
    rule_id: 'C_RICE_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 35 && input.days_after_sowing <= 45,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Second N split at active tillering (35-40 DAT). Apply 1/3rd N dose. Supports maximum tiller production.',
    icar_package: 'ICAR-CRRI Rice Fertilizer Guide'
  },
  {
    rule_id: 'C_RICE_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 50 && input.days_after_sowing <= 60,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Third N split at panicle initiation (50-55 DAT). Final 1/3rd N dose. Critical for spikelet development and grain number.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },
  {
    rule_id: 'C_RICE_NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.days_after_sowing >= 30,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'K deficiency causes rusty brown leaf margins and weak culms. Apply 50% K at transplanting + 50% at panicle initiation.',
    icar_package: 'ICAR-CRRI Potassium Management'
  },
  {
    rule_id: 'C_RICE_NUTRIENT_005',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'P deficiency causes dark green leaves with purple tints. Apply full P at transplanting - immobile in soil. Low recovery in submerged soils.',
    icar_package: 'ICAR-CRRI Phosphorus Management'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW RICE WATER MANAGEMENT RULES (10 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    rule_id: 'C_RICE_WATER_001',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.GERMINATION &&
      input.soil_states.moisture !== SoilMoistureState.WATERLOGGED,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Transplanting MUST have 5-7 cm standing water. Dry transplanting reduces establishment by 40%. Apply puddle water immediately.',
    icar_package: 'ICAR-CRRI Water Management'
  },
  {
    rule_id: 'C_RICE_WATER_002',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 55 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_RICE_PANICLE_INITIATION,
    priority: 10,
    scientific_source: 'ICAR-CRRI + IRRI',
    scientific_basis: 'Panicle initiation is THE most critical water stage. Even 2-3 days stress reduces yield by 50-70%. Maintain 5 cm water.',
    icar_package: 'ICAR-CRRI Critical Water Stage'
  },
  {
    rule_id: 'C_RICE_WATER_003',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 75 && input.days_after_sowing <= 95 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Flowering to grain filling needs saturated soil. Drought causes spikelet sterility and chalky grains.',
    icar_package: 'ICAR-CRRI Rice Water Management'
  },
  {
    rule_id: 'C_RICE_WATER_004',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.crop_stage === CropStage.MATURITY &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 6,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Drain field 10-15 days before harvest. Excess water delays maturity and causes lodging. Improves harvest conditions.',
    icar_package: 'ICAR-CRRI Pre-Harvest Management'
  },
  {
    rule_id: 'C_RICE_WATER_005',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 40 &&
      input.ndvi_trend === NDVITrend.STABLE,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 4,
    scientific_source: 'ICAR-CRRI + IRRI',
    scientific_basis: 'AWD (Alternate Wetting Drying) during tillering saves 20-30% water without yield loss. Drain to 15 cm below soil then refill.',
    icar_package: 'ICAR-CRRI AWD System 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIZE RULES (10 rules)
// Reference: ICAR-IIMR Package of Practices 2024
// ═══════════════════════════════════════════════════════════════════════════

export const MAIZE_RULES: CauseRule[] = [
  // Knee-high stage water (V6)
  {
    rule_id: 'C_CEREALS_MAIZE_WATER_001',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 35 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Knee-high stage (V6, 25-35 DAS) is critical. Water stress reduces plant height and potential ear size.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Tasseling stage water - most critical
  {
    rule_id: 'C_CEREALS_MAIZE_WATER_002',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 50 && input.days_after_sowing <= 65 &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Tasseling-silking (50-65 DAS) is most water-sensitive. Stress causes ASI delay and barren cobs. Yield loss up to 8% per day of stress.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Grain filling water
  {
    rule_id: 'C_CEREALS_MAIZE_WATER_003',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 70 && input.days_after_sowing <= 90 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Grain filling (70-90 DAS) needs consistent moisture. Stress reduces kernel weight.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Fall armyworm - major pest
  {
    rule_id: 'C_CEREALS_MAIZE_PEST_001',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Fall armyworm (Spodoptera frugiperda) attacks whorls causing severe defoliation. ICAR ETL: 10% plants with fresh damage.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Stem borer
  {
    rule_id: 'C_CEREALS_MAIZE_PEST_002',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Maize stem borer (Chilo partellus) causes dead heart. ETL: 5% plants with fresh leaf damage.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Maydis leaf blight
  {
    rule_id: 'C_CEREALS_MAIZE_DISEASE_001',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Maydis leaf blight (Bipolaris maydis) spreads in warm humid weather (26-32°C, >90% RH).',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // Nitrogen at V6
  {
    rule_id: 'C_CEREALS_MAIZE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 35,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'First N top-dressing at knee-high (V6) is critical. Maize has highest N demand at this stage.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

// Heat stress at flowering
  {
    rule_id: 'C_CEREALS_MAIZE_HEAT_001',
    category: 'temperature',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.HEAT_STRESS_SEVERE,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Heat stress (>35°C) at tasseling dries pollen and delays silking. Causes kernel abortion and barren cobs.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW MAIZE RULES - Gap Fill from Complete Catalog (40 rules)
  // ═══════════════════════════════════════════════════════════════════════════

  // MAIZE_PEST_002: Fall Armyworm - Invasive (Primary threat since 2018)
  {
    rule_id: 'C_MAIZE_PEST_001',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 45,
    cause: Cause.FALL_ARMYWORM_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIMR + FAO FAW Monitoring',
    scientific_basis: 'Fall armyworm (Spodoptera frugiperda) is invasive pest (2018 in India). Attacks whorl, causes severe defoliation. ETL: 5% plants with whorl damage OR 1 larva/plant. Can destroy 100% yield if unchecked.',
    icar_package: 'ICAR-IIMR Fall Armyworm Emergency IPM 2024'
  },
  
  // MAIZE_PEST_003: Pink Stem Borer
  {
    rule_id: 'C_MAIZE_PEST_002',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 50 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Pink stem borer (Sesamia inferens) causes dead hearts at vegetative stage. ETL: 5% dead hearts. Whorl application of carbofuran 3G @ 10kg/ha.',
    icar_package: 'ICAR-IIMR Maize IPM Package'
  },

  // MAIZE_PEST_004: Spotted Stem Borer
  {
    rule_id: 'C_MAIZE_PEST_003',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.ndvi_trend === NDVITrend.DECLINING &&
      input.days_after_sowing >= 30,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Spotted stem borer (Chilo partellus) most common maize borer. Larvae tunnel into stem causing dead hearts (vegetative) or chaffy cobs (reproductive). ETL: 8-10% leaf damage or 5% dead hearts.',
    icar_package: 'ICAR-IIMR Stem Borer Management'
  },

  // MAIZE_PEST_005: Shoot Fly
  {
    rule_id: 'C_MAIZE_PEST_004',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 7 && input.days_after_sowing <= 30 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SHOOT_FLY_MAIZE,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Shoot fly (Atherigona naqvii) maggot kills growing point causing dead heart. Critical 7-30 DAS window. ETL: 10% dead hearts. Seed treatment imidacloprid @ 12ml/kg.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // MAIZE_PEST_006: Aphids
  {
    rule_id: 'C_MAIZE_PEST_005',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.DRY_SPELL &&
      input.days_after_sowing >= 30,
    cause: Cause.APHID_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Maize aphid (Rhopalosiphum maidis) colonies suck sap from leaves and tassels. Vectors Maize Dwarf Mosaic Virus. ETL: 30-50 aphids/plant. Favored by dry weather.',
    icar_package: 'ICAR-IIMR Maize IPM'
  },

  // MAIZE_PEST_007: Cob Borer
  {
    rule_id: 'C_MAIZE_PEST_006',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.days_after_sowing >= 50,
    cause: Cause.FRUIT_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Cob borer (Helicoverpa armigera) larvae bore into developing cobs causing direct grain damage. ETL: 2-3 larvae/10 cobs. Most damaging at milking stage.',
    icar_package: 'ICAR-IIMR Cob Borer IPM'
  },

  // MAIZE_DISEASE_002: Turcicum Leaf Blight (Northern Corn Leaf Blight)
  {
    rule_id: 'C_MAIZE_DISEASE_001',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.TURCICUM_BLIGHT_MAIZE,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Turcicum leaf blight (Exserohilum turcicum) causes cigar-shaped lesions. Favored by 18-27°C and high humidity. Threshold: 25% leaf area affected before tasseling = spray.',
    icar_package: 'ICAR-IIMR Maize Disease Package 2024'
  },

  // MAIZE_DISEASE_003: Maydis Leaf Blight (Southern Corn Leaf Blight)
  {
    rule_id: 'C_MAIZE_DISEASE_002',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.MAYDIS_LEAF_BLIGHT,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Maydis leaf blight (Bipolaris maydis) favored by WARMER temps (26-32°C) vs Turcicum. Rectangular lesions parallel to veins. Spray Mancozeb 0.25%.',
    icar_package: 'ICAR-IIMR Disease Management'
  },

  // MAIZE_DISEASE_004: Downy Mildew (Sorghum Downy Mildew)
  {
    rule_id: 'C_MAIZE_DISEASE_003',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing <= 40 &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.MAIZE_DOWNY_MILDEW_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Downy mildew (Peronosclerospora sorghi) causes systemic infection. White downy growth on leaf undersurface. Crazy top symptom. Seed treatment Metalaxyl 35SD @ 6g/kg mandatory.',
    icar_package: 'ICAR-IIMR Downy Mildew Control'
  },

  // MAIZE_DISEASE_005: Fusarium Stalk Rot
  {
    rule_id: 'C_MAIZE_DISEASE_004',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.MAIZE_STALK_ROT_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Fusarium stalk rot causes lodging at maturity. Favored by waterlogging + high plant density. Internal pith disintegration. No chemical cure - improve drainage.',
    icar_package: 'ICAR-IIMR Stalk Rot Management'
  },

  // MAIZE_DISEASE_006: Ear Rot Complex
  {
    rule_id: 'C_MAIZE_DISEASE_005',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.FUNGAL_DISEASE_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Fusarium/Aspergillus ear rot complex produces mycotoxins (aflatoxin). Rain during maturity increases infection. Timely harvest + proper drying essential.',
    icar_package: 'ICAR-IIMR Ear Rot + Mycotoxin Protocol'
  },

  // MAIZE_DISEASE_007: Common Rust
  {
    rule_id: 'C_MAIZE_DISEASE_006',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.RUST_RISK,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Common rust (Puccinia sorghi) produces cinnamon-brown pustules on leaves. Favored by cool nights (15-20°C) + humid days. Threshold: 10% leaf area infected.',
    icar_package: 'ICAR-IIMR Disease Calendar'
  },

  // MAIZE_DISEASE_008: Polysora Rust (Southern Rust)
  {
    rule_id: 'C_MAIZE_DISEASE_007',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.RUST_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Southern rust (Puccinia polysora) more aggressive than common rust. Orange pustules, mainly on upper leaf surface. Favors warmer temps. Can cause 50% yield loss.',
    icar_package: 'ICAR-IIMR Rust Management'
  },

  // MAIZE_WATER_004: Germination Moisture
  {
    rule_id: 'C_MAIZE_WATER_001',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.crop_stage === CropStage.GERMINATION &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Maize needs adequate soil moisture for uniform germination. Dry soil causes patchy stand. Pre-sowing irrigation if soil moisture <50% FC.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // MAIZE_WATER_005: V12 Critical Period
  {
    rule_id: 'C_MAIZE_WATER_002',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 50 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'V12 stage (40-50 DAS) determines final ear size. Water stress reduces kernel rows per ear. Critical for yield potential setting.',
    icar_package: 'ICAR-IIMR Critical Growth Stages'
  },

  // MAIZE_WATER_006: Post-Silking
  {
    rule_id: 'C_MAIZE_WATER_003',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 65 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Post-silking (65-80 DAS) moisture critical for kernel filling. Stress causes tip kernel abortion and reduced test weight.',
    icar_package: 'ICAR-IIMR Water Management'
  },

  // MAIZE_NUTRIENT_002: Second N Split (V8-V10)
  {
    rule_id: 'C_MAIZE_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 35 && input.days_after_sowing <= 45,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Second N split at V8-V10 (35-45 DAS) is critical - maize takes up 60% of total N during this period. Deficiency causes irreversible yield loss.',
    icar_package: 'ICAR-IIMR Nitrogen Management'
  },

  // MAIZE_NUTRIENT_003: Zinc for Ear Development
  {
    rule_id: 'C_MAIZE_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 40,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Zinc deficiency causes white band disease in maize. White/yellow stripes on young leaves. Apply ZnSO4 @ 25 kg/ha or foliar 0.5%.',
    icar_package: 'ICAR-IIMR Micronutrient Package'
  },

  // MAIZE_NUTRIENT_004: Potassium for Lodging Resistance
  {
    rule_id: 'C_MAIZE_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.soil_states.k === SoilKState.LOW_K &&
      input.days_after_sowing >= 35,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Potassium critical for stalk strength and lodging resistance. Deficiency causes firing of lower leaf margins and weak stalks.',
    icar_package: 'ICAR-IIMR Nutrient Management'
  },

  // MAIZE_HEAT_002: Pollen Desiccation
  {
    rule_id: 'C_MAIZE_HEAT_001',
    category: 'temperature',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.days_after_sowing >= 55 && input.days_after_sowing <= 70,
    cause: Cause.HEAT_STRESS_SEVERE,
    priority: 10,
    scientific_source: 'ICAR-IIMR + CIMMYT',
    scientific_basis: 'Heat >35°C during tasseling desiccates pollen within 2 hours of shed. Combined with silk delay = barren cobs. Light irrigation helps maintain silk moisture.',
    icar_package: 'ICAR-IIMR Heat Stress Protocol'
  },

  // MAIZE_HEAT_003: Night Temperature Effect
  {
    rule_id: 'C_MAIZE_HEAT_002',
    category: 'temperature',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.HEAT_STRESS_SEVERE,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'High night temperature (>25°C) during grain filling increases respiration, reducing grain weight. Each 1°C rise reduces yield by 2-4%.',
    icar_package: 'ICAR-IIMR Temperature Stress'
  },

  // MAIZE_WEED_001: Critical Weed Period
  {
    rule_id: 'C_MAIZE_WEED_001',
    category: 'weed',
    crop_code: 'maize',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 45 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WEED_COMPETITION_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Critical weed competition period in maize is 15-45 DAS. Weeds can reduce yield by 30-60%. Post-emergence: Atrazine + Pendimethalin tank mix.',
    icar_package: 'ICAR-IIMR Weed Management'
  },

  // MAIZE_LODGING_001: Stalk Lodging Risk
  {
    rule_id: 'C_MAIZE_LODGING_001',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.weather_state === WeatherState.STRONG_WIND &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.EXCESS_NITROGEN_LODGING,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'High N + dense planting + wind = lodging risk. Reduces grain quality and harvest efficiency. Use balanced fertilization and appropriate plant density.',
    icar_package: 'ICAR-IIMR Lodging Prevention'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// ALL CEREALS FALLBACK RULES (8 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_CEREALS_RULES: CauseRule[] = [
  // Nitrogen deficiency
  {
    rule_id: 'C_CEREALS_ALL_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N &&
      input.crop_stage === CropStage.VEGETATIVE,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR General',
    scientific_basis: 'Nitrogen is critical for chlorophyll synthesis in all cereals. Deficiency causes pale yellow older leaves.'
  },

  // Phosphorus deficiency
  {
    rule_id: 'C_CEREALS_ALL_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR',
    scientific_basis: 'Phosphorus supports root development and tillering. Deficiency causes purple discoloration.'
  },

  // Potassium deficiency
  {
    rule_id: 'C_CEREALS_ALL_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.k === SoilKState.LOW_K &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR',
    scientific_basis: 'Potassium is critical for grain filling and lodging resistance.'
  },

  // Waterlogging
  {
    rule_id: 'C_CEREALS_ALL_WATER_001',
    category: 'water',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED &&
      input.crop_code !== 'rice',
    cause: Cause.WATERLOGGING,
    priority: 8,
    scientific_source: 'ICAR',
    scientific_basis: 'Waterlogging causes root anoxia in upland cereals. Drain within 24-48 hours to prevent permanent damage.'
  },

  // Optimal growth
  {
    rule_id: 'C_CEREALS_ALL_HEALTHY_001',
    category: 'healthy',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.ndvi_state === NDVIState.EXCELLENT || input.ndvi_state === NDVIState.HEALTHY) &&
      (input.ndvi_trend === NDVITrend.RISING || input.ndvi_trend === NDVITrend.STABLE) &&
      input.soil_states.n === SoilNState.ADEQUATE_N,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 3,
    scientific_source: 'NASA NDVI + ICAR',
    scientific_basis: 'NDVI ≥0.50 with stable/rising trend indicates healthy photosynthetic activity and good yield potential.'
  },

  // Recovery trend
  {
    rule_id: 'C_CEREALS_ALL_HEALTHY_002',
    category: 'healthy',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_trend === NDVITrend.RISING &&
      input.ndvi_state !== NDVIState.CRITICAL,
    cause: Cause.RECOVERY_TREND,
    priority: 4,
    scientific_source: 'NASA NDVI Analysis',
    scientific_basis: 'Rising NDVI trend indicates crop is recovering from previous stress condition.'
  },

  // Critical NDVI decline
  {
    rule_id: 'C_CEREALS_ALL_CRITICAL_001',
    category: 'critical',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.CRITICAL &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    priority: 10,
    scientific_source: 'NASA + ICAR',
    scientific_basis: 'NDVI <0.20 with declining trend indicates severe crop stress requiring immediate intervention.'
  },

  // Weed emergence window
  {
    rule_id: 'C_CEREALS_ALL_WEED_001',
    category: 'weed',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_stage === CropStage.GERMINATION &&
      input.days_after_sowing >= 10 && input.days_after_sowing <= 20,
    cause: Cause.WEED_EMERGENCE_WINDOW,
    priority: 7,
    scientific_source: 'ICAR',
    scientific_basis: 'Critical period for weed emergence in cereals is 10-20 DAS. Early control is essential.'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PEST-DISEASE CASCADE RULES FOR ALL CEREALS (10 rules)
// Scientific Basis: Pest wounds create entry points for pathogens
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_DISEASE_CASCADE_RULES: CauseRule[] = [
  // CASCADE_001: Stem Borer → Fusarium/Bacterial Infection
  {
    rule_id: 'CASCADE_CEREALS_001',
    category: 'disease',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.metadata?.pest_detected === 'STEM_BORER' || 
       input.metadata?.pest_detected === 'SHOOT_BORER') &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.SECONDARY_INFECTION_RISK,
    priority: 9,
    scientific_source: 'ICAR Plant Pathology',
    scientific_basis: 'Stem/shoot borer larvae create tunnels that become entry points for Fusarium oxysporum and bacterial pathogens. Humid weather increases infection rate by 300%.',
    icar_package: 'ICAR IPM Guidelines 2024'
  },

  // CASCADE_002: Aphid Honeydew → Sooty Mold
  {
    rule_id: 'CASCADE_CEREALS_002',
    category: 'disease',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.metadata?.pest_detected === 'APHID' || 
       input.metadata?.pest_detected === 'JASSID') &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.FUNGAL_SECONDARY_INFECTION,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Aphid honeydew secretions support sooty mold (Cladosporium) growth. Reduces photosynthesis by 25-40%. Black coating on leaves diagnostic.',
    icar_package: 'ICAR Aphid Management 2024'
  },

  // CASCADE_003: Termite Damage → Root Rot Complex
  {
    rule_id: 'CASCADE_CEREALS_003',
    category: 'disease',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.metadata?.pest_detected === 'TERMITE' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WOUND_ENTRY_DISEASE,
    priority: 8,
    scientific_source: 'ICAR Soil Microbiology',
    scientific_basis: 'Termite galleries expose roots to Pythium, Rhizoctonia, Fusarium complex. Waterlogged soil accelerates root rot. Can cause 60-80% stand loss.',
    icar_package: 'ICAR Root Disease Management'
  },

  // CASCADE_004: Wheat - Rust Spores on Aphid Vectors
  {
    rule_id: 'CASCADE_WHEAT_001',
    category: 'disease',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.metadata?.pest_detected === 'APHID' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing >= 60,
    cause: Cause.WHEAT_RUST_RISK,
    priority: 9,
    scientific_source: 'ICAR-IARI Wheat Pathology',
    scientific_basis: 'Aphids carry rust (Puccinia) spores mechanically. High aphid population + humid weather = rapid rust spread. Yellow/brown rust can cause 40-70% yield loss.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // CASCADE_005: Rice - BPH Feeding → Sheath Blight Severity
  {
    rule_id: 'CASCADE_RICE_001',
    category: 'disease',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      (input.metadata?.pest_detected === 'BROWN_PLANTHOPPER' ||
       input.metadata?.pest_detected === 'LEAFHOPPER') &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.RICE_SHEATH_BLIGHT_RISK,
    priority: 8,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Brown planthopper feeding wounds facilitate Rhizoctonia solani (sheath blight) penetration. Humid microclimate from BPH colonies favors fungal growth.',
    icar_package: 'ICAR-CRRI Rice PoP 2024'
  },

  // CASCADE_006: Maize - Fall Armyworm → Fusarium Ear Rot
  {
    rule_id: 'CASCADE_MAIZE_001',
    category: 'disease',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.metadata?.pest_detected === 'FALL_ARMYWORM' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.FUNGAL_SECONDARY_INFECTION,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Fall armyworm damage to cob creates entry for Fusarium verticillioides. Mycotoxin contamination risk. Can make grain unfit for consumption.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  },

  // CASCADE_007: General - Hail/Wind Damage → Bacterial Blight
  {
    rule_id: 'CASCADE_CEREALS_004',
    category: 'disease',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.metadata?.hail_damage === true &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.BACTERIAL_SECONDARY_INFECTION,
    priority: 8,
    scientific_source: 'ICAR Extreme Weather Management',
    scientific_basis: 'Hail creates multiple wound sites. Rain splash disperses Xanthomonas, Pseudomonas bacteria into wounds. Requires immediate copper spray.',
    icar_package: 'ICAR Climate Resilience 2024'
  },

  // CASCADE_008: Sugarcane - Shoot Borer → Red Rot Entry
  {
    rule_id: 'CASCADE_SUGARCANE_001',
    category: 'disease',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane' &&
      input.metadata?.pest_detected === 'SHOOT_BORER' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.PEST_DISEASE_CASCADE,
    priority: 10,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Chilo infuscatellus (shoot borer) tunnels are primary entry for Colletotrichum falcatum (red rot). Most destructive sugarcane disease. Can destroy entire crop.',
    icar_package: 'ICAR-SBI Sugarcane PoP 2024'
  },

  // CASCADE_009: Cotton - Bollworm → Boll Rot Complex
  {
    rule_id: 'CASCADE_COTTON_001',
    category: 'disease',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      (input.metadata?.pest_detected === 'PINK_BOLLWORM' ||
       input.metadata?.pest_detected === 'AMERICAN_BOLLWORM') &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.COTTON_BOLL_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Bollworm exit holes allow Xanthomonas, Aspergillus, Fusarium entry. Rainy weather = rapid boll rot spread. Causes fiber quality degradation.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // CASCADE_010: Preventive Action When Pest Detected
  {
    rule_id: 'CASCADE_PREVENTIVE_001',
    category: 'disease',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.metadata?.pest_severity === 'HIGH' &&
      input.weather_state !== WeatherState.DRY_SPELL &&
      !input.metadata?.fungicide_applied_last_7days,
    cause: Cause.SECONDARY_INFECTION_RISK,
    priority: 7,
    scientific_source: 'ICAR Integrated Pest Disease Management',
    scientific_basis: 'High pest infestation creates numerous wounds. Preventive fungicide/bactericide needed even without disease symptoms. Prevention cheaper than cure.',
    icar_package: 'ICAR IPDM Strategy 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// BAJRA (PEARL MILLET) RULES (12 rules)
// Source: ICAR-AICPMIP Jodhpur, ICRISAT Hyderabad
// India's 4th largest cereal - 8.5 million hectares
// ═══════════════════════════════════════════════════════════════════════════

export const BAJRA_RULES: CauseRule[] = [
  // BAJRA_DISEASE_001: Downy Mildew - Most Destructive
  {
    rule_id: 'C_CEREALS_BAJRA_DISEASE_001',
    category: 'disease',
    crop_code: 'bajra',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.days_after_sowing <= 30,
    cause: Cause.BAJRA_DOWNY_MILDEW_RISK,
    priority: 10,
    scientific_source: 'ICAR-AICPMIP Jodhpur',
    scientific_basis: 'Sclerospora graminicola causes 50-80% yield loss if early infection. Systemic disease - entire plant becomes chlorotic. Seed treatment with Metalaxyl 35SD @ 6g/kg mandatory.',
    icar_package: 'ICAR-AICPMIP Bajra PoP 2024'
  },

  // BAJRA_DISEASE_002: Ergot (Claviceps fusiformis)
  {
    rule_id: 'C_CEREALS_BAJRA_DISEASE_002',
    category: 'disease',
    crop_code: 'bajra',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.FUNGAL_SECONDARY_INFECTION,
    priority: 8,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Ergot replaces grain with toxic sclerotia (honeydew stage visible). Common in rainy season crop. Remove infected earheads immediately. Grain unsafe for consumption.',
    icar_package: 'ICAR Bajra Disease Management'
  },

  // BAJRA_DISEASE_003: Blast (Pyricularia grisea)
  {
    rule_id: 'C_CEREALS_BAJRA_DISEASE_003',
    category: 'disease',
    crop_code: 'bajra',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.RAGI_BLAST_RISK,
    priority: 7,
    scientific_source: 'ICRISAT',
    scientific_basis: 'Neck and finger blast attacks earheads. Favored by excess N + high humidity. Spray Tricyclazole 75% WP @ 0.6g/L at ear emergence.',
    icar_package: 'ICRISAT Pearl Millet Production'
  },

  // BAJRA_PEST_001: Shoot Fly (Atherigona approximata)
  {
    rule_id: 'C_CEREALS_BAJRA_PEST_001',
    category: 'pest',
    crop_code: 'bajra',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.days_after_sowing >= 8 && input.days_after_sowing <= 25 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.BAJRA_SHOOT_FLY_RISK,
    priority: 9,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Shoot fly maggot damages growing point causing dead heart. ETL: 20-25% dead hearts. Most critical 8-20 DAS. Seed treatment with imidacloprid 48FS @ 8ml/kg effective.',
    icar_package: 'ICAR-AICPMIP Bajra PoP 2024'
  },

  // BAJRA_PEST_002: Stem Borer
  {
    rule_id: 'C_CEREALS_BAJRA_PEST_002',
    category: 'pest',
    crop_code: 'bajra',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.days_after_sowing >= 30 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.BAJRA_STEM_BORER_RISK,
    priority: 7,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Coniesta ignefusalis bores into stem. Causes lodging and poor grain filling. Release Trichogramma chilonis @ 50,000/acre at weekly intervals.',
    icar_package: 'ICAR-AICPMIP IPM Package'
  },

  // BAJRA_PEST_003: Hairy Caterpillar
  {
    rule_id: 'C_CEREALS_BAJRA_PEST_003',
    category: 'pest',
    crop_code: 'bajra',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Amsacta albistriga causes severe defoliation. Larvae are gregarious. ETL: 5-10 larvae/plant. Spray Quinalphos 25EC @ 2ml/L.',
    icar_package: 'ICAR Bajra Pest Management'
  },

  // BAJRA_WATER_001: Critical Period Water Stress
  {
    rule_id: 'C_CEREALS_BAJRA_WATER_001',
    category: 'water',
    crop_code: 'bajra',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 55 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICRISAT',
    scientific_basis: 'Flowering-grain filling (45-55 DAS) is THE most critical 10-day window. Water stress here reduces yield by 50-70%. Even 2-3 days wilting = permanent grain loss.',
    icar_package: 'ICRISAT Dryland Agriculture'
  },

  // BAJRA_WATER_002: Drought Tolerance
  {
    rule_id: 'C_CEREALS_BAJRA_WATER_002',
    category: 'water',
    crop_code: 'bajra',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY &&
      input.weather_state === WeatherState.DRY_SPELL,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'ICRISAT',
    scientific_basis: 'Bajra is MOST drought-tolerant cereal. Can survive on 250-400mm rainfall. Vegetative stage stress is tolerable. Save water for critical flowering stage.',
    icar_package: 'ICRISAT Pearl Millet Guide'
  },

  // BAJRA_NUTRIENT_001: Nitrogen Requirement
  {
    rule_id: 'C_CEREALS_BAJRA_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'bajra',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 30,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Bajra needs 80-100 kg N/ha (less than wheat). Split: 50% basal + 25% at 25 DAS + 25% at panicle initiation. Excess N increases lodging.',
    icar_package: 'ICAR-AICPMIP Nutrient Management'
  },

  // BAJRA_NUTRIENT_002: Phosphorus for Root Development
  {
    rule_id: 'C_CEREALS_BAJRA_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'bajra',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.soil_states.p === SoilPState.LOW_P &&
      input.crop_stage === CropStage.GERMINATION,
    cause: Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
    priority: 8,
    scientific_source: 'ICRISAT',
    scientific_basis: 'Phosphorus critical for drought tolerance root development. Apply full dose (40 kg P2O5/ha) at sowing. DAP or SSP preferred.',
    icar_package: 'ICRISAT Soil Management'
  },

  // BAJRA_NUTRIENT_003: Zinc Deficiency
  {
    rule_id: 'C_CEREALS_BAJRA_NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'bajra',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.soil_states.n === SoilNState.ADEQUATE_N,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Zinc deficiency common in sandy/alkaline soils. Causes white/chlorotic bands on leaves. Apply ZnSO4 @ 25 kg/ha OR foliar 0.5%.',
    icar_package: 'ICAR Micronutrient Management'
  },

  // BAJRA_WEED_001: Critical Weed Period
  {
    rule_id: 'C_CEREALS_BAJRA_WEED_001',
    category: 'weed',
    crop_code: 'bajra',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'bajra' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 35 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.WEED_COMPETITION_CRITICAL,
    priority: 8,
    scientific_source: 'ICAR-AICPMIP',
    scientific_basis: 'Critical weed competition period: 15-35 DAS. Weeds reduce yield by 40-60%. One hand weeding at 20-25 DAS OR Atrazine 50% WP @ 0.5kg/ha at 3-4 DAS.',
    icar_package: 'ICAR-AICPMIP Weed Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// JOWAR (SORGHUM) RULES (10 rules)
// Source: ICAR-IIMR Hyderabad
// India's 3rd largest cereal after rice and wheat - 4.2 million hectares
// ═══════════════════════════════════════════════════════════════════════════

export const JOWAR_RULES: CauseRule[] = [
  // JOWAR_DISEASE_001: Charcoal Rot (Macrophomina phaseolina)
  {
    rule_id: 'C_CEREALS_JOWAR_DISEASE_001',
    category: 'disease',
    crop_code: 'jowar',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HEAT_STRESS &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.JOWAR_CHARCOAL_ROT_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIMR Hyderabad',
    scientific_basis: 'Charcoal rot causes sudden wilting at maturity. Favored by heat stress + drought. Stem pith turns black with charcoal-like sclerotia. Can cause 30-50% yield loss. Use resistant varieties.',
    icar_package: 'ICAR-IIMR Sorghum PoP 2024'
  },

  // JOWAR_DISEASE_002: Grain Mold Complex
  {
    rule_id: 'C_CEREALS_JOWAR_DISEASE_002',
    category: 'disease',
    crop_code: 'jowar',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.crop_stage === CropStage.MATURITY &&
      input.weather_state === WeatherState.RAIN_ACTIVE,
    cause: Cause.FUNGAL_SECONDARY_INFECTION,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Fusarium, Curvularia, Alternaria complex attacks ripening grain. Rain during maturity = severe infection. Grain discoloration, poor quality. Spray Mancozeb 0.25% at flowering.',
    icar_package: 'ICAR-IIMR Disease Management'
  },

  // JOWAR_DISEASE_003: Downy Mildew
  {
    rule_id: 'C_CEREALS_JOWAR_DISEASE_003',
    category: 'disease',
    crop_code: 'jowar',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.days_after_sowing <= 30 &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.FUNGAL_SECONDARY_INFECTION,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Peronosclerospora sorghi causes systemic infection. White downy growth on leaf undersurface. Seed treatment with Metalaxyl 35SD @ 6g/kg.',
    icar_package: 'ICAR-IIMR Sorghum PoP 2024'
  },

  // JOWAR_PEST_001: Shoot Fly (Atherigona soccata)
  {
    rule_id: 'C_CEREALS_JOWAR_PEST_001',
    category: 'pest',
    crop_code: 'jowar',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.days_after_sowing >= 7 && input.days_after_sowing <= 30 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.JOWAR_SHOOT_FLY_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Shoot fly THE most destructive pest of sorghum. Maggot bores into whorl, kills growing point → dead heart. ETL: 20% dead hearts. Critical 7-30 DAS. Seed treatment: imidacloprid 48FS @ 12ml/kg.',
    icar_package: 'ICAR-IIMR Sorghum PoP 2024'
  },

  // JOWAR_PEST_002: Stem Borer (Chilo partellus)
  {
    rule_id: 'C_CEREALS_JOWAR_PEST_002',
    category: 'pest',
    crop_code: 'jowar',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.days_after_sowing >= 30 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.JOWAR_STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Stem borer larvae bore into stem causing dead hearts (vegetative) or chaffy panicles (reproductive). ETL: 10% dead hearts. Whorl application of carbofuran 3G @ 10kg/ha.',
    icar_package: 'ICAR-IIMR IPM Package'
  },

  // JOWAR_PEST_003: Shoot Bug
  {
    rule_id: 'C_CEREALS_JOWAR_PEST_003',
    category: 'pest',
    crop_code: 'jowar',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Peregrinus maidis sucks sap from growing shoot. Causes stunting, leaf crinkling. Transmits virus. ETL: 5-10 bugs/plant.',
    icar_package: 'ICAR-IIMR Pest Management'
  },

  // JOWAR_WATER_001: Critical Period Water Stress
  {
    rule_id: 'C_CEREALS_JOWAR_WATER_001',
    category: 'water',
    crop_code: 'jowar',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.days_after_sowing >= 50 && input.days_after_sowing <= 65 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Boot leaf to flowering (50-65 DAS) is THE critical period. Water stress reduces grain number per panicle by 40-60%. One irrigation mandatory if rain fails.',
    icar_package: 'ICAR-IIMR Sorghum PoP 2024'
  },

  // JOWAR_WATER_002: Drought Tolerance
  {
    rule_id: 'C_CEREALS_JOWAR_WATER_002',
    category: 'water',
    crop_code: 'jowar',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'ICRISAT',
    scientific_basis: 'Sorghum has excellent drought recovery. Can survive on 400-600mm rainfall. Vegetative stress tolerable. Save water for boot-to-flowering critical window.',
    icar_package: 'ICRISAT Dryland Crops'
  },

  // JOWAR_NUTRIENT_001: Nitrogen Management
  {
    rule_id: 'C_CEREALS_JOWAR_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'jowar',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 35,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Sorghum needs 80-100 kg N/ha. Split: 50% basal + 50% at 30-35 DAS (pre-boot). Excess N delays maturity and increases lodging.',
    icar_package: 'ICAR-IIMR Nutrient Management'
  },

  // JOWAR_NUTRIENT_002: Phosphorus
  {
    rule_id: 'C_CEREALS_JOWAR_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'jowar',
    stage_applicable: [CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_code === 'jowar' &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Apply full P (40-50 kg P2O5/ha) at sowing. Supports root development in low-moisture conditions.',
    icar_package: 'ICAR-IIMR Sorghum PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// RAGI (FINGER MILLET) RULES (8 rules)
// Source: ICAR-IIMR Bangalore Unit
// Nutritionally superior - high calcium (344mg/100g)
// ═══════════════════════════════════════════════════════════════════════════

export const RAGI_RULES: CauseRule[] = [
  // RAGI_DISEASE_001: Blast (Pyricularia grisea) - Most Destructive
  {
    rule_id: 'C_CEREALS_RAGI_DISEASE_001',
    category: 'disease',
    crop_code: 'ragi',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.RAGI_BLAST_RISK,
    priority: 10,
    scientific_source: 'ICAR-IIMR Bangalore',
    scientific_basis: 'Blast is THE most serious disease of ragi. Attacks leaves (leaf blast), neck (neck blast), and fingers (finger blast). Can cause 50-90% yield loss. Favored by high N + humid weather. Spray Tricyclazole 75% WP @ 0.6g/L.',
    icar_package: 'ICAR-IIMR Ragi PoP 2024'
  },

  // RAGI_DISEASE_002: Finger Blast Specific
  {
    rule_id: 'C_CEREALS_RAGI_DISEASE_002',
    category: 'disease',
    crop_code: 'ragi',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.weather_state === WeatherState.HIGH_HUMIDITY,
    cause: Cause.RAGI_FINGER_BLAST_RISK,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Finger blast attacks at grain filling stage. Causes grain abortion and chaffy fingers. Critical spray timing: finger emergence and 10 days later.',
    icar_package: 'ICAR-IIMR Disease Calendar'
  },

  // RAGI_DISEASE_003: Brown Spot
  {
    rule_id: 'C_CEREALS_RAGI_DISEASE_003',
    category: 'disease',
    crop_code: 'ragi',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.weather_state === WeatherState.HIGH_HUMIDITY &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.EARLY_BLIGHT_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Helminthosporium nodulosum causes brown spots on leaves. Reduces photosynthetic area. Spray Mancozeb 0.25%.',
    icar_package: 'ICAR-IIMR Ragi Diseases'
  },

  // RAGI_PEST_001: Pink Stem Borer
  {
    rule_id: 'C_CEREALS_RAGI_PEST_001',
    category: 'pest',
    crop_code: 'ragi',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.days_after_sowing >= 30 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.STEM_BORER_RISK,
    priority: 8,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Sesamia inferens bores into stem causing dead hearts. ETL: 5-10% dead hearts. Whorl application of carbofuran 3G @ 20kg/ha.',
    icar_package: 'ICAR-IIMR Ragi PoP 2024'
  },

  // RAGI_PEST_002: Leaf Eating Caterpillar
  {
    rule_id: 'C_CEREALS_RAGI_PEST_002',
    category: 'pest',
    crop_code: 'ragi',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.crop_stage === CropStage.VEGETATIVE &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PEST_GENERAL_RISK,
    priority: 6,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Spodoptera litura causes defoliation. ETL: 5 larvae/plant. Spray Quinalphos 25EC @ 2ml/L.',
    icar_package: 'ICAR-IIMR Pest Management'
  },

  // RAGI_WATER_001: Critical Period
  {
    rule_id: 'C_CEREALS_RAGI_WATER_001',
    category: 'water',
    crop_code: 'ragi',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.days_after_sowing >= 60 && input.days_after_sowing <= 75 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Flowering to milk stage (60-75 DAS) is critical for grain filling. Water stress reduces grain weight by 30-50%.',
    icar_package: 'ICAR-IIMR Ragi PoP 2024'
  },

  // RAGI_NUTRIENT_001: Calcium - Unique Requirement
  {
    rule_id: 'C_CEREALS_RAGI_NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'ragi',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Ragi accumulates 10x more calcium than rice/wheat. Needs calcium supplementation for grain quality. Foliar spray CaCl2 0.5% at flowering and grain filling.',
    icar_package: 'ICAR-IIMR Nutrition Guide'
  },

  // RAGI_NUTRIENT_002: Nitrogen
  {
    rule_id: 'C_CEREALS_RAGI_NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'ragi',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'ragi' &&
      input.soil_states.n === SoilNState.LOW_N &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 40,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Ragi needs 50-75 kg N/ha (less than wheat/rice). Split: 50% basal + 25% at 25 DAS + 25% at panicle initiation. Excess N increases blast susceptibility.',
    icar_package: 'ICAR-IIMR Ragi PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL PERIOD WATER STRESS (CPWS) RULES - CEREALS
// ═══════════════════════════════════════════════════════════════════════════

export const CEREALS_CPWS_RULES: CauseRule[] = [
  {
    rule_id: 'CPWS_RICE_001',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 45 && input.days_after_sowing <= 55 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_RICE_PANICLE_INITIATION,
    priority: 10,
    scientific_source: 'ICAR-CRRI + IRRI Philippines',
    scientific_basis: 'Panicle Initiation (PI) stage (45-55 DAT) is THE single most critical 10-day window in rice. Water stress here reduces spikelet number by 50-70%. Even 2-3 days stress = PERMANENT yield loss.',
    icar_package: 'ICAR-CRRI Rice Water Management'
  },
  {
    rule_id: 'CPWS_WHEAT_001',
    category: 'water',
    crop_code: 'wheat',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 75 && input.days_after_sowing <= 80 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_WHEAT_FLOWERING,
    priority: 10,
    scientific_source: 'ICAR-IARI + CIMMYT',
    scientific_basis: 'Flowering (75-80 DAS) is THE critical 5-day window. Water stress reduces pollen viability and grain set by 30-40%.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },
  {
    rule_id: 'CPWS_MAIZE_001',
    category: 'water',
    crop_code: 'maize',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 55 && input.days_after_sowing <= 65 &&
      input.soil_states.moisture === SoilMoistureState.DRY,
    cause: Cause.CPWS_MAIZE_TASSELING_SILKING,
    priority: 10,
    scientific_source: 'ICAR-IIMR + CIMMYT',
    scientific_basis: 'Tasseling-Silking (55-65 DAS) is THE most water-sensitive period. Water stress increases ASI → poor pollination → barren cobs. Can reduce yield by 40-60%.',
    icar_package: 'ICAR-IIMR Maize PoP 2024'
  }
];

export const CEREALS_RULES: CauseRule[] = [
  ...PEST_DISEASE_CASCADE_RULES,
  ...WHEAT_RULES,
  ...RICE_RULES,
  ...MAIZE_RULES,
  ...BAJRA_RULES,
  ...JOWAR_RULES,
  ...RAGI_RULES,
  ...CEREALS_CPWS_RULES,
  ...ALL_CEREALS_RULES
];

export default CEREALS_RULES;
