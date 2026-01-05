/**
 * Soil Physical Properties Rules
 * Rules for soil texture, structure, compaction, drainage, and water management
 * Total: 32 rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  CropGroup,
  SoilMoistureState,
  SoilOCState,
  SoilTexture
} from '../../types';

// ============================================================================
// SOIL TEXTURE AND STRUCTURE RULES (10 rules)
// ============================================================================

const SOIL_TEXTURE_STRUCTURE_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_PHY_TEX_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.SANDY,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Sandy soils have low water and nutrient retention',
    scientific_basis: 'Add organic matter 10+ t/ha. Use split fertigation. Consider bentonite clay amendment. Annual OM addition.',
  },
  {
    rule_id: 'SOIL_PHY_TEX_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.CLAY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Heavy clay soils have drainage and workability issues',
    scientific_basis: 'Add gypsum 2-4 t/ha for structure. Avoid tillage when wet. Use raised beds. Pre-season gypsum.',
  },
  {
    rule_id: 'SOIL_PHY_TEX_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Poor structure leads to crusting and reduced infiltration',
    scientific_basis: 'Add organic matter. Use cover crops. Minimize tillage. Long-term structure building program.',
  },
  {
    rule_id: 'SOIL_PHY_TEX_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.SOWING, CropStage.GERMINATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Crusting prevents seedling emergence',
    scientific_basis: 'Apply mulch. Light irrigation post-sowing. Gypsum for sodic soils. Shallow cultivation if crust forms.',
  },
  {
    rule_id: 'SOIL_PHY_TEX_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.SANDY_LOAM,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 6,
    scientific_source: 'Silty soils compact easily and are erosion-prone',
    scientific_basis: 'Maintain organic matter. Use cover crops. Avoid traffic when wet. Preventive management.',
  },
  {
    rule_id: 'SOIL_PHY_STR_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.ORGANIC_MATTER_LOW,
    priority: 5,
    scientific_source: 'Low mean weight diameter indicates poor aggregation',
    scientific_basis: 'Add compost and biochar. Grow deep-rooted cover crops. Inoculate with mycorrhiza. Multi-season approach.',
  },
  {
    rule_id: 'SOIL_PHY_STR_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.CLAY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Low porosity limits root growth and water infiltration',
    scientific_basis: 'Deep tillage to break pans. Add organic matter. Use bio-drilling cover crops. Pre-season deep tillage.',
  },
  {
    rule_id: 'SOIL_PHY_STR_003',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.SANDY,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'Hydrophobic soils resist wetting, causing uneven irrigation',
    scientific_basis: 'Apply wetting agents. Clay amendment. Work in organic matter. Before irrigation season.',
  },
  {
    rule_id: 'SOIL_PHY_STR_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.CLAY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Vertisols crack when dry, swell when wet',
    scientific_basis: 'Deep summer plowing. Use raised beds. Plant on ridge. Timing of operations critical. Tillage at optimal moisture.',
  },
  {
    rule_id: 'SOIL_PHY_STR_005',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.PHOSPHORUS_DEFICIENCY,
    priority: 5,
    scientific_source: 'Laterite soils fix P and have Fe/Al toxicity risk',
    scientific_basis: 'Apply lime to raise pH. Heavy organic matter. Band-place P fertilizers. Annual liming and OM addition.',
  },
];

// ============================================================================
// SOIL COMPACTION RULES (8 rules)
// ============================================================================

const SOIL_COMPACTION_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_COMP_001',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.CLAY ||
      input.soil_states?.texture === SoilTexture.CLAY_LOAM,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Surface compaction limits infiltration and emergence',
    scientific_basis: 'Shallow tillage or rotavation. Add organic matter. Avoid traffic when wet. Pre-season correction.',
  },
  {
    rule_id: 'SOIL_COMP_002',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.DRY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Hardpan restricts root penetration and water movement',
    scientific_basis: 'Subsoil with chisel plow to 40-50 cm. Grow deep-rooted cover crops (radish, sunflower). When soil is dry.',
  },
  {
    rule_id: 'SOIL_COMP_003',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Repeated tillage at same depth creates plow pan',
    scientific_basis: 'Break pan with chisel plow. Vary tillage depth. Transition to reduced tillage. Dry season deep tillage.',
  },
  {
    rule_id: 'SOIL_COMP_004',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.CLAY,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Wheel traffic causes localized compaction',
    scientific_basis: 'Use controlled traffic farming. Permanent tramlines. Reduce axle loads. System change for long-term benefit.',
  },
  {
    rule_id: 'SOIL_COMP_005',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.DRY,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 4,
    scientific_source: 'Root growth stops at penetration resistance > 2.5 MPa',
    scientific_basis: 'Deep ripping when dry. Apply organic matter. Bio-drilling with cover crops. Pre-season deep tillage.',
  },
  {
    rule_id: 'SOIL_COMP_006',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Wet tillage destroys soil structure',
    scientific_basis: 'Wait for optimal soil moisture. Use friability test before tillage. Delay operations until soil is workable.',
  },
  {
    rule_id: 'SOIL_COMP_007',
    category: 'biological',
    crop_code: 'orchard',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_group === CropGroup.FRUITS,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Repeated orchard traffic compacts interrows',
    scientific_basis: 'Grow cover crops in alleys. Minimize passes. Use lighter equipment. Establish permanent cover.',
  },
  {
    rule_id: 'SOIL_COMP_008',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'Low infiltration causes runoff and erosion',
    scientific_basis: 'Aerate soil. Apply gypsum for sodic soils. Add organic matter. Contour cultivation. Pre-monsoon preparation.',
  },
];

// ============================================================================
// SOIL DRAINAGE AND WATER MANAGEMENT RULES (14 rules)
// ============================================================================

const SOIL_DRAINAGE_RULES: CauseRule[] = [
  {
    rule_id: 'SOIL_DRAIN_001',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 3,
    scientific_source: 'High water table causes root anoxia',
    scientific_basis: 'Install subsurface drainage. Use raised beds. Grow waterlogging-tolerant varieties. Pre-season drainage.',
  },
  {
    rule_id: 'SOIL_DRAIN_002',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING_SEVERE,
    priority: 3,
    scientific_source: 'Slow drainage in high rainfall causes temporary waterlogging',
    scientific_basis: 'Create surface drainage channels. Broad bed furrow system. Avoid low-lying pockets. Before monsoon.',
  },
  {
    rule_id: 'SOIL_DRAIN_003',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.CLAY,
    cause: Cause.WATERLOGGING,
    priority: 4,
    scientific_source: 'Impermeable layer creates temporary water table',
    scientific_basis: 'Break restrictive layer with deep tillage. Install mole drains. Vertical drainage. Dry season deep tillage.',
  },
  {
    rule_id: 'SOIL_DRAIN_004',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.SANDY,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'Rapid drainage causes nutrient leaching',
    scientific_basis: 'Add organic matter to increase WHC. Use drip irrigation. Split fertilizer applications. Annual OM addition.',
  },
  {
    rule_id: 'SOIL_DRAIN_005',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'Rain impact causes surface sealing and runoff',
    scientific_basis: 'Maintain residue cover. Apply gypsum. Use mulch. Sprinkler timing management. Pre-monsoon preparation.',
  },
  {
    rule_id: 'SOIL_DRAIN_006',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.MICRONUTRIENT_DEFICIENCY,
    priority: 4,
    scientific_source: 'Reduced Fe becomes toxic in waterlogged rice soils',
    scientific_basis: 'Improve drainage. Apply lime. Use Fe-tolerant varieties. Intermittent irrigation. Mid-season drainage.',
  },
  {
    rule_id: 'SOIL_DRAIN_007',
    category: 'biological',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input) =>
      input.crop_code === 'rice' &&
      input.soil_states?.oc === SoilOCState.HIGH_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'H2S produced in anaerobic high-OM soils',
    scientific_basis: 'Drain field periodically. Apply zinc sulfate. Avoid excessive organic inputs. Mid-season drainage.',
  },
  {
    rule_id: 'SOIL_DRAIN_008',
    category: 'water',
    crop_code: 'rice',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    conditions: (input) =>
      input.crop_code === 'rice',
    cause: Cause.FLOOD_STRESS,
    priority: 3,
    scientific_source: 'Flash floods damage standing crops',
    scientific_basis: 'Use submergence-tolerant varieties (Sub1). Quick drainage post-flood. N top-dressing. Variety selection.',
  },
  {
    rule_id: 'SOIL_DRAIN_009',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.SOIL_PH_CORRECTION_NEEDED,
    priority: 4,
    scientific_source: 'Drained acid sulfate soils become extremely acidic',
    scientific_basis: 'Maintain water table. Heavy liming if drained. Avoid deep drainage. Reclamation crops. Careful water management.',
  },
  {
    rule_id: 'SOIL_DRAIN_010',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATERLOGGING,
    priority: 5,
    scientific_source: 'Gleyed soils indicate permanent waterlogging',
    scientific_basis: 'Only suitable for rice/wetland crops. Install drainage for other crops. Crop selection based on soil capability.',
  },
  {
    rule_id: 'SOIL_DRAIN_011',
    category: 'water',
    crop_code: 'all',
    stage_applicable: [CropStage.PLANNING],
    conditions: (input) =>
      input.soil_states?.moisture === SoilMoistureState.WATERLOGGED,
    cause: Cause.WATER_STRESS_MODERATE,
    priority: 5,
    scientific_source: 'Mottling indicates fluctuating water table',
    scientific_basis: 'Improve surface drainage. Use raised beds in wet season. Tolerant crop selection. Seasonal management.',
  },
  {
    rule_id: 'SOIL_DRAIN_012',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 4,
    scientific_source: 'Sloping bare soils are erosion-prone',
    scientific_basis: 'Contour cultivation. Establish grass waterways. Maintain cover crops. Terracing. Pre-monsoon conservation.',
  },
  {
    rule_id: 'SOIL_DRAIN_013',
    category: 'biological',
    crop_code: 'all',
    stage_applicable: [CropStage.HARVEST],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.SANDY &&
      input.soil_states?.oc === SoilOCState.LOW_OC,
    cause: Cause.SOIL_HEALTH_DEGRADATION,
    priority: 5,
    scientific_source: 'Fine dry soils prone to wind erosion',
    scientific_basis: 'Maintain residue cover. Establish windbreaks. Avoid over-tillage. Stubble mulching. Post-harvest residue retention.',
  },
  {
    rule_id: 'SOIL_DRAIN_014',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: [CropStage.LAND_PREPARATION],
    conditions: (input) =>
      input.soil_states?.texture === SoilTexture.SANDY,
    cause: Cause.WATER_STRESS_MILD,
    priority: 5,
    scientific_source: 'Low WHC requires frequent irrigation',
    scientific_basis: 'Add organic matter annually. Use drip irrigation. Apply hydrogel in high-value crops. Precision irrigation.',
  },
];

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const SOIL_PHYSICAL_RULES: CauseRule[] = [
  ...SOIL_TEXTURE_STRUCTURE_RULES,
  ...SOIL_COMPACTION_RULES,
  ...SOIL_DRAINAGE_RULES,
];

export {
  SOIL_TEXTURE_STRUCTURE_RULES,
  SOIL_COMPACTION_RULES,
  SOIL_DRAINAGE_RULES,
};

export default SOIL_PHYSICAL_RULES;
