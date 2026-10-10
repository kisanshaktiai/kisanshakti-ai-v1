import { describe, expect, it } from 'vitest';
import { localizePlace } from './locationI18n';

describe('location name localisation', () => {
  it('keeps village and taluka names canonical when no official translation exists', () => {
    expect(localizePlace('Baramati', 'village', 'mr')).toBe('Baramati');
    expect(localizePlace('Satara', 'taluka', 'hi')).toBe('Satara');
    expect(localizePlace('Nashik', 'village', 'mr')).toBe('Nashik');
  });

  it('continues to use verified state translations', () => {
    expect(localizePlace('Maharashtra', 'state', 'mr')).toBe('महाराष्ट्र');
    expect(localizePlace('Maharashtra', 'state', 'hi')).toBe('महाराष्ट्र');
  });

  it('never displays UUIDs as place names', () => {
    expect(localizePlace('46de3a3f-2d76-4d53-bf57-34085d2d7dda', 'village', 'mr')).toBe('');
  });
});