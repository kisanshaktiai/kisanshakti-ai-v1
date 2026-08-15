import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguageStore } from '@/stores/languageStore';

/**
 * DB-SSOT chrome copy for farmer-facing UI keys (`ui_translations`).
 * No hardcoded farmer-facing strings: the caller passes the key and gets
 * the DB text for the active language, or the key's English row, or ''.
 */
const cache = new Map<string, string>(); // `${key}::${lang}` → text
let loaded = false;
let inflight: Promise<void> | null = null;

async function loadOnce(): Promise<void> {
  if (loaded) return;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase
        .from('ui_translations')
        .select('ui_key, language_code, display_text')
        .limit(1000);
      if (!error) {
        for (const row of data || []) {
          if (!row?.ui_key || !row?.language_code || !row?.display_text) continue;
          cache.set(`${row.ui_key}::${String(row.language_code).toLowerCase()}`, row.display_text);
        }
        loaded = true;
      }
      inflight = null;
    })();
  }
  return inflight;
}

export function useUiTranslations() {
  const { currentLanguage } = useLanguageStore();
  const lang = (currentLanguage || 'en').toLowerCase();
  const [, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    loadOnce().then(() => { if (alive) setTick((t) => t + 1); });
    return () => { alive = false; };
  }, []);

  const t = (key: string): string =>
    cache.get(`${key}::${lang}`) || cache.get(`${key}::en`) || '';

  return { t, ready: loaded, language: lang };
}
