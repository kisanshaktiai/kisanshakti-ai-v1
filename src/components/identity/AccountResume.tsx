import { Navigate } from 'react-router-dom';
import { useAccountStore } from '@/stores/accountStore';
import { landingRouteFor, workspaceRoleOf } from '@/lib/accountRoles';

/**
 * Wraps the sign-in entry. The splash screen sends everyone who is not an
 * authenticated farmer to /auth; a person whose live session is in the Provider
 * or Customer workspace is taken back to that workspace instead of being asked
 * to sign in again. Everyone else sees the sign-in screen as before.
 */
export function AccountResume({ children }: { children: React.ReactNode }) {
  const account = useAccountStore((s) => s.account);
  const isLive = useAccountStore((s) => s.isLive());
  const role = workspaceRoleOf(account);

  if (account && isLive && role && role !== 'FARMER') {
    return <Navigate to={landingRouteFor(account) ?? '/'} replace />;
  }
  return <>{children}</>;
}
