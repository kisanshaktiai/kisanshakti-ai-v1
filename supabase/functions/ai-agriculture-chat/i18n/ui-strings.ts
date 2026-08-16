// UI STRINGS — farmer-facing chrome text resolved through the i18n path only.
//
// CHANGE LOG (newest first)
//   2026-08-16 08:20 UTC — FIX 1 (mode tap never saved): the app sends the
//     LABEL text, not the i18n key, so MODE_OPTION_VALUES[label] always missed.
//     Added normalizeChip / uiKeyForDisplayText / resolveTappedFarmingMode /
//     resolveTappedPreference — label→ui_key resolution across every loaded
//     language (ui_translations + SEED), key-first, label fallback.
//   2026-08-15 17:45 UTC — Farming-mode system: land-scoped mode taxonomy
//     (`land_crops.farming_type`), DB-first resolution through `ui_translations`
//     (loadUiTranslations), mode<->preference mapping helpers and MODE_OPTION
//     values for the badge/sheet + PREFERENCE_UPDATE chip. No agronomic content.
//   2026-08-15 09:40 UTC — NEW: DB-first resolver for the organic-preference
//     flow keys (DOC 1 / FIX 1 + FIX 2). Resolution order:
//       1. ui_translations (DB SSOT)
//       2. translation cache (observation_translations / decision_rules i18n_key)
//       3. spec-provided seed copy below
//     No agronomic content lives here — chrome/UI copy only.

import { getTranslation } from './translation-loader.ts';

export type UiStringKey =
  | 'preference.organic_ask'
  | 'preference.organic_always'
  | 'preference.organic_only'
  | 'preference.organic_never'
  | 'preference.saved_confirm'
  | 'preference.confirm_land_ask'
  | 'preference.saved_land_confirm'
  | 'mode.chemical'
  | 'mode.mixed'
  | 'mode.organic'
  | 'mode.chemical_desc'
  | 'mode.mixed_desc'
  | 'mode.organic_desc'
  | 'mode.scope_note'
  | 'common.yes'
  | 'common.no'
  | 'advisory.organic_header'
  | 'advisory.chemical_alt_header'
  | 'advisory.organic_same'
  | 'advisory.organic_teaser'
  | 'advisory.show_chemical_ask'
  | 'advisory.no_organic_available';


/**
 * Seed copy taken verbatim from the approved i18n seed list (DOC 1 / FIX 3).
 * The DB always wins once the same keys exist in the translation cache.
 */
const SEED: Record<UiStringKey, Record<string, string>> = {
  'preference.organic_ask': {
    mr: 'तुम्हाला जैविक (सेंद्रिय) पर्यायही हवा असतो का?',
    hi: 'क्या आपको जैविक (ऑर्गेनिक) विकल्प भी चाहिए?',
    en: 'Would you also like organic options?',
  },
  'preference.organic_always': {
    mr: 'हो, दोन्ही दाखवा',
    hi: 'हाँ, दोनों दिखाएँ',
    en: 'Yes, show both',
  },
  'preference.organic_only': {
    mr: 'फक्त जैविक',
    hi: 'सिर्फ़ जैविक',
    en: 'Organic only',
  },
  'preference.organic_never': {
    mr: 'नको, फक्त रासायनिक',
    hi: 'नहीं, सिर्फ़ रासायनिक',
    en: 'No, chemical only',
  },
  'preference.saved_confirm': {
    mr: 'तुमची निवड जतन केली आहे. पुढील सल्ले याप्रमाणे मिळतील.',
    hi: 'आपकी पसंद सहेज ली गई है। आगे की सलाह इसी अनुसार मिलेगी।',
    en: 'Your preference is saved. Future advice will follow it.',
  },
  'advisory.organic_header': {
    mr: '🌿 जैविक पर्याय',
    hi: '🌿 जैविक विकल्प',
    en: '🌿 Organic option',
  },
  'advisory.chemical_alt_header': {
    mr: '🧪 रासायनिक पर्याय (दुय्यम)',
    hi: '🧪 रासायनिक विकल्प (द्वितीयक)',
    en: '🧪 Chemical option (secondary)',
  },
  'advisory.organic_same': {
    mr: 'हा सल्ला जैविक शेतीसाठीही योग्य आहे',
    hi: 'यह सलाह जैविक खेती के लिए भी उपयुक्त है',
    en: 'This advice is also suitable for organic farming',
  },
  'advisory.no_organic_available': {
    mr: 'या समस्येसाठी जैविक पर्याय अजून उपलब्ध नाही',
    hi: 'इस समस्या के लिए जैविक विकल्प अभी उपलब्ध नहीं है',
    en: 'No organic option is available for this problem yet',
  },
  'advisory.organic_teaser': {
    mr: '🌿 जैविक पर्याय पहा',
    hi: '🌿 जैविक विकल्प देखें',
    en: '🌿 See organic option',
  },
  'advisory.show_chemical_ask': {
    mr: 'रासायनिक उपाय पाहायचा का?',
    hi: 'क्या रासायनिक उपाय देखना है?',
    en: 'See the chemical option?',
  },
  'preference.confirm_land_ask': {
    mr: 'या शेतासाठी 🌿 जैविक पर्याय नेहमी दाखवू?',
    hi: 'क्या इस खेत के लिए 🌿 जैविक विकल्प हमेशा दिखाएँ?',
    en: 'Always show 🌿 organic options for this land?',
  },
  'preference.saved_land_confirm': {
    mr: 'या शेतासाठी बदलले ✓',
    hi: 'इस खेत के लिए बदल दिया ✓',
    en: 'Updated for this land ✓',
  },
  'mode.chemical': { mr: 'रासायनिक', hi: 'रासायनिक', en: 'Chemical' },
  'mode.mixed': { mr: 'मिश्र', hi: 'मिश्रित', en: 'Mixed' },
  'mode.organic': { mr: 'जैविक', hi: 'जैविक', en: 'Organic' },
  'mode.chemical_desc': {
    mr: 'रासायनिक खते व औषधे वापरतो',
    hi: 'रासायनिक खाद व दवाएँ उपयोग करता हूँ',
    en: 'I use chemical fertilizers and pesticides',
  },
  'mode.mixed_desc': {
    mr: 'जैविक खते, पण औषधे रासायनिक',
    hi: 'जैविक खाद, पर दवाएँ रासायनिक',
    en: 'Organic fertilizers, chemical protection',
  },
  'mode.organic_desc': {
    mr: 'पूर्ण जैविक शेती करतो',
    hi: 'पूरी तरह जैविक खेती करता हूँ',
    en: 'Fully organic farming',
  },
  'mode.scope_note': {
    mr: 'हे फक्त या शेतासाठी लागू',
    hi: 'यह केवल इस खेत के लिए लागू',
    en: 'Applies to this land only',
  },
  'common.yes': { mr: 'हो', hi: 'हाँ', en: 'Yes' },
  'common.no': { mr: 'नाही', hi: 'नहीं', en: 'No' },
};

// ── ui_translations DB SSOT cache (chrome copy only) ─────────────────────────
const uiTranslations = new Map<string, string>();   // `${key}::${lang}` → text
let uiTranslationsLoadedAt = 0;
const UI_TTL_MS = 3_600_000;

/** Load the `ui_translations` table once per cold start (DB is SSOT). */
export async function loadUiTranslations(supabase: any): Promise<void> {
  if (Date.now() - uiTranslationsLoadedAt < UI_TTL_MS && uiTranslations.size > 0) return;
  try {
    const { data, error } = await supabase
      .from('ui_translations')
      .select('ui_key, language_code, display_text')
      .limit(1000);
    if (error) throw error;
    uiTranslations.clear();
    for (const row of data || []) {
      if (!row?.ui_key || !row?.language_code || !row?.display_text) continue;
      uiTranslations.set(`${row.ui_key}::${String(row.language_code).toLowerCase()}`, row.display_text);
    }
    uiTranslationsLoadedAt = Date.now();
    console.log(`🗂️ [UI_I18N] ui_translations loaded: ${uiTranslations.size} entries`);
  } catch (e) {
    console.warn('[UI_I18N] ui_translations load failed:', (e as Error).message);
  }
}

/** Resolve a UI string: ui_translations → translation cache → seed copy. */
export function getUiString(key: UiStringKey, language: string): string {
  const lang = (language || 'en').toLowerCase();
  const fromUi = uiTranslations.get(`${key}::${lang}`) || uiTranslations.get(`${key}::en`);
  if (fromUi) return fromUi;

  const fromDb = getTranslation(key, lang);
  // getTranslation() returns a de-underscored key echo when nothing is cached.
  const keyEcho = key.toUpperCase().replace(/[.\s-]+/g, '_').replace(/_/g, ' ');
  if (fromDb && fromDb.toUpperCase() !== keyEcho.toUpperCase()) {
    return fromDb;
  }
  const seeded = SEED[key];
  return seeded?.[lang] || seeded?.en || '';
}

export type FarmingPreference = 'unset' | 'conventional' | 'organic' | 'integrated';

/** Land-scoped taxonomy stored in `land_crops.farming_type` (DB SSOT). */
export type FarmingMode = 'unset' | 'fertilizer_pesticide' | 'organic_fertilizer' | 'organic_only';

export function normalizeFarmingPreference(value: unknown): FarmingPreference {
  const v = (value ?? '').toString().trim().toLowerCase();
  if (v === 'conventional' || v === 'organic' || v === 'integrated') return v;
  return 'unset';
}

export function normalizeFarmingMode(value: unknown): FarmingMode {
  const v = (value ?? '').toString().trim().toLowerCase();
  if (v === 'fertilizer_pesticide' || v === 'organic_fertilizer' || v === 'organic_only') return v;
  return 'unset';
}

/** farmers.farming_preference → land-mode taxonomy (fallback leg of the chain). */
export function preferenceToFarmingMode(pref: FarmingPreference): FarmingMode {
  switch (pref) {
    case 'organic': return 'organic_only';
    case 'integrated': return 'organic_fertilizer';
    case 'conventional': return 'fertilizer_pesticide';
    default: return 'unset';
  }
}

/** Land mode → the preference token the response builder already understands. */
export function farmingModeToPreference(mode: FarmingMode): FarmingPreference {
  switch (mode) {
    case 'organic_only': return 'organic';
    case 'organic_fertilizer': return 'integrated';
    case 'fertilizer_pesticide': return 'conventional';
    default: return 'unset';
  }
}

/** i18n key of the badge label for a mode. */
export function modeLabelKey(mode: FarmingMode): UiStringKey {
  switch (mode) {
    case 'organic_only': return 'mode.organic';
    case 'organic_fertilizer': return 'mode.mixed';
    default: return 'mode.chemical';
  }
}

/** Option values shipped with the one-time preference chip. */
export const PREFERENCE_OPTION_VALUES: Record<string, FarmingPreference> = {
  'preference.organic_always': 'integrated',
  'preference.organic_only': 'organic',
  'preference.organic_never': 'conventional',
};

/** Mode chip / sheet values (land-scoped write to land_crops.farming_type). */
export const MODE_OPTION_VALUES: Record<string, FarmingMode> = {
  'mode.chemical': 'fertilizer_pesticide',
  'mode.mixed': 'organic_fertilizer',
  'mode.organic': 'organic_only',
};

// ── FIX 1: tap resolution by LABEL (chips send display text, not keys) ───────

/** Trim, drop leading emoji/pictographs, collapse whitespace, lowercase Latin. */
export function normalizeChip(text: string): string {
  return (text ?? '')
    .toString()
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200D}✓✔•·]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** All languages we have copy for (DB rows + seed). */
function knownLanguages(): string[] {
  const langs = new Set<string>(['en']);
  for (const k of uiTranslations.keys()) {
    const lang = k.split('::')[1];
    if (lang) langs.add(lang);
  }
  for (const key of Object.keys(SEED) as UiStringKey[]) {
    for (const lang of Object.keys(SEED[key])) langs.add(lang);
  }
  return [...langs];
}

/**
 * Map a tapped display label back to its ui_key by comparing normalized copy
 * for the farmer language first, then every other known language.
 * Table/SEED-driven only — no hardcoded phrase lists.
 */
export function uiKeyForDisplayText(
  normalizedLabel: string,
  candidateKeys: string[],
  language: string,
): string | null {
  if (!normalizedLabel) return null;
  const primary = (language || 'en').toLowerCase();
  const langs = [primary, ...knownLanguages().filter((l) => l !== primary)];
  for (const lang of langs) {
    for (const key of candidateKeys) {
      const label = normalizeChip(getUiString(key as UiStringKey, lang));
      if (label && label === normalizedLabel) return key;
    }
  }
  return null;
}

const MODE_KEYS = Object.keys(MODE_OPTION_VALUES);
const PREFERENCE_KEYS = Object.keys(PREFERENCE_OPTION_VALUES);

/** Resolve a tapped chip/sheet message (key OR label, any language) → mode. */
export function resolveTappedFarmingMode(message: string, language: string): FarmingMode | null {
  const raw = (message ?? '').toString().trim();
  if (!raw) return null;
  if (MODE_OPTION_VALUES[raw]) return MODE_OPTION_VALUES[raw];

  const norm = normalizeChip(raw);
  const key = uiKeyForDisplayText(norm, MODE_KEYS, language);
  if (key) return MODE_OPTION_VALUES[key] ?? null;

  const pkey = uiKeyForDisplayText(norm, PREFERENCE_KEYS, language);
  if (pkey) return preferenceToFarmingMode(PREFERENCE_OPTION_VALUES[pkey]);

  return null;
}

/** Resolve a tapped preference chip (key OR label, any language) → preference. */
export function resolveTappedPreference(message: string, language: string): FarmingPreference | null {
  const raw = (message ?? '').toString().trim();
  if (!raw) return null;
  if (PREFERENCE_OPTION_VALUES[raw]) return PREFERENCE_OPTION_VALUES[raw];

  const norm = normalizeChip(raw);
  const pkey = uiKeyForDisplayText(norm, PREFERENCE_KEYS, language);
  return pkey ? PREFERENCE_OPTION_VALUES[pkey] : null;
}
