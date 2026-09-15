/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TTS LANGUAGE CATALOGUE — single source of truth
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every part of the app that needs to turn an app language into a speech
 * locale reads it from here. Before this file existed the mapping was
 * duplicated in five places with different coverage, and the short ones sent
 * unlisted languages to an English voice.
 *
 * Nothing here is a claim about any particular handset. Device availability is
 * always read from the device at runtime.
 */

export interface LanguageEntry {
  code: string;        // BCP-47 speech locale
  name: string;        // English name
  nativeName: string;  // the language's own name
  script: string;      // writing system key, used to forbid cross-script fallback
}

/** The 14 languages the app ships, plus additional Indian languages it can speak. */
export const TTS_LANGUAGES: Record<string, LanguageEntry> = {
  hi:  { code: 'hi-IN',  name: 'Hindi',           nativeName: 'हिंदी',        script: 'deva' },
  en:  { code: 'en-IN',  name: 'English (India)', nativeName: 'English',      script: 'latn' },
  pa:  { code: 'pa-IN',  name: 'Punjabi',         nativeName: 'ਪੰਜਾਬੀ',       script: 'guru' },
  mr:  { code: 'mr-IN',  name: 'Marathi',         nativeName: 'मराठी',        script: 'deva' },
  ta:  { code: 'ta-IN',  name: 'Tamil',           nativeName: 'தமிழ்',        script: 'taml' },
  te:  { code: 'te-IN',  name: 'Telugu',          nativeName: 'తెలుగు',       script: 'telu' },
  gu:  { code: 'gu-IN',  name: 'Gujarati',        nativeName: 'ગુજરાતી',      script: 'gujr' },
  kn:  { code: 'kn-IN',  name: 'Kannada',         nativeName: 'ಕನ್ನಡ',        script: 'knda' },
  ml:  { code: 'ml-IN',  name: 'Malayalam',       nativeName: 'മലയാളം',       script: 'mlym' },
  or:  { code: 'or-IN',  name: 'Odia',            nativeName: 'ଓଡ଼ିଆ',        script: 'orya' },
  as:  { code: 'as-IN',  name: 'Assamese',        nativeName: 'অসমীয়া',      script: 'beng' },
  ur:  { code: 'ur-IN',  name: 'Urdu',            nativeName: 'اردو',         script: 'arab' },
  sa:  { code: 'sa-IN',  name: 'Sanskrit',        nativeName: 'संस्कृतम्',     script: 'deva' },
  bn:  { code: 'bn-IN',  name: 'Bengali',         nativeName: 'বাংলা',        script: 'beng' },

  // Additional Indian languages the speech layer can address when a device has them.
  mai: { code: 'mai-IN', name: 'Maithili',        nativeName: 'मैथिली',       script: 'deva' },
  ne:  { code: 'ne-IN',  name: 'Nepali',          nativeName: 'नेपाली',       script: 'deva' },
  kok: { code: 'kok-IN', name: 'Konkani',         nativeName: 'कोंकणी',       script: 'deva' },
  doi: { code: 'doi-IN', name: 'Dogri',           nativeName: 'डोगरी',        script: 'deva' },
  bh:  { code: 'bh-IN',  name: 'Bhojpuri',        nativeName: 'भोजपुरी',      script: 'deva' },
  raj: { code: 'raj-IN', name: 'Rajasthani',      nativeName: 'राजस्थानी',    script: 'deva' },
  awa: { code: 'awa-IN', name: 'Awadhi',          nativeName: 'अवधी',         script: 'deva' },
  mag: { code: 'mag-IN', name: 'Magahi',          nativeName: 'मगही',         script: 'deva' },
  hne: { code: 'hne-IN', name: 'Chhattisgarhi',   nativeName: 'छत्तीसगढ़ी',   script: 'deva' },
  gom: { code: 'gom-IN', name: 'Goan Konkani',    nativeName: 'गोंयची कोंकणी', script: 'deva' },
  bo:  { code: 'bo-IN',  name: 'Bodo',            nativeName: 'बड़ो',          script: 'deva' },
  mni: { code: 'mni-IN', name: 'Manipuri',        nativeName: 'মৈতৈলোন্',     script: 'beng' },
  sat: { code: 'sat-IN', name: 'Santali',         nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',      script: 'olck' },
  ks:  { code: 'ks-IN',  name: 'Kashmiri',        nativeName: 'کٲشُر',        script: 'arab' },
  sd:  { code: 'sd-IN',  name: 'Sindhi',          nativeName: 'سنڌي',         script: 'arab' },
};

/**
 * Fallback chain used only when the device has no voice for the requested
 * language. A hop is taken only when the target shares the same script, so a
 * farmer never hears one script read by a voice built for another.
 */
export const TTS_FALLBACK: Record<string, string> = {
  // Devanagari family
  mr: 'hi-IN', mai: 'hi-IN', bh: 'hi-IN', awa: 'hi-IN', mag: 'hi-IN',
  hne: 'hi-IN', raj: 'hi-IN', sa: 'hi-IN', ne: 'hi-IN', doi: 'hi-IN',
  kok: 'hi-IN', gom: 'hi-IN', bo: 'hi-IN',
  // Bengali-Assamese family
  as: 'bn-IN', mni: 'bn-IN',
  // Perso-Arabic family
  ks: 'ur-IN', sd: 'ur-IN',
};

export function baseOf(tag: string): string {
  return (tag || '').split('-')[0].toLowerCase();
}

/** BCP-47 locale for an app language. Unknown languages keep their own base tag. */
export function toLocale(language: string): string {
  const base = baseOf(language);
  return TTS_LANGUAGES[base]?.code || (base ? `${base}-IN` : 'en-IN');
}

export function scriptOf(language: string): string | null {
  return TTS_LANGUAGES[baseOf(language)]?.script || null;
}

export function languageInfo(language: string): LanguageEntry | null {
  return TTS_LANGUAGES[baseOf(language)] || null;
}

/**
 * Resolve a requested language against a list of locales the device reports.
 * Returns null when nothing in the chain is present, so the caller can offer
 * the voice installer instead of speaking in the wrong language.
 */
export function resolveAgainstDevice(
  language: string,
  deviceLocales: string[]
): { locale: string; isFallback: boolean } | null {
  const requested = toLocale(language);
  const requestedScript = scriptOf(language);

  const has = (locale: string) => {
    const base = baseOf(locale);
    return deviceLocales.some((d) => {
      const dl = d.toLowerCase();
      return dl === locale.toLowerCase() || baseOf(dl) === base;
    });
  };

  if (has(requested)) return { locale: requested, isFallback: false };

  let cursor = baseOf(language);
  for (let hop = 0; hop < 4; hop++) {
    const next = TTS_FALLBACK[cursor];
    if (!next) break;

    const nextScript = scriptOf(next);
    if (requestedScript && nextScript && nextScript !== requestedScript) break;

    if (has(next)) return { locale: next, isFallback: true };
    cursor = baseOf(next);
  }

  return null;
}
