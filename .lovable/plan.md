
# Data Integrity Audit: Critical Bugs in Symbolic Decision Brain Tables

## Summary of Findings

After deep analysis of all 6 interconnected tables and the codebase that consumes them, I found **5 critical data integrity issues** that directly impact rule matching accuracy and farmer-facing UI.

---

## Critical Bug 1: 500 Orphaned Observation Codes in decision_rules

**The Problem:**
- `observation_master` contains only **63 canonical codes**
- `decision_rules.conditions_json.observations` references **525 unique codes**
- **500 codes** in decision_rules do NOT exist in observation_master
- **203 rules** have ONLY orphaned observation codes (zero valid links)

**Impact:** When the symbolic engine tries to validate observations against observation_master, these 203 rules can NEVER match through the proper validation path. The engine falls back to fuzzy substring matching in loader.ts, which is imprecise and causes false positives.

**Examples of orphaned codes:**
- `BLACK_WHIP_STRUCTURE`, `ANGULAR_SPOTS`, `BORE_HOLES`, `CENTRAL_SHOOT_DRIED` -- legitimate symptom codes that should be in observation_master
- `120_to_270_dap`, `alternate_furrow`, `biofertilizer_query` -- contextual flags that are NOT observations and should not be in the observations array

**Fix:** 
- Add ~80 most critical agronomic observation codes to observation_master (pest/disease symptoms used in high-priority rules)
- Normalize non-observation values (DAS ranges, query types) out of conditions_json.observations into proper condition keys

---

## Critical Bug 2: 26 observation_master Codes Have ZERO Translations

**The Problem:**
- observation_master has 63 codes
- Only 37 codes have translations in observation_translations
- **26 codes have NO translations at all** (no EN, HI, or MR)
- 17 of these are actively used in intent_observation_mapping_v2 (shown to farmers!)

**Missing translation codes used in intent mapping:**
APHID_INFESTATION, BORER_DAMAGE, CATERPILLAR_DAMAGE, DELAYED_GERMINATION, FUNGAL_GROWTH, INSECT_EGGS, INTERNODE_BORER, IRON_DEFICIENCY, LEAF_CURLING, LEAF_HOLES, PHOSPHORUS_DEFICIENCY, RED_ROT_SYMPTOMS, SMUT_SYMPTOMS, STEM_WILTING, TOP_BORER, WATERLOGGING_SIGNS, WILT_SYMPTOMS

**Impact:** When the system tries to show these as clarification options, it falls back to formatted code names (e.g., "Aphid Infestation") instead of farmer-friendly descriptions. This defeats the visual-symptom-description approach.

**Fix:** Add translations for all 26 missing codes with farmer-friendly visual descriptions in EN, HI, and MR.

---

## Critical Bug 3: 5 Orphaned Codes in intent_observation_mapping_v2

**The Problem:**
These codes exist in intent_observation_mapping_v2 but NOT in observation_master:
- `LEAF_CHEWING` (intent: ANIMAL_DAMAGE)
- `LEAF_DRYING` (intent: IRRIGATION_QUERY)
- `ROOTS_ROTTED` (intent: FLOOD_DROUGHT_DAMAGE)
- `SEEDLING_DIED` (intent: SEED_SELECTION)
- `STUNTED_PLANTS` (intent: WEED_PROBLEM)

**Impact:** When the engine resolves intent -> observations, these codes pass to the rule evaluator but can never be validated against observation_master. The db-observation-validator.ts will reject them as invalid.

**Fix:** Add these 5 codes to observation_master with proper is_diagnostic flags, AND add translations for them.

---

## Critical Bug 4: DEADHEART / DEAD_HEART_PRESENT Duplication

**The Problem:**
- observation_master has BOTH `DEADHEART` and `DEAD_HEART_PRESENT`
- canonical_hint_mapping maps both `DEAD_HEART` and `DEAD_HEART_PRESENT` hints to `DEAD_HEART_PRESENT`
- decision_rules uses `DEAD_HEART` (4 rules), `DEAD_HEART_PRESENT` (4 rules), `dead_heart` (1 rule), `DEAD_HEART_IN_GROWN_CANE` (1 rule)
- intent_observation_mapping_v2 references `DEADHEART`

**Impact:** The same biological concept is split across 4+ variants. When a farmer reports dead heart, the engine may match `DEAD_HEART` rules but miss `DEAD_HEART_PRESENT` rules (or vice versa), causing inconsistent diagnoses.

**Fix:** 
- Consolidate to single canonical code: `DEAD_HEART_PRESENT` (already the canonical_hint_mapping target)
- Update intent_observation_mapping_v2: change `DEADHEART` to `DEAD_HEART_PRESENT`
- Remove `DEADHEART` from observation_master
- Normalize decision_rules: update all `DEAD_HEART`, `dead_heart` references to `DEAD_HEART_PRESENT`

---

## Critical Bug 5: Case Inconsistency in decision_rules.conditions_json

**The Problem:**
decision_rules.conditions_json.observations contains mixed case:
- Lowercase: `root_rot`, `interveinal_chlorosis`, `stunted_growth`, `leaf_tip_burn`, `poor_root_development`
- Uppercase: `ROOT_ROT`, `INTERVEINAL_CHLOROSIS`, `STUNTED_GROWTH` (in observation_master)

**Impact:** While loader.ts does case-insensitive matching for fuzzy search, the db-observation-validator.ts and canonical_hint_mapping do exact-match lookups. This causes validation failures for rules with lowercase observation codes.

**Fix:** Normalize all observation codes in decision_rules.conditions_json to UPPERCASE.

---

## Fix Implementation Plan

### Step 1: Database Migration - Add Missing observation_master Entries

Add the 5 orphaned codes from intent_observation_mapping_v2 plus critical symptom codes from decision_rules that appear in 2+ rules.

### Step 2: Database Migration - Add Missing Translations

Add EN/HI/MR translations for all 26 codes missing translations, using farmer-friendly visual descriptions.

### Step 3: Database Migration - Consolidate DEADHEART Variants

- Delete `DEADHEART` from observation_master
- Update intent_observation_mapping_v2 references
- Update canonical_hint_mapping if needed

### Step 4: Database Migration - Normalize Case in decision_rules

SQL to uppercase all observation codes in conditions_json.observations across all decision_rules.

### Step 5: Code Fix - Case-Insensitive Validation in db-observation-validator.ts

Update the validator to do UPPER() comparison when checking observation_master, so any remaining case mismatches don't cause validation failures.

---

## Files Modified

| Target | Change |
|--------|--------|
| `observation_master` table | Add 5 orphaned codes, remove `DEADHEART` duplicate |
| `observation_translations` table | Add 78 translations (26 codes x 3 languages) |
| `intent_observation_mapping_v2` table | Fix `DEADHEART` -> `DEAD_HEART_PRESENT` |
| `decision_rules` table | Normalize observation case to UPPERCASE, consolidate DEAD_HEART variants |
| `db-observation-validator.ts` | Case-insensitive observation_master lookup |

## What Does NOT Change

- decision_rules schema or rule logic
- Loader evaluation logic (already case-insensitive)
- Orchestrator routing
- LLM narration layer
- canonical_hint_mapping (already correct)
- observation_intent_master (no issues found)
- intent_observation_mapping (v1, no issues found)

## Expected Result After Fix

| Issue | Before | After |
|-------|--------|-------|
| Rule matching for BLACK_WHIP_STRUCTURE | Not in observation_master, fuzzy match only | Proper canonical match |
| DEADHEART clarification | Split across 2 codes, inconsistent | Single canonical code |
| APHID_INFESTATION shown to farmer | Raw text "Aphid Infestation" | Visual description in farmer's language |
| Lowercase root_rot in rules | Fails exact validation | Normalized to UPPERCASE |
| LEAF_CHEWING in intent mapping | Rejected by validator | Valid canonical code |
