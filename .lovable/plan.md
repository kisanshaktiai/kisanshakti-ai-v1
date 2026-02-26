

# Forensic Audit: AI Chat + Symbolic Decision Brain

## Executive Summary

The system is critically broken for its primary use case (sugarcane advisory). **Zero sugarcane-specific rules ever fire.** The root cause is a single crop code mismatch that silently drops 454 out of 490 applicable rules before evaluation even begins. Secondary issues compound this: NDVI observation codes are phantom (not in any DB table), most NDVI rules are stage-locked to SEEDLING only, and the `condition_code` column is decorative across all 517 rules.

---

## 1. Critical Root Cause: Crop Code Mismatch

**Classification: FILTER BUG — CRITICAL**

### The Bug

The orchestrator maps `SUGARCANE` → `'sc'` before calling rule loading:

```text
orchestrator.ts:1538  →  cropCodeForRules = 'sc'
orchestrator.ts:4733  →  cropCodeForFilter = 'sc'
```

But the rule loader normalizes DB `crop_code` to lowercase:

```text
loader.ts:219  →  crop_code: row.crop_code?.toLowerCase() → 'sugarcane'
```

When `getAllRulesWithBundled('sc')` filters (lines 862-867):

```text
'sugarcane' === 'sc'  → FALSE  (454 rules dropped)
'all' === 'sc'        → FALSE
'all' === 'all'       → TRUE   (36 rules kept)
```

**Result:** Only 36 universal `ALL` rules survive. All 454 sugarcane-specific rules — pests, diseases, nutrition, irrigation, NDVI — are silently excluded.

### DB Proof

| crop_code  | count |
|------------|-------|
| SUGARCANE  | 454   |
| ALL        | 36    |
| CTN        | 27    |

The "36 crop-filtered rules" in the logs are exactly the 36 `ALL` rules.

### Required Fix

**Option A (recommended):** Add alias resolution in `getAllRulesWithBundled` and `loadRulesForCrop`:

```typescript
const CROP_CODE_ALIASES: Record<string, string[]> = {
  'sc': ['sugarcane', 'sugar_cane'],
  'ctn': ['cotton', 'kapas'],
  // ...same map already in convertBundledToRule lines 921-931
};

function matchesCrop(ruleCrop: string, queryCrop: string): boolean {
  if (ruleCrop === queryCrop) return true;
  if (['all', '*', 'universal'].includes(ruleCrop)) return true;
  const aliases = CROP_CODE_ALIASES[queryCrop] || [];
  return aliases.includes(ruleCrop);
}
```

**Option B:** Change orchestrator to pass `'sugarcane'` instead of `'sc'`:
```typescript
// orchestrator.ts:1538 — remove the SC shortcode mapping
const cropCodeForRules = cropName?.toLowerCase() || '';
```

---

## 2. NDVI Observation Phantom Code

**Classification: DATA GAP + OBSERVATION MAPPING BUG**

`NDVI_DECLINE_IN_PLANT_CROP_REQ` does not exist in:
- `observation_master` (0 NDVI codes in 638 total)
- `observation_aliases` (0 NDVI aliases)
- `intent_observation_mapping` (0 NDVI mappings)
- Any codebase file (0 grep matches)

This code is fabricated by the NLU layer at runtime with no DB backing. It is tagged as `CONFIRMED` authority but has zero downstream linkage.

### NDVI Rules Use Different Keys

The 18 NDVI rules use `conditions_json` keys like:
- `ndvi_decline: true` (evaluates `input.ndvi_trend === 'DECLINING'`)
- `ndvi_pattern: 'DECLINE'` (string match against `input.ndvi_pattern`)
- `ndvi_trend: 'DECLINING'` (string match)
- `ndvi_triggered: true` (evaluates `input.ndvi_level ? true : null`)

None check for observation code `NDVI_DECLINE_IN_PLANT_CROP_REQ`.

### NDVI Stage Lock

| Stage applicability | NDVI rule count |
|---------------------|-----------------|
| SEEDLING only       | 13              |
| TILLERING included  | 2               |
| ALL                 | 1               |
| Other               | 2               |

For a TILLERING query, only 2 NDVI rules are even eligible:
1. `SC_NDVI_COLLAPSE_PLANT_VERIFY_001` — needs `ndvi_pattern: DECLINE` + `drop_pct: 20_30` + `needs_confirmation: true`
2. `SC_BP_GENERAL_021` — needs `ndvi_trend: stable` (opposite of declining!)

### Required Fix

1. Register NDVI observation codes in `observation_master`:
```sql
INSERT INTO observation_master (observation_code, observation_category, canonical_group, is_active, ...)
VALUES 
  ('NDVI_DECLINE', 'PHYSIOLOGY', 'abiotic_stress', true, ...),
  ('NDVI_COLLAPSE', 'PHYSIOLOGY', 'abiotic_stress', true, ...),
  ('NDVI_STABLE', 'PHYSIOLOGY', 'abiotic_stress', true, ...);
```

2. Expand NDVI rules to cover TILLERING, GRAND_GROWTH stages:
```sql
UPDATE decision_rules 
SET stage_applicable = ARRAY['SEEDLING', 'TILLERING', 'GRAND_GROWTH', 'MATURITY']
WHERE rule_id IN ('SC_IRRIGATION_GENERAL_010', 'SC_IRRIGATION_GENERAL_002', 
                  'SC_STRESS_GENERAL_001', 'SC_PHYSIOLOGY_GENERAL_001');
```

3. Create a mapping from `NDVI_DECLINE_IN_PLANT_CROP_REQ` → canonical symbols in `observation_aliases`.

---

## 3. `condition_code` Column is Decorative

**Classification: DATA GAP**

All 517 rules have `condition_code = 'STAGE_GENERAL'`. This column is described in memory docs as a "mandatory FK to observation_master" used for rule eligibility — but it serves zero filtering purpose since every rule has the same value.

The loader assigns it to `conditionCode` (line 223) with fallback `'() => true'` (a JS string, never executed). No downstream code references `conditionCode` for matching.

### Impact
- The memory docs describe `condition_code` as mandatory for eligibility: "A rule is eligible ONLY if condition_code is present in the canonical observation set." If this were enforced, only rules whose `condition_code` value appears in the observation set would fire. Since all rules use `STAGE_GENERAL`, and `STAGE_GENERAL` IS in `observation_master`, this would accidentally pass — but only because every rule uses the same generic value, defeating the purpose.

### Required Fix
This is a long-term data migration: each rule should have its specific observation code (e.g., `BORE_HOLES`, `YELLOWING_LEAVES`) as `condition_code`, not a blanket `STAGE_GENERAL`.

---

## 4. Hardcoded Data Findings

| File | Line | Hardcoded Value | In DB? | Fix |
|------|------|----------------|--------|-----|
| `layered-rule-evaluator.ts` | 921-931 | Crop code aliases (SC→SUGARCANE, CTN→COTTON, etc.) | No | Move to DB table or share with loader |
| `layered-rule-evaluator.ts` | 965-980 | `CATEGORY_PATTERNS` (PEST, DISEASE keyword lists) | Partially (observation_master) | Load from `observation_master.observation_category` |
| `layered-rule-evaluator.ts` | 983-991 | `PLANT_PART_PATTERNS` | Partially (observation_master) | Load from `observation_master.affected_plant_part` |
| `loader.ts` | 517-518 | `PEST_OBS` list for `pest_present` gate | No | Load from observation_master WHERE category='PEST' |
| `loader.ts` | 536-538 | Extended pest observation list | No | Same |
| `loader.ts` | 543-545 | Deficiency observation list | No | Load from observation_master WHERE category='NUTRIENT' |
| `loader.ts` | 549-551 | Abnormal growth observation list | No | Load from observation_master WHERE category='PHYSIOLOGY' |
| `loader.ts` | 563 | Critical stages hardcoded | No | Load from crop_stage_master |
| `orchestrator.ts` | 1538, 4733 | `SUGARCANE → 'sc'` mapping | No | Use shared alias table |

---

## 5. Database Integrity Findings

| Check | Result |
|-------|--------|
| Rules with empty `conditions_json` | 0 |
| Rules with no `action_text` | 0 |
| Rules with no `action_type` | 0 |
| Rules with no `i18n_key` | 0 |
| Distinct `condition_code` values | 1 (`STAGE_GENERAL` only) |
| NDVI observations in `observation_master` | 0 |
| NDVI entries in `observation_aliases` | 0 |
| NDVI entries in `intent_observation_mapping` | 0 |
| NDVI rules applicable at TILLERING | 2 of 18 |
| Sugarcane rules that can NEVER fire (due to crop code mismatch) | **454** (87.6%) |
| CTN rules that can NEVER fire (same bug, `ctn` vs `cotton`) | Likely **27** |

---

## 6. Unified Gate + Authority Analysis

The logs show:
```
Treatments Allowed by Authority: true
Allowed Products: NONE
Allowed Dosages: NONE
```

This is **correct behavior given zero matched rules**. The gate is not the problem — it correctly allows treatments, but the symbolic brain upstream produces nothing to allow. The gate is working; the rule engine is starved of candidates.

---

## 7. Language Agnostic Validation

The evaluation pipeline is language-agnostic at the decision layer. Observation matching uses uppercase canonical codes. The `conditions_json` evaluator works on normalized English keys. No Marathi/Hindi strings affect rule firing. The `i18n_key` system is presentation-only.

**One risk:** The orchestrator's crop name extraction (line 1538) depends on `cropName?.toUpperCase() === 'SUGARCANE'` — a string comparison. If NLU returns a Hindi crop name, the `'sc'` shortcode mapping would fail and it would pass the raw Hindi string, which would also fail to match. This is a secondary language fragility.

---

## Immediate Fix Plan

### Fix 1: Crop Code Alias Resolution (CRITICAL — fixes 454 dead rules)

In `layered-rule-evaluator.ts`, update `getAllRulesWithBundled` (lines 862-867) to use crop aliases:

```typescript
const CROP_ALIASES: Record<string, string[]> = {
  'sc': ['sugarcane', 'sugar_cane', 'cane'],
  'ctn': ['cotton', 'kapas'],
  'wh': ['wheat'], 'ric': ['rice', 'paddy'],
  'soy': ['soybean', 'soya'], 'maz': ['maize', 'corn'],
};

// In filter:
return ruleCrop === normalizedCrop 
  || CROP_ALIASES[normalizedCrop]?.includes(ruleCrop)
  || Object.entries(CROP_ALIASES).some(([k, v]) => v.includes(normalizedCrop) && ruleCrop === k)
  || ruleCrop === 'all' || ruleCrop === '*' || ruleCrop === 'universal';
```

Apply the same fix to `loadRulesForCrop` in `loader.ts` (line 1036-1041).

### Fix 2: NDVI Stage Expansion (SQL)

```sql
UPDATE decision_rules 
SET stage_applicable = array_cat(stage_applicable, ARRAY['TILLERING', 'GRAND_GROWTH'])
WHERE crop_code = 'SUGARCANE' AND is_active = true 
AND conditions_json::text ILIKE '%ndvi%'
AND NOT 'TILLERING' = ANY(stage_applicable)
AND NOT 'ALL' = ANY(stage_applicable);
```

### Fix 3: Register NDVI Observation Codes (SQL)

Insert NDVI-related observation codes into `observation_master` and create alias mappings so the NLU-generated `NDVI_DECLINE_IN_PLANT_CROP_REQ` can resolve to rule-engine-compatible symbols.

---

## Validation Checklist

1. After fix: `getAllRulesWithBundled('sc')` should return ~490 rules (454 SUGARCANE + 36 ALL), not 36
2. Log signal: `📦 Loaded 490/517 crop-filtered rules for sc`
3. For SUGARCANE/TILLERING/DAS=77 with NDVI decline: `rules_matched > 0`, `primary_decision !== null`
4. Edge function logs should show condition ledger entries for NDVI rules being evaluated
5. `RULE_DATA_INTEGRITY_ERROR` should no longer appear for this scenario

