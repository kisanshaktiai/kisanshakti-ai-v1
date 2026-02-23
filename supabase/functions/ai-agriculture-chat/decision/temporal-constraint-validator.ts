/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 2: TEMPORAL CONSTRAINT VALIDATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Validates crop age constraints (crop_age_days_min, crop_age_days_max) to ensure
 * rules are only applied at appropriate growth stages.
 * 
 * ARCHITECTURE:
 * - validateCropAge(): Check if days since sowing is within rule bounds
 * - filterRulesByAge(): Filter a list of rules by crop age constraints
 * - getAgeViolationReason(): Get human-readable explanation of violation
 * 
 * SAFETY:
 * - Prevents early-stage treatments for late-stage problems
 * - Prevents late-stage advice for young crops
 * - Enables stage-specific IPM recommendations
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const TEMPORAL_CONSTRAINT_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface TemporalValidationInput {
  rule_id: string;
  crop_age_days_min?: number;
  crop_age_days_max?: number;
}

export interface TemporalValidationResult {
  valid: boolean;
  days_since_sowing: number | null;
  min_days: number | null;
  max_days: number | null;
  violation: 'TOO_EARLY' | 'TOO_LATE' | null;
  reason: string;
}

export interface TemporalContext {
  crop_code?: string;
  days_since_sowing?: number | null;
  sowing_date?: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate if a rule can fire based on crop age constraints
 * 
 * @param daysSinceSowing - Current days since sowing (DAS)
 * @param minDays - Minimum DAS for rule applicability (optional)
 * @param maxDays - Maximum DAS for rule applicability (optional)
 * @returns TemporalValidationResult with validity and reason
 */
export function validateCropAge(
  daysSinceSowing: number | null | undefined,
  minDays: number | null | undefined,
  maxDays: number | null | undefined
): TemporalValidationResult {
  // If no DAS available, allow rule to fire (fail-open for missing data)
  if (daysSinceSowing === null || daysSinceSowing === undefined) {
    return {
      valid: true,
      days_since_sowing: null,
      min_days: minDays ?? null,
      max_days: maxDays ?? null,
      violation: null,
      reason: 'No crop age data available - rule allowed (fail-open)'
    };
  }
  
  // If no constraints defined, always valid
  if ((minDays === null || minDays === undefined) && 
      (maxDays === null || maxDays === undefined)) {
    return {
      valid: true,
      days_since_sowing: daysSinceSowing,
      min_days: null,
      max_days: null,
      violation: null,
      reason: 'No temporal constraints defined'
    };
  }
  
  // Check minimum age constraint
  if (minDays !== null && minDays !== undefined && daysSinceSowing < minDays) {
    return {
      valid: false,
      days_since_sowing: daysSinceSowing,
      min_days: minDays,
      max_days: maxDays ?? null,
      violation: 'TOO_EARLY',
      reason: `Crop too young: ${daysSinceSowing} days < minimum ${minDays} days`
    };
  }
  
  // Check maximum age constraint
  if (maxDays !== null && maxDays !== undefined && daysSinceSowing > maxDays) {
    return {
      valid: false,
      days_since_sowing: daysSinceSowing,
      min_days: minDays ?? null,
      max_days: maxDays,
      violation: 'TOO_LATE',
      reason: `Crop too mature: ${daysSinceSowing} days > maximum ${maxDays} days`
    };
  }
  
  return {
    valid: true,
    days_since_sowing: daysSinceSowing,
    min_days: minDays ?? null,
    max_days: maxDays ?? null,
    violation: null,
    reason: `Within valid range: ${daysSinceSowing} days (${minDays ?? 0}-${maxDays ?? '∞'})`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RULE FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter rules by temporal constraints
 * 
 * @param rules - Array of rules with temporal fields
 * @param daysSinceSowing - Current DAS
 * @returns Filtered rules that are valid for the current crop age
 */
export function filterRulesByAge<T extends TemporalValidationInput>(
  rules: T[],
  daysSinceSowing: number | null | undefined
): { valid: T[]; filtered: T[]; reasons: Map<string, string> } {
  const valid: T[] = [];
  const filtered: T[] = [];
  const reasons = new Map<string, string>();
  
  for (const rule of rules) {
    const result = validateCropAge(
      daysSinceSowing,
      rule.crop_age_days_min,
      rule.crop_age_days_max
    );
    
    if (result.valid) {
      valid.push(rule);
    } else {
      filtered.push(rule);
      reasons.set(rule.rule_id, result.reason);
    }
  }
  
  return { valid, filtered, reasons };
}

// ═══════════════════════════════════════════════════════════════════════════
// HUMAN-READABLE EXPLANATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get localized explanation of temporal violation
 */
export function getAgeViolationReason(
  result: TemporalValidationResult,
  language: string
): string {
  if (result.valid) {
    return '';
  }
  
  const templates: Record<string, Record<string, string>> = {
    'TOO_EARLY': {
      mr: `पीक अजून लहान आहे (${result.days_since_sowing} दिवस). हे उपाय ${result.min_days} दिवसांनंतर लागू होतील.`,
      hi: `फसल अभी छोटी है (${result.days_since_sowing} दिन)। यह उपाय ${result.min_days} दिनों के बाद लागू होंगे।`,
      en: `Crop is too young (${result.days_since_sowing} days). This treatment applies after ${result.min_days} days.`
    },
    'TOO_LATE': {
      mr: `पीक खूप मोठे झाले आहे (${result.days_since_sowing} दिवस). हे उपाय ${result.max_days} दिवसांपूर्वी लागू होते.`,
      hi: `फसल बहुत बड़ी हो गई है (${result.days_since_sowing} दिन)। यह उपाय ${result.max_days} दिनों से पहले लागू होते थे।`,
      en: `Crop is too mature (${result.days_since_sowing} days). This treatment was applicable before ${result.max_days} days.`
    }
  };
  
  const violation = result.violation || 'TOO_EARLY';
  return templates[violation][language] || templates[violation]['en'];
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

export function logTemporalValidation(
  ruleId: string,
  result: TemporalValidationResult,
  traceId?: string
): void {
  const prefix = traceId ? `[${traceId}]` : '';
  
  if (result.valid) {
    console.log(`${prefix} ✅ [TemporalConstraint] Rule ${ruleId}: ${result.reason}`);
  } else {
    console.warn(`${prefix} ⏰ [TemporalConstraint] Rule ${ruleId} FILTERED: ${result.reason}`);
  }
}

export function logTemporalFilteringSummary(
  validCount: number,
  filteredCount: number,
  daysSinceSowing: number | null | undefined,
  traceId?: string
): void {
  const prefix = traceId ? `[${traceId}]` : '';
  const das = daysSinceSowing ?? 'unknown';
  
  console.log(`${prefix} 📊 [TemporalConstraint] Summary: ${validCount} valid, ${filteredCount} filtered (DAS: ${das})`);
}

export default {
  TEMPORAL_CONSTRAINT_VERSION,
  validateCropAge,
  filterRulesByAge,
  getAgeViolationReason,
  logTemporalValidation,
  logTemporalFilteringSummary
};
