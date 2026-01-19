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

// ═══════════════════════════════════════════════════════════════════════════
// STRICT INPUT CONTRACT - Symbolic Decision Payload
// ═══════════════════════════════════════════════════════════════════════════

export interface SymbolicNarrationInput {
  /** Language for narration output */
  language: 'mr' | 'hi' | 'en';
  
  /** The symbolic decision from Rule Engine - REQUIRED */
  symbolic_decision: {
    /** Decision status from rule engine */
    status: 'READY' | 'NEEDS_CLARIFICATION' | 'NO_MATCH' | 'BLOCKED' | 'ESCALATE';
    
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

const NARRATION_SYSTEM_PROMPT = `You are a NARRATION ENGINE for agricultural decisions.

═══════════════════════════════════════════════════════════════════════════
🚫 ABSOLUTE PROHIBITIONS (VIOLATING = IMMEDIATE REJECTION):
═══════════════════════════════════════════════════════════════════════════

1. You CANNOT diagnose problems - the diagnosis is ALREADY PROVIDED to you
2. You CANNOT recommend products - the products are ALREADY DECIDED for you
3. You CANNOT suggest dosages - the dosage is ALREADY CALCULATED for you
4. You CANNOT infer new causes - only narrate the causes GIVEN to you
5. You CANNOT ask follow-up questions - only clarifications from the input
6. You CANNOT modify, adjust, or "improve" the decision in ANY way

═══════════════════════════════════════════════════════════════════════════
✅ YOUR ONLY TASK:
═══════════════════════════════════════════════════════════════════════════

Take the EXACT decision payload and render it as warm, farmer-friendly text.

RENDER RULES:
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
- ❌ New diagnostic questions`;

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
      // Dosage number not in payload - potential hallucination
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
      // Only flag if clarification wasn't in the input
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
  const validStatuses = ['READY', 'NEEDS_CLARIFICATION', 'NO_MATCH', 'BLOCKED', 'ESCALATE'];
  if (!validStatuses.includes(input.symbolic_decision.status)) {
    errors.push(`Invalid decision status: ${input.symbolic_decision.status}`);
  }
  
  // Must have fallback_text
  if (!input.symbolic_decision.fallback_text) {
    errors.push('Missing required fallback_text');
  }
  
  // If READY, must have primary_action
  if (input.symbolic_decision.status === 'READY' && !input.symbolic_decision.primary_action) {
    errors.push('Status is READY but primary_action is missing');
  }
  
  // If NEEDS_CLARIFICATION, must have clarification
  if (input.symbolic_decision.status === 'NEEDS_CLARIFICATION' && !input.symbolic_decision.clarification) {
    errors.push('Status is NEEDS_CLARIFICATION but clarification payload is missing');
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
  const langName = language === 'mr' ? 'Marathi' : language === 'hi' ? 'Hindi' : 'English';
  
  let prompt = `Convert this symbolic decision to farmer-friendly ${langName} text.\n\n`;
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
  
  // Add context for localization only
  if (land_context?.current_crop) {
    prompt += `CONTEXT (for localization only, NOT for decision):\n`;
    prompt += `- Crop: ${land_context.current_crop}\n`;
    if (land_context.village) prompt += `- Village: ${land_context.village}\n`;
    prompt += '\n';
  }
  
  prompt += `RISK LEVEL: ${symbolic_decision.risk_level || 'medium'}\n\n`;
  prompt += `OUTPUT LANGUAGE: ${langName}\n`;
  prompt += `RENDER: Create warm, farmer-friendly narration using ONLY the data above.`;
  
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
        'कृपया पुन्हा प्रयत्न करा. | Please try again.',
      source: 'FALLBACK_USED',
      validation_passed: false,
      validation_errors: inputValidation.errors
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GATE 2: For simple statuses, use fallback directly (no LLM needed)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (['BLOCKED', 'ESCALATE', 'NO_MATCH'].includes(input.symbolic_decision.status)) {
    console.log(`⚡ NarrationLayer: Using fallback for status=${input.symbolic_decision.status}`);
    return {
      response_text: input.symbolic_decision.fallback_text,
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
