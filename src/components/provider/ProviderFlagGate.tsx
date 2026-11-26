import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useProviderStore } from '@/stores/providerStore';
import { PROVIDER_ROUTES } from '@/lib/providerRoutes';

interface ProviderFlagGateProps {
  children: ReactNode;
  /** Shown while the flag is off. Without it, the route leads back to the provider home. */
  fallback?: ReactNode;
}

/**
 * Keeps every Provider Workspace screen behind the provider_workspace flag.
 * With the flag off the provider home is the Task 1 shell (the fallback) and
 * the business routes do not open.
 */
export function ProviderFlagGate({ children, fallback }: ProviderFlagGateProps) {
  const enabled = useProviderStore((s) => s.enabled);
  if (enabled) return <>{children}</>;
  return fallback ? <>{fallback}</> : <Navigate to={PROVIDER_ROUTES.home} replace />;
}
