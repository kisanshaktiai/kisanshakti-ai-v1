
-- =====================================================================
-- P1 SYMBOLIC BRAIN — CROSS-CROP STRUCTURAL FIX
-- Layer 1 (schema) + Layer 2 (DB-driven backfill)
-- =====================================================================

ALTER TABLE public.intent_observation_mapping
  ADD COLUMN IF NOT EXISTS assertion_strength text NOT NULL DEFAULT 'DIFFERENTIAL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iom_assertion_strength_chk') THEN
    ALTER TABLE public.intent_observation_mapping
      ADD CONSTRAINT iom_assertion_strength_chk
      CHECK (assertion_strength IN ('LITERAL','STRONG_HYPOTHESIS','DIFFERENTIAL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_iom_intent_assertion
  ON public.intent_observation_mapping (intent_code, assertion_strength)
  WHERE is_active = true;

ALTER TABLE public.decision_rules
  ADD COLUMN IF NOT EXISTS min_data_completeness numeric NOT NULL DEFAULT 0.0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'decision_rules_min_data_completeness_chk') THEN
    ALTER TABLE public.decision_rules
      ADD CONSTRAINT decision_rules_min_data_completeness_chk
      CHECK (min_data_completeness >= 0.0 AND min_data_completeness <= 1.0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.intent_assertion_pattern (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_code        text NOT NULL,
  obs_code_regex     text NOT NULL,
  assertion_strength text NOT NULL CHECK (assertion_strength IN ('LITERAL','STRONG_HYPOTHESIS')),
  notes              text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intent_code, obs_code_regex)
);

GRANT SELECT ON public.intent_assertion_pattern TO authenticated;
GRANT ALL    ON public.intent_assertion_pattern TO service_role;

ALTER TABLE public.intent_assertion_pattern ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='intent_assertion_pattern'
      AND policyname='intent_assertion_pattern_read_authenticated'
  ) THEN
    CREATE POLICY "intent_assertion_pattern_read_authenticated"
      ON public.intent_assertion_pattern
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_intent_assertion_pattern()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_intent_assertion_pattern ON public.intent_assertion_pattern;
CREATE TRIGGER trg_touch_intent_assertion_pattern
  BEFORE UPDATE ON public.intent_assertion_pattern
  FOR EACH ROW EXECUTE FUNCTION public.touch_intent_assertion_pattern();

INSERT INTO public.intent_assertion_pattern (intent_code, obs_code_regex, assertion_strength, notes) VALUES
  ('EMERGENCE_FAILURE',    '_no_emergence$',                'LITERAL',           'Farmer literally states crop has not emerged'),
  ('EMERGENCE_FAILURE',    '_poor_germination$',            'LITERAL',           'Farmer reports germination failure'),
  ('EMERGENCE_FAILURE',    '_seed_rot$',                    'STRONG_HYPOTHESIS', 'Common cause of emergence failure'),
  ('POOR_GERMINATION',     '_poor_germination$',            'LITERAL',           NULL),
  ('POOR_GERMINATION',     '_no_emergence$',                'LITERAL',           NULL),
  ('LODGING',              '_lodging$',                     'LITERAL',           'Lodging is directly observable'),
  ('WILTING',              '(_wilt|_wilting)$',             'LITERAL',           NULL),
  ('YELLOWING',            '(_yellowing|_chlorosis)$',      'LITERAL',           NULL),
  ('LEAF_SPOTS',           '_leaf_spot[s]?$',               'LITERAL',           NULL),
  ('BLIGHT',               '_blight$',                      'LITERAL',           NULL),
  ('RUST_DISEASE',         '_rust$',                        'LITERAL',           NULL),
  ('ROT_DISEASE',          '(_rot|_rotting)$',              'LITERAL',           NULL),
  ('BORER_DAMAGE',         '(_borer|_dead_heart|_whitehead)$', 'LITERAL',        NULL),
  ('SUCKING_PEST_DAMAGE',  '(_aphid|_jassid|_thrips|_whitefly|_mealybug)', 'LITERAL', NULL),
  ('DEFOLIATION',          '(_defoliation|_leaf_eating|_chewing)$', 'LITERAL',   NULL),
  ('WATER_STRESS',         '(_drought_stress|_water_stress|_moisture_stress)$', 'LITERAL', NULL),
  ('FRUIT_DROP',           '(_fruit_drop|_flower_drop|_bud_drop)$', 'LITERAL',   NULL),
  ('STUNTED_GROWTH',       '(_stunted|_stunting|_dwarfing)$',       'LITERAL',   NULL)
ON CONFLICT (intent_code, obs_code_regex) DO NOTHING;

-- DB-driven backfill (cross-crop, re-runnable)
UPDATE public.intent_observation_mapping iom
SET assertion_strength = p.assertion_strength
FROM public.intent_assertion_pattern p
WHERE p.is_active = true
  AND iom.is_active = true
  AND iom.intent_code = p.intent_code
  AND iom.observation_code ~ p.obs_code_regex
  AND iom.assertion_strength = 'DIFFERENTIAL';
