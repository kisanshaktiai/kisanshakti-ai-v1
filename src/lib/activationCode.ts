/**
 * activationCode — shaping what a farmer types or scans into an activation code.
 *
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part).
 *
 * This is convenience only. The server alone decides whether a code is valid
 * (public.activation_redeem); nothing here is a check anybody relies on.
 *
 * A code is 12 symbols from a 32-symbol alphabet without I, L, O and U, shown
 * as XXXX-XXXX-XXXX. The printed QR holds the text  KSA1:XXXX-XXXX-XXXX.
 * The same rules are applied by the database (activation.normalize_code).
 */

export const ACTIVATION_CODE_LENGTH = 12;
const QR_PREFIX = /^\s*KSA1:/i;
const ALPHABET = /[0-9A-HJKMNP-TV-Z]/;
const LOOK_ALIKES: Record<string, string> = { O: '0', I: '1', L: '1' };

/**
 * Typed or pasted text → at most 12 code symbols. Spaces, hyphens and anything
 * that cannot be part of a code are dropped; the look-alike letters a person
 * may type for a digit are mapped to that digit.
 */
export function cleanActivationInput(raw: string): string {
  let symbols = '';
  for (const char of raw.replace(QR_PREFIX, '').toUpperCase()) {
    const symbol = LOOK_ALIKES[char] ?? char;
    if (ALPHABET.test(symbol)) symbols += symbol;
    if (symbols.length === ACTIVATION_CODE_LENGTH) break;
  }
  return symbols;
}

/** 12 symbols (or fewer, while typing) → groups of four joined by hyphens. */
export function formatActivationCode(symbols: string): string {
  return symbols.match(/.{1,4}/g)?.join('-') ?? '';
}

export function isCompleteActivationCode(symbols: string): boolean {
  return symbols.length === ACTIVATION_CODE_LENGTH;
}

/**
 * Text read from a QR → the 12 symbols, or null when the QR is not an
 * activation code (a payment QR, a web link, a product label). Stricter than
 * cleanActivationInput: the whole text must be one code and nothing else.
 */
export function parseActivationQr(text: string): string | null {
  if (typeof text !== 'string' || text.length > 64) return null;
  const body = text.replace(QR_PREFIX, '').replace(/[\s-]/g, '').toUpperCase();
  if (body.length !== ACTIVATION_CODE_LENGTH) return null;
  const symbols = cleanActivationInput(body);
  return symbols.length === ACTIVATION_CODE_LENGTH ? symbols : null;
}
