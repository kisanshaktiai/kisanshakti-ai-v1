---
name: Rice clarification pipeline & OBSERVATION condition schemas
description: Multi-format OBSERVATION condition schemas (sugarcane CONTAINS/code, rice EQUALS/boolean, onion EXISTS/boolean, brinjal EQUALS/code, CONTAINS/array). Evaluator must support all five.
type: feature
---

`hypothesis_conditions.condition_type='OBSERVATION'` is written in five schemas
across crops — all five MUST be handled in
`causal-hypothesis-engine.ts → evaluateCondition`. Supporting only `CONTAINS +
value_json.code` (sugarcane) silently FAILED every condition for 8 of 11 crops
and zeroed hypothesis scores, so no clarification card was ever surfaced.

| Schema | Crops | operator | value_json | match key |
|--------|-------|----------|------------|-----------|
| 1 | sugarcane | CONTAINS | `{code:'…'}` | `value_json.code` |
| 2 | brinjal, tomato | EQUALS | `{code:'…'}` | `value_json.code` |
| 3 | rice, chilli, cotton, maize, soybean, wheat | EQUALS | `true`/`false` | `condition_key` itself |
| 4 | onion, potato | EXISTS | `true`/`false` | `condition_key` itself |
| 5 | rice (1 row) | CONTAINS | `[code, code, …]` | array elements |

Invariants:
- All observation codes are matched case-insensitively
  (`observation_master` is lowercase canonical; `observation_aliases` carries
  UPPERCASE backward-compat aliases).
- `hypothesis_conditions.condition_key` is constrained to lowercase for
  OBSERVATION rows via `hypothesis_conditions_observation_key_lowercase_chk`.
- `observation_master.applicable_crop_groups` must include the crop_group of
  every intent_observation_mapping that references the code; the rice
  back-fill added 'rice' to 66 rows.
- Operator polarity: `CONTAINS|EXISTS|EQUALS|IN` ⇒ expect presence;
  `NOT_*` ⇒ expect absence; presence boolean in value_json flips polarity for
  boolean schemas (3 & 4).
