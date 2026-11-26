import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRANSLATED_LANGUAGES } from './config';

/**
 * Every screen bundle under src/i18n/locales/<lang>/ must exist in every
 * language the app offers, with the same keys and the same {{placeholders}}.
 * This is what lets the pickers offer a language: a code in
 * TRANSLATED_LANGUAGES is a promise that no screen falls back to English.
 */
const ROOT = resolve(process.cwd(), 'src/i18n/locales');

function keysOf(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key));
}
function placeholdersOf(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') {
    out[prefix] = (node.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) placeholdersOf(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}
const read = (lang: string, file: string) => JSON.parse(readFileSync(resolve(ROOT, lang, file), 'utf8'));
const files = readdirSync(resolve(ROOT, 'en')).filter((f) => f.endsWith('.json')).sort();

describe('screen translation bundles', () => {
  it('offers only languages that have every screen bundle', () => {
    for (const lang of TRANSLATED_LANGUAGES) {
      expect(readdirSync(resolve(ROOT, lang)).filter((f) => f.endsWith('.json')).sort()).toEqual(files);
    }
  });

  for (const file of files) {
    it(`${file}: same keys, same placeholders, no empty text in every offered language`, () => {
      const en = read('en', file);
      const strip = (d: Record<string, unknown>) => { const { __meta: _m, ...rest } = d; return rest; };
      const reference = keysOf(strip(en)).sort();
      const refPlaceholders = placeholdersOf(strip(en));
      for (const lang of TRANSLATED_LANGUAGES.filter((l) => l !== 'en')) {
        const other = strip(read(lang, file));
        expect(keysOf(other).sort(), `${lang}/${file} keys`).toEqual(reference);
        expect(placeholdersOf(other), `${lang}/${file} placeholders`).toEqual(refPlaceholders);
        const empty = Object.entries(placeholdersOf(other)).filter(([k]) => {
          const v = k.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], other);
          return typeof v === 'string' && v.trim() === '';
        }).map(([k]) => k);
        expect(empty, `${lang}/${file} empty`).toEqual([]);
      }
    });
  }
});
