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
 
import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { ObservationKey } from '../decision/observation-ontology.ts';
import { loadObservationLabels } from '../i18n/observation-label-loader.ts';

export const CANONICAL_LOADER_VERSION = '2.0.0'; // v2: DB-driven labels, language-agnostic

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ObservationKeyWithLabels {
  key: string;
  label_en: string;
  label_hi: string;
  label_mr: string;
  /** Language-resolved label (set by DB query at runtime) */
  label: string;
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
  // Labels describe WHAT FARMER SEES (visual symptoms), NOT technical names
  // ═══════════════════════════════════════════════════════════════════════════
  'SEED_NOT_GERMINATED': { en: 'Seeds not sprouting from soil', hi: 'बीज मिट्टी से नहीं उग रहे', mr: 'बी मातीतून उगवत नाही', category: 'germination', priority: 1 },
  'POOR_GERMINATION_PERCENT': { en: 'Very few plants came up', hi: 'बहुत कम पौधे निकले', mr: 'फार कमी झाडे उगवली', category: 'germination', priority: 2 },
  'GAPS_IN_FIELD': { en: 'Empty patches where plants should be', hi: 'कुछ जगह पौधे नहीं उगे, खाली जगह दिखती है', mr: 'काही ठिकाणी झाडे नाहीत, रिकाम्या जागा दिसतात', category: 'germination', priority: 1 },
  'SEEDLING_DIED': { en: 'Young plants have died', hi: 'छोटे पौधे मर गए', mr: 'लहान रोपे मेली', category: 'germination', priority: 1 },
  'SEEDLING_WILTED': { en: 'Young plants drooping / wilted', hi: 'छोटे पौधे मुरझाए / लटक रहे', mr: 'लहान रोपे कोमेजली / लोंबकळत आहेत', category: 'germination', priority: 2 },
  'SETT_EASILY_PULLED_OUT': { en: 'Plant pulls out easily from soil', hi: 'पौधा आसानी से मिट्टी से निकल जाता है', mr: 'झाड सहज मातीतून उपटते', category: 'germination', priority: 1 },
  'ROOTS_SOFT_OR_BLACK': { en: 'Roots feel soft or look dark/black', hi: 'जड़ें मुलायम या काली दिखती हैं', mr: 'मुळे मऊ वाटतात किंवा काळी दिसतात', category: 'germination', priority: 2 },
  'ROOTS_ROTTED': { en: 'Roots soft, dark and smell bad', hi: 'जड़ें मुलायम, काली और बदबूदार', mr: 'मुळे मऊ, काळी आणि दुर्गंधी येतात', category: 'germination', priority: 2 },
  'SEED_DECAYED': { en: 'Seed/sett has rotted in soil', hi: 'बीज/गड्डी मिट्टी में सड़ गया', mr: 'बी/बेणे मातीत सडले', category: 'germination', priority: 2 },
  'SEEDLING_YELLOW': { en: 'Young plants turning yellow', hi: 'छोटे पौधे पीले पड़ रहे हैं', mr: 'लहान रोपे पिवळी पडत आहेत', category: 'germination', priority: 2 },
  'SEEDLING_STUNTED': { en: 'Young plants not growing, very short', hi: 'छोटे पौधे बढ़ नहीं रहे, बौने हैं', mr: 'लहान रोपे वाढत नाहीत, खुंटलेली आहेत', category: 'germination', priority: 2 },
  'PATCHY_EMERGENCE': { en: 'Plants came up unevenly, some areas empty', hi: 'कुछ जगह पौधे आए कुछ जगह नहीं', mr: 'काही ठिकाणी उगवले काही ठिकाणी नाही', category: 'germination', priority: 2 },
  'IRREGULAR_PLANT_STAND': { en: 'Plants not standing evenly in rows', hi: 'पौधे कतार में समान नहीं खड़े', mr: 'झाडे ओळीत सारखी उभी नाहीत', category: 'germination', priority: 3 },
  'SOIL_CRUSTING_VISIBLE': { en: 'Hard crust formed on top of soil', hi: 'मिट्टी के ऊपर कड़ी पपड़ी बनी', mr: 'मातीवर कठीण थर जमला', category: 'germination', priority: 3 },
  'WATER_LOGGING_AT_BASE': { en: 'Water standing around plant base', hi: 'पौधे के पास पानी जमा है', mr: 'झाडाच्या बुडाशी पाणी साचले', category: 'germination', priority: 2 },
  'DRY_SOIL_AT_GERMINATION': { en: 'Soil is very dry, no moisture', hi: 'मिट्टी बहुत सूखी है, नमी नहीं', mr: 'माती खूप कोरडी, ओलावा नाही', category: 'germination', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // B. VEGETATIVE GROWTH - farmer-friendly visual descriptions
  // ═══════════════════════════════════════════════════════════════════════════
  'SLOW_GROWTH': { en: 'Plants growing very slowly', hi: 'पौधे बहुत धीरे बढ़ रहे हैं', mr: 'झाडे खूप हळू वाढत आहेत', category: 'vegetative', priority: 2 },
  'STUNTED_PLANTS': { en: 'Plants very short, not growing tall', hi: 'पौधे बौने हैं, ऊंचे नहीं बढ़ रहे', mr: 'झाडे खुंटलेली, उंच वाढत नाहीत', category: 'vegetative', priority: 1 },
  'SHORT_INTERNODES': { en: 'Distance between leaf joints very short', hi: 'पत्तियों के बीच का फासला बहुत कम', mr: 'दोन पानांमधले अंतर खूप कमी', category: 'vegetative', priority: 3 },
  'EXCESSIVE_TILLERS': { en: 'Too many side shoots growing', hi: 'बहुत ज्यादा बगल की शाखाएं निकल रही', mr: 'खूप जास्त बाजूचे फुटवे आले', category: 'vegetative', priority: 3 },
  'POOR_TILLERING': { en: 'Very few side shoots/tillers', hi: 'बगल की शाखाएं बहुत कम निकली', mr: 'बाजूचे फुटवे खूप कमी आले', category: 'vegetative', priority: 2 },
  'WEAK_SHOOTS': { en: 'New shoots are thin and weak', hi: 'नई शाखाएं पतली और कमजोर', mr: 'नवीन कोंब पातळ आणि कमकुवत', category: 'vegetative', priority: 2 },
  'THIN_STEMS': { en: 'Stems are very thin', hi: 'तने बहुत पतले हैं', mr: 'खोडे खूप पातळ आहेत', category: 'vegetative', priority: 2 },
  'LUSH_VEGETATIVE_GROWTH': { en: 'Too many leaves, very bushy', hi: 'बहुत ज्यादा पत्तियां, बहुत झाड़ीदार', mr: 'खूप जास्त पाने, खूप झाडोरा', category: 'vegetative', priority: 3 },
  'UNEQUAL_PLANT_HEIGHT': { en: 'Some plants tall, some short', hi: 'कुछ पौधे ऊंचे कुछ नीचे', mr: 'काही झाडे उंच काही खुरटी', category: 'vegetative', priority: 3 },
  'PLANTS_LODGING': { en: 'Plants falling down / leaning on ground', hi: 'पौधे जमीन पर गिर रहे / झुक रहे', mr: 'झाडे जमिनीवर पडत आहेत / वाकत आहेत', category: 'vegetative', priority: 1 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // C. LEAF-BASED OBSERVATIONS - what farmer sees on leaves
  // ═══════════════════════════════════════════════════════════════════════════
  'LEAF_YELLOWING': { en: 'Leaves turning yellow', hi: 'पत्ते पीले पड़ रहे हैं', mr: 'पाने पिवळी पडत आहेत', category: 'leaf', priority: 1 },
  'INTERVEINAL_CHLOROSIS': { en: 'Leaf veins green but area between yellow', hi: 'पत्ते की नसें हरी पर बीच का हिस्सा पीला', mr: 'पानाच्या शिरा हिरव्या पण मधला भाग पिवळा', category: 'leaf', priority: 2 },
  'LEAF_PALE_GREEN': { en: 'Leaves light green, not dark green', hi: 'पत्ते हल्के हरे, गहरे हरे नहीं', mr: 'पाने फिकट हिरवी, गडद हिरवी नाहीत', category: 'leaf', priority: 2 },
  'LEAF_REDDENING': { en: 'Leaves turning red/reddish', hi: 'पत्ते लाल / लालिमा दिख रही', mr: 'पाने लाल होत आहेत / लालसर दिसतात', category: 'leaf', priority: 2 },
  'LEAF_BROWN_TIPS': { en: 'Leaf tips turning brown/dry', hi: 'पत्तों के सिरे भूरे / सूखे', mr: 'पानांची टोके तपकिरी / कोरडी', category: 'leaf', priority: 2 },
  'LEAF_SCORCHING': { en: 'Leaves look burnt/scorched', hi: 'पत्ते जले हुए दिखते हैं', mr: 'पाने करपल्यासारखी दिसतात', category: 'leaf', priority: 1 },
  'LEAF_DRYING': { en: 'Leaves drying up from edges or tips', hi: 'पत्ते किनारों या सिरों से सूख रहे', mr: 'पाने कडांपासून किंवा टोकापासून सुकत आहेत', category: 'leaf', priority: 1 },
  'LEAF_WILTING': { en: 'Leaves drooping down, not firm', hi: 'पत्ते नीचे लटक रहे, कड़े नहीं', mr: 'पाने खाली लोंबत आहेत, ताठ नाहीत', category: 'leaf', priority: 1 },
  'LEAF_ROLLING': { en: 'Leaves rolling inward like a tube', hi: 'पत्ते अंदर की ओर मुड़ रहे, नली जैसे', mr: 'पाने आतमध्ये गुंडाळत आहेत, नळीसारखी', category: 'leaf', priority: 2 },
  'LEAF_CURLING': { en: 'Leaves curling up or down', hi: 'पत्ते ऊपर या नीचे मुड़ गए', mr: 'पाने वर किंवा खाली वळलेली', category: 'leaf', priority: 1 },
  'LEAF_CRINKLING': { en: 'Leaves wrinkled/crumpled', hi: 'पत्ते सिकुड़े / झुर्रीदार', mr: 'पाने चुरगळलेली / सुरकुतलेली', category: 'leaf', priority: 2 },
  'LEAF_DISTORTION': { en: 'Leaves not normal shape, twisted', hi: 'पत्ते सामान्य आकार के नहीं, मुड़े', mr: 'पाने सामान्य आकाराची नाहीत, वाकडी', category: 'leaf', priority: 2 },
  'LEAF_TWISTING': { en: 'Leaves twisting/spiraling', hi: 'पत्ते मुड़ / ऐंठ रहे', mr: 'पाने पिळवटलेली / वळलेली', category: 'leaf', priority: 2 },
  'LEAF_NARROWING': { en: 'Leaves becoming thin/narrow', hi: 'पत्ते पतले / संकरे हो रहे', mr: 'पाने पातळ / अरुंद होत आहेत', category: 'leaf', priority: 3 },
  'LEAF_DROOPING': { en: 'Leaves hanging down loosely', hi: 'पत्ते ढीले लटक रहे', mr: 'पाने सैल लोंबत आहेत', category: 'leaf', priority: 2 },
  'LEAF_SPOTS_PRESENT': { en: 'Spots/marks visible on leaves', hi: 'पत्तों पर धब्बे / निशान दिखते हैं', mr: 'पानांवर डाग / खुणा दिसतात', category: 'leaf', priority: 1 },
  'LEAF_STRIPES_PRESENT': { en: 'Lines/stripes visible on leaves', hi: 'पत्तों पर लंबी धारियां दिखती हैं', mr: 'पानांवर लांब पट्टे दिसतात', category: 'leaf', priority: 2 },
  'LEAF_BLIGHTED': { en: 'Large brown/dark patches on leaves', hi: 'पत्तों पर बड़े भूरे / काले धब्बे', mr: 'पानांवर मोठे तपकिरी / काळे डाग', category: 'leaf', priority: 1 },
  'LEAF_BLAST_SYMPTOMS': { en: 'Eye-shaped spots with grey center on leaves', hi: 'पत्तों पर आंख जैसे भूरे केंद्र वाले धब्बे', mr: 'पानांवर डोळ्यासारखे करड्या मध्यभागाचे डाग', category: 'leaf', priority: 1 },
  'LEAF_MOSAIC_PATTERN': { en: 'Yellow-green mixed pattern on leaves', hi: 'पत्तों पर पीला-हरा मिश्रित पैटर्न', mr: 'पानांवर पिवळा-हिरवा मिश्र नमुना', category: 'leaf', priority: 2 },
  'LEAF_PUSTULES': { en: 'Raised bumps/blisters on leaves', hi: 'पत्तों पर उठे हुए दाने / फुंसी', mr: 'पानांवर उठलेल्या गाठी / फोड', category: 'leaf', priority: 2 },
  'LEAF_WHITE_PATCHES': { en: 'White powdery patches on leaves', hi: 'पत्तों पर सफेद पाउडर जैसे धब्बे', mr: 'पानांवर पांढरे भुकटीसारखे डाग', category: 'leaf', priority: 2 },
  'LEAF_BLACK_PATCHES': { en: 'Black/dark patches on leaves', hi: 'पत्तों पर काले / गहरे धब्बे', mr: 'पानांवर काळे / गडद डाग', category: 'leaf', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // D. STEM / SHOOT / CROWN OBSERVATIONS - visual symptoms only
  // ═══════════════════════════════════════════════════════════════════════════
  'DEAD_HEART_PRESENT': { en: 'Central leaf dried, pulls out when pulled', hi: 'बीच की पत्ती सूखी, खींचने पर निकल जाती है', mr: 'मधली पाने सुकलेली, ओढल्यास बाहेर येतात', category: 'stem', priority: 1 },
  'CENTRAL_SHOOT_DRY': { en: 'The middle/central shoot has dried up', hi: 'बीच का कोंपल / शाखा सूख गई', mr: 'मधला कोंब सुकून गेला', category: 'stem', priority: 1 },
  'STEM_BORING_MARKS': { en: 'Small round holes visible on stem', hi: 'तने पर छोटे गोल छेद दिखते हैं', mr: 'खोडावर लहान गोल छिद्रे दिसतात', category: 'stem', priority: 1 },
  'STEM_HOLES_VISIBLE': { en: 'Holes clearly visible in stem', hi: 'तने में छेद साफ दिखते हैं', mr: 'खोडात छिद्रे स्पष्ट दिसतात', category: 'stem', priority: 1 },
  'STEM_SPLITTING': { en: 'Stem cracking/splitting open', hi: 'तना फट रहा / चीर रहा', mr: 'खोड फाटत आहे / चिरत आहे', category: 'stem', priority: 2 },
  'STEM_SOFTENING': { en: 'Stem feels soft/mushy when pressed', hi: 'तना दबाने पर मुलायम / गीला लगता है', mr: 'खोड दाबल्यास मऊ / ओलसर वाटते', category: 'stem', priority: 2 },
  'STEM_ROT_PRESENT': { en: 'Stem rotting, dark and soft inside', hi: 'तना सड़ रहा, अंदर से काला और नरम', mr: 'खोड सडत आहे, आतून काळे आणि मऊ', category: 'stem', priority: 1 },
  'CROWN_ROT_PRESENT': { en: 'Base of plant rotting at soil level', hi: 'मिट्टी के पास पौधे का आधार सड़ रहा', mr: 'मातीजवळ झाडाचा बुडखा सडत आहे', category: 'stem', priority: 2 },
  'BASE_DISCOLORATION': { en: 'Color change at base of stem', hi: 'तने के नीचे रंग बदला है', mr: 'खोडाच्या बुडाशी रंग बदलला', category: 'stem', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // E. ROOT OBSERVATIONS - what farmer sees when pulling plant
  // ═══════════════════════════════════════════════════════════════════════════
  'ROOT_BROWNING': { en: 'Roots look brown/dark', hi: 'जड़ें भूरी / गहरी दिखती हैं', mr: 'मुळे तपकिरी / गडद दिसतात', category: 'root', priority: 2 },
  'ROOT_BLACKENING': { en: 'Roots turned black', hi: 'जड़ें काली हो गई हैं', mr: 'मुळे काळी पडली आहेत', category: 'root', priority: 1 },
  'ROOT_SOFT': { en: 'Roots soft, break easily', hi: 'जड़ें मुलायम, आसानी से टूटती हैं', mr: 'मुळे मऊ, सहज तुटतात', category: 'root', priority: 2 },
  'ROOT_DRY': { en: 'Roots dried out, no moisture', hi: 'जड़ें सूख गई, नमी नहीं', mr: 'मुळे सुकली, ओलावा नाही', category: 'root', priority: 2 },
  'ROOT_POOR_DEVELOPMENT': { en: 'Very few/small roots', hi: 'जड़ें बहुत कम / छोटी हैं', mr: 'मुळे खूप कमी / लहान आहेत', category: 'root', priority: 2 },
  'ROOT_GALLS_PRESENT': { en: 'Swollen bumps/knots on roots', hi: 'जड़ों पर सूजी हुई गांठें दिखती हैं', mr: 'मुळांवर सुजलेल्या गाठी दिसतात', category: 'root', priority: 2 },
  'ROOT_NEMATODE_SIGNS': { en: 'Roots have knots and plant is weak', hi: 'जड़ों पर गांठ और पौधा कमजोर', mr: 'मुळांवर गाठी आणि झाड कमकुवत', category: 'root', priority: 2 },
  'ROOT_ROTTED': { en: 'Roots soft, dark and smell bad', hi: 'जड़ें मुलायम, काली और बदबूदार', mr: 'मुळे मऊ, काळी आणि दुर्गंधी', category: 'root', priority: 1 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // F. INSECT / PEST OBSERVATIONS - describe what farmer SEES, not pest name
  // ═══════════════════════════════════════════════════════════════════════════
  'INSECTS_VISIBLE': { en: 'Small creatures/insects visible on plant', hi: 'पौधे पर छोटे जीव / कीड़े दिखते हैं', mr: 'झाडावर लहान जीव / किडे दिसतात', category: 'pest', priority: 1 },
  'INSECTS_FLYING': { en: 'Small flying creatures around plants', hi: 'पौधों के आसपास छोटे उड़ने वाले जीव', mr: 'झाडांभोवती लहान उडणारे जीव', category: 'pest', priority: 2 },
  'INSECTS_CRAWLING': { en: 'Creatures crawling on plant', hi: 'पौधे पर रेंगते जीव दिखते हैं', mr: 'झाडावर रांगणारे जीव दिसतात', category: 'pest', priority: 2 },
  'INSECTS_JUMPING': { en: 'Small jumping creatures on leaves', hi: 'पत्तों पर छोटे कूदने वाले जीव', mr: 'पानांवर लहान उड्या मारणारे जीव', category: 'pest', priority: 2 },
  'LARVAE_PRESENT': { en: 'Worm-like creatures visible on/in plant', hi: 'पौधे पर / अंदर सूंडी जैसे जीव दिखते हैं', mr: 'झाडावर / आत अळीसारखे जीव दिसतात', category: 'pest', priority: 1 },
  'EGGS_PRESENT': { en: 'Tiny eggs visible on leaves/stem', hi: 'पत्तों / तने पर छोटे अंडे दिखते हैं', mr: 'पानांवर / खोडावर लहान अंडी दिसतात', category: 'pest', priority: 2 },
  'SMALL_INSECTS': { en: 'Very tiny creatures, hard to see clearly', hi: 'बहुत छोटे जीव, ठीक से दिखते नहीं', mr: 'खूप लहान जीव, नीट दिसत नाहीत', category: 'pest', priority: 1 },
  'MEDIUM_INSECTS': { en: 'Medium-sized creatures visible', hi: 'मध्यम आकार के जीव दिखते हैं', mr: 'मध्यम आकाराचे जीव दिसतात', category: 'pest', priority: 2 },
  'LARGE_INSECTS': { en: 'Large creatures visible on plant', hi: 'बड़े जीव पौधे पर दिखते हैं', mr: 'मोठे जीव झाडावर दिसतात', category: 'pest', priority: 2 },
  'GREEN_INSECTS': { en: 'Green colored tiny creatures on leaves', hi: 'पत्तों पर हरे रंग के छोटे जीव', mr: 'पानांवर हिरव्या रंगाचे लहान जीव', category: 'pest', priority: 2 },
  'BLACK_INSECTS': { en: 'Black colored creatures on plant', hi: 'काले रंग के जीव पौधे पर', mr: 'काळ्या रंगाचे जीव झाडावर', category: 'pest', priority: 2 },
  'BROWN_INSECTS': { en: 'Brown colored creatures on plant', hi: 'भूरे रंग के जीव पौधे पर', mr: 'तपकिरी रंगाचे जीव झाडावर', category: 'pest', priority: 2 },
  'WHITE_INSECTS': { en: 'White cottony/woolly creatures on plant', hi: 'पौधे पर सफेद रुई जैसे जीव', mr: 'झाडावर पांढरे कापसासारखे जीव', category: 'pest', priority: 1 },
  'LEAF_CHEWING': { en: 'Leaves being eaten, bite marks visible', hi: 'पत्ते खाए जा रहे, काटने के निशान', mr: 'पाने खाल्ली जात आहेत, चावण्याच्या खुणा', category: 'pest', priority: 1 },
  'LEAF_SKELETONIZATION': { en: 'Only leaf veins left, rest eaten', hi: 'पत्ते की सिर्फ नसें बची, बाकी खाया गया', mr: 'फक्त पानांच्या शिरा उरल्या, बाकी खाल्ले', category: 'pest', priority: 2 },
  'LEAF_MINING': { en: 'Winding trails/tunnels inside leaves', hi: 'पत्तों के अंदर टेढ़ी-मेढ़ी सुरंगें', mr: 'पानांच्या आत वेड्यावाकड्या बोगद्या', category: 'pest', priority: 2 },
  'LEAF_WEBBING': { en: 'Fine web/threads on leaves', hi: 'पत्तों पर बारीक जाला / धागे', mr: 'पानांवर बारीक जाळे / धागे', category: 'pest', priority: 2 },
  'STEM_BORING': { en: 'Holes in stem, sawdust-like powder near it', hi: 'तने में छेद, पास में भूसा जैसा पाउडर', mr: 'खोडात छिद्रे, जवळ भुशासारखी भुकटी', category: 'pest', priority: 1 },
  'ROOT_FEEDING': { en: 'Roots damaged, plant easily uprooted', hi: 'जड़ें कटी / खाई गई, पौधा आसानी से उखड़ता', mr: 'मुळे कापली / खाल्ली, झाड सहज उपटते', category: 'pest', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // G. DISEASE-SPECIFIC VISUAL SIGNS - describe appearance, not disease name
  // ═══════════════════════════════════════════════════════════════════════════
  'FUNGAL_GROWTH_VISIBLE': { en: 'White/grey/black growth visible on plant', hi: 'पौधे पर सफेद / भूरी / काली जमावट दिखती है', mr: 'झाडावर पांढरी / करडी / काळी वाढ दिसते', category: 'disease', priority: 1 },
  'WHITE_POWDERY_GROWTH': { en: 'White powder-like coating on leaves', hi: 'पत्तों पर सफेद पाउडर जैसी परत', mr: 'पानांवर पांढरा भुकटीसारखा थर', category: 'disease', priority: 1 },
  'GREY_MOLD_PRESENT': { en: 'Grey fuzzy growth on plant', hi: 'पौधे पर भूरी रोएंदार जमावट', mr: 'झाडावर करडी लवदार वाढ', category: 'disease', priority: 2 },
  'BLACK_SOOTY_MOLD': { en: 'Black soot-like coating on leaves', hi: 'पत्तों पर काली कालिख जैसी परत', mr: 'पानांवर काळी काजळीसारखी परत', category: 'disease', priority: 2 },
  'BACTERIAL_OOZE': { en: 'Sticky liquid oozing from stem when cut', hi: 'तना काटने पर चिपचिपा पानी निकलता है', mr: 'खोड कापल्यावर चिकट पाणी येते', category: 'disease', priority: 2 },
  'WATER_SOAKED_LESIONS': { en: 'Wet/water-soaked patches on leaves/stem', hi: 'पत्तों / तने पर गीले / पानी भरे धब्बे', mr: 'पानांवर / खोडावर ओले / पाणी भरलेले डाग', category: 'disease', priority: 2 },
  'FOUL_SMELL_PRESENT': { en: 'Bad/rotten smell coming from plant', hi: 'पौधे से सड़ी / बदबू आ रही है', mr: 'झाडातून सडका / दुर्गंध येत आहे', category: 'disease', priority: 1 },
  'RUST_PUSTULES': { en: 'Orange/brown powder spots on leaves', hi: 'पत्तों पर नारंगी / भूरे पाउडर वाले धब्बे', mr: 'पानांवर नारिंगी / तपकिरी भुकटीचे डाग', category: 'disease', priority: 2 },
  'WILT_SYMPTOM': { en: 'Whole plant suddenly drooping/wilting', hi: 'पूरा पौधा अचानक मुरझा गया', mr: 'संपूर्ण झाड अचानक कोमेजले', category: 'disease', priority: 1 },
  'GUMMOSIS': { en: 'Sticky gum oozing from stem', hi: 'तने से चिपचिपा गोंद निकल रहा', mr: 'खोडातून चिकट डिंक येत आहे', category: 'disease', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // H. NUTRIENT DEFICIENCY INDICATORS - visual symptoms only
  // ═══════════════════════════════════════════════════════════════════════════
  'UNIFORM_YELLOWING_OLDER_LEAVES': { en: 'Lower/older leaves turning yellow first', hi: 'नीचे / पुरानी पत्तियां पहले पीली पड़ रही', mr: 'खालची / जुनी पाने आधी पिवळी पडत आहेत', category: 'nutrient', priority: 1 },
  'UNIFORM_YELLOWING_YOUNG_LEAVES': { en: 'New/top leaves turning yellow first', hi: 'ऊपर की / नई पत्तियां पहले पीली पड़ रही', mr: 'वरची / नवीन पाने आधी पिवळी पडत आहेत', category: 'nutrient', priority: 1 },
  'PURPLISH_LEAVES': { en: 'Leaves turning purple/dark violet', hi: 'पत्ते बैंगनी / गहरे जामुनी हो रहे', mr: 'पाने जांभळी / गडद निळसर होत आहेत', category: 'nutrient', priority: 2 },
  'LEAF_MARGIN_BURN': { en: 'Leaf edges turning brown/burnt', hi: 'पत्तों के किनारे भूरे / जले', mr: 'पानांच्या कडा तपकिरी / करपलेल्या', category: 'nutrient', priority: 2 },
  'TIP_BURN': { en: 'Leaf tips turning brown/burnt', hi: 'पत्तों के सिरे भूरे / जले', mr: 'पानांची टोके तपकिरी / करपलेली', category: 'nutrient', priority: 2 },
  'SMALL_LEAVES': { en: 'Leaves much smaller than normal', hi: 'पत्ते सामान्य से बहुत छोटे', mr: 'पाने सामान्यपेक्षा खूप लहान', category: 'nutrient', priority: 3 },
  'THICK_LEAVES': { en: 'Leaves thick and leathery to touch', hi: 'पत्ते मोटे और चमड़े जैसे', mr: 'पाने जाड आणि चामड्यासारखी', category: 'nutrient', priority: 3 },
  'BRITTLE_LEAVES': { en: 'Leaves break easily when bent', hi: 'पत्ते मोड़ने पर आसानी से टूटते हैं', mr: 'पाने वाकवल्यास सहज तुटतात', category: 'nutrient', priority: 3 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // I-J. FLOWER / FRUIT STAGE - visual symptoms
  // ═══════════════════════════════════════════════════════════════════════════
  'POOR_FLOWERING': { en: 'Very few flowers on plants', hi: 'पौधों पर बहुत कम फूल आ रहे', mr: 'झाडांवर खूप कमी फुले येत आहेत', category: 'reproductive', priority: 2 },
  'FLOWER_DROP': { en: 'Flowers falling off before fruiting', hi: 'फल बनने से पहले फूल गिर रहे', mr: 'फळ लागण्याआधी फुले गळत आहेत', category: 'reproductive', priority: 1 },
  'BUD_DROP': { en: 'Flower buds falling off', hi: 'कलियां गिर रही हैं', mr: 'कळ्या गळत आहेत', category: 'reproductive', priority: 1 },
  'DELAYED_FLOWERING': { en: 'Flowers not coming on time', hi: 'फूल समय पर नहीं आ रहे', mr: 'फुले वेळेवर येत नाहीत', category: 'reproductive', priority: 3 },
  'IRREGULAR_FLOWERING': { en: 'Some plants flowering, some not', hi: 'कुछ पौधों पर फूल, कुछ पर नहीं', mr: 'काही झाडांवर फुले, काहींवर नाहीत', category: 'reproductive', priority: 3 },
  'POOR_FRUIT_SET': { en: 'Very few fruits forming', hi: 'बहुत कम फल लग रहे', mr: 'खूप कमी फळे लागत आहेत', category: 'reproductive', priority: 2 },
  'FRUIT_DROP': { en: 'Fruits falling off before ripening', hi: 'पकने से पहले फल गिर रहे', mr: 'पिकण्याआधी फळे गळत आहेत', category: 'reproductive', priority: 1 },
  'FRUIT_DEFORMED': { en: 'Fruits not normal shape, twisted/bent', hi: 'फल सामान्य आकार के नहीं, टेढ़े', mr: 'फळे सामान्य आकाराची नाहीत, वाकडी', category: 'reproductive', priority: 2 },
  'FRUIT_CRACKING': { en: 'Fruits cracking/splitting open', hi: 'फल फट रहे / चीर रहे', mr: 'फळे फुटत / चिरत आहेत', category: 'reproductive', priority: 2 },
  'FRUIT_ROT': { en: 'Fruits rotting on plant', hi: 'फल पौधे पर ही सड़ रहे', mr: 'फळे झाडावरच सडत आहेत', category: 'reproductive', priority: 1 },
  'SMALL_FRUITS': { en: 'Fruits much smaller than expected', hi: 'फल उम्मीद से बहुत छोटे', mr: 'फळे अपेक्षेपेक्षा खूप लहान', category: 'reproductive', priority: 2 },
  'EMPTY_GRAINS': { en: 'Grains are empty/hollow inside', hi: 'दाने अंदर से खाली / खोखले हैं', mr: 'दाणे आतून रिकामे / पोकळ आहेत', category: 'reproductive', priority: 1 },
  'PARTIALLY_FILLED_GRAINS': { en: 'Grains only half filled, light weight', hi: 'दाने आधे भरे, हल्के हैं', mr: 'दाणे अर्धवट भरलेले, हलके आहेत', category: 'reproductive', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // K. FIELD-LEVEL PATTERNS - what farmer sees across field
  // ═══════════════════════════════════════════════════════════════════════════
  'PATCHY_DAMAGE': { en: 'Problem in scattered patches across field', hi: 'खेत में जगह-जगह समस्या दिखती है', mr: 'शेतात ठिकठिकाणी समस्या दिसते', category: 'field_pattern', priority: 1 },
  'EDGE_DAMAGE_ONLY': { en: 'Problem only on field edges/borders', hi: 'सिर्फ खेत के किनारों पर समस्या', mr: 'फक्त शेताच्या कडेला समस्या', category: 'field_pattern', priority: 2 },
  'LOW_LYING_AREA_AFFECTED': { en: 'Problem in low-lying/waterlogged areas', hi: 'नीची / पानी जमा वाली जगह में समस्या', mr: 'सखल / पाणी साचणाऱ्या भागात समस्या', category: 'field_pattern', priority: 2 },
  'ENTIRE_FIELD_AFFECTED': { en: 'Problem everywhere in the field', hi: 'पूरे खेत में समस्या दिखती है', mr: 'संपूर्ण शेतात समस्या दिसते', category: 'field_pattern', priority: 1 },
  'LOCALIZED_SPOTS': { en: 'Problem only in one or two spots', hi: 'सिर्फ एक-दो जगह पर समस्या', mr: 'फक्त एक-दोन ठिकाणीच समस्या', category: 'field_pattern', priority: 2 },
  'DIRECTIONAL_SPREAD': { en: 'Problem spreading from one side', hi: 'एक तरफ से दूसरी तरफ फैल रहा', mr: 'एका बाजूने दुसऱ्या बाजूला पसरत आहे', category: 'field_pattern', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // L. WATER & SOIL CONTEXT - what farmer observes
  // ═══════════════════════════════════════════════════════════════════════════
  'FIELD_WATERLOGGED': { en: 'Water standing in field, not draining', hi: 'खेत में पानी भरा है, निकल नहीं रहा', mr: 'शेतात पाणी साचले आहे, जात नाही', category: 'soil_water', priority: 1 },
  'SOIL_TOO_DRY': { en: 'Soil very dry with cracks', hi: 'मिट्टी बहुत सूखी, दरारें पड़ गई', mr: 'माती खूप कोरडी, भेगा पडल्या', category: 'soil_water', priority: 1 },
  'CRACKS_IN_SOIL': { en: 'Deep cracks in soil visible', hi: 'मिट्टी में गहरी दरारें दिखती हैं', mr: 'मातीत खोल भेगा दिसतात', category: 'soil_water', priority: 2 },
  'SALT_CRUST_VISIBLE': { en: 'White salty layer on top of soil', hi: 'मिट्टी के ऊपर सफेद नमकीन परत', mr: 'मातीवर पांढरा खारट थर', category: 'soil_water', priority: 2 },
  'WHITE_SOIL_DEPOSITS': { en: 'White deposits/patches on soil surface', hi: 'मिट्टी की सतह पर सफेद जमाव', mr: 'मातीच्या पृष्ठभागावर पांढरे थर', category: 'soil_water', priority: 2 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // M. WEATHER / EVENT BASED - timing context
  // ═══════════════════════════════════════════════════════════════════════════
  'DAMAGE_AFTER_RAIN': { en: 'Problem started after heavy rain', hi: 'भारी बारिश के बाद समस्या शुरू हुई', mr: 'जोरदार पावसानंतर समस्या सुरू झाली', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_FROST': { en: 'Problem started after cold/frost', hi: 'ठंड / पाले के बाद समस्या शुरू हुई', mr: 'थंडी / दवानंतर समस्या सुरू झाली', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_HEAT': { en: 'Problem started after very hot days', hi: 'बहुत गर्मी के बाद समस्या शुरू हुई', mr: 'खूप उष्णतेनंतर समस्या सुरू झाली', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_WIND': { en: 'Problem started after storm/strong wind', hi: 'तूफान / तेज हवा के बाद समस्या शुरू हुई', mr: 'वादळ / जोराच्या वाऱ्यानंतर समस्या सुरू झाली', category: 'weather', priority: 1 },
  'DAMAGE_AFTER_HAIL': { en: 'Problem started after hailstorm', hi: 'ओलों के बाद समस्या शुरू हुई', mr: 'गारपिटीनंतर समस्या सुरू झाली', category: 'weather', priority: 1 },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // N. ADDITIONAL - visual evidence descriptions
  // ═══════════════════════════════════════════════════════════════════════════
  'HONEYDEW_PRESENT': { en: 'Leaves feel sticky to touch', hi: 'पत्ते छूने पर चिपचिपे लगते हैं', mr: 'पाने हाताला चिकट लागतात', category: 'pest', priority: 1 },
  'SOOTY_MOLD_ON_HONEYDEW': { en: 'Black coating on sticky leaves', hi: 'चिपचिपे पत्तों पर काली परत', mr: 'चिकट पानांवर काळी परत', category: 'pest', priority: 2 },
  'FRASS_VISIBLE': { en: 'Sawdust-like powder near stem base', hi: 'तने के पास भूसा जैसा पाउडर दिखता है', mr: 'खोडाजवळ भुशासारखी भुकटी दिसते', category: 'pest', priority: 2 },
  'SILK_WEBBING_VISIBLE': { en: 'Fine silky web on leaves/stem', hi: 'पत्तों / तने पर बारीक रेशमी जाला', mr: 'पानांवर / खोडावर बारीक रेशमी जाळे', category: 'pest', priority: 2 },
  'ANTS_PRESENT': { en: 'Ants crawling on plants', hi: 'पौधों पर चींटियां चल रही हैं', mr: 'झाडांवर मुंग्या चालत आहेत', category: 'pest', priority: 3 },
  'TUNNELS_IN_SOIL': { en: 'Tunnels/holes visible in soil near plant', hi: 'पौधे के पास मिट्टी में सुरंग / छेद', mr: 'झाडाजवळ मातीत बिळे / छिद्रे दिसतात', category: 'pest', priority: 2 },
  'MUD_TUBES_PRESENT': { en: 'Mud/clay tubes on stem base or soil', hi: 'तने के नीचे या मिट्टी पर मिट्टी की नलियां', mr: 'खोडाच्या बुडाशी किंवा मातीवर मातीच्या नळ्या', category: 'pest', priority: 1 },

  // ═══════════════════════════════════════════════════════════════════════════
  // O. PEST-SPECIFIC VISUAL SYMPTOMS (described by what farmer sees)
  // These map to specific pests but labels describe VISUAL symptoms only
  // ═══════════════════════════════════════════════════════════════════════════
  'EARLY_SHOOT_BORER': { en: 'Young plant central leaf dried, pulls out easily', hi: 'छोटे पौधे की बीच की पत्ती सूखी, खींचने पर निकल जाती है', mr: 'लहान रोपाची मधली पाने वाळली, ओढल्यास बाहेर येतात', category: 'pest', priority: 1 },
  'DEADHEART': { en: 'Central shoot completely dead and dry', hi: 'बीच का कोंपल पूरा सूख गया', mr: 'मधला कोंब पूर्ण सुकून गेला', category: 'pest', priority: 1 },
  'DROUGHT_STRESS': { en: 'Plants wilting due to lack of water', hi: 'पानी की कमी से पौधे मुरझा रहे', mr: 'पाण्याच्या कमतरतेने झाडे कोमेजत आहेत', category: 'soil_water', priority: 1 },
  'BORON_DEFICIENCY': { en: 'New growth distorted, tips dying', hi: 'नई वृद्धि विकृत, सिरे मर रहे', mr: 'नवीन वाढ विकृत, टोके मरत आहेत', category: 'nutrient', priority: 2 },
  'BORON_TOXICITY': { en: 'Leaf tips and edges turning brown/burnt', hi: 'पत्तों के सिरे और किनारे भूरे / जले', mr: 'पानांची टोके आणि कडा तपकिरी / करपलेल्या', category: 'nutrient', priority: 2 }
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
 * Get observation key with label for any language.
 * Priority: hardcoded dict (for en/hi/mr) → raw code fallback.
 * For DB-driven labels in any language, use loadObservationKeysFromDB with language param.
 */
export function getObservationKeyLabel(
  key: string,
  language: string
): string {
  const labels = OBSERVATION_KEY_LABELS[key];
  if (!labels) {
    console.warn(`[CanonicalLoader] No label found for key: ${key}`);
    // For non-English, return raw code to avoid English leakage
    return language === 'en' ? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : key.replace(/_/g, ' ');
  }
  // For known languages, use hardcoded; for unknown, avoid English leakage
  if (language === 'en' || language === 'hi' || language === 'mr') {
    return labels[language as 'en' | 'hi' | 'mr'];
  }
  // Unknown language: return raw code (not English text)
  return key.replace(/_/g, ' ');
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
    label: labels.en, // Default; overridden by DB query at runtime
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
  language: string,
  maxKeys: number = 4
): { key: string; label: string }[] {
  const normalizedStage = stage.toLowerCase().replace(/[\s-]/g, '_');
  const priorityKeys = STAGE_KEY_PRIORITIES[normalizedStage] || STAGE_KEY_PRIORITIES.all;
  
  const result: { key: string; label: string }[] = [];
  
  for (const key of priorityKeys) {
    if (result.length >= maxKeys) break;
    
    const labels = OBSERVATION_KEY_LABELS[key];
    if (labels) {
      // Use known language label or raw code for unknown languages
      let label: string;
      if (language === 'en' || language === 'hi' || language === 'mr') {
        label = labels[language as 'en' | 'hi' | 'mr'];
      } else {
        label = key.replace(/_/g, ' '); // Avoid English leakage
      }
      result.push({ key, label });
    }
  }
  
  return result;
}

/**
 * Get observation keys by category
 */
export function getCategoryObservationKeys(
  category: string,
  language: string,
  maxKeys: number = 4
): { key: string; label: string }[] {
  const result: { key: string; label: string }[] = [];
  
  for (const [key, labels] of Object.entries(OBSERVATION_KEY_LABELS)) {
    if (result.length >= maxKeys) break;
    
    if (labels.category === category) {
      let label: string;
      if (language === 'en' || language === 'hi' || language === 'mr') {
        label = labels[language as 'en' | 'hi' | 'mr'];
      } else {
        label = key.replace(/_/g, ' ');
      }
      result.push({ key, label });
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
// Stage normalization map: UI stage names → DB stage names
const STAGE_NORMALIZATION_MAP: Record<string, string> = {
  'seedling': 'germination',
  'vegetative': 'tillering',
  'flowering': 'grand_growth',
  'reproductive': 'grand_growth',
  'maturation': 'maturity',
  'ripening': 'maturity',
  'harvesting': 'harvest',
  // Direct mappings (already correct)
  'germination': 'germination',
  'tillering': 'tillering',
  'grand_growth': 'grand_growth',
  'maturity': 'maturity',
  'harvest': 'harvest',
  'planting': 'planting',
  'post_harvest': 'post_harvest',
};

function normalizeStageForDB(stage: string): string {
  const normalized = stage.toLowerCase().trim().replace(/[\s-]/g, '_');
  return STAGE_NORMALIZATION_MAP[normalized] || normalized;
}

export async function loadObservationKeysFromDB(
  cropCode: string,
  stage: string,
  language: string = 'en'
): Promise<LoadedObservationKeys> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('[CanonicalLoader] Missing Supabase credentials, using fallback');
      return getFallbackKeys(cropCode, stage, language);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Normalize stage for DB lookup (e.g., SEEDLING → germination)
    const dbStage = normalizeStageForDB(stage);
    console.log(`[CanonicalLoader v${CANONICAL_LOADER_VERSION}] Stage normalization: ${stage} → ${dbStage}, language=${language}`);
    
    const crop = cropCode.toLowerCase();
    const stageVariants = Array.from(
      new Set([dbStage, 'all'].filter(Boolean))
    );

    console.log(`[CanonicalLoader] Querying for crop=${crop}, stages=${stageVariants.join(',')}`);

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

      if (res.data && res.data.length > 0) {
        data = data ? [...data, ...res.data] : res.data;
      }
    }

    if (lastError && (!data || data.length === 0)) {
      console.error('[CanonicalLoader] DB query error:', lastError);
      return getFallbackKeys(cropCode, stage, language);
    }

    if (!data || data.length === 0) {
      console.warn(`[CanonicalLoader] No matching rules for ${cropCode}/${dbStage}`);
      return getFallbackKeys(cropCode, stage, language);
    }

    console.log(`[CanonicalLoader] Found ${data.length} rules with observable_characteristics`);
    
    // Extract unique keys from all matching rules
    const uniqueKeys = new Set<string>();
    for (const rule of data || []) {
      const chars = rule.observable_characteristics;
      if (Array.isArray(chars)) {
        for (const key of chars) {
          if (typeof key === 'string') {
            uniqueKeys.add(key.toUpperCase());
          }
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // DB-DRIVEN LABELS: Query observation_translations for the target language
    // This replaces the hardcoded OBSERVATION_KEY_LABELS lookup for label resolution
    // ═══════════════════════════════════════════════════════════════════════════
    const keysArray = Array.from(uniqueKeys);
    const dbLabels = await loadObservationLabels(supabase, keysArray, language);
    
    // Convert to ObservationKeyWithLabels with DB-resolved labels
    const keys: ObservationKeyWithLabels[] = [];
    for (const key of uniqueKeys) {
      const dbLabel = dbLabels.get(key);
      const hardcodedLabels = OBSERVATION_KEY_LABELS[key];
      
      // DB label takes priority; fallback to hardcoded for en/hi/mr; raw code for others
      const resolvedLabel = dbLabel?.display_text || 
        (hardcodedLabels && (language === 'en' || language === 'hi' || language === 'mr') 
          ? hardcodedLabels[language as 'en' | 'hi' | 'mr'] 
          : key.replace(/_/g, ' '));
      
      keys.push({
        key,
        label_en: hardcodedLabels?.en || key.replace(/_/g, ' '),
        label_hi: hardcodedLabels?.hi || key.replace(/_/g, ' '),
        label_mr: hardcodedLabels?.mr || key.replace(/_/g, ' '),
        label: resolvedLabel, // Language-specific resolved label
        category: hardcodedLabels?.category || dbLabel?.icon || 'unknown',
        stage: [stage],
        visual_priority: hardcodedLabels?.priority || 99
      });
    }
    
    // Sort by priority
    keys.sort((a, b) => a.visual_priority - b.visual_priority);
    
    console.log(`[CanonicalLoader] Loaded ${keys.length} keys for ${cropCode}/${stage} from DB with ${language} labels`);
    
    return {
      keys,
      crop_code: cropCode,
      stage,
      total_count: keys.length,
      loaded_from: 'DATABASE'
    };
    
  } catch (err) {
    console.error('[CanonicalLoader] Error loading from DB:', err);
    return getFallbackKeys(cropCode, stage, language);
  }
}

/**
 * Fallback function when DB is unavailable
 */
function getFallbackKeys(cropCode: string, stage: string, language: string = 'en'): LoadedObservationKeys {
  const stageKeys = getStageObservationKeys(stage, language, 20);
  
  const keys: ObservationKeyWithLabels[] = stageKeys.map(k => {
    const labels = getObservationKeyLabels(k.key);
    return labels ? { ...labels, label: k.label, stage: [stage] } : {
      key: k.key,
      label_en: k.label,
      label_hi: k.label,
      label_mr: k.label,
      label: k.label,
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
  language: string,
  category?: string,
  maxOptions: number = 3
): { key: string; label: string }[] {
  if (category) {
    return getCategoryObservationKeys(category, language, maxOptions);
  }
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
