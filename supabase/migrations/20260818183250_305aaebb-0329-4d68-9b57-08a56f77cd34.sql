WITH cand AS (
  SELECT t.id AS task_id,
         (SELECT csm.id
            FROM public.crop_stage_master csm
           WHERE csm.is_active
             AND lower(csm.crop_code) = lower(c.value)
             AND (lower(csm.stage_code) = lower(t.stage_key)
                  OR lower(csm.growth_stage) = lower(t.stage_key))
           ORDER BY csm.das_min NULLS LAST, csm.stage_code
           LIMIT 1) AS stage_id
    FROM public.schedule_tasks t
    JOIN public.crop_schedules cs ON cs.id = t.schedule_id
    JOIN public.crops c ON lower(c.label) = lower(cs.crop_name)
   WHERE t.stage_uuid IS NULL
     AND t.stage_key IS NOT NULL
)
UPDATE public.schedule_tasks t
   SET stage_uuid = cand.stage_id
  FROM cand
 WHERE t.id = cand.task_id
   AND cand.stage_id IS NOT NULL;