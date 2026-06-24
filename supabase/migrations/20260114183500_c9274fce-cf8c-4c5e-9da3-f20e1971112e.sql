-- P0 FIX: Convert object-shaped observable_characteristics to array format
-- This fixes the "[ExtractObs] Skipping unknown object structure" issue

-- Fix empty objects (crop identity/clarification rules)
UPDATE decision_rules 
SET observable_characteristics = '[]'::jsonb
WHERE observable_characteristics::text = '{}'
  AND canonical_group IN ('01_crop_identity', '07_clarification');

-- Fix TSB (Top Shoot Borer) - use secondary_symptoms as array
UPDATE decision_rules 
SET observable_characteristics = '["DEAD_HEART", "FRASS", "ENTRY_HOLE", "BORING_DAMAGE"]'::jsonb
WHERE rule_id = 'SUGARCANE_TSB_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix ISB IPM treatment rule
UPDATE decision_rules 
SET observable_characteristics = '["DEAD_HEART", "FRASS", "ENTRY_HOLE", "BORING_DAMAGE"]'::jsonb
WHERE rule_id = 'SUGARCANE_IPM_ISB_COTESIA_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix Cotton ABW (American Bollworm)
UPDATE decision_rules 
SET observable_characteristics = '["HOLES_IN_BOLL", "FRASS", "DAMAGED_LINT", "LARVAE_VISIBLE"]'::jsonb
WHERE rule_id = 'COTTON_ABW_DIAG_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix Cotton Spotted Bollworm  
UPDATE decision_rules 
SET observable_characteristics = '["HOLES_IN_BOLL", "FRASS", "DAMAGED_LINT", "LARVAE_VISIBLE"]'::jsonb
WHERE rule_id = 'COTTON_SPOTTED_BW_DIAG_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix Cotton Termite
UPDATE decision_rules 
SET observable_characteristics = '["MUD_TUNNELS", "WILTING", "ROOT_DAMAGE", "WHITE_ANT_VISIBLE"]'::jsonb
WHERE rule_id = 'COTTON_TERMITE_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix Sugarcane Woolly Aphid
UPDATE decision_rules 
SET observable_characteristics = '["WHITE_WOOLLY_MASS", "STUNTING", "HONEYDEW", "SOOTY_MOULD"]'::jsonb
WHERE rule_id = 'SUGARCANE_WOOLLY_APHID_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix Sugarcane Woolly Aphid IPM treatment
UPDATE decision_rules 
SET observable_characteristics = '["WHITE_WOOLLY_MASS", "STUNTING", "HONEYDEW", "SOOTY_MOULD"]'::jsonb
WHERE rule_id = 'SUGARCANE_IPM_WOOLLY_APHID_PREDATORS_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Fix Cotton PBW (Pink Bollworm)
UPDATE decision_rules 
SET observable_characteristics = '["ROSETTE_FLOWER", "HOLES_IN_BOLL", "DAMAGED_LINT", "PINK_LARVAE"]'::jsonb
WHERE rule_id = 'COTTON_PBW_DIAG_001'
  AND jsonb_typeof(observable_characteristics) = 'object';

-- Add comment for documentation
COMMENT ON COLUMN decision_rules.observable_characteristics IS 'JSONB array of canonical observation keys. MUST be array format, not object. Objects with icon/size/color metadata should use visual_markers column instead.';