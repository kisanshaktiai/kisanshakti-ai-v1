/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UI RESPONSE CONTRACT v1.0.0 - WORLD-CLASS FARMER-FRIENDLY OUTPUT SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL CONTRACT: Every AI chat response MUST conform to this structure.
 * 
 * DESIGN PRINCIPLES:
 * - Response mode drives ALL UI behavior
 * - Text is ALWAYS optional (UI must never crash on empty text)
 * - All strings support i18n_key + fallback_text pattern
 * - Farmer can respond by: option click, photo upload, OR text
 * - Usable by low-literacy rural Indian farmers
 * 
 * INVARIANT: This contract is LOCKED. Any change requires version bump.
 * 
 * @version 1.0.0
 */

// ═══════════════════════════════════════════════════════════════════════════
// LOCKED RESPONSE MODE ENUM - DO NOT MODIFY
// ═══════════════════════════════════════════════════════════════════════════

export type UIResponseMode =
  | 'OBSERVATION'
  | 'CLARIFICATION_REQUIRED'
  | 'PHOTO_REQUIRED'
  | 'MONITORING_ADVISED'
  | 'TREATMENT_ALLOWED'
  | 'NO_ACTION_NEEDED'
  | 'ERROR';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type NextAllowedInput = 'OPTION_SELECT' | 'PHOTO_UPLOAD' | 'FREE_TEXT' | 'VOICE_INPUT';

// ═══════════════════════════════════════════════════════════════════════════
// LOCALIZABLE TEXT - Support for i18n_key + fallback pattern
// ═══════════════════════════════════════════════════════════════════════════

export interface LocalizableText {
  /** i18n key for translation lookup */
  i18n_key?: string;
  
  /** Fallback text if i18n lookup fails (in farmer's language) */
  fallback_text: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLARIFICATION OPTION - For interactive selection
// ═══════════════════════════════════════════════════════════════════════════

export interface ClarificationOptionUI {
  /** Unique option identifier */
  id: string;
  
  /** Display label (LocalizableText) */
  label: LocalizableText;
  
  /** Observation key for symbolic brain */
  observation_key?: string;
  
  /** Optional emoji icon */
  icon?: string;
  
  /** Diagnostic power of this option */
  diagnostic_power?: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO REQUEST - Camera guidance for farmers
// ═══════════════════════════════════════════════════════════════════════════

export interface PhotoRequestUI {
  /** Whether photo upload should be shown */
  enabled: boolean;
  
  /** What to photograph */
  target: LocalizableText;
  
  /** Photo capture guidance */
  guidance?: {
    what_to_capture: LocalizableText;
    angle_suggestion?: LocalizableText;
    lighting_tip?: LocalizableText;
  };
  
  /** Priority of photo request */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT DETAILS - For treatment mode
// ═══════════════════════════════════════════════════════════════════════════

export interface TreatmentDetailsUI {
  /** What to do (action) */
  action: LocalizableText;
  
  /** Product name if applicable */
  product_name?: string;
  
  /** Dosage information */
  dosage?: LocalizableText;
  
  /** When to apply */
  timing?: LocalizableText;
  
  /** Why this treatment */
  reason?: LocalizableText;
  
  /** Scientific backing */
  knowledge?: LocalizableText;
  
  /** Safety warnings */
  safety_warnings?: LocalizableText[];
  
  /** Priority level */
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTENT BLOCK - What farmer sees
// ═══════════════════════════════════════════════════════════════════════════

export interface UIResponseContent {
  /** Primary message (always localizable) */
  primary_message?: LocalizableText;
  
  /** Secondary messages (bullet points, etc.) */
  secondary_messages?: LocalizableText[];
  
  /** Treatment details (for TREATMENT_ALLOWED mode) */
  treatment?: TreatmentDetailsUI;
  
  /** Monitoring note (for OBSERVATION/MONITORING modes) */
  monitoring_note?: LocalizableText;
  
  /** Expert-level diagnostic summary */
  diagnostic_summary?: LocalizableText;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS BLOCK - How farmer interacts
// ═══════════════════════════════════════════════════════════════════════════

export interface UIResponseActions {
  /** Clarification options (buttons/cards) */
  options?: ClarificationOptionUI[];
  
  /** Photo request configuration */
  request_photo?: PhotoRequestUI;
  
  /** What inputs are allowed next */
  next_allowed_inputs: NextAllowedInput[];
  
  /** Whether to block free text (use when options must be selected) */
  block_free_text: boolean;
  
  /** Quick action suggestions */
  quick_actions?: Array<{
    label: LocalizableText;
    action: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT BLOCK - Debug + Trust Layer
// ═══════════════════════════════════════════════════════════════════════════

export interface UIResponseContext {
  /** Current crop */
  crop?: string;
  
  /** Crop i18n key for display */
  crop_i18n_key?: string;
  
  /** Growth stage */
  growth_stage?: string;
  
  /** Days after sowing */
  days_after_sowing?: number;
  
  /** Decision confidence (0-1) */
  decision_confidence: number;
  
  /** Data sources used */
  data_sources: string[];
  
  /** Whether this is a young crop (< 30 DAS) */
  is_young_crop: boolean;
  
  /** Rules applied (for audit) */
  rules_applied?: string[];
  
  /** Detected language */
  detected_language?: 'mr' | 'hi' | 'en';
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY BLOCK - Non-negotiable safety information
// ═══════════════════════════════════════════════════════════════════════════

export interface UIResponseSafety {
  /** Whether treatment is allowed */
  treatment_allowed: boolean;
  
  /** Reason for treatment block (if blocked) */
  block_reason?: LocalizableText;
  
  /** When to review again (days) */
  next_review_days?: number;
  
  /** Safety warnings to display */
  warnings?: LocalizableText[];
  
  /** Authority that blocked treatment (if any) */
  blocking_authority?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FINAL UI RESPONSE CONTRACT - MANDATORY STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

export interface UIResponseContract {
  /** Response mode - DRIVES ALL UI BEHAVIOR */
  response_mode: UIResponseMode;
  
  /** Confidence level */
  confidence_level: ConfidenceLevel;
  
  /** Contract version */
  ui_version: '1.0';
  
  /** Trace ID for debugging */
  trace_id: string;
  
  /** Timestamp */
  timestamp: string;
  
  /** What farmer sees */
  content: UIResponseContent;
  
  /** How farmer interacts */
  actions: UIResponseActions;
  
  /** Context for trust/debug */
  context: UIResponseContext;
  
  /** Safety information */
  safety: UIResponseSafety;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILDER FUNCTION - Create valid UI response
// ═══════════════════════════════════════════════════════════════════════════

export interface UIResponseBuilderInput {
  response_mode: UIResponseMode;
  language: 'mr' | 'hi' | 'en';
  trace_id: string;
  
  // Content (all optional - mode drives what's needed)
  primary_text?: string;
  primary_i18n_key?: string;
  treatment_details?: {
    action_text?: string;
    product_name?: string;
    dosage?: string;
    timing?: string;
    reason?: string;
    knowledge?: string;
    priority?: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  };
  monitoring_text?: string;
  
  // Actions
  options?: Array<{
    id: string;
    label: string;
    observation_key?: string;
    icon?: string;
  }>;
  request_photo?: boolean;
  photo_target?: string;
  block_free_text?: boolean;
  
  // Context
  crop?: string;
  crop_i18n_key?: string;
  growth_stage?: string;
  days_after_sowing?: number;
  confidence?: number;
  data_sources?: string[];
  rules_applied?: string[];
  
  // Safety
  treatment_allowed?: boolean;
  block_reason?: string;
  warnings?: string[];
  blocking_authority?: string;
}

/**
 * Build a valid UI response from simplified input
 * This ensures the contract is ALWAYS valid
 */
export function buildUIResponse(input: UIResponseBuilderInput): UIResponseContract {
  const {
    response_mode,
    language,
    trace_id,
    primary_text,
    primary_i18n_key,
    treatment_details,
    monitoring_text,
    options,
    request_photo,
    photo_target,
    block_free_text,
    crop,
    crop_i18n_key,
    growth_stage,
    days_after_sowing,
    confidence,
    data_sources,
    rules_applied,
    treatment_allowed,
    block_reason,
    warnings,
    blocking_authority
  } = input;
  
  // Default messages by mode (crash-proof)
  const MODE_DEFAULTS: Record<UIResponseMode, Record<string, string>> = {
    OBSERVATION: {
      mr: '👀 पिकाचे निरीक्षण करत रहा.',
      hi: '👀 फसल की निगरानी जारी रखें।',
      en: '👀 Continue monitoring your crop.'
    },
    CLARIFICATION_REQUIRED: {
      mr: '❓ कृपया एक पर्याय निवडा:',
      hi: '❓ कृपया एक विकल्प चुनें:',
      en: '❓ Please select an option:'
    },
    PHOTO_REQUIRED: {
      mr: '📷 कृपया प्रभावित पिकाचा फोटो पाठवा.',
      hi: '📷 कृपया प्रभावित फसल का फोटो भेजें।',
      en: '📷 Please send a photo of the affected crop.'
    },
    MONITORING_ADVISED: {
      mr: '✅ सध्या पीक चांगले आहे. निरीक्षण चालू ठेवा.',
      hi: '✅ अभी फसल ठीक है। निगरानी जारी रखें।',
      en: '✅ Your crop is healthy. Continue monitoring.'
    },
    TREATMENT_ALLOWED: {
      mr: '💊 शिफारस:',
      hi: '💊 सिफारिश:',
      en: '💊 Recommendation:'
    },
    NO_ACTION_NEEDED: {
      mr: '✅ कोणतीही कृती आवश्यक नाही.',
      hi: '✅ कोई कार्रवाई आवश्यक नहीं।',
      en: '✅ No action needed.'
    },
    ERROR: {
      mr: '⚠️ काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.',
      hi: '⚠️ कुछ गलत हुआ। कृपया फिर से प्रयास करें।',
      en: '⚠️ Something went wrong. Please try again.'
    }
  };
  
  // Build primary message with fallback
  const defaultMessage = MODE_DEFAULTS[response_mode]?.[language] || MODE_DEFAULTS.OBSERVATION[language];
  const primaryMessage: LocalizableText = {
    i18n_key: primary_i18n_key,
    fallback_text: primary_text || defaultMessage
  };
  
  // Build content
  const content: UIResponseContent = {
    primary_message: primaryMessage
  };
  
  // Add treatment details if mode is TREATMENT_ALLOWED
  if (response_mode === 'TREATMENT_ALLOWED' && treatment_details) {
    content.treatment = {
      action: { fallback_text: treatment_details.action_text || '' },
      product_name: treatment_details.product_name,
      dosage: treatment_details.dosage ? { fallback_text: treatment_details.dosage } : undefined,
      timing: treatment_details.timing ? { fallback_text: treatment_details.timing } : undefined,
      reason: treatment_details.reason ? { fallback_text: treatment_details.reason } : undefined,
      knowledge: treatment_details.knowledge ? { fallback_text: treatment_details.knowledge } : undefined,
      priority: treatment_details.priority || 'MEDIUM'
    };
  }
  
  // Add monitoring note if applicable
  if ((response_mode === 'OBSERVATION' || response_mode === 'MONITORING_ADVISED') && monitoring_text) {
    content.monitoring_note = { fallback_text: monitoring_text };
  }
  
  // Build actions
  const actions: UIResponseActions = {
    next_allowed_inputs: ['FREE_TEXT', 'PHOTO_UPLOAD'],
    block_free_text: block_free_text ?? false
  };
  
  // Add options if clarification mode
  if (options && options.length > 0) {
    actions.options = options.map(opt => ({
      id: opt.id,
      label: { fallback_text: opt.label },
      observation_key: opt.observation_key,
      icon: opt.icon
    }));
    actions.next_allowed_inputs = ['OPTION_SELECT', 'PHOTO_UPLOAD', 'FREE_TEXT'];
  }
  
  // Add photo request if photo mode
  if (request_photo || response_mode === 'PHOTO_REQUIRED') {
    actions.request_photo = {
      enabled: true,
      target: { fallback_text: photo_target || 'affected area' },
      priority: 'HIGH'
    };
    actions.next_allowed_inputs = ['PHOTO_UPLOAD', 'FREE_TEXT'];
  }
  
  // Build context
  const context: UIResponseContext = {
    crop,
    crop_i18n_key,
    growth_stage,
    days_after_sowing,
    decision_confidence: confidence ?? 0.5,
    data_sources: data_sources || [],
    is_young_crop: (days_after_sowing || 0) < 30,
    rules_applied,
    detected_language: language
  };
  
  // Build safety
  const safety: UIResponseSafety = {
    treatment_allowed: treatment_allowed ?? (response_mode === 'TREATMENT_ALLOWED'),
    block_reason: block_reason ? { fallback_text: block_reason } : undefined,
    warnings: warnings?.map(w => ({ fallback_text: w })),
    blocking_authority
  };
  
  // Map confidence to level
  const confidenceLevel: ConfidenceLevel = 
    (confidence ?? 0.5) >= 0.8 ? 'HIGH' :
    (confidence ?? 0.5) >= 0.5 ? 'MEDIUM' : 'LOW';
  
  return {
    response_mode,
    confidence_level: confidenceLevel,
    ui_version: '1.0',
    trace_id,
    timestamp: new Date().toISOString(),
    content,
    actions,
    context,
    safety
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTION - Ensure response is valid before sending
// ═══════════════════════════════════════════════════════════════════════════

export function validateUIResponse(response: UIResponseContract): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!response.response_mode) {
    errors.push('response_mode is required');
  }
  
  if (!response.ui_version) {
    errors.push('ui_version is required');
  }
  
  if (!response.trace_id) {
    errors.push('trace_id is required');
  }
  
  // Validate mode-specific requirements
  if (response.response_mode === 'CLARIFICATION_REQUIRED') {
    if (!response.actions.options || response.actions.options.length === 0) {
      // Not an error - clarification can have just a question
      // errors.push('CLARIFICATION_REQUIRED mode should have options');
    }
  }
  
  if (response.response_mode === 'TREATMENT_ALLOWED') {
    if (!response.safety.treatment_allowed) {
      errors.push('TREATMENT_ALLOWED mode but treatment_allowed is false');
    }
  }
  
  // Validate context
  if (response.context.decision_confidence < 0 || response.context.decision_confidence > 1) {
    errors.push('decision_confidence must be between 0 and 1');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE RESOLVER - Determine UI mode from decision output
// ═══════════════════════════════════════════════════════════════════════════

export interface ModeResolverInput {
  gate_action?: string;
  response_mode?: string;
  has_treatment?: boolean;
  has_clarification?: boolean;
  has_options?: boolean;
  needs_photo?: boolean;
  is_monitoring_only?: boolean;
  is_error?: boolean;
}

/**
 * Resolve the UIResponseMode from decision context
 * This is the SINGLE place where mode is determined
 */
export function resolveUIResponseMode(input: ModeResolverInput): UIResponseMode {
  const {
    gate_action,
    response_mode,
    has_treatment,
    has_clarification,
    has_options,
    needs_photo,
    is_monitoring_only,
    is_error
  } = input;
  
  // Priority 1: Error
  if (is_error) {
    return 'ERROR';
  }
  
  // Priority 2: Photo required
  if (needs_photo) {
    return 'PHOTO_REQUIRED';
  }
  
  // Priority 3: Clarification required
  if (has_clarification || has_options) {
    return 'CLARIFICATION_REQUIRED';
  }
  
  // Priority 4: Treatment allowed
  if (has_treatment) {
    return 'TREATMENT_ALLOWED';
  }
  
  // Priority 5: Monitoring advised
  if (is_monitoring_only) {
    return 'MONITORING_ADVISED';
  }
  
  // Priority 6: Check gate_action
  const action = (gate_action || '').toUpperCase();
  if (action.includes('TREATMENT') || action.includes('ALLOW')) {
    return 'TREATMENT_ALLOWED';
  }
  if (action.includes('CLARIFICATION')) {
    return 'CLARIFICATION_REQUIRED';
  }
  if (action.includes('PHOTO')) {
    return 'PHOTO_REQUIRED';
  }
  if (action.includes('OBSERVATION')) {
    return 'OBSERVATION';
  }
  if (action.includes('MONITORING')) {
    return 'MONITORING_ADVISED';
  }
  
  // Priority 7: Check response_mode string
  const mode = (response_mode || '').toUpperCase();
  if (mode.includes('TREATMENT')) return 'TREATMENT_ALLOWED';
  if (mode.includes('CLARIFICATION')) return 'CLARIFICATION_REQUIRED';
  if (mode.includes('PHOTO')) return 'PHOTO_REQUIRED';
  if (mode.includes('MONITORING')) return 'MONITORING_ADVISED';
  if (mode.includes('NO_ACTION')) return 'NO_ACTION_NEEDED';
  
  // Default: OBSERVATION (safe fallback)
  return 'OBSERVATION';
}

export const UI_RESPONSE_CONTRACT_VERSION = '1.0.0';
