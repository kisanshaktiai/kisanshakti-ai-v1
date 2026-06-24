/**
 * Step 7 — Post-harvest residue management + crop rotation suggestions.
 *
 * Deterministic, DB-free static rotation rules grouped by crop family.
 * Returns localized suggestions for next crop and residue handling tip
 * derived from the just-harvested crop name.
 *
 * All advice is intentionally generic & safe — never chemical recommendations.
 * Per memory: agronomic advice originates from DB. These are NEXT-CROP IDEAS
 * (operational hints), not pest/nutrition prescriptions, so they live in code.
 */

export type CropFamily =
  | 'cereal_rice'
  | 'cereal_wheat'
  | 'cereal_maize'
  | 'cereal_millet'
  | 'legume'
  | 'oilseed'
  | 'cotton'
  | 'sugarcane'
  | 'solanaceae'
  | 'cucurbit'
  | 'brassica'
  | 'allium'
  | 'unknown';

interface NextCropSuggestion {
  crop: string; // canonical crop name (English)
  reason_key: string; // i18n key for the reason
}

interface FamilyProfile {
  family: CropFamily;
  residue_tip_key: string;
  suggestions: NextCropSuggestion[];
}

// Normalizer: free-text crop → family. Accepts English + common
// Devanagari/regional tokens. Lowercase substring match.
const FAMILY_PATTERNS: Array<{ family: CropFamily; patterns: RegExp }> = [
  { family: 'sugarcane', patterns: /sugarcane|गन्ना|ऊस|ईख|கரும்பு|చెరకు/i },
  { family: 'cereal_rice', patterns: /\b(rice|paddy)\b|धान|चावल|तांदूळ|भात|அரிசி|నెల్/i },
  { family: 'cereal_wheat', patterns: /wheat|गेहूं|गहू|कणक/i },
  { family: 'cereal_maize', patterns: /maize|corn|मक्का|मका|मकई/i },
  { family: 'cereal_millet', patterns: /millet|sorghum|jowar|bajra|ragi|ज्वार|बाजरा|रागी/i },
  {
    family: 'legume',
    patterns:
      /\b(gram|chickpea|chana|tur|arhar|moong|urad|lentil|masoor|soybean|groundnut|peanut|peas?)\b|चना|मूंग|उड़द|अरहर|मसूर|सोयाबीन|मूंगफली|वाटाणा/i,
  },
  { family: 'oilseed', patterns: /mustard|sunflower|sesame|safflower|सरसों|सूरजमुखी|तिल/i },
  { family: 'cotton', patterns: /cotton|कपास|कापूस/i },
  { family: 'solanaceae', patterns: /tomato|potato|brinjal|eggplant|chil[il]i|टमाटर|आलू|बैंगन|मिर्च/i },
  { family: 'cucurbit', patterns: /cucumber|pumpkin|gourd|watermelon|खीरा|कद्दू|तरबूज/i },
  { family: 'brassica', patterns: /cabbage|cauliflower|broccoli|पत्ता गोभी|फूल गोभी/i },
  { family: 'allium', patterns: /onion|garlic|shallot|प्याज|कांदा|लहसुन/i },
];

export function detectCropFamily(crop: string | null | undefined): CropFamily {
  if (!crop) return 'unknown';
  for (const { family, patterns } of FAMILY_PATTERNS) {
    if (patterns.test(crop)) return family;
  }
  return 'unknown';
}

// Rotation matrix — for each previous family, what to plant next + why.
const PROFILES: Record<CropFamily, FamilyProfile> = {
  sugarcane: {
    family: 'sugarcane',
    residue_tip_key: 'residue.sugarcane',
    suggestions: [
      { crop: 'Green gram', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Wheat', reason_key: 'rotation.breaks_pest_cycle' },
    ],
  },
  cereal_rice: {
    family: 'cereal_rice',
    residue_tip_key: 'residue.rice',
    suggestions: [
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Mustard', reason_key: 'rotation.different_root_depth' },
      { crop: 'Wheat', reason_key: 'rotation.classic_pair' },
    ],
  },
  cereal_wheat: {
    family: 'cereal_wheat',
    residue_tip_key: 'residue.cereal',
    suggestions: [
      { crop: 'Green gram', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Soybean', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Maize', reason_key: 'rotation.summer_alt' },
    ],
  },
  cereal_maize: {
    family: 'cereal_maize',
    residue_tip_key: 'residue.cereal',
    suggestions: [
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Wheat', reason_key: 'rotation.classic_pair' },
      { crop: 'Mustard', reason_key: 'rotation.different_root_depth' },
    ],
  },
  cereal_millet: {
    family: 'cereal_millet',
    residue_tip_key: 'residue.cereal',
    suggestions: [
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Groundnut', reason_key: 'rotation.fixes_nitrogen' },
    ],
  },
  legume: {
    family: 'legume',
    residue_tip_key: 'residue.legume',
    suggestions: [
      { crop: 'Wheat', reason_key: 'rotation.uses_residual_n' },
      { crop: 'Rice', reason_key: 'rotation.uses_residual_n' },
      { crop: 'Maize', reason_key: 'rotation.uses_residual_n' },
    ],
  },
  oilseed: {
    family: 'oilseed',
    residue_tip_key: 'residue.cereal',
    suggestions: [
      { crop: 'Wheat', reason_key: 'rotation.classic_pair' },
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
    ],
  },
  cotton: {
    family: 'cotton',
    residue_tip_key: 'residue.cotton',
    suggestions: [
      { crop: 'Groundnut', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Wheat', reason_key: 'rotation.breaks_pest_cycle' },
    ],
  },
  solanaceae: {
    family: 'solanaceae',
    residue_tip_key: 'residue.veg',
    suggestions: [
      { crop: 'Green gram', reason_key: 'rotation.different_family' },
      { crop: 'Onion', reason_key: 'rotation.different_family' },
      { crop: 'Cabbage', reason_key: 'rotation.different_family' },
    ],
  },
  cucurbit: {
    family: 'cucurbit',
    residue_tip_key: 'residue.veg',
    suggestions: [
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Wheat', reason_key: 'rotation.different_family' },
    ],
  },
  brassica: {
    family: 'brassica',
    residue_tip_key: 'residue.veg',
    suggestions: [
      { crop: 'Green gram', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Wheat', reason_key: 'rotation.different_family' },
    ],
  },
  allium: {
    family: 'allium',
    residue_tip_key: 'residue.veg',
    suggestions: [
      { crop: 'Tomato', reason_key: 'rotation.different_family' },
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
    ],
  },
  unknown: {
    family: 'unknown',
    residue_tip_key: 'residue.generic',
    suggestions: [
      { crop: 'Chickpea', reason_key: 'rotation.fixes_nitrogen' },
      { crop: 'Wheat', reason_key: 'rotation.classic_pair' },
    ],
  },
};

export function getPostHarvestSuggestion(crop: string | null | undefined): FamilyProfile {
  return PROFILES[detectCropFamily(crop)];
}
