/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 6: CROP HORMONE (PGR) GOVERNANCE LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * STRICTLY CONTROLLED hormone logic with safety gates.
 * 
 * Hormones:
 * - Auxins → root growth, flower retention
 * - Cytokinins → tillering, branching
 * - Gibberellins → ONLY under strong nutrition & no stress
 * - Ethylene suppression → stress mitigation
 * 
 * CRITICAL SAFETY: Hormones are BLOCKED if:
 * - Active stress present
 * - Nutrition inadequate
 * - Wrong crop stage
 * 
 * Version: 2.0.0
 */

import { CropStage, NDVIState } from '../types';
import { AdvancedCauseRule, AdvancedDecisionInput, PGRType, PGRSafetyStatus } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// PGR SAFETY VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CRITICAL: Check if PGR application is safe
 * This is the PRIMARY safety gate - must pass before ANY hormone recommendation
 */
export function validatePGRSafety(
  input: AdvancedDecisionInput,
  pgrType: PGRType
): PGRSafetyStatus {
  const baseStatus: PGRSafetyStatus = {
    pgr_type: pgrType,
    is_safe: false,
    required_conditions: [],
    crop_stages_allowed: [],
    stress_blocking: false,
    nutrition_requirement: 'adequate'
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STRESS BLOCKING - Universal for all PGRs
  // ─────────────────────────────────────────────────────────────────────────
  if (input.stress_severity === 'severe' || input.stress_severity === 'moderate') {
    return {
      ...baseStatus,
      blocked_reason: 'Active stress detected - PGR application blocked. Address stress first.',
      stress_blocking: true
    };
  }

  if (input.ndvi_state === NDVIState.CRITICAL || input.ndvi_state === NDVIState.HIGH_STRESS) {
    return {
      ...baseStatus,
      blocked_reason: 'Crop under severe stress (NDVI critical) - PGR will cause harm.',
      stress_blocking: true
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PGR-SPECIFIC VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  switch (pgrType) {
    case PGRType.AUXIN:
      return validateAuxin(input);
    case PGRType.CYTOKININ:
      return validateCytokinin(input);
    case PGRType.GIBBERELLIN:
      return validateGibberellin(input);
    case PGRType.ETHYLENE_INHIBITOR:
      return validateEthyleneInhibitor(input);
    default:
      return baseStatus;
  }
}

function validateAuxin(input: AdvancedDecisionInput): PGRSafetyStatus {
  const allowedStages = [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE];
  
  if (!allowedStages.includes(input.crop_stage)) {
    return {
      pgr_type: PGRType.AUXIN,
      is_safe: false,
      blocked_reason: `Auxin not applicable at ${input.crop_stage} stage`,
      required_conditions: ['germination', 'vegetative', 'reproductive stage'],
      crop_stages_allowed: allowedStages,
      stress_blocking: false,
      nutrition_requirement: 'adequate'
    };
  }

  return {
    pgr_type: PGRType.AUXIN,
    is_safe: true,
    required_conditions: ['No active stress', 'Adequate nutrition'],
    crop_stages_allowed: allowedStages,
    stress_blocking: false,
    nutrition_requirement: 'adequate'
  };
}

function validateCytokinin(input: AdvancedDecisionInput): PGRSafetyStatus {
  const allowedStages = [CropStage.VEGETATIVE];
  
  if (!allowedStages.includes(input.crop_stage)) {
    return {
      pgr_type: PGRType.CYTOKININ,
      is_safe: false,
      blocked_reason: `Cytokinin for tillering/branching only applicable at vegetative stage`,
      required_conditions: ['vegetative stage only'],
      crop_stages_allowed: allowedStages,
      stress_blocking: false,
      nutrition_requirement: 'adequate'
    };
  }

  if (input.nutrition_status === 'deficient') {
    return {
      pgr_type: PGRType.CYTOKININ,
      is_safe: false,
      blocked_reason: 'Cytokinin requires adequate nutrition - correct deficiency first',
      required_conditions: ['Adequate N, P, K nutrition'],
      crop_stages_allowed: allowedStages,
      stress_blocking: false,
      nutrition_requirement: 'adequate'
    };
  }

  return {
    pgr_type: PGRType.CYTOKININ,
    is_safe: true,
    required_conditions: ['Vegetative stage', 'Adequate nutrition', 'No stress'],
    crop_stages_allowed: allowedStages,
    stress_blocking: false,
    nutrition_requirement: 'adequate'
  };
}

function validateGibberellin(input: AdvancedDecisionInput): PGRSafetyStatus {
  // GIBBERELLIN HAS STRICTEST REQUIREMENTS
  const allowedStages = [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE];

  // Must have OPTIMAL nutrition (not just adequate)
  if (input.nutrition_status !== 'optimal') {
    return {
      pgr_type: PGRType.GIBBERELLIN,
      is_safe: false,
      blocked_reason: 'Gibberellin BLOCKED - requires OPTIMAL nutrition status. Current: ' + (input.nutrition_status || 'unknown'),
      required_conditions: ['OPTIMAL nutrition (not just adequate)', 'No stress', 'Healthy NDVI'],
      crop_stages_allowed: allowedStages,
      stress_blocking: false,
      nutrition_requirement: 'optimal'
    };
  }

  // Must have excellent or healthy NDVI
  if (input.ndvi_state !== NDVIState.EXCELLENT && input.ndvi_state !== NDVIState.HEALTHY) {
    return {
      pgr_type: PGRType.GIBBERELLIN,
      is_safe: false,
      blocked_reason: 'Gibberellin BLOCKED - requires healthy/excellent NDVI. Current: ' + input.ndvi_state,
      required_conditions: ['NDVI healthy or excellent'],
      crop_stages_allowed: allowedStages,
      stress_blocking: false,
      nutrition_requirement: 'optimal'
    };
  }

  return {
    pgr_type: PGRType.GIBBERELLIN,
    is_safe: true,
    required_conditions: ['Optimal nutrition', 'Healthy/Excellent NDVI', 'No stress', 'Correct stage'],
    crop_stages_allowed: allowedStages,
    stress_blocking: false,
    nutrition_requirement: 'optimal'
  };
}

function validateEthyleneInhibitor(input: AdvancedDecisionInput): PGRSafetyStatus {
  // Ethylene inhibitors are ALLOWED during stress (that's their purpose)
  const allowedStages = [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY];

  return {
    pgr_type: PGRType.ETHYLENE_INHIBITOR,
    is_safe: allowedStages.includes(input.crop_stage),
    required_conditions: ['Stress present or anticipated'],
    crop_stages_allowed: allowedStages,
    stress_blocking: false,  // Opposite - these are FOR stress
    nutrition_requirement: 'deficient'  // Can be used even with deficient nutrition
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 6 RULES
// ═══════════════════════════════════════════════════════════════════════════

export const PGR_GOVERNANCE_RULES: AdvancedCauseRule[] = [
  {
    rule_id: 'ADV_PGR_001',
    layer: 6,
    category: 'pgr_governance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const validation = validatePGRSafety(input, PGRType.AUXIN);
      return validation.is_safe && input.crop_stage === CropStage.GERMINATION;
    },
    
    safety_gate: (input) => validatePGRSafety(input, PGRType.AUXIN).is_safe,
    
    cause: 'AUXIN_SAFE_WINDOW',
    priority: 5,
    yield_impact_percent: { min: 5, max: 15 },
    scientific_source: 'Plant Physiology + ICAR',
    scientific_basis: 'Auxins (NAA, IBA) at germination promote root development. Safe window: germination to early vegetative.',
    icar_alignment: 'ICAR allows auxin for root development with proper dosage'
  },

  {
    rule_id: 'ADV_PGR_002',
    layer: 6,
    category: 'pgr_governance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE],
    
    conditions: (input) => {
      const validation = validatePGRSafety(input, PGRType.CYTOKININ);
      return validation.is_safe && input.ndvi_state === NDVIState.HEALTHY;
    },
    
    safety_gate: (input) => validatePGRSafety(input, PGRType.CYTOKININ).is_safe,
    
    cause: 'CYTOKININ_SAFE_WINDOW',
    priority: 5,
    yield_impact_percent: { min: 10, max: 25 },
    scientific_source: 'Plant Hormone Research',
    scientific_basis: 'Cytokinins promote tillering in cereals, branching in cotton. Only at vegetative stage with good nutrition.',
    icar_alignment: 'ICAR permits cytokinin use with strict stage control'
  },

  {
    rule_id: 'ADV_PGR_003',
    layer: 6,
    category: 'pgr_governance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.VEGETATIVE, CropStage.REPRODUCTIVE],
    
    conditions: (input) => {
      const validation = validatePGRSafety(input, PGRType.GIBBERELLIN);
      return validation.is_safe;
    },
    
    safety_gate: (input) => validatePGRSafety(input, PGRType.GIBBERELLIN).is_safe,
    block_conditions: [
      (input) => input.stress_severity === 'severe',
      (input) => input.stress_severity === 'moderate', 
      (input) => input.nutrition_status !== 'optimal'
    ],
    
    cause: 'GIBBERELLIN_SAFE_WINDOW',
    priority: 4,
    yield_impact_percent: { min: 15, max: 40 },
    scientific_source: 'ICAR + Global PGR Research',
    scientific_basis: 'Gibberellin (GA3) promotes elongation and fruit set. HIGHEST RISK PGR - only under optimal conditions.',
    icar_alignment: 'ICAR restricts GA3 to specific crops and conditions - strictly followed'
  },

  {
    rule_id: 'ADV_PGR_004',
    layer: 6,
    category: 'pgr_governance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.REPRODUCTIVE, CropStage.MATURITY],
    
    conditions: (input) => {
      return (
        input.stress_severity === 'moderate' || 
        input.stress_severity === 'severe' ||
        (input.active_stress && input.active_stress.length > 0)
      );
    },
    
    cause: 'ETHYLENE_SUPPRESSION_NEEDED',
    priority: 7,
    yield_impact_percent: { min: 10, max: 30 },
    scientific_source: 'Stress Physiology Research',
    scientific_basis: 'Ethylene causes premature senescence under stress. Inhibitors (1-MCP, silver thiosulfate) extend productive life.',
    icar_alignment: 'Stress mitigation aligns with ICAR crop protection'
  },

  {
    rule_id: 'ADV_PGR_BLOCK_001',
    layer: 6,
    category: 'pgr_governance',
    crop_code: 'ALL_CROPS',
    stage_applicable: [CropStage.GERMINATION, CropStage.VEGETATIVE, CropStage.REPRODUCTIVE, CropStage.MATURITY],
    
    conditions: (input) => {
      return (
        input.stress_severity === 'severe' ||
        input.ndvi_state === NDVIState.CRITICAL
      );
    },
    
    cause: 'PGR_BLOCKED_STRESS',
    priority: 10,
    yield_impact_percent: { min: 0, max: 0 },
    scientific_source: 'Plant Stress Physiology',
    scientific_basis: 'ALL growth hormones (except ethylene inhibitors) are BLOCKED during severe stress. Hormones amplify stress damage.',
    icar_alignment: 'ICAR prohibits PGR misuse during stress'
  }
];

export function evaluatePGRGovernanceRules(input: AdvancedDecisionInput): AdvancedCauseRule[] {
  return PGR_GOVERNANCE_RULES.filter(rule => {
    if (!rule.stage_applicable.includes(input.crop_stage)) return false;
    if (rule.crop_code !== 'ALL_CROPS' && rule.crop_code !== input.crop_code) return false;
    if (rule.safety_gate && !rule.safety_gate(input)) return false;
    if (rule.block_conditions?.some(bc => bc(input))) return false;
    return rule.conditions(input);
  });
}
