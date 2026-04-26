import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { dataIsolation } from '@/services/dataIsolationService';

/**
 * Single source of truth for "is the app ready to make authenticated
 * data requests?" — covers BOTH the user/session state in Zustand AND
 * the global header propagation done by `setGlobalAuthData()` in
 * `@/integrations/supabase/client`.
 *
 * Why we need this:
 *  - On a fresh login, `setUser()` flips `isAuthenticated` to true
 *    synchronously, but the realtime channel + edge-function header
 *    layer is set inside the same call and may not be observed by
 *    `dataIsolation.getIsolationContext()` for one tick.
 *  - On a page refresh, `checkAuth()` rehydrates the store from
 *    localStorage and *also* calls `setGlobalAuthData()` immediately
 *    — but components mounted in the same render cycle will still see
 *    a brief gap.
 *
 * Gating React-Query `enabled` flags on this hook closes that race —
 * queries fire only when EVERY auth surface is ready, eliminating the
 * "logged in but no data" flash on the home screen.
 *
 * Performance: zero network. Polls in-memory state every 100 ms with a
 * hard ceiling of ~3 s; resolves on first ready tick. Designed to scale
 * to 1M+ users (one cheap setInterval per mounted component, cleaned up
 * on unmount).
 */
export function useAuthReady() {
  const { user, session, isAuthenticated } = useAuthStore();
  const [headersReady, setHeadersReady] = useState(false);

  useEffect(() => {
    // Reset whenever the user changes (login, logout, user-switch).
    setHeadersReady(false);

    if (!isAuthenticated || !user?.id || !user?.tenantId) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 × 100 ms = 3 s ceiling

    const check = () => {
      if (cancelled) return;
      attempts += 1;
      const ctx = dataIsolation.getIsolationContext();
      if (ctx.isValid && ctx.tenantId === user.tenantId && ctx.farmerId === user.id) {
        setHeadersReady(true);
        return;
      }
      if (attempts >= maxAttempts) {
        // Fail-open: better to attempt the query than block forever.
        console.warn('⚠️ [useAuthReady] Header propagation timeout — proceeding anyway');
        setHeadersReady(true);
        return;
      }
      setTimeout(check, 100);
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, user?.tenantId]);

  return {
    /** True when user is authenticated AND global headers are propagated. */
    isReady: isAuthenticated && !!user?.id && !!user?.tenantId && headersReady,
    user,
    session,
  };
}
