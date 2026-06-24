ALTER TABLE public.white_label_configs
  ADD COLUMN IF NOT EXISTS last_deployed_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_white_label_last_deployed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    NEW.brand_identity    IS DISTINCT FROM OLD.brand_identity OR
    NEW.app_customization IS DISTINCT FROM OLD.app_customization OR
    NEW.theme_colors      IS DISTINCT FROM OLD.theme_colors OR
    NEW.mobile_theme      IS DISTINCT FROM OLD.mobile_theme OR
    NEW.pwa_config        IS DISTINCT FROM OLD.pwa_config OR
    NEW.splash_screens    IS DISTINCT FROM OLD.splash_screens OR
    NEW.css_injection     IS DISTINCT FROM OLD.css_injection OR
    NEW.domain_config     IS DISTINCT FROM OLD.domain_config
  ) THEN
    NEW.last_deployed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_white_label_last_deployed_at ON public.white_label_configs;
CREATE TRIGGER trg_touch_white_label_last_deployed_at
  BEFORE UPDATE ON public.white_label_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_white_label_last_deployed_at();

ALTER TABLE public.white_label_configs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'white_label_configs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.white_label_configs';
  END IF;
END $$;