# Schema Drift Audit — AI Agriculture Chat

Run: 2026-06-20. Method: grep every `.from('<table>')` reference in
`supabase/functions/ai-agriculture-chat/**`, then diff column usage against
`information_schema.columns` for the live Supabase project.

## Phantom tables (P0 — silent insert failures)

| Call site | Table | Status before | Fix |
|---|---|---|---|
| `agents/orchestrator.ts:9115` | `agricultural_decisions` | did not exist → fire-and-forget insert silently swallowed | created in migration `20260620_ai_chat_pipeline_hardening` |
| `agents/orchestrator.ts:9234` | `scheduled_followups` | did not exist → no day-3/7/14 reminders ever queued | created |
| `agents/feedback-learning.ts:711` | `confidence_adjustments` | did not exist → calibration drift never persisted | created |
| `agents/feedback-learning.ts:715` | `efficacy_updates` | did not exist → treatment efficacy never updated | created |

Impact: every decision the brain produced was unrecoverable post-response,
no follow-up scheduling worked, and the learning loop produced zero rows.
All four are now real tables with RLS, GRANTs, and indexes; their inserts
also surface errors instead of being silently awaited.

## Cause-named alias rows (P1 — memory-rule violators in legacy data)

`observation_aliases` contains 13 rows whose `alias_code` encodes a cause
(`*_DEFICIENCY_*`, `*_TOXICITY_*`) — explicitly forbidden by the
`mem://safety/sugarcane-k-deficiency-hotfix-and-safety-gates` rule. The
in-code loader already rejects them at runtime (`bundled-rules/loader.ts:1273`).
A `NOT VALID` CHECK constraint
`observation_aliases_no_cause_named_alias` now prevents *new* rows from
landing in this state. The 13 legacy rows are listed for a follow-up
cleanup PR — they are inert because the loader filters them out.

Sample:
- `ZN_DEFICIENCY_KHAIRA → zn_deficiency_khaira`
- `K_DEFICIENCY_RICE → k_deficiency_rice`
- `N_DEFICIENCY_PATTERN → n_deficiency_pattern`
- `FE_TOXICITY_SUSPECTED → fe_toxicity_suspected`
- `IRON_TOXICITY_BRONZE → iron_toxicity_bronze`
- (+ 8 more)

## Column-name drift

None. Every `.select(...)` chain in the chat function references columns
that exist on the target table. Specifically verified:

- `decision_rules`: `rule_id`, `rule_id_lc`, `crop_code`, `condition_code`,
  `conditions_json`, `action_text`, `action_type`, `farmer_safety_level`,
  `growth_stage`, `priority`, `is_active`, `observable_characteristics`,
  `differentiating_questions`, `data_authority_rank`, `deprecated_at`,
  `crop_age_days_min/max`, `required_observation_category`,
  `required_plant_part`, `i18n_key`, `reason_text`, `cause`, `category` — all present.
- `observation_master`: `observation_code`, `is_active`,
  `applicable_crop_groups`, `semantic_class`, `canonical_group`,
  `observation_category`, `affected_plant_part`, `is_farmer_observable` — all present.
- `observation_aliases`: `alias_code`, `canonical_code` — present.
- `intent_observation_mapping`: `intent_code`, `crop_code`, `growth_stage`,
  `das_min/max`, `observation_code`, `confidence_rank`, `is_active` — present.
- `intent_translations`: `intent_code`, `language_code`, `display_text`,
  `question_text` — present.
- `hypothesis_master`: text PK `hypothesis_id` confirmed; `hypothesis_id_lc`
  sidecar present; no `id` field expected.
- `hypothesis_conditions`: `hypothesis_id` (FK), `condition_type`,
  `condition_key`, `operator`, `value_json`, `is_required`,
  `is_discriminator`, `weight`, `is_quarantined` — present.
- `decision_rules_translations_archive`: `rule_id`, `response_mr`,
  `response_hi` — present.
- `direct_advisory_routes`: `route_code`, `notes` — present.
- `emergency_observation_codes`: `observation_code`, `source`, `notes` — present.

## Hot-path indexes added

| Index | Table | Purpose |
|---|---|---|
| `idx_dr_crop_active` | `decision_rules(crop_code, is_active) WHERE is_active` | Rule engine crop scan |
| `idx_dr_condition_code` | `decision_rules(condition_code) WHERE is_active` | Observation→rule lookup |
| `idx_iom_intent_crop_stage` | `intent_observation_mapping(intent_code, crop_code, growth_stage) WHERE is_active` | INTENT_DRIVEN clarification loader |
| `idx_om_active` | `observation_master(observation_code) WHERE is_active` | Loader pagination |

## Live linter

696 pre-existing project-wide linter info/warnings; none introduced by this
migration. All 4 new tables ship with RLS enabled + explicit policies.
