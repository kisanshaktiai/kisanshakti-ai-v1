// SAFE STRING UTILITIES v3.0.0 - CRASH-PROOF PRODUCTION GUARDS

export const SAFE_STRING_VERSION = '3.0.0';

// CORE GUARD FUNCTIONS - USE THESE EVERYWHERE

// Normalize any input to string (empty fallback for non-strings).
export function normalizeText(input: unknown): string {
  return typeof input === 'string' ? input : '';
}

// Safe preview for logging - never crashes.
export function safePreview(input: unknown, len = 50): string {
  const text = normalizeText(input);
  return text.length > 0
    ? text.slice(0, len) + (text.length > len ? '...' : '')
    : '[NO_TEXT]';
}

// Check if has non-empty text content.
export function hasText(input: unknown): boolean {
  return normalizeText(input).trim().length > 0;
}

// Safely preview text for logging without crash risk.
export function safePreviewText(input: unknown, length = 50): string {
  if (typeof input !== 'string' || input.length === 0) {
    return '[NO_TEXT_INPUT]';
  }
  return input.length > length 
    ? input.substring(0, length) + '...' 
    : input;
}

// Safely convert to lowercase with empty string fallback.
export function safeLowerCase(input: unknown): string {
  return typeof input === 'string' ? input.toLowerCase() : '';
}

// Safely convert to uppercase with empty string fallback.
export function safeUpperCase(input: unknown): string {
  return typeof input === 'string' ? input.toUpperCase() : '';
}

// Safely trim with empty string fallback.
export function safeTrim(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

// Safely check if text includes a substring.
export function safeIncludes(input: unknown, search: string): boolean {
  return typeof input === 'string' && input.toLowerCase().includes(search.toLowerCase());
}

// Get safe string length (returns 0 for non-strings).
export function safeLength(input: unknown): number {
  return typeof input === 'string' ? input.length : 0;
}

// Safely get substring with bounds checking.
export function safeSubstring(input: unknown, start: number, end?: number): string {
  if (typeof input !== 'string') return '';
  return end !== undefined ? input.substring(start, end) : input.substring(start);
}

// Normalize farmer message to safe string.
export function normalizeFarmerMessage(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input === null || input === undefined) {
    return '';
  }
  // Handle objects with content/text properties
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.farmer_message === 'string') return obj.farmer_message;
  }
  return '';
}

// Check if input has meaningful text content.
export function hasTextContent(input: unknown): boolean {
  return typeof input === 'string' && input.trim().length > 0;
}

// Extract message content from various input formats safely.
export function extractMessageContent(input: unknown): string {
  // Direct string
  if (typeof input === 'string') {
    return input;
  }
  
  // Null/undefined
  if (input === null || input === undefined) {
    return '';
  }
  
  // Object with content properties
  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    
    // Common message formats
    if (typeof obj.content === 'string') return obj.content;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.farmer_message === 'string') return obj.farmer_message;
    if (typeof obj.user_message === 'string') return obj.user_message;
    
    // Nested content
    if (obj.content && typeof obj.content === 'object') {
      const nested = obj.content as Record<string, unknown>;
      if (typeof nested.text === 'string') return nested.text;
    }
  }
  
  return '';
}

// Format message for safe logging (truncated + sanitized).
export function formatForLogging(input: unknown, maxLength = 100): string {
  const text = extractMessageContent(input);
  if (!text) {
    return '[EMPTY_MESSAGE]';
  }
  // Remove newlines for single-line logging
  const cleaned = text.replace(/[\r\n]+/g, ' ').trim();
  return safePreviewText(cleaned, maxLength);
}

// Create a safe default result for observation extraction
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

// Safe regex test that handles non-string inputs.
export function safeRegexTest(pattern: RegExp, input: unknown): boolean {
  return typeof input === 'string' && pattern.test(input);
}

// Safe regex match that handles non-string inputs.
export function safeRegexMatch(input: unknown, pattern: RegExp): RegExpMatchArray | null {
  return typeof input === 'string' ? input.match(pattern) : null;
}

// FAIL-SAFE i18n KEY RESOLUTION

// Resolve an i18n key with a guaranteed fallback.
export function resolveI18nKey(key: unknown, fallbackKey = 'system.monitoring.default'): string {
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }
  return fallbackKey;
}

// Safe response mode resolution with fallback.
export function resolveResponseModeString(mode: unknown, fallback = 'CLARIFICATION'): string {
  const VALID_MODES = [
    'OBSERVATION', 'CLARIFICATION', 'CLARIFICATION_REQUIRED', 'PHOTO_REQUIRED',
    'MONITORING_ADVISED', 'TREATMENT', 'TREATMENT_ALLOWED', 'INFORMATION',
    'NO_ACTION_NEEDED', 'ERROR', 'DECISION_PROVIDED', 'BLOCKED'
  ];
  
  const modeStr = typeof mode === 'string' ? mode.toUpperCase().trim() : '';
  
  if (VALID_MODES.includes(modeStr)) {
    return modeStr;
  }
  
  console.warn(`[SafeString] Invalid response mode "${mode}" - falling back to ${fallback}`);
  return fallback;
}

// Safe extraction of severity from unknown input.
export function resolveSeverity(input: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const severity = typeof input === 'string' ? input.toUpperCase().trim() : '';
  
  if (VALID_SEVERITIES.includes(severity)) {
    return severity as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }
  
  return 'MEDIUM'; // Safe default
}

// Create guaranteed action_codes array from input.
export function resolveActionCodes(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

export default {
  // Core guards
  normalizeText,
  safePreview,
  hasText,
  safePreviewText,
  safeLowerCase,
  safeUpperCase,
  safeTrim,
  safeIncludes,
  safeLength,
  safeSubstring,
  // Message handling
  normalizeFarmerMessage,
  hasTextContent,
  extractMessageContent,
  formatForLogging,
  // Extraction defaults
  getEmptyExtractionResult,
  // Regex safety
  safeRegexTest,
  safeRegexMatch,
  // i18n/mode resolution (NEW)
  resolveI18nKey,
  resolveResponseModeString,
  resolveSeverity,
  resolveActionCodes,
  // Version
  SAFE_STRING_VERSION
};
