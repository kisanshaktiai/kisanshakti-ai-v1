-- Activates the deployed schedule-reconciler (cron: schedule-reconciler-daily, 02:00).
-- Root cause: crop_thermal_anchor_policy had 0 rows, so the reconciler fail-closed
-- on every land and never applied a shift (verified: 0 tasks with projected_date <> task_date).
-- Scope: rice only — the ONLY crop with gdd_min populated in crop_stage_master (21 stages).
-- No other crop is seeded: seeding without GDD stage data would create false precision.

INSERT INTO public.crop_thermal_anchor_policy
  (crop_code, cultivation_method, anchor_event, source_id, verification_status)
SELECT DISTINCT
  csm.crop_code,
  csm.cultivation_method,
  CASE WHEN csm.cultivation_method ILIKE '%transplant%' THEN 'transplant' ELSE 'sowing' END,
  'ICAR-IIRR/crop_stage_master.gdd_min',
  'verified'
FROM public.crop_stage_master csm
WHERE csm.is_active
  AND csm.gdd_min IS NOT NULL
  AND csm.crop_code = 'rice'
  AND NOT EXISTS (
    SELECT 1 FROM public.crop_thermal_anchor_policy p
    WHERE p.crop_code = csm.crop_code
      AND p.cultivation_method IS NOT DISTINCT FROM csm.cultivation_method
  );

-- Rollback: DELETE FROM public.crop_thermal_anchor_policy
--           WHERE source_id = 'ICAR-IIRR/crop_stage_master.gdd_min';