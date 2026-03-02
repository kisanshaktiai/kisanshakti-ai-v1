

# Deep Forensic Audit — Symbolic Decision Brain Graph

## EXECUTIVE SUMMARY

**System Health Score: 35/100.** The decision brain has catastrophic data and code gaps that prevent it from delivering actionable prescriptions to farmers. **Single most critical bug:** The `required_symptoms` condition key appears in 17 rules (including ALL shoot borer treatment rules with active_ingredient) but has ZERO evaluator code — every rule with this key is automatically FAILED by the strict fail-closed ledger, making it impossible for the system to recommend any pesticide for shoot borer. **Single most critical data gap:** 450 of 522 rules (86%) have NULL `active_ingredient`, 479 (92%) have NULL `application_method`, and 490 (94%) have NULL `roi_cost_saved_min/max` — meaning even when rules fire, the formatter receives empty prescription data.

---

## SECTION 1 — DATABASE FORENSIC AUDIT

### 1A. Rule Content Completeness Scorecard

| Column | Total | Valid | Null/Empty | Quality % | Impact |
|--------|-------|-------|------------|-----------|--------|
| action_text | 522 | 517 | 5 | 99% | 5 rules are dead (FERT_SCHEDULE rules) |
| reason_text | 522 | 517 | 5 | 99% | Same 5 FERT_SCHEDULE rules |
| knowledge_text | 522 | 517 | 5 | 99% | Same 5 FERT_SCHEDULE rules |
| dosage_per_acre | 522 | 510 | 12 | 98% | OK but many are "N/A - advisory" |
| active_ingredient | 522 | **72** | **450** | **14%** | **CATASTROPHIC** — only 72 rules can prescribe a specific product |
| application_method | 522 | **43** | **479** | **8%** | **CATASTROPHIC** — formatter cannot build HOW section |
| organic_alternative | 522 | 153 | 369 | 29% | Missing organic options |
| roi_cost_saved_min | 522 | **32** | **490** | **6%** | **CATASTROPHIC** — formatter cannot show economic benefit |
| roi_cost_saved_max | 522 | **32** | **490** | **6%** | Same |
| phi_days | 522 | 516 | 6 | 99% | OK (many are 0 for advisory) |
| observable_characteristics | 522 | **335** | **187** | **64%** | 187 rules invisible to ObsChars fallback |

**Dead Rules Count:** 5 rules have NULL action_text (SC_FERT_SCHEDULE_* rules). But effectively **~250 rules are "hollow"** — they match but deliver nothing actionable (no ingredient, no method, no ROI).

### 1B. conditions_json Structural Patterns

**Total unique condition keys found: 150+** (massive key sprawl)

Critical orphan keys (exist in DB, NO evaluator in code):

| Orphan Key | Rule Count | Impact |
|------------|-----------|--------|
| `required_symptoms` | **17** | **CRITICAL** — blocks ALL shoot borer treatment rules. Evaluated as unknown string → FAILED → rule blocked |
| `requires_diagnosis_confidence` | 9 | Numeric threshold with no evaluator → UNEVALUABLE → blocks rule |
| `requires_confirmation` | 7 | String rule_id (not boolean) → evaluated as boolean → wrong result |
| `roi_basis` | 29 | Informational but treated as REQUIRED string → FAILED |
| `roi_by_region` | 29 | Object format → UNEVALUABLE → blocks rule |
| `roi_modifier` | 29 | Numeric → no matching input field → SKIPPED_NO_DATA → blocks rule |
| `ipm_priority` | 16 | Numeric → no matching input → SKIPPED_NO_DATA |
| `crop_cycle` | 14 | String "RATOON" → no matching input → FAILED |
| `duration_days` | 6 | Numeric → no matching input → SKIPPED_NO_DATA |
| `requires_identification` | 2 | Boolean → no evaluator |
| `diagnosis_method` | 2 | String → no matching input → FAILED |

**The `required_symptoms` orphan key is the #1 system-breaking bug.** All 17 rules containing it — including `SC_PEST_EARLY_SHOOT_BORER_004` (the primary Chlorantraniliprole prescription rule) and `SC_PEST_TOP_BORER_004` (the Chlorpyrifos rule) — will ALWAYS have `required_symptoms` evaluated as a string condition with value `["STALK_HOLE","SHOOT_DRYING","LARVA_PRESENT"]`. The evaluator at line 868-891 treats this as a string match against observations. Since it's an array (not string), it hits line 913 (`typeof condValue === 'object'`) → `UNEVALUABLE` with `required: true` → rule **permanently blocked**.

### 1C. observable_characteristics Format Analysis

| Format | Count | Parser Coverage |
|--------|-------|----------------|
| Proper string array `["DEAD_HEART","FRASS"]` | 274 | Handled by makeExecutable secondary path |
| Empty object `{}` | 184 | Skipped (no data to match) |
| Boolean object `{dead_heart: true, stem_hollow: true}` | 64 | **NOT handled** by makeExecutable (only checks Array.isArray) |
| Empty array `[]` | 3 | Skipped |
| NULL | 0 | Skipped |

**64 rules with boolean-object format are invisible to the ObsChars fallback.** The code at line 960 checks `Array.isArray(obsChars)` and skips objects. These 64 rules include critical ones like `SC_PEST_EARLY_SHOOT_BORER_001` (`{dead_heart: true, bore_holes_at_base: true}`).

### 1D. stage_applicable Case Analysis

| Format | Count | Match Status |
|--------|-------|-------------|
| UPPERCASE (TILLERING, GRAND_GROWTH) | ~515 | Works — evaluator does `.toUpperCase()` |
| lowercase (tillering) | 2 | Works — `.toUpperCase()` handles it |
| Mixed (germination, grand_growth) | 3 | Works |
| "ALL" wildcard | 70 | Works — checked explicitly |

Stage case is **not a major issue** — the evaluator normalizes to uppercase correctly.

### 1E. Cross-Table Integrity

- **522 rules** have `blocks_rule_ids` populated (non-empty)
- **522 rules** have `enables_rule_ids` populated
- **522 rules** have `prerequisite_rule_ids` populated
- **345 rules** have `triggers_rule_ids` populated
- **Forward chaining columns (`enables_rule_ids`, `triggers_rule_ids`) are populated but NEVER executed in code** — these are purely decorative

### 1F. observation_master Coverage

- **646 observation codes** in observation_master
- **45 observation codes** used in decision_rules.observable_characteristics that do NOT exist in observation_master (orphans get no diagnostic weight)
- **162 Marathi translations** out of 646 codes = **25% coverage** — 75% of clarification options would show raw English codes to Marathi-speaking farmers

---

## SECTION 2 — CODE ARCHITECTURE FORENSIC AUDIT

### 2A. The `required_symptoms` Kill Chain (BUG #1 — CRITICAL)

The exact execution path for `SC_PEST_EARLY_SHOOT_BORER_004`:
1. `conditions_json` = `{"crop_stage":["GERMINATION","TILLERING"],"observations":["DEAD_HEART_PRESENT","CENTRAL_SHOOT_DRIED","STEM_AFFECTED"],"required_symptoms":["STALK_HOLE","SHOOT_DRYING","LARVA_PRESENT"]}`
2. Evaluator processes `crop_stage` → PASSED
3. Evaluator processes `observations` → PASSED (DEAD_HEART matches)
4. Evaluator processes `required_symptoms` → hits line 913 (`typeof condValue === 'object'` since it's an array) → **UNEVALUABLE** with `required: true`
5. Line 929-932: `requiredFailed` includes the UNEVALUABLE entry → `matches = false`
6. Rule is REJECTED despite matching crop_stage and observations

**This blocks ALL 3 shoot borer treatment rules that have active_ingredient (SC_PEST_EARLY_SHOOT_BORER_004, SC_PEST_TOP_BORER_004, SC_SEEDLING_TREAT_ESB_CHEMICAL_ESCALATION).** The farmer can never receive a pesticide recommendation for shoot borer.

### 2B. The `roi_by_region` Kill Chain (BUG #2 — HIGH)

29 rules have `roi_by_region` as a nested JSON object like `{"MH":{"roi_basis":"black_soil","roi_modifier":0.85}}`. This hits line 913 → UNEVALUABLE → required: true → rule BLOCKED. This affects all soil management rules (SC_SOIL_ALLUVIAL_NITROGEN_001, SC_SOIL_BLACK_NITROGEN_001, etc.) — the farmer's nitrogen management rules are permanently blocked.

### 2C. Boolean-Object observable_characteristics Gap (BUG #3 — HIGH)

64 rules store obs_chars as `{dead_heart: true, bore_holes_at_base: true}`. The `makeExecutable` secondary path at line 960 checks `Array.isArray(obsChars)` — objects fail this check and are skipped. These 64 rules cannot be matched via the ObsChars fallback path.

### 2D. Confidence Gate Calculation for Data-Incomplete Farmers

For a typical rule with 3 conditions (`crop_stage` + `observations` + `required_symptoms`):
- `matched = 2` (crop_stage + observations pass), `total = 3` (required_symptoms fails)
- But `required_symptoms` is UNEVALUABLE → the rule doesn't even reach scoring

For a rule that DOES pass (e.g., one with only `observations`):
- `matched = 1`, `total = 1`, `baseScore = 1.0`
- `densityWeight = log(2)/log(10) = 0.301`
- `weightedConfidence = 1.0 * (0.5 + 0.5 * 0.301) = 0.651`
- This passes the 0.60 threshold — **BUT only for rules with 1 condition**

For rules with 5 conditions where 3 are SKIPPED_NO_DATA (soil, weather, etc.):
- These are rejected at the ledger level before scoring

**The confidence gate is not the primary blocker.** The primary blocker is the `required_symptoms` orphan key making rules fail at the ledger level.

### 2E. Forward Chaining — Completely Inoperative

`enables_rule_ids` and `triggers_rule_ids` are populated in 522 and 345 rules respectively. **Zero code reads or evaluates these columns during rule execution.** The graph control validator (`graph-control-validator.ts`) handles `blocks_rule_ids` and `prerequisite_rule_ids` for blocking/dependency, but `enables_rule_ids` and `triggers_rule_ids` are loaded from DB and stored in rule objects but never trigger any second-pass evaluation.

### 2F. 5 FERT_SCHEDULE Rules Are Completely Dead

`SC_FERT_SCHEDULE_TILLERING_001`, `SC_FERT_SCHEDULE_TILLERING_002`, `SC_FERT_SCHEDULE_GERMINATION_001`, `SC_FERT_SCHEDULE_GRAND_GROWTH_001`, `SC_FERT_SCHEDULE_MATURITY_001` — all have NULL `action_text`, NULL `dosage_per_acre`, and `condition_code = FERTILIZER_SCHEDULE`. These are critical fertilizer advisory rules that match the FERTILIZER_SCHEDULE route but deliver nothing to the formatter.

---

## SECTION 3 — RULE SKIP REGISTRY

| Skip Mechanism | Category | Affected Rules | Example Rule | Fix Location |
|---------------|----------|---------------|-------------|-------------|
| `required_symptoms` orphan key | CONDITION_ORPHAN_KEY | **17** (all borer treatment rules) | SC_PEST_EARLY_SHOOT_BORER_004 | Code (add evaluator) + DB (reclassify as non-required) |
| `roi_by_region` object key | CONDITION_ORPHAN_KEY | **29** (all soil/nitrogen rules) | SC_SOIL_BLACK_NITROGEN_001 | Code (mark as informational) |
| `roi_modifier` numeric key | FACT_NOT_POPULATED | **29** | SC_SOIL_ALLUVIAL_NITROGEN_001 | Code (mark as non-required) |
| `requires_diagnosis_confidence` | CONDITION_ORPHAN_KEY | **9** | SC_PEST_EARLY_SHOOT_BORER_003 | Code (add threshold evaluator) |
| `requires_confirmation` string | CONDITION_ORPHAN_KEY | **7** | SC_SEEDLING_TREAT_ESB_CHEMICAL_ESCALATION | Code (handle as prerequisite) |
| `crop_cycle` string | FACT_NOT_POPULATED | **14** | SC_GATE_009 | Code (populate from land context) |
| `ipm_priority` numeric | FACT_NOT_POPULATED | **16** | Various IPM rules | Code (populate from IPM state) |
| Boolean-object obs_chars | OBSERVABLE_CHAR_FORMAT_MISMATCH | **64** | SC_PEST_EARLY_SHOOT_BORER_001 | Code (add object parser) |
| Empty obs_chars `{}` | DB_DATA_GAP | **184** | SC_GATE_007 | DB (populate obs_chars arrays) |
| NULL active_ingredient | DB_DATA_GAP | **450** | Most advisory rules | DB (populate where applicable) |
| NULL application_method | DB_DATA_GAP | **479** | Most rules | DB (populate) |
| NULL action_text | DB_DATA_GAP | **5** | SC_FERT_SCHEDULE_* | DB (populate) |
| Orphan observation codes | DB_DATA_GAP | **45 codes** | BORING_DAMAGE, FRASS, etc. | DB (add to observation_master) |
| Missing Marathi translations | DB_DATA_GAP | **~484 codes** | 75% of all obs codes | DB (add translations) |

---

## SECTION 4 — CRITICAL BUG REGISTRY

### BUG-001: `required_symptoms` Orphan Key Blocks All Borer Treatment Rules
- **Location:** `bundled-rules/loader.ts`, `evaluateConditionsJson`, line 913
- **Category:** CONDITION_ORPHAN_KEY + CODE_LOGIC
- **Severity:** CRITICAL
- **Affected:** 17 rules including ALL pesticide-prescribing shoot borer rules
- **Failure:** `required_symptoms` is an array → evaluated as `object` → UNEVALUABLE → required=true → rule permanently blocked
- **Consequence:** Farmer with confirmed dead heart NEVER receives pesticide recommendation

### BUG-002: `roi_by_region` Object Blocks All Soil Management Rules
- **Location:** `bundled-rules/loader.ts`, `evaluateConditionsJson`, line 913
- **Category:** CONDITION_ORPHAN_KEY
- **Severity:** CRITICAL
- **Affected:** 29 nitrogen/soil management rules
- **Consequence:** Farmer asking about nitrogen/fertilizer gets no soil-specific recommendation

### BUG-003: Boolean-Object observable_characteristics Not Parsed
- **Location:** `bundled-rules/loader.ts`, `makeExecutable`, line 960
- **Category:** OBSERVABLE_CHAR_FORMAT_MISMATCH
- **Severity:** HIGH
- **Affected:** 64 rules including SC_PEST_EARLY_SHOOT_BORER_001
- **Failure:** `Array.isArray({dead_heart:true})` = false → skipped

### BUG-004: 5 FERT_SCHEDULE Rules Have NULL Content
- **Location:** Database `decision_rules` table
- **Category:** DB_DATA
- **Severity:** HIGH
- **Affected:** 5 fertilizer schedule rules (the primary FERTILIZER_SCHEDULE route targets)
- **Consequence:** Fertilizer intent queries match dead rules

### BUG-005: Forward Chaining Columns Completely Inoperative
- **Location:** `enables_rule_ids`, `triggers_rule_ids` — populated but never read
- **Category:** ARCHITECTURE
- **Severity:** MEDIUM
- **Consequence:** No cascading inference possible

---

## SECTION 5 — FIX PLAN

### Phase 1: Code Fixes (CRITICAL — Do First)

**Fix 1A: Handle `required_symptoms` as an observation-type condition**
In `loader.ts` `evaluateConditionsJson`, add a handler BEFORE the generic object fallback (line 913). When `key === 'required_symptoms'`, treat it identically to `observations` — check if ANY of the array values match `expandedObs`. Mark as `required: false` (soft requirement) since farmers describe symptoms in lay terms, not clinical confirmation codes.

**Fix 1B: Handle `roi_by_region`, `roi_modifier`, `roi_basis` as non-required informational keys**
Add these keys to the `CATEGORY_G_KEYS` set (informational/context keys) in `loader.ts`. They provide economic context but should NEVER block rule firing.

**Fix 1C: Handle `requires_diagnosis_confidence` as a threshold check**
Add evaluator: compare value against input confidence score. If no confidence available, mark as SKIPPED_NO_DATA with `required: false`.

**Fix 1D: Handle `requires_confirmation` as a prerequisite reference**
When value is a string rule_id, check if that rule_id has fired in the session. Mark as `required: false` to allow the rule to fire with lower confidence rather than being blocked.

**Fix 1E: Handle `crop_cycle` as a context match**
Check against land context (is this a ratoon crop?). If unknown, mark as SKIPPED_NO_DATA with `required: false`.

**Fix 1F: Parse boolean-object observable_characteristics**
In `makeExecutable` line 960, add handling for object format: if `obsChars` is an object (not array), extract keys where value is `true`, normalize to uppercase, and match against input symptoms.

### Phase 2: DB Data Repair

**Fix 2A: Populate 5 FERT_SCHEDULE rules with action_text, dosage, knowledge_text** from ICAR Package of Practices for sugarcane.

**Fix 2B: Add 45 orphan observation codes to observation_master** with proper `observation_category`, `affected_plant_part`, and `is_diagnostic` flags.

**Fix 2C: Add Marathi translations** for the ~484 observation codes currently missing `language_code = 'mr'` entries.

**Fix 2D: Populate `observable_characteristics`** for the 184 rules where it's empty `{}` — at minimum for all PEST and DISEASE category rules.

### Phase 3: Structural Improvements

**Fix 3A: Reclassify condition keys** — Create a definitive CATEGORY map at the top of `evaluateConditionsJson` that classifies EVERY key found in the DB (all 150+) into one of: REQUIRED_MATCH, SOFT_MATCH, INFORMATIONAL, NUMERIC_THRESHOLD, WEATHER, ETL, DEPRECATED.

**Fix 3B: Add forward chaining** — After primary rule fires, check `enables_rule_ids` and add those rule_ids to a "second wave" candidate set. Evaluate second wave with updated fact set (primary diagnosis added as a fact).

### Verification Protocol

After fixes, these 5 test scenarios must produce the exact expected outputs:

1. **Shoot Borer Dead Heart** — Query: "खोडात छिद्र पडली, गाभे मरतायत" (SUGARCANE, TILLERING, 80 DAS)
   - Expected: `SC_PEST_EARLY_SHOOT_BORER_004` fires, active_ingredient=Chlorantraniliprole, FORMAT_5 response

2. **Poor Tillering Nitrogen** — Query: "फुट कमी पडतायत, वाढ नीट नाही, काय टाकू?" (SUGARCANE, TILLERING, 80 DAS)
   - Expected: `SC_NUTRITION_NITROGEN_005` or similar fires, FORMAT_1 response with dosage

3. **Cotton Bollworm** — Query: "बोंडात अळी आहे" (COTTON, FLOWERING)
   - Expected: Pest management rule fires with specific product

4. **Generic Growth Query No Land** — Query: "माझं पीक नीट वाढत नाही" (no land context)
   - Expected: FORMAT_2 clarification asking which crop and what symptoms

5. **Repeat Query Session** — Same shoot borer query twice in 30 min
   - Expected: Second response escalates with more specific advice or asks one precise clarification

