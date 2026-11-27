/**
 * PIN login: what the farmer reads when sign-in fails.
 *
 * The server answers a refusal with a code ({ error: "<code>" }). On
 * 2026-11-27 the login screen showed that code ("server_error") instead of a
 * sentence. These tests run the real chain — farmerAuthService (transport),
 * offlineAuthService, lib/authErrors, the real en/hi/mr bundles and the screen —
 * and replace only the network call, so a code or a technical message reaching
 * the screen fails here.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  online: true,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
  supabaseWithAuth: () => ({}),
  getSessionToken: () => null,
  setSessionToken: vi.fn(),
  setGlobalAuthData: vi.fn(),
  clearGlobalAuthData: vi.fn(),
  updateSupabaseHeaders: vi.fn(),
  waitForHeaders: vi.fn(),
}));
// No IndexedDB in the test: the service falls back to its localStorage copy.
vi.mock('@/services/localDB', () => ({
  localDB: { initialize: () => Promise.reject(new Error('no indexeddb')) },
}));
vi.mock('@/services/accountSessionService', () => ({
  accountSessionService: { applyAuthResult: () => null },
}));
// The PIN boxes (input-otp) need browser APIs jsdom lacks and keep timers
// running; these tests are about the message, so a plain input stands in.
vi.mock('@/components/ui/input-otp', () => ({
  InputOTP: ({ value, onChange, disabled, maxLength }: {
    value: string; onChange: (value: string) => void; disabled?: boolean; maxLength: number;
  }) => (
    <input
      aria-label="pin"
      value={value}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  InputOTPGroup: () => null,
  InputOTPSlot: () => null,
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 'tenant-1' } }) }));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));

import i18n, { loadPageTranslations } from '@/i18n/config';
import PinAuth from '../PinAuth';

const MOBILE = '9876543210';

/** The edge function refusing with an HTTP status and a code, as supabase-js reports it. */
function serverRefuses(status: number, body: Record<string, unknown>) {
  mocks.invoke.mockResolvedValue({
    data: null,
    error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => body } },
  });
}

function renderPinAuth() {
  cleanup();
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/pin-auth']}>
        <Routes>
          <Route path="/pin-auth" element={<PinAuth />} />
          <Route path="/auth" element={<div>SIGN-IN</div>} />
          <Route path="/app" element={<div>FARMER-APP</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Types the PIN and returns the error the screen then shows. While offline the
 * screen also carries a standing "using cached credentials" notice; that one
 * is not the error.
 */
async function enterPin(container: HTMLElement, timeout = 1000) {
  fireEvent.change(screen.getByLabelText('pin'), { target: { value: '1234' } });
  const notice = i18n.t('auth.usingCachedCredentials');
  return waitFor(() => {
    const error = screen.getAllByRole('alert').map((el) => el.textContent ?? '').find((text) => text !== notice);
    if (!error) throw new Error('no error shown yet');
    return error;
  }, { timeout });
}

function setOnline(value: boolean) {
  mocks.online = value;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

beforeAll(async () => {
  await loadPageTranslations('en');
  await loadPageTranslations('hi');
  await loadPageTranslations('mr');
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.invoke.mockReset();
  localStorage.clear();
  localStorage.setItem('authMobile', MOBILE);
  localStorage.setItem('tenantId', 'tenant-1');
  setOnline(true);
  await i18n.changeLanguage('en');
});

describe('PIN login failure messages', () => {
  it('shows a sentence, not the code, when the server answers server_error', async () => {
    serverRefuses(500, { error: 'server_error' });
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.errors.server_error'));
    expect(container.textContent).not.toContain('server_error');
    expect(container.textContent).not.toContain('non-2xx');
  });

  it('shows that sentence in the farmer\'s language', async () => {
    for (const lang of ['hi', 'mr']) {
      await i18n.changeLanguage(lang);
      serverRefuses(500, { error: 'server_error' });
      const { container } = renderPinAuth();

      const shown = await enterPin(container);

      expect(shown).toBe(i18n.getResource(lang, 'translation', 'auth.errors.server_error'));
      expect(shown).not.toBe(i18n.getResource('en', 'translation', 'auth.errors.server_error'));
    }
  });

  it('shows the text of every code this screen can receive, and never the code', async () => {
    for (const code of ['tenant_required', 'invalid_pin', 'invalid_mobile', 'rate_limited', 'account_inactive', 'role_not_available', 'session_required']) {
      serverRefuses(400, { error: code });
      const { container } = renderPinAuth();

      const shown = await enterPin(container);

      const key = i18n.exists(`auth.errors.${code}`) ? `auth.errors.${code}` : `identity.errors.${code}`;
      expect(shown).toBe(i18n.t(key));
      expect(container.textContent).not.toContain(code);
    }
  });

  it('shows the generic sentence for a code that has no text yet', async () => {
    serverRefuses(400, { error: 'some_code_added_later' });
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.errors.generic'));
    expect(container.textContent).not.toContain('some_code_added_later');
  });

  it('shows the generic sentence when the server reply carries no usable code', async () => {
    serverRefuses(502, { message: 'Bad Gateway' });
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.errors.generic'));
    expect(container.textContent).not.toContain('non-2xx');
  });

  it('still counts a wrong PIN and shows the tries left', async () => {
    serverRefuses(401, { error: 'invalid_credentials' });
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.wrongPinTryAgain'));
    expect(container.textContent).toContain(i18n.t('auth.attemptsRemaining', { count: 4 }));
  });

  it('still locks the screen for the time the server gives on locked_out', async () => {
    serverRefuses(429, { error: 'locked_out', retryAfterSeconds: 120 });
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.pinLocked'));
    const until = Number(localStorage.getItem(`ks_pin_lock_${MOBILE}`));
    expect(until - Date.now()).toBeGreaterThan(110_000);
    expect(until - Date.now()).toBeLessThanOrEqual(120_000);
    expect((screen.getByLabelText('pin') as HTMLInputElement).disabled).toBe(true);
  });

  it('says the network is weak when the server cannot be reached and no offline copy exists', async () => {
    // No HTTP status at all: a network or CORS failure on both endpoints.
    mocks.invoke.mockResolvedValue({ data: null, error: { message: 'Failed to send a request to the Edge Function' } });
    const { container } = renderPinAuth();

    // The service tries twice, one second apart, before it gives up.
    const shown = await enterPin(container, 6000);

    expect(shown).toBe(i18n.t('auth.errors.transport_unavailable'));
  }, 10_000);

  it('says internet is needed when the phone is offline and has no earlier sign-in for this number', async () => {
    setOnline(false);
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.errors.offline_login_unavailable'));
    expect(mocks.invoke).not.toHaveBeenCalled();
    // Not a wrong PIN: no try is taken away.
    expect(container.textContent).not.toContain(i18n.t('auth.attemptsRemaining', { count: 4 }));
  });

  it('treats an offline PIN that does not match the earlier sign-in as a wrong PIN', async () => {
    const { offlineAuthService } = await import('@/services/offlineAuthService');
    await offlineAuthService.cacheAuthData('farmer-1', 'tenant-1', MOBILE, '4321', { id: 'farmer-1' }, null);
    setOnline(false);
    const { container } = renderPinAuth();

    const shown = await enterPin(container);

    expect(shown).toBe(i18n.t('auth.wrongPinTryAgain'));
  });
});
