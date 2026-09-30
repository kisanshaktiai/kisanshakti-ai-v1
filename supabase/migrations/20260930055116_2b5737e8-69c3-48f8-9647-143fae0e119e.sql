CREATE OR REPLACE FUNCTION public.normalize_location_text_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text; uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF NEW.state ~ uuid_re THEN SELECT name INTO r FROM states WHERE id = NEW.state::uuid; NEW.state := r; END IF;
  IF NEW.district ~ uuid_re THEN SELECT name INTO r FROM districts WHERE id = NEW.district::uuid; NEW.district := r; END IF;
  IF NEW.taluka ~ uuid_re THEN SELECT name INTO r FROM talukas WHERE id = NEW.taluka::uuid; NEW.taluka := r; END IF;
  IF NEW.village ~ uuid_re THEN SELECT name INTO r FROM villages WHERE id = NEW.village::uuid; NEW.village := r; END IF;
  IF TG_TABLE_NAME = 'lands' THEN
    IF NEW.state IS NULL AND NEW.state_id IS NOT NULL THEN SELECT name INTO NEW.state FROM states WHERE id = NEW.state_id; END IF;
    IF NEW.district IS NULL AND NEW.district_id IS NOT NULL THEN SELECT name INTO NEW.district FROM districts WHERE id = NEW.district_id; END IF;
    IF NEW.taluka IS NULL AND NEW.taluka_id IS NOT NULL THEN SELECT name INTO NEW.taluka FROM talukas WHERE id = NEW.taluka_id; END IF;
    IF NEW.village IS NULL AND NEW.village_id IS NOT NULL THEN SELECT name INTO NEW.village FROM villages WHERE id = NEW.village_id; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_location_text ON public.lands;
CREATE TRIGGER trg_normalize_location_text BEFORE INSERT OR UPDATE OF state, district, taluka, village, state_id, district_id, taluka_id, village_id ON public.lands FOR EACH ROW EXECUTE FUNCTION public.normalize_location_text_columns();
DROP TRIGGER IF EXISTS trg_normalize_location_text ON public.user_profiles;
CREATE TRIGGER trg_normalize_location_text BEFORE INSERT OR UPDATE OF state, district, taluka, village ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.normalize_location_text_columns();