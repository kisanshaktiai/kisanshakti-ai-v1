/**
 * Farmer activation — the device-side path from registration to the Activate
 * screen, with the REAL stores, services, route guard and page. Only the
 * network is replaced: a small stand-in for the auth edge function that, like
 * the real one, accepts nothing but the session token it issued.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const server = vi.hoisted(() => {
  const REAL = 'a'.repeat(64);
  const calls: Array<{ action: string; token: string | null; status: number }> = [];
  const farmer = {
    id: '11111111-1111-4111-8111-111111111111', tenant_id: '22222222-2222-4222-8222-222222222222',
    mobile_number: '9811100001', language_preference: 'mr', activation_pending: true, activation_required: true,
  };
  const account = {
    id: farmer.id, tenantId: farmer.tenant_id, displayName: null, avatarUrl: null, languageCode: 'mr',
    mobileMasked: '******0001', activeRole: 'FARMER',
    roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'SERVICE_PROVIDER', status: 'ACTIVE' }, { role: 'CUSTOMER', status: 'ACTIVE' }],
  };
  const state = { multiRole: true };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/functions/v1/')) return json({});
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : '{}');
    const body = JSON.parse(typeof raw === 'string' ? raw : '{}');
    const reply = (status: number, payload: unknown) => {
      calls.push({ action: body.action, token: body.sessionToken ?? null, status });
      return json(payload, status);
    };
    const auth = () => ({
      session: { token: REAL, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString() },
      farmer, profile: null, ...(state.multiRole ? { account, multiRole: true } : {}),
    });
    if (body.action === 'register' || body.action === 'verifyPin') return reply(200, auth());
    if (body.action === 'logout') return reply(200, { ok: true });
    // every other action is authenticated by the session token
    if (body.sessionToken !== REAL) return reply(401, { error: 'session_required' });
    if (body.action === 'activationStatus') return reply(200, { required: true, tenantId: farmer.tenant_id });
    if (body.action === 'sessionInfo') return reply(200, { account, multiRole: state.multiRole });
    return reply(400, { error: 'unknown_action' });
  });
  vi.stubGlobal('fetch', fetchStub);
  return { REAL, calls, farmer, state };
});

vi.mock('@/services/localDB', () => ({
  localDB: {
    clearAll: vi.fn(async () => undefined),
    initialize: vi.fn(async () => undefined),
    getSyncMetadata: vi.fn(async () => undefined),
  },
}));

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { FarmerRoleGate } from '@/components/identity/FarmerRoleGate';
import Activate from '@/pages/Activate';
import { useAuthStore } from '@/stores/authStore';
import { useAuthFlowStore } from '@/stores/authFlowStore';
import { useAccountStore } from '@/stores/accountStore';
import { farmerAuthService } from '@/services/farmerAuthService';
import { accountSessionService } from '@/services/accountSessionService';
import { getSessionToken } from '@/integrations/supabase/client';
import { isActivationRequired } from '@/lib/activationState';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import { useSyncMetadata } from '@/hooks/useSyncMetadata';
import { localDB } from '@/services/localDB';

function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
function renderApp() {
  cleanup();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/app']}>
        <Where />
        <Routes>
          <Route path="/" element={<div>SPLASH</div>} />
          <Route path="/auth" element={<div>SIGN-IN</div>} />
          <Route path="/pin" element={<div>PIN</div>} />
          <Route path="/activate" element={<Activate />} />
          <Route path="/app" element={<FarmerRoleGate><ProtectedRoute><div>FARMER-APP</div></ProtectedRoute></FarmerRoleGate>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The statements of pages/SetPin.tsx after the PIN is confirmed, in its order. */
async function registerAsSetPinDoes() {
  const { createSession, setSession, setUser } = useAuthStore.getState();
  const result = await farmerAuthService.register(server.farmer.mobile_number, server.farmer.tenant_id, '4821', 'mr', { roles: ['FARMER', 'SERVICE_PROVIDER', 'CUSTOMER'] });
  if (accountSessionService.applyAuthResult(result)) throw new Error('unexpected workspace');
  const farmer = result.farmer;
  const session = createSession(farmer.id, farmer.tenant_id, farmer.mobile_number);
  setSession({ ...session, token: result.session.token, isPinVerified: true });
  setUser({ id: farmer.id, phone: farmer.mobile_number, name: 'Farmer', role: 'farmer', language: 'mr', tenantId: farmer.tenant_id, sessionToken: result.session.token, lastLoginAt: new Date().toISOString() } as never);
}

beforeEach(() => {
  server.calls.length = 0;
  server.state.multiRole = true;
  localStorage.clear();
  act(() => {
    useAuthStore.setState({ user: null, session: null, isAuthenticated: false, isPinRequired: false, isLoading: false });
    useAccountStore.getState().clear();
    useAuthFlowStore.setState({ hasSelectedLanguage: true, hasCompletedSplash: true });
  });
});

describe.each([['multi-role identity on', true], ['multi-role identity off', false]])('new farmer registers (%s)', (_name, multiRole) => {
  it('lands on Activate, stays there, and keeps the session token the server issued', async () => {
    server.state.multiRole = multiRole as boolean;
    await act(async () => { await registerAsSetPinDoes(); });
    expect(isActivationRequired()).toBe(true);

    renderApp();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/activate'));
    await waitFor(() => expect(server.calls.some((c) => c.action === 'activationStatus')).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

    expect(screen.getByTestId('where')).toHaveTextContent('/activate');
    expect(screen.queryByText('FARMER-APP')).not.toBeInTheDocument();
    expect(getSessionToken()).toBe(server.REAL);
    expect(server.calls.find((c) => c.action === 'activationStatus')).toMatchObject({ token: server.REAL, status: 200 });
    expect(isActivationRequired()).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(server.farmer.id);
  });
});

describe('the session a page builds after the server signed the farmer in', () => {
  // registerAsSetPinDoes() above copies these statements; this keeps the copy honest.
  it.each(['src/pages/SetPin.tsx', 'src/pages/ForgotPin.tsx'])('%s puts the server-issued token on the session', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    const built = source.slice(source.indexOf('createSession(farmer.id'));
    expect(built.slice(0, built.indexOf('setUser('))).toMatch(/setSession\(\{[^}]*token: result\.session\.token[^}]*\}\)/s);
  });

  it('the old placeholder token is what sent a new farmer back to sign-in (the defect, reproduced)', async () => {
    const { createSession, setSession, setUser } = useAuthStore.getState();
    await act(async () => {
      const result = await farmerAuthService.register(server.farmer.mobile_number, server.farmer.tenant_id, '4821', 'mr');
      accountSessionService.applyAuthResult(result);
      const session = createSession(result.farmer.id, result.farmer.tenant_id, result.farmer.mobile_number);
      setSession({ ...session, isPinVerified: true });                       // as it was before 2026-11-26
      setUser({ id: result.farmer.id, phone: result.farmer.mobile_number, name: 'Farmer', role: 'farmer', language: 'mr', tenantId: result.farmer.tenant_id, sessionToken: result.session.token, lastLoginAt: new Date().toISOString() } as never);
    });
    renderApp();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/auth'));
    expect(server.calls.find((c) => c.action === 'activationStatus')).toMatchObject({ status: 401 });
    expect(server.calls.find((c) => c.action === 'activationStatus')?.token).not.toBe(server.REAL);
  });
});

describe('sign-out followed at once by a sign-in', () => {
  it('a sign-out whose server call is still in flight does not wipe the new session token', async () => {
    await act(async () => { await registerAsSetPinDoes(); });
    const signOut = farmerAuthService.logout(getSessionToken());          // server call in flight
    const NEXT = 'b'.repeat(64);
    const { setSessionToken } = await import('@/integrations/supabase/client');
    setSessionToken(NEXT);                                                 // the next sign-in finished first
    await signOut;
    expect(getSessionToken()).toBe(NEXT);
  });

  it('an ordinary sign-out still removes the token', async () => {
    await act(async () => { await registerAsSetPinDoes(); });
    await farmerAuthService.logout(getSessionToken());
    expect(getSessionToken()).toBeNull();
  });
});

describe('useSyncMetadata', () => {
  it('keeps its defaults when the local database has no record (after a sign-out)', async () => {
    const { result } = renderHook(() => useSyncMetadata());
    await waitFor(() => expect(localDB.getSyncMetadata).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual({ lastSyncTime: null, pendingChanges: 0, syncInProgress: false });
    const { lastSyncTime } = result.current;                               // what the header components do
    expect(lastSyncTime).toBeNull();
  });
});
