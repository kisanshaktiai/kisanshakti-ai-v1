/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED ENTITY NORMALIZER - Single source of truth for entity codes
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides a SINGLE, CENTRALIZED normalization function for all
 * agricultural entities (pests, diseases, crops). It ensures consistent codes
 * throughout the entire pipeline:
 * - NLU extraction
 * - IPM rule matching
 * - Disease rule matching
 * - Database storage
 * - Response generation
 * 
 * CANONICAL FORMAT: UPPERCASE_WITH_UNDERSCORES (e.g., SHOOT_BORER)
 */

// ═══════════════════════════════════════════════════════════════════════════
// MASTER PEST LOOKUP TABLE
// ═══════════════════════════════════════════════════════════════════════════

const PEST_MASTER_TABLE: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SUGARCANE-SPECIFIC PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // === SUGARCANE_SHOOT_BORER (Chilo infuscatellus) ===
  'shoot_borer': 'SUGARCANE_SHOOT_BORER',
  'shootborer': 'SUGARCANE_SHOOT_BORER',
  'shoot borer': 'SUGARCANE_SHOOT_BORER',
  'shoot-borer': 'SUGARCANE_SHOOT_BORER',
  'shootBorer': 'SUGARCANE_SHOOT_BORER',
  'ShootBorer': 'SUGARCANE_SHOOT_BORER',
  'SHOOTBORER': 'SUGARCANE_SHOOT_BORER',
  'SHOOT-BORER': 'SUGARCANE_SHOOT_BORER',
  'SHOOT BORER': 'SUGARCANE_SHOOT_BORER',
  'early shoot borer': 'SUGARCANE_SHOOT_BORER',
  'sugarcane borer': 'SUGARCANE_SHOOT_BORER',
  'sugarcane shoot borer': 'SUGARCANE_SHOOT_BORER',
  'cane borer': 'SUGARCANE_SHOOT_BORER',
  'dead heart': 'SUGARCANE_SHOOT_BORER',
  'deadheart': 'SUGARCANE_SHOOT_BORER',
  'dead_heart': 'SUGARCANE_SHOOT_BORER',
  'DEAD_HEART': 'SUGARCANE_SHOOT_BORER',
  'central shoot dead': 'SUGARCANE_SHOOT_BORER',
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Missing variations causing rule matching failures
  // ═══════════════════════════════════════════════════════════════════════════
  'sugarcaneshootborer': 'SUGARCANE_SHOOT_BORER',
  'SUGARCANESHOOTBORER': 'SUGARCANE_SHOOT_BORER',
  'sugarcane_shoot_borer': 'SUGARCANE_SHOOT_BORER',
  'SUGARCANE_SHOOT_BORER': 'SUGARCANE_SHOOT_BORER',
  'SUGARCANE-SHOOT-BORER': 'SUGARCANE_SHOOT_BORER',
  'shootborersugarcane': 'SUGARCANE_SHOOT_BORER',
  'shoot_borer_sugarcane': 'SUGARCANE_SHOOT_BORER',
  // Symptom-based entries (CRITICAL for dead heart recognition)
  'dead_heart_sugarcane': 'SUGARCANE_SHOOT_BORER',
  'deadheartsugarcane': 'SUGARCANE_SHOOT_BORER',
  'sugarcane_dead_heart': 'SUGARCANE_SHOOT_BORER',
  'DEAD_HEART_SUGARCANE': 'SUGARCANE_SHOOT_BORER',
  'SUGARCANE_DEAD_HEART': 'SUGARCANE_SHOOT_BORER',
  // Marathi transliterated variations
  'मधली_सुरळी_वाळली': 'SUGARCANE_SHOOT_BORER',
  'madhli_surli': 'SUGARCANE_SHOOT_BORER',
  'madhli_surli_wali': 'SUGARCANE_SHOOT_BORER',
  'MADHLI_SURLI': 'SUGARCANE_SHOOT_BORER',
  // Combined crop-pest codes
  'SUGARCANE+SHOOT_BORER': 'SUGARCANE_SHOOT_BORER',
  'sugarcane+shootborer': 'SUGARCANE_SHOOT_BORER',
  // Marathi - SUGARCANE_SHOOT_BORER
  'शूट बोरर': 'SUGARCANE_SHOOT_BORER',
  'शूटबोरर': 'SUGARCANE_SHOOT_BORER',
  'मधली सुरळी': 'SUGARCANE_SHOOT_BORER',
  'मधली सुरळी सुकली': 'SUGARCANE_SHOOT_BORER',
  'सुखी सुरळी': 'SUGARCANE_SHOOT_BORER',
  'सुकलेली सुरळी': 'SUGARCANE_SHOOT_BORER',
  'मधली सुरळी वाळली': 'SUGARCANE_SHOOT_BORER',
  'मरलेली सुरळी': 'SUGARCANE_SHOOT_BORER',
  'डेड हार्ट': 'SUGARCANE_SHOOT_BORER',
  'गाभा मेला': 'SUGARCANE_SHOOT_BORER',
  'गाभा सुकला': 'SUGARCANE_SHOOT_BORER',
  'गाभा वाळला': 'SUGARCANE_SHOOT_BORER',
  'मध्यवर्ती सुरळी मरली': 'SUGARCANE_SHOOT_BORER',
  'ऊसाची मधली सुरळी': 'SUGARCANE_SHOOT_BORER',
  'मधली पान वाळली': 'SUGARCANE_SHOOT_BORER',
  'शेंडा पोखरणारी अळी': 'SUGARCANE_SHOOT_BORER',
  'ऊस मधली सुरळी': 'SUGARCANE_SHOOT_BORER',
  'ऊस बोंडाळा': 'SUGARCANE_SHOOT_BORER',
  'बोंडाळा': 'SUGARCANE_SHOOT_BORER',
  // Marathi Regional - Marathwada
  'सुरळी सुकली': 'SUGARCANE_SHOOT_BORER',
  'मधला भाग मेला': 'SUGARCANE_SHOOT_BORER',
  // Marathi Regional - Vidarbha
  'ऊसाची सुरळी': 'SUGARCANE_SHOOT_BORER',
  // Marathi Regional - Western MH
  'शूट बोअरर': 'SUGARCANE_SHOOT_BORER',
  'डेड हर्ट': 'SUGARCANE_SHOOT_BORER',
  // Hindi - SUGARCANE_SHOOT_BORER
  'मृत मध्य': 'SUGARCANE_SHOOT_BORER',
  'बीच की पत्ती सूखी': 'SUGARCANE_SHOOT_BORER',
  'गन्ने का खुदक': 'SUGARCANE_SHOOT_BORER',
  'गन्ने का शूट बोरर': 'SUGARCANE_SHOOT_BORER',
  'मध्य पत्ती सूखी': 'SUGARCANE_SHOOT_BORER',
  'बीच की पत्ती मरी': 'SUGARCANE_SHOOT_BORER',
  'गन्ने का छेदक': 'SUGARCANE_SHOOT_BORER',
  // Hindi Regional - UP/Bihar
  'मध्य भाग सूखा': 'SUGARCANE_SHOOT_BORER',
  // Voice variants
  'shootborer problem': 'SUGARCANE_SHOOT_BORER',
  'shoot borer attack': 'SUGARCANE_SHOOT_BORER',
  'dead heart problem': 'SUGARCANE_SHOOT_BORER',
  
  // === SUGARCANE_TOP_BORER (Scirpophaga excerptalis) ===
  'top_borer': 'SUGARCANE_TOP_BORER',
  'topborer': 'SUGARCANE_TOP_BORER',
  'top borer': 'SUGARCANE_TOP_BORER',
  'TOPBORER': 'SUGARCANE_TOP_BORER',
  'TOP BORER': 'SUGARCANE_TOP_BORER',
  'sugarcane top borer': 'SUGARCANE_TOP_BORER',
  'white borer': 'SUGARCANE_TOP_BORER',
  // Marathi
  'टॉप बोरर': 'SUGARCANE_TOP_BORER',
  'वरच्या भागाचा किडा': 'SUGARCANE_TOP_BORER',
  'वरचा भाग पोखरणारा': 'SUGARCANE_TOP_BORER',
  // Hindi
  'शीर्ष छेदक': 'SUGARCANE_TOP_BORER',
  'ऊपरी हिस्से का कीड़ा': 'SUGARCANE_TOP_BORER',
  'टॉप में छेद करने वाला': 'SUGARCANE_TOP_BORER',
  
  // === SUGARCANE_INTERNODE_BORER (Chilo sacchariphagus) ===
  'internode_borer': 'SUGARCANE_INTERNODE_BORER',
  'internodeborer': 'SUGARCANE_INTERNODE_BORER',
  'internode borer': 'SUGARCANE_INTERNODE_BORER',
  'INTERNODEBORER': 'SUGARCANE_INTERNODE_BORER',
  'stalk borer': 'SUGARCANE_INTERNODE_BORER',
  'sugarcane stalk borer': 'SUGARCANE_INTERNODE_BORER',
  // Marathi
  'खोड किडा': 'SUGARCANE_INTERNODE_BORER',
  'गाठ पोखरणारी अळी': 'SUGARCANE_INTERNODE_BORER',
  'इंटरनोड बोरर': 'SUGARCANE_INTERNODE_BORER',
  'खोडकिडा': 'SUGARCANE_INTERNODE_BORER',
  // Hindi
  'गांठ छेदक': 'SUGARCANE_INTERNODE_BORER',
  'तना छेदक': 'SUGARCANE_INTERNODE_BORER',
  'स्टेम बोरर': 'SUGARCANE_INTERNODE_BORER',
  
  // === SUGARCANE_PYRILLA (Pyrilla perpusilla) ===
  'pyrilla': 'SUGARCANE_PYRILLA',
  'sugarcane pyrilla': 'SUGARCANE_PYRILLA',
  'sugarcane planthopper': 'SUGARCANE_PYRILLA',
  'sugarcane leafhopper': 'SUGARCANE_PYRILLA',
  'cane hopper': 'SUGARCANE_PYRILLA',
  // Marathi
  'पाकोळी': 'SUGARCANE_PYRILLA',
  'पायरीला': 'SUGARCANE_PYRILLA',
  'पाकोळी किडा': 'SUGARCANE_PYRILLA',
  'ऊसाची पाकोळी': 'SUGARCANE_PYRILLA',
  'पायरीला किडा': 'SUGARCANE_PYRILLA',
  // Hindi
  'पायरिला': 'SUGARCANE_PYRILLA',
  'गन्ने का पाइरिला': 'SUGARCANE_PYRILLA',
  'पत्ता फुदका': 'SUGARCANE_PYRILLA',
  'गन्ने की मक्खी': 'SUGARCANE_PYRILLA',
  'पत्ता कूदने वाला': 'SUGARCANE_PYRILLA',
  
  // === SUGARCANE_WOOLLY_APHID (Ceratovacuna lanigera) ===
  'woolly_aphid': 'SUGARCANE_WOOLLY_APHID',
  'woollyaphid': 'SUGARCANE_WOOLLY_APHID',
  'woolly aphid': 'SUGARCANE_WOOLLY_APHID',
  'sugarcane woolly aphid': 'SUGARCANE_WOOLLY_APHID',
  'cotton-like aphid': 'SUGARCANE_WOOLLY_APHID',
  'white woolly': 'SUGARCANE_WOOLLY_APHID',
  // Marathi
  'लोकरी मावा': 'SUGARCANE_WOOLLY_APHID',
  'लोकरासारखा मावा': 'SUGARCANE_WOOLLY_APHID',
  'पांढरा रुई सारखा किडा': 'SUGARCANE_WOOLLY_APHID',
  'पांढरा लोकरी किडा': 'SUGARCANE_WOOLLY_APHID',
  // Hindi
  'ऊनी माहू': 'SUGARCANE_WOOLLY_APHID',
  'रुई जैसा माहू': 'SUGARCANE_WOOLLY_APHID',
  'सफेद ऊन वाला कीड़ा': 'SUGARCANE_WOOLLY_APHID',
  
  // === SUGARCANE_TERMITE (Odontotermes obesus) ===
  'termite': 'SUGARCANE_TERMITE',
  'termites': 'SUGARCANE_TERMITE',
  'white ant': 'SUGARCANE_TERMITE',
  'white ants': 'SUGARCANE_TERMITE',
  'sugarcane termite': 'SUGARCANE_TERMITE',
  // Marathi
  'हमणी': 'SUGARCANE_TERMITE',
  'मातकिडा': 'SUGARCANE_TERMITE',
  'ऊसाची हमणी': 'SUGARCANE_TERMITE',
  'माती खाणारा किडा': 'SUGARCANE_TERMITE',
  // Hindi
  'दीमक': 'SUGARCANE_TERMITE',
  'गन्ने की दीमक': 'SUGARCANE_TERMITE',
  'सफेद चींटी': 'SUGARCANE_TERMITE',
  'गन्ने की सफेद चींटी': 'SUGARCANE_TERMITE',
  
  // === SUGARCANE_WHITEFLY (Aleurolobus barodensis) ===
  'sugarcane whitefly': 'SUGARCANE_WHITEFLY',
  'sugarcane white fly': 'SUGARCANE_WHITEFLY',
  'cane whitefly': 'SUGARCANE_WHITEFLY',
  // Marathi
  'ऊसाची सफेद माशी': 'SUGARCANE_WHITEFLY',
  'ऊसाची पांढरी माशी': 'SUGARCANE_WHITEFLY',
  // Hindi
  'गन्ने की सफेद मक्खी': 'SUGARCANE_WHITEFLY',
  
  // === SUGARCANE_SCALE_INSECT (Melanaspis glomerata) ===
  'scale_insect': 'SUGARCANE_SCALE_INSECT',
  'scaleinsect': 'SUGARCANE_SCALE_INSECT',
  'scale insect': 'SUGARCANE_SCALE_INSECT',
  'sugarcane scale': 'SUGARCANE_SCALE_INSECT',
  'armoured scale': 'SUGARCANE_SCALE_INSECT',
  // Marathi
  'खवल्या कीड': 'SUGARCANE_SCALE_INSECT',
  'स्केल इन्सेक्ट': 'SUGARCANE_SCALE_INSECT',
  'ढालीसारखा किडा': 'SUGARCANE_SCALE_INSECT',
  // Hindi
  'खोपड़ी कीट': 'SUGARCANE_SCALE_INSECT',
  'स्केल कीट': 'SUGARCANE_SCALE_INSECT',
  'ढाल जैसा कीड़ा': 'SUGARCANE_SCALE_INSECT',
  
  // === WIREWORM (Agriotes spp.) ===
  'wireworm': 'WIREWORM',
  'wireworms': 'WIREWORM',
  'wire worm': 'WIREWORM',
  'click beetle': 'WIREWORM',
  'elaterid beetle': 'WIREWORM',
  // Marathi
  'वायरवर्म': 'WIREWORM',
  'तारे सारखी अळी': 'WIREWORM',
  'कडक अळी': 'WIREWORM',
  'क्लिक बीटल': 'WIREWORM',
  // Hindi
  'तार जैसा कीड़ा': 'WIREWORM',
  
  // === ROOT_BORER variations ===
  'root_borer': 'ROOT_BORER',
  'rootborer': 'ROOT_BORER',
  'root borer': 'ROOT_BORER',
  'ROOTBORER': 'ROOT_BORER',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COTTON-SPECIFIC PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // === COTTON_SPOTTED_BOLLWORM (Earias vittella) ===
  'spotted_bollworm': 'COTTON_SPOTTED_BOLLWORM',
  'spottedbollworm': 'COTTON_SPOTTED_BOLLWORM',
  'spotted bollworm': 'COTTON_SPOTTED_BOLLWORM',
  'earias': 'COTTON_SPOTTED_BOLLWORM',
  'earias bollworm': 'COTTON_SPOTTED_BOLLWORM',
  'green bollworm': 'COTTON_SPOTTED_BOLLWORM',
  // Marathi
  'ओंबव्याची बोंड आळी': 'COTTON_SPOTTED_BOLLWORM',
  'चित्तेदार अळी': 'COTTON_SPOTTED_BOLLWORM',
  'स्पॉटेड बॉलवर्म': 'COTTON_SPOTTED_BOLLWORM',
  'चट्टेदार बोंड अळी': 'COTTON_SPOTTED_BOLLWORM',
  // Hindi
  'चित्तीदार बॉलवर्म': 'COTTON_SPOTTED_BOLLWORM',
  'धब्बेदार इल्ली': 'COTTON_SPOTTED_BOLLWORM',
  'चित्तीदार सूंडी': 'COTTON_SPOTTED_BOLLWORM',
  
  // === COTTON_AMERICAN_BOLLWORM (Helicoverpa armigera) ===
  'american_bollworm': 'COTTON_AMERICAN_BOLLWORM',
  'americanbollworm': 'COTTON_AMERICAN_BOLLWORM',
  'american bollworm': 'COTTON_AMERICAN_BOLLWORM',
  'helicoverpa': 'COTTON_AMERICAN_BOLLWORM',
  'helicoverpa armigera': 'COTTON_AMERICAN_BOLLWORM',
  'bollworm': 'COTTON_AMERICAN_BOLLWORM',
  'boll_worm': 'COTTON_AMERICAN_BOLLWORM',
  'boll worm': 'COTTON_AMERICAN_BOLLWORM',
  'fruit borer': 'COTTON_AMERICAN_BOLLWORM',
  'pod borer': 'COTTON_AMERICAN_BOLLWORM',
  // Marathi
  'अमेरिकन बॉलवर्म': 'COTTON_AMERICAN_BOLLWORM',
  'गाभा अळी': 'COTTON_AMERICAN_BOLLWORM',
  'फळ पोखरणारी अळी': 'COTTON_AMERICAN_BOLLWORM',
  'बोंड अळी': 'COTTON_AMERICAN_BOLLWORM',
  'बोंडअळी': 'COTTON_AMERICAN_BOLLWORM',
  'गाभा': 'COTTON_AMERICAN_BOLLWORM',
  // Hindi
  'गाभा कीट': 'COTTON_AMERICAN_BOLLWORM',
  'फल छेदक': 'COTTON_AMERICAN_BOLLWORM',
  'अमेरिकन बोलवर्म': 'COTTON_AMERICAN_BOLLWORM',
  
  // === COTTON_PINK_BOLLWORM (Pectinophora gossypiella) ===
  'pink_bollworm': 'COTTON_PINK_BOLLWORM',
  'pinkbollworm': 'COTTON_PINK_BOLLWORM',
  'pink bollworm': 'COTTON_PINK_BOLLWORM',
  'PINKBOLLWORM': 'COTTON_PINK_BOLLWORM',
  'pbw': 'COTTON_PINK_BOLLWORM',
  'pectinophora': 'COTTON_PINK_BOLLWORM',
  'cotton pink worm': 'COTTON_PINK_BOLLWORM',
  // Marathi
  'गुलाबी बोंडआळी': 'COTTON_PINK_BOLLWORM',
  'गुलाबी बोंडअळी': 'COTTON_PINK_BOLLWORM',
  'पिंक बॉलवर्म': 'COTTON_PINK_BOLLWORM',
  'गुलाबी गाभा अळी': 'COTTON_PINK_BOLLWORM',
  'गुलाबी अळी': 'COTTON_PINK_BOLLWORM',
  // Hindi
  'गुलाबी बॉलवर्म': 'COTTON_PINK_BOLLWORM',
  'गुलाबी इल्ली': 'COTTON_PINK_BOLLWORM',
  'गुलाबी सूंडी': 'COTTON_PINK_BOLLWORM',
  
  // === COTTON_GREEN_BOLLWORM (Earias spp.) ===
  'green_bollworm': 'COTTON_GREEN_BOLLWORM',
  'greenbollworm': 'COTTON_GREEN_BOLLWORM',
  'cotton green bollworm': 'COTTON_GREEN_BOLLWORM',
  'green caterpillar': 'COTTON_GREEN_BOLLWORM',
  // Marathi
  'हिरवी बोंड अळी': 'COTTON_GREEN_BOLLWORM',
  'हिरवा गाभा किडा': 'COTTON_GREEN_BOLLWORM',
  'ग्रीन बॉलवर्म': 'COTTON_GREEN_BOLLWORM',
  // Hindi
  'हरी बॉलवर्म': 'COTTON_GREEN_BOLLWORM',
  'हरा इल्ली': 'COTTON_GREEN_BOLLWORM',
  'हरा गाभा कीट': 'COTTON_GREEN_BOLLWORM',
  
  // === COTTON_JASSID (Amrasca biguttula) ===
  'jassid': 'COTTON_JASSID',
  'jassids': 'COTTON_JASSID',
  'cotton jassid': 'COTTON_JASSID',
  'cotton leafhopper': 'COTTON_JASSID',
  'leafhopper': 'COTTON_JASSID',
  // Marathi
  'तुडतुडे': 'COTTON_JASSID',
  'कापसाचे तुडतुडे': 'COTTON_JASSID',
  'हिरवे तुडतुडे': 'COTTON_JASSID',
  'जॅसिड': 'COTTON_JASSID',
  // Hindi
  'जेसिड': 'COTTON_JASSID',
  'हरा तुड़तुड़ा': 'COTTON_JASSID',
  'कपास का जेसिड': 'COTTON_JASSID',
  
  // === COTTON_WHITEFLY (Bemisia tabaci) ===
  'whitefly': 'COTTON_WHITEFLY',
  'white_fly': 'COTTON_WHITEFLY',
  'white fly': 'COTTON_WHITEFLY',
  'white flies': 'COTTON_WHITEFLY',
  'cotton whitefly': 'COTTON_WHITEFLY',
  'bemisia': 'COTTON_WHITEFLY',
  'bemisia tabaci': 'COTTON_WHITEFLY',
  // Marathi
  'पांढरी माशी': 'COTTON_WHITEFLY',
  'कापसाची सफेद माशी': 'COTTON_WHITEFLY',
  'व्हाइटफ्लाय': 'COTTON_WHITEFLY',
  // Hindi
  'सफेद मक्खी': 'COTTON_WHITEFLY',
  'सफ़ेद मक्खी': 'COTTON_WHITEFLY',
  'कपास की सफेद मक्खी': 'COTTON_WHITEFLY',
  'व्हाइटफ्लाई': 'COTTON_WHITEFLY',
  
  // === COTTON_MEALYBUG (Phenacoccus solenopsis) ===
  'mealybug': 'COTTON_MEALYBUG',
  'mealy_bug': 'COTTON_MEALYBUG',
  'mealy bug': 'COTTON_MEALYBUG',
  'cotton mealybug': 'COTTON_MEALYBUG',
  'phenacoccus': 'COTTON_MEALYBUG',
  // Marathi
  'मिलीबग': 'COTTON_MEALYBUG',
  'कपाशीवरील मावा': 'COTTON_MEALYBUG',
  'पांढरा चिकट किडा': 'COTTON_MEALYBUG',
  'ढेकूण': 'COTTON_MEALYBUG',
  // Hindi
  'कपास का मावा': 'COTTON_MEALYBUG',
  'सफेद चिपचिपा कीड़ा': 'COTTON_MEALYBUG',
  'चिपचिपा कीट': 'COTTON_MEALYBUG',
  
  // === COTTON_THRIPS (Thrips tabaci) ===
  'thrips': 'COTTON_THRIPS',
  'thrip': 'COTTON_THRIPS',
  'cotton thrips': 'COTTON_THRIPS',
  'thunder flies': 'COTTON_THRIPS',
  'flower thrips': 'COTTON_THRIPS',
  // Marathi
  'फुलकिडे': 'COTTON_THRIPS',
  'कापसाचे फुलकिडे': 'COTTON_THRIPS',
  'थ्रिप्स': 'COTTON_THRIPS',
  // Hindi
  'कपास के थ्रिप्स': 'COTTON_THRIPS',
  'फूल कीट': 'COTTON_THRIPS',
  
  // === COTTON_LEAF_REDDENING_COMPLEX ===
  'leaf_reddening': 'COTTON_LEAF_REDDENING',
  'leafreddening': 'COTTON_LEAF_REDDENING',
  'leaf reddening': 'COTTON_LEAF_REDDENING',
  'reddening complex': 'COTTON_LEAF_REDDENING',
  'cotton leaf red': 'COTTON_LEAF_REDDENING',
  // Marathi
  'हेडडॉविंग': 'COTTON_LEAF_REDDENING',
  'लाल्या': 'COTTON_LEAF_REDDENING',
  'पाने लाल होणे': 'COTTON_LEAF_REDDENING',
  'रेडनिंग': 'COTTON_LEAF_REDDENING',
  // Hindi
  'पत्ते लाल होना': 'COTTON_LEAF_REDDENING',
  'लाली रोग': 'COTTON_LEAF_REDDENING',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL PESTS (Cross-crop)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // === STEM_BORER variations ===
  'stem_borer': 'STEM_BORER',
  'stemborer': 'STEM_BORER',
  'stem borer': 'STEM_BORER',
  'stem-borer': 'STEM_BORER',
  'stemBorer': 'STEM_BORER',
  'StemBorer': 'STEM_BORER',
  'STEMBORER': 'STEM_BORER',
  
  // === FRUIT_BORER variations ===
  'fruit_borer': 'FRUIT_BORER',
  'fruitborer': 'FRUIT_BORER',
  
  // === APHID variations ===
  'aphid': 'APHID',
  'aphids': 'APHID',
  'plant lice': 'APHID',
  'greenfly': 'APHID',
  'मावा': 'APHID',
  'माहू': 'APHID',
  'चेपा': 'APHID',
  'मोयला': 'APHID',
  
  // === RED_SPIDER_MITE variations ===
  'red_spider_mite': 'RED_SPIDER_MITE',
  'redspidermite': 'RED_SPIDER_MITE',
  'red spider mite': 'RED_SPIDER_MITE',
  'REDSPIDERMITE': 'RED_SPIDER_MITE',
  'spider mite': 'RED_SPIDER_MITE',
  'mite': 'RED_SPIDER_MITE',
  'mites': 'RED_SPIDER_MITE',
  'कोळी': 'RED_SPIDER_MITE',
  'लाल कोळी': 'RED_SPIDER_MITE',
  'मकड़ी': 'RED_SPIDER_MITE',
  
  // === ARMYWORM variations ===
  'armyworm': 'ARMYWORM',
  'army_worm': 'ARMYWORM',
  'army worm': 'ARMYWORM',
  'लष्करी अळी': 'ARMYWORM',
  'सैनिक कीट': 'ARMYWORM',
  
  // === FALL_ARMYWORM variations ===
  'fall_armyworm': 'FALL_ARMYWORM',
  'fallarmyworm': 'FALL_ARMYWORM',
  'fall armyworm': 'FALL_ARMYWORM',
  'FALLARMYWORM': 'FALL_ARMYWORM',
  'faw': 'FALL_ARMYWORM',
  
  // === GIRDLE_BEETLE variations ===
  'girdle_beetle': 'GIRDLE_BEETLE',
  'girdlebeetle': 'GIRDLE_BEETLE',
  'girdle beetle': 'GIRDLE_BEETLE',
  'GIRDLEBEETLE': 'GIRDLE_BEETLE',
  
  // === STEM_FLY variations ===
  'stem_fly': 'STEM_FLY',
  'stemfly': 'STEM_FLY',
  'stem fly': 'STEM_FLY',
  'STEMFLY': 'STEM_FLY',
  
  // === BPH (Brown Planthopper) variations ===
  'bph': 'BPH',
  'brown_planthopper': 'BPH',
  'brown planthopper': 'BPH',
  'planthopper': 'BPH',
  
  // === LOCUST variations ===
  'locust': 'LOCUST',
  'locusts': 'LOCUST',
  'टिड्डी': 'LOCUST',
  
  // === CATERPILLAR variations ===
  'caterpillar': 'CATERPILLAR',
  'caterpillars': 'CATERPILLAR',
  'larvae': 'CATERPILLAR',
  'larva': 'CATERPILLAR',
  'worm': 'CATERPILLAR',
  'अळी': 'CATERPILLAR',
  'सुरवंट': 'CATERPILLAR',
  'इल्ली': 'CATERPILLAR',
  'सूंडी': 'CATERPILLAR',
  
  // === FRUIT_FLY variations ===
  'fruit_fly': 'FRUIT_FLY',
  'fruitfly': 'FRUIT_FLY',
  'fruit fly': 'FRUIT_FLY',
  'fruit flies': 'FRUIT_FLY',
  'फळ माशी': 'FRUIT_FLY',
  'फल मक्खी': 'FRUIT_FLY',
  
  // === NEMATODE variations ===
  'nematode': 'NEMATODE',
  'nematodes': 'NEMATODE',
  'root knot nematode': 'NEMATODE',
  'eelworm': 'NEMATODE',
  'सूत्रकृमी': 'NEMATODE',
  'नेमाटोड': 'NEMATODE',
};

// ═══════════════════════════════════════════════════════════════════════════
// MASTER DISEASE LOOKUP TABLE
// ═══════════════════════════════════════════════════════════════════════════

const DISEASE_MASTER_TABLE: Record<string, string> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SUGARCANE-SPECIFIC DISEASES
  // ═══════════════════════════════════════════════════════════════════════════
  
  // === SUGARCANE_RED_ROT (Colletotrichum falcatum) ===
  'red_rot': 'SUGARCANE_RED_ROT',
  'redrot': 'SUGARCANE_RED_ROT',
  'red rot': 'SUGARCANE_RED_ROT',
  'red rot disease': 'SUGARCANE_RED_ROT',
  'stalk rot': 'SUGARCANE_RED_ROT',
  'sugarcane red rot': 'SUGARCANE_RED_ROT',
  // Marathi
  'लाल कुजण्या': 'SUGARCANE_RED_ROT',
  'रेड रॉट': 'SUGARCANE_RED_ROT',
  'लाल सडणे': 'SUGARCANE_RED_ROT',
  'लाल कुजणे रोग': 'SUGARCANE_RED_ROT',
  'लाल कुज': 'SUGARCANE_RED_ROT',
  'रेड रोट': 'SUGARCANE_RED_ROT',
  // Hindi
  'लाल सड़न': 'SUGARCANE_RED_ROT',
  'लाल गलना रोग': 'SUGARCANE_RED_ROT',
  'लाल गलन': 'SUGARCANE_RED_ROT',
  
  // === SUGARCANE_SMUT (Ustilago scitaminea) ===
  'smut': 'SUGARCANE_SMUT',
  'sugarcane smut': 'SUGARCANE_SMUT',
  'smut disease': 'SUGARCANE_SMUT',
  // Marathi
  'मट रोग': 'SUGARCANE_SMUT',
  'काळा चाबूक': 'SUGARCANE_SMUT',
  'स्मट': 'SUGARCANE_SMUT',
  'काळी अंकुर': 'SUGARCANE_SMUT',
  'कांडी': 'SUGARCANE_SMUT',
  // Hindi
  'काला चाबुक': 'SUGARCANE_SMUT',
  'स्मट रोग': 'SUGARCANE_SMUT',
  
  // === SUGARCANE_WHIP_SMUT ===
  'whip_smut': 'SUGARCANE_WHIP_SMUT',
  'whipsmut': 'SUGARCANE_WHIP_SMUT',
  'whip smut': 'SUGARCANE_WHIP_SMUT',
  'black whip': 'SUGARCANE_WHIP_SMUT',
  'black whip disease': 'SUGARCANE_WHIP_SMUT',
  // Marathi
  'चाबूक काणी': 'SUGARCANE_WHIP_SMUT',
  'चाबूक स्मट': 'SUGARCANE_WHIP_SMUT',
  'काळा चाबूक रोग': 'SUGARCANE_WHIP_SMUT',
  // Hindi
  'चाबुक रोग': 'SUGARCANE_WHIP_SMUT',
  'व्हिप स्मट': 'SUGARCANE_WHIP_SMUT',
  
  // === SUGARCANE_GRASSY_SHOOT (Phytoplasma) ===
  'grassy_shoot': 'SUGARCANE_GRASSY_SHOOT',
  'grassyshoot': 'SUGARCANE_GRASSY_SHOOT',
  'grassy shoot': 'SUGARCANE_GRASSY_SHOOT',
  'grassy shoot disease': 'SUGARCANE_GRASSY_SHOOT',
  'phytoplasma disease': 'SUGARCANE_GRASSY_SHOOT',
  // Marathi
  'गवताळ वाढ': 'SUGARCANE_GRASSY_SHOOT',
  'ग्रासी शूट': 'SUGARCANE_GRASSY_SHOOT',
  'गवत सारखी वाढ': 'SUGARCANE_GRASSY_SHOOT',
  'पातळ अंकुर रोग': 'SUGARCANE_GRASSY_SHOOT',
  // Hindi
  'घासी अंकुर': 'SUGARCANE_GRASSY_SHOOT',
  'घास जैसी बढ़वार': 'SUGARCANE_GRASSY_SHOOT',
  
  // === SUGARCANE_RUST (Puccinia melanocephala) ===
  'sugarcane_rust': 'SUGARCANE_RUST',
  'sugarcane rust': 'SUGARCANE_RUST',
  'brown rust': 'SUGARCANE_RUST',
  'orange rust': 'SUGARCANE_RUST',
  // Marathi
  'ऊसाचा तांबेरा': 'SUGARCANE_RUST',
  'तांबटा रोग': 'SUGARCANE_RUST',
  'तांबूस डाग': 'SUGARCANE_RUST',
  // Hindi
  'गन्ने का रस्ट': 'SUGARCANE_RUST',
  
  // === SUGARCANE_WILT (Fusarium sacchari) ===
  'sugarcane_wilt': 'SUGARCANE_WILT',
  'sugarcane wilt': 'SUGARCANE_WILT',
  // Marathi
  'ऊस मरणे': 'SUGARCANE_WILT',
  'कोमेजणे रोग': 'SUGARCANE_WILT',
  // Hindi
  'उकठा रोग': 'SUGARCANE_WILT',
  'मुरझाना रोग': 'SUGARCANE_WILT',
  
  // === SUGARCANE_LEAF_SCALD (Xanthomonas albilineans) ===
  'leaf_scald': 'SUGARCANE_LEAF_SCALD',
  'leafscald': 'SUGARCANE_LEAF_SCALD',
  'leaf scald': 'SUGARCANE_LEAF_SCALD',
  'white stripe': 'SUGARCANE_LEAF_SCALD',
  'bacterial stripe': 'SUGARCANE_LEAF_SCALD',
  // Marathi
  'पान जळणे': 'SUGARCANE_LEAF_SCALD',
  'पातळ पांढरी पट्टी': 'SUGARCANE_LEAF_SCALD',
  'लीफ स्कॉल्ड': 'SUGARCANE_LEAF_SCALD',
  // Hindi
  'पत्ता झुलसा': 'SUGARCANE_LEAF_SCALD',
  'सफेद धारी रोग': 'SUGARCANE_LEAF_SCALD',
  'पत्ता जलना': 'SUGARCANE_LEAF_SCALD',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COTTON-SPECIFIC DISEASES
  // ═══════════════════════════════════════════════════════════════════════════
  
  // === COTTON_WILT (Fusarium oxysporum) ===
  'cotton_wilt': 'COTTON_WILT',
  'cotton wilt': 'COTTON_WILT',
  'fusarium wilt': 'COTTON_WILT',
  'vascular wilt': 'COTTON_WILT',
  // Marathi
  'कापसाचा मर': 'COTTON_WILT',
  'झाड मरणे': 'COTTON_WILT',
  // Hindi
  'कपास का उकठा': 'COTTON_WILT',
  'पौधा मरना': 'COTTON_WILT',
  
  // === COTTON_BOLL_ROT ===
  'boll_rot': 'COTTON_BOLL_ROT',
  'bollrot': 'COTTON_BOLL_ROT',
  'boll rot': 'COTTON_BOLL_ROT',
  'boll rots': 'COTTON_BOLL_ROT',
  'cotton boll rot': 'COTTON_BOLL_ROT',
  // Marathi
  'बोंड सड': 'COTTON_BOLL_ROT',
  'गाभा सडणे': 'COTTON_BOLL_ROT',
  'गोळा कुजणे': 'COTTON_BOLL_ROT',
  // Hindi
  'गाभा सड़न': 'COTTON_BOLL_ROT',
  'बॉल रॉट': 'COTTON_BOLL_ROT',
  'गोला सड़ना': 'COTTON_BOLL_ROT',
  
  // === COTTON_BACTERIAL_BLIGHT (Xanthomonas campestris) ===
  'cotton_bacterial_blight': 'COTTON_BACTERIAL_BLIGHT',
  'cotton bacterial blight': 'COTTON_BACTERIAL_BLIGHT',
  'angular leaf spot': 'COTTON_BACTERIAL_BLIGHT',
  'bacterial leaf spot': 'COTTON_BACTERIAL_BLIGHT',
  // Marathi
  'नीवाणू जण्य कट्या': 'COTTON_BACTERIAL_BLIGHT',
  // Hindi
  'जीवाणु झुलसा': 'COTTON_BACTERIAL_BLIGHT',
  'बैक्टीरियल ब्लाइट': 'COTTON_BACTERIAL_BLIGHT',
  'पत्ता धब्बा': 'COTTON_BACTERIAL_BLIGHT',
  
  // === COTTON_GREY_MILDEW (Ramularia areola) ===
  'grey_mildew': 'COTTON_GREY_MILDEW',
  'greymildew': 'COTTON_GREY_MILDEW',
  'grey mildew': 'COTTON_GREY_MILDEW',
  'gray mildew': 'COTTON_GREY_MILDEW',
  'areolate mildew': 'COTTON_GREY_MILDEW',
  // Marathi
  'दहिया रोग': 'COTTON_GREY_MILDEW',
  'ग्रे मिल्ड्यू': 'COTTON_GREY_MILDEW',
  'करडा पावडर': 'COTTON_GREY_MILDEW',
  'राख सारखा रोग': 'COTTON_GREY_MILDEW',
  // Hindi
  'राख रोग': 'COTTON_GREY_MILDEW',
  'धूसर रोग': 'COTTON_GREY_MILDEW',
  'सफेद धूल': 'COTTON_GREY_MILDEW',
  
  // === COTTON_ALTERNARIA_BLIGHT (Alternaria macrospora) ===
  'cotton_alternaria': 'COTTON_ALTERNARIA_BLIGHT',
  'cotton alternaria': 'COTTON_ALTERNARIA_BLIGHT',
  'alternaria blight': 'COTTON_ALTERNARIA_BLIGHT',
  'alternaria leaf spot': 'COTTON_ALTERNARIA_BLIGHT',
  'leaf blight': 'COTTON_ALTERNARIA_BLIGHT',
  // Marathi
  'आकुंचित मट': 'COTTON_ALTERNARIA_BLIGHT',
  'अल्टरनेरिया करपा': 'COTTON_ALTERNARIA_BLIGHT',
  'पान डाग रोग': 'COTTON_ALTERNARIA_BLIGHT',
  // Hindi
  'आकुंचित रोग': 'COTTON_ALTERNARIA_BLIGHT',
  'अल्टरनेरिया': 'COTTON_ALTERNARIA_BLIGHT',
  
  // === COTTON_LEAF_CURL_VIRUS ===
  'cotton_leaf_curl': 'COTTON_LEAF_CURL_VIRUS',
  'leaf_curl': 'COTTON_LEAF_CURL_VIRUS',
  'leafcurl': 'COTTON_LEAF_CURL_VIRUS',
  'leaf curl': 'COTTON_LEAF_CURL_VIRUS',
  'cotton leaf curl': 'COTTON_LEAF_CURL_VIRUS',
  'clcv': 'COTTON_LEAF_CURL_VIRUS',
  'clcuv': 'COTTON_LEAF_CURL_VIRUS',
  'leaf curl virus': 'COTTON_LEAF_CURL_VIRUS',
  // Marathi
  'पान वळणे विषाणू': 'COTTON_LEAF_CURL_VIRUS',
  'लीफ कर्ल': 'COTTON_LEAF_CURL_VIRUS',
  'पाने मुरडणे रोग': 'COTTON_LEAF_CURL_VIRUS',
  'पाने वळणे': 'COTTON_LEAF_CURL_VIRUS',
  'पाने मुडणे': 'COTTON_LEAF_CURL_VIRUS',
  // Hindi
  'पत्ता मोड़ वायरस': 'COTTON_LEAF_CURL_VIRUS',
  'पत्ता मुड़ना': 'COTTON_LEAF_CURL_VIRUS',
  'पत्ता मोड़': 'COTTON_LEAF_CURL_VIRUS',
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL DISEASES (Cross-crop)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // === POWDERY_MILDEW variations ===
  'powdery_mildew': 'POWDERY_MILDEW',
  'powderymildew': 'POWDERY_MILDEW',
  'powdery mildew': 'POWDERY_MILDEW',
  'white powder': 'POWDERY_MILDEW',
  'pm': 'POWDERY_MILDEW',
  'पांढरा पावडर': 'POWDERY_MILDEW',
  'भुरी': 'POWDERY_MILDEW',
  'पांढरी बुरशी': 'POWDERY_MILDEW',
  'सफेद पाउडर': 'POWDERY_MILDEW',
  'छछूंदर': 'POWDERY_MILDEW',
  
  // === DOWNY_MILDEW variations ===
  'downy_mildew': 'DOWNY_MILDEW',
  'downymildew': 'DOWNY_MILDEW',
  'downy mildew': 'DOWNY_MILDEW',
  'dm': 'DOWNY_MILDEW',
  'केवडा': 'DOWNY_MILDEW',
  
  // === WILT variations ===
  'wilt': 'WILT',
  'wilting': 'WILT',
  'fusarium_wilt': 'WILT',
  'verticillium wilt': 'WILT',
  'मर': 'WILT',
  'विल्ट': 'WILT',
  'म्लानि': 'WILT',
  'उकठा': 'WILT',
  
  // === BLIGHT variations ===
  'blight': 'BLIGHT',
  'early_blight': 'EARLY_BLIGHT',
  'early blight': 'EARLY_BLIGHT',
  'late_blight': 'LATE_BLIGHT',
  'late blight': 'LATE_BLIGHT',
  'alternaria': 'EARLY_BLIGHT',
  'करपा': 'BLIGHT',
  'झुलसा': 'BLIGHT',
  'अंगमारी': 'BLIGHT',
  
  // === BACTERIAL_BLIGHT variations ===
  'bacterial_blight': 'BACTERIAL_BLIGHT',
  'bacterialblight': 'BACTERIAL_BLIGHT',
  'bacterial blight': 'BACTERIAL_BLIGHT',
  'bacterial leaf blight': 'BACTERIAL_BLIGHT',
  'blb': 'BACTERIAL_BLIGHT',
  'जीवाणूजन्य करपा': 'BACTERIAL_BLIGHT',
  'बॅक्टेरियल ब्लाइट': 'BACTERIAL_BLIGHT',
  
  // === RUST variations ===
  'rust': 'RUST',
  'leaf_rust': 'RUST',
  'leaf rust': 'RUST',
  'stem rust': 'RUST',
  'तांबेरा': 'RUST',
  'गंज': 'RUST',
  'गेरुआ': 'RUST',
  'रतुआ': 'RUST',
  'गंज रोग': 'RUST',
  'जंग रोग': 'RUST',
  
  // === ROOT_ROT variations ===
  'root_rot': 'ROOT_ROT',
  'rootrot': 'ROOT_ROT',
  'root rot': 'ROOT_ROT',
  'collar rot': 'ROOT_ROT',
  'मूळ कुज': 'ROOT_ROT',
  'जड़ सड़न': 'ROOT_ROT',
  
  // === ANTHRACNOSE variations ===
  'anthracnose': 'ANTHRACNOSE',
  'fruit rot': 'ANTHRACNOSE',
  'करप्या': 'ANTHRACNOSE',
  'श्याम व्रण': 'ANTHRACNOSE',
  
  // === BLAST variations ===
  'blast': 'BLAST',
  'rice_blast': 'BLAST',
  'rice blast': 'BLAST',
  
  // === MOSAIC variations ===
  'mosaic': 'MOSAIC',
  'mosaic_virus': 'MOSAIC',
  'mosaic virus': 'MOSAIC',
  'yellow vein mosaic': 'MOSAIC',
  'ymv': 'MOSAIC',
  'viral disease': 'MOSAIC',
  'virus': 'MOSAIC',
  'मोझॅक': 'MOSAIC',
  'विषाणू रोग': 'MOSAIC',
  
  // === LEAF_SPOT variations ===
  'leaf_spot': 'LEAF_SPOT',
  'leafspot': 'LEAF_SPOT',
  'leaf spot': 'LEAF_SPOT',
  'cercospora': 'LEAF_SPOT',
  'पानांवर डाग': 'LEAF_SPOT',
  'पर्णदाग': 'LEAF_SPOT',
  'पत्ती धब्बा': 'LEAF_SPOT',
  
  // === DAMPING_OFF variations ===
  'damping_off': 'DAMPING_OFF',
  'dampingoff': 'DAMPING_OFF',
  'damping off': 'DAMPING_OFF',
  'seedling blight': 'DAMPING_OFF',
  'आर्द्रपतन': 'DAMPING_OFF',
  'आर्द्रगलन': 'DAMPING_OFF',
};

// ═══════════════════════════════════════════════════════════════════════════
// MASTER CROP LOOKUP TABLE
// ═══════════════════════════════════════════════════════════════════════════

const CROP_MASTER_TABLE: Record<string, string> = {
  // === SUGARCANE variations ===
  'sugarcane': 'SUGARCANE',
  'sugar_cane': 'SUGARCANE',
  'sugar cane': 'SUGARCANE',
  'cane': 'SUGARCANE',
  'ऊस': 'SUGARCANE',
  'गन्ना': 'SUGARCANE',
  'ईख': 'SUGARCANE',
  
  // === COTTON variations ===
  'cotton': 'COTTON',
  'bt cotton': 'COTTON',
  'कापूस': 'COTTON',
  'कपास': 'COTTON',
  'रुई': 'COTTON',
  
  // === SOYBEAN variations ===
  'soybean': 'SOYBEAN',
  'soya': 'SOYBEAN',
  'soy': 'SOYBEAN',
  'सोयाबीन': 'SOYBEAN',
  'भटमास': 'SOYBEAN',
  
  // === RICE variations ===
  'rice': 'RICE',
  'paddy': 'RICE',
  'भात': 'RICE',
  'तांदूळ': 'RICE',
  'धान': 'RICE',
  'चावल': 'RICE',
  
  // === WHEAT variations ===
  'wheat': 'WHEAT',
  'गहू': 'WHEAT',
  'गेहूं': 'WHEAT',
  
  // === MAIZE variations ===
  'maize': 'MAIZE',
  'corn': 'MAIZE',
  'मका': 'MAIZE',
  'मक्का': 'MAIZE',
  'भुट्टा': 'MAIZE',
  
  // === TOMATO variations ===
  'tomato': 'TOMATO',
  'tomatoes': 'TOMATO',
  'टमाटो': 'TOMATO',
  'टोमॅटो': 'TOMATO',
  'टमाटर': 'TOMATO',
  
  // === ONION variations ===
  'onion': 'ONION',
  'onions': 'ONION',
  'कांदा': 'ONION',
  'प्याज': 'ONION',
  
  // === CHILLI variations ===
  'chilli': 'CHILLI',
  'chili': 'CHILLI',
  'pepper': 'CHILLI',
  'hot pepper': 'CHILLI',
  'मिरची': 'CHILLI',
  'मिर्च': 'CHILLI',
  
  // === GROUNDNUT variations ===
  'groundnut': 'GROUNDNUT',
  'peanut': 'GROUNDNUT',
  'peanuts': 'GROUNDNUT',
  'भुईमूग': 'GROUNDNUT',
  'मूंगफली': 'GROUNDNUT',
  
  // === TUR (Pigeon Pea) variations ===
  'tur': 'TUR',
  'arhar': 'TUR',
  'pigeon pea': 'TUR',
  'pigeon_pea': 'TUR',
  'तूर': 'TUR',
  'अरहर': 'TUR',
  
  // === GRAM (Chickpea) variations ===
  'gram': 'GRAM',
  'chickpea': 'GRAM',
  'chana': 'GRAM',
  'हरभरा': 'GRAM',
  'चना': 'GRAM',
  
  // === MUNG variations ===
  'mung': 'MUNG',
  'moong': 'MUNG',
  'green gram': 'MUNG',
  'मूग': 'MUNG',
  
  // === URAD variations ===
  'urad': 'URAD',
  'black gram': 'URAD',
  'black_gram': 'URAD',
  'उडीद': 'URAD',
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN NORMALIZATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface EntityNormalizationResult {
  original: string;
  normalized: string;
  found: boolean;
  type: 'PEST' | 'DISEASE' | 'CROP' | 'UNKNOWN';
}

/**
 * Normalize a pest name to its canonical code
 * This is the SINGLE source of truth for pest normalization
 */
export function normalizePestEntity(pestName: string | undefined | null): string {
  if (!pestName) return 'UNKNOWN';
  
  const input = pestName.trim();
  const lowerInput = input.toLowerCase();
  
  // Direct lookup (case-insensitive)
  if (PEST_MASTER_TABLE[lowerInput]) {
    const normalized = PEST_MASTER_TABLE[lowerInput];
    console.log(`🔄 [ENTITY_NORMALIZER] Pest: "${input}" → "${normalized}"`);
    return normalized;
  }
  
  // Check with original case (for Devanagari)
  if (PEST_MASTER_TABLE[input]) {
    const normalized = PEST_MASTER_TABLE[input];
    console.log(`🔄 [ENTITY_NORMALIZER] Pest: "${input}" → "${normalized}"`);
    return normalized;
  }
  
  // Partial match for longer phrases
  for (const [key, value] of Object.entries(PEST_MASTER_TABLE)) {
    if (lowerInput.includes(key) || key.includes(lowerInput)) {
      console.log(`🔄 [ENTITY_NORMALIZER] Pest (partial): "${input}" → "${value}"`);
      return value;
    }
  }
  
  // Format to canonical style: UPPERCASE_WITH_UNDERSCORES
  const formatted = input.toUpperCase().replace(/[\s-]+/g, '_');
  console.log(`⚠️ [ENTITY_NORMALIZER] Pest not in lookup, formatted: "${input}" → "${formatted}"`);
  return formatted;
}

/**
 * Normalize a disease name to its canonical code
 * This is the SINGLE source of truth for disease normalization
 */
export function normalizeDiseaseEntity(diseaseName: string | undefined | null): string {
  if (!diseaseName) return 'UNKNOWN';
  
  const input = diseaseName.trim();
  const lowerInput = input.toLowerCase();
  
  // Direct lookup
  if (DISEASE_MASTER_TABLE[lowerInput]) {
    const normalized = DISEASE_MASTER_TABLE[lowerInput];
    console.log(`🔄 [ENTITY_NORMALIZER] Disease: "${input}" → "${normalized}"`);
    return normalized;
  }
  
  // Check with original case (for Devanagari)
  if (DISEASE_MASTER_TABLE[input]) {
    const normalized = DISEASE_MASTER_TABLE[input];
    console.log(`🔄 [ENTITY_NORMALIZER] Disease: "${input}" → "${normalized}"`);
    return normalized;
  }
  
  // Partial match
  for (const [key, value] of Object.entries(DISEASE_MASTER_TABLE)) {
    if (lowerInput.includes(key) || key.includes(lowerInput)) {
      console.log(`🔄 [ENTITY_NORMALIZER] Disease (partial): "${input}" → "${value}"`);
      return value;
    }
  }
  
  // Format to canonical style
  const formatted = input.toUpperCase().replace(/[\s-]+/g, '_');
  console.log(`⚠️ [ENTITY_NORMALIZER] Disease not in lookup, formatted: "${input}" → "${formatted}"`);
  return formatted;
}

/**
 * Normalize a crop name to its canonical code
 * This is the SINGLE source of truth for crop normalization
 */
export function normalizeCropEntity(cropName: string | undefined | null): string {
  if (!cropName) return 'UNKNOWN';
  
  const input = cropName.trim();
  const lowerInput = input.toLowerCase();
  
  // Direct lookup
  if (CROP_MASTER_TABLE[lowerInput]) {
    const normalized = CROP_MASTER_TABLE[lowerInput];
    console.log(`🔄 [ENTITY_NORMALIZER] Crop: "${input}" → "${normalized}"`);
    return normalized;
  }
  
  // Check with original case (for Devanagari)
  if (CROP_MASTER_TABLE[input]) {
    const normalized = CROP_MASTER_TABLE[input];
    console.log(`🔄 [ENTITY_NORMALIZER] Crop: "${input}" → "${normalized}"`);
    return normalized;
  }
  
  // Partial match
  for (const [key, value] of Object.entries(CROP_MASTER_TABLE)) {
    if (lowerInput.includes(key) || key.includes(lowerInput)) {
      console.log(`🔄 [ENTITY_NORMALIZER] Crop (partial): "${input}" → "${value}"`);
      return value;
    }
  }
  
  // Format to canonical style
  const formatted = input.toUpperCase().replace(/[\s-]+/g, '_');
  console.log(`⚠️ [ENTITY_NORMALIZER] Crop not in lookup, formatted: "${input}" → "${formatted}"`);
  return formatted;
}

/**
 * Auto-detect entity type and normalize
 */
export function normalizeEntity(entityName: string | undefined | null): EntityNormalizationResult {
  if (!entityName) {
    return { original: '', normalized: 'UNKNOWN', found: false, type: 'UNKNOWN' };
  }
  
  const input = entityName.trim();
  const lowerInput = input.toLowerCase();
  
  // Check pests first (most common)
  if (PEST_MASTER_TABLE[lowerInput] || PEST_MASTER_TABLE[input]) {
    const normalized = normalizePestEntity(input);
    return { original: input, normalized, found: true, type: 'PEST' };
  }
  
  // Check diseases
  if (DISEASE_MASTER_TABLE[lowerInput] || DISEASE_MASTER_TABLE[input]) {
    const normalized = normalizeDiseaseEntity(input);
    return { original: input, normalized, found: true, type: 'DISEASE' };
  }
  
  // Check crops
  if (CROP_MASTER_TABLE[lowerInput] || CROP_MASTER_TABLE[input]) {
    const normalized = normalizeCropEntity(input);
    return { original: input, normalized, found: true, type: 'CROP' };
  }
  
  // Try partial matches
  for (const [key, value] of Object.entries(PEST_MASTER_TABLE)) {
    if (lowerInput.includes(key) || key.includes(lowerInput)) {
      return { original: input, normalized: value, found: true, type: 'PEST' };
    }
  }
  
  for (const [key, value] of Object.entries(DISEASE_MASTER_TABLE)) {
    if (lowerInput.includes(key) || key.includes(lowerInput)) {
      return { original: input, normalized: value, found: true, type: 'DISEASE' };
    }
  }
  
  for (const [key, value] of Object.entries(CROP_MASTER_TABLE)) {
    if (lowerInput.includes(key) || key.includes(lowerInput)) {
      return { original: input, normalized: value, found: true, type: 'CROP' };
    }
  }
  
  // Unknown entity
  const formatted = input.toUpperCase().replace(/[\s-]+/g, '_');
  return { original: input, normalized: formatted, found: false, type: 'UNKNOWN' };
}

/**
 * Validate that an entity code matches across pipeline stages
 */
export function validateEntityConsistency(
  nluCode: string | undefined,
  ruleEngineCode: string | undefined,
  dbCode: string | undefined,
  entityType: 'PEST' | 'DISEASE' | 'CROP'
): { consistent: boolean; normalizedCode: string; mismatchDetails?: string } {
  const codes = [nluCode, ruleEngineCode, dbCode].filter(Boolean).map(c => c!.toUpperCase().replace(/[\s-]+/g, '_'));
  
  if (codes.length === 0) {
    return { consistent: true, normalizedCode: 'UNKNOWN' };
  }
  
  const uniqueCodes = [...new Set(codes)];
  
  if (uniqueCodes.length === 1) {
    console.log(`✅ [ENTITY_VALIDATOR] ${entityType} consistent: ${uniqueCodes[0]}`);
    return { consistent: true, normalizedCode: uniqueCodes[0] };
  }
  
  // Codes don't match - normalize all and check again
  let normalizedCodes: string[] = [];
  switch (entityType) {
    case 'PEST':
      normalizedCodes = codes.map(c => normalizePestEntity(c));
      break;
    case 'DISEASE':
      normalizedCodes = codes.map(c => normalizeDiseaseEntity(c));
      break;
    case 'CROP':
      normalizedCodes = codes.map(c => normalizeCropEntity(c));
      break;
  }
  
  const uniqueNormalized = [...new Set(normalizedCodes)];
  
  if (uniqueNormalized.length === 1) {
    console.log(`✅ [ENTITY_VALIDATOR] ${entityType} normalized to consistent: ${uniqueNormalized[0]}`);
    return { consistent: true, normalizedCode: uniqueNormalized[0] };
  }
  
  const mismatchDetails = `NLU: ${nluCode || 'N/A'}, RuleEngine: ${ruleEngineCode || 'N/A'}, DB: ${dbCode || 'N/A'} → Normalized: ${normalizedCodes.join(', ')}`;
  console.error(`❌ [ENTITY_VALIDATOR] ${entityType} MISMATCH: ${mismatchDetails}`);
  
  return { 
    consistent: false, 
    normalizedCode: normalizedCodes[0] || 'UNKNOWN',
    mismatchDetails 
  };
}

export const ENTITY_NORMALIZER_VERSION = '1.1.0'; // Wave A.5e: crop-aware pest guard

// ═══════════════════════════════════════════════════════════════════════════
// WAVE A.5e (RC-29) — Crop-aware pest normalization wrapper
// ═══════════════════════════════════════════════════════════════════════════
// PEST_MASTER_TABLE is dominated by SUGARCANE-specific aliases. When a
// query about a non-sugarcane crop hits these, the legacy normalizer can
// return e.g. `SUGARCANE_SHOOT_BORER` for a rice/cotton query, polluting
// downstream rule matching.
//
// Strategy without rewriting the 1100-line static table:
//   - Wrap `normalizePestEntity` with a `cropCode` argument.
//   - If the canonical code returned begins with a crop prefix that does
//     NOT match the active crop, log a structured warning and reject the
//     mapping (return original UPPER+underscore form).
//   - Existing callers that still call `normalizePestEntity(name)` without
//     a crop are unchanged.
// ═══════════════════════════════════════════════════════════════════════════

const CROP_PREFIX_RE = /^(SUGARCANE|RICE|WHEAT|COTTON|MAIZE|SOYBEAN|GROUNDNUT|TOMATO|ONION|POTATO|CHILLI|TURMERIC|BANANA)_/;

export function normalizePestEntityForCrop(
  pestName: string | undefined | null,
  cropCode: string | undefined | null
): string {
  const normalized = normalizePestEntity(pestName);
  if (!cropCode) return normalized;

  const expectedCrop = String(cropCode).toUpperCase();
  const m = normalized.match(CROP_PREFIX_RE);
  if (!m) return normalized; // crop-agnostic entry — fine

  const mappedCrop = m[1];
  if (mappedCrop === expectedCrop) return normalized;

  console.warn(
    `🚨 [EntityNormalizer:CROP_MISMATCH] pest input='${pestName}' mapped='${normalized}' ` +
    `but active crop='${expectedCrop}'. Rejecting cross-crop mapping.`
  );

  // Fall back to original literal (UPPER + underscores), no cross-crop bleed.
  return String(pestName ?? 'UNKNOWN').toUpperCase().trim().replace(/[\s-]+/g, '_');
}

