/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MICROBIOME & BIOLOGICAL ENHANCEMENT RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Based on:
 * - USA (USDA ARS Microbiome Research)
 * - Brazil (EMBRAPA Biofertilizers)
 * - India (ICAR-NBAIR, ICAR-IARI Microbiology)
 * 
 * Technology: Biofertilizers, Biocontrol agents, Biostimulants
 * Yield Impact: 15-25% increase with reduced chemical inputs
 * 
 * Sources:
 * - Indigo Agriculture (USA)
 * - Pivot Bio (USA)
 * - ICAR-NBAIR Biological Control
 * - Japan/Korea Silicon Research
 */

import {
  CauseRule,
  Cause,
  CropStage,
  SoilNState,
  SoilPState,
  SoilOCState,
  NDVIState,
  NDVITrend,
  WeatherState
} from '../types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// NITROGEN FIXATION RULES (Biofertilizers)
// ═══════════════════════════════════════════════════════════════════════════

export const NITROGEN_FIXATION_RULES: CauseRule[] = [
  // BIO_N_001: Azospirillum for Cereals
  {
    rule_id: 'BIO_N_001',
    category: 'biological',
    crop_code: '*', // All cereals
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      ['rice', 'wheat', 'maize', 'sorghum', 'pearl_millet'].includes(input.crop_code) &&
      (input.crop_stage === CropStage.SOWING || input.crop_stage === CropStage.GERMINATION) &&
      input.soil_states.n === SoilNState.LOW_N,
    cause: Cause.AZOSPIRILLUM_N_FIXATION,
    priority: 6,
    scientific_source: 'ICAR-IARI Microbiology + Brazil EMBRAPA',
    scientific_basis: 'Azospirillum brasilense fixes 20-40 kg N/ha for cereals through associative nitrogen fixation. Seed inoculation @ 200g/10kg seed or soil application @ 2kg/ha. Reduces N fertilizer requirement by 20-25%.',
    icar_package: 'ICAR Biofertilizer Guidelines 2024'
  },

  // BIO_N_002: Azotobacter for Non-Legumes
  {
    rule_id: 'BIO_N_002',
    category: 'biological',
    crop_code: '*', // All non-legumes
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      !['soybean', 'groundnut', 'gram', 'lentil', 'pea', 'moong', 'urad', 'arhar'].includes(input.crop_code) &&
      input.crop_stage === CropStage.SOWING,
    cause: Cause.AZOTOBACTER_N_FIXATION,
    priority: 5,
    scientific_source: 'ICAR-IARI + USA Pivot Bio',
    scientific_basis: 'Azotobacter chroococcum is a free-living N fixer providing 15-30 kg N/ha. Also produces plant growth hormones (IAA, GA). Apply @ 200g/10kg seed or 2kg/ha with FYM.',
    icar_package: 'ICAR Biofertilizer Guidelines 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PHOSPHORUS SOLUBILIZATION RULES
// ═══════════════════════════════════════════════════════════════════════════

export const PHOSPHORUS_RULES: CauseRule[] = [
  // BIO_P_001: PSB for Phosphorus Mobilization
  {
    rule_id: 'BIO_P_001',
    category: 'biological',
    crop_code: '*', // All crops
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      input.soil_states.p === SoilPState.LOW_P &&
      (input.crop_stage === CropStage.SOWING || input.crop_stage === CropStage.GERMINATION),
    cause: Cause.PSB_P_SOLUBILIZATION,
    priority: 6,
    scientific_source: 'ICAR-IARI + International Phosphorus Research',
    scientific_basis: 'Phosphate Solubilizing Bacteria (Bacillus megaterium, Pseudomonas striata) solubilize fixed phosphorus through organic acid production. Increases P availability by 20-30%. Apply @ 200g/10kg seed or 2kg/ha.',
    icar_package: 'ICAR Biofertilizer Guidelines 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BIOCONTROL RULES (Biological Pest/Disease Management)
// ═══════════════════════════════════════════════════════════════════════════

export const BIOCONTROL_RULES: CauseRule[] = [
  // BIO_CONTROL_001: Trichoderma for Soil-Borne Diseases
  {
    rule_id: 'BIO_CONTROL_001',
    category: 'biological',
    crop_code: '*', // All crops
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      input.crop_stage === CropStage.SOWING &&
      input.soil_states.oc === SoilOCState.LOW_OC,
    cause: Cause.TRICHODERMA_BIOCONTROL,
    priority: 7,
    scientific_source: 'ICAR-NBAIR + International Biocontrol Research',
    scientific_basis: 'Trichoderma viride/harzianum controls soil-borne pathogens (Fusarium, Rhizoctonia, Pythium, Sclerotium) through mycoparasitism and antibiosis. Seed treatment @ 4g/kg or soil application @ 2.5kg/ha mixed with 100kg FYM.',
    icar_package: 'ICAR-NBAIR Biocontrol Guidelines 2024'
  },

  // BIO_CONTROL_002: Pseudomonas for Root Zone Protection
  {
    rule_id: 'BIO_CONTROL_002',
    category: 'biological',
    crop_code: '*', // All crops
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input) =>
      (input.crop_stage === CropStage.SOWING || input.crop_stage === CropStage.VEGETATIVE) &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.PSEUDOMONAS_BIOCONTROL,
    priority: 6,
    scientific_source: 'ICAR-NBAIR + USA USDA ARS',
    scientific_basis: 'Pseudomonas fluorescens produces siderophores, HCN, and antibiotics controlling bacterial and fungal pathogens. Also induces systemic resistance. Apply @ 10g/L for seed treatment or 2.5kg/ha soil drench.',
    icar_package: 'ICAR-NBAIR Biocontrol Guidelines 2024'
  },

  // BIO_CONTROL_003: VAM for Nutrient Uptake Enhancement
  {
    rule_id: 'BIO_CONTROL_003',
    category: 'biological',
    crop_code: '*', // All crops except brassicas
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      !['cabbage', 'cauliflower', 'broccoli', 'mustard'].includes(input.crop_code) &&
      input.crop_stage === CropStage.SOWING &&
      input.soil_states.p === SoilPState.LOW_P,
    cause: Cause.VAM_NUTRIENT_UPTAKE,
    priority: 6,
    scientific_source: 'International Mycorrhiza Research',
    scientific_basis: 'Vesicular Arbuscular Mycorrhiza (Glomus spp.) extends root zone by 100x through hyphal network. Improves P, Zn, Cu uptake. Critical for low-P soils. Apply @ 1kg/ha with organic matter.',
    icar_package: 'ICAR Biofertilizer Guidelines 2024'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// BIOSTIMULANT RULES (Advanced Technology)
// ═══════════════════════════════════════════════════════════════════════════

export const BIOSTIMULANT_RULES: CauseRule[] = [
  // BIO_STIM_001: Humic Acid for Soil Health
  {
    rule_id: 'BIO_STIM_001',
    category: 'biological',
    crop_code: '*', // All crops
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states.oc === SoilOCState.LOW_OC &&
      input.ndvi_state === NDVIState.MODERATE_STRESS,
    cause: Cause.HUMIC_ACID_APPLICATION,
    priority: 5,
    scientific_source: 'Global Biostimulant Research',
    scientific_basis: 'Humic acid @ 2-5 kg/ha improves soil structure, nutrient availability, and root growth. Chelates micronutrients for better uptake. $3 billion global industry. Apply with irrigation water or as foliar spray.',
    icar_package: 'Not in ICAR - Global Commercial Practice'
  },

  // BIO_STIM_002: Seaweed Extract for Stress Tolerance
  {
    rule_id: 'BIO_STIM_002',
    category: 'biological',
    crop_code: '*', // All crops
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      (input.weather_state === WeatherState.HEAT_STRESS || 
       input.weather_state === WeatherState.COLD_STRESS ||
       input.weather_state === WeatherState.DRY_SPELL) &&
      input.ndvi_trend === NDVITrend.DECLINING,
    cause: Cause.SEAWEED_EXTRACT_BIOSTIMULANT,
    priority: 6,
    scientific_source: 'Ireland/Norway Seaweed Research + Global Biostimulants',
    scientific_basis: 'Seaweed extract (Ascophyllum nodosum) contains cytokinins, auxins, betaines, and alginates that improve stress tolerance by 30-40%. Foliar spray @ 2-3 ml/L during stress periods.',
    icar_package: 'Not in ICAR - Global Technology'
  },

  // BIO_STIM_003: Silicon for Stress Tolerance (Japan/Korea Technology)
  {
    rule_id: 'BIO_STIM_003',
    category: 'biological',
    crop_code: '*', // Especially rice, wheat, sugarcane
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      ['rice', 'wheat', 'sugarcane', 'maize'].includes(input.crop_code) &&
      (input.weather_state === WeatherState.HEAT_STRESS || input.ndvi_state === NDVIState.MODERATE_STRESS),
    cause: Cause.SILICON_APPLICATION,
    priority: 6,
    scientific_source: 'Japan/Korea Silicon Research + IRRI',
    scientific_basis: 'Silicon strengthens cell walls, reduces pest/disease susceptibility, improves drought/heat tolerance. Essential for rice, sugarcane, wheat. Apply potassium silicate @ 2-4 kg/ha or foliar @ 0.1-0.2%.',
    icar_package: 'Not in ICAR - Japan/Korea Essential Nutrient'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT ALL BIOLOGICAL RULES
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_BIOLOGICAL_RULES: CauseRule[] = [
  ...NITROGEN_FIXATION_RULES,
  ...PHOSPHORUS_RULES,
  ...BIOCONTROL_RULES,
  ...BIOSTIMULANT_RULES,
];

export default ALL_BIOLOGICAL_RULES;
