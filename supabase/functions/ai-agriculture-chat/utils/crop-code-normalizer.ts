/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP CODE NORMALIZER - Single Source of Truth (v2.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * POST-MIGRATION (2026-06-18): DB stores crop_code in lower_snake_case full
 * names ('sugarcane', 'cotton', 'rice'). Short codes ('SC', 'CTN') and UPPER
 * variants are NO LONGER valid for DB lookups. This normalizer now always
 * returns the canonical lowercase full name.
 *
 * @version 2.0.0
 */

export const CROP_CODE_NORMALIZER_VERSION = '2.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// ALIAS MAP: Any crop name / short code / vernacular → canonical lowercase full
// ═══════════════════════════════════════════════════════════════════════════

const ALIAS_TO_CANONICAL: Record<string, string> = {
  // English full / short codes
  'sugarcane': 'sugarcane', 'sugar_cane': 'sugarcane', 'cane': 'sugarcane',
  'sc': 'sugarcane', 'ganna': 'sugarcane',
  'cotton': 'cotton', 'ctn': 'cotton', 'kapas': 'cotton', 'kapus': 'cotton',
  'soybean': 'soybean', 'soya': 'soybean', 'soyabean': 'soybean', 'soy': 'soybean',
  'rice': 'rice', 'paddy': 'rice', 'dhan': 'rice', 'chawal': 'rice', 'bhat': 'rice',
  'wheat': 'wheat', 'wht': 'wheat', 'gehun': 'wheat',
  'maize': 'maize', 'corn': 'maize', 'makka': 'maize', 'mz': 'maize',
  'tomato': 'tomato', 'tom': 'tomato', 'tamatar': 'tomato',
  'onion': 'onion', 'oni': 'onion', 'kanda': 'onion', 'pyaz': 'onion',
  'chilli': 'chilli', 'chili': 'chilli', 'chi': 'chilli', 'pepper': 'chilli', 'mirchi': 'chilli',
  'groundnut': 'groundnut', 'peanut': 'groundnut', 'moongfali': 'groundnut', 'gn': 'groundnut',
  'banana': 'banana', 'ban': 'banana',
  'grape': 'grape', 'grapes': 'grape', 'grp': 'grape',
  'pomegranate': 'pomegranate', 'pom': 'pomegranate',
  'tur': 'tur', 'arhar': 'tur', 'pigeon_pea': 'tur', 'pigeonpea': 'tur',
  'gram': 'gram', 'chickpea': 'gram', 'chana': 'gram',
  'mung': 'mung', 'moong': 'mung',
  'urad': 'urad', 'black_gram': 'urad',
  'mango': 'mango',
  'orange': 'orange', 'citrus': 'orange',
  'mustard': 'mustard', 'sarson': 'mustard',
  'sunflower': 'sunflower', 'sfl': 'sunflower',
  'turmeric': 'turmeric', 'haldi': 'turmeric', 'tur_c': 'turmeric',
  'ginger': 'ginger', 'adrak': 'ginger', 'gng': 'ginger',
  'okra': 'okra', 'bhindi': 'okra',
  'brinjal': 'brinjal', 'eggplant': 'brinjal', 'brn': 'brinjal',
  'cabbage': 'cabbage', 'cab': 'cabbage',
  'cauliflower': 'cauliflower', 'cfl': 'cauliflower',
  'potato': 'potato', 'pot': 'potato', 'aloo': 'potato',
  'all': 'all', '*': 'all', 'universal': 'all',

  // Marathi (मराठी)
  'कापूस': 'cotton', 'सोयाबीन': 'soybean', 'सोयाबिन': 'soybean',
  'भात': 'rice', 'तांदूळ': 'rice',
  'गहू': 'wheat',
  'ऊस': 'sugarcane',
  'मका': 'maize',
  'टोमॅटो': 'tomato',
  'कांदा': 'onion',
  'मिरची': 'chilli',
  'भुईमूग': 'groundnut', 'शेंगदाणा': 'groundnut',
  'हरभरा': 'gram',
  'तूर': 'tur',
  'मूग': 'mung',
  'उडीद': 'urad',
  'केळी': 'banana',
  'आंबा': 'mango',
  'द्राक्षे': 'grape',
  'डाळिंब': 'pomegranate',
  'मोहरी': 'mustard',
  'सूर्यफूल': 'sunflower',
  'हळद': 'turmeric',
  'आले': 'ginger',
  'वांगी': 'brinjal',
  'भेंडी': 'okra',
  'कोबी': 'cabbage',
  'फ्लॉवर': 'cauliflower',
  'बटाटा': 'potato',

  // Hindi (हिंदी)
  'कपास': 'cotton', 'रुई': 'cotton',
  'धान': 'rice', 'चावल': 'rice',
  'गेहूं': 'wheat', 'गेहूँ': 'wheat',
  'गन्ना': 'sugarcane', 'ईख': 'sugarcane',
  'मक्का': 'maize',
  'टमाटर': 'tomato',
  'प्याज': 'onion',
  'मिर्च': 'chilli',
  'मूंगफली': 'groundnut',
  'चना': 'gram',
  'अरहर': 'tur',
  'केला': 'banana',
  'आम': 'mango',
  'अंगूर': 'grape',
  'अनार': 'pomegranate',
  'सरसों': 'mustard',
  'सूरजमुखी': 'sunflower',
  'अदरक': 'ginger',
  'आलू': 'potato',
  'बैंगन': 'brinjal',
  'भिंडी': 'okra',
  'बंदगोभी': 'cabbage',
  'फूलगोभी': 'cauliflower',
  'सोयाबीन': 'soybean',
};

const CANONICAL_SET = new Set(Object.values(ALIAS_TO_CANONICAL));

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize any crop name/code/vernacular to the DB canonical
 * lower_snake_case full name. Returns 'all' for unknown/empty input.
 */
export function normalizeCropCode(raw: string | undefined | null): string {
  if (!raw || String(raw).trim() === '') return 'all';

  const trimmed = String(raw).trim();
  // Devanagari / non-ASCII direct match (case unchanged)
  if (ALIAS_TO_CANONICAL[trimmed]) return ALIAS_TO_CANONICAL[trimmed];

  // Lowercase + snake_case
  const lc = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  if (ALIAS_TO_CANONICAL[lc]) return ALIAS_TO_CANONICAL[lc];
  if (CANONICAL_SET.has(lc)) return lc;

  console.warn(`[CropCodeNormalizer] Unknown crop: "${raw}", returning 'all'`);
  return 'all';
}

/**
 * Get the canonical DB crop code (lowercase full name). Kept for back-compat
 * with callers that expected "full name from short code"; now both inputs and
 * outputs are the same canonical lowercase full name.
 */
export function getFullCropName(input: string | undefined | null): string {
  return normalizeCropCode(input);
}

/**
 * Variants to feed into PostgREST `.in()` / `.or()` queries. Always lowercase
 * and always includes 'all' so universal rules are picked up.
 */
export function getCropCodeVariants(raw: string | undefined | null): string[] {
  const canonical = normalizeCropCode(raw);
  const variants = new Set<string>([canonical, 'all']);
  return Array.from(variants);
}

/**
 * Normalize an observation_code to DB canonical (lower_snake_case).
 */
export function normalizeObservationCode(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Normalize a growth_stage value to DB canonical (lower_snake_case).
 * Use stage-normalizer.ts for the full alias mapping; this is the boundary
 * helper for raw inputs.
 */
export function normalizeGrowthStage(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Intent codes are the ONE exception to lowercase — they remain UPPER_SNAKE
 * (e.g. PEST_DAMAGE_REPORT, BORER_IDENTIFICATION).
 */
export function normalizeIntentCode(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_');
}
