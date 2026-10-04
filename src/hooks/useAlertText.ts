import { useEffect, useMemo, useRef, useState } from 'react';
import { translateBatch, type TranslateOptions } from '@/hooks/useTranslateText';

/**
 * Alert text in the farmer's language, for any of the app's languages.
 *
 * An alert row carries English text and, for some rules, a DB-authored copy in
 * a few languages (title_mr, message_hi …). The row's own column for the
 * current language wins; otherwise the English text is translated through the
 * existing translate-text function (the same path community posts use) and
 * kept in memory for the session. No language is special-cased here.
 *
 * Alert and advice text is translated with purpose 'farm_advice' (the farmer's
 * spoken words for that crop and region); `context` tells the translator which
 * crop and stage the text is about. Both are part of the cache key.
 */
export type AlertTextField = 'title' | 'message' | 'action_text';

/** Alert title/message/action text: farmer's spoken register, no field context. */
export const FARM_ADVICE_TEXT: TranslateOptions = { purpose: 'farm_advice' };

export function alertSourceText(row: object, field: AlertTextField, lang: string): { text: string; needsTranslation: boolean } {
  const r = (row ?? {}) as Record<string, unknown>;
  const own = String(r[`${field}_${lang}`] ?? '').trim();
  if (own) return { text: own, needsTranslation: false };
  const en = String(r[`${field}_en`] ?? '').trim();
  return { text: en, needsTranslation: !!en && lang !== 'en' };
}

const cache = new Map<string, string>();
const inflight = new Set<string>();
const key = (lang: string, text: string, scope = '') => `${lang}\u0001${scope}\u0001${text}`;
const scopeOf = (o?: TranslateOptions) => (o?.purpose ? `${o.purpose}|${o.context?.crop ?? ''}|${o.context?.stage ?? ''}|${o.context?.region ?? ''}` : '');
const CHUNK = 20;

/** Translates English strings into `lang` once per session; returns a lookup that falls back to the original. */
export function useTranslatedTexts(
  texts: string[],
  lang: string,
  options?: TranslateOptions,
): { tr: (text: string) => string; pending: boolean } {
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const scope = scopeOf(options);
  const missing = useMemo(
    () => (lang === 'en' ? [] : Array.from(new Set(texts.filter((t) => t && !cache.has(key(lang, t, scope)))))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texts.join('\u0002'), lang, scope, version],
  );

  useEffect(() => {
    const todo = missing.filter((t) => !inflight.has(key(lang, t, scope)));
    if (todo.length === 0) return;
    todo.forEach((t) => inflight.add(key(lang, t, scope)));
    (async () => {
      for (let i = 0; i < todo.length; i += CHUNK) {
        const part = todo.slice(i, i + CHUNK);
        const out = await translateBatch(part, 'en', lang, options);
        part.forEach((t, j) => {
          cache.set(key(lang, t, scope), out?.[j] || t);
          inflight.delete(key(lang, t, scope));
        });
      }
      // Any mounted reader re-renders; a request started by an earlier render still lands.
      if (mounted.current) setVersion((v) => v + 1);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, lang, scope]);

  return {
    tr: (text: string) => (lang === 'en' || !text ? text : cache.get(key(lang, text, scope)) ?? text),
    pending: missing.length > 0,
  };
}
