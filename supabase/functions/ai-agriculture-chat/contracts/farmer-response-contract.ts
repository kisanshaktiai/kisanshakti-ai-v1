/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FARMER RESPONSE CONTRACT v1.0.0 - LANGUAGE-INDEPENDENT SYMBOLIC OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL CONTRACT: All agent outputs MUST conform to this structure.
 * 
 * INVARIANTS:
 * - NO farmer-facing language in this contract (Marathi/Hindi/English text)
 * - Response mode drives ALL UI behavior
 * - All text resolution happens in NARRATION LAYER ONLY
 * - Clarification options use observation_key codes, not display text
 * 
 * @version 1.0.0
 */

export const FARMER_RESPONSE_CONTRACT_VERSION = '1.1.0';

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
  | 'DECISION_PROVIDED'      // Symbolic brain returned a treatment/action decision
  | 'CLARIFICATION_REQUIRED' // Need farmer input before proceeding
  | 'MONITORING_ADVISED'     // Young crop or no action needed
  | 'MONITOR_ONLY'           // Alias for MONITORING_ADVISED (for compatibility)
  | 'NO_ACTION_REQUIRED'     // Crop is healthy
  | 'PHOTO_REQUIRED'         // Need photo for visual diagnosis
  | 'BLOCKED'                // Higher authority blocked action
  | 'INFORMATION_ONLY'       // General information, no treatment
  | 'ERROR';                 // System error

/**
 * Severity levels for symbolic outputs
 */
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

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
// FARMER RESPONSE CONTRACT - SYMBOLIC OUTPUT ONLY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FarmerResponseContract - LANGUAGE-INDEPENDENT symbolic output
 * 
 * This is the output from orchestrator → narration layer.
 * The narration layer converts this to farmer-friendly text.
 * 
 * MANDATORY FIELDS:
 * - response_mode (ENUM)
 * - trace_id (string)
 * 
 * OPTIONAL FIELDS (based on mode):
 * - primary_i18n_key: For narration lookup
 * - action_codes: Array of symbolic action codes
 * - severity: SeverityLevel enum
 * - clarification: Object with options
 * - actions: Array of ActionCode
 */
export interface FarmerResponseContract {
  /** Response mode - DRIVES ALL UI BEHAVIOR */
  response_mode: FarmerResponseMode;
  
  /** Primary i18n key for main message (narration layer renders) */
  primary_i18n_key: string;
  
  /** Symbolic action codes (NEW: Phase 5) */
  action_codes: string[];
  
  /** Severity level (NEW: Phase 5) */
  severity: SeverityLevel;
  
  /** Trace ID for audit */
  trace_id: string;
  
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
  
  /** Confidence score (0-1) */
  confidence?: number;
  
  /** Rules that fired (for audit) */
  rules_applied?: string[];
  
  /** Blocking authority (if mode = BLOCKED) */
  blocking_authority?: string;
  
  /** Blocking reason code */
  blocking_reason_code?: string;
  
  /** Error code (if mode = ERROR) */
  error_code?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER FUNCTION - Creates valid FarmerResponseContract
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerResponseBuilderInput {
  response_mode: FarmerResponseMode;
  trace_id: string;
  
  // MANDATORY with defaults
  primary_i18n_key?: string;
  action_codes?: string[];
  severity?: SeverityLevel;
  
  // Optional fields based on mode
  confidence?: number;
  rules_applied?: string[];
  
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
 */
export function buildFarmerResponse(input: FarmerResponseBuilderInput): FarmerResponseContract {
  const {
    response_mode,
    trace_id,
    primary_i18n_key,
    action_codes,
    severity,
    confidence,
    rules_applied,
    clarification_reason_code,
    clarification_ui_input,
    clarification_options,
    photo_guidance_code,
    actions,
    blocking_authority,
    blocking_reason_code,
    error_code
  } = input;
  
  // FAIL-SAFE DEFAULTS
  const response: FarmerResponseContract = {
    response_mode,
    trace_id,
    // MANDATORY with defaults
    primary_i18n_key: primary_i18n_key || 'system.monitoring.default',
    action_codes: action_codes || [],
    severity: severity || 'MEDIUM',
    confidence,
    rules_applied
  };
  
  // Build clarification if mode requires it
  if (response_mode === 'CLARIFICATION_REQUIRED' || response_mode === 'PHOTO_REQUIRED') {
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
// VALIDATION FUNCTION - Ensures contract compliance (CRASH-PROOF)
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
  
  // MANDATORY fields with defaults should just warn, not error
  if (!response.primary_i18n_key) {
    warnings.push('Missing primary_i18n_key - will use default');
  }
  
  if (!response.action_codes || response.action_codes.length === 0) {
    // This is OK for many modes - just log
    if (response.response_mode === 'DECISION_PROVIDED') {
      warnings.push('DECISION_PROVIDED mode should have action_codes');
    }
  }
  
  // Mode-specific validation (less strict - we want to avoid crashes)
  if (response.response_mode === 'CLARIFICATION_REQUIRED') {
    if (!response.clarification) {
      warnings.push('CLARIFICATION_REQUIRED mode should have clarification object');
    }
  }
  
  if (response.response_mode === 'DECISION_PROVIDED') {
    if (!response.actions || response.actions.length === 0) {
      warnings.push('DECISION_PROVIDED mode should have at least one action');
    }
  }
  
  if (response.response_mode === 'BLOCKED') {
    if (!response.blocking_reason_code) {
      warnings.push('BLOCKED mode should have blocking_reason_code');
    }
  }
  
  // MONITORING modes are VALID without actions
  if (response.response_mode === 'MONITORING_ADVISED' || response.response_mode === 'MONITOR_ONLY') {
    // These are valid without actions or clarification
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Convert legacy OrchestratorResponse to FarmerResponseContract
// ═══════════════════════════════════════════════════════════════════════════

export function mapOrchestratorTypeToResponseMode(
  type: string | null | undefined
): FarmerResponseMode {
  // CRASH-PROOF: Handle null/undefined
  const safeType = (type || '').toUpperCase().trim();
  
  switch (safeType) {
    case 'DECISION_PROVIDED':
      return 'DECISION_PROVIDED';
    case 'CLARIFICATION_QUESTION':
    case 'CLARIFICATION':
    case 'CLARIFICATION_REQUIRED':
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
    case 'NO_ACTION':
    case 'NO_ACTION_REQUIRED':
    case 'HEALTHY':
      return 'NO_ACTION_REQUIRED';
    default:
      // FAIL-SAFE: Unknown types become INFORMATION_ONLY (safest default)
      console.warn(`[FarmerResponseContract] Unknown type "${type}" mapped to INFORMATION_ONLY`);
      return 'INFORMATION_ONLY';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDARD i18n KEYS FOR COMMON SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

export const STANDARD_I18N_KEYS = {
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

export default {
  buildFarmerResponse,
  validateFarmerResponseContract,
  mapOrchestratorTypeToResponseMode,
  STANDARD_I18N_KEYS,
  FARMER_RESPONSE_CONTRACT_VERSION
};
