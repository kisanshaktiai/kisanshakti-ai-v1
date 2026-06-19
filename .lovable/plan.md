## Phase 2 — Observation Master Canonicalisation + Validator Trigger

**Goal:** Promote `observation_master` to a self-describing ontology so the IOM validator can enforce semantic-class integrity in real time, and clean up known anti-patterns (cause-encoded aliases, crop-suffixed observations).

### What I verified in the live DB before planning

| Check | Result |
|---|---|
| `observation_master` rows | 2,537 — 100% have `observation_category` populated |
| `observation_category` distribution | 30+ categories, top 8 cover 84% (PHYSIOLOGY 575, PEST 330, DISEASE 287, LEAF_SYMPTOM 260, MANAGEMENT 244, ABIOTIC 164, NUTRIENT 135, WHOLE_PLANT 80) |
| `observation_type` | Only GENERIC/PRIMARY/SECONDARY — not useful for semantic class |
| Wheat-suffixed obs | 4 active rows (`sticky_leaves_honeydew_wheat`, `termite_mud_tubes_wheat`, `lower_leaf_yellowing_wheat`, `upper_leaf_yellowing_wheat`) — agronomically crop-agnostic |
| Cause-encoded aliases | **1 row** found: `MG_DEFICIENCY_VEINS_GREEN → interveinal_chlorosis_old` (violates `mem://safety/sugarcane-k-deficiency-hotfix-and-safety-gates`) |
| `observation_aliases` schema | `(alias_code, canonical_code, created_at, updated_at)` — no `is_active` |

### Changes

**1. Add `semantic_class` to `observation_master`** — single canonical taxonomy for the validator.

Enum values: `pest`, `disease`, `weed`, `nutrient`, `water_stress`, `weather_damage`, `phenology`, `physiology`, `mechanical`, `market`, `variety`, `management`, `ndvi`, `general`.

Backfill from `observation_category` via this mapping:

```text
PEST, INSECT_SIGNAL, PEST_VISIBLE, PEST_STAGE   → pest
DISEASE, DISEASE_VISIBLE, FUNGAL, BACTERIAL     → disease
WEED                                            → weed
NUTRIENT, NUTRIENT_DEFICIENCY, DEFICIENCY       → nutrient
ABIOTIC                                         → weather_damage   (frost/hail/heat/wind)
STAGE, STAGE_INFO, establishment                → phenology
PHYSIOLOGY, LEAF_SYMPTOM, STEM_SYMPTOM,
ROOT_SYMPTOM, WHOLE_PLANT, FIELD_SYMPTOM,
SYMPTOM, STRESS_VISIBLE                         → physiology
MANAGEMENT, MONITORING, IPM, ACTION_TYPE        → management
NDVI                                            → ndvi
GENERAL, everything else                        → general
```

**2. Quarantine the 1 cause-encoded alias** — `DELETE` the row, write audit entry into `intent_observation_mapping_audit` with `action='ALIAS_QUARANTINE'`.

**3. Promote 4 wheat-suffixed observations to crop-agnostic canonicals** (non-destructive):
- Insert 4 new canonical rows (`sticky_leaves_honeydew`, `termite_mud_tubes`, `lower_leaf_yellowing`, `upper_leaf_yellowing`) with copied metadata + correct `semantic_class`.
- Add `observation_aliases` rows mapping the wheat-suffixed codes → new canonicals (so loaders that resolve aliases route correctly).
- **Do not** touch existing IOM rows that reference the wheat codes — the loader's alias resolver handles redirection; Phase 1's quarantine already removed the 54 cross-crop bad rows.

**4. Upgrade `validate_iom_semantic_class(intent_code, observation_code)`** to read the new `semantic_class` column (replaces the regex-based heuristic from Phase 1).

**5. Install `BEFORE INSERT OR UPDATE` trigger** on `intent_observation_mapping` calling `validate_iom_semantic_class`. New bad rows are rejected at write time. Trigger sets `is_active=false` and logs a `BLOCKED_BY_TRIGGER` audit row instead of raising — non-disruptive, observable.

**6. Add intent → allowed semantic-classes table** `intent_semantic_class_allowlist` (intent_code, allowed_class[]) for the validator to consult. Seeded from the agronomic remap matrix used in Phase 1.5:

```text
IRRIGATION_QUERY            → water_stress, physiology, nutrient
WEED_PROBLEM                → weed
PEST_DAMAGE / *PEST*        → pest
DISEASE_*                   → disease
FERTILIZER_SCHEDULE         → nutrient, physiology
NDVI_ALERT_QUERY            → ndvi
FROST_OR_COLD_DAMAGE        → weather_damage
WIND_STORM_DAMAGE           → weather_damage, mechanical
HEATWAVE_STRESS             → weather_damage, physiology
LODGING_OR_FALLING          → mechanical, weather_damage
STEM_DAMAGE                 → mechanical, pest, disease
LEAF_DAMAGE_VISIBLE         → physiology, pest, disease, mechanical
CROP_STAGE_IDENTIFICATION   → phenology
WEATHER_ADVISORY            → weather_damage, disease, physiology
RESISTANCE_MANAGEMENT_QUERY → weed, pest, disease, management
GENERAL_INFO                → * (all allowed)
```

### Reversibility

- `DROP COLUMN semantic_class` reverts (1).
- Single `INSERT` restores the deleted alias (2).
- `DELETE` the 4 new canonical rows + their aliases reverts (3).
- `DROP TRIGGER` reverts (5).
- `DROP TABLE intent_semantic_class_allowlist` reverts (6).

Full rollback SQL included in the migration description.

### Out of scope (deferred to Phase 3)

- De-hardcoding `BIOTIC_OBS_KEYS`, `EMERGENCY_OBS_CODES`, `ADVISORY_DIRECT_ROUTES`, `IPM_DATABASE`, `DISEASE_DATABASE`, `CULTURAL_STRATEGIES` in the brain — these are code-only edits and depend on `semantic_class` being live.

Approve to proceed and I'll emit the migration.