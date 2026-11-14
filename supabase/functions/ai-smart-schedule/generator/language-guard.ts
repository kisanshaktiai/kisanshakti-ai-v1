// 2026-11-15 — SAME-SCRIPT LANGUAGE GUARD — data-driven, no language words typed here.
//
// A Marathi schedule (4fa451a0) showed a nursery card written in Hindi. The acceptance checks look at
// the SCRIPT only, and Hindi and Marathi share Devanagari, so the Hindi text was saved as Marathi.
// This module decides, for app languages that share a script with another app language, whether a
// whole card reads as a DIFFERENT one of those languages. The decision comes from a trigram language
// model (franc-min) that the Deno entry point registers once; nothing here knows any Hindi or Marathi
// word. Without a registered detector (unit tests, a failed import) the guard does nothing.
//
// Measured on the real cards of 4fa451a0 and e59d281c: whole cards (title + description + steps) are
// classified correctly; lone short titles are NOT (two Marathi titles scored as Hindi), and the model
// cannot separate Assamese from Bengali. So the guard only judges whole cards of at least
// MIN_SAMPLE_CHARS letters, only for language pairs the model separates, and only rejects with a margin.

/** Ranked [detectorCode, score] pairs, best first (franc's francAll shape: best = 1). */
export type DetectAll = (text: string, options: { only: string[]; minLength: number }) => Array<[string, number]>;

/** App languages (ISO 639-1) that share a script AND that the detector separates → detector code (ISO 639-3). */
const SAME_SCRIPT_GROUPS: ReadonlyArray<Record<string, string>> = [{ hi: "hin", mr: "mar" }];
/** Below this many script letters a card is too short to judge (lone titles were misclassified). */
export const MIN_SAMPLE_CHARS = 30;
/** Reject only when the requested language scores below this against the winner (closest correct case seen: 0.95 vs 1). */
export const REQUESTED_LANGUAGE_MIN_SCORE = 0.95;

let registered: DetectAll | null = null;
/** Called once by the Deno entry point (language-detector.ts). */
export function setLanguageDetector(detect: DetectAll | null): void { registered = detect; }
export function getLanguageDetector(): DetectAll | null { return registered; }

/**
 * The app language a whole card is actually written in when that differs from the requested one and
 * both share a script; null when it is the requested language or the guard cannot decide.
 */
export function wrongSameScriptLanguage(text: string, language: string, detect: DetectAll | null = registered): string | null {
  if (!detect) return null;
  const group = SAME_SCRIPT_GROUPS.find((g) => language in g);
  if (!group) return null;
  // Product names, grades, units and numbers are carried over verbatim; they say nothing about the language.
  const sample = String(text ?? "").replace(/[A-Za-z0-9.,;:()%+\-–—/×°|"'!?]/g, " ").replace(/\s+/g, " ").trim();
  if (sample.length < MIN_SAMPLE_CHARS) return null;
  let ranked: Array<[string, number]>;
  try { ranked = detect(sample, { only: Object.values(group), minLength: 3 }); } catch { return null; }
  const top = ranked[0];
  if (!top || top[0] === "und" || top[0] === group[language]) return null;
  const requestedScore = ranked.find(([code]) => code === group[language])?.[1] ?? 0;
  if (requestedScore >= REQUESTED_LANGUAGE_MIN_SCORE) return null;
  return Object.keys(group).find((k) => group[k] === top[0]) ?? top[0];
}

/**
 * The requested language as "code (English name, native name)" from the runtime's own locale data
 * (Intl.DisplayNames), so a model is never left to guess what a bare "mr" means. Falls back to the code.
 */
export function languageLabel(code: string): string {
  try {
    const en = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    const native = new Intl.DisplayNames([code], { type: "language" }).of(code);
    const names = [...new Set([en, native].filter((n): n is string => !!n && n.toLowerCase() !== code.toLowerCase()))];
    return names.length ? `${code} (${names.join(", ")})` : code;
  } catch {
    return code;
  }
}
