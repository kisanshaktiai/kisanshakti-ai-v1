-- P0-1A: irrigation-event lookup index for the daily derive pipeline
CREATE INDEX IF NOT EXISTS idx_cle_land_type_time
  ON public.crop_lifecycle_events (land_id, event_type, created_at DESC);

-- P0-1C: water-event trace columns on the derived daily state
ALTER TABLE public.land_weather_state
  ADD COLUMN IF NOT EXISTS irrigation_events_used integer,
  ADD COLUMN IF NOT EXISTS irrigation_mm_applied numeric;

-- P0-6: backfill safety. Existing rows were produced under the ratcheted
-- depletion / maize-Kc-fallback behavior and must not be presented as
-- trustworthy historical measured state. Mark them; do NOT fabricate
-- corrected depletion values. Re-derived rows are explicitly re-stamped
-- by the pipeline (source='observed', fresh confidence).
UPDATE public.land_weather_state
SET confidence = NULL, source = 'pre_ratchet_fix'
WHERE source IS DISTINCT FROM 'pre_ratchet_fix';