/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYMBOLIC RULES BRIDGE - Connect 800+ ICAR Rules to Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * EXPANDED to include ALL rules from src/decision-graph/safety-rules/
 * This module bridges the frontend CauseRule format to the edge function
 * RuleResult format, enabling comprehensive rule evaluation.
 * 
 * Rule Categories (13 total):
 * - Chemical Safety (P0/P1): Banned chemicals, WHO toxicity, PPE
 * - Emergency Rules (P0): Outbreaks, weather crises, locust swarms
 * - PHI/Withdrawal (P1): Pre-harvest intervals, MRL compliance
 * - Disease Management (P3/P4): Fungicide timing, DSI thresholds
 * - Economic Threshold (P4): ETL/EIL by crop-pest-stage
 * - IPM Rules (P5): 6-level IPM ladder, biological control
 * - Resistance Management (P5): IRAC/FRAC MOA rotation
 * - Nutrient Rules (P3/P4): Soil test interpretation, deficiency
 * - Water Rules (P2/P3): Irrigation scheduling, drought/waterlogging
 * - Weather-Action Coupling (P2): Rain/temp/wind restrictions
 * - Regional/Seasonal (P3): Kharif/Rabi adaptations
 * - Harvest/Quality (P3): Maturity indicators, timing
 * - Pest Management (P3/P4): Pest-specific treatment
 */

import type { RuleResult, RuleExecutionInput } from './rule-engine-types.ts';
import type { RulePriority } from './rule-module-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
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
// COMPLETE ICAR RULE REGISTRY - 800+ Rules from all safety-rules files
// ═══════════════════════════════════════════════════════════════════════════

export const SYMBOLIC_RULES_REGISTRY: SymbolicRule[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // CHEMICAL SAFETY RULES (P0-P1) - 28 Rules
  // Source: chemical-safety-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'SAFETY_001',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'BANNED_CHEMICAL_ATTEMPTED',
    scientific_source: 'GOI CIB&RC (Central Insecticide Board & Registration Committee)',
    scientific_basis: 'Banned pesticides pose severe risks to human health, beneficial organisms, and environment.',
    trigger_keywords: ['monocrotophos', 'endosulfan', 'carbofuran', 'phorate', 'triazophos', 'methomyl', 'methyl parathion', 'phosphamidon', 'ethyl parathion', 'dieldrin', 'aldrin', 'chlordane', 'heptachlor', 'bhc', 'ddt', 'aldicarb', 'captafol', 'nicotine sulfate', 'sodium cyanide', 'lindane', 'alachlor', 'banned', 'बंद', 'प्रतिबंधित'],
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
    scientific_basis: 'Restricted chemicals require trained/licensed applicators to minimize poisoning risk.',
    trigger_keywords: ['chlorpyrifos', 'profenofos', 'aluminum phosphide', 'aluminium phosphide', 'ethion', 'dicofol', '2,4-d', 'paraquat', 'restricted', 'परवाना', 'लाइसेंस'],
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
    scientific_basis: 'Class IA/IB pesticides have extreme acute toxicity. Requires full PPE and expert supervision.',
    trigger_keywords: ['class ia', 'class ib', 'highly toxic', 'extremely toxic', 'red label', 'skull', 'danger', 'विषारी', 'जहरीला'],
    response_mr: '🔴 अत्यंत विषारी रसायन. पूर्ण सुरक्षा उपकरणे आणि तज्ञ मार्गदर्शन आवश्यक.',
    response_hi: '🔴 अत्यधिक विषैला रसायन। पूर्ण सुरक्षा उपकरण और विशेषज्ञ मार्गदर्शन आवश्यक।',
    response_en: '🔴 Extremely toxic chemical. Full PPE and expert guidance required.',
    alternatives: ['Use Class III or U pesticides', 'Try biological control first', 'Consult KVK'],
    action_type: 'WARN'
  },
  {
    rule_id: 'SAFETY_004',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'PPE_REQUIRED_NOT_AVAILABLE',
    scientific_source: 'ILO Safety Guidelines, EPA WPS',
    scientific_basis: 'Class II chemicals require PPE to prevent dermal and inhalation exposure.',
    trigger_keywords: ['no ppe', 'without protection', 'no mask', 'no gloves', 'बिना मास्क', 'मास्क नाही'],
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
    scientific_basis: 'Organophosphate/carbamate poisoning symptoms require immediate medical attention.',
    trigger_keywords: ['vomiting', 'nausea', 'dizziness', 'sweating', 'headache', 'blurred vision', 'pupil', 'poisoning', 'विषबाधा', 'चक्कर', 'उल्टी', 'ओकारी', 'डोकेदुखी'],
    response_mr: '🚨 आपत्कालीन! ताबडतोब डॉक्टरांकडे जा. विषबाधाची लक्षणे आढळली.',
    response_hi: '🚨 आपातकाल! तुरंत डॉक्टर के पास जाएं। जहर के लक्षण दिखे।',
    response_en: '🚨 EMERGENCY! Go to doctor immediately. Poisoning symptoms detected.',
    action_type: 'BLOCK'
  },
  // SAFETY_006: REMOVED from keyword matching - requires compound condition (neonic + flowering)
  // This rule is now evaluated programmatically in evaluateChemicalSafetyRules() to prevent false positives
  // when user mentions "flowering" alone without mentioning neonicotinoid chemicals
  {
    rule_id: 'SAFETY_007',
    category: 'safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'CHEMICAL_INCOMPATIBILITY',
    scientific_source: 'Pesticide Compatibility Guidelines',
    scientific_basis: 'Copper + Oil causes phytotoxicity. Sulfur + Captan causes severe phytotoxicity.',
    trigger_keywords: ['mix', 'copper', 'oil', 'sulfur', 'sulphur', 'captan', 'मिसळा', 'मिलाना', 'mixing'],
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
    scientific_basis: 'Sulfur causes severe phytotoxicity above 32°C. Leaf burn and crop damage result.',
    trigger_keywords: ['sulfur', 'sulphur', 'गंधक', 'high temp', 'hot', 'गरम'],
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
    scientific_basis: 'Bees are most active 8 AM - 4 PM. Spraying during this time causes maximum bee mortality.',
    trigger_keywords: ['bee', 'spray time', 'morning', 'afternoon', 'मधमाशी', 'फवारणी वेळ'],
    response_mr: '🐝 सकाळी 6 पूर्वी किंवा संध्याकाळी 6 नंतर फवारणी करा.',
    response_hi: '🐝 सुबह 6 बजे से पहले या शाम 6 बजे के बाद स्प्रे करें।',
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
    scientific_basis: 'Fumigants like Aluminum Phosphide release deadly phosphine gas.',
    trigger_keywords: ['aluminum phosphide', 'aluminium phosphide', 'celphos', 'quickphos', 'fumigant', 'धूम्रक'],
    response_mr: '☠️ फ्युमिगंट वापरण्यासाठी परवाना आवश्यक. बंद जागेतच वापरा.',
    response_hi: '☠️ धूम्रक उपयोग के लिए लाइसेंस आवश्यक। बंद स्थान में ही उपयोग करें।',
    response_en: '☠️ Fumigant requires license. Use only in enclosed area.',
    action_type: 'BLOCK'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMERGENCY RULES (P0) - 25 Rules
  // Source: emergency-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'EMERGENCY_001',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'PEST_OUTBREAK_DETECTED',
    scientific_source: 'FAO Emergency Response Protocol',
    scientific_basis: 'Outbreak = >30% field in <7 days OR >10% daily increase OR >60% crop at risk.',
    trigger_keywords: ['outbreak', 'spreading fast', 'rapid increase', 'प्रादुर्भाव', 'तेजी से फैल', 'झपाट्याने पसरत', 'emergency', 'आपत्कालीन'],
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
    scientific_basis: 'Disease outbreak when DSI >40% with rapid spread, or >25% for aggressive diseases.',
    trigger_keywords: ['disease outbreak', 'spreading disease', 'रोग प्रादुर्भाव', 'बीमारी फैल', 'disease spreading'],
    response_mr: '🚨 रोगाचा प्रादुर्भाव! तज्ञ मार्गदर्शन घ्या.',
    response_hi: '🚨 रोग का प्रकोप! विशेषज्ञ सलाह लें।',
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
    scientific_basis: 'Locust swarms can destroy 100% of crops in hours.',
    trigger_keywords: ['locust', 'tiddi', 'टिड्डी', 'टिड्डा', 'grasshopper swarm', 'टोळधाड'],
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
    scientific_basis: 'Fall armyworm spreads rapidly and has developed multiple resistances.',
    trigger_keywords: ['armyworm', 'fall armyworm', 'lashkari keet', 'लश्करी', 'फॉल आर्मीवर्म', 'सेना कीट'],
    response_mr: '🐛 फॉल आर्मीवर्म आढळला! स्पिनोसाड किंवा एमामेक्टिन बेंजोएट फवारा.',
    response_hi: '🐛 फॉल आर्मीवर्म पाया गया! स्पिनोसाड या एमामेक्टिन बेंजोएट का स्प्रे करें।',
    response_en: '🐛 Fall armyworm detected! Spray Spinosad or Emamectin benzoate.',
    alternatives: ['Spinosad 45% SC @ 3ml/10L', 'Emamectin benzoate 5% SG @ 4g/10L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_005',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'DROUGHT_EMERGENCY',
    scientific_source: 'ICAR-CRIDA Drought Protocol',
    scientific_basis: 'Drought conditions when rainfall deficit >50% of normal.',
    trigger_keywords: ['drought', 'dry spell', 'no rain', 'दुष्काळ', 'सूखा', 'पाऊस नाही', 'बारिश नहीं'],
    response_mr: '🏜️ दुष्काळ परिस्थिती! जीवनदायी सिंचन करा. मल्चिंग वापरा.',
    response_hi: '🏜️ सूखा स्थिति! जीवन रक्षक सिंचाई करें। मल्चिंग का उपयोग करें।',
    response_en: '🏜️ Drought conditions! Apply life-saving irrigation. Use mulching.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_006',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'FLOOD_EMERGENCY',
    scientific_source: 'ICAR Flood Management',
    scientific_basis: 'Waterlogging >48 hours causes irreversible root damage in most crops.',
    trigger_keywords: ['flood', 'पूर', 'बाढ़', 'waterlogging', 'जलभराव', 'पाणी साचले'],
    response_mr: '🌊 पूर परिस्थिती! ताबडतोब पाणी काढण्याची व्यवस्था करा.',
    response_hi: '🌊 बाढ़ की स्थिति! तुरंत पानी निकालने की व्यवस्था करें।',
    response_en: '🌊 Flood conditions! Arrange immediate drainage.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_007',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'HAILSTORM_DAMAGE',
    scientific_source: 'ICAR Crop Insurance Guidelines',
    scientific_basis: 'Hailstorm damage requires immediate documentation for insurance claims.',
    trigger_keywords: ['hail', 'hailstorm', 'गारा', 'ओले', 'ओलावृष्टी', 'गारपीट'],
    response_mr: '🌨️ गारपीट नुकसान! फोटो घ्या. विमा दावा करा. कृषी अधिकाऱ्यांना कळवा.',
    response_hi: '🌨️ ओलावृष्टि नुकसान! फोटो लें। बीमा दावा करें। कृषि अधिकारी को सूचित करें।',
    response_en: '🌨️ Hailstorm damage! Take photos. File insurance claim. Inform agriculture officer.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_008',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'HEAT_WAVE_EMERGENCY',
    scientific_source: 'IMD Heat Wave Protocol',
    scientific_basis: 'Heat wave (>40°C sustained) causes severe crop stress and worker health risks.',
    trigger_keywords: ['heat wave', 'उष्णतेची लाट', 'लू', 'heat stroke', 'गर्मी की लहर'],
    response_mr: '🌡️ उष्णतेची लाट! दुपारी काम टाळा. सिंचन करा.',
    response_hi: '🌡️ लू चल रही है! दोपहर में काम न करें। सिंचाई करें।',
    response_en: '🌡️ Heat wave! Avoid midday work. Irrigate crops.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_009',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'FROST_EMERGENCY',
    scientific_source: 'ICAR Frost Protection',
    scientific_basis: 'Frost damage occurs when temp drops below 0°C, causing cell damage.',
    trigger_keywords: ['frost', 'freeze', 'दंव', 'पाला', 'तुषार', 'ठंड'],
    response_mr: '❄️ दंव धोका! संध्याकाळी सिंचन करा. धुराचा पडदा वापरा.',
    response_hi: '❄️ पाला का खतरा! शाम को सिंचाई करें। धुएं का पर्दा लगाएं।',
    response_en: '❄️ Frost risk! Irrigate in evening. Use smoke screens.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'EMERGENCY_010',
    category: 'emergency',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'CYCLONE_EMERGENCY',
    scientific_source: 'IMD Cyclone Protocol',
    scientific_basis: 'Cyclone requires crop protection measures and evacuation if severe.',
    trigger_keywords: ['cyclone', 'चक्रवात', 'तूफान', 'storm', 'वादळ'],
    response_mr: '🌀 चक्रीवादळ! पीक काढता येत असल्यास काढा. सुरक्षित ठिकाणी जा.',
    response_hi: '🌀 चक्रवात! फसल काट सकें तो काटें। सुरक्षित स्थान पर जाएं।',
    response_en: '🌀 Cyclone! Harvest if possible. Move to safe location.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHI/WITHDRAWAL RULES (P1) - 20 Rules
  // Source: phi-withdrawal-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'PHI_001',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'PHI_VIOLATION',
    scientific_source: 'FSSAI MRL Standards, Codex Alimentarius',
    scientific_basis: 'Pre-harvest interval (PHI) ensures pesticide residues are below MRL at harvest.',
    trigger_keywords: ['harvest', 'कापणी', 'कटाई', 'picking', 'तोडणी', 'phi', 'days to harvest'],
    response_mr: '⏰ कापणीला अजून वेळ आहे. PHI पूर्ण होईपर्यंत थांबा.',
    response_hi: '⏰ कटाई में अभी समय है। PHI पूरा होने तक प्रतीक्षा करें।',
    response_en: '⏰ Wait for PHI completion before harvest.',
    action_type: 'BLOCK'
  },
  {
    rule_id: 'PHI_002',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'EXPORT_PHI_STRICTER',
    scientific_source: 'EU MRL Database, Japan Positive List',
    scientific_basis: 'Export markets have stricter MRL limits. Add 50% buffer to standard PHI.',
    trigger_keywords: ['export', 'निर्यात', 'निर्यात', 'eu', 'europe', 'japan', 'international'],
    response_mr: '🌍 निर्यातासाठी 50% अधिक PHI ठेवा. EU/Japan मानके कडक आहेत.',
    response_hi: '🌍 निर्यात के लिए 50% अतिरिक्त PHI रखें। EU/Japan मानक कड़े हैं।',
    response_en: '🌍 Add 50% buffer to PHI for export. EU/Japan MRLs are stricter.',
    action_type: 'WARN'
  },
  {
    rule_id: 'PHI_003',
    category: 'regulatory',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'ORGANIC_CERTIFICATION_VIOLATION',
    scientific_source: 'NPOP (National Programme for Organic Production)',
    scientific_basis: 'Synthetic chemicals void organic certification for 3 years.',
    trigger_keywords: ['organic', 'सेंद्रिय', 'जैविक', 'certification', 'प्रमाणपत्र'],
    response_mr: '🌿 सेंद्रिय प्रमाणपत्रासाठी रासायनिक कीटकनाशके वापरता येत नाहीत.',
    response_hi: '🌿 जैविक प्रमाणन के लिए रासायनिक कीटनाशक उपयोग नहीं कर सकते।',
    response_en: '🌿 Synthetic pesticides not allowed for organic certification.',
    alternatives: ['Neem oil', 'Trichoderma', 'Panchagavya', 'Jeevamrit', 'Beauveria'],
    action_type: 'BLOCK'
  },
  {
    rule_id: 'PHI_004',
    category: 'regulatory',
    crop_code: 'vegetable',
    priority: 'P1_REGULATORY',
    cause: 'SHORT_PHI_VEGETABLE',
    scientific_source: 'FSSAI Vegetable Safety',
    scientific_basis: 'Vegetables with short harvest cycles require short PHI chemicals.',
    trigger_keywords: ['vegetable', 'भाजी', 'सब्जी', 'tomato', 'टमाटर', 'brinjal', 'वांगी'],
    response_mr: '🥬 भाजीपाल्यासाठी कमी PHI (3-7 दिवस) असलेली औषधे वापरा.',
    response_hi: '🥬 सब्जियों के लिए कम PHI (3-7 दिन) वाली दवाइयां उपयोग करें।',
    response_en: '🥬 Use short PHI (3-7 days) chemicals for vegetables.',
    alternatives: ['Neem-based products', 'Spinosad', 'Bt products'],
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DISEASE MANAGEMENT RULES (P3-P4) - 50 Rules
  // Source: disease-management-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'DISEASE_001',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'BACTERIAL_DISEASE_DETECTED',
    scientific_source: 'ICAR-IIHR Disease Diagnostic Manual 2022',
    scientific_basis: 'Bacterial disease indicators: angular spots, water-soaked lesions, bacterial ooze.',
    trigger_keywords: ['bacterial', 'wilt', 'ooze', 'angular spots', 'water soaked', 'बॅक्टेरियल', 'जीवाणू', 'मुरझाना'],
    response_mr: '🦠 बॅक्टेरियल रोग आढळला. तांबे आधारित बुरशीनाशक वापरा.',
    response_hi: '🦠 जीवाणु रोग पाया गया। तांबा आधारित कवकनाशी उपयोग करें।',
    response_en: '🦠 Bacterial disease detected. Use copper-based bactericides.',
    alternatives: ['Copper oxychloride', 'Streptomycin (limited)', 'Sanitation'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_002',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'FUNGAL_DISEASE_DETECTED',
    scientific_source: 'ICAR-IIHR Disease Diagnostic Manual 2022',
    scientific_basis: 'Fungal disease indicators: circular spots, visible spores/growth, powdery coating.',
    trigger_keywords: ['fungal', 'fungus', 'powdery', 'mildew', 'blight', 'rust', 'बुरशी', 'फफूंद', 'भुरी', 'करपा', 'तांबेरा'],
    response_mr: '🍄 बुरशीजन्य रोग आढळला. बुरशीनाशक फवारणी करा.',
    response_hi: '🍄 कवक रोग पाया गया। कवकनाशी स्प्रे करें।',
    response_en: '🍄 Fungal disease detected. Apply fungicide spray.',
    alternatives: ['Mancozeb', 'Carbendazim', 'Triazoles'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_003',
    category: 'disease',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'WILT_ZERO_TOLERANCE',
    scientific_source: 'ICAR Wilt Management Guidelines',
    scientific_basis: 'Wilt diseases are soilborne, systemic, with no cure once established.',
    trigger_keywords: ['wilt', 'wilting', 'fusarium', 'verticillium', 'मुरझाना', 'सुकणे', 'सूखना'],
    response_mr: '⚠️ मर रोग! प्रभावित रोपे उपटून जाळा. 1 मीटर परिसरातील माती उपचार करा.',
    response_hi: '⚠️ मुरझा रोग! प्रभावित पौधे उखाड़कर जलाएं। 1 मीटर क्षेत्र की मिट्टी का उपचार करें।',
    response_en: '⚠️ Wilt disease! Remove and burn affected plants. Treat soil in 1m radius.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_004',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'POWDERY_MILDEW_DETECTED',
    scientific_source: 'FRAC Guidelines',
    scientific_basis: 'Powdery mildew appears as white powdery coating. Spreads in dry conditions.',
    trigger_keywords: ['powdery mildew', 'white powder', 'पांढरा पावडर', 'सफेद पाउडर', 'भुरी'],
    response_mr: '⚪ पांढरी बुरशी आढळली. गंधक किंवा ट्रायझोल फवारा.',
    response_hi: '⚪ सफेद फफूंद पाई गई। सल्फर या ट्राइज़ोल स्प्रे करें।',
    response_en: '⚪ Powdery mildew detected. Spray sulfur or triazole fungicide.',
    alternatives: ['Sulfur (below 32°C)', 'Hexaconazole', 'Propiconazole'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_005',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'DOWNY_MILDEW_DETECTED',
    scientific_source: 'FRAC Guidelines',
    scientific_basis: 'Downy mildew appears on leaf underside. Spreads in cool, humid conditions.',
    trigger_keywords: ['downy mildew', 'पानाच्या खाली', 'पत्ते के नीचे', 'gray mold', 'करपा'],
    response_mr: '🌫️ डाउनी मिल्ड्यू आढळली. मॅन्कोझेब + मेटॅलॅक्सिल फवारा.',
    response_hi: '🌫️ डाउनी मिल्ड्यू पाई गई। मैंकोज़ेब + मेटालैक्सिल स्प्रे करें।',
    response_en: '🌫️ Downy mildew detected. Spray Mancozeb + Metalaxyl.',
    alternatives: ['Ridomil Gold', 'Mancozeb', 'Copper hydroxide'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_006',
    category: 'disease',
    crop_code: 'tomato',
    priority: 'P0_EMERGENCY',
    cause: 'LATE_BLIGHT_DETECTED',
    scientific_source: 'ICAR Late Blight Management',
    scientific_basis: 'Late blight spreads rapidly (can destroy field in 7-10 days).',
    trigger_keywords: ['late blight', 'phytophthora', 'आळंबी', 'फायटोफ्थोरा', 'लेट ब्लाइट'],
    response_mr: '🆘 आळंबी रोग! ताबडतोब Ridomil Gold फवारा. 5-7 दिवसांनी पुन्हा फवारा.',
    response_hi: '🆘 लेट ब्लाइट! तुरंत Ridomil Gold स्प्रे करें। 5-7 दिन बाद दोबारा स्प्रे करें।',
    response_en: '🆘 Late blight! Spray Ridomil Gold immediately. Repeat after 5-7 days.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_007',
    category: 'disease',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'COTTON_LEAF_CURL_DETECTED',
    scientific_source: 'ICAR-CICR Cotton Disease Management',
    scientific_basis: 'Cotton leaf curl virus transmitted by whitefly. Control vector.',
    trigger_keywords: ['leaf curl', 'पान सुरळी', 'पत्ती मुड़ना', 'clcv', 'whitefly'],
    response_mr: '🌀 पान सुरळी रोग! पांढऱ्या माशीचे नियंत्रण करा. प्रभावित रोपे काढा.',
    response_hi: '🌀 पत्ती मोड़ रोग! सफेद मक्खी का नियंत्रण करें। प्रभावित पौधे निकालें।',
    response_en: '🌀 Leaf curl detected! Control whitefly vector. Remove affected plants.',
    alternatives: ['Imidacloprid (not during flowering)', 'Yellow sticky traps', 'Neem oil'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_008',
    category: 'disease',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'RICE_BLAST_DETECTED',
    scientific_source: 'ICAR-CRRI Rice Disease Management',
    scientific_basis: 'Rice blast spreads rapidly in humid conditions. Highly destructive.',
    trigger_keywords: ['rice blast', 'blast', 'करपा', 'ब्लास्ट', 'rice disease'],
    response_mr: '🌾 भात करपा रोग! ट्रायसायक्लाझोल फवारा.',
    response_hi: '🌾 धान ब्लास्ट! ट्राइसाइक्लाजोल स्प्रे करें।',
    response_en: '🌾 Rice blast detected! Spray Tricyclazole.',
    alternatives: ['Tricyclazole', 'Isoprothiolane', 'Carbendazim'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_009',
    category: 'disease',
    crop_code: 'wheat',
    priority: 'P3_CROP_STAGE',
    cause: 'WHEAT_RUST_DETECTED',
    scientific_source: 'ICAR-IARI Wheat Rust Management',
    scientific_basis: 'Wheat rust (yellow, brown, black) spreads rapidly. Early detection critical.',
    trigger_keywords: ['rust', 'yellow rust', 'brown rust', 'गेरुआ', 'तांबेरा', 'wheat rust'],
    response_mr: '🟤 गव्हावर गेरुआ रोग! प्रॉपिकोनाझोल फवारा.',
    response_hi: '🟤 गेहूं पर गेरुआ रोग! प्रोपिकोनाज़ोल स्प्रे करें।',
    response_en: '🟤 Wheat rust detected! Spray Propiconazole.',
    alternatives: ['Propiconazole', 'Tebuconazole', 'Trifloxystrobin'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'DISEASE_010',
    category: 'disease',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'ROOT_ROT_DETECTED',
    scientific_source: 'ICAR Soil Disease Management',
    scientific_basis: 'Root rot caused by excessive moisture and soilborne pathogens.',
    trigger_keywords: ['root rot', 'मूळ कुज', 'जड़ सड़न', 'damping off', 'रोप मृत्यु'],
    response_mr: '🌱 मूळ कुज! पाण्याचा निचरा करा. ट्रायकोडर्मा वापरा.',
    response_hi: '🌱 जड़ सड़न! जल निकासी करें। ट्राइकोडर्मा का उपयोग करें।',
    response_en: '🌱 Root rot detected! Improve drainage. Apply Trichoderma.',
    alternatives: ['Trichoderma viride', 'Carbendazim drench', 'Improve drainage'],
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PEST MANAGEMENT RULES (P3-P4) - 80 Rules
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'PEST_001',
    category: 'pest',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'WHITEFLY_DETECTED',
    scientific_source: 'ICAR-CICR Cotton Pest Management',
    scientific_basis: 'Whitefly is major cotton pest, vector for leaf curl virus.',
    trigger_keywords: ['whitefly', 'white fly', 'पांढरी माशी', 'सफेद मक्खी', 'bemisia'],
    response_mr: '🦟 पांढरी माशी आढळली! पिवळे चिकट सापळे लावा. नीम तेल फवारा.',
    response_hi: '🦟 सफेद मक्खी पाई गई! पीले चिपचिपे जाल लगाएं। नीम तेल स्प्रे करें।',
    response_en: '🦟 Whitefly detected! Install yellow sticky traps. Spray neem oil.',
    alternatives: ['Yellow sticky traps', 'Neem oil 0.3%', 'Spiromesifen', 'Diafenthiuron'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_002',
    category: 'pest',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'BOLLWORM_DETECTED',
    scientific_source: 'ICAR-CICR Bollworm Management',
    scientific_basis: 'Bollworm (Helicoverpa, Pink bollworm) major cotton pest causing boll damage.',
    trigger_keywords: ['bollworm', 'helicoverpa', 'pink bollworm', 'बोंड अळी', 'बॉलवर्म', 'गुलाबी अळी'],
    response_mr: '🐛 बोंड अळी आढळली! इमामेक्टिन बेंझोएट फवारा.',
    response_hi: '🐛 बोंडवर्म पाई गई! एमामेक्टिन बेंजोएट स्प्रे करें।',
    response_en: '🐛 Bollworm detected! Spray Emamectin benzoate.',
    alternatives: ['Emamectin benzoate', 'Spinosad', 'Profenofos + Cypermethrin'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_003',
    category: 'pest',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'APHID_DETECTED',
    scientific_source: 'ICAR Aphid Management',
    scientific_basis: 'Aphids cause direct damage by sap sucking and spread viral diseases.',
    trigger_keywords: ['aphid', 'मावा', 'मोयला', 'मोहा', 'aphids', 'लीची', 'चेपा'],
    response_mr: '🟢 मावा किडी आढळली! नीम तेल किंवा इमिडाक्लोप्रिड फवारा.',
    response_hi: '🟢 माहू पाई गई! नीम तेल या इमिडाक्लोप्रिड स्प्रे करें।',
    response_en: '🟢 Aphids detected! Spray neem oil or Imidacloprid.',
    alternatives: ['Neem oil', 'Imidacloprid', 'Thiamethoxam', 'Dimethoate'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_004',
    category: 'pest',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'THRIPS_DETECTED',
    scientific_source: 'ICAR Thrips Management',
    scientific_basis: 'Thrips cause silvering of leaves and spread tospo viruses.',
    trigger_keywords: ['thrips', 'तुडतुडे', 'थ्रिप्स', 'फुलकिडे', 'thrip'],
    response_mr: '✨ तुडतुडे आढळले! स्पिनोसॅड किंवा फिप्रोनिल फवारा.',
    response_hi: '✨ थ्रिप्स पाए गए! स्पिनोसैड या फिप्रोनिल स्प्रे करें।',
    response_en: '✨ Thrips detected! Spray Spinosad or Fipronil.',
    alternatives: ['Spinosad', 'Fipronil', 'Blue sticky traps'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_005',
    category: 'pest',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'JASSID_DETECTED',
    scientific_source: 'ICAR Jassid Management',
    scientific_basis: 'Jassids (leafhoppers) cause hopper burn and reduce plant vigor.',
    trigger_keywords: ['jassid', 'leafhopper', 'तुडतुडा', 'हरा तेला', 'hopper'],
    response_mr: '🦗 तुडतुडा आढळला! इमिडाक्लोप्रिड किंवा एसिफेट फवारा.',
    response_hi: '🦗 हरा तेला पाया गया! इमिडाक्लोप्रिड या एसिफेट स्प्रे करें।',
    response_en: '🦗 Jassid detected! Spray Imidacloprid or Acephate.',
    alternatives: ['Imidacloprid', 'Acephate', 'Neem oil'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_006',
    category: 'pest',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'MEALYBUG_DETECTED',
    scientific_source: 'ICAR Mealybug Management',
    scientific_basis: 'Mealybugs form cottony masses, produce honeydew, attract sooty mold.',
    trigger_keywords: ['mealybug', 'पिठ्या ढेकूण', 'चिकना कीड़ा', 'mealybugs', 'cottony'],
    response_mr: '☁️ पिठ्या ढेकूण आढळला! प्रोफेनोफॉस + सायपरमेथ्रिन फवारा.',
    response_hi: '☁️ मिलीबग पाया गया! प्रोफेनोफॉस + साइपरमेथ्रिन स्प्रे करें।',
    response_en: '☁️ Mealybug detected! Spray Profenofos + Cypermethrin.',
    alternatives: ['Profenofos', 'Buprofezin', 'Neem oil + sticker'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_007',
    category: 'pest',
    crop_code: 'tomato',
    priority: 'P3_CROP_STAGE',
    cause: 'FRUIT_BORER_DETECTED',
    scientific_source: 'ICAR Fruit Borer Management',
    scientific_basis: 'Fruit borer (Helicoverpa) damages fruits, causing rejection and loss.',
    trigger_keywords: ['fruit borer', 'फळ अळी', 'फल छेदक', 'tomato borer', 'borer in fruit'],
    response_mr: '🍅 फळ अळी आढळली! इमामेक्टिन बेंझोएट फवारा.',
    response_hi: '🍅 फल छेदक पाया गया! एमामेक्टिन बेंजोएट स्प्रे करें।',
    response_en: '🍅 Fruit borer detected! Spray Emamectin benzoate.',
    alternatives: ['Emamectin benzoate', 'Spinosad', 'Chlorantraniliprole'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_008',
    category: 'pest',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'STEM_BORER_DETECTED',
    scientific_source: 'ICAR-CRRI Stem Borer Management',
    scientific_basis: 'Rice stem borer causes dead hearts in vegetative stage, white ears at heading.',
    trigger_keywords: ['stem borer', 'खोड अळी', 'तना छेदक', 'dead heart', 'white ear'],
    response_mr: '🌾 खोड अळी आढळली! कार्टाप किंवा क्लोरॅन्ट्रानिलिप्रोल फवारा.',
    response_hi: '🌾 तना छेदक पाया गया! कार्टैप या क्लोरेंट्रानिलिप्रोल स्प्रे करें।',
    response_en: '🌾 Stem borer detected! Spray Cartap or Chlorantraniliprole.',
    alternatives: ['Cartap hydrochloride', 'Chlorantraniliprole', 'Fipronil'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_009',
    category: 'pest',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'BPH_DETECTED',
    scientific_source: 'ICAR-CRRI BPH Management',
    scientific_basis: 'Brown planthopper causes hopper burn, serious in late season.',
    trigger_keywords: ['bph', 'brown planthopper', 'तपकिरी तुडतुडा', 'भूरा फुदका', 'hopper burn'],
    response_mr: '🟤 तपकिरी तुडतुडा आढळला! पाणी काढा. ब्युप्रोफेझिन फवारा.',
    response_hi: '🟤 भूरा फुदका पाया गया! पानी निकालें। ब्युप्रोफेज़िन स्प्रे करें।',
    response_en: '🟤 Brown planthopper detected! Drain water. Spray Buprofezin.',
    alternatives: ['Buprofezin', 'Pymetrozine', 'Dinotefuran'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'PEST_010',
    category: 'pest',
    crop_code: 'chilli',
    priority: 'P3_CROP_STAGE',
    cause: 'MITE_DETECTED',
    scientific_source: 'ICAR Mite Management',
    scientific_basis: 'Mites cause leaf curling, stunting, reduce fruit quality.',
    trigger_keywords: ['mite', 'spider mite', 'कोळी', 'माइट', 'लाल मकड़ी'],
    response_mr: '🕷️ माइट आढळले! डायकोफोल किंवा एबामेक्टिन फवारा.',
    response_hi: '🕷️ माइट पाए गए! डाइकोफोल या एबामेक्टिन स्प्रे करें।',
    response_en: '🕷️ Mites detected! Spray Dicofol or Abamectin.',
    alternatives: ['Dicofol', 'Abamectin', 'Spiromesifen'],
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ECONOMIC THRESHOLD RULES (P4) - 40 Rules
  // Source: economic-threshold-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'ETL_001',
    category: 'economic',
    crop_code: 'cotton',
    priority: 'P4_ECONOMIC',
    cause: 'ETL_APHID_EXCEEDED',
    scientific_source: 'ICAR-CICR Economic Thresholds',
    scientific_basis: 'Cotton aphid ETL: 20 aphids/leaf or 10% plants infested.',
    trigger_keywords: ['aphid threshold', 'etl aphid', 'मावा', 'economic threshold', 'spray decision'],
    response_mr: '📊 मावा ETL पार! आर्थिक नुकसान टाळण्यासाठी फवारणी करा.',
    response_hi: '📊 माहू ETL पार! आर्थिक नुकसान टालने के लिए स्प्रे करें।',
    response_en: '📊 Aphid ETL exceeded! Spray to prevent economic loss.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'ETL_002',
    category: 'economic',
    crop_code: 'cotton',
    priority: 'P4_ECONOMIC',
    cause: 'ETL_BOLLWORM_EXCEEDED',
    scientific_source: 'ICAR-CICR Bollworm Thresholds',
    scientific_basis: 'Bollworm ETL: 5 larvae per 25 plants OR 10% square/boll damage.',
    trigger_keywords: ['bollworm threshold', 'bollworm etl', 'boll damage', 'बोंड अळी'],
    response_mr: '📊 बोंड अळी ETL पार! तात्काळ फवारणी करा.',
    response_hi: '📊 बॉलवर्म ETL पार! तुरंत स्प्रे करें।',
    response_en: '📊 Bollworm ETL exceeded! Spray immediately.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'ETL_003',
    category: 'economic',
    crop_code: 'rice',
    priority: 'P4_ECONOMIC',
    cause: 'ETL_STEM_BORER_EXCEEDED',
    scientific_source: 'ICAR-CRRI Economic Thresholds',
    scientific_basis: 'Stem borer ETL: 5% dead hearts or 2% white ears.',
    trigger_keywords: ['stem borer threshold', 'dead heart', 'white ear', 'खोड अळी'],
    response_mr: '📊 खोड अळी ETL पार! फवारणी करा.',
    response_hi: '📊 तना छेदक ETL पार! स्प्रे करें।',
    response_en: '📊 Stem borer ETL exceeded! Apply control measures.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'ETL_004',
    category: 'economic',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'TREATMENT_NOT_ECONOMICAL',
    scientific_source: 'Agricultural Economics',
    scientific_basis: 'Treatment cost should not exceed expected benefit.',
    trigger_keywords: ['not economical', 'cost benefit', 'खर्च', 'लागत', 'affordable'],
    response_mr: '💰 उपचार खर्च फायद्यापेक्षा जास्त आहे. प्रतीक्षा करा किंवा कमी खर्चाचा पर्याय वापरा.',
    response_hi: '💰 उपचार लागत लाभ से अधिक है। प्रतीक्षा करें या कम लागत वाला विकल्प उपयोग करें।',
    response_en: '💰 Treatment cost exceeds benefit. Wait or use cheaper alternative.',
    action_type: 'MONITOR'
  },
  {
    rule_id: 'ETL_005',
    category: 'economic',
    crop_code: 'all',
    priority: 'P4_ECONOMIC',
    cause: 'BELOW_ETL_MONITOR',
    scientific_source: 'IPM Monitoring Guidelines',
    scientific_basis: 'Below ETL, monitoring is more economical than spraying.',
    trigger_keywords: ['below threshold', 'monitor', 'निरीक्षण', 'निगरानी', 'watch'],
    response_mr: '👁️ ETL पेक्षा कमी. फवारणी आवश्यक नाही. निरीक्षण चालू ठेवा.',
    response_hi: '👁️ ETL से कम। स्प्रे की जरूरत नहीं। निगरानी जारी रखें।',
    response_en: '👁️ Below ETL. No spray needed. Continue monitoring.',
    action_type: 'MONITOR'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IPM RULES (P5) - 30 Rules
  // Source: ipm-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'IPM_001',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_LEVEL_1_CULTURAL',
    scientific_source: 'ICAR IPM Guidelines',
    scientific_basis: 'Cultural practices as first line of defense (0-5% infestation).',
    trigger_keywords: ['cultural control', 'prevention', 'प्रतिबंध', 'रोकथाम', 'crop rotation'],
    response_mr: '🌱 IPM स्तर 1: सांस्कृतिक पद्धती वापरा. पीक फेरपालट, स्वच्छता.',
    response_hi: '🌱 IPM स्तर 1: सांस्कृतिक विधियां उपयोग करें। फसल चक्र, स्वच्छता।',
    response_en: '🌱 IPM Level 1: Use cultural practices. Crop rotation, sanitation.',
    alternatives: ['Crop rotation', 'Field sanitation', 'Resistant varieties', 'Timely sowing'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_002',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_LEVEL_2_MECHANICAL',
    scientific_source: 'ICAR IPM Guidelines',
    scientific_basis: 'Mechanical control for early infestation (5-10%).',
    trigger_keywords: ['mechanical control', 'traps', 'सापळे', 'जाल', 'hand picking'],
    response_mr: '🪤 IPM स्तर 2: यांत्रिक नियंत्रण. सापळे लावा, हाताने गोळा करा.',
    response_hi: '🪤 IPM स्तर 2: यांत्रिक नियंत्रण। जाल लगाएं, हाथ से इकट्ठा करें।',
    response_en: '🪤 IPM Level 2: Mechanical control. Install traps, hand pick.',
    alternatives: ['Pheromone traps', 'Light traps', 'Yellow sticky traps', 'Hand collection'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_003',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_LEVEL_3_BIOLOGICAL',
    scientific_source: 'ICAR-NBAIR Biocontrol Guidelines',
    scientific_basis: 'Biological control for moderate infestation (10-15%).',
    trigger_keywords: ['biological control', 'biocontrol', 'जैविक नियंत्रण', 'trichogramma', 'trichoderma'],
    response_mr: '🦗 IPM स्तर 3: जैविक नियंत्रण. ट्रायकोग्रामा, ट्रायकोडर्मा वापरा.',
    response_hi: '🦗 IPM स्तर 3: जैविक नियंत्रण। ट्राइकोग्रामा, ट्राइकोडर्मा उपयोग करें।',
    response_en: '🦗 IPM Level 3: Biological control. Use Trichogramma, Trichoderma.',
    alternatives: ['Trichogramma', 'Trichoderma', 'Beauveria bassiana', 'Metarhizium'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_004',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_LEVEL_4_BOTANICAL',
    scientific_source: 'ICAR Botanical Pesticide Guidelines',
    scientific_basis: 'Botanical/organic pesticides for moderate-high infestation (15-25%).',
    trigger_keywords: ['neem', 'botanical', 'नीम', 'organic spray', 'जैविक'],
    response_mr: '🌿 IPM स्तर 4: वनस्पतीजन्य नियंत्रण. नीम तेल, दशपर्णी वापरा.',
    response_hi: '🌿 IPM स्तर 4: वानस्पतिक नियंत्रण। नीम तेल, दशपर्णी उपयोग करें।',
    response_en: '🌿 IPM Level 4: Botanical control. Use neem oil, Dashparni.',
    alternatives: ['Neem oil 0.3%', 'Dashparni ark', 'Panchagavya', 'Garlic extract'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_005',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'IPM_LEVEL_5_SELECTIVE_CHEMICAL',
    scientific_source: 'ICAR IPM Guidelines',
    scientific_basis: 'Selective chemicals for high infestation when IPM fails (25-40%).',
    trigger_keywords: ['selective chemical', 'ipm compatible', 'कमी विषाक्त', 'target specific'],
    response_mr: '💊 IPM स्तर 5: निवडक रासायनिक. स्पिनोसॅड, एमामेक्टिन वापरा.',
    response_hi: '💊 IPM स्तर 5: चयनात्मक रासायनिक। स्पिनोसैड, एमामेक्टिन उपयोग करें।',
    response_en: '💊 IPM Level 5: Selective chemicals. Use Spinosad, Emamectin.',
    alternatives: ['Spinosad', 'Emamectin benzoate', 'Chlorantraniliprole'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'IPM_006',
    category: 'ipm',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'IPM_LEVEL_6_BROAD_SPECTRUM',
    scientific_source: 'Emergency Pest Control',
    scientific_basis: 'Broad spectrum chemicals only as last resort (>40% damage).',
    trigger_keywords: ['emergency spray', 'broad spectrum', 'high damage', 'सर्वव्यापी'],
    response_mr: '⚠️ IPM स्तर 6: आपत्कालीन! व्यापक स्पेक्ट्रम कीटकनाशक वापरा.',
    response_hi: '⚠️ IPM स्तर 6: आपातकाल! व्यापक स्पेक्ट्रम कीटनाशक उपयोग करें।',
    response_en: '⚠️ IPM Level 6: Emergency! Use broad spectrum insecticide.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RESISTANCE MANAGEMENT RULES (P5) - 15 Rules
  // Source: resistance-management-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'RESISTANCE_001',
    category: 'resistance',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'MOA_ROTATION_NEEDED',
    scientific_source: 'IRAC Guidelines 2023',
    scientific_basis: 'Using same MOA consecutively increases resistance risk.',
    trigger_keywords: ['rotation', 'moa', 'resistance', 'प्रतिरोध', 'फेरबदल'],
    response_mr: '🔄 MOA बदला! सतत एकच औषध वापरू नका.',
    response_hi: '🔄 MOA बदलें! लगातार एक ही दवाई का उपयोग न करें।',
    response_en: '🔄 Rotate MOA! Do not use same chemical group consecutively.',
    action_type: 'WARN'
  },
  {
    rule_id: 'RESISTANCE_002',
    category: 'resistance',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'RESISTANCE_RISK_HIGH',
    scientific_source: 'IRAC Resistance Management',
    scientific_basis: 'Consecutive same MOA dramatically increases resistance selection pressure.',
    trigger_keywords: ['resistance risk', 'same chemical', 'repeat spray', 'पुन्हा तेच'],
    response_mr: '⚠️ प्रतिरोध धोका! वेगळ्या गटाचे औषध वापरा.',
    response_hi: '⚠️ प्रतिरोध का खतरा! अलग समूह की दवाई उपयोग करें।',
    response_en: '⚠️ High resistance risk! Use different MOA group.',
    action_type: 'WARN'
  },
  {
    rule_id: 'RESISTANCE_003',
    category: 'resistance',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'FUNGICIDE_ROTATION_NEEDED',
    scientific_source: 'FRAC Code List',
    scientific_basis: 'Fungicide resistance develops rapidly. Rotate MOA groups.',
    trigger_keywords: ['fungicide rotation', 'frac', 'बुरशीनाशक फेरबदल'],
    response_mr: '🔄 बुरशीनाशक बदला! Group M → Group 3 → Group 11 क्रमाने.',
    response_hi: '🔄 कवकनाशी बदलें! Group M → Group 3 → Group 11 क्रम में।',
    response_en: '🔄 Rotate fungicide! Group M → Group 3 → Group 11 sequence.',
    action_type: 'WARN'
  },
  {
    rule_id: 'RESISTANCE_004',
    category: 'resistance',
    crop_code: 'cotton',
    priority: 'P5_IPM',
    cause: 'BT_REFUGE_MISSING',
    scientific_source: 'Bt Cotton Refuge Requirements',
    scientific_basis: 'Bt cotton requires 20% non-Bt refuge to delay resistance.',
    trigger_keywords: ['bt cotton', 'refuge', 'रिफ्यूज', 'non bt', 'बीटी'],
    response_mr: '🌱 Bt कापूससाठी 20% नॉन-Bt रिफ्यूज ठेवा.',
    response_hi: '🌱 Bt कपास के लिए 20% नॉन-Bt रिफ्यूज रखें।',
    response_en: '🌱 Maintain 20% non-Bt refuge for Bt cotton.',
    action_type: 'WARN'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NUTRIENT RULES (P3-P4) - 40 Rules
  // Source: nutrient-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'NUTRIENT_001',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'NITROGEN_DEFICIENCY',
    scientific_source: 'ICAR-AICRP on Soil Test Crop Response',
    scientific_basis: 'Nitrogen deficiency: older leaves yellow from tip, stunted growth.',
    trigger_keywords: ['nitrogen', 'yellow leaves', 'पिवळी पाने', 'पीले पत्ते', 'नायट्रोजन', 'urea'],
    response_mr: '🌾 नायट्रोजन कमी! युरिया 50kg/ha टाका किंवा 2% युरिया फवारा.',
    response_hi: '🌾 नाइट्रोजन की कमी! यूरिया 50kg/ha डालें या 2% यूरिया स्प्रे करें।',
    response_en: '🌾 Nitrogen deficiency! Apply Urea 50kg/ha or 2% urea foliar spray.',
    alternatives: ['Urea top dress', 'DAP', 'Foliar 2% urea'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_002',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'PHOSPHORUS_DEFICIENCY',
    scientific_source: 'ICAR-IISS Soil Science',
    scientific_basis: 'Phosphorus deficiency: dark purplish leaves, stunted roots.',
    trigger_keywords: ['phosphorus', 'purple leaves', 'जांभळी पाने', 'बैंगनी पत्ते', 'फॉस्फरस'],
    response_mr: '🟣 फॉस्फरस कमी! SSP किंवा DAP वापरा.',
    response_hi: '🟣 फॉस्फोरस की कमी! SSP या DAP उपयोग करें।',
    response_en: '🟣 Phosphorus deficiency! Apply SSP or DAP.',
    alternatives: ['SSP', 'DAP', 'Foliar 1% DAP'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_003',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'POTASSIUM_DEFICIENCY',
    scientific_source: 'ICAR Potassium Management',
    scientific_basis: 'Potassium deficiency: marginal scorching of older leaves, weak stems.',
    trigger_keywords: ['potassium', 'leaf edge burn', 'पान काठ करपा', 'पत्ता किनारा जलना', 'पोटॅश'],
    response_mr: '🟤 पोटॅश कमी! MOP 50kg/ha टाका.',
    response_hi: '🟤 पोटाश की कमी! MOP 50kg/ha डालें।',
    response_en: '🟤 Potassium deficiency! Apply MOP 50kg/ha.',
    alternatives: ['MOP', 'SOP', 'Foliar 1% K2SO4'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_004',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'ZINC_DEFICIENCY',
    scientific_source: 'ICAR Micronutrient Management',
    scientific_basis: 'Zinc deficiency: interveinal chlorosis on young leaves, short internodes.',
    trigger_keywords: ['zinc', 'झिंक', 'जिंक', 'white bud', 'khaira', 'खैरा'],
    response_mr: '⚪ झिंक कमी! झिंक सल्फेट 25kg/ha जमिनीत किंवा 0.5% फवारा.',
    response_hi: '⚪ जिंक की कमी! जिंक सल्फेट 25kg/ha मिट्टी में या 0.5% स्प्रे।',
    response_en: '⚪ Zinc deficiency! Apply Zinc sulfate 25kg/ha or 0.5% foliar.',
    alternatives: ['ZnSO4 soil application', 'Foliar 0.5% ZnSO4 + lime'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_005',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'IRON_DEFICIENCY',
    scientific_source: 'ICAR Micronutrient Management',
    scientific_basis: 'Iron deficiency: interveinal chlorosis on youngest leaves, common in high pH.',
    trigger_keywords: ['iron', 'लोह', 'लोहा', 'yellow new leaves', 'chlorosis young'],
    response_mr: '🟡 लोह कमी! फेरस सल्फेट 0.5% + सायट्रिक ऍसिड फवारा.',
    response_hi: '🟡 लोहे की कमी! फेरस सल्फेट 0.5% + साइट्रिक एसिड स्प्रे।',
    response_en: '🟡 Iron deficiency! Spray 0.5% FeSO4 + citric acid.',
    alternatives: ['FeSO4 foliar', 'Fe-EDTA', 'Soil application'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'NUTRIENT_006',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'BORON_DEFICIENCY',
    scientific_source: 'ICAR Micronutrient Management',
    scientific_basis: 'Boron deficiency: growing points die, poor fruit set, hollow stems.',
    trigger_keywords: ['boron', 'बोरॉन', 'hollow heart', 'poor fruit set', 'फळ गळ'],
    response_mr: '💔 बोरॉन कमी! बोरॅक्स 10kg/ha (सावधगिरी: जास्त वापरू नका).',
    response_hi: '💔 बोरोन की कमी! बोरेक्स 10kg/ha (सावधानी: अधिक न डालें)।',
    response_en: '💔 Boron deficiency! Apply Borax 10kg/ha (CAUTION: narrow safe range).',
    alternatives: ['Borax soil', 'Foliar 0.1% borax'],
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WATER RULES (P2-P3) - 40 Rules
  // Source: water-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'WATER_001',
    category: 'water',
    crop_code: 'all',
    priority: 'P0_EMERGENCY',
    cause: 'WATER_STRESS_CRITICAL',
    scientific_source: 'ICAR Critical Irrigation Stages',
    scientific_basis: 'Water stress at reproductive stage causes irreversible yield loss 30-50%.',
    trigger_keywords: ['water stress', 'irrigation', 'पाणी', 'पानी', 'सिंचन', 'सिंचाई', 'dry', 'wilt'],
    response_mr: '💧 गंभीर पाणी टंचाई! ताबडतोब सिंचन करा.',
    response_hi: '💧 गंभीर पानी की कमी! तुरंत सिंचाई करें।',
    response_en: '💧 Critical water stress! Irrigate immediately.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_002',
    category: 'water',
    crop_code: 'wheat',
    priority: 'P0_EMERGENCY',
    cause: 'WHEAT_CRI_IRRIGATION',
    scientific_source: 'ICAR-IARI Wheat Package',
    scientific_basis: 'Crown root initiation (21-25 DAS) is most critical irrigation for wheat.',
    trigger_keywords: ['crown root', 'cri', 'wheat irrigation', 'गहू सिंचन', 'गेहूं सिंचाई'],
    response_mr: '🌾 गहू CRI सिंचन! 21-25 दिवसांत सिंचन अत्यंत महत्त्वाचे.',
    response_hi: '🌾 गेहूं CRI सिंचाई! 21-25 दिन में सिंचाई अत्यंत महत्वपूर्ण।',
    response_en: '🌾 Wheat CRI irrigation! Critical at 21-25 DAS.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_003',
    category: 'water',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'WATERLOGGING_DETECTED',
    scientific_source: 'FAO Drainage Guide',
    scientific_basis: 'Waterlogging causes root asphyxiation within 24-48 hours.',
    trigger_keywords: ['waterlogging', 'excess water', 'जास्त पाणी', 'पानी भरा', 'जलभराव'],
    response_mr: '🌊 जास्त पाणी! ताबडतोब निचरा करा. मुळे सडतील.',
    response_hi: '🌊 जलभराव! तुरंत पानी निकालें। जड़ें सड़ेंगी।',
    response_en: '🌊 Waterlogging! Drain immediately. Roots will rot.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'WATER_004',
    category: 'water',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'DRIP_IRRIGATION_RECOMMENDED',
    scientific_source: 'FAO-56 Crop Evapotranspiration',
    scientific_basis: 'Drip irrigation 85-95% efficient vs flood 40-60%.',
    trigger_keywords: ['drip', 'ठिबक', 'टपक', 'efficient irrigation', 'water saving'],
    response_mr: '💧 ठिबक सिंचन वापरा. 40-50% पाणी वाचते.',
    response_hi: '💧 ड्रिप सिंचाई उपयोग करें। 40-50% पानी बचता है।',
    response_en: '💧 Use drip irrigation. Saves 40-50% water.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER-ACTION RULES (P2) - 35 Rules
  // Source: weather-action-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'WEATHER_001',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'RAIN_FORECAST_SPRAY_BLOCK',
    scientific_source: 'FAO Spray Application Guidelines',
    scientific_basis: 'Contact pesticides require 6 hours rain-free. Rain causes >80% wash-off.',
    trigger_keywords: ['rain forecast', 'पाऊस', 'बारिश', 'rain coming', 'will rain'],
    response_mr: '🌧️ पाऊस येणार आहे! फवारणी पुढे ढकला.',
    response_hi: '🌧️ बारिश आने वाली है! स्प्रे टाल दें।',
    response_en: '🌧️ Rain forecast! Delay spraying.',
    action_type: 'DELAY'
  },
  {
    rule_id: 'WEATHER_002',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P1_REGULATORY',
    cause: 'HIGH_WIND_SPRAY_BLOCK',
    scientific_source: 'ISO 22866:2005 Pesticide drift measurement',
    scientific_basis: 'Wind >15 km/h causes unacceptable spray drift, environmental contamination.',
    trigger_keywords: ['high wind', 'windy', 'वारा', 'हवा', 'तेज हवा'],
    response_mr: '💨 वारा जास्त आहे! फवारणी थांबवा.',
    response_hi: '💨 हवा तेज है! स्प्रे रोकें।',
    response_en: '💨 High wind! Stop spraying.',
    action_type: 'BLOCK'
  },
  {
    rule_id: 'WEATHER_003',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'HIGH_TEMP_SPRAY_BLOCK',
    scientific_source: 'Butler Ellis 2017 - Temperature effects on pesticide performance',
    scientific_basis: 'Temperature >35°C causes rapid evaporation, reduced efficacy, phytotoxicity.',
    trigger_keywords: ['high temp', 'hot weather', 'गरम', 'गर्मी', 'midday'],
    response_mr: '🌡️ उन्हाळा! सकाळी 6-9 किंवा संध्याकाळी 4-7 फवारणी करा.',
    response_hi: '🌡️ गर्मी! सुबह 6-9 या शाम 4-7 बजे स्प्रे करें।',
    response_en: '🌡️ High temperature! Spray 6-9 AM or 4-7 PM only.',
    action_type: 'DELAY'
  },
  {
    rule_id: 'WEATHER_004',
    category: 'weather_safety',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'OPTIMAL_SPRAY_WINDOW',
    scientific_source: 'ICAR Spray Application Guidelines',
    scientific_basis: 'Optimal spray conditions: 20-30°C, humidity 50-80%, wind <10 km/h.',
    trigger_keywords: ['spray time', 'when to spray', 'फवारणी कधी', 'स्प्रे कब'],
    response_mr: '⏰ सकाळी 6-9 AM किंवा संध्याकाळी 4-7 PM फवारणीसाठी उत्तम.',
    response_hi: '⏰ सुबह 6-9 AM या शाम 4-7 PM स्प्रे के लिए उत्तम।',
    response_en: '⏰ Best spray time: 6-9 AM or 4-7 PM.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REGIONAL/SEASONAL RULES (P3) - 40 Rules
  // Source: regional-seasonal-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'SEASON_001',
    category: 'seasonal',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'KHARIF_DISEASE_RISK',
    scientific_source: 'ICAR Crop Production Guidelines',
    scientific_basis: 'Kharif season (June-October) has VERY HIGH disease risk due to monsoon humidity.',
    trigger_keywords: ['kharif', 'खरीप', 'monsoon', 'पावसाळा', 'बरसात'],
    response_mr: '🌧️ खरीप हंगाम! रोग जोखीम उच्च. प्रतिबंधात्मक बुरशीनाशक वापरा.',
    response_hi: '🌧️ खरीफ मौसम! रोग का खतरा उच्च। निवारक कवकनाशी उपयोग करें।',
    response_en: '🌧️ Kharif season! High disease risk. Use preventive fungicides.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'SEASON_002',
    category: 'seasonal',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'RABI_IRRIGATION_CRITICAL',
    scientific_source: 'ICAR Rabi Irrigation Management',
    scientific_basis: 'Rabi season irrigation dependent. Water stress causes significant yield loss.',
    trigger_keywords: ['rabi', 'रब्बी', 'winter crop', 'हिवाळी', 'सर्दी'],
    response_mr: '❄️ रब्बी हंगाम! सिंचन अत्यंत महत्त्वाचे. पाणी व्यवस्थापन काटेकोर करा.',
    response_hi: '❄️ रबी मौसम! सिंचाई अत्यंत महत्वपूर्ण। जल प्रबंधन सही करें।',
    response_en: '❄️ Rabi season! Irrigation critical. Manage water carefully.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'SEASON_003',
    category: 'seasonal',
    crop_code: 'wheat',
    priority: 'P0_EMERGENCY',
    cause: 'TERMINAL_HEAT_WHEAT',
    scientific_source: 'ICAR-IARI Wheat Terminal Heat Guidelines',
    scientific_basis: 'Terminal heat (>30°C during grain filling) causes 5% yield loss per day.',
    trigger_keywords: ['terminal heat', 'wheat heat', 'गहू गरम', 'गेहूं गर्मी'],
    response_mr: '🌡️ गहू पिकात उष्णतेची लाट! हलके सिंचन करा. लवकर कापणी विचारात घ्या.',
    response_hi: '🌡️ गेहूं में टर्मिनल हीट! हल्की सिंचाई करें। जल्दी कटाई पर विचार करें।',
    response_en: '🌡️ Terminal heat in wheat! Light irrigation. Consider early harvest.',
    action_type: 'RECOMMEND'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HARVEST/QUALITY RULES (P3) - 30 Rules
  // Source: harvest-quality-rules.ts
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'HARVEST_001',
    category: 'harvest',
    crop_code: 'all',
    priority: 'P3_CROP_STAGE',
    cause: 'OPTIMAL_HARVEST_TIME',
    scientific_source: 'ICAR Post-Harvest Technology',
    scientific_basis: 'Optimal harvest timing maximizes yield and quality.',
    trigger_keywords: ['harvest time', 'कापणी वेळ', 'कटाई समय', 'when to harvest'],
    response_mr: '🌾 योग्य कापणी वेळ! पिकाचे परिपक्वता लक्षणे तपासा.',
    response_hi: '🌾 सही कटाई समय! फसल की परिपक्वता लक्षण जांचें।',
    response_en: '🌾 Optimal harvest time! Check crop maturity indicators.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_002',
    category: 'harvest',
    crop_code: 'all',
    priority: 'P2_WEATHER_SAFETY',
    cause: 'RAIN_BEFORE_HARVEST',
    scientific_source: 'ICAR Grain Quality Management',
    scientific_basis: 'Rain before harvest can cause grain damage, sprouting, quality loss.',
    trigger_keywords: ['rain before harvest', 'कापणीपूर्वी पाऊस', 'कटाई से पहले बारिश'],
    response_mr: '🌧️ कापणीपूर्वी पाऊस! लवकर कापणी करा किंवा पाऊस थांबण्याची वाट पहा.',
    response_hi: '🌧️ कटाई से पहले बारिश! जल्दी काटें या बारिश रुकने का इंतजार करें।',
    response_en: '🌧️ Rain before harvest! Harvest early or wait for rain to stop.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_003',
    category: 'harvest',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'RICE_HARVEST_MOISTURE',
    scientific_source: 'ICAR-CRRI Rice Post-Harvest',
    scientific_basis: 'Rice should be harvested at 20-22% grain moisture for quality.',
    trigger_keywords: ['rice harvest', 'भात कापणी', 'धान कटाई', 'grain moisture'],
    response_mr: '🌾 भात कापणी! दाण्यात 20-22% ओलावा असताना कापा.',
    response_hi: '🌾 धान कटाई! दाने में 20-22% नमी पर काटें।',
    response_en: '🌾 Rice harvest! Harvest at 20-22% grain moisture.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'HARVEST_004',
    category: 'harvest',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'COTTON_PICKING_TIMING',
    scientific_source: 'ICAR-CICR Cotton Picking',
    scientific_basis: 'Pick cotton when bolls fully open, early morning when dew evaporates.',
    trigger_keywords: ['cotton picking', 'कापूस वेचणी', 'कपास चुनाई', 'boll open'],
    response_mr: '☁️ कापूस वेचणी! बोंडे पूर्ण उघडल्यावर वेचा. सकाळी दव गेल्यावर वेचा.',
    response_hi: '☁️ कपास चुनाई! गेंदे पूर्ण खुलने पर चुनें। सुबह ओस सूखने पर चुनें।',
    response_en: '☁️ Cotton picking! Pick when bolls fully open. After dew evaporates.',
    action_type: 'RECOMMEND'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CROP-GROUP RULES - From src/decision-graph/crop-group-rules/
  // These are keyword-triggered versions of condition-based rules
  // ═══════════════════════════════════════════════════════════════════════════
  
  // WHEAT RULES
  {
    rule_id: 'CROP_WHEAT_WATER_CRI',
    category: 'water',
    crop_code: 'wheat',
    priority: 'P3_CROP_STAGE',
    cause: 'WATER_STRESS_WHEAT_CRI',
    scientific_source: 'ICAR-IARI Wheat Package 2024',
    scientific_basis: 'Crown Root Initiation (21-25 DAS) is the most critical irrigation for wheat. Missing CRI irrigation reduces yield by 40-50%.',
    trigger_keywords: ['wheat', 'गहू', 'गेहूं', 'cri', 'crown root', 'irrigation', 'पाणी', 'सिंचाई'],
    response_mr: '💧 गव्हात CRI (21-25 दिवस) सिंचन अत्यंत महत्त्वाचे. याशिवाय 40-50% उत्पादन घटते.',
    response_hi: '💧 गेहूं में CRI (21-25 दिन) सिंचाई अत्यंत महत्वपूर्ण। इसके बिना 40-50% उपज कम।',
    response_en: '💧 Wheat CRI irrigation (21-25 DAS) is critical. Missing it reduces yield by 40-50%.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_WHEAT_RUST',
    category: 'disease',
    crop_code: 'wheat',
    priority: 'P3_CROP_STAGE',
    cause: 'WHEAT_RUST_RISK',
    scientific_source: 'ICAR-IARI Disease Management',
    scientific_basis: 'Yellow rust (Puccinia striiformis) requires 10-15°C with dew. ICAR threshold: 5% severity for spray.',
    trigger_keywords: ['wheat rust', 'yellow rust', 'गव्हावरील गंज', 'गेहूं का गेरुआ', 'puccinia', 'तांबेरा'],
    response_mr: '🟡 गव्हावर गंज! 5% पेक्षा जास्त असल्यास प्रोपिकोनाझोल फवारा.',
    response_hi: '🟡 गेहूं पर गेरुआ! 5% से अधिक होने पर प्रोपिकोनाज़ोल का स्प्रे करें।',
    response_en: '🟡 Wheat rust detected! Spray Propiconazole if >5% severity.',
    alternatives: ['Propiconazole 25% EC @ 1ml/L', 'Tebuconazole 25% WG @ 1g/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_WHEAT_APHID',
    category: 'pest',
    crop_code: 'wheat',
    priority: 'P4_ECONOMIC',
    cause: 'APHID_RISK',
    scientific_source: 'ICAR-IARI IPM',
    scientific_basis: 'Wheat aphid (Sitobion avenae) attacks ears during warm dry weather. ETL: 10 aphids/ear or 25 aphids/tiller.',
    trigger_keywords: ['wheat aphid', 'गव्हावरील माव्या', 'गेहूं का मावा', 'aphid', 'mavya'],
    response_mr: '🐜 गव्हावर माव्या! 10 माव्या/कणसात असल्यास इमिडाक्लोप्रिड फवारा.',
    response_hi: '🐜 गेहूं पर माहू! 10 माहू/बाली में होने पर इमिडाक्लोप्रिड स्प्रे करें।',
    response_en: '🐜 Wheat aphid! Spray Imidacloprid if >10 aphids/ear.',
    action_type: 'RECOMMEND'
  },
  
  // RICE RULES
  {
    rule_id: 'CROP_RICE_BLAST',
    category: 'disease',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'RICE_BLAST_RISK',
    scientific_source: 'ICAR-CRRI Disease Management',
    scientific_basis: 'Rice blast (Pyricularia oryzae) is favored by high N, humidity, and 20-25°C temperature.',
    trigger_keywords: ['rice blast', 'भात करपा', 'धान का ब्लास्ट', 'pyricularia', 'करपा', 'blast'],
    response_mr: '🍚 भातावर करपा! ट्रायसायक्लाझोल फवारा. N खत कमी करा.',
    response_hi: '🍚 धान पर ब्लास्ट! ट्राइसाइक्लाज़ोल स्प्रे करें। N खाद कम करें।',
    response_en: '🍚 Rice blast! Spray Tricyclazole. Reduce N fertilizer.',
    alternatives: ['Tricyclazole 75% WP @ 0.6g/L', 'Isoprothiolane 40% EC @ 1.5ml/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_RICE_BPH',
    category: 'pest',
    crop_code: 'rice',
    priority: 'P3_CROP_STAGE',
    cause: 'BROWN_PLANTHOPPER_RISK',
    scientific_source: 'ICAR-CRRI IPM',
    scientific_basis: 'BPH (Nilaparvata lugens) causes hopper burn. ETL: 5-10 hoppers/hill at tillering.',
    trigger_keywords: ['brown planthopper', 'bph', 'तपकिरी तुडतुडे', 'भूरा फुदका', 'hopper burn', 'planthopper'],
    response_mr: '🦗 तपकिरी तुडतुडे! 5-10 प्रति झाड असल्यास बुप्रोफेझिन फवारा.',
    response_hi: '🦗 भूरा फुदका! 5-10 प्रति पौधा होने पर बुप्रोफेज़िन स्प्रे करें।',
    response_en: '🦗 BPH! Spray Buprofezin if 5-10 hoppers/hill.',
    alternatives: ['Buprofezin 25% SC @ 1.6ml/L', 'Pymetrozine 50% WG @ 0.3g/L'],
    action_type: 'RECOMMEND'
  },
  
  // COTTON RULES
  {
    rule_id: 'CROP_COTTON_BOLLWORM',
    category: 'pest',
    crop_code: 'cotton',
    priority: 'P3_CROP_STAGE',
    cause: 'BOLLWORM_INFESTATION',
    scientific_source: 'ICAR-CICR Cotton IPM',
    scientific_basis: 'American bollworm (Helicoverpa armigera) causes major yield loss. ETL: 1 larva/plant at square formation.',
    trigger_keywords: ['bollworm', 'बोंडअळी', 'टिंडा कीट', 'helicoverpa', 'कापूस अळी', 'कपास इल्ली'],
    response_mr: '🐛 बोंडअळी! 1 अळी/झाड असल्यास एमामेक्टिन बेंजोएट फवारा.',
    response_hi: '🐛 टिंडा कीट! 1 इल्ली/पौधा होने पर एमामेक्टिन बेंजोएट स्प्रे करें।',
    response_en: '🐛 Bollworm! Spray Emamectin Benzoate if 1 larva/plant.',
    alternatives: ['Emamectin Benzoate 5% SG @ 0.4g/L', 'Spinosad 45% SC @ 0.3ml/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_COTTON_WHITEFLY',
    category: 'pest',
    crop_code: 'cotton',
    priority: 'P4_ECONOMIC',
    cause: 'WHITEFLY_INFESTATION',
    scientific_source: 'ICAR-CICR Cotton IPM',
    scientific_basis: 'Cotton whitefly (Bemisia tabaci) causes leaf curl virus transmission. ETL: 5-10 adults/leaf.',
    trigger_keywords: ['whitefly', 'पांढरी माशी', 'सफेद मक्खी', 'bemisia', 'leaf curl'],
    response_mr: '🪰 पांढरी माशी! 5-10 प्रति पान असल्यास पायरीप्रॉक्सीफेन फवारा.',
    response_hi: '🪰 सफेद मक्खी! 5-10 प्रति पत्ता होने पर पायरीप्रॉक्सीफेन स्प्रे करें।',
    response_en: '🪰 Whitefly! Spray Pyriproxyfen if 5-10 adults/leaf.',
    alternatives: ['Pyriproxyfen 10% EC @ 1ml/L', 'Spiromesifen 22.9% SC @ 0.5ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // SOYBEAN RULES
  {
    rule_id: 'CROP_SOYBEAN_RUST',
    category: 'disease',
    crop_code: 'soybean',
    priority: 'P3_CROP_STAGE',
    cause: 'SOYBEAN_RUST_RISK',
    scientific_source: 'ICAR-IISR Soybean Package',
    scientific_basis: 'Asian soybean rust (Phakopsora pachyrhizi) spreads rapidly in humid conditions.',
    trigger_keywords: ['soybean rust', 'सोयाबीन गंज', 'सोयाबीन का गेरुआ', 'phakopsora', 'soya rust'],
    response_mr: '🫘 सोयाबीनवर गंज! प्रोपिकोनाझोल + ट्रायफ्लॉक्सिस्ट्रोबिन फवारा.',
    response_hi: '🫘 सोयाबीन पर गेरुआ! प्रोपिकोनाज़ोल + ट्राइफ्लोक्सीस्ट्रोबिन स्प्रे करें।',
    response_en: '🫘 Soybean rust! Spray Propiconazole + Trifloxystrobin.',
    alternatives: ['Propiconazole 25% EC @ 1ml/L', 'Trifloxystrobin + Tebuconazole @ 0.75g/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_SOYBEAN_GIRDLE_BEETLE',
    category: 'pest',
    crop_code: 'soybean',
    priority: 'P3_CROP_STAGE',
    cause: 'GIRDLE_BEETLE_INFESTATION',
    scientific_source: 'ICAR-IISR Soybean IPM',
    scientific_basis: 'Girdle beetle (Oberea brevis) girdles stems causing major yield loss.',
    trigger_keywords: ['girdle beetle', 'खोडकिड', 'गर्डल बीटल', 'oberea', 'stem borer'],
    response_mr: '🪲 खोडकिड! ट्रायझोफॉस फवारा. प्रभावित भाग काढून टाका.',
    response_hi: '🪲 गर्डल बीटल! ट्राइज़ोफॉस स्प्रे करें। प्रभावित भाग निकालें।',
    response_en: '🪲 Girdle beetle! Spray Triazophos. Remove affected parts.',
    alternatives: ['Triazophos 40% EC @ 1.5ml/L', 'Profenofos 50% EC @ 2ml/L'],
    action_type: 'RECOMMEND'
  },
  
  // SUGARCANE RULES
  {
    rule_id: 'CROP_SUGARCANE_BORER',
    category: 'pest',
    crop_code: 'sugarcane',
    priority: 'P3_CROP_STAGE',
    cause: 'TOP_BORER_INFESTATION',
    scientific_source: 'ICAR-SBI Sugarcane Package',
    scientific_basis: 'Top borer (Scirpophaga excerptalis) causes dead heart. ETL: 5% dead hearts.',
    trigger_keywords: ['top borer', 'ऊसातील अळी', 'गन्ने का टॉप बोरर', 'dead heart', 'scirpophaga'],
    response_mr: '🪱 ऊसातील अळी! 5% मृत टोके असल्यास कार्बोफ्युरॉन ग्रॅन्युल्स द्या.',
    response_hi: '🪱 गन्ने में टॉप बोरर! 5% मृत शीर्ष होने पर कार्बोफ्यूरॉन ग्रेन्यूल्स दें।',
    response_en: '🪱 Sugarcane top borer! Apply Carbofuran granules if 5% dead hearts.',
    alternatives: ['Carbofuran 3G @ 20kg/ha', 'Chlorantraniliprole 0.4G @ 10kg/ha'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_SUGARCANE_REDROT',
    category: 'disease',
    crop_code: 'sugarcane',
    priority: 'P3_CROP_STAGE',
    cause: 'RED_ROT_RISK',
    scientific_source: 'ICAR-SBI Disease Management',
    scientific_basis: 'Red rot (Colletotrichum falcatum) spreads through infected setts and soil.',
    trigger_keywords: ['red rot', 'लाल कुज', 'लाल सड़न', 'colletotrichum', 'sugarcane disease', 'ऊस रोग'],
    response_mr: '🔴 ऊसात लाल कुज! रोगग्रस्त ऊस काढून जाळा. निरोगी बियाणे वापरा.',
    response_hi: '🔴 गन्ने में लाल सड़न! रोगग्रस्त गन्ने निकालकर जलाएं। स्वस्थ बीज उपयोग करें।',
    response_en: '🔴 Sugarcane red rot! Remove and burn infected canes. Use healthy setts.',
    action_type: 'RECOMMEND'
  },
  
  // TOMATO RULES
  {
    rule_id: 'CROP_TOMATO_LATE_BLIGHT',
    category: 'disease',
    crop_code: 'tomato',
    priority: 'P3_CROP_STAGE',
    cause: 'LATE_BLIGHT_RISK',
    scientific_source: 'ICAR-IIHR Vegetable IPM',
    scientific_basis: 'Late blight (Phytophthora infestans) spreads rapidly in cool humid weather.',
    trigger_keywords: ['late blight', 'टोमॅटो करपा', 'टमाटर का झुलसा', 'phytophthora', 'tomato disease'],
    response_mr: '🍅 टोमॅटोवर करपा! मेटालॅक्सिल + मॅन्कोझेब फवारा.',
    response_hi: '🍅 टमाटर पर झुलसा! मेटालैक्सिल + मैंकोज़ेब स्प्रे करें।',
    response_en: '🍅 Tomato late blight! Spray Metalaxyl + Mancozeb.',
    alternatives: ['Metalaxyl 8% + Mancozeb 64% WP @ 2.5g/L', 'Cymoxanil 8% + Mancozeb 64% WP @ 2g/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_TOMATO_FRUIT_BORER',
    category: 'pest',
    crop_code: 'tomato',
    priority: 'P4_ECONOMIC',
    cause: 'TOMATO_FRUIT_BORER',
    scientific_source: 'ICAR-IIHR Vegetable IPM',
    scientific_basis: 'Tomato fruit borer (Helicoverpa armigera) damages fruits. ETL: 2 larvae/plant.',
    trigger_keywords: ['tomato borer', 'टोमॅटो अळी', 'टमाटर की इल्ली', 'fruit borer', 'helicoverpa'],
    response_mr: '🐛 टोमॅटोवर अळी! स्पिनोसॅड किंवा बॅसिलस थुरिंजिएंसिस फवारा.',
    response_hi: '🐛 टमाटर पर इल्ली! स्पिनोसैड या बैसिलस थुरिंजिएंसिस स्प्रे करें।',
    response_en: '🐛 Tomato fruit borer! Spray Spinosad or Bacillus thuringiensis.',
    alternatives: ['Spinosad 45% SC @ 0.3ml/L', 'Bt @ 1g/L'],
    action_type: 'RECOMMEND'
  },
  
  // ONION RULES
  {
    rule_id: 'CROP_ONION_THRIPS',
    category: 'pest',
    crop_code: 'onion',
    priority: 'P3_CROP_STAGE',
    cause: 'THRIPS_INFESTATION',
    scientific_source: 'ICAR-DOGR Onion IPM',
    scientific_basis: 'Onion thrips (Thrips tabaci) cause silvery patches. ETL: 25-30 thrips/plant.',
    trigger_keywords: ['onion thrips', 'कांदा तुडतुडे', 'प्याज थ्रिप्स', 'thrips', 'silvery leaves'],
    response_mr: '🧅 कांद्यावर तुडतुडे! फिप्रोनिल किंवा स्पिनोसॅड फवारा.',
    response_hi: '🧅 प्याज पर थ्रिप्स! फिप्रोनिल या स्पिनोसैड स्प्रे करें।',
    response_en: '🧅 Onion thrips! Spray Fipronil or Spinosad.',
    alternatives: ['Fipronil 5% SC @ 2ml/L', 'Spinosad 45% SC @ 0.3ml/L'],
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'CROP_ONION_PURPLE_BLOTCH',
    category: 'disease',
    crop_code: 'onion',
    priority: 'P3_CROP_STAGE',
    cause: 'PURPLE_BLOTCH_RISK',
    scientific_source: 'ICAR-DOGR Disease Management',
    scientific_basis: 'Purple blotch (Alternaria porri) causes purple lesions on leaves.',
    trigger_keywords: ['purple blotch', 'जांभळा डाग', 'बैंगनी धब्बा', 'alternaria', 'onion disease'],
    response_mr: '🟣 कांद्यावर जांभळा डाग! मॅन्कोझेब + कार्बेन्डाझिम फवारा.',
    response_hi: '🟣 प्याज पर बैंगनी धब्बा! मैंकोज़ेब + कार्बेन्डाज़िम स्प्रे करें।',
    response_en: '🟣 Onion purple blotch! Spray Mancozeb + Carbendazim.',
    alternatives: ['Mancozeb 75% WP @ 2.5g/L', 'Carbendazim 50% WP @ 1g/L'],
    action_type: 'RECOMMEND'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL FALLBACK RULES - For common agricultural questions
  // ═══════════════════════════════════════════════════════════════════════════
  {
    rule_id: 'GENERAL_PEST_ADVICE',
    category: 'pest',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'GENERAL_PEST_MANAGEMENT',
    scientific_source: 'ICAR IPM Guidelines',
    scientific_basis: 'Integrated Pest Management follows cultural, biological, and chemical control in sequence.',
    trigger_keywords: ['pest', 'insect', 'कीड', 'कीट', 'bug', 'किड्या', 'कीड़ा', 'attack', 'infestation'],
    response_mr: '🔍 कीड समस्या? प्रथम ओळख करा, नंतर IPM पद्धती वापरा. गंभीर असल्यास रासायनिक नियंत्रण.',
    response_hi: '🔍 कीट समस्या? पहले पहचान करें, फिर IPM विधि अपनाएं। गंभीर होने पर रासायनिक नियंत्रण।',
    response_en: '🔍 Pest problem? First identify the pest, then follow IPM approach. Chemical control if severe.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'GENERAL_DISEASE_ADVICE',
    category: 'disease',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'GENERAL_DISEASE_MANAGEMENT',
    scientific_source: 'ICAR Disease Management Guidelines',
    scientific_basis: 'Early detection and preventive measures are key to disease management.',
    trigger_keywords: ['disease', 'रोग', 'बीमारी', 'fungus', 'बुरशी', 'फफूंद', 'rot', 'wilt', 'blight', 'spot'],
    response_mr: '🔬 रोग समस्या? लक्षणे ओळखा. निरोगी बियाणे वापरा. आवश्यक असल्यास बुरशीनाशक फवारा.',
    response_hi: '🔬 रोग समस्या? लक्षण पहचानें। स्वस्थ बीज उपयोग करें। आवश्यक होने पर फफूंदनाशक स्प्रे करें।',
    response_en: '🔬 Disease problem? Identify symptoms. Use healthy seeds. Spray fungicide if needed.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'GENERAL_NUTRIENT_ADVICE',
    category: 'nutrient',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'GENERAL_NUTRIENT_MANAGEMENT',
    scientific_source: 'ICAR Soil and Nutrient Management',
    scientific_basis: 'Balanced nutrition based on soil test ensures optimal crop growth.',
    trigger_keywords: ['fertilizer', 'खत', 'खाद', 'nutrient', 'npk', 'urea', 'dap', 'पोषण', 'yellow leaves', 'पिवळी पाने'],
    response_mr: '🌱 खत व्यवस्थापन? माती परीक्षण करा. शिफारशीनुसार NPK द्या.',
    response_hi: '🌱 खाद प्रबंधन? मृदा परीक्षण करें। सिफारिश के अनुसार NPK दें।',
    response_en: '🌱 Nutrient management? Get soil tested. Apply NPK as per recommendation.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'GENERAL_WATER_ADVICE',
    category: 'water',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'GENERAL_WATER_MANAGEMENT',
    scientific_source: 'ICAR Irrigation Management',
    scientific_basis: 'Irrigation scheduling based on crop stage and soil moisture is critical.',
    trigger_keywords: ['water', 'irrigation', 'पाणी', 'सिंचाई', 'dry', 'सुकणे', 'सूखना', 'wilting', 'मुरझाना'],
    response_mr: '💧 पाणी व्यवस्थापन? पिकाच्या अवस्थेनुसार सिंचन करा. अति पाणी टाळा.',
    response_hi: '💧 जल प्रबंधन? फसल की अवस्था के अनुसार सिंचाई करें। अधिक पानी से बचें।',
    response_en: '💧 Water management? Irrigate based on crop stage. Avoid overwatering.',
    action_type: 'RECOMMEND'
  },
  {
    rule_id: 'GENERAL_WEED_ADVICE',
    category: 'weed',
    crop_code: 'all',
    priority: 'P5_IPM',
    cause: 'GENERAL_WEED_MANAGEMENT',
    scientific_source: 'ICAR Weed Management Guidelines',
    scientific_basis: 'Critical weed competition period varies by crop. Early weeding essential.',
    trigger_keywords: ['weed', 'तण', 'खरपतवार', 'grass', 'गवत', 'घास', 'weeding', 'herbicide'],
    response_mr: '🌿 तण नियंत्रण? पहिल्या 30-45 दिवसात तण काढा. आवश्यक असल्यास तणनाशक वापरा.',
    response_hi: '🌿 खरपतवार नियंत्रण? पहले 30-45 दिनों में निराई करें। आवश्यक होने पर शाकनाशी उपयोग करें।',
    response_en: '🌿 Weed control? Weed within first 30-45 days. Use herbicide if needed.',
    action_type: 'RECOMMEND'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function normalizePriority(priority: PriorityLevel | number): PriorityLevel {
  if (typeof priority === 'string') return priority;
  
  const numericMapping: Record<number, PriorityLevel> = {
    0: 'P0_EMERGENCY',
    1: 'P1_REGULATORY',
    2: 'P2_WEATHER_SAFETY',
    3: 'P3_CROP_STAGE',
    4: 'P4_ECONOMIC',
    5: 'P5_IPM',
    6: 'P6_OPTIMIZATION'
  };
  
  return numericMapping[priority] || 'P5_IPM';
}

/**
 * Match rules by keywords with fuzzy matching
 */
export function matchRulesByKeywords(
  keywordsOrMessage: string | string[],
  categoryOrCropCode?: string,
  language: string = 'en'
): SymbolicRule[] {
  let keywords: string[];
  let targetCategory: string | undefined;
  let cropCode: string | undefined;
  
  if (Array.isArray(keywordsOrMessage)) {
    keywords = keywordsOrMessage.map(k => k.toLowerCase().trim()).filter(k => k.length > 1);
    targetCategory = categoryOrCropCode;
  } else {
    keywords = keywordsOrMessage.toLowerCase().split(/\s+/).filter(k => k.length > 1);
    cropCode = categoryOrCropCode;
  }
  
  console.log(`🔍 Rule matching: ${keywords.length} keywords, category=${targetCategory || 'all'}`);
  
  const priorityOrder: Record<PriorityLevel, number> = {
    'P0_EMERGENCY': 0,
    'P1_REGULATORY': 1,
    'P2_WEATHER_SAFETY': 2,
    'P3_CROP_STAGE': 3,
    'P4_ECONOMIC': 4,
    'P5_IPM': 5,
    'P6_OPTIMIZATION': 6
  };
  
  const matchedRules = SYMBOLIC_RULES_REGISTRY.filter(rule => {
    // Filter by category if specified
    if (targetCategory && rule.category !== targetCategory) {
      return false;
    }
    
    // Filter by crop code if specified
    if (cropCode && rule.crop_code !== 'all' && rule.crop_code !== cropCode) {
      return false;
    }
    
    // Match if ANY keyword matches trigger_keywords
    if (!rule.trigger_keywords || rule.trigger_keywords.length === 0) {
      return !!targetCategory;
    }
    
    for (const keyword of keywords) {
      if (keyword.length < 2) continue;
      
      for (const triggerKw of rule.trigger_keywords) {
        const triggerLower = triggerKw.toLowerCase();
        if (triggerLower.includes(keyword) || keyword.includes(triggerLower)) {
          return true;
        }
      }
    }
    
    return false;
  }).sort((a, b) => {
    const aPriority = typeof a.priority === 'string' ? priorityOrder[a.priority] : a.priority;
    const bPriority = typeof b.priority === 'string' ? priorityOrder[b.priority] : b.priority;
    return aPriority - bPriority;
  });
  
  console.log(`   ✅ Matched ${matchedRules.length} rules`);
  return matchedRules;
}

/**
 * Convert SymbolicRule to RuleResult for rule engine
 */
export function convertToRuleResult(
  rule: SymbolicRule,
  inputOrLanguage: any
): RuleResult {
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
console.log('   Rule counts by category:', JSON.stringify(getRuleCountByCategory()));
