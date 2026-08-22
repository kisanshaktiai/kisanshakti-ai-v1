ALTER TABLE public.weather_aggregates
  ADD COLUMN IF NOT EXISTS temp_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.weather_aggregates'::regclass
      AND conname = 'chk_weather_agg_temp_source'
  ) THEN
    ALTER TABLE public.weather_aggregates
      ADD CONSTRAINT chk_weather_agg_temp_source
      CHECK (temp_source IS NULL OR temp_source IN ('observed','mean_only_synthesized','reanalysis'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_weather_agg_locdate
  ON public.weather_aggregates (location_key, aggregate_date);