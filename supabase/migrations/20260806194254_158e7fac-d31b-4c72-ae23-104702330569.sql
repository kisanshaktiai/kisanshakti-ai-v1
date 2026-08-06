ALTER TABLE public.weather_forecasts
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS station_ref text,
  ADD COLUMN IF NOT EXISTS station_distance_km numeric(7,2);

CREATE INDEX IF NOT EXISTS idx_weather_fc_issued
  ON public.weather_forecasts (location_key, forecast_type, forecast_time, issued_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_fc_issue
  ON public.weather_forecasts (location_key, forecast_type, forecast_time, issued_at, data_source)
  WHERE issued_at IS NOT NULL;

ALTER TABLE public.weather_observations
  ADD COLUMN IF NOT EXISTS station_ref text,
  ADD COLUMN IF NOT EXISTS station_distance_km numeric(7,2),
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS completeness_pct numeric(5,2);

ALTER TABLE public.weather_current
  ADD COLUMN IF NOT EXISTS station_ref text,
  ADD COLUMN IF NOT EXISTS station_name text,
  ADD COLUMN IF NOT EXISTS station_distance_km numeric(7,2),
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS confidence numeric(3,2);

ALTER TABLE public.land_weather_state
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'observed',
  ADD COLUMN IF NOT EXISTS is_finalized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence numeric(3,2);

CREATE OR REPLACE FUNCTION public.land_cell_key(p_lat numeric, p_lon numeric)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE WHEN p_lat IS NULL OR p_lon IS NULL THEN NULL ELSE
    trim(trailing '.' from trim(trailing '0' from to_char(round(p_lat/0.10)*0.10,'FM990.00')))
    || ',' ||
    trim(trailing '.' from trim(trailing '0' from to_char(round(p_lon/0.10)*0.10,'FM990.00')))
  END;
$$;

ALTER TABLE public.lands ADD COLUMN IF NOT EXISTS cell_key text;

CREATE OR REPLACE FUNCTION public.set_land_cell_key()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.cell_key := public.land_cell_key(NEW.center_lat::numeric, NEW.center_lon::numeric);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_lands_cell_key ON public.lands;
CREATE TRIGGER trg_lands_cell_key
  BEFORE INSERT OR UPDATE OF center_lat, center_lon ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.set_land_cell_key();

UPDATE public.lands SET center_lat = center_lat
 WHERE center_lat IS NOT NULL AND center_lon IS NOT NULL AND cell_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_lands_cell_key ON public.lands (cell_key);