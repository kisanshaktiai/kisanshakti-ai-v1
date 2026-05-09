import { ReactNode } from 'react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useAuthReady } from '@/hooks/useAuthReady';
import { TenantSuspendedScreen } from './TenantSuspendedScreen';

/**
 * AppBootGate — last-mile guard wrapped around authenticated routes.
 *
 * Responsibilities (Phase 5):
 *   1. Wait for auth + tenant headers to propagate (`useAuthReady`).
 *   2. Resolve unified entitlements (`useEntitlements` → resolve_farmer_entitlements RPC).
 *   3. If the TENANT itself is suspended past its grace period, swap the entire
 *      authenticated UI for `<TenantSuspendedScreen />` — farmers cannot use any
 *      feature until their organisation renews.
 *   4. Otherwise render children. Per-feature gating is handled by `useEntitlements`
 *      (`canUse('ai_chat')`, `LandLimitGuard`, etc.) — this component is intentionally
 *      coarse-grained so it stays cheap (one RPC, 5-minute SWR cache).
 *
 * Designed for 1M+ users: the RPC is cached per (farmer, tenant) for 5 minutes by
 * React Query, so even with millions of mounts the DB sees ~12 calls/farmer/hour.
 */
export function AppBootGate({ children }: { children: ReactNode }) {
  const { isReady } = useAuthReady();
  const { data, isLoading } = useEntitlements();

  // While auth or entitlements are still loading, render children optimistically —
  // the rest of the app already shows skeleton/loaders. Blocking here would cause
  // a double-loader flash on every route change.
  if (!isReady || isLoading || !data) return <>{children}</>;

  if (data.tenant?.suspended) {
    return <TenantSuspendedScreen />;
  }

  return <>{children}</>;
}
