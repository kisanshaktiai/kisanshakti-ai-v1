/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSIS-FIRST RESPONSE GENERATOR (v1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * When crop damage is detected with full land context, immediately generate
 * ranked diagnosis options from candidate hypotheses (decision_rules) instead
 * of asking generic clarification questions.
 * 
 * SENIOR AGRONOMIST PRINCIPLE:
 * "When a farmer reports dying crops, we present possible causes immediately.
 * We do NOT ask 'what problem do you see?' - that's not agronomist practice."
 * 
 * ARCHITECTURE:
 * 1. Takes candidate hypotheses from hypothesis-evaluator.ts
 * 2. Generates ranked diagnosis options (top 3-5 causes)
 * 3. Includes differentiating observations from observable_characteristics
 * 4. ALWAYS appends photo option as final fallback
 * 5. Returns response ready for UI rendering
 * 
 * HARD INVARIANTS:
 * - When land context exists, options MUST come from decision_rules
 * - Generic symptom lists are NEVER returned
 * - Photo option is ALWAYS available
 * - Diagnoses ranked by: priority → confidence → severity
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { CandidateHypothesis, HypothesisEvaluationOutput } from './hypothesis-evaluator.ts';
// STATIC IMPORT: Required for Edge Functions (no dynamic imports allowed)
import { translateToRegionalTerms, type FarmerLocation, type RegionalTranslation } from '../services/regional-translator.ts';

export const DIAGNOSIS_FIRST_VERSION = '1.1.0';  // Updated for regional translation

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface DiagnosisOption {
  id: string;
  cause: string;
  cause_label: string;  // Farmer-friendly name in requested language
  canonical_group: string;
  observation_key: string;  // Key differentiating symptom to look for
  observation_label: string;  // What farmer should check
  confidence: number;
  priority: number;
  icon: string;  // Emoji for visual aid
  rule_id: string;
}

export interface PhotoOption {
  id: 'PHOTO_UPLOAD';
  label: string;
  icon: '📷';
  description: string;
}

export interface DiagnosisFirstOutput {
  mode: 'DIAGNOSIS_FIRST';
  source: 'DECISION_RULES';
  question_text: string;
  
  // Ranked diagnosis options (top 3-5)
  diagnoses: DiagnosisOption[];
  
  // Photo option (always last)
  photo_option: PhotoOption;
  
  // Metadata
  crop_code: string;
  growth_stage: string;
  total_hypotheses_considered: number;
  timestamp: number;
  trace_id: string;
}

export interface DiagnosisFirstInput {
  hypotheses: CandidateHypothesis[];
  crop_code: string;
  growth_stage: string;
  current_observations: string[];
  language: 'mr' | 'hi' | 'en';
  damage_observations?: string[];
  trace_id?: string;
  /** NEW v1.1.0: Farmer location for regional translation */
  farmer_location?: FarmerLocation;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL GROUP ICONS
// ═══════════════════════════════════════════════════════════════════════════

const GROUP_ICONS: Record<string, string> = {
  'pest': '🐛',
  'borer': '🐛',
  'insect': '🐜',
  'mite': '🕷️',
  'disease': '🦠',
  'fungal': '🍄',
  'bacterial': '🦠',
  'viral': '🧬',
  'stress': '🌡️',
  'irrigation': '💧',
  'nutrition': '🍃',
  'deficiency': '🌿',
  'germination': '🌱',
  'establishment': '🌱',
  'soil_borne': '🪱',
  'termite': '🐜',
  'unknown': '🔍'
};

function getGroupIcon(canonicalGroup: string): string {
  const groupLower = canonicalGroup.toLowerCase();
  return GROUP_ICONS[groupLower] || '🔍';
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSE NAME TRANSLATIONS
// CRITICAL: Farmer-friendly names in their language - NOT scientific terms
// ═══════════════════════════════════════════════════════════════════════════

const CAUSE_TRANSLATIONS: Record<string, { mr: string; hi: string; en: string }> = {
  // Borers - ऊस पोखरणारे किडे
  'shoot_borer': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Shoot Borer' },
  'stem_borer': { mr: 'खोड किडा', hi: 'तना छेदक', en: 'Stem Borer' },
  'internode_borer': { mr: 'कांडी किडा', hi: 'गांठ छेदक', en: 'Internode Borer' },
  'early_shoot_borer': { mr: 'सुरुवातीचा खोड किडा', hi: 'प्रारंभिक तना छेदक', en: 'Early Shoot Borer' },
  'top_borer': { mr: 'शेंडा किडा', hi: 'शीर्ष छेदक', en: 'Top Borer' },
  'root_borer': { mr: 'मूळ किडा', hi: 'जड़ छेदक', en: 'Root Borer' },
  
  // Termites and soil pests
  'termite': { mr: 'वाळवी', hi: 'दीमक', en: 'Termite' },
  'termite_attack': { mr: 'वाळवीचा हल्ला', hi: 'दीमक का हमला', en: 'Termite Attack' },
  'white_grub': { mr: 'पांढरी अळी', hi: 'सफेद ग्रब', en: 'White Grub' },
  'root_grub': { mr: 'मूळ अळी', hi: 'जड़ ग्रब', en: 'Root Grub' },
  
  // Sucking pests
  'whitefly': { mr: 'पांढरी माशी', hi: 'सफेद मक्खी', en: 'Whitefly' },
  'aphid': { mr: 'मावा', hi: 'माहू', en: 'Aphid' },
  'thrips': { mr: 'तुडतुडे', hi: 'थ्रिप्स', en: 'Thrips' },
  'jassid': { mr: 'तुडतुडे', hi: 'जैसिड', en: 'Jassid' },
  'mealybug': { mr: 'लुसलुशी किडा', hi: 'मीलीबग', en: 'Mealybug' },
  
  // Bollworms
  'bollworm': { mr: 'बोंडअळी', hi: 'बोलवर्म', en: 'Bollworm' },
  'pink_bollworm': { mr: 'गुलाबी बोंडअळी', hi: 'गुलाबी बोलवर्म', en: 'Pink Bollworm' },
  'american_bollworm': { mr: 'अमेरिकन बोंडअळी', hi: 'अमेरिकन बोलवर्म', en: 'American Bollworm' },
  
  // Diseases - रोग
  'root_rot': { mr: 'मूळ कुज', hi: 'जड़ सड़न', en: 'Root Rot' },
  'wilt': { mr: 'मर रोग', hi: 'म्लानि', en: 'Wilt' },
  'red_rot': { mr: 'लाल कुज', hi: 'लाल सड़न', en: 'Red Rot' },
  'smut': { mr: 'काणी रोग', hi: 'कंडुआ', en: 'Smut' },
  'smut_seed_borne': { mr: 'काणी रोग', hi: 'कंडुआ', en: 'Smut' },
  'leaf_spot': { mr: 'पानावर डाग', hi: 'पत्ती धब्बा', en: 'Leaf Spot' },
  'rust': { mr: 'तांबेरा', hi: 'गेरुआ', en: 'Rust' },
  'blight': { mr: 'करपा', hi: 'झुलसा', en: 'Blight' },
  'collar_rot': { mr: 'मुळांची कुज', hi: 'कॉलर रॉट', en: 'Collar Rot' },
  'powdery_mildew': { mr: 'भुरी रोग', hi: 'पाउडर फफूंद', en: 'Powdery Mildew' },
  'downy_mildew': { mr: 'केवडा', hi: 'डाउनी मिल्ड्यू', en: 'Downy Mildew' },
  
  // IPM treatments - These are causes that need translation
  'ipm_prevention': { mr: 'जैविक उपचार', hi: 'जैविक उपचार', en: 'IPM Prevention' },
  'hot_water_treatment': { mr: 'गरम पाण्याने उपचार', hi: 'गर्म पानी उपचार', en: 'Hot Water Treatment' },
  
  // Stress/Deficiency - ताण / कमतरता
  'water_stress': { mr: 'पाणी ताण', hi: 'पानी तनाव', en: 'Water Stress' },
  'waterlogging': { mr: 'पाणी साचणे', hi: 'जलभराव', en: 'Waterlogging' },
  'nitrogen_deficiency': { mr: 'नत्र कमतरता', hi: 'नाइट्रोजन की कमी', en: 'Nitrogen Deficiency' },
  'phosphorus_deficiency': { mr: 'स्फुरद कमतरता', hi: 'फास्फोरस की कमी', en: 'Phosphorus Deficiency' },
  'potassium_deficiency': { mr: 'पालाश कमतरता', hi: 'पोटाश की कमी', en: 'Potassium Deficiency' },
  'iron_deficiency': { mr: 'लोह कमतरता', hi: 'लोहे की कमी', en: 'Iron Deficiency' },
  
  // Germination issues
  'poor_germination': { mr: 'कमी उगवण', hi: 'खराब अंकुरण', en: 'Poor Germination' },
  'establishment_failure': { mr: 'रोप बसले नाही', hi: 'पौधा स्थापित नहीं', en: 'Establishment Failure' },
  
  // PHASE-21 FIX: Added missing disease translations for SEEDLING stage
  'sett_rot': { mr: 'बेणे कूज', hi: 'बीज सड़न', en: 'Sett Rot' },
  'pineapple_disease': { mr: 'बेणे कूज (अननस रोग)', hi: 'बीज सड़न (पाइनएपल रोग)', en: 'Pineapple Disease' },
  'sett_rot_pineapple': { mr: 'बेणे कूज', hi: 'बीज सड़न', en: 'Sett Rot/Pineapple Disease' },
  
  // Smut disease (for SEEDLING stage)
  'smut_seed_borne_infection': { mr: 'काणी / स्मट', hi: 'कंडुआ / स्मट', en: 'Smut (Seed-borne)' }
};

/**
 * Get farmer-friendly cause label in their language.
 * Uses pattern matching to extract core pest/disease name from complex database strings.
 */
function getCauseLabel(cause: string, language: 'mr' | 'hi' | 'en'): string {
  // First, try exact match with normalization
  let normalized = cause.toLowerCase().replace(/[\s-]+/g, '_');
  
  if (CAUSE_TRANSLATIONS[normalized]) {
    return CAUSE_TRANSLATIONS[normalized][language];
  }
  
  // Remove parenthetical scientific names and extra descriptions
  let simplified = cause
    .replace(/\([^)]*\)/g, '')  // Remove (scientific names)
    .replace(/infestation/gi, '')
    .replace(/attack/gi, '')
    .replace(/most destructive/gi, '')
    .replace(/using.*$/gi, '')  // Remove "using hot water treatment" etc.
    .replace(/ipm prevention for/gi, '')
    .trim();
  
  normalized = simplified.toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  
  if (CAUSE_TRANSLATIONS[normalized]) {
    return CAUSE_TRANSLATIONS[normalized][language];
  }
  
  // Try pattern matching for known pests/diseases
  const patterns: [RegExp, string][] = [
    [/early.?shoot.?borer/i, 'early_shoot_borer'],
    [/shoot.?borer/i, 'shoot_borer'],
    [/stem.?borer/i, 'stem_borer'],
    [/internode.?borer/i, 'internode_borer'],
    [/top.?borer/i, 'top_borer'],
    [/root.?borer/i, 'root_borer'],
    [/termite/i, 'termite'],
    [/red.?rot/i, 'red_rot'],
    [/smut/i, 'smut'],
    [/wilt/i, 'wilt'],
    [/root.?rot/i, 'root_rot'],
    [/whitefly/i, 'whitefly'],
    [/aphid/i, 'aphid'],
    [/mealybug/i, 'mealybug'],
    [/thrips/i, 'thrips'],
    [/bollworm/i, 'bollworm'],
    [/pink.?bollworm/i, 'pink_bollworm'],
    [/american.?bollworm/i, 'american_bollworm'],
    [/white.?grub/i, 'white_grub'],
    [/root.?grub/i, 'root_grub'],
    [/leaf.?spot/i, 'leaf_spot'],
    [/rust/i, 'rust'],
    [/blight/i, 'blight'],
    [/powdery.?mildew/i, 'powdery_mildew'],
    [/downy.?mildew/i, 'downy_mildew'],
    [/nitrogen/i, 'nitrogen_deficiency'],
    [/phosphorus/i, 'phosphorus_deficiency'],
    [/potassium/i, 'potassium_deficiency'],
    [/water.?stress/i, 'water_stress'],
    [/waterlog/i, 'waterlogging'],
    [/poor.?germination/i, 'poor_germination'],
    // PHASE-21 FIX: Added missing disease patterns for SEEDLING stage
    [/sett.?rot.*pineapple|pineapple.*sett.?rot/i, 'sett_rot_pineapple'],
    [/sett.?rot/i, 'sett_rot'],
    [/pineapple.?disease/i, 'pineapple_disease'],
    [/seed.?borne.*smut|smut.*seed.?borne/i, 'smut_seed_borne_infection']
  ];
  
  for (const [pattern, key] of patterns) {
    if (pattern.test(cause)) {
      const translation = CAUSE_TRANSLATIONS[key];
      if (translation) {
        console.log(`   [getCauseLabel] Pattern matched: "${cause}" → "${translation[language]}"`);
        return translation[language];
      }
    }
  }
  
  // Ultimate fallback: clean up and title case the cause
  const fallback = simplified
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
  
  console.log(`   ⚠️ [getCauseLabel] No translation found for: "${cause}", using: "${fallback}"`);
  return fallback || cause;
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION KEY TO FARMER-FRIENDLY LABEL
// CRITICAL: These labels must be simple farmer-understandable phrases
// ═══════════════════════════════════════════════════════════════════════════

const OBSERVATION_LABELS: Record<string, { mr: string; hi: string; en: string }> = {
  // Dead heart symptoms
  'DEAD_HEART': { mr: 'मधली पाने वाळली', hi: 'बीच के पत्ते सूखे', en: 'Central leaves dried' },
  'DEAD_HEART_VISIBLE': { mr: 'मधली पाने वाळली', hi: 'बीच के पत्ते सूखे', en: 'Dead heart visible' },
  'DEAD_HEART_PRESENT': { mr: 'मधली पाने वाळली', hi: 'बीच के पत्ते सूखे', en: 'Dead heart present' },
  
  // Borer symptoms
  'TUNNELS_IN_STEM': { mr: 'खोडात भोके', hi: 'तने में सुरंग', en: 'Tunnels in stem' },
  'BORE_HOLES': { mr: 'खोडावर भोके', hi: 'तने में छेद', en: 'Holes in stem' },
  'FRASS_VISIBLE': { mr: 'भुसा दिसतो', hi: 'भूसा दिखता है', en: 'Sawdust-like waste visible' },
  
  // Termite symptoms
  'MUD_TUBES_VISIBLE': { mr: 'मातीचे बोगदे', hi: 'मिट्टी की नलियाँ', en: 'Mud tubes at base' },
  'MUD_GALLERIES': { mr: 'मातीचे बोगदे', hi: 'मिट्टी की नलियाँ', en: 'Mud galleries' },
  'TERMITE_DAMAGE': { mr: 'वाळवीचे नुकसान', hi: 'दीमक का नुकसान', en: 'Termite damage' },
  
  // Root symptoms
  'ROOT_DAMAGE': { mr: 'मुळांचे नुकसान', hi: 'जड़ का नुकसान', en: 'Root damage visible' },
  'ROOT_ROT': { mr: 'मूळ कुजलेले', hi: 'जड़ सड़ी', en: 'Roots are rotting' },
  'WATERLOGGED_ROOTS': { mr: 'मुळांवर पाणी', hi: 'जड़ों में पानी', en: 'Waterlogged roots' },
  
  // Plant structure symptoms
  'EASY_TO_PULL': { mr: 'झाड सहज उपटते', hi: 'पौधा आसानी से उखड़ता', en: 'Plant pulls out easily' },
  'PLANT_FALLING_OVER': { mr: 'झाड पडते', hi: 'पौधा गिर रहा', en: 'Plant falling over' },
  'WILTING': { mr: 'पाने मुरझलेली', hi: 'पत्ते मुरझाए', en: 'Wilting visible' },
  'YELLOWING': { mr: 'पाने पिवळी झाली', hi: 'पत्ते पीले हो गए', en: 'Yellowing' },
  
  // Pest symptoms
  'HONEYDEW': { mr: 'चिकट पदार्थ पानावर', hi: 'पत्तों पर चिपचिपा', en: 'Sticky honeydew' },
  'SOOTY_MOLD': { mr: 'काळी बुरशी', hi: 'काला फफूंद', en: 'Black sooty mold' },
  'SMALL_INSECTS_VISIBLE': { mr: 'लहान किडे दिसतात', hi: 'छोटे कीड़े दिखते', en: 'Small insects visible' },
  'INSECTS_VISIBLE': { mr: 'किडे दिसतात', hi: 'कीड़े दिखते', en: 'Insects visible' },
  'LARVAE_VISIBLE': { mr: 'अळ्या दिसतात', hi: 'लार्वा दिखता है', en: 'Larvae visible' },
  
  // Germination symptoms
  'SEED_NOT_GERMINATED': { mr: 'बियाणे उगवले नाही', hi: 'बीज नहीं उगा', en: 'Seed not germinated' },
  'POOR_GERMINATION': { mr: 'कमी उगवण', hi: 'खराब अंकुरण', en: 'Poor germination' },
  'GAPS_IN_ROWS': { mr: 'ओळीत खाली जागा', hi: 'कतार में खाली जगह', en: 'Gaps in rows' },
  
  // Disease symptoms
  'RED_LESIONS': { mr: 'लाल डाग', hi: 'लाल धब्बे', en: 'Red lesions' },
  'WHITE_POWDER': { mr: 'पांढरी भुकटी', hi: 'सफेद पाउडर', en: 'White powder' },
  'BLACK_SPORES': { mr: 'काळ्या बीजाणू', hi: 'काले बीजाणु', en: 'Black spores' },
  'LEAF_SPOTS': { mr: 'पानावर डाग', hi: 'पत्तों पर धब्बे', en: 'Leaf spots' },
  
  // Visual check fallback
  'VISUAL_CHECK': { mr: 'पिकाची तपासणी करा', hi: 'फसल की जाँच करें', en: 'Check the crop' }
};

function getObservationLabel(key: string, language: 'mr' | 'hi' | 'en'): string {
  // Normalize the key
  let normalized = key.toUpperCase().replace(/[\s-]+/g, '_');
  
  // Direct lookup
  if (OBSERVATION_LABELS[normalized]) {
    return OBSERVATION_LABELS[normalized][language];
  }
  
  // Try without common prefixes/suffixes
  normalized = normalized
    .replace(/^CHECK_FOR_/i, '')
    .replace(/_PRESENT$/i, '')
    .replace(/_VISIBLE$/i, '');
  
  if (OBSERVATION_LABELS[normalized]) {
    return OBSERVATION_LABELS[normalized][language];
  }
  
  // Fallback: format the key in farmer-friendly way
  const formatted = key
    .replace(/_/g, ' ')
    .replace(/check for/i, '')
    .trim()
    .toLowerCase();
  
  // Return with language-appropriate prefix
  if (language === 'mr') {
    return `${formatted} तपासा`;
  } else if (language === 'hi') {
    return `${formatted} जाँचें`;
  }
  return formatted;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHOTO OPTION LABELS
// ═══════════════════════════════════════════════════════════════════════════

const PHOTO_LABELS: Record<string, { label: string; description: string }> = {
  'mr': { label: '📷 फोटो पाठवा', description: 'अधिक अचूक निदानासाठी पिकाचा फोटो पाठवा' },
  'hi': { label: '📷 फोटो भेजें', description: 'अधिक सटीक निदान के लिए फसल का फोटो भेजें' },
  'en': { label: '📷 Send Photo', description: 'Send a crop photo for more accurate diagnosis' }
};

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSIS QUESTION TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const DIAGNOSIS_QUESTION_TEMPLATES: Record<string, { single: string; multiple: string }> = {
  'mr': {
    single: '🔬 तुमच्या पिकाला {cause} चा त्रास असू शकतो. खालील पैकी काय दिसते?',
    multiple: '🔬 तुमच्या पिकाला खालीलपैकी कोणती समस्या असू शकते? (सर्वात जवळचे निवडा)'
  },
  'hi': {
    single: '🔬 आपकी फसल को {cause} की समस्या हो सकती है। इनमें से क्या दिखता है?',
    multiple: '🔬 आपकी फसल में इनमें से कौन सी समस्या हो सकती है? (सबसे नज़दीकी चुनें)'
  },
  'en': {
    single: '🔬 Your crop may be affected by {cause}. Which of these do you see?',
    multiple: '🔬 Your crop may have one of these issues. Select the closest match:'
  }
};

function getQuestionText(
  diagnoses: DiagnosisOption[],
  language: 'mr' | 'hi' | 'en'
): string {
  const template = DIAGNOSIS_QUESTION_TEMPLATES[language] || DIAGNOSIS_QUESTION_TEMPLATES['en'];
  
  if (diagnoses.length === 1) {
    return template.single.replace('{cause}', diagnoses[0].cause_label);
  }
  
  return template.multiple;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GENERATOR FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate diagnosis-first response from candidate hypotheses.
 * 
 * PRINCIPLE: When crop damage is reported with land context, show ranked
 * diagnosis options immediately - don't ask generic clarification questions.
 * 
 * This is how a senior agronomist operates in the field.
 * 
 * v1.1.0: Now supports async regional translation for authentic farmer vocabulary.
 */
export async function generateDiagnosisFirstResponse(
  input: DiagnosisFirstInput
): Promise<DiagnosisFirstOutput | null> {
  const {
    hypotheses,
    crop_code,
    growth_stage,
    current_observations,
    language,
    damage_observations,
    trace_id,
    farmer_location
  } = input;
  
  const traceIdFinal = trace_id || `diag_${Date.now()}`;
  
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`🔬 [DiagnosisFirst v${DIAGNOSIS_FIRST_VERSION}] Generating diagnosis options`);
  console.log(`   Mode=DIAGNOSIS_FIRST`);
  console.log(`   Source=DECISION_RULES`);
  console.log(`   Clarification=HYPOTHESIS_DRIVEN`);
  console.log(`   Crop=${crop_code}, Stage=${growth_stage}`);
  console.log(`   Hypotheses received: ${hypotheses.length}`);
  console.log(`   Damage observations: ${(damage_observations || []).join(', ') || 'none'}`);
  if (farmer_location) {
    console.log(`   🌍 Regional translation: ${farmer_location.district}, ${farmer_location.state} (${farmer_location.language})`);
  }
  
  // Validate: Need at least one hypothesis
  if (!hypotheses || hypotheses.length === 0) {
    console.log(`   ⚠️ No hypotheses available - cannot generate diagnosis-first response`);
    return null;
  }
  
  // Sort hypotheses by priority → confidence (total_score)
  const sortedHypotheses = [...hypotheses].sort((a, b) => {
    // Higher priority first (priority 1 is highest)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Higher confidence first
    return b.total_score - a.total_score;
  });
  
  // Take top 4 hypotheses
  const topHypotheses = sortedHypotheses.slice(0, 4);
  
  console.log(`   📊 Top hypotheses:`);
  topHypotheses.forEach((h, i) => {
    console.log(`      ${i + 1}. ${h.cause} (group=${h.canonical_group}, priority=${h.priority}, score=${h.total_score.toFixed(2)})`);
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // v1.1.0: REGIONAL TRANSLATION SUPPORT
  // If farmer_location is provided, use regional translator for authentic terms
  // Otherwise, fallback to hardcoded translations
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Generate diagnosis options (with optional regional translation)
  const diagnoses: DiagnosisOption[] = await Promise.all(
    topHypotheses.map(async (h, idx) => {
      // Get the best differentiating observation for this hypothesis
      let bestObservation = h.observable_characteristics?.[0];
      
      // Try to find an observation not already known
      for (const obs of h.observable_characteristics || []) {
        const obsKey = obs.observation_key.toUpperCase();
        if (!current_observations.some(co => co.toUpperCase() === obsKey)) {
          bestObservation = obs;
          break;
        }
      }
      
      const observationKey = bestObservation?.observation_key || 'VISUAL_CHECK';
      
      // Determine cause label (regional or fallback)
      let causeLabel: string;
      let observationLabel: string;
      
      if (farmer_location) {
        try {
          // Use static import (already imported at top of file)
          const regional = await translateToRegionalTerms(
            {
              pest_name_en: h.cause,
              treatment_description_en: `Check for ${observationKey.replace(/_/g, ' ').toLowerCase()}`,
            },
            farmer_location
          );

          const isUntranslated = (text: string | undefined | null): boolean => {
            const t = (text || '').trim();
            if (!t) return true;
            if (language === 'en') return false;
            // For mr/hi we expect Devanagari; if not present, treat as untranslated
            const hasDevanagari = /[\u0900-\u097F]/.test(t);
            if ((language === 'mr' || language === 'hi') && !hasDevanagari) return true;
            // If it looks identical to the English input, treat as untranslated
            if (t.toLowerCase() === (h.cause || '').trim().toLowerCase()) return true;
            // Avoid raw "Check for ..." leakage
            if (/\bcheck\s+for\b/i.test(t)) return true;
            return false;
          };

          // If regional translator couldn't localize (common for rare disease names), fall back to hardcoded matcher.
          causeLabel = isUntranslated(regional.pest_name_regional)
            ? getCauseLabel(h.cause, language)
            : regional.pest_name_regional;

          observationLabel = isUntranslated(regional.treatment_label_regional)
            ? getObservationLabel(observationKey, language)
            : regional.treatment_label_regional;

          if (isUntranslated(regional.pest_name_regional) || isUntranslated(regional.treatment_label_regional)) {
            console.log(`   🌍 Regional fallback used: cause="${h.cause}" → "${causeLabel}" | obs="${observationKey}" → "${observationLabel}"`);
          } else {
            console.log(`   🌍 Regional: ${h.cause} → ${causeLabel}`);
          }
        } catch (error) {
          console.warn(`   ⚠️ Regional translation failed for ${h.cause}, using fallback`);
          causeLabel = getCauseLabel(h.cause, language);
          observationLabel = getObservationLabel(observationKey, language);
        }
      } else {
        // Use hardcoded translations (fallback)
        causeLabel = getCauseLabel(h.cause, language);
        observationLabel = getObservationLabel(observationKey, language);
      }
      
      return {
        id: `diag_${idx}_${h.rule_id}`,
        cause: h.cause,  // Keep English for backend logic
        cause_label: causeLabel,  // Regional translation for display
        canonical_group: h.canonical_group,
        observation_key: observationKey,  // Keep English for backend logic
        observation_label: observationLabel,  // Regional translation for display
        confidence: h.total_score,
        priority: h.priority,
        icon: getGroupIcon(h.canonical_group),
        rule_id: h.rule_id
      };
    })
  );
  
  // Generate photo option (ALWAYS present)
  const photoLabels = PHOTO_LABELS[language] || PHOTO_LABELS['en'];
  const photoOption: PhotoOption = {
    id: 'PHOTO_UPLOAD',
    label: photoLabels.label,
    icon: '📷',
    description: photoLabels.description
  };
  
  // Generate question text
  const questionText = getQuestionText(diagnoses, language);
  
  console.log(`   ✅ Generated ${diagnoses.length} diagnosis options + photo option`);
  console.log(`   Question: "${questionText.substring(0, 60)}..."`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  return {
    mode: 'DIAGNOSIS_FIRST',
    source: 'DECISION_RULES',
    question_text: questionText,
    diagnoses,
    photo_option: photoOption,
    crop_code,
    growth_stage,
    total_hypotheses_considered: hypotheses.length,
    timestamp: Date.now(),
    trace_id: traceIdFinal
  };
}

/**
 * Create UNKNOWN diagnosis when no rules match.
 * This is a formal positive output - we NEVER suppress output when crop damage exists.
 */
export function createUnknownDiagnosisResponse(
  crop_code: string,
  growth_stage: string,
  damage_observations: string[],
  language: 'mr' | 'hi' | 'en',
  trace_id?: string
): DiagnosisFirstOutput {
  const traceIdFinal = trace_id || `unknown_${Date.now()}`;
  
  console.log(`\n🔍 [DiagnosisFirst] Creating UNKNOWN diagnosis response`);
  console.log(`   Crop=${crop_code}, Stage=${growth_stage}`);
  console.log(`   Damage observed: ${damage_observations.join(', ')}`);
  
  const unknownMessages: Record<string, string> = {
    'mr': '🔍 तुमच्या पिकात समस्या दिसत आहे पण नेमके कारण ओळखण्यासाठी अधिक माहिती हवी.',
    'hi': '🔍 आपकी फसल में समस्या है लेकिन सही कारण जानने के लिए अधिक जानकारी चाहिए।',
    'en': '🔍 Your crop has an issue but we need more information to identify the exact cause.'
  };
  
  const checkLabels: Record<string, { water: string; pest: string; nutrient: string }> = {
    'mr': {
      water: 'पाण्याची समस्या (जास्त/कमी पाणी)',
      pest: 'कीड/किडीचा हल्ला',
      nutrient: 'पोषण कमतरता (खत कमी)'
    },
    'hi': {
      water: 'पानी की समस्या (अधिक/कम पानी)',
      pest: 'कीड़े/कीटक का हमला',
      nutrient: 'पोषक तत्वों की कमी'
    },
    'en': {
      water: 'Water issue (too much/too little)',
      pest: 'Pest/insect attack',
      nutrient: 'Nutrient deficiency'
    }
  };
  
  const labels = checkLabels[language] || checkLabels['en'];
  
  const diagnoses: DiagnosisOption[] = [
    {
      id: 'unknown_water',
      cause: 'water_issue',
      cause_label: labels.water,
      canonical_group: 'stress',
      observation_key: 'WATER_STRESS_CHECK',
      observation_label: labels.water,
      confidence: 0.3,
      priority: 1,
      icon: '💧',
      rule_id: 'UNKNOWN_FALLBACK'
    },
    {
      id: 'unknown_pest',
      cause: 'pest_issue',
      cause_label: labels.pest,
      canonical_group: 'pest',
      observation_key: 'PEST_CHECK',
      observation_label: labels.pest,
      confidence: 0.3,
      priority: 2,
      icon: '🐛',
      rule_id: 'UNKNOWN_FALLBACK'
    },
    {
      id: 'unknown_nutrient',
      cause: 'nutrient_issue',
      cause_label: labels.nutrient,
      canonical_group: 'deficiency',
      observation_key: 'NUTRIENT_CHECK',
      observation_label: labels.nutrient,
      confidence: 0.3,
      priority: 3,
      icon: '🌿',
      rule_id: 'UNKNOWN_FALLBACK'
    }
  ];
  
  const photoLabels = PHOTO_LABELS[language] || PHOTO_LABELS['en'];
  const photoOption: PhotoOption = {
    id: 'PHOTO_UPLOAD',
    label: photoLabels.label,
    icon: '📷',
    description: photoLabels.description
  };
  
  return {
    mode: 'DIAGNOSIS_FIRST',
    source: 'DECISION_RULES',
    question_text: unknownMessages[language] || unknownMessages['en'],
    diagnoses,
    photo_option: photoOption,
    crop_code,
    growth_stage,
    total_hypotheses_considered: 0,
    timestamp: Date.now(),
    trace_id: traceIdFinal
  };
}

/**
 * Format DiagnosisFirstOutput for ClarificationOptionsUI.
 * Converts to the format expected by the frontend.
 * 
 * v1.1.1: FIX - Prevent duplicate text in labels by checking for similarity
 * between cause_label and observation_label before combining them.
 */
export function formatForClarificationUI(
  output: DiagnosisFirstOutput
): {
  type: 'CLARIFICATION_QUESTION';
  orchestratorType: 'DIAGNOSTIC_CONFIRMATION';
  question: string;
  options: Array<{
    id: string;
    label: string;
    observation_key: string;
    rule_id: string;
    confidence_boost: number;
    icon?: string;
    cause?: string;
  }>;
  selectionType: 'single_choice';
  maxSelections: 1;
  metadata: {
    source: string;
    mode: string;
    crop_code: string;
    growth_stage: string;
  };
} {
  // Helper: Check if two labels are similar (would cause duplication)
  const areLabelsSimilar = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    const normA = a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
    const normB = b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim();
    // Check for substring containment or high overlap
    if (normA === normB) return true;
    if (normA.includes(normB) || normB.includes(normA)) return true;
    // Check for >70% character overlap using Jaccard-like similarity
    const setA = new Set(normA.split(''));
    const setB = new Set(normB.split(''));
    const intersection = [...setA].filter(c => setB.has(c)).length;
    const union = new Set([...setA, ...setB]).size;
    return union > 0 && (intersection / union) > 0.7;
  };

  // Convert diagnoses to clarification options format
  // FIX: Avoid duplication when cause_label and observation_label are similar
  const options = output.diagnoses.map(d => {
    let label: string;
    
    // If cause_label already contains observation_label or they're very similar, use only cause_label
    if (areLabelsSimilar(d.cause_label, d.observation_label)) {
      // Only use cause_label (with icon)
      label = `${d.icon} ${d.cause_label}`;
    } else {
      // Combine both (no duplication)
      label = `${d.icon} ${d.cause_label} (${d.observation_label})`;
    }
    
    return {
      id: d.id,
      label,
      observation_key: d.observation_key,
      rule_id: d.rule_id,
      confidence_boost: 0.20,  // Standard boost for confirmed diagnosis option
      icon: d.icon,
      cause: d.cause
    };
  });
  
  // Add photo option at end
  options.push({
    id: output.photo_option.id,
    label: output.photo_option.label,
    observation_key: 'PHOTO_UPLOAD',
    rule_id: 'PHOTO_FALLBACK',
    confidence_boost: 0.25,
    icon: output.photo_option.icon
  });
  
  return {
    type: 'CLARIFICATION_QUESTION',
    orchestratorType: 'DIAGNOSTIC_CONFIRMATION',
    question: output.question_text,
    options,
    selectionType: 'single_choice',
    maxSelections: 1,
    metadata: {
      source: output.source,
      mode: output.mode,
      crop_code: output.crop_code,
      growth_stage: output.growth_stage
    }
  };
}
