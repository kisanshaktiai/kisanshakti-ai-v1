

# Forensic System Audit: Agricultural Decision Engine

## 1. System Workflow Trace (Reconstructed)

```text
Farmer: "ऊसाच्या खोडात छिद्र पडली आहेत" (Marathi)
  ↓
Language Detection → mr (Devanagari detected)
  ↓
NLU/Semantic Extractor → intent: STEM_DAMAGE
  ↓
Observation Extraction → [STEM_BORING, DEAD_HEART, BORER_DAMAGE, STEM_HOLES, ...]
  ↓
Alias Expansion (206 aliases) → adds DEAD_HEART_PRESENT, BORE_HOLES, etc.
  ↓
Canonical State Builder → crop=SUGARCANE, stage=TILLERING, DAS=85
  ↓
PrescriptionGate → ALLOWED (override due strong symptoms ≥5)
  ↓
Rule Loader → loads 461 SUGARCANE rules from decision_rules
  ↓
DIAGNOSTIC PRE-FILTER → pest rules prioritized
  ↓
evaluateRulesLayered() → conditions_json evaluated via Condition Ledger
  ↓
  *** CRITICAL BUG LOCATION ***
  ↓
Rules match BUT: conditions like "egg_masses_visible: true", 
"pink_larvae_inside: true", "trash_mulch: true" are REQUIRED=true 
boolean gates with NO runtime data → FAILED/SKIPPED_NO_DATA
  ↓
All Shoot Borer rules fail the strict ledger check
  ↓
INVARIANT_FALLBACK → "Continue monitoring"
```

## 2. Critical Bugs Detected

### BUG 1 — Boolean Condition Keys Treated as Required Gates (ROOT CAUSE)

**Root Cause**: In `loader.ts` lines 910-924, domain-specific boolean keys like `egg_masses_visible`, `pink_larvae_inside`, `trash_mulch`, `bore_holes_at_nodes`, `soil_moisture` from `conditions_json` fall through to the "unrecognized keys" handler (line 927-937). These are treated as `required: true` observation flags that FAIL when not found in the expanded observation set.

**Evidence from DB**: Rule `SC_PEST_EARLY_SHOOT_BORER_001` has conditions:
```json
{
  "etl_range": "8-10",
  "observations": ["EGG_MASSES_VISIBLE"],
  "required_symptoms": ["STALK_HOLE", "SHOOT_DRYING", "LARVA_PRESENT"],
  "egg_masses_visible": true,
  "requires_diagnosis_confidence": 0.75
}
```

The `egg_masses_visible: true` key is not in any evaluator list, so it hits the catch-all at line 927 which checks if `expandedObs.has("EGG_MASSES_VISIBLE")`. Since NLU extracted `STEM_BORING`, `DEAD_HEART` etc. but NOT `EGG_MASSES_VISIBLE` specifically, the condition FAILS with `required: true`. This blocks the ENTIRE rule.

Similarly for `SC_PEST_PINK_BORER_001`: `pink_larvae_inside: true` and `bore_holes_at_nodes: true` both FAIL.

**Impact**: Every pest treatment rule with domain-specific boolean keys in `conditions_json` is unreachable unless the NLU happens to extract the exact same observation code as the key name. This is the primary reason the system always falls back to MONITOR.

**Fix**: These domain-specific boolean keys in `conditions_json` that duplicate the `observations` array entries must be classified as Category G (INFORMATIONAL, `required: false`) or as soft observation matches. They are redundant metadata—the `observations` array already captures the matching requirement.

### BUG 2 — `required_symptoms` is Correctly Soft, But NEVER Actually Contributes to Scoring

**Root Cause**: `required_symptoms` is correctly set to `required: false` (line 837), but because it's the only PASSED entry for many rules while the hard boolean keys FAIL, the ledger rejects the rule entirely per the fail-closed contract ("zero FAILED entries allowed").

**Impact**: Even rules with matching `observations` fail because companion boolean keys fail. The `required_symptoms` softness is architecturally correct but provides zero benefit when hard-required boolean keys block the rule.

### BUG 3 — Observation Aliases Not Loaded into Condition Evaluator

**Root Cause**: In `loader.ts` line 756, `cachedObservationAliases` is used but the loading function `loadObservationAliasesFromDB()` is only called inside `loadAllRules()`. However, the alias cache uses the schema `canonical_code → alias_code[]`. The DB stores them as separate rows with `canonical_code` and `alias_code` columns. 

Looking at the alias data: `BORER_DAMAGE` → expands to `STEM_BORING_MARKS`, `DEAD_HEART_PRESENT`, `BORE_HOLES`, etc. This is correct BUT the direction matters: the condition evaluator needs to know that `DEAD_HEART` (farmer observation) maps to `DEAD_HEART_PRESENT` (rule condition). The alias table has `alias_code=DEAD_HEART → canonical_code=DEAD_HEART_PRESENT`, but the loader builds a map of `canonical_code → alias_code[]`, not `alias_code → canonical_code[]`.

**Impact**: Farmer-observed symptoms may not expand to rule-expected codes because the alias direction is inverted.

### BUG 4 — `etl_range` String Condition Not Evaluated

**Root Cause**: Rule `SC_PEST_EARLY_SHOOT_BORER_001` has `"etl_range": "8-10"`. This is a string value, not an ETL object. It falls into the string match handler (line 939-962), which checks `expandedObs.has("8-10")` or `inputQuery.includes("8-10")`. This always FAILS with `required: true`.

**Impact**: All rules with `etl_range` as a string (not an object) silently fail the ledger evaluation. The ETL handler (Category F) only triggers for the key `etl` or `etl_range` when the value is an `object` with `.min`/`.max`.

### BUG 5 — Translation Table Schema Mismatch

**Root Cause**: The `observation_translations` table uses a normalized schema: `(observation_code, language_code, display_text)` with 965 EN, 854 MR, 854 HI entries. Previous code expected columns named `en`, `mr`, `hi` directly. The `translation-loader.ts` likely accesses these correctly via `language_code` filtering, but the `forceTranslateResponse` function in `index.ts` is a static dictionary of ~70 phrases and relies on LLM fallback for anything else.

**Impact**: When LLM timeout occurs (common given 25s budget), responses remain in English. The 111 observations missing MR/HI translations cause raw technical codes to leak into farmer-facing text.

### BUG 6 — `mapBundledCategory` Loses Canonical Group Prefix

**Root Cause**: The DB `canonical_group` is normalized to values like `03_pest`, `04_disease`. But `mapBundledCategory` receives the `category` field (from `row.category`), NOT `canonical_group`. The loader sets `category: row.category?.toLowerCase()` which contains values like `pest`, `disease`, `advisory` etc. The `canonical_group` is separately stored but never used for category mapping.

This is currently working because the direct mapping handles `pest → DIAGNOSIS`, but the raw DB `category` field may contain values not in the map (e.g., `pest_management`, `borer_management`), which would fall to the default `DIAGNOSIS`.

**Impact**: Minor — the default-to-DIAGNOSIS fix from v7.5 mitigates this. But category-specific routing may be imprecise.

## 3. Database Issues

| Issue | Table | Count | Impact |
|-------|-------|-------|--------|
| Missing MR/HI translations | observation_translations | 111 obs codes | Raw codes in farmer responses |
| Crop skew | decision_rules | 461 SC, 27 CTN, 36 ALL | Other crops have zero rules |
| Boolean keys as conditions | decision_rules.conditions_json | ~200 rules | Rules unreachable |
| `etl_range` as string | decision_rules.conditions_json | ~54 rules | ETL check always fails |
| `required_symptoms` redundancy | decision_rules.conditions_json | ~100 rules | No functional impact (soft) but confusing |
| BLOCK as action_type for treatment rules | decision_rules | 100 rules | Legitimate treatment rules typed as BLOCK are filtered out |

## 4. Architecture Fix Plan

### Phase 1: Fix Boolean Condition Key Handling (Critical — Fixes Root Cause)

**File**: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

The fix: Add all domain-specific boolean keys that duplicate `observations` array entries to Category G (INFORMATIONAL). These keys are metadata annotations, not independent conditions. The `observations` array already captures the matching requirement.

Specifically, add to `CATEGORY_G_KEYS`:
- All `*_visible`, `*_present`, `*_inside` keys (e.g., `egg_masses_visible`, `pink_larvae_inside`, `bore_holes_at_nodes`)
- `trash_mulch`, `soil_moisture`, `population_trend`, `pest` (as category hint)
- `larvae_count_per_plant` (string threshold — cannot be evaluated as boolean)

Additionally, handle `etl_range` string values: add `etl_range` to Category G when the value is a string (not an object).

### Phase 2: Fix Alias Direction in Condition Evaluator

**File**: `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts`

Build bidirectional alias map: when loading from `observation_aliases`, create BOTH `canonical→alias[]` AND `alias→canonical[]` maps. During expansion, expand in both directions so that farmer-observed `DEAD_HEART` expands to `DEAD_HEART_PRESENT` and vice versa.

### Phase 3: Ensure LLM Translation Fallback Works

**File**: `supabase/functions/ai-agriculture-chat/index.ts`

The current `forceTranslateResponse` has a good static dictionary but the LLM fallback may fail under timeout. Add a dedicated lightweight translation call with a 5-second budget that runs ONLY for the response text, not the full reasoning pipeline.

### Phase 4: Redeploy and Validate

Deploy the edge function and test with: "ऊसाच्या खोडात छिद्र पडली आहेत" — should now match `SC_PEST_EARLY_SHOOT_BORER_004` or `SC_PEST_EARLY_SHOOT_BORER_005` and produce a RECOMMEND/MONITOR response with actual agronomic content.

## 5. Files to Update

1. `supabase/functions/ai-agriculture-chat/bundled-rules/loader.ts` — Add domain-specific boolean keys to CATEGORY_G_KEYS; fix alias direction; handle `etl_range` string
2. `supabase/functions/ai-agriculture-chat/index.ts` — Harden `forceTranslateResponse` LLM fallback timeout

## 6. Expected Outcome

After fix, the same farmer query will:
1. Match `SC_PEST_EARLY_SHOOT_BORER_004` (RECOMMEND, cause=Early Shoot Borer)
2. The `observations` array `["DEAD_HEART_PRESENT", "CENTRAL_SHOOT_DRIED", "STEM_AFFECTED"]` will match via root-word/containment matching against NLU observations
3. Boolean keys `egg_masses_visible`, `pink_larvae_inside` etc. will be INFORMATIONAL (not blocking)
4. Response will contain: cause, action_text, dosage, PHI, bee toxicity, organic alternative
5. Response will be in Marathi (farmer's language)

