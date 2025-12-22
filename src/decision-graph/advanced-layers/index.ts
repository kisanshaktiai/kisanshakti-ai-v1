/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADVANCED DECISION LAYERS - CENTRAL INDEX
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 6 Advanced Layers that EXTEND (not replace) the existing decision graph:
 * 
 * Layer 1: Plant Demand Based Decisions (NDVI-driven, not calendar)
 * Layer 2: Root Dominance Phase (first 25-30% of crop life)
 * Layer 3: Nitrogen Efficiency (smart N gating)
 * Layer 4: Stress Anticipation (pre-stress protection)
 * Layer 5: Soil Microbiology Priority (biological solutions)
 * Layer 6: PGR Governance (strictly controlled hormones)
 * 
 * ICAR ALIGNMENT: All layers use ICAR as baseline, extend with global practices
 * 
 * Version: 2.0.0
 */

// Types
export * from './types';

// Layer 1: Plant Demand
export { PLANT_DEMAND_RULES, evaluatePlantDemandRules } from './layer1-plant-demand';

// Layer 2: Root Dominance
export { ROOT_DOMINANCE_RULES, evaluateRootDominanceRules, isInRootDominancePhase } from './layer2-root-dominance';

// Layer 3: Nitrogen Efficiency
export { NITROGEN_EFFICIENCY_RULES, evaluateNitrogenEfficiencyRules, isNitrogenApplicationSafe } from './layer3-nitrogen-efficiency';

// Layer 4: Stress Anticipation
export { STRESS_ANTICIPATION_RULES, evaluateStressAnticipationRules, detectAnticipatedStress } from './layer4-stress-anticipation';

// Layer 5: Soil Microbiology
export { SOIL_MICROBIOLOGY_RULES, evaluateSoilMicrobiologyRules, shouldPrioritizeBiology } from './layer5-soil-microbiology';

// Layer 6: PGR Governance
export { PGR_GOVERNANCE_RULES, evaluatePGRGovernanceRules, validatePGRSafety } from './layer6-pgr-governance';

import { AdvancedDecisionInput, AdvancedCauseRule } from './types';
import { evaluatePlantDemandRules } from './layer1-plant-demand';
import { evaluateRootDominanceRules } from './layer2-root-dominance';
import { evaluateNitrogenEfficiencyRules } from './layer3-nitrogen-efficiency';
import { evaluateStressAnticipationRules } from './layer4-stress-anticipation';
import { evaluateSoilMicrobiologyRules } from './layer5-soil-microbiology';
import { evaluatePGRGovernanceRules } from './layer6-pgr-governance';

/**
 * Evaluate ALL advanced layers
 * Called AFTER core decision graph rules
 */
export function evaluateAllAdvancedLayers(input: AdvancedDecisionInput): {
  layer1: AdvancedCauseRule[];
  layer2: AdvancedCauseRule[];
  layer3: AdvancedCauseRule[];
  layer4: AdvancedCauseRule[];
  layer5: AdvancedCauseRule[];
  layer6: AdvancedCauseRule[];
  all: AdvancedCauseRule[];
} {
  const layer1 = evaluatePlantDemandRules(input);
  const layer2 = evaluateRootDominanceRules(input);
  const layer3 = evaluateNitrogenEfficiencyRules(input);
  const layer4 = evaluateStressAnticipationRules(input);
  const layer5 = evaluateSoilMicrobiologyRules(input);
  const layer6 = evaluatePGRGovernanceRules(input);

  return {
    layer1,
    layer2,
    layer3,
    layer4,
    layer5,
    layer6,
    all: [...layer1, ...layer2, ...layer3, ...layer4, ...layer5, ...layer6]
      .sort((a, b) => b.priority - a.priority)
  };
}

/**
 * Get total advanced rule count
 */
export function getAdvancedRuleCount(): number {
  return (
    PLANT_DEMAND_RULES.length +
    ROOT_DOMINANCE_RULES.length +
    NITROGEN_EFFICIENCY_RULES.length +
    STRESS_ANTICIPATION_RULES.length +
    SOIL_MICROBIOLOGY_RULES.length +
    PGR_GOVERNANCE_RULES.length
  );
}

// Import individual rule arrays
import { PLANT_DEMAND_RULES } from './layer1-plant-demand';
import { ROOT_DOMINANCE_RULES } from './layer2-root-dominance';
import { NITROGEN_EFFICIENCY_RULES } from './layer3-nitrogen-efficiency';
import { STRESS_ANTICIPATION_RULES } from './layer4-stress-anticipation';
import { SOIL_MICROBIOLOGY_RULES } from './layer5-soil-microbiology';
import { PGR_GOVERNANCE_RULES } from './layer6-pgr-governance';
