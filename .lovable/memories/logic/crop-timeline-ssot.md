---
name: Crop Timeline SSOT (DAS + Growth Stage)
description: DAS from crop_schedules.sowing_date; growth_stage from crop_stage_master (NOT crop_baseline_guidelines_v2); variety maturity chain
type: feature
---

DAS + growth-stage are DB-derived, NEVER hardcoded in code.

**Source-of-truth chain (resolveCropTimeline.ts):**
- `days_since_sowing` = today − `crop_schedules.sowing_date` (active schedule on the land).
- `growth_stage` ← `crop_stage_master` row where `crop_code = X AND das_min ≤ DAS ≤ das_max`. Past the last window → row with largest `das_max`. No row for crop → `'UNKNOWN'` (never invent).
- `maturity_days` ← `master_products.maturity_days_max` → `crop_baseline_guidelines_v2.das_end` → 120.

`crop_baseline_guidelines_v2` carries nutrient/irrigation windows keyed by stage label — it is NOT the source for DAS → stage resolution. Always use `crop_stage_master` for stage windows.

**Backend wiring:** `index.ts` calls `resolveCropTimeline({landId, supabase, scope})` once per turn and overlays the resulting `days_since_sowing` and `growth_stage` onto `landContext` so every downstream surface (rule evaluator, unified gate, observation-rule lookup) reads the same SSOT.

**Frontend:** `src/constants/crops.ts` no longer exports `CROP_STAGE_DURATIONS` or `getCropStageFromDAS`. `src/lib/cropStage.ts` returns raw DAS + `'Unknown'` unless the caller passes a server-resolved `stageOverride`.

**Rule engine:** `evaluateConditionsJson` (loader.ts) evaluates `conditions_json.das_range` against `input.days_since_sowing`. `lookupSafeRuleForObservations` accepts `daysSinceSowing` and filters candidate rules by `conditions_json.das_range` before priority sort — so `OBS_RICE_NO_EMERGENCE` at DAS 6 deterministically picks `RICE_GERMINATION_DIAGNOSTIC_001` (DAS 0–7).
