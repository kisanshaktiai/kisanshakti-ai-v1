/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CANONICAL OBSERVATION KEYS LOADER
 * Load observation keys from decision_rules table by crop and stage
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Dynamically load canonical observation keys from the database to generate
 * context-aware clarification options. This replaces hardcoded templates
 * with database-driven, crop-stage specific observation keys.
 * 
 * USAGE:
 * - Called by clarification-renderer.ts to get stage-appropriate options
 * - Returns trilingual labels for each observation key
 * - Filters by crop_code and stage_applicable
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ObservationKey } from '../decision/observation-ontology.ts';

export const CANONICAL_LOADER_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ObservationKeyWithLabels {
  key: string;
  label_en: string;
  label_hi: string;
  label_mr: string;
  category: string;
  stage: string[];
  visual_priority: number;
}

export interface LoadedObservationKeys {
  keys: ObservationKeyWithLabels[];
  crop_code: string;
  stage: string;
  total_count: number;
  loaded_from: 'DATABASE' | 'CACHE' | 'FALLBACK';
}

// ═══════════════════════════════════════════════════════════════════════════
// TRILINGUAL LABELS FOR CANONICAL OBSERVATION KEYS
// These are the farmer-friendly translations shown in UI
// ═══════════════════════════════════════════════════════════════════════════

const OBSERVATION_KEY_LABELS: Record<string, { en: string; hi: string; mr: string; category: string; priority: number }> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // A. ESTABLISHMENT & GERMINATION
  // ═══════════════════════════════════════════════════════════════════════════
  'SEED_NOT_GERMINATED': { en: 'Seeds not germinating', hi: 'बीज अंकुरित नहीं हो रहे', mr: 'बी उगवत नाही', category: 'germination', priority: 1 },
  'POOR_GERMINATION_PERCENT': { en: 'Poor germination rate', hi: 'कम अंकुरण दर', mr: 'कमी उगवण', category: 'germination', priority: 2 },
  'GAPS_IN_FIELD': { en: 'Gaps in the field', hi: 'खेत में गैप', mr: 'शेतात गॅप/रिकाम्या जागा', category: 'germination', priority: 1 },
  'SEEDLING_DIED': { en: 'Seedlings died', hi: 'पौधे मर गए', mr: 'रोपे मेले', category: 'germination', priority: 1 },
  'SEEDLING_WILTED': { en: 'Seedlings wilted', hi: 'पौधे मुरझाए', mr: 'रोपे कोमेजली', category: 'germination', priority: 2 },
  'SETT_EASILY_PULLED_OUT': { en: 'Sett pulls out easily', hi: 'गड्डी आसानी से निकलती है', mr: 'बेणे सहज उपटते', category: 'germination', priority: 1 },
  'ROOTS_SOFT_OR_BLACK': { en: 'Roots soft or black', hi: 'जड़ें मुलायम या काली', mr: 'मुळे मऊ किंवा काळी', category: 'germination', priority: 2 },
  'ROOTS_ROTTED': { en: 'Roots are rotted', hi: 'जड़ें सड़ गई', mr: 'मुळे सडली', category: 'germination', priority: 2 },
  'SEED_DECAYED': { en: 'Seed decayed', hi: 'बीज सड़ गया', mr: 'बी सडले', category: 'germination', priority: 2 },
  'SEEDLING_YELLOW': { en: 'Seedlings turning yellow', hi: 'पौधे पीले हो रहे', mr: 'रोपे पिवळी होत आहेत', category: 'germination', priority: 2 },
  'SEEDLING_STUNTED': { en: 'Seedlings stunted', hi: 'पौधे बौने', mr: 'रोपे खुंटलेली', category: 'germination', priority: 2 },
  'PATCHY_EMERGENCE': { en: 'Patchy emergence', hi: 'असमान उगाव', mr: 'ठिपके ठिपके उगवण', category: 'germination', priority: 2 },
  'IRREGULAR_PLANT_STAND': { en: 'Irregular plant stand', hi: 'असमान पौधों का खड़ा होना', mr: 'अनियमित झाडांची उभारणी', category: 'germination', priority: 3 },
  'SOIL_CRUSTING_VISIBLE': { en: 'Soil crusting visible', hi: 'मिट्टी पर पपड़ी', mr: 'मातीवर कठोर थर', category: 'germination', priority: 3 },
  'WATER_LOGGING_AT_BASE': { en: 'Water logging at base', hi: 'जड़ के पास पानी जमा', mr: 'बुडाशी पाणी साचलेले', category: 'germination', priority: 2 },
  'DRY_SOIL_AT_GERMINATION': { en: 'Dry soil at germination', hi: 'अंकुरण पर सूखी मिट्टी', mr: 'उगवणीला माती कोरडी', category: 'germination', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // B. VEGETATIVE GROWTH
  // ═══════════════════════════════════════════════════════════════════════════
  'SLOW_GROWTH': { en: 'Slow growth', hi: 'धीमी वृद्धि', mr: 'संथ वाढ', category: 'vegetative', priority: 2 },
  'STUNTED_PLANTS': { en: 'Stunted plants', hi: 'बौने पौधे', mr: 'खुंटलेली झाडे', category: 'vegetative', priority: 1 },
  'SHORT_INTERNODES': { en: 'Short internodes', hi: 'छोटे इंटरनोड', mr: 'लहान कांडी', category: 'vegetative', priority: 3 },
  'EXCESSIVE_TILLERS': { en: 'Excessive tillers', hi: 'अधिक कल्ले', mr: 'जास्त फुटवे', category: 'vegetative', priority: 3 },
  'POOR_TILLERING': { en: 'Poor tillering', hi: 'कम कल्ले', mr: 'कमी फुटवे', category: 'vegetative', priority: 2 },
  'WEAK_SHOOTS': { en: 'Weak shoots', hi: 'कमजोर शाखाएं', mr: 'कमकुवत कोंब', category: 'vegetative', priority: 2 },
  'THIN_STEMS': { en: 'Thin stems', hi: 'पतले तने', mr: 'पातळ खोड', category: 'vegetative', priority: 2 },
  'LUSH_VEGETATIVE_GROWTH': { en: 'Excess leafy growth', hi: 'अत्यधिक पत्तियां', mr: 'अति पानांची वाढ', category: 'vegetative', priority: 3 },
  'UNEQUAL_PLANT_HEIGHT': { en: 'Unequal plant height', hi: 'असमान ऊंचाई', mr: 'असमान उंची', category: 'vegetative', priority: 3 },
  'PLANTS_LODGING': { en: 'Plants falling/lodging', hi: 'पौधे गिर रहे', mr: 'झाडे पडत आहेत', category: 'vegetative', priority: 1 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // C. LEAF-BASED OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  'LEAF_YELLOWING': { en: 'Leaves turning yellow', hi: 'पत्ते पीले हो रहे', mr: 'पाने पिवळी होत आहेत', category: 'leaf', priority: 1 },
  'INTERVEINAL_CHLOROSIS': { en: 'Yellow between veins', hi: 'नसों के बीच पीलापन', mr: 'शिरांमध्ये पिवळेपणा', category: 'leaf', priority: 2 },
  'LEAF_PALE_GREEN': { en: 'Pale green leaves', hi: 'हल्के हरे पत्ते', mr: 'फिकट हिरवी पाने', category: 'leaf', priority: 2 },
  'LEAF_REDDENING': { en: 'Leaves turning red', hi: 'पत्ते लाल हो रहे', mr: 'पाने लाल होत आहेत', category: 'leaf', priority: 2 },
  'LEAF_BROWN_TIPS': { en: 'Brown tips on leaves', hi: 'पत्तों के सिरे भूरे', mr: 'पानांची टोके तपकिरी', category: 'leaf', priority: 2 },
  'LEAF_SCORCHING': { en: 'Leaves scorched/burnt', hi: 'पत्ते जले हुए', mr: 'पाने करपलेली', category: 'leaf', priority: 1 },
  'LEAF_DRYING': { en: 'Leaves drying', hi: 'पत्ते सूख रहे', mr: 'पाने सुकत आहेत', category: 'leaf', priority: 1 },
  'LEAF_WILTING': { en: 'Leaves wilting', hi: 'पत्ते मुरझा रहे', mr: 'पाने कोमेजत आहेत', category: 'leaf', priority: 1 },
  'LEAF_ROLLING': { en: 'Leaves rolling', hi: 'पत्ते मुड़ रहे', mr: 'पाने गुंडाळत आहेत', category: 'leaf', priority: 2 },
  'LEAF_CURLING': { en: 'Leaves curling', hi: 'पत्ते मुड़े हुए', mr: 'पाने वळलेली', category: 'leaf', priority: 1 },
  'LEAF_CRINKLING': { en: 'Leaves crinkling', hi: 'पत्ते सिकुड़े', mr: 'पाने चुरगळलेली', category: 'leaf', priority: 2 },
  'LEAF_DISTORTION': { en: 'Leaves distorted', hi: 'पत्ते विकृत', mr: 'पाने विकृत', category: 'leaf', priority: 2 },
  'LEAF_TWISTING': { en: 'Leaves twisting', hi: 'पत्ते मुड़े', mr: 'पाने वळलेली', category: 'leaf', priority: 2 },
  'LEAF_NARROWING': { en: 'Leaves narrow', hi: 'पत्ते संकरे', mr: 'पाने अरुंद', category: 'leaf', priority: 3 },
  'LEAF_DROOPING': { en: 'Leaves drooping', hi: 'पत्ते झुके', mr: 'पाने लोंबकळणारी', category: 'leaf', priority: 2 },
  'LEAF_SPOTS_PRESENT': { en: 'Spots on leaves', hi: 'पत्तों पर धब्बे', mr: 'पानांवर डाग', category: 'leaf', priority: 1 },
  'LEAF_STRIPES_PRESENT': { en: 'Stripes on leaves', hi: 'पत्तों पर धारियां', mr: 'पानांवर पट्टे', category: 'leaf', priority: 2 },
  'LEAF_BLIGHTED': { en: 'Leaves blighted', hi: 'पत्ते झुलसे', mr: 'पाने करपलेली', category: 'leaf', priority: 1 },
  'LEAF_BLAST_SYMPTOMS': { en: 'Blast spots on leaves', hi: 'पत्तों पर ब्लास्ट', mr: 'पानांवर करपा', category: 'leaf', priority: 1 },
  'LEAF_MOSAIC_PATTERN': { en: 'Mosaic pattern on leaves', hi: 'मोज़ेक पैटर्न', mr: 'मोझेक नमुना', category: 'leaf', priority: 2 },
  'LEAF_PUSTULES': { en: 'Pustules on leaves', hi: 'पत्तों पर फुंसी', mr: 'पानांवर गाठी', category: 'leaf', priority: 2 },
  'LEAF_WHITE_PATCHES': { en: 'White patches on leaves', hi: 'पत्तों पर सफेद धब्बे', mr: 'पानांवर पांढरे डाग', category: 'leaf', priority: 2 },
  'LEAF_BLACK_PATCHES': { en: 'Black patches on leaves', hi: 'पत्तों पर काले धब्बे', mr: 'पानांवर काळे डाग', category: 'leaf', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // D. STEM / SHOOT / CROWN OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  'DEAD_HEART_PRESENT': { en: 'Dead heart (dried central shoot)', hi: 'गोभ सूख गई', mr: 'सुरळी वाळली (Dead Heart)', category: 'stem', priority: 1 },
  'CENTRAL_SHOOT_DRY': { en: 'Central shoot dry', hi: 'बीच की टहनी सूखी', mr: 'मध्य कोंब सुकलेला', category: 'stem', priority: 1 },
  'STEM_BORING_MARKS': { en: 'Boring marks on stem', hi: 'तने पर छेद के निशान', mr: 'खोडावर पोखरण्याचे खुण', category: 'stem', priority: 1 },
  'STEM_HOLES_VISIBLE': { en: 'Holes visible in stem', hi: 'तने में छेद दिखते', mr: 'खोडात छिद्र दिसतात', category: 'stem', priority: 1 },
  'STEM_SPLITTING': { en: 'Stem splitting', hi: 'तना फट रहा', mr: 'खोड फाटत आहे', category: 'stem', priority: 2 },
  'STEM_SOFTENING': { en: 'Stem soft/mushy', hi: 'तना मुलायम', mr: 'खोड मऊ', category: 'stem', priority: 2 },
  'STEM_ROT_PRESENT': { en: 'Stem rot present', hi: 'तने में सड़न', mr: 'खोड सडलेले', category: 'stem', priority: 1 },
  'CROWN_ROT_PRESENT': { en: 'Crown rot', hi: 'ताज में सड़न', mr: 'मुकुट सड', category: 'stem', priority: 2 },
  'BASE_DISCOLORATION': { en: 'Discoloration at base', hi: 'आधार पर रंग बदलाव', mr: 'बुडाशी रंग बदल', category: 'stem', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // E. ROOT OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  'ROOT_BROWNING': { en: 'Roots browning', hi: 'जड़ें भूरी', mr: 'मुळे तपकिरी', category: 'root', priority: 2 },
  'ROOT_BLACKENING': { en: 'Roots blackening', hi: 'जड़ें काली', mr: 'मुळे काळी', category: 'root', priority: 1 },
  'ROOT_SOFT': { en: 'Roots soft', hi: 'जड़ें मुलायम', mr: 'मुळे मऊ', category: 'root', priority: 2 },
  'ROOT_DRY': { en: 'Roots dry', hi: 'जड़ें सूखी', mr: 'मुळे कोरडी', category: 'root', priority: 2 },
  'ROOT_POOR_DEVELOPMENT': { en: 'Poor root development', hi: 'जड़ों का कम विकास', mr: 'मुळांची कमी वाढ', category: 'root', priority: 2 },
  'ROOT_GALLS_PRESENT': { en: 'Root galls/knots', hi: 'जड़ों पर गांठ', mr: 'मुळांवर गाठी', category: 'root', priority: 2 },
  'ROOT_NEMATODE_SIGNS': { en: 'Nematode damage signs', hi: 'सूत्रकृमि के निशान', mr: 'सूत्रकृमी नुकसान', category: 'root', priority: 2 },
  'ROOT_ROTTED': { en: 'Roots rotted', hi: 'जड़ें सड़ी', mr: 'मुळे सडली', category: 'root', priority: 1 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // F. INSECT / PEST OBSERVATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  'INSECTS_VISIBLE': { en: 'Insects visible', hi: 'कीड़े दिख रहे', mr: 'किडे दिसत आहेत', category: 'pest', priority: 1 },
  'INSECTS_FLYING': { en: 'Flying insects', hi: 'उड़ते कीड़े', mr: 'उडणारे किडे', category: 'pest', priority: 2 },
  'INSECTS_CRAWLING': { en: 'Crawling insects', hi: 'रेंगते कीड़े', mr: 'रांगणारे किडे', category: 'pest', priority: 2 },
  'INSECTS_JUMPING': { en: 'Jumping insects', hi: 'कूदते कीड़े', mr: 'उडी मारणारे किडे', category: 'pest', priority: 2 },
  'LARVAE_PRESENT': { en: 'Larvae/caterpillars present', hi: 'इल्ली/लार्वा दिख रहे', mr: 'अळ्या दिसत आहेत', category: 'pest', priority: 1 },
  'EGGS_PRESENT': { en: 'Eggs visible', hi: 'अंडे दिख रहे', mr: 'अंडी दिसत आहेत', category: 'pest', priority: 2 },
  'SMALL_INSECTS': { en: 'Small/tiny insects', hi: 'छोटे कीड़े', mr: 'छोटे किडे', category: 'pest', priority: 1 },
  'MEDIUM_INSECTS': { en: 'Medium sized insects', hi: 'मध्यम आकार के कीड़े', mr: 'मध्यम आकाराचे किडे', category: 'pest', priority: 2 },
  'LARGE_INSECTS': { en: 'Large insects', hi: 'बड़े कीड़े', mr: 'मोठे किडे', category: 'pest', priority: 2 },
  'GREEN_INSECTS': { en: 'Green colored insects', hi: 'हरे कीड़े', mr: 'हिरवे किडे', category: 'pest', priority: 2 },
  'BLACK_INSECTS': { en: 'Black colored insects', hi: 'काले कीड़े', mr: 'काळे किडे', category: 'pest', priority: 2 },
  'BROWN_INSECTS': { en: 'Brown colored insects', hi: 'भूरे कीड़े', mr: 'तपकिरी किडे', category: 'pest', priority: 2 },
  'WHITE_INSECTS': { en: 'White insects/woolly', hi: 'सफेद/रुई वाले कीड़े', mr: 'पांढरे/कापसासारखे किडे', category: 'pest', priority: 1 },
  'LEAF_CHEWING': { en: 'Leaves being chewed', hi: 'पत्ते खाए जा रहे', mr: 'पाने खाल्ली जात आहेत', category: 'pest', priority: 1 },
  'LEAF_SKELETONIZATION': { en: 'Leaf skeletonization', hi: 'पत्तों का कंकाल बनना', mr: 'पानांचा सांगाडा', category: 'pest', priority: 2 },
  'LEAF_MINING': { en: 'Mining in leaves', hi: 'पत्तों में सुरंग', mr: 'पानात भुयार', category: 'pest', priority: 2 },
  'LEAF_WEBBING': { en: 'Webbing on leaves', hi: 'पत्तों पर जाला', mr: 'पानांवर जाळे', category: 'pest', priority: 2 },
  'STEM_BORING': { en: 'Stem boring', hi: 'तने में छेद', mr: 'खोड पोखरणे', category: 'pest', priority: 1 },
  'ROOT_FEEDING': { en: 'Root feeding damage', hi: 'जड़ों का नुकसान', mr: 'मुळांचे नुकसान', category: 'pest', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // G. DISEASE-SPECIFIC VISUAL SIGNS
  // ═══════════════════════════════════════════════════════════════════════════
  'FUNGAL_GROWTH_VISIBLE': { en: 'Fungal growth visible', hi: 'फफूंद दिख रहा', mr: 'बुरशी दिसत आहे', category: 'disease', priority: 1 },
  'WHITE_POWDERY_GROWTH': { en: 'White powdery growth', hi: 'सफेद पाउडर जैसा', mr: 'पांढरी भुकटी', category: 'disease', priority: 1 },
  'GREY_MOLD_PRESENT': { en: 'Grey mold present', hi: 'भूरी फफूंद', mr: 'करडी बुरशी', category: 'disease', priority: 2 },
  'BLACK_SOOTY_MOLD': { en: 'Black sooty mold', hi: 'काली कालिख जैसी फफूंद', mr: 'काळी काजळी बुरशी', category: 'disease', priority: 2 },
  'BACTERIAL_OOZE': { en: 'Bacterial ooze visible', hi: 'बैक्टीरियल ऊज', mr: 'जिवाणू स्राव', category: 'disease', priority: 2 },
  'WATER_SOAKED_LESIONS': { en: 'Water soaked lesions', hi: 'पानी भरे घाव', mr: 'पाणी भरलेले व्रण', category: 'disease', priority: 2 },
  'FOUL_SMELL_PRESENT': { en: 'Foul smell from plant', hi: 'बदबू आ रही', mr: 'दुर्गंध येत आहे', category: 'disease', priority: 1 },
  'RUST_PUSTULES': { en: 'Rust pustules', hi: 'जंग के दाने', mr: 'गंज गाठी', category: 'disease', priority: 2 },
  'WILT_SYMPTOM': { en: 'Sudden wilting', hi: 'अचानक मुरझाना', mr: 'अचानक कोमेजणे', category: 'disease', priority: 1 },
  'GUMMOSIS': { en: 'Gum oozing from stem', hi: 'तने से गोंद निकलना', mr: 'खोडातून डिंक', category: 'disease', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // H. NUTRIENT DEFICIENCY INDICATORS
  // ═══════════════════════════════════════════════════════════════════════════
  'UNIFORM_YELLOWING_OLDER_LEAVES': { en: 'Older leaves turning yellow', hi: 'पुराने पत्ते पीले', mr: 'जुनी पाने पिवळी', category: 'nutrient', priority: 1 },
  'UNIFORM_YELLOWING_YOUNG_LEAVES': { en: 'Young leaves turning yellow', hi: 'नए पत्ते पीले', mr: 'नवीन पाने पिवळी', category: 'nutrient', priority: 1 },
  'PURPLISH_LEAVES': { en: 'Purplish leaves', hi: 'जामुनी पत्ते', mr: 'जांभळी पाने', category: 'nutrient', priority: 2 },
  'LEAF_MARGIN_BURN': { en: 'Leaf edges burnt', hi: 'पत्तों के किनारे जले', mr: 'पानांच्या कडा करपलेल्या', category: 'nutrient', priority: 2 },
  'TIP_BURN': { en: 'Leaf tips burnt', hi: 'पत्तों के सिरे जले', mr: 'पानांची टोके करपलेली', category: 'nutrient', priority: 2 },
  'SMALL_LEAVES': { en: 'Leaves smaller than normal', hi: 'पत्ते छोटे', mr: 'पाने लहान', category: 'nutrient', priority: 3 },
  'THICK_LEAVES': { en: 'Leaves thick/leathery', hi: 'पत्ते मोटे', mr: 'पाने जाड', category: 'nutrient', priority: 3 },
  'BRITTLE_LEAVES': { en: 'Leaves brittle/break easily', hi: 'पत्ते भुरभुरे', mr: 'पाने ठिसूळ', category: 'nutrient', priority: 3 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // I-J. FLOWER / FRUIT STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  'POOR_FLOWERING': { en: 'Poor/less flowering', hi: 'कम फूल आ रहे', mr: 'कमी फुले', category: 'reproductive', priority: 2 },
  'FLOWER_DROP': { en: 'Flowers dropping', hi: 'फूल गिर रहे', mr: 'फुले गळत आहेत', category: 'reproductive', priority: 1 },
  'BUD_DROP': { en: 'Buds dropping', hi: 'कलियां गिर रही', mr: 'कळ्या गळत आहेत', category: 'reproductive', priority: 1 },
  'DELAYED_FLOWERING': { en: 'Delayed flowering', hi: 'देर से फूल आना', mr: 'उशिरा फुलणे', category: 'reproductive', priority: 3 },
  'IRREGULAR_FLOWERING': { en: 'Irregular flowering', hi: 'असमान फूल आना', mr: 'अनियमित फुलणे', category: 'reproductive', priority: 3 },
  'POOR_FRUIT_SET': { en: 'Poor fruit setting', hi: 'फल कम लग रहे', mr: 'फळे कमी लागत', category: 'reproductive', priority: 2 },
  'FRUIT_DROP': { en: 'Fruits dropping', hi: 'फल गिर रहे', mr: 'फळे गळत आहेत', category: 'reproductive', priority: 1 },
  'FRUIT_DEFORMED': { en: 'Fruits deformed', hi: 'फल टेढ़े-मेढ़े', mr: 'फळे विकृत', category: 'reproductive', priority: 2 },
  'FRUIT_CRACKING': { en: 'Fruits cracking', hi: 'फल फट रहे', mr: 'फळे फुटत आहेत', category: 'reproductive', priority: 2 },
  'FRUIT_ROT': { en: 'Fruits rotting', hi: 'फल सड़ रहे', mr: 'फळे सडत आहेत', category: 'reproductive', priority: 1 },
  'SMALL_FRUITS': { en: 'Fruits smaller than normal', hi: 'फल छोटे', mr: 'फळे लहान', category: 'reproductive', priority: 2 },
  'EMPTY_GRAINS': { en: 'Empty grains', hi: 'खाली दाने', mr: 'रिकामे दाणे', category: 'reproductive', priority: 1 },
  'PARTIALLY_FILLED_GRAINS': { en: 'Partially filled grains', hi: 'आधे भरे दाने', mr: 'अर्धवट भरलेले दाणे', category: 'reproductive', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // K. FIELD-LEVEL PATTERNS
  // ═══════════════════════════════════════════════════════════════════════════
  'PATCHY_DAMAGE': { en: 'Patchy/scattered damage', hi: 'जगह-जगह नुकसान', mr: 'ठिकठिकाणी नुकसान', category: 'field_pattern', priority: 1 },
  'EDGE_DAMAGE_ONLY': { en: 'Only edges affected', hi: 'सिर्फ किनारे प्रभावित', mr: 'फक्त कडेला नुकसान', category: 'field_pattern', priority: 2 },
  'LOW_LYING_AREA_AFFECTED': { en: 'Low lying areas affected', hi: 'निचले क्षेत्र प्रभावित', mr: 'खालचा भाग प्रभावित', category: 'field_pattern', priority: 2 },
  'ENTIRE_FIELD_AFFECTED': { en: 'Entire field affected', hi: 'पूरा खेत प्रभावित', mr: 'संपूर्ण शेत प्रभावित', category: 'field_pattern', priority: 1 },
  'LOCALIZED_SPOTS': { en: 'Localized spots only', hi: 'कुछ ही जगहों पर', mr: 'काही ठिकाणीच', category: 'field_pattern', priority: 2 },
  'DIRECTIONAL_SPREAD': { en: 'Spreading in one direction', hi: 'एक दिशा में फैल रहा', mr: 'एका दिशेने पसरत आहे', category: 'field_pattern', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // L. WATER & SOIL CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════
  'FIELD_WATERLOGGED': { en: 'Field waterlogged', hi: 'खेत में पानी भरा', mr: 'शेतात पाणी साचले', category: 'soil_water', priority: 1 },
  'SOIL_TOO_DRY': { en: 'Soil too dry', hi: 'मिट्टी बहुत सूखी', mr: 'माती खूप कोरडी', category: 'soil_water', priority: 1 },
  'CRACKS_IN_SOIL': { en: 'Cracks in soil', hi: 'मिट्टी में दरारें', mr: 'मातीत भेगा', category: 'soil_water', priority: 2 },
  'SALT_CRUST_VISIBLE': { en: 'Salt crust visible', hi: 'नमक की परत', mr: 'मीठाचा थर', category: 'soil_water', priority: 2 },
  'WHITE_SOIL_DEPOSITS': { en: 'White deposits on soil', hi: 'मिट्टी पर सफेद जमाव', mr: 'मातीवर पांढरे थर', category: 'soil_water', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // M. WEATHER / EVENT BASED
  // ═══════════════════════════════════════════════════════════════════════════
  'DAMAGE_AFTER_RAIN': { en: 'Damage appeared after rain', hi: 'बारिश के बाद नुकसान', mr: 'पावसानंतर नुकसान', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_FROST': { en: 'Damage after frost', hi: 'पाले के बाद नुकसान', mr: 'दवानंतर नुकसान', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_HEAT': { en: 'Damage after heat wave', hi: 'गर्मी के बाद नुकसान', mr: 'उष्णतेनंतर नुकसान', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_WIND': { en: 'Damage after wind/storm', hi: 'तूफान के बाद नुकसान', mr: 'वादळानंतर नुकसान', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_HAIL': { en: 'Damage after hail', hi: 'ओलों के बाद नुकसान', mr: 'गारपिटीनंतर नुकसान', category: 'weather', priority: 1 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // N. ADDITIONAL WORLD-CLASS KEYS
  // ═══════════════════════════════════════════════════════════════════════════
  'HONEYDEW_PRESENT': { en: 'Sticky honeydew on leaves', hi: 'पत्तों पर चिपचिपाहट', mr: 'पानांवर चिकटपणा', category: 'pest', priority: 1 },
  'SOOTY_MOLD_ON_HONEYDEW': { en: 'Black sooty mold on honeydew', hi: 'चिपचिपाहट पर काली फफूंद', mr: 'चिकट भागावर काळी बुरशी', category: 'pest', priority: 2 },
  'FRASS_VISIBLE': { en: 'Frass/droppings visible', hi: 'कीड़े की मल दिखाई', mr: 'किड्यांची विष्ठा दिसते', category: 'pest', priority: 2 },
  'SILK_WEBBING_VISIBLE': { en: 'Silk webbing visible', hi: 'रेशम का जाला दिखाई', mr: 'रेशीम जाळे दिसते', category: 'pest', priority: 2 },
  'ANTS_PRESENT': { en: 'Ants present on plants', hi: 'पौधों पर चींटियां', mr: 'झाडांवर मुंग्या', category: 'pest', priority: 3 },
  'TUNNELS_IN_SOIL': { en: 'Tunnels in soil', hi: 'मिट्टी में सुरंग', mr: 'मातीत बिळे', category: 'pest', priority: 2 },
  'MUD_TUBES_PRESENT': { en: 'Mud tubes present (termite)', hi: 'मिट्टी की नलियां (दीमक)', mr: 'मातीच्या नळ्या (वाळवी)', category: 'pest', priority: 1 }
};

// ═══════════════════════════════════════════════════════════════════════════
// STAGE-WISE KEY PRIORITIES
// Which keys to show first based on growth stage
// ═══════════════════════════════════════════════════════════════════════════

const STAGE_KEY_PRIORITIES: Record<string, string[]> = {
  germination: [
    'GAPS_IN_FIELD', 'SEEDLING_DIED', 'SETT_EASILY_PULLED_OUT', 'POOR_GERMINATION_PERCENT',
    'SEEDLING_WILTED', 'MUD_TUBES_PRESENT', 'ROOTS_ROTTED', 'SOIL_TOO_DRY',
    'WATER_LOGGING_AT_BASE', 'SEEDLING_YELLOW', 'TUNNELS_IN_SOIL'
  ],
  
  tillering: [
    'DEAD_HEART_PRESENT', 'CENTRAL_SHOOT_DRY', 'POOR_TILLERING', 'LEAF_YELLOWING',
    'STEM_BORING_MARKS', 'INSECTS_VISIBLE', 'LARVAE_PRESENT', 'STUNTED_PLANTS',
    'LEAF_REDDENING', 'WEAK_SHOOTS'
  ],
  
  grand_growth: [
    'STEM_HOLES_VISIBLE', 'STEM_BORING_MARKS', 'WHITE_INSECTS', 'HONEYDEW_PRESENT',
    'LEAF_YELLOWING', 'INTERVEINAL_CHLOROSIS', 'WHITE_POWDERY_GROWTH',
    'PLANTS_LODGING', 'SHORT_INTERNODES', 'LUSH_VEGETATIVE_GROWTH'
  ],
  
  maturity: [
    'STEM_ROT_PRESENT', 'FOUL_SMELL_PRESENT', 'STEM_SOFTENING', 'PLANTS_LODGING',
    'STEM_HOLES_VISIBLE', 'LEAF_DRYING', 'FRUIT_ROT', 'FRUIT_DEFORMED'
  ],
  
  vegetative: [
    'LEAF_YELLOWING', 'LEAF_CURLING', 'INSECTS_VISIBLE', 'LEAF_SPOTS_PRESENT',
    'LEAF_CHEWING', 'STUNTED_PLANTS', 'SLOW_GROWTH', 'SMALL_INSECTS'
  ],
  
  flowering: [
    'FLOWER_DROP', 'BUD_DROP', 'POOR_FLOWERING', 'INSECTS_VISIBLE',
    'DELAYED_FLOWERING', 'LEAF_YELLOWING'
  ],
  
  boll_development: [
    'FRUIT_DROP', 'FRUIT_ROT', 'FRUIT_DEFORMED', 'POOR_FRUIT_SET',
    'INSECTS_VISIBLE', 'LARVAE_PRESENT'
  ],
  
  all: [
    'INSECTS_VISIBLE', 'LEAF_YELLOWING', 'LEAF_WILTING', 'LEAF_SPOTS_PRESENT',
    'PATCHY_DAMAGE', 'ENTIRE_FIELD_AFFECTED', 'DAMAGE_AFTER_RAIN'
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get observation key with trilingual labels
 */
export function getObservationKeyLabel(
  key: string,
  language: 'en' | 'hi' | 'mr'
): string {
  const labels = OBSERVATION_KEY_LABELS[key];
  if (!labels) {
    console.warn(`[CanonicalLoader] No label found for key: ${key}`);
    return key; // Return key itself as fallback
  }
  return labels[language];
}

/**
 * Get all labels for an observation key
 */
export function getObservationKeyLabels(key: string): ObservationKeyWithLabels | null {
  const labels = OBSERVATION_KEY_LABELS[key];
  if (!labels) return null;
  
  return {
    key,
    label_en: labels.en,
    label_hi: labels.hi,
    label_mr: labels.mr,
    category: labels.category,
    stage: [], // Will be populated from DB
    visual_priority: labels.priority
  };
}

/**
 * Get observation keys for a specific stage (ordered by priority)
 */
export function getStageObservationKeys(
  stage: string,
  language: 'en' | 'hi' | 'mr',
  maxKeys: number = 4
): { key: string; label: string }[] {
  const normalizedStage = stage.toLowerCase().replace(/[\s-]/g, '_');
  const priorityKeys = STAGE_KEY_PRIORITIES[normalizedStage] || STAGE_KEY_PRIORITIES.all;
  
  const result: { key: string; label: string }[] = [];
  
  for (const key of priorityKeys) {
    if (result.length >= maxKeys) break;
    
    const labels = OBSERVATION_KEY_LABELS[key];
    if (labels) {
      result.push({
        key,
        label: labels[language]
      });
    }
  }
  
  return result;
}

/**
 * Get observation keys by category
 */
export function getCategoryObservationKeys(
  category: string,
  language: 'en' | 'hi' | 'mr',
  maxKeys: number = 4
): { key: string; label: string }[] {
  const result: { key: string; label: string }[] = [];
  
  for (const [key, labels] of Object.entries(OBSERVATION_KEY_LABELS)) {
    if (result.length >= maxKeys) break;
    
    if (labels.category === category) {
      result.push({
        key,
        label: labels[language]
      });
    }
  }
  
  // Sort by priority
  result.sort((a, b) => {
    const priorityA = OBSERVATION_KEY_LABELS[a.key]?.priority || 99;
    const priorityB = OBSERVATION_KEY_LABELS[b.key]?.priority || 99;
    return priorityA - priorityB;
  });
  
  return result.slice(0, maxKeys);
}

/**
 * Load observation keys from database by crop and stage
 * Returns keys that exist in decision_rules.observable_characteristics
 */
export async function loadObservationKeysFromDB(
  cropCode: string,
  stage: string
): Promise<LoadedObservationKeys> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[CanonicalLoader] Missing Supabase credentials, using fallback');
      return getFallbackKeys(cropCode, stage);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Query decision_rules for observable_characteristics matching crop and stage.
    // NOTE: We support different casing/formatting in DB (TILLERING vs tillering).
    const crop = cropCode.toLowerCase();
    const normalizeStage = (s: string) => s.trim().replace(/[\s-]/g, '_');
    const stageVariants = Array.from(
      new Set(
        [
          stage,
          stage.toUpperCase(),
          stage.toLowerCase(),
          normalizeStage(stage.toUpperCase()),
          normalizeStage(stage.toLowerCase())
        ].filter(Boolean)
      )
    );

    let data: any[] | null = null;
    let lastError: any = null;

    for (const st of stageVariants) {
      const res = await supabase
        .from('decision_rules')
        .select('observable_characteristics')
        .in('crop_code', [crop, 'all'])
        .contains('stage_applicable', [st])
        .eq('is_active', true)
        .not('observable_characteristics', 'is', null);

      if (res.error) {
        lastError = res.error;
        continue;
      }

      data = res.data || [];
      if (data.length > 0) break;
    }

    if (lastError) {
      console.error('[CanonicalLoader] DB query error:', lastError);
      return getFallbackKeys(cropCode, stage);
    }

    if (!data || data.length === 0) {
      console.warn(`[CanonicalLoader] No matching rules for ${cropCode}/${stage} (variants=${stageVariants.join(',')})`);
      return getFallbackKeys(cropCode, stage);
    }
    
    // Extract unique keys from all matching rules
    const uniqueKeys = new Set<string>();
    for (const rule of data || []) {
      const chars = rule.observable_characteristics;
      if (Array.isArray(chars)) {
        for (const key of chars) {
          if (typeof key === 'string') {
            uniqueKeys.add(key);
          }
        }
      }
    }
    
    // Convert to ObservationKeyWithLabels
    const keys: ObservationKeyWithLabels[] = [];
    for (const key of uniqueKeys) {
      const labels = getObservationKeyLabels(key);
      if (labels) {
        labels.stage = [stage];
        keys.push(labels);
      }
    }
    
    // Sort by priority
    keys.sort((a, b) => a.visual_priority - b.visual_priority);
    
    console.log(`[CanonicalLoader] Loaded ${keys.length} keys for ${cropCode}/${stage} from DB`);
    
    return {
      keys,
      crop_code: cropCode,
      stage,
      total_count: keys.length,
      loaded_from: 'DATABASE'
    };
    
  } catch (err) {
    console.error('[CanonicalLoader] Error loading from DB:', err);
    return getFallbackKeys(cropCode, stage);
  }
}

/**
 * Fallback function when DB is unavailable
 */
function getFallbackKeys(cropCode: string, stage: string): LoadedObservationKeys {
  const stageKeys = getStageObservationKeys(stage, 'en', 20);
  
  const keys: ObservationKeyWithLabels[] = stageKeys.map(k => {
    const labels = getObservationKeyLabels(k.key);
    return labels || {
      key: k.key,
      label_en: k.label,
      label_hi: k.label,
      label_mr: k.label,
      category: 'unknown',
      stage: [stage],
      visual_priority: 99
    };
  });
  
  return {
    keys,
    crop_code: cropCode,
    stage,
    total_count: keys.length,
    loaded_from: 'FALLBACK'
  };
}

/**
 * Get top clarification options for a given context
 * This is the main function used by clarification-renderer.ts
 */
export function getClarificationOptions(
  cropCode: string,
  stage: string,
  language: 'en' | 'hi' | 'mr',
  category?: string,
  maxOptions: number = 3
): { key: string; label: string }[] {
  // If category specified, use category-based keys
  if (category) {
    return getCategoryObservationKeys(category, language, maxOptions);
  }
  
  // Otherwise use stage-based keys
  return getStageObservationKeys(stage, language, maxOptions);
}

export default {
  getObservationKeyLabel,
  getObservationKeyLabels,
  getStageObservationKeys,
  getCategoryObservationKeys,
  loadObservationKeysFromDB,
  getClarificationOptions,
  OBSERVATION_KEY_LABELS,
  STAGE_KEY_PRIORITIES,
  CANONICAL_LOADER_VERSION
};
