
-- W0 Pre-flight migration: add updated_at tracking + ndvi_thresholds column
-- Re-uses existing public.update_updated_at_column() trigger function.

-- PRE-2: Add updated_at to 5 reference tables (verified missing)
ALTER TABLE public.crop_stage_master           ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.crop_synonyms               ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.crop_vocabulary             ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.observation_aliases         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.intent_observation_mapping  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Attach BEFORE UPDATE triggers (idempotent: drop-if-exists then create)
DROP TRIGGER IF EXISTS trg_crop_stage_master_updated_at          ON public.crop_stage_master;
CREATE TRIGGER trg_crop_stage_master_updated_at          BEFORE UPDATE ON public.crop_stage_master          FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_crop_synonyms_updated_at              ON public.crop_synonyms;
CREATE TRIGGER trg_crop_synonyms_updated_at              BEFORE UPDATE ON public.crop_synonyms              FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_crop_vocabulary_updated_at            ON public.crop_vocabulary;
CREATE TRIGGER trg_crop_vocabulary_updated_at            BEFORE UPDATE ON public.crop_vocabulary            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_observation_aliases_updated_at        ON public.observation_aliases;
CREATE TRIGGER trg_observation_aliases_updated_at        BEFORE UPDATE ON public.observation_aliases        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_intent_observation_mapping_updated_at ON public.intent_observation_mapping;
CREATE TRIGGER trg_intent_observation_mapping_updated_at BEFORE UPDATE ON public.intent_observation_mapping FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PRE-3: Add ndvi_thresholds JSONB to crop_baseline_guidelines_v2 (verified missing)
-- Shape (per crop): {"bare_soil":0.2,"early_growth":0.4,"healthy":0.6,"peak":0.8}
-- NULL until agronomy team populates; loader must treat NULL as "fall back to global default".
ALTER TABLE public.crop_baseline_guidelines_v2
  ADD COLUMN IF NOT EXISTS ndvi_thresholds JSONB;

COMMENT ON COLUMN public.crop_baseline_guidelines_v2.ndvi_thresholds IS
  'Per-crop NDVI threshold bands. Shape: {bare_soil,early_growth,healthy,peak} as floats 0-1. NULL = use system default. Replaces hardcoded NDVI_THRESHOLDS in decision/authoritative-state-loader.ts.';
