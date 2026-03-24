
-- RETRY: VOCABULARY BRIDGE (v2) with required canonical rows pre-seeded

-- 0) observation_master: add is_active (required by spec)
ALTER TABLE public.observation_master
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 0b) Seed canonical codes referenced by explicit alias examples (FK safety)
INSERT INTO public.observation_master (observation_code, description, is_diagnostic, symptom_category, canonical_group, observation_category, affected_plant_part, is_active)
VALUES
  ('LEAF_CHEWING_DAMAGE', 'Leaf chewing damage', false, NULL, 'PEST_CHEWING', 'PEST', 'LEAF', true),
  ('WHITE_POWDERY_GROWTH', 'White powdery growth', false, NULL, 'DISEASE_FUNGAL', 'DISEASE', 'LEAF', true),
  ('LEAF_WILTING_VISIBLE', 'Leaf wilting visible', false, NULL, 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF', true),
  ('LEAF_BROWNING_VISIBLE', 'Leaf browning visible', false, NULL, 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF', true),
  ('LEAF_DRYING_VISIBLE', 'Leaf drying visible', false, NULL, 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF', true),
  ('INSECT_PRESENCE_CONFIRMED', 'Insect presence confirmed', false, NULL, 'PEST_GENERIC', 'PEST', 'WHOLE', true),
  ('STEM_BORING_MARKS', 'Stem boring marks', false, NULL, 'PEST_BORER', 'PEST', 'STEM', true),
  ('LEAF_SPOTS_PRESENT', 'Leaf spots present', false, NULL, 'PHYSIOLOGY_LEAF', 'PHYSIOLOGY', 'LEAF', true),
  ('APHID_COLONIES_ON_UNDERSIDE', 'Aphid colonies on underside', false, NULL, 'PEST_SUCKING', 'PEST', 'LEAF', true)
ON CONFLICT (observation_code) DO NOTHING;

-- 1) observation_aliases: change PK to (alias_code, canonical_code)
ALTER TABLE public.observation_aliases
  DROP CONSTRAINT IF EXISTS observation_aliases_pkey;

DO $$
BEGIN
  ALTER TABLE public.observation_aliases
    ADD CONSTRAINT observation_aliases_pkey PRIMARY KEY (alias_code, canonical_code);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- 2) Insert FULL UNION of observation codes (decision_rules + intent_observation_mapping)
WITH rule_obs AS (
  SELECT DISTINCT jsonb_array_elements_text(
    CASE 
      WHEN jsonb_typeof(conditions_json->'observations') = 'array' THEN conditions_json->'observations'
      ELSE '[]'::jsonb
    END
  ) AS observation_code
  FROM public.decision_rules
  WHERE conditions_json ? 'observations'
),
mapping_obs AS (
  SELECT DISTINCT observation_code
  FROM public.intent_observation_mapping
),
union_codes AS (
  SELECT observation_code FROM rule_obs
  UNION
  SELECT observation_code FROM mapping_obs
)
INSERT INTO public.observation_master (
  observation_code,
  description,
  is_diagnostic,
  symptom_category,
  canonical_group,
  observation_category,
  affected_plant_part,
  is_active
)
SELECT
  u.observation_code,
  initcap(replace(u.observation_code, '_', ' ')) AS description,
  false AS is_diagnostic,
  NULL AS symptom_category,
  CASE
    WHEN u.observation_code ILIKE '%NITROGEN%' THEN 'NUTRIENT_N'
    WHEN u.observation_code ILIKE '%PHOSPHORUS%' THEN 'NUTRIENT_P'
    WHEN u.observation_code ILIKE '%POTASSIUM%' THEN 'NUTRIENT_K'
    WHEN u.observation_code ILIKE '%IRON%' THEN 'NUTRIENT_FE'
    WHEN u.observation_code ILIKE '%BORON%' THEN 'NUTRIENT_B'
    WHEN u.observation_code ILIKE '%ZINC%' THEN 'NUTRIENT_ZN'
    WHEN u.observation_code ILIKE '%MANGANESE%' THEN 'NUTRIENT_MN'
    WHEN u.observation_code ILIKE '%DEFICIENCY%' THEN 'NUTRIENT_GENERAL'
    WHEN u.observation_code ILIKE '%WEED%' THEN 'WEED'
    WHEN u.observation_code ILIKE '%BORER%' OR u.observation_code ILIKE '%BORE_%' OR u.observation_code ILIKE '%BORING%' OR u.observation_code ILIKE '%FRASS%' OR u.observation_code ILIKE '%DEAD_HEART%' THEN 'PEST_BORER'
    WHEN u.observation_code ILIKE '%APHID%' OR u.observation_code ILIKE '%WHITEFLY%' OR u.observation_code ILIKE '%THRIPS%' OR u.observation_code ILIKE '%JASSID%' OR u.observation_code ILIKE '%MEALYBUG%' OR u.observation_code ILIKE '%SCALE%' OR u.observation_code ILIKE '%HONEYDEW%' OR u.observation_code ILIKE '%WOOLLY%' THEN 'PEST_SUCKING'
    WHEN u.observation_code ILIKE '%CATERPILLAR%' OR u.observation_code ILIKE '%LARVAE%' OR u.observation_code ILIKE '%CHEW%' OR u.observation_code ILIKE '%SKELETON%' OR u.observation_code ILIKE '%WEBBING%' OR u.observation_code ILIKE '%MINER%' THEN 'PEST_CHEWING'
    WHEN u.observation_code ILIKE '%MOLD%' OR u.observation_code ILIKE '%MILDEW%' OR u.observation_code ILIKE '%RUST%' OR u.observation_code ILIKE '%SMUT%' OR u.observation_code ILIKE '%BLIGHT%' OR u.observation_code ILIKE '%BLAST%' THEN 'DISEASE_FUNGAL'
    WHEN u.observation_code ILIKE '%BACTERIAL%' OR u.observation_code ILIKE '%OOZE%' OR u.observation_code ILIKE '%GUMMOSIS%' THEN 'DISEASE_BACTERIAL'
    WHEN u.observation_code ILIKE '%MOSAIC%' OR u.observation_code ILIKE '%ENATION%' OR u.observation_code ILIKE '%GRASSY%' THEN 'DISEASE_VIRAL'
    WHEN u.observation_code ILIKE '%ROT%' OR u.observation_code ILIKE '%WILT%' THEN 'DISEASE_GENERAL'
    WHEN u.observation_code ILIKE '%IRRIGATION%' OR u.observation_code ILIKE '%FERTILIZER%' OR u.observation_code ILIKE '%SCHEDULE%' OR u.observation_code ILIKE '%HARVEST%' OR u.observation_code ILIKE '%DOSAGE%' OR u.observation_code ILIKE '%QUERY%' THEN 'MANAGEMENT'
    ELSE 'UNCLASSIFIED'
  END AS canonical_group,
  CASE
    WHEN u.observation_code ILIKE '%DEFICIENCY%' OR u.observation_code ILIKE '%NITROGEN%' OR u.observation_code ILIKE '%PHOSPHORUS%' OR u.observation_code ILIKE '%POTASSIUM%' OR u.observation_code ILIKE '%IRON%' OR u.observation_code ILIKE '%BORON%' OR u.observation_code ILIKE '%ZINC%' OR u.observation_code ILIKE '%MANGANESE%' THEN 'NUTRIENT'
    WHEN u.observation_code ILIKE '%WEED%' THEN 'ABIOTIC'
    WHEN u.observation_code ILIKE '%BORER%' OR u.observation_code ILIKE '%APHID%' OR u.observation_code ILIKE '%WHITEFLY%' OR u.observation_code ILIKE '%THRIPS%' OR u.observation_code ILIKE '%JASSID%' OR u.observation_code ILIKE '%MEALYBUG%' OR u.observation_code ILIKE '%SCALE%' OR u.observation_code ILIKE '%CATERPILLAR%' OR u.observation_code ILIKE '%LARVAE%' OR u.observation_code ILIKE '%TERMITE%' OR u.observation_code ILIKE '%GRUB%' OR u.observation_code ILIKE '%INSECT%' OR u.observation_code ILIKE '%FRASS%' THEN 'PEST'
    WHEN u.observation_code ILIKE '%MOLD%' OR u.observation_code ILIKE '%MILDEW%' OR u.observation_code ILIKE '%RUST%' OR u.observation_code ILIKE '%SMUT%' OR u.observation_code ILIKE '%BLIGHT%' OR u.observation_code ILIKE '%BLAST%' OR u.observation_code ILIKE '%BACTERIAL%' OR u.observation_code ILIKE '%OOZE%' OR u.observation_code ILIKE '%MOSAIC%' OR u.observation_code ILIKE '%ROT%' OR u.observation_code ILIKE '%WILT%' THEN 'DISEASE'
    WHEN u.observation_code ILIKE '%IRRIGATION%' OR u.observation_code ILIKE '%FERTILIZER%' OR u.observation_code ILIKE '%SCHEDULE%' OR u.observation_code ILIKE '%HARVEST%' OR u.observation_code ILIKE '%DOSAGE%' OR u.observation_code ILIKE '%QUERY%' THEN 'MANAGEMENT'
    ELSE 'PHYSIOLOGY'
  END AS observation_category,
  CASE
    WHEN u.observation_code ILIKE '%SOIL%' THEN 'SOIL'
    WHEN u.observation_code ILIKE '%ROOT%' THEN 'ROOT'
    WHEN u.observation_code ILIKE '%LEAF%' THEN 'LEAF'
    WHEN u.observation_code ILIKE '%STEM%' OR u.observation_code ILIKE '%STALK%' OR u.observation_code ILIKE '%SHOOT%' OR u.observation_code ILIKE '%INTERNODE%' OR u.observation_code ILIKE '%NODE%' THEN 'STEM'
    WHEN u.observation_code ILIKE '%BOLL%' OR u.observation_code ILIKE '%FRUIT%' OR u.observation_code ILIKE '%POD%' OR u.observation_code ILIKE '%EAR%' OR u.observation_code ILIKE '%PANICLE%' THEN 'FRUIT'
    ELSE 'WHOLE'
  END AS affected_plant_part,
  true AS is_active
FROM union_codes u
ON CONFLICT (observation_code) DO NOTHING;

-- 3) Heuristic alias bridge: generic codes → specific rule codes
WITH rule_obs AS (
  SELECT DISTINCT jsonb_array_elements_text(
    CASE 
      WHEN jsonb_typeof(conditions_json->'observations') = 'array' THEN conditions_json->'observations'
      ELSE '[]'::jsonb
    END
  ) AS observation_code
  FROM public.decision_rules
  WHERE conditions_json ? 'observations'
),
intents AS (
  SELECT DISTINCT observation_code AS generic_code
  FROM public.intent_observation_mapping
)
INSERT INTO public.observation_aliases (alias_code, canonical_code)
SELECT i.generic_code, r.observation_code
FROM intents i
JOIN rule_obs r ON (
  (i.generic_code = 'LEAF_SPOTS' AND (r.observation_code ILIKE '%SPOT%' OR r.observation_code ILIKE '%LESION%' OR r.observation_code ILIKE '%RING%'))
  OR (i.generic_code = 'FUNGAL_GROWTH' AND (r.observation_code ILIKE '%MOLD%' OR r.observation_code ILIKE '%MILDEW%' OR r.observation_code ILIKE '%RUST%' OR r.observation_code ILIKE '%SMUT%' OR r.observation_code ILIKE '%BLIGHT%' OR r.observation_code ILIKE '%BLAST%' OR r.observation_code ILIKE '%FUNG%'))
  OR (i.generic_code = 'BORER_DAMAGE' AND (r.observation_code ILIKE '%BORER%' OR r.observation_code ILIKE '%BORE_%' OR r.observation_code ILIKE '%BORING%' OR r.observation_code ILIKE '%FRASS%' OR r.observation_code ILIKE '%DEAD_HEART%' OR r.observation_code ILIKE '%ENTRY_HOLES%' OR r.observation_code ILIKE '%BORED_%'))
  OR (i.generic_code = 'INSECT_EGGS' AND (r.observation_code ILIKE '%EGG%'))
  OR (i.generic_code = 'VISIBLE_INSECTS' AND (r.observation_code ILIKE '%INSECT%' OR r.observation_code ILIKE '%BUG%' OR r.observation_code ILIKE '%FLY%' OR r.observation_code ILIKE '%APHID%' OR r.observation_code ILIKE '%WHITEFLY%' OR r.observation_code ILIKE '%THRIPS%' OR r.observation_code ILIKE '%MEALYBUG%' OR r.observation_code ILIKE '%SCALE%'))
  OR (i.generic_code = 'CATERPILLAR_DAMAGE' AND (r.observation_code ILIKE '%CATERPILLAR%' OR r.observation_code ILIKE '%LARVAE%' OR r.observation_code ILIKE '%CHEW%' OR r.observation_code ILIKE '%SKELETON%' OR r.observation_code ILIKE '%WEBBING%' OR r.observation_code ILIKE '%LEAF_HOLE%'))
  OR (i.generic_code = 'LEAF_YELLOWING' AND (r.observation_code ILIKE '%YELLOW%' OR r.observation_code ILIKE '%CHLOROSIS%' OR r.observation_code ILIKE '%PALE_GREEN%'))
  OR (i.generic_code = 'LEAF_WILTING' AND (r.observation_code ILIKE '%WILT%' OR r.observation_code ILIKE '%DROOP%'))
  OR (i.generic_code = 'LEAF_DRYING' AND (r.observation_code ILIKE '%DRY%' OR r.observation_code ILIKE '%SCORCH%' OR r.observation_code ILIKE '%BURNT%'))
  OR (i.generic_code = 'LEAF_CURLING' AND (r.observation_code ILIKE '%CURL%'))
  OR (i.generic_code = 'APHID_INFESTATION' AND (r.observation_code ILIKE '%APHID%' OR r.observation_code ILIKE '%WOOLLY%'))
)
ON CONFLICT (alias_code, canonical_code) DO NOTHING;

-- 4) Ensure explicitly-requested alias rows exist (verbatim examples)
INSERT INTO public.observation_aliases (alias_code, canonical_code) VALUES
  ('BORER_DAMAGE', 'STEM_BORING_MARKS'),
  ('FUNGAL_GROWTH', 'WHITE_POWDERY_GROWTH'),
  ('LEAF_SPOTS', 'LEAF_SPOTS_PRESENT'),
  ('INSECT_EGGS', 'INSECT_PRESENCE_CONFIRMED'),
  ('CATERPILLAR_DAMAGE', 'LEAF_CHEWING_DAMAGE'),
  ('LEAF_WILTING', 'LEAF_WILTING_VISIBLE'),
  ('LEAF_BROWNING', 'LEAF_BROWNING_VISIBLE'),
  ('LEAF_DRYING', 'LEAF_DRYING_VISIBLE'),
  ('APHID_INFESTATION', 'APHID_COLONIES_ON_UNDERSIDE')
ON CONFLICT (alias_code, canonical_code) DO NOTHING;
