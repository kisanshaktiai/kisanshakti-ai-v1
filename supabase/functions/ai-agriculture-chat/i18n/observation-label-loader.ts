// CHANGE LOG
// 2026-07-26 17:10 UTC — RC-2/RC-3: label map is now keyed by canonicalObsCode
// OBSERVATION LABEL LOADER - SSOT-COMPLIANT

export const OBSERVATION_LOADER_VERSION = '1.0.0';

import { canonicalObsCode, canonicalCropCode } from '../utils/canonical-code.ts';

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

// Strip technical artifacts (Latin binomials, parenthetical scientific names,
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

// Load observation labels from database for given codes and language
export async function loadObservationLabels(
  supabaseClient: any,
  observationCodes: string[],
  language: string,
  cropCode?: string | null,
): Promise<Map<string, ObservationLabel>> {
  console.log(`📖 [ObservationLoader v${OBSERVATION_LOADER_VERSION}] Loading ${observationCodes.length} labels in ${language}`);

  const labelMap = new Map<string, ObservationLabel>();

  if (!observationCodes || observationCodes.length === 0) {
    return labelMap;
  }

  // RC-2 (2026-07-26) — canonical-code SSOT. `observation_translations`
  const setBoth = (canon: string, value: ObservationLabel) => {
    labelMap.set(canon, value);
    const upper = canon.toUpperCase();
    if (upper !== canon) labelMap.set(upper, value);
  };

  try {
    const canonCodes = Array.from(new Set(observationCodes.map((c) => canonicalObsCode(c)).filter(Boolean)));
    const normalizedLanguage = (language || 'en').toLowerCase();
    const crop = canonicalCropCode(cropCode);

    // Query canonical (lower_snake) codes only — that is the DB truth.
    const { data: translations, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text, crop_code')
      .in('observation_code', canonCodes)
      .eq('language_code', normalizedLanguage);

    if (error) {
      console.error(`   ❌ DB error: ${error.message}`);
    }

    // RC-3 — crop-aware selection: a crop-specific row wins over a
    // crop-agnostic one; rows for a DIFFERENT crop are ignored entirely.
    const pickTranslation = (canon: string) => {
      const rows = (translations ?? []).filter(
        (t: any) => canonicalObsCode(t.observation_code) === canon,
      );
      if (rows.length === 0) return null;
      const own = crop ? rows.find((t: any) => canonicalCropCode(t.crop_code) === crop) : null;
      if (own) return own;
      const agnostic = rows.find((t: any) => !t.crop_code);
      if (agnostic) return agnostic;
      return crop ? null : rows[0];
    };

    // `display_text` is the short farmer-facing chip label; `description_text`
    for (const code of observationCodes) {
      const canon = canonicalObsCode(code);
      if (!canon) continue;
      const translation = pickTranslation(canon);
      const icon = OBSERVATION_ICONS[canon.toUpperCase()] || '❓';

      if (translation) {
        const display = (translation.display_text || '').trim();
        const desc = (translation.description_text || '').trim();
        const chip = stripTechnicalArtifacts(display || desc) ||
                     formatCodeAsLabel(canon, normalizedLanguage);

        setBoth(canon, {
          observation_code: canon,
          display_text: chip,
          description_text: desc,
          icon,
        });
      } else {
        setBoth(canon, {
          observation_code: canon,
          display_text: formatCodeAsLabel(canon, normalizedLanguage),
          description_text: '',
          icon,
        });
        console.warn(`   ⚠️ [OBS_LABEL_GAP] No ${normalizedLanguage} translation for ${canon} (crop=${crop || 'any'}) — using code fallback (seed observation_translations)`);
      }
    }

    console.log(`   ✅ Loaded ${labelMap.size} label keys from database`);

  } catch (err) {
    console.error(`   ❌ Exception in loadObservationLabels: ${err}`);

    // On error, still return a safe fallback so UI doesn't break
    for (const code of observationCodes) {
      const canon = canonicalObsCode(code);
      if (!canon) continue;
      setBoth(canon, {
        observation_code: canon,
        display_text: formatCodeAsLabel(canon, (language || 'en').toLowerCase()),
        description_text: '',
        icon: OBSERVATION_ICONS[canon.toUpperCase()] || '❓',
      });
    }
  }

  return labelMap;
}


// Format observation code as human-readable label
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

// Get icon for an observation code (language-neutral)
export function getObservationIcon(code: string): string {
  return OBSERVATION_ICONS[code.toUpperCase()] || '❓';
}

// ─────────────────────────────────────────────────────────────────────────
// CHANGE LOG
// 2026-07-09 21:15 UTC — Neutralized DEFAULT_CLARIFICATION_CODES to [].
export const DEFAULT_CLARIFICATION_CODES: string[] = [];

export default {
  loadObservationLabels,
  getObservationIcon,
  formatCodeAsLabel,
  DEFAULT_CLARIFICATION_CODES,
  OBSERVATION_LOADER_VERSION
};
