// ═══════════════════════════════════════════════════════════════════════════
// FARMER ADDRESSING — Presentation-layer respectful honorifics
// ───────────────────────────────────────────────────────────────────────────
// Returns rural, culturally-respectful addressing words for an Indian farmer
// based on language + state + gender. This is consumed ONLY by the LLM
// presentation/narration layer. It does NOT influence symbolic brain logic,
// rules, dosages, intents, or any decision output.
// ═══════════════════════════════════════════════════════════════════════════

export type Gender = 'male' | 'female' | 'other' | 'unknown';

export interface FarmerProfileLite {
  farmer_id: string;
  farmer_name?: string | null;
  language?: string | null;   // language_preference from farmers
  gender?: Gender | null;     // from user_profiles
  state?: string | null;      // from user_profiles
}

interface HonorificSet {
  /** Primary words to address the farmer (1–3 acceptable choices, most respectful first). */
  male: string[];
  female: string[];
  /** Neutral / unknown-gender respectful fallback. */
  neutral: string[];
  /** Short cultural tone note for the LLM (in English, never shown to farmer). */
  toneHint: string;
}

// State → preferred honorific set. Keyed by lowercase state name (and common variants).
const STATE_HONORIFICS: Record<string, HonorificSet> = {
  // ── Marathi belt
  maharashtra: {
    male: ['दादा', 'भाऊ', 'काका'],
    female: ['ताई', 'माई', 'अक्का'],
    neutral: ['शेतकरी मित्र'],
    toneHint: 'Warm Marathi village tone; use "दादा/भाऊ" for men and "ताई/माई" for women. Avoid formal "श्रीयुत/प्रिय".',
  },
  // ── Hindi belt (UP, MP, Bihar, Rajasthan, Haryana, Jharkhand, Chhattisgarh, Uttarakhand, HP, Delhi)
  'uttar pradesh': {
    male: ['भैया', 'भाई साहब', 'चाचा'],
    female: ['बहन जी', 'दीदी', 'चाची'],
    neutral: ['किसान भाई'],
    toneHint: 'Respectful rural Hindi (UP/Awadhi flavor); prefer "भैया/भाई साहब" for men, "बहन जी/दीदी" for women.',
  },
  bihar: {
    male: ['भैया', 'भाई', 'चाचा'],
    female: ['दीदी', 'बहन', 'चाची'],
    neutral: ['किसान भाई'],
    toneHint: 'Bhojpuri-influenced rural Hindi; warm village elder tone.',
  },
  'madhya pradesh': {
    male: ['भैया', 'भाई साहब', 'दादा'],
    female: ['दीदी', 'बहन जी'],
    neutral: ['किसान भाई'],
    toneHint: 'Central Hindi; respectful rural farming tone.',
  },
  chhattisgarh: {
    male: ['भैया', 'भाई', 'दादा'],
    female: ['दीदी', 'बहन'],
    neutral: ['किसान भाई'],
    toneHint: 'Chhattisgarhi-flavored rural Hindi.',
  },
  jharkhand: {
    male: ['भैया', 'भाई', 'दादा'],
    female: ['दीदी', 'बहन'],
    neutral: ['किसान भाई'],
    toneHint: 'Eastern rural Hindi tone.',
  },
  rajasthan: {
    male: ['भाईसा', 'दादा', 'भैया'],
    female: ['बाईसा', 'दीदी', 'बहन जी'],
    neutral: ['किसान भाई'],
    toneHint: 'Rajasthani respect: "भाईसा/बाईसा" are warmly respectful; otherwise standard Hindi honorifics.',
  },
  haryana: {
    male: ['भाई', 'ताऊ', 'भैया'],
    female: ['बहन', 'ताई', 'दीदी'],
    neutral: ['किसान भाई'],
    toneHint: 'Haryanvi village tone; "ताऊ/ताई" carry strong rural respect.',
  },
  uttarakhand: {
    male: ['दाज्यू', 'भैया', 'भाई'],
    female: ['दीदी', 'बहन जी'],
    neutral: ['किसान भाई'],
    toneHint: 'Kumaoni/Garhwali rural respect; "दाज्यू" for elder brother is warm and authentic.',
  },
  'himachal pradesh': {
    male: ['भाई जी', 'भैया'],
    female: ['बहन जी', 'दीदी'],
    neutral: ['किसान भाई'],
    toneHint: 'Pahari-flavored polite Hindi.',
  },
  delhi: {
    male: ['भाई साहब', 'भैया'],
    female: ['बहन जी', 'दीदी'],
    neutral: ['किसान भाई'],
    toneHint: 'Standard polite Hindi.',
  },

  // ── Punjab
  punjab: {
    male: ['ਵੀਰ ਜੀ', 'ਭਾਅ ਜੀ', 'ਸਰਦਾਰ ਜੀ'],
    female: ['ਭੈਣ ਜੀ', 'ਬੀਬੀ ਜੀ'],
    neutral: ['ਕਿਸਾਨ ਵੀਰ'],
    toneHint: 'Warm Punjabi village tone; "ਵੀਰ ਜੀ/ਭਾਅ ਜੀ" for men, "ਭੈਣ ਜੀ/ਬੀਬੀ ਜੀ" for women.',
  },

  // ── Gujarat
  gujarat: {
    male: ['ભાઈ', 'દાદા', 'કાકા'],
    female: ['બેન', 'દીદી', 'કાકી'],
    neutral: ['ખેડૂત ભાઈ'],
    toneHint: 'Gujarati village warmth: "ભાઈ" for men, "બેન" for women — both deeply respectful.',
  },

  // ── South — Tamil Nadu
  'tamil nadu': {
    male: ['அண்ணா', 'ஐயா', 'தம்பி'],
    female: ['அக்கா', 'அம்மா', 'தங்கச்சி'],
    neutral: ['விவசாயி நண்பரே'],
    toneHint: 'Tamil rural respect; "அண்ணா/ஐயா" for men, "அக்கா/அம்மா" for women.',
  },
  puducherry: {
    male: ['அண்ணா', 'ஐயா'],
    female: ['அக்கா', 'அம்மா'],
    neutral: ['விவசாயி நண்பரே'],
    toneHint: 'Tamil rural respect.',
  },
  // ── Andhra / Telangana
  'andhra pradesh': {
    male: ['అన్నయ్యా', 'అన్నా', 'బాబాయ్'],
    female: ['అక్కా', 'అమ్మా'],
    neutral: ['రైతు మిత్రమా'],
    toneHint: 'Telugu rural respect: "అన్నయ్యా/అన్నా" for men, "అక్కా/అమ్మా" for women.',
  },
  telangana: {
    male: ['అన్నా', 'అన్నయ్యా', 'మామా'],
    female: ['అక్కా', 'అమ్మా'],
    neutral: ['రైతు మిత్రమా'],
    toneHint: 'Telangana rural Telugu tone.',
  },
  // ── Karnataka
  karnataka: {
    male: ['ಅಣ್ಣಾ', 'ಅಣ್ಣಯ್ಯ', 'ಚಿಕ್ಕಪ್ಪ'],
    female: ['ಅಕ್ಕಾ', 'ಅಮ್ಮಾ', 'ತಂಗಿ'],
    neutral: ['ರೈತ ಮಿತ್ರರೇ'],
    toneHint: 'Kannada rural respect.',
  },
  // ── Kerala
  kerala: {
    male: ['ചേട്ടാ', 'അണ്ണാ'],
    female: ['ചേച്ചീ', 'അക്കാ'],
    neutral: ['കർഷക സുഹൃത്തേ'],
    toneHint: 'Malayalam warm rural tone; "ചേട്ടാ" for men, "ചേച്ചീ" for women.',
  },

  // ── East
  'west bengal': {
    male: ['দাদা', 'ভাই'],
    female: ['দিদি', 'বোন'],
    neutral: ['কৃষক ভাই'],
    toneHint: 'Bengali rural respect; "দাদা" for men, "দিদি" for women.',
  },
  odisha: {
    male: ['ଭାଇ', 'ଦାଦା'],
    female: ['ଭଉଣୀ', 'ଆପା'],
    neutral: ['କୃଷକ ଭାଇ'],
    toneHint: 'Odia rural respect.',
  },
  assam: {
    male: ['দাদা', 'ককাইদেউ'],
    female: ['বাইদেউ', 'বা'],
    neutral: ['কৃষক ভাই'],
    toneHint: 'Assamese rural respect; "ককাইদেউ/বাইদেউ" are warmly respectful.',
  },
};

// Language-level fallback when state is unknown or not mapped.
const LANGUAGE_FALLBACK: Record<string, HonorificSet> = {
  hi: STATE_HONORIFICS['uttar pradesh'],
  mr: STATE_HONORIFICS['maharashtra'],
  pa: STATE_HONORIFICS['punjab'],
  gu: STATE_HONORIFICS['gujarat'],
  ta: STATE_HONORIFICS['tamil nadu'],
  te: STATE_HONORIFICS['andhra pradesh'],
  kn: STATE_HONORIFICS['karnataka'],
  ml: STATE_HONORIFICS['kerala'],
  bn: STATE_HONORIFICS['west bengal'],
  or: STATE_HONORIFICS['odisha'],
  as: STATE_HONORIFICS['assam'],
  en: {
    male: ['brother', 'sir'],
    female: ['sister', 'madam'],
    neutral: ['farmer friend'],
    toneHint: 'Warm, respectful rural English tone (avoid "Dear farmer"/"Respected farmer").',
  },
  ur: {
    male: ['بھائی', 'بھائی صاحب'],
    female: ['بہن', 'باجی'],
    neutral: ['کسان بھائی'],
    toneHint: 'Respectful rural Urdu tone.',
  },
};

function normalizeState(s?: string | null): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function pickSet(language: string, state?: string | null): HonorificSet {
  const st = normalizeState(state);
  if (st && STATE_HONORIFICS[st]) return STATE_HONORIFICS[st];
  return LANGUAGE_FALLBACK[language] || LANGUAGE_FALLBACK.en;
}

export interface FarmerAddressing {
  primary: string;            // Single most-preferred honorific
  alternatives: string[];     // Other acceptable honorifics
  gender: Gender;
  language: string;
  state: string | null;
  toneHint: string;
  /** Ready-to-inject directive for the LLM system prompt (English). */
  promptDirective: string;
}

/**
 * Build the addressing payload + LLM directive.
 * Pure / presentation-only — NEVER use this to alter decisions.
 */
export function getFarmerAddressing(p: {
  language?: string | null;
  state?: string | null;
  gender?: Gender | null;
  farmer_name?: string | null;
}): FarmerAddressing {
  const language = (p.language || 'en').toLowerCase();
  const gender: Gender = (p.gender || 'unknown') as Gender;
  const set = pickSet(language, p.state);

  let pool: string[];
  if (gender === 'male') pool = set.male;
  else if (gender === 'female') pool = set.female;
  else pool = set.neutral;

  const primary = pool[0];
  const alternatives = pool.slice(1);
  const nameClause = p.farmer_name
    ? `Farmer's name is "${p.farmer_name}" — you MAY use it sparingly (max once) prefixed with the honorific (e.g. "${primary} ${p.farmer_name}"). Never overuse the name.`
    : `Farmer's name is not available — use the honorific alone.`;

  const directive = `
═══ FARMER ADDRESSING (PRESENTATION-LAYER ONLY) ═══
Address the farmer using rural, culturally-respectful honorific words appropriate to their state and gender.

- Language: ${language}
- State: ${p.state || 'unknown'}
- Gender: ${gender}
- Preferred honorific: "${primary}"
- Acceptable alternatives: ${alternatives.length ? alternatives.map((a) => `"${a}"`).join(', ') : '(none)'}
- Tone: ${set.toneHint}
- ${nameClause}

USAGE RULES (strict):
1. Open the response with the preferred honorific (or an alternative) — naturally, like a village elder/officer greeting the farmer.
2. You MAY reuse the honorific 1–2 more times in the body when it sounds natural; do NOT sprinkle it in every sentence.
3. NEVER use formal/literary forms like "प्रिय किसान", "Respected farmer", "Dear farmer", "श्रीयुत", "Mr./Mrs.", or generic "farmer".
4. NEVER translate the honorific into English or another language — keep it in the native script of ${language}.
5. This addressing is PRESENTATION-ONLY. It MUST NOT change the diagnosis, products, dosages, timing, safety warnings, or any decision content.
═══════════════════════════════════════════════════`.trim();

  return {
    primary,
    alternatives,
    gender,
    language,
    state: p.state || null,
    toneHint: set.toneHint,
    promptDirective: directive,
  };
}

/**
 * Load farmer profile (gender from user_profiles, name+language from farmers).
 * Best-effort: never throws — returns a minimal profile on failure.
 */
export async function loadFarmerProfileLite(
  supabase: any,
  farmerId: string,
  fallbackLanguage = 'en',
): Promise<FarmerProfileLite> {
  const lite: FarmerProfileLite = {
    farmer_id: farmerId,
    language: fallbackLanguage,
    gender: 'unknown',
    state: null,
    farmer_name: null,
  };
  if (!farmerId || !supabase) return lite;

  try {
    const [{ data: farmer }, { data: profile }] = await Promise.all([
      supabase
        .from('farmers')
        .select('farmer_name, language_preference')
        .eq('id', farmerId)
        .maybeSingle(),
      supabase
        .from('user_profiles')
        .select('gender, state, full_name')
        .eq('id', farmerId)
        .maybeSingle(),
    ]);

    if (farmer) {
      lite.farmer_name = farmer.farmer_name || lite.farmer_name;
      lite.language = farmer.language_preference || lite.language;
    }
    if (profile) {
      const g = (profile.gender || '').toString().toLowerCase();
      lite.gender = (g === 'male' || g === 'female' || g === 'other') ? (g as Gender) : 'unknown';
      lite.state = profile.state || null;
      lite.farmer_name = lite.farmer_name || profile.full_name || null;
    }
  } catch (e) {
    console.warn('[farmerAddressing] profile load failed:', (e as Error).message);
  }

  return lite;
}
