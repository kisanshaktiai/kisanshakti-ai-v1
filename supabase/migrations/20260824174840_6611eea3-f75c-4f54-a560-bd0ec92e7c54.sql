ALTER TABLE public.crop_stage_master
  ADD COLUMN IF NOT EXISTS clock_reference text NOT NULL DEFAULT 'sowing';

UPDATE public.crop_stage_master
SET clock_reference = 'transplanting'
WHERE lower(crop_code) = 'rice'
  AND (stage_code LIKE 'RICE_TP_%' OR stage_code = 'RICE_TRANSPLANT_ESTABLISHMENT');