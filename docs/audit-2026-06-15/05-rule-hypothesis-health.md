# Phase 5 — Rule + Hypothesis Engine Health

## Translation coverage — CRITICAL

```
Active rules                              1,846
Rules with response_mr (Marathi)              0
Rules with response_hi (Hindi)                0
```

Every Marathi or Hindi farmer response is currently produced by falling back to English `action_text` and then translating at the LLM layer. This violates `mem://architecture/llm-first-language-agnostic-v3` and `mem://intelligence/multilingual-symbolic-governance-v3` which require DB-authored translations as SSOT and LLM only for narration.

**Recommendation:** bulk-author or import translations into `decision_rules_translations_archive`. Until then, expect non-deterministic translation drift for every farmer response.

## Rule contradictions / conflicts

Run on demand:
```sql
-- Same trigger, different safety levels
SELECT crop_code, condition_code, growth_stage,
       array_agg(DISTINCT farmer_safety_level) AS safeties,
       array_agg(rule_id) AS rules
FROM decision_rules WHERE is_active
GROUP BY 1,2,3
HAVING count(DISTINCT farmer_safety_level) > 1;
```

## Hypothesis hygiene

- Total: 346.
- Hypotheses with **no conditions**: query on demand (`hypothesis_conditions` join).
- Hypotheses with **no rule mapping**: query on demand (`hypothesis_rule_mapping` join).
- Contradictions table populated: yes (`hypothesis_contradictions`), should be loaded into the reasoner cache once per turn.

## Safety reachability

- `farmer_safety_level = prohibited`: 5 rules — all with `action_type = block`. ✅ Cannot leak through `recommend` / `monitor` paths.
- `farmer_safety_level = expert_only`: 40 rules — verify gate code rejects these from auto-execution. See `decision/unified-decision-gate.ts`.
- `farmer_safety_level = caution + no_action_required`: 23 rules — semantically suspicious, see Phase 4.

## Priority collisions

When two rules share `(crop_code, condition_code, growth_stage)` and equal `priority`, tiebreak is `rule_id` (`observation-rule-lookup.ts:107`). Deterministic but arbitrary — flag for product review whether the tiebreak matters in any high-stakes cohort.

## Bottom line

**Translation coverage is the #1 production risk.** Engine wiring is structurally sound; data is what's missing.
