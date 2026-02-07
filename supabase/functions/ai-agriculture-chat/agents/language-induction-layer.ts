/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LANGUAGE INDUCTION LAYER v3.0 — DEPRECATED LEGACY FALLBACK
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️  WARNING: THIS MODULE IS DEPRECATED AND SHOULD NOT BE EXTENDED
 * 
 * ARCHITECTURAL DECISION (2024):
 * The system now uses LLM-FIRST architecture for language understanding.
 * The LLM (via semantic-extractor.ts and intent-classifier.ts) is the 
 * PRIMARY source of intent and symptom extraction.
 * 
 * This module is kept ONLY for:
 * 1. Backward compatibility with existing code paths
 * 2. Offline fallback scenarios
 * 3. Symbol enum definitions (CanonicalSymptomSymbol, etc.)
 * 
 * DO NOT:
 * - Add new language keywords to the MARATHI_SYMPTOM_MAP or HINDI_SYMPTOM_MAP
 * - Use this as the primary extraction mechanism
 * - Extend the keyword dictionaries for "coverage"
 * 
 * Instead, ALL language understanding should flow through:
 * semantic-extractor.ts → intent-classifier.ts → intent-resolver.ts
 * 
 * The LLM understands ANY language without hardcoded dictionaries.
 * 
 * PRINCIPLES (still valid for the symbol enums):
 * 1. English-only symbolic core - all output symbols are English enums
 * 2. Symbol coverage tracking - reports what % of input was mapped
 * 3. Aggregated confidence - independent of intent confidence
 * 4. Deterministic mapping - same input always produces same symbols
 * 
 * @version 3.0.0 - Deprecated keyword dictionaries, LLM-first architecture
 * @deprecated Use semantic-extractor.ts for language understanding
 */

export const LANGUAGE_INDUCTION_VERSION = '3.0.0';

// ============================================================================
// CANONICAL SYMBOL ENUMS (English-only core)
// ============================================================================

export enum CanonicalSymptomSymbol {
  // Leaf symptoms
  LEAF_YELLOWING = 'LEAF_YELLOWING',
  LEAF_BROWNING = 'LEAF_BROWNING',
  LEAF_CURLING = 'LEAF_CURLING',
  LEAF_WILTING = 'LEAF_WILTING',
  LEAF_SPOTS = 'LEAF_SPOTS',
  LEAF_HOLES = 'LEAF_HOLES',
  LEAF_DRYING = 'LEAF_DRYING',
  LEAF_DROP = 'LEAF_DROP',
  
  // Stem symptoms
  STEM_BORER_DAMAGE = 'STEM_BORER_DAMAGE',
  STEM_BREAKAGE = 'STEM_BREAKAGE',
  STEM_DISCOLORATION = 'STEM_DISCOLORATION',
  DEAD_HEART = 'DEAD_HEART',
  
  // Root symptoms
  ROOT_ROT = 'ROOT_ROT',
  ROOT_DAMAGE = 'ROOT_DAMAGE',
  
  // Pest observations
  SMALL_INSECTS_VISIBLE = 'SMALL_INSECTS_VISIBLE',
  FLYING_INSECTS_VISIBLE = 'FLYING_INSECTS_VISIBLE',
  CRAWLING_INSECTS_VISIBLE = 'CRAWLING_INSECTS_VISIBLE',
  JUMPING_INSECTS_VISIBLE = 'JUMPING_INSECTS_VISIBLE',
  CATERPILLAR_VISIBLE = 'CATERPILLAR_VISIBLE',
  BORER_VISIBLE = 'BORER_VISIBLE',
  EGGS_VISIBLE = 'EGGS_VISIBLE',
  
  // Disease symptoms
  FUNGAL_GROWTH = 'FUNGAL_GROWTH',
  POWDERY_COATING = 'POWDERY_COATING',
  STICKY_SUBSTANCE = 'STICKY_SUBSTANCE',
  HONEYDEW = 'HONEYDEW',
  SOOTY_MOLD = 'SOOTY_MOLD',
  
  // Plant-wide symptoms
  STUNTED_GROWTH = 'STUNTED_GROWTH',
  PLANT_DEATH = 'PLANT_DEATH',
  PATCHY_DEATH = 'PATCHY_DEATH',
  POOR_GERMINATION = 'POOR_GERMINATION',
  
  // Environmental stress
  WATER_STRESS = 'WATER_STRESS',
  NUTRIENT_DEFICIENCY = 'NUTRIENT_DEFICIENCY',
  HEAT_STRESS = 'HEAT_STRESS',
  
  // Fruit/Yield symptoms
  FRUIT_DAMAGE = 'FRUIT_DAMAGE',
  POOR_YIELD = 'POOR_YIELD',
  
  // Unknown/ambiguous
  UNKNOWN_SYMPTOM = 'UNKNOWN_SYMPTOM'
}

export enum CanonicalCropSymbol {
  SUGARCANE = 'SUGARCANE',
  COTTON = 'COTTON',
  SOYBEAN = 'SOYBEAN',
  RICE = 'RICE',
  WHEAT = 'WHEAT',
  MAIZE = 'MAIZE',
  TOMATO = 'TOMATO',
  ONION = 'ONION',
  GRAPE = 'GRAPE',
  POMEGRANATE = 'POMEGRANATE',
  BANANA = 'BANANA',
  CHILI = 'CHILI',
  TURMERIC = 'TURMERIC',
  GROUNDNUT = 'GROUNDNUT',
  UNKNOWN_CROP = 'UNKNOWN_CROP'
}

export enum CanonicalAffectedPartSymbol {
  LEAF = 'LEAF',
  STEM = 'STEM',
  ROOT = 'ROOT',
  FRUIT = 'FRUIT',
  FLOWER = 'FLOWER',
  WHOLE_PLANT = 'WHOLE_PLANT',
  UNKNOWN_PART = 'UNKNOWN_PART'
}

export enum CanonicalSeveritySymbol {
  MILD = 'MILD',
  MODERATE = 'MODERATE',
  SEVERE = 'SEVERE',
  CRITICAL = 'CRITICAL',
  UNKNOWN_SEVERITY = 'UNKNOWN_SEVERITY'
}

export enum CanonicalDistributionSymbol {
  LOCALIZED = 'LOCALIZED',
  SCATTERED = 'SCATTERED',
  WIDESPREAD = 'WIDESPREAD',
  UNKNOWN_DISTRIBUTION = 'UNKNOWN_DISTRIBUTION'
}

// ============================================================================
// MULTILINGUAL MAPPING DICTIONARIES
// ============================================================================

interface SymbolMapping {
  symbol: CanonicalSymptomSymbol;
  confidence: number;
}

// Marathi symptom patterns → English symbols
const MARATHI_SYMPTOM_MAP: Record<string, SymbolMapping> = {
  // Leaf symptoms
  'पान पिवळे': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.95 },
  'पिवळी पान': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.95 },
  'पिवळे पडले': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.90 },
  'पिवळसर': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.85 },
  'पान तपकिरी': { symbol: CanonicalSymptomSymbol.LEAF_BROWNING, confidence: 0.95 },
  'पान वाळले': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.95 },
  'पान सुकले': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.95 },
  'पान मुरगळले': { symbol: CanonicalSymptomSymbol.LEAF_CURLING, confidence: 0.95 },
  'पान वाकडे': { symbol: CanonicalSymptomSymbol.LEAF_CURLING, confidence: 0.90 },
  'पानावर डाग': { symbol: CanonicalSymptomSymbol.LEAF_SPOTS, confidence: 0.95 },
  'पानाला छिद्र': { symbol: CanonicalSymptomSymbol.LEAF_HOLES, confidence: 0.95 },
  'पान गळले': { symbol: CanonicalSymptomSymbol.LEAF_DROP, confidence: 0.95 },
  
  // Stem symptoms
  'मधली सुरळी वाळली': { symbol: CanonicalSymptomSymbol.DEAD_HEART, confidence: 0.98 },
  'खोड फुटले': { symbol: CanonicalSymptomSymbol.STEM_BREAKAGE, confidence: 0.95 },
  'खोडात किडा': { symbol: CanonicalSymptomSymbol.STEM_BORER_DAMAGE, confidence: 0.95 },
  'खोड लाल': { symbol: CanonicalSymptomSymbol.STEM_DISCOLORATION, confidence: 0.90 },
  
  // Pest observations
  'किडे दिसतात': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.85 },
  'छोटे किडे': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.90 },
  'पांढरे किडे': { symbol: CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE, confidence: 0.85 },
  'उडणारे किडे': { symbol: CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE, confidence: 0.95 },
  'उड्या मारणारे': { symbol: CanonicalSymptomSymbol.JUMPING_INSECTS_VISIBLE, confidence: 0.95 },
  'अळी': { symbol: CanonicalSymptomSymbol.CATERPILLAR_VISIBLE, confidence: 0.95 },
  'खोडकिडा': { symbol: CanonicalSymptomSymbol.BORER_VISIBLE, confidence: 0.95 },
  
  // Disease symptoms
  'पांढरी भुरी': { symbol: CanonicalSymptomSymbol.POWDERY_COATING, confidence: 0.95 },
  'बुरशी': { symbol: CanonicalSymptomSymbol.FUNGAL_GROWTH, confidence: 0.90 },
  'चिकट पाणी': { symbol: CanonicalSymptomSymbol.HONEYDEW, confidence: 0.95 },
  'काळी बुरशी': { symbol: CanonicalSymptomSymbol.SOOTY_MOLD, confidence: 0.95 },
  
  // Plant-wide
  'रोप मेले': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },
  'झाड मेले': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },
  'वाढ थांबली': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
  'ठिकठिकाणी मेले': { symbol: CanonicalSymptomSymbol.PATCHY_DEATH, confidence: 0.95 },
  'उगवण कमी': { symbol: CanonicalSymptomSymbol.POOR_GERMINATION, confidence: 0.90 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Additional Marathi growth patterns (common farmer phrases)
  // These patterns were causing symptoms=[] and blocking the symbolic brain
  // ═══════════════════════════════════════════════════════════════════════════
  'वाढ होत नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.95 },  // "Growth is not happening" - MOST COMMON
  'वाढ नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },       // "No growth"
  'वाढत नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },      // "Not growing"
  'वाढ कमी': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },        // "Less growth"
  'वाढ मंद': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },        // "Slow growth"
  'मंद वाढ': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },        // "Slow growth" (reversed)
  'खुंटलेली वाढ': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },   // "Stunted growth"
  'वाढ खुंटली': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },     // "Growth stunted"
  'वाढ झाली नाही': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 }, // "Growth did not happen"
  'वाढ रखडली': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },     // "Growth stalled"
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P0 FIX: Critical single-word symptom patterns (common farmer phrases)
  // These were causing symptoms=[] when farmer uses short descriptions
  // Example: "नवीन लावण केलेला ऊस काही ठिकाणी वाळला" → missed "वाळला" (dried)
  // ═══════════════════════════════════════════════════════════════════════════
  'वाळला': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },           // "dried" - CRITICAL single word
  'वाळले': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },           // "dried" (plural)
  'वाळलेला': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },         // "dried" (adj)
  'वाळून': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.85 },           // "while drying"
  'सुकला': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },           // "dried up"
  'सुकले': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },           // "dried up" (plural)
  'सुकलेला': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.90 },         // "dried" (adj)
  'मेला': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },            // "died" - CRITICAL
  'मेले': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },            // "died" (plural)
  'मेलेला': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },          // "dead" (adj)
  'मरतोय': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.90 },           // "is dying"
  'खराब': { symbol: CanonicalSymptomSymbol.UNKNOWN_SYMPTOM, confidence: 0.70 },        // "damaged/bad" - general issue
  'समस्या': { symbol: CanonicalSymptomSymbol.UNKNOWN_SYMPTOM, confidence: 0.65 },      // "problem" - general issue
  'रोग': { symbol: CanonicalSymptomSymbol.FUNGAL_GROWTH, confidence: 0.75 },           // "disease"
  'किड': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.85 },   // "pest"
  'किडा': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.90 },  // "pest/insect"
  'कीड': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.85 },   // "pest" variant
  'पिवळे': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.90 },        // "yellow"
  'पिवळा': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.90 },        // "yellow" (singular)
  'पिवळी': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.90 },        // "yellow" (feminine)
  'तपकिरी': { symbol: CanonicalSymptomSymbol.LEAF_BROWNING, confidence: 0.90 },        // "brown"
  'काळा': { symbol: CanonicalSymptomSymbol.SOOTY_MOLD, confidence: 0.80 },             // "black"
  'काळे': { symbol: CanonicalSymptomSymbol.SOOTY_MOLD, confidence: 0.80 },             // "black" (plural)
  'कुजला': { symbol: CanonicalSymptomSymbol.ROOT_ROT, confidence: 0.90 },              // "rotted"
  'कुजले': { symbol: CanonicalSymptomSymbol.ROOT_ROT, confidence: 0.90 },              // "rotted" (plural)
  'उगवले नाही': { symbol: CanonicalSymptomSymbol.POOR_GERMINATION, confidence: 0.95 }, // "did not germinate"
  'उगवत नाही': { symbol: CanonicalSymptomSymbol.POOR_GERMINATION, confidence: 0.90 },  // "not germinating"
};

// Hindi symptom patterns → English symbols
const HINDI_SYMPTOM_MAP: Record<string, SymbolMapping> = {
  // Leaf symptoms
  'पत्ता पीला': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.95 },
  'पत्ते पीले': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.95 },
  'पीलापन': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.85 },
  'पत्ता सूखा': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.95 },
  'पत्ते सूख गए': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.95 },
  'पत्ता मुड़ा': { symbol: CanonicalSymptomSymbol.LEAF_CURLING, confidence: 0.95 },
  'पत्तों पर धब्बे': { symbol: CanonicalSymptomSymbol.LEAF_SPOTS, confidence: 0.95 },
  'पत्ते में छेद': { symbol: CanonicalSymptomSymbol.LEAF_HOLES, confidence: 0.95 },
  
  // Stem symptoms
  'तना टूट गया': { symbol: CanonicalSymptomSymbol.STEM_BREAKAGE, confidence: 0.95 },
  'तने में कीड़ा': { symbol: CanonicalSymptomSymbol.STEM_BORER_DAMAGE, confidence: 0.95 },
  'गोभ सूख गई': { symbol: CanonicalSymptomSymbol.DEAD_HEART, confidence: 0.98 },
  
  // Pest observations
  'कीड़े दिख रहे': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.85 },
  'छोटे कीड़े': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.90 },
  'सफेद कीड़े': { symbol: CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE, confidence: 0.85 },
  'उड़ने वाले': { symbol: CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE, confidence: 0.95 },
  'इल्ली': { symbol: CanonicalSymptomSymbol.CATERPILLAR_VISIBLE, confidence: 0.95 },
  
  // Disease symptoms
  'सफेद पाउडर': { symbol: CanonicalSymptomSymbol.POWDERY_COATING, confidence: 0.95 },
  'फफूंद': { symbol: CanonicalSymptomSymbol.FUNGAL_GROWTH, confidence: 0.90 },
  'चिपचिपा': { symbol: CanonicalSymptomSymbol.HONEYDEW, confidence: 0.90 },
  
  // Plant-wide
  'पौधा मर गया': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },
  'बढ़वार रुक गई': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL FIX: Additional Hindi growth patterns (common farmer phrases)
  // Ensures Hindi growth queries also trigger symbolic brain correctly
  // ═══════════════════════════════════════════════════════════════════════════
  'बढ़ नहीं रहा': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },   // "Not growing"
  'वृद्धि नहीं': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },    // "No growth"
  'धीमी वृद्धि': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },    // "Slow growth"
  'बढ़वार रुकी': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },    // "Growth stopped"
  'बढ़त नहीं': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },      // "No growth"
  'बढ़ नहीं रहा है': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 }, // "Is not growing"
  'विकास नहीं': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.85 },     // "No development"
  'विकास रुक गया': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 }, // "Development stopped"
};

// English symptom patterns → English symbols
const ENGLISH_SYMPTOM_MAP: Record<string, SymbolMapping> = {
  // Leaf symptoms
  'yellow leaves': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.95 },
  'yellowing': { symbol: CanonicalSymptomSymbol.LEAF_YELLOWING, confidence: 0.90 },
  'brown leaves': { symbol: CanonicalSymptomSymbol.LEAF_BROWNING, confidence: 0.95 },
  'browning': { symbol: CanonicalSymptomSymbol.LEAF_BROWNING, confidence: 0.90 },
  'dry leaves': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.95 },
  'drying': { symbol: CanonicalSymptomSymbol.LEAF_DRYING, confidence: 0.85 },
  'curled leaves': { symbol: CanonicalSymptomSymbol.LEAF_CURLING, confidence: 0.95 },
  'curling': { symbol: CanonicalSymptomSymbol.LEAF_CURLING, confidence: 0.90 },
  'leaf spots': { symbol: CanonicalSymptomSymbol.LEAF_SPOTS, confidence: 0.95 },
  'spots on leaves': { symbol: CanonicalSymptomSymbol.LEAF_SPOTS, confidence: 0.95 },
  'holes in leaves': { symbol: CanonicalSymptomSymbol.LEAF_HOLES, confidence: 0.95 },
  'leaf drop': { symbol: CanonicalSymptomSymbol.LEAF_DROP, confidence: 0.95 },
  'wilting': { symbol: CanonicalSymptomSymbol.LEAF_WILTING, confidence: 0.90 },
  
  // Pest observations
  'insects': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.80 },
  'small insects': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.90 },
  'bugs': { symbol: CanonicalSymptomSymbol.SMALL_INSECTS_VISIBLE, confidence: 0.80 },
  'flying insects': { symbol: CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE, confidence: 0.95 },
  'whitefly': { symbol: CanonicalSymptomSymbol.FLYING_INSECTS_VISIBLE, confidence: 0.95 },
  'jumping': { symbol: CanonicalSymptomSymbol.JUMPING_INSECTS_VISIBLE, confidence: 0.90 },
  'caterpillar': { symbol: CanonicalSymptomSymbol.CATERPILLAR_VISIBLE, confidence: 0.95 },
  'borer': { symbol: CanonicalSymptomSymbol.BORER_VISIBLE, confidence: 0.95 },
  'stem borer': { symbol: CanonicalSymptomSymbol.STEM_BORER_DAMAGE, confidence: 0.95 },
  
  // Stem symptoms
  'dead heart': { symbol: CanonicalSymptomSymbol.DEAD_HEART, confidence: 0.98 },
  'stem damage': { symbol: CanonicalSymptomSymbol.STEM_BORER_DAMAGE, confidence: 0.90 },
  
  // Disease symptoms
  'powdery mildew': { symbol: CanonicalSymptomSymbol.POWDERY_COATING, confidence: 0.95 },
  'white powder': { symbol: CanonicalSymptomSymbol.POWDERY_COATING, confidence: 0.90 },
  'fungus': { symbol: CanonicalSymptomSymbol.FUNGAL_GROWTH, confidence: 0.90 },
  'sticky': { symbol: CanonicalSymptomSymbol.HONEYDEW, confidence: 0.85 },
  'honeydew': { symbol: CanonicalSymptomSymbol.HONEYDEW, confidence: 0.95 },
  'sooty mold': { symbol: CanonicalSymptomSymbol.SOOTY_MOLD, confidence: 0.95 },
  
  // Plant-wide
  'plant dead': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.95 },
  'dying': { symbol: CanonicalSymptomSymbol.PLANT_DEATH, confidence: 0.85 },
  'stunted': { symbol: CanonicalSymptomSymbol.STUNTED_GROWTH, confidence: 0.90 },
  'poor germination': { symbol: CanonicalSymptomSymbol.POOR_GERMINATION, confidence: 0.95 },
};

// Crop mappings (multilingual → English)
const CROP_MAP: Record<string, CanonicalCropSymbol> = {
  // Marathi
  'ऊस': CanonicalCropSymbol.SUGARCANE,
  'उस': CanonicalCropSymbol.SUGARCANE,
  'कापूस': CanonicalCropSymbol.COTTON,
  'सोयाबीन': CanonicalCropSymbol.SOYBEAN,
  'भात': CanonicalCropSymbol.RICE,
  'तांदूळ': CanonicalCropSymbol.RICE,
  'गहू': CanonicalCropSymbol.WHEAT,
  'मका': CanonicalCropSymbol.MAIZE,
  'टोमॅटो': CanonicalCropSymbol.TOMATO,
  'कांदा': CanonicalCropSymbol.ONION,
  'द्राक्ष': CanonicalCropSymbol.GRAPE,
  'डाळिंब': CanonicalCropSymbol.POMEGRANATE,
  'केळी': CanonicalCropSymbol.BANANA,
  'मिरची': CanonicalCropSymbol.CHILI,
  'हळद': CanonicalCropSymbol.TURMERIC,
  'भुईमूग': CanonicalCropSymbol.GROUNDNUT,
  
  // Hindi
  'गन्ना': CanonicalCropSymbol.SUGARCANE,
  'कपास': CanonicalCropSymbol.COTTON,
  'धान': CanonicalCropSymbol.RICE,
  'चावल': CanonicalCropSymbol.RICE,
  'गेहूं': CanonicalCropSymbol.WHEAT,
  'मक्का': CanonicalCropSymbol.MAIZE,
  'टमाटर': CanonicalCropSymbol.TOMATO,
  'प्याज': CanonicalCropSymbol.ONION,
  'अंगूर': CanonicalCropSymbol.GRAPE,
  'अनार': CanonicalCropSymbol.POMEGRANATE,
  'केला': CanonicalCropSymbol.BANANA,
  'मिर्च': CanonicalCropSymbol.CHILI,
  'हल्दी': CanonicalCropSymbol.TURMERIC,
  'मूंगफली': CanonicalCropSymbol.GROUNDNUT,
  
  // English
  'sugarcane': CanonicalCropSymbol.SUGARCANE,
  'sugar cane': CanonicalCropSymbol.SUGARCANE,
  'cotton': CanonicalCropSymbol.COTTON,
  'soybean': CanonicalCropSymbol.SOYBEAN,
  'soya': CanonicalCropSymbol.SOYBEAN,
  'rice': CanonicalCropSymbol.RICE,
  'paddy': CanonicalCropSymbol.RICE,
  'wheat': CanonicalCropSymbol.WHEAT,
  'maize': CanonicalCropSymbol.MAIZE,
  'corn': CanonicalCropSymbol.MAIZE,
  'tomato': CanonicalCropSymbol.TOMATO,
  'onion': CanonicalCropSymbol.ONION,
  'grape': CanonicalCropSymbol.GRAPE,
  'pomegranate': CanonicalCropSymbol.POMEGRANATE,
  'banana': CanonicalCropSymbol.BANANA,
  'chili': CanonicalCropSymbol.CHILI,
  'chilli': CanonicalCropSymbol.CHILI,
  'turmeric': CanonicalCropSymbol.TURMERIC,
  'groundnut': CanonicalCropSymbol.GROUNDNUT,
  'peanut': CanonicalCropSymbol.GROUNDNUT,
};

// Affected part mappings
const AFFECTED_PART_MAP: Record<string, CanonicalAffectedPartSymbol> = {
  // Marathi
  'पान': CanonicalAffectedPartSymbol.LEAF,
  'पानावर': CanonicalAffectedPartSymbol.LEAF,
  'खोड': CanonicalAffectedPartSymbol.STEM,
  'खोडात': CanonicalAffectedPartSymbol.STEM,
  'मूळ': CanonicalAffectedPartSymbol.ROOT,
  'फळ': CanonicalAffectedPartSymbol.FRUIT,
  'फूल': CanonicalAffectedPartSymbol.FLOWER,
  'झाड': CanonicalAffectedPartSymbol.WHOLE_PLANT,
  'रोप': CanonicalAffectedPartSymbol.WHOLE_PLANT,
  
  // Hindi
  'पत्ता': CanonicalAffectedPartSymbol.LEAF,
  'पत्ते': CanonicalAffectedPartSymbol.LEAF,
  'तना': CanonicalAffectedPartSymbol.STEM,
  'जड़': CanonicalAffectedPartSymbol.ROOT,
  'फल': CanonicalAffectedPartSymbol.FRUIT,
  'पौधा': CanonicalAffectedPartSymbol.WHOLE_PLANT,
  
  // English
  'leaf': CanonicalAffectedPartSymbol.LEAF,
  'leaves': CanonicalAffectedPartSymbol.LEAF,
  'stem': CanonicalAffectedPartSymbol.STEM,
  'stalk': CanonicalAffectedPartSymbol.STEM,
  'root': CanonicalAffectedPartSymbol.ROOT,
  'roots': CanonicalAffectedPartSymbol.ROOT,
  'fruit': CanonicalAffectedPartSymbol.FRUIT,
  'flower': CanonicalAffectedPartSymbol.FLOWER,
  'plant': CanonicalAffectedPartSymbol.WHOLE_PLANT,
};

// Severity mappings
const SEVERITY_MAP: Record<string, CanonicalSeveritySymbol> = {
  // Marathi
  'थोडे': CanonicalSeveritySymbol.MILD,
  'जास्त': CanonicalSeveritySymbol.SEVERE,
  'खूप': CanonicalSeveritySymbol.SEVERE,
  'पूर्ण': CanonicalSeveritySymbol.CRITICAL,
  'सर्व': CanonicalSeveritySymbol.CRITICAL,
  
  // Hindi
  'थोड़ा': CanonicalSeveritySymbol.MILD,
  'ज्यादा': CanonicalSeveritySymbol.SEVERE,
  'बहुत': CanonicalSeveritySymbol.SEVERE,
  'पूरा': CanonicalSeveritySymbol.CRITICAL,
  'सब': CanonicalSeveritySymbol.CRITICAL,
  
  // English
  'little': CanonicalSeveritySymbol.MILD,
  'slight': CanonicalSeveritySymbol.MILD,
  'some': CanonicalSeveritySymbol.MODERATE,
  'severe': CanonicalSeveritySymbol.SEVERE,
  'heavy': CanonicalSeveritySymbol.SEVERE,
  'complete': CanonicalSeveritySymbol.CRITICAL,
  'all': CanonicalSeveritySymbol.CRITICAL,
  'total': CanonicalSeveritySymbol.CRITICAL,
};

// Distribution mappings
const DISTRIBUTION_MAP: Record<string, CanonicalDistributionSymbol> = {
  // Marathi
  'एका जागी': CanonicalDistributionSymbol.LOCALIZED,
  'ठिकठिकाणी': CanonicalDistributionSymbol.SCATTERED,
  'सर्वत्र': CanonicalDistributionSymbol.WIDESPREAD,
  
  // Hindi
  'एक जगह': CanonicalDistributionSymbol.LOCALIZED,
  'जगह जगह': CanonicalDistributionSymbol.SCATTERED,
  'हर जगह': CanonicalDistributionSymbol.WIDESPREAD,
  
  // English
  'one spot': CanonicalDistributionSymbol.LOCALIZED,
  'localized': CanonicalDistributionSymbol.LOCALIZED,
  'patchy': CanonicalDistributionSymbol.SCATTERED,
  'scattered': CanonicalDistributionSymbol.SCATTERED,
  'everywhere': CanonicalDistributionSymbol.WIDESPREAD,
  'widespread': CanonicalDistributionSymbol.WIDESPREAD,
};

// ============================================================================
// OUTPUT INTERFACES
// ============================================================================

export interface InducedSymbol {
  symbol: string;
  category: 'SYMPTOM' | 'CROP' | 'AFFECTED_PART' | 'SEVERITY' | 'DISTRIBUTION';
  confidence: number;
  source_text: string;
  source_language: 'mr' | 'hi' | 'en';
}

export interface LanguageInductionResult {
  version: string;
  
  // Primary outputs - always English symbols
  symptoms: InducedSymbol[];
  crop: InducedSymbol | null;
  affected_parts: InducedSymbol[];
  severity: InducedSymbol | null;
  distribution: InducedSymbol | null;
  
  // Coverage metrics
  symbol_coverage: number; // 0-1: % of input words mapped to symbols
  total_symbols_extracted: number;
  unmapped_tokens: string[];
  
  // Aggregated confidence (independent of intent)
  aggregated_confidence: number; // Weighted average of all symbol confidences
  min_confidence: number;
  max_confidence: number;
  
  // Metadata
  detected_language: 'mr' | 'hi' | 'en';
  original_text: string;
  processing_time_ms: number;
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

function detectLanguage(text: string): 'mr' | 'hi' | 'en' {
  const marathiPattern = /[\u0900-\u097F]/; // Devanagari
  const hindiCommonWords = ['है', 'हैं', 'और', 'का', 'की', 'को', 'में', 'से', 'पर'];
  const marathiCommonWords = ['आहे', 'आहेत', 'आणि', 'चे', 'ची', 'ला', 'मध्ये', 'वर'];
  
  if (!marathiPattern.test(text)) {
    return 'en';
  }
  
  const marathiScore = marathiCommonWords.filter(w => text.includes(w)).length;
  const hindiScore = hindiCommonWords.filter(w => text.includes(w)).length;
  
  return marathiScore >= hindiScore ? 'mr' : 'hi';
}

// ============================================================================
// CORE INDUCTION FUNCTION
// ============================================================================

export function induceCanonicalSymbols(farmerInput: string): LanguageInductionResult {
  const startTime = Date.now();
  const normalizedText = farmerInput.toLowerCase().trim();
  const detectedLanguage = detectLanguage(normalizedText);
  
  const symptoms: InducedSymbol[] = [];
  const affectedParts: InducedSymbol[] = [];
  let crop: InducedSymbol | null = null;
  let severity: InducedSymbol | null = null;
  let distribution: InducedSymbol | null = null;
  const mappedPatterns: Set<string> = new Set();
  
  // Select appropriate symptom map based on language
  const symptomMaps = [MARATHI_SYMPTOM_MAP, HINDI_SYMPTOM_MAP, ENGLISH_SYMPTOM_MAP];
  
  // Extract symptoms from all language maps (handles code-switching)
  for (const symptomMap of symptomMaps) {
    for (const [pattern, mapping] of Object.entries(symptomMap)) {
      if (normalizedText.includes(pattern.toLowerCase())) {
        // Avoid duplicate symbols
        if (!symptoms.some(s => s.symbol === mapping.symbol)) {
          symptoms.push({
            symbol: mapping.symbol,
            category: 'SYMPTOM',
            confidence: mapping.confidence,
            source_text: pattern,
            source_language: detectLanguage(pattern),
          });
          mappedPatterns.add(pattern.toLowerCase());
        }
      }
    }
  }
  
  // Extract crop
  for (const [pattern, cropSymbol] of Object.entries(CROP_MAP)) {
    if (normalizedText.includes(pattern.toLowerCase())) {
      crop = {
        symbol: cropSymbol,
        category: 'CROP',
        confidence: 0.95,
        source_text: pattern,
        source_language: detectLanguage(pattern),
      };
      mappedPatterns.add(pattern.toLowerCase());
      break;
    }
  }
  
  // Extract affected parts
  for (const [pattern, partSymbol] of Object.entries(AFFECTED_PART_MAP)) {
    if (normalizedText.includes(pattern.toLowerCase())) {
      if (!affectedParts.some(p => p.symbol === partSymbol)) {
        affectedParts.push({
          symbol: partSymbol,
          category: 'AFFECTED_PART',
          confidence: 0.90,
          source_text: pattern,
          source_language: detectLanguage(pattern),
        });
        mappedPatterns.add(pattern.toLowerCase());
      }
    }
  }
  
  // Extract severity
  for (const [pattern, severitySymbol] of Object.entries(SEVERITY_MAP)) {
    if (normalizedText.includes(pattern.toLowerCase())) {
      severity = {
        symbol: severitySymbol,
        category: 'SEVERITY',
        confidence: 0.85,
        source_text: pattern,
        source_language: detectLanguage(pattern),
      };
      mappedPatterns.add(pattern.toLowerCase());
      break;
    }
  }
  
  // Extract distribution
  for (const [pattern, distSymbol] of Object.entries(DISTRIBUTION_MAP)) {
    if (normalizedText.includes(pattern.toLowerCase())) {
      distribution = {
        symbol: distSymbol,
        category: 'DISTRIBUTION',
        confidence: 0.85,
        source_text: pattern,
        source_language: detectLanguage(pattern),
      };
      mappedPatterns.add(pattern.toLowerCase());
      break;
    }
  }
  
  // Calculate symbol coverage
  const allTokens = normalizedText.split(/[\s,।\.]+/).filter(t => t.length > 1);
  const unmappedTokens = allTokens.filter(token => {
    return !Array.from(mappedPatterns).some(pattern => 
      pattern.includes(token) || token.includes(pattern)
    );
  });
  const symbolCoverage = allTokens.length > 0 
    ? (allTokens.length - unmappedTokens.length) / allTokens.length 
    : 0;
  
  // Calculate aggregated confidence
  const allConfidences: number[] = [
    ...symptoms.map(s => s.confidence),
    ...(crop ? [crop.confidence] : []),
    ...affectedParts.map(p => p.confidence),
    ...(severity ? [severity.confidence] : []),
    ...(distribution ? [distribution.confidence] : []),
  ];
  
  const totalSymbols = allConfidences.length;
  const aggregatedConfidence = totalSymbols > 0
    ? allConfidences.reduce((sum, c) => sum + c, 0) / totalSymbols
    : 0;
  const minConfidence = totalSymbols > 0 ? Math.min(...allConfidences) : 0;
  const maxConfidence = totalSymbols > 0 ? Math.max(...allConfidences) : 0;
  
  return {
    version: LANGUAGE_INDUCTION_VERSION,
    symptoms,
    crop,
    affected_parts: affectedParts,
    severity,
    distribution,
    symbol_coverage: Math.round(symbolCoverage * 100) / 100,
    total_symbols_extracted: totalSymbols,
    unmapped_tokens: unmappedTokens.slice(0, 10), // Limit for logging
    aggregated_confidence: Math.round(aggregatedConfidence * 100) / 100,
    min_confidence: Math.round(minConfidence * 100) / 100,
    max_confidence: Math.round(maxConfidence * 100) / 100,
    detected_language: detectedLanguage,
    original_text: farmerInput,
    processing_time_ms: Date.now() - startTime,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get all symptom symbols as a simple string array for rule matching
 */
export function getSymptomSymbolsForRules(result: LanguageInductionResult): string[] {
  return result.symptoms.map(s => s.symbol);
}

/**
 * Get canonical crop code for rule matching
 */
export function getCropSymbolForRules(result: LanguageInductionResult): string {
  return result.crop?.symbol || 'UNKNOWN_CROP';
}

/**
 * Check if induction result has sufficient coverage for rule evaluation
 * 
 * SSOT PRINCIPLE: Symbolic brain requires SYMPTOMS, not just crop detection.
 * A crop symbol alone (e.g., SUGARCANE) is NOT sufficient for rule matching.
 * We must have at least 1 symptom to run the symbolic decision brain.
 */
export function hasMinimumCoverage(
  result: LanguageInductionResult, 
  minCoverage: number = 0.3
): boolean {
  // CRITICAL FIX: Require at least 1 symptom for symbolic brain activation
  const hasSymptoms = result.symptoms.length >= 1;
  const hasSufficientCoverage = result.symbol_coverage >= minCoverage;
  const hasMultipleSymbols = result.total_symbols_extracted >= 2;
  
  // Must have symptoms AND (coverage OR multiple symbols)
  return hasSymptoms && (hasSufficientCoverage || hasMultipleSymbols);
}

/**
 * Get a summary for logging
 */
export function getInductionSummary(result: LanguageInductionResult): string {
  const symptoms = result.symptoms.map(s => s.symbol).join(', ') || 'none';
  const crop = result.crop?.symbol || 'unknown';
  const parts = result.affected_parts.map(p => p.symbol).join(', ') || 'unknown';
  
  return `[LI v${result.version}] Lang: ${result.detected_language} | ` +
    `Symptoms: ${symptoms} | Crop: ${crop} | Parts: ${parts} | ` +
    `Coverage: ${(result.symbol_coverage * 100).toFixed(0)}% | ` +
    `Confidence: ${(result.aggregated_confidence * 100).toFixed(0)}%`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  induceCanonicalSymbols,
  getSymptomSymbolsForRules,
  getCropSymbolForRules,
  hasMinimumCoverage,
  getInductionSummary,
  LANGUAGE_INDUCTION_VERSION,
  CanonicalSymptomSymbol,
  CanonicalCropSymbol,
  CanonicalAffectedPartSymbol,
  CanonicalSeveritySymbol,
  CanonicalDistributionSymbol,
};
