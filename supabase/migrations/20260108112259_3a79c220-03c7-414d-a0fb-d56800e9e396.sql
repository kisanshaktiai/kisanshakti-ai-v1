-- Clear old keyword-based rules and insert observation-based rules v2.0
DELETE FROM public.decision_rules WHERE version = '1.0.0';

-- Insert observation-based bridging rules
INSERT INTO public.decision_rules (rule_id, crop_group, crop_code, category, stage_applicable, condition_code, conditions_json, cause, priority, scientific_source, scientific_basis, trigger_keywords, response_mr, response_hi, response_en, action_type, canonical_group, is_active, version) VALUES

-- APHID BRIDGING - observation based
('BRIDGE_APHID_001', 'all', 'all', 'diagnosis', ARRAY['VEGETATIVE','FLOWERING','TILLERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  return symptoms.includes(''SMALL_INSECTS_VISIBLE'') && (symptoms.includes(''CURLED_LEAVES'') || symptoms.includes(''HONEYDEW''));
}',
'{"visual_symptoms": ["SMALL_INSECTS_VISIBLE", "CURLED_LEAVES", "HONEYDEW"]}'::jsonb,
'APHID_INFESTATION', 9, 'ICAR-NBAIR', 'Aphids cause leaf curling and honeydew secretion',
ARRAY[]::text[], 
'🐛 माव दिसतोय! पाने वळतात आणि चिकट आहेत - माव्याची लक्षणे.',
'🐛 माहू दिख रहा है! पत्ते मुड़ रहे हैं और चिपचिपे हैं - माहू के लक्षण।',
'🐛 Aphid infestation likely! Curled leaves with sticky residue are classic aphid symptoms.',
'RECOMMEND', 'diagnosis', true, '2.0.0'),

-- WHITEFLY BRIDGING
('BRIDGE_WHITEFLY_001', 'all', 'all', 'diagnosis', ARRAY['VEGETATIVE','FLOWERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  return symptoms.includes(''FLYING_INSECTS_VISIBLE'') && symptoms.includes(''GENERAL_YELLOWING'');
}',
'{"visual_symptoms": ["FLYING_INSECTS_VISIBLE", "GENERAL_YELLOWING"]}'::jsonb,
'WHITEFLY_INFESTATION', 8, 'ICAR-NBAIR', 'Whiteflies fly when disturbed, cause yellowing via phloem feeding',
ARRAY[]::text[],
'🦋 पांढरी माशी दिसतेय! उडणारे छोटे कीटक आणि पाने पिवळी.',
'🦋 सफेद मक्खी दिख रही है! उड़ने वाले छोटे कीट और पत्ते पीले।',
'🦋 Whitefly likely! Small flying insects with yellowing leaves are whitefly symptoms.',
'RECOMMEND', 'diagnosis', true, '2.0.0'),

-- SUGARCANE EARLY SHOOT BORER (Dead Heart)
('BRIDGE_ESB_001', 'sugarcane', 'sugarcane', 'diagnosis', ARRAY['GERMINATION','TILLERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  return input.crop_code === ''sugarcane'' && (symptoms.includes(''DEAD_HEART'') || symptoms.includes(''STEM_DISCOLORATION''));
}',
'{"crop_code": "sugarcane", "visual_symptoms": ["DEAD_HEART", "STEM_DISCOLORATION"]}'::jsonb,
'SUGARCANE_EARLY_SHOOT_BORER', 9, 'ICAR-SBI', 'ESB larvae bore into shoots causing dead hearts in young sugarcane',
ARRAY[]::text[],
'🪱 खोडकिडा! मधली सुरळी वाळली आहे - लवकर खोडकिड्याची लक्षणे.',
'🪱 तना छेदक! बीच की गोभी सूख गई है - प्रारंभिक तना छेदक के लक्षण।',
'🪱 Early shoot borer! Dead heart symptom in young sugarcane indicates ESB attack.',
'RECOMMEND', 'diagnosis', true, '2.0.0'),

-- WHEAT RUST (observation based)
('DISEASE_RUST_OBS_001', 'wheat', 'wheat', 'disease', ARRAY['TILLERING','HEADING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  return symptoms.includes(''RUST_PUSTULES'') || (symptoms.includes(''ORANGE_SPOTS'') && input.crop_code === ''wheat'');
}',
'{"crop_code": "wheat", "visual_symptoms": ["RUST_PUSTULES", "ORANGE_SPOTS"]}'::jsonb,
'WHEAT_RUST', 9, 'ICAR-IIWBR', 'Rust pustules are diagnostic for Puccinia species',
ARRAY[]::text[],
'🟠 गंज! नारंगी फोड दिसतात - तांबेरा रोग.',
'🟠 गेरुआ! नारंगी फोड़े दिख रहे हैं।',
'🟠 Rust! Orange pustules are diagnostic for rust disease.',
'RECOMMEND', 'disease', true, '2.0.0'),

-- NITROGEN DEFICIENCY (observation + soil based)
('NUTRIENT_N_DEF_OBS_001', 'all', 'all', 'nutrient', ARRAY['VEGETATIVE','TILLERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  const hasYellowing = symptoms.includes(''GENERAL_YELLOWING'');
  const isUniform = symptoms.includes(''DISTRIBUTION_UNIFORM'');
  const lowSoilN = input.soil_nitrogen === ''LOW'' || input.soil_nitrogen === ''VERY_LOW'';
  return hasYellowing && (isUniform || lowSoilN);
}',
'{"visual_symptoms": ["GENERAL_YELLOWING", "DISTRIBUTION_UNIFORM"], "soil_nitrogen": ["LOW", "VERY_LOW"]}'::jsonb,
'NITROGEN_DEFICIENCY', 9, 'ICAR Soil Science', 'Nitrogen deficiency causes uniform chlorosis starting from older leaves',
ARRAY[]::text[],
'💛 नायट्रोजन कमतरता! पाने सगळीकडे एकसारखी पिवळी - नायट्रोजन द्या.',
'💛 नाइट्रोजन कमी! पत्ते समान रूप से पीले - नाइट्रोजन दें।',
'💛 Nitrogen deficiency! Uniform yellowing indicates N shortage.',
'RECOMMEND', 'nutrient', true, '2.0.0'),

-- MITES - Webbing
('BRIDGE_MITES_001', 'all', 'all', 'diagnosis', ARRAY['VEGETATIVE','FLOWERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  return symptoms.includes(''WEBBING'');
}',
'{"visual_symptoms": ["WEBBING"]}'::jsonb,
'MITE_INFESTATION', 9, 'ICAR-NBAIR', 'Spider mites create characteristic webbing on undersides of leaves',
ARRAY[]::text[],
'🕷️ कोळी माइट! पानांवर जाळे दिसतंय.',
'🕷️ मकड़ी माइट! पत्तों पर जाले दिख रहे हैं।',
'🕷️ Spider mites! Webbing on leaves is characteristic mite damage.',
'RECOMMEND', 'diagnosis', true, '2.0.0'),

-- CATERPILLAR - Holes + frass
('BRIDGE_CATERPILLAR_001', 'all', 'all', 'diagnosis', ARRAY['VEGETATIVE','FLOWERING','TILLERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  return symptoms.includes(''LEAF_HOLES'') || symptoms.includes(''FRASS'');
}',
'{"visual_symptoms": ["LEAF_HOLES", "FRASS"]}'::jsonb,
'CATERPILLAR_DAMAGE', 8, 'ICAR-NBAIR', 'Caterpillars cause holes and leave frass',
ARRAY[]::text[],
'🐛 अळी/बोरर! पानांवर भोके आणि विष्ठा दिसतेय.',
'🐛 इल्ली/बोरर! पत्तों में छेद और मल दिख रहा है।',
'🐛 Caterpillar/borer damage! Holes with frass indicate larval feeding.',
'RECOMMEND', 'diagnosis', true, '2.0.0'),

-- POTASSIUM DEFICIENCY
('NUTRIENT_K_DEF_OBS_001', 'all', 'all', 'nutrient', ARRAY['VEGETATIVE','FLOWERING'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  const lowSoilK = input.soil_potassium === ''LOW'' || input.soil_potassium === ''VERY_LOW'';
  return symptoms.includes(''LEAF_EDGE_BURN'') || (symptoms.includes(''MARGINAL_NECROSIS'') && lowSoilK);
}',
'{"visual_symptoms": ["LEAF_EDGE_BURN", "MARGINAL_NECROSIS"], "soil_potassium": ["LOW", "VERY_LOW"]}'::jsonb,
'POTASSIUM_DEFICIENCY', 8, 'ICAR Soil Science', 'Potassium deficiency causes marginal leaf burn',
ARRAY[]::text[],
'🔥 पोटॅशियम कमतरता! पानांच्या कडा जळल्या.',
'🔥 पोटेशियम कमी! पत्तों के किनारे जले हुए हैं।',
'🔥 Potassium deficiency! Marginal leaf burn indicates K shortage.',
'RECOMMEND', 'nutrient', true, '2.0.0'),

-- WATER STRESS
('STRESS_WATER_OBS_001', 'all', 'all', 'stress', ARRAY['ALL'], 
'(input) => {
  const symptoms = input.visual_symptoms || [];
  const hasWilt = symptoms.includes(''WILTING_MIDDAY'') || symptoms.includes(''LEAF_ROLLING'');
  const lowNDVI = input.ndvi_level === ''LOW'' || input.ndvi_level === ''VERY_LOW'';
  return hasWilt || (symptoms.includes(''WILTING_MORNING'') && lowNDVI);
}',
'{"visual_symptoms": ["WILTING_MIDDAY", "LEAF_ROLLING", "WILTING_MORNING"], "ndvi_level": ["LOW", "VERY_LOW"]}'::jsonb,
'WATER_STRESS', 9, 'ICAR Water Management', 'Midday wilting and leaf rolling indicate water stress',
ARRAY[]::text[],
'💧 पाण्याचा ताण! पाने वळतात, दुपारी सुकतात.',
'💧 पानी का तनाव! पत्ते मुड़ रहे हैं, दोपहर में मुरझा रहे हैं।',
'💧 Water stress! Leaf rolling and midday wilting indicate water shortage.',
'RECOMMEND', 'stress', true, '2.0.0'),

-- SAFETY: Rain block
('SAFETY_RAIN_BLOCK_001', 'all', 'all', 'risk_safety', ARRAY['ALL'], 
'(input) => {
  const weather = input.weather || {};
  return weather.rain_mm > 5 || weather.rain_expected === true;
}',
'{"weather": {"rain_mm": ">5"}}'::jsonb,
'RAIN_SPRAY_BLOCKED', 10, 'IPM Guidelines', 'Rain washes off sprays reducing efficacy',
ARRAY[]::text[],
'⛈️ पाऊस असल्यामुळे फवारणी टाळा! 24-48 तास थांबा.',
'⛈️ बारिश के कारण स्प्रे न करें! 24-48 घंटे रुकें।',
'⛈️ Rain alert! Avoid spraying now - wait 24-48 hours for dry conditions.',
'BLOCK', 'safety', true, '2.0.0')

ON CONFLICT (rule_id) DO UPDATE SET 
  condition_code = EXCLUDED.condition_code,
  conditions_json = EXCLUDED.conditions_json,
  version = EXCLUDED.version,
  response_mr = EXCLUDED.response_mr,
  response_hi = EXCLUDED.response_hi,
  response_en = EXCLUDED.response_en,
  is_active = true;