INSERT INTO master_products (
  company_id, category_id, sku, name, product_type, brand, 
  active_ingredients, composition,
  dosage_instructions, application_method,
  suitable_crops, pest_targets, disease_targets,
  effectiveness_rating, safety_level, organic_certified,
  ai_recommendable, ai_metadata, status,
  pre_harvest_interval_days, spray_volume_per_acre,
  translations
) VALUES (
  'a303c09e-5e71-4c13-a375-690b48fcd866',
  'd70b5834-8d01-4d5b-850d-9634e400434a',
  'CHLORPYRIFOS-20EC',
  'Chlorpyrifos 20% EC', 'pesticide', 'Dursban/Lorsban/Tafaban',
  '[{"name": "Chlorpyrifos", "percentage": 20, "formulation": "EC"}]'::jsonb,
  'Chlorpyrifos 20% EC',
  '500ml/acre in 200L water or 2.5ml/L', 'FOLIAR_SPRAY',
  '["SUGARCANE", "COTTON", "RICE", "VEGETABLES"]'::jsonb,
  '["TOP_BORER", "SHOOT_BORER", "STEM_BORER", "TERMITE", "APHID"]'::jsonb,
  '[]'::jsonb,
  4.2, 'moderate', false,
  true, '{"ipm_level": 5, "efficacy_percent": 80, "mode_of_action": "Acetylcholinesterase inhibitor", "timing": "MORNING", "weather_restrictions": "Do not spray if rain expected within 4 hours", "safety_precautions": ["Wear protective gloves and mask", "Do not contaminate water sources", "Keep away from bees"], "formulation": "EC", "brand_examples": ["Dursban 20 EC", "Lorsban 20 EC", "Tafaban 20 EC"], "price_range": "₹250-400/L"}'::jsonb,
  'active',
  21, '{"min": 200, "max": 200, "unit": "L"}'::jsonb,
  '{"mr": "क्लोरपायरीफॉस 20% EC", "hi": "क्लोरपाइरीफॉस 20% EC", "en": "Chlorpyrifos 20% EC"}'::jsonb
) ON CONFLICT DO NOTHING;