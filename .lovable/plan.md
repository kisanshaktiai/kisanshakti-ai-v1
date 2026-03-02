

# Deep Audit: Hardcoded Data Sources + Critical Pipeline Fixes

## Forensic Findings

### FINDING 1: 46 observation codes in `decision_rules.observable_characteristics` are MISSING from `observation_master`

These codes are referenced by rules but have no entry in the master registry:

```text
ADULT_BEETLES_AT_LIGHT, BLACK_INSECTS, BORING_DAMAGE, BROWN_INSECTS,
CRACKS_IN_SOIL, DAMAGE_AFTER_FROST, DAMAGE_AFTER_HEAT, DAMAGE_AFTER_RAIN,
DAMAGE_AFTER_WIND, DAMAGED_LINT, EDGE_DAMAGE_ONLY, ENTIRE_FIELD_AFFECTED,
ENTRY_HOLE, EXCESSIVE_TILLERS, FOUL_ODOR_WHEN_CRUSHED, FRASS,
FRUIT_DEFORMED, GAPS_IN_FIELD, GREEN_INSECTS, HOLES_IN_BOLL,
INSECTS_CRAWLING, INSECTS_FLYING, INSECTS_JUMPING, LOCALIZED_SPOTS,
LUSH_VEGETATIVE_GROWTH, MEDIUM_INSECTS, MUD_TUNNELS, PINK_LARVAE,
PLANT_DEATH, POOR_GERMINATION_PERCENT, PURPLISH_LEAVES,
REDUCED_JUICE_QUALITY, ROOT_DRY, SALT_CRUST_VISIBLE, SEED_NOT_GERMINATED,
SEEDLING_STUNTED, SEEDLING_WILTED, SMALL_INSECTS, THICK_LEAVES,
THIN_STEMS, UNIFORM_YELLOWING_OLDER_LEAVES, UNKNOWN_SYMPTOM, WEAK_SHOOTS,
WHITE_ANT_VISIBLE, WHITE_SOIL_DEPOSITS, WHITE_WOOLLY_MASS
```

Impact: Rule matching via `observable_characteristics` fires, but observation validation logs `⚠️ references unknown observation` and downstream translations fail since these codes have no `observation_translations` entries.

### FINDING 2: `response_mr`, `response_hi`, `response_en` columns are DROPPED from DB but code still references them

DB confirms only `action_text`, `reason_text`, `knowledge_text`, `i18n_key` exist. But these files still read dropped columns:
- `response-generator.ts` line 441-443: `rec.actions.response_mr` (always undefined)
- `rule-evaluation-layer.ts` line 195-197: interface declares `response_mr/hi/en`
- `orchestrator.ts` lines 1778-1780, 1820-1822, 1855-1859, 5372-5374: propagates `response_mr/hi/en` (always null)
- `llm-response-formatter.ts` lines 1522, 2034: reads `resp.response_en || resp.response_mr`
- `all-rules.ts` lines 45-47: interface declares `response_mr/hi/en`

### FINDING 3: Hardcoded translation dictionaries violate SSOT

| File | What's Hardcoded |
|------|-----------------|
| `response-generator.ts:420-426` | `symptomNames` dict (5 entries, mr/hi/en) |
| `response-generator.ts:391-397` | `cropNames` dict (5 crops, mr/hi/en) |
| `response-generator.ts:405-412` | `stageNames` dict (6 stages, mr/hi/en) |
| `failure-class-detector.ts:516-556` | 28 English-only fallback option labels |
| `canonical-observation-loader.ts:61-103` | `STAGE_KEY_PRIORITIES` (7 stages × 6-11 codes) |
| `observation-ontology.ts:45-450` | 200+ enum keys (used for type safety) |
| `diagnosis-only-mode.ts:95-98` | Terminal pattern codes |
| `diagnostic-weight-registry.ts:140-143` | Generic field observation codes |

### FINDING 4: `diag_first` path still skips `translateClarificationOptions()`

At `orchestrator.ts:3575`, options from `diagnosis-first-generator.ts` are mapped but NEVER passed through the translation function. The labels arrive as `🔍 GAPS IN FIELD` (emoji + English) and the `RAW_CODE_PATTERN` regex `/^[A-Z][A-Z0-9_]{2,}$/` fails to match because of the emoji prefix.

---

## Implementation Plan

### Step 1: Insert 46 missing observation codes into `observation_master` (DB)

SQL INSERT for all 46 codes with appropriate `observation_category` and `affected_plant_part` metadata. This aligns the DB with what `decision_rules.observable_characteristics` already references.

### Step 2: Insert observation_translations for key codes (DB)

Insert Marathi and Hindi translations for the most critical farmer-facing codes (at minimum: `GAPS_IN_FIELD`, `PLANT_DEATH`, `ENTIRE_FIELD_AFFECTED`, `DAMAGE_AFTER_RAIN`, `SEEDLING_WILTED`, `POOR_GERMINATION_PERCENT`, `BORING_DAMAGE`, `ENTRY_HOLE`, `WEAK_SHOOTS`, `EXCESSIVE_TILLERS`, and the remaining 36).

### Step 3: Fix `diag_first` translation bypass (Code)

**File: `orchestrator.ts` ~line 3575**
- Call `translateClarificationOptions(diagnosisOptions, language, supabase)` before returning
- The existing function handles DB lookup + LLM fallback

**File: `orchestrator.ts` ~line 541**
- Update `RAW_CODE_PATTERN` check to also strip emoji prefixes and test inner text
- Add secondary check: if `observation_key` field is a raw code, mark for translation even if label looks translated

### Step 4: Remove all references to dropped columns (Code)

**Files to fix:**
- `response-generator.ts:441-443` → use `rec.actions.action_text || rec.cause` instead of `response_mr/hi/en`
- `response-generator.ts:419-428` → replace hardcoded `localizeSymptom()` with DB lookup via `loadObservationLabels()`
- `response-generator.ts:390-413` → replace hardcoded `localizeCrop()` and `localizeStage()` with DB-driven or LLM translation
- `rule-evaluation-layer.ts:195-197` → remove `response_mr/hi/en` from interface, use `action_text/reason_text/knowledge_text`
- `orchestrator.ts` (6 locations) → stop propagating `response_mr/hi/en` null values
- `llm-response-formatter.ts:1522,2034` → remove `response_en/response_mr` fallback reads
- `all-rules.ts:45-47` → remove `response_mr/hi/en` from BundledRule interface
- `failure-class-detector.ts:516-556` → replace English-only labels with `observation_key` only (label resolved at render time via translation helper)

### Step 5: Keep `observation-ontology.ts` enum as TypeScript type guard

The enum provides compile-time type safety. It stays but is NOT used for data — all data flows from `observation_master` DB table. The `STAGE_KEY_PRIORITIES` in `canonical-observation-loader.ts` also stays as a priority ordering hint (language-neutral code lists, not labels).

---

## What Changes vs What Stays

| Component | Action | Reason |
|-----------|--------|--------|
| `observation-ontology.ts` enum | **KEEP** | TypeScript type safety, no farmer-facing text |
| `STAGE_KEY_PRIORITIES` | **KEEP** | Language-neutral code ordering, not labels |
| `response_mr/hi/en` references | **REMOVE** | Columns dropped from DB, always null |
| Hardcoded `symptomNames` dict | **REMOVE** | Use `observation_translations` DB |
| Hardcoded `cropNames` dict | **REMOVE** | Use LLM translation at render time |
| Hardcoded `stageNames` dict | **REMOVE** | Use LLM translation at render time |
| Hardcoded fallback option labels | **REMOVE** | Use `observation_key` + translation helper |
| 46 missing observation_master rows | **INSERT** | Align DB with rule references |
| Missing mr/hi translations | **INSERT** | Enable DB-driven label resolution |

