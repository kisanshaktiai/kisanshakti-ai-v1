import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  online: true,
  switchWorkspace: vi.fn(),
  sessionInfo: vi.fn(),
  preload: vi.fn(),
}));

// Strings are checked by key, so the test does not depend on any language.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}${JSON.stringify(params)}` : key),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/lib/haptics', () => ({ hapticFeedback: vi.fn() }));
vi.mock('@/lib/accountErrors', () => ({ accountErrorMessage: () => 'identity.errors.generic' }));
vi.mock('@/lib/workspacePreload', () => ({ preloadWorkspaces: mocks.preload }));
vi.mock('@/services/accountSessionService', () => ({
  accountSessionService: { switchWorkspace: mocks.switchWorkspace },
}));
vi.mock('@/services/farmerAuthService', () => {
  class FarmerAuthError extends Error {
    code: string;
    constructor(code: string, message: string) { super(message); this.code = code; }
  }
  return { FarmerAuthError, farmerAuthService: { sessionInfo: mocks.sessionInfo } };
});

import { WorkspaceSwitcher } from '@/components/identity/WorkspaceSwitcher';
import { WorkspaceLayout } from '@/components/identity/WorkspaceLayout';
import { useAccountStore } from '@/stores/accountStore';
import { FarmerAuthError } from '@/services/farmerAuthService';
import type { AccountRole } from '@/lib/accountRoles';

vi.mock('@/components/LanguageSelector', () => ({ LanguageSelector: () => null }));
vi.mock('@/components/header/SpeakPageButton', () => ({ SpeakPageButton: () => null }));
vi.mock('@/components/identity/ReachCard', () => ({ ReachHeaderButton: () => null }));
vi.mock('@/hooks/useAccountReach', () => ({ useAccountReach: () => undefined }));
vi.mock('@/hooks/useProviderFlag', () => ({ useProviderFlag: () => false }));
vi.mock('@/hooks/useProviderRequestsInbox', () => ({ useProviderRequestsInbox: () => ({ inbox: null }) }));

function signIn(roles: AccountRole[], activeRole: AccountRole) {
  act(() => useAccountStore.getState().setAccountSession(
    {
      id: 'acc-1', tenantId: 'tenant-1', displayName: 'Test Person', avatarUrl: null, languageCode: 'en',
      mobileMasked: '98****10', roles: roles.map((role) => ({ role, status: 'ACTIVE' as const })), activeRole,
    },
    'tok-1', new Date(Date.now() + 3600_000).toISOString(),
  ));
}

let client: QueryClient;
function show(variant: 'header' | 'floating', path = '/app') {
  cleanup();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/provider" element={<p>provider-home</p>} />
          <Route path="/roles" element={<p>roles-page</p>} />
          <Route path="*" element={<WorkspaceSwitcher variant={variant} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const trigger = () => screen.getByRole('button', { name: /identity\.switcher\.open/ });
const choice = (role: AccountRole) => screen.getByRole('radio', { name: new RegExp(`identity\\.roles\\.${role}\\.name`) });

describe('Workspace switcher: one picture, the choices in the same place', () => {
  beforeEach(() => {
    mocks.online = true;
    mocks.switchWorkspace.mockReset();
    mocks.sessionInfo.mockReset().mockResolvedValue({});
    mocks.preload.mockReset();
    act(() => useAccountStore.getState().clear());
  });

  it('is not shown to a person with one role', () => {
    signIn(['FARMER'], 'FARMER');
    const { container } = show('floating');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows one round picture and no name beside it; one tap shows every held workspace there, with the open one marked', () => {
    signIn(['FARMER', 'SERVICE_PROVIDER', 'CUSTOMER'], 'FARMER');
    show('header');
    expect(trigger().textContent).toBe('');
    expect(screen.queryByRole('radio')).toBeNull();
    fireEvent.click(trigger());
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(choice('FARMER').getAttribute('aria-checked')).toBe('true');
    expect(choice('SERVICE_PROVIDER').getAttribute('aria-checked')).toBe('false');
    // no bottom sheet and no second screen
    expect(screen.queryByRole('dialog')?.getAttribute('data-side') ?? 'bottom').toBe('bottom');
    expect(document.querySelector('[data-vaul-drawer], [data-radix-dialog-overlay]')).toBeNull();
    // all three held: nothing to add
    expect(screen.queryByText('identity.switcher.addRole')).toBeNull();
  });

  it('opening the choices loads the other workspaces\' screens and wakes the server, without changing anything', () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    show('floating');
    fireEvent.click(trigger());
    expect(mocks.preload).toHaveBeenCalledWith(['SERVICE_PROVIDER']);
    expect(mocks.sessionInfo).toHaveBeenCalledTimes(1);
    expect(mocks.switchWorkspace).not.toHaveBeenCalled();
    expect(useAccountStore.getState().account?.activeRole).toBe('FARMER');
  });

  it('a tap on another workspace opens it; what the farmer screens had read is kept and marked old', async () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    mocks.switchWorkspace.mockResolvedValue('/provider');
    show('floating');
    client.setQueryData(['lands', 'acc-1'], [{ id: 'land-1' }]);
    fireEvent.click(trigger());
    fireEvent.click(choice('SERVICE_PROVIDER'));
    expect(await screen.findByText('provider-home')).not.toBeNull();
    expect(mocks.switchWorkspace).toHaveBeenCalledWith('SERVICE_PROVIDER');
    expect(client.getQueryData(['lands', 'acc-1'])).toEqual([{ id: 'land-1' }]);
    expect(client.getQueryState(['lands', 'acc-1'])?.isInvalidated).toBe(true);
  });

  it('a tap on the open workspace only closes the choices', () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    show('header');
    fireEvent.click(trigger());
    fireEvent.click(choice('FARMER'));
    expect(mocks.switchWorkspace).not.toHaveBeenCalled();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('with two roles the third place offers to add a role', async () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    show('header');
    fireEvent.click(trigger());
    fireEvent.click(screen.getByText('identity.switcher.addRole'));
    expect(await screen.findByText('roles-page')).not.toBeNull();
  });

  it('offline: says a connection is needed and asks the server for nothing', () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    mocks.online = false;
    show('floating');
    fireEvent.click(trigger());
    expect(mocks.sessionInfo).not.toHaveBeenCalled();
    fireEvent.click(choice('SERVICE_PROVIDER'));
    expect(screen.getByRole('alert').textContent).toBe('identity.switcher.offline');
    expect(mocks.switchWorkspace).not.toHaveBeenCalled();
  });

  it('a refusal from the server is shown in the same place and the person stays where they are', async () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    mocks.switchWorkspace.mockRejectedValue(new FarmerAuthError('rate_limited', 'rate_limited'));
    show('floating');
    fireEvent.click(trigger());
    fireEvent.click(choice('SERVICE_PROVIDER'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('identity.errors.generic'));
    expect(screen.queryByText('provider-home')).toBeNull();
    expect(choice('SERVICE_PROVIDER').hasAttribute('disabled')).toBe(false);
  });

  it('is hidden on farmer screens that take the whole display', () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'FARMER');
    const { container } = show('floating', '/app/chat');
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('Workspace header', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn() as never; // jsdom has no element scrolling
    act(() => useAccountStore.getState().clear());
  });

  const header = (role: 'SERVICE_PROVIDER' | 'CUSTOMER') => {
    cleanup();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/provider']}><WorkspaceLayout role={role} /></MemoryRouter>
      </QueryClientProvider>,
    );
    return container.querySelector('header')!;
  };

  it('a person with one role sees the picture of the workspace, with its name for screen readers and no button', () => {
    signIn(['SERVICE_PROVIDER'], 'SERVICE_PROVIDER');
    const h = header('SERVICE_PROVIDER');
    expect(h.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('identity.roles.SERVICE_PROVIDER.name');
    expect(h.querySelector('button')).toBeNull();
    expect(h.textContent).toBe('');
  });

  it('a person with several roles gets the switcher there, as one picture without a name beside it', () => {
    signIn(['FARMER', 'SERVICE_PROVIDER'], 'SERVICE_PROVIDER');
    const h = header('SERVICE_PROVIDER');
    expect(h.querySelectorAll('button')).toHaveLength(1);
    expect(h.textContent).toBe('');
  });
});
