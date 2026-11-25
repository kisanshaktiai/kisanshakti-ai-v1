import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ online: true, refreshEnabled: vi.fn() }));

vi.mock('@/components/header/SpeakPageButton', () => ({ SpeakPageButton: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/hooks/useAccountReach', () => ({ useAccountReach: () => ({ reach: null, loading: false }) }));
vi.mock('@/components/LanguageSelector', () => ({ LanguageSelector: () => null }));
vi.mock('@/components/identity/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }));
vi.mock('@/components/identity/ReachCard', () => ({ ReachHeaderButton: () => null }));
vi.mock('@/services/providerWorkspaceService', () => ({
  providerWorkspaceService: { refreshEnabled: mocks.refreshEnabled },
}));

// jsdom has no Element.scrollTo, which the layout calls when the route changes.
Element.prototype.scrollTo = () => {};

import { WorkspaceLayout } from '@/components/identity/WorkspaceLayout';
import { useProviderStore } from '@/stores/providerStore';

const show = (role: 'SERVICE_PROVIDER' | 'CUSTOMER') =>
  render(<MemoryRouter><WorkspaceLayout role={role} /></MemoryRouter>);

describe('workspace navigation and the provider_workspace flag', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.online = true;
    localStorage.clear();
    act(() => useProviderStore.setState({ enabled: false, workspace: null, catalogue: null }));
  });

  it('has no "My business" tab while the flag is off', async () => {
    mocks.refreshEnabled.mockResolvedValue(false);
    show('SERVICE_PROVIDER');
    await waitFor(() => expect(mocks.refreshEnabled).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('provider.nav.business')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('adds the tab when the server reports the flag as on', async () => {
    mocks.refreshEnabled.mockImplementation(async () => { useProviderStore.getState().setEnabled(true); return true; });
    show('SERVICE_PROVIDER');
    const tab = await screen.findByText('provider.nav.business');
    expect(tab.closest('a')?.getAttribute('href')).toBe('/provider/business');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('never shows the tab in the Customer workspace and does not ask the server there', () => {
    act(() => useProviderStore.getState().setEnabled(true));
    show('CUSTOMER');
    expect(screen.queryByText('provider.nav.business')).toBeNull();
    expect(mocks.refreshEnabled).not.toHaveBeenCalled();
  });

  it('does not ask the server without a network and keeps the last answer', () => {
    mocks.online = false;
    act(() => useProviderStore.getState().setEnabled(true));
    show('SERVICE_PROVIDER');
    expect(mocks.refreshEnabled).not.toHaveBeenCalled();
    expect(screen.queryByText('provider.nav.business')).not.toBeNull();
  });
});
