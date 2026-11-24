import { Navigate } from 'react-router-dom';
import { useAccountStore } from '@/stores/accountStore';
import { landingRouteFor, workspaceRoleOf } from '@/lib/accountRoles';
import { WorkspaceSwitcher } from '@/components/identity/WorkspaceSwitcher';

/**
 * Role gate at the entry of the farmer route tree (/app/*).
 *
 * It WRAPS the existing ProtectedRoute and does not replace it:
 *   - no account known on the device (flag off, or a farmer who signed in
 *     before the flag came on) → children render exactly as before;
 *   - the session belongs to the Provider or Customer workspace → the person is
 *     sent there and no farmer page is mounted;
 *   - the session is in the Farmer workspace → children render, plus the
 *     workspace switcher for people who hold several roles.
 *
 * This is a convenience for the person, not the security boundary: the
 * database refuses farmer rows to a session whose role is not FARMER.
 */
export function FarmerRoleGate({ children }: { children: React.ReactNode }) {
  const account = useAccountStore((s) => s.account);
  const role = workspaceRoleOf(account);

  if (account && role && role !== 'FARMER') {
    return <Navigate to={landingRouteFor(account) ?? '/'} replace />;
  }

  return (
    <>
      {children}
      {account && role === 'FARMER' && <WorkspaceSwitcher variant="floating" />}
    </>
  );
}
