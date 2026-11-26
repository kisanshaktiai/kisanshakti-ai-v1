import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ online: true }));

// Strings are checked by key (with their values), so the test does not depend
// on any language.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/lib/accountErrors', () => ({ accountErrorMessage: () => 'identity.errors.generic' }));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/components/identity/ReachEditor', () => ({ ReachEditor: () => null }));
vi.mock('@/services/accountSessionService', () => ({
  accountSessionService: { logout: vi.fn(), updateAccount: vi.fn() },
}));
vi.mock('@/services/farmerAuthService', () => ({ isMultiRoleEnabled: () => true }));
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    currentLanguage: 'en',
    availableLanguages: [{ code: 'en', nativeName: 'English' }],
    setLanguage: vi.fn(),
  }),
}));

import WorkspaceHome from '@/pages/identity/WorkspaceHome';
import WorkspaceProfile from '@/pages/identity/WorkspaceProfile';
import { useAccountStore, type ReachState } from '@/stores/accountStore';
import type { AccountRole } from '@/lib/accountRoles';

const policy = {
  radius_min_km: 5, radius_max_km: 100, radius_step_km: 5, radius_default_km: 25,
  change_limit_count: 3, change_limit_window_days: 7,
};
const reach = (role: AccountRole, over: Partial<ReachState>): ReachState => ({
  role, is_set: false, base_village_id: null, radius_km: null, changed_at: null,
  policy, changes_used: 0, changes_remaining: 3, next_change_at: null, ...over,
});

function signIn(role: Exclude<AccountRole, 'FARMER'>) {
  act(() => useAccountStore.getState().setAccountSession(
    {
      id: 'acc-1', tenantId: 'tenant-1', displayName: 'Test Person', avatarUrl: null,
      languageCode: 'en', mobileMasked: '98****10', roles: [{ role, status: 'ACTIVE' }], activeRole: role,
    },
    'tok-1', new Date(Date.now() + 3600_000).toISOString(),
  ));
}

const text = (ui: React.ReactElement) => {
  cleanup();
  return render(<MemoryRouter>{ui}</MemoryRouter>).container.textContent ?? '';
};

describe('workspace home shells', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    mocks.online = true;
    useAccountStore.getState().clear();
  });

  it('customer home: greeting, Reach not set, and the produce empty state only', () => {
    signIn('CUSTOMER');
    const out = text(<WorkspaceHome role="CUSTOMER" />);
    expect(out).toContain('identity.home.greeting{"name":"Test Person"}');
    expect(out).toContain('identity.reach.notSet');
    expect(out).toContain('identity.reach.set');
    expect(out).toContain('identity.home.CUSTOMER.produceTitle');
    expect(out).not.toContain('identity.home.SERVICE_PROVIDER');
  });

  it('provider home: empty states for incoming requests and for jobs', () => {
    signIn('SERVICE_PROVIDER');
    const out = text(<WorkspaceHome role="SERVICE_PROVIDER" />);
    expect(out).toContain('identity.home.SERVICE_PROVIDER.requestsTitle');
    expect(out).toContain('identity.home.SERVICE_PROVIDER.jobsTitle');
    expect(out).not.toContain('identity.home.CUSTOMER');
  });

  it('Reach card shows the saved village, the radius and the changes that remain', () => {
    signIn('CUSTOMER');
    act(() => useAccountStore.getState().setReach('CUSTOMER', reach('CUSTOMER', {
      is_set: true, base_village_id: 'v-1', radius_km: 25, village_name: 'Sample Village',
      changes_used: 1, changes_remaining: 2,
    })));
    const out = text(<WorkspaceHome role="CUSTOMER" />);
    expect(out).toContain('identity.reach.summary{"village":"Sample Village","km":25}');
    expect(out).toContain('identity.reach.changesRemaining{"count":2,"days":7}');
    expect(out).toContain('identity.reach.change');
    expect(out).not.toContain('identity.reach.notSet');
  });

  it('Reach of one role is not shown in the other workspace', () => {
    signIn('SERVICE_PROVIDER');
    act(() => useAccountStore.getState().setReach('CUSTOMER', reach('CUSTOMER', {
      is_set: true, base_village_id: 'v-1', radius_km: 25, village_name: 'Sample Village',
    })));
    expect(text(<WorkspaceHome role="SERVICE_PROVIDER" />)).toContain('identity.reach.notSet');
  });

  it('offline: the Reach card says a connection is needed', () => {
    mocks.online = false;
    signIn('CUSTOMER');
    expect(text(<WorkspaceHome role="CUSTOMER" />)).toContain('identity.reach.offline');
  });

  it('profile tab: display name, masked mobile only, language, Roles row and logout', () => {
    signIn('CUSTOMER');
    const out = text(<WorkspaceProfile />);
    expect(out).toContain('Test Person');
    expect(out).toContain('98****10');
    expect(out).toContain('English');
    expect(out).toContain('identity.rolesPage.title');
    expect(out).toContain('auth.logout');
    expect(out).not.toMatch(/\d{10}/);
  });
});
