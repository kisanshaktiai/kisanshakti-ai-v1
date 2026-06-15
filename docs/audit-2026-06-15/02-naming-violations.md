# Phase 2 — Naming Standards Audit

## Target standard

| Object class | Standard | Example |
|---|---|---|
| Tables | `lowercase_snake_case` | `decision_rules` |
| Columns | `lowercase_snake_case` | `condition_code` |
| Enum values | `lowercase_snake_case` | `safe`, `caution` |
| `observation_code` | `lowercase_snake_case`, prefix `obs_` optional | `obs_rice_no_emergence` |
| `rule_id` | `lowercase_snake_case`, prefix `rule_` recommended | `rule_rice_germination_diagnostic_001` |
| `hypothesis_id` | `lowercase_snake_case`, prefix `hyp_` recommended | `hyp_rice_seed_rot_001` |
| `intent_code` | `lowercase_snake_case`, prefix `intent_` | `intent_pest_damage` |

## Current state vs. standard

```
class                  rows    matches  status
─────────────────────────────────────────────────
tables (in scope)        38       38    ✅
columns (in scope)      ~700     ~700   ✅ (snake_case throughout)
enum: action_type        21      21    ✅ (recommend, apply_treatment, monitor, block, ...)
enum: farmer_safety       5       5    ✅ (safe, caution, expert_only, prohibited)
observation_code      2,537    2,537   ✅ all lowercase
  with `obs_` prefix    607       —    ⚠ inconsistent prefix usage
  without prefix      1,930       —    ⚠ inconsistent prefix usage
rule_id               1,852       0    ❌ 100% UPPER_SNAKE (1,850) + 2 mixed
hypothesis_id           346       0    ❌ 100% UPPER_SNAKE (231 with HYP_ prefix)
```

## Critical inconsistency

Within the same database, **observation codes are lowercase but rule_ids and hypothesis_ids are uppercase**. Every join and filter that compares them in code is case-sensitive (Postgres text compare + JS `===`). Production has been masking this by always storing matching case in DB rows (e.g. `decision_rules.condition_code = 'obs_rice_no_emergence'`), but any hand-authored code constant or test fixture using `'OBS_RICE_NO_EMERGENCE'` will silently miss every row. See Phase 6.

## Recommendation

- **No rename needed for `observation_master`** (already canonical).
- **Add normalization shim at every boundary** (P0 hotfix): lowercase incoming symptom codes before DB lookup. Strip/add `obs_` prefix consistently.
- **Phased lowercase migration for `decision_rules.rule_id` and `hypothesis_master.hypothesis_id`** — see Phase 9 design.
- **Standardize prefix:** decide one of `{obs_,rule_,hyp_,intent_}` prefix mandatory OR all forbidden — currently mixed (607 obs with prefix, 1,930 without).

## Violation export

A row-level CSV would be 4,200+ rows (1,852 rule_ids + 346 hyp_ids + 1,930 obs without prefix + 2 outlier rules). Generated on demand via:

```sql
SELECT 'rule_id' AS class, rule_id AS current,
       lower(regexp_replace(rule_id, '^', 'rule_')) AS proposed
FROM decision_rules WHERE rule_id !~ '^rule_[a-z0-9_]+$'
UNION ALL
SELECT 'hypothesis_id', hypothesis_id,
       lower(regexp_replace(hypothesis_id, '^HYP_?', 'hyp_'))
FROM hypothesis_master WHERE hypothesis_id !~ '^hyp_[a-z0-9_]+$';
```

Run this only when ready to execute Stage 1 of the migration (Phase 9).
