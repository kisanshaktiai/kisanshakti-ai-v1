
-- 1. Drop the broken audit trigger that references NEW.id (no such column on observation_master)
DROP TRIGGER IF EXISTS trg_snapshot_observation ON public.observation_master;

-- 2. Now insert the missing observation code that the new NDVI rule depends on
INSERT INTO public.observation_master (
  observation_code, description, is_active, is_diagnostic, is_farmer_observable,
  symptom_category, observation_category, canonical_group,
  observation_type, severity_level, discriminator_score, clarity_score, frequency_score
) VALUES (
  'NDVI_VERY_LOW',
  'Satellite NDVI value <= 0.15 — indicates severe vegetation collapse OR a data-quality issue (cloud cover, bare-soil window, sensor gap). Used for data-quality gating, not as a crop diagnosis.',
  true, false, false,
  'data_quality', 'data_quality', 'NDVI_DATA_QUALITY',
  'GENERIC', 'warning', 70, 80, 30
)
ON CONFLICT (observation_code) DO UPDATE SET
  is_active = true,
  description = EXCLUDED.description,
  symptom_category = EXCLUDED.symptom_category,
  observation_category = EXCLUDED.observation_category,
  canonical_group = EXCLUDED.canonical_group,
  updated_at = now();
