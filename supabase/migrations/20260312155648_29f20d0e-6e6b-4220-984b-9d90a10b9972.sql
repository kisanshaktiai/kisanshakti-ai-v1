INSERT INTO master_products (
  company_id, category_id, sku, name, description, product_type, brand,
  active_ingredients, composition, dosage_instructions, application_method,
  suitable_crops, suitable_soil_types, 
  ai_recommendable, ai_metadata, status,
  safety_level, organic_certified,
  crop_stages, pre_harvest_interval_days
) VALUES (
  'ac1dca0f-cc09-4924-aecb-50d54f084d90',
  '4921e318-f8da-4f62-ad9c-936c877fe903',
  'FERT-MGSO4-25KG-001',
  'Magnesium Sulphate (Epsom Salt) MgSO4·7H2O',
  'Secondary nutrient fertilizer for correcting Magnesium deficiency. Essential for chlorophyll formation and enzyme activation.',
  'fertilizer',
  'Generic',
  '[{"name": "Magnesium", "percentage": 9.8, "form": "MgO"}, {"name": "Sulphur", "percentage": 13, "form": "SO3"}]'::jsonb,
  '9.8% MgO + 13% SO3',
  'Soil application: 25 kg/acre. Foliar spray: 20g per litre water, 200L spray volume per acre, 2 sprays at 15 day interval.',
  'Soil application at base or foliar spray during deficiency symptoms',
  '["SUGARCANE", "COTTON", "RICE", "WHEAT", "SOYBEAN", "MAIZE", "VEGETABLES"]'::jsonb,
  '["BLACK_SOIL", "RED_SOIL", "LATERITE", "ALLUVIAL", "SANDY_LOAM"]'::jsonb,
  true,
  '{"ipm_level": 5, "target_deficiency": "MAGNESIUM", "efficacy_rating": 0.90, "cost_per_acre": 150, "currency": "INR", "foliar_dose_g_per_l": 20, "soil_dose_kg_per_acre": 25, "spray_volume_l_per_acre": 200, "sprays_needed": 2, "spray_interval_days": 15}'::jsonb,
  'active',
  'low',
  false,
  '["TILLERING", "VEGETATIVE", "GRAND_GROWTH", "FLOWERING", "ALL"]'::jsonb,
  0
);