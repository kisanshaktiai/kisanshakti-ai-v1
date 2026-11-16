-- Public read access for verified crop-cultivation reference metadata.
-- Checked in a transactional ROLLBACK dry run on the connected database.
-- No write permissions are granted. Authenticated policy already existed.
BEGIN;
CREATE POLICY "anon_read_active_cultivation_method_master"
ON public.cultivation_method_master
FOR SELECT TO anon
USING (is_active = true);

CREATE POLICY "anon_read_active_crop_cultivation_methods"
ON public.crop_cultivation_methods
FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.cultivation_method_master m
    WHERE m.method_code = crop_cultivation_methods.method_code
      AND m.is_active = true
  )
);
COMMIT;
