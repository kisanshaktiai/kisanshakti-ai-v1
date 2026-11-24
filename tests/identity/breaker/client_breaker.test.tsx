/**
 * tests/identity/breaker/client_breaker.test.tsx
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 *
 * Independent attack run, device side: what stays readable on a shared phone after
 * each logout and after a workspace switch, and whether the client gates can be
 * walked around by editing persisted state. Runs the REAL authStore, accountStore,
 * accountSessionService, offlineAuthService, FarmerRoleGate and ProtectedRoute; only
 * the network client and the IndexedDB wrapper are replaced.
 *
 *   npx vitest run tests/identity/breaker/client_breaker.test.tsx
 *
 * Every finding is printed as PASS / BROKEN / INFO | id | what | evidence.
 * A BROKEN line never fails the run: this file reports, it does not gate.
 * All people are fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CryptoJS from 'crypto-js';

const mocks = vi.hoisted(() => ({
  token: null as string | null,
  localDbClearAll: vi.fn(async () => {}),
  serverLogout: vi.fn(async () => {}),
  switchRole: vi.fn(),
  online: true,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
  supabaseWithAuth: () => ({}),
  getSessionToken: () => mocks.token,
  setSessionToken: (t: string | null) => {
    mocks.token = t;
    if (t) localStorage.setItem('ks_session_token', t); else localStorage.removeItem('ks_session_token');
  },
  setGlobalAuthData: vi.fn(),
  updateSupabaseHeaders: vi.fn(),
  clearGlobalAuthData: () => { mocks.token = null; localStorage.removeItem('ks_session_token'); },
}));
// IndexedDB wrapper: not available in jsdom. initialize() fails, so the offline PIN
// cache uses its localStorage copy, exactly as its own fallback path does.
vi.mock('@/services/localDB', () => ({
  localDB: { initialize: async () => { throw new Error('no indexedDB in this test'); }, clearAll: mocks.localDbClearAll },
}));
vi.mock('@/services/farmerAuthService', () => {
  class FarmerAuthError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }
  return {
    FarmerAuthError,
    isMultiRoleEnabled: () => true,
    farmerAuthService: {
      logout: async (t?: string | null) => { await mocks.serverLogout(t); mocks.token = null; localStorage.removeItem('ks_session_token'); },
      switchRole: mocks.switchRole,
      sessionInfo: vi.fn(),
      verifyPin: vi.fn(async () => { throw new FarmerAuthError('transport_unavailable', 'offline'); }),
    },
  };
});
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/components/identity/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }));

import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { accountSessionService } from '@/services/accountSessionService';
import { offlineAuthService } from '@/services/offlineAuthService';
import { FarmerRoleGate } from '@/components/identity/FarmerRoleGate';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import type { AccountSummary } from '@/lib/accountRoles';

const out: string[] = [];
const line = (v: 'PASS' | 'BROKEN' | 'INFO', id: string, what: string, evidence: unknown) => {
  const l = `${v} | ${id} | ${what} | ${typeof evidence === 'string' ? evidence : JSON.stringify(evidence)}`;
  out.push(l);
  // eslint-disable-next-line no-console
  console.info(l);
};
const verdict = (id: string, what: string, held: boolean, evidence: unknown) => line(held ? 'PASS' : 'BROKEN', id, what, evidence);

const ROOT = resolve(__dirname, '../../..');
const src = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const FARMER_ID = 'aaaaaaaa-0000-0000-0000-00000000f001';
const TENANT = '11111111-1111-1111-1111-111111111111';
const farmerRow = { id: FARMER_ID, tenant_id: TENANT, mobile_number: '0000001234', farmer_name: 'Fake Farmer', farmer_code: 'FAKE-1',
  aadhaar_number: '000000000000', annual_income_range: 'fake', has_loan: true, loan_amount: 1 };
const profileRow = { full_name: 'Fake Farmer', village: 'Fake Village', date_of_birth: '1970-01-01' };
const account = (over: Partial<AccountSummary> = {}): AccountSummary => ({
  id: FARMER_ID, tenantId: TENANT, displayName: 'Fake Farmer', avatarUrl: null, languageCode: 'mr', mobileMasked: '••••••1234',
  roles: [{ role: 'FARMER', status: 'ACTIVE' }, { role: 'SERVICE_PROVIDER', status: 'ACTIVE' }], activeRole: 'FARMER', ...over,
});

/** Device state right after a farmer signed in online (what PinAuth leaves behind). */
async function signInFarmerOnDevice() {
  const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  act(() => {
    useAuthStore.getState().setSession({ farmerId: FARMER_ID, tenantId: TENANT, mobile: '0000001234', token: 'tok-farmer', createdAt: new Date().toISOString(), expiresAt, isPinVerified: true } as any);
    useAuthStore.getState().setUser({ id: FARMER_ID, phone: '0000001234', name: 'Fake Farmer', role: 'farmer', language: 'mr', tenantId: TENANT, sessionToken: 'tok-farmer', village: 'Fake Village' } as any);
    useAccountStore.getState().setAccountSession(account(), 'tok-farmer', expiresAt);
  });
  mocks.token = 'tok-farmer'; localStorage.setItem('ks_session_token', 'tok-farmer');
  await offlineAuthService.cacheAuthData(FARMER_ID, TENANT, '0000001234', '4821', farmerRow, profileRow);
  // keys other farmer screens write while the app is used (writers: see grep of localStorage.setItem in src/)
  localStorage.setItem('landFormDraft', JSON.stringify({ name: 'Fake Field', area: 2 }));
  localStorage.setItem('userLocation', JSON.stringify({ lat: 16.7, lon: 74.2 }));
  localStorage.setItem('scheduledReminders', JSON.stringify([{ task: 'fake irrigation', land: 'Fake Field' }]));
  localStorage.setItem('voice_dialog_context', JSON.stringify({ last: 'fake question about my crop' }));
  localStorage.setItem('ks_multi_role', 'true');
}
/** What a stranger who picks up the phone can read from localStorage. */
function readable() {
  const keys = Object.keys(localStorage).sort();
  const dump = keys.map((k) => `${k}=${localStorage.getItem(k)}`).join('\n');
  return { keys, dump, hasFarmerRow: dump.includes('aadhaar_number') || dump.includes('Fake Village'), hasToken: dump.includes('tok-farmer') };
}
/** The offline PIN cache stores SHA-256(pin + fixed salt): try every 4-digit PIN. */
function crackPin(): string | null {
  const raw = localStorage.getItem('offline_auth_data');
  if (!raw) return null;
  const { pinHash } = JSON.parse(raw);
  for (let i = 0; i < 10000; i++) {
    const pin = String(i).padStart(4, '0');
    if (CryptoJS.SHA256(pin + 'kisan_shakti_2024').toString() === pinHash) return pin;
  }
  return null;
}
const flush = () => new Promise((r) => setTimeout(r, 30));

describe('identity breaker: device side', () => {
  beforeEach(() => {
    cleanup(); vi.clearAllMocks(); localStorage.clear(); mocks.token = null; mocks.online = true;
    act(() => { useAuthStore.setState({ user: null, session: null, isAuthenticated: false, isPinRequired: false } as any); useAccountStore.getState().clear(); });
    localStorage.clear();
  });

  it('L01 farmer logout from the Farmer workspace (Profile page -> authStore.logout)', async () => {
    await signInFarmerOnDevice();
    expect(src('src/pages/Profile.tsx')).toMatch(/const \{ user, logout \} = useAuthStore\(\)/);   // the button really calls this one
    act(() => { useAuthStore.getState().logout(); });
    await flush();
    const r = readable(); const pin = crackPin();
    verdict('L01', 'farmer logs out on a shared phone with the Farmer workspace logout: nothing of the farmer stays readable in localStorage',
      !r.hasFarmerRow && !localStorage.getItem('offline_auth_data'),
      { keysLeft: r.keys, offline_auth_data_left: !!localStorage.getItem('offline_auth_data'), farmerRowAndProfileReadable: r.hasFarmerRow, sessionTokenLeft: r.hasToken,
        pinRecoveredFromLeftoverHash: pin, accountStoreCleared: useAccountStore.getState().account === null, localDbClearAllCalled: mocks.localDbClearAll.mock.calls.length });
  });

  it('L02 logout from the Provider/Customer workspace (WorkspaceProfile -> accountSessionService.logout)', async () => {
    await signInFarmerOnDevice();
    await accountSessionService.logout();
    await flush();
    const r = readable();
    verdict('L02', 'logout through accountSessionService: farmer row, profile, PIN cache, token and account all gone from localStorage',
      !r.hasFarmerRow && !r.hasToken && !localStorage.getItem('offline_auth_data') && useAccountStore.getState().account === null,
      { keysLeft: r.keys, serverLogoutCalledWith: mocks.serverLogout.mock.calls.map((c) => c[0]), localDbClearAllCalled: mocks.localDbClearAll.mock.calls.length });
    const left = ['landFormDraft', 'userLocation', 'scheduledReminders', 'voice_dialog_context'].filter((k) => localStorage.getItem(k) !== null);
    verdict('L03', 'either logout: other farmer-written localStorage keys (land form draft, location, reminders, voice dialog context) are removed', left.length === 0, { stillPresent: left });
  });

  it('L04 IndexedDB stores the logout wipe does not touch (read from src/services/localDB.ts)', () => {
    const code = src('src/services/localDB.ts');
    const created = [...code.matchAll(/createObjectStore\('([A-Za-z]+)'/g)].map((m) => m[1]);
    const clearFn = code.slice(code.indexOf('async clearAll()'), code.indexOf('async clearAll()') + 1400);
    const cleared = [...clearFn.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    const notWiped = [...new Set(created)].filter((s) => !cleared.includes(s));
    verdict('L04', 'localDB.clearAll() (the logout wipe) covers every object store the app creates', notWiped.length === 0,
      { created: [...new Set(created)].length, notWiped, note: 'syncMetadata also holds the IndexedDB copy of offline_auth_data (offlineAuthService.cacheAuthData)' });
  });

  it('L05 service-worker cache (read from vite.config.ts and the two logout functions)', () => {
    const vite = src('vite.config.ts');
    const cachesSupabase = /urlPattern: \/\^https:\\\/\\\/\.\*\\\.supabase\\\.co\\\/\.\*\/i,\s*handler: 'NetworkFirst',\s*options: \{\s*cacheName: 'api-cache'/.test(vite);
    const logoutCode = src('src/stores/authStore.ts') + src('src/services/accountSessionService.ts');
    const logoutClearsCaches = /caches\.(delete|keys)/.test(logoutCode);
    verdict('L05', 'logout empties the service-worker cache that stores Supabase API responses (api-cache, keyed by URL only)', !cachesSupabase || logoutClearsCaches,
      { supabaseResponsesCachedNetworkFirst: cachesSupabase, anyLogoutTouchesCacheStorage: logoutClearsCaches, expiry: (vite.match(/cacheName: 'api-cache',[\s\S]{0,120}?expiration: \{([^}]*)\}/) ?? [])[1]?.trim() });
  });

  it('L06 workspace switch Farmer -> Service Provider', async () => {
    await signInFarmerOnDevice();
    mocks.switchRole.mockResolvedValue({ account: account({ activeRole: 'SERVICE_PROVIDER' }), farmer: null, profile: null });
    let events = 0; const onEvt = () => { events++; }; window.addEventListener('ks:auth-logout', onEvt);
    const route = await accountSessionService.switchWorkspace('SERVICE_PROVIDER');
    await flush(); window.removeEventListener('ks:auth-logout', onEvt);
    const r = readable();
    const offline = await offlineAuthService.validateOfflinePin('0000001234', '4821');
    verdict('L06', 'after switching to the Provider workspace nothing of the farmer stays on the device',
      !r.hasFarmerRow && mocks.localDbClearAll.mock.calls.length > 0,
      { route, authStoreEmptied: useAuthStore.getState().user === null, farmerRowAndProfileStillInLocalStorage: r.hasFarmerRow, offline_auth_data_left: !!localStorage.getItem('offline_auth_data'),
        localDbClearAllCalled: mocks.localDbClearAll.mock.calls.length, queryCacheClearEventFired: events, offlinePinStillOpensFarmerData: offline.isValid && !!offline.farmerData?.aadhaar_number });
  });

  it('L07 gates: a person without the FARMER role edits persisted state to mount a farmer page', async () => {
    // (a) honest device state of a provider-only person: gate redirects
    act(() => { useAccountStore.getState().setAccountSession(account({ roles: [{ role: 'SERVICE_PROVIDER', status: 'ACTIVE' }], activeRole: 'SERVICE_PROVIDER' }), 'tok-prov', new Date(Date.now() + 3600_000).toISOString()); });
    const tree = () => render(
      <MemoryRouter initialEntries={['/app/lands']}>
        <Routes>
          <Route path="/" element={<div>SPLASH</div>} />
          <Route path="/pin" element={<div>PIN</div>} />
          <Route path="/provider" element={<div>PROVIDER-HOME</div>} />
          <Route path="/app/*" element={<FarmerRoleGate><ProtectedRoute><div>FARMER-PAGE</div></ProtectedRoute></FarmerRoleGate>} />
        </Routes>
      </MemoryRouter>);
    tree(); await act(flush);
    const honest = screen.queryByText('FARMER-PAGE') ? 'FARMER-PAGE' : screen.queryByText('PROVIDER-HOME') ? 'PROVIDER-HOME' : 'other';
    verdict('L07a', 'provider-only person opens /app/lands by direct URL', honest === 'PROVIDER-HOME', { rendered: honest });

    // (b) the same person deletes 'account-storage' and writes a made-up 'auth-storage'
    cleanup();
    act(() => { useAccountStore.getState().clear(); });
    localStorage.removeItem('account-storage');
    const forged = { state: { user: { id: 'made-up-id', tenantId: TENANT, role: 'farmer' }, session: { token: 'tok-prov', isPinVerified: true, expiresAt: new Date(Date.now() + 86400_000).toISOString() }, isAuthenticated: true }, version: 0 };
    localStorage.setItem('auth-storage', JSON.stringify(forged));
    // what the app does on every start, before any route renders (src/App.tsx, "STEP 3: Check authentication")
    act(() => { useAuthStore.getState().checkAuth(); });
    tree(); await act(flush);
    const tampered = screen.queryByText('FARMER-PAGE') ? 'FARMER-PAGE' : screen.queryByText('PROVIDER-HOME') ? 'PROVIDER-HOME' : screen.queryByText('SPLASH') ? 'SPLASH' : 'other';
    line(tampered === 'FARMER-PAGE' ? 'BROKEN' : 'PASS', 'L07b', 'provider-only person removes account-storage and forges auth-storage, reloads, then opens /app/lands (CLIENT GATE ONLY, no data: every request the page makes still carries the provider token, which the database refuses, see B20/A20)',
      { rendered: tampered, tokenTheFarmerPageWouldSend: mocks.token });

    // (c) tampering the persisted roles
    cleanup();
    act(() => { useAuthStore.setState({ user: null, session: null, isAuthenticated: false } as any);
      useAccountStore.getState().setAccountSession(account({ roles: [{ role: 'FARMER', status: 'ACTIVE' }], activeRole: 'FARMER' }), 'tok-prov', new Date(Date.now() + 3600_000).toISOString()); });
    localStorage.removeItem('auth-storage');
    tree(); await act(flush);
    const roles = screen.queryByText('FARMER-PAGE') ? 'FARMER-PAGE' : screen.queryByText('SPLASH') ? 'SPLASH' : 'other';
    verdict('L07c', 'provider-only person rewrites account-storage to say FARMER/ACTIVE (no farmer session on the device), then opens /app/lands', roles !== 'FARMER-PAGE', { rendered: roles });
  });

  it('L08 offline PIN login after the FARMER role was taken away', async () => {
    await signInFarmerOnDevice();
    // server side the FARMER role is now SUSPENDED; the device is offline and knows nothing of it
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const res = await offlineAuthService.authenticateWithFallback('0000001234', '4821', FARMER_ID, TENANT);
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    line('INFO', 'L08', 'offline PIN login for a farmer whose role was suspended on the server after the last online login: the device opens the Farmer workspace on the cached copy until it next reaches the server (device-only; cached data is the person\'s own)',
      { success: res.success, isOffline: res.isOffline, farmerRowFromCache: !!res.farmerData?.id });
  });

  it('summary', () => {
    // eslint-disable-next-line no-console
    console.info(`device side: ${out.filter((l) => l.startsWith('PASS')).length} PASS, ${out.filter((l) => l.startsWith('BROKEN')).length} BROKEN, ${out.filter((l) => l.startsWith('INFO')).length} INFO`);
    expect(out.length).toBeGreaterThan(0);
  });
});
