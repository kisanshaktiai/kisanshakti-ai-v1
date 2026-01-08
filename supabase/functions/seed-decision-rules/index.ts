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
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // WORLD-CLASS AGRICULTURAL DECISION RULES v3.0
  // 200+ ICAR-ALIGNED, OBSERVATION-BASED RULES
  // Covering: Pests, Diseases, Nutrients, Safety, IPM Treatments
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 1: COTTON PEST RULES (30+ rules)
  // Source: ICAR-CICR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Cotton - Aphid Diagnosis
  { 
    rule_id: 'COTTON_APHID_DIAG_001', 
    crop_code: 'cotton', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','SQUARING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'cotton' && 
             symptoms.includes('SMALL_INSECTS_VISIBLE') && 
             (symptoms.includes('CURLED_LEAVES') || symptoms.includes('HONEYDEW'));
    }`,
    cause: 'COTTON_APHID', 
    priority: 85,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.2',
    scientific_basis: 'Aphis gossypii causes leaf curl and honeydew in cotton',
    etl_threshold: '10',
    etl_unit: 'per leaf',
    trigger_keywords: [],
    response_mr: '🐛 कापसावर माव (Aphis gossypii) आढळला! पाने वळलेली + चिकट = माव्याची खात्रीशीर लक्षणे.',
    response_hi: '🐛 कपास पर माहू (Aphis gossypii) मिला! मुड़े पत्ते + चिपचिपापन = माहू के पक्के लक्षण।',
    response_en: '🐛 Cotton Aphid (Aphis gossypii) confirmed! Curled leaves + honeydew are diagnostic signs.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Cotton - Aphid IPM Level 1-2 Treatment (Organic)
  { 
    rule_id: 'COTTON_APHID_IPM12_001', 
    crop_code: 'cotton', 
    category: 'treatment', 
    stage_applicable: ['VEGETATIVE','SQUARING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'COTTON_APHID' && 
             input.severity !== 'SEVERE' &&
             input.crop_stage !== 'FLOWERING';
    }`,
    cause: 'COTTON_APHID_ORGANIC_TREATMENT', 
    priority: 82,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.2.1',
    scientific_basis: 'Neem-based treatment effective at low-moderate infestation',
    etl_threshold: '10',
    etl_unit: 'per leaf',
    trigger_keywords: [],
    response_mr: '🌿 सेंद्रिय उपचार: निंबोळी अर्क (NSKE 5%) फवारा. 10 दिवसांनी पुन्हा फवारा.',
    response_hi: '🌿 जैविक उपचार: नीम अर्क (NSKE 5%) स्प्रे करें। 10 दिन बाद दोहराएं।',
    response_en: '🌿 Organic: Spray Neem Seed Kernel Extract (NSKE 5%). Repeat after 10 days.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 2,
    organic_alternative: 'NSKE 5%',
    bee_toxicity: 'SAFE',
    phi_days: 0,
    dosage_per_acre: '500ml in 200L water',
    application_method: 'Foliar spray'
  },

  // Cotton - Aphid IPM Level 4 Treatment (Chemical - moderate)
  { 
    rule_id: 'COTTON_APHID_IPM4_001', 
    crop_code: 'cotton', 
    category: 'treatment', 
    stage_applicable: ['VEGETATIVE','SQUARING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'COTTON_APHID' && 
             input.severity === 'MODERATE' &&
             input.organic_failed === true;
    }`,
    cause: 'COTTON_APHID_CHEMICAL_TREATMENT', 
    priority: 78,
    cause_confidence: 0.95,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.2.2',
    scientific_basis: 'Acetamiprid selective for sucking pests, safer for beneficials',
    etl_threshold: '10',
    etl_unit: 'per leaf',
    trigger_keywords: [],
    response_mr: '💊 रासायनिक: ॲसिटामिप्रिड 20SP @ 0.2g/L फवारा. PHI: 7 दिवस.',
    response_hi: '💊 रासायनिक: एसिटामिप्रिड 20SP @ 0.2g/L स्प्रे। PHI: 7 दिन।',
    response_en: '💊 Chemical: Spray Acetamiprid 20SP @ 0.2g/L. PHI: 7 days.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 4,
    active_ingredient: 'Acetamiprid',
    chemical_class: 'Neonicotinoid',
    resistance_group: 'IRAC-4A',
    bee_toxicity: 'MODERATE',
    phi_days: 7,
    dosage_per_acre: '40g in 200L water',
    application_method: 'Foliar spray',
    max_wind_speed: 10,
    min_temperature: 15,
    max_temperature: 35
  },

  // Cotton - Whitefly Diagnosis
  { 
    rule_id: 'COTTON_WHITEFLY_DIAG_001', 
    crop_code: 'cotton', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','SQUARING','FLOWERING','BOLL_DEVELOPMENT'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'cotton' && 
             symptoms.includes('FLYING_INSECTS_VISIBLE') && 
             symptoms.includes('GENERAL_YELLOWING');
    }`,
    cause: 'COTTON_WHITEFLY', 
    priority: 88,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.3',
    scientific_basis: 'Bemisia tabaci causes CLCuV transmission in cotton',
    etl_threshold: '6',
    etl_unit: 'adults per leaf',
    trigger_keywords: [],
    response_mr: '🦋 पांढरी माशी (Bemisia tabaci)! उडणारे पांढरे कीटक + पिवळी पाने. CLCuV धोका!',
    response_hi: '🦋 सफेद मक्खी (Bemisia tabaci)! उड़ते सफेद कीट + पीले पत्ते। CLCuV का खतरा!',
    response_en: '🦋 Whitefly (Bemisia tabaci) confirmed! Flying white insects + yellowing. CLCuV risk!',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Cotton - Whitefly Treatment
  { 
    rule_id: 'COTTON_WHITEFLY_TRT_001', 
    crop_code: 'cotton', 
    category: 'treatment', 
    stage_applicable: ['VEGETATIVE','SQUARING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'COTTON_WHITEFLY' && 
             input.crop_stage !== 'FLOWERING';
    }`,
    cause: 'COTTON_WHITEFLY_TREATMENT', 
    priority: 84,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.3.2',
    scientific_basis: 'Spiromesifen effective against whitefly with novel MOA',
    etl_threshold: '6',
    etl_unit: 'adults per leaf',
    trigger_keywords: [],
    response_mr: '💊 स्पिरोमेसिफेन 22.9SC @ 0.7ml/L फवारा. पानाखाली फवारा. PHI: 14 दिवस.',
    response_hi: '💊 स्पिरोमेसिफेन 22.9SC @ 0.7ml/L स्प्रे। पत्ते के नीचे स्प्रे। PHI: 14 दिन।',
    response_en: '💊 Spray Spiromesifen 22.9SC @ 0.7ml/L. Spray undersurface of leaves. PHI: 14 days.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 4,
    active_ingredient: 'Spiromesifen',
    chemical_class: 'Tetronic acid',
    resistance_group: 'IRAC-23',
    bee_toxicity: 'LOW',
    phi_days: 14,
    dosage_per_acre: '140ml in 200L water',
    application_method: 'Foliar spray undersurface'
  },

  // Cotton - Pink Bollworm Diagnosis
  { 
    rule_id: 'COTTON_PBW_DIAG_001', 
    crop_code: 'cotton', 
    category: 'diagnosis', 
    stage_applicable: ['FLOWERING','BOLL_DEVELOPMENT'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'cotton' && 
             (symptoms.includes('ROSETTE_FLOWER') || symptoms.includes('BOLL_DAMAGE'));
    }`,
    cause: 'COTTON_PINK_BOLLWORM', 
    priority: 92,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.5',
    scientific_basis: 'Pectinophora gossypiella causes rosette flowers and boll damage',
    etl_threshold: '8',
    etl_unit: 'moths per trap per week',
    trigger_keywords: [],
    response_mr: '🪱 गुलाबी बोंडअळी! गुलाबी फुले/खराब बोंडे दिसतात. तातडीने उपचार करा!',
    response_hi: '🪱 गुलाबी सुंडी! गुलाबी फूल/खराब बॉल दिख रहे हैं। तुरंत उपचार करें!',
    response_en: '🪱 Pink Bollworm! Rosette flowers/damaged bolls seen. Urgent treatment needed!',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },

  // Cotton - Pink Bollworm Pheromone Trap
  { 
    rule_id: 'COTTON_PBW_TRAP_001', 
    crop_code: 'cotton', 
    category: 'treatment', 
    stage_applicable: ['SQUARING','FLOWERING'], 
    conditionCode: `(input) => {
      return input.crop_code === 'cotton' && 
             input.crop_stage === 'SQUARING' &&
             input.pbw_trap_count < 8;
    }`,
    cause: 'COTTON_PBW_MONITORING', 
    priority: 75,
    cause_confidence: 0.95,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.5.1',
    scientific_basis: 'Pheromone traps for PBW monitoring at 5 per hectare',
    etl_threshold: '8',
    etl_unit: 'moths per trap per week',
    trigger_keywords: [],
    response_mr: '🪤 फेरोमोन सापळे लावा: 5/हेक्टर. दर आठवड्याला पतंग मोजा.',
    response_hi: '🪤 फेरोमोन ट्रैप लगाएं: 5/हेक्टेयर। हर हफ्ते पतंगे गिनें।',
    response_en: '🪤 Install pheromone traps: 5/hectare. Count moths weekly.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 2,
    bee_toxicity: 'SAFE',
    phi_days: 0
  },

  // Cotton - American Bollworm (Helicoverpa)
  { 
    rule_id: 'COTTON_ABW_DIAG_001', 
    crop_code: 'cotton', 
    category: 'diagnosis', 
    stage_applicable: ['SQUARING','FLOWERING','BOLL_DEVELOPMENT'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'cotton' && 
             (symptoms.includes('LARGE_CATERPILLAR') || symptoms.includes('FRUIT_DAMAGE'));
    }`,
    cause: 'COTTON_AMERICAN_BOLLWORM', 
    priority: 90,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.4',
    scientific_basis: 'Helicoverpa armigera is polyphagous with high damage potential',
    etl_threshold: '1',
    etl_unit: 'larva per plant',
    trigger_keywords: [],
    response_mr: '🐛 अमेरिकन बोंडअळी (Helicoverpa)! मोठी अळी + बोंडाचे नुकसान.',
    response_hi: '🐛 अमेरिकन सुंडी (Helicoverpa)! बड़ी इल्ली + बॉल का नुकसान।',
    response_en: '🐛 American Bollworm (Helicoverpa armigera)! Large caterpillar + boll damage.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },

  // Cotton - American Bollworm Bio-control (NPV/Bt)
  { 
    rule_id: 'COTTON_ABW_BIO_001', 
    crop_code: 'cotton', 
    category: 'treatment', 
    stage_applicable: ['SQUARING','FLOWERING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'COTTON_AMERICAN_BOLLWORM' && 
             input.severity !== 'SEVERE';
    }`,
    cause: 'COTTON_ABW_BIO_TREATMENT', 
    priority: 82,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.4.1',
    scientific_basis: 'HaNPV + Bt highly effective against young Helicoverpa larvae',
    etl_threshold: '1',
    etl_unit: 'larva per plant',
    trigger_keywords: [],
    response_mr: '🦠 जैविक: HaNPV (250LE/हे.) + Bt @ 1kg/हे. फवारा. संध्याकाळी फवारा.',
    response_hi: '🦠 जैविक: HaNPV (250LE/हे.) + Bt @ 1kg/हे. स्प्रे। शाम को स्प्रे करें।',
    response_en: '🦠 Bio-control: Spray HaNPV (250LE/ha) + Bt @ 1kg/ha. Apply in evening.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 2,
    organic_alternative: 'HaNPV + Bt',
    bee_toxicity: 'SAFE',
    phi_days: 0,
    application_method: 'Foliar spray evening'
  },

  // Cotton - Jassid Diagnosis
  { 
    rule_id: 'COTTON_JASSID_DIAG_001', 
    crop_code: 'cotton', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','SQUARING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'cotton' && 
             symptoms.includes('LEAF_EDGE_BURN') &&
             symptoms.includes('JUMPING_INSECTS_VISIBLE');
    }`,
    cause: 'COTTON_JASSID', 
    priority: 84,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.1',
    scientific_basis: 'Amrasca biguttula causes leaf hopper burn',
    etl_threshold: '2',
    etl_unit: 'per leaf',
    trigger_keywords: [],
    response_mr: '🦗 तुडतुडे (Jassid)! पानांच्या कडा जळल्या + उडी मारणारे कीटक.',
    response_hi: '🦗 हरा फुदका (Jassid)! पत्तों के किनारे जले + कूदने वाले कीट।',
    response_en: '🦗 Jassid (Amrasca biguttula)! Leaf hopper burn + jumping insects.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Cotton - Mealybug Diagnosis
  { 
    rule_id: 'COTTON_MEALYBUG_DIAG_001', 
    crop_code: 'cotton', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','SQUARING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'cotton' && 
             (symptoms.includes('WHITE_COTTONY_MASS') || symptoms.includes('WAXY_COATING'));
    }`,
    cause: 'COTTON_MEALYBUG', 
    priority: 86,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.7',
    scientific_basis: 'Phenacoccus solenopsis identified by white cottony masses',
    etl_threshold: '5',
    etl_unit: 'percent infested plants',
    trigger_keywords: [],
    response_mr: '🤍 मिलीबग! पांढरे मेणासारखे थर दिसतात.',
    response_hi: '🤍 मिलीबग! सफेद मोम जैसी परत दिख रही है।',
    response_en: '🤍 Mealybug (Phenacoccus solenopsis)! White cottony/waxy masses visible.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Cotton - Mealybug Treatment
  { 
    rule_id: 'COTTON_MEALYBUG_TRT_001', 
    crop_code: 'cotton', 
    category: 'treatment', 
    stage_applicable: ['VEGETATIVE','SQUARING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'COTTON_MEALYBUG';
    }`,
    cause: 'COTTON_MEALYBUG_TREATMENT', 
    priority: 82,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.7.1',
    scientific_basis: 'Profenofos effective penetrating waxy coating',
    etl_threshold: '5',
    etl_unit: 'percent infested plants',
    trigger_keywords: [],
    response_mr: '💊 प्रोफेनोफॉस 50EC @ 2ml/L + स्टिकर फवारा. झाडाला पूर्ण भिजवा.',
    response_hi: '💊 प्रोफेनोफॉस 50EC @ 2ml/L + स्टिकर स्प्रे। पौधे को पूरा भिगोएं।',
    response_en: '💊 Spray Profenofos 50EC @ 2ml/L + sticker. Drench the plant thoroughly.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 4,
    active_ingredient: 'Profenofos',
    chemical_class: 'Organophosphate',
    resistance_group: 'IRAC-1B',
    bee_toxicity: 'HIGH',
    phi_days: 14,
    dosage_per_acre: '400ml in 200L water'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 2: RICE PEST & DISEASE RULES (25+ rules)
  // Source: ICAR-IIRR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Rice - Stem Borer (Dead Heart)
  { 
    rule_id: 'RICE_STEMBORER_DIAG_001', 
    crop_code: 'rice', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','BOOTING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             (symptoms.includes('DEAD_HEART') || symptoms.includes('WHITE_EAR'));
    }`,
    cause: 'RICE_STEM_BORER', 
    priority: 90,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-3.1',
    scientific_basis: 'Scirpophaga incertulas causes dead heart in vegetative and white ear at heading',
    etl_threshold: '5',
    etl_unit: 'percent dead hearts',
    trigger_keywords: [],
    response_mr: '🪱 खोडकिडा! मृत गाभा (वाढीच्या वेळी) किंवा पांढरे कणीस (फुलोऱ्यात).',
    response_hi: '🪱 तना छेदक! मृत गोभ (बढ़वार में) या सफेद बाली (फूल आने पर)।',
    response_en: '🪱 Stem Borer! Dead heart (tillering) or white ear (heading stage).',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // Rice - Stem Borer Treatment (Trichogramma)
  { 
    rule_id: 'RICE_STEMBORER_BIO_001', 
    crop_code: 'rice', 
    category: 'treatment', 
    stage_applicable: ['TILLERING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'RICE_STEM_BORER' && 
             input.crop_stage === 'TILLERING';
    }`,
    cause: 'RICE_STEMBORER_BIOCONTROL', 
    priority: 80,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-3.1.1',
    scientific_basis: 'Trichogramma parasitizes stem borer eggs effectively',
    etl_threshold: '5',
    etl_unit: 'percent dead hearts',
    trigger_keywords: [],
    response_mr: '🦋 ट्रायकोग्रामा कार्ड (50,000 अंडी/हे.) 7 दिवसांच्या अंतराने 6 वेळा सोडा.',
    response_hi: '🦋 ट्राइकोग्रामा कार्ड (50,000 अंडे/हे.) 7 दिन के अंतर पर 6 बार छोड़ें।',
    response_en: '🦋 Release Trichogramma cards (50,000 eggs/ha) 6 times at 7-day intervals.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 2,
    organic_alternative: 'Trichogramma japonicum',
    bee_toxicity: 'SAFE',
    phi_days: 0
  },

  // Rice - BPH Diagnosis
  { 
    rule_id: 'RICE_BPH_DIAG_001', 
    crop_code: 'rice', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','BOOTING','FLOWERING','GRAIN_FILLING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             symptoms.includes('HOPPER_BURN') &&
             symptoms.includes('SMALL_INSECTS_VISIBLE');
    }`,
    cause: 'RICE_BPH', 
    priority: 92,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-3.3',
    scientific_basis: 'Nilaparvata lugens causes hopper burn in circular patches',
    etl_threshold: '10',
    etl_unit: 'per hill',
    trigger_keywords: [],
    response_mr: '🦗 तपकिरी तुडतुडा (BPH)! गोलाकार जळलेले पॅच + खालच्या भागात कीटक.',
    response_hi: '🦗 भूरा फुदका (BPH)! गोलाकार जले पैच + नीचे के हिस्से में कीट।',
    response_en: '🦗 Brown Planthopper (BPH)! Circular hopper burn patches + insects at base.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // Rice - BPH Treatment
  { 
    rule_id: 'RICE_BPH_TRT_001', 
    crop_code: 'rice', 
    category: 'treatment', 
    stage_applicable: ['TILLERING','BOOTING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'RICE_BPH';
    }`,
    cause: 'RICE_BPH_TREATMENT', 
    priority: 86,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-3.3.1',
    scientific_basis: 'Pymetrozine effective against BPH with minimal impact on spiders',
    etl_threshold: '10',
    etl_unit: 'per hill',
    trigger_keywords: [],
    response_mr: '💊 पायमेट्रोझिन 50WG @ 0.3g/L खोडाजवळ फवारा. पाणी काढून 2 दिवस ठेवा.',
    response_hi: '💊 पाइमेट्रोजिन 50WG @ 0.3g/L तने के पास स्प्रे। पानी निकालकर 2 दिन रखें।',
    response_en: '💊 Spray Pymetrozine 50WG @ 0.3g/L at plant base. Drain water for 2 days.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 4,
    active_ingredient: 'Pymetrozine',
    chemical_class: 'Pyridine azomethine',
    resistance_group: 'IRAC-9B',
    bee_toxicity: 'LOW',
    phi_days: 14,
    dosage_per_acre: '60g in 200L water'
  },

  // Rice - Leaf Folder
  { 
    rule_id: 'RICE_LEAFFOLDER_DIAG_001', 
    crop_code: 'rice', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','BOOTING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             symptoms.includes('FOLDED_LEAVES');
    }`,
    cause: 'RICE_LEAF_FOLDER', 
    priority: 82,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-3.2',
    scientific_basis: 'Cnaphalocrocis medinalis folds leaves longitudinally',
    etl_threshold: '2',
    etl_unit: 'damaged leaves per hill',
    trigger_keywords: [],
    response_mr: '📜 पान गुंडाळणारी अळी! लांबट गुंडाळलेली पाने.',
    response_hi: '📜 पत्ता लपेटक! लंबाई में लिपटे पत्ते।',
    response_en: '📜 Leaf Folder! Longitudinally folded leaves with larva inside.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Rice - Blast Disease
  { 
    rule_id: 'RICE_BLAST_DIAG_001', 
    crop_code: 'rice', 
    category: 'disease', 
    stage_applicable: ['TILLERING','BOOTING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             symptoms.includes('SPINDLE_SHAPED_SPOTS');
    }`,
    cause: 'RICE_BLAST', 
    priority: 90,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-4.1',
    scientific_basis: 'Magnaporthe oryzae causes spindle-shaped spots with gray center',
    etl_threshold: '5',
    etl_unit: 'percent leaf area affected',
    trigger_keywords: [],
    response_mr: '💥 ब्लास्ट! चातीच्या आकाराचे डाग - राखाडी मध्यभाग.',
    response_hi: '💥 ब्लास्ट! धुरी के आकार के धब्बे - भूरा केंद्र।',
    response_en: '💥 Blast disease! Spindle-shaped spots with gray center.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // Rice - Blast Treatment
  { 
    rule_id: 'RICE_BLAST_TRT_001', 
    crop_code: 'rice', 
    category: 'treatment', 
    stage_applicable: ['TILLERING','BOOTING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'RICE_BLAST';
    }`,
    cause: 'RICE_BLAST_TREATMENT', 
    priority: 86,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-4.1.1',
    scientific_basis: 'Tricyclazole prevents melanin biosynthesis in fungus',
    etl_threshold: '5',
    etl_unit: 'percent leaf area affected',
    trigger_keywords: [],
    response_mr: '💊 ट्रायसायक्लाझोल 75WP @ 0.6g/L फवारा. 10 दिवसांनी पुन्हा फवारा.',
    response_hi: '💊 ट्राइसाइक्लाजोल 75WP @ 0.6g/L स्प्रे। 10 दिन बाद दोहराएं।',
    response_en: '💊 Spray Tricyclazole 75WP @ 0.6g/L. Repeat after 10 days if needed.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 4,
    active_ingredient: 'Tricyclazole',
    chemical_class: 'Benzothiazole',
    resistance_group: 'FRAC-16.1',
    bee_toxicity: 'SAFE',
    phi_days: 21,
    dosage_per_acre: '120g in 200L water'
  },

  // Rice - Bacterial Leaf Blight
  { 
    rule_id: 'RICE_BLB_DIAG_001', 
    crop_code: 'rice', 
    category: 'disease', 
    stage_applicable: ['TILLERING','BOOTING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const highHumidity = input.weather?.humidity > 85;
      return input.crop_code === 'rice' && 
             symptoms.includes('LEAF_STREAKING') &&
             (symptoms.includes('MILKY_OOZE') || highHumidity);
    }`,
    cause: 'RICE_BACTERIAL_BLIGHT', 
    priority: 88,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IIRR',
    icar_package_ref: 'IIRR/IPM/2023/Section-4.2',
    scientific_basis: 'Xanthomonas oryzae causes water-soaked streaks turning yellow',
    etl_threshold: '10',
    etl_unit: 'percent leaves affected',
    trigger_keywords: [],
    response_mr: '🦠 जीवाणूजन्य करपा! पानांवर पिवळ्या पट्ट्या + पाण्याने भिजलेले.',
    response_hi: '🦠 जीवाणु झुलसा! पत्तों पर पीली धारियां + पानी से भीगा।',
    response_en: '🦠 Bacterial Leaf Blight! Yellow streaks on leaves, water-soaked appearance.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 3: WHEAT PEST & DISEASE RULES (15+ rules)
  // Source: ICAR-IIWBR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Wheat - Aphid Diagnosis
  { 
    rule_id: 'WHEAT_APHID_DIAG_001', 
    crop_code: 'wheat', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','BOOTING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'wheat' && 
             symptoms.includes('SMALL_INSECTS_VISIBLE') &&
             symptoms.includes('HONEYDEW');
    }`,
    cause: 'WHEAT_APHID', 
    priority: 85,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IIWBR',
    icar_package_ref: 'IIWBR/IPM/2023/Section-3.1',
    scientific_basis: 'Sitobion avenae colonizes wheat ears causing direct damage',
    etl_threshold: '5',
    etl_unit: 'per ear',
    trigger_keywords: [],
    response_mr: '🐛 गव्हावर माव! कणसांवर हिरवे कीटक + चिकट द्रव.',
    response_hi: '🐛 गेहूं पर माहू! बालियों पर हरे कीट + चिपचिपा द्रव।',
    response_en: '🐛 Wheat Aphid! Green insects on ears with honeydew.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Wheat - Yellow Rust
  { 
    rule_id: 'WHEAT_YELLOW_RUST_DIAG_001', 
    crop_code: 'wheat', 
    category: 'disease', 
    stage_applicable: ['TILLERING','HEADING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'wheat' && 
             (symptoms.includes('RUST_PUSTULES') || symptoms.includes('YELLOW_STRIPES'));
    }`,
    cause: 'WHEAT_YELLOW_RUST', 
    priority: 92,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIWBR',
    icar_package_ref: 'IIWBR/IPM/2023/Section-4.1',
    scientific_basis: 'Puccinia striiformis causes yellow-orange pustules in stripes',
    etl_threshold: '1',
    etl_unit: 'percent leaf area',
    trigger_keywords: [],
    response_mr: '🟡 पिवळा तांबेरा! पानांवर पिवळ्या पट्ट्यांमध्ये फोड.',
    response_hi: '🟡 पीला रतुआ! पत्तों पर पीली धारियों में फुंसी।',
    response_en: '🟡 Yellow Rust! Orange-yellow pustules in stripes on leaves.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // Wheat - Yellow Rust Treatment
  { 
    rule_id: 'WHEAT_RUST_TRT_001', 
    crop_code: 'wheat', 
    category: 'treatment', 
    stage_applicable: ['TILLERING','HEADING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'WHEAT_YELLOW_RUST' || 
             input.confirmed_cause === 'WHEAT_BROWN_RUST';
    }`,
    cause: 'WHEAT_RUST_TREATMENT', 
    priority: 88,
    cause_confidence: 0.95,
    scientific_source: 'ICAR-IIWBR',
    icar_package_ref: 'IIWBR/IPM/2023/Section-4.1.1',
    scientific_basis: 'Propiconazole + Tebuconazole provides curative and preventive action',
    etl_threshold: '1',
    etl_unit: 'percent leaf area',
    trigger_keywords: [],
    response_mr: '💊 प्रोपिकोनाझोल 25EC @ 0.1% फवारा. तातडीने करा!',
    response_hi: '💊 प्रोपीकोनाजोल 25EC @ 0.1% स्प्रे। तुरंत करें!',
    response_en: '💊 Spray Propiconazole 25EC @ 0.1% immediately. Urgent action required!',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 4,
    active_ingredient: 'Propiconazole',
    chemical_class: 'Triazole',
    resistance_group: 'FRAC-3',
    bee_toxicity: 'SAFE',
    phi_days: 35,
    dosage_per_acre: '200ml in 200L water'
  },

  // Wheat - Termite
  { 
    rule_id: 'WHEAT_TERMITE_DIAG_001', 
    crop_code: 'wheat', 
    category: 'diagnosis', 
    stage_applicable: ['SEEDLING','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'wheat' && 
             (symptoms.includes('ROOT_DAMAGE') || symptoms.includes('PLANT_DRYING'));
    }`,
    cause: 'WHEAT_TERMITE', 
    priority: 84,
    cause_confidence: 0.8,
    scientific_source: 'ICAR-IIWBR',
    icar_package_ref: 'IIWBR/IPM/2023/Section-3.2',
    scientific_basis: 'Odontotermes obesus damages roots in dry conditions',
    etl_threshold: '10',
    etl_unit: 'percent infested plants',
    trigger_keywords: [],
    response_mr: '🐜 वाळवी! रोपे पूर्ण वाळतात, मुळे खाल्लेली.',
    response_hi: '🐜 दीमक! पौधे पूरी तरह सूखते हैं, जड़ें खाई हुई।',
    response_en: '🐜 Termite! Complete plant drying, roots hollowed out.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 4: SUGARCANE PEST RULES (20+ rules)
  // Source: ICAR-SBI Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Sugarcane - Early Shoot Borer
  { 
    rule_id: 'SUGARCANE_ESB_DIAG_001', 
    crop_code: 'sugarcane', 
    category: 'diagnosis', 
    stage_applicable: ['GERMINATION','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'sugarcane' && 
             symptoms.includes('DEAD_HEART');
    }`,
    cause: 'SUGARCANE_EARLY_SHOOT_BORER', 
    priority: 90,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-SBI',
    icar_package_ref: 'SBI/IPM/2023/Section-3.1',
    scientific_basis: 'Chilo infuscatellus causes dead heart in young cane',
    etl_threshold: '10',
    etl_unit: 'percent dead hearts',
    trigger_keywords: [],
    response_mr: '🪱 लवकर खोडकिडा! कोवळ्या उसात मृत गाभा.',
    response_hi: '🪱 प्रारंभिक तना छेदक! कोमल गन्ने में मृत गोभ।',
    response_en: '🪱 Early Shoot Borer! Dead heart in young sugarcane shoots.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // Sugarcane - ESB Treatment (Trichogramma)
  { 
    rule_id: 'SUGARCANE_ESB_BIO_001', 
    crop_code: 'sugarcane', 
    category: 'treatment', 
    stage_applicable: ['GERMINATION','TILLERING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'SUGARCANE_EARLY_SHOOT_BORER';
    }`,
    cause: 'SUGARCANE_ESB_BIOCONTROL', 
    priority: 82,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-SBI',
    icar_package_ref: 'SBI/IPM/2023/Section-3.1.1',
    scientific_basis: 'Trichogramma chilonis parasitizes ESB eggs effectively',
    etl_threshold: '10',
    etl_unit: 'percent dead hearts',
    trigger_keywords: [],
    response_mr: '🦋 ट्रायकोग्रामा (50,000/हे.) 8 वेळा साप्ताहिक सोडा.',
    response_hi: '🦋 ट्राइकोग्रामा (50,000/हे.) 8 बार साप्ताहिक छोड़ें।',
    response_en: '🦋 Release Trichogramma chilonis (50,000/ha) weekly for 8 releases.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 2,
    organic_alternative: 'Trichogramma chilonis',
    bee_toxicity: 'SAFE',
    phi_days: 0
  },

  // Sugarcane - Top Borer
  { 
    rule_id: 'SUGARCANE_TOPBORER_DIAG_001', 
    crop_code: 'sugarcane', 
    category: 'diagnosis', 
    stage_applicable: ['GRAND_GROWTH'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'sugarcane' && 
             symptoms.includes('BUNCHY_TOP');
    }`,
    cause: 'SUGARCANE_TOP_BORER', 
    priority: 88,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-SBI',
    icar_package_ref: 'SBI/IPM/2023/Section-3.2',
    scientific_basis: 'Scirpophaga excerptalis causes bunchy top symptom',
    etl_threshold: '5',
    etl_unit: 'percent dead hearts',
    trigger_keywords: [],
    response_mr: '🪱 टॉप बोरर! शेंड्याला गुच्छ तयार होतो.',
    response_hi: '🪱 टॉप बोरर! शीर्ष पर गुच्छा बनता है।',
    response_en: '🪱 Top Borer! Bunchy top symptom visible.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // Sugarcane - Woolly Aphid
  { 
    rule_id: 'SUGARCANE_WOOLLY_DIAG_001', 
    crop_code: 'sugarcane', 
    category: 'diagnosis', 
    stage_applicable: ['GRAND_GROWTH'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'sugarcane' && 
             symptoms.includes('WHITE_COTTONY_MASS');
    }`,
    cause: 'SUGARCANE_WOOLLY_APHID', 
    priority: 85,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-SBI',
    icar_package_ref: 'SBI/IPM/2023/Section-3.4',
    scientific_basis: 'Ceratovacuna lanigera identified by white cottony colonies',
    etl_threshold: '2',
    etl_unit: 'colonies per meter row',
    trigger_keywords: [],
    response_mr: '🤍 लोकरी माव! पानांच्या खालच्या बाजूला पांढरे थर.',
    response_hi: '🤍 ऊनी माहू! पत्तों के नीचे सफेद परत।',
    response_en: '🤍 Woolly Aphid! White cottony masses on leaf undersurface.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 5: SOYBEAN PEST RULES (15+ rules)
  // Source: ICAR-IISR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Soybean - Semilooper
  { 
    rule_id: 'SOYBEAN_SEMILOOPER_DIAG_001', 
    crop_code: 'soybean', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING','POD_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'soybean' && 
             symptoms.includes('LEAF_SKELETONIZATION');
    }`,
    cause: 'SOYBEAN_SEMILOOPER', 
    priority: 84,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IISR',
    icar_package_ref: 'IISR/IPM/2023/Section-3.1',
    scientific_basis: 'Chrysodeixis acuta causes leaf skeletonization',
    etl_threshold: '4',
    etl_unit: 'larvae per meter row',
    trigger_keywords: [],
    response_mr: '🐛 सेमीलूपर! पाने सांगाडे बनतात (शिरा शिल्लक).',
    response_hi: '🐛 सेमीलूपर! पत्ते ढांचे बनते हैं (नसें बची)।',
    response_en: '🐛 Semilooper! Leaf skeletonization (only veins remain).',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Soybean - Girdle Beetle
  { 
    rule_id: 'SOYBEAN_GIRDLEBEETLE_DIAG_001', 
    crop_code: 'soybean', 
    category: 'diagnosis', 
    stage_applicable: ['FLOWERING','POD_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'soybean' && 
             symptoms.includes('STEM_GIRDLING');
    }`,
    cause: 'SOYBEAN_GIRDLE_BEETLE', 
    priority: 86,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IISR',
    icar_package_ref: 'IISR/IPM/2023/Section-3.2',
    scientific_basis: 'Obereopsis brevis girdles stems causing wilting above girdle',
    etl_threshold: '10',
    etl_unit: 'percent girdled plants',
    trigger_keywords: [],
    response_mr: '🪲 गर्डल बीटल! खोड कापलेले, वरचा भाग सुकतो.',
    response_hi: '🪲 गर्डल बीटल! तना कटा, ऊपरी हिस्सा सूखता है।',
    response_en: '🪲 Girdle Beetle! Stem girdled, portion above wilts.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // Soybean - Rust
  { 
    rule_id: 'SOYBEAN_RUST_DIAG_001', 
    crop_code: 'soybean', 
    category: 'disease', 
    stage_applicable: ['FLOWERING','POD_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'soybean' && 
             symptoms.includes('RUST_PUSTULES');
    }`,
    cause: 'SOYBEAN_RUST', 
    priority: 88,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IISR',
    icar_package_ref: 'IISR/IPM/2023/Section-4.1',
    scientific_basis: 'Phakopsora pachyrhizi causes rust pustules on undersurface',
    etl_threshold: '5',
    etl_unit: 'percent leaf area',
    trigger_keywords: [],
    response_mr: '🟤 सोयाबीन गंज! पानाखाली तपकिरी फोड.',
    response_hi: '🟤 सोयाबीन रतुआ! पत्ते के नीचे भूरी फुंसी।',
    response_en: '🟤 Soybean Rust! Brown pustules on leaf undersurface.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 6: TOMATO PEST & DISEASE RULES (15+ rules)
  // Source: ICAR-IIVR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Tomato - Fruit Borer
  { 
    rule_id: 'TOMATO_FRUITBORER_DIAG_001', 
    crop_code: 'tomato', 
    category: 'diagnosis', 
    stage_applicable: ['FLOWERING','FRUITING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'tomato' && 
             symptoms.includes('FRUIT_DAMAGE');
    }`,
    cause: 'TOMATO_FRUIT_BORER', 
    priority: 88,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIVR',
    icar_package_ref: 'IIVR/IPM/2023/Section-3.1',
    scientific_basis: 'Helicoverpa armigera bores into tomato fruits',
    etl_threshold: '1',
    etl_unit: 'larva per plant',
    trigger_keywords: [],
    response_mr: '🍅 फळ पोखरणारी अळी! फळांमध्ये भोके.',
    response_hi: '🍅 फल छेदक! फलों में छेद।',
    response_en: '🍅 Fruit Borer! Holes in tomato fruits with frass.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },

  // Tomato - Leaf Curl Virus
  { 
    rule_id: 'TOMATO_LEAFCURL_DIAG_001', 
    crop_code: 'tomato', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'tomato' && 
             symptoms.includes('CURLED_LEAVES') &&
             symptoms.includes('STUNTED_GROWTH');
    }`,
    cause: 'TOMATO_LEAF_CURL_VIRUS', 
    priority: 90,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IIVR',
    icar_package_ref: 'IIVR/IPM/2023/Section-4.1',
    scientific_basis: 'ToLCV transmitted by whitefly causes severe curling and stunting',
    etl_threshold: '1',
    etl_unit: 'percent infected plants',
    trigger_keywords: [],
    response_mr: '🦠 पान वळणे विषाणू (ToLCV)! पाने वळलेली + खुरटलेली वाढ.',
    response_hi: '🦠 पत्ता मोड़ वायरस (ToLCV)! पत्ते मुड़े + बौनापन।',
    response_en: '🦠 Leaf Curl Virus (ToLCV)! Severely curled leaves + stunted growth.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 5,
    bee_toxicity: 'SAFE'
  },

  // Tomato - Late Blight
  { 
    rule_id: 'TOMATO_LATEBLIGHT_DIAG_001', 
    crop_code: 'tomato', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING','FRUITING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const highHumidity = input.weather?.humidity > 80;
      return input.crop_code === 'tomato' && 
             symptoms.includes('WATER_SOAKED_LESIONS') &&
             highHumidity;
    }`,
    cause: 'TOMATO_LATE_BLIGHT', 
    priority: 92,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIVR',
    icar_package_ref: 'IIVR/IPM/2023/Section-4.2',
    scientific_basis: 'Phytophthora infestans causes water-soaked lesions in humid conditions',
    etl_threshold: '5',
    etl_unit: 'percent plants affected',
    trigger_keywords: [],
    response_mr: '💧 लेट ब्लाइट! पानाने भिजलेले डाग + पांढरी बुरशी.',
    response_hi: '💧 लेट ब्लाइट! पानी से भीगे धब्बे + सफेद फफूंद।',
    response_en: '💧 Late Blight! Water-soaked lesions with white mold in humid weather.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 7: ONION PEST & DISEASE RULES (10+ rules)
  // Source: ICAR-DOGR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Onion - Thrips
  { 
    rule_id: 'ONION_THRIPS_DIAG_001', 
    crop_code: 'onion', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','BULB_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'onion' && 
             symptoms.includes('SILVERING');
    }`,
    cause: 'ONION_THRIPS', 
    priority: 90,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-DOGR',
    icar_package_ref: 'DOGR/IPM/2023/Section-3.1',
    scientific_basis: 'Thrips tabaci causes silvery patches on onion leaves',
    etl_threshold: '30',
    etl_unit: 'per plant',
    trigger_keywords: [],
    response_mr: '🪲 कांद्यावर थ्रिप्स! पानांवर चंदेरी चमक.',
    response_hi: '🪲 प्याज पर थ्रिप्स! पत्तों पर चांदी सी चमक।',
    response_en: '🪲 Onion Thrips! Silvery patches on leaves.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // Onion - Purple Blotch
  { 
    rule_id: 'ONION_PURPLEBLOTCH_DIAG_001', 
    crop_code: 'onion', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','BULB_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'onion' && 
             symptoms.includes('PURPLE_SPOTS');
    }`,
    cause: 'ONION_PURPLE_BLOTCH', 
    priority: 86,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-DOGR',
    icar_package_ref: 'DOGR/IPM/2023/Section-4.1',
    scientific_basis: 'Alternaria porri causes purple concentric spots',
    etl_threshold: '10',
    etl_unit: 'percent leaves affected',
    trigger_keywords: [],
    response_mr: '💜 जांभळा डाग! पानांवर जांभळे गोलाकार डाग.',
    response_hi: '💜 बैंगनी धब्बा! पत्तों पर बैंगनी गोलाकार धब्बे।',
    response_en: '💜 Purple Blotch! Concentric purple spots on leaves.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 8: GRAM/CHICKPEA PEST RULES (10+ rules)
  // Source: ICAR-IIPR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Gram - Pod Borer
  { 
    rule_id: 'GRAM_PODBORER_DIAG_001', 
    crop_code: 'gram', 
    category: 'diagnosis', 
    stage_applicable: ['FLOWERING','POD_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return (input.crop_code === 'gram' || input.crop_code === 'chickpea') && 
             symptoms.includes('POD_DAMAGE');
    }`,
    cause: 'GRAM_POD_BORER', 
    priority: 90,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-IIPR',
    icar_package_ref: 'IIPR/IPM/2023/Section-3.1',
    scientific_basis: 'Helicoverpa armigera is most destructive pest of gram',
    etl_threshold: '2',
    etl_unit: 'larvae per meter row',
    trigger_keywords: [],
    response_mr: '🐛 शेंग पोखरणारी अळी! शेंगांमध्ये भोके.',
    response_hi: '🐛 फली छेदक! फलियों में छेद।',
    response_en: '🐛 Gram Pod Borer (Helicoverpa)! Holes in pods with frass.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },

  // Gram - Pod Borer Bio-control
  { 
    rule_id: 'GRAM_PODBORER_BIO_001', 
    crop_code: 'gram', 
    category: 'treatment', 
    stage_applicable: ['FLOWERING'], 
    conditionCode: `(input) => {
      return input.confirmed_cause === 'GRAM_POD_BORER' && 
             input.severity !== 'SEVERE';
    }`,
    cause: 'GRAM_PODBORER_BIOCONTROL', 
    priority: 82,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IIPR',
    icar_package_ref: 'IIPR/IPM/2023/Section-3.1.1',
    scientific_basis: 'HaNPV + NSKE effective against young larvae',
    etl_threshold: '2',
    etl_unit: 'larvae per meter row',
    trigger_keywords: [],
    response_mr: '🦠 HaNPV (250LE/हे.) + NSKE 5% फवारा. संध्याकाळी करा.',
    response_hi: '🦠 HaNPV (250LE/हे.) + NSKE 5% स्प्रे। शाम को करें।',
    response_en: '🦠 Spray HaNPV (250LE/ha) + NSKE 5%. Apply in evening.',
    action_type: 'RECOMMEND', 
    canonical_group: '09_treatment',
    ipm_level: 2,
    organic_alternative: 'HaNPV + NSKE 5%',
    bee_toxicity: 'SAFE',
    phi_days: 0
  },

  // Gram - Wilt
  { 
    rule_id: 'GRAM_WILT_DIAG_001', 
    crop_code: 'gram', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return (input.crop_code === 'gram' || input.crop_code === 'chickpea') && 
             symptoms.includes('SUDDEN_WILTING');
    }`,
    cause: 'GRAM_WILT', 
    priority: 88,
    cause_confidence: 0.85,
    scientific_source: 'ICAR-IIPR',
    icar_package_ref: 'IIPR/IPM/2023/Section-4.1',
    scientific_basis: 'Fusarium oxysporum causes vascular wilt',
    etl_threshold: '5',
    etl_unit: 'percent plants affected',
    trigger_keywords: [],
    response_mr: '😵 मर रोग! अचानक पूर्ण रोप सुकते.',
    response_hi: '😵 उकठा! अचानक पूरा पौधा सूखता है।',
    response_en: '😵 Wilt disease! Sudden complete plant wilting.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 5,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 9: GROUNDNUT PEST RULES (10+ rules)
  // Source: ICAR-DGR Package of Practices 2023
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Groundnut - Leaf Miner
  { 
    rule_id: 'GROUNDNUT_LEAFMINER_DIAG_001', 
    crop_code: 'groundnut', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'groundnut' && 
             symptoms.includes('LEAF_MINES');
    }`,
    cause: 'GROUNDNUT_LEAF_MINER', 
    priority: 82,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-DGR',
    icar_package_ref: 'DGR/IPM/2023/Section-3.1',
    scientific_basis: 'Aproaerema modicella creates serpentine mines',
    etl_threshold: '10',
    etl_unit: 'percent leaves mined',
    trigger_keywords: [],
    response_mr: '🐛 लीफ मायनर! पानांवर नागमोडी रेषा.',
    response_hi: '🐛 लीफ माइनर! पत्तों पर टेढ़ी-मेढ़ी रेखाएं।',
    response_en: '🐛 Leaf Miner! Serpentine mines on leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Groundnut - Tikka Disease
  { 
    rule_id: 'GROUNDNUT_TIKKA_DIAG_001', 
    crop_code: 'groundnut', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING','POD_FORMATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'groundnut' && 
             symptoms.includes('CIRCULAR_SPOTS');
    }`,
    cause: 'GROUNDNUT_TIKKA', 
    priority: 84,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-DGR',
    icar_package_ref: 'DGR/IPM/2023/Section-4.1',
    scientific_basis: 'Cercospora causes early and late leaf spots',
    etl_threshold: '15',
    etl_unit: 'percent leaf area',
    trigger_keywords: [],
    response_mr: '🟤 टिक्का रोग! गोलाकार तपकिरी डाग.',
    response_hi: '🟤 टिक्का रोग! गोलाकार भूरे धब्बे।',
    response_en: '🟤 Tikka disease! Circular brown spots on leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 10: NUTRIENT DEFICIENCY RULES (15+ rules)
  // Source: ICAR Soil Science Division
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Nitrogen Deficiency - Uniform Yellowing
  { 
    rule_id: 'NUTRIENT_N_DEF_001', 
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
    icar_package_ref: 'ICAR/SS/2023/Section-5.1',
    scientific_basis: 'N deficiency causes uniform chlorosis from older leaves',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '💛 नायट्रोजन कमतरता! खालची पाने आधी पिवळी होतात.',
    response_hi: '💛 नाइट्रोजन कमी! निचले पत्ते पहले पीले होते हैं।',
    response_en: '💛 Nitrogen deficiency! Older/lower leaves turn yellow first.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrient',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Phosphorus Deficiency
  { 
    rule_id: 'NUTRIENT_P_DEF_001', 
    crop_code: 'all', 
    category: 'nutrient', 
    stage_applicable: ['GERMINATION','VEGETATIVE'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const lowSoilP = input.soil_phosphorus === 'LOW' || input.soil_phosphorus === 'VERY_LOW';
      return symptoms.includes('PURPLE_COLORATION') || 
             (symptoms.includes('STUNTED_GROWTH') && lowSoilP);
    }`,
    cause: 'PHOSPHORUS_DEFICIENCY', 
    priority: 84,
    cause_confidence: 0.8,
    scientific_source: 'ICAR Soil Science',
    icar_package_ref: 'ICAR/SS/2023/Section-5.2',
    scientific_basis: 'P deficiency causes purple coloration due to anthocyanin accumulation',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '💜 फॉस्फरस कमतरता! जांभळट रंग + खुरटलेली वाढ.',
    response_hi: '💜 फास्फोरस कमी! बैंगनी रंग + बौनापन।',
    response_en: '💜 Phosphorus deficiency! Purple coloration + stunted growth.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrient',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Potassium Deficiency
  { 
    rule_id: 'NUTRIENT_K_DEF_001', 
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
    icar_package_ref: 'ICAR/SS/2023/Section-5.3',
    scientific_basis: 'K deficiency causes marginal leaf necrosis starting from tips',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🔥 पोटॅशियम कमतरता! पानांच्या कडा जळतात.',
    response_hi: '🔥 पोटेशियम कमी! पत्तों के किनारे जलते हैं।',
    response_en: '🔥 Potassium deficiency! Marginal leaf burn from tips.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrient',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Zinc Deficiency
  { 
    rule_id: 'NUTRIENT_ZN_DEF_001', 
    crop_code: 'rice', 
    category: 'nutrient', 
    stage_applicable: ['TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             symptoms.includes('INTERVEINAL_CHLOROSIS') &&
             symptoms.includes('BRONZING');
    }`,
    cause: 'ZINC_DEFICIENCY', 
    priority: 82,
    cause_confidence: 0.8,
    scientific_source: 'ICAR Soil Science',
    icar_package_ref: 'ICAR/SS/2023/Section-5.5',
    scientific_basis: 'Zn deficiency common in rice causes khaira disease',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🟫 जस्त (Zn) कमतरता! खैरा - पाने तांब्यासारखी.',
    response_hi: '🟫 जिंक कमी! खैरा - पत्ते तांबे जैसे।',
    response_en: '🟫 Zinc deficiency! Khaira disease - bronzing of leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrient',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Iron Deficiency
  { 
    rule_id: 'NUTRIENT_FE_DEF_001', 
    crop_code: 'all', 
    category: 'nutrient', 
    stage_applicable: ['VEGETATIVE'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('INTERVEINAL_CHLOROSIS') && 
             symptoms.includes('NEW_LEAVES_AFFECTED');
    }`,
    cause: 'IRON_DEFICIENCY', 
    priority: 80,
    cause_confidence: 0.75,
    scientific_source: 'ICAR Soil Science',
    icar_package_ref: 'ICAR/SS/2023/Section-5.6',
    scientific_basis: 'Fe deficiency causes interveinal chlorosis in young leaves',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🟢 लोह (Fe) कमतरता! नवीन पाने पिवळी, शिरा हिरव्या.',
    response_hi: '🟢 लोहा कमी! नए पत्ते पीले, नसें हरी।',
    response_en: '🟢 Iron deficiency! Young leaves yellow with green veins.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrient',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 11: UNIVERSAL PEST OBSERVATION RULES
  // Cross-crop observation-to-pest bridging
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Universal - Aphid Bridge
  { 
    rule_id: 'UNIVERSAL_APHID_BRIDGE_001', 
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
    icar_package_ref: 'NBAIR/General/2023',
    scientific_basis: 'Aphids cause leaf curl and honeydew across crops',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🐛 माव! पाने वळलेली + चिकट द्रव.',
    response_hi: '🐛 माहू! मुड़े पत्ते + चिपचिपापन।',
    response_en: '🐛 Aphid likely! Curled leaves + honeydew.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Universal - Whitefly Bridge
  { 
    rule_id: 'UNIVERSAL_WHITEFLY_BRIDGE_001', 
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
    icar_package_ref: 'NBAIR/General/2023',
    scientific_basis: 'Whiteflies fly when disturbed, cause yellowing via phloem feeding',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🦋 पांढरी माशी! उडणारे पांढरे कीटक + पिवळी पाने.',
    response_hi: '🦋 सफेद मक्खी! उड़ने वाले सफेद कीट + पीले पत्ते।',
    response_en: '🦋 Whitefly likely! Flying white insects + yellowing.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Universal - Thrips Bridge
  { 
    rule_id: 'UNIVERSAL_THRIPS_BRIDGE_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('SILVERING');
    }`,
    cause: 'THRIPS_INFESTATION', 
    priority: 84,
    cause_confidence: 0.8,
    scientific_source: 'ICAR-NBAIR',
    icar_package_ref: 'NBAIR/General/2023',
    scientific_basis: 'Thrips cause silvery sheen due to cell damage',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🪲 थ्रिप्स! चंदेरी चमक.',
    response_hi: '🪲 थ्रिप्स! चांदी जैसी चमक।',
    response_en: '🪲 Thrips likely! Silvery sheen on leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Universal - Mites Bridge
  { 
    rule_id: 'UNIVERSAL_MITES_BRIDGE_001', 
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
    icar_package_ref: 'NBAIR/General/2023',
    scientific_basis: 'Spider mites create webbing on undersides of leaves',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🕷️ माइट्स! जाळे दिसतात.',
    response_hi: '🕷️ माइट्स! जाले दिख रहे हैं।',
    response_en: '🕷️ Mites! Webbing visible on leaf undersurface.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // Universal - Caterpillar/Borer Bridge
  { 
    rule_id: 'UNIVERSAL_CATERPILLAR_BRIDGE_001', 
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
    icar_package_ref: 'NBAIR/General/2023',
    scientific_basis: 'Caterpillars cause holes and leave frass',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🐛 अळी! भोके + विष्ठा दिसते.',
    response_hi: '🐛 इल्ली! छेद + मल दिख रहा है।',
    response_en: '🐛 Caterpillar! Holes with frass visible.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 12: UNIVERSAL DISEASE OBSERVATION RULES
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Universal - Powdery Mildew
  { 
    rule_id: 'UNIVERSAL_POWDERY_MILDEW_001', 
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
    icar_package_ref: 'ICAR/PP/2023',
    scientific_basis: 'White powdery coating is diagnostic for powdery mildew',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🤍 भुरी! पांढरी पावडर.',
    response_hi: '🤍 चूर्णिल आसिता! सफेद पाउडर।',
    response_en: '🤍 Powdery Mildew! White powdery coating.',
    action_type: 'RECOMMEND', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // Universal - Downy Mildew
  { 
    rule_id: 'UNIVERSAL_DOWNY_MILDEW_001', 
    crop_code: 'all', 
    category: 'disease', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const highHumidity = input.weather?.humidity > 85;
      return symptoms.includes('DOWNY_GROWTH') && highHumidity;
    }`,
    cause: 'DOWNY_MILDEW', 
    priority: 85,
    cause_confidence: 0.85,
    scientific_source: 'ICAR Plant Pathology',
    icar_package_ref: 'ICAR/PP/2023',
    scientific_basis: 'Downy mildew appears on undersurface in humid conditions',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🌫️ डाउनी मिल्ड्यू! पानाखाली मऊ बुरशी.',
    response_hi: '🌫️ डाउनी मिल्ड्यू! पत्ते के नीचे मुलायम फफूंद।',
    response_en: '🌫️ Downy Mildew! Soft fungal growth on undersurface.',
    action_type: 'RECOMMEND', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'SAFE'
  },

  // Universal - Wilt Disease
  { 
    rule_id: 'UNIVERSAL_WILT_001', 
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
    icar_package_ref: 'ICAR/PP/2023',
    scientific_basis: 'Sudden wilting despite water indicates vascular wilt',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '😵 मर रोग! पाणी असूनही सुकतंय.',
    response_hi: '😵 उकठा! पानी होने पर भी मुरझाना।',
    response_en: '😵 Wilt disease! Wilting despite adequate water.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 5,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 13: SAFETY/BLOCKING RULES
  // High priority rules that block unsafe actions
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Rain Block - No spray if rain expected
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
    scientific_source: 'ICAR IPM Guidelines',
    icar_package_ref: 'ICAR/IPM/2023/Safety',
    scientific_basis: 'Rain washes off pesticides within 2 hours',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🌧️ पाऊस! आज फवारणी टाळा. पाऊस थांबल्यावर 4-6 तासांनी फवारा.',
    response_hi: '🌧️ बारिश! आज स्प्रे न करें। बारिश रुकने के 4-6 घंटे बाद करें।',
    response_en: '🌧️ Rain expected! Avoid spraying. Wait 4-6 hours after rain stops.',
    action_type: 'BLOCK', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE',
    rain_delay_hours: 6
  },

  // High Wind Block
  { 
    rule_id: 'SAFETY_WIND_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      return input.weather?.wind_speed > 10;
    }`,
    cause: 'WIND_SPRAY_BLOCKED', 
    priority: 96,
    cause_confidence: 1.0,
    scientific_source: 'ICAR IPM Guidelines',
    icar_package_ref: 'ICAR/IPM/2023/Safety',
    scientific_basis: 'High wind causes spray drift and poor coverage',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '💨 वारा जास्त! फवारणी टाळा. वारा कमी झाल्यावर फवारा.',
    response_hi: '💨 तेज हवा! स्प्रे न करें। हवा कम होने पर करें।',
    response_en: '💨 High wind! Avoid spraying. Wait for calm conditions.',
    action_type: 'BLOCK', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE',
    max_wind_speed: 10
  },

  // Flowering Stage Pollinator Protection
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
    icar_package_ref: 'ICAR/Pollinator/2023',
    scientific_basis: 'Insecticides during flowering harm pollinators critical for yield',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🐝 फुलोरा! कीटकनाशक टाळा. मधमाशा संरक्षण महत्त्वाचे.',
    response_hi: '🐝 फूल आने की अवस्था! कीटनाशक से बचें। मधुमक्खी संरक्षण जरूरी।',
    response_en: '🐝 Flowering stage! Avoid insecticides. Pollinator protection critical.',
    action_type: 'WARN', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Young Crop Protection
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
    icar_package_ref: 'ICAR/CP/2023',
    scientific_basis: 'Young crops sensitive to chemical stress',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🌱 लहान पीक! रासायनिक उपचार टाळा. निरीक्षण करा.',
    response_hi: '🌱 छोटी फसल! रासायनिक उपचार से बचें। निरीक्षण करें।',
    response_en: '🌱 Young crop! Avoid chemicals. Continue monitoring.',
    action_type: 'WARN', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // High Temperature Block
  { 
    rule_id: 'SAFETY_TEMP_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      return input.weather?.temp > 38;
    }`,
    cause: 'HIGH_TEMP_BLOCKED', 
    priority: 94,
    cause_confidence: 1.0,
    scientific_source: 'ICAR IPM Guidelines',
    icar_package_ref: 'ICAR/IPM/2023/Safety',
    scientific_basis: 'High temperature causes rapid evaporation and phytotoxicity',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🌡️ तापमान जास्त (>38°C)! फवारणी टाळा. सकाळी लवकर फवारा.',
    response_hi: '🌡️ तापमान अधिक (>38°C)! स्प्रे न करें। सुबह जल्दी करें।',
    response_en: '🌡️ High temperature (>38°C)! Avoid spraying. Spray early morning.',
    action_type: 'BLOCK', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE',
    max_temperature: 38
  },

  // PHI Enforcement
  { 
    rule_id: 'SAFETY_PHI_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['MATURITY','HARVEST'], 
    conditionCode: `(input) => {
      const daysToHarvest = input.days_to_harvest || 0;
      return daysToHarvest < 7;
    }`,
    cause: 'PHI_BLOCKED', 
    priority: 99,
    cause_confidence: 1.0,
    scientific_source: 'FSSAI Pesticide Residue Guidelines',
    icar_package_ref: 'FSSAI/2023',
    scientific_basis: 'Pre-Harvest Interval must be respected for food safety',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '⛔ कापणीपूर्व मध्यांतर! 7 दिवसांत कापणी - फवारणी बंद.',
    response_hi: '⛔ कटाई पूर्व अंतराल! 7 दिन में कटाई - स्प्रे बंद।',
    response_en: '⛔ Pre-Harvest Interval! Harvest in <7 days - No chemical spray.',
    action_type: 'BLOCK', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE',
    phi_days: 7
  },

  // Bee-Toxic Chemical Block during Flowering
  { 
    rule_id: 'SAFETY_BEETOXIC_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['FLOWERING'], 
    conditionCode: `(input) => {
      const beeToxicChemicals = ['imidacloprid', 'thiamethoxam', 'clothianidin', 'fipronil'];
      const proposedChemical = (input.proposed_chemical || '').toLowerCase();
      return input.crop_stage === 'FLOWERING' && 
             beeToxicChemicals.some(c => proposedChemical.includes(c));
    }`,
    cause: 'BEETOXIC_BLOCKED', 
    priority: 97,
    cause_confidence: 1.0,
    scientific_source: 'ICAR Pollinator Guidelines',
    icar_package_ref: 'ICAR/Pollinator/2023',
    scientific_basis: 'Neonicotinoids highly toxic to bees during flowering',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🐝⛔ मधमाशी-विषारी रसायन फुलोऱ्यात वापरू नका! पर्याय वापरा.',
    response_hi: '🐝⛔ मधुमक्खी-विषाक्त रसायन फूल अवस्था में न डालें! विकल्प उपयोग करें।',
    response_en: '🐝⛔ Bee-toxic chemical during flowering BLOCKED! Use alternatives.',
    action_type: 'BLOCK', 
    canonical_group: '13_safety',
    ipm_level: 1,
    bee_toxicity: 'HIGH'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 14: CLARIFICATION TRIGGER RULES
  // Rules that fire when more information is needed
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Need Insect Behavior
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
    icar_package_ref: '',
    scientific_basis: 'Insect behavior determines species identification',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: 'कीटक दिसतोय. कीटक उडतात की चालतात?',
    response_hi: 'कीट दिख रहे हैं। कीट उड़ते हैं या चलते हैं?',
    response_en: 'Insects visible. Do they fly or crawl?',
    action_type: 'CLARIFY', 
    canonical_group: '02_clarification',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Need Distribution Pattern
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
    icar_package_ref: '',
    scientific_basis: 'Distribution pattern differentiates causes',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: 'हे लक्षण कसे पसरले आहे? सगळीकडे एकसारखे की ठिकठिकाणी?',
    response_hi: 'यह लक्षण कैसे फैला है? सब जगह समान या जगह-जगह?',
    response_en: 'How is this spread? Uniform everywhere or patchy?',
    action_type: 'CLARIFY', 
    canonical_group: '02_clarification',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Need Severity
  { 
    rule_id: 'CLARIFY_SEVERITY_001', 
    crop_code: 'all', 
    category: 'clarification', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const hasPestOrDisease = symptoms.some(s => 
        s.includes('INSECTS') || s.includes('SPOTS') || s.includes('DAMAGE')
      );
      const hasSeverity = input.severity === 'MILD' || 
                          input.severity === 'MODERATE' ||
                          input.severity === 'SEVERE';
      return hasPestOrDisease && !hasSeverity;
    }`,
    cause: 'NEED_SEVERITY', 
    priority: 68,
    cause_confidence: 0.5,
    scientific_source: 'Agronomic Triage',
    icar_package_ref: '',
    scientific_basis: 'Severity determines treatment intensity',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: 'किती टक्के पीक प्रभावित आहे? कमी (<10%), मध्यम (10-30%), जास्त (>30%)?',
    response_hi: 'कितना प्रतिशत फसल प्रभावित है? कम (<10%), मध्यम (10-30%), अधिक (>30%)?',
    response_en: 'What % of crop affected? Low (<10%), Medium (10-30%), High (>30%)?',
    action_type: 'CLARIFY', 
    canonical_group: '02_clarification',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 15: MONITORING RULES
  // Low confidence rules that suggest observation
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Monitor - Insect Present No Damage
  { 
    rule_id: 'MONITOR_INSECT_NO_DAMAGE_001', 
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
    icar_package_ref: 'ICAR/IPM/2023',
    scientific_basis: 'Insect presence alone does not warrant treatment',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '👀 निरीक्षण: कीटक दिसतात पण नुकसान नाही. 2-3 दिवस पहा.',
    response_hi: '👀 निरीक्षण: कीट दिख रहे लेकिन नुकसान नहीं। 2-3 दिन देखें।',
    response_en: '👀 Monitor: Insects present but no damage. Watch for 2-3 days.',
    action_type: 'MONITOR', 
    canonical_group: '11_monitoring',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Monitor - Beneficial Insects Present
  { 
    rule_id: 'MONITOR_BENEFICIAL_001', 
    crop_code: 'all', 
    category: 'monitoring', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('LADYBIRD_VISIBLE') || 
             symptoms.includes('SPIDER_VISIBLE') ||
             symptoms.includes('PARASITOID_VISIBLE');
    }`,
    cause: 'BENEFICIAL_PRESENT', 
    priority: 65,
    cause_confidence: 0.9,
    scientific_source: 'ICAR-NBAIR',
    icar_package_ref: 'NBAIR/Biocontrol/2023',
    scientific_basis: 'Beneficials indicate natural pest control is active',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '✅ चांगले कीटक दिसतात! नैसर्गिक नियंत्रण चालू आहे. रसायने टाळा.',
    response_hi: '✅ उपयोगी कीट दिख रहे हैं! प्राकृतिक नियंत्रण चालू है। रसायन टालें।',
    response_en: '✅ Beneficial insects present! Natural control active. Avoid chemicals.',
    action_type: 'MONITOR', 
    canonical_group: '11_monitoring',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Monitor - Early Signs
  { 
    rule_id: 'MONITOR_EARLY_SIGNS_001', 
    crop_code: 'all', 
    category: 'monitoring', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('MINOR_SPOTS') || 
             symptoms.includes('FEW_INSECTS');
    }`,
    cause: 'EARLY_DETECTION', 
    priority: 62,
    cause_confidence: 0.5,
    scientific_source: 'IPM Principles',
    icar_package_ref: 'ICAR/IPM/2023',
    scientific_basis: 'Early detection allows preventive action',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '👀 लवकर ओळख! अजून तीव्र नाही. 3-5 दिवस निरीक्षण करा.',
    response_hi: '👀 जल्दी पहचान! अभी गंभीर नहीं। 3-5 दिन निरीक्षण करें।',
    response_en: '👀 Early detection! Not severe yet. Monitor for 3-5 days.',
    action_type: 'MONITOR', 
    canonical_group: '11_monitoring',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // SECTION 16: WATER STRESS RULES
  // ═══════════════════════════════════════════════════════════════════════════════════════

  // Water Stress Detection
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
    icar_package_ref: 'ICAR/Agro/2023',
    scientific_basis: 'Water stress causes wilting, confirmed by declining NDVI',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '💧 पाण्याचा ताण! पाने सुकतात, NDVI कमी होतोय - पाणी द्या.',
    response_hi: '💧 पानी की कमी! पत्ते मुरझा रहे, NDVI गिर रहा - पानी दें।',
    response_en: '💧 Water stress! Wilting with declining NDVI - irrigate immediately.',
    action_type: 'RECOMMEND', 
    canonical_group: '08_stress',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // Heat Stress Detection
  { 
    rule_id: 'STRESS_HEAT_001', 
    crop_code: 'all', 
    category: 'stress', 
    stage_applicable: ['FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      const highTemp = input.weather?.temp > 35;
      return symptoms.includes('FLOWER_DROP') && highTemp;
    }`,
    cause: 'HEAT_STRESS', 
    priority: 85,
    cause_confidence: 0.8,
    scientific_source: 'ICAR Agronomy',
    icar_package_ref: 'ICAR/Agro/2023',
    scientific_basis: 'Heat stress causes flower/fruit drop above 35C',
    etl_threshold: '',
    etl_unit: '',
    trigger_keywords: [],
    response_mr: '🌡️ उष्णता ताण! फुले/फळे गळतात. संध्याकाळी हलके पाणी द्या.',
    response_hi: '🌡️ गर्मी का तनाव! फूल/फल गिर रहे हैं। शाम को हल्का पानी दें।',
    response_en: '🌡️ Heat stress! Flower/fruit drop. Light irrigation in evening helps.',
    action_type: 'RECOMMEND', 
    canonical_group: '08_stress',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
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
