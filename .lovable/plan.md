

# Deep Forensic Audit: AI Chat + Decision Brain Pipeline

## 1. Pipeline Reconstruction

The full pipeline trace from logs for query "ऊसाच्या पानांचा रंग फिकट पिवळा होत आहे" (sugarcane leaves turning pale yellow):

```text
Farmer Input: "ऊसाच्या पानांचा रंग फिकट पिवळा होत आहे"
  ↓
Language Detection: mr (Marathi) ✅
  ↓
CanonicalContext: Crop=SUGARCANE, Stage=TILLERING, DAS=88, NDVI=0.36 ✅
  ↓
Query Router: PEST_DISEASE_TREATMENT (80%) — ⚠️ INCORRECT for yellowing query
  ↓
Intent → Observation Mapping (DB): 6 observations resolved ✅
  ↓
Hypothesis Evaluator: Generates 4+ candidates
  ↓
Diagnosis-First Generator: Produces clarification options
  ↓
UI: Shows 4 options — 3 are "NUTRIENT DEFICIENCY" duplicates ❌ BUG #1
  ↓
Farmer selects: "🔍 शेंड्याचा पोखरणारा किडा" (Shoot Borer)
  ↓
mapDistributionToSymptom: Returns UNKNOWN (no embedded obs_key) ⚠️
  ↓
Observation: PEST_DAMAGE (from embedded key in option)
  ↓
Alias Expansion: +4 codes [INSECTS_VISIBLE, LARVAE_PRESENT, LARVAE_VISIBLE, PEST_CHECK]
  ↓
Rule Evaluation: 528 rules loaded, rules matched but...
  ↓
Actions Returned: 0 ❌ BUG #2
  ↓
LLM Formatting: Generated 537 chars response (gpt-4o-mini, 8020ms)
  ↓
Response: Sections = [greeting, warning] — NO treatment advice ❌ BUG #3
```

---

## 2. Database Integrity Findings

**Mostly Sound.** All agronomic rules come from `decision_rules` table (555 loaded, 528 crop-filtered for sugarcane). The system correctly uses DB-driven observation mappings.

**Issues found:**
- `SC_BP_PEST_MGMT_001` has `observable_characteristics: {}` (empty map instead of array) — the `normalizeObservableChars()` function converts this to `null`, so secondary matching path is disabled
- Multiple nutrient rules share identical `conditions_json.observations` arrays (`[NUTRIENT_DEFICIENCY, YELLOWING, STUNTED_GROWTH]`) but have different causes, creating near-duplicate hypothesis candidates

---

## 3. Observation System Issues

### BUG #1 (CRITICAL): Duplicate Clarification Options

**Root Cause Chain:**
1. `intent_observation_mapping` returns 6 observations for SUGARCANE at DAS=88: `LEAF_YELLOWING`, `NUTRIENT_DEFICIENCY`, `YELLOWING`, `CHLOROSIS`, `LEAF_PALE_GREEN`, `YELLOWING_LEAVES`
2. Hypothesis evaluator loads rules matching ANY of these observations
3. Finds 10+ nutrition rules with different causes but same symptom category (e.g., "Basal Nitrogen Recommendation", "Optimized Nitrogen Application", "Split Nitrogen Application", "Micronutrient Application")
4. `normalizeCauseForDedup()` (line 130 of hypothesis-evaluator.ts) treats these as DIFFERENT causes because it only has pattern-based dedup for pests (borers, whitefly, etc.) — **NO nutrient dedup patterns exist**
5. The diagnosis-first-generator dedup (lines 465-487) uses `observation_key` which differs per hypothesis
6. Result: 3-4 options all labeled "NUTRIENT DEFICIENCY" or "नत्राची कमतरता"

**Fix:** Add nutrient/disease dedup patterns to `normalizeCauseForDedup()` AND add `cause_label`-level dedup in `diagnosis-first-generator.ts`

### Observation Expansion (Working correctly)
- `PEST_DAMAGE → [INSECTS_VISIBLE, LARVAE_PRESENT, LARVAE_VISIBLE, PEST_CHECK]` via `observation_aliases` table — this is correct DB-driven expansion

---

## 4. Clarification System Bugs

### BUG #1b: Mixed-Language Options
The user saw:
```
1. 🔍 NUTRIENT DEFICIENCY  (English)
2. 🔍 NUTRIENT DEFICIENCY  (English)
3. 🔍 NUTRIENT DEFICIENCY  (English)
4. 🔍 नत्राची कमतरता      (Marathi)
```

**Root Cause:** `getCauseLabelFromDB()` returns empty string when no Marathi translation exists in `observation_translations` table (line 156: `return ''`). Then `finalCauseLabel` falls back to `observationLabel` or `h.cause` (line 424). For rules without translations, `h.cause` is English ("Nitrogen Deficiency"), creating mixed-language output.

**Fix:** When `getCauseLabelFromDB()` returns empty for non-English, the system should use the `observation_label` (which may be translated) or mark for LLM translation. Currently, the fallback chain `causeLabel || observationLabel || h.cause` can produce English `h.cause` for Marathi users.

---

## 5. Rule Engine Problems

### BUG #2 (CRITICAL): Actions Returned = 0 Despite Rule Matches

**Root Cause Analysis:**
Logs show: `Actions Returned Count: 0` but `Response Type: DECISION_PROVIDED` with `decision_brain_source: true`.

The issue is in the OPTION_SELECTED path (orchestrator.ts lines 1847-1865):
- `actionsToReturn` is built from `safePrescriptions` first, then `safeMatchedResponses`
- If `ruleResult.prescriptions` is empty AND `ruleResult.matched_responses` is empty, actions = []
- The rule DID match (via `conditions_json.observations` containing PEST_DAMAGE), but the rule's category mapping routes it to DIAGNOSIS phase (via `mapBundledCategory`), not PRESCRIPTION phase
- DIAGNOSIS phase rules populate `ruleResult.diagnoses[]`, not `ruleResult.prescriptions[]` or `ruleResult.matched_responses[]`

**The fundamental issue:** When `mapBundledCategory` maps category `ipm` → `PRESCRIPTION` and `pest` → `DIAGNOSIS`, pest rules that should provide treatment advice are classified as DIAGNOSIS. The DIAGNOSIS phase doesn't produce `matched_responses` — only the PRESCRIPTION phase does.

But actually, checking the logs more carefully: the rule evaluation DOES produce a `primary_decision` (since it went through LLM formatting and produced 537 chars). The `Actions Returned Count: 0` at the `index.ts` level means `extractAndAuditActionsWithFilterTrace()` didn't find formal actions, but the response was still generated from the `decision_output.primary_decision` → LLM formatting path.

**This is a pipeline invariant violation:** `Actions Returned Count: 0` + `Response Type: DECISION_PROVIDED` should be impossible. The response validation gate (line 23) shows `actions_returned empty, but decision_output also empty (expected)` — meaning the validation gate ALLOWS this combination, which means treatment was generated by LLM alone without symbolic actions.

### BUG #3: Response Contains Only [greeting, warning] Sections
The LLM generated a response with 537 chars containing only greeting and warning sections — no treatment, no dosage, no products. This confirms the pipeline provided no symbolic treatment data to the LLM formatter, so the LLM could only generate general advice.

---

## 6. Category Mapping Failures (BUG #4)

Logs show 7 warnings:
```
Unknown category 'governance' → defaulting to DIAGNOSIS
Unknown category 'resistance_mgmt' → defaulting to DIAGNOSIS (×3)
Unknown category 'weed_management' → defaulting to DIAGNOSIS (×2)
Unknown category 'physiology' → defaulting to DIAGNOSIS
```

**Root Cause:** `mapBundledCategory()` (layered-rule-evaluator.ts line 1581) has 30+ mapped categories but misses these 4. These rules default to DIAGNOSIS instead of their correct phases.

**Fix:** Add to the category map:
- `governance` → SAFETY (policy/regulatory rules)
- `resistance_mgmt` → PRESCRIPTION (resistance management protocols)
- `weed_management` → PRESCRIPTION (weed treatment)
- `physiology` → DIAGNOSIS (physiological disorder identification)

---

## 7. Hardcoded Logic Detection

### Partially Hardcoded: `createUnknownDiagnosisResponse()` (diagnosis-first-generator.ts lines 539-561)
Contains hardcoded mr/hi/en strings for unknown diagnosis fallback. These are **not DB-sourced** but serve as crash-proof fallbacks. They survived the previous audit correctly (safety net).

### Hardcoded Critical Fallback (orchestrator.ts lines 1730-1738)
Static observation expansion fallback dictionary. Used only when DB alias expansion fails. Acceptable as safety net.

### No hardcoded treatment found
The response at "Apply 1 kg Chlorantraniliprole" mentioned in the audit prompt would come from `decision_rules.action_text` if rules fired. In this case, NO treatment was provided — confirming the Actions=0 bug.

---

## 8. Performance Problems

- **LLM Token Usage:** 1690 tokens (1479 prompt + 211 completion) — reasonable
- **Response Time:** 8020ms for LLM formatting — high but within 25s budget
- **Rule Loading:** 555 rules loaded, 141 aliases cached, 1000 observation_master codes — efficient with caching

---

## 9. Root Cause Analysis — Top 5 Critical Bugs

| # | Bug | Severity | Root Cause |
|---|-----|----------|------------|
| 1 | **Duplicate clarification options** | CRITICAL | `normalizeCauseForDedup()` lacks nutrient patterns; diagnosis-first dedup uses `observation_key` not `cause_label` |
| 2 | **Actions=0 despite rule match** | CRITICAL | Pest rules classified as DIAGNOSIS, not PRESCRIPTION; OPTION_SELECTED path only builds actions from prescriptions/matched_responses |
| 3 | **Mixed-language options** | HIGH | `getCauseLabelFromDB()` falls back to English `h.cause` when no translation exists |
| 4 | **4 unmapped categories** | MEDIUM | `mapBundledCategory()` missing governance, resistance_mgmt, weed_management, physiology |
| 5 | **Response validation allows Actions=0 + DECISION_PROVIDED** | HIGH | Validation gate at index.ts line 23 considers this "expected" |

---

## 10. Permanent Architecture Fixes

### Fix 1: Hypothesis Dedup — Add Nutrient/Disease Patterns
In `hypothesis-evaluator.ts` `normalizeCauseForDedup()`:
- Add patterns: `nitrogen → nitrogen deficiency`, `phosphorus → phosphorus deficiency`, `potassium → potassium deficiency`, `micronutrient → micronutrient deficiency`, `iron → iron deficiency`, `zinc → zinc deficiency`
- Add semantic dedup: normalize "Basal Nitrogen Recommendation" → "nitrogen", "Optimized Nitrogen Application" → "nitrogen", "Split Nitrogen Application" → "nitrogen"

### Fix 2: Diagnosis-First Cause Label Dedup
In `diagnosis-first-generator.ts`, add a **second dedup layer** by `cause_label` (the farmer-facing text), not just `observation_key`. If two options display the same translated label, keep the higher-priority one.

### Fix 3: Category Map Completion
In `layered-rule-evaluator.ts` `mapBundledCategory()`, add the 4 missing categories:
```
'governance' → SAFETY
'resistance_mgmt' → PRESCRIPTION
'weed_management' → PRESCRIPTION
'physiology' → DIAGNOSIS
```

### Fix 4: OPTION_SELECTED Action Builder — Use primary_decision
In orchestrator.ts lines 1847-1865, when `safePrescriptions` and `safeMatchedResponses` are both empty BUT `ruleResult.primary_decision` exists, build actions from `primary_decision`. Currently this case produces `actionsToReturn = []` despite having a valid primary decision.

### Fix 5: Translation Fallback — Force Translation for Non-English
In `diagnosis-first-generator.ts` `getCauseLabelFromDB()`, when no native script translation exists, instead of returning empty string, format the English cause as human-readable and flag for LLM narration layer translation. This prevents mixed English/Marathi options.

### Implementation Order
1. **Fix 3** (category map) — smallest, highest ROI, prevents 7 warnings per request
2. **Fix 1 + Fix 2** (dedup) — eliminates duplicate options
3. **Fix 4** (actions builder) — ensures treatment data flows to LLM formatter
4. **Fix 5** (translation fallback) — eliminates mixed-language UI

