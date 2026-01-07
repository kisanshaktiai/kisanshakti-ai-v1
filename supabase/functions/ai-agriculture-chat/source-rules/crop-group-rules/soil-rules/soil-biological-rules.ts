/**
 * Soil Biological Properties Rules
 * Rules for soil organic matter, microbial activity, and biological health
 * Total: 31 rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  CropGroup,
  SoilOCState,
  SoilNState,
  SoilPState,
  SoilMoistureState,
  FarmingMode
} from '../../types.ts';

// ============================================================================
// SOIL ORGANIC MATTER RULES (10 rules)
// ============================================================================

const SOIL_ORGANIC_MATTER_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_BIO_OM_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 3,
    scientific_source: 'Very low OC severely limits soil biological function',
    scientific_basis: 'Apply FYM 15-20 t/ha + green manuring + crop residue retention. Multi-year program needed. Annual heavy inputs for 3-5 years.',
  },
  {
    rule_id: 'SOIL_BIO_OM_002',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.MEDIUM_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Low OC reduces nutrient cycling and water retention',
    scientific_basis: 'Apply FYM/compost 10 t/ha annually + incorporate crop residues + cover cropping. Pre-season organic input.',
  },
  {
    rule_id: 'SOIL_BIO_OM_003',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.HIGH_OC,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 8,
    scientific_source: 'Optimal OC supports good soil health',
    scientific_basis: 'Maintain current practices. Continue organic matter inputs to sustain levels. Annual soil testing.',
  },
  {
    rule_id: 'SOIL_BIO_OM_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Intensive tillage accelerates humus decomposition',
    scientific_basis: 'Reduce tillage intensity. Adopt conservation tillage. Maintain residue cover. Transition to reduced tillage.',
  },
  {
    rule_id: 'SOIL_BIO_OM_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Low active C limits nutrient mineralization',
    scientific_basis: 'Apply fresh organic inputs (green manure, compost tea). Reduce synthetic inputs. Regular fresh OM additions.',
  },
  {
    rule_id: 'SOIL_BIO_OM_006',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC &&
      input.soil_states?.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'High C:N ratio causes N immobilization',
    scientific_basis: 'Add N-rich amendments (legume residue, poultry manure) or apply extra N fertilizer when incorporating high-C residues.',
  },
  {
    rule_id: 'SOIL_BIO_OM_007',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.HARVEST],
    conditions: (input) =>
      input.crop_stage === CropStage.HARVEST,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 4,
    scientific_source: 'Burning destroys organic matter and kills soil biology',
    scientific_basis: 'Stop burning. Use shredder/happy seeder. Apply decomposer culture. Immediate practice change.',
  },
  {
    rule_id: 'SOIL_BIO_OM_008',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.HIGH_OC,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 7,
    scientific_source: 'Carbon sequestration provides environmental co-benefits',
    scientific_basis: 'Continue regenerative practices. Document for carbon credits if applicable. Periodic soil C monitoring.',
  },
  {
    rule_id: 'SOIL_BIO_OM_009',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Biochar provides stable long-term C and improves soil properties',
    scientific_basis: 'Apply biochar 2-5 t/ha. Charge with nutrients before application. One-time application with long-term benefits.',
  },
  {
    rule_id: 'SOIL_BIO_OM_010',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Cover cropping builds soil health',
    scientific_basis: 'Grow cover crops during fallow to prevent erosion and add OM. Terminate before main crop planting.',
  },
];

// ============================================================================
// SOIL MICROBIAL ACTIVITY RULES (12 rules)
// ============================================================================

const SOIL_MICROBIAL_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_BIO_MIC_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION, CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Low MBC indicates poor biological activity',
    scientific_basis: 'Add fresh organic matter. Apply microbial inoculants. Reduce pesticide use. Ongoing organic inputs.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Low diversity reduces soil resilience',
    scientific_basis: 'Diversify rotations. Use cover crop mixtures. Reduce fungicide use. Add compost. Long-term rotation.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 5,
    scientific_source: 'Bacteria-dominated soils often degraded',
    scientific_basis: 'Reduce tillage to favor fungi. Add woody residues. Inoculate mycorrhiza. Transition to reduced tillage.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Low AMF colonization limits P uptake and stress tolerance',
    scientific_basis: 'Apply VAM inoculant. Reduce P fertilizer. Avoid fallow. Include mycorrhizal host crops. Inoculation at sowing.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Cold soils have slow N release from organic matter',
    scientific_basis: 'Apply starter N for early growth. Use black mulch to warm soil. Early season N supplementation.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_006',
    category: 'biological',
    crop_code: 'legumes',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.crop_group === CropGroup.PULSES,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 4,
    scientific_source: 'Poor nodulation wastes legume N-fixing potential',
    scientific_basis: 'Inoculate with crop-specific Rhizobium. Ensure Mo availability. Correct soil pH. Seed inoculation.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_007',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.p === SoilPState.LOW_P,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'PSB can release fixed P from soil',
    scientific_basis: 'Apply PSB (Bacillus megaterium) at 5 kg/ha. Use with rock phosphate. Seed treatment or soil application at sowing.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_008',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.POTASSIUM_DEFICIENCY,
    priority: 5,
    scientific_source: 'KMB can release K from minerals',
    scientific_basis: 'Apply KMB (Frateuria aurantia) at 5 kg/ha for K mobilization. Soil application at sowing.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_009',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Low DHA indicates poor overall microbial activity',
    scientific_basis: 'Add organic matter. Reduce pesticide load. Apply microbial consortium. Ongoing soil health building.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_010',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.n === SoilNState.LOW_N,
    cause: Cause.NITROGEN_DEFICIENCY,
    priority: 5,
    scientific_source: 'Low urease reduces urea fertilizer efficiency',
    scientific_basis: 'Use neem-coated urea. Apply organic matter to boost urease activity. Fertilizer modification.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_011',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC &&
      input.soil_states?.moisture === SoilMoistureState.OPTIMAL,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Low CO2 evolution indicates poor biological activity',
    scientific_basis: 'Add easily decomposable organic matter. Ensure adequate moisture and aeration. Fresh OM additions.',
  },
  {
    rule_id: 'SOIL_BIO_MIC_012',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Heavy pesticide use damages soil biology',
    scientific_basis: 'Adopt IPM. Reduce chemical inputs. Apply compost and microbial inoculants. Gradual reduction in chemicals.',
  },
];

// ============================================================================
// SOIL FAUNA AND ECOSYSTEM RULES (9 rules)
// ============================================================================

const SOIL_FAUNA_ECOSYSTEM_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_BIO_FAU_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Earthworms are key indicators and drivers of soil health',
    scientific_basis: 'Reduce tillage. Add organic matter. Avoid pesticides. Maintain soil moisture. Create earthworm-friendly conditions.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.HIGH_OC,
    cause: Cause.OPTIMAL_GROWTH,
    priority: 8,
    scientific_source: 'High earthworm population indicates healthy soil',
    scientific_basis: 'Maintain current practices. Earthworm population is excellent indicator of soil health. Continue conservation practices.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 6,
    scientific_source: 'Beneficial nematodes cycle nutrients in soil food web',
    scientific_basis: 'Add diverse organic matter. Reduce tillage. Maintain living roots. Build soil food web diversity.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 6,
    scientific_source: 'Soil arthropods decompose residues and cycle nutrients',
    scientific_basis: 'Maintain residue cover. Reduce pesticides. Create habitat diversity. Ongoing habitat creation.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.HIGH_OC,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 7,
    scientific_source: 'Diverse microbial communities suppress pathogens',
    scientific_basis: 'Maintain practices building suppressiveness. Minimal fungicide use. Diverse rotations. Continue biological practices.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_006',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Intensive tillage disrupts soil food web',
    scientific_basis: 'Transition to conservation tillage. Maintain living roots year-round. Gradual tillage reduction.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_007',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.TERMITE_RISK,
    priority: 5,
    scientific_source: 'Termites attack crops when soil OM is low',
    scientific_basis: 'Add organic matter away from crop. Apply neem cake. Use Beauveria bassiana. Pre-sowing OM addition.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_008',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ROOT_GRUB_RISK,
    priority: 4,
    scientific_source: 'White grubs damage roots in light soils',
    scientific_basis: 'Apply Metarhizium anisopliae at 5 kg/ha. Light trap for beetles. Deep summer plowing. Pre-sowing soil application.',
  },
  {
    rule_id: 'SOIL_BIO_FAU_009',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.farming_mode === FarmingMode.ORGANIC_ONLY,
    cause: Cause.IPM_BIOLOGICAL_PREFERRED,
    priority: 6,
    scientific_source: 'Field margins harbor beneficial organisms',
    scientific_basis: 'Maintain wildflower strips. Beetle banks. Avoid spraying margins. Establish and maintain habitat features.',
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
