/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UI RESPONSE BUILDER v1.0.0 - CRASH-PROOF RESPONSE ASSEMBLY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Converts symbolic decision output to farmer-friendly UI response contract.
 * 
 * INVARIANTS:
 * - NEVER crashes on missing/undefined input
 * - Response mode drives ALL behavior
 * - All text is OPTIONAL with mode-driven defaults
 * - Language handling happens HERE, not in symbolic brain
 * 
 * @version 1.0.0
 */

import {
  UIResponseContract,
  UIResponseMode,
  UIResponseContent,
  UIResponseActions,
  UIResponseContext,
  UIResponseSafety,
  LocalizableText,
  ClarificationOptionUI,
  TreatmentDetailsUI,
  buildUIResponse,
  resolveUIResponseMode,
  ConfidenceLevel
} from '../contracts/ui-response-contract.ts';

import {
  safePreviewText,
  safeTrim,
  hasTextContent,
  normalizeFarmerMessage
} from './safe-string.ts';

// ═══════════════════════════════════════════════════════════════════════════
// MODE-SPECIFIC DEFAULT MESSAGES
// ═══════════════════════════════════════════════════════════════════════════

// English-only defaults — LLM narration layer translates at runtime
const MODE_MESSAGES: Record<UIResponseMode, string> = {
  OBSERVATION: '👀 Continue regular monitoring. Contact us if the issue worsens.',
  CLARIFICATION_REQUIRED: '❓ More information needed. Please select one of the following:',
  PHOTO_REQUIRED: '📷 Please send a photo of the affected area for accurate diagnosis.',
  MONITORING_ADVISED: '✅ Your crop looks healthy for now. Continue monitoring.',
  TREATMENT_ALLOWED: '💊 Take the following action:',
  NO_ACTION_NEEDED: '✅ No action needed at this time. Your crop is healthy.',
  ERROR: '⚠️ Something went wrong. Please try again.'
};

// English-only photo guidance — LLM narration layer translates at runtime
const PHOTO_GUIDANCE = {
  prompt: '📷 Send Photo',
  what_to_capture: 'Take a close-up photo of the affected leaf or stem',
  lighting_tip: 'Take photo in good lighting'
};

// ═══════════════════════════════════════════════════════════════════════════
// DECISION OUTPUT TO UI RESPONSE CONVERTER
// ═══════════════════════════════════════════════════════════════════════════

export interface DecisionToUIInput {
  // Raw decision output from orchestrator
  decision_output?: {
    status?: string;
    decision_brain_source?: boolean;
    primary_decision?: {
      action_type?: string;
      rule_id?: string;
      priority?: string;
      application_details?: {
        product_name?: string;
        dosage?: string;
        action_text?: string;
        reason_text?: string;
        knowledge_text?: string;
        i18n_key?: string;
      };
      timing?: {
        recommended_start?: string;
        recommended_end?: string;
      };
    };
    clarification_needed?: boolean;
    clarification_options?: Array<{
      label?: string;
      value?: string;
      observation_key?: string;
      icon?: string;
    }>;
    needs_photo_for_diagnosis?: boolean;
    matched_responses?: any[];
    rules_fired?: string[];
    metadata?: {
      response_mode?: string;
      gate_action?: string;
      confidence?: number;
    };
  };
  
  // Context
  language: string;
  trace_id: string;
  
  // Land context (optional)
  land_context?: {
    current_crop?: string;
    growth_stage?: string;
    days_since_sowing?: number;
  };
  
  // Gate result (optional)
  gate_result?: {
    treatments_allowed?: boolean;
    response_mode?: string;
    gate_action?: string;
    reason?: string;
    confidence_level?: string;
  };
  
  // Error state
  is_error?: boolean;
  error_message?: string;
}

/**
 * Convert decision output to UI response contract
 * CRASH-PROOF: Handles all undefined/missing fields gracefully
 */
export function buildUIResponseFromDecision(input: DecisionToUIInput): UIResponseContract {
  const {
    decision_output,
    language,
    trace_id,
    land_context,
    gate_result,
    is_error,
    error_message
  } = input;
  
  // Safe extraction with defaults
  const safeDecision = decision_output || {};
  const safeMeta = safeDecision.metadata || {};
  const safePrimary = safeDecision.primary_decision || {};
  const safeAppDetails = safePrimary.application_details || {};
  const safeGate = gate_result || {};
  const safeLand = land_context || {};
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: RESOLVE RESPONSE MODE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const responseMode = resolveUIResponseMode({
    gate_action: safeGate.gate_action || safeMeta.gate_action,
    response_mode: safeGate.response_mode || safeMeta.response_mode,
    has_treatment: !!safePrimary.action_type && safeGate.treatments_allowed !== false,
    has_clarification: safeDecision.clarification_needed,
    has_options: (safeDecision.clarification_options?.length || 0) > 0,
    needs_photo: safeDecision.needs_photo_for_diagnosis,
    is_monitoring_only: safeDecision.status === 'MONITORING',
    is_error: is_error
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: BUILD CONTENT
  // ═══════════════════════════════════════════════════════════════════════════
  
  const content = buildContent(responseMode, language, {
    action_text: safeAppDetails.action_text,
    reason_text: safeAppDetails.reason_text,
    knowledge_text: safeAppDetails.knowledge_text,
    product_name: safeAppDetails.product_name,
    dosage: safeAppDetails.dosage,
    i18n_key: safeAppDetails.i18n_key,
    priority: safePrimary.priority,
    error_message
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: BUILD ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const actions = buildActions(responseMode, language, {
    options: safeDecision.clarification_options,
    needs_photo: safeDecision.needs_photo_for_diagnosis || responseMode === 'PHOTO_REQUIRED'
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: BUILD CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════
  
  const confidence = safeMeta.confidence ?? safeGate.confidence_level ? 
    parseConfidenceLevel(safeGate.confidence_level) : 0.5;
  
  const context: UIResponseContext = {
    crop: safeLand.current_crop,
    growth_stage: safeLand.growth_stage,
    days_after_sowing: safeLand.days_since_sowing,
    decision_confidence: confidence,
    data_sources: safeDecision.decision_brain_source ? ['SYMBOLIC_BRAIN'] : ['SYSTEM'],
    is_young_crop: (safeLand.days_since_sowing || 0) < 30,
    rules_applied: safeDecision.rules_fired,
    detected_language: language
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: BUILD SAFETY
  // ═══════════════════════════════════════════════════════════════════════════
  
  const safety: UIResponseSafety = {
    treatment_allowed: safeGate.treatments_allowed ?? (responseMode === 'TREATMENT_ALLOWED'),
    block_reason: !safeGate.treatments_allowed && safeGate.reason ? 
      { fallback_text: safeGate.reason } : undefined,
    blocking_authority: undefined
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: ASSEMBLE FINAL RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════
  
  const confidenceLevel: ConfidenceLevel = 
    confidence >= 0.8 ? 'HIGH' :
    confidence >= 0.5 ? 'MEDIUM' : 'LOW';
  
  return {
    response_mode: responseMode,
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
// CONTENT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildContent(
  mode: UIResponseMode,
  language: string,
  details: {
    action_text?: string;
    reason_text?: string;
    knowledge_text?: string;
    product_name?: string;
    dosage?: string;
    i18n_key?: string;
    priority?: string;
    error_message?: string;
  }
): UIResponseContent {
  const content: UIResponseContent = {};
  
  // Get default message for mode
  const defaultMessage = MODE_MESSAGES[mode] || MODE_MESSAGES.OBSERVATION;
  
  // Build primary message
  if (mode === 'TREATMENT_ALLOWED' && hasTextContent(details.action_text)) {
    // For treatment, use action_text as primary
    content.primary_message = {
      i18n_key: details.i18n_key,
      fallback_text: details.action_text!
    };
    
    // Add treatment details
    content.treatment = {
      action: { fallback_text: details.action_text! },
      product_name: details.product_name,
      dosage: details.dosage ? { fallback_text: details.dosage } : undefined,
      reason: details.reason_text ? { fallback_text: details.reason_text } : undefined,
      knowledge: details.knowledge_text ? { fallback_text: details.knowledge_text } : undefined,
      priority: (details.priority?.toUpperCase() as any) || 'MEDIUM'
    };
  } else if (mode === 'ERROR' && hasTextContent(details.error_message)) {
    content.primary_message = { fallback_text: details.error_message! };
  } else {
    // Use default message for mode
    content.primary_message = { fallback_text: defaultMessage };
  }
  
  // Add monitoring note for observation modes
  if (mode === 'OBSERVATION' || mode === 'MONITORING_ADVISED') {
    content.monitoring_note = { fallback_text: MODE_MESSAGES.MONITORING_ADVISED };
  }
  
  return content;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIONS BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildActions(
  mode: UIResponseMode,
  language: string,
  details: {
    options?: Array<{
      label?: string;
      value?: string;
      observation_key?: string;
      icon?: string;
    }>;
    needs_photo?: boolean;
  }
): UIResponseActions {
  const actions: UIResponseActions = {
    next_allowed_inputs: ['FREE_TEXT', 'PHOTO_UPLOAD'],
    block_free_text: false
  };
  
  // Add options for clarification mode
  if (mode === 'CLARIFICATION_REQUIRED' && details.options && details.options.length > 0) {
    actions.options = details.options.map((opt, idx) => ({
      id: opt.value || `option_${idx}`,
      label: { fallback_text: opt.label || 'Option' },
      observation_key: opt.observation_key,
      icon: opt.icon
    }));
    actions.next_allowed_inputs = ['OPTION_SELECT', 'PHOTO_UPLOAD', 'FREE_TEXT'];
  }
  
  // Add photo request for photo mode
  if (mode === 'PHOTO_REQUIRED' || details.needs_photo) {
    actions.request_photo = {
      enabled: true,
      target: { fallback_text: PHOTO_GUIDANCE.what_to_capture },
      guidance: {
        what_to_capture: { fallback_text: PHOTO_GUIDANCE.what_to_capture },
        lighting_tip: { fallback_text: PHOTO_GUIDANCE.lighting_tip }
      },
      priority: 'HIGH'
    };
    actions.next_allowed_inputs = ['PHOTO_UPLOAD', 'OPTION_SELECT', 'FREE_TEXT'];
  }
  
  return actions;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function parseConfidenceLevel(level?: string): number {
  if (!level) return 0.5;
  switch (level.toUpperCase()) {
    case 'HIGH': return 0.85;
    case 'MEDIUM': return 0.6;
    case 'LOW': return 0.35;
    case 'VERY_LOW': return 0.2;
    default: return 0.5;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACT DISPLAY TEXT FROM UI RESPONSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract the primary display text from UI response
 * Used for legacy compatibility where a string is needed
 */
export function extractDisplayText(response: UIResponseContract): string {
  // Priority 1: Primary message
  if (response.content.primary_message?.fallback_text) {
    return response.content.primary_message.fallback_text;
  }
  
  // Priority 2: Treatment action
  if (response.content.treatment?.action?.fallback_text) {
    return response.content.treatment.action.fallback_text;
  }
  
  // Priority 3: Monitoring note
  if (response.content.monitoring_note?.fallback_text) {
    return response.content.monitoring_note.fallback_text;
  }
  
  // Priority 4: Default by mode
  return MODE_MESSAGES[response.response_mode] || MODE_MESSAGES.OBSERVATION;
}

/**
 * Check if response has valid content to display
 */
export function hasDisplayableContent(response: UIResponseContract): boolean {
  return !!(
    response.content.primary_message?.fallback_text ||
    response.content.treatment?.action?.fallback_text ||
    response.content.monitoring_note?.fallback_text ||
    response.actions.options?.length ||
    response.actions.request_photo?.enabled
  );
}

export const UI_RESPONSE_BUILDER_VERSION = '1.0.0';
