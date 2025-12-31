/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOIL pH INTERACTION RULES - NUTRIENT AVAILABILITY MATRIX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Priority Level: P3/P4
 * Standards: ICAR-NBSS&LUP (National Bureau of Soil Survey)
 *            FAO Soil pH Guidelines
 *            USDA Natural Resources Conservation Service
 * 
 * pH affects nutrient availability, microbial activity, and crop tolerance
 * 
 * Total Rules: 10 rules
 */

import {
  CauseRule,
  Cause,
  CropStage,
  DecisionInput,
  PriorityLevel,
  NDVIState
} from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// pH-CROP FAILURE RULES (Priority: P3 - Critical for crop selection)
// ═══════════════════════════════════════════════════════════════════════════

export const PH_CROP_FAILURE_RULES: CauseRule[] = [
  // PH_CROP_001: Pulses Fail in Acidic Soils
  {
    rule_id: 'PH_CROP_001',
    category: 'nutrient',
    crop_code: 'ALL_PULSES',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) < 6.0 &&
      (input.crop_code === 'gram' || 
       input.crop_code === 'lentil' || 
       input.crop_code === 'chickpea' ||
       input.crop_code === 'arhar'),
    cause: Cause.PH_ACIDIC_PULSE_FAILURE,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-IIPR Kanpur',
    scientific_basis: 'Rhizobium bacteria CANNOT function in pH <6.0. Poor nodulation = N-deficiency even with inoculation. Chickpea and lentil need pH 6.5-7.5. Apply lime 2-4 tons/ha, incorporate 3 months before sowing.',
    icar_package: 'ICAR-IIPR Pulse Production 2024'
  },

  // PH_CROP_002: Aluminum Toxicity in Acidic Soils
  {
    rule_id: 'PH_CROP_002',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) < 5.5 &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.PH_ACIDIC_ALUMINUM_TOXICITY,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-NBSS&LUP + FAO',
    scientific_basis: 'pH <5.5 releases toxic aluminum (Al3+) in soil solution. Damages root tips, prevents root growth. Symptoms: stunted growth, poor nutrient uptake. URGENT: Apply lime to raise pH to 6.0-6.5. Dose: 4-6 tons/ha for pH 4.5-5.5.',
    icar_package: 'ICAR Acid Soil Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// pH-NUTRIENT LOCKUP RULES (Priority: P4 - Affects fertilizer efficiency)
// ═══════════════════════════════════════════════════════════════════════════

export const PH_NUTRIENT_LOCKUP_RULES: CauseRule[] = [
  // PH_LOCKUP_001: Zinc Unavailable in Alkaline Soils
  {
    rule_id: 'PH_LOCKUP_001',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) >= 8.0 &&
      input.ndvi_state === NDVIState.MODERATE_STRESS &&
      (Number(input.metadata?.soil_zinc_ppm) || 1) < 0.6,
    cause: Cause.PH_ALKALINE_ZINC_LOCKUP,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-NBSS&LUP Nagpur',
    scientific_basis: 'pH >8.0 converts soluble Zn2+ to insoluble Zn(OH)2. Even if soil has Zn, plant cannot absorb it. Common in Punjab, Haryana, UP, Maharashtra alkaline soils. Solution: (1) Foliar ZnSO4 0.5% + lime 0.25%, OR (2) Soil application chelated Zn (Zn-EDTA) 5 kg/ha.',
    icar_package: 'ICAR Micronutrient Atlas India'
  },

  // PH_LOCKUP_002: Iron Chlorosis in Alkaline Soils
  {
    rule_id: 'PH_LOCKUP_002',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) >= 8.0 &&
      input.ndvi_state === NDVIState.HIGH_STRESS &&
      (input.crop_code === 'groundnut' || 
       input.crop_code === 'citrus' || 
       input.crop_code === 'grapes'),
    cause: Cause.PH_ALKALINE_IRON_LOCKUP,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-NBSS&LUP',
    scientific_basis: 'High pH + high bicarbonates lock up iron. Groundnut, citrus, grapes MOST sensitive. Yellow leaves with green veins (interveinal chlorosis). Solution: Foliar FeSO4 0.5% + citric acid 0.1% OR soil acidification with elemental sulphur 500 kg/ha.',
    icar_package: 'ICAR Iron Chlorosis Management'
  },

  // PH_LOCKUP_003: Phosphorus Fixation in Alkaline Soils
  {
    rule_id: 'PH_LOCKUP_003',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) >= 8.5 &&
      input.soil_states?.p === 'LOW_P',
    cause: Cause.PH_ALKALINE_PHOSPHORUS_LOCKUP,
    priority: PriorityLevel.P4_ECONOMIC,
    scientific_source: 'ICAR-IARI Soil Science',
    scientific_basis: 'pH >8.5 converts soluble P to insoluble Ca-P (calcium phosphate). Applied DAP/SSP becomes unavailable. Solution: (1) Apply gypsum 500 kg/ha to displace Ca, (2) Use acidic fertilizers (ammonium sulphate instead of urea), (3) Apply P in band near roots.',
    icar_package: 'ICAR Phosphorus Efficiency'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// pH CORRECTION RULES (Priority: P3 - Soil amendment needed)
// ═══════════════════════════════════════════════════════════════════════════

export const PH_CORRECTION_RULES: CauseRule[] = [
  // PH_CORRECT_001: Lime for Acidic Soils
  {
    rule_id: 'PH_CORRECT_001',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) < 6.0,
    cause: Cause.PH_CORRECTION_LIME_NEEDED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-NBSS&LUP',
    scientific_basis: 'Lime requirement calculation: pH 5.0-5.5: 4-6 tons/ha; pH 5.5-6.0: 2-4 tons/ha. Use agricultural limestone (CaCO3) OR dolomite (CaMg(CO3)2 - better for Mg). Apply 3 months before sowing, mix in top 15 cm. Lasts 3-5 years.',
    icar_package: 'ICAR Lime Application Guide'
  },

  // PH_CORRECT_002: Sulphur for Alkaline Soils
  {
    rule_id: 'PH_CORRECT_002',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) > 8.5,
    cause: Cause.PH_CORRECTION_SULPHUR_NEEDED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-NBSS&LUP',
    scientific_basis: 'Elemental sulphur (S0) oxidizes to sulfuric acid, lowers pH. Dose: pH 8.5-9.0: 500-750 kg/ha; pH >9.0: 1000-1500 kg/ha. Apply and irrigate. Takes 2-3 months to act. Alternatively use gypsum (CaSO4) for faster but temporary effect.',
    icar_package: 'ICAR Alkaline Soil Reclamation'
  },

  // PH_CORRECT_003: Gypsum for Sodic Soils
  {
    rule_id: 'PH_CORRECT_003',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) > 8.5 &&
      (Number(input.metadata?.soil_ec_ds_m) || 0) > 4,
    cause: Cause.PH_CORRECTION_GYPSUM_NEEDED,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CSSRI Karnal',
    scientific_basis: 'Sodic (alkali) soils: High pH (>8.5) + High Na+ + Poor structure. Gypsum (CaSO4.2H2O) replaces Na+ with Ca2+. Dose: 5-10 tons/ha for severe sodicity. Requires good drainage + leaching. Combine with green manuring for organic matter.',
    icar_package: 'ICAR-CSSRI Sodic Soil Reclamation'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// SALINITY INTERACTION RULES
// ═══════════════════════════════════════════════════════════════════════════

export const SALINITY_RULES: CauseRule[] = [
  // SALINITY_001: High EC - Salt Stress
  {
    rule_id: 'SALINITY_001',
    category: 'nutrient',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ec_ds_m) || 0) > 4.0 &&
      input.ndvi_state === NDVIState.HIGH_STRESS,
    cause: Cause.SALINITY_STRESS_HIGH_EC,
    priority: PriorityLevel.P3_CROP_STAGE,
    scientific_source: 'ICAR-CSSRI Karnal',
    scientific_basis: 'EC >4 dS/m = saline soil. Most crops fail. Salt-tolerant crops: Barley (EC 8), Cotton (EC 7.7), Berseem (EC 5.3), Date palm (EC 4.0). Management: (1) Leaching with good drainage, (2) Gypsum application, (3) Grow salt-tolerant crops, (4) Avoid in sensitive crops (gram, lentil, most vegetables).',
    icar_package: 'ICAR-CSSRI Salinity Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// OPTIMAL pH RULES (Positive reinforcement)
// ═══════════════════════════════════════════════════════════════════════════

export const OPTIMAL_PH_RULES: CauseRule[] = [
  // OPTIMAL_001: pH in Ideal Range
  {
    rule_id: 'OPTIMAL_PH_001',
    category: 'healthy',
    crop_code: 'ALL_CROPS',
    stage_applicable: [],
    conditions: (input: DecisionInput) =>
      (Number(input.metadata?.soil_ph_value) || 7) >= 6.5 &&
      (Number(input.metadata?.soil_ph_value) || 7) <= 7.5,
    cause: Cause.PH_OPTIMAL_RANGE,
    priority: PriorityLevel.P6_OPTIMIZATION,
    scientific_source: 'ICAR-NBSS&LUP',
    scientific_basis: 'pH 6.5-7.5 is optimal for most crops. All nutrients maximally available. Microbial activity optimal. No toxicity issues. Maintain this range through balanced fertilization.',
    icar_package: 'ICAR Soil Health Card'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const SOIL_PH_INTERACTION_RULES: CauseRule[] = [
  ...PH_CROP_FAILURE_RULES,
  ...PH_NUTRIENT_LOCKUP_RULES,
  ...PH_CORRECTION_RULES,
  ...SALINITY_RULES,
  ...OPTIMAL_PH_RULES
];

export default SOIL_PH_INTERACTION_RULES;
