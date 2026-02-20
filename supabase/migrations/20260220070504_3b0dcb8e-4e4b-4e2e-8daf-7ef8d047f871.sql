
-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Add crop_code, das_min, das_max to intent_observation_mapping
-- This enables crop-specific and growth-stage-aware observation routing.
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Add columns with safe defaults (ALL crops, full DAS range)
ALTER TABLE public.intent_observation_mapping
  ADD COLUMN IF NOT EXISTS crop_code TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS das_min INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS das_max INTEGER NOT NULL DEFAULT 999;

-- Step 2: Index for fast crop+DAS filtering
CREATE INDEX IF NOT EXISTS idx_iom_crop_das
  ON public.intent_observation_mapping(crop_code, das_min, das_max);

-- Step 3: Add crop_code to observation_translations for crop-specific display text
ALTER TABLE public.observation_translations
  ADD COLUMN IF NOT EXISTS crop_code TEXT NOT NULL DEFAULT 'ALL';

-- Step 4: Populate crop-specific rows from crop_stage_master
-- For each existing intent+observation pair, create crop-specific entries
-- using DAS ranges from crop_stage_master for biological accuracy.

-- SC (Sugarcane) crop-specific mappings
INSERT INTO public.intent_observation_mapping (intent_code, observation_code, confidence_rank, is_active, crop_code, das_min, das_max)
SELECT DISTINCT iom.intent_code, iom.observation_code, iom.confidence_rank, true, 'SC',
  COALESCE(csm.das_min, 0), COALESCE(csm.das_max, 999)
FROM public.intent_observation_mapping iom
CROSS JOIN public.crop_stage_master csm
WHERE csm.crop_code = 'SC'
  AND iom.crop_code = 'ALL'
  AND NOT EXISTS (
    SELECT 1 FROM public.intent_observation_mapping e
    WHERE e.intent_code = iom.intent_code
      AND e.observation_code = iom.observation_code
      AND e.crop_code = 'SC'
  )
ON CONFLICT DO NOTHING;

-- CTN (Cotton) crop-specific mappings
INSERT INTO public.intent_observation_mapping (intent_code, observation_code, confidence_rank, is_active, crop_code, das_min, das_max)
SELECT DISTINCT iom.intent_code, iom.observation_code, iom.confidence_rank, true, 'CTN',
  COALESCE(csm.das_min, 0), COALESCE(csm.das_max, 999)
FROM public.intent_observation_mapping iom
CROSS JOIN public.crop_stage_master csm
WHERE csm.crop_code = 'CTN'
  AND iom.crop_code = 'ALL'
  AND NOT EXISTS (
    SELECT 1 FROM public.intent_observation_mapping e
    WHERE e.intent_code = iom.intent_code
      AND e.observation_code = iom.observation_code
      AND e.crop_code = 'CTN'
  )
ON CONFLICT DO NOTHING;

-- SOY (Soybean) crop-specific mappings
INSERT INTO public.intent_observation_mapping (intent_code, observation_code, confidence_rank, is_active, crop_code, das_min, das_max)
SELECT DISTINCT iom.intent_code, iom.observation_code, iom.confidence_rank, true, 'SOY',
  COALESCE(csm.das_min, 0), COALESCE(csm.das_max, 999)
FROM public.intent_observation_mapping iom
CROSS JOIN public.crop_stage_master csm
WHERE csm.crop_code = 'SOY'
  AND iom.crop_code = 'ALL'
  AND NOT EXISTS (
    SELECT 1 FROM public.intent_observation_mapping e
    WHERE e.intent_code = iom.intent_code
      AND e.observation_code = iom.observation_code
      AND e.crop_code = 'SOY'
  )
ON CONFLICT DO NOTHING;

-- RICE crop-specific mappings
INSERT INTO public.intent_observation_mapping (intent_code, observation_code, confidence_rank, is_active, crop_code, das_min, das_max)
SELECT DISTINCT iom.intent_code, iom.observation_code, iom.confidence_rank, true, 'RICE',
  COALESCE(csm.das_min, 0), COALESCE(csm.das_max, 999)
FROM public.intent_observation_mapping iom
CROSS JOIN public.crop_stage_master csm
WHERE csm.crop_code = 'RICE'
  AND iom.crop_code = 'ALL'
  AND NOT EXISTS (
    SELECT 1 FROM public.intent_observation_mapping e
    WHERE e.intent_code = iom.intent_code
      AND e.observation_code = iom.observation_code
      AND e.crop_code = 'RICE'
  )
ON CONFLICT DO NOTHING;
