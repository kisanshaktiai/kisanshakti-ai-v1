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

export const DEFAULT_TARGET_CHARS = 240;
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

  const rawLines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');

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
