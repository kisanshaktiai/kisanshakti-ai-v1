/**
 * Lightweight activity tracking used by the automatic PWA update coordinator.
 *
 * React Query covers query/mutation activity, but some important KisanShakti
 * operations use direct fetch/Supabase calls and local async work. This module
 * gives the updater one additional transport/work guard without coupling it to
 * any feature-specific state.
 */

let activeNetworkRequests = 0;
let activePwaWork = 0;
let fetchTrackingInstalled = false;

export function getActiveNetworkRequests(): number {
  return activeNetworkRequests;
}

export function getActivePwaWork(): number {
  return activePwaWork;
}

export function beginPwaWork(): () => void {
  activePwaWork += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activePwaWork = Math.max(0, activePwaWork - 1);
  };
}

/**
 * Wrap the browser fetch once so every direct fetch/Supabase request is visible
 * to the PWA safety gate while it is in flight.
 */
export function installPwaFetchTracking(): void {
  if (typeof window === 'undefined' || fetchTrackingInstalled) return;
  if (typeof window.fetch !== 'function') return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    activeNetworkRequests += 1;

    try {
      return await originalFetch(input, init);
    } finally {
      activeNetworkRequests = Math.max(0, activeNetworkRequests - 1);
    }
  };

  fetchTrackingInstalled = true;
}

/**
 * Test/support reset. Production callers should use beginPwaWork() instead.
 */
export function resetPwaActivityForTests(): void {
  activeNetworkRequests = 0;
  activePwaWork = 0;
  fetchTrackingInstalled = false;
}
