// RESPONSE INVARIANT GUARD v1.0.0

export const RESPONSE_INVARIANT_GUARD_VERSION = '1.0.0';

// TYPES

export interface ResponseInvariantInput {
  /** Whether a PRIMARY_DECISION exists */
  hasPrimaryDecision: boolean;
  
  /** The rule_id of the primary decision (if any) */
  primaryRuleId?: string;
  
  /** The action_type of the primary decision (if any) */
  primaryActionType?: string;
  
  /** Whether clarification was completed in this session */
  clarificationCompleted: boolean;
  
  /** Number of rules that fired */
  rulesFired: number;
  
  /** Trace ID for logging/debugging */
  traceId: string;
  
  /** Processing time so far in ms */
  processingTimeMs?: number;
}

export interface InvariantCheckResult {
  /** Whether a response MUST be returned */
  mustReturnResponse: boolean;
  
  /** Human-readable reason for the decision */
  reason: string;
  
  /** Priority level of this invariant */
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
  
  /** Invariant code for logging */
  invariantCode: string;
}

export interface ResponseInvariantContext {
  /** Flag to track if response was returned */
  responseReturned: boolean;
  
  /** The invariant check result */
  invariant: InvariantCheckResult;
  
  /** Trace ID for correlation */
  traceId: string;
  
  /** Timestamp when invariant was checked */
  checkedAt: string;
}

// INVARIANT CHECK FUNCTION

// Check if response invariants are triggered
export function checkResponseInvariant(input: ResponseInvariantInput): InvariantCheckResult {
  const { 
    hasPrimaryDecision, 
    primaryRuleId, 
    primaryActionType,
    clarificationCompleted, 
    rulesFired, 
    traceId 
  } = input;
  
  // INVARIANT 1 (CRITICAL): PRIMARY_DECISION with valid rule_id
  if (hasPrimaryDecision && primaryRuleId && primaryActionType) {
    console.log(`\n✅ [INVARIANT:CRITICAL] PRIMARY_DECISION valid - response REQUIRED`);
    console.log(`   [${traceId}] rule_id: ${primaryRuleId}`);
    console.log(`   [${traceId}] action_type: ${primaryActionType}`);
    
    return {
      mustReturnResponse: true,
      reason: `PRIMARY_DECISION exists with rule_id=${primaryRuleId}, action_type=${primaryActionType}`,
      priority: 'CRITICAL',
      invariantCode: 'PRIMARY_DECISION_EXISTS'
    };
  }
  
  // INVARIANT 2 (HIGH): Clarification completed AND rules fired
  if (clarificationCompleted && rulesFired > 0) {
    console.log(`\n⚠️ [INVARIANT:HIGH] Clarification completed + rules fired - response REQUIRED`);
    console.log(`   [${traceId}] clarificationCompleted: true`);
    console.log(`   [${traceId}] rulesFired: ${rulesFired}`);
    
    return {
      mustReturnResponse: true,
      reason: `Clarification completed with ${rulesFired} rules fired`,
      priority: 'HIGH',
      invariantCode: 'CLARIFICATION_PLUS_RULES'
    };
  }
  
  // INVARIANT 3 (HIGH): PRIMARY_DECISION exists but incomplete
  if (hasPrimaryDecision && (primaryRuleId || primaryActionType)) {
    console.log(`\n⚠️ [INVARIANT:HIGH] Partial PRIMARY_DECISION - response ADVISED`);
    console.log(`   [${traceId}] rule_id: ${primaryRuleId || 'MISSING'}`);
    console.log(`   [${traceId}] action_type: ${primaryActionType || 'MISSING'}`);
    
    return {
      mustReturnResponse: true,
      reason: `Partial PRIMARY_DECISION (rule_id=${primaryRuleId || 'MISSING'}, action_type=${primaryActionType || 'MISSING'})`,
      priority: 'HIGH',
      invariantCode: 'PARTIAL_PRIMARY_DECISION'
    };
  }
  
  // NO INVARIANT TRIGGERED - Normal flow continues
  return {
    mustReturnResponse: false,
    reason: 'No response invariant triggered',
    priority: 'NORMAL',
    invariantCode: 'NONE'
  };
}

// ASSERTION FUNCTION

// Assert that a response was returned when invariant required it
export function assertResponseReturned(
  responseReturned: boolean,
  invariant: InvariantCheckResult,
  traceId: string
): void {
  if (invariant.mustReturnResponse && !responseReturned) {
    const errorMsg = `[INVARIANT VIOLATION] ${invariant.reason} but no response returned`;
    
    console.error(`\n🚨 [${traceId}] ${errorMsg}`);
    console.error(`   Priority: ${invariant.priority}`);
    console.error(`   Invariant Code: ${invariant.invariantCode}`);
    console.error(`   Timestamp: ${new Date().toISOString()}`);
    
    // Throw to trigger error handling and ensure we don't time out silently
    throw new Error(`[${traceId}] ${errorMsg} (priority: ${invariant.priority})`);
  }
}

// CONTEXT BUILDER

// Build invariant context for tracking throughout the orchestration flow
export function buildInvariantContext(input: ResponseInvariantInput): ResponseInvariantContext {
  const invariant = checkResponseInvariant(input);
  
  return {
    responseReturned: false,
    invariant,
    traceId: input.traceId,
    checkedAt: new Date().toISOString()
  };
}

// Mark response as returned in the context
export function markResponseReturned(context: ResponseInvariantContext): void {
  context.responseReturned = true;
  console.log(`   ✅ [INVARIANT] Response marked as returned for ${context.traceId}`);
}

// LOGGING HELPERS

// Log invariant check result for audit trail
export function logInvariantCheck(
  invariant: InvariantCheckResult,
  traceId: string,
  processingTimeMs?: number
): void {
  if (invariant.mustReturnResponse) {
    console.log(`\n🔒 [INVARIANT CHECK] ${invariant.invariantCode}`);
    console.log(`   [${traceId}] Priority: ${invariant.priority}`);
    console.log(`   [${traceId}] Reason: ${invariant.reason}`);
    console.log(`   [${traceId}] Must Return: YES`);
    if (processingTimeMs) {
      console.log(`   [${traceId}] Processing Time: ${processingTimeMs}ms`);
    }
  }
}

export default {
  checkResponseInvariant,
  assertResponseReturned,
  buildInvariantContext,
  markResponseReturned,
  logInvariantCheck,
  RESPONSE_INVARIANT_GUARD_VERSION
};
