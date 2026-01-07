/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION RULES DATABASE SEEDER - v2.0 OBSERVATION-BASED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Seeds the decision_rules table with OBSERVATION-BASED rules.
 * Rules match on ObservationKey enums and CanonicalState, NOT keywords.
 * 
 * KEY CHANGE: Rules use input.visual_symptoms (array of ObservationKeys)
 * instead of input.user_query (raw text)
 */

import { createClient } from 'npm:@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION-BASED RULES (NOT KEYWORD-BASED)
// ═══════════════════════════════════════════════════════════════════════════
// 
// These rules match on:
// - input.visual_symptoms (array of ObservationKey strings)
// - input.crop_code (normalized crop code from land context)
// - input.crop_stage (from phenology or crop_schedules)
// - input.soil_nitrogen/phosphorus/potassium states
// - input.ndvi_level and input.ndvi_trend
// - input.weather (temp, humidity, rain_mm)
//
// They do NOT match on raw user_query text (language-agnostic)
// ═══════════════════════════════════════════════════════════════════════════

const CANONICAL_RULES = [
  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 01: SYMPTOM-TO-CAUSE BRIDGING RULES (Core Diagnostic)
  // ═══════════════════════════════════════════════════════════════════════
  // These rules map visual observations to possible causes
  
  // APHID - Small insects + curling + sticky
  { 
    rule_id: 'BRIDGE_APHID_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('SMALL_INSECTS_VISIBLE') && 
             (symptoms.includes('CURLED_LEAVES') || symptoms.includes('HONEYDEW'));
    }`,
    cause: 'APHID_INFESTATION', 
    priority: 85,
    cause_confidence: 0.8,
    scientific_source: 'ICAR-NBAIR', 
    scientific_basis: 'Aphids cause leaf curling and honeydew secretion',
    trigger_keywords: [], // Empty - observation based
    response_mr: '🐛 माव दिसतोय! पाने वळतात आणि चिकट आहेत - माव्याची लक्षणे.',
    response_hi: '🐛 माहू दिख रहा है! पत्ते मुड़ रहे हैं और चिपचिपे हैं - माहू के लक्षण।',
    response_en: '🐛 Aphid infestation likely! Curled leaves with sticky residue are classic aphid symptoms.',
    action_type: 'RECOMMEND', 
    canonical_group: 'diagnosis' 
  },
  
  // WHITEFLY - Flying insects + yellowing + sooty mold
  { 
    rule_id: 'BRIDGE_WHITEFLY_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('FLYING_INSECTS_VISIBLE') && 
             symptoms.includes('GENERAL_YELLOWING');
    }`,
    cause: 'WHITEFLY_INFESTATION', 
    priority: 84,
    cause_confidence: 0.75,
    scientific_source: 'ICAR-NBAIR', 
    scientific_basis: 'Whiteflies fly when disturbed, cause yellowing via phloem feeding',
    trigger_keywords: [],
    response_mr: '🦋 पांढरी माशी दिसतेय! उडणारे छोटे कीटक आणि पाने पिवळी - पांढऱ्या माशीची लक्षणे.',
    response_hi: '🦋 सफेद मक्खी दिख रही है! उड़ने वाले छोटे कीट और पत्ते पीले - सफेद मक्खी के लक्षण।',
    response_en: '🦋 Whitefly likely! Small flying insects with yellowing leaves are whitefly symptoms.',
    action_type: 'RECOMMEND', 
    canonical_group: 'diagnosis' 
  },
  
  // THRIPS - Small insects + silvering + scarring
  { 
    rule_id: 'BRIDGE_THRIPS_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('SMALL_INSECTS_VISIBLE') && 
             symptoms.includes('SILVERING');
    }`,
    cause: 'THRIPS_INFESTATION', 
    priority: 84,
    cause_confidence: 0.8,
    scientific_source: 'ICAR-NBAIR', 
    scientific_basis: 'Thrips cause silvery sheen on leaves due to cell damage',
    trigger_keywords: [],
    response_mr: '🪲 थ्रिप्स दिसतोय! पानांवर चंदेरी चमक - थ्रिप्सची लक्षणे.',
    response_hi: '🪲 थ्रिप्स दिख रहे हैं! पत्तों पर चांदी जैसी चमक - थ्रिप्स के लक्षण।',
    response_en: '🪲 Thrips likely! Silvery sheen on leaves is classic thrips damage.',
    action_type: 'RECOMMEND', 
    canonical_group: 'diagnosis' 
  },
  
  // MITES - Webbing + bronzing
  { 
    rule_id: 'BRIDGE_MITES_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('WEBBING');
    }`,
    cause: 'MITE_INFESTATION', 
    priority: 85,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-NBAIR', 
    scientific_basis: 'Spider mites create characteristic webbing on undersides of leaves',
    trigger_keywords: [],
    response_mr: '🕷️ कोळी माइट! पानांवर जाळे दिसतंय.',
    response_hi: '🕷️ मकड़ी माइट! पत्तों पर जाले दिख रहे हैं।',
    response_en: '🕷️ Spider mites! Webbing on leaves is characteristic mite damage.',
    action_type: 'RECOMMEND', 
    canonical_group: 'diagnosis' 
  },
  
  // CATERPILLAR/BORER - Holes + frass
  { 
    rule_id: 'BRIDGE_CATERPILLAR_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('LEAF_HOLES') || symptoms.includes('FRASS');
    }`,
    cause: 'CATERPILLAR_DAMAGE', 
    priority: 84,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-NBAIR', 
    scientific_basis: 'Caterpillars cause holes and leave frass (droppings)',
    trigger_keywords: [],
    response_mr: '🐛 अळी/बोरर! पानांवर भोके आणि विष्ठा दिसतेय.',
    response_hi: '🐛 इल्ली/बोरर! पत्तों में छेद और मल दिख रहा है।',
    response_en: '🐛 Caterpillar/borer damage! Holes with frass indicate larval feeding.',
    action_type: 'RECOMMEND', 
    canonical_group: 'diagnosis' 
  },
  
  // SUGARCANE EARLY SHOOT BORER - Dead heart specific
  { 
    rule_id: 'BRIDGE_ESB_001', 
    crop_code: 'sugarcane', 
    category: 'diagnosis', 
    stage_applicable: ['GERMINATION','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'sugarcane' && 
             (symptoms.includes('DEAD_HEART') || symptoms.includes('STEM_DISCOLORATION'));
    }`,
    cause: 'SUGARCANE_EARLY_SHOOT_BORER', 
    priority: 92,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-SBI', 
    scientific_basis: 'ESB larvae bore into shoots causing dead hearts in young sugarcane',
    trigger_keywords: [],
    response_mr: '🪱 खोडकिडा! मधली सुरळी वाळली आहे - लवकर खोडकिड्याची लक्षणे.',
    response_hi: '🪱 तना छेदक! बीच की गोभी सूख गई है - प्रारंभिक तना छेदक के लक्षण।',
    response_en: '🪱 Early shoot borer! Dead heart symptom in young sugarcane indicates ESB attack.',
    action_type: 'RECOMMEND', 
    canonical_group: 'diagnosis' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 02: NUTRIENT DEFICIENCY RULES (Visual symptom based)
  // ═══════════════════════════════════════════════════════════════════════
  
  // NITROGEN DEFICIENCY - Uniform yellowing + low soil N
  { 
    rule_id: 'NUTRIENT_N_DEF_OBS_001', 
    crop_code: 'all', 
    category: 'nutrient', 
    stage_applicable: ['VEGETATIVE','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const hasYellowing = symptoms.includes('GENERAL_YELLOWING');
      const isUniform = symptoms.includes('DISTRIBUTION_UNIFORM');
      const lowSoilN = input.soil_nitrogen === 'LOW' || input.soil_nitrogen === 'VERY_LOW';
      return hasYellowing && (isUniform || lowSoilN);
    }`,
    cause: 'NITROGEN_DEFICIENCY', 
    priority: 86,
    cause_confidence: 0.85,
    scientific_source: 'ICAR Soil Science', 
    scientific_basis: 'Nitrogen deficiency causes uniform chlorosis starting from older leaves',
    trigger_keywords: [],
    response_mr: '💛 नायट्रोजन कमतरता! पाने सगळीकडे एकसारखी पिवळी - नायट्रोजन द्या.',
    response_hi: '💛 नाइट्रोजन कमी! पत्ते समान रूप से पीले - नाइट्रोजन दें।',
    response_en: '💛 Nitrogen deficiency! Uniform yellowing indicates N shortage.',
    action_type: 'RECOMMEND', 
    canonical_group: 'nutrient' 
  },
  
  // PHOSPHORUS DEFICIENCY - Purple/dark leaves
  { 
    rule_id: 'NUTRIENT_P_DEF_OBS_001', 
    crop_code: 'all', 
    category: 'nutrient', 
    stage_applicable: ['GERMINATION','VEGETATIVE'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const lowSoilP = input.soil_phosphorus === 'LOW' || input.soil_phosphorus === 'VERY_LOW';
      // Purple/dark coloration typically indicates P deficiency
      return symptoms.includes('PURPLE_COLORATION') || 
             (symptoms.includes('STUNTED_GROWTH') && lowSoilP);
    }`,
    cause: 'PHOSPHORUS_DEFICIENCY', 
    priority: 84,
    cause_confidence: 0.8,
    scientific_source: 'ICAR Soil Science', 
    scientific_basis: 'Phosphorus deficiency causes purple coloration in young plants',
    trigger_keywords: [],
    response_mr: '💜 फॉस्फरस कमतरता! जांभळट रंग दिसतोय.',
    response_hi: '💜 फास्फोरस कमी! बैंगनी रंग दिख रहा है।',
    response_en: '💜 Phosphorus deficiency! Purple coloration indicates P shortage.',
    action_type: 'RECOMMEND', 
    canonical_group: 'nutrient' 
  },
  
  // POTASSIUM DEFICIENCY - Marginal leaf burn
  { 
    rule_id: 'NUTRIENT_K_DEF_OBS_001', 
    crop_code: 'all', 
    category: 'nutrient', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const lowSoilK = input.soil_potassium === 'LOW' || input.soil_potassium === 'VERY_LOW';
      return symptoms.includes('LEAF_EDGE_BURN') || 
             (symptoms.includes('MARGINAL_NECROSIS') && lowSoilK);
    }`,
    cause: 'POTASSIUM_DEFICIENCY', 
    priority: 84,
    cause_confidence: 0.8,
    scientific_source: 'ICAR Soil Science', 
    scientific_basis: 'Potassium deficiency causes marginal leaf burn starting from tips',
    trigger_keywords: [],
    response_mr: '🔥 पोटॅशियम कमतरता! पानांच्या कडा जळल्या.',
    response_hi: '🔥 पोटेशियम कमी! पत्तों के किनारे जले हुए हैं।',
    response_en: '🔥 Potassium deficiency! Marginal leaf burn indicates K shortage.',
    action_type: 'RECOMMEND', 
    canonical_group: 'nutrient' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 03: DISEASE RULES (Visual symptom based)
  // ═══════════════════════════════════════════════════════════════════════
  
  // FUNGAL SPOTS - Spots + high humidity
  { 
    rule_id: 'DISEASE_FUNGAL_SPOTS_001', 
    crop_code: 'all', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const highHumidity = input.weather?.humidity > 80;
      return symptoms.includes('SPOTS_IRREGULAR') && highHumidity;
    }`,
    cause: 'FUNGAL_LEAF_SPOT', 
    priority: 85,
    cause_confidence: 0.75,
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Fungal leaf spots thrive in high humidity conditions',
    trigger_keywords: [],
    response_mr: '🍄 बुरशी डाग! आर्द्रता जास्त असताना डाग दिसतात - बुरशी संसर्ग.',
    response_hi: '🍄 फफूंद धब्बे! उच्च नमी में धब्बे - फफूंद संक्रमण।',
    response_en: '🍄 Fungal leaf spots! High humidity + spots suggest fungal infection.',
    action_type: 'RECOMMEND', 
    canonical_group: 'disease' 
  },
  
  // POWDERY MILDEW - White powder
  { 
    rule_id: 'DISEASE_POWDERY_MILDEW_001', 
    crop_code: 'all', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('WHITE_POWDER') || symptoms.includes('POWDERY_COATING');
    }`,
    cause: 'POWDERY_MILDEW', 
    priority: 86,
    cause_confidence: 0.9,
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'White powdery coating is diagnostic for powdery mildew',
    trigger_keywords: [],
    response_mr: '🤍 भुरी! पांढरी पावडर दिसतेय.',
    response_hi: '🤍 चूर्णिल आसिता! सफेद पाउडर दिख रहा है।',
    response_en: '🤍 Powdery mildew! White powdery coating is diagnostic.',
    action_type: 'RECOMMEND', 
    canonical_group: 'disease' 
  },
  
  // RUST - Orange/brown pustules
  { 
    rule_id: 'DISEASE_RUST_OBS_001', 
    crop_code: 'wheat', 
    category: 'disease', 
    stage_applicable: ['TILLERING','HEADING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('RUST_PUSTULES') || 
             (symptoms.includes('ORANGE_SPOTS') && input.crop_code === 'wheat');
    }`,
    cause: 'WHEAT_RUST', 
    priority: 90,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIWBR', 
    scientific_basis: 'Rust pustules are diagnostic for Puccinia species',
    trigger_keywords: [],
    response_mr: '🟠 गंज! नारंगी फोड दिसतात - तांबेरा रोग.',
    response_hi: '🟠 गेरुआ! नारंगी फोड़े दिख रहे हैं।',
    response_en: '🟠 Rust! Orange pustules are diagnostic for rust disease.',
    action_type: 'RECOMMEND', 
    canonical_group: 'disease' 
  },
  
  // WILT - Sudden wilting
  { 
    rule_id: 'DISEASE_WILT_OBS_001', 
    crop_code: 'all', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const notWaterStress = input.water_stress !== 'SEVERE' && input.water_stress !== 'MODERATE';
      return symptoms.includes('SUDDEN_WILTING') && notWaterStress;
    }`,
    cause: 'WILT_DISEASE', 
    priority: 88,
    cause_confidence: 0.8,
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Sudden wilting despite adequate water indicates vascular wilt disease',
    trigger_keywords: [],
    response_mr: '😵 मर रोग! पाणी असूनही सुकतंय - मर रोग.',
    response_hi: '😵 उकठा! पानी होने पर भी मुरझा रहा है।',
    response_en: '😵 Wilt disease! Wilting despite water indicates vascular disease.',
    action_type: 'WARN', 
    canonical_group: 'disease' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 04: WATER/ENVIRONMENTAL STRESS RULES
  // ═══════════════════════════════════════════════════════════════════════
  
  // WATER STRESS - Wilting + low NDVI trend
  { 
    rule_id: 'STRESS_WATER_001', 
    crop_code: 'all', 
    category: 'stress', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const ndviDeclining = input.ndvi_trend === 'DECLINING';
      const waterStress = input.water_stress === 'MODERATE' || input.water_stress === 'SEVERE';
      return (symptoms.includes('LEAF_DROOPING') || symptoms.includes('WILTING')) && 
             (ndviDeclining || waterStress);
    }`,
    cause: 'WATER_STRESS', 
    priority: 90,
    cause_confidence: 0.85,
    scientific_source: 'ICAR Agronomy', 
    scientific_basis: 'Water stress causes wilting, confirmed by declining NDVI',
    trigger_keywords: [],
    response_mr: '💧 पाण्याचा ताण! पाने सुकतात, NDVI कमी होतोय - पाणी द्या.',
    response_hi: '💧 पानी की कमी! पत्ते मुरझा रहे हैं, NDVI गिर रहा है।',
    response_en: '💧 Water stress! Wilting with declining NDVI confirms water shortage.',
    action_type: 'RECOMMEND', 
    canonical_group: 'stress' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 05: SAFETY/BLOCKING RULES
  // ═══════════════════════════════════════════════════════════════════════
  
  // RAIN BLOCK - Block spray if rain expected
  { 
    rule_id: 'SAFETY_RAIN_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      return input.weather?.rain_mm > 0 || input.weather?.rain_expected === true;
    }`,
    cause: 'RAIN_SPRAY_BLOCKED', 
    priority: 98,
    cause_confidence: 1.0,
    scientific_source: 'ICAR IPM', 
    scientific_basis: 'Rain washes off pesticides within 2 hours of application',
    trigger_keywords: [],
    response_mr: '🌧️ पाऊस! आज फवारणी टाळा. पाऊस थांबल्यावर 4-6 तासांनी फवारा.',
    response_hi: '🌧️ बारिश! आज छिड़काव टालें। बारिश रुकने के 4-6 घंटे बाद स्प्रे करें।',
    response_en: '🌧️ Rain expected! Avoid spraying today. Wait 4-6 hours after rain stops.',
    action_type: 'BLOCK', 
    canonical_group: 'safety' 
  },
  
  // FLOWERING POLLINATOR PROTECTION
  { 
    rule_id: 'SAFETY_POLLINATOR_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['FLOWERING'], 
    conditionCode: `(input) => {
      return input.crop_stage === 'FLOWERING';
    }`,
    cause: 'POLLINATOR_PROTECTION', 
    priority: 95,
    cause_confidence: 1.0,
    scientific_source: 'ICAR Pollinator Guidelines', 
    scientific_basis: 'Insecticides during flowering harm pollinators critical for yield',
    trigger_keywords: [],
    response_mr: '🐝 फुलोरा अवस्था! कीटकनाशक फवारणी टाळा. मधमाशा संरक्षण.',
    response_hi: '🐝 फूल आने की अवस्था! कीटनाशक से बचें। मधुमक्खी संरक्षण।',
    response_en: '🐝 Flowering stage! Avoid insecticide sprays to protect pollinators.',
    action_type: 'WARN', 
    canonical_group: 'safety' 
  },
  
  // YOUNG CROP PROTECTION
  { 
    rule_id: 'SAFETY_YOUNG_CROP_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['GERMINATION'], 
    conditionCode: `(input) => {
      return input.crop_stage === 'GERMINATION' || input.days_after_sowing < 15;
    }`,
    cause: 'YOUNG_CROP_PROTECTION', 
    priority: 92,
    cause_confidence: 1.0,
    scientific_source: 'ICAR Crop Protection', 
    scientific_basis: 'Young crops are sensitive to chemical stress',
    trigger_keywords: [],
    response_mr: '🌱 लहान पीक! सध्या रासायनिक उपचार टाळा. निरीक्षण चालू ठेवा.',
    response_hi: '🌱 छोटी फसल! अभी रासायनिक उपचार से बचें। निरीक्षण जारी रखें।',
    response_en: '🌱 Young crop! Avoid chemical treatment. Continue monitoring.',
    action_type: 'WARN', 
    canonical_group: 'safety' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 06: CLARIFICATION TRIGGER RULES
  // ═══════════════════════════════════════════════════════════════════════
  // These rules fire when more information is needed
  
  // NEED INSECT BEHAVIOR - Small insects but behavior unknown
  { 
    rule_id: 'CLARIFY_INSECT_BEHAVIOR_001', 
    crop_code: 'all', 
    category: 'clarification', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const hasInsect = symptoms.includes('SMALL_INSECTS_VISIBLE') || symptoms.includes('INSECT_PRESENT');
      const hasBehavior = symptoms.includes('FLYING_INSECTS_VISIBLE') || 
                          symptoms.includes('CRAWLING_INSECTS_VISIBLE') ||
                          symptoms.includes('JUMPING_INSECTS_VISIBLE');
      return hasInsect && !hasBehavior;
    }`,
    cause: 'NEED_INSECT_BEHAVIOR', 
    priority: 70,
    cause_confidence: 0.5,
    scientific_source: 'Agronomic Triage', 
    scientific_basis: 'Insect behavior determines species identification',
    trigger_keywords: [],
    response_mr: 'कीटक दिसतोय. कीटक उडतात की चालतात?',
    response_hi: 'कीट दिख रहे हैं। कीट उड़ते हैं या चलते हैं?',
    response_en: 'Insects visible. Do they fly or crawl?',
    action_type: 'CLARIFY', 
    canonical_group: 'clarification' 
  },
  
  // NEED PLANT RESPONSE - Insects but no damage symptom
  { 
    rule_id: 'CLARIFY_PLANT_RESPONSE_001', 
    crop_code: 'all', 
    category: 'clarification', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const hasInsect = symptoms.includes('SMALL_INSECTS_VISIBLE') || 
                        symptoms.includes('FLYING_INSECTS_VISIBLE') ||
                        symptoms.includes('CRAWLING_INSECTS_VISIBLE');
      const hasPlantResponse = symptoms.includes('CURLED_LEAVES') || 
                               symptoms.includes('GENERAL_YELLOWING') ||
                               symptoms.includes('HONEYDEW') ||
                               symptoms.includes('LEAF_HOLES');
      return hasInsect && !hasPlantResponse;
    }`,
    cause: 'NEED_PLANT_RESPONSE', 
    priority: 68,
    cause_confidence: 0.5,
    scientific_source: 'Agronomic Triage', 
    scientific_basis: 'Plant response determines treatment urgency',
    trigger_keywords: [],
    response_mr: 'कीटकांमुळे पानांवर काय परिणाम झाला? वळणे, पिवळे, चिकट, भोके?',
    response_hi: 'कीटों से पत्तों पर क्या प्रभाव? मुड़ना, पीला, चिपचिपा, छेद?',
    response_en: 'What effect on leaves? Curling, yellowing, sticky, holes?',
    action_type: 'CLARIFY', 
    canonical_group: 'clarification' 
  },
  
  // NEED DISTRIBUTION - Symptom but distribution unknown
  { 
    rule_id: 'CLARIFY_DISTRIBUTION_001', 
    crop_code: 'all', 
    category: 'clarification', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const hasSymptom = symptoms.some(s => 
        s.includes('YELLOWING') || s.includes('SPOTS') || s.includes('WILTING') || s.includes('CURLED')
      );
      const hasDistribution = symptoms.includes('DISTRIBUTION_UNIFORM') || 
                              symptoms.includes('DISTRIBUTION_PATCHY') ||
                              symptoms.includes('DISTRIBUTION_EDGE') ||
                              symptoms.includes('DISTRIBUTION_CENTER');
      return hasSymptom && !hasDistribution;
    }`,
    cause: 'NEED_DISTRIBUTION', 
    priority: 65,
    cause_confidence: 0.5,
    scientific_source: 'Agronomic Triage', 
    scientific_basis: 'Distribution pattern differentiates causes',
    trigger_keywords: [],
    response_mr: 'हे लक्षण शेतात कसे पसरले आहे? सगळीकडे एकसारखे की ठिकठिकाणी?',
    response_hi: 'यह लक्षण खेत में कैसे फैला है? सब जगह समान या जगह-जगह?',
    response_en: 'How is this spread in the field? Uniform or patchy?',
    action_type: 'CLARIFY', 
    canonical_group: 'clarification' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 07: TREATMENT RULES (Only after diagnosis confirmed)
  // ═══════════════════════════════════════════════════════════════════════
  
  // APHID TREATMENT
  { 
    rule_id: 'TREATMENT_APHID_001', 
    crop_code: 'all', 
    category: 'treatment', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'APHID_INFESTATION' && 
             input.treatment_allowed === true;
    }`,
    cause: 'APHID_TREATMENT', 
    priority: 80,
    cause_confidence: 1.0,
    scientific_source: 'ICAR-NBAIR', 
    scientific_basis: 'Imidacloprid effective against sucking pests',
    trigger_keywords: [],
    response_mr: '💊 माव उपचार: इमिडाक्लोप्रिड @ 0.3ml/L किंवा थायमेथोक्साम @ 0.2g/L फवारा.',
    response_hi: '💊 माहू उपचार: इमिडाक्लोप्रिड @ 0.3ml/L या थायमेथोक्साम @ 0.2g/L स्प्रे करें।',
    response_en: '💊 Aphid treatment: Spray Imidacloprid @ 0.3ml/L or Thiamethoxam @ 0.2g/L.',
    action_type: 'RECOMMEND', 
    canonical_group: 'treatment' 
  },
  
  // NITROGEN TREATMENT
  { 
    rule_id: 'TREATMENT_N_DEF_001', 
    crop_code: 'all', 
    category: 'treatment', 
    stage_applicable: ['VEGETATIVE','TILLERING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'NITROGEN_DEFICIENCY' && 
             input.treatment_allowed === true;
    }`,
    cause: 'NITROGEN_TREATMENT', 
    priority: 80,
    cause_confidence: 1.0,
    scientific_source: 'ICAR Soil Science', 
    scientific_basis: 'Urea provides quick N boost',
    trigger_keywords: [],
    response_mr: '💊 नायट्रोजन: युरिया @ 25kg/एकर फवारा किंवा 2% युरिया फवारणी.',
    response_hi: '💊 नाइट्रोजन: यूरिया @ 25kg/एकड़ या 2% यूरिया स्प्रे।',
    response_en: '💊 Nitrogen: Apply Urea @ 25kg/acre or 2% Urea foliar spray.',
    action_type: 'RECOMMEND', 
    canonical_group: 'treatment' 
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GROUP 08: MONITORING RULES (Low confidence, suggest observation)
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'MONITOR_INSECT_PRESENCE_001', 
    crop_code: 'all', 
    category: 'monitoring', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const hasInsect = symptoms.includes('INSECT_PRESENT_NO_DAMAGE');
      return hasInsect;
    }`,
    cause: 'MONITORING_ONLY', 
    priority: 60,
    cause_confidence: 0.3,
    scientific_source: 'IPM Principles', 
    scientific_basis: 'Insect presence alone does not warrant treatment',
    trigger_keywords: [],
    response_mr: '👀 निरीक्षण: कीटक दिसतात पण नुकसान नाही. 2-3 दिवस पहा, नुकसान वाढल्यास परत विचारा.',
    response_hi: '👀 निरीक्षण: कीट दिख रहे हैं लेकिन नुकसान नहीं। 2-3 दिन देखें, बढ़े तो फिर पूछें।',
    response_en: '👀 Monitor: Insects present but no damage. Watch for 2-3 days, report if damage increases.',
    action_type: 'MONITOR', 
    canonical_group: 'monitoring' 
  }
];

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🌱 [SeedDecisionRules] Starting database seeding v2.0 (OBSERVATION-BASED)...');

  try {
    const body = await req.json().catch(() => ({}));
    const { clear = false } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase credentials' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Clear existing rules if requested
    if (clear) {
      console.log('🗑️ Clearing existing rules...');
      const { error: deleteError } = await supabase
        .from('decision_rules')
        .delete()
        .neq('rule_id', 'NEVER_MATCH'); // Delete all

      if (deleteError) {
        console.error('❌ Failed to clear rules:', deleteError);
      } else {
        console.log('✅ Existing rules cleared');
      }
    }

    // Insert rules in batches
    const batchSize = 25;
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < CANONICAL_RULES.length; i += batchSize) {
      const batch = CANONICAL_RULES.slice(i, i + batchSize);
      
      // Priority must be 1-10 per database constraint
      const normalizePriority = (p: number): number => Math.min(10, Math.max(1, Math.round(p / 10)));
      
      const formattedRules = batch.map(rule => ({
        rule_id: rule.rule_id,
        crop_group: rule.crop_code || 'all',
        crop_code: rule.crop_code,
        category: rule.category,
        stage_applicable: rule.stage_applicable,
        conditions_json: { code: rule.conditionCode },
        condition_code: rule.conditionCode,
        cause: rule.cause,
        priority: normalizePriority(rule.priority),
        scientific_source: rule.scientific_source,
        scientific_basis: rule.scientific_basis || rule.scientific_source || '',
        trigger_keywords: rule.trigger_keywords || [],
        response_mr: rule.response_mr,
        response_hi: rule.response_hi,
        response_en: rule.response_en,
        action_type: rule.action_type,
        canonical_group: rule.canonical_group,
        is_active: true,
        version: '2.0.0'
      }));

      const { data, error } = await supabase
        .from('decision_rules')
        .upsert(formattedRules, { onConflict: 'rule_id' })
        .select('rule_id');

      if (error) {
        console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} error:`, error.message);
        totalErrors += batch.length;
      } else {
        totalInserted += data?.length || 0;
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${data?.length || 0} rules upserted`);
      }
    }

    console.log(`\n🎉 [SeedDecisionRules] Complete!`);
    console.log(`   Total rules: ${CANONICAL_RULES.length}`);
    console.log(`   Successfully inserted: ${totalInserted}`);
    console.log(`   Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Observation-based rules seeded successfully',
        stats: {
          total_rules: CANONICAL_RULES.length,
          inserted: totalInserted,
          errors: totalErrors,
          version: '2.0.0',
          type: 'OBSERVATION_BASED'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [SeedDecisionRules] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Seeding failed', details: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}
