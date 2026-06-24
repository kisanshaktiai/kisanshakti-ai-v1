INSERT INTO public.soil_health (land_id, tenant_id, farmer_id, ph_level, organic_carbon, nitrogen_kg_per_ha, phosphorus_kg_per_ha, potassium_kg_per_ha, soil_type, source, test_date, nitrogen_level, phosphorus_level, potassium_level, confidence_level, note)
SELECT 
  l.id as land_id,
  l.tenant_id,
  l.farmer_id,
  COALESCE(l.soil_ph, 6.8) as ph_level,
  COALESCE(l.organic_carbon_percent, 0.55) as organic_carbon,
  COALESCE(l.nitrogen_kg_per_ha, 220) as nitrogen_kg_per_ha,
  COALESCE(l.phosphorus_kg_per_ha, 18) as phosphorus_kg_per_ha,
  COALESCE(l.potassium_kg_per_ha, 310) as potassium_kg_per_ha,
  COALESCE(l.soil_type, 'black') as soil_type,
  'soilgrid' as source,
  CURRENT_DATE as test_date,
  CASE 
    WHEN COALESCE(l.nitrogen_kg_per_ha, 220) < 200 THEN 'low'
    WHEN COALESCE(l.nitrogen_kg_per_ha, 220) BETWEEN 200 AND 280 THEN 'medium'
    ELSE 'high'
  END as nitrogen_level,
  CASE 
    WHEN COALESCE(l.phosphorus_kg_per_ha, 18) < 12 THEN 'low'
    WHEN COALESCE(l.phosphorus_kg_per_ha, 18) BETWEEN 12 AND 25 THEN 'medium'
    ELSE 'high'
  END as phosphorus_level,
  CASE 
    WHEN COALESCE(l.potassium_kg_per_ha, 310) < 150 THEN 'low'
    WHEN COALESCE(l.potassium_kg_per_ha, 310) BETWEEN 150 AND 300 THEN 'medium'
    ELSE 'high'
  END as potassium_level,
  CASE WHEN l.nitrogen_kg_per_ha IS NOT NULL THEN 'medium' ELSE 'low' END as confidence_level,
  CASE WHEN l.nitrogen_kg_per_ha IS NOT NULL THEN 'Migrated from lands table data' ELSE 'Kolhapur regional default (black cotton soil)' END as note
FROM public.lands l
LEFT JOIN public.soil_health sh ON sh.land_id = l.id
WHERE sh.id IS NULL;