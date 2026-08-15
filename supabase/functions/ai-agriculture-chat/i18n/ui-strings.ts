// UI STRINGS — farmer-facing chrome text resolved through the i18n path only.
//
// CHANGE LOG (newest first)
//   2026-08-15 09:40 UTC — NEW: DB-first resolver for the organic-preference
//     flow keys (DOC 1 / FIX 1 + FIX 2). Resolution order:
//       1. translation cache (observation_translations / decision_rules i18n_key)
//       2. spec-provided seed copy below (used only until the DBA seeds DOC 2/3)
//     No agronomic content lives here — chrome/UI copy only.

import { getTranslation } from './translation-loader.ts';

export type UiStringKey =
  | 'preference.organic_ask'
  | 'preference.organic_always'
  | 'preference.organic_only'
  | 'preference.organic_never'
  | 'preference.saved_confirm'
  | 'advisory.organic_header'
  | 'advisory.chemical_alt_header'
  | 'advisory.organic_same'
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
};

/** Resolve a UI string: DB translation cache first, seed copy as fallback. */
export function getUiString(key: UiStringKey, language: string): string {
  const lang = (language || 'en').toLowerCase();
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

export function normalizeFarmingPreference(value: unknown): FarmingPreference {
  const v = (value ?? '').toString().trim().toLowerCase();
  if (v === 'conventional' || v === 'organic' || v === 'integrated') return v;
  return 'unset';
}

/** Option values shipped with the one-time preference chip. */
export const PREFERENCE_OPTION_VALUES: Record<string, FarmingPreference> = {
  'preference.organic_always': 'integrated',
  'preference.organic_only': 'organic',
  'preference.organic_never': 'conventional',
};
