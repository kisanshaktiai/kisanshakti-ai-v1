

# Deep Audit Report: Neuro-Symbolic Pipeline — Observation Handling, Validation & Cross-Stage Reasoning

---

## Critical Findings

### Bug 1: LLM Validator Silently Drops 219 Observation Codes (CRITICAL)

**Root Cause**: `llm-output-validator.ts` line 104-107 queries `observation_master` with `is_active = true` but **no `.limit()` override**. Supabase default limit is 1000 rows. There are **1,219 active observations**. Result: 219 codes are silently excluded from the valid set.

**Impact**: Valid observations get rejected → symbolic engine receives fewer symbols → weaker rule matches. Some invalid observations pass through → phantom diagnostic options.

**Fix**: Add `.limit(2000)` to the `loadValidObservationCodes` query (line 104-107). Same fix needed for `loadCropApplicableObservations` which fetches 514 decision_rules for SUGARCANE (under 1000 but should have explicit limit for safety). Also add `.limit(2000)` to `loadValidIntentCodes` (currently 35 intents, safe but defensive).

**Files**: `supabase/functions/ai-agriculture-chat/utils/llm-output-validator.ts` lines 104, 57, 149

---

### Bug 2: ExtractObs Boolean Object Leakage (ALREADY FIXED — Verify Completeness)

**Current State**: `extractObservableCharacteristics()` at line 319-326 correctly handles legacy `{dead_heart: true}` boolean objects by converting to `["DEAD_HEART"]` string arrays.

**Remaining Risk**: The boolean keys are raw DB field names (lowercase `dead_heart`) which get uppercased to `DEAD_HEART`. But some DB entries may have keys like `central_shoot_dried_and_pulled_out` → `CENTRAL_SHOOT_DRIED_AND_PULLED_OUT` which may not exist in `observation_master`, creating phantom keys in the UI.

**Fix**: After boolean→array conversion (line 324), add a filter against the validator cache or `observation_master`. Since this would require async (DB call), a simpler fix is to add a max-length filter: reject any key > 30 chars that isn't in a known-good set.

**Files**: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` line 322-325

---

### Bug 3: Cross-Stage Fallback Allows SEEDLING Rules for GRAND_GROWTH Crops (PARTIALLY FIXED)

**Current State**: Line 609-616 falls back to ALL rules (`rulesRaw`) when stage filtering removes everything. This means SEEDLING-specific rules (e.g., germination failures) can appear as diagnostic options for a DAS=99 GRAND_GROWTH crop.

**Existing Mitigations**: 
- Temporal filter (line 692-709) uses `crop_age_days_min/max` to remove early-stage rules
- Stage relevance scoring (line 740) penalizes mismatched stages
- But fallback at line 616 bypasses stage filter entirely

**Root Cause**: The fallback is too aggressive. It should fall back to **stage-adjacent** rules (e.g., TILLERING ± GRAND_GROWTH), not ALL rules.

**Fix**: Replace the all-or-nothing fallback at line 616 with a graduated stage proximity filter:
1. First try exact stage match
2. If empty, try adjacent stages (±1 in phenology order)
3. If still empty, try same category rules regardless of stage
4. Never include SEEDLING rules for DAS > 60

**Files**: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` lines 609-616

---

### Bug 4: Widget Shows Internal Diagnostic Flags (ALREADY FIXED)

**Current State**: The `extractObservableCharacteristics()` function correctly filters and normalizes observations. The `diagnosis-first-generator.ts` has a validation layer (referenced in memory) that filters keys > 25 chars without `observation_translations` entries.

**Remaining Gap**: The `ClarificationOptionsUI.tsx` receives options with `observation_key` fields. If a key like `INTERNODE_BORER` (a diagnostic code, not an observable symptom) reaches here, the farmer sees a technical term instead of a description like "खोडात छिद्र पडली" (holes in stem).

**Fix**: In `diagnosis-first-generator.ts`, after label resolution (lines 391-396), add an explicit gate: if `observationLabel` is still in ALL_CAPS_UNDERSCORE format (raw code), replace with the `description_text` from `observation_translations` or skip the option.

**Files**: `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts` lines 391-396

---

### Bug 5: BORER_IDENTIFICATION Intent Never Routes (NEW FINDING)

**Root Cause**: `observation_intent_master` has `BORER_IDENTIFICATION` with 8 mapped observations (`DEAD_HEART`, `STEM_BORING_MARKS`, `FRASS_VISIBLE`, etc.). But the semantic extractor/intent classifier (`intent-classifier.ts` line 362) lists valid intents as `STEM_DAMAGE` for borer queries. The more specific `BORER_IDENTIFICATION` is never in the LLM's valid intent list.

**Impact**: A farmer saying "खोडात भोक पडली" gets classified as `STEM_DAMAGE` → resolved to generic stem observations. The richer `BORER_IDENTIFICATION` → `[DEAD_HEART, STEM_BORING_MARKS, FRASS_VISIBLE, BORER_HOLES, ...]` mapping is completely unused.

**Fix**: Add `BORER_IDENTIFICATION` to the valid intent list in `intent-classifier.ts` line 362 with description. Also add a secondary intent expansion in the orchestrator: when `STEM_DAMAGE` is detected AND borer keywords are present in the original message, expand intent to include `BORER_IDENTIFICATION` observations.

**Files**: 
- `supabase/functions/ai-agriculture-chat/agents/intent-classifier.ts` line 362
- `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts` (intent expansion block)

---

### Bug 6: Hypothesis Evaluator `.limit(500)` May Exclude Rules (MODERATE)

**Current State**: Line 557 uses `.limit(500)` but there are 514 active SUGARCANE rules. The query uses `ilike` matching for crop variants (`sugarcane`, `sc`, `all`) which returns more than just SUGARCANE rules. With 584 total active rules and multi-crop variant matching, some rules could be excluded.

**Fix**: Increase to `.limit(800)` to provide safe headroom.

**Files**: `supabase/functions/ai-agriculture-chat/decision/hypothesis-evaluator.ts` line 557

---

## Scalability Audit (1M+ Users)

### LLM Validator
- **Current**: 15-min TTL cache with concurrency lock — good pattern
- **Issue**: First request after cold start loads 1,219 observation rows + 514 decision rules
- **Fix**: Already uses `loadingPromise` lock. The `.limit(2000)` fix is sufficient. Cache is O(1) lookup after load.

### Hypothesis Evaluator  
- **Current**: Loads 500+ rules per evaluation, filters in-code
- **Issue**: 4 sequential DB queries (rules, obsMetadata, canonical_group_mapping, temporal filter)
- **Recommendation (P2)**: Pre-index rules by `crop_code + stage` composite. Not blocking but important at scale.

### Observation Metadata Loading
- **Current**: Per-request query against `observation_master` (line 627-630) with `.in()` filter
- **Status**: Cached in `symbolic-reasoner.ts` with 5-min TTL — acceptable

---

## Implementation Plan

### Phase 1: Critical Fixes (P0)

| # | Fix | File | Lines |
|---|-----|------|-------|
| 1 | Add `.limit(2000)` to all 3 LLM validator queries | `llm-output-validator.ts` | 57, 104, 149 |
| 2 | Increase hypothesis evaluator limit to 800 | `hypothesis-evaluator.ts` | 557 |
| 3 | Add `BORER_IDENTIFICATION` to intent classifier valid list | `intent-classifier.ts` | 362 |
| 4 | Add boolean-key length filter (≤30 chars or in observation_master) | `hypothesis-evaluator.ts` | 322-325 |

### Phase 2: Stage Safety (P1)

| # | Fix | File | Lines |
|---|-----|------|-------|
| 5 | Replace all-or-nothing stage fallback with graduated proximity filter | `hypothesis-evaluator.ts` | 609-616 |
| 6 | Add ALL_CAPS label gate in diagnosis-first-generator | `diagnosis-first-generator.ts` | 391-396 |

### Phase 3: Architecture (P2 — No code changes now, guidance only)

- Pre-index rules by `crop_code + canonical_group` for O(1) lookup
- Add `observation_type` column to `observation_master` (OBSERVABLE / DIAGNOSTIC / INTERNAL)
- Build intent graph in DB replacing static intent list in classifier prompt

---

## What This Does NOT Change

- No database schema changes
- No data updates (INSERT/UPDATE/DELETE)
- No changes to symbolic reasoner core logic
- No changes to LLM formatter or response builder
- No frontend UI changes

