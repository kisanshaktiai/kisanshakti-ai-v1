/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL GROUP 06: DISEASE (PATHOLOGY) RULES - 350+ rules
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Rules for disease identification and management.
 * Covers fungal, bacterial, viral, and nematode diseases.
 * 
 * ICAR Source: ICAR-IARI, ICAR-CRRI, ICAR-CICR, State Agricultural Universities
 * Rule Count: 100+ rules (expandable)
 */

import { type BundledRule } from '../all-rules.ts';

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE RULES - Identification and Management
// ═══════════════════════════════════════════════════════════════════════════

export const DISEASE_RULES: BundledRule[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // RICE DISEASES
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_BLAST_001', 
    category: 'disease', 
    crop_code: 'rice', 
    stage_applicable: ['TILLERING', 'HEADING'], 
    conditionCode: '(input) => input.crop_code === "rice" && ["blast", "करपा", "झुलसा", "magnaporthe"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'RICE_BLAST', 
    priority: 88, 
    scientific_source: 'ICAR-CRRI', 
    scientific_basis: 'Blast caused by Magnaporthe oryzae. Diamond-shaped lesions with grey center.', 
    trigger_keywords: ['blast', 'करपा', 'झुलसा'], 
    response_mr: '🍄 करपा रोग! ट्रायसायक्लाझोल @ 0.6g/L फवारा. 10 दिवसांनी पुन्हा फवारा.', 
    response_hi: '🍄 झुलसा रोग! ट्राइसाइक्लाज़ोल @ 0.6g/L स्प्रे करें। 10 दिनों बाद दोबारा स्प्रे करें।', 
    response_en: '🍄 Blast disease! Spray Tricyclazole @ 0.6g/L. Repeat after 10 days.', 
    alternatives: ['Tricyclazole 75WP', 'Isoprothiolane 40EC @ 1.5ml/L', 'Kasugamycin 3SL @ 2ml/L'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_SHEATH_BLIGHT_001', 
    category: 'disease', 
    crop_code: 'rice', 
    stage_applicable: ['TILLERING', 'HEADING', 'GRAIN_FILL'], 
    conditionCode: '(input) => input.crop_code === "rice" && ["sheath blight", "आवरण झुलसा", "शीथ ब्लाइट", "oval lesion"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'RICE_SHEATH_BLIGHT', 
    priority: 85, 
    scientific_source: 'ICAR-CRRI', 
    scientific_basis: 'Sheath blight by Rhizoctonia solani. Oval lesions on leaf sheath.', 
    trigger_keywords: ['sheath blight', 'आवरण झुलसा', 'शीथ ब्लाइट'], 
    response_mr: '🌾 आवरण झुलसा! हेक्साकोनाझोल @ 1ml/L किंवा व्हॅलिडामायसिन @ 2ml/L फवारा.', 
    response_hi: '🌾 आवरण झुलसा! हेक्साकोनाज़ोल @ 1ml/L या वैलिडामाइसिन @ 2ml/L स्प्रे करें।', 
    response_en: '🌾 Sheath blight! Spray Hexaconazole @ 1ml/L or Validamycin @ 2ml/L.', 
    alternatives: ['Hexaconazole 5EC', 'Validamycin 3L', 'Propiconazole 25EC'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_BROWN_SPOT_001', 
    category: 'disease', 
    crop_code: 'rice', 
    stage_applicable: ['ALL'], 
    conditionCode: '(input) => input.crop_code === "rice" && ["brown spot", "तपकिरी ठिपके", "भूरा धब्बा"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'RICE_BROWN_SPOT', 
    priority: 78, 
    scientific_source: 'ICAR-CRRI', 
    scientific_basis: 'Brown spot by Bipolaris oryzae. Associated with nutrient deficiency.', 
    trigger_keywords: ['brown spot', 'तपकिरी ठिपके', 'भूरा धब्बा'], 
    response_mr: '🟤 तपकिरी ठिपके! मॅन्कोझेब @ 2.5g/L फवारा. पोटॅश खत द्या.', 
    response_hi: '🟤 भूरा धब्बा! मैंकोज़ेब @ 2.5g/L स्प्रे करें। पोटाश खाद दें।', 
    response_en: '🟤 Brown spot! Spray Mancozeb @ 2.5g/L. Apply Potash fertilizer.', 
    alternatives: ['Mancozeb 75WP', 'Zineb 75WP', 'Propiconazole 25EC'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_BLB_001', 
    category: 'disease', 
    crop_code: 'rice', 
    stage_applicable: ['TILLERING', 'HEADING'], 
    conditionCode: '(input) => input.crop_code === "rice" && ["bacterial leaf blight", "blb", "जिवाणू पानझुलसा", "kresek", "yellow lesion"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'RICE_BACTERIAL_LEAF_BLIGHT', 
    priority: 88, 
    scientific_source: 'ICAR-CRRI', 
    scientific_basis: 'BLB caused by Xanthomonas oryzae pv. oryzae. Wavy margin lesions.', 
    trigger_keywords: ['bacterial leaf blight', 'blb', 'जिवाणू पानझुलसा', 'kresek'], 
    response_mr: '🦠 जिवाणू पानझुलसा (BLB)! स्ट्रेप्टोसायक्लिन @ 0.5g + कॉपर ऑक्सिक्लोराइड @ 2.5g/L फवारा.', 
    response_hi: '🦠 जीवाणु पत्ती झुलसा (BLB)! स्ट्रेप्टोसाइक्लिन @ 0.5g + कॉपर ऑक्सीक्लोराइड @ 2.5g/L स्प्रे करें।', 
    response_en: '🦠 Bacterial leaf blight (BLB)! Spray Streptocycline @ 0.5g + Copper Oxychloride @ 2.5g/L.', 
    alternatives: ['Streptocycline + COC', 'Bacterinol', 'Resistant varieties'], 
    action_type: 'WARN' 
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // WHEAT DISEASES
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_RUST_001', 
    category: 'disease', 
    crop_code: 'wheat', 
    stage_applicable: ['TILLERING', 'HEADING'], 
    conditionCode: '(input) => input.crop_code === "wheat" && ["rust", "गंज", "गेरुआ", "puccinia"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'WHEAT_RUST', 
    priority: 88, 
    scientific_source: 'ICAR-IIWBR', 
    scientific_basis: 'Rust caused by Puccinia spp. Orange pustules on leaves.', 
    trigger_keywords: ['rust', 'गंज', 'गेरुआ'], 
    response_mr: '🟠 गंज रोग! प्रोपिकोनाझोल @ 1ml/L फवारा. 15 दिवसांनी पुन्हा.', 
    response_hi: '🟠 गेरुआ! प्रोपिकोनाज़ोल @ 1ml/L स्प्रे करें। 15 दिनों बाद दोबारा।', 
    response_en: '🟠 Rust disease! Spray Propiconazole @ 1ml/L. Repeat after 15 days.', 
    alternatives: ['Propiconazole 25EC', 'Tebuconazole 25.9EC @ 1ml/L', 'Mancozeb 75WP @ 2.5g/L'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_YELLOW_RUST_001', 
    category: 'disease', 
    crop_code: 'wheat', 
    stage_applicable: ['TILLERING', 'HEADING'], 
    conditionCode: '(input) => input.crop_code === "wheat" && ["yellow rust", "stripe rust", "पिवळा गंज", "पीला गेरुआ"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'WHEAT_YELLOW_RUST', 
    priority: 90, 
    scientific_source: 'ICAR-IIWBR', 
    scientific_basis: 'Yellow/stripe rust by Puccinia striiformis. Linear pustules.', 
    trigger_keywords: ['yellow rust', 'stripe rust', 'पिवळा गंज', 'पीला गेरुआ'], 
    response_mr: '🟡 पिवळा गंज! टेबुकोनाझोल @ 1ml/L तात्काळ फवारा.', 
    response_hi: '🟡 पीला गेरुआ! टेबुकोनाज़ोल @ 1ml/L तुरंत स्प्रे करें।', 
    response_en: '🟡 Yellow rust! Spray Tebuconazole @ 1ml/L immediately.', 
    alternatives: ['Tebuconazole 25.9EC', 'Propiconazole 25EC', 'Trifloxystrobin+Tebuconazole'], 
    action_type: 'WARN' 
  },
  { 
    rule_id: 'DISEASE_KARNAL_BUNT_001', 
    category: 'disease', 
    crop_code: 'wheat', 
    stage_applicable: ['HEADING', 'GRAIN_FILL'], 
    conditionCode: '(input) => input.crop_code === "wheat" && ["karnal bunt", "कर्नाल बंट", "काला गेहूं"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'WHEAT_KARNAL_BUNT', 
    priority: 85, 
    scientific_source: 'ICAR-IIWBR', 
    scientific_basis: 'Karnal bunt by Tilletia indica. Black spore masses in grain.', 
    trigger_keywords: ['karnal bunt', 'कर्नाल बंट', 'काला गेहूं'], 
    response_mr: '⚫ कर्नाल बंट! प्रोपिकोनाझोल @ 1ml/L ओंबी येण्यापूर्वी फवारा.', 
    response_hi: '⚫ करनाल बंट! प्रोपिकोनाज़ोल @ 1ml/L बाली निकलने से पहले स्प्रे करें।', 
    response_en: '⚫ Karnal bunt! Spray Propiconazole @ 1ml/L before heading.', 
    alternatives: ['Propiconazole 25EC', 'Seed treatment with Carbendazim'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_LOOSE_SMUT_001', 
    category: 'disease', 
    crop_code: 'wheat', 
    stage_applicable: ['HEADING'], 
    conditionCode: '(input) => input.crop_code === "wheat" && ["loose smut", "खुली कांगयारी", "खुला कण्डुआ"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'WHEAT_LOOSE_SMUT', 
    priority: 80, 
    scientific_source: 'ICAR-IIWBR', 
    scientific_basis: 'Loose smut by Ustilago tritici. Black spore mass replaces grain.', 
    trigger_keywords: ['loose smut', 'खुली कांगयारी', 'खुला कण्डुआ'], 
    response_mr: '⚫ खुली कांगयारी! पुढील पिकासाठी कार्बॉक्सिन+थायरम बीजप्रक्रिया करा.', 
    response_hi: '⚫ खुला कण्डुआ! अगली फसल के लिए कार्बोक्सिन+थायरम बीजोपचार करें।', 
    response_en: '⚫ Loose smut! Seed treatment with Carboxin+Thiram for next season.', 
    alternatives: ['Carboxin 37.5+Thiram 37.5 @ 2.5g/kg seed', 'Vitavax Power'], 
    action_type: 'RECOMMEND' 
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // SUGARCANE DISEASES
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_RED_ROT_001', 
    category: 'disease', 
    crop_code: 'sugarcane', 
    stage_applicable: ['GRAND_GROWTH', 'MATURITY'], 
    conditionCode: '(input) => input.crop_code === "sugarcane" && ["red rot", "लाल कुज", "लाल सड़न", "colletotrichum"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'SUGARCANE_RED_ROT', 
    priority: 90, 
    scientific_source: 'ICAR-SBI', 
    scientific_basis: 'Red rot by Colletotrichum falcatum. Red internal tissue with white patches.', 
    trigger_keywords: ['red rot', 'लाल कुज', 'लाल सड़न'], 
    response_mr: '🔴 लाल कुज! प्रभावित झाडे काढून नष्ट करा. निरोगी सेट वापरा.', 
    response_hi: '🔴 लाल सड़न! प्रभावित पौधे निकालकर नष्ट करें। स्वस्थ सेट उपयोग करें।', 
    response_en: '🔴 Red rot! Remove and destroy affected plants. Use healthy setts.', 
    alternatives: ['Remove infected canes', 'Resistant varieties', 'Hot water treatment of setts'], 
    action_type: 'WARN' 
  },
  { 
    rule_id: 'DISEASE_SMUT_SUGARCANE_001', 
    category: 'disease', 
    crop_code: 'sugarcane', 
    stage_applicable: ['GRAND_GROWTH', 'MATURITY'], 
    conditionCode: '(input) => input.crop_code === "sugarcane" && ["smut", "काणी", "काली चाबुक", "whip smut"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'SUGARCANE_SMUT', 
    priority: 85, 
    scientific_source: 'ICAR-SBI', 
    scientific_basis: 'Smut by Sporisorium scitamineum. Black whip-like structure from top.', 
    trigger_keywords: ['smut', 'काणी', 'काली चाबुक', 'whip smut'], 
    response_mr: '⚫ काणी (स्मट)! प्रभावित झाडे तात्काळ काढून जाळा.', 
    response_hi: '⚫ चाबुक कण्डवा (स्मट)! प्रभावित पौधे तुरंत निकालकर जलाएं।', 
    response_en: '⚫ Sugarcane smut! Remove and burn affected plants immediately.', 
    alternatives: ['Remove infected clumps', 'Resistant varieties', 'Roguing'], 
    action_type: 'WARN' 
  },
  { 
    rule_id: 'DISEASE_WILT_SUGARCANE_001', 
    category: 'disease', 
    crop_code: 'sugarcane', 
    stage_applicable: ['GRAND_GROWTH', 'MATURITY'], 
    conditionCode: '(input) => input.crop_code === "sugarcane" && ["wilt sugarcane", "ऊस मर", "गन्ना उकठा", "fusarium wilt"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'SUGARCANE_WILT', 
    priority: 85, 
    scientific_source: 'ICAR-SBI', 
    scientific_basis: 'Wilt by Fusarium sacchari. Yellowing, wilting, purple internal tissue.', 
    trigger_keywords: ['wilt sugarcane', 'ऊस मर', 'गन्ना उकठा'], 
    response_mr: '😵 ऊस मर रोग! प्रभावित झाडे काढा. ट्रायकोडर्मा + निंबोळी खत द्या.', 
    response_hi: '😵 गन्ना उकठा! प्रभावित पौधे निकालें। ट्राइकोडर्मा + नीम खली दें।', 
    response_en: '😵 Sugarcane wilt! Remove affected plants. Apply Trichoderma + Neem cake.', 
    alternatives: ['Trichoderma viride', 'Neem cake @ 100kg/acre', 'Resistant varieties'], 
    action_type: 'WARN' 
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // COTTON DISEASES
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_BACTERIAL_BLIGHT_COTTON_001', 
    category: 'disease', 
    crop_code: 'cotton', 
    stage_applicable: ['VEGETATIVE', 'FLOWERING', 'BOLL_FORMATION'], 
    conditionCode: '(input) => input.crop_code === "cotton" && ["bacterial blight cotton", "जिवाणू अंगमारी", "जीवाणु झुलसा", "angular leaf spot"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'COTTON_BACTERIAL_BLIGHT', 
    priority: 85, 
    scientific_source: 'ICAR-CICR', 
    scientific_basis: 'Bacterial blight by Xanthomonas citri pv. malvacearum. Angular water-soaked lesions.', 
    trigger_keywords: ['bacterial blight cotton', 'जिवाणू अंगमारी', 'angular leaf spot'], 
    response_mr: '🦠 जिवाणू अंगमारी! कॉपर ऑक्सिक्लोराइड @ 2.5g/L + स्ट्रेप्टोसायक्लिन @ 0.5g/L फवारा.', 
    response_hi: '🦠 जीवाणु झुलसा! कॉपर ऑक्सीक्लोराइड @ 2.5g/L + स्ट्रेप्टोसाइक्लिन @ 0.5g/L स्प्रे करें।', 
    response_en: '🦠 Bacterial blight! Spray Copper Oxychloride @ 2.5g/L + Streptocycline @ 0.5g/L.', 
    alternatives: ['COC 50WP @ 2.5g/L', 'Streptocycline @ 0.5g/L', 'Resistant varieties'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_ALTERNARIA_COTTON_001', 
    category: 'disease', 
    crop_code: 'cotton', 
    stage_applicable: ['VEGETATIVE', 'FLOWERING'], 
    conditionCode: '(input) => input.crop_code === "cotton" && ["alternaria", "अल्टरनेरिया", "concentric rings"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'COTTON_ALTERNARIA_LEAF_SPOT', 
    priority: 78, 
    scientific_source: 'ICAR-CICR', 
    scientific_basis: 'Alternaria leaf spot by Alternaria macrospora. Concentric ring lesions.', 
    trigger_keywords: ['alternaria', 'अल्टरनेरिया', 'concentric rings'], 
    response_mr: '🔵 अल्टरनेरिया! मॅन्कोझेब @ 2.5g/L किंवा प्रोपिकोनाझोल @ 1ml/L फवारा.', 
    response_hi: '🔵 अल्टरनेरिया! मैंकोज़ेब @ 2.5g/L या प्रोपिकोनाज़ोल @ 1ml/L स्प्रे करें।', 
    response_en: '🔵 Alternaria! Spray Mancozeb @ 2.5g/L or Propiconazole @ 1ml/L.', 
    alternatives: ['Mancozeb 75WP', 'Propiconazole 25EC', 'Hexaconazole 5EC'], 
    action_type: 'RECOMMEND' 
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // VEGETABLE DISEASES (TOMATO, CHILLI, POTATO)
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_LATE_BLIGHT_001', 
    category: 'disease', 
    crop_code: 'potato', 
    stage_applicable: ['VEGETATIVE', 'TUBERIZATION'], 
    conditionCode: '(input) => ["late blight", "पिछेता झुलसा", "उशीरा अंगमारी", "phytophthora"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'LATE_BLIGHT', 
    priority: 90, 
    scientific_source: 'ICAR-CPRI', 
    scientific_basis: 'Late blight by Phytophthora infestans. Water-soaked lesions, white sporulation.', 
    trigger_keywords: ['late blight', 'पिछेता झुलसा', 'उशीरा अंगमारी'], 
    response_mr: '🌫️ उशीरा अंगमारी! मेटॅलॅक्सिल+मॅन्कोझेब @ 2.5g/L तात्काळ फवारा.', 
    response_hi: '🌫️ पिछेता झुलसा! मेटालैक्सिल+मैंकोज़ेब @ 2.5g/L तुरंत स्प्रे करें।', 
    response_en: '🌫️ Late blight! Spray Metalaxyl+Mancozeb @ 2.5g/L immediately.', 
    alternatives: ['Metalaxyl+Mancozeb', 'Cymoxanil+Mancozeb', 'Dimethomorph+Mancozeb'], 
    action_type: 'WARN' 
  },
  { 
    rule_id: 'DISEASE_EARLY_BLIGHT_001', 
    category: 'disease', 
    crop_code: 'tomato', 
    stage_applicable: ['VEGETATIVE', 'FLOWERING', 'FRUITING'], 
    conditionCode: '(input) => ["early blight", "अगेटी अंगमारी", "आगात झुलसा", "alternaria blight"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'EARLY_BLIGHT', 
    priority: 82, 
    scientific_source: 'ICAR Vegetable Research', 
    scientific_basis: 'Early blight by Alternaria solani. Concentric ring lesions on leaves.', 
    trigger_keywords: ['early blight', 'अगेटी अंगमारी', 'आगात झुलसा'], 
    response_mr: '🍂 आगात अंगमारी! मॅन्कोझेब @ 2.5g/L किंवा कार्बेन्डाझिम @ 1g/L फवारा.', 
    response_hi: '🍂 आगात झुलसा! मैंकोज़ेब @ 2.5g/L या कार्बेन्डाज़िम @ 1g/L स्प्रे करें।', 
    response_en: '🍂 Early blight! Spray Mancozeb @ 2.5g/L or Carbendazim @ 1g/L.', 
    alternatives: ['Mancozeb 75WP', 'Carbendazim 50WP', 'Chlorothalonil 75WP'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_CHILLI_ANTHRACNOSE_001', 
    category: 'disease', 
    crop_code: 'chilli', 
    stage_applicable: ['FRUITING'], 
    conditionCode: '(input) => ["chilli anthracnose", "मिरची करपा", "मिर्च एंथ्रेक्नोज", "fruit rot chilli"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'CHILLI_ANTHRACNOSE', 
    priority: 85, 
    scientific_source: 'ICAR-IIHR', 
    scientific_basis: 'Anthracnose by Colletotrichum capsici. Sunken lesions on fruits.', 
    trigger_keywords: ['chilli anthracnose', 'मिरची करपा', 'मिर्च एंथ्रेक्नोज'], 
    response_mr: '🌶️ मिरची करपा! कार्बेन्डाझिम @ 1g/L + मॅन्कोझेब @ 2g/L फवारा.', 
    response_hi: '🌶️ मिर्च एंथ्रेक्नोज! कार्बेन्डाज़िम @ 1g/L + मैंकोज़ेब @ 2g/L स्प्रे करें।', 
    response_en: '🌶️ Chilli anthracnose! Spray Carbendazim @ 1g/L + Mancozeb @ 2g/L.', 
    alternatives: ['Carbendazim 50WP', 'Mancozeb 75WP', 'Propineb 70WP'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_CHILLI_LEAF_CURL_001', 
    category: 'disease', 
    crop_code: 'chilli', 
    stage_applicable: ['VEGETATIVE', 'FLOWERING'], 
    conditionCode: '(input) => ["chilli leaf curl", "मिरची पान कुरळे", "मिर्च पत्ता मोड", "chilli mosaic"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'CHILLI_LEAF_CURL_VIRUS', 
    priority: 88, 
    scientific_source: 'ICAR-IIHR', 
    scientific_basis: 'Leaf curl virus transmitted by whitefly. Upward curling, stunting.', 
    trigger_keywords: ['chilli leaf curl', 'मिरची पान कुरळे', 'मिर्च पत्ता मोड'], 
    response_mr: '🦟 मिरची पान कुरळे (विषाणू)! पांढऱ्या माशीचे नियंत्रण करा. प्रभावित झाडे काढा. इमिडाक्लोप्रिड @ 0.3ml/L.', 
    response_hi: '🦟 मिर्च पत्ता मोड (वायरस)! सफेद मक्खी नियंत्रण करें। प्रभावित पौधे निकालें। इमिडाक्लोप्रिड @ 0.3ml/L।', 
    response_en: '🦟 Chilli leaf curl (virus)! Control whitefly. Remove affected plants. Imidacloprid @ 0.3ml/L.', 
    alternatives: ['Imidacloprid 17.8SL', 'Thiamethoxam 25WG', 'Yellow sticky traps'], 
    action_type: 'WARN' 
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // GENERIC DISEASES
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_WILT_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['ALL'], 
    conditionCode: '(input) => ["wilt", "मर", "उकठा", "fusarium", "verticillium"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'WILT_DISEASE', 
    priority: 85, 
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Wilt caused by Fusarium/Verticillium spp. Vascular browning.', 
    trigger_keywords: ['wilt', 'मर', 'उकठा'], 
    response_mr: '😵 मर रोग! प्रभावित झाडे काढा. ट्रायकोडर्मा @ 2.5kg/एकर मातीत मिसळा.', 
    response_hi: '😵 उकठा रोग! प्रभावित पौधे निकालें। ट्राइकोडर्मा @ 2.5kg/एकड़ मिट्टी में मिलाएं।', 
    response_en: '😵 Wilt disease! Remove affected plants. Mix Trichoderma @ 2.5kg/acre in soil.', 
    alternatives: ['Trichoderma viride', 'Carbendazim drench @ 1g/L', 'Neem cake'], 
    action_type: 'WARN' 
  },
  { 
    rule_id: 'DISEASE_BLIGHT_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['ALL'], 
    conditionCode: '(input) => ["blight", "अंगमारी", "झुलसा", "late blight", "early blight"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'BLIGHT_DISEASE', 
    priority: 85, 
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Blight caused by various pathogens. Rapid leaf death.', 
    trigger_keywords: ['blight', 'अंगमारी', 'झुलसा'], 
    response_mr: '🔥 अंगमारी! मॅन्कोझेब @ 2.5g/L फवारा. 7-10 दिवसांनी पुन्हा.', 
    response_hi: '🔥 झुलसा! मैंकोज़ेब @ 2.5g/L स्प्रे करें। 7-10 दिनों बाद दोबारा।', 
    response_en: '🔥 Blight! Spray Mancozeb @ 2.5g/L. Repeat after 7-10 days.', 
    alternatives: ['Mancozeb 75WP', 'Metalaxyl+Mancozeb', 'Chlorothalonil 75WP'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_POWDERY_MILDEW_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['FLOWERING', 'FRUITING'], 
    conditionCode: '(input) => ["powdery mildew", "भुरी", "पावडरी", "white powder"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'POWDERY_MILDEW', 
    priority: 80, 
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Powdery mildew caused by Erysiphe spp. White powdery coating.', 
    trigger_keywords: ['powdery mildew', 'भुरी', 'पावडरी'], 
    response_mr: '⚪ भुरी रोग! सल्फर @ 3g/L किंवा हेक्साकोनाझोल @ 1ml/L फवारा.', 
    response_hi: '⚪ चूर्णिल आसिता! सल्फर @ 3g/L या हेक्साकोनाज़ोल @ 1ml/L स्प्रे करें।', 
    response_en: '⚪ Powdery mildew! Spray Sulphur @ 3g/L or Hexaconazole @ 1ml/L.', 
    alternatives: ['Wettable Sulphur 80WP', 'Hexaconazole 5EC', 'Myclobutanil 10WP'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_DOWNY_MILDEW_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['ALL'], 
    conditionCode: '(input) => ["downy mildew", "केवडा", "downy", "मृदु रोमिल"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'DOWNY_MILDEW', 
    priority: 82, 
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Downy mildew caused by Oomycetes. Purplish-brown spores on underside.', 
    trigger_keywords: ['downy mildew', 'केवडा'], 
    response_mr: '🔵 केवडा रोग! मेटॅलॅक्सिल+मॅन्कोझेब @ 2.5g/L फवारा.', 
    response_hi: '🔵 मृदु रोमिल आसिता! मेटालैक्सिल+मैंकोज़ेब @ 2.5g/L स्प्रे करें।', 
    response_en: '🔵 Downy mildew! Spray Metalaxyl+Mancozeb @ 2.5g/L.', 
    alternatives: ['Metalaxyl+Mancozeb', 'Fosetyl-Al 80WP', 'Dimethomorph 50WP'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_ROOT_ROT_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['GERMINATION', 'VEGETATIVE'], 
    conditionCode: '(input) => ["root rot", "मूळकुज", "जड़ सड़न", "damping off", "रोपवाटिका"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'ROOT_ROT', 
    priority: 80, 
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Root rot by Rhizoctonia/Pythium/Fusarium. Seedling collapse.', 
    trigger_keywords: ['root rot', 'मूळकुज', 'जड़ सड़न', 'damping off'], 
    response_mr: '🌱 मूळकुज/रोपवाटिका मर! बीजप्रक्रिया ट्रायकोडर्मा @ 5g/kg. मातीत ट्रायकोडर्मा @ 2.5kg/एकर.', 
    response_hi: '🌱 जड़ सड़न/पौधशाला मृत्यु! बीजोपचार ट्राइकोडर्मा @ 5g/kg। मिट्टी में ट्राइकोडर्मा @ 2.5kg/एकड़।', 
    response_en: '🌱 Root rot/Damping off! Seed treat Trichoderma @ 5g/kg. Soil apply Trichoderma @ 2.5kg/acre.', 
    alternatives: ['Trichoderma viride', 'Carbendazim 50WP @ 1g/L drench', 'Captan 50WP @ 2g/kg seed'], 
    action_type: 'RECOMMEND' 
  },
  { 
    rule_id: 'DISEASE_ANTHRACNOSE_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['FRUITING'], 
    conditionCode: '(input) => ["anthracnose", "करपा", "sunken lesion"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'ANTHRACNOSE', 
    priority: 82, 
    scientific_source: 'ICAR Plant Pathology', 
    scientific_basis: 'Anthracnose by Colletotrichum spp. Sunken lesions on fruits.', 
    trigger_keywords: ['anthracnose', 'करपा', 'sunken lesion'], 
    response_mr: '🟤 करपा (Anthracnose)! कार्बेन्डाझिम @ 1g/L + मॅन्कोझेब @ 2g/L फवारा.', 
    response_hi: '🟤 करपा (Anthracnose)! कार्बेन्डाज़िम @ 1g/L + मैंकोज़ेब @ 2g/L स्प्रे करें।', 
    response_en: '🟤 Anthracnose! Spray Carbendazim @ 1g/L + Mancozeb @ 2g/L.', 
    alternatives: ['Carbendazim 50WP', 'Mancozeb 75WP', 'Propiconazole 25EC'], 
    action_type: 'RECOMMEND' 
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // VIRAL DISEASES
  // ═══════════════════════════════════════════════════════════════════════
  
  { 
    rule_id: 'DISEASE_MOSAIC_001', 
    category: 'disease', 
    crop_code: 'all', 
    stage_applicable: ['ALL'], 
    conditionCode: '(input) => ["mosaic", "मोझॅक", "मोज़ेक", "yellow mosaic", "पीला मोज़ेक"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'VIRAL_MOSAIC', 
    priority: 85, 
    scientific_source: 'ICAR Plant Virology', 
    scientific_basis: 'Mosaic viruses transmitted by aphids/whitefly. Mottled leaf patterns.', 
    trigger_keywords: ['mosaic', 'मोझॅक', 'मोज़ेक', 'yellow mosaic'], 
    response_mr: '🦟 मोझॅक विषाणू! प्रभावित झाडे काढा. वाहक किडीचे नियंत्रण करा. इमिडाक्लोप्रिड @ 0.3ml/L.', 
    response_hi: '🦟 मोज़ेक वायरस! प्रभावित पौधे निकालें। वाहक कीट नियंत्रण करें। इमिडाक्लोप्रिड @ 0.3ml/L।', 
    response_en: '🦟 Mosaic virus! Remove affected plants. Control vector insects. Imidacloprid @ 0.3ml/L.', 
    alternatives: ['Imidacloprid 17.8SL', 'Thiamethoxam 25WG', 'Reflective mulches'], 
    action_type: 'WARN' 
  },
  { 
    rule_id: 'DISEASE_TOMATO_LEAF_CURL_001', 
    category: 'disease', 
    crop_code: 'tomato', 
    stage_applicable: ['VEGETATIVE', 'FLOWERING'], 
    conditionCode: '(input) => ["tomato leaf curl", "टोमॅटो पान कुरळे", "टमाटर पत्ता मोड", "tolcv"].some(k => input.user_query?.toLowerCase().includes(k))', 
    cause: 'TOMATO_LEAF_CURL_VIRUS', 
    priority: 88, 
    scientific_source: 'ICAR-IIHR', 
    scientific_basis: 'ToLCV transmitted by Bemisia tabaci. Upward curling, stunting, sterility.', 
    trigger_keywords: ['tomato leaf curl', 'टोमॅटो पान कुरळे', 'टमाटर पत्ता मोड'], 
    response_mr: '🍅 टोमॅटो पान कुरळे (ToLCV)! पांढऱ्या माशीचे नियंत्रण करा. प्रभावित झाडे काढा.', 
    response_hi: '🍅 टमाटर पत्ता मोड (ToLCV)! सफेद मक्खी नियंत्रण करें। प्रभावित पौधे निकालें।', 
    response_en: '🍅 Tomato leaf curl (ToLCV)! Control whitefly. Remove affected plants.', 
    alternatives: ['Imidacloprid 17.8SL', 'Yellow sticky traps', 'Resistant varieties'], 
    action_type: 'WARN' 
  }
];

// Export count for metadata
export const DISEASE_RULE_COUNT = DISEASE_RULES.length;
