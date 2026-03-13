

# Full Codebase + Dataset Audit: Sugarcane Decision Brain

---

## 1. Dataset Integrity Issues

### 1.1 All `confidence_score` Values Are 1 (Critical)

Every single sugarcane rule in `decision_rules` has `confidence_score = 1`. This makes the confidence scoring system meaningless — the engine cannot differentiate between a highly specific interveinal chlorosis rule and a generic "balanced NPK" rule. The planned 0-100 → 0-1 migration is irrelevant if every value is 1.

**Affected**: All ~350+ sugarcane rules.

### 1.2 Massive Translation Gaps in `observation_translations`

50+ diagnostic observation codes have **zero translations** for `crop_code = 'SUGARCANE'`. These include critical nutrient deficiency observations that farmers need to understand:

| Missing Translations | Count |
|---------------------|-------|
| `INTERVEINAL_CHLOROSIS` | 0 translations |
| `IRON_DEFICIENCY` | 0 translations |
| `BORON_DEFICIENCY` | 0 translations |
| `NITROGEN_DEFICIENCY` | 0 translations |
| `PHOSPHORUS_DEFICIENCY` | 0 translations |
| `POTASSIUM_DEFICIENCY` | 0 translations |
| `LOWER_LEAVES_YELLOWING` | 0 translations |
| `PALE_YELLOW_WHOLE_PLANT` | 0 translations |
| `LEAF_UNIFORM_YELLOWING` | 0 translations |
| `LEAF_TIP_BURN` | 0 translations |
| `LEAF_ROLLING` | 0 translations |
| `LEAF_MARGIN_SCORCH` | 0 translations |

This is **the root cause of Bug 3 (partial translation)** — when these observation codes appear in the UI, the system falls back to English because no Marathi/Hindi translation exists.

### 1.3 Duplicate/Overlapping Observation Codes

- `ALCOHOL_SMELL`, `ALCOHOLIC_ODOR`, `ALCOHOLIC_SMELL` — three codes for the same symptom (Red Rot internal smell)
- `YELLOWING`, `CHLOROSIS`, `LEAF_YELLOWING` — ambiguous generic codes
- `INTERVEINAL_CHLOROSIS` vs `INTERVEINAL_CHLOROSIS_OLD` vs `INTERVEINAL_YELLOWING` vs `INTERVEINAL_YELLOWING_OLDER_LEAVES` vs `INTERVEINAL_YELLOWING_NEW_LEAVES` — five codes for related symptoms with no clear hierarchy

---

## 2. Observation System Issues

### 2.1 Generic Observations as Rule Triggers (Critical)

Many rules use the same generic observation set `[NUTRIENT_DEFICIENCY, YELLOWING, CHLOROSIS, STUNTED_GROWTH, LEAF_DISCOLORATION]` as triggers. This causes **17+ rules to fire simultaneously** for any yellowing query:

| Rule ID | Cause | Same Observations |
|---------|-------|-------------------|
| `SC_FERT_SCHEDULE_GERMINATION_001` | Basal Fertilizer | ✅ |
| `SC_FERT_SCHEDULE_TILLERING_001` | Split N at Tillering | ✅ |
| `SC_FERT_SCHEDULE_GRAND_GROWTH_001` | Final N Split | ✅ |
| `SC_MICRO_FE_DEFICIENCY_URGENT_001` | Iron Deficiency | ✅ |
| `SC_MICRO_ZN_DEFICIENCY_URGENT_001` | Zinc Deficiency | ✅ |
| `SC_MICRO_MN_DEFICIENCY_URGENT_001` | Manganese Deficiency | ✅ |
| `SC_NUTRITION_K_DEFICIENCY_URGENT_001` | Potassium Deficiency | ✅ |
| `SC_NUTRITION_S_DEFICIENCY_URGENT_001` | Sulphur Deficiency | ✅ |
| `SC_NUTRITION_LUXURY_N_002` | Excess N | ✅ |
| `SC_MICRO_MG_DEFICIENCY_002` | Mg Suppression by K | ✅ |

**Root Cause**: These rules rely on `conditions_json.soil_*` thresholds (e.g., `soil_fe_ppm:<4.5`) to differentiate, but `SymbolicFact` **does not track** `soil_zn_ppm`, `soil_fe_ppm`, `soil_mn_ppm`, `soil_mg_cmol`. The `getNumericFactForConditionKey` function at line 1310 returns `null` for all micronutrient keys. So the soil-based conditions are **never evaluated**, and only the generic observations match.

### 2.2 Observation Codes Not Marked as Diagnostic

Key deficiency observations have `is_diagnostic: false` when they should be `true`:
- `INTERVEINAL_YELLOWING` — pathognomonic for Mg/Fe/Zn
- `GREEN_VEINS` — diagnostic marker
- `YELLOWING_OLDER_LEAVES` — diagnostic for N
- `WHITE_BANDS_ON_LEAVES` — diagnostic for Zn

---

## 3. Agronomic Rule Errors

### 3.1 Misclassified Rules Under Nitrogen Namespace

| Rule ID | Actual Cause | In Nitrogen Namespace? | Problem |
|---------|-------------|----------------------|---------|
| `SC_NUTRITION_NITROGEN_018` | **Internode Borer** (pest) | Yes | Pest rule filed as nutrition |
| `SC_NUTRITION_NITROGEN_030` | Nutrition Over Pest Priority | Yes | Meta-rule, not N-specific |
| `SC_NUTRITION_NITROGEN_004` | Nitrogen | Yes | Observations = `WHITE_BANDS_ON_LEAVES, STUNTED_INTERNODES, SMALL_LEAVES` + `soil_zinc: low` → This is **Zinc deficiency**, not Nitrogen |
| `SC_NUTRITION_NITROGEN_005` | Nitrogen | Yes | Observations = `PURPLE_LEAVES, POOR_ROOT_DEVELOPMENT` + `soil_phosphorus: low` → This is **Phosphorus deficiency**, not Nitrogen |
| `SC_NUTRITION_NITROGEN_025` | Nitrogen | Yes | Observations = `LEAF_TIP_BURN, MARGINAL_SCORCH, WEAK_STALKS, LODGING` + `soil_potassium: low` → This is **Potassium deficiency**, not Nitrogen |
| `SC_NUTRITION_NITROGEN_015` | Nitrogen | Yes | Observations = `CRACKING_INTERNODES, CORKY_LESIONS, WATER_SOAKED_AREAS` + `soil_boron: low` → This is **Boron deficiency**, not Nitrogen |
| `SC_NUTRITION_NITROGEN_026` | Nitrogen | Yes | Duplicate of _005 with `soil_phosphorus: LOW` → **Phosphorus deficiency** |
| `SC_NUTRITION_NITROGEN_010` | Nitrogen | Yes | Observations = `UNIFORM_YELLOWING_YOUNG_LEAVES` → Young leaf yellowing is **Iron/Sulphur**, not Nitrogen (N affects older leaves first) |

**Impact**: When any of these fire, the system diagnoses "Nitrogen deficiency" and recommends Urea, when the actual deficiency is P/K/Zn/B/Fe.

### 3.2 Schedule Rules Have Symptom Observations (Architecture Flaw)

`SC_FERT_SCHEDULE_*` rules include `[NUTRIENT_DEFICIENCY, YELLOWING, CHLOROSIS, STUNTED_GROWTH, LEAF_DISCOLORATION]` as observations. Schedule rules should fire based on **stage + intent**, not symptoms. This causes schedule rules to compete with diagnostic rules when a farmer reports symptoms.

### 3.3 Missing Soil Threshold Guards

The following rules have `conditions_json` with soil thresholds that can never be evaluated:

| Key | Used By Rules | Tracked in SymbolicFact? |
|-----|--------------|-------------------------|
| `soil_zn_ppm` | `SC_MICRO_ZN_*` | No (`null`) |
| `soil_fe_ppm` | `SC_MICRO_FE_*` | No (`null`) |
| `soil_mn_ppm` | `SC_MICRO_MN_*` | No (`null`) |
| `soil_mg_cmol` | `SC_MICRO_MG_*` | No (via `soil_test` string) |
| `soil_s_ppm` | `SC_NUTRITION_S_*` | No |
| `boron_application_kg_ha` | `SC_NUTRITION_BORON_*` | No |

---

## 4. Missing Agronomic Coverage

### 4.1 Nutrient Deficiency Rules Present but Broken

Rules exist for Mg, Zn, Fe, S, Mn but are **functionally broken** because:
1. They share the same generic observations as 15 other rules
2. Their differentiating soil thresholds cannot be evaluated
3. They all have `confidence_score = 1` (no differentiation)

### 4.2 Missing Specific Observation Mappings

The Magnesium rule `SC_MICRO_MG_DEFICIENCY_001` correctly has `INTERVEINAL_CHLOROSIS` in its observations (after the previous fix). However, the generic rules also fire. The system needs a **specificity gate**: specific observations should block generic ones.

---

## 5. Decision Brain Logic Problems

### 5.1 50% Match Threshold Is Too Low (Critical)

At line 1155: `const matches = score >= 0.5`. A rule with 5 conditions where only 3 are evaluable and 2 match → 2/3 = 66% → fires. This is too permissive for medical-grade advisory.

### 5.2 Token-Boundary Matching Is Too Loose

At lines 916-926: The token-match logic requires only 2 common tokens. This means `YELLOWING_OLDER_LEAVES` matches `YELLOWING_YOUNG_LEAVES` (shares `YELLOWING` + `LEAVES`). This is agronomically wrong — older vs young leaf yellowing indicates completely different deficiencies.

### 5.3 NDVI Integration Is Present But Gated

The NDVI guard (lines 324-334) blocks NDVI-only rules unless intent is stress/irrigation. NDVI-enhanced rules (e.g., `SC_IRRIGATION_GENERAL_002`) correctly fire when `NDVI_DECLINE` observation is present. This is architecturally sound.

### 5.4 Rule Priority Architecture Is Correct

The category priority at line 498-501 is: `safety(0) > pest(1) > disease(2) > nutrition(4) > stress(5) > weather(6)`. This is the correct hierarchy. Symptom diagnosis rules are not explicitly separated from schedule rules by category — they both fall under "nutrition".

---

## 6. Codebase Bugs

### 6.1 Micronutrient Soil Data Not Mapped

`getNumericFactForConditionKey` (line 1310) maps only `soil_ph`, `soil_n`, `soil_p`, `soil_k`, `ndvi`, `temperature`, `humidity`, `dos`. Missing:
- `soil_zn_ppm` → `null`
- `soil_fe_ppm` → `null`
- `soil_mn_ppm` → `null`
- `soil_mg` → `null`
- `soil_s_ppm` → `null`
- `soil_b_ppm` → `null`

Even if the DB has soil test data, the reasoner cannot use it.

### 6.2 Singleton Reasoner Stale Client

Line 1564-1569: `getSymbolicReasoner` caches a single instance. In edge functions, the Supabase client changes per request but the reasoner keeps the old one. This could cause stale connection errors at scale.

### 6.3 ROI Metadata Pollutes Condition Evaluation

Many rules have `roi_basis`, `roi_modifier`, `roi_by_region` in `conditions_json`. These are metadata fields, not matching conditions. But the evaluator counts them as unmet conditions (line 1060-1063: objects increment `totalConditions` but never `metConditions`), dragging down match scores.

---

## 7. Database Fix Requirements (No SQL — Guidance Only)

### 7.1 Rules to Correct (Misdiagnosed Cause)

| Rule ID | Current Cause | Correct Cause | Fix |
|---------|--------------|---------------|-----|
| `SC_NUTRITION_NITROGEN_004` | Nitrogen | **Zinc Deficiency** | Change cause, move to `SC_MICRO_ZN_*` namespace |
| `SC_NUTRITION_NITROGEN_005` | Nitrogen | **Phosphorus Deficiency** | Change cause, observations correct for P |
| `SC_NUTRITION_NITROGEN_026` | Nitrogen | **Phosphorus Deficiency** | Duplicate of _005, merge or remove |
| `SC_NUTRITION_NITROGEN_025` | Nitrogen | **Potassium Deficiency** | Change cause, observations correct for K |
| `SC_NUTRITION_NITROGEN_015` | Nitrogen | **Boron Deficiency** | Change cause |
| `SC_NUTRITION_NITROGEN_010` | Nitrogen | **Iron/Sulphur Deficiency** | Young leaf yellowing is NOT nitrogen |
| `SC_NUTRITION_NITROGEN_018` | Internode Borer | **Move to SC_PEST_*** | Wrong category entirely |
| `SC_NUTRITION_NITROGEN_030` | Nutrition Over Pest | **Move to decision_gate** | Meta-rule, not treatment |

### 7.2 Rules to Fix (Generic Observations)

All `SC_FERT_SCHEDULE_*`, `SC_MICRO_*_URGENT_*`, and `SC_NUTRITION_*_URGENT_*` rules must have their `observations` arrays replaced with **deficiency-specific** observations instead of the generic `[NUTRIENT_DEFICIENCY, YELLOWING, CHLOROSIS, STUNTED_GROWTH, LEAF_DISCOLORATION]`.

### 7.3 Confidence Scores to Differentiate

All 350+ rules currently have `confidence_score = 1`. Assign differentiated scores:
- Pathognomonic rules (single-cause): 0.95
- Specific rules (2-3 possible causes): 0.80
- Generic/schedule rules: 0.60
- Fallback rules: 0.40

### 7.4 Translation Rows to Insert

Insert `mr` + `hi` translations for 50+ observation codes listed in section 1.2.

---

## 8. Required New Rules

None needed — the rules **exist** but are broken. The fix is correcting existing data, not adding rules.

---

## 9. Architecture Improvements

### 9.1 Separate Schedule Rules from Diagnostic Rules

Add a `rule_type` column or use `canonical_group` to distinguish:
- `DIAGNOSTIC` — requires symptoms, runs when farmer reports problem
- `SCHEDULE` — runs when farmer asks "what to apply", no symptoms needed
- `SAFETY_GATE` — always runs

Then in the symbolic reasoner, skip `SCHEDULE` rules when symptoms are present.

### 9.2 Add `SKIP_KEYS` for ROI Metadata

Add `roi_basis`, `roi_modifier`, `roi_by_region` to `SKIP_KEYS` set (line 994) so they don't inflate `totalConditions`.

### 9.3 Extend SymbolicFact for Micronutrients

Add `soil_zn_ppm`, `soil_fe_ppm`, `soil_mn_ppm`, `soil_mg_cmol`, `soil_s_ppm`, `soil_b_ppm` to `SymbolicFact` interface and populate from `AuthoritativeLandState`.

### 9.4 Raise Match Threshold

Change line 1155 from `score >= 0.5` to `score >= 0.6` for nutrition rules (or globally).

### 9.5 Token Match Strictness

The token-boundary matcher should require **all** tokens of the shorter code to match, not just 2. `YELLOWING_OLDER_LEAVES` should NOT match `YELLOWING_YOUNG_LEAVES`.

### 9.6 Fix Singleton Reasoner

Pass supabase client per request to `getSymbolicReasoner()` or recreate the instance when the client changes.

---

## Implementation Priority

1. **P0 — Fix 8 misclassified Nitrogen rules** (wrong diagnoses going to farmers NOW)
2. **P0 — Replace generic observations** in schedule/urgent rules with specific ones
3. **P1 — Insert 50+ missing translations** (partial language display)
4. **P1 — Add ROI keys to SKIP_KEYS** (reduces false-positive rule firing)
5. **P2 — Differentiate confidence_scores** (currently all = 1)
6. **P2 — Extend SymbolicFact** with micronutrient soil fields
7. **P3 — Tighten token matching** and match threshold

