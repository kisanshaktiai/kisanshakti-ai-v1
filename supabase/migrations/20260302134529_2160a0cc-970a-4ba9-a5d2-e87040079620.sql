
-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT 46 missing observation codes into observation_master
-- These are referenced by decision_rules.observable_characteristics but missing from registry
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_master (observation_code, observation_category, affected_plant_part, is_diagnostic, canonical_group, description)
VALUES
  -- Establishment / Field issues
  ('GAPS_IN_FIELD', 'MANAGEMENT', 'WHOLE', false, 'establishment', 'Visible gaps or missing plants in the field'),
  ('PLANT_DEATH', 'ABIOTIC', 'WHOLE', true, 'mortality', 'Complete plant death'),
  ('ENTIRE_FIELD_AFFECTED', 'MANAGEMENT', 'WHOLE', false, 'spatial', 'Damage spread across entire field'),
  ('EDGE_DAMAGE_ONLY', 'MANAGEMENT', 'WHOLE', false, 'spatial', 'Damage limited to field edges'),
  ('LOCALIZED_SPOTS', 'MANAGEMENT', 'WHOLE', false, 'spatial', 'Damage in localized patches'),
  ('POOR_GERMINATION_PERCENT', 'MANAGEMENT', 'WHOLE', false, 'establishment', 'Low germination percentage'),
  ('SEED_NOT_GERMINATED', 'MANAGEMENT', 'WHOLE', false, 'establishment', 'Seeds failed to germinate'),
  ('SEEDLING_STUNTED', 'ABIOTIC', 'WHOLE', false, 'establishment', 'Seedlings showing stunted growth'),
  ('SEEDLING_WILTED', 'ABIOTIC', 'WHOLE', true, 'establishment', 'Seedlings wilting or collapsing'),
  
  -- Pest: Insects
  ('ADULT_BEETLES_AT_LIGHT', 'PEST', 'WHOLE', false, 'insect_identification', 'Adult beetles attracted to light at night'),
  ('BLACK_INSECTS', 'PEST', 'WHOLE', false, 'insect_identification', 'Black-colored insects observed'),
  ('BROWN_INSECTS', 'PEST', 'WHOLE', false, 'insect_identification', 'Brown-colored insects observed'),
  ('GREEN_INSECTS', 'PEST', 'WHOLE', false, 'insect_identification', 'Green-colored insects observed'),
  ('SMALL_INSECTS', 'PEST', 'WHOLE', false, 'insect_identification', 'Small insects observed'),
  ('MEDIUM_INSECTS', 'PEST', 'WHOLE', false, 'insect_identification', 'Medium-sized insects observed'),
  ('INSECTS_CRAWLING', 'PEST', 'WHOLE', false, 'insect_identification', 'Insects crawling on plant'),
  ('INSECTS_FLYING', 'PEST', 'WHOLE', false, 'insect_identification', 'Flying insects around crop'),
  ('INSECTS_JUMPING', 'PEST', 'WHOLE', false, 'insect_identification', 'Jumping insects on crop'),
  ('PINK_LARVAE', 'PEST', 'STEM', true, 'insect_identification', 'Pink-colored larvae found in stem'),
  ('WHITE_ANT_VISIBLE', 'PEST', 'ROOT', true, 'insect_identification', 'White ants (termites) visible'),
  ('WHITE_WOOLLY_MASS', 'PEST', 'STEM', true, 'insect_identification', 'White woolly mass on stems (mealybug)'),
  
  -- Pest: Damage patterns
  ('BORING_DAMAGE', 'PEST', 'STEM', true, 'damage_pattern', 'Boring damage visible in stem'),
  ('ENTRY_HOLE', 'PEST', 'STEM', true, 'damage_pattern', 'Entry hole from boring pest'),
  ('FRASS', 'PEST', 'STEM', false, 'damage_pattern', 'Frass (insect excrement) visible'),
  ('MUD_TUNNELS', 'PEST', 'ROOT', true, 'damage_pattern', 'Mud tunnels from termites'),
  ('HOLES_IN_BOLL', 'PEST', 'FRUIT', true, 'damage_pattern', 'Holes in cotton boll'),
  ('DAMAGED_LINT', 'PEST', 'FRUIT', false, 'damage_pattern', 'Cotton lint damaged'),
  ('FRUIT_DEFORMED', 'PEST', 'FRUIT', false, 'damage_pattern', 'Deformed fruits'),
  ('FOUL_ODOR_WHEN_CRUSHED', 'PEST', 'STEM', true, 'damage_pattern', 'Foul odor when affected stem crushed'),
  
  -- Abiotic stress
  ('DAMAGE_AFTER_RAIN', 'ABIOTIC', 'WHOLE', false, 'weather_damage', 'Damage appeared after heavy rain'),
  ('DAMAGE_AFTER_FROST', 'ABIOTIC', 'WHOLE', false, 'weather_damage', 'Damage appeared after frost'),
  ('DAMAGE_AFTER_HEAT', 'ABIOTIC', 'WHOLE', false, 'weather_damage', 'Damage appeared after heat wave'),
  ('DAMAGE_AFTER_WIND', 'ABIOTIC', 'WHOLE', false, 'weather_damage', 'Damage appeared after strong wind'),
  ('CRACKS_IN_SOIL', 'ABIOTIC', 'SOIL', false, 'soil_condition', 'Visible cracks in soil surface'),
  ('SALT_CRUST_VISIBLE', 'ABIOTIC', 'SOIL', false, 'soil_condition', 'Salt crust on soil surface'),
  ('WHITE_SOIL_DEPOSITS', 'ABIOTIC', 'SOIL', false, 'soil_condition', 'White deposits on soil'),
  ('ROOT_DRY', 'ABIOTIC', 'ROOT', false, 'moisture_stress', 'Roots appear dry'),
  
  -- Nutrient / Growth issues
  ('PURPLISH_LEAVES', 'NUTRIENT', 'LEAF', true, 'nutrient_deficiency', 'Purple coloration on leaves (phosphorus deficiency)'),
  ('UNIFORM_YELLOWING_OLDER_LEAVES', 'NUTRIENT', 'LEAF', true, 'nutrient_deficiency', 'Uniform yellowing of older leaves (nitrogen deficiency)'),
  ('THICK_LEAVES', 'PHYSIOLOGY', 'LEAF', false, 'growth_abnormality', 'Abnormally thick leaves'),
  ('THIN_STEMS', 'PHYSIOLOGY', 'STEM', false, 'growth_abnormality', 'Abnormally thin stems'),
  ('EXCESSIVE_TILLERS', 'PHYSIOLOGY', 'WHOLE', false, 'growth_abnormality', 'Excessive number of tillers'),
  ('WEAK_SHOOTS', 'PHYSIOLOGY', 'STEM', false, 'growth_abnormality', 'Weak or spindly shoots'),
  ('LUSH_VEGETATIVE_GROWTH', 'PHYSIOLOGY', 'WHOLE', false, 'growth_abnormality', 'Excessive vegetative growth'),
  ('REDUCED_JUICE_QUALITY', 'PHYSIOLOGY', 'STEM', false, 'quality', 'Reduced juice quality in sugarcane'),
  
  -- General
  ('UNKNOWN_SYMPTOM', 'MANAGEMENT', 'WHOLE', false, 'general', 'Unknown or unidentified symptom')
ON CONFLICT (observation_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT Marathi + Hindi translations for all 46 codes
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_translations (observation_code, language_code, display_text, description_text)
VALUES
  -- Establishment / Field
  ('GAPS_IN_FIELD', 'mr', 'शेतात गॅप', 'शेतात ठिकठिकाणी रोपे नाहीत, गॅप दिसतात'),
  ('GAPS_IN_FIELD', 'hi', 'खेत में गैप', 'खेत में जगह-जगह पौधे नहीं हैं, गैप दिख रहे हैं'),
  ('PLANT_DEATH', 'mr', 'रोप मेले', 'रोपे पूर्णपणे मरून गेली आहेत'),
  ('PLANT_DEATH', 'hi', 'पौधा मर गया', 'पौधे पूरी तरह मर गए हैं'),
  ('ENTIRE_FIELD_AFFECTED', 'mr', 'पूर्ण शेत बाधित', 'संपूर्ण शेतात समस्या दिसते'),
  ('ENTIRE_FIELD_AFFECTED', 'hi', 'पूरा खेत प्रभावित', 'पूरे खेत में समस्या दिख रही है'),
  ('EDGE_DAMAGE_ONLY', 'mr', 'फक्त कडेला नुकसान', 'फक्त शेताच्या कडेला नुकसान दिसते'),
  ('EDGE_DAMAGE_ONLY', 'hi', 'सिर्फ किनारे पर नुकसान', 'सिर्फ खेत के किनारे पर नुकसान दिख रहा है'),
  ('LOCALIZED_SPOTS', 'mr', 'ठिकठिकाणी नुकसान', 'शेतात काही ठिकाणीच नुकसान दिसते'),
  ('LOCALIZED_SPOTS', 'hi', 'जगह-जगह नुकसान', 'खेत में कुछ जगहों पर ही नुकसान दिख रहा है'),
  ('POOR_GERMINATION_PERCENT', 'mr', 'कमी उगवण', 'उगवण कमी झाली, बरीच रोपे आली नाहीत'),
  ('POOR_GERMINATION_PERCENT', 'hi', 'कम अंकुरण', 'अंकुरण कम हुआ, बहुत से पौधे नहीं उगे'),
  ('SEED_NOT_GERMINATED', 'mr', 'बियाणे उगवले नाही', 'बियाणे अजिबात उगवले नाही'),
  ('SEED_NOT_GERMINATED', 'hi', 'बीज नहीं उगा', 'बीज बिल्कुल नहीं उगे'),
  ('SEEDLING_STUNTED', 'mr', 'रोपे खुरटली', 'रोपांची वाढ खुंटली आहे'),
  ('SEEDLING_STUNTED', 'hi', 'अंकुर बौने', 'अंकुरों की बढ़वार रुक गई है'),
  ('SEEDLING_WILTED', 'mr', 'रोपे सुकली', 'रोपे कोमेजून सुकत आहेत'),
  ('SEEDLING_WILTED', 'hi', 'अंकुर मुरझाए', 'अंकुर मुरझा कर सूख रहे हैं'),
  
  -- Pest: Insects
  ('ADULT_BEETLES_AT_LIGHT', 'mr', 'दिव्यावर भुंगे', 'रात्री दिव्यावर भुंगे दिसतात'),
  ('ADULT_BEETLES_AT_LIGHT', 'hi', 'रोशनी पर भृंग', 'रात को रोशनी पर भृंग दिख रहे हैं'),
  ('BLACK_INSECTS', 'mr', 'काळे कीटक', 'काळ्या रंगाचे कीटक दिसतात'),
  ('BLACK_INSECTS', 'hi', 'काले कीड़े', 'काले रंग के कीड़े दिख रहे हैं'),
  ('BROWN_INSECTS', 'mr', 'तपकिरी कीटक', 'तपकिरी रंगाचे कीटक दिसतात'),
  ('BROWN_INSECTS', 'hi', 'भूरे कीड़े', 'भूरे रंग के कीड़े दिख रहे हैं'),
  ('GREEN_INSECTS', 'mr', 'हिरवे कीटक', 'हिरव्या रंगाचे कीटक दिसतात'),
  ('GREEN_INSECTS', 'hi', 'हरे कीड़े', 'हरे रंग के कीड़े दिख रहे हैं'),
  ('SMALL_INSECTS', 'mr', 'लहान कीटक', 'लहान आकाराचे कीटक दिसतात'),
  ('SMALL_INSECTS', 'hi', 'छोटे कीड़े', 'छोटे आकार के कीड़े दिख रहे हैं'),
  ('MEDIUM_INSECTS', 'mr', 'मध्यम कीटक', 'मध्यम आकाराचे कीटक दिसतात'),
  ('MEDIUM_INSECTS', 'hi', 'मध्यम कीड़े', 'मध्यम आकार के कीड़े दिख रहे हैं'),
  ('INSECTS_CRAWLING', 'mr', 'कीटक रांगत आहेत', 'रोपांवर कीटक रांगताना दिसतात'),
  ('INSECTS_CRAWLING', 'hi', 'कीड़े रेंग रहे हैं', 'पौधों पर कीड़े रेंगते दिख रहे हैं'),
  ('INSECTS_FLYING', 'mr', 'कीटक उडत आहेत', 'पिकाभोवती कीटक उडताना दिसतात'),
  ('INSECTS_FLYING', 'hi', 'कीड़े उड़ रहे हैं', 'फसल के आसपास कीड़े उड़ रहे हैं'),
  ('INSECTS_JUMPING', 'mr', 'कीटक उड्या मारत आहेत', 'पिकावर उड्या मारणारे कीटक दिसतात'),
  ('INSECTS_JUMPING', 'hi', 'कीड़े कूद रहे हैं', 'फसल पर कूदने वाले कीड़े दिख रहे हैं'),
  ('PINK_LARVAE', 'mr', 'गुलाबी अळी', 'खोडात गुलाबी रंगाची अळी दिसते'),
  ('PINK_LARVAE', 'hi', 'गुलाबी लार्वा', 'तने में गुलाबी रंग का लार्वा दिख रहा है'),
  ('WHITE_ANT_VISIBLE', 'mr', 'वाळवी दिसते', 'मुळांजवळ वाळवी (पांढरी मुंगी) दिसते'),
  ('WHITE_ANT_VISIBLE', 'hi', 'दीमक दिख रही', 'जड़ों के पास दीमक दिख रही है'),
  ('WHITE_WOOLLY_MASS', 'mr', 'पांढरा लोकरीसारखा थर', 'खोडावर पांढरा लोकरीसारखा थर दिसतो (ढेकूण)'),
  ('WHITE_WOOLLY_MASS', 'hi', 'सफेद रुई जैसा', 'तने पर सफेद रुई जैसा दिख रहा है (मिलीबग)'),
  
  -- Pest: Damage patterns
  ('BORING_DAMAGE', 'mr', 'पोखरणे नुकसान', 'खोडात पोखरल्याचे नुकसान दिसते'),
  ('BORING_DAMAGE', 'hi', 'छेदन नुकसान', 'तने में छेदन का नुकसान दिख रहा है'),
  ('ENTRY_HOLE', 'mr', 'प्रवेश छिद्र', 'किडीचे प्रवेश छिद्र दिसते'),
  ('ENTRY_HOLE', 'hi', 'प्रवेश छेद', 'कीड़े का प्रवेश छेद दिख रहा है'),
  ('FRASS', 'mr', 'किडीची विष्ठा', 'किडीची विष्ठा (भुसा) दिसते'),
  ('FRASS', 'hi', 'कीड़े का मल', 'कीड़े का मल (भूसा) दिख रहा है'),
  ('MUD_TUNNELS', 'mr', 'मातीचे बोगदे', 'वाळवीचे मातीचे बोगदे दिसतात'),
  ('MUD_TUNNELS', 'hi', 'मिट्टी की सुरंगें', 'दीमक की मिट्टी की सुरंगें दिख रही हैं'),
  ('HOLES_IN_BOLL', 'mr', 'बोंडात छिद्रे', 'कापसाच्या बोंडात छिद्रे दिसतात'),
  ('HOLES_IN_BOLL', 'hi', 'बॉल में छेद', 'कपास के बॉल में छेद दिख रहे हैं'),
  ('DAMAGED_LINT', 'mr', 'खराब रुई', 'कापसाची रुई खराब झाली आहे'),
  ('DAMAGED_LINT', 'hi', 'खराब रुई', 'कपास की रुई खराब हो गई है'),
  ('FRUIT_DEFORMED', 'mr', 'विकृत फळे', 'फळे विकृत/वेडीवाकडी दिसतात'),
  ('FRUIT_DEFORMED', 'hi', 'विकृत फल', 'फल विकृत/टेढ़े-मेढ़े दिख रहे हैं'),
  ('FOUL_ODOR_WHEN_CRUSHED', 'mr', 'दुर्गंधी खोड', 'बाधित खोड चिरडल्यावर दुर्गंधी येते'),
  ('FOUL_ODOR_WHEN_CRUSHED', 'hi', 'बदबू वाला तना', 'प्रभावित तना कुचलने पर बदबू आती है'),
  
  -- Abiotic stress
  ('DAMAGE_AFTER_RAIN', 'mr', 'पावसानंतर नुकसान', 'जोरदार पावसानंतर नुकसान दिसले'),
  ('DAMAGE_AFTER_RAIN', 'hi', 'बारिश के बाद नुकसान', 'भारी बारिश के बाद नुकसान दिखा'),
  ('DAMAGE_AFTER_FROST', 'mr', 'दवानंतर नुकसान', 'दव/कडक थंडीनंतर नुकसान दिसले'),
  ('DAMAGE_AFTER_FROST', 'hi', 'पाले के बाद नुकसान', 'पाले/कड़ी ठंड के बाद नुकसान दिखा'),
  ('DAMAGE_AFTER_HEAT', 'mr', 'उष्णतेनंतर नुकसान', 'कडक उन्हानंतर नुकसान दिसले'),
  ('DAMAGE_AFTER_HEAT', 'hi', 'गर्मी के बाद नुकसान', 'तेज गर्मी के बाद नुकसान दिखा'),
  ('DAMAGE_AFTER_WIND', 'mr', 'वाऱ्यानंतर नुकसान', 'जोरदार वाऱ्यानंतर नुकसान दिसले'),
  ('DAMAGE_AFTER_WIND', 'hi', 'हवा के बाद नुकसान', 'तेज हवा के बाद नुकसान दिखा'),
  ('CRACKS_IN_SOIL', 'mr', 'जमिनीला भेगा', 'जमिनीला भेगा पडल्या आहेत'),
  ('CRACKS_IN_SOIL', 'hi', 'जमीन में दरारें', 'जमीन में दरारें पड़ गई हैं'),
  ('SALT_CRUST_VISIBLE', 'mr', 'क्षाराचा थर', 'जमिनीवर क्षाराचा पांढरा थर दिसतो'),
  ('SALT_CRUST_VISIBLE', 'hi', 'नमक की परत', 'जमीन पर नमक की सफेद परत दिख रही है'),
  ('WHITE_SOIL_DEPOSITS', 'mr', 'जमिनीवर पांढरा थर', 'जमिनीवर पांढरा साठा दिसतो'),
  ('WHITE_SOIL_DEPOSITS', 'hi', 'जमीन पर सफेद जमाव', 'जमीन पर सफेद जमाव दिख रहा है'),
  ('ROOT_DRY', 'mr', 'मुळे कोरडी', 'रोपांची मुळे कोरडी दिसतात'),
  ('ROOT_DRY', 'hi', 'जड़ें सूखी', 'पौधों की जड़ें सूखी दिख रही हैं'),
  
  -- Nutrient / Growth
  ('PURPLISH_LEAVES', 'mr', 'जांभळी पाने', 'पानांवर जांभळा रंग दिसतो (स्फुरद कमतरता)'),
  ('PURPLISH_LEAVES', 'hi', 'बैंगनी पत्ते', 'पत्तों पर बैंगनी रंग दिख रहा है (फॉस्फोरस की कमी)'),
  ('UNIFORM_YELLOWING_OLDER_LEAVES', 'mr', 'जुन्या पानांचे पिवळेपण', 'जुनी पाने एकसारखी पिवळी होत आहेत (नत्र कमतरता)'),
  ('UNIFORM_YELLOWING_OLDER_LEAVES', 'hi', 'पुरानी पत्तियों का पीलापन', 'पुरानी पत्तियां एक समान पीली हो रही हैं (नाइट्रोजन की कमी)'),
  ('THICK_LEAVES', 'mr', 'जाड पाने', 'पाने असामान्यपणे जाड दिसतात'),
  ('THICK_LEAVES', 'hi', 'मोटे पत्ते', 'पत्ते असामान्य रूप से मोटे दिख रहे हैं'),
  ('THIN_STEMS', 'mr', 'बारीक खोडे', 'खोडे असामान्यपणे बारीक दिसतात'),
  ('THIN_STEMS', 'hi', 'पतले तने', 'तने असामान्य रूप से पतले दिख रहे हैं'),
  ('EXCESSIVE_TILLERS', 'mr', 'जास्त फुटवे', 'खूप जास्त फुटवे आले आहेत'),
  ('EXCESSIVE_TILLERS', 'hi', 'अत्यधिक टिलर', 'बहुत ज्यादा टिलर आ गए हैं'),
  ('WEAK_SHOOTS', 'mr', 'कमजोर कोंब', 'कोंब कमजोर/बारीक दिसतात'),
  ('WEAK_SHOOTS', 'hi', 'कमजोर शाखाएं', 'शाखाएं कमजोर/पतली दिख रही हैं'),
  ('LUSH_VEGETATIVE_GROWTH', 'mr', 'अतिवाढ', 'रोपांची अति वनस्पती वाढ झाली आहे'),
  ('LUSH_VEGETATIVE_GROWTH', 'hi', 'अत्यधिक वनस्पति वृद्धि', 'पौधों की अत्यधिक वनस्पति वृद्धि हो गई है'),
  ('REDUCED_JUICE_QUALITY', 'mr', 'रसाचा दर्जा कमी', 'उसाच्या रसाचा दर्जा कमी झाला'),
  ('REDUCED_JUICE_QUALITY', 'hi', 'रस की गुणवत्ता कम', 'गन्ने के रस की गुणवत्ता कम हो गई'),
  
  -- General
  ('UNKNOWN_SYMPTOM', 'mr', 'अज्ञात लक्षण', 'कोणते लक्षण ते ओळखता येत नाही'),
  ('UNKNOWN_SYMPTOM', 'hi', 'अज्ञात लक्षण', 'कौन सा लक्षण है पहचान नहीं हो रहा')
ON CONFLICT (observation_code, language_code) DO NOTHING;
