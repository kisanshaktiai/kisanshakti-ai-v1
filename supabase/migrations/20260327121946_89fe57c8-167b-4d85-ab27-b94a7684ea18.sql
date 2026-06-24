
-- Step 1: Remove duplicate rows, keeping the one with lowest confidence_rank (best)
DELETE FROM intent_observation_mapping a
USING intent_observation_mapping b
WHERE a.id > b.id
  AND a.intent_code = b.intent_code
  AND a.crop_code = b.crop_code
  AND a.observation_code = b.observation_code;

-- Step 2: Add unique constraint
ALTER TABLE intent_observation_mapping 
ADD CONSTRAINT uq_intent_crop_obs UNIQUE (intent_code, crop_code, observation_code);
