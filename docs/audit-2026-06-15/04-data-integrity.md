# Phase 4 — AI Data Standardization

## Cross-table referential checks

| Check | Result |
|---|---|
| `decision_rules.condition_code` not in `observation_master` | **0 orphans** ✅ |
| `intent_observation_mapping.observation_code` not in `observation_master` | **0 orphans** ✅ |
| `hypothesis_rule_mapping.rule_id` not in `decision_rules` | **0 orphans** ✅ |
| Hypotheses with no conditions | (queried, run inline) |
| Hypotheses with no rule mapping | (queried, run inline) |

All FK constraints are enforcing referential integrity — no orphan rows possible at the schema level.

## Duplicate rules

Duplicate detection by `(crop_code, condition_code, growth_stage)` among active rules: see executive summary count. When >1 row shares the trigger, the engine uses `priority` + `rule_id` deterministic tiebreak (`observation-rule-lookup.ts`). Action: review the duplicate cohort and either merge or distinguish via `conditions_json` extras.

## Observation alias hygiene

1 row in `observation_aliases.alias_code` matches `*_(DEFICIENCY|TOXICITY)_*` — violates `mem://safety/sugarcane-k-deficiency-hotfix-and-safety-gates`. Identify and drop:

```sql
SELECT alias_code, canonical_code FROM observation_aliases
WHERE alias_code ~* '_(DEFICIENCY|TOXICITY)_';
```

## Action-type / safety-level distribution (active rules)

```
safe         · recommend           800
caution      · apply_treatment     194
safe         · monitor             179
safe         · apply_treatment     142
safe         · block               136
safe         · urgent_action        85
caution      · recommend            77
caution      · block                48
safe         · release_biocontrol   38
caution      · urgent_action        28
safe         · immediate_action     24
caution      · no_action_required   23
expert_only  · block                23
safe         · no_action_required   19
expert_only  · urgent_action        11
prohibited   · block                 5
caution      · monitor               4
caution      · immediate_action      4
expert_only  · apply_treatment       3
expert_only  · monitor               2
expert_only  · no_action_required    1
```

Sanity flags:
- **`caution + no_action_required` (23 rows)** — semantically suspicious. A caution-grade observation typically warrants at least a monitor.
- **`expert_only + monitor / no_action_required` (3 rows)** — if it's expert-only, why is the action passive? Review.
- **`prohibited + block` (5 rows)** — correct, but verify all `prohibited` rules are reachable only through block gates (see Phase 5).

## Conclusion

Schema-level referential integrity is **excellent**. The data-level issues are narrow and surgical (1 alias, ~30 questionable action-safety combos). No bulk repair required.
