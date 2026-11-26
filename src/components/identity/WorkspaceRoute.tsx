import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAccountStore } from '@/stores/accountStore';
import { useTenant } from '@/contexts/TenantContext';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { getSessionToken, setSessionToken } from '@/integrations/supabase/client';
import { accountSessionService } from '@/services/accountSessionService';
import {
  ROUTE_ONBOARDING,
  holdsActiveRole,
  landingRouteFor,
  needsOnboarding,
  workspaceRoleOf,
  type AccountRole,
} from '@/lib/accountRoles';

interface WorkspaceRouteProps {
  /** The workspace this route tree belongs to. Omit for pages any signed-in person may open. */
  role?: AccountRole;
  /** Onboarding itself must not be redirected to onboarding. */
  allowIncomplete?: boolean;
  children: React.ReactNode;
}

/**
 * Guard for the Provider and Customer route trees and for the shared account
 * pages. Works from the cached account, so the shells open without a network;
 * when online it re-reads the account once per mount so a role changed from a
 * portal takes effect.
 */
export function WorkspaceRoute({ role, allowIncomplete, children }: WorkspaceRouteProps) {
  const navigate = useNavigate();
  const account = useAccountStore((s) => s.account);
  const token = useAccountStore((s) => s.token);
  const isLive = useAccountStore((s) => s.isLive());
  const { tenant } = useTenant();
  const isOnline = useOfflineStatus();
  const refreshed = useRef(false);
  // Shared pages (no `role`) can be opened by a farmer who signed in before the
  // flag came on: the device then has a session but no account yet.
  const [bootstrap, setBootstrap] = useState<'idle' | 'loading' | 'failed'>('idle');
  const canBootstrap = !role && !account && !!getSessionToken() && bootstrap !== 'failed';

  useEffect(() => {
    if (!canBootstrap || bootstrap !== 'idle') return;
    setBootstrap('loading');
    accountSessionService.refresh().then((state) => setBootstrap(state === 'ok' ? 'idle' : 'failed'));
  }, [canBootstrap, bootstrap]);

  const wrongTenant = !!(account && tenant?.id && account.tenantId !== tenant.id);

  // The shared client must carry this session's token (it is dropped whenever
  // the farmer state is parked).
  useEffect(() => {
    if (isLive && token && getSessionToken() !== token) setSessionToken(token);
  }, [isLive, token]);

  // A session of another tenant, or an expired one, leaves the device.
  useEffect(() => {
    if (wrongTenant || (account && !isLive)) {
      accountSessionService.logout().finally(() => navigate('/auth', { replace: true }));
    }
  }, [wrongTenant, account, isLive, navigate]);

  useEffect(() => {
    if (!isLive || !isOnline || refreshed.current || wrongTenant) return;
    refreshed.current = true;
    accountSessionService.refresh().then((state) => {
      if (state === 'signed-out') navigate('/auth', { replace: true });
    });
  }, [isLive, isOnline, wrongTenant, navigate]);

  if (canBootstrap) {
    return (
      <div className="min-h-mobile-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!account || !isLive || wrongTenant) return <Navigate to="/" replace />;

  const current = workspaceRoleOf(account);
  if (!current) return <Navigate to="/" replace />;

  if (role && (!holdsActiveRole(account, role) || current !== role)) {
    return <Navigate to={landingRouteFor(account) ?? '/'} replace />;
  }

  if (!allowIncomplete && needsOnboarding(account)) {
    return <Navigate to={ROUTE_ONBOARDING} replace />;
  }

  return <>{children}</>;
}
