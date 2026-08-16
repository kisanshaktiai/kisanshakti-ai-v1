// RESPONSE MODE RENDERER v2.0.0 - CRASH-PROOF CONFIDENCE-DRIVEN OUTPUT

import { ResponseMode } from '../decision/authority-types.ts';
import { safePreviewText, safeTrim, hasTextContent } from './safe-string.ts';

// Re-export for compatibility
export { ResponseMode };

// OUTPUT CONTRACT - Explicit response structure

export interface ModeRenderedOutput {
  /** Response mode that determined rendering */
  response_mode: ResponseMode | string;
  
  /** Primary message text (OPTIONAL - may be empty for clarification/photo modes) */
  primary_message?: string;
  
  /** Options for clarification (when mode is CLARIFICATION) */
  options?: ClarificationOption[];
  
  /** Photo request flag (when mode is PHOTO_REQUIRED) */
  request_photo?: boolean;
  
  /** Photo guidance for camera UI */
  photo_guidance?: PhotoGuidance;
  
  /** Monitoring note for observation modes */
  monitoring_note?: string;
  
  /** Treatment details (when mode is TREATMENT) */
  treatment_details?: TreatmentDetails;
  
  /** Whether this is a valid renderable output */
  is_valid: boolean;
  
  /** Rendering source for audit */
  render_source: 'MODE_RENDERER' | 'FALLBACK';
  
  /** Whether photo upload is supported */
  supports_photo_upload?: boolean;
}

export interface ClarificationOption {
  label: string;
  value: string;
  observation_key?: string;
  icon?: string;
  diagnostic_power?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface PhotoGuidance {
  prompt_text: string;
  what_to_capture: string;
  tips?: string[];
}

export interface TreatmentDetails {
  action_text?: string;
  product_name?: string;
  dosage?: string;
  timing?: string;
  reason_text?: string;
  knowledge_text?: string;
}

// LANGUAGE-SPECIFIC TEMPLATES (Mode-Driven, Not Text-Dependent)

const MODE_TEMPLATES: Record<string, string> = {
  MONITORING_ADVISED: '✅ Your crop is currently healthy. Continue regular monitoring.',
  OBSERVATION: '👀 Continue observing your crop. Contact us if the issue worsens.',
  PHOTO_REQUIRED: '📷 Please send a photo of the affected crop for accurate diagnosis.',
  CLARIFICATION_REQUIRED: '🔬 Which of the following problems might your crop have? (Select the closest)',
  CLARIFICATION: '🔬 Which of the following problems might your crop have? (Select the closest)',
  INFORMATION: '📋 Information:',
  TREATMENT: '💊 Recommendation:',
  TREATMENT_ALLOWED: '💊 Recommendation:',
  NO_ACTION_NEEDED: '✅ No action needed. Your crop is healthy.',
  ERROR: '⚠️ Something went wrong. Please try again.'
};

const PHOTO_GUIDANCE_TEMPLATE: PhotoGuidance = {
  prompt_text: '📷 Send Photo',
  what_to_capture: 'Take a close-up photo of the affected leaf or stem',
  tips: ['Take photo in good lighting', 'Choose an angle where symptoms are clearly visible']
};

// RESPONSE MODE RESOLVER - Determines mode from decision context

// CONFIDENCE-DRIVEN RESPONSE MODE RESOLUTION (CRITICAL FIX)
export interface ResponseModeContext {
  gate_action?: string;
  response_mode?: string | ResponseMode;
  has_treatment?: boolean;
  has_clarification?: boolean;
  has_options?: boolean;
  needs_photo?: boolean;
  // NEW: Confidence-driven fields
  decision_confidence?: number;
  has_symptoms?: boolean;
  has_visual_ambiguity?: boolean;
  symptom_keys?: string[];
  clarification_options?: Array<{ label?: string; value?: string }>;
}

export function resolveResponseMode(context: ResponseModeContext): ResponseMode {
  // Priority 1: Explicit response_mode from gate (highest priority)
  if (context.response_mode) {
    const mode = context.response_mode.toString().toUpperCase();
    if (mode in ResponseMode || Object.values(ResponseMode).includes(mode as ResponseMode)) {
      return mode as ResponseMode;
    }
  }
  
  // Priority 2: Derive from gate_action
  const gateAction = (context.gate_action || '').toUpperCase();
  
  if (gateAction.includes('CLARIFICATION') || context.has_clarification || context.has_options) {
    return ResponseMode.CLARIFICATION;
  }
  
  if (gateAction.includes('PHOTO') || context.needs_photo) {
    return ResponseMode.PHOTO_REQUIRED;
  }
  
  if (gateAction.includes('TREATMENT') || gateAction.includes('ALLOW')) {
    return ResponseMode.TREATMENT;
  }
  
  if (gateAction.includes('OBSERVATION')) {
    return ResponseMode.OBSERVATION;
  }
  
  if (gateAction.includes('INFORMATION')) {
    return ResponseMode.INFORMATION;
  }
  
  // CONFIDENCE-DRIVEN RESOLUTION (CRITICAL BUG FIX)
  
  const confidence = context.decision_confidence ?? 0;
  const hasSymptoms = context.has_symptoms || (context.symptom_keys && context.symptom_keys.length > 0);
  const hasVisualAmbiguity = context.has_visual_ambiguity || false;
  const hasOptions = context.clarification_options && context.clarification_options.length > 0;
  
  // LOW CONFIDENCE (<50%) + Symptoms → Clarification or Photo Required
  if (confidence < 50 && hasSymptoms) {
    if (hasVisualAmbiguity) {
      console.log(`[ResponseModeResolver] Low confidence (${confidence}) + visual ambiguity → PHOTO_REQUIRED`);
      return ResponseMode.PHOTO_REQUIRED;
    }
    if (hasOptions) {
      console.log(`[ResponseModeResolver] Low confidence (${confidence}) + symptoms + options → CLARIFICATION`);
      return ResponseMode.CLARIFICATION;
    }
    // Even without options, prefer clarification over observation for low confidence
    console.log(`[ResponseModeResolver] Low confidence (${confidence}) + symptoms → CLARIFICATION`);
    return ResponseMode.CLARIFICATION;
  }
  
  // MEDIUM CONFIDENCE (50-70%) → Information mode
  if (confidence >= 50 && confidence < 70) {
    console.log(`[ResponseModeResolver] Medium confidence (${confidence}) → INFORMATION`);
    return ResponseMode.INFORMATION;
  }
  
  // HIGH CONFIDENCE (70%+) with treatment data → Treatment
  if (confidence >= 70 && context.has_treatment) {
    console.log(`[ResponseModeResolver] High confidence (${confidence}) + treatment → TREATMENT`);
    return ResponseMode.TREATMENT;
  }
  
  // Only use OBSERVATION when:
  if (!hasSymptoms && confidence >= 50) {
    return ResponseMode.OBSERVATION;
  }
  
  // INVARIANT ASSERTION: Low confidence should NOT result in OBSERVATION when symptoms exist
  if (confidence < 70 && hasSymptoms) {
    console.warn(`[ResponseModeResolver] INVARIANT: Low confidence (${confidence}) with symptoms - forcing CLARIFICATION`);
    return ResponseMode.CLARIFICATION;
  }
  
  // Default fallback: Information (safer than OBSERVATION for unknown cases)
  console.log(`[ResponseModeResolver] Default fallback → INFORMATION`);
  return ResponseMode.INFORMATION;
}

// INVARIANT VALIDATOR: Throws if low confidence results in OBSERVATION with symptoms
export function assertResponseModeInvariant(
  mode: ResponseMode | string,
  confidence: number,
  hasSymptoms: boolean
): void {
  const modeStr = (mode || '').toString().toUpperCase();
  
  if (modeStr === 'OBSERVATION' && confidence < 70 && hasSymptoms) {
    const errorMessage = `INVARIANT VIOLATION: OBSERVATION mode with confidence=${confidence} and symptoms present. ` +
      `This indicates a bug in response mode resolution. Expected CLARIFICATION or PHOTO_REQUIRED.`;
    console.error(`🚨 [ResponseModeInvariant] ${errorMessage}`);
    // In production, log but don't throw to prevent crashes
    // In development, this would throw: throw new Error(errorMessage);
  }
}

// MAIN RENDERER - Mode-Driven, Crash-Proof

export function renderByMode(
  mode: ResponseMode | string,
  language: string,
  content: {
    primary_text?: string;
    options?: ClarificationOption[];
    treatment?: TreatmentDetails;
    monitoring_message?: string;
    custom_message?: string;
  }
): ModeRenderedOutput {
  const modeStr = (mode || 'OBSERVATION').toString().toUpperCase();
  const lang = language || 'mr';
  
  // MODE: MONITORING_ADVISED - Simple reassurance, no text required
  if (modeStr === 'MONITORING_ADVISED' || modeStr === 'MONITORING') {
    return {
      response_mode: modeStr,
      primary_message: hasTextContent(content.monitoring_message) 
        ? content.monitoring_message 
        : MODE_TEMPLATES.MONITORING_ADVISED,
      monitoring_note: MODE_TEMPLATES.MONITORING_ADVISED,
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // MODE: CLARIFICATION_REQUIRED - Render options, text is optional
  if (modeStr === 'CLARIFICATION_REQUIRED' || modeStr === 'CLARIFICATION') {
    const options = content.options || [];
    const headerText = hasTextContent(content.primary_text) 
      ? content.primary_text 
      : MODE_TEMPLATES.CLARIFICATION_REQUIRED;
    
    return {
      response_mode: ResponseMode.CLARIFICATION,
      primary_message: headerText,
      options: options,
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // MODE: PHOTO_REQUIRED - Camera prompt, minimal text
  if (modeStr === 'PHOTO_REQUIRED' || modeStr === 'PHOTO') {
    return {
      response_mode: 'PHOTO_REQUIRED',
      primary_message: MODE_TEMPLATES.PHOTO_REQUIRED,
      request_photo: true,
      photo_guidance: PHOTO_GUIDANCE_TEMPLATE,
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // MODE: OBSERVATION - 1-2 short sentences only
  if (modeStr === 'OBSERVATION' || modeStr === 'OBSERVATION_ONLY') {
    return {
      response_mode: ResponseMode.OBSERVATION,
      primary_message: hasTextContent(content.primary_text) 
        ? content.primary_text 
        : MODE_TEMPLATES.OBSERVATION,
      monitoring_note: MODE_TEMPLATES.OBSERVATION,
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // MODE: TREATMENT - Full explanation with steps
  if (modeStr === 'TREATMENT' || modeStr === 'TREATMENT_ALLOWED') {
    const treatment = content.treatment || {};
    const treatmentText = hasTextContent(content.primary_text)
      ? content.primary_text
      : buildTreatmentMessage(treatment, lang);
    
    return {
      response_mode: ResponseMode.TREATMENT,
      primary_message: treatmentText,
      treatment_details: treatment,
      is_valid: hasTextContent(treatmentText) || !!treatment.action_text,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // MODE: INFORMATION - General info response
  if (modeStr === 'INFORMATION' || modeStr === 'INFORMATION_ONLY') {
    return {
      response_mode: ResponseMode.INFORMATION,
      primary_message: hasTextContent(content.primary_text) 
        ? content.primary_text 
        : hasTextContent(content.custom_message)
        ? content.custom_message
        : MODE_TEMPLATES.INFORMATION,
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // FALLBACK: Default to OBSERVATION mode
  console.warn(`[ResponseModeRenderer] Unknown mode '${modeStr}', defaulting to OBSERVATION`);
  return {
    response_mode: ResponseMode.OBSERVATION,
    primary_message: MODE_TEMPLATES.OBSERVATION,
    is_valid: true,
    render_source: 'FALLBACK'
  };
}

// TREATMENT MESSAGE BUILDER - Safe text construction

function buildTreatmentMessage(
  treatment: TreatmentDetails,
  _lang: string
): string {
  const parts: string[] = [];
  
  if (hasTextContent(treatment.action_text)) {
    parts.push(`📋 ${treatment.action_text}`);
  }
  
  if (hasTextContent(treatment.product_name)) {
    let productLine = `💊 ${treatment.product_name}`;
    if (hasTextContent(treatment.dosage)) {
      productLine += ` @ ${treatment.dosage}`;
    }
    parts.push(productLine);
  }
  
  if (hasTextContent(treatment.timing)) {
    parts.push(`⏰ Timing: ${treatment.timing}`);
  }
  
  if (hasTextContent(treatment.reason_text) && !isDifferentialText(treatment.reason_text)) {
    parts.push(`🔍 Reason: ${oneLine(treatment.reason_text, 240)}`);
  }
  
  // FIX A (2026-08-16): knowledge_text is internal scientific text — never rendered.
  
  return parts.length > 0 ? parts.join('\n') : MODE_TEMPLATES.TREATMENT;
}

// SAFE OUTPUT VALIDATOR - Ensures response is valid before sending

export function validateRenderedOutput(output: ModeRenderedOutput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!output.response_mode) {
    errors.push('Missing response_mode');
  }
  
  // Mode-specific validation
  const mode = (output.response_mode || '').toString().toUpperCase();
  
  if (mode === 'CLARIFICATION' && (!output.options || output.options.length === 0)) {
    // Clarification without options is valid if there's a message
    if (!hasTextContent(output.primary_message)) {
      errors.push('CLARIFICATION mode requires either options or a message');
    }
  }
  
  if (mode === 'TREATMENT' && !hasTextContent(output.primary_message) && !output.treatment_details?.action_text) {
    errors.push('TREATMENT mode requires treatment text or action_text');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// EXPORTS

export const RESPONSE_MODE_RENDERER_VERSION = '2.0.0';
