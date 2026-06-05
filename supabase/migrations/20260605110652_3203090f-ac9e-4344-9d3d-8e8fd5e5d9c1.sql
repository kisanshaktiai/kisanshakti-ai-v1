
-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: observation_differential_questions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.observation_differential_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_code text NOT NULL,
  language text NOT NULL,
  crop_code text,
  question_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.observation_differential_questions TO anon;
GRANT SELECT ON public.observation_differential_questions TO authenticated;
GRANT ALL ON public.observation_differential_questions TO service_role;

ALTER TABLE public.observation_differential_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read differential questions" ON public.observation_differential_questions;
CREATE POLICY "Public read differential questions"
  ON public.observation_differential_questions
  FOR SELECT
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_obs_diff_q_unique
  ON public.observation_differential_questions (observation_code, language, COALESCE(crop_code, '*'));

CREATE INDEX IF NOT EXISTS idx_obs_diff_q_lookup
  ON public.observation_differential_questions (observation_code, language);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_obs_diff_q_updated_at ON public.observation_differential_questions;
CREATE TRIGGER trg_obs_diff_q_updated_at
  BEFORE UPDATE ON public.observation_differential_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: LEAF_TIP_BURN_YOUNG differential question (en/hi/mr)
-- crop_code = NULL → applies to all crops; safety-gates uses crop-specific
-- row when present, otherwise this generic one.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.observation_differential_questions
  (observation_code, language, crop_code, question_text)
VALUES
  ('LEAF_TIP_BURN_YOUNG', 'en', NULL,
   'Tip burn on young upper leaves can have several causes: calcium deficiency, boron deficiency, salinity, or salt injury. Potassium deficiency usually shows on older lower leaves first, so we need to rule it out. Please send a photo of the affected leaves and tell me: (1) are the lower older leaves also affected? (2) is there any white salt deposit on the soil? (3) was any fertilizer applied in the last 15 days?'),
  ('LEAF_TIP_BURN_YOUNG', 'hi', NULL,
   'युवा ऊपरी पत्तियों के सिरों का जलना कई कारणों से हो सकता है — कैल्शियम/बोरॉन की कमी, खारापन, या उर्वरक की चोट। पोटाश की कमी आमतौर पर पुरानी निचली पत्तियों पर पहले दिखती है। कृपया बताएं: (1) क्या निचली पुरानी पत्तियाँ भी प्रभावित हैं? (2) मिट्टी पर सफेद नमक की परत है? (3) पिछले 15 दिनों में कोई उर्वरक डाला? और प्रभावित पत्तियों की एक फोटो भेजें।'),
  ('LEAF_TIP_BURN_YOUNG', 'mr', NULL,
   'तरुण वरच्या पानांच्या टोकाचे जळणे अनेक कारणांमुळे होऊ शकते — कॅल्शियम/बोरॉनची कमतरता, क्षारता किंवा खताची इजा. पोटॅशियमची कमतरता सहसा जुन्या खालच्या पानांवर प्रथम दिसते. कृपया सांगा: (1) खालची जुनी पाने पण प्रभावित आहेत का? (2) मातीवर पांढरा क्षाराचा थर आहे का? (3) मागील 15 दिवसांत कोणते खत दिले? आणि प्रभावित पानांचा फोटो पाठवा.')
ON CONFLICT (observation_code, language, COALESCE(crop_code, '*')) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL: decision_rules.crop_age_days_min / crop_age_days_max
-- for every non-sugarcane crop that currently has 0 backfilled rows.
-- Computed from stage_applicable ∩ crop_stage_master DAS windows.
-- ═══════════════════════════════════════════════════════════════════════════
WITH stage_ranges AS (
  SELECT
    UPPER(crop_code) AS crop_code,
    LOWER(growth_stage) AS stage_lc,
    das_min,
    das_max
  FROM public.crop_stage_master
),
rule_ranges AS (
  SELECT
    dr.rule_id,
    MIN(sr.das_min) AS computed_min,
    MAX(sr.das_max) AS computed_max
  FROM public.decision_rules dr
  JOIN LATERAL unnest(dr.stage_applicable) AS s(stage) ON TRUE
  JOIN stage_ranges sr
    ON sr.crop_code = UPPER(dr.crop_code)
   AND sr.stage_lc = LOWER(s.stage)
  WHERE dr.is_active = true
    AND dr.crop_code NOT IN ('SUGARCANE', 'ALL')
    AND dr.crop_age_days_min IS NULL
    AND dr.crop_age_days_max IS NULL
    AND dr.stage_applicable IS NOT NULL
  GROUP BY dr.rule_id
)
UPDATE public.decision_rules dr
SET crop_age_days_min = rr.computed_min,
    crop_age_days_max = rr.computed_max
FROM rule_ranges rr
WHERE dr.rule_id = rr.rule_id;
