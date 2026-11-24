import { describe, expect, it } from 'vitest';
import en from './locales/en/provider.json';
import hi from './locales/hi/provider.json';
import mr from './locales/mr/provider.json';

/** Every leaf key of a bundle, as dotted paths. */
function keysOf(node: unknown, prefix = ''): string[] {
  if (node === null || typeof node !== 'object') return [prefix];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    keysOf(value, prefix ? `${prefix}.${key}` : key));
}
/** The {{placeholders}} of every leaf, so a translation cannot drop a value. */
function placeholdersOf(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') {
    out[prefix] = (node.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) placeholdersOf(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

describe('provider locale bundles', () => {
  const bundles = { en: en.provider, hi: hi.provider, mr: mr.provider };

  it('hold exactly the same keys in every language', () => {
    const reference = keysOf(bundles.en).sort();
    expect(keysOf(bundles.hi).sort()).toEqual(reference);
    expect(keysOf(bundles.mr).sort()).toEqual(reference);
  });

  it('keep the same placeholders in every language', () => {
    const reference = placeholdersOf(bundles.en);
    expect(placeholdersOf(bundles.hi)).toEqual(reference);
    expect(placeholdersOf(bundles.mr)).toEqual(reference);
  });

  it('have no empty text', () => {
    for (const bundle of Object.values(bundles)) {
      expect(Object.entries(placeholdersOf(bundle)).length).toBeGreaterThan(300);
      const texts: string[] = [];
      JSON.stringify(bundle, (_key, value) => { if (typeof value === 'string') texts.push(value); return value; });
      expect(texts.filter((text) => !text.trim())).toEqual([]);
    }
  });
});
