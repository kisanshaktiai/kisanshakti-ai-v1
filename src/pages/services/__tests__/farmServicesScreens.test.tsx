import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  online: true,
  farm: {
    enabled: vi.fn(), nearby: vi.fn(), providers: vi.fn(), store: vi.fn(), myRequests: vi.fn(), createRequest: vi.fn(),
    acceptOffer: vi.fn(), declineOffer: vi.fn(), cancelRequest: vi.fn(), rateRequest: vi.fn(), saveProvider: vi.fn(),
  },
  provider: { loadCatalogue: vi.fn(), cropNames: vi.fn() },
  lands: [] as Record<string, unknown>[],
}));

// Strings are checked by key, so the tests do not depend on any language.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
vi.mock('@/i18n/config', () => ({
  default: { language: 'en', exists: () => true, t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key },
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => mocks.online }));
vi.mock('@/hooks/useLands', () => ({ useLands: () => ({ lands: mocks.lands, isLoading: false }) }));
vi.mock('@/services/farmServicesService', async () => {
  const actual = await vi.importActual<typeof import('@/services/farmServicesService')>('@/services/farmServicesService');
  return { ...actual, farmServicesService: mocks.farm };
});
vi.mock('@/services/providerWorkspaceService', async () => {
  const actual = await vi.importActual<typeof import('@/services/providerWorkspaceService')>('@/services/providerWorkspaceService');
  return { ...actual, providerWorkspaceService: mocks.provider };
});
vi.mock('@/services/nurseryPhotoService', () => ({ nurseryPhotoUrl: (path: string) => `https://photos.test/${path}` }));

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

import ServicesNearMe from '../ServicesNearMe';
import ServiceProviders from '../ServiceProviders';
import NurseryStorePage from '../NurseryStorePage';
import AskForWork from '../AskForWork';
import MyServiceRequests from '../MyServiceRequests';
import { FarmServicesHomeBlock } from '@/components/home/FarmServicesHomeBlock';
import { useProviderStore } from '@/stores/providerStore';
import { useFarmServicesStore } from '@/stores/farmServicesStore';
import { dayValue } from '@/lib/farmServicesText';
import { FarmServicesError } from '@/services/farmServicesService';

const catalogue = {
  categories: [
    { code: 'LAND_PREP', parent_code: null, label_en: 'Land preparation', sort_order: 1, icon_path: 'M2 21h20' },
    { code: 'NURSERY', parent_code: null, label_en: 'Nursery', sort_order: 2 },
    { code: 'PLOUGHING', parent_code: 'LAND_PREP', label_en: 'Ploughing', sort_order: 1, icon_path: 'M3 6h11' },
  ],
  pricingUnits: [
    { code: 'PER_ACRE', label_en: 'Per acre', is_per_area: true, is_negotiable: false, area_sqm: 4046.8564224 },
    { code: 'PER_HECTARE', label_en: 'Per hectare', is_per_area: true, is_negotiable: false, area_sqm: 10000 },
    { code: 'PER_PIECE', label_en: 'Per piece', is_per_area: false, is_negotiable: false, area_sqm: null },
    { code: 'NEGOTIABLE', label_en: 'Negotiable', is_per_area: false, is_negotiable: true, area_sqm: null },
  ],
  equipmentTypes: [], providerTypes: [], skillTiers: [],
  nurseryItemKinds: [{ code: 'SEEDLING', label_en: 'Seedling' }], paymentMethods: [],
};
const tractor = {
  account_id: 'p-1', public_name: 'Test Tractor Service', provider_type: 'INDIVIDUAL', verification_level: null,
  rating_average: 4.5, rating_count: 12, jobs_completed: 30, distance_km: 2.4, accepts_requests: true,
  availability: { state: 'AVAILABLE', next_free_date: null },
  services: [{ id: 's-1', title: 'Ploughing', category_code: 'PLOUGHING', base_rate: 1200, currency: 'INR', pricing_unit: 'PER_ACRE',
    includes_operator: true, includes_fuel: true, includes_material: false, min_charge: null, payment_methods: ['CASH'] }],
  store: null,
};
const nursery = {
  ...tractor, account_id: 'p-3', public_name: 'Test Nursery Three', provider_type: 'NURSERY', distance_km: 6, rating_count: 0, rating_average: null,
  availability: { state: 'BUSY', next_free_date: '2027-01-12' }, services: [],
  store: { product_count: 2, crop_ids: ['c-1'], photo_paths: ['t/a/p/one.jpg', 't/a/p/two.jpg'] },
};

function renderAt(path: string, element: JSX.Element, route = path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
        {/* in the app these two are fixed routes, ranked above the ":family" one */}
        <Route path="/app/services-near-me/ask" element={<p>other-screen</p>} />
        <Route path="/app/services-near-me/requests" element={<p>other-screen</p>} />
        <Route path="*" element={<p>other-screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Services near me (farmer side)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.online = true;
    localStorage.clear();
    act(() => useProviderStore.setState({ enabled: false, workspace: null, catalogue: catalogue as never }));
    act(() => useFarmServicesStore.setState({ draft: null, nearby: null }));
    mocks.lands = [
      { id: 'land-1', name: 'Test Plot One', area_acres: 2.5, center_lat: 16.7, center_lon: 74.2 },
      { id: 'land-2', name: 'Test Plot Two', area_acres: 1, center_lat: null, center_lon: null },
    ];
    mocks.provider.loadCatalogue.mockResolvedValue(catalogue);
    mocks.provider.cropNames.mockResolvedValue({ 'c-1': { default: 'Test Crop One' } });
  });

  it('shows each kind of work with how many providers are near, and opens the kind that is tapped', async () => {
    mocks.farm.nearby.mockResolvedValue({ located: true, families: [{ code: 'LAND_PREP', count: 1 }, { code: 'NURSERY', count: 0 }] });
    const { container } = renderAt('/app/services-near-me', <ServicesNearMe />);
    expect(await screen.findByText('Land preparation')).not.toBeNull();
    expect(screen.getAllByText('farmServices.nearCount')).toHaveLength(2);
    // the picture stored in the catalogue is the one drawn; a kind without one keeps the built-in picture
    expect(screen.getByText('Land preparation').closest('button')!.querySelector('path[d="M2 21h20"]')).not.toBeNull();
    expect(screen.getByText('Nursery').closest('button')!.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('path[d="M2 21h20"]')).toHaveLength(1);
    expect(screen.queryByText('farmServices.notLocatedTitle')).toBeNull();
    fireEvent.click(screen.getByText('Land preparation'));
    expect(await screen.findByText('other-screen')).not.toBeNull();
  });

  it('tells a farmer without a located land to add one first', async () => {
    mocks.farm.nearby.mockResolvedValue({ located: false, families: [{ code: 'LAND_PREP', count: 0 }] });
    renderAt('/app/services-near-me', <ServicesNearMe />);
    expect(await screen.findByText('farmServices.notLocatedTitle')).not.toBeNull();
  });

  it('shows the server\'s refusal when the feature is off for the tenant', async () => {
    mocks.farm.nearby.mockRejectedValue(new FarmServicesError('FEATURE_DISABLED'));
    renderAt('/app/services-near-me', <ServicesNearMe />);
    expect(await screen.findByText('farmServices.errors.FEATURE_DISABLED')).not.toBeNull();
  });

  it('lists tractor providers with distance, state and each service with its rate, and no store button', async () => {
    mocks.farm.providers.mockResolvedValue([tractor]);
    renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    expect(await screen.findByText('Test Tractor Service')).not.toBeNull();
    expect(mocks.farm.providers).toHaveBeenCalledWith('LAND_PREP');
    expect(document.querySelector('path[d="M2 21h20"]')).not.toBeNull();
    expect(screen.queryByText('farmServices.state.AVAILABLE')).not.toBeNull();
    expect(screen.queryByText('farmServices.distance')).not.toBeNull();
    expect(screen.queryByText('Ploughing')).not.toBeNull();
    expect(screen.queryByText('provider.services.rateWithUnit')).not.toBeNull();
    expect(screen.queryByText('provider.services.includesOperator')).not.toBeNull();
    expect(screen.queryByText('provider.services.includesMaterial')).toBeNull();
    expect(screen.queryByText('farmServices.openStore')).toBeNull();
  });

  it('lists nurseries with their photos and opens the store', async () => {
    mocks.farm.providers.mockResolvedValue([nursery]);
    renderAt('/app/services-near-me/NURSERY', <ServiceProviders />, '/app/services-near-me/:family');
    expect(await screen.findByText('Test Nursery Three')).not.toBeNull();
    expect(screen.queryByText('farmServices.busyUntil')).not.toBeNull();
    expect(document.querySelectorAll('img[src^="https://photos.test/"]')).toHaveLength(2);
    expect(await screen.findByText(/Test Crop One/)).not.toBeNull();
    fireEvent.click(screen.getByText('farmServices.openStore'));
    expect(await screen.findByText('other-screen')).not.toBeNull();
  });

  it('the store shows each plant with photo, variety, price, and stock ready now or on a date', async () => {
    mocks.farm.store.mockResolvedValue({
      provider: { ...nursery, about_text: 'Open every day', about_language: 'en' },
      products: [
        { id: 'np-1', crop_id: 'c-1', variety_id: 'v-1', variety_names: { en: 'Variety One', hi: null, mr: null }, variety_name_local: null,
          item_kind: 'SEEDLING', price: 2, currency: 'INR', pricing_unit: 'PER_PIECE', min_order_qty: 100,
          description: 'Healthy plants', description_language: 'en', photo_paths: ['t/a/p/one.jpg'], available_qty: 750, batches: [{ ready_date: '2026-11-20', available_qty: 750 }] },
        { id: 'np-2', crop_id: 'c-1', variety_id: null, variety_names: null, variety_name_local: 'Local Name',
          item_kind: 'SEEDLING', price: 3, currency: 'INR', pricing_unit: 'PER_PIECE', min_order_qty: null,
          description: null, description_language: null, photo_paths: [], available_qty: 0, batches: [{ ready_date: '2026-12-10', available_qty: 500 }] },
        { id: 'np-3', crop_id: 'c-1', variety_id: null, variety_names: null, variety_name_local: null,
          item_kind: 'SEEDLING', price: null, currency: 'INR', pricing_unit: 'PER_PIECE', min_order_qty: null,
          description: null, description_language: null, photo_paths: [], available_qty: 0, batches: [] },
      ],
    });
    renderAt('/app/services-near-me/nursery/p-3', <NurseryStorePage />, '/app/services-near-me/nursery/:accountId');
    expect(await screen.findByText('Open every day')).not.toBeNull();
    expect(mocks.farm.store).toHaveBeenCalledWith('p-3');
    expect(screen.queryByText(/Variety One/)).not.toBeNull();
    expect(screen.queryByText(/Local Name/)).not.toBeNull();
    expect(screen.queryByText('Healthy plants')).not.toBeNull();
    expect(screen.queryByText('farmServices.readyNow')).not.toBeNull();
    expect(screen.queryByText('farmServices.readyOn')).not.toBeNull();
    expect(screen.queryByText('farmServices.outOfStock')).not.toBeNull();
    expect(screen.queryByText('farmServices.minOrder')).not.toBeNull();
    expect(document.querySelectorAll('img[src^="https://photos.test/"]')).toHaveLength(1);
  });

  it('a store that is not near the farmer shows the reason', async () => {
    mocks.farm.store.mockRejectedValue(new FarmServicesError('NURSERY_STORE_NOT_FOUND'));
    renderAt('/app/services-near-me/nursery/p-9', <NurseryStorePage />, '/app/services-near-me/nursery/:accountId');
    expect(await screen.findByText('farmServices.errors.NURSERY_STORE_NOT_FOUND')).not.toBeNull();
    await waitFor(() => expect(mocks.farm.store).toHaveBeenCalledTimes(1));
  });
});

const farTractor = {
  ...tractor, account_id: 'p-2', public_name: 'Test Tractor Far', distance_km: 9, rating_average: 4.9, rating_count: 40, saved: true,
  availability: { state: 'BUSY', next_free_date: '2027-01-12' },
  services: [{ ...tractor.services[0], id: 's-2', base_rate: 1000 }],
};
const openRequest = {
  id: 'r-1', kind: 'SERVICE', family_code: 'LAND_PREP', category_code: 'PLOUGHING', status: 'OPEN', is_direct: true,
  service_title: 'Ploughing', plant: null, land: { id: 'land-1', name: 'Test Plot One' }, quantity: 2.5, quantity_unit: 'PER_ACRE',
  needed_date: '2027-01-10', quoted_rate: 1200, currency: 'INR', agreed_rate: null, agreed_unit: null, agreed_date: null,
  cancelled_by: null, farmer_rating: null, created_at: '2027-01-08T05:00:00Z',
  provider: { account_id: 'p-1', public_name: 'Test Tractor Service', mobile: null }, offers: [],
};
const offer = {
  id: 'o-1', public_name: 'Test Tractor Service', rating_average: 4.5, rating_count: 12, distance_km: 2.4,
  rate: 1300, pricing_unit: 'PER_ACRE', offer_date: '2027-01-11',
};
const names = (container: HTMLElement) => Array.from(container.querySelectorAll('p.text-lg.font-bold')).map((n) => n.textContent);

describe('Sorting, saving and asking (farmer side)', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.online = true;
    act(() => useProviderStore.setState({ enabled: false, workspace: null, catalogue: catalogue as never }));
    act(() => useFarmServicesStore.setState({ draft: null, nearby: null }));
    mocks.provider.loadCatalogue.mockResolvedValue(catalogue);
    mocks.provider.cropNames.mockResolvedValue({ 'c-1': { default: 'Test Crop One' } });
    mocks.lands = [
      { id: 'land-1', name: 'Test Plot One', area_acres: 2.5, center_lat: 16.7, center_lon: 74.2 },
      { id: 'land-2', name: 'Test Plot Two', area_acres: 1, center_lat: null, center_lon: null },
    ];
  });

  it('puts the nearest first, then the best rated, the free or the saved ones when the farmer taps a pill', async () => {
    mocks.farm.providers.mockResolvedValue([farTractor, tractor]);
    const { container } = renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    await screen.findByText('Test Tractor Far');
    expect(names(container)).toEqual(['Test Tractor Service', 'Test Tractor Far']);
    fireEvent.click(screen.getByText('farmServices.sort.rated'));
    expect(names(container)).toEqual(['Test Tractor Far', 'Test Tractor Service']);
    fireEvent.click(screen.getByText('farmServices.sort.free'));
    expect(names(container)).toEqual(['Test Tractor Service']);
    fireEvent.click(screen.getByText('farmServices.sort.saved'));
    expect(names(container)).toEqual(['Test Tractor Far']);
  });

  it('offers "lowest rate" only when one work charged in one unit is being compared', async () => {
    mocks.farm.providers.mockResolvedValue([tractor, farTractor]);
    const { container } = renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    await screen.findByText('Test Tractor Far');
    // one work only among the providers: no "which work" row, and no rate pill until a work is chosen
    expect(screen.queryByText('farmServices.sort.rate')).toBeNull();
    expect(screen.queryByText('farmServices.allWork')).toBeNull();
    cleanup();
    const harrow = { ...tractor.services[0], id: 's-9', title: 'Harrowing', category_code: 'HARROWING', base_rate: 900 };
    mocks.farm.providers.mockResolvedValue([{ ...tractor, services: [tractor.services[0], harrow] }, farTractor]);
    const second = renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    await screen.findByText('Test Tractor Far');
    // the work's pill comes before the service rows of the same name
    fireEvent.click(screen.getAllByText('Ploughing')[0]);
    fireEvent.click(screen.getByText('farmServices.sort.rate'));
    expect(names(second.container)).toEqual(['Test Tractor Far', 'Test Tractor Service']);
    expect(screen.queryByText('Harrowing')).toBeNull();
    expect(container).not.toBeNull();
  });

  it('saves a provider with one tap and puts the tap back when the server refuses', async () => {
    mocks.farm.providers.mockResolvedValue([tractor]);
    mocks.farm.saveProvider.mockResolvedValueOnce(true).mockRejectedValueOnce(new FarmServicesError('PROVIDER_NOT_FOUND'));
    renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    await screen.findByText('Test Tractor Service');
    fireEvent.click(screen.getByLabelText('farmServices.save'));
    await waitFor(() => expect(mocks.farm.saveProvider).toHaveBeenCalledWith('p-1', true));
    const saved = await screen.findByLabelText('farmServices.unsave');
    fireEvent.click(saved);
    expect(await screen.findByText('farmServices.errors.PROVIDER_NOT_FOUND')).not.toBeNull();
    expect(screen.queryByLabelText('farmServices.unsave')).not.toBeNull();
  });

  it('asking for a service carries it to the ask screen; a provider who takes no work cannot be asked', async () => {
    mocks.farm.providers.mockResolvedValue([tractor, { ...farTractor, accepts_requests: false }]);
    renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    await screen.findByText('Test Tractor Far');
    expect(screen.getAllByText('farmServices.askThis')).toHaveLength(1);
    // only one provider takes requests, so there is no one else to ask at once
    expect(screen.queryByText('farmServices.askAll')).toBeNull();
    fireEvent.click(screen.getByText('farmServices.askThis'));
    expect(await screen.findByText('other-screen')).not.toBeNull();
    expect(useFarmServicesStore.getState().draft).toMatchObject({
      kind: 'SERVICE', familyCode: 'LAND_PREP', provider: { accountId: 'p-1' },
      service: { id: 's-1', categoryCode: 'PLOUGHING', rate: 1200, unit: 'PER_ACRE' },
    });
  });

  it('asking everyone carries the works that have a unit, with the unit most providers charge in', async () => {
    mocks.farm.providers.mockResolvedValue([tractor, farTractor]);
    renderAt('/app/services-near-me/LAND_PREP', <ServiceProviders />, '/app/services-near-me/:family');
    await screen.findByText('Test Tractor Far');
    fireEvent.click(screen.getByText('farmServices.askAll'));
    expect(await screen.findByText('other-screen')).not.toBeNull();
    expect(useFarmServicesStore.getState().draft).toEqual({
      kind: 'SERVICE', familyCode: 'LAND_PREP', categories: [{ code: 'PLOUGHING', unit: 'PER_ACRE' }],
    });
  });

  it('the ask screen opens only with something to ask for', async () => {
    renderAt('/app/services-near-me/ask', <AskForWork />);
    expect(await screen.findByText('other-screen')).not.toBeNull();
  });

  it('the ask screen starts filled in (first located land, tomorrow, the land\'s size) and sends on one tap', async () => {
    act(() => useFarmServicesStore.setState({
      draft: {
        kind: 'SERVICE', familyCode: 'LAND_PREP', provider: { accountId: 'p-1', name: 'Test Tractor Service' },
        service: { id: 's-1', title: 'Ploughing', categoryCode: 'PLOUGHING', rate: 1200, unit: 'PER_ACRE', currency: 'INR' },
      },
    }));
    mocks.farm.createRequest.mockResolvedValue([openRequest]);
    renderAt('/app/services-near-me/ask', <AskForWork />);
    expect(await screen.findByText('Test Plot One')).not.toBeNull();
    // a land without a location cannot be chosen
    expect(screen.queryByText('Test Plot Two')).toBeNull();
    expect((document.getElementById('ask-quantity') as HTMLInputElement).value).toBe('2.5');
    fireEvent.click(screen.getByText('farmServices.ask.send'));
    await waitFor(() => expect(mocks.farm.createRequest).toHaveBeenCalledWith({
      kind: 'SERVICE', land_id: 'land-1', needed_date: dayValue(1), quantity: 2.5, provider_service_id: 's-1',
    }));
    expect(await screen.findByText('other-screen')).not.toBeNull();
    expect(useFarmServicesStore.getState().draft).toBeNull();
  });

  it('the land\'s size is turned into the unit the work is charged in', async () => {
    act(() => useFarmServicesStore.setState({
      draft: { kind: 'SERVICE', familyCode: 'LAND_PREP', categories: [{ code: 'PLOUGHING', unit: 'PER_HECTARE' }] },
    }));
    mocks.farm.createRequest.mockResolvedValue([]);
    renderAt('/app/services-near-me/ask', <AskForWork />);
    await screen.findByText('Test Plot One');
    expect((document.getElementById('ask-quantity') as HTMLInputElement).value).toBe('1.01');
    fireEvent.click(screen.getByText('farmServices.ask.today'));
    fireEvent.click(screen.getByText('farmServices.ask.send'));
    await waitFor(() => expect(mocks.farm.createRequest).toHaveBeenCalledWith({
      kind: 'SERVICE', land_id: 'land-1', needed_date: dayValue(0), quantity: 1.01, category_code: 'PLOUGHING', quantity_unit: 'PER_HECTARE',
    }));
  });

  it('a rate settled by talking asks for no amount; the server\'s refusal is shown and the farmer stays', async () => {
    act(() => useFarmServicesStore.setState({
      draft: {
        kind: 'SERVICE', familyCode: 'LAND_PREP', provider: { accountId: 'p-1', name: 'Test Tractor Service' },
        service: { id: 's-1', title: 'Ploughing', categoryCode: 'PLOUGHING', rate: null, unit: 'NEGOTIABLE', currency: 'INR' },
      },
    }));
    mocks.farm.createRequest.mockRejectedValue(new FarmServicesError('PROVIDER_NOT_ACCEPTING'));
    renderAt('/app/services-near-me/ask', <AskForWork />);
    await screen.findByText('Test Plot One');
    expect(document.getElementById('ask-quantity')).toBeNull();
    fireEvent.click(screen.getByText('farmServices.ask.send'));
    expect(await screen.findByText('farmServices.errors.PROVIDER_NOT_ACCEPTING')).not.toBeNull();
    expect(mocks.farm.createRequest).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1, provider_service_id: 's-1' }));
    expect(screen.queryByText('other-screen')).toBeNull();
  });

  it('a farmer with no located land is told to add one instead of a form', async () => {
    mocks.lands = [{ id: 'land-2', name: 'Test Plot Two', area_acres: 1, center_lat: null, center_lon: null }];
    act(() => useFarmServicesStore.setState({
      draft: { kind: 'SERVICE', familyCode: 'LAND_PREP', categories: [{ code: 'PLOUGHING', unit: 'PER_ACRE' }] },
    }));
    renderAt('/app/services-near-me/ask', <AskForWork />);
    expect(await screen.findByText('farmServices.notLocatedTitle')).not.toBeNull();
    expect(screen.queryByText('farmServices.ask.send')).toBeNull();
  });

  it('booking plants from the store asks for whole plants, at least the smallest order, on the first ready day', async () => {
    mocks.farm.store.mockResolvedValue({
      provider: { ...nursery, about_text: null, about_language: null },
      products: [
        { id: 'np-2', crop_id: 'c-1', variety_id: null, variety_names: null, variety_name_local: 'Local Name',
          item_kind: 'SEEDLING', price: 3, currency: 'INR', pricing_unit: 'PER_PIECE', min_order_qty: 200,
          description: null, description_language: null, photo_paths: [], available_qty: 0, batches: [{ ready_date: '2099-12-10', available_qty: 500 }] },
        { id: 'np-3', crop_id: 'c-1', variety_id: null, variety_names: null, variety_name_local: null,
          item_kind: 'SEEDLING', price: null, currency: 'INR', pricing_unit: 'PER_PIECE', min_order_qty: null,
          description: null, description_language: null, photo_paths: [], available_qty: 0, batches: [] },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/app/services-near-me/nursery/p-3']}>
        <Routes>
          <Route path="/app/services-near-me/nursery/:accountId" element={<NurseryStorePage />} />
          <Route path="/app/services-near-me/ask" element={<AskForWork />} />
          <Route path="*" element={<p>other-screen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    // a plant with no stock at all cannot be booked
    const buttons = await screen.findAllByText('farmServices.bookPlants');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    await screen.findByText('Test Plot One');
    expect((document.getElementById('ask-quantity') as HTMLInputElement).value).toBe('200');
    mocks.farm.createRequest.mockResolvedValue([]);
    fireEvent.click(screen.getByText('farmServices.ask.send'));
    await waitFor(() => expect(mocks.farm.createRequest).toHaveBeenCalledWith({
      kind: 'NURSERY', land_id: 'land-1', needed_date: '2099-12-10', quantity: 200, nursery_product_id: 'np-2',
    }));
  });

  it('my requests: an answer waits for the farmer\'s yes, and yes books it and shows the number to call', async () => {
    mocks.farm.myRequests.mockResolvedValue([{ ...openRequest, offers: [offer] }]);
    mocks.farm.acceptOffer.mockResolvedValue([{
      ...openRequest, status: 'CONFIRMED', agreed_rate: 1300, agreed_unit: 'PER_ACRE', agreed_date: '2027-01-11',
      provider: { account_id: 'p-1', public_name: 'Test Tractor Service', mobile: '+91 90000 00001' },
    }]);
    renderAt('/app/services-near-me/requests', <MyServiceRequests />);
    expect(await screen.findByText('farmServices.requests.dayChanged')).not.toBeNull();
    expect(document.querySelector('a[href^="tel:"]')).toBeNull();
    fireEvent.click(screen.getByText('farmServices.requests.yesBook'));
    await waitFor(() => expect(mocks.farm.acceptOffer).toHaveBeenCalledWith('o-1'));
    expect(await screen.findByText('farmServices.requests.bookedWith')).not.toBeNull();
    expect(document.querySelector('a[href="tel:+919000000001"]')).not.toBeNull();
  });

  it('my requests: no to an answer, and cancel only after the farmer confirms', async () => {
    mocks.farm.myRequests.mockResolvedValue([{ ...openRequest, offers: [offer] }]);
    mocks.farm.declineOffer.mockResolvedValue([{ ...openRequest, status: 'CANCELLED', cancelled_by: 'FARMER' }]);
    renderAt('/app/services-near-me/requests', <MyServiceRequests />);
    await screen.findByText('farmServices.requests.yesBook');
    fireEvent.click(screen.getByText('farmServices.requests.cancel'));
    expect(mocks.farm.cancelRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('farmServices.requests.keep'));
    expect(screen.queryByText('farmServices.requests.cancelYes')).toBeNull();
    fireEvent.click(screen.getByText('farmServices.requests.no'));
    await waitFor(() => expect(mocks.farm.declineOffer).toHaveBeenCalledWith('o-1'));
    expect(await screen.findByText('farmServices.requests.cancelledByYou')).not.toBeNull();
    expect(screen.queryByText('farmServices.requests.cancel')).toBeNull();
  });

  it('my requests: a finished job asks for stars once; refused and unanswered ones offer to ask someone else', async () => {
    mocks.farm.myRequests.mockResolvedValue([
      { ...openRequest, id: 'r-2', status: 'DONE', agreed_rate: 1200, agreed_unit: 'PER_ACRE', agreed_date: '2027-01-10' },
      { ...openRequest, id: 'r-3', status: 'DECLINED' },
      { ...openRequest, id: 'r-4', status: 'EXPIRED', is_direct: false, provider: null },
    ]);
    mocks.farm.rateRequest.mockResolvedValue([
      { ...openRequest, id: 'r-2', status: 'DONE', agreed_rate: 1200, agreed_unit: 'PER_ACRE', agreed_date: '2027-01-10', farmer_rating: 4 },
    ]);
    renderAt('/app/services-near-me/requests', <MyServiceRequests />);
    expect(await screen.findByText('farmServices.requests.rateQuestion')).not.toBeNull();
    expect(screen.queryByText('farmServices.requests.declinedBy')).not.toBeNull();
    expect(screen.queryByText('farmServices.requests.expiredNote')).not.toBeNull();
    expect(screen.getAllByText('farmServices.requests.findAnother')).toHaveLength(2);
    expect(screen.queryByText('farmServices.requests.sendStars')).toBeNull();
    fireEvent.click(screen.getAllByLabelText('farmServices.requests.starN')[3]);
    fireEvent.click(screen.getByText('farmServices.requests.sendStars'));
    await waitFor(() => expect(mocks.farm.rateRequest).toHaveBeenCalledWith('r-2', 4));
    await waitFor(() => expect(screen.queryByText('farmServices.requests.rateQuestion')).toBeNull());
    expect(screen.queryByLabelText('farmServices.requests.yourStars')).not.toBeNull();
  });

  it('my requests: nothing asked yet leads to finding a provider', async () => {
    mocks.farm.myRequests.mockResolvedValue([]);
    renderAt('/app/services-near-me/requests', <MyServiceRequests />);
    expect(await screen.findByText('farmServices.requests.emptyTitle')).not.toBeNull();
    fireEvent.click(screen.getByText('farmServices.requests.find'));
    expect(await screen.findByText('other-screen')).not.toBeNull();
  });

  it('the home block shows the kinds of work with most providers near and marks answers that wait', async () => {
    mocks.farm.nearby.mockResolvedValue({
      located: true,
      requests: { offers_waiting: 2, open: 3, booked: 1, to_rate: 0 },
      families: [
        { code: 'LAND_PREP', label_en: 'Land preparation', count: 3 }, { code: 'NURSERY', label_en: 'Nursery', count: 5 },
        { code: 'TRANSPORT', label_en: 'Transport', count: 0 },
      ],
    });
    const { container } = render(<MemoryRouter><FarmServicesHomeBlock /></MemoryRouter>);
    expect(await screen.findByText('Nursery')).not.toBeNull();
    expect(screen.queryByText('Transport')).toBeNull();
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/app/services-near-me', '/app/services-near-me/NURSERY', '/app/services-near-me/LAND_PREP', '/app/services-near-me/requests',
    ]);
    expect(screen.queryByText('farmServices.requests.title')).not.toBeNull();
  });

  it('the home block shows no requests row to a farmer who has asked for nothing', async () => {
    mocks.farm.nearby.mockResolvedValue({ located: true, requests: { offers_waiting: 0, open: 0, booked: 0, to_rate: 0 }, families: [] });
    render(<MemoryRouter><FarmServicesHomeBlock /></MemoryRouter>);
    await waitFor(() => expect(mocks.farm.nearby).toHaveBeenCalled());
    expect(screen.queryByText('farmServices.requests.title')).toBeNull();
    expect(screen.queryByText('farmServices.title')).not.toBeNull();
  });
});
