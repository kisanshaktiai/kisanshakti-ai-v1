
-- ═══════════════════════════════════════════════════════════════════
-- DATA INTEGRITY FIX: Symbolic Decision Brain Tables (v2)
-- ═══════════════════════════════════════════════════════════════════

-- STEP 1: Add 5 orphaned codes to observation_master
INSERT INTO observation_master (observation_code, description, is_diagnostic, symptom_category)
VALUES
  ('LEAF_CHEWING', 'Leaves show irregular chewing marks from animals or large insects', true, 'physical_damage'),
  ('LEAF_DRYING', 'Leaves are drying out from edges or tips, often due to water stress', true, 'water_stress'),
  ('ROOTS_ROTTED', 'Roots are soft, discolored, and decayed when pulled out', true, 'root_disease'),
  ('SEEDLING_DIED', 'Seedlings have wilted and died after planting', true, 'germination'),
  ('STUNTED_PLANTS', 'Plants are significantly shorter than expected for their age', true, 'growth_disorder')
ON CONFLICT (observation_code) DO NOTHING;

-- STEP 2: Add 93 translations (26 existing codes + 5 new codes × 3 languages)
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
('APHID_INFESTATION','EN','Aphid Infestation','Tiny soft-bodied insects clustered on undersides of leaves, secreting sticky honeydew'),
('APHID_INFESTATION','HI','माहू का प्रकोप','पत्तियों के नीचे छोटे नरम कीड़ों का झुंड, चिपचिपा पदार्थ छोड़ते हैं'),
('APHID_INFESTATION','MR','माव्याचा प्रादुर्भाव','पानांच्या खालच्या बाजूला लहान मऊ किडे गोळा होतात, चिकट पदार्थ सोडतात'),
('BORER_DAMAGE','EN','Borer Damage','Bore holes visible in stems or shoots with frass nearby'),
('BORER_DAMAGE','HI','बोरर का नुकसान','तने या शाखाओं में छेद दिखाई देते हैं, पास में भूसे जैसा पदार्थ'),
('BORER_DAMAGE','MR','भुंग्याचे नुकसान','खोडात किंवा फुटव्यांमध्ये छिद्रे दिसतात, जवळ भुसासारखा पदार्थ'),
('CATERPILLAR_DAMAGE','EN','Caterpillar Damage','Leaves eaten with irregular holes, caterpillar droppings visible'),
('CATERPILLAR_DAMAGE','HI','इल्ली का नुकसान','पत्तियों में अनियमित छेद, इल्ली की बीट दिखाई देती है'),
('CATERPILLAR_DAMAGE','MR','अळीचे नुकसान','पानांमध्ये अनियमित छिद्रे, अळीची विष्ठा दिसते'),
('DELAYED_GERMINATION','EN','Delayed Germination','Seeds or setts have not sprouted within expected time after planting'),
('DELAYED_GERMINATION','HI','विलंबित अंकुरण','बुवाई के बाद अपेक्षित समय में बीज या सेट नहीं उगे'),
('DELAYED_GERMINATION','MR','उशीरा उगवण','लागवडीनंतर अपेक्षित वेळेत बियाणे किंवा बेणे उगवले नाहीत'),
('FUNGAL_GROWTH','EN','Fungal Growth','Visible white, grey, or black fuzzy growth on leaves, stems, or soil'),
('FUNGAL_GROWTH','HI','फफूंद की वृद्धि','पत्तियों, तनों या मिट्टी पर सफेद, भूरी या काली रोएँदार वृद्धि'),
('FUNGAL_GROWTH','MR','बुरशीची वाढ','पानांवर, खोडावर किंवा मातीवर पांढरी, राखाडी किंवा काळी केसाळ वाढ'),
('INSECT_EGGS','EN','Insect Eggs','Small round or oval eggs visible on leaf surfaces, usually in clusters'),
('INSECT_EGGS','HI','कीट के अंडे','पत्तियों पर छोटे गोल या अंडाकार अंडे दिखाई देते हैं'),
('INSECT_EGGS','MR','किडीची अंडी','पानांवर लहान गोल किंवा अंडाकृती अंडी दिसतात'),
('INTERNODE_BORER','EN','Internode Borer','Bore holes between nodes, red tunnels visible when stem split open'),
('INTERNODE_BORER','HI','इंटरनोड बोरर','गांठों के बीच छेद, चीरने पर लाल सुरंगें दिखाई देती हैं'),
('INTERNODE_BORER','MR','कांडी पोखरणारी अळी','पेऱ्यांमधील छिद्रे, चिरल्यावर लाल बोगदे दिसतात'),
('IRON_DEFICIENCY','EN','Iron Deficiency','Young leaves turn pale yellow to white while veins remain green'),
('IRON_DEFICIENCY','HI','लोहे की कमी','नई पत्तियाँ हल्की पीली से सफेद हो जाती हैं जबकि नसें हरी रहती हैं'),
('IRON_DEFICIENCY','MR','लोहाची कमतरता','नवीन पाने फिकट पिवळी ते पांढरी होतात, शिरा हिरव्या राहतात'),
('LEAF_CURLING','EN','Leaf Curling','Leaves curl inward or downward, edges roll up tightly'),
('LEAF_CURLING','HI','पत्ती मुड़ना','पत्तियाँ अंदर या नीचे की ओर मुड़ जाती हैं'),
('LEAF_CURLING','MR','पाने मुडणे','पाने आतल्या बाजूला किंवा खालच्या बाजूला मुडतात'),
('LEAF_HOLES','EN','Leaf Holes','Small to large holes in leaves from insect feeding or disease'),
('LEAF_HOLES','HI','पत्ती में छेद','कीट खाने या रोग के कारण पत्तियों में छेद'),
('LEAF_HOLES','MR','पानांमध्ये छिद्रे','किडींच्या खाण्यामुळे किंवा रोगामुळे पानांमध्ये छिद्रे'),
('LEAF_TIP_BURN','EN','Leaf Tip Burn','Tips and margins of leaves turn brown and dry'),
('LEAF_TIP_BURN','HI','पत्ती की नोक जलना','पत्तियों के सिरे और किनारे भूरे और सूखे हो जाते हैं'),
('LEAF_TIP_BURN','MR','पानांच्या टोकाची करपा','पानांची टोके आणि कडा तपकिरी व कोरड्या होतात'),
('LEAF_WEBBING','EN','Leaf Webbing','Fine silk-like webs visible between leaves from spider mites'),
('LEAF_WEBBING','HI','पत्तियों पर जाले','पत्तियों के बीच बारीक रेशम जैसे जाले दिखाई देते हैं'),
('LEAF_WEBBING','MR','पानांवर जाळे','पानांमध्ये बारीक रेशमासारखे जाळे दिसतात'),
('PHOSPHORUS_DEFICIENCY','EN','Phosphorus Deficiency','Leaves show purple or dark reddish discoloration on older leaves'),
('PHOSPHORUS_DEFICIENCY','HI','फास्फोरस की कमी','पत्तियों पर बैंगनी या गहरा लाल रंग दिखाई देता है'),
('PHOSPHORUS_DEFICIENCY','MR','स्फुरदाची कमतरता','पानांवर जांभळा किंवा गडद लालसर रंग दिसतो'),
('POOR_ROOT_DEVELOPMENT','EN','Poor Root Development','Roots are short, sparse, or poorly branched when uprooted'),
('POOR_ROOT_DEVELOPMENT','HI','खराब जड़ विकास','उखाड़ने पर जड़ें छोटी, विरल या कम शाखित दिखती हैं'),
('POOR_ROOT_DEVELOPMENT','MR','कमकुवत मूळ वाढ','उपटल्यावर मुळे लहान, विरळ किंवा कमी फांदलेली दिसतात'),
('POTASSIUM_DEFICIENCY','EN','Potassium Deficiency','Leaf margins turn brown and scorched, starting from older leaves'),
('POTASSIUM_DEFICIENCY','HI','पोटैशियम की कमी','पत्तियों के किनारे भूरे और झुलसे हो जाते हैं'),
('POTASSIUM_DEFICIENCY','MR','पालाशाची कमतरता','पानांच्या कडा तपकिरी व करपतात, जुन्या पानांपासून'),
('RED_ROT_SYMPTOMS','EN','Red Rot Symptoms','Splitting cane reveals red tissue with white patches, sour smell'),
('RED_ROT_SYMPTOMS','HI','लाल सड़न के लक्षण','गन्ना चीरने पर लाल ऊतक सफेद धब्बों के साथ, खट्टी गंध'),
('RED_ROT_SYMPTOMS','MR','तांबेरा रोगाची लक्षणे','ऊस चिरल्यावर लाल भाग पांढऱ्या ठिपक्यांसह, आंबट वास'),
('ROOT_DAMAGE','EN','Root Damage','Roots show physical damage or discoloration from pests or disease'),
('ROOT_DAMAGE','HI','जड़ क्षति','जड़ों में शारीरिक क्षति या कीट/रोग से रंग बदलाव'),
('ROOT_DAMAGE','MR','मुळांचे नुकसान','मुळांना शारीरिक नुकसान किंवा किडी/रोगामुळे रंग बदल'),
('ROOT_ROT','EN','Root Rot','Roots are brown or black, mushy, with foul smell when pulled out'),
('ROOT_ROT','HI','जड़ सड़न','जड़ें भूरी या काली, गूदेदार, उखाड़ने पर दुर्गंध'),
('ROOT_ROT','MR','मूळ कुज','मुळे तपकिरी किंवा काळी, मऊ, उपटल्यावर दुर्गंधी'),
('SMUT_SYMPTOMS','EN','Smut Symptoms','Black whip-like structure from top of cane, covered in dark spores'),
('SMUT_SYMPTOMS','HI','कंड रोग के लक्षण','गन्ने से काली चाबुक जैसी संरचना, गहरे बीजाणुओं से ढकी'),
('SMUT_SYMPTOMS','MR','काणी रोगाची लक्षणे','उसातून काळी चाबकासारखी रचना, गडद बीजाणूंनी झाकलेली'),
('STEM_DISCOLORATION','EN','Stem Discoloration','Stem shows brown, black, or red patches'),
('STEM_DISCOLORATION','HI','तना रंग बदलना','तने पर भूरे, काले या लाल धब्बे'),
('STEM_DISCOLORATION','MR','खोडाचा रंग बदलणे','खोडावर तपकिरी, काळे किंवा लाल डाग'),
('STEM_LESIONS','EN','Stem Lesions','Visible wounds, cankers, or sunken areas on stem'),
('STEM_LESIONS','HI','तना घाव','तने पर दिखाई देने वाले घाव या धंसे हुए क्षेत्र'),
('STEM_LESIONS','MR','खोडावरील व्रण','खोडावर दिसणारे घाव किंवा खोलगेलेले भाग'),
('STEM_ROT','EN','Stem Rot','Stem becomes soft, mushy, and discolored with foul smell'),
('STEM_ROT','HI','तना सड़न','तना नरम, गूदेदार और रंग बदला हुआ, दुर्गंध के साथ'),
('STEM_ROT','MR','खोड कुज','खोड मऊ, लगदा होतो, रंग बदलतो, दुर्गंधीसह'),
('STEM_WILTING','EN','Stem Wilting','Main stem droops and loses rigidity, often one-sided'),
('STEM_WILTING','HI','तना मुरझाना','मुख्य तना झुक जाता है और कठोरता खो देता है'),
('STEM_WILTING','MR','खोड सुकणे','मुख्य खोड लोंबतो आणि कडकपणा गमावतो'),
('TOP_BORER','EN','Top Borer','Dead heart in growing point, central shoot dries out'),
('TOP_BORER','HI','शीर्ष बोरर','बढ़ते बिंदु में मृत हृदय, केंद्रीय अंकुर सूख जाता है'),
('TOP_BORER','MR','शेंडा पोखरणारी अळी','वाढत्या बिंदूत मृत हृदय, मध्यवर्ती कोंब सुकतो'),
('WATERLOGGING_SIGNS','EN','Waterlogging Signs','Standing water in field, yellowing lower leaves, roots turning black'),
('WATERLOGGING_SIGNS','HI','जलभराव के संकेत','खेत में पानी भरा, निचली पत्तियाँ पीली, जड़ें काली'),
('WATERLOGGING_SIGNS','MR','पाणी साचण्याची चिन्हे','शेतात पाणी साचलेले, खालची पाने पिवळी, मुळे काळी'),
('WILT_SYMPTOMS','EN','Wilt Symptoms','Entire plant droops despite adequate soil moisture'),
('WILT_SYMPTOMS','HI','मुरझान के लक्षण','पर्याप्त नमी के बावजूद पूरा पौधा मुरझा जाता है'),
('WILT_SYMPTOMS','MR','मर रोगाची लक्षणे','पुरेशी ओलावा असूनही संपूर्ण रोप सुकते'),
('LEAF_CHEWING','EN','Leaf Chewing','Large irregular bite marks on leaves from animals'),
('LEAF_CHEWING','HI','पत्ती चबाना','जानवरों द्वारा पत्तियों पर बड़े अनियमित काटने के निशान'),
('LEAF_CHEWING','MR','पाने चावणे','प्राण्यांनी पानांवर मोठे अनियमित चावण्याचे निशान'),
('LEAF_DRYING','EN','Leaf Drying','Leaves drying from tips and edges inward, turning brown and crispy'),
('LEAF_DRYING','HI','पत्ती सूखना','पत्तियाँ सिरों से अंदर की ओर सूख रही हैं'),
('LEAF_DRYING','MR','पाने सुकणे','पाने टोकांपासून आतील बाजूला सुकत आहेत'),
('ROOTS_ROTTED','EN','Roots Rotted','Roots completely decayed, plant easily pulled from soil'),
('ROOTS_ROTTED','HI','जड़ें सड़ी हुई','जड़ें पूरी तरह सड़ गई हैं, पौधा आसानी से निकलता है'),
('ROOTS_ROTTED','MR','मुळे कुजलेली','मुळे पूर्णपणे कुजलेली, रोप सहजपणे बाहेर येते'),
('SEEDLING_DIED','EN','Seedling Died','Young seedlings wilted completely and turned brown after planting'),
('SEEDLING_DIED','HI','पौध मर गया','छोटे पौधे रोपाई के बाद पूरी तरह मुरझा गए'),
('SEEDLING_DIED','MR','रोपे मेली','लहान रोपे लागवडीनंतर पूर्णपणे सुकली'),
('STUNTED_PLANTS','EN','Stunted Plants','Plants noticeably shorter than neighbors of same age'),
('STUNTED_PLANTS','HI','बौने पौधे','पौधे समान उम्र के पड़ोसी पौधों से काफी छोटे'),
('STUNTED_PLANTS','MR','खुरटलेली रोपे','रोपे समान वयाच्या शेजारच्या रोपांपेक्षा लहान')
ON CONFLICT DO NOTHING;

-- STEP 3: Consolidate DEADHEART -> DEAD_HEART_PRESENT
-- Must update ALL referencing tables before deleting from master

-- 3a: Update intent_observation_mapping (v1) 
UPDATE intent_observation_mapping
SET observation_code = 'DEAD_HEART_PRESENT'
WHERE observation_code = 'DEADHEART';

-- 3b: Update intent_observation_mapping_v2
UPDATE intent_observation_mapping_v2
SET observation_code = 'DEAD_HEART_PRESENT'
WHERE observation_code = 'DEADHEART';

-- 3c: Delete DEADHEART translations
DELETE FROM observation_translations WHERE observation_code = 'DEADHEART';

-- 3d: Now safe to remove DEADHEART from observation_master
DELETE FROM observation_master WHERE observation_code = 'DEADHEART';

-- STEP 4: Normalize observation codes in decision_rules to UPPERCASE + consolidate DEAD_HEART
DO $$
DECLARE
  r RECORD;
  obs_array jsonb;
  new_obs jsonb;
  obs_val text;
BEGIN
  FOR r IN 
    SELECT id, conditions_json 
    FROM decision_rules 
    WHERE conditions_json ? 'observations'
      AND jsonb_typeof(conditions_json->'observations') = 'array'
  LOOP
    obs_array := r.conditions_json->'observations';
    new_obs := '[]'::jsonb;
    
    FOR obs_val IN SELECT jsonb_array_elements_text(obs_array)
    LOOP
      obs_val := UPPER(obs_val);
      IF obs_val IN ('DEAD_HEART', 'DEADHEART', 'DEAD_HEART_IN_GROWN_CANE') THEN
        obs_val := 'DEAD_HEART_PRESENT';
      END IF;
      IF NOT new_obs @> to_jsonb(obs_val) THEN
        new_obs := new_obs || to_jsonb(obs_val);
      END IF;
    END LOOP;
    
    UPDATE decision_rules 
    SET conditions_json = jsonb_set(conditions_json, '{observations}', new_obs)
    WHERE id = r.id;
  END LOOP;
END $$;
