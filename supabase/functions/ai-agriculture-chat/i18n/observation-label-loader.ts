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

const toCanonical = (s: string): string =>
  String(s ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');

/**
 * Load observation labels from database for given codes and language
 * SSOT: All display text comes from observation_translations table.
 *
 * Map is keyed by BOTH canonical lower_snake_case and UPPER_SNAKE_CASE forms
 * so legacy callers that still pass UPPER keys keep working while we migrate.
 * Returned ObservationLabel.observation_code is the canonical lower form.
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
    const canonicalCodes = observationCodes.map(toCanonical);
    const normalizedLanguage = (language || 'en').toLowerCase();

    // Back-compat: observation_translations.observation_code is canonical lower,
    // but some legacy seed rows may still be UPPER. Query both shapes.
    const dualCaseCodes = Array.from(new Set<string>([
      ...canonicalCodes,
      ...canonicalCodes.map(c => c.toUpperCase()),
    ]));

    const { data: translations, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text')
      .in('observation_code', dualCaseCodes)
      .eq('language_code', normalizedLanguage);

    if (error) {
      console.error(`   ❌ DB error: ${error.message}`);
    }

    // Telemetry canary — if seed data ever inverts again (display longer than
    // description across the board), warn so we catch a future migration drift.
    if (translations && translations.length > 0) {
      let invertedRows = 0;
      for (const t of translations) {
        const d = (t.display_text || '').length;
        const r = (t.description_text || '').length;
        if (d > 0 && r > 0 && d > r) invertedRows++;
      }
      if (invertedRows / translations.length > 0.5) {
        console.warn(
          `🚨 [ObservationLoader] Possible seed inversion: ${invertedRows}/${translations.length} rows have display_text longer than description_text`
        );
      }
    }

    for (let i = 0; i < observationCodes.length; i++) {
      const originalCode = observationCodes[i];
      const canonical = canonicalCodes[i];
      const upper = canonical.toUpperCase();
      const translation = translations?.find(
        (t: any) => toCanonical(t.observation_code || '') === canonical
      );
      const icon = OBSERVATION_ICONS[upper] || '❓';

      let label: ObservationLabel;
      if (translation) {
        // NO SWAP. display_text = the observation (short farmer-friendly noun
        // phrase, what farmer actually sees in the field). description_text =
        // the cause / explanatory context. The UI renders display_text as the
        // primary clarification option; never invert them, or the farmer sees
        // a sentence about WHY instead of WHAT to look at.
        label = {
          observation_code: canonical,
          display_text: translation.display_text || translation.description_text || canonical,
          description_text: translation.description_text || '',
          icon,
        };
      } else {
        // Fallback: DO NOT generate English phrase for non-English UI.
        label = {
          observation_code: canonical,
          display_text: formatCodeAsLabel(upper, normalizedLanguage),
          description_text: '',
          icon,
        };
        console.warn(`   ⚠️ No translation found for ${canonical} in ${normalizedLanguage} - using code fallback`);
      }

      // Register under canonical lower, UPPER, and the original caller-supplied
      // form so every existing lookup site resolves regardless of casing.
      labelMap.set(canonical, label);
      labelMap.set(upper, label);
      if (originalCode && originalCode !== canonical && originalCode !== upper) {
        labelMap.set(originalCode, label);
      }
    }

    console.log(`   ✅ Loaded ${labelMap.size} label keys from database`);

  } catch (err) {
    console.error(`   ❌ Exception in loadObservationLabels: ${err}`);

    for (const code of observationCodes) {
      const canonical = toCanonical(code);
      const upper = canonical.toUpperCase();
      const fallback: ObservationLabel = {
        observation_code: canonical,
        display_text: formatCodeAsLabel(upper, (language || 'en').toLowerCase()),
        description_text: '',
        icon: OBSERVATION_ICONS[upper] || '❓',
      };
      labelMap.set(canonical, fallback);
      labelMap.set(upper, fallback);
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
