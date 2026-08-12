// CHANGE LOG (newest first)
// 2026-08-08 — v1.1.0 — Two DB-verified fixes to farmer-label resolution:
//   (1) AGNOSTIC-TOKEN FIX: the crop-agnostic fallback tested `!t.crop_code`
//       (NULL/empty only). Live observation_translations now holds 0 NULL rows
//       and 3,115 rows with crop_code='all' (wildcard unified 'universal'→'all'
//       on 2026-08-08). `!('all')` is false, so the crop-agnostic fallback
//       matched ZERO rows: 60+ generic Marathi labels (general_yellowing,
//       chlorosis, interveinal_chlorosis…) were unreachable for any
//       crop-specific query. Now agnostic = {NULL, '', 'all', 'universal', '*'}
//       via isAgnostic(), aligned to crop_code_registry scope tokens.
//   (2) DUAL-LANGUAGE + FAIL-CLOSED: query now fetches the farmer language AND
//       'en' in one call; resolution order is crop-specific+lang →
//       agnostic+lang → crop-specific+en → agnostic+en. When nothing exists,
//       the entry is marked is_fallback=true (synthetic formatCodeAsLabel) and
//       [OBS_LABEL_MISSING] is logged, so the farmer-facing path
//       (diagnosis-first-generator) can DROP the option instead of showing a
//       raw snake_case code. Non-farmer consumers keep working unchanged — the
//       Map still contains every requested code (additive, non-breaking).
//   Signature, return type, and RC-3 crop-aware selection preserved. Verified
//   against live schema: observation_translations(observation_code,
//   language_code, display_text, description_text, crop_code).
// 2026-07-26 17:10 UTC — RC-2/RC-3: label map keyed by canonicalObsCode.
// OBSERVATION LABEL LOADER - SSOT-COMPLIANT

export const OBSERVATION_LOADER_VERSION = '1.1.0';

import { canonicalObsCode, canonicalCropCode } from '../utils/canonical-code.ts';

// Icon mapping (visual symbols are language-neutral)
const OBSERVATION_ICONS: Record<string, string> = {
  'INSECTS_VISIBLE': '🐛', 'LARVAE_PRESENT': '🐛', 'LARVAE_VISIBLE': '🐛',
  'APHIDS_PRESENT': '🐛', 'WHITEFLY_PRESENT': '🦟', 'MEALYBUG_PRESENT': '🐛',
  'BORERS_PRESENT': '🐛', 'TERMITES_PRESENT': '🐜', 'MUD_TUBES_PRESENT': '🏠',
  'HONEYDEW_PRESENT': '✨', 'FRASS_VISIBLE': '💩',
  'DEAD_HEART_PRESENT': '💀', 'DEAD_HEART': '💀', 'STEM_BORING_MARKS': '🕳️',
  'TUNNELS_IN_SOIL': '🕳️', 'SETT_EASILY_PULLED_OUT': '🌱', 'CHEWING_DAMAGE': '🦗',
  'LEAF_YELLOWING': '🍂', 'LEAF_WILTING': '🥀', 'LEAF_SPOTS': '🦠',
  'LEAF_CURLING': '🌀', 'LEAF_BROWNING': '🍂', 'WHITE_POWDERY_GROWTH': '🤍',
  'STUNTED_PLANTS': '📉', 'STUNTED_GROWTH': '📉', 'SLOW_GROWTH': '📉', 'POOR_TILLERING': '🌾',
  'ROOT_ROTTED': '🪵', 'ROOT_DAMAGE': '🪵', 'FIELD_WATERLOGGED': '💧', 'SOIL_TOO_DRY': '🏜️',
  'PHOTO_REQUEST': '📷', 'UNKNOWN': '❓',
};

export interface ObservationLabel {
  observation_code: string;
  display_text: string;
  description_text: string;
  icon: string;
  /** v1.1.0: true when display_text is a synthetic code fallback (no DB row
   *  in farmer language or English). Farmer-facing callers should DROP options
   *  whose label is_fallback; internal/debug callers may keep it. */
  is_fallback?: boolean;
  /** v1.1.0: which language the label actually resolved in ('mr'|'en'|…),
   *  or null when only a code fallback was available. Used by the
   *  clarification language-leak lock. */
  language_used?: string | null;
}

// Scope tokens that mean "applies to all crops" (mirrors crop_code_registry
// kind='scope'). A translation row carrying any of these is crop-agnostic.
function isAgnosticCrop(rawCropCode: unknown): boolean {
  const v = canonicalCropCode(rawCropCode); // '' for NULL/empty
  return v === '' || v === 'all' || v === 'universal' || v === '*';
}

// Strip technical artifacts (Latin binomials, trailing scientific clauses).
export function stripTechnicalArtifacts(text: string): string {
  if (!text) return '';
  let out = text;
  out = out.replace(/\s*[—–-]\s*[^—–\-()]*\b[A-Z][a-z]+\s+[a-z]+\b[^—–\-()]*$/u, '');
  out = out.replace(/\s*\(\s*[A-Z][a-z]+\s+[a-z]+[^)]*\)/gu, '');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out || text.trim();
}

// Load observation labels from database for given codes and language.
// v1.1.0: dual-language (farmer lang + en), agnostic-token aware, fail-closed flag.
export async function loadObservationLabels(
  supabaseClient: any,
  observationCodes: string[],
  language: string,
  cropCode?: string | null,
): Promise<Map<string, ObservationLabel>> {
  console.log(`📖 [ObservationLoader v${OBSERVATION_LOADER_VERSION}] Loading ${observationCodes.length} labels in ${language}`);

  const labelMap = new Map<string, ObservationLabel>();
  if (!observationCodes || observationCodes.length === 0) return labelMap;

  const setBoth = (canon: string, value: ObservationLabel) => {
    labelMap.set(canon, value);
    const upper = canon.toUpperCase();
    if (upper !== canon) labelMap.set(upper, value);
  };

  const normalizedLanguage = (language || 'en').toLowerCase();
  const crop = canonicalCropCode(cropCode); // '' when no crop context

  try {
    const canonCodes = Array.from(new Set(observationCodes.map((c) => canonicalObsCode(c)).filter(Boolean)));

    // v1.1.0: fetch farmer language AND English in a single round-trip.
    // language_code is now SELECTED (needed for per-row language priority).
    const wantLangs = Array.from(new Set([normalizedLanguage, 'en']));
    const { data: translations, error } = await supabaseClient
      .from('observation_translations')
      .select('observation_code, display_text, description_text, crop_code, language_code')
      .in('observation_code', canonCodes)
      .in('language_code', wantLangs);

    if (error) console.error(`   ❌ DB error: ${error.message}`);

    // Resolution priority (RC-3 crop-aware, v1.1.0 language-aware):
    //   crop-specific + farmer-lang
    //   crop-agnostic + farmer-lang   ('all'/'universal'/'*'/NULL)
    //   crop-specific + en
    //   crop-agnostic + en
    // Rows for a DIFFERENT crop are ignored entirely (RC-3).
    const pickTranslation = (canon: string): { row: any; lang: string } | null => {
      const rows = (translations ?? []).filter((t: any) => canonicalObsCode(t.observation_code) === canon);
      if (rows.length === 0) return null;

      const inLang = (L: string) => (t: any) => (t.language_code || '').toLowerCase() === L;
      const cropSpecific = (t: any) => !!crop && canonicalCropCode(t.crop_code) === crop;

      const tryLang = (L: string) => {
        const own = rows.find((t: any) => inLang(L)(t) && cropSpecific(t));
        if (own) return own;
        const agnostic = rows.find((t: any) => inLang(L)(t) && isAgnosticCrop(t.crop_code));
        if (agnostic) return agnostic;
        // No crop context at all: accept any row in this language as last resort.
        if (!crop) { const any = rows.find(inLang(L)); if (any) return any; }
        return null;
      };

      const inFarmer = tryLang(normalizedLanguage);
      if (inFarmer) return { row: inFarmer, lang: normalizedLanguage };
      if (normalizedLanguage !== 'en') {
        const inEn = tryLang('en');
        if (inEn) return { row: inEn, lang: 'en' };
      }
      return null;
    };

    for (const code of observationCodes) {
      const canon = canonicalObsCode(code);
      if (!canon) continue;
      const picked = pickTranslation(canon);
      const icon = OBSERVATION_ICONS[canon.toUpperCase()] || '❓';

      if (picked) {
        const display = (picked.row.display_text || '').trim();
        const desc = (picked.row.description_text || '').trim();
        const chip = stripTechnicalArtifacts(display || desc) || formatCodeAsLabel(canon, picked.lang);
        setBoth(canon, {
          observation_code: canon,
          display_text: chip,
          description_text: desc,
          icon,
          is_fallback: false,
          language_used: picked.lang,
        });
      } else {
        // Fail-closed marker: entry present (non-breaking) but flagged synthetic.
        setBoth(canon, {
          observation_code: canon,
          display_text: formatCodeAsLabel(canon, normalizedLanguage),
          description_text: '',
          icon,
          is_fallback: true,
          language_used: null,
        });
        console.warn(`   ⚠️ [OBS_LABEL_MISSING] code=${canon} lang=${normalizedLanguage} crop=${crop || 'any'} — no DB label in farmer language or English (seed observation_translations); farmer path will drop this option`);
      }
    }

    console.log(`   ✅ Loaded ${labelMap.size} label keys (${observationCodes.length} codes requested)`);
  } catch (err) {
    console.error(`   ❌ Exception in loadObservationLabels: ${err}`);
    // On error, still return safe (flagged) fallbacks so UI doesn't break.
    for (const code of observationCodes) {
      const canon = canonicalObsCode(code);
      if (!canon) continue;
      setBoth(canon, {
        observation_code: canon,
        display_text: formatCodeAsLabel(canon, normalizedLanguage),
        description_text: '',
        icon: OBSERVATION_ICONS[canon.toUpperCase()] || '❓',
        is_fallback: true,
        language_used: null,
      });
    }
  }

  return labelMap;
}

// Format observation code as human-readable label (last-resort synthetic).
function formatCodeAsLabel(code: string, language: string): string {
  if (language !== 'en') return code.replace(/_/g, ' ');
  return code
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Get icon for an observation code (language-neutral)
export function getObservationIcon(code: string): string {
  return OBSERVATION_ICONS[code.toUpperCase()] || '❓';
}

// 2026-07-09 21:15 UTC — Neutralized DEFAULT_CLARIFICATION_CODES to [].
export const DEFAULT_CLARIFICATION_CODES: string[] = [];

export default {
  loadObservationLabels,
  getObservationIcon,
  formatCodeAsLabel,
  stripTechnicalArtifacts,
  DEFAULT_CLARIFICATION_CODES,
  OBSERVATION_LOADER_VERSION,
};
