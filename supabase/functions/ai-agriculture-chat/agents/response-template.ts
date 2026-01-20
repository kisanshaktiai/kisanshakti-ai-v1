// ✅ FORENSIC REFACTOR COMPLETE
// Authority: FILE INTENTIONALLY DEPRECATED - All response rendering moved to narration layer (llm-response-generator.ts)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSE TEMPLATE SYSTEM - DEPRECATED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️ THIS FILE IS DEPRECATED AND SHOULD NOT BE USED
 * 
 * ARCHITECTURAL VIOLATION:
 * This file contained hardcoded Marathi/Hindi/English text which violates
 * the SSOT architecture. All farmer-facing text generation is now handled
 * EXCLUSIVELY by the narration layer:
 *   - llm-response-generator.ts
 *   - llm-response-formatter.ts
 *   - fallback-response-generator.ts
 * 
 * MIGRATION PATH:
 * - All symbolic actions are now passed as structured objects
 * - The narration layer uses i18n_keys to fetch translations
 * - No component should import from this file
 * 
 * Version: 2.0.0 - DEPRECATED
 */

export const RESPONSE_TEMPLATE_VERSION = '2.0.0-DEPRECATED';
export const RESPONSE_TEMPLATE_DEPRECATED = true;

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - Kept for backward compatibility
// These interfaces are now defined in the narration layer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use SymbolicDecisionOutput from decision-brain-integration.ts
 */
export interface SymbolicResponse {
  what_to_do: string;
  when: string;
  how_much?: string;
  what_to_avoid?: string;
  question?: string;
}

/**
 * @deprecated Use SymbolicProduct from decision-brain-integration.ts
 */
export interface SymbolicAction {
  action_type: string;
  product_name?: string;
  dosage?: string;
  dosage_per_acre?: string;
  timing?: string;
  method?: string;
  phi_days?: number;
  priority?: string;
  urgency?: string;
  warnings?: string[];
  rule_id?: string;
}

/**
 * @deprecated Rendering is now handled by narration layer
 */
export interface RenderInput {
  actions: SymbolicAction[];
  crop_name?: string;
  growth_stage?: string;
  pest_name?: string;
  disease_name?: string;
  language: 'mr' | 'hi' | 'en';
  requires_clarification?: boolean;
  clarification_text?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STUB FUNCTIONS - Return errors to prevent usage
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated This function is deprecated and should not be used
 * Use the narration layer (llm-response-generator.ts) instead
 */
export function renderSymbolicResponse(_input: RenderInput): string {
  console.error('[DEPRECATED] renderSymbolicResponse called - use narration layer instead');
  throw new Error('DEPRECATED: renderSymbolicResponse has been removed. Use narration layer.');
}

/**
 * @deprecated This function is deprecated and should not be used
 */
export function validateRenderedResponse(
  _rendered: string,
  _symbolicOutput: SymbolicAction[],
  _language: 'mr' | 'hi' | 'en'
): { valid: boolean; violations: string[] } {
  console.error('[DEPRECATED] validateRenderedResponse called - validation now in narration layer');
  return { valid: false, violations: ['DEPRECATED_FUNCTION_CALLED'] };
}

/**
 * @deprecated This function is deprecated and should not be used
 */
export function generateClarificationResponse(
  _question: string,
  _language: 'mr' | 'hi' | 'en'
): string {
  console.error('[DEPRECATED] generateClarificationResponse called - use narration layer');
  throw new Error('DEPRECATED: generateClarificationResponse has been removed. Use narration layer.');
}

/**
 * @deprecated This function is deprecated and should not be used
 */
export function generateNoMatchResponse(
  _language: 'mr' | 'hi' | 'en',
  _crop_name?: string
): string {
  console.error('[DEPRECATED] generateNoMatchResponse called - use narration layer');
  throw new Error('DEPRECATED: generateNoMatchResponse has been removed. Use narration layer.');
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY EXPORTS - File is intentionally gutted
// ═══════════════════════════════════════════════════════════════════════════
