---
name: IOM is a weight; DB identifier casing
description: intent_observation_mapping must never delete grounded observations; rule/hypothesis ids are UPPER_SNAKE while observation/crop/stage codes are lower_snake.
type: architecture
---
**RC-1 (log-99, rice / tillering / DAS 48, intent=GROWTH_ANOMALY).**
`decision/hypothesis-clarification-builder.ts` seeded the graph with
`confirmed_observations`, and *only when that was empty* fell back to
`loadIOMAllowed`. That made a sparse IOM cell an EXCLUSIVE allowlist: 5
perceived codes (incl. `stunted_plants`) collapsed to the single IOM survivor
`rice_lodging`, which is stage-impossible at tillering →
`NO_STAGE_VALID_HYPOTHESES` → infinite clarification loop.

Contract now:
- Seed = `UNION(confirmed, perceived, IOM-ranked)`. IOM membership and
  `assertion_strength` are RANKING signals only, never eliminations.
- `perceived_observations` flows: GraphTruth → `ObservationContractContext
  .perceivedObservationCodes` → builder. Probe `[OBS_PERCEIVED_HYDRATE]`.
- Traces: `[IOM_WEIGHT] grounded=N iom=M union=K dropped=0`; invariant
  `[IOM_OBS_SUPPRESSION]` fires if post-gate < grounded.
- When the stage gate empties the candidate pool, `[STAGE_DIFFERENTIAL_RECOVERY]`
  re-queries `hypothesis_conditions(condition_type='STAGE')` +
  `hypothesis_master.crop_group` for hypotheses valid at the current stage
  instead of returning zero options.

**RC-2 — DB identifier casing (verified 2026-07-26).**
| column | casing |
| --- | --- |
| `observation_master.observation_code` | lower_snake (2549/2549) |
| `observation_translations.observation_code` | lower_snake (5172/5172) |
| `hypothesis_conditions.condition_key` | lower_snake |
| `decision_rules.rule_id` | UPPER_SNAKE (1853/1853) |
| `hypothesis_rule_mapping.rule_id` | UPPER_SNAKE (1820/1820) |

Use `canonicalRuleId` / `canonicalHypothesisId` (UPPER) for DB identifiers and
`canonicalObsCode` / `canonicalCropCode` / `canonicalStageKey` (lower) for
symbols. `canonicalSymbolCode` is deprecated. Label/translation maps are keyed
by the canonical lower_snake code with an UPPERCASE alias for legacy callers,
and `observation_translations` is selected crop-specific-first.
