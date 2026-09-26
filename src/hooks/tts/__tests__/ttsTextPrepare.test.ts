/**
 * Number safety for Read Aloud.
 *
 * Every case here is a real shape of text the farmer app speaks: numbered
 * dose lists, sentences that end in a number, day lists, decimal commas,
 * Indian digit grouping, native-script digits, dates and NPK ratios.
 * A dose that changes between the screen and the speaker is the failure
 * these tests exist to catch; no digit is ever turned into a word.
 */
import { describe, expect, it } from 'vitest';
import { CLOUD_FIRST_CHUNK_CHARS, CLOUD_MAX_CHARS, CLOUD_TARGET_CHARS, DEFAULT_MAX_CHARS, normaliseNumbers, prepareForSpeech } from '../ttsTextPrepare';

const spoken = (text: string) => prepareForSpeech(text).chunks.join(' ');

describe('normaliseNumbers', () => {
  it('keeps a numbered-list marker apart from the dose that follows it', () => {
    expect(spoken('1. 25 kg MOP per acre\n2. 10 kg urea')).toBe('1. 25 kg M O P per acre 2. 10 kg urea');
    expect(spoken('1. 25 kg MOP per acre')).not.toContain('1.25');
  });

  it('does not merge a sentence ending in a number with the next number', () => {
    expect(spoken('Apply 25. 30 days later apply again.')).toBe('Apply 25. 30 days later apply again.');
    expect(spoken('Apply 25. 30 days later apply again.')).not.toContain('25.30');
  });

  it('leaves a comma-separated digit list alone', () => {
    expect(spoken('Spray on day 2,3,4 after sowing')).toBe('Spray on day 2,3,4 after sowing');
  });

  it('reads an isolated decimal comma as a decimal point', () => {
    expect(spoken('Dose 2,5 ml per litre')).toBe('Dose 2.5 ml per litre');
  });

  it('removes Indian digit grouping', () => {
    expect(spoken('Cost ₹1,20,000 per acre')).toBe('Cost ₹120000 per acre');
    expect(normaliseNumbers('2,50,000.50')).toBe('250000.50');
  });

  it('keeps an adjacent decimal point', () => {
    expect(normaliseNumbers('12.5 kg')).toBe('12.5 kg');
    expect(normaliseNumbers('pH 6.5')).toBe('pH 6.5');
  });

  it('converts native-script digits to ASCII without touching the words', () => {
    expect(spoken('१२.५ किलो युरिया द्या। २५ किलो MOP.')).toBe('12.5 किलो युरिया द्या। 25 किलो M O P.');
  });

  it('leaves dates and NPK ratios unchanged apart from acronym spacing', () => {
    expect(spoken('NPK 19-19-19 at 2-3 kg, DAP 50 kg, 12.03.2026')).toBe(
      'N P K 19-19-19 at 2-3 kg, D A P 50 kg, 12.03.2026'
    );
  });
});

describe('prepareForSpeech chunking', () => {
  it('never exceeds the chunk cap and never ends a chunk on a bare number', () => {
    const sentence = 'Apply 25 kg of urea per acre after 15 days and irrigate with 5 cm of water. ';
    const long = sentence.repeat(60); // ~4,700 chars
    const { chunks } = prepareForSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
      expect(/\d[.]?$/.test(chunk.trim())).toBe(false);
    }
  });

  it('returns no chunks for text with nothing speakable', () => {
    expect(prepareForSpeech('---\n| --- |').chunks).toEqual([]);
  });
});

describe('cloud sizing (sentence-first)', () => {
  const answer =
    'ऊस पिकासाठी खत व्यवस्थापन\n\nतुमच्या 2 एकर ऊस पिकासाठी खालील खत मात्रा द्या. ' +
    'पहिली मात्रा लागवडीनंतर 30 दिवसांनी द्या आणि दुसरी मात्रा 60 दिवसांनी द्या. खत दिल्यानंतर लगेच पाणी द्या. ' +
    'शेतात ओलावा असावा. काही शंका असल्यास विचारा. '.repeat(6);

  it('keeps the first chunk short so the cloud voice starts within a second', () => {
    const { chunks, spokenText } = prepareForSpeech(answer, {
      firstChunkChars: CLOUD_FIRST_CHUNK_CHARS,
      targetChars: CLOUD_TARGET_CHARS,
      maxChars: CLOUD_MAX_CHARS,
    });
    expect(chunks[0].length).toBeLessThanOrEqual(CLOUD_FIRST_CHUNK_CHARS);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CLOUD_MAX_CHARS);
    // Nothing is lost: the same words are spoken as with the device sizing.
    expect(spokenText).toBe(prepareForSpeech(answer).spokenText);
  });

  it('default (device) sizing is unchanged', () => {
    const { chunks } = prepareForSpeech(answer);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(DEFAULT_MAX_CHARS);
  });
});
