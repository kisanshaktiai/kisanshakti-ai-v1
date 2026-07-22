/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI BOUNDARY DEFINITIONS (STEP 7)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file explicitly defines the boundary between symbolic (deterministic)
 * and AI-augmented zones in the Decision Brain.
 * 
 * CRITICAL: All AI systems MUST respect these boundaries.
 * 
 * Version: 1.0.0
 * Author: System Architecture
 */

// ═══════════════════════════════════════════════════════════════════════════
// SYMBOLIC ZONE - AI FORBIDDEN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SYMBOLIC ZONE (AI MUST NEVER MODIFY):
 * 
 * These components are purely deterministic and must remain untouched by AI:
 * 
 * 1. Cause Inference
 *    - inferCauses() function
 *    - All CauseRule.conditions functions
 *    - Rule matching and filtering logic
 * 
 * 2. Rule Execution
 *    - filterRulesForCrop()
 *    - Rule priority calculation
 *    - Stage applicability checks
 * 
 * 3. Conflict Resolution
 *    - CONFLICT_RULES array
 *    - resolveConflicts() function
 *    - Safety gate enforcement
 * 
 * 4. Risk Calculation
 *    - calculateRiskLevel()
 *    - CRITICAL_CAUSES, HIGH_RISK_CAUSES arrays
 *    - Base confidence calculation
 * 
 * 5. Action Mapping
 *    - CAUSE_ACTION_MAPPINGS
 *    - Base priority assignment
 *    - Urgency determination
 */

export const SYMBOLIC_ZONE = {
  forbidden_modules: [
    'cause-inference.ts',
    'conflict-resolver.ts',
    'action-mapper.ts',
    'types.ts (CauseRule definitions)'
  ],
  forbidden_functions: [
    'inferCauses',
    'filterRulesForCrop',
    'resolveConflicts',
    'calculateRiskLevel',
    'mapCausesToActions'
  ],
  forbidden_modifications: [
    'cause',                    // Never change inferred cause
    'rule_id',                  // Never change rule identification
    'safety_gate',              // Never bypass safety gates
    'urgency_upgrade',          // Never escalate urgency beyond rules
    'scientific_source',        // Never change scientific attribution
    'farming_mode_override'     // Never bypass organic/conventional filters
  ]
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// AI ZONE - LIMITED MODIFICATIONS ALLOWED
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AI ZONE (LIMITED MODIFICATIONS):
 * 
 * AI may make BOUNDED adjustments in these areas only:
 * 
 * 1. Dosage Adjustment
 *    - Maximum ±20% from base recommendation
 *    - Must log adjustment and reason
 * 
 * 2. Timing Fine-tuning
 *    - Within allowed window only
 *    - Cannot change urgency class
 * 
 * 3. Explanation Generation
 *    - Farmer-friendly language
 *    - Translation support
 *    - Voice synthesis text
 * 
 * 4. Missing Data Fallback
 *    - Conservative advice only
 *    - Must flag as low-confidence
 */

export const AI_ZONE = {
  /** Maximum percentage adjustment AI can make to dosage */
  dosage_adjustment_max_percent: 20,
  
  /** Maximum priority points AI can adjust (+ or -) */
  priority_adjustment_max: 2,
  
  /** Fields AI is allowed to modify */
  allowed_modifications: [
    'dosage_quantity',          // Within ±20%
    'timing_within_window',     // Within urgency window
    'explanation_text',         // Farmer-facing explanation
    'language',                 // Translation
    'pronunciation_hints',      // Voice synthesis
    'local_product_names'       // Regional product recommendations
  ],
  
  /** Fields AI must NEVER modify */
  forbidden_fields: [
    'cause',                    // Deterministic output
    'rule_id',                  // Audit trail
    'safety_gate',              // Safety critical
    'scientific_source',        // Attribution
    'priority_base',            // Rule-defined priority
    'urgency_class',            // Safety-linked urgency
    'farming_mode',             // User preference
    'blocked_by_safety'         // Safety filter result
  ]
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that an AI adjustment respects boundaries
 * 
 * @param fieldName - Field being modified
 * @param originalValue - Original value
 * @param newValue - Proposed new value
 * @returns Validation result
 */
export function validateAIAdjustment(
  fieldName: string,
  originalValue: unknown,
  newValue: unknown
): { valid: boolean; reason?: string } {
  // Check if field is forbidden
  if ((AI_ZONE.forbidden_fields as readonly string[]).includes(fieldName)) {
    return {
      valid: false,
      reason: `Field '${fieldName}' is in AI forbidden zone - modification rejected`
    };
  }

  // Check if field is allowed
  if (!(AI_ZONE.allowed_modifications as readonly string[]).includes(fieldName)) {
    return {
      valid: false,
      reason: `Field '${fieldName}' is not in AI allowed modifications list`
    };
  }

  // Validate dosage adjustment bounds
  if (fieldName === 'dosage_quantity' && typeof originalValue === 'number' && typeof newValue === 'number') {
    const changePercent = Math.abs((newValue - originalValue) / originalValue) * 100;
    if (changePercent > AI_ZONE.dosage_adjustment_max_percent) {
      return {
        valid: false,
        reason: `Dosage adjustment ${changePercent.toFixed(1)}% exceeds maximum ${AI_ZONE.dosage_adjustment_max_percent}%`
      };
    }
  }

  return { valid: true };
}

/**
 * Validate that an AI priority adjustment is within bounds
 * 
 * @param originalPriority - Original priority (1-10)
 * @param adjustedPriority - Proposed new priority
 * @returns Validation result
 */
export function validatePriorityAdjustment(
  originalPriority: number,
  adjustedPriority: number
): { valid: boolean; reason?: string } {
  const delta = Math.abs(adjustedPriority - originalPriority);
  
  if (delta > AI_ZONE.priority_adjustment_max) {
    return {
      valid: false,
      reason: `Priority adjustment of ${delta} exceeds maximum allowed ${AI_ZONE.priority_adjustment_max}`
    };
  }

  // Priority must stay in valid range
  if (adjustedPriority < 1 || adjustedPriority > 10) {
    return {
      valid: false,
      reason: `Adjusted priority ${adjustedPriority} is outside valid range [1-10]`
    };
  }

  return { valid: true };
}

/**
 * Create an AI adjustment audit record
 * 
 * @param adjustments - List of adjustments made
 * @returns Audit record
 */
export function createAIAuditRecord(adjustments: Array<{
  field: string;
  original: unknown;
  adjusted: unknown;
  reason: string;
}>): {
  timestamp: string;
  adjustments_count: number;
  all_valid: boolean;
  details: typeof adjustments;
} {
  return {
    timestamp: new Date().toISOString(),
    adjustments_count: adjustments.length,
    all_valid: adjustments.every(adj => 
      validateAIAdjustment(adj.field, adj.original, adj.adjusted).valid
    ),
    details: adjustments
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BOUNDARY DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AI BOUNDARY DOCUMENTATION
 * 
 * This module ensures clear separation between:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SYMBOLIC ZONE (AI FORBIDDEN)                                           │
 * │ ─────────────────────────────                                           │
 * │ • Cause inference from facts                                            │
 * │ • Rule execution and matching                                           │
 * │ • Conflict resolution                                                   │
 * │ • Risk calculation                                                      │
 * │ • Safety gate enforcement                                               │
 * │                                                                         │
 * │ WHY: These must be deterministic, auditable, and legally defensible    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                    │
 *                                    ▼
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ AI ZONE (LIMITED)                                                       │
 * │ ─────────────────                                                       │
 * │ • Dosage fine-tuning (±20% max)                                         │
 * │ • Timing within allowed window                                          │
 * │ • Explanation generation                                                │
 * │ • Language translation                                                  │
 * │ • Missing data fallback (conservative)                                  │
 * │                                                                         │
 * │ WHY: These improve UX without affecting safety-critical decisions      │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * AUDIT REQUIREMENTS:
 * - All AI adjustments must be logged
 * - Original values must be preserved
 * - Adjustment reasons must be recorded
 * - Boundary violations must be rejected and logged
 */
