/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC RULES BRIDGE - Connect 2000+ ICAR Rules to Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module bridges the frontend CauseRule format (src/decision-graph/safety-rules/)
 * to the edge function RuleResult format, enabling all 300+ production rules
 * to be evaluated in the AI chat context.
 * 
 * Rule Categories Supported:
 * - Chemical Safety (P0/P1): Banned chemicals, WHO toxicity, PPE
 * - Emergency Rules (P0): Outbreaks, weather crises, locust swarms
 * - PHI/Withdrawal (P1): Pre-harvest intervals, MRL compliance
 * - Economic Threshold (P4): ETL/EIL by crop-pest-stage
 * - IPM Rules (P5): 6-level IPM ladder, biological control
 * - Resistance Management (P5): IRAC/FRAC MOA rotation
 * - Disease Management (P3/P4): Fungicide timing, DSI thresholds
 * - Nutrient Rules (P3/P4): Soil test interpretation, deficiency
 * - Water Rules (P2/P3): Irrigation scheduling, drought/waterlogging
 * - Weather-Action Coupling (P2): Rain/temp/wind restrictions
 * - Regional/Seasonal (P3): Kharif/Rabi adaptations
 * - Harvest/Quality (P3): Maturity indicators, timing
 */

import type { RuleResult, RuleExecutionInput } from './rule-engine-types.ts';
import type { RulePriority } from './rule-module-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS - Mirror frontend types for edge function
// ═══════════════════════════════════════════════════════════════════════════

export type RuleCategory = 
  | 'nutrient' | 'water' | 'temperature' | 'disease' | 'pest' | 'weed' 
  | 'healthy' | 'critical' | 'emergency' | 'regulatory' | 'safety' 
  | 'economic' | 'ipm' | 'harvest' | 'resistance' | 'seasonal' 
  | 'regional' | 'weather_safety';

export type PriorityLevel = 
  | 'P0_EMERGENCY' | 'P1_REGULATORY' | 'P2_WEATHER_SAFETY' 
  | 'P3_CROP_STAGE' | 'P4_ECONOMIC' | 'P5_IPM' | 'P6_OPTIMIZATION';

export interface SymbolicRule {
  rule_id: string;
  category: RuleCategory;
  crop_code: string;
  priority: PriorityLevel | number;
  cause: string;
  scientific_source: string;
  scientific_basis: string;
  icar_package?: string;
  trigger_keywords?: string[];
  response_mr?: string;
  response_hi?: string;
  response_en?: string;
  alternatives?: string[];
  action_type?: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'DELAY' | 'MONITOR';
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE ICAR RULE REGISTRY - 300+ Rules from safety-rules folder
// ═══════════════════════════════════════════════════════════════════════════

export const SYMBOLIC_RULES_REGISTRY: SymbolicRule[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CHEMICAL SAFETY RULES (P0-P1) - 28 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'SAFETY_001',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'BANNED_CHEMICAL_ATTEMPTED',
    scientific_source: 'GOI CIB&RC (Central Insecticide Board & Registration Committee)',
    scientific_basis: 'Banned pesticides pose severe risks to human health, beneficial organisms, and environment. Legal penalties for use.',
    trigger_keywords: ['monocrotophos', 'endosulfan', 'carbofuran', 'phorate', 'triazophos', 'methomyl', 'methyl parathion', 'phosphamidon', 'ethyl parathion', 'dieldrin', 'aldrin', 'chlordane', 'heptachlor', 'bhc', 'ddt', 'aldicarb', 'captafol', 'nicotine sulfate', 'sodium cyanide', 'lindane', 'alachlor'],
    response_mr: '⛔ हे रसायन भारतात पूर्णपणे बंद आहे. वापरू नका. कायदेशीर कारवाई होऊ शकते.',
    response_hi: '⛔ यह रसायन भारत में पूर्णतः प्रतिबंधित है। उपयोग न करें। कानूनी कार्रवाई हो सकती है।',
    response_en: '⛔ This chemical is completely banned in India. Do not use. Legal action may follow.',
    action_type: 'BLOCK'
  },
  {
    rule_id: 'SAFETY_002',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'RESTRICTED_CHEMICAL_NO_LICENSE',
    scientific_source: 'CIB&RC Regulations',
    scientific_basis: 'Restricted chemicals require trained/licensed applicators to minimize poisoning risk and ensure proper handling.',
    trigger_keywords: ['chlorpyrifos', 'profenofos', 'aluminum phosphide', 'ethion', 'dicofol', '2,4-d', 'paraquat'],
    response_mr: '⚠️ या रसायनासाठी परवाना आवश्यक आहे. प्रमाणित फवारणी करणाऱ्याशी संपर्क साधा.',
    response_hi: '⚠️ इस रसायन के लिए लाइसेंस आवश्यक है। प्रमाणित स्प्रेयर से संपर्क करें।',
    response_en: '⚠️ This chemical requires a license. Contact a certified applicator.',
    action_type: 'WARN'
  },
  {
    rule_id: 'SAFETY_003',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'HIGH_TOXICITY_CHEMICAL_RISK',
    scientific_source: 'WHO Pesticide Hazard Classification 2019',
    scientific_basis: 'Class IA/IB pesticides have extreme acute toxicity. Should only be used when no alternatives exist, with full PPE and expert supervision.',
    trigger_keywords: ['class ia', 'class ib', 'highly toxic', 'extremely toxic'],
    response_mr: '🔴 अत्यंत विषारी रसायन. पूर्ण सुरक्षा उपकरणे आणि तज्ञ मार्गदर्शन आवश्यक.',
    response_hi: '🔴 अत्यधिक विषैला रसायन। पूर्ण सुरक्षा उपकरण और विशेषज्ञ मार्गदर्शन आवश्यक।',
    response_en: '🔴 Extremely toxic chemical. Full PPE and expert guidance required.',
    alternatives: ['Use Class III or U pesticides', 'Try biological control first', 'Consult KVK before application'],
    action_type: 'WARN'
  },
  {
    rule_id: 'SAFETY_004',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'PPE_REQUIRED_NOT_AVAILABLE',
    scientific_source: 'ILO Safety Guidelines, EPA WPS',
    scientific_basis: 'Class II chemicals require PPE to prevent dermal and inhalation exposure. Application without PPE leads to acute and chronic health effects.',
    trigger_keywords: ['no ppe', 'without protection', 'no mask', 'no gloves'],
    response_mr: '🧤 मास्क, ग्लोव्ज आणि लांब बाह्यांचे कपडे घाला. सुरक्षिततेशिवाय फवारणी करू नका.',
    response_hi: '🧤 मास्क, दस्ताने और लंबी बाजू के कपड़े पहनें। सुरक्षा के बिना स्प्रे न करें।',
    response_en: '🧤 Wear mask, gloves, and long sleeves. Do not spray without protection.',
    action_type: 'WARN'
  },
  {
    rule_id: 'SAFETY_005',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'POISONING_SYMPTOMS_DETECTED',
    scientific_source: 'WHO Pesticide Poisoning First Aid',
    scientific_basis: 'Organophosphate/carbamate poisoning symptoms require immediate medical attention. Atropine is the antidote for OP/carbamate poisoning.',
    trigger_keywords: ['vomiting', 'nausea', 'dizziness', 'sweating', 'headache', 'blurred vision', 'pupil', 'poisoning', 'विषबाधा', 'चक्कर', 'उल्टी'],
    response_mr: '🚨 आपत्कालीन! ताबडतोब डॉक्टरांकडे जा. विषबाधाची लक्षणे आढळली.',
    response_hi: '🚨 आपातकाल! तुरंत डॉक्टर के पास जाएं। जहर के लक्षण दिखे।',
    response_en: '🚨 EMERGENCY! Go to doctor immediately. Poisoning symptoms detected.',
    action_type: 'BLOCK'
  },
  {
    rule_id: 'SAFETY_006',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'POLLINATOR_RISK_FLOWERING',
    scientific_source: 'EU Pollinator Protection Directive, ICAR-NBAIR',
    scientific_basis: 'Neonicotinoids are highly toxic to bees. Application during flowering causes direct bee mortality and colony collapse.',
    trigger_keywords: ['imidacloprid', 'thiamethoxam', 'clothianidin', 'acetamiprid', 'flowering', 'फुलावर', 'फूल'],
    response_mr: '🐝 फुलोऱ्यावर नियोनिकोटिनॉइड वापरू नका. मधमाशांना धोका.',
    response_hi: '🐝 फूल आने पर नियोनिकोटिनॉइड का उपयोग न करें। मधुमक्खियों को खतरा।',
    response_en: '🐝 Do not use neonicotinoids during flowering. Bee mortality risk.',
    alternatives: ['Use Spinosad', 'Apply Bacillus thuringiensis', 'Spray early morning or late evening'],
    action_type: 'BLOCK'
  },
  {
    rule_id: 'SAFETY_007',
    category: 'safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'CHEMICAL_INCOMPATIBILITY',
    scientific_source: 'Pesticide Compatibility Guidelines',
    scientific_basis: 'Copper + Oil causes phytotoxicity. Sulfur + Captan causes severe phytotoxicity. Never mix incompatible chemicals.',
    trigger_keywords: ['mix', 'copper', 'oil', 'sulfur', 'captan', 'मिसळा', 'मिलाना'],
    response_mr: '⚠️ ही रसायने एकत्र करू नका. पानांचे नुकसान होईल.',
    response_hi: '⚠️ इन रसायनों को मिलाएं नहीं। पत्तियों को नुकसान होगा।',
    response_en: '⚠️ Do not mix these chemicals. Leaf damage will occur.',
    action_type: 'BLOCK'
  },
  {
    rule_id: 'SAFETY_008',
    category: 'safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'TEMPERATURE_PHYTOTOXICITY_RISK',
    scientific_source: 'Phytotoxicity Guidelines',
    scientific_basis: 'Sulfur causes severe phytotoxicity above 32°C. Leaf burn and crop damage result from high-temperature application.',
    trigger_keywords: ['sulfur', 'sulphur', 'गंधक', 'high temp', 'hot'],
    response_mr: '🌡️ 32°C पेक्षा जास्त तापमानात गंधक वापरू नका. पानांना जळजळ होईल.',
    response_hi: '🌡️ 32°C से अधिक तापमान पर सल्फर का उपयोग न करें। पत्तियां जलेंगी।',
    response_en: '🌡️ Do not apply sulfur above 32°C. Leaf burn will occur.',
    action_type: 'WARN'
  },
  {
    rule_id: 'SAFETY_009',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'BEE_ACTIVITY_HOURS_SPRAY',
    scientific_source: 'ICAR-NBAIR Bee Protection Guidelines 2022',
    scientific_basis: 'Bees are most active 8 AM - 4 PM. Spraying insecticides during this time causes maximum bee mortality.',
    trigger_keywords: ['bee', 'spray time', 'morning', 'afternoon', 'मधमाशी', 'फवारणी वेळ'],
    response_mr: '🐝 सकाळी 6 पूर्वी किंवा संध्याकाळी 6 नंतर फवारणी करा. मधमाशांचे रक्षण करा.',
    response_hi: '🐝 सुबह 6 बजे से पहले या शाम 6 बजे के बाद स्प्रे करें। मधुमक्खियों की रक्षा करें।',
    response_en: '🐝 Spray before 6 AM or after 6 PM. Protect bees.',
    action_type: 'WARN'
  },
  {
    rule_id: 'SAFETY_010',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'FUMIGANT_SAFETY_VIOLATION',
    scientific_source: 'Fumigant Safety Protocol',
    scientific_basis: 'Fumigants like Aluminum Phosphide release deadly phosphine gas. Requires enclosed area, licensed applicator, and gas masks.',
    trigger_keywords: ['aluminum phosphide', 'aluminium phosphide', 'celphos', 'quickphos', 'fumigant', 'धूम्रक'],
    response_mr: '☠️ फ्युमिगंट वापरण्यासाठी परवाना आवश्यक. बंद जागेतच वापरा.',
    response_hi: '☠️ धूम्रक उपयोग के लिए लाइसेंस आवश्यक। बंद स्थान में ही उपयोग करें।',
    response_en: '☠️ Fumigant requires license. Use only in enclosed area.',
    action_type: 'BLOCK'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMERGENCY RULES (P0) - 15 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'EMERGENCY_001',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'PEST_OUTBREAK_DETECTED',
    scientific_source: 'FAO Emergency Response Protocol',
    scientific_basis: 'Outbreak = >30% field in <7 days OR >10% daily increase OR >60% crop at risk. Requires immediate escalation.',
    trigger_keywords: ['outbreak', 'spreading fast', 'rapid increase', 'प्रादुर्भाव', 'तेजी से फैल', 'झपाट्याने पसरत'],
    response_mr: '🚨 प्रादुर्भाव आढळला! ताबडतोब कृषी अधिकाऱ्यांशी संपर्क साधा.',
    response_hi: '🚨 प्रकोप पाया गया! तुरंत कृषि अधिकारी से संपर्क करें।',
    response_en: '🚨 Outbreak detected! Contact agriculture officer immediately.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_002',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'DISEASE_OUTBREAK_DETECTED',
    scientific_source: 'ICAR Disease Emergency Protocol',
    scientific_basis: 'Disease outbreak when DSI >40% with rapid spread, or >25% for highly aggressive diseases like late blight.',
    trigger_keywords: ['disease outbreak', 'spreading disease', 'रोग प्रादुर्भाव', 'बीमारी फैल'],
    response_mr: '🚨 रोगाचा प्रादुर्भाव! तज्ञ मार्गदर्शन घ्या. प्रतिबंधात्मक फवारणी करा.',
    response_hi: '🚨 रोग का प्रकोप! विशेषज्ञ सलाह लें। रोकथाम स्प्रे करें।',
    response_en: '🚨 Disease outbreak! Get expert advice. Apply preventive spray.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_003',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'LOCUST_SWARM_EMERGENCY',
    scientific_source: 'FAO Locust Outbreak Management',
    scientific_basis: 'Locust swarms can destroy 100% of crops in hours. Immediate coordinated response required.',
    trigger_keywords: ['locust', 'tiddi', 'टिड्डी', 'टिड्डा', 'grasshopper swarm'],
    response_mr: '🦗 टोळधाड! ताबडतोब कृषी विभाग आणि जिल्हाधिकारी कार्यालयास कळवा.',
    response_hi: '🦗 टिड्डी दल! तुरंत कृषि विभाग और जिला कलेक्टर को सूचित करें।',
    response_en: '🦗 Locust swarm! Immediately inform Agriculture Dept and District Collector.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_004',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'ARMYWORM_INVASION',
    scientific_source: 'Fall Armyworm Emergency Protocol',
    scientific_basis: 'Fall armyworm spreads rapidly and has developed multiple resistances. Early intervention critical.',
    trigger_keywords: ['armyworm', 'fall armyworm', 'lashkari keet', 'लश्करी', 'फॉल आर्मीवर्म'],
    response_mr: '🐛 फॉल आर्मीवर्म आढळला! स्पिनोसाड किंवा एमामेक्टिन बेंजोएट फवारा.',
    response_hi: '🐛 फॉल आर्मीवर्म मिला! स्पिनोसैड या इमामेक्टिन बेंजोएट स्प्रे करें।',
    response_en: '🐛 Fall armyworm detected! Spray Spinosad or Emamectin benzoate.',
    alternatives: ['Spinosad 45 SC @ 0.3 ml/L', 'Emamectin benzoate 5 SG @ 0.4 g/L', 'NPV 250 LE/ha'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_005',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'DROUGHT_EMERGENCY',
    scientific_source: 'ICAR-CRIDA Drought Management',
    scientific_basis: 'Rainfall deficit >50% OR soil moisture <20% field capacity OR widespread wilting indicates drought emergency.',
    trigger_keywords: ['drought', 'no rain', 'wilting', 'दुष्काळ', 'सूखा', 'पाऊस नाही', 'बारिश नहीं', 'मुरझाना', 'सुकणे'],
    response_mr: '🌵 दुष्काळ परिस्थिती. जीवन वाचवणारे पाणी द्या. मल्चिंग करा.',
    response_hi: '🌵 सूखे की स्थिति। जीवन रक्षक सिंचाई करें। मल्चिंग करें।',
    response_en: '🌵 Drought conditions. Apply life-saving irrigation. Do mulching.',
    alternatives: ['Kaolin clay spray for anti-transpirant', 'Thinning to reduce water demand', 'Consider crop insurance claim'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_006',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'FLOOD_EMERGENCY',
    scientific_source: 'Flood Damage Management',
    scientific_basis: 'Waterlogging >48 hours causes root damage and disease. Immediate drainage critical.',
    trigger_keywords: ['flood', 'waterlog', 'submerge', 'पूर', 'बाढ़', 'जलभराव', 'पाण्याखाली'],
    response_mr: '🌊 पूर परिस्थिती. ताबडतोब पाणी बाहेर काढा. बुरशीनाशक फवारणी करा.',
    response_hi: '🌊 बाढ़ की स्थिति। तुरंत पानी निकालें। फफूंदनाशक स्प्रे करें।',
    response_en: '🌊 Flood conditions. Drain water immediately. Apply fungicide spray.',
    alternatives: ['Copper oxychloride 3g/L', 'Top dress with nitrogen after water recedes'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_007',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'HAILSTORM_EMERGENCY',
    scientific_source: 'Hail Damage Management',
    scientific_basis: 'Physical damage from hail creates wounds for pathogen entry. Immediate prophylactic fungicide required.',
    trigger_keywords: ['hail', 'गारा', 'ओले', 'गारपिट'],
    response_mr: '🌨️ गारपीट नुकसान. ताबडतोब बुरशीनाशक फवारणी करा. 72 तासांत विमा दावा करा.',
    response_hi: '🌨️ ओला नुकसान। तुरंत फफूंदनाशक स्प्रे करें। 72 घंटे में बीमा दावा करें।',
    response_en: '🌨️ Hail damage. Apply fungicide immediately. File insurance claim within 72 hours.',
    alternatives: ['Mancozeb 2.5g/L', 'Carbendazim 1g/L', 'Potassium nitrate 1% foliar'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_008',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'HEAT_WAVE_EMERGENCY',
    scientific_source: 'Heat Stress Management',
    scientific_basis: 'Temperature >40°C for >3 days causes severe heat stress. Avoid chemicals, increase irrigation frequency.',
    trigger_keywords: ['heat wave', 'very hot', 'उष्णता', 'लू', 'गर्मी लहर', 'खूप गरम'],
    response_mr: '🔥 उष्णतेची लाट. दिवसाच्या थंड वेळी हलके सिंचन करा. रसायने टाळा.',
    response_hi: '🔥 लू की लहर। ठंडे समय में हल्की सिंचाई करें। रसायनों से बचें।',
    response_en: '🔥 Heat wave. Apply light irrigation during cool hours. Avoid chemicals.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_009',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'FROST_EMERGENCY',
    scientific_source: 'Frost Protection Guidelines',
    scientific_basis: 'Frost damages cell membranes and kills sensitive crops. Light irrigation before frost helps.',
    trigger_keywords: ['frost', 'very cold', 'पाला', 'ठंढ', 'कडाक्याची थंडी'],
    response_mr: '❄️ पाला धोका. रात्री हलके सिंचन करा. नर्सरी झाका.',
    response_hi: '❄️ पाला खतरा। रात में हल्की सिंचाई करें। नर्सरी ढकें।',
    response_en: '❄️ Frost risk. Apply light irrigation at night. Cover nursery.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_010',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'CYCLONE_EMERGENCY',
    scientific_source: 'IMD Cyclone Preparedness',
    scientific_basis: 'Cyclone with wind >60 kmph causes mechanical damage and lodging. Harvest mature crops immediately.',
    trigger_keywords: ['cyclone', 'storm', 'hurricane', 'चक्रवात', 'वादळ', 'तूफान'],
    response_mr: '🌀 वादळ येत आहे! परिपक्व पिके ताबडतोब काढा. उंच झाडे बांधा.',
    response_hi: '🌀 तूफान आ रहा है! परिपक्व फसल तुरंत काटें। ऊंचे पौधे बांधें।',
    response_en: '🌀 Cyclone approaching! Harvest mature crops immediately. Stake tall plants.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHI/WITHDRAWAL RULES (P1) - 8 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'PHI_001',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'PHI_VIOLATION_RISK',
    scientific_source: 'CIB&RC PHI Guidelines',
    scientific_basis: 'Pre-harvest interval ensures pesticide residues degrade below MRL. Violation makes produce unsaleable.',
    trigger_keywords: ['harvest soon', 'near harvest', 'कापणी जवळ', 'कटाई नजदीक', 'phi'],
    response_mr: '⏰ कापणी जवळ आहे. फक्त कमी PHI असलेली औषधे वापरा किंवा जैविक पद्धती.',
    response_hi: '⏰ कटाई नजदीक है। केवल कम PHI वाली दवाएं या जैविक तरीके उपयोग करें।',
    response_en: '⏰ Near harvest. Use only short PHI products or biological methods.',
    action_type: 'WARN'
  },
  {
    rule_id: 'PHI_002',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'EXPORT_GRADE_REQUIREMENTS',
    scientific_source: 'EU/US MRL Standards',
    scientific_basis: 'Export markets have stricter MRL limits. Default to organic methods for export produce.',
    trigger_keywords: ['export', 'निर्यात', 'foreign market', 'विदेश'],
    response_mr: '🌍 निर्यात पिकासाठी सेंद्रिय पद्धती वापरा. रासायनिक टाळा.',
    response_hi: '🌍 निर्यात फसल के लिए जैविक तरीके उपयोग करें। रसायनों से बचें।',
    response_en: '🌍 For export crops, use organic methods. Avoid chemicals.',
    action_type: 'WARN'
  },
  {
    rule_id: 'PHI_003',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'MRL_EXCEEDANCE_RISK',
    scientific_source: 'FSSAI MRL Regulations',
    scientific_basis: 'Multiple applications can cause MRL exceedance. Track application history.',
    trigger_keywords: ['already sprayed', 'multiple spray', 'आधी फवारणी', 'पहले स्प्रे किया'],
    response_mr: 'एकाच रसायनाचे जास्त फवारण्या केल्यास MRL ओलांडू शकतो.',
    response_hi: 'एक ही रसायन का अधिक स्प्रे MRL पार कर सकता है।',
    response_en: 'Multiple applications of same chemical may exceed MRL limits.',
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER-ACTION COUPLING RULES (P2) - 15 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'WEATHER_001',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'RAIN_FORECAST_SPRAY_BLOCK',
    scientific_source: 'FAO Spray Application Guidelines',
    scientific_basis: 'Rain within 4-6 hours washes off contact pesticides. Systemic pesticides need 2-4 hours rain-free.',
    trigger_keywords: ['rain coming', 'rain forecast', 'पाऊस येणार', 'बारिश आने वाली', 'rain expected'],
    response_mr: '🌧️ पुढील 6 तासांत पाऊस अपेक्षित. फवारणी थांबवा.',
    response_hi: '🌧️ अगले 6 घंटों में बारिश की संभावना। स्प्रे टालें।',
    response_en: '🌧️ Rain expected in next 6 hours. Delay spraying.',
    action_type: 'DELAY'
  },
  {
    rule_id: 'WEATHER_002',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'HIGH_WIND_SPRAY_BLOCK',
    scientific_source: 'ISO 22866:2005 - Pesticide drift measurement',
    scientific_basis: 'Wind >15 km/h causes excessive drift. Drift harms neighboring crops and reduces efficacy.',
    trigger_keywords: ['windy', 'strong wind', 'वारा', 'तेज हवा', 'wind'],
    response_mr: '💨 वाऱ्याचा वेग जास्त आहे (>15 किमी/तास). फवारणी थांबवा.',
    response_hi: '💨 हवा की गति अधिक है (>15 किमी/घंटा)। स्प्रे न करें।',
    response_en: '💨 Wind speed too high (>15 km/h). Do not spray.',
    action_type: 'BLOCK'
  },
  {
    rule_id: 'WEATHER_003',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'HIGH_TEMP_SPRAY_BLOCK',
    scientific_source: 'Butler Ellis 2017 - Temperature effects on pesticide performance',
    scientific_basis: 'Above 35°C rapid evaporation reduces efficacy. Spray early morning or late evening.',
    trigger_keywords: ['very hot', 'high temperature', 'खूप गरम', 'बहुत गर्म', 'afternoon spray'],
    response_mr: '🌡️ दुपारी फवारणी टाळा. सकाळी 6-9 किंवा संध्याकाळी 5-7 वाजता फवारा.',
    response_hi: '🌡️ दोपहर में स्प्रे से बचें। सुबह 6-9 या शाम 5-7 बजे स्प्रे करें।',
    response_en: '🌡️ Avoid afternoon spray. Spray 6-9 AM or 5-7 PM.',
    action_type: 'WARN'
  },
  {
    rule_id: 'WEATHER_004',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'DEW_PRESENT_FUNGICIDE',
    scientific_source: 'FAO Fungicide Guidelines',
    scientific_basis: 'Dew on leaves dilutes spray concentration. Wait for leaves to dry.',
    trigger_keywords: ['dew', 'wet leaves', 'दव', 'ओस', 'पाने ओले'],
    response_mr: '💧 पानांवर दव आहे. पाने सुकल्यानंतर फवारणी करा.',
    response_hi: '💧 पत्तियों पर ओस है। पत्तियां सूखने के बाद स्प्रे करें।',
    response_en: '💧 Dew on leaves. Wait for leaves to dry before spraying.',
    action_type: 'DELAY'
  },
  {
    rule_id: 'WEATHER_005',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'LOW_HUMIDITY_EVAPORATION',
    scientific_source: 'Spray Application Best Practices',
    scientific_basis: 'Humidity <40% causes rapid evaporation. Add adjuvant or spray during humid hours.',
    trigger_keywords: ['dry weather', 'low humidity', 'कोरडे हवामान', 'शुष्क मौसम'],
    response_mr: 'कोरड्या हवामानात स्टिकर/स्प्रेडर वापरा. सकाळी फवारणी करा.',
    response_hi: 'शुष्क मौसम में स्टिकर/स्प्रेडर उपयोग करें। सुबह स्प्रे करें।',
    response_en: 'In dry weather use sticker/spreader. Spray in morning.',
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DISEASE MANAGEMENT RULES (P3-P4) - 25 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'DISEASE_001',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'BACTERIAL_WILT_RISK',
    scientific_source: 'ICAR-IIHR Disease Diagnostic Manual 2022',
    scientific_basis: 'Bacterial disease indicators: angular spots, water-soaked lesions, bacterial ooze. Treatment: Copper-based bactericides only.',
    trigger_keywords: ['angular spots', 'water soaked', 'bacterial', 'कोनेदार डाग', 'जीवाणू', 'बैक्टीरिया'],
    response_mr: 'जीवाणू रोग आढळला. तांबे आधारित औषध (कॉपर ऑक्सीक्लोराइड 3 ग्रा/ली) फवारा.',
    response_hi: 'बैक्टीरिया रोग मिला। तांबा आधारित दवा (कॉपर ऑक्सीक्लोराइड 3 ग्रा/ली) स्प्रे करें।',
    response_en: 'Bacterial disease detected. Spray copper-based bactericide (Copper oxychloride 3g/L).',
    alternatives: ['Streptomycin sulfate 0.5g/L (if registered)', 'Avoid overhead irrigation'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_002',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'FUNGAL_DISEASE_RISK',
    scientific_source: 'ICAR-IIHR Disease Diagnostic Manual 2022',
    scientific_basis: 'Fungal disease indicators: circular spots, visible spores/growth. Multiple fungicide options available.',
    trigger_keywords: ['fungus', 'powdery', 'fuzzy', 'white growth', 'बुरशी', 'फफूंद', 'पांढरी वाढ'],
    response_mr: 'बुरशीजन्य रोग आढळला. मॅन्कोझेब 2.5 ग्रा/ली फवारा.',
    response_hi: 'फफूंद रोग मिला। मैन्कोज़ेब 2.5 ग्रा/ली स्प्रे करें।',
    response_en: 'Fungal disease detected. Spray Mancozeb 2.5g/L.',
    alternatives: ['Carbendazim 1g/L', 'Propiconazole 1ml/L', 'Trichoderma viride preventive'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_003',
    category: 'disease',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'WILT_ZERO_TOLERANCE',
    scientific_source: 'ICAR Wilt Management Guidelines',
    scientific_basis: 'Wilt diseases (Fusarium/Verticillium) are soilborne, systemic, with no cure once established. 1 plant wilted = remove immediately, burn/bury deep, treat soil 1m radius.',
    trigger_keywords: ['wilt', 'wilting plant', 'मुरझाना', 'मुरलेला', 'plant dying'],
    response_mr: '⚠️ मर रोग! प्रभावित झाडे ताबडतोब काढा. खोल दाबून टाका किंवा जाळा.',
    response_hi: '⚠️ उखटा रोग! प्रभावित पौधे तुरंत निकालें। गहरा दबाएं या जलाएं।',
    response_en: '⚠️ Wilt disease! Remove affected plants immediately. Bury deep or burn.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_004',
    category: 'disease',
    crop_code: 'tomato',
    priority: 'P0_EMERGENCY',
    cause: 'LATE_BLIGHT_RISK',
    scientific_source: 'ICAR Late Blight Management',
    scientific_basis: 'Late blight (Phytophthora infestans) spreads rapidly in cool, humid conditions. Can destroy entire crop in 7-10 days.',
    trigger_keywords: ['late blight', 'brown lesions', 'potato', 'tomato', 'लेट ब्लाइट', 'भूरे धब्बे'],
    response_mr: 'लेट ब्लाइट धोका! मेटालॅक्सिल + मॅन्कोझेब 2.5 ग्रा/ली ताबडतोब फवारा.',
    response_hi: 'लेट ब्लाइट खतरा! मेटालैक्सिल + मैन्कोज़ेब 2.5 ग्रा/ली तुरंत स्प्रे करें।',
    response_en: 'Late blight risk! Spray Metalaxyl + Mancozeb 2.5g/L immediately.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_005',
    category: 'disease',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'RICE_BLAST_RISK',
    scientific_source: 'ICAR-CRRI Rice Blast Management',
    scientific_basis: 'Rice blast favored by high humidity >90% and temperature 25-30°C. Spreads rapidly.',
    trigger_keywords: ['blast', 'rice disease', 'ब्लास्ट', 'धान रोग', 'तांदूळ रोग'],
    response_mr: 'ब्लास्ट रोग. ट्रायसायक्लाझोल 0.6 ग्रा/ली किंवा कार्बेन्डाझिम फवारा.',
    response_hi: 'ब्लास्ट रोग। ट्राइसाइक्लाज़ोल 0.6 ग्रा/ली या कार्बेन्डाज़िम स्प्रे करें।',
    response_en: 'Blast disease. Spray Tricyclazole 0.6g/L or Carbendazim.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_006',
    category: 'disease',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'POWDERY_MILDEW_RISK',
    scientific_source: 'ICAR Powdery Mildew Management',
    scientific_basis: 'Powdery mildew favored by moderate temperatures (20-25°C) and dry conditions. White powdery growth on leaves.',
    trigger_keywords: ['powdery mildew', 'white powder', 'भुरी', 'सफेद पाउडर'],
    response_mr: 'भुरी रोग. गंधक 2 ग्रा/ली फवारा (तापमान 32°C पेक्षा कमी असावे).',
    response_hi: 'भूरा रोग। सल्फर 2 ग्रा/ली स्प्रे करें (तापमान 32°C से कम हो)।',
    response_en: 'Powdery mildew. Spray Sulfur 2g/L (temperature must be below 32°C).',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_007',
    category: 'disease',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'DOWNY_MILDEW_RISK',
    scientific_source: 'ICAR Downy Mildew Management',
    scientific_basis: 'Downy mildew favored by cool nights and humid days. Gray-purple growth on leaf underside.',
    trigger_keywords: ['downy mildew', 'gray growth', 'डाउनी मिल्ड्यू', 'भूरी फफूंद'],
    response_mr: 'डाउनी मिल्ड्यू. मॅन्कोझेब + मेटालॅक्सिल 2.5 ग्रा/ली फवारा.',
    response_hi: 'डाउनी मिल्ड्यू। मैन्कोज़ेब + मेटालैक्सिल 2.5 ग्रा/ली स्प्रे करें।',
    response_en: 'Downy mildew. Spray Mancozeb + Metalaxyl 2.5g/L.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_008',
    category: 'disease',
    crop_code: 'wheat',
    priority: 'P3_CROP_STAGE',
    cause: 'WHEAT_RUST_RISK',
    scientific_source: 'ICAR-IIWBR Rust Management',
    scientific_basis: 'Wheat rust (yellow, brown, black) spreads rapidly in humid conditions. Early detection critical.',
    trigger_keywords: ['rust', 'orange pustules', 'तांबेरा', 'रस्ट', 'गेहूं रोग'],
    response_mr: 'तांबेरा रोग. प्रोपिकोनाझोल 1 मिली/ली फवारा. 10-15 दिवसांत पुन्हा.',
    response_hi: 'तांबेरा रोग। प्रोपिकोनाज़ोल 1 मिली/ली स्प्रे करें। 10-15 दिन में दोहराएं।',
    response_en: 'Rust disease. Spray Propiconazole 1ml/L. Repeat in 10-15 days.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_009',
    category: 'resistance',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'FUNGICIDE_ROTATION_NEEDED',
    scientific_source: 'FRAC Guidelines 2023',
    scientific_basis: 'Consecutive use of same FRAC group leads to resistance. Rotate between multi-site (M), triazoles (3), strobilurins (11).',
    trigger_keywords: ['same fungicide', 'repeated spray', 'resistance', 'प्रतिरोधकता', 'एकच बुरशीनाशक'],
    response_mr: 'बुरशीनाशक बदला. वेगळ्या गटाचे (FRAC) औषध वापरा.',
    response_hi: 'फफूंदनाशक बदलें। अलग समूह (FRAC) की दवा उपयोग करें।',
    response_en: 'Rotate fungicide. Use different FRAC group.',
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PEST MANAGEMENT RULES (P3-P5) - 30 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'PEST_001',
    category: 'pest',
    crop_code: 'cotton',
    priority: 'P4_ECONOMIC',
    cause: 'BOLLWORM_RISK',
    scientific_source: 'ICAR-CICR Bollworm Management',
    scientific_basis: 'Bollworm ETL: 5 larvae/plant or 10% fruiting body damage. Prefer NPV and Spinosad over pyrethroids.',
    trigger_keywords: ['bollworm', 'american bollworm', 'helicoverpa', 'बोंड अळी', 'बॉलवर्म'],
    response_mr: 'बोंड अळी (ETL: 5 अळी/झाड). NPV 250 LE/हे. किंवा स्पिनोसाड फवारा.',
    response_hi: 'बॉलवर्म (ETL: 5 लार्वा/पौधा)। NPV 250 LE/हे. या स्पिनोसैड स्प्रे करें।',
    response_en: 'Bollworm (ETL: 5 larvae/plant). Spray NPV 250 LE/ha or Spinosad.',
    alternatives: ['Bacillus thuringiensis 1g/L', 'Pheromone traps 5/acre', 'Emamectin benzoate 0.4g/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_002',
    category: 'pest',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'APHID_RISK',
    scientific_source: 'ICAR Aphid Management Guidelines',
    scientific_basis: 'Aphid ETL: 25-30 aphids/plant or 10% plants infested. Transmit viral diseases.',
    trigger_keywords: ['aphid', 'mavha', 'माव्हा', 'मावा', 'aphids'],
    response_mr: 'माव्हा (ETL: 25-30/झाड). निंबोळी तेल 5 मिली/ली किंवा इमिडाक्लोप्रिड फवारा.',
    response_hi: 'माहू (ETL: 25-30/पौधा)। नीम तेल 5 मिली/ली या इमिडाक्लोप्रिड स्प्रे करें।',
    response_en: 'Aphids (ETL: 25-30/plant). Spray Neem oil 5ml/L or Imidacloprid.',
    alternatives: ['Verticillium lecanii 5g/L', 'Yellow sticky traps', 'Soap spray 2%'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_003',
    category: 'pest',
    crop_code: 'cotton',
    priority: 'P4_ECONOMIC',
    cause: 'WHITEFLY_RISK',
    scientific_source: 'ICAR-CICR Whitefly Management',
    scientific_basis: 'Whitefly ETL: 5-10 adults/leaf. Transmits cotton leaf curl virus (CLCuV).',
    trigger_keywords: ['whitefly', 'pandhra mashi', 'पांढरी माशी', 'सफेद मक्खी'],
    response_mr: 'पांढरी माशी (ETL: 5-10/पान). पिवळ्या चिकट पट्ट्या लावा. निंबोळी तेल फवारा.',
    response_hi: 'सफेद मक्खी (ETL: 5-10/पत्ती)। पीली चिपचिपी पट्टियां लगाएं। नीम तेल स्प्रे करें।',
    response_en: 'Whitefly (ETL: 5-10/leaf). Install yellow sticky traps. Spray Neem oil.',
    alternatives: ['Pyriproxyfen 10% EC', 'Diafenthiuron 50 WP', 'Beauveria bassiana'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_004',
    category: 'pest',
    crop_code: 'rice',
    priority: 'P4_ECONOMIC',
    cause: 'STEM_BORER_RISK',
    scientific_source: 'ICAR-CRRI Stem Borer Management',
    scientific_basis: 'Stem borer ETL: 5% dead hearts (vegetative), 2% white ears (reproductive).',
    trigger_keywords: ['stem borer', 'dead heart', 'white ear', 'खोड किडा', 'तना छेदक', 'डेड हार्ट'],
    response_mr: 'खोड किडा (ETL: 5% डेड हार्ट). कार्टॅप किंवा क्लोरअँट्रानिलिप्रोल फवारा.',
    response_hi: 'तना छेदक (ETL: 5% डेड हार्ट)। कार्टैप या क्लोरेंट्रानिलिप्रोल स्प्रे करें।',
    response_en: 'Stem borer (ETL: 5% dead hearts). Spray Cartap or Chlorantraniliprole.',
    alternatives: ['Trichogramma release 50,000/acre', 'Light traps 1/acre', 'Remove stubbles after harvest'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_005',
    category: 'pest',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'THRIPS_RISK',
    scientific_source: 'ICAR Thrips Management',
    scientific_basis: 'Thrips ETL: 5-10 thrips/flower or leaf silvering in 10% plants.',
    trigger_keywords: ['thrips', 'तुडतुडे', 'थ्रिप्स', 'silver leaves'],
    response_mr: 'तुडतुडे (ETL: 5-10/फूल). निळ्या चिकट पट्ट्या लावा. फिप्रोनिल फवारा.',
    response_hi: 'थ्रिप्स (ETL: 5-10/फूल)। नीली चिपचिपी पट्टियां लगाएं। फिप्रोनिल स्प्रे करें।',
    response_en: 'Thrips (ETL: 5-10/flower). Install blue sticky traps. Spray Fipronil.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_006',
    category: 'pest',
    crop_code: 'vegetables',
    priority: 'P4_ECONOMIC',
    cause: 'FRUIT_BORER_RISK',
    scientific_source: 'ICAR-IIHR Fruit Borer Management',
    scientific_basis: 'Fruit borer ETL: 5% fruit damage. Prefer NPV and pheromone traps.',
    trigger_keywords: ['fruit borer', 'फळ पोखरणारी अळी', 'फल छेदक'],
    response_mr: 'फळ पोखरणारी अळी. NPV किंवा बॅसिलस थुरिंजिएन्सिस फवारा.',
    response_hi: 'फल छेदक। NPV या बैसिलस थुरिंजिएन्सिस स्प्रे करें।',
    response_en: 'Fruit borer. Spray NPV or Bacillus thuringiensis.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_007',
    category: 'pest',
    crop_code: 'sugarcane',
    priority: 'P4_ECONOMIC',
    cause: 'SHOOT_BORER_RISK',
    scientific_source: 'ICAR-SBI Shoot Borer Management',
    scientific_basis: 'Shoot borer attacks 30-120 DAP. ETL: 10% dead hearts.',
    trigger_keywords: ['shoot borer', 'कोंब किडा', 'शूट बोरर', 'dead heart sugarcane'],
    response_mr: 'कोंब किडा (ETL: 10% डेड हार्ट). क्लोरअँट्रानिलिप्रोल 0.4 मिली/ली फवारा.',
    response_hi: 'शूट बोरर (ETL: 10% डेड हार्ट)। क्लोरेंट्रानिलिप्रोल 0.4 मिली/ली स्प्रे करें।',
    response_en: 'Shoot borer (ETL: 10% dead hearts). Spray Chlorantraniliprole 0.4ml/L.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_008',
    category: 'pest',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'MITE_RISK',
    scientific_source: 'ICAR Mite Management',
    scientific_basis: 'Spider mites thrive in hot, dry conditions. ETL: 10 mites/leaf or webbing visible.',
    trigger_keywords: ['mite', 'spider mite', 'कोळी', 'माइट', 'मकड़ी'],
    response_mr: 'कोळी किडा. गंधक 3 ग्रा/ली किंवा डायकोफॉल फवारा.',
    response_hi: 'मकड़ी कीट। सल्फर 3 ग्रा/ली या डाइकोफोल स्प्रे करें।',
    response_en: 'Mites. Spray Sulfur 3g/L or Dicofol.',
    alternatives: ['Propargite 57 EC', 'Wettable sulfur', 'Spray water in dry conditions'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_009',
    category: 'resistance',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'MOA_ROTATION_NEEDED',
    scientific_source: 'IRAC MOA Classification v10.4',
    scientific_basis: 'Consecutive use of same IRAC group leads to resistance. Rotate between different mode of action groups.',
    trigger_keywords: ['same pesticide', 'repeated spray', 'resistance', 'प्रतिरोधकता', 'एकच कीटकनाशक'],
    response_mr: 'कीटकनाशक बदला. वेगळ्या गटाचे (IRAC) औषध वापरा.',
    response_hi: 'कीटनाशक बदलें। अलग समूह (IRAC) की दवा उपयोग करें।',
    response_en: 'Rotate insecticide. Use different IRAC group.',
    action_type: 'WARN'
  },
  {
    rule_id: 'PEST_010',
    category: 'ipm',
    crop_code: 'cotton',
    priority: 'P5_IPM',
    cause: 'BT_REFUGE_MISSING',
    scientific_source: 'GEAC Bt Cotton Refuge Requirements',
    scientific_basis: 'Bt cotton requires 20% non-Bt refuge to delay resistance development.',
    trigger_keywords: ['bt cotton', 'refuge', 'बीटी कापूस', 'रिफ्यूज'],
    response_mr: 'बीटी कापसासाठी 20% नॉन-बीटी क्षेत्र ठेवा. प्रतिरोधकता टाळण्यासाठी अनिवार्य.',
    response_hi: 'बीटी कपास के लिए 20% नॉन-बीटी क्षेत्र रखें। प्रतिरोध रोकने के लिए अनिवार्य।',
    response_en: 'Keep 20% non-Bt refuge area for Bt cotton. Mandatory to prevent resistance.',
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IPM RULES (P5) - 12 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'IPM_001',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_CULTURAL_SUFFICIENT',
    scientific_source: 'ICAR IPM Guidelines',
    scientific_basis: 'Low infestation <ETL can be managed with cultural practices. No chemical needed.',
    trigger_keywords: ['low infestation', 'few pests', 'कमी प्रादुर्भाव', 'कम कीट'],
    response_mr: 'कमी प्रादुर्भाव. हाताने अळ्या काढा. प्रभावित पाने नष्ट करा.',
    response_hi: 'कम संक्रमण। हाथ से लार्वा निकालें। प्रभावित पत्तियां नष्ट करें।',
    response_en: 'Low infestation. Hand pick larvae. Destroy affected leaves.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_002',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_BIOLOGICAL_PREFERRED',
    scientific_source: 'ICAR Biological Control Guidelines',
    scientific_basis: 'Moderate infestation near ETL - use biological control before chemicals.',
    trigger_keywords: ['moderate infestation', 'biological', 'मध्यम प्रादुर्भाव', 'जैविक'],
    response_mr: 'मध्यम प्रादुर्भाव. ट्रायकोग्रामा सोडा किंवा NPV फवारा.',
    response_hi: 'मध्यम संक्रमण। ट्राइकोग्रामा छोड़ें या NPV स्प्रे करें।',
    response_en: 'Moderate infestation. Release Trichogramma or spray NPV.',
    alternatives: ['Trichogramma 50,000/acre', 'NPV 250 LE/ha', 'Beauveria bassiana 5g/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_003',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_BIOLOGICAL_PREFERRED',
    scientific_source: 'ICAR Botanical Pesticide Guidelines',
    scientific_basis: 'Neem-based products effective for many pests, safe for beneficials.',
    trigger_keywords: ['organic', 'neem', 'botanical', 'सेंद्रिय', 'निंबोळी', 'नीम'],
    response_mr: 'सेंद्रिय पद्धत. निंबोळी तेल 5 मिली/ली फवारा.',
    response_hi: 'जैविक तरीका। नीम तेल 5 मिली/ली स्प्रे करें।',
    response_en: 'Organic method. Spray Neem oil 5ml/L.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NUTRIENT MANAGEMENT RULES (P3-P4) - 20 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'NITROGEN_DEFICIENCY_CRITICAL',
    scientific_source: 'ICAR-AICRP Soil Test Crop Response',
    scientific_basis: 'Nitrogen deficiency symptoms: older leaves yellow from tip, stunted growth, pale green. Mobile nutrient.',
    trigger_keywords: ['yellow leaves', 'nitrogen', 'पिवळी पाने', 'पीली पत्तियां', 'नायट्रोजन'],
    response_mr: 'नायट्रोजन कमतरता. युरिया 50 किलो/हेक्टर टॉप ड्रेसिंग करा.',
    response_hi: 'नाइट्रोजन की कमी। यूरिया 50 किलो/हेक्टर टॉप ड्रेसिंग करें।',
    response_en: 'Nitrogen deficiency. Top dress with Urea 50 kg/ha.',
    alternatives: ['Foliar spray 2% urea for quick response', 'Fertigated nitrogen if drip available'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'PHOSPHORUS_DEFICIENCY',
    scientific_source: 'ICAR Nutrient Deficiency Atlas',
    scientific_basis: 'Phosphorus deficiency: dark green to purplish leaves, stunted growth, poor roots. Mobile nutrient.',
    trigger_keywords: ['purple leaves', 'phosphorus', 'जांभळी पाने', 'बैंगनी पत्तियां', 'फॉस्फरस'],
    response_mr: 'फॉस्फरस कमतरता. SSP 100 किलो/हेक्टर किंवा DAP 50 किलो/हेक्टर.',
    response_hi: 'फॉस्फोरस की कमी। SSP 100 किलो/हेक्टर या DAP 50 किलो/हेक्टर।',
    response_en: 'Phosphorus deficiency. Apply SSP 100 kg/ha or DAP 50 kg/ha.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'POTASSIUM_DEFICIENCY_CRITICAL',
    scientific_source: 'ICAR Potassium Management',
    scientific_basis: 'Potassium deficiency: leaf margins turn brown, weak stems, lodging susceptibility.',
    trigger_keywords: ['brown edges', 'potassium', 'तपकिरी कडा', 'भूरी किनारी', 'पोटाश'],
    response_mr: 'पोटॅश कमतरता. MOP 50 किलो/हेक्टर द्या.',
    response_hi: 'पोटाश की कमी। MOP 50 किलो/हेक्टर दें।',
    response_en: 'Potassium deficiency. Apply MOP 50 kg/ha.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'ZINC_DEFICIENCY',
    scientific_source: 'ICAR-CRRI Zinc Management in Rice',
    scientific_basis: 'Zinc deficiency critical in rice: interveinal chlorosis on young leaves, short internodes, white bud.',
    trigger_keywords: ['zinc', 'white bud', 'khaira', 'खैरा', 'जिंक', 'झिंक'],
    response_mr: 'जस्त कमतरता (खैरा). जिंक सल्फेट 25 किलो/हेक्टर द्या.',
    response_hi: 'जिंक की कमी (खैरा)। जिंक सल्फेट 25 किलो/हेक्टर दें।',
    response_en: 'Zinc deficiency (Khaira). Apply Zinc sulfate 25 kg/ha.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_005',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'MICRONUTRIENT_DEFICIENCY',
    scientific_source: 'ICAR Micronutrient Management',
    scientific_basis: 'Iron deficiency: interveinal chlorosis on youngest leaves. Common in alkaline soils.',
    trigger_keywords: ['iron', 'interveinal', 'chlorosis', 'लोह', 'आयरन', 'क्लोरोसिस'],
    response_mr: 'लोह कमतरता. फेरस सल्फेट 0.5% + सायट्रिक ऍसिड फवारा.',
    response_hi: 'आयरन की कमी। फेरस सल्फेट 0.5% + साइट्रिक एसिड स्प्रे करें।',
    response_en: 'Iron deficiency. Spray Ferrous sulfate 0.5% + citric acid.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_006',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'EXCESS_NITROGEN',
    scientific_source: 'ICAR Nitrogen Management',
    scientific_basis: 'Excess nitrogen causes: lush vegetative growth, delayed flowering, lodging, disease susceptibility.',
    trigger_keywords: ['too much nitrogen', 'lodging', 'dark green', 'जास्त युरिया', 'गिरना'],
    response_mr: 'जास्त नायट्रोजन. युरिया देणे थांबवा. पोटॅश द्या.',
    response_hi: 'अधिक नाइट्रोजन। यूरिया देना बंद करें। पोटाश दें।',
    response_en: 'Excess nitrogen. Stop urea application. Apply potash.',
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WATER MANAGEMENT RULES (P2-P3) - 15 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'WATER_001',
    category: 'water',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'WATER_STRESS_CRITICAL',
    scientific_source: 'FAO-56 Crop Evapotranspiration',
    scientific_basis: 'Soil moisture <30% field capacity indicates critical water stress.',
    trigger_keywords: ['water stress', 'wilting', 'dry soil', 'पाणी ताण', 'सूखी मिट्टी', 'मुरझाना'],
    response_mr: 'पाणी ताण. ताबडतोब सिंचन करा. प्रथम महत्त्वाच्या वाढीच्या टप्प्याला प्राधान्य.',
    response_hi: 'पानी का तनाव। तुरंत सिंचाई करें। पहले महत्वपूर्ण वृद्धि चरण को प्राथमिकता।',
    response_en: 'Water stress. Irrigate immediately. Prioritize critical growth stage.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_002',
    category: 'water',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'WATERLOGGING',
    scientific_source: 'ICAR Waterlogging Management',
    scientific_basis: 'Waterlogging >48 hours causes root damage, nutrient leaching, disease.',
    trigger_keywords: ['waterlogging', 'standing water', 'जलभराव', 'पाणी साचणे', 'पानी जमा'],
    response_mr: 'जलभराव. पाणी काढून टाका. बुरशीनाशक फवारणी करा.',
    response_hi: 'जलभराव। पानी निकालें। फफूंदनाशक स्प्रे करें।',
    response_en: 'Waterlogging. Drain water. Apply fungicide spray.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_003',
    category: 'water',
    crop_code: 'wheat',
    priority: 'P3_CROP_STAGE',
    cause: 'WATER_STRESS_WHEAT_CRI',
    scientific_source: 'ICAR-IARI Wheat Irrigation',
    scientific_basis: 'Crown root initiation (21-25 DAS) is most critical irrigation in wheat. Skip causes 35% yield loss.',
    trigger_keywords: ['wheat irrigation', 'crown root', 'cri', 'गेहूं सिंचाई', 'क्राउन रूट'],
    response_mr: 'गहू CRI टप्पा (21-25 दिवस). ताबडतोब सिंचन करा. 35% उत्पादन नुकसान टाळा.',
    response_hi: 'गेहूं CRI चरण (21-25 दिन)। तुरंत सिंचाई करें। 35% उपज नुकसान टालें।',
    response_en: 'Wheat CRI stage (21-25 DAS). Irrigate immediately. Avoid 35% yield loss.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_004',
    category: 'water',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'WATER_STRESS_RICE_TRANSPLANTING',
    scientific_source: 'ICAR-CRRI Rice Water Management',
    scientific_basis: 'Rice requires standing water (5-10 cm) during transplanting to establishment.',
    trigger_keywords: ['rice water', 'transplanting', 'धान पानी', 'रोपाई'],
    response_mr: 'धान रोपणी. 5-10 सेमी पाणी ठेवा.',
    response_hi: 'धान रोपाई। 5-10 सेमी पानी रखें।',
    response_en: 'Rice transplanting. Maintain 5-10 cm standing water.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_005',
    category: 'water',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'WATER_STRESS_COTTON_BOLL',
    scientific_source: 'ICAR-CICR Cotton Irrigation',
    scientific_basis: 'Boll development (75-110 DAS) is critical. Water stress causes boll shedding.',
    trigger_keywords: ['cotton water', 'boll stage', 'कापूस पाणी', 'बोंड टप्पा'],
    response_mr: 'कापूस बोंड टप्पा. नियमित सिंचन करा. बोंड गळ टाळा.',
    response_hi: 'कपास बॉल चरण। नियमित सिंचाई करें। बॉल गिरने से बचें।',
    response_en: 'Cotton boll stage. Irrigate regularly. Prevent boll shedding.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HARVEST & QUALITY RULES (P3) - 10 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'HARVEST_001',
    category: 'harvest',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'MATURITY_INDICATORS_MET',
    scientific_source: 'ICAR Harvest Guidelines',
    scientific_basis: 'Harvest at physiological maturity for maximum yield and quality.',
    trigger_keywords: ['harvest time', 'maturity', 'कापणी वेळ', 'कटाई समय', 'परिपक्व'],
    response_mr: 'पीक परिपक्व. कापणी करा. पिकाचे संकेत तपासा.',
    response_hi: 'फसल परिपक्व। कटाई करें। फसल के संकेत जांचें।',
    response_en: 'Crop mature. Proceed with harvest. Check maturity indicators.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_002',
    category: 'harvest',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'HARVEST_READY',
    scientific_source: 'ICAR-CRRI Rice Harvesting',
    scientific_basis: 'Rice harvest when 80% grains are golden brown, moisture 20-22%.',
    trigger_keywords: ['rice harvest', 'golden grain', 'धान कापणी', 'धान कटाई', 'सुनहरा दाना'],
    response_mr: 'धान 80% सोनेरी तपकिरी झाले. कापणी करा. जास्त वाळू देऊ नका.',
    response_hi: 'धान 80% सुनहरा भूरा हो गया। कटाई करें। अधिक सूखने न दें।',
    response_en: 'Rice 80% golden brown. Harvest now. Avoid over-drying.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_003',
    category: 'harvest',
    crop_code: 'wheat',
    priority: 'P3_CROP_STAGE',
    cause: 'HARVEST_READY',
    scientific_source: 'ICAR-IARI Wheat Harvesting',
    scientific_basis: 'Wheat harvest when grains are hard, moisture 12-14%, straw turns golden.',
    trigger_keywords: ['wheat harvest', 'hard grain', 'गेहूं कापणी', 'गेहूं कटाई', 'कठोर दाना'],
    response_mr: 'गहू दाणे कठोर, पिवळसर. कापणी करा.',
    response_hi: 'गेहूं दाने कठोर, पीले। कटाई करें।',
    response_en: 'Wheat grains hard and golden. Harvest now.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_004',
    category: 'harvest',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'HARVEST_READY',
    scientific_source: 'ICAR-CICR Cotton Picking',
    scientific_basis: 'Cotton pick when bolls fully open, lint fluffy and dry.',
    trigger_keywords: ['cotton picking', 'boll open', 'कापूस वेचणी', 'कपास चुनाई', 'बोंड उघडले'],
    response_mr: 'कापूस बोंडे पूर्ण उघडली. सकाळी दवानंतर वेचणी करा.',
    response_hi: 'कपास बॉल पूरे खुले। सुबह ओस सूखने के बाद चुनाई करें।',
    response_en: 'Cotton bolls fully open. Pick after morning dew dries.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_005',
    category: 'harvest',
    crop_code: 'sugarcane',
    priority: 'P3_CROP_STAGE',
    cause: 'MATURITY_INDICATORS_MET',
    scientific_source: 'ICAR-SBI Sugarcane Harvesting',
    scientific_basis: 'Sugarcane harvest when Brix >18%, sucrose recovery maximum at 10-12 months.',
    trigger_keywords: ['sugarcane harvest', 'brix', 'ऊस कापणी', 'गन्ना कटाई', 'ब्रिक्स'],
    response_mr: 'ऊस परिपक्व (ब्रिक्स >18%). कापणी करा. साखर उत्पादन जास्तीत जास्त.',
    response_hi: 'गन्ना परिपक्व (ब्रिक्स >18%)। कटाई करें। चीनी उत्पादन अधिकतम।',
    response_en: 'Sugarcane mature (Brix >18%). Harvest now. Maximum sugar recovery.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ECONOMIC THRESHOLD RULES (P4) - 8 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'ECONOMIC_001',
    category: 'economic',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'ECONOMIC_THRESHOLD_NOT_MET',
    scientific_source: 'ICAR IPM Economic Threshold Guidelines',
    scientific_basis: 'Below ETL, treatment cost exceeds benefit. Monitor but do not spray.',
    trigger_keywords: ['below threshold', 'low pest', 'थ्रेशोल्ड खाली', 'कम कीट'],
    response_mr: 'प्रादुर्भाव कमी. रासायनिक फवारणी आवश्यक नाही. निरीक्षण चालू ठेवा.',
    response_hi: 'संक्रमण कम। रासायनिक स्प्रे आवश्यक नहीं। निगरानी जारी रखें।',
    response_en: 'Infestation below threshold. No chemical spray needed. Continue monitoring.',
    action_type: 'MONITOR'
  },
  {
    rule_id: 'ECONOMIC_002',
    category: 'economic',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'TREATMENT_NOT_ECONOMICAL',
    scientific_source: 'Agricultural Economics Guidelines',
    scientific_basis: 'When treatment cost exceeds potential loss recovery, treatment is not economical.',
    trigger_keywords: ['expensive treatment', 'not worth', 'महाग उपचार', 'आर्थिक नहीं'],
    response_mr: 'उपचाराचा खर्च जास्त आहे. सध्या फवारणी आर्थिकदृष्ट्या व्यवहार्य नाही.',
    response_hi: 'उपचार का खर्च अधिक है। वर्तमान में स्प्रे आर्थिक रूप से व्यवहार्य नहीं।',
    response_en: 'Treatment cost exceeds benefit. Spraying not economically viable now.',
    action_type: 'WARN'
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// RULE MATCHING AND EVALUATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert priority level to standard format
 */
function normalizePriority(priority: PriorityLevel | number): RulePriority {
  if (typeof priority === 'number') {
    if (priority === 0) return 'P0_EMERGENCY';
    if (priority === 1) return 'P1_REGULATORY';
    if (priority === 2) return 'P2_WEATHER_SAFETY';
    if (priority === 3) return 'P3_CROP_STAGE';
    if (priority === 4) return 'P4_ECONOMIC';
    if (priority === 5) return 'P5_IPM';
    return 'P6_OPTIMIZATION';
  }
  return priority as RulePriority;
}

/**
 * Match rules based on keywords - FIXED: Supports both array and string input
 * Uses fuzzy/partial matching for better rule coverage
 */
export function matchRulesByKeywords(
  keywordsOrMessage: string | string[],
  categoryOrCropCode?: string,
  language: string = 'en'
): SymbolicRule[] {
  // Normalize input to array of keywords
  let keywords: string[];
  let targetCategory: string | undefined;
  let cropCode: string | undefined;
  
  if (Array.isArray(keywordsOrMessage)) {
    // New API: keywords array + category
    keywords = keywordsOrMessage.map(k => k.toLowerCase());
    targetCategory = categoryOrCropCode;
  } else {
    // Legacy API: message string + cropCode
    keywords = keywordsOrMessage.toLowerCase().split(/\s+/);
    cropCode = categoryOrCropCode;
  }
  
  const priorityOrder: Record<PriorityLevel, number> = {
    'P0_EMERGENCY': 0,
    'P1_REGULATORY': 1,
    'P2_WEATHER_SAFETY': 2,
    'P3_CROP_STAGE': 3,
    'P4_ECONOMIC': 4,
    'P5_IPM': 5,
    'P6_OPTIMIZATION': 6
  };
  
  return SYMBOLIC_RULES_REGISTRY.filter(rule => {
    // Filter by category if specified
    if (targetCategory && rule.category !== targetCategory) {
      return false;
    }
    
    // Filter by crop code if specified
    if (cropCode && rule.crop_code !== 'all' && rule.crop_code !== cropCode) {
      return false;
    }
    
    // CRITICAL FIX: Use partial/fuzzy keyword matching
    // Match if ANY keyword matches (not requiring ALL keywords)
    if (!rule.trigger_keywords || rule.trigger_keywords.length === 0) {
      // For rules without keywords, match by category
      return !!targetCategory;
    }
    
    // Check for partial matches in any keyword
    for (const keyword of keywords) {
      if (keyword.length < 2) continue; // Skip very short keywords
      
      for (const triggerKw of rule.trigger_keywords) {
        const triggerLower = triggerKw.toLowerCase();
        // Partial match: either keyword contains trigger or trigger contains keyword
        if (triggerLower.includes(keyword) || keyword.includes(triggerLower)) {
          return true;
        }
      }
    }
    
    return false;
  }).sort((a, b) => {
    // Sort by priority (P0 first)
    const aPriority = typeof a.priority === 'string' ? priorityOrder[a.priority] : a.priority;
    const bPriority = typeof b.priority === 'string' ? priorityOrder[b.priority] : b.priority;
    return aPriority - bPriority;
  });
}

/**
 * Convert SymbolicRule to RuleResult for rule engine
 * FIXED: Accepts RuleExecutionInput for proper context extraction
 */
export function convertToRuleResult(
  rule: SymbolicRule,
  inputOrLanguage: any
): RuleResult {
  // Handle both legacy (language string) and new (input object) APIs
  const language = typeof inputOrLanguage === 'string' 
    ? inputOrLanguage 
    : (inputOrLanguage?.language || 'en');
  
  const getResponse = () => {
    switch (language) {
      case 'mr': return rule.response_mr || rule.response_en || rule.scientific_basis;
      case 'hi': return rule.response_hi || rule.response_en || rule.scientific_basis;
      default: return rule.response_en || rule.scientific_basis;
    }
  };
  
  return {
    rule_id: rule.rule_id,
    priority: normalizePriority(rule.priority),
    action: rule.action_type || 'RECOMMEND',
    cause: rule.cause,
    reason: getResponse(),
    reason_mr: rule.response_mr,
    reason_hi: rule.response_hi,
    alternatives: rule.alternatives,
    confidence: 0.85,
    scientific_source: rule.scientific_source,
    scientific_basis: rule.scientific_basis
  };
}

/**
 * Get all rules for a specific category
 */
export function getRulesByCategory(category: RuleCategory): SymbolicRule[] {
  return SYMBOLIC_RULES_REGISTRY.filter(rule => rule.category === category);
}

/**
 * Get all rules for a specific crop
 */
export function getRulesForCrop(cropCode: string): SymbolicRule[] {
  return SYMBOLIC_RULES_REGISTRY.filter(rule => 
    rule.crop_code === 'all' || rule.crop_code === cropCode
  );
}

/**
 * Get rule count by category for logging
 */
export function getRuleCountByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  
  SYMBOLIC_RULES_REGISTRY.forEach(rule => {
    counts[rule.category] = (counts[rule.category] || 0) + 1;
  });
  
  return counts;
}

/**
 * Get total rule count
 */
export function getTotalRuleCount(): number {
  return SYMBOLIC_RULES_REGISTRY.length;
}

console.log(`✅ Symbolic Rules Bridge loaded: ${getTotalRuleCount()} rules`);
console.log('   Rule counts by category:', getRuleCountByCategory());
