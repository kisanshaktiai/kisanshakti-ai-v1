-- First insert missing codes into observation_master (FK parent)
INSERT INTO observation_master (observation_code, description, is_diagnostic, symptom_category) VALUES
('WEED_PRESENT', 'Weeds visible in field', true, 'weed'),
('WEED_HEAVY', 'Heavy weed infestation', true, 'weed'),
('WEED_ABOVE_CROP', 'Weeds taller than crop canopy', true, 'weed'),
('WEED_IN_ROWS', 'Weeds growing within crop rows', true, 'weed'),
('WEED_INFESTATION', 'Weed infestation affecting crop growth', true, 'weed'),
('BORON_TOXICITY', 'Leaf tip burn from excess boron', true, 'nutrition'),
('BORON_DEFICIENCY', 'Growth affected by low boron levels', true, 'nutrition'),
('VISUAL_CHECK', 'General visual crop inspection', false, 'general')
ON CONFLICT (observation_code) DO NOTHING;

-- Then insert translations for all 3 languages
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
('WEED_PRESENT', 'mr', 'तण दिसत आहेत', 'शेतात तण वाढलेले दिसतात'),
('WEED_PRESENT', 'hi', 'खरपतवार दिख रहे हैं', 'खेत में खरपतवार बढ़ रहे हैं'),
('WEED_PRESENT', 'en', 'Weeds visible', 'Weeds are growing in the field'),
('WEED_HEAVY', 'mr', 'तण खूप जास्त', 'तणांचा मोठा प्रादुर्भाव'),
('WEED_HEAVY', 'hi', 'खरपतवार बहुत ज्यादा', 'खरपतवार का भारी प्रकोप'),
('WEED_HEAVY', 'en', 'Heavy weed infestation', 'Severe weed competition present'),
('WEED_ABOVE_CROP', 'mr', 'तण पिकापेक्षा उंच', 'तण पिकाच्या उंचीपेक्षा जास्त वाढलेले'),
('WEED_ABOVE_CROP', 'hi', 'खरपतवार फसल से ऊंचे', 'खरपतवार फसल की ऊंचाई से ज्यादा बढ़ गए'),
('WEED_ABOVE_CROP', 'en', 'Weeds taller than crop', 'Weeds have grown above crop canopy'),
('WEED_IN_ROWS', 'mr', 'ओळीत तण', 'पिकाच्या ओळींमध्ये तण वाढलेले'),
('WEED_IN_ROWS', 'hi', 'कतार में खरपतवार', 'फसल की कतारों में खरपतवार'),
('WEED_IN_ROWS', 'en', 'Weeds in crop rows', 'Weeds growing within the crop rows'),
('WEED_INFESTATION', 'mr', 'तणांचा प्रादुर्भाव', 'तणांमुळे पिकाची वाढ खुंटली'),
('WEED_INFESTATION', 'hi', 'खरपतवार का प्रकोप', 'खरपतवार से फसल की वृद्धि रुकी'),
('WEED_INFESTATION', 'en', 'Weed infestation', 'Weeds affecting crop growth'),
('BORON_TOXICITY', 'mr', 'बोरॉन विषबाधा', 'जास्त बोरॉनमुळे पानांच्या टोकांना करपा'),
('BORON_TOXICITY', 'hi', 'बोरॉन विषाक्तता', 'अधिक बोरॉन से पत्तियों के किनारे जले'),
('BORON_TOXICITY', 'en', 'Boron toxicity', 'Leaf tip burn from excess boron'),
('BORON_DEFICIENCY', 'mr', 'बोरॉन कमतरता', 'बोरॉन कमी असल्यामुळे वाढ खुंटली'),
('BORON_DEFICIENCY', 'hi', 'बोरॉन की कमी', 'बोरॉन की कमी से वृद्धि रुकी'),
('BORON_DEFICIENCY', 'en', 'Boron deficiency', 'Growth affected by low boron'),
('VISUAL_CHECK', 'mr', 'पिकाची तपासणी करा', 'पिकाची बारकाईने तपासणी करा'),
('VISUAL_CHECK', 'hi', 'फसल की जाँच करें', 'फसल की बारीकी से जाँच करें'),
('VISUAL_CHECK', 'en', 'Check the crop', 'Carefully inspect the crop')
ON CONFLICT (observation_code, language_code) DO NOTHING;