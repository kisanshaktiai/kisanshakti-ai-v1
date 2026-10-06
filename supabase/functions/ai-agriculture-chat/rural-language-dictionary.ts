// RURAL LANGUAGE DICTIONARY v3.0 — LANGUAGE-NEUTRAL
// CHANGE LOG (newest first)
// 2026-10-06 10:05 UTC — Persona removed: voice now comes from utils/narration-voice.ts (no self-introduction,
//   no heavy dialect, single script).

import { NARRATION_VOICE_RULES } from './utils/narration-voice.ts';

export interface TermMapping {
  formal: string;
  rural: string[];
  context?: string;
}

export interface RegionalVocabulary {
  greetings: string[];
  farmerTerms: string[];
  commonPhrases: Record<string, string>;
}

const PLAIN_LANGUAGE_RULES_EN = `
PLAIN LANGUAGE RULES:
- Prefer everyday farming words over technical terms (e.g. "spray for insects" instead of "pesticide application").
- Use local measurement units (acre, guntha, bigha).
${NARRATION_VOICE_RULES}
`;

export function getRuralLanguageRules(_language: string): string {
  return PLAIN_LANGUAGE_RULES_EN;
}

const NARRATOR_BLOCK = `
YOUR ROLE: explain already-decided agricultural advice to the farmer in their own language.
Explain naturally; do not translate word-by-word. Symptom names use the term farmers actually use locally.
${NARRATION_VOICE_RULES}
`;

export function getVillageOfficerPersona(): string {
  return NARRATOR_BLOCK;
}

export function replaceFormalsWithRural(text: string, _language: string): string {
  return text;
}

export function shouldAddInstaScanCTA(queryType: string): boolean {
  return ['pest', 'health', 'growth'].includes(queryType);
}

export function getInstaScanCTA(_language: string): string {
  return `📸 **Tip:** Take a photo of the leaf/crop using this app! I'll see and tell you exactly what's wrong and which medicine to use. [Use InstaScan to capture photo]`;
}
