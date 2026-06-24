-- ═══════════════════════════════════════════════════════════════════════════
-- DECISION RULES DATA QUALITY FIX: SSOT Phase 1
-- Standardize crop_code formats and remove language-dependent trigger_keywords
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Normalize crop_code values to short form (SC, CTN, SOY, etc.)
UPDATE decision_rules 
SET crop_code = 'SC', 
    updated_at = NOW()
WHERE crop_code IN ('SUGARCANE', 'sugarcane', 'Sugarcane');

UPDATE decision_rules 
SET crop_code = 'CTN', 
    updated_at = NOW()
WHERE crop_code IN ('COTTON', 'cotton', 'Cotton');

UPDATE decision_rules 
SET crop_code = 'SOY', 
    updated_at = NOW()
WHERE crop_code IN ('SOYBEAN', 'soybean', 'Soybean', 'SOYA');

UPDATE decision_rules 
SET crop_code = 'WHT', 
    updated_at = NOW()
WHERE crop_code IN ('WHEAT', 'wheat', 'Wheat');

UPDATE decision_rules 
SET crop_code = 'MZ', 
    updated_at = NOW()
WHERE crop_code IN ('MAIZE', 'maize', 'Maize', 'CORN', 'corn');

UPDATE decision_rules 
SET crop_code = 'RICE', 
    updated_at = NOW()
WHERE crop_code IN ('rice', 'Rice', 'PADDY', 'paddy');

UPDATE decision_rules 
SET crop_code = 'TUR', 
    updated_at = NOW()
WHERE crop_code IN ('TUR_DAL', 'tur', 'Tur', 'PIGEON_PEA');

UPDATE decision_rules 
SET crop_code = 'GRM', 
    updated_at = NOW()
WHERE crop_code IN ('GRAM', 'gram', 'Gram', 'CHICKPEA', 'chickpea');

UPDATE decision_rules 
SET crop_code = 'ALL', 
    updated_at = NOW()
WHERE crop_code IN ('all', 'All', 'GENERAL', 'general');

-- 2. Normalize stage_applicable to uppercase array format
UPDATE decision_rules
SET stage_applicable = ARRAY(
  SELECT UPPER(elem) 
  FROM unnest(stage_applicable) AS elem
)
WHERE stage_applicable IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(stage_applicable) AS elem 
    WHERE elem != UPPER(elem)
  );

-- 3. Remove trigger_keywords from conditions_json (language-dependent)
-- This is CRITICAL for SSOT compliance
UPDATE decision_rules 
SET conditions_json = conditions_json - 'trigger_keywords',
    updated_at = NOW()
WHERE conditions_json ? 'trigger_keywords';

-- 4. Add index for faster crop_code lookups if not exists
CREATE INDEX IF NOT EXISTS idx_decision_rules_crop_code ON decision_rules(crop_code);

-- 5. Add index for faster canonical_group lookups if not exists
CREATE INDEX IF NOT EXISTS idx_decision_rules_canonical_group ON decision_rules(canonical_group);

-- Log the changes
DO $$
DECLARE
  sc_count INTEGER;
  ctn_count INTEGER;
  trigger_removed INTEGER;
BEGIN
  SELECT COUNT(*) INTO sc_count FROM decision_rules WHERE crop_code = 'SC';
  SELECT COUNT(*) INTO ctn_count FROM decision_rules WHERE crop_code = 'CTN';
  SELECT COUNT(*) INTO trigger_removed FROM decision_rules WHERE NOT (conditions_json ? 'trigger_keywords');
  
  RAISE NOTICE 'SSOT Migration Complete: SC=%, CTN=%, rules without trigger_keywords=%', 
    sc_count, ctn_count, trigger_removed;
END $$;