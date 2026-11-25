import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  online: true,
  farm: { enabled: vi.fn(), nearby: vi.fn(), providers: vi.fn(), store: vi.fn() },
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
import { useProviderStore } from '@/stores/providerStore';
import { FarmServicesError } from '@/services/farmServicesService';

const catalogue = {
  categories: [
    { code: 'LAND_PREP', parent_code: null, label_en: 'Land preparation', sort_order: 1 },
    { code: 'NURSERY', parent_code: null, label_en: 'Nursery', sort_order: 2 },
    { code: 'PLOUGHING', parent_code: 'LAND_PREP', label_en: 'Ploughing', sort_order: 1 },
  ],
  pricingUnits: [
    { code: 'PER_ACRE', label_en: 'Per acre', is_per_area: true, is_negotiable: false },
    { code: 'PER_PIECE', label_en: 'Per piece', is_per_area: false, is_negotiable: false },
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
    mocks.provider.loadCatalogue.mockResolvedValue(catalogue);
    mocks.provider.cropNames.mockResolvedValue({ 'c-1': { default: 'Test Crop One' } });
  });

  it('shows each kind of work with how many providers are near, and opens the kind that is tapped', async () => {
    mocks.farm.nearby.mockResolvedValue({ located: true, families: [{ code: 'LAND_PREP', count: 1 }, { code: 'NURSERY', count: 0 }] });
    renderAt('/app/services-near-me', <ServicesNearMe />);
    expect(await screen.findByText('Land preparation')).not.toBeNull();
    expect(screen.getAllByText('farmServices.nearCount')).toHaveLength(2);
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
