
-- 1. observation_master.can_generate_question -----------------------------
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS can_generate_question boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.observation_master.can_generate_question IS
  'When true, this observation is eligible as a farmer-facing clarification option. DB is authority; runtime must not gate by hardcoded enums.';

-- Backfill: allow farmer-observable non-diagnostic rows.
UPDATE public.observation_master
   SET can_generate_question = true
 WHERE COALESCE(is_active, true) = true
   AND COALESCE(is_farmer_observable, true) = true
   AND COALESCE(is_diagnostic, false) = false;

-- Also allow IOM LITERAL members that happen to be marked is_diagnostic=true
-- (they are curated equivalence-class peers, safe to ask).
UPDATE public.observation_master om
   SET can_generate_question = true
  FROM public.intent_observation_mapping iom
 WHERE om.observation_code = iom.observation_code
   AND iom.assertion_strength = 'LITERAL'
   AND iom.is_active = true
   AND COALESCE(om.is_active, true) = true
   AND COALESCE(om.is_farmer_observable, true) = true;

-- 2. clarification_fallback_questions -------------------------------------
CREATE TABLE IF NOT EXISTS public.clarification_fallback_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_code text NOT NULL,
  intent_family text NOT NULL,
  priority      int  NOT NULL DEFAULT 100,
  label_en      text,
  label_hi      text,
  label_mr      text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_code, intent_family)
);

GRANT SELECT ON public.clarification_fallback_questions TO anon, authenticated;
GRANT ALL    ON public.clarification_fallback_questions TO service_role;

ALTER TABLE public.clarification_fallback_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read clarification fallbacks"
  ON public.clarification_fallback_questions;
CREATE POLICY "public read clarification fallbacks"
  ON public.clarification_fallback_questions
  FOR SELECT USING (is_active = true);

-- Seed the four generic fallback prompts for common intent families.
-- These previously lived hardcoded in runtime/clarification-contract.ts.
INSERT INTO public.clarification_fallback_questions
      (question_code,        intent_family,       priority, label_en,                            label_hi,                                  label_mr)
VALUES
  ('photo_upload',       'EMERGENCE_FAILURE',  10, '📷 Send Photo',                       '📷 फोटो भेजें',                          '📷 फोटो पाठवा'),
  ('water_stress_check', 'EMERGENCE_FAILURE',  20, '💧 Water issue (too much/too little)','💧 पानी की समस्या (कम/ज्यादा)',           '💧 पाण्याची समस्या (कमी/जास्त)'),
  ('pest_check',         'EMERGENCE_FAILURE',  30, '🐛 Pest/insect attack',               '🐛 कीट/कीड़े का हमला',                    '🐛 किडींचा हल्ला'),
  ('nutrient_check',     'EMERGENCE_FAILURE',  40, '🌿 Nutrient deficiency',              '🌿 पोषक तत्व की कमी',                     '🌿 अन्नद्रव्यांची कमतरता'),

  ('photo_upload',       'DIAGNOSIS_GENERIC',  10, '📷 Send Photo',                       '📷 फोटो भेजें',                          '📷 फोटो पाठवा'),
  ('water_stress_check', 'DIAGNOSIS_GENERIC',  20, '💧 Water issue (too much/too little)','💧 पानी की समस्या (कम/ज्यादा)',           '💧 पाण्याची समस्या (कमी/जास्त)'),
  ('pest_check',         'DIAGNOSIS_GENERIC',  30, '🐛 Pest/insect attack',               '🐛 कीट/कीड़े का हमला',                    '🐛 किडींचा हल्ला'),
  ('nutrient_check',     'DIAGNOSIS_GENERIC',  40, '🌿 Nutrient deficiency',              '🌿 पोषक तत्व की कमी',                     '🌿 अन्नद्रव्यांची कमतरता')
ON CONFLICT (question_code, intent_family) DO NOTHING;
