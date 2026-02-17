

# Fix Plan: LLM 429 Resilience + Context-Enriched Intent Classification

## Problem Summary

The message "kahi thikani us mela aahe" (Romanized Marathi: "some spots, sugarcane died/affected") caused total pipeline shutdown because:

1. LLM returned 429 (rate limit) -- no retry logic exists
2. The intent classification prompt sends ONLY the raw farmer message with ZERO land context -- the LLM has no idea this is about Sugarcane at TILLERING stage with NDVI 0.36
3. Emergency keyword fallback only matches Devanagari/English, misses romanized Marathi
4. Induction Gate blocks symbolic brain at 0% coverage despite having full land context (Sugarcane/TILLERING/DAS 68/NDVI 0.36)

## Design Philosophy

The user is correct: we do NOT add keyword dictionaries for every word. The LLM is the language understanding layer. The fixes are:

1. Make the LLM actually run (retry on 429)
2. Give the LLM the land context it needs to understand better
3. Add a minimal safety net for when LLM is truly unavailable
4. Never let the pipeline produce a dead-end when land context exists

---

## Fix 1: Add Retry with Exponential Backoff

**File:** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`

Add a `callLLMWithRetry()` wrapper around the fetch call (lines 162-179). On HTTP 429, retry up to 2 times with exponential backoff (300ms, 600ms + jitter). Non-429 errors are thrown immediately. This replaces the single `fetch()` call.

---

## Fix 2: Enrich Intent Classification Prompt with Land Context

**File:** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`

This is the most critical fix. Currently the prompt (line 50-85) says:

```
Farmer message:
{farmer_message}
```

The LLM gets NO context about the crop, stage, DAS, NDVI, or soil. For romanized Marathi like "kahi thikani us mela aahe", the LLM needs to know this chat is about Sugarcane at Tillering stage.

Changes:
- Update `classifyFarmerIntent()` signature to accept optional land context: `classifyFarmerIntent(farmerMessage, landContext?)`
- Update the prompt to include land context when available:

```
Context (if available):
- Crop: Sugarcane
- Growth Stage: TILLERING (68 days after sowing)
- NDVI: 0.36
- Soil: Black Soil

Farmer message (may be in romanized Marathi/Hindi using Latin script):
"kahi thikani us mela aahe"
```

- Add explicit instruction: "The farmer may write in romanized regional languages (Marathi, Hindi, Tamil etc.) using Latin/English script. Interpret accordingly."
- Also add the 10 new intent codes (SOIL_TESTING_QUERY, SEED_SELECTION, etc.) to the prompt list

**File:** `supabase/functions/ai-agriculture-chat/agents/semantic-extractor.ts`

Update `extractSemanticMeaning()` to accept and pass land context to `classifyFarmerIntent()`.

**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

Update the call to `extractSemanticMeaning()` (line 2102) to pass the already-available `landContext` object.

---

## Fix 3: Minimal Emergency Crop-Only Fallback (NOT a keyword dictionary)

**File:** `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts`

In `emergencyKeywordFallback()` (lines 244-297), add ONLY the most common romanized crop names that indicate the farmer is talking about their crop being affected:

- `/\bus\b|oos/i` combined with `/mel[ae]|sukl[ae]|dead|affect/i` -> DISEASE_LIKE_PATTERN
- `/\bus\b|oos/i` combined with `/thim[ae]ki|thipke|dag|spot/i` -> LEAF_MARKS_OR_SPOTS

This is NOT a full dictionary. It handles only the top 3-4 romanized crop+symptom combinations for when LLM is completely unavailable. The LLM with enriched prompt (Fix 2) is the primary path.

---

## Fix 4: LLM Failsafe Override in Induction Gate

**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

After the router entity fallback block (line 2301) and BEFORE the induction gate (line 2491), add:

```
If LLM failed (intentCode === 'UNKNOWN_OBSERVATION' && intentConf < 0.2)
AND landContext has crop + growth_stage
THEN:
  - Set inductionResult.symbol_coverage to at least 0.25
  - Set inductionResult.aggregated_confidence to at least 0.4
  - Add landContext.current_crop as a crop symbol
  - Force shouldRunSymbolicBrain = true
  - Log: [LLM_FAILSAFE] Forcing symbolic evaluation with land context
```

This ensures the symbolic brain activates with the known crop/stage context and can at minimum generate a meaningful clarification question like "What exactly happened to your sugarcane?" rather than returning nothing.

---

## Files Modified

| File | Change |
|------|--------|
| `intent-classifier.ts` | Add retry with backoff; enrich prompt with land context; add minimal romanized fallback; accept landContext parameter |
| `semantic-extractor.ts` | Pass land context through to intent classifier |
| `orchestrator.ts` | Pass landContext to semantic extractor; add LLM failsafe override before induction gate |

## What Does NOT Change

- ObservationKey enum
- Symbolic reasoner evaluation logic
- Rule engine / decision_rules schema
- Ontology mappings in observation-code-mapper.ts
- Clarification system design
- Authority hierarchy
- Multilingual narration layer
- Query router (no romanized dictionaries added there)

## Expected Result

When "kahi thikani us mela aahe" is sent:

1. Intent classifier receives land context (Sugarcane/TILLERING/DAS 68/NDVI 0.36) in the prompt
2. LLM understands "us" = sugarcane (confirmed by context), "mela" = died/affected, "thikani" = spots/places
3. LLM returns DISEASE_LIKE_PATTERN or LEAF_MARKS_OR_SPOTS with high confidence
4. If LLM returns 429: retries 2 times with backoff
5. If still fails: minimal romanized fallback catches "us + mela" pattern
6. If all above fail: LLM failsafe forces symbolic brain with land context, generating a clarification question
7. Farmer NEVER sees a dead-end response

