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
  // STEP 3: Collect blocked actions from P3
  // ─────────────────────────────────────────────────────────────────────────
  decisions.P3_crop_stage
    .filter(r => r.action === 'BLOCK')
    .forEach(r => blocked_actions.push(createBlockedAction(r, 'P3_CROP_STAGE')));
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Collect warnings from P3-P6
  // ─────────────────────────────────────────────────────────────────────────
  [...decisions.P3_crop_stage, ...decisions.P4_economic, ...decisions.P5_ipm, ...decisions.P6_optimization]
    .filter(r => r.action === 'WARN')
    .forEach(r => warnings.push(r.reason));
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Collect viable recommendations from P3-P6
  // ─────────────────────────────────────────────────────────────────────────
  const viableActions: RuleResult[] = [
    ...decisions.P3_crop_stage.filter(r => r.action === 'RECOMMEND'),
    ...decisions.P4_economic.filter(r => r.action === 'RECOMMEND'),
    ...decisions.P5_ipm.filter(r => r.action === 'RECOMMEND'),
    ...decisions.P6_optimization.filter(r => r.action === 'RECOMMEND')
  ];
  
  if (viableActions.length === 0) {
    // No recommendations - suggest monitoring (no weather delay for monitoring)
    return {
      status: 'SUCCESS',
      primary_decision: createMonitoringDecision(),
      blocked_actions,
      secondary_actions,
      warnings: warnings.length > 0 ? warnings : ['No specific intervention recommended at this time.']
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: SELECT BEST ACTION FIRST - then apply weather delay ONLY if it's spray
  // CRITICAL FIX: This ensures non-spray actions (fertilizer, monitoring, cultural)
  // are never blocked by weather when spray alternatives exist
  // ─────────────────────────────────────────────────────────────────────────
  const selectedAction = selectBestAction(viableActions);
  const selectedIsSpray = isSprayAction(selectedAction);
  
  console.log(`🎯 [ConflictResolver] Selected action: ${selectedAction.cause}, isSpray: ${selectedIsSpray}`);
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Check P2 Weather Safety - ONLY delay if selected action is spray-type
  // ─────────────────────────────────────────────────────────────────────────
  const p2Delay = findDelayRule(decisions.P2_weather_safety);
  
  if (p2Delay) {
    if (selectedIsSpray) {
      // The selected action IS a spray - check for non-spray alternatives
      const nonSprayAlternatives = viableActions.filter(a => 
        a.rule_id !== selectedAction.rule_id && !isSprayAction(a)
      );
      
      if (nonSprayAlternatives.length > 0) {
        // Non-spray alternatives exist - use the best one instead
        const bestNonSpray = selectBestAction(nonSprayAlternatives);
        console.log(`🔄 [ConflictResolver] Switching from spray to non-spray: ${bestNonSpray.cause}`);
        
        // Add spray postponement warning
        warnings.push(`⏱️ ${p2Delay.reason} - फवारणी पुढे ढकला, सध्या इतर कृती करा`);
        
        // Convert remaining viable actions to secondary recommendations (including delayed spray)
        viableActions
          .filter(a => a.rule_id !== bestNonSpray.rule_id)
          .slice(0, 2)
          .forEach(a => {
            const isDelayedSpray = isSprayAction(a);
            // CRITICAL FIX: Never use reason text as action name - it may contain weather/harvest messages
            const actionLabel = a.recommendation?.product_name || 
                               (a.cause && !a.cause.includes('_') && a.cause.length < 50 ? a.cause : 'INTEGRATED');
            secondary_actions.push({
              action: actionLabel,
              reason: isDelayedSpray ? `${a.reason} (हवामान सुधारल्यावर)` : a.reason,
              timing: isDelayedSpray ? 'After weather clears' : 'As alternative if primary is unavailable',
              priority: isDelayedSpray ? 'LOW' : 'MEDIUM'
            });
          });
        
        return {
          status: 'SUCCESS', // NOT WEATHER_DELAYED - we have non-spray action
          primary_decision: convertToPrimaryDecision(bestNonSpray),
          blocked_actions,
          secondary_actions,
          warnings
        };
      } else {
        // No non-spray alternatives - must return WEATHER_DELAYED
        warnings.push(`⏱️ Weather advisory: ${p2Delay.reason}`);
        
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
    } else {
      // Selected action is NOT spray - just add weather note, don't delay
      warnings.push(`ℹ️ Weather note: ${p2Delay.reason} (does not affect current recommendation)`);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP 8: No weather delay applies - return selected action as SUCCESS
  // ─────────────────────────────────────────────────────────────────────────
  
  // Convert remaining viable actions to secondary recommendations
  // CRITICAL FIX: Never use reason_mr/hi as action name - those are user messages, not product/action identifiers
  viableActions
    .filter(a => a.rule_id !== selectedAction.rule_id)
    .slice(0, 2) // Max 2 alternatives
    .forEach(a => {
      // CRITICAL FIX: Use product name, cause, or generic label - NEVER use reason text which may contain weather/harvest messages
      const actionLabel = a.recommendation?.product_name || 
                          (a.cause && !a.cause.includes('_') && a.cause.length < 50 ? a.cause : 'INTEGRATED');
      secondary_actions.push({
        action: actionLabel,
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

/**
 * CRITICAL FIX: Check if a rule result is for a spray-type action
 * Weather delays should ONLY apply to spray actions, not fertilizer/monitoring/diagnosis
 */
function isSprayAction(rule: RuleResult): boolean {
  const sprayTypes = ['CHEMICAL', 'BOTANICAL', 'BIOLOGICAL', 'BIOPESTICIDE'];
  const sprayKeywords = ['spray', 'फवारणी', 'छिड़काव', 'foliar', 'pesticide', 'insecticide', 'fungicide'];
  
  // Check product type
  if (rule.recommendation?.product_type && sprayTypes.includes(rule.recommendation.product_type)) {
    return true;
  }
  
  // Check action keywords in reason or recommendation
  const textToCheck = `${rule.reason || ''} ${rule.recommendation?.product_name || ''} ${rule.cause || ''}`.toLowerCase();
  return sprayKeywords.some(kw => textToCheck.includes(kw));
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

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION HARDENING: ACTION TYPE PRIORITY (STRICT ORDER)
// This ensures deterministic primary decision selection
// ═══════════════════════════════════════════════════════════════════════════
const ACTION_TYPE_PRIORITY: Record<string, number> = {
  // BLOCKING actions are highest priority
  'BLOCK': 1,
  'URGENT_BLOCK': 1,
  
  // URGENT actions come next
  'URGENT_ACTION': 2,
  'URGENT_TREATMENT': 2,
  'urgent_treatment': 2,
  
  // IMMEDIATE actions
  'IMMEDIATE_ACTION': 3,
  'IMMEDIATE_TREATMENT': 3,
  
  // TREATMENT recommendations
  'TREATMENT': 4,
  'treatment': 4,
  'RECOMMEND': 4,
  'SPRAY_CHEMICAL': 4,
  'SPRAY_BIOPESTICIDE': 4,
  'SPRAY_BOTANICAL': 4,
  
  // PREVENTION
  'PREVENTION': 5,
  'prevention': 5,
  'CULTURAL_PRACTICE': 5,
  
  // ADVISORY/MONITORING
  'MONITOR': 6,
  'MONITOR_ONLY': 6,
  'monitoring': 6,
  'advisory': 6,
  'ADVISORY': 6,
  
  // DIAGNOSIS (not an action, but for completeness)
  'DIAGNOSIS': 7,
  'diagnosis': 7,
  
  // CLARIFICATION (not an action, but for completeness)
  'CLARIFICATION': 8,
  'clarification': 8,
  
  // NO_ACTION is lowest priority
  'NO_ACTION_REQUIRED': 9,
  'NO_ACTION': 9
};

function getActionTypePriority(actionType?: string): number {
  if (!actionType) return 999; // Missing action_type = lowest priority
  return ACTION_TYPE_PRIORITY[actionType] ?? 50; // Default middle priority for unknown types
}

function selectBestAction(viableActions: RuleResult[]): RuleResult | null {
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION HARDENING: Filter out rules without valid action_type FIRST
  // Then apply priority-based selection
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Step 1: Filter out rules without action_type (these cannot become primary decisions)
  const validActions = viableActions.filter(a => {
    const hasActionType = !!a.action_type || !!a.recommendation?.action_type;
    if (!hasActionType) {
      console.warn(`⚠️ [selectBestAction] Filtering out rule ${a.rule_id} - no action_type`);
    }
    return hasActionType;
  });
  
  // CRITICAL FIX (Forensic 2026-06-28): When NO rule has a real action_type,
  // do NOT promote the first viable rule and let convertToPrimaryDecision
  // synthesise a bogus URGENT_ACTION (root cause of "germination → flood prep
  // / crop rotation" misfires). Return null so the caller can short-circuit
  // to a monitoring-only response and let the orchestrator fall through to
  // the deferred-clarification path.
  if (validActions.length === 0) {
    console.warn(`⚠️ [selectBestAction] No rules with action_type - returning null (no actionable rule synthesis)`);
    return null;
  }
  
  // Step 2: Score by action_type priority FIRST, then IPM level, then confidence
  const scored = validActions.map(action => {
    const actionType = action.action_type || action.recommendation?.action_type || '';
    const actionPriority = getActionTypePriority(actionType);
    const ipmLevel = action.recommendation?.ipm_level ?? 5;
    const bcr = action.recommendation?.benefit_cost_ratio ?? 1;
    const confidence = action.confidence || 0;
    
    // Score formula: 
    // - Lower action_type priority = HIGHER score (we invert it)
    // - Then lower IPM levels = higher score
    // - Then higher confidence
    const score = (100 - actionPriority) * 1000 + (6 - ipmLevel) * 100 + bcr * 10 + confidence * 5;
    
    return { action, score, actionPriority, actionType };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  console.log(`🎯 [selectBestAction] Ranked ${scored.length} actions:`);
  scored.slice(0, 3).forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.action.rule_id}: action_type=${s.actionType}, priority=${s.actionPriority}, score=${s.score}`);
  });
  
  // Return highest scored
  return scored[0].action;
}

function convertToPrimaryDecision(rule: RuleResult): PrimaryDecision {
  const rec = rule.recommendation;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTION HARDENING: action_type MUST come from rule, NOT derived from product_type
  // This is the CRITICAL fix - action_type was being lost in the conversion
  // ═══════════════════════════════════════════════════════════════════════════
  const actionType = rule.action_type || 
                     rec?.action_type || 
                     mapToActionType(rec?.product_type);
  
  // CRITICAL: Log if action_type is missing - this indicates a data issue
  if (!rule.action_type && !rec?.action_type) {
    console.warn(`⚠️ [convertToPrimaryDecision] Rule ${rule.rule_id} missing action_type - deriving from product_type`);
  }
  
  // CRITICAL FIX: Extract product name properly, NEVER use reason_mr/hi as product name
  // reason fields contain user-facing messages like weather warnings, NOT product names
  const productName = rec?.product_name || 
                      extractProductFromReason(rule.reason) ||
                      (rule.cause && !rule.cause.includes('_') && rule.cause.length < 50 ? rule.cause : undefined);
  
  const dosage = rec?.dosage || extractDosageFromReason(rule.reason);
  
  // CRITICAL FIX: Extract pest/disease codes from rule metadata, not just keyword matching
  const pestCode = rule.pest_code || (rule.cause?.toUpperCase().includes('PEST') || 
                   rule.cause?.toUpperCase().includes('BORER') || 
                   rule.cause?.toUpperCase().includes('WHITEFLY') ? rule.cause : undefined);
  const diseaseCode = rule.disease_code || (rule.cause?.toUpperCase().includes('DISEASE') || 
                      rule.cause?.toUpperCase().includes('BLIGHT') ||
                      rule.cause?.toUpperCase().includes('ROT') ? rule.cause : undefined);
  
  console.log(`🎯 [ConflictResolver] Converting to PrimaryDecision:`);
  console.log(`   rule_id=${rule.rule_id}, action_type=${actionType}`);
  console.log(`   product=${productName}, dosage=${dosage}`);
  console.log(`   pest=${pestCode}, disease=${diseaseCode}`);
  
  return {
    // ═══════════════════════════════════════════════════════════════════════════
    // PRODUCTION HARDENING: These fields are REQUIRED for valid PrimaryDecision
    // ═══════════════════════════════════════════════════════════════════════════
    action_type: actionType,
    rule_id: rule.rule_id, // CRITICAL: Include rule_id for traceability
    specific_action: productName || rule.cause,
    target: {
      pest_code: pestCode,
      disease_code: diseaseCode
    },
    urgency: 'WITHIN_24H',
    timing: {
      recommended_start: new Date().toISOString(),
      recommended_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      weather_dependency: true,
      reason: rule.reason
    },
    application_details: {
      // CRITICAL FIX: NEVER use reason_mr/hi as product_name - those contain user messages, not products
      // If no product found, provide a clear placeholder that the LLM formatter can handle
      product_name: productName || (rec?.efficacy_percent ? 'Recommended treatment' : 'Consult agricultural expert'),
      product_type: rec?.product_type || 'BOTANICAL',
      concentration: dosage || 'See product label',
      quantity_per_acre: dosage || 'See product label',
      total_quantity: 'Calculate based on land size',
      water_requirement: '200-400 liters/acre',
      application_method: (rec?.application_method as ApplicationMethod) || 'FOLIAR_SPRAY',
      coverage_instructions: 'Cover all leaf surfaces, especially undersides',
      repeat_application: {
        needed: true,
        interval_days: 7,
        max_applications_season: 3
      },
      // ═══════════════════════════════════════════════════════════════════════════
      // NEW RESPONSE CONTRACT: Pass structured response fields
      // ═══════════════════════════════════════════════════════════════════════════
      action_text: rec?.action_text || rule.action_text,
      reason_text: rec?.reason_text || rule.reason_text,
      knowledge_text: rec?.knowledge_text || rule.knowledge_text
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
    ipm_level: rec?.ipm_level,
    // Preserve multilingual reasons for LLM formatter (LEGACY - for backward compat)
    reason_mr: rule.reason_mr,
    reason_hi: rule.reason_hi
  };
}

/**
 * CRITICAL FIX: Extract product name from reason text when not explicitly provided
 * Handles formats like "Apply XYZ @ dosage" or "Use ABC product"
 */
function extractProductFromReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  
  // Common patterns: "Apply X @ Y", "Use X", "Spray X"
  const patterns = [
    /(?:Apply|Use|Spray|वापरा|लगाएं)\s+([A-Za-z0-9\s]+(?:WP|SC|EC|SL|WG|SP)?)\s*@/i,
    /(?:Apply|Use|Spray)\s+([A-Za-z0-9\s]+(?:WP|SC|EC|SL|WG|SP)?)/i,
    /([A-Za-z0-9]+\s+\d+(?:\.\d+)?\s*(?:WP|SC|EC|SL|WG|SP))/i
  ];
  
  for (const pattern of patterns) {
    const match = reason.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * CRITICAL FIX: Extract dosage from reason text
 * Handles formats like "@ 3ml/10L" or "@ 25g/10L"
 */
function extractDosageFromReason(reason?: string): string | undefined {
  if (!reason) return undefined;
  
  // Pattern: @ followed by dosage
  const patterns = [
    /@\s*(\d+(?:\.\d+)?(?:ml|g|kg|L|gm)\/\d+L)/i,
    /(\d+(?:\.\d+)?(?:ml|g|kg|gm)\/\d+L)/i,
    /(\d+(?:\.\d+)?(?:ml|g)\/(?:10|15|16)L)/i
  ];
  
  for (const pattern of patterns) {
    const match = reason.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
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
      product_name: 'Continue regular monitoring',
      product_type: 'CULTURAL',
      concentration: 'Monitor daily',
      quantity_per_acre: 'Visual inspection',
      total_quantity: 'Daily observations',
      water_requirement: 'Regular irrigation schedule',
      application_method: 'HAND_PICKING',
      coverage_instructions: 'Monitor crop health daily. Check for new pest/disease symptoms. Look for yellowing leaves, holes, or unusual spots.'
    },
    expected_outcomes: {
      efficacy_percent: 100,
      time_to_visible_effect_days: 'Ongoing',
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
