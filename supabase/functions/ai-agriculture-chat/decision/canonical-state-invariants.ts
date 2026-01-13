/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL STATE INVARIANTS (STEP 1 & 2)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Enforce strict invariants on canonical state to prevent corruption.
 * Once authoritative context (crop, stage, DOS) is loaded, these values
 * are immutable for the remainder of the session turn.
 * 
 * RULES:
 * 1. Prevent canonical.crop/stage/dos from reverting to UNKNOWN once set
 * 2. Missing optional data lowers confidence but never resets confirmed facts
 * 3. Runtime invariant check blocks execution if critical data corrupted
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const CANONICAL_INVARIANTS_VERSION = '1.0.0';

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
// STEP 1: SESSION-SCOPED AUTHORITATIVE CONTEXT LOCK
// ═══════════════════════════════════════════════════════════════════════════

let _authoritativeContext: AuthoritativeContext | null = null;
let _confirmedDiagnosis: string | null = null;
let _answeredClarifications: Set<string> = new Set();

/**
 * Lock authoritative context for the session turn.
 * Once set, crop/stage/DOS cannot revert to UNKNOWN.
 */
export function lockAuthoritativeContext(
  cropCode: string,
  growthStage: string,
  daysSinceSowing: number | null,
  source: AuthoritativeContext['source']
): AuthoritativeContext {
  // Only lock if values are not UNKNOWN
  if (cropCode === 'UNKNOWN' || !cropCode) {
    console.warn(`⚠️ [Invariants] Cannot lock UNKNOWN crop`);
    return _authoritativeContext || {
      crop_code: 'UNKNOWN',
      growth_stage: 'UNKNOWN',
      days_since_sowing: null,
      confirmed_symptoms: [],
      locked_at: Date.now(),
      source
    };
  }

  // If already locked, only allow enrichment, never degradation
  if (_authoritativeContext) {
    console.log(`🔒 [Invariants] Context already locked - checking for enrichment only`);
    
    // CRITICAL: Never allow reversion to UNKNOWN
    const newContext: AuthoritativeContext = {
      crop_code: (_authoritativeContext.crop_code !== 'UNKNOWN') 
        ? _authoritativeContext.crop_code 
        : cropCode.toUpperCase(),
      growth_stage: (_authoritativeContext.growth_stage !== 'UNKNOWN')
        ? _authoritativeContext.growth_stage
        : growthStage.toUpperCase(),
      days_since_sowing: _authoritativeContext.days_since_sowing ?? daysSinceSowing,
      confirmed_symptoms: [..._authoritativeContext.confirmed_symptoms],
      locked_at: _authoritativeContext.locked_at,
      source: _authoritativeContext.source
    };
    
    _authoritativeContext = newContext;
    return _authoritativeContext;
  }

  _authoritativeContext = {
    crop_code: cropCode.toUpperCase(),
    growth_stage: growthStage.toUpperCase(),
    days_since_sowing: daysSinceSowing,
    confirmed_symptoms: [],
    locked_at: Date.now(),
    source
  };

  console.log(`🔒 [Invariants] Authoritative context LOCKED: crop=${_authoritativeContext.crop_code}, stage=${_authoritativeContext.growth_stage}, DOS=${daysSinceSowing}`);
  
  return _authoritativeContext;
}

/**
 * Get currently locked authoritative context.
 */
export function getAuthoritativeContext(): AuthoritativeContext | null {
  return _authoritativeContext;
}

/**
 * Add a confirmed symptom to the authoritative context.
 * Symptoms are additive and cannot be removed.
 */
export function addConfirmedSymptom(symptom: string): void {
  if (!_authoritativeContext) {
    console.warn(`⚠️ [Invariants] Cannot add symptom - no context locked`);
    return;
  }
  
  const normalizedSymptom = symptom.toUpperCase().trim();
  if (!_authoritativeContext.confirmed_symptoms.includes(normalizedSymptom)) {
    _authoritativeContext.confirmed_symptoms.push(normalizedSymptom);
    console.log(`✅ [Invariants] Symptom confirmed: ${normalizedSymptom}`);
  }
}

/**
 * Clear authoritative context (call at end of session or turn).
 */
export function clearAuthoritativeContext(): void {
  _authoritativeContext = null;
  _confirmedDiagnosis = null;
  _answeredClarifications.clear();
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
  currentCrop: string,
  currentStage: string,
  currentDOS: number | null
): InvariantCheckResult {
  const result: InvariantCheckResult = {
    is_valid: true,
    violations: [],
    warnings: [],
    recovered_context: null
  };

  console.log(`🔍 [Invariants] Validating: crop=${currentCrop}, stage=${currentStage}, DOS=${currentDOS}`);

  // If no authoritative context locked, check for UNKNOWN values
  if (!_authoritativeContext) {
    if (currentCrop === 'UNKNOWN' || !currentCrop) {
      result.violations.push({
        type: 'CRITICAL_UNKNOWN',
        field: 'crop_code',
        previous_value: null,
        current_value: currentCrop,
        severity: 'CRITICAL'
      });
      result.is_valid = false;
    }
    
    if (currentStage === 'UNKNOWN' || !currentStage) {
      // Stage can be UNKNOWN if no sowing date - this is a warning, not critical
      result.warnings.push('Growth stage is UNKNOWN - limited diagnosis accuracy');
    }
    
    return result;
  }

  // Check for reversion violations
  if (_authoritativeContext.crop_code !== 'UNKNOWN' && 
      (currentCrop === 'UNKNOWN' || !currentCrop)) {
    result.violations.push({
      type: 'CROP_REVERTED',
      field: 'crop_code',
      previous_value: _authoritativeContext.crop_code,
      current_value: currentCrop,
      severity: 'CRITICAL'
    });
    result.is_valid = false;
  }

  if (_authoritativeContext.growth_stage !== 'UNKNOWN' && 
      (currentStage === 'UNKNOWN' || !currentStage)) {
    result.violations.push({
      type: 'STAGE_REVERTED',
      field: 'growth_stage',
      previous_value: _authoritativeContext.growth_stage,
      current_value: currentStage,
      severity: 'WARNING'
    });
    // Stage reversion is recoverable
  }

  // If violations found, provide recovered context
  if (result.violations.length > 0) {
    result.recovered_context = { ..._authoritativeContext };
    console.warn(`⚠️ [Invariants] ${result.violations.length} violations detected - providing recovered context`);
  }

  return result;
}

/**
 * Enforce invariants by blocking execution on critical violations.
 * Returns the safe context to use (recovered if necessary).
 */
export function enforceInvariantsOrBlock(
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
  const validation = validateCanonicalInvariants(currentCrop, currentStage, currentDOS);
  
  // Check for critical violations
  const criticalViolations = validation.violations.filter(v => v.severity === 'CRITICAL');
  
  if (criticalViolations.length > 0) {
    // If we have recovered context, use it
    if (validation.recovered_context) {
      console.log(`🔄 [Invariants] Recovering from violations using locked context`);
      return {
        should_block: false,
        safe_crop: validation.recovered_context.crop_code,
        safe_stage: validation.recovered_context.growth_stage,
        safe_dos: validation.recovered_context.days_since_sowing,
        error_message: null
      };
    }
    
    // No recovery possible - block execution
    const errorMsg = `INVARIANT VIOLATION: ${criticalViolations.map(v => v.type).join(', ')}`;
    console.error(`❌ [Invariants] ${errorMsg}`);
    
    return {
      should_block: true,
      safe_crop: 'UNKNOWN',
      safe_stage: 'UNKNOWN',
      safe_dos: null,
      error_message: errorMsg
    };
  }
  
  // Use recovered context for non-critical violations, or current values
  if (validation.recovered_context) {
    return {
      should_block: false,
      safe_crop: validation.recovered_context.crop_code,
      safe_stage: validation.recovered_context.growth_stage,
      safe_dos: validation.recovered_context.days_since_sowing,
      error_message: null
    };
  }
  
  return {
    should_block: false,
    safe_crop: currentCrop,
    safe_stage: currentStage,
    safe_dos: currentDOS,
    error_message: null
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: NON-DESTRUCTIVE VALIDATION
// Optional data (soil, NDVI, weather) lowers confidence but never corrupts state
// ═══════════════════════════════════════════════════════════════════════════

export interface OptionalDataStatus {
  soil_npk_available: boolean;
  ndvi_available: boolean;
  weather_available: boolean;
  missing_fields: string[];
}

/**
 * Assess optional data availability without throwing errors.
 * Missing data is logged and tracked for confidence adjustment.
 */
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
    missing_fields: missing
  };
}

/**
 * Adjust confidence based on optional data availability.
 * CRITICAL: This never resets crop/stage/symptoms.
 */
export function adjustConfidenceForMissingData(
  baseConfidence: number,
  optionalStatus: OptionalDataStatus
): ConfidenceAdjustment {
  let adjustedConfidence = baseConfidence;
  const reasons: string[] = [];
  
  // Each missing optional data source reduces confidence slightly
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
  
  // Ensure confidence doesn't go below minimum threshold
  adjustedConfidence = Math.max(0.3, adjustedConfidence);
  
  const reason = reasons.length > 0 
    ? `Optional data gaps: ${reasons.join(', ')}`
    : 'All optional data available';
  
  console.log(`📊 [Invariants] Confidence adjusted: ${(baseConfidence * 100).toFixed(0)}% → ${(adjustedConfidence * 100).toFixed(0)}% (${reason})`);
  
  return {
    original_confidence: baseConfidence,
    adjusted_confidence: adjustedConfidence,
    reason,
    missing_optional_fields: optionalStatus.missing_fields
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: POST-DECISION STATE LOCK
// Lock resolved diagnosis to prevent regression within session
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lock a diagnosis after successful resolution.
 * Prevents confidence from dropping on already-resolved evidence.
 */
export function lockDiagnosisForSession(diagnosisId: string): void {
  _confirmedDiagnosis = diagnosisId;
  console.log(`🔒 [Invariants] Diagnosis locked for session: ${diagnosisId}`);
}

/**
 * Get the locked diagnosis for this session.
 */
export function getLockedDiagnosis(): string | null {
  return _confirmedDiagnosis;
}

/**
 * Check if a diagnosis has been locked.
 */
export function hasDiagnosisLock(): boolean {
  return _confirmedDiagnosis !== null;
}

/**
 * Mark a clarification question as answered.
 * Prevents re-asking the same question within session.
 */
export function markClarificationAnswered(questionId: string): void {
  _answeredClarifications.add(questionId);
  console.log(`✅ [Invariants] Clarification marked answered: ${questionId}`);
}

/**
 * Check if a clarification question was already answered.
 */
export function wasClarificationAnswered(questionId: string): boolean {
  return _answeredClarifications.has(questionId);
}

/**
 * Get all answered clarification question IDs.
 */
export function getAnsweredClarifications(): string[] {
  return Array.from(_answeredClarifications);
}

/**
 * Check if confidence should be protected due to locked diagnosis.
 * Returns minimum confidence floor if diagnosis is locked.
 */
export function getConfidenceFloor(): number {
  // If diagnosis is locked, confidence cannot drop below 0.6
  return _confirmedDiagnosis ? 0.6 : 0.0;
}
