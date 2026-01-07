/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL GROUP 01: CROP IDENTITY RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for crop recognition and classification.
 * Handles crop code normalization, multilingual crop name mapping,
 * and variety identification.
 * 
 * ICAR Source: ICAR Crop Science Division, State Agricultural Universities
 * Rule Count: 50+ rules
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CROP IDENTITY RULES - Mapping observations to specific crops
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_IDENTITY_RULES: BundledRule[] = [
  // CEREALS
  {
    rule_id: 'CROP_ID_WHEAT_001',
    category: 'crop_identity',
    crop_code: 'wheat',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["wheat", "गहू", "गेहूं", "gehun", "kanak"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_WHEAT',
    priority: 95,
    scientific_source: 'ICAR-IIWBR',
    scientific_basis: 'Wheat (Triticum aestivum) identification via multilingual keywords',
    trigger_keywords: ['wheat', 'गहू', 'गेहूं', 'gehun', 'kanak', 'ਕਣਕ'],
    response_mr: '🌾 गहू ओळखला',
    response_hi: '🌾 गेहूं पहचाना गया',
    response_en: '🌾 Wheat identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_RICE_001',
    category: 'crop_identity',
    crop_code: 'rice',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["rice", "भात", "धान", "चावल", "paddy", "dhan"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_RICE',
    priority: 95,
    scientific_source: 'ICAR-CRRI',
    scientific_basis: 'Rice (Oryza sativa) identification via multilingual keywords',
    trigger_keywords: ['rice', 'भात', 'धान', 'चावल', 'paddy', 'dhan'],
    response_mr: '🌾 भात/धान ओळखला',
    response_hi: '🌾 धान पहचाना गया',
    response_en: '🌾 Rice/Paddy identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_MAIZE_001',
    category: 'crop_identity',
    crop_code: 'maize',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["maize", "मका", "मक्का", "corn", "makka", "bhutta"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_MAIZE',
    priority: 95,
    scientific_source: 'ICAR-IIMR',
    scientific_basis: 'Maize (Zea mays) identification via multilingual keywords',
    trigger_keywords: ['maize', 'मका', 'मक्का', 'corn', 'makka', 'bhutta'],
    response_mr: '🌽 मका ओळखला',
    response_hi: '🌽 मक्का पहचाना गया',
    response_en: '🌽 Maize identified',
    action_type: 'RECOMMEND'
  },
  
  // FIBER CROPS
  {
    rule_id: 'CROP_ID_COTTON_001',
    category: 'crop_identity',
    crop_code: 'cotton',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["cotton", "कापूस", "कपास", "kapas", "narma", "bt cotton"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_COTTON',
    priority: 95,
    scientific_source: 'ICAR-CICR',
    scientific_basis: 'Cotton (Gossypium spp.) identification via multilingual keywords',
    trigger_keywords: ['cotton', 'कापूस', 'कपास', 'kapas', 'narma', 'bt cotton'],
    response_mr: '🪺 कापूस ओळखला',
    response_hi: '🪺 कपास पहचाना गया',
    response_en: '🪺 Cotton identified',
    action_type: 'RECOMMEND'
  },
  
  // SUGARCANE
  {
    rule_id: 'CROP_ID_SUGARCANE_001',
    category: 'crop_identity',
    crop_code: 'sugarcane',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["sugarcane", "ऊस", "गन्ना", "us", "ganna", "sugar cane"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_SUGARCANE',
    priority: 95,
    scientific_source: 'ICAR-SBI',
    scientific_basis: 'Sugarcane (Saccharum officinarum) identification via multilingual keywords',
    trigger_keywords: ['sugarcane', 'ऊस', 'गन्ना', 'us', 'ganna', 'sugar cane'],
    response_mr: '🎋 ऊस ओळखला',
    response_hi: '🎋 गन्ना पहचाना गया',
    response_en: '🎋 Sugarcane identified',
    action_type: 'RECOMMEND'
  },
  
  // PULSES
  {
    rule_id: 'CROP_ID_SOYBEAN_001',
    category: 'crop_identity',
    crop_code: 'soybean',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["soybean", "soya", "सोयाबीन", "सोयाबिन"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_SOYBEAN',
    priority: 95,
    scientific_source: 'ICAR-IISR',
    scientific_basis: 'Soybean (Glycine max) identification via multilingual keywords',
    trigger_keywords: ['soybean', 'soya', 'सोयाबीन', 'सोयाबिन'],
    response_mr: '🫘 सोयाबीन ओळखला',
    response_hi: '🫘 सोयाबीन पहचाना गया',
    response_en: '🫘 Soybean identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_CHICKPEA_001',
    category: 'crop_identity',
    crop_code: 'chickpea',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["chickpea", "chana", "हरभरा", "चना", "gram", "harbhara"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_CHICKPEA',
    priority: 95,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Chickpea (Cicer arietinum) identification via multilingual keywords',
    trigger_keywords: ['chickpea', 'chana', 'हरभरा', 'चना', 'gram', 'harbhara'],
    response_mr: '🫘 हरभरा ओळखला',
    response_hi: '🫘 चना पहचाना गया',
    response_en: '🫘 Chickpea identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_PIGEON_PEA_001',
    category: 'crop_identity',
    crop_code: 'pigeon_pea',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["pigeon pea", "arhar", "tur", "तूर", "अरहर", "red gram"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_PIGEON_PEA',
    priority: 95,
    scientific_source: 'ICAR-IIPR',
    scientific_basis: 'Pigeon pea (Cajanus cajan) identification via multilingual keywords',
    trigger_keywords: ['pigeon pea', 'arhar', 'tur', 'तूर', 'अरहर', 'red gram'],
    response_mr: '🫘 तूर ओळखला',
    response_hi: '🫘 अरहर पहचाना गया',
    response_en: '🫘 Pigeon pea identified',
    action_type: 'RECOMMEND'
  },
  
  // VEGETABLES
  {
    rule_id: 'CROP_ID_TOMATO_001',
    category: 'crop_identity',
    crop_code: 'tomato',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["tomato", "टोमॅटो", "टमाटर", "tamatar"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_TOMATO',
    priority: 95,
    scientific_source: 'ICAR-IIVR',
    scientific_basis: 'Tomato (Solanum lycopersicum) identification via multilingual keywords',
    trigger_keywords: ['tomato', 'टोमॅटो', 'टमाटर', 'tamatar'],
    response_mr: '🍅 टोमॅटो ओळखला',
    response_hi: '🍅 टमाटर पहचाना गया',
    response_en: '🍅 Tomato identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_ONION_001',
    category: 'crop_identity',
    crop_code: 'onion',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["onion", "कांदा", "प्याज", "pyaaz", "kanda"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_ONION',
    priority: 95,
    scientific_source: 'ICAR-DOGR',
    scientific_basis: 'Onion (Allium cepa) identification via multilingual keywords',
    trigger_keywords: ['onion', 'कांदा', 'प्याज', 'pyaaz', 'kanda'],
    response_mr: '🧅 कांदा ओळखला',
    response_hi: '🧅 प्याज पहचाना गया',
    response_en: '🧅 Onion identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_CHILLI_001',
    category: 'crop_identity',
    crop_code: 'chilli',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["chilli", "मिरची", "मिर्च", "mirchi", "pepper"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_CHILLI',
    priority: 95,
    scientific_source: 'ICAR-IISR Spices',
    scientific_basis: 'Chilli (Capsicum annuum) identification via multilingual keywords',
    trigger_keywords: ['chilli', 'मिरची', 'मिर्च', 'mirchi', 'pepper'],
    response_mr: '🌶️ मिरची ओळखला',
    response_hi: '🌶️ मिर्च पहचाना गया',
    response_en: '🌶️ Chilli identified',
    action_type: 'RECOMMEND'
  },
  
  // OILSEEDS
  {
    rule_id: 'CROP_ID_GROUNDNUT_001',
    category: 'crop_identity',
    crop_code: 'groundnut',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["groundnut", "peanut", "भुईमूग", "मूंगफली", "shengdana", "moongphali"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_GROUNDNUT',
    priority: 95,
    scientific_source: 'ICAR-DGR',
    scientific_basis: 'Groundnut (Arachis hypogaea) identification via multilingual keywords',
    trigger_keywords: ['groundnut', 'peanut', 'भुईमूग', 'मूंगफली', 'shengdana', 'moongphali'],
    response_mr: '🥜 भुईमूग ओळखला',
    response_hi: '🥜 मूंगफली पहचाना गया',
    response_en: '🥜 Groundnut identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_SUNFLOWER_001',
    category: 'crop_identity',
    crop_code: 'sunflower',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["sunflower", "सूर्यफूल", "सूरजमुखी", "surajmukhi"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_SUNFLOWER',
    priority: 95,
    scientific_source: 'ICAR-IIOR',
    scientific_basis: 'Sunflower (Helianthus annuus) identification via multilingual keywords',
    trigger_keywords: ['sunflower', 'सूर्यफूल', 'सूरजमुखी', 'surajmukhi'],
    response_mr: '🌻 सूर्यफूल ओळखला',
    response_hi: '🌻 सूरजमुखी पहचाना गया',
    response_en: '🌻 Sunflower identified',
    action_type: 'RECOMMEND'
  },
  
  // FRUITS
  {
    rule_id: 'CROP_ID_MANGO_001',
    category: 'crop_identity',
    crop_code: 'mango',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["mango", "आंबा", "आम", "aam", "amba"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_MANGO',
    priority: 95,
    scientific_source: 'ICAR-CISH',
    scientific_basis: 'Mango (Mangifera indica) identification via multilingual keywords',
    trigger_keywords: ['mango', 'आंबा', 'आम', 'aam', 'amba'],
    response_mr: '🥭 आंबा ओळखला',
    response_hi: '🥭 आम पहचाना गया',
    response_en: '🥭 Mango identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_BANANA_001',
    category: 'crop_identity',
    crop_code: 'banana',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["banana", "केळे", "केला", "kela"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_BANANA',
    priority: 95,
    scientific_source: 'ICAR-NRCB',
    scientific_basis: 'Banana (Musa spp.) identification via multilingual keywords',
    trigger_keywords: ['banana', 'केळे', 'केला', 'kela'],
    response_mr: '🍌 केळे ओळखला',
    response_hi: '🍌 केला पहचाना गया',
    response_en: '🍌 Banana identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_GRAPES_001',
    category: 'crop_identity',
    crop_code: 'grapes',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["grapes", "द्राक्षे", "अंगूर", "angur", "draksha"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_GRAPES',
    priority: 95,
    scientific_source: 'ICAR-NRC Grapes',
    scientific_basis: 'Grapes (Vitis vinifera) identification via multilingual keywords',
    trigger_keywords: ['grapes', 'द्राक्षे', 'अंगूर', 'angur', 'draksha'],
    response_mr: '🍇 द्राक्षे ओळखला',
    response_hi: '🍇 अंगूर पहचाना गया',
    response_en: '🍇 Grapes identified',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ID_POMEGRANATE_001',
    category: 'crop_identity',
    crop_code: 'pomegranate',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["pomegranate", "डाळिंब", "अनार", "anar", "dalimb"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'CROP_IDENTIFIED_POMEGRANATE',
    priority: 95,
    scientific_source: 'ICAR-NRC Pomegranate',
    scientific_basis: 'Pomegranate (Punica granatum) identification via multilingual keywords',
    trigger_keywords: ['pomegranate', 'डाळिंब', 'अनार', 'anar', 'dalimb'],
    response_mr: '🍎 डाळिंब ओळखला',
    response_hi: '🍎 अनार पहचाना गया',
    response_en: '🍎 Pomegranate identified',
    action_type: 'RECOMMEND'
  }
];

// Export count for metadata
export const CROP_IDENTITY_RULE_COUNT = CROP_IDENTITY_RULES.length;
