/**
 * Soil pH Rules
 * Rules for soil pH management, correction, and crop-specific pH optimization
 * Total: 32 rules
 */

import { CauseRule, Cause, RuleCategory } from '../../types';

// ============================================================================
// ACIDIC SOIL CORRECTION RULES (10 rules)
// ============================================================================

const ACIDIC_SOIL_RULES: CauseRule[] = [
  {
    id: 'SOIL_PH_ACID_001',
    cause: Cause.PH_ACIDIC_SEVERE,
    conditions: {
      ph_level: { max: 4.5 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Severe acidic soil requires aggressive liming for Al/Mn toxicity prevention',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'amendment',
      description: 'Apply agricultural lime (CaCO3) at 4-6 t/ha based on buffer pH to raise soil pH',
      timing: '3-4 weeks before sowing, incorporate deeply',
    },
  },
  {
    id: 'SOIL_PH_ACID_002',
    cause: Cause.PH_ACIDIC_MODERATE,
    conditions: {
      ph_level: { min: 4.5, max: 5.5 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Moderate acidity requires calculated lime application',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'amendment',
      description: 'Apply lime at 2-3 t/ha or dolomite if Mg is also deficient',
      timing: '2-3 weeks before planting, thorough mixing',
    },
  },
  {
    id: 'SOIL_PH_ACID_003',
    cause: Cause.PH_ACIDIC_MODERATE,
    conditions: {
      ph_level: { min: 5.5, max: 6.0 },
      crop_sensitivity: 'high',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Slightly acidic soils may need correction for sensitive crops',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'amendment',
      description: 'Apply lime at 1-1.5 t/ha for pH-sensitive crops like alfalfa, barley',
      timing: 'Pre-planting, based on soil test recommendation',
    },
  },
  {
    id: 'SOIL_PH_ACID_004',
    cause: Cause.ALUMINUM_TOXICITY,
    conditions: {
      ph_level: { max: 5.0 },
      aluminum_saturation: 'high',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Al toxicity is primary growth limiter in acid soils',
    yield_impact: { min: 25, max: 50 },
    action: {
      type: 'amendment',
      description: 'Apply lime to raise pH above 5.5 where Al becomes insoluble, use Al-tolerant varieties',
      timing: 'Urgent correction needed, 4+ weeks before sowing',
    },
  },
  {
    id: 'SOIL_PH_ACID_005',
    cause: Cause.MANGANESE_TOXICITY,
    conditions: {
      ph_level: { max: 5.2 },
      manganese_level: 'high',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mn toxicity occurs in waterlogged acidic soils',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'amendment',
      description: 'Apply lime and improve drainage to reduce Mn availability',
      timing: 'Pre-season correction with drainage improvement',
    },
  },
  {
    id: 'SOIL_PH_ACID_006',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    conditions: {
      ph_level: { max: 5.5 },
      phosphorus_status: 'low',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'P is fixed by Al/Fe in acidic soils',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'amendment',
      description: 'Correct pH first, then apply rock phosphate or DAP; use P-efficient varieties',
      timing: 'Lime first, P fertilizer at sowing',
    },
  },
  {
    id: 'SOIL_PH_ACID_007',
    cause: Cause.CALCIUM_DEFICIENCY,
    conditions: {
      ph_level: { max: 5.5 },
      calcium_status: 'low',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Acid soils are typically Ca-deficient',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'amendment',
      description: 'Apply calcitic lime for dual benefit of pH correction and Ca supply',
      timing: 'Pre-planting incorporation',
    },
  },
  {
    id: 'SOIL_PH_ACID_008',
    cause: Cause.MAGNESIUM_DEFICIENCY,
    conditions: {
      ph_level: { max: 5.5 },
      magnesium_status: 'low',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Acid soils often leach Mg',
    yield_impact: { min: 8, max: 15 },
    action: {
      type: 'amendment',
      description: 'Apply dolomitic lime (CaMg(CO3)2) to correct both pH and Mg deficiency',
      timing: 'Pre-planting, 2-3 t/ha based on soil test',
    },
  },
  {
    id: 'SOIL_PH_ACID_009',
    cause: Cause.MOLYBDENUM_DEFICIENCY,
    conditions: {
      ph_level: { max: 5.5 },
      crop_type: 'legumes',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mo availability decreases sharply below pH 5.5',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'amendment',
      description: 'Apply sodium molybdate seed treatment (4g/kg) or correct pH for legume N-fixation',
      timing: 'Seed treatment or foliar at flowering',
    },
  },
  {
    id: 'SOIL_PH_ACID_010',
    cause: Cause.NITROGEN_FIXATION_IMPAIRED,
    conditions: {
      ph_level: { max: 5.5 },
      crop_type: 'legumes',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Rhizobium activity is severely reduced below pH 5.5',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'amendment',
      description: 'Apply lime to raise pH > 6.0 for optimal Rhizobium nodulation',
      timing: '4 weeks before legume sowing',
    },
  },
];

// ============================================================================
// ALKALINE SOIL CORRECTION RULES (10 rules)
// ============================================================================

const ALKALINE_SOIL_RULES: CauseRule[] = [
  {
    id: 'SOIL_PH_ALK_001',
    cause: Cause.PH_ALKALINE_SEVERE,
    conditions: {
      ph_level: { min: 8.5 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Severe alkalinity requires gypsum and organic matter for reclamation',
    yield_impact: { min: 20, max: 45 },
    action: {
      type: 'amendment',
      description: 'Apply gypsum at 5-10 t/ha based on ESP, followed by leaching irrigation',
      timing: 'Pre-monsoon or with assured irrigation for leaching',
    },
  },
  {
    id: 'SOIL_PH_ALK_002',
    cause: Cause.PH_ALKALINE_MODERATE,
    conditions: {
      ph_level: { min: 7.8, max: 8.5 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Moderate alkalinity correction with sulfur/organic matter',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'amendment',
      description: 'Apply elemental sulfur 200-400 kg/ha or organic matter to lower pH',
      timing: '4-6 weeks before planting for sulfur oxidation',
    },
  },
  {
    id: 'SOIL_PH_ALK_003',
    cause: Cause.IRON_DEFICIENCY,
    conditions: {
      ph_level: { min: 7.5 },
      iron_status: 'low',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Fe becomes unavailable above pH 7.5',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'fertilizer',
      description: 'Apply Fe-EDDHA chelate 10 kg/ha or foliar FeSO4 0.5% + citric acid',
      timing: 'Soil application at sowing, foliar at chlorosis onset',
    },
  },
  {
    id: 'SOIL_PH_ALK_004',
    cause: Cause.ZINC_DEFICIENCY,
    conditions: {
      ph_level: { min: 7.5 },
      zinc_status: 'low',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Zn availability decreases 100-fold per pH unit above 7',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'fertilizer',
      description: 'Apply ZnSO4 25 kg/ha + organic matter or Zn-EDTA 5 kg/ha',
      timing: 'Basal or foliar 0.5% at deficiency symptoms',
    },
  },
  {
    id: 'SOIL_PH_ALK_005',
    cause: Cause.MANGANESE_DEFICIENCY,
    conditions: {
      ph_level: { min: 7.8 },
      manganese_status: 'low',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Mn deficiency common in calcareous alkaline soils',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'fertilizer',
      description: 'Apply MnSO4 20 kg/ha basal or foliar spray 0.5% on deficient crops',
      timing: 'At sowing or when interveinal chlorosis appears',
    },
  },
  {
    id: 'SOIL_PH_ALK_006',
    cause: Cause.COPPER_DEFICIENCY,
    conditions: {
      ph_level: { min: 7.5 },
      copper_status: 'low',
      organic_matter: 'high',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cu complexes with organic matter in alkaline soils',
    yield_impact: { min: 8, max: 15 },
    action: {
      type: 'fertilizer',
      description: 'Apply CuSO4 5-10 kg/ha or foliar spray 0.2% for Cu deficiency',
      timing: 'Basal or foliar at vegetative stage',
    },
  },
  {
    id: 'SOIL_PH_ALK_007',
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    conditions: {
      ph_level: { min: 8.0 },
      phosphorus_status: 'low',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'P precipitates as Ca-P in calcareous soils',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Band-place phosphorus near roots, use acidifying fertilizers like MAP',
      timing: 'At sowing, band placement 5 cm from seed',
    },
  },
  {
    id: 'SOIL_PH_ALK_008',
    cause: Cause.SODICITY_PROBLEM,
    conditions: {
      ph_level: { min: 8.5 },
      esp: { min: 15 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'High ESP causes clay dispersion and poor structure',
    yield_impact: { min: 25, max: 50 },
    action: {
      type: 'amendment',
      description: 'Apply gypsum to replace Na with Ca, follow with leaching and organic matter addition',
      timing: 'Multi-season reclamation program needed',
    },
  },
  {
    id: 'SOIL_PH_ALK_009',
    cause: Cause.BORON_TOXICITY,
    conditions: {
      ph_level: { min: 8.0 },
      boron_level: 'high',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'B toxicity can occur in alkaline, arid region soils',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'amendment',
      description: 'Leach excess B, avoid B-containing fertilizers, grow tolerant crops',
      timing: 'Pre-season leaching, crop selection',
    },
  },
  {
    id: 'SOIL_PH_ALK_010',
    cause: Cause.ORGANIC_MATTER_DECOMPOSITION_SLOW,
    conditions: {
      ph_level: { min: 8.0 },
      organic_carbon: 'low',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Microbial activity reduced in alkaline soils',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'amendment',
      description: 'Apply well-decomposed compost with sulfur, inoculate with native microbes',
      timing: 'Pre-season, repeated applications',
    },
  },
];

// ============================================================================
// OPTIMAL PH MANAGEMENT RULES (6 rules)
// ============================================================================

const OPTIMAL_PH_MANAGEMENT_RULES: CauseRule[] = [
  {
    id: 'SOIL_PH_OPT_001',
    cause: Cause.OPTIMAL_SOIL_PH,
    conditions: {
      ph_level: { min: 6.0, max: 7.0 },
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'pH 6.0-7.0 is optimal for most crops',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Soil pH is optimal; maintain through balanced fertilization and organic matter addition',
      timing: 'Annual soil testing to monitor pH drift',
    },
  },
  {
    id: 'SOIL_PH_OPT_002',
    cause: Cause.OPTIMAL_SOIL_PH,
    conditions: {
      ph_level: { min: 6.5, max: 7.5 },
      crop_type: 'cereals',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cereals perform well in neutral pH range',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Continue current practices; avoid over-liming or acidifying fertilizers',
      timing: 'Biennial soil testing',
    },
  },
  {
    id: 'SOIL_PH_OPT_003',
    cause: Cause.OPTIMAL_SOIL_PH,
    conditions: {
      ph_level: { min: 5.5, max: 6.5 },
      crop_type: 'potatoes',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Potatoes prefer slightly acidic soil to reduce scab',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Ideal pH for potato; avoid liming to prevent common scab increase',
      timing: 'Maintain pH in this range for potato rotation',
    },
  },
  {
    id: 'SOIL_PH_OPT_004',
    cause: Cause.OPTIMAL_SOIL_PH,
    conditions: {
      ph_level: { min: 5.0, max: 6.0 },
      crop_type: 'tea',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Tea requires acidic soil conditions',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Optimal pH for tea; use acidifying fertilizers (ammonium sulfate) to maintain',
      timing: 'Monitor quarterly in tea gardens',
    },
  },
  {
    id: 'SOIL_PH_OPT_005',
    cause: Cause.OPTIMAL_SOIL_PH,
    conditions: {
      ph_level: { min: 6.0, max: 7.5 },
      crop_type: 'sugarcane',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Sugarcane tolerates wide pH range but optimal is 6.0-7.5',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'pH within sugarcane tolerance; focus on other soil health parameters',
      timing: 'Annual testing with ratoon assessment',
    },
  },
  {
    id: 'SOIL_PH_OPT_006',
    cause: Cause.OPTIMAL_SOIL_PH,
    conditions: {
      ph_level: { min: 7.0, max: 8.0 },
      crop_type: 'cotton',
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cotton tolerates slightly alkaline conditions',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Acceptable pH for cotton; ensure micronutrient availability through chelates/foliar',
      timing: 'Pre-season and mid-season soil tests',
    },
  },
];

// ============================================================================
// SALINITY AND EC RULES (6 rules)
// ============================================================================

const SALINITY_EC_RULES: CauseRule[] = [
  {
    id: 'SOIL_SAL_001',
    cause: Cause.SALINITY_HIGH,
    conditions: {
      ec_level: { min: 4 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'EC > 4 dS/m causes significant yield reduction in most crops',
    yield_impact: { min: 20, max: 50 },
    action: {
      type: 'amendment',
      description: 'Apply gypsum, ensure adequate drainage, leach with good quality water',
      timing: 'Pre-season reclamation, continuous management',
    },
  },
  {
    id: 'SOIL_SAL_002',
    cause: Cause.SALINITY_MODERATE,
    conditions: {
      ec_level: { min: 2, max: 4 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Moderate salinity affects sensitive crops',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Grow salt-tolerant varieties, use mulch, apply extra irrigation for leaching',
      timing: 'Variety selection pre-season, management throughout',
    },
  },
  {
    id: 'SOIL_SAL_003',
    cause: Cause.SALINITY_HIGH,
    conditions: {
      ec_level: { min: 4 },
      irrigation_water_quality: 'saline',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Saline irrigation water exacerbates soil salinity',
    yield_impact: { min: 25, max: 55 },
    action: {
      type: 'cultural_practice',
      description: 'Blend irrigation water, apply 20% extra water for leaching, install drainage',
      timing: 'Every irrigation event, monitor EC',
    },
  },
  {
    id: 'SOIL_SAL_004',
    cause: Cause.SALINITY_HIGH,
    conditions: {
      ec_level: { min: 6 },
      crop_tolerance: 'low',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Sensitive crops fail above EC 6',
    yield_impact: { min: 40, max: 80 },
    action: {
      type: 'cultural_practice',
      description: 'Avoid sensitive crops (beans, citrus), grow halophytes or salt-tolerant cereals only',
      timing: 'Immediate crop selection change needed',
    },
  },
  {
    id: 'SOIL_SAL_005',
    cause: Cause.SALINITY_BUILD_UP,
    conditions: {
      ec_trend: 'increasing',
      irrigation_type: 'drip',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Salt accumulation at wetting front in drip irrigation',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'cultural_practice',
      description: 'Periodic leaching irrigation, monitor EC at root zone edge',
      timing: 'Monthly leaching during dry season',
    },
  },
  {
    id: 'SOIL_SAL_006',
    cause: Cause.CHLORIDE_TOXICITY,
    conditions: {
      chloride_level: 'high',
      crop_sensitivity: 'high',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Cl toxicity causes leaf burn in sensitive crops',
    yield_impact: { min: 15, max: 35 },
    action: {
      type: 'amendment',
      description: 'Use sulfate-based fertilizers, avoid chloride fertilizers, leach excess Cl',
      timing: 'Immediate fertilizer switch, leaching program',
    },
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const SOIL_PH_RULES: CauseRule[] = [
  ...ACIDIC_SOIL_RULES,
  ...ALKALINE_SOIL_RULES,
  ...OPTIMAL_PH_MANAGEMENT_RULES,
  ...SALINITY_EC_RULES,
];

export {
  ACIDIC_SOIL_RULES,
  ALKALINE_SOIL_RULES,
  OPTIMAL_PH_MANAGEMENT_RULES,
  SALINITY_EC_RULES,
};

export default SOIL_PH_RULES;
