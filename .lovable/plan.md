
## What the new edge log is telling us (step-by-step)

### 1) The system is stuck in “awaiting_clarification” and **hard-blocking NLU**
From your log:

- `state: "awaiting_clarification"`
- `clarification_active: true`
- `pending_options_count: 4`
- `🔒 Clarification HARD GATE active - NLU pipeline BLOCKED`
- `⚠️ [ClarificationGate] No valid option selected — returning reminder (NLU BLOCKED)`

The farmer message in this trace is a **new question**:
- `Message: फुटवे वाढवण्यासाठी काय उपाय करावा?` (How to increase tillers?)

But because the session still has pending clarification options from a previous turn, the orchestrator treats the message as an attempted option selection. It fails to match it to an option → returns a reminder clarification → the farmer sees “fallback” behavior again.

### 2) Even when “Diagnosis-first” runs, it can still fall back because the hypothesis DB query is not reliably stage/crop-scoped
You previously fixed `extractObservableCharacteristics()` for legacy JSON objects. That was necessary, but it does **not** fix two other big causes of “0 candidates → fallback template”:

#### Cause A — **Crop code mismatch**
- `decision_rules.crop_code` in DB is **SC** (we verified: 425 active rules for `SC`)
- But many parts of the pipeline use **SUGARCANE**
- `hypothesis-evaluator.ts` currently queries using `cropLower = crop_code.toLowerCase()` and `.or(crop_code.eq.sugarcane, ... crop_code.eq.all)`  
  That will never match `SC` → so it can load **zero** relevant rules → `createUnknownDiagnosisResponse()` triggers the generic 3 options.

#### Cause B — **No stage filtering + hard limit(100)**
Even if crop matches, the evaluator loads up to 100 rules without a stage constraint. With 425 sugarcane rules, you can easily fetch 100 rules that are not SEEDLING-relevant; then stage relevance filtering in code can discard them → again “0 candidates”.

This combination is exactly how you get the generic fallback options even after the legacy observable_characteristics parsing fix.

---

## Root causes (actionable)
1) **Clarification Hard Gate design bug**: If the farmer types a new question while options are pending, we keep the gate locked and return reminder instead of clearing stale options and processing the new query.
2) **Hypothesis evaluator DB query bug**: crop code normalization and stage scoping are incorrect/insufficient; the query can miss SC rules or miss SEEDLING rules due to the `limit(100)`.

---

## Implementation plan (production-ready fixes, language-agnostic)

### Phase 1 — Fix the “clarification lock deadloop” without language dictionaries
**Goal:** If farmer types a new question during pending options, do not trap them in reminder loops.

#### 1.1 Improve option selection matching (language-agnostic string normalization)
**File:** `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts`  
**Change:** Enhance `matchFarmerResponseToOption()` to compare normalized text:

- Strip emojis/symbols
- Remove `[obs_keys:...]`
- Keep only letters/numbers/spaces (Unicode-safe)
- Collapse whitespace
- Compare:
  - numeric selection (already)
  - exact normalized match
  - strong substring match
  - simple similarity threshold (e.g., token overlap), still language-agnostic

This makes typed selections like “कीड” match “🐛 कीड/किडीचा हल्ला” reliably (without Marathi keyword lists—just normalization).

#### 1.2 If no option matches, treat it as a NEW QUERY and clear stale clarification (fail-open to NLU)
**File:** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`  
**Change:** In the “pending options > 0” hard-gate block:

- If message:
  - is NOT numeric-only, AND
  - has NO `[obs_keys:...]`, AND
  - does NOT match any pending option even after improved normalization
- Then:
  - clear `pendingClarificationOptions` + `pendingClarificationScope`
  - proceed to the normal NLU pipeline (do not return reminder)

This is the key behavioral fix that makes the system usable in real farm conversations (farmers often ask a different question mid-flow).

**Why this is consistent with LLM-first language independence:**  
We are not classifying agronomic meaning using keywords. We’re only deciding whether the input is an option selection vs free text—pure interaction routing.

---

### Phase 2 — Fix hypothesis-driven options so “fallback 3 options” stops happening
**Goal:** Ensure Diagnosis-first uses real SC + stage rules from DB and produces dynamic options.

#### 2.1 Fix crop-code normalization in `evaluateCandidateHypotheses()`
**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`  
**Change:**
- Convert incoming crop code (often `SUGARCANE`) into DB equivalents (`SC`, `ALL`) using the existing mapper (`normalizeCropCodeForDB` / `getCropCodeVariants` from `agents/type-mappers.ts`) or move that mapping into a new utils module to avoid cross-layer coupling.
- Query `decision_rules` using `.in('crop_code', variants)` instead of `crop_code.eq.sugarcane`.

Expected effect: Seedling sugarcane rules stop being missed.

#### 2.2 Add stage_applicable filtering in the DB query (remove reliance on random 100)
**File:** `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`  
**Change:**
- Use `getStageQueryVariants(growth_stage)` from `utils/stage-normalizer.ts`
- Build a PostgREST `or()` filter for:
  - `stage_applicable.cs.{SEEDLING}` (and variants like GERMINATION/PLANTING if desired)
  - `stage_applicable.cs.{ALL}`
- Increase limit to a safer number (e.g., 300–500) or eliminate it once stage filter is applied.

Expected effect:
- Hypothesis evaluator consistently finds candidates for SC/SEEDLING rather than “0 candidates”.

#### 2.3 Add explicit logs for: crop variants + stage variants + DB hit counts
So production debugging is easy:
- crop input, db crop variants used
- stage input, stage variants used
- rules loaded before/after temporal filter
- top 4 candidates + their rule_ids

---

### Phase 3 — Replace the hardcoded 3-option “UNKNOWN” fallback with DB-driven fallback (SSOT)
Even after fixes, there will be cases where candidates are legitimately zero (data gaps, mis-tagged rules, etc.). In production, we should still never show the static Water/Pest/Nutrient trio.

**Goal:** If no candidates, still show **stage-scoped symptom options from DB**.

#### 3.1 Implement a DB-driven fallback option builder (crop+stage scoped)
**Primary location (preferred):** `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`  
When `hypothesisResult.candidates.length === 0`, instead of calling `createUnknownDiagnosisResponse()`:

- Query `decision_rules` for:
  - crop_code variants (SC/ALL)
  - stage_applicable contains current stage or ALL
  - `observable_characteristics` not null/empty
- Extract observation keys from `observable_characteristics`:
  - handle both legacy object `{dead_heart:true}` and array formats
- Rank by frequency (and optionally diagnostic power)
- Pick top 3 keys
- Load farmer-facing labels from `observation_translations` using:
  - `loadObservationLabels()` (`i18n/observation-label-loader.ts`)
- Return a `CLARIFICATION_QUESTION` with options embedding `observation_key`
- Always include a photo option

This produces dynamic, crop-stage-specific symptom choices with no hardcoded Marathi/Hindi.

#### 3.2 Keep `createUnknownDiagnosisResponse()` only as last-resort emergency fallback
Optionally leave it in code, but it should almost never be used.

---

## Verification checklist (what we will validate after implementation)

### Scenario A: Original issue (damage query)
Input: “नवीन लावण केलेला ऊस काही ठिकाणी वाळला”
- Expect: options derived from SC + SEEDLING rules (e.g., dead heart / patchy wilting / gaps) or intent_observation_mapping-driven symptoms, not Water/Pest/Nutrient trio.

### Scenario B: New question while clarification pending (your new log)
While pending options exist, farmer asks: “फुटवे वाढवण्यासाठी काय उपाय करावा?”
- Expect: system clears stale clarification and answers the question (or routes to correct advisory module) instead of repeating reminder/fallback.

### Scenario C: Typed option label (without clicking)
Farmer types: “कीड”
- Expect: it matches the pending “कीड/किडीचा हल्ला” option via normalization and continues the clarification path.

### Logs we should see (success indicators)
- HypothesisEval: `Loaded X candidate rules from database` (X > 0 for SC/SEEDLING)
- No `PRIMARY_ACTION_INVALID` due to empty matched responses for known contexts
- No repeated `ClarificationGate ... returning reminder` when farmer sends a long free-text question

---

## Files we will modify
1) `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`
   - Clarification hard-gate: clear stale pending options on non-matching free text
   - Replace “0 candidates → static unknown” with DB-driven fallback options
2) `supabase/functions/ai-agriculture-chat/agents/clarification-generator.ts`
   - Make `matchFarmerResponseToOption()` normalization robust and language-agnostic
3) `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts`
   - Fix crop_code query (SC vs SUGARCANE)
   - Add stage_applicable filtering to avoid random-limit misses
   - Improve debug logs

(Optional hardening)
4) `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`
   - Leave as-is or reduce reliance on hardcoded unknown fallback (after orchestrator fix, it becomes unused).

---

## One decision needed from you (quick)
When farmers are in “awaiting_clarification” and they type free text that doesn’t match options:
- Option 1 (recommended): treat as NEW question and clear pending options immediately.
- Option 2: keep returning reminder (current behavior).

I will implement Option 1 unless you explicitly want Option 2.
