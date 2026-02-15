

# Fix Plan: AI Chat LLM Response Quality and Farmer-Friendliness

## Critical Bugs Found

### Bug 1: Biocontrol Hallucination in Non-Pest Queries
The `buildRecommendationSummary()` function unconditionally appends Trichogramma/Cotesia biocontrol dosage hints to the LLM prompt if the keyword appears ANYWHERE in the decision JSON. For a weed query, the system matched pest rules (Early Shoot Borer, Smut) at 55% confidence, and the biocontrol reminder leaked into the LLM prompt, causing the LLM to recommend "Trichogramma chilonis: 50,000 parasitoids/acre" for a WEED problem.

**Evidence**: Recent chat shows farmer asked "ऊसापेक्षा तण जास्त वाढत आहेत" (weeds growing more than sugarcane) and got Trichogramma/Cotesia recommendation.

### Bug 2: Untranslated "Cultural practice" in Marathi Responses
Both LLM-formatted and template-fallback responses show raw English "Cultural practice" in Marathi output. The `buildRecommendationSummary()` passes `action_type` as-is to the LLM without translation, and the `buildTemplateFallback()` also leaks English product names when action is generic.

**Evidence**: 3 of 5 recent responses contain "Cultural practice" in Marathi text.

### Bug 3: System Prompt Injects Irrelevant Biocontrol Instructions
The system prompt (`buildFormattingSystemPrompt`) hardcodes "Trichogramma chilonis: 50,000 parasitoids/acre" and "Cotesia flavipes: 5,000 cocoons/acre" regardless of query type. This primes the LLM to mention these even when irrelevant.

### Bug 4: Token Limit Too Low for Devanagari
`max_tokens: 600` for both OpenAI and Gemini is insufficient for Marathi/Hindi agronomic advice. Devanagari script uses ~1.5x more tokens than English. Structured responses (What-How-Why) need at minimum 800 tokens.

### Bug 5: `NO_ACTION_REQUIRED` Rules Missing `action_text`
39 rules with `action_type = NO_ACTION_REQUIRED` have NULL `action_text`, causing fallback text "[Action text unavailable -- data error]" to appear.

### Bug 6: `knowledge_text` in English, Prompt Says "Use Exact Text"
The `buildRecommendationSummary()` labels knowledge_text as "STRUCTURED RESPONSE (USE THESE EXACT TEXTS)" but the DB stores them in English. The LLM gets contradictory instructions: "output in Marathi" but "copy these English texts exactly."

---

## Implementation Plan

### File 1: `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts`

**Change A: Fix biocontrol hallucination (lines ~996-1005)**
- Remove the unconditional biocontrol dosage reminder block
- Only include biocontrol dosage if primary_decision.action_type is explicitly a biocontrol/biological treatment AND the primary_decision or secondary_actions mention Trichogramma/Cotesia

**Change B: Fix system prompt (lines ~704-778)**
- Remove hardcoded "Trichogramma chilonis: 50,000 parasitoids/acre" from the system prompt footer
- Add instruction: "TRANSLATE action_text and knowledge_text to the farmer's language. These are reference texts, NOT verbatim copy targets."
- Replace "COPY THIS TEXT EXACTLY" with "TRANSLATE this into farmer-friendly {language}"

**Change C: Increase max_tokens (lines ~1089, ~1146)**
- OpenAI: `max_tokens: 600` -> `max_tokens: 900`
- Gemini: `maxOutputTokens: 600` -> `maxOutputTokens: 900`
- Lovable: keep at 800 (already adequate)

**Change D: Translate action_type in recommendation summary (lines ~887-978)**
- In `buildRecommendationSummary()`, translate action_type using existing `getActionTranslation()` before passing to LLM
- Change "STRUCTURED RESPONSE (USE THESE EXACT TEXTS)" label to "REFERENCE TEXTS (TRANSLATE TO {language})"

**Change E: Fix matched_responses label (lines ~1007-1041)**
- Change "COPY THIS TEXT EXACTLY (LEGACY)" to "TRANSLATE this response to farmer's language"

**Change F: Handle NO_ACTION_REQUIRED fallback (lines ~915-930)**
- When `action_text` is NULL and `action_type` is `NO_ACTION_REQUIRED`, use `knowledge_text` as the primary response content instead of showing error text
- Add fallback: `actionText = knowledgeText || reasonText || 'No action required at this time.'`

### File 2: `supabase/functions/ai-agriculture-chat/utils/response-mode-renderer.ts`

**Change G: Add Punjabi and Tamil templates (lines ~97-149)**
- Add `pa` and `ta` entries to `MODE_TEMPLATES` for all modes (currently only mr/hi/en supported)
- This ensures farmer app language selection is respected

### File 3: `supabase/functions/ai-agriculture-chat/index.ts`

**Change H: Language consistency for LLM formatter (lines ~1035-1042)**
- Ensure `formatterInput.language` uses `detectedLanguage` (already done, but verify the `detectedLanguage` function correctly handles Punjabi/Tamil inputs)

---

## Technical Details

### Biocontrol Guard Logic (Change A)
```text
BEFORE: if (JSON.stringify(decision).toLowerCase().includes('trichogramma'))
         -> Always adds biocontrol dosage block

AFTER:  Only add if primary_decision.action_type includes 'biological'
        OR primary_decision.active_ingredient mentions trichogramma/cotesia
```

### Token Budget Calculation (Change C)
- Marathi structured response (What-How-Why + greeting + closing): ~400-500 Devanagari tokens
- Each Devanagari character = ~1.5 tokens vs English
- Current 600 tokens = ~400 Devanagari characters = truncated responses
- New 900 tokens = ~600 Devanagari characters = complete responses

### NO_ACTION_REQUIRED Fallback Chain (Change F)
```text
Priority 1: action_text (if not null)
Priority 2: knowledge_text (contains detailed info guides)
Priority 3: reason_text
Priority 4: Localized default "No action required"
```

### Files Modified
1. `supabase/functions/ai-agriculture-chat/agents/llm-response-formatter.ts` (Changes A-F)
2. `supabase/functions/ai-agriculture-chat/utils/response-mode-renderer.ts` (Change G)
3. `supabase/functions/ai-agriculture-chat/index.ts` (Change H - verification)

### Risk Assessment
- Low risk: All changes are in the narration/formatting layer, not in the symbolic brain
- Safety preserved: The symbolic brain still controls what recommendations are made
- No new LLM authority: LLM still cannot add products, dosages, or actions
- Backward compatible: Template fallback paths remain functional

