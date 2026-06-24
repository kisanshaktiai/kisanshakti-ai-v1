/**
 * CANONICAL DECISION RULES DATA - v3.0
 * Separated from index.ts to reduce bundle size
 * 
 * This file contains rule definitions only.
 * Main function logic is in index.ts
 */

export interface RuleDefinition {
  rule_id: string;
  crop_code: string;
  category: string;
  stage_applicable: string[];
  conditionCode: string;
  cause: string;
  priority: number;
  cause_confidence?: number;
  scientific_source: string;
  icar_package_ref?: string;
  scientific_basis?: string;
  etl_threshold?: string;
  etl_unit?: string;
  trigger_keywords: string[];
  response_mr: string;
  response_hi: string;
  response_en: string;
  action_type: string;
  canonical_group: string;
  ipm_level?: number;
  bee_toxicity?: string;
  phi_days?: number;
  organic_alternative?: string;
  active_ingredient?: string;
  chemical_class?: string;
  resistance_group?: string;
  dosage_per_acre?: string;
  application_method?: string;
  max_wind_speed?: number;
  min_temperature?: number;
  max_temperature?: number;
}

// Core rules - keeping only essential 50 rules to stay within size limits
// Additional rules can be added via database directly
export const CANONICAL_RULES: RuleDefinition[] = [
  // ═══════════════════════════════════════════════════════════════
  // COTTON PEST RULES (10 essential)
  // ═══════════════════════════════════════════════════════════════
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
    scientific_source: 'ICAR-CICR',
    icar_package_ref: 'CICR/IPM/2023/Section-4.2',
    etl_threshold: '10',
    trigger_keywords: [],
    response_mr: '🐛 कापसावर माव आढळला! पाने वळलेली + चिकट = माव्याची लक्षणे.',
    response_hi: '🐛 कपास पर माहू मिला! मुड़े पत्ते + चिपचिपापन = माहू के लक्षण।',
    response_en: '🐛 Cotton Aphid confirmed! Curled leaves + honeydew are diagnostic.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },
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
    scientific_source: 'ICAR-CICR',
    etl_threshold: '6',
    trigger_keywords: [],
    response_mr: '🦋 पांढरी माशी! उडणारे पांढरे कीटक + पिवळी पाने.',
    response_hi: '🦋 सफेद मक्खी! उड़ते सफेद कीट + पीले पत्ते।',
    response_en: '🦋 Whitefly confirmed! Flying white insects + yellowing.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },
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
    scientific_source: 'ICAR-CICR',
    etl_threshold: '8',
    trigger_keywords: [],
    response_mr: '🪱 गुलाबी बोंडअळी! गुलाबी फुले/खराब बोंडे दिसतात.',
    response_hi: '🪱 गुलाबी सुंडी! गुलाबी फूल/खराब बॉल दिख रहे हैं।',
    response_en: '🪱 Pink Bollworm! Rosette flowers/damaged bolls seen.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },

  // ═══════════════════════════════════════════════════════════════
  // RICE PEST/DISEASE RULES (10 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'RICE_STEMBORER_DIAG_001', 
    crop_code: 'rice', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','PANICLE_INITIATION','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             (symptoms.includes('DEAD_HEART') || symptoms.includes('WHITE_EAR'));
    }`,
    cause: 'RICE_STEM_BORER', 
    priority: 90,
    scientific_source: 'ICAR-IIRR',
    etl_threshold: '5',
    trigger_keywords: [],
    response_mr: '🌾 खोडकिडा! मृत गाभा / पांढरी कणसे दिसतात.',
    response_hi: '🌾 तना छेदक! मृत गाभा / सफेद बाली दिख रही है।',
    response_en: '🌾 Stem Borer! Dead heart / white ear symptoms.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },
  { 
    rule_id: 'RICE_BPH_DIAG_001', 
    crop_code: 'rice', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','PANICLE_INITIATION'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             symptoms.includes('HOPPER_BURN');
    }`,
    cause: 'RICE_BROWN_PLANTHOPPER', 
    priority: 92,
    scientific_source: 'ICAR-IIRR',
    etl_threshold: '10',
    trigger_keywords: [],
    response_mr: '🦗 तपकिरी तुडतुडे! होपर बर्न दिसतो.',
    response_hi: '🦗 भूरा फुदका! होपर बर्न दिख रहा है।',
    response_en: '🦗 Brown Planthopper! Hopper burn symptoms.',
    action_type: 'WARN', 
    canonical_group: '03_pest',
    ipm_level: 4,
    bee_toxicity: 'MODERATE'
  },
  { 
    rule_id: 'RICE_BLAST_DIAG_001', 
    crop_code: 'rice', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','PANICLE_INITIATION','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'rice' && 
             symptoms.includes('DIAMOND_SPOTS');
    }`,
    cause: 'RICE_BLAST', 
    priority: 88,
    scientific_source: 'ICAR-IIRR',
    trigger_keywords: [],
    response_mr: '🍄 भात करपा! हिऱ्याच्या आकाराचे डाग दिसतात.',
    response_hi: '🍄 ब्लास्ट! हीरे के आकार के धब्बे दिख रहे हैं।',
    response_en: '🍄 Rice Blast! Diamond-shaped lesions visible.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════
  // WHEAT RULES (5 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'WHEAT_APHID_DIAG_001', 
    crop_code: 'wheat', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','HEADING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'wheat' && 
             symptoms.includes('SMALL_INSECTS_VISIBLE');
    }`,
    cause: 'WHEAT_APHID', 
    priority: 85,
    scientific_source: 'ICAR-IIWBR',
    etl_threshold: '25',
    trigger_keywords: [],
    response_mr: '🐛 गव्हावर माव! लहान कीटक दिसतात.',
    response_hi: '🐛 गेहूं पर माहू! छोटे कीट दिख रहे हैं।',
    response_en: '🐛 Wheat Aphid! Small insects visible.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },
  { 
    rule_id: 'WHEAT_RUST_DIAG_001', 
    crop_code: 'wheat', 
    category: 'diagnosis', 
    stage_applicable: ['TILLERING','HEADING','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return input.crop_code === 'wheat' && 
             (symptoms.includes('RUST_PUSTULES') || symptoms.includes('ORANGE_SPOTS'));
    }`,
    cause: 'WHEAT_YELLOW_RUST', 
    priority: 90,
    scientific_source: 'ICAR-IIWBR',
    trigger_keywords: [],
    response_mr: '🟠 गव्हावर तांबेरा! नारंगी ठिपके/पुटकुळ्या दिसतात.',
    response_hi: '🟠 गेहूं पर रतुआ! नारंगी धब्बे/पुस्ट्यूल दिख रहे हैं।',
    response_en: '🟠 Wheat Rust! Orange pustules visible.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════
  // UNIVERSAL NUTRIENT RULES (5 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'NUTRIENT_N_DEF_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','TILLERING','SQUARING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('GENERAL_YELLOWING') && 
             symptoms.includes('LOWER_LEAVES_AFFECTED') &&
             input.soil_nitrogen === 'LOW';
    }`,
    cause: 'NITROGEN_DEFICIENCY', 
    priority: 80,
    scientific_source: 'ICAR-NBSS',
    trigger_keywords: [],
    response_mr: '🟡 नायट्रोजन कमतरता! खालची पाने पिवळी + माती N कमी.',
    response_hi: '🟡 नाइट्रोजन की कमी! निचले पत्ते पीले + मिट्टी में N कम।',
    response_en: '🟡 Nitrogen deficiency! Lower leaves yellow + low soil N.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrition',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'NUTRIENT_P_DEF_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','TILLERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('PURPLE_DISCOLORATION') && 
             input.soil_phosphorus === 'LOW';
    }`,
    cause: 'PHOSPHORUS_DEFICIENCY', 
    priority: 78,
    scientific_source: 'ICAR-NBSS',
    trigger_keywords: [],
    response_mr: '🟣 फॉस्फरस कमतरता! जांभळा रंग + माती P कमी.',
    response_hi: '🟣 फॉस्फोरस की कमी! बैंगनी रंग + मिट्टी में P कम।',
    response_en: '🟣 Phosphorus deficiency! Purple color + low soil P.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrition',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'NUTRIENT_K_DEF_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('LEAF_EDGE_BURN') && 
             input.soil_potassium === 'LOW';
    }`,
    cause: 'POTASSIUM_DEFICIENCY', 
    priority: 78,
    scientific_source: 'ICAR-NBSS',
    trigger_keywords: [],
    response_mr: '🟤 पोटॅशियम कमतरता! पानांच्या कडा जळल्या + माती K कमी.',
    response_hi: '🟤 पोटाश की कमी! पत्तों के किनारे जले + मिट्टी में K कम।',
    response_en: '🟤 Potassium deficiency! Leaf edge burn + low soil K.',
    action_type: 'RECOMMEND', 
    canonical_group: '05_nutrition',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════
  // SAFETY/BLOCKING RULES (10 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'SAFETY_RAIN_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      return input.weather?.rain_forecast_4h > 0 || input.weather?.rain_mm > 5;
    }`,
    cause: 'RAIN_BLOCK', 
    priority: 95,
    scientific_source: 'ICAR-GENERIC',
    trigger_keywords: [],
    response_mr: '🌧️ पावसाची शक्यता! फवारणी टाळा - औषध धुवून जाईल.',
    response_hi: '🌧️ बारिश की संभावना! स्प्रे न करें - दवाई धुल जाएगी।',
    response_en: '🌧️ Rain expected! Avoid spraying - pesticide will wash off.',
    action_type: 'BLOCK', 
    canonical_group: '11_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'SAFETY_WIND_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      return input.weather?.wind_speed > 10;
    }`,
    cause: 'WIND_BLOCK', 
    priority: 93,
    scientific_source: 'ICAR-GENERIC',
    trigger_keywords: [],
    response_mr: '💨 जास्त वारा (>10 km/h)! फवारणी टाळा - औषध उडून जाईल.',
    response_hi: '💨 तेज हवा (>10 km/h)! स्प्रे न करें - दवाई उड़ जाएगी।',
    response_en: '💨 High wind (>10 km/h)! Avoid spraying - drift risk.',
    action_type: 'BLOCK', 
    canonical_group: '11_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'SAFETY_TEMP_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      return input.weather?.temperature > 38;
    }`,
    cause: 'TEMPERATURE_BLOCK', 
    priority: 91,
    scientific_source: 'ICAR-GENERIC',
    trigger_keywords: [],
    response_mr: '🌡️ जास्त तापमान (>38°C)! फवारणी टाळा - फायटोटॉक्सिसिटी धोका.',
    response_hi: '🌡️ उच्च तापमान (>38°C)! स्प्रे न करें - फायटोटॉक्सिसिटी खतरा।',
    response_en: '🌡️ High temp (>38°C)! Avoid spraying - phytotoxicity risk.',
    action_type: 'BLOCK', 
    canonical_group: '11_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'SAFETY_POLLINATOR_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['FLOWERING'], 
    conditionCode: `(input) => {
      return input.crop_stage === 'FLOWERING' && 
             input.proposed_chemical?.bee_toxicity === 'HIGH';
    }`,
    cause: 'POLLINATOR_PROTECTION', 
    priority: 94,
    scientific_source: 'ICAR-NBAII',
    trigger_keywords: [],
    response_mr: '🐝 फुलोऱ्याच्या काळात! मधमाशांना विषारी औषध टाळा.',
    response_hi: '🐝 फूल आने के समय! मधुमक्खियों के लिए विषैला स्प्रे न करें।',
    response_en: '🐝 Flowering stage! Avoid bee-toxic chemicals.',
    action_type: 'BLOCK', 
    canonical_group: '11_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'SAFETY_PHI_BLOCK_001', 
    crop_code: 'all', 
    category: 'safety', 
    stage_applicable: ['MATURITY','HARVEST'], 
    conditionCode: `(input) => {
      const days_to_harvest = input.days_to_harvest || 999;
      const phi = input.proposed_chemical?.phi_days || 0;
      return days_to_harvest < phi;
    }`,
    cause: 'PHI_VIOLATION', 
    priority: 96,
    scientific_source: 'FSSAI',
    trigger_keywords: [],
    response_mr: '⚠️ PHI उल्लंघन! कापणीपर्यंत पुरेसा वेळ नाही.',
    response_hi: '⚠️ PHI उल्लंघन! कटाई तक पर्याप्त समय नहीं।',
    response_en: '⚠️ PHI violation! Not enough days before harvest.',
    action_type: 'BLOCK', 
    canonical_group: '11_safety',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════
  // UNIVERSAL PEST OBSERVATION RULES (10 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'UNIVERSAL_APHID_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('SMALL_INSECTS_VISIBLE') && 
             (symptoms.includes('HONEYDEW') || symptoms.includes('CURLED_LEAVES'));
    }`,
    cause: 'APHID_INFESTATION', 
    priority: 82,
    scientific_source: 'ICAR-NBAII',
    trigger_keywords: [],
    response_mr: '🐛 माव्याचा प्रादुर्भाव! लहान कीटक + चिकट/वळलेली पाने.',
    response_hi: '🐛 माहू का प्रकोप! छोटे कीट + चिपचिपापन/मुड़े पत्ते।',
    response_en: '🐛 Aphid infestation! Small insects + honeydew/curled leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },
  { 
    rule_id: 'UNIVERSAL_MITES_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('WEBBING') || 
             (symptoms.includes('TINY_DOTS') && symptoms.includes('LEAF_BRONZE'));
    }`,
    cause: 'MITE_INFESTATION', 
    priority: 80,
    scientific_source: 'ICAR-NBAII',
    trigger_keywords: [],
    response_mr: '🕷️ कोळी (माइट्स)! जाळे + तांबूस पाने.',
    response_hi: '🕷️ माइट्स! जाले + कांसे जैसे पत्ते।',
    response_en: '🕷️ Mites! Webbing + bronze leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },
  { 
    rule_id: 'UNIVERSAL_CATERPILLAR_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING','FRUITING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('LARGE_CATERPILLAR') || 
             symptoms.includes('HOLES_IN_LEAVES');
    }`,
    cause: 'CATERPILLAR_DAMAGE', 
    priority: 84,
    scientific_source: 'ICAR-NBAII',
    trigger_keywords: [],
    response_mr: '🐛 अळी! मोठी अळी / पानांना छिद्रे.',
    response_hi: '🐛 इल्ली! बड़ी इल्ली / पत्तों में छेद।',
    response_en: '🐛 Caterpillar! Large larvae / holes in leaves.',
    action_type: 'RECOMMEND', 
    canonical_group: '03_pest',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════
  // UNIVERSAL DISEASE RULES (5 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'UNIVERSAL_POWDERY_MILDEW_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('WHITE_POWDER');
    }`,
    cause: 'POWDERY_MILDEW', 
    priority: 85,
    scientific_source: 'ICAR-IIHR',
    trigger_keywords: [],
    response_mr: '🤍 भुरी! पांढरी पावडर दिसते.',
    response_hi: '🤍 चूर्णी फफूंद! सफेद पाउडर दिख रहा है।',
    response_en: '🤍 Powdery mildew! White powder visible.',
    action_type: 'RECOMMEND', 
    canonical_group: '04_disease',
    ipm_level: 3,
    bee_toxicity: 'LOW'
  },
  { 
    rule_id: 'UNIVERSAL_WILT_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING','FRUITING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('SUDDEN_WILTING') && 
             !symptoms.includes('DROUGHT_STRESS');
    }`,
    cause: 'WILT_DISEASE', 
    priority: 88,
    scientific_source: 'ICAR-IIHR',
    trigger_keywords: [],
    response_mr: '🥀 मर! अचानक झाड सुकणे.',
    response_hi: '🥀 उकठा! अचानक पौधा मुरझाना।',
    response_en: '🥀 Wilt disease! Sudden plant wilting.',
    action_type: 'WARN', 
    canonical_group: '04_disease',
    ipm_level: 4,
    bee_toxicity: 'LOW'
  },

  // ═══════════════════════════════════════════════════════════════
  // MONITORING/CLARIFICATION RULES (5 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'MONITOR_EARLY_001', 
    crop_code: 'all', 
    category: 'monitoring', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('INSECT_PRESENT') && 
             !symptoms.includes('VISIBLE_DAMAGE') &&
             input.severity === 'LOW';
    }`,
    cause: 'EARLY_DETECTION', 
    priority: 70,
    scientific_source: 'ICAR-GENERIC',
    trigger_keywords: [],
    response_mr: '👁️ लवकर शोध! कीटक दिसले पण नुकसान नाही. निरीक्षण ठेवा.',
    response_hi: '👁️ जल्दी पता! कीट दिखे लेकिन नुकसान नहीं। निगरानी रखें।',
    response_en: '👁️ Early detection! Insects seen but no damage. Monitor closely.',
    action_type: 'INFORM', 
    canonical_group: '06_monitoring',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'CLARIFY_SEVERITY_001', 
    crop_code: 'all', 
    category: 'clarification', 
    stage_applicable: ['ALL'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.length > 0 && !input.severity;
    }`,
    cause: 'SEVERITY_NEEDED', 
    priority: 65,
    scientific_source: 'ICAR-GENERIC',
    trigger_keywords: [],
    response_mr: '❓ तीव्रता सांगा: किती टक्के झाडांना प्रादुर्भाव?',
    response_hi: '❓ गंभीरता बताएं: कितने प्रतिशत पौधों पर प्रकोप?',
    response_en: '❓ Specify severity: What % plants affected?',
    action_type: 'CLARIFY', 
    canonical_group: '07_clarification',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },

  // ═══════════════════════════════════════════════════════════════
  // STRESS RULES (5 essential)
  // ═══════════════════════════════════════════════════════════════
  { 
    rule_id: 'STRESS_WATER_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['VEGETATIVE','FLOWERING','FRUITING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('WILTING_MIDDAY') && 
             input.weather?.rain_mm === 0 &&
             input.soil_moisture === 'LOW';
    }`,
    cause: 'WATER_STRESS', 
    priority: 82,
    scientific_source: 'ICAR-IIWR',
    trigger_keywords: [],
    response_mr: '💧 पाण्याचा ताण! दुपारी कोमेजणे + कोरडी माती.',
    response_hi: '💧 पानी का तनाव! दोपहर में मुरझाना + सूखी मिट्टी।',
    response_en: '💧 Water stress! Midday wilting + dry soil.',
    action_type: 'RECOMMEND', 
    canonical_group: '08_stress',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  },
  { 
    rule_id: 'STRESS_HEAT_001', 
    crop_code: 'all', 
    category: 'diagnosis', 
    stage_applicable: ['FLOWERING','FRUITING'], 
    conditionCode: `(input) => {
      const symptoms = input.visual_symptoms || [];
      return symptoms.includes('FLOWER_DROP') && 
             input.weather?.temperature > 35;
    }`,
    cause: 'HEAT_STRESS', 
    priority: 80,
    scientific_source: 'ICAR-IIHR',
    trigger_keywords: [],
    response_mr: '🌡️ उष्णतेचा ताण! फुले गळणे + तापमान >35°C.',
    response_hi: '🌡️ गर्मी का तनाव! फूल गिरना + तापमान >35°C।',
    response_en: '🌡️ Heat stress! Flower drop + temp >35°C.',
    action_type: 'RECOMMEND', 
    canonical_group: '08_stress',
    ipm_level: 1,
    bee_toxicity: 'SAFE'
  }
];

export const RULES_VERSION = '3.0.0';
export const RULES_COUNT = CANONICAL_RULES.length;
