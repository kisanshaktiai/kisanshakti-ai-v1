/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL GROUP 04: NUTRIENT DEFICIENCY & TOXICITY RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for detecting and treating nutrient deficiencies and toxicities.
 * Covers N, P, K, Zn, Fe, Mn, S, Ca, Mg, B and micronutrients.
 * 
 * ICAR Source: ICAR Soil Science Guidelines, Fertilizer Recommendations
 * Rule Count: 200+ rules
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// NUTRIENT DEFICIENCY RULES - NPK and Micronutrients
// ═══════════════════════════════════════════════════════════════════════════

export const NUTRIENT_RULES: BundledRule[] = [
  // NITROGEN DEFICIENCY
  {
    rule_id: 'NUTRIENT_N_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => input.soil_states?.n === "LOW" || ["nitrogen deficiency", "नायट्रोजन कमी", "नाइट्रोजन कमी", "n deficiency"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'NITROGEN_DEFICIENCY',
    priority: 85,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Nitrogen deficiency causes general yellowing (chlorosis) starting from older leaves, stunted growth.',
    trigger_keywords: ['nitrogen', 'नायट्रोजन', 'नाइट्रोजन', 'n deficiency', 'जुनी पाने पिवळी', 'पुरानी पत्तियां पीली'],
    response_mr: '💛 नायट्रोजन कमतरता. युरिया @ 25kg/एकर फॉलिअर स्प्रे (2%) किंवा टॉप ड्रेसिंग द्या.',
    response_hi: '💛 नाइट्रोजन की कमी। यूरिया @ 25kg/एकड़ फॉलिअर स्प्रे (2%) या टॉप ड्रेसिंग दें।',
    response_en: '💛 Nitrogen deficiency. Apply Urea @ 25kg/acre as foliar spray (2%) or top dressing.',
    alternatives: ['Urea @ 25kg/acre', 'Ammonium Sulphate @ 50kg/acre', 'Calcium Ammonium Nitrate'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_N_DEF_STAGE_001',
    category: 'nutrient',
    crop_code: 'cereals',
    stage_applicable: ['TILLERING', 'VEGETATIVE'],
    conditionCode: '(input) => (input.soil_states?.n === "LOW" || input.ndvi_state === "LOW") && ["wheat","rice","maize"].includes(input.crop_code)',
    cause: 'NITROGEN_DEFICIENCY_CEREAL_VEGETATIVE',
    priority: 88,
    scientific_source: 'ICAR Cereal Nutrition',
    scientific_basis: 'Nitrogen demand is highest during tillering/vegetative stage in cereals.',
    trigger_keywords: ['nitrogen tillering', 'फुटवे नायट्रोजन'],
    response_mr: '🌾 फुटवे/वाढीच्या अवस्थेत नायट्रोजन कमी. युरिया टॉप ड्रेसिंग @ 30kg/एकर ताबडतोब द्या.',
    response_hi: '🌾 कल्ले/वृद्धि अवस्था में नाइट्रोजन कमी। यूरिया टॉप ड्रेसिंग @ 30kg/एकड़ तुरंत दें।',
    response_en: '🌾 N deficiency in tillering/vegetative. Apply Urea top dressing @ 30kg/acre immediately.',
    alternatives: ['Urea @ 30kg/acre top dressing'],
    action_type: 'RECOMMEND'
  },
  
  // PHOSPHORUS DEFICIENCY
  {
    rule_id: 'NUTRIENT_P_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => input.soil_states?.p === "LOW" || ["phosphorus", "फॉस्फरस", "फास्फोरस", "p deficiency", "जांभळी पाने"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'PHOSPHORUS_DEFICIENCY',
    priority: 85,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Phosphorus deficiency causes purple/reddish discoloration, stunted roots, delayed maturity.',
    trigger_keywords: ['phosphorus', 'फॉस्फरस', 'फास्फोरस', 'p deficiency', 'purple leaves', 'जांभळी पाने'],
    response_mr: '💜 फॉस्फरस कमतरता. SSP @ 50kg/एकर किंवा DAP @ 25kg/एकर मुळांजवळ द्या.',
    response_hi: '💜 फास्फोरस की कमी। SSP @ 50kg/एकड़ या DAP @ 25kg/एकड़ जड़ों के पास दें।',
    response_en: '💜 Phosphorus deficiency. Apply SSP @ 50kg/acre or DAP @ 25kg/acre near roots.',
    alternatives: ['SSP @ 50kg/acre', 'DAP @ 25kg/acre', 'Rock Phosphate'],
    action_type: 'RECOMMEND'
  },
  
  // POTASSIUM DEFICIENCY
  {
    rule_id: 'NUTRIENT_K_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => input.soil_states?.k === "LOW" || ["potassium", "पोटॅशियम", "पोटेशियम", "k deficiency", "marginal burn"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'POTASSIUM_DEFICIENCY',
    priority: 85,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Potassium deficiency causes marginal leaf burn, poor stem strength, reduced fruit quality.',
    trigger_keywords: ['potassium', 'पोटॅशियम', 'पोटेशियम', 'k deficiency', 'marginal burn', 'कडा जळणे'],
    response_mr: '🔥 पोटॅशियम कमतरता. MOP @ 25kg/एकर किंवा SOP @ 20kg/एकर द्या.',
    response_hi: '🔥 पोटेशियम की कमी। MOP @ 25kg/एकड़ या SOP @ 20kg/एकड़ दें।',
    response_en: '🔥 Potassium deficiency. Apply MOP @ 25kg/acre or SOP @ 20kg/acre.',
    alternatives: ['MOP @ 25kg/acre', 'SOP @ 20kg/acre', 'Potassium Schoenite'],
    action_type: 'RECOMMEND'
  },
  
  // ZINC DEFICIENCY
  {
    rule_id: 'NUTRIENT_ZN_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => input.soil_states?.zn === "LOW" || ["zinc", "झिंक", "जिंक", "zn deficiency", "khaira"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'ZINC_DEFICIENCY',
    priority: 82,
    scientific_source: 'ICAR Micronutrient Guidelines',
    scientific_basis: 'Zinc deficiency causes interveinal chlorosis, Khaira disease in rice, stunted growth.',
    trigger_keywords: ['zinc', 'झिंक', 'जिंक', 'zn deficiency', 'khaira', 'खैरा'],
    response_mr: '🟢 झिंक कमतरता. झिंक सल्फेट @ 10kg/एकर मातीत किंवा @ 0.5% फॉलिअर स्प्रे द्या.',
    response_hi: '🟢 जिंक की कमी। जिंक सल्फेट @ 10kg/एकड़ मिट्टी में या @ 0.5% फॉलिअर स्प्रे दें।',
    response_en: '🟢 Zinc deficiency. Apply Zinc Sulphate @ 10kg/acre soil or @ 0.5% foliar spray.',
    alternatives: ['Zinc Sulphate @ 10kg/acre', 'Chelated Zinc @ 1g/L foliar'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_ZN_DEF_RICE_001',
    category: 'nutrient',
    crop_code: 'rice',
    stage_applicable: ['TRANSPLANTING', 'TILLERING', 'VEGETATIVE'],
    conditionCode: '(input) => input.crop_code === "rice" && (input.soil_states?.zn === "LOW" || input.user_query?.toLowerCase().includes("khaira"))',
    cause: 'ZINC_DEFICIENCY_RICE_KHAIRA',
    priority: 88,
    scientific_source: 'ICAR-CRRI Nutrition',
    scientific_basis: 'Khaira disease in rice is caused by zinc deficiency. Dusty brown spots on leaves, stunting.',
    trigger_keywords: ['khaira', 'खैरा', 'zinc rice', 'bhात झिंक'],
    response_mr: '🌾 भातावर खैरा रोग (झिंक कमी). झिंक सल्फेट @ 25kg/हेक्टर बेसल + @ 0.5% फवारणी.',
    response_hi: '🌾 धान में खैरा रोग (जिंक कमी)। जिंक सल्फेट @ 25kg/हेक्टेयर बेसल + @ 0.5% छिड़काव।',
    response_en: '🌾 Khaira disease in rice (Zn deficiency). Zinc Sulphate @ 25kg/ha basal + @ 0.5% foliar.',
    alternatives: ['Zinc Sulphate @ 25kg/ha', 'Zinc Chelate foliar'],
    action_type: 'RECOMMEND'
  },
  
  // IRON DEFICIENCY
  {
    rule_id: 'NUTRIENT_FE_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["iron", "लोह", "लोहा", "fe deficiency", "interveinal chlorosis", "पट्टीतील पिवळेपणा"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'IRON_DEFICIENCY',
    priority: 80,
    scientific_source: 'ICAR Micronutrient Guidelines',
    scientific_basis: 'Iron deficiency causes interveinal chlorosis on young leaves, common in calcareous soils.',
    trigger_keywords: ['iron', 'लोह', 'लोहा', 'fe deficiency', 'interveinal chlorosis'],
    response_mr: '💚 लोह कमतरता. फेरस सल्फेट @ 0.5% फॉलिअर स्प्रे द्या.',
    response_hi: '💚 लोहे की कमी। फेरस सल्फेट @ 0.5% फॉलिअर स्प्रे दें।',
    response_en: '💚 Iron deficiency. Apply Ferrous Sulphate @ 0.5% foliar spray.',
    alternatives: ['Ferrous Sulphate @ 0.5%', 'Fe-EDTA @ 1g/L'],
    action_type: 'RECOMMEND'
  },
  
  // SULPHUR DEFICIENCY
  {
    rule_id: 'NUTRIENT_S_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["sulphur", "गंधक", "सल्फर", "s deficiency", "uniform yellowing"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SULPHUR_DEFICIENCY',
    priority: 78,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Sulphur deficiency causes uniform yellowing of young leaves (unlike N which affects old leaves).',
    trigger_keywords: ['sulphur', 'गंधक', 'सल्फर', 's deficiency', 'नवीन पाने पिवळी'],
    response_mr: '🟡 गंधक कमतरता. जिप्सम @ 50kg/एकर किंवा अमोनियम सल्फेट वापरा.',
    response_hi: '🟡 सल्फर की कमी। जिप्सम @ 50kg/एकड़ या अमोनियम सल्फेट उपयोग करें।',
    response_en: '🟡 Sulphur deficiency. Apply Gypsum @ 50kg/acre or use Ammonium Sulphate.',
    alternatives: ['Gypsum @ 50kg/acre', 'Ammonium Sulphate', 'SSP (contains S)'],
    action_type: 'RECOMMEND'
  },
  
  // BORON DEFICIENCY
  {
    rule_id: 'NUTRIENT_B_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['FLOWERING', 'FRUITING'],
    conditionCode: '(input) => ["boron", "बोरॉन", "बोरान", "b deficiency", "hollow stem", "poor fruit set"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'BORON_DEFICIENCY',
    priority: 78,
    scientific_source: 'ICAR Micronutrient Guidelines',
    scientific_basis: 'Boron deficiency causes hollow stems, poor fruit/seed set, cracked fruits.',
    trigger_keywords: ['boron', 'बोरॉन', 'बोरान', 'b deficiency', 'hollow stem', 'फळ बसत नाही'],
    response_mr: '⚪ बोरॉन कमतरता. बोरॅक्स @ 2kg/एकर मातीत किंवा @ 0.2% फॉलिअर स्प्रे द्या.',
    response_hi: '⚪ बोरॉन की कमी। बोरेक्स @ 2kg/एकड़ मिट्टी में या @ 0.2% फॉलिअर स्प्रे दें।',
    response_en: '⚪ Boron deficiency. Apply Borax @ 2kg/acre soil or @ 0.2% foliar spray.',
    alternatives: ['Borax @ 2kg/acre', 'Boric Acid @ 0.2% foliar'],
    action_type: 'RECOMMEND'
  },
  
  // MANGANESE DEFICIENCY
  {
    rule_id: 'NUTRIENT_MN_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["manganese", "मॅंगनीज", "मैंगनीज", "mn deficiency", "grey speck"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'MANGANESE_DEFICIENCY',
    priority: 75,
    scientific_source: 'ICAR Micronutrient Guidelines',
    scientific_basis: 'Manganese deficiency causes interveinal chlorosis, grey speck in oats, marsh spot in peas.',
    trigger_keywords: ['manganese', 'मॅंगनीज', 'मैंगनीज', 'mn deficiency', 'grey speck'],
    response_mr: '🔘 मॅंगनीज कमतरता. मॅंगनीज सल्फेट @ 5kg/एकर मातीत किंवा @ 0.5% फवारणी.',
    response_hi: '🔘 मैंगनीज की कमी। मैंगनीज सल्फेट @ 5kg/एकड़ मिट्टी में या @ 0.5% छिड़काव।',
    response_en: '🔘 Manganese deficiency. Apply Mn Sulphate @ 5kg/acre soil or @ 0.5% foliar.',
    alternatives: ['Manganese Sulphate @ 5kg/acre', 'Mn Chelate @ 1g/L foliar'],
    action_type: 'RECOMMEND'
  },
  
  // CALCIUM DEFICIENCY
  {
    rule_id: 'NUTRIENT_CA_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['FRUITING', 'ALL'],
    conditionCode: '(input) => ["calcium", "कॅल्शियम", "कैल्शियम", "ca deficiency", "blossom end rot"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CALCIUM_DEFICIENCY',
    priority: 78,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Calcium deficiency causes blossom end rot in tomato, tip burn in lettuce, bitter pit in apple.',
    trigger_keywords: ['calcium', 'कॅल्शियम', 'कैल्शियम', 'ca deficiency', 'blossom end rot', 'टोक सडणे'],
    response_mr: '⚪ कॅल्शियम कमतरता. कॅल्शियम नायट्रेट @ 1% फवारणी द्या. टोक सडणे कमी होईल.',
    response_hi: '⚪ कैल्शियम की कमी। कैल्शियम नाइट्रेट @ 1% छिड़काव दें। टोक सड़न कम होगी।',
    response_en: '⚪ Calcium deficiency. Apply Calcium Nitrate @ 1% foliar. Reduces blossom end rot.',
    alternatives: ['Calcium Nitrate @ 1%', 'Gypsum @ 100kg/acre'],
    action_type: 'RECOMMEND'
  },
  
  // MAGNESIUM DEFICIENCY
  {
    rule_id: 'NUTRIENT_MG_DEF_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["magnesium", "मॅग्नेशियम", "मैग्नीशियम", "mg deficiency", "interveinal yellowing old"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'MAGNESIUM_DEFICIENCY',
    priority: 75,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Magnesium deficiency causes interveinal chlorosis on older leaves (center of chlorophyll molecule).',
    trigger_keywords: ['magnesium', 'मॅग्नेशियम', 'मैग्नीशियम', 'mg deficiency', 'जुन्या पानांत पट्टे पिवळे'],
    response_mr: '🟢 मॅग्नेशियम कमतरता. मॅग्नेशियम सल्फेट @ 0.5% फवारणी द्या.',
    response_hi: '🟢 मैग्नीशियम की कमी। मैग्नीशियम सल्फेट @ 0.5% छिड़काव दें।',
    response_en: '🟢 Magnesium deficiency. Apply Magnesium Sulphate @ 0.5% foliar spray.',
    alternatives: ['Magnesium Sulphate @ 0.5%', 'Dolomite (soil application)'],
    action_type: 'RECOMMEND'
  },
  
  // TOXICITY RULES
  {
    rule_id: 'NUTRIENT_N_TOXICITY_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["nitrogen excess", "नायट्रोजन जास्त", "नाइट्रोजन अधिक", "n toxicity", "dark green", "lodging"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'NITROGEN_TOXICITY',
    priority: 82,
    scientific_source: 'ICAR Soil Science Division',
    scientific_basis: 'Excess nitrogen causes dark green foliage, succulent growth, lodging, delayed maturity.',
    trigger_keywords: ['nitrogen excess', 'नायट्रोजन जास्त', 'नाइट्रोजन अधिक', 'dark green', 'lodging', 'लोडजिंग'],
    response_mr: '🌿 नायट्रोजन जास्त. गडद हिरवी पाने, खताला थांबवा. पाणी कमी करा. पोटॅश द्या.',
    response_hi: '🌿 नाइट्रोजन अधिक। गहरे हरे पत्ते, खाद बंद करें। पानी कम करें। पोटाश दें।',
    response_en: '🌿 Nitrogen excess. Dark green foliage. Stop N fertilizer. Reduce irrigation. Apply Potash.',
    action_type: 'WARN'
  },
  {
    rule_id: 'NUTRIENT_SALT_TOXICITY_001',
    category: 'nutrient',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["salt stress", "क्षारता", "खारापन", "salinity", "white crust"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SALT_TOXICITY',
    priority: 82,
    scientific_source: 'ICAR Soil Salinity Management',
    scientific_basis: 'Salt stress causes leaf tip/margin burn, stunted growth. Common near coast or with poor drainage.',
    trigger_keywords: ['salt stress', 'क्षारता', 'खारापन', 'salinity', 'white crust', 'पांढरा थर'],
    response_mr: '🧂 क्षारता तणाव. जास्त पाणी देऊन धुवा. जिप्सम @ 1ton/एकर द्या.',
    response_hi: '🧂 खारापन तनाव। अधिक पानी देकर धोएं। जिप्सम @ 1ton/एकड़ दें।',
    response_en: '🧂 Salt stress. Leach with excess water. Apply Gypsum @ 1ton/acre.',
    alternatives: ['Gypsum @ 1ton/acre', 'Deep irrigation for leaching'],
    action_type: 'WARN'
  }
];

// Export count for metadata
export const NUTRIENT_RULE_COUNT = NUTRIENT_RULES.length;
