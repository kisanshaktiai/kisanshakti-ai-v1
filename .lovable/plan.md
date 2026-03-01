# Pipeline Stability Fixes v5.3 — In Progress

## Fixes Applied (2026-03-01)

### v5.3 Fixes (Current)

#### BUG 10: Symbolic Recommendations Never Reach primary_decision — FIXED
- **File:** `orchestrator.ts:4989`
- **Root cause:** Symbolic reasoner merged `rules_matched`, `diagnoses`, and `prescriptions` into `layeredRuleResult`, but NEVER merged into `matched_responses` or built a `primary_decision`. This caused `eligibleResponses = 0` → `RULE_DATA_INTEGRITY_ERROR` → clarification fallback.
- **Fix:** After merging prescriptions, also push symbolic recommendations into `matched_responses` with full `action_text`/`i18n_key`, and build `primary_decision` from the best recommendation.

### Previous Fixes (v5.1-v5.2)
1. `allObservationsForDiagCheck` ReferenceError → replaced with `[...allObservationsForPreAuth]`
2. Dual CropDamageDetector (v4+v5) → removed legacy v4, v5 sole authority
3. Stage drift (3 competing calculators) → stage immutability guard when locked
4. DiagnosisOnlyMode redundant execution → guard on symbolic reasoner confidence
5. Authority resolver blocks CROP → enforced_decision override before shouldSkipCropRules

### v5.2 Fixes (Current)

#### BUG 6: Intent Disconnection — SemanticExtractor→IntentLock — FIXED
- **File:** `orchestrator.ts:3899`
- **Root cause:** `detectedIntent` read from `nluOutput.intent_classification.primary_intent` (always UNKNOWN) instead of `semanticExtraction.intent_code` (correctly classified as STEM_DAMAGE at 90%)
- **Fix:** Priority chain: `semanticExtraction.intent_code` → `nluOutput.intent_classification.primary_intent` → `'GENERAL_QUERY'`

#### BUG 7: Missing symptom-based intent scopes — FIXED
- **File:** `intent-lock.ts:121-200`
- **Root cause:** `INTENT_SCOPE_MAP` had no entries for symptom intents (STEM_DAMAGE, LEAF_DAMAGE_VISIBLE, etc.), causing fallback to DEFAULT_SCOPE which only allowed INFORM/CLARIFY
- **Fix:** Added 13 symptom-based intent mappings with full PEST/DISEASE/IPM scopes and treatment actions

#### BUG 8: Prescription Gate blocks despite strong evidence — FIXED
- **File:** `canonical-state-builder.ts:1236`
- **Root cause:** `checkPrescriptionGate()` blocked on `DataConfidence.LOW` from missing optional soil/weather data, even with 10 observations at 88% coverage
- **Fix:** Added evidence override: if `symptom_count >= 5` OR `data_completeness >= 0.7`, allow prescription with warning

#### BUG 9: Phase 3 DiagnosticFlow overrides symbolic brain — FIXED
- **File:** `orchestrator.ts:5301-5352`
- **Root cause:** DiagnosticFlowController ran with UNKNOWN intent even after symbolic brain matched rules, returning GATHERING_INFO → clarification instead of diagnosis
- **Fix:** Skip Phase 3 entirely when `totalRulesMatched > 0`

## Guaranteed Invariants (v5.2)
1. `semanticExtraction.intent_code` is the primary intent source for IntentLock
2. All 11 symptom-based intents have proper scope mappings with treatment actions
3. Strong symptom evidence (≥5 observations or ≥70% coverage) overrides LOW data_confidence
4. DiagnosticFlowController does not run when symbolic brain already matched rules
5. All v5.1 invariants remain in effect
