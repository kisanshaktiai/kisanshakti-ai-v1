## Goal
Force every row in `observation_master.canonical_group` onto the approved 38-value taxonomy. Audit found **22 violations** that break the symbolic decision pipeline.

## Root cause
Three classes of corruption in `observation_master.canonical_group`:

| Type | Count | Example |
|---|---|---|
| Crop-prefixed (illegal) | 5 | `rice_germination_failure` on `obs_rice_no_emergence` + 4 siblings |
| UPPER ad-hoc (illegal) | 1 | `NDVI_DATA_QUALITY` on `ndvi_very_low` |
| NULL (gate/safety codes) | 16 | `phi_check`, `management_planning`, `banned_chem_request`, `vigorous_growth`, `sticky_leaves_honeydew`, `termite_mud_tubes`, `upper_leaf_yellowing`, `expert_override`, etc. |

Downstream impact (already proven in trace `trace_mqm8fsp9_lx4j7j`): rice emergence observations never join `canonical_group_mapping`, hypotheses score 0, and PPE / DSR / management_planning advisory rules win `DIAGNOSIS_FIRST` instead of the rice resowing rule.

## Fix plan

### 1. Migration A — repair the 22 corrupt rows
Run a single `UPDATE` migration that reassigns every illegal value to one inside the approved set. Proposed mapping (semantic_class + symptom_category driven, no hallucination):

```
rice_germination_failure rows
  obs_rice_no_emergence          -> 01_physiology   (semantic_class=phenology)
  obs_rice_patchy_emergence      -> 01_physiology
  obs_rice_seed_rotted           -> 04_disease      (seed-rot pathogen)
  obs_rice_seedling_damping_off  -> 04_disease      (Pythium/Rhizoctonia damping-off)
  obs_soil_crust_formed          -> 06_abiotic      (physical_barrier, semantic_class=general)

NDVI_DATA_QUALITY
  ndvi_very_low                  -> 08_remote_sensing

NULL rows (16) — assign by observation_category
  phi_check, recent_spray_history, irac_frac_rotation,
  pre_harvest_window, spray_request, banned_chem_request,
  multi_product_request                              -> 12_safety
  management_planning                                -> 17_management
  ndvi_authority_check                               -> 08_remote_sensing
  expert_override, diagnostic_uncertainty            -> 13_diagnosis
  etl_pre_spray_check                                -> 03_pest
  vigorous_growth                                    -> 01_physiology
  sticky_leaves_honeydew, termite_mud_tubes          -> 03_pest
  upper_leaf_yellowing                               -> 15_deficiency
```

### 2. Migration B — guard rail
Add a `CHECK` constraint on `observation_master.canonical_group` (NOT NULL + value must be in the 38-element approved set). Any future insert/update with a crop-prefixed or ad-hoc group fails at the DB layer instead of silently breaking diagnosis.

### 3. Cross-table sanity sweep (read-only audit, no edits)
After Migration A, run SELECTs against the related tables to confirm no orphaned references survived:

- `decision_rules.canonical_group` — flag any value not in the approved set.
- `canonical_group_mapping.biological_group` — flag any value not in the approved set.
- `hypothesis_master.canonical_group` (if present) — same check.
- `observation_aliases` → join to `observation_master` to confirm aliases still resolve.

Findings are reported back; if non-zero, a follow-up migration is proposed (not bundled now — needs explicit approval per row class).

### 4. Verify pipeline
Re-issue the failing Marathi message `भात अद्याप उगवले नाही` against the rice nursery / DAS 12 land. Expect:
- `[OBS_SURVIVAL_MATRIX]` shows the rice emergence codes surviving the crop-applicability gate.
- Hypothesis evaluator picks the rice resowing / germination decision rule, not PPE / DSR / management_planning.
- Final response is a decision/advisory, not `CLARIFICATION_QUESTION`.

## Out of scope
- No code edits in this plan (the loader already normalizes via `canonical_group_mapping`; once the DB rows are correct, mapping works). If the post-fix trace still misroutes, a second plan will touch `hypothesis-evaluator.ts` and `diagnosis-first-generator.ts`.
- No changes to `decision_rules` data — only audited.

## Approval needed
The proposed mapping for the 16 NULL rows is judgment-based (gate/safety observations have no perfect home in the approved 38 groups). If you want a different bucket for any code (e.g. route all safety gates to `12_management` instead of `12_safety`), tell me before I run Migration A.
