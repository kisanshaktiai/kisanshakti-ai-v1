/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP CONSTANTS - Centralized Crop Mappings
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Single source of truth for crop name to code mappings.
 * Supports English, Hindi, and Marathi.
 */

/**
 * Crop name to normalized code mapping (multi-language)
 */
export const CROP_NAME_TO_CODE: Record<string, string> = {
  // English
  'wheat': 'wheat',
  'rice': 'rice',
  'paddy': 'rice',
  'cotton': 'cotton',
  'sugarcane': 'sugarcane',
  'soybean': 'soybean',
  'maize': 'maize',
  'corn': 'maize',
  'groundnut': 'groundnut',
  'peanut': 'groundnut',
  'tomato': 'tomato',
  'onion': 'onion',
  'potato': 'potato',
  'gram': 'gram',
  'chickpea': 'gram',
  'mustard': 'mustard',
  'sunflower': 'sunflower',
  'turmeric': 'turmeric',
  'ginger': 'ginger',
  'banana': 'banana',
  'mango': 'mango',
  'grapes': 'grapes',
  'pomegranate': 'pomegranate',
  'chilli': 'chilli',
  'brinjal': 'brinjal',
  'okra': 'okra',
  'cabbage': 'cabbage',
  'cauliflower': 'cauliflower',
  
  // Hindi (हिंदी)
  'गेहूं': 'wheat',
  'गेहूँ': 'wheat',
  'चावल': 'rice',
  'धान': 'rice',
  'कपास': 'cotton',
  'रुई': 'cotton',
  'गन्ना': 'sugarcane',
  'ईख': 'sugarcane',
  'सोयाबीन': 'soybean',
  'मक्का': 'maize',
  'मूंगफली': 'groundnut',
  'टमाटर': 'tomato',
  'प्याज': 'onion',
  'आलू': 'potato',
  'चना': 'gram',
  'सरसों': 'mustard',
  'सूरजमुखी': 'sunflower',
  'हल्दी': 'turmeric',
  'अदरक': 'ginger',
  'केला': 'banana',
  'आम': 'mango',
  'अंगूर': 'grapes',
  'अनार': 'pomegranate',
  'मिर्च': 'chilli',
  'बैंगन': 'brinjal',
  'भिंडी': 'okra',
  'बंदगोभी': 'cabbage',
  'फूलगोभी': 'cauliflower',
  
  // Marathi (मराठी)
  'गहू': 'wheat',
  'तांदूळ': 'rice',
  'भात': 'rice',
  'कापूस': 'cotton',
  'ऊस': 'sugarcane',
  'सोयाबिन': 'soybean',
  'मका': 'maize',
  'भुईमूग': 'groundnut',
  'शेंगदाणा': 'groundnut',
  'टोमॅटो': 'tomato',
  'कांदा': 'onion',
  'बटाटा': 'potato',
  'हरभरा': 'gram',
  'मोहरी': 'mustard',
  'सूर्यफूल': 'sunflower',
  'हळद': 'turmeric',
  'आले': 'ginger',
  'केळी': 'banana',
  'आंबा': 'mango',
  'द्राक्षे': 'grapes',
  'डाळिंब': 'pomegranate',
  'मिरची': 'chilli',
  'वांगी': 'brinjal',
  'भेंडी': 'okra',
  'कोबी': 'cabbage',
  'फ्लॉवर': 'cauliflower'
};

/**
 * Normalize crop name to crop code
 */
export function normalizeCropName(cropName: string | undefined | null): string | null {
  if (!cropName) return null;
  
  const normalized = cropName.toLowerCase().trim();
  
  // Direct match
  if (CROP_NAME_TO_CODE[normalized]) {
    return CROP_NAME_TO_CODE[normalized];
  }
  
  // Case-insensitive match for Hindi/Marathi
  if (CROP_NAME_TO_CODE[cropName]) {
    return CROP_NAME_TO_CODE[cropName];
  }
  
  // Partial match
  for (const [name, code] of Object.entries(CROP_NAME_TO_CODE)) {
    if (normalized.includes(name.toLowerCase()) || name.toLowerCase().includes(normalized)) {
      return code;
    }
  }
  
  // Return as-is if no match (might be valid crop code)
  return normalized;
}

/**
 * Crop stage durations (days) by crop - ICAR standards
 */
export interface CropStageDurations {
  germination: [number, number];
  vegetative: [number, number];
  reproductive: [number, number];
  maturity: [number, number];
  harvest: [number, number];
}

export const CROP_STAGE_DURATIONS: Record<string, CropStageDurations> = {
  wheat: {
    germination: [0, 15],
    vegetative: [15, 75],
    reproductive: [75, 105],
    maturity: [105, 130],
    harvest: [130, 150]
  },
  rice: {
    germination: [0, 15],
    vegetative: [15, 55],
    reproductive: [55, 95],
    maturity: [95, 120],
    harvest: [120, 140]
  },
  cotton: {
    germination: [0, 20],
    vegetative: [20, 60],
    reproductive: [60, 120],
    maturity: [120, 160],
    harvest: [160, 200]
  },
  sugarcane: {
    germination: [0, 35],
    vegetative: [35, 100],
    reproductive: [100, 270],
    maturity: [270, 330],
    harvest: [330, 400]
  },
  tomato: {
    germination: [0, 15],
    vegetative: [15, 40],
    reproductive: [40, 90],
    maturity: [90, 120],
    harvest: [120, 150]
  },
  onion: {
    germination: [0, 15],
    vegetative: [15, 60],
    reproductive: [60, 100],
    maturity: [100, 130],
    harvest: [130, 150]
  },
  maize: {
    germination: [0, 12],
    vegetative: [12, 50],
    reproductive: [50, 80],
    maturity: [80, 100],
    harvest: [100, 120]
  },
  soybean: {
    germination: [0, 12],
    vegetative: [12, 50],
    reproductive: [50, 80],
    maturity: [80, 110],
    harvest: [110, 130]
  },
  groundnut: {
    germination: [0, 15],
    vegetative: [15, 45],
    reproductive: [45, 85],
    maturity: [85, 115],
    harvest: [115, 135]
  },
  gram: {
    germination: [0, 10],
    vegetative: [10, 45],
    reproductive: [45, 75],
    maturity: [75, 100],
    harvest: [100, 120]
  },
  default: {
    germination: [0, 15],
    vegetative: [15, 60],
    reproductive: [60, 100],
    maturity: [100, 130],
    harvest: [130, 150]
  }
};

/**
 * Get crop stage from days after sowing
 */
export type CropStage = 'PLANNING' | 'GERMINATION' | 'VEGETATIVE' | 'REPRODUCTIVE' | 'MATURITY' | 'HARVEST' | 'POST_HARVEST';

export function getCropStageFromDAS(daysAfterSowing: number, cropCode: string): CropStage {
  const config = CROP_STAGE_DURATIONS[cropCode.toLowerCase()] || CROP_STAGE_DURATIONS.default;
  
  if (daysAfterSowing < 0) return 'PLANNING';
  if (daysAfterSowing < config.germination[1]) return 'GERMINATION';
  if (daysAfterSowing < config.vegetative[1]) return 'VEGETATIVE';
  if (daysAfterSowing < config.reproductive[1]) return 'REPRODUCTIVE';
  if (daysAfterSowing < config.maturity[1]) return 'MATURITY';
  if (daysAfterSowing < config.harvest[1]) return 'HARVEST';
  return 'POST_HARVEST';
}
