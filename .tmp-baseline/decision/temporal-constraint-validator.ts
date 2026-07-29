// PHASE 2: TEMPORAL CONSTRAINT VALIDATOR (v2.0.0 - English-only)

export const TEMPORAL_CONSTRAINT_VERSION = '2.0.0';

// TYPE DEFINITIONS

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

// CORE VALIDATION

export function validateCropAge(
  daysSinceSowing: number | null | undefined,
  minDays: number | null | undefined,
  maxDays: number | null | undefined
): TemporalValidationResult {
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

// RULE FILTERING

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

// HUMAN-READABLE EXPLANATIONS (English-only; LLM translates at runtime)

export function getAgeViolationReason(
  result: TemporalValidationResult,
  _language: string
): string {
  if (result.valid) return '';
  
  if (result.violation === 'TOO_EARLY') {
    return `Crop is too young (${result.days_since_sowing} days). This treatment applies after ${result.min_days} days.`;
  }
  
  if (result.violation === 'TOO_LATE') {
    return `Crop is too mature (${result.days_since_sowing} days). This treatment was applicable before ${result.max_days} days.`;
  }
  
  return result.reason;
}

// LOGGING

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
