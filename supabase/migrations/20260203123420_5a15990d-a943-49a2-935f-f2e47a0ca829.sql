-- Add missing observation codes to observation_master
-- These are required for SSOT clarification options

INSERT INTO observation_master (observation_code, description, is_diagnostic) VALUES
  ('INSECTS_VISIBLE', 'Small insects visible on plant', true),
  ('LARVAE_PRESENT', 'Caterpillar or grub larvae present', true),
  ('STEM_BORING_MARKS', 'Entry/exit holes visible on stem', true),
  ('SLOW_GROWTH', 'Plant growing slower than expected', false),
  ('FIELD_WATERLOGGED', 'Standing water in field', false),
  ('SOIL_TOO_DRY', 'Soil is very dry', false),
  ('PHOTO_REQUEST', 'Request for photo upload', false),
  ('DEAD_HEART_PRESENT', 'Central whorl dried and pulls out easily', true),
  ('MUD_TUBES_PRESENT', 'Termite mud tubes visible in soil', true),
  ('HONEYDEW_PRESENT', 'Sticky substance on leaves from insects', true),
  ('FRASS_VISIBLE', 'Insect excreta near stem or leaves', true),
  ('ROOT_ROTTED', 'Roots are rotted or blackened', true)
ON CONFLICT (observation_code) DO NOTHING;

-- Now add translations for all observation codes
-- English translations
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
  ('INSECTS_VISIBLE', 'en', 'Insects visible', 'Small insects visible on plant'),
  ('LARVAE_PRESENT', 'en', 'Larvae visible', 'Caterpillar or grub larvae present'),
  ('STEM_BORING_MARKS', 'en', 'Bore holes in stem', 'Entry/exit holes visible on stem'),
  ('SLOW_GROWTH', 'en', 'Slow growth', 'Plant growing slower than expected'),
  ('STUNTED_GROWTH', 'en', 'Stunted growth', 'Plant is shorter than normal'),
  ('FIELD_WATERLOGGED', 'en', 'Waterlogged field', 'Standing water in field'),
  ('SOIL_TOO_DRY', 'en', 'Dry soil', 'Soil is very dry'),
  ('POOR_TILLERING', 'en', 'Poor tillering', 'Less tillers than expected'),
  ('PHOTO_REQUEST', 'en', 'Send photo', 'Take and send a photo'),
  ('DEAD_HEART_PRESENT', 'en', 'Dead heart visible', 'Central whorl dried and pulls out'),
  ('LEAF_YELLOWING', 'en', 'Leaf yellowing', 'Leaves turning yellow'),
  ('LEAF_SPOTS', 'en', 'Leaf spots', 'Spots or lesions on leaves'),
  ('LEAF_WILTING', 'en', 'Wilting leaves', 'Leaves drooping or wilting'),
  ('ROOT_ROTTED', 'en', 'Root rot', 'Roots are rotted or blackened'),
  ('MUD_TUBES_PRESENT', 'en', 'Mud tubes visible', 'Termite mud tubes in soil'),
  ('HONEYDEW_PRESENT', 'en', 'Honeydew present', 'Sticky substance on leaves'),
  ('FRASS_VISIBLE', 'en', 'Frass visible', 'Insect excreta near stem'),
  ('VISIBLE_INSECTS', 'en', 'Insects visible', 'Insects visible on plant')
ON CONFLICT (observation_code, language_code) DO UPDATE SET 
  display_text = EXCLUDED.display_text,
  description_text = EXCLUDED.description_text;

-- Marathi translations
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
  ('INSECTS_VISIBLE', 'mr', 'किडे दिसतात', 'रोपावर लहान किडे दिसतात'),
  ('LARVAE_PRESENT', 'mr', 'अळ्या दिसतात', 'पोंग्यात किंवा मुळांजवळ अळ्या'),
  ('STEM_BORING_MARKS', 'mr', 'खोडात छिद्र', 'खोडावर छिद्र दिसते'),
  ('SLOW_GROWTH', 'mr', 'वाढ मंद', 'पीक अपेक्षेपेक्षा कमी वाढते'),
  ('STUNTED_GROWTH', 'mr', 'वाढ खुंटली', 'रोप अपेक्षेपेक्षा लहान आहे'),
  ('FIELD_WATERLOGGED', 'mr', 'पाणी साचले', 'शेतात पाणी साचलेले'),
  ('SOIL_TOO_DRY', 'mr', 'माती कोरडी', 'माती खूप कोरडी आहे'),
  ('POOR_TILLERING', 'mr', 'कमी फुटवे', 'अपेक्षेपेक्षा कमी फुटवे'),
  ('PHOTO_REQUEST', 'mr', 'फोटो पाठवा', 'प्रभावित भागाचा फोटो काढा'),
  ('DEAD_HEART_PRESENT', 'mr', 'मधली सुरळी सुकलेली', 'मधली सुरळी सुकलेली / ओढल्यास बाहेर येते'),
  ('LEAF_YELLOWING', 'mr', 'पाने पिवळी', 'पाने पिवळी पडत आहेत'),
  ('LEAF_SPOTS', 'mr', 'पानांवर डाग', 'पानांवर डाग किंवा ठिपके'),
  ('LEAF_WILTING', 'mr', 'पाने कोमेजली', 'पाने कोमेजलेली किंवा वाळलेली'),
  ('ROOT_ROTTED', 'mr', 'मुळे सडलेली', 'मुळे सडलेली किंवा काळी'),
  ('MUD_TUBES_PRESENT', 'mr', 'वाळवीचे बोगदे', 'मातीत वाळवीचे बोगदे दिसतात'),
  ('HONEYDEW_PRESENT', 'mr', 'चिकट पदार्थ', 'पानांवर चिकट पदार्थ'),
  ('FRASS_VISIBLE', 'mr', 'भुसा दिसतो', 'खोडाजवळ भुसा दिसतो'),
  ('VISIBLE_INSECTS', 'mr', 'किडे दिसतात', 'पिकावर किडे दिसतात')
ON CONFLICT (observation_code, language_code) DO UPDATE SET 
  display_text = EXCLUDED.display_text,
  description_text = EXCLUDED.description_text;

-- Hindi translations
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
  ('INSECTS_VISIBLE', 'hi', 'कीड़े दिखते हैं', 'पौधे पर छोटे कीड़े दिखते हैं'),
  ('LARVAE_PRESENT', 'hi', 'इल्ली दिखती है', 'तने या जड़ों के पास इल्ली'),
  ('STEM_BORING_MARKS', 'hi', 'तने में छेद', 'तने पर छेद दिखता है'),
  ('SLOW_GROWTH', 'hi', 'धीमी वृद्धि', 'फसल अपेक्षा से कम बढ़ रही'),
  ('STUNTED_GROWTH', 'hi', 'रुकी हुई वृद्धि', 'पौधा अपेक्षा से छोटा है'),
  ('FIELD_WATERLOGGED', 'hi', 'पानी भरा', 'खेत में पानी जमा है'),
  ('SOIL_TOO_DRY', 'hi', 'मिट्टी सूखी', 'मिट्टी बहुत सूखी है'),
  ('POOR_TILLERING', 'hi', 'कम कल्ले', 'अपेक्षा से कम कल्ले'),
  ('PHOTO_REQUEST', 'hi', 'फोटो भेजें', 'प्रभावित हिस्से की फोटो लें'),
  ('DEAD_HEART_PRESENT', 'hi', 'बीच की पत्ती सूखी', 'बीच की पत्ती सूखी / खींचने पर निकल जाती है'),
  ('LEAF_YELLOWING', 'hi', 'पत्ते पीले', 'पत्ते पीले पड़ रहे हैं'),
  ('LEAF_SPOTS', 'hi', 'पत्तों पर धब्बे', 'पत्तों पर धब्बे या चकत्ते'),
  ('LEAF_WILTING', 'hi', 'पत्ते मुरझाए', 'पत्ते मुरझाए या सूखे'),
  ('ROOT_ROTTED', 'hi', 'जड़ें सड़ी', 'जड़ें सड़ी या काली'),
  ('MUD_TUBES_PRESENT', 'hi', 'दीमक की सुरंग', 'मिट्टी में दीमक की सुरंग'),
  ('HONEYDEW_PRESENT', 'hi', 'चिपचिपा पदार्थ', 'पत्तों पर चिपचिपा पदार्थ'),
  ('FRASS_VISIBLE', 'hi', 'भूसा दिखता है', 'तने के पास भूसा दिखता है'),
  ('VISIBLE_INSECTS', 'hi', 'कीड़े दिखते हैं', 'पौधे पर कीड़े दिखते हैं')
ON CONFLICT (observation_code, language_code) DO UPDATE SET 
  display_text = EXCLUDED.display_text,
  description_text = EXCLUDED.description_text;