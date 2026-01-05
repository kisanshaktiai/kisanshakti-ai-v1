/**
 * Soil Nutrient Rules
 * Rules for macro and micronutrient management based on soil test results
 * Total: 35 rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  SoilNState,
  SoilPState,
  SoilKState,
  SoilZincState,
  SoilOCState
} from '../../types';

// ============================================================================
// MACRONUTRIENT DEFICIENCY RULES (12 rules)
// ============================================================================

const MACRONUTRIENT_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_NUT_N_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY_CRITICAL,
    priority: 4,
    scientific_source: 'Severe N deficiency requires immediate correction',
    scientific_basis: 'Apply 25% extra N over recommendation in splits. Use urea or ammonium sulfate. Immediate basal + 2-3 top dressings.',
  },
  {
    rule_id: 'SOIL_NUT_N_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Low N requires adequate fertilization',
    scientific_basis: 'Apply recommended N dose based on crop requirement and target yield. Split application: basal, tillering, heading.',
  },
  {
    rule_id: 'SOIL_NUT_N_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.HIGH_N,
    cause: Cause.EXCESS_NITROGEN,
    priority: 5,
    scientific_source: 'Excess N causes lodging and disease susceptibility',
    scientific_basis: 'Reduce N application by 25%. Avoid late N. Use PGR if lodging risk. Skip or reduce top dressing.',
  },
  {
    rule_id: 'SOIL_NUT_P_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.phosphorus === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY_CRITICAL,
    priority: 4,
    scientific_source: 'Severe P deficiency limits root development',
    scientific_basis: 'Apply 50% extra P as basal. Use DAP/SSP + PSB for better availability. Full dose basal, band placement preferred.',
  },
  {
    rule_id: 'SOIL_NUT_P_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.phosphorus === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Low P requires correction for optimal growth',
    scientific_basis: 'Apply recommended P dose with PSB. Ensure pH is suitable for P availability. Full basal application.',
  },
  {
    rule_id: 'SOIL_NUT_K_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.potassium === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY_CRITICAL,
    priority: 4,
    scientific_source: 'Severe K deficiency affects quality and stress tolerance',
    scientific_basis: 'Apply 50% extra K. Use MOP or SOP based on crop. Split application for sandy soils. Basal + top dressing at flowering.',
  },
  {
    rule_id: 'SOIL_NUT_K_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states?.potassium === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'Low K affects fruit quality and disease resistance',
    scientific_basis: 'Apply recommended K dose. Consider SOP for quality-sensitive crops. Split 50:50 basal and flowering.',
  },
  {
    rule_id: 'SOIL_NUT_S_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'S deficiency common in light-textured, low OM soils',
    scientific_basis: 'Apply gypsum 200-300 kg/ha or use S-containing fertilizers (SSP, AS). Basal application.',
  },
  {
    rule_id: 'SOIL_NUT_S_002',
    category: 'nutrient',
    crop_code: 'oilseeds',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.crop_group === 'OILSEEDS',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Oilseeds have high S requirement for oil synthesis',
    scientific_basis: 'Apply gypsum 400 kg/ha or elemental S 40 kg/ha for oilseeds. Full basal, essential for oil quality.',
  },
  {
    rule_id: 'SOIL_NUT_CA_001',
    category: 'nutrient',
    crop_code: 'groundnut',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'groundnut' &&
      input.crop_stage === CropStage.REPRODUCTIVE,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Ca critical for groundnut peg and pod development',
    scientific_basis: 'Apply gypsum 500 kg/ha at pegging. Ensure Ca in pod zone. At flowering and pegging.',
  },
  {
    rule_id: 'SOIL_NUT_MG_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Mg is central to chlorophyll molecule',
    scientific_basis: 'Apply MgSO4 25-50 kg/ha or dolomite if pH also needs correction. Basal or foliar 2% MgSO4.',
  },
  {
    rule_id: 'SOIL_NUT_NPK_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.LOW_N &&
      input.soil_states?.phosphorus === SoilPState.LOW_P &&
      input.soil_states?.potassium === SoilKState.LOW_K,
    cause: Cause.SEVERE_NUTRIENT_DEPLETION,
    priority: 3,
    scientific_source: 'Multiple deficiencies require integrated soil fertility management',
    scientific_basis: 'Apply NPK complex + organic manure. Address most limiting nutrient first. Comprehensive fertility program needed.',
  },
];

// ============================================================================
// MICRONUTRIENT DEFICIENCY RULES (15 rules)
// ============================================================================

const MICRONUTRIENT_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_MIC_ZN_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 4,
    scientific_source: 'Zn is most widespread micronutrient deficiency in India',
    scientific_basis: 'Apply ZnSO4 25 kg/ha soil application or 0.5% foliar spray twice. Basal + foliar at tillering and heading.',
  },
  {
    rule_id: 'SOIL_MIC_ZN_002',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 4,
    scientific_source: 'Rice-wheat systems deplete Zn rapidly',
    scientific_basis: 'Apply ZnSO4 25 kg/ha in nursery + main field. Zn-coated urea option. Nursery and basal in main field.',
  },
  {
    rule_id: 'SOIL_MIC_FE_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Fe deficiency causes chlorosis in sensitive crops',
    scientific_basis: 'Apply FeSO4 50 kg/ha soil or 1% foliar spray + citric acid. At chlorosis onset, repeat every 10-15 days.',
  },
  {
    rule_id: 'SOIL_MIC_MN_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Mn deficiency in high pH, sandy, or high OM soils',
    scientific_basis: 'Apply MnSO4 25 kg/ha soil or 0.5% foliar spray. At deficiency symptoms, repeat if needed.',
  },
  {
    rule_id: 'SOIL_MIC_CU_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.HIGH_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Cu deficiency in peaty, sandy, and high pH soils',
    scientific_basis: 'Apply CuSO4 5-10 kg/ha soil or 0.2% foliar spray. Basal or at vegetative stage foliar.',
  },
  {
    rule_id: 'SOIL_MIC_B_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'B critical for flowering and fruit set',
    scientific_basis: 'Apply borax 10 kg/ha soil or 0.2% boric acid foliar spray. Basal or pre-flowering foliar.',
  },
  {
    rule_id: 'SOIL_MIC_B_002',
    category: 'nutrient',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.SOWING, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'cauliflower',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Cole crops have high B requirement',
    scientific_basis: 'Apply borax 15 kg/ha at transplanting + foliar at button stage. Transplanting and pre-curd formation.',
  },
  {
    rule_id: 'SOIL_MIC_MO_001',
    category: 'nutrient',
    crop_code: 'legumes',
    stage_applicable: [CropStage.SOWING, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_group === 'PULSES',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Mo essential for N fixation in legumes',
    scientific_basis: 'Apply sodium molybdate 1 kg/ha soil or 0.05% foliar or seed treatment 4g/kg. Seed treatment preferred.',
  },
  {
    rule_id: 'SOIL_MIC_MO_002',
    category: 'nutrient',
    crop_code: 'cauliflower',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.crop_code === 'cauliflower',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Mo deficiency causes whiptail in cauliflower',
    scientific_basis: 'Apply ammonium molybdate 0.5 kg/ha or raise pH if acidic. At transplanting or before curd initiation.',
  },
  {
    rule_id: 'SOIL_MIC_MULTI_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Multiple micronutrient deficiencies common in calcareous soils',
    scientific_basis: 'Apply micronutrient mixture soil application or chelated foliar spray. Basal + foliar at critical stages.',
  },
  {
    rule_id: 'SOIL_MIC_MULTI_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Sandy, low OM soils have multiple deficiencies',
    scientific_basis: 'Apply FYM + soil test-based micronutrient application. Build OM over time. Annual organic matter addition.',
  },
  {
    rule_id: 'SOIL_MIC_CHELATE_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Chelated forms remain available in alkaline soils',
    scientific_basis: 'Use EDTA/EDDHA chelated micronutrients for high pH soils. Fertigation or foliar application.',
  },
  {
    rule_id: 'SOIL_MIC_ZN_WHEAT_001',
    category: 'nutrient',
    crop_code: 'wheat',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.crop_code === 'wheat' &&
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 4,
    scientific_source: 'Zinc critical for wheat grain quality',
    scientific_basis: 'Apply ZnSO4 25 kg/ha basal + seed treatment for biofortification.',
  },
  {
    rule_id: 'SOIL_MIC_FE_RICE_001',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Iron management in rice',
    scientific_basis: 'Drain field periodically to prevent Fe toxicity in waterlogged conditions.',
  },
  {
    rule_id: 'SOIL_MIC_SI_001',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 6,
    scientific_source: 'Silicon for rice disease resistance',
    scientific_basis: 'Apply calcium silicate 200 kg/ha for improved disease resistance and stress tolerance.',
  },
];

// ============================================================================
// NUTRIENT IMBALANCE RULES (8 rules)
// ============================================================================

const NUTRIENT_IMBALANCE_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_IMB_NK_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.HIGH_N &&
      input.soil_states?.potassium === SoilKState.LOW_K,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'High N:K ratio causes K-induced deficiency',
    scientific_basis: 'Increase K application to maintain N:K ratio of 2:1 or less. Adjust fertilizer schedule immediately.',
  },
  {
    rule_id: 'SOIL_IMB_PZN_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.phosphorus === SoilPState.HIGH_P &&
      input.soil_states?.zinc === SoilZincState.LOW_ZN,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 5,
    scientific_source: 'Excess P induces Zn deficiency',
    scientific_basis: 'Apply Zn separately from P. Use Zn chelate. Reduce P if excessive. Apply Zn 2 weeks before or after P.',
  },
  {
    rule_id: 'SOIL_IMB_CAMG_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'High Ca:Mg ratio induces Mg deficiency',
    scientific_basis: 'Apply MgSO4 or use dolomite instead of calcitic lime. Based on soil test, pre-season correction.',
  },
  {
    rule_id: 'SOIL_IMB_KMG_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.potassium === SoilKState.HIGH_K,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'High K antagonizes Mg uptake',
    scientific_basis: 'Balance K application. Apply MgSO4 foliar 2%. Mid-season Mg foliar spray.',
  },
  {
    rule_id: 'SOIL_IMB_NP_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.LOW_N &&
      input.soil_states?.phosphorus === SoilPState.HIGH_P,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'P excess with low N limits growth',
    scientific_basis: 'Increase N application. Skip P application for one season. Rebalance NPK based on soil test.',
  },
  {
    rule_id: 'SOIL_IMB_OC_N_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC &&
      input.soil_states?.nitrogen === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 4,
    scientific_source: 'Low OC limits N mineralization',
    scientific_basis: 'Build organic carbon through FYM/compost. Supplement with mineral N until OM improves.',
  },
  {
    rule_id: 'SOIL_IMB_HIGH_N_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.HIGH_N,
    cause: Cause.EXCESS_NITROGEN_LODGING,
    priority: 5,
    scientific_source: 'Excess N causes lodging risk',
    scientific_basis: 'Apply growth regulator if lodging risk is high. Reduce late N applications.',
  },
  {
    rule_id: 'SOIL_IMB_HIGH_N_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states?.nitrogen === SoilNState.HIGH_N,
    cause: Cause.EXCESS_NITROGEN_DISEASE,
    priority: 5,
    scientific_source: 'Excess N increases disease susceptibility',
    scientific_basis: 'Monitor for fungal diseases. Prophylactic fungicide application may be needed.',
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const SOIL_NUTRIENT_RULES: CauseRule[] = [
  ...MACRONUTRIENT_RULES,
  ...MICRONUTRIENT_RULES,
  ...NUTRIENT_IMBALANCE_RULES,
];

export {
  MACRONUTRIENT_RULES,
  MICRONUTRIENT_RULES,
  NUTRIENT_IMBALANCE_RULES,
};

export default SOIL_NUTRIENT_RULES;
