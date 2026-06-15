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
 * NOTE: stage windows (DAS ranges per crop) are NOT hardcoded any more.
 * SSOT is `public.crop_stage_master` in the database; the backend
 * `resolveCropTimeline` helper derives the growth stage from
 * `crop_schedules.sowing_date` + `crop_stage_master` + variety
 * `maturity_days_max` and returns it on `landContext.growth_stage`.
 *
 * Frontend surfaces should read stage/DAS from backend-provided fields
 * (e.g. landContext.growth_stage / landContext.days_since_sowing).
 */
export type CropStage =
  | 'PLANNING'
  | 'GERMINATION'
  | 'VEGETATIVE'
  | 'REPRODUCTIVE'
  | 'MATURITY'
  | 'HARVEST'
  | 'POST_HARVEST'
  | 'UNKNOWN';
