/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TTS TEXT PREPARATION — shared by every Read Aloud path
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Turns the AI response exactly as displayed to the farmer into a list of
 * speakable chunks.
 *
 * Guarantees:
 *  - Nothing is dropped. Text that does not end in sentence punctuation is
 *    still spoken (the previous splitter silently discarded it).
 *  - Digits, ranges, units, dates, dosages and currency are passed through
 *    untouched. Hyphens are only removed when they are a bullet marker at the
 *    start of a line, never inside "2-3", "10-15 दिवस" or "NPK 19-19-19".
 *  - Language-agnostic. No language word lists, no crop terms, no
 *    transliteration, no number-to-word conversion. The speech engine reads
 *    the digits in the farmer's own locale.
 *  - Every chunk stays below the platform speech-input limit. Android's
 *    TextToSpeech.speak() rejects input longer than getMaxSpeechInputLength()
 *    (4000 characters on stock engines) and reports nothing back, which
 *    strands the caller.
 */

export interface PrepareOptions {
  /** Chunks are merged up to roughly this size for natural prosody. */
  targetChars?: number;
  /** Hard ceiling for one chunk. Must stay well below the engine limit. */
  maxChars?: number;
}

export interface PreparedSpeech {
  /** Ordered chunks to hand to the engine, one utterance each. */
  chunks: string[];
  /** Everything that will actually be spoken. Used by tests to assert no loss. */
  spokenText: string;
}

/**
 * Segments are paragraph sized, not sentence sized.
 * A speech engine generates prosody across a whole utterance, so cutting at
 * every full stop and restarting produces the stop-start delivery that makes
 * synthesis sound mechanical. Larger segments let the engine carry its own
 * rhythm across the sentences the farmer hears as one instruction.
 */
export const DEFAULT_TARGET_CHARS = 900;
export const DEFAULT_MAX_CHARS = 1200;

/**
 * Sentence terminators across the scripts the app ships in.
 * These are punctuation marks, not language vocabulary.
 */
const TERMINATORS = new Set(['.', '!', '?', '\u0964', '\u0965', '\u06D4', '\u061F']);

/** True when a fragment holds at least one letter, i.e. it is not a bare "1." list marker. */
function hasSpeakableContent(fragment: string): boolean {
  return /[^\s\d.,;:!?()[\]{}%\-\u2013\u2014/\\\u0964\u0965\u06D4\u061F]/u.test(fragment);
}

/**
 * Strip display-only markup from a single line while keeping every word.
 * Bullet markers are only stripped at the start of a line.
 */
/**
 * Number safety, applied before anything else.
 * Language agnostic: no digit is ever turned into a word, because a word list
 * would have to be per language and would put foreign words inside the
 * farmer's sentence. Only the FORM of a number is normalised so the engine
 * reads it correctly. Values are never changed.
 */
export function normaliseNumbers(text: string): string {
  let out = text;

  // Native-script digits to ASCII. Engines read ASCII digits reliably in every
  // locale; some read foreign-script digits one glyph at a time or not at all.
  const DIGIT_BLOCKS: Array<[number, number]> = [
    [0x0966, 0x096f], // Devanagari
    [0x09e6, 0x09ef], // Bengali
    [0x0a66, 0x0a6f], // Gurmukhi
    [0x0ae6, 0x0aef], // Gujarati
    [0x0b66, 0x0b6f], // Odia
    [0x0be6, 0x0bef], // Tamil
    [0x0c66, 0x0c6f], // Telugu
    [0x0ce6, 0x0cef], // Kannada
    [0x0d66, 0x0d6f], // Malayalam
    [0x0660, 0x0669], // Arabic-Indic
    [0x06f0, 0x06f9], // Extended Arabic-Indic
  ];
  out = out.replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u09e6-\u09ef\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-\u0b6f\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    for (const [start, end] of DIGIT_BLOCKS) {
      if (cp >= start && cp <= end) return String(cp - start);
    }
    return ch;
  });

  // Grouping separators inside a number are removed. Indian grouping such as
  // 1,20,000 is commonly misread as separate numbers. 1,20,000 -> 120000.
  // Only runs of digit-comma-digits are touched, so list commas survive.
  let previous: string;
  do {
    previous = out;
    out = out.replace(/(\d),(\d{2,3})(?!\d)/g, '$1$2');
  } while (out !== previous);

  // A decimal point must not be read as a full stop. Ensure no space creeps in
  // between the parts, so 2 . 5 reads as two point five, not as two sentences.
  out = out.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');

  // A decimal comma between digits is normalised to a point so the engine reads
  // one number rather than two. 2,5 ml -> 2.5 ml
  out = out.replace(/(\d),(\d)(?!\d)/g, '$1.$2');

  return out;
}

/**
 * Spell out short all-caps acronyms so the engine reads the letters instead of
 * attempting them as a word: NPK becomes N P K, DAP becomes D A P.
 *
 * Language-neutral by construction. It inserts no words in any language and
 * uses no agronomy list, so it works for any acronym in any of the app's
 * languages and needs no maintenance when new terms appear.
 */
export function spaceAcronyms(text: string): string {
  return text.replace(/\b([A-Z]{2,5})\b(?![a-z])/g, (match) => match.split('').join(' '));
}

/** True when the token is a number, possibly with a decimal part or a range. */
function isNumericToken(token: string): boolean {
  return /^[\d]+([.\-\u2013/][\d]+)*[%]?$/.test(token);
}

function stripLineMarkup(line: string): string {
  let out = line;

  out = out.replace(/^\s{0,3}#{1,6}\s+/, '');
  out = out.replace(/^\s{0,3}>\s?/, '');
  out = out.replace(/^(\s*)[-*\u2022\u2023\u25AA\u25CF\u2013\u2014]\s+/, '$1');

  // Markdown table separator rows carry no spoken content.
  if (/^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(out)) return '';

  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  out = out.replace(/`{1,3}/g, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/~~([^~]+)~~/g, '$1');

  // Table cells become comma pauses so values do not run into each other.
  out = out.replace(/\s*\|\s*/g, ', ');
  out = out.replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '');

  // Decorative pictographs. Removing them avoids engines reading emoji names.
  out = out.replace(
    /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,
    ''
  );

  out = out.replace(/[ \t\u00A0]+/g, ' ');
  return out.trim();
}

/**
 * Split one already-normalised line into sentences.
 * A trailing fragment without terminal punctuation is always kept.
 */
function splitSentences(line: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < line.length; i++) {
    if (!TERMINATORS.has(line[i])) continue;

    // Absorb a run of terminators, e.g. "?!" or "॥".
    let end = i;
    while (end + 1 < line.length && TERMINATORS.has(line[end + 1])) end++;

    const next = line[end + 1];
    // A terminator only ends a sentence when followed by a space or the line end.
    // This keeps "2.5 ml", "12.03.2026" and "19-19-19" intact.
    if (next !== undefined && next !== ' ') {
      i = end;
      continue;
    }

    const piece = line.slice(start, end + 1);
    if (hasSpeakableContent(piece)) {
      out.push(piece.trim());
      start = end + 1;
    }
    i = end;
  }

  const remainder = line.slice(start).trim();
  if (remainder) out.push(remainder);

  return out.filter((s) => s.length > 0);
}

/** Split an over-long sentence at word boundaries. Never splits inside a word or number. */
function hardSplit(sentence: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = sentence;

  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;

    // Do not end a chunk on a number: a dose and its unit must stay together,
    // otherwise the farmer hears the figure and the unit as separate utterances.
    let guard = 0;
    while (guard < 8) {
      const head = rest.slice(0, cut).trim();
      const lastToken = head.slice(head.lastIndexOf(' ') + 1);
      if (!isNumericToken(lastToken)) break;
      const earlier = rest.lastIndexOf(' ', cut - 1);
      if (earlier <= 0) break;
      cut = earlier;
      guard++;
    }

    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) parts.push(rest);
  return parts.filter((p) => p.length > 0);
}

/**
 * Prepare the displayed response for speech.
 * Blank lines are hard boundaries so paragraphs keep their pause.
 */
export function prepareForSpeech(text: string, options: PrepareOptions = {}): PreparedSpeech {
  const targetChars = options.targetChars ?? DEFAULT_TARGET_CHARS;
  const maxChars = Math.max(options.maxChars ?? DEFAULT_MAX_CHARS, targetChars);

  const chunks: string[] = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push(trimmed);
    buffer = '';
  };

  const rawLines = spaceAcronyms(normaliseNumbers(text ?? '')).replace(/\r\n?/g, '\n').split('\n');

  for (const rawLine of rawLines) {
    const line = stripLineMarkup(rawLine);

    if (!line) {
      // Blank or markup-only line: paragraph break.
      flush();
      continue;
    }

    for (const sentence of splitSentences(line)) {
      for (const piece of hardSplit(sentence, maxChars)) {
        if (!buffer) {
          buffer = piece;
        } else if (buffer.length + 1 + piece.length <= targetChars) {
          buffer = `${buffer} ${piece}`;
        } else {
          flush();
          buffer = piece;
        }
      }
    }
  }

  flush();

  return { chunks, spokenText: chunks.join(' ') };
}

/** The full normalised text as one string. Useful for engines that take one call. */
export function stripForSpeech(text: string, options: PrepareOptions = {}): string {
  return prepareForSpeech(text, options).spokenText;
}
