# Pipeline Stability Fixes v5.5 — Architectural Correction Specification

## Fixes Applied (2026-03-02)

### v5.5 Fixes (Current) — Supreme Law + Response Format Types

#### BUG 12: Observable Characteristics Never Used for Rule Matching — FIXED
- **File:** `bundled-rules/loader.ts:933` (`makeExecutable`)
- **Root cause:** All 459 SUGARCANE rules have `condition_code = 'STAGE_GENERAL'`. The `conditions_json.observations` contain diagnostic-level codes (e.g., `ORANGE_RED_DOTS_AT_NODES`) that don't match farmer-facing NLU codes (e.g., `POOR_TILLERING`). The `observable_characteristics` column DOES contain matching farmer-facing codes, but `makeExecutable()` only called `evaluateConditionsJson()` — never checking `observable_characteristics`.
- **Fix:** Added secondary matching path in `makeExecutable()`: when `evaluateConditionsJson()` fails, check `observable_characteristics` array for symptom matches using exact, containment, and root-word matching. Populates condition ledger for downstream scoring.

#### BUG 13: Observation Matching Too Strict (No Root-Word Matching) — FIXED
- **File:** `bundled-rules/loader.ts:748` (`evaluateConditionsJson` observations section)
- **Root cause:** `conditions_json.observations` matching only used exact string match and substring containment. Codes like `STUNTED_PLANTS` vs `STUNTED_GROWTH` (sharing root word `STUNTED`) never matched.
- **Fix:** Added root-word matching: split both observation codes into words, check for shared words with length > 3 characters.

#### BUG 14: data_authority_rank Not Used in Primary Decision Scoring — FIXED
- **File:** `agents/layered-rule-evaluator.ts:740`
- **Root cause:** Scoring sort only used `evidenceScore` then `confidence_score`. The `data_authority_rank` field (values 55-95 in DB) was loaded but never used for selection, making ICAR-validated rules no different from generic advisories.
- **Fix:** Sort now uses: authority_rank DESC → evidenceScore DESC → priority DESC → confidence_score DESC.

#### Pipeline Health Monitoring — ADDED
- **File:** `agents/orchestrator.ts:4783`
- **Fix:** Added critical warning log when `rules_matched === 0` but `visual_symptoms.length >= 3`, logging crop, stage, symptoms, and evaluation count for fast diagnosis of future gaps.

## Previous Fixes

### v5.3
- BUG 11: DiagnosisOnlyMode guard checks wrong object — FIXED
- BUG 10: Symbolic Recommendations Never Reach primary_decision — FIXED

### v5.2
- BUG 6-9: Intent disconnection, missing scopes, prescription gate, Phase 3 override — FIXED

### v5.1
- BUG 1-5: ReferenceError, dual detector, stage drift, redundant execution, authority blocks — FIXED

## Guaranteed Invariants (v5.4)
1. `observable_characteristics` is used as secondary matching path when `conditions_json` matching fails
2. Root-word matching enables related symptom codes to match (e.g., STUNTED_PLANTS ↔ STUNTED_GROWTH)
3. `data_authority_rank` is the primary sort criterion for rule selection
4. Pipeline health anomalies (0 matches with 3+ symptoms) are logged as errors
5. All v5.1-v5.3 invariants remain in effect
