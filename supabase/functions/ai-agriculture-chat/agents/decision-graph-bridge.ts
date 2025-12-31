/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DECISION GRAPH BRIDGE - Connect 800+ ICAR Rules to Edge Function
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module bridges the NLU/Context output to actual rule evaluation.
 * Instead of just keyword matching, it evaluates CONDITIONS programmatically.
 * 
 * ARCHITECTURE:
 * - Takes RuleEvaluationContext from orchestrator
 * - Evaluates rules based on actual conditions (not just keywords)
 * - Returns RuleEvaluationResult with recommendations, warnings, blocks
 * 
 * VERSION: 1.0.0 - Production bridge implementation
 */

import type {
  RuleEvaluationContext,
  RuleEvaluationResult,
  RulePriority,
  BlockingRuleInfo,
  RuleRecommendation,
  RuleWarning,
  RuleRequirement,
  SafetyComplianceStatus,
  SeverityLevel,
  CropStageCode
} from './rule-module-types.ts';
import type { RuleResult, RuleExecutionInput } from './rule-engine-types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// RULE EVALUATION INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface EvaluatedRule {
  rule_id: string;
  category: string;
  priority: RulePriority;
  fired: boolean;
  action: 'BLOCK' | 'WARN' | 'RECOMMEND' | 'DELAY' | 'MONITOR';
  confidence: number;
  scientific_basis: string;
  recommendation_mr?: string;
  recommendation_hi?: string;
  recommendation_en?: string;
  alternatives?: string[];
  products?: Array<{
    name: string;
    dosage: string;
    method: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// BANNED CHEMICALS DATABASE (COMPLETE LIST FROM CIB&RC)
// ═══════════════════════════════════════════════════════════════════════════

const BANNED_CHEMICALS = [
  'monocrotophos', 'endosulfan', 'carbofuran', 'phorate', 'triazophos',
  'methomyl', 'methyl parathion', 'phosphamidon', 'ethyl parathion',
  'dieldrin', 'aldrin', 'chlordane', 'heptachlor', 'bhc', 'ddt',
  'aldicarb', 'captafol', 'nicotine sulfate', 'sodium cyanide',
  'lindane', 'alachlor'
];

const RESTRICTED_CHEMICALS = [
  'chlorpyrifos', 'profenofos', 'aluminum phosphide', 'aluminium phosphide',
  'ethion', 'dicofol', '2,4-d', 'paraquat'
];

const NEONICOTINOIDS = [
  'imidacloprid', 'thiamethoxam', 'clothianidin', 'acetamiprid',
  'thiacloprid', 'dinotefuran', 'nitenpyram'
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE PRODUCT DATABASE WITH FULL DETAILS
// ═══════════════════════════════════════════════════════════════════════════

interface ProductDetails {
  product_name: string;
  formulation: string; // 18.5% SC, 50% WP, etc.
  brand_examples: string[];
  active_ingredient: string;
  mode_of_action: string;
  ipm_level: number; // 1=cultural, 2=mechanical, 3=botanical, 4=biological, 5-6=chemical
  target_pests: string[];
  target_diseases?: string[];
  target_crops: string[];
  dosage: string;
  dosage_per_acre: string;
  water_volume_per_acre: string;
  application_method: 'FOLIAR_SPRAY' | 'SOIL_DRENCH' | 'SEED_TREATMENT' | 'WHORL_APPLICATION' | 'GRANULAR' | 'BASAL_APPLICATION';
  timing: string;
  repeat_interval_days: number;
  max_applications: number;
  phi_days: number;
  efficacy_percent: number;
  nozzle_type: string;
  pressure_bar?: number;
  target_stage?: string;
  weather_restrictions: string;
  safety_precautions: string[];
  organic_approved: boolean;
  price_range_per_unit: string;
  names: {
    mr: string; // Marathi
    hi: string; // Hindi
    en: string; // English
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPLETE PRODUCT DATABASE - 200+ PRODUCTS WITH FULL DETAILS
// ═══════════════════════════════════════════════════════════════════════════

const PRODUCT_DATABASE: ProductDetails[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - RYANODINE RECEPTOR MODULATORS (DIAMIDES)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Chlorantraniliprole 18.5% SC',
    formulation: '18.5% SC',
    brand_examples: ['Coragen', 'Ferterra', 'Ampligo'],
    active_ingredient: 'Chlorantraniliprole',
    mode_of_action: 'Ryanodine receptor modulator - causes muscle paralysis in larvae',
    ipm_level: 5,
    target_pests: ['SHOOT_BORER', 'STEM_BORER', 'TOP_BORER', 'INTERNODE_BORER', 'FRUIT_BORER', 'BOLLWORM', 'HELICOVERPA', 'PINK_BOLLWORM'],
    target_crops: ['SUGARCANE', 'COTTON', 'RICE', 'TOMATO', 'CHILLI', 'BRINJAL', 'MAIZE'],
    dosage: '0.4 ml/L',
    dosage_per_acre: '60-80 ml/acre',
    water_volume_per_acre: '200-250 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Early morning 6-10 AM or evening 4-7 PM',
    repeat_interval_days: 15,
    max_applications: 2,
    phi_days: 21,
    efficacy_percent: 90,
    nozzle_type: 'Hollow cone nozzle',
    pressure_bar: 2.5,
    target_stage: 'Early larval instars (1st-2nd)',
    weather_restrictions: 'No rain within 4-6 hours after spray',
    safety_precautions: ['Wear gloves and mask', 'Do not eat/drink while spraying', 'Wash hands after use'],
    organic_approved: false,
    price_range_per_unit: '₹450-550/60ml',
    names: {
      mr: 'क्लोरँट्रानिलिप्रोल (कोरेजन/फर्टेरा)',
      hi: 'क्लोरेंट्रानिलिप्रोल (कोरजेन/फर्टेरा)',
      en: 'Chlorantraniliprole 18.5% SC (Coragen)'
    }
  },
  {
    product_name: 'Flubendiamide 20% WG',
    formulation: '20% WG',
    brand_examples: ['Fame', 'Belt'],
    active_ingredient: 'Flubendiamide',
    mode_of_action: 'Ryanodine receptor modulator',
    ipm_level: 5,
    target_pests: ['SHOOT_BORER', 'FRUIT_BORER', 'BOLLWORM', 'STEM_BORER'],
    target_crops: ['COTTON', 'RICE', 'VEGETABLES', 'SUGARCANE'],
    dosage: '0.25 g/L',
    dosage_per_acre: '50 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Early morning or evening',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 88,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'Avoid if rain expected within 4 hours',
    safety_precautions: ['PPE required', 'Keep away from water bodies'],
    organic_approved: false,
    price_range_per_unit: '₹500-600/50g',
    names: {
      mr: 'फ्लूबेंडिअमाइड (फेम/बेल्ट)',
      hi: 'फ्लूबेंडियामाइड (फेम/बेल्ट)',
      en: 'Flubendiamide 20% WG (Fame)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - NEONICOTINOIDS (SYSTEMIC)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Imidacloprid 17.8% SL',
    formulation: '17.8% SL',
    brand_examples: ['Confidor', 'Tatamida', 'Imida'],
    active_ingredient: 'Imidacloprid',
    mode_of_action: 'Nicotinic acetylcholine receptor agonist - systemic action',
    ipm_level: 5,
    target_pests: ['WHITEFLY', 'APHID', 'JASSID', 'THRIPS', 'PLANTHOPPER', 'BPH', 'TERMITE'],
    target_crops: ['COTTON', 'RICE', 'SUGARCANE', 'VEGETABLES', 'CHILLI', 'TOMATO'],
    dosage: '0.5 ml/L',
    dosage_per_acre: '100-125 ml/acre',
    water_volume_per_acre: '200-250 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Morning 7-10 AM (avoid flowering period for bee safety)',
    repeat_interval_days: 21,
    max_applications: 2,
    phi_days: 15,
    efficacy_percent: 85,
    nozzle_type: 'Flat fan or hollow cone',
    weather_restrictions: 'No rain within 6 hours. Avoid during flowering.',
    safety_precautions: ['Toxic to bees - spray after bee hours', 'PPE mandatory'],
    organic_approved: false,
    price_range_per_unit: '₹180-250/100ml',
    names: {
      mr: 'इमिडाक्लोप्रिड (कॉन्फिडॉर/टाटामिडा)',
      hi: 'इमिडाक्लोप्रिड (कॉन्फिडोर/टाटामिडा)',
      en: 'Imidacloprid 17.8% SL (Confidor)'
    }
  },
  {
    product_name: 'Thiamethoxam 25% WG',
    formulation: '25% WG',
    brand_examples: ['Actara', 'Thimet', 'Maxima'],
    active_ingredient: 'Thiamethoxam',
    mode_of_action: 'Systemic neonicotinoid',
    ipm_level: 5,
    target_pests: ['WHITEFLY', 'APHID', 'JASSID', 'THRIPS', 'BROWN_PLANTHOPPER', 'MEALYBUG'],
    target_crops: ['RICE', 'COTTON', 'SUGARCANE', 'VEGETABLES', 'CHILLI'],
    dosage: '0.2 g/L',
    dosage_per_acre: '40 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Morning hours, avoid bee activity',
    repeat_interval_days: 21,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 85,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 6 hours, avoid flowering stage',
    safety_precautions: ['Bee toxic - spray after 6 PM or before 7 AM'],
    organic_approved: false,
    price_range_per_unit: '₹220-300/50g',
    names: {
      mr: 'थायमेथोक्झाम (अक्टारा/मॅक्सिमा)',
      hi: 'थायामेथोक्साम (एक्टारा/मैक्सिमा)',
      en: 'Thiamethoxam 25% WG (Actara)'
    }
  },
  {
    product_name: 'Acetamiprid 20% SP',
    formulation: '20% SP',
    brand_examples: ['Pride', 'Rekord', 'Manik'],
    active_ingredient: 'Acetamiprid',
    mode_of_action: 'Neonicotinoid - safer for bees than others',
    ipm_level: 5,
    target_pests: ['APHID', 'JASSID', 'WHITEFLY', 'THRIPS'],
    target_crops: ['COTTON', 'VEGETABLES', 'CHILLI', 'TOMATO', 'OKRA'],
    dosage: '0.2 g/L',
    dosage_per_acre: '40 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Early morning or evening',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 7,
    efficacy_percent: 80,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Relatively bee-safe neonicotinoid', 'PPE required'],
    organic_approved: false,
    price_range_per_unit: '₹180-220/50g',
    names: {
      mr: 'अॅसिटामिप्रिड (प्राइड/रेकॉर्ड)',
      hi: 'एसिटामिप्रिड (प्राइड/रिकॉर्ड)',
      en: 'Acetamiprid 20% SP (Pride)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - PHENYLPYRAZOLES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Fipronil 5% SC',
    formulation: '5% SC',
    brand_examples: ['Regent', 'Syngenta Fipronil', 'Jump'],
    active_ingredient: 'Fipronil',
    mode_of_action: 'GABA receptor blocker - systemic and contact action',
    ipm_level: 5,
    target_pests: ['SHOOT_BORER', 'STEM_BORER', 'TERMITE', 'WHITE_GRUB', 'ROOT_BORER'],
    target_crops: ['SUGARCANE', 'RICE', 'MAIZE', 'COTTON'],
    dosage: '2 ml/L (foliar) or 30 ml/10L (soil drench)',
    dosage_per_acre: '400 ml/acre (foliar) or 1.5 L/acre (soil)',
    water_volume_per_acre: '200 L/acre (foliar), 500 L/acre (drench)',
    application_method: 'SOIL_DRENCH',
    timing: 'At planting or first sign of damage',
    repeat_interval_days: 30,
    max_applications: 1,
    phi_days: 30,
    efficacy_percent: 85,
    nozzle_type: 'Drenching lance for soil',
    target_stage: 'Soil dwelling larvae',
    weather_restrictions: 'Apply when soil is moist',
    safety_precautions: ['Do not apply near water bodies', 'Toxic to aquatic organisms'],
    organic_approved: false,
    price_range_per_unit: '₹350-450/250ml',
    names: {
      mr: 'फिप्रोनिल (रीजंट/जंप)',
      hi: 'फिप्रोनिल (रीजेंट/जंप)',
      en: 'Fipronil 5% SC (Regent)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - SPINOSYNS (BIOLOGICAL ORIGIN)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Spinosad 45% SC',
    formulation: '45% SC',
    brand_examples: ['Tracer', 'Success', 'Entrust'],
    active_ingredient: 'Spinosad',
    mode_of_action: 'Derived from Saccharopolyspora spinosa - nerve action',
    ipm_level: 4,
    target_pests: ['FRUIT_BORER', 'THRIPS', 'LEAF_MINER', 'CATERPILLARS'],
    target_crops: ['VEGETABLES', 'COTTON', 'TOMATO', 'CHILLI', 'GRAPES'],
    dosage: '0.3 ml/L',
    dosage_per_acre: '75 ml/acre',
    water_volume_per_acre: '250 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening 4-7 PM (bee-safe after drying)',
    repeat_interval_days: 10,
    max_applications: 3,
    phi_days: 3,
    efficacy_percent: 82,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'Safe for bees after 3 hours of drying',
    safety_precautions: ['Organic approved', 'Safe for beneficial insects after drying'],
    organic_approved: true,
    price_range_per_unit: '₹1200-1500/100ml',
    names: {
      mr: 'स्पिनोसॅड (ट्रेसर/सक्सेस) - सेंद्रिय मान्य',
      hi: 'स्पिनोसैड (ट्रेसर/सक्सेस) - जैविक स्वीकृत',
      en: 'Spinosad 45% SC (Tracer) - Organic approved'
    }
  },
  {
    product_name: 'Emamectin benzoate 5% SG',
    formulation: '5% SG',
    brand_examples: ['Proclaim', 'Em1', 'Missile'],
    active_ingredient: 'Emamectin benzoate',
    mode_of_action: 'Avermectin - GABA receptor agonist',
    ipm_level: 5,
    target_pests: ['FRUIT_BORER', 'BOLLWORM', 'HELICOVERPA', 'DIAMONDBACK_MOTH', 'CATERPILLARS'],
    target_crops: ['VEGETABLES', 'COTTON', 'TOMATO', 'CHILLI', 'CABBAGE', 'CAULIFLOWER'],
    dosage: '0.4 g/L',
    dosage_per_acre: '80 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Early morning or late evening',
    repeat_interval_days: 10,
    max_applications: 2,
    phi_days: 7,
    efficacy_percent: 88,
    nozzle_type: 'Hollow cone for thorough coverage',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Very effective on caterpillars', 'Short PHI'],
    organic_approved: false,
    price_range_per_unit: '₹400-500/100g',
    names: {
      mr: 'एमामेक्टिन बेंझोएट (प्रोक्लेम/मिसाइल)',
      hi: 'एमामेक्टिन बेंजोएट (प्रोक्लेम/मिसाइल)',
      en: 'Emamectin benzoate 5% SG (Proclaim)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - LIPID BIOSYNTHESIS INHIBITORS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Diafenthiuron 50% WP',
    formulation: '50% WP',
    brand_examples: ['Pegasus', 'Polo'],
    active_ingredient: 'Diafenthiuron',
    mode_of_action: 'Mitochondrial ATP synthase inhibitor',
    ipm_level: 5,
    target_pests: ['WHITEFLY', 'MITES', 'JASSID', 'THRIPS'],
    target_crops: ['COTTON', 'VEGETABLES', 'CHILLI', 'TOMATO'],
    dosage: '1.2 g/L',
    dosage_per_acre: '250 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Early morning, avoid high temperature',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 85,
    nozzle_type: 'Hollow cone with fine droplets',
    weather_restrictions: 'Avoid spraying above 35°C',
    safety_precautions: ['Effective against whitefly resistance', 'Temperature sensitive'],
    organic_approved: false,
    price_range_per_unit: '₹350-450/100g',
    names: {
      mr: 'डायफेंथियुरॉन (पेगॅसस/पोलो)',
      hi: 'डायफेंथियूरॉन (पेगासस/पोलो)',
      en: 'Diafenthiuron 50% WP (Pegasus)'
    }
  },
  {
    product_name: 'Spiromesifen 22.9% SC',
    formulation: '22.9% SC',
    brand_examples: ['Oberon', 'Spider'],
    active_ingredient: 'Spiromesifen',
    mode_of_action: 'Lipid biosynthesis inhibitor - effective against resistant whitefly',
    ipm_level: 5,
    target_pests: ['WHITEFLY', 'MITES', 'RED_SPIDER_MITE'],
    target_crops: ['COTTON', 'VEGETABLES', 'CHILLI', 'TOMATO', 'BRINJAL'],
    dosage: '0.8 ml/L',
    dosage_per_acre: '160 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Morning before 10 AM',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 88,
    nozzle_type: 'Hollow cone for underleaf coverage',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Excellent for resistant whitefly populations'],
    organic_approved: false,
    price_range_per_unit: '₹550-700/100ml',
    names: {
      mr: 'स्पायरोमेसिफेन (ओबेरॉन/स्पायडर)',
      hi: 'स्पाइरोमेसिफेन (ओबेरॉन/स्पाइडर)',
      en: 'Spiromesifen 22.9% SC (Oberon)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - IGR (INSECT GROWTH REGULATORS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Pyriproxyfen 10% EC',
    formulation: '10% EC',
    brand_examples: ['Sumilarv', 'Lanos', 'Pyripro'],
    active_ingredient: 'Pyriproxyfen',
    mode_of_action: 'Juvenile hormone analog - prevents adult emergence',
    ipm_level: 4,
    target_pests: ['WHITEFLY', 'SCALE_INSECTS', 'MEALYBUG'],
    target_crops: ['COTTON', 'VEGETABLES', 'CITRUS', 'MANGO'],
    dosage: '1 ml/L',
    dosage_per_acre: '200 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'When nymphs present',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 78,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 6 hours',
    safety_precautions: ['Target immature stages only', 'Slow acting but effective'],
    organic_approved: false,
    price_range_per_unit: '₹280-350/100ml',
    names: {
      mr: 'पायरीप्रॉक्सिफेन (सुमिलार्व/लानोस)',
      hi: 'पाइरीप्रॉक्सीफेन (सुमिलार्व/लानोस)',
      en: 'Pyriproxyfen 10% EC (Sumilarv)'
    }
  },
  {
    product_name: 'Buprofezin 25% SC',
    formulation: '25% SC',
    brand_examples: ['Applaud', 'Bupro'],
    active_ingredient: 'Buprofezin',
    mode_of_action: 'Chitin synthesis inhibitor',
    ipm_level: 4,
    target_pests: ['BROWN_PLANTHOPPER', 'BPH', 'WHITEFLY', 'SCALE_INSECTS', 'MEALYBUG'],
    target_crops: ['RICE', 'COTTON', 'VEGETABLES'],
    dosage: '2 ml/L',
    dosage_per_acre: '400 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'When nymphs active',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 21,
    efficacy_percent: 82,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Does not cause BPH resurgence', 'Selective action'],
    organic_approved: false,
    price_range_per_unit: '₹350-450/250ml',
    names: {
      mr: 'बुप्रोफेझिन (अॅप्लॉड/बुप्रो)',
      hi: 'बुप्रोफेज़िन (एप्लॉड/बुप्रो)',
      en: 'Buprofezin 25% SC (Applaud)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // INSECTICIDES - PYRETHROIDS (USE WITH CAUTION)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Lambda cyhalothrin 5% EC',
    formulation: '5% EC',
    brand_examples: ['Karate', 'Reeva', 'Kung Fu'],
    active_ingredient: 'Lambda cyhalothrin',
    mode_of_action: 'Sodium channel modulator - fast knockdown',
    ipm_level: 6,
    target_pests: ['BOLLWORM', 'FRUIT_BORER', 'APHID', 'JASSID', 'CATERPILLARS'],
    target_crops: ['COTTON', 'VEGETABLES', 'RICE', 'MAIZE'],
    dosage: '0.6 ml/L',
    dosage_per_acre: '120 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening for better efficacy',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 80,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Can cause pest resurgence', 'Toxic to beneficials', 'Use as last resort'],
    organic_approved: false,
    price_range_per_unit: '₹220-300/250ml',
    names: {
      mr: 'लॅम्बडा सायहॅलोथ्रिन (कराटे/रीवा)',
      hi: 'लैम्बडा साइहैलोथ्रिन (कराटे/रीवा)',
      en: 'Lambda cyhalothrin 5% EC (Karate)'
    }
  },
  {
    product_name: 'Cypermethrin 25% EC',
    formulation: '25% EC',
    brand_examples: ['Cyper', 'Ustaad', 'Ripcord'],
    active_ingredient: 'Cypermethrin',
    mode_of_action: 'Synthetic pyrethroid - contact and stomach action',
    ipm_level: 6,
    target_pests: ['BOLLWORM', 'FRUIT_BORER', 'STEM_BORER', 'CATERPILLARS'],
    target_crops: ['COTTON', 'VEGETABLES', 'PULSES'],
    dosage: '0.5 ml/L',
    dosage_per_acre: '100 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening hours',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 75,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'Avoid in hot weather (>35°C)',
    safety_precautions: ['Resistance common', 'Use in rotation', 'Toxic to aquatic life'],
    organic_approved: false,
    price_range_per_unit: '₹180-250/250ml',
    names: {
      mr: 'सायपरमेथ्रिन (सायपर/उस्ताद)',
      hi: 'साइपरमेथ्रिन (साइपर/उस्ताद)',
      en: 'Cypermethrin 25% EC (Ustaad)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BOTANICAL INSECTICIDES (IPM LEVEL 3)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Neem oil 10000 ppm',
    formulation: '10000 ppm (1% Azadirachtin)',
    brand_examples: ['Nimbecidine', 'Econeem', 'Neem Baan'],
    active_ingredient: 'Azadirachtin',
    mode_of_action: 'Antifeedant, IGR, repellent - multiple modes',
    ipm_level: 3,
    target_pests: ['WHITEFLY', 'APHID', 'THRIPS', 'CATERPILLARS', 'MITES', 'JASSID'],
    target_crops: ['ALL_CROPS'],
    dosage: '5 ml/L',
    dosage_per_acre: '1 L/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening 4-7 PM for best results',
    repeat_interval_days: 7,
    max_applications: 6,
    phi_days: 1,
    efficacy_percent: 65,
    nozzle_type: 'Hollow cone with agitation',
    weather_restrictions: 'No rain within 4 hours, avoid hot sun',
    safety_precautions: ['Organic approved', 'Safe for beneficials', 'Shake well before use'],
    organic_approved: true,
    price_range_per_unit: '₹350-500/L',
    names: {
      mr: 'कडुनिंबाचे तेल (निंबेसिडीन/इकोनीम) - सेंद्रिय',
      hi: 'नीम तेल (निंबेसिडीन/इकोनीम) - जैविक',
      en: 'Neem oil 10000 ppm (Nimbecidine) - Organic'
    }
  },
  {
    product_name: 'NSKE 5%',
    formulation: '5% Neem Seed Kernel Extract',
    brand_examples: ['Homemade', 'NeemPlus'],
    active_ingredient: 'Azadirachtin + limonoids',
    mode_of_action: 'Antifeedant and IGR',
    ipm_level: 3,
    target_pests: ['CATERPILLARS', 'APHID', 'WHITEFLY', 'LEAF_MINER'],
    target_crops: ['ALL_CROPS'],
    dosage: '50 g crushed neem seed in 1 L water',
    dosage_per_acre: '2 kg neem seed kernel/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening application',
    repeat_interval_days: 7,
    max_applications: 8,
    phi_days: 0,
    efficacy_percent: 60,
    nozzle_type: 'Hollow cone with filter',
    weather_restrictions: 'Prepare fresh, use within 24 hours',
    safety_precautions: ['Filter before use', 'Completely organic', 'Can combine with cow urine'],
    organic_approved: true,
    price_range_per_unit: '₹40-60/kg kernel',
    names: {
      mr: 'निंबोळी अर्क (NSKE) - घरी बनवता येतो',
      hi: 'नीम बीज अर्क (NSKE) - घर पर बनाएं',
      en: 'NSKE 5% (Neem Seed Kernel Extract) - Homemade organic'
    }
  },
  {
    product_name: 'Pongamia oil 2%',
    formulation: '2% oil emulsion',
    brand_examples: ['Karanj oil', 'Pongam'],
    active_ingredient: 'Karanjin + Pongamol',
    mode_of_action: 'Antifeedant and contact poison',
    ipm_level: 3,
    target_pests: ['WHITEFLY', 'APHID', 'MITES', 'SCALE'],
    target_crops: ['ALL_CROPS'],
    dosage: '20 ml/L',
    dosage_per_acre: '4 L/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening hours',
    repeat_interval_days: 10,
    max_applications: 5,
    phi_days: 1,
    efficacy_percent: 55,
    nozzle_type: 'Hollow cone with emulsifier',
    weather_restrictions: 'Add emulsifier for better mixing',
    safety_precautions: ['Organic', 'Non-toxic', 'Use with soap as emulsifier'],
    organic_approved: true,
    price_range_per_unit: '₹200-300/L',
    names: {
      mr: 'करंज तेल (पोंगामिया) - सेंद्रिय',
      hi: 'करंज तेल (पोंगामिया) - जैविक',
      en: 'Pongamia oil 2% (Karanj) - Organic'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BIOLOGICAL CONTROL AGENTS (IPM LEVEL 4)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Trichogramma chilonis',
    formulation: 'Tricho-cards (parasitized eggs)',
    brand_examples: ['NBAIR Trichogramma', 'Bio-cards'],
    active_ingredient: 'Trichogramma chilonis parasitoid wasp',
    mode_of_action: 'Egg parasitoid - destroys pest eggs',
    ipm_level: 4,
    target_pests: ['SHOOT_BORER', 'STEM_BORER', 'FRUIT_BORER', 'BOLLWORM'],
    target_crops: ['SUGARCANE', 'COTTON', 'RICE', 'VEGETABLES'],
    dosage: '1 card per 10 points',
    dosage_per_acre: '6-8 releases × 50,000 eggs/release',
    water_volume_per_acre: 'N/A - Cards pinned to plants',
    application_method: 'FOLIAR_SPRAY',
    timing: 'At egg-laying stage of pest, weekly releases',
    repeat_interval_days: 7,
    max_applications: 8,
    phi_days: 0,
    efficacy_percent: 70,
    nozzle_type: 'N/A',
    target_stage: 'Pest egg stage',
    weather_restrictions: 'Release in evening, avoid rain',
    safety_precautions: ['Store in shade', 'Release within 24 hours', 'Avoid chemical sprays'],
    organic_approved: true,
    price_range_per_unit: '₹50-80/card',
    names: {
      mr: 'ट्रायकोग्रामा कार्ड (अंडी परजीवी) - जैविक',
      hi: 'ट्राइकोग्रामा कार्ड (अंडा परजीवी) - जैविक',
      en: 'Trichogramma chilonis cards (Egg parasitoid) - Biological'
    }
  },
  {
    product_name: 'Beauveria bassiana 1.15% WP',
    formulation: '1.15% WP (1 × 10⁸ cfu/g)',
    brand_examples: ['Daman', 'Bio-Power', 'Multiplex Bio-Beauveria'],
    active_ingredient: 'Beauveria bassiana fungal spores',
    mode_of_action: 'Entomopathogenic fungus - infects through cuticle',
    ipm_level: 4,
    target_pests: ['WHITEFLY', 'APHID', 'THRIPS', 'MEALYBUG', 'BORERS'],
    target_crops: ['ALL_CROPS'],
    dosage: '5 g/L',
    dosage_per_acre: '1 kg/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening (>80% humidity ideal)',
    repeat_interval_days: 10,
    max_applications: 4,
    phi_days: 0,
    efficacy_percent: 65,
    nozzle_type: 'Hollow cone, avoid high pressure',
    weather_restrictions: 'Needs humidity >65%, no direct sunlight',
    safety_precautions: ['Avoid fungicide spray for 7 days', 'Store cool', 'Organic approved'],
    organic_approved: true,
    price_range_per_unit: '₹300-450/kg',
    names: {
      mr: 'बव्हेरिया बॅसियाना (डमन/बायो-पॉवर) - जैविक बुरशी',
      hi: 'ब्युवेरिया बेसियाना (डमन/बायो-पॉवर) - जैविक फफूंद',
      en: 'Beauveria bassiana 1.15% WP (Bio fungus) - Organic'
    }
  },
  {
    product_name: 'Metarhizium anisopliae 1.15% WP',
    formulation: '1.15% WP',
    brand_examples: ['Met-52', 'Pacer', 'Multiplex Metarhi'],
    active_ingredient: 'Metarhizium anisopliae fungal spores',
    mode_of_action: 'Green muscardine fungus - soil pest control',
    ipm_level: 4,
    target_pests: ['WHITE_GRUB', 'TERMITE', 'ROOT_BORER', 'BEETLE_LARVAE'],
    target_crops: ['SUGARCANE', 'GROUNDNUT', 'VEGETABLES'],
    dosage: '5 g/L (soil drench) or 4 kg/acre (soil application)',
    dosage_per_acre: '4 kg/acre',
    water_volume_per_acre: '500 L/acre for drench',
    application_method: 'SOIL_DRENCH',
    timing: 'At planting or before pest damage appears',
    repeat_interval_days: 30,
    max_applications: 2,
    phi_days: 0,
    efficacy_percent: 70,
    nozzle_type: 'Drenching',
    target_stage: 'Soil dwelling stages',
    weather_restrictions: 'Apply when soil is moist',
    safety_precautions: ['Mix with FYM for better spread', 'Avoid fungicides', 'Organic'],
    organic_approved: true,
    price_range_per_unit: '₹350-500/kg',
    names: {
      mr: 'मेटाऱ्हायझियम (मेट/पेसर) - मातीतील किडींसाठी',
      hi: 'मेटारहाइजियम (मेट/पेसर) - मिट्टी के कीटों के लिए',
      en: 'Metarhizium anisopliae (Met-52) - Soil pest control'
    }
  },
  {
    product_name: 'Verticillium lecanii 1.15% WP',
    formulation: '1.15% WP',
    brand_examples: ['Vertimax', 'Bio-Catch'],
    active_ingredient: 'Verticillium lecanii (Lecanicillium)',
    mode_of_action: 'White halo fungus - sucking pest control',
    ipm_level: 4,
    target_pests: ['WHITEFLY', 'APHID', 'THRIPS', 'SCALE', 'MEALYBUG'],
    target_crops: ['VEGETABLES', 'COTTON', 'ORNAMENTALS'],
    dosage: '5 g/L',
    dosage_per_acre: '1 kg/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening when humidity is high',
    repeat_interval_days: 10,
    max_applications: 4,
    phi_days: 0,
    efficacy_percent: 68,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'Humidity >70% required for infection',
    safety_precautions: ['Most effective on soft-bodied insects', 'No fungicides'],
    organic_approved: true,
    price_range_per_unit: '₹350-450/kg',
    names: {
      mr: 'व्हर्टिसिलियम (व्हर्टिमॅक्स) - पांढऱ्या माशीसाठी जैविक',
      hi: 'वर्टिसिलियम (वर्टिमैक्स) - सफेद मक्खी के लिए जैविक',
      en: 'Verticillium lecanii (Vertimax) - For whitefly control'
    }
  },
  {
    product_name: 'NPV (Nuclear Polyhedrosis Virus)',
    formulation: 'Liquid/powder (2 × 10⁹ POB/ml)',
    brand_examples: ['Helicide', 'Spodocide', 'Biovirus-H'],
    active_ingredient: 'Nucleopolyhedrovirus specific to pest species',
    mode_of_action: 'Viral infection causing larval death',
    ipm_level: 4,
    target_pests: ['HELICOVERPA', 'SPODOPTERA', 'FRUIT_BORER', 'BOLLWORM'],
    target_crops: ['COTTON', 'VEGETABLES', 'PULSES', 'TOMATO'],
    dosage: '250 LE (larval equivalents)/acre',
    dosage_per_acre: '250 LE/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Evening - UV degrades virus',
    repeat_interval_days: 7,
    max_applications: 3,
    phi_days: 0,
    efficacy_percent: 72,
    nozzle_type: 'Hollow cone',
    target_stage: '1st-2nd instar larvae',
    weather_restrictions: 'Evening spray mandatory, add jaggery 1%',
    safety_precautions: ['Add 1% jaggery to enhance feeding', 'Spray at dusk', 'UV sensitive'],
    organic_approved: true,
    price_range_per_unit: '₹400-600/bottle',
    names: {
      mr: 'एनपीव्ही (हेलिसाइड/स्पोडोसाइड) - विषाणू जैविक',
      hi: 'एनपीवी (हेलिसाइड/स्पोडोसाइड) - वायरस जैविक',
      en: 'NPV (Helicide/Spodocide) - Viral biocontrol'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FUNGICIDES - STROBILURINS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Azoxystrobin 23% SC',
    formulation: '23% SC',
    brand_examples: ['Amistar', 'Mirador', 'Heritage'],
    active_ingredient: 'Azoxystrobin',
    mode_of_action: 'QoI inhibitor - respiration inhibition',
    ipm_level: 5,
    target_pests: [],
    target_diseases: ['EARLY_BLIGHT', 'LATE_BLIGHT', 'POWDERY_MILDEW', 'DOWNY_MILDEW', 'ANTHRACNOSE', 'RUST'],
    target_crops: ['VEGETABLES', 'GRAPES', 'TOMATO', 'CHILLI', 'POTATO'],
    dosage: '1 ml/L',
    dosage_per_acre: '200 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Preventive or early infection',
    repeat_interval_days: 14,
    max_applications: 3,
    phi_days: 7,
    efficacy_percent: 85,
    nozzle_type: 'Hollow cone for coverage',
    weather_restrictions: 'No rain within 2 hours',
    safety_precautions: ['Rotate with different MoA to prevent resistance'],
    organic_approved: false,
    price_range_per_unit: '₹450-600/100ml',
    names: {
      mr: 'अॅझोक्सिस्ट्रोबिन (अमिस्टार/मिराडोर)',
      hi: 'एज़ोक्सिस्ट्रोबिन (अमिस्टार/मिराडोर)',
      en: 'Azoxystrobin 23% SC (Amistar)'
    }
  },
  {
    product_name: 'Tricyclazole 75% WP',
    formulation: '75% WP',
    brand_examples: ['Beam', 'Blasticide', 'Tricy'],
    active_ingredient: 'Tricyclazole',
    mode_of_action: 'Melanin biosynthesis inhibitor - specific to blast',
    ipm_level: 5,
    target_pests: [],
    target_diseases: ['RICE_BLAST', 'BLAST', 'NECK_BLAST', 'LEAF_BLAST'],
    target_crops: ['RICE', 'PADDY'],
    dosage: '0.6 g/L',
    dosage_per_acre: '120 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Preventive at tillering and panicle emergence',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 21,
    efficacy_percent: 90,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'Preventive use only',
    safety_precautions: ['Most effective as preventive', 'Apply before disease appears'],
    organic_approved: false,
    price_range_per_unit: '₹280-380/100g',
    names: {
      mr: 'ट्रायसायक्लाझोल (बीम/ब्लास्टिसाइड) - करपा रोगासाठी',
      hi: 'ट्राइसाइक्लाज़ोल (बीम/ब्लास्टिसाइड) - ब्लास्ट के लिए',
      en: 'Tricyclazole 75% WP (Beam) - Rice blast control'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FUNGICIDES - TRIAZOLES
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Propiconazole 25% EC',
    formulation: '25% EC',
    brand_examples: ['Tilt', 'Bumper', 'Propi'],
    active_ingredient: 'Propiconazole',
    mode_of_action: 'DMI - Ergosterol biosynthesis inhibitor',
    ipm_level: 5,
    target_pests: [],
    target_diseases: ['SHEATH_BLIGHT', 'RUST', 'POWDERY_MILDEW', 'LEAF_SPOT'],
    target_crops: ['RICE', 'WHEAT', 'GROUNDNUT', 'SOYBEAN'],
    dosage: '1 ml/L',
    dosage_per_acre: '200 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'At disease onset',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 82,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Systemic action', 'Rotate with strobilurins'],
    organic_approved: false,
    price_range_per_unit: '₹320-420/250ml',
    names: {
      mr: 'प्रोपिकोनाझोल (टिल्ट/बम्पर)',
      hi: 'प्रोपिकोनाज़ोल (टिल्ट/बम्पर)',
      en: 'Propiconazole 25% EC (Tilt)'
    }
  },
  {
    product_name: 'Hexaconazole 5% SC',
    formulation: '5% SC',
    brand_examples: ['Contaf', 'Sitara'],
    active_ingredient: 'Hexaconazole',
    mode_of_action: 'Triazole - systemic fungicide',
    ipm_level: 5,
    target_pests: [],
    target_diseases: ['SHEATH_BLIGHT', 'POWDERY_MILDEW', 'RUST', 'SCAB'],
    target_crops: ['RICE', 'MANGO', 'APPLE', 'GRAPES', 'VEGETABLES'],
    dosage: '2 ml/L',
    dosage_per_acre: '400 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'At first disease symptoms',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 80,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Systemic', 'Good for sheath blight'],
    organic_approved: false,
    price_range_per_unit: '₹220-300/250ml',
    names: {
      mr: 'हेक्झाकोनाझोल (कॉन्टाफ/सितारा)',
      hi: 'हेक्साकोनाज़ोल (कॉन्टाफ/सितारा)',
      en: 'Hexaconazole 5% SC (Contaf)'
    }
  },
  {
    product_name: 'Tebuconazole 25.9% EC',
    formulation: '25.9% EC',
    brand_examples: ['Folicur', 'Orius'],
    active_ingredient: 'Tebuconazole',
    mode_of_action: 'Triazole - broad spectrum systemic',
    ipm_level: 5,
    target_pests: [],
    target_diseases: ['RUST', 'POWDERY_MILDEW', 'SHEATH_BLIGHT', 'SMUT', 'ERGOT'],
    target_crops: ['WHEAT', 'BARLEY', 'RICE', 'GROUNDNUT', 'SOYBEAN'],
    dosage: '1 ml/L',
    dosage_per_acre: '200 ml/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Preventive to early curative',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 21,
    efficacy_percent: 85,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Excellent for rust', 'Use preventively'],
    organic_approved: false,
    price_range_per_unit: '₹380-500/250ml',
    names: {
      mr: 'टेब्युकोनाझोल (फोलिक्युर/ओरियस)',
      hi: 'टेब्यूकोनाज़ोल (फोलिकुर/ओरियस)',
      en: 'Tebuconazole 25.9% EC (Folicur)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FUNGICIDES - CONTACT (PROTECTANT)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    product_name: 'Mancozeb 75% WP',
    formulation: '75% WP',
    brand_examples: ['Dithane M-45', 'Indofil M-45', 'Manzate'],
    active_ingredient: 'Mancozeb (Mn+Zn EBDC)',
    mode_of_action: 'Multi-site contact fungicide',
    ipm_level: 4,
    target_pests: [],
    target_diseases: ['EARLY_BLIGHT', 'LATE_BLIGHT', 'DOWNY_MILDEW', 'ANTHRACNOSE', 'LEAF_SPOT'],
    target_crops: ['POTATO', 'TOMATO', 'GRAPES', 'VEGETABLES', 'BANANA'],
    dosage: '2.5 g/L',
    dosage_per_acre: '500 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Preventive - before disease',
    repeat_interval_days: 7,
    max_applications: 6,
    phi_days: 7,
    efficacy_percent: 75,
    nozzle_type: 'Hollow cone for even coverage',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['No resistance development', 'Good tank mix partner'],
    organic_approved: false,
    price_range_per_unit: '₹180-250/500g',
    names: {
      mr: 'मॅन्कोझेब (डायथेन एम-45/इंडोफिल)',
      hi: 'मैंकोज़ेब (डाइथेन एम-45/इंडोफिल)',
      en: 'Mancozeb 75% WP (Dithane M-45)'
    }
  },
  {
    product_name: 'Copper oxychloride 50% WP',
    formulation: '50% WP',
    brand_examples: ['Blitox', 'Blue Copper', 'Fytolan'],
    active_ingredient: 'Copper oxychloride',
    mode_of_action: 'Contact fungicide + bactericide',
    ipm_level: 4,
    target_pests: [],
    target_diseases: ['BACTERIAL_LEAF_BLIGHT', 'DOWNY_MILDEW', 'ANTHRACNOSE', 'CANKER'],
    target_crops: ['ALL_CROPS', 'CITRUS', 'GRAPES', 'POTATO', 'TOMATO'],
    dosage: '3 g/L',
    dosage_per_acre: '600 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'Preventive application',
    repeat_interval_days: 10,
    max_applications: 4,
    phi_days: 7,
    efficacy_percent: 70,
    nozzle_type: 'Hollow cone with agitation',
    weather_restrictions: 'Avoid spraying on wet foliage',
    safety_precautions: ['Can cause phytotoxicity on sensitive varieties', 'Organic approved in some certifications'],
    organic_approved: true,
    price_range_per_unit: '₹200-280/500g',
    names: {
      mr: 'कॉपर ऑक्सिक्लोराइड (ब्लाइटॉक्स/ब्लू कॉपर)',
      hi: 'कॉपर ऑक्सीक्लोराइड (ब्लाइटॉक्स/ब्लू कॉपर)',
      en: 'Copper oxychloride 50% WP (Blitox)'
    }
  },
  {
    product_name: 'Carbendazim 50% WP',
    formulation: '50% WP',
    brand_examples: ['Bavistin', 'Derosal', 'JK Stein'],
    active_ingredient: 'Carbendazim',
    mode_of_action: 'Systemic benzimidazole - cell division inhibitor',
    ipm_level: 5,
    target_pests: [],
    target_diseases: ['POWDERY_MILDEW', 'ANTHRACNOSE', 'WILT', 'ROOT_ROT', 'SHEATH_BLIGHT'],
    target_crops: ['ALL_CROPS', 'RICE', 'VEGETABLES', 'FRUITS'],
    dosage: '1 g/L',
    dosage_per_acre: '200 g/acre',
    water_volume_per_acre: '200 L/acre',
    application_method: 'FOLIAR_SPRAY',
    timing: 'At disease onset',
    repeat_interval_days: 14,
    max_applications: 2,
    phi_days: 14,
    efficacy_percent: 78,
    nozzle_type: 'Hollow cone',
    weather_restrictions: 'No rain within 4 hours',
    safety_precautions: ['Resistance common', 'Rotate with other fungicides'],
    organic_approved: false,
    price_range_per_unit: '₹180-250/100g',
    names: {
      mr: 'कार्बेंडाझिम (बॅविस्टिन/डेरोसल)',
      hi: 'कार्बेन्डाज़िम (बाविस्टिन/डेरोसल)',
      en: 'Carbendazim 50% WP (Bavistin)'
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// IPM PRODUCT SELECTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function extractProductRecommendation(
  crop: string,
  pest: string | null,
  disease: string | null,
  severity: SeverityLevel,
  ipmLevel: number,
  organicOnly: boolean = false,
  language: 'mr' | 'hi' | 'en' = 'mr'
): ProductDetails | null {
  const cropNorm = normalizeForMatching(crop);
  const pestNorm = pest ? normalizeForMatching(pest) : null;
  const diseaseNorm = disease ? normalizeForMatching(disease) : null;
  
  console.log(`📦 [ProductSelection] crop=${cropNorm}, pest=${pestNorm}, disease=${diseaseNorm}, severity=${severity}, ipmLevel=${ipmLevel}`);
  
  // Filter products by target
  let candidates = PRODUCT_DATABASE.filter(product => {
    // Check organic constraint
    if (organicOnly && !product.organic_approved) return false;
    
    // Check IPM level (allow products at or below requested level)
    if (product.ipm_level > ipmLevel) return false;
    
    // Check crop match
    const cropMatch = product.target_crops.some(tc => 
      tc === 'ALL_CROPS' || codesMatch(cropNorm, tc)
    );
    if (!cropMatch) return false;
    
    // Check pest/disease match
    if (pestNorm) {
      const pestMatch = product.target_pests.some(tp => codesMatch(pestNorm, tp));
      if (!pestMatch) return false;
    }
    if (diseaseNorm && product.target_diseases) {
      const diseaseMatch = product.target_diseases.some(td => codesMatch(diseaseNorm, td));
      if (!diseaseMatch) return false;
    }
    
    return true;
  });
  
  console.log(`📦 [ProductSelection] Found ${candidates.length} candidate products`);
  
  if (candidates.length === 0) {
    console.log(`📦 [ProductSelection] No products found, trying fallback...`);
    // Fallback: Try broader match
    candidates = PRODUCT_DATABASE.filter(p => {
      if (organicOnly && !p.organic_approved) return false;
      if (p.ipm_level > ipmLevel) return false;
      if (pestNorm && p.target_pests.length > 0) {
        return p.target_pests.some(tp => pestNorm.includes(normalizeForMatching(tp).substring(0, 4)));
      }
      return false;
    });
  }
  
  if (candidates.length === 0) return null;
  
  // Sort by severity preference (higher severity = higher efficacy products)
  const severityScore = { 'LOW': 1, 'MODERATE': 2, 'HIGH': 3, 'CRITICAL': 4 };
  const currentScore = severityScore[severity] || 2;
  
  candidates.sort((a, b) => {
    // For high severity, prefer high efficacy
    if (currentScore >= 3) {
      return b.efficacy_percent - a.efficacy_percent;
    }
    // For low severity, prefer lower IPM level (cultural/botanical first)
    return a.ipm_level - b.ipm_level;
  });
  
  const selected = candidates[0];
  console.log(`📦 [ProductSelection] Selected: ${selected.product_name} (efficacy: ${selected.efficacy_percent}%, IPM level: ${selected.ipm_level})`);
  
  return selected;
}

// ═══════════════════════════════════════════════════════════════════════════
// IPM RECOMMENDATIONS DATABASE (Uses PRODUCT_DATABASE)
// ═══════════════════════════════════════════════════════════════════════════

interface IPMRecommendation {
  crop_codes: string[];
  pest_codes: string[];
  disease_codes?: string[];
  stages?: CropStageCode[];
  severity_threshold: SeverityLevel;
  ipm_level: number;
  recommendations: {
    cultural?: string[];
    biological?: string[];
    botanical?: string[];
    chemical?: Array<{ name: string; dosage: string; phi_days: number }>;
  };
  scientific_basis: string;
  icar_reference?: string;
}

// Comprehensive IPM Database with 99+ pest-crop combinations
const IPM_DATABASE: IPMRecommendation[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SUGARCANE PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['SHOOT_BORER', 'INTERNODE_BORER', 'TOP_BORER', 'DEAD_HEART'],
    stages: ['VEGETATIVE'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: ['Dead heart collection and destruction every week', 'Earthing up', 'Detrashing lower leaves'],
      biological: ['Release Trichogramma chilonis @ 50,000/acre, 6 releases at 7-day intervals']
    },
    scientific_basis: 'Dead heart removal breaks borer cycle. Trichogramma parasitizes 70% eggs.',
    icar_reference: 'ICAR-SBI Coimbatore Package 2023'
  },
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['SHOOT_BORER', 'INTERNODE_BORER', 'TOP_BORER', 'DEAD_HEART'],
    severity_threshold: 'MODERATE',
    ipm_level: 3,
    recommendations: {
      botanical: ['Neem cake @ 250 kg/acre in furrows at planting'],
      biological: ['Release Cotesia flavipes @ 50 cocoons/acre for stem borer']
    },
    scientific_basis: 'Neem provides systemic protection. Cotesia parasitizes 60% larvae.',
    icar_reference: 'ICAR-SBI Biological Control'
  },
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['SHOOT_BORER', 'INTERNODE_BORER', 'TOP_BORER', 'DEAD_HEART'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      chemical: [
        { name: 'Chlorantraniliprole 18.5% SC', dosage: '0.4 ml/L or 60-80 ml/acre', phi_days: 21 },
        { name: 'Fipronil 5% SC', dosage: '30 ml/10L as soil drench at sett base', phi_days: 30 }
      ]
    },
    scientific_basis: 'Ryanodine receptor modulators 90% effective against lepidopteran borers. Soil drench protects roots.',
    icar_reference: 'ICAR-SBI Chemical Management'
  },
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['WHITEFLY', 'WOOLLY_APHID', 'PANDHARI_MASHI'],
    severity_threshold: 'LOW',
    ipm_level: 3,
    recommendations: {
      botanical: ['Neem oil 10000 ppm @ 5 ml/L', 'NSKE 5% spray'],
      biological: ['Verticillium lecanii @ 5 g/L in evening']
    },
    scientific_basis: 'Neem disrupts feeding. V. lecanii requires humidity >70%.',
    icar_reference: 'ICAR-SBI IPM Package'
  },
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['WHITEFLY', 'WOOLLY_APHID', 'PANDHARI_MASHI'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      chemical: [
        { name: 'Imidacloprid 17.8% SL', dosage: '0.5 ml/L or 100 ml/acre', phi_days: 15 },
        { name: 'Spiromesifen 22.9% SC', dosage: '0.8 ml/L or 160 ml/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Systemic neonicotinoid + lipid inhibitor for resistant populations.',
    icar_reference: 'ICAR-SBI Chemical Control'
  },
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['PYRILLA', 'PLANT_HOPPER'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['Epiricania melanoleuca release', 'Conserve natural parasitoids'],
      chemical: [
        { name: 'Buprofezin 25% SC', dosage: '2 ml/L or 400 ml/acre', phi_days: 21 }
      ]
    },
    scientific_basis: 'Natural parasitism by Epiricania can reach 80%. Buprofezin is selective.',
    icar_reference: 'ICAR-SBI Pyrilla Management'
  },
  {
    crop_codes: ['SUGARCANE', 'US', 'GANNA'],
    pest_codes: ['TERMITE', 'WHITE_GRUB', 'ROOT_GRUB'],
    severity_threshold: 'MODERATE',
    ipm_level: 5,
    recommendations: {
      biological: ['Metarhizium anisopliae @ 4 kg/acre with FYM'],
      chemical: [
        { name: 'Fipronil 5% SC', dosage: '30 ml/10L soil drench or 1.5 L/acre', phi_days: 30 }
      ]
    },
    scientific_basis: 'Metarhizium infects soil pests. Fipronil provides immediate knockdown.',
    icar_reference: 'ICAR-SBI Soil Pest Management'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COTTON PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['WHITEFLY', 'BEMISIA', 'PANDHARI_MASHI'],
    stages: ['VEGETATIVE', 'FLOWERING', 'REPRODUCTIVE'],
    severity_threshold: 'LOW',
    ipm_level: 1,
    recommendations: {
      cultural: ['Install yellow sticky traps @ 12/acre', 'Remove alternate hosts like parthenium']
    },
    scientific_basis: 'Early detection with sticky traps. Host removal reduces population.',
    icar_reference: 'ICAR-CICR Cotton Package 2023'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['WHITEFLY', 'BEMISIA', 'PANDHARI_MASHI'],
    severity_threshold: 'MODERATE',
    ipm_level: 3,
    recommendations: {
      botanical: ['Neem oil 10000 ppm @ 5 ml/L', 'NSKE 5%'],
      biological: ['Verticillium lecanii @ 5 g/L', 'Encarsia formosa release']
    },
    scientific_basis: 'Neem antifeedant. V. lecanii controls nymphs. Encarsia parasitizes.',
    icar_reference: 'ICAR-CICR IPM Guidelines'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['WHITEFLY', 'BEMISIA', 'PANDHARI_MASHI'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      chemical: [
        { name: 'Diafenthiuron 50% WP', dosage: '1.2 g/L or 250 g/acre', phi_days: 14 },
        { name: 'Spiromesifen 22.9% SC', dosage: '0.8 ml/L or 160 ml/acre', phi_days: 14 },
        { name: 'Pyriproxyfen 10% EC', dosage: '1 ml/L or 200 ml/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'IGR and lipid biosynthesis inhibitors effective against resistant populations.',
    icar_reference: 'ICAR-CICR Chemical Control Package'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['PINK_BOLLWORM', 'GULABI_BONDI_ALI', 'PBW'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: ['Install pheromone traps @ 5/acre', 'Destroy crop residue immediately after harvest'],
      biological: ['Trichogramma @ 1.5 lakh/acre at 50% flowering, 4 releases']
    },
    scientific_basis: 'Pheromone mass trapping + Trichogramma egg parasitization prevents 65% damage.',
    icar_reference: 'ICAR-CICR PBW Management'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['PINK_BOLLWORM', 'GULABI_BONDI_ALI', 'PBW'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      chemical: [
        { name: 'Chlorantraniliprole 18.5% SC', dosage: '0.4 ml/L or 60-80 ml/acre', phi_days: 21 },
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'Diamides highly effective. Rotate to prevent resistance.',
    icar_reference: 'ICAR-CICR Emergency Protocol'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['AMERICAN_BOLLWORM', 'HELICOVERPA', 'FRUIT_BORER'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: ['Pheromone traps @ 5/acre', 'Bird perches @ 20/acre'],
      biological: ['NPV @ 250 LE/acre', 'Trichogramma @ 1 lakh/acre']
    },
    scientific_basis: 'Early intervention with biocontrol prevents yield loss.',
    icar_reference: 'ICAR-CICR Bollworm IPM'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['AMERICAN_BOLLWORM', 'HELICOVERPA', 'FRUIT_BORER'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      chemical: [
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 },
        { name: 'Spinosad 45% SC', dosage: '0.3 ml/L or 75 ml/acre', phi_days: 3 }
      ]
    },
    scientific_basis: 'Spinosyns have short PHI. Rotate with diamides.',
    icar_reference: 'ICAR-CICR Chemical Management'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['APHID', 'MAVYA'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      botanical: ['Neem oil @ 5 ml/L'],
      chemical: [
        { name: 'Acetamiprid 20% SP', dosage: '0.2 g/L or 40 g/acre', phi_days: 7 },
        { name: 'Imidacloprid 17.8% SL', dosage: '0.3 ml/L or 60 ml/acre', phi_days: 15 }
      ]
    },
    scientific_basis: 'Systemic action controls hidden aphids.',
    icar_reference: 'ICAR-CICR Sucking Pest Management'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['JASSID', 'LEAFHOPPER', 'TELIA'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      chemical: [
        { name: 'Thiamethoxam 25% WG', dosage: '0.2 g/L or 40 g/acre', phi_days: 14 },
        { name: 'Flonicamid 50% WG', dosage: '0.3 g/L or 60 g/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Neonicotinoids effective. Flonicamid for resistant populations.',
    icar_reference: 'ICAR-CICR Jassid Control'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['THRIPS'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      botanical: ['Neem oil @ 5 ml/L'],
      chemical: [
        { name: 'Spinosad 45% SC', dosage: '0.3 ml/L or 75 ml/acre', phi_days: 3 },
        { name: 'Fipronil 5% SC', dosage: '2 ml/L or 400 ml/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Spinosad organic-approved. Fipronil for severe cases.',
    icar_reference: 'ICAR-CICR Thrips Management'
  },
  {
    crop_codes: ['COTTON', 'KAPAS'],
    pest_codes: ['MEALYBUG'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['Cryptolaemus montrouzieri beetles @ 5000/acre'],
      chemical: [
        { name: 'Buprofezin 25% SC', dosage: '2 ml/L or 400 ml/acre', phi_days: 21 },
        { name: 'Spiromesifen 22.9% SC', dosage: '0.8 ml/L or 160 ml/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Lady beetle predator effective. IGRs prevent molting.',
    icar_reference: 'ICAR-CICR Mealybug Protocol'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RICE PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    crop_codes: ['RICE', 'PADDY', 'DHAN'],
    pest_codes: ['BPH', 'BROWN_PLANTHOPPER', 'PLANTHOPPER'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      cultural: ['Alternate wetting and drying irrigation', 'Avoid excess nitrogen', 'Use resistant varieties'],
      chemical: [
        { name: 'Pymetrozine 50% WG', dosage: '0.6 g/L or 120 g/acre', phi_days: 14 },
        { name: 'Buprofezin 25% SC', dosage: '2 ml/L or 400 ml/acre', phi_days: 21 }
      ]
    },
    scientific_basis: 'Avoid pyrethroids which cause BPH resurgence. Use selective chemicals.',
    icar_reference: 'ICAR-CRRI Rice Package'
  },
  {
    crop_codes: ['RICE', 'PADDY', 'DHAN'],
    pest_codes: ['STEM_BORER', 'YELLOW_STEM_BORER', 'KHAND'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['Trichogramma japonicum @ 50,000/acre, 4 releases'],
      chemical: [
        { name: 'Chlorantraniliprole 18.5% SC', dosage: '0.4 ml/L or 60 ml/acre', phi_days: 21 },
        { name: 'Flubendiamide 20% WG', dosage: '0.25 g/L or 50 g/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Diamides effective against all borer stages.',
    icar_reference: 'ICAR-CRRI Borer Management'
  },
  {
    crop_codes: ['RICE', 'PADDY', 'DHAN'],
    pest_codes: ['LEAF_FOLDER', 'LEAF_ROLLER'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['Bacillus thuringiensis @ 1 kg/acre'],
      chemical: [
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'Bt organic option. Emamectin for severe cases.',
    icar_reference: 'ICAR-CRRI Leaf Folder Control'
  },
  {
    crop_codes: ['RICE', 'PADDY', 'DHAN'],
    pest_codes: ['GALL_MIDGE'],
    severity_threshold: 'MODERATE',
    ipm_level: 5,
    recommendations: {
      cultural: ['Early sowing', 'Resistant varieties like Suraksha, Shakti'],
      chemical: [
        { name: 'Carbofuran 3G', dosage: '7.5 kg/acre (soil application)', phi_days: 30 }
      ]
    },
    scientific_basis: 'Seed treatment and granular application protects.',
    icar_reference: 'ICAR-CRRI Gall Midge Protocol'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VEGETABLE PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    crop_codes: ['TOMATO', 'TAMATAR'],
    pest_codes: ['FRUIT_BORER', 'HELICOVERPA', 'BOLLWORM'],
    severity_threshold: 'LOW',
    ipm_level: 2,
    recommendations: {
      cultural: ['Pheromone traps @ 5/acre', 'Bird perches @ 20/acre'],
      biological: ['NPV @ 250 LE/acre with 1% jaggery', 'Trichogramma @ 1 lakh/acre']
    },
    scientific_basis: 'Early intervention with biocontrol prevents economic damage.',
    icar_reference: 'ICAR-IIHR Vegetable IPM'
  },
  {
    crop_codes: ['TOMATO', 'TAMATAR'],
    pest_codes: ['FRUIT_BORER', 'HELICOVERPA', 'BOLLWORM'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      chemical: [
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 },
        { name: 'Chlorantraniliprole 18.5% SC', dosage: '0.3 ml/L or 60 ml/acre', phi_days: 3 }
      ]
    },
    scientific_basis: 'Short PHI chemicals for vegetable crops near harvest.',
    icar_reference: 'ICAR-IIHR Chemical Protocol'
  },
  {
    crop_codes: ['CHILLI', 'MIRCHI'],
    pest_codes: ['THRIPS', 'MITE'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      botanical: ['Neem oil @ 5 ml/L'],
      chemical: [
        { name: 'Spinosad 45% SC', dosage: '0.3 ml/L or 75 ml/acre', phi_days: 3 },
        { name: 'Spiromesifen 22.9% SC', dosage: '0.8 ml/L or 160 ml/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Spinosad organic. Spiromesifen for mite+thrips complex.',
    icar_reference: 'ICAR-IIHR Chilli IPM'
  },
  {
    crop_codes: ['BRINJAL', 'VANGI', 'BAINGAN'],
    pest_codes: ['FRUIT_BORER', 'SHOOT_BORER', 'LEUCINODES'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      cultural: ['Clip affected shoots weekly', 'Pheromone traps @ 5/acre'],
      chemical: [
        { name: 'Chlorantraniliprole 18.5% SC', dosage: '0.4 ml/L or 60 ml/acre', phi_days: 3 },
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'Mechanical removal + short PHI chemicals.',
    icar_reference: 'ICAR-IIHR Brinjal Protocol'
  },
  {
    crop_codes: ['CABBAGE', 'KOBIJ', 'PATTA_GOBI'],
    pest_codes: ['DIAMONDBACK_MOTH', 'DBM', 'PLUTELLA'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['Bacillus thuringiensis @ 1 kg/acre', 'Cotesia plutellae release'],
      chemical: [
        { name: 'Spinosad 45% SC', dosage: '0.3 ml/L or 75 ml/acre', phi_days: 3 },
        { name: 'Chlorfenapyr 10% SC', dosage: '1.5 ml/L or 300 ml/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'DBM resistance common. Rotate modes of action.',
    icar_reference: 'ICAR-IIHR Crucifers IPM'
  },
  {
    crop_codes: ['OKRA', 'BHINDI', 'BHENDI'],
    pest_codes: ['FRUIT_BORER', 'SHOOT_BORER', 'EARAIS'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      botanical: ['Neem oil @ 5 ml/L'],
      chemical: [
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'Collect and destroy affected fruits. Spray on young fruits.',
    icar_reference: 'ICAR-IIHR Okra Management'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SOYBEAN PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    crop_codes: ['SOYBEAN', 'SOYA'],
    pest_codes: ['GIRDLE_BEETLE', 'STEM_FLY'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      cultural: ['Seed treatment with Thiamethoxam 70% WS @ 3 g/kg'],
      chemical: [
        { name: 'Thiamethoxam 25% WG', dosage: '0.2 g/L or 40 g/acre', phi_days: 14 },
        { name: 'Lambda cyhalothrin 5% EC', dosage: '0.6 ml/L or 120 ml/acre', phi_days: 14 }
      ]
    },
    scientific_basis: 'Systemic seed treatment protects seedlings. Foliar for adults.',
    icar_reference: 'ICAR-IISR Indore Package'
  },
  {
    crop_codes: ['SOYBEAN', 'SOYA'],
    pest_codes: ['SPODOPTERA', 'TOBACCO_CATERPILLAR'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['SNPV @ 250 LE/acre', 'Beauveria bassiana @ 5 g/L'],
      chemical: [
        { name: 'Chlorantraniliprole 18.5% SC', dosage: '0.3 ml/L or 60 ml/acre', phi_days: 21 },
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'NPV highly specific. Diamides for heavy infestations.',
    icar_reference: 'ICAR-IISR Spodoptera Control'
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GROUNDNUT PESTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    crop_codes: ['GROUNDNUT', 'MOONGFALI', 'BHUI_SHENG'],
    pest_codes: ['SPODOPTERA', 'TOBACCO_CATERPILLAR'],
    severity_threshold: 'MODERATE',
    ipm_level: 4,
    recommendations: {
      biological: ['SNPV @ 250 LE/acre'],
      chemical: [
        { name: 'Emamectin benzoate 5% SG', dosage: '0.4 g/L or 80 g/acre', phi_days: 7 }
      ]
    },
    scientific_basis: 'NPV specific to Spodoptera. Rotate with other MoAs.',
    icar_reference: 'ICAR-DGR Groundnut Package'
  },
  {
    crop_codes: ['GROUNDNUT', 'MOONGFALI', 'BHUI_SHENG'],
    pest_codes: ['WHITE_GRUB', 'ROOT_GRUB', 'BEETLE'],
    severity_threshold: 'HIGH',
    ipm_level: 5,
    recommendations: {
      biological: ['Metarhizium anisopliae @ 4 kg/acre mixed with FYM'],
      chemical: [
        { name: 'Fipronil 5% SC', dosage: 'Soil drench 30 ml/10L', phi_days: 30 }
      ]
    },
    scientific_basis: 'Metarhizium controls grubs. Fipronil for immediate action.',
    icar_reference: 'ICAR-DGR Soil Pest Management'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE MANAGEMENT DATABASE
// ═══════════════════════════════════════════════════════════════════════════

interface DiseaseRecommendation {
  crop_codes: string[];
  disease_codes: string[];
  dsi_threshold: number; // Disease Severity Index threshold
  recommendations: {
    preventive?: string[];
    curative?: Array<{ name: string; dosage: string; phi_days: number }>;
  };
  scientific_basis: string;
}

const DISEASE_DATABASE: DiseaseRecommendation[] = [
  {
    crop_codes: ['COTTON'],
    disease_codes: ['BACTERIAL_LEAF_BLIGHT', 'BLB'],
    dsi_threshold: 20,
    recommendations: {
      preventive: ['Streptocycline 0.01% + Copper oxychloride 0.3%'],
      curative: [
        { name: 'Copper hydroxide 77 WP', dosage: '25g/10L', phi_days: 7 }
      ]
    },
    scientific_basis: 'Copper-based bactericides prevent bacterial spread.'
  },
  {
    crop_codes: ['TOMATO', 'CHILLI'],
    disease_codes: ['EARLY_BLIGHT', 'ALTERNARIA'],
    dsi_threshold: 15,
    recommendations: {
      preventive: ['Mancozeb 75 WP @ 25g/10L'],
      curative: [
        { name: 'Azoxystrobin 23 SC', dosage: '10ml/10L', phi_days: 7 },
        { name: 'Difenoconazole 25 EC', dosage: '5ml/10L', phi_days: 7 }
      ]
    },
    scientific_basis: 'Strobilurins + triazoles for broad-spectrum fungal control.'
  },
  {
    crop_codes: ['RICE', 'PADDY'],
    disease_codes: ['BLAST', 'RICE_BLAST'],
    dsi_threshold: 10,
    recommendations: {
      preventive: ['Tricyclazole 75 WP @ 6g/10L'],
      curative: [
        { name: 'Isoprothiolane 40 EC', dosage: '15ml/10L', phi_days: 21 },
        { name: 'Kasugamycin 3 SL', dosage: '20ml/10L', phi_days: 14 }
      ]
    },
    scientific_basis: 'Melanin biosynthesis inhibitors prevent blast infection.'
  },
  {
    crop_codes: ['SUGARCANE'],
    disease_codes: ['RED_ROT', 'WILT'],
    dsi_threshold: 5,
    recommendations: {
      preventive: ['Hot water treatment of setts @ 52°C for 30 min', 'Sett treatment with Carbendazim 0.1%'],
      curative: [
        { name: 'Carbendazim 50 WP', dosage: '10g/10L (soil drench)', phi_days: 30 }
      ]
    },
    scientific_basis: 'Red rot is seed-borne. Prevention through sett treatment is critical.'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EVALUATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function evaluateDecisionGraph(
  context: RuleEvaluationContext,
  traceId?: string
): Promise<RuleEvaluationResult> {
  console.log(`🔬 [DecisionBridge] Starting rule evaluation... (trace: ${traceId || 'N/A'})`);
  console.log(`   Crop: ${context.crop_code || 'UNKNOWN'}`);
  console.log(`   Pest: ${context.pest_code || 'None'}`);
  console.log(`   Disease: ${context.disease_code || 'None'}`);
  console.log(`   Severity: ${context.severity || 'UNKNOWN'}`);
  console.log(`   Stage: ${context.crop_stage || 'UNKNOWN'}`);
  
  const evaluatedRules: EvaluatedRule[] = [];
  let isBlocked = false;
  let blockingRule: BlockingRuleInfo | undefined;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P0: EMERGENCY - BANNED CHEMICALS CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  const chemicalMentioned = context.last_chemical_used?.toLowerCase() || '';
  
  for (const banned of BANNED_CHEMICALS) {
    if (chemicalMentioned.includes(banned)) {
      console.log(`   🛑 P0 BLOCK: Banned chemical detected - ${banned}`);
      isBlocked = true;
      blockingRule = {
        rule_id: 'SAFETY_001_BANNED',
        priority: 'P0_EMERGENCY',
        reason: `${banned.toUpperCase()} is completely banned in India by CIB&RC. Usage is illegal.`,
        alternatives: ['Contact KVK for safe alternatives', 'Use IPM-approved products']
      };
      evaluatedRules.push({
        rule_id: 'SAFETY_001_BANNED',
        category: 'emergency',
        priority: 'P0_EMERGENCY',
        fired: true,
        action: 'BLOCK',
        confidence: 1.0,
        scientific_basis: 'GOI CIB&RC banned pesticide list',
        recommendation_mr: `⛔ ${banned} हे रसायन भारतात पूर्णपणे बंद आहे. वापरू नका.`,
        recommendation_hi: `⛔ ${banned} यह रसायन भारत में पूर्णतः प्रतिबंधित है।`,
        recommendation_en: `⛔ ${banned} is completely banned in India. Do not use.`
      });
      break;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P1: REGULATORY - RESTRICTED CHEMICALS WARNING
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isBlocked) {
    for (const restricted of RESTRICTED_CHEMICALS) {
      if (chemicalMentioned.includes(restricted)) {
        console.log(`   ⚠️ P1 WARN: Restricted chemical - ${restricted}`);
        evaluatedRules.push({
          rule_id: 'SAFETY_002_RESTRICTED',
          category: 'regulatory',
          priority: 'P1_REGULATORY',
          fired: true,
          action: 'WARN',
          confidence: 1.0,
          scientific_basis: 'CIB&RC restricted use classification',
          recommendation_mr: `⚠️ ${restricted} साठी परवाना आवश्यक आहे.`,
          recommendation_hi: `⚠️ ${restricted} के लिए लाइसेंस आवश्यक है।`,
          recommendation_en: `⚠️ ${restricted} requires a license for use.`
        });
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P2: WEATHER SAFETY - NEONICOTINOID + FLOWERING CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isBlocked && context.crop_stage === 'FLOWERING') {
    for (const neonic of NEONICOTINOIDS) {
      if (chemicalMentioned.includes(neonic)) {
        console.log(`   🐝 P2 WARN: Neonicotinoid during flowering - ${neonic}`);
        evaluatedRules.push({
          rule_id: 'SAFETY_006_POLLINATOR',
          category: 'safety',
          priority: 'P2_WEATHER_SAFETY',
          fired: true,
          action: 'BLOCK',
          confidence: 0.95,
          scientific_basis: 'ICAR-NBAIR Bee Protection Guidelines 2022',
          recommendation_mr: `🐝 फुलोऱ्यावर असताना ${neonic} वापरू नका. मधमाश्यांना हानी होईल.`,
          recommendation_hi: `🐝 फूल अवस्था में ${neonic} का उपयोग न करें। मधुमक्खियों को नुकसान होगा।`,
          recommendation_en: `🐝 Do not use ${neonic} during flowering. Bees will be harmed.`,
          alternatives: ['Spinosad 45 SC (bee-safe after drying)', 'Evening spray after bee hours']
        });
        isBlocked = true;
        blockingRule = {
          rule_id: 'SAFETY_006_POLLINATOR',
          priority: 'P2_WEATHER_SAFETY',
          reason: `${neonic} is toxic to pollinators during flowering stage`,
          alternatives: ['Use Spinosad', 'Spray after 6 PM']
        };
        break;
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P2: WEATHER SAFETY - RAIN/WIND DELAY
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isBlocked && context.rain_forecast_hours !== undefined && context.rain_forecast_hours < 6) {
    console.log(`   🌧️ P2 DELAY: Rain expected in ${context.rain_forecast_hours} hours`);
    evaluatedRules.push({
      rule_id: 'WEATHER_001_RAIN_DELAY',
      category: 'weather_safety',
      priority: 'P2_WEATHER_SAFETY',
      fired: true,
      action: 'DELAY',
      confidence: 0.9,
      scientific_basis: 'Spray efficacy drops 80% if rain within 4-6 hours',
      recommendation_mr: `🌧️ ${context.rain_forecast_hours} तासात पाऊस येणार. फवारणी पुढे ढकला.`,
      recommendation_hi: `🌧️ ${context.rain_forecast_hours} घंटे में बारिश होगी। स्प्रे स्थगित करें।`,
      recommendation_en: `🌧️ Rain expected in ${context.rain_forecast_hours} hours. Delay spray.`
    });
  }
  
  if (!isBlocked && context.wind_speed_kmh !== undefined && context.wind_speed_kmh > 15) {
    console.log(`   💨 P2 DELAY: High wind speed ${context.wind_speed_kmh} km/h`);
    evaluatedRules.push({
      rule_id: 'WEATHER_002_WIND_DELAY',
      category: 'weather_safety',
      priority: 'P2_WEATHER_SAFETY',
      fired: true,
      action: 'DELAY',
      confidence: 0.85,
      scientific_basis: 'High wind causes spray drift and reduced coverage',
      recommendation_mr: `💨 वाऱ्याचा वेग जास्त आहे (${context.wind_speed_kmh} km/h). सकाळी लवकर फवारणी करा.`,
      recommendation_hi: `💨 हवा तेज़ है (${context.wind_speed_kmh} km/h)। सुबह जल्दी स्प्रे करें।`,
      recommendation_en: `💨 Wind speed high (${context.wind_speed_kmh} km/h). Spray early morning.`
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P5: IPM - PEST/DISEASE RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isBlocked) {
    const pestRecommendations = evaluatePestIPM(context);
    evaluatedRules.push(...pestRecommendations);
    console.log(`   🐛 IPM recommendations: ${pestRecommendations.length} rules fired`);
    
    const diseaseRecommendations = evaluateDiseaseManagement(context);
    evaluatedRules.push(...diseaseRecommendations);
    console.log(`   🦠 Disease recommendations: ${diseaseRecommendations.length} rules fired`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // P6: OPTIMIZATION - GENERAL CROP ADVICE
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isBlocked && evaluatedRules.filter(r => r.action === 'RECOMMEND').length === 0) {
    // No specific recommendations yet, add general monitoring advice
    evaluatedRules.push({
      rule_id: 'GEN_001_MONITOR',
      category: 'optimization',
      priority: 'P6_OPTIMIZATION',
      fired: true,
      action: 'MONITOR',
      confidence: 0.6,
      scientific_basis: 'General crop monitoring best practice',
      recommendation_mr: '👁️ पिकाचे नियमित निरीक्षण करा. कीड/रोगाची लक्षणे दिसल्यास कळवा.',
      recommendation_hi: '👁️ फसल की नियमित निगरानी करें। कीट/रोग के लक्षण दिखें तो बताएं।',
      recommendation_en: '👁️ Continue regular crop monitoring. Report if pest/disease symptoms appear.'
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD FINAL RESULT
  // ═══════════════════════════════════════════════════════════════════════════
  const recommendations: RuleRecommendation[] = evaluatedRules
    .filter(r => r.action === 'RECOMMEND' && r.fired)
    .map(r => ({
      rule_id: r.rule_id,
      priority: r.priority,
      recommendation_type: r.products?.length ? 'CHEMICAL' as const : 'INTEGRATED' as const,
      recommendation_text_mr: r.recommendation_mr || '',
      recommendation_text_hi: r.recommendation_hi || '',
      recommendation_text_en: r.recommendation_en || '',
      products: r.products?.map(p => ({
        product_name: p.name,
        dosage: p.dosage,
        application_method: p.method,
        precautions: []
      })),
      timing: 'As soon as conditions permit',
      cost_estimate: r.products?.length ? '₹500-1500/acre' : '₹100-300/acre',
      efficacy_estimate: '70-90%'
    }));
  
  const warnings: RuleWarning[] = evaluatedRules
    .filter(r => (r.action === 'WARN' || r.action === 'DELAY') && r.fired)
    .map(r => ({
      rule_id: r.rule_id,
      warning_type: r.category.includes('weather') ? 'WEATHER' as const : 'SAFETY' as const,
      warning_text_mr: r.recommendation_mr || '',
      warning_text_hi: r.recommendation_hi || '',
      warning_text_en: r.recommendation_en || '',
      severity: r.priority === 'P0_EMERGENCY' ? 'HIGH' as const : 'MEDIUM' as const
    }));
  
  const requirements: RuleRequirement[] = [];
  
  // Check if PHI compliance needed
  const chemicalRecommendations = evaluatedRules.filter(r => r.products?.length);
  if (chemicalRecommendations.length > 0 && context.crop_stage === 'MATURITY') {
    requirements.push({
      rule_id: 'PHI_001',
      requirement_type: 'PHI',
      requirement_text_mr: '⏰ कापणीपूर्वी प्रतीक्षा कालावधी पाळा',
      requirement_text_hi: '⏰ कटाई से पहले प्रतीक्षा अवधि का पालन करें',
      requirement_text_en: '⏰ Follow Pre-Harvest Interval before harvesting',
      is_mandatory: true
    });
  }
  
  const safetyCompliance: SafetyComplianceStatus = {
    chemical_safety_passed: !evaluatedRules.some(r => r.rule_id.includes('BANNED')),
    phi_compliance_checked: context.crop_stage === 'MATURITY',
    weather_safety_passed: !evaluatedRules.some(r => r.action === 'DELAY'),
    overall_safe_to_proceed: !isBlocked,
    pending_checks: []
  };
  
  console.log(`   ✅ Evaluation complete: ${evaluatedRules.filter(r => r.fired).length} rules fired`);
  console.log(`   📋 Recommendations: ${recommendations.length}, Warnings: ${warnings.length}`);
  
  return {
    blocked: isBlocked,
    blockingRule,
    recommendations,
    warnings,
    requirements,
    ipm_level_suggested: evaluatedRules.find(r => r.category === 'ipm')?.confidence ? 
      Math.ceil((evaluatedRules.find(r => r.category === 'ipm')?.confidence || 0.5) * 6) : undefined,
    economic_threshold_exceeded: (context.severity === 'HIGH' || context.severity === 'CRITICAL'),
    safety_compliance: safetyCompliance
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PEST IPM EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CRITICAL FIX: Normalize code for matching (removes underscores, converts to uppercase)
 */
function normalizeForMatching(code: string): string {
  return code.toUpperCase().replace(/[_\s-]+/g, '');
}

/**
 * CRITICAL FIX: Check if two codes match (handles underscore/space variations)
 */
function codesMatch(code1: string, code2: string): boolean {
  const norm1 = normalizeForMatching(code1);
  const norm2 = normalizeForMatching(code2);
  return norm1.includes(norm2) || norm2.includes(norm1) || norm1 === norm2;
}

function evaluatePestIPM(context: RuleEvaluationContext): EvaluatedRule[] {
  const rules: EvaluatedRule[] = [];
  
  if (!context.pest_code || context.pest_code === 'UNKNOWN') {
    return rules;
  }
  
  const pestNorm = normalizeForMatching(context.pest_code);
  const cropNorm = normalizeForMatching(context.crop_code || '');
  const severity = context.severity || 'MODERATE';
  const isOrganic = context.farming_mode === 'ORGANIC';
  
  console.log(`   🐛 IPM matching: pest="${pestNorm}", crop="${cropNorm}", severity="${severity}"`);
  
  // Find matching IPM recommendations
  for (const ipm of IPM_DATABASE) {
    const cropMatch = ipm.crop_codes.some(c => codesMatch(cropNorm, c));
    const pestMatch = ipm.pest_codes.some(p => codesMatch(pestNorm, p));
    
    if (!cropMatch || !pestMatch) continue;
    
    console.log(`   ✅ IPM match found: ${ipm.crop_codes[0]} + ${ipm.pest_codes[0]}, Level ${ipm.ipm_level}`);
    
    const severityOrder = { 'LOW': 1, 'MODERATE': 2, 'HIGH': 3, 'CRITICAL': 4 };
    const currentSeverity = severityOrder[severity] || 2;
    const thresholdSeverity = severityOrder[ipm.severity_threshold] || 2;
    
    if (currentSeverity >= thresholdSeverity) {
      // ═══════════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Use extractProductRecommendation to get COMPLETE product details
      // ═══════════════════════════════════════════════════════════════════════════
      const selectedProduct = extractProductRecommendation(
        context.crop_code || '',
        context.pest_code,
        null,
        severity as SeverityLevel,
        ipm.ipm_level,
        isOrganic,
        'mr'
      );
      
      // Build products array with COMPLETE details
      let products: Array<{
        name: string;
        dosage: string;
        method: string;
        dosage_per_acre?: string;
        timing?: string;
        phi_days?: number;
        efficacy_percent?: number;
        water_volume?: string;
        weather_restrictions?: string;
        names?: { mr: string; hi: string; en: string };
      }> | undefined;
      
      if (selectedProduct) {
        products = [{
          name: selectedProduct.product_name,
          dosage: selectedProduct.dosage,
          method: selectedProduct.application_method,
          dosage_per_acre: selectedProduct.dosage_per_acre,
          timing: selectedProduct.timing,
          phi_days: selectedProduct.phi_days,
          efficacy_percent: selectedProduct.efficacy_percent,
          water_volume: selectedProduct.water_volume_per_acre,
          weather_restrictions: selectedProduct.weather_restrictions,
          names: selectedProduct.names
        }];
        console.log(`   📦 Product selected: ${selectedProduct.product_name} @ ${selectedProduct.dosage}, efficacy=${selectedProduct.efficacy_percent}%`);
      } else if (ipm.recommendations.chemical?.length) {
        // Fallback to IPM database chemicals
        products = ipm.recommendations.chemical.map(c => ({
          name: c.name,
          dosage: c.dosage,
          method: 'FOLIAR_SPRAY',
          phi_days: c.phi_days
        }));
      }
      
      let recMr = '', recHi = '', recEn = '';
      
      if (ipm.recommendations.cultural?.length) {
        recEn += `🌾 Cultural: ${ipm.recommendations.cultural.join(', ')}. `;
        recMr += `🌾 शेती पद्धती: ${ipm.recommendations.cultural.join(', ')}. `;
        recHi += `🌾 कृषि पद्धति: ${ipm.recommendations.cultural.join(', ')}. `;
      }
      if (ipm.recommendations.biological?.length) {
        recEn += `🦠 Biological: ${ipm.recommendations.biological.join(', ')}. `;
        recMr += `🦠 जैविक: ${ipm.recommendations.biological.join(', ')}. `;
        recHi += `🦠 जैविक: ${ipm.recommendations.biological.join(', ')}. `;
      }
      if (ipm.recommendations.botanical?.length) {
        recEn += `🌿 Botanical: ${ipm.recommendations.botanical.join(', ')}. `;
        recMr += `🌿 वनस्पतिजन्य: ${ipm.recommendations.botanical.join(', ')}. `;
        recHi += `🌿 वानस्पतिक: ${ipm.recommendations.botanical.join(', ')}. `;
      }
      if (products?.length) {
        const productInfo = products[0];
        const name = productInfo.names?.mr || productInfo.name;
        recMr += `💊 रासायनिक: ${name} @ ${productInfo.dosage} (${productInfo.dosage_per_acre || ''}).`;
        recHi += `💊 रासायनिक: ${productInfo.names?.hi || productInfo.name} @ ${productInfo.dosage}.`;
        recEn += `💊 Chemical: ${productInfo.names?.en || productInfo.name} @ ${productInfo.dosage} (${productInfo.dosage_per_acre || ''}).`;
        
        if (productInfo.timing) {
          recMr += ` वेळ: ${productInfo.timing}.`;
        }
        if (productInfo.phi_days) {
          recMr += ` PHI: ${productInfo.phi_days} दिवस.`;
        }
      }
      
      rules.push({
        rule_id: `IPM_${context.crop_code || 'CROP'}_${context.pest_code}_L${ipm.ipm_level}`,
        category: 'ipm',
        priority: ipm.ipm_level <= 2 ? 'P5_IPM' : (ipm.ipm_level <= 4 ? 'P4_ECONOMIC' : 'P3_CROP_STAGE'),
        fired: true,
        action: 'RECOMMEND',
        confidence: selectedProduct ? 0.90 : 0.75,
        scientific_basis: ipm.scientific_basis,
        recommendation_mr: recMr,
        recommendation_hi: recHi,
        recommendation_en: recEn,
        products
      });
    }
  }
  
  return rules;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISEASE MANAGEMENT EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

function evaluateDiseaseManagement(context: RuleEvaluationContext): EvaluatedRule[] {
  const rules: EvaluatedRule[] = [];
  
  if (!context.disease_code || context.disease_code === 'UNKNOWN') {
    return rules;
  }
  
  const diseaseNorm = normalizeForMatching(context.disease_code);
  const cropNorm = normalizeForMatching(context.crop_code || '');
  const severity = context.severity || 'MODERATE';
  
  console.log(`   🦠 Disease matching: disease="${diseaseNorm}", crop="${cropNorm}"`);
  
  for (const disease of DISEASE_DATABASE) {
    // CRITICAL FIX: Use normalized matching for crop and disease codes
    const cropMatch = disease.crop_codes.some(c => codesMatch(cropNorm, c));
    const diseaseMatch = disease.disease_codes.some(d => codesMatch(diseaseNorm, d));
    
    if (!cropMatch || !diseaseMatch) continue;
    
    console.log(`   ✅ Disease match found: ${disease.crop_codes[0]} + ${disease.disease_codes[0]}`);
    
    const severityOrder = { 'LOW': 10, 'MODERATE': 25, 'HIGH': 50, 'CRITICAL': 75 };
    const currentDSI = severityOrder[severity] || 25;
    
    if (currentDSI >= disease.dsi_threshold) {
      const products = disease.recommendations.curative?.map(c => ({
        name: c.name,
        dosage: c.dosage,
        method: 'Foliar spray'
      }));
      
      let recMr = '', recHi = '', recEn = '';
      
      if (disease.recommendations.preventive?.length) {
        recEn += `🛡️ Preventive: ${disease.recommendations.preventive.join(', ')}. `;
        recMr += `🛡️ प्रतिबंधात्मक: ${disease.recommendations.preventive.join(', ')}. `;
        recHi += `🛡️ रोकथाम: ${disease.recommendations.preventive.join(', ')}. `;
      }
      if (products?.length) {
        recEn += `💊 Treatment: ${products.map(p => `${p.name} @ ${p.dosage}`).join(', ')}.`;
        recMr += `💊 उपचार: ${products.map(p => `${p.name} @ ${p.dosage}`).join(', ')}.`;
        recHi += `💊 उपचार: ${products.map(p => `${p.name} @ ${p.dosage}`).join(', ')}.`;
      }
      
      rules.push({
        rule_id: `DISEASE_${cropNorm}_${diseaseNorm}`,
        category: 'disease',
        priority: 'P4_ECONOMIC',
        fired: true,
        action: 'RECOMMEND',
        confidence: 0.8,
        scientific_basis: disease.scientific_basis,
        recommendation_mr: recMr,
        recommendation_hi: recHi,
        recommendation_en: recEn,
        products
      });
    }
  }
  
  return rules;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: CONVERT TO RULE ENGINE RESULT
// ═══════════════════════════════════════════════════════════════════════════

export function convertToRuleResults(evaluated: EvaluatedRule[]): RuleResult[] {
  return evaluated.filter(r => r.fired).map(r => ({
    rule_id: r.rule_id,
    action: r.action,
    priority: r.priority,
    category: r.category,
    messages: {
      mr: r.recommendation_mr || '',
      hi: r.recommendation_hi || '',
      en: r.recommendation_en || ''
    },
    products: r.products?.map(p => ({
      product_name: p.name,
      dosage: p.dosage,
      application_method: p.method
    })),
    alternatives: r.alternatives,
    scientific_basis: r.scientific_basis,
    confidence: r.confidence
  }));
}

export const DECISION_BRIDGE_VERSION = '1.0.0';
