# Stage-Linked Schedule Pipeline — Verified Audit & Fix Plan

I re-verified every claim in the uploaded audit against the live database and the current code. Three of the four gaps have changed status since that document was written.

## Verification results

| Gap | Audit claim | Verified status |
|---|---|---|
| G1 | All 516 tasks have `anchor_type`/`anchor_stage` NULL → reconciler moves 0 tasks | **CONFIRMED.** 516 tasks, 0 with `anchor_type`, 0 with `anchor_stage`, 121 with `stage_uuid`. Newest task row is 2026-06-09, i.e. all predate the anchor-writing generator. `reconcile_schedule_for_land` filters on `anchor_type='STAGE' AND anchor_stage IS NOT NULL`, so it matches nothing. |
| G2 | Edge reconciler accepts only `scheduleId`, not `landId` | **ALREADY FIXED.** `schedule-reconciler/index.ts` reads `body.landId ?? body.land_id` and filters. No work needed. |
| G3 | No schedule UI reads stage / shows now-upcoming | **ALREADY BUILT.** `useLandStage.ts`, `CurrentStageHeader.tsx`, `StagePhaseBadge.tsx` exist and are wired into `CropScheduleView`, `TaskTimeline`, `ModernTaskCard`. Remaining genuine gap: no farmer-visible explanation when a date *shifts* (the `schedule_adjustments` reason is never surfaced). |
| G4 | Fertilizer `split_schedule` JSON.parse bug unfixed | **PARSE BUG ALREADY FIXED** in `db/agronomy-repo.ts` (parses text JSON, emits `fertilizer_split_schedule_unparseable` gap). The real remaining issue is **data**: `fertilizer_recommendation_master` has exactly 1 row (cotton) with NULL `split_schedule`. No code fix can produce fertilizer tasks without rows. |

So the plan is much smaller than the audit implies: **one data backfill (G1) plus one small UI addition**, and a data-seeding decision for fertilizer.

## Scope of what actually moves

Of the 516 tasks, only **80** are `pending` + have a `stage_uuid` + belong to an **active** schedule. Those are the high-confidence candidates. The rest are either completed, belong to inactive schedules, or have only a fuzzy `stage_key` (459 rows, 11 distinct keys) with no resolved stage UUID.

## Step 1 — G1 backfill (conservative)

One migration, scoped to tasks that are safe to move:

```sql
UPDATE public.schedule_tasks t
SET anchor_type  = 'STAGE',
    anchor_stage = COALESCE(csm.stage_code, csm.growth_stage, t.stage_key)
FROM public.crop_stage_master csm
WHERE csm.id = t.stage_uuid
  AND t.anchor_type IS NULL
  AND t.stage_uuid IS NOT NULL
  AND t.status = 'pending'
  AND EXISTS (SELECT 1 FROM public.crop_schedules cs
              WHERE cs.id = t.schedule_id AND cs.is_active);
```

Everything else keeps `anchor_type` NULL and stays calendar-fixed — no silent mass date shifts on historical or fuzzy-keyed tasks.

Then the smoke test from the audit, run inside a transaction and rolled back, to confirm `tasks_moved > 0` (or `drift: 0`, which is equally correct).

## Step 2 — Make the shift visible to the farmer

Once tasks move, dates change with no explanation. Add a small, presentation-only rescheduled indicator:

- On task cards where `auto_rescheduled = true`, show a "Rescheduled" chip with the original date and a plain-language reason derived from `adjustment_reason` / the matching `schedule_adjustments` row (e.g. "Moved 4 days later — crop reached tillering later than expected").
- Strings go through the existing `ui_translations` path (en/hi/mr), no hardcoded English.
- No agronomy logic, no new stage authority — read-only rendering of what the reconciler already wrote.

## Step 3 — Fertilizer (G4): decide, do not invent

`fertilizer_recommendation_master` has one cotton row with no split schedule. I will not author NPK doses or split percentages. Options, for you to pick:
- Supply an authoritative source (ICAR/SAU package-of-practices table) that I load verbatim with provenance; or
- Leave as-is — schedules already report `fertilizer_split_schedule_missing` as a visible pending section via `PendingSectionsNotice`.

Nothing here is blocking Steps 1–2.

## Technical notes

- No changes to `reconcile_schedule_for_land`, the trigger, the crons, or the Vault wiring — all verified live and correct.
- No change to `baseline-generator.ts`; it already writes `anchor_type`, `anchor_stage`, and `stage_uuid` correctly for new schedules.
- The backfill is idempotent (`WHERE anchor_type IS NULL`) and reversible (set the touched rows back to NULL).
- Reconciler applies one uniform drift to all stage-anchored pending tasks in a schedule; scoping the backfill as above keeps that blast radius at 80 tasks.
