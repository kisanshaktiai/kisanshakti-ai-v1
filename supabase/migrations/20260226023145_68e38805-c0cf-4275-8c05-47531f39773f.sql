-- Fix 3 legacy product records: set missing SKU and ipm_level
-- 1. Hilfuron 75WDG: empty SKU
UPDATE master_products 
SET sku = 'HF-WDG-75-001'
WHERE id = '84a68087-ad9b-4d3c-bf4a-2ea0230b708a' AND (sku IS NULL OR sku = '');

-- 2. Set ipm_level for all 3 legacy products that have NULL ipm_level
UPDATE master_products
SET ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || '{"ipm_level": 5}'::jsonb
WHERE id = '84a68087-ad9b-4d3c-bf4a-2ea0230b708a'
  AND (ai_metadata->>'ipm_level') IS NULL;

UPDATE master_products
SET ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || '{"ipm_level": 5}'::jsonb
WHERE id = '78054807-d460-4a3b-9538-368d967fd771'
  AND (ai_metadata->>'ipm_level') IS NULL;

UPDATE master_products
SET ai_metadata = COALESCE(ai_metadata, '{}'::jsonb) || '{"ipm_level": 5}'::jsonb
WHERE id = '96f2c4c0-5ff2-44c6-8cde-90f2f2ef9e42'
  AND (ai_metadata->>'ipm_level') IS NULL;