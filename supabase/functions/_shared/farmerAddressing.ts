// FARMER ADDRESSING — Presentation-layer respectful honorifics

export type Gender = 'male' | 'female' | 'other' | 'unknown';

export interface FarmerProfileLite {
  farmer_id: string;
  farmer_name?: string | null;
  language?: string | null;   // language_preference from farmers
  gender?: Gender | null;     // from user_profiles
  state?: string | null;      // from user_profiles
  /** farmers.farming_preference — 'unset' | 'conventional' | 'organic' | 'integrated' */
  farming_preference?: string | null;
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

function pickSet(language: string, state?: string | null): { set: HonorificSet; fromState: boolean } {
  const st = normalizeState(state);
  if (st && STATE_HONORIFICS[st]) return { set: STATE_HONORIFICS[st], fromState: true };
  return { set: LANGUAGE_FALLBACK[language] || LANGUAGE_FALLBACK.en, fromState: false };
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

// Build the addressing payload + LLM directive.
// Rewritten 2026-09-04: the directive is now driven by the farmer's REGION and
// LANGUAGE, and asks the model to use the customary respectful rural form of
// address of that region itself. Reason: when the state was unknown the old
// directive handed the model the English fallback "farmer friend", which it then
// transliterated into the farmer's script ("फार्मर फ्रेंड") — the exact failure
// the no-transliteration rule exists to prevent. The honorific table is kept as
// a SUGGESTION only when the farmer's own state matched it; a language-level
// fallback is never presented as the farmer's word.
export function getFarmerAddressing(p: {
  language?: string | null;
  state?: string | null;
  district?: string | null;
  gender?: Gender | null;
  farmer_name?: string | null;
}): FarmerAddressing {
  const language = (p.language || 'en').toLowerCase();
  const gender: Gender = (p.gender || 'unknown') as Gender;
  const { set, fromState } = pickSet(language, p.state);

  let pool: string[];
  if (gender === 'male') pool = set.male;
  else if (gender === 'female') pool = set.female;
  else pool = set.neutral;

  const primary = pool[0];
  const alternatives = pool.slice(1);
  const nameClause = p.farmer_name
    ? `Farmer's name is "${p.farmer_name}" — you MAY use it sparingly (max once) after the form of address. Never overuse the name.`
    : `Farmer's name is not available — use the form of address alone.`;
  const region = [p.district, p.state].filter(Boolean).join(', ') || 'unknown';
  const suggestion = fromState
    ? `- Customary forms in this state (use if they fit; pick by gender): "${primary}"${alternatives.length ? `, ${alternatives.map((a) => `"${a}"`).join(', ')}` : ''}. ${set.toneHint}`
    : `- No verified regional form is on file. Choose the form yourself as a village extension officer of this region who speaks this language would.`;

  const directive = `
═══ FARMER ADDRESSING (PRESENTATION-LAYER ONLY) ═══
Greet and address the farmer the way a respected village extension officer of the farmer's own region would, in the farmer's language.

- Language of the conversation: ${language}
- Farmer's region: ${region}
- Gender: ${gender}${gender === 'unknown' ? ' (unknown — use a gender-neutral respectful form that farmers in this region use)' : ''}
${suggestion}
- ${nameClause}

USAGE RULES (strict):
1. Open the response with that form of address — naturally, like an elder or officer greeting a farmer in the village — and you MAY reuse it 1–2 more times in the body where it sounds natural; never in every sentence.
2. The form of address MUST be a word that farmers of this region actually use in ${language}, written in the native script of ${language}. NEVER a literal translation of an English phrase (no equivalent of "farmer friend", "dear farmer", "respected farmer"), NEVER an English word written in the local script, NEVER formal or literary honorifics, and never a generic "farmer".
3. This addressing is PRESENTATION-ONLY. It MUST NOT change the diagnosis, products, dosages, timing, safety warnings, or any decision content.
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

// Load farmer profile (gender from user_profiles, name+language from farmers).
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
        .select('farmer_name, language_preference, farming_preference')
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
      lite.farming_preference = farmer.farming_preference || 'unset';
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
