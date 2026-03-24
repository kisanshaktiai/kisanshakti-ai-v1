/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REGIONAL AGRICULTURAL TRANSLATOR (v3.0.0) - DB-DRIVEN VERSION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Translates agricultural terms to regional dialects based on farmer's location.
 * Uses observation_translations DB table via the i18n translation cache (SSOT).
 * 
 * v3.0.0 MIGRATION:
 * - Removed all hardcoded PEST_TRANSLATIONS dictionary (~320 lines)
 * - All labels now sourced from observation_translations DB table
 * - normalizePestName() retained (English-only pattern matching)
 * - Falls back to English if DB has no translation
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getTranslation, normalizeI18nKey } from '../i18n/translation-loader.ts';

export const REGIONAL_TRANSLATOR_VERSION = '3.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface FarmerLocation {
  state: string;
  district: string;
  tehsil?: string;
  language: string;
}

export interface TreatmentToTranslate {
  pest_name_en: string;
  treatment_description_en: string;
  product_name_en?: string;
  method_en?: string;
}

export interface RegionalTranslation {
  pest_name_regional: string;
  treatment_label_regional: string;
  full_description_regional?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZE PEST NAME FOR DB LOOKUP
// CRITICAL: Extract core pest name from verbose database values
// Examples:
//   "Early Shoot Borer (Chilo infuscatellus) infestation" → "EARLY_SHOOT_BORER"
//   "SMUT_SEED_BORNE" → "SMUT"
//   "IPM prevention for Red Rot using hot water treatment" → "RED_ROT"
// ═══════════════════════════════════════════════════════════════════════════

function normalizePestName(name: string): string {
  let normalized = name
    .toLowerCase()
    .trim();
  
  // Remove parenthetical scientific names
  normalized = normalized.replace(/\([^)]*\)/g, '');
  
  // Remove common suffixes/prefixes
  const removePhrases = [
    'infestation', 'attack', 'damage', 'symptoms', 'problem',
    'ipm prevention for', 'ipm treatment for', 'using hot water treatment',
    'using biocontrol', 'most destructive', 'check for',
    'seed not germinated', 'dead heart present', 'insects visible',
    'seed borne', 'soil borne'
  ];
  for (const phrase of removePhrases) {
    normalized = normalized.replace(new RegExp(phrase, 'gi'), '');
  }
  
  // Convert to snake_case
  normalized = normalized
    .replace(/[\s-]+/g, '_')
    .replace(/['']/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  // Try known patterns to extract core pest name
  const knownPatterns: [RegExp, string][] = [
    [/early_?shoot_?borer/i, 'EARLY_SHOOT_BORER'],
    [/shoot_?borer/i, 'SHOOT_BORER'],
    [/stem_?borer/i, 'STEM_BORER'],
    [/internode_?borer/i, 'INTERNODE_BORER'],
    [/top_?borer/i, 'TOP_BORER'],
    [/root_?borer/i, 'ROOT_BORER'],
    [/termite/i, 'TERMITE'],
    [/red_?rot/i, 'RED_ROT'],
    [/smut/i, 'SMUT'],
    [/wilt/i, 'WILT'],
    [/root_?rot/i, 'ROOT_ROT'],
    [/whitefly/i, 'WHITEFLY'],
    [/aphid/i, 'APHID'],
    [/mealybug/i, 'MEALYBUG'],
    [/thrips/i, 'THRIPS'],
    [/bollworm/i, 'BOLLWORM'],
    [/pink_?bollworm/i, 'PINK_BOLLWORM'],
    [/american_?bollworm/i, 'AMERICAN_BOLLWORM'],
    [/leaf_?spot/i, 'LEAF_SPOT'],
    [/rust/i, 'RUST'],
    [/blight/i, 'BLIGHT'],
    [/powdery_?mildew/i, 'POWDERY_MILDEW'],
    [/downy_?mildew/i, 'DOWNY_MILDEW'],
    [/nitrogen/i, 'NITROGEN_DEFICIENCY'],
    [/phosphorus/i, 'PHOSPHORUS_DEFICIENCY'],
    [/potassium/i, 'POTASSIUM_DEFICIENCY'],
    [/iron/i, 'IRON_CHLOROSIS'],
    [/water_?stress/i, 'WATER_STRESS'],
    [/waterlog/i, 'WATERLOGGING'],
    [/dead_?heart/i, 'DEAD_HEART'],
    [/poor_?germination/i, 'POOR_GERMINATION'],
    [/lodging/i, 'LODGING'],
    [/grassy_?shoot/i, 'GRASSY_SHOOT'],
    [/leaf_?scald/i, 'LEAF_SCALD'],
    [/pokkah/i, 'POKKAH_BOENG'],
    [/ratoon_?stunting/i, 'RATOON_STUNTING'],
    [/mosaic/i, 'MOSAIC'],
    [/pyrilla/i, 'PYRILLA'],
    [/woolly_?aphid/i, 'WOOLLY_APHID'],
    [/scale_?insect/i, 'SCALE_INSECT'],
    [/frost/i, 'FROST_DAMAGE'],
    [/heat_?stress/i, 'HEAT_STRESS'],
  ];
  
  for (const [pattern, key] of knownPatterns) {
    if (pattern.test(normalized) || pattern.test(name)) {
      return key;
    }
  }
  
  // Return normalized uppercase key for DB lookup
  return normalizeI18nKey(normalized);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRANSLATION FUNCTION (DB-DRIVEN via i18n cache)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Translate agricultural terms to regional farmer vocabulary.
 * 
 * DB-DRIVEN: Uses observation_translations via i18n translation cache.
 * Falls back to English name if no DB entry found.
 */
export async function translateToRegionalTerms(
  treatment: TreatmentToTranslate,
  location: FarmerLocation
): Promise<RegionalTranslation> {
  const pestKey = normalizePestName(treatment.pest_name_en);
  const lang = location.language || 'mr';
  
  console.log(`\n🌍 [RegionalTranslator v${REGIONAL_TRANSLATOR_VERSION}] DB-driven lookup`);
  console.log(`   Input: "${treatment.pest_name_en}" → key: "${pestKey}"`);
  console.log(`   Language: ${lang}`);
  
  // Look up from observation_translations via i18n cache
  const dbTranslation = getTranslation(pestKey, lang);
  
  // Check if we got a real translation (not just the formatted key back)
  const formattedKey = pestKey.replace(/_/g, ' ');
  const isRealTranslation = dbTranslation && 
    dbTranslation !== formattedKey && 
    dbTranslation !== pestKey &&
    dbTranslation.length > 0;
  
  if (isRealTranslation) {
    console.log(`   ✅ DB translation found: "${dbTranslation}"`);
    return {
      pest_name_regional: dbTranslation,
      treatment_label_regional: dbTranslation
    };
  }
  
  // No DB translation - return English
  console.log(`   ⚠️ No DB translation for "${pestKey}" in "${lang}", using English`);
  return {
    pest_name_regional: treatment.pest_name_en,
    treatment_label_regional: treatment.treatment_description_en || treatment.pest_name_en
  };
}

/**
 * Batch translate multiple terms for efficiency.
 */
export async function batchTranslateTerms(
  terms: TreatmentToTranslate[],
  location: FarmerLocation
): Promise<RegionalTranslation[]> {
  const results: RegionalTranslation[] = [];
  
  for (const term of terms) {
    const translation = await translateToRegionalTerms(term, location);
    results.push(translation);
  }
  
  return results;
}

/**
 * Quick translate just the pest/cause name for option labels.
 */
export async function translatePestName(
  pestNameEn: string,
  location: FarmerLocation
): Promise<string> {
  const translation = await translateToRegionalTerms(
    { pest_name_en: pestNameEn, treatment_description_en: '' },
    location
  );
  return translation.pest_name_regional;
}
