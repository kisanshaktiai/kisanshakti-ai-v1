# Pipeline Stability Fixes v5.5 — Architectural Correction Specification

## Fixes Applied (2026-03-02)

### v6.0 Fixes (Current) — Deep Forensic Audit Critical Code Fixes

#### FIX 20: `required_symptoms` Orphan Key Unblocked — FIXED
- **File:** `bundled-rules/loader.ts` (evaluateConditionsJson)
- **Root cause:** `required_symptoms` key (array) in 17 rules hit generic object fallback → UNEVALUABLE with required=true → permanently blocked ALL shoot borer treatment rules (SC_PEST_EARLY_SHOOT_BORER_004, SC_PEST_TOP_BORER_004)
- **Fix:** Added `required_symptoms` to observation key handler (alongside `observations`, `symptom`, `primary_symptom`). Marked as `required: false` (soft requirement) since farmers describe symptoms in lay terms, not clinical confirmation codes. Array values are matched against expandedObs using exact, containment, and root-word matching.

#### FIX 21: `roi_by_region`/`roi_modifier` Object Keys Unblocked — FIXED
- **File:** `bundled-rules/loader.ts` (CATEGORY_G_KEYS + generic object fallback)
- **Root cause:** 29 soil/nitrogen rules had `roi_by_region` (nested JSON object) → UNEVALUABLE → required=true → permanently blocked
- **Fix:** Already in CATEGORY_G_KEYS. Additionally, the generic object/array fallback at end of evaluator now marks unknown objects/arrays as `required: false` with SKIPPED_NO_DATA instead of UNEVALUABLE with required=true. This prevents any remaining orphan object keys from blocking rules.

#### FIX 22: `requires_diagnosis_confidence` Threshold Key — FIXED
- **File:** `bundled-rules/loader.ts`
- **Root cause:** 9 rules had numeric threshold with no evaluator → UNEVALUABLE → blocked
- **Fix:** Explicit handler marks as SKIPPED_NO_DATA with required=false (soft gate).

#### FIX 23: `requires_confirmation` String Key — FIXED
- **File:** `bundled-rules/loader.ts`
- **Root cause:** 7 rules had string rule_id treated as boolean → wrong result
- **Fix:** Explicit handler marks as SKIPPED_NO_DATA with required=false (soft prerequisite).

#### FIX 24: Expanded CATEGORY_G Informational Keys — FIXED
- **File:** `bundled-rules/loader.ts` (CATEGORY_G_KEYS set)
- **Root cause:** `ipm_priority`, `crop_cycle`, `diagnosis_method`, `requires_identification`, and other context keys were falling through to generic handlers → FAILED or UNEVALUABLE → blocked rules
- **Fix:** Added 13 additional keys to CATEGORY_G_KEYS: `ipm_priority`, `duration_days_info`, `diagnosis_method`, `requires_identification`, `soil_type`, `soil_type_name`, `variety`, `trait`, `region`, `farming_mode`, `monsoon_timing`, `yield_potential`, `crop_cycle`.

#### FIX 25: Generic Object/Array Fallback Made Non-Blocking — FIXED
- **File:** `bundled-rules/loader.ts` (end of evaluateConditionsJson)
- **Root cause:** Any unrecognized object/array condition value hit `UNEVALUABLE, required: true` → permanent block
- **Fix:** Unknown arrays are now treated as soft observation lists (matched against expandedObs, required: false). Unknown objects are marked SKIPPED_NO_DATA with required: false.

#### BUG-003 Boolean-Object observable_characteristics — ALREADY FIXED
- **File:** `bundled-rules/loader.ts` (normalizeObservableChars)
- `normalizeObservableChars` already converts `{dead_heart: true}` → `["DEAD_HEART"]` at load time. The 64 rules with boolean-object format were already being normalized to arrays before reaching makeExecutable.

### Impact Summary
- **17 shoot borer treatment rules** — UNBLOCKED (were permanently blocked)
- **29 soil/nitrogen management rules** — UNBLOCKED
- **9 diagnosis confidence rules** — UNBLOCKED
- **7 confirmation prerequisite rules** — UNBLOCKED
- **~16 IPM priority rules** — UNBLOCKED
- **~14 crop cycle rules** — UNBLOCKED
- **Total rules unblocked: ~92 rules** previously permanently blocked by orphan condition keys

### Remaining DB Data Gaps (require manual data population)
- 450 rules missing `active_ingredient` (14% coverage)
- 479 rules missing `application_method` (8% coverage)
- 490 rules missing `roi_cost_saved_min/max` (6% coverage)
- 5 FERT_SCHEDULE rules with NULL action_text
- 45 orphan observation codes not in observation_master
- ~484 observation codes missing Marathi translations
- 184 rules with empty observable_characteristics

### Forward Chaining (enables_rule_ids, triggers_rule_ids) — DEFERRED
- Columns populated in DB but not evaluated in code
- Requires separate implementation sprint

## Guaranteed Invariants (v6.0)
1. `required_symptoms` array keys are evaluated as soft observation matches, never block rules
2. Unknown object/array condition values are non-blocking (required: false)
3. All informational/context keys in CATEGORY_G never block rule firing
4. `requires_diagnosis_confidence` and `requires_confirmation` are soft gates
5. Boolean-object observable_characteristics normalized to arrays at load time
6. All v5.1-v5.6 invariants remain in effect

## Previous Fixes

### v5.5-v5.6
- FIX 15-19: Intent classification, LLM formatter formats, diagnostic pre-filter, dual confidence, session continuity

### v5.4
- BUG 12-14: Observable characteristics matching, root-word matching, data_authority_rank sorting

### v5.3
- BUG 10-11: Symbolic recommendations reach primary_decision, DiagnosisOnlyMode guard

### v5.2
- BUG 6-9: Intent disconnection, missing scopes, prescription gate, Phase 3 override

### v5.1
- BUG 1-5: ReferenceError, dual detector, stage drift, redundant execution, authority blocks
