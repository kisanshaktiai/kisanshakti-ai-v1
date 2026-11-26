/**
 * LIVE CAMERA WORDING REGRESSION
 * CHANGE LOG
 * 2026-11-24 15:35 UTC — Created: guard the full-screen camera screen's wording keys in en/mr/hi.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const LOCALES = ['en', 'mr', 'hi'] as const;
const ROOT = path.resolve(__dirname, '..', '..');

function captureSection(locale: string): Record<string, unknown> {
  const file = path.join(ROOT, 'src', 'i18n', 'locales', locale, 'cropGrowth.json');
  const bundle = JSON.parse(readFileSync(file, 'utf8')) as {
    cropGrowth: { capture: Record<string, unknown> };
  };
  return bundle.cropGrowth.capture;
}

describe('live camera screen wording', () => {
  it.each(LOCALES)('%s carries every label the full-screen camera shows', (locale) => {
    const capture = captureSection(locale);
    for (const key of ['cameraStarting', 'takePhoto', 'switchCamera']) {
      const value = capture[key];
      expect(typeof value, `${locale}.cropGrowth.capture.${key}`).toBe('string');
      expect((value as string).trim().length, `${locale}.cropGrowth.capture.${key}`).toBeGreaterThan(0);
    }
  });

  it('does not leave the camera labels as untranslated English in Marathi and Hindi', () => {
    const english = captureSection('en');
    for (const locale of ['mr', 'hi'] as const) {
      const capture = captureSection(locale);
      for (const key of ['cameraStarting', 'switchCamera']) {
        expect(capture[key], `${locale}.cropGrowth.capture.${key} still English`).not.toBe(english[key]);
      }
    }
  });
});
