
-- FIX 2: Expand NDVI rules stage_applicable to include TILLERING & GRAND_GROWTH
UPDATE decision_rules 
SET stage_applicable = array_cat(stage_applicable, ARRAY['TILLERING', 'GRAND_GROWTH'])
WHERE crop_code = 'SUGARCANE' AND is_active = true 
  AND conditions_json::text ILIKE '%ndvi%'
  AND NOT 'TILLERING' = ANY(stage_applicable)
  AND NOT 'ALL' = ANY(stage_applicable);
