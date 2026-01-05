/**
 * Soil Nutrient Rules
 * Rules for macro and micronutrient management based on soil test results
 * Total: 35 rules
 */

import { CauseRule, Cause, RuleCategory } from '../../types';

// ============================================================================
// MACRONUTRIENT DEFICIENCY RULES (12 rules)
// ============================================================================

const MACRONUTRIENT_RULES: CauseRule[] = [
  {
    id: 'SOIL_NUT_N_001',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      nitrogen_status: 'very_low',
      available_n: { max: 140 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Severe N deficiency requires immediate correction',
    yield_impact: { min: 25, max: 50 },
    action: {
      type: 'fertilizer',
      description: 'Apply 25% extra N over recommendation in splits; use urea or ammonium sulfate',
      timing: 'Immediate basal + 2-3 top dressings',
    },
  },
  {
    id: 'SOIL_NUT_N_002',
    cause: Cause.NITROGEN_DEFICIENCY,
    conditions: {
      nitrogen_status: 'low',
      available_n: { min: 140, max: 280 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Low N requires adequate fertilization',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'fertilizer',
      description: 'Apply recommended N dose based on crop requirement and target yield',
      timing: 'Split application: basal, tillering, heading',
    },
  },
  {
    id: 'SOIL_NUT_N_003',
    cause: Cause.NITROGEN_EXCESS,
    conditions: {
      nitrogen_status: 'high',
      available_n: { min: 560 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Excess N causes lodging and disease susceptibility',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'fertilizer',
      description: 'Reduce N application by 25%; avoid late N; use PGR if lodging risk',
      timing: 'Skip or reduce top dressing',
    },
  },
  {
    id: 'SOIL_NUT_P_001',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    conditions: {
      phosphorus_status: 'very_low',
      available_p: { max: 10 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Severe P deficiency limits root development',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'fertilizer',
      description: 'Apply 50% extra P as basal; use DAP/SSP + PSB for better availability',
      timing: 'Full dose basal, band placement preferred',
    },
  },
  {
    id: 'SOIL_NUT_P_002',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    conditions: {
      phosphorus_status: 'low',
      available_p: { min: 10, max: 25 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Low P requires correction for optimal growth',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply recommended P dose with PSB; ensure pH is suitable for P availability',
      timing: 'Full basal application',
    },
  },
  {
    id: 'SOIL_NUT_K_001',
    cause: Cause.POTASSIUM_DEFICIENCY,
    conditions: {
      potassium_status: 'very_low',
      available_k: { max: 110 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Severe K deficiency affects quality and stress tolerance',
    yield_impact: { min: 20, max: 35 },
    action: {
      type: 'fertilizer',
      description: 'Apply 50% extra K; use MOP or SOP based on crop; split application for sandy soils',
      timing: 'Basal + top dressing at flowering',
    },
  },
  {
    id: 'SOIL_NUT_K_002',
    cause: Cause.POTASSIUM_DEFICIENCY,
    conditions: {
      potassium_status: 'low',
      available_k: { min: 110, max: 280 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Low K affects fruit quality and disease resistance',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Apply recommended K dose; consider SOP for quality-sensitive crops',
      timing: 'Split 50:50 basal and flowering',
    },
  },
  {
    id: 'SOIL_NUT_S_001',
    cause: Cause.SULFUR_DEFICIENCY,
    conditions: {
      sulfur_status: 'low',
      available_s: { max: 10 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'S deficiency common in light-textured, low OM soils',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Apply gypsum 200-300 kg/ha or use S-containing fertilizers (SSP, AS)',
      timing: 'Basal application',
    },
  },
  {
    id: 'SOIL_NUT_S_002',
    cause: Cause.SULFUR_DEFICIENCY,
    conditions: {
      sulfur_status: 'low',
      crop_type: 'oilseeds',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Oilseeds have high S requirement for oil synthesis',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'fertilizer',
      description: 'Apply gypsum 400 kg/ha or elemental S 40 kg/ha for oilseeds',
      timing: 'Full basal, essential for oil quality',
    },
  },
  {
    id: 'SOIL_NUT_CA_001',
    cause: Cause.CALCIUM_DEFICIENCY,
    conditions: {
      calcium_status: 'low',
      crop_type: 'groundnut',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Ca critical for groundnut peg and pod development',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'fertilizer',
      description: 'Apply gypsum 500 kg/ha at pegging; ensure Ca in pod zone',
      timing: 'At flowering and pegging',
    },
  },
  {
    id: 'SOIL_NUT_MG_001',
    cause: Cause.MAGNESIUM_DEFICIENCY,
    conditions: {
      magnesium_status: 'low',
      exchangeable_mg: { max: 0.5 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mg is central to chlorophyll molecule',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Apply MgSO4 25-50 kg/ha or dolomite if pH also needs correction',
      timing: 'Basal or foliar 2% MgSO4',
    },
  },
  {
    id: 'SOIL_NUT_NPK_001',
    cause: Cause.MULTIPLE_NUTRIENT_DEFICIENCY,
    conditions: {
      nitrogen_status: 'low',
      phosphorus_status: 'low',
      potassium_status: 'low',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Multiple deficiencies require integrated soil fertility management',
    yield_impact: { min: 30, max: 55 },
    action: {
      type: 'fertilizer',
      description: 'Apply NPK complex + organic manure; address most limiting nutrient first',
      timing: 'Comprehensive fertility program needed',
    },
  },
];

// ============================================================================
// MICRONUTRIENT DEFICIENCY RULES (15 rules)
// ============================================================================

const MICRONUTRIENT_RULES: CauseRule[] = [
  {
    id: 'SOIL_MIC_ZN_001',
    cause: Cause.ZINC_DEFICIENCY,
    conditions: {
      zinc_status: 'deficient',
      available_zn: { max: 0.6 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Zn is most widespread micronutrient deficiency in India',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'fertilizer',
      description: 'Apply ZnSO4 25 kg/ha soil application or 0.5% foliar spray twice',
      timing: 'Basal + foliar at tillering and heading',
    },
  },
  {
    id: 'SOIL_MIC_ZN_002',
    cause: Cause.ZINC_DEFICIENCY,
    conditions: {
      zinc_status: 'deficient',
      crop_type: 'rice',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Rice-wheat systems deplete Zn rapidly',
    yield_impact: { min: 18, max: 35 },
    action: {
      type: 'fertilizer',
      description: 'Apply ZnSO4 25 kg/ha in nursery + main field; Zn-coated urea option',
      timing: 'Nursery and basal in main field',
    },
  },
  {
    id: 'SOIL_MIC_FE_001',
    cause: Cause.IRON_DEFICIENCY,
    conditions: {
      iron_status: 'deficient',
      available_fe: { max: 4.5 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Fe deficiency causes chlorosis in sensitive crops',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply FeSO4 50 kg/ha soil or 1% foliar spray + citric acid',
      timing: 'At chlorosis onset, repeat every 10-15 days',
    },
  },
  {
    id: 'SOIL_MIC_FE_002',
    cause: Cause.IRON_DEFICIENCY,
    conditions: {
      iron_status: 'deficient',
      ph_level: { min: 7.5 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Fe unavailable in calcareous alkaline soils',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'fertilizer',
      description: 'Use Fe-EDDHA chelate 10 kg/ha for calcareous soils; band placement',
      timing: 'At sowing, close to root zone',
    },
  },
  {
    id: 'SOIL_MIC_MN_001',
    cause: Cause.MANGANESE_DEFICIENCY,
    conditions: {
      manganese_status: 'deficient',
      available_mn: { max: 2 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mn deficiency in high pH, sandy, or high OM soils',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'fertilizer',
      description: 'Apply MnSO4 25 kg/ha soil or 0.5% foliar spray',
      timing: 'At deficiency symptoms, repeat if needed',
    },
  },
  {
    id: 'SOIL_MIC_CU_001',
    cause: Cause.COPPER_DEFICIENCY,
    conditions: {
      copper_status: 'deficient',
      available_cu: { max: 0.2 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cu deficiency in peaty, sandy, and high pH soils',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Apply CuSO4 5-10 kg/ha soil or 0.2% foliar spray',
      timing: 'Basal or at vegetative stage foliar',
    },
  },
  {
    id: 'SOIL_MIC_B_001',
    cause: Cause.BORON_DEFICIENCY,
    conditions: {
      boron_status: 'deficient',
      available_b: { max: 0.5 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'B critical for flowering and fruit set',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply borax 10 kg/ha soil or 0.2% boric acid foliar spray',
      timing: 'Basal or pre-flowering foliar',
    },
  },
  {
    id: 'SOIL_MIC_B_002',
    cause: Cause.BORON_DEFICIENCY,
    conditions: {
      boron_status: 'deficient',
      crop_type: 'cole_crops',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cole crops have high B requirement',
    yield_impact: { min: 18, max: 35 },
    action: {
      type: 'fertilizer',
      description: 'Apply borax 15 kg/ha at transplanting + foliar at button stage',
      timing: 'Transplanting and pre-curd formation',
    },
  },
  {
    id: 'SOIL_MIC_MO_001',
    cause: Cause.MOLYBDENUM_DEFICIENCY,
    conditions: {
      molybdenum_status: 'deficient',
      crop_type: 'legumes',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mo essential for N fixation in legumes',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply sodium molybdate 1 kg/ha soil or 0.05% foliar or seed treatment 4g/kg',
      timing: 'Seed treatment preferred, or foliar at flowering',
    },
  },
  {
    id: 'SOIL_MIC_MO_002',
    cause: Cause.MOLYBDENUM_DEFICIENCY,
    conditions: {
      molybdenum_status: 'deficient',
      crop_type: 'cauliflower',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mo deficiency causes whiptail in cauliflower',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'fertilizer',
      description: 'Apply ammonium molybdate 0.5 kg/ha or raise pH if acidic',
      timing: 'At transplanting or before curd initiation',
    },
  },
  {
    id: 'SOIL_MIC_CL_001',
    cause: Cause.CHLORINE_DEFICIENCY,
    conditions: {
      chlorine_status: 'deficient',
      crop_type: 'palm',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cl deficiency rare but occurs in palms',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Apply MOP (KCl) as K source to supply both K and Cl',
      timing: 'Regular K fertilization',
    },
  },
  {
    id: 'SOIL_MIC_NI_001',
    cause: Cause.NICKEL_DEFICIENCY,
    conditions: {
      nickel_status: 'deficient',
      crop_type: 'legumes',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Ni required for urease activity',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply NiSO4 at 50 g/ha foliar if deficiency confirmed',
      timing: 'Foliar at vegetative stage',
    },
  },
  {
    id: 'SOIL_MIC_MULTI_001',
    cause: Cause.MULTIPLE_MICRONUTRIENT_DEFICIENCY,
    conditions: {
      zinc_status: 'deficient',
      iron_status: 'deficient',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Multiple micronutrient deficiencies common in calcareous soils',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'fertilizer',
      description: 'Apply micronutrient mixture soil application or chelated foliar spray',
      timing: 'Basal + foliar at critical stages',
    },
  },
  {
    id: 'SOIL_MIC_MULTI_002',
    cause: Cause.MULTIPLE_MICRONUTRIENT_DEFICIENCY,
    conditions: {
      organic_carbon: 'low',
      texture: 'sandy',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Sandy, low OM soils have multiple deficiencies',
    yield_impact: { min: 18, max: 35 },
    action: {
      type: 'fertilizer',
      description: 'Apply FYM + soil test-based micronutrient application; build OM over time',
      timing: 'Annual organic matter addition + targeted micros',
    },
  },
  {
    id: 'SOIL_MIC_CHELATE_001',
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    conditions: {
      ph_level: { min: 7.5 },
      micronutrient_issue: true,
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Chelated forms remain available in alkaline soils',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Use EDTA/EDDHA chelated micronutrients for high pH soils',
      timing: 'Fertigation or foliar application',
    },
  },
];

// ============================================================================
// NUTRIENT IMBALANCE RULES (8 rules)
// ============================================================================

const NUTRIENT_IMBALANCE_RULES: CauseRule[] = [
  {
    id: 'SOIL_IMB_NK_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      n_k_ratio: { min: 3 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'High N:K ratio causes K-induced deficiency',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Increase K application to maintain N:K ratio of 2:1 or less',
      timing: 'Adjust fertilizer schedule immediately',
    },
  },
  {
    id: 'SOIL_IMB_PZN_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      phosphorus_status: 'high',
      zinc_status: 'deficient',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Excess P induces Zn deficiency',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply Zn separately from P; use Zn chelate; reduce P if excessive',
      timing: 'Apply Zn 2 weeks before or after P',
    },
  },
  {
    id: 'SOIL_IMB_CAMG_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      ca_mg_ratio: { min: 10 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'High Ca:Mg ratio induces Mg deficiency',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Apply MgSO4 or use dolomite instead of calcitic lime',
      timing: 'Based on soil test, pre-season correction',
    },
  },
  {
    id: 'SOIL_IMB_KMG_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      k_mg_ratio: { min: 3 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'High K antagonizes Mg uptake',
    yield_impact: { min: 8, max: 15 },
    action: {
      type: 'fertilizer',
      description: 'Balance K application; apply MgSO4 foliar 2%',
      timing: 'Mid-season Mg foliar spray',
    },
  },
  {
    id: 'SOIL_IMB_FEMU_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      iron_status: 'deficient',
      manganese_status: 'high',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'High Mn inhibits Fe uptake',
    yield_impact: { min: 12, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Apply Fe chelate; correct waterlogging that increases Mn',
      timing: 'Foliar Fe application, improve drainage',
    },
  },
  {
    id: 'SOIL_IMB_NP_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      nitrogen_status: 'low',
      phosphorus_status: 'high',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'P excess with low N limits growth',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'fertilizer',
      description: 'Increase N application; skip P application for one season',
      timing: 'Rebalance NPK based on soil test',
    },
  },
  {
    id: 'SOIL_IMB_MICRO_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      copper_status: 'high',
      molybdenum_status: 'deficient',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cu-Mo antagonism in ruminant grazing areas',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'fertilizer',
      description: 'Apply Mo if Cu is excessive; important for forage legumes',
      timing: 'Mo application for pastures',
    },
  },
  {
    id: 'SOIL_IMB_CATION_001',
    cause: Cause.NUTRIENT_IMBALANCE,
    conditions: {
      cec: { min: 20 },
      base_saturation_imbalance: true,
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Ideal base saturation: Ca 65-75%, Mg 10-15%, K 3-5%',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'amendment',
      description: 'Adjust cation ratios through targeted amendments over 2-3 seasons',
      timing: 'Long-term soil balancing program',
    },
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
