/**
 * Soil pH Rules
 * Rules for soil pH management, correction, and crop-specific pH optimization
 * Total: 32 rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  CropGroup,
  SoilPHState,
  SoilNState,
  SoilPState,
  SoilMoistureState
} from '../../types';

// ============================================================================
// ACIDIC SOIL CORRECTION RULES (10 rules)
// ============================================================================

const ACIDIC_SOIL_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_PH_ACID_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC,
    cause: Cause.SOIL_PH_CORRECTION_NEEDED,
    priority: 4,
    scientific_source: 'ICAR Soil pH management guidelines',
    scientific_basis: 'Severe acidic soil (pH < 5.0) requires aggressive liming for Al/Mn toxicity prevention. Apply lime 4-6 t/ha 3-4 weeks before sowing.',
  },
  {
    rule_id: 'SOIL_PH_ACID_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC,
    cause: Cause.NUTRIENT_LOCKOUT_ACIDIC,
    priority: 4,
    scientific_source: 'Moderate acidity requires calculated lime application',
    scientific_basis: 'Apply lime at 2-3 t/ha or dolomite if Mg is also deficient. 2-3 weeks before planting, thorough mixing required.',
  },
  {
    rule_id: 'SOIL_PH_ACID_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC &&
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 4,
    scientific_source: 'P is fixed by Al/Fe in acidic soils',
    scientific_basis: 'Correct pH first, then apply rock phosphate or DAP. Use P-efficient varieties. Lime first, P fertilizer at sowing.',
  },
  {
    rule_id: 'SOIL_PH_ACID_004',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Acid soils are typically Ca-deficient',
    scientific_basis: 'Apply calcitic lime for dual benefit of pH correction and Ca supply. Pre-planting incorporation.',
  },
  {
    rule_id: 'SOIL_PH_ACID_005',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Acid soils often leach Mg',
    scientific_basis: 'Apply dolomitic lime (CaMg(CO3)2) to correct both pH and Mg deficiency. Pre-planting, 2-3 t/ha based on soil test.',
  },
  {
    rule_id: 'SOIL_PH_ACID_006',
    category: 'nutrient',
    crop_code: 'legumes',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC &&
      input.crop_group === CropGroup.PULSES,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Mo availability decreases sharply below pH 5.5',
    scientific_basis: 'Apply sodium molybdate seed treatment (4g/kg) or correct pH for legume N-fixation.',
  },
  {
    rule_id: 'SOIL_PH_ACID_007',
    category: 'biological',
    crop_code: 'legumes',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC &&
      input.crop_group === CropGroup.PULSES,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 4,
    scientific_source: 'Rhizobium activity is severely reduced below pH 5.5',
    scientific_basis: 'Apply lime to raise pH > 6.0 for optimal Rhizobium nodulation. 4 weeks before legume sowing.',
  },
  {
    rule_id: 'SOIL_PH_ACID_008',
    category: 'nutrient',
    crop_code: 'tea',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'tea',
    cause: Cause.OPTIMAL_GROWTH,
    priority: 7,
    scientific_source: 'Tea requires acidic soil conditions',
    scientific_basis: 'Optimal pH 5.0-6.0 for tea. Use acidifying fertilizers (ammonium sulfate) to maintain. Monitor quarterly.',
  },
  {
    rule_id: 'SOIL_PH_ACID_009',
    category: 'nutrient',
    crop_code: 'potato',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.crop_code === 'potato',
    cause: Cause.OPTIMAL_GROWTH,
    priority: 7,
    scientific_source: 'Potatoes prefer slightly acidic soil to reduce scab',
    scientific_basis: 'Ideal pH 5.5-6.5 for potato. Avoid liming to prevent common scab increase. Maintain pH in this range.',
  },
  {
    rule_id: 'SOIL_PH_ACID_010',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ACIDIC &&
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.SOIL_PH_CORRECTION_NEEDED,
    priority: 4,
    scientific_source: 'Mn toxicity occurs in waterlogged acidic soils',
    scientific_basis: 'Apply lime and improve drainage to reduce Mn availability. Pre-season correction with drainage improvement.',
  },
];

// ============================================================================
// ALKALINE SOIL CORRECTION RULES (10 rules)
// ============================================================================

const ALKALINE_SOIL_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_PH_ALK_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.SOIL_PH_CORRECTION_NEEDED,
    priority: 4,
    scientific_source: 'Severe alkalinity requires gypsum and organic matter for reclamation',
    scientific_basis: 'Apply gypsum at 5-10 t/ha based on ESP, followed by leaching irrigation. Pre-monsoon or with assured irrigation.',
  },
  {
    rule_id: 'SOIL_PH_ALK_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.NUTRIENT_LOCKOUT_ALKALINE,
    priority: 4,
    scientific_source: 'Moderate alkalinity correction with sulfur/organic matter',
    scientific_basis: 'Apply elemental sulfur 200-400 kg/ha or organic matter to lower pH. 4-6 weeks before planting for sulfur oxidation.',
  },
  {
    rule_id: 'SOIL_PH_ALK_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 4,
    scientific_source: 'Fe becomes unavailable above pH 7.5',
    scientific_basis: 'Apply Fe-EDDHA chelate 10 kg/ha or foliar FeSO4 0.5% + citric acid. Soil application at sowing, foliar at chlorosis.',
  },
  {
    rule_id: 'SOIL_PH_ALK_004',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.ZINC_DEFICIENCY,
    priority: 4,
    scientific_source: 'Zn availability decreases 100-fold per pH unit above 7',
    scientific_basis: 'Apply ZnSO4 25 kg/ha + organic matter or Zn-EDTA 5 kg/ha. Basal or foliar 0.5% at deficiency symptoms.',
  },
  {
    rule_id: 'SOIL_PH_ALK_005',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Mn deficiency common in calcareous alkaline soils',
    scientific_basis: 'Apply MnSO4 20 kg/ha basal or foliar spray 0.5% when interveinal chlorosis appears.',
  },
  {
    rule_id: 'SOIL_PH_ALK_006',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE &&
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'P precipitates as Ca-P in calcareous soils',
    scientific_basis: 'Band-place phosphorus near roots. Use acidifying fertilizers like MAP. At sowing, band placement 5 cm from seed.',
  },
  {
    rule_id: 'SOIL_PH_ALK_007',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'High ESP causes clay dispersion and poor structure',
    scientific_basis: 'Apply gypsum to replace Na with Ca, follow with leaching and organic matter addition. Multi-season reclamation.',
  },
  {
    rule_id: 'SOIL_PH_ALK_008',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Microbial activity reduced in alkaline soils',
    scientific_basis: 'Apply well-decomposed compost with sulfur, inoculate with native microbes. Pre-season, repeated applications.',
  },
  {
    rule_id: 'SOIL_PH_ALK_009',
    category: 'nutrient',
    crop_code: 'cotton',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE &&
      input.crop_code === 'cotton',
    cause: Cause.OPTIMAL_GROWTH,
    priority: 7,
    scientific_source: 'Cotton tolerates slightly alkaline conditions',
    scientific_basis: 'Acceptable pH 7.0-8.0 for cotton. Ensure micronutrient availability through chelates/foliar applications.',
  },
  {
    rule_id: 'SOIL_PH_ALK_010',
    category: 'nutrient',
    crop_code: 'sugarcane',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'sugarcane',
    cause: Cause.OPTIMAL_GROWTH,
    priority: 7,
    scientific_source: 'Sugarcane tolerates wide pH range but optimal is 6.0-7.5',
    scientific_basis: 'pH within sugarcane tolerance. Focus on other soil health parameters. Annual testing with ratoon assessment.',
  },
];

// ============================================================================
// OPTIMAL PH MANAGEMENT RULES (6 rules)
// ============================================================================

const OPTIMAL_PH_MANAGEMENT_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_PH_OPT_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING, CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.NEUTRAL,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 8,
    scientific_source: 'pH 6.0-7.0 is optimal for most crops',
    scientific_basis: 'Soil pH is optimal. Maintain through balanced fertilization and organic matter addition. Annual soil testing.',
  },
  {
    rule_id: 'SOIL_PH_OPT_002',
    category: 'nutrient',
    crop_code: 'cereals',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.NEUTRAL &&
      input.crop_group === CropGroup.CEREALS,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 8,
    scientific_source: 'Cereals perform well in neutral pH range',
    scientific_basis: 'Continue current practices. Avoid over-liming or acidifying fertilizers. Biennial soil testing.',
  },
  {
    rule_id: 'SOIL_PH_OPT_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.NEUTRAL &&
      input.soil_states?.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Good pH but low N',
    scientific_basis: 'pH optimal for nutrient availability. Address N deficiency through appropriate fertilization.',
  },
  {
    rule_id: 'SOIL_PH_OPT_004',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.NEUTRAL &&
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Good pH but low P',
    scientific_basis: 'pH optimal for P availability. Apply phosphatic fertilizers as per soil test recommendation.',
  },
  {
    rule_id: 'SOIL_PH_OPT_005',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.NEUTRAL,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 8,
    scientific_source: 'Optimal pH monitoring',
    scientific_basis: 'Continue monitoring pH to prevent drift. Avoid excessive use of acidifying or alkalizing inputs.',
  },
  {
    rule_id: 'SOIL_PH_OPT_006',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.NEUTRAL,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 7,
    scientific_source: 'Neutral pH supports biological activity',
    scientific_basis: 'Optimal pH for microbial activity. Maximize use of biofertilizers and biopesticides.',
  },
];

// ============================================================================
// SALINITY RULES (6 rules)
// ============================================================================

const SALINITY_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_SAL_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'EC > 4 dS/m causes significant yield reduction in most crops',
    scientific_basis: 'Apply gypsum, ensure adequate drainage, leach with good quality water. Pre-season reclamation.',
  },
  {
    rule_id: 'SOIL_SAL_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Moderate salinity affects sensitive crops',
    scientific_basis: 'Grow salt-tolerant varieties, use mulch, apply extra irrigation for leaching. Variety selection pre-season.',
  },
  {
    rule_id: 'SOIL_SAL_003',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 5,
    scientific_source: 'Saline irrigation water exacerbates soil salinity',
    scientific_basis: 'Blend irrigation water if possible, apply 20% extra water for leaching, install drainage.',
  },
  {
    rule_id: 'SOIL_SAL_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Sensitive crops fail above EC 6',
    scientific_basis: 'Avoid sensitive crops (beans, citrus). Grow halophytes or salt-tolerant cereals only in highly saline soils.',
  },
  {
    rule_id: 'SOIL_SAL_005',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.WATER_STRESS_MILD,
    priority: 6,
    scientific_source: 'Salt accumulation at wetting front in drip irrigation',
    scientific_basis: 'Periodic leaching irrigation. Monitor EC at root zone edge monthly during dry season.',
  },
  {
    rule_id: 'SOIL_SAL_006',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.ph === SoilPHState.ALKALINE,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 5,
    scientific_source: 'Cl toxicity causes leaf burn in sensitive crops',
    scientific_basis: 'Use sulfate-based fertilizers, avoid chloride fertilizers, implement leaching program.',
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const SOIL_PH_RULES: CauseRule[] = [
  ...ACIDIC_SOIL_RULES,
  ...ALKALINE_SOIL_RULES,
  ...OPTIMAL_PH_MANAGEMENT_RULES,
  ...SALINITY_RULES,
];

export {
  ACIDIC_SOIL_RULES,
  ALKALINE_SOIL_RULES,
  OPTIMAL_PH_MANAGEMENT_RULES,
  SALINITY_RULES,
};

export default SOIL_PH_RULES;
