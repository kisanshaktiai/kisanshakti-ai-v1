ALTER TABLE public.schedule_tasks
  ADD COLUMN IF NOT EXISTS stage_uuid uuid REFERENCES public.crop_stage_master(id);

CREATE INDEX IF NOT EXISTS idx_schedule_tasks_stage_uuid ON public.schedule_tasks (stage_uuid);

UPDATE public.schedule_tasks t
SET stage_uuid = csm.id
FROM public.crop_schedules cs
JOIN public.crop_stage_master csm
  ON csm.is_active
 AND lower(csm.crop_code) = lower(cs.crop_name)
WHERE t.schedule_id = cs.id
  AND t.stage_uuid IS NULL
  AND t.stage_key IS NOT NULL
  AND lower(csm.stage_code) = lower(t.stage_key);