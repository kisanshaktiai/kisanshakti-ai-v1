# Memory: architecture/llm-response-generator-narration-only-v2
Updated: Now

## Summary

The `llm-response-generator.ts` (v2.0.0) has been completely refactored to be a **PURE NARRATION LAYER** that cannot make decisions.

## Key Changes (5 Prompts Implemented)

### Prompt 1: Lock Role of File ✅
- Removed all intent detection (`canAnswerDirectly`, `requiresRuleEngine`)
- Removed `DIRECT_ANSWER_INTENTS` and `RULE_ENGINE_REQUIRED_INTENTS` arrays
- Removed `generateContextDirectResponse()` function
- File now ONLY accepts `SymbolicNarrationInput` with complete decision payload

### Prompt 2: Remove Language-Specific Logic ✅
- Removed 40+ hardcoded regex patterns for Marathi/Hindi/English
- Removed `simpleQuestionPatterns` and `treatmentPatterns`
- Removed all hardcoded response templates (greetings, crop queries, soil queries)
- All text now comes from `symbolic_decision.fallback_text` or LLM narration

### Prompt 3: Replace System Prompt ✅
- Implemented `NARRATION_SYSTEM_PROMPT` with strict prohibitions
- LLM is instructed to ONLY narrate, never diagnose/advise/infer
- Clear list of what LLM cannot do: diagnose, recommend products, suggest dosages

### Prompt 4: Enforce No-Reasoning Contract ✅
- Added `validateNarrationOutput()` function that checks:
  - No unauthorized products introduced
  - No unauthorized efficacy claims (X% effective)
  - No unauthorized dosages
  - No diagnostic questions not in input
- If validation fails → uses `fallback_text` instead

### Prompt 5: Remove Parallel Authority ✅
- Added `validateSymbolicInput()` as first gate
- Function rejects calls without valid `symbolic_decision` payload
- Cannot be called before symbolic brain completes
- Required fields: `status`, `fallback_text`, appropriate payloads per status

## New Interface

```typescript
interface SymbolicNarrationInput {
  language: 'mr' | 'hi' | 'en';
  symbolic_decision: {
    status: 'READY' | 'NEEDS_CLARIFICATION' | 'NO_MATCH' | 'BLOCKED' | 'ESCALATE';
    primary_action?: { action_type, action_text, product_name, dosage, timing, reason_text };
    causes?: Array<{ cause_code, cause_name, confidence }>;
    clarification?: { question_text, options };
    fallback_text: string;  // REQUIRED
    rules_applied: string[];
  };
  farmer_message: string;
  land_context?: { current_crop, crop_stage, village, district };
}
```

## Validation Gates

1. **Input Gate**: Rejects if `symbolic_decision` missing or incomplete
2. **Status Gate**: Uses fallback directly for BLOCKED/ESCALATE/NO_MATCH
3. **Output Gate**: Validates LLM didn't add unauthorized content
4. **Fallback Gate**: Always returns valid response

## Lines of Code Removed

- ~300 lines of hardcoded patterns
- ~200 lines of direct response logic
- Total: ~500 lines removed, replaced with ~400 lines of validated narration
