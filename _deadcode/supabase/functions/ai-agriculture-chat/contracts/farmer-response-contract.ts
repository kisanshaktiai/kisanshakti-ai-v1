/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER RESPONSE CONTRACT v2.0.0 - GUARANTEED COMPLETE SYMBOLIC OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL CONTRACT: All agent outputs MUST conform to this structure.
 * 
 * INVARIANTS:
 * - NO farmer-facing language in this contract (Marathi/Hindi/English text)
 * - Response mode drives ALL UI behavior
 * - All text resolution happens in NARRATION LAYER ONLY
 * - Clarification options use observation_key codes, not display text
 * - ALL FIELDS HAVE SAFE DEFAULTS - ZERO UNDEFINED POSSIBLE
 * 
 * @version 2.0.0
 */

export const FARMER_RESPONSE_CONTRACT_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE MODE ENUM - LOCKED (Changes require version bump)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FarmerResponseMode - PRODUCTION ENUM
 * 
 * INVARIANT: These are the ONLY valid response modes.
 * Adding a mode requires incrementing FARMER_RESPONSE_CONTRACT_VERSION.
 */
export type FarmerResponseMode =
  | 'READY'                  // Treatment can proceed
  | 'DECISION_PROVIDED'      // Symbolic brain returned a treatment/action decision
  | 'CLARIFICATION_REQUIRED' // Need farmer input before proceeding
  | 'NEEDS_CLARIFICATION'    // Alias for CLARIFICATION_REQUIRED
  | 'MONITORING_ADVISED'     // Young crop or no action needed
  | 'MONITOR_ONLY'           // Alias for MONITORING_ADVISED (for compatibility)
  | 'OBSERVATION'            // Watch and wait
  | 'NO_ACTION_REQUIRED'     // Crop is healthy
  | 'PHOTO_REQUIRED'         // Need photo for visual diagnosis
  | 'BLOCKED'                // Higher authority blocked action
  | 'INFORMATION_ONLY'       // General information, no treatment
  | 'NO_MATCH'               // No rule matched
  | 'ERROR';                 // System error

/**
 * Severity levels for symbolic outputs
 */
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO' | 'ADVISORY' | 'WARNING';

// ═══════════════════════════════════════════════════════════════════════════
// UI INPUT TYPE - What input the UI should request
// ═══════════════════════════════════════════════════════════════════════════

export type UIInputType = 'TEXT' | 'OPTION' | 'IMAGE' | 'VOICE';

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION OPTION - SYMBOLIC ONLY (No display text)
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationOptionCode {
  /** Unique option code (e.g., 'OPT_YELLOW_LEAF', 'OPT_PEST_VISIBLE') */
  option_code: string;
  
  /** i18n key for translation lookup (e.g., 'option.symptom.yellow_leaf') */
  i18n_key: string;
  
  /** Observation key to map to if selected (e.g., 'YELLOWING_OBSERVED') */
  observation_key?: string;
  
  /** Diagnostic power of this option */
  diagnostic_power?: 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** Icon code (not emoji - emoji resolved in narration) */
  icon_code?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION CODE - SYMBOLIC ONLY
// ═══════════════════════════════════════════════════════════════════════════

export interface ActionCode {
  /** Action type code from rule engine */
  action_code: string;
  
  /** i18n key for action text */
  i18n_key: string;
  
  /** Product code (if applicable) */
  product_code?: string;
  
  /** Dosage code (e.g., 'UREA_50KG_ACRE') */
  dosage_code?: string;
  
  /** Timing code (e.g., 'MORNING_SPRAY', 'WITHIN_24H') */
  timing_code?: string;
  
  /** Priority level */
  priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  
  /** Rule ID from symbolic brain */
  rule_id?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FARMER RESPONSE CONTRACT - GUARANTEED COMPLETE SYMBOLIC OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FarmerResponseContract - LANGUAGE-INDEPENDENT symbolic output
 * 
 * This is the output from orchestrator → narration layer.
 * The narration layer converts this to farmer-friendly text.
 * 
 * ALL FIELDS ARE MANDATORY (with defaults) - ZERO UNDEFINED POSSIBLE
 */
export interface FarmerResponseContract {
  /** Response mode - DRIVES ALL UI BEHAVIOR (MANDATORY) */
  response_mode: FarmerResponseMode;
  
  /** Primary i18n key for main message (MANDATORY with default) */
  primary_i18n_key: string;
  
  /** Fallback i18n key - ALWAYS PRESENT for safety (NEW v2.0.0) */
  fallback_i18n_key: string;
  
  /** Symbolic action codes (MANDATORY - can be empty array) */
  action_codes: string[];
  
  /** Severity level (MANDATORY with default) */
  severity: SeverityLevel;
  
  /** Trace ID for audit (MANDATORY) */
  trace_id: string;
  
  /** Rules that applied (MANDATORY - defaults to ['FALLBACK_RULE']) */
  rules_applied: string[];
  
  /** Decision confidence 0-100 (MANDATORY with default) */
  decision_confidence: number;
  
  /** Whether authority has been resolved (NEW v2.0.0) */
  authority_resolved: boolean;
  
  /** Clarification details (when mode = CLARIFICATION_REQUIRED) */
  clarification?: {
    /** Why clarification is needed */
    reason_code: string;
    
    /** What input type UI should show */
    ui_input_type: UIInputType;
    
    /** Options to display (if ui_input_type = OPTION) */
    options?: ClarificationOptionCode[];
    
    /** Photo guidance code (if ui_input_type = IMAGE) */
    photo_guidance_code?: string;
  };
  
  /** Actions to render (when mode = DECISION_PROVIDED) */
  actions?: ActionCode[];
  
  /** Confidence score (0-1) - legacy support */
  confidence?: number;
  
  /** Blocking authority (if mode = BLOCKED) */
  blocking_authority?: string;
  
  /** Blocking reason code */
  blocking_reason_code?: string;
  
  /** Error code (if mode = ERROR) */
  error_code?: string;
  
  /** Invariant violations detected during validation (NEW v2.0.0) */
  invariant_violations?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER FUNCTION - Creates valid FarmerResponseContract
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerResponseBuilderInput {
  response_mode: FarmerResponseMode;
  trace_id: string;
  
  // MANDATORY with defaults
  primary_i18n_key?: string;
  fallback_i18n_key?: string;
  action_codes?: string[];
  severity?: SeverityLevel;
  rules_applied?: string[];
  decision_confidence?: number;
  authority_resolved?: boolean;
  
  // Optional fields based on mode
  confidence?: number;
  
  // Clarification
  clarification_reason_code?: string;
  clarification_ui_input?: UIInputType;
  clarification_options?: ClarificationOptionCode[];
  photo_guidance_code?: string;
  
  // Actions
  actions?: ActionCode[];
  
  // Blocking
  blocking_authority?: string;
  blocking_reason_code?: string;
  
  // Error
  error_code?: string;
}

/**
 * buildFarmerResponse - Creates a VALID FarmerResponseContract with GUARANTEED defaults
 * 
 * CRASH-PROOF: All required fields have safe defaults
 * INVARIANT: Output is ALWAYS renderable
 */
export function buildFarmerResponse(input: FarmerResponseBuilderInput): FarmerResponseContract {
  const {
    response_mode,
    trace_id,
    primary_i18n_key,
    fallback_i18n_key,
    action_codes,
    severity,
    rules_applied,
    decision_confidence,
    authority_resolved,
    confidence,
    clarification_reason_code,
    clarification_ui_input,
    clarification_options,
    photo_guidance_code,
    actions,
    blocking_authority,
    blocking_reason_code,
    error_code
  } = input;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FAIL-SAFE DEFAULTS - ZERO UNDEFINED POSSIBLE
  // ═══════════════════════════════════════════════════════════════════════════
  const response: FarmerResponseContract = {
    response_mode: response_mode || 'OBSERVATION',
    trace_id: trace_id || `trace_${Date.now().toString(36)}`,
    
    // MANDATORY with GUARANTEED defaults
    primary_i18n_key: primary_i18n_key || 'system.monitoring.default',
    fallback_i18n_key: fallback_i18n_key || 'system.monitoring.default',
    action_codes: Array.isArray(action_codes) ? action_codes : [],
    severity: severity || 'MEDIUM',
    rules_applied: Array.isArray(rules_applied) && rules_applied.length > 0 
      ? rules_applied 
      : ['FALLBACK_RULE'],
    decision_confidence: typeof decision_confidence === 'number' ? decision_confidence : 50,
    authority_resolved: typeof authority_resolved === 'boolean' ? authority_resolved : false,
    
    // Optional legacy field
    confidence
  };
  
  // Build clarification if mode requires it
  if (response_mode === 'CLARIFICATION_REQUIRED' || 
      response_mode === 'NEEDS_CLARIFICATION' ||
      response_mode === 'PHOTO_REQUIRED') {
    response.clarification = {
      reason_code: clarification_reason_code || 'NEED_MORE_INFO',
      ui_input_type: clarification_ui_input || (response_mode === 'PHOTO_REQUIRED' ? 'IMAGE' : 'OPTION'),
      options: clarification_options,
      photo_guidance_code
    };
  }
  
  // Add actions if provided
  if (actions && actions.length > 0) {
    response.actions = actions;
  }
  
  // Add blocking info if blocked
  if (response_mode === 'BLOCKED') {
    response.blocking_authority = blocking_authority;
    response.blocking_reason_code = blocking_reason_code || 'UNKNOWN_BLOCK_REASON';
  }
  
  // Add error code if error
  if (response_mode === 'ERROR') {
    response.error_code = error_code || 'UNKNOWN_ERROR';
  }
  
  return response;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION AND NORMALIZATION FUNCTION - CRASH-PROOF
// ═══════════════════════════════════════════════════════════════════════════

/**
 * validateAndNormalizeFarmerResponse - The MASTER validation gate
 * 
 * CRITICAL: This function NEVER throws and ALWAYS returns a renderable response.
 * It injects defaults for ANY missing fields and logs violations.
 * 
 * @param input - Partial or complete response object
 * @param traceId - Trace ID for logging
 * @returns GUARANTEED SAFE FarmerResponseContract
 */
export function validateAndNormalizeFarmerResponse(
  input: Partial<FarmerResponseContract> | null | undefined,
  traceId?: string
): FarmerResponseContract {
  const safeTraceId = traceId || input?.trace_id || `norm_${Date.now().toString(36)}`;
  const violations: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRASH-PROOF: Handle completely missing input
  // ═══════════════════════════════════════════════════════════════════════════
  if (!input || typeof input !== 'object') {
    console.warn(`🚨 [FarmerResponseContract] NULL INPUT - creating default response: ${safeTraceId}`);
    return buildFarmerResponse({
      response_mode: 'OBSERVATION',
      trace_id: safeTraceId,
      primary_i18n_key: 'system.monitoring.default',
      severity: 'MEDIUM',
      decision_confidence: 0
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATE AND FIX EACH MANDATORY FIELD
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1. response_mode
  let responseMode: FarmerResponseMode = 'OBSERVATION';
  if (input.response_mode) {
    const validModes: FarmerResponseMode[] = [
      'READY', 'DECISION_PROVIDED', 'CLARIFICATION_REQUIRED', 'NEEDS_CLARIFICATION',
      'MONITORING_ADVISED', 'MONITOR_ONLY', 'OBSERVATION', 'NO_ACTION_REQUIRED',
      'PHOTO_REQUIRED', 'BLOCKED', 'INFORMATION_ONLY', 'NO_MATCH', 'ERROR'
    ];
    if (validModes.includes(input.response_mode)) {
      responseMode = input.response_mode;
    } else {
      violations.push(`Invalid response_mode: ${input.response_mode}`);
    }
  } else {
    violations.push('Missing response_mode');
  }
  
  // 2. primary_i18n_key
  const primaryI18nKey = typeof input.primary_i18n_key === 'string' && input.primary_i18n_key.length > 0
    ? input.primary_i18n_key
    : 'system.monitoring.default';
  if (!input.primary_i18n_key) {
    violations.push('Missing primary_i18n_key - using default');
  }
  
  // 3. fallback_i18n_key
  const fallbackI18nKey = typeof input.fallback_i18n_key === 'string' && input.fallback_i18n_key.length > 0
    ? input.fallback_i18n_key
    : 'system.monitoring.default';
  
  // 4. action_codes
  const actionCodes = Array.isArray(input.action_codes) ? input.action_codes : [];
  
  // 5. severity
  const validSeverities: SeverityLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'INFO', 'ADVISORY', 'WARNING'];
  const severity: SeverityLevel = input.severity && validSeverities.includes(input.severity)
    ? input.severity
    : 'MEDIUM';
  
  // 6. rules_applied
  const rulesApplied = Array.isArray(input.rules_applied) && input.rules_applied.length > 0
    ? input.rules_applied
    : ['FALLBACK_RULE'];
  if (!input.rules_applied || input.rules_applied.length === 0) {
    violations.push('Missing rules_applied - using FALLBACK_RULE');
  }
  
  // 7. decision_confidence
  const decisionConfidence = typeof input.decision_confidence === 'number'
    ? Math.max(0, Math.min(100, input.decision_confidence))
    : 50;
  
  // 8. authority_resolved
  const authorityResolved = typeof input.authority_resolved === 'boolean'
    ? input.authority_resolved
    : false;
  
  // Log violations if any
  if (violations.length > 0) {
    console.warn(`⚠️ [FarmerResponseContract] ${safeTraceId} - ${violations.length} violations fixed:`, violations.join('; '));
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD NORMALIZED RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════
  const normalized: FarmerResponseContract = {
    response_mode: responseMode,
    trace_id: safeTraceId,
    primary_i18n_key: primaryI18nKey,
    fallback_i18n_key: fallbackI18nKey,
    action_codes: actionCodes,
    severity,
    rules_applied: rulesApplied,
    decision_confidence: decisionConfidence,
    authority_resolved: authorityResolved,
    
    // Preserve optional fields
    clarification: input.clarification,
    actions: input.actions,
    confidence: input.confidence,
    blocking_authority: input.blocking_authority,
    blocking_reason_code: input.blocking_reason_code,
    error_code: input.error_code,
    
    // Record violations for audit
    invariant_violations: violations.length > 0 ? violations : undefined
  };
  
  return normalized;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTION - Checks contract compliance
// ═══════════════════════════════════════════════════════════════════════════

export function validateFarmerResponseContract(
  response: FarmerResponseContract
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Must have response_mode
  if (!response.response_mode) {
    errors.push('Missing required field: response_mode');
  }
  
  // Must have trace_id
  if (!response.trace_id) {
    errors.push('Missing required field: trace_id');
  }
  
  // MANDATORY fields should just warn, not error (we have defaults)
  if (!response.primary_i18n_key) {
    warnings.push('Missing primary_i18n_key - will use default');
  }
  
  if (!response.fallback_i18n_key) {
    warnings.push('Missing fallback_i18n_key - will use default');
  }
  
  if (!response.rules_applied || response.rules_applied.length === 0) {
    warnings.push('Empty rules_applied - using FALLBACK_RULE');
  }
  
  if (typeof response.decision_confidence !== 'number') {
    warnings.push('Missing decision_confidence - using default');
  }
  
  // Mode-specific validation
  if (response.response_mode === 'CLARIFICATION_REQUIRED' || response.response_mode === 'NEEDS_CLARIFICATION') {
    if (!response.clarification) {
      warnings.push('CLARIFICATION mode should have clarification object');
    }
  }
  
  if (response.response_mode === 'DECISION_PROVIDED' || response.response_mode === 'READY') {
    if (!response.actions || response.actions.length === 0) {
      warnings.push('DECISION/READY mode should have at least one action');
    }
  }
  
  if (response.response_mode === 'BLOCKED') {
    if (!response.blocking_reason_code) {
      warnings.push('BLOCKED mode should have blocking_reason_code');
    }
  }
  
  // MONITORING modes are VALID without actions
  if (response.response_mode === 'MONITORING_ADVISED' || 
      response.response_mode === 'MONITOR_ONLY' ||
      response.response_mode === 'OBSERVATION') {
    // These are valid without actions or clarification
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Convert legacy OrchestratorResponse to FarmerResponseMode
// ═══════════════════════════════════════════════════════════════════════════

export function mapOrchestratorTypeToResponseMode(
  type: string | null | undefined
): FarmerResponseMode {
  // CRASH-PROOF: Handle null/undefined
  const safeType = (type || '').toUpperCase().trim();
  
  switch (safeType) {
    case 'READY':
      return 'READY';
    case 'DECISION_PROVIDED':
      return 'DECISION_PROVIDED';
    case 'CLARIFICATION_QUESTION':
    case 'CLARIFICATION':
    case 'CLARIFICATION_REQUIRED':
    case 'NEEDS_CLARIFICATION':
    case 'ASK_CLARIFICATION':
      return 'CLARIFICATION_REQUIRED';
    case 'PHOTO_REQUEST':
    case 'PHOTO_REQUIRED':
    case 'NEEDS_PHOTO':
      return 'PHOTO_REQUIRED';
    case 'SAFETY_BLOCKED':
    case 'BLOCKED':
      return 'BLOCKED';
    case 'ESCALATION_REQUIRED':
      return 'BLOCKED';
    case 'SYSTEM_ERROR':
    case 'ERROR':
      return 'ERROR';
    case 'MONITORING':
    case 'MONITORING_ADVISED':
    case 'MONITOR_ONLY':
      return 'MONITORING_ADVISED';
    case 'OBSERVATION':
      return 'OBSERVATION';
    case 'NO_ACTION':
    case 'NO_ACTION_REQUIRED':
    case 'HEALTHY':
      return 'NO_ACTION_REQUIRED';
    case 'NO_MATCH':
      return 'NO_MATCH';
    case 'INFORMATION':
    case 'INFORMATION_ONLY':
      return 'INFORMATION_ONLY';
    default:
      // FAIL-SAFE: Unknown types become OBSERVATION (safest default)
      console.warn(`[FarmerResponseContract] Unknown type "${type}" mapped to OBSERVATION`);
      return 'OBSERVATION';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDARD i18n KEYS FOR COMMON SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

export const STANDARD_I18N_KEYS = {
  // System defaults
  SYSTEM_MONITORING_DEFAULT: 'system.monitoring.default',
  SYSTEM_ERROR_DEFAULT: 'system.error.default',
  SYSTEM_FALLBACK: 'system.fallback',
  
  // Greetings
  GREETING_WELCOME: 'greeting.welcome',
  GREETING_HOW_CAN_HELP: 'greeting.how_can_help',
  
  // Monitoring
  MONITORING_CROP_HEALTHY: 'monitoring.crop_healthy',
  MONITORING_CONTINUE_OBSERVATION: 'monitoring.continue_observation',
  MONITORING_YOUNG_CROP: 'monitoring.young_crop_no_spray',
  
  // Clarification
  CLARIFICATION_SELECT_OPTION: 'clarification.select_option',
  CLARIFICATION_SEND_PHOTO: 'clarification.send_photo',
  CLARIFICATION_DESCRIBE_MORE: 'clarification.describe_more',
  
  // Photo
  PHOTO_SEND_AFFECTED_AREA: 'photo.send_affected_area',
  PHOTO_CLOSE_UP_NEEDED: 'photo.close_up_needed',
  PHOTO_GOOD_LIGHTING: 'photo.good_lighting',
  
  // Treatment
  TREATMENT_RECOMMENDATION: 'treatment.recommendation',
  TREATMENT_APPLY_NOW: 'treatment.apply_now',
  TREATMENT_APPLY_WITHIN_24H: 'treatment.apply_within_24h',
  
  // Blocking
  BLOCKED_YOUNG_CROP: 'blocked.young_crop',
  BLOCKED_WEATHER: 'blocked.weather_conditions',
  BLOCKED_SAFETY: 'blocked.safety_concern',
  
  // Error
  ERROR_TRY_AGAIN: 'error.try_again',
  ERROR_SYSTEM_ISSUE: 'error.system_issue'
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL FALLBACK RULE - Injected when no rules match
// ═══════════════════════════════════════════════════════════════════════════

export const GLOBAL_FALLBACK_RULE = {
  rule_id: 'GLOBAL_FALLBACK_MONITOR',
  action_type: 'MONITOR',
  i18n_key: 'monitoring.continue_observation',
  response_mode: 'OBSERVATION' as FarmerResponseMode,
  severity: 'LOW' as SeverityLevel,
  priority: 1000
};

export default {
  // Core functions
  buildFarmerResponse,
  validateAndNormalizeFarmerResponse,
  validateFarmerResponseContract,
  mapOrchestratorTypeToResponseMode,
  
  // Constants
  STANDARD_I18N_KEYS,
  GLOBAL_FALLBACK_RULE,
  FARMER_RESPONSE_CONTRACT_VERSION
};
