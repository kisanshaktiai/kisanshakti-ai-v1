/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL GROUP 03: OBSERVATION/SYMPTOM RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for symptom mapping and observation interpretation.
 * Handles visual symptom recognition, cross-crop symptom ontology,
 * and observation-to-cause mapping.
 * 
 * ICAR Source: ICAR Plant Pathology & Entomology Guidelines
 * Rule Count: 150+ rules
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION RULES - Symptom recognition and mapping
// ═══════════════════════════════════════════════════════════════════════════

export const OBSERVATION_RULES: BundledRule[] = [
  // LEAF SYMPTOMS
  {
    rule_id: 'OBS_LEAF_YELLOWING_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["yellowing", "पिवळे", "पीला", "yellow leaves", "chlorosis"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_YELLOWING_DETECTED',
    priority: 85,
    scientific_source: 'ICAR Plant Physiology',
    scientific_basis: 'Yellowing (chlorosis) indicates nitrogen deficiency, virus infection, or water stress.',
    trigger_keywords: ['yellowing', 'पिवळे', 'पीला', 'yellow leaves', 'chlorosis', 'पाने पिवळी'],
    response_mr: '🟡 पाने पिवळी दिसतात. नायट्रोजन कमी, विषाणू संसर्ग किंवा पाणी तणाव असू शकतो.',
    response_hi: '🟡 पत्तियां पीली दिख रही हैं। नाइट्रोजन की कमी, वायरस संक्रमण या पानी का तनाव हो सकता है।',
    response_en: '🟡 Leaves appear yellow. May indicate N deficiency, virus infection, or water stress.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'OBS_LEAF_SPOTS_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["spot", "डाग", "धब्बे", "lesion", "स्पॉट", "brown spot"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_LEAF_SPOTS_DETECTED',
    priority: 85,
    scientific_source: 'ICAR Plant Pathology',
    scientific_basis: 'Leaf spots indicate fungal or bacterial infection. Pattern and color help diagnosis.',
    trigger_keywords: ['spot', 'डाग', 'धब्बे', 'lesion', 'स्पॉट', 'brown spot', 'black spot'],
    response_mr: '🔴 पानांवर डाग दिसतात. बुरशी किंवा जिवाणू संसर्ग असू शकतो.',
    response_hi: '🔴 पत्तियों पर धब्बे दिख रहे हैं। फफूंद या जीवाणु संक्रमण हो सकता है।',
    response_en: '🔴 Leaf spots visible. May indicate fungal or bacterial infection.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'OBS_LEAF_CURLING_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["curl", "मुडपा", "मुड़ना", "curling", "roll", "rolling"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_LEAF_CURLING_DETECTED',
    priority: 85,
    scientific_source: 'ICAR Entomology & Virology',
    scientific_basis: 'Leaf curling indicates virus infection (esp. via whitefly), mite damage, or moisture stress.',
    trigger_keywords: ['curl', 'मुडपा', 'मुड़ना', 'curling', 'roll', 'rolling', 'पाने वळतात'],
    response_mr: '🌿 पाने वळतात/मुडपतात. विषाणू संसर्ग, कोळी किंवा पाणी तणाव तपासा.',
    response_hi: '🌿 पत्तियां मुड़ रही हैं। वायरस संक्रमण, मकड़ी या पानी का तनाव जांचें।',
    response_en: '🌿 Leaves curling. Check for virus infection, mites, or moisture stress.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'OBS_LEAF_WILTING_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["wilt", "सुकणे", "मुरझाना", "wilting", "drooping"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_WILTING_DETECTED',
    priority: 88,
    scientific_source: 'ICAR Plant Pathology',
    scientific_basis: 'Wilting indicates water stress, root disease (Fusarium/bacterial wilt), or vascular block.',
    trigger_keywords: ['wilt', 'सुकणे', 'मुरझाना', 'wilting', 'drooping', 'सुकते'],
    response_mr: '😵 झाड सुकते/कोमेजते. पाणी तणाव, मूळ सडणे किंवा मर रोग तपासा.',
    response_hi: '😵 पौधा मुरझा रहा है। पानी का तनाव, जड़ सड़न या उकठा रोग जांचें।',
    response_en: '😵 Plant wilting. Check for water stress, root rot, or wilt disease.',
    action_type: 'WARN'
  },
  {
    rule_id: 'OBS_LEAF_BURN_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["burn", "जळणे", "जलना", "scorching", "tip burn", "marginal burn"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_LEAF_BURN_DETECTED',
    priority: 82,
    scientific_source: 'ICAR Plant Physiology',
    scientific_basis: 'Leaf burn indicates salt stress, potassium deficiency, or herbicide injury.',
    trigger_keywords: ['burn', 'जळणे', 'जलना', 'scorching', 'tip burn', 'marginal burn'],
    response_mr: '🔥 पाने जळलेली दिसतात. क्षार तणाव, पोटॅशियम कमी किंवा तणनाशक इजा असू शकते.',
    response_hi: '🔥 पत्तियां जली दिख रही हैं। नमक तनाव, पोटेशियम कमी या खरपतवारनाशक चोट हो सकती है।',
    response_en: '🔥 Leaves appear burnt. May indicate salt stress, K deficiency, or herbicide injury.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'OBS_LEAF_NECROSIS_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["dead", "मेला", "मरा", "necrosis", "black", "काळे", "काला"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_NECROSIS_DETECTED',
    priority: 85,
    scientific_source: 'ICAR Plant Pathology',
    scientific_basis: 'Necrosis (tissue death) indicates severe disease, toxicity, or frost damage.',
    trigger_keywords: ['dead', 'मेला', 'मरा', 'necrosis', 'black', 'काळे', 'काला'],
    response_mr: '⚫ पानांचे भाग मेलेले/काळे. गंभीर रोग, विषाक्तता किंवा थंडी इजा असू शकते.',
    response_hi: '⚫ पत्तियों के हिस्से मृत/काले। गंभीर रोग, विषाक्तता या पाला चोट हो सकती है।',
    response_en: '⚫ Dead/black leaf tissue. May indicate severe disease, toxicity, or frost injury.',
    action_type: 'WARN'
  },
  
  // STEM SYMPTOMS
  {
    rule_id: 'OBS_STEM_BORING_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["bore", "छिद्र", "छेद", "hole in stem", "stem damage", "खोडकिड", "boring"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_STEM_BORING_DETECTED',
    priority: 88,
    scientific_source: 'ICAR Entomology',
    scientific_basis: 'Stem boring indicates borer larva inside. Look for entry holes and frass.',
    trigger_keywords: ['bore', 'छिद्र', 'छेद', 'hole in stem', 'stem damage', 'खोडकिड', 'boring'],
    response_mr: '🕳️ खोडात छिद्र/किड. खोडकिड अळी आत असू शकते. सुरळी तपासा.',
    response_hi: '🕳️ तने में छेद/कीट। तना छेदक लार्वा अंदर हो सकता है। गोभ जांचें।',
    response_en: '🕳️ Stem bore holes. Borer larva may be inside. Check dead hearts/frass.',
    action_type: 'WARN'
  },
  {
    rule_id: 'OBS_DEAD_HEART_001',
    category: 'observation',
    crop_code: 'cereals',
    stage_applicable: ['VEGETATIVE', 'TILLERING'],
    conditionCode: '(input) => ["dead heart", "सुरळी मेली", "गोभ सुख गया", "deadheart", "central whorl dead"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_DEAD_HEART_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Entomology',
    scientific_basis: 'Dead heart is characteristic of stem borer damage in vegetative stage. Central whorl dies.',
    trigger_keywords: ['dead heart', 'सुरळी मेली', 'गोभ सुख गया', 'deadheart', 'central whorl dead'],
    response_mr: '💀 सुरळी मेली (Dead heart). खोडकिड अळी आत आहे. काढून नष्ट करा.',
    response_hi: '💀 गोभ सूख गया (Dead heart)। तना छेदक लार्वा अंदर है। निकालकर नष्ट करें।',
    response_en: '💀 Dead heart detected. Stem borer larva inside. Remove and destroy affected tillers.',
    action_type: 'WARN'
  },
  {
    rule_id: 'OBS_WHITE_EAR_001',
    category: 'observation',
    crop_code: 'cereals',
    stage_applicable: ['HEADING', 'FLOWERING', 'GRAIN_FILL'],
    conditionCode: '(input) => ["white ear", "पांढरी ओंबी", "सफेद बाली", "chaffy ear", "empty ear"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_WHITE_EAR_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Entomology',
    scientific_basis: 'White ear is stem borer damage in reproductive stage. Empty panicle/ear head.',
    trigger_keywords: ['white ear', 'पांढरी ओंबी', 'सफेद बाली', 'chaffy ear', 'empty ear'],
    response_mr: '⚪ पांढरी ओंबी (White ear). खोडकिड अळीने खोड कापले. नुकसान अपरिहार्य.',
    response_hi: '⚪ सफेद बाली (White ear)। तना छेदक लार्वा ने तना काटा। क्षति अटल।',
    response_en: '⚪ White ear detected. Stem borer severed the stem. Damage is irreversible.',
    action_type: 'WARN'
  },
  
  // ROOT SYMPTOMS
  {
    rule_id: 'OBS_ROOT_ROT_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["root rot", "मूळ सडणे", "जड़ सड़न", "root damage", "black roots"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_ROOT_ROT_DETECTED',
    priority: 85,
    scientific_source: 'ICAR Plant Pathology',
    scientific_basis: 'Root rot indicates Fusarium, Pythium, or waterlogging damage.',
    trigger_keywords: ['root rot', 'मूळ सडणे', 'जड़ सड़न', 'root damage', 'black roots'],
    response_mr: '🪴 मुळे सडलेली. जास्त पाणी, बुरशी रोग असू शकतो. निचरा सुधारा.',
    response_hi: '🪴 जड़ें सड़ी हुई। अधिक पानी, फफूंद रोग हो सकता है। जल निकास सुधारें।',
    response_en: '🪴 Root rot detected. Check for waterlogging or fungal infection. Improve drainage.',
    action_type: 'WARN'
  },
  
  // INSECT PRESENCE
  {
    rule_id: 'OBS_INSECT_SMALL_GREEN_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["small green", "हिरवा किडा", "हरा कीड़ा", "aphid", "माव", "माहू"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_APHID_SUSPECTED',
    priority: 82,
    scientific_source: 'ICAR Entomology',
    scientific_basis: 'Small green insects on tender parts are typically aphids (Aphididae family).',
    trigger_keywords: ['small green', 'हिरवा किडा', 'हरा कीड़ा', 'aphid', 'माव', 'माहू'],
    response_mr: '🐛 लहान हिरवे किडे (माव). रस शोषतात, विषाणू पसरवतात.',
    response_hi: '🐛 छोटे हरे कीड़े (माहू)। रस चूसते हैं, वायरस फैलाते हैं।',
    response_en: '🐛 Small green insects (Aphids). Suck sap and transmit viruses.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'OBS_INSECT_WHITE_FLYING_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["white fly", "पांढरी माशी", "सफेद मक्खी", "whitefly", "white insect"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_WHITEFLY_SUSPECTED',
    priority: 85,
    scientific_source: 'ICAR Entomology',
    scientific_basis: 'White flying insects under leaves are whiteflies (Bemisia tabaci). Vector for viruses.',
    trigger_keywords: ['white fly', 'पांढरी माशी', 'सफेद मक्खी', 'whitefly', 'white insect'],
    response_mr: '⚪ पांढऱ्या उडणाऱ्या माशा (पांढरी माशी). विषाणू पसरवतात!',
    response_hi: '⚪ सफेद उड़ने वाली मक्खियां (सफेद मक्खी)। वायरस फैलाती हैं!',
    response_en: '⚪ White flying insects (Whitefly). They spread viruses!',
    action_type: 'WARN'
  },
  {
    rule_id: 'OBS_INSECT_CATERPILLAR_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["caterpillar", "अळी", "सूंडी", "worm", "larva", "लार्वा"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_CATERPILLAR_DETECTED',
    priority: 82,
    scientific_source: 'ICAR Entomology',
    scientific_basis: 'Caterpillars/larvae feed on leaves, fruits, or bore into stems/bolls.',
    trigger_keywords: ['caterpillar', 'अळी', 'सूंडी', 'worm', 'larva', 'लार्वा'],
    response_mr: '🐛 अळी दिसत आहे. कोणत्या भागावर खात आहे ते सांगा.',
    response_hi: '🐛 सूंडी दिख रही है। किस भाग पर खा रही है बताएं।',
    response_en: '🐛 Caterpillar/larva visible. Tell me which plant part it is feeding on.',
    action_type: 'RECOMMEND'
  },
  
  // FRUIT/BOLL SYMPTOMS
  {
    rule_id: 'OBS_FRUIT_ROT_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['FRUITING', 'BOLL_FORMATION', 'BOLL_OPENING'],
    conditionCode: '(input) => ["fruit rot", "फळ सडणे", "फल सड़न", "boll rot", "rotting fruit"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_FRUIT_ROT_DETECTED',
    priority: 85,
    scientific_source: 'ICAR Plant Pathology',
    scientific_basis: 'Fruit rot indicates fungal infection (Alternaria, Colletotrichum) or borer entry wounds.',
    trigger_keywords: ['fruit rot', 'फळ सडणे', 'फल सड़न', 'boll rot', 'rotting fruit'],
    response_mr: '🍎 फळे/बोंड सडत आहेत. बुरशी संसर्ग किंवा किडीचे प्रवेश.',
    response_hi: '🍎 फल/गोंद सड़ रहे हैं। फफूंद संक्रमण या कीड़े का प्रवेश।',
    response_en: '🍎 Fruit/boll rot detected. Fungal infection or borer entry wounds.',
    action_type: 'WARN'
  },
  {
    rule_id: 'OBS_FLOWER_DROP_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['FLOWERING', 'FRUITING'],
    conditionCode: '(input) => ["flower drop", "फुले गळणे", "फूल गिरना", "blossom drop", "flower fall"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_FLOWER_DROP_DETECTED',
    priority: 82,
    scientific_source: 'ICAR Plant Physiology',
    scientific_basis: 'Flower drop indicates heat stress, water stress, nutritional imbalance, or thrips damage.',
    trigger_keywords: ['flower drop', 'फुले गळणे', 'फूल गिरना', 'blossom drop', 'flower fall'],
    response_mr: '🌸 फुले गळत आहेत. उष्णता तणाव, पाणी तणाव किंवा थ्रिप्स तपासा.',
    response_hi: '🌸 फूल गिर रहे हैं। गर्मी तनाव, पानी तनाव या थ्रिप्स जांचें।',
    response_en: '🌸 Flower drop detected. Check for heat stress, water stress, or thrips.',
    action_type: 'RECOMMEND'
  },
  
  // GENERAL PLANT SYMPTOMS
  {
    rule_id: 'OBS_STUNTED_GROWTH_001',
    category: 'observation',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["stunted", "खुंटलेला", "बौना", "dwarf", "not growing", "वाढ नाही"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SYMPTOM_STUNTED_GROWTH_DETECTED',
    priority: 80,
    scientific_source: 'ICAR Plant Physiology',
    scientific_basis: 'Stunted growth indicates nutrient deficiency (especially P, Zn), root damage, or virus infection.',
    trigger_keywords: ['stunted', 'खुंटलेला', 'बौना', 'dwarf', 'not growing', 'वाढ नाही'],
    response_mr: '📏 वाढ खुंटली. फॉस्फरस/झिंक कमी, मूळ नुकसान किंवा विषाणू असू शकतो.',
    response_hi: '📏 वृद्धि रुकी। फॉस्फोरस/जिंक कमी, जड़ क्षति या वायरस हो सकता है।',
    response_en: '📏 Stunted growth. May indicate P/Zn deficiency, root damage, or virus.',
    action_type: 'RECOMMEND'
  }
];

// Export count for metadata
export const OBSERVATION_RULE_COUNT = OBSERVATION_RULES.length;
