import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => {
  class FarmerAuthError extends Error {
    code: string;
    retryAfterSeconds?: number;
    constructor(code: string, message: string, retryAfterSeconds?: number) {
      super(message);
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }
  return {
    FarmerAuthError,
    token: 'tok-1' as string | null,
    online: true,
    required: true,
    activationStatus: vi.fn(),
    activate: vi.fn(),
    applyActivation: vi.fn(),
    logout: vi.fn(),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // No bundle loaded, as for a language without a page bundle: the default text is used.
    t: (_key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? '').replace(/\{\{(\w+)\}\}/g, (_m, name) => String(options?.[name] ?? '')),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/components/identity/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }));
vi.mock('@/components/Photo/LiveCameraViewfinder', () => ({ canUseLiveCamera: () => false }));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/integrations/supabase/client', () => ({
  getSessionToken: () => mocks.token,
  setSessionToken: vi.fn(),
  setGlobalAuthData: vi.fn(),
  clearGlobalAuthData: vi.fn(),
  updateSupabaseHeaders: vi.fn(),
  supabase: {},
}));
vi.mock('@/lib/activationState', () => ({ isActivationRequired: () => mocks.required }));
vi.mock('@/services/farmerAuthService', () => ({
  FarmerAuthError: mocks.FarmerAuthError,
  farmerAuthService: { activationStatus: mocks.activationStatus, activate: mocks.activate },
}));
vi.mock('@/services/accountSessionService', () => ({
  accountSessionService: { applyActivation: mocks.applyActivation, logout: mocks.logout },
}));

import Activate from '../Activate';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';

const CODE = '7K2M-9PQR-4T8X';

function renderAt(path: string) {
  cleanup();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth" element={<div>SIGN-IN</div>} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/app" element={<ProtectedRoute><div>FARMER-APP</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const signIn = () => act(() => {
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    user: { id: 'farmer-1', phone: '9811100001', tenantId: 'tenant-default', role: 'farmer' } as never,
    session: {
      token: 'tok-1', mobile: '9811100001', farmerId: 'farmer-1', tenantId: 'tenant-default',
      isPinVerified: true, expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } as never,
    isPinRequired: false,
  });
  useAuthFlowStore.setState({ hasSelectedLanguage: true, hasCompletedSplash: true });
});

const typeCode = (text: string) =>
  fireEvent.change(screen.getByLabelText('Activation code'), { target: { value: text } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.token = 'tok-1';
  mocks.online = true;
  mocks.required = true;
  mocks.activationStatus.mockResolvedValue({ required: true, tenantId: 'tenant-default' });
  mocks.applyActivation.mockResolvedValue(true);
  act(() => useAuthStore.setState({ isAuthenticated: false, isLoading: false, user: null, session: null }));
});

describe('route guard', () => {
  it('sends a farmer who has not redeemed a code from the app to Activate', async () => {
    signIn();
    renderAt('/app');
    expect(await screen.findByText('Activate your app')).toBeInTheDocument();
    expect(screen.queryByText('FARMER-APP')).not.toBeInTheDocument();
  });

  it('lets an activated farmer into the app', () => {
    mocks.required = false;
    signIn();
    renderAt('/app');
    expect(screen.getByText('FARMER-APP')).toBeInTheDocument();
  });
});

describe('Activate', () => {
  it('goes to sign-in when nobody is signed in', () => {
    renderAt('/activate');
    expect(screen.getByText('SIGN-IN')).toBeInTheDocument();
    expect(mocks.activationStatus).not.toHaveBeenCalled();
  });

  it('opens the app when the server says no code is needed any more', async () => {
    mocks.activationStatus.mockImplementation(async () => { mocks.required = false; return { required: false, tenantId: 't' }; });
    signIn();
    renderAt('/activate');
    expect(await screen.findByText('FARMER-APP')).toBeInTheDocument();
  });

  it('formats what is typed, and enables Activate only for a whole code', async () => {
    signIn();
    renderAt('/activate');
    const button = await screen.findByRole('button', { name: 'Activate' });
    typeCode('7k2m9pq');
    expect(screen.getByLabelText('Activation code')).toHaveValue('7K2M-9PQ');
    expect(button).toBeDisabled();
    typeCode('ksa1:7k2m-9pqr-4t8x');
    expect(screen.getByLabelText('Activation code')).toHaveValue(CODE);
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('redeems the code, applies the new tenant and then opens the app', async () => {
    const result = {
      activated: true, already: false, subscriptionEnd: '2027-05-25T00:00:00Z',
      tenant: { id: 'tenant-a', name: 'Green Valley Agro', slug: 'green-valley' },
      farmer: { id: 'farmer-1', tenant_id: 'tenant-a', activation_required: false }, profile: null,
    };
    mocks.activate.mockImplementation(async () => { mocks.required = false; return result; });
    signIn();
    renderAt('/activate');
    await screen.findByRole('button', { name: 'Activate' });
    typeCode(CODE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    expect(await screen.findByText('App activated')).toBeInTheDocument();
    expect(mocks.activate).toHaveBeenCalledWith('7K2M9PQR4T8X');
    expect(mocks.applyActivation).toHaveBeenCalledWith(result);
    expect(screen.getByText('You are now connected to Green Valley Agro.')).toBeInTheDocument();
    expect(screen.getByText(/Your plan is valid until .*2027/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start using the app' }));
    expect(await screen.findByText('FARMER-APP')).toBeInTheDocument();
  });

  it.each([
    ['activation_invalid', undefined, 'This code is not correct. Check it and enter it again.'],
    ['activation_used', undefined, 'This code has already been used. Ask for a new code.'],
    ['activation_expired', undefined, 'This code has expired. Ask for a new code.'],
    ['activation_capacity_full', undefined, 'All licences of this company are in use. Contact the company that gave you the code.'],
    ['rate_limited', 840, 'Too many wrong codes. Try again after 14 minutes.'],
    ['some_new_code', undefined, 'Something went wrong. Please try again.'],
  ])('explains a refusal (%s) and stays on the screen', async (code, retry, text) => {
    mocks.activate.mockRejectedValue(new mocks.FarmerAuthError(code as string, 'server text', retry as number | undefined));
    signIn();
    renderAt('/activate');
    await screen.findByRole('button', { name: 'Activate' });
    typeCode(CODE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text as string);
    expect(mocks.applyActivation).not.toHaveBeenCalled();
    expect(screen.queryByText('App activated')).not.toBeInTheDocument();
  });

  it('does not call the server while offline', async () => {
    mocks.online = false;
    signIn();
    renderAt('/activate');
    await screen.findByRole('button', { name: 'Activate' });
    typeCode(CODE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline.');
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('signs out and returns to sign-in when the session is no longer valid', async () => {
    mocks.activate.mockRejectedValue(new mocks.FarmerAuthError('session_required', 'x'));
    mocks.logout.mockImplementation(async () => {
      act(() => useAuthStore.setState({ isAuthenticated: false, user: null, session: null }));
    });
    signIn();
    renderAt('/activate');
    await screen.findByRole('button', { name: 'Activate' });
    typeCode(CODE);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));
    expect(await screen.findByText('SIGN-IN')).toBeInTheDocument();
    expect(mocks.logout).toHaveBeenCalled();
  });

  it('shows no scan button where the browser cannot read QR codes', async () => {
    signIn();
    renderAt('/activate');
    await screen.findByRole('button', { name: 'Activate' });
    expect(screen.queryByRole('button', { name: 'Scan QR code' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take a photo of the QR code' })).not.toBeInTheDocument();
  });
});
