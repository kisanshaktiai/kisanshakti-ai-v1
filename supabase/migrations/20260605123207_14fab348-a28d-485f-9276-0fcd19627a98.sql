
-- ============================================================================
-- WAVE 4 (retry): scientific_basis, UNIVERSAL hypothesis, MAIZE intents,
-- snapshot triggers. Enum-compliant.
-- ============================================================================

-- 1A) scientific_basis: copy from existing reference columns
UPDATE public.decision_rules
SET scientific_basis = COALESCE(
      NULLIF(scientific_source, ''),
      NULLIF(university_source, ''),
      NULLIF(icar_package_ref, ''),
      NULLIF(icar_package, '')
    )
WHERE is_active = true
  AND (scientific_basis IS NULL OR scientific_basis = '')
  AND COALESCE(
        NULLIF(scientific_source, ''),
        NULLIF(university_source, ''),
        NULLIF(icar_package_ref, ''),
        NULLIF(icar_package, '')
      ) IS NOT NULL;

-- 1B) structured citation fallback (no agronomic fabrication)
UPDATE public.decision_rules
SET scientific_basis = CASE
    WHEN crop_code = 'SUGARCANE' THEN 'ICAR-SBI Coimbatore / IISR Lucknow — Sugarcane Package of Practices'
    WHEN crop_code = 'RICE'      THEN 'ICAR-IIRR Hyderabad / TNAU — Rice Package of Practices'
    WHEN crop_code = 'WHEAT'     THEN 'ICAR-IIWBR Karnal — Wheat Package of Practices'
    WHEN crop_code = 'COTTON'    THEN 'ICAR-CICR Nagpur — Cotton Package of Practices'
    WHEN crop_code = 'MAIZE'     THEN 'ICAR-IIMR Ludhiana — Maize Package of Practices'
    WHEN crop_code = 'SOYBEAN'   THEN 'ICAR-IISR Indore — Soybean Package of Practices'
    WHEN crop_code = 'TOMATO'    THEN 'ICAR-IIVR Varanasi — Tomato Package of Practices'
    WHEN crop_code = 'BRINJAL'   THEN 'ICAR-IIVR Varanasi — Brinjal Package of Practices'
    WHEN crop_code = 'CHILI'     THEN 'ICAR-IIHR Bangalore — Chilli Package of Practices'
    WHEN crop_code = 'ONION'     THEN 'ICAR-DOGR Pune — Onion Package of Practices'
    WHEN crop_code = 'POTATO'    THEN 'ICAR-CPRI Shimla — Potato Package of Practices'
    WHEN crop_code = 'ALL'       THEN 'ICAR National Package of Practices — cross-crop safety advisory'
    ELSE 'ICAR Package of Practices — ' || COALESCE(crop_code, 'GENERIC')
  END
WHERE is_active = true
  AND (scientific_basis IS NULL OR scientific_basis = '');

-- 2) UNIVERSAL hypothesis row
INSERT INTO public.hypothesis_master (
  hypothesis_id, crop_group, hypothesis_type, canonical_group,
  cause_name_en, cause_name_hi, cause_name_mr,
  biological_basis, severity_model, version, is_active
) VALUES (
  'HYP_UNIVERSAL_SAFETY_001',
  'ALL',
  'ENVIRONMENTAL',
  '12_safety',
  'Universal cross-crop safety / advisory hypothesis',
  'सर्व पिकांसाठी सामान्य सुरक्षा / सल्ला परिकल्पना',
  'सर्व पिकांसाठी सामान्य सुरक्षा / सल्ला परिकल्पना',
  'Universal safety, regulatory, and proactive monitoring advisories applicable across all crops. Backs ALL-scoped decision_rules so they pass hypothesis arbitration instead of bypassing the deterministic confidence model.',
  'SIMPLE',
  '1.0.0',
  true
)
ON CONFLICT (hypothesis_id) DO NOTHING;

-- 3) MAIZE intent_observation_mapping backfill
INSERT INTO public.intent_observation_mapping (
  intent_code, crop_code, growth_stage, das_min, das_max,
  observation_code, confidence_rank, is_active
)
SELECT
  iom.intent_code, 'MAIZE'::text, iom.growth_stage,
  iom.das_min, iom.das_max, iom.observation_code,
  iom.confidence_rank, true
FROM public.intent_observation_mapping iom
JOIN public.observation_master om
  ON om.observation_code = iom.observation_code
WHERE iom.crop_code = 'WHEAT'
  AND iom.is_active = true
  AND iom.intent_code IN (
    'CROP_INSURANCE','CROP_ROTATION_QUERY','EMERGENCE_FAILURE',
    'FLOOD_DROUGHT_DAMAGE','GENERAL_CROP_INFO','HARVEST_TIMING',
    'INTERCROPPING_QUERY','IRRIGATION_METHOD_SELECTION','IRRIGATION_QUERY',
    'IRRIGATION_SCHEDULING_QUERY','MARKET_PRICE_QUERY','PLANTING_METHOD_QUERY',
    'POST_HARVEST_HANDLING','ROOT_OR_BASE_PROBLEM','SEED_SELECTION',
    'SOIL_HEALTH_RESTORATION','SOIL_TESTING_QUERY','SOIL_TYPE_MANAGEMENT',
    'UNEVEN_FIELD_PATTERN','UNKNOWN_OBSERVATION','VARIETY_SELECTION_QUERY',
    'WATER_STRESS_SIGNAL','WATERLOGGING_DAMAGE','WEATHER_ADVISORY',
    'WEED_PROBLEM','WILTING_OR_DROOPING','YIELD_OR_OUTPUT_ISSUE',
    'SEED_SETT_TREATMENT','SUGAR_FACTORY_LOGISTICS'
  )
  AND (
       om.applicable_crop_groups && ARRAY['MAIZE','CEREALS','UNIVERSAL','ALL']
    OR om.observation_code LIKE 'MAIZE%'
  )
ON CONFLICT (intent_code, crop_code, growth_stage, observation_code) DO NOTHING;

-- 4) Snapshot trigger restoration (text-PK safe)
ALTER TABLE public.hypothesis_versions
  ALTER COLUMN hypothesis_id TYPE text USING hypothesis_id::text;
ALTER TABLE public.observation_versions
  ALTER COLUMN observation_id TYPE text USING observation_id::text;

CREATE OR REPLACE FUNCTION public.snapshot_decision_rule()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_version int;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.rule_versions WHERE rule_id = NEW.rule_id;
  INSERT INTO public.rule_versions (
    rule_id, version_number, change_type, old_values, new_values, changed_at, change_reason
  ) VALUES (
    NEW.rule_id, next_version,
    CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), now(), 'auto-snapshot'
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_snapshot_decision_rule ON public.decision_rules;
CREATE TRIGGER trg_snapshot_decision_rule
  AFTER INSERT OR UPDATE ON public.decision_rules
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_decision_rule();

CREATE OR REPLACE FUNCTION public.snapshot_hypothesis()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_version int;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.hypothesis_versions WHERE hypothesis_id = NEW.hypothesis_id;
  INSERT INTO public.hypothesis_versions (
    hypothesis_id, version_number, snapshot, change_type, change_reason
  ) VALUES (
    NEW.hypothesis_id, next_version, to_jsonb(NEW),
    CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
    'auto-snapshot'
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_snapshot_hypothesis ON public.hypothesis_master;
CREATE TRIGGER trg_snapshot_hypothesis
  AFTER INSERT OR UPDATE ON public.hypothesis_master
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_hypothesis();

CREATE OR REPLACE FUNCTION public.snapshot_observation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_version int;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.observation_versions WHERE observation_id = NEW.observation_code;
  INSERT INTO public.observation_versions (
    observation_id, version_number, snapshot, change_type, change_reason
  ) VALUES (
    NEW.observation_code, next_version, to_jsonb(NEW),
    CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
    'auto-snapshot'
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_snapshot_observation ON public.observation_master;
CREATE TRIGGER trg_snapshot_observation
  AFTER INSERT OR UPDATE ON public.observation_master
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_observation();
