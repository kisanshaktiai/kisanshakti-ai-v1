
-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1: Insert missing observation codes into observation_master
-- These are generic pest/disease/symptom/action names used by the 
-- FALLBACK_TRANSLATIONS and diagnostic-options-i18n that need DB backing
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_master (observation_code, description, observation_category, is_diagnostic, is_active) VALUES
-- Pests (generic names)
('SHOOT_BORER', 'Generic shoot borer pest', 'PEST', false, true),
('STEM_BORER', 'Generic stem borer pest', 'PEST', false, true),
('ROOT_BORER', 'Root borer pest', 'PEST', false, true),
('TERMITE', 'Termite pest', 'PEST', false, true),
('APHID', 'Aphid pest', 'PEST', false, true),
('WHITEFLY', 'Whitefly pest', 'PEST', false, true),
('THRIPS', 'Thrips pest', 'PEST', false, true),
('JASSID', 'Jassid/leaf hopper pest', 'PEST', false, true),
('BOLLWORM', 'Bollworm pest', 'PEST', false, true),
('MEALYBUG', 'Mealybug pest', 'PEST', false, true),
('PYRILLA', 'Pyrilla leaf hopper pest', 'PEST', false, true),
('WOOLLY_APHID', 'Woolly aphid pest', 'PEST', false, true),
('SCALE_INSECT', 'Scale insect pest', 'PEST', false, true),
('WHITE_GRUB', 'White grub pest', 'PEST', false, true),
-- Diseases (generic names)
('RED_ROT', 'Red rot fungal disease', 'DISEASE', false, true),
('SMUT', 'Smut/whip smut disease', 'DISEASE', false, true),
('WILT', 'Wilt disease', 'DISEASE', false, true),
('RUST', 'Rust disease', 'DISEASE', false, true),
('BLAST', 'Blast disease', 'DISEASE', false, true),
('BLIGHT', 'Blight disease', 'DISEASE', false, true),
('LEAF_SPOT', 'Leaf spot disease', 'DISEASE', false, true),
('LEAF_SCALD', 'Leaf scald disease', 'DISEASE', false, true),
('RATOON_STUNTING', 'Ratoon stunting disease', 'DISEASE', false, true),
('POWDERY_MILDEW', 'Powdery mildew disease', 'DISEASE', false, true),
('DOWNY_MILDEW', 'Downy mildew disease', 'DISEASE', false, true),
('GRASSY_SHOOT', 'Grassy shoot disease', 'DISEASE', false, true),
-- Symptoms
('DEAD_HEART', 'Dead heart symptom', 'PHYSIOLOGY', true, true),
('YELLOWING', 'Leaf yellowing symptom', 'PHYSIOLOGY', false, true),
('WILTING', 'Plant wilting symptom', 'PHYSIOLOGY', false, true),
('STUNTED_GROWTH', 'Stunted growth symptom', 'PHYSIOLOGY', false, true),
('DRYING', 'Plant drying symptom', 'PHYSIOLOGY', false, true),
-- Actions (used as translation keys for action labels)
('MONITOR', 'Monitor/observe action', 'MANAGEMENT', false, true),
('SPRAY', 'Spray treatment action', 'MANAGEMENT', false, true),
('APPLY', 'Apply treatment action', 'MANAGEMENT', false, true),
('REMOVE', 'Remove affected parts action', 'MANAGEMENT', false, true),
('IRRIGATE', 'Irrigation action', 'MANAGEMENT', false, true),
-- Diagnostic options
('WATERLOGGING_DAMAGE', 'Waterlogging damage', 'ABIOTIC', false, true),
('PHOTO_UPLOAD', 'Photo upload request', 'MANAGEMENT', false, true),
('LARVAE_VISIBLE', 'Larvae visible in stem or near roots', 'PEST', true, true)
ON CONFLICT (observation_code) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2: Insert translations for all the above codes
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
-- SHOOT_BORER
('SHOOT_BORER', 'en', 'Shoot Borer', 'Borer attacking young shoots'),
('SHOOT_BORER', 'mr', 'अंकुर बेधक (खोड किडा)', 'लहान फुटव्यांवर हल्ला करणारा किडा'),
('SHOOT_BORER', 'hi', 'अंकुर बेधक (तना छेदक)', 'युवा अंकुरों पर हमला करने वाला कीट'),
-- STEM_BORER
('STEM_BORER', 'en', 'Stem Borer', 'Borer inside the stem'),
('STEM_BORER', 'mr', 'खोड किडा', 'खोडात शिरणारा किडा'),
('STEM_BORER', 'hi', 'तना छेदक', 'तने के अंदर घुसने वाला कीट'),
-- ROOT_BORER
('ROOT_BORER', 'en', 'Root Borer', 'Borer attacking roots'),
('ROOT_BORER', 'mr', 'मूळ बेधक', 'मुळांवर हल्ला करणारा किडा'),
('ROOT_BORER', 'hi', 'जड़ बेधक', 'जड़ों पर हमला करने वाला कीट'),
-- TERMITE
('TERMITE', 'en', 'Termite', 'Termite damage to plant/soil'),
('TERMITE', 'mr', 'वाळवी (उधई)', 'वाळवीमुळे पिकाचे/मातीचे नुकसान'),
('TERMITE', 'hi', 'दीमक', 'दीमक से पौधे/मिट्टी को नुकसान'),
-- APHID
('APHID', 'en', 'Aphid', 'Small sap-sucking insects on leaves'),
('APHID', 'mr', 'मावा', 'पानांवरील रस शोषणारे लहान किडे'),
('APHID', 'hi', 'माहूं', 'पत्तों पर रस चूसने वाले छोटे कीट'),
-- WHITEFLY
('WHITEFLY', 'en', 'Whitefly', 'Small white flying insects under leaves'),
('WHITEFLY', 'mr', 'पांढरी माशी', 'पानांखालील लहान पांढऱ्या उडणाऱ्या माश्या'),
('WHITEFLY', 'hi', 'सफेद मक्खी', 'पत्तों के नीचे छोटी सफेद उड़ने वाली मक्खियां'),
-- THRIPS
('THRIPS', 'en', 'Thrips', 'Tiny insects causing silvering on leaves'),
('THRIPS', 'mr', 'तुडतुडे', 'पानांवर चंदेरी पट्टे करणारे लहान किडे'),
('THRIPS', 'hi', 'थ्रिप्स', 'पत्तों पर चांदी जैसी चमक पैदा करने वाले कीट'),
-- JASSID
('JASSID', 'en', 'Jassid', 'Leaf hopper causing leaf curling'),
('JASSID', 'mr', 'तुडतुडा', 'पानं गुंडाळणारा किडा'),
('JASSID', 'hi', 'जैसिड', 'पत्ती मोड़ने वाला कीट'),
-- BOLLWORM
('BOLLWORM', 'en', 'Bollworm', 'Caterpillar attacking bolls/fruits'),
('BOLLWORM', 'mr', 'बोंड अळी', 'बोंडं/फळं खाणारी अळी'),
('BOLLWORM', 'hi', 'बॉलवर्म', 'बॉल/फलों पर हमला करने वाली इल्ली'),
-- MEALYBUG
('MEALYBUG', 'en', 'Mealybug', 'White cottony insect clusters'),
('MEALYBUG', 'mr', 'मिलिबग', 'पांढरे कापसासारखे किडे'),
('MEALYBUG', 'hi', 'मिलीबग', 'सफेद रुई जैसे कीट'),
-- PYRILLA
('PYRILLA', 'en', 'Pyrilla (Leaf Hopper)', 'Leaf hopper pest'),
('PYRILLA', 'mr', 'पायरिला (तुडतुडा)', 'पानांवरील उडणारा किडा'),
('PYRILLA', 'hi', 'पायरिला', 'पत्ती का फुदका कीट'),
-- WOOLLY_APHID
('WOOLLY_APHID', 'en', 'Woolly Aphid', 'Woolly white aphid pest'),
('WOOLLY_APHID', 'mr', 'लोकरी माव', 'लोकरीसारखे पांढरे मावा किडे'),
('WOOLLY_APHID', 'hi', 'ऊनी माहू', 'रुई जैसा सफेद माहू कीट'),
-- SCALE_INSECT
('SCALE_INSECT', 'en', 'Scale Insect', 'Scale-covered insect pest'),
('SCALE_INSECT', 'mr', 'खवले किडा', 'खवल्यांनी झाकलेला किडा'),
('SCALE_INSECT', 'hi', 'शल्क कीट', 'शल्क से ढका कीट'),
-- WHITE_GRUB
('WHITE_GRUB', 'en', 'White Grub', 'White grub larva in soil'),
('WHITE_GRUB', 'mr', 'पांढरी हुमणी', 'मातीतील पांढरी अळी'),
('WHITE_GRUB', 'hi', 'सफेद गिडार', 'मिट्टी में सफेद लार्वा'),
-- RED_ROT
('RED_ROT', 'en', 'Red Rot', 'Fungal disease causing red discoloration in stem'),
('RED_ROT', 'mr', 'तांबडा कूज (रेड रॉट)', 'खोडात तांबडा रंग आणणारा बुरशीजन्य रोग'),
('RED_ROT', 'hi', 'लाल सड़न', 'तने में लाल रंग पैदा करने वाला फफूंद रोग'),
-- SMUT
('SMUT', 'en', 'Smut (Whip Smut)', 'Black whip-like growth from plant top'),
('SMUT', 'mr', 'काणी (स्मट)', 'झाडाच्या शेंड्यातून येणारी काळी चाबूकसारखी वाढ'),
('SMUT', 'hi', 'कंडुआ', 'पौधे के ऊपर से निकलने वाली काली चाबुक जैसी वृद्धि'),
-- WILT
('WILT', 'en', 'Wilt', 'Plant wilting and dying'),
('WILT', 'mr', 'मर रोग', 'झाडं मलूल होऊन मरणे'),
('WILT', 'hi', 'उकठा', 'पौधा मुरझाकर मर जाना'),
-- RUST
('RUST', 'en', 'Rust', 'Orange-brown pustules on leaves'),
('RUST', 'mr', 'तांबेरा', 'पानांवर नारिंगी-तपकिरी फोड'),
('RUST', 'hi', 'रतुआ', 'पत्तों पर नारंगी-भूरे दाने'),
-- BLAST
('BLAST', 'en', 'Blast', 'Fungal disease causing lesions'),
('BLAST', 'mr', 'करपा', 'जखमा निर्माण करणारा बुरशीजन्य रोग'),
('BLAST', 'hi', 'ब्लास्ट', 'घाव पैदा करने वाला फफूंद रोग'),
-- BLIGHT
('BLIGHT', 'en', 'Blight', 'Rapid browning and death of tissue'),
('BLIGHT', 'mr', 'करपा', 'पानं/देठांचे जलद तपकिरी होणे'),
('BLIGHT', 'hi', 'झुलसा', 'पत्तों/तनों का तेजी से भूरा होना'),
-- LEAF_SPOT
('LEAF_SPOT', 'en', 'Leaf Spot', 'Circular spots on leaves'),
('LEAF_SPOT', 'mr', 'पान ठिपके', 'पानांवर गोलाकार ठिपके'),
('LEAF_SPOT', 'hi', 'पत्ती धब्बा', 'पत्तों पर गोल धब्बे'),
-- LEAF_SCALD
('LEAF_SCALD', 'en', 'Leaf Scald', 'Scalding/burning of leaf edges'),
('LEAF_SCALD', 'mr', 'पान भाजणे', 'पानांच्या कडा भाजणे'),
('LEAF_SCALD', 'hi', 'पत्ती झुलसा', 'पत्ती के किनारे जलना'),
-- GRASSY_SHOOT
('GRASSY_SHOOT', 'en', 'Grassy Shoot Disease', 'Grassy shoot phytoplasma disease'),
('GRASSY_SHOOT', 'mr', 'गवती फुटवे', 'गवतासारखी वाढ रोग'),
('GRASSY_SHOOT', 'hi', 'घासी पोंगा', 'घास जैसी वृद्धि रोग'),
-- RATOON_STUNTING
('RATOON_STUNTING', 'en', 'Ratoon Stunting Disease', 'Bacterial disease causing stunted ratoon growth'),
('RATOON_STUNTING', 'mr', 'खोडवा खुंटणे', 'खोडव्याची वाढ खुंटवणारा जिवाणूजन्य रोग'),
('RATOON_STUNTING', 'hi', 'रेटून स्टंटिंग', 'पेड़ी की वृद्धि रोकने वाला जीवाणु रोग'),
-- POWDERY_MILDEW
('POWDERY_MILDEW', 'en', 'Powdery Mildew', 'White powdery coating on leaves'),
('POWDERY_MILDEW', 'mr', 'भुरी', 'पानांवर पांढरा भुरकट थर'),
('POWDERY_MILDEW', 'hi', 'चूर्णिल आसिता', 'पत्तों पर सफेद चूर्ण जैसा लेप'),
-- DOWNY_MILDEW
('DOWNY_MILDEW', 'en', 'Downy Mildew', 'Downy growth on leaf undersides'),
('DOWNY_MILDEW', 'mr', 'केवडा', 'पानांच्या खालच्या बाजूस मऊ वाढ'),
('DOWNY_MILDEW', 'hi', 'मृदुरोमिल आसिता', 'पत्तों के नीचे मुलायम वृद्धि'),
-- DEAD_HEART
('DEAD_HEART', 'en', 'Dead Heart', 'Central whorl dried and pulls out'),
('DEAD_HEART', 'mr', 'मेलेला गाभा (डेड हार्ट)', 'मधली सुरळी सुकलेली ओढल्यास बाहेर येते'),
('DEAD_HEART', 'hi', 'मृत गभा', 'बीच की पत्ती सूखी खींचने पर निकल जाती है'),
-- YELLOWING
('YELLOWING', 'en', 'Yellowing', 'Leaf yellowing symptom'),
('YELLOWING', 'mr', 'पिवळेपणा', 'पानं पिवळी पडणे'),
('YELLOWING', 'hi', 'पीलापन', 'पत्तियां पीली पड़ना'),
-- WILTING
('WILTING', 'en', 'Wilting', 'Plant wilting symptom'),
('WILTING', 'mr', 'मलूल होणे', 'सुकणे / मलूल होणे'),
('WILTING', 'hi', 'मुरझाना', 'पौधा मुरझाना'),
-- STUNTED_GROWTH
('STUNTED_GROWTH', 'en', 'Stunted Growth', 'Plant growth stunted'),
('STUNTED_GROWTH', 'mr', 'वाढ खुंटली', 'झाडाची वाढ खुंटली'),
('STUNTED_GROWTH', 'hi', 'रुकी हुई वृद्धि', 'पौधे की वृद्धि रुकी हुई'),
-- DRYING
('DRYING', 'en', 'Drying', 'Plant parts drying out'),
('DRYING', 'mr', 'वाळणे', 'झाडांचे भाग वाळणे'),
('DRYING', 'hi', 'सूखना', 'पौधे के हिस्से सूखना'),
-- MONITOR
('MONITOR', 'en', 'Monitor', 'Regular observation of crop'),
('MONITOR', 'mr', 'निरीक्षण करा', 'पिकाचे नियमित निरीक्षण'),
('MONITOR', 'hi', 'निगरानी करें', 'फसल की नियमित निगरानी'),
-- SPRAY
('SPRAY', 'en', 'Spray', 'Apply spray treatment'),
('SPRAY', 'mr', 'फवारणी करा', 'फवारणी उपचार करा'),
('SPRAY', 'hi', 'स्प्रे करें', 'स्प्रे उपचार करें'),
-- APPLY
('APPLY', 'en', 'Apply', 'Apply treatment/input'),
('APPLY', 'mr', 'वापरा', 'उपचार/निविष्ट वापरा'),
('APPLY', 'hi', 'लगाएं', 'उपचार/इनपुट लगाएं'),
-- REMOVE
('REMOVE', 'en', 'Remove', 'Remove affected parts'),
('REMOVE', 'mr', 'काढून टाका', 'प्रभावित भाग काढून टाका'),
('REMOVE', 'hi', 'हटाएं', 'प्रभावित हिस्से हटाएं'),
-- IRRIGATE
('IRRIGATE', 'en', 'Irrigate', 'Water the crop'),
('IRRIGATE', 'mr', 'पाणी द्या', 'पिकाला पाणी द्या'),
('IRRIGATE', 'hi', 'सिंचाई करें', 'फसल की सिंचाई करें'),
-- WATERLOGGING_DAMAGE
('WATERLOGGING_DAMAGE', 'en', 'Waterlogging damage', 'Damage caused by standing water in field'),
('WATERLOGGING_DAMAGE', 'mr', 'पाणी साचल्याने नुकसान', 'शेतात पाणी साचल्यामुळे झालेले नुकसान'),
('WATERLOGGING_DAMAGE', 'hi', 'जलभराव से नुकसान', 'खेत में पानी भरने से हुआ नुकसान'),
-- PHOTO_UPLOAD
('PHOTO_UPLOAD', 'en', 'Send Photo', 'Take and send a photo for identification'),
('PHOTO_UPLOAD', 'mr', 'फोटो पाठवा', 'ओळखीसाठी फोटो काढा आणि पाठवा'),
('PHOTO_UPLOAD', 'hi', 'फोटो भेजें', 'पहचान के लिए फोटो लें और भेजें'),
-- LARVAE_VISIBLE
('LARVAE_VISIBLE', 'en', 'Larvae visible', 'Larvae visible in stem or near roots'),
('LARVAE_VISIBLE', 'mr', 'अळ्या दिसतात', 'खोडात किंवा मुळांजवळ अळ्या दिसतात'),
('LARVAE_VISIBLE', 'hi', 'इल्ली दिखती है', 'तने में या जड़ों के पास इल्ली दिखती है')
ON CONFLICT (observation_code, language_code) DO NOTHING;
