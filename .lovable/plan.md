
# Fix: Authoritative Crop Lock + Local Name Enforcement in LLM Narration Layer

## Problem

The LLM narration layer can hallucinate wrong crop names (e.g., "Wheat" instead of "Sugarcane") because:
1. The system prompt gives LLM an "agronomist" identity that implies decision-making authority
2. The narration prompt passes crop name as loose "context for localization" with no enforcement
3. No crop local name (e.g., "oos" in Marathi) is provided -- LLM guesses translations
4. No post-render validation checks whether the LLM output mentions the correct crop

## Data Sources Already Available

The `ICAR_CALENDARS` in `crop-calendar-lookup.ts` already contains crop local names:
- Sugarcane: `crop_name_mr: 'oos'`, `crop_name_hi: 'ganna'`, `crop_name_en: 'Sugarcane'`
- Wheat: `crop_name_mr: 'gahu'`, `crop_name_hi: 'gehun'`
- Cotton: `crop_name_mr: 'kapus'`, `crop_name_hi: 'kapas'`
- etc.

The `land_context` in `SymbolicNarrationInput` already has `current_crop` and `crop_stage`.

## Changes (3 modifications in 1 file)

**File:** `supabase/functions/ai-agriculture-chat/agents/llm-response-generator.ts`

### Change 1: Replace System Prompt Identity

Replace `NARRATION_SYSTEM_PROMPT` (lines 110-148) to change the LLM identity from "NARRATION ENGINE for agricultural decisions" to "multilingual agricultural language adapter". Add explicit crop lock enforcement rules:

- "You MUST use crop_local_name when writing in the farmer's language"
- "You MUST NOT translate or replace crop_local_name"
- "You MUST NOT infer any crop"
- "You MUST NOT mention any crop other than the one in AUTHORITATIVE_CONTEXT"
- "You are a language adapter only -- all biological information comes from AUTHORITATIVE_CONTEXT"

Keep all existing prohibitions (no diagnosing, no products, no dosages, etc.).

### Change 2: Inject AUTHORITATIVE_CONTEXT into Narration Prompt

Modify `buildNarrationPrompt()` (lines 286-340) to:

1. Import `ICAR_CALENDARS` from `crop-calendar-lookup.ts` to resolve crop local name
2. Build a structured JSON block at the TOP of the prompt:

```
AUTHORITATIVE_CONTEXT (IMMUTABLE -- DO NOT MODIFY):
{
  "crop_canonical": "Sugarcane",
  "crop_local_name": "oos",
  "farmer_language": "mr",
  "growth_stage": "TILLERING",
  "days_after_sowing": 68
}
```

3. Replace the loose "CONTEXT (for localization only)" block with this structured authoritative block
4. The local name is resolved from ICAR_CALENDARS using the crop code and language

### Change 3: Add Post-Render Crop Integrity Validation

Enhance `validateNarrationOutput()` (lines 162-229) to add crop mismatch detection:

1. Build a set of ALL known crop names (English, Marathi, Hindi) from ICAR_CALENDARS
2. Remove the expected crop names from the set (the correct crop)
3. Scan the LLM output for any remaining (wrong) crop names
4. If a wrong crop is found AND the correct crop local name is NOT in the output: flag as violation
5. Log the mismatch event with crop details for forensic audit

This catches cases like: LLM says "gahu" (wheat) when the crop is "oos" (sugarcane).

## What Does NOT Change

- `SymbolicNarrationInput` interface (no schema change)
- `fallback-response-generator.ts` (separate file, not in scope)
- `base-identity.ts` (prompt-factory identity, not used by narration layer)
- `prompt-factory.ts` (used for general chat, not narration)
- Decision rules, symbolic reasoner, orchestrator, ontology
- Database schema
- Rule evaluation engine

## Expected Result

For Sugarcane land with `language: 'mr'`:

| Before | After |
|--------|-------|
| LLM may say "gahu pikat..." (wheat) | LLM MUST say "oos pikat..." (sugarcane) |
| No crop validation | Post-render gate catches wrong crop, uses fallback |
| Loose "Context for localization" | Structured AUTHORITATIVE_CONTEXT with immutable crop lock |
| Identity: "narration engine" | Identity: "language adapter" with crop lock rules |

## Technical Detail

| Item | Detail |
|------|--------|
| File | `llm-response-generator.ts` |
| Changes | 3 (system prompt, narration prompt builder, output validator) |
| New imports | `ICAR_CALENDARS` from `crop-calendar-lookup.ts` |
| Risk | Zero -- only hardens existing layer, fallback_text always available |
