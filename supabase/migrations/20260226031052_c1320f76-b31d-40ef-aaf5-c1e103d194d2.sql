
-- FIX 3: Register NDVI observation codes in observation_master
INSERT INTO observation_master (observation_code, observation_category, canonical_group, is_active, affected_plant_part, description)
VALUES 
  ('NDVI_DECLINE', 'PHYSIOLOGY', 'abiotic_stress', true, 'WHOLE', 'Decline in NDVI values indicating vegetation stress'),
  ('NDVI_COLLAPSE', 'PHYSIOLOGY', 'abiotic_stress', true, 'WHOLE', 'Severe NDVI collapse indicating critical vegetation loss'),
  ('NDVI_STABLE', 'PHYSIOLOGY', 'abiotic_stress', true, 'WHOLE', 'Stable NDVI values indicating normal vegetation health'),
  ('NDVI_DECLINE_IN_PLANT_CROP_REQ', 'PHYSIOLOGY', 'abiotic_stress', true, 'WHOLE', 'NDVI decline detected in plant crop requiring investigation')
ON CONFLICT (observation_code) DO NOTHING;

-- FIX 3b: Register NDVI observation aliases for vocabulary bridging
INSERT INTO observation_aliases (alias_code, canonical_code)
VALUES
  ('NDVI_DECLINE_IN_PLANT_CROP_REQ', 'NDVI_DECLINE'),
  ('NDVI_DROP', 'NDVI_DECLINE'),
  ('NDVI_FALLING', 'NDVI_DECLINE'),
  ('NDVI_CRASH', 'NDVI_COLLAPSE'),
  ('NDVI_NORMAL', 'NDVI_STABLE')
ON CONFLICT (alias_code, canonical_code) DO NOTHING;
