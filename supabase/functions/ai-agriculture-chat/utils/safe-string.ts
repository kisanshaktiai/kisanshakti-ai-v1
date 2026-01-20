/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAFE STRING UTILITIES - Production-Grade Guards
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Prevents runtime crashes from undefined/null string operations.
 * Used across AI chat agents and orchestrator.
 * 
 * CRITICAL: These guards ensure zero TypeError from:
 * - substring, slice, trim
 * - toLowerCase, toUpperCase
 * - includes, split
 * - length access
 * 
 * @version 1.0.0
 */

export const SAFE_STRING_VERSION = '1.0.0';

/**
 * Safely preview text for logging without crash risk.
 * Returns '[NO_TEXT_INPUT]' for empty/undefined/null inputs.
 * 
 * @param input - Any input value (string, undefined, null, object, etc.)
 * @param length - Maximum preview length (default: 50)
 * @returns Safe string preview
 */
export function safePreviewText(input: unknown, length = 50): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '[NO_TEXT_INPUT]';
  }
  return input.length > length 
    ? input.substring(0, length) + '...' 
    : input;
}

/**
 * Safely convert to lowercase with empty string fallback.
 * 
 * @param input - Any input value
 * @returns Lowercase string or empty string
 */
export function safeLowerCase(input: unknown): string {
  return typeof input === 'string' ? input.toLowerCase() : '';
}

/**
 * Safely convert to uppercase with empty string fallback.
 * 
 * @param input - Any input value
 * @returns Uppercase string or empty string
 */
export function safeUpperCase(input: unknown): string {
  return typeof input === 'string' ? input.toUpperCase() : '';
}

/**
 * Safely trim with empty string fallback.
 * 
 * @param input - Any input value
 * @returns Trimmed string or empty string
 */
export function safeTrim(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

/**
 * Safely check if text includes a substring.
 * Returns false for non-string inputs.
 * 
 * @param input - Any input value
 * @param search - Substring to search for
 * @returns Boolean indicating if substring was found
 */
export function safeIncludes(input: unknown, search: string): boolean {
  return typeof input === 'string' && input.toLowerCase().includes(search.toLowerCase());
}

/**
 * Get safe string length (returns 0 for non-strings).
 * 
 * @param input - Any input value
 * @returns String length or 0
 */
export function safeLength(input: unknown): number {
  return typeof input === 'string' ? input.length : 0;
}

/**
 * Safely get substring with bounds checking.
 * Returns empty string for non-strings.
 * 
 * @param input - Any input value
 * @param start - Start index
 * @param end - Optional end index
 * @returns Substring or empty string
 */
export function safeSubstring(input: unknown, start: number, end?: number): string {
  if (typeof input !== 'string') return '';
  return end !== undefined ? input.substring(start, end) : input.substring(start);
}

/**
 * Normalize farmer message to safe string.
 * This is the PRIMARY guard to use at function entry points.
 * 
 * @param input - Any input value (usually farmer message)
 * @returns Guaranteed string (original or empty)
 */
export function normalizeFarmerMessage(input: unknown): string {
  return typeof input === 'string' ? input : '';
}

/**
 * Check if input has meaningful text content.
 * 
 * @param input - Any input value
 * @returns Boolean indicating if input has non-whitespace text
 */
export function hasTextContent(input: unknown): boolean {
  return typeof input === 'string' && input.trim().length > 0;
}

/**
 * Create a safe default result for observation extraction
 * when input is invalid or empty.
 */
export interface SafeExtractionDefaults {
  observations: never[];
  crop_mentioned: null;
  crop_age_indicator: 'UNKNOWN';
  pattern_indicator: 'UNKNOWN';
  severity_indicator: 'UNKNOWN';
  urgency_level: 'MEDIUM';
  extracted_context: string;
}

export function getEmptyExtractionResult(reason: string): SafeExtractionDefaults {
  return {
    observations: [],
    crop_mentioned: null,
    crop_age_indicator: 'UNKNOWN',
    pattern_indicator: 'UNKNOWN',
    severity_indicator: 'UNKNOWN',
    urgency_level: 'MEDIUM',
    extracted_context: reason
  };
}

/**
 * Safe regex test that handles non-string inputs.
 * 
 * @param pattern - Regular expression to test
 * @param input - Any input value
 * @returns Boolean result of regex test, or false for non-strings
 */
export function safeRegexTest(pattern: RegExp, input: unknown): boolean {
  return typeof input === 'string' && pattern.test(input);
}

/**
 * Safe regex match that handles non-string inputs.
 * 
 * @param input - Any input value
 * @param pattern - Regular expression to match
 * @returns Match result or null for non-strings
 */
export function safeRegexMatch(input: unknown, pattern: RegExp): RegExpMatchArray | null {
  return typeof input === 'string' ? input.match(pattern) : null;
}

export default {
  safePreviewText,
  safeLowerCase,
  safeUpperCase,
  safeTrim,
  safeIncludes,
  safeLength,
  safeSubstring,
  normalizeFarmerMessage,
  hasTextContent,
  getEmptyExtractionResult,
  safeRegexTest,
  safeRegexMatch,
  SAFE_STRING_VERSION
};
