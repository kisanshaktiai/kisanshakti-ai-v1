/**
 * E2E test: switching language must never expose raw i18n keys (e.g. "home.welcome").
 *
 * Strategy:
 *  - Mount the app with a known language (en).
 *  - Continuously poll the rendered DOM text while we trigger setLanguage('mr')
 *    via the languageStore.
 *  - Assert that at no sampled frame does the visible text contain a token that
 *    matches a typical untranslated i18n key pattern (namespace.key) belonging
 *    to a known namespace.
 */

import { test, expect } from '@playwright/test';

// Namespaces registered in src/i18n/config.ts. Any visible token shaped like
// `<ns>.<something>` would indicate a missing translation, not real copy.
const KNOWN_NAMESPACES = [
  'auth', 'toast', 'weather', 'home', 'lands', 'profile', 'market', 'social',
  'schedule', 'analytics', 'chat', 'instascan', 'pwa', 'ndvi', 'schemes',
  'advisory', 'video', 'error', 'sync', 'common', 'voice', 'notification',
  'soil', 'profile_edit', 'cropGrowth', 'chatCards',
];

const KEY_REGEX = new RegExp(
  `\\b(?:${KNOWN_NAMESPACES.join('|')})\\.[a-zA-Z0-9_]+(?:\\.[a-zA-Z0-9_]+)*\\b`,
);

async function seedLanguage(page: import('@playwright/test').Page, lang: string) {
  await page.goto('/');
  await page.evaluate((l) => {
    localStorage.setItem(
      'language-storage',
      JSON.stringify({ state: { currentLanguage: l }, version: 0 }),
    );
    localStorage.setItem('hasSelectedLanguage', 'true');
  }, lang);
}

test.describe('Language switch — no raw translation keys leak', () => {
  test('initial paint after first load shows no namespace.key tokens', async ({ page }) => {
    await seedLanguage(page, 'mr');
    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    // Sample DOM text every 50ms for the first 1.5s of paint.
    const offenders: string[] = [];
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const text = await page.evaluate(() => document.body.innerText || '');
      const match = text.match(KEY_REGEX);
      if (match) offenders.push(match[0]);
      await page.waitForTimeout(50);
    }

    expect(
      offenders,
      `Untranslated keys visible during initial paint: ${[...new Set(offenders)].join(', ')}`,
    ).toEqual([]);
  });

  test('switching language at runtime never exposes namespace.key tokens', async ({ page }) => {
    await seedLanguage(page, 'en');
    await page.goto('/app', { waitUntil: 'networkidle' });

    // Start sampling in the background while we trigger a language change.
    const sampling = page.evaluate(async (nsListJson) => {
      const namespaces: string[] = JSON.parse(nsListJson);
      const re = new RegExp(
        `\\b(?:${namespaces.join('|')})\\.[a-zA-Z0-9_]+(?:\\.[a-zA-Z0-9_]+)*\\b`,
      );
      const seen: string[] = [];
      const start = performance.now();
      while (performance.now() - start < 3000) {
        const text = document.body.innerText || '';
        const m = text.match(re);
        if (m) seen.push(m[0]);
        await new Promise((r) => setTimeout(r, 30));
      }
      return seen;
    }, JSON.stringify(KNOWN_NAMESPACES));

    // Trigger language change via the exposed store. We give the sampler a
    // small head start so it captures pre-switch frames too.
    await page.waitForTimeout(100);
    await page.evaluate(async () => {
      // Prefer the store API so preloading runs the same path as production.
      const mod = await import('/src/stores/languageStore.ts').catch(() => null as any);
      if (mod?.useLanguageStore) {
        mod.useLanguageStore.getState().setLanguage('mr');
        return;
      }
      // Fallback: change i18n directly.
      const i18n = (await import('/src/i18n/config.ts')).default;
      await i18n.changeLanguage('mr');
    });

    const offenders = await sampling;

    expect(
      offenders,
      `Untranslated keys visible during switch: ${[...new Set(offenders)].join(', ')}`,
    ).toEqual([]);
  });
});
