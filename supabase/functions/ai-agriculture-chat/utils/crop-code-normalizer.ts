// CROP CODE NORMALIZER - Single Source of Truth

export const CROP_CODE_NORMALIZER_VERSION = '1.0.0';

// FORWARD MAP: Any crop name → DB short code

const CROP_TO_SHORT: Record<string, string> = {
  // English full names
  'SUGARCANE': 'SC', 'SUGAR_CANE': 'SC', 'CANE': 'SC', 'GANNA': 'SC',
  'COTTON': 'CTN', 'KAPAS': 'CTN', 'KAPUS': 'CTN',
  'SOYBEAN': 'SOY', 'SOYA': 'SOY', 'SOYABEAN': 'SOY',
  'RICE': 'RICE', 'PADDY': 'RICE', 'DHAN': 'RICE', 'CHAWAL': 'RICE', 'BHAT': 'RICE',
  'WHEAT': 'WHT', 'GEHUN': 'WHT',
  'MAIZE': 'MZ', 'CORN': 'MZ', 'MAKKA': 'MZ',
  'TOMATO': 'TOM', 'TAMATAR': 'TOM',
  'ONION': 'ONI', 'KANDA': 'ONI', 'PYAZ': 'ONI',
  'CHILLI': 'CHI', 'CHILI': 'CHI', 'PEPPER': 'CHI', 'MIRCHI': 'CHI',
  'GROUNDNUT': 'GN', 'PEANUT': 'GN', 'MOONGFALI': 'GN',
  'BANANA': 'BAN',
  'GRAPE': 'GRP', 'GRAPES': 'GRP',
  'POMEGRANATE': 'POM',
  'TUR': 'TUR', 'ARHAR': 'TUR', 'PIGEON_PEA': 'TUR', 'PIGEONPEA': 'TUR',
  'GRAM': 'GRAM', 'CHICKPEA': 'GRAM', 'CHANA': 'GRAM',
  'MUNG': 'MUNG', 'MOONG': 'MUNG',
  'URAD': 'URAD', 'BLACK_GRAM': 'URAD',
  'MANGO': 'MANGO',
  'ORANGE': 'ORANGE', 'CITRUS': 'ORANGE',
  'MUSTARD': 'MUSTARD', 'SARSON': 'MUSTARD',
  'SUNFLOWER': 'SFL',
  'TURMERIC': 'TUR_C', 'HALDI': 'TUR_C',
  'GINGER': 'GNG', 'ADRAK': 'GNG',
  'OKRA': 'OKRA', 'BHINDI': 'OKRA',
  'BRINJAL': 'BRN', 'EGGPLANT': 'BRN',
  'CABBAGE': 'CAB',
  'CAULIFLOWER': 'CFL',
  'POTATO': 'POT', 'ALOO': 'POT',

  // Short codes → themselves (passthrough)
  'SC': 'SC', 'CTN': 'CTN', 'SOY': 'SOY', 'MZ': 'MZ', 'WHT': 'WHT',
  'TOM': 'TOM', 'ONI': 'ONI', 'CHI': 'CHI', 'GN': 'GN', 'BAN': 'BAN',
  'GRP': 'GRP', 'POM': 'POM', 'SFL': 'SFL', 'TUR_C': 'TUR_C',
  'GNG': 'GNG', 'BRN': 'BRN', 'CAB': 'CAB', 'CFL': 'CFL', 'POT': 'POT',
  'ALL': 'ALL',

  // Marathi (मराठी)
  'कापूस': 'CTN', 'सोयाबीन': 'SOY', 'सोयाबिन': 'SOY',
  'भात': 'RICE', 'तांदूळ': 'RICE',
  'गहू': 'WHT',
  'ऊस': 'SC',
  'मका': 'MZ',
  'टोमॅटो': 'TOM',
  'कांदा': 'ONI',
  'मिरची': 'CHI',
  'भुईमूग': 'GN', 'शेंगदाणा': 'GN',
  'हरभरा': 'GRAM',
  'तूर': 'TUR',
  'मूग': 'MUNG',
  'उडीद': 'URAD',
  'केळी': 'BAN',
  'आंबा': 'MANGO',
  'द्राक्षे': 'GRP',
  'डाळिंब': 'POM',
  'मोहरी': 'MUSTARD',
  'सूर्यफूल': 'SFL',
  'हळद': 'TUR_C',
  'आले': 'GNG',
  'वांगी': 'BRN',
  'भेंडी': 'OKRA',
  'कोबी': 'CAB',
  'फ्लॉवर': 'CFL',
  'बटाटा': 'POT',

  // Hindi (हिंदी)
  'कपास': 'CTN', 'रुई': 'CTN',
  'धान': 'RICE', 'चावल': 'RICE',
  'गेहूं': 'WHT', 'गेहूँ': 'WHT',
  'गन्ना': 'SC', 'ईख': 'SC',
  'मक्का': 'MZ',
  'टमाटर': 'TOM',
  'प्याज': 'ONI',
  'मिर्च': 'CHI',
  'मूंगफली': 'GN',
  'चना': 'GRAM',
  'अरहर': 'TUR',
  'केला': 'BAN',
  'आम': 'MANGO',
  'अंगूर': 'GRP',
  'अनार': 'POM',
  'सरसों': 'MUSTARD',
  'सूरजमुखी': 'SFL',
  'अदरक': 'GNG',
  'आलू': 'POT',
  'बैंगन': 'BRN',
  'भिंडी': 'OKRA',
  'बंदगोभी': 'CAB',
  'फूलगोभी': 'CFL',

};

// REVERSE MAP: DB short code → full English name

const SHORT_TO_FULL: Record<string, string> = {
  'SC': 'SUGARCANE', 'CTN': 'COTTON', 'SOY': 'SOYBEAN',
  'RICE': 'RICE', 'WHT': 'WHEAT', 'MZ': 'MAIZE',
  'TOM': 'TOMATO', 'ONI': 'ONION', 'CHI': 'CHILLI',
  'GN': 'GROUNDNUT', 'BAN': 'BANANA', 'GRP': 'GRAPE',
  'POM': 'POMEGRANATE', 'TUR': 'TUR', 'GRAM': 'GRAM',
  'MUNG': 'MUNG', 'URAD': 'URAD', 'MANGO': 'MANGO',
  'ORANGE': 'ORANGE', 'MUSTARD': 'MUSTARD', 'SFL': 'SUNFLOWER',
  'TUR_C': 'TURMERIC', 'GNG': 'GINGER', 'OKRA': 'OKRA',
  'BRN': 'BRINJAL', 'CAB': 'CABBAGE', 'CFL': 'CAULIFLOWER',
  'POT': 'POTATO', 'ALL': 'ALL',
};

// PUBLIC API

// Normalize any crop name/code to the DB short code.
export function normalizeCropCode(raw: string | undefined | null): string {
  if (!raw || raw.trim() === '') return 'ALL';
  
  const trimmed = raw.trim();
  // Try exact match first (handles Devanagari)
  if (CROP_TO_SHORT[trimmed]) return CROP_TO_SHORT[trimmed];
  
  // Uppercase for English
  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  if (CROP_TO_SHORT[upper]) return CROP_TO_SHORT[upper];
  
  // Already a valid short code?
  if (SHORT_TO_FULL[upper]) return upper;
  
  console.warn(`[CropCodeNormalizer] Unknown crop: "${raw}", returning ALL`);
  return 'ALL';
}

// Get full English crop name from DB short code.
export function getFullCropName(shortCode: string | undefined | null): string {
  if (!shortCode) return 'UNKNOWN';
  const upper = shortCode.toUpperCase().trim();
  return SHORT_TO_FULL[upper] || upper;
}

// Get all possible crop code variants for flexible DB matching.
export function getCropCodeVariants(raw: string | undefined | null): string[] {
  const short = normalizeCropCode(raw);
  const full = getFullCropName(short);
  const variants = new Set<string>([short, full, 'ALL', 'all', '*', 'universal']);
  if (raw) {
    variants.add(raw.toUpperCase().trim());
  }
  return Array.from(variants);
}
