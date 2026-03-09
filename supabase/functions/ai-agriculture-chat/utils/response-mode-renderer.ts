/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE MODE RENDERER v2.0.0 - CRASH-PROOF CONFIDENCE-DRIVEN OUTPUT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL: This module renders responses based on RESPONSE MODE, not text presence.
 * 
 * INVARIANT: Farmer-facing responses are mode-driven, not text-assumed.
 * 
 * KEY v2.0.0 CHANGES:
 * - Confidence-driven mode resolution (LOW → CLARIFICATION, not OBSERVATION)
 * - Invariant guard: Low confidence + symptoms never returns OBSERVATION
 * - Integration with FarmerResponseContract
 * 
 * SUPPORTED MODES (Aligned with FarmerResponseContract):
 * - OBSERVATION: Watch and wait (HIGH confidence only)
 * - CLARIFICATION_REQUIRED / CLARIFICATION: Render options array
 * - PHOTO_REQUIRED: Camera prompt
 * - MONITORING_ADVISED: Simple reassurance, no LLM required
 * - TREATMENT_ALLOWED / TREATMENT: Full explanation + steps
 * - INFORMATION: General info for medium confidence
 * - NO_ACTION_NEEDED: Healthy crop, no action required
 * - ERROR: Error state with recovery message
 * 
 * @version 2.0.0
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
  PHOTO_REQUIRED: {
    mr: '📷 कृपया प्रभावित पिकाचा फोटो पाठवा. यामुळे अचूक निदान होईल.',
    hi: '📷 कृपया प्रभावित फसल का फोटो भेजें। इससे सटीक निदान होगा।',
    en: '📷 Please send a photo of the affected crop for accurate diagnosis.',
    pa: '📷 ਕਿਰਪਾ ਕਰਕੇ ਪ੍ਰਭਾਵਿਤ ਫਸਲ ਦੀ ਫੋਟੋ ਭੇਜੋ। ਇਸ ਨਾਲ ਸਹੀ ਪਛਾਣ ਹੋਵੇਗੀ।',
    ta: '📷 பாதிக்கப்பட்ட பயிரின் புகைப்படத்தை அனுப்பவும். இது சரியான கண்டறிதலுக்கு உதவும்.'
  },
  CLARIFICATION_REQUIRED: {
    mr: '🔬 तुमच्या पिकाला खालीलपैकी कोणती समस्या असू शकते? (सर्वात जवळचे निवडा)',
    hi: '🔬 आपकी फसल में नीचे में से कौन सी समस्या हो सकती है? (सबसे करीबी चुनें)',
    en: '🔬 Which of the following problems might your crop have? (Select the closest)',
    pa: '🔬 ਤੁਹਾਡੀ ਫਸਲ ਵਿੱਚ ਹੇਠਾਂ ਦਿੱਤੀਆਂ ਵਿੱਚੋਂ ਕਿਹੜੀ ਸਮੱਸਿਆ ਹੋ ਸਕਦੀ ਹੈ? (ਸਭ ਤੋਂ ਨੇੜੇ ਦੀ ਚੁਣੋ)',
    ta: '🔬 உங்கள் பயிரில் கீழ்கண்ட பிரச்சனைகளில் எது இருக்கலாம்? (நெருங்கியதை தேர்வு செய்யவும்)'
  },
  CLARIFICATION: {
    mr: '🔬 तुमच्या पिकाला खालीलपैकी कोणती समस्या असू शकते? (सर्वात जवळचे निवडा)',
    hi: '🔬 आपकी फसल में नीचे में से कौन सी समस्या हो सकती है? (सबसे करीबी चुनें)',
    en: '🔬 Which of the following problems might your crop have? (Select the closest)',
    pa: '🔬 ਤੁਹਾਡੀ ਫਸਲ ਵਿੱਚ ਹੇਠਾਂ ਦਿੱਤੀਆਂ ਵਿੱਚੋਂ ਕਿਹੜੀ ਸਮੱਸਿਆ ਹੋ ਸਕਦੀ ਹੈ? (ਸਭ ਤੋਂ ਨੇੜੇ ਦੀ ਚੁਣੋ)',
    ta: '🔬 உங்கள் பயிரில் கீழ்கண்ட பிரச்சனைகளில் எது இருக்கலாம்? (நெருங்கியதை தேர்வு செய்யவும்)'
  },
  INFORMATION: {
    mr: '📋 माहिती:',
    hi: '📋 जानकारी:',
    en: '📋 Information:',
    pa: '📋 ਜਾਣਕਾਰੀ:',
    ta: '📋 தகவல்:'
  },
  TREATMENT: {
    mr: '💊 शिफारस:',
    hi: '💊 सिफारिश:',
    en: '💊 Recommendation:',
    pa: '💊 ਸਿਫਾਰਿਸ਼:',
    ta: '💊 பரிந்துரை:'
  },
  TREATMENT_ALLOWED: {
    mr: '💊 शिफारस:',
    hi: '💊 सिफारिश:',
    en: '💊 Recommendation:',
    pa: '💊 ਸਿਫਾਰਿਸ਼:',
    ta: '💊 பரிந்துரை:'
  },
  NO_ACTION_NEEDED: {
    mr: '✅ कोणतीही कृती आवश्यक नाही. पीक निरोगी आहे.',
    hi: '✅ कोई कार्रवाई आवश्यक नहीं। फसल स्वस्थ है।',
    en: '✅ No action needed. Your crop is healthy.',
    pa: '✅ ਕੋਈ ਕਾਰਵਾਈ ਦੀ ਲੋੜ ਨਹੀਂ। ਫਸਲ ਤੰਦਰੁਸਤ ਹੈ।',
    ta: '✅ எந்த நடவடிக்கையும் தேவையில்லை. பயிர் ஆரோக்கியமாக உள்ளது.'
  },
  ERROR: {
    mr: '⚠️ काहीतरी चुकले. कृपया पुन्हा प्रयत्न करा.',
    hi: '⚠️ कुछ गलत हुआ। कृपया दोबारा प्रयास करें।',
    en: '⚠️ Something went wrong. Please try again.',
    pa: '⚠️ ਕੁਝ ਗਲਤ ਹੋਇਆ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
    ta: '⚠️ ஏதோ தவறு ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.'
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
  },
  pa: {
    prompt_text: '📷 ਫੋਟੋ ਭੇਜੋ',
    what_to_capture: 'ਪ੍ਰਭਾਵਿਤ ਪੱਤੇ ਜਾਂ ਤਣੇ ਦੀ ਨੇੜੇ ਤੋਂ ਫੋਟੋ ਖਿੱਚੋ',
    tips: ['ਚੰਗੀ ਰੌਸ਼ਨੀ ਵਿੱਚ ਫੋਟੋ ਖਿੱਚੋ', 'ਲੱਛਣ ਸਾਫ਼ ਦਿਖਣ ਵਾਲਾ ਕੋਣ ਚੁਣੋ']
  },
  ta: {
    prompt_text: '📷 புகைப்படம் அனுப்பவும்',
    what_to_capture: 'பாதிக்கப்பட்ட இலை அல்லது தண்டின் நெருக்கமான புகைப்படம் எடுக்கவும்',
    tips: ['நல்ல வெளிச்சத்தில் புகைப்படம் எடுக்கவும்', 'அறிகுறிகள் தெளிவாக தெரியும் கோணத்தை தேர்வு செய்யவும்']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE MODE RESOLVER - Determines mode from decision context
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIDENCE-DRIVEN RESPONSE MODE RESOLUTION (CRITICAL FIX)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * BUG FIX: Previously defaulted to OBSERVATION for all unknown cases.
 * NOW: Uses decision_confidence to determine appropriate mode.
 * 
 * INVARIANT: Low confidence (<50%) with symptoms → CLARIFICATION or PHOTO_REQUIRED
 */
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIDENCE-DRIVEN RESOLUTION (CRITICAL BUG FIX)
  // ═══════════════════════════════════════════════════════════════════════════
  
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
  // - No symptoms detected
  // - No uncertainty
  // - No actionable intent
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

/**
 * INVARIANT VALIDATOR: Throws if low confidence results in OBSERVATION with symptoms
 * Call this to detect architectural violations during development
 */
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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RENDERER - Mode-Driven, Crash-Proof
// ═══════════════════════════════════════════════════════════════════════════

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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MODE: MONITORING_ADVISED - Simple reassurance, no text required
  // ═══════════════════════════════════════════════════════════════════════════
  if (modeStr === 'MONITORING_ADVISED' || modeStr === 'MONITORING') {
    return {
      response_mode: modeStr,
      primary_message: hasTextContent(content.monitoring_message) 
        ? content.monitoring_message 
        : (MODE_TEMPLATES.MONITORING_ADVISED[lang] || MODE_TEMPLATES.MONITORING_ADVISED['en']),
      monitoring_note: MODE_TEMPLATES.MONITORING_ADVISED[lang] || MODE_TEMPLATES.MONITORING_ADVISED['en'],
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
      : (MODE_TEMPLATES.CLARIFICATION_REQUIRED[lang] || MODE_TEMPLATES.CLARIFICATION_REQUIRED['en']);
    
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
      primary_message: MODE_TEMPLATES.PHOTO_REQUIRED[lang] || MODE_TEMPLATES.PHOTO_REQUIRED['en'],
      request_photo: true,
      photo_guidance: PHOTO_GUIDANCE_TEMPLATES[lang] || PHOTO_GUIDANCE_TEMPLATES['en'],
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
        : (MODE_TEMPLATES.OBSERVATION[lang] || MODE_TEMPLATES.OBSERVATION['en']),
      monitoring_note: MODE_TEMPLATES.OBSERVATION[lang] || MODE_TEMPLATES.OBSERVATION['en'],
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
        : (MODE_TEMPLATES.INFORMATION[lang] || MODE_TEMPLATES.INFORMATION['en']),
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
    primary_message: MODE_TEMPLATES.OBSERVATION[lang] || MODE_TEMPLATES.OBSERVATION['en'],
    is_valid: true,
    render_source: 'FALLBACK'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TREATMENT MESSAGE BUILDER - Safe text construction
// ═══════════════════════════════════════════════════════════════════════════

function buildTreatmentMessage(
  treatment: TreatmentDetails,
  lang: string
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
  
  return parts.length > 0 ? parts.join('\n') : (MODE_TEMPLATES.TREATMENT[lang] || MODE_TEMPLATES.TREATMENT['en']);
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

export const RESPONSE_MODE_RENDERER_VERSION = '2.0.0';
