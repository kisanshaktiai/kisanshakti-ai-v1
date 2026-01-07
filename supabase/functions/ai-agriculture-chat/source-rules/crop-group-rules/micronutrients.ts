/**
 * MICRONUTRIENT DEFICIENCY RULES - ALL CROPS
 * Universal micronutrient management across crop groups
 * Total: 30+ rules
 * Sources: ICAR-IARI, ICAR-NBSS&LUP, FAO Micronutrient Guidelines
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  SoilPState,
  SoilMoistureState,
  WeatherState
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// ZINC DEFICIENCY RULES (6 rules)
// Most common micronutrient deficiency in India
// ═══════════════════════════════════════════════════════════════════════════

export const ZINC_DEFICIENCY_RULES: CauseRule[] = [
  // ZINC_001: Universal Zinc Deficiency
  {
    rule_id: 'MICRO_ZN_001',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.soil_states.n === SoilNState.ADEQUATE_N &&
      input.soil_states.p === SoilPState.ADEQUATE_P &&
      (input.metadata?.soil_ph_state === 'ALKALINE' || 
       (typeof input.metadata?.soil_zinc_ppm === 'number' && input.metadata.soil_zinc_ppm < 0.6)),
    cause: Cause.ZINC_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-NBSS&LUP',
    scientific_basis: 'Zinc deficiency affects 49% of Indian soils. Causes interveinal chlorosis on young leaves. Critical when soil Zn < 0.6 ppm (DTPA extractable). Alkaline soils (pH>8) lock up zinc.',
    icar_package: 'ICAR Micronutrient Atlas of India'
  },

  // ZINC_002: Rice Zinc Deficiency (Khaira Disease)
  {
    rule_id: 'MICRO_ZN_RICE_001',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 45 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      (input.soil_states.p === SoilPState.HIGH_P ||
       input.metadata?.soil_ph_state === 'ALKALINE'),
    cause: Cause.ZINC_DEFICIENCY,
    priority: 9,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Khaira disease in rice caused by Zn deficiency. Brown spots on leaves at 20-30 DAT. Induced by high P (>25 ppm) or alkaline soil. Apply ZnSO4 @ 25 kg/ha OR foliar 0.5% ZnSO4 + 0.25% lime.',
    icar_package: 'ICAR-CRRI Rice Nutrition'
  },

  // ZINC_003: Wheat Zinc Deficiency
  {
    rule_id: 'MICRO_ZN_WHEAT_001',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 20 && input.days_after_sowing <= 40 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.metadata?.soil_ph_state === 'ALKALINE',
    cause: Cause.ZINC_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Wheat Zn deficiency causes pale yellow young leaves with brown spots. Common in North India alkaline soils. Reduces grain Zn content (human nutrition issue). Apply ZnSO4 @ 25 kg/ha.',
    icar_package: 'ICAR-IARI Wheat PoP 2024'
  },

  // ZINC_004: Maize Zinc Deficiency (White Bud)
  {
    rule_id: 'MICRO_ZN_MAIZE_001',
    category: 'nutrient',
    crop_code: 'maize',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'maize' &&
      input.days_after_sowing >= 15 && input.days_after_sowing <= 35 &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 9,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'White bud disease - young leaves emerge white/bleached. Severe Zn deficiency. Maize most sensitive to Zn deficiency. Apply ZnSO4 @ 25 kg/ha + foliar 0.5%.',
    icar_package: 'ICAR-IIMR Maize Nutrition'
  },

  // ZINC_005: Citrus Zinc Deficiency (Little Leaf)
  {
    rule_id: 'MICRO_ZN_CITRUS_001',
    category: 'nutrient',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.metadata?.leaf_size_reduction === true,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CCRI Nagpur',
    scientific_basis: 'Little leaf disease - small pointed leaves with mottled chlorosis. Shoots rosette. Fruit small and pointed. Spray ZnSO4 0.5% + urea 0.5% monthly.',
    icar_package: 'ICAR-CCRI Citrus Nutrition'
  },

  // ZINC_006: Grapes Zinc Deficiency (Mottle Leaf)
  {
    rule_id: 'MICRO_ZN_GRAPES_001',
    category: 'nutrient',
    crop_code: 'grapes',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.metadata?.soil_ph_state === 'ALKALINE',
    cause: Cause.ZINC_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Mottle leaf - interveinal chlorosis, small leaves. Common in alkaline Maharashtra soils. Foliar ZnSO4 0.5% at bud burst, flowering, berry set.',
    icar_package: 'ICAR-NRC Grapes Nutrition'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// IRON DEFICIENCY RULES (4 rules)
// Second most common - especially in alkaline/calcareous soils
// ═══════════════════════════════════════════════════════════════════════════

export const IRON_DEFICIENCY_RULES: CauseRule[] = [
  // IRON_001: Universal Iron Chlorosis
  {
    rule_id: 'MICRO_FE_001',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      input.metadata?.soil_ph_state === 'ALKALINE' &&
      input.soil_states.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.IRON_CHLOROSIS_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-NBSS&LUP',
    scientific_basis: 'Iron chlorosis - young leaves yellow with green veins. Caused by: alkaline pH (>8), waterlogging, high bicarbonates. Fe present but unavailable. Foliar FeSO4 0.5% + citric acid 0.1%.',
    icar_package: 'ICAR Micronutrient Management'
  },

  // IRON_002: Groundnut Iron Chlorosis
  {
    rule_id: 'MICRO_FE_GROUNDNUT_001',
    category: 'nutrient',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      input.metadata?.soil_ph_state === 'ALKALINE',
    cause: Cause.IRON_CHLOROSIS_CRITICAL,
    priority: 10,
    scientific_source: 'ICAR-DGR Junagadh',
    scientific_basis: 'Groundnut MOST susceptible to Fe deficiency. Yellow leaves, stunted growth. Common in Gujarat calcareous soils. Spray FeSO4 0.5% + citric acid 0.1% at 25, 40, 55 DAS.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // IRON_003: Citrus Iron Chlorosis
  {
    rule_id: 'MICRO_FE_CITRUS_001',
    category: 'nutrient',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.metadata?.soil_bicarbonate_high === true,
    cause: Cause.IRON_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Citrus Fe chlorosis in high calcium/bicarbonate soils. Use Fe-EDTA chelate spray 0.5% OR soil application of iron sulphate + sulphur.',
    icar_package: 'ICAR-CCRI Nutrition Guide'
  },

  // IRON_004: Grapes Iron Deficiency
  {
    rule_id: 'MICRO_FE_GRAPES_001',
    category: 'nutrient',
    crop_code: 'grapes',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'grapes' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.metadata?.soil_ph_state === 'ALKALINE',
    cause: Cause.IRON_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Grapes sensitive to Fe deficiency in alkaline soils. Interveinal chlorosis on young leaves. Spray Fe-EDTA 0.5% or FeSO4 0.5% + citric acid 0.1%.',
    icar_package: 'ICAR-NRC Grapes PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// BORON DEFICIENCY RULES (5 rules)
// Critical for reproductive growth
// ═══════════════════════════════════════════════════════════════════════════

export const BORON_DEFICIENCY_RULES: CauseRule[] = [
  // BORON_001: Universal Reproductive Stage
  {
    rule_id: 'MICRO_B_001',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_stage === CropStage.REPRODUCTIVE &&
      ((typeof input.metadata?.flower_drop_percent === 'number' && input.metadata.flower_drop_percent > 30) ||
       input.metadata?.fruit_cracking === true),
    cause: Cause.BORON_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR Plant Nutrition',
    scientific_basis: 'Boron critical for pollen tube growth, fruit set, cell wall formation. Deficiency causes: flower drop, fruit cracking, hollow heart, poor seed formation. Foliar borax 0.1-0.2%.',
    icar_package: 'ICAR Boron Management'
  },

  // BORON_002: Cauliflower/Cabbage Hollow Stem
  {
    rule_id: 'MICRO_B_CAULIFLOWER_001',
    category: 'nutrient',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.crop_code === 'cauliflower' || input.crop_code === 'cabbage') &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.BORON_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Hollow stem/brown heart in cauliflower/cabbage due to B deficiency. Curd/head develops brown patches and hollow center. Unmarketable. Soil application borax @ 10 kg/ha at planting.',
    icar_package: 'ICAR-IIVR Vegetable Nutrition'
  },

  // BORON_003: Cotton Boll Shedding
  {
    rule_id: 'MICRO_B_COTTON_001',
    category: 'nutrient',
    crop_code: 'cotton',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      (typeof input.metadata?.square_boll_shedding_percent === 'number' && input.metadata.square_boll_shedding_percent > 40),
    cause: Cause.BORON_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Boron deficiency causes square and boll shedding. Anthers don\'t dehisce properly. Spray borax 0.2% at squaring and flowering.',
    icar_package: 'ICAR-CICR Cotton PoP 2024'
  },

  // BORON_004: Groundnut Hollow Heart
  {
    rule_id: 'MICRO_B_GROUNDNUT_001',
    category: 'nutrient',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.BORON_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Boron deficiency causes hollow heart in groundnut kernels. Empty pods, poor filling. Apply borax @ 10 kg/ha at sowing + foliar 0.2% at flowering.',
    icar_package: 'ICAR-DGR Groundnut PoP 2024'
  },

  // BORON_005: Citrus Fruit Cracking
  {
    rule_id: 'MICRO_B_CITRUS_001',
    category: 'nutrient',
    crop_code: 'citrus',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.metadata?.fruit_cracking === true,
    cause: Cause.BORON_DEFICIENCY,
    priority: 8,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Boron deficiency causes fruit cracking, gummosis, thick rind. Spray borax 0.1% at fruit set and fruit development.',
    icar_package: 'ICAR-CCRI Citrus PoP 2024'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SULPHUR DEFICIENCY RULES (4 rules)
// 4th macronutrient - critical for oilseeds
// ═══════════════════════════════════════════════════════════════════════════

export const SULPHUR_DEFICIENCY_RULES: CauseRule[] = [
  // SULPHUR_001: Universal Oilseeds
  {
    rule_id: 'MICRO_S_OILSEEDS_001',
    category: 'nutrient',
    crop_code: 'ALL_OILSEEDS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.soil_states.n === SoilNState.ADEQUATE_N &&
      input.metadata?.yellowing_on_young_leaves === true,
    cause: Cause.SULPHUR_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR Oilseeds Division',
    scientific_basis: 'Sulphur CRITICAL for oil synthesis in oilseeds. Deficiency looks like N deficiency but starts on YOUNG leaves (N starts on old). Reduces oil content by 2-3%. Apply gypsum 200 kg/ha OR elemental S 20-40 kg/ha.',
    icar_package: 'ICAR Oilseeds Nutrition'
  },

  // SULPHUR_002: Mustard Sulphur
  {
    rule_id: 'MICRO_S_MUSTARD_001',
    category: 'nutrient',
    crop_code: 'mustard',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'mustard' &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.SULPHUR_DEFICIENCY_CRITICAL,
    priority: 9,
    scientific_source: 'ICAR-DRMR',
    scientific_basis: 'Mustard family (Brassica) has HIGHEST S requirement. S:N ratio should be 1:7. Deficiency reduces oil % and pungency. Apply 40 kg S/ha.',
    icar_package: 'ICAR-DRMR Mustard PoP 2024'
  },

  // SULPHUR_003: Onion Sulphur for Pungency
  {
    rule_id: 'MICRO_S_ONION_001',
    category: 'nutrient',
    crop_code: 'onion',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'onion' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.SULPHUR_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Sulphur determines onion pungency and storage quality. Allium crops need high S. Apply 30-40 kg S/ha for good bulb quality.',
    icar_package: 'ICAR-DOGR Onion PoP 2024'
  },

  // SULPHUR_004: Pulses Protein Synthesis
  {
    rule_id: 'MICRO_S_PULSES_001',
    category: 'nutrient',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.soil_states.n === SoilNState.ADEQUATE_N,
    cause: Cause.SULPHUR_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Sulphur component of amino acids (methionine, cysteine). Critical for protein synthesis in pulses. Apply 20-30 kg S/ha.',
    icar_package: 'ICAR-IIPR Pulse Nutrition'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MANGANESE, COPPER, MOLYBDENUM RULES (3 rules)
// ═══════════════════════════════════════════════════════════════════════════

export const OTHER_MICRONUTRIENT_RULES: CauseRule[] = [
  // MANGANESE_001: Cereals Gray Speck
  {
    rule_id: 'MICRO_MN_CEREALS_001',
    category: 'nutrient',
    crop_code: 'ALL_CEREALS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      input.metadata?.gray_speck_symptoms === true,
    cause: Cause.MANGANESE_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-IARI',
    scientific_basis: 'Manganese deficiency causes gray speck disease in cereals. Interveinal chlorosis with gray necrotic spots. Common in alkaline/organic soils. Spray MnSO4 0.5%.',
    icar_package: 'ICAR Micronutrient Guide'
  },

  // COPPER_001: Citrus Die-back
  {
    rule_id: 'MICRO_CU_CITRUS_001',
    category: 'nutrient',
    crop_code: 'citrus',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'citrus' &&
      input.metadata?.shoot_dieback === true,
    cause: Cause.COPPER_DEFICIENCY,
    priority: 7,
    scientific_source: 'ICAR-CCRI',
    scientific_basis: 'Copper deficiency causes shoot die-back, gum pockets in fruit. Multiple budding (witches broom). Spray copper sulphate 0.3%.',
    icar_package: 'ICAR-CCRI Citrus Disorders'
  },

  // MOLYBDENUM_001: Pulses Nitrogen Fixation
  {
    rule_id: 'MICRO_MO_PULSES_001',
    category: 'nutrient',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states.n === SoilNState.LOW_N &&
      input.metadata?.poor_nodulation === true,
    cause: Cause.MOLYBDENUM_DEFICIENCY,
    priority: 6,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Molybdenum component of nitrogenase enzyme. Essential for N-fixation in pulses. Deficiency = poor nodulation. Seed treatment with Na-molybdate @ 2g/kg seed.',
    icar_package: 'ICAR-IIPR Pulse Production'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const MICRONUTRIENT_RULES: CauseRule[] = [
  ...ZINC_DEFICIENCY_RULES,
  ...IRON_DEFICIENCY_RULES,
  ...BORON_DEFICIENCY_RULES,
  ...SULPHUR_DEFICIENCY_RULES,
  ...OTHER_MICRONUTRIENT_RULES
];

export default MICRONUTRIENT_RULES;
