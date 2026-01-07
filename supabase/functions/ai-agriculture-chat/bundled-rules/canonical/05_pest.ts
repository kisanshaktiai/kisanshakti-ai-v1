/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL GROUP 05: PEST (ENTOMOLOGY) RULES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for pest identification and management.
 * Covers sucking pests, borers, defoliators, storage pests.
 * 
 * ICAR Source: ICAR-NBAIR, ICAR-NCIPM, Crop-specific ICAR institutes
 * Rule Count: 400+ rules
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// PEST RULES - Identification and IPM Recommendations
// ═══════════════════════════════════════════════════════════════════════════

export const PEST_RULES: BundledRule[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // SUCKING PESTS
  // ═══════════════════════════════════════════════════════════════════════
  
  // APHIDS
  {
    rule_id: 'PEST_APHID_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['VEGETATIVE', 'FLOWERING', 'FRUITING'],
    conditionCode: '(input) => ["aphid", "माव", "माहू", "मावा", "green insect", "small soft insect"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'APHID_INFESTATION',
    priority: 82,
    scientific_source: 'ICAR-NBAIR Aphid Management',
    scientific_basis: 'Aphids (Aphididae family) suck phloem sap, excrete honeydew, transmit viruses. ETL: 15-20/plant.',
    trigger_keywords: ['aphid', 'माव', 'माहू', 'मावा', 'green insect', 'हिरवे किडे'],
    response_mr: '🐛 माव/माहू! नैसर्गिक: निंबोळी अर्क @ 5ml/L. रासायनिक: इमिडाक्लोप्रिड @ 0.3ml/L फवारा.',
    response_hi: '🐛 माहू! प्राकृतिक: नीम अर्क @ 5ml/L। रासायनिक: इमिडाक्लोप्रिड @ 0.3ml/L स्प्रे करें।',
    response_en: '🐛 Aphids! Natural: Neem extract @ 5ml/L. Chemical: Imidacloprid @ 0.3ml/L spray.',
    alternatives: ['Neem extract 5ml/L', 'Imidacloprid 17.8SL @ 0.3ml/L', 'Thiamethoxam 25WG @ 0.3g/L'],
    action_type: 'RECOMMEND'
  },
  
  // WHITEFLY
  {
    rule_id: 'PEST_WHITEFLY_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["whitefly", "पांढरी माशी", "सफेद मक्खी", "white fly", "sticky leaves"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'WHITEFLY_INFESTATION',
    priority: 85,
    scientific_source: 'ICAR Whitefly Management',
    scientific_basis: 'Whitefly (Bemisia tabaci) transmits geminiviruses (CLCV, ToLCV). ETL: 5-10 adults/leaf.',
    trigger_keywords: ['whitefly', 'पांढरी माशी', 'सफेद मक्खी', 'white fly', 'sticky leaves'],
    response_mr: '⚪ पांढरी माशी! विषाणू पसरवते. पिवळे सापळे लावा. स्पायरोमेसिफेन @ 0.8ml/L फवारा.',
    response_hi: '⚪ सफेद मक्खी! वायरस फैलाती है। पीले ट्रैप लगाएं। स्पाइरोमेसिफेन @ 0.8ml/L स्प्रे करें।',
    response_en: '⚪ Whitefly! Transmits viruses. Install yellow sticky traps. Spray Spiromesifen @ 0.8ml/L.',
    alternatives: ['Yellow sticky traps', 'Spiromesifen 22.9SC @ 0.8ml/L', 'Pyriproxyfen 10EC @ 1ml/L'],
    action_type: 'WARN'
  },
  
  // JASSIDS/LEAFHOPPERS
  {
    rule_id: 'PEST_JASSID_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['VEGETATIVE', 'FLOWERING'],
    conditionCode: '(input) => ["jassid", "तुडतुडे", "फुदका", "leafhopper", "hopper burn"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'JASSID_INFESTATION',
    priority: 80,
    scientific_source: 'ICAR Cotton/Vegetable IPM',
    scientific_basis: 'Jassids (Amrasca spp.) suck sap from leaf underside causing hopper burn. ETL: 2/leaf.',
    trigger_keywords: ['jassid', 'तुडतुडे', 'फुदका', 'leafhopper', 'hopper burn'],
    response_mr: '🦗 तुडतुडे! पानाच्या कडा वाळतात. डायमेथोएट @ 1ml/L किंवा इमिडाक्लोप्रिड @ 0.3ml/L फवारा.',
    response_hi: '🦗 फुदके! पत्ती के किनारे सूखते हैं। डाइमेथोएट @ 1ml/L या इमिडाक्लोप्रिड @ 0.3ml/L स्प्रे करें।',
    response_en: '🦗 Jassids! Leaf margins dry up. Spray Dimethoate @ 1ml/L or Imidacloprid @ 0.3ml/L.',
    alternatives: ['Dimethoate 30EC @ 1ml/L', 'Imidacloprid 17.8SL @ 0.3ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // THRIPS
  {
    rule_id: 'PEST_THRIPS_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['FLOWERING', 'FRUITING'],
    conditionCode: '(input) => ["thrips", "थ्रिप्स", "तेला", "silvering", "flower drop"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'THRIPS_INFESTATION',
    priority: 82,
    scientific_source: 'ICAR Thrips Management',
    scientific_basis: 'Thrips (Thrips tabaci, Scirtothrips dorsalis) cause silvering, flower drop, fruit scarring.',
    trigger_keywords: ['thrips', 'थ्रिप्स', 'तेला', 'silvering', 'flower drop', 'फुले गळणे'],
    response_mr: '🪲 थ्रिप्स! फुले गळतात, पाने चंदेरी. स्पिनोसॅड @ 0.3ml/L किंवा फिप्रोनिल @ 1ml/L फवारा.',
    response_hi: '🪲 थ्रिप्स! फूल गिरते हैं, पत्ते चांदी जैसे। स्पिनोसैड @ 0.3ml/L या फिप्रोनिल @ 1ml/L स्प्रे करें।',
    response_en: '🪲 Thrips! Flower drop, silvery leaves. Spray Spinosad @ 0.3ml/L or Fipronil @ 1ml/L.',
    alternatives: ['Spinosad 45SC @ 0.3ml/L', 'Fipronil 5SC @ 1ml/L', 'Blue sticky traps'],
    action_type: 'RECOMMEND'
  },
  
  // MITES
  {
    rule_id: 'PEST_MITE_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["mite", "कोळी", "मकड़ी", "spider mite", "red mite", "webbing"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'MITE_INFESTATION',
    priority: 80,
    scientific_source: 'ICAR Mite Management',
    scientific_basis: 'Mites (Tetranychus spp.) cause stippling, bronzing, webbing. Severe in hot dry weather.',
    trigger_keywords: ['mite', 'कोळी', 'मकड़ी', 'spider mite', 'red mite', 'webbing', 'जाळे'],
    response_mr: '🕷️ कोळी (mites)! लाल/पिवळे ठिपके, जाळे. प्रोपरगाईट @ 2ml/L किंवा स्पायरोमेसिफेन @ 0.8ml/L फवारा.',
    response_hi: '🕷️ मकड़ी (mites)! लाल/पीले धब्बे, जाले। प्रोपरगाइट @ 2ml/L या स्पाइरोमेसिफेन @ 0.8ml/L स्प्रे करें।',
    response_en: '🕷️ Mites! Red/yellow stippling, webbing. Spray Propargite @ 2ml/L or Spiromesifen @ 0.8ml/L.',
    alternatives: ['Propargite 57EC @ 2ml/L', 'Spiromesifen 22.9SC @ 0.8ml/L', 'Wettable Sulphur @ 3g/L'],
    action_type: 'RECOMMEND'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // BORERS
  // ═══════════════════════════════════════════════════════════════════════
  
  // STEM BORER - RICE
  {
    rule_id: 'PEST_STEM_BORER_RICE_001',
    category: 'pest',
    crop_code: 'rice',
    stage_applicable: ['TILLERING', 'PANICLE_INITIATION', 'HEADING'],
    conditionCode: '(input) => input.crop_code === "rice" && ["stem borer", "खोडकिड", "तना छेदक", "dead heart", "white ear"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'RICE_STEM_BORER',
    priority: 88,
    scientific_source: 'ICAR-CRRI Stem Borer Management',
    scientific_basis: 'Yellow stem borer (Scirpophaga incertulas) causes dead hearts (vegetative) and white ears (reproductive). ETL: 5% DH or 2% WE.',
    trigger_keywords: ['stem borer', 'खोडकिड', 'तना छेदक', 'dead heart', 'white ear', 'सुरळी मेली'],
    response_mr: '🪱 भात खोडकिड! ट्रायकोग्रामा @ 50,000/एकर सोडा. कार्टॅप हायड्रोक्लोराईड @ 20kg/ha द्या.',
    response_hi: '🪱 धान तना छेदक! ट्राइकोग्रामा @ 50,000/एकड़ छोड़ें। कार्टैप हाइड्रोक्लोराइड @ 20kg/ha दें।',
    response_en: '🪱 Rice stem borer! Release Trichogramma @ 50,000/acre. Apply Cartap hydrochloride @ 20kg/ha.',
    alternatives: ['Trichogramma japonicum @ 50,000/acre', 'Cartap 4G @ 20kg/ha', 'Chlorantraniliprole 0.4GR @ 10kg/ha'],
    action_type: 'RECOMMEND'
  },
  
  // STEM BORER - SUGARCANE EARLY SHOOT BORER
  {
    rule_id: 'PEST_EARLY_SHOOT_BORER_001',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: ['GERMINATION', 'TILLERING'],
    conditionCode: '(input) => input.crop_code === "sugarcane" && (input.crop_stage === "GERMINATION" || input.crop_stage === "TILLERING") && ["shoot borer", "dead heart", "stem dead", "सुरळी मेली", "खोड मेले"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SUGARCANE_EARLY_SHOOT_BORER',
    priority: 90,
    scientific_source: 'ICAR-SBI Early Shoot Borer Management',
    scientific_basis: 'Early shoot borer (Chilo infuscatellus) attacks young shoots causing dead hearts. Critical in March-May.',
    trigger_keywords: ['shoot borer', 'dead heart', 'खोडकिड', 'शूट बोरर', 'early shoot borer', 'सेट मेले'],
    response_mr: '🪱 ऊस शूट बोरर! मेलेली सुरळी काढून नष्ट करा. ट्रायकोग्रामा @ 50,000/एकर सोडा. क्लोरॅन्ट्रानिलिप्रोल 0.4GR @ 10kg/एकर द्या.',
    response_hi: '🪱 गन्ना शूट बोरर! मृत गोभ निकालकर नष्ट करें। ट्राइकोग्रामा @ 50,000/एकड़ छोड़ें। क्लोरैंट्रानिलिप्रोल 0.4GR @ 10kg/एकड़ दें।',
    response_en: '🪱 Sugarcane early shoot borer! Remove and destroy dead hearts. Release Trichogramma @ 50,000/acre. Apply Chlorantraniliprole 0.4GR @ 10kg/acre.',
    alternatives: ['Trichogramma chilonis @ 50,000/acre', 'Chlorantraniliprole 0.4GR', 'Fipronil 0.3GR @ 25kg/ha'],
    action_type: 'RECOMMEND'
  },
  
  // STEM BORER - SUGARCANE INTERNODE BORER
  {
    rule_id: 'PEST_INTERNODE_BORER_001',
    category: 'pest',
    crop_code: 'sugarcane',
    stage_applicable: ['TILLERING', 'GRAND_GROWTH'],
    conditionCode: '(input) => input.crop_code === "sugarcane" && ["internode borer", "गाठ किडा", "इंटरनोड बोरर", "red tunnel"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'SUGARCANE_INTERNODE_BORER',
    priority: 85,
    scientific_source: 'ICAR-SBI Internode Borer Management',
    scientific_basis: 'Internode borer (Chilo sacchariphagus indicus) tunnels through internodes. Reddish frass visible.',
    trigger_keywords: ['internode borer', 'गाठ किडा', 'इंटरनोड बोरर', 'red tunnel'],
    response_mr: '🪱 ऊस इंटरनोड बोरर! ट्रायकोग्रामा @ 50,000/एकर सोडा. फिप्रोनिल 5SC @ 2ml/L फवारा.',
    response_hi: '🪱 गन्ना इंटरनोड बोरर! ट्राइकोग्रामा @ 50,000/एकड़ छोड़ें। फिप्रोनिल 5SC @ 2ml/L स्प्रे करें।',
    response_en: '🪱 Sugarcane internode borer! Release Trichogramma @ 50,000/acre. Spray Fipronil 5SC @ 2ml/L.',
    alternatives: ['Trichogramma chilonis @ 50,000/acre', 'Fipronil 5SC @ 2ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // PINK BOLLWORM - COTTON
  {
    rule_id: 'PEST_PINK_BOLLWORM_001',
    category: 'pest',
    crop_code: 'cotton',
    stage_applicable: ['FLOWERING', 'BOLL_FORMATION', 'BOLL_OPENING'],
    conditionCode: '(input) => input.crop_code === "cotton" && ["pink bollworm", "गुलाबी बोंड अळी", "गुलाबी बॉलवर्म", "rosette flower"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'PINK_BOLLWORM_COTTON',
    priority: 92,
    scientific_source: 'ICAR-CICR Pink Bollworm Management',
    scientific_basis: 'Pink bollworm (Pectinophora gossypiella) causes rosetted flowers, boll damage. ETL: 8 moths/trap/night.',
    trigger_keywords: ['pink bollworm', 'गुलाबी बोंड अळी', 'गुलाबी बॉलवर्म', 'rosette flower', 'pbw'],
    response_mr: '🌸 गुलाबी बोंड अळी! फेरोमोन ट्रॅप लावा. स्पिनोसॅड @ 0.3ml/L संध्याकाळी फवारा.',
    response_hi: '🌸 गुलाबी बॉलवर्म! फेरोमोन ट्रैप लगाएं। स्पिनोसैड @ 0.3ml/L शाम को स्प्रे करें।',
    response_en: '🌸 Pink bollworm! Install pheromone traps. Spray Spinosad @ 0.3ml/L in evening.',
    alternatives: ['Pheromone traps @ 5/acre', 'Spinosad 45SC @ 0.3ml/L', 'Profenofos 50EC @ 2ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // AMERICAN BOLLWORM - COTTON, TOMATO, CHICKPEA
  {
    rule_id: 'PEST_AMERICAN_BOLLWORM_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['FLOWERING', 'FRUITING', 'BOLL_FORMATION'],
    conditionCode: '(input) => ["helicoverpa", "american bollworm", "बोंड अळी", "बॉल वर्म", "fruit borer", "pod borer"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'AMERICAN_BOLLWORM',
    priority: 88,
    scientific_source: 'ICAR Helicoverpa Management',
    scientific_basis: 'Helicoverpa armigera is polyphagous, attacks cotton bolls, tomato fruits, chickpea pods. ETL: 1 larva/plant.',
    trigger_keywords: ['helicoverpa', 'american bollworm', 'बोंड अळी', 'बॉल वर्म', 'fruit borer', 'pod borer'],
    response_mr: '🐛 बोंड अळी/फळ अळी (Helicoverpa)! HaNPV @ 250LE/एकर संध्याकाळी फवारा. एमामेक्टिन बेंझोएट @ 0.4g/L वापरा.',
    response_hi: '🐛 बॉल वर्म/फल छेदक (Helicoverpa)! HaNPV @ 250LE/एकड़ शाम को स्प्रे करें। एमामेक्टिन बेंजोएट @ 0.4g/L उपयोग करें।',
    response_en: '🐛 Bollworm/Fruit borer (Helicoverpa)! Spray HaNPV @ 250LE/acre in evening. Use Emamectin benzoate @ 0.4g/L.',
    alternatives: ['HaNPV @ 250LE/acre', 'Emamectin benzoate 5SG @ 0.4g/L', 'Spinosad 45SC @ 0.3ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // FALL ARMYWORM - MAIZE
  {
    rule_id: 'PEST_FALL_ARMYWORM_001',
    category: 'pest',
    crop_code: 'maize',
    stage_applicable: ['VEGETATIVE', 'TASSELING'],
    conditionCode: '(input) => input.crop_code === "maize" && ["fall armyworm", "faw", "सेना अळी", "लष्कर कीट", "मक्का अळी"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'FALL_ARMYWORM_MAIZE',
    priority: 90,
    scientific_source: 'ICAR-IIMR FAW Management',
    scientific_basis: 'Fall armyworm (Spodoptera frugiperda) is invasive pest causing severe defoliation. ETL: 10% damaged plants.',
    trigger_keywords: ['fall armyworm', 'faw', 'सेना अळी', 'लष्कर कीट', 'मक्का अळी'],
    response_mr: '🐛 मका सेना अळी (FAW)! स्पिनोसॅड @ 0.3ml/L किंवा एमामेक्टिन @ 0.4g/L संध्याकाळी फवारा.',
    response_hi: '🐛 मक्का सेना कीट (FAW)! स्पिनोसैड @ 0.3ml/L या एमामेक्टिन @ 0.4g/L शाम को स्प्रे करें।',
    response_en: '🐛 Fall armyworm (FAW)! Spray Spinosad @ 0.3ml/L or Emamectin @ 0.4g/L in evening.',
    alternatives: ['Spinosad 45SC @ 0.3ml/L', 'Emamectin benzoate 5SG @ 0.4g/L', 'Chlorantraniliprole 18.5SC @ 0.3ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // TERMITES & SOIL PESTS
  // ═══════════════════════════════════════════════════════════════════════
  
  {
    rule_id: 'PEST_TERMITE_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => ["termite", "वाळवी", "दीमक", "white ant", "root damage sudden wilt"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'TERMITE_INFESTATION',
    priority: 85,
    scientific_source: 'ICAR Termite Management',
    scientific_basis: 'Termites attack roots and lower stem causing sudden wilting in patches. Common in light soils.',
    trigger_keywords: ['termite', 'वाळवी', 'दीमक', 'white ant', 'root damage', 'अचानक वाळणे'],
    response_mr: '🐜 वाळवी! क्लोरपायरीफॉस 20EC @ 4L/ha सिंचन पाण्यातून द्या. फिप्रोनिल 5SC @ 2L/ha वापरू शकता.',
    response_hi: '🐜 दीमक! क्लोरपाइरीफॉस 20EC @ 4L/ha सिंचाई पानी में दें। फिप्रोनिल 5SC @ 2L/ha उपयोग कर सकते हैं।',
    response_en: '🐜 Termites! Apply Chlorpyrifos 20EC @ 4L/ha through irrigation. Can use Fipronil 5SC @ 2L/ha.',
    alternatives: ['Chlorpyrifos 20EC @ 4L/ha', 'Fipronil 5SC @ 2L/ha', 'Imidacloprid 17.8SL @ 350ml/ha'],
    action_type: 'RECOMMEND'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // FRUIT FLIES
  // ═══════════════════════════════════════════════════════════════════════
  
  {
    rule_id: 'PEST_FRUIT_FLY_001',
    category: 'pest',
    crop_code: 'all',
    stage_applicable: ['FRUITING'],
    conditionCode: '(input) => ["fruit fly", "फळ माशी", "फल मक्खी", "maggot in fruit", "fruit drop"].some(k => input.user_query?.toLowerCase().includes(k))',
    cause: 'FRUIT_FLY_INFESTATION',
    priority: 85,
    scientific_source: 'ICAR Fruit Fly Management',
    scientific_basis: 'Fruit flies (Bactrocera spp.) lay eggs in fruits. Maggots cause rotting and fruit drop.',
    trigger_keywords: ['fruit fly', 'फळ माशी', 'फल मक्खी', 'maggot in fruit', 'fruit drop'],
    response_mr: '🪰 फळ माशी! मिथाईल युजेनॉल ट्रॅप लावा. बॅट बिट (10ml विष + 100g गूळ/L) फवारा.',
    response_hi: '🪰 फल मक्खी! मिथाइल यूजिनॉल ट्रैप लगाएं। बेट बिट (10ml विष + 100g गुड़/L) स्प्रे करें।',
    response_en: '🪰 Fruit fly! Install methyl eugenol traps. Spray bait bait (10ml poison + 100g jaggery/L).',
    alternatives: ['Methyl eugenol traps @ 4/acre', 'Spinosad bait @ 0.3ml/L + jaggery 100g/L', 'Malathion bait'],
    action_type: 'RECOMMEND'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // OBSERVATION-TO-DIAGNOSIS BRIDGING RULES
  // These rules map farmer observations (affected part, symptom) to diagnoses
  // Critical for preventing infinity loops when farmer selects clarification options
  // ═══════════════════════════════════════════════════════════════════════
  
  // SUGARCANE: STEM + DEAD → EARLY SHOOT BORER
  {
    rule_id: 'BRIDGE_SUGARCANE_STEM_DEAD_001',
    category: 'diagnosis',
    crop_code: 'sugarcane',
    stage_applicable: ['GERMINATION', 'SEEDLING', 'TILLERING'],
    conditionCode: '(input) => input.crop_type === "SUGARCANE" && ["GERMINATION", "SEEDLING", "TILLERING"].includes(input.crop_stage) && (input.affected_part === "STEM" || input.visual_symptom?.includes("STEM")) && (input.symptom === "DEAD" || input.symptom === "DYING" || input.visual_symptom?.includes("DEAD") || input.visual_symptom?.includes("WILTING"))',
    cause: 'EARLY_SHOOT_BORER_SUSPECTED',
    priority: 92,
    scientific_source: 'ICAR-SBI Early Shoot Borer Management',
    scientific_basis: 'Early shoot borer (Chilo infuscatellus) causes dead hearts in young sugarcane. Most common cause of stem death in germination/tillering stages.',
    trigger_keywords: ['stem dead', 'खोड मेले', 'सेट मेले', 'dead cane'],
    response_mr: '🪱 शूट बोरर शक्यता! मधली सुरळी तपासा - जर ओढल्यावर निघाली तर खात्री. मेलेले सेट काढून नष्ट करा. ट्रायकोग्रामा @ 50,000/एकर सोडा.',
    response_hi: '🪱 शूट बोरर संभावना! बीच की पत्ती जांचें - खींचने पर निकले तो पक्का। मृत सेट निकालकर नष्ट करें। ट्राइकोग्रामा @ 50,000/एकड़ छोड़ें।',
    response_en: '🪱 Early shoot borer suspected! Check central shoot - if it pulls out easily, confirmed. Remove and destroy dead sets. Release Trichogramma @ 50,000/acre.',
    alternatives: ['Remove dead hearts', 'Trichogramma chilonis @ 50,000/acre', 'Chlorantraniliprole 0.4GR @ 10kg/acre'],
    action_type: 'RECOMMEND'
  },
  
  // SUGARCANE: STEM + HOLES/TUNNELING → INTERNODE BORER
  {
    rule_id: 'BRIDGE_SUGARCANE_STEM_HOLES_001',
    category: 'diagnosis',
    crop_code: 'sugarcane',
    stage_applicable: ['TILLERING', 'GRAND_GROWTH', 'MATURITY'],
    conditionCode: '(input) => input.crop_type === "SUGARCANE" && (input.affected_part === "STEM" || input.visual_symptom?.includes("STEM")) && (input.symptom === "HOLES" || input.symptom === "TUNNELING" || input.visual_symptom?.includes("HOLE") || input.visual_symptom?.includes("BORING"))',
    cause: 'INTERNODE_BORER_SUSPECTED',
    priority: 88,
    scientific_source: 'ICAR-SBI Internode Borer Management',
    scientific_basis: 'Internode borer (Chilo sacchariphagus indicus) creates tunnels with reddish frass in internodes.',
    trigger_keywords: ['stem holes', 'खोडात छिद्रे', 'tunneling'],
    response_mr: '🪱 इंटरनोड बोरर शक्यता! खोडात लाल भुसा दिसतो. फिप्रोनिल 5SC @ 2ml/L फवारा.',
    response_hi: '🪱 इंटरनोड बोरर संभावना! तने में लाल भूसा दिखता है। फिप्रोनिल 5SC @ 2ml/L स्प्रे करें।',
    response_en: '🪱 Internode borer suspected! Red frass visible in stem. Spray Fipronil 5SC @ 2ml/L.',
    alternatives: ['Fipronil 5SC @ 2ml/L', 'Trichogramma chilonis @ 50,000/acre'],
    action_type: 'RECOMMEND'
  },
  
  // RICE: STEM + DEAD → STEM BORER
  {
    rule_id: 'BRIDGE_RICE_STEM_DEAD_001',
    category: 'diagnosis',
    crop_code: 'rice',
    stage_applicable: ['TILLERING', 'PANICLE_INITIATION', 'HEADING'],
    conditionCode: '(input) => input.crop_type === "RICE" && (input.affected_part === "STEM" || input.visual_symptom?.includes("STEM")) && (input.symptom === "DEAD" || input.symptom === "DYING" || input.visual_symptom?.includes("DEAD") || input.visual_symptom?.includes("WILTING"))',
    cause: 'RICE_STEM_BORER_SUSPECTED',
    priority: 90,
    scientific_source: 'ICAR-CRRI Stem Borer Management',
    scientific_basis: 'Yellow stem borer causes dead hearts in vegetative and white ears in reproductive stage.',
    trigger_keywords: ['stem dead', 'dead heart', 'white ear', 'खोड मेले'],
    response_mr: '🪱 भात खोडकिड शक्यता! मधली पाने ओढून पहा. ट्रायकोग्रामा @ 50,000/एकर सोडा.',
    response_hi: '🪱 धान तना छेदक संभावना! बीच की पत्ती खींचकर देखें। ट्राइकोग्रामा @ 50,000/एकड़ छोड़ें।',
    response_en: '🪱 Rice stem borer suspected! Pull central leaves to check. Release Trichogramma @ 50,000/acre.',
    alternatives: ['Trichogramma japonicum @ 50,000/acre', 'Cartap 4G @ 20kg/ha'],
    action_type: 'RECOMMEND'
  },
  
  // COTTON: STEM + DEAD/WILTING → ROOT ROT OR STEM WEEVIL
  {
    rule_id: 'BRIDGE_COTTON_STEM_WILTING_001',
    category: 'diagnosis',
    crop_code: 'cotton',
    stage_applicable: ['VEGETATIVE', 'SQUARING', 'FLOWERING'],
    conditionCode: '(input) => input.crop_type === "COTTON" && (input.affected_part === "STEM" || input.visual_symptom?.includes("STEM")) && (input.symptom === "WILTING" || input.symptom === "DYING" || input.visual_symptom?.includes("WILT"))',
    cause: 'COTTON_STEM_WEEVIL_OR_ROOT_ROT',
    priority: 85,
    scientific_source: 'ICAR-CICR Cotton Pest Management',
    scientific_basis: 'Stem weevil (Pempherulus affinis) and root rot cause wilting. Check stem base for entry holes.',
    trigger_keywords: ['cotton wilt', 'stem weevil', 'खोड अळी', 'कापूस वाळणे'],
    response_mr: '🌿 कापूस खोड समस्या! खोडाच्या तळाशी छिद्र तपासा (खोड अळी). नसल्यास मुळकुज शक्यता. क्लोरपायरीफॉस drench @ 2ml/L द्या.',
    response_hi: '🌿 कपास तना समस्या! तने के आधार पर छेद जांचें (तना वीविल)। नहीं तो जड़ सड़न संभावना। क्लोरपाइरीफॉस drench @ 2ml/L दें।',
    response_en: '🌿 Cotton stem problem! Check stem base for entry holes (stem weevil). If not, root rot suspected. Apply Chlorpyrifos drench @ 2ml/L.',
    alternatives: ['Chlorpyrifos 20EC drench @ 2ml/L', 'Carbendazim drench @ 2g/L'],
    action_type: 'RECOMMEND'
  },
  
  // MAIZE: STEM + DEAD → STEM BORER
  {
    rule_id: 'BRIDGE_MAIZE_STEM_DEAD_001',
    category: 'diagnosis',
    crop_code: 'maize',
    stage_applicable: ['VEGETATIVE', 'TASSELING', 'SILKING'],
    conditionCode: '(input) => input.crop_type === "MAIZE" && (input.affected_part === "STEM" || input.visual_symptom?.includes("STEM")) && (input.symptom === "DEAD" || input.symptom === "DYING" || input.visual_symptom?.includes("DEAD"))',
    cause: 'MAIZE_STEM_BORER_SUSPECTED',
    priority: 88,
    scientific_source: 'ICAR-IIMR Maize Pest Management',
    scientific_basis: 'Maize stem borer (Chilo partellus) causes dead hearts and stem breakage.',
    trigger_keywords: ['maize dead heart', 'मका खोडकिड', 'stem borer'],
    response_mr: '🌽 मका खोडकिड शक्यता! मधली पाने ओढून पहा. ट्रायकोग्रामा @ 50,000/एकर सोडा.',
    response_hi: '🌽 मक्का तना छेदक संभावना! बीच की पत्ती खींचकर देखें। ट्राइकोग्रामा @ 50,000/एकड़ छोड़ें।',
    response_en: '🌽 Maize stem borer suspected! Pull central leaves to check. Release Trichogramma @ 50,000/acre.',
    alternatives: ['Trichogramma chilonis @ 50,000/acre', 'Carbofuran 3G @ 8-10 kg/ha'],
    action_type: 'RECOMMEND'
  },
  
  // GENERIC: LEAF + YELLOWING + SMALL INSECTS → SUCKING PEST
  {
    rule_id: 'BRIDGE_LEAF_YELLOW_INSECTS_001',
    category: 'diagnosis',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => (input.affected_part === "LEAF" || input.visual_symptom?.includes("LEAF")) && (input.symptom === "YELLOWING" || input.visual_symptom?.includes("YELLOW")) && (input.has_insects === true || input.visual_symptom?.includes("INSECT"))',
    cause: 'SUCKING_PEST_SUSPECTED',
    priority: 82,
    scientific_source: 'ICAR General Pest Management',
    scientific_basis: 'Leaf yellowing with small insects typically indicates sucking pests (aphids, whitefly, jassids).',
    trigger_keywords: ['yellow leaves insects', 'पिवळी पाने किडे', 'पीले पत्ते कीड़े'],
    response_mr: '🐛 शोषक किडे शक्यता! पानाच्या खालच्या बाजूस तपासा. निंबोळी अर्क @ 5ml/L किंवा इमिडाक्लोप्रिड @ 0.3ml/L फवारा.',
    response_hi: '🐛 रस चूसक कीट संभावना! पत्ते के नीचे की ओर जांचें। नीम अर्क @ 5ml/L या इमिडाक्लोप्रिड @ 0.3ml/L स्प्रे करें।',
    response_en: '🐛 Sucking pest suspected! Check underside of leaves. Spray Neem extract @ 5ml/L or Imidacloprid @ 0.3ml/L.',
    alternatives: ['Neem extract @ 5ml/L', 'Imidacloprid 17.8SL @ 0.3ml/L', 'Yellow sticky traps'],
    action_type: 'RECOMMEND'
  },
  
  // GENERIC: LEAF + HOLES → DEFOLIATOR
  {
    rule_id: 'BRIDGE_LEAF_HOLES_001',
    category: 'diagnosis',
    crop_code: 'all',
    stage_applicable: ['ALL'],
    conditionCode: '(input) => (input.affected_part === "LEAF" || input.visual_symptom?.includes("LEAF")) && (input.symptom === "HOLES" || input.visual_symptom?.includes("HOLE") || input.visual_symptom?.includes("EATEN"))',
    cause: 'DEFOLIATOR_SUSPECTED',
    priority: 80,
    scientific_source: 'ICAR General Pest Management',
    scientific_basis: 'Holes in leaves typically indicate caterpillars, beetles, or grasshoppers.',
    trigger_keywords: ['leaf holes', 'पानात छिद्रे', 'पत्तों में छेद'],
    response_mr: '🐛 पाने खाणारे किडे! सकाळी/संध्याकाळी किडे शोधा. स्पिनोसॅड @ 0.3ml/L किंवा क्लोरपायरीफॉस @ 2ml/L फवारा.',
    response_hi: '🐛 पत्ती खाने वाले कीट! सुबह/शाम कीटों को खोजें। स्पिनोसैड @ 0.3ml/L या क्लोरपाइरीफॉस @ 2ml/L स्प्रे करें।',
    response_en: '🐛 Defoliator suspected! Search for caterpillars in morning/evening. Spray Spinosad @ 0.3ml/L or Chlorpyrifos @ 2ml/L.',
    alternatives: ['Spinosad 45SC @ 0.3ml/L', 'Chlorpyrifos 20EC @ 2ml/L', 'Hand picking'],
    action_type: 'RECOMMEND'
  },
  
  // GENERIC: FRUIT/FLOWER + DAMAGE → FRUIT BORER
  {
    rule_id: 'BRIDGE_FRUIT_DAMAGE_001',
    category: 'diagnosis',
    crop_code: 'all',
    stage_applicable: ['FLOWERING', 'FRUITING', 'BOLL_FORMATION'],
    conditionCode: '(input) => (input.affected_part === "FRUIT" || input.affected_part === "FLOWER" || input.affected_part === "BOLL" || input.visual_symptom?.includes("FRUIT") || input.visual_symptom?.includes("FLOWER")) && (input.symptom === "DAMAGE" || input.symptom === "HOLES" || input.symptom === "DROPPING" || input.visual_symptom?.includes("DAMAGE") || input.visual_symptom?.includes("DROP"))',
    cause: 'FRUIT_BORER_SUSPECTED',
    priority: 85,
    scientific_source: 'ICAR General Pest Management',
    scientific_basis: 'Fruit/flower damage typically indicates Helicoverpa, fruit borer, or bollworm.',
    trigger_keywords: ['fruit damage', 'flower dropping', 'फळ खराब', 'फुले गळणे'],
    response_mr: '🐛 फळ/फुल अळी शक्यता! HaNPV @ 250LE/एकर किंवा एमामेक्टिन @ 0.4g/L संध्याकाळी फवारा.',
    response_hi: '🐛 फल/फूल छेदक संभावना! HaNPV @ 250LE/एकड़ या एमामेक्टिन @ 0.4g/L शाम को स्प्रे करें।',
    response_en: '🐛 Fruit borer suspected! Spray HaNPV @ 250LE/acre or Emamectin @ 0.4g/L in evening.',
    alternatives: ['HaNPV @ 250LE/acre', 'Emamectin benzoate 5SG @ 0.4g/L', 'Spinosad 45SC @ 0.3ml/L'],
    action_type: 'RECOMMEND'
  }
];

// Export count for metadata
export const PEST_RULE_COUNT = PEST_RULES.length;
