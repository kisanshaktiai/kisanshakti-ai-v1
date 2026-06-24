
ALTER TABLE public.variety_resistance
  ADD COLUMN IF NOT EXISTS canonical_observation_code text;

INSERT INTO public.observation_aliases (alias_code, canonical_code)
SELECT m.alias, m.canonical
FROM (VALUES
  ('CH_THRIPS','THRIPS'),('CP_DROUGHT','DROUGHT_STRESS'),('CP_WILT','WILT'),
  ('CR_LH','JASSID'),('CR_RROT','ROOT_ROT'),('CR_WILT','WILT'),
  ('CT_BW','BOLLWORM'),('CT_JS','JASSID'),
  ('FM_BLAST_F','BLAST'),('FM_BLAST_L','BLAST'),('FM_BLAST_N','BLAST'),('FM_DROUGHT','DROUGHT_STRESS'),
  ('GN_DROUGHT','DROUGHT_STRESS'),('GN_LS','LEAF_SPOT'),('GN_RUST','RUST'),
  ('MG_HEAT','HEAT_STRESS'),('MS_AB','LEAF_BLIGHT'),('MS_WR','RUST'),
  ('MZ_LB','LEAF_BLIGHT'),('MZ_SB','STEM_BORER'),('MZ_TLB','LEAF_BLIGHT'),
  ('ON_PB','LEAF_SPOT'),('PM_DM','DOWNY_MILDEW'),
  ('PP_DROUGHT','DROUGHT_STRESS'),('PP_WILT_FOC','WILT'),
  ('RC_BL','BLAST'),('RC_BLB','LEAF_BLIGHT'),('RC_LODGE','LODGING'),
  ('SB_RUST','SOYBEAN_OBS_RUST'),
  ('SC_DROUGHT','DROUGHT_STRESS'),('SC_REDROT','RED_ROT'),('SC_SMUT','SMUT'),('SC_WATERLOG','WATERLOGGING'),
  ('SF_DM','DOWNY_MILDEW'),('TM_BW','WILT'),
  ('UB_PM','POWDERY_MILDEW'),('UB_WILT','WILT'),
  ('WT_BLAST','BLAST'),('WT_HEAT','HEAT_STRESS'),('WT_LR','WHEAT_OBS_BROWN_RUST'),
  ('WT_LSMUT','SMUT'),('WT_SR','WHEAT_OBS_BLACK_RUST'),('WT_YR','WHEAT_OBS_YELLOW_RUST')
) AS m(alias, canonical)
WHERE EXISTS (SELECT 1 FROM public.observation_master om WHERE om.observation_code = m.canonical)
ON CONFLICT (alias_code, canonical_code) DO NOTHING;

UPDATE public.variety_resistance vr
SET canonical_observation_code = vr.observation_code
WHERE vr.canonical_observation_code IS NULL
  AND EXISTS (SELECT 1 FROM public.observation_master om WHERE om.observation_code = vr.observation_code);

UPDATE public.variety_resistance vr
SET canonical_observation_code = oa.canonical_code
FROM public.observation_aliases oa
WHERE vr.canonical_observation_code IS NULL
  AND oa.alias_code = vr.observation_code;

CREATE INDEX IF NOT EXISTS idx_variety_resistance_canonical
  ON public.variety_resistance (variety_id, canonical_observation_code)
  WHERE canonical_observation_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_variety_resistance_var_obs
  ON public.variety_resistance (variety_id, observation_code);
CREATE INDEX IF NOT EXISTS idx_master_products_agro_eco
  ON public.master_products USING gin (agro_ecological_suitability)
  WHERE product_type = 'seed';
CREATE INDEX IF NOT EXISTS idx_master_products_crop_seed
  ON public.master_products (crop_id)
  WHERE product_type = 'seed';

CREATE OR REPLACE FUNCTION public.enforce_variety_is_seed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_col text := TG_ARGV[0];
BEGIN
  EXECUTE format('SELECT ($1).%I', v_col) USING NEW INTO v_id;
  IF v_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_products WHERE id = v_id AND product_type = 'seed') THEN
    RAISE EXCEPTION 'variety reference (%) must point at a seed master_product (column %)', v_id, v_col;
  END IF;
  RETURN NEW;
END; $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lands_current_crop_variety_fk') THEN
    ALTER TABLE public.lands ADD CONSTRAINT lands_current_crop_variety_fk
      FOREIGN KEY (current_crop_variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_lands_variety_is_seed ON public.lands;
CREATE TRIGGER trg_lands_variety_is_seed
  BEFORE INSERT OR UPDATE OF current_crop_variety_id ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.enforce_variety_is_seed('current_crop_variety_id');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crop_schedules_variety_fk') THEN
    ALTER TABLE public.crop_schedules ADD CONSTRAINT crop_schedules_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_crop_schedules_variety_is_seed ON public.crop_schedules;
CREATE TRIGGER trg_crop_schedules_variety_is_seed
  BEFORE INSERT OR UPDATE OF variety_id ON public.crop_schedules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_variety_is_seed('variety_id');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'land_crops_variety_fk') THEN
    ALTER TABLE public.land_crops ADD CONSTRAINT land_crops_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_land_crops_variety_is_seed ON public.land_crops;
CREATE TRIGGER trg_land_crops_variety_is_seed
  BEFORE INSERT OR UPDATE OF variety_id ON public.land_crops
  FOR EACH ROW EXECUTE FUNCTION public.enforce_variety_is_seed('variety_id');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crop_history_variety_fk') THEN
    ALTER TABLE public.crop_history ADD CONSTRAINT crop_history_variety_fk
      FOREIGN KEY (variety_id) REFERENCES public.master_products(id) ON DELETE SET NULL;
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_crop_history_variety_is_seed ON public.crop_history;
CREATE TRIGGER trg_crop_history_variety_is_seed
  BEFORE INSERT OR UPDATE OF variety_id ON public.crop_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_variety_is_seed('variety_id');
