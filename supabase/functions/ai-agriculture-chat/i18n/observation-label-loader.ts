// CHANGE LOG
// 2026-07-09 21:15 UTC — DEFAULT_CLARIFICATION_CODES neutralized to [].
//   Removes the universal INSECTS/YELLOW/SPOTS/STUNTED trio that the
//   clarification renderer and multi-match detector were injecting for
//   every farmer question regardless of intent/crop/stage. Options must
//   now come exclusively from the hypothesis-graph clarification
//   contract; renderer already handles empty[] by returning a neutral
//   photo-only prompt.
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
 * Strip technical artifacts (Latin binomials, parenthetical scientific names,
 * trailing "— Pathogen + Pathogen" clauses) from a label that may have been
 * sourced from `description_text`. Defensive safety net so chips never render
 * with scientific jargon even if a future caller passes the long form.
 */
export function stripTechnicalArtifacts(text: string): string {
  if (!text) return '';
  let out = text;
  // Remove "— ...Latin..." or "- ...Latin..." trailing clause when it contains a Latin word
  out = out.replace(/\s*[—–-]\s*[^—–\-()]*\b[A-Z][a-z]+\s+[a-z]+\b[^—–\-()]*$/u, '');
  // Remove parenthetical Latin binomials e.g. "(Dicladispa armigera)"
  out = out.replace(/\s*\(\s*[A-Z][a-z]+\s+[a-z]+[^)]*\)/gu, '');
  // Collapse whitespace
  out = out.replace(/\s{2,}/g, ' ').trim();
  // If we accidentally emptied it, return original
  return out || text.trim();
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
    // CANONICAL-CONTEXT FIX: observation_translations.observation_code is stored
    // LOWERCASE in the DB (verified: 5145/5145 rows lowercase, 0 uppercase).
    // Runtime carries codes in UPPERCASE, so an `.in(upperCodes)` filter returned
    // zero rows and every label fell back to the raw "TUNGRO YELLOW STUNT" form
    // — the single source of English leakage to mr/hi users. Query both cases
    // and match case-insensitively so the loader is canonical-case-agnostic.
    const upperCodes = observationCodes.map(c => c.toUpperCase());
    const lowerCodes = observationCodes.map(c => c.toLowerCase());
    const queryCodes = Array.from(new Set([...upperCodes, ...lowerCodes]));
    const normalizedLanguage = (language || 'en').toLowerCase();

    const { data: translations, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text')
      .in('observation_code', queryCodes)
      .eq('language_code', normalizedLanguage);

    if (error) {
      console.error(`   ❌ DB error: ${error.message}`);
    }

    // Build map from database results.
    // FIX (BUG A): `display_text` is the short, farmer-friendly chip label
    // (e.g. "भात कोलमडले"). `description_text` is an agronomic note that
    // frequently contains Latin pathogen names / virus IDs / pesticide hints
    // and is appropriate only as a tooltip. The previous heuristic that
    // promoted the longer field made chips render as full sentences with
    // Latin names. Priority is now strictly: display_text → description_text
    // → language-aware code fallback. description_text is preserved as the
    // secondary field for tooltips.
    for (const code of observationCodes) {
      const upperCode = code.toUpperCase();
      const translation = translations?.find(
        (t: any) => (t.observation_code || '').toUpperCase() === upperCode
      );
      const icon = OBSERVATION_ICONS[upperCode] || '❓';

      if (translation) {
        const display = (translation.display_text || '').trim();
        const desc = (translation.description_text || '').trim();
        const chip = stripTechnicalArtifacts(display || desc) ||
                     formatCodeAsLabel(upperCode, normalizedLanguage);

        labelMap.set(upperCode, {
          observation_code: upperCode,
          display_text: chip,
          description_text: desc,
          icon
        });
      } else {
        labelMap.set(upperCode, {
          observation_code: upperCode,
          display_text: formatCodeAsLabel(upperCode, normalizedLanguage),
          description_text: '',
          icon
        });
        console.warn(`   ⚠️ [OBS_LABEL_GAP] No ${normalizedLanguage} translation for ${upperCode} — using code fallback (seed observation_translations)`);
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

// ─────────────────────────────────────────────────────────────────────────
// CHANGE LOG
// 2026-07-09 21:15 UTC — Neutralized DEFAULT_CLARIFICATION_CODES to [].
//   Root cause of "every clarification shows the same INSECTS_VISIBLE /
//   LEAF_YELLOWING / LEAF_SPOTS trio regardless of intent, crop or stage":
//   this static list was used as a universal fallback by clarification-
//   renderer.getContextAwareTemplateFromDB and generic-multi-match-detector,
//   bypassing the hypothesis-graph clarification contract. Empty array
//   forces every caller through loadClarificationCandidates (hypothesis
//   graph) or the neutral photo-only prompt. Neuro-symbolic invariant:
//   farmer options MUST originate from hypothesis_master ×
//   hypothesis_conditions × observation_master for the locked (intent,
//   crop, stage, DAS) cell — never from a hardcoded TypeScript array.
// ─────────────────────────────────────────────────────────────────────────
export const DEFAULT_CLARIFICATION_CODES: readonly string[] = Object.freeze([]);

export default {
  loadObservationLabels,
  getObservationIcon,
  formatCodeAsLabel,
  DEFAULT_CLARIFICATION_CODES,
  OBSERVATION_LOADER_VERSION
};
