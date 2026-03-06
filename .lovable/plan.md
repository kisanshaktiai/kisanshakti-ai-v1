# Pipeline Stability Fixes v7.5 — Category Routing + Confidence Gate Override

## v7.5 — Rule Category Routing Fix (2026-03-06)

### Critical Architectural Bug Fixed: Rules silently lost in OBSERVATION phase
- **Root Cause:** `mapBundledCategory()` defaulted unknown DB categories (`ipm`, `stage_problems`, `advisory`, `general`) to `RuleCategory.OBSERVATION`. Phase 1 (OBSERVATION) does NOT collect `matched_responses`, so these rules matched conditions but never reached the scoring/selection pipeline.
- **Fix 1:** `layered-rule-evaluator.ts` — Added explicit mappings: `ipm`→PRESCRIPTION, `stage_problems`→DIAGNOSIS, `advisory`→PRESCRIPTION, `biocontrol`→PRESCRIPTION, `general`→DIAGNOSIS
- **Fix 2:** `layered-rule-evaluator.ts` — Changed default from OBSERVATION→DIAGNOSIS for unmapped categories, with warning log
- **Impact:** SC_IPM_LIGHT_TRAP_001, SC_IPM_PHEROMONE_TRAP_001, SC_TILLER_PEST_001 and similar rules now reach matched_responses and compete for primary decision

## v7.4 — Confidence Gate Override + INVARIANT_FALLBACK Elimination (2026-03-06)

### Critical Bug Fixed: Rules matched but confidence gate blocked primary_decision
- **Root Cause:** PrescriptionGate override (strong symptom evidence) was NOT wired to layered evaluator's confidence gate (0.60 threshold). Rules matched but primary_decision stayed null, causing INVARIANT_FALLBACK.
- **Fix 1:** `layered-rule-evaluator.ts` — Added `prescriptionGateOverride` option; when true, relaxes threshold from 0.60 → 0.40
- **Fix 2:** `orchestrator.ts` — Passes `prescriptionGateOverride: true` when prescriptionGate.allowed && data_confidence=LOW
- **Fix 3:** `index.ts` — Fixed empty-array truthy bug in matched_responses fallback (empty `[]` was short-circuiting layered responses)
- **Fix 4:** `index.ts` — Aligned eligibility predicate: now accepts `reason_text || knowledge_text` (matching layered evaluator)
- **Fix 5:** `index.ts` — Added full diagnostic logging before INVARIANT_FALLBACK for future forensics

## v7.3 — Rich Field Propagation Fix (2026-03-06)

### Critical Bug Fixed: Deterministic Builder Receiving Empty Data
- **Root Cause:** DIAGNOSIS and BLOCKED push paths in `layered-rule-evaluator.ts` only propagated 4-9 fields instead of 50+
- **Fix 1:** `layered-rule-evaluator.ts` — DIAGNOSIS phase `matched_responses.push()` now includes all 50+ rich agronomic fields (matching PRESCRIPTION path)
- **Fix 2:** `layered-rule-evaluator.ts` — BLOCKED path `matched_responses.push()` now includes all 50+ rich agronomic fields
- **Fix 3:** `layered-rule-evaluator.ts` — `PrimaryDecision` interface expanded from 16 to 65+ fields with full type declarations
- **Fix 4:** `layered-rule-evaluator.ts` — PrimaryDecision assignment now propagates all fields without `(best as any)` casts
- **Fix 5:** `orchestrator.ts` — OPTION_SELECTED `application_details` expanded from 7 to 55+ fields
- **Fix 6:** `orchestrator.ts` — Recovery path `application_details` expanded from 15 to 55+ fields

### Data Flow After Fix
```
DB → loader → action_details (✅) → ALL push paths (✅) → PrimaryDecision (✅)
→ orchestrator application_details (✅) → extractRichRuleData (✅)
→ buildDeterministicResponse → structured sections with real data
```

## v7.2 — Deterministic Agronomic Response Hardening (2026-03-05)

### Module 1: Deterministic Builder Integration — DONE
- **Files:** `llm-response-formatter.ts`, `deterministic-response-builder.ts`
- `buildRecommendationSummary()` now calls `extractRichRuleData()` + `buildDeterministicResponse()` + `formatStructuredResponseForLLM()` when primary_decision has adequate rule content
- `buildTemplateFallback()` TREATMENT mode also uses deterministic builder
- Legacy manual prompt assembly retained as fallback only when rule content is inadequate
- All agronomic content in LLM prompt now sourced from `decision_rules` columns

### Module 2: Dose Safety Validation — DONE
- **File:** `deterministic-response-builder.ts`
- `validateDosageSafety()`: Active ingredient caps via `MAX_SAFE_DOSES` (20 chemicals with CIB&RC limits)
- Blocks dose if `totalPerHa > regulatory_max_dose` — returns safety warning instead
- Dose converted acres→hectares for regulatory comparison

### Module 3: PHI Harvest Proximity — DONE
- `validatePHISafety()`: Blocks chemical treatment if `phi_days > days_to_harvest`
- Supports ratoon crop cycle reduction
- Returns `phi_blocked: true` with farmer-friendly instruction

### Module 4: Environmental Condition Validation — DONE
- `validateEnvironmentalConditions()`: Rain forecast vs `rain_delay_hours`, temperature range, wind speed
- Spray blocked if rain expected within rain-free window
- Temperature and wind warnings with timing guidance

### Module 5: Agronomic Safety Scoring — DONE
- `computeSafetyScore()`: Composite 0-1 score (PHI 0.3, bee 0.2, regulatory 0.3, resistance 0.2)
- Score < 0.5 → downgrades response to MONITOR (no product/dosage/cost)
- Bee toxicity HIGH → mandatory evening-spray instruction

### Module 6: Confidence-Based Response Gating — DONE
- `response_decision: 'TREAT' | 'MONITOR' | 'CLARIFY'`
- TREAT (≥0.70): Full recommendation with dosage, cost, ROI
- MONITOR (0.50-0.69): Problem + monitoring only, no product
- CLARIFY (<0.50): Request more observations, suppress all treatment
- Dosage/cost/ROI sections suppressed in MONITOR and CLARIFY modes

### Module 7: Category-Based Conflict Resolution — DONE
- **File:** `layered-rule-evaluator.ts`
- Added `CATEGORY_PRIORITY_MAP` pre-sort: SAFETY_GATE(100) > URGENT_ACTION(90) > TREATMENT(80) > NUTRIENT(60) > CULTURAL(40) > MONITOR(20)
- Applied before `data_authority_rank` sort, only when category gap ≥ 20 points
- Ensures safety rules always surface first

### New Exports
- `extractRichRuleData(primaryDecision, appDetails)`: Bridge from pipeline to builder
- `validateDosageSafety()`, `validatePHISafety()`, `validateEnvironmentalConditions()`
- `computeSafetyScore()`, `WeatherContext`, `CropContext` interfaces

## Previous versions

### v7.1 — Table Audit (see git history)
- Dropped orphaned `intent_observation_mapping_v2`
- Confirmed `intent_observation_mapping` (v1) as authoritative

### v7.0 — Forensic Audit Fixes (see git history)
- BUG-1,3,4,5,6,7 fixes
- Safety gate rule exclusion, hardcoded text removal, token optimization

### v6.0-6.2 — Deep Forensic Audit (see git history)
- FIX 20-36: Rule unblocking, SSOT data alignment, translation fixes
