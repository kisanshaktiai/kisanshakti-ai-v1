-- Insert missing observation codes that appear in clarification options
INSERT INTO observation_master (observation_code, description, observation_category, affected_plant_part, is_diagnostic, canonical_group, created_at) 
VALUES 
  ('SOIL_DRY', 'Soil is dry and lacks moisture', 'ABIOTIC', 'SOIL', false, 'abiotic_stress', now()),
  ('SUSTAINED_NDVI_COLLAPSE_INDICA', 'Sustained decline in vegetation index from satellite imagery', 'ABIOTIC', 'WHOLE', false, 'remote_sensing', now())
ON CONFLICT (observation_code) DO NOTHING;

-- Insert translations for SOIL_DRY
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
  ('SOIL_DRY', 'mr', 'माती कोरडी', 'शेतातील माती खूप कोरडी आहे'),
  ('SOIL_DRY', 'hi', 'मिट्टी सूखी', 'खेत की मिट्टी बहुत सूखी है'),
  ('SOIL_DRY', 'en', 'Soil Dry', 'Field soil is very dry')
ON CONFLICT (observation_code, language_code) DO NOTHING;

-- Insert translations for SUSTAINED_NDVI_COLLAPSE_INDICA
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
  ('SUSTAINED_NDVI_COLLAPSE_INDICA', 'mr', 'पिकाची हिरवळ सतत कमी', 'उपग्रह प्रतिमेत पिकाची हिरवळ सतत कमी होत आहे'),
  ('SUSTAINED_NDVI_COLLAPSE_INDICA', 'hi', 'फसल की हरियाली लगातार कम', 'उपग्रह चित्र में फसल की हरियाली लगातार कम हो रही है'),
  ('SUSTAINED_NDVI_COLLAPSE_INDICA', 'en', 'Sustained Vegetation Decline', 'Satellite imagery shows sustained decline in crop greenness')
ON CONFLICT (observation_code, language_code) DO NOTHING;