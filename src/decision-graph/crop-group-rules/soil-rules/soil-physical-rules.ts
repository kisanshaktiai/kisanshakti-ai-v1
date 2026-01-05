/**
 * Soil Physical Properties Rules
 * Rules for soil texture, structure, compaction, drainage, and water management
 * Total: 32 rules
 */

import { CauseRule, Cause, RuleCategory } from '../../types';

// ============================================================================
// SOIL TEXTURE AND STRUCTURE RULES (10 rules)
// ============================================================================

const SOIL_TEXTURE_STRUCTURE_RULES: CauseRule[] = [
  {
    id: 'SOIL_PHY_TEX_001',
    cause: Cause.SANDY_SOIL_MANAGEMENT,
    conditions: {
      texture: 'sandy',
      sand_percent: { min: 70 },
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Sandy soils have low water and nutrient retention',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'amendment',
      description: 'Add organic matter 10+ t/ha; use split fertigation; consider bentonite clay amendment',
      timing: 'Annual OM addition; frequent irrigation/fertigation',
    },
  },
  {
    id: 'SOIL_PHY_TEX_002',
    cause: Cause.CLAY_SOIL_MANAGEMENT,
    conditions: {
      texture: 'clay',
      clay_percent: { min: 40 },
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Heavy clay soils have drainage and workability issues',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'cultural_practice',
      description: 'Add gypsum 2-4 t/ha for structure; avoid tillage when wet; use raised beds',
      timing: 'Pre-season gypsum; optimal tillage timing',
    },
  },
  {
    id: 'SOIL_PHY_TEX_003',
    cause: Cause.SOIL_STRUCTURE_POOR,
    conditions: {
      aggregate_stability: 'poor',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Poor structure leads to crusting and reduced infiltration',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Add organic matter; use cover crops; minimize tillage; apply PAM if needed',
      timing: 'Long-term structure building program',
    },
  },
  {
    id: 'SOIL_PHY_TEX_004',
    cause: Cause.SOIL_CRUSTING,
    conditions: {
      crust_formation: 'prone',
      organic_matter: 'low',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Crusting prevents seedling emergence',
    yield_impact: { min: 15, max: 35 },
    action: {
      type: 'cultural_practice',
      description: 'Apply mulch; light irrigation post-sowing; gypsum for sodic soils; shallow cultivation',
      timing: 'Immediately after sowing if crust forms',
    },
  },
  {
    id: 'SOIL_PHY_TEX_005',
    cause: Cause.SILTY_SOIL_MANAGEMENT,
    conditions: {
      texture: 'silt',
      silt_percent: { min: 50 },
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Silty soils compact easily and are erosion-prone',
    yield_impact: { min: 8, max: 18 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain organic matter; use cover crops; avoid traffic when wet',
      timing: 'Preventive management throughout season',
    },
  },
  {
    id: 'SOIL_PHY_STR_001',
    cause: Cause.SOIL_AGGREGATION_POOR,
    conditions: {
      mwd: { max: 0.5 },
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Low mean weight diameter indicates poor aggregation',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'amendment',
      description: 'Add compost and biochar; grow deep-rooted cover crops; inoculate with mycorrhiza',
      timing: 'Multi-season soil building approach',
    },
  },
  {
    id: 'SOIL_PHY_STR_002',
    cause: Cause.SOIL_POROSITY_LOW,
    conditions: {
      porosity: { max: 40 },
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Low porosity limits root growth and water infiltration',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Deep tillage to break pans; add organic matter; use bio-drilling cover crops',
      timing: 'Pre-season deep tillage; ongoing OM addition',
    },
  },
  {
    id: 'SOIL_PHY_STR_003',
    cause: Cause.SOIL_WATER_REPELLENCY,
    conditions: {
      hydrophobic: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Hydrophobic soils resist wetting, causing uneven irrigation',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'amendment',
      description: 'Apply wetting agents; clay amendment; work in organic matter',
      timing: 'Before irrigation season; with first rain',
    },
  },
  {
    id: 'SOIL_PHY_STR_004',
    cause: Cause.SHRINK_SWELL_SOIL,
    conditions: {
      clay_type: 'montmorillonite',
      shrink_swell: 'high',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Vertisols crack when dry, swell when wet',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'cultural_practice',
      description: 'Deep summer plowing; use raised beds; plant on ridge; timing of operations critical',
      timing: 'Tillage at optimal moisture; ridge planting',
    },
  },
  {
    id: 'SOIL_PHY_STR_005',
    cause: Cause.LATERITE_SOIL_MANAGEMENT,
    conditions: {
      soil_type: 'laterite',
      iron_concretions: 'high',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Laterite soils fix P and have Fe/Al toxicity risk',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'amendment',
      description: 'Apply lime to raise pH; heavy organic matter; band-place P fertilizers',
      timing: 'Annual liming and OM addition',
    },
  },
];

// ============================================================================
// SOIL COMPACTION RULES (8 rules)
// ============================================================================

const SOIL_COMPACTION_RULES: CauseRule[] = [
  {
    id: 'SOIL_COMP_001',
    cause: Cause.SOIL_COMPACTION_SURFACE,
    conditions: {
      bulk_density: { min: 1.6 },
      depth: 'surface',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Surface compaction limits infiltration and emergence',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'cultural_practice',
      description: 'Shallow tillage or rotavation; add organic matter; avoid traffic when wet',
      timing: 'Pre-season correction; ongoing prevention',
    },
  },
  {
    id: 'SOIL_COMP_002',
    cause: Cause.SOIL_COMPACTION_SUBSURFACE,
    conditions: {
      bulk_density: { min: 1.7 },
      depth: 'subsurface',
      hardpan: true,
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Hardpan restricts root penetration and water movement',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'cultural_practice',
      description: 'Subsoil with chisel plow to 40-50 cm; grow deep-rooted cover crops (radish, sunflower)',
      timing: 'When soil is dry; every 2-3 years',
    },
  },
  {
    id: 'SOIL_COMP_003',
    cause: Cause.PLOW_PAN,
    conditions: {
      hardpan_depth: { min: 15, max: 25 },
      tillage_history: 'intensive',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Repeated tillage at same depth creates plow pan',
    yield_impact: { min: 18, max: 35 },
    action: {
      type: 'cultural_practice',
      description: 'Break pan with chisel plow; vary tillage depth; transition to reduced tillage',
      timing: 'Dry season deep tillage; adopt conservation tillage',
    },
  },
  {
    id: 'SOIL_COMP_004',
    cause: Cause.TRAFFIC_PAN,
    conditions: {
      wheel_traffic: 'heavy',
      compaction_pattern: 'wheel_tracks',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Wheel traffic causes localized compaction',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Use controlled traffic farming; permanent tramlines; reduce axle loads',
      timing: 'System change for long-term benefit',
    },
  },
  {
    id: 'SOIL_COMP_005',
    cause: Cause.ROOT_RESTRICTION,
    conditions: {
      penetration_resistance: { min: 2.5 },
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Root growth stops at penetration resistance > 2.5 MPa',
    yield_impact: { min: 18, max: 38 },
    action: {
      type: 'cultural_practice',
      description: 'Deep ripping when dry; apply organic matter; bio-drilling with cover crops',
      timing: 'Pre-season deep tillage; ongoing cover cropping',
    },
  },
  {
    id: 'SOIL_COMP_006',
    cause: Cause.PUDDLING_DAMAGE,
    conditions: {
      tillage_wet: true,
      structure_damage: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Wet tillage destroys soil structure',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'cultural_practice',
      description: 'Wait for optimal soil moisture; use friability test before tillage',
      timing: 'Delay operations until soil is workable',
    },
  },
  {
    id: 'SOIL_COMP_007',
    cause: Cause.ORCHARD_COMPACTION,
    conditions: {
      crop_type: 'orchard',
      interrow_compaction: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Repeated orchard traffic compacts interrows',
    yield_impact: { min: 10, max: 20 },
    action: {
      type: 'cultural_practice',
      description: 'Grow cover crops in alleys; minimize passes; use lighter equipment',
      timing: 'Establish permanent cover; reduce traffic',
    },
  },
  {
    id: 'SOIL_COMP_008',
    cause: Cause.REDUCED_INFILTRATION,
    conditions: {
      infiltration_rate: { max: 10 },
      compaction: 'moderate',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Low infiltration causes runoff and erosion',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Aerate soil; apply gypsum for sodic soils; add organic matter; contour cultivation',
      timing: 'Pre-monsoon preparation; ongoing management',
    },
  },
];

// ============================================================================
// SOIL DRAINAGE AND WATER MANAGEMENT RULES (10 rules)
// ============================================================================

const SOIL_DRAINAGE_RULES: CauseRule[] = [
  {
    id: 'SOIL_DRAIN_001',
    cause: Cause.WATERLOGGING,
    conditions: {
      drainage_class: 'poor',
      water_table: { max: 50 },
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'High water table causes root anoxia',
    yield_impact: { min: 25, max: 50 },
    action: {
      type: 'cultural_practice',
      description: 'Install subsurface drainage; use raised beds; grow waterlogging-tolerant varieties',
      timing: 'Pre-season drainage installation; immediate raised beds',
    },
  },
  {
    id: 'SOIL_DRAIN_002',
    cause: Cause.WATERLOGGING,
    conditions: {
      rainfall: 'high',
      internal_drainage: 'slow',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Slow drainage in high rainfall causes temporary waterlogging',
    yield_impact: { min: 18, max: 35 },
    action: {
      type: 'cultural_practice',
      description: 'Create surface drainage channels; broad bed furrow system; avoid low-lying pockets',
      timing: 'Before monsoon; maintain throughout rainy season',
    },
  },
  {
    id: 'SOIL_DRAIN_003',
    cause: Cause.PERCHED_WATER_TABLE,
    conditions: {
      restrictive_layer: true,
      perched_water: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Impermeable layer creates temporary water table',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'cultural_practice',
      description: 'Break restrictive layer with deep tillage; install mole drains; vertical drainage',
      timing: 'Dry season deep tillage; drainage improvement',
    },
  },
  {
    id: 'SOIL_DRAIN_004',
    cause: Cause.EXCESSIVE_DRAINAGE,
    conditions: {
      drainage_class: 'excessive',
      water_holding_capacity: 'low',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Rapid drainage causes nutrient leaching',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'amendment',
      description: 'Add organic matter to increase WHC; use drip irrigation; split fertilizer applications',
      timing: 'Annual OM addition; frequent fertigation',
    },
  },
  {
    id: 'SOIL_DRAIN_005',
    cause: Cause.SURFACE_SEALING,
    conditions: {
      rain_impact: 'high',
      dispersive_soil: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Rain impact causes surface sealing and runoff',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain residue cover; apply gypsum; use mulch; sprinkler timing management',
      timing: 'Pre-monsoon preparation; maintain cover',
    },
  },
  {
    id: 'SOIL_DRAIN_006',
    cause: Cause.IRON_TOXICITY,
    conditions: {
      drainage_class: 'poor',
      iron_level: 'high',
      crop_type: 'rice',
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Reduced Fe becomes toxic in waterlogged rice soils',
    yield_impact: { min: 20, max: 40 },
    action: {
      type: 'cultural_practice',
      description: 'Improve drainage; apply lime; use Fe-tolerant varieties; intermittent irrigation',
      timing: 'Mid-season drainage; variety selection',
    },
  },
  {
    id: 'SOIL_DRAIN_007',
    cause: Cause.HYDROGEN_SULFIDE_TOXICITY,
    conditions: {
      drainage_class: 'very_poor',
      organic_matter: 'high',
      waterlogged: true,
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'H2S produced in anaerobic high-OM soils',
    yield_impact: { min: 18, max: 35 },
    action: {
      type: 'cultural_practice',
      description: 'Drain field periodically; apply zinc sulfate; avoid excessive organic inputs',
      timing: 'Mid-season drainage; balanced OM application',
    },
  },
  {
    id: 'SOIL_DRAIN_008',
    cause: Cause.FLOOD_DAMAGE,
    conditions: {
      flood_prone: true,
      submergence_tolerance: 'needed',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Flash floods damage standing crops',
    yield_impact: { min: 30, max: 80 },
    action: {
      type: 'cultural_practice',
      description: 'Use submergence-tolerant varieties (Sub1); quick drainage post-flood; N top-dressing',
      timing: 'Variety selection; post-flood management',
    },
  },
  {
    id: 'SOIL_DRAIN_009',
    cause: Cause.ACID_SULFATE_SOIL,
    conditions: {
      soil_type: 'acid_sulfate',
      drainage_altered: true,
    },
    priority: 1,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Drained acid sulfate soils become extremely acidic',
    yield_impact: { min: 25, max: 60 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain water table; heavy liming if drained; avoid deep drainage; reclamation crops',
      timing: 'Careful water management; gradual reclamation',
    },
  },
  {
    id: 'SOIL_DRAIN_010',
    cause: Cause.GLEYING,
    conditions: {
      gley_horizon: true,
      permanent_saturation: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Gleyed soils indicate permanent waterlogging',
    yield_impact: { min: 15, max: 30 },
    action: {
      type: 'cultural_practice',
      description: 'Only suitable for rice/wetland crops; install drainage for other crops',
      timing: 'Crop selection based on soil capability',
    },
  },
  {
    id: 'SOIL_DRAIN_011',
    cause: Cause.MOTTLING,
    conditions: {
      mottling: true,
      seasonal_saturation: true,
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Mottling indicates fluctuating water table',
    yield_impact: { min: 10, max: 22 },
    action: {
      type: 'cultural_practice',
      description: 'Improve surface drainage; use raised beds in wet season; tolerant crop selection',
      timing: 'Seasonal management based on water table',
    },
  },
  {
    id: 'SOIL_DRAIN_012',
    cause: Cause.EROSION_WATER,
    conditions: {
      slope: { min: 3 },
      vegetation_cover: 'low',
    },
    priority: 1,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Sloping bare soils are erosion-prone',
    yield_impact: { min: 15, max: 35 },
    action: {
      type: 'cultural_practice',
      description: 'Contour cultivation; establish grass waterways; maintain cover crops; terracing',
      timing: 'Pre-monsoon conservation structures',
    },
  },
  {
    id: 'SOIL_DRAIN_013',
    cause: Cause.EROSION_WIND,
    conditions: {
      texture: 'sandy',
      wind_exposure: 'high',
      vegetation_cover: 'low',
    },
    priority: 2,
    category: 'cultural' as RuleCategory,
    scientific_basis: 'Fine dry soils prone to wind erosion',
    yield_impact: { min: 10, max: 25 },
    action: {
      type: 'cultural_practice',
      description: 'Maintain residue cover; establish windbreaks; avoid over-tillage; stubble mulching',
      timing: 'Post-harvest residue retention; windbreak establishment',
    },
  },
  {
    id: 'SOIL_DRAIN_014',
    cause: Cause.WATER_HOLDING_CAPACITY_LOW,
    conditions: {
      whc: { max: 15 },
      texture: 'coarse',
    },
    priority: 2,
    category: 'nutrient' as RuleCategory,
    scientific_basis: 'Low WHC requires frequent irrigation',
    yield_impact: { min: 12, max: 25 },
    action: {
      type: 'amendment',
      description: 'Add organic matter annually; use drip irrigation; apply hydrogel in high-value crops',
      timing: 'Continuous soil building; precision irrigation',
    },
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
