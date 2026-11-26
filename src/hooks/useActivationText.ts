/**
 * useActivationText — t() for the farmer activation screens.
 *
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part).
 *
 * Every new farmer passes the Activate screen before anything else, in whatever
 * language they picked. Page bundles exist for a few languages only and the
 * English page bundle is not loaded for the others, so a missing translation
 * would show a raw key on the one screen nobody can skip. The English bundle is
 * therefore built into these screens as the fallback text.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import en from '@/i18n/locales/en/activation.json';

function englishText(key: string): string | undefined {
  let node: unknown = en.activation;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Returns tr('scanner.title') → the text of activation.scanner.title. */
export function useActivationText() {
  const { t } = useTranslation();
  return useCallback(
    (key: string, options?: Record<string, unknown>): string =>
      String(t(`activation.${key}`, { defaultValue: englishText(key) ?? '', ...options })),
    [t],
  );
}

/** Whether the activation bundle has a text for this key (used for server result codes). */
export function hasActivationText(key: string): boolean {
  return englishText(key) !== undefined;
}
