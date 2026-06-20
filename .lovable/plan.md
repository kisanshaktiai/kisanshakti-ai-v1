## Objective

Find and fix the exact point where verified observations, such as `EMERGENCE_FAILURE → SEEDLING_DIED / STUNTED_PLANTS / rice emergence codes`, stop influencing the final farmer response.

```text
Farmer message
→ intent
→ observations
→ ontology / hypothesis
→ layered rule evaluator
→ rule executor
→ gates
→ primary decision
→ response formatter
→ final farmer response
```

## Preliminary verdict from code + DB evidence

The logs prove observation extraction is not the primary failure. The most likely combined loss point is after observation mapping, at the symbolic/rule handoff:

1. `crop_vocabulary` lookup is querying uppercase `RICE` / `ALL`, but live DB rows are lowercase `rice` / `all`, so vocabulary enrichment returns 0 despite DB containing `rice=89`, `all=522` active entries.
2. `LayeredRuleEvaluator` receives observations, but its condition input does not pass `days_after_sowing_exact` as `days_since_sowing`; rules with `conditions_json.das_range` can fail as missing DAS.
3. Rice emergence rules exist in DB, but stage semantics conflict: live stage rows for DAS=12 are `nursery` and `seedling`, while key emergence rules are `stage_applicable=['germination']` and `conditions_json.growth_stage='germination'`.
4. The later `RuleEngineExecutor` does not carry observation arrays into its bridge context and calls `matchRulesByKeywords(..., [])`, so observation intelligence can be discarded after layered evaluation.
5. Response formatting can suppress output when `actions_returned` is empty even if a `primary_decision` or `layered_rule_result` exists.

## Plan

### 1. Add an observation survival trace

Add a per-turn diagnostic object in `ai-agriculture-chat` that records counts and codes at each stage:

```text
MESSAGE_EXTRACTION
INTENT_RESOLVER_DB
ALIAS_EXPANSION
PRE_AUTH_COLLECTION
CANONICAL_STATE
HYPOTHESIS_ENGINE
LAYERED_RULE_EVALUATOR
RULE_ENGINE_EXECUTOR
UNIFIED_GATE
PRIMARY_DECISION
LLM_FORMATTER
FINAL_RESPONSE
```

Each checkpoint will log:

- count
- first 10 codes
- confirmed vs synthetic split
- intent code + confidence
- crop, stage, DAS
- rule IDs matched/applied
- gate action and reason

### 2. Fix crop vocabulary lookup casing

Update `getCropVocabulary()` so it searches both canonical forms instead of assuming uppercase:

- query `crop_code IN (upper, lower)`
- normalize cache keys safely
- preserve existing prompt behavior

This directly addresses the verified log: `Loaded 0 vocabulary entries for RICE / ALL` while DB has lowercase rows.

### 3. Fix DAS propagation into layered rule conditions

Update the layered evaluator condition input so `conditions_json.das_range` receives the real DAS:

- pass `days_since_sowing: state.days_after_sowing_exact ?? state.days_since_sowing`
- also pass `days_after_sowing_exact` for fallback compatibility

This prevents rice DAS=12 emergence rules from failing with `SKIPPED_NO_DATA`.

### 4. Fix establishment-stage equivalence

Normalize early rice establishment stages consistently:

```text
NURSERY, GERMINATION, EMERGENCE, SEEDLING → establishment-compatible stage family
```

Apply this in:

- `mapStageToEnum()` so `nursery` is not lost as `UNKNOWN`
- layered rule stage gate so `seedling/nursery` does not block germination/emergence diagnostic rules
- condition JSON stage matching for establishment-stage aliases

### 5. Patch rice emergence rule data if needed

Use a data update, not schema migration, only after confirming exact rows:

- `RICE_GERMINATION_DIAGNOSTIC_001`
- `RICE_GERMINATION_RESOW_DECISION_001`
- `RICE_SEED_ROT_REMEDIATION_001`
- `RICE_SOIL_CRUST_BREAKING_001`

Expected correction:

- include `nursery` and `seedling` in `stage_applicable`
- allow `growth_stage` array for establishment-compatible stages where agronomically valid

No assumptions: update only rows proven by DB evidence.

### 6. Carry observations into `RuleEngineExecutor`

Extend `RuleExecutionInput` construction to include canonical observation arrays:

- `confirmed_observations`
- `synthetic_observations`
- `visual_symptoms`
- `observations`

Then update `RuleEngineExecutor` / decision graph bridge to pass these observations instead of dropping them or using `[]`.

### 7. Preserve layered primary decision through the final output

Ensure `layered_rule_result.primary_decision` cannot be overwritten by generic `MONITOR_ONLY` or empty executor output:

- treat layered primary decision as authoritative when it has `rule_id` + `action_type`
- populate `actions_returned` from layered primary/matched responses
- preserve `matched_responses`, `rules_fired`, `symptom_keys`, and observation evidence for formatter/gates

### 8. Audit and harden gates

Trace and patch only confirmed suppressions in:

- Unified Decision Gate
- Decision Readiness Gate
- Prescription Gate
- ETL Gate
- Weather Gate
- Safety Gate

Special rule: if `EMERGENCE_FAILURE` at rice DAS=12 has observation-backed rules, the final response must not collapse to generic monitoring without a logged gate reason.

### 9. Audit response builder loss

Verify `llm-response-formatter.ts`, deterministic fallback, and template fallback receive:

- observations
- hypothesis result
- primary decision
- rule IDs
- action text / reason text / knowledge text

Fix any formatter path that returns generic text when symbolic output exists.

### 10. Add regression tests

Add targeted edge-function tests for the production case:

```text
Input: भात अजून उगवले नाही
Crop: Rice
DAS: 12
Stage: NURSERY / SEEDLING
Expected intent: EMERGENCE_FAILURE
Expected observations include: POOR_GERMINATION, UNEVEN_EMERGENCE, GAPS_IN_FIELD, SEEDLING_DIED / OBS_RICE_NO_EMERGENCE where mapped
Expected rule: rice emergence diagnostic/resow path
Expected final response: observation-driven diagnosis or clarification, not generic monitoring
```

Also add contract tests for:

- vocabulary casing lookup
- DAS range evaluation
- establishment-stage equivalence
- observation survival matrix counts
- `actions_returned` populated from layered decision

## Deliverables after implementation

### Executive summary

A ranked root-cause report with the single most likely failure point.

### Observation survival matrix

```text
Stage                 Count  Evidence
Intent mapping         N     codes...
Alias expansion        N     codes...
Canonical state        N     codes...
Hypothesis             N     hypotheses...
Layered rules          N     rules...
Rule executor          N     rules/actions...
Gate                   N     pass/block reason...
Primary decision       N     rule/action...
Response               N     observations shown...
```

### File-level findings

For every confirmed bug:

- file
- function
- line
- evidence
- impact
- fix

### Database findings

For every confirmed DB issue:

- table
- row/rule evidence
- missing or mismatched data
- exact fix applied

### Final answer

Answer clearly:

> The observations were extracted and mapped, but they disappeared because downstream symbolic stages either failed to evaluate observation-backed rules due to casing/stage/DAS handoff bugs, or produced a decision that was later overwritten/suppressed before response formatting.

The final report will support that verdict with code evidence, DB evidence, and edge-log evidence.