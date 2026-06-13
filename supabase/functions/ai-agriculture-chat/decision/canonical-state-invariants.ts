/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL STATE INVARIANTS (STEP 1 & 2) — Scope-threaded edition
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PURPOSE:
 * Enforce strict invariants on canonical state to prevent corruption.
 * Once authoritative context (crop, stage, DOS) is loaded, these values
 * are immutable for the remainder of the session turn.
 *
 * W1 HARDENING (2026-06-13):
 * Module-level `let _authoritativeContext`, `_confirmedDiagnosis`, and
 * `_answeredClarifications` have been DELETED. All per-turn state now
 * lives on `RequestScope` (see runtime/request-scope.ts). This eliminates
 * the warm-isolate cross-tenant leakage class.
 *
 * RULES:
 * 1. Prevent canonical.crop/stage/dos from reverting to UNKNOWN once set
 * 2. Missing optional data lowers confidence but never resets confirmed facts
 * 3. Runtime invariant check blocks execution if critical data corrupted
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { RequestScope } from '../runtime/request-scope.ts';

export const CANONICAL_INVARIANTS_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface AuthoritativeContext {
  crop_code: string;
  growth_stage: string;
  days_since_sowing: number | null;
  confirmed_symptoms: string[];
  locked_at: number;
  source: 'CROP_SCHEDULE' | 'LAND_STATE' | 'CONFIRMED';
}

export interface InvariantCheckResult {
  is_valid: boolean;
  violations: InvariantViolation[];
  warnings: string[];
  recovered_context: AuthoritativeContext | null;
}

export interface InvariantViolation {
  type: 'CROP_REVERTED' | 'STAGE_REVERTED' | 'DOS_REVERTED' | 'SYMPTOM_LOST' | 'CRITICAL_UNKNOWN';
  field: string;
  previous_value: string | number | null;
  current_value: string | number | null;
  severity: 'CRITICAL' | 'WARNING';
}

export interface ConfidenceAdjustment {
  original_confidence: number;
  adjusted_confidence: number;
  reason: string;
  missing_optional_fields: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-TURN STATE — stored on RequestScope, never at module scope
// ═══════════════════════════════════════════════════════════════════════════

interface InvariantsTurnState {
  authoritativeContext: AuthoritativeContext | null;
  confirmedDiagnosis: string | null;
  answeredClarifications: Set<string>;
}

const STATE_KEY = 'invariants:state';

function getState(scope: RequestScope): InvariantsTurnState {
  let s = scope.turnCache.engineState.get(STATE_KEY) as InvariantsTurnState | undefined;
  if (!s) {
    s = {
      authoritativeContext: null,
      confirmedDiagnosis: null,
      answeredClarifications: new Set<string>(),
    };
    scope.turnCache.engineState.set(STATE_KEY, s);
  }
  return s;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: TURN-SCOPED AUTHORITATIVE CONTEXT LOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lock authoritative context for the session turn.
 * Once set, crop/stage/DOS cannot revert to UNKNOWN.
 */
export function lockAuthoritativeContext(
  scope: RequestScope,
  cropCode: string,
  growthStage: string,
  daysSinceSowing: number | null,
  source: AuthoritativeContext['source']
): AuthoritativeContext {
  const state = getState(scope);

  // Only lock if values are not UNKNOWN
  if (cropCode === 'UNKNOWN' || !cropCode) {
    console.warn(`⚠️ [Invariants] Cannot lock UNKNOWN crop`);
    return state.authoritativeContext || {
      crop_code: 'UNKNOWN',
      growth_stage: 'UNKNOWN',
      days_since_sowing: null,
      confirmed_symptoms: [],
      locked_at: Date.now(),
      source,
    };
  }

  // If already locked, only allow enrichment, never degradation
  if (state.authoritativeContext) {
    console.log(`🔒 [Invariants] Context already locked - checking for enrichment only`);

    const newContext: AuthoritativeContext = {
      crop_code: (state.authoritativeContext.crop_code !== 'UNKNOWN')
        ? state.authoritativeContext.crop_code
        : cropCode.toUpperCase(),
      growth_stage: (state.authoritativeContext.growth_stage !== 'UNKNOWN')
        ? state.authoritativeContext.growth_stage
        : growthStage.toUpperCase(),
      days_since_sowing: state.authoritativeContext.days_since_sowing ?? daysSinceSowing,
      confirmed_symptoms: [...state.authoritativeContext.confirmed_symptoms],
      locked_at: state.authoritativeContext.locked_at,
      source: state.authoritativeContext.source,
    };

    state.authoritativeContext = newContext;
    scope.emit({
      stage: 'invariants',
      kind: 'decide',
      payload: { event: 'context_enriched', crop: newContext.crop_code, stage: newContext.growth_stage },
    });
    return state.authoritativeContext;
  }

  state.authoritativeContext = {
    crop_code: cropCode.toUpperCase(),
    growth_stage: growthStage.toUpperCase(),
    days_since_sowing: daysSinceSowing,
    confirmed_symptoms: [],
    locked_at: Date.now(),
    source,
  };

  console.log(`🔒 [Invariants] Authoritative context LOCKED: crop=${state.authoritativeContext.crop_code}, stage=${state.authoritativeContext.growth_stage}, DOS=${daysSinceSowing}`);
  scope.emit({
    stage: 'invariants',
    kind: 'decide',
    payload: {
      event: 'context_locked',
      crop: state.authoritativeContext.crop_code,
      stage: state.authoritativeContext.growth_stage,
      das: daysSinceSowing,
      source,
    },
  });

  return state.authoritativeContext;
}

/**
 * Get currently locked authoritative context for this turn.
 */
export function getAuthoritativeContext(scope: RequestScope): AuthoritativeContext | null {
  return getState(scope).authoritativeContext;
}

/**
 * Add a confirmed symptom to the authoritative context.
 * Symptoms are additive and cannot be removed.
 */
export function addConfirmedSymptom(scope: RequestScope, symptom: string): void {
  const state = getState(scope);
  if (!state.authoritativeContext) {
    console.warn(`⚠️ [Invariants] Cannot add symptom - no context locked`);
    return;
  }

  const normalizedSymptom = symptom.toUpperCase().trim();
  if (!state.authoritativeContext.confirmed_symptoms.includes(normalizedSymptom)) {
    state.authoritativeContext.confirmed_symptoms.push(normalizedSymptom);
    console.log(`✅ [Invariants] Symptom confirmed: ${normalizedSymptom}`);
  }
}

/**
 * Clear authoritative context for this turn.
 * Rarely needed — scope itself is discarded at request end.
 */
export function clearAuthoritativeContext(scope: RequestScope): void {
  const state = getState(scope);
  state.authoritativeContext = null;
  state.confirmedDiagnosis = null;
  state.answeredClarifications.clear();
  console.log(`🔓 [Invariants] Authoritative context cleared`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 CONTINUED: RUNTIME INVARIANT CHECK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that canonical state has not been corrupted.
 * Must be called BEFORE symbolic rule evaluation.
 *
 * If crop or stage is UNKNOWN after authoritative load, this is a violation.
 */
export function validateCanonicalInvariants(
  scope: RequestScope,
  currentCrop: string,
  currentStage: string,
  currentDOS: number | null
): InvariantCheckResult {
  const state = getState(scope);
  const result: InvariantCheckResult = {
    is_valid: true,
    violations: [],
    warnings: [],
    recovered_context: null,
  };

  console.log(`🔍 [Invariants] Validating: crop=${currentCrop}, stage=${currentStage}, DOS=${currentDOS}`);

  if (!state.authoritativeContext) {
    if (currentCrop === 'UNKNOWN' || !currentCrop) {
      result.violations.push({
        type: 'CRITICAL_UNKNOWN',
        field: 'crop_code',
        previous_value: null,
        current_value: currentCrop,
        severity: 'CRITICAL',
      });
      result.is_valid = false;
    }

    if (currentStage === 'UNKNOWN' || !currentStage) {
      result.warnings.push('Growth stage is UNKNOWN - limited diagnosis accuracy');
    }

    return result;
  }

  if (state.authoritativeContext.crop_code !== 'UNKNOWN' &&
      (currentCrop === 'UNKNOWN' || !currentCrop)) {
    result.violations.push({
      type: 'CROP_REVERTED',
      field: 'crop_code',
      previous_value: state.authoritativeContext.crop_code,
      current_value: currentCrop,
      severity: 'CRITICAL',
    });
    result.is_valid = false;
  }

  if (state.authoritativeContext.growth_stage !== 'UNKNOWN' &&
      (currentStage === 'UNKNOWN' || !currentStage)) {
    result.violations.push({
      type: 'STAGE_REVERTED',
      field: 'growth_stage',
      previous_value: state.authoritativeContext.growth_stage,
      current_value: currentStage,
      severity: 'WARNING',
    });
  }

  if (result.violations.length > 0) {
    result.recovered_context = { ...state.authoritativeContext };
    console.warn(`⚠️ [Invariants] ${result.violations.length} violations detected - providing recovered context`);
  }

  return result;
}

/**
 * Enforce invariants by blocking execution on critical violations.
 * Returns the safe context to use (recovered if necessary).
 */
export function enforceInvariantsOrBlock(
  scope: RequestScope,
  currentCrop: string,
  currentStage: string,
  currentDOS: number | null
): {
  should_block: boolean;
  safe_crop: string;
  safe_stage: string;
  safe_dos: number | null;
  error_message: string | null;
} {
  const validation = validateCanonicalInvariants(scope, currentCrop, currentStage, currentDOS);
  const criticalViolations = validation.violations.filter((v) => v.severity === 'CRITICAL');

  if (criticalViolations.length > 0) {
    if (validation.recovered_context) {
      console.log(`🔄 [Invariants] Recovering from violations using locked context`);
      return {
        should_block: false,
        safe_crop: validation.recovered_context.crop_code,
        safe_stage: validation.recovered_context.growth_stage,
        safe_dos: validation.recovered_context.days_since_sowing,
        error_message: null,
      };
    }

    const errorMsg = `INVARIANT VIOLATION: ${criticalViolations.map((v) => v.type).join(', ')}`;
    console.error(`❌ [Invariants] ${errorMsg}`);
    scope.emit({
      stage: 'invariants',
      kind: 'block',
      payload: { reason: errorMsg, violations: criticalViolations },
    });

    return {
      should_block: true,
      safe_crop: 'UNKNOWN',
      safe_stage: 'UNKNOWN',
      safe_dos: null,
      error_message: errorMsg,
    };
  }

  if (validation.recovered_context) {
    return {
      should_block: false,
      safe_crop: validation.recovered_context.crop_code,
      safe_stage: validation.recovered_context.growth_stage,
      safe_dos: validation.recovered_context.days_since_sowing,
      error_message: null,
    };
  }

  return {
    should_block: false,
    safe_crop: currentCrop,
    safe_stage: currentStage,
    safe_dos: currentDOS,
    error_message: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: NON-DESTRUCTIVE VALIDATION (pure — no scope needed)
// ═══════════════════════════════════════════════════════════════════════════

export interface OptionalDataStatus {
  soil_npk_available: boolean;
  ndvi_available: boolean;
  weather_available: boolean;
  missing_fields: string[];
}

export function assessOptionalData(input: {
  soil_n?: number | null;
  soil_p?: number | null;
  soil_k?: number | null;
  ndvi_value?: number | null;
  weather_data?: { temp?: number; humidity?: number; rainfall?: number } | null;
}): OptionalDataStatus {
  const missing: string[] = [];

  const soil_npk_available = (
    input.soil_n !== null && input.soil_n !== undefined &&
    input.soil_p !== null && input.soil_p !== undefined &&
    input.soil_k !== null && input.soil_k !== undefined
  );

  if (!soil_npk_available) {
    missing.push('soil_npk');
    console.log(`📊 [Invariants] Optional data missing: soil_npk`);
  }

  const ndvi_available = input.ndvi_value !== null && input.ndvi_value !== undefined;
  if (!ndvi_available) {
    missing.push('ndvi');
    console.log(`📊 [Invariants] Optional data missing: ndvi`);
  }

  const weather_available = input.weather_data !== null && input.weather_data !== undefined;
  if (!weather_available) {
    missing.push('weather');
    console.log(`📊 [Invariants] Optional data missing: weather`);
  }

  return {
    soil_npk_available,
    ndvi_available,
    weather_available,
    missing_fields: missing,
  };
}

export function adjustConfidenceForMissingData(
  baseConfidence: number,
  optionalStatus: OptionalDataStatus
): ConfidenceAdjustment {
  let adjustedConfidence = baseConfidence;
  const reasons: string[] = [];

  if (!optionalStatus.soil_npk_available) {
    adjustedConfidence -= 0.05;
    reasons.push('soil_npk missing (-5%)');
  }

  if (!optionalStatus.ndvi_available) {
    adjustedConfidence -= 0.05;
    reasons.push('ndvi missing (-5%)');
  }

  if (!optionalStatus.weather_available) {
    adjustedConfidence -= 0.03;
    reasons.push('weather missing (-3%)');
  }

  adjustedConfidence = Math.max(0.3, adjustedConfidence);

  const reason = reasons.length > 0
    ? `Optional data gaps: ${reasons.join(', ')}`
    : 'All optional data available';

  console.log(`📊 [Invariants] Confidence adjusted: ${(baseConfidence * 100).toFixed(0)}% → ${(adjustedConfidence * 100).toFixed(0)}% (${reason})`);

  return {
    original_confidence: baseConfidence,
    adjusted_confidence: adjustedConfidence,
    reason,
    missing_optional_fields: optionalStatus.missing_fields,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: POST-DECISION STATE LOCK
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lock a diagnosis after successful resolution.
 * Prevents confidence from dropping on already-resolved evidence.
 */
export function lockDiagnosisForSession(scope: RequestScope, diagnosisId: string): void {
  getState(scope).confirmedDiagnosis = diagnosisId;
  console.log(`🔒 [Invariants] Diagnosis locked for session: ${diagnosisId}`);
  scope.emit({
    stage: 'invariants',
    kind: 'decide',
    payload: { event: 'diagnosis_locked', diagnosis_id: diagnosisId },
  });
}

export function getLockedDiagnosis(scope: RequestScope): string | null {
  return getState(scope).confirmedDiagnosis;
}

export function hasDiagnosisLock(scope: RequestScope): boolean {
  return getState(scope).confirmedDiagnosis !== null;
}

/**
 * Mark a clarification question as answered.
 * Prevents re-asking the same question within session.
 */
export function markClarificationAnswered(scope: RequestScope, questionId: string): void {
  getState(scope).answeredClarifications.add(questionId);
  console.log(`✅ [Invariants] Clarification marked answered: ${questionId}`);
  scope.emit({
    stage: 'clarification',
    kind: 'decide',
    payload: { event: 'answered', clarification_id: questionId },
  });
}

export function wasClarificationAnswered(scope: RequestScope, questionId: string): boolean {
  return getState(scope).answeredClarifications.has(questionId);
}

export function getAnsweredClarifications(scope: RequestScope): string[] {
  return Array.from(getState(scope).answeredClarifications);
}

/**
 * Check if confidence should be protected due to locked diagnosis.
 * Returns minimum confidence floor if diagnosis is locked.
 */
export function getConfidenceFloor(scope: RequestScope): number {
  return getState(scope).confirmedDiagnosis ? 0.6 : 0.0;
}
