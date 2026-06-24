UPDATE proactive_alerts pa
SET trigger_data = pa.trigger_data || jsonb_build_object(
  'area_acres', l.area_acres,
  'soil_type', l.soil_type,
  'irrigation_method', l.irrigation_type,
  'crop', l.current_crop,
  'solution', jsonb_build_object(
    'problem_en', format('Satellite data shows crop health decline (NDVI: %s) on %s (%s acres). This indicates possible water stress, nutrient deficiency, or pest/disease damage.', 
      (pa.trigger_data->>'ndvi')::text, l.name, l.area_acres::text),
    'problem_mr', format('%s %s एकर शेतातील पिकाचे उपग्रह आरोग्य (NDVI: %s) कमी झाले आहे. पाणी कमतरता, अन्नद्रव्य कमतरता किंवा कीड-रोगामुळे असू शकते.', 
      l.name, l.area_acres::text, (pa.trigger_data->>'ndvi')::text),
    'problem_hi', format('%s %s एकड़ खेत में उपग्रह फसल स्वास्थ्य (NDVI: %s) कम हुआ है. पानी की कमी, पोषक तत्वों की कमी या कीट-रोग के कारण हो सकता है.', 
      l.name, l.area_acres::text, (pa.trigger_data->>'ndvi')::text),
    'cause_en', format('NDVI value %s is below the healthy threshold of 0.3. Soil type: %s. Irrigation: %s.', 
      (pa.trigger_data->>'ndvi')::text, COALESCE(l.soil_type, 'unknown'), COALESCE(l.irrigation_type, 'unknown')),
    'cause_mr', format('NDVI %s म्हणजे पिकाची प्रकाशसंश्लेषण क्रिया कमी झाली. माती: %s. सिंचन: %s.', 
      (pa.trigger_data->>'ndvi')::text, COALESCE(l.soil_type, '--'), COALESCE(l.irrigation_type, '--')),
    'cause_hi', format('NDVI %s यानी फसल की प्रकाश संश्लेषण गतिविधि कम हुई. मिट्टी: %s. सिंचाई: %s.', 
      (pa.trigger_data->>'ndvi')::text, COALESCE(l.soil_type, '--'), COALESCE(l.irrigation_type, '--')),
    'steps_en', '["Inspect the field for visible stress signs: wilting, yellowing, or dry patches", "Check soil moisture level by pressing soil between fingers", "If dry, irrigate immediately based on your field method", "If stress persists after 5 days, take a photo and consult via AI Chat"]'::jsonb,
    'steps_mr', '["शेतात जाऊन पिकाची स्थिती तपासा — पाने पिवळी, सुकलेली किंवा कोमेजलेली आहेत का पहा", "जमिनीतील ओलावा तपासा — माती बोटांनी दाबून ओलसर आहे का पहा", "कोरडे असल्यास ताबडतोब सिंचन करा", "5 दिवसांनी सुधारणा नसल्यास फोटो काढून AI चॅटवर विचारा"]'::jsonb,
    'steps_hi', '["खेत में जाकर फसल की स्थिति जांचें — पत्तियां पीली, सूखी या मुरझाई हुई हैं क्या देखें", "मिट्टी की नमी जांचें — उंगलियों से दबाकर देखें", "सूखी हो तो तुरंत सिंचाई करें", "5 दिन बाद सुधार न हो तो फोटो लेकर AI चैट पर पूछें"]'::jsonb,
    'safety_en', 'If applying any chemical treatment, wear gloves and mask. Do not spray during windy conditions.',
    'safety_mr', 'कोणतीही रासायनिक फवारणी करताना हातमोजे आणि मास्क वापरा. वाऱ्यात फवारणी करू नका.',
    'safety_hi', 'कोई भी रासायनिक छिड़काव करते समय दस्ताने और मास्क पहनें. हवा में छिड़काव न करें.',
    'organic_alt_en', 'Apply vermicompost (500 kg/acre) or jeevamrut (200 liters/acre) to boost soil biology and crop recovery.',
    'organic_alt_mr', 'गांडूळखत (500 किलो/एकर) किंवा जीवामृत (200 लिटर/एकर) वापरा.',
    'organic_alt_hi', 'वर्मीकम्पोस्ट (500 किलो/एकड़) या जीवामृत (200 लीटर/एकड़) डालें.',
    'expected_benefit_en', format('With proper irrigation and care, crop health on %s should improve within 7-10 days.', l.name),
    'expected_benefit_mr', format('योग्य सिंचन आणि काळजीने %s शेतातील पिकाचे आरोग्य 7-10 दिवसांत सुधारेल.', l.name),
    'expected_benefit_hi', format('उचित सिंचाई और देखभाल से %s खेत में फसल स्वास्थ्य 7-10 दिनों में सुधरेगा.', l.name),
    'followup_en', format('Re-check %s after 5-7 days. Look for greener leaves and new growth.', l.name),
    'followup_mr', format('5-7 दिवसांनी %s शेत पुन्हा तपासा. हिरवी पाने आणि नवी वाढ दिसायला हवी.', l.name),
    'followup_hi', format('5-7 दिन बाद %s खेत फिर जांचें. हरी पत्तियां और नई वृद्धि दिखनी चाहिए.', l.name)
  )
)
FROM lands l
WHERE pa.land_id = l.id
  AND NOT (pa.trigger_data ? 'solution');