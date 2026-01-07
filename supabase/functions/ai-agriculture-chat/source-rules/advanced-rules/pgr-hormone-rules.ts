/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLANT GROWTH REGULATOR (PGR) RULES - HORMONAL YIELD ENHANCEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Based on:
 * - Israel, Netherlands, Brazil commercial agriculture
 * - Technology: Gibberellins, Cytokinins, Auxins, Ethylene manipulators
 * - Yield Impact: 20-40% increase
 * 
 * Sources:
 * - Israeli Greenhouse Technology (Netafim, Phytech)
 * - Netherlands Protected Cultivation Research (Wageningen)
 * - Bayer CropScience PGR Division
 * - Syngenta Plant Hormones Research
 * - Brazil EMBRAPA Modern Agriculture
 * 
 * CRITICAL: These are advanced technologies NOT in standard ICAR PoP
 */

import {
  CauseRule,
  Cause,
  CropStage,
  NDVIState,
  NDVITrend,
  SoilNState,
  WeatherState
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TOMATO PGR RULES (Israel/Netherlands Greenhouse Technology)
// ═══════════════════════════════════════════════════════════════════════════

export const TOMATO_PGR_RULES: CauseRule[] = [
  // PGR_TOMATO_001: GA3 for Fruit Set under Low Temperature
  {
    rule_id: 'PGR_TOMATO_001',
    category: 'pgr_hormone',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.days_after_sowing >= 35 && input.days_after_sowing <= 50 &&
      input.weather_state === WeatherState.COLD_STRESS,
    cause: Cause.GIBBERELLIN_FOR_FRUIT_SET,
    priority: 8,
    scientific_source: 'Israeli Protected Cultivation + Netherlands Wageningen',
    scientific_basis: 'Gibberellic Acid (GA3) @ 25-50 ppm spray during flowering overcomes poor pollination under cold stress (<15°C night temp). Increases fruit set by 40-60%. Commercial standard in Israel/Netherlands greenhouses.',
    icar_package: 'Not in ICAR - Global Advanced Technology'
  },

  // PGR_TOMATO_002: PCPA/4-CPA for Parthenocarpy (Seedless Fruit)
  {
    rule_id: 'PGR_TOMATO_002',
    category: 'pgr_hormone',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.REPRODUCTIVE &&
      input.days_after_sowing >= 35 &&
      (input.weather_state === WeatherState.HEAT_STRESS || input.weather_state === WeatherState.HIGH_HUMIDITY),
    cause: Cause.AUXIN_PARTHENOCARPY,
    priority: 8,
    scientific_source: 'Japan Tomato Research + Netherlands Protected Cultivation',
    scientific_basis: 'Para-Chlorophenoxyacetic acid (PCPA/4-CPA) @ 10-15 ppm induces parthenocarpic fruit development under heat stress or poor pollination. Increases marketable yield by 35-50%.',
    icar_package: 'Not in ICAR - Japan/Israel Technology'
  },

  // PGR_TOMATO_003: NAA for Pre-Harvest Fruit Drop Prevention
  {
    rule_id: 'PGR_TOMATO_003',
    category: 'pgr_hormone',
    crop_code: 'tomato',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.crop_stage === CropStage.MATURITY &&
      input.days_after_sowing >= 70 &&
      input.weather_state === WeatherState.HEAT_STRESS,
    cause: Cause.AUXIN_FRUIT_RETENTION,
    priority: 7,
    scientific_source: 'US Commercial Tomato Production',
    scientific_basis: 'Naphthalene Acetic Acid (NAA) @ 10-20 ppm reduces pre-harvest fruit drop by 40-60% under heat stress. Strengthens abscission zone.',
    icar_package: 'Not in ICAR - US Commercial Standard'
  },

  // PGR_TOMATO_004: Cytokinin for Delayed Senescence
  {
    rule_id: 'PGR_TOMATO_004',
    category: 'pgr_hormone',
    crop_code: 'tomato',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'tomato' &&
      input.days_after_sowing >= 60 &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.CYTOKININ_DELAYED_SENESCENCE,
    priority: 7,
    scientific_source: 'Netherlands Shelf-Life Research',
    scientific_basis: 'Benzyl Adenine (BA) @ 50-100 ppm delays leaf senescence by blocking ethylene action. Extends productive period by 15-20 days. Results in 2-3 additional harvest flushes.',
    icar_package: 'Not in ICAR - Netherlands Technology'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// COTTON PGR RULES (Brazil/USA Commercial Practice)
// ═══════════════════════════════════════════════════════════════════════════

export const COTTON_PGR_RULES: CauseRule[] = [
  // PGR_COTTON_001: Mepiquat Chloride for Compact Growth
  {
    rule_id: 'PGR_COTTON_001',
    category: 'pgr_hormone',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.days_after_sowing >= 35 && input.days_after_sowing <= 55 &&
      input.ndvi_state === NDVIState.EXCELLENT &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.MEPIQUAT_CHLORIDE_COTTON,
    priority: 8,
    scientific_source: 'Brazil EMBRAPA + USA Cotton Research',
    scientific_basis: 'Mepiquat Chloride (Pix) @ 24-48 g a.i./ha reduces excessive vegetative growth, improves light penetration, reduces lodging, and redirects energy to fruiting. MANDATORY in Brazil high-input cotton. Increases boll set by 15-25%.',
    icar_package: 'Not in ICAR - Brazil/USA Commercial Standard'
  },

  // PGR_COTTON_002: Ethephon for Boll Opening Synchronization
  {
    rule_id: 'PGR_COTTON_002',
    category: 'pgr_hormone',
    crop_code: 'cotton',
    stage_applicable: [CropStage.MATURITY],
    conditions: (input) =>
      input.crop_code === 'cotton' &&
      input.crop_stage === CropStage.MATURITY &&
      input.days_after_sowing >= 140,
    cause: Cause.ETHEPHON_BOLL_OPENING,
    priority: 7,
    scientific_source: 'USA Mechanical Harvesting Research + Australia',
    scientific_basis: 'Ethephon @ 720-960 ml/ha releases ethylene, synchronizes boll opening, promotes leaf abscission for mechanical harvesting. Enables single-pick harvest with 90%+ boll opening.',
    icar_package: 'Not in ICAR - USA/Australia Standard'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// WHEAT PGR RULES (Europe/USA Commercial Practice)
// ═══════════════════════════════════════════════════════════════════════════

export const WHEAT_PGR_RULES: CauseRule[] = [
  // PGR_WHEAT_001: Chlormequat Chloride for Lodging Prevention
  {
    rule_id: 'PGR_WHEAT_001',
    category: 'pgr_hormone',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 25 && input.days_after_sowing <= 35 &&
      input.soil_states.n === SoilNState.HIGH_N &&
      input.ndvi_state === NDVIState.EXCELLENT,
    cause: Cause.CCC_LODGING_CONTROL,
    priority: 8,
    scientific_source: 'European Wheat Research + BASF CCC Research',
    scientific_basis: 'Chlormequat Chloride (CCC) @ 1.5-2.0 L/ha shortens and thickens stems, reduces lodging by 70-90% in high-nitrogen conditions. Increases grain yield by 8-15%.',
    icar_package: 'Not in ICAR - European Standard'
  },

  // PGR_WHEAT_002: Trinexapac-ethyl for Enhanced Lodging Control
  {
    rule_id: 'PGR_WHEAT_002',
    category: 'pgr_hormone',
    crop_code: 'wheat',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.days_after_sowing >= 55 && input.days_after_sowing <= 65 &&
      input.ndvi_state === NDVIState.EXCELLENT,
    cause: Cause.TRINEXAPAC_LODGING,
    priority: 8,
    scientific_source: 'UK High-Yield Wheat Systems',
    scientific_basis: 'Trinexapac-ethyl (Moddus) @ 200-300 ml/ha shortens internodes, thickens cell walls, increases root biomass. Reduces lodging by 80-95% and increases yield by 10-18%.',
    icar_package: 'Not in ICAR - UK/Europe Technology'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RICE PGR RULES (Japan/Korea Commercial Practice)
// ═══════════════════════════════════════════════════════════════════════════

export const RICE_PGR_RULES: CauseRule[] = [
  // PGR_RICE_001: Paclobutrazol for Lodging + Panicle Enhancement
  {
    rule_id: 'PGR_RICE_001',
    category: 'pgr_hormone',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.days_after_sowing >= 40 && input.days_after_sowing <= 50 &&
      input.soil_states.n === SoilNState.HIGH_N,
    cause: Cause.PACLOBUTRAZOL_COMPACT_GROWTH,
    priority: 8,
    scientific_source: 'Japan Rice Research + Korea RDA',
    scientific_basis: 'Paclobutrazol @ 250-350 g/ha at panicle initiation stage (PI-5 days) reduces plant height by 15-20%, increases culm thickness, reduces lodging by 60-80%, and INCREASES PANICLE SIZE by 10-15%. Can increase yield by 12-20%.',
    icar_package: 'Not in ICAR - Japan/Korea Technology'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL PGR RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_PGR_RULES: CauseRule[] = [
  ...TOMATO_PGR_RULES,
  ...COTTON_PGR_RULES,
  ...WHEAT_PGR_RULES,
  ...RICE_PGR_RULES,
];

export default ALL_PGR_RULES;
