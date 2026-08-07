UPDATE public.weather_forecasts SET issued_at = COALESCE(issued_at, created_at, now()) WHERE issued_at IS NULL;
ALTER TABLE public.weather_forecasts ALTER COLUMN issued_at SET DEFAULT now();
DROP INDEX IF EXISTS public.uq_weather_fc_issue;
DELETE FROM public.weather_forecasts a USING public.weather_forecasts b
 WHERE a.ctid < b.ctid
   AND a.location_key IS NOT DISTINCT FROM b.location_key
   AND a.forecast_type = b.forecast_type
   AND a.forecast_time = b.forecast_time
   AND a.issued_at = b.issued_at
   AND a.data_source IS NOT DISTINCT FROM b.data_source;
CREATE UNIQUE INDEX uq_weather_fc_issue ON public.weather_forecasts (location_key, forecast_type, forecast_time, issued_at, data_source);