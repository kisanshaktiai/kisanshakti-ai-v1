-- Phase 1 (revised v3): IOM integrity — audit table + F2 surgical cleanup

CREATE TABLE IF NOT EXISTS public.intent_observation_mapping_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iom_id          uuid,
  action          text NOT NULL CHECK (action IN ('QUARANTINE','RESTORE','REJECT_WRITE','FLAGGED_FOR_REVIEW')),
  reason          text NOT NULL,
  before_payload  jsonb,
  after_payload   jsonb,
  sql_batch_id    text,
  performed_by    text DEFAULT current_user,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.intent_observation_mapping_audit TO authenticated;
GRANT ALL    ON public.intent_observation_mapping_audit TO service_role;

ALTER TABLE public.intent_observation_mapping_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iom_audit_admin_read" ON public.intent_observation_mapping_audit;
CREATE POLICY "iom_audit_admin_read"
  ON public.intent_observation_mapping_audit
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

CREATE INDEX IF NOT EXISTS idx_iom_audit_iom_id ON public.intent_observation_mapping_audit(iom_id);
CREATE INDEX IF NOT EXISTS idx_iom_audit_batch  ON public.intent_observation_mapping_audit(sql_batch_id);
CREATE INDEX IF NOT EXISTS idx_iom_audit_action ON public.intent_observation_mapping_audit(action);

-- Helper function (no trigger — Phase 2 will add the curated column)
CREATE OR REPLACE FUNCTION public.validate_iom_semantic_class(
  p_intent_code      text,
  p_observation_code text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT (
    (p_intent_code IN ('WEED_PROBLEM','WEED_MANAGEMENT','HERBICIDE_QUERY')
       AND p_observation_code !~ '(weed|grass|sedge|herbicide|broadleaf|striga|cyperus|cynodon|echinochloa|parthenium|amaranth|portulaca|alternanthera|monocot|dicot)')
    OR
    (p_intent_code IN ('IRRIGATION_QUERY','IRRIGATION_SCHEDULE','WATER_MANAGEMENT')
       AND p_observation_code !~ '(water|moisture|irrigat|drip|flood|wilt|drought|drying|dry_|saturated|waterlog|deficit|et_|evapotrans|leaf_roll|leaf_curl_water|turgor|fruit_crack|flower_drop|sunscald)')
  );
$$;

-- F2 quarantine: rice mapped to wheat-named observations
WITH targets AS (
  SELECT id, intent_code, crop_code, observation_code, is_active
  FROM public.intent_observation_mapping
  WHERE is_active = true
    AND crop_code  = 'rice'
    AND observation_code ~ '_wheat(_|$)'
)
INSERT INTO public.intent_observation_mapping_audit
  (iom_id, action, reason, before_payload, after_payload, sql_batch_id)
SELECT
  t.id,
  'QUARANTINE',
  'F2: rice crop_code mapped to wheat-anatomy observation; description explicitly references wheat',
  to_jsonb(t),
  jsonb_set(to_jsonb(t), '{is_active}', 'false'::jsonb),
  'phase1-f2-cross-crop-v2'
FROM targets t;

UPDATE public.intent_observation_mapping
SET is_active = false
WHERE is_active = true
  AND crop_code  = 'rice'
  AND observation_code ~ '_wheat(_|$)';

-- F1 review flags (NO is_active change)
WITH suspects AS (
  SELECT iom.id, iom.intent_code, iom.crop_code, iom.observation_code, iom.is_active, om.description
  FROM public.intent_observation_mapping iom
  JOIN public.observation_master om ON om.observation_code = iom.observation_code
  WHERE iom.is_active = true
    AND NOT public.validate_iom_semantic_class(iom.intent_code, iom.observation_code)
)
INSERT INTO public.intent_observation_mapping_audit
  (iom_id, action, reason, before_payload, after_payload, sql_batch_id)
SELECT
  s.id,
  'FLAGGED_FOR_REVIEW',
  'F1: intent semantic class disagrees with observation vocabulary (regex-based suspicion). NO is_active change. Agronomy team must triage.',
  to_jsonb(s),
  NULL,
  'phase1-f1-flag-v2'
FROM suspects s;