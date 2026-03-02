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

## Fixes Applied (v5.6) — Remaining 3 Parts

#### FIX 17: Diagnostic Pre-filter (PART 7) — IMPLEMENTED
- **File:** `agents/orchestrator.ts` (Phase 2.6 rule loading)
- **Root cause:** DEAD_HEART/BORER evidence present but irrigation/nutrition rules ranked higher
- **Fix:** When PEST_EVIDENCE_CODES detected in observations, pest-category rules are prepended at top priority before general rule evaluation. Prevents irrigation rules from being primary when dead heart evidence is present.

#### FIX 18: Dual Independent Confidence (PART 8) — IMPLEMENTED
- **File:** `decision/confidence-calculator.ts`
- **Root cause:** data_quality_confidence (38.5%) merged with symptom confidence, producing falsely low combined score that blocked prescriptions
- **Fix:** `ConfidenceScore` now includes `data_quality_confidence` and `symptom_diagnosis_confidence` as independent signals. Symptom confidence (rule_matching + symptom_specificity) drives diagnosis; data quality (completeness + freshness) drives dosage precision. Overall weights rebalanced: data_quality reduced 0.20→0.15, symptom_specificity increased 0.20→0.30.

#### FIX 19: Session Continuity (PART 10) — IMPLEMENTED
- **File:** `index.ts` (session state tracking)
- **Fix:** Session state now tracks `problems_discussed` array (last 10 problems with codes, diagnoses, timestamps), `last_query_hash` for repeat-concern detection (>70% similarity within 30 min → escalate), and causal chain detection (previous borer diagnosis + current growth issue → likely consequence). Data passed to orchestrator for logging.

## Remaining Work
- All 11 PARTS from architectural spec are now implemented (v5.1-v5.6)

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
