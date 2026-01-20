/**
 * @deprecated This file has been intentionally emptied as part of architecture refactoring.
 * 
 * REASON: All query classification, intent detection, and agronomic prompts must come from:
 * 1. Intent classification → LIL layer (intent-classifier.ts, intent-resolver.ts)
 * 2. Agronomic advice → Symbolic decision brain (decision_rules table)
 * 3. Language rendering → LLM narration layer (llm-response-generator.ts)
 * 
 * Any file importing from this module should:
 * - Remove the import entirely
 * - Use intent classification from LIL layer
 * - Get agronomic content from symbolic brain output
 */

// Empty exports to prevent import errors during migration
export function getQueryPrompt(queryType: string, language: string): string {
  console.warn('[DEPRECATED] getQueryPrompt called - this function is deprecated and returns empty string');
  // TODO: Requires upstream symbolic decision output
  return '';
}

export function detectQueryType(message: string): string {
  console.warn('[DEPRECATED] detectQueryType called - use intent classification from LIL layer instead');
  // TODO: Requires upstream symbolic decision output - route through intent-classifier.ts
  return 'general';
}

// Mark file as deprecated
export const QUERY_PROMPTS_DEPRECATED = true;
export const QUERY_PROMPTS_VERSION = '0.0.0-DEPRECATED';
