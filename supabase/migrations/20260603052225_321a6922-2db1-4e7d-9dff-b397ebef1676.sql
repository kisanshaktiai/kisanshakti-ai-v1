
ALTER TABLE public.lands
  ADD COLUMN IF NOT EXISTS current_crop_variety_id uuid
    REFERENCES public.master_products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lands_current_crop_variety_id
  ON public.lands(current_crop_variety_id);
