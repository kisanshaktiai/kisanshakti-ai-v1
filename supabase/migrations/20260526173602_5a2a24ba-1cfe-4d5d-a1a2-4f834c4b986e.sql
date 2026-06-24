CREATE OR REPLACE FUNCTION public.bump_white_label_last_deployed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_deployed_at := COALESCE(NEW.last_deployed_at, now());
  ELSIF TG_OP = 'UPDATE' AND (
    NEW.brand_identity IS DISTINCT FROM OLD.brand_identity OR
    NEW.app_customization IS DISTINCT FROM OLD.app_customization OR
    NEW.theme_colors IS DISTINCT FROM OLD.theme_colors OR
    NEW.mobile_theme IS DISTINCT FROM OLD.mobile_theme OR
    NEW.pwa_config IS DISTINCT FROM OLD.pwa_config OR
    NEW.splash_screens IS DISTINCT FROM OLD.splash_screens OR
    NEW.domain_config IS DISTINCT FROM OLD.domain_config OR
    NEW.css_injection IS DISTINCT FROM OLD.css_injection
  ) THEN
    NEW.last_deployed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_white_label_last_deployed_at ON public.white_label_configs;

CREATE TRIGGER trg_bump_white_label_last_deployed_at
BEFORE INSERT OR UPDATE ON public.white_label_configs
FOR EACH ROW
EXECUTE FUNCTION public.bump_white_label_last_deployed_at();