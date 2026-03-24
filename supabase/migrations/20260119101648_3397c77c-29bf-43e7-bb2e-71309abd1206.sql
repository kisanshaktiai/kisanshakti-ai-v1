-- ============================================================
-- PHASE 1: OBSERVATION INTENT MASTER TABLE
-- Universal intents (language-free, finite, stable)
-- ============================================================

CREATE TABLE IF NOT EXISTS observation_intent_master (
  intent_code TEXT PRIMARY KEY,
  intent_description TEXT NOT NULL,
  intent_category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE observation_intent_master ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth required for reference data)
CREATE POLICY "Public read access for observation_intent_master"
ON observation_intent_master FOR SELECT
USING (true);

-- Seed 15 universal intents
INSERT INTO observation_intent_master (intent_code, intent_description, intent_category) VALUES
('EMERGENCE_FAILURE', 'Crop did not emerge or start', 'ESTABLISHMENT'),
('GROWTH_ANOMALY', 'Crop growth is slow or abnormal', 'GROWTH'),
('COLOR_CHANGE', 'Leaf or plant color change observed', 'PHYSIOLOGY'),
('WILTING_OR_DROOPING', 'Plant losing turgor or drooping', 'WATER_STRESS'),
('LEAF_DAMAGE_VISIBLE', 'Physical leaf damage visible', 'PEST'),
('LEAF_MARKS_OR_SPOTS', 'Spots, streaks, patches on leaves', 'DISEASE'),
('STEM_DAMAGE', 'Stem injury or tunneling', 'PEST'),
('ROOT_OR_BASE_PROBLEM', 'Root or basal instability or rot', 'ROOT'),
('PEST_PRESENCE_VISIBLE', 'Insects or pests seen', 'PEST'),
('DISEASE_LIKE_PATTERN', 'Spreading disease-like pattern', 'DISEASE'),
('WATER_STRESS_SIGNAL', 'Water excess or deficiency signs', 'WATER'),
('NUTRIENT_STRESS_SIGNAL', 'Nutrient deficiency or toxicity signs', 'NUTRITION'),
('UNEVEN_FIELD_PATTERN', 'Patchy or uneven field performance', 'FIELD'),
('YIELD_OR_OUTPUT_ISSUE', 'Yield or output related concern', 'OUTPUT'),
('UNKNOWN_OBSERVATION', 'Observation unclear or insufficient', 'UNKNOWN')
ON CONFLICT (intent_code) DO NOTHING;

-- ============================================================
-- PHASE 2: OBSERVATION MASTER TABLE
-- What farmers can actually observe (non-diagnostic)
-- ============================================================

CREATE TABLE IF NOT EXISTS observation_master (
  observation_code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  is_diagnostic BOOLEAN DEFAULT false,
  symptom_category TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE observation_master ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for observation_master"
ON observation_master FOR SELECT
USING (true);

-- Seed initial observations (expanded from ObservationKey enum)
INSERT INTO observation_master (observation_code, description, symptom_category) VALUES
-- Leaf observations
('LEAF_YELLOWING', 'Leaves turning yellow', 'LEAF'),
('LEAF_BROWNING', 'Leaves turning brown', 'LEAF'),
('LEAF_CURLING', 'Leaves curling or rolling', 'LEAF'),
('LEAF_SPOTS', 'Spots on leaves', 'LEAF'),
('LEAF_WILTING', 'Leaves wilting', 'LEAF'),
('LEAF_HOLES', 'Holes in leaves', 'LEAF'),
('LEAF_WEBBING', 'Web-like structures on leaves', 'LEAF'),
('INTERVEINAL_CHLOROSIS', 'Yellowing between leaf veins', 'LEAF'),
('LEAF_TIP_BURN', 'Burnt leaf tips', 'LEAF'),
('PALE_GREEN_LEAVES', 'Leaves appear pale green', 'LEAF'),
-- Stem observations
('STEM_BORING', 'Bore holes in stem', 'STEM'),
('STEM_ROT', 'Stem rotting', 'STEM'),
('STEM_WILTING', 'Stem wilting or drooping', 'STEM'),
('STEM_LESIONS', 'Lesions on stem', 'STEM'),
('STEM_DISCOLORATION', 'Stem color change', 'STEM'),
('DEADHEART', 'Dead central shoot', 'STEM'),
-- Root observations
('ROOT_ROT', 'Root rotting', 'ROOT'),
('ROOT_DAMAGE', 'Root damage visible', 'ROOT'),
('POOR_ROOT_DEVELOPMENT', 'Roots not developing well', 'ROOT'),
-- Growth observations
('STUNTED_GROWTH', 'Plant not growing properly', 'GROWTH'),
('PATCHY_GROWTH', 'Uneven growth across field', 'GROWTH'),
('SLOW_EARLY_GROWTH', 'Overall slow crop growth', 'GROWTH'),
('DELAYED_GERMINATION', 'Seeds slow to germinate', 'GROWTH'),
('POOR_TILLERING', 'Few or no tillers forming', 'GROWTH'),
-- Pest observations
('VISIBLE_INSECTS', 'Insects visible on plant', 'PEST'),
('INSECT_EGGS', 'Insect eggs found', 'PEST'),
('CATERPILLAR_DAMAGE', 'Caterpillar feeding damage', 'PEST'),
('APHID_INFESTATION', 'Aphids present', 'PEST'),
('BORER_DAMAGE', 'Borer damage visible', 'PEST'),
('EARLY_SHOOT_BORER', 'Early shoot borer signs in seedling', 'PEST'),
('INTERNODE_BORER', 'Internode borer in mature cane', 'PEST'),
('TOP_BORER', 'Top borer damage', 'PEST'),
-- Water stress observations
('WILTING_DURING_DAY', 'Plant wilts during daytime', 'WATER'),
('WATERLOGGING_SIGNS', 'Signs of excess water', 'WATER'),
('DROUGHT_STRESS', 'Drought stress visible', 'WATER'),
-- Disease observations
('FUNGAL_GROWTH', 'Fungal growth visible', 'DISEASE'),
('RED_ROT_SYMPTOMS', 'Red rot disease signs', 'DISEASE'),
('SMUT_SYMPTOMS', 'Smut disease signs', 'DISEASE'),
('WILT_SYMPTOMS', 'Wilt disease pattern', 'DISEASE'),
-- Nutrient observations
('NITROGEN_DEFICIENCY', 'Nitrogen deficiency signs', 'NUTRITION'),
('PHOSPHORUS_DEFICIENCY', 'Phosphorus deficiency signs', 'NUTRITION'),
('POTASSIUM_DEFICIENCY', 'Potassium deficiency signs', 'NUTRITION'),
('IRON_DEFICIENCY', 'Iron deficiency chlorosis', 'NUTRITION')
ON CONFLICT (observation_code) DO NOTHING;

-- ============================================================
-- PHASE 3: CROP STAGE MASTER TABLE
-- Canonical biology for all crops
-- ============================================================

CREATE TABLE IF NOT EXISTS crop_stage_master (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crop_code TEXT NOT NULL,
  growth_stage TEXT NOT NULL,
  das_min INTEGER NOT NULL,
  das_max INTEGER NOT NULL,
  stage_description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(crop_code, growth_stage)
);

-- Enable RLS
ALTER TABLE crop_stage_master ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for crop_stage_master"
ON crop_stage_master FOR SELECT
USING (true);

-- Seed crop stages for SUGARCANE
INSERT INTO crop_stage_master (crop_code, growth_stage, das_min, das_max, stage_description) VALUES
('SUGARCANE', 'PRE_GERMINATION', 0, 15, 'Before setts sprout'),
('SUGARCANE', 'GERMINATION', 15, 30, 'Setts sprouting'),
('SUGARCANE', 'SEEDLING', 30, 60, 'Young plants establishing'),
('SUGARCANE', 'TILLERING', 60, 120, 'Multiple shoots forming'),
('SUGARCANE', 'GRAND_GROWTH', 120, 240, 'Rapid cane elongation'),
('SUGARCANE', 'MATURITY', 240, 365, 'Sugar accumulation phase'),
('SUGARCANE', 'HARVEST', 300, 400, 'Ready for harvest')
ON CONFLICT (crop_code, growth_stage) DO NOTHING;

-- Seed crop stages for COTTON
INSERT INTO crop_stage_master (crop_code, growth_stage, das_min, das_max, stage_description) VALUES
('COTTON', 'GERMINATION', 0, 10, 'Seed germination'),
('COTTON', 'SEEDLING', 10, 25, 'Cotyledon to 4 leaves'),
('COTTON', 'VEGETATIVE', 25, 45, 'Leaf development'),
('COTTON', 'SQUARING', 45, 65, 'Square formation'),
('COTTON', 'FLOWERING', 65, 100, 'Flower opening'),
('COTTON', 'BOLL_DEVELOPMENT', 100, 140, 'Boll formation'),
('COTTON', 'BOLL_OPENING', 140, 180, 'Boll opening'),
('COTTON', 'HARVEST', 160, 200, 'Ready for picking')
ON CONFLICT (crop_code, growth_stage) DO NOTHING;

-- Seed crop stages for RICE
INSERT INTO crop_stage_master (crop_code, growth_stage, das_min, das_max, stage_description) VALUES
('RICE', 'GERMINATION', 0, 10, 'Seed germination'),
('RICE', 'SEEDLING', 10, 25, 'Nursery stage'),
('RICE', 'TRANSPLANTING', 25, 35, 'Transplanting phase'),
('RICE', 'TILLERING', 35, 60, 'Tiller formation'),
('RICE', 'PANICLE_INITIATION', 60, 75, 'Panicle begins forming'),
('RICE', 'BOOTING', 75, 90, 'Flag leaf visible'),
('RICE', 'HEADING', 90, 100, 'Panicle emerges'),
('RICE', 'FLOWERING', 100, 110, 'Anthesis'),
('RICE', 'GRAIN_FILLING', 110, 130, 'Grain development'),
('RICE', 'MATURITY', 130, 150, 'Grains mature'),
('RICE', 'HARVEST', 140, 160, 'Ready for harvest')
ON CONFLICT (crop_code, growth_stage) DO NOTHING;

-- Seed crop stages for SOYBEAN
INSERT INTO crop_stage_master (crop_code, growth_stage, das_min, das_max, stage_description) VALUES
('SOYBEAN', 'GERMINATION', 0, 7, 'Seed germination'),
('SOYBEAN', 'SEEDLING', 7, 20, 'Cotyledon emergence'),
('SOYBEAN', 'VEGETATIVE', 20, 45, 'Leaf development'),
('SOYBEAN', 'FLOWERING', 45, 65, 'Flower formation'),
('SOYBEAN', 'POD_FORMATION', 65, 85, 'Pod development'),
('SOYBEAN', 'SEED_FILLING', 85, 110, 'Seed development'),
('SOYBEAN', 'MATURITY', 110, 130, 'Pods mature'),
('SOYBEAN', 'HARVEST', 120, 140, 'Ready for harvest')
ON CONFLICT (crop_code, growth_stage) DO NOTHING;

-- Seed crop stages for WHEAT
INSERT INTO crop_stage_master (crop_code, growth_stage, das_min, das_max, stage_description) VALUES
('WHEAT', 'GERMINATION', 0, 10, 'Seed germination'),
('WHEAT', 'SEEDLING', 10, 25, 'Early leaf stage'),
('WHEAT', 'TILLERING', 25, 50, 'Tiller formation'),
('WHEAT', 'STEM_EXTENSION', 50, 70, 'Stem elongation'),
('WHEAT', 'BOOTING', 70, 85, 'Flag leaf visible'),
('WHEAT', 'HEADING', 85, 95, 'Head emerges'),
('WHEAT', 'FLOWERING', 95, 105, 'Anthesis'),
('WHEAT', 'GRAIN_FILLING', 105, 130, 'Grain development'),
('WHEAT', 'MATURITY', 130, 150, 'Grains mature'),
('WHEAT', 'HARVEST', 140, 160, 'Ready for harvest')
ON CONFLICT (crop_code, growth_stage) DO NOTHING;

-- ============================================================
-- PHASE 4: INTENT OBSERVATION MAPPING TABLE
-- Core intelligence: maps intent + crop + stage → observations
-- ============================================================

CREATE TABLE IF NOT EXISTS intent_observation_mapping (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_code TEXT NOT NULL REFERENCES observation_intent_master(intent_code),
  crop_code TEXT NOT NULL,
  growth_stage TEXT NOT NULL,
  das_min INTEGER NOT NULL,
  das_max INTEGER NOT NULL,
  observation_code TEXT NOT NULL REFERENCES observation_master(observation_code),
  confidence_rank INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(intent_code, crop_code, growth_stage, observation_code)
);

-- Enable RLS
ALTER TABLE intent_observation_mapping ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for intent_observation_mapping"
ON intent_observation_mapping FOR SELECT
USING (true);

-- GIN indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_iom_intent_crop ON intent_observation_mapping(intent_code, crop_code);
CREATE INDEX IF NOT EXISTS idx_iom_das_range ON intent_observation_mapping(das_min, das_max);
CREATE INDEX IF NOT EXISTS idx_iom_stage ON intent_observation_mapping(growth_stage);

-- Seed SUGARCANE SEEDLING stage mappings (30-60 DAS)
INSERT INTO intent_observation_mapping (intent_code, crop_code, growth_stage, das_min, das_max, observation_code, confidence_rank) VALUES
-- Color change intents
('COLOR_CHANGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'LEAF_YELLOWING', 1),
('COLOR_CHANGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'PALE_GREEN_LEAVES', 2),
('COLOR_CHANGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'INTERVEINAL_CHLOROSIS', 3),
('COLOR_CHANGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'LEAF_BROWNING', 4),
-- Growth anomaly intents
('GROWTH_ANOMALY', 'SUGARCANE', 'SEEDLING', 30, 60, 'SLOW_EARLY_GROWTH', 1),
('GROWTH_ANOMALY', 'SUGARCANE', 'SEEDLING', 30, 60, 'PATCHY_GROWTH', 2),
('GROWTH_ANOMALY', 'SUGARCANE', 'SEEDLING', 30, 60, 'STUNTED_GROWTH', 3),
('GROWTH_ANOMALY', 'SUGARCANE', 'SEEDLING', 30, 60, 'POOR_TILLERING', 4),
-- Wilting intents
('WILTING_OR_DROOPING', 'SUGARCANE', 'SEEDLING', 30, 60, 'WILTING_DURING_DAY', 1),
('WILTING_OR_DROOPING', 'SUGARCANE', 'SEEDLING', 30, 60, 'LEAF_WILTING', 2),
('WILTING_OR_DROOPING', 'SUGARCANE', 'SEEDLING', 30, 60, 'STEM_WILTING', 3),
-- Leaf damage intents
('LEAF_DAMAGE_VISIBLE', 'SUGARCANE', 'SEEDLING', 30, 60, 'LEAF_HOLES', 1),
('LEAF_DAMAGE_VISIBLE', 'SUGARCANE', 'SEEDLING', 30, 60, 'CATERPILLAR_DAMAGE', 2),
('LEAF_DAMAGE_VISIBLE', 'SUGARCANE', 'SEEDLING', 30, 60, 'LEAF_CURLING', 3),
-- Stem damage intents (Early Shoot Borer is primary for seedling)
('STEM_DAMAGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'DEADHEART', 1),
('STEM_DAMAGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'EARLY_SHOOT_BORER', 2),
('STEM_DAMAGE', 'SUGARCANE', 'SEEDLING', 30, 60, 'STEM_BORING', 3),
-- Pest presence
('PEST_PRESENCE_VISIBLE', 'SUGARCANE', 'SEEDLING', 30, 60, 'VISIBLE_INSECTS', 1),
('PEST_PRESENCE_VISIBLE', 'SUGARCANE', 'SEEDLING', 30, 60, 'INSECT_EGGS', 2),
('PEST_PRESENCE_VISIBLE', 'SUGARCANE', 'SEEDLING', 30, 60, 'APHID_INFESTATION', 3),
-- Disease patterns
('DISEASE_LIKE_PATTERN', 'SUGARCANE', 'SEEDLING', 30, 60, 'LEAF_SPOTS', 1),
('DISEASE_LIKE_PATTERN', 'SUGARCANE', 'SEEDLING', 30, 60, 'FUNGAL_GROWTH', 2),
-- Nutrient stress
('NUTRIENT_STRESS_SIGNAL', 'SUGARCANE', 'SEEDLING', 30, 60, 'NITROGEN_DEFICIENCY', 1),
('NUTRIENT_STRESS_SIGNAL', 'SUGARCANE', 'SEEDLING', 30, 60, 'PHOSPHORUS_DEFICIENCY', 2),
('NUTRIENT_STRESS_SIGNAL', 'SUGARCANE', 'SEEDLING', 30, 60, 'IRON_DEFICIENCY', 3),
-- Water stress
('WATER_STRESS_SIGNAL', 'SUGARCANE', 'SEEDLING', 30, 60, 'DROUGHT_STRESS', 1),
('WATER_STRESS_SIGNAL', 'SUGARCANE', 'SEEDLING', 30, 60, 'WATERLOGGING_SIGNS', 2),
-- Emergence failure
('EMERGENCE_FAILURE', 'SUGARCANE', 'SEEDLING', 30, 60, 'DELAYED_GERMINATION', 1),
('EMERGENCE_FAILURE', 'SUGARCANE', 'SEEDLING', 30, 60, 'PATCHY_GROWTH', 2)
ON CONFLICT (intent_code, crop_code, growth_stage, observation_code) DO NOTHING;

-- Seed SUGARCANE TILLERING stage mappings (60-120 DAS)
INSERT INTO intent_observation_mapping (intent_code, crop_code, growth_stage, das_min, das_max, observation_code, confidence_rank) VALUES
('COLOR_CHANGE', 'SUGARCANE', 'TILLERING', 60, 120, 'LEAF_YELLOWING', 1),
('COLOR_CHANGE', 'SUGARCANE', 'TILLERING', 60, 120, 'INTERVEINAL_CHLOROSIS', 2),
('GROWTH_ANOMALY', 'SUGARCANE', 'TILLERING', 60, 120, 'POOR_TILLERING', 1),
('GROWTH_ANOMALY', 'SUGARCANE', 'TILLERING', 60, 120, 'STUNTED_GROWTH', 2),
('STEM_DAMAGE', 'SUGARCANE', 'TILLERING', 60, 120, 'INTERNODE_BORER', 1),
('STEM_DAMAGE', 'SUGARCANE', 'TILLERING', 60, 120, 'STEM_BORING', 2),
('STEM_DAMAGE', 'SUGARCANE', 'TILLERING', 60, 120, 'DEADHEART', 3),
('PEST_PRESENCE_VISIBLE', 'SUGARCANE', 'TILLERING', 60, 120, 'VISIBLE_INSECTS', 1),
('PEST_PRESENCE_VISIBLE', 'SUGARCANE', 'TILLERING', 60, 120, 'BORER_DAMAGE', 2),
('DISEASE_LIKE_PATTERN', 'SUGARCANE', 'TILLERING', 60, 120, 'RED_ROT_SYMPTOMS', 1),
('DISEASE_LIKE_PATTERN', 'SUGARCANE', 'TILLERING', 60, 120, 'SMUT_SYMPTOMS', 2)
ON CONFLICT (intent_code, crop_code, growth_stage, observation_code) DO NOTHING;

-- Seed SUGARCANE GRAND_GROWTH stage mappings (120-240 DAS)
INSERT INTO intent_observation_mapping (intent_code, crop_code, growth_stage, das_min, das_max, observation_code, confidence_rank) VALUES
('STEM_DAMAGE', 'SUGARCANE', 'GRAND_GROWTH', 120, 240, 'INTERNODE_BORER', 1),
('STEM_DAMAGE', 'SUGARCANE', 'GRAND_GROWTH', 120, 240, 'TOP_BORER', 2),
('STEM_DAMAGE', 'SUGARCANE', 'GRAND_GROWTH', 120, 240, 'STEM_BORING', 3),
('COLOR_CHANGE', 'SUGARCANE', 'GRAND_GROWTH', 120, 240, 'LEAF_YELLOWING', 1),
('DISEASE_LIKE_PATTERN', 'SUGARCANE', 'GRAND_GROWTH', 120, 240, 'RED_ROT_SYMPTOMS', 1),
('DISEASE_LIKE_PATTERN', 'SUGARCANE', 'GRAND_GROWTH', 120, 240, 'WILT_SYMPTOMS', 2)
ON CONFLICT (intent_code, crop_code, growth_stage, observation_code) DO NOTHING;

-- ============================================================
-- PHASE 5: TRANSLATION TABLES (Multilingual Support)
-- ============================================================

CREATE TABLE IF NOT EXISTS intent_translations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_code TEXT NOT NULL REFERENCES observation_intent_master(intent_code),
  language_code TEXT NOT NULL,
  display_text TEXT NOT NULL,
  question_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(intent_code, language_code)
);

-- Enable RLS
ALTER TABLE intent_translations ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for intent_translations"
ON intent_translations FOR SELECT
USING (true);

-- Seed intent translations
INSERT INTO intent_translations (intent_code, language_code, display_text, question_text) VALUES
-- English
('EMERGENCE_FAILURE', 'en', 'Emergence failure', 'Is the crop failing to emerge?'),
('GROWTH_ANOMALY', 'en', 'Growth problem', 'Is the crop growing abnormally?'),
('COLOR_CHANGE', 'en', 'Color change', 'Have you noticed any color changes?'),
('WILTING_OR_DROOPING', 'en', 'Wilting', 'Is the plant wilting or drooping?'),
('LEAF_DAMAGE_VISIBLE', 'en', 'Leaf damage', 'Is there visible leaf damage?'),
('STEM_DAMAGE', 'en', 'Stem damage', 'Is there stem damage or boring?'),
('PEST_PRESENCE_VISIBLE', 'en', 'Pests visible', 'Have you seen any insects or pests?'),
('DISEASE_LIKE_PATTERN', 'en', 'Disease pattern', 'Is there a spreading disease pattern?'),
('NUTRIENT_STRESS_SIGNAL', 'en', 'Nutrient deficiency', 'Are there signs of nutrient deficiency?'),
('WATER_STRESS_SIGNAL', 'en', 'Water stress', 'Is there water excess or deficiency?'),
-- Marathi
('EMERGENCE_FAILURE', 'mr', 'उगवण अपयश', 'पीक उगवत नाही का?'),
('GROWTH_ANOMALY', 'mr', 'वाढीची समस्या', 'पीक असामान्यपणे वाढत आहे का?'),
('COLOR_CHANGE', 'mr', 'रंग बदल', 'तुम्हाला रंग बदल दिसला का?'),
('WILTING_OR_DROOPING', 'mr', 'कोमेजणे', 'रोप कोमेजत आहे का?'),
('LEAF_DAMAGE_VISIBLE', 'mr', 'पानांचे नुकसान', 'पानांवर नुकसान दिसते का?'),
('STEM_DAMAGE', 'mr', 'खोड नुकसान', 'खोडावर नुकसान किंवा छिद्र आहे का?'),
('PEST_PRESENCE_VISIBLE', 'mr', 'किडे दिसले', 'तुम्हाला किडे किंवा कीटक दिसले का?'),
('DISEASE_LIKE_PATTERN', 'mr', 'रोगाचा पॅटर्न', 'पसरणारा रोग दिसतो का?'),
('NUTRIENT_STRESS_SIGNAL', 'mr', 'पोषक कमतरता', 'पोषक तत्वांच्या कमतरतेची चिन्हे आहेत का?'),
('WATER_STRESS_SIGNAL', 'mr', 'पाण्याचा ताण', 'पाण्याची कमतरता किंवा जास्त पाणी आहे का?'),
-- Hindi
('EMERGENCE_FAILURE', 'hi', 'उगाव विफलता', 'क्या फसल उग नहीं रही है?'),
('GROWTH_ANOMALY', 'hi', 'विकास समस्या', 'क्या फसल असामान्य रूप से बढ़ रही है?'),
('COLOR_CHANGE', 'hi', 'रंग परिवर्तन', 'क्या आपने रंग में बदलाव देखा है?'),
('WILTING_OR_DROOPING', 'hi', 'मुरझाना', 'क्या पौधा मुरझा रहा है?'),
('LEAF_DAMAGE_VISIBLE', 'hi', 'पत्ती क्षति', 'क्या पत्तियों पर नुकसान दिखाई दे रहा है?'),
('STEM_DAMAGE', 'hi', 'तना क्षति', 'क्या तने पर नुकसान या छेद है?'),
('PEST_PRESENCE_VISIBLE', 'hi', 'कीट दिखे', 'क्या आपने कीड़े या कीट देखे हैं?'),
('DISEASE_LIKE_PATTERN', 'hi', 'रोग पैटर्न', 'क्या फैलता हुआ रोग दिखता है?'),
('NUTRIENT_STRESS_SIGNAL', 'hi', 'पोषक तत्व की कमी', 'क्या पोषक तत्वों की कमी के संकेत हैं?'),
('WATER_STRESS_SIGNAL', 'hi', 'पानी का तनाव', 'क्या पानी की कमी या अधिकता है?')
ON CONFLICT (intent_code, language_code) DO NOTHING;

-- ============================================================
-- OBSERVATION TRANSLATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS observation_translations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  observation_code TEXT NOT NULL REFERENCES observation_master(observation_code),
  language_code TEXT NOT NULL,
  display_text TEXT NOT NULL,
  description_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(observation_code, language_code)
);

-- Enable RLS
ALTER TABLE observation_translations ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access for observation_translations"
ON observation_translations FOR SELECT
USING (true);

-- Seed observation translations (comprehensive for SUGARCANE scenarios)
INSERT INTO observation_translations (observation_code, language_code, display_text, description_text) VALUES
-- English
('LEAF_YELLOWING', 'en', 'Leaf yellowing', 'Leaves are turning yellow'),
('PALE_GREEN_LEAVES', 'en', 'Pale green leaves', 'Leaves appear light green'),
('INTERVEINAL_CHLOROSIS', 'en', 'Yellowing between veins', 'Yellow color between leaf veins'),
('LEAF_BROWNING', 'en', 'Leaf browning', 'Leaves turning brown'),
('SLOW_EARLY_GROWTH', 'en', 'Slow growth', 'Crop growing slowly'),
('PATCHY_GROWTH', 'en', 'Patchy growth', 'Uneven growth in field'),
('STUNTED_GROWTH', 'en', 'Stunted growth', 'Plants not growing tall'),
('DEADHEART', 'en', 'Dead heart', 'Central shoot is dead'),
('EARLY_SHOOT_BORER', 'en', 'Early shoot borer damage', 'Borer damage in young shoots'),
('STEM_BORING', 'en', 'Stem boring', 'Holes in stem'),
('WILTING_DURING_DAY', 'en', 'Daytime wilting', 'Plant wilts during day'),
('LEAF_WILTING', 'en', 'Leaf wilting', 'Leaves are wilting'),
-- Marathi
('LEAF_YELLOWING', 'mr', 'पाने पिवळी', 'पाने पिवळी पडत आहेत'),
('PALE_GREEN_LEAVES', 'mr', 'फिकट हिरवी पाने', 'पाने फिकट हिरवी दिसतात'),
('INTERVEINAL_CHLOROSIS', 'mr', 'शिरांमधील पिवळेपणा', 'पानांच्या शिरांमध्ये पिवळा रंग'),
('LEAF_BROWNING', 'mr', 'पाने तपकिरी', 'पाने तपकिरी होत आहेत'),
('SLOW_EARLY_GROWTH', 'mr', 'मंद वाढ', 'पीक हळूहळू वाढत आहे'),
('PATCHY_GROWTH', 'mr', 'असमान वाढ', 'शेतात ठिकठिकाणी असमान वाढ'),
('STUNTED_GROWTH', 'mr', 'खुंटलेली वाढ', 'रोपे उंच वाढत नाहीत'),
('DEADHEART', 'mr', 'मृत पोंगा', 'मधला पोंगा मेला'),
('EARLY_SHOOT_BORER', 'mr', 'सुरुवातीची खोड किडा', 'लहान रोपांमध्ये खोड किड्याचे नुकसान'),
('STEM_BORING', 'mr', 'खोडाला छिद्र', 'खोडावर छिद्रे'),
('WILTING_DURING_DAY', 'mr', 'दिवसा कोमेजणे', 'दिवसा रोप कोमेजते'),
('LEAF_WILTING', 'mr', 'पाने कोमेजणे', 'पाने कोमेजत आहेत'),
('POOR_TILLERING', 'mr', 'कमी फुटवे', 'फुटवे कमी येत आहेत'),
('VISIBLE_INSECTS', 'mr', 'किडे दिसले', 'रोपावर किडे दिसत आहेत'),
('NITROGEN_DEFICIENCY', 'mr', 'नत्राची कमतरता', 'नायट्रोजनच्या कमतरतेची चिन्हे'),
('DROUGHT_STRESS', 'mr', 'पाण्याची कमतरता', 'पाण्याच्या कमतरतेची चिन्हे'),
-- Hindi
('LEAF_YELLOWING', 'hi', 'पत्ते पीले', 'पत्ते पीले पड़ रहे हैं'),
('PALE_GREEN_LEAVES', 'hi', 'हल्के हरे पत्ते', 'पत्ते हल्के हरे दिखते हैं'),
('INTERVEINAL_CHLOROSIS', 'hi', 'नसों के बीच पीलापन', 'पत्तियों की नसों के बीच पीला रंग'),
('LEAF_BROWNING', 'hi', 'पत्ते भूरे', 'पत्ते भूरे हो रहे हैं'),
('SLOW_EARLY_GROWTH', 'hi', 'धीमी वृद्धि', 'फसल धीरे-धीरे बढ़ रही है'),
('PATCHY_GROWTH', 'hi', 'असमान वृद्धि', 'खेत में जगह-जगह असमान वृद्धि'),
('STUNTED_GROWTH', 'hi', 'रुकी हुई वृद्धि', 'पौधे ऊंचे नहीं बढ़ रहे'),
('DEADHEART', 'hi', 'मृत पोंगा', 'बीच का पोंगा मर गया'),
('EARLY_SHOOT_BORER', 'hi', 'प्रारंभिक तना छेदक', 'छोटे पौधों में तना छेदक का नुकसान'),
('STEM_BORING', 'hi', 'तने में छेद', 'तने पर छेद'),
('WILTING_DURING_DAY', 'hi', 'दिन में मुरझाना', 'दिन में पौधा मुरझाता है'),
('LEAF_WILTING', 'hi', 'पत्ते मुरझाना', 'पत्ते मुरझा रहे हैं')
ON CONFLICT (observation_code, language_code) DO NOTHING;

-- Create indexes for translations
CREATE INDEX IF NOT EXISTS idx_intent_trans_lang ON intent_translations(language_code);
CREATE INDEX IF NOT EXISTS idx_obs_trans_lang ON observation_translations(language_code);