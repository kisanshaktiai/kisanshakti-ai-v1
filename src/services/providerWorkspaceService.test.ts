import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { ProviderError, localName, providerWorkspaceService } from './providerWorkspaceService';
import { useProviderStore } from '@/stores/providerStore';

const workspace = (over: Record<string, unknown> = {}) => ({
  profile: null, availability: { state: 'OFFLINE', next_free_date: null }, reach_set: false,
  services: [], working_hours: [], blackouts: [], equipment: [], nursery_products: [],
  policy: { lead_time_days_default: 1, same_day_cutoff: '16:00', max_services: 50, max_blackout_days: 90 },
  ...over,
});

describe('providerWorkspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useProviderStore.setState({ enabled: false, workspace: null, catalogue: null });
  });

  it('reads the workspace through provider_workspace_get and keeps it in the store', async () => {
    mocks.rpc.mockResolvedValue({ data: workspace({ reach_set: true }), error: null });
    const result = await providerWorkspaceService.get();
    expect(mocks.rpc).toHaveBeenCalledWith('provider_workspace_get', undefined);
    expect(result.reach_set).toBe(true);
    expect(useProviderStore.getState().workspace?.reach_set).toBe(true);
  });

  it('sends no account id with any write: the session identifies the caller', async () => {
    mocks.rpc.mockResolvedValue({ data: workspace(), error: null });
    await providerWorkspaceService.saveProfile({
      provider_type: 'INDIVIDUAL', public_name: 'Test Provider', experience_years: 4,
      about_text: null, about_language: null, languages_spoken: ['en'],
    });
    await providerWorkspaceService.setAccepting(false);
    await providerWorkspaceService.setServiceStatus('svc-1', 'PAUSED');
    await providerWorkspaceService.cancelBlackout('b-1');
    await providerWorkspaceService.removeEquipment('e-1');
    await providerWorkspaceService.submitForReview();

    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual([
      'provider_save_profile', 'provider_set_accepting', 'provider_set_service_status',
      'provider_cancel_blackout', 'provider_remove_equipment', 'provider_submit_for_review',
    ]);
    expect(mocks.rpc.mock.calls[1][1]).toEqual({ p_accepting: false });
    expect(mocks.rpc.mock.calls[2][1]).toEqual({ p_service_id: 'svc-1', p_status: 'PAUSED' });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/account_id|tenant_id/);
  });

  it('sends a busy period as two instants and the reason code', async () => {
    mocks.rpc.mockResolvedValue({ data: workspace(), error: null });
    const from = new Date('2027-01-10T00:00:00Z');
    const to = new Date('2027-01-12T00:00:00Z');
    await providerWorkspaceService.addBlackout(from, to, 'MAINTENANCE');
    expect(mocks.rpc).toHaveBeenCalledWith('provider_add_blackout', {
      p_from: '2027-01-10T00:00:00.000Z', p_to: '2027-01-12T00:00:00.000Z', p_reason_code: 'MAINTENANCE',
    });
  });

  it('turns a server error code into a ProviderError and leaves the store untouched', async () => {
    useProviderStore.getState().setWorkspace(workspace({ reach_set: true }) as never);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'PROVIDER_BLACKOUT_OVERLAP' } });
    await expect(providerWorkspaceService.addBlackout(new Date(), new Date(), null))
      .rejects.toMatchObject({ code: 'PROVIDER_BLACKOUT_OVERLAP' });
    expect(useProviderStore.getState().workspace?.reach_set).toBe(true);
  });

  it('tells PROVIDER_EQUIPMENT_INVALID apart from the longer equipment codes', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'PROVIDER_EQUIPMENT_TYPE_INVALID' } });
    await expect(providerWorkspaceService.saveEquipment({ equipment_type: 'X' }))
      .rejects.toMatchObject({ code: 'PROVIDER_EQUIPMENT_TYPE_INVALID' });
  });

  it('reports an unknown failure as PROVIDER_UNAVAILABLE', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const error = await providerWorkspaceService.get().catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
  });

  describe('the provider_workspace flag', () => {
    it('is off until the server says it is on, and is remembered', async () => {
      expect(useProviderStore.getState().enabled).toBe(false);
      mocks.rpc.mockResolvedValue({ data: true, error: null });
      expect(await providerWorkspaceService.refreshEnabled()).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledWith('provider_workspace_enabled', undefined);
      expect(useProviderStore.getState().enabled).toBe(true);
      expect(localStorage.getItem('ks_provider_workspace')).toBe('true');
    });

    it('is switched off again when the server says so', async () => {
      useProviderStore.getState().setEnabled(true);
      mocks.rpc.mockResolvedValue({ data: false, error: null });
      expect(await providerWorkspaceService.refreshEnabled()).toBe(false);
      expect(localStorage.getItem('ks_provider_workspace')).toBeNull();
    });

    it('stays as it was when the question cannot be answered (function missing or no network)', async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
      expect(await providerWorkspaceService.refreshEnabled()).toBe(false);
      useProviderStore.getState().setEnabled(true);
      expect(await providerWorkspaceService.refreshEnabled()).toBe(true);
    });

    it('leaves the device with the business on logout', () => {
      useProviderStore.getState().setEnabled(true);
      useProviderStore.getState().setWorkspace(workspace() as never);
      window.dispatchEvent(new Event('ks:auth-logout'));
      expect(useProviderStore.getState().enabled).toBe(false);
      expect(useProviderStore.getState().workspace).toBeNull();
      expect(localStorage.getItem('ks_provider_workspace')).toBeNull();
    });
  });

  it('reads the catalogue from the lookup tables once', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ code: 'A', label_en: 'A' }], error: null });
    mocks.from.mockReturnValue({ select: () => ({ order }) });
    const first = await providerWorkspaceService.loadCatalogue();
    await providerWorkspaceService.loadCatalogue();
    expect(mocks.from.mock.calls.map((c) => c[0])).toEqual([
      'service_categories', 'pricing_units', 'equipment_types', 'provider_types',
      'skill_tiers', 'nursery_item_kinds', 'provider_payment_methods',
    ]);
    expect(first.categories).toHaveLength(1);
  });

  it('picks a name in the chosen language, then the master name', () => {
    const names = { default: 'Master Name', xx: 'Name In XX' };
    expect(localName(names, 'xx')).toBe('Name In XX');
    expect(localName(names, 'xx-IN')).toBe('Name In XX');
    expect(localName(names, 'yy')).toBe('Master Name');
    expect(localName(undefined, 'yy')).toBe('');
  });
});
