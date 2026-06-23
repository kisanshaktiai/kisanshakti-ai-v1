
-- Gap tracker
CREATE TABLE IF NOT EXISTS public.observation_vocabulary_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_raw text NOT NULL,
  token_normalized text NOT NULL,
  language text NOT NULL DEFAULT 'und',
  source text NOT NULL DEFAULT 'farmer_utterance',
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_canonical_code text,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.observation_vocabulary_gaps TO authenticated;
GRANT ALL ON public.observation_vocabulary_gaps TO service_role;

ALTER TABLE public.observation_vocabulary_gaps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='observation_vocabulary_gaps' AND policyname='gaps_service_role_all') THEN
    CREATE POLICY gaps_service_role_all ON public.observation_vocabulary_gaps
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='observation_vocabulary_gaps' AND policyname='gaps_auth_read') THEN
    CREATE POLICY gaps_auth_read ON public.observation_vocabulary_gaps
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS obs_gaps_uq
  ON public.observation_vocabulary_gaps (token_normalized, language, source);
CREATE INDEX IF NOT EXISTS obs_gaps_last_seen_idx
  ON public.observation_vocabulary_gaps (last_seen_at DESC) WHERE NOT resolved;

-- Single resolver
CREATE OR REPLACE FUNCTION public.resolve_observation_canonical(
  _raw text,
  _language text DEFAULT 'und'
)
RETURNS TABLE(canonical_code text, match_type text, similarity real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_lang text;
BEGIN
  IF _raw IS NULL OR btrim(_raw) = '' THEN RETURN; END IF;
  v_norm := lower(btrim(_raw));
  v_lang := coalesce(nullif(btrim(_language),''), 'und');

  -- 1. Exact match, preferred language first, then 'und', then anything else.
  RETURN QUERY
    SELECT a.canonical_code,
           'exact'::text,
           1.0::real
    FROM public.observation_aliases a
    WHERE a.active
      AND a.alias_normalized = v_norm
    ORDER BY
      CASE WHEN a.language = v_lang THEN 0
           WHEN a.language = 'und'  THEN 1
           ELSE 2 END,
      a.confidence DESC,
      a.created_at ASC
    LIMIT 5;

  IF FOUND THEN RETURN; END IF;

  -- 2. Trigram fuzzy fallback (threshold 0.55).
  RETURN QUERY
    SELECT a.canonical_code,
           'fuzzy'::text,
           similarity(a.alias_normalized, v_norm)::real AS sim
    FROM public.observation_aliases a
    WHERE a.active
      AND a.alias_normalized % v_norm
      AND similarity(a.alias_normalized, v_norm) >= 0.55
    ORDER BY sim DESC,
             CASE WHEN a.language = v_lang THEN 0
                  WHEN a.language = 'und'  THEN 1
                  ELSE 2 END,
             a.confidence DESC
    LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_observation_canonical(text, text) TO authenticated, service_role, anon;
