// PHASE 1: GRAPH CONTROL VALIDATOR

export const GRAPH_CONTROL_VERSION = '1.0.0';

// TYPE DEFINITIONS

export interface GraphValidationInput {
  rule_id: string;
  blocks_rule_ids: string[];
  prerequisite_rule_ids: string[];
}

export interface GraphValidationResult {
  can_fire: boolean;
  blocked_by: string[];
  missing_prerequisites: string[];
  reason: string;
}

export interface FiredRuleContext {
  fired_rule_ids: Set<string>;
  blocked_rule_ids: Set<string>;
}

// RULE BLOCKING CHECK

// Check if a rule is blocked by any previously fired rule
export function checkRuleBlocking(
  ruleId: string,
  firedRules: Map<string, string[]>
): { blocked: boolean; blocked_by: string[] } {
  const blockedBy: string[] = [];
  
  for (const [firedRuleId, blocksRuleIds] of firedRules.entries()) {
    if (blocksRuleIds && blocksRuleIds.includes(ruleId)) {
      blockedBy.push(firedRuleId);
    }
  }
  
  return {
    blocked: blockedBy.length > 0,
    blocked_by: blockedBy
  };
}

// PREREQUISITE CHECK

// Check if all prerequisites have been satisfied
export function checkPrerequisites(
  prerequisiteRuleIds: string[],
  firedRuleIds: Set<string>
): { satisfied: boolean; missing: string[] } {
  if (!prerequisiteRuleIds || prerequisiteRuleIds.length === 0) {
    return { satisfied: true, missing: [] };
  }
  
  const missing: string[] = [];
  
  for (const prereq of prerequisiteRuleIds) {
    if (!firedRuleIds.has(prereq)) {
      missing.push(prereq);
    }
  }
  
  return {
    satisfied: missing.length === 0,
    missing
  };
}

// COMBINED VALIDATION

// Validate all graph constraints for a rule
export function validateGraphConstraints(
  rule: GraphValidationInput,
  firedRules: Map<string, string[]>,
  firedRuleIds: Set<string>
): GraphValidationResult {
  // Check blocking
  const blockingResult = checkRuleBlocking(rule.rule_id, firedRules);
  
  // Check prerequisites
  const prereqResult = checkPrerequisites(rule.prerequisite_rule_ids, firedRuleIds);
  
  // Build result
  if (blockingResult.blocked) {
    return {
      can_fire: false,
      blocked_by: blockingResult.blocked_by,
      missing_prerequisites: [],
      reason: `Rule ${rule.rule_id} blocked by: ${blockingResult.blocked_by.join(', ')}`
    };
  }
  
  if (!prereqResult.satisfied) {
    return {
      can_fire: false,
      blocked_by: [],
      missing_prerequisites: prereqResult.missing,
      reason: `Rule ${rule.rule_id} missing prerequisites: ${prereqResult.missing.join(', ')}`
    };
  }
  
  return {
    can_fire: true,
    blocked_by: [],
    missing_prerequisites: [],
    reason: 'All graph constraints satisfied'
  };
}

// FIRED RULE CONTEXT BUILDER

// Create a context for tracking fired rules and their blocking relationships
export function createFiredRuleContext(): FiredRuleContext {
  return {
    fired_rule_ids: new Set(),
    blocked_rule_ids: new Set()
  };
}

// Register a rule as fired and update blocked rules list
export function registerFiredRule(
  context: FiredRuleContext,
  ruleId: string,
  blocksRuleIds: string[]
): void {
  context.fired_rule_ids.add(ruleId);
  
  if (blocksRuleIds && blocksRuleIds.length > 0) {
    for (const blockedId of blocksRuleIds) {
      context.blocked_rule_ids.add(blockedId);
    }
  }
}

// Check if a rule is blocked in the current context
export function isRuleBlocked(context: FiredRuleContext, ruleId: string): boolean {
  return context.blocked_rule_ids.has(ruleId);
}

// LOGGING

export function logGraphValidation(
  ruleId: string,
  result: GraphValidationResult,
  traceId?: string
): void {
  const prefix = traceId ? `[${traceId}]` : '';
  
  if (result.can_fire) {
    console.log(`${prefix} ✅ [GraphControl] Rule ${ruleId} passed graph constraints`);
  } else {
    console.warn(`${prefix} 🚫 [GraphControl] Rule ${ruleId} BLOCKED: ${result.reason}`);
    
    if (result.blocked_by.length > 0) {
      console.warn(`${prefix}    Blocked by: ${result.blocked_by.join(', ')}`);
    }
    
    if (result.missing_prerequisites.length > 0) {
      console.warn(`${prefix}    Missing prerequisites: ${result.missing_prerequisites.join(', ')}`);
    }
  }
}

// P2-3: MUTUAL EXCLUSION ENFORCEMENT

export interface MutualExclusionInput {
  rule_id: string;
  mutually_exclusive_with: string[];
}

// Check if a rule is blocked by mutual exclusion constraints
export function checkMutualExclusion(
  ruleId: string,
  firedRuleMutexMap: Map<string, string[]>,
  firedRuleIds: Set<string>
): { blocked: boolean; blocked_by: string | null; reason: string } {
  // Check 1: Has a fired rule declared this rule as mutually exclusive?
  for (const [firedRuleId, mutexList] of firedRuleMutexMap.entries()) {
    if (mutexList && mutexList.includes(ruleId)) {
      return {
        blocked: true,
        blocked_by: firedRuleId,
        reason: `Rule ${ruleId} is mutually exclusive with already-fired rule ${firedRuleId}`
      };
    }
  }
  
  // Check 2: Does this rule's mutex list contain any already-fired rule?
  // (This requires the caller to pass the current rule's mutex list separately)
  return { blocked: false, blocked_by: null, reason: '' };
}

// Full mutual exclusion validation including bidirectional check
export function validateMutualExclusion(
  rule: MutualExclusionInput,
  firedRuleMutexMap: Map<string, string[]>,
  firedRuleIds: Set<string>
): { blocked: boolean; blocked_by: string | null; reason: string } {
  // Direction 1: A fired rule lists this rule in its mutex
  const check1 = checkMutualExclusion(rule.rule_id, firedRuleMutexMap, firedRuleIds);
  if (check1.blocked) return check1;
  
  // Direction 2: This rule lists a fired rule in its mutex
  if (rule.mutually_exclusive_with && rule.mutually_exclusive_with.length > 0) {
    for (const mutexId of rule.mutually_exclusive_with) {
      if (firedRuleIds.has(mutexId)) {
        return {
          blocked: true,
          blocked_by: mutexId,
          reason: `Rule ${rule.rule_id} declares mutual exclusion with already-fired rule ${mutexId}`
        };
      }
    }
  }
  
  return { blocked: false, blocked_by: null, reason: '' };
}

// Register a fired rule's mutual exclusion list for future checks
export function registerMutualExclusion(
  mutexMap: Map<string, string[]>,
  ruleId: string,
  mutuallyExclusiveWith: string[]
): void {
  if (mutuallyExclusiveWith && mutuallyExclusiveWith.length > 0) {
    mutexMap.set(ruleId, mutuallyExclusiveWith);
  }
}

export default {
  GRAPH_CONTROL_VERSION,
  checkRuleBlocking,
  checkPrerequisites,
  validateGraphConstraints,
  createFiredRuleContext,
  registerFiredRule,
  isRuleBlocked,
  logGraphValidation,
  checkMutualExclusion,
  validateMutualExclusion,
  registerMutualExclusion
};
