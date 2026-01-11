-- ═══════════════════════════════════════════════════════════════════════════
-- WORLD-CLASS CLARIFICATION SYSTEM - Database Schema Updates
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Adds columns to decision_rules table to support database-driven multi-match
-- detection and clarification generation for ALL crops.
--
-- VERSION: 1.0.0
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Add observable_characteristics column
ALTER TABLE public.decision_rules 
ADD COLUMN IF NOT EXISTS observable_characteristics JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.decision_rules.observable_characteristics IS 
'Observable features that help identify this pest/disease. Used for generating clarification options. 
Structure: { 
  "size": "SMALL" | "MEDIUM" | "LARGE" | "TINY", 
  "color": ["GREEN", "BLACK", "WHITE", "BROWN", "YELLOW"], 
  "behavior": ["FLYING", "JUMPING", "CRAWLING", "STATIC", "CLUSTERED"], 
  "location": ["UNDER_LEAVES", "TOP_OF_LEAVES", "STEM", "ROOT", "BOLL", "FRUIT"], 
  "secondary_symptoms": ["STICKY_HONEYDEW", "SOOTY_MOLD", "LEAF_CURLING", "HOLES", "WEBBING"], 
  "icon": "🐛" | "🦟" | "🐜" etc 
}';

-- Step 2: Add differentiating_questions column
ALTER TABLE public.decision_rules 
ADD COLUMN IF NOT EXISTS differentiating_questions JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.decision_rules.differentiating_questions IS 
'Questions that help distinguish this cause from similar ones. 
Structure: [{ 
  "question_id": "COLOR_CHECK", 
  "mr": "किडे कोणत्या रंगाचे आहेत?", 
  "hi": "कीड़े किस रंग के हैं?", 
  "en": "What color are the insects?", 
  "discriminates_from": ["WHITEFLY", "THRIPS"], 
  "information_gain": 0.85 
}]';

-- Step 3: Add visual_markers column
ALTER TABLE public.decision_rules
ADD COLUMN IF NOT EXISTS visual_markers JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.decision_rules.visual_markers IS 
'Visual identification aids and photo guidance. 
Structure: { 
  "distinctive_feature": "Green/black tiny insects in clusters with honeydew", 
  "photo_guidance": { 
    "mr": "पानाच्या खालच्या बाजूचा फोटो घ्या", 
    "hi": "पत्ती के नीचे की तरफ फोटो लें", 
    "en": "Take photo of underside of leaf" 
  } 
}';

-- Step 4: Create GIN indexes for fast JSONB lookups
CREATE INDEX IF NOT EXISTS idx_decision_rules_observable 
ON public.decision_rules USING GIN (observable_characteristics);

CREATE INDEX IF NOT EXISTS idx_decision_rules_visual_markers 
ON public.decision_rules USING GIN (visual_markers);

-- ═══════════════════════════════════════════════════════════════════════════
-- Step 5: Seed Observable Characteristics for Major Pests (Cross-Crop)
-- ═══════════════════════════════════════════════════════════════════════════

-- APHID rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'SMALL',
  'color', jsonb_build_array('GREEN', 'BLACK'),
  'behavior', jsonb_build_array('CLUSTERED', 'STATIC'),
  'location', jsonb_build_array('UNDER_LEAVES', 'STEM', 'TENDER_SHOOTS'),
  'secondary_symptoms', jsonb_build_array('STICKY_HONEYDEW', 'SOOTY_MOLD'),
  'icon', '📗'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'COLOR_CHECK',
    'mr', 'किडे कोणत्या रंगाचे आहेत - हिरवे का काळे?',
    'hi', 'कीड़े किस रंग के हैं - हरे या काले?',
    'en', 'What color are the insects - green or black?',
    'discriminates_from', jsonb_build_array('WHITEFLY', 'THRIPS'),
    'information_gain', 0.85
  ),
  jsonb_build_object(
    'question_id', 'HONEYDEW_CHECK',
    'mr', 'पानांवर चिकट पदार्थ आहे का?',
    'hi', 'पत्तियों पर चिपचिपा पदार्थ है?',
    'en', 'Is there sticky substance on leaves?',
    'discriminates_from', jsonb_build_array('WHITEFLY', 'JASSID'),
    'information_gain', 0.80
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'Green/black tiny insects in clusters with honeydew',
  'photo_guidance', jsonb_build_object(
    'mr', 'पानाच्या खालच्या बाजूचा फोटो घ्या',
    'hi', 'पत्ती के नीचे की तरफ फोटो लें',
    'en', 'Take photo of underside of leaf'
  )
)
WHERE UPPER(cause) LIKE '%APHID%' AND is_active = true;

-- WHITEFLY rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'TINY',
  'color', jsonb_build_array('WHITE'),
  'behavior', jsonb_build_array('FLYING', 'CLUSTERED'),
  'location', jsonb_build_array('UNDER_LEAVES'),
  'secondary_symptoms', jsonb_build_array('SOOTY_MOLD', 'LEAF_CURLING'),
  'icon', '🦟'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'FLYING_CHECK',
    'mr', 'पानाला हात लावल्यावर किडे उडतात का?',
    'hi', 'पत्ती छूने पर कीड़े उड़ जाते हैं?',
    'en', 'Do insects fly away when you touch the leaf?',
    'discriminates_from', jsonb_build_array('APHID', 'MEALYBUG'),
    'information_gain', 0.90
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'Tiny white flying insects under leaves',
  'photo_guidance', jsonb_build_object(
    'mr', 'पानाच्या खाली पांढरे उडणारे किडे दाखवा',
    'hi', 'पत्ते के नीचे सफेद उड़ने वाले कीड़े दिखाएं',
    'en', 'Show white flying insects under leaves'
  )
)
WHERE UPPER(cause) LIKE '%WHITEFL%' AND is_active = true;

-- THRIPS rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'TINY',
  'color', jsonb_build_array('BLACK', 'BROWN', 'YELLOW'),
  'behavior', jsonb_build_array('CRAWLING'),
  'location', jsonb_build_array('TOP_OF_LEAVES', 'FLOWERS', 'BUDS'),
  'secondary_symptoms', jsonb_build_array('SILVERY_SHEEN', 'LEAF_CURLING'),
  'icon', '🐛'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'SILVERY_CHECK',
    'mr', 'पानांवर चांदीसारखा चमकदार थर दिसतो का?',
    'hi', 'पत्तियों पर चांदी जैसी चमक दिख रही है?',
    'en', 'Do leaves have a silvery sheen?',
    'discriminates_from', jsonb_build_array('APHID', 'JASSID'),
    'information_gain', 0.85
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'Black/brown elongated tiny insects with silvery leaf damage',
  'photo_guidance', jsonb_build_object(
    'mr', 'पानांवरील चांदीसारखे ठिपके दाखवा',
    'hi', 'पत्तियों पर चांदी के धब्बे दिखाएं',
    'en', 'Show silvery patches on leaves'
  )
)
WHERE UPPER(cause) LIKE '%THRIP%' AND is_active = true;

-- JASSID/LEAFHOPPER rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'SMALL',
  'color', jsonb_build_array('GREEN', 'YELLOWISH_GREEN'),
  'behavior', jsonb_build_array('JUMPING', 'FLYING'),
  'location', jsonb_build_array('UNDER_LEAVES'),
  'secondary_symptoms', jsonb_build_array('LEAF_CURLING', 'HOPPER_BURN'),
  'icon', '🏃'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'JUMPING_CHECK',
    'mr', 'किडे उड्या मारतात का?',
    'hi', 'कीड़े उछलते हैं?',
    'en', 'Do insects jump when disturbed?',
    'discriminates_from', jsonb_build_array('APHID', 'WHITEFLY'),
    'information_gain', 0.90
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'Green wedge-shaped jumping insects',
  'photo_guidance', jsonb_build_object(
    'mr', 'हिरवे उड्या मारणारे किडे दाखवा',
    'hi', 'हरे उछलने वाले कीड़े दिखाएं',
    'en', 'Show green jumping insects'
  )
)
WHERE (UPPER(cause) LIKE '%JASSID%' OR UPPER(cause) LIKE '%HOPPER%' OR UPPER(cause) LIKE '%LEAFHOPPER%') AND is_active = true;

-- MEALYBUG rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'SMALL',
  'color', jsonb_build_array('WHITE', 'COTTONY'),
  'behavior', jsonb_build_array('CLUSTERED', 'STATIC'),
  'location', jsonb_build_array('STEM', 'NODES', 'ROOT'),
  'secondary_symptoms', jsonb_build_array('WAXY_COATING', 'SOOTY_MOLD'),
  'icon', '🔵'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'WAXY_CHECK',
    'mr', 'किड्यांवर पांढरा मेणासारखा थर आहे का?',
    'hi', 'कीड़ों पर सफेद मोम जैसी परत है?',
    'en', 'Do insects have a white waxy coating?',
    'discriminates_from', jsonb_build_array('APHID', 'SCALE'),
    'information_gain', 0.85
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'White cottony clusters on stems and nodes',
  'photo_guidance', jsonb_build_object(
    'mr', 'खोडावरील पांढरे गुच्छे दाखवा',
    'hi', 'तने पर सफेद गुच्छे दिखाएं',
    'en', 'Show white clusters on stems'
  )
)
WHERE UPPER(cause) LIKE '%MEALYBUG%' AND is_active = true;

-- STEM BORER rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'MEDIUM',
  'color', jsonb_build_array('WHITE', 'CREAM', 'PINK'),
  'behavior', jsonb_build_array('BORING', 'HIDDEN'),
  'location', jsonb_build_array('STEM', 'SHOOT'),
  'secondary_symptoms', jsonb_build_array('DEAD_HEART', 'FRASS', 'ENTRY_HOLE'),
  'icon', '🪱'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'DEADHEART_CHECK',
    'mr', 'मधली सुरळी वाळली आहे का?',
    'hi', 'बीच की पत्ती मुरझाई है?',
    'en', 'Is the central whorl wilted (dead heart)?',
    'discriminates_from', jsonb_build_array('TERMITE', 'WATERLOGGING'),
    'information_gain', 0.95
  ),
  jsonb_build_object(
    'question_id', 'HOLE_CHECK',
    'mr', 'खोडात छिद्र दिसते का?',
    'hi', 'तने में छेद दिख रहा है?',
    'en', 'Is there a hole in the stem?',
    'discriminates_from', jsonb_build_array('TERMITE'),
    'information_gain', 0.90
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'Dead heart symptom with entry hole and frass',
  'photo_guidance', jsonb_build_object(
    'mr', 'मधली वाळलेली सुरळी आणि खोडातील छिद्र दाखवा',
    'hi', 'मुरझाई बीच की पत्ती और तने में छेद दिखाएं',
    'en', 'Show wilted central whorl and hole in stem'
  )
)
WHERE (UPPER(cause) LIKE '%BORER%' OR UPPER(cause) LIKE '%ESB%' OR UPPER(cause) LIKE '%ISB%') AND is_active = true;

-- BOLLWORM rules (cotton)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'MEDIUM',
  'color', jsonb_build_array('GREEN', 'PINK', 'BROWN'),
  'behavior', jsonb_build_array('BORING', 'CRAWLING'),
  'location', jsonb_build_array('BOLL', 'SQUARE', 'FLOWER'),
  'secondary_symptoms', jsonb_build_array('HOLES_IN_BOLL', 'FRASS', 'DAMAGED_LINT'),
  'icon', '🐛'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'BOLL_HOLE_CHECK',
    'mr', 'बोंडात छिद्रे दिसतात का?',
    'hi', 'बोल में छेद दिख रहे हैं?',
    'en', 'Are there holes in the bolls?',
    'discriminates_from', jsonb_build_array('APHID', 'JASSID'),
    'information_gain', 0.95
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'Caterpillars boring into cotton bolls',
  'photo_guidance', jsonb_build_object(
    'mr', 'बोंडातील अळी आणि छिद्रे दाखवा',
    'hi', 'बोल में कैटरपिलर और छेद दिखाएं',
    'en', 'Show caterpillars and holes in bolls'
  )
)
WHERE UPPER(cause) LIKE '%BOLLWORM%' AND is_active = true;

-- TERMITE rules (all crops)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'SMALL',
  'color', jsonb_build_array('WHITE', 'CREAM'),
  'behavior', jsonb_build_array('TUNNELING', 'HIDDEN'),
  'location', jsonb_build_array('ROOT', 'STEM_BASE', 'SOIL'),
  'secondary_symptoms', jsonb_build_array('MUD_TUNNELS', 'WILTING', 'ROOT_DAMAGE'),
  'icon', '🐜'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'MUD_TUNNEL_CHECK',
    'mr', 'जमिनीत मातीचे बोगदे दिसतात का?',
    'hi', 'जमीन में मिट्टी की सुरंगें दिख रही हैं?',
    'en', 'Do you see mud tunnels in soil?',
    'discriminates_from', jsonb_build_array('STEM_BORER', 'ROOT_GRUB'),
    'information_gain', 0.90
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'White insects with mud tunnels near roots',
  'photo_guidance', jsonb_build_object(
    'mr', 'मुळाजवळील मातीचे बोगदे दाखवा',
    'hi', 'जड़ के पास मिट्टी की सुरंगें दिखाएं',
    'en', 'Show mud tunnels near roots'
  )
)
WHERE UPPER(cause) LIKE '%TERMITE%' AND is_active = true;

-- WOOLLY APHID rules (sugarcane)
UPDATE public.decision_rules 
SET observable_characteristics = jsonb_build_object(
  'size', 'SMALL',
  'color', jsonb_build_array('WHITE', 'WOOLLY'),
  'behavior', jsonb_build_array('CLUSTERED', 'STATIC'),
  'location', jsonb_build_array('UNDER_LEAVES', 'STEM'),
  'secondary_symptoms', jsonb_build_array('WHITE_WOOLLY_MASS', 'STUNTING'),
  'icon', '🐑'
),
differentiating_questions = jsonb_build_array(
  jsonb_build_object(
    'question_id', 'WOOLLY_CHECK',
    'mr', 'पांढरा लोकरीसारखा थर दिसतो का?',
    'hi', 'सफेद रूई जैसा ढेर दिख रहा है?',
    'en', 'Is there white woolly mass visible?',
    'discriminates_from', jsonb_build_array('MEALYBUG', 'SCALE'),
    'information_gain', 0.85
  )
),
visual_markers = jsonb_build_object(
  'distinctive_feature', 'White woolly mass on leaves and stems',
  'photo_guidance', jsonb_build_object(
    'mr', 'पांढरा लोकरीसारखा थर दाखवा',
    'hi', 'सफेद रूई जैसा ढेर दिखाएं',
    'en', 'Show white woolly mass'
  )
)
WHERE UPPER(cause) LIKE '%WOOLLY%' AND is_active = true;