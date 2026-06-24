
ALTER TABLE public.intent_observation_mapping_audit
  DROP CONSTRAINT IF EXISTS intent_observation_mapping_audit_action_check;
ALTER TABLE public.intent_observation_mapping_audit
  ADD CONSTRAINT intent_observation_mapping_audit_action_check
  CHECK (action = ANY (ARRAY[
    'QUARANTINE','RESTORE','REJECT_WRITE','FLAGGED_FOR_REVIEW',
    'ALIAS_QUARANTINE','BLOCKED_BY_TRIGGER'
  ]));

ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS semantic_class text;

UPDATE public.observation_master
SET semantic_class = CASE upper(coalesce(observation_category,''))
  WHEN 'PEST' THEN 'pest' WHEN 'INSECT_SIGNAL' THEN 'pest'
  WHEN 'PEST_VISIBLE' THEN 'pest' WHEN 'PEST_STAGE' THEN 'pest'
  WHEN 'DISEASE' THEN 'disease' WHEN 'DISEASE_VISIBLE' THEN 'disease'
  WHEN 'FUNGAL' THEN 'disease' WHEN 'BACTERIAL' THEN 'disease'
  WHEN 'WEED' THEN 'weed'
  WHEN 'NUTRIENT' THEN 'nutrient' WHEN 'NUTRIENT_DEFICIENCY' THEN 'nutrient'
  WHEN 'DEFICIENCY' THEN 'nutrient'
  WHEN 'ABIOTIC' THEN 'weather_damage'
  WHEN 'STAGE' THEN 'phenology' WHEN 'STAGE_INFO' THEN 'phenology'
  WHEN 'ESTABLISHMENT' THEN 'phenology'
  WHEN 'PHYSIOLOGY' THEN 'physiology' WHEN 'LEAF_SYMPTOM' THEN 'physiology'
  WHEN 'STEM_SYMPTOM' THEN 'physiology' WHEN 'ROOT_SYMPTOM' THEN 'physiology'
  WHEN 'WHOLE_PLANT' THEN 'physiology' WHEN 'FIELD_SYMPTOM' THEN 'physiology'
  WHEN 'SYMPTOM' THEN 'physiology' WHEN 'STRESS_VISIBLE' THEN 'physiology'
  WHEN 'MANAGEMENT' THEN 'management' WHEN 'MONITORING' THEN 'management'
  WHEN 'IPM' THEN 'management' WHEN 'ACTION_TYPE' THEN 'management'
  WHEN 'NDVI' THEN 'ndvi'
  ELSE 'general'
END
WHERE semantic_class IS NULL;

ALTER TABLE public.observation_master
  DROP CONSTRAINT IF EXISTS observation_master_semantic_class_chk;
ALTER TABLE public.observation_master
  ADD CONSTRAINT observation_master_semantic_class_chk
  CHECK (semantic_class IN (
    'pest','disease','weed','nutrient','water_stress','weather_damage',
    'phenology','physiology','mechanical','market','variety',
    'management','ndvi','general'
  ));

CREATE INDEX IF NOT EXISTS observation_master_semantic_class_idx
  ON public.observation_master(semantic_class);

INSERT INTO public.intent_observation_mapping_audit
  (action, reason, sql_batch_id, before_payload, performed_by)
SELECT 'ALIAS_QUARANTINE',
  'cause-encoded alias violates mem://safety/sugarcane-k-deficiency-hotfix-and-safety-gates',
  'phase2-canonicalisation-v1',
  jsonb_build_object('alias_code', alias_code, 'canonical_code', canonical_code),
  'phase2_migration'
FROM public.observation_aliases
WHERE alias_code ~* '_(deficiency|toxicity|excess)_';

DELETE FROM public.observation_aliases
WHERE alias_code ~* '_(deficiency|toxicity|excess)_';

INSERT INTO public.observation_master
  (observation_code, description, observation_category, observation_type,
   is_diagnostic, is_active, is_farmer_observable, semantic_class,
   affected_plant_part, symptom_category, crop_group, applicable_crop_groups)
SELECT
  regexp_replace(observation_code, '_wheat$', ''),
  description, observation_category, observation_type,
  is_diagnostic, is_active, is_farmer_observable, semantic_class,
  affected_plant_part, symptom_category,
  lower(coalesce(crop_group, 'universal')),
  ARRAY(SELECT lower(unnest(coalesce(applicable_crop_groups, ARRAY['universal']))))
FROM public.observation_master
WHERE observation_code IN (
  'sticky_leaves_honeydew_wheat','termite_mud_tubes_wheat',
  'lower_leaf_yellowing_wheat','upper_leaf_yellowing_wheat'
)
ON CONFLICT (observation_code) DO NOTHING;

INSERT INTO public.observation_aliases (alias_code, canonical_code) VALUES
  ('sticky_leaves_honeydew_wheat','sticky_leaves_honeydew'),
  ('termite_mud_tubes_wheat','termite_mud_tubes'),
  ('lower_leaf_yellowing_wheat','lower_leaf_yellowing'),
  ('upper_leaf_yellowing_wheat','upper_leaf_yellowing')
ON CONFLICT (alias_code, canonical_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.intent_semantic_class_allowlist (
  intent_code text PRIMARY KEY,
  allowed_classes text[] NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.intent_semantic_class_allowlist TO authenticated, anon;
GRANT ALL ON public.intent_semantic_class_allowlist TO service_role;

ALTER TABLE public.intent_semantic_class_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allowlist readable by all" ON public.intent_semantic_class_allowlist;
CREATE POLICY "allowlist readable by all"
  ON public.intent_semantic_class_allowlist FOR SELECT USING (true);

DROP POLICY IF EXISTS "allowlist managed by service_role only" ON public.intent_semantic_class_allowlist;
CREATE POLICY "allowlist managed by service_role only"
  ON public.intent_semantic_class_allowlist FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.intent_semantic_class_allowlist (intent_code, allowed_classes, notes) VALUES
  ('IRRIGATION_QUERY',            ARRAY['water_stress','physiology','nutrient'], 'soil_too_dry, wilting'),
  ('WEED_PROBLEM',                ARRAY['weed'], 'strict'),
  ('PEST_DAMAGE',                 ARRAY['pest'], 'strict'),
  ('PEST_IDENTIFICATION',         ARRAY['pest'], 'strict'),
  ('DISEASE_DIAGNOSIS',           ARRAY['disease'], 'strict'),
  ('DISEASE_QUERY',               ARRAY['disease'], 'strict'),
  ('FERTILIZER_SCHEDULE',         ARRAY['nutrient','physiology'], NULL),
  ('NUTRIENT_DEFICIENCY',         ARRAY['nutrient','physiology'], NULL),
  ('NDVI_ALERT_QUERY',            ARRAY['ndvi'], 'strict'),
  ('FROST_OR_COLD_DAMAGE',        ARRAY['weather_damage'], 'strict'),
  ('WIND_STORM_DAMAGE',           ARRAY['weather_damage','mechanical'], 'includes hail'),
  ('HEATWAVE_STRESS',             ARRAY['weather_damage','physiology'], NULL),
  ('LODGING_OR_FALLING',          ARRAY['mechanical','weather_damage'], NULL),
  ('STEM_DAMAGE',                 ARRAY['mechanical','pest','disease'], NULL),
  ('LEAF_DAMAGE_VISIBLE',         ARRAY['physiology','pest','disease','mechanical'], 'broad fallback'),
  ('CROP_STAGE_IDENTIFICATION',   ARRAY['phenology'], 'strict'),
  ('WEATHER_ADVISORY',            ARRAY['weather_damage','disease','physiology'], NULL),
  ('RESISTANCE_MANAGEMENT_QUERY', ARRAY['weed','pest','disease','management'], NULL),
  ('GENERAL_INFO',                ARRAY['pest','disease','weed','nutrient','water_stress','weather_damage','phenology','physiology','mechanical','market','variety','management','ndvi','general'], 'wildcard')
ON CONFLICT (intent_code) DO UPDATE
  SET allowed_classes = EXCLUDED.allowed_classes,
      notes = EXCLUDED.notes,
      updated_at = now();

DROP FUNCTION IF EXISTS public.validate_iom_semantic_class(text,text);

CREATE FUNCTION public.validate_iom_semantic_class(
  p_intent_code text,
  p_observation_code text
) RETURNS TABLE(is_valid boolean, obs_class text, allowed text[], reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class text; v_allowed text[]; v_canonical text;
BEGIN
  SELECT canonical_code INTO v_canonical
    FROM observation_aliases WHERE alias_code = p_observation_code LIMIT 1;
  IF v_canonical IS NULL THEN v_canonical := p_observation_code; END IF;

  SELECT semantic_class INTO v_class
    FROM observation_master WHERE observation_code = v_canonical;

  IF v_class IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text[], 'observation_not_found';
    RETURN;
  END IF;

  SELECT allowed_classes INTO v_allowed
    FROM intent_semantic_class_allowlist WHERE intent_code = p_intent_code;

  IF v_allowed IS NULL THEN
    RETURN QUERY SELECT true, v_class, NULL::text[], 'intent_not_in_allowlist_permissive';
    RETURN;
  END IF;

  IF v_class = ANY(v_allowed) THEN
    RETURN QUERY SELECT true, v_class, v_allowed, NULL::text;
  ELSE
    RETURN QUERY SELECT false, v_class, v_allowed, 'semantic_class_not_in_allowlist';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.iom_validate_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result record;
BEGIN
  SELECT * INTO v_result
    FROM public.validate_iom_semantic_class(NEW.intent_code, NEW.observation_code);

  IF NOT v_result.is_valid AND v_result.reason = 'semantic_class_not_in_allowlist' THEN
    NEW.is_active := false;
    INSERT INTO public.intent_observation_mapping_audit
      (iom_id, action, reason, sql_batch_id, before_payload, after_payload, performed_by)
    VALUES (
      NEW.id, 'BLOCKED_BY_TRIGGER',
      format('obs_class=%s not in allowed=%s', v_result.obs_class, v_result.allowed::text),
      'iom_validate_trigger',
      to_jsonb(OLD), to_jsonb(NEW), 'iom_validate_trigger'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS iom_validate_semantic_class ON public.intent_observation_mapping;
CREATE TRIGGER iom_validate_semantic_class
  BEFORE INSERT OR UPDATE OF intent_code, observation_code, is_active
  ON public.intent_observation_mapping
  FOR EACH ROW EXECUTE FUNCTION public.iom_validate_trigger();
