import { describe, expect, it } from 'vitest';
import en from './locales/en/activation.json';
import hi from './locales/hi/activation.json';
import mr from './locales/mr/activation.json';

/** Every leaf of a bundle as dotted path → its {{placeholders}}. */
function placeholdersOf(node: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === 'string') {
    out[prefix] = (node.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) placeholdersOf(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

describe('activation locale bundles', () => {
  const bundles = { en: en.activation, hi: hi.activation, mr: mr.activation };

  it('hold exactly the same keys and placeholders in every language', () => {
    const reference = placeholdersOf(bundles.en);
    expect(placeholdersOf(bundles.hi)).toEqual(reference);
    expect(placeholdersOf(bundles.mr)).toEqual(reference);
  });

  it('have no empty text', () => {
    for (const bundle of Object.values(bundles)) {
      const texts: string[] = [];
      JSON.stringify(bundle, (_key, value) => { if (typeof value === 'string') texts.push(value); return value; });
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.filter((text) => !text.trim())).toEqual([]);
    }
  });

  it('have a message for every result code the server can answer', () => {
    // Result codes of public.activation_redeem() that reach the farmer, plus the transport ones.
    const codes = [
      'activation_invalid', 'activation_used', 'activation_revoked', 'activation_expired',
      'activation_tenant_inactive', 'activation_subscription_inactive', 'activation_capacity_full',
      'activation_farmer_invalid', 'activation_failed', 'rate_limited',
      'session_required', 'transport_unavailable', 'generic',
    ];
    expect(Object.keys(bundles.en.errors).sort()).toEqual([...codes].sort());
  });
});
