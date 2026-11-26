import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/config', async () => {
  const actual = await vi.importActual<typeof import('@/i18n/config')>('@/i18n/config');
  return { ...actual, loadPageTranslations: vi.fn().mockResolvedValue(undefined) };
});
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [
              { code: 'hi', name: 'Hindi', native_name: 'हिन्दी', display_order: 1 },
              { code: 'te', name: 'Telugu', native_name: 'తెలుగు', display_order: 6 },
              { code: 'mr', name: 'Marathi', native_name: 'मराठी', display_order: 4 },
              { code: 'ur', name: 'Urdu', native_name: 'اردو', display_order: 13 },
            ],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import { useLanguageStore } from '@/stores/languageStore';
import { TRANSLATED_LANGUAGES } from '@/i18n/config';

describe('language pickers offer only languages the app has screens for', () => {
  beforeEach(() => localStorage.clear());

  it('the built-in list is limited to the translated languages', () => {
    const codes = useLanguageStore.getState().availableLanguages.map((l) => l.code);
    expect(codes).toEqual(expect.arrayContaining([...TRANSLATED_LANGUAGES]));
    expect(codes.every((c) => TRANSLATED_LANGUAGES.includes(c))).toBe(true);
  });

  it('a list read from the server is filtered the same way', async () => {
    await useLanguageStore.getState().fetchLanguages();
    expect(useLanguageStore.getState().availableLanguages.map((l) => l.code)).toEqual(['hi', 'mr']);
  });

  it('a saved choice of a language without screens falls back to English on the next start', () => {
    const persisted = useLanguageStore.persist.getOptions();
    const migrated = persisted.migrate!({ currentLanguage: 'te', availableLanguages: [{ code: 'te', name: 'Telugu', nativeName: 'తెలుగు' }] }, 1) as { currentLanguage: string; availableLanguages: { code: string }[] };
    expect(migrated.currentLanguage).toBe('en');
    expect(migrated.availableLanguages).toEqual([]);
    const kept = persisted.migrate!({ currentLanguage: 'mr', availableLanguages: [] }, 1) as { currentLanguage: string };
    expect(kept.currentLanguage).toBe('mr');
  });
});
