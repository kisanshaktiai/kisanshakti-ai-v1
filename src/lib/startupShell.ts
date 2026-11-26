import type { TFunction } from 'i18next';

/**
 * The start shell is the screen painted by index.html before any JavaScript
 * runs: the tenant's mark and name from the last visit, a progress line, and
 * the stage the app is at. It stays on screen, outside React's root, until the
 * app is ready, so there is one loading surface instead of three.
 *
 * This module is the app's side of that contract. index.html defines
 * `window.__ksShell`; everything here is a no-op when it is absent (tests,
 * native shells, an old index.html).
 */
export type ShellStage = 'starting' | 'connecting' | 'signing_in' | 'opening';

interface Shell {
  stage: (key: ShellStage) => void;
  done: () => void;
}

const shell = (): Shell | undefined => (typeof window === 'undefined' ? undefined : (window as Window & { __ksShell?: Shell }).__ksShell);

export const shellStage = (key: ShellStage): void => shell()?.stage(key);
export const shellDone = (): void => shell()?.done();

/** localStorage key the shell reads its words from. */
export const SHELL_TEXT_KEY = 'ks_shell_text';

/**
 * Keeps the shell's words in the farmer's language for the next start. The
 * shell itself has no language bundles, so it shows only what the app saved;
 * on the very first visit it shows no words at all.
 */
export function cacheShellText(t: TFunction, language: string): void {
  try {
    localStorage.setItem(SHELL_TEXT_KEY, JSON.stringify({
      lang: language,
      starting: t('common.loader.starting'),
      connecting: t('common.loader.connecting'),
      signing_in: t('common.loader.signing_in'),
      opening: t('common.loader.opening'),
      slow: t('common.loader.slow'),
      retry: t('common.loader.retry'),
    }));
  } catch { /* storage full or blocked: the shell shows the mark alone */ }
}
