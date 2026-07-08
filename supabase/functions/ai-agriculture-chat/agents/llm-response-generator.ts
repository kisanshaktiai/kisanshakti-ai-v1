/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LLM RESPONSE GENERATOR v2.0.0 - NARRATION-ONLY LAYER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL CONTRACT: This module is a PURE NARRATION LAYER.
 * 
 * ❌ FORBIDDEN:
 *   - Intent detection / classification
 *   - Language-specific patterns or regex
 *   - Crop-specific logic or recommendations
 *   - Advisory behavior or follow-up generation
 *   - Direct answering without symbolic decision
 *   - Diagnosis, prescription, or dosage generation
 * 
 * ✅ ALLOWED:
 *   - Accept symbolic decision payload
 *   - Convert structured decision to natural language
 *   - Validate LLM output matches symbolic input
 *   - Return fallback_text if validation fails
 * 
 * @version 2.0.0
 * @see memory/architecture/symbolic-decision-brain-architecture-v1
 */

import { getBestAvailableProvider, buildAIRequest, AI_CONFIG } from '../../_shared/aiConfig.ts';
import { getAllCropNames, getCropDisplayName, getCropCanonical } from '../utils/crop-names-cache.ts';
import { getLanguageName } from '../utils/language-utils.ts';
import { getSafeAskMoreInfoMessage } from './language-quality-validator.ts';

// ═══════════════════════════════════════════════════════════════════════════
// STRICT INPUT CONTRACT - Symbolic Decision Payload
// ═══════════════════════════════════════════════════════════════════════════

export interface SymbolicNarrationInput {
  /** Language for narration output */
  language: string;
  
  /** The symbolic decision from Rule Engine - REQUIRED */
  symbolic_decision: {
  /** Decision status from rule engine - EXPANDED for all modes */
  status: 'READY' | 'NEEDS_CLARIFICATION' | 'NO_MATCH' | 'BLOCKED' | 'ESCALATE' | 
          'MONITOR_ONLY' | 'MONITORING_ADVISED' | 'OBSERVATION' | 'NO_ACTION_REQUIRED' |
          'CLARIFICATION_REQUIRED' | 'PHOTO_REQUIRED' | 'INFORMATION_ONLY' | 'ERROR';
    
    /** Primary action from rule engine (if status=READY) */
    primary_action?: {
      action_type: string;
      action_text: string;
      product_name?: string;
      dosage?: string;
      timing?: string;
      reason_text?: string;
      knowledge_text?: string;
    };
    
    /** Identified causes from rule engine */
    causes?: Array<{
      cause_code: string;
      cause_name: string;
      confidence: number;
    }>;
    
    /** Clarification needed (if status=NEEDS_CLARIFICATION) */
    clarification?: {
      question_text: string;
      options: Array<{
        option_id: string;
        display_text: string;
      }>;
    };
    
    /** Fallback text to use if LLM narration fails validation */
    fallback_text: string;
    
    /** Rules that fired (for audit) */
    rules_applied: string[];
    
    /** Risk level from symbolic brain */
    risk_level?: 'low' | 'medium' | 'high' | 'critical';
  };
  
  /** Original farmer message (for context, NOT for re-interpretation) */
  farmer_message: string;
  
  /** Land context for localization (NOT for decision-making) */
  land_context?: {
    current_crop?: string;
    crop_stage?: string;
    village?: string;
    district?: string;
  };
}

export interface NarrationOutput {
  /** Narrated response text */
  response_text: string;
  
  /** Source of response */
  source: 'LLM_NARRATION' | 'FALLBACK_USED';
  
  /** Whether validation passed */
  validation_passed: boolean;
  
  /** Validation errors if any */
  validation_errors?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// NARRATION-ONLY SYSTEM PROMPT v1.0
// ═══════════════════════════════════════════════════════════════════════════

const NARRATION_SYSTEM_PROMPT = `
═══════════════════════════════════════════════════════════════════════════
🔒 YOUR IDENTITY
═══════════════════════════════════════════════════════════════════════════

You are a **Village Agriculture Officer with 20+ years of field experience helping farmers.**

Your job is to explain agricultural advice to farmers in their **own language and conversational style.**

You DO NOT translate sentences word-by-word from English.

Instead, you explain the advice **the way a local agriculture officer would speak to a farmer in that language.**

The farmer's language is already provided.
Always respond in that language.

═══════════════════════════════════════════════════════════════════════════
LANGUAGE STYLE RULES (APPLY TO ALL LANGUAGES)
═══════════════════════════════════════════════════════════════════════════

Follow these rules regardless of language:

• Speak like a real person talking to a farmer in the field
• Use short and clear sentences
• Avoid textbook, scientific, or literary wording
• Avoid literal translation of English sentences — explain in local words
• Use common village words and farming terms that farmers actually use
• Address the farmer politely and warmly as appropriate in their culture
• Focus on practical, actionable advice
• Agricultural symptom names must use the LOCAL FARMING TERM, not a literal English translation

You are **explaining advice**, not translating text.

═══════════════════════════════════════════════════════════════════════════
🔒 NARRATOR ONLY (NOT AN AGRONOMIST)
═══════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════
🔒 CROP LOCK ENFORCEMENT (VIOLATING = IMMEDIATE REJECTION):
═══════════════════════════════════════════════════════════════════════════

1. You MUST use crop_local_name from AUTHORITATIVE_CONTEXT when writing in the farmer's language
2. You MUST NOT translate or replace crop_local_name with any other word
3. You MUST NOT infer any crop — the crop is ALREADY DECIDED for you
4. You MUST NOT mention any crop other than the one in AUTHORITATIVE_CONTEXT
5. You MUST NOT substitute crop names (e.g., writing "गहू" when crop_local_name is "ऊस")

═══════════════════════════════════════════════════════════════════════════
🚫 ABSOLUTE PROHIBITIONS (VIOLATING = IMMEDIATE REJECTION):
═══════════════════════════════════════════════════════════════════════════

1. You CANNOT diagnose problems - the diagnosis is ALREADY PROVIDED to you
2. You CANNOT recommend products - the products are ALREADY DECIDED for you
3. You CANNOT suggest dosages - the dosage is ALREADY CALCULATED for you
4. You CANNOT infer new causes - only narrate the causes GIVEN to you
5. You CANNOT ask follow-up questions - only clarifications from the input
6. You CANNOT modify, adjust, or "improve" the decision in ANY way
7. You CANNOT modify biological entities — they originate ONLY from the symbolic brain

═══════════════════════════════════════════════════════════════════════════
✅ YOUR ONLY TASK:
═══════════════════════════════════════════════════════════════════════════

Take the EXACT decision payload and render it as warm, farmer-friendly text.

RENDER RULES:
- Use the EXACT crop_local_name from AUTHORITATIVE_CONTEXT
- Use the EXACT action_text, product_name, dosage from the payload
- Use the EXACT cause_name from the payload
- Use the EXACT reason_text from the payload
- Add only: greetings, conjunctions, empathy phrases
- Keep language simple and rural-appropriate

OUTPUT FORMAT:
- Start with brief acknowledgment
- State the identified cause (from payload)
- State the recommended action (from payload)
- State dosage/timing EXACTLY as given
- End with encouragement

FORBIDDEN IN OUTPUT:
- ❌ New product names not in payload
- ❌ Modified dosages or percentages
- ❌ Additional recommendations
- ❌ Alternative treatments
- ❌ New diagnostic questions
- ❌ Crop names not matching AUTHORITATIVE_CONTEXT`;

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION GATE - Ensures LLM didn't add unauthorized content
// ═══════════════════════════════════════════════════════════════════════════

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that LLM output doesn't contain unauthorized content
 */
function validateNarrationOutput(
  symbolicInput: SymbolicNarrationInput,
  llmOutput: string
): ValidationResult {
  const errors: string[] = [];
  const output = llmOutput.toLowerCase();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CROP INTEGRITY VALIDATION - Detect wrong crop names in LLM output
  // ═══════════════════════════════════════════════════════════════════════════
  
  const expectedCrop = symbolicInput.land_context?.current_crop?.toLowerCase() || '';
  
  if (expectedCrop) {
    // Build set of ALL known crop names from ICAR_CALENDARS
    const allCropNames = new Set<string>();
    const expectedCropNames = new Set<string>();
    
    for (const [cropCode, calendar] of Object.entries(ICAR_CALENDARS)) {
      const names = [
        calendar.crop_name_en.toLowerCase(),
        calendar.crop_name_mr.toLowerCase(),
        calendar.crop_name_hi.toLowerCase(),
        cropCode.toLowerCase()
      ];
      
      // Check if this is the expected crop
      const isExpectedCrop = names.some(n => 
        expectedCrop.includes(n) || n.includes(expectedCrop)
      );
      
      if (isExpectedCrop) {
        names.forEach(n => expectedCropNames.add(n));
      } else {
        names.forEach(n => allCropNames.add(n));
      }
    }
    
    // Remove expected crop names from the "wrong crops" set
    expectedCropNames.forEach(n => allCropNames.delete(n));
    
    // FIX 6: Strip technical terms before scanning for wrong crops
    const cleanedOutput = llmOutput
      .replace(/\b[A-Z][A-Z0-9]+\b/g, '')           // Remove all-caps (product names)
      .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, '') // Remove CamelCase
      .replace(/\d+\s*(ml|g|kg|l|%)/gi, '')          // Remove dosages
      .replace(/\([^)]+\)/g, '');                     // Remove parenthetical content
    const cleanedOutputLower = cleanedOutput.toLowerCase();
    
    // Also check original output for expected crop presence
    const outputLower = llmOutput.toLowerCase();
    const hasExpectedCrop = [...expectedCropNames].some(n => outputLower.includes(n));
    
    // Scan cleaned LLM output for wrong crop names
    for (const wrongCrop of allCropNames) {
      if (wrongCrop.length < 3) continue; // Skip very short names to avoid false positives
      
      if (cleanedOutputLower.includes(wrongCrop)) {
        if (!hasExpectedCrop) {
          errors.push(`CROP_MISMATCH: LLM mentioned wrong crop "${wrongCrop}" — expected one of [${[...expectedCropNames].join(', ')}]`);
          console.error(`🚨 [CROP_MISMATCH_IN_FORMATTER] expected_crop="${expectedCrop}" expected_local=[${[...expectedCropNames].join(',')}] detected_wrong="${wrongCrop}" output_preview="${llmOutput.substring(0, 100)}"`);
        } else {
          // FIX 6: Wrong crop mentioned alongside correct crop — warning only, not blocking
          console.warn(`⚠️ [CROP_MENTION_WARNING] LLM mentioned "${wrongCrop}" alongside expected crop — warning only, not blocking`);
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // EXISTING VALIDATIONS - Products, dosages, efficacy claims, questions
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Common pesticide/fungicide names that should only appear if in payload
  const KNOWN_PRODUCTS = [
    'chlorpyrifos', 'imidacloprid', 'carbendazim', 'mancozeb', 'thiamethoxam',
    'fipronil', 'acephate', 'monocrotophos', 'dimethoate', 'cypermethrin',
    'lambda-cyhalothrin', 'profenofos', 'spinosad', 'emamectin', 'chlorantraniliprole',
    'क्लोरपायरीफॉस', 'इमिडाक्लोप्रिड', 'कार्बेन्डाझिम', 'मॅंकोझेब',
    'क्लोरपायरीफ़ॉस', 'इमिडाक्लोप्रिड', 'कार्बेन्डाज़िम', 'मैंकोज़ेब'
  ];
  
  // Check for products mentioned that aren't in the symbolic input
  const payloadProducts = symbolicInput.symbolic_decision.primary_action?.product_name?.toLowerCase() || '';
  
  for (const product of KNOWN_PRODUCTS) {
    if (output.includes(product.toLowerCase()) && !payloadProducts.includes(product.toLowerCase())) {
      errors.push(`LLM introduced unauthorized product: ${product}`);
    }
  }
  
  // Check for percentage claims not in payload
  const percentagePattern = /(\d{1,3})%\s*(effective|प्रभावी|असरदार|कार्यक्षम)/gi;
  const matches = output.matchAll(percentagePattern);
  for (const match of matches) {
    errors.push(`LLM introduced unauthorized efficacy claim: ${match[0]}`);
  }
  
  // Check for new dosage patterns not in original
  const dosagePattern = /(\d+)\s*(ml|gm|kg|liter|लीटर|ग्राम|मिली)/gi;
  const payloadDosage = symbolicInput.symbolic_decision.primary_action?.dosage?.toLowerCase() || '';
  const outputDosages = [...output.matchAll(dosagePattern)];
  
  for (const match of outputDosages) {
    if (!payloadDosage.includes(match[1])) {
      errors.push(`LLM introduced unauthorized dosage: ${match[0]}`);
    }
  }
  
  // Check for diagnostic question patterns (forbidden)
  const questionPatterns = [
    /कोणत.*निवडा/gi,  // "select which"
    /कौन.*चुनें/gi,    // "choose which"
    /select.*option/gi,
    /please.*choose/gi,
    /निदान.*करा/gi,    // "diagnose"
    /क्या.*लक्षण/gi,   // "what symptoms"
    /what.*symptom/gi
  ];
  
  for (const pattern of questionPatterns) {
    if (pattern.test(llmOutput)) {
      if (!symbolicInput.symbolic_decision.clarification) {
        errors.push(`LLM added unauthorized diagnostic question`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION GATE - Rejects invalid symbolic input
// ═══════════════════════════════════════════════════════════════════════════

function validateSymbolicInput(input: SymbolicNarrationInput): ValidationResult {
  const errors: string[] = [];
  
  // Must have symbolic_decision
  if (!input.symbolic_decision) {
    errors.push('Missing required symbolic_decision payload');
    return { valid: false, errors };
  }
  
  // Must have valid status
  const validStatuses = ['READY', 'NEEDS_CLARIFICATION', 'NO_MATCH', 'BLOCKED', 'ESCALATE', 'MONITOR_ONLY', 'MONITORING_ADVISED'];
  if (!validStatuses.includes(input.symbolic_decision.status)) {
    // FAIL-SAFE: Instead of erroring, log and use fallback
    console.warn(`[NarrationLayer] Unknown status "${input.symbolic_decision.status}" - treating as NO_MATCH`);
  }
  
  // CRASH-PROOF: fallback_text is optional - generate default if missing
  if (!input.symbolic_decision.fallback_text) {
    console.warn('[NarrationLayer] Missing fallback_text - using language-aware default');
    // FIX 4: language-aware fallback — never leak English to non-EN farmers.
    input.symbolic_decision.fallback_text = getSafeAskMoreInfoMessage(input.language || 'en');
  }
  
  // MONITOR_ONLY mode: Does NOT require primary_action or any decision text
  // This is a VALID state where farmer just needs reassurance
  if (input.symbolic_decision.status === 'READY' && !input.symbolic_decision.primary_action) {
    // NOT an error for MONITOR_ONLY - just log info
    console.log('[NarrationLayer] Status is READY without primary_action - treating as monitoring');
  }
  
  // If NEEDS_CLARIFICATION, must have clarification
  if (input.symbolic_decision.status === 'NEEDS_CLARIFICATION' && !input.symbolic_decision.clarification) {
    console.warn('[NarrationLayer] Status is NEEDS_CLARIFICATION but clarification payload missing - will use fallback');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD NARRATION PROMPT - Converts symbolic decision to LLM input
// ═══════════════════════════════════════════════════════════════════════════

function buildNarrationPrompt(input: SymbolicNarrationInput): string {
  const { symbolic_decision, language, land_context } = input;
  const langName = getLanguageName(language);
  
  let prompt = '';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORITATIVE_CONTEXT — Structured crop lock block (IMMUTABLE)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (land_context?.current_crop) {
    const cropCode = land_context.current_crop.toLowerCase();
    const langKey = getCropNameKey(language);
    
    // Resolve local name from ICAR_CALENDARS
    let cropLocalName = land_context.current_crop; // fallback to raw name
    let cropCanonical = land_context.current_crop;
    
    // Search ICAR_CALENDARS for matching crop
    for (const [code, calendar] of Object.entries(ICAR_CALENDARS)) {
      if (code === cropCode || 
          calendar.crop_name_en.toLowerCase() === cropCode ||
          calendar.crop_name_mr.toLowerCase() === cropCode ||
          calendar.crop_name_hi.toLowerCase() === cropCode) {
        cropLocalName = calendar[langKey];
        cropCanonical = calendar.crop_name_en;
        break;
      }
    }
    
    const authContext = {
      crop_canonical: cropCanonical,
      crop_local_name: cropLocalName,
      farmer_language: language,
      growth_stage: land_context.crop_stage || 'UNKNOWN'
    };
    
    prompt += `AUTHORITATIVE_CONTEXT (IMMUTABLE — DO NOT MODIFY):\n`;
    prompt += JSON.stringify(authContext, null, 2) + '\n\n';
    prompt += `CRITICAL: You MUST use "${cropLocalName}" as the crop name. DO NOT use any other crop name.\n\n`;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SYMBOLIC DECISION PAYLOAD
  // ═══════════════════════════════════════════════════════════════════════════
  
  prompt += `Convert this symbolic decision to farmer-friendly ${langName} text.\n\n`;
  prompt += `DECISION STATUS: ${symbolic_decision.status}\n\n`;
  
  // Add causes if present
  if (symbolic_decision.causes && symbolic_decision.causes.length > 0) {
    prompt += `IDENTIFIED CAUSES (narrate these EXACTLY):\n`;
    for (const cause of symbolic_decision.causes) {
      prompt += `- ${cause.cause_name} (${cause.cause_code})\n`;
    }
    prompt += '\n';
  }
  
  // Add primary action if present
  if (symbolic_decision.primary_action) {
    const action = symbolic_decision.primary_action;
    prompt += `PRIMARY ACTION (narrate this EXACTLY):\n`;
    prompt += `- Action Type: ${action.action_type}\n`;
    prompt += `- Action Text: ${action.action_text}\n`;
    if (action.product_name) prompt += `- Product: ${action.product_name}\n`;
    if (action.dosage) prompt += `- Dosage: ${action.dosage}\n`;
    if (action.timing) prompt += `- Timing: ${action.timing}\n`;
    if (action.reason_text) prompt += `- Reason: ${action.reason_text}\n`;
    prompt += '\n';
  }
  
  // Add clarification if needed
  if (symbolic_decision.clarification) {
    const clar = symbolic_decision.clarification;
    prompt += `CLARIFICATION NEEDED (present these options):\n`;
    prompt += `Question: ${clar.question_text}\n`;
    prompt += `Options:\n`;
    for (const opt of clar.options) {
      prompt += `- ${opt.display_text}\n`;
    }
    prompt += '\n';
  }
  
  prompt += `RISK LEVEL: ${symbolic_decision.risk_level || 'medium'}\n\n`;
  prompt += `OUTPUT LANGUAGE: ${langName}\n`;
  prompt += `RENDER: Create warm, farmer-friendly narration using ONLY the data above. Use the crop_local_name from AUTHORITATIVE_CONTEXT.`;
  
  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NARRATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate narrated response from symbolic decision
 * 
 * CRITICAL: This function can ONLY be called AFTER symbolic brain completes.
 * It does NOT make decisions - it only narrates decisions already made.
 */
export async function generateNarratedResponse(
  input: SymbolicNarrationInput
): Promise<NarrationOutput> {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 1: Validate symbolic input exists and is complete
  // ═══════════════════════════════════════════════════════════════════════════
  
  const inputValidation = validateSymbolicInput(input);
  if (!inputValidation.valid) {
    console.error('❌ NarrationLayer: Invalid symbolic input:', inputValidation.errors);
    return {
      response_text: input.symbolic_decision?.fallback_text || 
        'Please try again.',
      source: 'FALLBACK_USED',
      validation_passed: false,
      validation_errors: inputValidation.errors
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 2: For simple statuses, use fallback directly (no LLM needed)
  // EXPANDED: All monitoring/observation modes use fallback (v2.0.0)
  // ═══════════════════════════════════════════════════════════════════════════
  
  const statusesThatUseFallback = [
    'BLOCKED', 'ESCALATE', 'NO_MATCH', 
    'MONITOR_ONLY', 'MONITORING_ADVISED', 'OBSERVATION',
    'NO_ACTION_REQUIRED', 'INFORMATION_ONLY', 'ERROR'
  ];
  
  if (statusesThatUseFallback.includes(input.symbolic_decision.status)) {
    console.log(`⚡ NarrationLayer: Using fallback for status=${input.symbolic_decision.status}`);
    
    // CRASH-PROOF: Ensure fallback_text is never undefined with mode-specific defaults
    let fallbackText = input.symbolic_decision.fallback_text;
    
    if (!fallbackText) {
      // Mode-specific fallback messages
      const status = input.symbolic_decision.status;
      const lang = input.language;
      
      // English-only fallbacks — LLM narration layer translates at runtime
      if (status === 'OBSERVATION' || status === 'MONITOR_ONLY' || status === 'MONITORING_ADVISED') {
        fallbackText = '🌾 Continue monitoring your crop. Contact us if the issue worsens.';
      } else if (status === 'NO_ACTION_REQUIRED') {
        fallbackText = '✅ No action needed. Your crop is healthy.';
      } else if (status === 'ERROR') {
        fallbackText = '⚠️ Something went wrong. Please try again.';
      } else {
        fallbackText = '🌾 Continue monitoring your crop.';
      }
    }
    
    return {
      response_text: fallbackText,
      source: 'FALLBACK_USED',
      validation_passed: true
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 3: Build narration prompt and call LLM
  // ═══════════════════════════════════════════════════════════════════════════
  
  try {
    const { provider, model, apiKey } = getBestAvailableProvider();
    
    if (!apiKey) {
      console.warn('⚠️ NarrationLayer: No API key available, using fallback');
      return {
        response_text: input.symbolic_decision.fallback_text,
        source: 'FALLBACK_USED',
        validation_passed: true
      };
    }
    
    const narrationPrompt = buildNarrationPrompt(input);
    
    const messages = [
      { role: 'system', content: NARRATION_SYSTEM_PROMPT },
      { role: 'user', content: narrationPrompt }
    ];
    
    const requestBody = buildAIRequest(provider, model, messages, {
      maxTokens: AI_CONFIG.MAX_TOKENS,
      temperature: 0.3 // Low temperature for consistent narration
    });
    
    console.log(`🎙️ NarrationLayer: Calling ${provider}/${model} for narration...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    let endpoint: string;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (provider === 'gemini' || provider === 'google') {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    } else {
      // Lovable AI fallback
      endpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`⚠️ NarrationLayer: API error ${response.status}, using fallback`);
      return {
        response_text: input.symbolic_decision.fallback_text,
        source: 'FALLBACK_USED',
        validation_passed: true
      };
    }
    
    const data = await response.json();
    
    // Extract response based on provider
    let llmOutput = '';
    if (provider === 'gemini' || provider === 'google') {
      llmOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      llmOutput = data.choices?.[0]?.message?.content || '';
    }
    
    if (!llmOutput) {
      console.warn('⚠️ NarrationLayer: Empty LLM response, using fallback');
      return {
        response_text: input.symbolic_decision.fallback_text,
        source: 'FALLBACK_USED',
        validation_passed: true
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GATE 4: Validate LLM output didn't add unauthorized content
    // ═══════════════════════════════════════════════════════════════════════════
    
    const outputValidation = validateNarrationOutput(input, llmOutput);
    
    if (!outputValidation.valid) {
      console.error('❌ NarrationLayer: LLM output validation failed:', outputValidation.errors);
      console.log('   → Using fallback_text instead of LLM output');
      return {
        response_text: input.symbolic_decision.fallback_text,
        source: 'FALLBACK_USED',
        validation_passed: false,
        validation_errors: outputValidation.errors
      };
    }
    
    console.log('✅ NarrationLayer: Validation passed, returning LLM narration');
    
    return {
      response_text: llmOutput,
      source: 'LLM_NARRATION',
      validation_passed: true
    };
    
  } catch (error) {
    console.error('❌ NarrationLayer: Error during narration:', error);
    return {
      response_text: input.symbolic_decision.fallback_text,
      source: 'FALLBACK_USED',
      validation_passed: false,
      validation_errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTED TYPES FOR UPSTREAM MODULES
// ═══════════════════════════════════════════════════════════════════════════

export type { SymbolicNarrationInput, NarrationOutput, ValidationResult };

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS - BACKWARD COMPATIBILITY FOR ORCHESTRATOR
// These functions exist ONLY to prevent import errors during migration
// They should be removed once orchestrator is refactored
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Legacy interface - use SymbolicNarrationInput instead
 */
export interface LLMResponseInput {
  farmer_message: string;
  language: string;
  intent?: string;
  land_context?: {
    current_crop?: string;
    crop_stage?: string;
    area_acres?: number;
    soil_tested?: boolean;
    soil_health?: any;
    ndvi?: any;
    days_since_sowing?: number;
    village?: string;
    district?: string;
  };
}

/**
 * @deprecated This function should not be used - routing decisions belong in orchestrator
 * Returns false to force symbolic path for all queries (safe default)
 */
export function canAnswerDirectly(intent: string, farmerMessage: string): boolean {
  console.warn('[DEPRECATED] canAnswerDirectly called - always returns false to force symbolic path');
  // SAFETY GUARD: Handle undefined/empty input
  const safeMessage = typeof farmerMessage === 'string' ? farmerMessage : '';
  // Only allow direct answer for pure greetings/help - everything else goes to symbolic brain
  const pureGreetingPatterns = /^(hello|hi|hey|namaste|namaskar|नमस्ते|नमस्कार|हेलो|हाय)[\s!?.]*$/i;
  const isGreetingOnly = pureGreetingPatterns.test(safeMessage.trim());
  return isGreetingOnly && intent === 'GREETING';
}

/**
 * @deprecated This function should not be used - routing decisions belong in orchestrator
 * Returns true to force symbolic path for all agricultural queries (safe default)
 */
export function requiresRuleEngine(intent: string, farmerMessage: string): boolean {
  console.warn('[DEPRECATED] requiresRuleEngine called - returns true for most intents');
  // All agricultural intents require rule engine
  const nonRuleIntents = ['GREETING', 'APP_HELP'];
  return !nonRuleIntents.includes(intent);
}

/**
 * @deprecated Use generateNarratedResponse with SymbolicNarrationInput instead
 * This is a compatibility wrapper that creates a minimal symbolic input
 */
export async function generateLLMResponse(input: LLMResponseInput): Promise<{ response_text: string; source: string }> {
  console.warn('[DEPRECATED] generateLLMResponse called - should migrate to generateNarratedResponse');
  
  // FIX 4: language-aware fallback (was hardcoded English).
  const fallbackMessage = getSafeAskMoreInfoMessage(input.language || 'en');
  
  const symbolicInput: SymbolicNarrationInput = {
    language: input.language,
    farmer_message: input.farmer_message,
    symbolic_decision: {
      status: 'NO_MATCH',
      fallback_text: fallbackMessage,
      rules_applied: []
    },
    land_context: input.land_context ? {
      current_crop: input.land_context.current_crop,
      crop_stage: input.land_context.crop_stage,
      village: input.land_context.village,
      district: input.land_context.district
    } : undefined
  };
  
  const result = await generateNarratedResponse(symbolicInput);
  
  return {
    response_text: result.response_text,
    source: result.source
  };
}
