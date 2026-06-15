## Re-audit summary (corrected)

`public.crop_stage_master` already exists and is the DB SSOT for crop → growth_stage windows:

```
crop_code | growth_stage | das_min | das_max
RICE      | GERMINATION  | 0       | 10        ← covers DAS 6
RICE      | SEEDLING     | 10      | 25
RICE      | TRANSPLANTING| 25      | 35
... (RICE, COTTON, MAIZE, SOYBEAN, ONION, POTATO, CHILI, BRINJAL, SUGARCANE all populated)
```

So the previous plan was wrong to point stage resolution at `crop_baseline_guidelines_v2` (that table is for nutrient / irrigation windows per stage, keyed off the stage label — not for deriving the stage from DAS).

Other confirmed DB facts:
- `crop_schedules.sowing_date` (date) + `farmer_id` + `land_id` + `is_active` — SSOT for "real date of sowing".
- `master_products` (variety, `product_type='seed'`) carries `maturity_days_max` — SSOT for variety maturity. `lands.variety_id` / `farmer_plans.current_crop_variety_id` are the join keys (per `mem://database/variety-master-schema-v1`).
- `crop_baseline_guidelines_v2.das_end` is the crop-level fallback for variety maturity (already the documented fallback chain).
- `decision_rules` carries `conditions_json` and supports rule selection by `crop_code` + `growth_stage`; for `RICE`+`GERMINATION` (DAS 0–10) the rice-germination-diagnostic rule must win for DAS 6.

## Implementation plan (revised)

All previous Bug 2 / Bug 3 / data-pipeline points are preserved verbatim. Only the DAS + crop-stage source is corrected to use `crop_stage_master` as SSOT instead of `crop_baseline_guidelines_v2`, and the hardcoded `CROP_STAGE_DURATIONS` is removed accordingly.

### 1. DAS + growth-stage become DB-driven SSOT (no hardcoded agronomy)

**SSOT contract**
- `days_since_sowing = today − crop_schedules.sowing_date` for the active schedule on the land (`is_active=true`, latest `sowing_date`).
- Variety maturity (for stage % and expected harvest): `master_products.maturity_days_max` (variety) → `crop_baseline_guidelines_v2.das_end` (crop) → `120`. Already documented; no change.
- Growth stage: resolved from `crop_stage_master` where `crop_code = X AND das_min <= DAS <= das_max`. If no row matches (DAS past last window) → pick the row with the largest `das_max` for that crop (`POST_HARVEST`/`HARVEST`). If `crop_stage_master` has no rows for the crop → return `UNKNOWN` and log a one-time warning (never invent a stage from code).

**Backend — new helper `supabase/functions/ai-agriculture-chat/utils/resolveCropTimeline.ts`**
- Input: `{ landId, supabase, scope }`.
- Loads active `crop_schedules` row → `sowing_date`, `crop_name`, `variety_id`.
- Normalises crop name → `crop_code` (via existing `crop_synonyms` / `CROP_NAME_TO_CODE` vocabulary — vocabulary only, not agronomy).
- Resolves variety maturity: `master_products.maturity_days_max` → `crop_baseline_guidelines_v2.das_end` → 120.
- Computes `days_since_sowing` from `sowing_date` (UTC date-only, today − sowing_date, clamped ≥ 0).
- Resolves `growth_stage` from `crop_stage_master` via DAS range.
- Returns `{ crop_code, sowing_date, days_since_sowing, growth_stage, maturity_days, expected_harvest_date, source: 'crop_schedule|baseline|fallback', stage_source: 'crop_stage_master|fallback' }`.
- Per-request memoization on `scope.turnCache`.

**Backend wiring**
- `ai-agriculture-chat/index.ts` calls `resolveCropTimeline` once per turn and uses its result as the only source for `landContext.days_since_sowing` and `landContext.growth_stage`.
- Same values are passed into rule evaluator state, unified gate input, and observation-rule lookup (see steps 3–4).

**Frontend**
- Delete `CROP_STAGE_DURATIONS` and `getCropStageFromDAS()` from `src/constants/crops.ts`. Keep `CROP_NAME_TO_CODE` (vocabulary, not agronomy).
- Replace `deriveCropCycle()` in `src/lib/cropStage.ts` with a thin wrapper that:
  - Computes `daysSinceSowing` from the real `sowing_date` only.
  - Reads `stage`/`stageKey`/`expectedHarvestDate` from backend-provided fields (`landContext.growth_stage`, `landContext.expected_harvest_date`).
  - Removes the local `stageFromProgress()` heuristic.
- All UI surfaces (`SmartLandConfirmCard`, `useCropGrowthTracking`, `CropGrowthTracking` page) read stage/DAS from the land/landContext object, never from a client-side table.
- For surfaces that load without backend data (offline confirm card), expose a small client RPC `getCropStageFromMaster(crop_code, das)` that queries `crop_stage_master` (cached in `useOfflineData`) instead of using the hardcoded table.

**Caching**
- Add `crop_stage_master` to the existing `baseline-guidelines-cache.ts` pattern (or new sibling cache); cache key `crop_code`, value `Array<{growth_stage, das_min, das_max}>`. Refreshed on edge cold start.

### 2. Fix observation propagation for clarification selections
- In `layered-rule-evaluator.ts → convertBundledToRule`, include `(state as any).visual_symptoms` in `uniqueVisualSymptoms` so option-selected observations reach `evaluateConditionsJson`.
- In `orchestrator.ts` option-selected path, set `confirmed_observations: allObservations` AND inject `days_since_sowing` + `growth_stage` from `resolveCropTimeline` onto the rule-evaluation state.
- In both option-selected success and no-rules fallback return paths, expose the selected observation on `decision_output.symptom_keys` and top-level `metadata.symptomKeys` so `index.ts`'s observation-rule bypass (`lookupSafeRuleForObservations`) is reachable.

### 3. Make observation-rule lookup DAS-aware
- Extend `lookupSafeRuleForObservations()` (`decision/observation-rule-lookup.ts`) to accept `daysSinceSowing`.
- Filter candidate rules by `conditions_json.das_range.min/max` when DAS is known; ties broken by `priority` then `rule_id` (existing logic).
- `index.ts` passes the SSOT `days_since_sowing` from step 1 into the lookup.
- Result: DAS 6 + `OBS_RICE_NO_EMERGENCE` deterministically picks `RICE_GERMINATION_DIAGNOSTIC_001`, not the DAS 8–14 resow rule.

### 4. Add `das_range` support to the rule evaluator
- Teach `evaluateConditionsJson()` to evaluate `conditions_json.das_range` (`min <= input.days_since_sowing <= max`).
- Source DAS from `state.days_since_sowing ?? state.days_after_sowing_exact` (already populated by step 1).
- Regression tests cover DAS 6 → diagnostic, DAS 10 → resow.

### 5. Remove targeted hardcoded agricultural fallback
- Remove the static `criticalFallback` observation-expansion dictionary in `orchestrator.ts`.
- On DB alias expansion failure, fail safely with only the confirmed observation; never invent codes in code.

### 6. Fix chat persistence and reopen ordering (Bug 2)
- `ai-agriculture-chat` returns persisted `{ id, role, created_at, session_id }` for both user and assistant rows in the response payload.
- If `ai_chat_messages` insert fails, return an explicit `storage_status: 'failed'` so the UI marks the turn `failed` instead of silently optimistic. Replace today's `console.warn`-only swallow.
- `EnhancedAIChatInterface.tsx` replaces the optimistic LocalDB record with the server-confirmed id/`created_at` from the response, instead of writing parallel client rows.
- `chatSyncService.getLastMessageTime()` ignores rows whose `syncStatus !== 'synced'` (i.e. client-temp / pending) when computing the delta cursor — fixes the "real row is skipped because optimistic timestamp is newer" bug.
- Chat list rendering sorts by server `created_at`; client `timestamp` is used only while a row is in the `sending` state.

### 7. Regression tests + smoke validation
- Deno tests:
  - `resolveCropTimeline` returns DB-derived DAS + stage from `crop_schedules.sowing_date` and `crop_stage_master` (RICE DAS 6 → `GERMINATION`).
  - Variety maturity fallback chain (variety → baseline → 120).
  - `visual_symptoms` bridge in `layered-rule-evaluator`.
  - `das_range` condition evaluation.
  - `lookupSafeRuleForObservations` picks `RICE_GERMINATION_DIAGNOSTIC_001` at DAS 6 and the resow rule at DAS 10.
- Frontend test: optimistic→server replacement + delta cursor ignores pending rows.
- Smoke: send "भात अजून उगवले नाही", select `OBS_RICE_NO_EMERGENCE`; verify Marathi 5-point field-inspection text, not the generic monitoring template.

## What this plan does NOT do
- Does not create new agronomy tables. Uses existing `crop_schedules`, `crop_stage_master`, `master_products`, `crop_baseline_guidelines_v2`, `decision_rules`, `decision_rules_translations_archive`.
- Does not change `CROP_NAME_TO_CODE` (vocabulary normalization, not agronomy).
- Does not redesign the optimistic-UI architecture beyond replacing client rows with server-confirmed rows.

## Data gaps to flag (no code action in this plan, will surface as warnings)
- `crop_stage_master` lacks rows for `WHEAT`, `GRAM`, `GROUNDNUT`, `TOMATO`, `SUGARCANE` post-grand-growth, etc. When a crop is missing, `resolveCropTimeline` returns `growth_stage='UNKNOWN'` and logs once per cold start so we can seed the missing rows in a follow-up data migration — not in this code change.