import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  token: null as string | null,
  auth: {
    user: null as any,
    session: null as any,
    setUser: vi.fn(),
    setSession: vi.fn(),
    logout: vi.fn(),
  },
  switchRole: vi.fn(),
  sessionInfo: vi.fn(),
  serverLogout: vi.fn(),
  clearCachedAuth: vi.fn(),
  updateHeaders: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSessionToken: () => mocks.token,
  setSessionToken: (t: string | null) => { mocks.token = t; },
  updateSupabaseHeaders: mocks.updateHeaders,
}));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => mocks.auth } }));
vi.mock('@/services/farmerAuthService', () => {
  class FarmerAuthError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
  return {
    FarmerAuthError,
    farmerAuthService: {
      switchRole: mocks.switchRole,
      sessionInfo: mocks.sessionInfo,
      logout: mocks.serverLogout,
    },
  };
});
vi.mock('@/services/offlineAuthService', () => ({
  offlineAuthService: { clearCachedAuth: mocks.clearCachedAuth },
}));

import { accountSessionService, REGISTER_ROLES_KEY } from './accountSessionService';
import { FarmerAuthError } from './farmerAuthService';
import { useAccountStore } from '@/stores/accountStore';
import type { AccountSummary } from '@/lib/accountRoles';

const account = (over: Partial<AccountSummary>): AccountSummary => ({
  id: 'acc-1',
  tenantId: 'tenant-1',
  displayName: 'Test Person',
  avatarUrl: null,
  languageCode: 'en',
  mobileMasked: '98****10',
  roles: [{ role: 'FARMER', status: 'ACTIVE' }],
  activeRole: 'FARMER',
  ...over,
});
const session = { token: 'tok-1', expiresAt: new Date(Date.now() + 3600_000).toISOString() };
const farmer = { id: 'acc-1', tenant_id: 'tenant-1', mobile_number: '9000000001', farmer_code: 'KIS000001' };

describe('accountSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.token = null;
    mocks.auth.user = null;
    mocks.auth.session = null;
    useAccountStore.getState().clear();
  });

  describe('applyAuthResult', () => {
    it('flag off (no account in the reply): returns null, stores nothing, touches no farmer state', () => {
      useAccountStore.getState().setAccountSession(
        account({ roles: [{ role: 'CUSTOMER', status: 'ACTIVE' }], activeRole: 'CUSTOMER' }), 'old', null,
      );
      expect(accountSessionService.applyAuthResult({ session } as any)).toBeNull();
      expect(useAccountStore.getState().account).toBeNull();
      expect(mocks.auth.setUser).not.toHaveBeenCalled();
      expect(mocks.auth.setSession).not.toHaveBeenCalled();
    });

    it('farmer workspace: stores the account and lets the farmer code continue', () => {
      expect(accountSessionService.applyAuthResult({ session, account: account({}) })).toBeNull();
      expect(useAccountStore.getState().account?.id).toBe('acc-1');
      expect(useAccountStore.getState().token).toBe('tok-1');
      expect(mocks.auth.setUser).not.toHaveBeenCalled();
      expect(mocks.auth.setSession).not.toHaveBeenCalled();
    });

    it('provider workspace: parks the farmer state, keeps the token and routes to the workspace', () => {
      mocks.auth.user = { id: 'acc-1' };
      mocks.auth.session = { token: 'tok-0' };
      localStorage.setItem(REGISTER_ROLES_KEY, '["SERVICE_PROVIDER"]');
      const dest = accountSessionService.applyAuthResult({
        session,
        account: account({
          roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'SERVICE_PROVIDER', status: 'ACTIVE' }],
          activeRole: 'SERVICE_PROVIDER',
        }),
      });
      expect(dest).toBe('/provider');
      expect(mocks.auth.setSession).toHaveBeenCalledWith(null);
      expect(mocks.auth.setUser).toHaveBeenCalledWith(null);
      expect(mocks.token).toBe('tok-1');
      expect(localStorage.getItem(REGISTER_ROLES_KEY)).toBeNull();
    });

    it('a new non-farmer without a display name goes to onboarding', () => {
      const dest = accountSessionService.applyAuthResult({
        session,
        account: account({
          displayName: null,
          roles: [{ role: 'CUSTOMER', status: 'ACTIVE' }],
          activeRole: 'CUSTOMER',
        }),
      });
      expect(dest).toBe('/welcome');
    });
  });

  describe('switchWorkspace', () => {
    it('to FARMER: fills the farmer state from the server reply', async () => {
      useAccountStore.getState().setAccountSession(
        account({
          roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }],
          activeRole: 'CUSTOMER',
        }),
        'tok-1', session.expiresAt,
      );
      mocks.switchRole.mockResolvedValue({
        account: account({
          roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }],
          activeRole: 'FARMER',
        }),
        farmer,
        profile: null,
      });
      expect(await accountSessionService.switchWorkspace('FARMER')).toBe('/app');
      expect(mocks.auth.setSession).toHaveBeenCalledWith(
        expect.objectContaining({ farmerId: 'acc-1', token: 'tok-1', isPinVerified: true }),
      );
      expect(mocks.auth.setUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-1', tenantId: 'tenant-1', role: 'farmer', sessionToken: 'tok-1' }),
      );
      expect(useAccountStore.getState().account?.activeRole).toBe('FARMER');
    });

    it('away from FARMER: parks the farmer state and keeps the token', async () => {
      mocks.auth.user = { id: 'acc-1' };
      mocks.auth.session = { token: 'tok-1' };
      useAccountStore.getState().setAccountSession(
        account({ roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }] }),
        'tok-1', session.expiresAt,
      );
      mocks.switchRole.mockResolvedValue({
        account: account({
          roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }],
          activeRole: 'CUSTOMER',
        }),
        farmer: null,
        profile: null,
      });
      expect(await accountSessionService.switchWorkspace('CUSTOMER')).toBe('/customer');
      expect(mocks.auth.setSession).toHaveBeenCalledWith(null);
      expect(mocks.auth.setUser).toHaveBeenCalledWith(null);
      expect(mocks.token).toBe('tok-1');
    });

    it('a refused switch changes nothing on the device', async () => {
      const before = account({
        roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }],
      });
      useAccountStore.getState().setAccountSession(before, 'tok-1', session.expiresAt);
      mocks.switchRole.mockRejectedValue(new FarmerAuthError('role_not_held', 'role_not_held'));
      await expect(accountSessionService.switchWorkspace('SERVICE_PROVIDER')).rejects.toMatchObject({ code: 'role_not_held' });
      expect(useAccountStore.getState().account).toEqual(before);
      expect(mocks.auth.setUser).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('keeps the cached account when the network is down', async () => {
      useAccountStore.getState().setAccountSession(account({}), 'tok-1', session.expiresAt);
      mocks.sessionInfo.mockRejectedValue(new FarmerAuthError('transport_unavailable', 'x'));
      expect(await accountSessionService.refresh()).toBe('offline');
      expect(useAccountStore.getState().account?.id).toBe('acc-1');
      expect(mocks.auth.logout).not.toHaveBeenCalled();
    });

    it('clears the device when the server no longer knows the session', async () => {
      useAccountStore.getState().setAccountSession(account({}), 'tok-1', session.expiresAt);
      mocks.sessionInfo.mockRejectedValue(new FarmerAuthError('session_required', 'x'));
      expect(await accountSessionService.refresh()).toBe('signed-out');
      expect(useAccountStore.getState().account).toBeNull();
      expect(mocks.auth.logout).toHaveBeenCalled();
    });
  });

  it('logout revokes the session and removes everything readable from the device', async () => {
    useAccountStore.getState().setAccountSession(
      account({ roles: [{ role: 'CUSTOMER', status: 'ACTIVE' }], activeRole: 'CUSTOMER' }), 'tok-1', session.expiresAt,
    );
    localStorage.setItem('authMobile', '9000000001');
    localStorage.setItem(REGISTER_ROLES_KEY, '["CUSTOMER"]');
    await accountSessionService.logout();
    expect(mocks.serverLogout).toHaveBeenCalledWith('tok-1');
    expect(mocks.auth.logout).toHaveBeenCalled();
    expect(mocks.clearCachedAuth).toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem('account-storage') || '{}')?.state ?? {};
    expect(stored.account ?? null).toBeNull();
    expect(stored.token ?? null).toBeNull();
    expect(localStorage.getItem('authMobile')).toBeNull();
    expect(localStorage.getItem(REGISTER_ROLES_KEY)).toBeNull();
  });

  it('the farmer logout event also removes the account', () => {
    useAccountStore.getState().setAccountSession(account({}), 'tok-1', session.expiresAt);
    window.dispatchEvent(new Event('ks:auth-logout'));
    expect(useAccountStore.getState().account).toBeNull();
    expect(useAccountStore.getState().token).toBeNull();
  });
});
