---
name: Crop Schedule DB-SSOT
description: ai-smart-schedule pipeline (resolve-inputs → baseline-generator → narrate) and schedule-reconciler must contain zero hardcoded agronomy
type: constraint
---
The crop-schedule subsystem is DB-SSOT only:

- `ai-smart-schedule` = `db/resolve-inputs.ts` (crop/variety/cultivation → DB IDs) → `generator/baseline-generator.ts` (tasks from crop_stage_master, fn_calculate_seed_rate / variety_cultivation_agronomy, fertilizer_recommendation_master, crop_baseline_guidelines_v2, decision_rules where `requires_field_action`) → `generator/narrate.ts` (translation ONLY, number-fidelity gate).
- Never reintroduce constant maps: SEED_RATES, NPK_TARGETS, STATE_LABOR_RATES, FERTILIZER_PRICES, IPM_THRESHOLDS, CROP_WATER_REQUIREMENTS, FALLBACK_TASK_TEMPLATES. Locked by `tests/edge/schedule/no-hardcoded-agronomy_test.ts`.
- Missing DB coverage → push a `gaps[]` entry and leave the value null. Never invent, never default land area to 1 acre.
- Every task carries `source_refs`, `rule_ids`, `anchor_type`/`anchor_stage`/`gdd_target`.
- `schedule-reconciler` re-anchors pending STAGE-anchored tasks from `resolve_crop_phenology`, skips `is_pinned`, and writes every change to `schedule_adjustments` with evidence.
- Prices/wages come from `input_prices` / `labor_rates` only (currently unseeded → cost gaps expected).
