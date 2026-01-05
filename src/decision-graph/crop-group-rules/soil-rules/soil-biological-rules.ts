/**
 * Soil Biological Properties Rules
 * Rules for soil organic matter, microbial activity, and biological health
 * Total: 31 rules
 */

import { CauseRule, Cause, RuleCategory } from '../../types';

// ============================================================================
// SOIL ORGANIC MATTER RULES (10 rules)
// ============================================================================

const SOIL_ORGANIC_MATTER_RULES: CauseRule[] = [
  {
    id: 'SOIL_BIO_OM_001',
    cause: Cause.ORGANIC_CARBON_VERY_LOW,
    conditions: {
      organic_carbon: { max: 0.3 },
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Very low OC severely limits soil biological function',
    yield_impact: { min: 25, max: 45 },
    action: {
      type: 'amendment',
      description: 'Apply FYM 15-20 t/ha + green manuring + crop residue retention; multi-year program needed',
      timing: 'Annual heavy organic inputs for 3-5 years',
    },
  },
  {
    id: 'SOIL_BIO_OM_002',
    cause: Cause.ORGANIC_CARBON_LOW,
    conditions: {
      organic_carbon: { min: 0.3, max: 0.5 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Low OC reduces nutrient cycling and water retention',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'amendment',
      description: 'Apply FYM/compost 10 t/ha annually + incorporate crop residues + cover cropping',
      timing: 'Pre-season organic input; residue retention post-harvest',
    },
  },
  {
    id: 'SOIL_BIO_OM_003',
    cause: Cause.ORGANIC_CARBON_OPTIMAL,
    conditions: {
      organic_carbon: { min: 0.75 },
    },
    priority: 3,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Optimal OC supports good soil health',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Maintain current practices; continue organic matter inputs to sustain levels',
      timing: 'Ongoing maintenance; annual soil testing',
    },
  },
  {
    id: 'SOIL_BIO_OM_004',
    cause: Cause.HUMUS_DEPLETION,
    conditions: {
      humus_ratio: 'declining',
      tillage_intensity: 'high',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Intensive tillage accelerates humus decomposition',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Reduce tillage intensity; adopt conservation tillage; maintain residue cover',
      timing: 'Transition to reduced tillage system',
    },
  },
  {
    id: 'SOIL_BIO_OM_005',
    cause: Cause.ACTIVE_CARBON_LOW,
    conditions: {
      active_carbon: 'low',
      microbial_activity: 'low',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low active C limits nutrient mineralization',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'amendment',
      description: 'Apply fresh organic inputs (green manure, compost tea); reduce synthetic inputs',
      timing: 'Regular fresh OM additions during growing season',
    },
  },
  {
    id: 'SOIL_BIO_OM_006',
    cause: Cause.CN_RATIO_IMBALANCE,
    conditions: {
      cn_ratio: { min: 30 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'High C:N ratio causes N immobilization',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'amendment',
      description: 'Add N-rich amendments (legume residue, poultry manure); or apply extra N fertilizer',
      timing: 'When incorporating high-C residues',
    },
  },
  {
    id: 'SOIL_BIO_OM_007',
    cause: Cause.CN_RATIO_IMBALANCE,
    conditions: {
      cn_ratio: { max: 15 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Very low C:N ratio leads to rapid N release',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'amendment',
      description: 'Add high-C materials (straw, sawdust) to balance; avoid N losses',
      timing: 'When applying N-rich organic materials',
    },
  },
  {
    id: 'SOIL_BIO_OM_008',
    cause: Cause.RESIDUE_BURNING,
    conditions: {
      residue_management: 'burning',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Burning destroys organic matter and kills soil biology',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Stop burning; use shredder/happy seeder; apply decomposer culture',
      timing: 'Immediate practice change; incentivize retention',
    },
  },
  {
    id: 'SOIL_BIO_OM_009',
    cause: Cause.SOIL_CARBON_SEQUESTRATION,
    conditions: {
      carbon_farming: true,
      organic_carbon: 'increasing',
    },
    priority: 3,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Carbon sequestration provides environmental co-benefits',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'monitoring',
      description: 'Continue regenerative practices; document for carbon credits if applicable',
      timing: 'Maintain practices; periodic soil C monitoring',
    },
  },
  {
    id: 'SOIL_BIO_OM_010',
    cause: Cause.BIOCHAR_OPPORTUNITY,
    conditions: {
      organic_carbon: 'low',
      biochar_available: true,
    },
    priority: 2,
    category: 'amendment' as RuleCategory,
    scientific_basis: 'Biochar provides stable long-term C and improves soil properties',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'amendment',
      description: 'Apply biochar 2-5 t/ha; charge with nutrients before application',
      timing: 'One-time application with long-term benefits',
    },
  },
];

// ============================================================================
// SOIL MICROBIAL ACTIVITY RULES (12 rules)
// ============================================================================

const SOIL_MICROBIAL_RULES: CauseRule[] = [
  {
    id: 'SOIL_BIO_MIC_001',
    cause: Cause.MICROBIAL_BIOMASS_LOW,
    conditions: {
      microbial_biomass_carbon: { max: 100 },
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low MBC indicates poor biological activity',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'amendment',
      description: 'Add fresh organic matter; apply microbial inoculants; reduce pesticide use',
      timing: 'Ongoing organic inputs; inoculation at sowing',
    },
  },
  {
    id: 'SOIL_BIO_MIC_002',
    cause: Cause.MICROBIAL_DIVERSITY_LOW,
    conditions: {
      microbial_diversity: 'low',
      monoculture: true,
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low diversity reduces soil resilience',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'cultural_practice',
      description: 'Diversify rotations; use cover crop mixtures; reduce fungicide use; add compost',
      timing: 'Long-term rotation diversification',
    },
  },
  {
    id: 'SOIL_BIO_MIC_003',
    cause: Cause.FUNGAL_BACTERIAL_IMBALANCE,
    conditions: {
      fb_ratio: { max: 0.5 },
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Bacteria-dominated soils often degraded',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'amendment',
      description: 'Reduce tillage to favor fungi; add woody residues; inoculate mycorrhiza',
      timing: 'Transition to reduced tillage; fungal-promoting inputs',
    },
  },
  {
    id: 'SOIL_BIO_MIC_004',
    cause: Cause.MYCORRHIZAL_COLONIZATION_LOW,
    conditions: {
      mycorrhiza_colonization: { max: 20 },
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low AMF colonization limits P uptake and stress tolerance',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'biological_control',
      description: 'Apply VAM inoculant; reduce P fertilizer; avoid fallow; include mycorrhizal host crops',
      timing: 'Inoculation at sowing; management changes',
    },
  },
  {
    id: 'SOIL_BIO_MIC_005',
    cause: Cause.NITROGEN_MINERALIZATION_SLOW,
    conditions: {
      n_mineralization_rate: 'slow',
      soil_temperature: 'low',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Cold soils have slow N release from organic matter',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'fertilizer',
      description: 'Apply starter N for early growth; use black mulch to warm soil',
      timing: 'Early season N supplementation',
    },
  },
  {
    id: 'SOIL_BIO_MIC_006',
    cause: Cause.BIOLOGICAL_NITROGEN_FIXATION_LOW,
    conditions: {
      bnf_efficiency: 'low',
      rhizobium_nodulation: 'poor',
    },
    priority: 1,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Poor nodulation wastes legume N-fixing potential',
    yield_impact: { min: 15, max: 35 },
    action: {
      type: 'biological_control',
      description: 'Inoculate with crop-specific Rhizobium; ensure Mo availability; correct soil pH',
      timing: 'Seed inoculation; soil pH correction pre-season',
    },
  },
  {
    id: 'SOIL_BIO_MIC_007',
    cause: Cause.PHOSPHORUS_SOLUBILIZATION_LOW,
    conditions: {
      p_solubilizers: 'low',
      phosphorus_fixed: 'high',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'PSB can release fixed P from soil',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'biological_control',
      description: 'Apply PSB (Bacillus megaterium) at 5 kg/ha; use with rock phosphate',
      timing: 'Seed treatment or soil application at sowing',
    },
  },
  {
    id: 'SOIL_BIO_MIC_008',
    cause: Cause.POTASSIUM_SOLUBILIZATION_LOW,
    conditions: {
      k_solubilizers: 'low',
      potassium_fixed: 'high',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'KMB can release K from minerals',
    yield_impact: { min: 8, max: 15 },
    action: {
      type: 'biological_control',
      description: 'Apply KMB (Frateuria aurantia) at 5 kg/ha for K mobilization',
      timing: 'Soil application at sowing',
    },
  },
  {
    id: 'SOIL_BIO_MIC_009',
    cause: Cause.DEHYDROGENASE_ACTIVITY_LOW,
    conditions: {
      dehydrogenase: { max: 50 },
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low DHA indicates poor overall microbial activity',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'amendment',
      description: 'Add organic matter; reduce pesticide load; apply microbial consortium',
      timing: 'Ongoing soil health building',
    },
  },
  {
    id: 'SOIL_BIO_MIC_010',
    cause: Cause.UREASE_ACTIVITY_LOW,
    conditions: {
      urease: 'low',
      urea_efficiency: 'poor',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low urease reduces urea fertilizer efficiency',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'amendment',
      description: 'Use neem-coated urea; apply organic matter to boost urease activity',
      timing: 'Fertilizer modification; ongoing OM addition',
    },
  },
  {
    id: 'SOIL_BIO_MIC_011',
    cause: Cause.SOIL_RESPIRATION_LOW,
    conditions: {
      soil_respiration: { max: 5 },
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Low CO2 evolution indicates poor biological activity',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'amendment',
      description: 'Add easily decomposable organic matter; ensure adequate moisture and aeration',
      timing: 'Fresh OM additions; optimal soil conditions',
    },
  },
  {
    id: 'SOIL_BIO_MIC_012',
    cause: Cause.PESTICIDE_SOIL_DAMAGE,
    conditions: {
      pesticide_history: 'heavy',
      microbial_activity: 'suppressed',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Heavy pesticide use damages soil biology',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'cultural_practice',
      description: 'Adopt IPM; reduce chemical inputs; apply compost and microbial inoculants to recover',
      timing: 'Gradual reduction in chemicals; biological rebuilding',
    },
  },
];

// ============================================================================
// SOIL FAUNA AND ECOSYSTEM RULES (9 rules)
// ============================================================================

const SOIL_FAUNA_ECOSYSTEM_RULES: CauseRule[] = [
  {
    id: 'SOIL_BIO_FAU_001',
    cause: Cause.EARTHWORM_POPULATION_LOW,
    conditions: {
      earthworm_count: { max: 50 },
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Earthworms are key indicators and drivers of soil health',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'cultural_practice',
      description: 'Reduce tillage; add organic matter; avoid pesticides; maintain soil moisture',
      timing: 'Create earthworm-friendly conditions',
    },
  },
  {
    id: 'SOIL_BIO_FAU_002',
    cause: Cause.EARTHWORM_POPULATION_OPTIMAL,
    conditions: {
      earthworm_count: { min: 200 },
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'High earthworm population indicates healthy soil',
    yield_impact: { min: 0, max: 5 },
    action: {
      type: 'monitoring',
      description: 'Maintain current practices; earthworm population is excellent indicator of soil health',
      timing: 'Continue conservation practices',
    },
  },
  {
    id: 'SOIL_BIO_FAU_003',
    cause: Cause.BENEFICIAL_NEMATODES_LOW,
    conditions: {
      bacterial_feeding_nematodes: 'low',
      fungal_feeding_nematodes: 'low',
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Beneficial nematodes cycle nutrients in soil food web',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'amendment',
      description: 'Add diverse organic matter; reduce tillage; maintain living roots',
      timing: 'Build soil food web diversity',
    },
  },
  {
    id: 'SOIL_BIO_FAU_004',
    cause: Cause.SOIL_ARTHROPODS_LOW,
    conditions: {
      arthropod_diversity: 'low',
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Soil arthropods decompose residues and cycle nutrients',
    yield_impact: { min: 5, max: 12 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain residue cover; reduce pesticides; create habitat diversity',
      timing: 'Ongoing habitat creation',
    },
  },
  {
    id: 'SOIL_BIO_FAU_005',
    cause: Cause.DISEASE_SUPPRESSIVE_SOIL,
    conditions: {
      disease_suppressiveness: 'high',
      beneficial_microbe_diversity: 'high',
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Diverse microbial communities suppress pathogens',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'monitoring',
      description: 'Maintain practices building suppressiveness; minimal fungicide use; diverse rotations',
      timing: 'Continue biological farming practices',
    },
  },
  {
    id: 'SOIL_BIO_FAU_006',
    cause: Cause.SOIL_FOOD_WEB_DISRUPTED,
    conditions: {
      food_web_complexity: 'low',
      tillage_intensity: 'high',
    },
    priority: 2,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Intensive tillage disrupts soil food web',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'cultural_practice',
      description: 'Transition to conservation tillage; maintain living roots year-round',
      timing: 'Gradual tillage reduction',
    },
  },
  {
    id: 'SOIL_BIO_FAU_007',
    cause: Cause.TERMITE_DAMAGE,
    conditions: {
      termite_infestation: true,
      organic_matter: 'low',
    },
    priority: 2,
    category: 'pest' as RuleCategory,
    scientific_basis: 'Termites attack crops when soil OM is low',
    yield_impact: { min: 12, max: 28 },
    action: {
      type: 'integrated',
      description: 'Add organic matter away from crop; apply neem cake; use Beauveria bassiana',
      timing: 'Pre-sowing OM addition; biological control',
    },
  },
  {
    id: 'SOIL_BIO_FAU_008',
    cause: Cause.WHITE_GRUB_DAMAGE,
    conditions: {
      white_grub_infestation: true,
      soil_type: 'light',
    },
    priority: 1,
    category: 'pest' as RuleCategory,
    scientific_basis: 'White grubs damage roots in light soils',
    yield_impact: { min: 20, max: 45 },
    action: {
      type: 'biological_control',
      description: 'Apply Metarhizium anisopliae at 5 kg/ha; light trap for beetles; deep summer plowing',
      timing: 'Pre-sowing soil application; beetle trapping',
    },
  },
  {
    id: 'SOIL_BIO_FAU_009',
    cause: Cause.BENEFICIAL_INSECT_HABITAT,
    conditions: {
      field_margins: 'managed',
      beneficial_habitat: true,
    },
    priority: 3,
    category: 'biological' as RuleCategory,
    scientific_basis: 'Field margins harbor beneficial organisms',
    yield_impact: { min: 5, max: 15 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain wildflower strips; beetle banks; avoid spraying margins',
      timing: 'Establish and maintain habitat features',
    },
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const SOIL_BIOLOGICAL_RULES: CauseRule[] = [
  ...SOIL_ORGANIC_MATTER_RULES,
  ...SOIL_MICROBIAL_RULES,
  ...SOIL_FAUNA_ECOSYSTEM_RULES,
];

export {
  SOIL_ORGANIC_MATTER_RULES,
  SOIL_MICROBIAL_RULES,
  SOIL_FAUNA_ECOSYSTEM_RULES,
};

export default SOIL_BIOLOGICAL_RULES;
