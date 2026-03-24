/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INVARIANT GUARDS v1.0.0 - Runtime Assertion System for Decision Brain
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Non-fatal runtime checks that LOG violations but DON'T crash.
 * All violations are captured for audit and analysis.
 * 
 * PRODUCTION SAFETY: These guards ensure the system fails gracefully
 * while capturing diagnostic data for debugging.
 * 
 * @version 1.0.0
 */

export const INVARIANT_GUARD_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// INVARIANT VIOLATION TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface InvariantViolation {
  /** Invariant code for categorization */
  invariant: string;
  
  /** Expected value description */
  expected: string;
  
  /** Actual value found */
  actual: string;
  
  /** Trace ID for correlation */
  trace_id: string;
  
  /** When violation occurred */
  timestamp: string;
  
  /** Severity: error = critical, warn = important, info = diagnostic */
  severity: 'error' | 'warn' | 'info';
}

// ═══════════════════════════════════════════════════════════════════════════
// INDIVIDUAL INVARIANT CHECKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assert response_mode is always defined
 */
export function assertResponseModeExists(
  result: { response_mode?: unknown },
  traceId: string
): InvariantViolation | null {
  if (!result.response_mode) {
    return {
      invariant: 'RESPONSE_MODE_REQUIRED',
      expected: 'One of: READY, OBSERVATION, MONITOR_ONLY, CLARIFICATION, TREATMENT, etc.',
      actual: String(result.response_mode),
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'error'
    };
  }
  return null;
}

/**
 * Assert fallback_i18n_key or primary_i18n_key exists
 */
export function assertI18nKeyExists(
  result: { fallback_i18n_key?: unknown; primary_i18n_key?: unknown },
  traceId: string
): InvariantViolation | null {
  if (!result.fallback_i18n_key && !result.primary_i18n_key) {
    return {
      invariant: 'I18N_KEY_REQUIRED',
      expected: 'Non-empty fallback_i18n_key or primary_i18n_key',
      actual: 'both undefined',
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'warn'
    };
  }
  return null;
}

/**
 * Assert rules_applied is never empty
 */
export function assertRulesAppliedNotEmpty(
  result: { rules_applied?: unknown[] },
  traceId: string
): InvariantViolation | null {
  const rules = result.rules_applied;
  if (!Array.isArray(rules) || rules.length === 0) {
    return {
      invariant: 'RULES_APPLIED_NOT_EMPTY',
      expected: 'At least one rule (can be FALLBACK_RULE)',
      actual: Array.isArray(rules) ? '[]' : String(typeof rules),
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'warn'
    };
  }
  return null;
}

/**
 * Assert decision_confidence is numeric
 */
export function assertDecisionConfidenceNumeric(
  result: { decision_confidence?: unknown },
  traceId: string
): InvariantViolation | null {
  if (typeof result.decision_confidence !== 'number') {
    return {
      invariant: 'DECISION_CONFIDENCE_NUMERIC',
      expected: 'number between 0-100',
      actual: String(typeof result.decision_confidence),
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'warn'
    };
  }
  return null;
}

/**
 * Assert action_codes is an array
 */
export function assertActionCodesArray(
  result: { action_codes?: unknown },
  traceId: string
): InvariantViolation | null {
  if (!Array.isArray(result.action_codes)) {
    return {
      invariant: 'ACTION_CODES_ARRAY',
      expected: 'Array of action code strings',
      actual: String(typeof result.action_codes),
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'warn'
    };
  }
  return null;
}

/**
 * Assert authority is resolved when treatments are allowed
 */
export function assertAuthorityResolved(
  result: { authority_resolved?: boolean; treatments_allowed?: boolean },
  traceId: string
): InvariantViolation | null {
  if (result.treatments_allowed && !result.authority_resolved) {
    return {
      invariant: 'AUTHORITY_RESOLVED_FOR_TREATMENT',
      expected: 'authority_resolved=true when treatments_allowed=true',
      actual: `authority_resolved=${result.authority_resolved}`,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'error'
    };
  }
  return null;
}

/**
 * Assert severity is valid enum value
 */
export function assertSeverityValid(
  result: { severity?: unknown },
  traceId: string
): InvariantViolation | null {
  const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO', 'ADVISORY', 'WARNING'];
  const severity = typeof result.severity === 'string' ? result.severity.toUpperCase() : '';
  
  if (result.severity && !validSeverities.includes(severity)) {
    return {
      invariant: 'SEVERITY_VALID_ENUM',
      expected: `One of: ${validSeverities.join(', ')}`,
      actual: String(result.severity),
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'warn'
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL INVARIANT: Low confidence + symptoms must NOT return OBSERVATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Assert OBSERVATION mode is not used when confidence is low and symptoms exist
 * This is the CRITICAL INVARIANT that prevents the template repetition bug
 */
export function assertConfidenceObservationInvariant(
  result: { 
    response_mode?: string;
    decision_confidence?: number;
    has_symptoms?: boolean;
  },
  traceId: string
): InvariantViolation | null {
  const mode = typeof result.response_mode === 'string' ? result.response_mode.toUpperCase() : '';
  const confidence = typeof result.decision_confidence === 'number' ? result.decision_confidence : 100;
  const hasSymptoms = !!result.has_symptoms;
  
  // CRITICAL INVARIANT: Low confidence + symptoms should NOT return OBSERVATION
  if (mode === 'OBSERVATION' && confidence < 70 && hasSymptoms) {
    return {
      invariant: 'CONFIDENCE_OBSERVATION_INVARIANT',
      expected: 'ResponseMode.CLARIFICATION or PHOTO_REQUIRED when confidence < 70% with symptoms',
      actual: `OBSERVATION with confidence=${confidence}%, has_symptoms=${hasSymptoms}`,
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      severity: 'error'
    };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MASTER VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export interface InvariantValidationResult {
  valid: boolean;
  violations: InvariantViolation[];
  error_count: number;
  warn_count: number;
}

/**
 * Validate all invariants on a response object
 * Returns array of violations (empty = all valid)
 */
export function validateAllInvariants(
  result: Record<string, unknown>,
  traceId: string
): InvariantValidationResult {
  const violations: InvariantViolation[] = [];
  
  // Run all invariant checks
  const checks = [
    () => assertResponseModeExists(result, traceId),
    () => assertI18nKeyExists(result, traceId),
    () => assertRulesAppliedNotEmpty(result, traceId),
    () => assertDecisionConfidenceNumeric(result, traceId),
    () => assertActionCodesArray(result, traceId),
    () => assertSeverityValid(result, traceId),
    () => assertConfidenceObservationInvariant(result, traceId),
    () => assertAuthorityResolved(result, traceId)
  ];
  
  for (const check of checks) {
    const violation = check();
    if (violation) {
      // Log based on severity
      if (violation.severity === 'error') {
        console.error(`🚨 [INVARIANT] ${violation.invariant}: expected ${violation.expected}, got ${violation.actual}`);
      } else if (violation.severity === 'warn') {
        console.warn(`⚠️ [INVARIANT] ${violation.invariant}: expected ${violation.expected}, got ${violation.actual}`);
      } else {
        console.log(`ℹ️ [INVARIANT] ${violation.invariant}: expected ${violation.expected}, got ${violation.actual}`);
      }
      violations.push(violation);
    }
  }
  
  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warnCount = violations.filter(v => v.severity === 'warn').length;
  
  return {
    valid: errorCount === 0,
    violations,
    error_count: errorCount,
    warn_count: warnCount
  };
}

/**
 * Throw if critical invariants are violated (for hard enforcement)
 * Use sparingly - prefer logging over crashing in production
 */
export function enforceInvariantsStrict(
  result: Record<string, unknown>,
  traceId: string
): void {
  const validation = validateAllInvariants(result, traceId);
  
  if (validation.error_count > 0) {
    const errorViolations = validation.violations
      .filter(v => v.severity === 'error')
      .map(v => `${v.invariant}: ${v.actual}`)
      .join('; ');
    
    throw new Error(`[INVARIANT VIOLATION] ${traceId}: ${errorViolations}`);
  }
}

export default {
  // Individual checks
  assertResponseModeExists,
  assertI18nKeyExists,
  assertRulesAppliedNotEmpty,
  assertDecisionConfidenceNumeric,
  assertActionCodesArray,
  assertSeverityValid,
  assertConfidenceObservationInvariant,
  assertAuthorityResolved,
  
  // Master validation
  validateAllInvariants,
  enforceInvariantsStrict,
  
  // Version
  INVARIANT_GUARD_VERSION
};
