import { lazy, ComponentType } from 'react';

/**
 * lazyWithRetry — wraps React.lazy with:
 *  1. Up to 3 retries with exponential backoff (handles transient CDN/network blips
 *     that are common on mobile / iOS Safari when fetching chunks).
 *  2. One-shot hard reload when the failure looks like a stale-chunk after a new
 *     deploy ("Importing a module script failed" / "Failed to fetch dynamically
 *     imported module" / "Loading chunk … failed"). A sessionStorage flag prevents
 *     reload loops.
 *
 * Without this, after every deploy users on the old HTML get a permanent 500-Error
 * boundary when navigating to a new lazy route, because the hashed JS no longer
 * exists on the server.
 */

const RELOAD_KEY = '__chunk_reload_attempted__';

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [^\s]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /ChunkLoadError/i.test(msg)
  );
}

async function retryImport<T>(
  factory: () => Promise<T>,
  attempts = 3,
  delayMs = 400,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await factory();
    } catch (err) {
      lastErr = err;
      if (!isChunkLoadError(err)) throw err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await retryImport(factory);
    } catch (err) {
      if (isChunkLoadError(err) && typeof window !== 'undefined') {
        const already = sessionStorage.getItem(RELOAD_KEY);
        if (!already) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          // Clear any caches that might be serving stale index/chunks
          try {
            if ('caches' in window) {
              const names = await caches.keys();
              await Promise.all(names.map((n) => caches.delete(n)));
            }
            if (navigator.serviceWorker?.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
            }
          } catch {
            /* ignore */
          }
          // Force a fresh document fetch to pick up the new index.html + chunk hashes
          const url = new URL(window.location.href);
          url.searchParams.set('_v', Date.now().toString(36));
          window.location.replace(url.toString());
          // Return a never-resolving promise so React doesn't render an error
          return new Promise<never>(() => {});
        }
      }
      throw err;
    }
  });
}

/** Call once on a successful navigation to clear the reload guard. */
export function clearChunkReloadGuard() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
