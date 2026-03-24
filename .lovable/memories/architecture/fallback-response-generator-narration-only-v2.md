# Memory: architecture/fallback-response-generator-narration-only-v2
Updated: Now

## Summary

The `fallback-response-generator.ts` (v2.0.0) has been completely refactored to be a **PURE NARRATION LAYER** using 8 prompts.

## Key Changes (8 Prompts Implemented)

### Prompt 1: Lock Role ✅
- Removed all decision-making: no query classification, no NDVI interpretation, no soil interpretation
- File now ONLY accepts `CanonicalFallbackNarrationPayload` with complete pre-computed content
- Cannot classify queries, interpret values, choose questions, or infer fallback type

### Prompt 2: Remove Language-Specific Logic ✅
- Removed all hardcoded Marathi, Hindi, and English text
- Removed greetings, closings, observation messages, NDVI labels, soil messages
- All human-readable text must come from the input payload

### Prompt 3: Delete Implicit Agronomic Logic ✅
- Removed all NDVI interpretation (e.g., "Good", "Stress" labels)
- Removed soil nutrient interpretation
- Removed crop stage meaning logic
- All interpretations must be done upstream in symbolic decision system

### Prompt 4: Remove NLU/Query Classification ✅
- Deleted `detectQueryType()` function
- Removed all regex patterns for fertilizer/water/pest/disease detection
- NLU and intent detection handled earlier in pipeline

### Prompt 5: Replace with Narration-Only Function ✅
- Single function `narrateFallbackResponse()` as main entry point
- Uses `FALLBACK_NARRATION_SYSTEM_PROMPT` for LLM
- LLM strictly used as narrator, never as advisor

### Prompt 6: Define Canonical Payload ✅
- Introduced `CanonicalFallbackNarrationPayload` interface with explicit fields:
  - `language`, `header_text`, `body_points[]`, `metrics[]`
  - `clarification_questions[]`, `closing_text`, `confidence`, `source`
  - `fallback_text` (required for safety)
- Narration layer does not modify or infer any fields

### Prompt 7: Safety Guard ✅
- Added `validateNarrationOutput()` function that checks for:
  - Unauthorized dosages (kg/ha, ml/acre patterns)
  - Unauthorized product recommendations
  - Unauthorized treatment timing
  - Unauthorized diagnostic claims
  - Excessive questions not in original payload
  - Efficacy claims (X% effective)
- If validation fails → uses `fallback_text` instead

### Prompt 8: Cleanup ✅
- File is now thin narration adapter (~400 lines vs ~500 lines)
- No crop-specific logic, no NDVI logic, no soil logic
- Legacy functions maintained with deprecation warnings for backward compatibility

## New Interface

```typescript
interface CanonicalFallbackNarrationPayload {
  language: 'mr' | 'hi' | 'en';
  header_text: string;           // Pre-localized
  body_points: string[];         // Pre-localized
  metrics: Array<{               // Pre-computed with labels
    label: string;
    value: string;
    status?: string;
  }>;
  clarification_questions: string[];  // Pre-localized
  closing_text: string;          // Pre-localized
  confidence: number;            // 0-1
  source: 'observation_only' | 'monitoring_only' | 'clarification_required' | 'error_recovery';
  fallback_text: string;         // REQUIRED for safety
  trace_id?: string;
}
```

## Validation Gates

1. **Input Gate**: Rejects if payload is invalid or incomplete
2. **Output Gate**: Validates LLM didn't add unauthorized content
3. **Fallback Gate**: Always returns valid response via `fallback_text`

## Deprecated Functions (Backward Compatibility)

These functions now log deprecation warnings:
- `generateFallbackResponse()` → Use `narrateFallbackResponse()`
- `generatePartialResponse()` → Use `narrateFallbackResponse()`
- `hasUsableContext()` → Payload validation handles this
- `getHelpfulErrorMessage()` → Use `fallback_text` in payload
- `FallbackResponseGenerator` class → Use function directly
