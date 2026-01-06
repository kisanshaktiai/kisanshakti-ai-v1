/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL AUTHORITY TYPES - Single Source of Truth
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * P1-1 GOVERNANCE FIX: All authority-related enums are consolidated here.
 * NO other module may define its own authority enums.
 * 
 * USAGE:
 * - authority-resolver.ts MUST return these types
 * - prescription-gate-enforcer.ts MUST consume these types
 * - decision-readiness-gate.ts MUST consume these types
 * - unified-decision-gate.ts MUST use these types
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const AUTHORITY_TYPES_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL DECISION AUTHORITY ENUM (Domain Level)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DecisionAuthority represents the DOMAIN that has the legal right to decide.
 * This is based on the type of stress/issue detected.
 * 
 * PRECEDENCE (Strict Order):
 * 1. SAFETY - Overrides everything
 * 2. LAND - Overrides CROP, CLIMATE, SYSTEM
 * 3. CLIMATE - Overrides CROP only
 * 4. SYSTEM - Overrides CROP only
 * 5. CROP - Default (pests, diseases, nutrients)
 * 6. NONE - No authority confirmed, observation only
 */
export enum DecisionAuthority {
  SAFETY = 'SAFETY',     // Human/livestock risk - blocks all treatments
  LAND = 'LAND',         // Soil/salinity/waterlogging - blocks crop treatments
  CLIMATE = 'CLIMATE',   // Weather stress - blocks crop treatments
  SYSTEM = 'SYSTEM',     // Infrastructure failure - blocks crop treatments
  CROP = 'CROP',         // Pests, diseases, nutrients - allows treatments
  NONE = 'NONE'          // No authority confirmed - observation only
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL AUTHORITY STATUS ENUM (Confirmation State)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AuthorityStatus represents the CONFIRMATION STATE of an authority decision.
 * This determines whether treatments can proceed.
 */
export enum AuthorityStatus {
  CONFIRMED = 'CONFIRMED',                         // Authority explicitly confirmed
  UNCONFIRMED = 'UNCONFIRMED',                     // No diagnosis yet
  PENDING_CLARIFICATION = 'PENDING_CLARIFICATION', // Awaiting farmer input
  BLOCKED = 'BLOCKED'                              // Higher authority blocking
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL RESPONSE MODE ENUM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ResponseMode determines what type of response is allowed based on
 * authority status and gate validation.
 */
export enum ResponseMode {
  TREATMENT = 'TREATMENT',         // Full treatment recommendations allowed
  OBSERVATION = 'OBSERVATION',     // Observation/monitoring only
  INFORMATION = 'INFORMATION',     // Information only, no actions
  CLARIFICATION = 'CLARIFICATION'  // Must ask clarification questions
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GATE STATUS ENUM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GateStatus is the unified status from the Decision Gate.
 * Replaces separate statuses from prescription-gate and decision-readiness-gate.
 */
export enum GateStatus {
  PASS = 'PASS',                     // All criteria met, treatment allowed
  FAIL = 'FAIL',                     // Criteria not met, treatment blocked
  PARTIAL = 'PARTIAL',               // Some criteria met, general guidance only
  EMERGENCY_BYPASS = 'EMERGENCY_BYPASS' // Emergency fast-tracked
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GATE ACTION ENUM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GateAction specifies what action the gate recommends.
 */
export enum GateAction {
  ALLOW_TREATMENT = 'ALLOW_TREATMENT',
  REQUIRE_CLARIFICATION = 'REQUIRE_CLARIFICATION',
  PROVIDE_GENERAL_GUIDANCE = 'PROVIDE_GENERAL_GUIDANCE',
  PROVIDE_OBSERVATION_ONLY = 'PROVIDE_OBSERVATION_ONLY',
  PROVIDE_INFORMATION_ONLY = 'PROVIDE_INFORMATION_ONLY',
  REQUEST_PHOTO = 'REQUEST_PHOTO',
  ESCALATE_TO_EXPERT = 'ESCALATE_TO_EXPERT'
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHORITY DECISION OUTPUT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AuthorityDecision is the output from the Authority Resolver.
 * This is the canonical structure that all downstream modules must use.
 */
export interface AuthorityDecision {
  /** The single domain with legal authority to decide */
  authority: DecisionAuthority;
  
  /** Confirmation status of the authority */
  authority_status: AuthorityStatus;
  
  /** Domains that are BLOCKED from rule evaluation */
  blocked_domains: DecisionAuthority[];
  
  /** Domains that are ALLOWED for rule evaluation */
  allowed_domains: DecisionAuthority[];
  
  /** Human-readable reason for the authority decision */
  reason: string;
  
  /** Whether treatments are allowed (only when authority is CONFIRMED) */
  treatments_allowed: boolean;
  
  /** Response mode constraint */
  response_mode: ResponseMode;
  
  /** Resolver version for audit trail */
  resolver_version: string;
  
  /** Timestamp of resolution */
  resolved_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED DECISION GATE RESULT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * UnifiedGateResult is the output from the Unified Decision Gate.
 * It combines the checks from prescription-gate and decision-readiness-gate.
 */
export interface UnifiedGateResult {
  /** Overall gate status */
  gate_status: GateStatus;
  
  /** Recommended action */
  gate_action: GateAction;
  
  /** Whether treatments are allowed */
  treatments_allowed: boolean;
  
  /** Allowed action types */
  allowed_actions: string[];
  
  /** Blocked action types */
  blocked_actions: string[];
  
  /** Allowed products (from symbolic decision) */
  allowed_products: string[];
  
  /** Allowed dosages (from symbolic decision) */
  allowed_dosages: string[];
  
  /** Response mode */
  response_mode: ResponseMode;
  
  /** Authority decision (from resolver) */
  authority_decision: AuthorityDecision;
  
  /** Detailed criteria results */
  criteria_results: {
    authority_resolved: { passed: boolean; reason: string };
    crop_identified: { passed: boolean; reason: string };
    stage_determined: { passed: boolean; reason: string };
    symptom_specific: { passed: boolean; reason: string };
    symbolic_decision_valid: { passed: boolean; reason: string };
  };
  
  /** Missing criteria for clarification */
  missing_criteria: string[];
  
  /** Human-readable reason */
  reason: string;
  
  /** Confidence level */
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  
  /** Gate version for audit */
  gate_version: string;
  
  /** Timestamp */
  checked_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if authority allows treatments
 */
export function isTreatmentAuthority(authority: DecisionAuthority): boolean {
  return authority === DecisionAuthority.CROP;
}

/**
 * Check if authority blocks crop-level treatments
 */
export function blocksCtopTreatments(authority: DecisionAuthority): boolean {
  return [
    DecisionAuthority.SAFETY,
    DecisionAuthority.LAND,
    DecisionAuthority.CLIMATE,
    DecisionAuthority.SYSTEM,
    DecisionAuthority.NONE
  ].includes(authority);
}

/**
 * Get response mode from authority
 */
export function getResponseModeFromAuthority(
  authority: DecisionAuthority,
  status: AuthorityStatus
): ResponseMode {
  if (status === AuthorityStatus.PENDING_CLARIFICATION) {
    return ResponseMode.CLARIFICATION;
  }
  
  if (status === AuthorityStatus.BLOCKED || status === AuthorityStatus.UNCONFIRMED) {
    return authority === DecisionAuthority.NONE 
      ? ResponseMode.OBSERVATION 
      : ResponseMode.INFORMATION;
  }
  
  if (authority === DecisionAuthority.CROP && status === AuthorityStatus.CONFIRMED) {
    return ResponseMode.TREATMENT;
  }
  
  return ResponseMode.INFORMATION;
}
