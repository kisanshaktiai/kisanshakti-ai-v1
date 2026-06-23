
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.observation_aliases
  ADD COLUMN IF NOT EXISTS alias_text text,
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'und',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='observation_aliases' AND column_name='alias_normalized'
  ) THEN
    ALTER TABLE public.observation_aliases
      ADD COLUMN alias_normalized text
      GENERATED ALWAYS AS (lower(btrim(coalesce(alias_text, alias_code)))) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='observation_aliases_source_chk'
      AND conrelid='public.observation_aliases'::regclass
  ) THEN
    ALTER TABLE public.observation_aliases
      ADD CONSTRAINT observation_aliases_source_chk
      CHECK (source IN ('legacy','rule_token','hypothesis_token','observation_master','farmer_utterance','curated','backfill'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='observation_aliases_conf_chk'
      AND conrelid='public.observation_aliases'::regclass
  ) THEN
    ALTER TABLE public.observation_aliases
      ADD CONSTRAINT observation_aliases_conf_chk
      CHECK (confidence >= 0 AND confidence <= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS observation_aliases_normalized_trgm
  ON public.observation_aliases USING gin (alias_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS observation_aliases_canon_idx
  ON public.observation_aliases (canonical_code) WHERE active;
CREATE INDEX IF NOT EXISTS observation_aliases_lang_idx
  ON public.observation_aliases (language) WHERE active;
CREATE UNIQUE INDEX IF NOT EXISTS observation_aliases_norm_lang_src_canon_uq
  ON public.observation_aliases (alias_normalized, language, source, canonical_code);

-- Backfill display_text
INSERT INTO public.observation_aliases
  (alias_code, canonical_code, alias_text, language, source, confidence, active)
SELECT
  'XLAT_' || upper(coalesce(t.language_code,'und')) || '_' ||
    substr(md5(t.observation_code || '|' || coalesce(t.language_code,'und') || '|' || coalesce(t.display_text,'')), 1, 12),
  t.observation_code,
  t.display_text,
  coalesce(t.language_code,'und'),
  'observation_master',
  1.000,
  true
FROM public.observation_translations t
WHERE t.display_text IS NOT NULL
  AND btrim(t.display_text) <> ''
  AND EXISTS (SELECT 1 FROM public.observation_master m WHERE m.observation_code = t.observation_code)
ON CONFLICT (alias_normalized, language, source, canonical_code) DO NOTHING;

-- Backfill description_text
INSERT INTO public.observation_aliases
  (alias_code, canonical_code, alias_text, language, source, confidence, active)
SELECT
  'XDESC_' || upper(coalesce(t.language_code,'und')) || '_' ||
    substr(md5(t.observation_code || '|D|' || coalesce(t.language_code,'und') || '|' || coalesce(t.description_text,'')), 1, 12),
  t.observation_code,
  t.description_text,
  coalesce(t.language_code,'und'),
  'observation_master',
  0.900,
  true
FROM public.observation_translations t
WHERE t.description_text IS NOT NULL
  AND btrim(t.description_text) <> ''
  AND EXISTS (SELECT 1 FROM public.observation_master m WHERE m.observation_code = t.observation_code)
ON CONFLICT (alias_normalized, language, source, canonical_code) DO NOTHING;

-- Backfill observation_master descriptions
INSERT INTO public.observation_aliases
  (alias_code, canonical_code, alias_text, language, source, confidence, active)
SELECT
  'XMASTER_' || substr(md5(m.observation_code || '|M|' || coalesce(m.description,'')), 1, 12),
  m.observation_code,
  m.description,
  'und',
  'observation_master',
  0.950,
  true
FROM public.observation_master m
WHERE m.is_active = true
  AND m.description IS NOT NULL
  AND btrim(m.description) <> ''
ON CONFLICT (alias_normalized, language, source, canonical_code) DO NOTHING;
