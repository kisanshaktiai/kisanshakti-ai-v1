import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguageStore } from '@/stores/languageStore';

/**
 * DB-SSOT chrome copy for farmer-facing UI keys (`ui_translations`).
 *
 * This is a MIRROR, never an author: the database owns every string. The
 * local copy exists so a reopened chat renders the correct language offline.
 * Server payload strings always win when present.
 *
 * - fetches the active language rows + the `en` fallback rows
 * - persists to localStorage with a 24h TTL
 * - refreshes on app start, on language change, and on foreground
 */
const cache = new Map<string, string>(); // `${key}::${lang}` → text
const loadedLangs = new Set<string>();
const inflight = new Map<string, Promise<void>>();

const TTL_MS = 24 * 60 * 60 * 1000;
const storageKey = (lang: string) => `ui_translations_mirror::${lang}`;

type MirrorPayload = { at: number; rows: Array<[string, string]> };

function hydrateFromStorage(lang: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey(lang));
    if (!raw) return false;
    const parsed: MirrorPayload = JSON.parse(raw);
    if (!parsed?.rows) return false;
    for (const [k, v] of parsed.rows) cache.set(k, v);
    return Date.now() - parsed.at < TTL_MS;
  } catch {
    return false;
  }
}

function persistToStorage(lang: string, rows: Array<[string, string]>) {
  try {
    localStorage.setItem(storageKey(lang), JSON.stringify({ at: Date.now(), rows } as MirrorPayload));
  } catch {
    /* quota / private mode — the in-memory cache still works */
  }
}

async function loadLanguage(lang: string, force = false): Promise<void> {
  if (!force && loadedLangs.has(lang)) return;
  const existing = inflight.get(lang);
  if (existing) return existing;

  const fresh = !force && hydrateFromStorage(lang);
  if (fresh) {
    loadedLangs.add(lang);
    return;
  }

  const p = (async () => {
    const codes = Array.from(new Set([lang, 'en']));
    const { data, error } = await supabase
      .from('ui_translations')
      .select('ui_key, language_code, display_text')
      .in('language_code', codes);
    if (!error) {
      const rows: Array<[string, string]> = [];
      for (const row of data || []) {
        if (!row?.ui_key || !row?.language_code || !row?.display_text) continue;
        const key = `${row.ui_key}::${String(row.language_code).toLowerCase()}`;
        cache.set(key, row.display_text);
        rows.push([key, row.display_text]);
      }
      persistToStorage(lang, rows);
      loadedLangs.add(lang);
    }
    inflight.delete(lang);
  })();

  inflight.set(lang, p);
  return p;
}

export function useUiTranslations() {
  const { currentLanguage } = useLanguageStore();
  const lang = (currentLanguage || 'en').toLowerCase();
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    const bump = () => { if (alive) setTick((t) => t + 1); };

    // offline-first: paint from the mirror immediately, then refresh
    hydrateFromStorage(lang);
    bump();
    loadLanguage(lang).then(bump);

    const onForeground = () => {
      if (document.visibilityState === 'visible') loadLanguage(lang, true).then(bump);
    };
    document.addEventListener('visibilitychange', onForeground);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [lang]);

  const t = (key: string): string =>
    cache.get(`${key}::${lang}`) || cache.get(`${key}::en`) || '';

  return { t, ready: loadedLangs.has(lang), language: lang };
}
