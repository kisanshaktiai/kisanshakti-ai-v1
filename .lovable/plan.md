

# Master Forensic Audit Report: AI Chat + Symbolic Decision Brain

## Validated Test Case
**Query:** "या पिकाला कोणते खत द्यायला हवे?" (Which fertilizer should I give this crop?)
**Crop:** Sugarcane | **Stage:** TILLERING | **Expected:** Fertilizer recommendation from symbolic graph

---

## PHASE A — Intent Pipeline Integrity

### A1. Intent Classifier Correctly Maps Fertilizer Queries
The `intent-classifier.ts` (line 462) has a regex fallback:
```
/खत|उर्वरक|खाद|fertiliz|nutrient|पोषण|\bkhat\b|\bkhaad\b/i → FERTILIZER_SCHEDULE (0.6)
```
The LLM classifier also includes `FERTILIZER_SCHEDULE` in its valid codes. **No mutation issue here.**

### A2. CRITICAL FINDING — Intent Confidence Tiering Allows Downgrade
**Violation:** Intent confidence from the regex fallback is 0.6, which lands in `TENTATIVE` tier (0.35-0.64). The `TENTATIVE` tier does NOT have hard-lock protection like `HIGH` (≥0.65). This means downstream logic CAN downgrade it if other signals contradict.

**Fix:** The regex fallback for `FERTILIZER_SCHEDULE` should return confidence ≥ 0.65 (HIGH tier) since it's a deterministic keyword match, not probabilistic.

### A3. Intent Code Is Immutable After Lock
`lockIntent()` at orchestrator line 3902 locks the intent. `filterActionsByIntentLock()` at line 5682 enforces scope. **No mutation of intent_code after lock.**

---

## PHASE B — Induction Gate Validation

### B1. CRITICAL FINDING — Fertilizer Route Is NOT in `symptomFreeRoutes`
**Location:** orchestrator.ts line 2605
```typescript
const symptomFreeRoutes = ['IRRIGATION_SCHEDULING', 'CROP_HEALTH', 'WEATHER_SPRAY', 'GENERAL_INFO', 'GREETING'];
```

`FERTILIZER_SCHEDULE` intent maps to query route `GENERAL_INFO` (default) because the query router has **zero fertilizer patterns** — there's no fertilizer-specific route. Since `GENERAL_INFO` IS in `symptomFreeRoutes`, fertilizer queries DO bypass the symptom gate — but only by accident through the default route.

**However,** the `directModeBypass` at line 2407 also kicks in:
```typescript
if (intentMetaFromDB?.clarification_mode === 'DIRECT' && landContext?.current_crop) {
  directModeBypass = true;
  bypassClarification = true;
}
```
Since `FERTILIZER_SCHEDULE` has `clarification_mode='DIRECT'` in `observation_intent_master`, this correctly bypasses clarification.

### B2. FINDING — Missing Query Router Pattern for Fertilizer
The query router (`query-router.ts`) has patterns for pest/disease, irrigation, weather, market, crop health, but **no fertilizer patterns**. All fertilizer queries fall through to `GENERAL_INFO` route (confidence=0.5).

**Impact:** Low routing confidence (0.5) instead of targeted routing. The `GENERAL_INFO` route happens to be in `symptomFreeRoutes`, so it works — but only coincidentally.

### B3. The `directModeBypass` Path Works Correctly
When `FERTILIZER_SCHEDULE` intent has `clarification_mode='DIRECT'`:
1. Line 2407: `directModeBypass = true`, `bypassClarification = true`
2. Line 3075: Intent code itself is injected as observation (`FERTILIZER_SCHEDULE`)
3. Line 4752: Query is prepended with `[INTENT:FERTILIZER_SCHEDULE]`

This is the correct path. **But it depends on the LLM classifier or regex fallback producing `FERTILIZER_SCHEDULE`.**

---

## PHASE C — Symbolic Brain Guarantee

### C1. CRITICAL FINDING — `shouldRunSymbolicBrain` Can Be False for Fertilizer
The symbolic brain gate at line 2609:
```typescript
let shouldRunSymbolicBrain = (inductionCoverageSufficient || inductionConfidenceSufficient) && (hasSymptoms || isSymptomFreeRoute);
```

For a fertilizer query:
- `hasSymptoms` = false (no symptoms in fertilizer query)
- `isSymptomFreeRoute` = true (only because route defaults to `GENERAL_INFO`)
- `inductionCoverageSufficient` = depends on induction result
- `inductionConfidenceSufficient` = depends on induction result

If the legacy induction layer returns zero symbols (which is possible for "या पिकाला कोणते खत द्यायला हवे?" since it's a Marathi fertilizer question with no pest/disease vocabulary), then `inductionCoverageSufficient = false` AND `inductionConfidenceSufficient = false`, making `shouldRunSymbolicBrain = false`.

**The save:** LLM semantic extraction (line 2025) injects observation codes into `inductionResult.symptoms` (lines 2223-2285). If the LLM correctly detects `FERTILIZER_SCHEDULE` intent with confidence ≥ 0.5, then `inductionConfidenceSufficient` becomes true. But this is not guaranteed.

### C2. The `ADVISORY_DIRECT_ROUTE` Injection (Line 3075-3080)
When `directModeBypass = true` and intent is in `advisoryIntents`:
```typescript
allObservationsForPreAuth.add(intentCode); // adds 'FERTILIZER_SCHEDULE'
```

This ensures the observation set is non-empty for the symbolic brain.

### C3. FINDING — No Code Path Where Symbolic Brain Returns `null` Without Error
The orchestrator's hard invariant at line 5477 guarantees: if `primaryRuleId && primaryActionType` exist, return immediately. The fallback path (line 5526) requests a photo, and the mandatory fallback (line 5567) generates clarification. There is no silent null return.

**However,** the `pendingClarificationResponse` at line 5218 can trigger when `totalRulesMatched === 0`, returning clarification instead of a decision. This is the primary failure mode.

---

## PHASE D — Unified Gate Enforcement

### D1. Unified Gate Acts Correctly as Safety Layer
The gate at `unified-decision-gate.ts` line 346 validates authority, then checks:
1. Emergency bypass (line 386)
2. Young crop detection (uses DAS + stage)
3. Confidence-driven mode resolution
4. Suppression guard (prevents silent drops)

The suppression guard (line 129-165) correctly upgrades the gate result if rules fired but gate would suppress.

### D2. FINDING — Clarification State Leakage Between Turns
The session state (line 409-413) has an auto-reset for stuck `awaiting_clarification` with 0 pending options. **This is correct.** General session isolation (lines 386-402) clears land-specific data. **No state corruption detected.**

### D3. FINDING — Confidence Floor for Primary Decision
At index.ts line 998-1001: if `primaryDecisionExists && symbolicConfidence === 0`, confidence is forced to 50. This prevents zero-confidence suppression. **Correct.**

---

## PHASE E — Decision Graph Execution

### E1. Crop Code Matching — FIXED in Previous Audit
The `getAllRulesWithBundled` at evaluator line 866 now uses `getCropCodeVariants(cropCode)` which generates all aliases. **Verified: `sc` → `['sc', 'sugarcane', '...']`.**

### E2. Stage Filtering — Correct
At evaluator line 895-916: `stage_applicable` is enforced before condition evaluation. TILLERING rules will match TILLERING stage.

### E3. CRITICAL FINDING — Fertilizer Rules Require `context` or `observations` Keys
The 18 TILLERING fertilizer rules have conditions like:
- `{"context": "nitrogen_management", "soil_type": "all"}` (SC_BP_NITROGEN_EFFICIENCY_001)
- `{"observations": ["PURPLE_LEAVES", "POOR_ROOT_DEVELOPMENT"], "soil_phosphorus": "low"}` (SC_NUTRITION_NITROGEN_005)
- `{"context": "nitrogen_management", "soil_type": "ALLUVIAL"}` (SC_SOIL_ALLUVIAL_NITROGEN_001)

The `context` key is classified as Category G (informational) at loader line 388-391:
```typescript
const CATEGORY_G_KEYS = new Set([
  'context', 'roi_basis', 'roi_modifier', 'roi_by_region', ...
]);
```

Category G keys are NOT required (line 607: `required: false`). This means they auto-pass.

**For rules with only `context` and other G-keys:** They will match if no required conditions FAIL. `SC_BP_NITROGEN_EFFICIENCY_001` has conditions `{"context": "nitrogen_management", "soil_type": "all"}`. The `soil_type` key with value `"all"` is also Category G. So this rule has **zero required conditions** — but empty conditions return `false` (line 634). Wait, these conditions are NOT empty, they have keys, so the ledger runs.

**Let me trace more carefully:** For `SC_BP_NITROGEN_EFFICIENCY_001`:
- `context: "nitrogen_management"` → Category G → `required: false`, auto-PASSED
- `soil_type: "all"` → NOT in any explicit category → falls to generic boolean gate (line 597-607)
  - `"all"` is not `true` → evaluates as string match against observations
  - `expandedObs.has("ALL")` or `expandedObs.has("SOIL_TYPE")` → both likely false
  - Returns `FAILED` with `required: true`

**Result:** `SC_BP_NITROGEN_EFFICIENCY_001` FAILS because `soil_type: "all"` is treated as a required boolean observation check. The farmer's observations won't contain `ALL` or `SOIL_TYPE`.

### E4. CRITICAL FINDING — Most Fertilizer Rules Will Fail Due to Condition Evaluation
Rules like `SC_NUTRITION_NITROGEN_005` require `{"observations": ["PURPLE_LEAVES", "POOR_ROOT_DEVELOPMENT", "STUNTED_GROWTH"], "soil_phosphorus": "low"}`:
- `observations` check: needs `PURPLE_LEAVES` etc. in farmer observations → **FAILS** for a general "which fertilizer" query
- `soil_phosphorus: "low"` → string match → evaluates against `input.soil_phosphorus` → if soil data exists and shows low P, this passes

**Rules with `context`-only conditions** (like `SC_NUTRITION_NITROGEN_028`) have conditions like:
```json
{"context": "nutrient_application", "weather": {"context": "fertilizer_timing"}, ...}
```
- `context` → Category G (not required)
- `weather` → Category E (required), needs weather object with matching keys → **likely FAILS**

### E5. ROOT CAUSE FOR FERTILIZER QUERIES: No Pure Advisory Fertilizer Rules Exist
**There are ZERO fertilizer rules that fire on intent alone.** All 18 TILLERING fertilizer rules require either:
1. Specific symptom observations (PURPLE_LEAVES, YELLOWING, etc.)
2. Specific soil test results (soil_phosphorus: "low")
3. Specific context + soil_type combinations
4. Specific variety matches

**A general "which fertilizer should I give?" query with no symptoms and no specific soil data will match ZERO rules.** This is the fundamental gap.

### E6. Intent-Observation Mapping Gap
`FERTILIZER_SCHEDULE` has **zero** entries in `intent_observation_mapping`:
```sql
SELECT * FROM intent_observation_mapping WHERE intent_code = 'FERTILIZER_SCHEDULE' → []
```

Only `NUTRIENT_STRESS_SIGNAL` has mappings (to NITROGEN_DEFICIENCY, PHOSPHORUS_DEFICIENCY, IRON_DEFICIENCY). The system has no way to map a fertilizer schedule intent to actionable observation codes for rule matching.

---

## PHASE F — Database Integrity

### F1. Orphan condition_code
All 517 rules use `condition_code = 'STAGE_GENERAL'`. This column is decorative and serves no filtering purpose.

### F2. Missing Fertilizer-Stage Advisory Rules
| Stage | Symptom-Based Fert Rules | Pure Advisory Fert Rules |
|-------|--------------------------|--------------------------|
| TILLERING | 18 | **0** |
| GRAND_GROWTH | 15+ | **0** |
| PLANTING | 5+ | **0** |

There are NO rules that fire purely on `FERTILIZER_SCHEDULE` intent + crop + stage without requiring specific symptoms or soil data.

### F3. Missing Intent-Observation Mappings
| Intent | Mappings in DB |
|--------|---------------|
| FERTILIZER_SCHEDULE | **0** |
| IRRIGATION_QUERY | Not checked but likely 0 |
| NUTRIENT_STRESS_SIGNAL | 9 (3 per stage) |

### F4. Authority Rank Column
No `data_authority_rank` column found in active use beyond a sort tiebreaker at evaluator line 840-842. Authority ranks are defined but not enforced as gates.

### F5. NULL Dosage Fields
Not checked, but rules have `action_text` field with embedded dosage text. No separate `dosage` column exists in the current schema.

---

## PHASE G — Language Agnostic Validation

### G1. Marathi "खत" Maps Correctly
The intent classifier regex at line 462 includes `खत` (khat/fertilizer in Marathi). This correctly maps to `FERTILIZER_SCHEDULE`.

### G2. i18n Keys Exist
All decision rules have `i18n_key` field populated. The response pipeline uses `action_text`, `reason_text`, `knowledge_text` for narration.

### G3. No Fallback to UNKNOWN When Deterministic Mapping Exists
The intent tiering guard (line 2161) prevents HIGH-confidence intents from being downgraded. The regex fallback produces 0.6 confidence (TENTATIVE), which CAN be downgraded. **Fix needed: raise to 0.65+.**

---

## PHASE H — Contract Enforcement

### H1. Missing `decision_output` Guarantee
There IS NO explicit `throw` for missing `decision_output`. The system has multiple fallback paths:
1. Primary decision invariant (line 5477) → immediate return
2. Photo request (line 5526) → return
3. Mandatory fallback clarification (line 5567) → return
4. Deferred clarification (line 5218) → return

But none of these explicitly assert `decision_output` existence. A path exists where orchestrator returns `CLARIFICATION_QUESTION` without any `decision_output`, which is architecturally allowed but violates the stated invariant.

---

## Guaranteed Fix Plan

### Phase 1: Critical (Fertilizer Pipeline Determinism)

**Fix 1.1: Add Pure Advisory Fertilizer Rules to Database**
Insert stage-specific fertilizer schedule rules that fire on `FERTILIZER_SCHEDULE` intent + crop + stage WITHOUT requiring symptoms:
```sql
INSERT INTO decision_rules (rule_id, crop_code, stage_applicable, action_type, condition_code, conditions_json, action_text, ...)
VALUES 
  ('SC_FERT_SCHEDULE_TILLERING_001', 'SUGARCANE', ARRAY['TILLERING'], 'RECOMMEND', 'STAGE_GENERAL',
   '{"context": "fertilizer_schedule", "always_applicable": true}',
   'Apply second split of nitrogen (80-100 kg N/ha) at 60-75 DAP...', ...);
```
Rules needed for: PLANTING, TILLERING, GRAND_GROWTH, MATURITY (minimum 4 rules per crop).

**Fix 1.2: Add `FERTILIZER_SCHEDULE` to `intent_observation_mapping`**
```sql
INSERT INTO intent_observation_mapping (intent_code, observation_code, crop_code, growth_stage, das_min, das_max, confidence_rank, is_active)
VALUES 
  ('FERTILIZER_SCHEDULE', 'FERTILIZER_SCHEDULE', 'SUGARCANE', 'TILLERING', 45, 120, 1, true),
  ('FERTILIZER_SCHEDULE', 'NITROGEN_MANAGEMENT', 'SUGARCANE', 'TILLERING', 45, 120, 2, true);
```

**Fix 1.3: Register `FERTILIZER_SCHEDULE` in `observation_master`**
The observation code `FERTILIZER_SCHEDULE` doesn't exist in `observation_master`, so rule eligibility checks will fail:
```sql
INSERT INTO observation_master (observation_code, observation_category, canonical_group, is_active)
VALUES ('FERTILIZER_SCHEDULE', 'MANAGEMENT', 'nutrition', true);
```

**Fix 1.4: Add `soil_type` to Category G Keys in Loader**
In `loader.ts` line 388, add `'soil_type'` and `'soil_type_name'` to `CATEGORY_G_KEYS` so these context keys don't block rule matching:
```typescript
const CATEGORY_G_KEYS = new Set([
  'context', 'roi_basis', 'roi_modifier', 'roi_by_region',
  'timing', 'method', 'operation', 'action', 'assessment_timing',
  'soil_test', 'irrigation_system',
  'soil_type', 'soil_type_name',  // ADD: Context keys, not conditions
  'farming_mode', 'variety', 'trait', 'region',
  'monsoon_timing', 'yield_potential',
  'ipm_priority'  // ADD: IPM priority is informational
]);
```

**Fix 1.5: Raise Intent Classifier Confidence for Deterministic Matches**
In `intent-classifier.ts` line 464, change confidence from 0.6 to 0.75:
```typescript
return { intent_code: 'FERTILIZER_SCHEDULE', confidence: 0.75 };
```
This ensures it enters HIGH tier (≥0.65) and cannot be downgraded.

### Phase 2: Structural

**Fix 2.1: Add Fertilizer Route to Query Router**
Add `FERTILIZER_NUTRITION` route in `query-router.ts` with patterns for खत/fertilizer/khat/khaad/nutrient:
```typescript
const FERTILIZER_PATTERNS = [
  /खत|खाद|उर्वरक|fertiliz|nutrient|NPK|नत्र|युरिया/i,
  /कोणते\s*खत|कौन\s*सा\s*खाद|which\s*fertilizer/i,
  /\bkhat\b|\bkhaad\b|\burea\b|\bDAP\b/i,
];
```
Add `'FERTILIZER_NUTRITION'` to `symptomFreeRoutes` in orchestrator.

**Fix 2.2: Ensure Advisory Intent Rules Have `always_applicable: true`**
Existing fertilizer rules with `context`-only conditions should add `"always_applicable": true` to their conditions_json so they match when intent is advisory:
```sql
UPDATE decision_rules 
SET conditions_json = conditions_json || '{"always_applicable": true}'::jsonb
WHERE rule_id IN ('SC_BP_NITROGEN_EFFICIENCY_001', 'SC_NUTRITION_NITROGEN_028')
AND conditions_json->>'always_applicable' IS NULL;
```

### Phase 3: Architecture Refactor

**Fix 3.1: Implement Intent-Aware Rule Selection**
When `directModeBypass = true` with an advisory intent, the rule engine should filter rules by matching `conditions_json->>'context'` against the intent category. For example, `FERTILIZER_SCHEDULE` should prioritize rules where `context` contains `nitrogen`, `fertilizer`, `nutrient`.

**Fix 3.2: Make `condition_code` Functional**
Migrate rules to use specific observation codes as `condition_code` instead of blanket `STAGE_GENERAL`. This enables the eligibility check documented in the architecture memory.

**Fix 3.3: Add Decision Output Guarantee Contract**
Add explicit assertion in orchestrator before final return:
```typescript
if (!decisionOutput && orchestratorResponse.type !== 'CLARIFICATION_QUESTION') {
  throw new Error('SYSTEM_FATAL_ERROR: Decision Brain produced no output for non-clarification path');
}
```

---

## Summary of Violations Found

```text
pipeline_contract_violations:
  1. FERTILIZER_SCHEDULE has zero intent-observation mappings
  2. No pure advisory fertilizer rules exist (all require symptoms)
  3. soil_type key treated as required boolean condition (blocks context-only rules)

intent_mutation_points:
  1. Regex fallback confidence 0.6 = TENTATIVE tier (can be downgraded)

routing_conflicts:
  1. No fertilizer route in query-router.ts (falls to GENERAL_INFO)

induction_gate_errors:
  1. Fertilizer route works only accidentally via GENERAL_INFO in symptomFreeRoutes

symbolic_bypass_paths:
  1. If induction returns 0 symbols AND LLM fails → shouldRunSymbolicBrain = false
  2. FERTILIZER_SCHEDULE intent not in symptomFreeRoutes directly

unified_gate_blocking_paths:
  None found (suppression guard is effective)

database_integrity_issues:
  1. condition_code = STAGE_GENERAL for all 517 rules (decorative)
  2. FERTILIZER_SCHEDULE not in observation_master
  3. FERTILIZER_SCHEDULE not in intent_observation_mapping
  4. soil_type, variety, trait treated as required conditions (should be context)
  5. No advisory-only fertilizer rules for any stage

language_induction_failures:
  1. Marathi "खत" correctly maps via regex — no failure here
  2. Romanized "khat/khaad" also correctly mapped

authority_rank_violations:
  1. data_authority_rank defined but only used as sort tiebreaker, not as gate

missing_rule_coverage:
  1. 0 pure advisory fertilizer rules for TILLERING (18 exist but all need symptoms)
  2. 0 pure advisory fertilizer rules for GRAND_GROWTH
  3. 0 pure advisory fertilizer rules for PLANTING
  4. IRRIGATION_QUERY likely has similar gap (not audited)
  5. HARVEST_TIMING likely has similar gap (not audited)

state_machine_corruption_points:
  None found (auto-reset logic at lines 409-413 is correct)
```

---

## Validation Checklist

After fixes:
1. "या पिकाला कोणते खत द्यायला हवे?" → `FERTILIZER_SCHEDULE` (HIGH tier, ≥0.65)
2. Query router → `FERTILIZER_NUTRITION` route (not `GENERAL_INFO`)
3. `directModeBypass = true` → `bypassClarification = true`
4. `FERTILIZER_SCHEDULE` injected as observation → matches `SC_FERT_SCHEDULE_TILLERING_001`
5. `primaryRuleId` valid → immediate return with fertilizer recommendation
6. Edge function logs: `📦 Loaded ~490 crop-filtered rules for sc`
7. Edge function logs: `rules_matched > 0, primary_decision = SC_FERT_SCHEDULE_TILLERING_001`

