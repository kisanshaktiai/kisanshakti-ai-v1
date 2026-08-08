// ═══════════════════════════════════════════════════════════════════════════
// CROP CODE NORMALIZER — Single Source of Truth  (v2.0.0, 2026-08-08)
// ═══════════════════════════════════════════════════════════════════════════
// CANONICAL WIRE FORMAT (final decision, crop_code audit 2026-08-08):
//   lowercase snake_case values of  public.crops.value  (UNIQUE constraint).
//   e.g. 'sugarcane', 'cotton', 'pigeon_pea', 'green_gram', 'grapes'.
//
// WHAT CHANGED vs v1.0.0 (and why):
//   • v1 normalized to UPPERCASE SHORT codes ('SC','CTN','SOY','WHT'...) — a
//     third vocabulary matching NEITHER the DB (lowercase full names,
//     1,802/1,866 decision_rules verified) NOR the UPPER full-name literals
//     in agents. Short codes leaked into canonical_hint_mapping (42 rows) and
//     observation_translations (18 rows). v2 outputs the DB value directly.
//   • v1 mapped unknown crops to 'ALL' — silent scope escalation (a farmer
//     with an unrecognized crop received ALL-crop rules; Invariant-8
//     violation). v2 returns '' (falsy) so existing `|| undefined` / `|| ''`
//     guards route to clarification instead. Strict variant provided below.
//   • v1 targets 'TUR','GRAM','MUNG','URAD','GRP' do not exist in crops.value
//     (verified 2026-08-08: canonical are pigeon_pea, chickpea, green_gram,
//     black_gram, grapes). v2 maps aliases to the verified values.
//   • 'TURMERIC'/'HALDI' and 'GINGER'/'ADRAK' were mapped to codes ('TUR_C',
//     'GNG') that have NO row in crops master. v2 does NOT invent codes for
//     them — see UNREGISTERED_CROPS. Register them in public.crops first.
//   • 'PEPPER' alias removed: ambiguous between crops.value 'chilli' and
//     'capsicum' (both exist). Ambiguous input → clarification, not a guess.
//     ('MIRCHI'/'मिरची'/'मिर्च' remain → 'chilli'.)
//
// DROP-IN COMPATIBILITY (verified against live import graph, 182 files):
//   Exported symbols unchanged: CROP_CODE_NORMALIZER_VERSION,
//   normalizeCropCode(raw): string, getFullCropName(code): string,
//   getCropCodeVariants(raw): string[].
//   • orchestrator.ts calls `.toLowerCase()` on normalizeCropCode() output —
//     return type stays `string`; output is already lowercase (no-op).
//   • bundled-rules/loader.ts & layered-rule-evaluator.ts lowercase the
//     variants and match rule.crop_code — v2 variants now INCLUDE the
//     canonical lowercase value (v1 did not; matching only worked via the
//     legacy shotgun). Legacy SHORT/UPPER variants retained transitionally
//     so any contaminated DB rows still match until Phase-cleanup runs.
//   • getFullCropName keeps v1 behavior (UPPERCASE display name) — it is
//     DISPLAY-ONLY. Never write its output to any crop_code column.
// ═══════════════════════════════════════════════════════════════════════════

export const CROP_CODE_NORMALIZER_VERSION = '2.0.0';

// ─────────────────────────────────────────────────────────────────────────
// CANONICAL CODES — every value below verified present & active in
// public.crops.value on 2026-08-08. Do NOT add codes here without a
// corresponding crops-master row.
// ─────────────────────────────────────────────────────────────────────────
const CANONICAL_CODES = new Set<string>([
  'sugarcane', 'cotton', 'soybean', 'rice', 'wheat', 'maize',
  'tomato', 'onion', 'chilli', 'potato', 'brinjal',
  'groundnut', 'mustard', 'sunflower',
  'pigeon_pea', 'chickpea', 'green_gram', 'black_gram', 'lentil', 'cowpea',
  'bajra', 'jowar',
  'banana', 'grapes', 'pomegranate', 'mango', 'orange',
  'okra', 'cabbage', 'cauliflower', 'capsicum',
]);

// Sanctioned scope tokens (NOT crops; appear in DB by design:
// decision_rules 'all', observation_translations 'universal').
const SCOPE_TOKENS = new Set<string>(['all', 'universal', 'general', '*']);

// ─────────────────────────────────────────────────────────────────────────
// ALIAS MAP: any input spelling → canonical crops.value
// Sections: canonical passthrough · English · legacy v1 SHORT codes ·
// Marathi (verified vs crops.label_mr 2026-08-08) · Hindi.
// ─────────────────────────────────────────────────────────────────────────
const ALIAS_TO_CANONICAL: Record<string, string> = {
  // English full names & common variants
  'SUGARCANE': 'sugarcane', 'SUGAR_CANE': 'sugarcane', 'CANE': 'sugarcane', 'GANNA': 'sugarcane',
  'COTTON': 'cotton', 'KAPAS': 'cotton', 'KAPUS': 'cotton',
  'SOYBEAN': 'soybean', 'SOYA': 'soybean', 'SOYABEAN': 'soybean',
  'RICE': 'rice', 'PADDY': 'rice', 'DHAN': 'rice', 'CHAWAL': 'rice', 'BHAT': 'rice',
  'WHEAT': 'wheat', 'GEHUN': 'wheat',
  'MAIZE': 'maize', 'CORN': 'maize', 'MAKKA': 'maize',
  'TOMATO': 'tomato', 'TAMATAR': 'tomato',
  'ONION': 'onion', 'KANDA': 'onion', 'PYAZ': 'onion',
  'CHILLI': 'chilli', 'CHILI': 'chilli', 'MIRCHI': 'chilli',
  'CAPSICUM': 'capsicum', 'BELL_PEPPER': 'capsicum', 'SHIMLA_MIRCH': 'capsicum',
  'POTATO': 'potato', 'ALOO': 'potato',
  'BRINJAL': 'brinjal', 'EGGPLANT': 'brinjal', 'AUBERGINE': 'brinjal',
  'GROUNDNUT': 'groundnut', 'PEANUT': 'groundnut', 'MOONGFALI': 'groundnut',
  'MUSTARD': 'mustard', 'SARSON': 'mustard', 'RAPESEED': 'mustard',
  'SUNFLOWER': 'sunflower',
  'PIGEON_PEA': 'pigeon_pea', 'PIGEONPEA': 'pigeon_pea', 'TUR': 'pigeon_pea', 'ARHAR': 'pigeon_pea', 'TOOR': 'pigeon_pea',
  'CHICKPEA': 'chickpea', 'GRAM': 'chickpea', 'CHANA': 'chickpea', 'BENGAL_GRAM': 'chickpea', 'HARBHARA': 'chickpea',
  'GREEN_GRAM': 'green_gram', 'MUNG': 'green_gram', 'MOONG': 'green_gram', 'MUNGBEAN': 'green_gram',
  'BLACK_GRAM': 'black_gram', 'URAD': 'black_gram', 'URD': 'black_gram',
  'LENTIL': 'lentil', 'MASOOR': 'lentil',
  'COWPEA': 'cowpea', 'LOBIA': 'cowpea', 'CHAVALI': 'cowpea',
  'BAJRA': 'bajra', 'PEARL_MILLET': 'bajra', 'MILLET': 'bajra',
  'JOWAR': 'jowar', 'SORGHUM': 'jowar', 'JOWARI': 'jowar',
  'BANANA': 'banana', 'KELA': 'banana',
  'GRAPE': 'grapes', 'GRAPES': 'grapes',
  'POMEGRANATE': 'pomegranate', 'ANAR': 'pomegranate',
  'MANGO': 'mango', 'AAM': 'mango',
  'ORANGE': 'orange', 'CITRUS': 'orange', 'SANTRA': 'orange',
  'OKRA': 'okra', 'BHINDI': 'okra', 'LADYFINGER': 'okra',
  'CABBAGE': 'cabbage',
  'CAULIFLOWER': 'cauliflower',

  // Legacy v1 SHORT codes (transitional; remove after DB cleanup verifies
  // zero short-code rows remain in canonical_hint_mapping /
  // observation_translations)
  'SC': 'sugarcane', 'CTN': 'cotton', 'SOY': 'soybean', 'WHT': 'wheat',
  'MZ': 'maize', 'TOM': 'tomato', 'ONI': 'onion', 'CHI': 'chilli',
  'GN': 'groundnut', 'BAN': 'banana', 'GRP': 'grapes', 'POM': 'pomegranate',
  'SFL': 'sunflower', 'BRN': 'brinjal', 'CAB': 'cabbage', 'CFL': 'cauliflower',
  'POT': 'potato',

  // Marathi — every mapping verified against crops.label_mr (2026-08-08)
  'कापूस': 'cotton', 'सोयाबीन': 'soybean', 'सोयाबिन': 'soybean',
  'भात': 'rice', 'तांदूळ': 'rice',
  'गहू': 'wheat', 'ऊस': 'sugarcane', 'मका': 'maize',
  'टोमॅटो': 'tomato', 'कांदा': 'onion', 'मिरची': 'chilli',
  'भुईमूग': 'groundnut', 'शेंगदाणा': 'groundnut',
  'हरभरा': 'chickpea', 'तूर': 'pigeon_pea',
  'मूग': 'green_gram', 'उडीद': 'black_gram', 'मसूर': 'lentil',
  'चवळी': 'cowpea', 'बाजरी': 'bajra', 'ज्वारी': 'jowar',
  'मोहरी': 'mustard', 'सूर्यफूल': 'sunflower',
  'केळी': 'banana', 'आंबा': 'mango', 'द्राक्षे': 'grapes', 'डाळिंब': 'pomegranate',
  'वांगी': 'brinjal', 'वांगे': 'brinjal', 'भेंडी': 'okra',
  'कोबी': 'cabbage', 'फ्लॉवर': 'cauliflower', 'बटाटा': 'potato',

  // Hindi
  'कपास': 'cotton', 'रुई': 'cotton',
  'धान': 'rice', 'चावल': 'rice',
  'गेहूं': 'wheat', 'गेहूँ': 'wheat',
  'गन्ना': 'sugarcane', 'ईख': 'sugarcane', 'मक्का': 'maize',
  'टमाटर': 'tomato', 'प्याज': 'onion', 'मिर्च': 'chilli',
  'मूंगफली': 'groundnut', 'चना': 'chickpea', 'अरहर': 'pigeon_pea',
  'केला': 'banana', 'आम': 'mango', 'अंगूर': 'grapes', 'अनार': 'pomegranate',
  'सरसों': 'mustard', 'सूरजमुखी': 'sunflower',
  'अदरक': '', // ginger — NOT in crops master, see UNREGISTERED_CROPS
  'आलू': 'potato', 'बैंगन': 'brinjal', 'भिंडी': 'okra',
  'बंदगोभी': 'cabbage', 'फूलगोभी': 'cauliflower',
};

// Crops the app receives as input but which have NO row in public.crops
// (verified absent 2026-08-08). Per the no-fabrication rule they resolve to
// '' (unknown → clarification). To support them: INSERT into public.crops
// first, then move the alias into ALIAS_TO_CANONICAL.
export const UNREGISTERED_CROPS: Record<string, string> = {
  'TURMERIC': 'no crops.value row (v1 invented TUR_C)',
  'HALDI': 'no crops.value row',
  'हळद': 'no crops.value row',
  'GINGER': 'no crops.value row (v1 invented GNG)',
  'ADRAK': 'no crops.value row',
  'आले': 'no crops.value row',
  'PEPPER': 'ambiguous: chilli vs capsicum — ask, do not guess',
};

// DISPLAY names (UPPERCASE, v1-compatible). DISPLAY-ONLY — never a DB value.
const DISPLAY_NAME: Record<string, string> = Object.fromEntries(
  [...CANONICAL_CODES].map((c) => [c, c.toUpperCase()]),
);

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC API (drop-in: same four exported symbols as v1)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Normalize any crop name/code (EN/HI/MR, any case, legacy short codes) to
 * the canonical lowercase public.crops.value.
 * Returns '' (falsy) when the crop is unknown/unregistered/ambiguous —
 * NEVER 'ALL'. Existing guards (`|| undefined`, `|| ''`) route '' into the
 * no-crop-context / clarification path instead of universal-scope leakage.
 * Scope tokens ('all','ALL','*','universal','general') pass through
 * lowercased, since DB rows legitimately use them as applicability scope.
 */
export function normalizeCropCode(raw: string | undefined | null): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();

  // Devanagari / exact alias first
  const direct = ALIAS_TO_CANONICAL[trimmed];
  if (direct !== undefined) return direct;

  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  const lower = trimmed.toLowerCase().replace(/[\s-]+/g, '_');

  if (CANONICAL_CODES.has(lower)) return lower;        // already canonical
  if (SCOPE_TOKENS.has(lower)) return lower;           // sanctioned scope token
  const aliased = ALIAS_TO_CANONICAL[upper];
  if (aliased !== undefined) return aliased;           // '' for unregistered

  console.warn(`[CropCodeNormalizer v2] Unknown crop: "${raw}" → '' (clarification path; v1 returned 'ALL')`);
  return '';
}

/** Strict variant for gates/new code: null instead of '' for unknown. */
export function normalizeCropCodeStrict(raw: string | undefined | null): string | null {
  const c = normalizeCropCode(raw);
  return c === '' ? null : c;
}

/** True iff the value is a registered crop code (scope tokens excluded). */
export function isKnownCropCode(code: string | undefined | null): boolean {
  return !!code && CANONICAL_CODES.has(code.toLowerCase());
}

/**
 * Full English DISPLAY name (UPPERCASE — v1-compatible for prompts/UI).
 * DISPLAY-ONLY: never write this into any crop_code column or query filter.
 */
export function getFullCropName(code: string | undefined | null): string {
  if (!code) return 'UNKNOWN';
  const canonical = normalizeCropCode(code);
  if (canonical && DISPLAY_NAME[canonical]) return DISPLAY_NAME[canonical];
  if (canonical && SCOPE_TOKENS.has(canonical)) return canonical.toUpperCase();
  return 'UNKNOWN';
}

/**
 * All match variants for filtering rule/mapping rows by crop.
 * v2 guarantees the CANONICAL LOWERCASE value is present (v1 did not — DB
 * matching only worked via case-folding of the UPPER full name), keeps the
 * v1 legacy variants (SHORT + UPPER full + raw-upper) transitionally so any
 * still-contaminated DB rows match until cleanup completes, and includes the
 * sanctioned scope tokens exactly as they appear in the database.
 */
export function getCropCodeVariants(raw: string | undefined | null): string[] {
  const canonical = normalizeCropCode(raw);
  const variants = new Set<string>(['all', 'ALL', '*', 'universal']);
  if (canonical && !SCOPE_TOKENS.has(canonical)) {
    variants.add(canonical);                          // e.g. 'sugarcane'  ← DB truth
    variants.add(canonical.toUpperCase());            // 'SUGARCANE'       ← legacy literals
    // legacy v1 short code, if one existed for this crop (transitional)
    for (const [alias, canon] of Object.entries(ALIAS_TO_CANONICAL)) {
      if (canon === canonical && alias.length <= 4 && alias === alias.toUpperCase()) {
        variants.add(alias);                          // 'SC'
        variants.add(alias.toLowerCase());            // 'sc' (contaminated rows)
      }
    }
  }
  if (raw && raw.trim()) {
    variants.add(raw.trim());
    variants.add(raw.trim().toUpperCase());
    variants.add(raw.trim().toLowerCase());
  }
  return Array.from(variants);
}
