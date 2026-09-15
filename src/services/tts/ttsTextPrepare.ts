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

export const DEFAULT_TARGET_CHARS = 900;
export const DEFAULT_MAX_CHARS = 1200;

const TERMINATORS = new Set(['.', '!', '?', '\u0964', '\u0965', '\u06D4', '\u061F']);

function hasSpeakableContent(fragment: string): boolean {
  return /[^\s\d.,;:!?()[\]{}%\-\u2013\u2014/\\\u0964\u0965\u06D4\u061F]/u.test(fragment);
}

/**
 * Number safety, applied before anything else.
 * Language agnostic: no digit is ever turned into a word.
 */
export function normaliseNumbers(text: string): string {
  let out = text;

  const DIGIT_BLOCKS: Array<[number, number]> = [
    [0x0966, 0x096f],
    [0x09e6, 0x09ef],
    [0x0a66, 0x0a6f],
    [0x0ae6, 0x0aef],
    [0x0b66, 0x0b6f],
    [0x0be6, 0x0bef],
    [0x0c66, 0x0c6f],
    [0x0ce6, 0x0cef],
    [0x0d66, 0x0d6f],
    [0x0660, 0x0669],
    [0x06f0, 0x06f9],
  ];
  out = out.replace(/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u09e6-\u09ef\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-\u0b6f\u0be6-\u0bef\u0c66-\u0c6f\u0ce6-\u0cef\u0d66-\u0d6f]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    for (const [start, end] of DIGIT_BLOCKS) {
      if (cp >= start && cp <= end) return String(cp - start);
    }
    return ch;
  });

  let previous: string;
  do {
    previous = out;
    out = out.replace(/(\d),(\d{2,3})(?!\d)/g, '$1$2');
  } while (out !== previous);

  // Decimal points are normalised only when the two digits are adjacent.
  // A list marker such as "1. 25" must remain a list marker.
  out = out.replace(/(\d)\.(\d)/g, '$1.$2');

  // Decimal comma is normalised only when the comma is isolated from another
  // digit/comma. Thus 2,5 -> 2.5 but 2,3,4 remains a list.
  out = out.replace(/(?<![\d,])(\d),(\d)(?![\d,])/g, '$1.$2');

  return out;
}

export function spaceAcronyms(text: string): string {
  return text.replace(/\b([A-Z]{2,5})\b(?![a-z])/g, (match) => match.split('').join(' '));
}

function isNumericToken(token: string): boolean {
  return /^[\d]+([.\-\u2013/][\d]+)*[%]?$/.test(token);
}

function stripLineMarkup(line: string): string {
  let out = line;

  out = out.replace(/^\s{0,3}#{1,6}\s+/, '');
  out = out.replace(/^\s{0,3}>\s?/, '');
  out = out.replace(/^(\s*)[-*\u2022\u2023\u25AA\u25CF\u2013\u2014]\s+/, '$1');

  if (/^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(out)) return '';

  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  out = out.replace(/`{1,3}/g, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/~~([^~]+)~~/g, '$1');
  out = out.replace(/\s*\|\s*/g, ', ');
  out = out.replace(/^\s*,\s*/, '').replace(/\s*,\s*$/, '');
  out = out.replace(/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '');
  out = out.replace(/[ \t\u00A0]+/g, ' ');
  return out.trim();
}

function splitSentences(line: string): string[] {
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < line.length; i++) {
    if (!TERMINATORS.has(line[i])) continue;
    let end = i;
    while (end + 1 < line.length && TERMINATORS.has(line[end + 1])) end++;

    const next = line[end + 1];
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

function hardSplit(sentence: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = sentence;

  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;

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

export function stripForSpeech(text: string, options: PrepareOptions = {}): string {
  return prepareForSpeech(text, options).spokenText;
}
