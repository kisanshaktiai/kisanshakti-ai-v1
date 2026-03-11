

# Production-Grade Audit Report: AI Chat & Symbolic Decision Brain

## 1. System Architecture Audit

**Finding**: The architecture correctly follows the neuro-symbolic pattern: LLM understands → CanonicalState → Rules decide → LLM explains. The pipeline flows through 8 well-defined layers in the orchestrator (8,973 lines) and index.ts (3,976 lines).

**Risk**: The orchestrator.ts at 8,973 lines is a **monolith** — a single class handling NLU, context loading, rule evaluation, communication generation, safety checks, PHI enforcement, pollinator protection, photo analysis, feedback learning, and audit logging. This is a scalability and maintainability risk.

**Evidence**: All 8 phases live in a single `orchestrate()` method spanning lines 1000-6790.

---

## 2. End-to-End Pipeline Verification

The pipeline successfully flows:
```text
Farmer Query → index.ts (language detection, session, dedup)
  → orchestrator.orchestrate()
    → Layer 1: NLU (semantic-extractor.ts → intent-classifier.ts → observation-code-mapper.ts)
    → Layer 1.5: Language Induction (fallback)
    → Layer 2: Canonical State Builder + Hypothesis Evaluator
    → Layer 3: Rule Engine (loader.ts → layered-rule-evaluator.ts → symbolic-reasoner.ts)
    → HARD INVARIANT: If primary_decision found → immediate return via communicationGenerator
    → Layer 4: Safety (PHI, Pollinator, Safety Guardian)
    → Layer 5: Communication Generator
  → index.ts: LLM Formatter → Unified Gate → forceTranslateResponse → Save & Return
```

**Critical Finding**: The HARD INVARIANT at line 6131 (immediate return when `primaryRuleId && primaryActionType`) **bypasses** Phase 5 Safety Verification (PHI, Pollinator, SafetyGuardian). This means:
- **PHI violations are NOT checked** on the immediate return path
- **Pollinator protection is NOT checked** on the immediate return path  
- Only the longer fallback path (lines 6440-6570) runs safety checks

**Risk Level**: CRITICAL — A rule may recommend a chemical that violates PHI or is toxic to bees, and this immediate path delivers it to the farmer unchecked.

**Recommended Fix**: Move safety checks (PHI, Pollinator, SafetyGuardian) BEFORE the HARD INVARIANT return at line 6131, or duplicate the safety check within that block.

---

## 3. Database Utilization Analysis

| Table | Wired? | Where Used |
|---|---|---|
| `decision_rules` | YES | `loader.ts` loads all active rules, `hypothesis-evaluator.ts` queries for crop/stage |
| `observation_master` | YES | `loader.ts` validates condition codes via cache |
| `observation_aliases` | YES | `loader.ts` loads for vocabulary expansion |
| `observation_translations` | YES | `i18n/observation-label-loader.ts` for UI labels |
| `intent_observation_mapping` | YES | `intent-resolver.ts` resolves intent→observations |
| `crop_stage_master` | YES | `db-observation-validator.ts` for DAS→stage lookup |
| `crop_synonyms` | YES | `crop-synonyms-cache.ts` for multilingual crop detection |
| `crop_vocabulary` | YES | `crop-vocabulary-cache.ts` for synonym matching |
| `crop_baseline_guidelines_v2` | YES | `baseline-guidelines-cache.ts` parallel loader |
| `etl_standards` | YES | `etl-gate.ts` loads for spray window validation |
| `agro_climatic_zones` | YES | `agro-zone-cache.ts` for zone-specific thresholds |

**Finding**: `hypothesis_master` table is **NOT actively queried** anywhere in the pipeline. The `hypothesis-evaluator.ts` generates hypotheses from `decision_rules` directly using `cause`, `observable_characteristics`, and `conditions_json` — it does NOT use a separate `hypothesis_master` table.

**Unused/Underused Fields**:
- `decision_rules.decision_trace_template` — loaded but rarely rendered in final output
- `decision_rules.i18n_key` — loaded but `communication-translation-dictionary.ts` falls back to DB cache which may not have matching keys

---

## 4. Hardcoded Logic Detection — **CRITICAL**

### 4a. Hardcoded Regional Language Text (Violates Language-Agnostic Architecture)

**78+ hardcoded Marathi/Hindi strings remain across 8 files:**

| File | Lines | Content |
|---|---|---|
| `orchestrator.ts` | 1189-1191 | Photo retry instructions in mr/hi/en |
| `orchestrator.ts` | 5900-5901 | `'अधिक माहिती द्या'` / `'अधिक जानकारी दें'` fallback text |
| `orchestrator.ts` | 5937-5939 | Photo request `text_mr`/`text_hi` strings |
| `orchestrator.ts` | 6583-6585 | Escalation messages in mr/hi/en |
| `phi-enforcement-guardian.ts` | 469-470, 479-480, 523-525 | `block_reason_mr`/`block_reason_hi` strings |
| `communication-generator.ts` | 1131-1162 | Economics fallback strings in mr/hi/en |
| `diagnosis-only-mode.ts` | 1038-1042 | Photo prompts in mr/hi |
| `clarification-renderer.ts` | 254-261 | Photo scope strings in mr/hi |
| `diagnostic-flow-controller.ts` | 250-252 | Photo messages in mr/hi |
| `index.ts` | 1011 | `'माहिती उपलब्ध नाही'` static gate fallback |
| `index.ts` | 1838 | `'कृपया पुन्हा प्रयत्न करा...'` error fallback |
| `ui-response-builder.ts` | 55 | Photo required prompt in mr |

**Risk Level**: HIGH — These violate the "no hardcoded mr/hi text in codebase" constraint and will break for Tamil, Telugu, Kannada, or any other supported language.

### 4b. Hardcoded Crop Mapping (orchestrator.ts:6840-6861)

```typescript
const cropMap: Record<string, string> = {
  'SUGARCANE': 'SUGARCANE', 'COTTON': 'COTTON', ...
};
```

This duplicates `crop_synonyms` table functionality. Should use `crop-synonyms-cache.ts`.

### 4c. Dialect Pattern Matching (cross-crop-symptom-mapper.ts, dialect-normalizer.ts)

These files contain regex patterns for Marathi/Hindi symptom words. This is **acceptable** for the perception layer (language induction fallback) since the primary path uses LLM-based semantic extraction. However, they should be gradually migrated to `crop_vocabulary` DB table.

---

## 5. Observation Layer Audit

**Findings**:
- `observation-ontology.ts` defines 200+ observation keys across 13 categories (A-M), correctly aligned with `decision_rules.observable_characteristics`
- `observation-code-mapper.ts` provides deterministic intent→observation mapping with 15+ `IntentMapping` entries
- `observation_master` has 47+ "phantom" codes added during remediation
- `observation_aliases` table provides vocabulary expansion

**Issue**: The `observation-code-mapper.ts` uses hardcoded `INTENT_TO_OBSERVATION_MAPPINGS` array. Adding new intents requires code changes rather than DB updates. This should eventually be migrated to `intent_observation_mapping` table (which already exists but is used in parallel).

**Agronomic Validation**: Observation categories are biologically sound — separating establishment (A), vegetative (B), leaf (C), stem (D), root (E), insect (F), disease (G), nutrient (H), reproductive (I-J), field-level (K), water/soil (L), and weather (M).

---

## 6. Hypothesis Layer Audit

**Finding**: The `hypothesis-evaluator.ts` (v1.2.0) correctly:
- Loads rules filtered by crop_code, stage_applicable, canonical_group
- Applies temporal constraints (crop_age_days_min/max)
- Uses partial condition matching to rank hypotheses
- Produces max 4 candidate hypotheses

**Issue**: Synthetic key suppression is correctly implemented (keys >25 chars without master entry are filtered). However, `normalizeCauseForDedup` uses 15+ hardcoded pattern strings for nutrients/diseases. These should be sourced from DB.

---

## 7. Decision Rules Engine Audit

**Findings**:
- `loader.ts` loads all active rules from `decision_rules` (556+ rules, limit 3000)
- Rules are normalized on load: `action_type` → 5 canonical types, `canonical_group` → 13 groups, `stage_applicable` normalized
- `layered-rule-evaluator.ts` implements multi-phase selection: crop filter → stage filter → observation matching → priority sort
- Conflict resolution uses `CATEGORY_PRIORITY_MAP`: SAFETY_GATE[100] > URGENT_ACTION[90] > TREATMENT[80]

**Issue — RULE EXPLOSION**: The logs mention "121 candidate rules for 13 observations" — this is expected behavior, not a bug. The evaluator correctly filters down to 11 fired rules and selects 1 primary.

**Issue — Safety Gate Rules as Primary**: `GLOBAL_SAFETY` rules are correctly filtered from primary selection in both orchestrator (lines 727-730) and index.ts (lines 826-828).

**Issue — Dead Rules**: 99 previously dead rules were reactivated per memory. Current `is_active=true` filter ensures only valid rules fire.

---

## 8. Data Flow Integrity Analysis

**Finding — CRITICAL BUG**: The `EMERGENCY_OBS_CODES` set is **duplicated** in two locations:
- orchestrator.ts line 6140: `EMERGENCY_OBS_CODES` (for immediate return path)
- orchestrator.ts line 6748: `EMERGENCY_OBS_CODES_MAIN` (for standard return path)

These are identical sets defined twice. A single constant should be used.

**Finding — Rich Field Propagation**: The `buildRichApplicationDetails()` function in index.ts (lines 109-187) correctly propagates all 50+ agronomic fields (PHI, bee toxicity, organic alternative, ROI, costs, etc.) through recovery paths. The orchestrator's own recovery (lines 6016-6096) also copies these fields. This is a good redundancy.

**Finding — Confidence Pipeline**: The `symbolicConfidence` extraction in index.ts (lines 1119-1125) correctly uses `weighted_confidence` from the layered rule evaluator as SSOT, with NaN guard.

---

## 9. Response Generation Accuracy Review

**Finding**: The response generation follows a multi-stage pipeline:
1. `communicationGenerator.generate()` produces structured JSON
2. `llm-response-formatter.ts` renders via LLM with 8-section FORMAT templates
3. `forceTranslateResponse()` applies LLM translation if English density >30%
4. `validateLLMOutputIntegrity()` checks for unauthorized products/dosages

**Issue — Static Gate Fallback**: Line 1011 in index.ts has hardcoded Marathi fallback: `'माहिती उपलब्ध नाही'`. This should use an i18n key.

**Issue — Double LLM Call**: When the primary formatter produces English output for a Marathi user, `forceTranslateResponse()` makes a SECOND LLM call. This costs extra tokens and latency. The formatter should produce output in the target language directly (which it attempts, but sometimes fails).

---

## 10. Performance & Scalability Risks

| Risk | Severity | Details |
|---|---|---|
| Orchestrator monolith (8,973 lines) | HIGH | Single file handles entire pipeline — hard to test/maintain |
| Rule cache TTL 1 hour | LOW | Acceptable for current scale |
| Dedup window 5 seconds | LOW | Good for double-tap prevention |
| Rate limit 20/minute | LOW | May need increase for power users |
| Duplicate safety check gap | CRITICAL | Immediate return path skips PHI/Pollinator |
| Session history limit 6 | LOW | Sufficient for context continuity |

---

## 11. Identified Critical Bugs

### Bug 1: Safety Bypass on Immediate Return Path
**Location**: orchestrator.ts lines 6131-6196
**Problem**: When `primaryRuleId && primaryActionType`, the function returns immediately without running PHI enforcement, Pollinator protection, or SafetyGuardian verification.
**Impact**: Farmers may receive chemical recommendations that violate PHI (residue risk) or harm pollinators during flowering.
**Fix**: Add safety verification before the immediate return.

### Bug 2: 78+ Hardcoded Regional Language Strings
**Location**: See Section 4a above
**Problem**: Violates language-agnostic architecture, breaks for non-Marathi/Hindi users
**Impact**: Tamil, Telugu, Kannada users see Marathi fallback text
**Fix**: Replace all `text_mr`/`text_hi`/`block_reason_mr` with i18n keys + LLM translation at runtime

### Bug 3: Duplicate Emergency Code Sets
**Location**: orchestrator.ts lines 6140-6144 and 6748-6752
**Problem**: Same 12-element set defined twice, maintenance risk
**Fix**: Extract to a shared constant at class level

---

## 12. Unused Tables / Dead Code

| Item | Status |
|---|---|
| `hypothesis_master` table | NOT queried by any code — hypotheses are derived from `decision_rules` |
| `normalizeToEnglish()` in index.ts | Deprecated no-op (line 1863) — safe to remove |
| `absoluteRulesGuard.ts` (frontend) | Deprecated stub — safe to remove |
| `intent_observation_mapping_v2` | Already dropped per memory |
| Dialect normalizer patterns | Active fallback — keep but plan DB migration |

---

## 13. Recommended Fixes (Priority Order)

### P0 — Safety Bypass Fix
Add PHI, Pollinator, and SafetyGuardian checks to the HARD INVARIANT immediate return path (orchestrator.ts ~line 6131). This is a safety-critical gap.

### P1 — Hardcoded Regional Text Cleanup (78+ strings)
Replace all `text_mr`/`text_hi` inline strings across 8 files with:
- English-only `text_en` + `i18n_key` fields
- Let `forceTranslateResponse()` handle localization at runtime
- Files: orchestrator.ts, phi-enforcement-guardian.ts, communication-generator.ts, diagnosis-only-mode.ts, clarification-renderer.ts, diagnostic-flow-controller.ts, index.ts, ui-response-builder.ts

### P2 — Orchestrator Modularization
Split 8,973-line orchestrator.ts into:
- `orchestrator-core.ts` (flow control)
- `orchestrator-nlu.ts` (perception layer)
- `orchestrator-rules.ts` (rule evaluation + recovery)
- `orchestrator-safety.ts` (PHI, Pollinator, Safety)
- `orchestrator-response.ts` (communication + formatting)

### P3 — Emergency Code Deduplication
Extract `EMERGENCY_OBS_CODES` to a shared constant used in both return paths.

### P4 — Crop Code Normalization
Replace hardcoded `cropMap` in orchestrator.ts:6840-6861 with `crop-synonyms-cache.ts` lookup.

---

## 14. SQL Fixes (Review-Ready — DO NOT EXECUTE)

No SQL changes required at this time. All identified issues are code-level. The database schema and data are correctly structured.

If `hypothesis_master` is confirmed unused:
```sql
-- AUDIT: Check if hypothesis_master is referenced anywhere
SELECT count(*) FROM hypothesis_master;
-- If unused and empty, consider archiving:
-- ALTER TABLE hypothesis_master SET SCHEMA archive;
```

---

## 15. Overall System Reliability Score

| Category | Score | Notes |
|---|---|---|
| Architecture Design | 9/10 | Excellent neuro-symbolic separation |
| Pipeline Integrity | 7/10 | Safety bypass on immediate path is critical |
| Database Utilization | 8/10 | Most tables well-wired, hypothesis_master unused |
| Language Agnosticism | 6/10 | 78+ hardcoded mr/hi strings remain |
| Safety Compliance | 5/10 | PHI/Pollinator bypass on primary path |
| Code Maintainability | 4/10 | 8,973-line monolith |
| Agronomic Correctness | 9/10 | Rules sourced from ICAR, proper DAS/stage mapping |
| Performance | 8/10 | Caching, dedup, non-blocking saves |
| **Overall** | **7.0/10** | Strong foundation, critical safety gap needs immediate fix |

