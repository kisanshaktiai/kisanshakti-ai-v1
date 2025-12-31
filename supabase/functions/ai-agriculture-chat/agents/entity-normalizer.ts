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
  // === SHOOT_BORER variations ===
  'shoot_borer': 'SHOOT_BORER',
  'shootborer': 'SHOOT_BORER',
  'shoot borer': 'SHOOT_BORER',
  'shoot-borer': 'SHOOT_BORER',
  'shootBorer': 'SHOOT_BORER',
  'ShootBorer': 'SHOOT_BORER',
  'SHOOTBORER': 'SHOOT_BORER',
  'SHOOT-BORER': 'SHOOT_BORER',
  'SHOOT BORER': 'SHOOT_BORER',
  'early shoot borer': 'SHOOT_BORER',
  'sugarcane borer': 'SHOOT_BORER',
  'dead heart': 'SHOOT_BORER', // Symptom mapping
  'deadheart': 'SHOOT_BORER',
  'dead_heart': 'SHOOT_BORER',
  'DEAD_HEART': 'SHOOT_BORER',
  // Marathi
  'शूट बोरर': 'SHOOT_BORER',
  'शूटबोरर': 'SHOOT_BORER',
  'मधली सुरळी': 'SHOOT_BORER',
  'सुखी सुरळी': 'SHOOT_BORER',
  'मधली सुरळी वाळली': 'SHOOT_BORER',
  'मरलेली सुरळी': 'SHOOT_BORER',
  'गाभा सुकला': 'SHOOT_BORER',
  'गाभा वाळला': 'SHOOT_BORER',
  'डेड हार्ट': 'SHOOT_BORER',
  'शेंडा पोखरणारी अळी': 'SHOOT_BORER',
  'ऊस मधली सुरळी': 'SHOOT_BORER',
  'ऊस बोंडाळा': 'SHOOT_BORER',
  'बोंडाळा': 'SHOOT_BORER',
  // Hindi
  'शूट बोरर': 'SHOOT_BORER',
  'डेड हार्ट': 'SHOOT_BORER',
  'मृत मध्य': 'SHOOT_BORER',
  'बीच की पत्ती सूखी': 'SHOOT_BORER',
  'गन्ने का खुदक': 'SHOOT_BORER',
  
  // === STEM_BORER variations ===
  'stem_borer': 'STEM_BORER',
  'stemborer': 'STEM_BORER',
  'stem borer': 'STEM_BORER',
  'stem-borer': 'STEM_BORER',
  'stemBorer': 'STEM_BORER',
  'StemBorer': 'STEM_BORER',
  'STEMBORER': 'STEM_BORER',
  'stalk borer': 'STEM_BORER',
  'खोड किडा': 'STEM_BORER',
  'खोडकिडा': 'STEM_BORER',
  'तना छेदक': 'STEM_BORER',
  'स्टेम बोरर': 'STEM_BORER',
  
  // === TOP_BORER variations ===
  'top_borer': 'TOP_BORER',
  'topborer': 'TOP_BORER',
  'top borer': 'TOP_BORER',
  'TOPBORER': 'TOP_BORER',
  
  // === INTERNODE_BORER variations ===
  'internode_borer': 'INTERNODE_BORER',
  'internodeborer': 'INTERNODE_BORER',
  'internode borer': 'INTERNODE_BORER',
  'INTERNODEBORER': 'INTERNODE_BORER',
  
  // === ROOT_BORER variations ===
  'root_borer': 'ROOT_BORER',
  'rootborer': 'ROOT_BORER',
  'root borer': 'ROOT_BORER',
  'ROOTBORER': 'ROOT_BORER',
  
  // === FRUIT_BORER variations ===
  'fruit_borer': 'FRUIT_BORER',
  'fruitborer': 'FRUIT_BORER',
  'fruit borer': 'FRUIT_BORER',
  'FRUITBORER': 'FRUIT_BORER',
  'pod borer': 'FRUIT_BORER',
  
  // === BOLLWORM variations ===
  'bollworm': 'BOLLWORM',
  'boll_worm': 'BOLLWORM',
  'boll worm': 'BOLLWORM',
  'helicoverpa': 'BOLLWORM',
  'american bollworm': 'BOLLWORM',
  'बोंड अळी': 'BOLLWORM',
  'बोंडअळी': 'BOLLWORM',
  'गाभा': 'BOLLWORM',
  
  // === PINK_BOLLWORM variations ===
  'pink_bollworm': 'PINK_BOLLWORM',
  'pinkbollworm': 'PINK_BOLLWORM',
  'pink bollworm': 'PINK_BOLLWORM',
  'PINKBOLLWORM': 'PINK_BOLLWORM',
  'pbw': 'PINK_BOLLWORM',
  'pectinophora': 'PINK_BOLLWORM',
  'गुलाबी बोंडअळी': 'PINK_BOLLWORM',
  'गुलाबी अळी': 'PINK_BOLLWORM',
  'गुलाबी इल्ली': 'PINK_BOLLWORM',
  
  // === WHITEFLY variations ===
  'whitefly': 'WHITEFLY',
  'white_fly': 'WHITEFLY',
  'white fly': 'WHITEFLY',
  'white flies': 'WHITEFLY',
  'bemisia': 'WHITEFLY',
  'पांढरी माशी': 'WHITEFLY',
  'सफेद माशी': 'WHITEFLY',
  'सफेद मक्खी': 'WHITEFLY',
  'सफ़ेद मक्खी': 'WHITEFLY',
  
  // === APHID variations ===
  'aphid': 'APHID',
  'aphids': 'APHID',
  'plant lice': 'APHID',
  'greenfly': 'APHID',
  'मावा': 'APHID',
  'माहू': 'APHID',
  'चेपा': 'APHID',
  'मोयला': 'APHID',
  
  // === JASSID variations ===
  'jassid': 'JASSID',
  'jassids': 'JASSID',
  'leafhopper': 'JASSID',
  'cotton jassid': 'JASSID',
  'तुडतुडे': 'JASSID',
  'हिरवे तुडतुडे': 'JASSID',
  'हरा तेला': 'JASSID',
  'पत्ता फुदका': 'JASSID',
  
  // === THRIPS variations ===
  'thrips': 'THRIPS',
  'thrip': 'THRIPS',
  'thunder flies': 'THRIPS',
  'फुलकिडे': 'THRIPS',
  'थ्रिप्स': 'THRIPS',
  
  // === MEALYBUG variations ===
  'mealybug': 'MEALYBUG',
  'mealy_bug': 'MEALYBUG',
  'mealy bug': 'MEALYBUG',
  'cotton mealybug': 'MEALYBUG',
  'मिलीबग': 'MEALYBUG',
  'ढेकूण': 'MEALYBUG',
  'चिपचिपा कीट': 'MEALYBUG',
  
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
  'fusarium_wilt': 'FUSARIUM_WILT',
  'fusarium wilt': 'FUSARIUM_WILT',
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
  'जीवाणु झुलसा': 'BACTERIAL_BLIGHT',
  
  // === RUST variations ===
  'rust': 'RUST',
  'leaf_rust': 'RUST',
  'leaf rust': 'RUST',
  'stem rust': 'RUST',
  'तांबेरा': 'RUST',
  'गंज': 'RUST',
  'गेरुआ': 'RUST',
  'रतुआ': 'RUST',
  
  // === LEAF_CURL variations ===
  'leaf_curl': 'LEAF_CURL',
  'leafcurl': 'LEAF_CURL',
  'leaf curl': 'LEAF_CURL',
  'clcv': 'LEAF_CURL',
  'clcuv': 'LEAF_CURL',
  'पाने वळणे': 'LEAF_CURL',
  'पाने मुडणे': 'LEAF_CURL',
  'पत्ता मोड़': 'LEAF_CURL',
  
  // === ROOT_ROT variations ===
  'root_rot': 'ROOT_ROT',
  'rootrot': 'ROOT_ROT',
  'root rot': 'ROOT_ROT',
  'collar rot': 'ROOT_ROT',
  'मूळ कुज': 'ROOT_ROT',
  'जड़ सड़न': 'ROOT_ROT',
  
  // === RED_ROT variations ===
  'red_rot': 'RED_ROT',
  'redrot': 'RED_ROT',
  'red rot': 'RED_ROT',
  'लाल कुज': 'RED_ROT',
  'लाल सड़न': 'RED_ROT',
  
  // === SMUT variations ===
  'smut': 'SMUT',
  'whip_smut': 'SMUT',
  'whip smut': 'SMUT',
  'कांडी': 'SMUT',
  
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

export const ENTITY_NORMALIZER_VERSION = '1.0.0';
