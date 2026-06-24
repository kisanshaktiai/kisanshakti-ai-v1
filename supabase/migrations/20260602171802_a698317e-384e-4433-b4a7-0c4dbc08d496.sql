
WITH crop AS (SELECT id FROM public.crops WHERE value='chickpea'),
cat AS (SELECT '9ecebaf1-325f-4a21-9756-7330a437a9df'::uuid AS id),
v(variety_code,name,label_hi,label_mr,company_slug,season,maturity_min,maturity_max,yield_q,released_by,parentage,regions,featured) AS (
  VALUES
  ('JG-11','Gram JG-11','चना JG-11','हरभरा JG-11','jnkvv-jabalpur','rabi',95,110,12,'JNKVV (1999)',NULL,'["MP","Maharashtra","Karnataka","AP"]'::jsonb,true),
  ('JAKI-9218','Gram JAKI-9218','चना JAKI-9218','हरभरा JAKI-9218','jnkvv-jabalpur','rabi',105,115,14,'JNKVV (2007)','Wilt resistant','["MP","Maharashtra","UP"]'::jsonb,true),
  ('Vijay','Gram Vijay (Phule G-81-1-1)','चना विजय','हरभरा विजय','mpkv-rahuri','rabi',95,105,12,'MPKV Rahuri',NULL,'["Maharashtra","Karnataka"]'::jsonb,true),
  ('Vishal','Gram Vishal','चना विशाल','हरभरा विशाल','mpkv-rahuri','rabi',110,120,13,'MPKV Rahuri','Bold seeded kabuli','["Maharashtra","Karnataka"]'::jsonb,false),
  ('BG-256','Gram BG-256','चना BG-256','हरभरा BG-256','iari-pusa','rabi',135,145,12,'IARI',NULL,'["North India"]'::jsonb,false)
)
INSERT INTO public.master_products (
  sku,name,brand,product_type,category_id,status,visibility,company_id,crop_id,variety_code,
  label_hi,label_mr,season,maturity_days_min,maturity_days_max,yield_potential_qtl_per_acre,
  released_by,parentage,recommended_regions,is_featured,ai_recommendable
)
SELECT
  'SEED-' || UPPER(REPLACE(mc.slug,'-','')) || '-' || UPPER(REPLACE(v.variety_code,'-','')),
  v.name, mc.name, 'seed', cat.id, 'active', 'global',
  mc.id, crop.id, v.variety_code,
  v.label_hi, v.label_mr, v.season,
  v.maturity_min, v.maturity_max, v.yield_q,
  v.released_by, v.parentage, v.regions, v.featured, true
FROM v
CROSS JOIN crop
CROSS JOIN cat
JOIN public.master_companies mc ON mc.slug = v.company_slug
ON CONFLICT (company_id, variety_code) WHERE product_type='seed' AND variety_code IS NOT NULL
DO NOTHING;

INSERT INTO public.master_product_variety_crops (product_id, crop_id, is_primary)
SELECT mp.id, mp.crop_id, true
FROM public.master_products mp
WHERE mp.product_type='seed' AND mp.crop_id=(SELECT id FROM public.crops WHERE value='chickpea')
ON CONFLICT (product_id, crop_id) DO NOTHING;
