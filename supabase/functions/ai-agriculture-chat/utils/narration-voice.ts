// NARRATION VOICE — single, language-agnostic tone contract for every farmer-facing LLM call.
//
// CHANGE LOG (newest first)
// 2026-10-06 10:05 UTC — created. Replaces the "village agriculture officer" persona, which made models
//   introduce themselves ("मी आपला कृषी अधिकारी बोलतोय"), use heavy dialect and mix scripts. Adds a
//   script-purity check so a garbled rewrite (Latin/foreign letters inside native words) is rejected.

export const NARRATION_VOICE_RULES = `
VOICE (applies to every language):
- Write in clear, simple, respectful everyday language that any farmer understands. Not textbook, not heavy dialect.
- Never introduce yourself, never claim a role or identity (no "I am your agriculture officer", no "मी आपला कृषी अधिकारी"), never sign off.
- At most one short polite address (e.g. "शेतकरी मित्र"); no long greetings, no slang.
- Use only the farmer's script. Do not put English words in brackets unless it is a product name. Never mix letters of two scripts inside one word.
- Short sentences. Practical. No praise, no filler.
`.trim();

const SCRIPT_RANGES: Record<string, RegExp> = {
  mr: /[\u0900-\u097F]/u, hi: /[\u0900-\u097F]/u, bn: /[\u0980-\u09FF]/u, pa: /[\u0A00-\u0A7F]/u,
  gu: /[\u0A80-\u0AFF]/u, or: /[\u0B00-\u0B7F]/u, ta: /[\u0B80-\u0BFF]/u, te: /[\u0C00-\u0C7F]/u,
  kn: /[\u0C80-\u0CFF]/u, ml: /[\u0D00-\u0D7F]/u,
};

/** True when narration text is clean for the target language's script. */
export function isScriptClean(text: string, lang: string): boolean {
  const native = SCRIPT_RANGES[lang];
  if (!native) return true;
  for (const word of text.split(/[\s.,;:!?()\[\]"'“”‘’\-–—/।॥]+/u)) {
    if (!word) continue;
    const hasNative = [...word].some((c) => native.test(c));
    const hasLatin = /[A-Za-z]/.test(word);
    if (hasNative && hasLatin) return false; // e.g. "शेvari"
    for (const c of word) {
      if (/\p{L}/u.test(c) && !native.test(c) && !/[A-Za-z]/.test(c)) return false; // foreign script letter
    }
  }
  return true;
}

/** Strip any self-introduction sentence the model may still emit. */
export function stripSelfIntroduction(text: string): string {
  return text
    .split(/(?<=[.!?।])\s+/u)
    .filter((s) => !/(कृषी अधिकारी|कृषि अधिकारी|agriculture officer)[^.!?।]*(बोलतो|बोल रहा|speaking|here)/iu.test(s))
    .join(' ')
    .trim();
}
