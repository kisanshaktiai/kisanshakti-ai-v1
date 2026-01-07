/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL GROUP 02: GROWTH STAGE RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for growth stage determination and validation.
 * Handles stage progression, GDD-based phenology, and stage-specific constraints.
 * 
 * ICAR Source: ICAR Crop Phenology Guidelines, State Agricultural Universities
 * Rule Count: 80+ rules
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// GROWTH STAGE RULES - Stage determination and validation
// ═══════════════════════════════════════════════════════════════════════════

export const GROWTH_STAGE_RULES: BundledRule[] = [
  // GENERIC STAGE DETECTION
  {
    rule_id: 'STAGE_GERMINATION_001',
    category: 'growth_stage',
    crop_code: 'all',
    stage_applicable: ['GERMINATION'],
    conditionCode: '(input) => ["germination", "उगवण", "अंकुरण", "sprouting", "emergence", "seedling"].some(k => input.user_query?.toLowerCase().includes(k)) || input.days_after_sowing <= 15',
    cause: 'STAGE_GERMINATION_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Crop Phenology',
    scientific_basis: 'Germination stage: 0-15 DAS for most crops. Critical for stand establishment.',
    trigger_keywords: ['germination', 'उगवण', 'अंकुरण', 'sprouting', 'emergence', 'seedling'],
    response_mr: '🌱 उगवण अवस्था ओळखली. पाणी व्यवस्थापन महत्वाचे.',
    response_hi: '🌱 अंकुरण अवस्था पहचानी। पानी प्रबंधन महत्वपूर्ण।',
    response_en: '🌱 Germination stage detected. Water management critical.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_VEGETATIVE_001',
    category: 'growth_stage',
    crop_code: 'all',
    stage_applicable: ['VEGETATIVE'],
    conditionCode: '(input) => ["vegetative", "वाढ", "वृद्धि", "growing", "वनस्पति"].some(k => input.user_query?.toLowerCase().includes(k)) || (input.days_after_sowing > 15 && input.days_after_sowing <= 45)',
    cause: 'STAGE_VEGETATIVE_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Crop Phenology',
    scientific_basis: 'Vegetative stage: Active leaf and stem growth. High nitrogen demand.',
    trigger_keywords: ['vegetative', 'वाढ', 'वृद्धि', 'growing', 'वनस्पति'],
    response_mr: '🌿 वाढीची अवस्था. नायट्रोजन खतासाठी योग्य वेळ.',
    response_hi: '🌿 वृद्धि अवस्था। नाइट्रोजन उर्वरक के लिए उचित समय।',
    response_en: '🌿 Vegetative stage. Right time for nitrogen fertilization.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_TILLERING_001',
    category: 'growth_stage',
    crop_code: 'cereals',
    stage_applicable: ['TILLERING'],
    conditionCode: '(input) => ["tillering", "फुटवे", "कल्ले", "tiller"].some(k => input.user_query?.toLowerCase().includes(k)) || (["wheat","rice"].includes(input.crop_code) && input.days_after_sowing > 20 && input.days_after_sowing <= 50)',
    cause: 'STAGE_TILLERING_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Cereal Phenology',
    scientific_basis: 'Tillering stage in cereals: Critical for yield determination. Tiller count affects final ear count.',
    trigger_keywords: ['tillering', 'फुटवे', 'कल्ले', 'tiller'],
    response_mr: '🌾 फुटवे अवस्था. नायट्रोजन टॉप ड्रेसिंग करा.',
    response_hi: '🌾 कल्ले निकलने की अवस्था। नाइट्रोजन टॉप ड्रेसिंग करें।',
    response_en: '🌾 Tillering stage. Apply nitrogen top dressing.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_FLOWERING_001',
    category: 'growth_stage',
    crop_code: 'all',
    stage_applicable: ['FLOWERING'],
    conditionCode: '(input) => ["flowering", "फुलोरा", "फूल", "bloom", "anthesis"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'STAGE_FLOWERING_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Crop Phenology',
    scientific_basis: 'Flowering stage: Most critical for yield. Avoid water stress and pesticide applications.',
    trigger_keywords: ['flowering', 'फुलोरा', 'फूल', 'bloom', 'anthesis'],
    response_mr: '🌸 फुलोरा अवस्था. कीटनाशक फवारणी टाळा. पाणी व्यवस्थापन अत्यंत महत्वाचे.',
    response_hi: '🌸 फूल आने की अवस्था। कीटनाशक छिड़काव टालें। पानी प्रबंधन बहुत महत्वपूर्ण।',
    response_en: '🌸 Flowering stage. Avoid pesticide sprays. Water management very critical.',
    action_type: 'WARN'
  },
  {
    rule_id: 'STAGE_HEADING_001',
    category: 'growth_stage',
    crop_code: 'cereals',
    stage_applicable: ['HEADING'],
    conditionCode: '(input) => ["heading", "ओंबी", "बाली", "ear emergence", "panicle"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'STAGE_HEADING_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Cereal Phenology',
    scientific_basis: 'Heading stage: Ear/panicle emergence. Critical for grain set.',
    trigger_keywords: ['heading', 'ओंबी', 'बाली', 'ear emergence', 'panicle'],
    response_mr: '🌾 ओंबी/बाली अवस्था. पाणी तणाव टाळा.',
    response_hi: '🌾 बाली निकलने की अवस्था। पानी का तनाव टालें।',
    response_en: '🌾 Heading stage. Avoid water stress.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_GRAIN_FILL_001',
    category: 'growth_stage',
    crop_code: 'cereals',
    stage_applicable: ['GRAIN_FILL'],
    conditionCode: '(input) => ["grain fill", "दाणे भरणे", "दाना भरना", "grain filling", "milk stage", "dough stage"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'STAGE_GRAIN_FILL_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Cereal Phenology',
    scientific_basis: 'Grain filling stage: Active photosynthate translocation. Protect leaves from disease.',
    trigger_keywords: ['grain fill', 'दाणे भरणे', 'दाना भरना', 'grain filling', 'milk stage', 'dough stage'],
    response_mr: '🌾 दाणे भरण्याची अवस्था. पानांचे आरोग्य टिकवा.',
    response_hi: '🌾 दाना भरने की अवस्था। पत्तियों का स्वास्थ्य बनाए रखें।',
    response_en: '🌾 Grain filling stage. Maintain leaf health.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_MATURITY_001',
    category: 'growth_stage',
    crop_code: 'all',
    stage_applicable: ['MATURITY'],
    conditionCode: '(input) => ["maturity", "पक्वता", "पकाव", "harvest ready", "mature"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'STAGE_MATURITY_DETECTED',
    priority: 90,
    scientific_source: 'ICAR Crop Phenology',
    scientific_basis: 'Maturity stage: Crop ready for harvest. Moisture content critical for storage.',
    trigger_keywords: ['maturity', 'पक्वता', 'पकाव', 'harvest ready', 'mature'],
    response_mr: '🌾 पक्वता अवस्था. कापणीची तयारी करा.',
    response_hi: '🌾 पकाव अवस्था। कटाई की तैयारी करें।',
    response_en: '🌾 Maturity stage. Prepare for harvest.',
    action_type: 'RECOMMEND'
  },
  
  // SUGARCANE SPECIFIC STAGES
  {
    rule_id: 'STAGE_SUGARCANE_GERMINATION_001',
    category: 'growth_stage',
    crop_code: 'sugarcane',
    stage_applicable: ['GERMINATION'],
    conditionCode: '(input) => input.crop_code === "sugarcane" && input.days_after_sowing <= 35',
    cause: 'SUGARCANE_GERMINATION_STAGE',
    priority: 92,
    scientific_source: 'ICAR-SBI Sugarcane Phenology',
    scientific_basis: 'Sugarcane germination: 0-35 days after planting. Bud sprouting from setts.',
    trigger_keywords: ['sugarcane germination', 'उस उगवण', 'गन्ना अंकुरण'],
    response_mr: '🎋 ऊस उगवण अवस्था (0-35 दिवस). आर्द्रता टिकवा. वाळवी तपासा.',
    response_hi: '🎋 गन्ना अंकुरण अवस्था (0-35 दिन)। नमी बनाए रखें। दीमक जांचें।',
    response_en: '🎋 Sugarcane germination (0-35 days). Maintain moisture. Check for termites.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_SUGARCANE_TILLERING_001',
    category: 'growth_stage',
    crop_code: 'sugarcane',
    stage_applicable: ['TILLERING'],
    conditionCode: '(input) => input.crop_code === "sugarcane" && input.days_after_sowing > 35 && input.days_after_sowing <= 120',
    cause: 'SUGARCANE_TILLERING_STAGE',
    priority: 92,
    scientific_source: 'ICAR-SBI Sugarcane Phenology',
    scientific_basis: 'Sugarcane tillering: 35-120 DAP. Maximum tillers develop. Critical for final cane count.',
    trigger_keywords: ['sugarcane tillering', 'ऊस फुटवे', 'गन्ना कल्ले'],
    response_mr: '🎋 ऊस फुटवे अवस्था (35-120 दिवस). नायट्रोजन खत द्या. खोडकिड तपासा.',
    response_hi: '🎋 गन्ना कल्ले अवस्था (35-120 दिन)। नाइट्रोजन खाद दें। तना छेदक जांचें।',
    response_en: '🎋 Sugarcane tillering (35-120 days). Apply nitrogen. Monitor stem borer.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_SUGARCANE_GRAND_GROWTH_001',
    category: 'growth_stage',
    crop_code: 'sugarcane',
    stage_applicable: ['GRAND_GROWTH'],
    conditionCode: '(input) => input.crop_code === "sugarcane" && input.days_after_sowing > 120 && input.days_after_sowing <= 270',
    cause: 'SUGARCANE_GRAND_GROWTH_STAGE',
    priority: 92,
    scientific_source: 'ICAR-SBI Sugarcane Phenology',
    scientific_basis: 'Sugarcane grand growth: 120-270 DAP. Rapid cane elongation. 70% of total growth.',
    trigger_keywords: ['grand growth', 'वेगवान वाढ', 'तीव्र वृद्धि'],
    response_mr: '🎋 वेगवान वाढ अवस्था (120-270 दिवस). पाणी आणि खत नियमित द्या.',
    response_hi: '🎋 तीव्र वृद्धि अवस्था (120-270 दिन)। पानी और खाद नियमित दें।',
    response_en: '🎋 Grand growth (120-270 days). Ensure regular water and fertilizer.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_SUGARCANE_MATURITY_001',
    category: 'growth_stage',
    crop_code: 'sugarcane',
    stage_applicable: ['MATURITY'],
    conditionCode: '(input) => input.crop_code === "sugarcane" && input.days_after_sowing > 270',
    cause: 'SUGARCANE_MATURITY_STAGE',
    priority: 92,
    scientific_source: 'ICAR-SBI Sugarcane Phenology',
    scientific_basis: 'Sugarcane maturity: >270 DAP. Sugar accumulation. Stop irrigation before harvest.',
    trigger_keywords: ['sugarcane maturity', 'ऊस पक्वता', 'गन्ना परिपक्वता'],
    response_mr: '🎋 ऊस पक्वता अवस्था (>270 दिवस). पाणी बंद करा. कापणीची तयारी करा.',
    response_hi: '🎋 गन्ना परिपक्वता (>270 दिन)। पानी बंद करें। कटाई की तैयारी करें।',
    response_en: '🎋 Sugarcane maturity (>270 days). Stop irrigation. Prepare for harvest.',
    action_type: 'RECOMMEND'
  },
  
  // COTTON SPECIFIC STAGES
  {
    rule_id: 'STAGE_COTTON_SQUARING_001',
    category: 'growth_stage',
    crop_code: 'cotton',
    stage_applicable: ['SQUARING'],
    conditionCode: '(input) => input.crop_code === "cotton" && (input.days_after_sowing > 35 && input.days_after_sowing <= 55)',
    cause: 'COTTON_SQUARING_STAGE',
    priority: 92,
    scientific_source: 'ICAR-CICR Cotton Phenology',
    scientific_basis: 'Cotton squaring: First square (flower bud) appears. Critical for yield potential.',
    trigger_keywords: ['squaring', 'पाते', 'कली', 'square formation'],
    response_mr: '🪺 कापूस पाते अवस्था. फुल-कळी संख्या तपासा. रस शोषक किडी तपासा.',
    response_hi: '🪺 कपास कली अवस्था। फूल-कली संख्या जांचें। रस चूसक कीट जांचें।',
    response_en: '🪺 Cotton squaring stage. Check square count. Monitor sucking pests.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'STAGE_COTTON_BOLL_FORMATION_001',
    category: 'growth_stage',
    crop_code: 'cotton',
    stage_applicable: ['BOLL_FORMATION'],
    conditionCode: '(input) => input.crop_code === "cotton" && input.days_after_sowing > 70 && input.days_after_sowing <= 120',
    cause: 'COTTON_BOLL_FORMATION_STAGE',
    priority: 92,
    scientific_source: 'ICAR-CICR Cotton Phenology',
    scientific_basis: 'Cotton boll formation: Green bolls developing. Critical for fiber quality.',
    trigger_keywords: ['boll', 'बोंड', 'गोंद', 'boll formation'],
    response_mr: '🪺 कापूस बोंड अवस्था. गुलाबी बोंड अळी तपासा. PHI पाळा.',
    response_hi: '🪺 कपास गोंद अवस्था। गुलाबी बॉलवर्म जांचें। PHI का पालन करें।',
    response_en: '🪺 Cotton boll formation. Monitor pink bollworm. Follow PHI.',
    action_type: 'WARN'
  },
  {
    rule_id: 'STAGE_COTTON_BOLL_OPENING_001',
    category: 'growth_stage',
    crop_code: 'cotton',
    stage_applicable: ['BOLL_OPENING'],
    conditionCode: '(input) => input.crop_code === "cotton" && input.days_after_sowing > 120',
    cause: 'COTTON_BOLL_OPENING_STAGE',
    priority: 92,
    scientific_source: 'ICAR-CICR Cotton Phenology',
    scientific_basis: 'Cotton boll opening: Lint exposure. Prepare for picking.',
    trigger_keywords: ['boll opening', 'बोंड उघडणे', 'गोंद खुलना', 'open boll'],
    response_mr: '🪺 कापूस बोंड उघडणे अवस्था. वेचणी तयारी करा. पाऊस टाळा.',
    response_hi: '🪺 कपास गोंद खुलने की अवस्था। चुनाई तैयारी करें। बारिश से बचाएं।',
    response_en: '🪺 Cotton boll opening. Prepare for picking. Avoid rain damage.',
    action_type: 'RECOMMEND'
  }
];

// Export count for metadata
export const GROWTH_STAGE_RULE_COUNT = GROWTH_STAGE_RULES.length;
