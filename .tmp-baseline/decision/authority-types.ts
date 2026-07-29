// CANONICAL AUTHORITY TYPES - Single Source of Truth

export const AUTHORITY_TYPES_VERSION = '1.0.0';

// CANONICAL DECISION AUTHORITY ENUM (Domain Level)

// DecisionAuthority represents the DOMAIN that has the legal right to decide.
export enum DecisionAuthority {
  SAFETY = 'SAFETY',     // Human/livestock risk - blocks all treatments
  LAND = 'LAND',         // Soil/salinity/waterlogging - blocks crop treatments
  CLIMATE = 'CLIMATE',   // Weather stress - blocks crop treatments
  SYSTEM = 'SYSTEM',     // Infrastructure failure - blocks crop treatments
  CROP = 'CROP',         // Pests, diseases, nutrients - allows treatments
  NONE = 'NONE'          // No authority confirmed - observation only
}

// CANONICAL AUTHORITY STATUS ENUM (Confirmation State)

// AuthorityStatus represents the CONFIRMATION STATE of an authority decision.
export enum AuthorityStatus {
  CONFIRMED = 'CONFIRMED',                         // Authority explicitly confirmed
  UNCONFIRMED = 'UNCONFIRMED',                     // No diagnosis yet
  PENDING_CLARIFICATION = 'PENDING_CLARIFICATION', // Awaiting farmer input
  BLOCKED = 'BLOCKED'                              // Higher authority blocking
}

// CANONICAL RESPONSE MODE ENUM

// ResponseMode determines what type of response is allowed based on
export enum ResponseMode {
  // Core modes
  TREATMENT = 'TREATMENT',                       // Full treatment recommendations allowed
  OBSERVATION = 'OBSERVATION',                   // Observation/monitoring only
  INFORMATION = 'INFORMATION',                   // Information only, no actions
  CLARIFICATION = 'CLARIFICATION',               // Must ask clarification questions
  DIAGNOSTIC_ESCALATION = 'DIAGNOSTIC_ESCALATION', // Expert-level diagnostic with hypotheses
  
  // Extended modes for UI contract alignment
  MONITORING_ADVISED = 'MONITORING_ADVISED',     // Simple monitoring reassurance
  PHOTO_REQUIRED = 'PHOTO_REQUIRED',             // Photo upload needed for diagnosis
  NO_ACTION_NEEDED = 'NO_ACTION_NEEDED',         // Crop is healthy, no action
  ERROR = 'ERROR'                                // Error state
}

// CANONICAL GATE STATUS ENUM

// GateStatus is the unified status from the Decision Gate.
export enum GateStatus {
  PASS = 'PASS',                     // All criteria met, treatment allowed
  FAIL = 'FAIL',                     // Criteria not met, treatment blocked
  PARTIAL = 'PARTIAL',               // Some criteria met, general guidance only
  EMERGENCY_BYPASS = 'EMERGENCY_BYPASS' // Emergency fast-tracked
}

// CANONICAL GATE ACTION ENUM

// GateAction specifies what action the gate recommends.
export enum GateAction {
  ALLOW_TREATMENT = 'ALLOW_TREATMENT',
  REQUIRE_CLARIFICATION = 'REQUIRE_CLARIFICATION',
  PROVIDE_GENERAL_GUIDANCE = 'PROVIDE_GENERAL_GUIDANCE',
  PROVIDE_OBSERVATION_ONLY = 'PROVIDE_OBSERVATION_ONLY',
  PROVIDE_INFORMATION_ONLY = 'PROVIDE_INFORMATION_ONLY',
  REQUEST_PHOTO = 'REQUEST_PHOTO',
  ESCALATE_TO_EXPERT = 'ESCALATE_TO_EXPERT',
  DIAGNOSTIC_ESCALATION = 'DIAGNOSTIC_ESCALATION' // Expert-level response with hypotheses
}

// AUTHORITY DECISION OUTPUT INTERFACE

// AuthorityDecision is the output from the Authority Resolver.
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

// UNIFIED DECISION GATE RESULT INTERFACE

// UnifiedGateResult is the output from the Unified Decision Gate.
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
  
  // CRITICAL: Numeric decision confidence (0-100) for response mode resolution
  decision_confidence: number;
  
  // Whether symptoms were detected in the farmer message
  has_symptoms: boolean;
  
  // Whether visual ambiguity was detected (photo would help)
  has_visual_ambiguity: boolean;
  
  // Clarification options to display when mode is CLARIFICATION
  clarification_options?: Array<{
    label: string;
    value: string;
    observation_key?: string;
    i18n_key?: string;
  }>;
  
  /** Gate version for audit */
  gate_version: string;
  
  /** Timestamp */
  checked_at: string;
  
  /** NEW: Diagnostic escalation data - when symptoms match but need confirmation */
  diagnostic_escalation?: DiagnosticEscalationData;
}

// DIAGNOSTIC ESCALATION TYPES (NEW)

// Hypothesis represents a possible cause identified by symptom matching
export interface DiagnosticHypothesis {
  /** Cause code from symbolic brain (e.g., 'APHID_INFESTATION', 'NITROGEN_DEFICIENCY') */
  cause_code: string;
  
  /** Human-readable name */
  cause_name: string;
  
  /** Category: PEST, DISEASE, NUTRIENT, ENVIRONMENTAL */
  category: 'PEST' | 'DISEASE' | 'NUTRIENT' | 'ENVIRONMENTAL' | 'MULTIPLE';
  
  /** Confidence score (0-1) based on symptom match strength */
  confidence: number;
  
  /** Key supporting evidence (symptoms that match this hypothesis) */
  supporting_evidence: string[];
  
  /** What evidence would CONFIRM this hypothesis */
  confirming_evidence: string[];
  
  /** What evidence would RULE OUT this hypothesis */
  ruling_out_evidence: string[];
  
  /** Brief scientific explanation suitable for expert farmer */
  explanation: string;
  
  /** Potential treatments (for display only - not executable until confirmed) */
  potential_treatments?: string[];
}

// Required input specifies what specific data is needed to increase confidence
export interface RequiredInput {
  /** Type of input needed */
  type: 'PHOTO' | 'SEVERITY_ASSESSMENT' | 'DISTRIBUTION_PATTERN' | 'TIMING' | 'HISTORY' | 'LAB_TEST';
  
  /** What specifically to capture/report */
  target: string;
  
  /** Why this input helps (farmer education) */
  rationale: string;
  
  /** Priority: HIGH = most discriminating, MEDIUM = helpful, LOW = nice to have */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** UI hint for rendering (e.g., 'camera', 'selector', 'input') */
  ui_hint?: string;
  
  /** Photo guidance if type is PHOTO */
  photo_guidance?: {
    what_to_capture: string;
    angle_suggestion: string;
    lighting_tip: string;
    examples?: string[];
  };
}

// DiagnosticEscalationData - the complete structure for expert-level responses
export interface DiagnosticEscalationData {
  /** All possible causes ranked by likelihood */
  hypotheses: DiagnosticHypothesis[];
  
  /** Specific inputs needed to confirm/rule out hypotheses */
  required_inputs: RequiredInput[];
  
  /** Current confidence level overall */
  current_confidence: number;
  
  /** Confidence needed for treatment authorization */
  threshold_for_treatment: number;
  
  /** Expert-quality summary for farmer */
  diagnostic_summary: string;
  
  /** What the farmer should monitor meanwhile */
  interim_monitoring: string[];
  
  /** Escalation metadata */
  escalation_reason: string;
  
  /** Whether photo is the primary next step */
  photo_recommended: boolean;
  
  /** Timestamp */
  created_at: string;
}

// HELPER FUNCTIONS

// Check if authority allows treatments
export function isTreatmentAuthority(authority: DecisionAuthority): boolean {
  return authority === DecisionAuthority.CROP;
}

// Check if authority blocks crop-level treatments
export function blocksCtopTreatments(authority: DecisionAuthority): boolean {
  // FIX 1 (v6.1): NONE and UNCONFIRMED must NEVER block crop treatments.
  return [
    DecisionAuthority.SAFETY,
    DecisionAuthority.LAND,
    DecisionAuthority.CLIMATE,
    DecisionAuthority.SYSTEM,
    // REMOVED: DecisionAuthority.NONE — was blocking ALL treatments when authority unresolved
  ].includes(authority);
}

// Get response mode from authority
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
