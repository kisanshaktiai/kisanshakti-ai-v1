
# Critical Bug Fix Plan: Agronomically Accurate Symbolic Decision Brain

## Problems Found (4 Critical, 1 Major)

---

## Critical Bug 1: `product_name` Placeholder Causes Validation Failure

**Location:** `llm-response-formatter.ts` lines 538-548, `orchestrator.ts` lines 1762, 1799, `index.ts` lines 610, 648

**Root Cause:** The orchestrator sets `product_name` to placeholder strings like `'See action text'`, `'See structured response'`, `'See concentration'`. The LLM output validator then checks if these strings appear in the LLM's response. Since they are NOT in the `GENERIC_ACTION_TYPES` allowlist, the validator treats them as real product names, fails, and falls back to a generic template -- producing agronomically useless advice.

**Evidence:** Log pattern: `"Missing product from symbolic decision: See action text"` triggers `"Using template fallback to prevent spreading incorrect advice."`

**Fix:** Add these placeholder strings to `GENERIC_ACTION_TYPES` in `llm-response-formatter.ts`:
```
'see action text', 'see structured response', 'see concentration',
'not specified', 'n/a', 'as per label', 'follow label', 'continue monitoring'
```

---

## Critical Bug 2: No Land-Area-Based Dosage Calculation

**Location:** `llm-response-formatter.ts` lines 986-997

**Root Cause:** When the decision brain recommends a treatment, it passes `dosage_per_acre` from the rule (e.g., "2ml/L water"). The LLM formatter outputs this raw value. But it NEVER multiplies by `area_acres` to give the farmer total quantity needed for their specific land.

A farmer with 5 acres gets "2ml/L, 200L water/acre" but does NOT get "Total: 10ml product in 1000L water for your 5 acres." This is a critical agronomic gap -- farmers need exact total quantities.

**Fix:** In `buildRecommendationSummary()`, when treatment details are output and `input.land_context.area_acres` is available:
- Calculate `total_dosage = dosage_per_acre * area_acres`
- Calculate `total_water = water_volume_per_acre * area_acres`
- Add a line: `"- TOTAL FOR YOUR LAND ({area} acres): {total_dosage} product in {total_water} water"`
- Also instruct the LLM: `"IMPORTANT: Calculate and show TOTAL quantities for the farmer's {area} acre land."`

---

## Critical Bug 3: Raw Language Observations Mixed with Canonical Symbols

**Location:** `orchestrator.ts` lines 2527-2553

**Root Cause:** `allObservationsForPreAuth` collects symbols from 3 sources without filtering:
1. `observationKeys` -- proper canonical codes (e.g., `DEAD_HEART_PRESENT`)
2. `mappedCodes.observation_codes` -- proper canonical codes
3. `inductionResult.symptoms` -- contains BOTH canonical codes AND raw Marathi/Hindi text (e.g., `"मधली सुरळी वाळली"`)

Raw language strings flow into the rule engine and hypothesis evaluator, where they cannot match any rules, dilute confidence scores, and leak into clarification UI as mixed-language labels.

**Fix:** Add a canonical code filter before populating `allObservationsForPreAuth`:
```typescript
function isCanonicalCode(s: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(s);
}
```
Only add entries passing `isCanonicalCode()`. Raw observations should be logged but excluded from rule evaluation.

---

## Critical Bug 4: `normalizeToEnglish()` Creates Half-Translated Strings

**Location:** `index.ts` lines 1530-1565

**Root Cause:** This function has only ~23 hardcoded term mappings. It replaces some Marathi/Hindi words with English equivalents while leaving the rest unchanged, creating hybrid strings like:
```
"sugarcane च्या shoot borer ने पान खाल्ली"
```
This half-translated output is stored in `preprocessed_content` but NOT passed to the orchestrator (the orchestrator receives original `userMessageContent`). So it serves no functional purpose for the decision brain, only confusing debug logs.

The LLM Semantic Extractor (Stage 1.5) already handles any-language-to-English extraction properly.

**Fix:** 
- Stop calling `normalizeToEnglish()` in the main path (line 457)
- Or rename to `_legacyNormalizeHint()` and keep only for DB logging
- The orchestrator already receives `userMessageContent` (original) which flows correctly to the LLM semantic extractor

---

## Major Bug 5: LLM Translation Not Enforced

**Location:** `llm-response-formatter.ts` lines 704-786

**Root Cause:** The system prompt says "TRANSLATE TO Marathi" but there is no post-LLM check that the response is actually in the target language. The LLM frequently copies English `action_text` / `reason_text` verbatim or mixes English into Marathi output.

**Fix:** After receiving LLM response (line 476), add an ASCII ratio check:
- For non-English target languages (mr, hi, ta, te, etc.), check if response has >40% ASCII characters
- If so, log a warning and either:
  a. Retry with a stronger translation prompt, OR
  b. Apply `forceTranslateResponse()` (already exists at line 1589)
- Add explicit instruction in prompt: `"NEVER leave English phrases in your ${langName} response. Every sentence MUST be in ${langName}."`

---

## Implementation Details

### File 1: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

**Change A (Bug 1):** Expand `GENERIC_ACTION_TYPES` array at line 538:
Add: `'see action text', 'see structured response', 'see concentration', 'not specified', 'n/a', 'as per label', 'follow label', 'continue monitoring'`

**Change B (Bug 2):** In `buildRecommendationSummary()` at line 986, after the treatment details block, add land-area-based total calculation:
```text
if (isTreatmentAction && input.land_context?.area_acres && appDetails.dosage_per_acre) {
  const area = input.land_context.area_acres;
  parts.push(`\n═══ TOTAL FOR FARMER'S LAND (${area} acres) ═══`);
  parts.push(`Calculate: dosage_per_acre x ${area} = total dosage`);
  parts.push(`Calculate: water_volume_per_acre x ${area} = total water needed`);
  parts.push(`IMPORTANT: Show these TOTAL quantities prominently in the response.`);
}
```

**Change C (Bug 5):** After line 476 (post-process), add language consistency check:
```text
if (input.language !== 'en') {
  const asciiChars = (formattedResponse.match(/[a-zA-Z]/g) || []).length;
  const totalChars = formattedResponse.length;
  const asciiRatio = asciiChars / totalChars;
  if (asciiRatio > 0.4) {
    console.warn(`⚠️ [LANGUAGE CHECK] ${(asciiRatio*100).toFixed(0)}% ASCII in ${langName} response - possible translation failure`);
    formattedResponse = forceTranslateResponse(formattedResponse, input.language);
  }
}
```

### File 2: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

**Change D (Bug 3):** At line 2527, before building `allObservationsForPreAuth`, add canonical code filter:
```text
function isCanonicalCode(s: string): boolean {
  return /^[A-Z][A-Z0-9_]+$/.test(s);
}
```
Then wrap each `.add()` call with this check:
- Line 2531: `if (isCanonicalCode(String(key))) allObservationsForPreAuth.add(String(key));`
- Line 2536: `if (isCanonicalCode(code)) allObservationsForPreAuth.add(code);`  
- Line 2541: `if (s.symbol && isCanonicalCode(s.symbol)) allObservationsForPreAuth.add(s.symbol);`

Log filtered-out non-canonical entries for debugging.

### File 3: `supabase/functions/ai-agriculture-chat/index.ts`

**Change E (Bug 4):** At line 457, deprecate the `normalizeToEnglish` call:
```text
// DEPRECATED: LLM Semantic Extractor handles all languages natively
// const preprocessedContent = normalizeToEnglish(userMessageContent);
const preprocessedContent = userMessageContent; // Pass original to DB for training
```

### File 4: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

**Change F (Bug 2 enhancement):** Update the LLM system prompt at line 767 to add explicit total dosage instruction:
```text
DOSAGE CALCULATION RULES:
- If land area is provided (e.g., 5 acres), ALWAYS calculate TOTAL quantities
- Formula: Total product = dosage_per_acre x land_area
- Formula: Total water = water_volume_per_acre x land_area  
- Show both per-acre AND total quantities
- Example: "प्रति एकर: 2ml/L | तुमच्या 5 एकरसाठी एकूण: 10ml in 1000L पाणी"
```

---

## Data Flow After All Fixes

```text
Farmer sends query in ANY language (text/photo/audio)
       |
       v
index.ts: Pass ORIGINAL text to orchestrator (no partial translation)
       |
       v
Orchestrator Stage 1.5: LLM Semantic Extractor
  -> Extracts intent_code, observations in English
  -> Maps to canonical ObservationKey codes (UPPERCASE)
       |
       v
allObservationsForPreAuth: ONLY canonical codes pass filter
  -> Raw Marathi/Hindi EXCLUDED from rule engine
  -> Only DEAD_HEART_PRESENT, LEAF_YELLOWING etc.
       |
       v
Symbolic Decision Brain: Rules fire on canonical codes
  -> Returns action_text, dosage_per_acre, product_name
       |
       v
LLM Formatter: 
  1. Validates product_name (placeholders correctly skipped)
  2. Calculates TOTAL dosage for farmer's land area
  3. Translates ALL English text to farmer's language
  4. Validates language consistency (ASCII ratio check)
       |
       v
Farmer sees: Fully translated, agronomically accurate,
             land-area-specific response
```

## Observation vs Clarification Distinction

| Type | Format | Used For | Example |
|------|--------|----------|---------|
| Raw Input | Original language | DB logging, NLU perception | "मधली सुरळी वाळली" |
| Canonical Symbol | UPPERCASE_CODE | Rule engine matching | DEAD_HEART_PRESENT |
| Clarification Label | DB-translated text | Farmer UI display | "मधले पान वाळणे" (from observation_translations) |
| Response Text | Target language | Final advice to farmer | Full Marathi/Hindi advice |

## Risk Assessment

- Bug 1 fix: Very low risk (adding strings to allowlist)
- Bug 2 fix: Low risk (additive calculation, no existing logic changed)
- Bug 3 fix: Medium risk (filtering observations - must verify no legitimate codes are filtered)
- Bug 4 fix: Very low risk (removing dead code path)
- Bug 5 fix: Low risk (additive post-processing check)

## Files Modified

1. `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (Changes A, B, C, F)
2. `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (Change D)
3. `supabase/functions/ai-agriculture-chat/index.ts` (Change E)
