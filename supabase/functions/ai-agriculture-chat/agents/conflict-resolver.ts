/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFLICT RESOLVER - Priority-Based Decision Resolution
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Resolves conflicts between multiple rule results using priority hierarchy.
 * P0 (Emergency) > P1 (Regulatory) > P2 (Weather) > P3 (Stage) > P4 (Economic) > P5 (IPM) > P6 (Optimization)
 */

import type {
  DecisionsByPriority,
  RuleResult,
  PrimaryDecision,
  BlockedAction,
  SecondaryAction,
  ActionType,
  ProductType,
  ApplicationMethod
} from './rule-engine-types.ts';

export interface ResolvedDecision {
  status: 'SUCCESS' | 'BLOCKED' | 'WEATHER_DELAYED' | 'ESCALATED';
  primary_decision?: PrimaryDecision;
  blocked_actions: BlockedAction[];
  secondary_actions: SecondaryAction[];
  warnings: string[];
  blocking_rule?: {
    rule_id: string;
    priority: string;
    reason: string;
    alternatives: string[];
  };
  next_safe_window?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONFLICT RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

export function resolveConflicts(decisions: DecisionsByPriority): ResolvedDecision {
  const blocked_actions: BlockedAction[] = [];
  const secondary_actions: SecondaryAction[] = [];
  const warnings: string[] = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Check P0 Emergency Rules - Block EVERYTHING if triggered
  // ─────────────────────────────────────────────────────────────────────────
  const p0Block = findBlockingRule(decisions.P0_emergency);
  if (p0Block) {
    return {
      status: 'BLOCKED',
      blocked_actions: [createBlockedAction(p0Block, 'P0_EMERGENCY')],
      secondary_actions: [],
      warnings: [`⚠️ Emergency block: ${p0Block.reason}`],
      blocking_rule: {
        rule_id: p0Block.rule_id,
        priority: 'P0_EMERGENCY',
        reason: p0Block.reason,
        alternatives: p0Block.alternatives || []
      }
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Check P1 Regulatory Rules - Block if violation
  // ─────────────────────────────────────────────────────────────────────────
  const p1Block = findBlockingRule(decisions.P1_regulatory);
  if (p1Block) {
    return {
      status: 'BLOCKED',
      blocked_actions: [createBlockedAction(p1Block, 'P1_REGULATORY')],
      secondary_actions: [],
      warnings: [`⚠️ Regulatory violation: ${p1Block.reason}`],
      blocking_rule: {
        rule_id: p1Block.rule_id,
        priority: 'P1_REGULATORY',
        reason: `Regulatory Violation: ${p1Block.reason}`,
        alternatives: p1Block.alternatives || []
      }
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Check P2 Weather Safety - Delay if unsafe
  // ─────────────────────────────────────────────────────────────────────────
  const p2Delay = findDelayRule(decisions.P2_weather_safety);
  if (p2Delay) {
    // Weather delay is not a hard block - suggest waiting
    warnings.push(`⏱️ Weather advisory: ${p2Delay.reason}`);
    
    // If delay is critical (>60% rain), treat as delay status
    if (p2Delay.action === 'DELAY') {
      return {
        status: 'WEATHER_DELAYED',
        blocked_actions: [],
        secondary_actions: [],
        warnings,
        blocking_rule: {
          rule_id: p2Delay.rule_id,
          priority: 'P2_WEATHER_SAFETY',
          reason: p2Delay.reason,
          alternatives: p2Delay.alternatives || ['Wait for weather clearance', 'Use protective cultural practices']
        },
        next_safe_window: p2Delay.next_safe_window
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Collect blocked actions from P3
  // ─────────────────────────────────────────────────────────────────────────
  decisions.P3_crop_stage
    .filter(r => r.action === 'BLOCK')
    .forEach(r => blocked_actions.push(createBlockedAction(r, 'P3_CROP_STAGE')));
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Collect warnings from P3-P6
  // ─────────────────────────────────────────────────────────────────────────
  [...decisions.P3_crop_stage, ...decisions.P4_economic, ...decisions.P5_ipm, ...decisions.P6_optimization]
    .filter(r => r.action === 'WARN')
    .forEach(r => warnings.push(r.reason));
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Collect viable recommendations from P3-P6
  // ─────────────────────────────────────────────────────────────────────────
  const viableActions: RuleResult[] = [
    ...decisions.P3_crop_stage.filter(r => r.action === 'RECOMMEND'),
    ...decisions.P4_economic.filter(r => r.action === 'RECOMMEND'),
    ...decisions.P5_ipm.filter(r => r.action === 'RECOMMEND'),
    ...decisions.P6_optimization.filter(r => r.action === 'RECOMMEND')
  ];
  
  if (viableActions.length === 0) {
    // No recommendations - suggest monitoring
    return {
      status: 'SUCCESS',
      primary_decision: createMonitoringDecision(),
      blocked_actions,
      secondary_actions,
      warnings: warnings.length > 0 ? warnings : ['No specific intervention recommended at this time.']
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Select best action using IPM preference + economic viability
  // ─────────────────────────────────────────────────────────────────────────
  const selectedAction = selectBestAction(viableActions);
  
  // Convert remaining viable actions to secondary recommendations
  viableActions
    .filter(a => a.rule_id !== selectedAction.rule_id)
    .slice(0, 2) // Max 2 alternatives
    .forEach(a => {
      secondary_actions.push({
        action: a.recommendation?.product_name || a.cause,
        reason: a.reason,
        timing: 'As alternative if primary is unavailable',
        priority: 'MEDIUM'
      });
    });
  
  return {
    status: 'SUCCESS',
    primary_decision: convertToPrimaryDecision(selectedAction),
    blocked_actions,
    secondary_actions,
    warnings
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function findBlockingRule(rules: RuleResult[]): RuleResult | undefined {
  return rules.find(r => r.action === 'BLOCK');
}

function findDelayRule(rules: RuleResult[]): RuleResult | undefined {
  return rules.find(r => r.action === 'DELAY');
}

function createBlockedAction(rule: RuleResult, priority: string): BlockedAction {
  return {
    action: rule.cause,
    blocked_by_rule: rule.rule_id,
    priority,
    reason: rule.reason,
    reason_mr: rule.reason_mr,
    reason_hi: rule.reason_hi,
    alternatives: rule.alternatives || []
  };
}

function selectBestAction(viableActions: RuleResult[]): RuleResult {
  // Prioritize by:
  // 1. Lower IPM level (prefer biological over chemical)
  // 2. Higher benefit/cost ratio
  // 3. Higher confidence
  
  const scored = viableActions.map(action => {
    const ipmLevel = action.recommendation?.ipm_level ?? 5;
    const bcr = action.recommendation?.benefit_cost_ratio ?? 1;
    const confidence = action.confidence;
    
    // Score formula: prioritize lower IPM levels, higher BCR, higher confidence
    const score = (6 - ipmLevel) * 100 + bcr * 10 + confidence * 5;
    
    return { action, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  // If top action is IPM level 3-4 (biological/botanical) with BCR > 2, prefer it
  const ipmPreferred = scored.find(s => 
    (s.action.recommendation?.ipm_level ?? 5) <= 4 && 
    (s.action.recommendation?.benefit_cost_ratio ?? 0) > 2
  );
  
  if (ipmPreferred) {
    return ipmPreferred.action;
  }
  
  // Otherwise return highest scored
  return scored[0].action;
}

function convertToPrimaryDecision(rule: RuleResult): PrimaryDecision {
  const rec = rule.recommendation;
  
  const actionType = mapToActionType(rec?.product_type);
  
  return {
    action_type: actionType,
    specific_action: rec?.product_name || rule.cause,
    target: {
      pest_code: rule.cause.includes('PEST') ? rule.cause : undefined,
      disease_code: rule.cause.includes('DISEASE') ? rule.cause : undefined
    },
    urgency: 'WITHIN_24H',
    timing: {
      recommended_start: new Date().toISOString(),
      recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      weather_dependency: true,
      reason: rule.reason
    },
    application_details: {
      product_name: rec?.product_name || 'Recommended treatment',
      product_type: rec?.product_type || 'BOTANICAL',
      concentration: rec?.dosage || 'As per label',
      quantity_per_acre: rec?.dosage || 'As per label',
      total_quantity: 'Calculate based on land size',
      water_requirement: '200-400 liters/acre',
      application_method: (rec?.application_method as ApplicationMethod) || 'FOLIAR_SPRAY',
      coverage_instructions: 'Cover all leaf surfaces, especially undersides',
      repeat_application: {
        needed: true,
        interval_days: 7,
        max_applications_season: 3
      }
    },
    expected_outcomes: {
      efficacy_percent: rec?.efficacy_percent || 75,
      time_to_visible_effect_days: '3-5',
      success_indicators: [
        'Reduction in pest population',
        'Healthy new growth',
        'No new damage symptoms'
      ]
    },
    ipm_level: rec?.ipm_level
  };
}

function mapToActionType(productType?: ProductType): ActionType {
  switch (productType) {
    case 'BIOLOGICAL':
      return 'SPRAY_BIOPESTICIDE';
    case 'BOTANICAL':
      return 'SPRAY_BOTANICAL';
    case 'CHEMICAL':
      return 'SPRAY_CHEMICAL';
    case 'FERTILIZER':
      return 'FERTILIZER_APPLICATION';
    case 'ORGANIC':
      return 'CULTURAL_PRACTICE';
    default:
      return 'SPRAY_BOTANICAL';
  }
}

function createMonitoringDecision(): PrimaryDecision {
  return {
    action_type: 'MONITOR_ONLY',
    specific_action: 'CONTINUE_MONITORING',
    target: {},
    urgency: 'NON_URGENT',
    timing: {
      recommended_start: new Date().toISOString(),
      recommended_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      weather_dependency: false,
      reason: 'Situation does not require immediate intervention'
    },
    application_details: {
      product_name: 'No treatment required',
      product_type: 'ORGANIC',
      concentration: 'N/A',
      quantity_per_acre: 'N/A',
      total_quantity: 'N/A',
      water_requirement: 'N/A',
      application_method: 'HAND_PICKING',
      coverage_instructions: 'Monitor crop health daily. Check for new pest/disease symptoms.'
    },
    expected_outcomes: {
      efficacy_percent: 100,
      time_to_visible_effect_days: 'N/A',
      success_indicators: [
        'Crop remains healthy',
        'No increase in pest population',
        'Normal growth continues'
      ]
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT COMPATIBILITY CHECK
// ═══════════════════════════════════════════════════════════════════════════

export function checkTreatmentCompatibility(
  treatments: string[]
): {
  compatible: boolean;
  conflicts: Array<{
    treatment1: string;
    treatment2: string;
    reason: string;
  }>;
  recommendation: string;
} {
  const conflicts: Array<{ treatment1: string; treatment2: string; reason: string; }> = [];
  
  // Known incompatible combinations
  const incompatiblePairs: Record<string, { incompatibleWith: string[]; reason: string; }> = {
    'COPPER': {
      incompatibleWith: ['OIL_BASED', 'SULPHUR'],
      reason: 'Copper + Oil/Sulfur causes phytotoxicity'
    },
    'SULPHUR': {
      incompatibleWith: ['OIL_BASED', 'COPPER'],
      reason: 'Sulfur + Oil/Copper causes leaf burn'
    },
    'NEONICOTINOID': {
      incompatibleWith: ['PYRETHROID'],
      reason: 'Mixing increases bee toxicity risk'
    }
  };
  
  // Check each pair
  for (let i = 0; i < treatments.length; i++) {
    for (let j = i + 1; j < treatments.length; j++) {
      const t1 = treatments[i].toUpperCase();
      const t2 = treatments[j].toUpperCase();
      
      // Check if t1 is incompatible with t2
      const t1Rules = incompatiblePairs[t1];
      if (t1Rules && t1Rules.incompatibleWith.some(inc => t2.includes(inc))) {
        conflicts.push({
          treatment1: treatments[i],
          treatment2: treatments[j],
          reason: t1Rules.reason
        });
      }
      
      // Check if t2 is incompatible with t1
      const t2Rules = incompatiblePairs[t2];
      if (t2Rules && t2Rules.incompatibleWith.some(inc => t1.includes(inc))) {
        conflicts.push({
          treatment1: treatments[j],
          treatment2: treatments[i],
          reason: t2Rules.reason
        });
      }
    }
  }
  
  const compatible = conflicts.length === 0;
  let recommendation: string;
  
  if (compatible) {
    recommendation = 'Treatments can be applied together or in sequence.';
  } else {
    recommendation = 'Apply treatments separately with at least 7-day interval.';
  }
  
  return { compatible, conflicts, recommendation };
}
