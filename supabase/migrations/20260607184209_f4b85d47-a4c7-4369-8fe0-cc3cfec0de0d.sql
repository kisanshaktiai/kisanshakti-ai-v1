ALTER TABLE public.lands
  DROP CONSTRAINT IF EXISTS lands_active_schedule_fk;

ALTER TABLE public.lands
  ADD CONSTRAINT lands_active_schedule_fk
  FOREIGN KEY (active_schedule_id) REFERENCES public.crop_schedules(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;