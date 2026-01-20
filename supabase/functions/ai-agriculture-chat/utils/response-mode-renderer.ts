/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE MODE RENDERER v1.1.0 - CRASH-PROOF OUTPUT SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This module renders responses based on RESPONSE MODE, not text presence.
 * 
 * INVARIANT: Farmer-facing responses are mode-driven, not text-assumed.
 * 
 * SUPPORTED MODES (Aligned with UI Response Contract):
 * - OBSERVATION: 1-2 short sentences only
 * - CLARIFICATION_REQUIRED / CLARIFICATION: Render options array, no text required
 * - PHOTO_REQUIRED: Camera prompt
 * - MONITORING_ADVISED: Simple reassurance, no LLM required
 * - TREATMENT_ALLOWED / TREATMENT: Full explanation + steps
 * - NO_ACTION_NEEDED: Healthy crop, no action required
 * - INFORMATION: General information response
 * - ERROR: Error state with recovery message
 * 
 * @version 1.1.0
 */

import { ResponseMode } from '../decision/authority-types.ts';
import { safePreviewText, safeTrim, hasTextContent } from './safe-string.ts';

// Re-export for compatibility
export { ResponseMode };

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT CONTRACT - Explicit response structure
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE-SPECIFIC TEMPLATES (Mode-Driven, Not Text-Dependent)
// ═══════════════════════════════════════════════════════════════════════════

const MODE_TEMPLATES: Record<string, Record<string, string>> = {
  MONITORING_ADVISED: {
    mr: '✅ सध्या तुमचे पीक चांगले आहे. नियमित निरीक्षण करा.',
    hi: '✅ अभी आपकी फसल ठीक है। नियमित निगरानी करें।',
    en: '✅ Your crop is currently healthy. Continue regular monitoring.'
  },
  OBSERVATION: {
    mr: '👀 पिकाचे निरीक्षण करत रहा. समस्या वाढल्यास पुन्हा संपर्क करा.',
    hi: '👀 फसल की निगरानी जारी रखें। समस्या बढ़े तो संपर्क करें।',
    en: '👀 Continue observing your crop. Contact us if the issue worsens.'
  },
  PHOTO_REQUIRED: {
    mr: '📷 कृपया प्रभावित पिकाचा फोटो पाठवा. यामुळे अचूक निदान होईल.',
    hi: '📷 कृपया प्रभावित फसल का फोटो भेजें। इससे सटीक निदान होगा।',
    en: '📷 Please send a photo of the affected crop for accurate diagnosis.'
  },
  CLARIFICATION_REQUIRED: {
    mr: '❓ कृपया खालीलपैकी एक निवडा:',
    hi: '❓ कृपया नीचे से एक चुनें:',
    en: '❓ Please select one of the following:'
  },
  CLARIFICATION: {
    mr: '❓ कृपया खालीलपैकी एक निवडा:',
    hi: '❓ कृपया नीचे से एक चुनें:',
    en: '❓ Please select one of the following:'
  },
  INFORMATION: {
    mr: '📋 माहिती:',
    hi: '📋 जानकारी:',
    en: '📋 Information:'
  },
  TREATMENT: {
    mr: '💊 शिफारस:',
    hi: '💊 सिफारिश:',
    en: '💊 Recommendation:'
  },
  TREATMENT_ALLOWED: {
    mr: '💊 शिफारस:',
    hi: '💊 सिफारिश:',
    en: '💊 Recommendation:'
  },
  NO_ACTION_NEEDED: {
    mr: '✅ कोणतीही कृती आवश्यक नाही. पीक निरोगी आहे.',
    hi: '✅ कोई कार्रवाई आवश्यक नहीं। फसल स्वस्थ है।',
    en: '✅ No action needed. Your crop is healthy.'
  },
  ERROR: {
    mr: '⚠️ काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.',
    hi: '⚠️ कुछ गलत हुआ। कृपया दोबारा प्रयास करें।',
    en: '⚠️ Something went wrong. Please try again.'
  }
};

const PHOTO_GUIDANCE_TEMPLATES: Record<string, PhotoGuidance> = {
  mr: {
    prompt_text: '📷 फोटो पाठवा',
    what_to_capture: 'प्रभावित पान किंवा खोडाचा जवळून फोटो घ्या',
    tips: ['चांगला प्रकाश असलेल्या ठिकाणी फोटो घ्या', 'लक्षणे स्पष्ट दिसतील असा कोन निवडा']
  },
  hi: {
    prompt_text: '📷 फोटो भेजें',
    what_to_capture: 'प्रभावित पत्ते या तने का करीब से फोटो लें',
    tips: ['अच्छी रोशनी में फोटो लें', 'लक्षण स्पष्ट दिखे ऐसा कोण चुनें']
  },
  en: {
    prompt_text: '📷 Send Photo',
    what_to_capture: 'Take a close-up photo of the affected leaf or stem',
    tips: ['Take photo in good lighting', 'Choose an angle where symptoms are clearly visible']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE MODE RESOLVER - Determines mode from decision context
// ═══════════════════════════════════════════════════════════════════════════

export function resolveResponseMode(context: {
  gate_action?: string;
  response_mode?: string | ResponseMode;
  has_treatment?: boolean;
  has_clarification?: boolean;
  has_options?: boolean;
  needs_photo?: boolean;
}): ResponseMode {
  // Priority 1: Explicit response_mode from gate
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
    return ResponseMode.CLARIFICATION; // Photo requests are a form of clarification
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
  
  // Default: OBSERVATION (safe fallback)
  return ResponseMode.OBSERVATION;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDERER - Mode-Driven, Crash-Proof
// ═══════════════════════════════════════════════════════════════════════════

export function renderByMode(
  mode: ResponseMode | string,
  language: 'mr' | 'hi' | 'en',
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: MONITORING_ADVISED - Simple reassurance, no text required
  // ═══════════════════════════════════════════════════════════════════════════
  if (modeStr === 'MONITORING_ADVISED' || modeStr === 'MONITORING') {
    return {
      response_mode: modeStr,
      primary_message: hasTextContent(content.monitoring_message) 
        ? content.monitoring_message 
        : MODE_TEMPLATES.MONITORING_ADVISED[lang],
      monitoring_note: MODE_TEMPLATES.MONITORING_ADVISED[lang],
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: CLARIFICATION_REQUIRED - Render options, text is optional
  // ═══════════════════════════════════════════════════════════════════════════
  if (modeStr === 'CLARIFICATION_REQUIRED' || modeStr === 'CLARIFICATION') {
    const options = content.options || [];
    const headerText = hasTextContent(content.primary_text) 
      ? content.primary_text 
      : MODE_TEMPLATES.CLARIFICATION_REQUIRED[lang];
    
    return {
      response_mode: ResponseMode.CLARIFICATION,
      primary_message: headerText,
      options: options,
      is_valid: true, // Valid even without text if options exist
      render_source: 'MODE_RENDERER'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: PHOTO_REQUIRED - Camera prompt, minimal text
  // ═══════════════════════════════════════════════════════════════════════════
  if (modeStr === 'PHOTO_REQUIRED' || modeStr === 'PHOTO') {
    return {
      response_mode: 'PHOTO_REQUIRED',
      primary_message: MODE_TEMPLATES.PHOTO_REQUIRED[lang],
      request_photo: true,
      photo_guidance: PHOTO_GUIDANCE_TEMPLATES[lang],
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: OBSERVATION - 1-2 short sentences only
  // ═══════════════════════════════════════════════════════════════════════════
  if (modeStr === 'OBSERVATION' || modeStr === 'OBSERVATION_ONLY') {
    return {
      response_mode: ResponseMode.OBSERVATION,
      primary_message: hasTextContent(content.primary_text) 
        ? content.primary_text 
        : MODE_TEMPLATES.OBSERVATION[lang],
      monitoring_note: MODE_TEMPLATES.OBSERVATION[lang],
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: TREATMENT - Full explanation with steps
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: INFORMATION - General info response
  // ═══════════════════════════════════════════════════════════════════════════
  if (modeStr === 'INFORMATION' || modeStr === 'INFORMATION_ONLY') {
    return {
      response_mode: ResponseMode.INFORMATION,
      primary_message: hasTextContent(content.primary_text) 
        ? content.primary_text 
        : hasTextContent(content.custom_message)
        ? content.custom_message
        : MODE_TEMPLATES.INFORMATION[lang],
      is_valid: true,
      render_source: 'MODE_RENDERER'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK: Default to OBSERVATION mode
  // ═══════════════════════════════════════════════════════════════════════════
  console.warn(`[ResponseModeRenderer] Unknown mode '${modeStr}', defaulting to OBSERVATION`);
  return {
    response_mode: ResponseMode.OBSERVATION,
    primary_message: MODE_TEMPLATES.OBSERVATION[lang],
    is_valid: true,
    render_source: 'FALLBACK'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT MESSAGE BUILDER - Safe text construction
// ═══════════════════════════════════════════════════════════════════════════

function buildTreatmentMessage(
  treatment: TreatmentDetails,
  lang: 'mr' | 'hi' | 'en'
): string {
  const parts: string[] = [];
  
  // Action text (primary)
  if (hasTextContent(treatment.action_text)) {
    parts.push(`📋 ${treatment.action_text}`);
  }
  
  // Product + Dosage
  if (hasTextContent(treatment.product_name)) {
    let productLine = `💊 ${treatment.product_name}`;
    if (hasTextContent(treatment.dosage)) {
      productLine += ` @ ${treatment.dosage}`;
    }
    parts.push(productLine);
  }
  
  // Timing
  if (hasTextContent(treatment.timing)) {
    const timingLabels: Record<string, string> = {
      mr: '⏰ वेळ:',
      hi: '⏰ समय:',
      en: '⏰ Timing:'
    };
    parts.push(`${timingLabels[lang]} ${treatment.timing}`);
  }
  
  // Reason
  if (hasTextContent(treatment.reason_text)) {
    const reasonLabels: Record<string, string> = {
      mr: '🔍 कारण:',
      hi: '🔍 कारण:',
      en: '🔍 Reason:'
    };
    parts.push(`${reasonLabels[lang]} ${treatment.reason_text}`);
  }
  
  // Scientific basis
  if (hasTextContent(treatment.knowledge_text)) {
    const knowledgeLabels: Record<string, string> = {
      mr: '📚 आधार:',
      hi: '📚 आधार:',
      en: '📚 Scientific basis:'
    };
    parts.push(`${knowledgeLabels[lang]} ${treatment.knowledge_text}`);
  }
  
  return parts.length > 0 ? parts.join('\n') : MODE_TEMPLATES.TREATMENT[lang];
}

// ═══════════════════════════════════════════════════════════════════════════
// SAFE OUTPUT VALIDATOR - Ensures response is valid before sending
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const RESPONSE_MODE_RENDERER_VERSION = '1.0.0';
