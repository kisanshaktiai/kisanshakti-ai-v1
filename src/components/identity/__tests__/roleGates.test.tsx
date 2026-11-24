import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  tenantId: 'tenant-1' as string | null,
  refresh: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/components/identity/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: mocks.tenantId ? { id: mocks.tenantId } : null }),
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => true }));
vi.mock('@/integrations/supabase/client', () => ({
  getSessionToken: () => null,
  setSessionToken: vi.fn(),
}));
vi.mock('@/services/accountSessionService', () => ({
  accountSessionService: { refresh: mocks.refresh, logout: mocks.logout },
}));

import { FarmerRoleGate } from '../FarmerRoleGate';
import { WorkspaceRoute } from '../WorkspaceRoute';
import { AccountResume } from '../AccountResume';
import { useAccountStore } from '@/stores/accountStore';
import type { AccountRole, AccountSummary } from '@/lib/accountRoles';

const account = (roles: AccountRole[], activeRole: AccountRole, over: Partial<AccountSummary> = {}): AccountSummary => ({
  id: 'acc-1',
  tenantId: 'tenant-1',
  displayName: 'Test Person',
  avatarUrl: null,
  languageCode: 'en',
  mobileMasked: '98****10',
  roles: roles.map((role) => ({ role, status: 'ACTIVE' as const })),
  activeRole,
  ...over,
});

const signIn = (a: AccountSummary, expiresAt = new Date(Date.now() + 3600_000).toISOString()) =>
  act(() => useAccountStore.getState().setAccountSession(a, 'tok-1', expiresAt));

function renderAt(path: string) {
  cleanup(); // one tree at a time, so a later sign-in cannot touch an earlier render
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>SPLASH</div>} />
        <Route path="/auth" element={<AccountResume><div>SIGN-IN</div></AccountResume>} />
        <Route path="/welcome" element={<WorkspaceRoute allowIncomplete><div>ONBOARDING</div></WorkspaceRoute>} />
        <Route path="/roles" element={<WorkspaceRoute><div>ROLES</div></WorkspaceRoute>} />
        <Route path="/app/*" element={<FarmerRoleGate><div>FARMER-APP</div></FarmerRoleGate>} />
        <Route path="/provider" element={<WorkspaceRoute role="SERVICE_PROVIDER"><div>PROVIDER-HOME</div></WorkspaceRoute>} />
        <Route path="/customer" element={<WorkspaceRoute role="CUSTOMER"><div>CUSTOMER-HOME</div></WorkspaceRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('role gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.tenantId = 'tenant-1';
    mocks.refresh.mockResolvedValue('ok');
    mocks.logout.mockResolvedValue(undefined);
    cleanup();
    useAccountStore.getState().clear();
  });

  it('flag off (no account on the device): the farmer route tree renders as before', () => {
    expect(renderAt('/app/weather').container.textContent).toBe('FARMER-APP');
  });

  it('a farmer in the Farmer workspace reaches the farmer route tree', () => {
    signIn(account(['FARMER', 'CUSTOMER'], 'FARMER'));
    expect(renderAt('/app').container.textContent).toBe('FARMER-APP');
  });

  it('a person without the Farmer role is kept out of /app and no farmer page mounts', () => {
    signIn(account(['CUSTOMER'], 'CUSTOMER'));
    expect(renderAt('/app/lands').container.textContent).toBe('CUSTOMER-HOME');
  });

  it('a farmer whose session is in another workspace is sent to that workspace', () => {
    signIn(account(['FARMER', 'SERVICE_PROVIDER'], 'SERVICE_PROVIDER'));
    expect(renderAt('/app').container.textContent).toBe('PROVIDER-HOME');
  });

  it('a workspace the person does not hold redirects to the one they do', () => {
    signIn(account(['CUSTOMER'], 'CUSTOMER'));
    expect(renderAt('/provider').container.textContent).toBe('CUSTOMER-HOME');
  });

  it('a held workspace that is not the session role is not opened by URL', () => {
    signIn(account(['SERVICE_PROVIDER', 'CUSTOMER'], 'CUSTOMER'));
    expect(renderAt('/provider').container.textContent).toBe('CUSTOMER-HOME');
  });

  it('nobody signed in: workspace routes go to the splash', () => {
    expect(renderAt('/customer').container.textContent).toBe('SPLASH');
    expect(renderAt('/roles').container.textContent).toBe('SPLASH');
  });

  it('an expired session is not let in and is cleared from the device', () => {
    signIn(account(['CUSTOMER'], 'CUSTOMER'), new Date(Date.now() - 1000).toISOString());
    expect(renderAt('/customer').container.textContent).toBe('SPLASH');
    expect(mocks.logout).toHaveBeenCalled();
  });

  it('a session of another tenant is not let in and is cleared from the device', () => {
    mocks.tenantId = 'tenant-2';
    signIn(account(['CUSTOMER'], 'CUSTOMER'));
    expect(renderAt('/customer').container.textContent).toBe('SPLASH');
    expect(mocks.logout).toHaveBeenCalled();
  });

  it('a new non-farmer without a display name is taken to onboarding', () => {
    signIn(account(['CUSTOMER'], 'CUSTOMER', { displayName: null }));
    expect(renderAt('/customer').container.textContent).toBe('ONBOARDING');
  });

  it('the sign-in entry resumes a live non-farmer session and shows sign-in to everyone else', () => {
    expect(renderAt('/auth').container.textContent).toBe('SIGN-IN');
    signIn(account(['FARMER'], 'FARMER'));
    expect(renderAt('/auth').container.textContent).toBe('SIGN-IN');
    signIn(account(['CUSTOMER'], 'CUSTOMER'));
    expect(renderAt('/auth').container.textContent).toBe('CUSTOMER-HOME');
  });

  it('a signed-in farmer can open the shared Roles page', () => {
    signIn(account(['FARMER'], 'FARMER'));
    expect(renderAt('/roles').container.textContent).toBe('ROLES');
  });
});
