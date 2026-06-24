
-- Retry: insert remaining products using only allowed master_products.product_type values
WITH company AS (
  SELECT id AS company_id FROM public.master_companies WHERE slug = 'icar-recommended'
),
rows(
  sku,
  name,
  product_type,
  category_slug,
  brand,
  active_ingredients,
  dosage_instructions,
  application_method,
  pest_targets,
  disease_targets,
  suitable_crops,
  pre_harvest_interval_days,
  spray_volume_per_acre,
  organic_certified,
  safety_level,
  effectiveness_rating,
  ai_metadata,
  translations
) AS (
  VALUES
  -- Neonicotinoids
  (
    'IMIDACLOPRID-17.8SL','Imidacloprid 17.8% SL','pesticide','insecticides','Confidor/Tatamida/Imida',
    '[{"name":"Imidacloprid","percentage":17.8,"formulation":"SL"}]'::jsonb,
    '0.5 ml/L or 100-125 ml/acre in 200-250 L water','FOLIAR_SPRAY',
    '["WHITEFLY","APHID","JASSID","THRIPS","PLANTHOPPER","BPH","TERMITE"]'::jsonb,'[]'::jsonb,
    '["COTTON","RICE","SUGARCANE","VEGETABLES","CHILLI","TOMATO"]'::jsonb,
    15,'{"min":200,"max":250,"unit":"L"}'::jsonb,false,'moderate',4.3,
    '{"ipm_level":5,"efficacy_percent":85,"mode_of_action":"Nicotinic acetylcholine receptor agonist - systemic action","timing":"Morning 7-10 AM (avoid flowering period for bee safety)","repeat_interval_days":21,"max_applications":2,"nozzle_type":"Flat fan or hollow cone","weather_restrictions":"No rain within 6 hours. Avoid during flowering.","safety_precautions":["Toxic to bees - spray after bee hours","PPE mandatory"],"price_range":"₹180-250/100ml","formulation":"17.8% SL","brand_examples":["Confidor","Tatamida","Imida"]}'::jsonb,
    '{"mr":"इमिडाक्लोप्रिड (कॉन्फिडॉर/टाटामिडा)","hi":"इमिडाक्लोप्रिड (कॉन्फिडोर/टाटामिडा)","en":"Imidacloprid 17.8% SL (Confidor)"}'::jsonb
  ),
  (
    'THIAMETHOXAM-25WG','Thiamethoxam 25% WG','pesticide','insecticides','Actara/Thimet/Maxima',
    '[{"name":"Thiamethoxam","percentage":25,"formulation":"WG"}]'::jsonb,
    '0.2 g/L or 40 g/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","APHID","JASSID","THRIPS","BROWN_PLANTHOPPER","MEALYBUG"]'::jsonb,'[]'::jsonb,
    '["RICE","COTTON","SUGARCANE","VEGETABLES","CHILLI"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.3,
    '{"ipm_level":5,"efficacy_percent":85,"mode_of_action":"Systemic neonicotinoid","timing":"Morning hours, avoid bee activity","repeat_interval_days":21,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 6 hours, avoid flowering stage","safety_precautions":["Bee toxic - spray after 6 PM or before 7 AM"],"price_range":"₹220-300/50g","formulation":"25% WG","brand_examples":["Actara","Thimet","Maxima"]}'::jsonb,
    '{"mr":"थायमेथोक्झाम (अक्टारा/मॅक्सिमा)","hi":"थायामेथोक्साम (एक्टारा/मैक्सिमा)","en":"Thiamethoxam 25% WG (Actara)"}'::jsonb
  ),
  (
    'ACETAMIPRID-20SP','Acetamiprid 20% SP','pesticide','insecticides','Pride/Rekord/Manik',
    '[{"name":"Acetamiprid","percentage":20,"formulation":"SP"}]'::jsonb,
    '0.2 g/L or 40 g/acre in 200 L water','FOLIAR_SPRAY',
    '["APHID","JASSID","WHITEFLY","THRIPS"]'::jsonb,'[]'::jsonb,
    '["COTTON","VEGETABLES","CHILLI","TOMATO","OKRA"]'::jsonb,
    7,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.0,
    '{"ipm_level":5,"efficacy_percent":80,"mode_of_action":"Neonicotinoid - safer for bees than others","timing":"Early morning or evening","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Relatively bee-safe neonicotinoid","PPE required"],"price_range":"₹180-220/50g","formulation":"20% SP","brand_examples":["Pride","Rekord","Manik"]}'::jsonb,
    '{"mr":"अॅसिटामिप्रिड (प्राइड/रेकॉर्ड)","hi":"एसिटामिप्रिड (प्राइड/रिकॉर्ड)","en":"Acetamiprid 20% SP (Pride)"}'::jsonb
  ),

  -- Phenylpyrazoles
  (
    'FIPRONIL-5SC','Fipronil 5% SC','pesticide','insecticides','Regent/Syngenta Fipronil/Jump',
    '[{"name":"Fipronil","percentage":5,"formulation":"SC"}]'::jsonb,
    '2 ml/L (foliar) or 30 ml/10L (soil drench); 400 ml/acre foliar or 1.5 L/acre soil','SOIL_DRENCH',
    '["SHOOT_BORER","STEM_BORER","TERMITE","WHITE_GRUB","ROOT_BORER"]'::jsonb,'[]'::jsonb,
    '["SUGARCANE","RICE","MAIZE","COTTON"]'::jsonb,
    30,'{"min":200,"max":500,"unit":"L"}'::jsonb,false,'high',4.3,
    '{"ipm_level":5,"efficacy_percent":85,"mode_of_action":"GABA receptor blocker - systemic and contact action","timing":"At planting or first sign of damage","repeat_interval_days":30,"max_applications":1,"nozzle_type":"Drenching lance for soil","target_stage":"Soil dwelling larvae","weather_restrictions":"Apply when soil is moist","safety_precautions":["Do not apply near water bodies","Toxic to aquatic organisms"],"price_range":"₹350-450/250ml","formulation":"5% SC","brand_examples":["Regent","Syngenta Fipronil","Jump"]}'::jsonb,
    '{"mr":"फिप्रोनिल (रीजंट/जंप)","hi":"फिप्रोनिल (रीजेंट/जंप)","en":"Fipronil 5% SC (Regent)"}'::jsonb
  ),

  -- Spinosyns
  (
    'SPINOSAD-45SC','Spinosad 45% SC','pesticide','insecticides','Tracer/Success/Entrust',
    '[{"name":"Spinosad","percentage":45,"formulation":"SC"}]'::jsonb,
    '0.3 ml/L or 75 ml/acre in 250 L water','FOLIAR_SPRAY',
    '["FRUIT_BORER","THRIPS","LEAF_MINER","CATERPILLARS"]'::jsonb,'[]'::jsonb,
    '["VEGETABLES","COTTON","TOMATO","CHILLI","GRAPES"]'::jsonb,
    3,'{"min":250,"max":250,"unit":"L"}'::jsonb,true,'low',4.1,
    '{"ipm_level":4,"efficacy_percent":82,"mode_of_action":"Derived from Saccharopolyspora spinosa - nerve action","timing":"Evening 4-7 PM (bee-safe after drying)","repeat_interval_days":10,"max_applications":3,"nozzle_type":"Hollow cone","weather_restrictions":"Safe for bees after 3 hours of drying","safety_precautions":["Organic approved","Safe for beneficial insects after drying"],"price_range":"₹1200-1500/100ml","formulation":"45% SC","brand_examples":["Tracer","Success","Entrust"]}'::jsonb,
    '{"mr":"स्पिनोसॅड (ट्रेसर/सक्सेस) - सेंद्रिय मान्य","hi":"स्पिनोसैड (ट्रेसर/सक्सेस) - जैविक स्वीकृत","en":"Spinosad 45% SC (Tracer) - Organic approved"}'::jsonb
  ),
  (
    'EMAMECTIN-5SG','Emamectin benzoate 5% SG','pesticide','insecticides','Proclaim/Em1/Missile',
    '[{"name":"Emamectin benzoate","percentage":5,"formulation":"SG"}]'::jsonb,
    '0.4 g/L or 80 g/acre in 200 L water','FOLIAR_SPRAY',
    '["FRUIT_BORER","BOLLWORM","HELICOVERPA","DIAMONDBACK_MOTH","CATERPILLARS"]'::jsonb,'[]'::jsonb,
    '["VEGETABLES","COTTON","TOMATO","CHILLI","CABBAGE","CAULIFLOWER"]'::jsonb,
    7,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.4,
    '{"ipm_level":5,"efficacy_percent":88,"mode_of_action":"Avermectin - GABA receptor agonist","timing":"Early morning or late evening","repeat_interval_days":10,"max_applications":2,"nozzle_type":"Hollow cone for thorough coverage","weather_restrictions":"No rain within 4 hours","safety_precautions":["Very effective on caterpillars","Short PHI"],"price_range":"₹400-500/100g","formulation":"5% SG","brand_examples":["Proclaim","Em1","Missile"]}'::jsonb,
    '{"mr":"एमामेक्टिन बेंझोएट (प्रोक्लेम/मिसाइल)","hi":"एमामेक्टिन बेंजोएट (प्रोक्लेम/मिसाइल)","en":"Emamectin benzoate 5% SG (Proclaim)"}'::jsonb
  ),

  -- Lipid inhibitors
  (
    'DIAFENTHIURON-50WP','Diafenthiuron 50% WP','pesticide','insecticides','Pegasus/Polo',
    '[{"name":"Diafenthiuron","percentage":50,"formulation":"WP"}]'::jsonb,
    '1.2 g/L or 250 g/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","MITES","JASSID","THRIPS"]'::jsonb,'[]'::jsonb,
    '["COTTON","VEGETABLES","CHILLI","TOMATO"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.3,
    '{"ipm_level":5,"efficacy_percent":85,"mode_of_action":"Mitochondrial ATP synthase inhibitor","timing":"Early morning, avoid high temperature","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone with fine droplets","weather_restrictions":"Avoid spraying above 35°C","safety_precautions":["Effective against whitefly resistance","Temperature sensitive"],"price_range":"₹350-450/100g","formulation":"50% WP","brand_examples":["Pegasus","Polo"]}'::jsonb,
    '{"mr":"डायफेंथियुरॉन (पेगॅसस/पोलो)","hi":"डायफेंथियूरॉन (पेगासस/पोलो)","en":"Diafenthiuron 50% WP (Pegasus)"}'::jsonb
  ),
  (
    'SPIROMESIFEN-22.9SC','Spiromesifen 22.9% SC','pesticide','insecticides','Oberon/Spider',
    '[{"name":"Spiromesifen","percentage":22.9,"formulation":"SC"}]'::jsonb,
    '0.8 ml/L or 160 ml/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","MITES","RED_SPIDER_MITE"]'::jsonb,'[]'::jsonb,
    '["COTTON","VEGETABLES","CHILLI","TOMATO","BRINJAL"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.4,
    '{"ipm_level":5,"efficacy_percent":88,"mode_of_action":"Lipid biosynthesis inhibitor - effective against resistant whitefly","timing":"Morning before 10 AM","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone for underleaf coverage","weather_restrictions":"No rain within 4 hours","safety_precautions":["Excellent for resistant whitefly populations"],"price_range":"₹550-700/100ml","formulation":"22.9% SC","brand_examples":["Oberon","Spider"]}'::jsonb,
    '{"mr":"स्पायरोमेसिफेन (ओबेरॉन/स्पायडर)","hi":"स्पाइरोमेसिफेन (ओबेरॉन/स्पाइडर)","en":"Spiromesifen 22.9% SC (Oberon)"}'::jsonb
  ),

  -- IGRs
  (
    'PYRIPROXYFEN-10EC','Pyriproxyfen 10% EC','pesticide','insecticides','Sumilarv/Lanos/Pyripro',
    '[{"name":"Pyriproxyfen","percentage":10,"formulation":"EC"}]'::jsonb,
    '1 ml/L or 200 ml/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","SCALE_INSECTS","MEALYBUG"]'::jsonb,'[]'::jsonb,
    '["COTTON","VEGETABLES","CITRUS","MANGO"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',3.9,
    '{"ipm_level":4,"efficacy_percent":78,"mode_of_action":"Juvenile hormone analog - prevents adult emergence","timing":"When nymphs present","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 6 hours","safety_precautions":["Target immature stages only","Slow acting but effective"],"price_range":"₹280-350/100ml","formulation":"10% EC","brand_examples":["Sumilarv","Lanos","Pyripro"]}'::jsonb,
    '{"mr":"पायरीप्रॉक्सिफेन (सुमिलार्व/लानोस)","hi":"पाइरीप्रॉक्सीफेन (सुमिलार्व/लानोस)","en":"Pyriproxyfen 10% EC (Sumilarv)"}'::jsonb
  ),
  (
    'BUPROFEZIN-25SC','Buprofezin 25% SC','pesticide','insecticides','Applaud/Bupro',
    '[{"name":"Buprofezin","percentage":25,"formulation":"SC"}]'::jsonb,
    '2 ml/L or 400 ml/acre in 200 L water','FOLIAR_SPRAY',
    '["BROWN_PLANTHOPPER","BPH","WHITEFLY","SCALE_INSECTS","MEALYBUG"]'::jsonb,'[]'::jsonb,
    '["RICE","COTTON","VEGETABLES"]'::jsonb,
    21,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.1,
    '{"ipm_level":4,"efficacy_percent":82,"mode_of_action":"Chitin synthesis inhibitor","timing":"When nymphs active","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Does not cause BPH resurgence","Selective action"],"price_range":"₹350-450/250ml","formulation":"25% SC","brand_examples":["Applaud","Bupro"]}'::jsonb,
    '{"mr":"बुप्रोफेझिन (अॅप्लॉड/बुप्रो)","hi":"बुप्रोफेज़िन (एप्लॉड/बुप्रो)","en":"Buprofezin 25% SC (Applaud)"}'::jsonb
  ),

  -- Pyrethroids
  (
    'LAMBDA-CYHALOTHRIN-5EC','Lambda cyhalothrin 5% EC','pesticide','insecticides','Karate/Reeva/Kung Fu',
    '[{"name":"Lambda cyhalothrin","percentage":5,"formulation":"EC"}]'::jsonb,
    '0.6 ml/L or 120 ml/acre in 200 L water','FOLIAR_SPRAY',
    '["BOLLWORM","FRUIT_BORER","APHID","JASSID","CATERPILLARS"]'::jsonb,'[]'::jsonb,
    '["COTTON","VEGETABLES","RICE","MAIZE"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'high',4.0,
    '{"ipm_level":6,"efficacy_percent":80,"mode_of_action":"Sodium channel modulator - fast knockdown","timing":"Evening for better efficacy","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Can cause pest resurgence","Toxic to beneficials","Use as last resort"],"price_range":"₹220-300/250ml","formulation":"5% EC","brand_examples":["Karate","Reeva","Kung Fu"]}'::jsonb,
    '{"mr":"लॅम्बडा सायहॅलोथ्रिन (कराटे/रीवा)","hi":"लैम्बडा साइहैलोथ्रिन (कराटे/रीवा)","en":"Lambda cyhalothrin 5% EC (Karate)"}'::jsonb
  ),
  (
    'CYPERMETHRIN-25EC','Cypermethrin 25% EC','pesticide','insecticides','Cyper/Ustaad/Ripcord',
    '[{"name":"Cypermethrin","percentage":25,"formulation":"EC"}]'::jsonb,
    '0.5 ml/L or 100 ml/acre in 200 L water','FOLIAR_SPRAY',
    '["BOLLWORM","FRUIT_BORER","STEM_BORER","CATERPILLARS"]'::jsonb,'[]'::jsonb,
    '["COTTON","VEGETABLES","PULSES"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'high',3.8,
    '{"ipm_level":6,"efficacy_percent":75,"mode_of_action":"Synthetic pyrethroid - contact and stomach action","timing":"Evening hours","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"Avoid in hot weather (>35°C)","safety_precautions":["Resistance common","Use in rotation","Toxic to aquatic life"],"price_range":"₹180-250/250ml","formulation":"25% EC","brand_examples":["Cyper","Ustaad","Ripcord"]}'::jsonb,
    '{"mr":"सायपरमेथ्रिन (सायपर/उस्ताद)","hi":"साइपरमेथ्रिन (साइपर/उस्ताद)","en":"Cypermethrin 25% EC (Ustaad)"}'::jsonb
  ),

  -- Botanicals (product_type must be pesticide per DB check constraint)
  (
    'NEEM-OIL-10000PPM','Neem oil 10000 ppm','pesticide','botanical','Nimbecidine/Econeem/Neem Baan',
    '[{"name":"Azadirachtin","percentage":0.1,"formulation":"10000 ppm"}]'::jsonb,
    '5 ml/L or 1 L/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","APHID","THRIPS","CATERPILLARS","MITES","JASSID"]'::jsonb,'[]'::jsonb,
    '["ALL_CROPS"]'::jsonb,
    1,'{"min":200,"max":200,"unit":"L"}'::jsonb,true,'low',3.3,
    '{"ipm_level":3,"efficacy_percent":65,"mode_of_action":"Antifeedant, IGR, repellent - multiple modes","timing":"Evening 4-7 PM for best results","repeat_interval_days":7,"max_applications":6,"nozzle_type":"Hollow cone with agitation","weather_restrictions":"No rain within 4 hours, avoid hot sun","safety_precautions":["Organic approved","Safe for beneficials","Shake well before use"],"price_range":"₹350-500/L","formulation":"10000 ppm (1% Azadirachtin)","brand_examples":["Nimbecidine","Econeem","Neem Baan"]}'::jsonb,
    '{"mr":"कडुनिंबाचे तेल (निंबेसिडीन/इकोनीम) - सेंद्रिय","hi":"नीम तेल (निंबेसिडीन/इकोनीम) - जैविक","en":"Neem oil 10000 ppm (Nimbecidine) - Organic"}'::jsonb
  ),
  (
    'NSKE-5PCT','NSKE 5%','pesticide','botanical','Homemade/NeemPlus',
    '[{"name":"Azadirachtin + limonoids","percentage":5,"formulation":"Extract"}]'::jsonb,
    '50 g crushed neem seed in 1 L water; 2 kg neem seed kernel/acre in 200 L water','FOLIAR_SPRAY',
    '["CATERPILLARS","APHID","WHITEFLY","LEAF_MINER"]'::jsonb,'[]'::jsonb,
    '["ALL_CROPS"]'::jsonb,
    0,'{"min":200,"max":200,"unit":"L"}'::jsonb,true,'low',3.0,
    '{"ipm_level":3,"efficacy_percent":60,"mode_of_action":"Antifeedant and IGR","timing":"Evening application","repeat_interval_days":7,"max_applications":8,"nozzle_type":"Hollow cone with filter","weather_restrictions":"Prepare fresh, use within 24 hours","safety_precautions":["Filter before use","Completely organic"],"price_range":"₹40-60/kg kernel","formulation":"5% Neem Seed Kernel Extract","brand_examples":["Homemade","NeemPlus"]}'::jsonb,
    '{"mr":"निंबोळी अर्क (NSKE) - घरी बनवता येतो","hi":"नीम बीज अर्क (NSKE) - घर पर बनाएं","en":"NSKE 5% (Neem Seed Kernel Extract) - Homemade organic"}'::jsonb
  ),
  (
    'PONGAMIA-OIL-2PCT','Pongamia oil 2%','pesticide','botanical','Karanj oil/Pongam',
    '[{"name":"Karanjin + Pongamol","percentage":2,"formulation":"Oil emulsion"}]'::jsonb,
    '20 ml/L or 4 L/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","APHID","MITES","SCALE"]'::jsonb,'[]'::jsonb,
    '["ALL_CROPS"]'::jsonb,
    1,'{"min":200,"max":200,"unit":"L"}'::jsonb,true,'low',2.8,
    '{"ipm_level":3,"efficacy_percent":55,"mode_of_action":"Antifeedant and contact poison","timing":"Evening hours","repeat_interval_days":10,"max_applications":5,"nozzle_type":"Hollow cone with emulsifier","weather_restrictions":"Add emulsifier for better mixing","safety_precautions":["Organic","Non-toxic"],"price_range":"₹200-300/L","formulation":"2% oil emulsion"}'::jsonb,
    '{"mr":"करंज तेल (पोंगामिया) - सेंद्रिय","hi":"करंज तेल (पोंगामिया) - जैविक","en":"Pongamia oil 2% (Karanj) - Organic"}'::jsonb
  ),

  -- Biocontrol (product_type must be pesticide per DB check constraint)
  (
    'BEAUVERIA-BASSIANA-1.15WP','Beauveria bassiana 1.15% WP','pesticide','biocontrol','Daman/Bio-Power/Multiplex',
    '[{"name":"Beauveria bassiana fungal spores","percentage":1.15,"formulation":"WP"}]'::jsonb,
    '5 g/L or 1 kg/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","APHID","THRIPS","MEALYBUG","BORERS"]'::jsonb,'[]'::jsonb,
    '["ALL_CROPS"]'::jsonb,
    0,'{"min":200,"max":200,"unit":"L"}'::jsonb,true,'low',3.3,
    '{"ipm_level":4,"efficacy_percent":65,"mode_of_action":"Entomopathogenic fungus - infects through cuticle","timing":"Evening (>80% humidity ideal)","repeat_interval_days":10,"max_applications":4,"nozzle_type":"Hollow cone, avoid high pressure","weather_restrictions":"Needs humidity >65%, no direct sunlight","safety_precautions":["Avoid fungicide spray for 7 days","Organic approved"],"price_range":"₹300-450/kg"}'::jsonb,
    '{"mr":"बव्हेरिया बॅसियाना - जैविक बुरशी","hi":"ब्युवेरिया बेसियाना - जैविक फफूंद","en":"Beauveria bassiana 1.15% WP - Organic"}'::jsonb
  ),
  (
    'METARHIZIUM-ANISOPLIAE-1.15WP','Metarhizium anisopliae 1.15% WP','pesticide','biocontrol','Met-52/Pacer/Multiplex',
    '[{"name":"Metarhizium anisopliae fungal spores","percentage":1.15,"formulation":"WP"}]'::jsonb,
    '5 g/L soil drench or 4 kg/acre soil application in 500 L water','SOIL_DRENCH',
    '["WHITE_GRUB","TERMITE","ROOT_BORER","BEETLE_LARVAE"]'::jsonb,'[]'::jsonb,
    '["SUGARCANE","GROUNDNUT","VEGETABLES"]'::jsonb,
    0,'{"min":500,"max":500,"unit":"L"}'::jsonb,true,'low',3.5,
    '{"ipm_level":4,"efficacy_percent":70,"mode_of_action":"Green muscardine fungus - soil pest control","timing":"At planting or before pest damage appears","repeat_interval_days":30,"max_applications":2,"nozzle_type":"Drenching","weather_restrictions":"Apply when soil is moist","safety_precautions":["Mix with FYM for better spread","Avoid fungicides","Organic"],"price_range":"₹350-500/kg"}'::jsonb,
    '{"mr":"मेटाऱ्हायझियम - मातीतील किडींसाठी","hi":"मेटारहाइजियम - मिट्टी के कीटों के लिए","en":"Metarhizium anisopliae - Soil pest control"}'::jsonb
  ),
  (
    'VERTICILLIUM-LECANII-1.15WP','Verticillium lecanii 1.15% WP','pesticide','biocontrol','Vertimax/Bio-Catch',
    '[{"name":"Verticillium lecanii","percentage":1.15,"formulation":"WP"}]'::jsonb,
    '5 g/L or 1 kg/acre in 200 L water','FOLIAR_SPRAY',
    '["WHITEFLY","APHID","THRIPS","SCALE","MEALYBUG"]'::jsonb,'[]'::jsonb,
    '["VEGETABLES","COTTON","ORNAMENTALS"]'::jsonb,
    0,'{"min":200,"max":200,"unit":"L"}'::jsonb,true,'low',3.4,
    '{"ipm_level":4,"efficacy_percent":68,"mode_of_action":"White halo fungus - sucking pest control","timing":"Evening when humidity is high","repeat_interval_days":10,"max_applications":4,"nozzle_type":"Hollow cone","weather_restrictions":"Humidity >70% required","safety_precautions":["Most effective on soft-bodied insects","No fungicides"],"price_range":"₹350-450/kg"}'::jsonb,
    '{"mr":"व्हर्टिसिलियम - पांढऱ्या माशीसाठी","hi":"वर्टिसिलियम - सफेद मक्खी के लिए","en":"Verticillium lecanii - For whitefly"}'::jsonb
  ),

  -- Fungicides
  (
    'AZOXYSTROBIN-23SC','Azoxystrobin 23% SC','fungicide','fungicides','Amistar/Mirador/Heritage',
    '[{"name":"Azoxystrobin","percentage":23,"formulation":"SC"}]'::jsonb,
    '1 ml/L or 200 ml/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["EARLY_BLIGHT","LATE_BLIGHT","POWDERY_MILDEW","DOWNY_MILDEW","ANTHRACNOSE","RUST"]'::jsonb,
    '["VEGETABLES","GRAPES","TOMATO","CHILLI","POTATO"]'::jsonb,
    7,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.3,
    '{"ipm_level":5,"efficacy_percent":85,"mode_of_action":"QoI inhibitor - respiration inhibition","timing":"Preventive or early infection","repeat_interval_days":14,"max_applications":3,"nozzle_type":"Hollow cone for coverage","weather_restrictions":"No rain within 2 hours","safety_precautions":["Rotate with different MoA to prevent resistance"],"price_range":"₹450-600/100ml"}'::jsonb,
    '{"mr":"अॅझोक्सिस्ट्रोबिन (अमिस्टार/मिराडोर)","hi":"एज़ोक्सिस्ट्रोबिन (अमिस्टार/मिराडोर)","en":"Azoxystrobin 23% SC (Amistar)"}'::jsonb
  ),
  (
    'TRICYCLAZOLE-75WP','Tricyclazole 75% WP','fungicide','fungicides','Beam/Blasticide/Tricy',
    '[{"name":"Tricyclazole","percentage":75,"formulation":"WP"}]'::jsonb,
    '0.6 g/L or 120 g/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["RICE_BLAST","BLAST","NECK_BLAST","LEAF_BLAST"]'::jsonb,
    '["RICE","PADDY"]'::jsonb,
    21,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.5,
    '{"ipm_level":5,"efficacy_percent":90,"mode_of_action":"Melanin biosynthesis inhibitor - specific to blast","timing":"Preventive at tillering and panicle emergence","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"Preventive use only","safety_precautions":["Most effective as preventive"],"price_range":"₹280-380/100g"}'::jsonb,
    '{"mr":"ट्रायसायक्लाझोल - करपा रोगासाठी","hi":"ट्राइसाइक्लाज़ोल - ब्लास्ट के लिए","en":"Tricyclazole 75% WP - Rice blast"}'::jsonb
  ),
  (
    'PROPICONAZOLE-25EC','Propiconazole 25% EC','fungicide','fungicides','Tilt/Bumper/Propi',
    '[{"name":"Propiconazole","percentage":25,"formulation":"EC"}]'::jsonb,
    '1 ml/L or 200 ml/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["SHEATH_BLIGHT","RUST","POWDERY_MILDEW","LEAF_SPOT"]'::jsonb,
    '["RICE","WHEAT","GROUNDNUT","SOYBEAN"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.1,
    '{"ipm_level":5,"efficacy_percent":82,"mode_of_action":"DMI - Ergosterol biosynthesis inhibitor","timing":"At disease onset","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Systemic action"],"price_range":"₹320-420/250ml"}'::jsonb,
    '{"mr":"प्रोपिकोनाझोल (टिल्ट/बम्पर)","hi":"प्रोपिकोनाज़ोल (टिल्ट/बम्पर)","en":"Propiconazole 25% EC (Tilt)"}'::jsonb
  ),
  (
    'HEXACONAZOLE-5SC','Hexaconazole 5% SC','fungicide','fungicides','Contaf/Sitara',
    '[{"name":"Hexaconazole","percentage":5,"formulation":"SC"}]'::jsonb,
    '2 ml/L or 400 ml/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["SHEATH_BLIGHT","POWDERY_MILDEW","RUST","SCAB"]'::jsonb,
    '["RICE","MANGO","APPLE","GRAPES","VEGETABLES"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.0,
    '{"ipm_level":5,"efficacy_percent":80,"mode_of_action":"Triazole - systemic fungicide","timing":"At first disease symptoms","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Systemic"],"price_range":"₹220-300/250ml"}'::jsonb,
    '{"mr":"हेक्झाकोनाझोल (कॉन्टाफ/सितारा)","hi":"हेक्साकोनाज़ोल (कॉन्टाफ/सितारा)","en":"Hexaconazole 5% SC (Contaf)"}'::jsonb
  ),
  (
    'TEBUCONAZOLE-25.9EC','Tebuconazole 25.9% EC','fungicide','fungicides','Folicur/Orius',
    '[{"name":"Tebuconazole","percentage":25.9,"formulation":"EC"}]'::jsonb,
    '1 ml/L or 200 ml/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["RUST","POWDERY_MILDEW","SHEATH_BLIGHT","SMUT","ERGOT"]'::jsonb,
    '["WHEAT","BARLEY","RICE","GROUNDNUT","SOYBEAN"]'::jsonb,
    21,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',4.3,
    '{"ipm_level":5,"efficacy_percent":85,"mode_of_action":"Triazole - broad spectrum systemic","timing":"Preventive to early curative","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Excellent for rust"],"price_range":"₹380-500/250ml"}'::jsonb,
    '{"mr":"टेब्युकोनाझोल (फोलिक्युर/ओरियस)","hi":"टेब्यूकोनाज़ोल (फोलिकुर/ओरियस)","en":"Tebuconazole 25.9% EC (Folicur)"}'::jsonb
  ),
  (
    'MANCOZEB-75WP','Mancozeb 75% WP','fungicide','fungicides','Dithane M-45/Indofil M-45/Manzate',
    '[{"name":"Mancozeb (Mn+Zn EBDC)","percentage":75,"formulation":"WP"}]'::jsonb,
    '2.5 g/L or 500 g/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["EARLY_BLIGHT","LATE_BLIGHT","DOWNY_MILDEW","ANTHRACNOSE","LEAF_SPOT"]'::jsonb,
    '["POTATO","TOMATO","GRAPES","VEGETABLES","BANANA"]'::jsonb,
    7,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',3.8,
    '{"ipm_level":4,"efficacy_percent":75,"mode_of_action":"Multi-site contact fungicide","timing":"Preventive - before disease","repeat_interval_days":7,"max_applications":6,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["No resistance development"],"price_range":"₹180-250/500g"}'::jsonb,
    '{"mr":"मॅन्कोझेब (डायथेन एम-45/इंडोफिल)","hi":"मैंकोज़ेब (डाइथेन एम-45/इंडोफिल)","en":"Mancozeb 75% WP (Dithane M-45)"}'::jsonb
  ),
  (
    'COPPER-OXYCHLORIDE-50WP','Copper oxychloride 50% WP','fungicide','fungicides','Blitox/Blue Copper/Fytolan',
    '[{"name":"Copper oxychloride","percentage":50,"formulation":"WP"}]'::jsonb,
    '3 g/L or 600 g/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["BACTERIAL_LEAF_BLIGHT","DOWNY_MILDEW","ANTHRACNOSE","CANKER"]'::jsonb,
    '["ALL_CROPS","CITRUS","GRAPES","POTATO","TOMATO"]'::jsonb,
    7,'{"min":200,"max":200,"unit":"L"}'::jsonb,true,'moderate',3.5,
    '{"ipm_level":4,"efficacy_percent":70,"mode_of_action":"Contact fungicide + bactericide","timing":"Preventive application","repeat_interval_days":10,"max_applications":4,"nozzle_type":"Hollow cone with agitation","weather_restrictions":"Avoid spraying on wet foliage","safety_precautions":["Can cause phytotoxicity"],"price_range":"₹200-280/500g"}'::jsonb,
    '{"mr":"कॉपर ऑक्सिक्लोराइड (ब्लाइटॉक्स/ब्लू कॉपर)","hi":"कॉपर ऑक्सीक्लोराइड (ब्लाइटॉक्स/ब्लू कॉपर)","en":"Copper oxychloride 50% WP (Blitox)"}'::jsonb
  ),
  (
    'CARBENDAZIM-50WP','Carbendazim 50% WP','fungicide','fungicides','Bavistin/Derosal/JK Stein',
    '[{"name":"Carbendazim","percentage":50,"formulation":"WP"}]'::jsonb,
    '1 g/L or 200 g/acre in 200 L water','FOLIAR_SPRAY',
    '[]'::jsonb,'["POWDERY_MILDEW","ANTHRACNOSE","WILT","ROOT_ROT","SHEATH_BLIGHT"]'::jsonb,
    '["ALL_CROPS","RICE","VEGETABLES","FRUITS"]'::jsonb,
    14,'{"min":200,"max":200,"unit":"L"}'::jsonb,false,'moderate',3.9,
    '{"ipm_level":5,"efficacy_percent":78,"mode_of_action":"Systemic benzimidazole - cell division inhibitor","timing":"At disease onset","repeat_interval_days":14,"max_applications":2,"nozzle_type":"Hollow cone","weather_restrictions":"No rain within 4 hours","safety_precautions":["Resistance common"],"price_range":"₹180-250/100g"}'::jsonb,
    '{"mr":"कार्बेंडाझिम (बॅविस्टिन/डेरोसल)","hi":"कार्बेन्डाज़िम (बाविस्टिन/डेरोसल)","en":"Carbendazim 50% WP (Bavistin)"}'::jsonb
  )
)
INSERT INTO public.master_products (
  company_id,
  category_id,
  sku,
  name,
  product_type,
  brand,
  active_ingredients,
  dosage_instructions,
  application_method,
  pest_targets,
  disease_targets,
  suitable_crops,
  pre_harvest_interval_days,
  spray_volume_per_acre,
  organic_certified,
  safety_level,
  effectiveness_rating,
  ai_recommendable,
  ai_metadata,
  translations,
  status
)
SELECT
  c.company_id,
  (SELECT id FROM public.master_product_categories WHERE slug = r.category_slug),
  r.sku,
  r.name,
  r.product_type,
  r.brand,
  r.active_ingredients,
  r.dosage_instructions,
  r.application_method,
  r.pest_targets,
  r.disease_targets,
  r.suitable_crops,
  r.pre_harvest_interval_days,
  r.spray_volume_per_acre,
  r.organic_certified,
  r.safety_level,
  r.effectiveness_rating,
  true,
  r.ai_metadata,
  r.translations,
  'active'
FROM rows r
CROSS JOIN company c
WHERE NOT EXISTS (SELECT 1 FROM public.master_products mp WHERE mp.sku = r.sku);
