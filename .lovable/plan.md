# Pipeline Stability Fixes v5.5 — Architectural Correction Specification

## Fixes Applied (2026-03-02)

### v5.5 Fixes (Current) — Supreme Law + Response Format Types

#### FIX 15: Intent Classification for Prescription Requests — FIXED
- **Files:** `decision/intent-resolver.ts`, `agents/intent-classifier.ts`
- **Root cause:** "काय टाकू" / "काय द्यायचं" (what to apply) was classified as UNKNOWN_OBSERVATION, routing to no-action path
- **Fix:** Added `INPUT_RECOMMENDATION` intent code. Emergency keyword fallback now routes prescription requests (काय टाकू, काय मारू, उपाय) to INPUT_RECOMMENDATION instead of UNKNOWN. Problem+prescription queries (फुट कमी + काय टाकू) route to the problem intent (GROWTH_ANOMALY).

#### FIX 16: LLM Formatter 5 Response Format Types — IMPLEMENTED
- **File:** `agents/llm-response-formatter.ts` (buildFormattingSystemPrompt)
- **Root cause:** Single generic WHAT-WHY-HOW template for all scenarios. LLM invented HOW sections when no actions existed.
- **Fix:** System prompt now selects from 5 mandatory format types based on action_type:
  - FORMAT 1: Direct Prescription (RECOMMEND + product fields populated)
  - FORMAT 2: Clarification Needed (partial symptoms)
  - FORMAT 3: Monitoring Advisory (MONITOR action)
  - FORMAT 4: Stage Advisory Fallback (zero rules fired)
  - FORMAT 5: Pest Emergency (URGENT_ACTION + HIGH/CRITICAL risk)
- **Supreme Law enforced:** Generic phrases like "कीड मारायची दवा वापरा" forbidden. Missing dosage triggers "मला अधिक माहिती हवी आहे" instead.
- **Dosage calculation:** Total = dosage_per_acre × land_area, shown as total not per-acre.
- **Rural language:** भाऊ/दादा addressing, फवारणी not छिडकाव, मेलेला गाभा not डेड हार्ट.

## Remaining Work (Next Session)
- Session continuity: problems_discussed list, repeat-concern detection
- Diagnostic pre-filter: pest evidence (DEAD_HEART, BORER) forces PEST_MANAGEMENT rules first
- Independent confidence: separate data_quality_confidence from symptom_diagnosis_confidence

## Previous Fixes

### v5.4
- BUG 12-14: Observable characteristics matching, root-word matching, data_authority_rank sorting — FIXED
- Pipeline health monitoring — ADDED

### v5.3
- BUG 10-11: Symbolic recommendations reach primary_decision, DiagnosisOnlyMode guard — FIXED

### v5.2
- BUG 6-9: Intent disconnection, missing scopes, prescription gate, Phase 3 override — FIXED

### v5.1
- BUG 1-5: ReferenceError, dual detector, stage drift, redundant execution, authority blocks — FIXED

## Guaranteed Invariants (v5.5)
1. "काय टाकू" patterns classify as INPUT_RECOMMENDATION, never UNKNOWN_OBSERVATION
2. LLM formatter selects response format type from action_type, not its own judgment
3. Generic pesticide phrases without specific product from rules are FORBIDDEN
4. Missing dosage/active_ingredient → HOW section replaced with clarification request
5. Total dosage calculated as dosage_per_acre × land_area for farmer's specific field
6. All v5.1-v5.4 invariants remain in effect
