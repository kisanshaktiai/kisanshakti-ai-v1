

# Decision Brain Failure Investigation — Root Cause Analysis & Fix Plan

## 1. Root Cause Analysis: Why Early Shoot Borer Treatment Failed

### Failure Chain (Reconstructed)

```text
Farmer selects: "सुरुवातीची खोड किडा" (Early Shoot Borer)
    │
    ├── Frontend sends: "<label> [obs_keys:INSECTS_VISIBLE]"
    │   ↑ FAILURE POINT #1: diagnosis-first-generator picks first
    │     observable_characteristics[0] = "INSECTS_VISIBLE" as the
    │     observation_key for SC_PEST_EARLY_SHOOT_BORER_004
    │
    ├── Orchestrator extracts: mappedObservationKey = "INSECTS_VISIBLE"
    │
    ├── mapDistributionToSymptom() returns: "INSECTS_VISIBLE" (from embedded key)
    │
    ├── obsKeyExpansion lookup: "INSECTS_VISIBLE" → NOT IN MAP
    │   ↑ FAILURE POINT #2: obsKeyExpansion has entries for DEAD_HEART,
    │     BORER_DAMAGE, PEST_CHECK etc. but NOT for INSECTS_VISIBLE
    │
    ├── Final allObservations = ["INSECTS_VISIBLE"]
    │
    ├── Rule matching: ESB rules require [DEAD_HEART_PRESENT, CENTRAL_SHOOT_DRIED,
    │   STEM_AFFECTED] or [PEST_DAMAGE, BORER_DAMAGE, DEAD_HEART]
    │   → "INSECTS_VISIBLE" alone FAILS to match any treatment rule
    │
    └── Result: Generic advisory (no treatment)
```

### The Two Critical Bugs

**Bug A: Wrong observation_key selected in diagnosis-first-generator.ts (line 341)**
The generator picks `observable_characteristics[0]` — which is `INSECTS_VISIBLE` (a generic, non-diagnostic observation). It should pick the **most diagnostic** observation (e.g., `DEAD_HEART_PRESENT`), not the first one in the array.

**Bug B: obsKeyExpansion map missing INSECTS_VISIBLE entry (orchestrator.ts line 1666)**
When the farmer selects a diagnosis option, the hardcoded `obsKeyExpansion` map should expand `INSECTS_VISIBLE` to include `PEST_DAMAGE`, `DEAD_HEART`, `BORER_DAMAGE`, etc. But `INSECTS_VISIBLE` has no entry.

**Bug C: Diagnosis selection doesn't carry the cause/rule_id context**
When the farmer selects "Early Shoot Borer", the system should know the **cause** was confirmed. Instead, it only passes a single observation key (`INSECTS_VISIBLE`) and tries to re-match from scratch. The confirmed cause from the diagnosis-first flow is lost.

---

## 2. Observation Ontology Problems

### 47 Phantom Observation Codes
Rules reference 47 observation codes that DON'T EXIST in `observation_master`:

| Category | Phantom Codes |
|----------|--------------|
| **Generic management** | `GENERAL_ADVISORY`, `CROP_MANAGEMENT`, `GROWTH_STAGE`, `STAGE_QUERY`, `SYSTEM_CHECK` |
| **Pest/disease** | `PEST_DAMAGE`, `LEAF_DAMAGE`, `DISEASE_SYMPTOMS`, `CROP_STRESS` |
| **Soil/nutrition** | `SOIL_CONDITION`, `SOIL_HEALTH`, `PH_IMBALANCE`, `NITROGEN_NEED`, `NUTRIENT_DEFICIENCY` |
| **Harvest/economic** | `HARVEST_READINESS`, `ECONOMICS_QUERY`, `COST_BENEFIT`, `YIELD_ESTIMATION`, `BRIX_LEVEL` |
| **Weed** | `WEED_PRESENCE`, `WEED_COMPETITION`, `CYPERUS`, `NUTGRASS`, `SEDGE_WEED` |
| **Other** | `CANOPY_THINNING`, `HEAT_STRESS`, `WEATHER_DAMAGE`, `WIND_RISK`, `FERTIGATION` |

These generate `⚠️ [ObsValidation] Rule X references unknown observation` warnings on every evaluation cycle.

### Impact
Rules with phantom observation codes can only match via root-word matching (a 3+ char shared word). E.g., `PEST_DAMAGE` matches if input contains `PEST_CHECK` (shared word "PEST" is 4 chars). This is fragile and unreliable.

---

## 3. Rule Engine Structural Failures

### Category Taxonomy Fragmentation
44 distinct categories exist. Many are non-standard:

| Non-Standard Category | Count | Issue |
|----------------------|-------|-------|
| `weed_management` | 9 | Should map to canonical `PEST_MANAGEMENT` or standalone |
| `recommendation` | 2 | Should be `action_type`, not `category` |
| `water_stress` | 2 | Should be `stress` |
| `planting_material` | 4 | Not in canonical groups |
| `harvest_opt` | 3 | Non-standard abbreviation |
| `roi_economic_impact` | 2 | Should be `economics` |
| `best_practice_*` | 5 | Multiple fragmented categories |

The system silently defaults unknown categories to `DIAGNOSIS`, breaking rule routing.

### Rule Validation Gap
555 rules are cached including those with phantom observation codes. No pre-flight validation rejects invalid rules. The linter logs warnings but doesn't prevent evaluation.

---

## 4. Symbolic Inference Failures

### Observation Expansion is Hardcoded and Incomplete
`obsKeyExpansion` (orchestrator.ts line 1666) is a static dictionary with ~15 entries. Missing entries for:
- `INSECTS_VISIBLE` → should expand to `PEST_DAMAGE`, `INSECT_PRESENCE_CONFIRMED`
- `CENTRAL_SHOOT_DRIED` → should expand to `DEAD_HEART`, `DEAD_HEART_PRESENT`
- `SETT_HOLLOWING` → should expand to `BORER_DAMAGE`
- Many other observable characteristics from rules

### mapDistributionToSymptom Returns UNKNOWN
This function (line 495) only works if option text contains `[obs_keys:...]`. If not embedded, it returns `UNKNOWN` — breaking symptom detection for any option rendered without embedded keys (e.g., legacy clarification paths).

---

## 5. Permanent Architecture Fix Plan

### Fix 1: Diagnosis Selection Must Carry Cause Context (CRITICAL)
**File**: `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`

When formatting for UI, embed BOTH the observation_key AND the confirmed cause in the option metadata. The frontend already sends `observation_key` via `[obs_keys:]` — extend to include cause:

- Change `formatForClarificationUI()` to embed: `[obs_keys:DEAD_HEART_PRESENT] [cause:Early Shoot Borer] [rule_id:SC_PEST_EARLY_SHOOT_BORER_004]`
- Change orchestrator OPTION_SELECTED handler to extract `cause` and `rule_id` from the message
- When cause is confirmed, load rules for that specific cause and bypass generic observation matching

### Fix 2: Pick Most Diagnostic Observation Key (CRITICAL)
**File**: `supabase/functions/ai-agriculture-chat/decision/diagnosis-first-generator.ts`

Line 341: Instead of `h.observable_characteristics?.[0]`, pick the observation with highest `diagnostic_power` or check `is_diagnostic` from `observation_master`:

```
// Priority: is_diagnostic > DEAD_HEART > first available
const diagnosticObs = h.observable_characteristics?.find(o => 
  o.diagnostic_power === 'HIGH' || 
  o.observation_key.includes('DEAD_HEART')
) || h.observable_characteristics?.[0];
```

### Fix 3: Replace Hardcoded obsKeyExpansion with DB-Driven Alias Lookup (CRITICAL)
**File**: `supabase/functions/ai-agriculture-chat/agents/orchestrator.ts`

Replace the static `obsKeyExpansion` dictionary (lines 1666-1699) with a call to `expandObservationVocabularyViaAliases()` which already exists and queries `observation_aliases` table. The DB already has entries like:
- `INSECTS_VISIBLE → INSECT_PRESENCE_CONFIRMED, VISIBLE_INSECTS`
- `BORER_DAMAGE → STEM_BORING_MARKS, BORE_HOLES, DEAD_HEART_PRESENT, DEAD_HEART`
- `DEAD_HEART → CENTRAL_SHOOT_DRY, DEAD_HEART_PRESENT`

### Fix 4: Add 47 Missing Observation Codes to observation_master (DATA)
**Tool**: SQL insert

Insert the 47 phantom codes into `observation_master` with proper `observation_category`, `affected_plant_part`, and `canonical_group`. This eliminates all validation warnings and enables proper alias expansion.

### Fix 5: Normalize Category Taxonomy (DATA)
**Tool**: SQL update

Consolidate the 44 categories to ~15 canonical categories:
- `weed_management` → keep as-is (valid canonical group `06_weed`)
- `recommendation` → `advisory`
- `water_stress` → `stress`
- `harvest_opt` → `harvest`
- `roi_economic_impact` → `economics`
- `best_practice_*` → `best_practice`

### Fix 6: Add INSECTS_VISIBLE and Key Observable Chars to Alias Table (DATA)
**Tool**: SQL insert

Add expansion aliases for commonly selected observation keys:
- `INSECTS_VISIBLE → PEST_DAMAGE, INSECT_PRESENCE_CONFIRMED`
- `CENTRAL_SHOOT_DRIED → DEAD_HEART, DEAD_HEART_PRESENT`
- `SETT_HOLLOWING → BORER_DAMAGE, EARLY_SHOOT_BORER`
- `LARVAE_PRESENT → BORER_DAMAGE, PEST_DAMAGE`

---

## Implementation Order

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | **Embed cause+rule_id in diagnosis options** | Eliminates re-matching after confirmed diagnosis | Medium |
| 2 | **Pick diagnostic observation_key** | Ensures best symptom flows to rule matcher | Low |
| 3 | **Replace hardcoded obsKeyExpansion with DB aliases** | Eliminates static dictionary maintenance | Medium |
| 4 | **Add 47 phantom codes to observation_master** | Eliminates validation warnings, enables expansion | Low |
| 5 | **Add alias expansions for observable characteristics** | Ensures selected symptoms expand to rule-matchable codes | Low |
| 6 | **Normalize category taxonomy** | Prevents silent DIAGNOSIS defaulting | Low |

All fixes are backward-compatible. Fixes 1-3 are code changes. Fixes 4-6 are data inserts/updates.

