import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  online: true,
  requests: { inbox: vi.fn(), respond: vi.fn(), cancel: vi.fn(), done: vi.fn() },
  provider: { loadCatalogue: vi.fn(), cropNames: vi.fn() },
}));

// Strings are checked by key, so the tests do not depend on any language.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/i18n/config', () => ({
  default: { language: 'en', exists: () => true, t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key },
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/services/providerRequestsService', () => ({ providerRequestsService: mocks.requests }));
vi.mock('@/services/providerWorkspaceService', async () => {
  const actual = await vi.importActual<typeof import('@/services/providerWorkspaceService')>('@/services/providerWorkspaceService');
  return { ...actual, providerWorkspaceService: mocks.provider };
});
vi.mock('@/services/nurseryPhotoService', () => ({ nurseryPhotoUrl: (path: string) => `https://photos.test/${path}` }));

import ProviderRequests from '../ProviderRequests';
import { useProviderStore } from '@/stores/providerStore';
import { useProviderRequestsStore } from '@/stores/providerRequestsStore';
import { dayValue } from '@/lib/farmServicesText';

const catalogue = {
  categories: [{ code: 'PLOUGHING', parent_code: 'LAND_PREP', label_en: 'Ploughing', sort_order: 1 }],
  pricingUnits: [
    { code: 'PER_ACRE', label_en: 'Per acre', is_per_area: true, is_negotiable: false, area_sqm: 4046.8564224 },
    { code: 'PER_PIECE', label_en: 'Per piece', is_per_area: false, is_negotiable: false, area_sqm: null },
    { code: 'NEGOTIABLE', label_en: 'Negotiable', is_per_area: false, is_negotiable: true, area_sqm: null },
  ],
  equipmentTypes: [], providerTypes: [], skillTiers: [], nurseryItemKinds: [], paymentMethods: [],
};
const direct = {
  id: 'r-1', kind: 'SERVICE', family_code: 'LAND_PREP', category_code: 'PLOUGHING', status: 'OPEN', is_direct: true,
  quantity: 2.5, quantity_unit: 'PER_ACRE', needed_date: dayValue(3), quoted_rate: 1200, currency: 'INR', distance_km: 4,
  my_service: { id: 's-1', title: 'Ploughing with tractor', base_rate: 1200, pricing_unit: 'PER_ACRE' }, plant: null, my_offer: null,
  agreed_rate: null, agreed_unit: null, agreed_date: null, cancelled_by: null, farmer_rating: null,
  created_at: '2027-01-08T05:00:00Z', farmer: null,
};
const job = {
  ...direct, id: 'r-5', status: 'CONFIRMED', agreed_rate: 1200, agreed_unit: 'PER_ACRE', agreed_date: dayValue(0),
  farmer: { name: 'Test Farmer One', mobile: '9000000001', land_name: 'Test Plot One', village: 'Test Village', lat: 16.7, lon: 74.2 },
};
const empty = { new: [], waiting: [], jobs: [], past: [] };

/** The service keeps the store current in the app; the mock does the same. */
function answer(mock: ReturnType<typeof vi.fn>, inbox: Record<string, unknown>) {
  mock.mockImplementation(async () => { useProviderRequestsStore.setState({ inbox: inbox as never }); return inbox; });
}
const show = () => render(<MemoryRouter><ProviderRequests /></MemoryRouter>);

describe('Requests from farmers (provider side)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.online = true;
    act(() => useProviderStore.setState({ enabled: true, workspace: null, catalogue: catalogue as never }));
    act(() => useProviderRequestsStore.setState({ inbox: null }));
    mocks.provider.loadCatalogue.mockResolvedValue(catalogue);
    mocks.provider.cropNames.mockResolvedValue({ 'c-1': { default: 'Test Crop One' } });
  });

  it('a new request shows the work, the amount, the day and the distance, and nothing about the farmer', async () => {
    answer(mocks.requests.inbox, { ...empty, new: [direct] });
    show();
    expect(await screen.findByText('Ploughing with tractor')).not.toBeNull();
    expect(screen.queryByText('farmServices.amount.PER_ACRE')).not.toBeNull();
    expect(screen.queryByText('provider.requests.aboutKm')).not.toBeNull();
    expect(screen.queryByText('provider.requests.forYou')).not.toBeNull();
    expect(screen.queryByText('provider.requests.privacy')).not.toBeNull();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    expect(document.querySelector('a[href*="maps"]')).toBeNull();
  });

  it('yes accepts the request as asked with one tap', async () => {
    answer(mocks.requests.inbox, { ...empty, new: [direct] });
    answer(mocks.requests.respond, { ...empty, jobs: [job] });
    show();
    fireEvent.click(await screen.findByText('provider.requests.yes'));
    await waitFor(() => expect(mocks.requests.respond).toHaveBeenCalledWith('r-1', { action: 'ACCEPT' }));
    expect(await screen.findByText('Test Farmer One')).not.toBeNull();
  });

  it('the provider can answer with his own rate and day, or say no', async () => {
    answer(mocks.requests.inbox, { ...empty, new: [direct] });
    answer(mocks.requests.respond, { ...empty, waiting: [{ ...direct, my_offer: { rate: 1250, pricing_unit: 'PER_ACRE', offer_date: dayValue(4), status: 'PENDING' } }] });
    show();
    fireEvent.click(await screen.findByText('provider.requests.change'));
    const rate = document.getElementById('offer-rate-r-1') as HTMLInputElement;
    expect(rate.value).toBe('1200');
    fireEvent.click(screen.getByLabelText('provider.common.more'));
    expect(rate.value).toBe('1250');
    fireEvent.change(document.getElementById('offer-day-r-1') as HTMLInputElement, { target: { value: dayValue(4) } });
    fireEvent.click(screen.getByText('provider.requests.sendAnswer'));
    await waitFor(() => expect(mocks.requests.respond).toHaveBeenCalledWith('r-1', { action: 'OFFER', rate: 1250, offer_date: dayValue(4) }));
    expect(await screen.findByText('provider.requests.waitingFarmer')).not.toBeNull();

    cleanup();
    act(() => useProviderRequestsStore.setState({ inbox: null }));
    answer(mocks.requests.respond, empty);
    show();
    fireEvent.click(await screen.findByText('provider.requests.no'));
    await waitFor(() => expect(mocks.requests.respond).toHaveBeenLastCalledWith('r-1', { action: 'REFUSE' }));
  });

  it('a request without a rate cannot be accepted as it is; the provider gives his rate first', async () => {
    answer(mocks.requests.inbox, {
      ...empty,
      new: [{ ...direct, is_direct: false, quoted_rate: null, my_service: { ...direct.my_service, base_rate: null, pricing_unit: 'NEGOTIABLE' } }],
    });
    show();
    expect(await screen.findByText('provider.requests.forAll')).not.toBeNull();
    expect(screen.queryByText('provider.requests.yes')).toBeNull();
    expect(screen.queryByText('provider.requests.change')).toBeNull();
    fireEvent.click(screen.getByText('provider.requests.giveRate'));
    expect((screen.getByText('provider.requests.sendAnswer').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a booked job shows the farmer, a call button and the way, and is marked done on the day', async () => {
    answer(mocks.requests.inbox, { ...empty, jobs: [job, { ...job, id: 'r-6', agreed_date: dayValue(2) }] });
    answer(mocks.requests.done, { ...empty, past: [{ ...job, status: 'DONE', farmer_rating: 5 }] });
    show();
    expect((await screen.findAllByText('Test Farmer One')).length).toBe(2);
    expect(document.querySelector('a[href="tel:9000000001"]')).not.toBeNull();
    expect(document.querySelector('a[href="https://www.google.com/maps/search/?api=1&query=16.7,74.2"]')).not.toBeNull();
    const doneButtons = screen.getAllByText('provider.requests.workDone').map((n) => n.closest('button') as HTMLButtonElement);
    expect(doneButtons.map((b) => b.disabled)).toEqual([false, true]);
    expect(screen.getAllByText('provider.requests.doneFrom')).toHaveLength(1);
    fireEvent.click(doneButtons[0]);
    await waitFor(() => expect(mocks.requests.done).toHaveBeenCalledWith('r-5'));
    expect(await screen.findByText('provider.requests.done')).not.toBeNull();
  });

  it('cancelling a booked job needs a second tap, and the server\'s refusal is shown', async () => {
    answer(mocks.requests.inbox, { ...empty, jobs: [job] });
    mocks.requests.cancel.mockRejectedValue({ code: 'REQUEST_NOT_AVAILABLE' });
    show();
    fireEvent.click(await screen.findByText('provider.requests.cancelJob'));
    expect(mocks.requests.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('provider.requests.cancelYes'));
    await waitFor(() => expect(mocks.requests.cancel).toHaveBeenCalledWith('r-5'));
    expect(await screen.findByText('provider.errors.REQUEST_NOT_AVAILABLE')).not.toBeNull();
  });

  it('a plant request shows the plant with its photo; an empty inbox says so', async () => {
    answer(mocks.requests.inbox, {
      ...empty,
      new: [{ ...direct, kind: 'NURSERY', family_code: 'NURSERY', category_code: null, quantity: 200, quantity_unit: 'PER_PIECE', quoted_rate: 3, my_service: null,
        plant: { crop_id: 'c-1', item_kind: 'SEEDLING', variety_name_local: 'Local Name', variety_names: null, photo_path: 't/a/p/one.jpg' } }],
    });
    show();
    expect(await screen.findByText('Test Crop One · Local Name')).not.toBeNull();
    expect(document.querySelector('img[src="https://photos.test/t/a/p/one.jpg"]')).not.toBeNull();

    cleanup();
    act(() => useProviderRequestsStore.setState({ inbox: null }));
    answer(mocks.requests.inbox, empty);
    show();
    expect(await screen.findByText('identity.home.SERVICE_PROVIDER.requestsTitle')).not.toBeNull();
  });
});
