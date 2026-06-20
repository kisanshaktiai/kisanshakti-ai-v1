## Updated root-cause hypothesis

The first bottleneck to fix is the casing contract break introduced after table data was converted to `lower_snake_case`.

The runtime symbolic brain still uses an in-memory contract of `UPPER_SNAKE_CASE`, while several DB tables now store codes as `lower_snake_case`:

- `observation_master.observation_code`
- `intent_observation_mapping.observation_code`
- `decision_rules.condition_code`
- `decision_rules.conditions_json.observations`
- `decision_rules.observable_characteristics`

The latest trace already proves this mismatch is breaking the pipeline:

```text
LLM_VALIDATOR rejected:
OBS_RICE_NO_EMERGENCE not applicable to crop RICE
OBS_RICE_PATCHY_EMERGENCE not applicable to crop RICE
OBS_RICE_SEED_ROTTED not applicable to crop RICE
OBS_SOIL_CRUST_FORMED not applicable to crop RICE
```

But DB evidence shows those observations do exist and are valid for rice. So the issue is not intent detection; it is boundary normalization and downstream rule eligibility.

## Updated plan

### 1. Audit and fix the casing boundary first
- Audit all code paths in `supabase/functions/ai-agriculture-chat` that compare observation, intent, crop, stage, rule, and condition codes.
- Define one explicit contract:
  - DB ingress: convert query values to `lower_snake_case` where DB data is lower-case.
  - DB egress: convert symbolic codes back to `UPPER_SNAKE_CASE` before in-memory comparison.
  - JSON arrays from DB (`conditions_json.observations`, `observable_characteristics`) must be normalized before scoring.
- Fix any `.includes()`, `.in()`, `.eq()`, and Set membership checks that compare mixed-case codes directly.
- Add targeted logs for casing mismatches so edge logs show both DB raw value and normalized symbolic value.

### 2. Fix crop-applicability validation broken by lower-case data
- Update `utils/llm-output-validator.ts` so `loadCropApplicableObservations()` collects valid crop observations from all DB sources, with casing normalized:
  - `decision_rules.condition_code`
  - `decision_rules.conditions_json.observations`
  - `decision_rules.observable_characteristics`
  - `intent_observation_mapping` rows for crop-specific and `all`
  - `observation_master.crop_group` and `applicable_crop_groups`
- Ensure rice-specific lower-case DB rows like `obs_rice_no_emergence` become `OBS_RICE_NO_EMERGENCE` in memory.
- This should stop valid rice emergence observations from being rejected before the rule engine sees them.

### 3. Fix hypothesis scoring so advisory rules do not hijack diagnosis
- Update `decision/hypothesis-evaluator.ts` so diagnostic hypothesis candidates must have normalized evidence overlap with the farmer’s known observations.
- Normalize `known_observations`, `condition_code`, and `conditions_json.observations` before matching.
- Prevent advisory-only/safety/management rules such as PPE, DSR protocol, banned chemicals, and generic seed treatment from becoming `DIAGNOSIS_FIRST` options for symptom intent `EMERGENCE_FAILURE` unless their exact evidence is present and the intent is advisory.
- Boost exact matches to rice emergence evidence so `RICE_GERMINATION_RESOW_DECISION_001` outranks unrelated nursery-stage management rules.

### 4. Fix rice emergence response path
- In `agents/orchestrator.ts`, for rice + `EMERGENCE_FAILURE` + DAS 8–14/nursery/germination/seedling:
  - preserve canonical rice emergence observations after validation
  - look up the matching safe/caution DB rule
  - return a decision/advisory response sourced from the DB rule text
  - do not return the wrong `CLARIFICATION_QUESTION` with `MANAGEMENT_PLANNING`, PPE, or DSR options
- No hardcoded agronomic advice; use `decision_rules` and translations where available.

### 5. Audit DB data that may still be semantically wrong
Use read queries first, then data updates with the Supabase insert tool only if needed. Do not use migrations for data cleanup.

Check:
- `observation_master` rows for rice emergence observations are active, diagnostic, and rice-applicable.
- `intent_observation_mapping` rows for `EMERGENCE_FAILURE` cover rice nursery/DAS 12.
- `decision_rules` rows for rice emergence have lower-case condition codes/JSON observations that normalize correctly.
- Advisory/safety rules using `management_planning` are not eligible as diagnostic hypotheses for emergence-failure symptoms.

If data updates are required:
- Use the Supabase insert tool for `UPDATE`/`INSERT`/`DELETE` operations.
- Use migrations only if a schema/column/index/function change is actually needed.

### 6. Improve survival-matrix logging around casing and validation
Extend `[OBS_SURVIVAL_MATRIX]` to include counts for:
- raw mapped observations
- after casing normalization
- rejected by LLM validator
- crop-applicable accepted
- hypothesis candidates before advisory filtering
- diagnostic candidates after advisory filtering
- rules matched
- final response observations/actions

Also log a compact rejection sample such as:

```text
[CASE_NORMALIZATION_AUDIT] raw=obs_rice_no_emergence normalized=OBS_RICE_NO_EMERGENCE source=decision_rules.conditions_json
[VALIDATION_REJECTION_AUDIT] code=OBS_RICE_NO_EMERGENCE reason=crop_applicability_miss source_missing=conditions_json
```

### 7. Verification
- Test the deployed edge function with `भात अद्याप उगवले नाही` using rice nursery/DAS 12 context.
- Confirm logs show:
  - `EMERGENCE_FAILURE` intent survives
  - rice emergence observations survive crop validation
  - no valid rice observation is rejected due to casing
  - `RICE_GERMINATION_RESOW_DECISION_001` or the correct rice emergence rule is selected
  - response is not the wrong `CLARIFICATION_QUESTION` containing `MANAGEMENT_PLANNING`, PPE, DSR, or generic monitoring text
- Re-check DB queries after fixes to confirm data and code contracts match.