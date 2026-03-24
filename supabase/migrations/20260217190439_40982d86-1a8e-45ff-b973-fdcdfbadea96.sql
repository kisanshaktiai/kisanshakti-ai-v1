-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE observation_translations display_text to FARMER-FRIENDLY descriptions
-- These describe WHAT THE FARMER SEES, not technical pest/disease names
-- Core observation_code values are NOT changed, only display text
-- ═══════════════════════════════════════════════════════════════════════════

-- EARLY_SHOOT_BORER - describe visual symptom, not pest name
UPDATE observation_translations SET display_text = 'Young plant central leaf dried, pulls out easily' WHERE observation_code = 'EARLY_SHOOT_BORER' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'छोटे पौधे की बीच की पत्ती सूखी, खींचने पर निकल जाती है' WHERE observation_code = 'EARLY_SHOOT_BORER' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'लहान रोपाची मधली पाने वाळली, ओढल्यास बाहेर येतात' WHERE observation_code = 'EARLY_SHOOT_BORER' AND language_code = 'mr';

-- DEAD_HEART_PRESENT
UPDATE observation_translations SET display_text = 'Central leaf dried, pulls out when pulled' WHERE observation_code = 'DEAD_HEART_PRESENT' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'बीच की पत्ती सूखी, खींचने पर निकल जाती है' WHERE observation_code = 'DEAD_HEART_PRESENT' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'मधली पाने सुकलेली, ओढल्यास बाहेर येतात' WHERE observation_code = 'DEAD_HEART_PRESENT' AND language_code = 'mr';

-- DEADHEART
UPDATE observation_translations SET display_text = 'Central shoot completely dead and dry' WHERE observation_code = 'DEADHEART' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'बीच का कोंपल पूरा सूख गया' WHERE observation_code = 'DEADHEART' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'मधला कोंब पूर्ण सुकून गेला' WHERE observation_code = 'DEADHEART' AND language_code = 'mr';

-- GAPS_IN_FIELD
UPDATE observation_translations SET display_text = 'Empty patches where plants should be' WHERE observation_code = 'GAPS_IN_FIELD' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'कुछ जगह पौधे नहीं उगे, खाली जगह दिखती है' WHERE observation_code = 'GAPS_IN_FIELD' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'काही ठिकाणी झाडे नाहीत, रिकाम्या जागा दिसतात' WHERE observation_code = 'GAPS_IN_FIELD' AND language_code = 'mr';

-- FRASS_VISIBLE - farmer-friendly instead of technical
UPDATE observation_translations SET display_text = 'Sawdust-like powder near stem base' WHERE observation_code = 'FRASS_VISIBLE' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'तने के पास भूसा जैसा पाउडर दिखता है' WHERE observation_code = 'FRASS_VISIBLE' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'खोडाजवळ भुशासारखी भुकटी दिसते' WHERE observation_code = 'FRASS_VISIBLE' AND language_code = 'mr';

-- HONEYDEW_PRESENT - describe what farmer feels
UPDATE observation_translations SET display_text = 'Leaves feel sticky to touch' WHERE observation_code = 'HONEYDEW_PRESENT' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'पत्ते छूने पर चिपचिपे लगते हैं' WHERE observation_code = 'HONEYDEW_PRESENT' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'पाने हाताला चिकट लागतात' WHERE observation_code = 'HONEYDEW_PRESENT' AND language_code = 'mr';

-- MUD_TUBES_PRESENT - remove (termite) from display
UPDATE observation_translations SET display_text = 'Mud/clay tubes on stem base or soil' WHERE observation_code = 'MUD_TUBES_PRESENT' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'तने के नीचे या मिट्टी पर मिट्टी की नलियां' WHERE observation_code = 'MUD_TUBES_PRESENT' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'खोडाच्या बुडाशी किंवा मातीवर मातीच्या नळ्या' WHERE observation_code = 'MUD_TUBES_PRESENT' AND language_code = 'mr';

-- INSECTS_VISIBLE - more farmer friendly
UPDATE observation_translations SET display_text = 'Small creatures/insects visible on plant' WHERE observation_code = 'INSECTS_VISIBLE' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'पौधे पर छोटे जीव / कीड़े दिखते हैं' WHERE observation_code = 'INSECTS_VISIBLE' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'झाडावर लहान जीव / किडे दिसतात' WHERE observation_code = 'INSECTS_VISIBLE' AND language_code = 'mr';

-- LARVAE_PRESENT - describe visual, not technical term
UPDATE observation_translations SET display_text = 'Worm-like creatures visible on/in plant' WHERE observation_code = 'LARVAE_PRESENT' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'पौधे पर / अंदर सूंडी जैसे जीव दिखते हैं' WHERE observation_code = 'LARVAE_PRESENT' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'झाडावर / आत अळीसारखे जीव दिसतात' WHERE observation_code = 'LARVAE_PRESENT' AND language_code = 'mr';

-- FIELD_WATERLOGGED
UPDATE observation_translations SET display_text = 'Water standing in field, not draining' WHERE observation_code = 'FIELD_WATERLOGGED' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'खेत में पानी भरा है, निकल नहीं रहा' WHERE observation_code = 'FIELD_WATERLOGGED' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'शेतात पाणी साचले आहे, जात नाही' WHERE observation_code = 'FIELD_WATERLOGGED' AND language_code = 'mr';

-- BORON_DEFICIENCY - describe visual, not nutrient name
UPDATE observation_translations SET display_text = 'New growth distorted, tips dying' WHERE observation_code = 'BORON_DEFICIENCY' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'नई वृद्धि विकृत, सिरे मर रहे' WHERE observation_code = 'BORON_DEFICIENCY' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'नवीन वाढ विकृत, टोके मरत आहेत' WHERE observation_code = 'BORON_DEFICIENCY' AND language_code = 'mr';

-- BORON_TOXICITY - describe visual
UPDATE observation_translations SET display_text = 'Leaf tips and edges turning brown/burnt' WHERE observation_code = 'BORON_TOXICITY' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'पत्तों के सिरे और किनारे भूरे / जले' WHERE observation_code = 'BORON_TOXICITY' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'पानांची टोके आणि कडा तपकिरी / करपलेल्या' WHERE observation_code = 'BORON_TOXICITY' AND language_code = 'mr';

-- DROUGHT_STRESS - farmer-friendly
UPDATE observation_translations SET display_text = 'Plants wilting due to lack of water' WHERE observation_code = 'DROUGHT_STRESS' AND language_code = 'en';
UPDATE observation_translations SET display_text = 'पानी की कमी से पौधे मुरझा रहे' WHERE observation_code = 'DROUGHT_STRESS' AND language_code = 'hi';
UPDATE observation_translations SET display_text = 'पाण्याच्या कमतरतेने झाडे कोमेजत आहेत' WHERE observation_code = 'DROUGHT_STRESS' AND language_code = 'mr';