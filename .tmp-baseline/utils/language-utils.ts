// LANGUAGE UTILITIES — Centralized language helpers

/** Map language code to human-readable name (for LLM prompts) */
export function getLanguageName(lang: string): string {
  const LANG_NAMES: Record<string, string> = {
    mr: 'Marathi', hi: 'Hindi', en: 'English',
    ta: 'Tamil', te: 'Telugu', kn: 'Kannada',
    ml: 'Malayalam', bn: 'Bengali', gu: 'Gujarati',
    pa: 'Punjabi', or: 'Odia',
  };
  return LANG_NAMES[lang] || lang.toUpperCase();
}

/** Get the script regex for a language (for validation, not content) */
export function getScriptRegex(lang: string): RegExp | null {
  const SCRIPT_RANGES: Record<string, RegExp> = {
    mr: /[\u0900-\u097F]/, hi: /[\u0900-\u097F]/,
    ta: /[\u0B80-\u0BFF]/, te: /[\u0C00-\u0C7F]/, kn: /[\u0C80-\u0CFF]/,
    ml: /[\u0D00-\u0D7F]/, bn: /[\u0980-\u09FF]/, gu: /[\u0A80-\u0AFF]/,
    pa: /[\u0A00-\u0A7F]/, or: /[\u0B00-\u0B7F]/,
  };
  return SCRIPT_RANGES[lang] || null;
}

/** Check if a language uses Devanagari script */
export function isDevanagariLanguage(lang: string): boolean {
  return lang === 'mr' || lang === 'hi';
}

/** Get narrator voice identifier for TTS */
export function getNarratorVoice(lang: string): string {
  const VOICES: Record<string, string> = {
    mr: 'MARATHI_MALE', hi: 'HINDI_MALE', en: 'ENGLISH_NEUTRAL',
    ta: 'TAMIL_MALE', te: 'TELUGU_MALE', kn: 'KANNADA_MALE',
  };
  return VOICES[lang] || 'ENGLISH_NEUTRAL';
}

/** Get crop name key for ICAR calendar lookup */
export function getCropNameKey(lang: string): string {
  return `crop_name_${lang}`;
}
