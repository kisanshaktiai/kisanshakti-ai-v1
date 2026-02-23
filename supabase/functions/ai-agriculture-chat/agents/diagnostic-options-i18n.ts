/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGNOSTIC OPTIONS i18n - Centralized translations for clarification options
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Provides consistent, language-specific diagnostic options for the 
 * clarification UI. All options MUST be in the farmer's selected language
 * with NO mixed English/Marathi text.
 * 
 * RULE: Each option carries an i18n_key and observation_key for backend parsing
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const DIAGNOSTIC_OPTIONS_VERSION = '1.0.0';

export interface DiagnosticOption {
  i18n_key: string;
  observation_key: string;
  label: Record<string, string>;
  icon: string;
  diagnostic_power: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGARCANE SEEDLING STAGE OPTIONS - For terminal damage at early stage
// ═══════════════════════════════════════════════════════════════════════════

export const SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS: DiagnosticOption[] = [
  {
    i18n_key: 'EARLY_SHOOT_BORER',
    observation_key: 'DEAD_HEART_PRESENT',
    label: {
      mr: '🔍 सुरुवातीची खोड किडा (मेलेला गाभा)',
      hi: '🔍 शुरुआती तना छेदक (मृत गभा)',
      en: '🔍 Early Shoot Borer (Dead Heart)'
    },
    icon: 'alert-triangle',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'TERMITE',
    observation_key: 'TERMITE_DAMAGE',
    label: {
      mr: '🐛 वाळवी / मातीत बोगदे',
      hi: '🐛 दीमक / मिट्टी में सुरंग',
      en: '🐛 Termite / Tunnels in soil'
    },
    icon: 'bug',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'ROOT_ROT',
    observation_key: 'SETT_ROTTING',
    label: {
      mr: '🌱 बेणे कुजले / काळे झाले',
      hi: '🌱 बीज सड़ गया / काला हो गया',
      en: '🌱 Sett rotted / turned black'
    },
    icon: 'leaf',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'WATERLOGGING',
    observation_key: 'WATERLOGGING_DAMAGE',
    label: {
      mr: '💧 पाणी साचल्याने नुकसान',
      hi: '💧 जलभराव से नुकसान',
      en: '💧 Waterlogging damage'
    },
    icon: 'droplets',
    diagnostic_power: 'MEDIUM'
  },
  {
    i18n_key: 'PHOTO_UPLOAD',
    observation_key: 'PHOTO_UPLOAD',
    label: {
      mr: '📷 फोटो पाठवा',
      hi: '📷 फोटो भेजें',
      en: '📷 Send Photo'
    },
    icon: 'camera',
    diagnostic_power: 'LOW'
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC TERMINAL DAMAGE OPTIONS - For any crop with plant death
// ═══════════════════════════════════════════════════════════════════════════

export const GENERIC_TERMINAL_DAMAGE_OPTIONS: DiagnosticOption[] = [
  {
    i18n_key: 'DEAD_HEART',
    observation_key: 'DEAD_HEART_PRESENT',
    label: {
      mr: '🔴 मधली सुरळी सुकलेली / ओढल्यास बाहेर येते (मेलेला गाभा)',
      hi: '🔴 बीच की पत्ती सूखी / खींचने पर निकल जाती है (मृत गभा)',
      en: '🔴 Central whorl dried / pulls out easily (Dead Heart)'
    },
    icon: 'alert-triangle',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'LARVAE_VISIBLE',
    observation_key: 'LARVAE_VISIBLE',
    label: {
      mr: '🐛 खोडात / मुळांजवळ अळ्या दिसतात',
      hi: '🐛 तने में / जड़ों के पास इल्ली दिखती है',
      en: '🐛 Larvae visible in stem / near roots'
    },
    icon: 'bug',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'TERMITE',
    observation_key: 'TERMITE_DAMAGE',
    label: {
      mr: '🏠 मातीत पांढरे वाळवी / बोगदे दिसतात',
      hi: '🏠 मिट्टी में सफेद दीमक / सुरंग दिखती है',
      en: '🏠 White termites / tunnels visible in soil'
    },
    icon: 'search',
    diagnostic_power: 'HIGH'
  },
  {
    i18n_key: 'HONEYDEW_MOLD',
    observation_key: 'HONEYDEW_PRESENT',
    label: {
      mr: '✨ पानांवर चिकट पदार्थ / काळी बुरशी',
      hi: '✨ पत्तों पर चिपचिपा पदार्थ / काली फफूंद',
      en: '✨ Sticky substance / black mold on leaves'
    },
    icon: 'droplets',
    diagnostic_power: 'MEDIUM'
  },
  {
    i18n_key: 'PHOTO_UPLOAD',
    observation_key: 'PHOTO_UPLOAD',
    label: {
      mr: '📷 फोटो काढा (स्पष्ट ओळखण्यासाठी)',
      hi: '📷 फोटो लें (सही पहचान के लिए)',
      en: '📷 Take Photo (for accurate identification)'
    },
    icon: 'camera',
    diagnostic_power: 'LOW'
  }
];

/**
 * Get diagnostic options for a specific crop, stage, and language
 * Returns options with labels already in the correct language
 */
export function getDiagnosticOptionsForCropStage(
  cropCode: string,
  stage: string,
  language: string
): Array<{ label: string; observation_key: string; i18n_key: string; diagnostic_power: string }> {
  const normalizedCrop = cropCode?.toUpperCase() || '';
  const normalizedStage = stage?.toUpperCase()?.replace(/[\s-]/g, '_') || '';
  
  // Select appropriate option set
  let optionSet: DiagnosticOption[];
  
  if (normalizedCrop === 'SUGARCANE' && 
      (normalizedStage === 'SEEDLING' || normalizedStage === 'GERMINATION')) {
    optionSet = SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS;
  } else {
    optionSet = GENERIC_TERMINAL_DAMAGE_OPTIONS;
  }
  
  // Convert to language-specific labels (with fallback to 'en')
  return optionSet.map(opt => ({
    label: opt.label[language] || opt.label['en'],
    observation_key: opt.observation_key,
    i18n_key: opt.i18n_key,
    diagnostic_power: opt.diagnostic_power
  }));
}

export default {
  DIAGNOSTIC_OPTIONS_VERSION,
  getDiagnosticOptionsForCropStage,
  SUGARCANE_SEEDLING_DIAGNOSTIC_OPTIONS,
  GENERIC_TERMINAL_DAMAGE_OPTIONS
};
