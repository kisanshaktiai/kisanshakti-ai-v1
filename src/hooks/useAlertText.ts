import { useEffect, useMemo, useRef, useState } from 'react';
import { translateBatch } from '@/hooks/useTranslateText';

/**
 * Alert text in the farmer's language, for any of the app's languages.
 *
 * An alert row carries English text and, for some rules, a DB-authored copy in
 * a few languages (title_mr, message_hi …). The row's own column for the
 * current language wins; otherwise the English text is translated through the
 * existing translate-text function (the same path community posts use) and
 * kept in memory for the session. No language is special-cased here.
 */
export type AlertTextField = 'title' | 'message' | 'action_text';

export function alertSourceText(row: object, field: AlertTextField, lang: string): { text: string; needsTranslation: boolean } {
  const r = (row ?? {}) as Record<string, unknown>;
  const own = String(r[`${field}_${lang}`] ?? '').trim();
  if (own) return { text: own, needsTranslation: false };
  const en = String(r[`${field}_en`] ?? '').trim();
  return { text: en, needsTranslation: !!en && lang !== 'en' };
}

const cache = new Map<string, string>();
const inflight = new Set<string>();
const key = (lang: string, text: string) => `${lang}\u0001${text}`;
const CHUNK = 20;

/** Translates English strings into `lang` once per session; returns a lookup that falls back to the original. */
export function useTranslatedTexts(texts: string[], lang: string): { tr: (text: string) => string; pending: boolean } {
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const missing = useMemo(
    () => (lang === 'en' ? [] : Array.from(new Set(texts.filter((t) => t && !cache.has(key(lang, t)))))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texts.join('\u0002'), lang, version],
  );

  useEffect(() => {
    const todo = missing.filter((t) => !inflight.has(key(lang, t)));
    if (todo.length === 0) return;
    todo.forEach((t) => inflight.add(key(lang, t)));
    (async () => {
      for (let i = 0; i < todo.length; i += CHUNK) {
        const part = todo.slice(i, i + CHUNK);
        const out = await translateBatch(part, 'en', lang);
        part.forEach((t, j) => {
          cache.set(key(lang, t), out?.[j] || t);
          inflight.delete(key(lang, t));
        });
      }
      // Any mounted reader re-renders; a request started by an earlier render still lands.
      if (mounted.current) setVersion((v) => v + 1);
    })();
  }, [missing, lang]);

  return {
    tr: (text: string) => (lang === 'en' || !text ? text : cache.get(key(lang, text)) ?? text),
    pending: missing.length > 0,
  };
}
