import type { AccountRole } from '@/lib/accountRoles';

/**
 * Code of the screen each workspace opens on. The app loads these parts only
 * when they are first shown (see the lazy imports in src/App.tsx); asking for
 * them here, while the person is still choosing a workspace, means the screen
 * is ready the moment the server has moved the session. The same module asked
 * for twice is loaded once.
 */
const HOME_SCREEN: Record<AccountRole, () => Promise<unknown>> = {
  FARMER: () => import('@/pages/Home'),
  SERVICE_PROVIDER: () => Promise.all([
    import('@/components/identity/WorkspaceLayout'),
    import('@/pages/provider/ProviderHome'),
  ]),
  CUSTOMER: () => Promise.all([
    import('@/components/identity/WorkspaceLayout'),
    import('@/pages/identity/WorkspaceHome'),
  ]),
};

/** Loads the opening screens of the given workspaces in the background. Never throws. */
export function preloadWorkspaces(roles: readonly AccountRole[]): void {
  for (const role of roles) {
    HOME_SCREEN[role]().catch(() => { /* offline or an old build: the route loads it when opened */ });
  }
}
