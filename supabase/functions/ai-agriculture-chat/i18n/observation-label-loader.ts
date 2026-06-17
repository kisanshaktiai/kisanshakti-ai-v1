/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OBSERVATION LABEL LOADER - SSOT-COMPLIANT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Loads observation display labels from observation_translations table.
 * Falls back to formatted English code if translation missing.
 * NEVER returns hardcoded regional text - all text from database.
 * 
 * @version 1.0.0
 */

export const OBSERVATION_LOADER_VERSION = '1.0.0';

// Icon mapping (visual symbols are language-neutral)
const OBSERVATION_ICONS: Record<string, string> = {
  // Pest-related
  'INSECTS_VISIBLE': '🐛',
  'LARVAE_PRESENT': '🐛',
  'LARVAE_VISIBLE': '🐛',
  'APHIDS_PRESENT': '🐛',
  'WHITEFLY_PRESENT': '🦟',
  'MEALYBUG_PRESENT': '🐛',
  'BORERS_PRESENT': '🐛',
  'TERMITES_PRESENT': '🐜',
  'MUD_TUBES_PRESENT': '🏠',
  'HONEYDEW_PRESENT': '✨',
  'FRASS_VISIBLE': '💩',
  
  // Damage patterns
  'DEAD_HEART_PRESENT': '💀',
  'DEAD_HEART': '💀',
  'STEM_BORING_MARKS': '🕳️',
  'TUNNELS_IN_SOIL': '🕳️',
  'SETT_EASILY_PULLED_OUT': '🌱',
  'CHEWING_DAMAGE': '🦗',
  
  // Leaf symptoms
  'LEAF_YELLOWING': '🍂',
  'LEAF_WILTING': '🥀',
  'LEAF_SPOTS': '🦠',
  'LEAF_CURLING': '🌀',
  'LEAF_BROWNING': '🍂',
  'WHITE_POWDERY_GROWTH': '🤍',
  
  // Growth issues
  'STUNTED_PLANTS': '📉',
  'STUNTED_GROWTH': '📉',
  'SLOW_GROWTH': '📉',
  'POOR_TILLERING': '🌾',
  
  // Root/soil issues
  'ROOT_ROTTED': '🪵',
  'ROOT_DAMAGE': '🪵',
  'FIELD_WATERLOGGED': '💧',
  'SOIL_TOO_DRY': '🏜️',
  
  // Photo/general
  'PHOTO_REQUEST': '📷',
  'UNKNOWN': '❓'
};

export interface ObservationLabel {
  observation_code: string;
  display_text: string;
  description_text: string;
  icon: string;
}

/**
 * Load observation labels from database for given codes and language
 * SSOT: All display text comes from observation_translations table
 */
export async function loadObservationLabels(
  supabaseClient: any,
  observationCodes: string[],
  language: string
): Promise<Map<string, ObservationLabel>> {
  console.log(`📖 [ObservationLoader v${OBSERVATION_LOADER_VERSION}] Loading ${observationCodes.length} labels in ${language}`);
  
  const labelMap = new Map<string, ObservationLabel>();
  
  if (!observationCodes || observationCodes.length === 0) {
    return labelMap;
  }
  
  try {
    const upperCodes = observationCodes.map(c => c.toUpperCase());
    const normalizedLanguage = (language || 'en').toLowerCase();

    // CASE-INSENSITIVE LOOKUP (2026-06-17 bug fix):
    // observation_translations.observation_code is stored lowercase canonical;
    // upstream pipelines emit UPPERCASE. Query both casings so the loader
    // actually returns farmer-friendly text instead of falling back to the
    // raw code label.
    const dualCaseCodes = Array.from(new Set([
      ...upperCodes,
      ...upperCodes.map(c => c.toLowerCase()),
    ]));

    const { data: translations, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text')
      .in('observation_code', dualCaseCodes)
      .eq('language_code', normalizedLanguage);

    if (error) {
      console.error(`   ❌ DB error: ${error.message}`);
    }

    // Build map from database results
    // CRITICAL FIX: Prefer description_text (farmer-friendly) over display_text (technical term)
    // when description_text is available and substantive (>10 chars)
    for (const code of observationCodes) {
      const upperCode = code.toUpperCase();
      const translation = translations?.find(
        (t: any) => (t.observation_code || '').toUpperCase() === upperCode
      );
      const icon = OBSERVATION_ICONS[upperCode] || '❓';

      if (translation) {
        // Use description_text as display if it's more descriptive (farmer-friendly)
        // description_text describes WHAT FARMER SEES, display_text is often a technical term
        const hasGoodDescription = translation.description_text &&
          translation.description_text.length > 10 &&
          translation.description_text.length > (translation.display_text?.length || 0);

        labelMap.set(upperCode, {
          observation_code: upperCode,
          display_text: hasGoodDescription ? translation.description_text : translation.display_text,
          description_text: hasGoodDescription ? translation.display_text : (translation.description_text || ''),
          icon
        });
      } else {
        // Fallback: DO NOT generate English phrase for non-English UI.
        // This avoids mixed-language symptom lists (e.g., Marathi UI + "Dead Heart").
        labelMap.set(upperCode, {
          observation_code: upperCode,
          display_text: formatCodeAsLabel(upperCode, normalizedLanguage),
          description_text: '',
          icon
        });
        console.warn(`   ⚠️ No translation found for ${upperCode} in ${normalizedLanguage} - using code fallback`);
      }
    }

    console.log(`   ✅ Loaded ${labelMap.size} labels from database`);

  } catch (err) {
    console.error(`   ❌ Exception in loadObservationLabels: ${err}`);

    // On error, still return a safe fallback so UI doesn't break
    for (const code of observationCodes) {
      const upperCode = code.toUpperCase();
      labelMap.set(upperCode, {
        observation_code: upperCode,
        display_text: formatCodeAsLabel(upperCode, (language || 'en').toLowerCase()),
        description_text: '',
        icon: OBSERVATION_ICONS[upperCode] || '❓'
      });
    }
  }

  return labelMap;
}

/**
 * Format observation code as human-readable label
 * - en: STUNTED_GROWTH → Stunted Growth
 * - non-en: STUNTED_GROWTH → STUNTED GROWTH (avoid mixing English into Marathi/Hindi UI)
 */
function formatCodeAsLabel(code: string, language: string): string {
  if (language !== 'en') {
    return code.replace(/_/g, ' ');
  }

  return code
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get icon for an observation code (language-neutral)
 */
export function getObservationIcon(code: string): string {
  return OBSERVATION_ICONS[code.toUpperCase()] || '❓';
}

// Default observation codes for generic clarification (canonical symbols)
export const DEFAULT_CLARIFICATION_CODES = [
  'INSECTS_VISIBLE',
  'LEAF_YELLOWING',
  'LEAF_SPOTS',
  'STUNTED_GROWTH',
  'PHOTO_REQUEST'
];

export default {
  loadObservationLabels,
  getObservationIcon,
  formatCodeAsLabel,
  DEFAULT_CLARIFICATION_CODES,
  OBSERVATION_LOADER_VERSION
};
