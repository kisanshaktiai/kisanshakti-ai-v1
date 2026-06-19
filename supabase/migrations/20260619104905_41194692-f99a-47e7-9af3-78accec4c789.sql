-- ═══════════════════════════════════════════════════════════════════════
-- Phase A1+A2+A4: Rice clarification pipeline data integrity
-- ═══════════════════════════════════════════════════════════════════════

-- A1. Normalize hypothesis_conditions.condition_key to lowercase
--     for condition_type='OBSERVATION' across all crops.
--     observation_master uses lowercase codes; UPPERCASE keys silently
--     fail set-membership checks in the symbolic brain and zero out
--     hypothesis scores → no clarification card surfaced.
UPDATE public.hypothesis_conditions
SET    condition_key = lower(condition_key)
WHERE  condition_type = 'OBSERVATION'
  AND  condition_key <> lower(condition_key);

-- A4. Preserve historical UPPERCASE keys as aliases so any external
--     caller (older clients, ad-hoc tests) still resolves to canonical
--     lowercase observation codes.
INSERT INTO public.observation_aliases (alias_code, canonical_code)
SELECT DISTINCT upper(om.observation_code), om.observation_code
FROM   public.observation_master om
WHERE  om.observation_code <> upper(om.observation_code)
  AND  NOT EXISTS (
    SELECT 1 FROM public.observation_aliases oa
    WHERE  oa.alias_code = upper(om.observation_code)
  );

-- A1 invariant: prevent future regression. OBSERVATION condition_keys
--     MUST be lowercase to match observation_master codes.
ALTER TABLE public.hypothesis_conditions
  DROP CONSTRAINT IF EXISTS hypothesis_conditions_observation_key_lowercase_chk;

ALTER TABLE public.hypothesis_conditions
  ADD CONSTRAINT hypothesis_conditions_observation_key_lowercase_chk
  CHECK (condition_type <> 'OBSERVATION' OR condition_key = lower(condition_key));

-- A2. Tag observation_master rows that the rice intent_observation_mapping
--     actually references, so the crop-scope pre-filter stops dropping
--     valid rice symptoms (was only 5 rows; needs ~70).
UPDATE public.observation_master om
SET    crop_group = 'rice',
       applicable_crop_groups = CASE
         WHEN applicable_crop_groups IS NULL THEN ARRAY['rice']
         WHEN NOT ('rice' = ANY(applicable_crop_groups)) THEN array_append(applicable_crop_groups, 'rice')
         ELSE applicable_crop_groups
       END
WHERE  om.observation_code IN (
         SELECT DISTINCT iom.observation_code
         FROM   public.intent_observation_mapping iom
         WHERE  iom.crop_code = 'rice' AND iom.is_active
       )
  AND  (om.crop_group IS NULL OR om.crop_group = '' OR om.crop_group = 'rice');

-- Where another crop already owns crop_group, only extend applicable_crop_groups.
UPDATE public.observation_master om
SET    applicable_crop_groups = CASE
         WHEN applicable_crop_groups IS NULL THEN ARRAY['rice']
         WHEN NOT ('rice' = ANY(applicable_crop_groups)) THEN array_append(applicable_crop_groups, 'rice')
         ELSE applicable_crop_groups
       END
WHERE  om.observation_code IN (
         SELECT DISTINCT iom.observation_code
         FROM   public.intent_observation_mapping iom
         WHERE  iom.crop_code = 'rice' AND iom.is_active
       )
  AND  om.crop_group IS NOT NULL
  AND  om.crop_group <> ''
  AND  om.crop_group <> 'rice'
  AND  (om.applicable_crop_groups IS NULL OR NOT ('rice' = ANY(om.applicable_crop_groups)));
