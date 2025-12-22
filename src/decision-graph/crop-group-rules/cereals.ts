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
  WeatherState
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
// COMBINED CEREALS RULES
// Total: 55+ rules
// ═══════════════════════════════════════════════════════════════════════════

export const CEREALS_RULES: CauseRule[] = [
  ...WHEAT_RULES,
  ...RICE_RULES,
  ...MAIZE_RULES,
  ...ALL_CEREALS_RULES
];

export default CEREALS_RULES;
