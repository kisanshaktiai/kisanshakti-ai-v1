import { describe, expect, it } from 'vitest';
import {
  cleanActivationInput,
  formatActivationCode,
  isCompleteActivationCode,
  parseActivationQr,
} from './activationCode';

describe('cleanActivationInput', () => {
  it('keeps the 12 symbols of a typed code, whatever the separators and case', () => {
    expect(cleanActivationInput('7k2m-9pqr-4t8x')).toBe('7K2M9PQR4T8X');
    expect(cleanActivationInput(' 7K2M 9PQR 4T8X ')).toBe('7K2M9PQR4T8X');
  });

  it('maps the letters a person may type for a digit', () => {
    expect(cleanActivationInput('OIL0-1111-2222')).toBe('011011112222');
  });

  it('drops what can never be part of a code and stops at 12 symbols', () => {
    expect(cleanActivationInput('U7K2M!9PQR@4T8X-EXTRA')).toBe('7K2M9PQR4T8X');
  });

  it('accepts the text of the printed QR', () => {
    expect(cleanActivationInput('KSA1:7K2M-9PQR-4T8X')).toBe('7K2M9PQR4T8X');
  });
});

describe('formatActivationCode', () => {
  it('groups by four while typing and when complete', () => {
    expect(formatActivationCode('')).toBe('');
    expect(formatActivationCode('7K2M9')).toBe('7K2M-9');
    expect(formatActivationCode('7K2M9PQR4T8X')).toBe('7K2M-9PQR-4T8X');
  });

  it('knows a complete code', () => {
    expect(isCompleteActivationCode('7K2M9PQR4T8X')).toBe(true);
    expect(isCompleteActivationCode('7K2M9PQR4T8')).toBe(false);
  });
});

describe('parseActivationQr', () => {
  it('reads an activation QR, with or without the prefix', () => {
    expect(parseActivationQr('KSA1:7K2M-9PQR-4T8X')).toBe('7K2M9PQR4T8X');
    expect(parseActivationQr('ksa1:7k2m-9pqr-4t8x')).toBe('7K2M9PQR4T8X');
    expect(parseActivationQr('7K2M-9PQR-4T8X')).toBe('7K2M9PQR4T8X');
  });

  it('refuses every other QR', () => {
    expect(parseActivationQr('https://example.com/7K2M-9PQR-4T8X')).toBeNull();
    expect(parseActivationQr('upi://pay?pa=someone@bank')).toBeNull();
    expect(parseActivationQr('KSA1:7K2M-9PQR-4T8')).toBeNull();
    expect(parseActivationQr('KSA1:7K2M-9PQR-4T8X-AAAA')).toBeNull();
    expect(parseActivationQr('KSA1:7K2M-9PQR-4T8U')).toBeNull();
    expect(parseActivationQr('')).toBeNull();
    expect(parseActivationQr('A'.repeat(500))).toBeNull();
  });
});
