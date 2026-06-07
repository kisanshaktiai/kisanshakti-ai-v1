UPDATE public.lands
SET lifecycle_status = 'AVAILABLE',
    current_crop = NULL,
    updated_at = now()
WHERE id = '0e279788-0b35-4b1c-b948-c2182029eea1'
  AND NOT EXISTS (
    SELECT 1 FROM public.crop_schedules cs
    WHERE cs.land_id = lands.id
      AND cs.status NOT IN ('HARVESTED','ABANDONED','CANCELLED')
  );