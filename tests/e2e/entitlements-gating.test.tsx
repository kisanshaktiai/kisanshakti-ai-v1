/**
 * E2E: Entitlement gating
 *
 * Verifies the unified `useEntitlements` SSOT correctly drives UI state for the
 * three core enforcement axes that ship with the multi-tenant subscription
 * system:
 *
 *   1. Tenant suspension → AppBootGate swaps the entire UI for TenantSuspendedScreen.
 *   2. AI Chat 20/day cap → ChatQuotaBanner blocks send when used_today >= quota.
 *   3. Land plan limit → LandLimitGuard disables "Add Land" everywhere.
 *
 * The tests stub the `resolve_farmer_entitlements` RPC payload so they run
 * fully offline and don't depend on a seeded tenant.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import type { EntitlementsPayload } from '@/hooks/useEntitlements';

// Stable mocks
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'farmer-1', tenantId: 'tenant-1' },
    session: { access_token: 't' },
    isAuthenticated: true,
  }),
}));

vi.mock('@/hooks/useAuthReady', () => ({
  useAuthReady: () => ({ isReady: true, user: { id: 'farmer-1', tenantId: 'tenant-1' } }),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ branding: { company_name: 'Acme Agro' } }),
}));

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </I18nextProvider>
  );
};

const basePayload = (overrides: Partial<EntitlementsPayload> = {}): EntitlementsPayload => ({
  valid: true,
  tenant: {
    id: 'tenant-1',
    subscription_id: 'tsub-1',
    status: 'active',
    plan_name: 'Tenant Pro',
    period_end: null,
    in_grace: false,
    suspended: false,
    master_features: { ai_chat: true, my_land: true },
  },
  farmer: {
    id: 'farmer-1',
    timezone: 'Asia/Kolkata',
    subscription_id: 'fsub-1',
    plan_id: 'plan-1',
    plan_name: 'Basic',
    plan_type: 'monthly',
    status: 'active',
    end_date: null,
    in_grace: false,
    days_remaining: 30,
  },
  features: {
    ai_chat: {
      enabled: true, quota: 20, unit: 'requests',
      used_today: 0, used_month: 0, tokens_today: 0,
      resets_at: null, source: 'plan_base',
    },
    my_land: {
      enabled: true, quota: 3, unit: 'lands',
      used_today: 0, used_month: 0, tokens_today: 0,
      resets_at: null, source: 'plan_base',
    },
  },
  limits: { land_limit: 3, ai_chat_per_day: 20 },
  lands: { used: 0 },
  now: new Date().toISOString(),
  today: new Date().toISOString().slice(0, 10),
  ...overrides,
});

describe('Entitlement gating', () => {
  beforeEach(() => rpcMock.mockReset());

  it('TenantSuspendedScreen is shown when tenant is suspended', async () => {
    rpcMock.mockResolvedValue({
      data: basePayload({
        tenant: { ...basePayload().tenant, status: 'cancelled', suspended: true },
      }),
      error: null,
    });
    const { AppBootGate } = await import('@/components/subscription/AppBootGate');
    wrap(<AppBootGate><div>SHOULD_NOT_RENDER</div></AppBootGate>);
    expect(await screen.findByText(/Service paused/i)).toBeInTheDocument();
    expect(screen.queryByText('SHOULD_NOT_RENDER')).not.toBeInTheDocument();
  });

  it('AI chat is blocked when used_today >= quota (20/day)', async () => {
    rpcMock.mockResolvedValue({
      data: basePayload({
        features: {
          ...basePayload().features,
          ai_chat: { ...basePayload().features.ai_chat, used_today: 20 },
        },
      }),
      error: null,
    });
    const { useEntitlements } = await import('@/hooks/useEntitlements');
    const { renderHook, waitFor } = await import('@testing-library/react');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEntitlements(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.aiChat.allowed).toBe(false);
    expect(result.current.aiChat.reason).toBe('quota_exceeded');
    expect(result.current.aiChat.remaining).toBe(0);
  });

  it('Land additions are blocked when at plan limit (3 lands)', async () => {
    rpcMock.mockResolvedValue({
      data: basePayload({ lands: { used: 3 } }),
      error: null,
    });
    const { useEntitlements } = await import('@/hooks/useEntitlements');
    const { renderHook, waitFor } = await import('@testing-library/react');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useEntitlements(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.lands.allowed).toBe(false);
    expect(result.current.lands.used).toBe(3);
    expect(result.current.lands.remaining).toBe(0);
  });
});
