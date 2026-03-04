

# Forensic Audit Report: KisanShaktiAI Symbolic Decision Brain

## 1. System Architecture Overview

The system follows a 5-layer neuro-symbolic architecture:

```text
FARMER QUERY (any language)
       │
       ▼
[LAYER 1] Context Loading (index.ts → orchestrator.ts)
  - Land/Soil/NDVI/Weather fetch
  - Session state recovery
  - Canonical language enforcement
       │
       ▼
[LAYER 2] LLM Understanding (orchestrator.ts)
  - Semantic Extractor (intent_code via LLM)
  - Language Induction Layer (symbol extraction)
  - Observation Code Mapper (DB-sourced mapping)
  - Canonical State Builder
       │
       ▼
[LAYER 3] Symbolic Rule Engine (rule-evaluation-layer.ts → symbolic-reasoner.ts)
  - Fact Extraction
  - Hypothesis Evaluation
  - Condition Ledger matching
  - Layered Rule Evaluator
       │
       ▼
[LAYER 4] LLM Response Formatter (llm-response-formatter.ts)
  - System/User prompt construction
  - LLM call (OpenAI → Gemini → Lovable AI fallback)
  - Output validation gate
       │
       ▼
[LAYER 5] Safety Validation (index.ts)
  - Unified Decision Gate
  - Suppression Guard
  - Narration Breach Validation
  - Response save + return
```

**Key Files:**
- `index.ts` (3,868 lines) — Entry point, session management, gate enforcement
- `orchestrator.ts` (8,746 lines) — Main pipeline coordination
- `llm-response-formatter.ts` (2,290 lines) — LLM narration layer
- `rule-evaluation-layer.ts` (513 lines) — Symbolic brain wrapper
- `symbolic-reasoner.ts` — Core condition ledger engine

---

## 2. Critical Bugs Found (from Audit Logs)

### BUG-1: CRITICAL — "A blocking rule is active" Leaking as Product Name

**Evidence from `ai_chat_audit_logs`:**
```json
{
  "actions_returned": [{
    "product_name": "A blocking rule is active.",
    "action_type": "SPRAY_BOTANICAL",
    "specific_action": "Apply A blocking rule is active."
  }]
}
```

**Root Cause:** `GLOBAL_SAFETY_GENERAL_003` has `cause = "A blocking rule is active."` and `action_text = "A blocking rule has been triggered..."`. When this rule wins the selection in `index.ts` (recovery path at line ~630), the `cause` field is mapped to `product_name: 'See structured response'` BUT the legacy recovery path doesn't filter safety-gate rules from product rendering.

**File:** `index.ts` lines 630-665, `llm-response-formatter.ts` lines 1850-1870

**Fix:** 
1. In `index.ts` recovery path (~line 630): When `layeredPrimaryDecision` is from a GLOBAL_SAFETY rule, set `product_name: null` and `action_type: 'SAFETY_GATE'` instead of `SPRAY_BOTANICAL`.
2. Strengthen `isPlaceholderText()` to catch "A blocking rule" variants.

---

### BUG-2: CRITICAL — `llm_model_used` is NULL for ALL recent responses

**Evidence:** All 10 most recent audit logs show `llm_model_used: null` and `response_source: 'SYMBOLIC_TEMPLATE'` or `null`. This means the LLM formatter is consistently failing/timing out, and ALL farmer responses are served by the template fallback.

**Root Cause:** Either:
1. API keys are missing/expired (no OPENAI_API_KEY/GEMINI_API_KEY set)
2. The validation gates are rejecting LLM output (safety-gate product text causes product validation failure)
3. The `buildTemplateFallback()` function at line 1710 is the primary response path

**Impact:** Farmers are getting rigid template responses with raw English text instead of natural Marathi/Hindi responses.

**Fix:** 
1. Verify API keys are configured in edge function secrets.
2. Fix BUG-1 first — the product_name contamination causes validation failures that trigger template fallback.

---

### BUG-3: CRITICAL — `validation_passed: false` for WILTING queries with ZERO rules fired

**Evidence:** All 3 "काही ठिकाणी उस वाळत आहे" queries show `rules_fired: []`, `actions_returned: []`, `validation_passed: false`.

**Root Cause:** The `WILTING_OR_DROOPING` intent resolves to observation codes that have NO matching rules in `decision_rules` for SUGARCANE at TILLERING stage. The system produces ZERO output — a RULE_COVERAGE_GAP.

**Fix:**
1. Insert wilting/drooping rules for sugarcane in `decision_rules` table (this is a data gap, not code).
2. Ensure the `STAGE_ADVISORY_FALLBACK` path in orchestrator catches this and returns stage-specific monitoring advice.

---

### BUG-4: HIGH — Hardcoded mr/hi text remains in template fallback

**Files affected:** `llm-response-formatter.ts` lines 1829-1834 (greetings), 1839-1844 (acks), 1900-1905 (headers), 1914-1922 (GENERIC_ACTION_TRANSLATIONS), 1957-1968 (method/timing), 1979-1985 (organic headers), 1989-1994 (success headers), 2006-2012 (bee warnings), 2014-2020 (ROI), 2041-2044 (action headers), 2054-2058 (ask more), 2066-2070 (IPM headers), 2076-2083 (IPM fallback), 2087-2092 (safe advice), 2110-2115 (closings).

Also in `orchestrator.ts` lines 682-690 (localized fallback labels).

Also `IPM_URGENCY_LABELS` at lines 143-149 of `llm-response-formatter.ts`.

**Impact:** Violates the "no hardcoded mr/hi" directive. These should come from i18n/translation-loader or observation_translations DB.

**Fix:** Extract all hardcoded translation maps to the `observation_translations` table or a dedicated `ui_strings` table. Use `resolveI18nFromCache()` pattern with DB-first, LLM-fallback strategy.

---

### BUG-5: HIGH — Token Inflation from matched_responses

**Current:** `filterRelevantResponses()` caps at 3, but `buildRecommendationSummary()` also includes secondary_actions, blocked_actions, warnings, and rich agronomic context (organic_alternative, mode_of_action, success/failure_indicators, ROI). Total prompt can reach 2,500+ tokens.

**Expected:** ~300-500 tokens for the recommendation data.

**Specific inflation points:**
- `knowledge_text` capped at 600 chars but still included for primary (line 1369)
- Rich agronomic fields (lines 1376-1392) — 8 optional fields always included when present
- Secondary actions dump (lines 1474-1487)
- Blocked actions dump (lines 1534-1539)
- Format instructions in system prompt (~800 tokens, lines 984-1090)
- Crop stage constraints (~200 tokens, lines 1166-1184)

**Fix:**
1. Only include rich agronomic fields when `formatType === 'FORMAT_1'` (direct prescription)
2. Cap secondary actions to 1 in prompt
3. Remove blocked_actions from LLM prompt (inform farmer separately)
4. Compress format instructions to ~200 tokens using a format template ID reference

---

### BUG-6: MEDIUM — Safety Gate Rules Selected as Primary Decision

**Evidence:** `GLOBAL_SAFETY_GENERAL_003` (priority 10, RECOMMEND) is selected as the primary decision for STEM_DAMAGE queries instead of actual pest treatment rules.

**Root Cause:** Safety rules have `condition_code: 'STAGE_GENERAL'` and `priority: 10`, making them match almost any query and outrank treatment-specific rules (typically priority 7-8).

**Fix:**
1. Change `GLOBAL_SAFETY_GENERAL_003` `action_type` from `RECOMMEND` to `SAFETY_GATE` in DB.
2. In the rule evaluator, filter safety gate rules from primary decision selection — they should only appear in `blocked_actions` or warnings.

---

### BUG-7: MEDIUM — `isLikelyRawEnglish` is too aggressive

At line 1873: `return /[A-Za-z]/.test(v)` — This returns `true` for ANY string containing a single Latin character. Product names like "Chlorpyrifos 20 EC" or trade names in English are legitimate in Marathi responses.

**Fix:** Use a ratio-based check: `const asciiRatio = (v.match(/[a-zA-Z]/g) || []).length / v.length; return asciiRatio > 0.6;`

---

## 3. Deterministic Architecture Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Rule engine is sole decision authority | PASS | LLM only called for narration |
| LLM cannot generate treatment advice | PASS | Output validation gate blocks unauthorized products |
| LLM cannot override rules | PASS | Source validation in index.ts |
| Hypothesis layer supports reasoning only | PASS | No treatment generation |
| Rule engine runs before response generation | PASS | Layer 3 before Layer 4 |
| Safety gate rules don't leak as products | FAIL | BUG-1 |
| All responses come from fired rules | FAIL | BUG-2 (template fallback bypasses LLM) |

---

## 4. Token Cost Optimization Summary

| Component | Current Est. Tokens | Target | Saving |
|-----------|-------------------|--------|--------|
| System prompt | ~1,200 | ~500 | 700 |
| Recommendation data | ~1,500 | ~400 | 1,100 |
| Land context | ~200 | ~100 | 100 |
| Format instructions | ~800 | ~200 | 600 |
| **Total** | **~3,700** | **~1,200** | **~2,500 (68%)** |

---

## 5. Implementation Plan (Priority Order)

### Phase 1: Critical Fixes (Must-do)

**Task 1.1:** Fix safety gate rule leaking as product name
- Update `GLOBAL_SAFETY_GENERAL_003` `action_type` to `SAFETY_GATE` in DB
- Add safety gate filter in `index.ts` recovery path
- Strengthen `isPlaceholderText()` in formatter

**Task 1.2:** Fix `isLikelyRawEnglish()` over-filtering
- Replace single-char check with ratio-based threshold (>60% ASCII)

**Task 1.3:** Verify LLM API keys and fix LLM formatter pipeline
- Check if OPENAI_API_KEY/GEMINI_API_KEY are set in edge function secrets
- Ensure validation gate doesn't reject responses due to safety-gate product contamination

**Task 1.4:** Add wilting/drooping rules for sugarcane
- Insert WILTING_OR_DROOPING rules for SUGARCANE at relevant stages in `decision_rules`

### Phase 2: Hardcoded Text Removal

**Task 2.1:** Extract all hardcoded mr/hi strings from `llm-response-formatter.ts` template fallback
- Move greetings, headers, labels, closings to a `ui_strings` table or i18n JSON
- Use `resolveI18nFromCache()` with DB-first, LLM-fallback pattern

**Task 2.2:** Remove `IPM_URGENCY_LABELS`, `GENERIC_ACTION_TRANSLATIONS` hardcoded dictionaries
- Move to `observation_translations` or a new `action_type_translations` table

**Task 2.3:** Remove hardcoded fallback labels from `orchestrator.ts` lines 682-690

### Phase 3: Token Optimization

**Task 3.1:** Compress system prompt — remove redundant instructions
**Task 3.2:** Conditionally include rich agronomic fields based on format type
**Task 3.3:** Cap secondary actions to 1 in LLM prompt
**Task 3.4:** Remove blocked_actions from LLM prompt entirely

### Phase 4: Rule Engine Data Gaps

**Task 4.1:** Audit observation_master coverage for all active intents
**Task 4.2:** Ensure all symptom intents have at least one matching rule per major crop/stage combination
**Task 4.3:** Add RULE_COVERAGE_GAP alerting in audit logs

