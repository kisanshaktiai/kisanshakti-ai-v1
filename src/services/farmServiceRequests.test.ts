import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));

import { FarmServicesError, farmServicesService } from './farmServicesService';
import { ProviderRequestError, providerRequestsService } from './providerRequestsService';
import { useProviderRequestsStore } from '@/stores/providerRequestsStore';

const inbox = { new: [{ id: 'r-1' }], waiting: [], jobs: [], past: [] };

describe('service requests: the farmer\'s calls', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('names no farmer in any call: the session identifies him', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await farmServicesService.myRequests();
    await farmServicesService.createRequest({ kind: 'SERVICE', land_id: 'land-1', needed_date: '2027-01-10', quantity: 2, provider_service_id: 's-1' });
    await farmServicesService.acceptOffer('o-1');
    await farmServicesService.declineOffer('o-1');
    await farmServicesService.cancelRequest('r-1');
    await farmServicesService.rateRequest('r-1', 4);
    await farmServicesService.saveProvider('p-1', true);
    expect(mocks.rpc.mock.calls).toEqual([
      ['farm_service_requests_mine', undefined],
      ['farm_service_request_create', { p: { kind: 'SERVICE', land_id: 'land-1', needed_date: '2027-01-10', quantity: 2, provider_service_id: 's-1' } }],
      ['farm_service_offer_accept', { p_offer_id: 'o-1' }],
      ['farm_service_offer_decline', { p_offer_id: 'o-1' }],
      ['farm_service_request_cancel', { p_request_id: 'r-1' }],
      ['farm_service_request_rate', { p_request_id: 'r-1', p_stars: 4 }],
      ['farm_services_save_provider', { p_account_id: 'p-1', p_saved: true }],
    ]);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(/farmer_id|tenant/);
  });

  it('turns the server\'s refusal into its code, and anything else into UNAVAILABLE', async () => {
    for (const code of ['REQUEST_LAND_NOT_LOCATED', 'REQUEST_NOT_FOUND', 'REQUEST_NOT_AVAILABLE', 'PROVIDER_NOT_ACCEPTING', 'NURSERY_STOCK_SHORT', 'OFFER_NOT_AVAILABLE']) {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: code } });
      await expect(farmServicesService.myRequests()).rejects.toMatchObject({ code });
    }
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } });
    const failure = await farmServicesService.myRequests().catch((e) => e);
    expect(failure).toBeInstanceOf(FarmServicesError);
    expect(failure.code).toBe('UNAVAILABLE');
  });
});

describe('service requests: the provider\'s calls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProviderRequestsStore.setState({ inbox: null });
  });

  it('every call answers with the inbox, which is kept in the store', async () => {
    mocks.rpc.mockResolvedValue({ data: inbox, error: null });
    await providerRequestsService.inbox();
    expect(useProviderRequestsStore.getState().inbox).toEqual(inbox);
    await providerRequestsService.respond('r-1', { action: 'ACCEPT' });
    await providerRequestsService.respond('r-1', { action: 'OFFER', rate: 1250, offer_date: '2027-01-11' });
    await providerRequestsService.respond('r-1', { action: 'REFUSE' });
    await providerRequestsService.cancel('r-1');
    await providerRequestsService.done('r-1');
    expect(mocks.rpc.mock.calls).toEqual([
      ['provider_requests_inbox', undefined],
      ['provider_request_respond', { p_request_id: 'r-1', p: { action: 'ACCEPT' } }],
      ['provider_request_respond', { p_request_id: 'r-1', p: { action: 'OFFER', rate: 1250, offer_date: '2027-01-11' } }],
      ['provider_request_respond', { p_request_id: 'r-1', p: { action: 'REFUSE' } }],
      ['provider_request_cancel', { p_request_id: 'r-1' }],
      ['provider_job_done', { p_request_id: 'r-1' }],
    ]);
  });

  it('a refusal keeps the last inbox and carries the server\'s code', async () => {
    useProviderRequestsStore.setState({ inbox: inbox as never });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'JOB_NOT_STARTED' } });
    const failure = await providerRequestsService.done('r-1').catch((e) => e);
    expect(failure).toBeInstanceOf(ProviderRequestError);
    expect(failure.code).toBe('JOB_NOT_STARTED');
    expect(useProviderRequestsStore.getState().inbox).toEqual(inbox);
  });

  it('the inbox leaves the device on logout', () => {
    useProviderRequestsStore.setState({ inbox: inbox as never });
    window.dispatchEvent(new Event('ks:auth-logout'));
    expect(useProviderRequestsStore.getState().inbox).toBeNull();
  });
});
