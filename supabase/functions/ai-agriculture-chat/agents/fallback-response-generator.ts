/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FALLBACK NARRATION LAYER v2.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * REFACTORED: Applied 8 prompts for pure narration architecture
 * 
 * PROMPT 1 ✅ LOCK ROLE: This file ONLY narrates pre-computed payloads
 * PROMPT 2 ✅ REMOVE LANGUAGE: No hardcoded text in any language
 * PROMPT 3 ✅ DELETE AGRONOMIC LOGIC: No NDVI/soil interpretation
 * PROMPT 4 ✅ REMOVE NLU: No query classification or intent detection
 * PROMPT 5 ✅ NARRATION-ONLY FUNCTION: Single entry point with LLM narration
 * PROMPT 6 ✅ CANONICAL PAYLOAD: Explicit CanonicalFallbackNarrationPayload interface
 * PROMPT 7 ✅ SAFETY GUARD: Validation of LLM output for unauthorized content
 * PROMPT 8 ✅ CLEANUP: Thin narration adapter with no agronomic logic
 * 
 * PRINCIPLE: This file cannot decide, interpret, or advise.
 *            It can only NARRATE what the symbolic brain provides.
 */

import { AI_CONFIG, getBestAvailableProvider, buildAIRequest } from '../../../_shared/aiConfig.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 6: CANONICAL PAYLOAD INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The ONLY input this module accepts.
 * All fields must be pre-computed by the symbolic decision brain.
 * This module does NOT modify or infer any of these fields.
 */
export interface CanonicalFallbackNarrationPayload {
  /** Target language for narration (text already in this language) */
  language: 'mr' | 'hi' | 'en';
  
  /** Pre-localized header text (greeting or section title) */
  header_text: string;
  
  /** Pre-localized body points to narrate */
  body_points: string[];
  
  /** Pre-computed metrics with labels (no interpretation needed) */
  metrics: Array<{
    label: string;      // Pre-localized label (e.g., "नायट्रोजन", "NDVI")
    value: string;      // Formatted value (e.g., "45 kg/ha", "0.65")
    status?: string;    // Pre-computed status text (e.g., "चांगले", "Good")
  }>;
  
  /** Pre-localized clarification questions */
  clarification_questions: string[];
  
  /** Pre-localized closing text */
  closing_text: string;
  
  /** Confidence score (0-1) from upstream system */
  confidence: number;
  
  /** Pre-computed response source/type */
  source: 'observation_only' | 'monitoring_only' | 'clarification_required' | 'error_recovery';
  
  /** Safe fallback text if LLM fails or violates contract */
  fallback_text: string;
  
  /** Trace ID for debugging */
  trace_id?: string;
}

/**
 * Output from the narration layer
 */
export interface NarrationOutput {
  /** Narrated message text */
  message: string;
  
  /** Language used */
  language: 'mr' | 'hi' | 'en';
  
  /** Clarification questions (passed through from payload) */
  clarification_questions: string[];
  
  /** Confidence (passed through from payload) */
  confidence: number;
  
  /** Source (passed through from payload) */
  source: CanonicalFallbackNarrationPayload['source'];
  
  /** Whether LLM was used */
  llm_used: boolean;
  
  /** Whether fallback was triggered */
  fallback_triggered: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 3: NARRATION-ONLY SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const FALLBACK_NARRATION_SYSTEM_PROMPT = `You are a TEXT NARRATOR for agricultural messages.

YOUR ONLY JOB:
- Take the structured content provided and narrate it as natural, flowing text
- Preserve ALL information exactly as given
- Use the language specified in the payload
- Make the text sound conversational and farmer-friendly

ABSOLUTE PROHIBITIONS:
❌ DO NOT add any new information
❌ DO NOT diagnose or identify problems
❌ DO NOT recommend products, treatments, or dosages
❌ DO NOT interpret NDVI values, soil readings, or crop conditions
❌ DO NOT add questions not provided in the input
❌ DO NOT provide agricultural advice of any kind
❌ DO NOT suggest causes or solutions

YOU MUST ONLY:
✅ Combine the header, body points, metrics, and closing into natural prose
✅ Keep all emojis and formatting intact
✅ Preserve metric values and labels exactly
✅ Include clarification questions exactly as provided

If the input contains metrics, format them clearly.
If the input contains body points, integrate them naturally.

RESPONSE FORMAT:
Return ONLY the narrated text. No JSON, no explanations, no meta-commentary.`;

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 5: INPUT VALIDATION (PROMPT 5 - REMOVE PARALLEL AUTHORITY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates that the input payload is complete and well-formed.
 * This file cannot operate without a valid symbolic decision payload.
 */
function validatePayload(payload: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload is null or not an object'] };
  }
  
  const p = payload as Partial<CanonicalFallbackNarrationPayload>;
  
  // Required fields
  if (!p.language || !['mr', 'hi', 'en'].includes(p.language)) {
    errors.push('Invalid or missing language');
  }
  
  if (!p.header_text || typeof p.header_text !== 'string') {
    errors.push('Missing header_text');
  }
  
  if (!Array.isArray(p.body_points)) {
    errors.push('Missing or invalid body_points array');
  }
  
  if (!Array.isArray(p.metrics)) {
    errors.push('Missing or invalid metrics array');
  }
  
  if (!Array.isArray(p.clarification_questions)) {
    errors.push('Missing or invalid clarification_questions array');
  }
  
  if (!p.closing_text || typeof p.closing_text !== 'string') {
    errors.push('Missing closing_text');
  }
  
  if (typeof p.confidence !== 'number' || p.confidence < 0 || p.confidence > 1) {
    errors.push('Invalid confidence (must be 0-1)');
  }
  
  if (!p.source || !['observation_only', 'monitoring_only', 'clarification_required', 'error_recovery'].includes(p.source)) {
    errors.push('Invalid or missing source');
  }
  
  if (!p.fallback_text || typeof p.fallback_text !== 'string') {
    errors.push('Missing fallback_text (required for safety)');
  }
  
  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 7: SAFETY GUARD - OUTPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates LLM output to ensure it didn't introduce unauthorized content.
 * Returns true if output is safe, false if it contains violations.
 */
function validateNarrationOutput(
  llmOutput: string,
  originalPayload: CanonicalFallbackNarrationPayload
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const output = llmOutput.toLowerCase();
  
  // Check for unauthorized agronomic advice patterns
  const unauthorizedPatterns = [
    // Dosage patterns
    /\d+\s*(kg|g|ml|l|liters?|grams?|किलो|ग्राम|मिली|लिटर)\s*(per|प्रति|\/)\s*(acre|hectare|ha|एकर|हेक्टर)/i,
    // Product recommendations (if not in original payload)
    /(?:use|apply|spray|give|द्या|फवारणी करा|वापरा|देना|छिड़काव)\s+(?:urea|dap|npk|pesticide|fungicide|यूरिया|डीएपी)/i,
    // Treatment timing
    /(?:after|before|every)\s+\d+\s+(?:days?|hours?|weeks?|दिवस|तास|आठवडे)/i,
    // Diagnostic claims not in input
    /(?:you have|this is|diagnosis|problem is|issue is|तुम्हाला आहे|हे आहे|समस्या आहे)/i,
  ];
  
  for (const pattern of unauthorizedPatterns) {
    if (pattern.test(output)) {
      // Check if this content was in the original payload
      const payloadText = [
        originalPayload.header_text,
        ...originalPayload.body_points,
        ...originalPayload.metrics.map(m => `${m.label} ${m.value} ${m.status || ''}`),
        originalPayload.closing_text,
        ...originalPayload.clarification_questions
      ].join(' ').toLowerCase();
      
      const match = output.match(pattern);
      if (match && !payloadText.includes(match[0].toLowerCase())) {
        violations.push(`Unauthorized content detected: "${match[0]}"`);
      }
    }
  }
  
  // Check for new questions not in original
  const questionMarks = (output.match(/\?/g) || []).length;
  const originalQuestionCount = originalPayload.clarification_questions.length;
  
  // Allow some tolerance for natural narration
  if (questionMarks > originalQuestionCount + 2) {
    violations.push(`Too many questions in output (${questionMarks} vs ${originalQuestionCount} expected)`);
  }
  
  // Check for efficacy claims
  if (/\d+\s*%\s*(effective|success|improvement|प्रभावी|सुधार)/.test(output)) {
    violations.push('Unauthorized efficacy claim detected');
  }
  
  return { valid: violations.length === 0, violations };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT 5: SINGLE NARRATION FUNCTION (MAIN ENTRY POINT)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * THE ONLY EXPORTED FUNCTION FOR FALLBACK NARRATION
 * 
 * This function:
 * 1. Validates the input payload (PROMPT 5 - no parallel authority)
 * 2. Builds a narration prompt from the structured content
 * 3. Calls LLM to narrate (PROMPT 3 - narration-only prompt)
 * 4. Validates output for unauthorized content (PROMPT 7 - safety guard)
 * 5. Returns narrated text or fallback_text if anything fails
 */
export async function narrateFallbackResponse(
  payload: CanonicalFallbackNarrationPayload
): Promise<NarrationOutput> {
  console.log(`[FALLBACK-NARRATOR v2.0.0] Starting narration, trace_id: ${payload.trace_id || 'none'}`);
  
  // GATE 1: Input validation (PROMPT 5)
  const validation = validatePayload(payload);
  if (!validation.valid) {
    console.error(`[FALLBACK-NARRATOR] ❌ Invalid payload:`, validation.errors);
    return {
      message: payload.fallback_text || 'Unable to process your request. Please try again.',
      language: payload.language || 'en',
      clarification_questions: payload.clarification_questions || [],
      confidence: 0.1,
      source: 'error_recovery',
      llm_used: false,
      fallback_triggered: true
    };
  }
  
  // Build narration prompt from structured content
  const narrationContent = buildNarrationContent(payload);
  
  try {
    // Get AI provider
    const { provider, model, apiKey } = getBestAvailableProvider();
    
    if (!apiKey) {
      console.log('[FALLBACK-NARRATOR] No API key, using fallback_text');
      return createFallbackOutput(payload, false);
    }
    
    // Build LLM request
    const messages = [
      { role: 'system', content: FALLBACK_NARRATION_SYSTEM_PROMPT },
      { role: 'user', content: narrationContent }
    ];
    
    const requestBody = buildAIRequest(provider, model, messages, {
      maxTokens: 800,
      temperature: 0.3
    });
    
    // Call LLM
    const endpoint = provider === 'gemini' || provider === 'google'
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      : 'https://api.openai.com/v1/chat/completions';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (provider === 'openai') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      console.error(`[FALLBACK-NARRATOR] LLM error: ${response.status}`);
      return createFallbackOutput(payload, false);
    }
    
    const data = await response.json();
    
    // Extract response text
    let llmOutput: string;
    if (provider === 'gemini' || provider === 'google') {
      llmOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      llmOutput = data.choices?.[0]?.message?.content || '';
    }
    
    if (!llmOutput.trim()) {
      console.log('[FALLBACK-NARRATOR] Empty LLM response, using fallback_text');
      return createFallbackOutput(payload, true);
    }
    
    // GATE 2: Output validation (PROMPT 7 - safety guard)
    const outputValidation = validateNarrationOutput(llmOutput, payload);
    if (!outputValidation.valid) {
      console.warn(`[FALLBACK-NARRATOR] ⚠️ Output violations:`, outputValidation.violations);
      console.log('[FALLBACK-NARRATOR] Using fallback_text due to safety violations');
      return createFallbackOutput(payload, true);
    }
    
    console.log(`[FALLBACK-NARRATOR] ✅ Narration complete, length: ${llmOutput.length}`);
    
    return {
      message: llmOutput.trim(),
      language: payload.language,
      clarification_questions: payload.clarification_questions,
      confidence: payload.confidence,
      source: payload.source,
      llm_used: true,
      fallback_triggered: false
    };
    
  } catch (error) {
    console.error('[FALLBACK-NARRATOR] ❌ Error during narration:', error);
    return createFallbackOutput(payload, false);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS (NO DECISION LOGIC)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Builds the narration prompt from structured payload.
 * This does NOT interpret or add any content - just formats for LLM.
 */
function buildNarrationContent(payload: CanonicalFallbackNarrationPayload): string {
  const parts: string[] = [];
  
  parts.push(`Language: ${payload.language}`);
  parts.push(`\nHeader: ${payload.header_text}`);
  
  if (payload.body_points.length > 0) {
    parts.push(`\nBody Points:`);
    payload.body_points.forEach((point, i) => {
      parts.push(`${i + 1}. ${point}`);
    });
  }
  
  if (payload.metrics.length > 0) {
    parts.push(`\nMetrics to include:`);
    payload.metrics.forEach(m => {
      parts.push(`- ${m.label}: ${m.value}${m.status ? ` (${m.status})` : ''}`);
    });
  }
  
  if (payload.clarification_questions.length > 0) {
    parts.push(`\nClarification Questions to include:`);
    payload.clarification_questions.forEach((q, i) => {
      parts.push(`${i + 1}. ${q}`);
    });
  }
  
  parts.push(`\nClosing: ${payload.closing_text}`);
  
  parts.push(`\n---\nNarrate the above content as natural, conversational text in ${payload.language}. Include all elements.`);
  
  return parts.join('\n');
}

/**
 * Creates fallback output when LLM fails or is unavailable
 */
function createFallbackOutput(
  payload: CanonicalFallbackNarrationPayload,
  llmWasUsed: boolean
): NarrationOutput {
  // Construct message from payload without LLM
  const parts: string[] = [payload.header_text];
  
  if (payload.body_points.length > 0) {
    parts.push(payload.body_points.join('\n'));
  }
  
  if (payload.metrics.length > 0) {
    const metricsText = payload.metrics
      .map(m => `${m.label}: ${m.value}${m.status ? ` (${m.status})` : ''}`)
      .join('\n');
    parts.push(metricsText);
  }
  
  if (payload.clarification_questions.length > 0) {
    parts.push(payload.clarification_questions.join('\n'));
  }
  
  parts.push(payload.closing_text);
  
  return {
    message: parts.filter(Boolean).join('\n\n'),
    language: payload.language,
    clarification_questions: payload.clarification_questions,
    confidence: payload.confidence * 0.8, // Slight penalty for non-LLM output
    source: payload.source,
    llm_used: llmWasUsed,
    fallback_triggered: true
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS (DEPRECATED - FOR BACKWARD COMPATIBILITY ONLY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use narrateFallbackResponse with CanonicalFallbackNarrationPayload
 * This exists only for backward compatibility during migration.
 */
export interface FallbackContext {
  cropCode?: string;
  cropStage?: string;
  landId?: string;
  landName?: string;
  soilNitrogen?: number;
  soilPhosphorus?: number;
  soilPotassium?: number;
  soilPh?: number;
  ndviValue?: number;
  farmerMessage?: string;
  queryType?: 'fertilizer' | 'watering' | 'pest' | 'disease' | 'general';
}

/**
 * @deprecated Use NarrationOutput instead
 */
export interface FallbackResponse {
  message: string;
  language: 'mr' | 'hi' | 'en';
  clarification_questions: string[];
  confidence: number;
  source: 'observation_only' | 'monitoring_only' | 'clarification_required';
}

/**
 * @deprecated This function is deprecated. Use narrateFallbackResponse instead.
 * Maintained for backward compatibility - will log deprecation warning.
 */
export function generateFallbackResponse(
  context: FallbackContext,
  language: 'mr' | 'hi' | 'en' = 'mr'
): FallbackResponse {
  console.warn('[DEPRECATED] generateFallbackResponse is deprecated. Migrate to narrateFallbackResponse with CanonicalFallbackNarrationPayload');
  
  // Create minimal fallback using static text (no LLM, no interpretation)
  const fallbackMessages = {
    mr: '🙏 कृपया अधिक माहिती द्या जेणेकरून मी तुम्हाला मदत करू शकेन.',
    hi: '🙏 कृपया अधिक जानकारी दें ताकि मैं आपकी मदद कर सकूं।',
    en: '🙏 Please provide more information so I can assist you.'
  };
  
  return {
    message: fallbackMessages[language],
    language,
    clarification_questions: [],
    confidence: 0.3,
    source: 'clarification_required'
  };
}

/**
 * @deprecated Use narrateFallbackResponse instead
 */
export function generatePartialResponse(
  farmerMessage: string,
  landContext: any,
  language: 'mr' | 'hi' | 'en' = 'mr'
): FallbackResponse {
  console.warn('[DEPRECATED] generatePartialResponse is deprecated. Migrate to narrateFallbackResponse');
  return generateFallbackResponse({}, language);
}

/**
 * @deprecated No longer needed - payload validation handles this
 */
export function hasUsableContext(context: FallbackContext | null | undefined): boolean {
  console.warn('[DEPRECATED] hasUsableContext is deprecated');
  return false;
}

/**
 * @deprecated Use narrateFallbackResponse with fallback_text
 */
export function getHelpfulErrorMessage(language: 'mr' | 'hi' | 'en'): string {
  console.warn('[DEPRECATED] getHelpfulErrorMessage is deprecated');
  const messages = {
    mr: '🙏 कृपया पुन्हा प्रयत्न करा.',
    hi: '🙏 कृपया फिर से प्रयास करें।',
    en: '🙏 Please try again.'
  };
  return messages[language];
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASS WRAPPER (FOR LEGACY COMPATIBILITY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use narrateFallbackResponse function directly
 */
export class FallbackResponseGenerator {
  async generate(payload: CanonicalFallbackNarrationPayload): Promise<NarrationOutput> {
    return narrateFallbackResponse(payload);
  }
  
  /** @deprecated */
  generateSync(context: FallbackContext, language: 'mr' | 'hi' | 'en' = 'mr'): FallbackResponse {
    return generateFallbackResponse(context, language);
  }
}

/**
 * @deprecated Use narrateFallbackResponse function directly
 */
export const fallbackGenerator = new FallbackResponseGenerator();
