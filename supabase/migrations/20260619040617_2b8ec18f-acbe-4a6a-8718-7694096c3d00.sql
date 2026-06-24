-- Phase 1.5: Agronomic remap of the 89 flagged rows

-- Step 1: Define the agronomically correct intent for each flagged observation
CREATE TEMP TABLE remap_rules (
  observation_pattern text PRIMARY KEY,
  correct_intent      text NOT NULL,
  rationale           text NOT NULL
) ON COMMIT DROP;

INSERT INTO remap_rules VALUES
  ('(frost_damage|cold_stress|cold_frost|cold_sterility|white_earhead_sterile)', 'FROST_OR_COLD_DAMAGE',     'Frost/cold tissue injury, panicle sterility from cold spell'),
  ('hail_damage',                                                                'WIND_STORM_DAMAGE',        'Hailstorm physical damage; nearest catalog intent'),
  ('(heat_stress|terminal_heat|heatwave|heat_sterility)',                        'HEATWAVE_STRESS',          'Heat-induced sterility/scorching'),
  ('(herbicide_drift|herbicide_injury)',                                         'LEAF_DAMAGE_VISIBLE',      'Visible morphological damage from herbicide drift; no dedicated herbicide intent in catalog'),
  ('ndvi_(collapse|low)',                                                        'NDVI_ALERT_QUERY',         'Remote-sensing vigour signal'),
  ('(lodging|crop_lodged_fallen)',                                               'LODGING_OR_FALLING',       'Plants fallen due to wind/excess N'),
  ('phalaris_resistance',                                                        'RESISTANCE_MANAGEMENT_QUERY','Herbicide-resistant weed biotype management'),
  ('broken_stems',                                                               'STEM_DAMAGE',              'Mechanical/wind stem breakage'),
  ('weather_disease_risk',                                                       'WEATHER_ADVISORY',         'Weather-driven disease conducive window'),
  ('forced_maturity',                                                            'DROUGHT_STRESS_SIGNAL',    'Premature maturity due to terminal moisture stress'),
  ('iron_toxicity_bronze',                                                       'NUTRIENT_TOXICITY_ALERT',  'Iron toxicity in lowland/acid soils'),
  ('salinity_stress',                                                            'SALINITY_PROBLEM',         'Salt/sodicity stress'),
  ('pod_drop',                                                                   'STAGE_SPECIFIC_PROBLEM',   'R3-R5 stress-induced pod abscission'),
  ('(flowering_initiated|fruit_set|fruit_glossy|nursery_ready|transplanted)',    'CROP_STAGE_IDENTIFICATION','Phenological stage observation'),
  ('(fruit_dull_overmature|picking_interval_overdue)',                           'HARVEST_TIMING',           'Harvest timing / over-maturity'),
  ('nutrient_check',                                                             'NUTRIENT_STRESS_SIGNAL',   'Nutrition consultation'),
  ('soil_(ec|ph)_test',                                                          'SOIL_TESTING_QUERY',       'Soil-test driven query'),
  ('(aflatoxin_risk|postharvest_fruit_rot|storage_insect)',                      'POST_HARVEST_HANDLING',    'Post-harvest storage / contamination'),
  ('(continuous_cotton)',                                                        'CROP_ROTATION_QUERY',      'Continuous mono-cropping rotation issue'),
  ('brinjal_obs_soil_dry',                                                       'IRRIGATION_QUERY',         'Soil-dry observation legitimately drives irrigation decision');

-- Step 2: Build set of rows to quarantine = flagged rows MINUS legitimate exceptions
CREATE TEMP TABLE rows_to_quarantine ON COMMIT DROP AS
SELECT iom.id, iom.intent_code, iom.crop_code, iom.growth_stage, iom.das_min, iom.das_max,
       iom.observation_code, iom.confidence_rank,
       rr.correct_intent, rr.rationale
FROM intent_observation_mapping_audit a
JOIN intent_observation_mapping iom ON iom.id = a.iom_id AND iom.is_active = true
LEFT JOIN remap_rules rr ON iom.observation_code ~ rr.observation_pattern
WHERE a.sql_batch_id = 'phase1.5-agronomic-remap-v1' -- nothing yet, no-op safety
   OR a.sql_batch_id = 'phase1-f1-flag-v2';

-- Exclude the legitimate-mapping exception: IRRIGATION_QUERY → soil_too_dry (sugarcane)
DELETE FROM rows_to_quarantine
WHERE intent_code = 'IRRIGATION_QUERY' AND observation_code = 'soil_too_dry';

-- Step 3: Quarantine + audit
INSERT INTO intent_observation_mapping_audit
  (iom_id, action, reason, before_payload, after_payload, sql_batch_id)
SELECT
  r.id,
  'QUARANTINE',
  'F1 agronomic re-review: ' || COALESCE('intent "' || r.intent_code || '" semantically incompatible with observation "' || r.observation_code || '". ' || COALESCE(r.rationale, 'no catalog intent matches; quarantined only'), 'no rule'),
  to_jsonb(r),
  jsonb_set(to_jsonb(r), '{is_active}', 'false'::jsonb),
  'phase1.5-agronomic-remap-v1'
FROM rows_to_quarantine r;

UPDATE intent_observation_mapping
SET is_active = false, updated_at = now()
WHERE id IN (SELECT id FROM rows_to_quarantine);

-- Step 4: Insert agronomically-correct mappings (idempotent)
WITH new_rows AS (
  SELECT
    gen_random_uuid()         AS id,
    r.correct_intent          AS intent_code,
    r.crop_code,
    r.growth_stage,
    r.das_min,
    r.das_max,
    r.observation_code,
    r.confidence_rank,
    true                      AS is_active
  FROM rows_to_quarantine r
  WHERE r.correct_intent IS NOT NULL
    AND EXISTS (SELECT 1 FROM observation_intent_master oim WHERE oim.intent_code = r.correct_intent)
), inserted AS (
  INSERT INTO intent_observation_mapping
    (id, intent_code, crop_code, growth_stage, das_min, das_max, observation_code, confidence_rank, is_active)
  SELECT id, intent_code, crop_code, growth_stage, das_min, das_max, observation_code, confidence_rank, is_active
  FROM new_rows
  ON CONFLICT (intent_code, crop_code, growth_stage, observation_code) DO NOTHING
  RETURNING id, intent_code, crop_code, observation_code
)
INSERT INTO intent_observation_mapping_audit
  (iom_id, action, reason, before_payload, after_payload, sql_batch_id)
SELECT
  i.id,
  'RESTORE',
  'Agronomic remap: re-inserted observation under correct intent (' || i.intent_code || ')',
  NULL,
  to_jsonb(i),
  'phase1.5-agronomic-remap-v1'
FROM inserted i;