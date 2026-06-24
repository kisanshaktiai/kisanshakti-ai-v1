
-- Wave-S Step 1: extend observation_master in place
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS polarity text NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS applies_to_stages text[] NOT NULL DEFAULT '{}'::text[];

-- Polarity domain guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'observation_master_polarity_chk'
      AND conrelid = 'public.observation_master'::regclass
  ) THEN
    ALTER TABLE public.observation_master
      ADD CONSTRAINT observation_master_polarity_chk
      CHECK (polarity IN ('positive','negative','neutral'));
  END IF;
END $$;

-- Deterministic polarity backfill (data-driven, no agronomic invention)
UPDATE public.observation_master
SET polarity = CASE
  WHEN lower(coalesce(semantic_class,'')) IN ('disease','pest','weed','weather_damage') THEN 'negative'
  WHEN lower(coalesce(semantic_class,'')) IN ('nutrient','physiology')
       AND (
         lower(coalesce(observation_category,'')) ~ '(deficiency|toxicity|stress|damage|disorder|injury|wilt|chlorosis|necrosis|lesion|rot|blight|burn)'
       ) THEN 'negative'
  WHEN lower(coalesce(observation_category,'')) ~ '(healthy|vigorous|optimal|good_growth)' THEN 'positive'
  ELSE 'neutral'
END
WHERE polarity = 'neutral';

CREATE INDEX IF NOT EXISTS observation_master_stages_gin
  ON public.observation_master USING gin (applies_to_stages);
