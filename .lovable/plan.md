

# Agronomic Data Glitch: Root Cause Analysis & Fix Plan

## Critical Findings

### Finding 1: Nitrogen Rules Incorrectly Contain `INTERVEINAL_CHLOROSIS` Observations

The `decision_rules` table has **3 Nitrogen rules** that include `INTERVEINAL_CHLOROSIS` in their `conditions_json.observations`, causing them to fire when a farmer reports interveinal yellowing:

| Rule ID | Cause | Confidence | Has INTERVEINAL_CHLOROSIS |
|---------|-------|-----------|--------------------------|
| `SC_NUTRITION_NITROGEN_029` | Nitrogen | **90** | Yes — wrong |
| `SC_NUTRITION_NITROGEN_012` | Nitrogen | **90** | Yes — wrong |
| `SC_NUTRITION_NITROGEN_022` | Nitrogen | **90** | Has `INTERVEINAL_YELLOWING_OLDER_LEAVES` — wrong |
| `SC_MICRO_MG_DEFICIENCY_001` | Magnesium | **78** | Yes — correct |

**The bug:** The Nitrogen rules have confidence 90 vs Magnesium's 78. The rule engine sorts by confidence, so Nitrogen always wins over the correct Magnesium diagnosis when `INTERVEINAL_CHLOROSIS` is observed.

**Agronomic truth:**
- Interveinal chlorosis (veins green, tissue yellow) = **Magnesium** or **Iron** deficiency
- Nitrogen deficiency = **uniform yellowing** of older leaves, **not** interveinal
- Nitrogen rules should contain `LOWER_LEAVES_YELLOWING`, `PALE_YELLOW_WHOLE_PLANT`, `LEAF_UNIFORM_YELLOWING` — never `INTERVEINAL_CHLOROSIS`

### Finding 2: Missing Magnesium Sulphate in `master_products`

The `master_products` table has **no MgSO4/Epsom Salt product**. The table has Urea, MOP, Zinc Sulphate, but zero Magnesium products. When the correct Mg rule fires, the product repository returns nothing, and the system falls back to generic NPK (Urea + MOP).

### Finding 3: Incorrect Dosages in Urea/MOP Product Records

Current `master_products` records:
- **Urea 46% N**: `dosage_instructions` = "Total 130 kg/acre" — but the system somehow outputs **12 kg/acre** (10x too low)
- **MOP 60% K2O**: `dosage_instructions` = "Apply 40 kg/acre in 2 splits: 20kg at tillering + 20kg at grand growth" — system outputs **21 kg/acre** (close but should be 20kg split)

The dosage extraction logic may be miscalculating or the rule's `action_text` overrides the product dosage.

### Finding 4: No Magnesium Pattern in Observation-Cause-Mapper

The `observation-cause-mapper.ts` perception layer has patterns for Nitrogen, Phosphorus, Potassium deficiencies but **zero patterns** for Magnesium or Zinc deficiency symptoms (interveinal chlorosis).

---

## Fix Plan

### Data Fix 1: Remove `INTERVEINAL_CHLOROSIS` from Nitrogen Rules

Update 3 rules in `decision_rules` to remove agronomically incorrect observation codes:

**Rule `SC_NUTRITION_NITROGEN_029`** — Remove `INTERVEINAL_CHLOROSIS` from observations. This rule has `GREY_SPECKS_ON_LEAVES` + `NECROTIC_SPOTS` which are valid for Nitrogen (keep those).

**Rule `SC_NUTRITION_NITROGEN_012`** — Remove `INTERVEINAL_CHLOROSIS`, `YOUNG_LEAVES_YELLOW`, `GREEN_VEINS` from observations. These are Iron/Zinc deficiency symptoms, not Nitrogen. Replace with `LOWER_LEAVES_YELLOWING`, `PALE_YELLOW_WHOLE_PLANT`.

**Rule `SC_NUTRITION_NITROGEN_022`** — Remove `INTERVEINAL_YELLOWING_OLDER_LEAVES`. Replace with `LOWER_LEAVES_YELLOWING`, `LEAF_UNIFORM_YELLOWING`.

### Data Fix 2: Boost Magnesium Rule Confidence

Update `SC_MICRO_MG_DEFICIENCY_001`: raise `confidence_score` from 78 → **92** (it is the most specific rule for interveinal chlorosis on older leaves) and priority from 6 → **5**.

Add `INTERVEINAL_CHLOROSIS` and `INTERVEINAL_YELLOWING` to its observations (currently only has `INTERVEINAL_CHLOROSIS_OLD`).

### Data Fix 3: Insert Magnesium Sulphate into `master_products`

Insert a new product row:
- **Name**: Magnesium Sulphate (Epsom Salt) MgSO4·7H2O
- **Active ingredients**: `[{"name": "Magnesium", "percentage": 9.8, "form": "MgO"}, {"name": "Sulphur", "percentage": 13, "form": "SO3"}]`
- **Dosage**: Soil: 25 kg/acre. Foliar: 20g/L water, 200L/acre, 2 sprays 15 days apart
- **ai_recommendable**: true
- **ai_metadata**: `{"ipm_level": 5, "target_deficiency": "MAGNESIUM"}`

### Data Fix 4: Add Magnesium/Zinc/Iron Deficiency Patterns to Observation-Cause-Mapper

Add 3 new entries to `OBSERVATION_RULES` in `observation-cause-mapper.ts`:
- **Magnesium deficiency**: patterns for interveinal chlorosis on older leaves, शिरांमधील पिवळेपणा
- **Zinc deficiency**: patterns for interveinal chlorosis on young leaves, white bands
- **Iron deficiency**: patterns for chlorosis on youngest leaves, entire leaf pale

### Data Fix 5: Correct Observation Mappings for Existing Nitrogen Rules

Ensure all Nitrogen rules in `decision_rules` use only agronomically correct observations:
- `LOWER_LEAVES_YELLOWING` — correct for N
- `LEAF_UNIFORM_YELLOWING` — correct for N
- `PALE_YELLOW_WHOLE_PLANT` — correct for N
- `OLDER_LEAF_YELLOWING` — correct for N

Never use:
- `INTERVEINAL_CHLOROSIS` — Mg/Fe/Zn
- `INTERVEINAL_YELLOWING` — Mg/Fe/Zn
- `GREEN_VEINS` — Mg/Fe/Zn
- `YOUNG_LEAVES_YELLOW` with `GREEN_VEINS` — Iron/Zinc

### Data Fix 6: Unrealistic Growth/Yield Claims

Add a validation gate in `deterministic-response-builder.ts` or `llm-response-formatter.ts`:
- Block growth rate claims > 5 cm/day for sugarcane
- Block yield increase claims > 15% from single intervention
- Strip percentage yield claims from LLM output

---

## Files to Modify

| Target | Change |
|--------|--------|
| `decision_rules` table | Update 3 Nitrogen rules (remove INTERVEINAL obs), boost Mg rule |
| `master_products` table | Insert Magnesium Sulphate product |
| `observation-cause-mapper.ts` | Add Mg/Zn/Fe deficiency patterns |
| `llm-response-formatter.ts` | Add yield/growth claim guardrails |

## Expected Result After Fix

Farmer query: "पानांवर शिरांमध्ये पिवळेपणा, शिरा हिरव्या"

**Before**: Nitrogen → Urea 12kg (wrong diagnosis, wrong product, wrong dose)
**After**: Magnesium deficiency → MgSO4 25 kg/acre soil OR 20g/L foliar spray (correct)

